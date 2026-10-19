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

const usernamePaths = [
  "VirtualParameters.pppoeUsername",
  "VirtualParameters.pppoe",
  "VirtualParameters.pppoeUsername2",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username",
  "Device.PPP.Interface.*.Username"
];

function clean(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function validIp(value) {
  const text = clean(value);
  if (!text || text === "0.0.0.0" || text === "::") return "";
  const parts = text.split(".");
  if (parts.length !== 4) return text;
  return parts.every((part) => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  }) ? text : "";
}

function readFirstIp(rows) {
  for (const row of rows) {
    const value = validIp(row.value && row.value[0]);
    if (value) return value;
  }
  return "";
}

function readUsername() {
  for (const path of usernamePaths) {
    const rows = declare(path, {});
    for (const row of rows) {
      const value = clean(row.value && row.value[0]);
      if (value) return value;
    }
  }
  return "";
}

function readIpForUsername(username) {
  if (!username) return "";
  const rows = declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", {});
  for (const row of rows) {
    const value = clean(row.value && row.value[0]);
    if (value !== username || !row.path) continue;
    const base = row.path.replace(/\.Username$/, "");
    const candidatePaths = [
      base + ".ExternalIPAddress",
      base + ".X_HW_ExternalIPAddress",
      base + ".X_ZTE-COM_ExternalIPAddress",
      base + ".X_FH_ExternalIPAddress",
      base + ".IPAddress",
      base + ".IPCP.LocalIPAddress"
    ];
    for (const path of candidatePaths) {
      const ip = readFirstIp(declare(path, {}));
      if (ip) return ip;
    }
  }
  for (const row of declare("Device.PPP.Interface.*.Username", {})) {
    const value = clean(row.value && row.value[0]);
    if (value !== username || !row.path) continue;
    const base = row.path.replace(/\.Username$/, "");
    const ip = readFirstIp(declare(base + ".IPCP.LocalIPAddress", {}));
    if (ip) return ip;
  }
  return "";
}

let result = readIpForUsername(readUsername());
if (!result) {
  for (const path of paths) {
    result = readFirstIp(declare(path, {}));
    if (result) break;
  }
}

return { writable: false, value: [result || "", "xsd:string"] };
