import { deployerGraph } from "@nex-ai/agent";
import { logger } from "@nex-ai/logger";
import { Worker, connection, Job, publishMessage } from "@nex-ai/queue";
import { DeployerJobPayload } from "@nex-ai/types";

logger.info("🚀 Deployer Worker Booting Up...");

export const deployerWorker = new Worker<DeployerJobPayload>(
  "deployer-queue",
  async (job: Job<DeployerJobPayload>) => {
    logger.info(`[Deployer] Finalizing deployment for: ${job.data.issueId}`);
    logger.info(
      `[Deployer] Approval status: ${job.data.reviewerResult.status}`,
    );

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "DEPLOYER",
      timestamp: Date.now(),
      data: {
        eventType: "THINKING",
        content: `Finalizing deployment for: ${job.data.issueId}`,
      },
    });

    const state = await deployerGraph.invoke({
      issueId: job.data.issueId,
      repository: job.data.repositoryName,
      reviewerResult: job.data.reviewerResult,
    });

    const result = state.finalDeployment;

    logger.info(
      `[Deployer] 🎉 Pipeline Complete! Issue ${job.data.issueId} is merged.`,
    );

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "DEPLOYER",
      timestamp: Date.now(),
      data: {
        eventType: "RESULT",
        output: `Pipeline Complete! Issue ${job.data.issueId} is merged.`,
      },
    });

    return result;
  },
  {
    connection,
    concurrency: 10,
  },
);

deployerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Deployer] Job ${job?.id} failed:`);
});
