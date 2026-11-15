import { BaseOltAdapter } from './base.adapter.js';

export class HuaweiAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'Huawei';
  }

  getVendorPriority() {
    return 6;
  }

  getCommandNotes() {
    return [
      'Template Huawei mengikuti pola MA5600/MA5800 yang umum.',
      'Pastikan format frame/slot/port dan profile line/service sesuai OLT produksi.',
      'Jangan gunakan profile vendor lain untuk OLT Huawei.',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'save'],
      successMessage: `Save config Huawei OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    const frame = 0;
    const slot = Number(onu.slot ?? 0);
    const pon = Number(onu.pon ?? 0);
    const ontId = Number(onu.onu_id ?? 1);
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode Huawei'),
      this.buildPlanStep('configure', 'config', 'Masuk mode konfigurasi Huawei'),
      this.buildPlanStep('discover', `display ont autofind ${frame}/${slot}/${pon}`, 'Cari ONT autofind pada port GPON'),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon ${frame}/${slot}\nont add ${pon} ${ontId} sn-auth ${onu.sn} omci ont-lineprofile-name ${profile?.line_profile || '<line-profile>'} ont-srvprofile-name ${profile?.service_profile || '<service-profile>'} desc "${onu.description || onu.sn}"`
          : `display current-configuration ont ${frame}/${slot}/${pon} ${ontId}`,
        'Authorize atau cek ONT existing'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service-port vlan ${profile.vlan_internet} gpon ${frame}/${slot}/${pon} ont ${ontId} gemport 1 multi-service user-vlan ${profile.vlan_internet} tag-transform translate`
          : 'skip',
        'Service-port internet Huawei'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port vlan ${profile.vlan_tr069} gpon ${frame}/${slot}/${pon} ont ${ontId} gemport 2 multi-service user-vlan ${profile.vlan_tr069} tag-transform translate`
          : 'skip',
        'Service-port TR069 Huawei'
      ),
      this.buildPlanStep('save', 'save', 'Save config Huawei'),
      this.buildPlanStep('verify', `display ont info ${frame} ${slot} ${pon} ${ontId}`, 'Verifikasi status ONT Huawei'),
    ];
  }
}
