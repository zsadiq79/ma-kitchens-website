import Link from "next/link";

const navItems = [
  { href: "/", label: "Ma Kitchens" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:py-6 lg:px-10">
        <Link
          href="/"
          className="max-w-xl font-serif text-[1.65rem] leading-[1.05] tracking-wide sm:text-3xl"
        >
          Ma Kitchens: Bringing kitchens to life, one story at a time
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium uppercase tracking-[0.22em] text-cream/75 sm:gap-x-8 sm:text-sm sm:tracking-[0.28em]">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link className="transition hover:text-white" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
