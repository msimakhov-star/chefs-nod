import { NextResponse } from "next/server";
import { PayPalFailure } from "./paypal";

export const baseUrl = (req: Request) => process.env.PUBLIC_URL || new URL(req.url).origin;

export function fail(e: unknown, status = 400) {
  console.error(e);
  if (e instanceof PayPalFailure) return NextResponse.json({ error: e.message, paypalDebugId: e.debugId }, { status: 502 });
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

// ponytail: in-memory fixed-window limiter, per server instance. Forwarded IPs can be spoofed, so the ":all" cap is the real budget stop.
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(req: Request, bucket: string, max: number, windowMs: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  for (const key of [`${bucket}:${ip}`, `${bucket}:all`]) {
    const limit = key.endsWith(":all") ? max * 20 : max;
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > limit) return NextResponse.json({ error: "The demo is busy. Please try again in a few minutes." }, { status: 429 });
  }
  return null;
}
