// AG Studio data sources for the owner's analytics: one row per order, per order line, and per declared allergy.
import type { AgDataSourcesDefinition, AgExpressionFieldDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from "ag-studio";
import { allergenLabel } from "@/lib/allergens";
import { allergensAfter } from "@/lib/dish";
import type { Dish, Order } from "@/lib/types";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }), ...(format === "currencyFormat" && { formatOptions: { format: GBP } }), ...(format === "integerFormat" && { formatOptions: { format: INT } }) }));
const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [st, sf] = source.split(".");
  const [tt, tf] = target.split(".");
  return { id, source: { tableId: st, fieldId: sf }, target: { tableId: tt, fieldId: tf }, type: "many-to-one" };
};
const sumOf = (id: string) => ({ id, aggregation: "sum" as const });
const ratio = (id: string, name: string, description: string, num: string, den: string): AgExpressionFieldDefinition => ({
  id,
  name,
  description,
  format: "percentageFormat",
  isMeasure: true,
  expression: { operator: "divide", inputs: [sumOf(num), sumOf(den)] },
});

const OUTCOME: Record<string, string> = { approved: "Approved", approved_with_changes: "Approved with changes", declined: "Declined" };
const outcomeOf = (o: Order) => (o.decision ? OUTCOME[o.decision.outcome] : o.status === "expired" ? "Expired" : o.status === "awaiting_chef" ? "Waiting for chef" : o.status === "awaiting_payment" ? "Not approved in PayPal" : o.status);

export function buildStudioData(orders: (Order & { authorizedAt: string | null })[], menu: Dish[]): AgDataSourcesDefinition {
  const held = orders.filter((o) => o.authorizationId);
  const orderRows = held.map((o) => {
    const finished = ["captured", "voided", "expired", "refunded"].includes(o.status);
    const captured = (o.capturedMinor ?? 0) / 100;
    return {
      id: o.id,
      ref: o.id.slice(-6).toUpperCase(),
      createdAt: o.createdAt.slice(0, 10),
      diner: o.dinerName,
      channel: o.channel === "agent" ? `AI agent (${o.agentName})` : o.channel === "replay" ? "Replay" : "Web",
      outcome: outcomeOf(o),
      held: o.authorizedMinor / 100,
      captured,
      released: finished ? o.authorizedMinor / 100 - captured : 0,
      nodSeconds: o.decision && o.authorizedAt ? Math.round((Date.parse(o.decision.decidedAt) - Date.parse(o.authorizedAt)) / 1000) : null,
      allergyOrder: o.party.some((p) => p.allergies.length) ? 1 : 0,
      declined: o.decision?.outcome === "declined" ? 1 : 0,
      changed: o.decision?.outcome === "approved_with_changes" ? 1 : 0,
      decided: o.decision ? 1 : 0,
      one: 1,
    };
  });
  const lineRows = held.flatMap((o) =>
    o.items.map((i) => {
      const dish = menu.find((d) => d.id === i.dishId);
      const allergies = o.party.find((p) => p.name.toLowerCase() === i.forPerson.toLowerCase())?.allergies ?? [];
      const hits = dish?.contains.filter((a) => allergies.includes(a)) ?? [];
      const swaps = o.decision?.appliedSwaps.filter((s) => s.itemId === i.id).map((s) => s.swapId) ?? [];
      return {
        id: i.id,
        orderId: o.id,
        dish: i.dishName,
        category: dish?.category ?? "",
        qty: i.qty,
        lineTotal: (i.unitPriceMinor * i.qty) / 100,
        conflict: hits.length ? 1 : 0,
        swapsApplied: swaps.length,
        allergenRemoved: hits.length && dish && !allergensAfter(dish, swaps).some((a) => allergies.includes(a)) ? 1 : 0,
      };
    }),
  );
  const declRows = held.flatMap((o) => o.party.flatMap((p) => p.allergies.map((a) => ({ id: `${o.id}-${p.name}-${a}`, orderId: o.id, person: p.name, allergen: allergenLabel(a), one: 1 }))));
  const conflictRows = held.flatMap((o) =>
    o.items.flatMap((i) => {
      const dish = menu.find((d) => d.id === i.dishId);
      const allergies = o.party.find((p) => p.name.toLowerCase() === i.forPerson.toLowerCase())?.allergies ?? [];
      return (dish?.contains.filter((a) => allergies.includes(a)) ?? []).map((a) => ({ id: `${i.id}-${a}`, orderId: o.id, dish: i.dishName, allergen: allergenLabel(a), one: 1 }));
    }),
  );
  const dates = orderRows.map((r) => r.createdAt).sort();
  const today = new Date().toISOString().slice(0, 10);

  return {
    description:
      "Chef's Nod data for one independent restaurant. Every allergy order's money is held in PayPal (authorization) and only captured after the chef signs off; a change can only lower the price; a decline or timeout voids the hold. Amounts are in GBP.",
    sources: [
      {
        id: "orders",
        description: "One row per order whose money was held in PayPal. Released = held minus captured, for finished orders.",
        data: orderRows,
        fields: fields([
          ["id", "Order ID", "textFormat", true],
          ["ref", "Order", "textFormat"],
          ["createdAt", "Order date", "dateFormat"],
          ["diner", "Diner", "textFormat"],
          ["channel", "Channel", "textFormat"],
          ["outcome", "Chef's decision", "textFormat"],
          ["held", "Held", "currencyFormat"],
          ["captured", "Captured", "currencyFormat"],
          ["released", "Released", "currencyFormat"],
          ["nodSeconds", "Seconds to nod", "integerFormat"],
          ["allergyOrder", "Allergy orders", "integerFormat"],
          ["declined", "Declined", "integerFormat"],
          ["changed", "Changed", "integerFormat"],
          ["decided", "Decided", "integerFormat"],
          ["one", "Orders", "integerFormat"],
        ]),
      },
      {
        id: "lines",
        name: "Order lines",
        description: "One row per dish ordered. Conflict = the dish contains an allergen declared for the person it is for.",
        data: lineRows,
        fields: fields([
          ["id", "Line ID", "textFormat", true],
          ["orderId", "Order ID", "textFormat", true],
          ["dish", "Dish", "textFormat"],
          ["category", "Category", "textFormat"],
          ["qty", "Quantity", "integerFormat"],
          ["lineTotal", "Line total", "currencyFormat"],
          ["conflict", "Allergen conflicts", "integerFormat"],
          ["swapsApplied", "Swaps applied", "integerFormat"],
          ["allergenRemoved", "Removed by swaps", "integerFormat"],
        ]),
      },
      {
        id: "conflicts",
        name: "Allergen conflicts",
        description: "One row per declared allergen found in a dish for the person it is for.",
        data: conflictRows,
        fields: fields([
          ["id", "Conflict ID", "textFormat", true],
          ["orderId", "Order ID", "textFormat", true],
          ["dish", "Dish with conflict", "textFormat"],
          ["allergen", "Conflicting allergen", "textFormat"],
          ["one", "Conflicts", "integerFormat"],
        ]),
      },
      {
        id: "declarations",
        name: "Declared allergies",
        description: "One row per allergy declared for a person on an order.",
        data: declRows,
        fields: fields([
          ["id", "Declaration ID", "textFormat", true],
          ["orderId", "Order ID", "textFormat", true],
          ["person", "Person", "textFormat"],
          ["allergen", "Allergen", "textFormat"],
          ["one", "Declarations", "integerFormat"],
        ]),
      },
    ],
    relationships: [
      manyToOne("line-order", "lines.orderId", "orders.id"),
      manyToOne("decl-order", "declarations.orderId", "orders.id"),
      manyToOne("conflict-order", "conflicts.orderId", "orders.id"),
      { id: "orders-calendar", source: { tableId: "orders", fieldId: "createdAt" }, target: { calendarId: "calendar" } },
    ],
    calendars: [
      {
        id: "calendar",
        label: "Calendar",
        range: { from: { type: "date", value: dates[0] ?? today }, to: { type: "date", value: dates.at(-1) ?? today } },
        fragments: ["year", "month", "week", "day", "dayOfWeek"],
      },
    ],
    expressions: [
      ratio("captureRate", "Capture rate", "Captured / held.", "orders.captured", "orders.held"),
      ratio("declineRate", "Decline rate", "Declined / decided orders.", "orders.declined", "orders.decided"),
      ratio("fixRate", "Fixed by swaps", "Share of allergen conflicts the chef removed with swaps.", "lines.allergenRemoved", "lines.conflict"),
    ],
  };
}
