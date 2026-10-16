import publishedMenu from '../../../../data/published-order-menu.json';
import { publishedOrderMetadata } from '../../../../lib/publishedOrderMenu.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Public menu metadata only. Lets the owner verify a publish has gone live.
  return Response.json(publishedOrderMetadata(publishedMenu), {
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
