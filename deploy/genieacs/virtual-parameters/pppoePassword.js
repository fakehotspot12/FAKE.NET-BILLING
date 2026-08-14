const paths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Password",
  "Device.PPP.Interface.*.Password"
];

let result = "";
if (args[1] && args[1].value) {
  result = args[1].value[0] || "";
  for (const path of paths) declare(path, null, { value: result });
} else {
  for (const path of paths) {
    const rows = declare(path, { value: Date.now() });
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
