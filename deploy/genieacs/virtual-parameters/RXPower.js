const paths = [
  "InternetGatewayDevice.DeviceInfo.XponInterface.RXPower",
  "InternetGatewayDevice.DeviceInfo.XponInterface.RxPower",
  "InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.RXPower",
  "InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.RxPower",
  "InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_GC_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_GC_EponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_GC_WANPONInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_HW_EponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.X_HW_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.WANDevice.*.WANEthernetInterfaceConfig.X_ZTE-COM_RxPower",
  "InternetGatewayDevice.X_HW_RMS.PonStatus.RXPower",
  "Device.Optical.Interface.*.RXPower"
];

function normalize(value, path) {
  const text = String(value ?? "");
  let number = Number(text.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || [0, -255, 65535, 32767].includes(number)) return null;
  if (/dBm/i.test(text)) { /* Already expressed in engineering units. */ }
  else if (number > 0 && /(CMCC|CT-COM|CU|FH|GPON|EPON|WANPON|Optical|ZTE)/i.test(path)) {
    // Optical diagnostic counters are in 0.1 uW, not tenths of dBm.
    number = 10 * Math.log10(number / 10000);
  } else if (number < -100) number /= 100;
  else if (number > 0) return null;
  if (!Number.isFinite(number) || number < -60 || number > 10) return null;
  return Math.round(number * 100) / 100;
}

const knownPaths = paths.map(path => declare(path, { path: 1 }));
commit();
const cachedValues = knownPaths.map(rows => Array.from(rows, item => declare(item.path, { value: 1 })));
commit();

let result = null;
for (let index = 0; index < paths.length; index++) {
  const path = paths[index];
  const values = cachedValues[index];
  for (const item of values) {
    const normalized = normalize(item.value && item.value[0], item.path || path);
    if (normalized !== null) {
      result = normalized;
      break;
    }
  }
  if (result !== null) break;
}

return { writable: false, value: [result === null ? "" : String(result), "xsd:string"] };
