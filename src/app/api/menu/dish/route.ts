import { NextResponse } from "next/server";
import { dishes } from "@/lib/db";
import { fail } from "@/lib/http";
import { ALLERGEN_IDS } from "@/lib/allergens";
import type { Dish } from "@/lib/types";
import { deriveContains } from "@/lib/dish";

export async function PUT(req: Request) {
  try {
    const d = (await req.json()) as Dish;
    const existing = dishes.get(d.id);
    if (!existing) throw new Error("Unknown dish");
    const ok = (l: string[]) => l.filter((a) => (ALLERGEN_IDS as string[]).includes(a));
    const components = (d.components ?? existing.components).map((c) => ({ ...c, allergens: ok(c.allergens) as Dish["contains"] }));
    const next: Dish = { ...existing, ...d, components, contains: deriveContains({ components }), mayContain: ok(d.mayContain) as Dish["mayContain"], priceMinor: Math.round(d.priceMinor) };
    dishes.save(next);
    return NextResponse.json({ dish: next });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  dishes.remove(id);
  return NextResponse.json({ ok: true });
}
