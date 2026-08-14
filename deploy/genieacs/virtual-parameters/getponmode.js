let result = "";
if (args[1] && args[1].value) {
  result = args[1].value[0] || "";
  declare("InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode", {});
} else {
  const paths = [
    "InternetGatewayDevice.DeviceInfo.XponInterface.PonMode",
    "InternetGatewayDevice.DeviceInfo.XponInterface.Mode",
    "InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode",
    "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.WANAccessType",
    "InternetGatewayDevice.WANDevice.2.WANCommonInterfaceConfig.WANAccessType",
    "InternetGatewayDevice.WANDevice.*.WANCommonInterfaceConfig.WANAccessType"
  ];
  for (const path of paths) {
    const rows = declare(path, {});
    for (const row of rows) {
      const value = row.value && row.value[0];
      if (value) {
        result = value;
        break;
      }
    }
    if (result) break;
  }
}

return { writable: false, value: [result, "xsd:string"] };
