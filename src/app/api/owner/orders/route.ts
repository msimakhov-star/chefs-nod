import { NextResponse } from "next/server";
import { events, orders, restaurants } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = restaurants.first()!;
  const list = orders.list(r.id, 500).map((o) => {
    const ev = events.forOrder(o.id);
    return { ...o, authorizedAt: ev.find((e) => e.type === "authorized")?.at ?? null, webhooks: ev.filter((e) => e.type === "webhook").length };
  });
  return NextResponse.json({ orders: list });
}
