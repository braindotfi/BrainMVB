import type { Express } from "express";
import { createServer, type Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";

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

  // Agent status toggle — simulates on-chain status update
  app.patch("/api/agents/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive", "paused"].includes(status)) {
        return res.status(400).json({ error: "Valid status required: active | inactive | paused" });
      }

      const updated = await storage.setAgentStatus(id, status);
      return res.json({ agentId: id, status: updated });
    } catch (error) {
      console.error("Agent status update error:", error);
      return res.status(500).json({ error: "Failed to update agent status" });
    }
  });

  app.get("/api/agents/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const status = await storage.getAgentStatus(id);
      return res.json({ agentId: id, status: status ?? null });
    } catch (error) {
      return res.status(500).json({ error: "Failed to get agent status" });
    }
  });

  return httpServer;
}
