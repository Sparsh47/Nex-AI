import * as dotenv from "dotenv";
import { ChatGroq } from "@langchain/groq";
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

dotenv.config();

export const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
  temperature: 0.1,
  maxRetries: 3,
});

export const BaseAgentState = Annotation.Root({
  issueId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

export * from "./planner";
