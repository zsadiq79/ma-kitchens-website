/* Shared release controls. The builder supplies an immutable workbook/project
 * profile. No production installation is authorized by this source file.
 * Native service access is confined to these checked boundaries. */

function mkReleaseBinding_(allowUnconfigured) {
  if (CONTROL_TOWER_SPREADSHEET_ID !== MK_RELEASE.spreadsheetId || ScriptApp.getScriptId() !== MK_RELEASE.scriptId)
    throw new Error('ORDER_AUTOMATION_WRONG_PROJECT');
  const props = PropertiesService.getScriptProperties(), environment = props.getProperty('ORDER_AUTOMATION_ENV');
  if (environment && environment !== MK_RELEASE.environment) throw new Error('ORDER_AUTOMATION_WRONG_ENVIRONMENT');
  if (!environment && !allowUnconfigured && MK_RELEASE.environment === 'REHEARSAL')
    throw new Error('Run configureOrderAutomationRehearsal first.');
  const configuredBook = props.getProperty('CONTROL_TOWER_SPREADSHEET_ID');
  if (configuredBook && configuredBook !== MK_RELEASE.spreadsheetId && !(allowUnconfigured && !environment && MK_RELEASE.environment === 'REHEARSAL'))
    throw new Error('ORDER_AUTOMATION_WRONG_WORKBOOK_SETTING');
  return props;
}

function mkReleaseOpenBook_(id) {
  mkReleaseBinding_(false);
  if (id !== MK_RELEASE.spreadsheetId) throw new Error('ORDER_AUTOMATION_OTHER_WORKBOOK_BLOCKED');
  return SpreadsheetApp.openById(id);
}
function mkReleaseActiveBook_() {
  mkReleaseBinding_(false);
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId() !== MK_RELEASE.spreadsheetId) throw new Error('ORDER_AUTOMATION_WRONG_BOUND_WORKBOOK');
  return book;
}
function mkReleaseCheckBook_(id) {
  mkReleaseBinding_(false);
  if (id !== MK_RELEASE.spreadsheetId) throw new Error('ORDER_AUTOMATION_OTHER_WORKBOOK_BLOCKED');
}
function mkReleaseBatch_(request, id) {
  mkReleaseCheckBook_(id);
  return Sheets.Spreadsheets.batchUpdate(request, id);
}
function mkReleaseGrid_(id, options) { mkReleaseCheckBook_(id); return Sheets.Spreadsheets.get(id, options); }
function mkReleaseValues_(id, range, options) { mkReleaseCheckBook_(id); return Sheets.Spreadsheets.Values.get(id, range, options); }
function mkReleaseBatchValues_(id, options) { mkReleaseCheckBook_(id); return Sheets.Spreadsheets.Values.batchGet(id, options); }

function mkReleaseExternal_() {
  mkReleaseBinding_(false);
  if (MK_RELEASE.environment === 'REHEARSAL') throw new Error('REHEARSAL_EXTERNAL_ACTION_BLOCKED');
}
function mkReleaseFetch_(url, options) { mkReleaseExternal_(); return UrlFetchApp.fetch(url, options); }
function mkReleaseDocumentOpen_(id) { mkReleaseExternal_(); return DocumentApp.openById(id); }
function mkReleaseDocumentCreate_(name) { mkReleaseExternal_(); return DocumentApp.create(name); }
function mkReleaseDriveFile_(id) { mkReleaseExternal_(); return DriveApp.getFileById(id); }
function mkReleaseNewTrigger_(handler) {
  mkReleaseBinding_(false);
  const allowed = ['orderRequestInboxOnOpen_', 'orderEntryMenu', 'orderEntryEdited', 'showPackingSlipsMenu_'];
  if (MK_RELEASE.environment === 'PRODUCTION') allowed.push('runFeedbackSender');
  if (!allowed.includes(handler)) throw new Error('ORDER_AUTOMATION_UNRECOGNIZED_TRIGGER');
  return ScriptApp.newTrigger(handler);
}
function mkReleaseDeleteTrigger_(trigger) {
  mkReleaseBinding_(false);
  const handler = trigger.getHandlerFunction(), source = trigger.getTriggerSourceId();
  const sheetHandler = ['orderRequestInboxOnOpen_', 'orderEntryMenu', 'orderEntryEdited', 'showPackingSlipsMenu_'].includes(handler);
  if (!(sheetHandler && source === MK_RELEASE.spreadsheetId) &&
      !(MK_RELEASE.environment === 'PRODUCTION' && handler === 'runFeedbackSender' && !source))
    throw new Error('ORDER_AUTOMATION_OTHER_TRIGGER_BLOCKED');
  ScriptApp.deleteTrigger(trigger);
}

function mkReleaseOwnerBook_(allowUnconfigured) {
  mkReleaseBinding_(!!allowUnconfigured);
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId() !== MK_RELEASE.spreadsheetId) throw new Error('Run this function from the designated bound workbook project.');
  const owner = book.getOwner(), email = Session.getActiveUser().getEmail();
  if (!owner || !email || email !== owner.getEmail()) throw new Error('ORDER_AUTOMATION_OWNER_REQUIRED');
  return book;
}
function mkReleasePhase_() { return mkReleaseBinding_(false).getProperty('ORDER_AUTOMATION_PHASE') || 'LEGACY'; }
function mkReleaseSchemaReady_() { return ['MIGRATED', 'ACTIVATING', 'ACTIVE', 'PAUSED'].includes(mkReleasePhase_()); }
function mkReleaseOwnerReady_() {
  if (!['ACTIVE', 'PAUSED'].includes(mkReleasePhase_())) throw new Error('Install and activate the owner workspace first.');
}
function mkReleaseNewOwnerWrite_() {
  mkReleaseBinding_(false);
  if (mkReleasePhase_() !== 'ACTIVE') throw new Error('New owner orders are paused. Saved orders can still be checked.');
}
function mkReleaseLegacyEntry_() {
  const phase = mkReleasePhase_();
  if (['MIGRATING', 'ACTIVATING'].includes(phase)) throw new Error('Order workspace migration is in progress. Check migration status.');
  if (['ACTIVE', 'PAUSED'].includes(phase))
    throw new Error('The old Order Entry form is retired. Use Website Requests > Open owner order workspace.');
}
function mkReleaseAssertWriter_(book, channel, operation) {
  mkReleaseCheckBook_(book.getId());
  if (!LockService.getScriptLock().hasLock()) throw new Error('ORDER_AUTOMATION_SHARED_LOCK_REQUIRED');
  if (['MIGRATING', 'ACTIVATING'].includes(mkReleasePhase_())) throw new Error('Order migration is in progress. Try again after it is reconciled.');
  const pending = mkReleaseCartPending_();
  if (pending && pending.operation !== operation) throw new Error('Reconcile the outstanding legacy cart operation before creating another order.');
  const legacy = book.getSheetByName('Order Entry'), journal = book.getSheetByName('Order Operation Journal');
  if (legacy && channel !== 'legacy' && oeMeta_(legacy)[2] === 'COMMITTING')
    throw new Error('Reconcile the legacy Order Entry submission before creating another order.');
  if (journal && channel !== 'owner' && mkOwnerFreshValues_(book, journal, 2, journal.getMaxRows() - 1, 7).some(row => row[3] === 'COMMITTING' && row[0] !== operation))
    throw new Error('Reconcile the owner workspace submission before creating another order.');
}
function mkReleaseNextOrderId_(orders) {
  const book = orders.getParent();
  mkReleaseCheckBook_(book.getId());
  if (!LockService.getScriptLock().hasLock()) throw new Error('ORDER_AUTOMATION_SHARED_LOCK_REQUIRED');
  const journal = book.getSheetByName('Order Operation Journal'), legacy = book.getSheetByName('Order Entry');
  const values = mkOwnerFreshValues_(book, orders, 2, Math.min(orders.getMaxRows(), 2000) - 1, 1).map(row => row[0]);
  if (journal) mkOwnerFreshValues_(book, journal, 2, journal.getMaxRows() - 1, 3).forEach(row => values.push(row[2]));
  if (legacy) values.push(oeMeta_(legacy)[5]);
  let maximum = 0;
  values.forEach(value => { const match = String(value || '').match(/^ORD-(\d+)$/); if (match) maximum = Math.max(maximum, Number(match[1])); });
  const props = PropertiesService.getScriptProperties(), prior = props.getProperty('ORDER_AUTOMATION_LAST_ORDER_NUMBER');
  if (prior && !/^\d+$/.test(prior)) throw new Error('Order ID reservation setting needs reconciliation.');
  maximum = Math.max(maximum, Number(prior || 0));
  if (!Number.isSafeInteger(maximum + 1)) throw new Error('Order ID range is full.');
  props.setProperty('ORDER_AUTOMATION_LAST_ORDER_NUMBER', String(maximum + 1));
  return 'ORD-' + String(maximum + 1).padStart(6, '0');
}

function mkReleaseTriggerInventory_() {
  return ScriptApp.getProjectTriggers().map(trigger => ({
    handler: trigger.getHandlerFunction(), source: trigger.getTriggerSourceId() || '', event: String(trigger.getEventType())
  }));
}
function mkReleaseValidateTriggers_() {
  const triggers = mkReleaseTriggerInventory_();
  triggers.forEach(trigger => {
    const event = { orderEntryMenu: 'ON_OPEN', orderEntryEdited: 'ON_EDIT', showPackingSlipsMenu_: 'ON_OPEN', orderRequestInboxOnOpen_: 'ON_OPEN' }[trigger.handler];
    if (event && trigger.source === MK_RELEASE.spreadsheetId && trigger.event === event) return;
    if (MK_RELEASE.environment === 'PRODUCTION' && trigger.handler === 'runFeedbackSender' && !trigger.source && trigger.event === 'CLOCK') return;
    throw new Error('Unexpected trigger: ' + trigger.handler + '. Review the trigger list before setup.');
  });
  return triggers;
}
function configureOrderAutomationRehearsal() {
  if (MK_RELEASE.environment !== 'REHEARSAL') throw new Error('This is not the rehearsal installer.');
  const book = mkReleaseOwnerBook_(true), triggers = mkReleaseValidateTriggers_();
  const props = PropertiesService.getScriptProperties(), firstConfiguration = props.getProperty('ORDER_AUTOMATION_ENV') !== 'REHEARSAL';
  props.setProperty('ORDER_AUTOMATION_ENV', 'REHEARSAL');
  props.setProperty('CONTROL_TOWER_SPREADSHEET_ID', book.getId());
  ['FEEDBACK_LIVE_ENABLED', 'FEEDBACK_V2_SENDER_ENABLED', 'FEEDBACK_V2_WRITES_ENABLED'].forEach(key => props.setProperty(key, 'false'));
  if (firstConfiguration || !props.getProperty('ORDER_REQUEST_API_SECRET'))
    props.setProperty('ORDER_REQUEST_API_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('ORDER_AUTOMATION_PHASE')) props.setProperty('ORDER_AUTOMATION_PHASE', 'LEGACY');
  const result = { ok: true, environment: 'REHEARSAL', workbook: book.getId(), externalActions: 'BLOCKED', triggerCount: triggers.length };
  console.log(JSON.stringify(result)); return result;
}
function configureOrderAutomationProduction() {
  if (MK_RELEASE.environment !== 'PRODUCTION') throw new Error('This is not the production candidate.');
  const book = mkReleaseOwnerBook_(true);
  mkReleaseValidateTriggers_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ORDER_AUTOMATION_ENV', 'PRODUCTION');
  if (!props.getProperty('CONTROL_TOWER_SPREADSHEET_ID')) props.setProperty('CONTROL_TOWER_SPREADSHEET_ID', book.getId());
  if (!props.getProperty('ORDER_AUTOMATION_PHASE')) props.setProperty('ORDER_AUTOMATION_PHASE', 'LEGACY');
  return { ok: true, environment: 'PRODUCTION', providerSettingsPreserved: true, phase: mkReleasePhase_() };
}

function mkReleaseLetters_(number) {
  let text = '';
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text;
  return text;
}
function mkReleaseQuoted_(name) { return "'" + name.replace(/'/g, "''") + "'"; }
function mkReleaseReadRanges_(ranges, render) {
  const result = mkReleaseBatchValues_(MK_RELEASE.spreadsheetId, { ranges: ranges, valueRenderOption: render || 'FORMULA', dateTimeRenderOption: 'SERIAL_NUMBER' });
  if (!result.valueRanges || result.valueRanges.length !== ranges.length) throw new Error('Migration read is incomplete. No schema changes were requested.');
  return result.valueRanges.map(range => range.values || []);
}
function mkReleaseMigrationState_() {
  const meta = mkReleaseGrid_(MK_RELEASE.spreadsheetId, { fields: 'spreadsheetId,sheets(properties,protectedRanges)' });
  const byName = {};
  (meta.sheets || []).forEach(sheet => { if (byName[sheet.properties.title]) throw new Error('Duplicate sheet title.'); byName[sheet.properties.title] = sheet; });
  const ledgers = Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS), ranges = [], specs = [];
  for (const name of Object.keys(MK_OWNER_OPERATIONAL_LAYOUT).concat(Object.keys(ledgers))) {
    const sheet = byName[name];
    if (!sheet) continue;
    const width = sheet.properties.gridProperties.columnCount;
    specs.push({ kind: 'headers', name: name }); ranges.push(mkReleaseQuoted_(name) + '!A1:' + mkReleaseLetters_(width) + '1');
    const first = name === 'Orders' ? 32 : name === 'Order Items' ? 24 : 0;
    const end = name === 'Orders' ? 37 : 30;
    if (first && width >= first) {
      specs.push({ kind: 'destination', name: name });
      ranges.push(mkReleaseQuoted_(name) + '!' + mkReleaseLetters_(first) + '2:' + mkReleaseLetters_(Math.min(width, end)) + sheet.properties.gridProperties.rowCount);
    }
  }
  Object.keys(MK_OWNER_FORMULA_BASELINE).forEach(key => {
    const split = key.lastIndexOf('!'), name = key.slice(0, split);
    if (!byName[name]) throw new Error('Missing operational sheet: ' + name);
    specs.push({ kind: 'formula', name: key }); ranges.push(mkReleaseQuoted_(name) + '!' + key.slice(split + 1));
  });
  if (byName['Order Entry']) { specs.push({ kind: 'legacy', name: 'legacy' }); ranges.push("'Order Entry'!K1:K18"); }
  if (byName['Order Operation Journal']) { specs.push({ kind: 'journal', name: 'journal' }); ranges.push("'Order Operation Journal'!A2:G" + byName['Order Operation Journal'].properties.gridProperties.rowCount); }
  const values = mkReleaseReadRanges_(ranges), state = { meta: meta, byName: byName, headers: {}, destination: {}, formulas: {}, legacy: [], journal: [] };
  specs.forEach((spec, index) => {
    if (spec.kind === 'headers') state.headers[spec.name] = values[index][0] || [];
    if (spec.kind === 'destination') state.destination[spec.name] = values[index];
    if (spec.kind === 'formula') state.formulas[spec.name] = (values[index][0] || [])[0] || '';
    if (spec.kind === 'legacy') state.legacy = Array.from({length:18}, (_, i) => String((values[index][i] || [])[0] || ''));
    if (spec.kind === 'journal') state.journal = values[index];
  });
  return state;
}

function mkReleaseValidateState_(state, requireComplete) {
  const ledgers = Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS);
  Object.keys(MK_OWNER_OPERATIONAL_LAYOUT).forEach(name => {
    const sheet = state.byName[name], minimum = name === 'Orders' ? 2000 : 5000, prefix = name === 'Orders' ? 31 : 23;
    if (!sheet || sheet.properties.gridProperties.rowCount < minimum) throw new Error('Operational formula grid is too small: ' + name);
    const expected = MK_OWNER_OPERATIONAL_LAYOUT[name], actual = state.headers[name] || [];
    if (expected.slice(0, prefix).some((header, i) => actual[i] !== header)) throw new Error('Operational columns moved or changed: ' + name);
    if (expected.slice(prefix).some((header, i) => actual[prefix + i] && actual[prefix + i] !== header)) throw new Error('Snapshot destination is occupied: ' + name);
    if (requireComplete && expected.some((header, i) => actual[i] !== header)) throw new Error('Snapshot schema is incomplete: ' + name);
    if (!requireComplete && (state.destination[name] || []).some(row => row.some(value => value !== '' && value !== null)))
      throw new Error('Snapshot destination already contains records. Reconcile the migration before making changes.');
  });
  Object.keys(MK_OWNER_FORMULA_BASELINE).forEach(key => {
    const current = state.formulas[key];
    if (current !== MK_OWNER_FORMULA_SNAPSHOTS[key] && (requireComplete || current !== MK_OWNER_FORMULA_BASELINE[key]))
      throw new Error('Formula differs at ' + key + '. Migration stopped before any schema write.');
  });
  const ownerEmail = Session.getActiveUser().getEmail();
  Object.keys(ledgers).forEach(name => {
    const sheet = state.byName[name];
    if (!sheet) { if (requireComplete) throw new Error('Migration ledger is missing: ' + name); return; }
    const actual = state.headers[name] || [], expected = ledgers[name];
    if (expected.some((header, i) => actual[i] !== header) || actual.slice(expected.length).some(value => value !== ''))
      throw new Error('Workspace ledger schema differs: ' + name);
    if (requireComplete) {
      const locked = (sheet.protectedRanges || []).some(protection => protection.range && protection.range.sheetId === sheet.properties.sheetId &&
        !protection.range.startRowIndex && protection.range.endRowIndex === undefined &&
        !protection.range.startColumnIndex && protection.range.endColumnIndex === undefined && !protection.warningOnly &&
        protection.editors && protection.editors.domainUsersCanEdit !== true && !(protection.editors.groups || []).length &&
        (protection.editors.users || []).includes(ownerEmail) && (protection.editors.users || []).every(email => email === ownerEmail));
      if (!locked) throw new Error('Owner ledger protection needs review: ' + name);
    }
  });
  return true;
}
function mkReleasePendingCheck_(state) {
  if (mkReleaseCartPending_()) throw new Error('Reconcile the outstanding legacy cart operation before migration or activation.');
  if (['COMMITTING', 'REVIEW_REQUIRED'].includes(state.legacy[2]) || state.legacy[7] === 'SENDING')
    throw new Error('Reconcile the legacy submission before migration or activation. Existing confirmation evidence will be preserved.');
  if (state.journal.some(row => row[3] === 'COMMITTING')) throw new Error('Reconcile the outstanding owner order operation first.');
}
function previewOrderAutomationMigration() {
  mkReleaseOwnerBook_(false);
  const triggers = mkReleaseValidateTriggers_(), state = mkReleaseMigrationState_();
  mkReleaseValidateState_(state, mkReleaseSchemaReady_());
  mkReleasePendingCheck_(state);
  const result = { ok: true, environment: MK_RELEASE.environment, phase: mkReleasePhase_(), workbook: MK_RELEASE.spreadsheetId,
    sheetCount: state.meta.sheets.length, orderColumns: state.byName.Orders.properties.gridProperties.columnCount,
    itemColumns: state.byName['Order Items'].properties.gridProperties.columnCount,
    formulaAnchors: Object.keys(state.formulas).length, legacyState: state.legacy[2] || '',
    legacyOrderId: state.legacy[5] || '', confirmationState: state.legacy[7] || '', triggers: triggers,
    newLedgerCount: Object.keys(Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS)).filter(name => !state.byName[name]).length,
    writesIssued: false, externalActions: MK_RELEASE.environment === 'REHEARSAL' ? 'BLOCKED' : 'EXISTING_SETTINGS_PRESERVED' };
  console.log(JSON.stringify(result)); return result;
}
function mkReleaseMigrationRequests_(state, owner) {
  const requests = [], ledgerIds = {}, usedIds = new Set(state.meta.sheets.map(sheet => sheet.properties.sheetId));
  let nextId = 900000000;
  const update = (id, row, column, values) => ({ updateCells: { start: {sheetId:id, rowIndex:row, columnIndex:column},
    rows: [{values:values.map(orderRequestCell_)}], fields:'userEnteredValue' } });
  Object.keys(MK_OWNER_OPERATIONAL_LAYOUT).forEach(name => {
    const sheet = state.byName[name].properties, expected = MK_OWNER_OPERATIONAL_LAYOUT[name], first = name === 'Orders' ? 32 : 24;
    if (sheet.gridProperties.columnCount < expected.length) requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'COLUMNS',length:expected.length-sheet.gridProperties.columnCount}});
    requests.push(update(sheet.sheetId,0,first-1,expected.slice(first-1)));
    requests.push({repeatCell:{range:{sheetId:sheet.sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:first-1,endColumnIndex:expected.length},
      cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:0.9,green:0.94,blue:0.91},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
    if (name === 'Orders') requests.push({repeatCell:{range:{sheetId:sheet.sheetId,startRowIndex:1,startColumnIndex:32,endColumnIndex:34},cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}},fields:'userEnteredFormat.numberFormat'}});
  });
  Object.keys(MK_OWNER_FORMULA_SNAPSHOTS).forEach(key => {
    const split = key.lastIndexOf('!'), name = key.slice(0,split), cell = key.slice(split+1), match = cell.match(/^([A-Z]+)(\d+)$/);
    const column = Array.from(match[1]).reduce((n,char) => n*26+char.charCodeAt(0)-64,0);
    const request = update(state.byName[name].properties.sheetId,Number(match[2])-1,column-1,['']);
    request.updateCells.rows[0].values[0] = {userEnteredValue:{formulaValue:MK_OWNER_FORMULA_SNAPSHOTS[key]}};
    requests.push(request);
  });
  const ledgers = Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS);
  Object.keys(ledgers).forEach(name => {
    let id;
    if (state.byName[name]) id = state.byName[name].properties.sheetId;
    else {
      while (usedIds.has(nextId)) nextId++;
      id = nextId++; usedIds.add(id);
      requests.push({addSheet:{properties:{sheetId:id,title:name,hidden:true,gridProperties:{rowCount:1000,columnCount:Math.max(26,ledgers[name].length),frozenRowCount:1}}}});
      requests.push(update(id,0,0,ledgers[name]));
    }
    ledgerIds[name] = id;
    requests.push({addProtectedRange:{protectedRange:{range:{sheetId:id},description:'Ma Kitchens owner order ledger',warningOnly:false,editors:{users:[owner],domainUsersCanEdit:false}}}});
  });
  return {requests:requests,ledgerIds:ledgerIds};
}
function migrateOrderAutomationWorkspace() {
  const book = mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    const props = PropertiesService.getScriptProperties(), phase = mkReleasePhase_();
    if (phase === 'MIGRATING') return mkReleaseReconcileMigration_();
    if (phase === 'ACTIVATING') throw new Error('Finish the owner workspace activation before repeating migration.');
    const state = mkReleaseMigrationState_();
    mkReleaseValidateTriggers_();
    if (['MIGRATED','ACTIVE','PAUSED'].includes(phase)) {
      mkReleaseValidateState_(state,true);
      return {ok:true,changed:false,phase:phase,message:'Migration already installed. Records preserved.'};
    }
    if (phase !== 'LEGACY') throw new Error('Unrecognized migration phase.');
    mkReleaseValidateState_(state,false); mkReleasePendingCheck_(state);
    if (Object.keys(Object.assign({}, MK_ORDER_REQUEST_HEADERS,MK_OWNER_HEADERS)).some(name => state.byName[name]))
      throw new Error('Unrecorded workspace ledgers already exist. Review them before starting this migration.');
    const plan = mkReleaseMigrationRequests_(state,book.getOwner().getEmail());
    const record = {version:1,environment:MK_RELEASE.environment,spreadsheetId:book.getId(),scriptId:MK_RELEASE.scriptId,
      startedAt:new Date().toISOString(),ledgers:plan.ledgerIds,formulasBefore:state.formulas,
      orderColumnsBefore:state.byName.Orders.properties.gridProperties.columnCount,itemColumnsBefore:state.byName['Order Items'].properties.gridProperties.columnCount};
    props.setProperty('ORDER_AUTOMATION_MIGRATION_RECORD',JSON.stringify(record));
    props.setProperty('ORDER_AUTOMATION_CAPTURE_ENABLED','false');
    props.setProperty('ORDER_AUTOMATION_PHASE','MIGRATING');
    try { mkReleaseBatch_({requests:plan.requests},book.getId()); }
    catch (_) { throw new Error('MIGRATION_RESPONSE_UNCERTAIN: run reconcileOrderAutomationMigration. Do not repeat a write manually.'); }
    return mkReleaseReconcileMigration_();
  });
}
function mkReleaseReconcileMigration_() {
  const props = PropertiesService.getScriptProperties(), raw = props.getProperty('ORDER_AUTOMATION_MIGRATION_RECORD');
  if (!raw) throw new Error('Migration record is missing. No write was retried.');
  const record = JSON.parse(raw);
  if (record.spreadsheetId !== MK_RELEASE.spreadsheetId || record.scriptId !== MK_RELEASE.scriptId || record.environment !== MK_RELEASE.environment)
    throw new Error('Migration record belongs to another project.');
  const state = mkReleaseMigrationState_();
  const complete = Object.keys(record.ledgers).every(name => state.byName[name] && state.byName[name].properties.sheetId === record.ledgers[name]);
  if (complete) {
    mkReleaseValidateState_(state,true);
    if (mkReleasePhase_() === 'MIGRATING') props.setProperty('ORDER_AUTOMATION_PHASE','MIGRATED');
    const result = {ok:true,changed:true,phase:mkReleasePhase_(),recordsPreserved:true,message:'Schema migration verified. Owner workspace and public capture are not activated.'};
    console.log(JSON.stringify(result)); return result;
  }
  const unchanged = Object.keys(record.ledgers).every(name => !state.byName[name]) &&
    state.byName.Orders.properties.gridProperties.columnCount === record.orderColumnsBefore &&
    state.byName['Order Items'].properties.gridProperties.columnCount === record.itemColumnsBefore &&
    Object.keys(record.formulasBefore).every(key => state.formulas[key] === record.formulasBefore[key]);
  if (unchanged && mkReleasePhase_() === 'MIGRATING') {
    mkReleaseValidateState_(state,false);
    props.setProperty('ORDER_AUTOMATION_PHASE','LEGACY');
    return {ok:true,changed:false,phase:'LEGACY',message:'Fresh reads confirm the migration was not applied. It is safe to run migrateOrderAutomationWorkspace again.'};
  }
  throw new Error('MIGRATION_RECONCILIATION_REQUIRED: schema does not match a complete or unapplied migration. No write was retried.');
}
function reconcileOrderAutomationMigration() {
  mkReleaseOwnerBook_(false);
  return mkLocked_(() => mkReleaseReconcileMigration_());
}
function prepareOrderAutomationMenuState() {
  mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    if (!mkReleaseSchemaReady_()) throw new Error('Complete migration first.');
    mkReleaseValidateState_(mkReleaseMigrationState_(),true);
    const menu = buildActiveMenu_(), snapshot = mkOrderSnapshot_(menu,new Date());
    mkOrderSavePublishedState_(snapshot,menu);
    return {ok:true,environment:MK_RELEASE.environment,menuRevision:snapshot.menuRevision,dishCount:snapshot.meals.length,publicCaptureEnabled:false,publishedToWebsite:false};
  });
}
function activateOwnerOrderWorkspace() {
  const book = mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    const state = mkReleaseMigrationState_(), phase = mkReleasePhase_();
    if (!['MIGRATED','ACTIVATING','ACTIVE','PAUSED'].includes(phase)) throw new Error('Complete migration first.');
    mkReleaseValidateState_(state,true); mkReleasePendingCheck_(state); mkReleaseValidateTriggers_();
    const props = PropertiesService.getScriptProperties();
    props.setProperty('ORDER_AUTOMATION_PHASE','ACTIVATING');
    props.setProperty('ORDER_AUTOMATION_CAPTURE_ENABLED','false');
    const triggers = ScriptApp.getProjectTriggers();
    const ownOpen = triggers.filter(trigger => trigger.getHandlerFunction() === 'orderRequestInboxOnOpen_' && trigger.getTriggerSourceId() === book.getId());
    if (!ownOpen.length) mkReleaseNewTrigger_('orderRequestInboxOnOpen_').forSpreadsheet(book).onOpen().create();
    if (state.byName['Order Entry']) mkReleaseBatch_({requests:[{updateSheetProperties:{properties:{sheetId:state.byName['Order Entry'].properties.sheetId,hidden:true},fields:'hidden'}}]},book.getId());
    const old = triggers.filter(trigger => ['orderEntryMenu','orderEntryEdited'].includes(trigger.getHandlerFunction()) && trigger.getTriggerSourceId() === book.getId());
    old.concat(ownOpen.slice(1)).forEach(mkReleaseDeleteTrigger_);
    props.setProperty('ORDER_AUTOMATION_PHASE','ACTIVE');
    const result = {ok:true,phase:'ACTIVE',retiredEntryTriggers:old.length,recordsPreserved:true,captureEnabled:false,
      message:'Reopen the workbook and use Website Requests. Existing packing and feedback triggers were preserved.'};
    console.log(JSON.stringify(result)); return result;
  });
}
function enableOrderAutomationRequestCapture() {
  const book = mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    mkReleaseNewOwnerWrite_(); mkReleaseValidateState_(mkReleaseMigrationState_(),true);
    const secret = PropertiesService.getScriptProperties().getProperty('ORDER_REQUEST_API_SECRET');
    if (!secret || secret.length < 32) throw new Error('Save the website request signing secret privately first.');
    const state = orderRequestReadMenuState_(book);
    if (state.status !== 'ACTIVE' || !orderRequestBeforeCutoff_(state.deliveryDate,new Date())) throw new Error('Prepare and verify the current ordering menu first.');
    PropertiesService.getScriptProperties().setProperty('ORDER_AUTOMATION_CAPTURE_ENABLED','true');
    return {ok:true,environment:MK_RELEASE.environment,captureEnabled:true};
  });
}
function pauseOrderAutomationWorkspace() {
  mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    const props = PropertiesService.getScriptProperties();
    if (!['ACTIVE','PAUSED'].includes(mkReleasePhase_())) throw new Error('The owner workspace has not been activated.');
    props.setProperty('ORDER_AUTOMATION_CAPTURE_ENABLED','false');
    props.setProperty('ORDER_AUTOMATION_PHASE','PAUSED');
    return {ok:true,phase:'PAUSED',recordsPreserved:true,recoveryAvailable:true};
  });
}

function mkReleaseCaptureGate_(action) {
  mkReleaseBinding_(false);
  const phase = mkReleasePhase_();
  if (action === 'order_request_recover') {
    if (!['ACTIVE','PAUSED'].includes(phase)) throw new Error('ORDER_REQUEST_NOT_READY');
  } else if (phase !== 'ACTIVE' || PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_CAPTURE_ENABLED') !== 'true')
    throw new Error('ORDER_REQUEST_NOT_READY');
}

function buildActiveMenu_() { return mkReleaseEnrichMenu_(mkReleaseOriginalMenu_()); }
function doGet(e) {
  try {
    mkReleaseBinding_(false);
    if (MK_RELEASE.environment === 'REHEARSAL') return orderRequestJson_({ok:true,environment:'REHEARSAL',externalActions:'BLOCKED'});
    return mkReleaseLegacyDoGet_(e || {parameter:{}});
  } catch (_) { return orderRequestJson_({ok:false,error:'ORDER_AUTOMATION_UNAVAILABLE'}); }
}
function doPost(e) {
  try {
    mkReleaseBinding_(false);
    const action = e && e.parameter && e.parameter.action;
    if (action === 'order_request_capture' || action === 'order_request_recover') {
      mkReleaseCaptureGate_(action);
      return handleOrderRequestApi_(e,action);
    }
    if (MK_RELEASE.environment === 'REHEARSAL') return orderRequestJson_({ok:false,error:'LEGACY_INGRESS_DISABLED_IN_REHEARSAL'});
    return mkReleaseLegacyDoPost_(e);
  } catch (_) { return orderRequestJson_({ok:false,error:'ORDER_REQUEST_NOT_READY'}); }
}
function simulateLegacyPostInRehearsal(event) {
  if (MK_RELEASE.environment !== 'REHEARSAL') throw new Error('Rehearsal only.');
  mkReleaseOwnerBook_(false);
  return mkReleaseLegacyDoPost_(event);
}
