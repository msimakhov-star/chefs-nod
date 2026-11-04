import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Pick whichever AI provider has a key. Locally, with no key, fall back to Ollama.
export function aiProvider() {
  if (process.env.ANTHROPIC_API_KEY) {
    const p = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return {
      name: "Claude",
      smart: p(process.env.AI_SMART_MODEL || "claude-sonnet-5-5"),
      fast: p(process.env.AI_FAST_MODEL || "claude-haiku-5-5"),
    };
  }
  if (process.env.GEMINI_API_KEY) {
    const p = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    return {
      name: "Gemini",
      smart: p(process.env.AI_SMART_MODEL || "gemini-flash-latest"),
      fast: p(process.env.AI_FAST_MODEL || "gemini-flash-lite-latest"),
    };
  }
  if (process.env.LOCAL_AI !== "1") throw new Error("The AI assistant is not switched on for this server.");
  const p = createOpenAICompatible({
    name: "ollama",
    baseURL: process.env.OLLAMA_URL || "http://localhost:11434/v1",
    supportsStructuredOutputs: true,
    transformRequestBody: (body) => ({ ...body, reasoning_effort: "none" }), // thinking makes local models too slow
  });
  const m = p.chatModel(process.env.AI_SMART_MODEL || "qwen3.5:9b");
  return { name: "Ollama (local)", smart: m, fast: m };
}

export const aiName = () => (process.env.ANTHROPIC_API_KEY ? "Claude" : process.env.GEMINI_API_KEY ? "Gemini" : process.env.LOCAL_AI === "1" ? "Ollama (local)" : "not configured");
