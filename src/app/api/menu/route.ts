import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { dishes, restaurants } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = restaurants.bySlug(url.searchParams.get("slug") ?? "") ?? restaurants.first();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = process.env.STAFF_KEY;
  const given = req.headers.get("x-staff-key") ?? (await cookies()).get("staff")?.value;
  const staff = url.searchParams.get("all") === "1" && (!key || given === key); // unconfirmed AI drafts never reach the public
  return NextResponse.json({ restaurant: r, dishes: dishes.list(r.id).filter((d) => staff || (d.confirmed && d.available)) });
}
