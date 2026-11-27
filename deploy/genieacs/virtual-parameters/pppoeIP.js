const paths = [
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.2.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.5.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress",
  "Device.PPP.Interface.*.IPCP.LocalIPAddress",
  "Device.IP.Interface.1.IPv4Address.1.IPAddress"
];

const usernamePaths = ["VirtualParameters.pppoeUsername", "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", "Device.PPP.Interface.*.Username"];
const metadata = ["ConnectionStatus", "Name", "X_HW_SERVICELIST", "X_ZTE-COM_ServiceList", "X_CT-COM_ServiceList", "X_FH_ServiceList"];
const patterns = [...paths.filter(path => !path.startsWith("Device.IP.")), ...usernamePaths, ...metadata.map(key => "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*." + key)];
const declarations = patterns.map(path => declare(path, { path: 1, value: 1 }));
commit();
const values = new Map();
for (const rows of declarations) for (const row of rows) if (row.value) values.set(row.path, row.value[0]);
const clean = value => String(value ?? "").trim();
function validIp(value) {
  const ip = clean(value), parts = ip.split(".");
  if (parts.length === 4) return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) && parts.every(part => Number(part) <= 255) && Number(parts[0]) > 0 && Number(parts[0]) !== 127 && Number(parts[0]) < 224 ? ip : "";
  return /^[0-9a-f:]+$/i.test(ip) && ip.includes(":") && !/^(?:::|::1)$/.test(ip) ? ip : "";
}
const preferred = clean(values.get("VirtualParameters.pppoeUsername")), bases = [];
for (const [path, value] of values) if (/\.Username$/.test(path) && !path.startsWith("VirtualParameters.")) {
  const base = path.replace(/\.Username$/, "");
  bases.push({base, username: clean(value), connected: /^(?:connected|up)$/i.test(clean(values.get(base + ".ConnectionStatus")))});
}
const matching = preferred ? bases.filter(row => row.username === preferred) : [];
const selected = matching.length ? matching : bases.filter(row => row.connected);
const ips = [...new Set(selected.map(row => validIp(values.get(row.base + ".ExternalIPAddress") ?? values.get(row.base + ".IPCP.LocalIPAddress"))).filter(Boolean))];
let result = ips.length === 1 ? ips[0] : "";
if (!selected.length) {
  const fallback = [...new Set([...values].filter(([path]) => /\.(?:ExternalIPAddress|IPCP\.LocalIPAddress)$/.test(path)).map(([,value]) => validIp(value)).filter(Boolean))];
  if (fallback.length === 1) result = fallback[0];
}
return { writable: false, value: [result, "xsd:string"] };
