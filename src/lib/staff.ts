import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** What the sign-in cookie holds: a digest, never the key itself. */
export const staffCookie = () => digest(`cookie:${process.env.STAFF_KEY}`).toString("hex");

/** A public https deployment with no key must not silently open the money routes. */
export const staffMisconfigured = () => !process.env.STAFF_KEY && process.env.NODE_ENV === "production" && !!process.env.PUBLIC_URL?.startsWith("https://");

export function isStaff(header: string | null, cookie: string | undefined) {
  const key = process.env.STAFF_KEY;
  if (!key) return !staffMisconfigured();
  return (!!header && same(header, key)) || (!!cookie && same(cookie, staffCookie()));
}

// ponytail: in-memory, per address, per server. A spoofed address can dodge its own lock but cannot lock anyone else out; the long generated key covers guessing.
const g = globalThis as unknown as { __staffWrong?: Map<string, { n: number; reset: number }> };
const wrong = (g.__staffWrong ??= new Map());
const LIMIT = 20;

export function lockedOut(ip: string) {
  const w = wrong.get(ip);
  return !!w && w.reset > Date.now() && w.n >= LIMIT;
}

export function noteWrongKey(ip: string) {
  if (wrong.size > 10_000) wrong.clear();
  const w = wrong.get(ip);
  if (!w || w.reset < Date.now()) wrong.set(ip, { n: 1, reset: Date.now() + 15 * 60_000 });
  else w.n++;
}

export function checkKey(given: string, ip: string): "ok" | "wrong" | "locked" {
  if (lockedOut(ip)) return "locked";
  if (process.env.STAFF_KEY && same(given, process.env.STAFF_KEY)) return "ok";
  noteWrongKey(ip);
  return "wrong";
}
