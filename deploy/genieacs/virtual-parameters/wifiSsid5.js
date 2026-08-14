const paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID",
  "Device.WiFi.SSID.5.SSID",
  "Device.WiFi.SSID.2.SSID"
];

function clean(value) {
  return String(value || "").trim();
}

let result = "";
for (const path of paths) {
  const rows = declare(path, { value: Date.now() - 86400000 });
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
