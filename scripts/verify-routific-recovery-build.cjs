const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const [originalFile,candidateFile]=process.argv.slice(2);
if(!originalFile||!candidateFile)throw Error('Usage: node scripts/verify-routific-recovery-build.cjs original.gs candidate.gs');
function inspect(file){const text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=new Map(),constants=new Map();
 for(const node of ast.statements){
  if(ts.isFunctionDeclaration(node)){if(functions.has(node.name.text))throw Error('Duplicate function '+node.name.text);functions.set(node.name.text,node.getText(ast));}
  if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)constants.set(declaration.name.getText(ast),declaration.initializer?.getText(ast));
 }return {functions,constants};}
const original=inspect(originalFile),candidate=inspect(candidateFile),changed=[];
for(const [name,body] of original.functions){assert(candidate.functions.has(name),'Removed function '+name);if(candidate.functions.get(name)!==body)changed.push(name);}
for(const [name,value] of original.constants)assert.equal(candidate.constants.get(name),value,'Changed existing constant '+name);
assert.deepEqual(changed.sort(),['doPost','handleRoutificWebhook_','mkReleaseValidateTriggers_','runRoutificEtaQueue','updateWhatsAppLogFromStatus_'].sort());
console.log(JSON.stringify({verified:true,existingFunctions:original.functions.size,unchangedFunctions:original.functions.size-changed.length,changedFunctions:changed,allExistingConstantsPreserved:true}));
