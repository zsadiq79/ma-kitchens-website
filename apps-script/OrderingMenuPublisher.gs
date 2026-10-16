/* Ma Kitchens ordering-link MVP. Add this as a NEW file in the existing project.
 * Does not replace Code.gs, send WhatsApp messages, modify Sheets or add triggers.
 * Publish writes one public menu JSON file through the existing GitHub/Vercel flow.
 */
const MK_ORDER_PUBLISH = Object.freeze({
  repository: 'zsadiq79/ma-kitchens-website', branch: 'main',
  path: 'data/published-order-menu.json', timezone: 'Australia/Sydney'
});

function mkOrderPublishOwner_() {
  const owner = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID).getOwner();
  if (!owner || Session.getEffectiveUser().getEmail() !== owner.getEmail()) throw new Error('ORDER_PUBLISH_OWNER_REQUIRED');
}

function mkOrderImagePath_(value) {
  const path = typeof value === 'string' ? value.trim().replace(/^https:\/\/(?:www\.)?makitchens\.com\.au(?=\/)/, '') : '';
  return /^\/menu-images\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpe?g|png|webp)$/i.test(path) ? path : '';
}

function mkOrderSnapshot_(menu, now) {
  const date = menu && menu.deliveryDate;
  if (!menu || menu.status !== 'ACTIVE' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
      date < Utilities.formatDate(now, MK_ORDER_PUBLISH.timezone, 'yyyy-MM-dd') || menu.menuCycleId !== 'MENU-' + date ||
      !Array.isArray(menu.meals)) throw new Error('NO_ACTIVE_IN_DATE_MENU_TO_PUBLISH');
  const meals = menu.meals.filter(m => Number(m.remainingServings) > 0).map(m => {
    const name = String(m.dishName || '').trim(), price = Number(m.price), display = String(m.priceDisplay || '').trim();
    if (!name || name.length > 150 || /[\r\n\u0000-\u001f]/.test(name) || !Number.isFinite(price) || price <= 0 || price > 10000)
      throw new Error('INVALID_DISH_FOR_ORDER_MESSAGE');
    if (display && (!/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(display) || Math.abs(Number(display.slice(1).replace(/,/g, '')) - price) > 0.005))
      throw new Error('INVALID_PRICE_FOR_ORDER_MESSAGE');
    const result = { dishName: name, price: price };
    if (display) result.priceDisplay = display;
    const image = mkOrderImagePath_(m.imageUrl);
    if (image) result.imageUrl = image;
    return result;
  });
  if (!meals.length || meals.length > 100) throw new Error('NO_AVAILABLE_DISHES_TO_PUBLISH');
  return { schemaVersion: 1, publishedAt: now.toISOString(), menuCycleId: menu.menuCycleId,
    deliveryDate: date, deliveryDateDisplay: menu.deliveryDateDisplay || date, meals: meals };
}

function previewCurrentOrderingMenu() {
  mkOrderPublishOwner_();
  const result = mkOrderSnapshot_(buildActiveMenu_(), new Date());
  const summary = { menuCycleId: result.menuCycleId, deliveryDate: result.deliveryDate, dishCount: result.meals.length,
    dishes: result.meals.map(m => m.dishName + ' - $' + m.price.toFixed(2)) };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function mkOrderGithub_(method, url, token, payload) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, { method: method, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      ...(payload ? { payload: JSON.stringify(payload) } : {}), muteHttpExceptions: true, followRedirects: false });
  } catch (_) { throw new Error('ORDER_PUBLISH_TRANSPORT_UNCERTAIN_CHECK_GITHUB_BEFORE_RETRY'); }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('ORDER_PUBLISH_GITHUB_HTTP_' + status);
  try { return JSON.parse(response.getContentText()); } catch (_) { throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB'); }
}

function publishCurrentOrderingMenu() {
  mkOrderPublishOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_PUBLISH_BUSY_RETRY_LATER');
  try {
    // Build once under the same lock used by the existing order writers.
    const snapshot = mkOrderSnapshot_(buildActiveMenu_(), new Date());
    return mkOrderWriteSnapshot_(snapshot);
  } finally { lock.releaseLock(); }
}

function withdrawPublishedOrderingMenu() {
  mkOrderPublishOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_PUBLISH_BUSY_RETRY_LATER');
  try { return mkOrderWriteSnapshot_({ schemaVersion: 1, withdrawn: true, publishedAt: new Date().toISOString() }); }
  finally { lock.releaseLock(); }
}

function mkOrderWriteSnapshot_(snapshot) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('ORDER_MENU_GITHUB_TOKEN');
  if (!token || /[\r\n]/.test(token)) throw new Error('SET_ORDER_MENU_GITHUB_TOKEN_PRIVATELY');
  const branch = props.getProperty('ORDER_MENU_GITHUB_BRANCH') || MK_ORDER_PUBLISH.branch;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,150}$/.test(branch) || branch.includes('..')) throw new Error('INVALID_PUBLISH_BRANCH');
  const api = 'https://api.github.com/repos/' + MK_ORDER_PUBLISH.repository + '/contents/' + MK_ORDER_PUBLISH.path;
  // This file is created by the website PR. GET failure never guesses a SHA or retries a write.
  const current = mkOrderGithub_('get', api + '?ref=' + encodeURIComponent(branch), token);
  if (!current || current.type !== 'file' || !/^[a-f0-9]{40}$/.test(current.sha)) throw new Error('PUBLISH_FILE_NOT_READY');
  const body = JSON.stringify(snapshot, null, 2) + '\n';
  // Ignore publishedAt when deciding whether an identical menu needs another deployment.
  if (current.encoding === 'base64' && typeof current.content === 'string') {
    try {
      const old = JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.content.replace(/\s/g, ''))).getDataAsString());
      const withoutTime = record => { const copy = Object.assign({}, record); delete copy.publishedAt; return copy; };
      if (JSON.stringify(withoutTime(old)) === JSON.stringify(withoutTime(snapshot))) {
        const result = { changed: false, menuCycleId: snapshot.menuCycleId || '', branch: branch, note: 'Identical menu already committed. Check website deployment status.' };
        console.log(JSON.stringify(result)); return result;
      }
    } catch (_) { /* Replace an invalid old snapshot only with a validated newly built one. */ }
  }
  const response = mkOrderGithub_('put', api, token, { branch: branch, sha: current.sha,
    message: snapshot.withdrawn ? 'Withdraw published WhatsApp ordering menu' : 'Publish WhatsApp ordering menu ' + snapshot.deliveryDate,
    content: Utilities.base64Encode(body, Utilities.Charset.UTF_8) });
  if (!response.commit || typeof response.commit.sha !== 'string') throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB');
  const result = { changed: true, menuCycleId: snapshot.menuCycleId || '', deliveryDate: snapshot.deliveryDate || '',
    dishCount: snapshot.meals ? snapshot.meals.length : 0, branch: branch, commit: response.commit.sha,
    note: 'Committed. Wait for the Vercel deployment, then verify the ordering link. This is not a live-deployment confirmation.' };
  console.log(JSON.stringify(result)); return result;
}
