import { NextResponse } from "next/server";
import { events, orders } from "@/lib/db";
import { dinerMessage } from "@/lib/orders";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = orders.get(id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const withMessage = new URL(req.url).searchParams.get("message") === "1";
  return NextResponse.json({ order, events: events.forOrder(id), message: withMessage ? await dinerMessage(order) : null });
}
