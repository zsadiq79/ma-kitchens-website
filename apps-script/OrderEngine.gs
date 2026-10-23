/* Pure validation and pricing shared by owner requests and manual orders. */
function mkPhone_(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.indexOf('0061') === 0) phone = phone.slice(2);
  if (/^04\d{8}$/.test(phone)) phone = '61' + phone.slice(1);
  if (!/^614\d{8}$/.test(phone)) throw new Error('Enter a valid Australian mobile number.');
  return phone;
}

function mkText_(value, name, maximum, required) {
  const text = String(value || '').trim();
  if ((required && !text) || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw new Error('Check ' + name + '.');
  return text;
}

function mkMoneyCents_(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error('Invalid ' + name + '.');
  return Math.round(number * 100);
}

function mkCustomerMatch_(customers, phone, customerId) {
  const canonical = mkPhone_(phone);
  const matches = customers.filter(customer => {
    try { return mkPhone_(customer.phone) === canonical; } catch (_) { return false; }
  });
  if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: resolve the matching customer records before continuing.');
  const customer = matches[0] || null;
  if (customerId && (!customer || customer.id !== customerId)) throw new Error('CUSTOMER_PHONE_MISMATCH: choose the customer matching the actual sender.');
  if (customer && !customerId) throw new Error('EXISTING_CUSTOMER: choose the saved customer rather than creating another record.');
  return customer;
}

function mkOwnerDetails_(input) {
  const result = {
    phone: mkPhone_(input.senderPhone), customerId: mkText_(input.customerId, 'customer ID', 100, false),
    name: mkText_(input.name, 'customer name', 150, true), street: mkText_(input.street, 'street address', 400, false),
    suburb: mkText_(input.suburb, 'suburb', 100, false), postcode: mkText_(input.postcode, 'postcode', 4, true),
    instructions: mkText_(input.instructions, 'delivery instructions', 500, false),
    consent: String(input.consent || 'KEEP'), updateDefault: input.updateDefault === true,
    discountReason: mkText_(input.discountReason, 'discount reason', 500, false),
    capacityReason: mkText_(input.capacityReason, 'capacity override reason', 500, false),
    lateReason: mkText_(input.lateReason, 'late order reason', 500, false),
    revisionReason: mkText_(input.revisionReason, 'request revision reason', 500, false)
  };
  if (!/^\d{4}$/.test(result.postcode)) throw new Error('Enter a four digit delivery postcode.');
  if (!['KEEP', 'YES', 'NO'].includes(result.consent)) throw new Error('Choose the feedback consent setting.');
  if (!result.customerId && result.consent === 'KEEP') throw new Error('Record the new customer’s explicit feedback consent choice.');
  result.address = mkText_(input.address || (result.street + (result.suburb ? ', ' + result.suburb : '')), 'delivery address', 600, true);
  if (result.address.length < 8) throw new Error('Enter the complete delivery address.');
  const trailingPostcode = result.address.match(/(?:\s|,)\s*(\d{4})$/);
  if (trailingPostcode && trailingPostcode[1] !== result.postcode) throw new Error('Address and postcode differ. Check both fields.');
  if (!trailingPostcode) result.address += ' ' + result.postcode;
  return result;
}

function mkQuote_(input, lines, rules, committed) {
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new Error('Select at least one dish.');
  const date = String(input.deliveryDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)
    throw new Error('Choose a valid delivery date.');
  const defaultDiscount = Number(rules.discountPercent);
  const discountPercent = input.discountPercent === '' || input.discountPercent === undefined ? defaultDiscount : Number(input.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 || Math.abs(Math.round(discountPercent * 100) - discountPercent * 100) > 0.00000001)
    throw new Error('Discount must be between 0 and 100 with up to two decimal places.');
  if (discountPercent !== defaultDiscount && !String(input.discountReason || '').trim()) throw new Error('Add a reason for the per order discount override.');
  const rawReduction = input.manualReduction === undefined || input.manualReduction === null || input.manualReduction === '' ? '0' : String(input.manualReduction).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawReduction)) throw new Error('Manual dollar reduction must be a nonnegative amount with at most two decimal places.');
  const manualReductionCents = Math.round(Number(rawReduction) * 100);
  if (!Number.isSafeInteger(manualReductionCents)) throw new Error('Invalid manual dollar reduction.');
  if (manualReductionCents > 0 && !String(input.manualReductionReason || '').trim()) throw new Error('Enter a reason for the manual dollar reduction.');
  const minimum = Number(rules.minimumOrderItems), seen = {}, selected = [];
  let totalQuantity = 0, listSubtotalCents = 0, foodSubtotalCents = 0, cookPayoutCents = 0;
  input.items.forEach(item => {
    if (!item || typeof item.menuLineId !== 'string' || seen[item.menuLineId] || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)
      throw new Error('Check dish selections and whole number quantities.');
    seen[item.menuLineId] = true;
    const matches = lines.filter(line => line.menuLineId === item.menuLineId && line.deliveryDate === date);
    if (matches.length !== 1) throw new Error('A selected menu line is missing or duplicated.');
    const line = matches[0];
    if (line.cycleId !== 'MENU-' + date || !line.itemCode || !line.cookId || !line.kitchenName || !line.dishName ||
        line.menuStatus !== 'Available' || line.dishStatus !== 'Active') throw new Error('A selected dish is no longer available.');
    if (!Number.isSafeInteger(line.priceCents) || line.priceCents <= 0 || !Number.isSafeInteger(line.cookPayCents) || line.cookPayCents < 0 ||
        !Number.isSafeInteger(line.capacity) || line.capacity < 0) throw new Error('Check the selected dish’s price, cook cost and capacity.');
    const used = Number(committed[line.menuLineId] || 0);
    const overCapacity = used + item.quantity > line.capacity;
    if (overCapacity && !String(input.capacityReason || '').trim()) throw new Error('CAPACITY_CHANGED: ' + line.dishName + ' has ' + Math.max(0, line.capacity - used) + ' servings remaining.');
    const discountBasisPoints = Math.round(discountPercent * 100);
    const unitPriceCents = Math.floor((line.priceCents * (10000 - discountBasisPoints) + 5000) / 10000);
    const priced = { menuLineId: line.menuLineId, itemCode: line.itemCode, cookId: line.cookId, kitchenName: line.kitchenName,
      dishName: line.dishName, quantity: item.quantity, listPriceCents: line.priceCents, cookPayCents: line.cookPayCents,
      unitPriceCents: unitPriceCents, lineTotalCents: unitPriceCents * item.quantity, overCapacity: overCapacity };
    selected.push(priced); totalQuantity += item.quantity;
    listSubtotalCents += line.priceCents * item.quantity; foodSubtotalCents += priced.lineTotalCents;
    cookPayoutCents += line.cookPayCents * item.quantity;
  });
  if (!Number.isSafeInteger(minimum) || minimum < 1 || totalQuantity < minimum) throw new Error('Minimum order is ' + minimum + ' servings.');
  selected.sort((a, b) => a.menuLineId.localeCompare(b.menuLineId));
  const standardDeliveryFeeCents = mkMoneyCents_(rules.deliveryFee, 'delivery fee');
  const thresholdCents = mkMoneyCents_(rules.freeDeliveryThreshold, 'free delivery threshold');
  const basis = String(rules.freeDeliveryBasis);
  if (!['Post-discount food value', 'Pre-discount food value'].includes(basis)) throw new Error('Unknown free delivery threshold basis.');
  const thresholdValue = basis === 'Post-discount food value' ? foodSubtotalCents : listSubtotalCents;
  const deliveryFeeCents = thresholdCents > 0 && thresholdValue >= thresholdCents ? 0 : standardDeliveryFeeCents;
  const payableBeforeReductionCents = foodSubtotalCents + deliveryFeeCents;
  if (manualReductionCents > payableBeforeReductionCents) throw new Error('Manual dollar reduction cannot exceed the payable bill.');
  return { manualReductionCents: manualReductionCents, manualReductionReason: mkText_(input.manualReductionReason, 'manual dollar reduction reason', 500, false), payableBeforeReductionCents: payableBeforeReductionCents, items: selected, totalQuantity: totalQuantity, listSubtotalCents: listSubtotalCents, foodSubtotalCents: foodSubtotalCents,
    cookPayoutCents: cookPayoutCents, deliveryFeeCents: deliveryFeeCents, totalCents: payableBeforeReductionCents - manualReductionCents,
    discountPercent: discountPercent, minimumOrderItems: minimum, standardDeliveryFeeCents: standardDeliveryFeeCents,
    freeDeliveryThresholdCents: thresholdCents, freeDeliveryBasis: basis };
}

function mkConfirmation_(review, orderId) {
  const money = cents => '$' + (cents / 100).toFixed(2);
  return ['Order received', '', 'Customer: ' + review.details.name, 'Order: ' + orderId, 'Delivery: ' + review.deliveryDate + ', ' + DELIVERY_WINDOW, '',
    ...review.quote.items.map(item => item.quantity + ' × ' + item.dishName + ': ' + money(item.lineTotalCents)), '',
    'Food subtotal: ' + money(review.quote.foodSubtotalCents), 'Delivery: ' + money(review.quote.deliveryFeeCents),
    ...(review.quote.manualReductionCents > 0 ? ['Manual reduction: -' + money(review.quote.manualReductionCents), 'Reduction reason: ' + review.quote.manualReductionReason] : []),
    'Total: ' + money(review.quote.totalCents), 'Address: ' + review.details.address,
    review.details.instructions ? 'Delivery instructions: ' + review.details.instructions : '', '',
    ...(review.quote.totalCents === 0 ? ['No payment required.'] : ['PayID: ' + PAYMENT_PAYID, 'Payment reference: ' + orderId,
    'Please send payment confirmation to Ma Kitchens on WhatsApp.'])].filter(line => line !== undefined).join('\n');
}
