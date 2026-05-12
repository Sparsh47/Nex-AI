import * as dotenv from "dotenv";
dotenv.config();
import { plannerGraph } from ".";
import { logger } from "@nex-ai/logger";

async function runTest() {
  logger.info("🚀 Starting Planner Test...\n");

  const result = await plannerGraph.invoke({
    issueId: "NEX-6",
  });

  logger.info("Test Complete! Here is the Zod-validated output:\n");
  console.log("[RESULT]: ", JSON.stringify(result.finalPlan, null, 2));
}

runTest();
