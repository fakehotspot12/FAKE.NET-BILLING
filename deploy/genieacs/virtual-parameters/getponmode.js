const refresh = Date.now() - 24 * 60 * 60 * 1000;
const paths = [
  "InternetGatewayDevice.DeviceInfo.XponInterface.PonMode",
  "InternetGatewayDevice.DeviceInfo.XponInterface.Mode",
  "InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode",
  "InternetGatewayDevice.WANDevice.*.WANCommonInterfaceConfig.WANAccessType"
];

function normalize(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text.includes("EPON")) return "EPON";
  if (text.includes("GPON")) return "GPON";
  if (text === "ETHERNET") return "Ethernet";
  return "";
}

function readFirst(path) {
  for (const row of declare(path, { path: refresh, value: refresh })) {
    const value = row.value && row.value[0];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

let result = "";
for (const path of paths) {
  result = normalize(readFirst(path));
  if (result) break;
}

if (!result) {
  const manufacturer = readFirst("DeviceID.Manufacturer").toUpperCase();
  const model = readFirst("DeviceID.ProductClass");
  const knownGponModel = /^(?:EG8141A5|EG8141H5|EG8145V5|EG8021V5|EG8041V5|HG8145V5|HG8245A|HG8245H|HG8245H5|HG8245V5|HG8245W5-6T|HG8546M|HG6145D2|HG6145F1?|HG6243C|HG6245N|F609|ZXHN F609|F660|F670L?|F672Y|H1S-3)$/i.test(model);
  const knownOntVendor = /HUAWEI|FIBERHOME|ZTE|CMDC/.test(manufacturer);
  if (knownOntVendor && knownGponModel) result = "GPON";
}

return { writable: false, value: [result, "xsd:string"] };
