import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { TrackedLink } from "@/components/TrackedLink";

const whatsappChannelUrl = "https://whatsapp.com/channel/0029Vb6Ct1GF1YlbaAkXCs1C";

const buttonStyles =
  "inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:px-8";

export const metadata: Metadata = {
  title: "Ma Kitchens | Home-cooked food, prepared with heart",
  description:
    "Discover authentic home-cooked food prepared by talented local cooks and delivered through Ma Kitchens.",
};

const propositions = [
  {
    number: "01",
    title: "Authentically home cooked",
    copy: "Discover dishes made by people who genuinely know and love the food they prepare.",
    className: "bg-oat/65",
  },
  {
    number: "02",
    title: "Prepared for your order",
    copy: "Meals are pre-ordered and prepared fresh against confirmed demand.",
    className: "bg-cream md:border-x-0 md:border-b-0",
  },
  {
    number: "03",
    title: "Delivered by Ma Kitchens",
    copy: "We coordinate your order, payment, delivery and customer experience from start to finish.",
    className: "bg-sage text-white",
  },
];

const steps = [
  ["01", "Discover", "See the dishes available from local Ma Kitchens cooks."],
  ["02", "Pre-order", "Choose what you would like and place your order in advance."],
  ["03", "Freshly cooked", "Your cook prepares the confirmed quantity fresh for your order."],
  ["04", "Delivered", "Ma Kitchens coordinates delivery and keeps you informed along the way."],
];

export default function Home() {
  return (
    <>
      <section className="overflow-hidden border-b border-ink/10" aria-labelledby="hero-heading">
        <div className="mx-auto grid max-w-7xl md:min-h-[650px] md:grid-cols-[0.92fr_1.08fr] md:items-stretch">
          <div className="flex flex-col justify-center px-5 py-12 sm:px-6 sm:py-16 md:py-20 lg:px-10">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-clay sm:text-sm">
              Home-cooked food, prepared with heart
            </p>
            <h1
              id="hero-heading"
              className="max-w-2xl text-[2.75rem] font-black leading-[0.94] tracking-[-0.04em] text-ink sm:text-6xl lg:text-[4.25rem]"
            >
              <span className="block">Home-cooked food</span>
              <span className="block">By local cooks</span>
              <span className="block">Delivered to you</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">
              Ma Kitchens connects you with talented local home cooks making the dishes they know best — authentic
              food prepared fresh for your order, not mass-produced in a commercial kitchen.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                className={`${buttonStyles} homepage-customer-cta-pulse bg-clay text-white hover:bg-ink focus-visible:outline-clay`}
                href="/firstmeal"
              >
                Claim your first free meal
              </Link>
              <TrackedLink
                className={`${buttonStyles} border border-ink/30 text-ink hover:border-ink hover:bg-ink hover:text-cream focus-visible:outline-ink`}
                eventName="whatsapp_channel_click"
                href={whatsappChannelUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Cook with Ma Kitchens
              </TrackedLink>
            </div>
          </div>

          <figure className="relative min-h-[430px] bg-oat sm:min-h-[520px] md:min-h-full">
            <Image
              alt="A colourful selection of home-cooked dishes shared around a table"
              className="object-cover"
              fill
              priority
              sizes="(max-width: 767px) 100vw, 55vw"
              src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1600&q=85"
            />
            <figcaption className="absolute bottom-0 left-0 bg-cream px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink sm:px-7">
              Made locally · shared with care
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-6 sm:py-16 lg:px-10" aria-labelledby="proposition-heading">
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-[1.35fr_0.8fr_0.8fr] md:grid-rows-2">
          <article className="grid min-h-[620px] overflow-hidden bg-clay text-cream sm:min-h-[680px] md:row-span-2 md:min-h-[570px] md:grid-rows-[0.85fr_1.15fr]">
            <div className="relative min-h-[250px] md:min-h-0">
              <Image
                alt="Fresh ingredients and home-cooked dishes being prepared in a welcoming kitchen"
                className="object-cover"
                fill
                sizes="(max-width: 767px) calc(100vw - 40px), 44vw"
                src="https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=85"
              />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-clay to-transparent" aria-hidden="true" />
            </div>
            <div className="flex flex-col justify-between p-7 pt-3 sm:p-10 sm:pt-4 lg:p-12 lg:pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cream/65">The Ma Kitchens idea</p>
                <h2 id="proposition-heading" className="mt-4 max-w-lg font-serif text-5xl leading-[0.95] sm:text-6xl">
                  Food that feels like home
                </h2>
              </div>
              <div className="mt-8 max-w-xl space-y-4 text-base leading-7 text-cream/80">
                <p>
                  Some of the best food never makes it onto a restaurant menu. It is cooked in family kitchens, passed
                  down through generations and made by people who have spent years perfecting the dishes they love.
                </p>
                <p>
                  Ma Kitchens brings that food to your table by connecting local customers with selected home cooks in
                  their community.
                </p>
              </div>
            </div>
          </article>

          {propositions.map((item, index) => (
            <article
              key={item.title}
              className={`flex min-h-[250px] flex-col justify-between border border-ink/10 p-6 sm:p-8 ${
                index === 2 ? "md:col-span-2 md:min-h-0" : ""
              } ${item.className}`}
            >
              <p className={`text-xs font-semibold tracking-[0.2em] ${index === 2 ? "text-white/60" : "text-clay"}`}>
                {item.number}
              </p>
              <div className="mt-8">
                <h3 className="font-serif text-3xl leading-none sm:text-4xl">{item.title}</h3>
                <p className={`mt-3 max-w-md text-sm leading-6 sm:text-base sm:leading-7 ${index === 2 ? "text-white/75" : "text-ink/65"}`}>
                  {item.copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-oat/35 px-5 py-11 sm:px-6 lg:px-10" aria-labelledby="process-heading">
        <div className="mx-auto max-w-7xl">
          <h2 id="process-heading" className="font-serif text-4xl text-ink sm:text-5xl">
            How Ma Kitchens works
          </h2>
          <ol className="mt-8 grid md:grid-cols-4">
            {steps.map(([number, title, copy], index) => (
              <li
                key={number}
                className={`grid grid-cols-[3rem_1fr] gap-3 border-ink/15 py-5 md:block md:px-6 md:py-1 ${
                  index > 0 ? "border-t md:border-l md:border-t-0" : "md:pl-0"
                }`}
              >
                <span className="font-serif text-3xl text-clay" aria-hidden="true">
                  {number}
                </span>
                <div className="md:mt-6">
                  <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-6 sm:py-20 lg:px-10" aria-labelledby="why-ma-heading">
        <div className="mx-auto grid max-w-7xl overflow-hidden border border-clay/20 bg-oat/55 text-ink md:grid-cols-[1.45fr_0.75fr]">
          <div className="p-7 sm:p-10 lg:p-14">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Our story</p>
            <h2 id="why-ma-heading" className="mt-4 font-serif text-5xl leading-none sm:text-6xl">
              Why “Ma”?
            </h2>
            <div className="mt-7 max-w-2xl space-y-4 text-base leading-7 text-ink/70 sm:text-lg sm:leading-8">
              <p>Some of the best food we&apos;ve ever eaten didn&apos;t come from a restaurant. It came from Ma&apos;s kitchen.</p>
              <p>
                The recipes passed down through families. The dishes made from memory rather than a recipe book. The
                food prepared not just to feed people, but to care for them.
              </p>
              <p>That&apos;s the idea behind Ma Kitchens.</p>
              <p>
                We&apos;re creating a way for talented home cooks to share that kind of food with more people — and for
                customers to discover food that tastes a little more like home.
              </p>
            </div>
          </div>
          <div className="relative flex min-h-[280px] items-end overflow-hidden border-t border-clay/20 bg-cream p-7 sm:p-10 md:min-h-0 md:border-l md:border-t-0 lg:p-12">
            <span className="absolute -right-8 top-0 font-serif text-[13rem] leading-none text-clay/[0.07]" aria-hidden="true">
              Ma
            </span>
            <p className="relative max-w-sm border-l-2 border-clay pl-6 font-serif text-4xl italic leading-[1.05] text-clay sm:text-5xl">
              Home-cooked food, prepared with heart.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-ink/10 px-5 py-12 sm:px-6 sm:py-16 lg:px-10" aria-labelledby="pathways-heading">
        <div className="mx-auto max-w-7xl">
          <h2 id="pathways-heading" className="max-w-3xl font-serif text-4xl leading-none sm:text-5xl">
            There are two ways to be part of Ma Kitchens
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <article className="flex min-h-[360px] flex-col justify-between bg-oat/70 p-7 sm:p-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">For food lovers</p>
                <h3 className="mt-5 max-w-lg font-serif text-4xl leading-none sm:text-5xl">Discover food made with heart</h3>
                <p className="mt-5 max-w-lg text-base leading-7 text-ink/65">
                  Experience authentic home-cooked dishes from talented local cooks, prepared fresh for your order.
                </p>
              </div>
              <div className="mt-8">
                <Link className={`${buttonStyles} bg-clay text-white hover:bg-ink focus-visible:outline-clay`} href="/firstmeal">
                  Claim your first free meal
                </Link>
              </div>
            </article>

            <article className="flex min-h-[360px] flex-col justify-between border border-ink/15 p-7 sm:p-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sage">For home cooks</p>
                <h3 className="mt-5 max-w-lg font-serif text-4xl leading-none sm:text-5xl">Cook what you love</h3>
                <p className="mt-5 max-w-lg text-base leading-7 text-ink/65">
                  Turn the dishes you make brilliantly into an opportunity to earn. You focus on the food while Ma
                  Kitchens helps manage customers, orders, payments and delivery.
                </p>
              </div>
              <div className="mt-8">
                <TrackedLink
                  className={`${buttonStyles} border border-ink text-ink hover:bg-ink hover:text-cream focus-visible:outline-ink`}
                  eventName="whatsapp_channel_click"
                  href={whatsappChannelUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Cook with Ma Kitchens
                </TrackedLink>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
