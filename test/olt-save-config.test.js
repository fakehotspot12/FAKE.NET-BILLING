'use strict';
const test=require('node:test'),assert=require('node:assert/strict');process.env.REDIS_CACHE='0';const olt=require('../src/olt-monitor'),store=require('../src/store'),cli=require('../src/olt-cli');
function fixture(){const data=store.createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.180',community:'private',cliEnabled:true,cliUsername:'unit',cliPassword:'Secret'});return{data,device,payload:{confirmId:device.id,confirmName:device.name,confirmSave:true,revision:device.updatedAt}};}
test.beforeEach(()=>process.env.MIGRATION_MODE='0');
test('Save Config requires exact identity, explicit consent and fresh revision before a command',async()=>{
 const f=fixture();let writes=0;const transport=async()=>{writes++;return{saveConfirmed:true};};for(const payload of [{...f.payload,confirmSave:false},{...f.payload,confirmName:'Different'},{...f.payload,confirmId:'wrong'},{...f.payload,revision:'old'}])await assert.rejects(olt.saveConfig(f.data,f.device,payload,transport));assert.equal(writes,0);
});
test('confirmed save changes no member, finance or gateway data and rapid repeated saves are blocked',async()=>{
 const f=fixture(),before=structuredClone(f.data);let writes=0;const transport=async()=>{writes++;return{saveConfirmed:true};};assert((await olt.saveConfig(f.data,f.device,f.payload,transport)).confirmed);await assert.rejects(olt.saveConfig(f.data,f.device,f.payload,transport),error=>error.status===429);assert.equal(writes,1);assert.deepEqual(f.data,before);
});
test('an unconfirmed or lost response is not presented as success and never retried automatically',async()=>{
 for(const failure of [false,true]){const f=fixture();let writes=0;const result=await olt.saveConfig(f.data,f.device,f.payload,async()=>{writes++;if(failure)throw Error('Secret CLI timeout');return{saveConfirmed:false};});assert(!result.confirmed);assert(!result.message.includes('Secret'));assert.equal(writes,1);await assert.rejects(olt.saveConfig(f.data,f.device,f.payload,async()=>assert.fail('never retry')));}
});
test('Save Config is blocked in isolated dev and when management is disabled',async()=>{
 const f=fixture();await assert.rejects(olt.saveConfig(f.data,{...f.device,cliEnabled:false},f.payload));process.env.MIGRATION_MODE='1';await assert.rejects(olt.saveConfig(f.data,f.device,f.payload),/Mode dev terisolasi/);
});
test('native success acknowledgement excludes failure, negative and prompt-only replies',()=>{
 for(const value of ['Configuration saved successfully.','Save configuration success!','Saving configuration completed.'])assert(cli.saveConfirmed(value));
 for(const value of ['save','Are you sure to save? (y/n)','Configuration save failed.','Configuration not saved successfully.','Error: save unsuccessful',''])assert(!cli.saveConfirmed(value));
});
