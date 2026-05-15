import { z } from "zod";
import {
  PlannerResultSchema,
  CoderResultSchema,
  ReviewerResultSchema,
} from "./agent";

// ==========================================
// 1. BASE PAYLOAD
// ==========================================
export const BaseJobPayloadSchema = z.object({
  jobId: z.string({ message: "jobId must be a string" }),
  issueId: z.string(),
  timestamp: z.number().int().positive(),
});
export type BaseJobPayload = z.infer<typeof BaseJobPayloadSchema>;

// ==========================================
// 2. AGENT JOB PAYLOADS
// ==========================================
export const PlannerJobPayloadSchema = BaseJobPayloadSchema.extend({
  linearIssueUrl: z.string().url(),
  repositoryName: z.string(),
});
export type PlannerJobPayload = z.infer<typeof PlannerJobPayloadSchema>;

export const CoderJobPayloadSchema = BaseJobPayloadSchema.extend({
  plannerResult: PlannerResultSchema,
  reviewFeedback: ReviewerResultSchema.optional(),
  repositoryName: z.string(),
});
export type CoderJobPayload = z.infer<typeof CoderJobPayloadSchema>;

export const ReviewerJobPayloadSchema = BaseJobPayloadSchema.extend({
  coderResult: CoderResultSchema,
  plannerResult: PlannerResultSchema,
  repositoryName: z.string(),
});
export type ReviewerJobPayload = z.infer<typeof ReviewerJobPayloadSchema>;

export const DeployerJobPayloadSchema = BaseJobPayloadSchema.extend({
  reviewerResult: ReviewerResultSchema,
  repositoryName: z.string(),
  branchName: z.string(),
  issueName: z.string(),
});
export type DeployerJobPayload = z.infer<typeof DeployerJobPayloadSchema>;
