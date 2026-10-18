const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const testBookId = '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs';
const date = '2026-10-22', lineId = 'ML-20261022-M0001';
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
  const state = { now: Date.parse('2026-10-18T00:00:00Z'), owner: 'owner@example.test', env: 'TEST',
    formulaFail: false, throwBefore: false, throwAfter: false, failRecovery: false, customerPending: false, shiftIds: false, writes: [], batches: 0 };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const tables = {}, sheets = {}, formulas = {};
  const headers = {
    Orders: ['Order ID','Order Date','Delivery Date','Customer ID','Customer Name','Phone','Delivery Address','Postcode','Order Status','Payment Status','Delivery Window','Order Total','Delivery Status','Notes','Items Subtotal','Delivery Fee','Free Delivery Discount (AUTO)','Cook Payout','Contribution Before Delivery Cost','Total Qty','Discounted Qty (AUTO)','Order Rules Control','Capacity Control','Order Check','Ready to Confirm?','Pricing Discount % (SNAPSHOT)','Pricing Delivery Fee (SNAPSHOT)','Free Delivery Threshold (SNAPSHOT)','Free Delivery Basis (SNAPSHOT)','Minimum Order Items (SNAPSHOT)','Delivery Address (SNAPSHOT)','Customer Name (SNAPSHOT)','Phone (SNAPSHOT)','Postcode (SNAPSHOT)','Delivery Instructions (SNAPSHOT)','Request Reference (SNAPSHOT)','Owner Operation ID'],
    'Order Items': ['Order ID','Delivery Date','Order Status','Dish Name','Item Code (AUTO, INTERNAL)','Cook ID','Qty','Price Treatment (AUTO)','List Price','Customer Unit Price','Cook Pay / Unit','Line Total','Cook Payout','Fulfilment Status','Ordered Qty / Cycle','Available Servings / Cycle','Capacity Check','Notes','Offer Eligible (AUTO)','Free Promo Qty (LEGACY)','Discounted Qty (AUTO)','Full Price Qty (LEGACY)','Item Code (SNAPSHOT)','List Price (SNAPSHOT)','Cook Pay (SNAPSHOT)','Cook ID (SNAPSHOT)','Kitchen Name (SNAPSHOT)','Menu Line ID (SNAPSHOT)','Customer Unit Price (SNAPSHOT)','Line Total (SNAPSHOT)'],
    Customers: ['Customer ID','Name','Phone','Area / Suburb','Postcode','Food Preference','Order Frequency','Price Sensitivity','Intent','WhatsApp Opt-In',...Array(19).fill(''), 'Default Delivery Address'],
    'Customer Intake': ['Submission ID','Respondent ID','Submitted at','First name','Mobile number','Suburb or postcode','','','WhatsApp Contact (Yes, Ma Kitchens can contact me on WhatsApp about my free meal claim and order)',...Array(10).fill('')],
    'Weekly Menu': ['Menu Line ID','Menu Cycle ID','Delivery Date','Item Code','Dish Name','Cook ID','Menu Kitchen Name','Customer Price','Available Servings','Menu Status','Menu Card Readiness','Availability Status','Cook Section Order','Dish Display Order','Image URL'],
    Dishes: ['Item Code','Cook Pay / Serving','Status'],
    'Menu Config': ['Setting', 'Value'],
  };
  const ctx = { Date: Clock, Object, Array, Number, String, Math, JSON, RegExp, isNaN,
    CONTROL_TOWER_SPREADSHEET_ID: testBookId, CUSTOMERS_SHEET:'Customers', CUSTOMER_INTAKE_SHEET:'Customer Intake',
    WEEKLY_MENU_SHEET:'Weekly Menu', DISHES_SHEET:'Dishes', ORDERS_SHEET:'Orders', ORDER_ITEMS_SHEET:'Order Items',
    DELIVERY_WINDOW:'4–10 PM', PAYMENT_PAYID:'0420 246 023',
    Session: {getActiveUser:()=>({getEmail:()=>state.owner}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='ORDER_AUTOMATION_ENV'?state.env:key==='ORDER_REQUEST_API_SECRET'?'audit-signing-secret-with-at-least-32-characters':null})},
    LockService:{getScriptLock:()=>({hasLock:()=>false,waitLock(){},tryLock:()=>true,releaseLock(){}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},sleep(){},
      computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(String(value)).digest()],
      computeDigest:(_,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],
      formatDate:(value,zone,pattern)=>{
        if(pattern==='yyyy-MM-dd-HH-mm-ss')return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(value).replace(', ','-').replace(/:/g,'-');
        return new Intl.DateTimeFormat(pattern==='HH'?'en-GB':'en-CA',pattern==='HH'?{timeZone:zone,hour:'2-digit',hourCycle:'h23'}:{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
      }},
    getOrderingRules_:()=>({discountPercent:20,minimumOrderItems:5,deliveryFee:10,freeDeliveryThreshold:0,freeDeliveryBasis:'Pre-discount food value'}),
    SpreadsheetApp:{openById:()=>book,flush:()=>recalculate()},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>({getContent:()=>text})})},
    Sheets:{Spreadsheets:{batchUpdate:request=>apply(request.requests)}},
  };
  vm.createContext(ctx);
  for(const name of (options.integrated ? ['integration-test/Code.gs'] : ['OrderEngine.gs','OrderRequests.gs','OwnerOrders.gs','OwnerCustomers.gs','OwnerOrderSetup.gs']))
    vm.runInContext(fs.readFileSync(path.join(root,'apps-script',name),'utf8'),ctx);
  const schemas=vm.runInContext('Object.assign({}, MK_ORDER_REQUEST_HEADERS, MK_OWNER_HEADERS)',ctx);
  Object.assign(headers,copy(schemas));
  let nextSheetId=1;
  for(const [name,columns]of Object.entries(headers)){
    tables[name]=[columns.slice()];formulas[name]={};
    const id=nextSheetId++;
    sheets[name]={getParent:()=>book,getSheetId:()=>id,getMaxRows:()=>name==='Orders'?2000:name==='Order Items'?5000:2000,getMaxColumns:()=>columns.length,
      getLastRow:()=>tables[name].length,getDataRange:()=>({getValues:()=>copy(tables[name]),getDisplayValues:()=>copy(tables[name])}),
      getRange:(row,col,height=1,width=1)=>{if(typeof row==='string'){const match=row.match(/^([A-Z]+)([0-9]+)$/);col=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);row=Number(match[2])}return {getRow:()=>row,getColumn:()=>col,
        getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>tables[name][row+i-1]?.[col+j-1]??'')),
        getDisplayValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>String(tables[name][row+i-1]?.[col+j-1]??''))),
        getFormula:()=>formulas[name][row+':'+col]??(name==='Orders'&&[16,17,20,21,22].includes(col)||name==='Order Items'&&[8,10,12,13,19,20,21,22].includes(col)?'=0':'')}}};
  }
  for(const [key,value] of Object.entries(vm.runInContext('MK_OWNER_FORMULA_SNAPSHOTS',ctx))){const [name,cell]=key.split('!');const m=cell.match(/^([A-Z]+)([0-9]+)$/);const column=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);formulas[name][Number(m[2])+':'+column]=value}
  const book={getSpreadsheetTimeZone:()=> 'Australia/Sydney',getId:()=>testBookId,getOwner:()=>({getEmail:()=> 'owner@example.test'}),getSheetByName:name=>sheets[name]||null};
  function add(name,values){tables[name].push(values);return values}
  const customer=Array(30).fill('');Object.assign(customer,{0:'CUST-000001',1:'Test Person',2:'+61400000001',3:'Greenacre',4:'2190',9:'N',29:'1 Test Street, Greenacre 2190'});add('Customers',customer);
  const intake=Array(19).fill('');Object.assign(intake,{0:'intake-1',2:'2026-09-01T00:00:00Z',3:'Test Person',4:'+61400000001',5:'2190',8:false});add('Customer Intake',intake);
  add('Weekly Menu',[lineId,'MENU-'+date,date,'M0001','Test Dish','COOK-1','Test Kitchen',15,50,'Available','READY','Available',1,1,'']);
  add('Dishes',['M0001',8,'Active']);
  for(const setting of [['Standard Discount %','20'],['Minimum Order Items','5'],['Delivery Fee','10'],['Free Delivery Threshold','0'],['Free Delivery Threshold Basis','Pre-discount food value']])add('Menu Config',setting);
  // Row 2 in Order Items contains the array anchors and is not used for inputs.
  add('Order Items',Array(30).fill(''));
  function recalculate(){
    if(!state.customerPending){
      for(const row of tables['Customer Intake'].slice(1)){
        let target=tables.Customers.slice(1).find(c=>String(c[2])===String(row[4]));
        if(!target){target=Array(30).fill('');target[0]='CUST-'+String(tables.Customers.length).padStart(6,'0');target[2]=row[4];add('Customers',target)}
        target[1]=row[3];target[3]=row[5];target[4]=row[5];target[9]=row[8]?'Y':'N';
      }
      if(state.shiftIds&&tables.Customers[1])tables.Customers[1][0]='CUST-999999';
    }
    for(const order of tables.Orders.slice(1)){
      if(!order[0])continue;if(typeof order[2]==='number')order[2]=new Date(Date.UTC(1899,11,30)+order[2]*86400000).toISOString().slice(0,10);let total=0,payout=0,qty=0;
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
    if(state.failRecovery && requests.some(r=>r.updateCells?.rows?.some(row=>row.values?.some(c=>c.userEnteredValue?.stringValue==='NOT_RECORDED'))))throw new Error('Recovery transport failed');
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


module.exports={fixture,date,lineId,testBookId,copy};
