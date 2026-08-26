'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const uiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_UI_PORT || 7568)}`;
const nbiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_NBI_PORT || 7557)}`;
const uiUsername = String(process.env.GENIEACS_UI_USERNAME || 'billing');
const uiPassword = String(process.env.GENIEACS_UI_PASSWORD || 'billing123');
const cwmpUsername = String(process.env.GENIEACS_CWMP_AUTH_USERNAME || 'admin');
const cwmpPassword = String(process.env.GENIEACS_CWMP_AUTH_PASSWORD || '1sampai10');
const mongoUrl = String(process.env.GENIEACS_MONGODB_CONNECTION_URL || 'mongodb://127.0.0.1:27017/genieacs');
const assetsDir = path.join(__dirname, 'virtual-parameters');
const externalBootstrap = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_BOOTSTRAP_EXTERNAL || '').toLowerCase());
const autoProvisionEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_AUTO_VP_PROVISION || '').toLowerCase());
const dryRun = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_BOOTSTRAP_DRY_RUN || '').toLowerCase());
const requestTimeoutMs = Math.max(1000, Number(process.env.GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS || 2500) || 2500);
const autoProvisionVirtualParameters = new Set([
  'IPTR069',
  'LANActiveClients',
  'LANClients',
  'PonMac',
  'RXPower',
  'activedevices',
  'getSerialNumber',
  'getdeviceuptime',
  'getponmode',
  'getpppuptime',
  'gettemp',
  'ip',
  'pppoe',
  'pppoeIP',
  'pppoeMac',
  'pppoeUsername',
  'pppoeUsername2',
  'wanVlan',
  'wifiSsid24',
  'wifiSsid5'
]);

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs || requestTimeoutMs) || requestTimeoutMs));
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  }).finally(() => clearTimeout(timer));
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} HTTP ${response.status}: ${text.slice(0, 180)}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function waitForUi() {
  let lastError = null;
  const attempts = Math.max(1, Number(process.env.GENIEACS_UI_BOOTSTRAP_ATTEMPTS || 12) || 12);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await request(`${uiBase}/status`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError || new Error('GenieACS UI belum siap');
}

async function waitForNbi() {
  let lastError = null;
  const attempts = Math.max(1, Number(process.env.GENIEACS_NBI_BOOTSTRAP_ATTEMPTS || 6) || 6);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const devices = await request(`${nbiBase}/devices/?limit=1`);
      if (Array.isArray(devices)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('GenieACS NBI belum siap');
}

async function login(username, password) {
  const token = await request(`${uiBase}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return String(token || '').replace(/^"|"$/g, '');
}

async function uiPut(token, resource, body) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'PUT',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` },
    body: JSON.stringify(body)
  });
}

async function uiDelete(token, resource) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'DELETE',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` }
  });
}

async function bootstrapUser() {
  const init = await request(`${uiBase}/init`);
  let token;
  if (init?.users === true) {
    await request(`${uiBase}/init`, {
      method: 'POST',
      body: JSON.stringify({ users: true, presets: true, filters: true, device: true, index: true, overview: true })
    });
    token = await login('admin', 'admin');
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}`, { roles: 'admin' });
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}/password`, { newPassword: uiPassword });
    token = await login(uiUsername, uiPassword);
    if (uiUsername !== 'admin') await uiDelete(token, 'users/admin');
    return token;
  }
  return login(uiUsername, uiPassword);
}

function virtualParameterScripts() {
  return fs.readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((file) => ({
      name: path.basename(file, '.js'),
      script: fs.readFileSync(path.join(assetsDir, file), 'utf8')
    }));
}

function virtualParameterName(row = {}) {
  return String(row._id || row.name || '').trim();
}

function virtualParameterScript(row = {}) {
  return String(row.script || '');
}

async function readVirtualParametersViaNbi() {
  const rows = await request(`${nbiBase}/virtualParameters?projection=_id,script`);
  if (!Array.isArray(rows)) throw new Error('Daftar Virtual Parameters NBI tidak valid');
  return rows;
}

async function installVirtualParametersViaNbi(rows = []) {
  for (const row of rows) {
    await request(`${nbiBase}/virtualParameters/${encodeURIComponent(row.name)}`, {
      method: 'PUT',
      body: JSON.stringify({ script: row.script })
    });
  }
}

function auditVirtualParameterDefinitions(sourceRows = [], currentRows = [], baselineRows = []) {
  const managedNames = new Set(sourceRows.map((row) => row.name));
  const sourceByName = new Map(sourceRows.map((row) => [row.name, row.script]));
  const currentByName = new Map(currentRows.map((row) => [virtualParameterName(row), virtualParameterScript(row)]));
  const baselineUnmanaged = baselineRows.filter((row) => !managedNames.has(virtualParameterName(row)));
  return {
    missing: sourceRows.map((row) => row.name).filter((name) => !currentByName.has(name)),
    changed: sourceRows.map((row) => row.name).filter((name) => currentByName.has(name) && currentByName.get(name) !== sourceByName.get(name)),
    unmanagedMissing: baselineUnmanaged.map(virtualParameterName).filter((name) => !currentByName.has(name)),
    unmanagedChanged: baselineUnmanaged.filter((row) => {
      const name = virtualParameterName(row);
      return currentByName.has(name) && currentByName.get(name) !== virtualParameterScript(row);
    }).map(virtualParameterName),
    managedCount: managedNames.size,
    unmanagedCount: currentRows.filter((row) => !managedNames.has(virtualParameterName(row))).length
  };
}

function verifyVirtualParameterDefinitions(sourceRows = [], currentRows = [], baselineRows = []) {
  const audit = auditVirtualParameterDefinitions(sourceRows, currentRows, baselineRows);
  const errors = [];
  if (audit.missing.length) errors.push(`parameter billing hilang: ${audit.missing.join(', ')}`);
  if (audit.changed.length) errors.push(`script parameter billing tidak sesuai: ${audit.changed.join(', ')}`);
  if (audit.unmanagedMissing.length) errors.push(`parameter existing hilang: ${audit.unmanagedMissing.join(', ')}`);
  if (audit.unmanagedChanged.length) errors.push(`parameter existing berubah: ${audit.unmanagedChanged.join(', ')}`);
  if (errors.length) throw new Error(`Verifikasi Virtual Parameters gagal: ${errors.join('; ')}`);
  process.stdout.write(`Verifikasi Virtual Parameters berhasil: managed=${audit.managedCount}, existing=${audit.unmanagedCount}.\n`);
  return audit;
}

async function installVirtualParametersViaUi(token, rows = []) {
  if (!token) throw new Error('Token UI GenieACS tidak tersedia');
  for (const row of rows) {
    await uiPut(token, `virtualParameters/${encodeURIComponent(row.name)}`, { script: row.script });
  }
}

function installVirtualParametersViaMongo(rows = []) {
  const command = ['mongosh', 'mongo'].find((candidate) => {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  });
  if (!command) throw new Error('mongosh/mongo tidak tersedia untuk fallback Virtual Parameters');

  const script = [
    'const rows = ' + JSON.stringify(rows) + ';',
    'for (const row of rows) {',
    '  db.getCollection("virtualParameters").updateOne({ _id: row.name }, { $set: { script: row.script } }, { upsert: true });',
    '}',
    'print("Virtual Parameters aktif: " + rows.map((row) => row.name).join(", "));'
  ].join('\n');
  const args = command === 'mongosh'
    ? ['--quiet', mongoUrl, '--eval', script]
    : ['--quiet', mongoUrl, '--eval', script];
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'fallback MongoDB gagal').trim());
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function backfillVirtualParameterValuesViaMongo() {
  const command = ['mongosh', 'mongo'].find((candidate) => {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  });
  if (!command) return;

  const script = [
    'function clean(value) { return value === undefined || value === null ? "" : String(value).trim(); }',
    'function leaf(doc, path) {',
    '  const node = path.split(".").reduce((item, key) => item && item[key], doc);',
    '  if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, "_value")) return node._value;',
    '  return "";',
    '}',
    'function first(doc, paths) {',
    '  for (const path of paths) {',
    '    const value = clean(leaf(doc, path));',
    '    if (value) return { path, value };',
    '  }',
    '  return { path: "", value: "" };',
    '}',
    'function numberText(value) {',
    '  const text = clean(value);',
    '  if (!text) return "";',
    '  const number = Number(text.replace(",", ".").replace(/[^\\d.-]/g, ""));',
    '  if (!Number.isFinite(number) || [0,-255,255,65535,32767].includes(number)) return "";',
    '  return String(Math.round(number * 100) / 100);',
    '}',
    'function rxPowerText(value, path) {',
    '  let number = Number(clean(value).replace(",", ".").replace(/[^\\d.-]/g, ""));',
    '  if (!Number.isFinite(number) || [0, -255, 255, 65535, 32767].includes(number)) return "";',
    '  if (/ZTE/i.test(path) && number > 0 && number < 1000) number = -number / 10;',
    '  else if (number > 0 && /(CMCC|CT-COM|CU|FH|GPON|EPON|WANPON|Optical)/i.test(path)) number = 30 + (Math.log10(number * Math.pow(10, -7)) * 10);',
    '  else if (number < -100 || number > 100) number /= 100;',
    '  if (!Number.isFinite(number) || number < -60 || number > 10) return "";',
    '  return String(Math.round(number * 100) / 100);',
    '}',
    'function tempConvertRaw(value) {',
    '  const samples = [[11509,45],[11876,46],[10866,42],[10592,41],[11142,43],[11968,46]];',
    '  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;',
    '  for (const sample of samples) {',
    '    sumX += sample[0];',
    '    sumY += sample[1];',
    '    sumXY += sample[0] * sample[1];',
    '    sumX2 += sample[0] * sample[0];',
    '  }',
    '  const slope = ((samples.length * sumXY) - (sumX * sumY)) / ((samples.length * sumX2) - (sumX * sumX));',
    '  return (slope * value) + ((sumY - (slope * sumX)) / samples.length);',
    '}',
    'function tempText(value) {',
    '  let number = Number(clean(value).replace(",", ".").replace(/[^\\d.-]/g, ""));',
    '  if (!Number.isFinite(number) || [0, -255, 255, 65535, 32767].includes(number)) return "";',
    '  if (number > 1000 && number < 20000) number = tempConvertRaw(number);',
    '  else if (number > 150 && number <= 1000) number /= 10;',
    '  if (!Number.isFinite(number) || number < 5 || number > 120) return "";',
    '  return String(Math.round(number));',
    '}',
    'function wanIndexedPaths(patterns) {',
    '  const rows = [];',
    '  for (const pattern of patterns) for (const index of [1,2,3,4]) rows.push(pattern.replace("*", String(index)));',
    '  return rows;',
    '}',
    'function pppUsernamePaths() {',
    '  const rows = [];',
    '  for (const wan of [1,2,3,4]) {',
    '    for (let connection = 1; connection <= 8; connection += 1) {',
    '      for (let ppp = 1; ppp <= 8; ppp += 1) rows.push("InternetGatewayDevice.WANDevice." + wan + ".WANConnectionDevice." + connection + ".WANPPPConnection." + ppp + ".Username");',
    '    }',
    '  }',
    '  for (let ppp = 1; ppp <= 8; ppp += 1) rows.push("Device.PPP.Interface." + ppp + ".Username");',
    '  return rows;',
    '}',
    'function vlanText(value) {',
    '  const match = clean(value).match(/(\\d{1,4})/);',
    '  const number = Number(match && match[1]);',
    '  return Number.isInteger(number) && number >= 1 && number <= 4094 ? String(number) : "";',
    '}',
    'function singleBandWifi(doc) {',
    '  const text = clean((doc._deviceId && doc._deviceId._ProductClass) || "") + " " + clean(leaf(doc, "InternetGatewayDevice.DeviceInfo.ProductClass")) + " " + clean(leaf(doc, "Device.DeviceInfo.ProductClass")) + " " + clean(leaf(doc, "InternetGatewayDevice.DeviceInfo.ModelName")) + " " + clean(leaf(doc, "Device.DeviceInfo.ModelName"));',
    '  const lower = text.toLowerCase();',
    '  if (/5g|5ghz|5 ghz|dual|ac\\d|ax\\d|wifi6|wi-?fi 6/.test(lower)) return false;',
    '  return /xpon\\+1ge\\+1fe\\+wifi|1ge\\+1fe\\+wifi|\\bf609\\b|\\bzxhn\\s*f609\\b|\\bf660\\b/.test(lower);',
    '}',
    'function uptimeText(value) {',
    '  let seconds = Number(value || 0);',
    '  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;',
    '  const days = Math.floor(seconds / 86400);',
    '  let rem = seconds % 86400;',
    '  const hours = String(Math.floor(rem / 3600)).padStart(2, "0");',
    '  rem %= 3600;',
    '  const minutes = String(Math.floor(rem / 60)).padStart(2, "0");',
    '  const secs = String(Math.floor(rem % 60)).padStart(2, "0");',
    '  return days + "d " + hours + ":" + minutes + ":" + secs;',
    '}',
    'function hostActive(doc, prefix) {',
    '  const active = clean(leaf(doc, prefix + ".Active")).toLowerCase();',
    '  if (["0","false","no","off","down","inactive","disabled","offline"].includes(active)) return false;',
    '  return Boolean(clean(leaf(doc, prefix + ".IPAddress")) || clean(leaf(doc, prefix + ".MACAddress")) || clean(leaf(doc, prefix + ".HostName")));',
    '}',
    'function hostWifi(doc, prefix) {',
    '  const text = ["InterfaceType","Layer1Interface","Layer2Interface","Interface","X_HW_InterfaceType","X_ZTE-COM_InterfaceType"].map((name) => clean(leaf(doc, prefix + "." + name))).join(" ");',
    '  return /wifi|wi-?fi|wlan|ssid|radio|wireless|802\\.11/i.test(text);',
    '}',
    'function hostPrefixes(doc) {',
    '  const roots = ["InternetGatewayDevice.LANDevice.1.Hosts.Host", "Device.Hosts.Host"];',
    '  const rows = [];',
    '  for (const root of roots) {',
    '    const node = root.split(".").reduce((item, key) => item && item[key], doc);',
    '    if (!node || typeof node !== "object") continue;',
    '    for (const key of Object.keys(node)) if (/^\\d+$/.test(key)) rows.push(root + "." + key);',
    '  }',
    '  return rows;',
    '}',
    'function wifiTotal(doc) {',
    '  let total = 0;',
    '  for (let index = 1; index <= 8; index += 1) {',
    '    for (const suffix of ["TotalAssociations","AssociatedDeviceNumberOfEntries","WLAN_AssociatedDeviceNumberOfEntries"]) {',
    '      const value = Number(clean(leaf(doc, "InternetGatewayDevice.LANDevice.1.WLANConfiguration." + index + "." + suffix)));',
    '      if (Number.isFinite(value) && value > 0) { total += value; break; }',
    '    }',
    '  }',
    '  return total;',
    '}',
    'function setVp(set, name, value, type, writable) {',
    '  if (value === undefined || value === null || value === "") return;',
    '  set["VirtualParameters." + name] = { _object: false, _timestamp: new Date(), _type: type || "xsd:string", _value: value, _writable: writable === true };',
    '}',
    'const rxPaths = ["InternetGatewayDevice.DeviceInfo.XponInterface.RXPower","InternetGatewayDevice.DeviceInfo.XponInterface.RxPower","InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_HW_EponInterfaceConfig.RXPower","InternetGatewayDevice.WANDevice.1.X_HW_GponInterfaceConfig.RXPower","InternetGatewayDevice.X_HW_RMS.PonStatus.RXPower","Device.Optical.Interface.1.RXPower"];',
    'const tempPaths = ["InternetGatewayDevice.DeviceInfo.XponInterface.Temperature","InternetGatewayDevice.DeviceInfo.XponInterface.TransceiverTemperature","InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.Temperature","InternetGatewayDevice.X_HW_RMS.PonStatus.TransceiverTemperature","InternetGatewayDevice.X_HW_RMS.PonStatus.Temperature","Device.Optical.Interface.1.Temperature","Device.Optical.Interface.1.TransceiverTemperature"].concat(wanIndexedPaths(["InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature","InternetGatewayDevice.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature","InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_GC_GponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_GC_EponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_GC_WANPONInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_FH_EponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_HW_EponInterfaceConfig.TransceiverTemperature","InternetGatewayDevice.WANDevice.*.X_HW_GponInterfaceConfig.TransceiverTemperature"]));',
    'const ponMacPaths = ["InternetGatewayDevice.DeviceInfo.XponInterface.MACAddress","InternetGatewayDevice.DeviceInfo.XponInterface.PONMACAddress","InternetGatewayDevice.DeviceInfo.XponInterface.PonMac","InternetGatewayDevice.DeviceInfo.XponInterface.MAC","InternetGatewayDevice.DeviceInfo.X_CU_SerialNumber","InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress","InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress","InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.MACAddress","InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.MACAddress"];',
    'const pppUserPaths = pppUsernamePaths();',
    'const ssid24Paths = ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID","Device.WiFi.SSID.1.SSID","Device.WiFi.SSID.2.SSID"];',
    'const ssid5Paths = ["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID","InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID","Device.WiFi.SSID.5.SSID","Device.WiFi.SSID.2.SSID"];',
    'function wanVlanPaths(pppBase) {',
    '  const paths = [];',
    '  if (pppBase) {',
    '    for (const suffix of ["X_HW_VLAN","X_ZTE-COM_VLANID","X_FH_VLANID","X_GC_VLANIDMark","X_GC_VLANID","X_CMCC_VLANIDMark","X_CMCC_VLANID","X_CT-COM_VLANID","X_CT-COM_VLANIDMark","VLANID","VLANIDMark"]) paths.push(pppBase + "." + suffix);',
    '    const connectionDeviceBase = pppBase.replace(/\\.(?:WANPPPConnection|WANIPConnection)\\.\\d+$/, "");',
    '    if (connectionDeviceBase && connectionDeviceBase !== pppBase) {',
    '      for (const suffix of ["X_CT-COM_WANEponLinkConfig.VLANIDMark","X_CT-COM_WANGponLinkConfig.VLANIDMark","X_CT-COM_WANEponLinkConfig.VLANID","X_CT-COM_WANGponLinkConfig.VLANID","X_CT-COM_VLANID","X_CT-COM_VLANIDMark"]) paths.push(connectionDeviceBase + "." + suffix);',
    '    }',
    '  }',
    '  return paths.concat(["Device.Ethernet.VLANTermination.1.VLANID","Device.Ethernet.VLANTermination.2.VLANID"]);',
    '}',
    'let updated = 0;',
    'db.getCollection("devices").find({}).forEach((doc) => {',
    '  const set = {};',
    '  const rxSource = first(doc, rxPaths);',
    '  const rx = rxPowerText(rxSource.value, rxSource.path);',
    '  const temp = tempText(first(doc, tempPaths).value);',
    '  const pppUser = first(doc, pppUserPaths).value;',
    '  const pppBase = first(doc, pppUserPaths).path.replace(/\\.Username$/, "");',
    '  setVp(set, "RXPower", rx);',
    '  setVp(set, "gettemp", temp);',
    '  setVp(set, "getSerialNumber", clean(doc._deviceId && doc._deviceId._SerialNumber));',
    '  setVp(set, "PonMac", first(doc, ponMacPaths).value);',
    '  setVp(set, "getponmode", first(doc, ["InternetGatewayDevice.DeviceInfo.XponInterface.PonMode","InternetGatewayDevice.DeviceInfo.XponInterface.Mode","InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType"]).value);',
    '  setVp(set, "getdeviceuptime", uptimeText(first(doc, ["InternetGatewayDevice.DeviceInfo.UpTime","Device.DeviceInfo.UpTime"]).value));',
    '  if (pppBase) {',
    '    setVp(set, "getpppuptime", uptimeText(leaf(doc, pppBase + ".Uptime")));',
    '    setVp(set, "pppoeIP", first(doc, [pppBase + ".ExternalIPAddress", pppBase + ".IPCP.LocalIPAddress"]).value);',
    '    setVp(set, "pppoeMac", leaf(doc, pppBase + ".MACAddress"));',
    '    setVp(set, "wanVlan", vlanText(first(doc, wanVlanPaths(pppBase)).value), "xsd:unsignedInt");',
    '  }',
    '  setVp(set, "pppoeUsername", pppUser, "xsd:string", true);',
    '  setVp(set, "pppoe", pppUser);',
    '  setVp(set, "pppoeUsername2", pppUser);',
    '  setVp(set, "wifiSsid24", first(doc, ssid24Paths).value);',
    '  if (singleBandWifi(doc)) set["VirtualParameters.wifiSsid5"] = { _object: false, _timestamp: new Date(), _type: "xsd:string", _value: "", _writable: false };',
    '  else setVp(set, "wifiSsid5", first(doc, ssid5Paths).value);',
    '  setVp(set, "activedevices", wifiTotal(doc), "xsd:int");',
    '  const lanActive = hostPrefixes(doc).filter((prefix) => hostActive(doc, prefix) && !hostWifi(doc, prefix)).length;',
    '  setVp(set, "LANActiveClients", lanActive, "xsd:unsignedInt");',
    '  setVp(set, "LANClients", lanActive, "xsd:unsignedInt");',
    '  if (Object.keys(set).length) {',
    '    db.getCollection("devices").updateOne({ _id: doc._id }, { $set: set });',
    '    updated += 1;',
    '  }',
    '});',
    'print("Backfill Virtual Parameters devices: " + updated);'
  ].join('\n');
  const args = command === 'mongosh'
    ? ['--quiet', mongoUrl, '--eval', script]
    : ['--quiet', mongoUrl, '--eval', script];
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`Peringatan: backfill Virtual Parameters gagal: ${(result.stderr || result.stdout || '').trim()}\n`);
    return;
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

async function installVirtualParameters(token, baselineRows = []) {
  const rows = virtualParameterScripts();
  let installed = false;
  try {
    await installVirtualParametersViaNbi(rows);
    installed = true;
  } catch (error) {
    process.stderr.write(`Peringatan: install Virtual Parameters via NBI gagal: ${error.message || error}\n`);
  }
  if (!installed && token) {
    try {
      await installVirtualParametersViaUi(token, rows);
      installed = true;
    } catch (error) {
      process.stderr.write(`Peringatan: install Virtual Parameters via UI gagal: ${error.message || error}\n`);
    }
  }
  if (!installed) {
    installVirtualParametersViaMongo(rows);
  }
  const declarations = rows
    .filter((row) => autoProvisionVirtualParameters.has(row.name))
    .map((row) => `declare("VirtualParameters.${row.name}", {value: daily});`)
    .join('\n');
  const provision = [
    'const daily = Date.now() - 86400000;',
    declarations
  ].join('\n');
  await request(`${nbiBase}/provisions/fakenet-virtual-parameters`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/javascript' },
    body: provision
  });
  await request(`${nbiBase}/presets/fakenet-virtual-parameters`, {
    method: 'PUT',
    body: JSON.stringify({
      weight: 10,
      precondition: autoProvisionEnabled ? '{}' : JSON.stringify({ _id: '__disabled_by_fakenet_billing__' }),
      configurations: [{ type: 'provision', name: 'fakenet-virtual-parameters', args: [] }]
    })
  });
  backfillVirtualParameterValuesViaMongo();
  const currentRows = await readVirtualParametersViaNbi();
  verifyVirtualParameterDefinitions(rows, currentRows, baselineRows);
}

async function main() {
  await waitForNbi();
  const sourceRows = virtualParameterScripts();
  const baselineRows = await readVirtualParametersViaNbi();
  if (dryRun) {
    const audit = auditVirtualParameterDefinitions(sourceRows, baselineRows, baselineRows);
    process.stdout.write(`Audit Virtual Parameters (read-only): managed=${audit.managedCount}, existing=${audit.unmanagedCount}, missing=${audit.missing.length}, changed=${audit.changed.length}.\n`);
    if (audit.missing.length) process.stdout.write(`Parameter billing belum ada: ${audit.missing.join(', ')}.\n`);
    if (audit.changed.length) process.stdout.write(`Parameter billing perlu diperbarui: ${audit.changed.join(', ')}.\n`);
    return;
  }
  let token = '';
  if (externalBootstrap) {
    process.stdout.write('GenieACS existing terdeteksi: akun dan konfigurasi UI dipertahankan.\n');
  } else {
    try {
      await waitForUi();
      token = await bootstrapUser();
      await uiPut(token, 'config/cwmp.auth', {
        value: `AUTH(${JSON.stringify(cwmpUsername)}, ${JSON.stringify(cwmpPassword)})`
      });
    } catch (error) {
      process.stderr.write(`Peringatan: bootstrap UI GenieACS dilewati: ${error.message || error}\n`);
    }
  }
  await installVirtualParameters(token, baselineRows);
  process.stdout.write('Bootstrap GenieACS selesai: akun UI, autentikasi Inform, dan Virtual Parameters aktif.\n');
}

main().catch((error) => {
  console.error(`Bootstrap GenieACS gagal: ${error.message || error}`);
  process.exitCode = 1;
});
