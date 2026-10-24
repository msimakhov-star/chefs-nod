import { NextResponse } from "next/server";
import { runReplay } from "@/lib/replay";
import { baseUrl, fail } from "@/lib/http";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { count = 6, decide = false } = await req.json().catch(() => ({}));
    return NextResponse.json({ orders: await runReplay(Number(count), Boolean(decide), baseUrl(req)) });
  } catch (e) {
    return fail(e, 500);
  }
}
