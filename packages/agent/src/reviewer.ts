import * as dotenv from "dotenv";
dotenv.config();
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import path from "path";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { CoderResult, PlannerResult } from "@nex-ai/types";
import { logger } from "@nex-ai/logger";
import { llm } from ".";

const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "tsx",
    path.resolve(__dirname, "../../../apps/mcp-github/src/index.ts"),
  ],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([_, v]) => v !== undefined),
  ) as Record<string, string>,
});

const githubClient = new Client(
  {
    name: "reviewer-github-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
);

export const ReviewerState = Annotation.Root({
  issueId: Annotation<string>(),
  repository: Annotation<string>(),
  plannerResult: Annotation<PlannerResult>(),
  coderResult: Annotation<CoderResult>(),
  reviewSummary: Annotation<string>(),
});

async function reviewNode(state: typeof ReviewerState.State) {
  if (!githubClient.transport) {
    githubClient.connect(transport);
  }

  const [owner, repo] = state.repository.split("/");

  const branchName = state.coderResult.branchName;

  logger.info(`[Reviewer] Starting review for branch: ${branchName}`);

  const fileContents = (
    await Promise.all(
      state.coderResult.changedFiles.map(async (filePath) => {
        try {
          const result = await githubClient.callTool({
            name: "read_file",
            arguments: { owner, repo, path: filePath, branch: branchName },
          });

          const textContent = result.content as Array<{ type: string; text: string }>;
          const text = textContent.find((c) => c.type === "text")?.text ?? "";

          // If the MCP server returned an error (e.g. 404), skip this file
          if (result.isError || text.startsWith("GitHub API Error")) {
            logger.warn(`[Reviewer] Could not read ${filePath} from branch ${branchName} — skipping`);
            return null;
          }

          return { path: filePath, content: text };
        } catch (err: any) {
          logger.warn(`[Reviewer] Failed to read ${filePath}: ${err.message} — skipping`);
          return null;
        }
      }),
    )
  ).filter(Boolean);

  if (fileContents.length === 0) {
    logger.warn(
      `[Reviewer] No files could be read from branch ${branchName}. The coder likely did not commit all required files.`,
    );
    return {
      reviewSummary:
        `REQUEST_CHANGES\n\nNone of the expected files (${state.coderResult.changedFiles.join(", ")}) could be read from branch ${branchName}. ` +
        `This means the coder either did not commit them or committed to the wrong branch. Please commit all required files to feature/${state.issueId}.`,
    };
  }

  const systemPrompt = `You are a Senior QA Engineer and Code Reviewer.
      You are reviewing work for ${owner}/${repo} on branch ${branchName}.

      ORIGINAL PLAN:
      ${JSON.stringify(state.plannerResult)}

      CODE PRODUCED (${fileContents.length} of ${state.coderResult.changedFiles.length} files readable):
      ${JSON.stringify(fileContents)}

      ⚠️  PACKAGE REVIEW RULE:
      Every import in the generated code must be from a package that is officially and publicly
      published in the standard registry for the project's language (npm, PyPI, Maven Central,
      RubyGems, crates.io, etc.) or is a standard library / language built-in.
      If you see any import that cannot be publicly installed from the standard registry, flag it
      as REQUEST_CHANGES with the reason "uses non-existent or non-public package".

      YOUR TASK:
      1. Verify if all Acceptance Criteria were met.
      2. Check for common issues (missing imports, syntax errors, use of non-existent packages).
      3. Provide a detailed summary of the review.
      4. Start your response with "APPROVE" or "REQUEST_CHANGES".`;

  const response = await llm.invoke([
    ["system", systemPrompt],
    ["user", "Provide your final review based on the code provided."],
  ]);

  return { reviewSummary: response.content };
}

export const reviewerGraph = new StateGraph(ReviewerState)
  .addNode("reviewer", reviewNode)
  .addEdge("__start__", "reviewer")
  .addEdge("reviewer", "__end__")
  .compile();
