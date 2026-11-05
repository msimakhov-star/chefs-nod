import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Logo } from "@/components/ui";

export const metadata = { title: "Staff sign-in · Chef's Nod" };

const safeNext = (n: string) => (/^\/(kitchen|owner)(\/|$)/.test(n) ? n : "/kitchen");

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; wrong?: string }> }) {
  const { next = "/kitchen", wrong } = await searchParams;
  // STAFF_KEY_HINT=1 prints the key for judges on the public demo. A real restaurant leaves it off.
  const hint = process.env.STAFF_KEY_HINT === "1" ? process.env.STAFF_KEY : null;

  async function enter(form: FormData) {
    "use server";
    const to = safeNext(String(form.get("next")));
    if (String(form.get("key")) !== process.env.STAFF_KEY) redirect(`/staff?wrong=1&next=${encodeURIComponent(to)}`);
    (await cookies()).set("staff", String(form.get("key")), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.PUBLIC_URL?.startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 7 });
    redirect(to);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-4">
      <Logo className="h-10 w-10" />
      <h1 className="font-display text-3xl font-semibold">Staff only</h1>
      <p className="text-muted">The kitchen and owner screens can move money, so they need the restaurant&rsquo;s staff key.</p>
      {hint && (
        <p className="rounded-xl bg-saffron-soft px-4 py-3 text-sm">
          Hackathon demo key: <code className="font-mono font-semibold">{hint}</code>
        </p>
      )}
      <form action={enter} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label htmlFor="key" className="text-sm font-medium">Staff key</label>
        <input id="key" name="key" type="password" required defaultValue={hint ?? ""} autoComplete="off" className="min-h-11 rounded-xl border border-[#8f8578] bg-paper px-4 text-base" />
        {wrong && <p role="alert" className="text-sm text-chili">That key is not right.</p>}
        <button className="min-h-11 rounded-full bg-basil px-5 font-medium text-white">Enter</button>
      </form>
    </main>
  );
}
