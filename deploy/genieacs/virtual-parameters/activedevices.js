const paths = [
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.TotalAssociations",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.WLAN_AssociatedDeviceNumberOfEntries",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.WLAN_AssociatedDeviceNumberOfEntries",
  "Device.WiFi.AccessPoint.*.AssociatedDeviceNumberOfEntries"
];

let total = 0;
for (const path of paths) {
  const rows = declare(path, {});
  for (const row of rows) {
    const value = Number(row.value && row.value[0]);
    if (Number.isFinite(value) && value > 0) total += value;
  }
}

return { writable: false, value: [String(total), "xsd:unsignedInt"] };
