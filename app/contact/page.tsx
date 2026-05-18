import Link from "next/link";

import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact | Ma Kitchens",
};

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[0.9fr_1.1fr] md:items-start md:py-28 lg:px-10">
      <div>
        <p className="mb-5 text-sm uppercase tracking-[0.35em] text-clay">Start with us</p>
        <h1 className="font-serif text-5xl leading-[0.95] tracking-tight text-ink md:text-6xl lg:text-7xl">
          Contact Us
        </h1>
        <div className="mt-8 space-y-6 text-lg leading-8 text-ink/70">
          <p>
            Curious about Ma Kitchens or ready to explore selling your home-cooked food? Join our WhatsApp Channel for updates, guidance and next steps.
          </p>
          <Link
            className="inline-flex rounded-full bg-ink px-8 py-4 text-sm font-semibold uppercase tracking-[0.24em] text-cream transition hover:bg-clay"
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join our WhatsApp channel
          </Link>
        </div>
      </div>

      <ContactForm />
    </section>
  );
}
