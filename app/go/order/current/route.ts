import publishedMenu from '../../../../data/published-order-menu.json';
import { publishedOrderTarget } from '../../../../lib/publishedOrderMenu.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // No Google Sheets, Apps Script or other network request on a customer click.
  // Check Sydney's date on every request, including after a rollback.
  return new Response(null, {
    status: 302,
    headers: {
      Location: publishedOrderTarget(publishedMenu).toString(),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
