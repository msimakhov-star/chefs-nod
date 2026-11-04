import type { AllergenId } from "./allergens";
import { allergenLabel } from "./allergens";
import type { Dish, OrderItem, Person } from "./types";
import { allergensAfter } from "./dish";

// Deterministic allergen matching from owner-confirmed rows only. The AI never decides this part.
export type Conflict = {
  itemId: string;
  dishId: string;
  dishName: string;
  person: string;
  contains: AllergenId[];
  mayContain: AllergenId[];
  fixingSwapIds: string[]; // the set of owner-defined swaps (price can only go down) that together remove every "contains" conflict
  resolvable: boolean; // true if applying fixingSwapIds leaves no declared allergen for this person
};

/** Pick one swap per conflicting component: the cheapest that does not bring in another of the person's allergens. */
export function planSwaps(dish: Dish, allergies: Set<AllergenId>) {
  const chosen: string[] = [];
  for (const comp of dish.components) {
    if (!comp.allergens.some((a) => allergies.has(a))) continue;
    const options = dish.swaps
      .filter((s) => s.replaces === comp.id && s.priceDeltaMinor <= 0 && !(s.with?.allergens ?? []).some((a) => allergies.has(a)))
      .sort((x, y) => x.priceDeltaMinor - y.priceDeltaMinor);
    if (options[0]) chosen.push(options[0].id);
  }
  const left = allergensAfter(dish, chosen).filter((a) => allergies.has(a));
  return { swapIds: chosen, resolvable: left.length === 0 };
}

export function findConflicts(items: OrderItem[], party: Person[], dishById: (id: string) => Dish | null): Conflict[] {
  const out: Conflict[] = [];
  for (const item of items) {
    const dish = dishById(item.dishId);
    if (!dish) continue;
    const person = party.find((p) => p.name.toLowerCase() === item.forPerson.toLowerCase());
    const allergies = new Set(person?.allergies ?? []);
    const contains = dish.contains.filter((a) => allergies.has(a));
    const mayContain = dish.mayContain.filter((a) => allergies.has(a) && !contains.includes(a));
    if (!contains.length && !mayContain.length) continue;
    const plan = contains.length ? planSwaps(dish, allergies) : { swapIds: [], resolvable: true };
    out.push({ itemId: item.id, dishId: dish.id, dishName: dish.name, person: item.forPerson, contains, mayContain, fixingSwapIds: plan.swapIds, resolvable: plan.resolvable });
  }
  return out;
}

/** The statement a diner (or their agent) sees before approving the payment. Plain facts from the owner's rows. */
export function allergenStatement(items: OrderItem[], dishById: (id: string) => Dish | null) {
  return items.map((i) => {
    const d = dishById(i.dishId);
    const contains = d?.contains.map(allergenLabel).join(", ") || "none of the 14 declared allergens";
    const mayList = d?.mayContain.filter((a) => !d.contains.includes(a)) ?? [];
    const may = mayList.length ? `; may contain ${mayList.map(allergenLabel).join(", ")}` : "";
    return `${i.dishName} (for ${i.forPerson}): contains ${contains}${may}.`;
  });
}

export const risk = (conflicts: Conflict[], party: Person[]) =>
  conflicts.some((c) => c.contains.length) ? "high" : conflicts.length || party.some((p) => p.allergies.length || p.notes) ? "check" : "none";
