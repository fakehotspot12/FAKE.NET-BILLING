'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fixture,sleep}=require('./helpers/olt-native-fixture');
process.env.MIGRATION_MODE='0';
test('native PTY keeps immediate echo and ANSI editing, executes only on guarded Enter and never runs a server shell',async()=>{
 const f=await fixture();try{await f.key('show version-runninX');await f.wait(row=>row.output.includes('runninX'));assert.equal(f.executed.length,0);await f.key('\x7f');await f.key('g');await f.key('\r');await f.wait(row=>!row.commandPending&&row.output.includes('Unit Version'));assert.deepEqual(f.executed,['show version-running']);assert(f.read().output.includes('\x1b[2K'));}finally{f.stop();}
});
test('blocked commands print one inline console error, retain editable input and never execute',async()=>{
 const f=await fixture(),access={permissions:['olt:read','olt:onu:delete']};try{await f.key('write memory');const sequence=f.read().sequence+1;await assert.rejects(f.key('\r',sequence,access),error=>error.status===403&&error.consoleReported===true);const first=f.read();assert(first.output.includes('% Billing: Perintah ini memerlukan izin kelola OLT.'));assert(first.output.endsWith('OLT#write memory'));await assert.rejects(f.key('\r',sequence,access));assert.equal(f.read().output,first.output);assert.deepEqual(f.executed,[]);assert.equal(f.read().state,'ready');}finally{f.stop();}
});
test('native error output and ANSI cursor/colors are preserved but fragmented OSC/DCS payloads are not forwarded',()=>{
 const filter=require('../src/olt-terminal-native').createOutputFilter();let output='';for(const part of['\x1b]52;c;','cHJpdmF0ZQ==','\x07','\x1bPcontrol','\x1b','\\','\x1b[31m%Error 20202: Invalid input\x1b[0m\r\nOLT#'])output+=filter(part);assert.equal(output,'\x1b[31m%Error 20202: Invalid input\x1b[0m\r\nOLT#');assert(!output.includes('cHJpdmF0ZQ'));
 const c1=require('../src/olt-terminal-native').createOutputFilter();assert.equal(c1('\x9d52;c;secret\x9cOLT#'),'OLT#');
});
test('question help waits for the restored prompt and preserves trailing space for continued typing',async()=>{
 const f=await fixture({helpDelay:180});try{await f.key('show gpon onu ');await f.key('?');assert(f.read().output.includes('Show ONU state'));await f.key('state');await f.key('\r');await f.wait(row=>!row.commandPending);assert.deepEqual(f.executed,['show gpon onu state']);}finally{f.stop();}
});
test('native Tab and device history are not a browser command dictionary',async()=>{
 const f=await fixture();try{await f.key('show ver');await f.key('\t');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('\x1b[A');await f.key('\r');await f.wait(row=>!row.commandPending);assert.deepEqual(f.executed,['show version-running ','show version-running ']);}finally{f.stop();}
});
test('reboot, multiline, local Telnet escape and alternate legacy raw Enter cannot bypass the policy',async()=>{
 const f=await fixture();try{await f.key('reboot');await assert.rejects(f.key('\r'),/hapus\/reset/);assert.deepEqual(f.executed,[]);for(const value of['show x\rreboot','\x1d','\x0f','\x1b[6n'])await assert.rejects(f.key(value));await assert.rejects(f.manager.input(f.owner,f.device,f.id,{kind:'enter'}),/interaktif/);assert(!f.writes.includes('reboot\r'));}finally{f.stop();}
});
test('CLI deletion returns the web target without sending Enter, including a history-recalled deletion',async()=>{
 const f=await fixture();try{await f.key('interface gpon-olt_1/1/1');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('no onu 7');const result=await f.key('\r');assert.equal(result.action,'preview-delete-onu');assert.deepEqual(result.target,{frame:1,slot:1,pon:1,ponKey:'1/1/1',onuId:7});assert(!f.executed.includes('no onu 7'));}finally{f.stop();}
});
test('password typing and even an incorrectly echoed password remain absent from public output',async()=>{
 const f=await fixture();try{await f.key('enable');await f.key('\r');await f.wait(row=>row.passwordInput);await f.key('private-enable-secret');assert(!f.read().output.includes('private-enable-secret'));await f.key('\r');await f.wait(row=>!row.commandPending&&!row.passwordInput);assert(!f.read().output.includes('private-enable-secret'));assert(f.writes.includes('private-enable-secret\r'));}finally{f.stop();}
});
test('long-poll wakes on output without extending idle time, handles abort and limits concurrent readers',async()=>{
 const f=await fixture();try{const before=f.read(),controller=new AbortController(),waiting=f.manager.waitRead(f.owner,f.device,f.id,before.offset,before.revision,controller.signal);await assert.rejects(f.manager.waitRead(f.owner,f.device,f.id,before.offset,before.revision),/masih berjalan/);await f.key('s');assert((await waiting).output.includes('s'));const next=f.read(),pending=f.manager.waitRead(f.owner,f.device,f.id,next.offset,next.revision,controller.signal);controller.abort();await pending;assert(f.read().idleUntil>=before.idleUntil);}finally{f.stop();}
});
test('native input sequence deduplicates Enter and rejects conflicting replay or another session owner',async()=>{
 const f=await fixture();try{await f.key('show version-running',1);const sent=await f.key('\r',2);assert.deepEqual(await f.key('\r',2),sent);await f.wait(row=>!row.commandPending);assert.equal(f.executed.length,1);await assert.rejects(f.key('x',2),/Urutan/);assert.throws(()=>f.manager.input('other',f.device,f.id,{kind:'keys',value:'x',sequence:3}),/tidak ditemukan/);}finally{f.stop();}
});
test('a chunked empty Password detail field never closes the native terminal or asks for a credential',async()=>{
 const f=await fixture({emptyPasswordField:true});try{await f.key('show gpon onu detail-info gpon-onu_1/1/13:6');await f.key('\r');await f.wait(row=>!row.commandPending&&row.output.includes('Unit detail'));assert.equal(f.read().state,'ready');assert.equal(f.read().passwordInput,false);assert.equal(f.executed.length,1);}finally{f.stop();}
});
test('resize is bounded and does not execute an OLT command; closing during Enter cancels pending delivery',async()=>{
 const f=await fixture();try{await f.manager.input(f.owner,f.device,f.id,{kind:'resize',cols:120,rows:40,sequence:1});assert.deepEqual(f.sizes,[[120,40]]);await assert.rejects(f.manager.input(f.owner,f.device,f.id,{kind:'resize',cols:9999,rows:40,sequence:2}));await f.key('show version-running',3);const entering=f.key('\r',4);await sleep(20);f.stop();await assert.rejects(entering);assert.equal(f.executed.length,0);}finally{f.stop();}
});
test('native Enter keeps configuration context without an implicit Ctrl+C and still checks recalled unsafe commands',async()=>{
 const f=await fixture({ctrlExitsConfig:true,history:['reboot']});try{
  await f.key('\x1b[A');await assert.rejects(f.key('\r'),/hapus\/reset/);assert.equal(f.executed.length,0);await f.key('\x15');
  await f.key('configure terminal');await f.key('\r');await f.wait(row=>!row.commandPending&&row.prompt==='OLT(config)#');
  await f.key('show version-running');await f.key('\r');await f.wait(row=>!row.commandPending);assert.equal(f.read().prompt,'OLT(config)#');
  assert(!f.writes.includes('\x03'));assert.deepEqual(f.executed,['configure terminal','show version-running']);
 }finally{f.stop();}
});
test('pagination accepts only page keys or interruption and never executes queued command text',async()=>{
 const f=await fixture();try{await f.key('show paging');await f.key('\r');await f.wait(row=>row.pagerInput);await assert.rejects(f.key('reboot'),/Tunggu prompt/);await f.key(' ');await f.wait(row=>!row.commandPending);assert.deepEqual(f.executed,['show paging']);}finally{f.stop();}
});
test('an incomplete interface command cannot establish a deletion context',async()=>{
 const f=await fixture({navigationError:'%Command incomplete.'});try{await f.key('interface gpon-olt_1/1/1');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('no onu 7');await assert.rejects(f.key('\r'),/Posisi ONU belum pasti/);assert(!f.executed.includes('no onu 7'));}finally{f.stop();}
});
test('invalid initial PTY dimensions do not hold the shared transport lock',async()=>{
 const f=await fixture();try{f.stop();await assert.rejects(f.manager.start(f.data,f.device,f.owner,{confirm:true,revision:f.device.updatedAt,mode:'native',cols:0,rows:24}),/Ukuran terminal/);const[,,transport]=await require('../src/olt-vendors').loadLibrary();assert(transport.claimOlt(f.device.id));transport.releaseOlt(f.device.id);}finally{f.stop();}
});
test('erased spaces after the cursor are not mistaken for an unverified native prompt',async()=>{
 const native=require('../src/olt-terminal-native'),writes=[];let engine;try{
  engine=native.create({device:{vendor:'zte'},prompt:'OLT#',cols:80,rows:24,settleMs:5,write:value=>{writes.push(value);if(value==='\r')void engine.feed('\r\nOLT#');},append:()=>{},terminate:()=>{throw Error('Unexpected termination');}});
  await engine.feed('show version-running'+ ' '.repeat(20)+'\b'.repeat(20));await engine.input('show version-running');
  await engine.input('\r');assert.deepEqual(writes,['show version-running','\r']);
 }finally{engine?.dispose();}
});
test('a horizontally clipped device line resynchronizes with Ctrl+E/U without exiting configuration mode',async()=>{
 const native=require('../src/olt-terminal-native'),writes=[],command='show gpon onu state gpon-olt_1/1/13';let engine,terminated=false;try{
  engine=native.create({device:{vendor:'zte'},prompt:'OLT(config)#',cols:36,rows:18,settleMs:5,write:value=>{
   writes.push(value);
   if(value===command)void engine.feed('\rOLT(config)#$clipped input');
   if(value==='\x15')void engine.feed('\rOLT(config)#'+' '.repeat(20)+'\b'.repeat(20));
   if(value===command+'\r')void engine.feed(command+'\r\nRead result\r\nOLT(config)#');
  },append:()=>{},terminate:()=>{terminated=true;}});
  await engine.input(command);await engine.input('\r');assert(!terminated);assert.deepEqual(writes,[command,'\x05','\x15',command+'\r']);assert.equal(engine.status().prompt,'OLT(config)#');
 }finally{engine?.dispose();}
});
test('native ZTE no shutdown runs only after successful PON selection and keeps ONU deletion intercepted',async()=>{
 const f=await fixture({ctrlExitsConfig:true});try{
  await f.key('no shutdown');await assert.rejects(f.key('\r'),/interface PON ZTE/);assert.equal(f.executed.length,0);await f.key('\x15');
  for(const command of['configure terminal','interface gpon-olt_1/1/13','no shutdown']){await f.key(command);await f.key('\r');await f.wait(row=>!row.commandPending);}
  assert.deepEqual(f.executed,['configure terminal','interface gpon-olt_1/1/13','no shutdown']);assert(!f.writes.includes('\x03'));
  await f.key('no onu 7');const deletion=await f.key('\r');assert.equal(deletion.action,'preview-delete-onu');assert.equal(deletion.target.ponKey,'1/1/13');assert(!f.executed.includes('no onu 7'));
  await f.key('\x15');await f.key('exit');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('no shutdown');await assert.rejects(f.key('\r'),/interface PON ZTE/);
 }finally{f.stop();}
});
test('a failed ZTE PON selection cannot authorize no shutdown',async()=>{
 const f=await fixture({navigationError:'%Error: invalid interface'});try{await f.key('interface gpon-olt_1/1/13');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('no shutdown');await assert.rejects(f.key('\r'),/interface PON ZTE/);assert(!f.executed.includes('no shutdown'));}finally{f.stop();}
});
test('native CLI requires current server-side PON permission at Enter and ignores a permission array in the browser payload',async()=>{
 const f=await fixture();try{
  await f.key('interface gpon-olt_1/1/13');await f.key('\r');await f.wait(row=>!row.commandPending);await f.key('no shutdown');
  await assert.rejects(f.key('\r',undefined,{permissions:[]}),error=>error.status===403);assert(!f.executed.includes('no shutdown'));
  await assert.rejects(f.manager.input(f.owner,f.device,f.id,{kind:'keys',value:'\r',sequence:f.read().sequence+1,permissions:['olt:pon:manage']}),error=>error.status===403);assert(!f.executed.includes('no shutdown'));
  await f.manager.input(f.owner,f.device,f.id,{kind:'keys',value:'\r',sequence:f.read().sequence+1},{permissions:['olt:pon:manage']});await f.wait(row=>!row.commandPending);assert.equal(f.executed.filter(command=>command==='no shutdown').length,1);
 }finally{f.stop();}
});
