const paths = [
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.MACAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.MACAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.2.MACAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.MACAddress"
];

let result = "";
for (const path of paths) {
  const rows = declare(path, {});
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value) {
      result = value;
      break;
    }
  }
  if (result) break;
}

return { writable: false, value: [result, "xsd:string"] };
