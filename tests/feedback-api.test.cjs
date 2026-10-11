const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');
function modules(env={},fetcher=async()=>{throw Error('unexpected network')},abortSignal=AbortSignal,logs=[]){
 const cache=new Map();
 function load(file){file=path.resolve(__dirname,'..',file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:mod.exports,module:mod,process:{env},fetch:fetcher,Response,Request,Headers,URL,Buffer,TextDecoder,Uint8Array,AbortSignal:abortSignal,console:{info:value=>logs.push(value),error:()=>{throw Error('unsafe logging')},log:()=>{throw Error('unsafe logging')}},require:n=>n.startsWith('@/')?load(n.slice(2)+'.ts'):require(n)};
 vm.runInNewContext(code,context,{filename:file});return mod.exports;
 }return load;
}
const token='a'.repeat(43);
const payload={dishes:[{itemCode:'M1',rating:5,skipped:false,comment:''}],deliveryRating:5,overallComment:'',testimonialConsent:false};
function request(body,headers={}){return new Request('https://site.example/api/feedback',{method:'POST',headers:{origin:'https://site.example','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});}
test('browser API rejects unknown fields, types and duplicate codes without forwarding',async()=>{let calls=0;const route=modules({},async()=>{calls++;throw Error()})('app/api/feedback/route.ts');for(const body of [null,[],{action:'feedback_read',token,extra:true},{action:'feedback_read',token:5},{action:'feedback_event',token,event:'read'},{action:'feedback_submit',token,revision:'0',submissionId:'x',submission:payload},{action:'feedback_submit',token,revision:0,submissionId:'x',submission:{...payload,testimonialConsent:'true'}},{action:'feedback_submit',token,revision:0,submissionId:'x',submission:{...payload,dishes:[payload.dishes[0],payload.dishes[0]]}}])assert.equal((await route.POST(request(body))).status,400);assert.equal(calls,0);});
test('origin, oversized UTF-8 bodies and malformed JSON rejected before upstream',async()=>{let calls=0;const route=modules({},async()=>{calls++})('app/api/feedback/route.ts');assert.equal((await route.POST(request({action:'feedback_read',token},{origin:'https://evil.example'}))).status,403);assert.equal((await route.POST(request('{'))).status,400);assert.equal((await route.POST(request('😀'.repeat(14000)))).status,400);assert.equal(calls,0);});
test('token and service secret only travel in body; API URLs never contain them',async()=>{let called;const env={FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'private-service-key'};const route=modules(env,async(url,opts)=>{called={url:String(url),opts};return Response.json({ok:true,result:{status:'COMPLETED'}})})('app/api/feedback/route.ts');const response=await route.POST(request({action:'feedback_submit',token,revision:0,submissionId:'persistent-id',submission:payload}));assert.equal(response.status,200);assert(!called.url.includes(token));assert(!called.url.includes(env.FLOW_MENU_API_SECRET));assert.equal(JSON.parse(called.opts.body).token,token);assert(called.opts.signal);assert.equal(response.headers.get('cache-control'),'no-store, private');});
test('upstream errors and configuration errors are sanitized without logging URLs/secrets',async()=>{const route=modules({FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'secret'},async()=>{throw Error('https://backend.example/'+token+'?secret=secret')})('app/api/feedback/route.ts');const response=await route.POST(request({action:'feedback_read',token}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'TEMPORARY_ERROR'});const unsafe=modules({FLOW_MENU_API_URL:'http://evil.example',FLOW_MENU_API_SECRET:'secret'},async()=>{throw Error('should never fetch')})('app/api/feedback/route.ts');assert.equal((await unsafe.POST(request({action:'feedback_read',token}))).status,503);});
test('expired/revoked/replaced/conflict/rate-limit states retain meaningful codes',async()=>{for(const [error,status]of [['EXPIRED',410],['REVOKED',410],['REPLACED',410],['CONFLICT',409],['RATE_LIMITED',429]]){const route=modules({FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'secret'},async()=>Response.json({ok:false,error}))('app/api/feedback/route.ts');const r=await route.POST(request({action:'feedback_read',token}));assert.equal(r.status,status);assert.equal((await r.json()).error,error);}});
test('Meta signatures verified over exact raw body, forged receipts never forwarded',async()=>{let calls=0;const env={WHATSAPP_APP_SECRET:'app-secret',WHATSAPP_VERIFY_TOKEN:'verify-secret',FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'server-secret'};const route=modules(env,async(url,opts)=>{calls++;assert.equal(new URL(url).searchParams.get('action'),'whatsapp_verified');assert.equal(JSON.parse(opts.body).secret,'server-secret');return Response.json({ok:true})})('app/api/whatsapp-events/route.ts');const raw=JSON.stringify({entry:[{changes:[{value:{statuses:[{id:'wamid',status:'read',timestamp:'1791547200'}]}}]}]});const signature='sha256='+crypto.createHmac('sha256',env.WHATSAPP_APP_SECRET).update(raw).digest('hex');const req=(body,sig)=>new Request('https://site.example/api/whatsapp-events',{method:'POST',headers:{'x-hub-signature-256':sig},body});assert.equal((await route.POST(req(raw,'sha256='+'0'.repeat(64)))).status,403);assert.equal(calls,0);assert.equal((await route.POST(req(raw,signature))).status,200);assert.equal(calls,1);assert.equal((await route.POST(req(raw+' ',signature))).status,403);assert.equal(calls,1);const verified=await route.GET(new Request('https://site.example/api/whatsapp-events?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=123'));assert.equal(await verified.text(),'123');});

test('slow successful upstream responses fit inside the browser and route budgets',async()=>{
 const timeouts=[],signal={timeout:ms=>{timeouts.push(ms);return AbortSignal.timeout(ms)}};
 const env={FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'secret'};
 const load=modules(env,async(url,opts)=>{
   assert.equal(opts.signal.aborted,false);
   return Response.json({ok:true,result:{status:'COMPLETED'}});
 },signal);
 const route=load('app/api/feedback/route.ts');
 assert.equal((await route.POST(request({action:'feedback_submit',token,revision:0,submissionId:'id',submission:payload}))).status,200);
 const timing=load('lib/feedbackTiming.ts');
 assert(timing.FEEDBACK_UPSTREAM_TIMEOUT_MS>12000);
 assert(timing.FEEDBACK_BROWSER_TIMEOUT_MS>timing.FEEDBACK_UPSTREAM_TIMEOUT_MS);
 assert(route.maxDuration*1000>timing.FEEDBACK_UPSTREAM_TIMEOUT_MS);
 assert.deepEqual(timeouts,[timing.FEEDBACK_UPSTREAM_TIMEOUT_MS]);
});
test('lost submission acknowledgement is recovered from matching persisted completion without resending',async()=>{
 const actions=[];
 const client=modules({},async(url,opts)=>{
   const body=JSON.parse(opts.body);actions.push(body.action);assert.equal(url,'/api/feedback');
   if(body.action==='feedback_submit')return Response.json({error:'TEMPORARY_ERROR'},{status:503});
   return Response.json({status:'COMPLETED',submissionId:'persistent-id'});
 })('lib/feedbackClient.ts');
 const result=await client.feedbackRequest(token,'feedback_submit',{submissionId:'persistent-id',revision:0,submission:payload});
 assert.equal(result.status,'COMPLETED');assert.equal(result.alreadyCompleted,true);
 assert.deepEqual(actions,['feedback_submit','feedback_read']);
});
test('lost draft acknowledgement is recovered only when persisted selections match',async()=>{
 for(const matches of [true,false]){
   const actions=[];
   const client=modules({},async(url,opts)=>{
     const body=JSON.parse(opts.body);actions.push(body.action);
     if(body.action==='feedback_draft')throw new Error('network response lost');
     return Response.json({status:'OPEN',revision:3,draft:matches?payload:{...payload,overallComment:'Changed in another tab'}});
   })('lib/feedbackClient.ts');
   const pending=client.feedbackRequest(token,'feedback_draft',{revision:2,submission:payload});
   if(matches)assert.equal((await pending).revision,3);else await assert.rejects(pending);
   assert.deepEqual(actions,['feedback_draft','feedback_read']);
 }
});
test('uncertain writes never infer completion from another submission ID or replay a failed write',async()=>{
 for(const state of [{status:'OPEN',submissionId:'persistent-id'},{status:'COMPLETED',submissionId:'other-id'},null]){
   const actions=[];
   const client=modules({},async(url,opts)=>{
     const body=JSON.parse(opts.body);actions.push(body.action);
     if(body.action==='feedback_submit'||state===null)return Response.json({error:'TEMPORARY_ERROR'},{status:503});
     return Response.json(state);
   })('lib/feedbackClient.ts');
   await assert.rejects(client.feedbackRequest(token,'feedback_submit',{submissionId:'persistent-id',revision:0,submission:payload}));
   assert.deepEqual(actions,['feedback_submit','feedback_read']);
 }
});
test('real conflicts and revoked links retain their errors without reconciliation reads',async()=>{
 for(const code of ['CONFLICT','REVOKED','EXPIRED','RATE_LIMITED']){
   let calls=0;const client=modules({},async()=>{calls++;return Response.json({error:code},{status:409})})('lib/feedbackClient.ts');
   await assert.rejects(client.feedbackRequest(token,'feedback_submit',{submissionId:'id',revision:0,submission:payload}),new RegExp(code));
   assert.equal(calls,1);
 }
});

test('timings correlate server and backend without leaking feedback or upstream metadata',async()=>{
 const logs=[];let forwarded;
 const env={FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'private-service-key'};
 const backend={totalMs:2100,lockWaitMs:700,readMs:1000,readCalls:7,writeMs:300,writeCalls:1,bookMs:80,timezoneMs:20};
 const load=modules(env,async(url,opts)=>{forwarded=JSON.parse(opts.body);return Response.json({ok:true,result:{status:'COMPLETED'},timing:{...backend,secret:env.FLOW_MENU_API_SECRET}})},AbortSignal,logs);
 const route=load('app/api/feedback/route.ts');
 const r=await route.POST(request({action:'feedback_submit',token,revision:0,submissionId:'private-submission',submission:{...payload,overallComment:'private-feedback-text'}}));
 assert.equal(r.status,200);assert.match(r.headers.get('server-timing'),/apps_script;dur=2100/);
 const id=r.headers.get('x-feedback-request-id');assert.match(id,/^[a-f0-9]{32}$/);assert.equal(forwarded.timingId,id);
 assert.deepEqual(await r.json(),{status:'COMPLETED'});
 assert.equal(logs.length,1);const log=JSON.parse(logs[0]);assert.equal(log.requestId,id);assert.deepEqual(log.backend,backend);
 for(const sensitive of [token,env.FLOW_MENU_API_SECRET,'private-feedback-text','private-submission',env.FLOW_MENU_API_URL])assert(!logs.join('').includes(sensitive));
});
test('missing, malformed and hostile backend timings do not affect valid responses',async()=>{
 for(const timing of [undefined,null,[],{totalMs:Infinity},{totalMs:'secret'},Object.fromEntries(['totalMs','lockWaitMs','readMs','readCalls','writeMs','writeCalls','bookMs','timezoneMs'].map(k=>[k,-1]))]){
  const logs=[];const route=modules({FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'secret'},async()=>Response.json({ok:true,result:{status:'OPEN'},timing}),AbortSignal,logs)('app/api/feedback/route.ts');
  const r=await route.POST(request({action:'feedback_read',token}));assert.equal(r.status,200);assert(!r.headers.get('server-timing').includes('apps_script'));assert(!('backend'in JSON.parse(logs[0])));
 }
});
test('failed upstream requests retain safe timings and unavailable logging cannot break feedback',async()=>{
 const logs=[];const env={FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'secret'};
 const route=modules(env,async()=>{throw Error(token+'secret')},AbortSignal,logs)('app/api/feedback/route.ts');
 const r=await route.POST(request({action:'feedback_read',token}));assert.equal(r.status,503);assert.match(r.headers.get('server-timing'),/upstream;dur=/);assert.equal(JSON.parse(logs[0]).status,503);assert(!logs.join('').includes(token));
 const broken={push(){throw Error('logger failed')}};
 const ok=modules(env,async()=>Response.json({ok:true,result:{status:'OPEN'}}),AbortSignal,broken)('app/api/feedback/route.ts');assert.equal((await ok.POST(request({action:'feedback_read',token}))).status,200);
});

test('browser-open signal is forwarded only as a strict optional true on read requests',async()=>{
 let forwarded;const env={FLOW_MENU_API_URL:'https://script.google.com/macros/s/COPY/exec',FLOW_MENU_API_SECRET:'private-service-key'};
 const route=modules(env,async(url,opts)=>{forwarded=JSON.parse(opts.body);return Response.json({ok:true,result:{status:'OPEN'}})})('app/api/feedback/route.ts');
 assert.equal((await route.POST(request({action:'feedback_read',token,browserOpened:true}))).status,200);assert.equal(forwarded.browserOpened,true);
 for(const body of [{action:'feedback_read',token,browserOpened:false},{action:'feedback_read',token,browserOpened:'true'},{action:'feedback_draft',token,browserOpened:true,revision:0,submission:payload}])assert.equal((await route.POST(request(body))).status,400);
});
