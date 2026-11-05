"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALLERGENS, allergenLabel, type AllergenId } from "@/lib/allergens";
import { findConflicts } from "@/lib/conflicts";
import type { Dish, OrderItem, Person, Restaurant } from "@/lib/types";
import { AllergenChip, Brand, gbp } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string };
type Line = { key: string; dishId: string; qty: number; forPerson: string };

const LANGS = [
  { code: "en-GB", label: "EN", name: "English" },
  { code: "ru-RU", label: "RU", name: "Русский" },
  { code: "es-ES", label: "ES", name: "Español" },
  { code: "fr-FR", label: "FR", name: "Français" },
  { code: "pl-PL", label: "PL", name: "Polski" },
  { code: "zh-CN", label: "中文", name: "中文" },
  { code: "ar-SA", label: "AR", name: "العربية" },
  { code: "hi-IN", label: "HI", name: "हिन्दी" },
];

const EXAMPLES = [
  "Dinner for me and Dan. He has a sesame allergy, I'm vegetarian. About £30.",
  "Order for my mum, she's coeliac and can't have dairy. Something warm.",
  "Закажи ужин для меня и сына, у него аллергия на арахис и кунжут.",
];

export default function DinerApp({ restaurant, menu, aiName }: { restaurant: Restaurant; menu: Dish[]; aiName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [party, setParty] = useState<Person[]>([{ name: "Me", allergies: [], notes: "" }]);
  const [lines, setLines] = useState<Line[]>([]);
  const [language, setLanguage] = useState("en");
  const [speechLang, setSpeechLang] = useState("en-GB");
  const [listening, setListening] = useState(false);
  const aiReady = aiName !== "not configured";
  const [tab, setTab] = useState<"assistant" | "menu">(aiReady ? "assistant" : "menu");
  const [dinerName, setDinerName] = useState("");
  const [readStatement, setReadStatement] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [hideConflicts, setHideConflicts] = useState(false);
  const payRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLElement>(null);
  const [colTop, setColTop] = useState(16);
  const [payVisible, setPayVisible] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // A column taller than the window pins by its bottom edge, so scrolling the page always reaches the PayPal button.
  useEffect(() => {
    const el = colRef.current;
    if (!el) return;
    const fit = () => setColTop(Math.min(16, window.innerHeight - el.offsetHeight - 16));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  // The phone's basket bar steps aside once the pay card is on screen, so it never competes with the PayPal button.
  useEffect(() => {
    if (!payRef.current) return setPayVisible(false);
    const io = new IntersectionObserver(([e]) => setPayVisible(e.isIntersecting));
    io.observe(payRef.current);
    return () => io.disconnect();
  }, [lines.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember who eats with you and their allergies, on this device only.
  const PARTY_KEY = "chefsnod.party";
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PARTY_KEY) || "null");
      if (Array.isArray(saved) && saved.length) setParty(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (party.some((p) => p.allergies.length || p.name !== "Me")) localStorage.setItem(PARTY_KEY, JSON.stringify(party));
    } catch {}
  }, [party]);

  const dishById = (id: string) => menu.find((d) => d.id === id) ?? null;
  const items: OrderItem[] = useMemo(
    () => lines.map((l) => ({ id: l.key, dishId: l.dishId, dishName: dishById(l.dishId)?.name ?? "", forPerson: l.forPerson, qty: l.qty, unitPriceMinor: dishById(l.dishId)?.priceMinor ?? 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, menu],
  );
  const conflicts = useMemo(() => findConflicts(items, party, dishById), [items, party]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = items.reduce((s, i) => s + i.unitPriceMinor * i.qty, 0);

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setThinking(true);
    setChatError("");
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: restaurant.slug, messages: next, party }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The assistant is unavailable");
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (data.language) setLanguage(data.language);
      if (data.party?.length) setParty(data.party.map((p: Person) => ({ ...p, notes: p.notes || "" })));
      if (data.items?.length) setLines(data.items.map((i: { dishId: string; qty: number; forPerson: string }, n: number) => ({ key: `l${Date.now()}${n}`, ...i })));
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
      setMessages(next);
    } finally {
      setThinking(false);
    }
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Rec) {
      setChatError("Voice input needs Chrome or Edge. You can type instead.");
      return;
    }
    const rec = new Rec();
    rec.lang = speechLang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: SpeechEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput(finalText + interim);
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function addDish(d: Dish) {
    setLines((ls) => [...ls, { key: `l${Date.now()}`, dishId: d.id, qty: 1, forPerson: party[0]?.name ?? "Me" }]);
  }

  async function pay() {
    setPaying(true);
    setError("");
    // The kitchen should see a real name, not "Me".
    const me = dinerName.trim();
    const named = (n: string) => (n === "Me" && me ? me : n);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantSlug: restaurant.slug, dinerName: dinerName || party[0]?.name || "Guest", language, party: party.map((p) => ({ ...p, name: named(p.name) })), items: lines.map(({ dishId, qty, forPerson }) => ({ dishId, qty, forPerson: named(forPerson) })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the PayPal order");
      window.location.href = data.order.approvalUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPaying(false);
    }
  }

  const people = party.map((p) => p.name);
  const byCategory = menu.reduce<Record<string, Dish[]>>((acc, d) => ((acc[d.category] ??= []).push(d), acc), {});

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-24 sm:px-6 lg:pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Brand sub="Allergy orders the chef signs off before you pay" />
        <div className="sm:text-right">
          <h1 className="font-display text-lg font-semibold">{restaurant.name}</h1>
          <div className="text-xs text-muted">{restaurant.city} · collection only</div>
        </div>
      </header>

      <div className="grid flex-1 gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Left: assistant or menu */}
        <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
          <div role="tablist" className="flex border-b border-line text-sm">
            {(["assistant", "menu"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 px-4 py-3 font-medium ${tab === t ? "border-b-2 border-basil text-basil" : "text-muted hover:text-ink"}`}>
                {t === "assistant" ? (aiReady ? "Ask the ordering assistant" : "Assistant (off)") : "Browse the menu"}
              </button>
            ))}
          </div>

          {tab === "assistant" ? (
            <>
              <div aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-5">
                {!aiReady && (
                  <div className="rounded-xl bg-saffron-soft px-4 py-4 text-[#8a5a10]">
                    <p>The ordering assistant is off on this server. You can still order from the menu, and the chef still checks every allergy.</p>
                    <button onClick={() => setTab("menu")} className="mt-3 min-h-11 rounded-full bg-basil px-5 font-medium text-white">
                      Browse the menu
                    </button>
                  </div>
                )}
                {aiReady && messages.length === 0 && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted">
                      Tell the assistant who is eating and what they can&rsquo;t have, in any language. It builds the basket from the restaurant&rsquo;s confirmed allergen menu, then the chef checks it before you&rsquo;re charged.
                    </p>
                    <div className="grid gap-2">
                      {EXAMPLES.map((e) => (
                        <button key={e} onClick={() => send(e)} className="rounded-xl border border-line bg-cream px-4 py-3 text-left text-sm hover:border-basil">
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${m.role === "user" ? "bg-basil text-white" : "bg-cream"}`}>{m.content}</div>
                  </div>
                ))}
                {thinking && <div className="w-24 animate-pulse rounded-2xl bg-cream px-4 py-2.5 text-sm text-muted">Thinking…</div>}
                {chatError && (
                  <div role="alert" className="rounded-xl bg-chili-soft px-4 py-3 text-sm text-chili">
                    {chatError}{" "}
                    <button onClick={() => setTab("menu")} className="font-medium underline underline-offset-2">
                      Browse the menu instead
                    </button>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              {aiReady && (
              <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex flex-wrap items-center gap-2 border-t border-line p-3"
              >
                <select value={speechLang} onChange={(e) => setSpeechLang(e.target.value)} className="shrink-0 rounded-lg border border-line bg-cream px-1.5 py-2 text-xs" aria-label="Voice language" title="Language for voice input">
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code} title={l.name}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={toggleMic} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${listening ? "pulse-ring bg-saffron text-white" : "bg-cream text-ink hover:bg-line"}`} aria-label={listening ? "Stop voice input" : "Speak your order"}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                  </svg>
                </button>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening…" : "Who's eating? Any allergies?"} aria-label="Your message" className="order-first min-w-0 flex-1 basis-full rounded-full border border-[#8f8578] bg-cream px-4 py-2.5 text-base outline-none focus:border-basil sm:order-none sm:basis-0" />
                <button disabled={!input.trim() || thinking} className="rounded-full bg-basil px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">
                  Send
                </button>
              </form>
              <div className="px-4 pb-2 text-xs text-muted">Assistant: {aiName}. It can make mistakes, so check your basket. The allergen statement you tick before paying comes only from the owner&rsquo;s confirmed rows, and the chef still decides.</div>
              </>
              )}
            </>
          ) : (
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>Solid chips: contains. Dashed chips: may contain. Red marks an allergy in your party.</span>
                {party.some((p) => p.allergies.length) && (
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" checked={hideConflicts} onChange={(e) => setHideConflicts(e.target.checked)} className="h-5 w-5 accent-basil" />
                    Hide dishes with your party&rsquo;s allergens
                  </label>
                )}
              </div>
              {Object.entries(byCategory).map(([cat, list]) => (
                <div key={cat}>
                  <h3 className="mb-2 font-display text-lg font-semibold">{cat}</h3>
                  <div className="divide-y divide-line">
                    {list.map((d) => {
                      const mine = party.flatMap((p) => p.allergies);
                      const hits = mine.filter((a) => d.contains.includes(a));
                      const mayHits = mine.filter((a) => d.mayContain.includes(a) && !d.contains.includes(a));
                      if (hideConflicts && (hits.length || mayHits.length)) return null;
                      const inBasket = lines.filter((l) => l.dishId === d.id).length;
                      return (
                        <div key={d.id} className="flex items-start justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <div className="font-medium">{d.name}</div>
                            <div className="text-sm text-muted">{d.description}</div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {d.contains.map((a) => (
                                <AllergenChip key={a} id={a} small tone={hits.includes(a) ? "conflict" : "neutral"} />
                              ))}
                              {d.mayContain
                                .filter((a) => !d.contains.includes(a))
                                .map((a) => (
                                  <AllergenChip key={a} id={a} small tone={mayHits.includes(a) ? "mayConflict" : "may"} />
                                ))}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <div className="font-medium">{gbp(d.priceMinor)}</div>
                            <button onClick={() => addDish(d)} aria-label={inBasket ? `Add another ${d.name}, ${inBasket} in basket` : `Add ${d.name}`} className="min-h-11 w-24 rounded-full border border-basil px-4 text-sm font-medium text-basil hover:bg-basil hover:text-white">
                              {inBasket ? `Added · ${inBasket}` : "Add"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: party, basket, statement, pay */}
        <section ref={colRef} style={{ top: colTop }} className="contents lg:sticky lg:flex lg:flex-col lg:gap-4 lg:self-start">
          <div className="order-first rounded-2xl border border-line bg-paper p-5 shadow-sm lg:order-none">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Who&rsquo;s eating</h2>
              <button onClick={() => setParty((p) => [...p, { name: `Guest ${p.length + 1}`, allergies: [], notes: "" }])} className="min-h-11 px-2 text-sm font-medium text-basil">
                + Add person
              </button>
            </div>
            <p className="-mt-1 mb-3 text-xs text-muted">Saved on this device for next time. Nothing is shared until you order.</p>
            <div className="space-y-3">
              {party.map((p, idx) => (
                <PersonRow
                  key={idx}
                  person={p}
                  onChange={(np) =>
                    setParty((all) => {
                      const copy = [...all];
                      const old = copy[idx].name;
                      copy[idx] = np;
                      if (old !== np.name) setLines((ls) => ls.map((l) => (l.forPerson === old ? { ...l, forPerson: np.name } : l)));
                      return copy;
                    })
                  }
                  onRemove={party.length > 1 ? () => setParty((all) => all.filter((_, i) => i !== idx)) : undefined}
                />
              ))}
            </div>
          </div>

          <div id="basket" className="scroll-mt-4 rounded-2xl border border-line bg-paper p-5 shadow-sm">
            <h2 className="mb-3 font-display text-lg font-semibold">Basket</h2>
            {lines.length === 0 ? (
              <p className="text-sm text-muted">{aiReady ? "Empty. Ask the assistant, or add dishes from the menu." : "Empty. Add dishes from the menu."}</p>
            ) : (
              <div className="divide-y divide-line">
                {lines.map((l) => {
                  const d = dishById(l.dishId)!;
                  const c = conflicts.find((x) => x.itemId === l.key);
                  return (
                    <div key={l.key} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {l.qty > 1 && `${l.qty} × `}
                            {d.name}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                            for
                            <select value={l.forPerson} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, forPerson: e.target.value } : x)))} aria-label={`Who the ${d.name} is for`} className="min-h-11 rounded border border-[#8f8578] bg-cream px-2 text-base">
                              {people.map((n) => (
                                <option key={n}>{n}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="-mt-2.5 flex items-start gap-1">
                          <span className="pt-3 text-sm font-medium">{gbp(d.priceMinor * l.qty)}</span>
                          <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid h-11 w-11 place-items-center text-muted hover:text-chili" aria-label={`Remove ${d.name}`}>
                            ✕
                          </button>
                        </div>
                      </div>
                      {c && (
                        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${c.contains.length ? "bg-chili-soft text-chili" : "bg-saffron-soft text-[#8a5a10]"}`}>
                          {c.contains.length > 0 && <>Contains {c.contains.map(allergenLabel).join(", ")}. </>}
                          {c.mayContain.length > 0 && <>May contain {c.mayContain.map(allergenLabel).join(", ")}. </>}
                          {c.fixingSwapIds.length ? (
                            <>
                              {c.resolvable ? "The kitchen can offer: " : "The kitchen can reduce it with: "}
                              {c.fixingSwapIds.map((s) => d.swaps.find((w) => w.id === s)?.label).join(" + ")}. The chef decides.
                            </>
                          ) : (
                            <>The chef will decide if this can be made for {c.person}.</>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div ref={payRef} className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
              <h2 className="mb-2 font-display text-lg font-semibold">Allergen information</h2>
              <p className="mb-3 text-xs text-muted">From the restaurant&rsquo;s confirmed allergen matrix. Shown before you pay, as UK food law expects for remote orders.</p>
              <ul className="mb-4 space-y-1.5 text-sm">
                {items.map((i) => {
                  const d = dishById(i.dishId)!;
                  return (
                    <li key={i.id}>
                      <span className="font-medium">{d.name}</span>: contains {d.contains.map(allergenLabel).join(", ") || "none of the 14 allergens"}
                      {d.mayContain.some((a) => !d.contains.includes(a)) && (
                        <>
                          ; may contain{" "}
                          {d.mayContain
                            .filter((a) => !d.contains.includes(a))
                            .map(allergenLabel)
                            .join(", ")}
                        </>
                      )}
                      .
                    </li>
                  );
                })}
              </ul>
              <label htmlFor="diner-name" className="mb-1 block text-sm font-medium">Your name, for the order</label>
              <input id="diner-name" value={dinerName} onChange={(e) => setDinerName(e.target.value)} className="mb-3 w-full rounded-lg border border-[#8f8578] bg-cream px-3 py-2 text-base outline-none focus:border-basil" />
              <label className="mb-4 flex items-start gap-3 py-2 text-sm">
                <input type="checkbox" checked={readStatement} onChange={(e) => setReadStatement(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-basil" />I have read the allergen information for everyone I&rsquo;m ordering for.
              </label>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm text-muted">PayPal holds</span>
                <span className="font-display text-2xl font-semibold">{gbp(total)}</span>
              </div>
              <button onClick={pay} disabled={!readStatement || paying} className="w-full rounded-full bg-pp-gold px-5 py-3.5 text-[15px] font-semibold text-pp-blue shadow-sm transition hover:brightness-95 disabled:bg-line disabled:text-muted disabled:shadow-none">
                {paying ? "Opening PayPal…" : "Approve the hold with PayPal"}
              </button>
              {!readStatement && <p className="mt-2.5 text-center text-xs font-medium text-muted">Tick the box above to continue.</p>}
              <p className="mt-2.5 text-center text-xs text-muted">You are only charged after the chef confirms. If they change a dish the price can only go down; if they decline, the hold is released.</p>
            </div>
          )}
          {error && <div className="rounded-xl bg-chili-soft px-4 py-3 text-sm text-chili">{error}</div>}
        </section>
      </div>
      {lines.length > 0 && !payVisible && (
        <a href="#basket" className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-between rounded-full bg-basil px-5 py-3 text-white shadow-lg lg:hidden">
          <span className="text-sm">
            {lines.length} item{lines.length > 1 ? "s" : ""}
            {conflicts.length > 0 && ` · ${conflicts.length} to check`}
          </span>
          <span className="whitespace-nowrap font-semibold">{gbp(total)} · Review</span>
        </a>
      )}
    </div>
  );
}

function PersonRow({ person, onChange, onRemove }: { person: Person; onChange: (p: Person) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <input value={person.name} onChange={(e) => onChange({ ...person, name: e.target.value })} className="min-h-11 min-w-0 flex-1 border-b border-[#8f8578] bg-transparent text-base font-medium outline-none" aria-label="Name" />
        <button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-h-11 px-2 text-sm font-medium text-basil">
          {open ? "Done" : "Edit allergies"}
        </button>
        {onRemove && (
          <button onClick={onRemove} aria-label={`Remove ${person.name}`} className="min-h-11 px-2 text-sm text-muted hover:text-chili">
            Remove
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {person.allergies.length ? person.allergies.map((a) => <AllergenChip key={a} id={a} tone="conflict" small />) : <span className="text-xs text-muted">No allergies noted</span>}
        {person.notes && <span className="text-xs text-muted">· {person.notes}</span>}
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALLERGENS.map((a) => {
            const on = person.allergies.includes(a.id);
            return (
              <button
                key={a.id}
                aria-pressed={on}
                onClick={() => onChange({ ...person, allergies: on ? person.allergies.filter((x) => x !== a.id) : [...person.allergies, a.id as AllergenId] })}
                className={`min-h-11 rounded-full border px-3 py-1 text-sm ${on ? "border-chili bg-chili text-white" : "border-line bg-cream hover:border-ink"}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SpeechEvent = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: SpeechEvent) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
