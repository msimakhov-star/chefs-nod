import { NextResponse } from "next/server";
import { dishes, orders, restaurants } from "@/lib/db";
import { menuRiskReport } from "@/lib/agents";
import { fail, rateLimit } from "@/lib/http";

export async function POST(req: Request) {
  const limited = rateLimit(req, "report", 10, 3_600_000);
  if (limited) return limited;
  try {
    const r = restaurants.first()!;
    const menu = dishes.list(r.id);
    const list = orders.list(r.id, 500);
    const stats = menu.map((d) => {
      const withDish = list.filter((o) => o.items.some((i) => i.dishId === d.id) && o.check?.questions.some((q) => o.items.find((i) => i.id === q.itemId)?.dishId === d.id));
      return {
        dish: d.name,
        signoffs: withDish.length,
        declines: withDish.filter((o) => o.decision?.outcome === "declined").length,
        edits: withDish.filter((o) => o.decision?.outcome === "approved_with_changes").length,
        topAllergens: [...new Set(withDish.flatMap((o) => o.party.flatMap((p) => p.allergies)).filter((a) => d.contains.includes(a) || d.mayContain.includes(a)))],
      };
    }).filter((s) => s.signoffs > 0);
    if (!stats.length) return NextResponse.json({ report: "No allergy sign-offs yet. Place a few orders first." });
    return NextResponse.json({ report: await menuRiskReport(stats, menu), stats });
  } catch (e) {
    return fail(e, 500);
  }
}
