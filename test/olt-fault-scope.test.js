'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/olt.js'),'utf8');

function fixture(){
  const ports=[1,2,3].map(index=>({kind:'pon',ponKey:'0/0/'+index,name:'PON '+index,online:4,offline:12,total:16}));
  const rows=ports.flatMap(port=>['online','los','dying-gasp','other','high-rx'].flatMap(condition=>Array.from({length:4},(_,index)=>({id:port.ponKey+condition+index,ponKey:port.ponKey,onuId:index+1,serialNumber:'HWTC00000001',name:'Unit '+port.name,status:['online','high-rx'].includes(condition)?'online':'offline',condition:condition==='high-rx'?'online':condition,rxPower:condition==='high-rx'?-28:null,distance:null,filter:condition}))));
  const device={id:'unit',vendor:'zte',name:'OLT Unit',status:'online',ponOverview:ports,summary:{total:48,online:12,los:12,dyingGasp:12,other:12,highRx:12},checkedAt:new Date().toISOString()};
  const elements={oltRoot:{querySelector:()=>null},oltContent:{querySelector:()=>({after:()=>{}})},oltPorts:{querySelectorAll:()=>[]},oltOnuResults:{querySelectorAll:()=>[]},oltPonControlBar:{},oltNotice:{},oltStatusRead:{}};
  const queries=[],context={user:{role:'viewer'},isCurrent:()=>true,can:()=>false,escapeHtml:value=>String(value??''),api:async url=>{
    const query=new URL(url,'http://unit.test').searchParams;queries.push(query);
    assert.equal(query.get('oltId'),device.id);
    const matched=rows.filter(row=>!query.get('status')||row.filter===query.get('status')),filtered=matched.filter(row=>!query.get('pon')||row.ponKey===query.get('pon')),page=Number(query.get('page')),limit=Number(query.get('limit'));
    return{devices:[device],ports:ports.map(port=>({...port,filteredTotal:matched.filter(row=>row.ponKey===port.ponKey).length})),summary:device.summary,filteredTotal:matched.length,onus:filtered.slice((page-1)*limit,page*limit),total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/limit)),limit};
  }};
  const sandbox={window:{},document:{getElementById:id=>elements[id]||null},setTimeout:()=>0,clearTimeout:()=>{},URLSearchParams,Intl,Date};
  vm.runInNewContext(source.replace('window.FakenetOltUI={render};','window.FakenetOltUI={loadDetails,view,setup:ctx=>{context=ctx;payload={devices:[ctx.device]};}};'),sandbox);
  const ui=sandbox.window.FakenetOltUI;ui.setup({...context,device});Object.assign(ui.view,{deviceId:device.id,tab:'onus'});
  return{ui,elements,queries};
}

for(const status of ['online','los','dying-gasp','other','high-rx'])test(status+' spans every PON on one OLT, stays paginated and never starts a live PON read',async()=>{
  const {ui,elements,queries}=fixture();Object.assign(ui.view,{status,allPons:true,pon:'0/0/1'});
  await ui.loadDetails(true);
  assert.equal(queries[0].get('pon'),'');assert.equal(queries[0].get('limit'),'8');assert.equal(queries[0].get('live'),null);assert.equal(queries[0].get('livePon'),null);
  assert.equal((elements.oltOnuResults.innerHTML.match(/<tr>/g)||[]).length,9);
  assert.match(elements.oltOnuResults.innerHTML,/12 ONU \/ Halaman 1 dari 2/);
  assert.match(elements.oltPorts.innerHTML,/data-pon="" aria-pressed="true"/);
  assert.match(elements.oltPorts.innerHTML,/>Hasil Filter<\/strong><small>12 ONU/);assert.equal((elements.oltPorts.innerHTML.match(/<small>4 ONU<\/small>/g)||[]).length,3);assert.doesNotMatch(elements.oltPorts.innerHTML,/48 ONU|Semua PON/);
  assert.match(elements.oltStatusRead.textContent,/^Hasil Filter/);assert.equal(elements.oltPonControlBar.hidden,true);
  ui.view.page=2;await ui.loadDetails();assert.equal(queries[1].get('page'),'2');assert.equal(queries[1].get('pon'),'');assert.equal((elements.oltOnuResults.innerHTML.match(/<tr>/g)||[]).length,5);
  Object.assign(ui.view,{allPons:false,pon:'0/0/3',page:1});await ui.loadDetails();assert.equal(queries[2].get('pon'),'0/0/3');assert.match(elements.oltOnuResults.innerHTML,/4 ONU \/ Halaman 1 dari 1/);
});

test('normal ONU view still starts at the first physical PON without an all-PON button',async()=>{
  const {ui,elements,queries}=fixture();await ui.loadDetails();assert.equal(queries[0].get('pon'),'0/0/1');assert.equal(queries[0].get('limit'),'8');assert.doesNotMatch(elements.oltPorts.innerHTML,/data-pon=""/);
  Object.assign(ui.view,{status:'',allPons:true,pon:''});await ui.loadDetails();assert.equal(queries[1].get('pon'),'0/0/1');assert.doesNotMatch(elements.oltPorts.innerHTML,/data-pon=""/);
});
