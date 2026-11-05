"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="min-h-11 shrink-0 rounded-md bg-basil px-3 font-sans text-xs font-medium text-white"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
