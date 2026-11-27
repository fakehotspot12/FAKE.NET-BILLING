/* One billing dialog owns the ONU tabs; all native changes use preview/apply. */
(() => {
 'use strict';
 async function open(ctx){
  const {row,selected,owner,openForm,esc,active}=ctx;
  openForm('Pengaturan ONU',`<div class="full olt-onu-settings"><header class="olt-settings-heading"><div><strong>${esc(selected.customerName||selected.name||selected.serialNumber)}</strong><small>${esc(selected.serialNumber)} · PON ${esc(selected.ponKey)} / ONU ${esc(selected.onuId)}</small></div><span class="olt-badge">${esc(row.vendor.toUpperCase())}</span></header><nav class="olt-settings-tabs" role="tablist" aria-label="Pengaturan ONU">${[['services','Layanan'],['bridge','LAN / WiFi'],['hosts','IP Host'],['wan','WAN'],['acs','ACS / TR069']].map(([id,label],i)=>`<button type="button" role="tab" data-settings-tab="${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}</nav><section id="oltSettingsContent" class="olt-form" role="tabpanel"></section></div>`,async()=>false);
  const root=document.getElementById('oltSettingsContent').closest('.olt-onu-settings'),pane=root.querySelector('#oltSettingsContent'),dialog=root.closest('dialog'),form=root.closest('form');
  dialog.classList.add('olt-settings-dialog');const cache={},controls=new AbortController();let generation=0,loading=false,dirty=false;
  const present=()=>root.isConnected&&dialog.open&&active();
  const busy=()=>loading||[...pane.querySelectorAll('[data-close-modal]')].some(button=>button.disabled);
  const sync=()=>root.querySelectorAll('[data-settings-tab]').forEach(button=>{const value=busy();if(button.disabled!==value)button.disabled=value;});
  const observer=new MutationObserver(sync);observer.observe(pane,{subtree:true,attributes:true,attributeFilter:['disabled'],childList:true});
  const mount=(title,html)=>{pane.innerHTML=html;pane.setAttribute('aria-label',title);};
  async function show(tab){
   if(!present()||busy())return;if(dirty&&!window.confirm('Ada perubahan yang belum diterapkan. Pindah tab dan abaikan perubahan ini?'))return;dirty=false;loading=true;sync();const token=++generation;
   root.querySelectorAll('[data-settings-tab]').forEach(button=>{const current=button.dataset.settingsTab===tab;button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;});
   pane.innerHTML='<p class="full" role="status">Membaca pengaturan...</p>';
   const child={...ctx,cache,markClean:()=>{dirty=false;},markDirty:()=>{dirty=true;},active:()=>present()&&generation===token,openForm:mount};
   try{
    if(tab==='bridge')await window.FakenetOltBridge.open(child);
    else if(tab==='acs')await window.FakenetOltAcs.open(child);
    else await native(child,tab);
   }catch(error){if(child.active())pane.innerHTML=`<p class="full olt-modal-error" role="alert">${esc(error.message)}</p><div class="full modal-actions"><button type="button" class="ghost-button" data-close-modal>Tutup</button></div>`;}
   finally{loading=false;if(present())sync();}
  }
  root.addEventListener('change',()=>{dirty=true;},{signal:controls.signal});
  root.addEventListener('click',event=>{if(event.target.closest('[data-close-modal]')&&!busy()){dialog.close();return;}const button=event.target.closest('[data-settings-tab]');if(button)void show(button.dataset.settingsTab);},{signal:controls.signal});
  root.querySelector('[role=tablist]').addEventListener('keydown',event=>{const tabs=[...root.querySelectorAll('[data-settings-tab]')],at=tabs.indexOf(event.target);if(at<0||busy()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].click();root.querySelector('[aria-selected=true]').focus();},{signal:controls.signal});
  dialog.addEventListener('cancel',event=>{if(busy())event.preventDefault();},{signal:controls.signal});
  dialog.addEventListener('close',()=>{generation++;controls.abort();observer.disconnect();dialog.classList.remove('olt-settings-dialog');},{once:true});
  form.addEventListener('submit',event=>event.preventDefault(),{signal:controls.signal});
  await show('services');
 }
 async function native(ctx,tab){
  const {row,selected,owner,openForm,esc,glyph,active,cache}=ctx,base='/api/monitoring/olt/'+encodeURIComponent(row.id),endpoint=base+'/onu-settings';
  let snapshot=null,draft=null,hostEdit=null,plan=null,busy=false,stale=false;
  openForm(tab==='hosts'?'IP Host':tab==='wan'?'WAN':'Layanan',`<div class="full olt-settings-tools"><span id="oltNativePolicy"></span><button type="button" class="ghost-button" id="oltNativeRead">${glyph('refresh')}Periksa Ulang</button></div><div class="full" id="oltNativeEditor"></div><section class="full olt-pnp-confirm" id="oltNativeConfirm" hidden><div id="oltNativeImpact"></div><label>Ketik SN ONU<input name="confirmNativeSn" maxlength="12" autocomplete="off"></label><label class="olt-check"><input type="checkbox" name="confirmNativeImpact">Setujui perubahan pengaturan pada ONU ini.</label></section><p class="full" id="oltNativeStatus" role="status"></p><p class="full olt-modal-error" id="oltModalError" role="alert"></p><footer class="full modal-actions"><button type="button" class="ghost-button" data-close-modal>Tutup</button><button type="button" class="ghost-button" id="oltNativeCancel" hidden>Batal</button><button type="button" class="button" id="oltNativePrepare" hidden>Periksa Perubahan</button><button type="button" class="button" id="oltNativeApply" hidden>Terapkan</button></footer>`);
  const editor=document.getElementById('oltNativeEditor'),form=editor.closest('form'),dialog=form.closest('dialog'),$=id=>form.querySelector('#'+id),present=()=>active()&&editor.isConnected&&dialog.open;
  const select=(name,rows,value)=>`<select name="${name}">${rows.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(value)?'selected':''} ${item.disabled?'disabled':''}>${esc(item.label)}</option>`).join('')}</select>`;
  const field=(label,name,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
  const message=text=>{$('oltNativeStatus').textContent=text;},error=text=>{$('oltModalError').textContent=text;};
  const selection=()=>({address:selected.id,serialNumber:selected.serialNumber,...(selected.modelSource==='zte-configured-type'?{type:selected.model}:{})});
  function sync(){
   for(const control of form.querySelectorAll('#oltNativeEditor input,#oltNativeEditor select,#oltNativeEditor button,#oltNativeRead,#oltNativeCancel'))control.disabled=busy||Boolean(plan)||control.dataset.locked==='true'||control.closest('#oltNativeEditor')&&(stale||snapshot?.readOnly===true||tab==='services'&&snapshot?.capabilities.serviceChannel===false);
   for(const close of dialog.querySelectorAll('[data-close-modal],.modal-close'))close.disabled=busy;
   $('oltNativeConfirm').hidden=!plan;$('oltNativeApply').hidden=!plan;$('oltNativeApply').disabled=busy||!form.elements.confirmNativeImpact.checked||form.elements.confirmNativeSn.value!==selected.serialNumber;
   $('oltNativePrepare').hidden=Boolean(plan)||!snapshot||tab==='wan'||tab==='hosts'&&!hostEdit;$('oltNativePrepare').disabled=busy||stale||snapshot?.readOnly===true||tab==='services'&&snapshot?.capabilities.serviceChannel===false;
   $('oltNativeCancel').hidden=!plan&&!hostEdit;$('oltNativeCancel').disabled=busy;
   for(const control of form.querySelectorAll('[name=confirmNativeSn],[name=confirmNativeImpact]'))control.disabled=busy;
  }
  const ipLabel=ip=>!ip||ip==='0.0.0.0'?'Belum terverifikasi':ip;
  const wanCards=()=>!(snapshot.wanSources||[]).length?'':`<section class="full"><h3>Alamat WAN dari ACS</h3>${snapshot.wanSources.map(w=>`<article class="olt-host-card"><strong>VLAN ${esc(w.vlan??'belum terbaca')} · ${esc(w.mode.toUpperCase())}</strong><span>${esc(w.ip)} · ${esc(w.service||'WAN')}</span><small>${w.fresh?'Laporan terbaru':'Laporan tersimpan, perlu diperiksa ulang'}${w.checkedAt?' · '+esc(new Date(w.checkedAt).toLocaleString('id-ID')):''}</small></article>`).join('')}</section>`;
  function render(){
   if(!snapshot)return;
   $('oltNativePolicy').textContent='Layanan: '+(snapshot.policy.services==='manual'?'Manual ONU':'Mengikuti profil registrasi');
   if(tab==='wan'){editor.innerHTML=`<p class="olt-subtle">${esc(snapshot.capabilities.wanReason)}</p>`+snapshot.hosts.filter(row=>row.configured).map(row=>`<article class="olt-host-card"><strong>IP Host ${row.id} · ${esc(row.mode.toUpperCase())}</strong><span>VLAN ${row.vlan??'belum terbaca'} · ${esc(ipLabel(row.ip))}</span><small>${row.acs?'WAN ACS/TR069':'WAN existing'}${row.reason?' · '+esc(row.reason):''}</small>${row.ipNote?`<small>${esc(row.ipNote)}</small>`:''}</article>`).join('')+wanCards();sync();return;}
   if(tab==='services'){
    const opts=(direction,value)=>{const rows=snapshot.profiles[direction].map(row=>({id:row.name,label:row.name+(row.selectable===false?' · hanya lihat':''),disabled:row.selectable===false&&row.name!==value}));if(value&&!rows.some(row=>row.id===value))rows.push({id:value,label:value+' · existing'});return rows;};
    editor.innerHTML=`<div class="olt-settings-tools"><span>T-CONT → GEM → VLAN</span><button type="button" class="ghost-button" id="oltNativeBandwidth">Atur Bandwidth</button></div><div class="olt-channel-grid">${[['tcont','T-CONT / DBA'],['gems','GEM / Download'],['services','Pemetaan VLAN']].map(([kind,label])=>`<section class="olt-channel-group"><h3>${label}</h3>${draft[kind].map(item=>`<article class="olt-channel-card" data-native-kind="${kind}" data-native-id="${item.id}"><div class="olt-settings-tools"><strong>${kind==='services'?'Layanan':kind==='gems'?'GEM':'T-CONT'} ${item.id}</strong><button type="button" class="olt-icon danger" data-native-remove="${kind}" data-id="${item.id}" title="Hapus ${label} ${item.id}" aria-label="Hapus ${label} ${item.id}">${glyph('delete')}</button></div>${kind==='tcont'?`<label>Profil upload${select('tc-'+item.id,opts('upload',item.profile),item.profile)}</label><small>${draft.gems.filter(gem=>gem.tcont===item.id).length} GEM memakai T-CONT ini</small>`:kind==='gems'?`<label>T-CONT${select('gem-tc-'+item.id,draft.tcont.map(tc=>({id:tc.id,label:'T-CONT '+tc.id})),item.tcont)}</label><label>Profil download${select('gem-down-'+item.id,opts('download',item.downstream),item.downstream)}</label><small>${draft.services.filter(service=>service.gem===item.id).length} layanan memakai GEM ini</small>`:`<label>GEM${select('svc-gem-'+item.id,draft.gems.map(gem=>({id:gem.id,label:'GEM '+gem.id})),item.gem)}</label><label>VLAN${select('svc-vlan-'+item.id,snapshot.vlans.filter(id=>id>=2).map(id=>({id,label:'VLAN '+id})),item.vlan)}</label>`}</article>`).join('')}<button type="button" class="olt-add-card" data-native-add="${kind}">${glyph('plus')}Tambah ${kind==='services'?'Layanan':kind==='gems'?'GEM':'T-CONT'}</button></section>`).join('')}</div>`;
   }else if(hostEdit){
    const h=hostEdit;editor.innerHTML=`<section class="olt-host-editor"><h3>${h.configured?'Edit':'Tambah'} IP Host ${h.id}</h3><div class="olt-form"><label>VLAN layanan${select('hostVlan',snapshot.unit.services.filter(row=>row.vlan===row.userVlan).map(row=>({id:row.vlan,label:'VLAN '+row.vlan})),h.vlan)}</label>${field('Prioritas','hostPriority',h.priority,'type="number" min="0" max="7"')}<label>Mode${select('hostMode',[{id:'dhcp',label:'DHCP'},{id:'static',label:'Static'},{id:'pppoe',label:'PPPoE'}],['static','pppoe'].includes(h.mode)?h.mode:'dhcp')}</label><div class="full olt-form" id="oltHostStatic" ${h.mode==='static'?'':'hidden'}>${field('IP Address','hostIp',h.configuredIp==='0.0.0.0'?'':h.configuredIp)}${field('Subnet Mask','hostMask',h.mask||'255.255.255.0')}${field('Gateway','hostGateway',h.gateway)}${field('DNS Utama','hostDns1',h.dns1)}${field('DNS Kedua','hostDns2',h.dns2)}</div><div class="full olt-form" id="oltHostPppoe" ${h.mode==='pppoe'?'':'hidden'}>${field('Username PPPoE','hostPppUsername',h.pppUsername||'','maxlength="25" autocomplete="off"')}${field('Password PPPoE','hostPppPassword','','type="password" maxlength="25" autocomplete="new-password" '+(h.pppPasswordConfigured?'placeholder="Tersimpan; kosongkan jika tetap"':''))}<label class="full olt-check"><input name="hostNat" type="checkbox" ${h.natEnabled!==false?'checked':''}>Aktifkan NAT</label></div></div></section>`;
   }else{
    const configured=snapshot.hosts.filter(row=>row.configured),free=snapshot.hosts.filter(row=>row.managed!==false&&!row.configured&&row.editable);
    editor.innerHTML=`<p class="olt-subtle">Maksimal dua IP Host · DHCP / Static / PPPoE. Alamat ditampilkan sesuai sumber dan VLAN.</p><div class="olt-host-grid">${configured.map(h=>`<article class="olt-host-card"><header><strong>IP Host ${h.id}</strong>${h.acs?'<span class="olt-badge online">ACS / TR069</span>':''}<div class="olt-actions"><button type="button" class="olt-icon" data-host-edit="${h.id}" title="${esc(h.reason||'Edit IP Host '+h.id)}" aria-label="Edit IP Host ${h.id}" ${h.editable?'':'disabled'}>${glyph('edit')}</button><button type="button" class="olt-icon danger" data-host-remove="${h.id}" title="${esc(h.reason||'Hapus IP Host '+h.id)}" aria-label="Hapus IP Host ${h.id}" ${h.editable?'':'disabled'}>${glyph('delete')}</button></div></header><dl>${[['VLAN',h.vlan??'Belum terbaca'],['Mode',h.mode.toUpperCase()],['IP',ipLabel(h.ip)],['Mask',h.mask||'—'],['Gateway',h.gateway||'—'],['DNS',[h.dns1,h.dns2].filter(Boolean).join(' / ')||'—']].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${h.ipNote?`<small>${esc(h.ipNote)}</small>`:''}${h.reason?`<small>${esc(h.reason)}</small>`:''}</article>`).join('')}<button type="button" class="olt-add-card" id="oltHostAdd" ${free.length?'':'disabled'}>${glyph('plus')}Tambah IP Host<small>${free.length?'Indeks tersedia: '+free.map(h=>h.id).join(', '):'Tidak ada host kosong yang dilaporkan'}</small></button></div>`;
   }
   for(const control of editor.querySelectorAll('[disabled]'))control.dataset.locked='true';
   if(tab==='hosts'&&!hostEdit)editor.insertAdjacentHTML('beforeend',wanCards());
   if(snapshot.readIssues?.length)editor.insertAdjacentHTML('afterbegin',`<p class="olt-subtle">${snapshot.readIssues.map(esc).join(' · ')}</p>`);
   sync();
  }
  function reset(){plan=null;form.elements.confirmNativeSn.value='';form.elements.confirmNativeImpact.checked=false;$('oltNativeImpact').replaceChildren();}
  async function load(force=false){
   if(busy||!present())return;busy=true;hostEdit=null;reset();error('');message('Membaca layanan dan IP Host ONU...');sync();
   try{const result=!force&&cache.native&&(tab!=='services'||cache.native.capabilities.serviceChannel||cache.native.readOnly)&&Date.now()-cache.at<15000?cache.native:await owner.api(endpoint,{method:'POST',timeoutMs:45000,body:JSON.stringify({action:'read',section:tab,force,...selection()})});if(!present())return;stale=false;snapshot=result;cache.native=result;cache.at=Date.now();draft=structuredClone(result.unit);render();message('Data perangkat · '+new Date(result.checkedAt).toLocaleString('id-ID'));}
   catch(problem){if(present()){stale=true;error(problem.message);if(snapshot)render();message(snapshot?'Data terakhir ditampilkan. Periksa ulang sebelum mengubah.':'Baca ulang setelah koneksi OLT siap.');}}
   finally{busy=false;if(present())sync();}
  }
  function collect(){
   if(tab==='services'){
    for(const tc of draft.tcont)tc.profile=form.elements['tc-'+tc.id].value;
    for(const gem of draft.gems){gem.tcont=Number(form.elements['gem-tc-'+gem.id].value);gem.downstream=form.elements['gem-down-'+gem.id].value;}
    for(const service of draft.services){service.gem=Number(form.elements['svc-gem-'+service.id].value);service.vlan=service.userVlan=Number(form.elements['svc-vlan-'+service.id].value);}
    return{kind:'services',tcont:draft.tcont,gems:draft.gems,services:draft.services};
   }
   return{kind:'iphost',id:hostEdit.id,operation:'save',mode:form.elements.hostMode.value,vlan:Number(form.elements.hostVlan.value),priority:Number(form.elements.hostPriority.value),...(form.elements.hostMode.value==='pppoe'?{pppUsername:form.elements.hostPppUsername.value.trim(),pppPassword:form.elements.hostPppPassword.value,natEnabled:form.elements.hostNat.checked}:form.elements.hostMode.value==='static'?Object.fromEntries(['ip','mask','gateway','dns1','dns2'].map(key=>[key,form.elements['host'+key[0].toUpperCase()+key.slice(1)].value.trim()])):{})};
  }
  async function prepare(change){
   if(busy||stale||snapshot?.readOnly||!snapshot||!present())return;busy=true;reset();error('');message('Memeriksa topologi dan dampak perubahan...');sync();
   try{const result=await owner.api(endpoint,{method:'POST',timeoutMs:45000,body:JSON.stringify({action:'prepare',...selection(),change:change||collect()})});if(!present())return;if(result.alreadyConfigured){message(result.message);return;}plan=result;$('oltNativeImpact').innerHTML=`<strong>${result.kind==='services'?'Perubahan jalur T-CONT / GEM / VLAN':'Perubahan IP Host '+result.summary.id}</strong><p>${result.impacts.length?'Layanan terkait: '+esc(result.impacts.join(', ')):'Menambahkan jalur layanan baru.'}</p>${result.kind==='services'?`<p>Hasil: ${result.summary.tcont.length} T-CONT · ${result.summary.gems.length} GEM · VLAN ${esc(result.summary.services.map(row=>row.vlan).join(', '))}</p>`:`<p>${result.summary.operation==='remove'?'Hapus konfigurasi host':esc(result.summary.mode.toUpperCase())+' · VLAN '+result.summary.vlan}</p>`}`;message('Periksa dampak, ketik SN dan centang persetujuan.');}
   catch(problem){if(present())error(problem.message);}
   finally{busy=false;if(present())sync();}
  }
  editor.addEventListener('change',()=>{if(tab==='services'){collect();}else if(hostEdit){$('oltHostPppoe').hidden=form.elements.hostMode.value!=='pppoe';$('oltHostStatic').hidden=form.elements.hostMode.value!=='static';}error('');});
  editor.addEventListener('click',event=>{
   if(busy||stale||plan||!snapshot)return;const b=event.target.closest('button');if(!b)return;error('');
   if(b.id==='oltNativeBandwidth'){void window.FakenetOltBandwidth.open({...ctx,openForm:(title,html)=>{editor.closest('#oltSettingsContent').innerHTML=html;}});return;}
   if(b.dataset.nativeAdd){ctx.markDirty?.();collect();const kind=b.dataset.nativeAdd,max=kind==='tcont'?snapshot.unit.limits.tcont:kind==='gems'?Math.min(snapshot.unit.limits.gem,128):128;let id=1;while(draft[kind].some(row=>row.id===id))id++;if(id>max){error('Slot '+kind+' penuh.');return;}
    if(kind==='gems'&&!draft.tcont.length||kind==='services'&&!draft.gems.length){error('Tambahkan '+(kind==='gems'?'T-CONT':'GEM')+' terlebih dahulu.');return;}
    const existingVlans=new Set(draft.services.map(row=>row.vlan)),vlan=snapshot.vlans.find(id=>id>=2&&!existingVlans.has(id));if(kind==='services'&&!vlan){error('Semua VLAN existing sudah dipakai.');return;}
    draft[kind].push(kind==='tcont'?{id,profile:snapshot.profiles.upload.find(row=>row.selectable!==false&&!row.reserved)?.name||''}:kind==='gems'?{id,tcont:draft.tcont[0].id,downstream:snapshot.profiles.download.find(row=>row.selectable!==false&&!row.reserved)?.name||''}:{id,gem:draft.gems[0].id,userVlan:vlan,vlan});render();
   }else if(b.dataset.nativeRemove){ctx.markDirty?.();collect();const kind=b.dataset.nativeRemove,id=Number(b.dataset.id);if(kind==='tcont'&&draft.gems.some(row=>row.tcont===id)||kind==='gems'&&draft.services.some(row=>row.gem===id)){error('Masih dipakai. Pindahkan atau hapus pemetaan dependensinya dahulu.');return;}draft[kind]=draft[kind].filter(row=>row.id!==id);render();}
   else if(b.id==='oltHostAdd'){ctx.markDirty?.();hostEdit={...snapshot.hosts.find(row=>!row.configured&&row.editable),mode:'dhcp',vlan:snapshot.unit.services.find(row=>row.vlan===100)?.vlan||snapshot.unit.services[0]?.vlan};render();}
   else if(b.dataset.hostEdit){hostEdit={...snapshot.hosts.find(row=>row.id===Number(b.dataset.hostEdit))};render();}
   else if(b.dataset.hostRemove)void prepare({kind:'iphost',id:Number(b.dataset.hostRemove),operation:'remove'});
  });
  $('oltNativeRead').onclick=()=>void load(true);$('oltNativePrepare').onclick=()=>void prepare();$('oltNativeCancel').onclick=()=>{const hadPlan=Boolean(plan);reset();if(!hadPlan)hostEdit=null;render();message('Perubahan belum diterapkan.');};
  for(const name of['confirmNativeSn','confirmNativeImpact'])form.elements[name].addEventListener('input',sync);
  $('oltNativeApply').onclick=async()=>{
   if(busy||!plan||!present()||form.elements.confirmNativeSn.value!==selected.serialNumber||!form.elements.confirmNativeImpact.checked)return;const input={action:'apply',token:plan.token,revision:plan.revision,confirmId:row.id,confirmTarget:selected.serialNumber,confirmImpact:true};busy=true;error('');message('Menerapkan dan membaca ulang ONU...');sync();delete cache.native;
   try{const result=await owner.api(endpoint,{method:'POST',timeoutMs:45000,body:JSON.stringify(input)});if(!present())return;message(result.message);ctx.markClean?.();hostEdit=null;if(result.snapshot){snapshot=result.snapshot;snapshot.policy.services='manual';cache.native=snapshot;cache.at=Date.now();draft=structuredClone(snapshot.unit);}else snapshot=null;}
   catch(problem){if(present()){error(problem.message);snapshot=null;}}
   finally{busy=false;reset();if(present()){if(snapshot)render();else{editor.replaceChildren();sync();}}}
  };
  const controls=new AbortController();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();},{signal:controls.signal});dialog.addEventListener('close',()=>controls.abort(),{once:true,signal:controls.signal});
  await load();
 }
 window.FakenetOltOnuSettings={open};
})();
