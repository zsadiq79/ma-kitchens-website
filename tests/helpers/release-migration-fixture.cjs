const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../..'),copy=value=>JSON.parse(JSON.stringify(value));
function migrationFixture(environment='REHEARSAL'){
  const folder=environment==='REHEARSAL'?'production-rehearsal':'production-candidate';
  const source=fs.readFileSync(path.join(root,'apps-script',folder,'Code.gs'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'apps-script',folder,'source-manifest.json'),'utf8')),profile=manifest.profile;
  const state={environment,scriptId:profile.scriptId,activeId:profile.spreadsheetId,owner:'owner@example.test',lock:false,
    writes:[],nativeEffects:[],throwBefore:false,throwAfter:false,triggers:[],removed:[],props:{}};
  let grid={};
  const props={getProperty:key=>state.props[key]??null,setProperty:(key,value)=>{state.props[key]=String(value)},deleteProperty:key=>{delete state.props[key]}};
  function trigger(handler,event='ON_OPEN',source=profile.spreadsheetId){return {getHandlerFunction:()=>handler,getEventType:()=>event,getTriggerSourceId:()=>source};}
  const book={getId:()=>state.activeId,getOwner:()=>({getEmail:()=> 'owner@example.test'}),getSheetByName:name=>grid[name]?{
    getName:()=>name,getSheetId:()=>grid[name].properties.sheetId,getMaxRows:()=>grid[name].properties.gridProperties.rowCount,
    getMaxColumns:()=>grid[name].properties.gridProperties.columnCount,getParent:()=>book}:null};
  const ctx={console:{log(){}},PropertiesService:{getScriptProperties:()=>props},Session:{getActiveUser:()=>({getEmail:()=>state.owner}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    ScriptApp:{getScriptId:()=>state.scriptId,getProjectTriggers:()=>state.triggers,deleteTrigger:t=>{state.removed.push(t);state.triggers=state.triggers.filter(x=>x!==t)},
      newTrigger:handler=>({forSpreadsheet:value=>{assert.equal(value,book);return {onOpen:()=>({create:()=>{const t=trigger(handler);state.triggers.push(t);return t}})}}})},
    LockService:{getScriptLock:()=>({hasLock:()=>state.lock,waitLock:()=>{state.lock=true},releaseLock:()=>{state.lock=false},tryLock:()=>{state.lock=true;return true}})},
    SpreadsheetApp:{openById:id=>{state.nativeEffects.push(['open',id]);return book},getActiveSpreadsheet:()=>book},
    UrlFetchApp:{fetch:()=>{state.nativeEffects.push('fetch');return 'native-fetch'}},DocumentApp:{openById:()=>{state.nativeEffects.push('document');return 'doc'},create:()=>{state.nativeEffects.push('create-doc');return 'doc'}},DriveApp:{getFileById:()=>{state.nativeEffects.push('drive');return 'drive'}},
    ContentService:{MimeType:{JSON:'json',TEXT:'text'},createTextOutput:text=>({setMimeType:()=>({getContent:()=>text})})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(String(text)).digest()],computeHmacSha256Signature:(text,key)=>[...crypto.createHmac('sha256',key).update(text).digest()]},
    Sheets:{Spreadsheets:{get:(id)=>{assert.equal(id,profile.spreadsheetId);return {spreadsheetId:id,sheets:Object.values(grid).map(sheet=>({properties:copy(sheet.properties),protectedRanges:copy(sheet.protectedRanges||[])}))}},
      Values:{batchGet:(id,options)=>{assert.equal(id,profile.spreadsheetId);return {valueRanges:options.ranges.map(range=>({range,values:readRange(range)}))}},
        get:(id,range)=>{assert.equal(id,profile.spreadsheetId);return {values:readRange(range)}}},
      batchUpdate:(body,id)=>{
        assert.equal(id,profile.spreadsheetId);
        if(state.throwBefore){state.throwBefore=false;throw new Error('response lost before server apply')}
        const next=copy(grid);
        for(const request of body.requests){
          if(request.addSheet){const properties=request.addSheet.properties;next[properties.title]={properties:copy(properties),values:[],protectedRanges:[]};continue}
          const part=request.updateCells||request.appendDimension||request.repeatCell||request.updateSheetProperties||request.addProtectedRange;
          const id=part.sheetId??part.start?.sheetId??part.range?.sheetId??part.properties?.sheetId??part.protectedRange?.range.sheetId;
          const sheet=Object.values(next).find(sheet=>sheet.properties.sheetId===id);assert.ok(sheet,'known sheet for request');
          if(request.appendDimension){sheet.properties.gridProperties.columnCount+=part.length;continue}
          if(request.updateCells){const at=part.start||part.range;const row=at.rowIndex??at.startRowIndex??0,col=at.columnIndex??at.startColumnIndex??0;
            for(let i=0;i<part.rows.length;i++){sheet.values[row+i]??=[];for(let j=0;j<part.rows[i].values.length;j++){const cell=part.rows[i].values[j].userEnteredValue||{};sheet.values[row+i][col+j]=cell.formulaValue??cell.stringValue??cell.numberValue??cell.boolValue??''}}continue}
          if(request.addProtectedRange){sheet.protectedRanges.push(copy(part.protectedRange));continue}
          if(request.updateSheetProperties){Object.assign(sheet.properties,part.properties);continue}
          if(request.repeatCell)continue;
          throw new Error('Unsupported request '+Object.keys(request));
        }
        grid=next;state.writes.push(copy(body));
        if(state.throwAfter){state.throwAfter=false;throw new Error('response lost after server apply')}
        return {replies:body.requests.map(()=>({}))};
      }}}};
  function readRange(range){
    const m=range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):?([A-Z]+)?(\d+)?$/);assert.ok(m,'bounded range '+range);
    const sheet=grid[m[1].replace(/''/g,"'")];assert.ok(sheet,'read known sheet');
    const number=text=>[...text].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0);
    const first=Number(m[3])-1,last=m[5]?Number(m[5]):first+1,start=number(m[2])-1,end=m[4]?number(m[4]):start+1;
    assert.ok(end<=sheet.properties.gridProperties.columnCount,'range fits columns');
    return sheet.values.slice(first,last).map(row=>(row||[]).slice(start,end));
  }
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const layouts=copy(vm.runInContext('MK_OWNER_OPERATIONAL_LAYOUT',ctx)),formulas=copy(vm.runInContext('MK_OWNER_FORMULA_BASELINE',ctx));
  function addSheet(name,width=26,rows=1000){const sheet={properties:{sheetId:Object.keys(grid).length+1,title:name,gridProperties:{rowCount:rows,columnCount:width}},values:[],protectedRanges:[]};grid[name]=sheet;return sheet}
  for(const [name,headers]of Object.entries(layouts)){const width=name==='Orders'?31:23;const sheet=addSheet(name,width,name==='Orders'?2000:5000);sheet.values=[headers.slice(0,width)]}
  const legacy=addSheet('Order Entry',18,1001);legacy.properties.sheetId=50003;legacy.values=Array.from({length:18},()=>Array(11).fill(''));
  legacy.values[2][10]='CREATED';legacy.values[5][10]='ORD-000052';legacy.values[7][10]='UNCERTAIN';
  for(const [key,formula]of Object.entries(formulas)){const [name,cell]=key.split('!'),m=cell.match(/^([A-Z]+)(\d+)$/),column=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);grid[name].values[Number(m[2])-1]??=[];grid[name].values[Number(m[2])-1][column-1]=formula}
  for(let i=1;i<=52;i++){grid.Orders.values[i]??=[];grid.Orders.values[i][0]='ORD-'+String(i).padStart(6,'0');grid.Orders.values[i][3]='CUST-'+String(Math.min(i,45)).padStart(6,'0')}
  while(Object.keys(grid).length<26)addSheet('Baseline '+Object.keys(grid).length);
  if(environment==='PRODUCTION')state.triggers=[trigger('orderEntryMenu'),trigger('orderEntryEdited','ON_EDIT'),trigger('showPackingSlipsMenu_'),trigger('runFeedbackSender','CLOCK','')];
  function configure(){return environment==='REHEARSAL'?ctx.configureOrderAutomationRehearsal():ctx.configureOrderAutomationProduction()}
  return {ctx,state,profile,manifest,source,book,props,trigger,configure,get grid(){return grid},copy};
}
module.exports={migrationFixture};
