const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
const directory=profile=>path.join(root,'apps-script/menu-generator-review',profile);
const read=(profile,name)=>fs.readFileSync(path.join(directory(profile),name),'utf8');

function dateParts(date,timeZone){
  return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
}
function serialDate(serial,timeZone){
  const wall=Date.UTC(1899,11,30)+Math.round(serial*86400000);
  let instant=wall;
  for(let attempt=0;attempt<3;attempt++){
    const p=dateParts(new Date(instant),timeZone),actual=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    const difference=wall-actual;instant+=difference;if(!difference)break;
  }
  return new Date(instant);
}
function formatDate(date,timeZone,pattern){
  const p=dateParts(date,timeZone),longWeekday=new Intl.DateTimeFormat('en-AU',{timeZone,weekday:'long'}).format(date);
  const longMonth=new Intl.DateTimeFormat('en-AU',{timeZone,month:'long'}).format(date);
  const label=longWeekday+', '+Number(p.day)+' '+longMonth;
  if(pattern==='HH:mm')return p.hour+':'+p.minute;
  if(pattern==='yyyy-MM-dd')return p.year+'-'+p.month+'-'+p.day;
  if(pattern==='EEEE, d MMMM')return label;
  if(pattern==='EEEE, d MMMM yyyy')return label+' '+p.year;
  if(pattern==='EEE, d MMM yyyy')return longWeekday.slice(0,3)+', '+Number(p.day)+' '+longMonth.slice(0,3)+' '+p.year;
  if(pattern==="EEEE, d MMMM 'at' h:mm a")return label+' at '+(+p.hour%12||12)+':'+p.minute+(+p.hour<12?' AM':' PM');
  throw new Error('Unsupported fixture date pattern: '+pattern);
}
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function renderTemplate(source,context){
  let position=0,program='let out="";\n',match;
  const tags=/<\?([\s\S]*?)\?>/g;
  while((match=tags.exec(source))){
    program+='out+='+JSON.stringify(source.slice(position,match.index))+';\n';
    const code=match[1];
    if(code.startsWith('!='))program+='out+=String('+code.slice(2)+');\n';
    else if(code.startsWith('='))program+='out+=fixtureEscape('+code.slice(1)+');\n';
    else program+=code+'\n';
    position=tags.lastIndex;
  }
  program+='out+='+JSON.stringify(source.slice(position))+';\nout;';
  return vm.runInNewContext(program,{...context,fixtureEscape:escapeHtml});
}
function server(profile='candidate',input){
  const fixture=input||JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/menu-generator-live-20261020.json'),'utf8'));
  const raw=c=>['DATE','TIME','DATE_TIME'].includes(c.format)&&typeof c.value==='number'?serialDate(c.value,fixture.timeZone):c.value;
  let reads=0;
  const context={Date,Number,String,Object,Array,Math,JSON,isNaN,isFinite,Utilities:{formatDate},Logger:{log(){}},
    SpreadsheetApp:{openById(id){if(id!==fixture.spreadsheetId)throw new Error('Unexpected workbook');return {
      getSpreadsheetTimeZone:()=>fixture.timeZone,
      getSheetByName(name){const rows=fixture.sheets[name];if(!rows)return null;return {getDataRange(){reads++;return {
        getValues:()=>rows.map(row=>row.map(raw)),getDisplayValues:()=>rows.map(row=>row.map(c=>c.display))
      };}};}
    };}},ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/AKfycbz4Tvl9vwHRhgBww_b90WK51KARl2By14i7kxuAy95iOb4QKOHOiUf_czmwYNBypwVbSQ/exec'})}};
  context.HtmlService={XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createTemplateFromFile(name){
    if(name!=='MenuV2')throw new Error('Unexpected template');
    const template={evaluate(){const output={html:renderTemplate(read(profile,'MenuV2.html'),{...context,...template}),setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};return output;}};
    return template;
  }};
  vm.createContext(context);vm.runInContext(read(profile,'Code.gs'),context);
  return {ctx:context,fixture,readCount:()=>reads,menu:()=>context.buildMenuV2_('MENU-2026-10-22'),render:()=>context.doGet({parameter:{cycle:'MENU-2026-10-22'}}).html};
}
function client(profile='candidate',extra={}){
  const script=[...read(profile,'MenuV2.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function downloadMenuFile_'));
  const ctx={console:{error(){}},setTimeout,clearTimeout,setInterval,clearInterval,URL,Promise,Date,Number,Math,Array,Object,String,
    alert(){},window:{addEventListener(){}},document:{querySelector:()=>null,getElementById:()=>null},...extra};
  vm.createContext(ctx);vm.runInContext(script,ctx);return ctx;
}
module.exports={root,read,server,client,serialDate,formatDate,renderTemplate};
