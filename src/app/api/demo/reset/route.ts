import { NextResponse } from "next/server";
import { db, dishes, restaurants } from "@/lib/db";
import { SEED_DISHES, SEED_RESTAURANT } from "@/lib/seed";
import { rateLimit } from "@/lib/http";

// Puts the demo back to its starting state: seed menu, no orders. PayPal sandbox records are untouched.
export async function POST(req: Request) {
  const limited = rateLimit(req, "reset", 6, 3_600_000);
  if (limited) return limited;
  const { what = "all" } = await req.json().catch(() => ({}));
  if (what === "drafts") {
    const r = restaurants.first()!;
    dishes.list(r.id).filter((d) => !d.confirmed).forEach((d) => dishes.remove(d.id));
  } else {
    db().exec("DELETE FROM orders; DELETE FROM events;");
    restaurants.save(SEED_RESTAURANT);
    dishes.replaceAll(SEED_RESTAURANT.id, SEED_DISHES);
  }
  return NextResponse.json({ ok: true });
}
