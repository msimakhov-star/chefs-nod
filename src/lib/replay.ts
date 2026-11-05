import { placeOrder, chefDecides } from "./orders";
import { dishes, events, orders, restaurants } from "./db";
import { allergiesFor, planSwaps } from "./conflicts";
import type { Person } from "./types";
import type { AllergenId } from "./allergens";

// "Friday service": a burst of realistic allergy orders on PayPal sandbox test cards,
// so the kitchen screen and the owner's insights have something real to show.
type Script = { diner: string; party: Person[]; items: [string, string, number?][] };

const P = (name: string, ...allergies: AllergenId[]): Person => ({ name, allergies, notes: "" });

const SCRIPTS: Script[] = [
  { diner: "Priya", party: [P("Priya"), P("Arjun", "peanuts", "nuts")], items: [["dish_green_curry", "Arjun"], ["dish_katsu", "Priya"], ["dish_toffee", "Arjun"]] },
  { diner: "Tom", party: [P("Tom", "gluten")], items: [["dish_halloumi", "Tom"], ["dish_salad", "Tom"]] },
  { diner: "Grace", party: [P("Grace"), P("Mum", "milk", "eggs")], items: [["dish_risotto", "Mum"], ["dish_fish", "Grace"]] },
  { diner: "Leo", party: [P("Leo", "sesame")], items: [["dish_falafel", "Leo"], ["dish_mousse", "Leo"]] },
  { diner: "Sofia", party: [P("Sofia", "fish")], items: [["dish_chips", "Sofia"], ["dish_caesar", "Sofia"]] },
  { diner: "Marek", party: [P("Marek", "crustaceans", "molluscs")], items: [["dish_moules", "Marek"], ["dish_risotto", "Marek"]] },
  { diner: "Hannah", party: [P("Hannah"), P("Ella", "sesame")], items: [["dish_halloumi", "Ella"], ["dish_satay", "Hannah"], ["dish_sorbet", "Ella"]] },
  { diner: "Omar", party: [P("Omar", "mustard")], items: [["dish_fish", "Omar"], ["dish_salad", "Omar"]] },
  { diner: "Chloe", party: [P("Chloe", "milk")], items: [["dish_sorbet", "Chloe"], ["dish_green_curry", "Chloe"]] },
  { diner: "Ben", party: [P("Ben", "peanuts")], items: [["dish_satay", "Ben"]] },
  { diner: "Aisha", party: [P("Aisha", "eggs")], items: [["dish_katsu", "Aisha"], ["dish_chips", "Aisha"]] },
  { diner: "James", party: [P("James"), P("Noah", "sesame", "milk")], items: [["dish_falafel", "Noah"], ["dish_fish", "James", 2]] },
];

// Demo history only: spreads decided replay orders over the past week so the owner's charts have a shape.
// They stay on the "Replay" channel in every view. Live orders are never touched.
function backdate(id: string, n: number) {
  const o = orders.get(id);
  if (!o?.decision) return;
  const placed = new Date();
  placed.setDate(placed.getDate() - (6 - Math.floor(n / 2)));
  placed.setHours(18, (n * 37) % 180, 0, 0);
  const authorized = placed.getTime() + 40_000;
  const decided = new Date(authorized + (45 + ((n * 53) % 240)) * 1000).toISOString();
  o.createdAt = placed.toISOString();
  o.decision.decidedAt = decided;
  orders.save(o);
  for (const e of events.forOrder(id)) {
    events.setTime(e.id, e.type === "created" ? o.createdAt : e.type === "authorized" ? new Date(authorized).toISOString() : decided);
  }
}

export async function runReplay(count: number, decide: boolean, baseUrl: string) {
  const r = restaurants.first()!;
  const menu = dishes.list(r.id);
  const out: { id: string; outcome: string }[] = [];
  for (const s of SCRIPTS.slice(0, Math.max(1, Math.min(SCRIPTS.length, count)))) {
    const order = await placeOrder(
      { restaurantSlug: r.slug, channel: "replay", dinerName: s.diner, party: s.party, items: s.items.map(([dishId, forPerson, qty]) => ({ dishId, forPerson, qty: qty ?? 1 })) },
      baseUrl,
    );
    if (!decide) {
      out.push({ id: order.id, outcome: "awaiting_chef" });
      continue;
    }
    // A plausible chef: use the planned swaps when they fully remove the allergen, decline when they can't.
    const applied: { itemId: string; swapId: string }[] = [];
    let unresolvable = false;
    for (const item of order.items) {
      const dish = menu.find((d) => d.id === item.dishId)!;
      const allergies = allergiesFor(order.party, item.forPerson);
      if (!dish.contains.some((a) => allergies.has(a))) continue;
      const plan = planSwaps(dish, allergies);
      if (!plan.resolvable) unresolvable = true;
      plan.swapIds.forEach((swapId) => applied.push({ itemId: item.id, swapId }));
    }
    const outcome = unresolvable ? "declined" : applied.length ? "approved_with_changes" : "approved";
    await chefDecides(order.id, outcome, applied, outcome === "declined" ? "Can't remove the allergen from this dish" : "");
    backdate(order.id, out.length);
    out.push({ id: order.id, outcome });
  }
  return out;
}
