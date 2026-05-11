import { UnionJobPayloadType } from "@nex-ai/types";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

export const QUEUE_NAME = "agent-orchestration";

export const agentQueue = new Queue<UnionJobPayloadType>(QUEUE_NAME, {
  connection,
});

export { connection, Worker };
