import fastify from "fastify";
import { connection, plannerQueue } from "@nex-ai/queue";
import { PlannerJobPayloadSchema } from "@nex-ai/types";
import { randomUUID } from "crypto";
import fastifyCors from "@fastify/cors";
import { logger } from "@nex-ai/logger";
import { EventEmitter } from "events";

const server = fastify({
  logger: true,
});

const redisSubscriber = connection.duplicate();
const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(1000);

redisSubscriber.on("message", (channel, message) => {
  sseEmitter.emit(channel, message);
});

server.register(fastifyCors, {
  origin: "*",
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
    repositoryName: body.repositoryName,
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

server.get<{ Params: { jobId: string } }>(
  "/test/:jobId",
  async (request, reply) => {
    const { jobId } = request.params;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");

    reply.raw.flushHeaders();

    await redisSubscriber.subscribe(`job:${jobId}`);

    const listener = (message: string) => {
      reply.raw.write(`event: message\ndata: ${message}\n\n`);
    };

    sseEmitter.on(`job:${jobId}`, listener);

    request.raw.on("close", () => {
      sseEmitter.off(`job:${jobId}`, listener);
      if (sseEmitter.listenerCount(`job:${jobId}`) === 0) {
        redisSubscriber.unsubscribe(`job:${jobId}`);
      }
      reply.raw.end();
    });

    return reply;
  },
);

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
