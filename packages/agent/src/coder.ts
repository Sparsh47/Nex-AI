import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { CoderResult, CoderResultSchema, PlannerResult } from "@nex-ai/types";
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

  const systemPrompt = `You are an autonomous AI Software Engineer.
      You have full write access to the repository: ${owner}/${repo}.

      Your task:
      1. READ: Use 'read_file' to understand the codebase. If you are fixing code based on 'reviewFeedback', ensure you read the file from your existing feature branch.
      2. BRANCH: Attempt to create a branch named 'feature/${state.issueId}'.
         - If 'create_branch' returns a 422 error (Reference already exists), this is a SUCCESS.
         - DO NOT stop and DO NOT create a new branch with a suffix.
         - Simply proceed to 'commit_file' using the existing branch: 'feature/${state.issueId}'.
      3. WRITE: Implement the requirements from the provided plan and incorporate any 'reviewFeedback' if present.
      4. COMMIT: Use 'commit_file' to push your changes to 'feature/${state.issueId}'.

      CRITICAL INSTRUCTIONS FOR 'commit_file':
      - JSON ESCAPING: You are sending code inside a JSON tool call. You MUST properly escape all newlines (\\n), double-quotes (\\"), and backslashes (\\\\) within the "content" string.
      - FULL CONTENT: You MUST provide the ENTIRE, 100% complete file content from line 1 to the end. Do NOT use placeholders, do NOT truncate, and do NOT include ellipses.
      - ATOMICITY: Do NOT finish your loop until 'commit_file' has returned a success message.

      GOAL:
      Once the file is committed successfully to 'feature/${state.issueId}', you are DONE. Do not attempt to open a Pull Request.`;

  const reviewSection = state.reviewFeedback
    ? `\n\nREVIEW FEEDBACK (from previous attempt — you MUST address ALL of these):\n${state.reviewFeedback}`
    : "";

  const messages: any[] = [
    ["system", systemPrompt],
    ["user", `Execute this plan: ${JSON.stringify(state.plan)}${reviewSection}`],
  ];

  let finalResponseStr = "";

  for (let i = 0; i < 5; i++) {
    logger.info(`[Coder] Thinking... (Step ${i + 1}/5)`);

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

  logger.info(
    `[Coder] GitHub Operations complete. Generating final summary payload...`,
  );

  const structuredLlm = llm.withStructuredOutput(CoderResultSchema);
  const finalResult = await structuredLlm.invoke([
    [
      "system",
      "You just completed pushing code to GitHub. Fill out the CoderResultSchema strictly based on the actions you just took. Do not hallucinate. OMIT the pullRequestUrl since PR creation is handled by a downstream agent.",
    ],
    [
      "user",
      `Plan executed: ${JSON.stringify(state.plan)}\n\nTool Execution Logs:\n${finalResponseStr}`,
    ],
  ]);

  return { finalCode: finalResult };
}

export const coderGraph = new StateGraph(CoderState)
  .addNode("coder", codeNode)
  .addEdge("__start__", "coder")
  .addEdge("coder", "__end__")
  .compile();
