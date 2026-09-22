import type { Metadata } from "next";
import Link from "next/link";

import { formatMenuDate, getWeeklyMenus } from "@/lib/weeklyMenus";

export const dynamic = "force-static";

const whatsappOrderUrl =
  "https://wa.me/61420246023?text=Hi%20Ma%20Kitchens%2C%20I%27d%20like%20to%20order%20from%20this%20week%27s%20menu.";

function WhatsAppOrderButton() {
  return (
    <a
      className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-clay px-7 py-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay sm:px-8"
      href={whatsappOrderUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <svg
        aria-hidden="true"
        className="h-8 w-8 shrink-0 fill-current"
        viewBox="0 0 24 24"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.917-.273-.099-.471-.148-.67.15-.197.297-.767.916-.94 1.113-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.438-9.887 9.892-9.887a9.821 9.821 0 0 1 7.021 2.91 9.825 9.825 0 0 1 2.9 7.025c-.002 5.45-4.438 9.887-9.889 9.887m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>
      ORDER ON WHATSAPP
    </a>
  );
}

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
            <>
              <p className="mt-4 text-base leading-7 text-ink/65 sm:text-lg sm:leading-8">
                Delivery: {formatMenuDate(activeMenu.date)}
              </p>
              <div className="mt-7">
                <WhatsAppOrderButton />
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/60 sm:text-base">
                  Message us to place your order. We&apos;ll confirm availability and help you from there.
                </p>
              </div>
            </>
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
            <div className="pt-2 text-center">
              <WhatsAppOrderButton />
            </div>
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
