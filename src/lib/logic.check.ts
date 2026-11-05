// Run: pnpm check. Fails loudly if the allergen or swap logic breaks.
import assert from "node:assert/strict";
import { SEED_DISHES } from "./seed";
import { allergensAfter, sourcesOf } from "./dish";
import { findConflicts, keepDeclaredAllergies, planSwaps } from "./conflicts";
import type { OrderItem } from "./types";

const dish = (id: string) => SEED_DISHES.find((d) => d.id === id)!;
const burger = dish("dish_halloumi");

// Sesame sits in two components: swapping only the bun must NOT clear it.
assert.ok(allergensAfter(burger, ["plain_bun"]).includes("sesame"));
assert.deepEqual(sourcesOf(burger, "sesame", ["plain_bun"]), ["Tahini slaw with mustard"]);
assert.ok(!allergensAfter(burger, ["plain_bun", "no_slaw"]).includes("sesame"));

// The planner picks one swap per sesame component and never a swap that costs more.
const plan = planSwaps(burger, new Set(["sesame"]));
assert.deepEqual(plan.swapIds.sort(), ["no_slaw", "plain_bun"]);
assert.equal(plan.resolvable, true);
// Gluten: the only gluten-free bun costs more, so it is not offered and the dish stays unresolved.
assert.equal(planSwaps(burger, new Set(["gluten"])).resolvable, false);

// A swap that adds the person's allergen is never chosen (mint yoghurt adds milk).
const falafel = dish("dish_falafel");
assert.deepEqual(planSwaps(falafel, new Set(["sesame", "milk"])).swapIds, ["no_dressing"]);

// Conflicts only for the person who has the allergy.
const items: OrderItem[] = [
  { id: "a", dishId: "dish_halloumi", dishName: "", forPerson: "Dan", qty: 1, unitPriceMinor: 1350 },
  { id: "b", dishId: "dish_falafel", dishName: "", forPerson: "Anna", qty: 1, unitPriceMinor: 1100 },
];
const conflicts = findConflicts(items, [{ name: "Dan", allergies: ["sesame"] }, { name: "Anna", allergies: [] }], (id) => dish(id));
assert.equal(conflicts.length, 1);
assert.equal(conflicts[0].itemId, "a");

// A name nobody declared must not hide an allergy.
const mismatch = findConflicts([{ ...items[0], forPerson: "my son" }], [{ name: "Dan", allergies: ["sesame"] }], (id) => dish(id));
assert.equal(mismatch.length, 1);
assert.deepEqual(mismatch[0].contains, ["sesame"]);
assert.equal(findConflicts([{ ...items[0], forPerson: " dan " }], [{ name: "Dan", allergies: ["sesame"] }], (id) => dish(id)).length, 1);

// The AI can add an allergy but never remove one, or drop a person.
const kept = keepDeclaredAllergies([{ name: "Dan", allergies: ["sesame"] }, { name: "Mum", allergies: ["milk"] }], [{ name: "dan", allergies: ["eggs"] }]);
assert.deepEqual(kept.map((p) => [p.name.toLowerCase(), [...p.allergies].sort()]), [["dan", ["eggs", "milk", "sesame"]], ["mum", ["milk"]]]);

console.log("logic checks passed");
