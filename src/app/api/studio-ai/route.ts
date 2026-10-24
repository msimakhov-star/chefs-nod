import { NextResponse } from "next/server";
import { generateText, jsonSchema, Output, tool, type ModelMessage } from "ai";
import { aiProvider } from "@/lib/ai";
import { fail, rateLimit } from "@/lib/http";

export const maxDuration = 120;

// Runs one AG Studio AI turn on whichever provider Chef's Nod is configured with.
// AG Studio owns the agent loop and executes its own tools in the browser; this endpoint only
// turns the conversation into model messages and returns the model's text and tool calls.

type Item = {
  kind?: "input" | "output";
  type: "message" | "function_call" | "function_call_output" | "reasoning";
  role?: string;
  content?: { type: string; text?: string; refusal?: string }[];
  callId?: string;
  name?: string;
  arguments?: string;
  output?: string | unknown;
};
type ToolSchema = { name: string; description?: string; parameters: Record<string, unknown> };
type Body = { input: Item[]; instructions?: string; tools?: ToolSchema[]; toolChoice?: "auto" | "none" | "required" | { name: string }; responseFormat?: { type: "text" } | { type: "json"; name?: string; schema: Record<string, unknown> } };

function toMessages(items: Item[]): ModelMessage[] {
  const names = new Map<string, string>();
  const out: ModelMessage[] = [];
  for (const it of items) {
    if (it.type === "message" && it.kind !== "output") {
      const text = (it.content ?? []).map((c) => c.text ?? "").join("\n");
      out.push(it.role === "system" || it.role === "developer" ? { role: "system", content: text } : { role: "user", content: text });
    } else if (it.type === "message") {
      out.push({ role: "assistant", content: (it.content ?? []).map((c) => ({ type: "text" as const, text: c.text ?? c.refusal ?? "" })) });
    } else if (it.type === "function_call") {
      names.set(it.callId!, it.name!);
      let input: unknown = {};
      try {
        input = JSON.parse(it.arguments || "{}");
      } catch {}
      const last = out.at(-1);
      const part = { type: "tool-call" as const, toolCallId: it.callId!, toolName: it.name!, input };
      if (last?.role === "assistant" && Array.isArray(last.content)) (last.content as unknown[]).push(part);
      else out.push({ role: "assistant", content: [part] });
    } else if (it.type === "function_call_output") {
      const value = typeof it.output === "string" ? it.output : JSON.stringify(it.output);
      const part = { type: "tool-result" as const, toolCallId: it.callId!, toolName: names.get(it.callId!) ?? "tool", output: { type: "text" as const, value } };
      const last = out.at(-1);
      if (last?.role === "tool") (last.content as unknown[]).push(part);
      else out.push({ role: "tool", content: [part] });
    }
  }
  return out;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "studio-ai", 60, 3_600_000);
  if (limited) return limited;
  try {
    const body = (await req.json()) as Body;
    const model = aiProvider().smart;
    const messages = toMessages(body.input);
    const wantsJson = body.responseFormat?.type === "json";
    const tools = Object.fromEntries((body.tools ?? []).map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters as never) })]));
    const toolChoice = !body.toolChoice ? undefined : typeof body.toolChoice === "string" ? body.toolChoice : { type: "tool" as const, toolName: body.toolChoice.name };

    const result = await generateText({
      model,
      system: body.instructions,
      messages,
      ...(Object.keys(tools).length && body.toolChoice !== "none" ? { tools, toolChoice } : {}),
      ...(wantsJson && !Object.keys(tools).length ? { output: Output.object({ schema: jsonSchema((body.responseFormat as { schema: Record<string, unknown> }).schema as never) }) } : {}),
    });
    const text = wantsJson && result.output !== undefined && !Object.keys(tools).length ? JSON.stringify(result.output) : result.text;
    return NextResponse.json({
      text,
      toolCalls: result.toolCalls.map((c) => ({ id: c.toolCallId, name: c.toolName, arguments: JSON.stringify(c.input ?? {}) })),
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
    });
  } catch (e) {
    return fail(e, 500);
  }
}
