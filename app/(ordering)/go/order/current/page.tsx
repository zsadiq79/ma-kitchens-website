import type { Metadata } from 'next';
import publishedMenu from '@/data/published-order-menu.json';
import { readPublishedOrderMenu } from '@/lib/publishedOrderMenu.mjs';
import { OrderMenu } from '@/components/ordering/OrderMenu';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Choose your dishes | Ma Kitchens',
  description: 'Choose your dishes and quantities, then send your order to Ma Kitchens on WhatsApp.',
  robots: { index: false, follow: false },
};

export default function CurrentOrderingMenu() {
  // Bundled public menu only. No Apps Script/Google Sheets request on page load.
  const menu = readPublishedOrderMenu(publishedMenu);
  return <OrderMenu menu={menu} />;
}
