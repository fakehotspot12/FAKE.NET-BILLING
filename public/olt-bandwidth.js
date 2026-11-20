/* Per-ONU bandwidth selection; native application always requires a fresh proof. */
(() => {
  'use strict';
  async function open({ row, selected, owner, openForm, esc, glyph, active }) {
    const base = '/api/monitoring/olt/' + encodeURIComponent(row.id);
    let unit = null, catalogue = null, plan = null, busy = false, finished = false;
    openForm('Profil Bandwidth ONU', `<div class="full olt-delete-info"><strong>${esc(selected.customerName || selected.name || selected.serialNumber)}</strong><span>${esc(selected.serialNumber)}</span></div>
      <label>Layanan VLAN<select name="servicePortId" disabled><option value="">Belum dibaca</option></select></label>
      <label>Profil Bandwidth<select name="profileChoice" disabled><option value="">Belum dibaca</option></select></label>
      <div class="full olt-form" id="oltOnuNativeProfiles" hidden><label>Profil Upload<select name="tcontProfile"></select></label><label>Profil Download<select name="trafficProfile"></select></label></div>
      <div class="full olt-bandwidth-current" id="oltOnuCurrentProfile"></div>
      <div class="full zte-profile-preview" id="oltOnuBandwidthPreview" role="status"></div>
      <div class="full olt-pnp-confirm" id="oltOnuBandwidthConfirmation" hidden><label>Ketik SN ONU<input name="confirmTarget" maxlength="12" autocomplete="off"></label><label class="olt-check"><input name="confirmImpact" type="checkbox">Saya menyetujui perubahan profil layanan ini.</label><label class="olt-check" id="oltOnuSharedConfirmation" hidden><input name="confirmSharedUpload" type="checkbox">Saya menyetujui perubahan batas upload bersama pada VLAN yang ditampilkan.</label></div>
      <p class="full" id="oltOnuBandwidthStatus" role="status" aria-live="polite"></p><p class="full olt-modal-error" id="oltModalError" role="alert"></p>
      <div class="full modal-actions olt-bridge-actions"><button type="button" class="ghost-button" data-close-modal>Tutup</button><button type="button" class="ghost-button" id="oltOnuBandwidthRead" title="Baca ulang layanan dan profil" aria-label="Baca ulang layanan dan profil">${glyph('refresh')}</button><button type="button" class="button" id="oltOnuBandwidthPrepare" disabled>Periksa</button><button type="button" class="button" id="oltOnuBandwidthApply" hidden>Terapkan</button></div>`, async () => false);
    const status = document.getElementById('oltOnuBandwidthStatus'), form = status.closest('form'), dialog = form.closest('dialog');
    const $ = id => form.querySelector('#' + id), read = $('oltOnuBandwidthRead'), prepare = $('oltOnuBandwidthPrepare'), apply = $('oltOnuBandwidthApply'), error = $('oltModalError');
    const present = () => form.isConnected && dialog.open && active();
    const rate = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(value / 1000) + ' Mbps';
    const opts = (rows, value = '') => '<option value="">Pilih profil</option>' + rows.map(item => `<option value="${esc(item.id)}" ${item.id === value ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
    const sync = () => {
      for (const control of form.querySelectorAll('input,select')) control.disabled = busy || finished || !unit;
      read.disabled = busy; prepare.disabled = busy || finished || !unit || !form.elements.profileChoice.value;
      apply.hidden = !plan || finished; apply.disabled = busy || finished;
      $('oltOnuBandwidthConfirmation').hidden = !plan || finished;
      $('oltOnuSharedConfirmation').hidden = !plan?.value.allocation?.sharedUpload;
      $('oltOnuNativeProfiles').hidden = form.elements.profileChoice.value !== 'native';
      for (const close of dialog.querySelectorAll('[data-close-modal],.modal-close')) close.disabled = busy;
    };
    const invalidate = () => {
      plan = null; $('oltOnuBandwidthPreview').replaceChildren();
      form.elements.confirmTarget.value = ''; form.elements.confirmImpact.checked = false; form.elements.confirmSharedUpload.checked = false;
      sync();
    };
    const showCurrent = () => {
      const service = unit?.services.find(item => String(item.id) === form.elements.servicePortId.value);
      const gem = unit?.gems.find(item => item.id === service?.gem), tc = unit?.tcont.find(item => item.id === gem?.tcont);
      $('oltOnuCurrentProfile').innerHTML = service ? `<span>Profil saat ini</span><strong>Upload: ${esc(tc?.profile || '-')}</strong><strong>Download: ${esc(gem?.downstream || '-')}</strong>` : '';
    };
    const load = async (force = false) => {
      if (busy || !present()) return;
      busy = true; finished = false; unit = null; invalidate(); error.textContent = ''; status.textContent = 'Membaca layanan ONU...';
      try {
        const details = await owner.api(base + '/service-profiles', { method: 'POST', timeoutMs: 22000, body: JSON.stringify({ action: 'inspect', address: selected.id, serialNumber: selected.serialNumber, force, ...(selected.modelSource === 'zte-configured-type' ? { type: selected.model } : {}) }) });
        if (!present()) return;
        let list = await owner.api(base + '/catalogue');
        if(!Number.isFinite(Date.parse(list.checkedAt))||Date.now()-Date.parse(list.checkedAt)>300000)list=await owner.api(base+'/catalogue',{method:'POST',timeoutMs:22000,body:JSON.stringify({action:'read'})});
        if (!present()) return;
        unit = details.onu; catalogue = list;
        form.elements.servicePortId.innerHTML = unit.services.map(item => `<option value="${item.id}">VLAN ${item.userVlan}${item.vlan !== item.userVlan ? ' \u2192 ' + item.vlan : ''} \u00b7 Layanan ${item.id}</option>`).join('') || '<option value="">Belum ada layanan</option>';
        const choices = (catalogue.profiles || []).filter(item => item.enabled !== false).map(item => ({ id: 'catalogue:' + item.id, label: item.label + ' \u00b7 ' + rate(item.uploadKbps) + ' / ' + rate(item.downloadKbps) }));
        form.elements.profileChoice.innerHTML = opts([...choices, { id: 'standard:60000', label: 'Standar 60 Mbps' }, { id: 'standard:120000', label: 'Standar 120 Mbps' }, { id: 'native', label: 'Pilih profil di OLT' }]);
        form.elements.tcontProfile.innerHTML = opts((catalogue.nativeProfiles?.upload || []).filter(item => item.type === 4 && item.fixed === 0 && item.assured === 0 && item.maximum >= 64 && item.maximum <= 1000000).map(item => ({ id: item.name, label: item.name + ' \u00b7 ' + rate(item.maximum) })));
        form.elements.trafficProfile.innerHTML = opts((catalogue.nativeProfiles?.download || []).filter(item => item.sir === 0 && item.pir >= 64 && item.pir <= 1000000).map(item => ({ id: item.name, label: item.name + ' \u00b7 ' + rate(item.pir) })));
        showCurrent(); status.textContent = 'Pilih layanan dan profil bandwidth.';
      } catch (problem) { if (present()) { unit = null; error.textContent = problem.message; status.textContent = 'Tidak ada konfigurasi yang diubah.'; } }
      finally { busy = false; if (present()) sync(); }
    };
    read.addEventListener('click', () => void load(true));
    prepare.addEventListener('click', async () => {
      if (busy || !unit || !present()) return;
      const choice = form.elements.profileChoice.value;
      if (!choice || !form.elements.servicePortId.value || choice === 'native' && (!form.elements.tcontProfile.value || !form.elements.trafficProfile.value)) { error.textContent = 'Pilih layanan, profil upload, dan profil download.'; return; }
      const selection = choice.startsWith('catalogue:') ? { profileMode: 'catalogue', profileId: choice.slice(10) } : choice === 'native' ? { profileMode: 'native', tcontProfile: form.elements.tcontProfile.value, trafficProfile: form.elements.trafficProfile.value } : { profileMode: 'standard', kbps: Number(choice.split(':')[1]) };
      busy = true; invalidate(); error.textContent = ''; status.textContent = 'Memeriksa profil dan dampak perubahan...';
      try {
        plan = await owner.api(base + '/bandwidth', { method: 'POST', timeoutMs: 22000, body: JSON.stringify({ action: 'prepare', kind: 'onu', address: unit.address, serialNumber: unit.serialNumber, type: unit.type, servicePortId: Number(form.elements.servicePortId.value), allowSharedUpload: true, ...selection }) });
        if (!present()) return;
        const value = plan.value, allocation = value.allocation, policy = value.policies[0];
        $('oltOnuBandwidthPreview').innerHTML = `<div class="zte-profile-result"><div><span>Upload</span><strong>${esc(rate(policy.kbps))}</strong><small>${esc(value.profiles[0].name)}</small></div><div><span>Download layanan terpilih</span><strong>${esc(rate(policy.downloadKbps ?? policy.kbps))}</strong><small>${esc(value.profiles[1].name)}</small></div></div>${allocation.sharedUpload ? `<p class="olt-bandwidth-shared">Upload dibagi oleh VLAN ${esc(allocation.sharedServices.map(item => item.userVlan).join(', '))} pada ONU ini. Profil download VLAN lain tidak berubah.</p>` : ''}`;
        form.elements.confirmTarget.placeholder = unit.serialNumber; status.textContent = 'VLAN, ID layanan, T-CONT, GEM, dan preset PON tetap.';
      } catch (problem) { if (present()) { plan = null; error.textContent = problem.message; status.textContent = 'Tidak ada konfigurasi yang diubah.'; } }
      finally { busy = false; if (present()) sync(); }
    });
    apply.addEventListener('click', async () => {
      if (busy || !plan || !present()) return;
      if (form.elements.confirmTarget.value !== plan.value.target.serialNumber || !form.elements.confirmImpact.checked || plan.value.allocation.sharedUpload && !form.elements.confirmSharedUpload.checked) { error.textContent = 'Isi SN yang sesuai dan centang persetujuan perubahan serta dampak upload bersama jika ada.'; return; }
      const input = { action: 'apply', token: plan.token, revision: plan.revision, confirmId: row.id, confirmTarget: form.elements.confirmTarget.value, confirmImpact: true, confirmSharedUpload: form.elements.confirmSharedUpload.checked };
      busy = true; sync(); error.textContent = ''; status.textContent = 'Menerapkan profil dan membaca ulang hasil...';
      try { const result = await owner.api(base + '/bandwidth', { method: 'POST', timeoutMs: 22000, body: JSON.stringify(input) }); if (present()) { status.textContent = result.message; status.className = result.verified ? 'full olt-test-ok' : 'full olt-test-failed'; } }
      catch (problem) { if (present()) { error.textContent = problem.message; status.textContent = 'Baca ulang layanan sebelum mencoba kembali.'; } }
      finally { busy = false; finished = true; plan = null; if (present()) sync(); }
    });
    const controls = new AbortController();
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); }, { signal: controls.signal });
    dialog.addEventListener('close', () => controls.abort(), { once: true, signal: controls.signal });
    form.addEventListener('change', event => { if (['servicePortId', 'profileChoice', 'tcontProfile', 'trafficProfile'].includes(event.target.name)) { invalidate(); error.textContent = ''; if (event.target.name === 'servicePortId') showCurrent(); } }, { signal: controls.signal });
    sync(); void load();
  }
  window.FakenetOltBandwidth = { open };
})();
