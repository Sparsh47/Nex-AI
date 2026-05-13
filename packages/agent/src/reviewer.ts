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

  const fileContents = await Promise.all(
    state.coderResult.changedFiles.map(async (filePath) => {
      const result = await githubClient.callTool({
        name: "read_file",
        arguments: { owner, repo, path: filePath, branch: branchName },
      });

      return { path: filePath, content: result };
    }),
  );

  const systemPrompt = `You are a Senior QA Engineer and Code Reviewer.
      You are reviewing work for ${owner}/${repo} on branch ${branchName}.

      ORIGINAL PLAN:
      ${JSON.stringify(state.plannerResult)}

      CODE PRODUCED:
      ${JSON.stringify(fileContents)}

      YOUR TASK:
      1. Verify if all Acceptance Criteria were met.
      2. Check for common issues (missing imports, syntax errors).
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
