"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { ALLERGENS, allergenLabel, type AllergenId } from "@/lib/allergens";
import type { Dish, Order, Restaurant } from "@/lib/types";
import { AllergenChip, Brand, gbp, StatusBadge } from "@/components/ui";

ModuleRegistry.registerModules([AllCommunityModule]);

const Analytics = dynamic(() => import("./studio/Analytics"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-paper" /> });

type OOrder = Order & { authorizedAt: string | null; webhooks: number };
type Tab = "ledger" | "analytics" | "menu" | "insights" | "settings";

const gridTheme = themeQuartz.withParams({
  fontFamily: "var(--font-inter)",
  headerBackgroundColor: "#f4efe6",
  backgroundColor: "#ffffff",
  borderColor: "#e8e0d4",
  accentColor: "#1f5a3d",
  rowHoverColor: "#fbf7f0",
  fontSize: 13,
});

export default function OwnerApp({ restaurant, initialMenu, aiName }: { restaurant: Restaurant; initialMenu: Dish[]; aiName: string }) {
  const [tab, setTab] = useState<Tab>("ledger");
  const [menu, setMenu] = useState(initialMenu);
  const [orders, setOrders] = useState<OOrder[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/orders", { cache: "no-store" });
    setOrders((await res.json()).orders);
  }, []);
  useEffect(() => {
    load();
    const es = new EventSource(`/api/stream?restaurant=${restaurant.id}`);
    es.onmessage = () => load();
    return () => es.close();
  }, [load, restaurant.id]);

  const reloadMenu = async () => setMenu((await (await fetch(`/api/menu?slug=${restaurant.slug}`)).json()).dishes);
  const drafts = menu.filter((d) => !d.confirmed).length;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <Brand sub={`Owner · ${restaurant.name}`} />
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1 text-sm">
          {(
            [
              ["ledger", "Orders & money"],
              ["analytics", "Analytics"],
              ["menu", `Menu & allergens${drafts ? ` (${drafts})` : ""}`],
              ["insights", "Ask & insights"],
              ["settings", "Kitchen settings"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-full px-4 py-1.5 ${tab === k ? "bg-basil text-white" : "text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </nav>
        <Link href="/kitchen" className="text-sm font-medium text-basil">
          Kitchen screen →
        </Link>
      </header>
      {tab === "ledger" && <Ledger orders={orders} onChange={load} />}
      {tab === "analytics" && <Analytics orders={orders} menu={menu} aiEnabled={aiName !== "not configured"} />}
      {tab === "menu" && <MenuStudio menu={menu} setMenu={setMenu} reload={reloadMenu} aiName={aiName} />}
      {tab === "insights" && <Insights orders={orders} aiName={aiName} />}
      {tab === "settings" && <Settings restaurant={restaurant} />}
    </div>
  );
}

// ---------------- Ledger ----------------

function Ledger({ orders, onChange }: { orders: OOrder[]; onChange: () => void }) {
  const [selected, setSelected] = useState<OOrder | null>(null);
  const allergy = orders.filter((o) => o.party.some((p) => p.allergies.length));
  const decided = orders.filter((o) => o.decision);
  const captured = orders.filter((o) => o.capturedMinor != null);
  const heldNow = orders.filter((o) => o.status === "awaiting_chef").reduce((s, o) => s + o.authorizedMinor, 0);
  const capturedTotal = captured.reduce((s, o) => s + (o.capturedMinor ?? 0), 0);
  const released = orders.filter((o) => o.authorizationId && ["captured", "voided", "expired", "refunded"].includes(o.status)).reduce((s, o) => s + o.authorizedMinor - (o.capturedMinor ?? 0), 0);
  const nodTimes = decided.filter((o) => o.authorizedAt).map((o) => (Date.parse(o.decision!.decidedAt) - Date.parse(o.authorizedAt!)) / 1000);
  const avgNod = nodTimes.length ? Math.round(nodTimes.reduce((a, b) => a + b, 0) / nodTimes.length) : null;

  const cols = useMemo<ColDef<OOrder>[]>(
    () => [
      { headerName: "Time", field: "createdAt", width: 110, valueFormatter: (p) => new Date(p.value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), sort: "desc" },
      { headerName: "Diner", field: "dinerName", width: 120 },
      { headerName: "Channel", width: 130, valueGetter: (p) => (p.data?.channel === "agent" ? `🤖 ${p.data.agentName}` : p.data?.channel) },
      { headerName: "Allergies", flex: 1, minWidth: 160, valueGetter: (p) => p.data?.party.flatMap((x) => x.allergies.map(allergenLabel)).join(", ") || "none" },
      { headerName: "Status", field: "status", width: 190, cellRenderer: (p: { value: Order["status"] }) => <StatusBadge status={p.value} /> },
      { headerName: "Chef", width: 150, valueGetter: (p) => (p.data?.decision ? p.data.decision.outcome.replaceAll("_", " ") : "") },
      { headerName: "Held", field: "authorizedMinor", width: 95, type: "rightAligned", valueFormatter: (p) => gbp(p.value) },
      { headerName: "Charged", field: "capturedMinor", width: 100, type: "rightAligned", valueFormatter: (p) => gbp(p.value) },
      { headerName: "Released", width: 100, type: "rightAligned", valueGetter: (p) => (p.data?.authorizationId && p.data.status !== "awaiting_chef" ? p.data.authorizedMinor - (p.data.capturedMinor ?? 0) : null), valueFormatter: (p) => gbp(p.value) },
      { headerName: "Nod time", width: 100, valueGetter: (p) => (p.data?.decision && p.data.authorizedAt ? Math.round((Date.parse(p.data.decision.decidedAt) - Date.parse(p.data.authorizedAt)) / 1000) : null), valueFormatter: (p) => (p.value == null ? "" : `${Math.floor(p.value / 60)}m ${p.value % 60}s`) },
      { headerName: "PayPal capture", field: "captureId", width: 170, cellClass: "font-mono text-xs" },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Orders" value={String(orders.length)} />
        <Kpi label="Allergy orders" value={String(allergy.length)} />
        <Kpi label="Avg time to nod" value={avgNod == null ? "–" : `${Math.floor(avgNod / 60)}m ${avgNod % 60}s`} />
        <Kpi label="Held now, awaiting chef" value={gbp(heldNow)} />
        <Kpi label="Captured" value={gbp(capturedTotal)} accent />
        <Kpi label="Released to diners" value={gbp(released)} />
      </div>
      <div className="h-[520px] overflow-hidden rounded-2xl border border-line bg-paper">
        <AgGridReact<OOrder> theme={gridTheme} rowData={orders} columnDefs={cols} getRowId={(p) => p.data.id} onRowClicked={(e) => setSelected(e.data ?? null)} animateRows rowSelection={{ mode: "singleRow", enableClickSelection: true, checkboxes: false }} />
      </div>
      {selected && <OrderDrawer order={selected} onClose={() => setSelected(null)} onChange={onChange} />}
    </div>
  );
}

function OrderDrawer({ order, onClose, onChange }: { order: OOrder; onClose: () => void; onChange: () => void }) {
  const [amount, setAmount] = useState(((order.capturedMinor ?? 0) / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  async function refund() {
    const res = await fetch(`/api/orders/${order.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountMinor: Math.round(Number(amount) * 100), reason }) });
    const d = await res.json();
    setMsg(res.ok ? "Refund sent through PayPal." : d.error);
    onChange();
  }
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-lg font-semibold">
            {order.dinerName} · {gbp(order.authorizedMinor)}
          </div>
          <div className="text-xs text-muted">
            {order.id} · PayPal order {order.paypalOrderId}
          </div>
        </div>
        <button onClick={onClose} className="text-muted">
          ✕
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href={`/o/${order.id}`} className="text-basil">
          Diner view
        </Link>
        {order.status === "captured" && (
          <Link href={`/o/${order.id}/record`} className="text-basil">
            Sign-off record
          </Link>
        )}
        <span className="text-muted">{order.webhooks} PayPal webhooks verified</span>
      </div>
      {order.status === "captured" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm">Refund</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded-lg border border-line px-2 py-1 text-sm" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the diner" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-sm" />
          <button onClick={refund} className="rounded-lg bg-ink px-3 py-1.5 text-sm text-white">
            Refund via PayPal
          </button>
        </div>
      )}
      {msg && <div className="mt-2 text-sm text-muted">{msg}</div>}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-display text-2xl font-semibold ${accent ? "text-basil" : ""}`}>{value}</div>
    </div>
  );
}

// ---------------- Menu studio ----------------

function MenuStudio({ menu, setMenu, reload, aiName }: { menu: Dish[]; setMenu: (m: Dish[]) => void; reload: () => Promise<void>; aiName: string }) {
  const [busy, setBusy] = useState<"" | "import" | "publish">("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  async function importPhoto(file: File) {
    setBusy("import");
    setMsg(`Reading the menu with ${aiName}…`);
    const fd = new FormData();
    fd.append("menu", file);
    const res = await fetch("/api/menu/import", { method: "POST", body: fd });
    const d = await res.json();
    setBusy("");
    if (!res.ok) return setMsg(d.error);
    setMsg(`${d.drafts.length} dishes drafted. Nothing is shown to diners until you confirm each one.`);
    await reload();
  }

  async function save(d: Dish) {
    const res = await fetch("/api/menu/dish", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    const j = await res.json();
    if (res.ok) setMenu(menu.map((x) => (x.id === d.id ? j.dish : x)));
  }

  async function publish() {
    setBusy("publish");
    const res = await fetch("/api/menu/publish", { method: "POST" });
    const d = await res.json();
    setBusy("");
    setMsg(res.ok ? `${d.synced.length} confirmed dishes synced to the PayPal Catalog Products API.` : d.error);
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-paper p-5 hover:border-basil ${busy === "import" ? "animate-pulse" : ""}`}>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-basil-soft text-2xl">📷</div>
          <div>
            <div className="font-medium">Import a menu photo</div>
            <div className="text-sm text-muted">{aiName} reads the dishes and drafts the 14-allergen matrix. Low-confidence rows are flagged for you.</div>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && importPhoto(e.target.files[0])} disabled={!!busy} />
        </label>
        <button onClick={publish} disabled={!!busy} className="rounded-2xl bg-basil px-5 py-4 text-sm font-medium text-white disabled:opacity-50">
          {busy === "publish" ? "Syncing…" : "Sync confirmed dishes to PayPal catalog"}
        </button>
      </div>
      <div className="-mt-2 text-sm text-muted">
        No menu to hand?{" "}
        <button
          disabled={!!busy}
          onClick={async () => {
            const blob = await (await fetch("/demo/fennel-room-menu.jpg")).blob();
            importPhoto(new File([blob], "fennel-room-menu.jpg", { type: "image/jpeg" }));
          }}
          className="font-medium text-basil underline-offset-2 hover:underline"
        >
          Import our sample menu
        </button>{" "}
        (<a href="/demo/fennel-room-menu.jpg" target="_blank" className="underline-offset-2 hover:underline">see it</a>)
        {menu.some((d) => !d.confirmed) && (
          <>
            {" · "}
            <button
              onClick={async () => {
                await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what: "drafts" }) });
                await reload();
              }}
              className="font-medium text-chili underline-offset-2 hover:underline"
            >
              Discard unconfirmed drafts
            </button>
          </>
        )}
      </div>
      {msg && <div className="rounded-xl bg-basil-soft px-4 py-3 text-sm text-basil">{msg}</div>}

      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead className="bg-[#f4efe6] text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">Dish</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Parts and their allergens</th>
              <th className="px-4 py-3">May contain</th>
              <th className="px-4 py-3">Swaps</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {menu.map((d) => (
              <tr key={d.id} className={!d.confirmed ? "bg-saffron-soft/60" : ""}>
                <td className="max-w-[260px] px-4 py-3 align-top">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted">{d.category}</div>
                  {d.paypalProductId && <div className="mt-1 font-mono text-[10px] text-pp-sky">PayPal product {d.paypalProductId}</div>}
                </td>
                <td className="px-4 py-3 align-top">{gbp(d.priceMinor)}</td>
                <td className="px-4 py-3 align-top">
                  <div className="space-y-1.5">
                    {d.components.map((c) => (
                      <div key={c.id}>
                        <div className="text-xs text-muted">{c.name}</div>
                        <AllergenEditor value={c.allergens} editing={editing === d.id} onChange={(v) => save({ ...d, components: d.components.map((x) => (x.id === c.id ? { ...x, allergens: v } : x)) })} />
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <AllergenEditor value={d.mayContain} editing={editing === d.id} tone="may" onChange={(v) => save({ ...d, mayContain: v })} />
                </td>
                <td className="px-4 py-3 align-top text-xs text-muted">{d.swaps.map((s) => s.label).join("; ") || "–"}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col items-start gap-1.5">
                    {d.confirmed ? (
                      <span className="rounded-full bg-basil-soft px-2 py-0.5 text-xs font-medium text-basil">Confirmed</span>
                    ) : (
                      <span className="rounded-full bg-saffron-soft px-2 py-0.5 text-xs font-medium text-[#8a5a10]">Draft · {Math.round(d.confidence * 100)}% sure</span>
                    )}
                    <button onClick={() => setEditing(editing === d.id ? null : d.id)} className="text-xs text-basil">
                      {editing === d.id ? "Done editing" : "Edit allergens"}
                    </button>
                    {!d.confirmed && (
                      <button onClick={() => save({ ...d, confirmed: true })} className="rounded-full bg-basil px-3 py-1 text-xs font-medium text-white">
                        Confirm row
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllergenEditor({ value, onChange, editing, tone = "neutral" }: { value: AllergenId[]; onChange: (v: AllergenId[]) => void; editing: boolean; tone?: "neutral" | "may" }) {
  if (!editing) return <div className="flex flex-wrap gap-1">{value.length ? value.map((a) => <AllergenChip key={a} id={a} small tone={tone} />) : <span className="text-xs text-muted">none</span>}</div>;
  return (
    <div className="flex max-w-[280px] flex-wrap gap-1">
      {ALLERGENS.map((a) => {
        const on = value.includes(a.id);
        return (
          <button key={a.id} onClick={() => onChange(on ? value.filter((x) => x !== a.id) : [...value, a.id])} className={`rounded-full border px-1.5 text-[11px] ${on ? "border-ink bg-ink text-white" : "border-line text-muted"}`}>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Insights ----------------

function Insights({ orders, aiName }: { orders: OOrder[]; aiName: string }) {
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const byAllergen = ALLERGENS.map((a) => ({ a, n: orders.filter((o) => o.party.some((p) => p.allergies.includes(a.id))).length })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
  const max = Math.max(1, ...byAllergen.map((x) => x.n));
  const outcomes = [
    ["Approved", orders.filter((o) => o.decision?.outcome === "approved").length, "bg-basil"],
    ["Approved with changes", orders.filter((o) => o.decision?.outcome === "approved_with_changes").length, "bg-[#6fae86]"],
    ["Declined", orders.filter((o) => o.decision?.outcome === "declined").length, "bg-chili"],
    ["Expired", orders.filter((o) => o.status === "expired").length, "bg-muted"],
  ] as const;
  async function run() {
    setBusy(true);
    const res = await fetch("/api/owner/report", { method: "POST" });
    const d = await res.json();
    setReport(res.ok ? d.report : d.error);
    setBusy(false);
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Copilot aiName={aiName} />
      <div className="rounded-2xl border border-line bg-paper p-5">
        <h3 className="mb-4 font-display text-lg font-semibold">Allergies your diners declare</h3>
        {byAllergen.length === 0 && <p className="text-sm text-muted">No allergy orders yet.</p>}
        <div className="space-y-2">
          {byAllergen.map(({ a, n }) => (
            <div key={a.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0">{a.label}</span>
              <div className="h-5 flex-1 rounded bg-cream">
                <div className="h-5 rounded bg-basil" style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums">{n}</span>
            </div>
          ))}
        </div>
        <h3 className="mb-3 mt-8 font-display text-lg font-semibold">What the kitchen decided</h3>
        <div className="flex h-6 overflow-hidden rounded-full bg-cream">
          {outcomes.map(([label, n, cls]) => (n ? <div key={label} className={cls} style={{ flex: n }} title={`${label}: ${n}`} /> : null))}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          {outcomes.map(([label, n, cls]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
              {label} {n}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Menu risk report</h3>
          <button onClick={run} disabled={busy} className="rounded-full bg-basil px-4 py-1.5 text-sm text-white disabled:opacity-50">
            {busy ? "Writing…" : "Write this week's report"}
          </button>
        </div>
        <p className="mb-3 text-sm text-muted">{aiName} looks at which dishes force sign-offs, edits and declines, and suggests one recipe, swap or wording change for each.</p>
        <div className="whitespace-pre-wrap rounded-xl bg-cream p-4 text-sm leading-relaxed">{report || "No report yet."}</div>
      </div>
    </div>
  );
}

function Copilot({ aiName }: { aiName: string }) {
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string; tools?: string[] }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const SUGGEST = ["How much did PayPal release back to diners this week, and why?", "Which orders are still held, and for how long?", "Cross-check our captured orders against PayPal's transaction records."];
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setQ("");
    setBusy(true);
    const res = await fetch("/api/owner/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }) });
    const d = await res.json();
    setMsgs((m) => [...m, { role: "assistant", content: res.ok ? d.answer : d.error, tools: d.toolsUsed }]);
    setBusy(false);
  }
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-paper p-5 lg:row-span-2">
      <h3 className="font-display text-lg font-semibold">Ask about your money</h3>
      <p className="mb-3 text-sm text-muted">{aiName} answers from Chef&rsquo;s Nod&rsquo;s records and PayPal&rsquo;s own MCP server. It can look things up; only you can move money.</p>
      <div className="flex-1 space-y-3 overflow-y-auto">
        {msgs.length === 0 &&
          SUGGEST.map((s) => (
            <button key={s} onClick={() => ask(s)} className="block w-full rounded-xl border border-line bg-cream px-3 py-2 text-left text-sm hover:border-basil">
              {s}
            </button>
          ))}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-basil text-white" : "bg-cream"}`}>{m.content}</div>
            {m.tools && m.tools.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.tools.map((t) => (
                  <span key={t} className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${t.startsWith("chefs_nod") ? "bg-basil-soft text-basil" : "bg-[#e8f1fc] text-pp-blue"}`}>
                    {t.startsWith("chefs_nod") ? t : `PayPal MCP · ${t}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="w-28 animate-pulse rounded-2xl bg-cream px-3 py-2 text-sm text-muted">Looking it up…</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mt-3 flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about orders, holds, refunds…" className="min-w-0 flex-1 rounded-full border border-line bg-cream px-4 py-2 text-sm outline-none focus:border-basil" />
        <button disabled={busy || !q.trim()} className="rounded-full bg-basil px-4 py-2 text-sm text-white disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}

// ---------------- Settings ----------------

function Settings({ restaurant }: { restaurant: Restaurant }) {
  const [notes, setNotes] = useState(restaurant.kitchenNotes);
  const [minutes, setMinutes] = useState(restaurant.signoffMinutes);
  const [saved, setSaved] = useState(false);
  async function save() {
    await fetch("/api/owner/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kitchenNotes: notes, signoffMinutes: minutes }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div className="max-w-2xl space-y-5 rounded-2xl border border-line bg-paper p-6">
      <div>
        <label className="font-medium">Kitchen notes for the sign-off assistant</label>
        <p className="mb-2 text-sm text-muted">Shared fryers, shared prep areas, anything that creates cross-contact. The assistant uses this to ask the right question on each ticket.</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="w-full rounded-xl border border-line bg-cream p-3 text-sm outline-none focus:border-basil" />
      </div>
      <div>
        <label className="font-medium">Auto-release unanswered orders after</label>
        <div className="mt-2 flex items-center gap-2">
          <input type="number" min={2} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-20 rounded-lg border border-line px-2 py-1" /> minutes
        </div>
        <p className="mt-1 text-sm text-muted">If nobody nods in time, the PayPal authorization is voided and the diner is told.</p>
      </div>
      <button onClick={save} className="rounded-full bg-basil px-5 py-2 text-sm font-medium text-white">
        {saved ? "Saved" : "Save"}
      </button>
      <DemoTools />
    </div>
  );
}

function DemoTools() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  async function run(count: number, decide: boolean, label: string) {
    setBusy(label);
    setMsg("");
    const res = await fetch("/api/demo/replay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, decide }) });
    const d = await res.json();
    setBusy("");
    setMsg(res.ok ? `${d.orders.length} orders created on PayPal sandbox test cards${decide ? " and decided" : ", waiting on the kitchen screen"}.` : d.error);
  }
  return (
    <div className="border-t border-line pt-5">
      <div className="font-medium">Demo: Friday service</div>
      <p className="mb-3 text-sm text-muted">Creates realistic allergy orders whose money is really held in the PayPal sandbox, using PayPal&rsquo;s published test card. Labelled as replay orders everywhere.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => run(6, false, "rush")} className="rounded-full border border-basil px-4 py-2 text-sm text-basil disabled:opacity-40">
          {busy === "rush" ? "Creating…" : "Send 6 orders to the kitchen"}
        </button>
        <button disabled={!!busy} onClick={() => run(12, true, "history")} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40">
          {busy === "history" ? "Creating…" : "Fill a week of history (12 decided orders)"}
        </button>
        <button
          disabled={!!busy}
          onClick={async () => {
            if (!confirm("Reset the demo: restore the sample menu and clear all orders?")) return;
            await fetch("/api/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            location.reload();
          }}
          className="rounded-full border border-line px-4 py-2 text-sm text-muted disabled:opacity-40"
        >
          Reset demo
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-muted">{msg}</div>}
    </div>
  );
}
