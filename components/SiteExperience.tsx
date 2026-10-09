"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { MetaPixel } from "@/components/MetaPixel";
import { SiteChrome } from "@/components/SiteChrome";

export function SiteExperience({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // No tracker scripts or tracked navigation on feedback pages, including 404s.
  if (!pathname || pathname === "/feedback" || pathname.startsWith("/feedback/")) {
    return <>{children}</>;
  }

  return (
    <>
      <SiteChrome>{children}</SiteChrome>
      <MetaPixel />
      <Analytics />
    </>
  );
}
