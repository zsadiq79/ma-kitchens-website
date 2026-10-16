export const ORDERING_WHATSAPP_NUMBER = '61420246023';
export const FALLBACK_ORDER_MESSAGE = 'Hi Ma Kitchens, I would like to place an order. Please send me the current menu.';

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

function menuDateLabel(date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(date + 'T00:00:00Z')).replace(/,/g, '');
}

export function readPublishedOrderMenu(record, now = new Date()) {
  const today = sydneyDate(now);
  if (!record || record.withdrawn || record.schemaVersion !== 1 || !today ||
      !validMenuDate(record.deliveryDate) || record.deliveryDate < today ||
      record.menuCycleId !== 'MENU-' + record.deliveryDate ||
      typeof record.publishedAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(record.publishedAt)) return null;
  const publishedAt = Date.parse(record.publishedAt);
  if (!Number.isFinite(publishedAt) || publishedAt > now.getTime() + 300000 ||
      !Array.isArray(record.meals) || !record.meals.length || record.meals.length > 100) return null;
  const meals = [];
  for (const meal of record.meals) {
    if (!meal || typeof meal.dishName !== 'string' || !meal.dishName.trim() ||
        meal.dishName.length > 150 || /[\r\n\u0000-\u001f]/.test(meal.dishName) ||
        typeof meal.price !== 'number' || !Number.isFinite(meal.price) || meal.price <= 0 || meal.price > 10000) return null;
    const display = meal.priceDisplay;
    if (display !== undefined && (typeof display !== 'string' ||
        !/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(display) ||
        Math.abs(Number(display.slice(1).replace(/,/g, '')) - meal.price) > 0.005)) return null;
    meals.push({ dishName: meal.dishName.trim(), price: meal.price, priceDisplay: display });
  }
  return { menuCycleId: record.menuCycleId, deliveryDate: record.deliveryDate,
    publishedAt: record.publishedAt, deliveryDateDisplay: menuDateLabel(record.deliveryDate), meals };
}

export function buildPublishedOrderMessage(menu) {
  return [
    "Hi Ma Kitchens, I would like to place an order from this week's menu.", '',
    'Please edit this message before sending:',
    '• Change 1 to the quantity you want.', '• Delete any dishes you do not want.', '',
    'Delivery: ' + menu.deliveryDateDisplay, '',
    ...menu.meals.map((meal) => '1 × ' + meal.dishName + ' - ' +
      (meal.priceDisplay || '$' + meal.price.toFixed(2).replace(/\.00$/, ''))), '',
    'Please send this message after adjusting your order.',
  ].join('\n');
}

export function publishedOrderTarget(record, now = new Date()) {
  const menu = readPublishedOrderMenu(record, now);
  const url = new URL('https://wa.me/' + ORDERING_WHATSAPP_NUMBER);
  url.searchParams.set('text', menu ? buildPublishedOrderMessage(menu) : FALLBACK_ORDER_MESSAGE);
  return url;
}

export function publishedOrderMetadata(record, now = new Date()) {
  const menu = readPublishedOrderMenu(record, now);
  return menu ? { ok: true, menuCycleId: menu.menuCycleId, deliveryDate: menu.deliveryDate,
    publishedAt: menu.publishedAt, dishCount: menu.meals.length } : { ok: false, status: 'NO_PUBLISHED_ACTIVE_MENU' };
}
