'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const secrets = require('./secure-secrets');
const redis = require('./redis-cache');
const cli = require('./olt-cli');
const networkIdentity = require('./network-identity');
const autoIdentity = require('./olt-auto-identity');
const plannedReboot = require('./olt-planned-reboot');
const losConfirmation = require('./olt-los-confirmation');
const vendors = require('./olt-vendors');
const hioso = require('./olt-hioso');
const telemetry = require('./olt-telemetry');
const ticketIncidents = require('./ticket-incidents');

const exec = promisify(execFile);
const OIDS = Object.freeze({
  system: '1.3.6.1.2.1.1', interfaces: '1.3.6.1.2.1.2.2.1.2', interfaceStatus: '1.3.6.1.2.1.2.2.1.8',
  name: '1.3.6.1.4.1.17409.2.8.4.1.1.2', serial: '1.3.6.1.4.1.17409.2.8.4.1.1.3',
  model: '1.3.6.1.4.1.17409.2.8.4.1.1.6', status: '1.3.6.1.4.1.17409.2.8.4.1.1.7',
  distance: '1.3.6.1.4.1.17409.2.8.4.1.1.9', rx: '1.3.6.1.4.1.17409.2.8.4.4.1.4',
  temperature: '1.3.6.1.4.1.17409.1.3.3.2.2.1.12'
});
const CACHE_MS = 180000;
const MAX_DEVICES = 32;
const MAX_ONUS = 8192;
const cache = new Map();
const pending = new Map();
const lastAttempt = new Map();
const refreshTimes = new Map();
const refreshQueue = new Map();
const diagnosticPending = new Set(),diagnosticTimes = new Map();
const causePositions = new WeakMap();
const saveTimes = new Map();
function remember(map, key, value) {
  map.set(key, value);
  while (map.size > MAX_DEVICES * 2) map.delete(map.keys().next().value);
  return value;
}

function text(value, max = 160, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value)) throw new Error('Isian OLT tidak valid');
  return value.trim();
}
function integer(value, min, max, fallback) {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value)) || Number(value) < min || Number(value) > max) throw new Error('Angka OLT di luar batas');
  return Number(value);
}
function normalizeSerial(value = '') {
  const raw = String(value).trim().toUpperCase();
  if (/^[0-9A-F]{16}$/.test(raw)) {
    const bytes = Buffer.from(raw, 'hex');
    if (/^[A-Z0-9]{4}$/.test(bytes.subarray(0, 4).toString('ascii'))) return bytes.subarray(0, 4).toString('ascii') + bytes.subarray(4).toString('hex').toUpperCase();
  }
  return /^[A-Z0-9]{12}$/.test(raw) ? raw : '';
}
function parseRows(stdout = '') {
  const rows = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.match(/^\.?([0-9.]+)\s*=\s*(?:([A-Za-z][A-Za-z0-9 -]*):\s*)?(.*)$/);
    if (match) rows.push({ oid: match[1], type: match[2] || '', value: match[3].trim() });
    else if (/^\s*(?:[0-9A-F]{2}\s+)+[0-9A-F]{2}\s*$/i.test(line) && rows.at(-1)?.type === 'Hex-STRING') rows.at(-1).value += ' ' + line.trim();
    if (rows.length > MAX_ONUS + 256) throw new Error('Tabel SNMP melebihi batas aman');
  }
  return rows.filter(row => !/No Such|End of MIB|No more variables/i.test(row.value));
}
function number(row) {
  if (!row) return null;
  const match = String(row.value).match(/^(?:[A-Za-z_-]+\()?(-?[0-9]+)(?:\)|\s|$)/);
  return match ? Number(match[1]) : null;
}
function string(row) {
  if (!row) return '';
  if (row.type === 'Hex-STRING') {
    const bytes = row.value.replace(/\s/g, '');
    return /^(?:[0-9a-f]{2})+$/i.test(bytes) ? Buffer.from(bytes, 'hex').toString('utf8').replace(/\0.*$/, '').trim() : '';
  }
  return row.value.replace(/^"|"$/g, '').trim();
}
function column(rows, prefix) {
  return new Map(rows.filter(row => row.oid.startsWith(prefix + '.')).map(row => [row.oid.slice(prefix.length + 1), row]));
}
function position(index) {
  const n = Number(index);
  const modern = n >= 0x1480000;
  const offset = n - (modern ? 0x1480000 : 0x480000);
  if (!Number.isSafeInteger(n) || offset < 0 || offset > 0x1fffff) return null;
  const slot = (offset >>> 16) + (modern ? 1 : 0), pon = ((offset >>> 12) & 15) + 1, onuId = offset & 4095;
  return onuId >= 1 && onuId <= 1024 ? { slot, pon, onuId, ponKey: `0/${slot}/${pon}` } : null;
}
function actionPosition(device,index){return vendors.normalize(device.vendor)==='hioso'?hioso.position(index):position(index);}
function optical(row) {
  const value = number(row);
  if (value === null || [-1, -65535, 65535, 2147483647].includes(value)) return null;
  const dbm = value / 100;
  return dbm >= -60 && dbm <= 10 ? dbm : null;
}
function classifyCause(value) {
  const reason = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (/\bdying\s*gasp\b|\bpower\s*(?:off|down|fail(?:ure)?)\b|\bpwr\s*(?:off|down)\b/.test(reason)) return 'dying-gasp';
  if (/\b(?:los|losi|loss of signal|signal loss)\b/.test(reason)) return 'los';
  return 'other';
}
function summarizeOnus(rows) {
  const summary = { total: rows.length, online: 0, offline: 0, unknown: 0, highRx: 0, los: 0, dyingGasp: 0, other: 0 };
  for (const row of rows) {
    if (row.status === 'online') { summary.online++; if (row.rxPower !== null && row.rxPower <= -26.5) summary.highRx++; }
    else if (row.status === 'offline') { summary.offline++; summary[row.condition === 'los' ? 'los' : row.condition === 'dying-gasp' ? 'dyingGasp' : 'other']++; }
    else summary.unknown++;
  }
  return summary;
}
function causePosition(row){const address=position(row.id)||row;return address.ponKey&&Number.isSafeInteger(Number(address.onuId))?`${address.ponKey}:${Number(address.onuId)}:${normalizeSerial(row.serialNumber)}`:'';}
function preservedCauses(rows){const causes=new Map(),positions=new Map();for(const row of rows)if(row.downCause){const key=causePosition(row);if(key)positions.set(key,row.downCause);}causePositions.set(causes,positions);return causes;}
function applyCauses(snapshot, causes = new Map()) {
  const positions=causePositions.get(causes),counts=new Map();if(!positions)for(const row of snapshot.onus)counts.set(row.serialNumber,(counts.get(row.serialNumber)||0)+1);
  snapshot.onus = snapshot.onus.map(row => {
    const cause = row.status === 'offline' ? positions?.get(causePosition(row))||(!positions&&counts.get(row.serialNumber)===1?causes.get(row.serialNumber):null) : null;
    return { ...row, condition: row.status === 'offline' ? classifyCause(cause) : row.status, downCause: cause || '', causeKnown: Boolean(cause) };
  });
  snapshot.summary = summarizeOnus(snapshot.onus);
  snapshot.causeSchema = 2;
  for (const port of snapshot.ports||[]) if (port.kind === 'pon') Object.assign(port, summarizeOnus(snapshot.onus.filter(row => row.ponKey === port.ponKey)));
  return snapshot;
}
function matchesState(row, state) {
  if (!state) return true;
  if (state === 'high-rx') return row.status === 'online' && row.rxPower !== null && row.rxPower <= -26.5;
  return ['online','offline','unknown'].includes(state) ? row.status === state : row.condition === state;
}
function lastOnlineAt(snapshot,onu={}) {
  const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
  const ceiling=timestamp(snapshot?.checkedAt)||Date.now();
  const saved=timestamp(onu.lastOnlineAt),observed=onu.status==='online'?timestamp(snapshot?.status==='online'&&!snapshot.stale?snapshot.checkedAt:snapshot?.lastSuccessAt):0;
  const value=Math.max(saved>0&&saved<=ceiling?saved:0,observed>0&&observed<=ceiling?observed:0);
  return value?new Date(value).toISOString():'';
}
function preserveLastOnline(snapshot,previous=null) {
  // An offline poll or a failed OLT read must never advance last-online time.
  const old=new Map((previous?.onus||[]).map(row=>[normalizeSerial(row.serialNumber),lastOnlineAt(previous,row)]).filter(([sn])=>sn));
  const key=row=>JSON.stringify([row.identifierKind||'serial',normalizeSerial(row.serialNumber),String(row.id)]),readings=new Map(),duplicates=new Set();
  for(const row of previous?.onus||[]){const id=key(row);if(readings.has(id))duplicates.add(id);readings.set(id,lastOptical(previous,row));}
  return {...snapshot,onus:(snapshot.onus||[]).map(row=>{
    const known=old.get(normalizeSerial(row.serialNumber))||'',saved=lastOnlineAt(snapshot,row);
    const current=lastOptical(snapshot,row),previousReading=duplicates.has(key(row))?null:readings.get(key(row)),reading=current.at?current:previousReading?.at?previousReading:current;
    return {...row,lastOnlineAt:lastOnlineAt(snapshot,{...row,lastOnlineAt:Date.parse(saved)>(Date.parse(known)||0)?saved:known}),lastRxPower:reading.rxPower,lastRxPowerAt:reading.at};
  })};
}
function lastOptical(snapshot,onu={}) {
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value<0&&value>=-60;
  const at=Date.parse(snapshot?.checkedAt||''),saved=Date.parse(onu.lastRxPowerAt||'');
  if(onu.status==='online'&&snapshot?.status==='online'&&!snapshot.stale&&valid(onu.rxPower)&&Number.isFinite(at)&&at<=Date.now()+30000)return{rxPower:onu.rxPower,at:new Date(at).toISOString(),stale:false};
  if(valid(onu.lastRxPower)&&Number.isFinite(saved)&&saved<=Date.now()+30000)return{rxPower:onu.lastRxPower,at:new Date(saved).toISOString(),stale:true};
  return{rxPower:valid(onu.rxPower)?onu.rxPower:null,at:'',stale:true};
}
function normalizeSnapshot(tables, now = Date.now()) {
  const system = column(tables.system || [], OIDS.system);
  const objectId = string(system.get('2.0'));
  if (!/^\.?1\.3\.6\.1\.4\.1\.17409(?:\.|$)/.test(objectId)) throw new Error('Perangkat bukan CDATA yang didukung');
  const serials = column(tables.serial || [], OIDS.serial), statuses = column(tables.status || [], OIDS.status);
  const names = column(tables.name || [], OIDS.name), models = column(tables.model || [], OIDS.model), distances = column(tables.distance || [], OIDS.distance);
  const rx = new Map();
  for (const [suffix, row] of column(tables.rx || [], OIDS.rx)) {
    const id = suffix.split('.')[0], value = optical(row);
    if (value !== null && !rx.has(id)) rx.set(id, value);
  }
  const onus = [];
  for (const [index, row] of serials) {
    const bytes = row.type === 'Hex-STRING' ? row.value.replace(/\s/g, '') : '';
    const sn = normalizeSerial(bytes || string(row));
    if (!sn) continue;
    const state = number(statuses.get(index)), distance = number(distances.get(index)), address=position(index);
    onus.push({ id: index, serialNumber: sn, name: cli.onuDescription(string(names.get(index)),address||{}), model: string(models.get(index)),
      ...address, status: state === 1 ? 'online' : state === 2 ? 'offline' : 'unknown',
      rxPower: rx.get(index) ?? null, distance: distance > 0 ? distance : null });
  }
  const portStates = column(tables.interfaceStatus || [], OIDS.interfaceStatus);
  const ports = [...column(tables.interfaces || [], OIDS.interfaces)].map(([id, row]) => {
    const name = string(row), state = number(portStates.get(id));
    return { id, name, kind: /gpon|epon|xgpon/i.test(name) ? 'pon' : 'uplink', status: state === 1 ? 'online' : state === 2 ? 'offline' : 'unknown',
      ponKey: name.match(/(?:gpon|epon|xgpon)\s+(\d+\/\d+\/\d+)/i)?.[1] || '' };
  });
  for (const port of ports) if (port.kind === 'pon') {
    const related = onus.filter(onu => onu.ponKey === port.ponKey);
    port.total = related.length; port.online = related.filter(onu => onu.status === 'online').length; port.offline = related.filter(onu => onu.status === 'offline').length;
  }
  return applyCauses({ checkedAt: new Date(now).toISOString(), status: 'online', systemName: string(system.get('5.0')),
    description: string(system.get('1.0')), uptimeTicks: Number(system.get('3.0')?.value.match(/\(([0-9]+)\)/)?.[1] || number(system.get('3.0')) || 0),
    onus, ports, summary: { total: onus.length, online: onus.filter(onu => onu.status === 'online').length,
      offline: onus.filter(onu => onu.status === 'offline').length, unknown: onus.filter(onu => onu.status === 'unknown').length,
      highRx: onus.filter(onu => onu.status === 'online' && onu.rxPower !== null && onu.rxPower <= -26.5).length } });
}

function deviceRows(data) { return Array.isArray(data.oltDevices) ? data.oltDevices : []; }
function validateDevice(data, payload = {}, previous = {}) {
  const host = text(payload.host ?? previous.host ?? '', 64);
  if (!net.isIP(host) || /^(?:0\.|127\.|169\.254\.|22[4-9]\.|23\d\.|255\.)/.test(host) || /^(?:::|::1|ff[0-9a-f]{2}:|fe80:)/i.test(host)) throw new Error('Isi IP manajemen OLT yang valid, bukan loopback/multicast');
  const name = text(payload.name ?? previous.name ?? '', 100);
  if (!name) throw new Error('Nama OLT wajib diisi');
  const vendor=vendors.normalize(payload.vendor??previous.vendor??'cdata');
  if(!vendors.profile(vendor))throw new Error('Vendor OLT tidak didukung');
  if(previous.id&&vendors.normalize(previous.vendor)!==vendor)throw new Error('Vendor OLT yang sudah disimpan tidak dapat diganti. Tambahkan integrasi yang benar.');
  const cliProtocol=payload.cliProtocol??previous.cliProtocol??'telnet';
  if(!['telnet','ssh'].includes(cliProtocol)||(vendor==='cdata'&&cliProtocol!=='telnet'))throw new Error('Protokol CLI vendor tidak didukung');
  const nasId = text(payload.nasId ?? previous.nasId ?? '', 100);
  const nasOptions = [...(data.radiusNas || []), ...(data.monitoringTargets || [])];
  if (nasId && !nasOptions.some(nas => nas.id === nasId)) throw new Error('NAS tidak ditemukan');
  if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') throw new Error('Status aktif OLT tidak valid');
  const latitude = payload.latitude === '' || payload.latitude === null ? null : Number(payload.latitude ?? previous.latitude);
  const longitude = payload.longitude === '' || payload.longitude === null ? null : Number(payload.longitude ?? previous.longitude);
  const hasLatitude = payload.latitude !== undefined ? payload.latitude !== '' && payload.latitude !== null : previous.latitude !== undefined && previous.latitude !== null;
  const hasLongitude = payload.longitude !== undefined ? payload.longitude !== '' && payload.longitude !== null : previous.longitude !== undefined && previous.longitude !== null;
  if (hasLatitude !== hasLongitude || (hasLatitude && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)))) throw new Error('Isi pasangan koordinat yang valid');
  const community = payload.community === undefined ? '' : text(payload.community, 64);
  const communityEnc = community ? secrets.encryptSecret(data, community) : previous.communityEnc;
  if (!communityEnc) throw new Error('Community SNMP baca wajib diisi');
  if (payload.cliEnabled !== undefined && typeof payload.cliEnabled !== 'boolean') throw new Error('Status akses CLI tidak valid');
  const cliUsername = text(payload.cliUsername ?? previous.cliUsername ?? '', 64);
  const cliPassword = payload.cliPassword === undefined ? '' : text(payload.cliPassword, 128);
  const cliPasswordEnc = cliPassword ? secrets.encryptSecret(data, cliPassword) : previous.cliPasswordEnc;
  const cliEnabled = payload.cliEnabled ?? previous.cliEnabled ?? false;
  if (cliEnabled && (!cliUsername || !cliPasswordEnc)) throw new Error('Isi akun CLI untuk membaca penyebab putus dan mengelola ONU');
  const device = { ...previous, id: previous.id || crypto.randomUUID(), name, host, vendor, nasId,
    port: integer(payload.port ?? previous.port, 1, 65535, 161), communityEnc, enabled: payload.enabled ?? previous.enabled ?? true,
    cliEnabled, cliProtocol, cliUsername, cliPasswordEnc, cliPort: integer(payload.cliPort ?? previous.cliPort, 1, 65535, cliProtocol==='ssh'?22:23),
    webPort:integer(payload.webPort??previous.webPort,1,65535,80),
    latitude: hasLatitude ? latitude : null, longitude: hasLongitude ? longitude : null,
    links: previous.links || {}, createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (deviceRows(data).some(row => row.id !== device.id && row.host === host && row.port === device.port)) throw new Error('Alamat dan port OLT sudah terdaftar');
  if (!previous.id && deviceRows(data).length >= MAX_DEVICES) throw new Error('Batas awal monitoring 32 OLT');
  return device;
}
function publicDevice(device, snapshot = null, options = {}) {
  const actions=vendors.capabilities(device,snapshot);
  const simulated=process.env.MIGRATION_MODE==='1'&&/^demo-olt-\d{1,2}$/.test(device.id)&&snapshot?.simulated===true;
  return { id: device.id, name: device.name, vendor: device.vendor, nasId: device.nasId, enabled: device.enabled,
    simulated,
    ...(options.management ? { host: device.host, port: device.port, revision:device.updatedAt||'', communityConfigured: Boolean(device.communityEnc), cliEnabled: Boolean(device.cliEnabled), cliProtocol:device.cliProtocol||'telnet', webPort:device.webPort||80, cliUsername: device.cliUsername || '', cliPort: device.cliPort || 23, cliPasswordConfigured: Boolean(device.cliPasswordEnc) } : {}),
    vendorLabel:vendors.profile(device.vendor)?.label||device.vendor,driverMode:vendors.canWrite(device)?'verified':Object.values(actions).some(Boolean)?'web-managed':'read-only',inventoryAvailable:Boolean(snapshot&&Array.isArray(snapshot.onus)&&snapshot.inventoryAvailable!==false),
    onuDeleteAvailable:actions.delete,onuRebootAvailable:actions.reboot,onuRenameAvailable:actions.rename,saveConfigAvailable:actions.saveConfig,
    refreshPending: pending.has(cacheKey(device)) || refreshQueue.has(device.id),
    latitude: device.latitude, longitude: device.longitude,
    status: !device.enabled ? 'disabled' : snapshot?.status || 'checking', checkedAt: snapshot?.checkedAt || '',
    lastSuccessAt: snapshot?.lastSuccessAt || (snapshot?.status === 'online' ? snapshot.checkedAt : ''), stale: !simulated&&Boolean(snapshot?.stale || (snapshot?.checkedAt && Date.now() - Date.parse(snapshot.checkedAt) > CACHE_MS * 2)),
    error: snapshot?.error || '', systemName: snapshot?.systemName || '', description: snapshot?.description || '', uptimeTicks: snapshot?.uptimeTicks ?? null, modelLabel:snapshot?.modelLabel||'',systemLabel:telemetry.label(device,snapshot?.telemetry,snapshot?.modelLabel),
    modelSource:snapshot?.telemetry?.modelSource||(snapshot?.telemetry?.family?'web-firmware-family':''),
    resources:{cpuPercent:snapshot?.telemetry?.cpuPercent??null,ramPercent:snapshot?.telemetry?.ramPercent??null,checkedAt:snapshot?.telemetry?.checkedAt||'',stale:Boolean(snapshot?.stale||snapshot?.status&&snapshot.status!=='online'||snapshot?.telemetry?.stale||snapshot?.telemetry?.checkedAt&&Date.now()-Date.parse(snapshot.telemetry.checkedAt)>telemetry.INTERVAL_MS*2)},
    ponPorts: snapshot ? (snapshot.ports || []).filter(port => port.kind === 'pon').length : null,
    ponOverview: (snapshot?.ports || []).filter(row => row.kind === 'pon').slice(0,64),
    summary: snapshot?.summary || null, warnings: snapshot?.warnings || [] };
}
function fingerprint(device) { const fields=[device.host,device.port,device.communityEnc,device.cliEnabled,device.cliUsername,device.cliPasswordEnc,device.cliPort];if(vendors.normalize(device.vendor)!=='cdata')fields.push(device.vendor,device.cliProtocol,device.webPort,'hioso-actions-v1');return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0,24); }
function cacheKey(device) { return `fakenet-billing:olt:v2:${device.id}:${fingerprint(device)}`; }
async function snapshotFor(device) {
  if(process.env.MIGRATION_MODE==='1'&&/^demo-olt-\d{1,2}$/.test(device.id)&&device.demoSnapshot?.simulated===true&&Array.isArray(device.demoSnapshot.onus)&&device.demoSnapshot.onus.length<=128)return device.demoSnapshot;
  const key = cacheKey(device);
  if (cache.has(key)) return cache.get(key);
  if (redis.enabled()) {
    try { const raw = await redis.get(key); if (raw && raw.length <= 4 * 1024 * 1024) { const value = JSON.parse(raw); if (value && (Array.isArray(value.onus) || (value.status === 'unreachable' && value.onus === undefined && Number.isFinite(Date.parse(value.checkedAt))))){if(Array.isArray(value.onus)&&value.causeSchema!==2){const counts=new Map();for(const row of value.onus)counts.set(row.serialNumber,(counts.get(row.serialNumber)||0)+1);value.onus=value.onus.map(row=>counts.get(row.serialNumber)>1?{...row,downCause:'',causeKnown:false}:row);value.ports=Array.isArray(value.ports)?value.ports:[];applyCauses(value,preservedCauses(value.onus));value.pendingRefresh=true;}return remember(cache, key, value);} } } catch {}
  }
  return null;
}
async function executeTable(target, name, oid) {
  const address = net.isIP(target.host) === 6 ? `udp6:[${target.host}]:${target.port}` : `${target.host}:${target.port}`;
  const { stdout } = await exec('snmpbulkwalk', ['-v2c', '-c', target.community, '-t', '2', '-r', '0', '-Cr20', '-On', '-Ox', address, oid],
    { timeout: 8000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (/No Such Object/i.test(stdout)) throw new Error(`Tabel ${name} tidak tersedia`);
  return parseRows(stdout);
}
async function collect(data, device, transport = executeTable, causeTransport = cli.readCauses) {
  const target = { host: device.host, port: device.port, community: secrets.decryptSecret(data, device.communityEnc) }, tables = {}, warnings = [], started = Date.now();
  if(vendors.normalize(device.vendor)!=='cdata'){
    for(const name of ['system','interfaces','interfaceStatus']){try{tables[name]=await transport(target,name,OIDS[name]);}catch{if(name==='system')throw new Error('SNMP OLT belum merespons');warnings.push(`Data ${name} belum tersedia`);}}
    const system=column(tables.system||[],OIDS.system);if(!system.has('2.0'))throw new Error('Identitas SNMP OLT belum terverifikasi');
    let inventory;try{inventory=await vendors.readInventory(data,device,{normalizeSerial,classifyCause});}catch{inventory={available:false,rows:[],warning:'Pembacaan inventory vendor belum berhasil. Aksi tulis tetap terkunci.'};}
    if(inventory.warning)warnings.push(inventory.warning);if(device.vendor!=='hioso'||!Object.values(inventory.hiosoActions||{}).some(Boolean))warnings.push('Aksi tulis vendor yang belum terverifikasi tetap terkunci. Pemeriksaan reboot berlaku pada inventory ONU valid; tiket otomatis hanya untuk LOS dengan penyebab terverifikasi.');
    const states=column(tables.interfaceStatus||[],OIDS.interfaceStatus),onus=inventory.rows||[];
    const interfaces=[...column(tables.interfaces||[],OIDS.interfaces)].map(([id,row])=>{const value=number(states.get(id));return{id,name:string(row),status:value===1?'online':value===2?'offline':'unknown'};});
    const {ports,modelLabel,warning}=vendors.monitoringPorts(device,interfaces,inventory);if(warning)warnings.push(warning);
    for(const port of ports)if(port.kind==='pon'&&inventory.available)Object.assign(port,summarizeOnus(onus.filter(row=>row.ponKey===port.ponKey)));
    return{checkedAt:new Date().toISOString(),status:'online',inventoryAvailable:inventory.available,systemName:string(system.get('5.0')),description:string(system.get('1.0')),uptimeTicks:number(system.get('3.0')),onus,ports,modelLabel,hiosoActions:inventory.hiosoActions||{},summary:inventory.available?summarizeOnus(onus):null,causeSchema:2,warnings};
  }
  // Walk columns, never the whole enterprise MIB or individual ONU credentials.
  for (const name of ['system','interfaces','interfaceStatus','serial','status','name','model','distance','rx']) {
    if (Date.now() - started > 18000 && !['system','serial','status'].includes(name)) { warnings.push(`Data ${name} ditunda`); continue; }
    try { tables[name] = await transport(target, name, OIDS[name]); }
    catch (error) { if (['system','serial','status'].includes(name)) throw new Error('SNMP CDATA belum dapat dibaca lengkap'); warnings.push(`Data ${name} belum tersedia`); }
  }
  const result = normalizeSnapshot(tables);
  if (device.cliEnabled && result.summary.offline > 0) {
    try { applyCauses(result, parseCauseRows(await causeTransport(data, device))); }
    catch { warnings.push('Penyebab putus belum terbaca; ONU terkait masuk Other'); }
  }
  result.warnings = warnings; return result;
}
function parseCauseRows(stdout = '') {
  const causes = new Map(),positions = new Map(),serialPositions = new Map();
  for (const line of String(stdout).split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\/(\d+)\s+(\d+)\s+(\d+)\s+([A-Za-z0-9]{12}|[A-Fa-f0-9]{16})\s+\d+\s+(.+)$/);
    if (!match) continue;
    const serial = normalizeSerial(match[5]), cause = match[6].trim(),frame=Number(match[1]),slot=Number(match[2]),port=Number(match[3]),onu=Number(match[4]);
    if(frame!==0||slot>31||port<1||port>16||onu<1||onu>1024)continue;
    if (serial && cause.length <= 160 && !/^-+$|^(?:null|unknown|offline)$/i.test(cause)) {
      const key=`${frame}/${slot}/${port}:${onu}:${serial}`;
      if(positions.has(key)&&positions.get(key)!==cause)positions.set(key,null);else if(!positions.has(key))positions.set(key,cause);
      const keys=serialPositions.get(serial)||new Set();keys.add(key);serialPositions.set(serial,keys);if(keys.size===1&&positions.get(key))causes.set(serial,cause);else causes.delete(serial);
    }
    if (positions.size > MAX_ONUS) throw new Error('Tabel penyebab putus terlalu besar');
  }
  if (!/Offline\s*:\s*\d+|F\/S\s+Port\s+(?:ONT|ONU)/i.test(stdout)) throw new Error('Format status OLT belum didukung');
  causePositions.set(causes,positions);
  return causes;
}
async function onuPage(data, devices, options = {}, management = false) {
  const limit = [10,25,50,100].includes(Number(options.limit)) ? Number(options.limit) : 25;
  const candidates=devices.filter(device=>(!options.nasId||options.nasId==='all'||options.nasId===device.nasId));
  const explicit=options.oltId&&options.oltId!=='all',device=explicit?candidates.find(row=>row.id===options.oltId):candidates.length===1?candidates[0]:null;
  if(!device)return{device:null,devices:[],ports:[],summary:null,onus:[],total:0,page:1,pages:1,limit,selectionRequired:!explicit&&candidates.length>1};
  const snapshot=await snapshotFor(device),publicRow=publicDevice(device,snapshot,{management});
  const search = String(options.search || '').slice(0,100).toLowerCase();
  const raw=(snapshot?.onus||[]).filter(row=>matchesState(row,options.status)&&(!options.pon||row.ponKey===options.pon));
  // Cached state/PON filters precede enrichment; a normal page projects at most 100 ONUs.
  const filtered=search?linkedOnus(data,device,raw,snapshot).filter(row=>[row.name,row.serialNumber,row.model,row.customerName,row.customerUsername,row.fiberPointName,device.name,row.downCause].some(value=>String(value||'').toLowerCase().includes(search))):raw;
  const pages = Math.max(1,Math.ceil(filtered.length/limit));
  const page = Math.max(1,Math.min(pages,parseInt(options.page,10)||1));
  const selected=filtered.slice((page-1)*limit,page*limit),rows=search?selected:linkedOnus(data,device,selected,snapshot);
  return { device:publicRow,devices:[publicRow],ports:(snapshot?.ports||[]).map(row=>({...row,oltId:device.id,oltName:device.name})),summary:publicRow.inventoryAvailable!==false?publicRow.summary:null,onus:rows.map(row=>({...row,oltId:device.id,oltName:device.name})),total:filtered.length,page,pages,limit,selectionRequired:false };
}
async function liveSerial(data,device,onu) {
  const address=net.isIP(device.host)===6?`udp6:[${device.host}]:${device.port}`:`${device.host}:${device.port}`;
  const oid=OIDS.serial+'.'+onu.id;
  const {stdout}=await exec('snmpget',['-v2c','-c',secrets.decryptSecret(data,device.communityEnc),'-t','2','-r','0','-On','-Ox',address,oid],{timeout:3500,maxBuffer:16384});
  const row=parseRows(stdout).find(row=>row.oid===oid);return normalizeSerial(row?.type==='Hex-STRING'?row.value.replace(/\s/g,''):string(row));
}
function selectedOnu(snapshot,serial,selector={},allowMissing=false,device={vendor:'cdata'}) {
  const raw=selector.onuIndex,index=raw===undefined||raw===''?'':String(raw);
  if(index&&!actionPosition(device,index))throw new Error('Posisi ONU tidak valid');
  const matches=(snapshot?.onus||[]).filter(row=>row.serialNumber===serial&&(!index||String(row.id)===index));
  if(matches.length>1)throw new Error('SN digunakan pada beberapa PON. Buka aksi dari baris ONU yang ingin dituju.');
  const onu=matches[0]||(allowMissing&&index?{id:index,...actionPosition(device,index),serialNumber:serial}:null);if(!onu||!actionPosition(device,onu.id)||device.vendor==='hioso'&&actionPosition(device,onu.id).serialNumber!==serial)throw new Error('ONU tidak ada pada posisi yang dipilih. Segarkan data terlebih dahulu.');
  return onu;
}
async function readRemovalState(data,device,serial,selector={},transport={}){
  if(device.vendor==='hioso'){const sn=normalizeSerial(serial),snapshot=await snapshotFor(device);if(!sn)throw new Error('MAC ONU tidak valid');const target=selectedOnu(snapshot,sn,selector,true,device),result=await hioso.run(data,device,target,'inspect');return{target,state:result.state};}
  if(!vendors.canWrite(device))throw new Error('Penghapusan vendor ini masih terkunci sampai model dan aksi terverifikasi');
  const sn=normalizeSerial(serial);if(!sn)throw new Error('Serial ONU tidak valid');
  const snapshot=await snapshotFor(device),target=selectedOnu(snapshot,sn,selector,true);
  if(process.env.MIGRATION_MODE==='1'){if(snapshot?.simulated===true&&/^demo-olt-\d{1,2}$/.test(device.id))return {target,state:target.status||'unknown',simulated:true};throw new Error('Mode dev terisolasi: pembacaan ONU asli dinonaktifkan');}
  if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)throw new Error('Akses CLI OLT belum diaktifkan');
  const result=await (transport.inspect||cli.inspectOnu)(data,device,target).catch(error=>{if(error.code==='ONU_NOT_FOUND')return {absent:true};throw error;});
  return {target,state:result.absent?'missing':cli.readRunState(result.outputs?.at(-1)?.stdout)};
}
async function removeOnu(data,device,serial,payload,transport={serial:liveSerial,delete:cli.deleteOnu,inspect:cli.inspectOnu}) {
  if(device.vendor==='hioso'){
    const sn=normalizeSerial(serial);if(!sn||normalizeSerial(payload.serialNumber)!==sn||payload.confirmDelete!==true)throw new Error('Konfirmasi MAC dan persetujuan hapus ONU wajib sesuai');
    const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload,true,device),result=await hioso.run(data,device,onu,'delete'),next={...snapshot,pendingRefresh:true};
    if(result.deleteConfirmed){next.onus=(snapshot?.onus||[]).filter(row=>row.id!==onu.id);next.summary=summarizeOnus(next.onus);for(const port of next.ports||[])if(port.kind==='pon')Object.assign(port,summarizeOnus(next.onus.filter(row=>row.ponKey===port.ponKey)));}
    const key=cacheKey(device);remember(cache,key,next);if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}lastAttempt.delete(key);
    return{serialNumber:sn,onuIndex:onu.id,ponKey:onu.ponKey,onuId:onu.onuId,oltId:device.id,confirmed:result.deleteConfirmed,alreadyAbsent:result.alreadyAbsent===true,message:result.deleteConfirmed?'ONU HIOSO terverifikasi sudah dihapus. Data billing tetap tersimpan.':'Hapus ONU belum terverifikasi. Periksa ulang tanpa mengirim perintah berulang.'};
  }
  if(!vendors.canWrite(device))throw new Error('Penghapusan vendor ini masih terkunci sampai aksi terverifikasi');
  transport={serial:liveSerial,delete:cli.deleteOnu,inspect:cli.inspectOnu,...transport};
  const sn=normalizeSerial(serial);
  if(!sn||normalizeSerial(payload.serialNumber)!==sn||payload.confirmDelete!==true)throw new Error('Konfirmasi serial dan persetujuan hapus ONU wajib sesuai');
  if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)throw new Error('Akses pengelolaan ONU belum diaktifkan');
  const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload,transport.allowMissing===true);
  const live=await transport.serial(data,device,onu);let result;
  if(live!==sn){
    if(!live&&transport.inspect)try{await transport.inspect(data,device,onu);}catch(error){if(error.code==='ONU_NOT_FOUND')result={deleteConfirmed:true,alreadyAbsent:true};else throw error;}
    if(!result)throw new Error('Serial ONU di OLT berubah atau tidak cocok. Penghapusan dibatalkan.');
  }else result=await transport.delete(data,device,{...onu,...(transport.requireOffline===true?{requireOffline:true}:{})});
  const key=cacheKey(device),next={...snapshot,pendingRefresh:true};
  if(result.deleteConfirmed){next.onus=(snapshot?.onus||[]).filter(row=>String(row.id)!==String(onu.id));applyCauses(next,preservedCauses(next.onus));}
  remember(cache,key,next);if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}
  lastAttempt.delete(key);
  return {serialNumber:sn,onuIndex:String(onu.id),ponKey:onu.ponKey,onuId:onu.onuId,oltId:device.id,confirmed:Boolean(result.deleteConfirmed),alreadyAbsent:result.alreadyAbsent===true,message:result.alreadyAbsent?'ONU sudah tidak terdaftar di posisi ini. Daftar billing telah diperbarui.':result.deleteConfirmed?'ONU telah dihapus dari OLT. Data billing tetap tersimpan.':'Perintah hapus terkirim. Menunggu pembacaan ulang OLT; jangan mengulang sebelum status diperiksa.'};
}
async function rebootOnu(data,device,serial,payload,transport={serial:liveSerial,reboot:cli.rebootOnu}) {
  if(device.vendor==='hioso'){
    const sn=normalizeSerial(serial);if(!sn||normalizeSerial(payload.serialNumber)!==sn||payload.confirmReboot!==true)throw new Error('Konfirmasi MAC dan persetujuan reboot ONU wajib sesuai');
    const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload,false,device);await hioso.run(data,device,onu,'reboot');const key=cacheKey(device),next={...snapshot,pendingRefresh:true};remember(cache,key,next);if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}lastAttempt.delete(key);
    return{serialNumber:sn,oltId:device.id,submitted:true,confirmed:false,message:'Perintah reboot dikirim melalui web HIOSO. Tunggu perangkat pulih sebelum mengulang.'};
  }
  if(!vendors.canWrite(device))throw new Error('Reboot vendor ini masih terkunci sampai aksi terverifikasi');
  const sn=normalizeSerial(serial);
  if(!sn||normalizeSerial(payload.serialNumber)!==sn||payload.confirmReboot!==true)throw new Error('Konfirmasi serial dan persetujuan reboot ONU wajib sesuai');
  if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)throw new Error('Akses pengelolaan ONU belum diaktifkan');
  const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload);
  if(await transport.serial(data,device,onu)!==sn)throw new Error('Serial ONU di OLT berubah atau tidak cocok. Reboot dibatalkan.');
  await transport.reboot(data,device,onu);
  const key=cacheKey(device),next={...snapshot,pendingRefresh:true};remember(cache,key,next);
  if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}
  lastAttempt.delete(key);
  return {serialNumber:sn,oltId:device.id,message:'Perintah reboot ONU berhasil dikirim. Sambungan perangkat akan terputus sementara.'};
}
async function readOnuDescription(data,device,serial,selector={},transport={inspect:cli.inspectOnu}) {
  if(device.vendor==='hioso'){const sn=normalizeSerial(serial);if(!sn)throw new Error('MAC ONU tidak valid');const onu=selectedOnu(await snapshotFor(device),sn,selector,false,device),result=await hioso.run(data,device,onu,'inspect');if(result.state==='missing')throw new Error('ONU tidak lagi terdaftar');return{serialNumber:sn,onuIndex:onu.id,description:result.description,maxLength:30};}
  if(!vendors.canWrite(device))throw new Error('Edit description vendor ini masih terkunci sampai aksi terverifikasi');
  const sn=normalizeSerial(serial);if(!sn)throw new Error('Serial ONU tidak valid');
  const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,selector);
  if(process.env.MIGRATION_MODE==='1'){
    if(/^demo-olt-\d{1,2}$/.test(device.id)&&device.demoSnapshot?.simulated===true)return {serialNumber:sn,onuIndex:String(onu.id),description:cli.onuDescription(onu.name,onu),simulated:true};
    throw new Error('Mode dev terisolasi: pembacaan ONU asli dinonaktifkan');
  }
  if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)throw new Error('Akses pengelolaan ONU belum diaktifkan');
  const result=await transport.inspect(data,device,onu),description=cli.readDescription(result.outputs?.at(-1)?.stdout);
  if(description===null||description.length>128)throw new Error('Description asli ONU belum terbaca. Coba kembali sebelum mengubah nama.');
  return {serialNumber:sn,onuIndex:String(onu.id),description};
}
async function renameOnu(data,device,serial,payload,transport={serial:liveSerial,rename:cli.renameOnu}) {
  if(device.vendor==='hioso'){
    const sn=normalizeSerial(serial);if(!sn||normalizeSerial(payload.serialNumber)!==sn)throw new Error('Konfirmasi MAC ONU wajib sesuai');const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload,false,device),result=await hioso.run(data,device,onu,'rename',payload),next={...snapshot,onus:snapshot.onus.map(row=>row.id===onu.id?{...row,name:result.description}:row)},key=cacheKey(device);
    remember(cache,key,next);if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}return{serialNumber:sn,description:result.description,confirmed:true,message:'Nama ONU HIOSO diperbarui dan hasilnya terverifikasi.'};
  }
  if(!vendors.canWrite(device))throw new Error('Edit description vendor ini masih terkunci sampai aksi terverifikasi');
  const sn=normalizeSerial(serial),description=cli.description(payload.description);
  if(!sn||normalizeSerial(payload.serialNumber)!==sn)throw new Error('Serial ONU wajib sesuai');
  if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)throw new Error('Akses pengelolaan ONU belum diaktifkan');
  const snapshot=await snapshotFor(device),onu=selectedOnu(snapshot,sn,payload);
  if(typeof payload.previousDescription!=='string'||payload.previousDescription.length>128)throw new Error('Description sebelumnya wajib terbaca. Buka ulang sebelum menyimpan.');
  // The native CLI field is authoritative; SNMP names may be shortened by firmware.
  const previousDescription=payload.previousDescription;
  if(await transport.serial(data,device,onu)!==sn)throw new Error('Serial ONU berubah. Perubahan nama dibatalkan.');
  const result=await transport.rename(data,device,{...onu,description,previousDescription});
  if(!result.descriptionConfirmed)throw new Error('Perintah terkirim tetapi nama belum terverifikasi. Segarkan data sebelum mengulang.');
  const next={...snapshot,onus:snapshot.onus.map(row=>row===onu?{...row,name:description}:row)};
  const key=cacheKey(device);remember(cache,key,next);if(redis.enabled())try{await redis.set(key,JSON.stringify(next),86400);}catch{}
  return {serialNumber:sn,description,confirmed:true,message:'Description ONU diperbarui dan terverifikasi di OLT.'};
}
async function poll(data, device, transport) {
  const key = cacheKey(device);
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 2) return snapshotFor(device);
  if (!device.enabled) return snapshotFor(device);
  const promise = (async () => {
    remember(lastAttempt, key, Date.now());
    const previous = await snapshotFor(device); let value;
    try { value = preserveLastOnline(await collect(data, device, transport),previous);if(value.inventoryAvailable===false&&previous?.onus?.length)value={...value,onus:previous.onus,summary:previous.summary,stale:true,lastSuccessAt:previous.lastSuccessAt||(previous.inventoryAvailable!==false?previous.checkedAt:'')};if(!transport&&process.env.MIGRATION_MODE!=='1')value.telemetry=await telemetry.read(data,device,previous?.telemetry); }
    catch { value = { ...(previous || {}), pendingRefresh:false, status: 'unreachable', stale: Boolean(previous?.onus), checkedAt: new Date().toISOString(),
      lastSuccessAt: previous?.lastSuccessAt || (previous?.status === 'online' ? previous.checkedAt : ''), error: 'SNMP tidak merespons lengkap. Periksa daya, jaringan, dan community.' }; }
    remember(cache, key, value);
    if (redis.enabled()) { try { await redis.set(key, JSON.stringify(value), 86400); } catch {} }
    return value;
  })().finally(() => pending.delete(key));
  pending.set(key, promise); return promise;
}
async function pollNext(data) {
  if (pending.size) return { skipped: true };
  for(const [id,request] of refreshQueue){const device=deviceRows(data).find(row=>row.id===id);refreshQueue.delete(id);if(!device?.enabled||cacheKey(device)!==request.key)continue;await poll(data,device);return{id:device.id,manual:true};}
  const candidates = [];
  for (const device of deviceRows(data).filter(row => row.enabled)) {
    const key = cacheKey(device), snapshot = await snapshotFor(device), tried = lastAttempt.get(key) || Date.parse(snapshot?.checkedAt || '') || 0;
    if (snapshot?.pendingRefresh || Date.now() - tried >= CACHE_MS) candidates.push({ device, tried:snapshot?.pendingRefresh?0:tried });
  }
  candidates.sort((a,b) => a.tried - b.tried);
  if (!candidates.length) return { skipped: true };
  await poll(data, candidates[0].device); return { id: candidates[0].device.id };
}
function requestRefresh(data, device) {
  const key = cacheKey(device), now = Date.now();
  if (!device.enabled || pending.has(key) || pending.size >= 2 || now - (refreshTimes.get(key) || 0) < 30000) return false;
  remember(refreshTimes, key, now);refreshQueue.delete(device.id); poll(data, device).catch(() => {}); return true;
}
function requestRefreshAll(data,devices) {
  if(process.env.MIGRATION_MODE==='1')throw new Error('Mode dev terisolasi: pembacaan OLT asli dinonaktifkan');
  const now=Date.now();let queued=0,skipped=0;for(const device of devices){const key=cacheKey(device);if(!device.enabled||pending.has(key)||refreshQueue.has(device.id)||now-(refreshTimes.get(key)||0)<30000||refreshQueue.size>=MAX_DEVICES){skipped++;continue;}remember(refreshTimes,key,now);refreshQueue.set(device.id,{key});queued++;}return {queued,skipped,pending:refreshQueue.size};
}
async function testConnection(data,device,kind,transport={}) {
  if(process.env.MIGRATION_MODE==='1')throw new Error('Mode dev terisolasi: tes perangkat asli dinonaktifkan');
  if(!['snmp','telnet'].includes(kind))throw new Error('Jenis tes tidak valid');
  if(kind==='telnet'&&(!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc))throw new Error('Isi akun CLI dan aktifkan akses CLI untuk mengetes Telnet');
  const key=cacheKey(device)+':'+kind,now=Date.now();if(diagnosticPending.has(key)||diagnosticPending.size>=2||now-(diagnosticTimes.get(key)||0)<5000){const error=new Error('Tes koneksi sedang berjalan atau baru dijalankan. Coba lagi beberapa detik.');error.status=429;throw error;}
  diagnosticPending.add(key);remember(diagnosticTimes,key,now);const started=Date.now();
  try{
    if(kind==='telnet')await (transport.telnet||(vendors.normalize(device.vendor)==='cdata'?cli.testConnection:vendors.testConnection))(data,device);
    else{const address=net.isIP(device.host)===6?`udp6:[${device.host}]:${device.port}`:`${device.host}:${device.port}`,community=secrets.decryptSecret(data,device.communityEnc);
      const {stdout}=await (transport.exec||exec)('snmpget',['-v2c','-c',community,'-t','2','-r','0','-On',address,'1.3.6.1.2.1.1.2.0','1.3.6.1.2.1.1.3.0'],{timeout:4000,maxBuffer:16384,windowsHide:true});const rows=parseRows(stdout);if(!rows.some(row=>row.oid==='1.3.6.1.2.1.1.2.0'))throw new Error('SNMP tidak mengembalikan identitas sistem');
    }
    return{ok:true,kind,elapsedMs:Date.now()-started,message:kind==='snmp'?'SNMP v2c merespons. Community dan jalur pembacaan terverifikasi.':'Telnet berhasil login dan membaca versi OLT.'};
  }catch(error){return{ok:false,kind,elapsedMs:Date.now()-started,message:kind==='snmp'?'SNMP belum merespons. Periksa layanan SNMP di OLT, UDP 161/port terpilih, community dan izin IP server billing.':/ditolak/.test(error.message)?'Login Telnet ditolak. Periksa username/password CLI.':'Telnet belum berhasil. Periksa layanan, port, akun CLI dan izin akses OLT.'};}
  finally{diagnosticPending.delete(key);}
}
async function saveConfig(data,device,payload,transport) {
  if(!vendors.canWrite(device)&&device.vendor!=='hioso')throw new Error('Save Config vendor ini masih terkunci sampai model dan aksi terverifikasi');
  if(process.env.MIGRATION_MODE==='1')throw new Error('Mode dev terisolasi: Save Config OLT asli dinonaktifkan');
  if(payload.confirmSave!==true||payload.confirmId!==device.id||String(payload.confirmName||'').trim()!==device.name)throw new Error('Konfirmasi nama OLT dan persetujuan Save Config wajib sesuai');
  if(!payload.revision||payload.revision!==device.updatedAt){const error=new Error('Pengaturan OLT berubah. Buka ulang sebelum menyimpan konfigurasi.');error.status=409;throw error;}
  if(!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc)throw new Error('Aktifkan monitoring dan akses CLI OLT terlebih dahulu');
  const key=[device.id,device.host,device.cliPort].join(':'),now=Date.now();if(now-(saveTimes.get(key)||0)<60000){const error=new Error('Save Config baru diproses. Tunggu setidaknya satu menit dan periksa hasil sebelumnya.');error.status=429;throw error;}remember(saveTimes,key,now);
  try{const result=await (transport||(device.vendor==='hioso'?hioso.saveConfig:cli.saveConfig))(data,device);return{confirmed:result.saveConfirmed===true,message:result.saveConfirmed?'Konfigurasi OLT berhasil disimpan ke penyimpanan permanen.':'Perintah Save Config sudah diproses, tetapi keberhasilannya belum terkonfirmasi. Periksa di OLT sebelum mengulang.'};}
  catch{return{confirmed:false,message:'Hasil Save Config belum dapat dipastikan. Periksa status di OLT sebelum mencoba lagi.'};}
}
function visibleDevices(data, user = {}) {
  const locks = [...(Array.isArray(user.lockedNasIds) ? user.lockedNasIds : []), user.lockedNasId].filter(Boolean);
  if (!locks.length || locks.includes('all') || ['admin','owner','noc','secretary'].includes(user.role)) return deviceRows(data);
  const aliases = new Set(locks);
  for (const nas of [...(data.radiusNas || []), ...(data.monitoringTargets || [])]) if ([nas.id,nas.monitoringTargetId,nas.monitoringId].some(id => aliases.has(id))) {
    for (const key of [nas.id,nas.monitoringTargetId,nas.monitoringId]) if (key) aliases.add(key);
  }
  return deviceRows(data).filter(device => device.nasId && aliases.has(device.nasId));
}
function mappingNodes(data, devices = deviceRows(data)) {
  return devices.filter(row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)).map(row => ({ id: row.id, type: 'olt', code: 'OLT', name: row.name,
    area: '', status: row.enabled ? 'active' : 'inactive', tone: row.enabled ? 'active' : 'inactive', latitude: row.latitude, longitude: row.longitude,
    note:vendors.profile(row.vendor)?.label||row.vendor, capacityPorts: null, availablePorts: null }));
}
function linkCustomer(data, device, serial, payload = {}) {
  const sn = normalizeSerial(serial); if (!sn) throw new Error('Serial ONU tidak valid');
  const customerId = text(payload.customerId || '', 100), fiberPointId = text(payload.fiberPointId || '', 100);
  if (customerId && !(data.customers || []).some(row => row.id === customerId)) throw new Error('Pelanggan tidak ditemukan');
  if (fiberPointId && !(data.fiberPoints || []).some(row => row.id === fiberPointId)) throw new Error('ODP tidak ditemukan');
  const next = { ...device, links: { ...device.links }, updatedAt: new Date().toISOString() };
  if (!customerId && !fiberPointId) delete next.links[sn];
  else next.links[sn] = { customerId, fiberPointId };
  return next;
}
function linkedOnus(data, device, rows, snapshot=null) {
  const customers = new Map((data.customers || []).map(row => [row.id,row])), points = new Map((data.fiberPoints || []).map(row => [row.id,row]));
  const identities=networkIdentity.directory(data);
  const maintenance=plannedReboot.index(data);
  return rows.map(onu => {
    const link = device.links?.[onu.serialNumber] || {};
    const automatic=autoIdentity.customerFor(data,device,onu);
    const modem=autoIdentity.modemFor(data,device,onu);
    let customer=link.customerId&&!autoIdentity.manualConflict(data,device,onu)?customers.get(link.customerId):automatic?.customer;
    const user=customer&&identities.userForCustomer(customer);
    if(customer&&!identities.compatible(user||customer,{nasId:device.nasId}))customer=null;
    const point = points.get(link.fiberPointId||customer?.fiberPointId||customer?.odpId||customer?.distributionPointId||customer?.distribution_point_id||customer?.odp);
    const reboot=maintenance.size?plannedReboot.forOnu(data,device,onu,{index:maintenance}):null;
    return { ...onu, ...(reboot?{plannedRebootUntil:reboot.until}:{}), name:cli.onuDescription(onu.name,onu), lastOnlineAt:lastOnlineAt(snapshot,onu), customerId: customer?.id || '', customerName: customer?.name || '', customerUsername: customer?(user?.username||customer.username||''):'',address:customer?.address||require('./network-address').addressFromTags(data,modem),
      fiberPointId: point?.id || '', fiberPointName: point ? [point.code, point.name].filter(Boolean).join(' - ') : '' };
  });
}
const TICKET_STATUSES = Object.freeze(['new','assigned','working','resolved']);
const TICKET_SCOPE_LABELS=Object.freeze({onu:'ONU',pon:'PON / Area ODC',odp:'ODP',odc:'ODC',olt:'OLT'});
function isConfirmedLos(onu){return !onu.plannedReboot&&onu.status==='offline'&&onu.condition==='los'&&onu.causeKnown===true&&classifyCause(onu.downCause)==='los';}
function isRebootCandidate(onu){return !onu.plannedReboot&&onu.status==='offline'&&onu.condition!=='dying-gasp'&&classifyCause(onu.downCause)!=='dying-gasp';}
function incidentKey(ticket) {
  const serial=normalizeSerial(ticket.serialNumber);
  if(serial)return `${ticket.oltId}:onu:${serial}`;
  if(ticket.scope==='odp'&&ticket.fiberPointId)return `${ticket.oltId}:odp:${ticket.fiberPointId}`;
  return ticket.pon?`${ticket.oltId}:pon:${ticket.pon}`:'';
}
function losSubjects(data,device,snapshot,seen,activeByKey,observedByKey,covered=new Set()) {
  const groups=new Map(),consumed=new Set(),subjects=[],recovery=require('./ticket-recovery');
  const needsGroups=[...seen.values()].some(isConfirmedLos)||[...activeByKey.values(),...observedByKey.values()].some(ticket=>ticket.oltId===device.id&&recovery.grouped(ticket));
  const topology=needsGroups?recovery.topology(data,device,[...seen.values()]):[];
  const points=new Map((data.fiberPoints||[]).map(point=>[point.id,point]));
  if(needsGroups)for(const onu of seen.values())if(onu.ponKey){const key='pon:'+onu.ponKey;if(!groups.has(key))groups.set(key,{scope:'pon',pon:onu.ponKey,members:[]});groups.get(key).members.push(onu);}
  const bySerial=new Map(topology.map(row=>[row.serialNumber,row]));
  for(const onu of seen.values()){const point=points.get(bySerial.get(onu.serialNumber)?.odp);if(point){const key='odp:'+point.id;if(!groups.has(key))groups.set(key,{scope:'odp',fiberPointId:point.id,fiberPointName:[point.code,point.name].filter(Boolean).join(' - '),members:[]});groups.get(key).members.push(onu);}}
  for(const group of groups.values()) {
    const key=incidentKey({oltId:device.id,...group}),previous=observedByKey.get(key),active=activeByKey.get(key),tracked=active||previous;
    const members=group.members.filter(row=>!consumed.has(row.serialNumber)),lost=members.filter(isConfirmedLos);
    const ponDown=group.scope==='pon'&&(snapshot.ports||[]).some(row=>row.kind==='pon'&&row.ponKey===group.pon&&row.status==='offline');
    const qualifies=(lost.length>=(group.scope==='pon'?3:2)&&lost.length*2>=members.length)||(ponDown&&lost.length>0);
    const ongoing=Boolean(active||previous?.losDetection?.state==='los');
    if(!qualifies&&!ongoing)continue;
    if(!ongoing&&lost.some(row=>covered.has(row.serialNumber)||activeByKey.has(incidentKey({oltId:device.id,serialNumber:row.serialNumber}))))continue;
    const previousSerials=tracked?.affectedSerialNumbers||[],affectedSerialNumbers=[...new Set([...previousSerials,...lost.map(row=>row.serialNumber)])].sort().slice(0,1024);
    const measured=recovery.measure({...tracked,scope:group.scope,fiberPointId:group.fiberPointId,pon:group.pon||tracked?.pon||''},seen,group.members.map(row=>bySerial.get(row.serialNumber))),recovered=measured.ready;
    const pon=group.pon||([...new Set(members.map(row=>row.ponKey))].length===1?members[0]?.ponKey:'')||'';
    subjects.push({key,scope:group.scope,serialNumber:'',pon,los:!recovered&&lost.length>0,recovered,recovery:recovery.publicResult(measured),recoveryTargets:measured.targets||[],affectedSerialNumbers,affectedCount:lost.length,fiberPointId:group.fiberPointId||'',fiberPointName:group.fiberPointName||'',title:group.scope==='pon'?`LOS PON ${pon} - Area ODC`:`LOS ODP ${group.fiberPointName||group.fiberPointId}`});
    if(lost.length||ongoing)for(const row of members)consumed.add(row.serialNumber);
  }
  for(const onu of seen.values())if(!consumed.has(onu.serialNumber)||onu.status==='online'){
    if(covered.has(onu.serialNumber))continue;
    const key=incidentKey({oltId:device.id,serialNumber:onu.serialNumber}),prior=activeByKey.get(key)||observedByKey.get(key),los=isConfirmedLos(onu);
    if(!los&&!(onu.status==='online'&&prior?.losDetection?.state==='los'))continue;
    subjects.push({key,scope:'onu',serialNumber:onu.serialNumber,onuIndex:String(onu.id||''),optical:lastOptical(snapshot,onu),pon:onu.ponKey||'',los,recovered:onu.status==='online',affectedSerialNumbers:[onu.serialNumber],affectedCount:los?1:0,title:`LOS - ${onu.name||onu.serialNumber}`,onuName:onu.name});
  }
  return subjects;
}
function losTicketPlan(data, observations, options = {}) {
  const now = options.now ?? Date.now(), changes = [], activeByOnu = new Map(), observedByOnu = new Map();
  const confirmation = losConfirmation.prepare(data, now);
  const incidents = ticketIncidents.observationGuard(data, now), pendingCustomers = new Map();
  let available = Math.max(0,500-(data.oltTickets || []).filter(row=>row.status!=='resolved').length), creates = 0, deferred = 0;
  for (const ticket of data.oltTickets || []) {
    const key=incidentKey(ticket);if(!key)continue;
    if(ticket.status!=='resolved'&&!activeByOnu.has(key))activeByOnu.set(key,ticket);
    if(ticket.losDetection&&(!observedByOnu.has(key)||String(ticket.losDetection.observedAt)>String(observedByOnu.get(key).losDetection.observedAt)))observedByOnu.set(key,ticket);
  }
  for(const observation of observations) {
    const device=deviceRows(data).find(row=>row.id===observation.deviceId),snapshot=observation.snapshot;
    if(device&&!vendors.profile(device.vendor))continue;
    const simulated=options.allowSimulated===true&&/^demo-olt-\d{1,2}$/.test(device?.id||'')&&snapshot?.simulated===true;
    const checked=Date.parse(snapshot?.checkedAt||'');
    if(!device?.enabled||device.updatedAt!==observation.deviceUpdatedAt||snapshot?.status!=='online'||snapshot.stale||snapshot.pendingRefresh||snapshot.inventoryAvailable===false||!Number.isFinite(checked)||checked>now+30000||(!simulated&&now-checked>CACHE_MS*2)||(!simulated&&snapshot.simulated))continue;
    const seen=new Map(),duplicates=new Set(),maintenance=plannedReboot.index(data,now);
    for(const onu of (snapshot.onus||[]).slice(0,MAX_ONUS)){const serial=normalizeSerial(onu.serialNumber);if(!serial)continue;if(seen.has(serial))duplicates.add(serial);else{const reboot=maintenance.size&&plannedReboot.forOnu(data,device,onu,{now,checkedAt:snapshot.checkedAt,index:maintenance});seen.set(serial,reboot?{...onu,plannedReboot:true}:onu);}}
    for(const serial of duplicates)seen.delete(serial);
    confirmation.observe(device,seen,snapshot.checkedAt,isRebootCandidate,isConfirmedLos);
    const covered=incidents.cover(device,seen,snapshot.checkedAt,onu=>isConfirmedLos(onu)&&confirmation.confirmed(device,onu,snapshot.checkedAt));
    for(const subject of losSubjects(data,device,snapshot,seen,activeByOnu,observedByOnu,covered)) {
      const {key,los,recovered}=subject,previous=observedByOnu.get(key),detection=previous?.losDetection;
      if(!los&&!recovered)continue;
      if(detection&&Date.parse(detection.observedAt)>=checked)continue;
      if(!los) {
        const progressChanged=subject.recovery&&JSON.stringify(previous?.recovery)!==JSON.stringify(subject.recovery);
        if(detection&&(detection.state==='los'||previous.source==='olt-los'&&previous.status!=='resolved'&&(!subject.recovery||progressChanged)))changes.push({kind:'observe',id:previous.id,patch:{affectedCount:subject.recovery?.remainingLos||0,...(subject.recovery?{recovery:subject.recovery}:{})},losDetection:{...detection,state:'online',observedAt:snapshot.checkedAt,recoveredAt:detection.recoveredAt||snapshot.checkedAt}});
        continue;
      }
      if(detection?.state==='los'){
        if(previous.scope!=='onu'&&subject.scope!=='onu'&&(previous.affectedCount!==subject.affectedCount||JSON.stringify(previous.affectedSerialNumbers)!==JSON.stringify(subject.affectedSerialNumbers)||JSON.stringify(previous.recovery)!==JSON.stringify(subject.recovery)))changes.push({kind:'observe',id:previous.id,patch:{affectedCount:subject.affectedCount,affectedSerialNumbers:subject.affectedSerialNumbers,...(subject.recovery?{recovery:subject.recovery}:{})},losDetection:{...detection,observedAt:snapshot.checkedAt}});
        continue;
      }
      const active=activeByOnu.get(key),nextDetection={state:'los',firstDetectedAt:active?.losDetection?.firstDetectedAt||snapshot.checkedAt,lastLosAt:snapshot.checkedAt,observedAt:snapshot.checkedAt,recoveredAt:'',occurrences:(active?.losDetection?.occurrences||0)+1};
      if(active){changes.push({kind:'observe',id:active.id,patch:active.source==='olt-los'?{affectedCount:subject.affectedCount,affectedSerialNumbers:subject.affectedSerialNumbers,...(subject.recovery?{recovery:subject.recovery}:{})}:{},losDetection:nextDetection});continue;}
      const currentLos=subject.affectedSerialNumbers.map(serial=>seen.get(serial)).filter(row=>row&&isConfirmedLos(row));
      if(!currentLos.length||!currentLos.every(onu=>confirmation.confirmed(device,onu,snapshot.checkedAt)))continue;
      if(!available)continue;
      if(creates>=50){deferred++;continue;}
      const link=device.links?.[subject.serialNumber]||{},customer=subject.serialNumber?ticketIncidents.owner(data,device,{serialNumber:subject.serialNumber,id:subject.onuIndex},now).customer:null;
      if(customer&&pendingCustomers.has(customer.id))continue;
      available--;creates++;
      const opticalCandidates=subject.serialNumber?[]:subject.affectedSerialNumbers.map(sn=>seen.get(sn)).filter(onu=>onu&&isConfirmedLos(onu)).map(onu=>({serialNumber:onu.serialNumber,onuIndex:String(onu.id),pon:onu.ponKey,optical:lastOptical(snapshot,onu)}));
      changes.push({kind:'create',payload:{oltId:device.id,serialNumber:subject.serialNumber,pon:subject.pon,title:subject.title.slice(0,160),description:'',assignedTo:'',status:'new',scope:subject.scope,fiberPointId:subject.fiberPointId||''},scope:subject.scope,recovery:subject.recovery,recoveryTargets:subject.recoveryTargets,onuIndex:subject.onuIndex||'',optical:subject.optical,opticalCandidates,affectedCount:subject.affectedCount,affectedSerialNumbers:subject.affectedSerialNumbers,losDetection:nextDetection,onuName:String(subject.onuName||'').slice(0,160),customerId:customer?.id||'',customerName:customer?.name||'',fiberPointId:subject.fiberPointId||link.fiberPointId||'',fiberPointName:subject.fiberPointName||'',simulated});
      if(customer)pendingCustomers.set(customer.id,changes.at(-1));
    }
  }
  const confirmedState=confirmation.result();
  return {changes:[...incidents.changes(),...changes],creates,deferred,confirmationRows:confirmedState.rows,confirmationChanged:confirmedState.changed};
}
function applyLosTicketPlan(data, plan, now = Date.now()) {
  if(plan.confirmationChanged)data.oltLosObservations=plan.confirmationRows;
  if(!plan.changes.length)return {changed:plan.confirmationChanged===true,created:[],resolved:[],observed:0};
  const rows=[...(data.oltTickets||[])],byId=new Map(rows.map((row,index)=>[row.id,index])),created=[],resolved=[];let observed=0;
  for(const change of plan.changes) {
    if(change.kind==='incident') {
      const index=byId.get(change.id);if(index===undefined)continue;
      rows[index]={...rows[index],incidentDevices:change.records,updatedAt:new Date(now).toISOString()};observed++;
      for(const note of change.events)rows[index].history=ticketHistory(rows[index],{id:'system-olt',name:'Sistem OLT'},'network-incident',note,rows[index].status,now);
    } else if(change.kind==='observe') {
      const index=byId.get(change.id);if(index===undefined)continue;
      const becameReady=change.patch?.recovery?.ready===true&&rows[index].recovery?.ready!==true;
      rows[index]={...rows[index],...change.patch,losDetection:change.losDetection,updatedAt:new Date(now).toISOString()};observed++;
      if(becameReady&&rows[index].status!=='resolved')rows[index].history=ticketHistory(rows[index],{id:'system-olt',name:'Sistem OLT'},'recovery-ready','Target pemulihan jaringan tercapai. Menunggu konfirmasi selesai oleh penanggung jawab/tim.',rows[index].status,now);
      if(rows[index].source==='olt-los'&&rows[index].status!=='resolved'&&change.losDetection.state==='online'&&!rows[index].incidentDevices?.some(row=>row.state==='los')&&!require('./ticket-recovery').grouped(rows[index])){
        rows[index]={...rows[index],status:'resolved',resolvedAt:new Date(now).toISOString(),updatedBy:'system-olt',autoResolved:true,
          history:ticketHistory(rows[index],{id:'system-olt',name:'Sistem OLT'},'recovered',rows[index].recovery?`Target pemulihan ${rows[index].recovery.threshold}% tercapai: ${rows[index].recovery.online}/${rows[index].recovery.eligible} ONU online; ${rows[index].recovery.poweredOff} modem kehilangan daya, ${rows[index].recovery.remainingLos} sisa LOS.`:'ONU terdampak terkonfirmasi online kembali','resolved',now)};
        resolved.push(rows[index]);
      }
    } else {
      const ticket={...saveTicket({...data,oltTickets:rows},change.payload,{id:'system-olt'}),source:'olt-los',scope:change.scope,onuIndex:change.onuIndex||'',...(change.optical?.at?{oltOptical:{...change.optical,oltId:change.payload.oltId,serialNumber:change.payload.serialNumber,onuIndex:change.onuIndex}}:{}),affectedCount:change.affectedCount,affectedSerialNumbers:change.affectedSerialNumbers,losDetection:change.losDetection,onuName:change.onuName,customerId:change.customerId,customerName:change.customerName,fiberPointId:change.fiberPointId,fiberPointName:change.fiberPointName,...(change.simulated?{simulated:true}:{})};
      if(change.recovery){ticket.recovery=change.recovery;ticket.recoveryTargets=change.recoveryTargets;}
      Object.assign(ticket,require('./ticket-network').captureOptical(data,ticket,change.opticalCandidates,now));
      if(ticket.scope==='onu'){
        const parents=rows.filter(row=>row.source==='olt-los'&&row.status==='resolved'&&row.oltId===ticket.oltId&&row.pon===ticket.pon&&row.recovery?.residualSerialNumbers?.includes(ticket.serialNumber)&&now-Date.parse(row.resolvedAt)>=0&&now-Date.parse(row.resolvedAt)<86400000);
        if(parents.length===1){const parent=parents[0],team=require('./ticket-team'),allowed=id=>{const user=(data.users||[]).find(row=>row.id===id);return user&&team.canHandle(parent,user)&&require('./service-tickets').visible(data,user,ticket);};ticket.parentTicketId=parent.id;if(allowed(parent.assignedTo)){ticket.assignedTo=parent.assignedTo;ticket.companionIds=team.companionIds(parent).filter(allowed);ticket.status='assigned';}ticket.history=ticketHistory(ticket,{id:'system-olt',name:'Sistem OLT'},'followup','Pemeriksaan lanjutan setelah perbaikan gangguan kelompok '+require('./ticket-reference').number(parent),ticket.status,now);}
      }
      rows.push(ticket);created.push(ticket);
    }
  }
  for(let index=0;index<rows.length;index++){
    const ticket=rows[index];
    if(ticket.source==='olt-los'&&ticket.scope==='onu'&&ticket.status!=='resolved'&&ticket.losDetection?.state==='online'&&ticket.incidentDevices?.length&&ticket.incidentDevices.every(row=>row.state==='online')){
      rows[index]={...ticket,status:'resolved',resolvedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),updatedBy:'system-olt',autoResolved:true,
        history:ticketHistory(ticket,{id:'system-olt',name:'Sistem OLT'},'recovered','Seluruh modem pada penanganan gangguan terkonfirmasi online kembali','resolved',now)};
      resolved.push(rows[index]);observed++;
    }
  }
  data.oltTickets=pruneTickets(rows);return {changed:Boolean(created.length||observed),created,resolved,observed};
}
function ticketMessage(data, ticket) {
  const device = deviceRows(data).find(row => row.id === ticket.oltId);
  return [`*Tiket ${ticket.number}*`, ticket.title, `OLT: ${device?.name || '-'}`, ticket.pon ? `PON: ${ticket.pon}` : '',
    ticket.serialNumber ? `ONU: ${ticket.serialNumber}` : '', `Status: ${ticket.status}`, ticket.description || ''].filter(Boolean).join('\n');
}
function saveTicket(data, payload, actor, previous = {}) {
  require('./ticket-team').requireStatusChange(previous,payload,actor);
  if(previous.source==='olt-los'&&((payload.oltId!==undefined&&payload.oltId!==previous.oltId)||(payload.pon!==undefined&&payload.pon!==previous.pon)||(payload.serialNumber!==undefined&&(payload.serialNumber?normalizeSerial(payload.serialNumber):'')!==previous.serialNumber)||(payload.scope!==undefined&&payload.scope!==previous.scope)||(payload.fiberPointId!==undefined&&payload.fiberPointId!==previous.fiberPointId)))throw new Error('Identitas OLT/PON/ONU tiket otomatis tidak dapat diubah');
  const device = deviceRows(data).find(row => row.id === (payload.oltId || previous.oltId));
  if (!device) throw new Error('OLT tidak ditemukan');
  const title = text(payload.title ?? previous.title ?? '', 160); if (!title) throw new Error('Judul tiket wajib diisi');
  const description = text(payload.description ?? previous.description ?? '', 1500, true);
  const status = payload.status ?? previous.status ?? 'new'; if (!TICKET_STATUSES.includes(status)) throw new Error('Status tiket tidak valid');
  const pon = text(payload.pon ?? previous.pon ?? '', 24); if (pon && !/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(pon)) throw new Error('Port PON tidak valid');
  const serialNumber = payload.serialNumber === '' ? '' : normalizeSerial(payload.serialNumber || previous.serialNumber || '');
  const scope=payload.scope??previous.scope??(serialNumber?'onu':pon?'pon':'olt');if(!Object.hasOwn(TICKET_SCOPE_LABELS,scope))throw new Error('Lingkup tiket tidak valid');
  if(!previous.id&&status==='resolved'&&['odp','pon','odc'].includes(scope))throw ticketAccessError('Buat dan tugaskan tiket kelompok terlebih dahulu sebelum konfirmasi selesai');
  const fiberPointId=text(payload.fiberPointId??previous.fiberPointId??'',100);if(scope==='odp'&&!(data.fiberPoints||[]).some(point=>point.id===fiberPointId))throw new Error('Pemetaan ODP tiket belum tersedia');
  const assignedTo = text(payload.assignedTo ?? previous.assignedTo ?? '', 100);
  if (assignedTo && !(data.users || []).some(user => user.id === assignedTo && user.active !== false && ['admin','owner','noc','technician','secretary'].includes(user.role))) throw new Error('Petugas tiket tidak valid');
  if (!previous.id) {
    const customer=ticketIncidents.owner(data,device,{serialNumber},Date.now()).customer;
    const existing=customer&&ticketIncidents.activeFault(data,customer);
    if(existing)throw ticketAccessError('Pelanggan sudah memiliki tiket gangguan aktif '+require('./ticket-reference').number(existing)+'. Lanjutkan penanganan pada tiket tersebut.');
    const key=incidentKey({oltId:device.id,serialNumber,pon,scope,fiberPointId});
    const active = (data.oltTickets || []).find(row => row.oltId === device.id && row.status !== 'resolved' && (key?incidentKey(row)===key:!row.serialNumber&&!row.pon));
    if (active) throw new Error(`Gangguan ini sudah memiliki tiket ${active.number}`);
    if ((data.oltTickets || []).filter(row => row.status !== 'resolved').length >= 500) throw new Error('Batas tiket aktif tercapai');
  }
  const now = new Date().toISOString();
  const history=previous.id&&(previous.status!==status||previous.assignedTo!==assignedTo||previous.description!==description)?ticketHistory(previous,actor,'updated',description||'Data tiket diperbarui',status):previous.history;
  return { ...previous, id: previous.id || crypto.randomUUID(), number: require('./ticket-reference').number(previous) || `TKT-${now.slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    oltId: device.id, title, description, pon, serialNumber, scope, fiberPointId, assignedTo, companionIds:assignedTo===previous.assignedTo?require('./ticket-team').companionIds(previous):[], status, createdAt: previous.createdAt || now,
    updatedAt: now, updatedBy: actor.id, createdBy: previous.createdBy || actor.id, resolvedAt: status === 'resolved' ? previous.resolvedAt || now : '',...(history?{history}:{}) };
}
function ticketAccessError(message,status=409){const error=new Error(message);error.status=status;return error;}
function ticketHistory(ticket,actor,kind,note,status,now=Date.now()) {
  return [...(ticket.history||[]),{id:crypto.randomUUID(),at:new Date(now).toISOString(),userId:actor.id,userName:actor.name||actor.username||actor.id,kind,note,status}].slice(-50);
}
function claimTicket(ticket,actor,now=Date.now()) {
  if(ticket.status==='resolved')throw ticketAccessError('Tiket sudah selesai');
  if(ticket.assignedTo&&ticket.assignedTo!==actor.id)throw ticketAccessError('Tiket sudah diambil petugas lain');
  if(ticket.assignedTo===actor.id)return ticket;
  return {...ticket,assignedTo:actor.id,companionIds:[],status:'assigned',updatedAt:new Date(now).toISOString(),updatedBy:actor.id,history:ticketHistory(ticket,actor,'claimed','Tiket diambil','assigned',now)};
}
function progressTicket(ticket,payload,actor,now=Date.now()) {
  require('./ticket-team').requireStatusChange(ticket,payload,actor);
  if(!ticket.assignedTo)throw ticketAccessError('Ambil atau tugaskan tiket terlebih dahulu');
  if(actor.role==='technician'&&!require('./ticket-team').memberIds(ticket).includes(actor.id))throw ticketAccessError('Tiket ditangani petugas lain',403);
  if(ticket.status==='resolved')throw ticketAccessError('Tiket sudah selesai');
  const status=payload.status||'working';if(!['working','resolved'].includes(status))throw new Error('Status progres tidak valid');
  const note=text(payload.note??'',1000,true);if(!note)throw new Error('Catatan progres wajib diisi');
  const latest=(ticket.history||[]).at(-1);if(latest?.kind==='progress'&&latest.userId===actor.id&&latest.note===note&&latest.status===status&&now-Date.parse(latest.at)<60000)return ticket;
  return {...ticket,status,updatedAt:new Date(now).toISOString(),updatedBy:actor.id,resolvedAt:status==='resolved'?new Date(now).toISOString():'',history:ticketHistory(ticket,actor,'progress',note,status,now)};
}
function requireTicketEditor(ticket,payload,actor) {
  if(actor.role!=='technician')return;
  if(ticket?.id&&ticket.assignedTo&&ticket.assignedTo!==actor.id){if(!require('./ticket-team').memberIds(ticket).includes(actor.id)||Object.keys(payload).length)throw ticketAccessError('Tiket ditangani petugas lain; pendamping menggunakan pembaruan progres',403);}
  if(Object.hasOwn(payload,'assignedTo')&&payload.assignedTo!==(ticket?.assignedTo||actor.id))throw ticketAccessError('Penugasan petugas lain hanya melalui koordinator',403);
  if(ticket?.id&&!ticket.assignedTo&&(payload.assignedTo||(payload.status&&payload.status!==ticket.status)))throw ticketAccessError('Ambil tiket terlebih dahulu');
}
const DEFAULT_TICKET_TEMPLATES=Object.freeze({
  detected:'*GANGGUAN INTERNET*\nPelanggan: [customer]\nKondisi: Sinyal fiber terputus (LOS)\nRedaman terakhir: [last_rx]\nLokasi: [location]\nReferensi: [network]\nTerdampak: [affected] ONU\nTiket: [ticket_no]\nWaktu: [time]',
  claimed:'*TIKET DIAMBIL*\nTiket: [ticket_no]\nLingkup: [scope]\nOLT: [olt]\nPON: [pon]\nTeknisi: [technician]\nStatus: [status]',
  progress:'*PROGRES PENANGANAN*\nTiket: [ticket_no]\nLingkup: [scope]\nOLT: [olt]\nPON: [pon]\nTeknisi: [technician]\nStatus: [status]\nCatatan: [progress]',
  resolved:'*PENANGANAN SELESAI*\nPelanggan: [customer]\nLokasi: [location]\nReferensi: [network]\nTiket: [ticket_no]\nPetugas: [technician]\nPendamping: [companions]\nCatatan: [progress]'
});
function ticketTemplates(data){
  const result={...DEFAULT_TICKET_TEMPLATES,...require('./ticket-templates').DEFAULTS,...(data.settings?.oltTicketing?.templates||{})};
  const opticalDefaults={...DEFAULT_TICKET_TEMPLATES,...require('./ticket-templates').DEFAULTS};
  for(const key of['detected','odpDetected','odcDetected'])if(result[key]===opticalDefaults[key].replace('\nRedaman terakhir: [last_rx]',''))result[key]=opticalDefaults[key];
  // Upgrade only untouched legacy defaults; preserve genuinely customized templates.
  if(/^\*GANGGUAN \[scope\]\*\nTiket: \[ticket_no\]\nOLT: \[olt\]\nPON: \[pon\]\nODP: \[odp\]\nONU: \[onu\]\nPelanggan: \[customer\]\nTerdampak: \[affected\] ONU\nTerdeteksi: \[time\]\nSilakan ambil tiket melalui menu (?:OLT > Tiket Gangguan|Monitoring > Tiket Layanan)\.$/.test(result.detected))result.detected=DEFAULT_TICKET_TEMPLATES.detected;
  if(result.resolved==='*PENANGANAN SELESAI*\nTiket: [ticket_no]\nLingkup: [scope]\nOLT: [olt]\nPON: [pon]\nTeknisi: [technician]\nCatatan: [progress]')result.resolved=DEFAULT_TICKET_TEMPLATES.resolved;
  if(result.resolved==='*PENANGANAN SELESAI*\nPelanggan: [customer]\nLokasi: [location]\nReferensi: [network]\nTiket: [ticket_no]\nPetugas: [technician]\nCatatan: [progress]')result.resolved=DEFAULT_TICKET_TEMPLATES.resolved;
  return result;
}
function validateTicketTemplates(payload){const result={};for(const key of Object.keys({...DEFAULT_TICKET_TEMPLATES,...require('./ticket-templates').DEFAULTS})){if(payload[key]!==undefined){const value=text(payload[key],2400,true);if(!value)throw new Error('Template tiket tidak boleh kosong');result[key]=value;}}return result;}
function renderTicketTemplate(data,ticket,kind='detected') {
  if(!Object.hasOwn(DEFAULT_TICKET_TEMPLATES,kind))throw new Error('Jenis template tidak valid');
  const labels={new:'Baru',assigned:'Diambil',working:'Dikerjakan',resolved:'Selesai'},device=deviceRows(data).find(row=>row.id===ticket.oltId),technician=(data.users||[]).find(row=>row.id===ticket.assignedTo),point=(data.fiberPoints||[]).find(row=>row.id===ticket.fiberPointId);
  const date=new Date(ticket.losDetection?.firstDetectedAt||ticket.createdAt),zone=data.settings?.timezone||data.settings?.timeZone||'Asia/Makassar';let time='-';try{time=new Intl.DateTimeFormat('id-ID',{timeZone:zone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}catch{}
  const progress=[...(ticket.history||[])].reverse().find(row=>row.kind===(ticket.autoResolved&&kind==='resolved'?'recovered':'progress'))?.note||ticket.description;
  const automatic=autoIdentity.customerForTicket(data,ticket,device),customer=ticket.customerId?(data.customers||[]).find(row=>row.id===ticket.customerId):autoIdentity.manualCustomerFor(data,device,{serialNumber:ticket.serialNumber})||automatic?.customer;
  const affectedCustomers=[...new Set((ticket.affectedSerialNumbers||[]).map(sn=>(autoIdentity.manualCustomerFor(data,device,{serialNumber:sn})||autoIdentity.customerFor(data,device,{serialNumber:sn})?.customer)?.name).filter(Boolean))];
  const customerText=customer?.name||ticket.customerName|| (affectedCustomers.length?affectedCustomers.slice(0,5).join(', ')+(affectedCustomers.length>5?` dan ${affectedCustomers.length-5} pelanggan lainnya`:''):'-');
  const location=customer?.address||ticket.contactAddress||ticket.fiberPointName||(point?[point.code,point.name].filter(Boolean).join(' - '):'')||'-';
  const values={ticket_no:require('./ticket-reference').number(ticket),scope:TICKET_SCOPE_LABELS[ticket.scope]||'ONU',olt:device?.name,pon:ticket.pon,odp:ticket.fiberPointName||(point?[point.code,point.name].filter(Boolean).join(' - '):''),onu:ticket.serialNumber,customer:customerText,location,network:[device?.name,ticket.pon?'PON '+ticket.pon:''].filter(Boolean).join(' / '),affected:ticket.affectedSerialNumbers?.length||ticket.affectedCount||(ticket.serialNumber?1:0),technician:technician?.name||technician?.username||'Belum ditugaskan',status:labels[ticket.status]||ticket.status,progress,time};
  values.companions=require('./ticket-team').publicTeam(data,ticket).filter(row=>!row.lead).map(row=>row.name).join(', ');values.team=require('./ticket-team').publicTeam(data,ticket).map(row=>row.name+(row.lead?' (PJ)':'')).join(', ');
  const service=require('./service-tickets'),locationData=service.ticketLocation(data,ticket),plan=ticket.requestedPackage,recovery=ticket.recovery||{},category=service.CATEGORIES.find(row=>row.id===ticket.category)?.label||ticket.title||'Layanan';
  Object.assign(values,{customer:locationData.name||values.customer,location:locationData.address||(['staff-service','wifiku'].includes(ticket.source)?'Belum dilengkapi':values.location),phone:locationData.phone,map:locationData.locationUrl||'Belum dilengkapi',category,request:ticket.messages?.[0]?.text||'',package:plan?plan.name+' / '+new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(plan.price):'',service_title:ticket.kind==='request'?'PERMINTAAN: '+category.toUpperCase():'LAPORAN GANGGUAN',completion_title:ticket.kind==='request'?'PERMINTAAN LAYANAN SELESAI':'PENANGANAN GANGGUAN SELESAI',total:recovery.total??ticket.affectedCount,online:recovery.online,eligible:recovery.eligible,powered_off:recovery.poweredOff,remaining_los:recovery.remainingLos});
  values.last_rx=require('./ticket-network').opticalText(data,ticket);
  const template=ticketTemplates(data)[require('./ticket-templates').keyFor(ticket,kind)];
  let rendered=require('./ticket-templates').render(template,values);
  if(kind==='detected'&&!['staff-service','wifiku'].includes(ticket.source)&&!template.includes('[last_rx]')){
    const line='Redaman terakhir: '+values.last_rx;
    rendered=/^Redaman terakhir\s*:[^\n]*$/im.test(rendered)?rendered.replace(/^Redaman terakhir\s*:[^\n]*$/im,line):rendered+'\n'+line;
  }
  return rendered;
}
function pruneTickets(rows) {
  const cutoff = Date.now() - 180 * 86400000;
  const active = rows.filter(row => row.status !== 'resolved');
  const closed = rows.filter(row => row.status === 'resolved' && Date.parse(row.resolvedAt || row.updatedAt) >= cutoff).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,1000);
  return [...active,...closed];
}

module.exports = { OIDS, CACHE_MS, MAX_DEVICES, parseRows, normalizeSerial, normalizeSnapshot, position, optical, validateDevice,
  classifyCause, summarizeOnus, applyCauses, matchesState, lastOnlineAt, lastOptical, preserveLastOnline, parseCauseRows, onuPage, removeOnu, rebootOnu, renameOnu, readOnuDescription, readRemovalState,
  deviceRows, publicDevice, snapshotFor, collect, poll, pollNext, requestRefresh, requestRefreshAll, testConnection, saveConfig, visibleDevices, mappingNodes, linkCustomer, linkedOnus,actionPosition,
  saveTicket, pruneTickets, ticketMessage, TICKET_STATUSES, losTicketPlan, applyLosTicketPlan, TICKET_SCOPE_LABELS, claimTicket, progressTicket, requireTicketEditor, ticketTemplates, validateTicketTemplates, renderTicketTemplate };
