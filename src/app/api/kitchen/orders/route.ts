import { NextResponse } from "next/server";
import { events, orders, restaurants } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = restaurants.first()!;
  const list = orders.list(r.id, 60).map((o) => ({ ...o, authorizedAt: events.forOrder(o.id).find((e) => e.type === "authorized")?.at ?? null }));
  return NextResponse.json({ orders: list, signoffMinutes: r.signoffMinutes });
}
