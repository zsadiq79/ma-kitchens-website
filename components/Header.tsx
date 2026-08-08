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
          className="max-w-lg font-serif text-xl leading-tight tracking-wide sm:text-2xl lg:text-[1.7rem]"
        >
          Ma Kitchens: Bringing kitchens to life, one story at a time
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-xs uppercase tracking-[0.22em] text-cream/80 sm:gap-x-8 sm:text-sm">
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
