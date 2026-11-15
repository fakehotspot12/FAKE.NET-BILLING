export const TARMOC_LIVE_TEMPLATE = {
  vendor: 'Tarmoc',
  source: 'imported-command-reference; write actions locked in billing',
  prompt: {
    user: 'GPON>',
    privileged: '<GPON>',
    config: '[GPON]',
    specificProfile: '[GPON-specific-profile-x/x/x]',
  },
  modes: {
    privileged: 'enable',
    config: 'system-view',
    save: 'commit',
  },
  contexts: {
    snAuth: 'rule-profile x/x/x',
    wanProfile: 'specific-profile x/x/x',
    gponInterface: 'interface gpon 0/2/x',
  },
  confirmedPatterns: {
    gponAutofind: 'ont-autofind interface gpon all',
    snAuth: 'sn-auth string-hex <SN> line-profile <LINE_PROFILE>',
    tr069Wan: 'currently disabled; IP Host template only pushes GenieACS URL',
    internetWan:
      'ont wan-config 2 mode route pppoe username <USER> password <PASS> service-name INTERNET service-type internet <LAN_PORTS> vlan <INTERNET_VLAN>',
    tr069Acs: 'ont tr069-acs-server url <ACS_URL> inform enable interval 120',
    tr069Stun: 'ont tr069-stun-server url <ACS_URL>',
    configLoadXml: 'POST /goform/OntCfgLoad with ontList <SLOT/PON/ONT>, tftpServer <IP>, cfgFile <BACKUP.xml>',
    tcont: 'tcont 1 dba-profile <DBA_PROFILE>',
    gem: 'gem 1 tcont 1 vlan-profile <VLAN_PROFILE>',
    mappingInternet: 'mapping 0 vlan <INTERNET_VLAN> gem 1',
    mappingTr069: 'currently disabled; no IP Host VLAN mapping is pushed by this template',
  },
  discoveryCommands: [
    'display current-config gpon-device',
    'display current-config | include gpon',
    'display current-config | include sn-auth',
  ],
  verificationCommands: [
    'display current-config | include tr069',
  ],
  notes: [
    'Template IP Host/TR-069 Tarmoc saat ini dibatasi untuk push URL GenieACS dan STUN pada context specific-profile x/x/x.',
    'XML Configuration Load Tarmoc memakai Web UI ONT Operation dan membutuhkan file backup sudah tersedia di TFTP server.',
    'SN authorization tervalidasi ditulis pada context rule-profile x/x/x.',
    'CLI observasi tervalidasi memakai display, bukan show.',
    'Mapping IP Host, WAN config, dan DBA/GEM tidak dikirim dari template ini sampai validasi berikutnya.',
  ],
};
