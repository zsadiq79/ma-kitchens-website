"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export function SiteChrome({ children }: { children: ReactNode }) {
  const isFirstMeal = usePathname() === "/firstmeal";

  return (
    <>
      {!isFirstMeal && <Header />}
      <main>{children}</main>
      {!isFirstMeal && <Footer />}
    </>
  );
}
