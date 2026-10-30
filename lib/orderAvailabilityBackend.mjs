import { createHmac } from 'node:crypto';
import { orderBackendEndpoint } from './orderApiBoundary.mjs';
import { readOrderAvailability } from './orderAvailability.mjs';

const inFlight = new Map();
const ACTION = 'order_menu_availability';

// Collapse concurrent requests in each instance. The shared server cache and
// short Apps Script cache handle other instances without writer locks.
export async function loadOrderAvailability(menu, { secret = '', backendUrl = '', fetcher = fetch, now = Date.now } = {}) {
  if (!secret || secret.length < 32 || !backendUrl) throw new Error('AVAILABILITY_UNAVAILABLE');
  const key = menu.menuRevision;
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = (async () => {
    const endpoint = orderBackendEndpoint(backendUrl, ACTION), timestamp = String(now());
    const body = JSON.stringify({ menuRevision: menu.menuRevision, menuCycleId: menu.menuCycleId, deliveryDate: menu.deliveryDate });
    const signature = createHmac('sha256', secret).update(`${timestamp}\n${ACTION}\n${body}`).digest('hex');
    const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp, body, signature }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const finalUrl = new URL(response.url);
    if (!response.ok || finalUrl.protocol !== 'https:' || !['script.google.com', 'script.googleusercontent.com'].includes(finalUrl.hostname))
      throw new Error('AVAILABILITY_UNAVAILABLE');
    const parsed = readOrderAvailability(await response.json(), menu, now());
    return { ok: true, menuRevision: menu.menuRevision, menuCycleId: menu.menuCycleId, deliveryDate: menu.deliveryDate, ...parsed };
  })();
  inFlight.set(key, operation);
  try { return await operation; }
  finally { inFlight.delete(key); }
}
