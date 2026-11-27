const paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase",
  "Device.WiFi.AccessPoint.1.Security.KeyPassphrase"
];

const discovered = paths.map(path => declare(path, { path: 1 }));
commit();
const names = [...new Set(discovered.flatMap(matches => Array.from(matches, item => item.path)))];
const rows = names.map(path => declare(path, { value: 1, writable: 1 }));
commit();

const target = rows.find(row => row.writable === true && row.value && row.value[0])
  || rows.find(row => row.writable === true);
let result = (target || rows.find(row => row.value && row.value[0]))?.value?.[0] || "";
if (args[1] && args[1].value) {
  if (!target) throw new Error("Parameter password WiFi yang dapat ditulis belum terbaca; refresh WLAN terlebih dahulu");
  result = String(args[1].value[0] || "");
  if (!/^(?:[\s\S]{8,63}|[0-9a-fA-F]{64})$/.test(result)) throw new Error("Password WPA harus 8-63 karakter atau 64 digit heksadesimal");
  declare(target.path, null, { value: result });
}

return { writable: Boolean(target), value: [result, "xsd:string"] };
