/* OLT monitoring is lazy-loaded; live ONU actions require an explicit confirmation. */
(() => {
  'use strict';
  const view = { tab: 'devices', deviceId: 'all', nasId: '', search: '', status: '', pon: '', limit: 25, page: 1 };
  const ticketView = { oltId:'', nasId:'', scope:'', pon:'', search:'', bucket:'open', status:'', kind:'', limit:25, page:1 };
  const ticketStates = [['open','Aktif'],['resolved','Selesai']];
  let context, payload = {}, generation = 0, detailGeneration = 0, latestDetails = null, refreshTimer, requestedOnuView;
  const $ = id => document.getElementById(id);
  const esc = value => context.escapeHtml(value ?? '');
  const labels = { online:'Online',simulated:'Simulasi',offline:'Semua Offline',los:'LOS','dying-gasp':'Dying Gasp',other:'Other','high-rx':'Redaman Tinggi',unreachable:'Tidak terjangkau',checking:'Belum dibaca',disabled:'Nonaktif',unknown:'Belum terbaca',new:'Baru',assigned:'Diambil',working:'Dikerjakan',resolved:'Selesai' };
  const states = [['','Semua ONU','total'],['online','Online','online'],['los','LOS','los'],['dying-gasp','Dying Gasp','dyingGasp'],['other','Other','other'],['high-rx','Redaman Tinggi','highRx']];
  const scopes={onu:'ONU',pon:'PON / Area ODC',odp:'ODP',odc:'ODC',olt:'OLT',service:'Layanan pelanggan'};
  const serviceStages=[['on-way','Petugas menuju lokasi'],['checking','Sedang diperiksa'],['handling','Sedang ditangani'],['waiting-customer','Menunggu konfirmasi pelanggan'],['resolved','Selesai']];
  const coordinator=()=>context.can('olt:tickets:write')&&context.user?.role!=='technician';
  const canEditTicket=ticket=>context.can('olt:tickets:write')&&(coordinator()||!ticket.assignedTo||ticket.assignedTo===context.user?.id);
  const badge = value => `<span class="olt-badge ${esc(value)}">${esc(labels[value] || value)}</span>`;
  const time = value => value ? new Intl.DateTimeFormat('id-ID',{timeZone:context.timeZone||'Asia/Makassar',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '-';
  const count = value => value === null || value === undefined ? '-' : new Intl.NumberFormat('id-ID').format(value);
  const resourceSummary=row=>`<div class="olt-resources" title="${esc(row.resources?.checkedAt?`${row.resources.stale?'Data terakhir':'Dibaca'} ${time(row.resources.checkedAt)}`:'Data perangkat belum tersedia')}">${[['CPU','cpuPercent'],['RAM','ramPercent']].map(([label,key])=>{const value=row.resources?.[key],known=typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;return`<div class="olt-resource ${key==='cpuPercent'?'cpu':'ram'} ${row.resources?.stale?'stale':''}"><span>${label}<strong>${known?new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value)+'%':'-'}</strong></span><div class="olt-resource-track" role="progressbar" aria-label="${label}${known?'':' belum terbaca'}" ${known?`aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"`:''}><i style="width:${known?value:0}%"></i></div></div>`;}).join('')}</div>`;
  const lastActive = row => `<small class="olt-last-active" title="Waktu terakhir ONU terpantau online oleh billing">Terakhir aktif<span>${esc(time(row.lastOnlineAt))}</span></small>`;
  const icons={conversation:'/support-chat.svg',delete:'/olt-trash.svg',reboot:'/olt-reboot.svg',save:'/olt-save.svg',refresh:'/olt-refresh.svg',back:'/olt-back.svg',link:'/olt-link.svg'};
  const glyph = name => `<span class="olt-glyph" style="--olt-icon:${icons[name]?`url('${icons[name]}')`:`var(--icon-${name==='site'?'radius':name})`}" aria-hidden="true"></span>`;
  const button = (action,id,title,icon,oltId='',disabled=false) => `<button type="button" class="olt-icon ${action.includes('delete')?'danger':''}" data-olt-action="${action}" data-id="${esc(id)}" data-olt="${esc(oltId)}" title="${esc(disabled?title+' - Belum tersedia untuk perangkat atau akses ini':title)}" aria-label="${esc(title)}" ${disabled?'disabled':''}>${glyph(icon)}</button>`;
  const table = (columns, rows) => `<div class="olt-table-wrap"><table class="olt-table"><thead><tr>${columns.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,index)=>`<td data-label="${esc(columns[index])}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const options = (rows,selected,empty='Pilih') => `<option value="">${esc(empty)}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name)}</option>`).join('');
  const modalActions = (label='Simpan') => `<p class="full olt-modal-error" id="oltModalError" role="alert"></p><div class="modal-actions full"><button type="button" class="ghost-button" data-close-modal>Batal</button><button class="button" type="submit">${label}</button></div>`;
  const field = (label,name,value='',extra='') => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
  const openForm = (title,html,save) => context.openModal(title,`<div class="olt-form">${html}</div>`,async (data,form) => {
    try { return (await save(data,form)) !== false; } catch(error) { if($('oltModalError'))$('oltModalError').textContent=error.message; return false; }
  });
  const active = () => context?.isCurrent() && Boolean($('oltRoot'));
  const deviceSaveButton=row=>button('save-config',row.id,'Simpan Config OLT','save','',!(row.saveConfigAvailable??row.onuDeleteAvailable));
  const selectedDeviceActions=()=>{const row=payload.devices?.find(item=>item.id===view.deviceId);return context.can('olt:manage')&&row?button('edit',row.id,'Edit OLT','edit')+deviceSaveButton(row)+button('delete',row.id,'Hapus integrasi OLT','delete'):'';};
  async function render(ctx) {
    if(ctx){if(ctx.mode!=='tickets'&&requestedOnuView){Object.assign(view,requestedOnuView);requestedOnuView=null;}else view.tab='devices';latestDetails=null;clearTimeout(refreshTimer);}else ctx=context;
    context=ctx; const token=++generation;
    if(context.mode==='tickets')return renderTicketCenter(token);
    const result=await context.api('/api/monitoring/olt');
    if(token!==generation || !context.isCurrent())return;
    payload=result;
    if(view.deviceId!=='all' && !payload.devices.some(row=>row.id===view.deviceId)) view.deviceId='all';
    const devices=payload.devices.filter(row=>!view.nasId||row.nasId===view.nasId);
    const reachable=devices.filter(row=>row.status==='online'&&!row.stale),fresh=reachable.filter(row=>row.summary);
    const sum=key=>fresh.length?fresh.reduce((value,row)=>value+(row.summary?.[key]||0),0):null;
    const nasOptions=[...new Map(payload.devices.filter(row=>row.nasId).map(row=>[row.nasId,{id:row.nasId,name:row.nasName||row.nasId}])).values()];
    context.app.innerHTML=`<section class="olt-ui" id="oltRoot">
      <div class="olt-heading"><div><h2>OLT <span class="olt-badge">GPON / EPON</span></h2><p class="olt-sync"><span class="olt-dot ${reachable.length?'online':'unknown'}"></span>${devices.some(row=>row.simulated)?'Data simulasi':`${reachable.length} / ${devices.length} OLT terjangkau`}${reachable.length?`<span>Dicek ${time(reachable.map(row=>row.checkedAt).sort().at(-1))}</span>`:''}</p></div><div class="olt-actions"><select class="olt-nas" id="oltNasFilter" aria-label="Filter NAS">${options(nasOptions,view.nasId,'Semua NAS')}</select>${button('refresh-all','','Perbarui data OLT','refresh')}${context.can('olt:manage')?'<button type="button" class="olt-add" id="oltAdd">+ Tambah OLT</button>':''}</div></div>
      <div class="olt-summary">${states.map(([state,label,key])=>`<button type="button" class="olt-metric ${state||'total'}" data-olt-state="${state}" title="${esc(label)}"><span><i class="olt-dot ${state||'total'}"></i>${label}</span><strong>${count(sum(key))}</strong><small>${state==='high-rx'?'RX ≤ -26,5 dBm':'ONU'}</small></button>`).join('')}</div>
      <div class="olt-tabs" role="tablist" aria-label="Monitoring OLT">${[['devices','Ringkasan'],['onus','PON / ONU']].map(([key,label])=>`<button type="button" role="tab" aria-selected="${view.tab===key}" data-olt-tab="${key}">${label}</button>`).join('')}</div>
      <p class="olt-notice" id="oltNotice" role="status" hidden></p><div id="oltContent"></div>
    </section>`;
    $('oltAdd')?.addEventListener('click',()=>deviceForm());
    $('oltNasFilter').addEventListener('change',event=>{view.nasId=event.target.value;view.deviceId='all';view.pon='';view.page=1;render();});
    $('oltRoot').addEventListener('click',onClick);
    if(view.tab==='devices')deviceList();else await onuView();
  }
  const ticketQuery = () => new URLSearchParams(ticketView).toString();
  async function renderTicketCenter(token) {
    const result=await context.api('/api/monitoring/olt/tickets?'+ticketQuery());
    if(token!==generation||!context.isCurrent())return;
    payload=result;ticketView.page=result.page;
    context.app.innerHTML=`<section class="olt-ui olt-ticket-center" id="oltRoot"><div class="olt-heading"><div><h2>Tiket Layanan</h2><p class="olt-sync" id="ticketSummary"></p></div><div class="olt-actions">${button('reload','','Segarkan tiket','refresh')}${context.can('olt:manage')?button('templates','','Pengaturan tiket dan WhatsApp','settings'):''}${context.can('olt:tickets:write')?'<button type="button" class="olt-add" id="oltNewTicket">+ Buat Tiket</button>':''}</div></div>
      <div class="olt-ticket-states" role="tablist" aria-label="Tiket layanan">${ticketStates.map(([key,label])=>`<button type="button" role="tab" id="ticketTab-${key}" data-ticket-bucket="${key}" aria-controls="oltContent" aria-selected="${ticketView.bucket===key}" tabindex="${ticketView.bucket===key?'0':'-1'}"><span>${label}</span><strong></strong></button>`).join('')}</div>
      <form class="olt-toolbar olt-ticket-filters" id="ticketFilters"><label class="olt-search">Cari<div class="olt-ticket-search"><input id="ticketSearch" type="search" value="${esc(ticketView.search)}" maxlength="100" placeholder="Nomor tiket / nama / serial" autocomplete="off" enterkeyhint="search"><button type="button" id="ticketClear" title="Hapus pencarian" aria-label="Hapus pencarian" ${ticketView.search?'':'hidden'}>&times;</button></div></label><label id="ticketStatusFilter" ${ticketView.bucket==='resolved'?'hidden':''}>Status<select id="ticketStatus">${options(['new','assigned','working'].map(id=>({id,name:labels[id]})),ticketView.status,'Semua aktif')}</select></label><label>Jenis<select id="ticketKind">${options([{id:'fault',name:'Gangguan'},{id:'request',name:'Permintaan'}],ticketView.kind,'Semua jenis')}</select></label><label>NAS<select id="ticketNas">${options(result.nasOptions,ticketView.nasId,'Semua NAS')}</select></label><label>OLT<select id="ticketOlt">${options(result.devices.filter(row=>!ticketView.nasId||row.nasId===ticketView.nasId),ticketView.oltId,'Semua OLT')}</select></label><label>Lingkup<select id="ticketScope">${options(Object.entries(scopes).map(([id,name])=>({id,name})),ticketView.scope,'Semua lingkup')}</select></label><label>Tampil<select id="ticketLimit">${[10,25,50,100].map(value=>`<option ${value===ticketView.limit?'selected':''}>${value}</option>`).join('')}</select></label></form>${ticketView.pon?`<div class="olt-ticket-pon">PON ${esc(ticketView.pon)} <button type="button" data-clear-ticket-pon title="Hapus filter PON" aria-label="Hapus filter PON">&times;</button></div>`:''}<p class="olt-notice" id="oltNotice" role="status" hidden></p><div id="oltContent" role="tabpanel" aria-labelledby="ticketTab-${ticketView.bucket}"></div></section>`;
    $('oltRoot').addEventListener('click',onClick);$('oltNewTicket')?.addEventListener('click',()=>ticketForm());
    let timer;const search=()=>{clearTimeout(timer);ticketView.page=1;if(active()&&context.mode==='tickets')loadTicketRows();};
    $('ticketFilters').addEventListener('submit',event=>{event.preventDefault();search();});
    $('ticketSearch').addEventListener('input',event=>{ticketView.search=event.target.value;ticketView.page=1;detailGeneration++;$('ticketClear').hidden=!ticketView.search;clearTimeout(timer);timer=setTimeout(search,250);});
    $('ticketClear').addEventListener('click',()=>{ticketView.search='';$('ticketSearch').value='';$('ticketClear').hidden=true;$('ticketSearch').focus();search();});
    for(const [id,key]of [['ticketStatus','status'],['ticketKind','kind'],['ticketNas','nasId'],['ticketOlt','oltId'],['ticketScope','scope'],['ticketLimit','limit']])$(id).addEventListener('change',event=>{ticketView[key]=key==='limit'?Number(event.target.value):event.target.value;if(key==='nasId'){ticketView.oltId='';ticketView.pon='';$('ticketOlt').innerHTML=options(payload.devices.filter(row=>!ticketView.nasId||row.nasId===ticketView.nasId),'','Semua OLT');}if(key==='oltId')ticketView.pon='';search();});
    $('oltRoot').querySelector('[role="tablist"]').addEventListener('keydown',event=>{
      const tabs=[...$('oltRoot').querySelectorAll('[data-ticket-bucket]')],index=tabs.indexOf(event.target);
      if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();tabs[next].click();
    });
    ticketList();
  }
  async function loadTicketRows() {
    const token=++detailGeneration,renderToken=generation;
    try {
      const result=await context.api('/api/monitoring/olt/tickets?'+ticketQuery());
      if(token!==detailGeneration||renderToken!==generation||!active()||context.mode!=='tickets')return;
      payload=result;ticketView.page=result.page;ticketList();notice('');
    }catch(error){if(token===detailGeneration&&renderToken===generation&&active()&&context.mode==='tickets')notice(error.message);}
  }
  function notice(message) { if($('oltNotice')){$('oltNotice').textContent=message;$('oltNotice').hidden=!message;} }
  function followRefresh(attempt=0){clearTimeout(refreshTimer);if(attempt>=40)return;refreshTimer=setTimeout(async()=>{if(!active()||context.mode==='tickets')return;try{await render();if(payload.devices?.some(row=>row.refreshPending))followRefresh(attempt+1);}catch(error){notice(error.message);}},3500);}
  function deviceList() {
    const devices=payload.devices.filter(row=>!view.nasId||row.nasId===view.nasId);
    $('oltContent').innerHTML=devices.length?`<div class="olt-device-list">${devices.map(row=>{
      const total=row.summary?.total,percent=total?Math.round(row.summary.online/total*100):0;
      return `<article class="olt-device"><div class="olt-device-head"><div class="olt-device-identity"><span class="olt-device-icon">${glyph('site')}</span><div><h3>${esc(row.name)}</h3><p>${row.nasName?`<span class="olt-badge">${esc(row.nasName)}</span>`:''}<span>${esc(row.host||row.systemName||row.vendorLabel||row.vendor||'OLT')}</span></p></div></div><div class="olt-device-tools">${badge(row.status)}<div class="olt-actions">${button('detail',row.id,'Lihat ONU','eye')}${row.enabled?button('refresh',row.id,'Baca ulang OLT','refresh'):''}${context.can('olt:manage')?button('edit',row.id,'Edit integrasi OLT','edit')+deviceSaveButton(row)+button('delete',row.id,'Hapus integrasi OLT','delete'):''}</div></div></div>
      <div class="olt-device-body"><div class="olt-device-health"><span>ONU Online</span><strong>${count(row.summary?.online)} <small>/ ${count(total)}</small></strong><div class="olt-health-bar" aria-label="${percent}% ONU online"><span style="width:${percent}%"></span></div><div class="olt-device-counts">${states.slice(2,5).map(([state,label,key])=>`<button type="button" data-olt-state="${state}" data-olt="${esc(row.id)}"><i class="olt-dot ${state}"></i>${label}<b>${count(row.summary?.[key])}</b></button>`).join('')}</div>${resourceSummary(row)}</div>
      <div class="olt-port-section"><div class="olt-port-title"><strong title="${esc(row.modelSource==='web-firmware-family'?'Keluarga model yang dilaporkan firmware web':'Model yang dilaporkan perangkat')}">${esc(row.systemLabel||row.modelLabel||row.vendorLabel||'OLT')}</strong><span>${count(row.ponPorts)} port</span></div><div class="olt-port-grid">${(row.ponOverview||[]).map(port=>`<button type="button" class="olt-port-tile ${esc(port.status)}" data-olt="${esc(row.id)}" data-olt-pon="${esc(port.ponKey)}" title="${esc(port.name)} · ${count(port.online)} online / ${count(port.offline)} offline"><span class="olt-port-jack" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>${esc(port.ponKey?.split('/').at(-1)||port.name)}</strong><small>${count(port.online)}<span> / ${count(port.total)}</span></small></button>`).join('')||'<span class="olt-subtle">Belum ada pembacaan PON</span>'}</div></div></div>
      <div class="olt-device-foot"><span>${row.stale?'Data terakhir · ':''}Dicek ${time(row.checkedAt)}</span><span>${row.summary?.highRx?`<i class="olt-dot high-rx"></i>${count(row.summary.highRx)} redaman tinggi`:''}</span>${row.error||row.warnings?.length?`<span class="olt-device-warning">${esc(row.error||(row.warnings||[]).join('. '))}</span>`:''}</div></article>`;
    }).join('')}</div>`:'<div class="olt-state">Belum ada OLT terdaftar.</div>';
  }
  async function deviceForm(row={}) {
    openForm(row.id?'Edit OLT':'Tambah OLT',
      field('Nama OLT','name',row.name,'required maxlength="100"')+field('IP Manajemen','host',row.host,'required maxlength="64" autocomplete="off"')+
      `<label>Vendor<select name="vendor" ${row.id?'disabled':''}>${(payload.vendors||[{value:'cdata',label:'CDATA GPON',writes:true}]).map(item=>`<option value="${esc(item.value)}" ${item.value===(row.vendor||'cdata')?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label>`+field('Port SNMP','port',row.port||161,'type="number" required min="1" max="65535"')+
      '<p class="full olt-subtle" id="oltVendorSupport" role="status"></p>'+
      field('Community SNMP Baca','community','','type="password" maxlength="64" autocomplete="new-password" '+(row.id?'placeholder="Tersimpan; kosongkan jika tetap"':'required'))+
      `<label>NAS<select name="nasId">${options(payload.nasOptions || [],row.nasId,'Belum ditautkan')}</select></label>`+
      field('Latitude','latitude',row.latitude??'','type="number" step="any" min="-90" max="90"')+field('Longitude','longitude',row.longitude??'','type="number" step="any" min="-180" max="180"')+
      `<details class="full olt-cli-settings" ${row.cliEnabled?'open':''}><summary>Akses CLI OLT</summary><div class="olt-form"><label class="full olt-check"><input type="checkbox" name="cliEnabled" ${row.cliEnabled?'checked':''}>Aktifkan akses CLI</label><label>Protokol<select name="cliProtocol"><option value="telnet">Telnet</option><option value="ssh" ${row.cliProtocol==='ssh'?'selected':''}>SSH</option></select></label>${field('Username CLI','cliUsername',row.cliUsername||'','maxlength="64" autocomplete="off"')}${field('Port CLI','cliPort',row.cliPort||23,'type="number" min="1" max="65535"')}${field('Password CLI','cliPassword','','type="password" maxlength="128" autocomplete="new-password" '+(row.cliPasswordConfigured?'placeholder="Tersimpan; kosongkan jika tetap"':''))}${field('Port Web OLT','webPort',row.webPort||80,'type="number" min="1" max="65535"')}</div></details>`+
      `<label class="full olt-check"><input type="checkbox" name="enabled" ${row.enabled!==false?'checked':''}>Aktifkan monitoring</label><div class="full olt-connection-tests"><div class="olt-actions"><button type="button" class="ghost-button" data-olt-test="snmp">${glyph('site')}Tes SNMP</button><button type="button" class="ghost-button" data-olt-test="telnet">${glyph('settings')}Tes Telnet</button></div><p id="oltConnectionResult" role="status" aria-live="polite"></p></div>`+modalActions(),
      async(data,form)=>{await context.api('/api/monitoring/olt'+(row.id?'/'+encodeURIComponent(row.id):''),{method:row.id?'PUT':'POST',body:JSON.stringify({...data,enabled:form.elements.enabled.checked,cliEnabled:form.elements.cliEnabled.checked})});await render();context.setToast('Integrasi OLT tersimpan');});
    const form=document.querySelector('#modal form'),vendor=form.elements.vendor,protocol=form.elements.cliProtocol;
    const support=()=>{const info=payload.vendors?.find(item=>item.value===vendor.value);$('oltVendorSupport').textContent=info?.writes?'':info?.note||'';protocol.querySelector('[value=ssh]').disabled=vendor.value==='cdata';if(vendor.value==='cdata'){if(protocol.value==='ssh'&&form.elements.cliPort.value==='22')form.elements.cliPort.value='23';protocol.value='telnet';}};
    vendor.addEventListener('change',support);protocol.addEventListener('change',()=>{if(['22','23'].includes(form.elements.cliPort.value))form.elements.cliPort.value=protocol.value==='ssh'?'22':'23';});support();
    for(const button of document.querySelectorAll('#modal [data-olt-test]'))button.addEventListener('click',async()=>{
      const form=button.closest('form');if(!form.reportValidity())return;const result=form.querySelector('#oltConnectionResult'),buttons=[...form.querySelectorAll('[data-olt-test]')];buttons.forEach(item=>item.disabled=true);result.className='';result.textContent='Menguji koneksi...';
      try{const response=await context.api('/api/monitoring/olt'+(row.id?'/'+encodeURIComponent(row.id):'')+'/connection-test',{method:'POST',timeoutMs:20000,body:JSON.stringify({...Object.fromEntries(new FormData(form)),enabled:form.elements.enabled.checked,cliEnabled:form.elements.cliEnabled.checked,kind:button.dataset.oltTest})});if(result.isConnected){result.textContent=response.message+(response.ok?` (${response.elapsedMs} ms)`:'');result.className=response.ok?'olt-test-ok':'olt-test-failed';}}
      catch(error){if(result.isConnected){result.textContent=error.message;result.className='olt-test-failed';}}
      finally{buttons.forEach(item=>{if(item.isConnected)item.disabled=false;});}
    });
  }
  async function onuView() {
    const devices=payload.devices.filter(row=>!view.nasId||row.nasId===view.nasId);
    if(!devices.length){latestDetails=null;$('oltContent').innerHTML='<div class="olt-state">Belum ada OLT pada filter ini.</div>';return;}
    if(!devices.some(row=>row.id===view.deviceId)){view.deviceId=devices[0].id;view.pon='';view.page=1;}
    $('oltContent').innerHTML=`<div class="olt-detail-head"><div class="olt-actions">${button('summary','','Kembali ke Ringkasan','back')}<strong>PON / ONU</strong></div></div><div class="olt-toolbar"><label>OLT<select id="oltSelected">${devices.map(row=>`<option value="${esc(row.id)}" ${row.id===view.deviceId?'selected':''}>${esc(row.name)}</option>`).join('')}</select></label><label>Status<select id="oltStatus">${[['','Semua status'],...states.slice(1).map(([key,label])=>[key,label]),['offline','Semua Offline'],['unknown','Belum terbaca']].map(([key,label])=>`<option value="${key}" ${view.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Tampil<select id="oltLimit">${[10,25,50,100].map(value=>`<option ${value===view.limit?'selected':''}>${value}</option>`).join('')}</select></label><label class="olt-search">Cari<input id="oltSearch" type="search" value="${esc(view.search)}" maxlength="100" placeholder="Nama / serial / pelanggan" autocomplete="off"></label></div><div class="olt-ports" id="oltPorts"></div><div id="oltOnuResults"></div>`;
    const deviceActions=document.createElement('div');deviceActions.id='oltSelectedActions';deviceActions.className='olt-actions olt-selected-actions';deviceActions.innerHTML=selectedDeviceActions();$('oltSelected').closest('label').append(deviceActions);
    $('oltSelected').addEventListener('change',event=>{view.deviceId=event.target.value;view.pon='';view.page=1;deviceActions.innerHTML=selectedDeviceActions();loadDetails();});
    $('oltStatus').addEventListener('change',event=>{view.status=event.target.value;view.page=1;loadDetails();});
    $('oltLimit').addEventListener('change',event=>{view.limit=Number(event.target.value);view.page=1;loadDetails();});
    let timer;$('oltSearch').addEventListener('input',event=>{view.search=event.target.value;view.page=1;detailGeneration++;clearTimeout(timer);timer=setTimeout(()=>{if(active()&&context.mode!=='tickets'&&$('oltSearch')===event.target)loadDetails();},250);});
    await loadDetails();
  }
  async function loadDetails() {
    const token=++detailGeneration,renderToken=generation;
    if(!view.deviceId||view.deviceId==='all')return;
    latestDetails=null;
    try {
      const result=await context.api('/api/monitoring/olt/onus?'+new URLSearchParams({oltId:view.deviceId,nasId:view.nasId,search:view.search,status:view.status,pon:view.pon,page:view.page,limit:view.limit}));
      if(token!==detailGeneration||renderToken!==generation||!active()||!$('oltOnuResults'))return;
      latestDetails=result;
      const updated=new Map(result.devices.map(row=>[row.id,row]));payload.devices=payload.devices.map(row=>({...row,...updated.get(row.id)}));
      for(const [state,,key]of states){const metric=$('oltRoot').querySelector(`.olt-summary [data-olt-state="${state}"]`);if(metric){metric.querySelector('strong').textContent=count(result.summary?.[key]);metric.dataset.olt=view.deviceId;}}
      if($('oltSelectedActions'))$('oltSelectedActions').innerHTML=selectedDeviceActions();
      notice(result.devices.map(row=>row.error||(row.warnings||[]).join('. ')).filter(Boolean).join('. '));
      $('oltPorts').innerHTML=view.deviceId==='all'?'':`<button type="button" class="olt-port" data-pon="" aria-pressed="${!view.pon}"><strong>Semua PON</strong><small>${count(result.summary?.total)} ONU</small></button>`+(result.ports || []).filter(row=>row.kind==='pon').map(row=>`<button type="button" class="olt-port" data-pon="${esc(row.ponKey)}" aria-pressed="${view.pon===row.ponKey}"><strong>${esc(row.name)}</strong><small>${count(row.online)} online / ${count(row.offline)} offline</small></button>`).join('');
      $('oltPorts').querySelectorAll('[data-pon]').forEach(button=>button.addEventListener('click',()=>{view.pon=button.dataset.pon;view.page=1;loadDetails();}));
      $('oltOnuResults').innerHTML=(result.onus.length?table(['Pelanggan / Description','PON / ID','Status','Model','Redaman RX','Jarak','ODP','Aksi'],result.onus.map(row=>[
        `<strong class="olt-customer-name">${esc(row.customerName || '-')}</strong><div class="olt-onu-name"><small>${esc(row.name || '-')}</small>${context.can('olt:onu:reboot')?button('rename-onu',row.id,'Edit description ONU','edit',row.oltId,!(payload.devices.find(device=>device.id===row.oltId)?.onuRenameAvailable??payload.devices.find(device=>device.id===row.oltId)?.onuDeleteAvailable)):''}</div><small class="olt-onu-serial">${esc(row.serialNumber)}</small>${view.deviceId==='all'?`<small class="olt-onu-origin">${esc(row.oltName)}</small>`:''}`,`${esc(row.ponKey || '-')} / ${esc(row.onuId || '-')}`,badge(row.condition||row.status)+(row.plannedRebootUntil?`<small class="olt-reboot-marker" title="Tiket otomatis dijeda hingga ${esc(time(row.plannedRebootUntil))}">Reboot terencana</small>`:'')+(row.status==='offline'&&!row.causeKnown?'<small>Penyebab belum terbaca</small>':row.downCause&&row.condition==='other'?`<small>${esc(row.downCause)}</small>`:'')+lastActive(row),esc(row.model || '-'),row.rxPower===null?'-':`${row.rxPower.toFixed(2)} dBm`,row.distance===null?'-':`${count(row.distance)} m`,
        `<div class="olt-link-label">${esc(row.fiberPointName || '-')}</div>`,
        `<div class="olt-actions">${context.can('olt:tickets:write')?button('link',row.id,'Tautkan pelanggan dan ODP','link',row.oltId):''}${context.can('olt:onu:reboot')?button('reboot-onu',row.id,'Reboot ONU','reboot',row.oltId,!(payload.devices.find(device=>device.id===row.oltId)?.onuRebootAvailable??payload.devices.find(device=>device.id===row.oltId)?.onuDeleteAvailable)):''}${context.can('olt:onu:delete')?button('delete-onu',row.id,'Hapus ONU dari OLT','delete',row.oltId,!payload.devices.find(device=>device.id===row.oltId)?.onuDeleteAvailable):''}</div>`
      ])):'<div class="olt-state">'+(result.devices.some(row=>row.checkedAt)?'Tidak ada ONU sesuai filter.':'Belum ada pembacaan ONU.')+'</div>')+
      `<div class="olt-pages"><span>${count(result.total)} ONU / Halaman ${result.page} dari ${result.pages}</span><button type="button" class="olt-icon" data-olt-page="-1" aria-label="Halaman sebelumnya" ${result.page<=1?'disabled':''}>&lt;</button><button type="button" class="olt-icon" data-olt-page="1" aria-label="Halaman berikutnya" ${result.page>=result.pages?'disabled':''}>&gt;</button></div>`;
      $('oltOnuResults').querySelectorAll('[data-olt-page]').forEach(button=>button.addEventListener('click',()=>{view.page+=Number(button.dataset.oltPage);loadDetails();}));
    }catch(error){if(token===detailGeneration&&renderToken===generation&&active())notice(error.message);}
  }
  async function linkForm(onu) {
    const renderToken=generation,owner=context;
    const endpoint=`/api/monitoring/olt/${encodeURIComponent(onu.oltId)}`;
    const result=await context.api(endpoint+'/link-options');
    if(!active()||context!==owner||generation!==renderToken)return;
    const customers=[...(result.customers || [])];if(onu.customerId&&!customers.some(row=>row.id===onu.customerId))customers.unshift({id:onu.customerId,name:onu.customerName});
    openForm('Tautkan ONU',`<div class="full"><strong>${esc(onu.serialNumber)}</strong></div><label class="full">Cari Pelanggan<input type="search" id="oltLinkSearch" maxlength="100" autocomplete="off"></label><label class="full">Pelanggan<select id="oltLinkCustomer" name="customerId">${options(customers,onu.customerId,'Tanpa pelanggan')}</select></label><label class="full">ODP<select name="fiberPointId">${options(result.points || [],onu.fiberPointId,'Belum ditautkan')}</select></label>`+modalActions(),async data=>{
      await context.api(endpoint+'/links',{method:'PUT',body:JSON.stringify({...data,serialNumber:onu.serialNumber})});await loadDetails();context.setToast('Pemetaan ONU tersimpan');
    });
    let timer,sequence=0;$('oltLinkSearch').addEventListener('input',event=>{const search=event.target.value,token=++sequence;clearTimeout(timer);timer=setTimeout(async()=>{try{const next=await context.api(endpoint+'/link-options?'+new URLSearchParams({search}));if(token===sequence&&$('oltLinkCustomer'))$('oltLinkCustomer').innerHTML=options(next.customers || [],'','Pilih pelanggan');}catch(error){if($('oltModalError'))$('oltModalError').textContent=error.message;}},250);});
  }
  function ticketList() {
    const tickets=payload.tickets;
    $('ticketSummary').textContent=count(payload.counts.open)+' tiket aktif / '+count(payload.counts.new)+' belum diambil';
    $('ticketStatusFilter').hidden=ticketView.bucket==='resolved';
    document.querySelectorAll('[data-ticket-bucket]').forEach(element=>{const selected=ticketView.bucket===element.dataset.ticketBucket;element.setAttribute('aria-selected',String(selected));element.tabIndex=selected?0:-1;element.querySelector('strong').textContent=count(payload.counts[element.dataset.ticketBucket]);});
    $('oltContent').setAttribute('aria-labelledby','ticketTab-'+ticketView.bucket);
    $('oltContent').innerHTML=(tickets.length?table(['Tiket','Lokasi / Layanan','Status','Petugas / Diperbarui','Aksi'],tickets.map(ticket=>{
      const generic=ticket.scope==='service',device=payload.devices.find(row=>row.id===ticket.oltId),nasName=ticket.nasName||device?.nasName||payload.nasOptions?.find(row=>row.id===(ticket.nasId||device?.nasId))?.name;
      return [
        `<button type="button" class="olt-ticket-number" data-olt-action="detail-ticket" data-id="${esc(ticket.id)}">${esc(ticket.number)}</button><small class="olt-ticket-title">${esc(ticket.title)}</small><div class="olt-ticket-tags"><span class="olt-badge">${ticket.kind==='request'?'Permintaan':'Gangguan'}</span>${generic?`<span class="olt-badge olt-wifiku-source">${ticket.source==='wifiku'?'WifiKu':'Petugas'}</span>`:`<span class="olt-badge">${esc(scopes[ticket.scope]||'ONU')}</span>`}${ticket.source==='olt-los'?'<span class="olt-badge olt-auto-source">Otomatis LOS</span>':''}</div>${!generic&&ticket.affectedTotal>1?`<small>${count(ticket.affectedCount||ticket.affectedTotal)} ONU terdampak</small>`:''}${ticket.customerName?`<small>${esc(ticket.customerName)}</small>`:''}`,
        `${esc(generic?nasName||'Belum dipetakan':device?.name||'-')}${!generic&&nasName?`<small>${esc(nasName)}</small>`:''}${!generic?`<small>${ticket.pon?'PON '+esc(ticket.pon):''}</small><small>${esc(ticket.serialNumber||ticket.fiberPointName||'')}</small>`:''}`,
        badge(ticket.status)+(ticket.losDetection?`<small class="olt-ticket-signal ${ticket.losDetection.state==='online'?'online':'los'}">${ticket.autoResolved?'Pulih otomatis':ticket.losDetection.state==='online'?'Online kembali':'LOS terpantau'}</small>`:''),
        esc(payload.technicians.find(user=>user.id===ticket.assignedTo)?.name || 'Belum diambil')+`<small>${esc(time(ticket.updatedAt))}</small>`,
        `<div class="olt-actions">${generic?button('conversation-ticket',ticket.id,'Percakapan pelanggan','conversation'):context.can('olt:read')?button('ticket-onu',ticket.id,ticket.serialNumber?'Lihat ONU':'Lihat PON','eye'):''}${ticket.status!=='resolved'&&!ticket.assignedTo&&context.can('olt:tickets:write')?'<button type="button" class="olt-take" data-olt-action="claim-ticket" data-id="'+esc(ticket.id)+'">Ambil</button>':''}${button('progress-ticket',ticket.id,generic?'Progres layanan':'Catatan progres internal','activity')}${canEditTicket(ticket)?button('edit-ticket',ticket.id,'Edit tiket','edit'):''}${context.can('olt:tickets:read')?button('message-ticket',ticket.id,'Pratinjau WhatsApp','whatsapp'):''}</div>`
      ];
    })):'<div class="olt-state">Tidak ada tiket sesuai filter.</div>')+`<div class="olt-pages"><span>${count(payload.total)} tiket / Halaman ${payload.page} dari ${payload.pages}</span><button type="button" class="olt-icon" data-ticket-page="-1" aria-label="Halaman sebelumnya" ${payload.page<=1?'disabled':''}>&lt;</button><button type="button" class="olt-icon" data-ticket-page="1" aria-label="Halaman berikutnya" ${payload.page>=payload.pages?'disabled':''}>&gt;</button></div>`;
  }
  function ticketForm(ticket={}) {
    if(!ticket.id)return serviceRequestForm();
    const automatic=ticket.source==='olt-los',generic=ticket.scope==='service';
    const unclaimed=context.user?.role==='technician'&&ticket.id&&!ticket.assignedTo;
    const technicians=coordinator()?payload.technicians:payload.technicians.filter(row=>row.id===context.user?.id);
    openForm(ticket.id?'Edit Tiket Layanan':'Buat Tiket Layanan',
      (automatic?`<div class="full olt-ticket-context"><span class="olt-badge olt-auto-source">Otomatis LOS</span><span>Terdeteksi ${time(ticket.losDetection?.firstDetectedAt)}</span>${ticket.losDetection?.recoveredAt?`<span>Online kembali ${time(ticket.losDetection.recoveredAt)}</span>`:''}</div>`:'')+
      (generic?'':`<label class="full">OLT<select name="oltId" required ${automatic?'disabled':''}>${options(payload.devices,ticket.oltId || ticketView.oltId,'Pilih OLT')}</select>${automatic?`<input type="hidden" name="oltId" value="${esc(ticket.oltId)}">`:''}</label>`)+
      field('Judul','title',ticket.title,'required maxlength="160"')+`<label>Status<select name="status" ${unclaimed?'disabled':''}>${['new','assigned','working','resolved'].map(key=>`<option value="${key}" ${(ticket.status||'new')===key?'selected':''}>${labels[key]}</option>`).join('')}</select></label>`+
      (generic?'':field('Port PON','pon',ticket.pon,'maxlength="24" placeholder="0/0/1" '+(automatic?'readonly':''))+field('Serial ONU','serialNumber',ticket.serialNumber,'maxlength="16" '+(automatic?'readonly':'')))+
      `<label class="full">Petugas<select name="assignedTo" ${unclaimed?'disabled':''}>${options(technicians,ticket.assignedTo,'Belum diambil')}</select></label>`+(generic?'<label class="full">Keterangan untuk Pelanggan<textarea name="publicNote" maxlength="300" rows="3"></textarea></label><details class="full"><summary>Catatan privat petugas</summary>':'')+`<label class="full">Catatan Internal<textarea name="description" maxlength="1500">${esc(ticket.description || '')}</textarea></label>`+(generic?'</details>':'')+modalActions(),
      async data=>{await context.api('/api/monitoring/olt/tickets'+(ticket.id?'/'+encodeURIComponent(ticket.id):''),{method:ticket.id?'PUT':'POST',body:JSON.stringify(data)});await loadTicketRows();context.setToast('Tiket tersimpan');});
  }
  async function serviceRequestForm(){
    try{
      const initial=await context.api('/api/monitoring/olt/service-options');if(!active())return;
      const customers=new Map(initial.customers.map(row=>[row.id,row]));
      openForm('Buat Tiket Layanan',`<label class="full">Pelanggan terdaftar (opsional)<input type="search" id="serviceCustomerSearch" placeholder="Cari nama / akun pelanggan" maxlength="100" autocomplete="off"><select name="customerId" id="serviceCustomer">${options(initial.customers,'','Pemohon baru / belum terdaftar')}</select></label><label class="full">Kategori<select name="category" required>${(payload.categories||[]).map(row=>`<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>${field('Nama Pemohon','customerName','','required maxlength="100"')}${field('Nomor Kontak','phone','','inputmode="tel" maxlength="24"')}<label class="full">Alamat / Lokasi<textarea name="address" maxlength="500" rows="2"></textarea></label><label class="full">Keterangan<textarea name="text" maxlength="1500" required rows="3"></textarea></label><details class="full"><summary>Lokasi peta (opsional)</summary>${field('Titik koordinat','coordinates','','placeholder="-0.50, 117.15" maxlength="60"')}</details>`+modalActions('Buat Tiket'),async data=>{await context.api('/api/monitoring/olt/tickets',{method:'POST',body:JSON.stringify(data)});Object.assign(ticketView,{bucket:'open',status:'',kind:'',nasId:'',oltId:'',scope:'',pon:'',search:'',page:1});await render();context.setToast('Tiket layanan dibuat');});
      $('serviceCustomer').addEventListener('change',event=>{const row=customers.get(event.target.value),form=event.target.form;for(const [field,value]of [['customerName',row?.name],['phone',row?.phone],['address',row?.address],['coordinates',row?.coordinates?row.coordinates.latitude+', '+row.coordinates.longitude:'']]){form.elements[field].value=value||'';form.elements[field].readOnly=Boolean(row);}});
      let timer,revision=0;$('serviceCustomerSearch').addEventListener('input',event=>{const search=event.target.value,token=++revision;clearTimeout(timer);timer=setTimeout(async()=>{try{const result=await context.api('/api/monitoring/olt/service-options?'+new URLSearchParams({search}));if(token!==revision||!$('serviceCustomer'))return;const selected=$('serviceCustomer').value;result.customers.forEach(row=>customers.set(row.id,row));const rows=result.customers.slice();if(selected&&!rows.some(row=>row.id===selected))rows.unshift(customers.get(selected));$('serviceCustomer').innerHTML=options(rows.filter(Boolean),selected,'Pemohon baru / belum terdaftar');}catch(error){if($('oltModalError'))$('oltModalError').textContent=error.message;}},250);});
    }catch(error){notice(error.message);}
  }
  function progressForm(ticket) {
    const writable=context.can('olt:tickets:write')&&ticket.status!=='resolved'&&ticket.assignedTo&&(ticket.assignedTo===context.user?.id||coordinator());
    const service=ticket.scope==='service';
    const currentStage=ticket.progress?.at(-1)?.stage,selectedStage=serviceStages.some(([id])=>id===currentStage)?currentStage:'handling';
    const history=[...(ticket.history||[])].reverse().slice(0,20).map(row=>`<div><strong>${esc(row.userName)} <span>${time(row.at)}</span></strong><p>${esc(row.note)}</p>${row.publicNote?`<p>Untuk pelanggan: ${esc(row.publicNote)}</p>`:''}<small>${esc(labels[row.status]||row.status)}</small></div>`).join('');
    openForm(service?'Detail Laporan':'Detail Tiket',`<div class="full olt-delete-info"><strong>${esc(ticket.number)}</strong><span>${esc(ticket.title)}</span><span>${esc(payload.technicians.find(row=>row.id===ticket.assignedTo)?.name||'Belum ditugaskan')}</span></div>${serviceContact(ticket)}${service?serviceReport(ticket):''}${writable?(service?`<label class="full">Perbarui Status<select name="stage">${serviceStages.map(([id,label])=>`<option value="${id}" ${id===selectedStage?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label class="full">Keterangan untuk Pelanggan<textarea name="publicNote" maxlength="300" rows="3"></textarea></label><details class="full"><summary>Catatan privat petugas</summary><label>Catatan internal (opsional)<textarea name="note" maxlength="1000" rows="2"></textarea></label></details>`:`<label class="full">Status<select name="status"><option value="working">Dikerjakan</option><option value="resolved">Selesai</option></select></label><label class="full">Catatan Progres Internal<textarea name="note" maxlength="1000" required></textarea></label>`):''}<details class="full olt-ticket-history"><summary>Riwayat Petugas</summary>${history||'<p>Belum ada catatan penanganan.</p>'}</details>${writable?modalActions('Simpan Progres'):'<div class="modal-actions full"><button type="button" class="ghost-button" data-close-modal>Tutup</button></div>'}`,async data=>{await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id)+'/progress',{method:'POST',body:JSON.stringify(data)});await loadTicketRows();context.setToast('Progres tiket tersimpan');});
  }
  function serviceReport(ticket){const first=ticket.messages?.[0],latest=(ticket.messages||[]).findLast(row=>row.role==='customer');return first?`<div class="full olt-report"><strong>${first.role==='customer'?'Laporan Pelanggan':'Keterangan Permintaan'}</strong><p>${esc(first.text)}</p>${latest&&latest.id!==first.id?`<small>Pesan terbaru pelanggan</small><p>${esc(latest.text)}</p>`:''}</div>`:'';}
  function serviceContact(ticket){return `<div class="full olt-delete-info">${ticket.customerId?'':`<strong>${esc(ticket.customerName||'Pemohon')}</strong>`}<span>${esc(ticket.contactPhone||'Kontak belum dilengkapi')}</span><span>${esc(ticket.contactAddress||'Alamat belum dilengkapi')}</span>${ticket.locationUrl?`<a href="${esc(ticket.locationUrl)}" target="_blank" rel="noopener noreferrer">Buka arah pelanggan</a>`:'<span>Lokasi peta belum dilengkapi</span>'}</div>`;}
  function networkFields(data={}){
    const states={active:'Aktif',isolated:'Isolir',suspend:'Isolir',terminated:'Terminated',disabled:'Nonaktif',inactive:'Nonaktif'};
    const fields=[
      ['Pelanggan',esc(data.customer?.name||'-')+(data.customer?.memberId?`<small>ID ${esc(data.customer.memberId)}</small>`:'')],
      ['Akun Internet',esc(data.account?.username||'-')+(data.account?.status?`<small>${esc(states[data.account.status]||data.account.status)}${data.account.type?' / '+esc(data.account.type.toUpperCase()):''}</small>`:'')],
      ['Modem / SN',esc(data.modem?.serialNumber||'-')+(data.modem?.model?`<small>${esc(data.modem.model)}</small>`:'')],
      ['OLT',esc(data.network?.olt||'-')],['PON',esc(data.network?.pon||'-')],['ODP',esc(data.network?.odp||'-')]
    ],render=rows=>rows.map(([label,value])=>`<dt>${label}</dt><dd>${value}</dd>`).join('');
    return `<dl>${render(fields.slice(0,2))}</dl><details class="olt-network-extra"><summary>Modem dan Jaringan</summary><dl>${render(fields.slice(2))}</dl></details>`;
  }
  function attachTicketNetwork(ticket){
    const form=document.querySelector('#modal .olt-form');if(!form)return;
    const block=document.createElement('section');block.className='full olt-ticket-network';block.dataset.ticketNetwork=ticket.id;block.innerHTML=networkFields();
    const heading=form.querySelector('.olt-delete-info');if(heading)heading.after(block);else form.prepend(block);
    context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id)+'/network').then(result=>{if(block.isConnected)block.innerHTML=networkFields(result.context);}).catch(()=>{});
  }
  function conversationMessages(ticket) {
    const endpoint='/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id);
    return (ticket.messages||[]).map(row=>{
      const customer=row.role==='customer',name=customer?ticket.customerName||row.name||'Pelanggan':row.name||'Petugas';
      return `<article class="olt-conversation-entry ${customer?'customer':'staff'}"><header><strong>${esc(name)}</strong><small>${customer?'Pelanggan':'Petugas'} / ${esc(time(row.at))}</small></header><p>${esc(row.text)}</p>${row.photos?.length?`<div class="olt-conversation-photos">${row.photos.map(photo=>{const url=endpoint+'/photos/'+encodeURIComponent(photo.id);return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('Foto dari '+name)}"><img src="${esc(url)}" alt="${esc('Foto dari '+name)}" loading="lazy" width="144" height="108"></a>`;}).join('')}</div>`:''}</article>`;
    }).join('')||'<p class="olt-conversation-empty">Belum ada percakapan pelanggan.</p>';
  }
  function conversationForm(detail) {
    const ticket=detail.ticket;if(ticket.scope!=='service')return;
    const writable=detail.canProgress&&ticket.assignedTo&&ticket.status!=='resolved';
    openForm('Percakapan Pelanggan',`<div class="full olt-delete-info"><strong>${esc(ticket.number)}</strong><span>${esc(ticket.title)}</span></div>${serviceContact(ticket)}<div class="full olt-conversation" id="oltConversation" role="log" aria-label="Percakapan pelanggan" aria-live="polite">${conversationMessages(ticket)}</div>${writable?'<label class="full">Balasan ke Pelanggan<textarea name="text" id="oltReply" maxlength="1500" rows="3" required></textarea></label>':`<p class="full olt-conversation-empty">${ticket.status==='resolved'?'Tiket telah selesai.':!ticket.assignedTo?'Menunggu tiket diambil.':'Tiket ditangani petugas lain.'}</p>`}${writable?modalActions('Kirim Balasan'):'<div class="modal-actions full"><button type="button" class="ghost-button" data-close-modal>Tutup</button></div>'}`,async data=>{
      const text=String(data.text||'').trim();if(!text)throw new Error('Tuliskan balasan terlebih dahulu');
      const reply=$('oltReply'),thread=$('oltConversation'),error=$('oltModalError');
      const result=await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id)+'/messages',{method:'POST',body:JSON.stringify({text})});
      if(thread.isConnected){thread.innerHTML=conversationMessages(result.ticket);thread.scrollTop=thread.scrollHeight;reply.value='';if(error)error.textContent='';reply.focus();}
      await loadTicketRows();context.setToast('Balasan terkirim');return false;
    });
    attachTicketNetwork(ticket);
    const thread=$('oltConversation');thread.scrollTop=thread.scrollHeight;
  }
  function templatesForm() {
    const settings=payload.ticketSettings||{},roles={technician:'Teknisi',secretary:'Sekretaris',admin:'Admin',owner:'Owner',noc:'NOC'};
    openForm('Pengaturan Tiket',`<label class="full olt-check"><input type="checkbox" name="whatsappEnabled" ${settings.whatsappEnabled?'checked':''}>Aktifkan notifikasi WhatsApp</label><div class="full olt-message-state">${settings.gatewayEnabled?'Gateway WhatsApp billing aktif':'Gateway WhatsApp billing nonaktif'}</div><fieldset class="full olt-recipients"><legend>Penerima Tiket Baru</legend>${(payload.ticketRecipientOptions||[]).map(user=>`<label class="olt-check"><input type="checkbox" name="recipientIds" value="${esc(user.id)}" ${(settings.recipientIds||[]).includes(user.id)?'checked':''} ${user.phone?'':'disabled'}><span><strong>${esc(user.name)}</strong><small>${esc(roles[user.role]||user.role)} · ${esc(user.phone||'Nomor WhatsApp belum diisi')}</small></span></label>`).join('')}</fieldset>`+Object.entries({detected:'Tiket Baru',resolved:'Selesai - Petugas Tiket'}).map(([key,label])=>`<label class="full">${label}<textarea name="${key}" maxlength="2400" rows="7">${esc(payload.ticketTemplates?.[key]||'')}</textarea></label>`).join('')+modalActions(),async(data,form)=>{const templates=Object.fromEntries(['detected','resolved'].map(key=>[key,data[key]]));await context.api('/api/monitoring/olt/ticket-settings',{method:'PUT',body:JSON.stringify({templates,whatsappEnabled:form.elements.whatsappEnabled.checked,recipientIds:new FormData(form).getAll('recipientIds')})});await render();context.setToast('Pengaturan tiket tersimpan');});
  }
  async function messageForm(ticket) {
    const renderToken=generation,owner=context;
    const endpoint='/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id)+'/message',initialKind=ticket.status==='resolved'?'resolved':'detected';const result=await context.api(endpoint+'?kind='+initialKind);
    if(!active()||context!==owner||generation!==renderToken)return;
    const sendAllowed=kind=>result.whatsappEnabled&&(kind==='detected'?ticket.status==='new'&&!ticket.assignedTo:ticket.status==='resolved'&&Boolean(ticket.assignedTo));
    openForm('Pratinjau WhatsApp',`<label class="full">Pesan<select id="oltMessageKind"><option value="detected" ${initialKind==='detected'?'selected':''}>Tiket Baru</option><option value="resolved" ${initialKind==='resolved'?'selected':''}>Selesai - Petugas Tiket</option></select></label><label class="full">${esc(ticket.number)}<textarea id="oltMessageText" rows="12" readonly>${esc(result.message)}</textarea></label><div class="full olt-message-state"><span class="olt-badge">WhatsApp ${result.whatsappEnabled?'aktif':'nonaktif'}</span></div><p class="full olt-modal-error" id="oltModalError" role="alert"></p><div class="modal-actions full"><button type="button" class="ghost-button" data-close-modal>Tutup</button><button type="button" class="ghost-button" id="oltCopyMessage">Salin Pesan</button>${context.can('olt:manage')?`<button type="button" class="button" id="oltSendMessage" ${sendAllowed(initialKind)?'':'disabled'}>Kirim Pesan</button>`:''}</div>`,async()=>false);
    let sequence=0;$('oltMessageKind').addEventListener('change',async event=>{const token=++sequence;if($('oltSendMessage'))$('oltSendMessage').disabled=true;try{const next=await context.api(endpoint+'?'+new URLSearchParams({kind:event.target.value}));if(token===sequence&&$('oltMessageText')){$('oltMessageText').value=next.message;if($('oltSendMessage'))$('oltSendMessage').disabled=!sendAllowed(event.target.value);}}catch(error){if($('oltModalError'))$('oltModalError').textContent=error.message;}});
    $('oltCopyMessage').addEventListener('click',async()=>{try{await context.copyTextToClipboard($('oltMessageText').value);context.setToast('Pesan tiket disalin');}catch(error){$('oltModalError').textContent=error.message;}});
    $('oltSendMessage')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const response=await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(ticket.id)+'/notify',{method:'POST',body:JSON.stringify({kind:$('oltMessageKind').value})});$('oltModalError').textContent='';context.setToast(response.queued?response.queued+' pesan tiket diantrikan':response.reason||'Tidak ada pesan baru untuk diantrikan');}catch(error){if($('oltModalError'))$('oltModalError').textContent=error.message;}finally{if(button.isConnected)button.disabled=!sendAllowed($('oltMessageKind').value);}});
  }
  function deleteOnuForm(onu) {
    const endpoint=`/api/monitoring/olt/${encodeURIComponent(onu.oltId)}/onus/${encodeURIComponent(onu.serialNumber)}`;
    let preview=null,busy=false,finished=false,sequence=0;
    openForm('Hapus ONU',`<section class="full olt-delete-panel" id="oltDeletePanel"><div class="olt-delete-info"><strong>${esc(onu.serialNumber)}</strong><span>${esc(onu.name||'-')} · ${esc(onu.oltName)}</span><span>PON ${esc(onu.ponKey)} · ONU ${esc(onu.onuId)}</span></div><p class="olt-delete-warning" id="oltDeleteMode">Memeriksa OLT dan pengaturan integrasi...</p><div class="olt-delete-stages" id="oltDeleteStages" aria-live="polite"></div><p class="olt-delete-message" id="oltDeleteMessage" role="status"></p><label>Ketik serial ONU untuk konfirmasi<input name="serialNumber" required autocomplete="off" maxlength="16"></label><label class="olt-check"><input type="checkbox" name="confirmDelete" required>Saya memahami dampak penghapusan perangkat ini.</label><p class="olt-modal-error" id="oltModalError" role="alert"></p><div class="modal-actions"><button type="button" class="ghost-button" data-close-modal>Tutup</button><button type="button" class="ghost-button" id="oltDeleteRefresh">Periksa Ulang</button><button type="button" class="button danger" id="oltDeleteConfirm" disabled>Hapus</button></div></section>`,async()=>false);
    const panel=$('oltDeletePanel'),form=panel.closest('form'),confirm=panel.querySelector('#oltDeleteConfirm'),refresh=panel.querySelector('#oltDeleteRefresh');
    const present=()=>panel.isConnected&&panel.closest('dialog')?.open&&active();
    const sync=()=>{confirm.disabled=busy||finished||!preview?.canSubmit;confirm.hidden=finished;refresh.disabled=busy;refresh.hidden=finished;for(const label of panel.querySelectorAll(':scope > label'))label.hidden=finished;panel.setAttribute('aria-busy',String(busy));};
    const show=reply=>{
      panel.querySelector('#oltDeleteStages').innerHTML=[['OLT',reply.olt],['ACS',reply.acs]].map(([name,item])=>`<div class="olt-delete-stage"><strong>${name}</strong><span class="olt-delete-state ${esc(item?.state||'unknown')}">${esc(item?.label||'Belum diperiksa')}</span>${item?.reason?`<small>${esc(item.reason)}</small>`:''}</div>`).join('');
      panel.querySelector('#oltDeleteMode').textContent=reply.cascade?'OLT → ACS. Data member, invoice, pembayaran dan tiket tetap tersimpan.':'OLT saja. Data ACS dan billing tetap tersimpan.';
    };
    const check=async()=>{
      if(busy||!present())return;const token=++sequence;busy=true;preview=null;sync();panel.querySelector('#oltModalError').textContent='';
      panel.querySelector('#oltDeleteMessage').textContent='Memeriksa status perangkat...';
      try{
        const reply=await context.api(endpoint+'/deletion?'+new URLSearchParams({onuIndex:onu.id}),{timeoutMs:60000});
        if(!present()||token!==sequence)return;preview=reply;show(reply);confirm.textContent=reply.olt?.state==='missing'&&reply.acs?.state==='ready'?'Hapus ACS':'Hapus';
        panel.querySelector('#oltDeleteMessage').textContent=reply.simulated?'Mode simulasi: tidak ada penghapusan perangkat asli.':reply.canSubmit?'Periksa SN sebelum melanjutkan.':reply.olt?.reason||reply.acs?.reason||'Tidak ada data yang dapat dihapus.';
      }catch(error){if(present())panel.querySelector('#oltModalError').textContent=error.message;}
      finally{busy=false;if(present())sync();}
    };
    refresh.addEventListener('click',check);
    confirm.addEventListener('click',async()=>{
      if(busy||finished||!preview?.canSubmit||!present()||!form.reportValidity())return;
      busy=true;sync();panel.querySelector('#oltModalError').textContent='';panel.querySelector('#oltDeleteMessage').textContent='Memproses OLT, lalu memverifikasi ACS...';
      try{
        const reply=await context.api(endpoint,{method:'DELETE',timeoutMs:90000,body:JSON.stringify({serialNumber:form.elements.serialNumber.value,onuIndex:onu.id,confirmDelete:form.elements.confirmDelete.checked,token:preview.token})});
        if(!present())return;show(reply);preview=null;finished=reply.complete&&!reply.canRetry;panel.querySelector('#oltDeleteMessage').textContent=reply.message;
        await loadDetails();
      }catch(error){if(present()){preview=null;panel.querySelector('#oltModalError').textContent=error.message;panel.querySelector('#oltDeleteMessage').textContent='Periksa ulang status sebelum melanjutkan. Jangan mengulang tanpa verifikasi.';}}
      finally{busy=false;if(present())sync();}
    });
    check();
  }
  async function onClick(event) {
    const clickContext=context,renderToken=generation,buttonEl=event.target.closest('[data-olt-action]');
    if(buttonEl?.disabled)return;
    if(buttonEl)buttonEl.disabled=true;
    try {
    const ticketState=event.target.closest('[data-ticket-bucket]'),ticketPage=event.target.closest('[data-ticket-page]');
    if(ticketState){ticketView.bucket=ticketState.dataset.ticketBucket;ticketView.status='';$('ticketStatus').value='';ticketView.page=1;return loadTicketRows();}
    if(ticketPage){ticketView.page+=Number(ticketPage.dataset.ticketPage);return loadTicketRows();}
    if(event.target.closest('[data-clear-ticket-pon]')){ticketView.pon='';event.target.closest('.olt-ticket-pon').remove();return loadTicketRows();}
    const state=event.target.closest('[data-olt-state]'),pon=event.target.closest('[data-olt-pon]');
    if(state||pon){view.deviceId=(state||pon).dataset.olt||'all';view.status=state?.dataset.oltState||'';view.pon=pon?.dataset.oltPon||'';view.page=1;view.search='';view.tab='onus';return await render();}
    const tab=event.target.closest('[data-olt-tab]');if(tab){view.tab=tab.dataset.oltTab;return await render();}
    if(!buttonEl)return;
    const action=buttonEl.dataset.oltAction,id=buttonEl.dataset.id,row=payload.devices.find(row=>row.id===id);
      if(action==='reload')return await (context.mode==='tickets'?loadTicketRows():render());
      if(action==='summary'){view.tab='devices';view.pon='';latestDetails=null;return await render();}
      if(action==='refresh-all'){const reply=await context.api('/api/monitoring/olt/refresh',{method:'POST',body:'{}'});if(!active()||context!==clickContext)return;await render();if(!active()||context!==clickContext)return;notice(reply.queued?`${reply.queued} OLT dijadwalkan untuk dibaca bergiliran.`:'Pembacaan sedang berjalan atau baru diperbarui.');followRefresh();return;}
      if(action==='detail'){view.deviceId=id;view.tab='onus';view.pon='';view.page=1;return await render();}
      if(action==='edit')return await deviceForm(row);
      if(action==='save-config'){
        return openForm('Simpan Config OLT',`<div class="full olt-delete-info"><strong>${esc(row.name)}</strong><span>${esc(row.host||'')}</span></div><p class="full olt-delete-warning">Menyimpan seluruh konfigurasi berjalan OLT ke penyimpanan permanen. Pastikan perubahan perangkat sudah benar. Aksi ini tidak melakukan reboot dan tidak menyimpan data billing.</p>${field('Ketik nama OLT untuk konfirmasi','confirmName','','required autocomplete="off" maxlength="100"')}<label class="full olt-check"><input type="checkbox" name="confirmSave" required>Simpan konfigurasi OLT ini</label><p class="full" id="oltSaveResult" role="status"></p>`+modalActions('Simpan Config'),async(data,form)=>{
          const result=await context.api('/api/monitoring/olt/'+encodeURIComponent(row.id)+'/save-config',{method:'POST',timeoutMs:45000,body:JSON.stringify({confirmId:row.id,confirmName:data.confirmName,confirmSave:form.elements.confirmSave.checked,revision:row.revision})});const block=form.querySelector('#oltSaveResult');if(block.isConnected){block.textContent=result.message;block.className='full '+(result.confirmed?'olt-test-ok':'olt-test-failed');for(const button of form.querySelectorAll('button[type=submit]'))button.hidden=true;for(const label of form.querySelectorAll('.olt-form>label'))label.hidden=true;}return false;
        });
      }
      if(action==='delete')return openForm('Hapus Integrasi OLT',`<p class="full"><strong>${esc(row.name)}</strong></p><p class="full olt-delete-warning">Hanya menghapus koneksi monitoring OLT ini dari billing. ONU di perangkat OLT, ACS, member, invoice dan pembayaran tidak dihapus. OLT yang memiliki riwayat tiket tidak dapat dihapus; nonaktifkan monitoring saja.</p>${field('Ketik nama OLT untuk konfirmasi','confirmName','','required autocomplete="off" maxlength="100"')}<label class="full olt-check"><input type="checkbox" name="confirmDelete" required>Hapus integrasi monitoring OLT ini</label>`+modalActions('Hapus'),async(data,form)=>{await context.api('/api/monitoring/olt/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({confirmId:id,confirmName:data.confirmName,confirmDelete:form.elements.confirmDelete.checked})});view.deviceId='all';await render();context.setToast('Integrasi OLT dihapus; data pelanggan tetap tersimpan');});
      if(action==='refresh'){
        buttonEl.disabled=true;const reply=await context.api('/api/monitoring/olt/'+encodeURIComponent(id)+'/refresh',{method:'POST',body:'{}'});notice(reply.queued?'Pembacaan SNMP dijadwalkan.':'Pembacaan sedang berjalan atau baru diperbarui.');
        followRefresh();return;
      }
      if(action==='edit-ticket'){const detail=await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(id));if(active()&&context===clickContext&&generation===renderToken&&context.mode==='tickets'){ticketForm(detail.ticket);attachTicketNetwork(detail.ticket);}return;}
      if(action==='templates')return templatesForm();
      if(action==='progress-ticket'||action==='detail-ticket'){const detail=await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(id));if(active()&&context===clickContext&&generation===renderToken&&context.mode==='tickets'){progressForm(detail.ticket);attachTicketNetwork(detail.ticket);}return;}
      if(action==='conversation-ticket'){const detail=await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(id));if(active()&&context===clickContext&&generation===renderToken&&context.mode==='tickets')return conversationForm(detail);return;}
      if(action==='message-ticket')return await messageForm(payload.tickets.find(ticket=>ticket.id===id));
      if(action==='claim-ticket'){await context.api('/api/monitoring/olt/tickets/'+encodeURIComponent(id)+'/claim',{method:'POST',body:'{}'});if(!active()||context!==clickContext||generation!==renderToken)return;await loadTicketRows();return context.setToast('Tiket berhasil diambil');}
      if(action==='ticket-onu'){const ticket=payload.tickets.find(row=>row.id===id);if(!ticket||ticket.scope==='service')return;requestedOnuView={deviceId:ticket.oltId,nasId:'',search:ticket.serialNumber||'',pon:ticket.serialNumber?'':ticket.pon||'',status:'',page:1,tab:'onus'};return context.navigate('monitoringOlt');}
      if(action==='copy-ticket'){
        const ticket=payload.tickets.find(row=>row.id===id),device=payload.devices.find(row=>row.id===ticket.oltId);
        await context.copyTextToClipboard([`Tiket ${ticket.number}`,ticket.title,`OLT: ${device?.name || '-'}`,ticket.pon?`PON: ${ticket.pon}`:'',ticket.serialNumber?`ONU: ${ticket.serialNumber}`:'',`Status: ${labels[ticket.status]}`,ticket.description].filter(Boolean).join('\n'));context.setToast('Pesan tiket disalin');return;
      }
      const onu=latestDetails?.onus.find(row=>row.id===id&&row.oltId===buttonEl.dataset.olt);
      if(action==='rename-onu'&&onu){
        buttonEl.disabled=true;const existing=await context.api(`/api/monitoring/olt/${encodeURIComponent(onu.oltId)}/onus/${encodeURIComponent(onu.serialNumber)}/description?${new URLSearchParams({onuIndex:onu.id})}`);
        if(!active()||context!==clickContext||generation!==renderToken)return;
        return openForm('Edit Description',`<label class="full">Description<input name="description" value="${esc(existing.description)}" required maxlength="${existing.maxLength===30?30:64}" autocomplete="off"></label>`+modalActions('Simpan'),async data=>{
        const reply=await context.api(`/api/monitoring/olt/${encodeURIComponent(onu.oltId)}/onus/${encodeURIComponent(onu.serialNumber)}/description`,{method:'PUT',body:JSON.stringify({description:data.description,previousDescription:existing.description,serialNumber:onu.serialNumber,onuIndex:onu.id})});
        await loadDetails();context.setToast(reply.message);
      });}
      if(action==='link'&&onu)return await linkForm(onu);
      if(action==='reboot-onu'&&onu)return openForm('Reboot ONU',`<div class="full olt-delete-info"><strong>${esc(onu.serialNumber)}</strong><span>${esc(onu.name||'-')} · ${esc(onu.oltName)}</span><span>PON ${esc(onu.ponKey)} · ONU ${esc(onu.onuId)}</span></div><p class="full">Koneksi pelanggan akan terputus sementara. Konfigurasi ONU dan data billing tidak dihapus. Tiket gangguan otomatis dijeda maksimal 5 menit.</p><label class="full olt-check"><input type="checkbox" name="confirmReboot" required>Konfirmasi reboot perangkat ini</label>`+modalActions('Reboot'),async(data,form)=>{const reply=await context.api(`/api/monitoring/olt/${encodeURIComponent(onu.oltId)}/onus/${encodeURIComponent(onu.serialNumber)}/reboot`,{method:'POST',body:JSON.stringify({serialNumber:onu.serialNumber,onuIndex:onu.id,confirmReboot:form.elements.confirmReboot.checked})});await loadDetails();context.setToast(reply.message);});
      if(action==='delete-onu'&&onu){const device=payload.devices.find(row=>row.id===onu.oltId);if(!device?.onuDeleteAvailable)return notice('Penghapusan ONU belum tersedia untuk perangkat atau akses ini.');return deleteOnuForm(onu);}
    }catch(error){if(active()&&context===clickContext)notice(error.message);}finally{if(buttonEl?.isConnected)buttonEl.disabled=false;}
  }
  window.FakenetOltUI={render};
})();
