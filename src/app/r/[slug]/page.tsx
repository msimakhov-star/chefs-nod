import { notFound } from "next/navigation";
import { dishes, restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { aiName } from "@/lib/ai";
import { SandboxBanner } from "@/components/ui";
import DinerApp from "./DinerApp";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = restaurants.bySlug(slug);
  if (!r) notFound();
  const menu = dishes.list(r.id).filter((d) => d.confirmed && d.available);
  return (
    <>
      <SandboxBanner simulated={isSimulated()} />
      <DinerApp restaurant={r} menu={menu} aiName={aiName()} />
    </>
  );
}
