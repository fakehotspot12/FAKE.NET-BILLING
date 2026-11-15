import { BaseOltAdapter } from './base.adapter.js';

export class VsolAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'VSOL';
  }

  getVendorPriority() {
    return 7;
  }

  getCommandNotes() {
    return [
      'Template VSOL mengikuti pola CLI GPON VSOL/V-SOL yang umum.',
      'Validasi ulang nama interface GPON dan format service VLAN sesuai firmware.',
      'Jangan gunakan template VSOL untuk vendor lain.',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write memory'],
      successMessage: `Save config VSOL OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    const slot = Number(onu.slot ?? 0);
    const pon = Number(onu.pon ?? 0);
    const ontId = Number(onu.onu_id ?? 1);
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode VSOL'),
      this.buildPlanStep('configure', 'configure terminal', 'Masuk mode konfigurasi VSOL'),
      this.buildPlanStep('discover', `show onu unauthentication | include ${onu.sn}`, 'Cari ONU unauthorized VSOL'),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon 0/${slot}\nonu ${ontId} ${pon} sn ${onu.sn} line-profile ${profile?.line_profile || '<line-profile>'} srv-profile ${profile?.service_profile || '<service-profile>'}`
          : `show running-config interface gpon 0/${slot}`,
        'Authorize atau cek ONU VSOL'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service-port vlan ${profile.vlan_internet} gpon 0/${slot}/${pon} onu ${ontId} gemport 1 user-vlan ${profile.vlan_internet}`
          : 'skip',
        'Service VLAN internet VSOL'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port vlan ${profile.vlan_tr069} gpon 0/${slot}/${pon} onu ${ontId} gemport 2 user-vlan ${profile.vlan_tr069}`
          : 'skip',
        'Service VLAN TR069 VSOL'
      ),
      this.buildPlanStep('save', 'write memory', 'Save config VSOL'),
      this.buildPlanStep('verify', `show onu information gpon 0/${slot}/${pon} ${ontId}`, 'Verifikasi ONU VSOL'),
    ];
  }
}
