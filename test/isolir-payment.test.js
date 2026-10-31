'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.SUBWEB_KIND='isolir';
const core=require('../src/server').__test,subweb=require('../src/subweb-server').__test;
const time=Date.parse('2026-10-30T03:00:00Z');
const fixture=()=>({settings:{security:{secretKey:Buffer.alloc(32,7).toString('base64')}},
 customers:[{id:'cus-one',username:'one@example.test',name:'Synthetic One',status:'isolir'}],
 radiusUsers:[{id:'usr-one',customerId:'cus-one',username:'one@example.test',status:'isolated'}],
 invoices:[{id:'inv-one',customerId:'cus-one',username:'one@example.test',invoiceNo:'100001',status:'pending',dueDate:'2026-10-20',period:'2026-10',amount:150000}],payments:[]});
test('isolir handoff is signed, short lived and contains no customer name, IP or phone',()=>{
 const data=fixture(),token=core.createIsolirContext(data,data.invoices[0],time);
 assert.equal(core.invoiceForIsolirContext(data,token,time),data.invoices[0]);
 const payload=Buffer.from(token.split('.')[0],'base64url').toString();
 assert(!payload.includes('Synthetic One'));assert(!payload.includes('example.test'));assert(!payload.includes('172.'));
 assert.equal(core.invoiceForIsolirContext(data,token,time+300000),null);
 assert.equal(core.invoiceForIsolirContext(data,token,time-1000),null);
});
test('forged, cross-installation, removed, cancelled and reassigned contexts fail closed',()=>{
 const data=fixture(),token=core.createIsolirContext(data,data.invoices[0],time),[body,sig]=token.split('.');
 for(const bad of ['',{},'x'.repeat(2049),token+'.extra',body+'.'+(sig[0]==='A'?'B':'A')+sig.slice(1)]){
  assert.equal(core.invoiceForIsolirContext(data,bad,time),null);
 }
 const other=fixture();other.settings.security.secretKey=Buffer.alloc(32,8).toString('base64');assert.equal(core.invoiceForIsolirContext(other,token,time),null);
 data.invoices[0].status='cancelled';assert.equal(core.invoiceForIsolirContext(data,token,time),null);
 data.invoices[0].status='pending';data.invoices=[];assert.equal(core.invoiceForIsolirContext(data,token,time),null);
 const reassigned=fixture();reassigned.customers.push({id:'cus-two',username:'two@example.test'});reassigned.invoices[0].customerId='cus-two';assert.equal(core.invoiceForIsolirContext(reassigned,token,time),null);
});
test('secure URL uses configured HTTPS only and does not expose a plain invoice reference',()=>{
 const data=fixture();data.settings.isolirGuide={isolirUrl:'https://isolir.example.test/isolir'};
 const old=process.env.ISOLIR_PUBLIC_URL,alias=process.env.PUBLIC_ISOLIR_URL;delete process.env.ISOLIR_PUBLIC_URL;delete process.env.PUBLIC_ISOLIR_URL;
 try{
  const url=new URL(core.secureIsolirPageUrl(data,data.invoices[0],time));assert.equal(url.host,'isolir.example.test');assert(url.searchParams.get('context'));assert.equal(url.searchParams.has('id'),false);
  data.settings.isolirGuide.isolirUrl='http://192.0.2.4:8892/isolir';assert.equal(core.secureIsolirPageUrl(data,data.invoices[0],time),'');
  data.settings.isolirGuide.isolirUrl='https://user:password@isolir.example.test';assert.equal(core.secureIsolirPageUrl(data,data.invoices[0],time),'');
 }finally{if(old===undefined)delete process.env.ISOLIR_PUBLIC_URL;else process.env.ISOLIR_PUBLIC_URL=old;if(alias===undefined)delete process.env.PUBLIC_ISOLIR_URL;else process.env.PUBLIC_ISOLIR_URL=alias;}
});
test('IP lookup prefers exact current username and rejects ambiguous shared addresses',()=>{
 const data=fixture();data.radiusUsers.unshift({id:'stale',username:'stale@example.test',staticIp:'172.30.0.10'});
 const current={username:'one@example.test',framedIpAddress:'172.30.0.10'};
 assert.equal(core.radiusUserForClientIp(data,'172.30.0.10',[current]).radiusUser.id,'usr-one');
 assert.deepEqual(core.radiusUserForClientIp(data,'172.30.0.10',[current,{username:'another',framedIpAddress:'172.30.0.10'}]).radiusUser,{});
 data.radiusUsers.push({id:'other-static',staticIp:'172.30.0.10'});assert.deepEqual(core.radiusUserForClientIp(data,'172.30.0.10',[]).radiusUser,{});
 assert.deepEqual(core.radiusUserForClientIp(data,'not-an-ip',[current]).radiusUser,{});
});
test('public domain config does not append internal ports while local access keeps port 8892',()=>{
 const request=(host,peer='127.0.0.1')=>({headers:{host,'x-forwarded-proto':'https'},socket:{remoteAddress:peer}});
 assert.equal(subweb.subwebUrls(request('isolir.example.test')).urls,undefined);
 assert.equal(subweb.subwebUrls(request('isolir.example.test')).payment,'https://isolir.example.test/payment-invoice.html');
 assert.equal(subweb.subwebUrls(request('172.20.0.5:8892','172.20.0.10')).payment,'http://172.20.0.5:8892/payment-invoice.html');
});
test('direct customers cannot spoof proxy identity, but explicitly trusted Cloudflare peers keep the real address',()=>{
 const headers={host:'isolir.example.test','x-forwarded-proto':'https','x-forwarded-host':'attacker.example','x-forwarded-for':'172.30.0.10','cf-ray':'fake','cf-connecting-ip':'172.30.0.11'};
 const direct={headers,socket:{remoteAddress:'172.30.0.12'}};
 assert.equal(subweb.clientAddress(direct),'172.30.0.12');assert.equal(subweb.requestOrigin(direct),'http://isolir.example.test');
 const old=process.env.SUBWEB_TRUSTED_PROXY_IPS;process.env.SUBWEB_TRUSTED_PROXY_IPS='172.20.0.200';
 try{assert.equal(subweb.clientAddress({headers,socket:{remoteAddress:'172.20.0.200'}}),'172.30.0.11');}
 finally{if(old===undefined)delete process.env.SUBWEB_TRUSTED_PROXY_IPS;else process.env.SUBWEB_TRUSTED_PROXY_IPS=old;}
});
test('isolir UI prioritizes the billing payment link and retains manual/terminated payment policy',()=>{
 const data=fixture();Object.assign(data.settings,{paymentGateway:{enabled:true,publicBaseUrl:'https://billing.example.test',monthlyAdminFee:5000}});
 let invoice=core.publicPaymentGatewayInvoicePayload(data,data.invoices[0]);assert.equal(invoice.canPay,true);
 data.radiusUsers[0].isolationSource='manual';invoice=core.publicPaymentGatewayInvoicePayload(data,data.invoices[0]);assert.equal(invoice.canPay,false);
 data.customers[0].status='terminate';data.radiusUsers[0].status='terminated';invoice=core.publicPaymentGatewayInvoicePayload(data,data.invoices[0]);assert.equal(invoice.canPay,true);assert.equal(invoice.requiresAdminActivation,true);
 const js=fs.readFileSync(path.join(__dirname,'../public/isolir.js'),'utf8');assert(js.includes('invoice.paymentGatewayLink || paymentUrl'));assert(js.includes("params.get('secure') === '1'"));assert(js.includes('contextToken'));
});
test('router HTTPS guide bootstraps via local billing IP and does not expose public proxy access',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=app.indexOf('function routerOsQuoted('),end=app.indexOf('function openRadiusIsolirGuideModal(',start);
 const script=vm.runInNewContext(app.slice(start,end)+"\nbuildIsolirRouterOsScript({billingServerIp:'192.0.2.5',sourceSubnet:'172.30.0.0/16',isolirUrl:'https://isolir.example.test/isolir',paymentUrl:'https://billing.example.test/payment-invoice.html',isolirProtocol:'https'})",{hostFromUrl:value=>new URL(value).hostname,isolirUrlProtocol:()=> 'https'});
 assert(script.includes('action-data="192.0.2.5:8892/isolir?secure=1"'));assert(script.includes('dst-host=192.0.2.5 action=allow'));assert(script.includes('block webproxy public'));
 assert(script.includes('address=billing.example.test'));
});
test('installer updater and all web units preserve the private isolir config lifecycle',()=>{
 const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),file='/etc/fakenet-billing-isolir-context.env';
 for(const name of ['fakenet-billing','fakenet-billing-isolir','fakenet-billing-voucher','fakenet-billing-wifiku'])assert(read('deploy/systemd/'+name+'.service').includes('EnvironmentFile=-'+file));
 const installer=read('install.sh'),updater=read('deploy/bin/fakenet-billing-update');assert(installer.includes(file));assert(updater.includes('ISOLIR_CONTEXT_ENV_FILE="'+file+'"'));assert(updater.includes('safe_copy_if_exists "$ISOLIR_CONTEXT_ENV_FILE" "$tmp_backup_dir/etc"'));
 const example=read('deploy/fakenet-billing-isolir-context.env.example');assert(!example.split('\n').some(line=>/^(ISOLIR_PUBLIC_URL|PAYMENT_PUBLIC_URL|SUBWEB_TRUSTED_PROXY_IPS)=/.test(line)));assert(!example.includes('fakehotspot.net'));assert(!example.includes('starnettenun.net'));
});
