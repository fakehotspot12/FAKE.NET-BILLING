import { BaseOltAdapter } from './base.adapter.js';

export class FiberhomeAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'Fiberhome';
  }

  getVendorPriority() {
    return 8;
  }

  getCommandNotes() {
    return [
      'Template Fiberhome mengikuti pola AN-series yang umum.',
      'Nama DBA/line/service profile perlu disesuaikan dengan template di OLT produksi.',
      'Jangan gunakan profile Fiberhome untuk vendor lain.',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write'],
      successMessage: `Save config Fiberhome OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    const slot = Number(onu.slot ?? 0);
    const pon = Number(onu.pon ?? 0);
    const ontId = Number(onu.onu_id ?? 1);
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode Fiberhome'),
      this.buildPlanStep('configure', 'configure terminal', 'Masuk mode konfigurasi Fiberhome'),
      this.buildPlanStep('discover', `show authorization slot ${slot} pon ${pon}`, 'Cari ONU unauthorized Fiberhome'),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon ${slot}/${pon}\nonu ${ontId} sn ${onu.sn} line-profile ${profile?.line_profile || '<line-profile>'} service-profile ${profile?.service_profile || '<service-profile>'}`
          : `show onu running-config slot ${slot} pon ${pon} onu ${ontId}`,
        'Authorize atau cek ONU Fiberhome'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service-port vlan ${profile.vlan_internet} slot ${slot} pon ${pon} onu ${ontId} gemport 1 user-vlan ${profile.vlan_internet}`
          : 'skip',
        'Service VLAN internet Fiberhome'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port vlan ${profile.vlan_tr069} slot ${slot} pon ${pon} onu ${ontId} gemport 2 user-vlan ${profile.vlan_tr069}`
          : 'skip',
        'Service VLAN TR069 Fiberhome'
      ),
      this.buildPlanStep('save', 'write', 'Save config Fiberhome'),
      this.buildPlanStep('verify', `show onu info slot ${slot} pon ${pon} onu ${ontId}`, 'Verifikasi ONU Fiberhome'),
    ];
  }
}
