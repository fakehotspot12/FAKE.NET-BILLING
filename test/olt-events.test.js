'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const events=require('../src/olt-events'),registration=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp');
const{fixture,reply,key}=require('./helpers/olt-registration-fixture');
const COMMUNITY='unit-event-secret-123456789',OID='1.3.6.1.4.1.3902.999.0.1';
async function setup(t,options={}){
 const f=fixture(),transports={commands:async({commands})=>({success:true,outputs:commands.map(command=>({command,stdout:reply(command,f.model)}))})};
 await pnp.read(f.data,f.device,f.actor,key,{explicitDevAccess:true,transportOptions:{transports}});pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:''});
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},{explicitDevAccess:true,transportOptions:{transports}});registration.activate(f.data,f.device,f.actor,{token:plan.token,revision:plan.revision,confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 const config={bindAddress:'127.0.0.1',port:1162,sources:[{oltId:f.device.id,host:f.device.host,sourceAddress:'192.0.2.90',community:COMMUNITY}]};let socket,callback,communities=[],time=100000,calls=[];
 options.setupConfig?.(config);
 const snmp={createReceiver(setting,cb){assert.equal(setting.disableAuthorization,false);assert.equal(setting.includeAuthentication,true);callback=cb;socket=setting.dgramModule.createSocket('udp4');socket.on('message',()=>{});socket.emit('listening');return{getAuthorizer:()=>({addCommunity:v=>communities.push(v)}),close:()=>socket.close()};}};
 const datagrams={createSocket(){const stream=new EventEmitter();stream.close=()=>{stream.emit('close');};stream.unref=()=>{};return stream;}};
 const service=events.create({load:async()=>f.data,wake:id=>{calls.push(id);return true;},snmpFactory:snmp,datagrams,readFile:async()=>config,now:()=>time,...options});t.after(()=>service.stop());await service.start();
 return{...f,config,service,calls,communities,advance:ms=>{time+=ms;},socket:()=>socket,deliver:pdu=>callback(null,{pdu,rinfo:{address:'192.0.2.90'}})};
}
const notification=(community=COMMUNITY,oid=OID)=>({type:167,community,varbinds:[{oid:'1.3.6.1.6.3.1.1.4.1.0',type:6,value:oid}]});
test('event configuration binds only an explicit private address, has bounded sources, and requires a private non-default key',()=>{
 assert.equal(events.config({enabled:false}),null);
 const source={oltId:'unit',host:'192.0.2.90',sourceAddress:'192.0.2.90',community:COMMUNITY};
 for(const change of[{bindAddress:'0.0.0.0'},{bindAddress:'198.51.100.1'},{port:0},{sources:[{...source,community:'public'}]},{sources:[source,source]},{fallbackMs:1},{sources:Array(33).fill(source)}])assert.throws(()=>events.config({bindAddress:'127.0.0.1',port:1162,sources:[source],...change}));
 assert.equal(events.config({bindAddress:'172.16.20.4',port:1162,sources:[source]}).fallbackMs,20000);
});
test('authenticated vendor events only wake an existing automatic OLT and never use packet content as native configuration',async t=>{
 const f=await setup(t);f.deliver(notification());assert.deepEqual(f.calls,[f.device.id]);assert(f.service.status(f.device.id).lastEventAt);assert.equal(f.model.registered,false);assert(!JSON.stringify(f.service.status(f.device.id)).includes(COMMUNITY));assert.deepEqual(f.communities,[COMMUNITY]);
});
test('unknown sources and oversized datagrams are dropped before the SNMP parser',async t=>{
 const f=await setup(t),buffer=Buffer.alloc(64);assert(!f.service.admit(buffer,{address:'198.51.100.99'}));assert(!f.service.admit(Buffer.alloc(8193),{address:'192.0.2.90'}));assert(f.service.admit(buffer,{address:'::ffff:192.0.2.90'}));
 for(let i=0;i<9;i++)assert(f.service.admit(buffer,{address:'192.0.2.90'}));assert(!f.service.admit(buffer,{address:'192.0.2.90'}));f.advance(1000);assert(f.service.admit(buffer,{address:'192.0.2.90'}));
});
test('wrong secrets, foreign traps, malformed structures and notifications without an exact trap OID never wake registration',async t=>{
 const f=await setup(t);
 for(const pdu of[notification('wrong-secret'),notification(COMMUNITY,'1.3.6.1.4.1.9999.0.1'),{...notification(),type:163},{...notification(),varbinds:[]},{...notification(),varbinds:Array(33).fill(notification().varbinds[0])},{...notification(),varbinds:[...notification().varbinds,...notification().varbinds]}])f.deliver(pdu);
 assert.equal(f.calls.length,0);
});
test('event storms coalesce, wake at most six times per minute, and cannot bypass revoked scope or a changed OLT host',async t=>{
 const f=await setup(t);for(let i=0;i<100;i++)f.deliver(notification());assert.equal(f.calls.length,1);
 for(let i=0;i<20;i++){f.advance(2100);f.deliver(notification());}assert.equal(f.calls.length,6);
 f.actor.active=false;await f.service.refresh();f.deliver(notification());assert.equal(f.calls.length,6);assert.equal(f.service.status().sources,0);
 f.actor.active=true;f.device.host='192.0.2.91';await f.service.refresh();assert.equal(f.service.status().sources,0);
});
test('unchanged configuration refreshes do not reset datagram or per-minute event limits',async t=>{
 const f=await setup(t),buffer=Buffer.alloc(64);
 for(let i=0;i<10;i++)assert(f.service.admit(buffer,{address:'192.0.2.90'}));
 await f.service.refresh();assert(!f.service.admit(buffer,{address:'192.0.2.90'}));
 for(let i=0;i<6;i++){f.deliver(notification());f.advance(2100);}assert.equal(f.calls.length,6);
 f.advance(18000);await f.service.refresh();f.deliver(notification());assert.equal(f.calls.length,6);
 f.advance(31000);f.deliver(notification());assert.equal(f.calls.length,7);
});
test('missing or unreadable private configuration does not bind a port and leaves polling available',async t=>{
 let creates=0;for(const code of['ENOENT','EACCES']){const service=events.create({load:async()=>{throw Error('No data read expected');},wake:()=>{throw Error('No wake expected');},readFile:async()=>{throw Object.assign(Error('private'),{code});},snmpFactory:{createReceiver(){creates++;}}});t.after(()=>service.stop());await service.start();assert.equal(service.status().listening,false);}assert.equal(creates,0);
});
test('the pinned SNMP library authenticates real loopback traps and malformed datagrams cannot crash the listener',{timeout:5000},async t=>{
 const snmp=require('net-snmp'),dgram=require('node:dgram'),{once}=require('node:events');let wire;
 const datagrams={createSocket(type){wire=dgram.createSocket(type);const bind=wire.bind.bind(wire);wire.bind=(port,address)=>bind(0,address);return wire;}};
 const f=await setup(t,{snmpFactory:undefined,datagrams,setupConfig:config=>{config.sources[0].sourceAddress='127.0.0.1';}});
 if(!f.service.status().listening)await once(wire,'listening');const port=wire.address().port;
 const session=snmp.createSession('127.0.0.1',COMMUNITY,{version:snmp.Version2c,trapPort:port});t.after(()=>session.close());
 await new Promise((resolve,reject)=>session.trap(OID,[],error=>error?reject(error):resolve()));
 for(let i=0;i<50&&!f.calls.length;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(f.calls,[f.device.id]);
 const client=dgram.createSocket('udp4');t.after(()=>client.close());await new Promise(resolve=>client.send(Buffer.alloc(64),port,'127.0.0.1',resolve));await new Promise(resolve=>setTimeout(resolve,20));assert(f.service.status().rejected>=1);assert(f.service.status().listening);
});
