'use strict';
const { fixture } = require('./olt-pon-fixture');
function model() {
  return { address: '1/1/13:1', serialNumber: 'HWTCAABBCCDD', vendor: 'HWTC', model: 'HG8145V5', firmware: 'V2.1.0',
    online: true, eth: 4, config: 'success', portConfig: [],
    interfaceLines: ['tcont 1 profile FB-UP', 'gemport 1 tcont 1', 'gemport 2 tcont 1', 'gemport 3 tcont 1',
      'service-port 1 vport 1 user-vlan 100 vlan 100', 'service-port 2 vport 2 user-vlan 101 vlan 101', 'service-port 3 vport 3 user-vlan 102 vlan 102'],
    other: ['service FBV100 gemport 1 vlan 100', 'service FBV101 gemport 2 vlan 101', 'service FBV102 gemport 3 vlan 102', 'vlan-filter iphost 1 pri 0 vlan 100', 'ssid auth wpa wifi_0/1 wpa-key protected-key'],
    physicalFailed: false, physicalExtra: '' };
}
function reply(command, state) {
  const iface = 'gpon-onu_' + state.address, portPrompt = 'OLT(gpon-onu-mng ' + state.address + ')#';
  if (['enable', 'terminal length 0', 'end'].includes(command)) return 'OLT#';
  if (command === 'configure terminal') return 'OLT(config)#';
  if (command === 'pon-onu-mng ' + iface) return portPrompt;
  if (command === 'show version-running') return '1/1/1 GTGHG MVR ' + state.firmware + ' time 123\nOLT#';
  if (command === 'show gpon onu by sn HWTCAABBCCDD') return iface + '\nOLT#';
  if (command.startsWith('show gpon onu by sn ')) return '%Code 62310-GPONSRV : No related information to show.\nOLT#';
  if (command === 'show gpon onu detail-info ' + iface) return `ONU interface: ${iface}\nType: FB-GPON-AUTO\nPhase state: ${state.online ? 'working' : 'OffLine'}\nConfig state: ${state.config}\nSerial number: ${state.serialNumber}\nOLT#`;
  if (command === 'show gpon remote-onu equip ' + iface) return `Vendor ID: ${state.vendor}\nEquipment ID: ${state.model}\nOMCC version: b0\nOLT#`;
  if (command === 'show gpon remote-onu capability ' + iface) return `T-CONT number: 8\nEthernet UNI number: ${state.eth} (10GE:0 GE:${state.eth} FE:0)\nWIFI UNI number: ${state.wifiCount ?? 8}\nVEIP number: 1\nOLT#`;
  if (command === 'show gpon remote-onu ssid info ' + iface) return state.ssids?.length ? state.ssids.map(row => `Interface: ${row.name}\n Name: ${row.ssid}\n MAC: N/A\n Current users: ${state.ssidClients || 0}\n${row.band ? ' Band: ' + row.band + ' GHz\n' : ''} Authentication algorithm: WPA-PSK/WPA2-PSK\n Key: ${row.key || 'private-fixture-key'}\n`).join('') + 'OLT#' : '%Code 64040-GPONRM : No relate information to show.\nOLT#';
  if (command === 'show running-config interface ' + iface) return 'interface ' + iface + '\n' + state.interfaceLines.join('\n') + '\n!\nend\nOLT#';
  if (command === 'show onu running config ' + iface) return 'pon-onu-mng ' + iface + '\n' + [...state.other, ...state.portConfig].join('\n') + '\n!\nOLT#';
  if (command.startsWith('show gpon remote-onu vlan')) {
    if (state.physicalFailed || !state.portConfig.length) return '%Code 64040-GPONRM : No relate information to show.\nOLT#';
    const family = /(?:vlan wifi|filter-mode wifi|filter wifi) /.test(command) ? 'wifi' : 'eth';
    const names = [...new Set(state.portConfig.flatMap(line => line.match(/(?:eth|wifi)_0\/\d+/g) || []))].filter(name => name.startsWith(family + '_'));
    if (state.nativeVlanTable && command.startsWith('show gpon remote-onu vlan ')) return 'Interface     Mode        Def-VID    Def-Prio    Vlan-list\n.................\n' + names.map(name => {
      const mode = state.portConfig.find(line => line.startsWith('vlan port ' + name + ' '))?.match(/ mode (trunk|tag)(?: vlan (\d+))?/);
      return `${name} ${mode?.[1] || 'N/A'} ${mode?.[2] || '--'} ${mode?.[2] ? '0' : '--'} --\n`;
    }).join('') + 'OLT#';
    return names.map(name => {
      const lines = state.portConfig.filter(line => line.includes(name)), mode = lines.find(line => line.startsWith('vlan port '))?.match(/ mode (trunk|tag)(?: vlan (\d+))?/), filter = lines.find(line => line.startsWith('vlan-filter-mode '))?.match(/tag-filter (\S+) untag-filter (\S+)/);
      if (command.startsWith('show gpon remote-onu vlan eth ')) return `Interface Name: ${name}\nTag mode: ${mode?.[1] || 'trunk'}\nVLAN: ${mode?.[2] || 'N/A'}\n`;
      if (command.startsWith('show gpon remote-onu vlan-filter-mode ')) return `Interface Name: ${name}\nTag filter mode: ${filter?.[1] || 'discard'}\nUntag filter mode:${filter?.[2] || 'discard'}\n`;
      return `Interface Name: ${name}\nPriority VLAN\n` + lines.filter(line => line.startsWith('vlan-filter ')).map(line => line.match(/pri (\d+) vlan (\d+)/).slice(1).join(' ') + '\n').join('') + state.physicalExtra;
    }).join('') + 'OLT#';
  }
  if (command.startsWith('vlan-filter-mode ')) { const prefix = command.split(' ').slice(0,3).join(' ') + ' '; state.portConfig = state.portConfig.filter(line => !line.startsWith(prefix)); state.portConfig.push(command); return portPrompt; }
  if (command.startsWith('vlan port ')) { state.portConfig = state.portConfig.filter(line => !line.startsWith('vlan port ' + command.split(' ')[2] + ' ')); state.portConfig.push(command); return portPrompt; }
  if (command.startsWith('no vlan-filter ')) { state.portConfig = state.portConfig.filter(line => line !== command.slice(3)); return portPrompt; }
  if (command.startsWith('vlan-filter ')) { state.portConfig.push(command); return portPrompt; }
  throw Error('Unexpected bridge command ' + command);
}
const response = (commands, state) => ({ success: true, submitted: commands.includes('configure terminal'), outputs: commands.map(command => ({ command, stdout: reply(command, state) })) });
module.exports = { fixture, model, reply, response };
