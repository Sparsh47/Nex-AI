import {
  CoderJobPayload,
  DeployerJobPayload,
  PlannerJobPayload,
  ReviewerJobPayload,
} from "@nex-ai/types";
import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
});

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

export { connection, Worker, Job };
