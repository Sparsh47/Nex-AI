import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CoderResult, PlannerResult } from "@nex-ai/types";
import { z } from "zod";
import { llm } from ".";
import { logger } from "@nex-ai/logger";
import { publishMessage } from "@nex-ai/queue";

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
  jobId: Annotation<string>(),
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

  const formattedTools = tools.map((t) => {
    const inputSchema = JSON.parse(JSON.stringify(t.inputSchema || {}));
    if (inputSchema?.properties) {
      delete inputSchema.properties.owner;
      delete inputSchema.properties.repo;
    }
    if (inputSchema?.required) {
      inputSchema.required = inputSchema.required.filter(
        (r: string) => r !== "owner" && r !== "repo"
      );
    }
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: inputSchema as any,
      },
    };
  });

  const llmWithTools = llm.bindTools(formattedTools, {
    parallel_tool_calls: false,
  });

  const [owner, repo] = state.repository.split("/");

  logger.info(`[Coder] Taking control of repository: ${owner}/${repo}...`);

  const systemPrompt = `You are an autonomous AI Software Engineer working on the repository: ${owner}/${repo}.

      ═══════════════════════════════════════════════
      PHASE 1 — BRANCH (do this FIRST)
      ═══════════════════════════════════════════════
      Attempt to create a new branch named 'feature/${state.issueId}'.
      - A 422 "Reference already exists" response means the branch already exists — this is a SUCCESS, not an error.
      - DO NOT create a branch with a suffix (e.g. feature/${state.issueId}-2). Always use exactly 'feature/${state.issueId}'.

      ═══════════════════════════════════════════════
      PHASE 2 — DISCOVERY
      ═══════════════════════════════════════════════
      Before writing a single line of code you MUST:

      A. Read ALL relevant files in the newly created branch 'feature/${state.issueId}'.
         - Use 'list_dir' or 'search' if available, or 'read_file' to understand the project structure.
         - You must read all files in that branch to decide which files to pick and work on.

      B. Identify the project's language and read its dependency manifest using 'read_file'.
         - You MUST use ONLY the packages already declared in that manifest.
         - Do NOT invent or assume packages. If it is not in the manifest, it is NOT installed.
         - Understand the existing code style, imports, and patterns before writing anything.

      ═══════════════════════════════════════════════
      PACKAGE RULES
      ═══════════════════════════════════════════════
      Every package you import or add MUST be officially and publicly published in the standard
      package registry for the project's language. Before using any package, ask yourself:
      "Is this a real, publicly installable package?" If no, do NOT use it.
      YOUR ONLY SOURCE OF TRUTH for allowed imports is the project's own dependency manifest.

      ═══════════════════════════════════════════════
      PHASE 3 — WRITE & COMMIT
      ═══════════════════════════════════════════════
      1. FRAMEWORK: Use ONLY the language, framework, and libraries already declared.
      2. NEW DEPENDENCIES: If required, explicitly update the dependency manifest file and commit it.
      3. COMMIT RULES for 'commit_file':
         - JSON ESCAPING: Escape all newlines (\\n), double-quotes (\"), and backslashes (\\\\) inside "content".
         - FULL CONTENT: Provide the ENTIRE file from line 1 to the last line.
         - ONE FILE PER CALL: Call 'commit_file' once per file.

      GOAL: All required files committed to 'feature/${state.issueId}'.
      IMPORTANT: Do NOT open a Pull Request under any circumstances. Pull requests should be created ONLY by the Deployer agent and NOT by the Coder.`;

  const reviewSection = state.reviewFeedback
    ? `\n\nREVIEW FEEDBACK (from previous attempt — you MUST address ALL of these):\n${state.reviewFeedback}`
    : "";

  const messages: any[] = [
    ["system", systemPrompt],
    [
      "user",
      `Execute this plan: ${JSON.stringify(state.plan)}${reviewSection}`,
    ],
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

    let response;
    try {
      response = await llmWithTools.invoke(messages);
    } catch (err: any) {
      errorCount++;
      logger.warn(
        `[Coder] LLM invocation failed (${errorCount}/${MAX_TOOL_ERRORS}): ${err.message}`,
      );

      await publishMessage({
        jobId: state.jobId,
        agentName: "CODER",
        timestamp: Date.now(),
        data: {
          eventType: "ERROR",
          message: `LLM invocation failed (${errorCount}/${MAX_TOOL_ERRORS}): ${err.message}`,
        },
      });

      messages.push({
        role: "user",
        content: `Your previous tool call failed with a syntax or format error: ${err.message}. Please fix your tool call syntax and try again.`,
      });
      continue;
    }

    messages.push(response);

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        logger.info(`[Coder] Executing tool: ${toolCall.name}`);

        await publishMessage({
          jobId: state.jobId,
          agentName: "CODER",
          timestamp: Date.now(),
          data: {
            eventType: "TOOL_CALL",
            toolName: toolCall.name,
            args: toolCall.args,
          },
        });

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

        if (result.isError) {
          errorCount++;

          await publishMessage({
            jobId: state.jobId,
            agentName: "CODER",
            timestamp: Date.now(),
            data: {
              eventType: "ERROR",
              message: `Tool '${toolCall.name}' returned an error: ${toolOutput}`,
            },
          });

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

    await publishMessage({
      jobId: state.jobId,
      agentName: "CODER",
      timestamp: Date.now(),
      data: {
        eventType: "ERROR",
        message: `Stopped after hitting ${MAX_TOOL_ERRORS} tool errors across ${stepCount} steps.`,
      },
    });
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
    finalResult = (await structuredLlm.invoke([
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
    ])) as CoderResult;
  } catch (err: any) {
    logger.warn(
      `[Coder] Structured output failed — attempting JSON recovery from error`,
    );

    let recovered = false;
    try {
      const errBody = JSON.parse(err.message.replace(/^\d{3} /, ""));
      const raw: string = errBody?.error?.failed_generation ?? "";
      const stripped = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      const parsed = JSON.parse(stripped);
      finalResult = {
        branchName: parsed.branchName ?? `feature/${state.issueId}`,
        changedFiles: Array.isArray(parsed.changedFiles)
          ? parsed.changedFiles
          : [],
        diffSummary: parsed.diffSummary ?? "Changes committed",
        commitSha: parsed.commitSha ?? "unknown",
        pullRequestUrl: parsed.pullRequestUrl,
      };
      recovered = true;
      logger.info(
        `[Coder] Recovered structured output from failed_generation (branch: ${finalResult.branchName})`,
      );
    } catch (_) {}

    if (!recovered) {
      logger.warn(
        `[Coder] JSON recovery failed — using regex fallback on tool logs`,
      );
      const branchMatch = finalResponseStr.match(/feature\/[\w-]+/);
      const shaMatch = finalResponseStr.match(/SHA:\s*([a-f0-9]{40})/i);
      const committedMatches = [
        ...finalResponseStr.matchAll(/Committed\s+([\w./\-]+)/gi),
      ].map((m) => m[1]);
      finalResult = {
        branchName: branchMatch?.[0] ?? `feature/${state.issueId}`,
        changedFiles:
          committedMatches.length > 0
            ? committedMatches
            : (state.plan.filesToChange ?? []),
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
