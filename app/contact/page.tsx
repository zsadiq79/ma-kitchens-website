import Link from "next/link";

import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact | Ma Kitchens",
};

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 sm:py-16 md:grid-cols-[0.85fr_1.15fr] md:items-start md:gap-12 md:py-20 lg:px-10 lg:py-24">
      <div>
        <p className="mb-5 text-sm uppercase tracking-[0.35em] text-clay">Start with us</p>
        <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
          Contact Us
        </h1>
        <div className="mt-8 space-y-6 text-lg leading-8 text-ink/70">
          <p>
            Curious about Ma Kitchens or ready to explore selling your home-cooked food? Join our WhatsApp Channel for updates, guidance and next steps.
          </p>
          <Link
            className="group inline-flex items-center gap-4 rounded-full bg-clay px-7 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-lg shadow-clay/20 transition hover:-translate-y-0.5 hover:bg-ink hover:shadow-xl"
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join our WhatsApp channel <span aria-hidden="true" className="text-xl transition group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>

      <ContactForm />
    </section>
  );
}
