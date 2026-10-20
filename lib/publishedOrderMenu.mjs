export const ORDERING_WHATSAPP_NUMBER = '61420246023';
export const FALLBACK_ORDER_MESSAGE = 'Hi Ma Kitchens, I would like to place an order. Please send me the current menu.';

export function menuImagePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().replace(/^https:\/\/(?:www\.)?makitchens\.com\.au(?=\/)/, '');
  return /^\/menu-images\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpe?g|png|webp)$/i.test(path) ? path : '';
}

export function sydneyDate(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name) => parts.find((value) => value.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validMenuDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function orderingCutoffDate(deliveryDate) {
  if (!validMenuDate(deliveryDate)) return '';
  return new Date(Date.parse(deliveryDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
}

export function orderingIsOpen(deliveryDate, now = new Date()) {
  const cutoffDay = orderingCutoffDate(deliveryDate), today = sydneyDate(now);
  if (!cutoffDay || !today) return false;
  if (today !== cutoffDay) return today < cutoffDay;
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  return hour < 22;
}

function menuDateLabel(date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(date + 'T00:00:00Z')).replace(/,/g, '');
}

export function readPublishedOrderMenu(record, now = new Date()) {
  const today = sydneyDate(now);
  if (!record || record.withdrawn || record.schemaVersion !== 2 || !today ||
      !orderingIsOpen(record.deliveryDate, now) ||
      record.menuCycleId !== 'MENU-' + record.deliveryDate ||
      typeof record.menuRevision !== 'string' || !/^[a-f0-9]{64}$/.test(record.menuRevision) ||
      !Number.isInteger(record.minimumOrderItems) || record.minimumOrderItems < 1 || record.minimumOrderItems > 1000 ||
      !Number.isInteger(record.deliveryFeeCents) || record.deliveryFeeCents < 0 || record.deliveryFeeCents > 1000000 ||
      typeof record.publishedAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(record.publishedAt)) return null;
  const publishedAt = Date.parse(record.publishedAt);
  if (!Number.isFinite(publishedAt) || publishedAt > now.getTime() + 300000 ||
      !Array.isArray(record.meals) || !record.meals.length || record.meals.length > 100) return null;
  const meals = [], itemIds = new Set();
  for (const meal of record.meals) {
    if (!meal || typeof meal.id !== 'string' || !/^i_[a-f0-9]{24}$/.test(meal.id) || itemIds.has(meal.id) ||
        typeof meal.dishName !== 'string' || !meal.dishName.trim() ||
        meal.dishName.length > 150 || /[\r\n\u0000-\u001f]/.test(meal.dishName) ||
        typeof meal.price !== 'number' || !Number.isFinite(meal.price) || meal.price <= 0 || meal.price > 10000) return null;
    const display = meal.priceDisplay;
    if (display !== undefined && (typeof display !== 'string' ||
        !/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(display) ||
        Math.abs(Number(display.slice(1).replace(/,/g, '')) - meal.price) > 0.005)) return null;
    itemIds.add(meal.id);
    meals.push({ id: meal.id, dishName: meal.dishName.trim(), price: meal.price, priceDisplay: display, imageUrl: menuImagePath(meal.imageUrl) });
  }
  return { schemaVersion: /** @type {2} */ (2), menuRevision: record.menuRevision, minimumOrderItems: record.minimumOrderItems,
    deliveryFeeCents: record.deliveryFeeCents, menuCycleId: record.menuCycleId, deliveryDate: record.deliveryDate,
    publishedAt: record.publishedAt, deliveryDateDisplay: menuDateLabel(record.deliveryDate), meals };
}

export function fallbackOrderTarget() {
  const url = new URL('https://wa.me/' + ORDERING_WHATSAPP_NUMBER);
  url.searchParams.set('text', FALLBACK_ORDER_MESSAGE);
  return url;
}

export function publishedOrderMetadata(record, now = new Date()) {
  const menu = readPublishedOrderMenu(record, now);
  return menu ? { ok: true, menuCycleId: menu.menuCycleId, deliveryDate: menu.deliveryDate,
    publishedAt: menu.publishedAt, menuRevision: menu.menuRevision, dishCount: menu.meals.length } : { ok: false, status: 'NO_PUBLISHED_ACTIVE_MENU' };
}

export const MAX_ORDER_QUANTITY = 999;
export const MINIMUM_ORDER_ITEMS = 5;
export const DELIVERY_FEE_CENTS = 1000;

export function orderSelection(menu, quantities) {
  if (!menu || !Array.isArray(quantities) || quantities.length !== menu.meals.length) {
    return { items: [], totalQuantity: 0, subtotalCents: 0, invalidIndexes: [-1] };
  }
  const items = [], invalidIndexes = [];
  let totalQuantity = 0, subtotalCents = 0;
  menu.meals.forEach((meal, index) => {
    const raw = String(quantities[index] ?? '').trim();
    if (raw === '' || raw === '0') return;
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_ORDER_QUANTITY) {
      invalidIndexes.push(index); return;
    }
    const quantity = Number(raw), lineCents = Math.round(meal.price * 100) * quantity;
    items.push({ ...meal, quantity, lineCents });
    totalQuantity += quantity; subtotalCents += lineCents;
  });
  return { items, totalQuantity, subtotalCents, invalidIndexes };
}

export function foodMoney(cents) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

export function selectedOrderTarget(record, quantities, now = new Date()) {
  const menu = readPublishedOrderMenu(record, now);
  if (!menu) throw new Error('MENU_EXPIRED');
  const selection = orderSelection(menu, quantities);
  if (selection.invalidIndexes.length) throw new Error('INVALID_QUANTITY');
  if (!selection.items.length) throw new Error('NO_DISHES_SELECTED');
  if (selection.totalQuantity < MINIMUM_ORDER_ITEMS) throw new Error('MINIMUM_ORDER_NOT_MET');
  const message = [
    'Hi Ma Kitchens, I would like to place this order:', '',
    'Delivery: ' + menu.deliveryDateDisplay, '',
    ...selection.items.map((item) => item.quantity + ' × ' + item.dishName + ' - ' + foodMoney(item.lineCents)), '',
    'Food subtotal: ' + foodMoney(selection.subtotalCents),
    'Delivery fee: ' + foodMoney(DELIVERY_FEE_CENTS),
    'Total: ' + foodMoney(selection.subtotalCents + DELIVERY_FEE_CENTS),
    'Please confirm availability and my final total.',
  ].join('\n');
  const url = new URL('https://wa.me/' + ORDERING_WHATSAPP_NUMBER);
  url.searchParams.set('text', message);
  return url;
}

export function orderDraftSignature(menu) {
  return JSON.stringify([menu.menuRevision, menu.menuCycleId, menu.deliveryDate, menu.meals.map(meal => [meal.id, meal.price])]);
}

export function readOrderDraft(raw, menu, now = new Date()) {
  if (!raw || raw.length > 100000 || !readPublishedOrderMenu(menu, now)) return null;
  try {
    const draft = JSON.parse(raw);
    if (!draft || draft.signature !== orderDraftSignature(menu) || !Array.isArray(draft.quantities) || draft.quantities.length !== menu.meals.length) return null;
    return draft.quantities.map(value => typeof value === 'string' && /^(?:[0-9]{1,3})?$/.test(value) ? value : '');
  } catch { return null; }
}

