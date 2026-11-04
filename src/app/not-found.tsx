import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid flex-1 place-items-center bg-cream px-6 py-24 text-center">
      <div>
        <Logo className="mx-auto h-12 w-12" />
        <h1 className="mt-5 font-display text-3xl font-semibold">That page isn&rsquo;t on the menu</h1>
        <p className="mt-2 text-muted">The link may be old, or the demo may have been reset.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-basil px-6 py-3 font-medium text-white hover:bg-basil-dark">
          Back to Chef&rsquo;s Nod
        </Link>
      </div>
    </div>
  );
}
