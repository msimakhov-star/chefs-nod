import { NextResponse } from "next/server";
import { matchOrder, onPayPalEvent, type PayPalHookResource } from "@/lib/orders";
import { verifyWebhook } from "@/lib/paypal";

type Hook = { id: string; event_type: string; summary?: string; resource?: PayPalHookResource };

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
  const order = matchOrder(hook.event_type, r);
  if (order) await onPayPalEvent(order.id, hook.event_type, hook.id, hook.summary, r);
  return NextResponse.json({ ok: true });
}
