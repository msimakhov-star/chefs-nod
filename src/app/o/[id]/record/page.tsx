import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { dishes, orders, restaurants } from "@/lib/db";
import { allergenLabel } from "@/lib/allergens";
import { gbp, Logo } from "@/components/ui";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// The record that travels with the food: what was ordered, for whom, which allergies, what the chef decided, and the PayPal capture it maps to.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = orders.get(id);
  if (!o) notFound();
  const r = restaurants.byId(o.restaurantId)!;
  const menu = dishes.list(r.id);
  const h = await headers();
  const origin = process.env.PUBLIC_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const qr = await QRCode.toString(`${origin}/o/${o.id}`, { type: "svg", margin: 0, width: 120 });
  const swap = (itemId: string) => {
    const a = o.decision?.appliedSwaps.find((x) => x.itemId === itemId);
    if (!a) return null;
    return menu.find((d) => d.id === o.items.find((i) => i.id === itemId)?.dishId)?.swaps.find((s) => s.id === a.swapId)?.label;
  };
  const decided = o.decision ? new Date(o.decision.decidedAt) : null;

  return (
    <div className="mx-auto my-8 w-full max-w-[420px] bg-white p-7 font-mono text-[13px] leading-relaxed text-black shadow-lg print:my-0 print:shadow-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <div className="font-sans text-base font-bold">Allergen sign-off record</div>
        </div>
        <PrintButton />
      </div>
      <div className="mt-3 border-y border-dashed border-black py-2">
        <div className="font-sans text-lg font-bold">{r.name}</div>
        <div>
          Order {o.id.slice(-6).toUpperCase()} · {o.dinerName} · {o.channel === "agent" ? `via ${o.agentName}` : "web"}
        </div>
      </div>

      <div className="mt-3">
        <div className="font-bold">ALLERGIES DECLARED</div>
        {o.party.map((p) => (
          <div key={p.name}>
            {p.name}: {p.allergies.length ? p.allergies.map(allergenLabel).join(", ") : "none declared"}
            {p.notes ? ` (${p.notes})` : ""}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="font-bold">ITEMS</div>
        {o.items.map((i) => {
          const d = menu.find((x) => x.id === i.dishId);
          const s = swap(i.id);
          return (
            <div key={i.id} className="mt-1.5">
              <div>
                {i.qty}× {i.dishName} for {i.forPerson}
              </div>
              {s && <div className="font-bold">  CHANGED: {s}</div>}
              {d && (
                <div className="text-[11px]">
                  {"  "}Contains: {d.contains.map(allergenLabel).join(", ") || "none of the 14"}
                  {d.mayContain.length ? `; may contain: ${d.mayContain.map(allergenLabel).join(", ")}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-dashed border-black pt-2">
        <div className="font-bold">KITCHEN DECISION</div>
        <div>
          {o.decision ? (o.decision.outcome === "approved" ? "Approved as ordered" : o.decision.outcome === "approved_with_changes" ? "Approved with the changes above" : "Declined") : "Not decided"}
          {decided && ` at ${decided.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} on ${decided.toLocaleDateString("en-GB")}`}
        </div>
        {o.decision?.reason && <div>Note: {o.decision.reason}</div>}
      </div>

      <div className="mt-3 border-t border-dashed border-black pt-2">
        <div className="font-bold">PAYPAL</div>
        <div>Held: {gbp(o.authorizedMinor)} · Charged: {gbp(o.capturedMinor)}</div>
        <div className="break-all text-[11px]">Capture {o.captureId ?? "–"}</div>
        <div className="break-all text-[11px]">Authorization {o.authorizationId ?? "–"}</div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="text-[10px] leading-snug">
          This record shows a kitchen sign-off, not an allergen certification. If you are unsure, ask staff before eating. Scan for the live order.
        </div>
        <div className="h-[90px] w-[90px] shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
      </div>
    </div>
  );
}
