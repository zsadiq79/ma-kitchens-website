const fs=require('node:fs'),path=require('node:path');
const {server,root}=require('../tests/helpers/menu-generator-fixture.cjs');
const flag=process.argv.indexOf('--output');
const out=flag>=0?path.resolve(process.argv[flag+1]):path.join(root,'../generator-review/rendered');
fs.mkdirSync(out,{recursive:true});
for(const profile of ['baseline','candidate']){
  const f=server(profile),timeFlag=process.argv.indexOf('--poster-time');
  if(profile==='candidate'&&timeFlag>=0){
    const clock=process.argv[timeFlag+1],match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock||'');
    if(!match)throw new Error('Use --poster-time HH:mm for a review-only fixture override.');
    const row=f.fixture.sheets['Menu Config'].find(row=>row[0].value==='Default Deadline Time');
    row[1]={value:(Number(match[1])*60+Number(match[2]))/1440,display:clock,format:'TIME'};
  }
  const html=f.render().replace('<head>','<head><title>Ma Kitchens menu generator '+profile+' review</title>');
  fs.writeFileSync(path.join(out,profile+'.html'),html);
}
console.log(JSON.stringify({output:out,source:'Supplied Apps Script/template, local native-menu fixture',posterTimeReviewOverride:process.argv.includes('--poster-time')?process.argv[process.argv.indexOf('--poster-time')+1]:null,liveAppsScriptExecuted:false,productionModified:false}));
