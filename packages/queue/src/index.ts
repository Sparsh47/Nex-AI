import {
  CoderJobPayload,
  DeployerJobPayload,
  PlannerJobPayload,
  ReviewerJobPayload,
  StreamEvent,
} from "@nex-ai/types";
import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

export const publishMessage = async (event: StreamEvent) => {
  const message = JSON.stringify({
    jobId: event.jobId,
    agent: event.agentName,
    timestamp: event.timestamp,
    data: event.data,
  });

  // Update status in Redis for persistence
  await connection.hset(`job:${event.jobId}`, {
    status: event.data.eventType,
    lastAgent: event.agentName,
    lastUpdate: event.timestamp.toString()
  });

  await connection.publish(`job:${event.jobId}`, message);
};

export const checkStatus = async (jobId: string) => {
  const job = await connection.hgetall(`job:${jobId}`);

  if (job && Object.keys(job).length > 0) {
    return { status: job.status || "pending" };
  }

  return { status: "not-found" };
}

export const plannerQueue = new Queue<PlannerJobPayload>("planner-queue", {
  connection,
});

export const coderQueue = new Queue<CoderJobPayload>("coder-queue", {
  connection,
});

export const reviewerQueue = new Queue<ReviewerJobPayload>("reviewer-queue", {
  connection,
});

export const deployerQueue = new Queue<DeployerJobPayload>("deployer-queue", {
  connection,
});

export { connection, Worker };
export type { Job };
