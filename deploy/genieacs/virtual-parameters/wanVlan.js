const paths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_HW_VLAN",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_ZTE-COM_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_FH_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_CMCC_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_CMCC_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_GC_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_GC_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_CT-COM_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.X_CT-COM_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_HW_VLAN",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_ZTE-COM_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_FH_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_CMCC_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_CMCC_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_GC_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_GC_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_CT-COM_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.X_CT-COM_VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_WANEponLinkConfig.VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_WANGponLinkConfig.VLANIDMark",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_WANEponLinkConfig.VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_WANGponLinkConfig.VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_VLANID",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.X_CT-COM_VLANIDMark",
  "Device.Ethernet.VLANTermination.*.VLANID"
];

function currentValue() {
  if (args[1] && args[1].value && args[1].value[0]) return args[1].value[0];
  return "";
}

function normalizeVlan(value) {
  const match = String(value || "").match(/(\d{1,4})/);
  const number = Number(match && match[1]);
  if (!Number.isInteger(number) || number < 1 || number > 4094) return "";
  return String(number);
}

let result = normalizeVlan(currentValue());
if (!result) {
  for (const path of paths) {
    const values = declare(path, {});
    for (const item of values) {
      result = normalizeVlan(item.value && item.value[0]);
      if (result) break;
    }
    if (result) break;
  }
}

return { writable: false, value: [result || "", "xsd:unsignedInt"] };
