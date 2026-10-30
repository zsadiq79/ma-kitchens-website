import publishedMenu from '../../../data/published-order-menu.json';
import { marketingMenu, marketingJpeg } from '../../../lib/marketingMenu.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(request: Request) {
  try {
    const artwork = await marketingMenu(publishedMenu);
    const query = new URL(request.url).searchParams;
    const imageUrl = 'https://www.makitchens.com.au/api/marketing-menu?format=jpeg&cycle=' + artwork.menu.menuCycleId +
      '&revision=' + artwork.menu.menuRevision + '&image=' + artwork.imageHash;
    if (query.get('format') === 'jpeg') {
      if (query.get('cycle') !== artwork.menu.menuCycleId || query.get('revision') !== artwork.menu.menuRevision ||
          query.get('image') !== artwork.imageHash) throw new Error('STALE_MENU_IMAGE');
      const jpeg = await marketingJpeg(artwork);
      return new Response(new Uint8Array(jpeg), { headers: { ...headers, 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.length) } });
    }
    return Response.json({ ok: true, menuCycleId: artwork.menu.menuCycleId, deliveryDate: artwork.menu.deliveryDate,
      menuRevision: artwork.menu.menuRevision, imageHash: artwork.imageHash, imageUrl, pageCount: artwork.pageCount }, { headers });
  } catch {
    return Response.json({ ok: false, error: 'NO_MATCHING_ACTIVE_MENU_ARTWORK' }, { status: 503, headers });
  }
}
