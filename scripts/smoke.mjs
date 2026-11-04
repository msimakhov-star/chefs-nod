// End-to-end API test. Usage: node scripts/smoke.mjs [baseUrl]
// Resets the demo, then drives every order path. In simulated mode it approves holds itself;
// against real PayPal the PayPal-approval steps are skipped unless replay test cards work.
const BASE = process.argv[2] || "http://localhost:3100";
let pass = 0;
const failures = [];
const ok = (cond, name, extra = "") => {
  if (cond) pass++;
  else failures.push(`${name}${extra ? `: ${extra}` : ""}`);
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}${!cond && extra ? ` -> ${extra}` : ""}`);
};
const j = async (method, path, body, raw) => {
  const res = await fetch(BASE + path, { method, redirect: "manual", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.9" }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
};
const SLUG = "juniper-and-ash";
const sesameOrder = (extra = {}) => ({
  restaurantSlug: SLUG, dinerName: "Anna", language: "en",
  party: [{ name: "Anna", allergies: [] }, { name: "Dan", allergies: ["sesame"] }],
  items: [{ dishId: "dish_halloumi", qty: 1, forPerson: "Dan" }, { dishId: "dish_falafel", qty: 1, forPerson: "Anna" }],
  ...extra,
});
const place = async (b = sesameOrder()) => (await j("POST", "/api/orders", b)).data?.order;
const hold = async (o) => { await j("GET", `/api/paypal/return?order=${o.id}`); return (await j("GET", `/api/orders/${o.id}`)).data.order; };
const decide = (id, outcome, appliedSwaps = [], reason = "") => j("POST", `/api/orders/${id}/decision`, { outcome, appliedSwaps, reason });
const burgerItem = (o) => o.items.find((i) => i.dishId === "dish_halloumi").id;

console.log("# setup");
ok((await j("POST", "/api/demo/reset", {})).status === 200, "reset demo");
const menu = (await j("GET", `/api/menu?slug=${SLUG}`)).data;
ok(menu.dishes.length === 14 && menu.dishes.every((d) => d.confirmed), "14 confirmed dishes");
ok(menu.dishes.every((d) => Array.isArray(d.components) && d.components.length > 0), "every dish has components");

console.log("# bad order input");
ok((await j("POST", "/api/orders", sesameOrder({ items: [] }))).status === 400, "empty basket refused");
ok((await j("POST", "/api/orders", sesameOrder({ items: [{ dishId: "nope", qty: 1, forPerson: "Dan" }] }))).status === 400, "unknown dish refused");
ok((await j("POST", "/api/orders", sesameOrder({ restaurantSlug: "nope" }))).status === 400, "unknown restaurant refused");
ok((await j("POST", "/api/orders", undefined, "not json")).status === 400, "non-JSON body refused");
ok((await j("POST", "/api/orders", { restaurantSlug: SLUG, dinerName: "x", items: [{ dishId: "dish_chips", qty: 1, forPerson: "x" }] })).status === 400, "missing party refused");
for (const [qty, want] of [[0, 1], [-3, 1], [1000, 20], [1.6, 2], ["abc", 1], [null, 1]]) {
  const o = await place(sesameOrder({ items: [{ dishId: "dish_chips", qty, forPerson: "Dan" }] }));
  ok(o?.items[0].qty === want && o.authorizedMinor === 450 * want, `qty ${JSON.stringify(qty)} becomes ${want}`, JSON.stringify(o?.items?.[0]?.qty));
}
const junk = await place(sesameOrder({ party: [{ name: "Dan", allergies: ["sesame", "pizza"] }], items: [{ dishId: "dish_chips", qty: 1, forPerson: "Dan" }] }));
ok(junk && !junk.party[0].allergies.includes("pizza"), "unknown allergen dropped", JSON.stringify(junk?.party));
const caseO = await place(sesameOrder({ items: [{ dishId: "dish_halloumi", qty: 1, forPerson: "dAN" }] }));
ok(caseO?.check?.risk === "high", "person match ignores case");
const stranger = await place(sesameOrder({ items: [{ dishId: "dish_chips", qty: 1, forPerson: "Zed" }] }));
ok(stranger?.party.some((p) => p.name === "Zed"), "unknown eater added to party");

console.log("# unconfirmed dish");
const chips = menu.dishes.find((d) => d.id === "dish_chips");
await j("PUT", "/api/menu/dish", { ...chips, confirmed: false });
ok((await j("POST", "/api/orders", sesameOrder({ items: [{ dishId: "dish_chips", qty: 1, forPerson: "Dan" }] }))).status === 400, "unconfirmed dish cannot be ordered");
const mcpH = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const mcp = async (id, method, params) => {
  const r = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: mcpH, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return r.json();
};
const call = async (name, args) => {
  const r = await mcp(7, "tools/call", { name, arguments: args });
  let parsed = null;
  try { parsed = JSON.parse(r.result?.content?.[0]?.text); } catch {}
  return { r, parsed, isError: !!r.result?.isError || !!r.error };
};
ok(!(await call("get_menu", {})).parsed.dishes.some((d) => d.dish_id === "dish_chips"), "unconfirmed dish hidden from agents");
ok(!(await j("GET", `/r/${SLUG}`)).text.includes("Triple-cooked chips"), "unconfirmed dish hidden from diners");
await j("PUT", "/api/menu/dish", { ...chips, confirmed: true });

console.log("# nod: full capture");
let o = await place();
ok(o.status === "awaiting_payment" && o.capturedMinor === null && o.authorizedMinor === 2450, "order starts unpaid, held amount right");
ok((await decide(o.id, "approved")).status === 400, "chef cannot decide before PayPal approval");
o = await hold(o);
ok(o.status === "awaiting_chef" && !!o.authorizationId, "hold placed after approval");
await hold(o);
ok((await j("GET", `/api/orders/${o.id}`)).data.events.filter((e) => e.type === "authorized").length === 1, "second return visit does not re-authorize");
let d = await decide(o.id, "approved");
ok(d.data.order?.status === "captured" && d.data.order.capturedMinor === 2450, "nod captures in full");
ok((await decide(o.id, "declined", [], "x")).status === 400, "no second decision after capture");

console.log("# nod with changes: partial capture");
o = await hold(await place());
const it = burgerItem(o);
d = await decide(o.id, "approved_with_changes", [{ itemId: it, swapId: "plain_bun" }, { itemId: it, swapId: "no_slaw" }], "ok");
ok(d.data.order?.capturedMinor === 2300, "two swaps capture 23.00", JSON.stringify(d.data.order?.capturedMinor ?? d.data));
o = await hold(await place());
d = await decide(o.id, "approved_with_changes", [{ itemId: burgerItem(o), swapId: "gf_bun" }]);
ok(d.status === 400 && (await j("GET", `/api/orders/${o.id}`)).data.order.status === "awaiting_chef", "swap that costs more is refused, order still waiting");
d = await decide(o.id, "approved_with_changes", [{ itemId: burgerItem(o), swapId: "no_slaw" }, { itemId: burgerItem(o), swapId: "no_slaw" }]);
ok(d.status === 400 || d.data.order?.capturedMinor === 2300, "same swap twice does not discount twice", JSON.stringify(d.data.order?.capturedMinor));
o = await hold(await place());
d = await decide(o.id, "approved_with_changes", [{ itemId: "nope", swapId: "no_slaw" }]);
ok(d.status === 400, "swap on unknown item refused");
d = await decide(o.id, "approved_with_changes", [{ itemId: burgerItem(o), swapId: "nope" }]);
ok(d.status === 400, "unknown swap refused");
const f = await hold(await place(sesameOrder({ items: [{ dishId: "dish_falafel", qty: 1, forPerson: "Dan" }] })));
d = await decide(f.id, "approved_with_changes", [{ itemId: f.items[0].id, swapId: "mint_yoghurt" }, { itemId: f.items[0].id, swapId: "no_dressing" }]);
ok(d.status === 400, "two swaps on the same part refused", String(d.status));
const q = await hold(await place(sesameOrder({ items: [{ dishId: "dish_halloumi", qty: 2, forPerson: "Dan" }] })));
d = await decide(q.id, "approved_with_changes", [{ itemId: q.items[0].id, swapId: "no_slaw" }]);
ok(d.data.order?.capturedMinor === 2400, "swap discount applies per quantity");
ok((await decide(o.id, "bogus")).status === 400, "unknown outcome refused");

console.log("# decline and expiry");
o = await hold(await place());
d = await decide(o.id, "declined", [], "Shared fryer");
ok(d.data.order?.status === "voided" && d.data.order.capturedMinor === null, "decline voids, nothing captured");
ok((await j("POST", `/api/orders/${o.id}/refund`, { amountMinor: 100 })).status === 400, "voided order cannot be refunded");
const rec = await j("GET", `/o/${o.id}/record`);
ok(rec.status === 200 && rec.text.includes("Declined"), "record page shows a decline");

console.log("# double click race");
o = await hold(await place());
const race = await Promise.all([decide(o.id, "approved"), decide(o.id, "declined", [], "no"), decide(o.id, "approved")]);
ok(race.filter((r) => r.status === 200).length === 1, "three simultaneous decisions: exactly one wins", race.map((r) => r.status).join(","));
const after = (await j("GET", `/api/orders/${o.id}`)).data;
ok(after.events.filter((e) => ["captured", "voided"].includes(e.type)).length === 1, "only one money event recorded");

console.log("# refunds");
o = await hold(await place());
await decide(o.id, "approved");
for (const [amt, name] of [[0, "zero"], [-100, "negative"], [999999, "over the captured amount"], ["abc", "not a number"]]) ok((await j("POST", `/api/orders/${o.id}/refund`, { amountMinor: amt })).status === 400, `refund ${name} refused`);
d = await j("POST", `/api/orders/${o.id}/refund`, { amountMinor: 1000, reason: "Late" });
ok(d.status === 200 && d.data.order.status === "captured", "partial refund keeps the order captured");
d = await j("POST", `/api/orders/${o.id}/refund`, { amountMinor: 2000, reason: "Again" });
ok(d.status === 400, "second refund cannot exceed what is left", String(d.status));
d = await j("POST", `/api/orders/${o.id}/refund`, { amountMinor: 1450, reason: "Rest" });
ok(d.status === 200 && d.data.order.status === "refunded", "refunding the rest marks it refunded", JSON.stringify(d.data.order?.status ?? d.data));

console.log("# status text and pages");
const msg = (await j("GET", `/api/orders/${f.id}?message=1`)).data.message;
ok(typeof msg === "string" && msg.length > 5, "diner message present");
for (const p of ["/", `/r/${SLUG}`, "/kitchen", "/owner", `/o/${o.id}`, `/o/${o.id}/record`, "/llms.txt", "/icon.svg", "/demo/fennel-room-menu.jpg", "/api/kitchen/orders", "/api/owner/orders"]) ok((await j("GET", p)).status === 200, `GET ${p}`);
ok((await j("GET", "/o/nope")).status === 404, "unknown order page is 404");
ok((await j("GET", "/r/nope")).status === 404, "unknown restaurant page is 404");
ok((await j("GET", "/api/orders/nope")).status === 404, "unknown order API is 404");
ok((await j("GET", "/o/nope/record")).status === 404, "unknown record is 404");

console.log("# webhook and simulated approval");
ok((await j("POST", "/api/paypal/webhook", { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: o.id } })).status === 400, "unsigned webhook refused");
const before = (await j("GET", `/api/orders/${o.id}`)).data.events.length;
ok((await j("GET", `/api/orders/${o.id}`)).data.events.length === before, "unsigned webhook recorded nothing");
ok((await j("GET", "/api/paypal/simulated-approve?token=nope")).status === 404, "unknown approval token is 404");
ok([307, 302].includes((await j("GET", "/api/paypal/return?order=nope")).status), "return for unknown order redirects, no crash");

console.log("# owner");
ok((await j("PUT", "/api/menu/dish", { id: "nope" })).status === 400, "unknown dish edit refused");
const set = await j("PUT", "/api/owner/settings", { signoffMinutes: 1000 });
ok(set.data.restaurant.signoffMinutes === 60, "sign-off minutes capped at 60");
await j("PUT", "/api/owner/settings", { signoffMinutes: 10 });
const noFile = await j("POST", "/api/menu/import", undefined, "x");
ok(noFile.status >= 400, "menu import without a file fails cleanly");

console.log("# stream");
const ctl = new AbortController();
const sse = await fetch(`${BASE}/api/stream?restaurant=rest_demo`, { signal: ctl.signal });
const first = new TextDecoder().decode((await sse.body.getReader().read()).value);
ctl.abort();
ok(sse.headers.get("content-type")?.includes("text/event-stream") && first.includes("hello"), "event stream says hello");

console.log("# MCP");
const init = await mcp(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
ok(!!init.result?.serverInfo, "initialize");
const tools = (await mcp(2, "tools/list", {})).result?.tools?.map((t) => t.name).sort();
ok(JSON.stringify(tools) === JSON.stringify(["check_allergies", "get_menu", "get_order_status", "place_order"]), "four tools listed", JSON.stringify(tools));
const chk = await call("check_allergies", { party: [{ name: "Dan", allergies: ["sesame"] }], items: [{ dish_id: "dish_halloumi", for_person: "Dan" }] });
ok(chk.parsed.conflicts[0].swaps_that_remove_it.length === 2, "check_allergies names both swaps");
ok(/No dish is certified safe/.test(chk.parsed.reminder), "reminder says nothing is certified");
const placed = await call("place_order", { diner_name: "Anna", agent_name: "Claude", party: [{ name: "Dan", allergies: ["sesame"] }], items: [{ dish_id: "dish_halloumi", qty: 1, for_person: "Dan" }] });
ok(placed.parsed?.approval_url && placed.parsed.allergen_statement.length === 1 && /approve/i.test(placed.parsed.next_step), "place_order returns link and statement");
ok((await j("GET", `/api/orders/${placed.parsed.order_id}`)).data.order.channel === "agent", "order marked as from an agent");
ok((await call("place_order", { diner_name: "A", party: [], items: [{ dish_id: "nope", qty: 1, for_person: "A" }] })).isError, "place_order with a bad dish reports an error");
ok((await call("place_order", { diner_name: "A", party: [{ name: "A", allergies: ["pizza"] }], items: [{ dish_id: "dish_chips", qty: 1, for_person: "A" }] })).isError, "invalid allergen refused by schema");
ok((await call("place_order", { diner_name: "A", party: [], items: [] })).isError, "empty items refused by schema");
ok((await call("get_order_status", { order_id: "nope" })).isError, "unknown order reports an error");
const st = await call("get_order_status", { order_id: placed.parsed.order_id });
ok(st.parsed.status === "awaiting_payment" && st.parsed.sign_off_record === null, "status before approval");
const menuTool = (await call("get_menu", {})).parsed;
ok(menuTool.dishes.length === 14 && !JSON.stringify(menuTool).match(/\bsafe\b|-free\b/i), "agent menu has 14 dishes and never says safe");

console.log("# replay");
const rep = await j("POST", "/api/demo/replay", { count: 3, decide: false });
ok(rep.status === 200 && rep.data.orders.length === 3 && rep.data.orders.every((x) => x.outcome === "awaiting_chef"), "replay sends orders to the kitchen", rep.text.slice(0, 120));
const repO = (await j("GET", `/api/orders/${rep.data.orders[0].id}`)).data.order;
ok(repO.channel === "replay" && !!repO.authorizationId, "replay order is labelled and held");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((x) => ` - ${x}`).join("\n")); process.exit(1); }
