import type { Metadata } from "next";
import type { ReactNode } from "react";
import { inter, cormorant } from "@/app/fonts";

import { Analytics } from "@vercel/analytics/next";
import { MetaPixel } from "@/components/MetaPixel";
import { SiteChrome } from "@/components/SiteChrome";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Ma Kitchens | Home-cooked food with heart",
  description:
    "Ma Kitchens helps talented home cooks become food entrepreneurs with training, support and earning opportunities.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased">
        <SiteChrome>{children}</SiteChrome>
        <MetaPixel />
        <Analytics />
      </body>
    </html>
  );
}
