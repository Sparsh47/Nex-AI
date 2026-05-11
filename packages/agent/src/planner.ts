import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import { llm } from ".";
import { PlannerResult, PlannerResultSchema } from "@nex-ai/types";

export const PlannerState = Annotation.Root({
  issueDescription: Annotation<string>(),
  finalPlan: Annotation<PlannerResult>(),
});

async function planNode(state: typeof PlannerState.State) {
  const structuredLlm = llm.withStructuredOutput(PlannerResultSchema, {
    name: "planner_result",
  });

  const result = await structuredLlm.invoke([
    [
      "system",
      "You are a senior software architect. Analyze the provided ticket and output a structured execution plan. You must provide files to change, an approach summary, and a list of acceptance criteria. (Since you don't have real memory access right now, set usedEpisodicMemory to false).",
    ],
    ["user", `Issue Details:\n${state.issueDescription}`],
  ]);

  return { finalPlan: result };
}

export const plannerGraph = new StateGraph(PlannerState)
  .addNode("planner", planNode)
  .addEdge("__start__", "planner")
  .addEdge("planner", "__end__")
  .compile();
