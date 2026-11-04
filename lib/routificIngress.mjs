import crypto from 'node:crypto';
import {readOrderBytes, readOrderJson, orderBackendEndpoint} from './orderApiBoundary.mjs';

export const ROUTIFIC_RECOVERY_TOPIC = 'ma-kitchens-routific-recovery-v1';
const supported = new Set(['route.published','route.eta_updated','order.status_updated','webhook.test']);
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export function validRoutificSignature(raw,header,secret) {
  if(typeof secret!=='string'||!secret||typeof header!=='string')return false;
  const expected=crypto.createHmac('sha256',secret).update(raw).digest();
  const signatures=header.startsWith('v0=')?header.slice(3):header;
  return signatures.split(',').map(s=>s.trim()).some(s=>/^[a-f0-9]{64}$/.test(s)&&crypto.timingSafeEqual(expected,Buffer.from(s,'hex')));
}

export async function receiveRoutific(request,{env=process.env,publish,fetcher=fetch,signal=AbortSignal}={}) {
  if(!env.ROUTIFIC_WEBHOOK_SECRET)return reply({error:'Webhook configuration error'},503);
  let raw;
  try {raw=await readOrderBytes(request,1000000);}catch(_){return reply({error:'Invalid request'},400);}
  if(!validRoutificSignature(raw,request.headers.get('x-routific-signature')||'',env.ROUTIFIC_WEBHOOK_SECRET))return reply({error:'Invalid signature'},401);
  let payload;
  try {payload=JSON.parse(raw.toString('utf8'));if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error();}
  catch(_){return reply({error:'Invalid request'},400);}
  console.info(JSON.stringify({diagnostic:'ROUTIFIC_AUTHENTICATED_INGRESS',durableEnabled:env.ROUTIFIC_DURABLE_INGRESS==='true',eventType:typeof payload.type==='string'&&/^[a-z_.]{1,64}$/.test(payload.type)?payload.type:'MISSING_OR_INVALID',shapeKeys:Object.keys(payload).filter(k=>/^[a-zA-Z_]{1,32}$/.test(k)).slice(0,10)}));
  if(env.ROUTIFIC_DURABLE_INGRESS==='true') {
    if(!supported.has(payload.type))return reply({success:true,ignored:true});
    const event={version:1,key:crypto.createHash('sha256').update(raw).digest('hex'),receivedAt:new Date().toISOString(),payload:payload.type==='webhook.test'?{type:'webhook.test'}:payload};
    try {
      if(typeof publish!=='function')throw Error();
      const acknowledgement=await publish(ROUTIFIC_RECOVERY_TOPIC,event,{retentionSeconds:604800,idempotencyKey:event.key});
      // SDK 0.10 can acknowledge deferred acceptance with a null ID.
      if(!acknowledgement||!Object.prototype.hasOwnProperty.call(acknowledgement,'messageId')||
        !(acknowledgement.messageId===null||typeof acknowledgement.messageId==='string'&&acknowledgement.messageId))throw Error();
      console.info(JSON.stringify({diagnostic:'ROUTIFIC_DURABLY_QUEUED',eventKey:event.key,eventType:event.payload.type}));
      return reply({success:true,verified:true,durablyQueued:true});
    }catch(_){return reply({error:'Webhook storage unavailable'},503);}
  }
  const backend=env.CONTROL_TOWER_WEBHOOK_URL,secret=env.CONTROL_TOWER_WEBHOOK_SECRET;
  if(!backend||!secret)return reply({error:'Webhook configuration error'},503);
  try {
    const response=await fetcher(orderBackendEndpoint(backend,'routific_verified'),{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlTowerSecret:secret,payload}),cache:'no-store',signal:signal.timeout(12000)
    });
    const destination=new URL(response.url);
    if(!response.ok||destination.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(destination.hostname))throw Error();
    const result=await readOrderJson(response,20000);
    if(result?.status!==200)throw Error();
    return reply({success:true,verified:true,controlTowerAccepted:true});
  }catch(_){return reply({error:'Webhook forwarding unavailable'},502);}
}

export async function deliverRoutificEvent(event,{env=process.env,fetcher=fetch,signal=AbortSignal}={}) {
  if(env.ROUTIFIC_DURABLE_INGRESS!=='true')throw Error('ROUTIFIC_RECOVERY_DISABLED');
  if(!event||event.version!==1||!/^[a-f0-9]{64}$/.test(event.key)||!supported.has(event.payload?.type))throw Error('ROUTIFIC_RECOVERY_EVENT_INVALID');
  try {
    if(!env.CONTROL_TOWER_WEBHOOK_SECRET)throw Error();
    const endpoint=orderBackendEndpoint(env.CONTROL_TOWER_WEBHOOK_URL,'routific_recovery_ingest');
    const response=await fetcher(endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      // No root payload: an old deployment must not process or send this event.
      body:JSON.stringify({controlTowerSecret:env.CONTROL_TOWER_WEBHOOK_SECRET,recoveryEvent:event}),cache:'no-store',signal:signal.timeout(8000)
    });
    const destination=new URL(response.url);
    if(!response.ok||destination.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(destination.hostname))throw Error();
    const body=await readOrderJson(response,20000);
    // A generic 200 from an old deployment does not establish durable acceptance.
    if(body.status!==200||body.recoveryVersion!==1||body.eventKey!==event.key||body.durablyStored!==true)throw Error();
    return {accepted:true};
  }catch(_){throw Error('ROUTIFIC_RECOVERY_DELIVERY_RETRY');}
}
