"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { MetaPixel } from "@/components/MetaPixel";
import { SiteChrome } from "@/components/SiteChrome";

export function SiteExperience({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The demo has no tracker scripts or tracked site navigation.
  if (pathname === "/feedback/demo-sameera") {
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
