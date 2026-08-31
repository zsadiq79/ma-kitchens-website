import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About | Ma Kitchens",
  description:
    "Ma Kitchens brings authentic home-cooked food from talented local cooks to customers who want food with more flavour, tradition and heart.",
};

export default function AboutPage() {
  return (
    <section
      className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 sm:py-16 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-12 md:py-20 lg:gap-16 lg:px-10 lg:py-24"
      aria-labelledby="about-heading"
    >
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-clay sm:text-sm">
          About Ma Kitchens
        </p>
        <h1
          id="about-heading"
          className="max-w-xl text-[2.25rem] font-medium leading-[1.05] tracking-[-0.025em] text-ink sm:text-[2.75rem] lg:text-5xl"
        >
          Bringing home-cooked food to more tables
        </h1>
        <div className="mt-7 max-w-xl space-y-5 text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">
          <p>
            Ma Kitchens brings authentic home-cooked food from talented local cooks to customers who want food with
            more flavour, tradition and heart.
          </p>
          <p>
            We believe some of the best food is made in home kitchens. These are the dishes cooked from memory, shaped
            by culture and family, and perfected over years of making them for the people who matter most.
          </p>
          <p>
            Ma Kitchens gives talented home cooks a way to share that food with more people, while we help coordinate
            the customer experience, including orders, payments and delivery.
          </p>
          <p>
            Our goal is simple: make it easier for people to discover genuinely home-cooked food and easier for great
            home cooks to share what they make best.
          </p>
        </div>
      </div>

      <figure className="relative min-h-[340px] overflow-hidden rounded-sm bg-oat sm:min-h-[460px] md:min-h-[580px]">
        <Image
          alt="A home cook preparing fresh food in a bright kitchen"
          className="object-cover"
          fill
          priority
          sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1280px) 52vw, 620px"
          src="https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=85"
        />
      </figure>
    </section>
  );
}
