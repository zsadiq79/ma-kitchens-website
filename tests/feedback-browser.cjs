// Production browser smoke tests. Mocked feedback API only; no Control Tower.
// Run after npm run build and npm start. See docs/FEEDBACK_V2_INSTALL.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.FEEDBACK_TEST_BASE_URL || 'http://127.0.0.1:3000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const token = 'T'.repeat(43), replacement = 'U'.repeat(43); const requests = []; const errors = [];
  page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
  page.on('pageerror', e => errors.push(e.message));
  let calls = [], submitted = 0, revision = 1, failure = '', draft = { dishes: [{ itemCode: 'M1', rating: 4, skipped: false, comment: 'Saved on an earlier visit' }, { itemCode: 'M2', rating: 0, skipped: false, comment: '' }], deliveryRating: 0, overallComment: '', testimonialConsent: false };
  const order = () => ({ customerName: 'Sameera', deliveryDate: '24 September 2026', orderId: 'ORD-TEST', status: submitted ? 'COMPLETED' : 'OPEN', dishes: [{ itemCode: 'M1', dishName: 'Tadka Daal', kitchenName: 'Public Kitchen', imageUrl: '/menu-images/Dish-0003.jpg' }, { itemCode: 'M2', dishName: 'Aalo Gobhi', kitchenName: 'Public Kitchen', imageUrl: '/menu-images/Dish-0004.jpg' }], submissionId: 'persistent-id', revision, draft: submitted ? null : draft });
  await page.route('**/api/feedback', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    assert([token, replacement].includes(body.token));
    if (failure && body.action === 'feedback_read') return route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: failure }) });
    let result = {};
    if (body.action === 'feedback_read') result = order();
    if (body.action === 'feedback_draft') { assert.equal(body.revision, revision); draft = body.submission; revision++; result = { revision }; }
    if (body.action === 'feedback_submit') { assert.equal(body.submissionId, 'persistent-id'); assert.equal(body.revision, revision); submitted++; result = { status: 'COMPLETED' }; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const response = await page.goto(base + '/feedback/open#' + token);
  assert.equal(response.status(), 200); assert.equal(response.headers()['referrer-policy'], 'no-referrer');
  assert.match(response.headers()['x-robots-tag'], /noindex/); assert.match(response.headers()['content-security-policy'], /connect-src 'self'/);
  await page.getByText('Your progress is saved automatically', { exact: true }).waitFor();
  assert.equal(await page.locator('#comment-M1').inputValue(), 'Saved on an earlier visit');
  assert.equal(await page.locator('input[type=checkbox]').last().isChecked(), false);
  assert.equal(await page.getByRole('button', { name: 'Submit feedback', exact: true }).isDisabled(), true);
  await page.locator('#comment-M1').fill('=FORMULA stays plain text');
  await page.getByText("I didn't try this dish", { exact: true }).nth(1).click();
  await page.getByRole('group', { name: 'Rate your delivery experience', exact: true }).getByRole('button', { name: '5 stars', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-live=polite]')?.textContent === 'Your progress is saved automatically');
  assert(calls.some(c => c.action === 'feedback_draft')); assert.equal(draft.dishes[0].comment, '=FORMULA stays plain text');
  await page.evaluate(value => { window.location.hash = value; }, replacement);
  await page.waitForFunction(() => document.querySelector('[aria-live=polite]')?.textContent === 'Your progress is saved automatically');
  assert(calls.some(c => c.action === 'feedback_read' && c.token === replacement));
  await page.reload(); await page.getByText('Your progress is saved automatically', { exact: true }).waitFor();
  assert.equal(await page.locator('#comment-M1').inputValue(), '=FORMULA stays plain text');
  await page.getByRole('button', { name: 'Submit feedback', exact: true }).dblclick();
  await page.getByText('Feedback received', { exact: true }).waitFor(); assert.equal(submitted, 1);
  await page.reload(); await page.getByText('Feedback received', { exact: true }).waitFor(); assert.equal(submitted, 1);
  assert(calls.some(c => c.action === 'feedback_event' && c.event === 'browser_opened'));
  assert(calls.some(c => c.action === 'feedback_event' && c.event === 'first_interaction'));
  assert.equal(await page.evaluate(() => typeof window.fbq), 'undefined');
  assert.equal(await page.locator('script[src*="insights"],script[src*="fbevents"],img[src*="facebook.com/tr"]').count(), 0);
  assert(!requests.some(r => /analytics|facebook|insights|control.?tower|script.google/.test(r.url)));
  assert(!requests.some(r => r.url.includes(token) || r.url.includes(replacement))); // Fragment not sent in HTTP requests.
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const [code, title] of [['EXPIRED','This feedback link has expired'],['REVOKED','This feedback link is no longer active'],['REPLACED','A newer feedback link is available']]) { failure = code; await page.reload(); await page.getByText(title, { exact: true }).waitFor(); assert.equal(await page.locator('form').count(), 0); }
  await page.goto(base + '/feedback/open#invalid'); await page.getByText('This feedback link is unavailable', { exact: true }).waitFor();
  const count = calls.length;
  await page.goto(base + '/feedback/demo-sameera'); await page.getByText('Demonstration only', { exact: true }).waitFor();
  for (const checkbox of await page.getByText("I didn't try this dish", { exact: true }).all()) await checkbox.click();
  await page.getByRole('group', { name: 'Rate your delivery experience', exact: true }).getByRole('button', { name: '5 stars', exact: true }).click();
  await page.getByRole('button', { name: 'Submit demonstration', exact: true }).click();
  await page.getByText('Demonstration complete', { exact: true }).waitFor(); assert.equal(calls.length, count);
  assert.equal(await page.evaluate(() => typeof window.fbq), 'undefined'); assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: draft restore/autosave/reopen, one submit on double click, completed reopen, interaction signals, invalid/expired/revoked/replaced states, no token HTTP URLs/storage/tracking, mobile width, and unchanged self-contained demo. API was mocked; no live backend requests.');
})().catch(e => { console.error(e); process.exit(1); });
