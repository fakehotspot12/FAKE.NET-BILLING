const paths = [
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.1.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.2.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.3.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.4.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.5.Username",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username",
  "Device.PPP.Interface.*.Username"
];

let result = "";
if (args[1] && args[1].value) {
  result = args[1].value[0] || "";
  for (const path of paths) declare(path, null, { value: result });
} else {
  for (const path of paths) {
    const rows = declare(path, { path: Date.now() - 120000, value: Date.now() });
    for (const row of rows) {
      const value = row.value && row.value[0];
      if (value) {
        result = value;
        break;
      }
    }
    if (result) break;
  }
}

return { writable: true, value: [result, "xsd:string"] };
