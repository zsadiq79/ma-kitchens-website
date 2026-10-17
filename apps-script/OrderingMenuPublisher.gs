/* Ma Kitchens ordering-link MVP. Add this as a NEW file in the existing project.
 * Does not replace Code.gs, send WhatsApp messages, modify Sheets or add triggers.
 * Publish writes one public menu JSON file through the existing GitHub/Vercel flow.
 */
const MK_ORDER_PUBLISH = Object.freeze({
  repository: 'zsadiq79/ma-kitchens-website', branch: 'codex/order-request-capture-preview',
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

function mkOrderBeforeCutoff_(deliveryDate, now) {
  const cutoffDay = new Date(Date.parse(deliveryDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const today = Utilities.formatDate(now, MK_ORDER_PUBLISH.timezone, 'yyyy-MM-dd');
  return today < cutoffDay || (today === cutoffDay && Number(Utilities.formatDate(now, MK_ORDER_PUBLISH.timezone, 'HH')) < 22);
}

function mkOrderHexDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function mkOrderPublicItemId_(menuLineId) {
  return 'i_' + mkOrderHexDigest_('MK_ORDER_ITEM|' + menuLineId).slice(0, 24);
}

function mkOrderSnapshot_(menu, now) {
  const date = menu && menu.deliveryDate;
  if (!menu || menu.status !== 'ACTIVE' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
      !mkOrderBeforeCutoff_(date, now) || menu.menuCycleId !== 'MENU-' + date ||
      !Array.isArray(menu.meals)) throw new Error('NO_ACTIVE_IN_DATE_MENU_TO_PUBLISH');
  const meals = menu.meals.filter(m => Number(m.remainingServings) > 0).map(m => {
    const name = String(m.dishName || '').trim(), price = Number(m.price), display = String(m.priceDisplay || '').trim();
    const menuLineId = String(m.menuLineId || '').trim();
    if (!name || name.length > 150 || /[\r\n\u0000-\u001f]/.test(name) || !Number.isFinite(price) || price <= 0 || price > 10000)
      throw new Error('INVALID_DISH_FOR_ORDER_MESSAGE');
    if (!/^ML-\d{8}-[A-Za-z0-9_-]{1,40}$/.test(menuLineId) || menuLineId.slice(3, 11) !== date.replace(/-/g, ''))
      throw new Error('INVALID_MENU_LINE_ID');
    if (display && (!/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(display) || Math.abs(Number(display.slice(1).replace(/,/g, '')) - price) > 0.005))
      throw new Error('INVALID_PRICE_FOR_ORDER_MESSAGE');
    const result = { id: mkOrderPublicItemId_(menuLineId), dishName: name, price: price };
    result.menuLineId = menuLineId;
    if (display) result.priceDisplay = display;
    const image = mkOrderImagePath_(m.imageUrl);
    if (image) result.imageUrl = image;
    return result;
  });
  if (!meals.length || meals.length > 100) throw new Error('NO_AVAILABLE_DISHES_TO_PUBLISH');
  const rules = getOrderingRules_();
  const publicMeals = meals.map(({ menuLineId, ...meal }) => meal);
  const minimumOrderItems = Number(rules.minimumOrderItems);
  const deliveryFeeCents = Math.round(Number(rules.deliveryFee) * 100);
  if (!Number.isInteger(minimumOrderItems) || minimumOrderItems < 1 || !Number.isInteger(deliveryFeeCents) || deliveryFeeCents < 0)
    throw new Error('INVALID_PUBLIC_ORDERING_RULES');
  const stableMenu = [menu.menuCycleId, date, minimumOrderItems, deliveryFeeCents,
    meals.map(m => [m.id, m.dishName, Math.round(m.price * 100), m.imageUrl || ''])];
  const menuRevision = mkOrderHexDigest_(JSON.stringify(stableMenu));
  return { schemaVersion: 2, menuRevision: menuRevision, minimumOrderItems: minimumOrderItems, deliveryFeeCents: deliveryFeeCents,
    publishedAt: now.toISOString(), menuCycleId: menu.menuCycleId, deliveryDate: date,
    deliveryDateDisplay: menu.deliveryDateDisplay || date, meals: publicMeals };
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
    const menu = buildActiveMenu_();
    const snapshot = mkOrderSnapshot_(menu, new Date());
    mkOrderRequireMenuStateSheet_();
    return mkOrderWriteSnapshot_(snapshot, menu);
  } finally { lock.releaseLock(); }
}

function withdrawPublishedOrderingMenu() {
  mkOrderPublishOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_PUBLISH_BUSY_RETRY_LATER');
  try { mkOrderRequireMenuStateSheet_(); return mkOrderWriteSnapshot_({ schemaVersion: 2, withdrawn: true, publishedAt: new Date().toISOString() }, null); }
  finally { lock.releaseLock(); }
}

function mkOrderRequireMenuStateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName('Order Menu State');
  if (!sheet) throw new Error('ORDER_REQUEST_SETUP_REQUIRED');
  const width = 18, header = MK_ORDER_REQUEST_HEADERS['Order Menu State'];
  const currentHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(value => String(value || '').trim());
  if (header.some((value, index) => currentHeaders[index] !== value)) throw new Error('ORDER_MENU_STATE_HEADER_MISMATCH');
  return { spreadsheet, sheet, width, header };
}

function mkOrderSavePublishedState_(snapshot, sourceMenu) {
  const ready = mkOrderRequireMenuStateSheet_();
  const { spreadsheet, sheet, width, header } = ready;
  const sourceById = {};
  (sourceMenu && sourceMenu.meals || []).forEach(meal => { sourceById[mkOrderPublicItemId_(String(meal.menuLineId || ''))] = meal; });
  const active = !snapshot.withdrawn;
  const stateRow = ['STATE', active ? snapshot.menuRevision : '', active ? snapshot.menuCycleId : '', active ? snapshot.deliveryDate : '',
    snapshot.publishedAt, active ? 'ACTIVE' : 'WITHDRAWN', '', '', '', '', '', '', '', '', '', '',
    active ? snapshot.minimumOrderItems : '', active ? snapshot.deliveryFeeCents : ''];
  const rows = [stateRow];
  if (active) snapshot.meals.forEach(meal => {
    const source = sourceById[meal.id];
    if (!source || !String(source.menuLineId || '')) throw new Error('ORDER_MENU_STATE_SOURCE_MISMATCH');
    rows.push(['ITEM', snapshot.menuRevision, snapshot.menuCycleId, snapshot.deliveryDate, snapshot.publishedAt, 'ACTIVE', meal.id,
      source.menuLineId, source.itemCode, source.cookId, source.kitchenName, source.dishName,
      Math.round(Number(source.price) * 100), Math.round(Number(source.cookPay || 0) * 100), Number(source.remainingServings || 0), meal.imageUrl || '',
      snapshot.minimumOrderItems, snapshot.deliveryFeeCents]);
  });
  const endRowCount = Math.max(sheet.getLastRow(), rows.length + 1);
  const blankRows = Array.from({ length: endRowCount }, () => ({ values: Array.from({ length: width }, () => ({})) }));
  const dataRows = rows.map(row => ({ values: Array.from({ length: width }, (_, index) => {
    const value = row[index];
    if (value === '' || value === null || value === undefined) return {};
    if (typeof value === 'number' && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
    return { userEnteredValue: { stringValue: String(value) } };
  }) }));
  Sheets.Spreadsheets.batchUpdate({ requests: [
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: 0, columnIndex: 0 }, rows: blankRows, fields: 'userEnteredValue' } },
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: 0, columnIndex: 0 }, rows: [
      { values: header.map(value => ({ userEnteredValue: { stringValue: value } })) }, ...dataRows
    ], fields: 'userEnteredValue' } }
  ] }, spreadsheet.getId());
}

function mkOrderWriteSnapshot_(snapshot, sourceMenu) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('ORDER_MENU_GITHUB_TOKEN');
  if (!token || /[\r\n]/.test(token)) throw new Error('SET_ORDER_MENU_GITHUB_TOKEN_PRIVATELY');
  const branch = props.getProperty('ORDER_MENU_GITHUB_BRANCH') || MK_ORDER_PUBLISH.branch;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,150}$/.test(branch) || branch.includes('..')) throw new Error('INVALID_PUBLISH_BRANCH');
  if (branch === 'main') throw new Error('PREVIEW_BUILD_CANNOT_WRITE_PRODUCTION_BRANCH');
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
        mkOrderSavePublishedState_(snapshot, sourceMenu);
        const result = { changed: false, menuCycleId: snapshot.menuCycleId || '', branch: branch, note: 'Identical menu already committed. Check website deployment status.' };
        console.log(JSON.stringify(result)); return result;
      }
    } catch (_) { /* Replace an invalid old snapshot only with a validated newly built one. */ }
  }
  const response = mkOrderGithub_('put', api, token, { branch: branch, sha: current.sha,
    message: snapshot.withdrawn ? 'Withdraw published WhatsApp ordering menu' : 'Publish WhatsApp ordering menu ' + snapshot.deliveryDate,
    content: Utilities.base64Encode(body, Utilities.Charset.UTF_8) });
  if (!response.commit || typeof response.commit.sha !== 'string') throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB');
  mkOrderSavePublishedState_(snapshot, sourceMenu);
  const result = { changed: true, menuCycleId: snapshot.menuCycleId || '', deliveryDate: snapshot.deliveryDate || '',
    menuRevision: snapshot.menuRevision || '', dishCount: snapshot.meals ? snapshot.meals.length : 0, branch: branch, commit: response.commit.sha,
    note: 'Committed. Wait for the Vercel deployment, then verify the ordering link. This is not a live-deployment confirmation.' };
  console.log(JSON.stringify(result)); return result;
}

