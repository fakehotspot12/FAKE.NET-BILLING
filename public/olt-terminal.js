(() => {
  'use strict';
  const screen = document.getElementById('oltTerminalScreen');
  if (!screen) return;
  const params = new URLSearchParams(location.search), oltId = params.get('olt') || '', channel = params.get('channel') || '';
  const status = document.getElementById('oltTerminalStatus'), reconnect = document.getElementById('oltTerminalReconnect'), ctrl = document.getElementById('oltTerminalCtrl');
  const more = document.getElementById('oltTerminalMore'), extra = document.getElementById('oltTerminalExtra');
  const endpoint = '/api/monitoring/olt/' + encodeURIComponent(oltId) + '/terminal';
  const queue = [], controls = new Map([['tab','\t'],['escape','\x1b'],['interrupt','\x03'],['suspend','\x1a'],['up','\x1b[A'],['down','\x1b[B'],['left','\x1b[D'],['right','\x1b[C'],['more',' '],['enter','\r']]);
  let term, fit, observer, session = '', csrf = '', offset = 0, revision = 0, sequence = 0, generation = 0;
  let ready = false, pending = false, password = false, confirmation = false, pager = false, closed = false, connecting = false, sending = false, handoff = false, ctrlArmed = false;
  let readTimer, inputTimer, resizeTimer, handoffTimer, reader, connector, requestedSize, sentSize;
  const say = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  const hideExtra = () => { extra.hidden = true; more.setAttribute('aria-expanded','false'); };
  const setKeys = () => { for (const button of document.querySelectorAll('.terminal-keys button')) button.disabled = !ready || closed; if (!ready || closed) hideExtra(); };
  function viewport() {
    document.documentElement.style.setProperty('--terminal-height', Math.max(160, window.visualViewport?.height || innerHeight) + 'px');
    document.documentElement.style.setProperty('--terminal-top', (window.visualViewport?.offsetTop || 0) + 'px');
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', signal: options.signal || AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(value.error || 'Koneksi terminal belum tersedia'), { status: response.status, sequence: value.sequence,consoleReported:value.consoleReported===true });
    return value;
  }
  function clearQueue() { queue.length = 0; clearTimeout(inputTimer); }
  async function disconnect(strict = false) {
    generation++; ready = false; clearTimeout(readTimer); reader?.abort(); connector?.abort(); clearQueue(); setKeys();
    const id = session;
    if (id) try { await api(endpoint + '/' + id, { method: 'DELETE', body: '{}', signal: AbortSignal.timeout(5000) }); }
    catch { if (strict) { reconnect.hidden = false; throw Error('Sesi belum berhasil ditutup. Hubungkan ulang sebelum menghapus ONU.'); } }
    session = ''; requestedSize = null; sentSize = null; reconnect.hidden = closed || handoff; say('Terputus');
  }
  function close() {
    if (closed) return;
    closed = true; ready = false; clearTimeout(readTimer); clearTimeout(handoffTimer); clearTimeout(resizeTimer); reader?.abort(); connector?.abort(); clearQueue(); observer?.disconnect();
    window.visualViewport?.removeEventListener('resize', viewport); window.visualViewport?.removeEventListener('scroll', viewport); window.removeEventListener('resize', viewport);
    if (session) fetch(endpoint + '/' + session, { method: 'DELETE', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' }).catch(() => {});
    session = ''; term?.dispose();
    if (opener && !opener.closed) opener.postMessage({ type: 'fakenet-olt-terminal-closed', channel, oltId }, location.origin);
  }
  async function read() {
    if (!session || closed) return;
    const id = session, token = generation; reader = new AbortController(); const timeout=setTimeout(()=>reader.abort(),10000);
    try {
      const value = await api(endpoint + '/' + id + '?' + new URLSearchParams({ since: offset, revision, wait: '1' }), { signal: reader.signal });
      if (closed || token !== generation || session !== id) return;
      if (value.reset) term.reset();
      if (value.output) await new Promise(resolve => term.write(value.output, resolve));
      offset = value.offset; revision = value.revision || 0; ready = value.state === 'ready';
      pending = Boolean(value.commandPending); password = Boolean(value.passwordInput); confirmation = Boolean(value.confirmationInput); pager = Boolean(value.pagerInput);
      if (value.state === 'closed') { session = ''; clearQueue(); reconnect.hidden = false; say(value.message || 'Sesi ditutup',true); }
      else if (status.dataset.error !== 'true') say(ready ? 'Terhubung' : 'Menghubungkan...');
      setKeys(); void drain();
    } catch (error) {
      if (!closed && token === generation) {
        await disconnect();
        if (error.status === 401 || error.status === 403) { term.reset(); say('Sesi login berakhir atau izin dicabut.', true); }
        else say(error.message, true);
      }
    } finally {
      clearTimeout(timeout);
      if (session === id && token === generation && !closed) readTimer = setTimeout(read, document.hidden ? 1000 : 0);
    }
  }
  function enqueue(value) {
    if (!ready || closed || handoff || typeof value !== 'string') return;
    if ((/[\r\n]/.test(value) && value.length !== 1) || /\x1d|\x00/.test(value)) { say('Tempel satu perintah per baris; perintah belum dikirim.', true); return; }
    if (queue.reduce((length, row) => length + row.length, 0) + value.length > 2048) { say('Antrean ketikan penuh. Tunggu respons terminal.', true); return; }
    if (ctrlArmed) {
      ctrlArmed = false; ctrl.setAttribute('aria-pressed','false');
      if (value.length === 1 && /[a-z]/i.test(value)) value = String.fromCharCode(value.toUpperCase().charCodeAt(0) & 31);
    }
    if (/^[\x20-\x7e]+$/.test(value) && queue.length && /^[\x20-\x7e]+$/.test(queue.at(-1)) && queue.at(-1).length + value.length <= 1024) queue[queue.length - 1] += value;
    else queue.push(value);
    clearTimeout(inputTimer); inputTimer = setTimeout(drain, /^[\x20-\x7e]+$/.test(value) ? 15 : 0);
  }
  async function drain() {
    if (sending || !ready || !session || closed || handoff) return;
    const urgent = queue.findIndex(value => value === '\x03' || value === '\x1a');
    if (urgent > 0 && pending && !password && !confirmation) queue.splice(0,urgent);
    const key = queue[0];
    if (!key && !requestedSize) return;
    if (pending && !password && !confirmation && key && !['\x03','\x1a','\x1b'].includes(key) && !(pager && [' ','\r','\n'].includes(key))) return;
    sending = true;
    const token = generation, id = session;
    const body = key ? { kind: 'keys', value: queue.shift() } : { kind: 'resize', ...requestedSize };
    if (body.kind === 'resize') { sentSize = requestedSize; requestedSize = null; }
    const next = sequence + 1;
    try {
      const value = await api(endpoint + '/' + id, { method: 'POST', body: JSON.stringify({ ...body, sequence: next }) });
      if (closed || token !== generation) return;
      sequence = value.sequence;pending=Boolean(value.commandPending);password=Boolean(value.passwordInput);confirmation=Boolean(value.confirmationInput);pager=Boolean(value.pagerInput);say('Terhubung');
      if (value.action === 'preview-delete-onu') {
        await disconnect(true); handoff = true; reconnect.hidden = true;
        if (!opener || opener.closed || !channel) throw Error('Buka daftar ONU untuk konfirmasi penghapusan. Belum ada ONU dihapus.');
        say('Menunggu konfirmasi hapus pada halaman OLT...');
        handoffTimer = setTimeout(() => { if (!closed && handoff) { handoff = false; reconnect.hidden = false; say('Konfirmasi hapus belum diterima. Belum ada ONU dihapus.',true); } },15000);
        opener.postMessage({ type: 'fakenet-olt-terminal-delete', channel, oltId, onu: value.onu }, location.origin);
      }
    } catch (error) {
      clearQueue();
      if (Number.isSafeInteger(error.sequence)) sequence = error.sequence;
      else if (session && token === generation) await disconnect();
      if (error.status === 401 || error.status === 403 && !Number.isSafeInteger(error.sequence)) term.reset();
      else if(!error.consoleReported&&Number.isSafeInteger(error.sequence))term.write('\r\n% Billing: '+String(error.message).replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,500)+'\r\n');
      say(error.message,true);
    } finally {
      sending = false;
      if (session && token === generation && !closed && !handoff) inputTimer = setTimeout(drain,0);
    }
  }
  function size() {
    fit.fit();
    const cols = Math.max(20,Math.min(400,term.cols)), rows = Math.max(4,Math.min(160,term.rows));
    if (cols !== term.cols || rows !== term.rows) term.resize(cols,rows);
    return { cols, rows };
  }
  async function connect() {
    if (connecting || closed) return;
    connecting = true; reconnect.hidden = true; say('Menghubungkan...');
    try {
      if (session) await disconnect(true);
      const me = await api('/api/auth/me'); csrf = me.csrfToken || '';
      if (!me.user?.permissions?.some(value => ['olt:manage','olt:onu:delete'].includes(value))) throw Error('Tidak memiliki izin terminal OLT.');
      const list = await api('/api/monitoring/olt'), device = list.devices.find(row => row.id === oltId);
      if(closed)return;
      if (!device || device.terminalAvailable !== true || device.simulated) throw Error('Akses CLI OLT ini belum tersedia.');
      document.getElementById('oltTerminalName').textContent = device.name; document.title = device.name + ' | Terminal OLT';
      say('Menunggu akses CLI...');
      connector=new AbortController();
      const token = ++generation, dimensions = size(), value = await api(endpoint, { method: 'POST', signal: AbortSignal.any([connector.signal,AbortSignal.timeout(25000)]), body: JSON.stringify({ confirm: true, revision: device.revision || '', mode: 'native', ...dimensions }) });
      if (closed || token !== generation) { await api(endpoint + '/' + value.id,{method:'DELETE',body:'{}'}).catch(()=>{});return; }
      if(value.mode!=='native'){await api(endpoint+'/'+value.id,{method:'DELETE',body:'{}'});throw Error('Runtime terminal belum diperbarui. Muat ulang aplikasi setelah update.');}
      session = value.id; offset = 0; revision = 0; sequence = 0; pending = false; sentSize = dimensions; requestedSize = null; clearQueue(); term.reset();
      void read(); term.focus();
    } catch (error) { if(!closed){say(error.status === 401 ? 'Silakan login kembali pada aplikasi billing.' : error.message,true);reconnect.hidden=false;} }
    finally { connector=null;connecting=false;setKeys(); }
  }
  if (!oltId || oltId.length > 100 || !/^[a-zA-Z0-9-]+$/.test(oltId) || !window.Terminal || !window.FitAddon) { say('Terminal tidak dapat dimuat.',true);return; }
  viewport();window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);
  term = new Terminal({ convertEol: false, cursorBlink: true, fontFamily:'Consolas, Menlo, monospace', fontSize:matchMedia('(pointer:coarse)').matches?14:13, scrollback:800, allowProposedApi:false, allowTransparency:false, ignoreBracketedPasteMode:true, linkHandler:{activate:()=>{}}, theme:{background:'#242628',foreground:'#e6e7e8',cursor:'#d4d4d4',selectionBackground:'#ffffff40'} });
  fit = new FitAddon.FitAddon();term.loadAddon(fit);term.open(screen);size();
  observer = new ResizeObserver(() => { clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const next=size();if(session&&(next.cols!==sentSize?.cols||next.rows!==sentSize?.rows)){requestedSize=next;void drain();}},100); });observer.observe(screen);
  term.onData(enqueue);term.attachCustomKeyEventHandler(event=>!(event.ctrlKey&&event.key.toLowerCase()==='c'&&term.hasSelection()));
  for(const button of document.querySelectorAll('[data-key],[data-text]')){button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>{enqueue(button.dataset.key?controls.get(button.dataset.key):button.dataset.text);hideExtra();term.focus();});}
  ctrl.addEventListener('pointerdown',event=>event.preventDefault());ctrl.addEventListener('click',()=>{ctrlArmed=!ctrlArmed;ctrl.setAttribute('aria-pressed',String(ctrlArmed));term.focus();});
  more.addEventListener('pointerdown',event=>event.preventDefault());more.addEventListener('click',()=>{extra.hidden=!extra.hidden;more.setAttribute('aria-expanded',String(!extra.hidden));term.focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.terminal-keys'))hideExtra();});
  reconnect.addEventListener('click',connect);document.getElementById('oltTerminalClose').addEventListener('click',async()=>{await disconnect();close();window.close();});
  window.addEventListener('pagehide',close);window.addEventListener('storage',event=>{if(event.key==='fakenetPaymentLogoutAt'&&event.newValue)close();});
  window.addEventListener('message',event=>{if(!handoff||event.source!==opener||event.origin!==location.origin||event.data?.channel!==channel||event.data?.oltId!==oltId||event.data?.type!=='fakenet-olt-terminal-delete-result')return;clearTimeout(handoffTimer);if(event.data.accepted){close();window.close();}else{handoff=false;reconnect.hidden=false;say('Penghapusan belum dikonfirmasi. Belum ada ONU dihapus.',true);}});
  setKeys();void connect();
})();
