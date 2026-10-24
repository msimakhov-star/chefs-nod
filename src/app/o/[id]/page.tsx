import { notFound } from "next/navigation";
import { dishes, orders, restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { SandboxBanner } from "@/components/ui";
import OrderStatusView from "./OrderStatusView";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = orders.get(id);
  if (!order) notFound();
  const r = restaurants.byId(order.restaurantId)!;
  return (
    <>
      <SandboxBanner simulated={isSimulated()} />
      <OrderStatusView initial={order} restaurant={r} menu={dishes.list(r.id)} />
    </>
  );
}
