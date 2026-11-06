import { notFound, redirect } from "next/navigation";
import { orders, restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { Brand, gbp, SandboxBanner } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Simulated approval · Chef's Nod" };

// Stands in for PayPal's approval page when the server has no sandbox keys. It says so, and looks like this app, not like PayPal.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSimulated()) notFound();
  const o = orders.get(id);
  if (!o) notFound();
  if (o.status !== "awaiting_payment") redirect(`/o/${o.id}`);
  const r = restaurants.byId(o.restaurantId)!;
  return (
    <>
      <SandboxBanner simulated />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <Brand sub={r.name} />
        <div className="mt-6 rounded-3xl border-2 border-dashed border-line bg-paper p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Simulated payment approval</div>
          <h1 className="mt-2 font-display text-2xl font-semibold">Approve a hold of {gbp(o.authorizedMinor)}</h1>
          <p className="mt-2 text-sm text-muted">
            With PayPal sandbox keys on this server, this step is PayPal&rsquo;s own approval page for an Orders v2 order with intent AUTHORIZE. Here nothing is sent to PayPal.
          </p>
          <ul className="mt-4 space-y-1 text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>
                  {i.qty > 1 && `${i.qty}× `}
                  {i.dishName} <span className="text-muted">for {i.forPerson}</span>
                </span>
                <span>{gbp(i.unitPriceMinor * i.qty)}</span>
              </li>
            ))}
          </ul>
          <a href={`/api/paypal/return?order=${o.id}`} className="mt-6 flex min-h-11 items-center justify-center rounded-full bg-basil px-5 font-semibold text-white">
            Approve the hold (simulated)
          </a>
          <a href={`/o/${o.id}?cancelled=1`} className="mt-3 flex min-h-11 items-center justify-center text-sm text-muted">
            Cancel
          </a>
          <p className="mt-3 text-center text-xs text-muted">A hold is not a charge. You pay only after the chef confirms.</p>
        </div>
      </main>
    </>
  );
}
