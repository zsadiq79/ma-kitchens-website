import {receiveRoutific} from '../../../lib/routificIngress.mjs';
export const runtime='nodejs';
export async function POST(request) {
  return receiveRoutific(request,{publish:async (...args)=>{
    const {send}=await import('@vercel/queue');
    return send(...args);
  }});
}
