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
      className="shrink-0 rounded-md bg-basil px-2 py-1 font-sans text-[11px] font-medium text-white"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
