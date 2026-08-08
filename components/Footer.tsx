const socialLinks = ["Instagram", "Facebook", "LinkedIn"];

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-6 md:grid-cols-[1.4fr_0.9fr_0.7fr] md:gap-10 md:py-12 lg:px-10">
        <div>
          <p className="font-serif text-4xl">Ma Kitchens</p>
          <p className="mt-4 max-w-sm text-sm leading-7 text-cream/70">
            Helping home cooks share food, culture and stories with their local community.
          </p>
        </div>

        <div className="border-t border-cream/15 pt-6 text-sm leading-7 text-cream/75 md:border-0 md:pt-1">
          <p className="uppercase tracking-[0.28em] text-cream/50">Location</p>
          <p className="mt-3">Sydney, Australia</p>
          <p className="mt-4 uppercase tracking-[0.28em] text-cream/50">Contact</p>
          <a className="mt-3 block transition hover:text-white" href="mailto:info@makitchens.com.au">
            info@makitchens.com.au
          </a>
        </div>

        <div className="border-t border-cream/15 pt-6 md:border-0 md:pt-1">
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
      <div className="border-t border-cream/10 px-5 py-5 text-center text-xs tracking-wide text-cream/40 sm:px-6">
        © {new Date().getFullYear()} Ma Kitchens. Made with care in Sydney.
      </div>
    </footer>
  );
}
