// Run: pnpm check. The staff gate, through the real proxy function.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { checkKey, staffCookie } from "./staff";

const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://local${path}`, { headers });
const open = (path: string, headers?: Record<string, string>) => proxy(req(path, headers)).headers.get("x-middleware-next") === "1";
const env = process.env as Record<string, string | undefined>;
const STAFF_ROUTES = ["/kitchen", "/owner", "/api/owner/orders", "/api/owner/copilot", "/api/kitchen/orders", "/api/demo/reset", "/api/demo/replay", "/api/studio-ai", "/api/menu/dish", "/api/menu/import", "/api/menu/publish", "/api/orders/x/decision", "/api/orders/x/refund", "/api/stream?restaurant=r"];
const PUBLIC_ROUTES = ["/", "/r/juniper-and-ash", "/o/ord_1", "/api/orders", "/api/menu", "/api/mcp", "/api/assistant", "/api/paypal/webhook", "/api/paypal/return", "/api/stream?order=o", "/api/orders/x"];

env.STAFF_KEY = "right-key";
for (const r of STAFF_ROUTES) {
  assert.equal(open(r), false, `${r} must need the key`);
  assert.equal(open(r, { "x-staff-key": "right-key" }), true, `${r} must accept the key`);
  assert.equal(open(r, { cookie: `staff=${staffCookie()}` }), true, `${r} must accept the sign-in cookie`);
  assert.equal(open(r, { cookie: "staff=right-key" }), false, `${r} must not accept the raw key as a cookie`);
}
for (const r of PUBLIC_ROUTES) assert.equal(open(r), true, `${r} must stay public`);
assert.equal(proxy(req("/api/owner/orders")).status, 401);
assert.equal(proxy(req("/kitchen")).status, 307);

// A stranger's wrong guesses lock the stranger, not the staff.
for (let i = 0; i < 20; i++) assert.equal(checkKey("guess", "1.1.1.1"), "wrong");
assert.equal(checkKey("right-key", "1.1.1.1"), "locked");
assert.equal(checkKey("right-key", "2.2.2.2"), "ok");
for (let i = 0; i < 20; i++) proxy(req("/api/owner/orders", { "x-staff-key": "guess", "x-forwarded-for": "3.3.3.3" }));
assert.equal(proxy(req("/api/owner/orders", { "x-staff-key": "right-key", "x-forwarded-for": "3.3.3.3" })).status, 429);

// No key: open on a laptop, closed on a public https server.
delete env.STAFF_KEY;
assert.equal(open("/kitchen"), true);
env.NODE_ENV = "production";
env.PUBLIC_URL = "https://example.onrender.com";
assert.equal(proxy(req("/api/owner/orders")).status, 503);

console.log("gate checks passed");
