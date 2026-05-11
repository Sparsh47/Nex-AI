import fastify from "fastify";
import { agentQueue, QUEUE_NAME } from "@nex-ai/queue";

const server = fastify({
  logger: true,
});

server.get("/ping", async (request, reply) => {
  return { message: "pong", status: "ok" };
});

server.get("/test", async (request, reply) => {
  const jobData = {
    issueId: "LINEAR-123",
    action: "analyze_ast",
    timestamp: Date.now(),
  };

  const job = await agentQueue.add(QUEUE_NAME, jobData);

  return { jobId: job.id, status: "job-enqueued" };
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
