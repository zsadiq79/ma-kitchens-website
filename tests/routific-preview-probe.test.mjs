import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {receiveRoutific} from '../lib/routificIngress.mjs';
const source=fs.readFileSync(new URL('../app/api/internal/routific-recovery-probe/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function harness(env){const published=[];const c=vm.createContext({process:{env},crypto,Request,Response,Date,Promise,receiveRoutific,send:async(...args)=>{published.push(args);return {messageId:'accepted'};}});vm.runInContext(source,c);return {get:c.GET,published};}
test('preview probe cannot run in production or without explicit test configuration',async()=>{
 for(const env of [{VERCEL_ENV:'production'},{VERCEL_ENV:'preview',ROUTIFIC_RECOVERY_PROBE_ENABLED:'true'}]){const h=harness(env);assert.equal((await h.get()).status,404);assert.equal(h.published.length,0);}
});
test('preview probe exercises forged signature, five simultaneous real ingress calls and duplicate identity',async()=>{
 const h=harness({VERCEL_ENV:'preview',ROUTIFIC_RECOVERY_PROBE_ENABLED:'true',ROUTIFIC_DURABLE_INGRESS:'true',ROUTIFIC_RECOVERY_PROBE_RUN:'rv2-probe-test',ROUTIFIC_RECOVERY_PROBE_ROUTE:'11111111-1111-4111-8111-111111111111'});
 const result=await (await h.get()).json();assert.equal(result.forged.status,401);assert.equal(result.burst.length,5);assert.ok(result.burst.every(r=>r.status===200&&r.result.durablyQueued));assert.equal(h.published.length,6);
 assert.equal(result.duplicate.eventKey,result.burst[0].eventKey);assert.equal(h.published[0][2].idempotencyKey,h.published[5][2].idempotencyKey);
 assert.equal(h.published[0][1].payload.recoveryProbe.retryOnce,true);
});
