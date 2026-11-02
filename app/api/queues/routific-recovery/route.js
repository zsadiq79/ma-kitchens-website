import {handleCallback} from '@vercel/queue';
import {deliverRoutificEvent,ROUTIFIC_RECOVERY_TOPIC} from '../../../../lib/routificIngress.mjs';
export const runtime='nodejs';
export const maxDuration=30;
const consume=handleCallback(async(event,metadata)=>{
  if(metadata.topicName!==ROUTIFIC_RECOVERY_TOPIC)throw Error('ROUTIFIC_RECOVERY_TOPIC_INVALID');
  if(process.env.VERCEL_ENV==='preview' && process.env.ROUTIFIC_RECOVERY_PROBE_ENABLED==='true' &&
    event.payload?.recoveryProbe?.run===process.env.ROUTIFIC_RECOVERY_PROBE_RUN && event.payload.recoveryProbe.retryOnce===true && metadata.deliveryCount===1)
    throw Error('RECOVERY_PREVIEW_RETRY_REHEARSAL');
  const started=Date.now();await deliverRoutificEvent(event);
  console.info(JSON.stringify({diagnostic:'ROUTIFIC_QUEUE_STORED',eventKey:event.key,deliveryCount:metadata.deliveryCount,elapsedMs:Date.now()-started}));
},{retry:(_,metadata)=>({afterSeconds:Math.min(300,5*Math.pow(2,Math.min(metadata.deliveryCount,6)))})});
export async function POST(request) {
  if(process.env.ROUTIFIC_DURABLE_INGRESS!=='true')return Response.json({error:'Recovery consumer disabled'},{status:503});
  return consume(request);
}
