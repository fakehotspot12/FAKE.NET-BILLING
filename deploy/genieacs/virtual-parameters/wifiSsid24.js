const paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID",
  "Device.WiFi.SSID.1.SSID",
  "Device.WiFi.SSID.2.SSID"
];

const declarations = new Map(paths.map(path => [path, declare(path, { path: 1, value: 1 })]));
commit();

function clean(value) {
  return String(value || "").trim();
}

let result = "";
for (const path of paths) {
  const rows = declarations.get(path) || [];
  for (const row of rows) {
    const value = clean(row.value && row.value[0]);
    if (value) {
      result = value;
      break;
    }
  }
  if (result) break;
}

return { writable: false, value: [result || "", "xsd:string"] };
