import publishedMenu from '../../../../data/published-order-menu.json';
import { readPublishedOrderMenu } from '../../../../lib/publishedOrderMenu.mjs';
import { getCachedOrderAvailability } from '../../../../lib/orderAvailabilityServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  const menu = readPublishedOrderMenu(publishedMenu);
  const noCache = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!menu) return Response.json({ ok: false, error: 'MENU_CLOSED' }, { status: 409, headers: noCache });
  try {
    const result = await getCachedOrderAvailability(menu);
    return Response.json(result, { headers: result.status === 'OPEN' ? {
      'Cache-Control': 'public, max-age=0, s-maxage=2, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    } : noCache });
  } catch {
    return Response.json({ ok: false, error: 'AVAILABILITY_UNAVAILABLE' }, { status: 503, headers: noCache });
  }
}
