import { NextResponse } from "next/server";
import { orders } from "@/lib/db";
import { baseUrl } from "@/lib/http";
import { isSimulated } from "@/lib/paypal";

// Only used when no PayPal sandbox keys are configured. Shows a labelled stand-in for PayPal's approval page.
export async function GET(req: Request) {
  if (!isSimulated()) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const order = orders.byPaypalId(token);
  if (!order) return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  return NextResponse.redirect(`${baseUrl(req)}/o/${order.id}/approve`);
}
