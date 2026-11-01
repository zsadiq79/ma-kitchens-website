import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {receiveRoutific,deliverRoutificEvent,validRoutificSignature,ROUTIFIC_RECOVERY_TOPIC} from '../lib/routificIngress.mjs';
const secret='test-signing-secret';
const env={ROUTIFIC_WEBHOOK_SECRET:secret,ROUTIFIC_DURABLE_INGRESS:'true',CONTROL_TOWER_WEBHOOK_URL:'https://script.google.com/macros/s/TEST/exec',CONTROL_TOWER_WEBHOOK_SECRET:'private-forward-secret'};
const payload={type:'order.status_updated',timestamp:'2026-11-01T08:00:00Z',data:{route:{uuid:'11111111-1111-4111-8111-111111111111'}}};
function req(body=JSON.stringify(payload),signature){return new Request('https://test.example/api/routific-webhook',{method:'POST',body,
  headers:{'x-routific-signature':signature||'v0='+crypto.createHmac('sha256',secret).update(body).digest('hex')}});}
function upstream(body){const response=Response.json(body);Object.defineProperty(response,'url',{value:'https://script.googleusercontent.com/macros/echo'});return response;}
test('success is returned only after durable publish resolves, never after starting a background promise',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);let done=false;
  const work=receiveRoutific(req(),{env,publish:()=>pending,fetcher:()=>{throw Error('Must not call Apps Script');}}).then(r=>{done=true;return r;});
  await new Promise(r=>setImmediate(r));assert.equal(done,false);resolve({messageId:'queued'});
  const response=await work;assert.equal(response.status,200);assert.equal((await response.json()).durablyQueued,true);
});
test('publish failure or ambiguous acknowledgement returns 503 so Routific can retry',async()=>{
  for(const publish of [async()=>{throw Error('secret');},async()=>null,async()=>({})]){
    const response=await receiveRoutific(req(),{env,publish});assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('secret'));
  }
});
test('SDK deferred acceptance with a null message ID is a successful durable acknowledgement',async()=>{
  const response=await receiveRoutific(req(),{env,publish:async()=>({messageId:null})});assert.equal(response.status,200);
});
test('tampered and forged requests never reach queue or Apps Script',async()=>{
  let calls=0;for(const request of [req('{}','v0='+'0'.repeat(64)),req(' ','bad')]){
    assert.equal((await receiveRoutific(request,{env,publish:()=>calls++,fetcher:()=>calls++})).status,401);
  }assert.equal(calls,0);
});
test('signature verification preserves raw bytes and supports Routific rotation signatures',()=>{
  const raw=Buffer.from(' {"x":"😀"} '),sig=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  assert(validRoutificSignature(raw,'v0='+sig,secret));assert(validRoutificSignature(raw,'v0='+'0'.repeat(64)+','+sig,secret));
  assert(!validRoutificSignature(Buffer.from(raw.toString().trim()),'v0='+sig,secret));
});
test('repeated payloads use the same durable identity and seven-day retention',async()=>{
  const calls=[];for(let i=0;i<5;i++)await receiveRoutific(req(),{env,publish:async(...args)=>{calls.push(args);return {messageId:'q'};}});
  assert(calls.every(([topic,event,options])=>topic===ROUTIFIC_RECOVERY_TOPIC && event.key===calls[0][1].key && options.idempotencyKey===event.key && options.retentionSeconds===604800));
});
test('five completion events arriving together are all durably accepted',async()=>{
  const keys=new Set();await Promise.all(Array.from({length:5},(_,i)=>receiveRoutific(req(JSON.stringify({...payload,data:{...payload.data,order:{customerOrderNumber:'ORD-'+i}}})),{
    env,publish:async(_,event)=>{keys.add(event.key);return {messageId:event.key};}})));assert.equal(keys.size,5);
});
test('unknown verified event types are ignored without publishing',async()=>{
  let called=false;const response=await receiveRoutific(req('{"type":"unknown"}'),{env,publish:()=>{called=true;}});
  assert.equal(response.status,200);assert.equal(called,false);
});
test('oversized or malformed signed bodies never reach the queue',async()=>{
  let called=false;for(const body of ['{','😀'.repeat(250001)]){
    const response=await receiveRoutific(req(body),{env,publish:()=>{called=true;}});assert.equal(response.status,400);
  }assert.equal(called,false);
});
test('consumer requires the new protocol acknowledgement and rejects generic old-deployment 200s',async()=>{
  const event={version:1,key:'a'.repeat(64),payload};
  for(const body of [{status:200},{status:200,recoveryVersion:1,eventKey:'b'.repeat(64),durablyStored:true},{status:503}])
    await assert.rejects(deliverRoutificEvent(event,{env,fetcher:async()=>upstream(body)}),/DELIVERY_RETRY/);
  assert.deepEqual(await deliverRoutificEvent(event,{env,fetcher:async()=>upstream({status:200,recoveryVersion:1,eventKey:event.key,durablyStored:true})}),{accepted:true});
});
test('an old Apps Script deployment sees no root payload and cannot send the queued event',async()=>{
  const event={version:1,key:'a'.repeat(64),payload};let forwarded;
  await deliverRoutificEvent(event,{env,fetcher:async(url,options)=>{
    assert.equal(new URL(url).searchParams.get('action'),'routific_recovery_ingest');forwarded=JSON.parse(options.body);
    return upstream({status:200,recoveryVersion:1,eventKey:event.key,durablyStored:true});
  }});assert.equal(forwarded.payload,undefined);assert.equal(forwarded.recoveryEvent.key,event.key);
});
test('disabled consumer and invalid backend configuration cannot acknowledge work',async()=>{
  const event={version:1,key:'a'.repeat(64),payload};let calls=0;
  for(const settings of [{...env,ROUTIFIC_DURABLE_INGRESS:'false'},{...env,CONTROL_TOWER_WEBHOOK_URL:'https://evil.example/exec'}])
    await assert.rejects(deliverRoutificEvent(event,{env:settings,fetcher:()=>calls++}));assert.equal(calls,0);
});
test('Apps Script timeouts and errors are sanitized and remain retryable',async()=>{
  await assert.rejects(deliverRoutificEvent({version:1,key:'a'.repeat(64),payload},{env,fetcher:async()=>{throw Error('private-forward-secret');}}),e=>e.message==='ROUTIFIC_RECOVERY_DELIVERY_RETRY');
});
