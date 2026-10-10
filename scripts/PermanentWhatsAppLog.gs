/*
  MA KITCHENS — PERMANENT WHATSAPP AUDIT LOG

  Sheet: WhatsApp Log

  Columns:
    A Message ID
    B Order ID
    C Message Type
    D Phone
    E Accepted At
    F Sent At
    G Delivered At
    H Read At
    I Status
    J Error Code
    K Error Details

  Design:
    - Outbound sender registers Meta message ID immediately after acceptance.
    - Meta webhook callbacks update the same row by exact message ID.
    - Handles callback-before-registration race by creating an orphan row and
      filling Order ID / Message Type later when registration arrives.
    - Status never downgrades (e.g. Read is not overwritten by a late Delivered).
    - No operational order/delivery rows are deleted or rewritten here.
*/

const WHATSAPP_LOG_SPREADSHEET_ID = CONTROL_TOWER_SPREADSHEET_ID;

const WHATSAPP_LOG_SHEET =
  'WhatsApp Log';

const WHATSAPP_LOG_HEADERS = [
  'Message ID',
  'Order ID',
  'Message Type',
  'Phone',
  'Accepted At',
  'Sent At',
  'Delivered At',
  'Read At',
  'Status',
  'Error Code',
  'Error Details'
];


/* =========================================================
   OUTBOUND REGISTRATION
   Called after Meta returns a message ID.
   ========================================================= */

function registerWhatsAppOutbound_(messageId, orderId, messageType, recipient, acceptedAt) {
  fwString_(messageId, 256, 1); fwOrderId_(orderId); fwString_(messageType, 80, 1);
  if (!(acceptedAt instanceof Date) || !Number.isFinite(acceptedAt.getTime())) fwError_('INVALID_INPUT');
  return fwLock_(() => {
    const book = fwBook_(), table = fwTable_(book, 'WhatsApp Log', WHATSAPP_LOG_HEADERS);
    const found = table.rows.map((row, i) => ({ row, number: i + 2 })).filter(x => x.row[0] === messageId);
    if (found.length > 1) fwError_('CONFIGURATION_ERROR');
    const row = found.length ? found[0].row.slice() : WHATSAPP_LOG_HEADERS.map(() => '');
    if (row[1] && row[1] !== orderId) fwError_('CONFLICT');
    row[0] = messageId; row[1] = orderId; row[2] = messageType; row[3] = whatsappLogNormalisePhone_(recipient); row[4] = row[4] || acceptedAt; row[8] = row[8] || 'Accepted';
    if (found.length) { const requests = [1,2,3,4,8].map(i => fwCell_(table.sheet, found[0].number, i, row[i])); fwBatch_(book, requests); }
    else fwBatch_(book, [fwAppend_(table.sheet, [row])]);
    return found.length ? found[0].number : table.rows.length + 2;
  });
}


/* =========================================================
   META STATUS CALLBACK
   Called by Code.gs for each value.statuses[] item.
   ========================================================= */

function updateWhatsAppLogFromStatus_(status) {
  if (!fwObject_(status) || typeof status.id !== 'string' || !status.id || status.id.length > 256 || !['sent','delivered','read','failed'].includes(status.status)) return false;
  const eventAt = whatsappLogStatusDate_(status); if (!eventAt) return false;
  return fwLock_(() => {
    const book = fwBook_(), t = fwTable_(book, 'WhatsApp Log', WHATSAPP_LOG_HEADERS);
    const found = t.rows.map((row, i) => ({ row, number: i + 2 })).filter(x => x.row[0] === status.id);
    if (found.length > 1) fwError_('CONFIGURATION_ERROR');
    const row = found.length ? found[0].row.slice() : WHATSAPP_LOG_HEADERS.map(() => ''); row[0] = status.id;
    if (!row[3]) row[3] = whatsappLogNormalisePhone_(status.recipient_id);
    const index = { sent: 5, delivered: 6, read: 7 }[status.status];
    // Earliest actual timestamp is stable under retries and out-of-order receipts.
    if (index && (!Number.isFinite(fwTime_(row[index])) || eventAt.getTime() < fwTime_(row[index]))) row[index] = eventAt;
    const incoming = whatsappLogDisplayStatus_(status.status);
    if (whatsappLogStatusRank_(incoming) > whatsappLogStatusRank_(row[8])) row[8] = incoming;
    if (status.status === 'failed') {
      const error = Array.isArray(status.errors) ? status.errors[0] : null;
      row[9] = error && error.code != null ? String(error.code).slice(0,80) : '';
      // Provider error details may echo secure URLs: keep only a generic code.
      row[10] = 'Provider reported failure';
    }
    const requests = [];
    if (found.length) {
      [3,5,6,7,8,9,10].forEach(i => { if (row[i] instanceof Date) requests.push(fwCell_(t.sheet, found[0].number, i, row[i])); else if (i >= 8 || i === 3) requests.push(fwCell_(t.sheet, found[0].number, i, row[i])); });
    } else requests.push(fwAppend_(t.sheet, [row]));
    if (fwProps_().getProperty('FEEDBACK_V2_WRITES_ENABLED') === 'true') {
      const schema = fwSchema_(book); const matches = schema.orders.rows.map((r,i) => ({row:r.slice(),number:i+2})).filter(x => x.row[16] === status.id);
      if (matches.length > 1) fwError_('CONFIGURATION_ERROR');
      if (matches.length && index) { const r = matches[0].row, i = index + 13; if (!Number.isFinite(fwTime_(r[i])) || eventAt.getTime() < fwTime_(r[i])) r[i] = eventAt.toISOString(); requests.push(fwUpdate_(schema.orders.sheet, matches[0].number, r)); }
    }
    fwBatch_(book, requests); return true;
  });
}


/* =========================================================
   OPERATIONAL READ-ONLY CHECKS
   ========================================================= */

function getWhatsAppLogForOrder(
  orderId
) {
  const target =
    String(orderId || '').trim();

  if (!target) {
    throw new Error(
      'Order ID is required.'
    );
  }

  const sheet =
    whatsappLogGetSheet_();

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        WHATSAPP_LOG_HEADERS.length
      )
      .getDisplayValues();

  const matches =
    values
      .filter(row =>
        String(row[1] || '').trim() ===
        target
      )
      .map(row => ({
        messageId: row[0],
        orderId: row[1],
        messageType: row[2],
        phone: row[3],
        acceptedAt: row[4],
        sentAt: row[5],
        deliveredAt: row[6],
        readAt: row[7],
        status: row[8],
        errorCode: row[9],
        errorDetails: row[10]
      }));

  console.log(
    JSON.stringify(
      matches,
      null,
      2
    )
  );

  return matches;
}


function checkWhatsAppLogSetup() {
  const sheet =
    whatsappLogGetSheet_();

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        WHATSAPP_LOG_HEADERS.length
      )
      .getDisplayValues()[0];

  const exact =
    WHATSAPP_LOG_HEADERS.every(
      (header, index) =>
        headers[index] === header
    );

  const result = {
    sheetName: sheet.getName(),
    headerCount: headers.length,
    headersCorrect: exact,
    lastRow: sheet.getLastRow()
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/* =========================================================
   INTERNAL HELPERS
   ========================================================= */

function whatsappLogGetSheet_() {
  const ss =
    fwBook_();

  const sheet =
    ss.getSheetByName(
      WHATSAPP_LOG_SHEET
    );

  if (!sheet) {
    throw new Error(
      'WhatsApp Log sheet not found.'
    );
  }

  const headers =
    sheet
      .getRange(
        1,
        1,
        1,
        WHATSAPP_LOG_HEADERS.length
      )
      .getDisplayValues()[0];

  const correct =
    WHATSAPP_LOG_HEADERS.every(
      (header, index) =>
        headers[index] === header
    );

  if (!correct) {
    throw new Error(
      'WhatsApp Log headers do not match the expected schema.'
    );
  }

  return sheet;
}


function whatsappLogFindRowByMessageId_(
  sheet,
  messageId
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues();

  for (
    let i = 0;
    i < ids.length;
    i++
  ) {
    if (
      String(ids[i][0] || '').trim() ===
      messageId
    ) {
      return i + 2;
    }
  }

  return 0;
}


function whatsappLogStatusDate_(status) {
  const value = status && status.timestamp;
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) return null;
  const ms = Number(value) * 1000;
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > Date.now() + 300000) return null;
  return new Date(ms);
}


function whatsappLogDisplayStatus_(
  statusName
) {
  switch (statusName) {
    case 'sent':
      return 'Sent';
    case 'delivered':
      return 'Delivered';
    case 'read':
      return 'Read';
    case 'failed':
      return 'Failed';
    default:
      return '';
  }
}


function whatsappLogStatusRank_(
  status
) {
  switch (
    String(status || '')
      .trim()
      .toLowerCase()
  ) {
    case 'accepted':
      return 0;
    case 'sent':
      return 1;
    case 'delivered':
      return 2;
    case 'read':
      return 3;
    case 'failed':
      return 4;
    default:
      return -1;
  }
}


function whatsappLogNormalisePhone_(
  value
) {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  return digits
    ? '+' + digits
    : '';
}


function whatsappLogErrorDetails_(
  error
) {
  if (!error) {
    return '';
  }

  const parts = [];

  if (error.title) {
    parts.push(
      String(error.title)
    );
  }

  if (
    error.message &&
    String(error.message) !==
    String(error.title || '')
  ) {
    parts.push(
      String(error.message)
    );
  }

  if (
    error.error_data &&
    error.error_data.details
  ) {
    parts.push(
      String(
        error.error_data.details
      )
    );
  }

  return parts.join(' | ');
}
