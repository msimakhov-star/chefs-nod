import { NextResponse } from "next/server";
import { dishes, newId, restaurants } from "@/lib/db";
import { extractMenu } from "@/lib/agents";
import { fail } from "@/lib/http";
import type { Dish } from "@/lib/types";
import type { AllergenId } from "@/lib/allergens";
import { deriveContains } from "@/lib/dish";

export const maxDuration = 120;

// Menu photo in, DRAFT allergen rows out. Nothing here is visible to diners until the owner confirms each row.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("menu");
    if (!(file instanceof File)) throw new Error("Upload a menu photo");
    const r = restaurants.first()!;
    const extracted = await extractMenu(new Uint8Array(await file.arrayBuffer()), file.type || "image/jpeg");
    const drafts: Dish[] = extracted.map((x) => ({
      id: newId("dish"),
      restaurantId: r.id,
      name: x.name,
      description: x.description,
      category: x.category || "Menu",
      priceMinor: Math.round(x.price * 100),
      ingredients: x.components.map((c) => c.name),
      components: x.components.map((c, i) => ({ id: `c${i + 1}`, name: c.name, allergens: c.allergens as AllergenId[] })),
      contains: deriveContains({ components: x.components.map((c, i) => ({ id: `c${i + 1}`, name: c.name, allergens: c.allergens as AllergenId[] })) }),
      mayContain: x.mayContain as AllergenId[],
      swaps: [],
      confirmed: false,
      confidence: x.confidence,
      paypalProductId: null,
      available: true,
    }));
    drafts.forEach((d) => dishes.save(d));
    return NextResponse.json({ drafts, reasoning: extracted.map((x) => ({ name: x.name, reasoning: x.reasoning })) });
  } catch (e) {
    return fail(e, 500);
  }
}
