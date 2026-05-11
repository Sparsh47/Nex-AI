import * as dotenv from "dotenv";
dotenv.config();
import { Annotation, StateGraph } from "@langchain/langgraph";
import { llm } from ".";
import { PlannerResultSchema } from "@nex-ai/types";
import { logger } from "@nex-ai/logger";

const TestPlannerState = Annotation.Root({
  issueDescription: Annotation<string>(),
  finalPlan: Annotation<any>(),
});

async function planNode(state: typeof TestPlannerState.State) {
  logger.info("LLM is thinking and structuring the plan...");

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

const testGraph = new StateGraph(TestPlannerState)
  .addNode("planner", planNode)
  .addEdge("__start__", "planner")
  .addEdge("planner", "__end__")
  .compile();

async function runTest() {
  const mockIssue = `
      Title: Fix Auth Token Expiry Bug
      Description: Users are getting silently logged out after 1 hour. We need to implement a refresh token rotation in the Fastify API and update the Next.js interceptor to handle 401s by fetching a new token.
      Acceptance Criteria:
      - Add /refresh endpoint to Fastify
      - Update Axios interceptor in Next.js
      - Do not log the user out if refresh succeeds
    `;

  logger.info("🚀 Starting Planner Test...\n");

  const result = await testGraph.invoke({
    issueDescription: mockIssue,
  });

  logger.info("Test Complete! Here is the Zod-validated output:\n");
  console.log("[RESULT]: ", JSON.stringify(result.finalPlan, null, 2));
}

runTest();
