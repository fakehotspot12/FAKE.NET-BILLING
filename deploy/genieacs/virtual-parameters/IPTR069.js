function validIp(value) {
  const text = String(value || "").trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".").map(Number);
    return parts.every(part => part <= 255) && parts[0] > 0 && parts[0] !== 127 && parts[0] < 224 ? text : "";
  }
  if (!/^[0-9a-f:]+$/i.test(text) || !text.includes(":")) return "";
  const halves = text.split("::"), parts = text.split(":").filter(Boolean);
  if (halves.length > 2 || parts.some(part => part.length > 4)) return "";
  if (halves.length === 1 ? parts.length !== 8 : parts.length >= 8) return "";
  return /^(?:0*:)*0*$/i.test(text) || /^(?:0*:)*0*1$/i.test(text) ? "" : text;
}

function hostFromUrl(value) {
  const match = String(value || "").trim().match(/^https?:\/\/(?:\[([^\]]+)\]|([^/:]+))/i);
  return match ? validIp(match[1] || match[2]) : "";
}

const connectionPaths = [
  "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
  "Device.ManagementServer.ConnectionRequestURL"
];
const addressPaths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress",
  "Device.IP.Interface.*.IPv4Address.*.IPAddress"
];
const knownPaths = connectionPaths.map(path => declare(path, { path: 1 }));
commit();
const connectionNames = knownPaths.map(rows => Array.from(rows, item => item.path));
const connectionValues = connectionNames.map(names => names.map(path => declare(path, { value: 1 })));
commit();

let result = "";
for (const rows of connectionValues) {
  for (const row of rows) {
    result = hostFromUrl(row.value && row.value[0]);
    if (result) break;
  }
  if (result) break;
}
if (!result) {
  const knownAddresses = addressPaths.map(path => declare(path, { path: 1 }));
  commit();
  const addressNames = knownAddresses.map(rows => Array.from(rows, item => item.path));
  const addresses = addressNames.map(names => names.map(path => ({
    address: declare(path, { value: 1 }),
    metadataPaths: declare(path.replace(/\.(?:ExternalIPAddress|IPv4Address\.\d+\.IPAddress)$/, ".*"), { path: 1 })
  })));
  commit();
  const metadataNames = ["Name", "Alias", "ConnectionType", "X_HW_SERVICELIST", "X_FH_ServiceList", "X_CT-COM_ServiceList", "X_CMCC_ServiceList", "X_ZTE-COM_ServiceList", "X_GC_ServiceList"];
  const metadataPaths = addresses.map(rows => rows.map(row => Array.from(row.metadataPaths, item => item.path).filter(path => metadataNames.includes(path.split(".").pop()))));
  const cachedValues = addresses.map((rows, i) => rows.map((row, j) => ({
    address: row.address,
    metadata: metadataPaths[i][j].map(path => declare(path, { value: 1 }))
  })));
  commit();
  for (const rows of cachedValues) {
    for (const row of rows) {
      const metadata = row.metadata.map(item => String(item.value && item.value[0] || "")).join(" ");
      if (!/TR[-_ ]?069|CWMP/i.test(metadata) || /bridge/i.test(metadata)) continue;
      result = validIp(row.address.value && row.address.value[0]);
      if (result) break;
    }
    if (result) break;
  }
}
return { writable: false, value: [result, "xsd:string"] };
