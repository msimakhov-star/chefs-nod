import { NextResponse } from "next/server";
import { dishes, restaurants } from "@/lib/db";
import { orderingAssistant } from "@/lib/agents";
import { fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { slug, messages, party = [] } = await req.json();
    const r = restaurants.bySlug(slug);
    if (!r) throw new Error("Unknown restaurant");
    return NextResponse.json(await orderingAssistant(messages, dishes.list(r.id), r, party));
  } catch (e) {
    return fail(e, 500);
  }
}
