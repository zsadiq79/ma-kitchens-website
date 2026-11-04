/* Recovery assessment only. Add as a separate file; leave Code.gs and Marketing.gs intact.
 * No messages, writes, locks, triggers, deployments or network requests.
 * Reports editor/runtime state, not the deployed web-app source version.
 */
function inspectRoutificRecoveryReadOnly() {
  const result = {diagnostic:'ROUTIFIC_RECOVERY_READ_ONLY_V1', at:new Date().toISOString(),
    writesIssued:false, messagesSent:0, networkRequests:0, deploymentVersionVerified:false};
  const started = Date.now();
  try {
    // The existing owner check validates the project, workbook and owner by reads only.
    const book = mkReleaseOwnerBook_(false);
    const properties = PropertiesService.getScriptProperties().getProperties();
    result.environment = MK_RELEASE.environment;
    result.mode = mkRecoverySafeEnum_(properties.MK_ETA_MODE || 'LEGACY',['LEGACY','LIVE','PREVIEW','PAUSED']);
    result.notBefore = mkRecoverySafeDate_(properties.MK_ETA_NOT_BEFORE);
    result.feedback = {
      liveEnabled:properties.FEEDBACK_LIVE_ENABLED === 'true',
      v2SenderEnabled:properties.FEEDBACK_V2_SENDER_ENABLED === 'true',
      v2WritesEnabled:properties.FEEDBACK_V2_WRITES_ENABLED === 'true'
    };
    result.marketingFunctionPresent = typeof runWeeklyMarketing === 'function';
    const known = ['runFeedbackSender','runRoutificEtaQueue','runRoutificEtaRestrictedTest','runWeeklyMarketing',
      'orderRequestInboxOnOpen_','orderEntryMenu','orderEntryEdited','showPackingSlipsMenu_'];
    result.triggers = ScriptApp.getProjectTriggers().map(function(t) {
      const handler = t.getHandlerFunction();
      return {handler:known.includes(handler) ? handler : 'UNRECOGNISED_HANDLER',
        event:String(t.getEventType()), configuredWorkbook:!!t.getTriggerSourceId() && t.getTriggerSourceId() === book.getId()};
    });
    // Do not call mkReleaseValidateTriggers_: the marketing trigger currently makes it throw.
    result.credentialsConfigured = {};
    ['ROUTIFIC_API_TOKEN','CONTROL_TOWER_WEBHOOK_SECRET','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID']
      .forEach(function(key) { result.credentialsConfigured[key] = !!properties[key]; });
    result.propertyStore = {keyCount:Object.keys(properties).length, estimatedUtf8Bytes:mkRecoveryUtf8Length_(JSON.stringify(properties))};
    const now = Date.now();
    result.queuedRoutes = Object.keys(properties).filter(function(k) { return /^MK_ETA_QUEUE_[a-f0-9-]{36}$/i.test(k); })
      .map(function(k) {
        const record = mkRecoveryJson_(properties[k]);
        const valid = !!record && typeof record.eventAt === 'number' && Number.isFinite(record.eventAt);
        return {routeUuid:k.slice('MK_ETA_QUEUE_'.length),validRecord:valid,
          latestEventAt:valid ? mkRecoverySafeDate_(record.eventAt) : null,
          beyondCurrent15MinuteWindow:valid ? now-record.eventAt > 900000 : null};
      });
    result.sendReservations = Object.keys(properties).filter(function(k) { return k.startsWith('MK_ETA_SEND_'); })
      .map(function(k) {
        const match = k.match(/^MK_ETA_SEND_(ORD-\d+)_(delivery_journey_started_eta|delivery_next_eta)$/);
        const record = mkRecoveryJson_(properties[k]);
        return {orderId:match ? match[1] : 'UNRECOGNISED_KEY',stage:match ? match[2] : 'UNRECOGNISED_STAGE',
          state:mkRecoverySafeEnum_(record && record.state,['SENDING','ACCEPTED']),
          attemptedAt:mkRecoverySafeDate_(record && record.attemptAt),acceptedAt:mkRecoverySafeDate_(record && record.acceptedAt),
          messageIdRecorded:!!(record && typeof record.messageId === 'string' && record.messageId)};
      });
    result.sheetSizes = [];
    const tables = {};
    ['Orders','Deliveries','Customers','WhatsApp Log'].forEach(function(name) {
      const sheet = book.getSheetByName(name);
      if (!sheet) { result.sheetSizes.push({sheet:name,missing:true}); return; }
      const size = {sheet:name,lastRow:sheet.getLastRow(),lastColumn:sheet.getLastColumn(),
        allocatedRows:sheet.getMaxRows(),allocatedColumns:sheet.getMaxColumns()};
      result.sheetSizes.push(size);
      if (name === 'Customers' || !size.lastRow || !size.lastColumn) return;
      // Bound work. Any truncation is explicit; missing history must not be inferred.
      if (Date.now()-started > 40000) { size.notRead='TIME_BUDGET'; return; }
      const readAt = Date.now();
      const count = Math.min(size.lastRow,20001), width = Math.min(size.lastColumn,60);
      const values = sheet.getRange(1,1,count,width).getValues();
      size.readMs = Date.now()-readAt; size.truncated = count < size.lastRow || width < size.lastColumn;
      tables[name] = {rows:values.slice(1),headers:(values[0]||[]).map(function(h) {return String(h).trim();}),truncated:size.truncated};
    });
    result.oct29 = mkRecoveryOrderSummary_(tables,'2026-10-29');
    result.complete = !!result.oct29.complete;
  } catch (_) {
    // Never echo exception messages: provider and spreadsheet exceptions can contain secrets or personal data.
    result.complete = false; result.error = 'INSPECTION_INCOMPLETE';
  }
  result.elapsedMs = Date.now()-started;
  // Large installations are summarized rather than overflowing the Apps Script log.
  result.sendReservationCount = (result.sendReservations||[]).length;
  if (result.sendReservationCount > 100) {
    result.sendReservations = result.sendReservations.slice(0,100); result.sendReservationsTruncated = true;
  }
  const summary=Object.assign({},result);
  delete summary.sendReservations;
  if (summary.oct29) summary.oct29=Object.assign({},summary.oct29,{orders:undefined});
  console.log(JSON.stringify(summary));
  (result.sendReservations||[]).forEach(function(record) {
    console.log(JSON.stringify({diagnostic:result.diagnostic,section:'SEND_RESERVATION',record:record}));
  });
  ((result.oct29||{}).orders||[]).forEach(function(record) {
    console.log(JSON.stringify({diagnostic:result.diagnostic,section:'OCT29_ORDER',record:record}));
  });
  return result;
}

function mkRecoveryOrderSummary_(tables,date) {
  const required = {Orders:['Order ID','Delivery Date','Order Status'],Deliveries:['Order ID','Routific ID','Delivery Status'],
    'WhatsApp Log':['Order ID','Message Type','Status']};
  const missing = [];
  Object.keys(required).forEach(function(name) {
    const table = tables[name];
    required[name].forEach(function(header) {if (!table || table.headers.indexOf(header)<0) missing.push(name+':'+header);});
  });
  if (missing.length) return {date:date,complete:false,missingHeaders:missing,orders:[]};
  const orders=tables.Orders,deliveries=tables.Deliveries,log=tables['WhatsApp Log'];
  const value = function(t,r,h) {return r[t.headers.indexOf(h)];};
  const ids = new Set(); const output=[];
  orders.rows.forEach(function(row) {
    const rawDate=value(orders,row,'Delivery Date');
    const actualDate=rawDate instanceof Date && Number.isFinite(rawDate.getTime())
      ? Utilities.formatDate(rawDate,'Australia/Sydney','yyyy-MM-dd') : String(rawDate||'').trim();
    if (actualDate !== date) return;
    const id=String(value(orders,row,'Order ID')||'').trim();
    if (!/^ORD-\d+$/.test(id)) return;
    ids.add(id);
    const matches=deliveries.rows.filter(function(r) {return String(value(deliveries,r,'Order ID')||'').trim()===id;});
    const messages=log.rows.filter(function(r) {return String(value(log,r,'Order ID')||'').trim()===id;});
    const stages={};
    ['delivery_update_2','delivery_journey_started_eta','delivery_next_eta','delivery_confirmation_5'].forEach(function(stage) {
      const statuses=messages.filter(function(r) {return String(value(log,r,'Message Type')||'').trim()===stage;})
        .map(function(r) {return mkRecoverySafeEnum_(String(value(log,r,'Status')||'').trim(),['Accepted','Sent','Delivered','Read','Failed']);});
      stages[stage]={logEntries:statuses.length,statuses:statuses};
    });
    const delivery=matches.length===1 ? matches[0] : null;
    const uuid=delivery ? String(value(deliveries,delivery,'Routific ID')||'').trim() : '';
    output.push({orderId:id,orderStatus:mkRecoverySafeEnum_(String(value(orders,row,'Order Status')||'').trim(),['Confirmed','Pending','Cancelled']),
      deliveryRows:matches.length,deliveryStatus:delivery ? mkRecoverySafeEnum_(String(value(deliveries,delivery,'Delivery Status')||'').trim(),['Scheduled','Pending','Out for Delivery','Delivered','Failed','Cancelled']) : null,
      routificOrderUuid:/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(uuid) ? uuid : null,messages:stages});
  });
  return {date:date,complete:!Object.keys(required).some(function(name) {return tables[name].truncated;}),
    uniqueOrderCount:ids.size,duplicateOrderRows:output.length-ids.size,orders:output.slice(0,100),ordersTruncated:output.length>100,
    interpretation:'A missing log entry does not prove no message was sent. Compare reservations and provider evidence.'};
}
function mkRecoveryJson_(raw) {try{return JSON.parse(raw);}catch(_){return null;}}
function mkRecoverySafeEnum_(value,allowed) {return allowed.includes(value) ? value : 'UNKNOWN';}
function mkRecoverySafeDate_(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const date=new Date(value);return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function mkRecoveryUtf8Length_(text) {
  let bytes=0;
  for(let i=0;i<text.length;i++) {const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;
    else if(c>=0xD800 && c<=0xDBFF && i+1<text.length && text.charCodeAt(i+1)>=0xDC00 && text.charCodeAt(i+1)<=0xDFFF){bytes+=4;i++;}else bytes+=3;}
  return bytes;
}
