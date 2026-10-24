import { NextResponse } from "next/server";
import { chefDecides } from "@/lib/orders";
import { fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { outcome, appliedSwaps = [], reason = "" } = await req.json();
    if (!["approved", "approved_with_changes", "declined"].includes(outcome)) throw new Error("Bad outcome");
    return NextResponse.json({ order: await chefDecides(id, outcome, appliedSwaps, reason) });
  } catch (e) {
    return fail(e);
  }
}
