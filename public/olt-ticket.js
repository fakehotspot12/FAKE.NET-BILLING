(() => {
  'use strict';
  const $ = id => document.getElementById(id), id = new URLSearchParams(location.search).get('id') || '';
  const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  const endpoint = '/api/monitoring/olt/tickets/' + encodeURIComponent(id);
  const labels = { new:'Baru', assigned:'Diambil', working:'Dikerjakan', resolved:'Selesai' };
  const scopes = { onu:'ONU', pon:'PON / Area ODC', odp:'ODP', odc:'ODC', olt:'OLT', service:'Layanan pelanggan' };
  const stages=[['on-way','Petugas menuju lokasi'],['checking','Sedang diperiksa'],['handling','Sedang ditangani'],['waiting-customer','Menunggu konfirmasi pelanggan'],['resolved','Selesai']];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let csrf = '', zone = 'Asia/Makassar', busy = false;
  const date = value => { const parsed = new Date(value);return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('id-ID',{timeZone:zone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(parsed) : '-'; };
  function login() { location.replace('/?oltTicket=' + encodeURIComponent(id)); }
  function notice(message = '', error = false) { $('notice').textContent = message;$('notice').classList.toggle('error', error); }
  function networkFields(data={}){
    const states={active:'Aktif',isolated:'Isolir',suspend:'Isolir',terminated:'Terminated',disabled:'Nonaktif',inactive:'Nonaktif'};
    const fields=[
      ['Pelanggan',esc(data.customer?.name||'-')+(data.customer?.memberId?`<small>ID ${esc(data.customer.memberId)}</small>`:'')],
      ['Akun Internet',esc(data.account?.username||'-')+(data.account?.status?`<small>${esc(states[data.account.status]||data.account.status)}${data.account.type?' / '+esc(data.account.type.toUpperCase()):''}</small>`:'')],
      ['Modem / SN',esc(data.modem?.serialNumber||'-')+(data.modem?.model?`<small>${esc(data.modem.model)}</small>`:'')],
      ['OLT',esc(data.network?.olt||'-')],['PON',esc(data.network?.pon||'-')],['ODP',esc(data.network?.odp||'-')]
    ],render=rows=>rows.map(([label,value])=>`<dt>${label}</dt><dd>${value}</dd>`).join('');
    return `<dl>${render(fields.slice(0,2))}</dl><details class="network-extra"><summary>Modem dan Jaringan</summary><dl>${render(fields.slice(2))}</dl></details>`;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { cache:'no-store', credentials:'same-origin', ...options,
      headers:{'Content-Type':'application/json','x-csrf-token':csrf,...options.headers} });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 423) { login();throw new Error('Silakan login kembali'); }
    if (!response.ok) throw new Error(body.error || 'Tiket tidak dapat diakses');
    return body;
  }
  async function render() {
    const payload = await api(endpoint), t = payload.ticket;
    const generic = t.scope === 'service';
    const currentStage=t.progress?.at(-1)?.stage,selectedStage=stages.some(([id])=>id===currentStage)?currentStage:'handling';
    const shownStatus=generic?(currentStage==='customer-replied'?'Balasan pelanggan diterima':stages.find(([id])=>id===currentStage)?.[1]||labels[t.status]||t.status):(labels[t.status]||t.status);
    const details = generic ? [['Jenis',t.kind==='request'?'Permintaan':'Gangguan'],['Sumber',t.source==='wifiku'?'WifiKu':'Petugas']] : [['Lingkup',scopes[t.scope] || 'ONU']];
    details.push(['Pelanggan',t.customerName||'-'],['Kontak',t.contactPhone||'-'],['Alamat',t.contactAddress||'-']);
    details.push(['Petugas',payload.assignee || 'Belum diambil'],['Diperbarui',date(t.updatedAt)]);
    $('ticket').innerHTML = `<h1>${esc(t.number)}</h1><p>${esc(t.title)}</p><span class="badge ${esc(t.status)}">${esc(shownStatus)}</span>${t.autoResolved?'<p class="done">Ditutup otomatis setelah ONU terkonfirmasi online.</p>':''}${generic&&t.messages?.[0]?`<div class="report-excerpt"><strong>Laporan Pelanggan</strong><p>${esc(t.messages[0].text)}</p></div>`:''}<dl>${details.map(([label,value])=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl><div id="networkDetails" class="network-details">${networkFields()}</div>${t.locationUrl?`<a href="${esc(t.locationUrl)}" target="_blank" rel="noopener noreferrer">Buka arah pelanggan</a>`:''}${t.description?`<details class="private-notes"><summary>Catatan Internal</summary><p>${esc(t.description)}</p></details>`:''}`;
    const network=$('networkDetails');api(endpoint+'/network').then(result=>{if(network.isConnected)network.innerHTML=networkFields(result.context);}).catch(()=>{});
    $('ticket').hidden = false;
    $('conversation').hidden = !generic;
    if (generic) {
      const writable = payload.canProgress && t.assignedTo && t.status !== 'resolved';
      $('conversation').innerHTML = `<h2>Percakapan Pelanggan</h2><div id="messages" class="conversation-messages" role="log" aria-label="Percakapan pelanggan" aria-live="polite">${(t.messages || []).map(row => {
        const customer = row.role === 'customer', name = customer ? t.customerName || row.name || 'Pelanggan' : row.name || 'Petugas';
        return `<article class="message ${customer?'customer':'staff'}"><div class="message-meta"><strong>${esc(name)}</strong><small>${customer?'Pelanggan':'Petugas'} / ${esc(date(row.at))}</small></div><p>${esc(row.text)}</p>${row.photos?.length?`<div class="message-photos">${row.photos.map(photo => {
          const url = endpoint + '/photos/' + encodeURIComponent(photo.id);
          return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc('Foto dari '+name)}"><img src="${esc(url)}" alt="${esc('Foto dari '+name)}" loading="lazy" width="144" height="108"></a>`;
        }).join('')}</div>`:''}</article>`;
      }).join('') || '<p class="signal">Belum ada percakapan pelanggan.</p>'}</div>${writable?'<form id="reply"><label>Balasan ke Pelanggan<textarea name="text" maxlength="1500" rows="3" required></textarea></label><button type="submit">Kirim Balasan</button></form>':`<p class="signal">${t.status==='resolved'?'Tiket telah selesai.':!t.assignedTo?'Menunggu tiket diambil.':'Tiket ditangani petugas lain.'}</p>`}`;
      $('messages').scrollTop = $('messages').scrollHeight;
      $('reply')?.addEventListener('submit', event => {
        event.preventDefault();
        const text = String(new FormData(event.currentTarget).get('text') || '').trim();
        if (!text) { notice('Tuliskan balasan terlebih dahulu.', true);return; }
        action('messages', {text});
      });
    }
    $('actions').innerHTML = payload.canClaim ? '<button id="claim" type="button">Ambil Tiket</button>' : payload.canProgress ? (generic?`<h2>Penanganan</h2><form id="progress"><label>Perbarui Status<select name="stage">${stages.map(([id,label])=>`<option value="${id}" ${id===selectedStage?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>Keterangan untuk Pelanggan<textarea name="publicNote" maxlength="300" rows="3"></textarea></label><details><summary>Catatan privat petugas</summary><label>Catatan internal (opsional)<textarea name="note" maxlength="1000" rows="2"></textarea></label></details><button type="submit">Simpan Progres</button></form>`:'<h2>Progres Internal</h2><form id="progress"><label>Status<select name="status"><option value="working">Dikerjakan</option><option value="resolved">Selesai</option></select></label><label>Catatan Progres Internal<textarea name="note" maxlength="1000" required></textarea></label><button type="submit">Simpan Progres</button></form>') : `<p class="signal">${t.status==='resolved'?'Penanganan tiket telah selesai.':'Tiket sedang ditangani petugas lain.'}</p>`;
    $('actions').hidden = false;
    const history = [...(t.history || [])].reverse().slice(0,20);
    $('history').innerHTML = '<details><summary>Riwayat Petugas</summary>' + (history.length ? history.map(row=>`<article class="entry"><strong>${esc(row.userName)}</strong><small>${esc(date(row.at))} · ${esc(labels[row.status] || row.status)}</small><p>${esc(row.note)}</p>${row.publicNote?`<p>Untuk pelanggan: ${esc(row.publicNote)}</p>`:''}</article>`).join('') : '<p class="signal">Belum ada catatan penanganan.</p>')+'</details>';
    $('history').hidden = false;$('refresh').hidden = false;
    $('claim')?.addEventListener('click', () => action('claim', {}));
    $('progress')?.addEventListener('submit', event => {event.preventDefault();action('progress',Object.fromEntries(new FormData(event.currentTarget)));});
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#actions button, #conversation button, #refresh, #logout').forEach(button=>button.disabled = value);
  }
  async function action(kind, body) {
    if (busy) return;
    setBusy(true);let saved = false;
    const success = kind==='claim'?'Tiket berhasil diambil.':kind==='messages'?'Balasan terkirim.':'Progres tersimpan.';
    try {
      await api(endpoint + '/' + kind,{method:'POST',body:JSON.stringify(body)});saved = true;
      if(kind==='messages' && $('reply'))$('reply').reset();
      await render();notice(success);
    }
    catch(error){notice(saved?success+' Tampilan belum diperbarui: '+error.message:error.message,true);}
    finally{setBusy(false);}
  }
  $('refresh').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await render();notice('Tiket diperbarui.');}catch(error){notice(error.message,true);}finally{setBusy(false);}});
  $('logout').addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await api('/api/auth/logout',{method:'POST',body:'{}'});login();}catch(error){notice(error.message,true);}finally{setBusy(false);}});
  (async()=>{
    if(!validId){notice('Link tiket tidak valid.',true);return;}
    try{const session=await api('/api/auth/me');csrf=session.csrfToken || '';zone=session.branding?.timeZone || session.settings?.timeZone || 'Asia/Makassar';
      $('signedIn').textContent=session.user.name || session.user.username;$('logout').hidden=false;
      const branding=session.branding || {};if(branding.businessName){$('businessName').textContent=branding.businessName;document.title='Tiket Layanan - '+branding.businessName;}if(branding.logoUrl){$('businessLogo').src=branding.logoUrl;$('appFavicon').href=branding.logoUrl;}
      await render();notice();
    }catch(error){notice(error.message,true);}
  })();
})();
