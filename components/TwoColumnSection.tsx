import type { ReactNode } from "react";

import { FoodImagePlaceholder } from "./FoodImagePlaceholder";

type TwoColumnSectionProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  imageLabel: string;
  reverse?: boolean;
};

export function TwoColumnSection({
  eyebrow,
  title,
  children,
  imageLabel,
  reverse = false,
}: TwoColumnSectionProps) {
  return (
    <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28 lg:px-10">
      <div className={reverse ? "md:order-2" : undefined}>
        {eyebrow ? (
          <p className="mb-5 text-sm uppercase tracking-[0.35em] text-clay">{eyebrow}</p>
        ) : null}
        <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-ink md:text-6xl lg:text-7xl">
          {title}
        </h1>
        <div className="mt-8 space-y-6 text-lg leading-8 text-ink/70">{children}</div>
      </div>

      <FoodImagePlaceholder label={imageLabel} />
    </section>
  );
}
