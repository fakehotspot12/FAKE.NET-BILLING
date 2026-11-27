// Read the VLAN of the selected Internet WAN; unrelated management/bridge
// WANs and stale template labels must not supply a guessed primary VLAN.
const root = "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.";
const vlanKeys = ["X_HW_VLAN", "X_ZTE-COM_VLANID", "X_FH_VLANID", "X_CMCC_VLANIDMark", "X_CMCC_VLANID", "X_GC_VLANIDMark", "X_GC_VLANID", "X_CT-COM_VLANID", "X_CT-COM_VLANIDMark", "VLANID", "VLANIDMark"];
const serviceKeys = ["X_HW_SERVICELIST", "X_HW_ServiceList", "X_ZTE-COM_ServiceList", "X_FH_ServiceList", "X_CT-COM_ServiceList", "X_CMCC_ServiceList", "X_GC_ServiceList", "ServiceList"];
const linkKeys = ["X_CT-COM_WANEponLinkConfig.VLANIDMark", "X_CT-COM_WANGponLinkConfig.VLANIDMark", "X_CT-COM_WANEponLinkConfig.VLANID", "X_CT-COM_WANGponLinkConfig.VLANID", "X_CT-COM_VLANID", "X_CT-COM_VLANIDMark"];
const patterns = ["VirtualParameters.pppoeUsername", "Device.PPP.Interface.*.Username", "Device.PPP.Interface.*.Status", "Device.PPP.Interface.*.ConnectionStatus", "Device.PPP.Interface.*.LowerLayers", "Device.Ethernet.Link.*.LowerLayers", "Device.Ethernet.VLANTermination.*.VLANID", "Device.Ethernet.VLANTermination.*.LowerLayers"];
for (const kind of ["WANPPPConnection", "WANIPConnection"]) {
  for (const key of [...vlanKeys, ...serviceKeys, "Username", "Name", "ConnectionStatus", "ConnectionType"]) patterns.push(root + kind + ".*." + key);
}
for (const key of linkKeys) patterns.push(root + key);
const declarations = patterns.map(path => declare(path, { path: 1, value: 1 }));
commit();
const values = new Map();
for (const matches of declarations) for (const row of matches) {
  const value = row.value && row.value[0];
  if (value !== undefined && value !== null) values.set(row.path, value);
}
const text = path => String(values.get(path) ?? "").trim();
function vlan(value, zero = false) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,4}$/.test(raw)) return "";
  const number = Number(raw);
  return number >= (zero ? 0 : 1) && number <= 4094 ? String(number) : "";
}
const bases = new Set();
for (const path of values.keys()) {
  const match = path.match(/^(InternetGatewayDevice\.WANDevice\.\d+\.WANConnectionDevice\.\d+\.(?:WANPPPConnection|WANIPConnection)\.\d+)\./);
  if (match) bases.add(match[1]);
}
const rows = Array.from(bases, base => {
  const parent = base.replace(/\.(?:WANPPPConnection|WANIPConnection)\.\d+$/, "");
  const direct = vlanKeys.map(key => text(base + "." + key)), name = text(base + ".Name"), services = serviceKeys.map(key => text(base + "." + key)).join(" ");
  let id = direct.map(value => vlan(value)).find(Boolean) || linkKeys.map(key => vlan(text(parent + "." + key))).find(Boolean) || "";
  if (!id) id = vlan(name.match(/(?:^|_)VID_(\d{1,4})(?:_|$)/i)?.[1]);
  // A reported zero is untagged, not evidence for another WAN's VLAN.
  if (!id && direct.some(value => value === "0")) id = "0";
  return { base, vlan: id, username: text(base + ".Username"), ppp: base.includes(".WANPPPConnection."), connected: /^(?:connected|up)$/i.test(text(base + ".ConnectionStatus")), bridge: /bridge/i.test(text(base + ".ConnectionType")) || /_B_VID_/i.test(name), management: /TR[-_ ]?069|CWMP|ACS|management/i.test(name + " " + services) && !/internet/i.test(name + " " + services) || ["100", "1111"].includes(id) };
});
const selectedUsername = text("VirtualParameters.pppoeUsername");
function unique(rows) {
  if (!rows.length || rows.some(row => row.vlan === "")) return "";
  const ids = [...new Set(rows.map(row => row.vlan))];
  return ids.length === 1 ? ids[0] : "";
}
const internet = rows.filter(row => !row.management && !row.bridge);
const matches = selectedUsername ? internet.filter(row => row.username === selectedUsername) : [];
const connected = internet.filter(row => row.connected && row.ppp);
let result = matches.length ? unique(matches) : connected.length ? unique(connected) : unique(internet.filter(row => row.ppp));
if (!result && !matches.length && !connected.length) result = unique(internet.filter(row => row.connected));
// TR-181 follows the selected PPP interface's actual LowerLayers chain.
if (!rows.length) {
  const pppBases = [...new Set([...values.keys()].map(path => path.match(/^(Device\.PPP\.Interface\.\d+)\./)?.[1]).filter(Boolean))];
  const selected = selectedUsername ? pppBases.filter(base => text(base + ".Username") === selectedUsername) : pppBases.filter(base => /^(?:connected|up)$/i.test(text(base + ".ConnectionStatus") || text(base + ".Status")));
  const ids = selected.map(base => {
    let layer = text(base + ".LowerLayers"), seen = new Set();
    for (let depth = 0; depth < 6 && layer && !seen.has(layer); depth++) {
      seen.add(layer);const id = vlan(values.get(layer + ".VLANID"), true);if (id !== "") return id;layer = text(layer + ".LowerLayers");
    }
    return "";
  });
  if (ids.length && ids.every(id => id !== "") && new Set(ids).size === 1) result = ids[0];
}
return { writable: false, value: [result, "xsd:string"] };
