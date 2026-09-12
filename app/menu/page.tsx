import type { Metadata } from "next";
import Link from "next/link";

import { formatMenuDate, getWeeklyMenus } from "@/lib/weeklyMenus";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Weekly Menu | Ma Kitchens",
  description: "View the current Ma Kitchens weekly menu and browse previous menus.",
};

export default function MenuPage() {
  const menus = getWeeklyMenus();
  const [activeMenu, ...previousMenus] = menus;

  return (
    <div className="bg-cream text-ink">
      <section className="border-b border-ink/10 px-5 py-12 sm:px-6 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Weekly menu</p>
          <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">
            This week&apos;s menu
          </h1>
          {activeMenu ? (
            <p className="mt-4 text-base leading-7 text-ink/65 sm:text-lg sm:leading-8">
              Delivery: {formatMenuDate(activeMenu.date)}
            </p>
          ) : (
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/65 sm:text-lg sm:leading-8">
              Our next weekly menu will be published here soon.
            </p>
          )}
        </div>
      </section>

      {activeMenu && (
        <section className="px-5 py-10 sm:px-6 sm:py-14 lg:px-10" aria-label="Current weekly menu">
          <div className="mx-auto max-w-5xl space-y-8">
            {activeMenu.pages.map((src, index) => (
              <figure key={src} className="overflow-hidden border border-ink/10 bg-white shadow-sm">
                <img
                  alt={`Ma Kitchens weekly menu for ${formatMenuDate(activeMenu.date)}, page ${index + 1}`}
                  className="h-auto w-full"
                  decoding="async"
                  loading={index === 0 ? "eager" : "lazy"}
                  src={src}
                />
              </figure>
            ))}
          </div>
        </section>
      )}

      {previousMenus.length > 0 && (
        <section className="border-t border-ink/10 bg-oat/45 px-5 py-12 sm:px-6 sm:py-16 lg:px-10" aria-labelledby="previous-menus-heading">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Archive</p>
              <h2 id="previous-menus-heading" className="mt-4 text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
                Previous menus
              </h2>
            </div>

            <div className="mx-auto mt-8 max-w-3xl divide-y divide-ink/10 border-y border-ink/10">
              {previousMenus.map((menu) => (
                <Link
                  key={menu.date}
                  className="flex items-center justify-between gap-5 py-5 text-left transition hover:text-clay"
                  href={`/menu/${menu.date}`}
                >
                  <span className="text-base font-medium sm:text-lg">{formatMenuDate(menu.date)}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em]">View menu</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
