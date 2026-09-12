import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMenuDate, getWeeklyMenu, getWeeklyMenus } from "@/lib/weeklyMenus";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getWeeklyMenus().map((menu) => ({ date: menu.date }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const menu = getWeeklyMenu(date);

  if (!menu) {
    return { title: "Menu not found | Ma Kitchens" };
  }

  return {
    title: `${formatMenuDate(menu.date)} Menu | Ma Kitchens`,
    description: `View the Ma Kitchens weekly menu for ${formatMenuDate(menu.date)}.`,
  };
}

export default async function ArchivedMenuPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const menu = getWeeklyMenu(date);

  if (!menu) {
    notFound();
  }

  return (
    <div className="bg-cream text-ink">
      <section className="border-b border-ink/10 px-5 py-12 sm:px-6 sm:py-16 lg:px-10">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-clay">Weekly menu archive</p>
          <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.025em] sm:text-5xl">
            {formatMenuDate(menu.date)}
          </h1>
          <Link
            className="mt-6 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-clay underline underline-offset-4"
            href="/menu"
          >
            Back to current menu
          </Link>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-6 sm:py-14 lg:px-10" aria-label={`Menu for ${formatMenuDate(menu.date)}`}>
        <div className="mx-auto max-w-5xl space-y-8">
          {menu.pages.map((src, index) => (
            <figure key={src} className="overflow-hidden border border-ink/10 bg-white shadow-sm">
              <img
                alt={`Ma Kitchens weekly menu for ${formatMenuDate(menu.date)}, page ${index + 1}`}
                className="h-auto w-full"
                decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                src={src}
              />
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
