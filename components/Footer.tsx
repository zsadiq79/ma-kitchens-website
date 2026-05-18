const socialLinks = ["Instagram", "Facebook", "LinkedIn"];

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1.5fr_1fr_1fr] lg:px-10">
        <div>
          <p className="font-serif text-3xl">Ma Kitchens</p>
          <p className="mt-4 max-w-sm text-sm leading-7 text-cream/70">
            Helping home cooks share food, culture and stories with their local community.
          </p>
        </div>

        <div className="text-sm leading-7 text-cream/75">
          <p className="uppercase tracking-[0.28em] text-cream/50">Location</p>
          <p className="mt-3">Sydney, Australia</p>
          <p className="mt-4 uppercase tracking-[0.28em] text-cream/50">Contact</p>
          <a className="mt-3 block transition hover:text-white" href="mailto:info@makitchens.com.au">
            info@makitchens.com.au
          </a>
        </div>

        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-cream/50">Social</p>
          <div className="mt-4 flex gap-3">
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
