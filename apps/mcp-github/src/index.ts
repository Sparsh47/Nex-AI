import * as dotenv from "dotenv";
dotenv.config();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_PAT_TOKEN,
});

const server = new Server(
  {
    name: "nex-github-server",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_files",
      description:
        "List all files and directories in a GitHub repository path.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (e.g., your-username)",
          },
          repo: {
            type: "string",
            description: "Repository name (e.g., nex-dummy-api)",
          },
          path: {
            type: "string",
            description: "Folder path (use empty string '' for root)",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "read_file",
      description:
        "Read the exact string content of a specific file in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
          },
          repo: {
            type: "string",
          },
          path: {
            type: "string",
            description: "Full file path (e.g., src/index.ts)",
          },
          branch: {
            type: "string",
            description: "The branch to read from (optional, defaults to main)",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "create_branch",
      description: "Create a new branch from main.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          branchName: {
            type: "string",
            description: "Name of the new branch (e.g., feature/nex-6)",
          },
        },
        required: ["owner", "repo", "branchName"],
      },
    },
    {
      name: "commit_file",
      description: "Create or update a file in a specific branch.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string", description: "File path to create/update" },
          message: { type: "string", description: "Commit message" },
          content: {
            type: "string",
            description: "The COMPLETE raw string content of the file",
          },
          branch: { type: "string", description: "Branch to commit to" },
        },
        required: ["owner", "repo", "path", "message", "content", "branch"],
      },
    },
    {
      name: "create_pull_request",
      description: "Open a pull request from your branch to main.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          head: { type: "string", description: "The branch you created" },
          base: { type: "string", description: "Usually 'main' or 'master'" },
        },
        required: ["owner", "repo", "title", "body", "head", "base"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_files") {
      const { owner, repo, path, branch } = args as {
        owner: string;
        repo: string;
        path: string;
        branch: string;
      };
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (Array.isArray(response.data)) {
        const files = response.data
          .map((item) => `${item.type}: ${item.path}`)
          .join("\n");
        return {
          content: [{ type: "text", text: `Contents of /${path}:\n${files}` }],
        };
      }
      return {
        content: [{ type: "text", text: "Path is a file, not a directory." }],
      };
    }

    if (name === "read_file") {
      const { owner, repo, path, branch } = args as {
        owner: string;
        repo: string;
        path: string;
        branch?: string;
      };
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (
        !Array.isArray(response.data) &&
        response.data.type === "file" &&
        response.data.content
      ) {
        const decodedContent = Buffer.from(
          response.data.content,
          "base64",
        ).toString("utf-8");
        return { content: [{ type: "text", text: decodedContent }] };
      }
      return {
        content: [{ type: "text", text: "Path is a directory, not a file." }],
      };
    }

    if (name === "create_branch") {
      const { owner, repo, branchName } = args as any;
      try {
        const mainRef = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: "heads/main",
        });
        const sha = mainRef.data.object.sha;

        await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branchName}`,
          sha,
        });
        return {
          content: [
            {
              type: "text",
              text: `Successfully created branch: ${branchName}`,
            },
          ],
        };
      } catch (e: any) {
        if (
          e.status === 422 &&
          e.message.includes("Reference already exists")
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Branch ${branchName} already exists. You can proceed with commit_file.`,
              },
            ],
          };
        }
        throw e;
      }
    }

    if (name === "commit_file") {
      const { owner, repo, path, message, content, branch } = args as any;
      let sha: string | undefined;
      try {
        const fileData = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });
        if (!Array.isArray(fileData.data)) sha = fileData.data.sha;
      } catch (e) {}

      const response = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha,
      });

      return {
        content: [
          {
            type: "text",
            text: `Committed ${path}. SHA: ${response.data.commit.sha}`,
          },
        ],
      };
    }

    if (name === "create_pull_request") {
      const { owner, repo, title, body, head, base } = args as any;
      const pr = await octokit.rest.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
      });
      return {
        content: [{ type: "text", text: `PR Created: ${pr.data.html_url}` }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    if (
      error.status === 422 &&
      error.message.includes("Reference already exists")
    ) {
      const bn = (args as any)?.branchName ?? "unknown";
      return {
        content: [
          {
            type: "text",
            text: `Branch ${bn} already exists. You can proceed with commit_file.`,
          },
        ],
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `GitHub API Error: ${error.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio...");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
