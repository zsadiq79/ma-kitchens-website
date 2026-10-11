import type { Metadata } from "next";
import type { ReactNode } from "react";
import { inter, cormorant } from "@/app/fonts";
import "@/app/globals.css";

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
