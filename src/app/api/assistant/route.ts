import { NextResponse } from "next/server";
import { dishes, restaurants } from "@/lib/db";
import { orderingAssistant } from "@/lib/agents";
import { fail, rateLimit } from "@/lib/http";

export async function POST(req: Request) {
  const limited = rateLimit(req, "assistant", 40, 3_600_000);
  if (limited) return limited;
  try {
    const { slug, messages, party = [] } = await req.json();
    const r = restaurants.bySlug(slug);
    if (!r) throw new Error("Unknown restaurant");
    return NextResponse.json(await orderingAssistant(messages, dishes.list(r.id), r, party));
  } catch (e) {
    return fail(e, 500);
  }
}
