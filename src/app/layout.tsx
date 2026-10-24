import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chef's Nod: allergy orders the kitchen signs off before you pay",
  description: "AI assistants can order food for people with allergies. PayPal holds the money until the chef confirms.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
