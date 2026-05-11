import * as dotenv from "dotenv";
dotenv.config();
import { logger } from "@nex-ai/logger";
import { Worker, Job, coderQueue } from "@nex-ai/queue";
import { PlannerJobPayload } from "@nex-ai/types";
import { connection } from "@nex-ai/queue";
import { plannerGraph } from "@nex-ai/agent";

logger.info("Planner Worker initialized");

export const plannerWorker = new Worker<PlannerJobPayload>(
  "planner-queue",
  async (job: Job<PlannerJobPayload>) => {
    logger.info(`[Planner]: Analyzing issue: ${job.data.issueId}`);

    const state = await plannerGraph.invoke({
      issueDescription: `Please create a Next.js and Fastify architecture plan for a ticket titled: ${job.data.issueId}`,
    });

    const result = state.finalPlan;

    logger.info(`[Planner]: Result: ${result.approachSummary}`);

    console.log("RESULT: ", result);

    await coderQueue.add("coder-task", {
      jobId: job.data.jobId,
      issueId: job.data.issueId,
      timestamp: Date.now(),
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
