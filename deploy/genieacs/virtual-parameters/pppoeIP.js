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

function currentValue() {
  if (args[1] && args[1].value && args[1].value[0]) return args[1].value[0];
  return "";
}

function readFirstIp(rows) {
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value && value !== "0.0.0.0") return value;
  }
  return "";
}

let result = currentValue();
if (!result || result === "0.0.0.0") {
  for (const path of paths) {
    result = readFirstIp(declare(path, {}));
    if (result) break;
  }
}

return { writable: false, value: [result || "", "xsd:string"] };
