import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { TallyFirstMealForm } from "@/components/TallyFirstMealForm";

export const metadata: Metadata = {
  title: "First Meal Free | Ma Kitchens",
  description:
    "Register to try authentic home-cooked food from local cooks with Ma Kitchens. Your first order is free for up to 4 servings during our introductory launch.",
};

export default function FirstMealPage() {
  return (
    <div className="overflow-x-hidden bg-cream text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-10">
          <Link className="font-serif text-3xl tracking-wide" href="/">
            Ma Kitchens
          </Link>
        </div>
      </header>

      <main>
        <section className="overflow-hidden border-b border-ink/10" aria-labelledby="firstmeal-heading">
          <div className="mx-auto grid max-w-7xl items-center md:min-h-[610px] md:grid-cols-[1.02fr_0.98fr]">
            <div className="px-5 pb-4 pt-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">
                Home-cooked food, prepared with heart
              </p>
              <h1
                id="firstmeal-heading"
                className="mt-5 max-w-2xl font-serif text-[3.25rem] leading-[0.93] tracking-[-0.03em] sm:text-6xl lg:text-[4.65rem]"
              >
                Your first Ma Kitchens meal is on us.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-ink/70">
                Discover authentic home-cooked food prepared fresh by talented local cooks and delivered through Ma
                Kitchens.
              </p>
              <a
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-clay px-8 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
                href="#claim"
              >
                Claim my free meal
              </a>
              <p className="mt-4 max-w-lg text-xs leading-5 text-ink/55">
                First order free for up to 4 servings. Limited launch, subject to delivery area and availability.
              </p>
            </div>

            <div className="relative h-[300px] sm:h-[400px] md:h-[580px]">
              <Image
                alt="Ma Kitchens home-cooked meal delivery bag"
                className="object-contain object-right"
                fill
                priority
                sizes="(max-width: 767px) 100vw, 49vw"
                src="/images/ma-kitchens-delivery-bag.png"
              />
            </div>
          </div>
        </section>

        <section id="claim" className="scroll-mt-4 px-0 py-12 sm:px-6 sm:py-16 lg:px-10" aria-labelledby="claim-heading">
          <div className="mx-auto max-w-4xl">
            <div className="px-5 text-center sm:px-0">
              <h2 id="claim-heading" className="font-serif text-4xl leading-none sm:text-5xl">
                Claim your free first meal
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ink/65">
                Tell us where you are and what kind of home-cooked food you&apos;d love to see.
              </p>
            </div>

            <div className="mt-8 min-w-0">
              <Suspense fallback={<p className="px-5 py-16 text-center text-sm text-ink/60">Loading registration form…</p>}>
                <TallyFirstMealForm />
              </Suspense>
            </div>

            <div className="mx-5 border-t border-clay/25 pt-7 text-center sm:mx-0">
              <h3 className="font-serif text-3xl">100% satisfaction promise</h3>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                If you&apos;re not satisfied with a dish, let us know within 24 hours and we&apos;ll make it right.
              </p>
              <p className="mx-auto mt-6 max-w-2xl text-xs leading-5 text-ink/55">
                We use your information to contact you about Ma Kitchens and provide updates where you have requested
                them.
              </p>
              <Link className="mt-2 inline-block text-xs font-semibold text-clay underline underline-offset-4" href="/privacy">
                Privacy Policy
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-ink px-5 py-9 text-cream sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link className="font-serif text-4xl" href="/">
              Ma Kitchens
            </Link>
            <p className="mt-2 text-sm text-cream/65">Home-cooked food, prepared with heart.</p>
          </div>
          <div className="text-sm leading-7 text-cream/70">
            <a className="block hover:text-white" href="mailto:admin@makitchens.com.au">
              admin@makitchens.com.au
            </a>
            <Link className="hover:text-white" href="/privacy">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
