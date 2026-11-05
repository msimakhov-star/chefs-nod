"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="no-print min-h-11 rounded border border-black px-4 font-sans text-sm">
      Print
    </button>
  );
}
