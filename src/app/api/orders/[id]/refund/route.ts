import { NextResponse } from "next/server";
import { refund } from "@/lib/orders";
import { fail } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { amountMinor, reason = "" } = await req.json();
    return NextResponse.json({ order: await refund(id, Number(amountMinor), reason) });
  } catch (e) {
    return fail(e);
  }
}
