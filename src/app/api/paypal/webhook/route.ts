import { NextResponse } from "next/server";
import { orders } from "@/lib/db";
import { onPayPalEvent } from "@/lib/orders";
import { verifyWebhook } from "@/lib/paypal";

type Resource = {
  id?: string;
  status?: string;
  custom_id?: string;
  invoice_id?: string;
  purchase_units?: { custom_id?: string }[];
  supplementary_data?: { related_ids?: { order_id?: string } };
  seller_payable_breakdown?: { total_refunded_amount?: { value?: string } };
};
type Hook = { id: string; event_type: string; summary?: string; resource?: Resource };

// Verified PayPal webhooks can move an order: approval places the hold, and declines, reversals and refunds update it.
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
  const custom = r.custom_id ?? r.purchase_units?.[0]?.custom_id;
  const order =
    (custom && orders.get(custom)) ||
    (r.invoice_id?.startsWith("CN-") && orders.get(r.invoice_id.slice(3))) ||
    (r.supplementary_data?.related_ids?.order_id && orders.byPaypalId(r.supplementary_data.related_ids.order_id)) ||
    (r.id && hook.event_type.startsWith("CHECKOUT.") && orders.byPaypalId(r.id)) ||
    null;
  if (order) await onPayPalEvent(order.id, hook.event_type, hook.id, hook.summary, r);
  return NextResponse.json({ ok: true });
}
