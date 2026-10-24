import { NextResponse } from "next/server";
import { events, orders } from "@/lib/db";
import { publish } from "@/lib/bus";
import { verifyWebhook } from "@/lib/paypal";

type Hook = { event_type: string; summary?: string; resource?: { id?: string; custom_id?: string; invoice_id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };

// PayPal webhooks confirm what the app already did (authorization created, capture completed, void, refund).
export async function POST(req: Request) {
  const raw = await req.text();
  let verified = false;
  try {
    verified = await verifyWebhook(req.headers, raw);
  } catch (e) {
    console.error("webhook verify failed", e);
  }
  if (!verified) return NextResponse.json({ ok: false }, { status: 400 });
  const hook = JSON.parse(raw) as Hook;
  const r = hook.resource ?? {};
  const order =
    (r.custom_id && orders.get(r.custom_id)) ||
    (r.invoice_id?.startsWith("CN-") && orders.get(r.invoice_id.slice(3))) ||
    (r.supplementary_data?.related_ids?.order_id && orders.byPaypalId(r.supplementary_data.related_ids.order_id)) ||
    null;
  if (order) {
    events.add(order.id, "webhook", `PayPal webhook ${hook.event_type} verified${hook.summary ? `: ${hook.summary}` : ""}`, { id: r.id });
    publish(order.restaurantId, order.id, "webhook");
  }
  return NextResponse.json({ ok: true });
}
