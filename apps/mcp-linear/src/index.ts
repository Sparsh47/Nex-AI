import * as dotenv from "dotenv";
dotenv.config();
import { LinearClient } from "@linear/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";

const linear = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

const server = new Server(
  {
    name: "nex-linear-mcp",
    version: "1.0.0",
  },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_issue",
      description: "Fetch details of a Linear issue by ID (e.g. NEX-101)",
      inputSchema: {
        type: "object",
        properties: {
          issueId: { type: "string" },
        },
        required: ["issueId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_issue") {
    const { issueId } = request.params.arguments as { issueId: string };

    try {
      const issue = await linear.issue(issueId);
      const state = await issue.state;

      return {
        content: [
          {
            type: "text",
            text: `Title: ${issue.title}\nStatus: ${state?.name}\nDescription: ${issue.description}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: err.message }],
      };
    }
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.log("Linear MCP Server running...");
