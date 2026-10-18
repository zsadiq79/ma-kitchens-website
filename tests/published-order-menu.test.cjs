const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const modulePromise = import(pathToFileURL(path.join(root, 'lib/publishedOrderMenu.mjs')));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data/published-order-menu.json'), 'utf8'));
const sample = () => ({ schemaVersion: 2, menuRevision: 'a'.repeat(64), minimumOrderItems: 5, deliveryFeeCents: 1000, publishedAt: '2026-10-16T09:00:00Z',
  menuCycleId: 'MENU-2026-10-22', deliveryDate: '2026-10-22', meals: [{ id: 'i_aaaaaaaaaaaaaaaaaaaaaaaa', dishName: 'Butter Chicken', price: 15, priceDisplay: '$15.00' }] });
const now = () => new Date('2026-10-16T10:00:00Z');

test('Saved snapshot opens the existing manual WhatsApp number with editable quantities', async () => {
  const m = await modulePromise, url = m.selectedOrderTarget(sample(), ['5'], now());
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.pathname, '/61420246023');
  const message = url.searchParams.get('text');
  assert(message.includes('Delivery: Thu 22 Oct')); assert(message.includes('5 × Butter Chicken - $75.00'));
  assert(message.includes('Food subtotal: $75.00')); assert(!message.includes('Delete any dishes'));
});
test('Initial 22 October snapshot has the 14 currently available live dishes', async () => {
  const m = await modulePromise, menu = m.readPublishedOrderMenu(snapshot, new Date('2026-10-21T00:00:00Z'));
  assert(menu); assert.equal(menu.meals.length, 14); assert.equal(menu.meals[0].dishName, 'Crazy Haleem');
});
test('Public item IDs and revision match verified live menu-line IDs', () => {
  const lineByDish = {
    'Crazy Haleem': 'ML-20261022-M0058', 'Qeema Dillema': 'ML-20261022-M0059', 'Stir Fried Veggies': 'ML-20261022-M0060',
    'Chicken Shashlik with White Rice': 'ML-20261022-M0061', 'Crème Criminal': 'ML-20261022-M0063',
    'Achari Kabuli Biryani': 'ML-20261022-M0049', 'Highway Balochi karhai': 'ML-20261022-M0050', 'Desi Phalliya Alo': 'ML-20261022-M0051',
    'Tawa Beef Kebab w/ Vegetables': 'ML-20261022-M0052', 'Dahi Phulkiya Chaat': 'ML-20261022-M0053',
    'Fudge Brownie Trifle': 'ML-20261022-M0054', 'Beef Palao': 'ML-20261022-M0055', 'Bhindi': 'ML-20261022-M0056', 'Daal Maash': 'ML-20261022-M0057',
  };
  for (const meal of snapshot.meals) {
    const expected = 'i_' + crypto.createHash('sha256').update('MK_ORDER_ITEM|' + lineByDish[meal.dishName]).digest('hex').slice(0, 24);
    assert.equal(meal.id, expected);
  }
  const stable = [snapshot.menuCycleId, snapshot.deliveryDate, snapshot.minimumOrderItems, snapshot.deliveryFeeCents,
    snapshot.meals.map(meal => [meal.id, meal.dishName, Math.round(meal.price * 100), meal.imageUrl || ''])];
  assert.equal(snapshot.menuRevision, crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex'));
});
test('Ordering closes at 10pm Sydney on the day before delivery', async () => {
  const m = await modulePromise;
  assert(m.readPublishedOrderMenu(sample(), new Date('2026-10-21T10:59:59Z')));
  assert.equal(m.readPublishedOrderMenu(sample(), new Date('2026-10-21T11:00:00Z')), null);
});
test('Sydney date handles winter and daylight-saving offsets', async () => {
  const m = await modulePromise;
  assert.equal(m.sydneyDate(new Date('2026-07-01T13:59:59Z')), '2026-07-01');
  assert.equal(m.sydneyDate(new Date('2026-07-01T14:00:00Z')), '2026-07-02');
  assert.equal(m.sydneyDate(new Date('2026-10-22T13:00:00Z')), '2026-10-23');
});
test('Missing, withdrawn and expired snapshots use the current-menu fallback', async () => {
  const m = await modulePromise;
  for (const record of [null, {}, { ...sample(), withdrawn: true }, { ...sample(), deliveryDate: '2026-10-15', menuCycleId: 'MENU-2026-10-15' }])
    assert.equal(m.readPublishedOrderMenu(record, now()), null);
  assert.equal(m.fallbackOrderTarget().searchParams.get('text'), m.FALLBACK_ORDER_MESSAGE);
});
test('Invalid date, mismatched cycle and future publication time are rejected', async () => {
  const m = await modulePromise;
  for (const patch of [{ deliveryDate: '2026-02-30', menuCycleId: 'MENU-2026-02-30' }, { menuCycleId: 'MENU-2026-10-23' }, { publishedAt: '2027-01-01T00:00:00Z' }])
    assert.equal(m.readPublishedOrderMenu({ ...sample(), ...patch }, now()), null);
});
test('Invalid prices, mismatched display price and injected dish lines are rejected', async () => {
  const m = await modulePromise;
  for (const meal of [{ dishName: 'Dish', price: -1 }, { dishName: 'Dish', price: 15, priceDisplay: '$1.00' }, { dishName: 'Dish\nFake item', price: 15 }, { dishName: 'Dish', price: '15' }])
    assert.equal(m.readPublishedOrderMenu({ ...sample(), meals: [meal] }, now()), null);
});
test('Replacing the published snapshot immediately selects the new content', async () => {
  const m = await modulePromise, next = { ...sample(), meals: [{ id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Replacement dish', price: 18 }] };
  assert(m.selectedOrderTarget(next, ['5'], now()).searchParams.get('text').includes('Replacement dish - $90'));
  assert(!m.selectedOrderTarget(next, ['5'], now()).searchParams.get('text').includes('Butter Chicken'));
});
test('Customer routing never fetches Apps Script and cannot cache past expiry', () => {
  const route = fs.readFileSync(path.join(root, 'app/(ordering)/go/order/current/page.tsx'), 'utf8');
  assert(!/\bfetch\s*\(|FLOW_MENU_API|process\.env/.test(route));
  assert(route.includes("dynamic = 'force-dynamic'")); assert(route.includes('<OrderMenu menu={menu} />'));
});
test('Published metadata reports the saved cycle or unavailable status', async () => {
  const m = await modulePromise;
  assert.deepEqual(m.publishedOrderMetadata(sample(), now()), { ok: true, menuCycleId: 'MENU-2026-10-22', deliveryDate: '2026-10-22', publishedAt: '2026-10-16T09:00:00Z', menuRevision: 'a'.repeat(64), dishCount: 1 });
  assert.equal(m.publishedOrderMetadata({}, now()).ok, false);
});

function publisherFixture() {
  const props = { ORDER_MENU_GITHUB_TOKEN: 'test-private-token', ORDER_MENU_GITHUB_BRANCH: 'test-weekly-menu' };
  const calls = [], logs = [], stored = { value: { schemaVersion: 1, withdrawn: true } }; let held = false, writes = 0;
  const requestHeaders = ['Record Type', 'Menu Revision', 'Menu Cycle ID', 'Delivery Date', 'Published At', 'Status', 'Public Item ID', 'Menu Line ID', 'Item Code', 'Cook ID', 'Kitchen Name', 'Dish Name', 'List Price Cents', 'Cook Pay Cents', 'Remaining Servings', 'Image URL', 'Minimum Order Items', 'Delivery Fee Cents'];
  const stateWrites = [];
  const stateSheet = { getRange: () => ({ getDisplayValues: () => [requestHeaders] }), getLastRow: () => 1, getSheetId: () => 99 };
  const spreadsheet = { getOwner: () => ({ getEmail: () => 'owner@example.com' }), getSheetByName: () => stateSheet, getId: () => 'control-tower' };
  let owner = true, status = 200;
  const menu = { status: 'ACTIVE', menuCycleId: 'MENU-2099-01-01', deliveryDate: '2099-01-01', deliveryDateDisplay: 'Thu 1 Jan',
    meals: [{ id: 'i_cccccccccccccccccccccccc', menuLineId: 'ML-20990101-M0001', itemCode: 'M0001', cookId: 'C0001', cookPay: 8, kitchenName: 'Kitchen', dishName: 'Dish', price: 15, priceDisplay: '$15.00', remainingServings: 10 }, { id: 'i_dddddddddddddddddddddddd', menuLineId: 'ML-20990101-M0002', itemCode: 'M0002', cookId: 'C0001', cookPay: 8, kitchenName: 'Kitchen', dishName: 'Sold out', price: 12, remainingServings: 0 }] };
  const sha = 'a'.repeat(40), commit = 'b'.repeat(40);
  const ctx = { Date, console: { log: v => logs.push(v) }, CONTROL_TOWER_SPREADSHEET_ID: 'control-tower',
    SpreadsheetApp: { openById: () => spreadsheet },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner ? 'owner@example.com' : 'other@example.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { held = true; return true; }, releaseLock: () => { held = false; } }) },
    Utilities: { formatDate: (d, zone, pattern) => pattern === 'HH' ? new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(d) : new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d), Charset: { UTF_8: 'UTF-8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(String(value)).digest()].map(byte => byte > 127 ? byte - 256 : byte),
      base64Encode: s => Buffer.from(s, 'utf8').toString('base64'), base64Decode: s => Buffer.from(s, 'base64'),
      newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }) },
    getOrderingRules_: () => ({ minimumOrderItems: 5, deliveryFee: 10 }),
    MK_ORDER_REQUEST_HEADERS: { 'Order Menu State': requestHeaders },
    Sheets: { Spreadsheets: { batchUpdate: (body, id) => stateWrites.push({ body, id }) } },
    buildActiveMenu_: () => menu,
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ url, method: options.method });
      assert.equal(options.headers.Authorization, 'Bearer test-private-token');
      if (status !== 200) return { getResponseCode: () => status, getContentText: () => 'provider secret details' };
      const get = options.method === 'get';
      if (!get) { const payload = JSON.parse(options.payload); assert.equal(payload.branch, 'test-weekly-menu'); assert.equal(payload.sha, sha); stored.value = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8')); writes++; }
      return { getResponseCode: () => get ? 200 : 200, getContentText: () => JSON.stringify(get ? { type: 'file', sha, encoding: 'base64', content: Buffer.from(JSON.stringify(stored.value)).toString('base64') } : { commit: { sha: commit } }) };
    } },
  };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/OrderingMenuPublisher.gs'), 'utf8'), ctx);
  return { ctx, props, calls, logs, stored, menu, stateWrites, held: () => held, writes: () => writes, owner: v => { owner = v; }, status: v => { status = v; } };
}
test('Publishing writes only available menu dishes to the configured branch', () => {
  const f = publisherFixture(), result = f.ctx.publishCurrentOrderingMenu();
  assert.equal(result.changed, true); assert.equal(result.branch, 'test-weekly-menu'); assert.equal(f.writes(), 1);
  assert.equal(f.stored.value.meals.length, 1); assert.equal(f.stored.value.meals[0].dishName, 'Dish'); assert.equal(f.held(), false);
  assert.equal(f.stored.value.schemaVersion, 2); assert.match(f.stored.value.menuRevision, /^[a-f0-9]{64}$/);
  assert.match(f.stored.value.meals[0].id, /^i_[a-f0-9]{24}$/); assert.equal(f.stored.value.minimumOrderItems, 5);
  assert.equal(f.stored.value.deliveryFeeCents, 1000); assert.equal(f.stored.value.meals[0].itemCode, undefined);
  assert.equal(f.stateWrites.length, 1);
});
test('Publication preview does not access GitHub or send WhatsApp messages', () => {
  const f = publisherFixture(), result = f.ctx.previewCurrentOrderingMenu(); assert.equal(result.dishCount, 1); assert.equal(f.calls.length, 0);
});
test('Publishing an identical snapshot does not create another deployment commit', () => {
  const f = publisherFixture(); f.ctx.publishCurrentOrderingMenu(); const result = f.ctx.publishCurrentOrderingMenu();
  assert.equal(result.changed, false); assert.equal(f.writes(), 1);
});
test('Republishing replaces dishes in the saved snapshot', () => {
  const f = publisherFixture(); f.ctx.publishCurrentOrderingMenu(); f.menu.meals[0].dishName = 'Updated dish'; f.ctx.publishCurrentOrderingMenu();
  assert.equal(f.writes(), 2); assert.equal(f.stored.value.meals[0].dishName, 'Updated dish');
});
test('Withdrawal replaces the snapshot with an unavailable record', () => {
  const f = publisherFixture(); f.ctx.withdrawPublishedOrderingMenu(); assert.equal(f.stored.value.withdrawn, true); assert.equal(f.stored.value.meals, undefined);
});

test('Withdrawal closes authoritative capture even when GitHub publication fails',()=>{
  const f=publisherFixture();f.status(503);
  assert.throws(()=>f.ctx.withdrawPublishedOrderingMenu(),/GITHUB_HTTP_503/);
  assert.equal(f.writes(),0);assert.equal(f.stateWrites.length,1);
  assert.equal(f.stateWrites[0].body.requests[1].updateCells.rows[1].values[5].userEnteredValue.stringValue,'WITHDRAWN');
});

test('A private state failure on identical publication cannot trigger another GitHub commit',()=>{
  const f=publisherFixture();f.ctx.publishCurrentOrderingMenu();assert.equal(f.writes(),1);
  f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw new Error('State write unavailable')};
  assert.throws(()=>f.ctx.publishCurrentOrderingMenu(),/State write unavailable/);assert.equal(f.writes(),1);
});
test('Missing or expired menus cannot overwrite the published menu', () => {
  for (const patch of [{ status: 'NO_ACTIVE_MENU' }, { deliveryDate: '2020-01-01', menuCycleId: 'MENU-2020-01-01' }]) {
    const f = publisherFixture(); Object.assign(f.menu, patch); assert.throws(() => f.ctx.publishCurrentOrderingMenu(), /NO_ACTIVE_IN_DATE_MENU/); assert.equal(f.calls.length, 0); assert.equal(f.held(), false);
  }
});
test('Non-owner and missing-token publishes stop without a GitHub write', () => {
  const f = publisherFixture(); f.owner(false); assert.throws(() => f.ctx.publishCurrentOrderingMenu(), /OWNER_REQUIRED/); assert.equal(f.calls.length, 0);
  f.owner(true); delete f.props.ORDER_MENU_GITHUB_TOKEN; assert.throws(() => f.ctx.publishCurrentOrderingMenu(), /SET_ORDER_MENU_GITHUB_TOKEN/); assert.equal(f.calls.length, 0);
});
test('Conflicting GitHub writes release the lock and do not expose provider response', () => {
  const f = publisherFixture(); f.status(409); assert.throws(() => f.ctx.publishCurrentOrderingMenu(), /GITHUB_HTTP_409/); assert.equal(f.held(), false); assert(!f.logs.join('').includes('secret'));
});
test('Publisher logs never expose the private token', () => {
  const f = publisherFixture(); f.ctx.publishCurrentOrderingMenu(); assert(!f.logs.join('').includes('test-private-token'));
});
test('The shared link renders the selection page instead of an all-dishes WhatsApp redirect', () => {
  const page = fs.readFileSync(path.join(root, 'app/(ordering)/go/order/current/page.tsx'), 'utf8');
  assert(page.includes('readPublishedOrderMenu(publishedMenu)')); assert(page.includes('<OrderMenu menu={menu} />'));
  assert(!fs.existsSync(path.join(root, 'app/go/order/current/route.ts')));
});
test('Actual public verification route returns saved menu metadata without a lookup', async () => {
  const m = await modulePromise;
  const route = fs.readFileSync(path.join(root, 'app/api/order-menu/published/route.ts'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const GET = new Function('publishedMenu', 'publishedOrderMetadata', route + '\nreturn GET;')(sample(), r => m.publishedOrderMetadata(r, now()));
  const response = await GET(); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).menuCycleId, 'MENU-2026-10-22');
});

test('Blank and zero quantities are omitted from the WhatsApp order', async () => {
  const m = await modulePromise, record = { ...sample(), meals: [sample().meals[0], { id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Unwanted dish', price: 12 }, { id: 'i_cccccccccccccccccccccccc', dishName: 'Also unwanted', price: 10 }] };
  const text = m.selectedOrderTarget(record, ['5', '', '0'], now()).searchParams.get('text');
  assert(text.includes('5 × Butter Chicken')); assert(!text.includes('Unwanted')); assert(!text.includes('Also unwanted'));
});
test('Selecting five dishes includes exactly those five lines', async () => {
  const m = await modulePromise, quantities = snapshot.meals.map((_, i) => i < 5 ? '1' : '');
  const text = m.selectedOrderTarget(snapshot, quantities, new Date('2026-10-21T00:00:00Z')).searchParams.get('text');
  assert.equal(text.split('\n').filter(line => /^\d+ × /.test(line)).length, 5);
  assert(!text.includes(snapshot.meals[5].dishName));
});
test('No selection cannot continue to WhatsApp', async () => {
  const m = await modulePromise; assert.throws(() => m.selectedOrderTarget(sample(), [''], now()), /NO_DISHES_SELECTED/);
});
test('Fractional, negative, invalid and oversized quantities cannot continue', async () => {
  const m = await modulePromise;
  for (const value of ['1.5', '-1', 'abc', '1000']) assert.throws(() => m.selectedOrderTarget(sample(), [value], now()), /INVALID_QUANTITY/);
});
test('Food subtotal uses integer cents and multiple servings', async () => {
  const m = await modulePromise, record = { ...sample(), meals: [{ id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Dish', price: 12.35 }] };
  const menu = m.readPublishedOrderMenu(record, now()); const summary = m.orderSelection(menu, ['3']);
  assert.equal(summary.totalQuantity, 3); assert.equal(summary.subtotalCents, 3705);
  assert(m.selectedOrderTarget(record, ['5'], now()).searchParams.get('text').includes('Food subtotal: $61.75'));
});
test('An order left open across the cutoff cannot send a closed menu', async () => {
  const m = await modulePromise; assert.throws(() => m.selectedOrderTarget(sample(), ['5'], new Date('2026-10-21T11:00:00Z')), /MENU_EXPIRED/);
});
test('Selection cannot reference dishes outside the published snapshot', async () => {
  const m = await modulePromise; assert.throws(() => m.selectedOrderTarget(sample(), ['1', '2'], now()), /INVALID_QUANTITY/);
});

test('One to four items cannot continue; five servings of one dish qualify', async () => {
  const m = await modulePromise;
  for (let quantity = 1; quantity < 5; quantity++) assert.throws(() => m.selectedOrderTarget(sample(), [String(quantity)], now()), /MINIMUM_ORDER_NOT_MET/);
  const text = m.selectedOrderTarget(sample(), ['5'], now()).searchParams.get('text');
  assert(text.includes('Delivery fee: $10.00')); assert(text.includes('Total: $85.00'));
});
test('Minimum counts total servings across dishes, with a single delivery fee', async () => {
  const m = await modulePromise;
  const record = { ...sample(), meals: [...sample().meals, { id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Daal', price: 12.35 }] };
  const text = m.selectedOrderTarget(record, ['3', '2'], now()).searchParams.get('text');
  assert(text.includes('Food subtotal: $69.70')); assert(text.includes('Total: $79.70'));
  assert.equal(text.split('Delivery fee: $10.00').length - 1, 1);
});

test('Saved choices restore only for the identical in-date menu', async () => {
  const m = await modulePromise, menu = m.readPublishedOrderMenu(sample(), now());
  const raw = JSON.stringify({ signature: m.orderDraftSignature(menu), quantities: ['5'] });
  assert.deepEqual(m.readOrderDraft(raw, menu, now()), ['5']);
  assert.equal(m.readOrderDraft(raw, { ...menu, meals: [{ id: 'i_bbbbbbbbbbbbbbbbbbbbbbbb', dishName: 'Different dish', price: 15 }] }, now()), null);
  assert.equal(m.readOrderDraft(raw, { ...menu, meals: [{ id: 'i_aaaaaaaaaaaaaaaaaaaaaaaa', dishName: 'Butter Chicken', price: 16 }] }, now()), null);
  assert.equal(m.readOrderDraft(raw, menu, new Date('2026-10-21T11:00:00Z')), null);
});
test('Malformed saved choices cannot crash ordering or restore invalid quantities', async () => {
  const m = await modulePromise, menu = m.readPublishedOrderMenu(sample(), now());
  for (const raw of [null, '{', 'null', '{}']) assert.equal(m.readOrderDraft(raw, menu, now()), null);
  const saved = quantities => JSON.stringify({ signature: m.orderDraftSignature(menu), quantities });
  assert.equal(m.readOrderDraft(saved(['1', '2']), menu, now()), null);
  for (const value of ['-1', '1.5', '1000', 5, {}]) assert.deepEqual(m.readOrderDraft(saved([value]), menu, now()), ['']);
});

test('Menu photos normalize to the existing website library, without blocking orders', async () => {
  const m = await modulePromise;
  for (const value of ['/menu-images/Dish-0040.webp', 'https://www.makitchens.com.au/menu-images/Dish-0040.webp', 'https://makitchens.com.au/menu-images/Dish-0040.webp']) assert.equal(m.menuImagePath(value), '/menu-images/Dish-0040.webp');
  for (const value of ['https://example.com/photo.jpg', '//example.com/x.jpg', 'javascript:alert(1)', '/menu-images/../photo.jpg', '/menu-images/a.svg', '/menu-images/a.jpg?x=1', null]) assert.equal(m.menuImagePath(value), '');
  const record = sample(); record.meals[0].imageUrl = 'https://example.com/photo.jpg';
  assert.equal(m.readPublishedOrderMenu(record, now()).meals[0].imageUrl, '');
  assert(m.selectedOrderTarget(record, ['5'], now()));
  assert.equal(m.readPublishedOrderMenu(snapshot, new Date('2026-10-17T02:00:00Z')).meals[0].imageUrl, '/menu-images/Dish-0030.png');
});
test('Weekly publisher preserves valid photo mappings and safely omits missing photos', () => {
  const f = publisherFixture(); f.menu.meals[0].imageUrl = 'https://www.makitchens.com.au/menu-images/Dish-0041.jpg';
  f.ctx.publishCurrentOrderingMenu(); assert.equal(f.stored.value.meals[0].imageUrl, '/menu-images/Dish-0041.jpg');
  f.menu.meals[0].imageUrl = 'https://example.com/photo.jpg'; f.ctx.publishCurrentOrderingMenu(); assert.equal(f.stored.value.meals[0].imageUrl, undefined);
});

test('Cutoff handles winter, month/year boundaries and leap days', async () => {
  const m = await modulePromise;
  for (const [delivery, before, at] of [
    ['2026-07-02', '2026-07-01T11:59:59Z', '2026-07-01T12:00:00Z'],
    ['2027-01-01', '2026-12-31T10:59:59Z', '2026-12-31T11:00:00Z'],
    ['2028-03-01', '2028-02-29T10:59:59Z', '2028-02-29T11:00:00Z'],
  ]) {
    assert(m.orderingIsOpen(delivery, new Date(before)));
    assert.equal(m.orderingIsOpen(delivery, new Date(at)), false);
  }
  assert.equal(m.orderingCutoffDate('2028-03-01'), '2028-02-29');
  assert.equal(m.orderingIsOpen('bad', now()), false);
  assert.equal(m.orderingIsOpen('2026-10-22', new Date('bad')), false);
  assert.equal(m.orderingIsOpen('2026-10-22', new Date('2026-10-22T00:00:00Z')), false);
});
test('Publisher and website agree on the 10pm cutoff in winter and summer', async () => {
  const m = await modulePromise, f = publisherFixture();
  for (const [delivery, times] of [
    ['2026-10-22', ['2026-10-21T10:59:59Z', '2026-10-21T11:00:00Z', '2026-10-22T00:00:00Z']],
    ['2026-07-02', ['2026-07-01T11:59:59Z', '2026-07-01T12:00:00Z']],
  ]) for (const time of times) {
    const date = new Date(time);
    assert.equal(f.ctx.mkOrderBeforeCutoff_(delivery, date), m.orderingIsOpen(delivery, date));
    const menu = { ...f.menu, deliveryDate: delivery, menuCycleId: 'MENU-' + delivery,
      meals: f.menu.meals.map(meal => ({ ...meal, menuLineId: 'ML-' + delivery.replace(/-/g, '') + '-' + meal.itemCode })) };
    if (m.orderingIsOpen(delivery, date)) assert(f.ctx.mkOrderSnapshot_(menu, date));
    else assert.throws(() => f.ctx.mkOrderSnapshot_(menu, date), /NO_ACTIVE_IN_DATE_MENU_TO_PUBLISH/);
  }
});

