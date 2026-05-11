import fastify from "fastify";
import { plannerQueue } from "@nex-ai/queue";
import { PlannerJobPayloadSchema } from "@nex-ai/types";
import { randomUUID } from "crypto";
import { logger } from "@nex-ai/logger";

const server = fastify({
  logger: true,
});

server.get("/ping", async (request, reply) => {
  return { message: "pong", status: "ok" };
});

server.post("/test", async (request, reply) => {
  const body = (request.body as Record<string, any>) || {};

  const rawData = {
    jobId: randomUUID(),
    issueId: body.issueId,
    timestamp: Date.now(),
    linearIssueUrl: body.linearIssueUrl,
  };

  const parsed = PlannerJobPayloadSchema.safeParse(rawData);

  if (!parsed.success) {
    logger.error({
      error: "Zod Validation Failed",
      details: parsed.error.format(),
    });
    return reply.status(400).send({
      error: "Invalid Payload",
      details: parsed.error.format(),
    });
  }

  const job = await plannerQueue.add("task-planner-test", parsed.data);

  logger.info(`Job ${job.id} enqueued successfully`);

  return reply.code(202).send({
    status: "job-enqueued",
    jobId: job.id,
    payload: parsed.data,
  });
});

const start = async () => {
  try {
    await server.listen({ port: 9000, host: "0.0.0.0" });
    console.log(`Server is listening on http://0.0.0.0:8000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
