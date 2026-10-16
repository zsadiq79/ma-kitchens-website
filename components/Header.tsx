import Link from "next/link";
import styles from "./OrderingHeader.module.css";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header({ compactMobile = false }: { compactMobile?: boolean }) {
  if (compactMobile) return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Ma Kitchens home">Ma Kitchens</Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navItems.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <details className={styles.mobileMenu}>
          <summary>Explore Ma Kitchens <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobile navigation">
            {navItems.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
        </details>
      </div>
    </header>
  );
  return (
    <header className="bg-ink text-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:py-6 lg:px-10">
        <Link
          href="/"
          className="max-w-xl font-serif text-[1.65rem] leading-[1.05] tracking-wide sm:text-3xl"
        >
          Ma Kitchens
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
