import Link from "next/link";

import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact | Ma Kitchens",
};

export default function ContactPage() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 sm:py-16 md:grid-cols-[0.85fr_1.15fr] md:items-start md:gap-12 md:py-20 lg:gap-16 lg:px-10 lg:py-24">
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-clay sm:text-sm">Start with us</p>
        <h1 className="font-serif text-[3.25rem] leading-[0.92] tracking-[-0.025em] text-ink sm:text-6xl lg:text-7xl">
          Contact Us
        </h1>
        <div className="mt-6 space-y-5 text-base leading-7 text-ink/70 sm:mt-7 sm:text-lg sm:leading-8">
          <p>
            Curious about Ma Kitchens or ready to explore selling your home-cooked food? Join our WhatsApp Channel for updates, guidance and next steps.
          </p>
          <Link
            className="inline-flex w-full items-center justify-center rounded-full bg-clay px-7 py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-white shadow-[0_14px_35px_-18px_rgba(138,90,68,0.9)] transition hover:-translate-y-0.5 hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay sm:w-auto sm:px-9 sm:text-sm"
            href="https://whatsapp.com/channel/0029Vb6Ct1GF1YlbaAkXCs1C"
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
