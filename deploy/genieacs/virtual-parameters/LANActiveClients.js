const roots = [
  "InternetGatewayDevice.LANDevice.*.Hosts.Host.*",
  "Device.Hosts.Host.*"
];

const suffixes = [
  "Active",
  "IPAddress",
  "IPv4Address",
  "MACAddress",
  "PhysAddress",
  "Layer2Address",
  "HostName",
  "Name",
  "InterfaceType",
  "Layer1Interface",
  "Interface",
  "X_HW_InterfaceType",
  "X_ZTE-COM_InterfaceType"
];

const refresh = Date.now(300000);
const prefixes = {};

function remember(path, suffix) {
  if (!path || !suffix || !path.endsWith("." + suffix)) return;
  const prefix = path.slice(0, -(suffix.length + 1));
  prefixes[prefix] = prefixes[prefix] || {};
  prefixes[prefix][suffix] = true;
}

for (const root of roots) {
  for (const suffix of suffixes) {
    const rows = declare(root + "." + suffix, { value: refresh });
    for (const row of rows) remember(row.path || "", suffix);
  }
}

function value(prefix, names) {
  for (const name of names) {
    const rows = declare(prefix + "." + name, { value: refresh });
    for (const row of rows) {
      if (row.value && row.value[0] !== undefined && row.value[0] !== null && String(row.value[0]).trim() !== "") {
        return String(row.value[0]).trim();
      }
    }
  }
  return "";
}

function inactive(text) {
  return /^(0|false|no|off|down|inactive)$/i.test(String(text || "").trim());
}

function wifiInterface(text) {
  return /wifi|wi-?fi|wlan|ssid|radio|wireless|WLANConfiguration/i.test(String(text || ""));
}

let count = 0;
for (const prefix of Object.keys(prefixes)) {
  const ip = value(prefix, ["IPAddress", "IPv4Address"]);
  const mac = value(prefix, ["MACAddress", "PhysAddress", "Layer2Address"]);
  const name = value(prefix, ["HostName", "Name"]);
  if (!ip && !mac && !name) continue;
  const active = value(prefix, ["Active"]);
  if (inactive(active)) continue;
  const iface = value(prefix, ["InterfaceType", "Layer1Interface", "Interface", "X_HW_InterfaceType", "X_ZTE-COM_InterfaceType"]);
  if (wifiInterface(iface) || wifiInterface(prefix)) continue;
  count += 1;
}

return { writable: false, value: [String(count), "xsd:unsignedInt"] };
