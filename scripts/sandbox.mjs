// Real PayPal sandbox proof. Needs a server running with real sandbox keys. Usage: node scripts/sandbox.mjs <baseUrl> [staffKey]
// Fails unless real PayPal ids come back; prints the ids to compare with the sandbox dashboard.
const BASE = process.argv[2] || "http://localhost:3100";
const H = { "Content-Type": "application/json", ...(process.argv[3] ? { "x-staff-key": process.argv[3] } : {}) };
const j = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: H, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
};
const assert = (ok, what) => {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok: ${what}`);
};
const { orders } = await j("POST", "/api/demo/replay", { count: 6, decide: true });
assert(orders.length === 6, "6 replay orders on the PayPal test card");
const full = [];
for (const o of orders) full.push((await j("GET", `/api/orders/${o.id}`)).order);
assert(full.every((o) => o.paypalOrderId && !o.paypalOrderId.startsWith("SIM-")), "every PayPal order id is real");
assert(full.every((o) => !String(o.authorizationId).startsWith("SIM")), "every authorization id is real");
const captured = full.filter((o) => o.status === "captured");
const voided = full.filter((o) => o.status === "voided");
assert(captured.length > 0 && captured.every((o) => !o.captureId.startsWith("SIM")), "captures are real");
assert(voided.length > 0, "at least one decline voided its hold");
assert(captured.some((o) => o.capturedMinor < o.authorizedMinor), "a partial capture took less than the hold");
const target = captured[0];
const refunded = (await j("POST", `/api/orders/${target.id}/refund`, { amountMinor: 100 })).order;
assert(refunded.refundedMinor === 100, "partial refund with no reason (empty note must not reach PayPal)");
for (const o of full) console.log(o.id, o.status, "currency", o.currency, "order", o.paypalOrderId, "auth", o.authorizationId, "capture", o.captureId ?? "-", `held ${o.authorizedMinor}`, `captured ${o.capturedMinor ?? 0}`);
console.log("\nCheck these ids in the sandbox dashboard. Live diner approval and a verified webhook still need a human run.");
