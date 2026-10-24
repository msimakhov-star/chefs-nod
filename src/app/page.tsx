import Link from "next/link";
import { headers } from "next/headers";
import { restaurants } from "@/lib/db";
import { isSimulated } from "@/lib/paypal";
import { Brand, SandboxBanner } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import FlowDiagram from "@/components/FlowDiagram";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Order in plain words", body: "A parent, a carer or their AI assistant says who is eating and what they can't have. The assistant builds a basket from the owner-confirmed allergen menu.", api: "Claude / Gemini · MCP server" },
  { n: "2", title: "PayPal holds the money", body: "The diner approves in PayPal, but the order uses intent AUTHORIZE: the money is held, not taken.", api: "Orders v2 · AUTHORIZE" },
  { n: "3", title: "The chef reads the allergy", body: "The kitchen screen shows an AI-written question for every risky item, plus the swaps that remove the allergen.", api: "AI sign-off agent · webhooks" },
  { n: "4", title: "Nod, change, or decline", body: "Approve: capture. Approve with changes: capture a lower amount with a note to the payer. Decline: void the hold.", api: "Payments v2 · capture / void" },
];

export default async function Home() {
  const r = restaurants.first()!;
  const h = await headers();
  const origin = process.env.PUBLIC_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const mcpUrl = `${origin}/api/mcp`;
  return (
    <>
      <SandboxBanner simulated={isSimulated()} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">
        <header className="flex items-center justify-between py-6">
          <Brand />
          <nav className="flex gap-5 text-sm text-muted">
            <Link href={`/r/${r.slug}`} className="hover:text-ink">Order</Link>
            <Link href="/kitchen" className="hover:text-ink">Kitchen</Link>
            <Link href="/owner" className="hover:text-ink">Owner</Link>
          </nav>
        </header>

        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="mb-4 inline-flex rounded-full bg-basil-soft px-3 py-1 text-xs font-medium text-basil">For independent restaurants, and the AI assistants that will order from them</div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              The diner approves the money.
              <br />
              <span className="text-basil">The chef approves the food.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              An AI can&rsquo;t promise that a dish is free of sesame. Only the kitchen knows about the shared fryer. Chef&rsquo;s Nod lets people, and their AI assistants, order for someone with an allergy while PayPal holds the money until the chef has read the allergy and said yes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/r/${r.slug}`} className="rounded-full bg-basil px-6 py-3 font-medium text-white hover:bg-basil-dark">
                Order from {r.name}
              </Link>
              <Link href="/kitchen" className="rounded-full border border-ink/20 px-6 py-3 font-medium hover:border-ink">
                Open the kitchen screen
              </Link>
              <Link href="/owner" className="rounded-full px-6 py-3 font-medium text-muted hover:text-ink">
                Owner dashboard →
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">Tip for the demo: open the kitchen screen in a second window, then order.</p>
          </div>
          <div className="rounded-3xl border border-line bg-paper p-6 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Connect your AI assistant</div>
            <p className="mt-2 text-sm leading-relaxed">
              {r.name} is agent-ready. Add this MCP server to Claude, ChatGPT or Cursor and ask it to order dinner for someone with an allergy.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-cream p-3 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate">{mcpUrl}</span>
              <CopyButton text={mcpUrl} />
            </div>
            <div className="mt-3 rounded-xl bg-[#1d1a17] p-3 font-mono text-[11px] leading-relaxed text-[#f5efe6]">
              <div className="text-white/60"># Claude Code</div>
              <div className="break-all">claude mcp add --transport http chefs-nod {mcpUrl}</div>
            </div>
            <div className="mt-4 text-xs text-muted">Tools: get_menu · check_allergies · place_order · get_order_status</div>
          </div>
        </section>

        <section className="mb-4 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="font-display text-2xl font-semibold">Try it in 60 seconds</h2>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">
                <li>
                  Open the <Link href="/kitchen" className="font-medium text-basil underline-offset-2 hover:underline">kitchen screen</Link> in a second window.
                </li>
                <li>
                  On the <Link href={`/r/${r.slug}`} className="font-medium text-basil underline-offset-2 hover:underline">order page</Link>, tap the first example: dinner for someone with a sesame allergy.
                </li>
                <li>Approve the hold in PayPal with the sandbox buyer below. You are not charged.</li>
                <li>In the kitchen, pick the swaps the AI suggests and nod. Watch PayPal capture the lower amount, or decline and watch the hold disappear.</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-cream p-4 text-sm">
              <div className="font-medium">PayPal sandbox buyer</div>
              {process.env.SANDBOX_BUYER_EMAIL ? (
                <div className="mt-2 space-y-1 font-mono text-xs">
                  <div>Email: {process.env.SANDBOX_BUYER_EMAIL}</div>
                  <div>Password: {process.env.SANDBOX_BUYER_PASSWORD}</div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted">Shown here once configured. Any PayPal sandbox personal account works.</div>
              )}
              <div className="mt-3 text-xs text-muted">Test accounts on PayPal&rsquo;s sandbox hold no real money.</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-line bg-paper p-5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-basil font-display text-sm font-semibold text-white">{s.n}</div>
              <h3 className="mt-3 font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              <div className="mt-3 font-mono text-[11px] text-basil">{s.api}</div>
            </div>
          ))}
        </section>

        <section className="mb-6 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h2 className="mb-4 font-display text-2xl font-semibold">Who holds the money, step by step</h2>
          <FlowDiagram />
        </section>

        <section className="mt-6 rounded-3xl bg-basil px-6 py-8 text-white sm:px-10">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="font-display text-xl font-semibold">Built for UK allergen rules</div>
              <p className="mt-2 text-sm text-white/75">For food ordered remotely, allergen information has to be available before the purchase and again at delivery. Chef&rsquo;s Nod shows the confirmed statement before PayPal approval and prints a sign-off record for the bag.</p>
            </div>
            <div>
              <div className="font-display text-xl font-semibold">The AI never decides safety</div>
              <p className="mt-2 text-sm text-white/75">Allergen facts come only from rows the owner confirmed. Low-confidence rows from the menu photo stay hidden until a human checks them. The AI writes questions; the chef answers them.</p>
            </div>
            <div>
              <div className="font-display text-xl font-semibold">Price can only go down</div>
              <p className="mt-2 text-sm text-white/75">A swap that costs more would need the diner to approve again, so the kitchen can only capture the same or a lower amount than PayPal holds. Unanswered orders release themselves.</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
