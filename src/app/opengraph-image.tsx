import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Chef's Nod: the diner approves the money, the chef approves the food";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#fbf7f0", color: "#1c1917", fontFamily: "serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <svg width="72" height="72" viewBox="0 0 40 40">
            <rect width="40" height="40" rx="11" fill="#1f5a3d" />
            <path d="M12 21.5c-2.6-.4-4-2.4-4-4.6 0-2.6 2.1-4.6 4.6-4.6.5 0 1 .1 1.5.2C15 10.4 17.3 9 20 9s5 1.4 5.9 3.5c.5-.1 1-.2 1.5-.2 2.5 0 4.6 2 4.6 4.6 0 2.2-1.4 4.2-4 4.6V27H12v-5.5Z" fill="#fbf7f0" />
            <path d="M15 22.5l3.4 3.4 6.8-7" fill="none" stroke="#1f5a3d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="12" y="28.5" width="16" height="2.6" rx="1.3" fill="#fbf7f0" />
          </svg>
          Chef&apos;s Nod
        </div>
        <div style={{ marginTop: 48, fontSize: 76, lineHeight: 1.05, fontWeight: 700 }}>The diner approves the money.</div>
        <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 700, color: "#1f5a3d" }}>The chef approves the food.</div>
        <div style={{ marginTop: 40, fontSize: 30, color: "#6b6359", fontFamily: "sans-serif" }}>AI agents order for people with allergies. PayPal holds the money until the kitchen signs off.</div>
      </div>
    ),
    size,
  );
}
