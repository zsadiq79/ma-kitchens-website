const socialLinks = ["Instagram", "Facebook", "LinkedIn"];

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto grid max-w-7xl gap-9 px-5 py-10 sm:px-6 sm:py-12 md:grid-cols-[1.5fr_1fr_1fr] md:gap-12 lg:px-10">
        <div>
          <p className="font-serif text-4xl leading-none">Ma Kitchens</p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-cream/65">
            Helping home cooks share food, culture and stories with their local community.
          </p>
        </div>

        <div className="border-t border-cream/15 pt-6 text-sm leading-7 text-cream/75 md:border-t-0 md:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Location</p>
          <p className="mt-2">Sydney, Australia</p>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Contact</p>
          <a className="mt-2 block break-all transition hover:text-white" href="mailto:info@makitchens.com.au">
            info@makitchens.com.au
          </a>
        </div>

        <div className="border-t border-cream/15 pt-6 md:border-t-0 md:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-cream/45">Social</p>
          <div className="mt-3 flex gap-3">
            {socialLinks.map((label) => (
              <a
                key={label}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/25 text-xs font-medium text-cream/75 transition hover:border-cream hover:text-white"
                href="#"
              >
                {label.slice(0, 1)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
