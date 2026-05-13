import { coderGraph } from "@nex-ai/agent";
import { logger } from "@nex-ai/logger";
import { Worker, connection, Job, reviewerQueue } from "@nex-ai/queue";
import { CoderJobPayload } from "@nex-ai/types";

logger.info("💻 Coder Worker Booting Up...");

export const coderWorker = new Worker<CoderJobPayload>(
  "coder-queue",
  async (job: Job<CoderJobPayload>) => {
    logger.info(`[Coder] Writing code for: ${job.data.issueId}`);
    logger.info(
      `[Coder] Context received: ${job.data.plannerResult.approachSummary}`,
    );

    const state = await coderGraph.invoke({
      issueId: job.data.issueId,
      repository: job.data.repositoryName,
      plan: job.data.plannerResult,
      reviewFeedback: job.data.reviewFeedback
        ? job.data.reviewFeedback.changeRequests.join("\n")
        : undefined,
    });

    const result = state.finalCode;

    await reviewerQueue.add("reviewer-task", {
      jobId: job.data.jobId,
      issueId: job.data.issueId,
      timestamp: Date.now(),
      coderResult: result,
      repositoryName: job.data.repositoryName,
      plannerResult: job.data.plannerResult,
    });
  },
  {
    connection,
    concurrency: 2,
  },
);

coderWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Coder] Job ${job?.id} failed:`);
});
