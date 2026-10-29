'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Module=require('node:module');
const serverPath=require.resolve('../src/server');
const serverModule=new Module(serverPath,module);
serverModule.filename=serverPath;
serverModule.paths=Module._nodeModulePaths(path.dirname(serverPath));
serverModule._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.deliverWaMessage = deliverWaMessage;\n',serverPath);
const gateway=serverModule.exports.__test;
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const code=app.slice(app.indexOf('function waMessageRecipientMarker('),app.indexOf('function waMessageCanSend('));
function marker(message){return vm.runInNewContext(code+'\nwaMessageRecipientMarker(message)',{message,dateTimeText:value=>value});}
const check={status:'not_registered',source:'gateway',phone:'6281234567890',checkedAt:'2026-10-29T08:00:00.000Z'};
test('verified unregistered recipients receive a marker in the existing phone column',()=>{
  const result=marker({status:'failed',phone:'081234567890',lastError:'HTTP 500',recipientCheck:check});
  assert.equal(result.label,'Nomor WA tidak terdaftar');assert(result.detail.includes(check.checkedAt));
  const rows=app.slice(app.indexOf('function waMessageRows('),app.indexOf('function waMessagePaginationControls('));
  assert.match(rows,/message\.phone[\s\S]*recipientMarker[\s\S]*waMessageSubject/);
});
test('No LID alone asks to check the number without claiming it is unregistered',()=>{
  assert.equal(marker({status:'failed',lastError:'No LID for user'}).label,'Periksa nomor WA');
  assert.equal(marker({status:'queued',lastError:'Lid is missing in chat table'}).label,'Periksa nomor WA');
  assert.equal(marker({status:'failed',lastError:'HTTP 500'}),null);
});
test('markers do not leak stale checks onto corrected or successfully delivered recipients',()=>{
  for(const status of ['sent','delivered','read','seen','draft'])assert.equal(marker({status,phone:'081234567890',recipientCheck:check}),null);
  assert.equal(marker({status:'failed',phone:'081234567891',recipientCheck:check}),null);
  assert.equal(marker({status:'failed',phone:'081234567890',recipientCheck:{...check,source:'unknown'}}),null);
  assert.equal(marker({status:'failed',phone:'081234567890',recipientCheck:{...check,checkedAt:'invalid'}}),null);
});
function mockGateway(t,response){const requests=[];t.mock.method(globalThis,'fetch',async(url,options={})=>{
  const pathname=new URL(url).pathname;requests.push({pathname,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
  if(pathname==='/api/sessions/default')return Response.json({status:'WORKING'});
  assert.equal(pathname,'/api/sendText');return response();
});return requests;}
const settings={baseUrl:'http://gateway.example.test',sender:'default',token:'test-key'};
test('marker patch leaves successful delivery at one status read and one send, with no recipient lookups',async t=>{
  const requests=mockGateway(t,()=>Response.json({id:'true_6281234567890@c.us_TEST'}));
  const result=await gateway.deliverWaMessage(settings,{phone:'081234567890',text:'Pesan uji'});
  assert.equal(result.providerMessageId,'true_6281234567890@c.us_TEST');assert.equal(requests.length,2);
  assert.deepEqual(requests[1].body,{session:'default',chatId:'6281234567890@c.us',text:'Pesan uji'});
});
test('nested engine errors become readable while original retry classification stays unchanged',async t=>{
  const requests=mockGateway(t,()=>Response.json({statusCode:500,exception:{message:'No LID for user\ninternal stack',stack:'not for display'}},{status:500}));
  await assert.rejects(gateway.deliverWaMessage(settings,{phone:'081234567890',text:'Pesan uji'}),error=>{
    assert.equal(error.message,'No LID for user');assert.equal(error.status,500);
    assert.equal(gateway.isTransientWaGatewayError(error),false);return true;
  });
  assert.equal(requests.length,2,'Do not add lookups, retries, re-routing or session recovery');
});
test('unknown HTTP failures are not relabeled as bad phone numbers or resent by the marker patch',async t=>{
  const requests=mockGateway(t,()=>new Response('',{status:500}));
  await assert.rejects(gateway.deliverWaMessage(settings,{phone:'081234567890',text:'Pesan uji'}),error=>{
    assert.equal(error.message,'HTTP 500');assert.equal(gateway.isTransientWaGatewayError(error),true);return true;
  });
  assert.equal(requests.length,2);
});
