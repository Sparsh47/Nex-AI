import { logger } from "@nex-ai/logger";
import { Worker, Job, coderQueue } from "@nex-ai/queue";
import { PlannerJobPayload } from "@nex-ai/types";
import { connection } from "@nex-ai/queue";

logger.info("Planner Worker initialized");

export const plannerWorker = new Worker<PlannerJobPayload>(
  "planner-queue",
  async (job: Job<PlannerJobPayload>) => {
    logger.info(`[Planner]: Analyzing issue: ${job.data.issueId}`);

    const mockResult = {
      filesToChange: ["src/main.ts"],
      approachSummary: "Refactored auth logic",
      acceptanceCriteria: ["Tests pass"],
      usedEpisodicMemory: false,
    };

    await coderQueue.add("coder-task", {
      jobId: job.data.jobId,
      issueId: job.data.issueId,
      timestamp: Date.now(),
      plannerResult: mockResult,
    });

    logger.info(`[Planner] Finished. Handed off to Coder Queue.`);
    return mockResult;
  },
  {
    connection,
    concurrency: 10,
  },
);

plannerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Planner] Job ${job?.id} failed:`);
});
