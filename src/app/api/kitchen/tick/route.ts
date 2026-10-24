import { NextResponse } from "next/server";
import { expireStale } from "@/lib/orders";

// The kitchen screen calls this every 30 s; orders nobody answered get their hold voided.
export async function POST() {
  await expireStale();
  return NextResponse.json({ ok: true });
}
