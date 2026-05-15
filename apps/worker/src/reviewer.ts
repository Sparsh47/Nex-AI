import { reviewerGraph } from "@nex-ai/agent";
import { logger } from "@nex-ai/logger";
import {
  Worker,
  connection,
  Job,
  deployerQueue,
  coderQueue,
  publishMessage,
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
    logger.info(
      `[Reviewer Worker] Inspecting branch: ${job.data.coderResult.branchName}`,
    );

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "REVIEWER",
      timestamp: Date.now(),
      data: {
        eventType: "THINKING",
        content: `Checking code for: ${job.data.issueId}`,
      },
    });

    const state = await reviewerGraph.invoke({
      issueId: job.data.issueId,
      repository: job.data.repositoryName,
      plannerResult: job.data.plannerResult,
      coderResult: job.data.coderResult,
    });

    const report = state.reviewSummary;
    logger.info(`[Reviewer Worker] Review Complete. Result:\n${report}`);

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "REVIEWER",
      timestamp: Date.now(),
      data: {
        eventType: "RESULT",
        output: report,
      },
    });

    const isApproved = report.includes("APPROVE");

    const finalResult: ReviewerResult = {
      status: isApproved ? "approved" : "changes_requested",
      changeRequests: isApproved ? [] : [report],
      comments: [report],
    };

    const MAX_REVIEW_RETRIES = 3;
    const reviewAttempt = (job.data as any).reviewAttempt ?? 1;

    if (finalResult.status === "approved") {
      logger.info(
        `[Reviewer Worker] Code Approved! Handing off to Deployer...`,
      );
      await deployerQueue.add("deployer-task", {
        jobId: job.data.jobId,
        issueId: job.data.issueId,
        timestamp: Date.now(),
        reviewerResult: finalResult,
        repositoryName: job.data.repositoryName,
        branchName: job.data.coderResult.branchName,
        issueName: job.data.issueId,
      });
    } else if (finalResult.status === "changes_requested") {
      if (reviewAttempt >= MAX_REVIEW_RETRIES) {
        logger.error(
          `[Reviewer Worker] Max review retries (${MAX_REVIEW_RETRIES}) reached for ${job.data.issueId}. Abandoning job.`,
        );
      } else {
        logger.warn(
          `[Reviewer Worker] Changes Requested (attempt ${reviewAttempt}/${MAX_REVIEW_RETRIES}). Sending back to Coder...`,
        );
        await coderQueue.add("coder-task", {
          jobId: job.data.jobId,
          issueId: job.data.issueId,
          timestamp: Date.now(),
          plannerResult: job.data.plannerResult,
          reviewFeedback: finalResult,
          repositoryName: job.data.repositoryName,
          reviewAttempt: reviewAttempt + 1,
        });
      }
    }

    return { report };
  },
  {
    connection,
    concurrency: 5,
  },
);

reviewerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Reviewer] Job ${job?.id} failed:`);
});
