const cached = 1;

function clean(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

const model = declare("DeviceID.ProductClass", { value: cached });
commit();
const unsafeHosts = /^FL327D$/i.test(String(model.value && model.value[0] || ""));
const patterns = new Set();
for (let index = 1; index <= 16; index += 1) {
  const wlan = "InternetGatewayDevice.LANDevice.1.WLANConfiguration." + index;
  for (const suffix of ["SSID", "Enable", "Status", "TotalAssociations", "AssociatedDeviceNumberOfEntries", "WLAN_AssociatedDeviceNumberOfEntries"]) patterns.add(wlan + "." + suffix);
  const ap = "Device.WiFi.AccessPoint." + index;
  for (const suffix of ["Enable", "Status", "AssociatedDeviceNumberOfEntries"]) patterns.add(ap + "." + suffix);
}
for (let index = 1; index <= 8; index += 1) {
  patterns.add("InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig." + index + ".AssociatedDeviceNumberOfEntries");
  patterns.add("Device.Ethernet.Interface." + index + ".AssociatedDeviceNumberOfEntries");
}
for (const root of unsafeHosts ? [] : ["InternetGatewayDevice.LANDevice.1.Hosts.Host", "Device.Hosts.Host"]) {
  for (const suffix of ["Active", "IPAddress", "IPv4Address", "MACAddress", "PhysAddress", "HostName", "Name", "DeviceName", "InterfaceType", "Layer1Interface", "Layer2Interface", "Interface", "X_HW_InterfaceType", "X_ZTE-COM_InterfaceType"]) patterns.add(root + ".*." + suffix);
}
const declarations = new Map(Array.from(patterns, path => [path, declare(path, { path: cached, value: cached })]));
commit();
function rows(path) {
  return declarations.get(path) || [];
}

function first(path) {
  for (const row of rows(path)) {
    const value = clean(row.value && row.value[0]);
    if (value) return value;
  }
  return "";
}

function numberValue(path) {
  const value = Number(clean(first(path)).replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function disabled(value) {
  return ["0", "false", "no", "off", "down", "inactive", "disabled", "offline"].includes(clean(value).toLowerCase());
}

function hotspotSsid(value) {
  return /(?:^|[\s._-])(hotspot|wifi\s*murah|wifimurah|voucher|free\s*wifi|wifi\s*gratis|public\s*wifi)(?:$|[\s._-])/i
    .test(clean(value));
}

function wifiCounter(index) {
  const base = "InternetGatewayDevice.LANDevice.1.WLANConfiguration." + index;
  const ssid = first(base + ".SSID");
  if (ssid && hotspotSsid(ssid)) return 0;
  if (disabled(first(base + ".Enable")) || disabled(first(base + ".Status"))) return 0;
  return Math.max(
    numberValue(base + ".TotalAssociations"),
    numberValue(base + ".AssociatedDeviceNumberOfEntries"),
    numberValue(base + ".WLAN_AssociatedDeviceNumberOfEntries")
  );
}

function tr181WifiCounter(index) {
  if (disabled(first("Device.WiFi.AccessPoint." + index + ".Enable"))
    || disabled(first("Device.WiFi.AccessPoint." + index + ".Status"))) return 0;
  return numberValue("Device.WiFi.AccessPoint." + index + ".AssociatedDeviceNumberOfEntries");
}

function lanCounter() {
  let total = 0;
  for (let index = 1; index <= 8; index += 1) {
    total += Math.max(
      numberValue("InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig." + index + ".AssociatedDeviceNumberOfEntries"),
      numberValue("Device.Ethernet.Interface." + index + ".AssociatedDeviceNumberOfEntries")
    );
  }
  return total;
}

function pathIndex(path, root) {
  const match = clean(path).match(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.(\\d+)\\."));
  return match ? match[1] : "";
}

function hostActiveCount(root) {
  const active = {};
  const identity = {};
  const iface = {};
  let hasActiveRows = false;
  for (const row of rows(root + ".*.Active")) {
    const index = pathIndex(row.path, root);
    if (!index) continue;
    hasActiveRows = true;
    active[index] = !disabled(row.value && row.value[0]);
  }
  for (const suffix of ["IPAddress", "IPv4Address", "MACAddress", "PhysAddress", "HostName", "Name", "DeviceName"]) {
    for (const row of rows(root + ".*." + suffix)) {
      const index = pathIndex(row.path, root);
      const value = clean(row.value && row.value[0]);
      if (index && value) identity[index] = true;
    }
  }
  for (const suffix of ["InterfaceType", "Layer1Interface", "Layer2Interface", "Interface", "X_HW_InterfaceType", "X_ZTE-COM_InterfaceType"]) {
    for (const row of rows(root + ".*." + suffix)) {
      const index = pathIndex(row.path, root);
      const value = clean(row.value && row.value[0]);
      if (index && value) iface[index] = (iface[index] || "") + " " + value;
    }
  }
  let count = 0;
  for (const index of Object.keys(identity)) {
    if (hasActiveRows && active[index] === false) continue;
    const wifiIndex = clean(iface[index]).match(/(?:WLANConfiguration|AccessPoint|SSID)[.\s/_-]*(\d+)/i);
    if (wifiIndex && hotspotSsid(first("InternetGatewayDevice.LANDevice.1.WLANConfiguration." + wifiIndex[1] + ".SSID"))) continue;
    count += 1;
  }
  return count;
}

let wifi = 0;
let wifiTr181 = 0;
for (let index = 1; index <= 16; index += 1) {
  wifi += wifiCounter(index);
  wifiTr181 += tr181WifiCounter(index);
}

const hostTotal = hostActiveCount("InternetGatewayDevice.LANDevice.1.Hosts.Host")
  + hostActiveCount("Device.Hosts.Host");
const total = Math.max(wifi + lanCounter(), wifiTr181 + lanCounter(), hostTotal);
const reported = [...declarations].some(([pattern, matches]) => /AssociatedDeviceNumberOfEntries|TotalAssociations|Hosts\.Host\.\*\.(?:IPAddress|IPv4Address|MACAddress|PhysAddress)$/.test(pattern) && Array.from(matches).some(row => row.value && row.value[0] !== undefined));

return { writable: false, value: [reported ? String(Math.max(0, total)) : "", "xsd:string"] };
