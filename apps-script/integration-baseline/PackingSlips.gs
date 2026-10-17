/**
 * Ma Kitchens Packing Slips Automation
 *
 * Full replacement version.
 *
 * Features:
 *  - Uses the existing "Packing Slips" tab in the Ma Kitchens Control Tower
 *  - Reads selected delivery date from Packing Slips!B3
 *  - Includes Confirmed orders only
 *  - Excludes Cancelled and Pending orders
 *  - Reads order contents from "Order Items"
 *  - Prints first name and suburb only
 *  - Does NOT print phone number or full address
 *  - Derives suburb from Orders > Delivery Address
 *  - Suppresses generic "WhatsApp order" notes
 *  - Assigns Bag 1, Bag 2, Bag 3... only
 *  - Creates 4 slips per A4 page
 *  - Uses a compact system-generated / thermal-slip style
 *  - Creates the Google Docs template inside YOUR Google account
 *  - Reuses one output Google Doc per delivery date when regenerated
 */

const PACKING_SLIPS_CONFIG = {
  SPREADSHEET_ID: '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4',
  SHEET_NAME: 'Packing Slips',
  ORDERS_SHEET: 'Orders',
  ORDER_ITEMS_SHEET: 'Order Items',
  TIME_ZONE: 'Australia/Sydney',

  // Existing preview table
  PREVIEW_HEADER_ROW: 10,
  PREVIEW_START_ROW: 11,
  PREVIEW_COLUMNS: 8,

  // Control/status area that does NOT overlap the preview
  LAST_GENERATED_LABEL_CELL: 'E2',
  LAST_GENERATED_VALUE_CELL: 'F2',
  DOCUMENT_LABEL_CELL: 'E3',
  DOCUMENT_VALUE_CELL: 'F3',
  SLIP_COUNT_LABEL_CELL: 'E4',
  SLIP_COUNT_VALUE_CELL: 'F4',

  TEMPLATE_PROPERTY: 'PACKING_SLIPS_TEMPLATE_DOC_ID',
  OUTPUT_PROPERTY_PREFIX: 'PACKING_SLIPS_OUTPUT_DOC_'
};


/**
 * RUN THIS ONCE after replacing PackingSlips.gs.
 *
 * It:
 *  1. validates the Packing Slips tab
 *  2. normalises the selected date
 *  3. creates the Google Docs template in your own account
 *  4. installs the Packing Slips menu
 *  5. refreshes the preview
 */
function setupPackingSlips() {
  const ss = getPackingSlipsSpreadsheet_();
  const sheet = ss.getSheetByName(PACKING_SLIPS_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'The "Packing Slips" tab was not found in the Ma Kitchens Control Tower.'
    );
  }

  setupPackingSlipsStatusArea_(sheet);

  const selectedDate = parseFlexibleDate_(sheet.getRange('B3').getValue());

  if (!selectedDate) {
    throw new Error(
      'Packing Slips!B3 does not contain a valid delivery date.'
    );
  }

  sheet.getRange('B3')
    .setValue(selectedDate)
    .setNumberFormat('dd-mmm-yyyy');

  ensurePackingSlipTemplate_();
  installPackingSlipOpenTrigger_();
  refreshPackingSlipsPreview();

  SpreadsheetApp.getUi().alert(
    'Packing Slips setup is complete.\n\n' +
    'The preview has been refreshed and the Google Docs template was created in your Google account.'
  );
}


/**
 * Adds the custom menu to the Control Tower.
 *
 * An installable on-open trigger calls this function automatically.
 */
function showPackingSlipsMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('Packing Slips')
    .addItem('Refresh Preview', 'refreshPackingSlipsPreview')
    .addItem('Generate Packing Slips', 'generatePackingSlips')
    .addSeparator()
    .addItem('Rebuild Slip Template', 'rebuildPackingSlipsTemplate')
    .addToUi();
}


/**
 * Reads Confirmed orders for the selected date and rebuilds the preview.
 */
function refreshPackingSlipsPreview() {
  const ss = getPackingSlipsSpreadsheet_();
  const sheet = ss.getSheetByName(PACKING_SLIPS_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error('Packing Slips sheet not found.');
  }

  const orders = collectPackingSlipData_();

  const rowsAvailable =
    sheet.getMaxRows() - PACKING_SLIPS_CONFIG.PREVIEW_START_ROW + 1;

  if (rowsAvailable > 0) {
    sheet.getRange(
      PACKING_SLIPS_CONFIG.PREVIEW_START_ROW,
      1,
      rowsAvailable,
      PACKING_SLIPS_CONFIG.PREVIEW_COLUMNS
    ).clearContent();
  }

  if (!orders.length) {
    sheet.getRange(
      PACKING_SLIPS_CONFIG.PREVIEW_START_ROW,
      1
    ).setValue(
      'No eligible Confirmed orders for the selected delivery date.'
    );

    return [];
  }

  const previewValues = orders.map((order, index) => [
    'Bag ' + (index + 1),
    order.orderId,
    order.firstName,
    order.suburb,
    order.deliveryWindow,
    order.totalPacks,
    order.orderStatus,
    order.deliveryNote
  ]);

  const previewRange = sheet.getRange(
    PACKING_SLIPS_CONFIG.PREVIEW_START_ROW,
    1,
    previewValues.length,
    PACKING_SLIPS_CONFIG.PREVIEW_COLUMNS
  );

  previewRange.setValues(previewValues);
  previewRange.setWrap(true);
  previewRange.setVerticalAlignment('top');

  return orders;
}


/**
 * Generates the printable Google Doc.
 *
 * If the same delivery date is generated again, the same Google Doc is
 * refreshed instead of creating another duplicate file.
 */
function generatePackingSlips() {
  const ss = getPackingSlipsSpreadsheet_();
  const sheet = ss.getSheetByName(PACKING_SLIPS_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error('Packing Slips sheet not found.');
  }

  const orders = collectPackingSlipData_();

  if (!orders.length) {
    throw new Error(
      'There are no Confirmed orders for the selected delivery date.'
    );
  }

  const zeroPackOrders = orders
    .filter(order => order.totalPacks <= 0)
    .map(order => order.orderId);

  if (zeroPackOrders.length) {
    throw new Error(
      'Generation stopped because these Confirmed orders have no active order items: ' +
      zeroPackOrders.join(', ')
    );
  }

  // Keep preview exactly aligned with what will print.
  refreshPackingSlipsPreview();

  const selectedDate = getSelectedPackingSlipDate_();
  const dateKey = dateKey_(selectedDate);
  const displayDate = Utilities.formatDate(
    selectedDate,
    PACKING_SLIPS_CONFIG.TIME_ZONE,
    'd MMM yyyy'
  );

  const outputDoc = getOrCreateOutputDocument_(
    dateKey,
    'Ma Kitchens Packing Slips - ' + displayDate
  );

  const templateDoc = ensurePackingSlipTemplate_();
  const templateTable = getFirstTable_(templateDoc.getBody());

  const body = outputDoc.getBody();
  body.clear();

  applyA4PageSettings_(body);

  for (let start = 0; start < orders.length; start += 4) {
    if (start > 0) {
      body.appendPageBreak();
    }

    const pageTable = body.appendTable(templateTable.copy());

    for (let slot = 0; slot < 4; slot++) {
      const rowIndex = Math.floor(slot / 2);
      const columnIndex = slot % 2;
      const cell = pageTable.getCell(rowIndex, columnIndex);

      const order = orders[start + slot];

      if (!order) {
        clearSlipCell_(cell);
        continue;
      }

      fillSlipCell_(
        cell,
        order,
        start + slot + 1
      );
    }
  }

  outputDoc.saveAndClose();

  const outputUrl =
    'https://docs.google.com/document/d/' +
    outputDoc.getId() +
    '/edit';

  sheet.getRange(PACKING_SLIPS_CONFIG.LAST_GENERATED_VALUE_CELL)
    .setValue(new Date())
    .setNumberFormat('dd-mmm-yyyy hh:mm');

  sheet.getRange(PACKING_SLIPS_CONFIG.DOCUMENT_VALUE_CELL)
    .setFormula(
      '=HYPERLINK("' +
      outputUrl +
      '","Open Packing Slips")'
    );

  sheet.getRange(PACKING_SLIPS_CONFIG.SLIP_COUNT_VALUE_CELL)
    .setValue(orders.length);

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    'Packing slips generated successfully.\n\n' +
    orders.length +
    ' slip(s) created.\n\n' +
    'Use the "Open Packing Slips" link on the Packing Slips tab.'
  );
}


/**
 * Rebuilds the default Google Docs template in your own Google account.
 *
 * Normally you will not need to run this.
 */
function rebuildPackingSlipsTemplate() {
  buildPackingSlipTemplate_(true);

  SpreadsheetApp.getUi().alert(
    'The Ma Kitchens packing slip template has been rebuilt.'
  );
}


/* ============================================================
 * DATA COLLECTION
 * ============================================================
 */

function collectPackingSlipData_() {
  const ss = getPackingSlipsSpreadsheet_();

  const ordersSheet =
    ss.getSheetByName(PACKING_SLIPS_CONFIG.ORDERS_SHEET);

  const itemsSheet =
    ss.getSheetByName(PACKING_SLIPS_CONFIG.ORDER_ITEMS_SHEET);

  if (!ordersSheet || !itemsSheet) {
    throw new Error(
      'Required Control Tower sheets "Orders" or "Order Items" are missing.'
    );
  }

  const selectedDate = getSelectedPackingSlipDate_();
  const selectedDateKey = dateKey_(selectedDate);

  const ordersValues = ordersSheet.getDataRange().getValues();
  const itemValues = itemsSheet.getDataRange().getValues();

  if (ordersValues.length < 2) {
    return [];
  }

  const orderHeaders = ordersValues[0].map(String);
  const itemHeaders = itemValues.length
    ? itemValues[0].map(String)
    : [];

  const orderCol = {
    orderId: headerIndex_(orderHeaders, 'Order ID'),
    deliveryDate: headerIndex_(orderHeaders, 'Delivery Date'),
    customerName: headerIndex_(orderHeaders, 'Customer Name'),
    deliveryAddress: headerIndex_(orderHeaders, 'Delivery Address'),
    orderStatus: headerIndex_(orderHeaders, 'Order Status'),
    deliveryWindow: headerIndex_(orderHeaders, 'Delivery Window'),
    notes: headerIndex_(orderHeaders, 'Notes')
  };

  const itemCol = {
    orderId: headerIndex_(itemHeaders, 'Order ID'),
    orderStatus: optionalHeaderIndex_(itemHeaders, 'Order Status'),
    dishName: headerIndex_(itemHeaders, 'Dish Name'),
    qty: headerIndex_(itemHeaders, 'Qty'),
    fulfilmentStatus: optionalHeaderIndex_(
      itemHeaders,
      'Fulfilment Status'
    )
  };

  const itemsByOrder = {};

  for (let rowIndex = 1; rowIndex < itemValues.length; rowIndex++) {
    const row = itemValues[rowIndex];

    const orderId =
      String(row[itemCol.orderId] || '').trim();

    if (!orderId) {
      continue;
    }

    if (itemCol.orderStatus >= 0) {
      const status =
        String(row[itemCol.orderStatus] || '')
          .trim()
          .toLowerCase();

      if (status === 'cancelled') {
        continue;
      }
    }

    if (itemCol.fulfilmentStatus >= 0) {
      const fulfilmentStatus =
        String(row[itemCol.fulfilmentStatus] || '')
          .trim()
          .toLowerCase();

      if (fulfilmentStatus === 'cancelled') {
        continue;
      }
    }

    const qty = Number(row[itemCol.qty]) || 0;
    const dishName =
      String(row[itemCol.dishName] || '').trim();

    if (qty <= 0 || !dishName) {
      continue;
    }

    if (!itemsByOrder[orderId]) {
      itemsByOrder[orderId] = [];
    }

    itemsByOrder[orderId].push({
      dishName: dishName,
      qty: qty
    });
  }

  const output = [];

  // Orders sheet row order controls the bag sequence.
  for (let rowIndex = 1; rowIndex < ordersValues.length; rowIndex++) {
    const row = ordersValues[rowIndex];

    const orderId =
      String(row[orderCol.orderId] || '').trim();

    const orderStatus =
      String(row[orderCol.orderStatus] || '').trim();

    if (!orderId) {
      continue;
    }

    if (orderStatus.toLowerCase() !== 'confirmed') {
      continue;
    }

    const orderDeliveryDate =
      parseFlexibleDate_(row[orderCol.deliveryDate]);

    if (!orderDeliveryDate) {
      continue;
    }

    if (dateKey_(orderDeliveryDate) !== selectedDateKey) {
      continue;
    }

    const items = itemsByOrder[orderId] || [];

    const totalPacks = items.reduce(
      (sum, item) => sum + (Number(item.qty) || 0),
      0
    );

    const customerName =
      String(row[orderCol.customerName] || '').trim();

    const deliveryAddress =
      String(row[orderCol.deliveryAddress] || '').trim();

    output.push({
      orderId: orderId,
      firstName: firstName_(customerName),
      suburb: deriveSuburb_(deliveryAddress),
      deliveryWindow:
        String(row[orderCol.deliveryWindow] || '').trim(),
      totalPacks: totalPacks,
      orderStatus: orderStatus,
      deliveryNote:
        cleanDeliveryNote_(row[orderCol.notes]),
      items: items
    });
  }

  return output;
}


function getSelectedPackingSlipDate_() {
  const ss = getPackingSlipsSpreadsheet_();
  const sheet =
    ss.getSheetByName(PACKING_SLIPS_CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error('Packing Slips sheet not found.');
  }

  const parsed =
    parseFlexibleDate_(sheet.getRange('B3').getValue());

  if (!parsed) {
    throw new Error(
      'Please enter a valid delivery date in Packing Slips!B3.'
    );
  }

  return parsed;
}


/* ============================================================
 * SUBURB + PRIVACY RULES
 * ============================================================
 */

/**
 * Derives suburb from Orders > Delivery Address.
 *
 * Handles current formats such as:
 *  101 Hillcrest Avenue Greenacre, 2190
 *  610/9 Paddock St, Lidcombe, NSW 2141
 *  14 Boyland Road Edmondson Park NSW 2174
 *  Unit 301/215-217 Waterloo Road Marsfield 2122
 *  2-4 Purser Avenue\nCastle Hill NSW 2154
 *
 * If the parser is not confident, it returns blank rather than guessing.
 */
function deriveSuburb_(address) {
  let text = String(address || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return '';
  }

  // Remove NSW + postcode or postcode-only suffix.
  text = text
    .replace(/\s*,?\s*NSW\s+\d{4}\s*$/i, '')
    .replace(/\s*,?\s*\d{4}\s*$/i, '')
    .replace(/[,\s]+$/g, '')
    .trim();

  const streetTypes = [
    'Avenue', 'Ave',
    'Street', 'St',
    'Road', 'Rd',
    'Circuit', 'Cct',
    'Drive', 'Dr',
    'Lane', 'Ln',
    'Way',
    'Boulevard', 'Blvd',
    'Close', 'Cl',
    'Place', 'Pl',
    'Court', 'Ct',
    'Parade', 'Pde',
    'Crescent', 'Cres',
    'Terrace', 'Tce',
    'Highway', 'Hwy',
    'Square', 'Sq',
    'Grove', 'Gr',
    'Rise',
    'View',
    'Walk',
    'Esplanade'
  ].join('|');

  const streetRegex = new RegExp(
    '.*\\b(?:' +
    streetTypes +
    ')\\b[\\s,]+(.+)$',
    'i'
  );

  const streetMatch = text.match(streetRegex);

  if (streetMatch && streetMatch[1]) {
    return streetMatch[1]
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
  }

  // Conservative fallback for comma separated addresses.
  const parts = text
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }

  return '';
}


function firstName_(fullName) {
  const cleaned =
    String(fullName || '').trim();

  if (!cleaned) {
    return '';
  }

  return cleaned.split(/\s+/)[0];
}


function cleanDeliveryNote_(note) {
  const cleaned =
    String(note || '')
      .replace(/\r\n/g, '\n')
      .trim();

  if (!cleaned) {
    return '';
  }

  // Generic source note is not useful on the bag.
  if (/^whatsapp order$/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}


/* ============================================================
 * TEMPLATE CREATION
 * ============================================================
 */

/**
 * Opens the template created by this Apps Script.
 * If none exists, creates it automatically in the current user's Drive.
 */
function ensurePackingSlipTemplate_() {
  const props = PropertiesService.getScriptProperties();
  let templateId =
    props.getProperty(PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY);

  let templateDoc = null;

  if (templateId) {
    try {
      templateDoc = DocumentApp.openById(templateId);
    } catch (error) {
      props.deleteProperty(
        PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY
      );
      templateId = null;
    }
  }

  if (!templateDoc) {
    templateDoc =
      DocumentApp.create(
        'Ma Kitchens Packing Slips Template'
      );

    props.setProperty(
      PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY,
      templateDoc.getId()
    );
  }

  if (!getFirstTableOrNull_(templateDoc.getBody())) {
    templateDoc = buildPackingSlipTemplate_(false);
  }

  return templateDoc;
}


/**
 * Builds the 2 x 2 A4 packing slip template.
 */
function buildPackingSlipTemplate_(force) {
  const props = PropertiesService.getScriptProperties();

  let templateId =
    props.getProperty(
      PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY
    );

  let doc = null;

  if (templateId) {
    try {
      doc = DocumentApp.openById(templateId);
    } catch (error) {
      props.deleteProperty(
        PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY
      );
      templateId = null;
    }
  }

  if (!doc) {
    doc =
      DocumentApp.create(
        'Ma Kitchens Packing Slips Template'
      );

    props.setProperty(
      PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY,
      doc.getId()
    );
  }

  const body = doc.getBody();

  if (!force && getFirstTableOrNull_(body)) {
    return doc;
  }

  body.clear();
  applyA4PageSettings_(body);

  const table = body.appendTable([
    ['', ''],
    ['', '']
  ]);

  table.setBorderWidth(0.75);
  table.setBorderColor('#B7B7B7');
  table.setColumnWidth(0, 275);
  table.setColumnWidth(1, 275);

  for (let row = 0; row < 2; row++) {
    table.getRow(row).setMinimumHeight(385);

    for (let col = 0; col < 2; col++) {
      configureTemplateCell_(
        table.getCell(row, col)
      );
    }
  }

  doc.saveAndClose();

  return DocumentApp.openById(
    props.getProperty(
      PACKING_SLIPS_CONFIG.TEMPLATE_PROPERTY
    )
  );
}


function configureTemplateCell_(cell) {
  cell.clear();

  cell.setVerticalAlignment(
    DocumentApp.VerticalAlignment.TOP
  );

  cell.setPaddingTop(8);
  cell.setPaddingBottom(8);
  cell.setPaddingLeft(9);
  cell.setPaddingRight(9);

  appendSlipParagraph_(
    cell,
    'MA KITCHENS',
    9,
    true,
    2
  );

  appendSlipParagraph_(
    cell,
    '{{BAG}}',
    18,
    true,
    6
  );

  appendSlipParagraph_(
    cell,
    'ORDER: {{ORDER_ID}}',
    9,
    true,
    1
  );

  appendSlipParagraph_(
    cell,
    'CUSTOMER: {{CUSTOMER}}',
    9,
    false,
    1
  );

  appendSlipParagraph_(
    cell,
    'SUBURB: {{SUBURB}}',
    9,
    false,
    1
  );

  appendSlipParagraph_(
    cell,
    'DELIVERY: {{DELIVERY_WINDOW}}',
    9,
    false,
    4
  );

  appendSlipParagraph_(
    cell,
    '------------------------------',
    8,
    false,
    3
  );

  appendSlipParagraph_(
    cell,
    '{{ORDER_LINES}}',
    9,
    false,
    4
  );

  appendSlipParagraph_(
    cell,
    'TOTAL PACKS: {{TOTAL_PACKS}}',
    9,
    true,
    3
  );

  appendSlipParagraph_(
    cell,
    '------------------------------',
    8,
    false,
    3
  );

  appendSlipParagraph_(
    cell,
    '{{NOTE_BLOCK}}',
    7.5,
    false,
    6
  );

  appendSlipParagraph_(
    cell,
    '[ ] PACKED     [ ] CHECKED',
    9,
    true,
    0
  );
}


function appendSlipParagraph_(
  container,
  text,
  fontSize,
  bold,
  spacingAfter
) {
  const paragraph =
    container.appendParagraph(text);

  paragraph.setSpacingAfter(spacingAfter || 0);
  paragraph.setLineSpacing(1);

  const textRange = paragraph.editAsText();

  textRange.setFontFamily('Roboto Mono');
  textRange.setFontSize(fontSize);
  textRange.setBold(Boolean(bold));

  return paragraph;
}


function fillSlipCell_(cell, order, bagNumber) {
  replaceCellToken_(
    cell,
    'BAG',
    'BAG ' + bagNumber
  );

  replaceCellToken_(
    cell,
    'ORDER_ID',
    order.orderId
  );

  replaceCellToken_(
    cell,
    'CUSTOMER',
    order.firstName
  );

  replaceCellToken_(
    cell,
    'SUBURB',
    order.suburb
  );

  replaceCellToken_(
    cell,
    'DELIVERY_WINDOW',
    order.deliveryWindow
  );

  replaceCellToken_(
    cell,
    'TOTAL_PACKS',
    String(order.totalPacks)
  );

  const orderLines =
    order.items
      .map(
        item =>
          formatQty_(item.qty) +
          ' x ' +
          item.dishName
      )
      .join('\n');

  setExactTokenParagraph_(
    cell,
    '{{ORDER_LINES}}',
    orderLines,
    9,
    false
  );

  const noteBlock =
    order.deliveryNote
      ? 'DELIVERY NOTE\n' +
        order.deliveryNote
      : '';

  setExactTokenParagraph_(
    cell,
    '{{NOTE_BLOCK}}',
    noteBlock,
    7.5,
    false
  );
}


function clearSlipCell_(cell) {
  cell.clear();
  cell.appendParagraph(' ');
}


function replaceCellToken_(
  cell,
  tokenName,
  replacement
) {
  const pattern =
    '\\{\\{' + tokenName + '\\}\\}';

  cell.replaceText(
    pattern,
    safeReplacement_(replacement)
  );
}


function setExactTokenParagraph_(
  cell,
  exactToken,
  replacement,
  fontSize,
  bold
) {
  for (
    let index = 0;
    index < cell.getNumChildren();
    index++
  ) {
    const child = cell.getChild(index);

    if (
      child.getType() !==
      DocumentApp.ElementType.PARAGRAPH
    ) {
      continue;
    }

    const paragraph = child.asParagraph();

    if (paragraph.getText() !== exactToken) {
      continue;
    }

    const finalText =
      String(replacement || '').trim() === ''
        ? ' '
        : String(replacement);

    paragraph.setText(finalText);
    paragraph.setSpacingAfter(4);
    paragraph.setLineSpacing(1);

    const text = paragraph.editAsText();

    text.setFontFamily('Roboto Mono');
    text.setFontSize(fontSize);
    text.setBold(Boolean(bold));

    return;
  }

  throw new Error(
    'Packing slip template token was not found: ' +
    exactToken
  );
}


function getFirstTable_(body) {
  const table = getFirstTableOrNull_(body);

  if (!table) {
    throw new Error(
      'The packing slip template does not contain its 2 x 2 slip table.'
    );
  }

  return table;
}


function getFirstTableOrNull_(body) {
  for (
    let index = 0;
    index < body.getNumChildren();
    index++
  ) {
    const child = body.getChild(index);

    if (
      child.getType() ===
      DocumentApp.ElementType.TABLE
    ) {
      return child.asTable();
    }
  }

  return null;
}


/* ============================================================
 * OUTPUT DOCUMENT
 * ============================================================
 */

function getOrCreateOutputDocument_(
  dateKey,
  documentName
) {
  const props = PropertiesService.getScriptProperties();

  const propertyKey =
    PACKING_SLIPS_CONFIG.OUTPUT_PROPERTY_PREFIX +
    dateKey;

  const existingId =
    props.getProperty(propertyKey);

  if (existingId) {
    try {
      const existingDoc =
        DocumentApp.openById(existingId);

      DriveApp
        .getFileById(existingId)
        .setName(documentName);

      return existingDoc;
    } catch (error) {
      props.deleteProperty(propertyKey);
    }
  }

  const newDoc =
    DocumentApp.create(documentName);

  props.setProperty(
    propertyKey,
    newDoc.getId()
  );

  return newDoc;
}


/* ============================================================
 * PACKING SLIPS SHEET SETUP
 * ============================================================
 */

function setupPackingSlipsStatusArea_(sheet) {
  sheet.getRange(
    PACKING_SLIPS_CONFIG.LAST_GENERATED_LABEL_CELL
  ).setValue('Last Generated:');

  sheet.getRange(
    PACKING_SLIPS_CONFIG.DOCUMENT_LABEL_CELL
  ).setValue('Document:');

  sheet.getRange(
    PACKING_SLIPS_CONFIG.SLIP_COUNT_LABEL_CELL
  ).setValue('Slips Generated:');

  sheet.getRange('E2:E4').setFontWeight('bold');
  sheet.getRange('E2:F4').setWrap(true);
}


function installPackingSlipOpenTrigger_() {
  const ss = getPackingSlipsSpreadsheet_();

  const alreadyExists =
    ScriptApp.getProjectTriggers()
      .some(trigger =>
        trigger.getHandlerFunction() ===
          'showPackingSlipsMenu_' &&
        trigger.getEventType() ===
          ScriptApp.EventType.ON_OPEN
      );

  if (!alreadyExists) {
    ScriptApp
      .newTrigger('showPackingSlipsMenu_')
      .forSpreadsheet(ss)
      .onOpen()
      .create();
  }
}


/* ============================================================
 * UTILITIES
 * ============================================================
 */

function getPackingSlipsSpreadsheet_() {
  return SpreadsheetApp.openById(
    PACKING_SLIPS_CONFIG.SPREADSHEET_ID
  );
}


function applyA4PageSettings_(body) {
  // A4 page size in points.
  body.setPageWidth(595.28);
  body.setPageHeight(841.89);

  // Tight margins so four slips fit cleanly.
  body.setMarginTop(18);
  body.setMarginBottom(18);
  body.setMarginLeft(18);
  body.setMarginRight(18);
}


function headerIndex_(headers, headerName) {
  const index =
    headers.indexOf(headerName);

  if (index < 0) {
    throw new Error(
      'Required column not found: ' +
      headerName
    );
  }

  return index;
}


function optionalHeaderIndex_(
  headers,
  headerName
) {
  return headers.indexOf(headerName);
}


function parseFlexibleDate_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  const text =
    String(value || '').trim();

  if (!text) {
    return null;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  let match =
    text.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
    );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );
  }

  // yyyy-mm-dd
  match =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  }

  // Handles values such as 17-Sep-2026.
  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );
  }

  return null;
}


function dateKey_(date) {
  return Utilities.formatDate(
    date,
    PACKING_SLIPS_CONFIG.TIME_ZONE,
    'yyyy-MM-dd'
  );
}


function formatQty_(qty) {
  const number = Number(qty) || 0;

  return Number.isInteger(number)
    ? String(number)
    : String(number);
}


function safeReplacement_(value) {
  // DocumentApp.replaceText treats $ as special in replacement strings.
  return String(
    value == null ? '' : value
  ).replace(/\$/g, '\\$');
}
