import { NextResponse } from "next/server";
import { askCopilot } from "@/lib/copilot";
import { fail, rateLimit } from "@/lib/http";

export const maxDuration = 120;

export async function POST(req: Request) {
  const limited = rateLimit(req, "copilot", 30, 3_600_000);
  if (limited) return limited;
  try {
    const { question, history = [] } = await req.json();
    if (!question?.trim()) throw new Error("Ask a question");
    return NextResponse.json(await askCopilot(String(question), history));
  } catch (e) {
    return fail(e, 500);
  }
}
