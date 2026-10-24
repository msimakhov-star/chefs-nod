import Link from "next/link";
import { allergenLabel } from "@/lib/allergens";
import type { OrderStatus } from "@/lib/types";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#1f5a3d" />
      <path d="M12 21.5c-2.6-.4-4-2.4-4-4.6 0-2.6 2.1-4.6 4.6-4.6.5 0 1 .1 1.5.2C15 10.4 17.3 9 20 9s5 1.4 5.9 3.5c.5-.1 1-.2 1.5-.2 2.5 0 4.6 2 4.6 4.6 0 2.2-1.4 4.2-4 4.6V27H12v-5.5Z" fill="#fbf7f0" />
      <path d="M15 22.5l3.4 3.4 6.8-7" fill="none" stroke="#1f5a3d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="28.5" width="16" height="2.6" rx="1.3" fill="#fbf7f0" />
    </svg>
  );
}

export function Brand({ sub }: { sub?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Logo />
      <div className="leading-tight">
        <div className="font-display text-xl font-semibold tracking-tight">Chef&rsquo;s Nod</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </Link>
  );
}

export function AllergenChip({ id, tone = "neutral", small }: { id: string; tone?: "neutral" | "conflict" | "may" | "ok"; small?: boolean }) {
  const tones = {
    neutral: "bg-cream text-ink border-line",
    conflict: "bg-chili-soft text-chili border-chili/30 font-semibold",
    may: "bg-saffron-soft text-[#8a5a10] border-saffron/40",
    ok: "bg-basil-soft text-basil border-basil/30",
  };
  return <span className={`inline-flex items-center rounded-full border ${small ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"} ${tones[tone]}`}>{allergenLabel(id)}</span>;
}

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  awaiting_payment: { label: "Awaiting PayPal approval", cls: "bg-[#e8f1fc] text-pp-blue" },
  awaiting_chef: { label: "Held · chef checking", cls: "bg-saffron-soft text-[#8a5a10]" },
  captured: { label: "Confirmed · charged", cls: "bg-basil-soft text-basil" },
  voided: { label: "Declined · not charged", cls: "bg-chili-soft text-chili" },
  expired: { label: "Expired · not charged", cls: "bg-[#eee] text-muted" },
  refunded: { label: "Refunded", cls: "bg-[#eee] text-muted" },
  failed: { label: "Payment failed", cls: "bg-chili-soft text-chili" },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export const gbp = (minor: number | null | undefined) => (minor == null ? "–" : `£${(minor / 100).toFixed(2)}`);

export function SandboxBanner({ simulated }: { simulated: boolean }) {
  return simulated ? (
    <div className="no-print bg-chili px-4 py-1.5 text-center text-xs font-medium text-white">
      Simulated payments: PayPal sandbox keys are not configured on this server.
    </div>
  ) : (
    <div className="no-print bg-pp-blue px-4 py-1.5 text-center text-xs text-white/90">
      Demo on the PayPal sandbox. No real money moves. Fictional restaurant.
    </div>
  );
}
