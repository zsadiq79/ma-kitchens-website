import crypto from 'node:crypto';
import {send} from '@vercel/queue';
import {receiveRoutific} from '../../../../lib/routificIngress.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

// Temporary, deployment-protected rehearsal. This route is unavailable in production.
export async function GET(){
  const env=process.env,route=env.ROUTIFIC_RECOVERY_PROBE_ROUTE;
  if(env.VERCEL_ENV!=='preview'||env.ROUTIFIC_RECOVERY_PROBE_ENABLED!=='true'||env.ROUTIFIC_DURABLE_INGRESS!=='true'||!/^rv2-probe-[a-z0-9-]{1,50}$/.test(env.ROUTIFIC_RECOVERY_PROBE_RUN||'')||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(route||''))return new Response(null,{status:404});
  const secret=crypto.randomBytes(32).toString('hex');
  const raw=i=>JSON.stringify({type:'route.eta_updated',timestamp:new Date().toISOString(),data:{route:{uuid:route}},recoveryProbe:{run:env.ROUTIFIC_RECOVERY_PROBE_RUN,index:i,retryOnce:i===0}});
  const bodies=Array.from({length:5},(_,i)=>raw(i));
  async function submit(body,tamper=false){
    const signature=crypto.createHmac('sha256',secret).update(body).digest('hex'),started=Date.now();
    const response=await receiveRoutific(new Request('https://recovery.invalid/api/routific-webhook',{method:'POST',headers:{'x-routific-signature':signature},body:tamper?body+' ':body}),{env:{...env,ROUTIFIC_WEBHOOK_SECRET:secret},publish:send});
    return {status:response.status,elapsedMs:Date.now()-started,result:await response.json(),eventKey:crypto.createHash('sha256').update(body).digest('hex')};
  }
  const forged=await submit(bodies[0],true);
  const burst=await Promise.all(bodies.map(body=>submit(body)));
  const duplicate=await submit(bodies[0]);
  return Response.json({test:'PREVIEW_ONLY_ROUTIFIC_QUEUE_PROBE',run:env.ROUTIFIC_RECOVERY_PROBE_RUN,routeUuid:route,forged,burst,duplicate,limits:'Invokes the real ingress function and queue SDK; external HTTP webhook delivery remains a separate test.'},{headers:{'Cache-Control':'no-store'}});
}
