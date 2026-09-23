const refresh = Date.now() - 15 * 60 * 1000;
const paths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress",
  "Device.IP.Interface.*.IPv4Address.*.IPAddress"
];

function readFirstIp(rows) {
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value && value !== "0.0.0.0") return value;
  }
  return "";
}

function hostFromUrl(value) {
  const match = String(value || "").trim().match(/^https?:\/\/(?:\[([^\]]+)\]|([^/:]+))/i);
  return match ? String(match[1] || match[2] || "").trim() : "";
}

function readConnectionRequestIp() {
  const rows = declare("InternetGatewayDevice.ManagementServer.ConnectionRequestURL", { value: refresh });
  for (const row of rows) {
    const result = hostFromUrl(row.value && row.value[0]);
    if (result && result !== "0.0.0.0") return result;
  }
  return "";
}

let result = readConnectionRequestIp();
if (!result) {
  for (const path of paths) {
    result = readFirstIp(declare(path, { path: refresh, value: refresh }));
    if (result) break;
  }
}

return { writable: false, value: [result || "", "xsd:string"] };
