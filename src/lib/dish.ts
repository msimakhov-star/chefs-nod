import type { AllergenId } from "./allergens";
import type { Dish } from "./types";

/** Allergens a dish contains after applying a set of swaps. Components carry the allergens, so this is exact. */
export function allergensAfter(dish: Dish, swapIds: string[]): AllergenId[] {
  const out = new Set<AllergenId>();
  for (const c of dish.components) {
    const swap = dish.swaps.find((s) => swapIds.includes(s.id) && s.replaces === c.id);
    const allergens = swap ? (swap.with?.allergens ?? []) : c.allergens;
    allergens.forEach((a) => out.add(a));
  }
  return [...out];
}

/** Which components bring a given allergen into the dish (after swaps). */
export function sourcesOf(dish: Dish, allergen: AllergenId, swapIds: string[] = []) {
  return dish.components
    .map((c) => {
      const swap = dish.swaps.find((s) => swapIds.includes(s.id) && s.replaces === c.id);
      return swap ? (swap.with ? { name: swap.with.name, allergens: swap.with.allergens } : null) : c;
    })
    .filter((c): c is { name: string; allergens: AllergenId[] } => !!c && c.allergens.includes(allergen))
    .map((c) => c.name);
}

export const deriveContains = (dish: Pick<Dish, "components">) => [...new Set(dish.components.flatMap((c) => c.allergens))] as AllergenId[];
