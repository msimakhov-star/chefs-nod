import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/orders";
import { baseUrl, fail, rateLimit } from "@/lib/http";

export async function POST(req: Request) {
  const limited = rateLimit(req, "orders", 30, 3_600_000);
  if (limited) return limited;
  try {
    const body = await req.json();
    const order = await placeOrder({ ...body, channel: body.channel === "replay" ? "replay" : "web" }, baseUrl(req));
    return NextResponse.json({ order });
  } catch (e) {
    return fail(e);
  }
}
