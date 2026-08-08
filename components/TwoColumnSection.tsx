import type { ReactNode } from "react";

import { FoodImage } from "./FoodImage";

type TwoColumnSectionProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  imageAlt: string;
  imageCaption: string;
  imageSrc: string;
  reverse?: boolean;
};

export function TwoColumnSection({
  eyebrow,
  title,
  children,
  imageAlt,
  imageCaption,
  imageSrc,
  reverse = false,
}: TwoColumnSectionProps) {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 sm:py-16 md:grid-cols-2 md:items-center md:gap-12 md:py-20 lg:px-10 lg:py-24">
      <div className={reverse ? "md:order-2" : undefined}>
        {eyebrow ? (
          <p className="mb-5 text-sm uppercase tracking-[0.35em] text-clay">{eyebrow}</p>
        ) : null}
        <h1 className="text-balance font-serif text-5xl leading-[0.94] tracking-tight text-ink sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        <div className="mt-7 space-y-5 text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">{children}</div>
      </div>

      <FoodImage alt={imageAlt} caption={imageCaption} src={imageSrc} />
    </section>
  );
}
