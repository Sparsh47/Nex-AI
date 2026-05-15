import * as dotenv from "dotenv";
dotenv.config();
import { deployerGraph } from "..";
import { logger } from "@nex-ai/logger";

async function runDeployerTest() {
  logger.info("🚀 Starting Deployer Agent Test...\n");

  const mockReviewerResult = {
    status: "approved" as const,
    changeRequests: [],
    comments: [
      "APPROVE\n\nAll routes, validations, and auth middleware are implemented perfectly.",
    ],
  };

  try {
    const result = await deployerGraph.invoke({
      issueId: "NEX-6",
      repository: "Sparsh47/nex-ai-test-repo",
      reviewerResult: mockReviewerResult,
    });

    console.log("\n--- DEPLOYER FINAL REPORT ---");
    console.log(JSON.stringify(result.finalDeployment, null, 2));
    console.log("-----------------------------\n");
  } catch (error: any) {
    logger.error("Deployer test failed:", error);
  }
}

runDeployerTest();
