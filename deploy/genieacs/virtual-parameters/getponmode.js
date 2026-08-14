let result = "";
if (args[1] && args[1].value) {
  result = args[1].value[0] || "";
  declare("InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode", { value: Date.now() });
} else {
  const rows = declare("InternetGatewayDevice.WANDevice.*.WANCommonInterfaceConfig.WANAccessType", { value: Date.now() });
  if (rows.size) result = rows.value[0] || "";
}

return { writable: false, value: [result, "xsd:string"] };
