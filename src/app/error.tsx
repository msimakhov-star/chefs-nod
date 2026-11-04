"use client";

import { Logo } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="grid flex-1 place-items-center bg-cream px-6 py-24 text-center">
      <div>
        <Logo className="mx-auto h-12 w-12" />
        <h1 className="mt-5 font-display text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted">No money moves unless the chef confirms, so your order is unaffected. Please try again.</p>
        <button onClick={reset} className="mt-6 rounded-full bg-basil px-6 py-3 font-medium text-white hover:bg-basil-dark">
          Try again
        </button>
      </div>
    </div>
  );
}
