const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const testBookId = '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs';
const date = '2026-10-22', lineId = 'ML-20261022-M0001';
const copy = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = { now: Date.parse('2026-10-18T00:00:00Z'), owner: 'owner@example.test', env: 'TEST',
    formulaFail: false, throwBefore: false, throwAfter: false, customerPending: false, shiftIds: false, writes: [], batches: 0 };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const tables = {}, sheets = {}, formulas = {};
  const headers = {
    Orders: ['Order ID','Order Date','Delivery Date','Customer ID','Customer Name','Phone','Delivery Address','Postcode','Order Status','Payment Status','Delivery Window','Order Total','Delivery Status','Notes','Items Subtotal','Delivery Fee','Free Delivery Discount (AUTO)','Cook Payout','Contribution Before Delivery Cost','Total Qty','Discounted Qty (AUTO)','Order Rules Control','Capacity Control','Order Check','Ready to Confirm?','Pricing Discount % (SNAPSHOT)','Pricing Delivery Fee (SNAPSHOT)','Free Delivery Threshold (SNAPSHOT)','Free Delivery Basis (SNAPSHOT)','Minimum Order Items (SNAPSHOT)','Delivery Address (SNAPSHOT)','Customer Name (SNAPSHOT)','Phone (SNAPSHOT)','Postcode (SNAPSHOT)','Delivery Instructions (SNAPSHOT)','Request Reference (SNAPSHOT)','Owner Operation ID'],
    'Order Items': ['Order ID','Delivery Date','Order Status','Dish Name','Item Code (AUTO, INTERNAL)','Cook ID','Qty','Price Treatment (AUTO)','List Price','Customer Unit Price','Cook Pay / Unit','Line Total','Cook Payout','Fulfilment Status','Ordered Qty / Cycle','Available Servings / Cycle','Capacity Check','Notes','Offer Eligible (AUTO)','Free Promo Qty (LEGACY)','Discounted Qty (AUTO)','Full Price Qty (LEGACY)','Item Code (SNAPSHOT)','List Price (SNAPSHOT)','Cook Pay (SNAPSHOT)','Cook ID (SNAPSHOT)','Kitchen Name (SNAPSHOT)','Menu Line ID (SNAPSHOT)','Customer Unit Price (SNAPSHOT)','Line Total (SNAPSHOT)'],
    Customers: ['Customer ID','Name','Phone','Area / Suburb','Postcode','Food Preference','Order Frequency','Price Sensitivity','Intent','WhatsApp Opt-In',...Array(19).fill(''), 'Default Delivery Address'],
    'Customer Intake': ['Submission ID','Respondent ID','Submitted at','First name','Mobile number','Suburb or postcode','','','WhatsApp Contact (Yes, Ma Kitchens can contact me on WhatsApp about my free meal claim and order)',...Array(10).fill('')],
    'Weekly Menu': ['Menu Line ID','Menu Cycle ID','Delivery Date','Item Code','Dish Name','Cook ID','Menu Kitchen Name','Customer Price','Available Servings','Menu Status','Menu Card Readiness','Availability Status','Cook Section Order','Dish Display Order','Image URL'],
    Dishes: ['Item Code','Cook Pay / Serving','Status'],
  };
  const ctx = { Date: Clock, Object, Array, Number, String, Math, JSON, RegExp, isNaN,
    CONTROL_TOWER_SPREADSHEET_ID: testBookId, CUSTOMERS_SHEET:'Customers', CUSTOMER_INTAKE_SHEET:'Customer Intake',
    WEEKLY_MENU_SHEET:'Weekly Menu', DISHES_SHEET:'Dishes', ORDERS_SHEET:'Orders', ORDER_ITEMS_SHEET:'Order Items',
    DELIVERY_WINDOW:'4–10 PM', PAYMENT_PAYID:'0420 246 023',
    Session: {getActiveUser:()=>({getEmail:()=>state.owner}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='ORDER_AUTOMATION_ENV'?state.env:null})},
    LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},sleep(){},
      computeDigest:(_,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],
      formatDate:(value,zone,pattern)=>{
        if(pattern==='yyyy-MM-dd-HH-mm-ss')return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(value).replace(', ','-').replace(/:/g,'-');
        return new Intl.DateTimeFormat(pattern==='HH'?'en-GB':'en-CA',pattern==='HH'?{timeZone:zone,hour:'2-digit',hourCycle:'h23'}:{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
      }},
    getOrderingRules_:()=>({discountPercent:20,minimumOrderItems:5,deliveryFee:10,freeDeliveryThreshold:0,freeDeliveryBasis:'Pre-discount food value'}),
    SpreadsheetApp:{openById:()=>book,flush:()=>recalculate()},
    Sheets:{Spreadsheets:{batchUpdate:request=>apply(request.requests)}},
  };
  vm.createContext(ctx);
  for(const name of ['OrderEngine.gs','OrderRequests.gs','OwnerOrders.gs','OwnerCustomers.gs','OwnerOrderSetup.gs'])
    vm.runInContext(fs.readFileSync(path.join(root,'apps-script',name),'utf8'),ctx);
  const schemas=vm.runInContext('Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS)',ctx);
  Object.assign(headers,copy(schemas));
  let nextSheetId=1;
  for(const [name,columns]of Object.entries(headers)){
    tables[name]=[columns.slice()];formulas[name]={};
    const id=nextSheetId++;
    sheets[name]={getSheetId:()=>id,getMaxRows:()=>name==='Orders'?2000:name==='Order Items'?5000:2000,getMaxColumns:()=>columns.length,
      getLastRow:()=>tables[name].length,getDataRange:()=>({getValues:()=>copy(tables[name]),getDisplayValues:()=>copy(tables[name])}),
      getRange:(row,col,height=1,width=1)=>({getRow:()=>row,getColumn:()=>col,
        getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>tables[name][row+i-1]?.[col+j-1]??'')),
        getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(tables[name][row+i-1]?.[col+j-1]??''))),
        getFormula:()=>formulas[name][row+':'+col]??(name==='Orders'&&[16,17,20,21,22].includes(col)||name==='Order Items'&&[8,10,12,13,19,20,21,22].includes(col)?'=0':'')})};
  }
  const book={getId:()=>testBookId,getOwner:()=>({getEmail:()=> 'owner@example.test'}),getSheetByName:name=>sheets[name]||null};
  function add(name,values){tables[name].push(values);return values}
  const customer=Array(30).fill('');Object.assign(customer,{0:'CUST-000001',1:'Test Person',2:'+61400000001',3:'Greenacre',4:'2190',9:'N',29:'1 Test Street, Greenacre 2190'});add('Customers',customer);
  const intake=Array(19).fill('');Object.assign(intake,{0:'intake-1',2:'2026-09-01T00:00:00Z',3:'Test Person',4:'+61400000001',5:'2190',8:false});add('Customer Intake',intake);
  add('Weekly Menu',[lineId,'MENU-'+date,date,'M0001','Test Dish','COOK-1','Test Kitchen',15,50,'Available','READY','Available',1,1,'']);
  add('Dishes',['M0001',8,'Active']);
  // Row 2 in Order Items contains the array anchors and is not used for inputs.
  add('Order Items',Array(30).fill(''));
  function recalculate(){
    if(!state.customerPending){
      for(const row of tables['Customer Intake'].slice(1)){
        let target=tables.Customers.slice(1).find(c=>c[2]===row[4]);
        if(!target){target=Array(30).fill('');target[0]='CUST-'+String(tables.Customers.length).padStart(6,'0');target[2]=row[4];add('Customers',target)}
        target[1]=row[3];target[3]=row[5];target[4]=row[5];target[9]=row[8]?'Y':'N';
      }
      if(state.shiftIds&&tables.Customers[1])tables.Customers[1][0]='CUST-999999';
    }
    for(const order of tables.Orders.slice(1)){
      if(!order[0])continue;let total=0,payout=0,qty=0;
      for(const item of tables['Order Items'].slice(1).filter(row=>row[0]===order[0])){
        item[1]=date;item[2]=order[8];item[4]=item[22];item[5]=item[25];item[8]=item[23];item[9]=item[28];item[10]=item[24];
        item[11]=item[29];item[12]=item[24]*item[6];total+=item[11];payout+=item[12];qty+=item[6];
      }
      order[4]=order[31];order[5]=order[32];order[6]=order[30];order[7]=order[33];order[11]=total+order[26];order[17]=payout;order[19]=qty;
      const used=tables['Order Items'].slice(1).filter(row=>row[0]&&row[13]!=='Cancelled').reduce((sum,row)=>sum+Number(row[6]||0),0);
      order[22]=used>tables['Weekly Menu'][1][8]?'REVIEW':'OK';order[23]=state.formulaFail?'REVIEW':'OK';
    }
  }
  function apply(requests){
    const operational=requests.some(request=>{const u=request.updateCells;return u&&(u.range?.sheetId||u.start?.sheetId)===sheets.Orders.getSheetId()});
    state.batches++;
    if(operational&&state.throwBefore){state.throwBefore=false;throw new Error('Timeout before commit')}
    for(const request of requests){
      const u=request.updateCells;if(!u)throw new Error('Unsupported mock request');
      const range=u.range||u.start,id=range.sheetId,rowIndex=range.rowIndex??range.startRowIndex,colIndex=range.columnIndex??range.startColumnIndex??0;
      const name=Object.keys(sheets).find(key=>sheets[key].getSheetId()===id);state.writes.push(name);
      u.rows.forEach((row,i)=>{if(!tables[name][rowIndex+i])tables[name][rowIndex+i]=[];
        row.values.forEach((cell,j)=>{const value=cell.userEnteredValue||{};
          if(value.formulaValue)formulas[name][(rowIndex+i+1)+':'+(colIndex+j+1)]=value.formulaValue;
          else tables[name][rowIndex+i][colIndex+j]=value.stringValue??value.numberValue??value.boolValue??'';
        });
      });
    }
    recalculate();
    if(operational&&state.throwAfter){state.throwAfter=false;throw new Error('Timeout after commit')}
  }
  function input(patch={}){return {draftKey:crypto.randomUUID(),senderPhone:'0400000001',customerId:'CUST-000001',name:'Test Person',
    address:'1 Test Street, Greenacre 2190',postcode:'2190',consent:'KEEP',deliveryDate:date,items:[{menuLineId:lineId,quantity:5}],...patch}}
  function request(){const row=Array(22).fill('');Object.assign(row,{0:'ORQ-TEST',1:'MK-1234ABCD',5:'a'.repeat(64),6:'MENU-'+date,7:date,8:'RECEIVED',15:'2026-10-18T00:00:00.000Z',21:'61400000001'});add('Order Requests',row);add('Order Request Items',['ORQ-TEST','i_'+'a'.repeat(24),lineId,'M0001','Test Dish','Test Kitchen','COOK-1',5,1500,800,7500,'a'.repeat(64)]);return row}
  return {ctx,state,tables,sheets,formulas,input,request,add,book};
}

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
