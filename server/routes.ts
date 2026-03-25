import type { Express } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/assistant/chat", async (req, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array required" });
      }

      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system:
          "You are Brain AI, an intelligent assistant specialized in DeFi, crypto trading, AI agents, and blockchain technology. You help users understand AI agents, analyze market trends, and make informed decisions about AI agent investments. Be concise, knowledgeable, and helpful.",
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const content = response.content[0];
      if (content.type === "text") {
        return res.json({ message: content.text });
      }

      return res.status(500).json({ error: "Unexpected response type" });
    } catch (error) {
      console.error("Claude API error:", error);
      return res.status(500).json({ error: "Failed to get AI response" });
    }
  });

  return httpServer;
}
