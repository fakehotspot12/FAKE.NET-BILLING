'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const cli=require('../src/olt-cli'),secrets=require('../src/secure-secrets');
function fixture(options={}){
 const data={settings:{}},device={id:'cli-'+Math.random(),host:'192.0.2.1',cliPort:23,cliUsername:'unit',cliEnabled:true,cliPasswordEnc:secrets.encryptSecret(data,'UnitPassword')},commands=[];
 const spawn=(binary,args)=>{assert.equal(binary,'telnet');assert.deepEqual(args,['192.0.2.1','23']);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};let login=0;
 child.stdin.on('data',chunk=>{const command=String(chunk).trim();queueMicrotask(()=>{if(login===0){assert.equal(command,'unit');login++;child.stdout.write('Password: ');return;}if(login===1){assert.equal(command,'UnitPassword');login++;child.stdout.write(options.badPassword?'Login incorrect\n':'\r\nCDATA Area Utama > ');return;}commands.push(command);let output='';if(command==='show ont status-count')output='Offline : 1\r\n0/0 1 2 HWTCAABBCCDD 7 LOS';if(command.startsWith('show ont info'))output=commands.some(row=>row.startsWith('ont delete'))?'Error: The ONT does not exist.':'SN : '+(options.wrongSerial?'FHTTAABBCCDD':'HWTCAABBCCDD');child.stdout.write(command+'\r\n'+output+'\r\nCDATA Area Utama(config)# ');});});queueMicrotask(()=>child.stdout.write('User name: '));return child;};return{data,device,commands,spawn};
}
test('CLI read permits only enable and one aggregate status command',async()=>{const f=fixture(),result=await cli.run(f.data,f.device,null,f.spawn);assert.deepEqual(f.commands,['enable','show ont status-count']);assert(result.outputs.at(-1).stdout.includes('LOS'));});
test('CLI rejects bad login without exposing password or issuing router commands',async()=>{const f=fixture({badPassword:true});await assert.rejects(cli.run(f.data,f.device,null,f.spawn),/ditolak/);assert.deepEqual(f.commands,[]);});
test('CLI identity mismatch aborts before any deletion command',async()=>{const f=fixture({wrongSerial:true});await assert.rejects(cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD'},f.spawn),/Serial ONU/);assert(!f.commands.some(row=>row.startsWith('ont delete')));});
test('single ONU delete uses numeric trusted address and rechecks identity in the same session',async()=>{const f=fixture(),result=await cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD'},f.spawn);assert(result.deleteConfirmed);assert.deepEqual(f.commands,['enable','config','interface gpon 0/0','show ont info 1 2','ont delete 1 2','show ont info 1 2']);assert(!f.commands.some(row=>/\ball\b|save|write/.test(row)));});
test('invalid address and newline injection rejected before CLI spawn',async()=>{const f=fixture();await assert.rejects(cli.run(f.data,f.device,{slot:0,pon:'1;reboot',onuId:2,serialNumber:'HWTCAABBCCDD'},()=>{throw Error('must not spawn');}),/Alamat ONU/);});
test('reboot uses the same identity check and never sends a delete or global save',async()=>{const f=fixture();await cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'reboot'},f.spawn);assert(f.commands.includes('ont reboot 1 2'));assert(!f.commands.some(row=>/ont delete|\ball\b|save|write/.test(row)));});
function descriptionFixture(options={}){
 const f=fixture(options),spawn=(...args)=>{const child=f.spawn(...args),write=child.stdout.write.bind(child.stdout);child.stdout.write=chunk=>{
   let text=String(chunk);if(text.startsWith('show ont info'))text=text.replace('\r\nCDATA Area Utama',`\r\nDescription : ${f.commands.some(row=>row.startsWith('ont description'))?(options.failedReadback?'Wrong name':'New Client'):(options.emptyDescription?'':options.changedName?'Different name':'Old Client')}\r\nLast down cause : dying-gasp\r\nCDATA Area Utama`);return write(text);
 };return child;};return {...f,spawn};
}
test('description edit verifies SN and old name, writes one ONU and reads back exactly',async()=>{const f=descriptionFixture(),result=await cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'describe',description:'New Client',previousDescription:'Old Client'},f.spawn);assert(result.descriptionConfirmed);assert.deepEqual(f.commands,['enable','config','interface gpon 0/0','show ont info 1 2','ont description 1 2 New Client','show ont info 1 2']);assert(!f.commands.some(row=>/ont delete|ont reboot|^save$|^write$/.test(row)));});
test('description edit aborts on changed name or serial and rejects command injection',async()=>{
 for(const options of [{changedName:true},{wrongSerial:true}]){const f=descriptionFixture(options);await assert.rejects(cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'describe',description:'New Client',previousDescription:'Old Client'},f.spawn));assert(!f.commands.some(row=>row.startsWith('ont description')));}
 for(const value of ['','x\nreboot','x;save','x?','x|save','x"','x'.repeat(65)])assert.throws(()=>cli.description(value));
 const f=descriptionFixture({failedReadback:true}),result=await cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'describe',description:'New Client',previousDescription:'Old Client'},f.spawn);assert.equal(result.descriptionConfirmed,false);
});
test('blank CLI description stops at its line and never consumes another ONT field',()=>{
 assert.equal(cli.readDescription('  Description          :  \r\n  Last down cause      : dying-gasp\r\n'), '');
 assert.equal(cli.readDescription('Description:\nSN: HWTCAABBCCDD\n'), '');
 assert.equal(cli.readDescription('Description : Client A\r\nRun state : online'), 'Client A');
 assert.equal(cli.readDescription('Run state : online\n'),null);
});
test('only the matching CDATA physical address prefix is removed from SNMP ONU names',()=>{
 const target={slot:1,pon:2,onuId:3,ponKey:'0/1/2'};
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 3 Client A',target),'Client A');
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 3',target),'');
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 3   ',target),'');
 assert.equal(cli.onuDescription('GPON 0/1/2 ONU 3 Client A',{slot:1,pon:2,onuId:3}),'Client A');
 for(const name of ['Client A','gpon 0/1/2 onu 4 Other','gpon 0/2/2 onu 3 Other','gpon account'])assert.equal(cli.onuDescription(name,target),name);
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 3 Client A',{}),'gpon 0/1/2 onu 3 Client A');
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 1',{...target,onuId:19}),'');
 assert.equal(cli.onuDescription('gpon 0/1/2 onu 1 Named Client',{...target,onuId:19}),'gpon 0/1/2 onu 1 Named Client');
});
test('a previously blank ONT description can be edited with same-session identity and readback checks',async()=>{
 const f=descriptionFixture({emptyDescription:true}),result=await cli.run(f.data,f.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'describe',description:'New Client',previousDescription:''},f.spawn);
 assert.equal(result.descriptionConfirmed,true);assert.equal(f.commands.filter(row=>row.startsWith('ont description')).length,1);
});
test('read-only native description inspection verifies the serial before returning without any mutation command',async()=>{
 const f=descriptionFixture(),target={slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD',action:'inspect'};
 const result=await cli.run(f.data,f.device,target,f.spawn);assert.equal(cli.readDescription(result.outputs.at(-1).stdout),'Old Client');assert.deepEqual(f.commands,['enable','config','interface gpon 0/0','show ont info 1 2']);
 const wrong=descriptionFixture({wrongSerial:true});await assert.rejects(cli.run(wrong.data,wrong.device,target,wrong.spawn),/Serial ONU/);assert.equal(wrong.commands.length,4);
});
function offlineFixture(options={}){
 const f=descriptionFixture(options),spawn=(...args)=>{const child=f.spawn(...args),write=child.stdout.write.bind(child.stdout);child.stdout.write=chunk=>{let value=String(chunk);if(value.startsWith('show ont info')&&!f.commands.some(row=>row.startsWith('ont delete'))){if(options.absent)value='show ont info 1 2\r\nError: The ONT does not exist.\r\nCDATA Area Utama(config)# ';else value=value.replace('SN :','Error: Ranging info get failed.\r\nSN :');}return write(value);};return child;};return {...f,spawn};
}
test('offline Other ranging warnings do not block serial-verified inspection and single-ONU deletion',async()=>{
 const f=offlineFixture(),target={slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD'};
 const result=await cli.run(f.data,f.device,target,f.spawn);assert.equal(result.deleteConfirmed,true);assert.equal(f.commands.filter(row=>row.startsWith('ont delete')).length,1);
 const wrong=offlineFixture({wrongSerial:true});await assert.rejects(cli.run(wrong.data,wrong.device,target,wrong.spawn),/Serial ONU/);assert(!wrong.commands.some(row=>row.startsWith('ont delete')));
 const read=offlineFixture();assert((await cli.run(read.data,read.device,{...target,action:'inspect'},read.spawn)).outputs.at(-1).stdout.includes('Old Client'));
});
test('already absent ONU deletion is confirmed without a destructive command, and inspection reports explicit absence',async()=>{
 const f=offlineFixture({absent:true}),target={slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD'},result=await cli.run(f.data,f.device,target,f.spawn);
 assert(result.deleteConfirmed);assert(result.alreadyAbsent);assert.equal(f.commands.length,4);assert(!f.commands.some(row=>row.startsWith('ont delete')));
 const read=offlineFixture({absent:true});await assert.rejects(cli.run(read.data,read.device,{...target,action:'inspect'},read.spawn),error=>error.code==='ONU_NOT_FOUND');
 assert.equal(cli.onuAbsent('Description : ONT does not exist'),false);assert.equal(cli.onuAbsent('Error: Ranging info get failed.'),false);
});
test('CDATA no ONT available is a confirmed exact-position deletion result, not a failed command',async()=>{
 const f=fixture(),spawn=(...args)=>{const child=f.spawn(...args),write=child.stdout.write.bind(child.stdout);child.stdout.write=chunk=>write(String(chunk).replace('Error: The ONT does not exist.',' Error: There is no ONT available.'));return child;};
 const result=await cli.run(f.data,f.device,{slot:1,pon:4,onuId:21,serialNumber:'HWTCAABBCCDD'},spawn);assert.equal(result.deleteConfirmed,true);assert.equal(result.alreadyAbsent,false);assert(f.commands.includes('ont delete 4 21'));
 assert(cli.onuAbsent(' Error: There is no ONT available.\r\nCDATA(config)# '));assert(!cli.onuAbsent('Description : There is no ONT available.'));assert(!cli.onuAbsent('Error: There is no SNMP service available.'));
 const absent=offlineFixture({absent:true}),absentSpawn=(...args)=>{const child=absent.spawn(...args),write=child.stdout.write.bind(child.stdout);child.stdout.write=chunk=>write(String(chunk).replace('Error: The ONT does not exist.',' Error: There is no ONT available.'));return child;};
 const preflight=await cli.run(absent.data,absent.device,{slot:0,pon:1,onuId:2,serialNumber:'HWTCAABBCCDD'},absentSpawn);assert(preflight.alreadyAbsent);assert(preflight.deleteConfirmed);assert(!absent.commands.some(row=>row.startsWith('ont delete')));
});
