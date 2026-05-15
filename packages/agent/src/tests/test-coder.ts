import * as dotenv from "dotenv";
dotenv.config();
import { coderGraph } from "..";
import { logger } from "@nex-ai/logger";

const REPO_NAME = "Sparsh47/nex-ai-test-repo";

async function runTest() {
  logger.info("🚀 Starting Coder Test...\n");

  const result = await coderGraph.invoke({
    issueId: "NEX-6",
    repository: REPO_NAME,
    plan: {
      filesToChange: ["src/index.ts"],
      approachSummary:
        "Add Fastify routes for GET /api/user/me and PATCH /api/user/me with Zod validation. Make sure to return a 401 if unauthenticated. Import Zod at the top of the file.",
      acceptanceCriteria: [
        "Create a Zod schema for the PATCH request body validation.",
        "Implement the GET route to return a mock user object.",
        "Implement the PATCH route to return the updated user object.",
        "Ensure 401 status code is returned for unauthenticated requests.",
      ],
      usedEpisodicMemory: false,
    },
  });

  logger.info("Test Complete! Here is the Zod-validated output:\n");
  logger.info(
    { result: JSON.stringify(result.finalCode, null, 2) },
    "[RESULT]: ",
  );
}

runTest();
