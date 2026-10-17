import {
  MAX_ORDER_QUANTITY,
  foodMoney,
  readPublishedOrderMenu,
} from './publishedOrderMenu.mjs';

const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeOrderRequest(record, input, now = new Date()) {
  const menu = readPublishedOrderMenu(record, now);
  if (!menu) throw new Error('MENU_UNAVAILABLE');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REQUEST');
  if (typeof input.requestKey !== 'string' || !REQUEST_KEY.test(input.requestKey)) throw new Error('INVALID_REQUEST_KEY');
  if (input.menuRevision !== menu.menuRevision || input.menuCycleId !== menu.menuCycleId || input.deliveryDate !== menu.deliveryDate)
    throw new Error('MENU_REVISION_MISMATCH');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > menu.meals.length) throw new Error('INVALID_ITEMS');

  const byId = new Map(menu.meals.map((meal, index) => [meal.id, { ...meal, index }]));
  const selected = new Map();
  for (const item of input.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ORDER_QUANTITY ||
        !byId.has(item.id) || selected.has(item.id)) throw new Error('INVALID_ITEMS');
    selected.set(item.id, item.quantity);
  }

  const items = [];
  let totalQuantity = 0, foodSubtotalCents = 0;
  for (const meal of menu.meals) {
    const quantity = selected.get(meal.id);
    if (!quantity) continue;
    const unitPriceCents = Math.round(meal.price * 100);
    items.push({ id: meal.id, quantity, unitPriceCents, lineTotalCents: unitPriceCents * quantity,
      dishName: meal.dishName });
    totalQuantity += quantity;
    foodSubtotalCents += unitPriceCents * quantity;
  }
  if (totalQuantity < menu.minimumOrderItems) throw new Error('MINIMUM_ORDER_NOT_MET');
  return {
    requestKey: input.requestKey,
    menuRevision: menu.menuRevision,
    menuCycleId: menu.menuCycleId,
    deliveryDate: menu.deliveryDate,
    items,
    totalQuantity,
    foodSubtotalCents,
    minimumOrderItems: menu.minimumOrderItems,
    deliveryFeeCents: menu.deliveryFeeCents,
    publicTotalCents: foodSubtotalCents + menu.deliveryFeeCents,
  };
}

export function orderRequestMessage(menu, request, reference) {
  if (!menu || !request || typeof reference !== 'string' || !/^MK-[A-Z0-9]{8}$/.test(reference))
    throw new Error('INVALID_REQUEST_REFERENCE');
  const meals = new Map(menu.meals.map(meal => [meal.id, meal]));
  const lines = request.items.map(item => {
    const meal = meals.get(item.id);
    if (!meal) throw new Error('MENU_REVISION_MISMATCH');
    return `${item.quantity} × ${meal.dishName} - ${foodMoney(item.lineTotalCents)}`;
  });
  return [
    'Hi Ma Kitchens, I would like to place this tentative order request.',
    `Request reference: ${reference}`,
    `Delivery: ${menu.deliveryDateDisplay}`,
    '',
    ...lines,
    '',
    `Food subtotal: ${foodMoney(request.foodSubtotalCents)}`,
    `Delivery fee: ${foodMoney(request.deliveryFeeCents)}`,
    `Public estimate: ${foodMoney(request.publicTotalCents)}`,
    'Please confirm availability and the final total.',
    'This request is saved, but is not confirmed until Ma Kitchens accepts it.',
  ].join('\n');
}

export function orderRequestSignature(menu, quantities) {
  return JSON.stringify([menu.menuRevision, menu.menuCycleId, menu.deliveryDate,
    menu.meals.map((meal, index) => quantities[index] ? [meal.id, Number(quantities[index])] : null).filter(Boolean)]);
}
