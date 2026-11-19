(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const states={online:'Online',los:'Masih LOS','power-off':'Tidak mendapat daya',unknown:'Belum terverifikasi'};
  const number=value=>new Intl.NumberFormat('id-ID').format(Number.isFinite(Number(value))?Math.max(0,Number(value)):0);
  function kind(ticket={}){
    if(['none','device','affected'].includes(ticket.contextKind))return ticket.contextKind;
    if(ticket.kind==='request')return'none';
    if(['odp','odc','pon'].includes(ticket.scope)&&!ticket.serialNumber)return'affected';
    if(ticket.scope==='service')return ['wifiku','staff-service'].includes(ticket.source)&&['internet-down','internet-slow','wifi-modem','addon-fault','other-fault'].includes(ticket.category)?'device':'none';
    return ticket.scope==='onu'||ticket.serialNumber?'device':'none';
  }
  function device(data,date){
    const status={active:'Aktif',isolated:'Isolir',suspend:'Isolir',terminated:'Terminated',disabled:'Nonaktif',inactive:'Nonaktif'};
    const fields=[['Pelanggan',esc(data.customer?.name||'-')+(data.customer?.memberId?`<small>ID ${esc(data.customer.memberId)}</small>`:'')],
      ['Akun Internet',esc(data.account?.username||'-')+(data.account?.status?`<small>${esc(status[data.account.status]||data.account.status)}${data.account.type?' / '+esc(data.account.type.toUpperCase()):''}</small>`:'')],
      ['Modem / SN',esc(data.modem?.serialNumber||'-')+(data.modem?.model?`<small>${esc(data.modem.model)}</small>`:'')],
      ['OLT',esc(data.network?.olt||'-')],['PON',esc(data.network?.pon||'-')],['ODP',esc(data.network?.odp||'-')]];
    const optical=data.network?.optical,known=typeof optical?.rxPower==='number'&&Number.isFinite(optical.rxPower),source=['OLT','ACS'].includes(optical?.source)?optical.source:'';
    const reading=known?`${esc(new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(optical.rxPower))} dBm<small>${esc([source,optical.at?'Tercatat '+date(optical.at):'Waktu pembacaan belum tersedia'].filter(Boolean).join(' · '))}</small>`:'Belum tersedia';
    const render=rows=>rows.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${value}</dd>`).join('');
    return`<dl>${render(fields.slice(0,2))}${render([['Redaman terakhir',reading]])}</dl><details class="network-extra"><summary>Modem dan Jaringan</summary><dl>${render(fields.slice(2))}</dl></details>`;
  }
  function affected(data){
    const list=data.affected||{},recovery=data.recovery,rows=list.rows||[];
    const progress=recovery?.available?`<p class="ticket-context-recovery ${recovery.ready?'ready':''}">${recovery.ready?'Target pemulihan area tercapai':`Pemulihan area ${number(recovery.online)}/${number(recovery.eligible)} online · target ${number(recovery.threshold)}% per ODP`}</p>`:'';
    return`${progress}${!list.available?'<p class="ticket-context-muted">Status terbaru belum tersedia.</p>':''}<ul class="ticket-context-customers">${rows.map(row=>`<li><div><strong>${esc(row.name)}</strong>${row.memberId?`<small>ID ${esc(row.memberId)}</small>`:''}</div><span class="ticket-context-state ${Object.hasOwn(states,row.state)?row.state:'unknown'}">${esc(states[row.state]||states.unknown)}</span></li>`).join('')||'<li class="ticket-context-muted">Belum ada pelanggan terpetakan yang sesuai.</li>'}</ul>${list.unmappedConnections?`<p class="ticket-context-muted">${number(list.unmappedConnections)} koneksi terdampak belum terpetakan ke pelanggan.</p>`:''}${list.truncated?'<p class="ticket-context-muted">Daftar terdampak melebihi batas pembacaan.</p>':''}<div class="ticket-context-pages"><small>${number(list.total)} pelanggan · ${number(list.page||1)}/${number(list.pages||1)}</small><div><button type="button" data-context-page="${Number(list.page||1)-1}" title="Halaman sebelumnya" aria-label="Halaman sebelumnya" ${list.page<=1?'disabled':''}><img src="/olt-back.svg" alt=""></button><button type="button" data-context-page="${Number(list.page||1)+1}" title="Halaman berikutnya" aria-label="Halaman berikutnya" ${list.page>=list.pages?'disabled':''}><img class="next" src="/olt-back.svg" alt=""></button></div></div>`;
  }
  function mount(node,ticket,{api,date=value=>String(value||'-')}={}){
    const mode=kind(ticket);if(mode==='none'){node.remove();return;}
    node.classList.add('ticket-context');
    node.innerHTML=mode==='affected'?'<div class="ticket-context-heading"><strong>Pelanggan terdampak</strong><span data-context-count></span></div><label class="ticket-context-search">Cari pelanggan<input type="search" maxlength="100" placeholder="Nama / ID pelanggan" autocomplete="off" enterkeyhint="search"></label><div data-context-results role="status">Memuat pelanggan terdampak...</div><p class="ticket-context-error" role="alert"></p>':'<div data-context-results role="status">Memuat informasi layanan...</div><p class="ticket-context-error" role="alert"></p>';
    const results=node.querySelector('[data-context-results]'),error=node.querySelector('.ticket-context-error'),input=node.querySelector('input');let sequence=0,timer,page=1;
    async function load(nextPage=1){
      if(!node.isConnected)return;const token=++sequence;page=nextPage;
      node.querySelectorAll('[data-context-page]').forEach(button=>button.disabled=true);
      const query=mode==='affected'?'?'+new URLSearchParams({page:String(page),limit:'10',search:input.value.trim()}):'';
      try{const result=await api('/api/tickets/'+encodeURIComponent(ticket.id)+'/network'+query);if(token!==sequence||!node.isConnected)return;
        const data=result.context;if(data?.kind==='none'){node.remove();return;}
        if(data?.kind!==mode||mode==='affected'&&!Array.isArray(data.affected?.rows))throw new Error('Ringkasan tiket belum sesuai. Silakan muat ulang.');
        results.innerHTML=mode==='affected'?affected(data):device(data,date);error.textContent='';
        if(mode==='affected'){page=data.affected.page;node.querySelector('[data-context-count]').textContent=number(data.affected.mappedTotal);}
      }catch(failure){if(token!==sequence||!node.isConnected)return;error.innerHTML=`<span>${esc(failure.message||'Ringkasan tiket belum dapat dibaca.')}</span><button type="button" data-context-retry title="Coba kembali" aria-label="Coba kembali"><img src="/olt-refresh.svg" alt=""></button>`;if(results.textContent.startsWith('Memuat '))results.textContent='Ringkasan belum tersedia.';}
    }
    input?.addEventListener('input',()=>{sequence++;clearTimeout(timer);timer=setTimeout(()=>load(1),250);});
    input?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);load(1);}});
    node.addEventListener('click',event=>{const retry=event.target.closest('[data-context-retry]');if(retry&&node.contains(retry)){load(page);return;}const button=event.target.closest('[data-context-page]');if(button&&!button.disabled&&node.contains(button))load(Number(button.dataset.contextPage));});
    load();
  }
  window.FakenetTicketContext={kind,mount};
})();
