const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const folder = path.join(__dirname, '..', 'apps-script');
const modules = ['OrderAutomationTestBase.gs', 'OrderEngine.gs', 'OrderRequests.gs', 'OwnerOrders.gs', 'OwnerCustomers.gs', 'OwnerOrderSetup.gs', 'OrderingMenuPublisher.gs'];
const combined = fs.readFileSync(path.join(folder, 'test-install/Code.gs'), 'utf8');

test('Combined test installer is current, has one dispatcher and includes no legacy external writers', () => {
  const expected = modules.map(name => '// SOURCE: ' + name + '\n' + fs.readFileSync(path.join(folder, name), 'utf8')).join('\n\n');
  assert.equal(combined, expected);
  assert.equal((combined.match(/^function doPost\(/gm) || []).length, 1);
  assert.equal((combined.match(/^function doGet\(/gm) || []).length, 1);
  assert.doesNotMatch(combined, /graph\.facebook\.com|sendWhatsAppPayload_|handleRoutificWebhook_|1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4/);
  assert.match(combined, /ORDER_AUTOMATION_ENV/);
});

test('Public test dispatcher never exposes owner actions even when a browser names them', () => {
  const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'TEST' }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ setMimeType: () => text }) } };
  vm.createContext(ctx); vm.runInContext(combined, ctx);
  for (const action of ['ownerOrderAccept', 'ownerOrderSaveCustomer', 'ownerOrderReview', 'whatsapp_verified', 'menu'])
    assert.deepEqual(JSON.parse(ctx.doPost({ parameter: { action } })), { ok: false, error: 'UNKNOWN_ACTION' });
});

test('Owner interface has valid JavaScript and its static controls exist in the packaged HTML', () => {
  const html = fs.readFileSync(path.join(folder, 'OwnerOrderWorkspace.html'), 'utf8');
  assert.equal(html, fs.readFileSync(path.join(folder, 'test-install/OwnerOrderWorkspace.html'), 'utf8'));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of script.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), 'Missing control: ' + match[1]);
  assert.doesNotMatch(script, /innerHTML\s*=/);
});

test('Manifest enables Sheets and the minimal test files without embedded credentials', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'test-install/appsscript.json'), 'utf8'));
  assert.equal(manifest.timeZone, 'Australia/Sydney');
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].serviceId, 'sheets');
  assert.doesNotMatch(combined, /WHATSAPP_ACCESS_TOKEN|GITHUB_TOKEN\s*=\s*['"][^'"]+['"]/);
});
