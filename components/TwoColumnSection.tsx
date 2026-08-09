import type { ReactNode } from "react";

import { EditorialFoodImage } from "./EditorialFoodImage";

type TwoColumnSectionProps = {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  imageAlt: string;
  imageLabel: string;
  imageSrc: string;
  priority?: boolean;
  reverse?: boolean;
};

export function TwoColumnSection({
  eyebrow,
  title,
  children,
  imageAlt,
  imageLabel,
  imageSrc,
  priority,
  reverse = false,
}: TwoColumnSectionProps) {
  return (
    <section className="mx-auto grid max-w-7xl gap-9 px-5 py-12 sm:px-6 sm:py-16 md:grid-cols-2 md:items-center md:gap-12 md:py-20 lg:gap-16 lg:px-10 lg:py-24">
      <div className={reverse ? "md:order-2" : undefined}>
        {eyebrow ? (
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-clay sm:text-sm">{eyebrow}</p>
        ) : null}
        <h1 className="max-w-2xl font-serif text-[3.25rem] leading-[0.92] tracking-[-0.025em] text-ink sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        <div className="mt-6 space-y-5 text-base leading-7 text-ink/70 sm:mt-7 sm:text-lg sm:leading-8">{children}</div>
      </div>

      <EditorialFoodImage alt={imageAlt} caption={imageLabel} priority={priority} src={imageSrc} />
    </section>
  );
}
