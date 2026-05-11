import { logger } from "@nex-ai/logger";
import {
  Worker,
  connection,
  Job,
  deployerQueue,
  coderQueue,
} from "@nex-ai/queue";
import { ReviewerJobPayload, ReviewerResult } from "@nex-ai/types";

logger.info("👀 Reviewer Worker Booting Up...");

export const reviewerWorker = new Worker<ReviewerJobPayload>(
  "reviewer-queue",
  async (job: Job<ReviewerJobPayload>) => {
    logger.info(`[Reviewer] Checking code for: ${job.data.issueId}`);
    logger.info(
      `[Reviewer] Diff to review: ${job.data.coderResult.diffSummary}`,
    );

    const mockResult: ReviewerResult = {
      status: "approved",
      changeRequests: [],
      comments: ["Great test coverage. Ready to merge."],
    };

    if (mockResult.status === "approved") {
      logger.info(`[Reviewer] Code Approved! Handing off to Deployer.`);
      await deployerQueue.add("deployer-task", {
        jobId: job.data.jobId,
        issueId: job.data.issueId,
        timestamp: Date.now(),
        reviewerResult: mockResult,
      });
    } else if (mockResult.status === "changes_requested") {
      logger.info(`[Reviewer] Changes Requested. Sending back to Coder.`);
      await coderQueue.add("coder-task", {
        jobId: job.data.jobId,
        issueId: job.data.issueId,
        timestamp: Date.now(),
        plannerResult: job.data.plannerResult,
        reviewFeedback: mockResult,
      });
    }

    return mockResult;
  },
  {
    connection,
    concurrency: 5,
  },
);

reviewerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Reviewer] Job ${job?.id} failed:`);
});
