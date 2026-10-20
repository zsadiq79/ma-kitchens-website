const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,date,lineId,testBookId}=require('./helpers/order-fixture.cjs');
test('Integrated project creates and deduplicates owner orders using original Menu Config parser',()=>{
  const f=fixture({integrated:true}), input=f.input();
  const review=f.ctx.ownerOrderReview(input);
  const result=f.ctx.ownerOrderAccept(review.id,review.hash);
  assert.equal(result.orderId,'ORD-000001');
  assert.equal(f.tables.Orders[1][11],70);
  assert.equal(f.tables['Order Items'][2][24],8);
  assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).orderId,result.orderId);
  assert.equal(f.tables.Orders.filter(row=>String(row[0]).startsWith('ORD-')).length,1);
});

test('Integrated legacy writer refuses a pending new-workspace commit and reserves its ID',()=>{
  const f=fixture({integrated:true});
  f.add('Order Operation Journal',['OP','REV','ORD-000009','COMMITTING']);
  assert.throws(()=>f.ctx.mkIntegrationAssertNoPending_(f.book,'legacy'),/Reconcile/);
  assert.throws(()=>f.ctx.mkIntegrationAssertNoPending_(f.book,'whatsapp'),/Reconcile/);
  assert.equal(f.ctx.nextOrderId_(f.sheets.Orders),'ORD-000010');
});

test('Integrated owner writer refuses a pending legacy submission and reserves its ID',()=>{
  const f=fixture({integrated:true}), review=f.ctx.ownerOrderReview(f.input());
  f.sheets['Order Entry']={getRange:cell=>({getDisplayValue:()=>cell==='K3'?'COMMITTING':cell==='K6'?'ORD-000012':''})};
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/Reconcile the legacy/);
  assert.equal(f.ctx.nextOrderId_(f.sheets.Orders),'ORD-000013');
  assert.equal(f.tables.Orders.length,1);
});

test('Integrated legacy snapshots freeze prices, costs, identity and alternate delivery postcode',()=>{
  const f=fixture({integrated:true}), cart={items:{M0001:5},deliveryAddress:'5 Alternate Road, Test 2200',postcode:'2200'};
  const menu={deliveryDate:date}, customer={name:'Test Person',phone:'+61400000001'};
  const quote={discountPercent:20,minimumOrderItems:5,standardDeliveryFee:10,freeDeliveryThreshold:0,freeDeliveryBasis:'Pre-discount food value',total:70};
  const requests=f.ctx.mkIntegrationLegacySnapshots_(f.book,cart,menu,customer,quote,2,[3],'OE-test');
  f.ctx.mkIntegrationBatch_({requests},testBookId);
  assert.equal(f.tables.Orders[1][30],cart.deliveryAddress);
  assert.equal(f.tables.Orders[1][33],'2200');
  assert.equal(f.tables['Order Items'][2][23],15);
  assert.equal(f.tables['Order Items'][2][24],8);
  assert.equal(f.tables['Order Items'][2][27],lineId);
  assert.equal(f.tables['Order Items'][2][28],12);
  assert.equal(f.tables['Order Items'][2][29],60);
  quote.total=71;
  assert.throws(()=>f.ctx.mkIntegrationLegacySnapshots_(f.book,cart,menu,customer,quote,2,[3],'OE-test'),/rounding differs/);
});

test('Original packing data collector receives accepted owner orders only after confirmation and excludes cancelled items',()=>{
  const f=fixture({integrated:true}), review=f.ctx.ownerOrderReview(f.input());
  f.ctx.ownerOrderAccept(review.id,review.hash);
  f.ctx.getSelectedPackingSlipDate_=()=>new f.ctx.Date(date+'T00:00:00Z');
  f.tables.Orders[1][2]=date;
  assert.equal(f.ctx.collectPackingSlipData_().length,0);
  f.tables.Orders[1][8]='Confirmed';
  let slips=f.ctx.collectPackingSlipData_();
  assert.equal(slips.length,1);assert.equal(slips[0].firstName,'Test');assert.equal(slips[0].totalPacks,5);
  assert.equal(slips[0].items[0].dishName,'Test Dish');
  f.tables['Order Items'][2][13]='Cancelled';
  slips=f.ctx.collectPackingSlipData_();assert.equal(slips.length,0);
  f.tables.Orders[1][8]='Cancelled';assert.equal(f.ctx.collectPackingSlipData_().length,0);
});

test('Phone matching canonicalises Australian mobile formats and refuses duplicate or mismatched customers',()=>{
  const f=fixture();for(const value of ['0400 000 001','+61 400 000 001','0061400000001'])assert.equal(f.ctx.mkPhone_(value),'61400000001');
  assert.equal(f.ctx.ownerOrderLookupCustomer('0400000001').status,'MATCH');
  assert.throws(()=>f.ctx.mkCustomerMatch_([{id:'one',phone:'0400000001'},{id:'two',phone:'+61400000001'}],'0400000001','one'),/DUPLICATE/);
  assert.throws(()=>f.ctx.ownerOrderReview(f.input({customerId:'CUST-OTHER'})),/MISMATCH/);
});

test('Manual order uses default discount, five servings and one delivery fee, then commits only once',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input());
  assert.equal(review.review.quote.totalQuantity,5);assert.equal(review.review.quote.totalCents,7000);assert.equal(review.review.quote.cookPayoutCents,4000);
  const result=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(result.state,'VERIFIED');assert.equal(f.tables.Orders.length,2);
  assert.equal(f.tables.Orders[1][8],'Pending');assert.equal(f.tables.Orders[1][9],'Payment Requested');assert.equal(f.tables.Orders[1][33],'2190');
  assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).orderId,result.orderId);assert.equal(f.tables.Orders.length,2);
  assert.match(result.confirmation,new RegExp(result.orderId));assert.match(result.confirmation,/PayID/);
  assert.equal(f.tables['Order Items'][2][23],15);assert.equal(f.tables['Order Items'][2][24],8);assert.equal(f.tables['Order Items'][2][25],'COOK-1');
});

test('Two reviews of the same manual draft cannot create two orders',()=>{
  const f=fixture(),input=f.input(),one=f.ctx.ownerOrderReview(input),two=f.ctx.ownerOrderReview(input);
  const saved=f.ctx.ownerOrderAccept(one.id,one.hash);assert.equal(f.ctx.ownerOrderAccept(two.id,two.hash).orderId,saved.orderId);assert.equal(f.tables.Orders.length,2);
});

test('Owner review assigns a real customer and acceptance atomically links the saved request',()=>{
  const f=fixture(),request=f.request(),review=f.ctx.ownerOrderReview(f.input({requestReference:'MK-1234ABCD'}));
  assert.equal(request[8],'UNDER_REVIEW');assert.equal(request[9],'CUST-000001');
  const saved=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(saved.state,'VERIFIED');
  assert.equal(f.tables['Order Requests'][1][8],'ACCEPTED');assert.equal(f.tables['Order Requests'][1][14],saved.orderId);
  assert.equal(f.tables['Order Request Events'].at(-1)[3],'REQUEST_ACCEPTED');
  assert.throws(()=>f.ctx.orderRequestReject('MK-1234ABCD','No longer needed'),/current state/);
});

test('Changed WhatsApp selections need an audit reason and changed price invalidates a saved review',()=>{
  const f=fixture();f.request();
  const input=f.input({requestReference:'MK-1234ABCD',items:[{menuLineId:lineId,quantity:6}]});
  assert.throws(()=>f.ctx.ownerOrderReview(input),/reason/);input.revisionReason='Sender requested six in WhatsApp';
  const review=f.ctx.ownerOrderReview(input);f.tables['Weekly Menu'][1][7]=16;
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/REVIEW_CHANGED/);assert.equal(f.tables.Orders.length,1);
});

test('Availability is recomputed from noncancelled operational rows under acceptance lock',()=>{
  const f=fixture();f.tables['Weekly Menu'][1][8]=5;const review=f.ctx.ownerOrderReview(f.input());
  const order=Array(37).fill('');Object.assign(order,{0:'ORD-000001',2:date,8:'Pending'});f.add('Orders',order);
  const item=Array(30).fill('');Object.assign(item,{0:'ORD-000001',1:date,4:'M0001',6:1,13:'Pending',22:'M0001'});f.add('Order Items',item);
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/CAPACITY_CHANGED/);
  item[13]='Cancelled';assert.equal(f.ctx.mkCommitted_(f.book,date)[lineId],undefined);
});

test('Timeout after atomic write recovers the same order without another operational write',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input());f.state.throwAfter=true;
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/SUBMISSION_UNCERTAIN/);
  const result=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(result.state,'VERIFIED');assert.equal(f.tables.Orders.length,2);
});

test('Timeout before atomic write keeps its planned identity and blocks another order until reconciliation',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input());f.state.throwBefore=true;
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/SUBMISSION_UNCERTAIN/);
  assert.equal(f.ctx.ownerOrderCheck(review.id).state,'UNCERTAIN');
  const other=f.ctx.ownerOrderReview(f.input());assert.throws(()=>f.ctx.ownerOrderAccept(other.id,other.hash),/outstanding uncertain/);
  f.state.now+=421000;assert.equal(f.ctx.ownerOrderRecover(review.id).state,'NOT_RECORDED');
  const next=f.ctx.ownerOrderAccept(other.id,other.hash);assert.equal(next.orderId,'ORD-000002');assert.equal(f.tables.Orders.length,2);
});

test('Formula failure retains the order and withholds confirmation without creating a duplicate',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input());f.state.formulaFail=true;
  const result=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(result.state,'REVIEW_REQUIRED');assert.equal(result.confirmation,'');
  assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).state,'REVIEW_REQUIRED');assert.equal(f.tables.Orders.length,2);
  f.state.formulaFail=false;assert.equal(f.ctx.ownerOrderCheck(review.id).state,'VERIFIED');
});

test('A pre cutoff request may be accepted after cutoff while manual late orders require an explicit reason',()=>{
  const f=fixture();f.request();f.state.now=Date.parse('2026-10-21T12:00:00Z');
  assert.doesNotThrow(()=>f.ctx.ownerOrderReview(f.input({requestReference:'MK-1234ABCD'})));
  assert.throws(()=>f.ctx.ownerOrderReview(f.input()),/late order reason/);
  assert.doesNotThrow(()=>f.ctx.ownerOrderReview(f.input({lateReason:'Owner approved late manual request'})));
});

test('Per order discount, alternate postcode and snapshot rounding are reviewed independently of global rules',()=>{
  const f=fixture();assert.throws(()=>f.ctx.ownerOrderReview(f.input({discountPercent:10})),/reason/);
  const review=f.ctx.ownerOrderReview(f.input({discountPercent:10,discountReason:'Owner approved',postcode:'2200',address:'2 Test Road, Bankstown 2200'}));
  assert.equal(review.review.quote.totalCents,7750);const saved=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(saved.state,'VERIFIED');
  assert.equal(f.tables.Orders[1][33],'2200');assert.equal(f.tables.Customers[1][4],'2190');assert.equal(f.ctx.getOrderingRules_().discountPercent,20);
});

test('New customer creation uses intake, preserves IDs and retries after pending recalculation',()=>{
  const f=fixture(),operation=crypto.randomUUID(),input=f.input({customerId:'',senderPhone:'0400000002',name:'New Test Person',consent:'NO'});
  f.state.customerPending=true;assert.equal(f.ctx.ownerOrderSaveCustomer(input,operation).status,'PENDING');
  assert.equal(f.tables['Customer Intake'].length,3);assert.equal(f.tables.Orders.length,1);
  f.state.customerPending=false;const result=f.ctx.ownerOrderSaveCustomer(input,operation);assert.equal(result.status,'READY');assert.equal(result.customer.id,'CUST-000002');
  assert.equal(f.ctx.ownerOrderSaveCustomer(input,operation).customer.id,result.customer.id);assert.equal(f.tables['Customer Intake'].length,3);
  assert.equal(f.tables.Customers[1][0],'CUST-000001');assert.equal(f.tables.Customers[1][2],'+61400000001');
});

test('Registry renumbering blocks customer completion and no operational order is created',()=>{
  const f=fixture();f.state.shiftIds=true;
  assert.throws(()=>f.ctx.ownerOrderSaveCustomer(f.input({customerId:'',senderPhone:'0400000002',name:'New Test Person',consent:'NO'}),crypto.randomUUID()),/CUSTOMER_ID_REVIEW_REQUIRED/);
  assert.equal(f.tables.Orders.length,1);
});

test('Missing formula coverage fails before committing and owner identity uses active user',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input());f.formulas.Orders['2:16']='';
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/formula coverage/);assert.equal(f.tables.Orders.length,1);
  f.state.owner='';assert.throws(()=>f.ctx.ownerOrderBootstrap(),/OWNER_REQUIRED/);
  f.state.owner='another@example.test';assert.throws(()=>f.ctx.ownerOrderBootstrap(),/OWNER_REQUIRED/);
});

test('Manual confirmation send marker never sends a message or creates an order',()=>{
  const f=fixture(),review=f.ctx.ownerOrderReview(f.input()),saved=f.ctx.ownerOrderAccept(review.id,review.hash);
  assert.equal(saved.state,'VERIFIED');assert.match(f.ctx.ownerOrderMarkManualSend(review.id).message,/not a provider/);
  assert.equal(f.ctx.ownerOrderMarkManualSend(review.id).ok,true);assert.equal(f.tables.Orders.length,2);
  assert.equal(f.ctx.UrlFetchApp,undefined);
});

test('Fractional discounts use integer basis points and round the unit price before multiplying',()=>{
  const f=fixture();f.tables['Weekly Menu'][1][7]=13.01;
  const review=f.ctx.ownerOrderReview(f.input({discountPercent:1.1,discountReason:'Reviewed special price'}));
  assert.equal(review.review.quote.items[0].unitPriceCents,1287);assert.equal(review.review.quote.foodSubtotalCents,6435);
});

test('An explicit over capacity override remains flagged and withholds the confirmation',()=>{
  const f=fixture();f.tables['Weekly Menu'][1][8]=4;
  const review=f.ctx.ownerOrderReview(f.input({capacityReason:'Cook agreed to one extra serving'}));
  assert.equal(review.review.quote.items[0].overCapacity,true);
  const result=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(result.state,'REVIEW_REQUIRED');assert.equal(result.confirmation,'');
});

test('Expired requests do not cancel accepted orders',()=>{
  const f=fixture();f.request();const review=f.ctx.ownerOrderReview(f.input({requestReference:'MK-1234ABCD'}));f.ctx.ownerOrderAccept(review.id,review.hash);
  f.state.now=Date.parse('2026-10-23T00:00:00Z');assert.throws(()=>f.ctx.ownerOrderExpire('MK-1234ABCD'),/Only an unaccepted/);assert.equal(f.tables.Orders[1][8],'Pending');
  const other=fixture();other.request();other.state.now=f.state.now;assert.equal(other.ctx.ownerOrderExpire('MK-1234ABCD').ok,true);assert.equal(other.tables['Order Requests'][1][8],'EXPIRED');assert.equal(other.tables.Orders.length,1);
});

test('A changed sender invalidates the review and ordinary rejected requests create no order',()=>{
  const f=fixture();f.request();const review=f.ctx.ownerOrderReview(f.input({requestReference:'MK-1234ABCD'}));
  f.ctx.orderRequestMarkReceived('MK-1234ABCD','0400000002','Corrected actual sender');
  assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/sender/);assert.equal(f.tables.Orders.length,1);
  assert.equal(f.ctx.orderRequestReject('MK-1234ABCD','Owner declined').ok,true);assert.equal(f.tables['Order Requests'][1][8],'REJECTED');
});

test('Free delivery threshold uses its saved basis and row limits stop acceptance before a write',()=>{
  const f=fixture();f.ctx.getOrderingRules_=()=>({discountPercent:20,minimumOrderItems:5,deliveryFee:10,freeDeliveryThreshold:70,freeDeliveryBasis:'Pre-discount food value'});
  const review=f.ctx.ownerOrderReview(f.input());assert.equal(review.review.quote.deliveryFeeCents,0);assert.equal(review.review.quote.totalCents,6000);
  f.sheets.Orders.getMaxRows=()=>1;assert.throws(()=>f.ctx.ownerOrderAccept(review.id,review.hash),/formula range is full/);assert.equal(f.tables.Orders.length,1);
});
