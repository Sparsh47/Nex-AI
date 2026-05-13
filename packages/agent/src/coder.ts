import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CoderResult, CoderResultSchema, PlannerResult } from "@nex-ai/types";
import { z } from "zod";
import { llm } from ".";
import { logger } from "@nex-ai/logger";

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    path.resolve(__dirname, "../../../apps/mcp-github/src/index.ts"),
  ],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined),
  ) as Record<string, string>,
});

const githubClient = new Client(
  { name: "coder-github-client", version: "1.0.0" },
  { capabilities: {} },
);

export const CoderState = Annotation.Root({
  issueId: Annotation<string>(),
  repository: Annotation<string>(),
  plan: Annotation<PlannerResult>(),
  reviewFeedback: Annotation<string | undefined>(),
  finalCode: Annotation<CoderResult>(),
});

async function codeNode(state: typeof CoderState.State) {
  if (!githubClient.transport) {
    await githubClient.connect(transport);
  }

  const { tools } = await githubClient.listTools();

  const formattedTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.inputSchema as any,
    },
  }));

  const llmWithTools = llm.bindTools(formattedTools, {
    parallel_tool_calls: false,
  });

  const [owner, repo] = state.repository.split("/");

  logger.info(`[Coder] Taking control of repository: ${owner}/${repo}...`);

  const systemPrompt = `You are an autonomous AI Software Engineer working on the repository: ${owner}/${repo}.

      ═══════════════════════════════════════════════
      MANDATORY PHASE 1 — DISCOVERY (do this FIRST, before any commits)
      ═══════════════════════════════════════════════
      Before writing a single line of code you MUST:

      A. Read 'package.json' from the main branch using 'read_file'.
         - Identify: the web framework (Express, Fastify, Hono, etc.), test runner, language (TypeScript/JavaScript), and ALL installed packages.
         - You MUST use ONLY the packages already listed in dependencies/devDependencies.
         - Do NOT invent or assume packages. If a package is not in package.json, it is NOT installed.

      B. Read every source file mentioned in the plan using 'read_file'.
         - Read from the feature branch 'feature/${state.issueId}' if it already exists, otherwise from 'main'.
         - Understand the existing code style, imports, and patterns before writing anything.

      ═══════════════════════════════════════════════
      PHASE 2 — BRANCH
      ═══════════════════════════════════════════════
      Attempt to create a branch named 'feature/${state.issueId}'.
      - A 422 "Reference already exists" response means the branch already exists — this is a SUCCESS, not an error.
      - DO NOT create a branch with a suffix (e.g. feature/${state.issueId}-2). Always use exactly 'feature/${state.issueId}'.

      ═══════════════════════════════════════════════
      PHASE 3 — WRITE & COMMIT
      ═══════════════════════════════════════════════
      1. FRAMEWORK: Use ONLY the framework and libraries discovered in package.json. If the project uses Fastify, write Fastify code. If Express, write Express code. Never substitute.

      2. NEW PACKAGES: If the plan requires a package that is NOT in package.json:
         - Add it to the "dependencies" (or "devDependencies") section in package.json.
         - Commit the updated package.json as one of your files.
         - Note: you cannot run 'npm install' — adding it to package.json is sufficient for the CI pipeline to install it.

      3. COMMIT RULES for 'commit_file':
         - JSON ESCAPING: Escape all newlines (\\n), double-quotes (\\"), and backslashes (\\\\) inside the "content" string.
         - FULL CONTENT: Provide the ENTIRE file from line 1 to the last line. No placeholders, no truncation, no ellipses.
         - ONE FILE PER CALL: Call 'commit_file' once per file. Commit every file the plan requires.
         - Do NOT stop until every required file has been successfully committed.

      GOAL: All required files committed to 'feature/${state.issueId}'. Do NOT open a Pull Request.`;


  const reviewSection = state.reviewFeedback
    ? `\n\nREVIEW FEEDBACK (from previous attempt — you MUST address ALL of these):\n${state.reviewFeedback}`
    : "";

  const messages: any[] = [
    ["system", systemPrompt],
    ["user", `Execute this plan: ${JSON.stringify(state.plan)}${reviewSection}`],
  ];

  let finalResponseStr = "";
  let stepCount = 0;
  let errorCount = 0;
  const MAX_TOOL_ERRORS = 5;

  while (errorCount < MAX_TOOL_ERRORS) {
    stepCount++;
    logger.info(
      `[Coder] Thinking... (Step ${stepCount}, tool errors: ${errorCount}/${MAX_TOOL_ERRORS})`,
    );

    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        logger.info(`[Coder] Executing tool: ${toolCall.name}`);

        const result = await githubClient.callTool({
          name: toolCall.name,
          arguments: { ...toolCall.args, owner, repo },
        });

        const textContent = result.content as Array<{
          type: "text";
          text: string;
        }>;
        const toolOutput =
          textContent.find((c) => c.type === "text")?.text || "Success";

        // Track errors so we can abort if the LLM is stuck
        if (result.isError) {
          errorCount++;
          logger.warn(
            `[Coder] Tool '${toolCall.name}' returned an error (${errorCount}/${MAX_TOOL_ERRORS}): ${toolOutput}`,
          );
        }

        messages.push({
          role: "tool",
          name: toolCall.name,
          tool_call_id: toolCall.id,
          content: toolOutput,
        });

        finalResponseStr += `\n[${toolCall.name}]: ${toolOutput}`;
      }
    } else {
      logger.info(`[Coder] No more tools required. Action loop complete.`);
      break;
    }
  }

  if (errorCount >= MAX_TOOL_ERRORS) {
    logger.warn(
      `[Coder] Stopped after hitting ${MAX_TOOL_ERRORS} tool errors across ${stepCount} steps.`,
    );
  }

  logger.info(
    `[Coder] GitHub Operations complete. Generating final summary payload...`,
  );

  const CoderResultLLMSchema = z.object({
    branchName: z.string(),
    changedFiles: z.array(z.string()),
    diffSummary: z.string(),
    commitSha: z.string(),
    pullRequestUrl: z.string().optional(),
  });

  let finalResult: CoderResult = {
    branchName: `feature/${state.issueId}`,
    changedFiles: state.plan.filesToChange ?? [],
    diffSummary: "Code changes committed",
    commitSha: "unknown",
  };
  try {
    const structuredLlm = llm.withStructuredOutput(CoderResultLLMSchema);
    finalResult = await structuredLlm.invoke([
      [
        "system",
        `You just completed pushing code to GitHub. Return ONLY a JSON object with these exact fields:
- branchName: the branch you committed to (string)
- changedFiles: array of file paths you committed (string[])
- diffSummary: one-sentence summary of what was done (string, keep it short)
- commitSha: the commit SHA returned by commit_file (string)
Do NOT include pullRequestUrl.`,
      ],
      [
        "user",
        `Tool Execution Logs (use ONLY this to fill the schema, do not add extra info):\n${finalResponseStr.slice(0, 3000)}`,
      ],
    ]) as CoderResult;
  } catch (err: any) {
    logger.warn(`[Coder] Structured output failed — attempting JSON recovery from error`);

    let recovered = false;
    try {
      const errBody = JSON.parse(err.message.replace(/^\d{3} /, ""));
      const raw: string = errBody?.error?.failed_generation ?? "";
      const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(stripped);
      finalResult = {
        branchName: parsed.branchName ?? `feature/${state.issueId}`,
        changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles : [],
        diffSummary: parsed.diffSummary ?? "Changes committed",
        commitSha: parsed.commitSha ?? "unknown",
        pullRequestUrl: parsed.pullRequestUrl,
      };
      recovered = true;
      logger.info(`[Coder] Recovered structured output from failed_generation (branch: ${finalResult.branchName})`);
    } catch (_) {
    }

    if (!recovered) {
      logger.warn(`[Coder] JSON recovery failed — using regex fallback on tool logs`);
      const branchMatch = finalResponseStr.match(/feature\/[\w-]+/);
      const shaMatch = finalResponseStr.match(/SHA:\s*([a-f0-9]{40})/i);
      const committedMatches = [...finalResponseStr.matchAll(/Committed\s+([\w./\-]+)/gi)].map(m => m[1]);
      finalResult = {
        branchName: branchMatch?.[0] ?? `feature/${state.issueId}`,
        changedFiles: committedMatches.length > 0 ? committedMatches : (state.plan.filesToChange ?? []),
        diffSummary: "Code changes committed (regex fallback used)",
        commitSha: shaMatch?.[1] ?? "unknown",
      };
    }
  }

  return { finalCode: finalResult };
}

export const coderGraph = new StateGraph(CoderState)
  .addNode("coder", codeNode)
  .addEdge("__start__", "coder")
  .addEdge("coder", "__end__")
  .compile();
