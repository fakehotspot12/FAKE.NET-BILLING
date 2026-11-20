'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const vendors=require('../src/olt-vendors'),secrets=require('../src/secure-secrets');
test.beforeEach(()=>{process.env.MIGRATION_MODE='0';});
function fixture(){const data={settings:{}},device={id:'unit-zte',vendor:'zte',host:'192.0.2.77',cliEnabled:true,cliProtocol:'telnet',cliPort:23,cliUsername:'unit'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit-password');return{data,device};}
test('ZTE history counts including singular failure are not login rejection; real denials remain rejected',async()=>{
 const[,,transport]=await vendors.loadLibrary();
 for(const line of['0 authentication failures happened since that time.','1 authentication failure happened since that time.','20 login failures','Authentication failures: 0','Login failure = 1'])assert.equal(transport.loginDenied(line+'\n'),false,line);
 for(const line of['Login incorrect','Authentication failed!','% Error: authentication failure','Login fail','Bad password','Invalid password','Access denied','Account is locked'])assert.equal(transport.loginDenied(line+'\nUsername:'),true,line);
 assert.equal(transport.loginDenied('Last login time: today, 0 authentication fail'),false);
 assert.equal(transport.loginDenied('0 authentication failures\nLogin incorrect\n'),true);
});
test('split C320 history banner reaches read-only show version without sending configuration commands',async()=>{
 const {data,device}=fixture(),before=structuredClone(data),[,context,transport]=await vendors.loadLibrary(),writes=[];let disposed=0;
 const result=await context.withContext(data,device,()=>transport.shellSession({olt:vendors.legacyDevice(device),password:'unit-password',commands:['enable','show version'],timeoutMs:1000},({ready})=>{
  const stream=new EventEmitter();stream.write=value=>{writes.push(value.trim());const response=value.trim()==='unit'?'Password:':value.trim()==='unit-password'?'\nZXAN>':value.trim()==='enable'?'\nZXAN#':'\nC320 Version V2.1.0\nZXAN#';queueMicrotask(()=>stream.emit('data',response));};ready(stream,()=>disposed++);
  queueMicrotask(()=>{stream.emit('data','Welcome to ZXAN product C320\nLast login time: today, 0 authentication fail');stream.emit('data','ures\nhappened since that time.\nUsername:');});
 }));assert.equal(result.success,true);assert.deepEqual(writes,['unit','unit-password','enable','show version']);assert(result.outputs.at(-1).stdout.includes('V2.1.0'));assert.equal(disposed,1);assert.deepEqual(data,before);assert.equal(vendors.capabilities(device).reboot,false);
});
test('actual failed login never proceeds to a device command even after an innocent history counter',async()=>{
 const{data,device}=fixture(),[,context,transport]=await vendors.loadLibrary(),writes=[];
 const result=await context.withContext(data,device,()=>transport.shellSession({olt:vendors.legacyDevice(device),password:'unit-password',commands:['enable','show version'],timeoutMs:1000},({ready})=>{
  const stream=new EventEmitter();stream.write=value=>{writes.push(value.trim());queueMicrotask(()=>stream.emit('data',value.trim()==='unit'?'Password:':'\nLogin incorrect\nUsername:'));};ready(stream,()=>{});queueMicrotask(()=>stream.emit('data','0 authentication failures\nUsername:'));
 }));assert.equal(result.success,false);assert.equal(result.error,'Login CLI vendor ditolak');assert.deepEqual(writes,['unit','unit-password']);
});
test('ZTE diagnostics use the complete version-running command without granting writes or probing generic show version',async()=>{
 const {data,device}=fixture(),before=structuredClone(data),seen=[];
 const result=await vendors.testConnection(data,device,{transports:{commands:async input=>{seen.push(input.commands);return{success:true,outputs:[]};}}});
 assert.equal(result.success,true);assert.deepEqual(seen,[['enable','show version-running']]);assert.deepEqual(data,before);assert.equal(vendors.canWrite(device),false);
});
test('a broken CLI writer closes safely instead of throwing an uncaught data-event exception',async()=>{
 const {data,device}=fixture(),[,context,transport]=await vendors.loadLibrary();let disposed=0;
 const result=await context.withContext(data,device,()=>transport.shellSession({olt:vendors.legacyDevice(device),password:'unit',commands:['enable','show version-running'],timeoutMs:1000},({ready})=>{
  const stream=new EventEmitter();stream.write=()=>{throw Error('broken pipe');};ready(stream,()=>disposed++,true);queueMicrotask(()=>stream.emit('data','OLT#'));
 }));assert.equal(result.success,false);assert.match(result.error,/terputus saat mengirim/);assert.equal(disposed,1);
});
test('a chunked empty Password field in ONU detail is data, never a login prompt or credential request',async()=>{
 const {data,device}=fixture(),[,context,transport]=await vendors.loadLibrary(),writes=[];
 const result=await context.withContext(data,device,()=>transport.shellSession({olt:vendors.legacyDevice(device),password:'unit-secret',commands:['enable','show gpon onu detail-info gpon-onu_1/1/13:6'],timeoutMs:1000},({ready})=>{
  const stream=new EventEmitter();stream.write=value=>{writes.push(value.trim());if(value.trim()==='enable')queueMicrotask(()=>stream.emit('data','ZXAN#'));else queueMicrotask(()=>{stream.emit('data','Serial number: HWTCAABBCCDD\n  Password:');stream.emit('data','                \nName: Sample\nZXAN#');});};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','ZXAN#'));
 }));assert(result.success,result.error);assert.equal(result.outputs.length,2);assert(!writes.includes('unit-secret'));
});
