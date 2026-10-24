import { NextResponse } from "next/server";
import { onPayerApproved } from "@/lib/orders";
import { baseUrl } from "@/lib/http";

// PayPal sends the diner back here after they approve. We place the hold, then show the live status page.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("order") ?? "";
  try {
    await onPayerApproved(id);
  } catch (e) {
    console.error(e);
  }
  return NextResponse.redirect(`${baseUrl(req)}/o/${id}`);
}
