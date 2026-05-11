import { logger } from "@nex-ai/logger";
import { Worker, connection, Job } from "@nex-ai/queue";
import { DeployerJobPayload, DeployerResult } from "@nex-ai/types";

logger.info("🚀 Deployer Worker Booting Up...");

export const deployerWorker = new Worker<DeployerJobPayload>(
  "deployer-queue",
  async (job: Job<DeployerJobPayload>) => {
    logger.info(`[Deployer] Finalizing deployment for: ${job.data.issueId}`);
    logger.info(
      `[Deployer] Approval status: ${job.data.reviewerResult.status}`,
    );

    const mockResult: DeployerResult = {
      prUrl: "https://github.com/your-org/repo/pull/123",
      mergeStatus: "merged",
      testResults: "All CI checks passed.",
      isLinearIssueDone: true,
    };

    logger.info(
      `[Deployer] 🎉 Pipeline Complete! Issue ${job.data.issueId} is merged.`,
    );

    return mockResult;
  },
  {
    connection,
    concurrency: 10,
  },
);

deployerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Deployer] Job ${job?.id} failed:`);
});
