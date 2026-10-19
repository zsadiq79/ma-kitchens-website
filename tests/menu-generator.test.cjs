const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,read,server,client,serialDate}=require('./helpers/menu-generator-fixture.cjs');
const same=value=>JSON.parse(JSON.stringify(value));
test('Standalone generator retains every public menu field and all fourteen LIVE dishes without exposing cook identities',()=>{
  const before=server('baseline').menu(),after=server().menu();
  assert.match(after.cycle.orderDeadlineDisplay,/21 October at 5:00 PM$/);
  delete before.cycle.orderDeadlineDisplay;delete after.cycle.orderDeadlineDisplay;assert.deepEqual(same(after),same(before));
  const lines=after.kitchenRows.flatMap(r=>r.segments.flatMap(s=>s.dishes)).concat(after.desserts);
  assert.equal(lines.length,14);assert.equal(after.desserts.length,2);assert.ok(lines.every(d=>d.portion&&d.imageUrl));
  assert.ok(lines.every(d=>!('cookId' in d)&&!('cookName' in d)));assert.equal(after.commercial.discount,0);assert.equal(after.commercial.deliveryFee,2.5);
  const old=read('baseline','Code.gs').replace(/\r\n/g,'\n'),next=read('candidate','Code.gs').replace(/\r\n/g,'\n'),name='function calculateDeadlineV2_(',tail='function headerMapV2_(';
  assert.equal(next.slice(0,next.indexOf(name)),old.slice(0,old.indexOf(name)));
  assert.equal(next.slice(next.indexOf(tail)),old.slice(old.indexOf(tail)));
});
test('Deadline accepts actual Sheets time cells, numeric fractions and clock text without substituting 8 PM',()=>{
  const {ctx}=server(),delivery=new Date('2026-10-21T13:00:00Z');
  for(const value of [serialDate(17/24,'Australia/Sydney'),17/24,'17:00','17:00:00']){
    assert.equal(ctx.calculateDeadlineV2_(delivery,{'Default Deadline Days Before Delivery':1,'Default Deadline Time':value},'Australia/Sydney'),'Wednesday, 21 October at 5:00 PM');
  }
  assert.equal(ctx.calculateDeadlineV2_(delivery,{},'Australia/Sydney'),'Tuesday, 20 October at 8:00 PM');
  assert.equal(ctx.calculateDeadlineV2_(delivery,{'Default Deadline Days Before Delivery':1,'Default Deadline Time':'20:00'},'Australia/Sydney'),'Wednesday, 21 October at 8:00 PM');
});
test('Deadline uses the Sydney calendar across both DST transitions and a different script timezone',()=>{
  const {ctx}=server();
  for(const [instant,expected] of [['2026-10-04T13:00:00Z','Sunday, 4 October at 5:00 PM'],['2026-04-05T14:00:00Z','Sunday, 5 April at 5:00 PM']])
    assert.equal(ctx.calculateDeadlineV2_(new Date(instant),{'Default Deadline Days Before Delivery':1,'Default Deadline Time':'17:00'},'Australia/Sydney'),expected);
  const code='const {server}=require('+JSON.stringify(path.join(__dirname,'helpers/menu-generator-fixture.cjs'))+');process.stdout.write(server().menu().cycle.orderDeadlineDisplay);';
  const run=spawnSync(process.execPath,['-e',code],{env:{...process.env,TZ:'UTC'},encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,'Wednesday, 21 October at 5:00 PM');
});
test('Invalid deadline values stop menu generation instead of silently advertising another time',()=>{
  const {ctx}=server(),date=new Date('2026-10-21T13:00:00Z');
  for(const time of ['24:00','17:99','nonsense',1,-.1,new Date(NaN)])assert.throws(()=>ctx.calculateDeadlineV2_(date,{'Default Deadline Time':time},'Australia/Sydney'),/valid Default Deadline Time/);
  for(const days of [-1,1.5,'nonsense'])assert.throws(()=>ctx.calculateDeadlineV2_(date,{'Default Deadline Days Before Delivery':days},'Australia/Sydney'),/whole number/);
});
test('Tall menus can scale below one while remaining inside every configured export bound',()=>{
  const ctx=client();
  for(const [width,height,preferred,dimension,pixels] of [[1360,3000,3,24000,120000000],[1360,50000,2,16000,70000000],[40000,5000,2,16000,70000000],[80000,80000,3,24000,120000000]]){
    const scale=ctx.calculateExportScale_(width,height,preferred,dimension,pixels);
    assert.ok(scale>0&&scale<=preferred);assert.ok(Math.floor(width*scale)<=dimension);assert.ok(Math.floor(height*scale)<=dimension);assert.ok(Math.floor(width*scale)*Math.floor(height*scale)<=pixels);
    if(width>dimension||height>dimension)assert.ok(scale<1);
  }
  assert.throws(()=>ctx.calculateExportScale_(0,100,2,16000,70000000),/menu size/);
});
test('Encoder rejects empty output and every MIME fallback before a misleading file can download',async()=>{
  const ctx=client();
  await assert.rejects(ctx.canvasToBlob_({toBlob:cb=>cb(null)},'image/png'),/encode/);
  for(const mime of ['image/jpeg','image/webp'])await assert.rejects(ctx.canvasToBlob_({toBlob:cb=>cb({type:'image/png'})},mime),/requested image format/);
  for(const mime of ['image/png','image/jpeg','image/webp'])assert.equal((await ctx.canvasToBlob_({toBlob:(cb,type)=>cb({type})},mime)).type,mime);
});
test('Rendered ordering information follows pre/post-discount delivery basis and current LIVE prices',()=>{
  const f=server();let html=f.render();assert.match(html,/Delivery: \$2\.5/);assert.doesNotMatch(html,/% off all items/);assert.doesNotMatch(html,/Free delivery on \$/);
  const rows=f.fixture.sheets['Menu Config'],set=(key,value)=>{const row=rows.find(r=>r[0].value===key);row[1]={value,display:String(value)};};
  set('Free Delivery Threshold',100);set('Free Delivery Threshold Basis','Post-discount food value');
  assert.match(f.render(),/food orders after discount/);set('Free Delivery Threshold Basis','Pre-discount food value');assert.match(f.render(),/food orders before discount/);
});
function exportClient(failure=false){
  const nodes=Object.fromEntries(['downloadPngButton','downloadJpgButton','downloadWebpButton','exportStatus'].map(id=>[id,{disabled:false,textContent:id}]));
  nodes.menuCapture={scrollWidth:1360,scrollHeight:3000,getAttribute:()=> 'MENU-2026-10-22'};
  const calls=[],downloads=[],alerts=[];
  const ctx=client('candidate',{document:{querySelector:()=>null,getElementById:id=>nodes[id]||null,fonts:{ready:Promise.resolve()}},alert:m=>alerts.push(m),html2canvas:async(menu,options)=>{
    calls.push(options);if(failure)throw new Error('Renderer unavailable');return {width:Math.floor(1360*options.scale),height:Math.floor(3000*options.scale),toBlob:(cb,mime)=>cb({type:mime,size:1000})};
  }});
  ctx.waitForMenuImages_=async()=>{};ctx.waitForChannelQr_=async()=>{};ctx.downloadBlob_=(blob,name)=>downloads.push({blob,name});return {ctx,nodes,calls,downloads,alerts};
}
test('PNG, JPEG and WebP buttons follow their real export pipeline and produce the correct filenames and formats',async()=>{
  const f=exportClient();
  for(const [format,mime,suffix] of [['png','image/png','HD.png'],['jpg','image/jpeg','WhatsApp.jpg'],['webp','image/webp','Web.webp']]){
    await f.ctx.downloadMenuFile_(format);const saved=f.downloads.at(-1);assert.equal(saved.blob.type,mime);assert.ok(saved.name.endsWith(suffix));assert.ok(saved.name.includes('MENU-2026-10-22'));
    assert.ok(Object.values(f.nodes).every(n=>!n.disabled));assert.match(f.nodes.exportStatus.textContent,/created:/);
  }
  assert.equal(f.downloads.length,3);assert.equal(f.alerts.length,0);assert.ok(f.calls.every(c=>c.useCORS&&!c.allowTaint));
});
test('Failed rendering restores all download controls and does not create a file',async()=>{
  const f=exportClient(true);await f.ctx.downloadMenuFile_('png');assert.equal(f.downloads.length,0);assert.equal(f.alerts.length,1);assert.ok(Object.values(f.nodes).every(n=>!n.disabled));assert.match(f.nodes.exportStatus.textContent,/export failed/);
});
