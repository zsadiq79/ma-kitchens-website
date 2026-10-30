import type { Metadata } from 'next';
import { after } from 'next/server';
import { getCachedOrderAvailability } from '@/lib/orderAvailabilityServer';
import { initialOrderAvailability } from '@/lib/orderAvailabilityInitial.mjs';
import publishedMenu from '@/data/published-order-menu.json';
import { readPublishedOrderMenu } from '@/lib/publishedOrderMenu.mjs';
import { OrderMenu } from '@/components/ordering/OrderMenu';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Choose your dishes | Ma Kitchens',
  description: 'Choose your dishes and quantities, then send your order to Ma Kitchens on WhatsApp.',
  robots: { index: false, follow: false },
};

export default async function CurrentOrderingMenu() {
  const menu = readPublishedOrderMenu(publishedMenu);
  if (!menu) return <OrderMenu menu={null} />;
  // A warm shared cache supplies labels in the initial HTML. Never hold the menu
  // behind a cold Apps Script call. Finish warming after responding if necessary.
  const pending = getCachedOrderAvailability(menu);
  after(async () => { await pending.catch(() => null); });
  const initialAvailability = await initialOrderAvailability(pending);
  return <OrderMenu menu={menu} initialAvailability={initialAvailability} />;
}

