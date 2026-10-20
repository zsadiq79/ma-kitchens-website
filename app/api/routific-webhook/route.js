import crypto from 'node:crypto';
import {readOrderJson,orderBackendEndpoint} from '../../../lib/orderApiBoundary.mjs';
export const runtime='nodejs';
export async function POST(request) {
  const secret=process.env.ROUTIFIC_WEBHOOK_SECRET;
  if(!secret) return Response.json({error:'Webhook configuration error'},{status:503});
  const header=request.headers.get('x-routific-signature')||'';
  const signature=header.startsWith('v0=')?header.slice(3):header;
  if(!/^[a-f0-9]{64}$/.test(signature)) return Response.json({error:'Invalid signature'},{status:401});
  let raw;
  try {
    // Read bounded bytes while preserving the exact provider representation.
    const reader=request.body?.getReader(); if(!reader)throw new Error();
    const chunks=[];let bytes=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1000000){await reader.cancel();return Response.json({error:'Too large'},{status:413})}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
    raw=Buffer.concat(chunks);
  } catch {return Response.json({error:'Invalid request'},{status:400})}
  const expected=crypto.createHmac('sha256',secret).update(raw).digest();
  if(!crypto.timingSafeEqual(expected,Buffer.from(signature,'hex')))return Response.json({error:'Invalid signature'},{status:401});
  let payload;try{payload=JSON.parse(raw.toString('utf8'));if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error()}catch{return Response.json({error:'Invalid request'},{status:400})}
  const backend=process.env.CONTROL_TOWER_WEBHOOK_URL,forwardSecret=process.env.CONTROL_TOWER_WEBHOOK_SECRET;
  if(!backend||!forwardSecret)return Response.json({error:'Webhook configuration error'},{status:503});
  try{
    const endpoint=orderBackendEndpoint(backend,'routific_verified');
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlTowerSecret:forwardSecret,payload}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const destination=new URL(response.url);
    if(!response.ok||destination.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(destination.hostname))throw new Error();
    const result=await readOrderJson(response,20000);
    if(result?.status!==200)throw new Error();
    return Response.json({success:true,verified:true,controlTowerAccepted:true});
  }catch{return Response.json({error:'Webhook forwarding unavailable'},{status:502})}
}
