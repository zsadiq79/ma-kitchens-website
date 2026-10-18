const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {stripTypeScriptTypes}=require('node:module');
const {fixture,date,lineId}=require('./helpers/order-fixture.cjs');
const root=path.join(__dirname,'..');
process.env.TZ='Australia/Sydney'; // Match the Apps Script manifest for legacy local-date operations.

test('Integrated initialization finishes and can retry after partial setup without a spreadsheet UI',()=>{
  const f=fixture({integrated:true});
  f.ctx.SpreadsheetApp.getUi=()=>{throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');};
  f.ctx.SpreadsheetApp.ProtectionType={SHEET:'SHEET'};
  f.ctx.ScriptApp={getProjectTriggers:()=>[{getHandlerFunction:()=> 'orderRequestInboxOnOpen_',getTriggerSourceId:()=>f.book.getId()}]};
  for(const sheet of Object.values(f.sheets)){
    sheet.setFrozenRows=()=>{};sheet.getProtections=()=>[{}];
    const getRange=sheet.getRange;
    sheet.getRange=(...args)=>{const range=getRange(...args);range.setValues=values=>{
      const name=Object.keys(f.sheets).find(name=>f.sheets[name]===sheet);
      values.forEach((row,i)=>row.forEach((value,j)=>{f.tables[name][range.getRow()+i-1][range.getColumn()+j-1]=value;}));
    };return range;};
  }
  f.ctx.buildActiveMenu_=()=>({deliveryDate:date});
  f.ctx.mkOrderSnapshot_=()=>({menuRevision:'test-revision',meals:[{}]});
  let published=0;f.ctx.mkOrderSavePublishedState_=()=>{published++;};
  f.ctx.SpreadsheetApp.flush();
  const customerBefore=JSON.stringify(f.tables.Customers),itemsBefore=JSON.stringify(f.tables['Order Items']);
  for(let attempt=0;attempt<2;attempt++){
    const result=f.ctx.initializeOrderAutomationIntegrationTest();
    assert.equal(result.ok,true);assert.equal(result.menuRevision,'test-revision');assert.equal(result.dishCount,1);
  }
  assert.equal(published,2);assert.equal(JSON.stringify(f.tables.Customers),customerBefore);
  assert.equal(JSON.stringify(f.tables['Order Items']),itemsBefore);
});

function freezeSpreadsheetReads(f){
  for(const [name,sheet] of Object.entries(f.sheets)){
    const snapshot=JSON.parse(JSON.stringify(f.tables[name])),getRange=sheet.getRange;
    sheet.getDataRange=()=>({getValues:()=>JSON.parse(JSON.stringify(snapshot)),getDisplayValues:()=>JSON.parse(JSON.stringify(snapshot))});
    sheet.getRange=(row,col,height=1,width=1)=>{
      const range=getRange(row,col,height,width),first=range.getRow()-1,column=range.getColumn()-1;
      range.getValues=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>snapshot[first+i]?.[column+j]??''));
      range.getDisplayValues=()=>range.getValues().map(row=>row.map(value=>String(value)));
      return range;
    };
  }
}

test('Unchanged request selections survive RPC reordering of the quantity and menuLineId object fields',()=>{
  const f=fixture({integrated:true});f.request();
  const input=f.input({requestReference:'MK-1234ABCD',items:[{quantity:5,menuLineId:lineId}]});
  const review=f.ctx.ownerOrderReview(input);assert.equal(review.review.quote.totalQuantity,5);
  assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).state,'VERIFIED');assert.equal(f.tables.Orders.length,2);
});

test('A real quantity change still requires a reason when RPC object fields arrive in a different order',()=>{
  const f=fixture({integrated:true});f.request();
  const input=f.input({requestReference:'MK-1234ABCD',items:[{quantity:6,menuLineId:lineId}]});
  assert.throws(()=>f.ctx.ownerOrderReview(input),/reason for changing/);
  assert.equal(f.tables['Owner Order Reviews'].length,1);assert.equal(f.tables.Orders.length,1);
  input.revisionReason='Customer explicitly requested six servings';
  assert.equal(f.ctx.ownerOrderReview(input).review.quote.totalQuantity,6);
});

test('An accepted manual order verifies through fresh API reads even when every SpreadsheetApp read stays at its pre-commit snapshot',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());freezeSpreadsheetReads(f);
  const result=f.ctx.ownerOrderAccept(r.id,r.hash);assert.equal(result.state,'VERIFIED');
  assert.equal(result.orderId,'ORD-000001');assert.equal(f.tables.Orders.length,2);
  assert.equal(f.tables['Owner Order Reviews'][1][8],result.orderId);
  assert.equal(f.ctx.ownerOrderAccept(r.id,r.hash).orderId,result.orderId);assert.equal(f.tables.Orders.length,2);
});

test('Website request acceptance verifies the new link while SpreadsheetApp still shows its unaccepted snapshot',()=>{
  const f=fixture({integrated:true});f.request();const r=f.ctx.ownerOrderReview(f.input({requestReference:'MK-1234ABCD'}));
  freezeSpreadsheetReads(f);const result=f.ctx.ownerOrderAccept(r.id,r.hash);
  assert.equal(result.state,'VERIFIED');assert.equal(f.tables['Order Requests'][1][8],'ACCEPTED');
  assert.equal(f.tables['Order Requests'][1][14],result.orderId);assert.equal(f.tables.Orders.length,2);
});

test('Customer intake recalculation is read freshly even when SpreadsheetApp keeps its earlier customer list',()=>{
  const f=fixture({integrated:true});freezeSpreadsheetReads(f);
  const result=f.ctx.ownerOrderSaveCustomer(f.input({customerId:'',senderPhone:'0400000002',name:'New Person',consent:'NO'}),crypto.randomUUID());
  assert.equal(result.status,'READY');assert.equal(result.customer.name,'New Person');assert.equal(f.tables.Customers.length,3);
});

test('A read failure after the atomic commit preserves one order and can be checked using the original review',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input()),get=f.ctx.Sheets.Spreadsheets.Values.get;
  let failed=false;f.ctx.Sheets.Spreadsheets.Values.get=(...args)=>{
    if(!failed&&f.tables.Orders.length===2&&args[1].startsWith("'Owner Order Reviews'")){failed=true;throw new Error('Read service unavailable');}
    return get(...args);
  };
  assert.throws(()=>f.ctx.ownerOrderAccept(r.id,r.hash),/SUBMISSION_UNCERTAIN/);
  assert.equal(f.tables.Orders.length,2);assert.equal(f.ctx.ownerOrderCheck(r.id).state,'VERIFIED');
  assert.equal(f.ctx.ownerOrderAccept(r.id,r.hash).orderId,'ORD-000001');assert.equal(f.tables.Orders.length,2);
});

test('An uncertain owner acceptance leaves Check saved order available with the original review identity',async()=>{
  const html=fs.readFileSync(path.join(root,'apps-script/OwnerOrderWorkspace.html'),'utf8');
  const handler=html.match(/\$\('accept'\)\.onclick=(.*);/)[1],nodes=Object.fromEntries(['accept','check','copy','manualSent','outcome'].map(id=>[id,{hidden:id==='check'}]));
  const ctx={$:id=>nodes[id],review:{id:'REV-original',hash:'original-hash'},task:async fn=>{try{await fn()}catch(error){ctx.error=error.message;}},
    invoke:async(name,id,hash)=>{assert.equal(name,'ownerOrderAccept');assert.equal(id,'REV-original');assert.equal(hash,'original-hash');throw new Error('SUBMISSION_UNCERTAIN');}};
  vm.createContext(ctx);const accept=vm.runInContext('('+handler+')',ctx);await accept();
  assert.equal(nodes.check.hidden,false);assert.equal(nodes.accept.hidden,true);assert.equal(nodes.copy.hidden,true);
  assert.equal(ctx.review.id,'REV-original');assert.match(nodes.outcome.textContent,/Check saved order/);
});

test('A failed recovery cannot clear the review while leaving its journal COMMITTING',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());
  f.state.throwBefore=true;assert.throws(()=>f.ctx.ownerOrderAccept(r.id,r.hash),/UNCERTAIN/);
  f.state.now+=421000;f.state.failRecovery=true;
  assert.throws(()=>f.ctx.ownerOrderRecover(r.id),/transport/);
  assert.equal(f.tables['Owner Order Reviews'][1][3],'COMMITTING');
  assert.equal(f.tables['Order Operation Journal'][1][3],'COMMITTING');
  f.state.failRecovery=false;f.ctx.ownerOrderRecover(r.id);
  assert.equal(f.tables['Owner Order Reviews'][1][3],'NOT_RECORDED');
  assert.equal(f.tables['Order Operation Journal'][1][3],'NOT_RECORDED');
});

test('New customers use numeric intake phones and a READY retry does not overwrite a later default address',()=>{
  const f=fixture({integrated:true}),operation=crypto.randomUUID(),input=f.input({customerId:'',senderPhone:'0400000002',name:'New Person',consent:'NO'});
  const result=f.ctx.ownerOrderSaveCustomer(input,operation);
  assert.equal(result.status,'READY');assert.equal(f.tables['Customer Intake'][2][4],61400000002);
  f.tables.Customers[2][29]='A later explicitly saved address 2200';
  const batches=f.state.batches;
  const retry=f.ctx.ownerOrderSaveCustomer(input,operation);
  assert.equal(retry.customer.address,'A later explicitly saved address 2200');assert.equal(f.state.batches,batches);
});

test('Customer timestamps remain after every existing serial value, preserving registry order even with future-dated cells',()=>{
  const f=fixture({integrated:true}),latest=f.ctx.mkSerial_(new f.ctx.Date())+10;
  f.tables['Customer Intake'][1][2]=latest;
  f.ctx.ownerOrderSaveCustomer(f.input({customerId:'',senderPhone:'0400000002',name:'New Person',consent:'NO'}),crypto.randomUUID());
  assert.ok(f.tables['Customer Intake'][2][2]>latest);
  const other=fixture({integrated:true});other.tables['Customer Intake'][1][2]='invalid';
  assert.throws(()=>other.ctx.ownerOrderSaveCustomer(other.input({customerId:'',senderPhone:'0400000002',name:'New Person',consent:'NO'}),crypto.randomUUID()),/invalid timestamp/);
  assert.equal(other.tables['Customer Intake'].length,2);
});

test('Moved operational columns fail before order cells or the commit journal are written',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());
  [f.tables.Orders[0][8],f.tables.Orders[0][9]]=[f.tables.Orders[0][9],f.tables.Orders[0][8]];
  assert.throws(()=>f.ctx.ownerOrderAccept(r.id,r.hash),/columns moved/);
  assert.equal(f.tables.Orders.length,1);assert.equal(f.tables['Order Operation Journal'].length,1);
});

test('The manual-send marker rechecks an order cancelled after its original verification',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());f.ctx.ownerOrderAccept(r.id,r.hash);
  f.tables.Orders[1][8]='Cancelled';
  assert.throws(()=>f.ctx.ownerOrderMarkManualSend(r.id),/Saved order changed/);
  assert.equal(f.tables['Owner Order Reviews'][1][11],'');
});

test('An accepted manual draft cannot be presented as a fresh review with a different quantity',()=>{
  const f=fixture({integrated:true}),input=f.input(),r=f.ctx.ownerOrderReview(input);f.ctx.ownerOrderAccept(r.id,r.hash);
  assert.throws(()=>f.ctx.ownerOrderReview({...input,items:[{menuLineId:lineId,quantity:6}]}),/already has a saved/);
  assert.equal(f.tables.Orders.length,2);
});

test('Changed address snapshot formulas fail before any order commit',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());f.formulas.Orders['2:7']='=0';
  assert.throws(()=>f.ctx.ownerOrderAccept(r.id,r.hash),/snapshot formula changed/);
  assert.equal(f.tables.Orders.length,1);assert.equal(f.tables['Order Operation Journal'].length,1);
});

test('The original menu selector advances past a closed cycle while preserving dish descriptions and portions',()=>{
  const f=fixture({integrated:true});f.state.now=Date.parse('2026-10-22T01:00:00Z');
  f.tables['Weekly Menu'][0].push('Remaining Servings','Menu Description');f.tables['Weekly Menu'][1].push(50,'Original description');
  const next=f.tables['Weekly Menu'][1].slice();next[0]='ML-20261029-M0001';next[1]='MENU-2026-10-29';next[2]='2026-10-29';f.tables['Weekly Menu'].push(next);
  f.tables.Dishes[0].push('Portion / Pack');f.tables.Dishes[1].push('500 g');
  const menu=f.ctx.buildActiveMenu_();assert.equal(menu.deliveryDate,'2026-10-29');assert.equal(menu.meals[0].portion,'500 g');assert.equal(menu.meals[0].description,'Original description');
});

test('Receipt status cannot regress from Read to a delayed provider failure',()=>{
  const f=fixture({integrated:true});
  assert.ok(f.ctx.whatsappLogStatusRank_('Read')>f.ctx.whatsappLogStatusRank_('Failed'));
  assert.ok(f.ctx.whatsappLogStatusRank_('Sent')>f.ctx.whatsappLogStatusRank_('Failed'));
});

test('Line totals continue using the frozen unit price when an owner edits quantity',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input());f.ctx.ownerOrderAccept(r.id,r.hash);
  assert.match(f.formulas['Order Items']['3:12'],/ROUND\(G3\*AC3,2\)/);
  assert.doesNotMatch(f.formulas['Order Items']['3:12'],/,0,AD3\)/);
});

async function route(file,patch={}) {
  const boundary=await import('../lib/orderApiBoundary.mjs'),order=await import('../lib/orderRequest.mjs'),menu=await import('../lib/publishedOrderMenu.mjs');
  const ctx={...boundary,...order,...menu,createHmac:crypto.createHmac,Request,Response,URL,Buffer,AbortSignal,Uint8Array,Number,Date,
    NextResponse:{json:(value,options)=>Response.json(value,options)},publishedMenu:JSON.parse(fs.readFileSync(path.join(root,'data/published-order-menu.json'),'utf8')),
    process:{env:{VERCEL_URL:'audit-preview.test',ORDER_REQUEST_API_SECRET:'audit-signing-secret-with-at-least-32-characters',ORDER_REQUEST_API_URL:'https://script.google.com/macros/s/TEST_ONLY/exec'}},...patch};
  const text=fs.readFileSync(path.join(root,file),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.createContext(ctx);new vm.Script(stripTypeScriptTypes(text)).runInContext(ctx);return ctx;
}
test('HTTP capture forwards a signed contract and never opens WhatsApp on an uncertain backend response',async()=>{
  const menu=JSON.parse(fs.readFileSync(path.join(root,'data/published-order-menu.json'),'utf8'));
  let sent=0;
  const ctx=await route('app/api/order-requests/route.ts',{fetch:async(url,options)=>{
    sent++;assert.equal(new URL(url).searchParams.get('action'),'order_request_capture');
    const envelope=JSON.parse(options.body),body=JSON.parse(envelope.body);
    assert.equal(crypto.createHmac('sha256',ctx.process.env.ORDER_REQUEST_API_SECRET).update(envelope.timestamp+'\norder_request_capture\n'+envelope.body).digest('hex'),envelope.signature);
    assert.equal(body.items[0].quantity,5);throw new Error('Response lost');
  }});
  const request=new Request('https://audit-preview.test/api/order-requests',{method:'POST',headers:{origin:'https://audit-preview.test','x-real-ip':'capture-audit'},body:JSON.stringify({requestKey:crypto.randomUUID(),menuRevision:menu.menuRevision,menuCycleId:menu.menuCycleId,deliveryDate:menu.deliveryDate,items:[{id:menu.meals[0].id,quantity:5}]})});
  const response=await ctx.POST(request),value=await response.json();assert.equal(response.status,502);assert.equal(value.error,'ORDER_CAPTURE_UNCERTAIN');assert.equal(value.whatsappUrl,undefined);assert.equal(sent,1);
});

test('Unexpected upstream error text cannot be reflected to a public capture response',async()=>{
  const menu=JSON.parse(fs.readFileSync(path.join(root,'data/published-order-menu.json'),'utf8'));
  const ctx=await route('app/api/order-requests/route.ts',{fetch:async()=>{const r=Response.json({ok:false,error:'private provider URL or secret details'});Object.defineProperty(r,'url',{value:'https://script.googleusercontent.com/macros/echo'});return r}});
  const response=await ctx.POST(new Request('https://audit-preview.test/api/order-requests',{method:'POST',headers:{origin:'https://audit-preview.test','x-real-ip':'private-error-audit'},body:JSON.stringify({requestKey:crypto.randomUUID(),menuRevision:menu.menuRevision,menuCycleId:menu.menuCycleId,deliveryDate:menu.deliveryDate,items:[{id:menu.meals[0].id,quantity:5}]})}));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'ORDER_CAPTURE_FAILED');
});

test('The retained Flow endpoint bounds encrypted requests before decryption and rejects an invalid signature',async()=>{
  const boundary=await import('../lib/orderApiBoundary.mjs');
  const source=fs.readFileSync(path.join(root,'app/api/whatsapp-flow/route.ts'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ctx={...boundary,crypto,Response,URL,Buffer,AbortSignal,process:{env:{WHATSAPP_APP_SECRET:'test-app-secret',WHATSAPP_FLOW_PRIVATE_KEY:'unused-test-key'}},console:{log(){},warn(){},error(){}}};vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(source),ctx);
  assert.equal((await ctx.POST(new Request('https://preview.test',{method:'POST',body:'x'.repeat(200001)}))).status,413);
  assert.equal((await ctx.POST(new Request('https://preview.test',{method:'POST',body:'{}',headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)}}))).status,432);
});

test('A durable retry key recovers a saved reference after menu cutoff without creating another request',async()=>{
  const f=fixture({integrated:true}),key=crypto.randomUUID(),secret='audit-signing-secret-with-at-least-32-characters';
  const capability=crypto.createHmac('sha256',secret).update('order-request-recovery\n'+key).digest('base64url');
  const row=Array(22).fill('');Object.assign(row,{0:'ORQ-audit',1:'MK-A1B2C3D4',2:key,4:crypto.createHash('sha256').update(capability).digest('hex'),7:date,8:'UNASSIGNED',12:8500,15:'2026-10-18T00:00:00.000Z'});f.add('Order Requests',row);
  f.state.now=Date.parse('2026-10-22T12:00:00Z');
  const ctx=await route('app/api/order-requests/recovery/route.ts',{fetch:async(url,options)=>{
    // The production HTTP contract reaches the real GS envelope and recovery functions.
    const action=new URL(url).searchParams.get('action');
    const envelope=JSON.parse(options.body);f.state.now=Number(envelope.timestamp);
    const result=f.ctx.handleOrderRequestApi_({postData:{contents:options.body}},action).getContent();
    const response=new Response(result,{headers:{'Content-Type':'application/json'}});Object.defineProperty(response,'url',{value:'https://script.googleusercontent.com/macros/echo'});return response;
  }});
  const response=await ctx.POST(new Request('https://audit-preview.test/api/order-requests/recovery',{method:'POST',headers:{origin:'https://audit-preview.test','x-real-ip':'recovery-audit'},body:JSON.stringify({requestKey:key})}));
  const value=await response.json();assert.equal(response.status,200);assert.equal(value.reference,'MK-A1B2C3D4');assert.equal(value.capability,capability);assert.match(value.whatsappUrl,/wa.me/);
  assert.equal(f.tables['Order Requests'].length,2);assert.equal(f.tables.Orders.length,1);assert.equal(value.phone,undefined);
});

test('Recovery and capture rate limits reject excess attempts, and payload limits apply to streamed bytes',async()=>{
  const {orderRateLimited,readOrderJson}=await import('../lib/orderApiBoundary.mjs');
  const request=new Request('https://audit.test',{headers:{'x-real-ip':'rate-audit'}});
  for(let i=0;i<30;i++)assert.equal(orderRateLimited(request,'recovery-test',30,1),false);
  assert.equal(orderRateLimited(request,'recovery-test',30,1),true);
  await assert.rejects(()=>readOrderJson(new Request('https://audit.test',{method:'POST',body:'x'.repeat(100)}),20),/BODY_TOO_LARGE/);
});

test('Preview middleware blocks legacy providers on this branch and allows only the new request routes',()=>{
  const source=fs.readFileSync(path.join(root,'middleware.ts'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const ctx={process:{env:{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/order-request-capture-preview'}},NextResponse:{json:(value,options)=>({value,...options}),next:()=>({next:true})}};
  vm.createContext(ctx);new vm.Script(stripTypeScriptTypes(source)).runInContext(ctx);
  for(const path of ['/api/contact','/api/whatsapp-events','/api/whatsapp-flow','/api/routific-webhook','/api/feedback/token'])assert.equal(ctx.middleware({nextUrl:{pathname:path}}).status,503);
  assert.equal(ctx.middleware({nextUrl:{pathname:'/api/order-requests'}}).next,true);
  ctx.process.env.VERCEL_ENV='production';assert.equal(ctx.middleware({nextUrl:{pathname:'/api/whatsapp-events'}}).next,true);
});

test('Routific forwarding rejects invalid HMACs and requires successful upstream JSON without logging private data',async()=>{
  const boundary=await import('../lib/orderApiBoundary.mjs');const source=fs.readFileSync(path.join(root,'app/api/routific-webhook/route.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  let sent=0;const ctx={...boundary,crypto,Response,URL,Buffer,AbortSignal,process:{env:{ROUTIFIC_WEBHOOK_SECRET:'provider-test-secret',CONTROL_TOWER_WEBHOOK_SECRET:'forward-test-secret',CONTROL_TOWER_WEBHOOK_URL:'https://script.google.com/macros/s/TEST/exec'}},
    fetch:async()=>{sent++;const response=Response.json({status:500});Object.defineProperty(response,'url',{value:'https://script.googleusercontent.com/macros/echo'});return response},
    console:{log(){throw new Error('Private logging attempted')},error(){throw new Error('Private logging attempted')}}};vm.createContext(ctx);vm.runInContext(source,ctx);
  const raw=JSON.stringify({type:'order.status_updated',data:{order:{customerOrderNumber:'ORD-000001'}}});
  const make=signature=>new Request('https://preview.test/api/routific-webhook',{method:'POST',headers:{'x-routific-signature':signature},body:raw});
  assert.equal((await ctx.POST(make('0'.repeat(64)))).status,401);assert.equal(sent,0);
  const signature=crypto.createHmac('sha256','provider-test-secret').update(raw).digest('hex');assert.equal((await ctx.POST(make(signature))).status,502);assert.equal(sent,1);
});

test('The actual owner form preserves an alternate address during a customer save and locks editable controls during requests',()=>{
  const html=fs.readFileSync(path.join(root,'apps-script/OwnerOrderWorkspace.html'),'utf8');
  let script=html.match(/<script>([\s\S]*?)<\/script>/)[1];script=script.slice(0,script.lastIndexOf('task(async()=>{await refresh();clear();'));
  const elements={};const node=()=>({value:'',checked:false,disabled:false,hidden:false,replaceChildren(){},appendChild(){},addEventListener(){},setAttribute(){}});
  const document={getElementById:id=>elements[id]||(elements[id]=node()),querySelectorAll:()=>Object.values(elements),createElement:node};
  for(const match of html.matchAll(/\bid="([^"]+)"/g))document.getElementById(match[1]);
  const ctx={document,crypto:{randomUUID:()=>crypto.randomUUID()},google:{},navigator:{},prompt:()=>null};vm.createContext(ctx);vm.runInContext(script,ctx);
  elements.address.value='5 Alternate Street 2200';elements.postcode.value='2200';
  ctx.chooseCustomer({id:'CUST-1',name:'Saved Person',postcode:'2190',address:'Original default 2190'},true);
  assert.equal(elements.address.value,'5 Alternate Street 2200');assert.equal(elements.postcode.value,'2200');
  ctx.lock(true);assert.equal(elements.address.disabled,true);assert.equal(elements.senderPhone.disabled,true);ctx.lock(false);assert.equal(elements.address.disabled,false);
});

test('The actual public submit function retries the same identity and opens WhatsApp even when browser storage is disabled',async()=>{
  const source=fs.readFileSync(path.join(root,'components/ordering/OrderMenu.tsx'),'utf8');
  const fn=source.slice(source.indexOf('  async function continueToWhatsApp'),source.indexOf('  const unavailable ='));
  const utils=await import('../lib/publishedOrderMenu.mjs'),requests=await import('../lib/orderRequest.mjs');
  const menu=JSON.parse(fs.readFileSync(path.join(root,'data/published-order-menu.json'),'utf8')),quantities=menu.meals.map((_,i)=>i?'':'5'),keys=[],opened=[];
  const ctx={...requests,menu,quantities,selection:utils.orderSelection(menu,quantities),minimumOrderItems:5,expired:false,savedRequest:null,saveLock:{current:false},pendingRef:{current:null},retryKey:'',
    crypto:{randomUUID:()=>crypto.randomUUID()},window:{sessionStorage:{getItem(){throw new Error('Storage denied')},setItem(){throw new Error('Storage denied')}},location:{assign:url=>opened.push(url)}},
    setSaving(){},setMessage(){},setExpired(){},setStale(){},setRetryKey:key=>{ctx.retryKey=key},setSavedRequest:value=>{ctx.savedRequest=value},
    fetch:async(url,options)=>{keys.push(JSON.parse(options.body).requestKey);if(keys.length===1)throw new Error('Lost response');return Response.json({ok:true,reference:'MK-A1B2C3D4',capability:'a'.repeat(43),whatsappUrl:'https://wa.me/61420246023?text=saved'})}};
  vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(fn),ctx);
  await ctx.continueToWhatsApp({preventDefault(){}});await ctx.continueToWhatsApp({preventDefault(){}});
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(opened.length,1);assert.equal(ctx.savedRequest.reference,'MK-A1B2C3D4');
});

test('Feedback uses the accepted dish/cook snapshots after the catalogue changes',()=>{
  const f=fixture({integrated:true});
  const tables={Orders:{col:{'Order ID':0,'Order Status':1,'Delivery Date':2,'Customer ID':3,'Customer Name':4},rows:[['ORD-000001','Confirmed',date,'CUST-1','Test Person']]},
    'Order Items':{col:{'Order ID':0,'Order Status':1,'Fulfilment Status':2,'Item Code (AUTO, INTERNAL)':3,Qty:4,'Dish Name':5,'Cook ID (SNAPSHOT)':6,'Kitchen Name (SNAPSHOT)':7},rows:[['ORD-000001','Confirmed','Pending','M0001',5,'Original Dish','ORIGINAL-COOK','Original Kitchen']]},
    Dishes:{col:{'Item Code':0,'Cook ID':1,'Dish Name':2,'Menu Kitchen Name':3,'Image URL':4},rows:[['M0001','NEW-COOK','Renamed Dish','New Kitchen','']]},
    Deliveries:{col:{'Order ID':0,'Delivery Status':1,'Delivered At':2},rows:[['ORD-000001','Delivered','2026-10-01T00:00:00.000Z']]}};
  f.ctx.fwTable_=(book,name)=>tables[name];const result=f.ctx.fwOrder_({},'ORD-000001');
  assert.equal(result.dishes[0].cookId,'ORIGINAL-COOK');assert.equal(result.dishes[0].dishName,'Original Dish');assert.equal(result.dishes[0].kitchenName,'Original Kitchen');
  tables.Dishes.rows=[];assert.equal(f.ctx.fwOrder_({},'ORD-000001').dishes[0].cookId,'ORIGINAL-COOK');
});

test('Packing excludes flagged orders and strips internal legacy draft markers',()=>{
  const f=fixture({integrated:true}),r=f.ctx.ownerOrderReview(f.input({instructions:'Ring the bell'}));f.ctx.ownerOrderAccept(r.id,r.hash);
  f.ctx.getSelectedPackingSlipDate_=()=>new f.ctx.Date(date+'T00:00:00Z');f.tables.Orders[1][8]='Confirmed';f.tables.Orders[1][2]=date;
  assert.equal(f.ctx.collectPackingSlipData_()[0].deliveryNote,'Ring the bell');
  f.tables.Orders[1][23]='REVIEW';assert.equal(f.ctx.collectPackingSlipData_().length,0);
  assert.equal(f.ctx.cleanDeliveryNote_('Order Entry draft 123e4567-e89b-42d3-a456-426614174000 | Delivery instructions: Ring twice'),'Ring twice');
});
