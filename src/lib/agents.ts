import { generateText, Output } from "ai";
import { z } from "zod";
import { aiProvider } from "./ai";
import { ALLERGEN_IDS, allergenLabel } from "./allergens";
import { findConflicts, keepDeclaredAllergies, type Conflict } from "./conflicts";
import { kv } from "./db";
import type { Dish, KitchenCheck, Order, Person, Restaurant } from "./types";

const allergenEnum = z.enum(ALLERGEN_IDS as [string, ...string[]]);

const SAFETY_RULES = `Rules you never break:
- Never call a dish "safe", "free from" or "X-free". Only the kitchen can confirm that.
- Only use allergen facts from the owner-confirmed rows you are given. If something is not in the rows, say the kitchen must check.
- Never invent dishes, prices or swaps. Swaps can only come from the dish's listed swaps.`;

const menuForPrompt = (dishes: Dish[]) =>
  dishes
    .filter((d) => d.confirmed && d.available)
    .map((d) => {
      const comps = d.components.map((c) => `${c.id}: ${c.name} [${c.allergens.join(", ") || "none"}]`).join("; ");
      const swaps = d.swaps.map((s) => `"${s.label}" (id ${s.id}, ${s.priceDeltaMinor >= 0 ? "+" : ""}${(s.priceDeltaMinor / 100).toFixed(2)}, replaces ${s.replaces}${s.with ? ` with ${s.with.name} [${s.with.allergens.join(", ") || "none"}]` : " with nothing"})`).join("; ");
      return `- id=${d.id} | ${d.name} | ${d.category} | £${(d.priceMinor / 100).toFixed(2)} | ${d.description} | components: ${comps} | may contain (cross-contact): ${d.mayContain.join(", ") || "none"} | swaps: ${swaps || "none"}`;
    })
    .join("\n");

// ---------- 1. Kitchen sign-off agent: writes the question the chef has to answer ----------

export function rulesCheck(order: Order, conflicts: Conflict[], statement: string[], riskLevel: KitchenCheck["risk"]): KitchenCheck {
  return {
    risk: riskLevel,
    headline: conflicts.length ? `Allergy check: ${[...new Set(conflicts.flatMap((c) => [...c.contains, ...c.mayContain]))].map(allergenLabel).join(", ")}` : order.party.some((p) => p.allergies.length) ? "Allergy order: please confirm" : "Standard order",
    questions: conflicts.map((c) => ({
      itemId: c.itemId,
      question: `${c.dishName} for ${c.person}: ${c.contains.length ? `contains ${c.contains.map(allergenLabel).join(", ")}` : ""}${c.mayContain.length ? `${c.contains.length ? "; " : ""}may contain ${c.mayContain.map(allergenLabel).join(", ")}` : ""}. Can you make it for them?`,
      suggestedSwapIds: c.fixingSwapIds,
    })),
    dinerSummary: statement.join(" "),
  };
}

export async function kitchenCheck(order: Order, conflicts: Conflict[], dishes: Dish[], restaurant: Restaurant, statement: string[], riskLevel: KitchenCheck["risk"]): Promise<KitchenCheck> {
  const fallback = rulesCheck(order, conflicts, statement, riskLevel);
  try {
    const { output } = await generateText({
      model: aiProvider().fast,
      output: Output.object({
        schema: z.object({
          headline: z.string().describe("One short line for the top of the kitchen ticket, max 70 characters"),
          questions: z.array(
            z.object({
              itemId: z.string(),
              question: z.string().describe("The exact yes/no question for the chef, one or two sentences, practical kitchen language"),
              suggestedSwapIds: z.array(z.string()),
            }),
          ),
          extraCrossContactRisks: z.array(z.string()).describe("Cross-contact risks from the kitchen notes that affect this order, e.g. a shared fryer. Empty if none."),
        }),
      }),
      system: `You are the sign-off assistant in a restaurant kitchen. A remote order has arrived with allergy information. The money is only held, not charged, until the chef answers. Write clear, short questions so the chef can decide in seconds.\n${SAFETY_RULES}`,
      prompt: `Restaurant kitchen notes: ${restaurant.kitchenNotes}

Party: ${JSON.stringify(order.party)}
Items: ${JSON.stringify(order.items.map((i) => ({ itemId: i.id, dish: i.dishName, forPerson: i.forPerson, qty: i.qty })))}
Confirmed conflicts found by the rules engine: ${JSON.stringify(conflicts)}
Menu rows:
${menuForPrompt(dishes)}

Write one question per conflicting item (use its itemId). Name the component that carries the allergen and refer to swaps by their label in quotes, never by id. Put the ids of the swaps you recommend in suggestedSwapIds; a dish can need more than one swap when the allergen sits in several components. Also check the kitchen notes for cross-contact risks (shared fryer, shared prep area) that touch a person's declared allergies, including items without a direct conflict, and add a question for those items. Never ask about people with no declared allergies or notes.`,
    });
    if (!output) return fallback;
    const validItem = new Set(order.items.map((i) => i.id));
    const atRisk = new Set(order.items.filter((i) => order.party.some((p) => p.name.toLowerCase() === i.forPerson.toLowerCase() && (p.allergies.length || p.notes))).map((i) => i.id));
    const questions = output.questions
      .filter((q) => validItem.has(q.itemId) && atRisk.has(q.itemId))
      .map((q) => {
        const dish = dishes.find((d) => d.id === order.items.find((i) => i.id === q.itemId)?.dishId);
        return { ...q, suggestedSwapIds: q.suggestedSwapIds.filter((s) => dish?.swaps.some((w) => w.id === s)) };
      });
    // Never lose a rules-engine conflict, even if the model skipped it.
    for (const fq of fallback.questions) if (!questions.some((q) => q.itemId === fq.itemId)) questions.push(fq);
    const crossContact = output.extraCrossContactRisks.length > 0;
    return {
      risk: riskLevel === "none" && crossContact ? "check" : riskLevel,
      headline: trimLine(output.headline, 80) || fallback.headline,
      questions,
      extraRisks: output.extraCrossContactRisks.map((r) => trimLine(r, 140)).slice(0, 4),
      dinerSummary: fallback.dinerSummary,
    };
  } catch (e) {
    console.error("kitchenCheck AI failed, using rules-only ticket", e);
    return fallback;
  }
}

const trimLine = (t: string, n: number) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)).replace(/[,.;:]$/, "") + "…");

// ---------- 2. Ordering assistant: turns a messy request into a basket from confirmed dishes ----------

export const BasketSchema = z.object({
  reply: z.string().describe("What you say back to the diner, in their language. Short and warm. Mention which allergies you noted and that the chef will confirm before they are charged."),
  language: z.string().describe("BCP-47 code of the diner's language, e.g. en, ru, es"),
  party: z.array(
    z.object({
      name: z.string(),
      allergies: z.array(allergenEnum).describe("Only from the 14 UK allergens"),
      notes: z.string().describe("Anything else the kitchen should know: diet, severity, other intolerances. Empty string if none."),
    }),
  ),
  items: z.array(z.object({ dishId: z.string(), qty: z.number().int().min(1).max(20), forPerson: z.string() })),
  ready: z.boolean().describe("true when the basket matches what they asked for and they can review and approve payment"),
});
export type Basket = z.infer<typeof BasketSchema>;

export async function orderingAssistant(messages: { role: "user" | "assistant"; content: string }[], dishes: Dish[], restaurant: Restaurant, currentParty: Person[]) {
  const { output } = await generateText({
    model: aiProvider().smart,
    output: Output.object({ schema: BasketSchema }),
    system: `You take food orders for ${restaurant.name} (${restaurant.city}) on behalf of a diner. People often order for someone else: a child, a partner, an elderly parent.
Your job: understand who is eating, their allergies (map them to the 14 UK allergens: ${ALLERGEN_IDS.join(", ")}; coeliac means gluten; "dairy" means milk), budget and preferences, then build a basket using only dish ids from the menu below.
Prefer dishes that avoid the person's allergens. If a dish they want contains their allergen but has a swap that removes it, you may still add it and tell them the chef will be asked to make the swap. Do not add dishes that contain an allergen with no swap, unless they insist; then warn them.
Reply in the diner's language. Every allergy order goes to the chef before any money is taken, say that once.
${SAFETY_RULES}

Menu (owner-confirmed rows):
${menuForPrompt(dishes)}

People already noted: ${JSON.stringify(currentParty)}`,
    messages,
  });
  if (!output) throw new Error("The ordering assistant returned nothing");
  const valid = new Set(dishes.filter((d) => d.confirmed && d.available).map((d) => d.id));
  output.items = output.items.filter((i) => valid.has(i.dishId));
  const party = keepDeclaredAllergies(currentParty, output.party as Person[]).map((p) => ({ ...p, notes: p.notes ?? "" }));
  const language = /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(output.language) ? output.language : "en";
  // The model's words can be wrong, so the rules engine's facts always follow them, and dish ids never reach the diner.
  const named = (t: string) => dishes.reduce((s, d) => s.replaceAll(d.id, d.name), t);
  const lines = output.items.map((i, n) => ({ id: `i${n}`, dishId: i.dishId, dishName: dishes.find((d) => d.id === i.dishId)!.name, forPerson: i.forPerson, qty: i.qty, unitPriceMinor: 0 }));
  const facts = findConflicts(lines, party, (id) => dishes.find((d) => d.id === id) ?? null).map(
    (c) => `${c.dishName} for ${c.person}: ${[c.contains.length && `contains ${c.contains.map(allergenLabel).join(", ")}`, c.mayContain.length && `may contain ${c.mayContain.map(allergenLabel).join(", ")}`].filter(Boolean).join("; ")}.`,
  );
  const reply = [named(output.reply), facts.length && `From the kitchen's confirmed list:\n${facts.join("\n")}`].filter(Boolean).join("\n\n");
  return { ...output, reply, party, language };
}

// ---------- 3. Translation for diner-facing messages ----------

export async function translate(text: string, language: string) {
  if (!language || language.startsWith("en")) return text;
  const cacheKey = `tr:${language}:${text}`; // agents poll order status, so never pay twice for the same sentence
  const cached = kv.get(cacheKey);
  if (cached) return cached;
  try {
    const { text: out } = await generateText({
      model: aiProvider().fast,
      system: "Translate the message for a restaurant customer. Keep dish names recognisable, keep numbers and prices exact. Output only the translation.",
      prompt: `Target language: ${language}\n\n${text}`,
    });
    if (out.trim()) kv.set(cacheKey, out.trim());
    return out.trim() || text;
  } catch {
    return text;
  }
}

// ---------- 4. Menu import: photo or PDF page of a menu → structured, unconfirmed rows ----------

export const ExtractedMenuSchema = z.object({
  dishes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      category: z.string(),
      price: z.number().describe("Price in pounds, e.g. 13.5"),
      components: z.array(z.object({ name: z.string().describe("A part of the dish, e.g. 'brioche bun', 'tahini dressing'"), allergens: z.array(allergenEnum) })).describe("Split the dish into its main parts so each allergen is attached to the part that carries it"),
      mayContain: z.array(allergenEnum),
      confidence: z.number().min(0).max(1).describe("How sure you are about the allergen rows. Below 0.8 if you had to infer ingredients the menu does not state."),
      reasoning: z.string().describe("One line: which words on the menu led to each allergen"),
    }),
  ),
});

export async function extractMenu(image: Uint8Array, mediaType: string) {
  const { output } = await generateText({
    model: aiProvider().smart,
    output: Output.object({ schema: ExtractedMenuSchema }),
    system: `You read restaurant menus and prepare a DRAFT allergen matrix for the owner to confirm. The 14 UK allergens are: ${ALLERGEN_IDS.map((a) => `${a} (${allergenLabel(a)})`).join(", ")}.
Infer likely ingredients from dish names (e.g. brioche contains gluten, eggs, milk; pesto usually contains tree nuts and milk; Caesar dressing usually contains fish, eggs, mustard). When you infer rather than read, lower the confidence. Nothing you produce is shown to diners until the owner confirms it.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract every dish on this menu with its price and a draft allergen matrix." },
          { type: "file", mediaType, data: image },
        ],
      },
    ],
  });
  return output?.dishes ?? [];
}

// ---------- 5. Owner insights: which dishes force sign-offs, and what would remove them ----------

export async function menuRiskReport(stats: { dish: string; signoffs: number; declines: number; edits: number; topAllergens: string[] }[], dishes: Dish[]) {
  const { text } = await generateText({
    model: aiProvider().smart,
    system: `You advise an independent restaurant owner. Be concrete and brief: 3 to 5 bullet points, each naming a dish, the pattern in the data, and one change to the recipe, the swaps offered, or the menu wording that would reduce sign-offs or declines. No hype. ${SAFETY_RULES}`,
    prompt: `Sign-off stats this week: ${JSON.stringify(stats)}\n\nMenu rows:\n${menuForPrompt(dishes)}`,
  });
  return text.trim();
}
