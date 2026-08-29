"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const attributionFields = ["utm_source", "utm_campaign", "utm_adset", "utm_ad", "utm_content", "fbclid"];
const tallyScriptSrc = "https://tally.so/widgets/embed.js";

type TallyWindow = Window & {
  Tally?: {
    loadEmbeds: () => void;
  };
};

export function TallyFirstMealForm() {
  const searchParams = useSearchParams();
  const embedUrl = useMemo(() => {
    const url = new URL("https://tally.so/embed/obLN65");
    url.searchParams.set("capture_mode", "landing_page");
    url.searchParams.set("source", "facebook");
    url.searchParams.set("transparentBackground", "1");
    url.searchParams.set("dynamicHeight", "1");

    attributionFields.forEach((field) => {
      const value = searchParams.get(field);
      if (value) url.searchParams.set(field, value);
    });

    return url.toString();
  }, [searchParams]);

  useEffect(() => {
    const loadEmbeds = () => {
      const tallyWindow = window as TallyWindow;

      if (tallyWindow.Tally) {
        tallyWindow.Tally.loadEmbeds();
        return;
      }

      document.querySelectorAll<HTMLIFrameElement>("iframe[data-tally-src]:not([src])").forEach((iframe) => {
        const src = iframe.dataset.tallySrc;
        if (src) iframe.src = src;
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${tallyScriptSrc}"]`);

    if (existingScript) {
      if ((window as TallyWindow).Tally) {
        loadEmbeds();
      } else {
        existingScript.addEventListener("load", loadEmbeds, { once: true });
      }

      return () => existingScript.removeEventListener("load", loadEmbeds);
    }

    const script = document.createElement("script");
    script.src = tallyScriptSrc;
    script.async = true;
    script.onload = loadEmbeds;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [embedUrl]);

  return (
    <iframe
      key={embedUrl}
      className="block w-full border-0"
      data-tally-src={embedUrl}
      height="720"
      loading="lazy"
      scrolling="no"
      title="Ma Kitchens first meal registration form"
      width="100%"
    />
  );
}
