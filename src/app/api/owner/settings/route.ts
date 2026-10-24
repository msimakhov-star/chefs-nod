import { NextResponse } from "next/server";
import { restaurants } from "@/lib/db";

export async function PUT(req: Request) {
  const r = restaurants.first()!;
  const { kitchenNotes, signoffMinutes, name } = await req.json();
  const next = { ...r, kitchenNotes: String(kitchenNotes ?? r.kitchenNotes), signoffMinutes: Math.max(2, Math.min(60, Number(signoffMinutes) || r.signoffMinutes)), name: String(name || r.name) };
  restaurants.save(next);
  return NextResponse.json({ restaurant: next });
}
