import * as dotenv from "dotenv";
dotenv.config();
import { logger } from "@nex-ai/logger";
import { Worker, Job, coderQueue, publishMessage } from "@nex-ai/queue";
import { PlannerJobPayload } from "@nex-ai/types";
import { connection } from "@nex-ai/queue";
import { plannerGraph } from "@nex-ai/agent";

logger.info("Planner Worker initialized");

export const plannerWorker = new Worker<PlannerJobPayload>(
  "planner-queue",
  async (job: Job<PlannerJobPayload>) => {
    logger.info(`[Planner]: Analyzing issue: ${job.data.issueId}`);

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "PLANNER",
      timestamp: Date.now(),
      data: {
        eventType: "THINKING",
        content: `Analyzing issue: ${job.data.issueId} and reading repository files...`,
      },
    });

    const state = await plannerGraph.invoke({
      issueId: job.data.issueId,
      repositoryName: job.data.repositoryName,
    });

    const result = state.finalPlan;

    await publishMessage({
      jobId: job.data.jobId,
      agentName: "PLANNER",
      timestamp: Date.now(),
      data: {
        eventType: "RESULT",
        output: result.approachSummary,
      },
    });

    logger.info(`[Planner]: Result: ${result.approachSummary}`);

    await coderQueue.add("coder-task", {
      jobId: job.data.jobId,
      issueId: job.data.issueId,
      timestamp: Date.now(),
      repositoryName: job.data.repositoryName,
      plannerResult: result,
    });

    logger.info(`[Planner] Finished. Handed off to Coder Queue.`);
    return result;
  },
  {
    connection,
    concurrency: 10,
  },
);

plannerWorker.on("failed", (job, err) => {
  logger.error({ message: err.message }, `[Planner] Job ${job?.id} failed:`);
});
