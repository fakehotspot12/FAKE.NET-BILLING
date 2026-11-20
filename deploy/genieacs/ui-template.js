'use strict';

// Native GenieACS 1.2 components; no model-specific instance numbers or runtime data.
const VERSION = '1';
const summonLeafPaths = [
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Name',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Enable',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionType',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.Name',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.Enable',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ConnectionType',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ConnectionStatus',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.AddressingType',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Channel',
  'InternetGatewayDevice.LANDevice.*.Hosts.Host.*.HostName',
  'InternetGatewayDevice.LANDevice.*.Hosts.Host.*.IPAddress',
  'InternetGatewayDevice.LANDevice.*.Hosts.Host.*.MACAddress',
  'InternetGatewayDevice.LANDevice.*.Hosts.Host.*.Active',
  'InternetGatewayDevice.LANDevice.*.Hosts.Host.*.InterfaceType',
  'Device.IP.Interface.*.Name', 'Device.IP.Interface.*.Enable', 'Device.IP.Interface.*.Status',
  'Device.IP.Interface.*.IPv4Address.*.IPAddress', 'Device.IP.Interface.*.IPv4Address.*.SubnetMask',
  'Device.WiFi.Radio.*.Name', 'Device.WiFi.Radio.*.Enable', 'Device.WiFi.Radio.*.OperatingFrequencyBand',
  'Device.WiFi.Radio.*.Channel', 'Device.WiFi.Radio.*.OperatingStandards',
  'Device.WiFi.SSID.*.Status', 'Device.WiFi.SSID.*.LowerLayers',
  'Device.WiFi.AccessPoint.*.SSIDReference', 'Device.WiFi.AccessPoint.*.Enable',
  'Device.Hosts.Host.*.HostName', 'Device.Hosts.Host.*.IPAddress', 'Device.Hosts.Host.*.PhysAddress',
  'Device.Hosts.Host.*.Active', 'Device.Hosts.Host.*.Layer1Interface'
];
const quote = value => JSON.stringify(value);
const component = (type, attrs = {}) => ({ type: quote(type), ...attrs });
const field = (label, parameter) => ({ label: quote(label), parameter });
const table = (label, parameter, columns, attrs = {}) => component('parameter-table', {
  label: label ? quote(label) : 'null', parameter, childParameters: columns, ...attrs
});
const container = (tag, components, style = '') => component('container', {
  element: { tag: quote(tag), attributes: { style: quote(style) } }, components
});
const scroll = child => container('div', [child], 'display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;overflow-x:auto;');
const heading = label => container('h2', [quote(label)]);
const section = (label, children) => {
  const result = container('section', [heading(label), ...children],
    'box-sizing:border-box;width:100%;min-width:0;max-width:100%;margin:0 0 1.25rem;');
  result.element.attributes.class = quote('billing-acs-ui');
  return result;
};
const scopedStyle = '.billing-acs-ui table.table{width:max-content;min-width:100%;max-width:none;table-layout:auto}'
  + '.billing-acs-ui table.table th,.billing-acs-ui table.table td{white-space:nowrap}'
  + '.billing-acs-ui h2{font-size:18px;letter-spacing:0}'
  + '.billing-acs-ui table.table table.table{min-width:0}';

function lanTable(label, parameter, columns, attrs = {}) {
  return table(null, 'InternetGatewayDevice.LANDevice', [
    table(label, parameter, columns, attrs)
  ]);
}

function wanTable(columns) {
  return table(null, 'InternetGatewayDevice.WANDevice', [
    table('Koneksi WAN', 'WANConnectionDevice', columns)
  ]);
}

function flatten(value, prefix = '', result = []) {
  if (typeof value === 'string') result.push({ _id: prefix, value });
  else for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, result);
  return result;
}

function buildTemplate(summonParameters = []) {
  const summary = component('parameter-list', { parameters: [
    field('Serial Number', 'DeviceID.SerialNumber'),
    field('Produsen', 'COALESCE(Device.DeviceInfo.Manufacturer, InternetGatewayDevice.DeviceInfo.Manufacturer)'),
    field('Model', 'DeviceID.ProductClass'),
    field('Firmware', 'COALESCE(Device.DeviceInfo.SoftwareVersion, InternetGatewayDevice.DeviceInfo.SoftwareVersion)'),
    field('Akun PPPoE', 'COALESCE(VirtualParameters.pppoeUsername, VirtualParameters.pppoeUsername2)'),
    field('IP PPPoE', 'VirtualParameters.pppoeIP'),
    field('IP TR069', 'VirtualParameters.IPTR069'),
    field('Mode PON', 'VirtualParameters.getponmode'),
    field('Redaman (dBm)', 'VirtualParameters.RXPower'),
    field('Suhu (C)', 'VirtualParameters.gettemp'),
    field('Klien aktif', 'VirtualParameters.activedevices'),
    field('Uptime perangkat', 'VirtualParameters.getdeviceuptime'),
    component('container', { label: quote('Inform terakhir'), element: quote('span.inform'), components: [
      component('parameter', { parameter: 'DATE_STRING(Events.Inform)' }),
      component('overview-dot', { chart: quote('online') }),
      component('summon-button', { parameters: [...new Set([...summonParameters, ...summonLeafPaths])] })
    ] })
  ] });
  const pppColumns = [field('Nama', 'Name'), field('Aktif', 'Enable'), field('Status', 'ConnectionStatus'),
    field('Username', 'Username'), field('IP', 'ExternalIPAddress'), field('Tipe', 'ConnectionType')];
  const ipColumns = [field('Nama', 'Name'), field('Aktif', 'Enable'), field('Status', 'ConnectionStatus'),
    field('IP', 'ExternalIPAddress'), field('Tipe', 'ConnectionType'), field('Mode IP', 'AddressingType')];
  const hostColumns = [field('Nama perangkat', 'HostName'), field('IP', 'IPAddress'), field('MAC', 'MACAddress'),
    field('Aktif', 'Active'), field('Antarmuka', 'InterfaceType')];
  const wifiColumns = [field('SSID', 'SSID'), field('Aktif', 'Enable'), field('Status', 'Status'),
    field('Standar', 'Standard'), field('Kanal', 'Channel'), field('Keamanan', 'BeaconType')];
  const wifiPasswords = [field('SSID', 'SSID'), field('KeyPassphrase', 'KeyPassphrase'),
    field('Huawei Key', 'X_HW_PreSharedKey'), table('Pre-Shared Key', 'PreSharedKey', [
      field('KeyPassphrase', 'KeyPassphrase'), field('PreSharedKey', 'PreSharedKey')
    ])];
  const device = [
    section('Ringkasan Perangkat', [container('style', [quote(scopedStyle)]), component('tags'), scroll(summary)]),
    section('WAN PPPoE dan IP', [scroll(wanTable([
      table('PPPoE', 'WANPPPConnection', pppColumns), table('IP / Bridge', 'WANIPConnection', ipColumns)
    ])), scroll(table('PPP (TR181)', 'Device.PPP.Interface', [field('Nama', 'Name'), field('Aktif', 'Enable'),
      field('Status', 'Status'), field('Username', 'Username'), field('Antarmuka', 'LowerLayers')])),
    scroll(table('IP (TR181)', 'Device.IP.Interface', [field('Nama', 'Name'), field('Aktif', 'Enable'),
      field('Status', 'Status'), table('IPv4', 'IPv4Address', [field('IP', 'IPAddress'), field('Mask', 'SubnetMask')])]))]),
    section('WiFi', [scroll(lanTable('SSID (TR098)', 'WLANConfiguration', wifiColumns)),
      scroll(table('Radio (TR181)', 'Device.WiFi.Radio', [field('Nama', 'Name'), field('Aktif', 'Enable'),
        field('Band', 'OperatingFrequencyBand'), field('Kanal', 'Channel'), field('Standar', 'OperatingStandards')])),
      scroll(table('SSID (TR181)', 'Device.WiFi.SSID', [field('SSID', 'SSID'), field('Nama', 'Name'),
        field('Aktif', 'Enable'), field('Status', 'Status'), field('Radio', 'LowerLayers')])),
      scroll(table('Access Point (TR181)', 'Device.WiFi.AccessPoint', [field('SSID', 'SSIDReference'),
        field('Aktif', 'Enable'), field('Keamanan', 'Security.ModeEnabled')]))]),
    section('Perangkat LAN / WiFi', [scroll(lanTable('Klien (TR098)', 'Hosts.Host', hostColumns)),
      scroll(table('Klien (TR181)', 'Device.Hosts.Host', [field('Nama perangkat', 'HostName'), field('IP', 'IPAddress'),
        field('MAC', 'PhysAddress'), field('Aktif', 'Active'), field('Antarmuka', 'Layer1Interface')])),
      scroll(lanTable('Port LAN', 'LANEthernetInterfaceConfig', [field('Aktif', 'Enable'), field('Status', 'Status'),
        field('MAC', 'MACAddress'), field('Kecepatan', 'MaxBitRate')]))]),
    container('details', [container('summary', [quote('Kredensial perangkat dan WiFi')]),
      scroll(component('parameter-list', { parameters: [field('User admin', 'VirtualParameters.userAdmin'),
        field('Password admin', 'VirtualParameters.userPassword'), field('Super admin', 'VirtualParameters.superAdmin'),
        field('Password super admin', 'VirtualParameters.superPassword')] })),
      scroll(wanTable([table('Kredensial PPPoE', 'WANPPPConnection', [field('Username', 'Username'), field('Password', 'Password')])])),
      scroll(table('Kredensial PPP (TR181)', 'Device.PPP.Interface', [field('Username', 'Username'), field('Password', 'Password')])),
      scroll(lanTable('Kunci WiFi (TR098)', 'WLANConfiguration', wifiPasswords)),
      scroll(table('Kunci WiFi (TR181)', 'Device.WiFi.AccessPoint', [field('SSID', 'SSIDReference'),
        field('KeyPassphrase', 'Security.KeyPassphrase'), field('PreSharedKey', 'Security.PreSharedKey')]))
    ], 'width:100%;min-width:0;max-width:100%;margin-bottom:1.25rem;'),
    section('Fault Perangkat', [scroll(component('device-faults'))]),
    section('Aksi Perangkat', [scroll(component('device-actions'))]),
    section('Semua Parameter', [scroll(component('all-parameters', { limit: '100' }))])
  ];
  const index = [
    component('device-link', { ...field('Serial Number', 'DeviceID.SerialNumber'), components: [component('parameter')] }),
    field('Model', 'DeviceID.ProductClass'), field('PPPoE', 'VirtualParameters.pppoeUsername'),
    field('IP TR069', 'VirtualParameters.IPTR069'), field('Redaman (dBm)', 'VirtualParameters.RXPower'),
    field('Suhu (C)', 'VirtualParameters.gettemp'), field('Klien aktif', 'VirtualParameters.activedevices'),
    component('container', { ...field('Inform terakhir', 'DATE_STRING(Events.Inform)'), element: quote('span.inform'), components: [
      component('parameter'), component('overview-dot', { chart: quote('online') })
    ] }), component('tags', { ...field('Tag', 'Tags'), unsortable: 'true', writable: 'false' })
  ];
  const filters = [field('Serial Number', 'DeviceID.SerialNumber'), field('Model', 'DeviceID.ProductClass'),
    field('PPPoE', 'VirtualParameters.pppoeUsername')].map(value => ({ ...value, type: quote('string') }));
  filters.push({ ...field('Tag', 'Tags'), type: quote('tag') });
  const slices = {
    online: { label: quote('Inform < 10 menit'), color: quote('#249867'), filter: 'Events.Inform > NOW() - 600000' },
    stale: { label: quote('Inform 10 menit - 24 jam'), color: quote('#be8421'),
      filter: 'Events.Inform <= NOW() - 600000 AND Events.Inform > NOW() - 86400000' },
    offline: { label: quote('Inform > 24 jam / belum ada'), color: quote('#b24b50'),
      filter: 'Events.Inform <= NOW() - 86400000 OR Events.Inform IS NULL' }
  };
  return flatten({ ui: { device, index, filters, overview: {
    charts: { online: { label: quote('Inform Perangkat'), slices } },
    groups: { online: { label: quote('Ringkasan ACS'), charts: [quote('online')] } }
  } } });
}

const isTemplateKey = id => /^ui\.(?:device|index|filters|overview)\./.test(id);

async function installFreshTemplate({ initialized, read, put, remove, summonParameters = [] }) {
  if (!initialized) return { installed: false, reason: 'existing-ui' };
  const before = await read();
  if (!Array.isArray(before)) throw Error('Snapshot UI GenieACS tidak valid');
  const previous = before.filter(row => isTemplateKey(row._id));
  const rows = buildTemplate(summonParameters), expected = new Map(rows.map(row => [row._id, row.value]));
  try {
    for (const row of rows) await put(row._id, { value: row.value });
    for (const row of previous) if (!expected.has(row._id)) await remove(row._id);
    const actual = (await read()).filter(row => isTemplateKey(row._id));
    if (actual.length !== rows.length || actual.some(row => expected.get(row._id) !== row.value)) {
      throw Error('Verifikasi template UI GenieACS gagal');
    }
    return { installed: true, version: VERSION, entries: rows.length };
  } catch (error) {
    let rollbackFailed = false;
    for (const row of previous) {
      try { await put(row._id, { value: row.value }); } catch { rollbackFailed = true; }
    }
    const oldKeys = new Set(previous.map(row => row._id));
    for (const row of rows) if (!oldKeys.has(row._id)) {
      try { await remove(row._id); } catch { rollbackFailed = true; }
    }
    try {
      const restored = (await read()).filter(row => isTemplateKey(row._id));
      const oldValues = new Map(previous.map(row => [row._id, row.value]));
      if (restored.length !== previous.length || restored.some(row => oldValues.get(row._id) !== row.value)) rollbackFailed = true;
    } catch { rollbackFailed = true; }
    throw Error(`Pemasangan template UI GenieACS gagal${rollbackFailed ? '; pemulihan UI perlu diperiksa' : '; UI awal dipulihkan'}: ${error.message}`);
  }
}

module.exports = { VERSION, buildTemplate, installFreshTemplate, isTemplateKey, summonLeafPaths };
