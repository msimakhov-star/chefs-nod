import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/orders";
import { baseUrl, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const order = await placeOrder({ ...body, channel: body.channel === "replay" ? "replay" : "web" }, baseUrl(req));
    return NextResponse.json({ order });
  } catch (e) {
    return fail(e);
  }
}
