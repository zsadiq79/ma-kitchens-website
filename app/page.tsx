import Link from "next/link";

import { TwoColumnSection } from "@/components/TwoColumnSection";

export default function Home() {
  return (
    <>
      <TwoColumnSection
        eyebrow="For home cooks"
        imageAlt="A colourful table of freshly prepared home-cooked dishes"
        imageCaption="Food with a story tastes different."
        imageSrc="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1600&q=85"
        title="Share Your Meals, Make Some Money"
      >
        <p className="text-xl leading-9 text-ink/80">
          If you’ve ever been told “your cooking is amazing — you should sell this!”, we’re here to help make that happen.
        </p>
        <p>
          Ma Kitchens supports home cooks who are ready to turn family recipes, cultural dishes and everyday kitchen confidence into a simple food business pathway.
        </p>
        <p>
          We help you start selling with practical training, gentle guidance, community support and earning opportunities designed around real home kitchens.
        </p>
        <p className="font-serif text-3xl italic leading-tight text-clay">
          Home-cooked food. Prepared with heart. Shared with the world.
        </p>
        <div className="pt-4">
          <p className="mb-5 font-serif text-3xl text-ink">Ready to take the first step?</p>
          <Link
            className="group inline-flex items-center gap-4 rounded-full bg-clay px-7 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-lg shadow-clay/20 transition hover:-translate-y-0.5 hover:bg-ink hover:shadow-xl"
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join our WhatsApp channel <span aria-hidden="true" className="text-xl transition group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </TwoColumnSection>

      <section className="border-y border-ink/10 bg-white/30 px-5 py-12 sm:px-6 sm:py-14 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-3">
          {["Training", "Support", "Opportunities"].map((item) => (
            <div key={item} className="border-t border-clay/30 py-6 sm:px-2">
              <p className="font-serif text-3xl text-ink">{item}</p>
              <p className="mt-4 leading-7 text-ink/60">
                Practical, calm guidance for cooks who want to grow at their own pace while staying connected to the food they love making.
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
