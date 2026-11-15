import { BaseOltAdapter } from './base.adapter.js';

export class BdcomAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'BDCOM';
  }

  getVendorPriority() {
    return 3;
  }

  getCommandNotes() {
    return [
      'Prioritas implementasi vendor ketiga.',
      'Plan mengikuti pola GPON OLT CLI BDCOM/Baudcom yang umum dipakai.',
      'Syntax final service-port dan ONU mode perlu dicocokkan ke model dan firmware produksi.',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write'],
      successMessage: `Save config BDCOM OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode'),
      this.buildPlanStep('configure', 'configure terminal', 'Masuk mode konfigurasi'),
      this.buildPlanStep(
        'discover',
        `show gpon onu uncfg | include ${onu.sn}`,
        'Cari ONU unconfigured'
      ),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon0/${onu.slot || 0}\n onu add ${onu.pon || 0} sn ${onu.sn}`
          : `show gpon onu-profile ${onu.onu_id || 1}`,
        'Register atau cek ONU'
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
          ? `service-port 1 vlan ${profile.vlan_internet} gpon 0/${onu.slot || 0}/${onu.pon || 0} onu ${onu.onu_id || 1}`
          : 'skip',
        'Create internet VLAN service'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port 2 vlan ${profile.vlan_tr069} gpon 0/${onu.slot || 0}/${onu.pon || 0} onu ${onu.onu_id || 1}`
          : 'skip',
        'Create TR-069 VLAN service'
      ),
      this.buildPlanStep('save', 'write', 'Save configuration'),
      this.buildPlanStep('verify', `show gpon onu state ${onu.onu_id || 1}`, 'Verify ONU state'),
    ];
  }
}
