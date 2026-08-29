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

const values = [
  ["Authentically home cooked", "Discover dishes made by local cooks who genuinely know and love the food they prepare."],
  ["Prepared fresh for your order", "Meals are pre-ordered and prepared against confirmed demand rather than mass-produced in advance."],
  ["Ma Kitchens takes care of the journey", "We coordinate your order, payment, delivery and customer experience."],
];

const steps = [
  ["01", "Register", "Tell us where you are and the kinds of home-cooked food you'd love to see."],
  ["02", "See what's available", "As Ma Kitchens launches in your area, we'll share available dishes and menus."],
  ["03", "Choose what you love", "Pre-order the dishes you want and we'll coordinate the rest."],
];

export default function FirstMealPage() {
  return (
    <div className="bg-cream text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6 lg:px-10">
          <Link className="font-serif text-3xl tracking-wide" href="/">Ma Kitchens</Link>
        </div>
      </header>

      <main>
        <section className="overflow-hidden border-b border-ink/10" aria-labelledby="firstmeal-heading">
          <div className="mx-auto grid max-w-7xl items-center md:min-h-[620px] md:grid-cols-[1.05fr_0.95fr]">
            <div className="px-5 pb-5 pt-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Home-cooked food, prepared with heart</p>
              <h1 id="firstmeal-heading" className="mt-5 max-w-2xl font-serif text-[3.25rem] leading-[0.93] tracking-[-0.03em] sm:text-6xl lg:text-[4.65rem]">
                Your first Ma Kitchens meal is on us.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-ink/70">Discover authentic home-cooked dishes prepared by talented local cooks and delivered through Ma Kitchens.</p>
              <p className="mt-3 max-w-xl text-base leading-7 text-ink/65">We&apos;re starting with a limited launch in selected Sydney areas, with meals prepared fresh for confirmed orders.</p>
              <a className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-clay px-8 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay" href="#register">Claim my first meal</a>
              <p className="mt-4 max-w-lg text-xs leading-5 text-ink/55">First order free for up to 4 servings, subject to launch availability and serviceable delivery area.</p>
            </div>
            <div className="relative h-[310px] sm:h-[420px] md:h-[590px]">
              <Image alt="Ma Kitchens home-cooked meal delivery bag" className="object-contain object-right" fill priority sizes="(max-width: 767px) 100vw, 48vw" src="/images/ma-kitchens-delivery-bag.png" />
            </div>
          </div>
        </section>

        <section className="border-b border-ink/10 px-5 py-10 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-7xl md:grid-cols-3">
            {values.map(([title, copy], index) => <article className={`py-6 md:px-8 md:py-2 ${index ? "border-t border-ink/15 md:border-l md:border-t-0" : "md:pl-0"}`} key={title}><p className="text-xs font-semibold tracking-[0.2em] text-clay">0{index + 1}</p><h2 className="mt-4 font-serif text-3xl leading-none">{title}</h2><p className="mt-3 text-sm leading-6 text-ink/65">{copy}</p></article>)}
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-20 lg:px-10">
          <div className="mx-auto max-w-4xl text-center"><h2 className="font-serif text-4xl leading-none sm:text-5xl">Food that feels a little more like home</h2><div className="mx-auto mt-6 max-w-3xl space-y-3 text-base leading-7 text-ink/65"><p>Some of the best food isn&apos;t found on a restaurant menu. It&apos;s the family favourite, the regional dish or the recipe someone has spent years learning to make just right.</p><p>Ma Kitchens is bringing more of that food from local kitchens to local tables.</p></div></div>
        </section>

        <section id="register" className="border-y border-ink/10 bg-oat/45 px-5 py-14 sm:px-6 sm:py-20 lg:px-10" aria-labelledby="register-heading">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Limited Sydney launch</p><h2 id="register-heading" className="mt-4 font-serif text-5xl leading-[0.95] sm:text-6xl">Claim your first Ma Kitchens meal</h2><p className="mt-6 text-base leading-7 text-ink/70">Tell us a little about you and the food you&apos;d love to see. We&apos;ll use your details to keep you informed as Ma Kitchens launches in your area.</p>
              <aside className="mt-8 border-l-2 border-clay pl-5"><h3 className="font-serif text-3xl">Your first order is free</h3><p className="mt-3 text-sm leading-6 text-ink/70">Your first Ma Kitchens order is free for up to 4 servings during our introductory launch.</p><p className="mt-2 text-xs leading-5 text-ink/55">Availability depends on your delivery area, participating cooks and available dishes.</p></aside>
            </div>
            <div className="min-w-0 bg-cream p-4 sm:p-7"><Suspense fallback={<p className="py-12 text-center text-sm text-ink/60">Loading registration form…</p>}><TallyFirstMealForm /></Suspense><div className="mt-5 border-t border-ink/10 pt-5 text-xs leading-5 text-ink/55"><p>We use the information you provide to respond to your enquiry and keep you informed about Ma Kitchens where you have requested updates.</p><Link className="mt-2 inline-block font-semibold text-clay underline underline-offset-4" href="/privacy">Privacy Policy</Link></div></div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-6 sm:py-20 lg:px-10"><div className="mx-auto max-w-7xl border border-clay/25 bg-clay px-7 py-9 text-cream sm:px-10"><h2 className="font-serif text-4xl">Enjoy it, or we&apos;ll make it right</h2><p className="mt-4 max-w-4xl text-sm leading-7 text-cream/80 sm:text-base">We want you to genuinely enjoy the food you order from Ma Kitchens. If you&apos;re not satisfied with a dish, let us know within 24 hours of delivery and we&apos;ll refund the price of that dish. If the problem affects your whole order, we&apos;ll make that right too.</p></div></section>

        <section className="border-t border-ink/10 px-5 py-14 sm:px-6 lg:px-10" aria-labelledby="next-heading"><div className="mx-auto max-w-7xl"><h2 id="next-heading" className="font-serif text-4xl sm:text-5xl">What happens next?</h2><ol className="mt-8 grid md:grid-cols-3">{steps.map(([number, title, copy], index) => <li className={`py-5 md:px-8 md:py-1 ${index ? "border-t border-ink/15 md:border-l md:border-t-0" : "md:pl-0"}`} key={number}><span className="font-serif text-3xl text-clay" aria-hidden="true">{number}</span><h3 className="mt-3 text-xs font-bold uppercase tracking-[0.2em]">{title}</h3><p className="mt-2 text-sm leading-6 text-ink/60">{copy}</p></li>)}</ol></div></section>
      </main>

      <footer className="bg-ink px-5 py-10 text-cream sm:px-6 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><Link className="font-serif text-4xl" href="/">Ma Kitchens</Link><p className="mt-2 text-sm text-cream/65">Home-cooked food, prepared with heart.</p></div><div className="text-sm leading-7 text-cream/70"><a className="block hover:text-white" href="mailto:admin@makitchens.com.au">admin@makitchens.com.au</a><Link className="hover:text-white" href="/privacy">Privacy Policy</Link></div></div></footer>
    </div>
  );
}
