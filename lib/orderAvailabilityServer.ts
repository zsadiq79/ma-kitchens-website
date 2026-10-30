import { unstable_cache } from 'next/cache';
import { loadOrderAvailability } from './orderAvailabilityBackend.mjs';
import { readOrderAvailability } from './orderAvailability.mjs';

type AvailabilityMenu = { menuRevision: string; menuCycleId: string; deliveryDate: string; meals: { id: string }[] };

// Shared Data Cache across page and API instances. Credentials stay server-side
// and are never included in cache keys or returned to the browser.
const cachedAvailability = unstable_cache(async (menu: AvailabilityMenu) => {
  const result = await loadOrderAvailability(menu, {
    secret: process.env.ORDER_REQUEST_API_SECRET,
    backendUrl: process.env.ORDER_REQUEST_API_URL,
  });
  return result;
}, ['order-availability-arrival-v1'], { revalidate: 5 });

export async function getCachedOrderAvailability(menu: AvailabilityMenu) {
  const result = await cachedAvailability(menu);
  // Next can serve stale data while revalidating. Never let failed refreshes
  // keep old urgency labels alive indefinitely.
  if (Date.now() - Date.parse(result.checkedAt) > 15000) throw new Error('AVAILABILITY_UNAVAILABLE');
  readOrderAvailability(result, menu);
  return result;
}
