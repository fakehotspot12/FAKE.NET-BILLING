const paths = [
  "InternetGatewayDevice.DeviceInfo.XponInterface.MACAddress",
  "InternetGatewayDevice.DeviceInfo.XponInterface.PONMACAddress",
  "InternetGatewayDevice.DeviceInfo.XponInterface.PonMac",
  "InternetGatewayDevice.DeviceInfo.XponInterface.MAC",
  "InternetGatewayDevice.DeviceInfo.X_CU_SerialNumber",
  "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.MACAddress"
];

const discovered = paths.map(path => declare(path, { path: 1 }));
commit();
const names = [...new Set(discovered.flatMap(rows => Array.from(rows, row => row.path)))];
const values = names.map(path => declare(path, { value: 1 }));
commit();
let result = "";
for (const row of values) {
  const text = String(row.value && row.value[0] || "").trim();
  const mac = text.replace(/[^a-f0-9]/gi, "").toUpperCase();
  if (/^[A-F0-9]{12}$/.test(mac) && !/^0{12}$/.test(mac)) { result = text; break; }
}
return { writable: false, value: [result, "xsd:string"] };
