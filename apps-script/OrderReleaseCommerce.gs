/* Compatibility for existing carts after schema migration. New owner orders
 * and existing WhatsApp carts share IDs, stock, frozen prices and the lock. */
function ownerOrderSaveCustomer(input,operationId) {
  mkReleaseNewOwnerWrite_();
  return mkReleaseSaveCustomerCore_(mkOwnerBook_(),input,operationId);
}
function mkReleaseCartCustomer_(recipient,cart) {
  const book=mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID),phone=mkPhone_(cart.orderCustomerPhone || recipient);
  mkReleaseAssertWriter_(book,'whatsapp',cart.orderOperationId);
  const customers=mkCustomers_(book,true),matches=customers.filter(customer=>{try{return mkPhone_(customer.phone)===phone;}catch(_){return false;}});
  if(matches.length>1)throw new Error('DUPLICATE_CUSTOMER_PHONE: resolve the matching customer records first.');
  const customer=matches[0] || null;
  const input={senderPhone:phone,customerId:customer?customer.id:'',name:cart.customerName,
    address:cart.deliveryAddress,postcode:cart.postcode || extractPostcode_(cart.deliveryAddress),
    consent:customer?'KEEP':'NO',updateDefault:false};
  if(!cart.customerOperationId){cart.customerOperationId=Utilities.getUuid();cart.customerOperationInput=input;saveCart_(recipient,cart);}
  const savedInput=cart.customerOperationInput;
  if(!savedInput || ['senderPhone','name','address','postcode'].some(key=>String(savedInput[key])!==String(input[key])))
    throw new Error('Customer details changed after a saved intake attempt. Reconcile that attempt before starting a new cart.');
  const result=mkReleaseSaveCustomerCore_(book,savedInput,cart.customerOperationId);
  if(result.status!=='READY')throw new Error(result.message || 'Customer recalculation is pending. Retry this saved cart.');
  return {customerId:result.customer.id,name:result.customer.name,phone:result.customer.phone,postcode:result.customer.postcode,
    rowNumber:result.customer.rowNumber,defaultDeliveryAddress:result.customer.address};
}
function calculateCartQuote_(cart, menu) {
  const quote = mkReleaseOriginalCartQuote_(cart,menu);
  if (!mkReleaseSchemaReady_()) return quote;
  const byCode = {};
  (menu.meals || []).forEach(meal => { byCode[String(meal.itemCode)] = meal; });
  const basisPoints = Math.round(quote.discountPercent * 100);
  let foodCents = 0;
  Object.keys(cart.items || {}).forEach(code => {
    const meal = byCode[code], quantity = Number(cart.items[code]);
    if (!meal || quantity <= 0) return;
    const listCents = mkMoneyCents_(meal.price,'menu price');
    foodCents += Math.floor((listCents * (10000 - basisPoints) + 5000) / 10000) * quantity;
  });
  quote.discountedSubtotal = foodCents / 100;
  quote.discount = roundMoney_(quote.listSubtotal - quote.discountedSubtotal);
  quote.freeDeliveryBasisAmount = quote.freeDeliveryBasis === 'Post-discount food value' ? quote.discountedSubtotal : quote.listSubtotal;
  quote.freeDelivery = quote.freeDeliveryThreshold > 0 && quote.freeDeliveryBasisAmount >= quote.freeDeliveryThreshold;
  quote.deliveryFee = quote.freeDelivery ? 0 : quote.standardDeliveryFee;
  quote.total = roundMoney_(quote.discountedSubtotal + quote.deliveryFee);
  return quote;
}
function mkReleaseCartPriced_(book, cart, menu, quote) {
  const rules = {discountPercent:quote.discountPercent,minimumOrderItems:quote.minimumOrderItems,deliveryFee:quote.standardDeliveryFee,
    freeDeliveryThreshold:quote.freeDeliveryThreshold,freeDeliveryBasis:quote.freeDeliveryBasis};
  const input = {deliveryDate:menu.deliveryDate,discountPercent:quote.discountPercent,
    items:Object.keys(cart.items).map(code => ({menuLineId:'ML-'+menu.deliveryDate.replace(/-/g,'')+'-'+code,quantity:Number(cart.items[code])}))};
  const priced = mkQuote_(input,mkMenuLines_(book,menu.deliveryDate),rules,mkCommitted_(book,menu.deliveryDate));
  if (priced.totalCents !== Math.round(quote.total*100)) throw new Error('Cart quote changed. Review the current total before placing.');
  return priced;
}
function mkReleaseCartPending_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_CART_PENDING');
  return raw ? JSON.parse(raw) : null;
}
function mkReleaseClearCartPending_(operation) {
  const pending = mkReleaseCartPending_();
  if (pending && pending.operation === operation) PropertiesService.getScriptProperties().deleteProperty('ORDER_AUTOMATION_CART_PENDING');
}
function mkReleaseCreateCartOrder_(recipient, cart, menu, customer, quote) {
  const book = mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID);
  mkReleaseAssertWriter_(book,'whatsapp',cart.orderOperationId);
  mkAssertOperationalLayout_(book);
  if (cart.orderOperationId) throw new Error('This cart already has an order attempt. Check the saved attempt before placing again.');
  const priced = mkReleaseCartPriced_(book,cart,menu,quote), orders = mkTable_(book,ORDERS_SHEET,true), items = mkTable_(book,ORDER_ITEMS_SHEET,true);
  const journal = mkTable_(book,MK_OWNER.journal,true), operation = 'WA-'+Utilities.getUuid(), now = new Date().toISOString();
  const orderRow = mkEmptyRows_(orders,1,[1,2,3,4,9,10,11,14,26,27,28,29,30,31,32,33,34,35,36,37],2,2000)[0];
  const itemRows = mkEmptyRows_(items,priced.items.length,[1,4,7,14,18,23,24,25,26,27,28,29,30],3,5000);
  const orderId = mkReleaseNextOrderId_(orders.sheet), journalRow = journal.sheet.getLastRow()+1;
  const details = {customerId:String(customer.customerId),name:String(cart.customerName || customer.name || ''),
    phone:mkPhone_(cart.orderCustomerPhone || customer.phone || recipient),address:String(cart.deliveryAddress || ''),
    postcode:String(cart.postcode || extractPostcode_(cart.deliveryAddress) || customer.postcode || '')};
  if (!details.customerId || !details.name || !details.address || !/^\d{4}$/.test(details.postcode)) throw new Error('Cart customer details need review.');
  const review = {deliveryDate:menu.deliveryDate,details:details,quote:priced};
  const detail = mkJson_({review:review,orderRow:orderRow,itemRows:itemRows,confirmation:mkConfirmation_(review,orderId)});
  const requests = mkSetColumns_(orders.sheet,orderRow,{1:orderId,2:mkSerial_(new Date()),3:mkDeliverySerial_(menu.deliveryDate),
    4:details.customerId,9:'Pending',10:'Payment Requested',11:DELIVERY_WINDOW,14:'WhatsApp order',
    26:priced.discountPercent,27:priced.standardDeliveryFeeCents/100,28:priced.freeDeliveryThresholdCents/100,29:priced.freeDeliveryBasis,
    30:priced.minimumOrderItems,31:details.address,32:details.name,33:details.phone,34:details.postcode,35:'',36:'',37:operation,38:0,39:''});
  priced.items.forEach((line,index) => requests.push(...mkSetColumns_(items.sheet,itemRows[index],{1:orderId,4:line.dishName,7:line.quantity,14:'Pending',18:operation,
    23:line.itemCode,24:line.listPriceCents/100,25:line.cookPayCents/100,26:line.cookId,27:line.kitchenName,28:line.menuLineId,29:line.unitPriceCents/100,30:line.lineTotalCents/100})));
  requests.push(...mkOwnerRowFormulaRequests_(orders.sheet,orderRow,items.sheet,itemRows));
  requests.push(orderRequestUpdateCells_(journal.sheet,journalRow-1,[[operation,'',orderId,'RECORDED',now,now,detail]],7));
  // A private reservation remains even if the first API response is lost.
  // Other writers stop until an owner reconciles it. Issued IDs are not reused.
  PropertiesService.getScriptProperties().setProperty('ORDER_AUTOMATION_CART_PENDING',JSON.stringify({operation:operation,orderId:orderId,startedAt:now,recipient:String(recipient)}));
  cart.orderOperationId = operation; saveCart_(recipient,cart);
  try {
    mkReleaseBatch_({requests:[orderRequestUpdateCells_(journal.sheet,journalRow-1,[[operation,'',orderId,'COMMITTING',now,now,detail]],7)]},book.getId());
    mkReleaseBatch_({requests:requests},book.getId());
  } catch (_) { throw new Error('SUBMISSION_UNCERTAIN: the saved cart identity must be reconciled before another order attempt.'); }
  return mkReleaseReconcileCart_(book,operation);
}
function mkReleaseReconcileCart_(book,operation) {
  const journal = mkTable_(book,MK_OWNER.journal,true), saved = mkUnique_(journal,0,operation);
  if (!saved) throw new Error('SUBMISSION_UNCERTAIN: no journal acknowledgement yet. Ask the owner to check the saved cart operation.');
  const detail = JSON.parse(saved.row[6]), expected = detail.review, orderId = String(saved.row[2]);
  const orders = mkTable_(book,ORDERS_SHEET,true), found = mkUnique_(orders,0,orderId);
  let lines = mkTable_(book,ORDER_ITEMS_SHEET,true).rows.filter(row => String(row[0]) === orderId);
  if (!found) {
    if (lines.length) throw new Error('RECONCILIATION_REQUIRED: cart items exist without the matching order.');
    throw new Error('SUBMISSION_UNCERTAIN: no complete cart order is visible. Ask the owner to check it.');
  }
  let current = found.row;
  for (let attempt=0;attempt<8;attempt++) {
    SpreadsheetApp.flush(); current = mkOwnerFreshValues_(book,orders.sheet,found.number,1,37)[0] || [];
    if (String(current[23]) === 'OK') break;
    Utilities.sleep(200);
  }
  lines = mkTable_(book,ORDER_ITEMS_SHEET,true).rows.filter(row => String(row[0]) === orderId);
  const okay = String(current[36]) === operation && mkReleaseDeliveryDate_(current[2]) === expected.deliveryDate &&
    mkReleasePricingMatches_(current,expected.quote) && String(current[8]) !== 'Cancelled' && String(current[23]) === 'OK' && String(current[22]) === 'OK' &&
    String(current[3]) === expected.details.customerId && String(current[4]) === expected.details.name && String(current[5]) === expected.details.phone &&
    String(current[6]) === expected.details.address && String(current[7]) === expected.details.postcode &&
    Math.round(Number(current[11])*100) === expected.quote.totalCents && Math.round(Number(current[17])*100) === expected.quote.cookPayoutCents &&
    Number(current[19]) === expected.quote.totalQuantity && lines.length === expected.quote.items.length && expected.quote.items.every(line => lines.some(row =>
      String(row[27]) === line.menuLineId && String(row[22]) === line.itemCode && String(row[25]) === line.cookId && String(row[26]) === line.kitchenName && String(row[3]) === line.dishName &&
      Number(row[6]) === line.quantity && Math.round(Number(row[23])*100) === line.listPriceCents && Math.round(Number(row[24])*100) === line.cookPayCents &&
      Math.round(Number(row[28])*100) === line.unitPriceCents && Math.round(Number(row[29])*100) === line.lineTotalCents &&
      String(row[4]) === line.itemCode && String(row[5]) === line.cookId && Math.round(Number(row[8])*100) === line.listPriceCents &&
      Math.round(Number(row[9])*100) === line.unitPriceCents && Math.round(Number(row[10])*100) === line.cookPayCents &&
      Math.round(Number(row[11])*100) === line.lineTotalCents && Math.round(Number(row[12])*100) === line.cookPayCents*line.quantity));
  if (!okay) throw new Error('RECONCILIATION_REQUIRED: cart order is recorded but formula or snapshot checks need review. Do not recreate it.');
  mkReleaseBatch_({requests:mkSetColumns_(journal.sheet,saved.number,{4:'VERIFIED',6:new Date().toISOString()})},book.getId());
  mkReleaseClearCartPending_(operation);
  return {orderId:orderId,orderRow:found.number,orderCheck:'OK',capacityControl:'OK',confirmation:detail.confirmation};
}
function mkReleaseDeliveryDate_(value) {
  if(typeof value==='number' && Number.isFinite(value)) return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  return mkDate_(value);
}
function mkReleasePricingMatches_(row,quote) {
  return Number(row[25])===quote.discountPercent && Math.round(Number(row[26])*100)===quote.standardDeliveryFeeCents &&
    Math.round(Number(row[27])*100)===quote.freeDeliveryThresholdCents && String(row[28])===quote.freeDeliveryBasis && Number(row[29])===quote.minimumOrderItems;
}
function mkReleaseResumeCart_(recipient) {
  if (!mkReleaseSchemaReady_()) return false;
  let result = null, handled = false;
  mkLocked_(() => {
    const cart = getCart_(recipient);
    if (!cart || !cart.orderOperationId) return;
    const book = mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID), journal = mkTable_(book,MK_OWNER.journal,true), found = mkUnique_(journal,0,cart.orderOperationId);
    if (found && found.row[3] === 'NOT_RECORDED') {
      delete cart.orderOperationId; saveCart_(recipient,cart); return;
    }
    result = mkReleaseReconcileCart_(book,cart.orderOperationId);
    clearCart_(recipient); handled = true;
  });
  if (handled) sendTextMessage_(recipient,result.confirmation);
  return handled;
}
function reconcileLegacyCartOrders() {
  const book = mkReleaseOwnerBook_(false);
  return mkLocked_(() => {
    if (!mkReleaseSchemaReady_()) throw new Error('Migration is not complete.');
    const pending = mkReleaseCartPending_();
    if (!pending) return {ok:true,pending:false,messagesSent:0};
    const journal = mkTable_(book,MK_OWNER.journal,true), saved = mkUnique_(journal,0,pending.operation);
    const orders = mkTable_(book,ORDERS_SHEET,true), items = mkTable_(book,ORDER_ITEMS_SHEET,true);
    const found = orders.rows.some(row => row[0] === pending.orderId || row[36] === pending.operation) ||
      items.rows.some(row => row[0] === pending.orderId || row[17] === pending.operation);
    if (found) {
      const result = mkReleaseReconcileCart_(book,pending.operation);
      return {ok:true,pending:false,orderId:result.orderId,state:'VERIFIED',messagesSent:0};
    }
    if (!Number.isFinite(Date.parse(pending.startedAt)) || Date.now()-Date.parse(pending.startedAt)<420000)
      throw new Error('Wait seven minutes after the cart attempt, then reconcile again.');
    if (saved) mkReleaseBatch_({requests:mkSetColumns_(journal.sheet,saved.number,{4:'NOT_RECORDED',6:new Date().toISOString()})},book.getId());
    const cart = getCart_(pending.recipient);
    if (cart && cart.orderOperationId === pending.operation) {delete cart.orderOperationId;saveCart_(pending.recipient,cart);}
    mkReleaseClearCartPending_(pending.operation);
    return {ok:true,pending:false,orderId:pending.orderId,state:'NOT_RECORDED',messagesSent:0};
  });
}

/* Keep the existing schema-1 website publisher usable before migration. */
function mkReleasePublishLegacyMenu_(withdrawn) {
  mkOrderPublishOwner_(); mkReleaseExternal_();
  return mkLocked_(() => {
    const snapshot = withdrawn ? {schemaVersion:1,withdrawn:true,publishedAt:new Date().toISOString()} : mkOrderSnapshot_(buildActiveMenu_(),new Date());
    if (!withdrawn) {
      snapshot.schemaVersion=1; delete snapshot.menuRevision; delete snapshot.minimumOrderItems; delete snapshot.deliveryFeeCents;
      snapshot.meals=snapshot.meals.map(meal => {const value=Object.assign({},meal);delete value.id;return value;});
    }
    const props=PropertiesService.getScriptProperties(), token=props.getProperty('ORDER_MENU_GITHUB_TOKEN');
    if(!token || /[\r\n]/.test(token)) throw new Error('SET_ORDER_MENU_GITHUB_TOKEN_PRIVATELY');
    const branch=props.getProperty('ORDER_MENU_GITHUB_BRANCH') || 'main';
    if(!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,150}$/.test(branch) || branch.includes('..')) throw new Error('INVALID_PUBLISH_BRANCH');
    const api='https://api.github.com/repos/'+MK_ORDER_PUBLISH.repository+'/contents/'+MK_ORDER_PUBLISH.path;
    const current=mkOrderGithub_('get',api+'?ref='+encodeURIComponent(branch),token);
    if(!current || current.type!=='file' || !/^[a-f0-9]{40}$/.test(current.sha)) throw new Error('PUBLISH_FILE_NOT_READY');
    let old=null;
    if(current.encoding==='base64' && typeof current.content==='string') {
      try {old=JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.content.replace(/\s/g,''))).getDataAsString());} catch(_) {}
    }
    const stable=value=>{const result=Object.assign({},value);delete result.publishedAt;return result;};
    if(old && JSON.stringify(stable(old))===JSON.stringify(stable(snapshot))) return {changed:false,branch:branch,menuCycleId:snapshot.menuCycleId||'',note:'Identical menu already committed. Check website deployment status.'};
    const response=mkOrderGithub_('put',api,token,{branch:branch,sha:current.sha,message:withdrawn?'Withdraw published WhatsApp ordering menu':'Publish WhatsApp ordering menu '+snapshot.deliveryDate,
      content:Utilities.base64Encode(JSON.stringify(snapshot,null,2)+'\n',Utilities.Charset.UTF_8)});
    if(!response.commit || typeof response.commit.sha!=='string') throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB');
    return {changed:true,branch:branch,menuCycleId:snapshot.menuCycleId||'',commit:response.commit.sha,note:'Committed. Verify the website deployment.'};
  });
}
