const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const root = path.join(__dirname, '..');
const modulePromise = import(pathToFileURL(path.join(root, 'lib/orderRequest.mjs')));

const now = new Date('2026-10-20T00:00:00Z');
const record = {
  schemaVersion: 2,
  menuRevision: 'a'.repeat(64),
  minimumOrderItems: 5,
  deliveryFeeCents: 1000,
  publishedAt: '2026-10-17T01:52:43.737Z',
  menuCycleId: 'MENU-2026-10-22',
  deliveryDate: '2026-10-22',
  meals: [
    { id: 'i_aaaaaaaaaaaaaaaaaaaaaaaa', dishName: 'Butter Chicken', price: 15 },
    { id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Daal Maash', price: 12.35 },
  ],
};
const requestKey = '123e4567-e89b-42d3-a456-426614174000';
const input = items => ({ requestKey, menuRevision: record.menuRevision, menuCycleId: record.menuCycleId,
  deliveryDate: record.deliveryDate, items });

test('Request pricing is recomputed from the published menu in integer cents', async () => {
  const m = await modulePromise;
  const result = m.normalizeOrderRequest(record, input([
    { id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', quantity: 2 },
    { id: 'i_aaaaaaaaaaaaaaaaaaaaaaaa', quantity: 3 },
  ]), now);
  assert.equal(result.totalQuantity, 5);
  assert.equal(result.foodSubtotalCents, 6970);
  assert.equal(result.deliveryFeeCents, 1000);
  assert.equal(result.publicTotalCents, 7970);
  assert.deepEqual(result.items.map(item => item.id), record.meals.map(meal => meal.id));
});

test('Five servings of one dish meet the minimum; four do not', async () => {
  const m = await modulePromise;
  assert.equal(m.normalizeOrderRequest(record, input([{ id: record.meals[0].id, quantity: 5 }]), now).totalQuantity, 5);
  assert.throws(() => m.normalizeOrderRequest(record, input([{ id: record.meals[0].id, quantity: 4 }]), now), /MINIMUM_ORDER_NOT_MET/);
});

test('Stale menu revisions, unknown dishes and duplicate dish lines are rejected', async () => {
  const m = await modulePromise;
  assert.throws(() => m.normalizeOrderRequest(record, { ...input([{ id: record.meals[0].id, quantity: 5 }]), menuRevision: 'b'.repeat(64) }, now), /MENU_REVISION_MISMATCH/);
  assert.throws(() => m.normalizeOrderRequest(record, input([{ id: 'i_ffffffffffffffffffffffff', quantity: 5 }]), now), /INVALID_ITEMS/);
  assert.throws(() => m.normalizeOrderRequest(record, input([
    { id: record.meals[0].id, quantity: 3 }, { id: record.meals[0].id, quantity: 2 },
  ]), now), /INVALID_ITEMS/);
});

test('Invalid quantities and malformed retry keys are rejected', async () => {
  const m = await modulePromise;
  for (const quantity of [0, -1, 1.5, 1000, '5']) {
    assert.throws(() => m.normalizeOrderRequest(record, input([{ id: record.meals[0].id, quantity }]), now), /INVALID_ITEMS/);
  }
  assert.throws(() => m.normalizeOrderRequest(record, { ...input([{ id: record.meals[0].id, quantity: 5 }]), requestKey: 'retry' }, now), /INVALID_REQUEST_KEY/);
});

test('Prepared WhatsApp message carries saved reference and public quote without customer data', async () => {
  const m = await modulePromise, menu = (await import(pathToFileURL(path.join(root, 'lib/publishedOrderMenu.mjs')))).readPublishedOrderMenu(record, now);
  const request = m.normalizeOrderRequest(record, input([{ id: record.meals[0].id, quantity: 5 }]), now);
  const message = m.orderRequestMessage(menu, request, 'MK-AB12CD34');
  assert(message.endsWith('Order ref: MK-AB12CD34'));
  assert(message.includes('5 × Butter Chicken - $75.00'));
  assert(message.includes('Delivery fee: $10.00'));
  assert(message.includes('not confirmed until Ma Kitchens accepts it'));
  assert(!/name:|address:|phone:/i.test(message));
});

test('New numeric references use the same plain footer in initial and recovered WhatsApp messages',async()=>{
  const m=await modulePromise,menu=(await import(pathToFileURL(path.join(root,'lib/publishedOrderMenu.mjs')))).readPublishedOrderMenu(record,now);
  const request=m.normalizeOrderRequest(record,input([{id:record.meals[0].id,quantity:5}]),now);
  for(const ref of ['1000','1234','10000']){
    const initial=m.orderRequestMessage(menu,request,ref),recovered=m.orderRequestFollowUpMessage(ref,record.deliveryDate);
    assert.equal(initial.split('Order ref:').length,2);assert.ok(initial.endsWith('Order ref: '+ref));
    assert.ok(recovered.endsWith('Order ref: '+ref));assert.doesNotMatch(initial,/Request reference:/);
  }
  assert.ok(m.validOrderReference('MK-AB12CD34'));
  for(const value of ['0001','123','1234\nFake line','1e4','-1234',1234,null])assert.equal(m.validOrderReference(value),false);
});
