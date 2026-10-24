"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { allergenLabel } from "@/lib/allergens";
import type { Dish, Order, OrderEvent, Restaurant } from "@/lib/types";
import { Brand, gbp, StatusBadge } from "@/components/ui";

const STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "held", label: "PayPal holds the money" },
  { key: "chef", label: "Chef checks the allergies" },
  { key: "done", label: "Charged, or released" },
];

function stepIndex(o: Order) {
  if (o.status === "awaiting_payment") return 0;
  if (o.status === "awaiting_chef") return 2;
  return 3;
}

export default function OrderStatusView({ initial, restaurant, menu }: { initial: Order; restaurant: Restaurant; menu: Dish[] }) {
  const [order, setOrder] = useState(initial);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${initial.id}?message=1`, { cache: "no-store" });
    const data = await res.json();
    setOrder(data.order);
    setEvents(data.events);
    setMessage(data.message);
  }, [initial.id]);

  useEffect(() => {
    load();
    const es = new EventSource(`/api/stream?order=${initial.id}`);
    es.onmessage = () => load();
    return () => es.close();
  }, [load, initial.id]);

  const idx = stepIndex(order);
  const final = order.status === "captured" ? "good" : ["voided", "expired", "failed"].includes(order.status) ? "released" : null;
  const swapLabel = (itemId: string, swapId: string) => menu.find((d) => d.id === order.items.find((i) => i.id === itemId)?.dishId)?.swaps.find((s) => s.id === swapId)?.label;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Brand sub={restaurant.name} />
        <StatusBadge status={order.status} />
      </header>

      <div className="rounded-3xl border border-line bg-paper p-6 shadow-sm sm:p-8">
        <div className="text-xs uppercase tracking-[0.14em] text-muted">
          Order {order.id.slice(-6).toUpperCase()} · {order.channel === "agent" ? `placed by ${order.agentName}` : "placed on the web"} for {order.dinerName}
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">
          {order.status === "awaiting_payment" && "Approve the hold in PayPal"}
          {order.status === "awaiting_chef" && "The chef is checking your allergies"}
          {order.status === "captured" && (order.decision?.outcome === "approved_with_changes" ? "Confirmed, with changes" : "Confirmed by the chef")}
          {order.status === "voided" && "The chef couldn't make this safely"}
          {order.status === "expired" && "No answer in time, hold released"}
          {order.status === "refunded" && "Refunded"}
          {order.status === "failed" && "Payment problem"}
        </h1>
        {message && <p className="mt-3 text-lg leading-relaxed text-ink/80">{message}</p>}

        {order.status === "awaiting_payment" && order.approvalUrl && (
          <a href={order.approvalUrl} className="mt-5 inline-block rounded-full bg-pp-gold px-6 py-3 font-semibold text-pp-blue">
            Open PayPal to approve the hold
          </a>
        )}

        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const state = i < idx || (i === 3 && final) ? "done" : i === idx ? "now" : "todo";
            return (
              <li key={s.key} className="flex flex-col gap-2">
                <div className={`h-1.5 rounded-full ${state === "done" ? (i === 3 && final === "released" ? "bg-muted" : "bg-basil") : state === "now" ? "animate-pulse bg-saffron" : "bg-line"}`} />
                <span className={`text-xs ${state === "todo" ? "text-muted" : "font-medium"}`}>{i === 3 && final === "released" ? "Released, not charged" : s.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Money label="Held by PayPal" value={order.status === "awaiting_payment" ? "–" : gbp(order.authorizedMinor)} />
          <Money label="Charged" value={order.status === "captured" ? gbp(order.capturedMinor) : order.status === "awaiting_chef" ? "Not yet" : "£0.00"} strong={order.status === "captured"} />
          <Money label="Released to you" value={order.status === "captured" ? gbp(order.authorizedMinor - (order.capturedMinor ?? 0)) : final === "released" ? gbp(order.authorizedMinor) : "–"} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Your order</h2>
          <ul className="space-y-3 text-sm">
            {order.items.map((i) => {
              const d = menu.find((x) => x.id === i.dishId);
              const sw = order.decision?.appliedSwaps.find((a) => a.itemId === i.id);
              return (
                <li key={i.id}>
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {i.qty > 1 && `${i.qty}× `}
                      {i.dishName} <span className="font-normal text-muted">for {i.forPerson}</span>
                    </span>
                    <span>{gbp(i.unitPriceMinor * i.qty)}</span>
                  </div>
                  {sw && <div className="mt-0.5 text-basil">✓ Chef: {swapLabel(sw.itemId, sw.swapId)}</div>}
                  {d && (
                    <div className="mt-0.5 text-xs text-muted">
                      Contains {d.contains.map(allergenLabel).join(", ") || "none of the 14 allergens"}
                      {d.mayContain.length > 0 && `; may contain ${d.mayContain.map(allergenLabel).join(", ")}`}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {order.status === "captured" && (
            <Link href={`/o/${order.id}/record`} className="mt-4 inline-block text-sm font-medium text-basil">
              Open the signed allergen record →
            </Link>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">What happened</h2>
          <ol className="space-y-3 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-basil" />
                <div>
                  <div className="text-xs text-muted">{new Date(e.at).toLocaleTimeString()}</div>
                  <div>{e.message}</div>
                </div>
              </li>
            ))}
          </ol>
          {order.paypalOrderId && (
            <div className="mt-4 space-y-0.5 rounded-lg bg-cream p-3 font-mono text-[11px] text-muted">
              <div>PayPal order: {order.paypalOrderId}</div>
              {order.authorizationId && <div>Authorization: {order.authorizationId}</div>}
              {order.captureId && <div>Capture: {order.captureId}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-2xl ${strong ? "font-semibold text-basil" : ""}`}>{value}</div>
    </div>
  );
}
