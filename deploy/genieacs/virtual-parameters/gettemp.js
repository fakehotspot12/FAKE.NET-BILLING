const paths = [
  "InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature",
  "InternetGatewayDevice.WANDevice.*.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature",
  "InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_FH_EponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_HW_EponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.WANDevice.*.X_HW_GponInterfaceConfig.TransceiverTemperature",
  "InternetGatewayDevice.X_HW_RMS.PonStatus.TransceiverTemperature",
  "InternetGatewayDevice.X_HW_RMS.PonStatus.Temperature",
  "Device.Optical.Interface.*.Temperature",
  "Device.Optical.Interface.*.TransceiverTemperature",
  "InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureSensor.*.Value",
  "Device.DeviceInfo.TemperatureStatus.TemperatureSensor.*.Value"
];

function convertRaw(value) {
  const samples = [[11509, 45], [11876, 46], [10866, 42], [10592, 41], [11142, 43], [11968, 46]];
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const sample of samples) {
    sumX += sample[0];
    sumY += sample[1];
    sumXY += sample[0] * sample[1];
    sumX2 += sample[0] * sample[0];
  }
  const slope = ((samples.length * sumXY) - (sumX * sumY)) / ((samples.length * sumX2) - (sumX * sumX));
  return (slope * value) + ((sumY - (slope * sumX)) / samples.length);
}

function normalize(value) {
  let number = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number) || [0, -255, 255, 65535, 32767].includes(number)) return null;
  if (number > 1000 && number < 20000) number = convertRaw(number);
  else if (number > 150 && number <= 1000) number /= 10;
  if (!Number.isFinite(number) || number < 5 || number > 120) return null;
  return Math.round(number);
}

let result = null;
for (const path of paths) {
  const values = declare(path, { value: Date.now() });
  for (const item of values) {
    const normalized = normalize(item.value && item.value[0]);
    if (normalized !== null) {
      result = normalized;
      break;
    }
  }
  if (result !== null) break;
}

return { writable: false, value: [result === null ? "" : String(result), "xsd:string"] };
