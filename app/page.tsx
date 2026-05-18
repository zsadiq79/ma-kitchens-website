import Link from "next/link";

import { TwoColumnSection } from "@/components/TwoColumnSection";

export default function Home() {
  return (
    <>
      <TwoColumnSection eyebrow="For home cooks" imageLabel="Meals made with heart" title="Share Your Meals, Make Some Money">
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
            className="inline-flex rounded-full bg-ink px-8 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-cream transition hover:bg-clay"
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join our WhatsApp channel
          </Link>
        </div>
      </TwoColumnSection>

      <section className="border-y border-ink/10 bg-white/30 px-6 py-16 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-3">
          {["Training", "Support", "Opportunities"].map((item) => (
            <div key={item} className="rounded-[1.5rem] bg-cream p-8 shadow-sm shadow-ink/5">
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
