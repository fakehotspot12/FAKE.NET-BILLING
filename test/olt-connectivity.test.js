'use strict';
const test=require('node:test'),assert=require('node:assert/strict');process.env.REDIS_CACHE='0';
const olt=require('../src/olt-monitor'),store=require('../src/store'),secrets=require('../src/secure-secrets');
let count=0;function fixture(){const data=store.createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.154',port:161,community:'SecretCommunity',cliEnabled:true,cliUsername:'unit',cliPassword:'PrivateCli'});device.id='connectivity-'+count++;return{data,device};}
test.beforeEach(()=>{process.env.MIGRATION_MODE='0';});
test('SNMP test reads only two system OIDs with stored credentials and preserves data',async()=>{
 const f=fixture(),before=structuredClone(f.data);let calls=0;const result=await olt.testConnection(f.data,f.device,'snmp',{exec:async(command,args,options)=>{calls++;assert.equal(command,'snmpget');assert(args.includes('SecretCommunity'));assert(args.includes('-v2c'));assert.equal(options.timeout,4000);assert.deepEqual(args.slice(-2),['1.3.6.1.2.1.1.2.0','1.3.6.1.2.1.1.3.0']);return{stdout:'.1.3.6.1.2.1.1.2.0 = OID: .1.3.6.1.4.1.17409\n.1.3.6.1.2.1.1.3.0 = Timeticks: (1200)'};}});assert(result.ok);assert.equal(calls,1);assert.deepEqual(f.data,before);assert(!JSON.stringify(result).includes('SecretCommunity'));
});
test('failed SNMP/Telnet diagnostics do not leak secrets or claim zero ONUs',async()=>{
 for(const kind of ['snmp','telnet']){const f=fixture(),fail=async()=>{throw Error('SecretCommunity PrivateCli private host');},result=await olt.testConnection(f.data,f.device,kind,{exec:fail,telnet:fail});assert(!result.ok);assert(!JSON.stringify(result).includes('PrivateCli'));assert(!JSON.stringify(result).includes('SecretCommunity'));assert(!('summary'in result));}
});
test('SNMP noSuchObject is not a successful identity read',async()=>{const f=fixture();assert(!(await olt.testConnection(f.data,f.device,'snmp',{exec:async()=>({stdout:'.1.3.6.1.2.1.1.2.0 = No Such Object available on this agent at this OID'})})).ok);});
test('Telnet test verifies credentials through read-only transport, without touching snapshots',async()=>{
 const f=fixture(),before=structuredClone(f.data);const result=await olt.testConnection(f.data,f.device,'telnet',{telnet:async(data,device)=>{assert.equal(device.cliUsername,'unit');assert.equal(secrets.decryptSecret(data,device.cliPasswordEnc),'PrivateCli');return{outputs:[]};}});assert(result.ok);assert.deepEqual(f.data,before);assert.equal(await olt.snapshotFor(f.device),null);
});
test('diagnostics validate kind, credentials, dev isolation and repeated request cooldown',async()=>{
 const f=fixture();await assert.rejects(olt.testConnection(f.data,f.device,'other'));await assert.rejects(olt.testConnection(f.data,{...f.device,cliEnabled:false},'telnet'));
 await olt.testConnection(f.data,f.device,'snmp',{exec:async()=>({stdout:'.1.3.6.1.2.1.1.2.0 = OID: .1.3.6.1.4.1.17409'})});await assert.rejects(olt.testConnection(f.data,f.device,'snmp'),error=>error.status===429);
 process.env.MIGRATION_MODE='1';await assert.rejects(olt.testConnection(f.data,f.device,'telnet'),/Mode dev terisolasi/);
});
test('manual all-OLT refresh queues only enabled targets and deduplicates without performing SNMP inline',async()=>{
 const f=fixture(),g=fixture(),off=fixture();off.device.enabled=false;const data={...f.data,oltDevices:[f.device,g.device,off.device]},first=olt.requestRefreshAll(data,data.oltDevices);assert.equal(first.queued,2);assert.equal(first.skipped,1);assert(olt.publicDevice(f.device).refreshPending);assert.equal(olt.requestRefreshAll(data,data.oltDevices).queued,0);assert.equal(await olt.snapshotFor(f.device),null);
 // Removing/changing targets before the existing worker runs discards obsolete queued reads.
 data.oltDevices=[];assert((await olt.pollNext(data)).skipped);assert(!olt.publicDevice(f.device).refreshPending);
 process.env.MIGRATION_MODE='1';assert.throws(()=>olt.requestRefreshAll(data,[]),/Mode dev terisolasi/);
});
