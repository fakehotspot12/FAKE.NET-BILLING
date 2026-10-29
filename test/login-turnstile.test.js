'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ACTION,configuration,createTurnstileVerifier,verificationPolicy}=require('../src/login-turnstile');
const {__test:server}=require('../src/server');
const env={LOGIN_TURNSTILE_ENABLED:'1',LOGIN_TURNSTILE_SITE_KEY:'test-site-key',LOGIN_TURNSTILE_SECRET_KEY:'test-secret-key',LOGIN_TURNSTILE_DOMAINS:'example.test'};
const time=Date.parse('2026-10-29T08:00:00Z');
const valid={success:true,hostname:'billing.example.test',action:ACTION,challenge_ts:new Date(time).toISOString()};
const context={hostname:'billing.example.test',ipAddress:'203.0.113.25',env};
test('Turnstile applies only to configured hostnames and proper subdomains, never IP local or lookalikes',()=>{
 for(const host of ['example.test','billing.example.test','billing.dev.example.test','BILLING.EXAMPLE.TEST.']){
  const policy=verificationPolicy(host,true,env);assert.equal(policy.provider,'turnstile');assert.equal(policy.siteKey,'test-site-key');assert(!JSON.stringify(policy).includes('test-secret-key'));
 }
 for(const host of ['notexample.test','billing.example.test.attacker.test','localhost','127.0.0.1','192.168.4.253','172.16.125.253','10.1.1.1','::1',''])assert.equal(verificationPolicy(host,true,env).provider,'code');
 assert.equal(verificationPolicy('billing.example.test',false,env).provider,'disabled');
 assert.equal(verificationPolicy('billing.example.test',true,{}).provider,'code');
 assert.equal(verificationPolicy('billing.example.test',true,{...env,LOGIN_TURNSTILE_ENABLED:'0'}).provider,'code');
 assert.equal(verificationPolicy('billing.example.test',true,{...env,LOGIN_TURNSTILE_ENABLED:''}).provider,'code');
});
test('matching domains fail closed when keys are incomplete rather than changing to local code',async()=>{
 const incomplete={...env,LOGIN_TURNSTILE_SECRET_KEY:''};
 assert.equal(verificationPolicy(context.hostname,true,incomplete).provider,'turnstile');
 assert.equal(verificationPolicy(context.hostname,true,incomplete).configured,false);
 const verify=createTurnstileVerifier({fetchImpl:()=>{throw Error('Must not call API');},now:()=>time});
 assert.equal((await verify('token',{...context,env:incomplete})).status,503);
});
test('domain policy trusts the existing proxy boundary, not a visitor supplied forwarded host',()=>{
 const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 try{
  assert.equal(server.loginVerificationPolicy({headers:{host:'billing.example.test'},socket:{remoteAddress:'203.0.113.5'}},{}).provider,'turnstile');
  assert.equal(server.loginVerificationPolicy({headers:{host:'billing.example.test','x-forwarded-host':'127.0.0.1'},socket:{remoteAddress:'203.0.113.5'}},{}).provider,'turnstile');
  assert.equal(server.loginVerificationPolicy({headers:{host:'127.0.0.1:8891','x-forwarded-host':'billing.example.test','cf-ray':'test','cf-connecting-ip':'203.0.113.5'},socket:{remoteAddress:'127.0.0.1'}},{}).provider,'turnstile');
  assert.equal(server.loginVerificationPolicy({headers:{host:'172.16.125.253:8891'},socket:{remoteAddress:'172.16.125.10'}},{}).provider,'code');
 }finally{for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('valid tokens require remote verification and matching hostname, action and timestamp',async()=>{
 let calls=0;const verify=createTurnstileVerifier({now:()=>time,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);assert.equal(body.secret,'test-secret-key');assert.equal(body.response,'valid-token');assert.equal(body.remoteip,'203.0.113.25');assert(options.signal);return Response.json(valid);
 }});
 assert.deepEqual(await verify('valid-token',context),{ok:true});assert.equal(calls,1);
 assert.equal((await verify('valid-token',context)).ok,false);assert.equal(calls,1,'Local replay must not call Siteverify twice');
});
test('invalid, expired, forged, sibling-host and wrong-action tokens never authenticate',async()=>{
 for(const result of [{...valid,success:false},{...valid,success:'true'},{...valid,hostname:'other.example.test'},{...valid,action:'other_form'},{...valid,challenge_ts:'invalid'},{...valid,challenge_ts:new Date(time-300001).toISOString()},{...valid,challenge_ts:new Date(time+60000).toISOString()}]){
  const verify=createTurnstileVerifier({now:()=>time,fetchImpl:async()=>Response.json(result)});const response=await verify('test-token',context);assert.equal(response.ok,false);assert.equal(response.status,400);
 }
});
test('missing and malformed tokens are rejected without requesting Cloudflare',async()=>{
 let calls=0;const verify=createTurnstileVerifier({now:()=>time,fetchImpl:()=>{calls++;throw Error('Not expected');}});
 for(const token of [undefined,null,'','  ',{},['token'],'x'.repeat(2049)])assert.equal((await verify(token,context)).status,400);
 assert.equal(calls,0);
});
test('Cloudflare errors timeouts and non-JSON responses fail closed with a bounded request',async()=>{
 for(const fetchImpl of [async()=>{throw Error('secret must not leak');},async()=>new Response('',{status:503}),async()=>new Response('not json',{status:200})]){
  const verify=createTurnstileVerifier({now:()=>time,fetchImpl});const result=await verify('token',context);assert.equal(result.ok,false);assert.equal(result.status,503);assert(!JSON.stringify(result).includes('test-secret-key'));
 }
});
test('concurrent submissions cannot validate the same token twice',async()=>{
 let release,calls=0;const pending=new Promise(resolve=>{release=resolve;});
 const verify=createTurnstileVerifier({now:()=>time,fetchImpl:async()=>{calls++;await pending;return Response.json(valid);}});
 const first=verify('same-token',context);assert.equal((await verify('same-token',context)).ok,false);release();assert.equal((await first).ok,true);assert.equal(calls,1);
});
test('replay memory is bounded and is pruned without timers',async()=>{
 let now=time;const verify=createTurnstileVerifier({now:()=>now,maxTokens:1,fetchImpl:async()=>Response.json({...valid,challenge_ts:new Date(now).toISOString()})});
 assert.equal((await verify('first',context)).ok,true);assert.equal((await verify('second',context)).status,503);now+=300001;assert.equal((await verify('second',context)).ok,true);
});
test('invalid remote IP headers are not forwarded to Siteverify',async()=>{
 const verify=createTurnstileVerifier({now:()=>time,fetchImpl:async(_,options)=>{assert(!Object.hasOwn(JSON.parse(options.body),'remoteip'));return Response.json(valid);}});
 assert.equal((await verify('token',{...context,ipAddress:'forged, headers'})).ok,true);
});
test('different domains use their own widget and secret, including more specific hostname overrides',async()=>{
 const multi={...env,LOGIN_TURNSTILE_ADDITIONAL_SITES:JSON.stringify([{domains:['other.test'],siteKey:'other-site',secretKey:'other-secret'},{domains:['billing.example.test'],siteKey:'specific-site',secretKey:'specific-secret'}])};
 assert.equal(verificationPolicy('billing.other.test',true,multi).siteKey,'other-site');
 assert.equal(verificationPolicy('billing.example.test',true,multi).siteKey,'specific-site');
 assert.equal(verificationPolicy('dev.example.test',true,multi).siteKey,'test-site-key');
 const verify=createTurnstileVerifier({now:()=>time,fetchImpl:async(_,options)=>{assert.equal(JSON.parse(options.body).secret,'other-secret');return Response.json({...valid,hostname:'billing.other.test'});}});
 assert.equal((await verify('other-token',{...context,hostname:'billing.other.test',env:multi})).ok,true);
 assert(!JSON.stringify(verificationPolicy('billing.other.test',true,multi)).includes('other-secret'));
});
test('installer updater service and private-file lifecycle include every new component without embedded keys',()=>{
 const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
 for(const file of ['install.sh','deploy/bin/fakenet-billing-update']){
  assert(read(file).includes('src/login-turnstile.js'));assert(read(file).includes('public/login-verification.js'));assert(read(file).includes('/etc/fakenet-billing-turnstile.env'));
 }
 assert(read('deploy/systemd/fakenet-billing.service').includes('EnvironmentFile=-/etc/fakenet-billing-turnstile.env'));
 assert(read('deploy/fakenet-billing-turnstile.env.example').includes('LOGIN_TURNSTILE_ENABLED=0'));
 const client=read('public/login-verification.js');assert(!client.includes('SECRET_KEY'));assert(!client.includes('siteverify'));assert(!client.includes('setInterval'));
 assert(client.includes("refreshButton.hidden = turnstile || provider === 'disabled'"));assert(client.includes("'refresh-expired': 'auto'"));assert(client.includes('resizeObserver?.disconnect()'));
 const source=read('src/server.js'),login=source.slice(source.indexOf("pathname === '/api/auth/login'"),source.indexOf("pathname === '/api/auth/me'"));
 assert(login.indexOf('checkLoginRateLimit')<login.indexOf('verifyTurnstileLogin'));
 assert(login.indexOf('verifyTurnstileLogin')<login.indexOf('auth.verifyPassword'));
 assert(login.includes('verifyLoginVerificationChallenge(payload.verificationId, payload.verificationCode)'));
 assert(configuration({}).secretKey==='');
});
