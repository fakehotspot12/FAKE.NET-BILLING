function hexToText(hex) {
  let text = "";
  for (let index = 0; index < hex.length; index += 2) {
    text += String.fromCharCode(parseInt(hex.substr(index, 2), 16));
  }
  return text;
}

function normalizeSerial(value) {
  const serial = String(value || "").trim();
  if (!serial || !/^[0-9A-Fa-f]+$/.test(serial) || serial.includes("40ee15")) return serial;
  const pon = declare("VirtualParameters.getponmode", {});
  let ponMode = "";
  for (const row of pon) {
    if (row.value && row.value[0]) {
      ponMode = String(row.value[0] || "");
      break;
    }
  }
  if (ponMode.includes("EPON")) return serial;
  if (serial.length < 12) return serial;
  return hexToText(serial.substr(0, 8)) + serial.substr(8);
}

let raw = "";
if (args[1] && args[1].value) {
  raw = args[1].value[0] || "";
  declare("DeviceID.SerialNumber", null, { value: raw });
} else {
  const paths = [
    "DeviceID.SerialNumber",
    "InternetGatewayDevice.DeviceInfo.SerialNumber",
    "Device.DeviceInfo.SerialNumber",
    "InternetGatewayDevice.DeviceInfo.XponInterface.SerialNumber",
    "InternetGatewayDevice.DeviceInfo.XponInterface.PonSerialNumber"
  ];
  for (const path of paths) {
    const rows = declare(path, {});
    for (const row of rows) {
      const value = row.value && row.value[0];
      if (value) {
        raw = value;
        break;
      }
    }
    if (raw) break;
  }
}

return { writable: false, value: [normalizeSerial(raw), "xsd:string"] };
