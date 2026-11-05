// The whole product in four cards that appear one after another (CSS only; static if reduced motion is on).
export default function HeroStory() {
  return (
    <div role="img" className="hero-story relative mx-auto w-full max-w-[460px]" aria-label="How an order works, in four steps">
      {/* 1. The request */}
      <div data-step="1" className="rounded-3xl border border-line bg-paper p-4 shadow-[0_10px_30px_rgba(28,25,23,0.08)]">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Diner, or their AI assistant</div>
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-basil px-3.5 py-2 text-sm text-white">Dinner for me and Dan. He&rsquo;s allergic to sesame.</div>
        <div className="mt-2 w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-cream px-3.5 py-2 text-sm">Halloumi burger for Dan, falafel wrap for you. The chef checks the sesame before you&rsquo;re charged.</div>
      </div>

      {/* 2. The hold */}
      <div data-step="2" className="relative mt-3 ml-8 mr-2 flex items-center justify-between rounded-2xl border border-[#b9d3f3] bg-[#eef5fd] px-4 py-3 shadow-[0_10px_30px_rgba(0,48,135,0.08)]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pp-blue/70">PayPal</div>
          <div className="text-sm font-medium text-pp-blue">Holding £24.50 · not charged yet</div>
        </div>
        <span className="rounded-full bg-pp-blue px-2.5 py-1 font-mono text-[10px] text-white">AUTHORIZE</span>
      </div>

      {/* 3. The kitchen */}
      <div data-step="3" className="relative mt-3 mr-6 rounded-3xl bg-[#1d1a17] p-4 text-[#f5efe6] shadow-[0_18px_40px_rgba(28,25,23,0.25)]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-white/60">Kitchen · for Dan</div>
            <div className="font-display text-lg font-semibold">Allergy check: Sesame</div>
          </div>
          <span className="rounded bg-chili/80 px-1.5 text-[11px] font-semibold">contains Sesame</span>
        </div>
        <p className="mt-1.5 text-[13px] text-white/75">Sesame is in the brioche bun and the tahini slaw. Can you swap both?</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span data-chip="1" className="rounded-full border border-white/20 px-2.5 py-1 text-[11px]">
            Plain sourdough bun
          </span>
          <span data-chip="2" className="rounded-full border border-white/20 px-2.5 py-1 text-[11px]">
            Leave out the tahini slaw (−£1.50)
          </span>
        </div>
        <div data-nod className="mt-3 rounded-xl bg-[#7fd1a0] px-3 py-2.5 text-center text-sm font-bold text-black">
          Nod with changes · charge £23.00
        </div>
      </div>

      {/* 4. The result */}
      <div data-step="4" className="relative mt-3 ml-10 flex items-center gap-3 rounded-2xl border border-basil/30 bg-basil-soft px-4 py-3 shadow-[0_10px_30px_rgba(31,90,61,0.12)]">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-basil text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div className="text-sm">
          <div className="font-semibold text-basil">Confirmed by the chef</div>
          <div className="text-basil/80">Charged £23.00 · £1.50 released back</div>
        </div>
      </div>
    </div>
  );
}
