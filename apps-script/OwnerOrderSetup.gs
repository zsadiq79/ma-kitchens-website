/* Test-only schema migration. Historical rows retain their original formula fallback. */

const MK_OWNER_OPERATIONAL_LAYOUT = {
  "Orders": [
    "Order ID",
    "Order Date",
    "Delivery Date",
    "Customer ID",
    "Customer Name",
    "Phone",
    "Delivery Address",
    "Postcode",
    "Order Status",
    "Payment Status",
    "Delivery Window",
    "Order Total",
    "Delivery Status",
    "Notes",
    "Items Subtotal",
    "Delivery Fee",
    "Free Delivery Discount (AUTO)",
    "Cook Payout",
    "Contribution Before Delivery Cost",
    "Total Qty",
    "Discounted Qty (AUTO)",
    "Order Rules Control",
    "Capacity Control",
    "Order Check",
    "Ready to Confirm?",
    "Pricing Discount % (SNAPSHOT)",
    "Pricing Delivery Fee (SNAPSHOT)",
    "Free Delivery Threshold (SNAPSHOT)",
    "Free Delivery Basis (SNAPSHOT)",
    "Minimum Order Items (SNAPSHOT)",
    "Delivery Address (SNAPSHOT)",
    "Customer Name (SNAPSHOT)",
    "Phone (SNAPSHOT)",
    "Postcode (SNAPSHOT)",
    "Delivery Instructions (SNAPSHOT)",
    "Request Reference (SNAPSHOT)",
    "Owner Operation ID"
  ],
  "Order Items": [
    "Order ID",
    "Delivery Date",
    "Order Status",
    "Dish Name",
    "Item Code (AUTO, INTERNAL)",
    "Cook ID",
    "Qty",
    "Price Treatment (AUTO)",
    "List Price",
    "Customer Unit Price",
    "Cook Pay / Unit",
    "Line Total",
    "Cook Payout",
    "Fulfilment Status",
    "Ordered Qty / Cycle",
    "Available Servings / Cycle",
    "Capacity Check",
    "Notes",
    "Offer Eligible (AUTO)",
    "Free Promo Qty (LEGACY)",
    "Discounted Qty (AUTO)",
    "Full Price Qty (LEGACY)",
    "Item Code (SNAPSHOT)",
    "List Price (SNAPSHOT)",
    "Cook Pay (SNAPSHOT)",
    "Cook ID (SNAPSHOT)",
    "Kitchen Name (SNAPSHOT)",
    "Menu Line ID (SNAPSHOT)",
    "Customer Unit Price (SNAPSHOT)",
    "Line Total (SNAPSHOT)"
  ]
};
function mkAssertOperationalLayout_(book) {
  Object.keys(MK_OWNER_OPERATIONAL_LAYOUT).forEach(name => {
    const sheet = book.getSheetByName(name), expected = MK_OWNER_OPERATIONAL_LAYOUT[name];
    if (!sheet || sheet.getMaxColumns() < expected.length) throw new Error('Operational schema needs setup: ' + name);
    const actual = sheet.getRange(1,1,1,expected.length).getDisplayValues()[0];
    if (expected.some((header,index) => actual[index] !== header)) throw new Error('Operational columns moved or changed: ' + name);
  });
  Object.keys(MK_OWNER_FORMULA_SNAPSHOTS).forEach(key=>{
    const split=key.lastIndexOf('!'),sheet=book.getSheetByName(key.slice(0,split));
    if(sheet.getRange(key.slice(split+1)).getFormula()!==MK_OWNER_FORMULA_SNAPSHOTS[key])
      throw new Error('Operational snapshot formula changed: '+key);
  });
}

const MK_OWNER_FORMULA_BASELINE = {
  "Order Items!E2": "=MAP(B2:B5000,D2:D5000,W2:W5000,LAMBDA(dt,name,code,IF(name=\"\",\"\",IF(dt=\"\",\"\",IF(code<>\"\",code,IFERROR(INDEX(FILTER('Weekly Menu'!D$2:D$1000,'Weekly Menu'!C$2:C$1000=dt,'Weekly Menu'!E$2:E$1000=name,'Weekly Menu'!U$2:U$1000=\"Available\"),1),\"\"))))))",
  "Orders!G2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AE2:AE2000<>\"\",AE2:AE2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!AD$2:AD$1000,\"\"))))",
  "Orders!E2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!B$2:B$1000,\"\")))",
  "Orders!F2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!C$2:C$1000,\"\")))",
  "Orders!H2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!E$2:E$1000,\"\")))",
  "Order Items!F2": "=MAP(B2:B5000,E2:E5000,LAMBDA(dt,code,IF(code=\"\",\"\",IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!F$2:F$1000,\"\")))))",
  "Order Items!I2": "=MAP(B2:B5000,E2:E5000,LAMBDA(dt,code,IF(code=\"\",\"\",IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!I$2:I$1000,\"\")))))",
  "Order Items!K2": "=ARRAYFORMULA(IF(E2:E5000=\"\",\"\",XLOOKUP(E2:E5000,Dishes!A$2:A$500,Dishes!F$2:F$500,\"\")))"
};
const MK_OWNER_FORMULA_SNAPSHOTS = {
  "Order Items!E2": "=MAP(B2:B5000,D2:D5000,W2:W5000,LAMBDA(dt,name,code,IF(name=\"\",\"\",IF(dt=\"\",\"\",IF(code<>\"\",code,IFERROR(INDEX(FILTER('Weekly Menu'!D$2:D$1000,'Weekly Menu'!C$2:C$1000=dt,'Weekly Menu'!E$2:E$1000=name,'Weekly Menu'!U$2:U$1000=\"Available\"),1),\"\"))))))",
  "Orders!G2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AE2:AE2000<>\"\",AE2:AE2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!AD$2:AD$1000,\"\"))))",
  "Orders!E2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AF2:AF2000<>\"\",AF2:AF2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!B$2:B$1000,\"\"))))",
  "Orders!F2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AG2:AG2000<>\"\",AG2:AG2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!C$2:C$1000,\"\"))))",
  "Orders!H2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AH2:AH2000<>\"\",AH2:AH2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!E$2:E$1000,\"\"))))",
  "Order Items!F2": "=MAP(B2:B5000,E2:E5000,Z2:Z5000,LAMBDA(dt,code,snapshot,IF(code=\"\",\"\",IF(snapshot<>\"\",snapshot,IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!F$2:F$1000,\"\"))))))",
  "Order Items!I2": "=MAP(B2:B5000,E2:E5000,X2:X5000,LAMBDA(dt,code,snapshot,IF(code=\"\",\"\",IF(snapshot<>\"\",snapshot,IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!I$2:I$1000,\"\"))))))",
  "Order Items!K2": "=ARRAYFORMULA(IF(E2:E5000=\"\",\"\",IF(Y2:Y5000<>\"\",Y2:Y5000,XLOOKUP(E2:E5000,Dishes!A$2:A$500,Dishes!F$2:F$500,\"\"))))"
};
const MK_OWNER_ORDER_COLUMNS = ['Customer Name (SNAPSHOT)', 'Phone (SNAPSHOT)', 'Postcode (SNAPSHOT)', 'Delivery Instructions (SNAPSHOT)', 'Request Reference (SNAPSHOT)', 'Owner Operation ID'];
const MK_OWNER_ITEM_COLUMNS = ['List Price (SNAPSHOT)', 'Cook Pay (SNAPSHOT)', 'Cook ID (SNAPSHOT)', 'Kitchen Name (SNAPSHOT)', 'Menu Line ID (SNAPSHOT)', 'Customer Unit Price (SNAPSHOT)', 'Line Total (SNAPSHOT)'];

function setupOwnerOrderWorkspace() {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() !== 'orderRequestInboxOnOpen_'))
      throw new Error('The test project contains other triggers. Use an isolated test project before installing this workspace.');
    // Validate everything before issuing the grouped schema mutation.
    const changes = [], owner = book.getOwner().getEmail();
    Object.keys(MK_OWNER_HEADERS).forEach(name => {
      const sheet = book.getSheetByName(name);
      if (sheet) {
        const actual = sheet.getRange(1, 1, 1, MK_OWNER_HEADERS[name].length).getDisplayValues()[0];
        if (actual.some((value, i) => value && value !== MK_OWNER_HEADERS[name][i])) throw new Error('Owner workspace schema differs: ' + name);
      }
    });
    Object.keys(MK_OWNER_FORMULA_BASELINE).forEach(key => {
      const split = key.lastIndexOf('!'), name = key.slice(0, split), cell = key.slice(split + 1);
      const sheet = book.getSheetByName(name);
      if (!sheet) throw new Error('Missing operational sheet: ' + name);
      const current = sheet.getRange(cell).getFormula();
      if (current !== MK_OWNER_FORMULA_BASELINE[key] && current !== MK_OWNER_FORMULA_SNAPSHOTS[key]) throw new Error('Formula differs at ' + key + '. Review the test baseline before setup.');
    });
    for (const definition of [[ORDERS_SHEET, 32, MK_OWNER_ORDER_COLUMNS], [ORDER_ITEMS_SHEET, 24, MK_OWNER_ITEM_COLUMNS]]) {
      const sheet = book.getSheetByName(definition[0]), first = definition[1], columns = definition[2];
      const existingWidth = Math.max(0, Math.min(columns.length, sheet.getMaxColumns() - first + 1));
      const actual = existingWidth ? sheet.getRange(1, first, 1, existingWidth).getDisplayValues()[0] : [];
      if (actual.some((value, i) => value && value !== columns[i])) throw new Error('Snapshot destination is occupied: ' + definition[0]);
      const needed = first + columns.length - 1;
      if (sheet.getMaxColumns() < needed) changes.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', length: needed - sheet.getMaxColumns() } });
      columns.forEach((name, i) => changes.push(orderRequestCellUpdate_(sheet, 1, first + i, name)));
    }
    Object.keys(MK_OWNER_FORMULA_SNAPSHOTS).forEach(key => {
      const split = key.lastIndexOf('!'), sheet = book.getSheetByName(key.slice(0, split)), range = sheet.getRange(key.slice(split + 1));
      changes.push(mkFormulaCell_(sheet, range.getRow(), range.getColumn(), MK_OWNER_FORMULA_SNAPSHOTS[key]));
    });
    Sheets.Spreadsheets.batchUpdate({ requests: changes }, book.getId());
    Object.keys(MK_OWNER_HEADERS).forEach(name => {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      sheet.getRange(1, 1, 1, MK_OWNER_HEADERS[name].length).setValues([MK_OWNER_HEADERS[name]]);
      sheet.setFrozenRows(1);
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!protections.length) {
        const protection = sheet.protect().setDescription('Private owner order ledger');
        protection.addEditor(owner);
        const others = protection.getEditors().filter(editor => editor.getEmail() !== owner);
        if (others.length) protection.removeEditors(others);
        if (protection.canDomainEdit()) protection.setDomainEdit(false);
      }
    });
    orderRequestInboxOnOpen_();
    return { ok: true, environment: 'TEST', message: 'Owner workspace installed in test copy only.' };
  });
}

function mkFormulaCell_(sheet, row, column, formula) {
  const request = orderRequestCellUpdate_(sheet, row, column, '');
  request.updateCells.rows[0].values[0] = { userEnteredValue: { formulaValue: formula } };
  return request;
}

function mkOwnerRowFormulaRequests_(orders, orderRow, items, itemRows) {
  for (const column of [16, 17, 20, 21, 22]) if (!orders.getRange(orderRow, column).getFormula())
    throw new Error('Order formula coverage is missing at row ' + orderRow + '. Extend the formulas first.');
  const requests = [];
  itemRows.forEach(row => {
    for (const column of [8, 10, 12, 13, 19, 20, 21, 22]) if (!items.getRange(row, column).getFormula())
      throw new Error('Order item formula coverage is missing at row ' + row + '. Extend the formulas first.');
    const unit = items.getRange(row, 10).getFormula(), total = items.getRange(row, 12).getFormula();
    requests.push(mkFormulaCell_(items, row, 10, '=IF(AC' + row + '<>"",AC' + row + ',' + unit.slice(1) + ')'));
    requests.push(mkFormulaCell_(items, row, 12, '=IF(AC' + row + '<>"",IF(OR(C' + row + '="Cancelled",N' + row + '="Cancelled"),0,ROUND(G' + row + '*AC' + row + ',2)),' + total.slice(1) + ')'));
  });
  return requests;
}

