const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const modulePromise = import(pathToFileURL(path.join(root, 'lib/publishedOrderMenu.mjs')));
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data/published-order-menu.json'), 'utf8'));
const sample = () => ({ schemaVersion: 1, publishedAt: '2026-10-16T09:00:00Z',
  menuCycleId: 'MENU-2026-10-22', deliveryDate: '2026-10-22', meals: [{ dishName: 'Butter Chicken', price: 15, priceDisplay: '$15.00' }] });
const now = () => new Date('2026-10-16T10:00:00Z');

test('Saved snapshot opens the existing manual WhatsApp number with editable quantities', async () => {
  const m = await modulePromise, url = m.publishedOrderTarget(sample(), now());
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.pathname, '/61420246023');
  const message = url.searchParams.get('text');
  assert(message.includes('Delivery: Thu 22 Oct')); assert(message.includes('1 × Butter Chicken - $15.00'));
  assert(message.includes('Change 1 to the quantity')); assert(message.includes('Delete any dishes'));
});
test('Initial 22 October snapshot has the 13 verified live dishes', async () => {
  const m = await modulePromise, menu = m.readPublishedOrderMenu(snapshot, new Date('2026-10-22T00:00:00Z'));
  assert(menu); assert.equal(menu.meals.length, 13); assert.equal(menu.meals[0].dishName, 'Beef Sindhi Biryani');
});
test('Expiry occurs at Sydney midnight after delivery, not UTC midnight', async () => {
  const m = await modulePromise;
  assert(m.readPublishedOrderMenu(sample(), new Date('2026-10-22T12:59:59Z')));
  assert.equal(m.readPublishedOrderMenu(sample(), new Date('2026-10-22T13:00:00Z')), null);
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
    assert.equal(m.publishedOrderTarget(record, now()).searchParams.get('text'), m.FALLBACK_ORDER_MESSAGE);
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
  const m = await modulePromise, next = { ...sample(), meals: [{ dishName: 'Replacement dish', price: 18 }] };
  assert(m.publishedOrderTarget(next, now()).searchParams.get('text').includes('Replacement dish - $18'));
  assert(!m.publishedOrderTarget(next, now()).searchParams.get('text').includes('Butter Chicken'));
});
test('Customer routing never fetches Apps Script and cannot cache past expiry', () => {
  const route = fs.readFileSync(path.join(root, 'app/go/order/current/route.ts'), 'utf8');
  assert(!/\bfetch\s*\(|FLOW_MENU_API|process\.env/.test(route));
  assert(route.includes("dynamic = 'force-dynamic'")); assert(route.includes("'Cache-Control': 'no-store'"));
});
test('Published metadata reports the saved cycle or unavailable status', async () => {
  const m = await modulePromise;
  assert.deepEqual(m.publishedOrderMetadata(sample(), now()), { ok: true, menuCycleId: 'MENU-2026-10-22', deliveryDate: '2026-10-22', publishedAt: '2026-10-16T09:00:00Z', dishCount: 1 });
  assert.equal(m.publishedOrderMetadata({}, now()).ok, false);
});

function publisherFixture() {
  const props = { ORDER_MENU_GITHUB_TOKEN: 'test-private-token', ORDER_MENU_GITHUB_BRANCH: 'test-weekly-menu' };
  const calls = [], logs = [], stored = { value: { schemaVersion: 1, withdrawn: true } }; let held = false, writes = 0;
  let owner = true, status = 200;
  const menu = { status: 'ACTIVE', menuCycleId: 'MENU-2099-01-01', deliveryDate: '2099-01-01', deliveryDateDisplay: 'Thu 1 Jan',
    meals: [{ dishName: 'Dish', price: 15, priceDisplay: '$15.00', remainingServings: 10 }, { dishName: 'Sold out', price: 12, remainingServings: 0 }] };
  const sha = 'a'.repeat(40), commit = 'b'.repeat(40);
  const ctx = { Date, console: { log: v => logs.push(v) }, CONTROL_TOWER_SPREADSHEET_ID: 'control-tower',
    SpreadsheetApp: { openById: () => ({ getOwner: () => ({ getEmail: () => 'owner@example.com' }) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => owner ? 'owner@example.com' : 'other@example.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { held = true; return true; }, releaseLock: () => { held = false; } }) },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10), Charset: { UTF_8: 'UTF-8' },
      base64Encode: s => Buffer.from(s, 'utf8').toString('base64'), base64Decode: s => Buffer.from(s, 'base64'),
      newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }) },
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
  return { ctx, props, calls, logs, stored, menu, held: () => held, writes: () => writes, owner: v => { owner = v; }, status: v => { status = v; } };
}
test('Publishing writes only available menu dishes to the configured branch', () => {
  const f = publisherFixture(), result = f.ctx.publishCurrentOrderingMenu();
  assert.equal(result.changed, true); assert.equal(result.branch, 'test-weekly-menu'); assert.equal(f.writes(), 1);
  assert.equal(f.stored.value.meals.length, 1); assert.equal(f.stored.value.meals[0].dishName, 'Dish'); assert.equal(f.held(), false);
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
test('Actual customer route returns an uncached 302 to the saved WhatsApp message', async () => {
  const m = await modulePromise;
  const route = fs.readFileSync(path.join(root, 'app/go/order/current/route.ts'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const GET = new Function('publishedMenu', 'publishedOrderTarget', route + '\nreturn GET;')(sample(), r => m.publishedOrderTarget(r, now()));
  const response = await GET();
  assert.equal(response.status, 302); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert(new URL(response.headers.get('Location')).searchParams.get('text').includes('Butter Chicken'));
});
test('Actual public verification route returns saved menu metadata without a lookup', async () => {
  const m = await modulePromise;
  const route = fs.readFileSync(path.join(root, 'app/api/order-menu/published/route.ts'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const GET = new Function('publishedMenu', 'publishedOrderMetadata', route + '\nreturn GET;')(sample(), r => m.publishedOrderMetadata(r, now()));
  const response = await GET(); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).menuCycleId, 'MENU-2026-10-22');
});
