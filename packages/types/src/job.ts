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
  jobId: z.string().uuid({ message: "jobId must be a valid UUID" }),
  issueId: z.string(),
  timestamp: z.number().int().positive(),
});
export type BaseJobPayload = z.infer<typeof BaseJobPayloadSchema>;

// ==========================================
// 2. AGENT JOB PAYLOADS
// ==========================================
export const PlannerJobPayloadSchema = BaseJobPayloadSchema.extend({
  linearIssueUrl: z.string().url(),
});
export type PlannerJobPayload = z.infer<typeof PlannerJobPayloadSchema>;

export const CoderJobPayloadSchema = BaseJobPayloadSchema.extend({
  plannerResult: PlannerResultSchema,
});
export type CoderJobPayload = z.infer<typeof CoderJobPayloadSchema>;

export const ReviewerJobPayloadSchema = BaseJobPayloadSchema.extend({
  coderResult: CoderResultSchema,
});
export type ReviewerJobPayload = z.infer<typeof ReviewerJobPayloadSchema>;

export const DeployerJobPayloadSchema = BaseJobPayloadSchema.extend({
  reviewerResult: ReviewerResultSchema,
});
export type DeployerJobPayload = z.infer<typeof DeployerJobPayloadSchema>;

export const UnionJobPayloadSchema = z.union([
  PlannerJobPayloadSchema,
  CoderJobPayloadSchema,
  ReviewerJobPayloadSchema,
  DeployerJobPayloadSchema,
]);
export type UnionJobPayloadType = z.infer<typeof UnionJobPayloadSchema>;
