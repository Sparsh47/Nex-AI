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

    const mockResult = {
      branchName: "feature/auth",
      changedFiles: ["src/main.ts"],
      diffSummary: "+10 -2",
      commitSha: "abc1234",
    };

    await reviewerQueue.add("reviewer-task", {
      jobId: job.data.jobId,
      issueId: job.data.issueId,
      timestamp: Date.now(),
      coderResult: mockResult,
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
