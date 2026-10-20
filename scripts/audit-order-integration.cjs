const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'apps-script/integration-test/Code.gs'),'utf8');
const ctx={};vm.createContext(ctx);new vm.Script(source).runInContext(ctx);
const markers=[...source.matchAll(/^\/\/ =+ SOURCE: (.+?) =+$/gm)].map(m=>({module:m[1],position:m.index}));
const functions=[...source.matchAll(/^function\s+(\w+)\s*\(/gm)].map(m=>{
  const name=m[1],text=ctx[name].toString(),start=source.indexOf(text),module=markers.filter(x=>x.position<start).at(-1).module;
  return {name,module,startLine:source.slice(0,start).split('\n').length,endLine:source.slice(0,start+text.length).split('\n').length,
    calls:[...new Set([...text.matchAll(/(?<![.\w])([A-Za-z_$][\w$]*_)\s*\(/g)].map(x=>x[1]))].filter(n=>n!==name)};
});
const unresolved=[...new Set(functions.flatMap(f=>f.calls))].filter(name=>typeof ctx[name]!=='function');
if(unresolved.length || new Set(functions.map(f=>f.name)).size!==functions.length)throw new Error('Unresolved or duplicate custom functions');
if(/UrlFetchApp\s*\.\s*fetch\s*\(|DocumentApp\s*\.\s*(?:openById|create)\s*\(|1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4/.test(source))throw new Error('Test boundary escape');
const counts={};for(const f of functions)counts[f.module]=(counts[f.module]||0)+1;
const output={scope:'Static function inventory and boundary checks. Individual runtime coverage varies; this is not end-to-end certification.',
  codeSha256:crypto.createHash('sha256').update(source).digest('hex'),functionCount:functions.length,moduleFunctionCounts:counts,
  unresolvedCustomCalls:unresolved,publicHandlers:functions.filter(f=>['doGet','doPost'].includes(f.name)),functions};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/order-automation-audit-inventory.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({functions:functions.length,moduleFunctionCounts:counts,unresolvedCustomCalls:unresolved}));
