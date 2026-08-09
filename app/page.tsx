import Link from "next/link";

import { TwoColumnSection } from "@/components/TwoColumnSection";

export default function Home() {
  return (
    <>
      <TwoColumnSection
        eyebrow="For home cooks"
        imageAlt="A colourful spread of home-cooked dishes served around a table"
        imageLabel="Meals made with heart"
        imageSrc="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1600&q=85"
        priority
        title="Share Your Meals, Make Some Money"
      >
        <p className="body-copy font-serif text-2xl leading-8 text-ink/85 sm:text-3xl sm:leading-9">
          If you’ve ever been told “your cooking is amazing, you should sell this!”, we’re here to help make that happen.
        </p>
        <p className="body-copy">
          Ma Kitchens supports home cooks who are ready to turn family recipes, cultural dishes and everyday kitchen confidence into a simple food business pathway.
        </p>
        <p className="body-copy">
          We help you start selling with practical training, gentle guidance, community support and earning opportunities designed around real home kitchens.
        </p>
        <p className="border-l border-clay/40 pl-5 font-serif text-2xl italic leading-tight text-clay sm:text-3xl">
          Home-cooked food. Prepared with heart. Shared with the world.
        </p>
        <div className="pt-2">
          <p className="mb-4 font-serif text-2xl text-ink sm:text-3xl">Ready to take the first step?</p>
          <Link
            className="inline-flex w-full items-center justify-center rounded-full bg-clay px-7 py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-white shadow-[0_14px_35px_-18px_rgba(138,90,68,0.9)] transition hover:-translate-y-0.5 hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay sm:w-auto sm:px-9 sm:text-sm"
            href="https://whatsapp.com/channel/0029Vb6Ct1GF1YlbaAkXCs1C"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join our WhatsApp channel
          </Link>
        </div>
      </TwoColumnSection>

      <section className="border-y border-ink/10 px-5 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl md:grid-cols-3">
          {[
            {
              title: "Training",
              copy: "Practical training to help you understand food safety, preparation standards and the essentials of turning your cooking into something customers can confidently enjoy.",
            },
            {
              title: "Support",
              copy: "Ongoing guidance and community support to help you navigate the journey from your home kitchen to serving customers with confidence.",
            },
            {
              title: "Opportunities",
              copy: "Opportunities for selected cooks to showcase their food, reach local customers and build meaningful earning potential from the dishes they already love making.",
            },
          ].map((item, index) => (
            <div key={item.title} className={`border-ink/10 py-9 md:px-8 md:py-12 ${index > 0 ? "border-t md:border-l md:border-t-0" : ""}`}>
              <p className="font-serif text-3xl text-ink">{item.title}</p>
              <p className="body-copy mt-3 max-w-sm text-sm leading-6 text-ink/60 sm:text-base sm:leading-7">
                {item.copy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
