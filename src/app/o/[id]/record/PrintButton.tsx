"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="no-print rounded border border-black px-2 py-0.5 font-sans text-xs">
      Print
    </button>
  );
}
