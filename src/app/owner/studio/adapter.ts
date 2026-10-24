// AG Studio LLM adapter that sends each turn to Chef's Nod's own /api/studio-ai endpoint,
// so the dashboard assistant uses the same AI provider (and key, kept on the server) as the rest of the app.
import type { AgAiEvent, AgAiOutputItem, AgLlmAdapter, AgLlmRequest, AgLlmResponse, AgLlmResponseHandler } from "ag-studio";

type TurnResult = { text: string; toolCalls: { id: string; name: string; arguments: string }[]; usage?: { inputTokens?: number; outputTokens?: number } };

let seq = 0;
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function runTurn(request: AgLlmRequest, signal?: AbortSignal): AgLlmResponseHandler {
  let resolve!: (r: AgLlmResponse) => void;
  let reject!: (e: Error) => void;
  const complete = new Promise<AgLlmResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  void complete.catch(() => {});

  async function* events(): AsyncIterableIterator<AgAiEvent> {
    try {
      const res = await fetch("/api/studio-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: request.input, instructions: request.instructions, tools: request.tools, toolChoice: request.toolChoice, responseFormat: request.responseFormat }),
        signal,
      });
      const data = (await res.json()) as TurnResult & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const output: AgAiOutputItem[] = [];
      if (data.text) {
        const messageId = nextId("msg");
        yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" } as AgAiEvent;
        yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: data.text } as AgAiEvent;
        yield { type: "TEXT_MESSAGE_END", messageId } as AgAiEvent;
        output.push({ id: messageId, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: data.text, annotations: [] }] } as AgAiOutputItem);
      }
      for (const call of data.toolCalls) {
        yield { type: "TOOL_CALL_START", toolCallId: call.id, toolCallName: call.name } as AgAiEvent;
        yield { type: "TOOL_CALL_ARGS", toolCallId: call.id, delta: call.arguments } as AgAiEvent;
        yield { type: "TOOL_CALL_END", toolCallId: call.id } as AgAiEvent;
        output.push({ id: nextId("fc"), kind: "output", type: "function_call", callId: call.id, name: call.name, arguments: call.arguments, status: "completed" } as AgAiOutputItem);
      }
      resolve({
        id: nextId("resp"),
        createdAt: Math.floor(Date.now() / 1000),
        model: "chefs-nod",
        output,
        status: "completed",
        usage: { inputTokens: data.usage?.inputTokens ?? 0, outputTokens: data.usage?.outputTokens ?? 0, totalTokens: (data.usage?.inputTokens ?? 0) + (data.usage?.outputTokens ?? 0) },
      } as AgLlmResponse);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  const it = events();
  return { stream: { [Symbol.asyncIterator]: () => it }, complete };
}

export const chefsNodAdapter: AgLlmAdapter = { executeTurn: (request, options) => runTurn(request, options?.signal) };
