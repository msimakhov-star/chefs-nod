import type { Component, Dish, Restaurant, Swap } from "./types";
import type { AllergenId } from "./allergens";
import { deriveContains } from "./dish";

// A fictional demo restaurant. Allergen rows are illustrative, not real dishes.
export const SEED_RESTAURANT: Restaurant = {
  id: "rest_demo",
  slug: "juniper-and-ash",
  name: "Juniper & Ash",
  city: "Cambridge",
  currency: "GBP",
  signoffMinutes: 10,
  kitchenNotes:
    "One shared fryer for fish, chips and katsu. Brioche buns are topped with sesame in the same prep area as the plain buns. Satay is marinated on a separate station. Nuts are used in the pastry section.",
};

const a = (...ids: AllergenId[]) => ids;
const c = (id: string, name: string, allergens: AllergenId[]): Component => ({ id, name, allergens });
const swap = (id: string, label: string, priceDeltaMinor: number, replaces: string, withC: Swap["with"] = null): Swap => ({ id, label, priceDeltaMinor, replaces, with: withC });

type SeedDish = Pick<Dish, "id" | "name" | "description" | "category" | "priceMinor" | "components" | "mayContain"> & { swaps?: Swap[] };

const d = (x: SeedDish): Dish => ({
  ...x,
  restaurantId: SEED_RESTAURANT.id,
  ingredients: x.components.map((k) => k.name),
  contains: deriveContains(x),
  swaps: x.swaps ?? [],
  confirmed: true,
  confidence: 0.97,
  paypalProductId: null,
  available: true,
});

export const SEED_DISHES: Dish[] = [
  d({
    id: "dish_halloumi",
    name: "Halloumi burger",
    description: "Grilled halloumi, roast pepper, rocket and tahini slaw in a toasted brioche bun.",
    category: "Mains",
    priceMinor: 1350,
    components: [
      c("bun", "Brioche bun with sesame topping", a("gluten", "eggs", "milk", "sesame")),
      c("halloumi", "Grilled halloumi", a("milk")),
      c("slaw", "Tahini slaw with mustard", a("sesame", "mustard")),
      c("veg", "Roast pepper and rocket", a()),
    ],
    mayContain: a(),
    swaps: [
      swap("plain_bun", "Plain sourdough bun instead of sesame brioche", 0, "bun", { name: "Plain sourdough bun", allergens: a("gluten") }),
      swap("no_slaw", "Leave out the tahini slaw", -150, "slaw"),
      swap("gf_bun", "Rice-flour bun", 100, "bun", { name: "Rice-flour bun", allergens: a("eggs") }),
    ],
  }),
  d({
    id: "dish_falafel",
    name: "Falafel wrap",
    description: "Herb falafel, pickled red onion, cucumber and tahini dressing in a flatbread.",
    category: "Mains",
    priceMinor: 1100,
    components: [
      c("falafel", "Herb falafel (chickpea)", a()),
      c("bread", "Wheat flatbread", a("gluten")),
      c("dressing", "Tahini dressing", a("sesame")),
      c("veg", "Pickled red onion and cucumber", a()),
    ],
    mayContain: a("sesame"),
    swaps: [
      swap("mint_yoghurt", "Mint yoghurt instead of tahini dressing", 0, "dressing", { name: "Mint yoghurt", allergens: a("milk") }),
      swap("no_dressing", "No dressing", -100, "dressing"),
    ],
  }),
  d({
    id: "dish_fish",
    name: "Beer-battered cod and chips",
    description: "Cod in a crisp ale batter with chips, mushy peas and tartare sauce.",
    category: "Mains",
    priceMinor: 1595,
    components: [
      c("cod", "Cod in ale batter", a("fish", "gluten", "sulphites")),
      c("chips", "Chips (shared fryer)", a()),
      c("peas", "Mushy peas", a()),
      c("tartare", "Tartare sauce", a("eggs", "mustard")),
    ],
    mayContain: a(),
    swaps: [swap("no_tartare", "No tartare sauce", -100, "tartare")],
  }),
  d({
    id: "dish_katsu",
    name: "Chicken katsu curry",
    description: "Panko chicken, katsu curry sauce, sticky rice and pickled ginger.",
    category: "Mains",
    priceMinor: 1450,
    components: [
      c("chicken", "Panko chicken (fried in the shared fryer)", a("gluten", "eggs")),
      c("sauce", "Katsu curry sauce", a("soya", "celery", "gluten")),
      c("rice", "Sticky rice and pickled ginger", a()),
    ],
    mayContain: a("fish", "sesame"),
  }),
  d({
    id: "dish_green_curry",
    name: "Thai green vegetable curry",
    description: "Seasonal vegetables and tofu in green curry with jasmine rice and crushed peanuts.",
    category: "Mains",
    priceMinor: 1350,
    components: [
      c("curry", "Green curry (paste contains shrimp)", a("crustaceans")),
      c("tofu", "Tofu", a("soya")),
      c("rice", "Jasmine rice", a()),
      c("peanuts", "Crushed peanuts", a("peanuts")),
    ],
    mayContain: a(),
    swaps: [swap("no_peanuts", "No crushed peanuts on top", 0, "peanuts")],
  }),
  d({
    id: "dish_satay",
    name: "Satay chicken skewers",
    description: "Chicken thigh skewers in peanut satay with cucumber relish.",
    category: "Small plates",
    priceMinor: 850,
    components: [
      c("chicken", "Chicken marinated in peanut satay with soy and sesame oil", a("peanuts", "soya", "sesame", "gluten")),
      c("relish", "Cucumber relish", a()),
    ],
    mayContain: a(),
  }),
  d({
    id: "dish_caesar",
    name: "Caesar salad",
    description: "Cos lettuce, anchovy dressing, parmesan and sourdough croutons.",
    category: "Small plates",
    priceMinor: 950,
    components: [
      c("leaves", "Cos lettuce", a()),
      c("dressing", "Anchovy Caesar dressing", a("fish", "eggs", "mustard", "milk")),
      c("parmesan", "Parmesan", a("milk")),
      c("croutons", "Sourdough croutons", a("gluten")),
    ],
    mayContain: a(),
    swaps: [swap("no_croutons", "No croutons", -50, "croutons")],
  }),
  d({
    id: "dish_risotto",
    name: "Wild mushroom risotto",
    description: "Arborio rice, wild mushrooms, white wine, parmesan and celery stock.",
    category: "Mains",
    priceMinor: 1400,
    components: [
      c("risotto", "Risotto made with celery stock and white wine", a("celery", "sulphites")),
      c("finish", "Butter and parmesan", a("milk")),
    ],
    mayContain: a(),
  }),
  d({
    id: "dish_moules",
    name: "Moules marinière",
    description: "Mussels in white wine, cream and garlic with bread to mop up.",
    category: "Mains",
    priceMinor: 1500,
    components: [
      c("mussels", "Mussels in white wine, cream and celery", a("molluscs", "sulphites", "milk", "celery")),
      c("bread", "Bread", a("gluten")),
    ],
    mayContain: a("crustaceans"),
    swaps: [swap("no_bread", "No bread", -100, "bread")],
  }),
  d({
    id: "dish_chips",
    name: "Chips",
    description: "Triple-cooked chips with sea salt.",
    category: "Sides",
    priceMinor: 450,
    components: [c("chips", "Chips in sunflower oil (shared fryer)", a())],
    mayContain: a("gluten", "fish", "eggs"),
  }),
  d({
    id: "dish_salad",
    name: "House salad",
    description: "Leaves, radish and herbs with mustard vinaigrette.",
    category: "Sides",
    priceMinor: 400,
    components: [c("leaves", "Leaves, radish and herbs", a()), c("dressing", "Mustard vinaigrette", a("mustard", "sulphites"))],
    mayContain: a(),
    swaps: [swap("oil_lemon", "Olive oil and lemon instead of vinaigrette", 0, "dressing", { name: "Olive oil and lemon", allergens: a() })],
  }),
  d({
    id: "dish_toffee",
    name: "Sticky toffee pudding",
    description: "Date sponge, toffee sauce and vanilla ice cream.",
    category: "Desserts",
    priceMinor: 750,
    components: [c("sponge", "Date sponge", a("gluten", "eggs", "milk")), c("sauce", "Toffee sauce", a("milk")), c("ice", "Vanilla ice cream", a("milk", "eggs"))],
    mayContain: a("nuts"),
  }),
  d({
    id: "dish_mousse",
    name: "Dark chocolate mousse",
    description: "Dark chocolate mousse with sesame snap.",
    category: "Desserts",
    priceMinor: 700,
    components: [c("mousse", "Dark chocolate mousse", a("eggs", "milk", "soya")), c("snap", "Sesame snap", a("sesame"))],
    mayContain: a("nuts"),
    swaps: [swap("no_snap", "No sesame snap", 0, "snap")],
  }),
  d({
    id: "dish_sorbet",
    name: "Blood orange sorbet",
    description: "Sharp blood orange sorbet.",
    category: "Desserts",
    priceMinor: 600,
    components: [c("sorbet", "Blood orange sorbet", a())],
    mayContain: a("milk"),
  }),
];
