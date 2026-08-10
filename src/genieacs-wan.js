'use strict';

const PROTECTED_WAN_VLANS = new Set([100, 1111]);
const LAN_KEYS = Array.from({ length: 4 }, (_, index) => `LAN${index + 1}`);
const SSID_KEYS = Array.from({ length: 8 }, (_, index) => `SSID${index + 1}`);
const BINDING_KEYS = [...LAN_KEYS, ...SSID_KEYS];

function cleanText(value = '') {
  return String(value ?? '').trim();
}

function rawValue(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '_value')) {
    return value._value;
  }
  return value === undefined || value === null || typeof value === 'object' ? '' : value;
}

function pathValue(source = {}, path = '') {
  const value = cleanText(path).split('.').filter(Boolean).reduce((node, part) => {
    if (!node || typeof node !== 'object') return undefined;
    return node[part];
  }, source);
  return rawValue(value);
}

function firstValue(source = {}, paths = []) {
  for (const path of paths) {
    const value = pathValue(source, path);
    if (value !== '') return value;
  }
  return '';
}

function validVlanNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 4094 ? number : null;
}

function numericEntries(source = {}) {
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .filter(([key, value]) => /^\d+$/.test(String(key)) && value && typeof value === 'object')
    .sort(([left], [right]) => Number(left) - Number(right));
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on', 'up', 'active', 'enabled', 'connected'].includes(cleanText(value).toLowerCase());
}

function deviceIdentityText(device = {}) {
  return [
    device?._id,
    device?._deviceId?._Manufacturer,
    device?._deviceId?._ProductClass,
    device?._deviceId?._SerialNumber,
    pathValue(device, 'InternetGatewayDevice.DeviceInfo.Manufacturer'),
    pathValue(device, 'InternetGatewayDevice.DeviceInfo.ModelName'),
    pathValue(device, 'InternetGatewayDevice.DeviceInfo.ProductClass')
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasXponWanPath(device = {}) {
  const wanRoot = device?.InternetGatewayDevice?.WANDevice;
  return numericEntries(wanRoot).some(([, wanDevice]) => numericEntries(wanDevice.WANConnectionDevice)
    .some(([, connectionDevice]) => Boolean(connectionDevice['X_CT-COM_WANEponLinkConfig'])));
}

function detectWanVendor(device = {}) {
  const text = deviceIdentityText(device);
  if (text.includes('fiberhome') || text.includes('fiber home') || text.includes('fhtt') || text.includes('000ac2')) {
    return { id: 'fiberhome', label: 'FiberHome', bridgeSupported: true, wanWriteSupported: true };
  }
  if ((text.includes('zte') || text.includes('ztge')) && (hasXponWanPath(device) || text.includes('xpon') || text.includes('epon'))) {
    return { id: 'zte-xpon', label: 'ZTE XPON', bridgeSupported: false, wanWriteSupported: true };
  }
  if ((text.includes('zte') || text.includes('zteg')) && /\bf(?:670l?|679l)\b/i.test(text)) {
    return {
      id: 'zte',
      label: 'ZTE F67x',
      bridgeSupported: true,
      wanWriteSupported: false,
      wanWriteNote: 'ZTE F67x memakai tabel PortBinding LANInterface/WANInterface yang harus dibaca dari modem sebelum Set WAN.'
    };
  }
  if (text.includes('zte') || text.includes('zteg') || /\bf(609|660|670)\b/i.test(text)) {
    return { id: 'zte', label: 'ZTE', bridgeSupported: true, wanWriteSupported: true };
  }
  if (text.includes('huawei') || text.includes('00259e') || /\b(?:hg|eg|hs)\d+/i.test(text)) {
    return { id: 'huawei', label: 'Huawei', bridgeSupported: true, wanWriteSupported: true };
  }
  return { id: 'unknown', label: 'Belum dikenali', bridgeSupported: false, wanWriteSupported: false };
}

function wanVlan(connection = {}, connectionDevice = {}, vendor = {}) {
  const paths = vendor.id === 'huawei'
    ? ['X_HW_VLAN', 'VLANID', 'X_ZTE-COM_VLANID']
    : (vendor.id === 'fiberhome'
      ? ['VLANID', 'X_FH_VLANID', 'X_ZTE-COM_VLANID']
      : ['X_CMCC_VLANIDMark', 'X_CMCC_VLANID', 'X_ZTE-COM_VLANID', 'VLANID', 'X_HW_VLAN']);
  const direct = firstValue(connection, paths);
  const xpon = firstValue(connectionDevice, [
    'X_CT-COM_WANEponLinkConfig.VLANIDMark',
    'X_CT-COM_WANGponLinkConfig.VLANIDMark'
  ]);
  const value = direct !== '' ? direct : xpon;
  const valid = validVlanNumber(value);
  if (valid !== null) return valid;
  const nameVlan = cleanText(firstValue(connection, ['Name'])).match(/(?:^|_)VID_(\d{1,4})(?:_|$)/i);
  return validVlanNumber(nameVlan?.[1]);
}

function wanServiceList(connection = {}) {
  return cleanText(firstValue(connection, [
    'X_HW_SERVICELIST',
    'X_HW_ServiceList',
    'X_FH_ServiceList',
    'X_ZTE-COM_ServiceList',
    'X_CT-COM_ServiceList',
    'X_CMCC_ServiceList',
    'ServiceList'
  ]));
}

function parsePathBindings(value = '') {
  const text = cleanText(value);
  const bindings = [];
  for (const match of text.matchAll(/LANEthernetInterfaceConfig\.(\d+)/gi)) bindings.push(`LAN${match[1]}`);
  for (const match of text.matchAll(/WLANConfiguration\.(\d+)/gi)) bindings.push(`SSID${match[1]}`);
  return [...new Set(bindings)].filter((item) => BINDING_KEYS.includes(item));
}

function rawPathBindings(connection = {}) {
  const text = cleanText(firstValue(connection, [
    'X_FH_LanInterface',
    'X_ZTE-COM_LanInterface',
    'X_CT-COM_LanInterface',
    'X_CMCC_LanInterface'
  ]));
  return text.split(',').map((item) => cleanText(item)).filter(Boolean);
}

function extraPathBindings(connection = {}) {
  return rawPathBindings(connection).filter((path) => (
    !/LANEthernetInterfaceConfig\.\d+$/i.test(path)
    && !/WLANConfiguration\.\d+$/i.test(path)
  ));
}

function wanBindings(connection = {}, vendor = {}) {
  if (vendor.id === 'huawei') {
    const bind = connection.X_HW_LANBIND || {};
    return BINDING_KEYS.filter((key) => {
      const param = key.startsWith('LAN') ? `Lan${key.slice(3)}Enable` : `${key}Enable`;
      return truthy(rawValue(bind[param]));
    });
  }
  return parsePathBindings(firstValue(connection, [
    'X_FH_LanInterface',
    'X_ZTE-COM_LanInterface',
    'X_CT-COM_LanInterface',
    'X_CMCC_LanInterface'
  ]));
}

function protectedWan(vlan, serviceList = '', name = '') {
  return PROTECTED_WAN_VLANS.has(Number(vlan)) || /tr-?069|management|acs/i.test(`${serviceList} ${name}`);
}

function connectionStatus(connection = {}) {
  return cleanText(firstValue(connection, ['ConnectionStatus', 'Status'])) || (truthy(pathValue(connection, 'Enable')) ? 'Enabled' : 'Disabled');
}

function wanMode(objectType = '', connection = {}, isProtected = false) {
  if (isProtected) return 'management';
  const type = cleanText(firstValue(connection, ['ConnectionType', 'ConnMode']));
  if (/bridg/i.test(type)) return 'bridge';
  if (objectType === 'WANPPPConnection') return 'pppoe';
  return 'ip';
}

function preferredBridgeObjectType(device = {}, vendor = detectWanVendor(device)) {
  const counts = { WANPPPConnection: 0, WANIPConnection: 0 };
  const wanRoot = device?.InternetGatewayDevice?.WANDevice;
  for (const [, wanDevice] of numericEntries(wanRoot)) {
    for (const [, connectionDevice] of numericEntries(wanDevice.WANConnectionDevice)) {
      for (const objectType of Object.keys(counts)) {
        for (const [, connection] of numericEntries(connectionDevice[objectType])) {
          const type = cleanText(firstValue(connection, ['ConnectionType', 'ConnMode']));
          if (/bridg/i.test(type)) counts[objectType] += 1;
        }
      }
    }
  }
  if (counts.WANPPPConnection > counts.WANIPConnection) return 'WANPPPConnection';
  if (counts.WANIPConnection > 0) return 'WANIPConnection';
  return 'WANIPConnection';
}

function bridgeTarget(device = {}, vendor = detectWanVendor(device)) {
  const objectType = preferredBridgeObjectType(device, vendor);
  const connectionType = objectType === 'WANPPPConnection' ? 'PPPoE_Bridged' : 'IP_Bridged';
  return {
    objectType,
    connectionType,
    label: `${objectType === 'WANPPPConnection' ? 'WAN PPP' : 'WAN IP'} · ${connectionType}`
  };
}

function wanDisplayLabel(row = {}) {
  const vlanText = row.vlan ? row.vlan : 'belum terbaca';
  if (row.protected) return `WAN Management - VLAN ${vlanText}`;
  if (row.mode === 'pppoe') return `PPPoE - VLAN ${vlanText}`;
  if (row.mode === 'bridge') return `Bridge - VLAN ${vlanText}`;
  return `WAN IP - VLAN ${vlanText}`;
}

function wanParameterFamily(connection = {}, connectionDevice = {}, vendor = {}) {
  if (vendor.id === 'huawei') return 'huawei';
  if (vendor.id === 'fiberhome') return 'fiberhome';
  if (vendor.id === 'zte-xpon') return 'ctcom';
  if (firstValue(connection, ['X_CMCC_VLANIDMark', 'X_CMCC_VLANID', 'X_CMCC_ServiceList', 'X_CMCC_LanInterface']) !== '') {
    return 'cmcc';
  }
  if (firstValue(connectionDevice, ['X_CT-COM_WANEponLinkConfig.VLANIDMark', 'X_CT-COM_WANGponLinkConfig.VLANIDMark']) !== '') {
    return 'ctcom';
  }
  return vendor.id || 'unknown';
}

function preferredWanParameterFamily(device = {}, vendor = detectWanVendor(device)) {
  const wanRoot = device?.InternetGatewayDevice?.WANDevice;
  for (const [, wanDevice] of numericEntries(wanRoot)) {
    for (const [, connectionDevice] of numericEntries(wanDevice.WANConnectionDevice)) {
      for (const objectType of ['WANPPPConnection', 'WANIPConnection']) {
        for (const [, connection] of numericEntries(connectionDevice[objectType])) {
          const family = wanParameterFamily(connection, connectionDevice, vendor);
          if (family && family !== 'unknown' && family !== vendor.id) return family;
        }
      }
    }
  }
  if (vendor.id === 'huawei') return 'huawei';
  if (vendor.id === 'fiberhome') return 'fiberhome';
  if (vendor.id === 'zte-xpon') return 'ctcom';
  return vendor.id || 'unknown';
}

function summarizeWanConnections(device = {}, preferredUsername = '') {
  const vendor = detectWanVendor(device);
  const rows = [];
  const wanRoot = device?.InternetGatewayDevice?.WANDevice;
  for (const [wanDeviceIndex, wanDevice] of numericEntries(wanRoot)) {
    for (const [connectionIndex, connectionDevice] of numericEntries(wanDevice.WANConnectionDevice)) {
      for (const objectType of ['WANPPPConnection', 'WANIPConnection']) {
        for (const [instance, connection] of numericEntries(connectionDevice[objectType])) {
          const basePath = `InternetGatewayDevice.WANDevice.${wanDeviceIndex}.WANConnectionDevice.${connectionIndex}.${objectType}.${instance}`;
          const vlan = wanVlan(connection, connectionDevice, vendor);
          const serviceList = wanServiceList(connection);
          const name = cleanText(firstValue(connection, ['Name']));
          const locked = protectedWan(vlan, serviceList, name);
          const mode = wanMode(objectType, connection, locked);
          const connectionType = cleanText(firstValue(connection, ['ConnectionType', 'ConnMode']));
          const username = objectType === 'WANPPPConnection' ? cleanText(firstValue(connection, ['Username'])) : '';
          const status = connectionStatus(connection);
          const bindings = wanBindings(connection, vendor);
          const parameterFamily = wanParameterFamily(connection, connectionDevice, vendor);
          rows.push({
            id: basePath,
            basePath,
            wanDeviceIndex: Number(wanDeviceIndex),
            connectionIndex: Number(connectionIndex),
            instance: Number(instance),
            objectType,
            connectionType,
            mode,
            vlan,
            username,
            serviceList,
            name,
            status,
            active: truthy(firstValue(connection, ['Enable'])) || /connected|up/i.test(status),
            connected: /connected|up/i.test(status),
            bindings,
            bindingExtraPaths: extraPathBindings(connection),
            parameterFamily,
            protected: locked,
            editable: !locked && ['pppoe', 'bridge'].includes(mode),
            lockReason: locked ? 'WAN provisioning GenieACS dilindungi' : '',
            vendor: vendor.label
          });
        }
      }
    }
  }

  const preferred = cleanText(preferredUsername).toLowerCase();
  const pppRows = rows.filter((row) => row.mode === 'pppoe' && !row.protected);
  const primary = pppRows.sort((left, right) => {
    const score = (row) => (
      (preferred && row.username.toLowerCase() === preferred ? 100 : 0)
      + (/internet/i.test(`${row.serviceList} ${row.name}`) ? 30 : 0)
      + (row.connected ? 20 : 0)
      + (row.active ? 10 : 0)
    );
    return score(right) - score(left);
  })[0] || null;
  rows.forEach((row) => {
    row.primary = Boolean(primary && row.id === primary.id);
    row.label = wanDisplayLabel(row);
  });
  const managementRows = rows.filter((row) => row.protected).sort((left, right) => {
    const score = (row) => (row.connected ? 20 : 0) + (row.active ? 10 : 0) + (row.vlan ? 1 : 0);
    return score(right) - score(left)
      || left.wanDeviceIndex - right.wanDeviceIndex
      || left.connectionIndex - right.connectionIndex
      || left.instance - right.instance;
  });
  const management = managementRows[0] || null;
  rows.sort((left, right) => {
    if (left.protected !== right.protected) return left.protected ? -1 : 1;
    if (left.protected && right.protected) {
      return managementRows.indexOf(left) - managementRows.indexOf(right);
    }
    return left.wanDeviceIndex - right.wanDeviceIndex
      || left.connectionIndex - right.connectionIndex
      || left.instance - right.instance;
  });
  return { vendor, rows, primary, management };
}

function availableWanBindings(device = {}) {
  const lanRoot = device?.InternetGatewayDevice?.LANDevice?.['1']?.LANEthernetInterfaceConfig;
  const wifiRoot = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration;
  const lans = numericEntries(lanRoot).map(([index, config]) => ({
    key: `LAN${index}`,
    label: `LAN${index}`,
    type: 'lan',
    active: pathValue(config, 'Enable') === '' ? true : truthy(pathValue(config, 'Enable'))
  })).filter((item) => BINDING_KEYS.includes(item.key));
  const ssids = numericEntries(wifiRoot).map(([index, config]) => {
    const ssid = cleanText(pathValue(config, 'SSID'));
    return {
      key: `SSID${index}`,
      label: ssid ? `SSID${index} - ${ssid}` : `SSID${index}`,
      type: 'ssid',
      active: pathValue(config, 'Enable') === '' ? true : truthy(pathValue(config, 'Enable')),
      ssid
    };
  }).filter((item) => BINDING_KEYS.includes(item.key));
  return [...lans, ...ssids];
}

function normalizeBindingKeys(value = []) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return [...new Set(items.map((item) => cleanText(item).toUpperCase()))]
    .filter((item) => BINDING_KEYS.includes(item));
}

function bindingPathValue(keys = [], extraPaths = []) {
  const selectedPaths = normalizeBindingKeys(keys).map((key) => {
    if (key.startsWith('LAN')) return `InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.${key.slice(3)}`;
    return `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${key.slice(4)}`;
  });
  return [...new Set([
    ...(Array.isArray(extraPaths) ? extraPaths.map((item) => cleanText(item)).filter(Boolean) : []),
    ...selectedPaths
  ])].join(',');
}

function bindingParameterValues(basePath = '', vendor = {}, keys = [], extraPaths = []) {
  const selected = new Set(normalizeBindingKeys(keys));
  if (vendor.id === 'huawei') {
    return BINDING_KEYS.map((key) => {
      const param = key.startsWith('LAN') ? `Lan${key.slice(3)}Enable` : `${key}Enable`;
      return [`${basePath}.X_HW_LANBIND.${param}`, selected.has(key) ? 1 : 0, 'xsd:unsignedInt'];
    });
  }
  const suffix = vendor.id === 'fiberhome'
    ? 'X_FH_LanInterface'
    : (vendor.id === 'zte-xpon' || vendor.parameterFamily === 'ctcom'
      ? 'X_CT-COM_LanInterface'
      : (vendor.parameterFamily === 'cmcc' ? 'X_CMCC_LanInterface' : 'X_ZTE-COM_LanInterface'));
  return [[`${basePath}.${suffix}`, bindingPathValue([...selected], extraPaths), 'xsd:string']];
}

function bindingEnableParameterValues(device = {}, vendor = {}, keys = []) {
  const selected = normalizeBindingKeys(keys);
  const values = [];
  const lanRoot = device?.InternetGatewayDevice?.LANDevice?.['1']?.LANEthernetInterfaceConfig || {};
  const wifiRoot = device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration || {};
  for (const key of selected) {
    if (key.startsWith('LAN')) {
      const index = key.slice(3);
      if (!lanRoot[index]) continue;
      const base = `InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.${index}`;
      values.push([`${base}.Enable`, true, 'xsd:boolean']);
      if (vendor.id === 'huawei') values.push([`${base}.X_HW_L3Enable`, true, 'xsd:boolean']);
    } else {
      const index = key.slice(4);
      if (!wifiRoot[index]) continue;
      values.push([`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}.Enable`, true, 'xsd:boolean']);
    }
  }
  return values;
}

function vendorParameterNames(vendor = {}, mode = 'pppoe') {
  if (vendor.id === 'huawei') {
    return {
      vlan: 'X_HW_VLAN',
      vlanEnable: '',
      serviceList: 'X_HW_SERVICELIST',
      serviceValue: mode === 'bridge' ? 'OTHER' : 'INTERNET'
    };
  }
  if (vendor.id === 'fiberhome') {
    return {
      vlan: 'VLANID',
      vlanEnable: 'VLANEnable',
      serviceList: 'X_FH_ServiceList',
      serviceValue: mode === 'bridge' ? 'OTHER' : 'INTERNET'
    };
  }
  if (vendor.parameterFamily === 'cmcc') {
    return {
      vlan: 'X_CMCC_VLANIDMark',
      vlanEnable: '',
      serviceList: 'X_CMCC_ServiceList',
      serviceValue: mode === 'bridge' ? 'OTHER' : 'INTERNET'
    };
  }
  if (vendor.id === 'zte-xpon') {
    return {
      vlan: '',
      vlanEnable: '',
      serviceList: 'X_CT-COM_ServiceList',
      serviceValue: 'INTERNET'
    };
  }
  return {
    vlan: 'X_ZTE-COM_VLANID',
    vlanEnable: 'X_ZTE-COM_VLANEnable',
    serviceList: 'X_ZTE-COM_ServiceList',
    serviceValue: 'INTERNET'
  };
}

function connectionParameterValues(plan = {}) {
  const { vendor, mode, vlan, username, password, basePath, connectionBasePath } = plan;
  const params = vendorParameterNames(vendor, mode);
  const connectionType = mode === 'bridge'
    ? (plan.objectType === 'WANPPPConnection' ? 'PPPoE_Bridged' : 'IP_Bridged')
    : 'IP_Routed';
  const values = [
    [`${basePath}.ConnectionType`, connectionType, 'xsd:string'],
    [`${basePath}.NATEnabled`, mode === 'bridge' ? false : true, 'xsd:boolean'],
    [`${basePath}.${params.serviceList}`, params.serviceValue, 'xsd:string']
  ];
  if (params.vlan) values.push([`${basePath}.${params.vlan}`, vlan, 'xsd:unsignedInt']);
  if (params.vlanEnable) values.push([`${basePath}.${params.vlanEnable}`, true, 'xsd:boolean']);
  if (vendor.id === 'zte-xpon') {
    values.push([`${connectionBasePath}.X_CT-COM_WANEponLinkConfig.VLANIDMark`, vlan, 'xsd:unsignedInt']);
  }
  if (mode === 'pppoe') {
    values.push(
      [`${basePath}.Username`, username, 'xsd:string'],
      [`${basePath}.ConnectionTrigger`, 'AlwaysOn', 'xsd:string']
    );
    if (password) values.push([`${basePath}.Password`, password, 'xsd:string']);
  } else if (plan.objectType === 'WANIPConnection') {
    values.push(
      [`${basePath}.AddressingType`, 'DHCP', 'xsd:string'],
      [`${basePath}.ConnectionTrigger`, 'AlwaysOn', 'xsd:string']
    );
  }
  if (plan.isNew) {
    const suffix = mode === 'bridge' ? `OTHER_B_VID_${vlan}` : `INTERNET_R_VID_${vlan}`;
    values.push([`${basePath}.Name`, `${plan.connectionIndex}_${suffix}`, 'xsd:string']);
  }
  return values;
}

function nextWanConnectionIndex(device = {}, wanDeviceIndex = 1) {
  const root = device?.InternetGatewayDevice?.WANDevice?.[String(wanDeviceIndex)]?.WANConnectionDevice;
  const indexes = numericEntries(root).map(([index]) => Number(index));
  return indexes.length ? Math.max(...indexes) + 1 : 1;
}

function automaticWanTarget(summary = {}, mode = 'pppoe', vlan = null, preferredUsername = '') {
  const candidates = (summary.rows || []).filter((row) => row.editable && row.mode === mode);
  if (!candidates.length) return null;
  const preferred = cleanText(preferredUsername).toLowerCase();
  return candidates.find((row) => Number(row.vlan) === Number(vlan))
    || (preferred ? candidates.find((row) => row.username.toLowerCase() === preferred) : null)
    || (mode === 'pppoe' && summary.primary?.mode === mode ? summary.primary : null)
    || candidates.find((row) => row.connected)
    || candidates.find((row) => row.active)
    || candidates[0];
}

function defaultWanTarget(summary = {}, mode = '') {
  const normalizedMode = cleanText(mode).toLowerCase();
  const candidates = (summary.rows || []).filter((row) => (
    row.editable
    && (!normalizedMode || row.mode === normalizedMode)
  ));
  if (normalizedMode === 'pppoe' && summary.primary?.editable) {
    return summary.primary;
  }
  if (!normalizedMode && summary.primary?.editable) {
    return summary.primary;
  }
  return candidates[0] || null;
}

function prepareWanProvision(device = {}, payload = {}) {
  const summary = summarizeWanConnections(device, payload.preferredUsername || payload.username);
  const vendor = summary.vendor;
  if (vendor.id === 'unknown') throw new Error('Vendor/model modem belum didukung untuk konfigurasi WAN otomatis');
  if (vendor.wanWriteSupported === false) throw new Error(vendor.wanWriteNote || `Set WAN otomatis belum didukung untuk ${vendor.label}`);
  const mode = cleanText(payload.mode || 'pppoe').toLowerCase();
  if (!['pppoe', 'bridge'].includes(mode)) throw new Error('Mode WAN harus PPPoE atau Bridge');
  if (mode === 'bridge' && !vendor.bridgeSupported) throw new Error(`Bridge otomatis belum didukung untuk ${vendor.label}`);
  const vlan = Number(payload.vlan);
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) throw new Error('VLAN wajib angka 1 sampai 4094');
  if (PROTECTED_WAN_VLANS.has(vlan)) throw new Error(`VLAN ${vlan} dilindungi untuk provisioning GenieACS`);
  const username = cleanText(payload.username);
  const password = String(payload.password ?? '');
  if (mode === 'pppoe' && !username) throw new Error('Username PPPoE wajib diisi');
  const bindings = normalizeBindingKeys(payload.bindings);

  const available = new Set(availableWanBindings(device).map((item) => item.key));
  const unavailable = bindings.filter((key) => !available.has(key));
  if (unavailable.length) throw new Error(`Binding tidak tersedia pada modem: ${unavailable.join(', ')}`);

  const requestedTarget = cleanText(payload.targetWan || 'auto').toLowerCase();
  const automaticTarget = requestedTarget === 'auto'
    ? automaticWanTarget(summary, mode, vlan, payload.preferredUsername || username)
    : null;
  const targetWan = automaticTarget?.id
    || (['auto', 'new'].includes(requestedTarget) ? 'new' : cleanText(payload.targetWan));
  const existing = targetWan === 'new' ? null : summary.rows.find((row) => row.id === targetWan);
  if (targetWan !== 'new' && !existing) throw new Error('Target WAN tidak ditemukan');
  if (existing?.protected) throw new Error('WAN provisioning GenieACS tidak boleh diubah');
  if (existing && existing.mode !== mode) throw new Error('Mode target WAN tidak sesuai');
  const isNew = !existing;
  if (isNew && mode === 'pppoe' && !password) throw new Error('Password PPPoE wajib diisi untuk WAN baru');

  const conflicts = summary.rows.filter((row) => (
    row.id !== existing?.id
    && row.bindings.some((key) => bindings.includes(key))
  ));
  const protectedConflict = conflicts.find((row) => row.protected);
  if (protectedConflict) {
    throw new Error(`${protectedConflict.bindings.filter((key) => bindings.includes(key)).join(', ')} terikat ke WAN management dan tidak boleh dipindahkan`);
  }
  if (conflicts.length && payload.moveBindings !== true) {
    const keys = [...new Set(conflicts.flatMap((row) => row.bindings.filter((key) => bindings.includes(key))))];
    throw new Error(`${keys.join(', ')} masih terikat ke WAN lain. Aktifkan konfirmasi pemindahan binding.`);
  }

  const wanDeviceIndex = existing?.wanDeviceIndex || 1;
  const connectionIndex = existing?.connectionIndex || nextWanConnectionIndex(device, wanDeviceIndex);
  const objectType = existing?.objectType
    || (mode === 'pppoe' ? 'WANPPPConnection' : preferredBridgeObjectType(device, vendor));
  const instance = existing?.instance || 1;
  const connectionRootPath = `InternetGatewayDevice.WANDevice.${wanDeviceIndex}.WANConnectionDevice`;
  const connectionBasePath = `${connectionRootPath}.${connectionIndex}`;
  const objectRootPath = `${connectionBasePath}.${objectType}`;
  const basePath = existing?.basePath || `${objectRootPath}.${instance}`;
  const parameterFamily = existing?.parameterFamily || preferredWanParameterFamily(device, vendor);
  const planVendor = { ...vendor, parameterFamily };
  const plan = {
    device,
    vendor: planVendor,
    mode,
    vlan,
    username,
    password,
    bindings,
    targetWan,
    existing,
    isNew,
    wanDeviceIndex,
    connectionIndex,
    instance,
    objectType,
    connectionRootPath,
    connectionBasePath,
    objectRootPath,
    basePath,
    conflicts,
    parameterValues: [],
    activationValues: [],
    enableBindingValues: [],
    bindingValues: []
  };
  plan.parameterValues = connectionParameterValues(plan);
  plan.activationValues = [[`${basePath}.Enable`, true, 'xsd:boolean']];
  plan.enableBindingValues = bindingEnableParameterValues(device, planVendor, bindings);
  plan.bindingValues = bindingParameterValues(basePath, planVendor, bindings, existing?.bindingExtraPaths || []);
  plan.cleanupValues = conflicts.flatMap((row) => bindingParameterValues(
    row.basePath,
    { ...vendor, parameterFamily: row.parameterFamily || parameterFamily },
    row.bindings.filter((key) => !bindings.includes(key)),
    row.bindingExtraPaths || []
  ));
  return plan;
}

function prepareWanBinding(device = {}, payload = {}) {
  const summary = summarizeWanConnections(device, payload.preferredUsername || '');
  const vendor = summary.vendor;
  if (vendor.id === 'unknown') throw new Error('Vendor/model modem belum didukung untuk binding WAN otomatis');
  if (vendor.wanWriteSupported === false) {
    throw new Error(vendor.wanWriteNote || `Binding WAN otomatis belum didukung untuk ${vendor.label}`);
  }
  const targetWan = cleanText(payload.targetWan);
  const existing = summary.rows.find((row) => row.id === targetWan);
  if (!existing) throw new Error('Pilih WAN yang sudah ada untuk menyimpan binding');
  if (existing.protected || !existing.editable) throw new Error('WAN provisioning GenieACS tidak boleh diubah');

  const bindings = normalizeBindingKeys(payload.bindings);
  const available = new Set(availableWanBindings(device).map((item) => item.key));
  const unavailable = bindings.filter((key) => !available.has(key));
  if (unavailable.length) throw new Error(`Binding tidak tersedia pada modem: ${unavailable.join(', ')}`);

  const conflicts = summary.rows.filter((row) => (
    row.id !== existing.id
    && row.bindings.some((key) => bindings.includes(key))
  ));
  const protectedConflict = conflicts.find((row) => row.protected);
  if (protectedConflict) {
    const conflictKeys = protectedConflict.bindings.filter((key) => bindings.includes(key));
    throw new Error(`${conflictKeys.join(', ')} terikat ke WAN management dan tidak boleh dipindahkan`);
  }
  if (conflicts.length && payload.moveBindings !== true) {
    const keys = [...new Set(conflicts.flatMap((row) => row.bindings.filter((key) => bindings.includes(key))))];
    throw new Error(`${keys.join(', ')} masih terikat ke WAN lain. Aktifkan konfirmasi pemindahan binding.`);
  }

  const parameterFamily = existing.parameterFamily || preferredWanParameterFamily(device, vendor);
  const planVendor = { ...vendor, parameterFamily };
  return {
    device,
    vendor: planVendor,
    bindingOnly: true,
    mode: existing.mode,
    vlan: existing.vlan,
    username: existing.username,
    password: '',
    bindings,
    targetWan: existing.id,
    existing,
    isNew: false,
    wanDeviceIndex: existing.wanDeviceIndex,
    connectionIndex: existing.connectionIndex,
    instance: existing.instance,
    objectType: existing.objectType,
    connectionRootPath: `InternetGatewayDevice.WANDevice.${existing.wanDeviceIndex}.WANConnectionDevice`,
    connectionBasePath: existing.basePath.split(`.${existing.objectType}.`)[0],
    objectRootPath: existing.basePath.replace(/\.\d+$/, ''),
    basePath: existing.basePath,
    conflicts,
    parameterValues: [],
    activationValues: [],
    enableBindingValues: bindingEnableParameterValues(device, planVendor, bindings),
    bindingValues: bindingParameterValues(existing.basePath, planVendor, bindings, existing.bindingExtraPaths || []),
    cleanupValues: conflicts.flatMap((row) => bindingParameterValues(
      row.basePath,
      { ...vendor, parameterFamily: row.parameterFamily || parameterFamily },
      row.bindings.filter((key) => !bindings.includes(key)),
      row.bindingExtraPaths || []
    ))
  };
}

function rebaseNewWanPlan(plan = {}, indexes = {}) {
  if (!plan.isNew) return plan;
  const connectionIndex = Number(indexes.connectionIndex || plan.connectionIndex);
  const instance = Number(indexes.instance || plan.instance || 1);
  if (!Number.isInteger(connectionIndex) || connectionIndex < 1 || !Number.isInteger(instance) || instance < 1) {
    throw new Error('Instance WAN baru dari modem tidak valid');
  }
  plan.connectionIndex = connectionIndex;
  plan.instance = instance;
  plan.connectionBasePath = `${plan.connectionRootPath}.${connectionIndex}`;
  plan.objectRootPath = `${plan.connectionBasePath}.${plan.objectType}`;
  plan.basePath = `${plan.objectRootPath}.${instance}`;
  plan.parameterValues = connectionParameterValues(plan);
  plan.activationValues = [[`${plan.basePath}.Enable`, true, 'xsd:boolean']];
  plan.bindingValues = bindingParameterValues(plan.basePath, plan.vendor, plan.bindings);
  return plan;
}

function publicWanPlan(plan = {}) {
  return {
    bindingOnly: plan.bindingOnly === true,
    mode: plan.mode,
    vlan: plan.vlan,
    username: plan.username,
    bindings: plan.bindings,
    targetWan: plan.targetWan,
    basePath: plan.basePath,
    objectType: plan.objectType,
    connectionType: plan.mode === 'bridge'
      ? (plan.objectType === 'WANPPPConnection' ? 'PPPoE_Bridged' : 'IP_Bridged')
      : 'IP_Routed',
    isNew: plan.isNew,
    vendor: plan.vendor?.label || '',
    movedBindingsFrom: (plan.conflicts || []).map((row) => row.basePath)
  };
}

module.exports = {
  BINDING_KEYS,
  PROTECTED_WAN_VLANS,
  availableWanBindings,
  bridgeTarget,
  defaultWanTarget,
  detectWanVendor,
  prepareWanBinding,
  prepareWanProvision,
  publicWanPlan,
  rebaseNewWanPlan,
  summarizeWanConnections,
  _internal: {
    bindingParameterValues,
    bindingEnableParameterValues,
    connectionParameterValues,
    defaultWanTarget,
    normalizeBindingKeys,
    protectedWan,
    automaticWanTarget,
    preferredBridgeObjectType,
    preferredWanParameterFamily,
    wanBindings,
    wanParameterFamily,
    wanVlan
  }
};
