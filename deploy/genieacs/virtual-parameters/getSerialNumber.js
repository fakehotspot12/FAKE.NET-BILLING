function normalizeSerial(value) {
  const serial = String(value || "").trim();
  if (!/^[0-9a-f]{16}$/i.test(serial)) return serial;
  let vendor = "";
  for (let index = 0; index < 8; index += 2) {
    vendor += String.fromCharCode(parseInt(serial.substr(index, 2), 16));
  }
  return /^[A-Z]{4}$/.test(vendor) ? vendor + serial.substr(8).toUpperCase() : serial;
}

const paths = [
  "DeviceID.SerialNumber",
  "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "Device.DeviceInfo.SerialNumber",
  "InternetGatewayDevice.DeviceInfo.X_HW_SerialNumber",
  "InternetGatewayDevice.DeviceInfo.XponInterface.SerialNumber",
  "InternetGatewayDevice.DeviceInfo.XponInterface.PonSerialNumber"
];
const knownPaths = paths.map(path => declare(path, { path: 1 }));
commit();
const cachedValues = knownPaths.map(rows => Array.from(rows, item => declare(item.path, { value: 1 })));
commit();

let result = "";
for (const rows of cachedValues) {
  for (const row of rows) {
    const value = normalizeSerial(row.value && row.value[0]);
    if (value) { result = value; break; }
  }
  if (result) break;
}
return { writable: false, value: [result, "xsd:string"] };
