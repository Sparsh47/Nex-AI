import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import path from "path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { llm } from ".";
import { PlannerResult, PlannerResultSchema } from "@nex-ai/types";

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    path.resolve(__dirname, "../../../apps/mcp-linear/src/index.ts"),
  ],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined),
  ) as Record<string, string>,
});

const mcpClient = new Client(
  { name: "planner-mcp-client", version: "1.0.0" },
  { capabilities: {} },
);

export const PlannerState = Annotation.Root({
  issueId: Annotation<string>(),
  finalPlan: Annotation<PlannerResult>(),
});

async function planNode(state: typeof PlannerState.State) {
  if (!mcpClient.transport) {
    await mcpClient.connect(transport);
  }

  const { tools } = await mcpClient.listTools();

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
      "You are a lead architect. Use the provided tools to fetch issue details before creating a plan.",
    ],
    ["user", `I need a plan for issue: ${state.issueId}`],
  ]);

  let issueContext = "";
  if (researchResponse.tool_calls?.[0]) {
    const toolCall = researchResponse.tool_calls[0];
    const result = await mcpClient.callTool({
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
      "Generate a technical execution plan based on this REAL issue context.",
    ],
    ["user", `Context: ${issueContext}`],
  ]);

  return { finalPlan: finalResult };
}

export const plannerGraph = new StateGraph(PlannerState)
  .addNode("planner", planNode)
  .addEdge("__start__", "planner")
  .addEdge("planner", "__end__")
  .compile();
