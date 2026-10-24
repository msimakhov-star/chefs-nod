import { dishes, restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { aiName } from "@/lib/ai";
import { SandboxBanner } from "@/components/ui";
import OwnerApp from "./OwnerApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner · Chef's Nod" };

export default function Page() {
  const r = restaurants.first()!;
  return (
    <>
      <SandboxBanner simulated={isSimulated()} />
      <OwnerApp restaurant={r} initialMenu={dishes.list(r.id)} aiName={aiName()} />
    </>
  );
}
