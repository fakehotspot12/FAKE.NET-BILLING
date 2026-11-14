'use strict';

const TOKEN_KEY = 'wifikuToken';
const PANEL_KEY = 'wifikuActivePanel';
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const PORTAL_REFRESH_MS = 30000;
const WIFIKU_PANELS = new Set(['home', 'billing', 'wifi', 'account']);
const state = {
  settings: {},
  challengeId: '',
  phone: '',
  token: localStorage.getItem(TOKEN_KEY) || '',
  portal: null,
  clientDevice: null,
  activePanel: WIFIKU_PANELS.has(localStorage.getItem(PANEL_KEY)) ? localStorage.getItem(PANEL_KEY) : 'home',
  clientPage: 1
};

const byId = (id) => document.getElementById(id);

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function chartTooltipAttr(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return `data-chart-tooltip="${escapeHtml(text).replace(/\n/g, '&#10;')}" tabindex="0"`;
}

function todayPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toast(message) {
  const el = byId('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error=new Error(payload.error || 'Request gagal');error.status=response.status;throw error;
  }
  return payload;
}

function setLoading(form, loading) {
  form.querySelectorAll('button, input').forEach((node) => {
    node.disabled = loading;
  });
}

const supportState={mode:'list',closed:false,page:1,id:'',revision:0,list:null,ticket:null,urls:[],busy:false,photo:'',unread:0};
const supportTime=value=>{if(!value)return '-';const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('id-ID',{timeZone:state.settings.timeZone||'Asia/Makassar',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date):'-';};
function setSupportUnread(value) {
  supportState.unread=Math.max(0,Number(value)||0);
  const el=byId('supportUnread');el.hidden=!value;el.textContent=value>9?'9+':String(value||'');
}
function clearSupportPhotos() {supportState.urls.forEach(url=>URL.revokeObjectURL(url));supportState.urls=[];}
function closeSupport() {
  supportState.revision++;supportState.photo='';supportState.id='';supportState.ticket=null;
  byId('supportDialog').close();byId('supportBody').replaceChildren();clearSupportPhotos();
}
function supportError(message='',success=false) {const el=byId('supportError');if(el){el.textContent=message;el.hidden=!message;el.classList.toggle('support-success',success);el.setAttribute('role',success?'status':'alert');}}
function supportLayout(title,body,back=true) {
  clearSupportPhotos();byId('supportTitle').textContent=title;byId('supportBack').hidden=!back;
  byId('supportBody').classList.toggle('is-thread',supportState.mode==='thread');
  byId('supportBody').innerHTML=body+'<p id="supportError" class="support-error" role="alert" hidden></p>';
}
async function supportList() {
  const revision=++supportState.revision,token=state.token;supportState.mode='list';supportState.photo='';
  const result=await api('/api/public/wifiku/tickets?'+new URLSearchParams({closed:supportState.closed?'1':'0',page:supportState.page}));
  if(revision!==supportState.revision||state.token!==token||!byId('supportDialog').open)return;
  supportState.list=result;supportState.page=result.page;setSupportUnread(result.unread);
  supportLayout('Laporan Saya',`<div class="support-list-tools"><div class="support-tabs"><button type="button" data-support-closed="0" aria-pressed="${!supportState.closed}">Aktif</button><button type="button" data-support-closed="1" aria-pressed="${supportState.closed}">Selesai</button></div><button type="button" data-support-new>+ Buat Laporan</button></div><div class="support-ticket-list">${result.tickets.length?result.tickets.map(row=>`<button type="button" class="support-ticket" data-support-ticket="${escapeHtml(row.id)}"><span class="support-ticket-top"><small>${escapeHtml(row.number)}</small>${row.unread?'<i class="support-unread-dot" aria-label="Pembaruan belum dibaca"></i>':''}</span><strong>${escapeHtml(row.title)}</strong><span class="support-ticket-foot"><span class="support-status ${escapeHtml(row.status)}">${escapeHtml(row.statusLabel)}</span><small>${escapeHtml(supportTime(row.updatedAt))}</small></span></button>`).join(''):'<p class="support-empty">'+(supportState.closed?'Belum ada laporan selesai.':'Belum ada laporan aktif.')+'</p>'}</div><div class="support-pagination"><span>${result.total} laporan</span>${result.pages>1?`<button type="button" data-support-page="-1" aria-label="Halaman sebelumnya" ${result.page<=1?'disabled':''}>&lsaquo;</button><span>${result.page} / ${result.pages}</span><button type="button" data-support-page="1" aria-label="Halaman berikutnya" ${result.page>=result.pages?'disabled':''}>&rsaquo;</button>`:''}</div>`,false);
}
function supportNew(selected='') {
  supportState.revision++;supportState.mode='new';supportState.photo='';supportState.id='';supportState.ticket=null;
  const categories=['fault','request'].map(kind=>`<optgroup label="${kind==='fault'?'Gangguan':'Permintaan'}">${(supportState.list?.categories||[]).filter(row=>row.kind===kind).map(row=>`<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join('')}</optgroup>`).join('');
  supportLayout('Buat Laporan',`<form id="supportForm" class="support-form"><label>Keluhan / Permintaan<select name="category" id="supportCategory" required><option value="">Pilih kebutuhan Anda</option>${categories}</select></label><label>Keterangan<textarea name="text" maxlength="1500" rows="4" required></textarea></label>${supportPhotoField()}<button type="submit">Kirim Laporan</button></form>`);
  if(selected&&[...byId('supportCategory').options].some(row=>row.value===selected))byId('supportCategory').value=selected;
  bindSupportPhoto();
  byId('supportForm').addEventListener('submit',event=>sendSupport(event,false));
}
function supportPhotoField(compact=false) {const field='<div class="support-photo"><label>'+ (compact?'Pilih foto':'Foto (opsional)')+'<input id="supportPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><span id="supportPhotoName"></span><button type="button" id="supportPhotoRemove" class="secondary" hidden>Hapus foto</button></div>';return compact?'<details class="support-attachment"><summary>Lampirkan foto</summary>'+field+'</details>':field;}
function bindSupportPhoto() {
  byId('supportPhotoRemove').addEventListener('click',()=>{supportState.photo='';byId('supportPhoto').value='';byId('supportPhotoName').textContent='';byId('supportPhotoRemove').hidden=true;});
  byId('supportPhoto').addEventListener('change',async event=>{
    const file=event.target.files[0],revision=supportState.revision;supportState.photo='';if(!file)return;
    const submit=byId('supportForm').querySelector('[type="submit"]');submit.disabled=true;
    try {
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024)throw new Error('Pilih foto JPG, PNG atau WebP maksimal 12 MB');
      const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const photo=canvas.toDataURL('image/jpeg',0.72);if(photo.length>1000000)throw new Error('Foto terlalu besar. Pilih foto dengan ukuran lebih kecil.');
        if(revision!==supportState.revision)return;supportState.photo=photo;byId('supportPhotoName').textContent=file.name;byId('supportPhotoRemove').hidden=false;supportError();
      }finally{bitmap.close();}
    }catch(error){supportError(error.message);}finally{if(submit.isConnected)submit.disabled=false;}
  });
}
function supportMessages(ticket,expanded=false) {
  const messages=ticket.messages||[],older=messages.slice(0,-5);
  const render=rows=>rows.map(row=>`<article class="support-message ${row.role==='staff'?'staff':'customer'}"><strong>${escapeHtml(row.role==='customer'?'Anda':row.name||'Petugas')}</strong><p>${escapeHtml(row.text)}</p>${(row.photos||[]).map(photo=>`<img class="support-message-photo" alt="Foto lampiran laporan" data-support-photo="${escapeHtml(photo.id)}" hidden>`).join('')}<small>${escapeHtml(supportTime(row.at))}</small></article>`).join('');
  return (older.length?`<details class="support-earlier" ${expanded?'open':''}><summary>Pesan sebelumnya (${older.length})</summary><div>${render(older)}</div></details>`:'')+render(messages.slice(-5));
}
function supportProgress(ticket,expanded=false){
  const rows=ticket.progress||[],latest=rows.at(-1)||{label:ticket.statusLabel,at:ticket.updatedAt},past=rows.slice(0,-1);
  return `<div class="support-current${latest.stage==='waiting-customer'?' needs-response':''}"><span id="supportThreadStatus" class="support-status ${escapeHtml(ticket.status)}">${escapeHtml(latest.label)}</span>${latest.note?`<p>${escapeHtml(latest.note)}</p>`:''}<small>Diperbarui ${escapeHtml(supportTime(latest.at))}</small><small id="supportStaff" ${ticket.staffName?'':'hidden'}>Ditangani oleh ${escapeHtml(ticket.staffName||'')}</small></div>${past.length?`<details class="support-history" ${expanded?'open':''}><summary>Riwayat penanganan</summary><ol class="support-timeline">${past.map(row=>`<li><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(supportTime(row.at))}</small>${row.customNote&&row.note?`<p>${escapeHtml(row.note)}</p>`:''}</li>`).join('')}</ol></details>`:''}`;
}
async function markSupportSeen(ticket,revision){
  if(!ticket.unread)return;
  const token=state.token,result=await api('/api/public/wifiku/tickets/'+encodeURIComponent(ticket.id)+'/read',{method:'POST',body:JSON.stringify({seenAt:ticket.updatedAt})});
  if(revision===supportState.revision&&state.token===token&&!result.ticket.unread)setSupportUnread(supportState.unread-1);
}
function supportReplyLabel(ticket){return ticket.progress?.at(-1)?.stage==='waiting-customer'?'Konfirmasi kepada petugas':'Balas petugas';}
async function loadSupportPhotos(ticket,revision) {
  const token=state.token;
  for(const el of byId('supportBody').querySelectorAll('[data-support-photo]')){
    try{const response=await fetch(`/api/public/wifiku/tickets/${encodeURIComponent(ticket.id)}/photos/${encodeURIComponent(el.dataset.supportPhoto)}`,{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)continue;const blob=await response.blob();if(revision!==supportState.revision||state.token!==token||!el.isConnected)return;const url=URL.createObjectURL(blob);supportState.urls.push(url);el.src=url;el.hidden=false;}catch{}
  }
}
async function supportThread(id) {
  const revision=++supportState.revision,token=state.token;supportState.mode='thread';supportState.id=id;supportState.photo='';
  const {ticket}=await api('/api/public/wifiku/tickets/'+encodeURIComponent(id));
  if(revision!==supportState.revision||state.token!==token||!byId('supportDialog').open)return;
  supportState.ticket=ticket;
  supportLayout('Detail Laporan',`<div class="support-thread-scroll" id="supportThreadScroll"><div class="support-thread-title"><strong>${escapeHtml(ticket.title)}</strong><small class="support-reference">${escapeHtml(ticket.number)}</small></div><section id="supportProgress" class="support-progress" aria-live="polite">${supportProgress(ticket)}</section><h3 class="support-chat-title">Percakapan</h3><div id="supportMessages" class="support-messages" role="log" aria-live="polite">${supportMessages(ticket)}</div></div><form id="supportForm" class="support-form support-composer" ${ticket.status==='resolved'?'hidden':''}><label><span id="supportReplyLabel">${supportReplyLabel(ticket)}</span><textarea name="text" rows="2" maxlength="1500" required></textarea></label><div class="support-compose-tools">${supportPhotoField(true)}<button type="submit">Kirim</button></div></form><div id="supportClosed" class="support-closed" ${ticket.status==='resolved'?'':'hidden'}><span>Masih ada kendala?</span><button type="button" class="secondary" data-support-again>Buat laporan lanjutan</button></div>`);
  bindSupportPhoto();byId('supportForm').addEventListener('submit',event=>sendSupport(event,true));
  await loadSupportPhotos(ticket,revision);if(revision!==supportState.revision)return;
  await markSupportSeen(ticket,revision);
}
async function sendSupport(event,reply) {
  event.preventDefault();if(supportState.busy)return;
  const form=event.currentTarget,revision=supportState.revision,token=state.token,data=Object.fromEntries(new FormData(form));supportState.busy=true;
  form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);supportError();
  try {
    const body={text:data.text,...(!reply?{category:data.category}:{}),...(supportState.photo?{photo:supportState.photo}:{})};
    const result=await api('/api/public/wifiku/tickets'+(reply?'/'+encodeURIComponent(supportState.id)+'/messages':''),{method:'POST',body:JSON.stringify(body)});
    if(revision!==supportState.revision||state.token!==token)return;await supportThread(result.ticket.id);if(!reply&&!result.created&&supportState.id===result.ticket.id&&byId('supportDialog').open)supportError('Pesan ditambahkan ke laporan Anda yang masih aktif.',true);
  }catch(error){if(revision===supportState.revision)supportError(error.message);}finally{supportState.busy=false;if(form.isConnected)form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=false);}
}
async function refreshSupportOnTick() {
  if(!byId('supportDialog').open||supportState.busy||!state.token)return;
  if(supportState.mode==='list'){await supportList();return;}if(supportState.mode!=='thread')return;
  const revision=supportState.revision,token=state.token,{ticket}=await api('/api/public/wifiku/tickets/'+encodeURIComponent(supportState.id));
  if(revision!==supportState.revision||state.token!==token||supportState.mode!=='thread')return;
  if(JSON.stringify(ticket.messages)!==JSON.stringify(supportState.ticket?.messages)){const expanded=Boolean(byId('supportMessages').querySelector('details')?.open);clearSupportPhotos();byId('supportMessages').innerHTML=supportMessages(ticket,expanded);await loadSupportPhotos(ticket,revision);if(revision!==supportState.revision)return;}
  if(JSON.stringify(ticket.progress)!==JSON.stringify(supportState.ticket?.progress)||ticket.staffName!==supportState.ticket?.staffName){const expanded=Boolean(byId('supportProgress').querySelector('details')?.open);byId('supportProgress').innerHTML=supportProgress(ticket,expanded);}
  supportState.ticket=ticket;byId('supportReplyLabel').textContent=supportReplyLabel(ticket);
  byId('supportForm').hidden=ticket.status==='resolved';byId('supportClosed').hidden=ticket.status!=='resolved';
  await markSupportSeen(ticket,revision);
}
byId('supportButton').addEventListener('click',()=>{supportState.page=1;supportState.closed=false;supportState.mode='list';byId('supportDialog').showModal();supportLayout('Laporan Saya','');supportList().catch(error=>supportError(error.message));});
byId('supportClose').addEventListener('click',closeSupport);
byId('supportDialog').addEventListener('cancel',event=>{event.preventDefault();closeSupport();});
byId('supportBack').addEventListener('click',()=>supportList().catch(error=>supportError(error.message)));
byId('supportBody').addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target||supportState.busy)return;
  let task;if(target.hasAttribute('data-support-new')){supportNew();return;}
  if(target.hasAttribute('data-support-again')){supportNew(supportState.ticket?.category||'');return;}
  if(target.dataset.supportTicket)task=supportThread(target.dataset.supportTicket);
  if(target.dataset.supportClosed!==undefined){supportState.closed=target.dataset.supportClosed==='1';supportState.page=1;task=supportList();}
  if(target.dataset.supportPage){supportState.page+=Number(target.dataset.supportPage);task=supportList();}
  task?.catch(error=>supportError(error.message));
});

function showLogin() {
  closeSupport();byId('supportButton').hidden=true;
  byId('loginView').hidden = false;
  byId('portalView').hidden = true;
  byId('accountMenuWrap').hidden = true;
  byId('wifikuBottomNav').hidden = true;
  document.body.classList.remove('is-wifiku-authenticated');
  syncOtpFormVisibility(Boolean(state.challengeId));
}

function showPortal() {
  byId('supportButton').hidden=false;
  byId('loginView').hidden = true;
  byId('portalView').hidden = false;
  byId('accountMenuWrap').hidden = false;
  byId('wifikuBottomNav').hidden = false;
  document.body.classList.add('is-wifiku-authenticated');
  setWifikuPanel(state.activePanel || 'home', { persist: false });
  state.challengeId = '';
  syncOtpFormVisibility(false);
}

function setWifikuPanel(panel = 'home', options = {}) {
  const nextPanel = WIFIKU_PANELS.has(panel) ? panel : 'home';
  state.activePanel = nextPanel;
  if (options.persist !== false) {
    try {
      localStorage.setItem(PANEL_KEY, nextPanel);
    } catch {
      // Storage browser yang ditolak tidak boleh mengganggu navigasi portal.
    }
  }
  document.querySelectorAll('[data-wifiku-panel]').forEach((section) => {
    section.hidden = section.dataset.wifikuPanel !== nextPanel;
  });
  document.querySelectorAll('[data-wifiku-nav]').forEach((button) => {
    const active = button.dataset.wifikuNav === nextPanel;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: options.smooth === false ? 'auto' : 'smooth' });
  });
}

function otpRequired() {
  return state.settings?.requireOtp !== false;
}

function syncOtpFormVisibility(showChallenge = false) {
  const otpForm = byId('otpForm');
  if (!otpForm) return;
  const enabled = otpRequired();
  const ready = enabled && Boolean(showChallenge);
  otpForm.hidden = !enabled;
  const input = byId('otpInput');
  const button = otpForm.querySelector('button[type="submit"]');
  if (input) {
    input.disabled = !ready;
    input.placeholder = ready ? 'Masukkan kode OTP' : 'Kirim OTP terlebih dahulu';
    if (!ready) input.value = '';
  }
  if (button) {
    button.disabled = !ready;
  }
  if (!enabled) {
    state.challengeId = '';
  }
}

function periodText(value = '') {
  const [year, month] = String(value || todayPeriod()).split('-').map(Number);
  if (!year || !month) return '-';
  return `${MONTHS[month - 1] || String(month).padStart(2, '0')} ${year}`;
}

function dateText(value = '') {
  const text = String(value || '').trim();
  if (!text) return '-';
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : (local ? { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) } : null);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return text;
  }
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function displayNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('id-ID').format(number);
}

function compactBytes(value = 0) {
  let bytes = Math.max(0, Number(value || 0));
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  const precision = unit <= 1 ? 0 : 1;
  return `${bytes.toFixed(precision)} ${units[unit]}`;
}

function setText(id, value = '') {
  const element = byId(id);
  if (element) element.textContent = value;
}

function serviceStatusLabel(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (['isolated', 'isolir', 'suspend', 'suspended'].includes(status)) return 'Isolir';
  if (['terminated', 'terminate', 'disabled', 'inactive', 'nonaktif'].includes(status)) return 'Terminated';
  if (['pending', 'unpaid', 'belum bayar', 'belum-bayar'].includes(status)) return 'Belum Aktif';
  return 'Aktif';
}

function serviceStatusClass(value = '') {
  const label = serviceStatusLabel(value).toLowerCase();
  if (label === 'aktif') return 'active';
  if (label === 'isolir') return 'isolated';
  return 'inactive';
}

function chartRange(values = [], options = {}) {
  const clean = values.map((value) => Number(value || 0)).filter(Number.isFinite);
  const max = Math.max(0, ...clean);
  const minPadding = Math.max(0, Number(options.minPadding || 0));
  const stepBase = Math.max(1, Number(options.stepBase || 1));
  const paddedMax = Math.max(stepBase, max + minPadding);
  const niceMax = Math.ceil(paddedMax / stepBase) * stepBase;
  const ticks = [niceMax, niceMax * 0.66, niceMax * 0.33, 0].map((value) => Math.round(value / stepBase) * stepBase);
  return { min: 0, max: niceMax || stepBase, ticks: [...new Set(ticks)] };
}

function chartPoint(value = 0, range = {}, box = {}) {
  const min = Number(range.min || 0);
  const max = Math.max(min + 1, Number(range.max || 1));
  const ratio = (Number(value || 0) - min) / (max - min);
  return box.top + box.plotHeight - (Math.max(0, Math.min(1, ratio)) * box.plotHeight);
}

function chartGridMarkup(range = {}, box = {}) {
  return (range.ticks || []).map((value) => {
    const y = chartPoint(value, range, box);
    return `<line class="statistics-grid-line" x1="0" x2="${box.width - box.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>`;
  }).join('');
}

function chartFixedAxisMarkup(range = {}, box = {}, formatter = displayNumber) {
  return (range.ticks || []).map((value) => {
    const y = chartPoint(value, range, box);
    return `<span style="top:${y.toFixed(2)}px">${escapeHtml(formatter(value))}</span>`;
  }).join('');
}

function wifiBandKey(value = '') {
  const text = String(value || '').toLowerCase().replace(/\s+/g, '');
  return text.includes('5') ? '5g' : '2.4g';
}

function wifiBandLabel(value = '') {
  return wifiBandKey(value) === '5g' ? '5G' : '2.4G';
}

function wifiNetworkForBand(device = {}, band = '2.4g') {
  const key = wifiBandKey(band);
  const networks = Array.isArray(device.wifiNetworks) ? device.wifiNetworks : [];
  const primaryParameter = key === '5g' ? device.ssid5Parameter : device.ssid24Parameter;
  const bandNetworks = networks.filter((item) => wifiBandKey(item.band) === key && item.enabled !== false);
  const namedPrivateNetwork = bandNetworks.find((item) => !/wifimurah|open/i.test(String(item.ssid || '')));
  const privateNetwork = bandNetworks.find((item) => item.securityEnabled && !/wifimurah|open/i.test(String(item.ssid || '')));
  return networks.find((item) => item.ssidParameter && item.ssidParameter === primaryParameter)
    && !(/wifimurah|open/i.test(String(device.ssid5 || '')) && key === '5g')
    ? networks.find((item) => item.ssidParameter && item.ssidParameter === primaryParameter)
    : privateNetwork
      || namedPrivateNetwork
      || bandNetworks.find((item) => item.index === (key === '5g' ? 5 : 1))
      || bandNetworks[0]
    || networks.find((item) => wifiBandKey(item.band) === key && item.index === (key === '5g' ? 5 : 1))
    || {
      band: key === '5g' ? '5G' : '2.4G',
      ssid: key === '5g' ? device.ssid5 : device.ssid24,
      ssidParameter: primaryParameter,
      passwordParameter: ''
    };
}

function wifiNetworkAvailable(device = {}, band = '2.4g') {
  const network = wifiNetworkForBand(device, band);
  return Boolean(device.id && network.ssidParameter && network.ssid);
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function clientRows(device = {}) {
  const rows = Array.isArray(device.connectedClients) ? device.connectedClients : [];
  if (wifiNetworkAvailable(device, '5g')) return rows;
  return rows.filter((row) => clientTypeKey(row.type) !== '5G');
}

function clientTypeKey(value = '') {
  const text = String(value || '').toLowerCase();
  if (text.includes('5')) return '5G';
  if (text.includes('lan') || text.includes('eth')) return 'LAN';
  return '2.4G';
}

function clientCountByType(rows = [], type = '') {
  const key = clientTypeKey(type);
  return rows.filter((row) => clientTypeKey(row.type) === key).length;
}

function clientSummaryCounts(device = {}) {
  const rows = clientRows(device);
  const hasWifi5 = wifiNetworkAvailable(device, '5g');
  const count24 = Math.max(numberValue(device.wifiClients24), clientCountByType(rows, '2.4G'));
  const count5 = hasWifi5
    ? Math.max(numberValue(device.wifiClients5), clientCountByType(rows, '5G'))
    : 0;
  const countLan = Math.max(numberValue(device.lanClients), clientCountByType(rows, 'LAN'));
  const total = Math.max(numberValue(device.clientsTotal || device.wifiClientsTotal), rows.length, count24 + count5 + countLan);
  return { count24, count5, countLan, total, hasWifi5 };
}

function clientBadgeClass(type = '') {
  const key = clientTypeKey(type);
  if (key === '5G') return 'wifi5';
  if (key === 'LAN') return 'lan';
  return 'wifi24';
}

function usageDateLabel(value = '') {
  const formatted = dateText(value);
  if (formatted === '-' || !formatted) return '-';
  return formatted.slice(0, 5);
}

function usageDailyBarChart(rows = []) {
  const chartRows = (Array.isArray(rows) ? rows : []).slice(-7);
  if (!chartRows.length) {
    return '<div class="empty-detail">Aktivitas usage 7 hari terakhir belum tersedia.</div>';
  }
  const box = { width: 320, height: 116, right: 0, top: 8, plotHeight: 96 };
  const range = chartRange(chartRows.map((row) => row.totalOctets), {
    minPadding: 1024 * 1024,
    stepBase: 1024 * 1024
  });
  const plotWidth = box.width - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(10, Math.min(24, step * 0.52));
  return `
    <div class="statistics-chart-card usage-daily-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Aktivitas 7 Hari Terakhir</h3>
          <span>Total usage harian dari FreeRADIUS.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="voucher">Total usage</span>
        </div>
      </div>
      <div class="usage-daily-chart-frame">
        <div class="usage-daily-fixed-axis" aria-hidden="true">
          ${chartFixedAxisMarkup(range, box, compactBytes)}
        </div>
        <div class="statistics-svg-wrap usage-daily-svg-wrap">
          <svg viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="none" role="img" aria-label="Aktivitas usage 7 hari terakhir">
          ${chartGridMarkup(range, box)}
          ${chartRows.map((row, index) => {
            const value = Number(row.totalOctets || 0);
            const y = chartPoint(value, range, box);
            const height = Math.max(0, (box.top + box.plotHeight) - y);
            const x = (step * index) + ((step - barWidth) / 2);
            const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || compactBytes(row.inputOctets || 0)}\nDownload: ${row.download || compactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || compactBytes(value)}\nSession: ${displayNumber(row.sessionCount || 0)}`;
            const hitWidth = Math.max(34, barWidth + 14);
            const hitX = x + (barWidth / 2) - (hitWidth / 2);
            return `
              <rect class="statistics-bar voucher" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          </svg>
          <div class="usage-daily-date-grid">
            ${chartRows.map((row) => {
              const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || compactBytes(row.inputOctets || 0)}\nDownload: ${row.download || compactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || compactBytes(row.totalOctets || 0)}\nSession: ${displayNumber(row.sessionCount || 0)}`;
              return `<span ${chartTooltipAttr(tooltip)}>${escapeHtml(usageDateLabel(row.date))}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openClientDialog(options = {}) {
  let device = state.clientDevice || state.portal?.device || {};
  const dialog = byId('clientDialog');
  const body = byId('clientDialogBody');
  if (!body) return;
  if (dialog && !dialog.open) dialog.showModal();
  if (options.reset === true) {
    state.clientPage = 1;
    body.innerHTML = '<p class="empty-detail">Memperbarui daftar client dari modem...</p>';
    try {
      const payload = await api('/api/public/wifiku/clients?refresh=1');
      if (payload.device) {
        state.clientDevice = payload.device;
        device = payload.device;
      }
    } catch (error) {
      toast(error.message || 'Client perangkat belum bisa diperbarui');
    }
  }
  const rows = clientRows(device);
  const counts = clientSummaryCounts(device);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.clientPage = Math.max(1, Math.min(totalPages, Number(state.clientPage || 1) || 1));
  const offset = (state.clientPage - 1) * pageSize;
  const visibleRows = rows.slice(offset, offset + pageSize);
  const summary = `
    <div class="client-summary-strip">
      <span>2.4G ${counts.count24}</span>
      ${counts.hasWifi5 ? `<span>5G ${counts.count5}</span>` : ''}
      <span>LAN ${counts.countLan}</span>
    </div>
  `;
  if (!rows.length) {
    body.innerHTML = `${summary}<p class="empty-detail">Detail client belum terbaca dari GenieACS.</p>`;
  } else {
    body.innerHTML = `${summary}
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Koneksi</th>
              <th>Nama / Device</th>
              <th>IP Address</th>
              <th>MAC</th>
            </tr>
          </thead>
          <tbody>
            ${visibleRows.map((row, index) => `
              <tr>
                <td data-label="No">${offset + index + 1}</td>
                <td data-label="Koneksi"><span class="client-type-badge ${clientBadgeClass(row.type)}">${escapeHtml(clientTypeKey(row.type))}</span></td>
                <td data-label="Nama / Device">${escapeHtml(row.name || '-')}</td>
                <td data-label="IP Address">${escapeHtml(row.ipAddress || '-')}</td>
                <td data-label="MAC">${escapeHtml(row.macAddress || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="client-detail-pager">
        <span>${offset + 1}–${Math.min(offset + pageSize, rows.length)} dari ${rows.length} client</span>
        <div>
          <button type="button" data-client-page="${state.clientPage - 1}" ${state.clientPage <= 1 ? 'disabled' : ''}>Sebelumnya</button>
          <strong>${state.clientPage} / ${totalPages}</strong>
          <button type="button" data-client-page="${state.clientPage + 1}" ${state.clientPage >= totalPages ? 'disabled' : ''}>Berikutnya</button>
        </div>
      </div>`;
  }
}

function openUsageDialog() {
  const usage = state.portal?.usage || {};
  const rows = Array.isArray(usage.dailyRows) ? usage.dailyRows : [];
  const body = byId('usageDialogBody');
  if (!body) return;
  body.innerHTML = `
    ${usageDailyBarChart(rows)}
    ${usage.dailyError ? `<div class="empty-detail">${escapeHtml(usage.dailyError)}</div>` : ''}
  `;
  const dialog = byId('usageDialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function billingBadgeClass(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return 'paid';
  if (value === 'overdue') return 'overdue';
  if (['pending', 'unpaid'].includes(value)) return 'pending';
  return 'none';
}

function billingStatusLabel(status = '', fallback = '') {
  const value = String(status || '').toLowerCase();
  if (fallback) return fallback;
  if (value === 'paid') return 'Sudah dibayar';
  if (value === 'overdue') return 'Lewat tempo';
  if (['pending', 'unpaid'].includes(value)) return 'Belum dibayar';
  return 'Tidak ada tagihan';
}

function renderHomeBillingSummary(billing = {}) {
  const exists = billing.exists === true;
  const status = String(billing.status || '').toLowerCase();
  const dueText = exists && billing.dueDate ? `Jatuh tempo ${billing.dueDate}` : 'Tidak ada tagihan aktif';
  const remainingText = exists && ['pending', 'overdue', 'unpaid'].includes(status)
    ? (billing.gatewayAmountText || billing.amountText || 'Rp 0')
    : 'Rp 0';
  const canPay = Boolean(billing.canPay && (billing.checkoutUrl || billing.paymentGatewayLink));
  const paid = exists && status === 'paid';
  const noInvoice = !exists || status === 'none';
  setText('homeBillingAmount', remainingText);
  setText('homeBillingDue', paid ? `Lunas periode ${billing.period || '-'}` : dueText);
  setText('homePaymentTitle', canPay ? 'Tagihan perlu dibayar' : (paid ? 'Tagihan lunas' : (noInvoice ? 'Tidak ada tagihan aktif' : 'Tagihan belum tersedia online')));
  setText('homePaymentHint', billing.message || (canPay ? 'Silakan lakukan pembayaran dari tombol berikut.' : 'Status tagihan pelanggan sudah diperbarui.'));
  const button = byId('homePayButton');
  const checkoutUrl = billing.checkoutUrl || billing.paymentGatewayLink || '';
  if (button) {
    button.dataset.checkoutUrl = canPay ? checkoutUrl : '';
    button.disabled = !canPay;
    button.textContent = canPay ? 'Bayar Tagihan' : (paid ? 'Tagihan Lunas' : (noInvoice ? 'Tidak Ada Tagihan' : 'Hubungi Admin'));
    button.classList.toggle('is-paid', paid || noInvoice);
  }
  const card = byId('homeBillingCard');
  if (card) {
    card.dataset.checkoutUrl = canPay ? checkoutUrl : '';
    card.classList.toggle('is-paid', paid || noInvoice);
  }
}

function billingHistoryStatusClass(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return 'paid';
  if (value === 'overdue') return 'overdue';
  if (['pending', 'unpaid'].includes(value)) return 'pending';
  return 'none';
}

function billingHistoryRowMarkup(row = {}, options = {}) {
  const compact = options.compact === true;
  const statusClass = billingHistoryStatusClass(row.status);
  const meta = [
    row.period || '-',
    row.dueDate ? `Tempo ${row.dueDate}` : ''
  ].filter(Boolean).join(' · ');
  const paidInfo = String(row.status || '').toLowerCase() === 'paid'
    ? [row.paymentMethod || '', row.paidAt ? `Bayar ${row.paidAt}` : ''].filter(Boolean).join(' · ')
    : '';
  return `
    <article class="billing-log-row ${compact ? 'compact' : ''}">
      <div>
        <strong>${escapeHtml(row.invoiceNo || row.reference || '-')}</strong>
        <span>${escapeHtml(meta || '-')}</span>
        ${paidInfo ? `<small>${escapeHtml(paidInfo)}</small>` : ''}
      </div>
      <div class="billing-log-side">
        <span class="billing-badge ${statusClass}">${escapeHtml(row.statusLabel || billingStatusLabel(row.status))}</span>
        <strong>${escapeHtml(row.amountText || '-')}</strong>
      </div>
    </article>
  `;
}

function renderBillingHistory(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const home = byId('homeBillingLog');
  const full = byId('billingHistoryList');
  const button = byId('billingHistoryButton');
  if (home) {
    home.innerHTML = list.length
      ? list.slice(0, 3).map((row) => billingHistoryRowMarkup(row, { compact: true })).join('')
      : '<p class="empty-detail">Riwayat tagihan belum tersedia.</p>';
  }
  if (full) {
    full.innerHTML = list.length
      ? list.map((row) => billingHistoryRowMarkup(row)).join('')
      : '<p class="empty-detail">Riwayat tagihan belum tersedia.</p>';
  }
  if (button) {
    button.disabled = !list.length;
  }
}

function renderBillingSummary(billing = {}) {
  const exists = billing.exists === true;
  const status = String(billing.status || '').toLowerCase();
  const title = exists
    ? (status === 'paid' ? 'Tagihan sudah dibayar' : 'Tagihan belum dibayar')
    : 'Tidak ada tagihan';
  byId('billingTitle').textContent = title;
  byId('billingBadge').textContent = billing.statusLabel || (exists ? 'Belum dibayar' : 'Tidak ada');
  byId('billingBadge').className = `billing-badge ${billingBadgeClass(status)}`;
  byId('billingInvoiceNo').textContent = billing.invoiceNo || billing.reference || '-';
  byId('billingPeriod').textContent = billing.period || periodText(billing.periodRaw || todayPeriod());
  byId('billingDueDate').textContent = dateText(billing.dueDate || billing.dueDateRaw || '');
  byId('billingAmount').textContent = billing.gatewayAmountText || billing.amountText || '-';
  byId('billingMessage').textContent = billing.message || (exists
    ? 'Ringkasan tagihan bulan ini tersedia.'
    : `Tidak ada tagihan untuk periode ${periodText(byId('periodInput').value || todayPeriod())}.`);
  const payButton = byId('billingPayButton');
  const checkoutUrl = billing.checkoutUrl || billing.paymentGatewayLink || '';
  payButton.hidden = !(billing.canPay && checkoutUrl);
  payButton.dataset.checkoutUrl = billing.canPay ? checkoutUrl : '';
  renderHomeBillingSummary(billing);
}

function renderPortal(payload) {
  state.portal = payload;
  const customer = payload.customer || {};
  const usage = payload.usage || {};
  const device = payload.device || {};
  if (state.clientDevice?.id && state.clientDevice.id !== device.id) state.clientDevice = null;
  const memberName = customer.name || customer.username || '-';
  const serviceStatus = customer.status || payload.billing?.customerStatus || '';
  setText('memberId', customer.memberId || customer.id || '-');
  setText('memberName', memberName);
  setText('memberPackage', customer.packageName || '-');
  setText('accountMenuName', memberName);
  setText('accountTabName', memberName);
  setText('accountTabPhone', customer.phone || '-');
  setText('accountTabEmail', customer.email || '-');
  setText('accountTabAddress', customer.address || '-');
  setText('accountServicePackage', customer.packageName || '-');
  setText('accountActiveDate', customer.activeDate || '-');
  setText('accountNextBilling', dateText(customer.dueDate || ''));
  setText('homeServiceStatus', serviceStatusLabel(serviceStatus));
  byId('homeServiceStatus')?.classList.remove('active', 'isolated', 'inactive');
  byId('homeServiceStatus')?.classList.add(serviceStatusClass(serviceStatus));
  const hasLocation = Boolean(customer.latitude && customer.longitude);
  const hasHousePhoto = Boolean(customer.housePhotoUrl);
  const locationNotice = byId('customerLocationNotice');
  const locationContent = byId('customerLocationContent');
  const locationMap = byId('customerLocationMap');
  const locationLink = byId('customerLocationLink');
  const housePhoto = byId('customerHousePhoto');
  const missing = [];
  if (!hasLocation) missing.push('lokasi peta');
  if (!hasHousePhoto) missing.push('foto rumah');
  locationNotice.hidden = missing.length === 0;
  locationNotice.textContent = missing.length
    ? `Data ${missing.join(' dan ')} belum tersedia atau belum akurat. Untuk pembaruan data rumah dan peta, mohon hubungi admin.`
    : '';
  locationContent.hidden = !hasLocation && !hasHousePhoto;
  if (hasLocation) {
    const query = `${customer.latitude},${customer.longitude}`;
    locationMap.hidden = false;
    locationMap.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed`;
    locationLink.hidden = false;
    locationLink.href = customer.locationUrl || `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
  } else {
    locationMap.hidden = true;
    locationLink.hidden = true;
  }
  housePhoto.hidden = !hasHousePhoto;
  if (hasHousePhoto) housePhoto.src = customer.housePhotoUrl;
  setText('usageTotal', usage.totalUsageText || '0 B');
  setText('usageDetail', `U ${usage.upload || '0 B'} / D ${usage.download || '0 B'}`);
  setText('rxPower', device.rxPowerText || '-');
  const modem=payload.modemStatus||{},deviceStatusText=modem.label||(device.id?(device.online?'Modem terhubung':'Modem belum terhubung'):'Status belum tersedia');
  setText('deviceStatus', deviceStatusText);
  byId('deviceStatus').className='modem-status-pill '+(modem.code|| (device.online?'online':'offline'));
  setText('modemStatusLabel',deviceStatusText);
  byId('modemStatusLabel').className='modem-status-pill '+(modem.code|| (device.online?'online':'offline'));
  setText('modemStatusHint',modem.hint||'');setText('homeModemHint',modem.hint||'');setSupportUnread(payload.supportUnread||0);
  setText('modemSerialNumber', device.serialNumber || device.sn || '-');
  setText('homeModemSerialNumber', device.serialNumber || device.sn || '-');
  setText('wifiRxPower', device.rxPowerText || '-');
  const clients = clientSummaryCounts(device);
  const network24 = wifiNetworkForBand(device, '2.4g');
  const network5 = wifiNetworkForBand(device, '5g');
  const hasWifi24 = wifiNetworkAvailable(device, '2.4g');
  const hasWifi5 = wifiNetworkAvailable(device, '5g');
  setText('wifiTotal', `${clients.total} user`);
  setText('wifiDetail', hasWifi5
    ? `2.4G ${clients.count24} / 5G ${clients.count5} / LAN ${clients.countLan}`
    : `2.4G ${clients.count24} / LAN ${clients.countLan}`);
  setText('homeModemClients', `${clients.total} user`);
  const clientButton = byId('clientSummaryButton');
  if (clientButton) {
    clientButton.disabled = !device.id;
    clientButton.title = device.id ? 'Lihat detail client terkoneksi' : 'Device belum ditemukan';
  }
  byId('ssid24').textContent = network24.ssid || device.ssid24 || '-';
  byId('ssid5').textContent = network5.ssid || device.ssid5 || '-';
  document.querySelectorAll('[data-wifi-row]').forEach((row) => {
    const band = row.dataset.wifiRow || '';
    const available = band === '5g' ? hasWifi5 : hasWifi24;
    row.hidden = !available;
  });
  document.querySelectorAll('[data-ssid-band]').forEach((button) => {
    const network = wifiNetworkForBand(device, button.dataset.ssidBand);
    const available = wifiNetworkAvailable(device, button.dataset.ssidBand);
    button.disabled = !available;
    button.title = available ? '' : 'SSID belum ditemukan di GenieACS';
  });
  renderBillingSummary(payload.billing || {});
  renderBillingHistory(payload.billingHistory || []);
  showPortal();
  refreshSupportOnTick().catch(()=>{});
}

function openAccountDialog() {
  const customer = state.portal?.customer || {};
  const dialog = byId('accountDialog');
  const form = byId('accountForm');
  if (!dialog || !form) return;
  form.name.value = customer.name || '';
  form.ktp.value = customer.ktp || '';
  form.phone.value = customer.phone || '';
  form.email.value = customer.email || '';
  form.address.value = customer.address || '';
  dialog.showModal();
}

async function loadSettings() {
  const payload = await api('/api/public/wifiku/settings');
  state.settings = payload.settings || {};
  byId('brandName').textContent = state.settings.businessName || 'WifiKu';
  byId('brandLogo').src = state.settings.logoUrl || '/fakenet-logo.png';
  document.title = `${state.settings.businessName || 'WifiKu'} - WifiKu`;
  const favicon = byId('appFavicon');
  if (favicon) favicon.href = state.settings.logoUrl || '/fakenet-logo.png';
  if (!state.settings.enabled) {
    byId('loginView').innerHTML = '<h1>WifiKu nonaktif</h1><p>Portal pelanggan belum diaktifkan.</p>';
  }
  syncOtpFormVisibility(Boolean(state.challengeId));
}

async function loadMe() {
  if (!state.token) return false;
  try {
    const period = byId('periodInput').value || todayPeriod();
    const payload = await api(`/api/public/wifiku/me?period=${encodeURIComponent(period)}`);
    renderPortal(payload);
    return true;
  } catch {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    return false;
  }
}

async function refreshPortalRealtime() {
  if (!state.token || document.hidden) return;
  const usageOpen = byId('usageDialog')?.open === true;
  const clientOpen = byId('clientDialog')?.open === true;
  const ok = await loadMe();
  if (!ok) return;
  if (usageOpen) openUsageDialog();
  if (clientOpen) openClientDialog();
}

byId('periodInput').value = todayPeriod();

byId('phoneForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setLoading(form, true);
  try {
    state.phone = byId('phoneInput').value.trim();
    const payload = await api('/api/public/wifiku/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: state.phone, period: byId('periodInput').value || todayPeriod() })
    });
    if (payload.token) {
      state.token = payload.token;
      localStorage.setItem(TOKEN_KEY, state.token);
      state.challengeId = '';
      syncOtpFormVisibility(false);
      renderPortal(payload.portal);
      return;
    }
    if (payload.requireOtp === false || !otpRequired()) {
      syncOtpFormVisibility(false);
      throw new Error(payload.error || 'Nomor WhatsApp belum terdaftar sebagai pelanggan');
    }
    state.challengeId = payload.challengeId || '';
    syncOtpFormVisibility(Boolean(state.challengeId));
    if (state.challengeId) byId('otpInput').focus();
    toast(payload.message || 'OTP dikirim via WhatsApp');
  } catch (error) {
    toast(error.message);
  } finally {
    setLoading(form, false);
  }
});

byId('otpForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setLoading(form, true);
  try {
    const payload = await api('/api/public/wifiku/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: state.phone,
        challengeId: state.challengeId,
        otp: byId('otpInput').value.trim(),
        period: byId('periodInput').value || todayPeriod()
      })
    });
    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    renderPortal(payload.portal);
  } catch (error) {
    toast(error.message);
  } finally {
    setLoading(form, false);
  }
});

byId('periodInput').addEventListener('change', () => loadMe());
setInterval(refreshPortalRealtime, PORTAL_REFRESH_MS);

byId('accountMenuButton').addEventListener('click', () => {
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  menu.hidden = !menu.hidden;
  button.setAttribute('aria-expanded', String(!menu.hidden));
});

document.addEventListener('click', (event) => {
  const wrap = byId('accountMenuWrap');
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  if (!wrap || wrap.hidden || wrap.contains(event.target)) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = byId('accountMenu');
  const button = byId('accountMenuButton');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
});

byId('accountButton').addEventListener('click', () => {
  byId('accountMenu').hidden = true;
  setWifikuPanel('account');
});

function logoutWifiku() {
  state.token = '';
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

byId('logoutButton').addEventListener('click', () => {
  byId('accountMenu').hidden = true;
  logoutWifiku();
});

byId('closeAccountDialog').addEventListener('click', () => byId('accountDialog').close());
byId('usageSummaryButton')?.addEventListener('click', openUsageDialog);
byId('clientSummaryButton')?.addEventListener('click', () => openClientDialog({ reset: true }));
byId('clientDialogBody')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-client-page]');
  if (!button || button.disabled) return;
  state.clientPage = Math.max(1, Number(button.dataset.clientPage || 1));
  openClientDialog();
});
byId('closeUsageDialog')?.addEventListener('click', () => byId('usageDialog')?.close());
byId('closeClientDialog')?.addEventListener('click', () => byId('clientDialog')?.close());
byId('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  toast('Perubahan data pelanggan dilakukan oleh admin.');
});

byId('billingPayButton').addEventListener('click', () => {
  const url = byId('billingPayButton').dataset.checkoutUrl || '';
  if (!url) {
    toast('Link pembayaran belum tersedia');
    return;
  }
  window.location.href = url;
});

byId('homePayButton')?.addEventListener('click', () => {
  const url = byId('homePayButton').dataset.checkoutUrl || '';
  if (!url) return;
  window.location.href = url;
});

byId('homeBillingCard')?.addEventListener('click', () => {
  const url = byId('homeBillingCard').dataset.checkoutUrl || '';
  if (url) {
    window.location.href = url;
    return;
  }
  setWifikuPanel('billing');
});

byId('billingHistoryButton')?.addEventListener('click', () => setWifikuPanel('billing'));

document.querySelectorAll('[data-wifiku-nav]').forEach((button) => {
  button.addEventListener('click', () => {
    setWifikuPanel(button.dataset.wifikuNav || 'home');
  });
});

byId('accountTabDetailButton')?.addEventListener('click', openAccountDialog);
byId('accountTabLogoutButton')?.addEventListener('click', logoutWifiku);

const dialog = byId('actionDialog');
const actionForm = byId('actionForm');
byId('closeDialog').addEventListener('click', () => dialog.close());

function openAction(title, body, handler) {
  byId('actionTitle').textContent = title;
  byId('actionBody').innerHTML = body;
  actionForm.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await handler(new FormData(actionForm));
      dialog.close();
      toast('Perintah dikirim');
      setTimeout(loadMe, 1200);
    } catch (error) {
      toast(error.message);
    }
  };
  dialog.showModal();
}

document.querySelectorAll('[data-ssid-band]').forEach((button) => {
  button.addEventListener('click', async () => {
    const band = button.dataset.ssidBand;
    const device = state.portal?.device || {};
    if (!device.id) {
      toast('SSID belum ditemukan di GenieACS');
      return;
    }
    button.disabled = true;
    try {
      toast('Membaca pengaturan WiFi ONT...');
      const wifiPayload = await api('/api/public/wifiku/wifi-options?refresh=1');
      const credentialDevice = {
        ...device,
        wifiNetworks: Array.isArray(wifiPayload.networks) ? wifiPayload.networks : []
      };
      const network = wifiNetworkForBand(credentialDevice, band);
      if (!network.ssidParameter) {
        toast('SSID belum ditemukan di GenieACS');
        return;
      }
      const label = wifiBandLabel(band);
      const currentPassword = String(network.password || '');
      openAction(`Ubah SSID & Password ${label}`, `
        <label>
          <span>Nama WiFi ${label}</span>
          <input name="ssid" maxlength="32" value="${escapeHtml(network.ssid || '')}" required>
        </label>
        <label>
          <span>Password WiFi ${label}</span>
          <input id="wifiPasswordInput" name="password" type="password" minlength="8" maxlength="63" autocomplete="off" value="${escapeHtml(currentPassword)}" placeholder="Belum terbaca dari ONT">
        </label>
        <label class="check-row">
          <input id="wifiShowPassword" type="checkbox">
          <span>Lihat password</span>
        </label>
        <p class="muted">${currentPassword
          ? 'Password aktif tersamarkan. Ubah field hanya jika password ingin diganti.'
          : 'Password belum dilaporkan oleh ONT. Isi hanya jika password ingin diganti.'}</p>
      `, async (form) => {
        const payload = {
          band,
          ssid: form.get('ssid'),
          ssidParameter: network.ssidParameter,
          passwordParameter: network.passwordParameter || ''
        };
        const password = String(form.get('password') || '').trim();
        if (password && password !== currentPassword) payload.password = password;
        await api('/api/public/wifiku/wifi', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      });
      const passwordInput = byId('wifiPasswordInput');
      const showPassword = byId('wifiShowPassword');
      showPassword?.addEventListener('change', () => {
        if (passwordInput) passwordInput.type = showPassword.checked ? 'text' : 'password';
      });
    } catch (error) {
      toast(error.message || 'Pengaturan WiFi ONT belum dapat dibaca');
    } finally {
      button.disabled = false;
    }
  });
});

byId('rebootButton').addEventListener('click', async () => {
  if (!confirm('Reboot modem sekarang?')) return;
  try {
    await api('/api/public/wifiku/reboot', { method: 'POST', body: '{}' });
    toast('Perintah reboot dikirim');
  } catch (error) {
    toast(error.message);
  }
});

let activeChartTooltipTimer = null;
let chartTooltipShownAt = 0;

function ensureChartTooltip() {
  let tooltip = byId('chartTouchTooltip');
  const openDialog = document.querySelector('dialog[open]');
  const host = openDialog || document.body;
  if (tooltip) {
    if (tooltip.parentNode !== host) host.appendChild(tooltip);
    return tooltip;
  }
  tooltip = document.createElement('div');
  tooltip.id = 'chartTouchTooltip';
  tooltip.className = 'chart-touch-tooltip';
  tooltip.hidden = true;
  host.appendChild(tooltip);
  return tooltip;
}

function hideChartTooltip() {
  if (Date.now() - chartTooltipShownAt < 350) return;
  const tooltip = byId('chartTouchTooltip');
  if (tooltip) tooltip.hidden = true;
  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = null;
}

function chartTooltipTarget(node) {
  let current = node && currentNode(node);
  while (current && current !== document) {
    if (typeof current.getAttribute === 'function' && current.getAttribute('data-chart-tooltip')) return current;
    current = currentNode(current.parentNode || current.host);
  }
  return null;
}

function chartTooltipTargetFromEvent(event) {
  const direct = chartTooltipTarget(event?.target);
  if (direct) return direct;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    const target = chartTooltipTarget(node);
    if (target) return target;
  }
  return null;
}

function currentNode(node) {
  return node && node.nodeType === 3 ? node.parentNode : node;
}

function showChartTooltip(target, event = null) {
  const text = String(target?.getAttribute('data-chart-tooltip') || '').trim();
  if (!text) return;
  const tooltip = ensureChartTooltip();
  tooltip.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const pointerX = Number(event?.clientX);
  const pointerY = Number(event?.clientY);
  const x = Number.isFinite(pointerX) ? pointerX : rect.left + (rect.width / 2);
  const y = Number.isFinite(pointerY) ? pointerY : rect.top;
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 10;
  const left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, x - (tooltipRect.width / 2)));
  const hasTopRoom = y - tooltipRect.height - 12 >= margin;
  const preferredTop = hasTopRoom ? y - tooltipRect.height - 12 : y + 16;
  const top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, preferredTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  chartTooltipShownAt = Date.now();
  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = setTimeout(hideChartTooltip, 6500);
}

document.addEventListener('pointerdown', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('touchstart', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (!target) return;
  const touch = event.touches && event.touches[0] ? event.touches[0] : event;
  showChartTooltip(target, touch);
}, { passive: true });

document.addEventListener('click', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('mouseover', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, event);
});

document.addEventListener('focusin', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, null);
});

window.addEventListener('scroll', hideChartTooltip, { passive: true });
document.addEventListener('scroll', hideChartTooltip, { passive: true, capture: true });

(async () => {
  try {
    await loadSettings();
    if (!(await loadMe())) showLogin();
  } catch (error) {
    toast(error.message);
    showLogin();
  }
})();
