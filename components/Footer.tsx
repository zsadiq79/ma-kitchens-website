import Link from "next/link";

import { TrackedLink } from "@/components/TrackedLink";

const socialLinks = [
  {
    label: "Instagram",
    eventName: "instagram_click" as const,
    href: "https://www.instagram.com/makitchens_au/",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="18" rx="5" stroke="currentColor" strokeWidth="2" width="18" x="3" y="3" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" fill="currentColor" r="1" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    eventName: "facebook_click" as const,
    href: "https://www.facebook.com/profile.php?id=61576357527949",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M13.5 21v-8h2.75l.41-3H13.5V8.08c0-.87.24-1.46 1.58-1.46h1.69V3.94a22.6 22.6 0 0 0-2.46-.13c-2.43 0-4.1 1.49-4.1 4.22V10H7.46v3h2.75v8h3.29Z" />
      </svg>
    ),
  },
];

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto grid max-w-7xl gap-9 px-5 py-10 sm:px-6 sm:py-12 md:grid-cols-[1.5fr_1fr_1fr] md:gap-12 lg:px-10">
        <div>
          <p className="font-serif text-4xl leading-none">Ma Kitchens</p>
          <p className="body-copy mt-4 max-w-sm text-sm leading-6 text-cream/65">
            Helping home cooks share food, culture and stories with their local community.
          </p>
        </div>

        <div className="border-t border-cream/15 pt-6 text-sm leading-7 text-cream/75 md:border-t-0 md:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Location</p>
          <p className="mt-2">Sydney, Australia</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Contact</p>
          <a className="mt-2 block break-all transition hover:text-white" href="mailto:admin@makitchens.com.au">
            admin@makitchens.com.au
          </a>
          <Link className="mt-3 inline-block transition hover:text-white" href="/privacy">
            Privacy Policy
          </Link>
        </div>

        <div className="border-t border-cream/15 pt-6 md:border-t-0 md:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Social</p>
          <div className="mt-3 flex gap-3">
            {socialLinks.map((link) => (
              <TrackedLink
                key={link.label}
                aria-label={`${link.label} (opens in a new tab)`}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/25 text-xs font-medium text-cream/75 transition hover:border-cream hover:text-white"
                href={link.href}
                eventName={link.eventName}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.icon}
              </TrackedLink>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
