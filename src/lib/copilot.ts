import { createMCPClient } from "@ai-sdk/mcp";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { aiProvider } from "./ai";
import { dishes, orders, restaurants } from "./db";
import { accessToken, isSimulated, searchTransactions } from "./paypal";
import { allergenLabel } from "./allergens";

// Owner copilot: answers questions about the restaurant's money by combining Chef's Nod's own records
// with PayPal's hosted sandbox MCP server (the same server PayPal's AI Toolkit uses).
// Read-only by design: it can look things up and draft actions, but money only moves from the owner's buttons.

const PAYPAL_MCP_SSE = "https://mcp.sandbox.paypal.com/sse";

export async function askCopilot(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const r = restaurants.first()!;
  const used: string[] = [];
  let paypalTools: Record<string, unknown> = {};
  let mcp: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let mcpNote = "";

  if (!isSimulated()) {
    try {
      mcp = await createMCPClient({ transport: { type: "sse", url: PAYPAL_MCP_SSE, headers: { Authorization: `Bearer ${await accessToken()}` } } });
      const all = await mcp.tools();
      // Only lookups. Refunds, captures and invoices stay with the owner's own buttons.
      paypalTools = Object.fromEntries(Object.entries(all).filter(([name]) => /^(list|get|show|search)/i.test(name)));
    } catch (e) {
      console.error("PayPal MCP unavailable, continuing with local records only", e);
      mcpNote = "PayPal's MCP server could not be reached, so this answer uses Chef's Nod records and Transaction Search only.";
    }
  }

  const local = {
    chefs_nod_orders: tool({
      description: "Orders recorded by Chef's Nod with PayPal ids, held and captured amounts, the chef's decision and the party's allergies. Amounts are in pence.",
      inputSchema: z.object({ status: z.enum(["any", "awaiting_payment", "awaiting_chef", "captured", "voided", "expired", "refunded"]).default("any"), limit: z.number().int().min(1).max(200).default(50) }),
      execute: async ({ status, limit }) => {
        used.push("chefs_nod_orders");
        return orders
          .list(r.id, 500)
          .filter((o) => status === "any" || o.status === status)
          .slice(0, limit)
          .map((o) => ({
            id: o.id,
            at: o.createdAt,
            diner: o.dinerName,
            channel: o.channel === "agent" ? `agent:${o.agentName}` : o.channel,
            allergies: o.party.flatMap((p) => p.allergies.map((a) => `${p.name}:${allergenLabel(a)}`)),
            status: o.status,
            held: o.authorizedMinor,
            captured: o.capturedMinor,
            refunded: o.refundedMinor ?? 0,
            decision: o.decision?.outcome ?? null,
            paypal: { order: o.paypalOrderId, authorization: o.authorizationId, capture: o.captureId },
          }));
      },
    }),
    paypal_transactions: tool({
      description: "PayPal's own record of settled sandbox transactions from the Transaction Search API. Newly settled transactions can take a while to appear. Use this to compare PayPal's records with Chef's Nod's.",
      inputSchema: z.object({ days: z.number().int().min(1).max(30).default(7) }),
      execute: async ({ days }) => {
        used.push("paypal_transactions");
        if (isSimulated()) return { note: "Simulated mode: there is no PayPal sandbox to search." };
        const end = new Date();
        return searchTransactions(new Date(end.getTime() - days * 86_400_000).toISOString(), end.toISOString());
      },
    }),
    chefs_nod_menu: tool({
      description: "The confirmed menu with prices (pence), allergens per component and swaps.",
      inputSchema: z.object({}),
      execute: async () => {
        used.push("chefs_nod_menu");
        return dishes.list(r.id).map((d) => ({ id: d.id, name: d.name, price: d.priceMinor, contains: d.contains, components: d.components, swaps: d.swaps.map((s) => s.label) }));
      },
    }),
  };

  try {
    const result = await generateText({
      model: aiProvider().smart,
      tools: { ...local, ...(paypalTools as Record<string, ReturnType<typeof tool>>) },
      stopWhen: isStepCount(8),
      system: `You are the money copilot for ${r.name}, an independent restaurant that uses Chef's Nod: every allergy order is held in PayPal (authorization) and only captured after the chef signs off. Answer the owner's question with numbers from the tools, in pounds (amounts from chefs_nod tools are in pence). Be brief and concrete. ${Object.keys(paypalTools).length ? "You also have PayPal's own tools; use them to cross-check against PayPal's records when useful." : ""} You cannot move money. If a refund or other action is needed, say exactly which order and amount, and tell the owner to use the Refund button in the ledger.`,
      messages: [...history, { role: "user", content: question }],
    });
    const toolNames = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    return { answer: [result.text.trim(), mcpNote].filter(Boolean).join("\n\n"), toolsUsed: [...new Set([...used, ...toolNames])], paypalMcp: Object.keys(paypalTools) };
  } finally {
    await mcp?.close().catch(() => {});
  }
}
