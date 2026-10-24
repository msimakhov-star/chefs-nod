import { dishes, restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { SandboxBanner } from "@/components/ui";
import KitchenBoard from "./KitchenBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kitchen · Chef's Nod" };

export default function Page() {
  const r = restaurants.first()!;
  return (
    <div className="kitchen flex min-h-screen flex-col">
      <SandboxBanner simulated={isSimulated()} />
      <KitchenBoard restaurant={r} menu={dishes.list(r.id)} />
    </div>
  );
}
