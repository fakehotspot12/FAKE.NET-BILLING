'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/olt.js'),'utf8');
function fixture(api=async()=>{throw Error('Connection unavailable');}){
 const notice={textContent:'',hidden:true},button={dataset:{oltAction:'reload'},disabled:false,isConnected:true},elements={oltRoot:{},oltNotice:notice},context={mode:'olt',isCurrent:()=>true,api,can:()=>true,escapeHtml:value=>String(value??''),user:{id:'admin',role:'admin'},app:{}},sandbox={window:{},document:{getElementById:id=>elements[id]},setTimeout,clearTimeout,URLSearchParams,Intl,Date};
 vm.runInNewContext(source.replace('window.FakenetOltUI={render};','window.FakenetOltUI={render,onClick,glyph,button,setup:ctx=>{context=ctx;payload={devices:[{id:"o1"}],tickets:[{id:"t1",status:"new"}]};latestDetails={onus:[{id:"t1",oltId:"o1",serialNumber:"HWTCAABBCCDD"}]};},switchContext:ctx=>{context=ctx;}};'),sandbox);
 const ui=sandbox.window.FakenetOltUI;ui.setup(context);const event={target:{closest:selector=>selector==='[data-olt-action]'?button:null}};return {ui,context,button,event,notice,elements};
}
test('OLT and ticket action icons distinguish refresh, navigation, details and linking',()=>{
 const f=fixture();assert(f.ui.glyph('refresh').includes('/olt-refresh.svg'));assert(f.ui.glyph('back').includes('/olt-back.svg'));assert(f.ui.glyph('link').includes('/olt-link.svg'));assert(f.ui.glyph('eye').includes('--icon-eye'));
 assert.doesNotMatch(source,/Segarkan tampilan dari cache/);assert.match(source,/button\('reload','','Segarkan tiket','refresh'\)/);assert.match(source,/button\('refresh-all','','Perbarui data OLT','refresh'\)/);assert.match(source,/button\('refresh',row.id,'Baca ulang OLT','refresh'\)/);assert.match(source,/button\('summary','','Kembali ke Ringkasan','back'\)/);assert.doesNotMatch(source,/button\([^\n]*'rollback'\)/);
 for(const file of ['olt-refresh.svg','olt-back.svg','olt-link.svg'])assert.match(fs.readFileSync(path.join(root,'public',file),'utf8'),/<svg/);
});
test('failed refresh is caught, shown and leaves the button usable',async()=>{
 const f=fixture();await f.ui.onClick(f.event);assert.equal(f.notice.textContent,'Connection unavailable');assert.equal(f.notice.hidden,false);assert.equal(f.button.disabled,false);
});
test('disabled and in-flight action buttons do not issue duplicate requests',async()=>{
 let calls=0,finish;const f=fixture(()=>{calls++;return new Promise((resolve,reject)=>{finish=reject;});});f.button.disabled=true;await f.ui.onClick(f.event);assert.equal(calls,0);f.button.disabled=false;const pending=f.ui.onClick(f.event);assert.equal(f.button.disabled,true);await f.ui.onClick(f.event);assert.equal(calls,1);finish(Error('Temporary failure'));await pending;assert.equal(f.button.disabled,false);
});
test('refresh errors from a departed page do not overwrite the new page',async()=>{
 let reject;const f=fixture(()=>new Promise((resolve,fail)=>{reject=fail;}));const pending=f.ui.onClick(f.event);f.ui.switchContext({...f.context});reject(Error('Old page failed'));await pending;assert.equal(f.notice.textContent,'');assert.equal(f.button.disabled,false);
});
test('async WhatsApp preview and linking failures are handled without opening stale modals',async()=>{
 for(const action of ['message-ticket','link','edit']){
  const f=fixture();f.button.dataset.oltAction=action;f.button.dataset.id=action==='edit'?'o1':'t1';f.button.dataset.olt='o1';await f.ui.onClick(f.event);assert.equal(f.notice.textContent,'Connection unavailable');assert.equal(f.button.disabled,false);
 }
});
test('slow preview and link reads cannot open a popup after navigating away',async()=>{
 for(const action of ['message-ticket','link','edit']){let resolve,opened=0;const f=fixture(()=>new Promise(done=>{resolve=done;}));f.context.openModal=()=>{opened++;};Object.assign(f.button.dataset,{oltAction:action,id:action==='edit'?'o1':'t1',olt:'o1'});const pending=f.ui.onClick(f.event);f.ui.switchContext({...f.context});resolve({});await pending;assert.equal(opened,0);assert.equal(f.notice.textContent,'');}
});
test('disabled action tooltip still names its function',()=>{
 const f=fixture(),html=f.ui.button('delete-onu','x','Hapus ONU dari OLT','delete','o1',true);assert.match(html,/title="Hapus ONU dari OLT - Belum tersedia/);assert.match(html,/disabled/);
});
