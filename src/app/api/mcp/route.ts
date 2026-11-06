import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { dishes, events, orders, restaurants } from "@/lib/db";
import { ALLERGEN_IDS, allergenLabel } from "@/lib/allergens";
import { allergenStatement, findConflicts } from "@/lib/conflicts";
import { dinerMessage, placeOrder } from "@/lib/orders";
import { baseUrl, rateLimit } from "@/lib/http";
import { isSimulated } from "@/lib/paypal";
import type { OrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";

// The restaurant's agent-facing door: any MCP client (Claude, ChatGPT, Cursor...) can read the
// owner-confirmed allergen menu and place an order whose money PayPal only holds until the chef nods.

const allergen = z.enum(ALLERGEN_IDS as [string, ...string[]]);
const person = z.object({
  name: z.string().describe("Who will eat, e.g. 'Dan' or 'Mum'"),
  allergies: z.array(allergen).describe(`From the 14 UK allergens: ${ALLERGEN_IDS.join(", ")}`),
  notes: z.string().optional().describe("Severity, diet or anything else the kitchen should know"),
});

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

function buildServer(origin: string) {
  const r = restaurants.first()!;
  const server = new McpServer({ name: `chefs-nod-${r.slug}`, version: "1.0.0" });

  server.registerTool(
    "get_menu",
    {
      title: `${r.name} menu with allergens`,
      description: `The menu of ${r.name} (${r.city}) with the owner-confirmed allergen matrix (14 UK allergens), prices in ${r.currency} and the swaps the kitchen offers. Only these rows are facts; never claim a dish is safe or free from an allergen, the chef confirms every allergy order before payment is taken.`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      text({
        restaurant: { name: r.name, city: r.city, currency: r.currency, kitchenNotes: r.kitchenNotes },
        dishes: dishes
          .list(r.id)
          .filter((d) => d.confirmed && d.available)
          .map((d) => ({
            dish_id: d.id,
            name: d.name,
            category: d.category,
            price: (d.priceMinor / 100).toFixed(2),
            description: d.description,
            contains: d.contains.map(allergenLabel),
            may_contain: d.mayContain.map(allergenLabel),
            components: d.components.map((c) => ({ part: c.name, contains: c.allergens.map(allergenLabel) })),
            swaps: d.swaps.map((s) => ({ swap: s.label, price_change: (s.priceDeltaMinor / 100).toFixed(2), replaces: d.components.find((c) => c.id === s.replaces)?.name, with: s.with ? { part: s.with.name, contains: s.with.allergens.map(allergenLabel) } : "nothing" })),
          })),
      }),
  );

  server.registerTool(
    "check_allergies",
    {
      title: "Check a party's allergies against dishes",
      description: "Matches each person's allergies against the owner-confirmed rows for the dishes you plan to order. Returns conflicts and the swaps that remove them. This is a pre-check only: the chef makes the final call.",
      inputSchema: {
        party: z.array(person),
        items: z.array(z.object({ dish_id: z.string(), for_person: z.string() })),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ party, items }) => {
      const menu = dishes.list(r.id);
      const unknown = items.filter((i) => !menu.some((d) => d.id === i.dish_id && d.confirmed && d.available)).map((i) => i.dish_id);
      if (unknown.length) return { isError: true, content: [{ type: "text" as const, text: `Not on the confirmed menu, so nothing can be said about these: ${unknown.join(", ")}. Call get_menu for valid ids.` }] };
      const its: OrderItem[] = items.map((i, n) => ({ id: `item${n + 1}`, dishId: i.dish_id, dishName: menu.find((d) => d.id === i.dish_id)?.name ?? i.dish_id, forPerson: i.for_person, qty: 1, unitPriceMinor: 0 }));
      const conflicts = findConflicts(its, party as never, (id) => menu.find((d) => d.id === id) ?? null);
      return text({
        conflicts: conflicts.map((c) => ({
          dish: c.dishName,
          person: c.person,
          contains: c.contains.map(allergenLabel),
          may_contain: c.mayContain.map(allergenLabel),
          swaps_that_remove_it: c.fixingSwapIds.map((s) => menu.find((d) => d.id === c.dishId)?.swaps.find((w) => w.id === s)?.label),
        })),
        kitchen_notes: r.kitchenNotes,
        reminder: "No dish is certified safe by this tool. Every allergy order is held in PayPal and only charged after the chef confirms it.",
      });
    },
  );

  server.registerTool(
    "place_order",
    {
      title: "Place an order (payment held until the chef signs off)",
      description:
        "Creates the order and a PayPal order with intent AUTHORIZE. Returns an approval_url: give it to your user so they approve the payment in PayPal themselves. PayPal then only HOLDS the money; the chef reads the allergies and approves (charge), approves with changes (a lower charge), or declines (hold released). Order the dish as listed, even if it contains the person's allergen and a swap would remove it: you cannot apply swaps, and the chef applies them when checking the order. The statement therefore lists the dish as it stands on the menu, not the chef's final version. Put severity and requests in the person's notes. An order nobody approves in PayPal expires by itself with nothing held, so you never need to cancel one. Show the user the allergen_statement before they approve. Then poll get_order_status.",
      inputSchema: {
        diner_name: z.string().describe("The person paying"),
        language: z.string().optional().describe("BCP-47 code for messages to the diner, e.g. en, ru, es"),
        agent_name: z.string().optional().describe("Your name as an assistant, e.g. 'Claude' or 'ChatGPT'"),
        party: z.array(person),
        items: z.array(z.object({ dish_id: z.string(), qty: z.number().int().min(1).max(20), for_person: z.string() })).min(1),
      },
    },
    async (args) => {
      try {
        const order = await placeOrder(
          {
            restaurantSlug: r.slug,
            channel: "agent",
            agentName: args.agent_name || "AI assistant",
            dinerName: args.diner_name,
            language: args.language,
            party: args.party as never,
            items: args.items.map((i) => ({ dishId: i.dish_id, qty: i.qty, forPerson: i.for_person })),
          },
          origin,
        );
        const menu = dishes.list(r.id);
        return text({
          order_id: order.id,
          approval_url: order.approvalUrl,
          held_amount: `${(order.authorizedMinor / 100).toFixed(2)} ${order.currency}`,
          allergen_statement: allergenStatement(order.items, (id) => menu.find((d) => d.id === id) ?? null),
          kitchen_will_check: order.check?.questions.map((q) => q.question) ?? [],
          status_url: `${origin}/o/${order.id}`,
          next_step: isSimulated()
            ? "Show the allergen statement, then ask your user to open approval_url. Payments on this server are simulated (no PayPal sandbox keys), so approval_url is a labelled stand-in for PayPal's page. Nothing is charged until the chef confirms."
            : "Show the allergen statement, then ask your user to open approval_url and approve in PayPal. Nothing is charged until the chef confirms.",
          how_changes_work: "The statement describes the dish as listed. The chef sees the allergies and notes, applies any swaps, and only then is the diner charged, so a listed allergen here does not mean this order is wrong. If the chef can't make it safely, the hold is released.",
        });
      } catch (e) {
        return { ...text({ error: e instanceof Error ? e.message : String(e) }), isError: true };
      }
    },
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Order status",
      description: "Where the order is: awaiting_payment (user has not approved in PayPal yet), awaiting_chef (money held, chef reading allergies), captured (chef approved, maybe with changes and a lower charge), voided or expired (hold released, not charged).",
      inputSchema: { order_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ order_id }) => {
      const o = orders.get(order_id);
      if (!o) return { ...text({ error: "Unknown order" }), isError: true };
      return text({
        status: o.status,
        message_for_diner: await dinerMessage(o),
        held: `${(o.authorizedMinor / 100).toFixed(2)} ${o.currency}`,
        charged: o.capturedMinor == null ? null : `${(o.capturedMinor / 100).toFixed(2)} ${o.currency}`,
        chef_decision: o.decision,
        paypal: { order_id: o.paypalOrderId, authorization_id: o.authorizationId, capture_id: o.captureId },
        sign_off_record: o.status === "captured" ? `${origin}/o/${o.id}/record` : null,
        timeline: events.forOrder(o.id).map((e) => `${e.at} ${e.message}`),
      });
    },
  );

  return server;
}

async function handle(req: Request) {
  const limited = rateLimit(req, "mcp", 120, 3_600_000);
  if (limited) return limited;
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = buildServer(baseUrl(req));
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
