import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { llm } from ".";
import { PlannerResult, PlannerResultSchema } from "@nex-ai/types";
import { publishMessage } from "@nex-ai/queue";

const linearTransport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    path.resolve(__dirname, "../../../apps/mcp-linear/src/index.ts"),
  ],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined),
  ) as Record<string, string>,
});

const githubTransport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    path.resolve(__dirname, "../../../apps/mcp-github/src/index.ts"),
  ],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined),
  ) as Record<string, string>,
});

const linearClient = new Client(
  { name: "planner-mcp-client", version: "1.0.0" },
  { capabilities: {} },
);

const githubClient = new Client(
  { name: "planner-github-client", version: "1.0.0" },
  { capabilities: {} },
);

export const PlannerState = Annotation.Root({
  jobId: Annotation<string>(),
  issueId: Annotation<string>(),
  repositoryName: Annotation<string>(),
  finalPlan: Annotation<PlannerResult>(),
});

let linearConnectionPromise: Promise<void> | null = null;
let githubConnectionPromise: Promise<void> | null = null;

async function planNode(state: typeof PlannerState.State) {
  if (!linearClient.transport) {
    if (!linearConnectionPromise) {
      linearConnectionPromise = linearClient.connect(linearTransport);
    }
    await linearConnectionPromise;
  }

  if (!githubClient.transport) {
    if (!githubConnectionPromise) {
      githubConnectionPromise = githubClient.connect(githubTransport);
    }
    await githubConnectionPromise;
  }

  const [owner, repo] = state.repositoryName.split("/");

  await publishMessage({
    jobId: state.jobId,
    agentName: "PLANNER",
    timestamp: Date.now(),
    data: {
      eventType: "TOOL_CALL",
      toolName: "list_files",
      args: { owner, repo, path: "src" },
    },
  });

  const repoContent = await githubClient.callTool({
    name: "list_files",
    arguments: { owner, repo, path: "src" },
  });

  const { tools } = await linearClient.listTools();

  const formattedTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.inputSchema,
    },
  }));

  const llmWithTools = llm.bindTools(formattedTools);

  const researchResponse = await llmWithTools.invoke([
    [
      "system",
      "You are a Senior Architect. Your goal is to gather context for a coding task.",
    ],
    ["user", `Fetch the details for Linear issue: ${state.issueId}`],
  ]);

  let issueContext = "";
  if (researchResponse.tool_calls?.[0]) {
    const toolCall = researchResponse.tool_calls[0];

    await publishMessage({
      jobId: state.jobId,
      agentName: "PLANNER",
      timestamp: Date.now(),
      data: {
        eventType: "TOOL_CALL",
        toolName: toolCall.name,
        args: toolCall.args,
      },
    });

    const result = await linearClient.callTool({
      name: toolCall.name,
      arguments: toolCall.args,
    });
    const textContent = result.content as Array<{ type: "text"; text: string }>;
    issueContext = textContent.find((c) => c.type === "text")?.text || "";
  }

  const structuredLlm = llm.withStructuredOutput(PlannerResultSchema);
  const finalResult = await structuredLlm.invoke([
    [
      "system",
      `You are a Senior Architect. Generate a technical execution plan.

         REAL FILE STRUCTURE (Only plan changes for these files or logical new ones):
         ${JSON.stringify(repoContent)}

         REQUIREMENTS:
         1. If the project uses 'src/index.ts' as an entry point, you MUST include it in 'filesToChange' to register any new routes.
         2. Maintain consistency with the existing directory structure.`,
    ],
    [
      "user",
      `Create a plan based on this Linear Issue Context: ${issueContext}`,
    ],
  ]);

  return { finalPlan: finalResult };
}

export const plannerGraph = new StateGraph(PlannerState)
  .addNode("planner", planNode)
  .addEdge("__start__", "planner")
  .addEdge("planner", "__end__")
  .compile();
