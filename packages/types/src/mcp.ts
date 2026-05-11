import { z } from "zod";

// ==========================================
// 1. MCP: GITHUB SERVER
// ==========================================
export const CreateBranchInputSchema = z.object({
  branchName: z.string(),
  baseBranch: z.string().default("main"),
});
export type CreateBranchInput = z.infer<typeof CreateBranchInputSchema>;

export const GetFileInputSchema = z.object({
  filePath: z.string(),
  branch: z.string().default("main"),
});
export type GetFileInput = z.infer<typeof GetFileInputSchema>;

export const PushCommitInputSchema = z.object({
  branchName: z.string(),
  commitMessage: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    }),
  ),
});
export type PushCommitInput = z.infer<typeof PushCommitInputSchema>;

export const CreatePRInputSchema = z.object({
  title: z.string(),
  body: z.string(),
  headBranch: z.string(),
  baseBranch: z.string().default("main"),
});
export type CreatePRInput = z.infer<typeof CreatePRInputSchema>;

export const GetDiffInputSchema = z.object({
  baseBranch: z.string().default("main"),
  headBranch: z.string(),
});
export type GetDiffInput = z.infer<typeof GetDiffInputSchema>;

// ==========================================
// 2. MCP: LINEAR SERVER
// ==========================================
export const GetIssueInputSchema = z.object({
  issueId: z.string(),
});
export type GetIssueInput = z.infer<typeof GetIssueInputSchema>;

export const UpdateIssueInputSchema = z.object({
  issueId: z.string(),
  state: z.string().optional(),
  comment: z.string().optional(),
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInputSchema>;

// ==========================================
// 3. MCP: TERMINAL SERVER
// ==========================================
export const RunCommandInputSchema = z.object({
  command: z.string(),
  cwd: z.string().default("."),
});
export type RunCommandInput = z.infer<typeof RunCommandInputSchema>;

export const RunCommandResultSchema = z.object({
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
});
export type RunCommandResult = z.infer<typeof RunCommandResultSchema>;
