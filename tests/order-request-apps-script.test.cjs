const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const secret = 'test-order-request-signing-secret-which-is-long-enough';
const revision = 'a'.repeat(64);
const itemId = 'i_aaaaaaaaaaaaaaaaaaaaaaaa';
const menuLineId = 'ML-20261022-M0001';

function signedEvent(action, body) {
  const timestamp = String(Date.now()), rawBody = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}\n${action}\n${rawBody}`).digest('hex');
  return { parameter: { action }, postData: { contents: JSON.stringify({ timestamp, body: rawBody, signature }) } };
}

function fixture() {
  const definitions = {
    'Order Requests': 'Request ID,Request Reference,Retry Key,Payload Hash,Recovery Capability Hash,Menu Revision,Menu Cycle ID,Delivery Date,Status,Customer ID,Public Food Subtotal Cents,Public Delivery Fee Cents,Public Total Cents,Owner Discount Percent,Linked Order ID,Created At,Updated At,Received At,Accepted At,Expires At,Owner Notes,Sender Phone (OWNER)',
    'Order Request Items': 'Request ID,Public Item ID,Menu Line ID,Item Code,Dish Name (SNAPSHOT),Kitchen Name (SNAPSHOT),Cook ID,Qty,List Price / Unit Cents (SNAPSHOT),Cook Pay / Unit Cents (SNAPSHOT),Public Line Total Cents,Menu Revision',
    'Order Request Events': 'Event ID,Request ID,Request Reference,Event,Actor,Event At,Details JSON,Request Version',
    'Order Menu State': 'Record Type,Menu Revision,Menu Cycle ID,Delivery Date,Published At,Status,Public Item ID,Menu Line ID,Item Code,Cook ID,Kitchen Name,Dish Name,List Price Cents,Cook Pay Cents,Remaining Servings,Image URL,Minimum Order Items,Delivery Fee Cents',
  };
  const data = Object.fromEntries(Object.entries(definitions).map(([name, header]) => [name, [header.split(',')]]));
  data['Order Menu State'].push(['STATE', revision, 'MENU-2026-10-22', '2026-10-22', '2026-10-17T01:00:00.000Z', 'ACTIVE', '', '', '', '', '', '', '', '', '', '', 5, 1000]);
  data['Order Menu State'].push(['ITEM', revision, 'MENU-2026-10-22', '2026-10-22', '2026-10-17T01:00:00.000Z', 'ACTIVE', itemId, menuLineId, 'M0001', 'C0001', 'TEST KITCHEN', 'Test dish', 1500, 800, 50, '/menu-images/test.jpg', 5, 1000]);
  const weeklyHeaders = ['Menu Line ID', 'Menu Cycle ID', 'Delivery Date', 'Item Code', 'Dish Name', 'Cook ID', 'Menu Kitchen Name', 'Customer Price', 'Remaining Servings', 'Menu Status', 'Availability Status', 'Menu Card Readiness'];
  data['Weekly Menu'] = [weeklyHeaders, [menuLineId, 'MENU-2026-10-22', new Date('2026-10-22T00:00:00Z'), 'M0001', 'Test dish', 'C0001', 'TEST KITCHEN', 15, 50, 'Available', 'Available', 'READY']];
  const sheets = {};
  for (const [name, rows] of Object.entries(data)) sheets[name] = {
    getLastRow: () => data[name].length,
    getDataRange: () => ({ getValues: () => data[name] }),
    getRange: (row, col, height, width) => ({ getValues: () => data[name].slice(row - 1, row - 1 + height).map(line => line.slice(col - 1, col - 1 + width)) }),
    getSheetId: () => name === 'Order Requests' ? 1 : name === 'Order Request Items' ? 2 : name === 'Order Request Events' ? 3 : 4,
  };
  const content = value => ({ body: value, setMimeType() { return this; }, getContent() { return this.body; } });
  const ctx = {
    Date, JSON, Object, Array, Number, String, RegExp, Math, isNaN,
    CONTROL_TOWER_SPREADSHEET_ID: 'test-sheet', WEEKLY_MENU_SHEET: 'Weekly Menu',
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: content },
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => name === 'ORDER_REQUEST_API_SECRET' ? secret : null }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] || null, getId: () => 'test-sheet' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Sheets: { Spreadsheets: { batchUpdate: request => {
      for (const item of request.requests) {
        const update = item.updateCells, id = update.start.sheetId;
        const name = Object.keys(sheets).find(key => sheets[key].getSheetId() === id);
        const target = data[name], start = update.start.rowIndex;
        for (let r = 0; r < update.rows.length; r++) {
          const values = update.rows[r].values.map(cell => {
            if (!cell.userEnteredValue) return '';
            const value = cell.userEnteredValue;
            return value.stringValue ?? value.numberValue ?? value.boolValue ?? '';
          });
          if (!target[start + r]) target[start + r] = [];
          target[start + r] = values;
        }
      }
    } } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'UTF-8' },
      computeDigest: (_, value) => [...crypto.createHash('sha256').update(String(value)).digest()].map(byte => byte > 127 ? byte - 256 : byte),
      computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', key).update(String(value)).digest()].map(byte => byte > 127 ? byte - 256 : byte),
      formatDate: (date, zone, pattern) => new Intl.DateTimeFormat(pattern === 'HH' ? 'en-GB' : 'en-CA', pattern === 'HH'
        ? { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }
        : { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
      getUuid: () => crypto.randomUUID(),
    },
    mkCommitted_: () => ({}),
    mkMenuLines_: () => data['Weekly Menu'].slice(1).map(row=>({menuLineId:row[0],cycleId:row[1],deliveryDate:'2026-10-22',itemCode:row[3],dishName:row[4],cookId:row[5],kitchenName:row[6],priceCents:Math.round(row[7]*100),capacity:row[8],menuStatus:row[9],availabilityStatus:row[10],readiness:row[11],dishStatus:'Active'})),
    getOrderingRules_: () => ({ minimumOrderItems: 5, deliveryFee: 10 }),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/OrderRequests.gs'), 'utf8'), ctx);
  return { ctx, data };
}

function payload(patch = {}) {
  return { requestKey: '123e4567-e89b-42d3-a456-426614174000', menuRevision: revision, menuCycleId: 'MENU-2026-10-22',
    deliveryDate: '2026-10-22', recoveryCapability: Buffer.alloc(32, 7).toString('base64url'),
    items: [{ id: itemId, quantity: 5 }], ...patch };
}

function invoke(f, action, body) {
  return JSON.parse(f.ctx.handleOrderRequestApi_(signedEvent(action, body), action).getContent());
}

test('A public capture writes only unassigned request records and snapshots selected items', () => {
  const f = fixture(), result = invoke(f, 'order_request_capture', payload());
  assert.equal(result.ok, true); assert.equal(result.status, 'UNASSIGNED'); assert.match(result.reference, /^MK-[A-F0-9]{8}$/);
  const req = f.data['Order Requests'][1], line = f.data['Order Request Items'][1], event = f.data['Order Request Events'][1];
  assert.equal(req[8], 'UNASSIGNED'); assert.equal(req[9], ''); assert.equal(req[12], 8500);
  assert.equal(line[2], menuLineId); assert.equal(line[3], 'M0001'); assert.equal(line[4], 'Test dish');
  assert.equal(line[7], 5); assert.equal(line[8], 1500); assert.equal(line[9], 800);
  assert.equal(event[3], 'REQUEST_SAVED'); assert.equal(f.data.Orders, undefined);
});

test('Retry after a saved response returns the same reference without duplicate rows', () => {
  const f = fixture(), body = payload();
  const first = invoke(f, 'order_request_capture', body), second = invoke(f, 'order_request_capture', body);
  assert.equal(second.reference, first.reference); assert.equal(second.created, false);
  assert.equal(f.data['Order Requests'].length, 2); assert.equal(f.data['Order Request Items'].length, 2);
  assert.equal(f.data['Order Request Events'].length, 2);
});

test('Same retry key with changed quantities returns a conflict', () => {
  const f = fixture(); invoke(f, 'order_request_capture', payload());
  const changed = payload({ items: [{ id: itemId, quantity: 6 }] });
  assert.deepEqual(invoke(f, 'order_request_capture', changed), { ok: false, error: 'REQUEST_CONFLICT' });
  assert.equal(f.data['Order Requests'].length, 2);
});

test('Stale menu, closed cutoff and insufficient stock are rejected before writing', () => {
  const f = fixture();
  assert.equal(invoke(f, 'order_request_capture', payload({ menuRevision: 'b'.repeat(64) })).error, 'MENU_STALE');
  f.data['Weekly Menu'][1][8] = 4;
  assert.equal(invoke(f, 'order_request_capture', payload()).error, 'ITEM_UNAVAILABLE');
  assert.equal(f.data['Order Requests'].length, 1);
});

test('Recovery capability reveals only reference, status, delivery and total', () => {
  const f = fixture(), created = invoke(f, 'order_request_capture', payload());
  const result = invoke(f, 'order_request_recover', { capability: payload().recoveryCapability });
  assert.equal(result.found, true); assert.equal(result.reference, created.reference); assert.equal(result.status, 'UNASSIGNED');
  assert.equal(result.deliveryDate, '2026-10-22'); assert.equal(result.publicTotalCents, 8500);
  assert.equal('items' in result, false); assert.equal('customerId' in result, false); assert.equal('phone' in result, false);
});

test('Invalid signature does not write any rows', () => {
  const f = fixture(), event = signedEvent('order_request_capture', payload());
  event.postData.contents = event.postData.contents.replace(/[a-f0-9]{64}/, '0'.repeat(64));
  assert.equal(JSON.parse(f.ctx.handleOrderRequestApi_(event, 'order_request_capture').getContent()).ok, false);
  assert.equal(f.data['Order Requests'].length, 1);
});

test('Capture checks authoritative committed quantities even while the weekly remaining formula is stale',()=>{
  const f=fixture();f.ctx.mkCommitted_=()=>({[menuLineId]:48});
  assert.equal(invoke(f,'order_request_capture',payload()).error,'ITEM_UNAVAILABLE');
  assert.equal(f.data['Order Requests'].length,1);
});

test('Changed dish/cook identity and duplicate menu lines cannot be silently overwritten during capture',()=>{
  const f=fixture(),original=f.ctx.mkMenuLines_;
  f.ctx.mkMenuLines_=()=>original().map(line=>({...line,cookId:'CHANGED-COOK'}));
  assert.equal(invoke(f,'order_request_capture',payload()).error,'MENU_STALE');
  f.ctx.mkMenuLines_=()=>original().concat(original());
  assert.equal(invoke(f,'order_request_capture',payload()).error,'MENU_STALE');
  assert.equal(f.data['Order Requests'].length,1);
});

test('Retry keys use a canonical item order and duplicate durable keys fail closed',()=>{
  const f=fixture(),otherId='i_bbbbbbbbbbbbbbbbbbbbbbbb';
  const line=f.data['Order Menu State'][2].slice();line[6]=otherId;line[7]='ML-20261022-M0002';line[8]='M0002';f.data['Order Menu State'].push(line);
  const weekly=f.data['Weekly Menu'][1].slice();weekly[0]='ML-20261022-M0002';weekly[3]='M0002';f.data['Weekly Menu'].push(weekly);
  const input=payload({items:[{id:itemId,quantity:3},{id:otherId,quantity:2}]});
  const first=invoke(f,'order_request_capture',input);
  assert.equal(first.ok,true);const retry=invoke(f,'order_request_capture',{...input,items:input.items.slice().reverse()});
  assert.equal(retry.reference,first.reference);assert.equal(f.data['Order Requests'].length,2);
  f.data['Order Requests'].push(f.data['Order Requests'][1].slice());
  assert.equal(invoke(f,'order_request_capture',input).error,'REQUEST_CONFLICT');
});
