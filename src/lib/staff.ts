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

// ponytail: one in-memory counter per server. Enough with a long generated key; a shared store if this ever runs on several.
const wrong = { n: 0, reset: 0 };
export function checkKey(given: string): "ok" | "wrong" | "locked" {
  const now = Date.now();
  if (now > wrong.reset) Object.assign(wrong, { n: 0, reset: now + 15 * 60_000 });
  if (wrong.n >= 20) return "locked";
  if (process.env.STAFF_KEY && same(given, process.env.STAFF_KEY)) return "ok";
  wrong.n++;
  return "wrong";
}
