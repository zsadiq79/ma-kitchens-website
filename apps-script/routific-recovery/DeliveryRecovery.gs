/* Candidate module. Consolidate into Code.gs with build-recovery.cjs.
 * OFF by default. No top-level side effects. Ingress never reads the workbook.
 */
const MK_RV2=Object.freeze({version:'2026-11-01-candidate-1',prefix:'MK_RV2_',mode:'MK_RV2_MODE',cutoff:'MK_RV2_NOT_BEFORE',
  route:'MK_RV2_ROUTE_',event:'MK_RV2_EVENT_',send:'MK_RV2_SEND_',track:'MK_RV2_TRACK_',lease:'MK_RV2_WORKER_LEASE',
  journey:'delivery_journey_started_eta',next:'delivery_next_eta',delivered:'delivery_confirmation_5'});

function rv2Mode_(){const value=PropertiesService.getScriptProperties().getProperty(MK_RV2.mode)||'OFF';
  if(!['OFF','CAPTURE','LIVE','PAUSED','TEST'].includes(value))throw new Error('RECOVERY_MODE_INVALID');return value;}
function rv2Active_(){return ['LIVE','TEST'].includes(rv2Mode_());}
function rv2SendPrefix_(){return rv2Mode_()==='TEST'?MK_RV2.prefix+'TEST_SEND_':MK_RV2.send;}
function rv2JobPrefix_(){return rv2Mode_()==='TEST'?MK_RV2.prefix+'TEST_ROUTE_JOB_':MK_RV2.route;}
function rv2Json_(raw){if(!raw)return null;try{return JSON.parse(raw);}catch(_){throw new Error('RECOVERY_RECORD_INVALID');}}
function rv2Lock_(fn){const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('RECOVERY_BUSY');
  try{return fn();}finally{lock.releaseLock();}}
function rv2Set_(props,key,value){const raw=JSON.stringify(value);if(Utilities.newBlob(raw).getBytes().length>8000)throw new Error('RECOVERY_RECORD_TOO_LARGE');props.setProperty(key,raw);}
function rv2Date_(value){return typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;}
function rv2SafeCode_(e){const code=e && e.message;return typeof code==='string' && /^(RECOVERY|ETA)_[A-Z0-9_]+$/.test(code) ? code : 'RECOVERY_DEPENDENCY_ERROR';}

function handleRoutificRecoveryIngress_(e){
  try{
    mkReleaseBinding_(false);
    const props=PropertiesService.getScriptProperties(),body=JSON.parse(e.postData.contents||'{}');
    const expected=props.getProperty('CONTROL_TOWER_WEBHOOK_SECRET');
    if(!expected || body.controlTowerSecret!==expected)return orderRequestJson_({status:401});
    if(rv2Mode_()==='OFF')return orderRequestJson_({status:503,error:'RECOVERY_NOT_PREPARED'});
    return orderRequestJson_(rv2Accept_(body.recoveryEvent));
  }catch(e){return orderRequestJson_({status:503,error:rv2SafeCode_(e)});}
}
function rv2Accept_(event){
  if(!event || event.version!==1 || !/^[a-f0-9]{64}$/.test(event.key) || !event.payload ||
    !['route.published','route.eta_updated','order.status_updated'].includes(event.payload.type))throw new Error('RECOVERY_EVENT_INVALID');
  const payload=event.payload,route=payload.data && payload.data.route,eventAt=rv2Date_(payload.timestamp);
  if(!route || !mkEtaUuid_(route.uuid) || !Number.isFinite(eventAt) || eventAt>Date.now()+60000)throw new Error('RECOVERY_EVENT_INVALID');
  return rv2Lock_(function(){
    const props=PropertiesService.getScriptProperties(),test=rv2Json_(props.getProperty(MK_RV2.prefix+'TEST_CONFIG'));
    const eventKey=MK_RV2.event+event.key,routeKey=(test && test.routeUuid===route.uuid?MK_RV2.prefix+'TEST_ROUTE_JOB_':MK_RV2.route)+route.uuid;
    if(!props.getProperty(eventKey)){
      const previous=rv2Json_(props.getProperty(routeKey));
      const job=previous || {routeUuid:route.uuid,firstReceivedAt:Date.now(),attempts:0};
      job.eventAt=Math.max(Number(job.eventAt)||0,eventAt);job.lastReceivedAt=Date.now();job.nextPollAt=0;job.reviewRequired=false;
      // Work is persisted before recording event acceptance, so partial writes are retryable.
      rv2Set_(props,routeKey,job);
      rv2Set_(props,eventKey,{acceptedAt:Date.now()});
    }
    return {status:200,recoveryVersion:1,eventKey:event.key,durablyStored:true};
  });
}

function rv2Get_(path){
  if(LockService.getScriptLock().hasLock())throw new Error('RECOVERY_NETWORK_UNDER_LOCK');
  const token=PropertiesService.getScriptProperties().getProperty('ROUTIFIC_API_TOKEN');
  if(!token)throw new Error('RECOVERY_ROUTIFIC_TOKEN_MISSING');
  if(!/^\/v2\/(?:routes(?:\/|\?)|orders\/)/.test(path))throw new Error('RECOVERY_API_PATH_INVALID');
  const response=mkReleaseFetch_('https://api.plan.routific.com'+path,{method:'get',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},followRedirects:false,muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('RECOVERY_ROUTIFIC_HTTP_'+response.getResponseCode());
  try{return JSON.parse(response.getContentText());}catch(_){throw new Error('RECOVERY_ROUTIFIC_JSON_INVALID');}
}
function rv2Timeline_(uuid,deadline){
  if(!mkEtaUuid_(uuid))throw new Error('RECOVERY_ROUTE_INVALID');
  const path='/v2/routes/'+uuid+'/timeline',items=[],seen={};let cursor=null,pages=0;
  do{
    if(Date.now()>deadline)throw new Error('RECOVERY_TIME_BUDGET');
    const page=rv2Get_(path+(cursor?'?cursor='+encodeURIComponent(cursor):''));
    if(!page || !Array.isArray(page.items))throw new Error('RECOVERY_TIMELINE_INVALID');
    items.push.apply(items,page.items);pages++;
    if(items.length>5000 || pages>20)throw new Error('RECOVERY_TIMELINE_TOO_LARGE');
    cursor=page.nextCursor || null;
    if(cursor && (typeof cursor!=='string' || cursor.length>2000 || seen[cursor]))throw new Error('RECOVERY_CURSOR_INVALID');
    if(cursor)seen[cursor]=true;
  }while(cursor);
  return {items:items,fetchedAt:Date.now(),pages:pages};
}
function rv2Order_(uuid,id){
  if(!mkEtaUuid_(uuid) || !/^ORD-\d+$/.test(id))throw new Error('RECOVERY_ORDER_INVALID');
  const data=rv2Get_('/v2/orders/'+uuid);
  if(!data || (data.uuid && data.uuid!==uuid) || String(data.customerOrderNumber||'').trim()!==id)throw new Error('RECOVERY_ORDER_IDENTITY_MISMATCH');
  return data;
}
function rv2Tracking_(uuid,id){
  const props=PropertiesService.getScriptProperties(),key=MK_RV2.track+uuid,cached=rv2Json_(props.getProperty(key));
  if(cached && cached.orderId===id && Date.now()-cached.at<86400000)return cached;
  const data=rv2Order_(uuid,id),url=data.deliveryTracking && data.deliveryTracking.shortUrl;
  if(typeof url!=='string' || !/^https:\/\/routi\.fi\/[A-Za-z0-9_-]+$/.test(url))throw new Error('RECOVERY_TRACKING_INVALID');
  const location=data.location || (Array.isArray(data.locations) && data.locations.length===1 ? data.locations[0] : {}),coordinates=[location.latitude,location.longitude];
  const physical=coordinates.every(function(v){return typeof v==='number' && Number.isFinite(v);})
    ? coordinates.join(',') : typeof location.address==='string' && location.address.trim() ? location.address.trim().toLowerCase().replace(/\s+/g,' ') : '';
  const record={orderId:id,at:Date.now(),suffix:url.slice('https://routi.fi/'.length),physicalKey:physical?fwHash_(physical):null};
  // Cache is independent of writer locking. It is immutable for this order identity.
  rv2Set_(props,key,record);return record;
}

function rv2Tables_(){
  const book=rv2Mode_()==='TEST'?rv2TestBook_():mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID),tables={book:book};
  const required={Orders:['Order ID','Delivery Date','Customer ID','Customer Name','Phone','Order Status'],
    Deliveries:['Order ID','Routific ID','Delivery Status','Delivered At'],
    Customers:['Customer ID','Name','Phone','WhatsApp Opt-In'], 'WhatsApp Log':['Message ID','Order ID','Message Type','Status']};
  Object.keys(required).forEach(function(name){
    const sheet=book.getSheetByName(name);if(!sheet)throw new Error('RECOVERY_SHEET_MISSING');
    const rows=sheet.getDataRange().getValues(),head=rows.shift()||[],columns={};
    head.forEach(function(h,i){h=String(h).trim();if(h && columns[h]!==undefined)throw new Error('RECOVERY_DUPLICATE_HEADER');if(h)columns[h]=i;});
    if(required[name].some(function(h){return columns[h]===undefined;}))throw new Error('RECOVERY_HEADER_MISSING');
    tables[name]={sheet:sheet,rows:rows,columns:columns,width:head.length};
  });return tables;
}
function rv2Find_(table,header,id){
  const found=table.rows.map(function(row,i){return {row:row,number:i+2};})
    .filter(function(x){return String(x.row[table.columns[header]]||'').trim()===id;});
  if(found.length>1)throw new Error('RECOVERY_DUPLICATE_IDENTITY');return found[0]||null;
}
function rv2Logged_(tables,id,stage){const table=tables['WhatsApp Log'];
  const stages=stage===MK_RV2.journey?[stage,'delivery_update_2']:stage===MK_RV2.next?[stage]:[MK_RV2.delivered];
  return table.rows.some(function(row){return String(row[table.columns['Order ID']]||'').trim()===id && stages.includes(String(row[table.columns['Message Type']]||'').trim());});}
function rv2Existing_(tables,item){
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty(rv2SendPrefix_()+item.orderId+'_'+item.stage))return true;
  if(rv2Mode_()!=='TEST' && item.stage!==MK_RV2.delivered && props.getProperty('MK_ETA_SEND_'+item.orderId+'_'+item.stage))return true;
  return rv2Logged_(tables,item.orderId,item.stage);
}
function rv2Recipient_(tables,item,fresh){
  const ot=tables.Orders,dt=tables.Deliveries,ct=tables.Customers;
  const order=rv2Find_(ot,'Order ID',item.orderId),delivery=rv2Find_(dt,'Order ID',item.orderId);
  if(!order || !delivery)return null;
  const read=function(t,found){
    if(!fresh)return found.row;
    const row=t.sheet.getRange(found.number,1,1,t.width).getValues()[0];
    if(String(row[0]||'')!==String(found.row[0]||''))throw new Error('RECOVERY_ROW_CHANGED');return row;
  };
  const o=read(ot,order),d=read(dt,delivery);
  if(String(o[ot.columns['Order Status']]).trim()!=='Confirmed' || String(d[dt.columns['Routific ID']]).trim()!==item.uuid)return null;
  if(item.stage!==MK_RV2.delivered && ['delivered','cancelled'].includes(String(d[dt.columns['Delivery Status']]).trim().toLowerCase()))return null;
  const date=o[ot.columns['Delivery Date']];
  if(!(date instanceof Date) || Utilities.formatDate(date,'Australia/Sydney','yyyy-MM-dd')!==Utilities.formatDate(new Date(item.referenceAt),'Australia/Sydney','yyyy-MM-dd'))return null;
  const customer=rv2Find_(ct,'Customer ID',String(o[ot.columns['Customer ID']]||'').trim());if(!customer)return null;
  const c=read(ct,customer);if(String(c[ct.columns['WhatsApp Opt-In']]||'').trim().toUpperCase()!=='Y')return null;
  const phone=routePublishedNormalisePhone_(String(o[ot.columns.Phone]||c[ct.columns.Phone]||'').trim());
  const name=routePublishedFirstName_(String(o[ot.columns['Customer Name']]||c[ct.columns.Name]||'').trim());
  return name && /^614\d{8}$/.test(phone)?{phone:phone,name:name}:null;
}

function rv2Plan_(snapshot,cutoff,now,physicalKeys){
  const starts=snapshot.items.filter(function(s){return s && s.type==='start_location';});
  const departure=starts.length===1 ? rv2Date_(starts[0].actualDepartureTime) : NaN;
  if(!Number.isFinite(departure) || departure<cutoff || departure>now)return {eligible:false,items:[],departure:departure};
  const stops=snapshot.items.filter(function(s){return s && s.type==='delivering_stop' && Array.isArray(s.orders);});
  const seen={},output=[],pending=stops.filter(function(s){return s.orders.some(function(o){return o.status==='scheduled';});});
  const next=pending[0],nextIndex=stops.indexOf(next);
  const samePhysical=function(a,b){
    if(a===b)return true;
    if(a.stopUuid && b.stopUuid)return a.stopUuid===b.stopUuid;
    if(a.plannedArrivalTime!==b.plannedArrivalTime || a.plannedDepartureTime!==b.plannedDepartureTime)return false;
    const keys=function(stop){return stop.orders.map(function(o){return physicalKeys[o.uuid];});};
    const ak=keys(a),bk=keys(b);return ak.length && bk.length && ak.every(function(k){return k && k===ak[0];}) && bk.every(function(k){return k===ak[0];});
  };
  const priorUnfinished=nextIndex>=0 && stops.slice(0,nextIndex).some(function(s){return s.orders.length && !s.actualDepartureTime && !samePhysical(s,next);});
  let groupOpen=true;
  const nextGroup=new Set();
  stops.forEach(function(stop,index){
    if(index>=nextIndex && nextIndex>=0 && groupOpen){if(samePhysical(next,stop))nextGroup.add(stop);else groupOpen=false;}
    const eta=rv2Date_(stop.plannedArrivalTime);
    stop.orders.forEach(function(order){
      if(!/^ORD-\d+$/.test(order.customerOrderNumber||'') || !mkEtaUuid_(order.uuid))return;
      if(seen[order.customerOrderNumber])throw new Error('RECOVERY_DUPLICATE_ROUTE_ORDER');seen[order.customerOrderNumber]=true;
      const base={orderId:order.customerOrderNumber,uuid:order.uuid,referenceAt:departure};
      if(order.status==='delivered'){output.push(Object.assign({},base,{stage:MK_RV2.delivered}));return;}
      if(order.status==='missed'){output.push(Object.assign({},base,{stage:'RECOVERY_INTERNAL_MISSED'}));return;}
      if(order.status!=='scheduled' || !Number.isFinite(eta) || eta<=now || stop.actualArrivalTime || stop.actualDepartureTime)return;
      output.push(Object.assign({},base,{stage:MK_RV2.journey,eta:eta,priority:nextGroup.has(stop)?1:3}));
      if(!priorUnfinished && nextGroup.has(stop))output.push(Object.assign({},base,{stage:MK_RV2.next,eta:eta,priority:2}));
    });
  });
  // Next-stop notifications expire quickly; completed-order confirmations do not.
  output.sort(function(a,b){return (a.priority||4)-(b.priority||4);});
  return {eligible:true,items:output,departure:departure};
}

function rv2Reserve_(tables,item,owner){
  return rv2Lock_(function(){
    const props=PropertiesService.getScriptProperties();
    if(!rv2Active_())return null;
    const lease=rv2Json_(props.getProperty(MK_RV2.lease));
    if(!lease || lease.owner!==owner || lease.until<Date.now())throw new Error('RECOVERY_WORKER_LEASE_LOST');
    if(rv2Existing_(tables,item))return null;
    if(item.stage===MK_RV2.next){
      const journey=rv2Json_(props.getProperty(rv2SendPrefix_()+item.orderId+'_'+MK_RV2.journey)) ||
        (rv2Mode_()!=='TEST'?rv2Json_(props.getProperty('MK_ETA_SEND_'+item.orderId+'_'+MK_RV2.journey)):null);
      if(!(journey && journey.state==='ACCEPTED') && !rv2Logged_(tables,item.orderId,MK_RV2.journey))return null;
    }
    if(item.stage!==MK_RV2.delivered && (item.eta<=Date.now() || Date.now()-item.snapshotAt>20000))throw new Error('RECOVERY_SNAPSHOT_EXPIRED');
    const recipient=rv2Recipient_(tables,item,true);if(!recipient)return null;
    if(rv2Mode_()==='TEST')rv2AssertTestItem_(tables,item,recipient);
    const record={state:'SENDING',attemptId:Utilities.getUuid(),attemptAt:new Date().toISOString(),orderId:item.orderId,stage:item.stage,
      recipient:recipient.phone,routeUuid:item.routeUuid,test:rv2Mode_()==='TEST',eta:item.eta?new Date(item.eta).toISOString():null};
    rv2Set_(props,rv2SendPrefix_()+item.orderId+'_'+item.stage,record);
    rv2Set_(props,MK_RV2.lease,{owner:owner,until:Date.now()+90000});
    return {record:record,recipient:recipient};
  });
}
function rv2Send_(tables,item,owner,tracking){
  const prepared=rv2Reserve_(tables,item,owner);if(!prepared)return false;
  if(LockService.getScriptLock().hasLock())throw new Error('RECOVERY_NETWORK_UNDER_LOCK');
  let messageId;
  try{
    messageId=item.stage===MK_RV2.delivered ? sendDeliveryConfirmationTemplate_(prepared.recipient.phone,prepared.recipient.name,item.orderId).messageId
      : mkEtaSend_(item,prepared.recipient,tracking.suffix);
    if(typeof messageId!=='string' || !messageId)throw new Error('RECOVERY_META_ID_MISSING');
  }catch(_){console.error(JSON.stringify({diagnostic:'RECOVERY_SEND_UNCERTAIN',orderId:item.orderId,stage:item.stage}));return false;}
  // The durable acceptance record precedes spreadsheet logging. Logging can be repaired without resending.
  const record=Object.assign({},prepared.record,{state:'ACCEPTED',messageId:messageId,acceptedAt:new Date().toISOString()});
  const sendKey=(record.test?MK_RV2.prefix+'TEST_SEND_':MK_RV2.send)+item.orderId+'_'+item.stage;
  PropertiesService.getScriptProperties().setProperty(sendKey,JSON.stringify(record));
  rv2RegisterLog_(tables,record);
  record.logged=true;PropertiesService.getScriptProperties().setProperty(sendKey,JSON.stringify(record));
  return true;
}
function rv2MarkDelivered_(tables,item,detail){
  const at=rv2Date_(detail.deliveryTime);
  if((item.stage===MK_RV2.delivered && detail.status!=='delivered') ||
    (item.stage==='RECOVERY_INTERNAL_MISSED' && detail.status!=='missed'))throw new Error('RECOVERY_SNAPSHOT_EXPIRED');
  if(!['delivered','missed'].includes(detail.status) || detail.status==='delivered' && !Number.isFinite(at))throw new Error('RECOVERY_DELIVERY_EVIDENCE_INCOMPLETE');
  return rv2Lock_(function(){
    if(!rv2Active_())return;
    if(rv2Mode_()==='TEST')rv2AssertTestItem_(tables,item,null);
    const ot=tables.Orders,dt=tables.Deliveries,order=rv2Find_(ot,'Order ID',item.orderId),delivery=rv2Find_(dt,'Order ID',item.orderId);
    if(!order || !delivery)throw new Error('RECOVERY_IDENTITY_MISSING');
    const o=ot.sheet.getRange(order.number,1,1,ot.sheet.getLastColumn()).getValues()[0];
    const d=dt.sheet.getRange(delivery.number,1,1,dt.sheet.getLastColumn()).getValues()[0];
    if(String(o[ot.columns['Order ID']])!==item.orderId || String(d[dt.columns['Order ID']])!==item.orderId ||
      String(d[dt.columns['Routific ID']])!==item.uuid)throw new Error('RECOVERY_ROW_CHANGED');
    if(String(o[ot.columns['Order Status']])!=='Confirmed')return;
    const deliveryDate=o[ot.columns['Delivery Date']];
    if(!(deliveryDate instanceof Date) || Utilities.formatDate(deliveryDate,'Australia/Sydney','yyyy-MM-dd')!==
      Utilities.formatDate(new Date(item.referenceAt),'Australia/Sydney','yyyy-MM-dd'))throw new Error('RECOVERY_DELIVERY_DATE_MISMATCH');
    if(String(d[dt.columns['Delivery Status']])==='Delivered' && (detail.status==='missed' || d[dt.columns['Delivered At']] instanceof Date))return;
    const target=detail.status==='delivered'?'Delivered':'Failed';
    const requests=[fwCell_(dt.sheet,delivery.number,dt.columns['Delivery Status'],target)];
    if(detail.status==='delivered')requests.push(fwCell_(dt.sheet,delivery.number,dt.columns['Delivered At'],new Date(at)));
    if(dt.columns['Delivery Notes']!==undefined && typeof detail.deliveryNotes==='string' && detail.deliveryNotes)
      requests.push(fwCell_(dt.sheet,delivery.number,dt.columns['Delivery Notes'],detail.deliveryNotes.slice(0,2000)));
    rv2Batch_(tables,requests);d[dt.columns['Delivery Status']]=target;
    if(detail.status==='delivered')d[dt.columns['Delivered At']]=new Date(at);
    delivery.row.splice(0,delivery.row.length,...d);
  });
}

function rv2RepairLog_(tables,record){
  if(record.state!=='ACCEPTED' || !record.messageId || !record.orderId || !record.stage || !record.recipient)return;
  if(!rv2Logged_(tables,record.orderId,record.stage))rv2RegisterLog_(tables,record);
  record.logged=true;rv2Set_(PropertiesService.getScriptProperties(),(record.test?MK_RV2.prefix+'TEST_SEND_':MK_RV2.send)+record.orderId+'_'+record.stage,record);
}
function runRoutificRecoveryWorker_(){
  mkReleaseBinding_(false);if(!rv2Active_())return;
  const props=PropertiesService.getScriptProperties(),started=Date.now(),deadline=started+40000,owner=Utilities.getUuid();
  let acquired;
  try{acquired=rv2Lock_(function(){const old=rv2Json_(props.getProperty(MK_RV2.lease));if(old && old.until>Date.now())return false;
    rv2Set_(props,MK_RV2.lease,{owner:owner,until:Date.now()+90000});return true;});}
  catch(e){if(rv2SafeCode_(e)!=='RECOVERY_BUSY')throw e;console.log(JSON.stringify({diagnostic:'RECOVERY_WORKER_DEFERRED',reason:'SHARED_LOCK_BUSY'}));return;}
  if(!acquired)return;
  let sent=0,errors=0;
  try{
    const cutoff=rv2Date_(props.getProperty(MK_RV2.cutoff));if(!Number.isFinite(cutoff))throw new Error('RECOVERY_CUTOFF_MISSING');
    try{rv2Discover_(deadline);}catch(e){props.setProperty(MK_RV2.prefix+'DISCOVERY_ERROR',rv2SafeCode_(e));}
    const all=props.getProperties();
    const repairs=Object.keys(all).filter(function(k){if(!k.startsWith(rv2SendPrefix_()))return false;const r=rv2Json_(all[k]);return r.state==='ACCEPTED' && !r.logged;});
    if(!repairs.length && !Object.keys(all).some(function(k){return k.startsWith(rv2JobPrefix_());})){rv2Maintenance_(null);return;}
    const tables=rv2Tables_();
    // Reconcile only a bounded number of accepted sends per pass; never retry SENDING.
    for(const key of repairs){if(Date.now()>deadline)break;rv2RepairLog_(tables,rv2Json_(all[key]));}
    const jobs=Object.keys(all).filter(function(k){return k.startsWith(rv2JobPrefix_());})
      .map(function(key){return {key:key,job:rv2Json_(all[key])};})
      .filter(function(x){return !x.job.reviewRequired && (!x.job.nextPollAt || x.job.nextPollAt<=Date.now());})
      .sort(function(a,b){return (a.job.lastPolledAt||0)-(b.job.lastPolledAt||0);});
    for(const entry of jobs){
      if(Date.now()>deadline || !rv2Active_())break;
      const job=entry.job;
      try{
        let snapshot=rv2Timeline_(job.routeUuid,deadline),physicalKeys={};
        let plan=rv2Plan_(snapshot,cutoff,Date.now(),physicalKeys);
        if(!plan.eligible){
          // A known pre-cutover departure is never eligible for replay.
          if(Number.isFinite(plan.departure) && plan.departure<cutoff){rv2FinishJob_(entry,owner,true,null);continue;}
          rv2FinishJob_(entry,owner,false,null);continue;
        }
        // Resolve physical-stop identity for co-located timeline entries before planning next messages.
        const firstPending=snapshot.items.find(function(s){return s.type==='delivering_stop' && Array.isArray(s.orders) && s.orders.some(function(o){return o.status==='scheduled';});});
        for(const stop of snapshot.items){
          if(stop.type!=='delivering_stop' || !Array.isArray(stop.orders))continue;
          if(!firstPending || stop!==firstPending && !(stop.stopUuid && stop.stopUuid===firstPending.stopUuid) &&
            !(stop.plannedArrivalTime===firstPending.plannedArrivalTime && stop.plannedDepartureTime===firstPending.plannedDepartureTime))continue;
          for(const order of stop.orders){
            if(Date.now()>deadline)break;
            if(order.status==='scheduled' && /^ORD-\d+$/.test(order.customerOrderNumber||'') && mkEtaUuid_(order.uuid)){
              const tracking=rv2Tracking_(order.uuid,order.customerOrderNumber);physicalKeys[order.uuid]=tracking.physicalKey;
            }
          }
        }
        if(Date.now()-snapshot.fetchedAt>15000)snapshot=rv2Timeline_(job.routeUuid,deadline);
        plan=rv2Plan_(snapshot,cutoff,Date.now(),physicalKeys);
        for(let item of plan.items){
          if(Date.now()>deadline || !rv2Active_())break;
          // Refresh before expiry instead of failing the whole batch after a few sends.
          if(Date.now()-snapshot.fetchedAt>10000){
            snapshot=rv2Timeline_(job.routeUuid,deadline);
            const fresh=rv2Plan_(snapshot,cutoff,Date.now(),physicalKeys);
            item=fresh.items.find(function(x){return x.orderId===item.orderId && x.uuid===item.uuid && x.stage===item.stage;});
            if(!item)continue;
          }
          item.routeUuid=job.routeUuid;item.snapshotAt=snapshot.fetchedAt;
          if(item.stage===MK_RV2.delivered || item.stage==='RECOVERY_INTERNAL_MISSED'){
            const detail=rv2Order_(item.uuid,item.orderId);rv2MarkDelivered_(tables,item,detail);
            if(item.stage==='RECOVERY_INTERNAL_MISSED')continue;
            if(Date.now()-rv2Date_(detail.deliveryTime)>3600000){rv2Hold_(item,'CONFIRMATION_TOO_OLD');continue;}
          }
          if(rv2Existing_(tables,item))continue;
          const tracking=item.stage===MK_RV2.delivered?null:rv2Tracking_(item.uuid,item.orderId);
          if(rv2Send_(tables,item,owner,tracking))sent++;
        }
        const orders=snapshot.items.flatMap(function(s){return Array.isArray(s.orders)?s.orders:[];});
        const complete=orders.length && orders.every(function(o){
          if(o.status==='missed'){
            const d=rv2Find_(tables.Deliveries,'Order ID',o.customerOrderNumber);
            return !!d && ['Failed','Delivered'].includes(String(d.row[tables.Deliveries.columns['Delivery Status']]));
          }
          if(o.status!=='delivered')return false;
          if(!/^ORD-\d+$/.test(o.customerOrderNumber||''))return true;
          const order=rv2Find_(tables.Orders,'Order ID',o.customerOrderNumber),customer=order && rv2Find_(tables.Customers,'Customer ID',String(order.row[tables.Orders.columns['Customer ID']]||''));
          if(!order || String(order.row[tables.Orders.columns['Order Status']])!=='Confirmed' || !customer ||
            String(customer.row[tables.Customers.columns['WhatsApp Opt-In']]||'').toUpperCase()!=='Y')return true;
          return rv2Existing_(tables,{orderId:o.customerOrderNumber,stage:MK_RV2.delivered});
        });
        rv2FinishJob_(entry,owner,!!complete,null);
      }catch(e){errors++;rv2FinishJob_(entry,owner,false,rv2SafeCode_(e));}
    }
    console.log(JSON.stringify({diagnostic:'RECOVERY_WORKER',sent:sent,errors:errors,elapsedMs:Date.now()-started}));
    if(Date.now()<deadline)rv2Maintenance_(tables);
  }catch(e){
    if(rv2SafeCode_(e)!=='RECOVERY_BUSY')throw e;
    console.log(JSON.stringify({diagnostic:'RECOVERY_WORKER_DEFERRED',reason:'SHARED_LOCK_BUSY',sent:sent}));
  }finally{
    try{rv2Lock_(function(){const lease=rv2Json_(props.getProperty(MK_RV2.lease));if(lease && lease.owner===owner)props.deleteProperty(MK_RV2.lease);});}
    catch(e){if(rv2SafeCode_(e)!=='RECOVERY_BUSY')throw e;console.log(JSON.stringify({diagnostic:'RECOVERY_LEASE_CLEANUP_DEFERRED'}));}
  }
}
function rv2FinishJob_(entry,owner,complete,error){
  rv2Lock_(function(){
    const props=PropertiesService.getScriptProperties(),current=rv2Json_(props.getProperty(entry.key));if(!current)return;
    const lease=rv2Json_(props.getProperty(MK_RV2.lease));if(!lease || lease.owner!==owner)return;
    if(complete && current.lastReceivedAt===entry.job.lastReceivedAt){
      rv2Set_(props,MK_RV2.prefix+'DONE_'+current.routeUuid,{at:Date.now()});props.deleteProperty(entry.key);return;}
    current.lastPolledAt=Date.now();current.nextPollAt=Date.now()+(error?Math.min(300000,10000*Math.pow(2,Math.min(current.attempts||0,5))):60000);
    current.attempts=error?(current.attempts||0)+1:0;current.lastError=error||null;
    if(error && current.attempts>=5 && Date.now()-current.firstReceivedAt>86400000)current.reviewRequired=true;
    rv2Set_(props,entry.key,current);
  });
}

function rv2Hold_(item,reason){rv2Lock_(function(){
  const props=PropertiesService.getScriptProperties(),key=rv2SendPrefix_()+item.orderId+'_'+item.stage;
  if(!props.getProperty(key))rv2Set_(props,key,{state:'REVIEW',orderId:item.orderId,stage:item.stage,reason:reason,at:Date.now()});
});}
function rv2Discover_(deadline){
  if(rv2Mode_()==='TEST')return;
  const props=PropertiesService.getScriptProperties(),now=Date.now();
  if(now-Number(props.getProperty(MK_RV2.prefix+'LAST_DISCOVERY')||0)<120000)return;
  const hour=Number(Utilities.formatDate(new Date(now),'Australia/Sydney','H'));
  if(hour>=1 && hour<15)return;
  const workspace=props.getProperty('ROUTIFIC_WORKSPACE_UUID');
  if(!workspace || !/^[A-Za-z0-9-]{1,128}$/.test(workspace))throw new Error('RECOVERY_WORKSPACE_MISSING');
  const date=Utilities.formatDate(new Date(now),'Australia/Sydney','yyyy-MM-dd');
  const base='/v2/routes?workspaceUuid='+encodeURIComponent(workspace)+'&date='+date;
  let cursor=null,pages=0;const seen={};
  do{
    if(Date.now()>deadline)throw new Error('RECOVERY_TIME_BUDGET');
    const page=rv2Get_(base+(cursor?'&cursor='+encodeURIComponent(cursor):''));
    if(!page || !Array.isArray(page.items))throw new Error('RECOVERY_ROUTE_LIST_INVALID');
    for(const route of page.items){
      if(!mkEtaUuid_(route.uuid) || !['published','executing','completed'].includes(route.status))continue;
      rv2Lock_(function(){
        const key=MK_RV2.route+route.uuid;
        if(props.getProperty(key) || route.status==='completed' && props.getProperty(MK_RV2.prefix+'DONE_'+route.uuid))return;
        rv2Set_(props,key,{routeUuid:route.uuid,firstReceivedAt:now,lastReceivedAt:now,eventAt:now,attempts:0,nextPollAt:0,discovered:true});
      });
    }
    cursor=page.nextCursor||null;pages++;
    if(cursor && (typeof cursor!=='string' || cursor.length>2000 || seen[cursor] || pages>=20))throw new Error('RECOVERY_CURSOR_INVALID');
    if(cursor)seen[cursor]=true;
  }while(cursor);
  props.setProperty(MK_RV2.prefix+'LAST_DISCOVERY',String(now));
}
function rv2Maintenance_(tables){
  if(rv2Mode_()==='TEST')return;
  const props=PropertiesService.getScriptProperties(),now=Date.now();
  if(now-Number(props.getProperty(MK_RV2.prefix+'LAST_MAINTENANCE')||0)<86400000)return;
  const all=props.getProperties();let removed=0;
  for(const key of Object.keys(all)){
    if(removed>=100)break;
    if(![MK_RV2.event,MK_RV2.track,MK_RV2.send,MK_RV2.prefix+'DONE_'].some(function(p){return key.startsWith(p);}))continue;
    const record=rv2Json_(all[key]);let expired=false;
    if(key.startsWith(MK_RV2.event))expired=now-record.acceptedAt>8*86400000;
    if(key.startsWith(MK_RV2.track))expired=now-record.at>2*86400000;
    if(key.startsWith(MK_RV2.prefix+'DONE_'))expired=now-record.at>8*86400000;
    if(key.startsWith(MK_RV2.send))expired=!!tables && record.state==='ACCEPTED' && record.logged && now-Date.parse(record.acceptedAt)>8*86400000 && rv2Logged_(tables,record.orderId,record.stage);
    if(expired){props.deleteProperty(key);removed++;}
  }
  if(removed<100)props.setProperty(MK_RV2.prefix+'LAST_MAINTENANCE',String(now));
}

function rv2Batch_(tables,requests){
  if(rv2Mode_()==='TEST'){
    const config=rv2TestConfig_();if(tables.book.getId()!==config.bookId)throw new Error('RECOVERY_TEST_BOOK_MISMATCH');
    return Sheets.Spreadsheets.batchUpdate({requests:requests},config.bookId);
  }
  return fwBatch_(tables.book,requests);
}
function rv2RegisterLog_(tables,record){
  if(!record.test)return registerWhatsAppOutbound_(record.messageId,record.orderId,record.stage,record.recipient,new Date(record.acceptedAt));
  return rv2Lock_(function(){
    rv2AssertTestItem_(tables,{orderId:record.orderId,routeUuid:record.routeUuid}, {phone:record.recipient});
    const sheet=tables['WhatsApp Log'].sheet,rows=sheet.getDataRange().getValues();
    if(rows.slice(1).some(function(r){return r[0]===record.messageId;}))return;
    const values=WHATSAPP_LOG_HEADERS.map(function(h){return ({'Message ID':record.messageId,'Order ID':record.orderId,'Message Type':record.stage,
      'Phone':record.recipient,'Accepted At':new Date(record.acceptedAt),'Status':'Accepted'})[h]||'';});
    rv2Batch_(tables,[fwAppend_(sheet,[values])]);
  });
}

function inspectRoutificRecoveryCandidate(){
  mkReleaseOwnerBook_(false);
  const props=PropertiesService.getScriptProperties(),all=props.getProperties();
  const triggers=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();});
  const records=Object.keys(all).filter(function(k){return k.startsWith(rv2SendPrefix_());}).map(function(k){const r=rv2Json_(all[k]);return {orderId:r.orderId,stage:r.stage,state:r.state,reason:r.reason||null};});
  const jobs=Object.keys(all).filter(function(k){return k.startsWith(rv2JobPrefix_());}).map(function(k){const r=rv2Json_(all[k]);return {routeUuid:r.routeUuid,attempts:r.attempts,lastError:r.lastError||null,lastPolledAt:r.lastPolledAt||null,nextPollAt:r.nextPollAt||null,reviewRequired:!!r.reviewRequired};});
  const result={diagnostic:'RECOVERY_CANDIDATE_READ_ONLY',version:MK_RV2.version,mode:rv2Mode_(),notBefore:props.getProperty(MK_RV2.cutoff)||null,
    productionWorkerCount:triggers.filter(function(h){return h==='runRoutificEtaQueue';}).length,
    marketingTriggerCount:triggers.filter(function(h){return h==='runWeeklyMarketing';}).length,jobs:jobs,sendStates:records,
    uncertainCount:records.filter(function(r){return r.state==='SENDING';}).length,reviewCount:records.filter(function(r){return r.state==='REVIEW';}).length,
    writesIssued:false,messagesSent:0};
  console.log(JSON.stringify(result));return result;
}
