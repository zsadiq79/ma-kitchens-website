"use client";

import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void };
  }
}

const attributionFields = ["utm_source", "utm_campaign", "utm_adset", "utm_ad", "utm_content", "fbclid"];

export function TallyFirstMealForm() {
  const searchParams = useSearchParams();
  const embedUrl = useMemo(() => {
    const url = new URL("https://tally.so/embed/obLN65");
    url.searchParams.set("alignLeft", "1");
    url.searchParams.set("hideTitle", "1");
    url.searchParams.set("transparentBackground", "1");
    url.searchParams.set("dynamicHeight", "1");
    url.searchParams.set("capture_mode", "landing_page");
    url.searchParams.set("source", "facebook");

    attributionFields.forEach((field) => {
      const value = searchParams.get(field);
      if (value) url.searchParams.set(field, value);
    });

    return url.toString();
  }, [searchParams]);

  return (
    <>
      <div
        className="min-h-[560px] w-full overflow-hidden"
        data-tally-src={embedUrl}
        data-tally-width="100%"
        data-tally-dynamic-height
        title="Ma Kitchens first meal registration form"
      />
      <Script
        id="tally-embed-script"
        src="https://tally.so/widgets/embed.js"
        strategy="afterInteractive"
        onLoad={() => window.Tally?.loadEmbeds()}
      />
    </>
  );
}
