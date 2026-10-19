const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {migrationFixture}=require('./helpers/release-migration-fixture.cjs');
const {fixture,date,lineId}=require('./helpers/order-fixture.cjs');
const root=path.join(__dirname,'..');
process.env.TZ='Australia/Sydney';

test('Release builds retain every original function with exact source origins and no TEST bindings',()=>{
  const testSource=fs.readFileSync(path.join(root,'apps-script/integration-test/Code.gs'));
  assert.equal(crypto.createHash('sha256').update(testSource).digest('hex'),JSON.parse(fs.readFileSync(path.join(root,'apps-script/integration-test/source-manifest.json'))).codeSha256);
  for(const environment of ['REHEARSAL','PRODUCTION']){
    const f=migrationFixture(environment),names=[...f.source.matchAll(/^function\s+(\w+)\s*\(/gm)].map(m=>m[1]);
    assert.equal(new Set(names).size,names.length);assert.equal(f.manifest.originalModules.length,12);
    assert.equal(crypto.createHash('sha256').update(f.source).digest('hex'),f.manifest.codeSha256);
    for(const module of f.manifest.originalModules){const original=fs.readFileSync(path.join(root,'apps-script/integration-baseline',module.name),'utf8');
      assert.equal(crypto.createHash('sha256').update(original).digest('hex'),module.sha256);
      for(const match of original.matchAll(/^function\s+(\w+)\s*\(/gm))assert.equal(typeof f.ctx[match[1]],'function',match[1]);}
    assert.doesNotMatch(f.source,/1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs|MK_INTEGRATION_TEST_ID|mkIntegrationRequireTest_/);
    const support=f.source.indexOf('SOURCE: OrderReleaseSupport.gs');
    assert.doesNotMatch(f.source.slice(0,support),/UrlFetchApp\s*\.\s*fetch\s*\(|DocumentApp\s*\.\s*(?:create|openById)\s*\(|DriveApp\s*\.\s*getFileById\s*\(/);
    const unresolved=[...new Set([...f.source.matchAll(/(?<![.\w])([A-Za-z_$][\w$]*_)\s*\(/g)].map(m=>m[1]))].filter(name=>typeof f.ctx[name]!=='function');
    assert.deepEqual(unresolved,[]);
  }
});
test('Exact project, bound book and active owner are required before rehearsal configuration',()=>{
  for(const patch of [{scriptId:'LIVE-project'},{activeId:'LIVE-book'},{owner:''},{owner:'another@example.test'}]){
    const f=migrationFixture();Object.assign(f.state,patch);assert.throws(()=>f.configure(),/WRONG_PROJECT|designated bound|OWNER_REQUIRED/);
    assert.deepEqual(f.state.props,{});assert.equal(f.state.writes.length,0);
  }
  const f=migrationFixture();f.state.props.CONTROL_TOWER_SPREADSHEET_ID='copied-live-property';f.state.props.ORDER_REQUEST_API_SECRET='copied-secret';
  f.configure();assert.equal(f.state.props.CONTROL_TOWER_SPREADSHEET_ID,f.profile.spreadsheetId);assert.notEqual(f.state.props.ORDER_REQUEST_API_SECRET,'copied-secret');
  const secret=f.state.props.ORDER_REQUEST_API_SECRET;f.configure();assert.equal(f.state.props.ORDER_REQUEST_API_SECRET,secret);
});
test('All rehearsal external boundaries and enabling helpers reject before native calls or settings changes',()=>{
  const f=migrationFixture();f.configure();const before=JSON.stringify(f.state.props);
  for(const name of ['mkReleaseFetch_','mkReleaseDocumentOpen_','mkReleaseDocumentCreate_','mkReleaseDriveFile_','enableFeedbackLive','installFeedbackAutomation',
    'runFeedbackSender','runFeedbackWebSender_','sendConfirmedOrdersToRoutific','generatePackingSlips','saveFeedbackProductionConfig','enableWebsiteFeedbackLive',
    'saveOrderingPublisherSettings','publishCurrentOrderingMenu','withdrawPublishedOrderingMenu','configureOrderingPublisherProduction','oeSendConfirmation_'])
    assert.throws(()=>f.ctx[name]('value'),/REHEARSAL_EXTERNAL_ACTION_BLOCKED/,name);
  assert.equal(JSON.stringify(f.state.props),before);assert.deepEqual(f.state.nativeEffects,[]);assert.equal(f.state.writes.length,0);
  assert.throws(()=>f.ctx.mkReleaseNewTrigger_('runFeedbackSender'),/UNRECOGNIZED_TRIGGER/);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'apps-script/production-rehearsal/appsscript.json')));
  assert.ok(!manifest.oauthScopes.some(scope=>/external_request|drive|documents/.test(scope)));
});
test('Wrong spreadsheet IDs are rejected on every native read and batch boundary',()=>{
  const f=migrationFixture();f.configure();
  for(const call of [()=>f.ctx.mkReleaseOpenBook_('LIVE'),()=>f.ctx.mkReleaseBatch_({},'LIVE'),()=>f.ctx.mkReleaseGrid_('LIVE',{}),
    ()=>f.ctx.mkReleaseValues_('LIVE','A1',{}),()=>f.ctx.mkReleaseBatchValues_('LIVE',{})])assert.throws(call,/OTHER_WORKBOOK_BLOCKED/);
  assert.deepEqual(f.state.nativeEffects,[]);assert.equal(f.state.writes.length,0);
});
test('Migration preview performs fresh bounded reads without writes or clearing historical uncertainty',()=>{
  const f=migrationFixture();f.configure();const before=JSON.stringify(f.grid),result=f.ctx.previewOrderAutomationMigration();
  assert.equal(result.formulaAnchors,9);assert.equal(result.sheetCount,26);assert.equal(result.newLedgerCount,7);
  assert.equal(result.legacyOrderId,'ORD-000052');assert.equal(result.confirmationState,'UNCERTAIN');
  assert.equal(result.writesIssued,false);assert.equal(JSON.stringify(f.grid),before);assert.equal(f.state.writes.length,0);
});
test('Migration adds the complete protected schema in one batch, preserves records, and reruns without another batch',()=>{
  const f=migrationFixture();f.configure();const orders=f.copy(f.grid.Orders.values),legacy=f.copy(f.grid['Order Entry'].values);
  const result=f.ctx.migrateOrderAutomationWorkspace();assert.equal(result.phase,'MIGRATED');assert.equal(f.state.writes.length,1);
  assert.equal(Object.keys(f.grid).length,33);assert.equal(f.grid.Orders.properties.gridProperties.columnCount,37);assert.equal(f.grid['Order Items'].properties.gridProperties.columnCount,30);
  assert.deepEqual(f.grid['Order Entry'].values,legacy);assert.deepEqual(f.grid.Orders.values.slice(2),orders.slice(2));
  const ledgers=vm.runInContext('Object.assign({},MK_OWNER_HEADERS,MK_ORDER_REQUEST_HEADERS)',f.ctx);
  for(const name of Object.keys(ledgers)){assert.equal(f.grid[name].protectedRanges.length,1);assert.equal(f.grid[name].properties.hidden,true)}
  const all=f.copy(f.grid);assert.equal(f.ctx.migrateOrderAutomationWorkspace().changed,false);assert.deepEqual(f.grid,all);assert.equal(f.state.writes.length,1);
  assert.ok(Buffer.byteLength(f.state.props.ORDER_AUTOMATION_MIGRATION_RECORD)<9000);
  assert.equal(f.state.props.ORDER_AUTOMATION_CAPTURE_ENABLED,'false');
});
test('Changed headers, formulas, occupied destinations, pending work and unexpected triggers stop before schema writes',()=>{
  const patches=[
    f=>{f.grid.Orders.values[0][8]='Moved status'},f=>{f.grid.Orders.values[1][11]='=0'},
    f=>{f.grid.Orders.properties.gridProperties.columnCount=37;f.grid.Orders.values[7][31]='unrelated input'},
    f=>{f.grid['Order Entry'].values[2][10]='COMMITTING'},f=>{f.grid['Order Entry'].values[7][10]='SENDING'},
    f=>{f.state.triggers.push(f.trigger('unrelatedBackgroundJob','CLOCK',''))},
    f=>{f.state.props.ORDER_AUTOMATION_CART_PENDING=JSON.stringify({operation:'WA-pending'})}
  ];
  for(const patch of patches){const f=migrationFixture();f.configure();patch(f);const before=f.copy(f.grid);assert.throws(()=>f.ctx.migrateOrderAutomationWorkspace());
    assert.equal(f.state.writes.length,0);assert.deepEqual(f.copy(f.grid),before);assert.equal(f.state.props.ORDER_AUTOMATION_PHASE,'LEGACY');}
});
test('A lost migration response is reconciled by fresh reads without repeating the batch',()=>{
  const f=migrationFixture();f.configure();f.state.throwAfter=true;
  assert.throws(()=>f.ctx.migrateOrderAutomationWorkspace(),/MIGRATION_RESPONSE_UNCERTAIN/);assert.equal(f.state.props.ORDER_AUTOMATION_PHASE,'MIGRATING');
  assert.equal(f.ctx.reconcileOrderAutomationMigration().phase,'MIGRATED');assert.equal(f.state.writes.length,1);
  assert.equal(f.ctx.migrateOrderAutomationWorkspace().changed,false);assert.equal(f.state.writes.length,1);
});
test('A confirmed unapplied migration returns to LEGACY and allows an explicit new attempt',()=>{
  const f=migrationFixture();f.configure();f.state.throwBefore=true;
  assert.throws(()=>f.ctx.migrateOrderAutomationWorkspace(),/MIGRATION_RESPONSE_UNCERTAIN/);assert.equal(f.state.writes.length,0);
  const result=f.ctx.reconcileOrderAutomationMigration();assert.equal(result.phase,'LEGACY');assert.equal(result.changed,false);assert.equal(f.state.writes.length,0);
  assert.equal(f.ctx.migrateOrderAutomationWorkspace().phase,'MIGRATED');assert.equal(f.state.writes.length,1);
});
test('Partial schema or widened ledger permissions cannot be silently repaired during reconciliation',()=>{
  for(const patch of [f=>{delete f.grid['Order Request Events']},f=>{f.grid['Order Requests'].protectedRanges[0].editors.users.push('other@example.test')}]){
    const f=migrationFixture();f.configure();f.state.throwAfter=true;assert.throws(()=>f.ctx.migrateOrderAutomationWorkspace());patch(f);
    assert.throws(()=>f.ctx.reconcileOrderAutomationMigration(),/RECONCILIATION_REQUIRED|protection needs review/);
    assert.equal(f.state.writes.length,1);assert.equal(f.state.props.ORDER_AUTOMATION_PHASE,'MIGRATING');
  }
});
test('Production activation retires only the two entry triggers, preserves feedback/packing, and keeps capture closed',()=>{
  const f=migrationFixture('PRODUCTION');f.state.props.FEEDBACK_LIVE_ENABLED='true';f.state.props.FEEDBACK_V2_SENDER_ENABLED='true';f.configure();f.ctx.migrateOrderAutomationWorkspace();
  const before=f.copy(f.grid['Order Entry'].values),result=f.ctx.activateOwnerOrderWorkspace();
  assert.equal(result.phase,'ACTIVE');assert.equal(result.retiredEntryTriggers,2);assert.equal(result.captureEnabled,false);
  assert.deepEqual(f.state.removed.map(t=>t.getHandlerFunction()),['orderEntryMenu','orderEntryEdited']);
  assert.deepEqual(f.state.triggers.map(t=>t.getHandlerFunction()).sort(),['orderRequestInboxOnOpen_','runFeedbackSender','showPackingSlipsMenu_'].sort());
  assert.equal(f.state.props.FEEDBACK_LIVE_ENABLED,'true');assert.equal(f.state.props.FEEDBACK_V2_SENDER_ENABLED,'true');assert.deepEqual(f.grid['Order Entry'].values,before);
  assert.equal(f.grid['Order Entry'].properties.hidden,true);const triggerCount=f.state.triggers.length;
  f.ctx.activateOwnerOrderWorkspace();assert.equal(f.state.triggers.length,triggerCount);
});
test('Saving candidate source preserves the original production feedback delegation and legacy menu before activation',()=>{
  const f=migrationFixture('PRODUCTION');let called=0;f.ctx.runFeedbackWebSender_=()=>{called++;return 'existing sender'};
  f.state.props.FEEDBACK_V2_SENDER_ENABLED='true';assert.equal(f.ctx.runFeedbackSender(),'existing sender');assert.equal(called,1);
  const menus=[];const menu={addItem(){return this},addSeparator(){return this},addToUi(){return this}};
  f.ctx.SpreadsheetApp.getUi=()=>({createMenu:name=>{menus.push(name);return menu}});f.ctx.orderEntryMenu();f.ctx.showPackingSlipsMenu_();
  assert.deepEqual(menus,['Order Entry','Packing Slips']);assert.equal(f.state.writes.length,0);assert.equal(f.state.triggers.length,4);
  assert.throws(()=>f.ctx.ownerOrderBootstrap(),/activate the owner workspace/);
});
test('The active owner opening handler also supplies the packing menu without an extra trigger',()=>{
  const f=migrationFixture();f.configure();f.ctx.migrateOrderAutomationWorkspace();f.ctx.activateOwnerOrderWorkspace();
  const menus=[],menu={addItem(){return this},addSeparator(){return this},addToUi(){return this}};
  f.ctx.mkOwnerBook_=()=>f.book;f.ctx.SpreadsheetApp.getUi=()=>({createMenu:name=>{menus.push(name);return menu}});
  const count=f.state.triggers.length;f.ctx.orderRequestInboxOnOpen_();
  assert.deepEqual(menus,['Website Requests','Packing Slips']);assert.equal(f.state.triggers.length,count);
  f.state.props.ORDER_AUTOMATION_PHASE='LEGACY';menus.length=0;f.ctx.orderRequestInboxOnOpen_();assert.deepEqual(menus,[]);
});
test('Delivery-charge repair preserves the existing calculations and all other data, then reruns without a write',()=>{
  const f=migrationFixture();f.configure();assert.throws(()=>f.ctx.repairOrderDeliveryChargeDisplay(),/Complete migration/);
  f.ctx.migrateOrderAutomationWorkspace();
  const fee='=IF(A42="","",IF(Z42<>"",AA42,10))',discount='=IF(A42="","",IF(AB42<=0,0,IF(O42>=AB42,AA42,0)))';
  f.grid.Orders.values[41][15]=fee;f.grid.Orders.values[41][16]=discount;
  const before=f.copy(f.grid),writes=f.state.writes.length,result=f.ctx.repairOrderDeliveryChargeDisplay();
  assert.equal(result.changedFormulaCount,2);assert.equal(f.state.writes.length,writes+1);
  const updated=f.copy(f.grid);updated.Orders.values[41][15]=fee;updated.Orders.values[41][16]=discount;assert.deepEqual(updated,before);
  for(const column of [15,16])assert.match(f.grid.Orders.values[41][column],/^=IF\(I42="Cancelled",0,/);
  assert.ok(f.grid.Orders.values[41][15].includes(fee.slice(1)));assert.ok(f.grid.Orders.values[41][16].includes(discount.slice(1)));
  const after=f.copy(f.grid);assert.equal(f.ctx.repairOrderDeliveryChargeDisplay().changedFormulaCount,0);
  assert.equal(f.state.writes.length,writes+1);assert.deepEqual(f.grid,after);
});
test('An occupied charge cell stops the complete repair before any formula is rewritten',()=>{
  const f=migrationFixture();f.configure();f.ctx.migrateOrderAutomationWorkspace();
  f.grid.Orders.values[1][15]='=10';f.grid.Orders.values[2][16]=10;
  const before=f.copy(f.grid),writes=f.state.writes.length;
  assert.throws(()=>f.ctx.repairOrderDeliveryChargeDisplay(),/formula needs review/);
  assert.equal(f.state.writes.length,writes);assert.deepEqual(f.copy(f.grid),before);
});
test('Production legacy dispatcher preserves menu, feedback, verified WhatsApp, Routific and challenge contracts',()=>{
  const f=migrationFixture('PRODUCTION'),calls=[];f.state.props.FLOW_MENU_API_SECRET='private-forward';f.state.props.CONTROL_TOWER_WEBHOOK_SECRET='private-route';
  f.state.props.WHATSAPP_VERIFY_TOKEN='verify-test';
  f.ctx.handleMenuApiRequest_=()=>{calls.push('menu');return 'menu'};f.ctx.handleFeedbackWebApiRequest_=(e,action)=>{calls.push(action);return 'feedback'};
  f.ctx.handleRoutificWebhook_=()=>{calls.push('routific');return 'routific'};f.ctx.processIncomingMessageOnce_=()=>{calls.push('message')};
  assert.equal(f.ctx.doPost({parameter:{action:'menu'}}),'menu');assert.equal(f.ctx.doPost({parameter:{action:'feedback_read'}}),'feedback');
  assert.equal(f.ctx.doPost({parameter:{},postData:{contents:JSON.stringify({controlTowerSecret:'private-route',payload:{}})}}),'routific');
  const event={entry:[{changes:[{value:{messages:[{id:'test'}]}}]}]};
  const response=f.ctx.doPost({parameter:{action:'whatsapp_verified'},postData:{contents:JSON.stringify({secret:'private-forward',payload:event})}});
  assert.equal(JSON.parse(response.getContent()).ok,true);assert.deepEqual(calls,['menu','feedback_read','routific','message']);
  assert.equal(f.ctx.doGet({parameter:{'hub.mode':'subscribe','hub.verify_token':'verify-test','hub.challenge':'123456'}}).getContent(),'123456');
});
test('Signed capture is off before activation, owner RPC names are not routed, and pause preserves signed recovery',()=>{
  const f=migrationFixture();f.configure();let actions=[];f.ctx.handleOrderRequestApi_=(e,action)=>{actions.push(action);return action};
  const call=action=>f.ctx.doPost({parameter:{action}});
  assert.equal(JSON.parse(call('order_request_capture').getContent()).error,'ORDER_REQUEST_NOT_READY');
  for(const action of ['ownerOrderAccept','ownerOrderSaveCustomer','menu','whatsapp_verified'])assert.equal(JSON.parse(call(action).getContent()).error,'LEGACY_INGRESS_DISABLED_IN_REHEARSAL');
  f.ctx.migrateOrderAutomationWorkspace();f.ctx.activateOwnerOrderWorkspace();assert.equal(JSON.parse(call('order_request_capture').getContent()).error,'ORDER_REQUEST_NOT_READY');
  f.state.props.ORDER_AUTOMATION_CAPTURE_ENABLED='true';assert.equal(call('order_request_capture'),'order_request_capture');
  f.ctx.pauseOrderAutomationWorkspace();assert.equal(JSON.parse(call('order_request_capture').getContent()).error,'ORDER_REQUEST_NOT_READY');
  assert.equal(call('order_request_recover'),'order_request_recover');assert.deepEqual(actions,['order_request_capture','order_request_recover']);
});
test('The staged production publisher preserves the schema-1 contract before migration without requiring new ledgers',()=>{
  const f=migrationFixture('PRODUCTION');f.state.props.ORDER_MENU_GITHUB_TOKEN='test-placeholder';let written;
  f.ctx.buildActiveMenu_=()=>({});f.ctx.mkOrderSnapshot_=()=>({schemaVersion:2,menuRevision:'revision',minimumOrderItems:5,deliveryFeeCents:1000,
    menuCycleId:'MENU-'+date,deliveryDate:date,publishedAt:'2026-10-19T00:00:00Z',meals:[{id:'i_public',dishName:'Dish',price:15}]});
  f.ctx.mkOrderGithub_=(method,url,token,payload)=>{if(method==='get')return {type:'file',sha:'a'.repeat(40)};written=JSON.parse(Buffer.from(payload.content,'base64').toString());return {commit:{sha:'b'.repeat(40)}}};
  f.ctx.Utilities.base64Encode=value=>Buffer.from(value).toString('base64');
  f.ctx.mkOrderSavePublishedState_=()=>{throw new Error('new ledger touched before migration')};
  assert.equal(f.ctx.publishCurrentOrderingMenu().changed,true);assert.equal(written.schemaVersion,1);assert.equal(written.menuRevision,undefined);assert.equal(written.meals[0].id,undefined);
});

for(const release of ['production-rehearsal','production-candidate']){
  test(release+': owner and cart commits retain cancellation guards on both delivery-charge columns',()=>{
    const owner=fixture({release}),review=owner.ctx.ownerOrderReview(owner.input());owner.ctx.ownerOrderAccept(review.id,review.hash);
    const cart=fixture({release});cart.state.lock=true;
    const menu={status:'ACTIVE',deliveryDate:date,meals:[{itemCode:'M0001',dishName:'Test Dish',price:15}]};
    const draft={items:{M0001:5},customerName:'Test Person',orderCustomerPhone:'61400000001',deliveryAddress:'1 Test Street, Greenacre 2190',postcode:'2190'};
    cart.ctx.createControlTowerOrder_('61400000001',draft,menu,{customerId:'CUST-000001'},cart.ctx.calculateCartQuote_(draft,menu));
    for(const f of [owner,cart])for(const column of [16,17]){
      const formula=f.formulas.Orders['2:'+column];assert.match(formula,/^=IF\(I2="Cancelled",0,/);
      const request=f.ctx.mkOwnerRowFormulaRequests_(f.sheets.Orders,2,f.sheets['Order Items'],[3])
        .find(r=>r.updateCells.range?.startColumnIndex===column-1||r.updateCells.start?.columnIndex===column-1);
      assert.ok(request,'charge formula included in every writer commit');
      assert.equal(f.ctx.mkReleaseZeroCancelledCharge_(formula,2),formula);
    }
  });
  test(release+': an owner order verifies, retries without duplication, and preserves the saved customer identity',()=>{
    const f=fixture({release});f.ctx.SpreadsheetApp.flush();const before=JSON.stringify(f.tables.Customers),review=f.ctx.ownerOrderReview(f.input());
    const result=f.ctx.ownerOrderAccept(review.id,review.hash);assert.equal(result.state,'VERIFIED');assert.equal(result.orderId,'ORD-000001');
    assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).orderId,result.orderId);assert.equal(f.tables.Orders.length,2);assert.equal(JSON.stringify(f.tables.Customers),before);
    f.state.owner='';assert.throws(()=>f.ctx.ownerOrderReview(f.input()),/OWNER_REQUIRED/);
  });
  test(release+': shared IDs reserve across existing orders, owner journal and old entry metadata',()=>{
    const f=fixture({release});f.add('Orders',['ORD-000052']);f.add('Order Operation Journal',['old-op','','ORD-000058','NOT_RECORDED']);
    const legacy=Array.from({length:18},()=>Array(11).fill(''));legacy[5][10]='ORD-000060';
    f.tables['Order Entry']=legacy;f.sheets['Order Entry']={getName:()=> 'Order Entry',getParent:()=>f.book,getMaxRows:()=>18};
    assert.throws(()=>f.ctx.mkReleaseNextOrderId_(f.sheets.Orders),/SHARED_LOCK_REQUIRED/);
    f.state.lock=true;assert.equal(f.ctx.mkReleaseNextOrderId_(f.sheets.Orders),'ORD-000061');assert.equal(f.ctx.mkReleaseNextOrderId_(f.sheets.Orders),'ORD-000062');
  });
  test(release+': cart checkout uses the same rounding, frozen snapshots and ID sequence as the owner workspace',()=>{
    const f=fixture({release});f.state.lock=true;
    const menu={status:'ACTIVE',deliveryDate:date,meals:[{itemCode:'M0001',dishName:'Test Dish',price:15}]};
    const cart={items:{M0001:5},customerName:'Test Person',orderCustomerPhone:'61400000001',deliveryAddress:'1 Test Street, Greenacre 2190',postcode:'2190'};
    const quote=f.ctx.calculateCartQuote_(cart,menu),result=f.ctx.createControlTowerOrder_('61400000001',cart,menu,{customerId:'CUST-000001',name:'Test Person',phone:'61400000001',postcode:'2190'},quote);
    assert.equal(result.orderId,'ORD-000001');assert.equal(result.orderCheck,'OK');assert.equal(f.tables.Orders[1][11],70);assert.match(f.tables.Orders[1][36],/^WA-/);
    assert.equal(f.tables['Order Items'][2][25],'COOK-1');assert.equal(f.scriptProperties.ORDER_AUTOMATION_CART_PENDING,undefined);
    assert.throws(()=>f.ctx.createControlTowerOrder_('61400000001',cart,menu,{customerId:'CUST-000001'},quote),/already has an order attempt/);
    f.state.lock=false;const review=f.ctx.ownerOrderReview(f.input());assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).orderId,'ORD-000002');
  });
  test(release+': a lost cart commit response preserves one operation and blocks other writers until reconciliation',()=>{
    const f=fixture({release});f.state.lock=true;f.state.throwAfter=true;
    const menu={status:'ACTIVE',deliveryDate:date,meals:[{itemCode:'M0001',dishName:'Test Dish',price:15}]};
    const cart={items:{M0001:5},customerName:'Test Person',orderCustomerPhone:'61400000001',deliveryAddress:'1 Test Street, Greenacre 2190',postcode:'2190'};
    const quote=f.ctx.calculateCartQuote_(cart,menu);
    assert.throws(()=>f.ctx.createControlTowerOrder_('61400000001',cart,menu,{customerId:'CUST-000001'},quote),/SUBMISSION_UNCERTAIN/);
    assert.equal(f.tables.Orders.length,2);assert.match(f.scriptProperties.ORDER_AUTOMATION_CART_PENDING,/WA-/);
    assert.throws(()=>f.ctx.mkReleaseAssertWriter_(f.book,'owner'),/outstanding legacy cart/);
    const reconciled=f.ctx.reconcileLegacyCartOrders();assert.equal(reconciled.state,'VERIFIED');assert.equal(reconciled.messagesSent,0);assert.equal(f.tables.Orders.length,2);
    assert.equal(f.scriptProperties.ORDER_AUTOMATION_CART_PENDING,undefined);
  });
  test(release+': a cart customer retry keeps its original intake identity and does not opt a new customer into feedback',()=>{
    const f=fixture({release});f.state.lock=true;f.state.customerPending=true;
    const cart={customerName:'New Cart Customer',orderCustomerPhone:'61400000002',deliveryAddress:'2 Test Street 2190',postcode:'2190'};
    assert.throws(()=>f.ctx.mkReleaseCartCustomer_('61400000002',cart),/recalculation is pending/);
    const operation=cart.customerOperationId;assert.equal(f.tables['Customer Intake'].length,3);assert.equal(typeof f.tables['Customer Intake'][2][4],'number');
    assert.equal(f.tables['Customer Intake'][2][8],false);f.state.customerPending=false;
    const result=f.ctx.mkReleaseCartCustomer_('61400000002',cart);assert.equal(result.customerId,'CUST-000002');assert.equal(cart.customerOperationId,operation);
    assert.equal(f.tables['Customer Intake'].length,3);assert.equal(f.tables.Customers[1][0],'CUST-000001');
    assert.equal(f.ctx.mkReleaseCartCustomer_('61400000002',cart).customerId,result.customerId);assert.equal(f.tables['Customer Intake'].length,3);
  });
  test(release+': an unapplied cart commit waits for explicit reconciliation and never reuses the planned order ID',()=>{
    const f=fixture({release});f.state.lock=true;f.state.throwBefore=true;
    const menu={status:'ACTIVE',deliveryDate:date,meals:[{itemCode:'M0001',dishName:'Test Dish',price:15}]};
    const cart={items:{M0001:5},customerName:'Test Person',orderCustomerPhone:'61400000001',deliveryAddress:'1 Test Street, Greenacre 2190',postcode:'2190'};
    assert.throws(()=>f.ctx.createControlTowerOrder_('61400000001',cart,menu,{customerId:'CUST-000001'},f.ctx.calculateCartQuote_(cart,menu)),/SUBMISSION_UNCERTAIN/);
    assert.equal(f.tables.Orders.length,1);assert.throws(()=>f.ctx.reconcileLegacyCartOrders(),/Wait seven minutes/);
    f.state.now+=420001;assert.equal(f.ctx.reconcileLegacyCartOrders().state,'NOT_RECORDED');assert.equal(f.scriptProperties.ORDER_AUTOMATION_CART_PENDING,undefined);
    const review=f.ctx.ownerOrderReview(f.input());assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).orderId,'ORD-000002');
  });
  test(release+': fractional discounts use identical cart and owner unit rounding while LEGACY keeps its prior calculation',()=>{
    const f=fixture({release});f.tables['Menu Config'].find(row=>row[0]==='Standard Discount %')[1]='12.5';
    f.tables['Weekly Menu'][1][7]=15.01;
    const cart={items:{M0001:5}},menu={meals:[{itemCode:'M0001',price:15.01}]};
    const quote=f.ctx.calculateCartQuote_(cart,menu),owner=f.ctx.mkQuote_({deliveryDate:date,items:[{menuLineId:lineId,quantity:5}]},f.ctx.mkMenuLines_(f.book,date),f.ctx.getOrderingRules_(),{});
    assert.equal(Math.round(quote.total*100),owner.totalCents);assert.equal(quote.discountedSubtotal,65.65);
    f.scriptProperties.ORDER_AUTOMATION_PHASE='LEGACY';assert.equal(f.ctx.calculateCartQuote_(cart,menu).discountedSubtotal,65.67);
  });
  test(release+': an open cart whose total changes at migration gets another final review before any operational commit',()=>{
    const f=fixture({release});f.tables['Menu Config'].find(row=>row[0]==='Standard Discount %')[1]='12.5';
    const cart={items:{M0001:5},customerName:'Test Person',orderCustomerPhone:'61400000001',deliveryAddress:'1 Test Street 2190',postcode:'2190',quote:{total:75.67}};
    f.ctx.saveCart_('61400000001',cart);f.ctx.buildActiveMenu_=()=>({status:'ACTIVE',deliveryDate:date,meals:[{itemCode:'M0001',price:15.01,remainingServings:50}]});
    f.ctx.mkReleaseCartCustomer_=()=>({customerId:'CUST-000001'});let reviews=0;f.ctx.sendFinalConfirmation_=()=>{reviews++};f.ctx.sendTextMessage_=()=>{throw new Error('Unexpected message')};
    f.ctx.placeOrder_('61400000001');assert.equal(reviews,1);assert.equal(f.tables.Orders.length,1);assert.equal(f.tables['Order Operation Journal'].length,1);
  });
  test(release+': an enabled capture still requires a real signed envelope',()=>{
    const f=fixture({release}),result=f.ctx.doPost({parameter:{action:'order_request_capture'},postData:{contents:'{}'}});
    assert.equal(JSON.parse(result.getContent()).error,'INVALID_ENVELOPE');assert.equal(f.tables['Order Requests'].length,1);assert.equal(f.state.batches,0);
  });
  test(release+': saved order checks detect later changes to delivery date, kitchen identity and pricing snapshots',()=>{
    for(const mutate of [f=>{f.tables.Orders[1][2]='2026-10-29'},f=>{f.tables['Order Items'][2][26]='OTHER'},f=>{f.tables.Orders[1][25]=10}]){
      const f=fixture({release}),review=f.ctx.ownerOrderReview(f.input());assert.equal(f.ctx.ownerOrderAccept(review.id,review.hash).state,'VERIFIED');mutate(f);
      assert.equal(f.ctx.ownerOrderCheck(review.id).state,'REVIEW_REQUIRED');assert.equal(f.tables.Orders.length,2);
    }
  });
}
