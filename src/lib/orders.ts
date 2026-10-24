import { dishes, events, newId, orders, restaurants } from "./db";
import { allergenStatement, findConflicts, risk } from "./conflicts";
import { kitchenCheck, translate } from "./agents";
import { authorizeHeldOrder, captureHold, createHeldOrder, createTestCardHold, refundCapture, voidHold, PayPalFailure } from "./paypal";
import { publish } from "./bus";
import type { ChefDecision, Order, OrderItem, Person } from "./types";
import type { AllergenId } from "./allergens";

export type PlaceOrderInput = {
  restaurantSlug: string;
  channel: Order["channel"];
  agentName?: string | null;
  dinerName: string;
  language?: string;
  party: Person[];
  items: { dishId: string; qty: number; forPerson: string }[];
};

const fmt = (minor: number) => `£${(minor / 100).toFixed(2)}`;

function log(o: Order, type: string, message: string, data: unknown = null) {
  events.add(o.id, type, message, data);
  publish(o.restaurantId, o.id, type);
}

export async function placeOrder(input: PlaceOrderInput, baseUrl: string) {
  const restaurant = restaurants.bySlug(input.restaurantSlug);
  if (!restaurant) throw new Error(`Unknown restaurant ${input.restaurantSlug}`);
  if (!input.items.length) throw new Error("The basket is empty");
  const menu = dishes.list(restaurant.id);
  const dishById = (id: string) => menu.find((d) => d.id === id) ?? null;

  const party: Person[] = input.party.map((p) => ({ name: p.name.trim() || "Guest", allergies: [...new Set(p.allergies)] as AllergenId[], notes: p.notes?.trim() || "" }));
  const items: OrderItem[] = input.items.map((i) => {
    const d = dishById(i.dishId);
    if (!d || !d.confirmed || !d.available) throw new Error(`Dish ${i.dishId} is not on the confirmed menu`);
    if (!party.some((p) => p.name.toLowerCase() === i.forPerson.toLowerCase())) party.push({ name: i.forPerson, allergies: [], notes: "" });
    return { id: newId("it"), dishId: d.id, dishName: d.name, forPerson: i.forPerson, qty: Math.max(1, Math.min(20, Math.round(i.qty))), unitPriceMinor: d.priceMinor };
  });

  const now = new Date().toISOString();
  const order: Order = {
    id: newId("ord"),
    restaurantId: restaurant.id,
    channel: input.channel,
    agentName: input.agentName ?? null,
    dinerName: input.dinerName.trim() || party[0]?.name || "Guest",
    language: input.language || "en",
    party,
    items,
    status: "awaiting_payment",
    authorizedMinor: items.reduce((s, i) => s + i.unitPriceMinor * i.qty, 0),
    capturedMinor: null,
    currency: restaurant.currency,
    paypalOrderId: null,
    authorizationId: null,
    captureId: null,
    approvalUrl: null,
    check: null,
    decision: null,
    createdAt: now,
    updatedAt: now,
  };

  const conflicts = findConflicts(items, party, dishById);
  const statement = allergenStatement(items, dishById);
  order.check = await kitchenCheck(order, conflicts, menu, restaurant, statement, risk(conflicts, party));

  if (input.channel === "replay") {
    const pp = await createTestCardHold(order, restaurant);
    order.paypalOrderId = pp.paypalOrderId;
    order.authorizationId = pp.authorizationId;
    order.status = "awaiting_chef";
    orders.save(order);
    log(order, "created", `Replay order from ${order.dinerName} for ${fmt(order.authorizedMinor)} (PayPal sandbox test card).`, { conflicts, statement });
    log(order, "authorized", `PayPal is holding ${fmt(order.authorizedMinor)} (authorization ${pp.authorizationId}). Waiting for the chef.`);
    return order;
  }

  const pp = await createHeldOrder(order, restaurant, baseUrl);
  order.paypalOrderId = pp.paypalOrderId;
  order.approvalUrl = pp.approvalUrl;
  orders.save(order);
  log(order, "created", `${order.channel === "agent" ? `${order.agentName ?? "An AI agent"} placed` : `${order.dinerName} placed`} an order for ${fmt(order.authorizedMinor)}. PayPal order ${pp.paypalOrderId} created with intent AUTHORIZE: nothing is charged yet.`, { conflicts, statement });
  return order;
}

/** Diner approved in PayPal. Place the hold and send the ticket to the kitchen. */
export async function onPayerApproved(orderId: string) {
  const order = orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "awaiting_payment") return order;
  try {
    const auth = await authorizeHeldOrder(order);
    order.authorizationId = auth.authorizationId;
    order.status = "awaiting_chef";
    orders.save(order);
    log(order, "authorized", `Diner approved. PayPal is holding ${fmt(order.authorizedMinor)} (authorization ${auth.authorizationId}). Waiting for the chef.`, auth);
  } catch (e) {
    order.status = "failed";
    orders.save(order);
    log(order, "error", e instanceof PayPalFailure ? `${e.message}${e.debugId ? ` (debug id ${e.debugId})` : ""}` : String(e));
    throw e;
  }
  return order;
}

export function finalAmount(order: Order, appliedSwaps: ChefDecision["appliedSwaps"]) {
  let total = order.authorizedMinor;
  for (const a of appliedSwaps) {
    const item = order.items.find((i) => i.id === a.itemId);
    const swap = item && dishes.get(item.dishId)?.swaps.find((s) => s.id === a.swapId);
    if (!item || !swap) throw new Error(`Unknown swap ${a.swapId}`);
    if (swap.priceDeltaMinor > 0) throw new Error(`"${swap.label}" costs more, so the diner would need to approve again. Decline with a note instead.`);
    total += swap.priceDeltaMinor * item.qty;
  }
  return Math.max(0, total);
}

export async function chefDecides(orderId: string, outcome: ChefDecision["outcome"], appliedSwaps: ChefDecision["appliedSwaps"], reason: string) {
  const order = orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "awaiting_chef") throw new Error(`This order is ${order.status.replace("_", " ")}, not waiting for the chef`);
  const decision: ChefDecision = { outcome, appliedSwaps: outcome === "approved_with_changes" ? appliedSwaps : [], reason: reason.trim(), decidedAt: new Date().toISOString() };

  if (outcome === "declined") {
    await voidHold(order);
    order.status = "voided";
    order.decision = decision;
    orders.save(order);
    log(order, "voided", `Chef declined${decision.reason ? `: "${decision.reason}"` : ""}. Authorization ${order.authorizationId} voided, the diner is not charged.`);
    return order;
  }

  const amount = finalAmount(order, decision.appliedSwaps);
  const changes = decision.appliedSwaps
    .map((a) => {
      const item = order.items.find((i) => i.id === a.itemId)!;
      return `${item.dishName}: ${dishes.get(item.dishId)?.swaps.find((s) => s.id === a.swapId)?.label}`;
    })
    .join("; ");
  const note =
    outcome === "approved_with_changes"
      ? `Chef checked your allergies and changed: ${changes}.${amount < order.authorizedMinor ? ` You pay ${fmt(amount)} instead of ${fmt(order.authorizedMinor)}.` : ""}`
      : "Chef checked the allergies on your order and confirmed it.";
  const cap = await captureHold(order, amount, note);
  order.status = "captured";
  order.capturedMinor = amount;
  order.captureId = cap.captureId;
  order.decision = decision;
  orders.save(order);
  log(
    order,
    "captured",
    `Chef ${outcome === "approved" ? "approved" : `approved with changes (${changes})`}. Captured ${fmt(amount)} of the ${fmt(order.authorizedMinor)} hold with final_capture=true (capture ${cap.captureId}).`,
    { note, amount },
  );
  return order;
}

export async function expireStale() {
  const now = Date.now();
  for (const r of [restaurants.first()].filter(Boolean)) {
    for (const o of orders.list(r!.id, 100)) {
      if (o.status !== "awaiting_chef") continue;
      const authorizedAt = events.forOrder(o.id).find((e) => e.type === "authorized")?.at;
      if (!authorizedAt || now - Date.parse(authorizedAt) < r!.signoffMinutes * 60_000) continue;
      try {
        await voidHold(o);
        o.status = "expired";
        orders.save(o);
        log(o, "expired", `No answer from the kitchen within ${r!.signoffMinutes} minutes. Hold voided automatically, the diner is not charged.`);
      } catch (e) {
        console.error("auto-void failed", e);
      }
    }
  }
}

export async function refund(orderId: string, amountMinor: number, reason: string) {
  const order = orders.get(orderId);
  if (!order || order.status !== "captured" || !order.captureId) throw new Error("Only captured orders can be refunded");
  const r = await refundCapture(order, amountMinor, reason);
  order.status = amountMinor >= (order.capturedMinor ?? 0) ? "refunded" : "captured";
  orders.save(order);
  log(order, "refunded", `Refunded ${fmt(amountMinor)}${reason ? `: ${reason}` : ""} (refund ${r.refundId}).`);
  return order;
}

/** Message for the diner in their language, used on the status page and by agents polling order_status. */
export async function dinerMessage(order: Order) {
  let en = "";
  switch (order.status) {
    case "awaiting_payment":
      en = "Approve the payment in PayPal. It is only a hold: you are charged after the chef confirms your allergies.";
      break;
    case "awaiting_chef":
      en = "PayPal is holding the money. The chef is reading your allergies now.";
      break;
    case "captured":
      en =
        order.decision?.outcome === "approved_with_changes"
          ? `The chef confirmed your order with changes: ${order.decision.appliedSwaps.map((a) => dishes.get(order.items.find((i) => i.id === a.itemId)!.dishId)?.swaps.find((s) => s.id === a.swapId)?.label).join("; ")}. You paid £${((order.capturedMinor ?? 0) / 100).toFixed(2)}.${order.decision.reason ? ` Chef's note: ${order.decision.reason}` : ""}`
          : `The chef confirmed your order. You paid £${((order.capturedMinor ?? 0) / 100).toFixed(2)}.${order.decision?.reason ? ` Chef's note: ${order.decision.reason}` : ""}`;
      break;
    case "voided":
      en = `The chef could not make this order safely for your party${order.decision?.reason ? `: ${order.decision.reason}` : ""}. The hold was released and you were not charged.`;
      break;
    case "expired":
      en = "The kitchen did not answer in time, so the hold was released. You were not charged.";
      break;
    case "refunded":
      en = "Your payment was refunded.";
      break;
    default:
      en = "Something went wrong with this order. You were not charged.";
  }
  return translate(en, order.language);
}
