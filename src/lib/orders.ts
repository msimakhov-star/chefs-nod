import { dishes, events, newId, orders, restaurants } from "./db";
import { allergenStatement, allergiesFor, findConflicts, mergeParty, risk } from "./conflicts";
import { cleanLanguage, kitchenCheck, rulesCheck, translate } from "./agents";
import { authorizeHeldOrder, captureHold, createHeldOrder, createTestCardHold, refundCapture, voidHold, PayPalFailure } from "./paypal";
import { publish } from "./bus";
import type { ChefDecision, Order, OrderItem, Person } from "./types";
import { ALLERGEN_IDS, type AllergenId } from "./allergens";

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

// One money action per order at a time, so a double tap or a timeout firing mid-tap cannot race.
// ponytail: in-process lock, fine for one server; use a database lock if this ever runs on several.
const g = globalThis as unknown as { __orderLocks?: Set<string> };
const locks = g.__orderLocks ?? (g.__orderLocks = new Set<string>());
async function withLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(orderId)) throw new Error("This order is already being processed");
  locks.add(orderId);
  try {
    return await fn();
  } finally {
    locks.delete(orderId);
  }
}

const UNPAID_MINUTES = 30;

// A PayPal call can take seconds while the AI refines the ticket, so a save never writes an older ticket back.
const saveOrder = (o: Order) => {
  const current = orders.get(o.id);
  if (current) o.check = current.check;
  orders.save(o);
};

function log(o: Order, type: string, message: string, data: unknown = null) {
  events.add(o.id, type, message, data);
  publish(o.restaurantId, o.id, type);
}

export async function placeOrder(input: PlaceOrderInput, baseUrl: string) {
  const restaurant = restaurants.bySlug(input.restaurantSlug);
  if (!restaurant) throw new Error(`Unknown restaurant ${input.restaurantSlug}`);
  if (!Array.isArray(input.items) || !input.items.length) throw new Error("The basket is empty");
  if (!Array.isArray(input.party)) throw new Error("Say who is eating");
  const menu = dishes.list(restaurant.id);
  const dishById = (id: string) => menu.find((d) => d.id === id) ?? null;

  const party: Person[] = mergeParty(
    input.party.map((p) => ({
      name: p.name.trim() || "Guest",
      allergies: (p.allergies ?? []).map((a) => {
        const id = String(a).trim().toLowerCase() as AllergenId;
        // Silently dropping "peanut" would turn an allergy order into a standard one.
        if (!ALLERGEN_IDS.includes(id)) throw new Error(`Unknown allergen "${a}". Use one of: ${ALLERGEN_IDS.join(", ")}`);
        return id;
      }),
      notes: p.notes?.trim() || "",
    })),
  );
  const items: OrderItem[] = input.items.map((i) => {
    const d = dishById(i.dishId);
    if (!d || !d.confirmed || !d.available) throw new Error(`Dish ${i.dishId} is not on the confirmed menu`);
    // An item for a name nobody declared takes every allergy in the party, and the kitchen is told why.
    if (!party.some((p) => p.name.trim().toLowerCase() === i.forPerson.trim().toLowerCase())) {
      const all = [...allergiesFor(party, i.forPerson)];
      party.push({ name: i.forPerson.trim() || "Guest", allergies: all, notes: all.length ? "Not named when allergies were declared, so every allergy in this order applies." : "" });
    }
    const qty = Number(i.qty);
    return { id: newId("it"), dishId: d.id, dishName: d.name, forPerson: i.forPerson, qty: Number.isFinite(qty) ? Math.max(1, Math.min(20, Math.round(qty))) : 1, unitPriceMinor: d.priceMinor };
  });

  const now = new Date().toISOString();
  const order: Order = {
    id: newId("ord"),
    restaurantId: restaurant.id,
    channel: input.channel,
    agentName: input.agentName ?? null,
    dinerName: String(input.dinerName ?? "").trim() || party[0]?.name || "Guest",
    language: cleanLanguage(input.language),
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
  // The rules-only ticket is instant; the AI-written questions replace it in the background.
  const riskLevel = risk(conflicts, party);
  order.check = rulesCheck(order, conflicts, statement, riskLevel);
  const refine = () =>
    kitchenCheck(order, conflicts, menu, restaurant, statement, riskLevel).then((check) => {
      const latest = orders.get(order.id);
      if (!latest || !["awaiting_payment", "awaiting_chef"].includes(latest.status)) return;
      latest.check = check;
      orders.save(latest);
      publish(latest.restaurantId, latest.id, "check");
    });

  if (input.channel === "replay") {
    const pp = await createTestCardHold(order, restaurant);
    order.paypalOrderId = pp.paypalOrderId;
    order.authorizationId = pp.authorizationId;
    order.status = "awaiting_chef";
    saveOrder(order);
    log(order, "created", `Replay order from ${order.dinerName} for ${fmt(order.authorizedMinor)} (PayPal sandbox test card).`, { conflicts, statement });
    log(order, "authorized", `PayPal is holding ${fmt(order.authorizedMinor)} (authorization ${pp.authorizationId}). Waiting for the chef.`);
    void refine().catch((e) => console.error("kitchen check refine failed", e));
    return order;
  }

  const pp = await createHeldOrder(order, restaurant, baseUrl);
  order.paypalOrderId = pp.paypalOrderId;
  order.approvalUrl = pp.approvalUrl;
  saveOrder(order);
  log(order, "created", `${order.channel === "agent" ? `${order.agentName ?? "An AI agent"} placed` : `${order.dinerName} placed`} an order for ${fmt(order.authorizedMinor)}. Nothing is charged yet.`, { conflicts, statement });
  void refine().catch((e) => console.error("kitchen check refine failed", e));
  return order;
}

/** Diner approved in PayPal. Place the hold and send the ticket to the kitchen. */
export async function onPayerApproved(orderId: string) {
  return withLock(orderId, () => placeHold(orderId));
}

async function placeHold(orderId: string) {
  const order = orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "awaiting_payment") return order;
  try {
    const auth = await authorizeHeldOrder(order);
    order.authorizationId = auth.authorizationId;
    order.status = "awaiting_chef";
    saveOrder(order);
    log(order, "authorized", `PayPal is holding ${fmt(order.authorizedMinor)}. Waiting for the chef.`, auth);
  } catch (e) {
    // Not approved yet (e.g. the diner came back without approving): keep waiting instead of failing the order.
    const issue = e instanceof PayPalFailure ? JSON.stringify(e.detail ?? "") : "";
    if (/ORDER_NOT_APPROVED|PAYER_ACTION_REQUIRED|INSTRUMENT_DECLINED/.test(issue)) {
      log(order, "info", /INSTRUMENT_DECLINED/.test(issue) ? "PayPal declined that payment method. The diner can approve again with another. Nothing is held." : "PayPal says the diner has not approved yet. Nothing is held.");
      return order;
    }
    // No clear answer from PayPal: the hold may exist, so keep the order and let the retry with the same request id settle it.
    if (!(e instanceof PayPalFailure) || e.status >= 500) {
      log(order, "unclear", "PayPal did not give a clear answer, so this will be tried again.");
      throw e;
    }
    order.status = "failed";
    saveOrder(order);
    log(order, "error", e instanceof PayPalFailure ? `${e.message}${e.debugId ? ` (debug id ${e.debugId})` : ""}` : String(e));
    throw e;
  }
  return order;
}

export function finalAmount(order: Order, appliedSwaps: ChefDecision["appliedSwaps"]) {
  let total = order.authorizedMinor;
  const parts = new Set<string>();
  for (const a of appliedSwaps) {
    const item = order.items.find((i) => i.id === a.itemId);
    const swap = item && dishes.get(item.dishId)?.swaps.find((s) => s.id === a.swapId);
    if (!item || !swap) throw new Error(`Unknown swap ${a.swapId}`);
    if (swap.priceDeltaMinor > 0) throw new Error(`"${swap.label}" costs more, so the diner would need to approve again. Decline with a note instead.`);
    const part = `${a.itemId}:${swap.replaces}`;
    if (parts.has(part)) throw new Error(`Only one change per part of a dish: "${swap.label}" clashes with another change`);
    parts.add(part);
    total += swap.priceDeltaMinor * item.qty;
  }
  if (total <= 0) throw new Error("These changes leave nothing to charge. Decline the order instead.");
  return total;
}

export function chefDecides(orderId: string, outcome: ChefDecision["outcome"], appliedSwaps: ChefDecision["appliedSwaps"], reason: string) {
  return withLock(orderId, () => decide(orderId, outcome, appliedSwaps, reason));
}

async function decide(orderId: string, outcome: ChefDecision["outcome"], appliedSwaps: ChefDecision["appliedSwaps"], reason: string) {
  const order = orders.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "awaiting_chef") throw new Error(`This order is ${order.status.replace("_", " ")}, not waiting for the chef`);
  const decision: ChefDecision = { outcome, appliedSwaps: outcome === "approved_with_changes" ? appliedSwaps : [], reason: reason.trim().replace(/\.+$/, ""), decidedAt: new Date().toISOString() };
  if (order.pendingCapture) {
    // PayPal may already have taken this money. Only the same decision can be sent again.
    const same = (x: ChefDecision) => JSON.stringify([x.outcome, [...x.appliedSwaps].map((a) => `${a.itemId}:${a.swapId}`).sort()]);
    if (same(order.pendingCapture.decision) !== same(decision)) throw new Error("PayPal is still confirming the charge for the first decision, so it can't be changed yet.");
    return settleCapture(order);
  }

  if (outcome === "declined") {
    await voidHold(order);
    order.status = "voided";
    order.decision = decision;
    saveOrder(order);
    log(order, "voided", `Chef declined${decision.reason ? `: "${decision.reason}"` : ""}. The hold was released and nothing was charged.`);
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
  order.pendingCapture = { amountMinor: amount, note, changes, decision };
  saveOrder(order);
  return settleCapture(order);
}

/** Sends the capture recorded in pendingCapture. A lost response keeps it, so the same request id can be retried and the money is never lost track of. */
async function settleCapture(order: Order) {
  const p = order.pendingCapture!;
  try {
    const cap = await captureHold(order, p.amountMinor, p.note);
    return recordCapture(order, cap.captureId, cap.capturedMinor, cap.status);
  } catch (e) {
    if (e instanceof PayPalFailure && e.status < 500) {
      delete order.pendingCapture; // a definite no: the chef can decide again
      saveOrder(order);
    }
    throw e;
  }
}

function recordCapture(order: Order, captureId: string, capturedMinor: number, status: string) {
  const { decision, changes } = order.pendingCapture!;
  delete order.pendingCapture;
  order.status = "captured";
  order.capturedMinor = capturedMinor;
  order.captureStatus = status;
  order.captureId = captureId;
  order.decision = decision;
  saveOrder(order);
  log(
    order,
    "captured",
    `Chef ${decision.outcome === "approved" ? "approved" : `approved with changes (${changes})`}. ${fmt(capturedMinor)} charged${capturedMinor < order.authorizedMinor ? `, ${fmt(order.authorizedMinor - capturedMinor)} released` : ""}.`,
    { amount: capturedMinor },
  );
  return order;
}

type PayPalResource = { id?: string; status?: string; amount?: { value?: string }; seller_payable_breakdown?: { total_refunded_amount?: { value?: string } } };

/** A verified PayPal webhook. PayPal is the source of truth, including for things done outside this app. Safe to receive twice. */
export function onPayPalEvent(orderId: string, type: string, hookId: string, summary: string | undefined, resource: PayPalResource) {
  return withLock(orderId, async () => {
    const order = orders.get(orderId);
    if (!order || events.forOrder(orderId).some((e) => (e.data as { hookId?: string } | null)?.hookId === hookId)) return;
    const change = (status: Order["status"], message: string) => {
      order.status = status;
      saveOrder(order);
      log(order, "paypal", message);
    };
    const captureEvent = type === "PAYMENT.CAPTURE.COMPLETED" || type === "PAYMENT.CAPTURE.PENDING";
    if (type === "CHECKOUT.ORDER.APPROVED") {
      await placeHold(orderId); // the diner may never come back to the return URL. A throw answers 500, so PayPal retries.
    } else if (captureEvent && order.status === "awaiting_chef" && order.pendingCapture && resource.id) {
      // The capture's response was lost, but PayPal took the money. Adopt what PayPal says happened.
      const value = Number(resource.amount?.value);
      recordCapture(order, resource.id, Number.isFinite(value) ? Math.round(value * 100) : order.pendingCapture.amountMinor, type.endsWith("PENDING") ? "PENDING" : "COMPLETED");
    } else if (type === "PAYMENT.AUTHORIZATION.VOIDED" && order.status === "awaiting_chef") {
      change("voided", "PayPal says this hold was voided outside Chef's Nod. The diner is not charged.");
    } else if (order.status === "captured" && type === "PAYMENT.CAPTURE.PENDING" && order.captureStatus !== "COMPLETED") {
      order.captureStatus = "PENDING";
      saveOrder(order);
    } else if (order.status === "captured" && type === "PAYMENT.CAPTURE.COMPLETED") {
      order.captureStatus = "COMPLETED";
      saveOrder(order);
    } else if (order.status === "captured" && type === "PAYMENT.CAPTURE.DECLINED") {
      order.capturedMinor = null;
      change("failed", "PayPal declined the capture. The diner was not charged.");
    } else if ((order.status === "captured" || order.status === "refunded") && type === "PAYMENT.CAPTURE.REVERSED") {
      order.refundedMinor = order.capturedMinor ?? 0;
      change("refunded", "PayPal reversed this payment.");
    } else if (order.status === "captured" && type === "PAYMENT.CAPTURE.REFUNDED") {
      const total = Math.round(Number(resource.seller_payable_breakdown?.total_refunded_amount?.value) * 100);
      if (total > (order.refundedMinor ?? 0)) {
        order.refundedMinor = total;
        if (total >= (order.capturedMinor ?? 0)) order.status = "refunded";
        saveOrder(order);
      }
    }
    // Logged last: a retried delivery of an event that failed above must run again.
    log(orders.get(orderId)!, "webhook", `PayPal webhook ${type} verified${summary ? `: ${summary}` : ""}`, { id: resource.id, hookId });
  });
}

export async function expireStale() {
  const now = Date.now();
  const r = restaurants.first();
  if (!r) return;
  for (const { id, status } of orders.list(r.id, 200)) {
    if (status !== "awaiting_chef" && status !== "awaiting_payment") continue;
    if (locks.has(id)) continue;
    await withLock(id, async () => {
      const o = orders.get(id)!;
      if (o.status === "awaiting_payment") {
        if (now - Date.parse(o.createdAt) < UNPAID_MINUTES * 60_000) return;
        if (events.forOrder(o.id).some((e) => e.type === "unclear")) {
          // PayPal may have placed a hold it never told us about. The same request id returns it, so it can be released.
          try {
            const auth = await authorizeHeldOrder(o);
            await voidHold({ ...o, authorizationId: auth.authorizationId });
          } catch (e) {
            if (!(e instanceof PayPalFailure) || e.status >= 500) throw e; // still unclear: try again on the next sweep
          }
        }
        o.status = "expired";
        saveOrder(o);
        log(o, "expired", `Not approved in PayPal within ${UNPAID_MINUTES} minutes. Nothing was held.`);
        return;
      }
      if (o.status !== "awaiting_chef") return;
      if (o.pendingCapture) return void (await settleCapture(o));
      const authorizedAt = events.forOrder(o.id).find((e) => e.type === "authorized")?.at;
      if (!authorizedAt || now - Date.parse(authorizedAt) < r.signoffMinutes * 60_000) return;
      try {
        await voidHold(o);
      } catch (e) {
        if (!(e instanceof PayPalFailure) || e.status >= 500) throw e;
        o.status = "failed"; // a definite refusal: stop retrying and show it, instead of voiding forever
        saveOrder(o);
        log(o, "error", `PayPal refused to release this hold: ${e.message}`);
        return;
      }
      o.status = "expired";
      saveOrder(o);
      log(o, "expired", `No answer from the kitchen within ${r.signoffMinutes} minutes. Hold voided automatically, the diner is not charged.`);
    }).catch((e) => console.error("auto-release failed", id, e));
  }
}

export function refund(orderId: string, amountMinor: number, reason: string) {
  return withLock(orderId, async () => {
    const order = orders.get(orderId);
    if (!order || order.status !== "captured" || !order.captureId) throw new Error("Only captured orders can be refunded");
    const already = order.refundedMinor ?? 0;
    const left = (order.capturedMinor ?? 0) - already;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("Enter a refund amount above zero");
    if (amountMinor > left) throw new Error(`Only ${fmt(left)} is left to refund`);
    const r = await refundCapture(order, amountMinor, reason, already);
    order.refundedMinor = already + amountMinor;
    if (amountMinor === left) order.status = "refunded";
    saveOrder(order);
    log(order, "refunded", `Refunded ${fmt(amountMinor)}${reason ? `: ${reason}` : ""} (refund ${r.refundId}).`);
    return order;
  });
}

/** Message for the diner in their language, used on the status page and by agents polling order_status. */
export async function dinerMessage(order: Order) {
  let en = "";
  switch (order.status) {
    case "awaiting_payment":
      en = "Approve the payment in PayPal. It is only a hold: you are charged after the chef confirms your allergies.";
      break;
    case "awaiting_chef":
      en = order.pendingCapture ? "The chef has confirmed your order. PayPal is confirming the charge." : "PayPal is holding the money. The chef is reading your allergies now.";
      break;
    case "captured":
      if (order.captureStatus === "PENDING") {
        en = `The chef confirmed your order. PayPal is still processing the £${((order.capturedMinor ?? 0) / 100).toFixed(2)} charge.`;
        break;
      }
      en =
        order.decision?.outcome === "approved_with_changes"
          ? `The chef confirmed your order with changes: ${order.decision.appliedSwaps.map((a) => dishes.get(order.items.find((i) => i.id === a.itemId)!.dishId)?.swaps.find((s) => s.id === a.swapId)?.label).join("; ")}. You paid £${((order.capturedMinor ?? 0) / 100).toFixed(2)}.${order.decision.reason ? ` Chef's note: ${order.decision.reason}.` : ""}`
          : `The chef confirmed your order. You paid £${((order.capturedMinor ?? 0) / 100).toFixed(2)}.${order.decision?.reason ? ` Chef's note: ${order.decision.reason}.` : ""}`;
      break;
    case "voided":
      en = `The chef could not confirm this order for your party${order.decision?.reason ? `: ${order.decision.reason}` : ""}. The hold was released and you were not charged.`;
      break;
    case "expired":
      en = order.authorizationId ? "The kitchen did not answer in time, so the hold was released. You were not charged." : "This order was not approved in PayPal in time, so it has expired. You were not charged.";
      break;
    case "refunded":
      en = "Your payment was refunded.";
      break;
    default:
      en = "Something went wrong with this order. You were not charged.";
  }
  return translate(en, order.language);
}
