import { BaseOltAdapter } from './base.adapter.js';

export class ZteAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'ZTE';
  }

  getVendorPriority() {
    return 4;
  }

  getCommandNotes() {
    return [
      'Prioritas implementasi vendor keempat.',
      'Plan mengikuti pola ZXA10 C300/C320 yang umum: onu-type, interface gpon-onu, service-port.',
      'Masih perlu validasi terhadap command reference ZTE sesuai release software yang dipakai.',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write'],
      successMessage: `Save config ZTE OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode'),
      this.buildPlanStep('configure', 'configure terminal', 'Masuk mode konfigurasi'),
      this.buildPlanStep('pon', 'pon', 'Masuk konteks PON ZTE'),
      this.buildPlanStep(
        'discover',
        `show gpon onu uncfg | include ${onu.sn}`,
        'Cari ONU belum terdaftar'
      ),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon-olt_1/${onu.slot || 0}/${onu.pon || 0}\n onu ${onu.onu_id || 1} type AUTO sn ${onu.sn}`
          : `show running-config interface gpon-onu_1/${onu.slot || 0}/${onu.pon || 0}:${onu.onu_id || 1}`,
        'Register atau cek ONU existing'
      ),
      this.buildPlanStep(
        'line-profile',
        profile?.line_profile ? `onu bind line-profile ${profile.line_profile}` : 'skip',
        'Bind line profile'
      ),
      this.buildPlanStep(
        'service-profile',
        profile?.service_profile ? `onu bind srv-profile ${profile.service_profile}` : 'skip',
        'Bind service profile'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service-port 1 vport 1 user-vlan ${profile.vlan_internet} vlan ${profile.vlan_internet}`
          : 'skip',
        'Create internet service-port'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port 2 vport 2 user-vlan ${profile.vlan_tr069} vlan ${profile.vlan_tr069}`
          : 'skip',
        'Create TR-069 service-port'
      ),
      this.buildPlanStep('save', 'write', 'Save configuration'),
      this.buildPlanStep('verify', `show onu detail sn ${onu.sn}`, 'Verify ONU state'),
    ];
  }
}
