import * as dotenv from "dotenv";
dotenv.config();
import { reviewerGraph } from "./reviewer";
import { logger } from "@nex-ai/logger";

async function main() {
  logger.info("🧪 Starting Reviewer Agent Test...\n");

  const mockPlannerResult = {
    filesToChange: ["src/index.ts"],
    approachSummary:
      "Add Fastify routes for GET/PATCH /api/user/me with Zod validation and JWT auth.",
    acceptanceCriteria: [
      "Zod schema validates PATCH request body",
      "GET route returns 200 with mock user data",
      "Return 401 for unauthenticated requests",
      "Ensure logger calls are included",
    ],
    usedEpisodicMemory: false,
  };

  const mockCoderResult = {
    branchName: "feature/NEX-6",
    changedFiles: ["src/index.ts"],
    diffSummary:
      "Added Fastify GET/PATCH /api/user/me routes with Zod validation, authentication checks, and mock user handling",
    commitSha: "291bcc1c0862a245b31bbb208f8c9ae67713884e",
  };

  try {
    const result = await reviewerGraph.invoke({
      issueId: "NEX-6",
      repository: "Sparsh47/nex-ai-test-repo",
      plannerResult: mockPlannerResult,
      coderResult: mockCoderResult,
    });

    console.log("\n--- REVIEWER REPORT ---");
    console.log(result.reviewSummary);
    console.log("-----------------------\n");
  } catch (error) {
    logger.error({ error }, "Reviewer test failed:");
  }
}

main();
