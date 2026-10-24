"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { allergenLabel } from "@/lib/allergens";
import { allergensAfter, sourcesOf } from "@/lib/dish";
import type { Dish, Order, Restaurant } from "@/lib/types";
import { Logo } from "@/components/ui";

type KOrder = Order & { authorizedAt: string | null };

const DECLINE_REASONS = ["Shared fryer, can't rule out cross-contact", "Can't guarantee no cross-contact for this allergy", "Ingredient out of stock", "Kitchen too busy to handle safely right now"];

const gbp = (m: number | null) => (m == null ? "–" : `£${(m / 100).toFixed(2)}`);

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch {}
}

export default function KitchenBoard({ restaurant, menu }: { restaurant: Restaurant; menu: Dish[] }) {
  const [orders, setOrders] = useState<KOrder[]>([]);
  const [signoffMinutes, setSignoffMinutes] = useState(restaurant.signoffMinutes);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen/orders", { cache: "no-store" });
    const data = await res.json();
    const list: KOrder[] = data.orders;
    setSignoffMinutes(data.signoffMinutes);
    const waiting = list.filter((o) => o.status === "awaiting_chef").map((o) => o.id);
    const fresh = waiting.filter((id) => !known.current.has(id));
    if (!first.current && fresh.length && sound) chime();
    waiting.forEach((id) => known.current.add(id));
    first.current = false;
    setOrders(list);
  }, [sound]);

  useEffect(() => {
    load();
    const es = new EventSource(`/api/stream?restaurant=${restaurant.id}`);
    es.onmessage = () => load();
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const expire = setInterval(() => fetch("/api/kitchen/tick", { method: "POST" }), 30000);
    return () => {
      es.close();
      clearInterval(tick);
      clearInterval(expire);
    };
  }, [load, restaurant.id]);

  const waiting = orders.filter((o) => o.status === "awaiting_chef").sort((a, b) => (a.authorizedAt ?? "").localeCompare(b.authorizedAt ?? ""));
  const pending = orders.filter((o) => o.status === "awaiting_payment");
  const done = orders.filter((o) => ["captured", "voided", "expired", "refunded", "failed"].includes(o.status)).slice(0, 12);
  const held = waiting.reduce((s, o) => s + o.authorizedMinor, 0);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <div>
            <div className="font-display text-xl font-semibold">Kitchen · {restaurant.name}</div>
            <div className="text-xs text-white/65">Allergy orders wait here with the money held in PayPal. Nothing is charged until you nod.</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Stat label="Need your nod" value={String(waiting.length)} hot={waiting.length > 0} />
          <Stat label="Held in PayPal" value={gbp(held)} />
          <button onClick={() => setSound((s) => !s)} className={`rounded-full border px-3 py-1.5 text-xs ${sound ? "border-saffron text-saffron" : "border-white/20 text-white/60"}`}>
            {sound ? "🔔 Sound on" : "🔕 Sound off"}
          </button>
          <Link href="/owner" className="text-xs text-white/60 hover:text-white">
            Owner view →
          </Link>
        </div>
      </header>

      <div className="grid flex-1 gap-6 p-6 xl:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-saffron">Needs your nod</h2>
          {waiting.length === 0 ? (
            <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/15 text-white/60">No orders waiting. New allergy orders appear here instantly.</div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {waiting.map((o) => (
                <Ticket key={o.id} order={o} menu={menu} now={now} signoffMinutes={signoffMinutes} onDone={load} />
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/65">Waiting for PayPal approval</h2>
            <div className="space-y-2">
              {pending.length === 0 && <div className="text-sm text-white/55">None</div>}
              {pending.slice(0, 6).map((o) => (
                <div key={o.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span>{o.dinerName}</span>
                    <span className="text-white/60">{gbp(o.authorizedMinor)}</span>
                  </div>
                  <div className="text-xs text-white/60">{o.channel === "agent" ? `via ${o.agentName}` : "web order"} · diner hasn&rsquo;t approved yet</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-white/65">Recently decided</h2>
            <div className="space-y-2">
              {done.length === 0 && <div className="text-sm text-white/55">None yet</div>}
              {done.map((o) => (
                <div key={o.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span>{o.dinerName}</span>
                    <span className={o.status === "captured" ? "text-[#7fd1a0]" : "text-white/65"}>{o.status === "captured" ? `charged ${gbp(o.capturedMinor)}` : o.status === "expired" ? "expired, released" : o.status === "voided" ? "declined, released" : o.status}</span>
                  </div>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{o.decision?.outcome === "approved_with_changes" ? `changed · held ${gbp(o.authorizedMinor)}` : o.channel === "agent" ? `via ${o.agentName}` : ""}</span>
                    {o.status === "captured" && (
                      <a href={`/o/${o.id}/record`} target="_blank" className="underline-offset-2 hover:text-white hover:underline">
                        Print bag record
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="text-right">
      <div className={`font-display text-2xl font-semibold ${hot ? "text-saffron" : ""}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/60">{label}</div>
    </div>
  );
}

function Ticket({ order, menu, now, signoffMinutes, onDone }: { order: KOrder; menu: Dish[]; now: number; signoffMinutes: number; onDone: () => void }) {
  const [swaps, setSwaps] = useState<Record<string, string[]>>({}); // itemId -> swapIds
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dish = (id: string) => menu.find((d) => d.id === id);
  const allergiesOf = (name: string) => order.party.find((p) => p.name.toLowerCase() === name.toLowerCase())?.allergies ?? [];
  const delta = Object.entries(swaps).reduce((s, [itemId, ids]) => {
    const it = order.items.find((i) => i.id === itemId)!;
    return s + ids.reduce((t, id) => t + (dish(it.dishId)?.swaps.find((w) => w.id === id)?.priceDeltaMinor ?? 0), 0) * it.qty;
  }, 0);
  const newTotal = order.authorizedMinor + delta;
  const changed = Object.values(swaps).some((l) => l.length > 0);
  const stillContains = order.items
    .map((it) => {
      const d = dish(it.dishId);
      const allergies = allergiesOf(it.forPerson);
      const left = d ? allergensAfter(d, swaps[it.id] ?? []).filter((a) => allergies.includes(a)) : [];
      return { it, d, left };
    })
    .filter((x) => x.left.length > 0);
  const deadline = order.authorizedAt ? Date.parse(order.authorizedAt) + signoffMinutes * 60_000 : null;
  const left = deadline ? Math.max(0, Math.floor((deadline - now) / 1000)) : null;
  const risk = order.check?.risk ?? "check";

  async function decide(outcome: "approved" | "approved_with_changes" | "declined") {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/orders/${order.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, appliedSwaps: Object.entries(swaps).flatMap(([itemId, ids]) => ids.map((swapId) => ({ itemId, swapId }))), reason: outcome === "declined" ? reason : note }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error + (data.paypalDebugId ? ` (PayPal debug id ${data.paypalDebugId})` : ""));
    else onDone();
  }

  return (
    <article className={`arrive overflow-hidden rounded-2xl bg-[#1d1a17] ring-1 ${risk === "high" ? "ring-chili/70" : risk === "check" ? "ring-saffron/60" : "ring-white/10"}`}>
      <div className={`flex items-start justify-between gap-3 px-5 py-4 ${risk === "high" ? "bg-chili/25" : risk === "check" ? "bg-saffron/15" : "bg-white/5"}`}>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/65">
            {order.channel === "agent" ? `🤖 Ordered by ${order.agentName}` : order.channel === "replay" ? "Replay order" : "Web order"} · for {order.dinerName}
          </div>
          <div className="mt-1 font-display text-xl font-semibold leading-snug">{order.check?.headline ?? "New order"}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-white/65">PayPal holds</div>
          <div className="font-display text-xl font-semibold">{gbp(order.authorizedMinor)}</div>
          {left != null && <div className={`text-xs tabular-nums ${left < 120 ? "text-[#ff8a80]" : "text-white/65"}`}>auto-release in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>}
        </div>
      </div>

      <div className="space-y-2 px-5 pt-4">
        {order.party
          .filter((p) => p.allergies.length || p.notes)
          .map((p) => (
            <div key={p.name} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">{p.name}:</span>
              {p.allergies.map((a) => (
                <span key={a} className="rounded-full bg-chili px-2 py-0.5 text-xs font-semibold text-white">
                  {allergenLabel(a)}
                </span>
              ))}
              {p.notes && <span className="text-xs text-white/60">{p.notes}</span>}
            </div>
          ))}
      </div>

      <div className="divide-y divide-white/10 px-5 py-2">
        {order.items.map((it) => {
          const d = dish(it.dishId);
          const allergies = allergiesOf(it.forPerson);
          const q = order.check?.questions.find((x) => x.itemId === it.id);
          const chosen = swaps[it.id] ?? [];
          const originalHit = d?.contains.filter((a) => allergies.includes(a)) ?? [];
          const hit = d ? allergensAfter(d, chosen).filter((a) => allergies.includes(a)) : [];
          const may = d?.mayContain.filter((a) => allergies.includes(a)) ?? [];
          return (
            <div key={it.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[15px]">
                  <span className="font-semibold">
                    {it.qty > 1 && `${it.qty}× `}
                    {it.dishName}
                  </span>
                  <span className="text-white/65"> · {it.forPerson}</span>
                </div>
                <div className="flex gap-1">
                  {hit.map((a) => (
                    <span key={a} className="rounded bg-chili/80 px-1.5 text-[11px] font-semibold" title={d ? `From: ${sourcesOf(d, a, chosen).join(", ")}` : ""}>
                      contains {allergenLabel(a)}
                    </span>
                  ))}
                  {originalHit.length > 0 && hit.length === 0 && <span className="rounded bg-[#7fd1a0] px-1.5 text-[11px] font-semibold text-black">✓ declared {originalHit.map(allergenLabel).join(", ")} removed</span>}
                  {may.map((a) => (
                    <span key={a} className="rounded bg-saffron/70 px-1.5 text-[11px] font-semibold text-black">
                      may contain {allergenLabel(a)}
                    </span>
                  ))}
                </div>
              </div>
              {q && <p className="mt-1.5 text-sm leading-relaxed text-white/80">{q.question}</p>}
              {d && hit.length > 0 && <p className="mt-1 text-xs text-[#ff8a80]">{hit.map((a) => `${allergenLabel(a)} comes from: ${sourcesOf(d, a, chosen).join(", ")}`).join(" · ")}</p>}
              {d && d.swaps.length > 0 && (q || originalHit.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.swaps.map((s) => {
                    const on = chosen.includes(s.id);
                    const costsMore = s.priceDeltaMinor > 0;
                    const suggested = q?.suggestedSwapIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        disabled={costsMore}
                        title={costsMore ? "Costs more, so the diner would need to approve again" : undefined}
                        onClick={() =>
                          setSwaps((all) => {
                            // one swap per component: picking a swap replaces any other swap on the same component
                            const others = (all[it.id] ?? []).filter((id) => id !== s.id && d.swaps.find((w) => w.id === id)?.replaces !== s.replaces);
                            return { ...all, [it.id]: on ? others : [...others, s.id] };
                          })
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#7fd1a0] bg-[#7fd1a0] font-semibold text-black" : costsMore ? "border-white/10 text-white/25 line-through" : suggested ? "border-[#7fd1a0]/70 text-[#7fd1a0]" : "border-white/20 text-white/70"}`}
                      >
                        {suggested && !on ? "✦ " : ""}
                        {s.label}
                        {s.priceDeltaMinor !== 0 && ` (${s.priceDeltaMinor > 0 ? "+" : "−"}${gbp(Math.abs(s.priceDeltaMinor))})`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        {!declining ? (
          <>
            {stillContains.length > 0 && (
              <div className="mb-3 rounded-lg bg-chili/25 px-3 py-2 text-xs leading-relaxed text-[#ffb4ab]">
                ⚠ Still contains a declared allergen: {stillContains.map((x) => `${x.it.dishName} for ${x.it.forPerson} (${x.left.map(allergenLabel).join(", ")})`).join("; ")}. Only nod if you are sure, or decline.
              </div>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note to the diner (translated for them)" className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/55 focus:border-white/30" />
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={busy} onClick={() => decide(changed ? "approved_with_changes" : "approved")} className="flex-1 rounded-xl bg-[#7fd1a0] px-4 py-3.5 text-base font-bold text-black hover:brightness-105 disabled:opacity-50">
                {busy ? "Talking to PayPal…" : changed ? `Nod with changes · charge ${gbp(newTotal)}` : `Nod · charge ${gbp(order.authorizedMinor)}`}
              </button>
              <button disabled={busy} onClick={() => setDeclining(true)} className="rounded-xl border border-chili/60 px-4 py-3.5 text-sm font-semibold text-[#ff8a80] hover:bg-chili/20">
                Can&rsquo;t do it
              </button>
            </div>
            {changed && delta < 0 && <div className="mt-2 text-xs text-white/65">PayPal captures {gbp(newTotal)} of the {gbp(order.authorizedMinor)} hold and closes it. The diner sees the change in their PayPal receipt.</div>}
          </>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Why? The diner sees this, translated. The hold is released.</div>
            <div className="flex flex-wrap gap-1.5">
              {DECLINE_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-xs ${reason === r ? "border-[#ff8a80] bg-[#ff8a80] text-black" : "border-white/20 text-white/70"}`}>
                  {r}
                </button>
              ))}
            </div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none" />
            <div className="flex gap-2">
              <button disabled={busy || !reason.trim()} onClick={() => decide("declined")} className="flex-1 rounded-xl bg-chili px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                {busy ? "Releasing the hold…" : "Decline and release the hold"}
              </button>
              <button onClick={() => setDeclining(false)} className="rounded-xl border border-white/20 px-4 py-3 text-sm">
                Back
              </button>
            </div>
          </div>
        )}
        {error && <div className="mt-2 rounded-lg bg-chili/30 px-3 py-2 text-xs">{error}</div>}
      </div>
    </article>
  );
}
