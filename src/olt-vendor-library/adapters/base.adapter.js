import { HttpError } from '../utils/http-error.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { normalizeVendorKey } from './vendor-normalization.js';

export class BaseOltAdapter {
  constructor(olt) {
    this.olt = olt;
  }

  vendorPrefix() {
    return this.olt.vendor || 'Generic';
  }

  unsupported(message) {
    throw new HttpError(501, message || `Adapter ${this.olt.vendor} belum diimplementasikan`);
  }

  async testConnection() {
    this.unsupported(`Test connection live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  async getUnregisteredOnu() {
    this.unsupported(`Scan ONU live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  async getDashboardStats() {
    return null;
  }

  async getRegisteredOnus() {
    const stats = await this.getDashboardStats().catch(() => null);
    if (Array.isArray(stats?.registered_onus)) {
      return stats.registered_onus;
    }

    const items = await this.getUnregisteredOnu();
    const registeredItems = items.filter(
      (item) => !/^unregistered$/i.test(String(item?.status || ''))
    );
    return typeof this.getBulkOnuDetails === 'function'
      ? this.getBulkOnuDetails(registeredItems)
      : registeredItems;
  }

  async searchOnu(criteria = {}) {
    void criteria;
    this.unsupported(`Pencarian ONU live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  async getOnuDetail(onu) {
    const base = {
      ...onu,
      last_seen: new Date().toISOString(),
      status: onu.status || 'unregistered',
      detail_source: 'database',
      services: {
        internet: false,
        tr069: false,
      },
    };

    const commands = this.buildLiveDetailCommands(onu);
    if (!commands.length) {
      return base;
    }

    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: false,
    });

    if (!execution.success) {
      return {
        ...base,
        detail_error: execution.error || execution.message || 'Live ONU detail read failed',
      };
    }

    const liveItems = this.parseLiveSnSearchResult({ sn: onu.sn }, execution.outputs || []);
    const normalizedSn = this.normalizeSnValue(onu.sn);
    const liveDetail =
      liveItems.find((item) => this.normalizeSnValue(item.sn) === normalizedSn) || liveItems[0];

    if (!liveDetail) {
      return {
        ...base,
        detail_error: 'ONU detail not found in live OLT output',
        live_detail_outputs: this.summarizeCommandOutputs(execution.outputs || []),
      };
    }

    return {
      ...base,
      ...liveDetail,
      id: onu.id,
      olt_id: onu.olt_id,
      olt_name: onu.olt_name,
      olt_vendor: onu.olt_vendor,
      discovered_at: onu.discovered_at,
      last_seen: new Date().toISOString(),
      rx_power: liveDetail.rx_power ?? base.rx_power,
      tx_power: liveDetail.tx_power ?? base.tx_power,
      distance: liveDetail.distance ?? base.distance,
      detail_source: 'live-olt',
      down_cause_label:
        typeof this.normalizeDownCause === 'function'
          ? this.normalizeDownCause(liveDetail.down_cause)
          : liveDetail.down_cause || null,
      services: base.services,
      live_detail_outputs: this.summarizeCommandOutputs(execution.outputs || []),
    };
  }

  async getBulkOnuDetails(items = []) {
    return items;
  }

  getVendorPriority() {
    return 999;
  }

  getCommandNotes() {
    return [
      'Vendor command set masih template.',
      'Jangan kirim raw command dari frontend.',
      'Isi syntax final setelah uji per model OLT dan firmware.',
    ];
  }

  getProbePresets() {
    return [
      {
        key: 'identity',
        title: 'OLT Identity',
        description: 'Read-only probe for hostname, version, and running context',
        commands: ['show version', 'show system', 'show running-config | include hostname'],
      },
      {
        key: 'pon-discovery',
        title: 'PON Discovery',
        description: 'Read-only probe for unregistered ONU and PON inventory',
        commands: ['show onu unregistered', 'show pon interface status'],
      },
      {
        key: 'onu-status',
        title: 'ONU Status',
        description: 'Read-only probe for registered ONU status and optics',
        commands: ['show onu state', 'show onu optical-info'],
      },
    ];
  }

  getProbePreset(key) {
    return (
      this.getProbePresets().find((item) => item.key === key) || this.getProbePresets()[0]
    );
  }

  buildLiveSnSearchCommands(_sn) {
    return [];
  }

  buildLiveDetailCommands(onu) {
    return this.buildLiveSnSearchCommands(onu?.sn);
  }

  parseLiveSnSearchResult(_criteria, _outputs) {
    return [];
  }

  normalizeSnValue(sn) {
    return String(sn || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  summarizeCommandOutputs(outputs = []) {
    return outputs.map((entry) => ({
      command: entry.command,
      stdout: String(entry.stdout || '').slice(0, 4000),
      stderr: String(entry.stderr || '').slice(0, 1000),
    }));
  }

  buildPlanStep(step, command, note) {
    return {
      step,
      command,
      note,
    };
  }

  flattenPlan(plan) {
    return plan.map((item) => `${item.step}: ${item.command}`);
  }

  getProvisioningCommands({ action, onu, profile }) {
    return this.getCommandCatalog({ action, onu, profile })
      .flatMap((item) => String(item.command || '').split('\n'))
      .map((command) => command.trim())
      .filter((command) => command && command.toLowerCase() !== 'skip' && !command.startsWith('#'));
  }

  validateProvisioningTarget({ onu, profile }) {
    if (!onu?.sn) {
      throw new HttpError(422, 'SN ONU wajib ada sebelum provisioning live');
    }

    if (onu?.slot == null || onu?.pon == null || onu?.onu_id == null) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi sebelum provisioning live');
    }

    const profileVendor = normalizeVendorKey(profile?.vendor);
    const oltVendor = normalizeVendorKey(this.olt.vendor);
    if (profileVendor && profileVendor !== oltVendor) {
      throw new HttpError(422, `Profile ${profile.name} tidak cocok untuk vendor OLT ${this.olt.vendor}`);
    }

    if (profile?.internet_service_enabled && !Number(profile.vlan_internet)) {
      throw new HttpError(422, 'VLAN internet wajib diisi jika service internet aktif');
    }

    if (profile?.tr069_service_enabled && !Number(profile.vlan_tr069)) {
      throw new HttpError(422, 'VLAN TR-069 wajib diisi jika service TR-069 aktif');
    }
  }

  validateExecutableCommands(commands) {
    if (!commands.length) {
      throw new HttpError(422, 'Tidak ada command provisioning yang bisa dieksekusi');
    }

    const unresolved = commands.filter((command) => /<[^>]+>/.test(command));
    if (unresolved.length) {
      throw new HttpError(
        422,
        `Plan masih punya placeholder dan belum aman dieksekusi: ${unresolved.join(', ')}`
      );
    }
  }

  detectCommandFailure(outputs = []) {
    return outputs.find((entry) => {
      const text = `${entry.stderr || ''}\n${entry.stdout || ''}`;
      if (/\b(GEM|T-CONT|tcont)\b.*\balready exists\b/i.test(text)) {
        return false;
      }
      return /(^|\n)\s*(% ?)?(error|invalid|unrecognized command|unknown command|command not found|failed|denied|incomplete command|ambiguous command)\b/i.test(text);
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    const lanPorts = [1, 2, 3, 4]
      .filter((index) => profile?.[`lan${index}_enabled`])
      .map((index) => `LAN${index}`);

    return [
      this.buildPlanStep('connect', 'login terminal', `Open session to ${this.olt.host}`),
      this.buildPlanStep('discover', `show onu autofind sn ${onu.sn}`, 'Locate ONU by SN'),
      this.buildPlanStep(
        'authorize',
        action === 'register' ? `onu add sn ${onu.sn}` : `show onu running sn ${onu.sn}`,
        action === 'register' ? 'Authorize/register ONU' : 'Reuse authorized ONU'
      ),
      this.buildPlanStep(
        'line-profile',
        profile?.line_profile ? `profile line bind ${profile.line_profile}` : 'skip',
        'Apply line profile when needed'
      ),
      this.buildPlanStep(
        'service-profile',
        profile?.service_profile ? `profile service bind ${profile.service_profile}` : 'skip',
        'Apply service profile when needed'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service create internet vlan ${profile.vlan_internet}`
          : 'skip',
        'Create internet service VLAN'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service create tr069 vlan ${profile.vlan_tr069}`
          : 'skip',
        'Create TR-069 service VLAN'
      ),
      this.buildPlanStep(
        'lan-binding',
        lanPorts.length ? `lan bind ${lanPorts.join(',')}` : 'skip',
        'Bind UNI/LAN ports'
      ),
      this.buildPlanStep('save', 'write memory', 'Save running configuration'),
      this.buildPlanStep('verify', `show onu detail sn ${onu.sn}`, 'Verify ONU state after provisioning'),
    ];
  }

  generatePlan({ action, onu, profile }) {
    return this.flattenPlan(this.getCommandCatalog({ action, onu, profile }));
  }

  async executeProvisioning({ action, onu, profile }) {
    this.validateProvisioningTarget({ onu, profile });
    const commands = this.getProvisioningCommands({ action, onu, profile });
    this.validateExecutableCommands(commands);

    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
    });

    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const success = Boolean(execution.success && !failedOutput);
    const actionLabel = action === 'register' ? 'Register ONU' : 'Apply profile';

    return {
      success,
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `${actionLabel} selesai dengan indikasi error pada command: ${failedOutput.command}`
          : `${actionLabel} live selesai untuk ${onu.sn}`),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      plan: this.generatePlan({ action, onu, profile }),
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
    };
  }

  async registerOnu({ onu, profile }) {
    return this.executeProvisioning({ action: 'register', onu, profile });
  }

  async applyProvisioningProfile({ onu, profile }) {
    return this.executeProvisioning({ action: 'apply-profile', onu, profile });
  }

  async rebootOnu({ onu }) {
    void onu;
    this.unsupported(`Reboot ONU live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  supportsOnuReboot() {
    return false;
  }

  async deleteOnuFromOlt({ onu }) {
    void onu;
    this.unsupported(`Delete ONU live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  supportsOnuDelete() {
    return false;
  }

  supportsOnuDescriptionUpdate() {
    return false;
  }

  buildOntConfigLoadPlan({ onu, tftpServer, cfgFile }) {
    void onu;
    void tftpServer;
    void cfgFile;
    this.unsupported(`ONT config load live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  async loadOntConfigFromTftp({ onu, tftpServer, cfgFile }) {
    void onu;
    void tftpServer;
    void cfgFile;
    this.unsupported(`ONT config load live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  supportsOntConfigLoad() {
    return false;
  }

  buildOnuDescriptionCommands({ onu, description }) {
    void onu;
    void description;
    this.unsupported(`Edit description ONU live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  async updateOnuDescription({ onu, description }) {
    const commands = this.buildOnuDescriptionCommands({ onu, description });
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
    });

    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const success = Boolean(execution.success && !failedOutput);

    return {
      success,
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `Edit description selesai dengan indikasi error pada command: ${failedOutput.command}`
          : `Description ONU ${onu.sn} berhasil dikirim ke OLT`),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
    };
  }

  async executeSaveConfigCommands({ commands, successMessage }) {
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
    });

    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const success = Boolean(execution.success && !failedOutput);

    return {
      success,
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `Save config selesai dengan indikasi error pada command: ${failedOutput.command}`
          : successMessage || `Save config OLT ${this.olt.name} selesai`),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
    };
  }

  async saveConfig() {
    this.unsupported(`Save config live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  buildTr069WanPlan({ onu, vlan, acsUrl, setAcs }) {
    const commands = [
      'enable',
      'system-view',
      `# specific-profile for ONU ${onu.sn}`,
      `ont wan-config 1 mode route dhcp service-type tr069 vlan ${vlan}`,
    ];
    if (setAcs && acsUrl) {
      commands.push('ont tr069-acs');
      commands.push(`ont tr069-acs-server url ${acsUrl} inform enable interval 120`);
    }
    commands.push('commit');
    return commands;
  }

  async ensureTr069Wan({ onu, vlan, acsUrl, setAcs, natEnabled }) {
    void onu;
    void vlan;
    void acsUrl;
    void setAcs;
    void natEnabled;
    this.unsupported(`Action TR-069 live untuk vendor ${this.olt.vendor} belum diimplementasikan`);
  }

  supportsTr069Wan() {
    return false;
  }
}
