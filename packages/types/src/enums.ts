import { z } from "zod";

export const AgentNameSchema = z.enum([
  "PLANNER",
  "CODER",
  "REVIEWER",
  "DEPLOYER",
  "SYSTEM",
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const JobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "RETRYING",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StreamEventTypeSchema = z.enum([
  "THINKING",
  "TOOL_CALL",
  "RESULT",
  "ERROR",
]);
export type StreamEventType = z.infer<typeof StreamEventTypeSchema>;
