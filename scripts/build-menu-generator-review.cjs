const fs=require('node:fs'),path=require('node:path');
const {server,root}=require('../tests/helpers/menu-generator-fixture.cjs');
const flag=process.argv.indexOf('--output');
const out=flag>=0?path.resolve(process.argv[flag+1]):path.join(root,'../generator-review/rendered');
fs.mkdirSync(out,{recursive:true});
for(const profile of ['baseline','candidate']){
  const f=server(profile),html=f.render().replace('<head>','<head><title>Ma Kitchens menu generator '+profile+' review</title>');
  fs.writeFileSync(path.join(out,profile+'.html'),html);
}
console.log(JSON.stringify({output:out,source:'Supplied Apps Script/template, local native-menu fixture',liveAppsScriptExecuted:false,productionModified:false}));
