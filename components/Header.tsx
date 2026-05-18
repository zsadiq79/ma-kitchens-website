import Link from "next/link";

const navItems = [
  { href: "/", label: "Ma Kitchens" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between lg:px-10">
        <Link
          href="/"
          className="max-w-xl font-serif text-2xl leading-tight tracking-wide md:text-3xl"
        >
          Ma Kitchens: Bringing kitchens to life, one story at a time
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sm uppercase tracking-[0.28em] text-cream/80">
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
