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
  const pon = declare("VirtualParameters.getponmode", { value: Date.now() });
  if (pon.size && String(pon.value[0] || "").includes("EPON")) return serial;
  if (serial.length < 12) return serial;
  return hexToText(serial.substr(0, 8)) + serial.substr(8);
}

let raw = "";
if (args[1] && args[1].value) {
  raw = args[1].value[0] || "";
  declare("DeviceID.SerialNumber", null, { value: raw });
} else {
  const rows = declare("DeviceID.SerialNumber", { value: Date.now() });
  raw = rows.value && rows.value[0] || "";
}

return { writable: false, value: [normalizeSerial(raw), "xsd:string"] };
