"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const attributionFields = ["utm_source", "utm_campaign", "utm_adset", "utm_ad", "utm_content", "fbclid"];

export function TallyFirstMealForm() {
  const searchParams = useSearchParams();
  const embedUrl = useMemo(() => {
    const url = new URL("https://tally.so/embed/obLN65");
    url.searchParams.set("capture_mode", "landing_page");
    url.searchParams.set("source", "facebook");
    url.searchParams.set("transparentBackground", "1");

    attributionFields.forEach((field) => {
      const value = searchParams.get(field);
      if (value) url.searchParams.set(field, value);
    });

    return url.toString();
  }, [searchParams]);

  return (
    <iframe
      className="block min-h-[900px] w-full border-0 sm:min-h-[820px]"
      src={embedUrl}
      title="Ma Kitchens first meal registration form"
    />
  );
}
