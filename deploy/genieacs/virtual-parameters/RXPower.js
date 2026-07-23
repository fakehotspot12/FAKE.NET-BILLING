const paths = [
  "InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower",
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
  let number = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || [0, -255, 255, 65535, 32767].includes(number)) return null;
  if (/ZTE/i.test(path) && number > 0 && number < 1000) number = -number / 10;
  else if (number > 0 && /(CMCC|CT-COM|CU|FH|GPON|EPON|WANPON|Optical)/i.test(path)) {
    number = 30 + (Math.log10(number * Math.pow(10, -7)) * 10);
  } else if (number < -100 || number > 100) number /= 100;
  if (!Number.isFinite(number) || number < -60 || number > 10) return null;
  return Math.round(number * 100) / 100;
}

let result = null;
for (const path of paths) {
  const values = declare(path, { value: Date.now() });
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
