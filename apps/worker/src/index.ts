import { QUEUE_NAME, connection, Worker } from "@nex-ai/queue";
import { logger } from "@nex-ai/logger";

logger.info("Worker is starting");

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    logger.info(`Processing job: ${job.id} for issue: ${job.data.issueId}`);

    // simulating worker function
    await new Promise((res) => setTimeout(res, 2000));

    logger.info(
      `Finished processing job: ${job.id} for issue: ${job.data.issueId}`,
    );
  },
  {
    connection,
  },
);

worker.on("failed", (job, err) => {
  console.error(`${job?.id} failed with error: ${err.message}`);
});
