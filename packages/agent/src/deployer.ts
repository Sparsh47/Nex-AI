import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import {
  DeployerResult,
  DeployerResultSchema,
  ReviewerResult,
} from "@nex-ai/types";
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
  { name: "deployer-github-client", version: "1.0.0" },
  { capabilities: {} },
);

export const DeployerState = Annotation.Root({
  issueId: Annotation<string>(),
  repository: Annotation<string>(),
  reviewerResult: Annotation<ReviewerResult>(),
  finalDeployment: Annotation<DeployerResult>(),
});

async function deployNode(state: typeof DeployerState.State) {
  if (!githubClient.transport) await githubClient.connect(transport);

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
  const branchName = `feature/${state.issueId}`;

  logger.info(
    `[Deployer] Starting deployment for ${owner}/${repo} on branch ${branchName}...`,
  );

  const systemPrompt = `You are an autonomous AI Release Engineer.
    You have full admin access to the repository: ${owner}/${repo}.
    The code on branch '${branchName}' has been APPROVED by QA.

    YOUR MISSION:
    1. Execute 'create_pull_request' to open a PR from '${branchName}' (head) into 'main' (base).
       - Title should be: "Merge ${state.issueId} into main"
       - Body should state that the code was auto-generated and approved by the Reviewer Agent.
    2. Extract the PR number from the tool's response URL (e.g., if URL is github.com/.../pull/12, the number is 12).
    3. Immediately execute 'merge_pull_request' using that PR number.

    RULES:
    - Do NOT stop after creating the PR. You must merge it.
    - If the merge fails due to a conflict, report it in your final summary but stop execution.`;

  const messages: any[] = [
    ["system", systemPrompt],
    ["user", "Deploy the approved code now."],
  ];

  let finalResponseStr = "";

  for (let i = 0; i < 4; i++) {
    logger.info(`[Deployer] Thinking... (Step ${i + 1}/4)`);
    let response;
    try {
      response = await llmWithTools.invoke(messages);
    } catch (err: any) {
      logger.warn(`[Deployer] LLM invocation failed: ${err.message}`);

      await publishMessage({
        jobId: "",
        agentName: "DEPLOYER",
        timestamp: Date.now(),
        data: {
          eventType: "ERROR",
          message: `LLM invocation failed: ${err.message}`,
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
        logger.info(`[Deployer] Executing tool: ${toolCall.name}`);

        await publishMessage({
          jobId: "",
          agentName: "DEPLOYER",
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
          await publishMessage({
            jobId: "",
            agentName: "DEPLOYER",
            timestamp: Date.now(),
            data: {
              eventType: "ERROR",
              message: `Tool '${toolCall.name}' returned an error: ${toolOutput}`,
            },
          });
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
      logger.info(`[Deployer] Deployment tasks complete.`);
      break;
    }
  }

  logger.info(`[Deployer] Generating final deployment payload...`);
  const structuredLlm = llm.withStructuredOutput(DeployerResultSchema);
  const finalResult = await structuredLlm.invoke([
    [
      "system",
      "You just completed a GitHub deployment. Fill out the DeployerResultSchema strictly based on your actions. If the merge tool succeeded, mark mergeStatus as 'merged'. (Assume isLinearIssueDone is true if merged).",
    ],
    ["user", `Tool Execution Logs:\n${finalResponseStr}`],
  ]);

  return { finalDeployment: finalResult };
}

export const deployerGraph = new StateGraph(DeployerState)
  .addNode("deployer", deployNode)
  .addEdge("__start__", "deployer")
  .addEdge("deployer", "__end__")
  .compile();
