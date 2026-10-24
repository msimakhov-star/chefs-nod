import { NextResponse } from "next/server";
import { dishes, restaurants } from "@/lib/db";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const r = restaurants.bySlug(slug) ?? restaurants.first();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ restaurant: r, dishes: dishes.list(r.id) });
}
