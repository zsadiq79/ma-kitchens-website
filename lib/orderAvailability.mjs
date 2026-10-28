export const AVAILABILITY_POLL_MS = 30000;
export const AVAILABILITY_MAX_AGE_MS = 45000;

// Strict projection: the browser receives public IDs and availability, never
// operational rows, customer data or backend error details. Counts are limited
// to the owner's configured low-stock range; full inventory is not exposed.
export function readOrderAvailability(value, menu, now = Date.now()) {
  if (!value || value.ok !== true || value.menuRevision !== menu.menuRevision ||
      !['OPEN', 'CLOSED', 'STALE'].includes(value.status) || !Array.isArray(value.items))
    throw new Error('AVAILABILITY_UNAVAILABLE');
  const checkedAt = Date.parse(value.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now + 5000 || now - checkedAt > AVAILABILITY_MAX_AGE_MS)
    throw new Error('AVAILABILITY_UNAVAILABLE');
  if (value.status !== 'OPEN') return { status: value.status, checkedAt: value.checkedAt, items: [] };
  if (value.menuCycleId !== menu.menuCycleId || value.deliveryDate !== menu.deliveryDate || value.items.length !== menu.meals.length)
    throw new Error('AVAILABILITY_UNAVAILABLE');
  const expected = new Set(menu.meals.map(meal => meal.id)), seen = new Set();
  const items = value.items.map(item => {
    if (!item || !expected.has(item.id) || seen.has(item.id) || !['AVAILABLE', 'SOLD_OUT', 'UNAVAILABLE'].includes(item.status))
      throw new Error('AVAILABILITY_UNAVAILABLE');
    seen.add(item.id);
    const result = { id: item.id, status: item.status };
    if (item.lowStockRemaining !== undefined) {
      if (item.status !== 'AVAILABLE' || !Number.isSafeInteger(item.lowStockRemaining) || item.lowStockRemaining < 1 || item.lowStockRemaining > 999)
        throw new Error('AVAILABILITY_UNAVAILABLE');
      result.lowStockRemaining = item.lowStockRemaining;
    }
    return result;
  });
  return { status: 'OPEN', checkedAt: value.checkedAt, items };
}

export function lowStockLabel(item) {
  if (item?.status !== 'AVAILABLE' || !Number.isSafeInteger(item.lowStockRemaining) || item.lowStockRemaining < 1 || item.lowStockRemaining > 999) return '';
  return item.lowStockRemaining === 1 ? 'Last serving available' : `Only ${item.lowStockRemaining} servings left`;
}

export function blockedOrderItems(availability, selection) {
  if (!availability || availability.status !== 'OPEN') return [];
  const byId = new Map(availability.items.map(item => [item.id, item.status]));
  return selection.items.filter(item => byId.get(item.id) !== 'AVAILABLE');
}
