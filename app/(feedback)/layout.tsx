import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "@/app/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-cormorant", weight: ["400", "500", "600"] });
export const metadata: Metadata = {
  title: "Order Feedback | Ma Kitchens",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// Separate root layouts force full document navigation across the feedback boundary.
// Marketing scripts and their existing browser listeners never enter this document.
export default function FeedbackLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${inter.variable} ${cormorant.variable}`}><body className="font-sans antialiased">{children}</body></html>;
}
