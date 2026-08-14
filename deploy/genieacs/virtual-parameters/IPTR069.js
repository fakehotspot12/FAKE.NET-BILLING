const paths = [
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.2.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.3.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.4.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.2.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANIPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.5.WANIPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress",
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

function readFirstText(rows) {
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

let result = currentValue();
if (!result || result === "0.0.0.0") {
  for (const path of paths) {
    if (path.includes("ExternalIPAddress")) {
      const connectionType = declare(path.replace("ExternalIPAddress", "ConnectionType"), {});
      if (readFirstText(connectionType).toLowerCase() === "bridge") continue;
    }
    result = readFirstIp(declare(path, {}));
    if (result) break;
  }
}

return { writable: false, value: [result || "", "xsd:string"] };
