import { NextResponse } from "next/server";
import { PayPalFailure } from "./paypal";

export const baseUrl = (req: Request) => process.env.PUBLIC_URL || new URL(req.url).origin;

export function fail(e: unknown, status = 400) {
  console.error(e);
  if (e instanceof PayPalFailure) return NextResponse.json({ error: e.message, paypalDebugId: e.debugId, detail: e.detail }, { status: 502 });
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}
