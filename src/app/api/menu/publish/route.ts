import { NextResponse } from "next/server";
import { dishes, restaurants } from "@/lib/db";
import { upsertCatalogProduct } from "@/lib/paypal";
import { baseUrl, fail } from "@/lib/http";

// Sync every confirmed dish to the PayPal Catalog Products API.
export async function POST(req: Request) {
  try {
    const r = restaurants.first()!;
    const synced: string[] = [];
    for (const d of dishes.list(r.id).filter((x) => x.confirmed)) {
      d.paypalProductId = await upsertCatalogProduct(d, baseUrl(req));
      dishes.save(d);
      synced.push(d.paypalProductId);
    }
    return NextResponse.json({ synced });
  } catch (e) {
    return fail(e, 502);
  }
}
