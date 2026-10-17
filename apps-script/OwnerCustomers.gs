/* Customer intake is a separate, durable owner action before order review. */
function mkCustomerBaseline_(customers) {
  const baseline = {};
  customers.forEach(customer => {
    if (baseline[customer.id]) throw new Error('Duplicate Customer ID. Reconcile the registry first.');
    baseline[customer.id] = String(customer.phone);
  });
  return baseline;
}

function mkCustomerIdsUnchanged_(baseline, customers) {
  const current = mkCustomerBaseline_(customers);
  return Object.keys(baseline).every(id => current[id] === baseline[id]);
}

function ownerOrderSaveCustomer(input, operationId) {
  const book = mkOwnerBook_();
  if (typeof operationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(operationId)) throw new Error('Invalid customer operation identity.');
  const details = mkOwnerDetails_(input), payloadHash = orderRequestDigest_(mkJson_(details));
  return mkLocked_(() => {
    const operations = mkTable_(book, MK_OWNER.customers);
    let operation = mkUnique_(operations, 0, operationId), baseline, customers = mkCustomers_(book), customer;
    if (operation) {
      if (String(operation.row[1]) !== payloadHash) throw new Error('CUSTOMER_OPERATION_CONFLICT: these details differ from the saved attempt.');
      baseline = JSON.parse(operation.row[3]);
      const matches = customers.filter(value => { try { return mkPhone_(value.phone) === details.phone; } catch (_) { return false; } });
      if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: no order has been created.');
      customer = matches[0] || null;
      if (customer && !details.customerId && baseline[customer.id]) throw new Error('An existing customer unexpectedly matched the new customer attempt. Reconcile the registry.');
      if (customer && operation.row[5] && String(operation.row[5]) !== customer.id) throw new Error('Customer operation identity changed.');
    } else {
      customer = mkCustomerMatch_(customers, details.phone, details.customerId);
      if (customer && details.name !== customer.name) throw new Error('Existing customer name differs. Reload the saved customer.');
      if (!customer && customers.length >= 999) throw new Error('Customer formula range is full. Extend and verify the registry and customer ranges before adding another customer.');
      if (customer && !details.updateDefault && details.consent === 'KEEP') return { status: 'READY', customer: customer };
      baseline = mkCustomerBaseline_(customers);
      const intake = mkTable_(book, CUSTOMER_INTAKE_SHEET);
      mkRequire_(intake, ['Submission ID', 'Submitted at', 'First name', 'Mobile number', 'Suburb or postcode',
        'WhatsApp Contact (Yes, Ma Kitchens can contact me on WhatsApp about my free meal claim and order)']);
      const now = new Date(), submissionId = 'OWN-CUSTOMER-' + operationId;
      if (intake.rows.some(row => String(row[0]) === submissionId)) throw new Error('Customer operation journal is missing. Reconcile this intake attempt.');
      const previous = customer ? intake.rows.filter(row => String(row[4]) === customer.phone)
        .sort((a, b) => new Date(b[2]).getTime() - new Date(a[2]).getTime())[0] : null;
      if (customer && !previous) throw new Error('Existing customer intake record could not be verified.');
      const values = previous ? previous.slice(0, 19) : Array(19).fill('');
      const latestTime = intake.rows.reduce((maximum, row) => {
        const date = row[2] instanceof Date ? row[2].getTime() : NaN;
        return Number.isFinite(date) ? Math.max(maximum, date) : maximum;
      }, now.getTime());
      const submitted = new Date(Math.max(now.getTime(), latestTime + 1000));
      values[0] = submissionId; values[1] = submissionId; values[2] = mkSerial_(submitted);
      values[3] = details.name; values[4] = customer ? customer.phone : '+' + details.phone;
      if (!customer || details.updateDefault) values[5] = details.postcode;
      values[8] = details.consent === 'KEEP' ? customer.consent === 'Y' : details.consent === 'YES';
      values[9] = 'owner_order_workspace'; values[10] = 'owner_order_workspace';
      values[18] = 'Owner customer operation ' + operationId;
      const intakeRow = mkEmptyRows_(intake, 1, [1, 2, 3, 4, 5], 2, intake.sheet.getMaxRows())[0];
      const operationNumber = operations.sheet.getLastRow() + 1, nowIso = now.toISOString();
      Sheets.Spreadsheets.batchUpdate({ requests: [orderRequestUpdateCells_(intake.sheet, intakeRow - 1, [values], 19),
        orderRequestUpdateCells_(operations.sheet, operationNumber - 1, [[operationId, payloadHash, details.phone, mkJson_(baseline),
          'INTAKE_SAVED', customer ? customer.id : '', nowIso]], MK_OWNER_HEADERS[MK_OWNER.customers].length)] }, book.getId());
      operation = { number: operationNumber, row: [operationId, payloadHash, details.phone, mkJson_(baseline), 'INTAKE_SAVED', customer ? customer.id : '', nowIso] };
    }
    // Formula-driven registry must finish without renumbering historical IDs.
    let matched = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      SpreadsheetApp.flush(); customers = mkCustomers_(book);
      if (!mkCustomerIdsUnchanged_(baseline, customers)) throw new Error('CUSTOMER_ID_REVIEW_REQUIRED: existing IDs shifted. No order has been created.');
      const matches = customers.filter(value => { try { return mkPhone_(value.phone) === details.phone; } catch (_) { return false; } });
      if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: no order has been created.');
      if (matches.length === 1 && matches[0].name === details.name && (details.consent === 'KEEP' || (matches[0].consent === 'Y') === (details.consent === 'YES'))) {
        matched = matches[0]; break;
      }
      Utilities.sleep(250);
    }
    if (!matched) return { status: 'PENDING', message: 'Customer intake is saved. Registry recalculation is pending. Retry this same saved action; no order has been created.' };
    const customerTable = mkTable_(book, CUSTOMERS_SHEET), requests = [];
    if (!details.customerId || details.updateDefault) requests.push(orderRequestCellUpdate_(customerTable.sheet, matched.rowNumber,
      customerTable.headers['Default Delivery Address'] + 1, details.address));
    requests.push(...mkSetColumns_(operations.sheet, operation.number, { 5: 'READY', 6: matched.id, 7: new Date().toISOString() }));
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId());
    if (!details.customerId || details.updateDefault) matched.address = details.address;
    return { status: 'READY', customer: matched };
  });
}
