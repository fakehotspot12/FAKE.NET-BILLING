const paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID",
  "Device.WiFi.SSID.5.SSID",
  "Device.WiFi.SSID.2.SSID"
];

const metadataPaths = ["InternetGatewayDevice.DeviceInfo.ProductClass", "Device.DeviceInfo.ProductClass", "InternetGatewayDevice.DeviceInfo.ModelName", "Device.DeviceInfo.ModelName"];
const declarations = new Map(metadataPaths.map(path => [path, declare(path, { path: 1, value: 1 })]));
commit();

function clean(value) {
  return String(value || "").trim();
}

function first(paths) {
  for (const path of paths) {
    const rows = declarations.get(path) || [];
    for (const row of rows) {
      const value = clean(row.value && row.value[0]);
      if (value) return value;
    }
  }
  return "";
}

const productClass = first([
  "InternetGatewayDevice.DeviceInfo.ProductClass",
  "Device.DeviceInfo.ProductClass",
  "InternetGatewayDevice.DeviceInfo.ModelName",
  "Device.DeviceInfo.ModelName"
]).toLowerCase();

if (/xpon\+1ge\+1fe\+wifi|1ge\+1fe\+wifi/.test(productClass) && !/5g|5ghz|5 ghz|dual|ac\d|ax\d|wifi6|wi-?fi 6/.test(productClass)) {
  return { writable: false, value: ["", "xsd:string"] };
}

for (const path of paths) declarations.set(path, declare(path, { path: 1, value: 1 }));
commit();

let result = "";
result = first(paths);

return { writable: false, value: [result || "", "xsd:string"] };
