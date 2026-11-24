'use strict';

const crypto = require('node:crypto');
const pnp = require('./olt-zte-pnp');
const profiles = require('./olt-zte-profiles');
const vendors = require('./olt-vendors');
const plans = new Map(), pending = new Map(), writes = new Set(), cache = new Map(), attempts = new Map(), loading = new Map();
const PLAN_MS = 120000, CACHE_MS = 30000;
const fail = (message, status = 409) => { throw Object.assign(Error(message), { status }); };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const interfaceKind = value => { const kind = value || 'lan'; if (!['lan', 'wlan'].includes(kind)) fail('Jenis antarmuka bridge tidak valid.', 400); return kind; };
const portName = (value, kind) => typeof value === 'string' && (kind === 'wlan' ? /^wifi_0\/(?:[1-9]|[12]\d|3[0-2])$/ : /^eth_0\/[1-8]$/).test(value);
const field = (text, label) => String(text).replace(/\r/g, '').match(new RegExp('^[ \\t]*' + label + '[ \\t]*:[ \\t]*([^\\n]*)', 'im'))?.[1]?.trim() || '';

function target(input) {
  if (!profiles.address(input.address) || Number(input.address.split(':')[1]) > 128 || !/^[A-Z0-9]{12}$/.test(input.serialNumber || '')) fail('Pilih ONU dan SN dari inventory yang telah dibaca.', 400);
  return { address: input.address, serialNumber: input.serialNumber };
}
function readCommands(unit, kind = 'lan') {
  interfaceKind(kind);
  const iface = 'gpon-onu_' + unit.address;
  const queries = kind === 'wlan' ? ['vlan wifi', 'vlan-filter-mode wifi', 'vlan-filter wifi', 'ssid info'] : ['vlan eth', 'vlan-filter-mode ethuni', 'vlan-filter ethuni'];
  return ['enable', 'terminal length 0', 'show version-running', 'show gpon onu by sn ' + unit.serialNumber,
    'show gpon onu detail-info ' + iface, 'show gpon remote-onu equip ' + iface,
    'show gpon remote-onu capability ' + iface, 'show running-config interface ' + iface,
    'show onu running config ' + iface,
    ...queries.map(query => 'show gpon remote-onu ' + query + ' ' + iface)];
}
function output(result, command, last = false) {
  const rows = (result.outputs || []).filter(row => row.command === command);
  if (!rows.length || !last && rows.length !== 1) fail('Pembacaan bridge ONU belum lengkap.', 503);
  const text = String(rows[last ? rows.length - 1 : 0].stdout || '').replace(/\r/g, '');
  if (Buffer.byteLength(text) > 131072 || /--\s*More\s*--|\b(?:unknown command|invalid command|command incomplete)\b/i.test(text)) fail('Respons bridge ONU terpotong atau belum didukung.', 503);
  return text;
}
function block(text, header) {
  const lines = text.split('\n').map(line => line.trim());
  if (lines.filter(line => line === header).length !== 1) fail('Target konfigurasi ONU belum pasti.');
  const start = lines.indexOf(header), end = lines.findIndex((line, index) => index > start && line === '!');
  if (end < 0) fail('Konfigurasi ONU terpotong.');
  const body = lines.slice(start + 1, end);
  if (body.some(line => /^(?:interface|pon-onu-mng)\s/.test(line))) fail('Konfigurasi memuat lebih dari satu ONU.');
  return body.filter(Boolean);
}
function ssidMapping(text, max) {
  const none = /%Code 64040-GPONRM\s*:\s*No relate information to show\./.test(text);
  if (none) { if (/^\s*Interface\s*:/m.test(text)) fail('Daftar SSID OMCI bertentangan.'); return { ports: [], guard: hash([]) }; }
  if (/%Code|(?:^|\n)\s*%/.test(text)) fail('Pembacaan SSID OMCI belum didukung.', 503);
  const sections = text.split(/(?=^\s*Interface\s*:)/m).filter(part => /^\s*Interface\s*:/m.test(part)), seen = new Set(), ports = [], guards = [];
  if (!sections.length || sections.length > max || max > 32) fail('Daftar SSID OMCI belum lengkap.', 503);
  for (const section of sections) {
    const name = field(section, 'Interface'), ssid = field(section, 'Name');
    if (!portName(name, 'wlan') || seen.has(name) || Buffer.byteLength(ssid) > 32 || /[\x00-\x1f\x7f]/.test(ssid)) fail('Pemetaan SSID OMCI tidak valid atau ganda.');
    seen.add(name);
    const frequency = field(section, '(?:Operating frequency band|Frequency band|Band)').toLowerCase();
    const band = /^2[.,]4\s*ghz$/.test(frequency) ? '2.4' : /^5\s*ghz$/.test(frequency) ? '5' : '';
    const usable = Boolean(ssid && !/^(?:N\/A|unknown|by ONU default)$/i.test(ssid));
    const reserved = /backhaul|\bmesh\b|^bh[_-]/i.test(ssid) || /backhaul/i.test(field(section, '(?:Service type|Type)'));
    ports.push({ name, ssid, band, editable: usable && !reserved, ...(!usable ? { protection: 'ssid-unmapped' } : reserved ? { protection: 'backhaul' } : {}) });
    // Client counters can change during a session; SSID/authentication settings cannot.
    guards.push(section.split('\n').map(line => line.trim()).filter(line => line && !/^Current users\s*:/i.test(line) && !/^[A-Za-z0-9_.()-]+#$/.test(line)));
  }
  return { ports, guard: hash(guards) };
}
function management(lines, definitions, kind) {
  const ports = definitions.map(row => ({ ...row, mode: '', vlan: null, filterMode: null, filters: [] }));
  const other = [], services = [], protectedVlans = new Set([100]);
  for (const line of lines) {
    let match;
    if ((match = line.match(/^service ([A-Za-z0-9_.-]+) gemport (\d+) vlan (\d+)$/))) {
      services.push({ name: match[1], gem: Number(match[2]), vlan: Number(match[3]) });
      if (/mgmt|management|tr069/i.test(match[1])) protectedVlans.add(Number(match[3]));
    }
    if (/\b(?:ip-?host|veip|tr069|mgmt-ip|wan-ip)\b/i.test(line)) for (const m of line.matchAll(/\bvlan (\d+)\b/gi)) protectedVlans.add(Number(m[1]));
    if ((match = line.match(/^vlan port ((?:eth|wifi)_0\/\d+) mode (trunk|tag)(?: vlan (\d+)(?: pri ([0-7]))?)?$/)) && portName(match[1], kind)) {
      const port = ports.find(row => row.name === match[1]);
      if (!port || port.mode || (match[2] === 'tag') !== Boolean(match[3]) || match[4] && match[4] !== '0') fail('Mode antarmuka existing memerlukan pemeriksaan manual.');
      Object.assign(port, { mode: match[2], vlan: match[3] ? Number(match[3]) : null }); continue;
    }
    if ((match = line.match(/^vlan-filter-mode (ethuni|wifi) ((?:eth|wifi)_0\/\d+) tag-filter (discard|vlan-match) untag-filter (discard|transparent)$/)) && portName(match[2], kind)) {
      if (match[1] !== (kind === 'wlan' ? 'wifi' : 'ethuni')) fail('Jenis filter berbeda dari antarmuka.');
      const port = ports.find(row => row.name === match[2]);
      if (!port || port.filterMode) fail('Mode filter antarmuka ganda atau tidak valid.');
      port.filterMode = { tag: match[3], untag: match[4] }; continue;
    }
    if ((match = line.match(/^vlan-filter (ethuni|wifi) ((?:eth|wifi)_0\/\d+) pri ([0-7]) vlan (\d+)$/)) && portName(match[2], kind)) {
      if (match[1] !== (kind === 'wlan' ? 'wifi' : 'ethuni')) fail('Jenis filter berbeda dari antarmuka.');
      const port = ports.find(row => row.name === match[2]), vlan = Number(match[4]), priority = Number(match[3]);
      if (!port || vlan < 1 || vlan > 4094 || port.filters.length >= 16 || port.filters.some(row => row.vlan === vlan && row.priority === priority)) fail('Filter antarmuka existing tidak valid.');
      port.filters.push({ vlan, priority }); continue;
    }
    other.push(line);
  }
  return { ports, other, services, protectedVlans: [...protectedVlans].sort((a, b) => a - b) };
}
function inspect(result, selection, last = false, requestedKind = 'lan') {
  if (!result.success) {
    const error = String(result.error || '');
    if (/antrean|sedang digunakan/i.test(error)) fail('CLI sedang dipakai operasi lain. Tunggu proses selesai lalu baca ulang.', 429);
    if (/login.*ditolak/i.test(error)) fail('Login CLI OLT ditolak. Periksa akun CLI pada pengaturan OLT.', 502);
    if (/belum didukung firmware/i.test(error)) fail('Perintah OMCI untuk antarmuka ini belum didukung firmware OLT. Konfigurasi tidak diubah.', 422);
    fail('Antarmuka ONU belum dapat dibaca. Periksa koneksi dan baca ulang setelah proses OLT selesai.', 503);
  }
  const kind = interfaceKind(requestedKind), unit = target(selection), get = query => output(result, query, last), iface = 'gpon-onu_' + unit.address;
  for (const command of readCommands(unit, kind)) get(command);
  const version = get('show version-running'), firmwares = [...version.matchAll(/^\d+\/\d+\/\d+\s+\S+\s+MVR\s+(\S+)/gm)].map(row => row[1]);
  if (!firmwares.length || firmwares.some(value => value !== 'V2.1.0')) fail('Editor bridge belum terverifikasi pada firmware OLT ini.');
  const addresses = require('./olt-zte-registration').bySerial(get('show gpon onu by sn ' + unit.serialNumber), unit.serialNumber);
  const detail = get('show gpon onu detail-info ' + iface), equipment = get('show gpon remote-onu equip ' + iface), capability = get('show gpon remote-onu capability ' + iface);
  if (addresses.length !== 1 || addresses[0] !== unit.address || field(detail, 'ONU interface') !== iface || field(detail, 'Serial number') !== unit.serialNumber) fail('SN berpindah, ganda, atau berbeda dari ONU terpilih.');
  if (field(detail, 'Phase state').toLowerCase() !== 'working') fail('ONU belum online pada pembacaan langsung OLT. Periksa status terbaru modem.');
  if (field(detail, 'Config state').toLowerCase() !== 'success') fail('ONU online, tetapi sinkronisasi konfigurasi OMCI belum berhasil. Periksa konfigurasi modem terlebih dahulu.');
  const ethernet = Number(field(capability, 'Ethernet UNI number').match(/^([1-8])\b/)?.[1]);
  const vendor = field(equipment, 'Vendor ID'), model = field(equipment, 'Equipment ID'), omcc = field(equipment, 'OMCC version');
  if (!ethernet || !/^[A-Z0-9]{4}$/.test(vendor) || !model || model === 'N/A' || !/^[a-f0-9]{2}$/i.test(omcc)) fail('Model fisik atau kemampuan OMCI antarmuka belum terverifikasi.');
  const interfaceLines = block(get('show running-config interface ' + iface), 'interface ' + iface);
  const managementLines = block(get('show onu running config ' + iface), 'pon-onu-mng ' + iface);
  const wifiText = field(capability, 'WIFI UNI number'), wifi = /^\d+$/.test(wifiText) ? Number(wifiText) : 0;
  if (!Number.isSafeInteger(wifi) || wifi < 0 || wifi > 32) fail('Kapasitas WLAN belum terverifikasi.');
  const ssids = kind === 'wlan' ? ssidMapping(get('show gpon remote-onu ssid info ' + iface), wifi) : null;
  const definitions = ssids ? [...ssids.ports] : Array.from({ length: ethernet }, (_, i) => ({ name: 'eth_0/' + (i + 1) }));
  // Existing native bindings remain inspectable even when the ONU omits SSID names.
  if (ssids) for (const line of managementLines) {
    const name = line.match(/^(?:vlan port|vlan-filter(?:-mode)? wifi) (wifi_0\/\d+)\b/)?.[1];
    if (!name) continue;
    if (!portName(name, 'wlan')) fail('Identitas port WLAN existing belum valid.');
    if (!definitions.some(port => port.name === name)) definitions.push({ name, ssid: '', band: '', editable: false, protection: 'ssid-unmapped' });
  }
  if (ssids && definitions.length > wifi) fail('Binding WLAN melebihi kemampuan ONU yang dilaporkan.');
  const config = management(managementLines, definitions, kind);
  const services = [];
  for (const line of interfaceLines) {
    const m = line.match(/^service-port (\d+) vport (\d+) user-vlan (\d+) vlan (\d+)$/);
    if (m) services.push({ id: Number(m[1]), gem: Number(m[2]), userVlan: Number(m[3]), vlan: Number(m[4]) });
    else if (/^service-port\b/.test(line)) fail('Layanan VLAN lanjutan belum didukung editor bridge.');
  }
  if(new Set(services.map(row=>row.id)).size!==services.length||services.some(row=>row.id<1||row.id>128||row.gem<1||row.userVlan<1||row.userVlan>4094||row.vlan<1||row.vlan>4094)||new Set(services.map(row=>row.userVlan)).size!==services.length)fail('Pemetaan service-port atau VLAN ONU ganda/tidak valid. Periksa konfigurasi layanan dahulu.');
  if(config.services.some(row=>row.gem<1||row.vlan<1||row.vlan>4094)||new Set(config.services.map(row=>row.name)).size!==config.services.length)fail('Pemetaan layanan OMCI tidak valid atau ganda.');
  for(const row of services)if(config.services.filter(service=>service.gem===row.gem&&service.vlan===row.userVlan).length>1)fail('VLAN memiliki lebih dari satu pemetaan layanan OMCI.');
  const vlans = [...new Set(services.filter(row => config.services.some(service => service.gem === row.gem && service.vlan === row.userVlan)).map(row => row.userVlan))].sort((a, b) => a - b);
  const remote = (kind === 'wlan' ? ['vlan wifi', 'vlan-filter-mode wifi', 'vlan-filter wifi'] : ['vlan eth', 'vlan-filter-mode ethuni', 'vlan-filter ethuni']).map(query => get('show gpon remote-onu ' + query + ' ' + iface));
  const state = { target: unit, kind, model, vendor, omcc, ethernet, wifi, ssidGuard: ssids?.guard || '', interfaceLines, managementLines, ...config, servicePorts:services, vlans, remote };
  if (Buffer.byteLength(JSON.stringify(state)) > 131072) fail('Konfigurasi ONU melebihi batas pemeriksaan aman.', 503);
  return state;
}
const proof = state => hash(state);
function publicState(state, at = Date.now()) {
  return { target: state.target, kind: state.kind, model: state.model, vendor: state.vendor, ethernet: state.ethernet, wifi: state.wifi,
    ports: state.ports.map(port => ({ ...structuredClone(port), editable: editable(state, port), ...protection(state, port) })),
    vlans: state.vlans.filter(id => !state.protectedVlans.includes(id)), protectedVlans: [...state.protectedVlans],
    services:state.servicePorts.filter(row=>state.vlans.includes(row.userVlan)&&!state.protectedVlans.includes(row.userVlan)).map(row=>({id:row.id,gem:row.gem,userVlan:row.userVlan,vlan:row.vlan})),
    ...(state.kind === 'wlan' && !state.ports.length ? { unavailableReason: 'Modem belum melaporkan pemetaan SSID melalui OMCI. Konfigurasi WiFi tetap dapat diperiksa melalui ACS.' } : {}),
    checkedAt: new Date(at).toISOString() };
}
function advanced(state, port) {
  return state.other.some(line => line.split(/[ \t]+/).includes(port.name) && !(state.kind === 'wlan' && /^ssid\s/.test(line)));
}
function editable(state, port) {
  return port.editable !== false && !advanced(state, port) && !port.filters.some(row => state.protectedVlans.includes(row.vlan)) && !(port.vlan && state.protectedVlans.includes(port.vlan));
}
function protection(state, port) {
  let code = '';
  if (port.filters.some(row => state.protectedVlans.includes(row.vlan)) || port.vlan && state.protectedVlans.includes(port.vlan)) code = 'management';
  else if (advanced(state, port)) code = 'advanced';
  else if (port.editable === false) code = port.protection || 'ssid-unmapped';
  const reasons = { management: 'Terikat VLAN management/TR069; hanya dapat dilihat.', advanced: 'Memiliki binding lanjutan; perubahan melalui editor ini dikunci.', backhaul: 'SSID backhaul/mesh; hanya dapat dilihat.', 'ssid-unmapped': 'Identitas SSID belum dilaporkan melalui OMCI; binding hanya dapat dilihat.' };
  return code ? { protection: code, protectionReason: reasons[code] } : {};
}
function build(state, input) {
  const selected = target(input), port = state.ports.find(row => row.name === input.port);
  if (interfaceKind(input.kind) !== state.kind || hash(selected) !== hash(state.target) || !port || !portName(input.port, state.kind)) fail('ONU atau antarmuka berbeda dari pembacaan.');
  if (state.kind === 'wlan' && (input.mode !== 'access' || port.editable === false || !port.ssid)) fail('Bridge WLAN memerlukan SSID terverifikasi dan satu VLAN untagged.', 400);
  if (!['trunk', 'access'].includes(input.mode) || !Array.isArray(input.vlans) || input.vlans.length < 1 || input.vlans.length > 16 || input.mode === 'access' && input.vlans.length !== 1) fail('Pilih trunk 1-16 VLAN atau bridge access satu VLAN.', 400);
  const vlans = input.vlans;
  if (new Set(vlans).size !== vlans.length || vlans.some(id => !Number.isSafeInteger(id) || !state.vlans.includes(id) || state.protectedVlans.includes(id))) fail('VLAN harus tersedia pada layanan ONU dan bukan VLAN management.', 400);
  if (advanced(state, port)) fail('Antarmuka mempunyai binding lanjutan. Periksa manual agar layanan lama tidak tertimpa.');
  if (port.filters.some(row => state.protectedVlans.includes(row.vlan)) || port.vlan && state.protectedVlans.includes(port.vlan)) fail('Port ini terikat VLAN management dan tidak boleh diubah.');
  const desired = [...vlans].sort((a, b) => a - b);
  if (port.mode === (input.mode === 'trunk' ? 'trunk' : 'tag') && port.vlan === (input.mode === 'trunk' ? null : desired[0]) && port.filterMode?.tag === 'vlan-match' && port.filterMode?.untag === (input.mode === 'trunk' ? 'discard' : 'transparent') && hash([...port.filters].sort((a, b) => a.vlan - b.vlan).map(row => [row.vlan, row.priority])) === hash(desired.map(vlan => [vlan, 0]))) fail('Binding antarmuka sudah sesuai; tidak perlu dikirim ulang.');
  return { target: selected, kind: state.kind, model: state.model, port: port.name, mode: input.mode, vlans: desired, previous: structuredClone(port) };
}
function mutations(value) {
  const base = (value.kind === 'wlan' ? 'wifi' : 'ethuni') + ' ' + value.port;
  return ['vlan-filter-mode ' + base + ' tag-filter discard untag-filter discard',
    ...value.previous.filters.map(row => `no vlan-filter ${base} pri ${row.priority} vlan ${row.vlan}`),
    ...value.vlans.map(id => `vlan-filter ${base} pri 0 vlan ${id}`),
    `vlan port ${value.port} mode ${value.mode === 'trunk' ? 'trunk' : 'tag vlan ' + value.vlans[0]}`,
    `vlan-filter-mode ${base} tag-filter vlan-match untag-filter ${value.mode === 'trunk' ? 'discard' : 'transparent'}`];
}
function writeCommands(state, value) {
  return [...readCommands(value.target, value.kind), 'configure terminal', 'pon-onu-mng gpon-onu_' + value.target.address,
    ...mutations(value), 'end', ...readCommands(value.target, value.kind).slice(2)];
}
function nativeExpected(state, value) {
  const copy = structuredClone(state), port = copy.ports.find(row => row.name === value.port);
  Object.assign(port, { mode: value.mode === 'trunk' ? 'trunk' : 'tag', vlan: value.mode === 'trunk' ? null : value.vlans[0],
    filterMode: { tag: 'vlan-match', untag: value.mode === 'trunk' ? 'discard' : 'transparent' }, filters: value.vlans.map(vlan => ({ vlan, priority: 0 })) });
  return copy;
}
function stable(state) {
  return hash({ target: state.target, kind: state.kind, model: state.model, vendor: state.vendor, omcc: state.omcc, ethernet: state.ethernet, wifi: state.wifi, ssidGuard: state.ssidGuard,
    interfaceLines: [...state.interfaceLines].sort(), other: [...state.other].sort(), services: [...state.services].sort((a, b) => a.name.localeCompare(b.name)),
    ports: state.ports.map(row => ({ ...row, filters: [...row.filters].sort((a, b) => a.vlan - b.vlan || a.priority - b.priority) })), protectedVlans: state.protectedVlans, vlans: state.vlans });
}
function remotePort(text, port) {
  const rows = text.split(/(?=^\s*Interface [Nn]ame\s*:)/m).filter(part => field(part, 'Interface [Nn]ame') === port);
  if (rows.length !== 1 || /%Code|\b(?:failed|failure|error)\b/i.test(rows[0])) fail('Binding antarmuka fisik belum terverifikasi melalui OMCI.');
  return rows[0];
}
function remoteVlan(text, port) {
  if (/^Interface\s+Mode\s+Def-VID\s+Def-Prio\s+Vlan-list/m.test(text)) {
    const rows = text.split('\n').filter(line => /^\s*(?:eth|wifi)_/.test(line));
    const parsed = rows.map(line => line.trim().match(/^((?:eth|wifi)_0\/\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/));
    if (parsed.some(row => !row) || new Set(parsed.map(row => row[1])).size !== parsed.length) fail('Tabel VLAN fisik terpotong atau ganda.');
    const row = parsed.find(row => row[1] === port);
    if (!row || !['tag', 'trunk'].includes(row[2])) fail('Mode VLAN antarmuka fisik belum terkonfirmasi.');
    return { mode: row[2], vlan: /^\d+$/.test(row[3]) ? Number(row[3]) : null };
  }
  const row = remotePort(text, port);
  return { mode: field(row, '(?:Tag|VLAN|Vlan|Port) mode').toLowerCase(), vlan: /^\d+$/.test(field(row, 'VLAN')) ? Number(field(row, 'VLAN')) : null };
}
function remoteFilters(text) {
  const result = [], add = (priority, vlan) => {
    if (!Number.isSafeInteger(priority) || priority < 0 || priority > 7 || !Number.isSafeInteger(vlan) || vlan < 1 || vlan > 4094 || result.some(row => row.priority === priority && row.vlan === vlan)) fail('Filter VLAN fisik tidak valid atau ganda.');
    result.push({ priority, vlan });
  };
  let priority = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim(); let match;
    if (!line || /^Interface [Nn]ame\s*:/.test(line) || /^Priority\s+VLAN(?:\s+ID)?$/i.test(line) || /^[-\s]+$/.test(line) || /^[A-Za-z0-9_.()-]+#$/.test(line)) continue;
    if ((match = line.match(/^([0-7])\s+(\d{1,4})$/))) { add(Number(match[1]), Number(match[2])); continue; }
    if ((match = line.match(/^(?:Filter )?(?:[Pp]ri(?:ority)?)\s*:\s*([0-7])$/))) { priority = Number(match[1]); continue; }
    if ((match = line.match(/^(?:Filter )?[Vv](?:lan|LAN)(?: ID)?\s*:\s*(\d{1,4})$/)) && priority !== null) { add(priority, Number(match[1])); priority = null; continue; }
    fail('Format filter VLAN fisik belum dikenali; periksa hasil tanpa mengulang perintah.');
  }
  if (priority !== null || !result.length || result.length > 16) fail('Filter VLAN fisik belum lengkap.');
  return result.sort((a, b) => a.vlan - b.vlan || a.priority - b.priority);
}
function verifyResult(result, grant) {
  const actual = inspect(result, grant.value.target, true, grant.value.kind), expected = nativeExpected(grant.state, grant.value), value = grant.value;
  if (stable(actual) !== stable(expected)) fail('Hasil bridge berbeda atau layanan lain berubah. Jangan mengirim ulang.');
  const vlan = remoteVlan(actual.remote[0], value.port), mode = remotePort(actual.remote[1], value.port), filters = remotePort(actual.remote[2], value.port);
  if (vlan.mode !== (value.mode === 'trunk' ? 'trunk' : 'tag') ||
      field(mode, 'Tag filter mode') !== 'vlan-match' || field(mode, 'Untag filter mode') !== (value.mode === 'trunk' ? 'discard' : 'transparent')) fail('Mode antarmuka belum dikonfirmasi oleh modem.');
  if (value.mode === 'access' && vlan.vlan !== value.vlans[0]) fail('VLAN access pada modem belum cocok.');
  if (hash(remoteFilters(filters).map(row => [row.vlan, row.priority])) !== hash(value.vlans.map(vlan => [vlan, 0]))) fail('Daftar VLAN fisik berbeda dari whitelist terpilih.');
  return actual;
}
function authorize(state, value) {
  if (hash(build(state, { ...value.target, kind: value.kind, port: value.port, mode: value.mode, vlans: value.vlans })) !== hash(value)) fail('Rencana bridge tidak sesuai.');
  const commands = writeCommands(state, value);
  return { state, value, commands, mutationStart: readCommands(value.target, value.kind).length + 2, mutationEnd: commands.indexOf('end'), used: false, submitted: false, verified: false };
}
function verifyStep(outputs, grant, index, prompt) {
  const before = readCommands(grant.value.target, grant.value.kind).length;
  if (index === before - 1 && proof(inspect({ success: true, outputs }, grant.value.target, false, grant.value.kind)) !== proof(grant.state)) fail('Identitas, VLAN, SSID atau konfigurasi ONU berubah sebelum penerapan.');
  if (index === before && !/\(config\)#\s*$/.test(prompt)) fail('Mode konfigurasi OLT belum pasti.');
  if (index > before && index < grant.mutationEnd && !prompt.trim().endsWith('(gpon-onu-mng ' + grant.value.target.address + ')#')) fail('Mode ONU berbeda. Perubahan dihentikan.');
  if (index >= before && index < grant.mutationEnd && /%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout || '')) fail('OLT menolak binding antarmuka. Jangan mengulang otomatis.');
  if (index === grant.commands.length - 1) { verifyResult({ success: true, outputs }, grant); grant.verified = true; }
}
function check(data, device, actor, mutating = false) {
  pnp.check(data, device, actor, { readOnly: !mutating });
  if (mutating && (require('./olt-zte-registration').isBusy(device.id) || require('./olt-zte-bandwidth').isBusy(device.id) || require('./olt-pon').isBusy?.(device.id))) fail('Tunggu operasi OLT lainnya selesai.', 429);
}
function reserve(device, readOnly = false) {
  const count = pending.get(device.id) || 0;
  if ((!readOnly && count) || count >= 4 || !count && pending.size >= 2) fail('Antrean pemeriksaan antarmuka penuh. Tunggu proses selesai.', 429);
  pending.set(device.id, count + 1);
}
function release(device) { const count = pending.get(device.id) || 0; if (count > 1) pending.set(device.id, count - 1); else pending.delete(device.id); }
const cacheKey = (device, unit, kind) => pnp.signature(device) + ':' + unit.address + ':' + unit.serialNumber + ':' + kind;
function remember(device, unit, result, kind) {
  cache.set(cacheKey(device, unit, kind), { state: inspect(result, unit, false, kind), at: Date.now() });
  while (cache.size > 32) cache.delete(cache.keys().next().value);
}
async function run(data, device, unit, options, grant = null) {
  const [, context, transport] = await vendors.loadLibrary();
  return context.withContext(data, device, () => {
    if (grant) context.authorizeBridgeOperation(grant.state, grant.value);
    return transport.executeOltCommands({ olt: vendors.legacyDevice(device), password: context.decryptSecret(device.cliPasswordEnc),
      commands: grant ? grant.commands : readCommands(unit, options.kind), timeoutMs: 17000 });
  }, { ...(options.transportOptions || {}), allowZteDevRead: options.explicitDevAccess === true,
    bridgeActionAllowed: Boolean(grant), explicitDevBridgeAction: options.explicitDevAccess === true, cliQueue: true, timeoutMs: 18000 });
}
async function read(data, device, actor, input, options = {}) {
  check(data, device, actor); const unit = target(input), kind = interfaceKind(input.kind), key = cacheKey(device, unit, kind);
  const old = cache.get(key); if (input.force !== true && old && Date.now() - old.at < CACHE_MS) return publicState(old.state, old.at);
  await load(data, device, unit, { ...options, kind });
  const fresh = cache.get(key);
  return publicState(fresh.state, fresh.at);
}
async function load(data, device, unit, options) {
  const key = cacheKey(device, unit, options.kind);
  if (loading.has(key)) return loading.get(key);
  if (Date.now() - (attempts.get(key) || 0) < 3000) fail('Tunggu sebentar sebelum membaca ulang antarmuka.', 429);
  attempts.set(key, Date.now()); while (attempts.size > 64) attempts.delete(attempts.keys().next().value);
  reserve(device, true);
  const task = (async () => {
    const result = await run(data, device, unit, options);
    inspect(result, unit, false, options.kind);
    remember(device, unit, result, options.kind);
    return result;
  })();
  loading.set(key, task);
  try { return await task; } finally { loading.delete(key); release(device); }
}
async function prepare(data, device, actor, input, options = {}) {
  check(data, device, actor); const unit = target(input), kind = interfaceKind(input.kind), key = pnp.signature(device);
  const attemptKey = key + ':' + actor.id + ':' + unit.address + ':' + kind + ':' + input.port;
  if (Date.now() - (attempts.get(attemptKey) || 0) < 3000) fail('Tunggu sebentar sebelum memeriksa kembali.', 429);
  attempts.set(attemptKey, Date.now()); while (attempts.size > 64) attempts.delete(attempts.keys().next().value);
  const saved = cache.get(cacheKey(device, unit, kind));
  let state;
  if (saved && Date.now() - saved.at < CACHE_MS) state = structuredClone(saved.state);
  else state = inspect(await load(data, device, unit, { ...options, kind }), unit, false, kind);
  const value = build(state, input);
  for (const [token, item] of plans) if (item.expires <= Date.now()) plans.delete(token);
  while (plans.size >= 64) plans.delete(plans.keys().next().value);
  const token = crypto.randomBytes(24).toString('base64url');
  plans.set(token, { state, value, deviceId: device.id, signature: key, actorId: actor.id, expires: Date.now() + PLAN_MS });
  return { token, revision: device.updatedAt || '', value };
}
async function execute(data, device, actor, input, options = {}) {
  check(data, device, actor, true); const plan = plans.get(input.token);
  if (!plan || plan.expires <= Date.now() || plan.actorId !== actor.id || plan.deviceId !== device.id || plan.signature !== pnp.signature(device) || input.revision !== (device.updatedAt || '') || input.confirmId !== device.id || input.confirmTarget !== plan.value.target.serialNumber || input.confirmImpact !== true) fail('Konfirmasi ONU, SN atau rencana bridge tidak sesuai.');
  if (plan.result) return structuredClone(plan.result);
  if (plan.used) fail('Permintaan sudah diproses. Baca ulang sebelum tindakan berikutnya.');
  if (typeof options.beforeSend !== 'function' || typeof options.afterSend !== 'function') fail('Audit persisten perubahan bridge wajib tersedia.');
  if (process.env.MIGRATION_MODE === '1' && options.explicitDevAccess !== true) fail('Dev memerlukan izin perubahan perangkat yang eksplisit.');
  reserve(device); writes.add(device.id); plan.used = true;
  try {
    await options.beforeSend(plan.value); let result;
    try { result = await run(data, device, plan.value.target, options, authorize(plan.state, plan.value)); } catch { result = { success: false, submitted: null }; }
    let actual;
    if (result.success) try { actual = verifyResult(result, plan); } catch {}
    const verified = Boolean(actual), submitted = result.submitted === true, uncertain = result.submitted == null || submitted && !verified;
    for (const key of cache.keys()) if (key.startsWith(pnp.signature(device) + ':')) cache.delete(key);
    profiles.invalidate(device);
    if (actual) cache.set(cacheKey(device, plan.value.target, plan.value.kind), { state: actual, at: Date.now() });
    plan.result = { ok: verified, verified, submitted, uncertain, ...(actual ? { snapshot: publicState(actual) } : {}), message: verified ? 'Binding antarmuka dan VLAN terpilih dikonfirmasi melalui OMCI. Konfigurasi lain tetap.' : uncertain ? 'Hasil belum pasti. Baca ulang konfigurasi; tidak ada pengiriman ulang otomatis.' : 'Binding belum diterapkan. Periksa kembali koneksi dan konfigurasi.' };
    try { await options.afterSend(plan.result, plan.value); } catch { plan.result.persistenceWarning = true; plan.result.message += ' Audit hasil belum tersimpan.'; }
    return structuredClone(plan.result);
  } finally { writes.delete(device.id); release(device); }
}
module.exports = { target, readCommands, inspect, ssidMapping, publicState, build, mutations, writeCommands, authorize, verifyStep, verifyResult, read, prepare, execute, isBusy: id => pending.has(id), isMutating: id => writes.has(id), PLAN_MS };
