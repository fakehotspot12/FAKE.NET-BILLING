(() => {
  'use strict';
  async function open({ row, selected, owner, openForm, esc, glyph, active }) {
    const endpoint = '/api/monitoring/olt/' + encodeURIComponent(row.id) + '/bridge';
    let state = null, plan = null, busy = false, finished = false;
    openForm('Port LAN dan WiFi', `<div class="full olt-delete-info"><strong>${esc(selected.customerName || selected.name || selected.serialNumber)}</strong><span>${esc(selected.serialNumber)} &middot; <span id="oltBridgeModel">Model belum dibaca</span></span></div>
      <fieldset class="full zte-profile-modes"><legend>Jenis Port</legend><label><input type="radio" name="kind" value="lan" checked>LAN</label><label><input type="radio" name="kind" value="wlan">SSID WiFi</label></fieldset>
      <details class="full olt-bridge-bindings" open><summary>Daftar Port</summary><div id="oltBridgePorts"></div></details>
      <label><span id="oltBridgePortLabel">Port LAN</span><select name="port" required disabled><option value="">Baca antarmuka terlebih dahulu</option></select></label>
      <label>Mode Bridge<select name="mode" required><option value="">Pilih mode</option><option value="access">Access - VLAN untagged</option><option value="trunk">Trunk - VLAN tagged</option></select></label>
      <fieldset class="full zte-profile-vlans"><legend>VLAN Layanan</legend><div id="oltBridgeVlans"></div></fieldset>
      <div class="full zte-profile-preview" id="oltBridgePreview" role="status"></div>
      <div class="full olt-pnp-confirm" id="oltBridgeConfirmation" hidden><label>Ketik SN ONU<input name="confirmTarget" autocomplete="off" maxlength="12"></label><label class="olt-check"><input name="confirmImpact" type="checkbox">Saya menyetujui perubahan antarmuka terpilih dan kemungkinan koneksinya terputus.</label></div>
      <p class="full" id="oltBridgeStatus" role="status" aria-live="polite"></p><p class="full olt-modal-error" id="oltModalError" role="alert"></p>
      <div class="full modal-actions olt-bridge-actions"><button type="button" class="ghost-button" data-close-modal>Tutup</button><button type="button" class="ghost-button" id="oltBridgeRead" title="Baca ulang antarmuka" aria-label="Baca ulang antarmuka">${glyph('refresh')}</button><button type="button" class="button" id="oltBridgePrepare" title="Periksa perubahan" disabled>Periksa</button><button type="button" class="button" id="oltBridgeApply" hidden>Terapkan</button></div>`, async () => false);
    const status = document.getElementById('oltBridgeStatus'), form = status.closest('form'), dialog = form.closest('dialog');
    const error = form.querySelector('#oltModalError'), preview = form.querySelector('#oltBridgePreview'), read = form.querySelector('#oltBridgeRead'), prepare = form.querySelector('#oltBridgePrepare'), apply = form.querySelector('#oltBridgeApply');
    const present = () => form.isConnected && dialog?.open && active();
    const sync = () => {
      const ready = state?.ports.some(port => port.editable !== false),port=state?.ports.find(item=>item.name===form.elements.port.value);
      for (const input of form.querySelectorAll('input,select')) input.disabled = busy || finished || !ready;
      for (const input of form.querySelectorAll('[name="kind"]')) input.disabled = busy;
      for (const button of form.querySelectorAll('[data-bridge-port]')) button.disabled = busy || finished || !state || state.ports.find(port => port.name === button.dataset.bridgePort)?.editable === false;
      form.elements.mode.querySelector('[value="trunk"]').disabled = form.elements.kind.value === 'wlan';
      read.disabled = busy; prepare.disabled = busy || finished || !ready || !port || port.editable===false || !form.elements.mode.value || !selectedVlans().length;
      apply.hidden = !plan || finished; apply.disabled = busy || finished;
      form.querySelector('#oltBridgeConfirmation').hidden = !plan || finished;
      for (const close of dialog.querySelectorAll('[data-close-modal],.modal-close')) close.disabled = busy;
    };
    const invalidate = () => { plan = null; preview.replaceChildren(); form.elements.confirmTarget.value = ''; form.elements.confirmImpact.checked = false; sync(); };
    const selectedVlans = () => [...form.querySelectorAll('[name="vlans"]:checked')].map(input => Number(input.value));
    const portLabel = port => port.name.startsWith('wifi_') ? `${port.ssid || 'SSID belum terbaca'} (${port.name})${port.band ? ' - ' + (port.band === '2.4' ? '2,4' : '5') + ' GHz' : ''}` : port.name.replace('eth_0/', 'LAN ');
    const renderBindings = () => {
      form.querySelector('#oltBridgePorts').innerHTML = (state?.ports || []).map(port => {
        const vlans = port.filters?.length ? [...new Set(port.filters.map(row => row.vlan))] : port.vlan ? [port.vlan] : [];
        return `<div class="olt-bridge-binding" ${form.elements.port.value === port.name ? 'data-selected' : ''}><div><strong>${esc(portLabel(port))}</strong><small>${port.mode === 'trunk' ? 'Trunk' : port.mode === 'tag' ? 'Access' : 'Belum ada binding eksplisit'}${vlans.length ? ' / VLAN ' + esc(vlans.join(', ')) : ''}${port.editable===false?' / Dilindungi atau belum terverifikasi':''}</small></div><button type="button" class="olt-icon" data-bridge-port="${esc(port.name)}" title="Edit binding ${esc(portLabel(port))}" aria-label="Edit binding ${esc(portLabel(port))}" ${port.editable === false || busy ? 'disabled' : ''}>${glyph('edit')}</button></div>`;
      }).join('') || '<p class="olt-bridge-empty">Antarmuka belum dilaporkan.</p>';
    };
    const updateState = result => {
      state = result;
      form.querySelector('#oltBridgeModel').textContent = result.model;
      const previous = form.elements.port.value;
      form.elements.port.innerHTML = '<option value="">Pilih ' + (form.elements.kind.value === 'wlan' ? 'SSID WiFi' : 'port LAN') + '</option>' + result.ports.map(port => `<option value="${esc(port.name)}" ${port.editable === false ? 'disabled' : ''}>${esc(portLabel(port))}${port.editable === false ? ' - Belum terverifikasi / dilindungi' : ''}</option>`).join('');
      if (result.ports.some(port => port.name === previous && port.editable !== false)) form.elements.port.value = previous;
      form.querySelector('#oltBridgeVlans').innerHTML = result.vlans.map(id => {const service=result.services?.find(row=>row.userVlan===id);return `<label><input type="checkbox" name="vlans" value="${id}"><span>${id}${service&&service.vlan!==id?' → '+service.vlan:''}</span></label>`;}).join('') || '<span>Belum ada VLAN layanan yang dapat dipilih.</span>';
      renderBindings();
    };
    const renderPort = () => {
      const port = state?.ports.find(item => item.name === form.elements.port.value);
      form.elements.mode.value = form.elements.kind.value === 'wlan' ? 'access' : port?.mode === 'trunk' ? 'trunk' : port?.mode === 'tag' ? 'access' : '';
      for (const input of form.querySelectorAll('[name="vlans"]')) input.checked = Boolean(port?.filters.some(row => row.vlan === Number(input.value)) || port?.vlan === Number(input.value));
      status.textContent = port ? `${portLabel(port)} / ${port.mode === 'trunk' ? 'Trunk' : port.mode === 'tag' ? 'Bridge Access' : 'Belum ada binding OMCI'}` : '';
      renderBindings();
    };
    const load = async (force = false) => {
      if (busy || !present()) return;
      const kind = form.elements.kind.value;
      busy = true; finished = false; state = null; invalidate(); sync(); error.textContent = ''; status.textContent = 'Membaca antarmuka dan layanan ONU...';
      form.querySelector('#oltBridgePortLabel').textContent = kind === 'wlan' ? 'SSID WiFi' : 'Port LAN';
      form.elements.mode.value = kind === 'wlan' ? 'access' : '';
      form.elements.mode.querySelector('[value="trunk"]').hidden = kind === 'wlan';
      try {
        const result = await owner.api(endpoint, { method: 'POST', timeoutMs: 22000, body: JSON.stringify({ action: 'read', kind, force, address: selected.id, serialNumber: selected.serialNumber }) });
        if (!present() || form.elements.kind.value !== kind) return;
        if ((result.kind || 'lan') !== kind) throw Error('Backend belum mendukung antarmuka ini. Muat ulang setelah pembaruan selesai.');
        updateState(result);
        status.textContent = result.unavailableReason || 'VLAN management ' + result.protectedVlans.join(', ') + ' dilindungi.';
      } catch (problem) { if (present()) { state = null; error.textContent = problem.message; status.textContent = 'Tidak ada konfigurasi yang diubah.'; } }
      finally { busy = false; if (present()) sync(); }
    };
    read.addEventListener('click', () => void load(true));
    prepare.addEventListener('click', async () => {
      if (busy || !state || !present()) return;
      const vlans = selectedVlans();
      if (!form.elements.port.value || !form.elements.mode.value || !vlans.length || form.elements.mode.value === 'access' && vlans.length !== 1) { error.textContent = 'Pilih port, mode, dan VLAN. Bridge Access memakai satu VLAN.'; return; }
      busy = true; invalidate(); sync(); error.textContent = ''; status.textContent = 'Memeriksa identitas ONU dan perubahan port...';
      try {
        const result = await owner.api(endpoint, { method: 'POST', timeoutMs: 22000, body: JSON.stringify({ action: 'prepare', ...state.target, kind: form.elements.kind.value, port: form.elements.port.value, mode: form.elements.mode.value, vlans }) });
        if (!present()) return; plan = result;
        const value = result.value;
        const previousVlans=[...new Set(value.previous.filters?.map(item=>item.vlan)||[])];if(value.previous.vlan&&!previousVlans.includes(value.previous.vlan))previousVlans.push(value.previous.vlan);
        preview.innerHTML = `<div class="zte-profile-result"><div><span>Sebelumnya</span><strong>${value.previous.mode==='trunk'?'Trunk':value.previous.mode==='tag'?'Access':'Default modem'}</strong><small>${previousVlans.length?'VLAN '+esc(previousVlans.join(', ')):'Belum ada binding eksplisit'}</small></div><div><span>${esc(value.kind === 'wlan' ? portLabel(value.previous) : value.port.replace('eth_0/', 'LAN '))}</span><strong>${value.mode === 'trunk' ? 'Trunk' : 'Access'}</strong><small>VLAN ${esc(value.vlans.join(', '))}</small></div></div>`;
        form.elements.confirmTarget.placeholder = value.target.serialNumber;
        status.textContent = value.kind === 'wlan' ? 'Hanya binding VLAN SSID terpilih. Nama, password WiFi, radio dan SSID lain dipertahankan.' : 'Hanya port LAN terpilih. WAN management, PPPoE, WiFi dan layanan lain dipertahankan.';
      } catch (problem) { if (present()) { plan = null; error.textContent = problem.message; status.textContent = 'Tidak ada konfigurasi yang diubah.'; } }
      finally { busy = false; if (present()) sync(); }
    });
    apply.addEventListener('click', async () => {
      if (busy || !plan || !present()) return;
      if (form.elements.confirmTarget.value !== plan.value.target.serialNumber || !form.elements.confirmImpact.checked) { error.textContent = 'Isi SN yang sesuai dan centang persetujuan.'; return; }
      const input = { action: 'apply', token: plan.token, revision: plan.revision, confirmId: row.id, confirmTarget: form.elements.confirmTarget.value, confirmImpact: true };
      busy = true; sync(); error.textContent = ''; status.textContent = 'Menerapkan binding dan memverifikasi OMCI...';let refreshed = false;
      try {
        const result = await owner.api(endpoint, { method: 'POST', timeoutMs: 22000, body: JSON.stringify(input) });
        if (!present()) return;
        if (result.verified && result.snapshot && result.snapshot.kind === form.elements.kind.value) { updateState(result.snapshot); renderPort(); preview.replaceChildren(); form.elements.confirmTarget.value = ''; form.elements.confirmImpact.checked = false; refreshed = true; }
        status.textContent = result.message; status.className = result.verified ? 'full olt-test-ok' : 'full olt-test-failed';
      } catch (problem) { if (present()) { error.textContent = problem.message; status.textContent = 'Baca ulang konfigurasi sebelum mencoba kembali.'; } }
      finally { busy = false; finished = !refreshed; plan = null; if (!refreshed) state = null; if (present()) { sync(); renderBindings(); } }
    });
    const controls = new AbortController();
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); }, { signal: controls.signal });
    dialog.addEventListener('close', () => controls.abort(), { once: true, signal: controls.signal });
    form.addEventListener('change', event => {
      if (event.target.name === 'kind') { invalidate(); void load(); return; }
      if (['port', 'mode', 'vlans'].includes(event.target.name)) {
        invalidate(); error.textContent = ''; if (event.target.name === 'port') renderPort();
        if(form.elements.mode.value==='access'){
          const checked=[...form.querySelectorAll('[name="vlans"]:checked')];
          if(event.target.name==='vlans'&&event.target.checked)checked.forEach(input=>{if(input!==event.target)input.checked=false;});
          else if(event.target.name==='mode'&&checked.length>1)checked.forEach(input=>input.checked=false);
        }
        sync();
      }
    }, { signal: controls.signal });
    form.querySelector('#oltBridgePorts').addEventListener('click', event => {
      const button = event.target.closest('[data-bridge-port]');
      if (!button || button.disabled || busy || !state) return;
      form.elements.port.value = button.dataset.bridgePort; invalidate(); error.textContent = ''; renderPort(); sync();
      form.elements.mode.focus();
    }, { signal: controls.signal });
    sync(); void load();
  }
  window.FakenetOltBridge = { open };
})();
