import { z } from "zod";
import { AgentNameSchema, StreamEventTypeSchema } from "./enums";

// ==========================================
// 1. AGENT RESULT SCHEMAS
// ==========================================
export const PlannerResultSchema = z.object({
  filesToChange: z.array(z.string()),
  approachSummary: z.string(),
  acceptanceCriteria: z.array(z.string()),
  usedEpisodicMemory: z.boolean(),
});
export type PlannerResult = z.infer<typeof PlannerResultSchema>;

export const CoderResultSchema = z.object({
  branchName: z.string(),
  changedFiles: z.array(z.string()),
  diffSummary: z.string(),
  commitSha: z.string(),
  pullRequestUrl: z.string().optional(),
});
export type CoderResult = z.infer<typeof CoderResultSchema>;

export const ReviewerResultSchema = z.object({
  status: z.enum(["approved", "changes_requested"]),
  changeRequests: z.array(z.string()),
  comments: z.array(z.string()),
});
export type ReviewerResult = z.infer<typeof ReviewerResultSchema>;

export const DeployerResultSchema = z.object({
  prUrl: z.string(),
  mergeStatus: z.enum(["merged", "failed", "pending"]),
  testResults: z.string(),
  isLinearIssueDone: z.boolean(),
});
export type DeployerResult = z.infer<typeof DeployerResultSchema>;

// ==========================================
// 2. STREAM EVENT
// ==========================================
export const StreamEventSchema = z.object({
  jobId: z.string().uuid(),
  agentName: AgentNameSchema,
  timestamp: z.number().int().positive(),
  data: z.discriminatedUnion("eventType", [
    z.object({
      eventType: z.literal(StreamEventTypeSchema.enum.THINKING),
      content: z.string(),
    }),
    z.object({
      eventType: z.literal(StreamEventTypeSchema.enum.TOOL_CALL),
      toolName: z.string(),
      args: z.record(z.string(), z.any()),
    }),
    z.object({
      eventType: z.literal(StreamEventTypeSchema.enum.RESULT),
      output: z.any(),
    }),
    z.object({
      eventType: z.literal(StreamEventTypeSchema.enum.ERROR),
      message: z.string(),
      code: z.string().optional(),
    }),
  ]),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;
