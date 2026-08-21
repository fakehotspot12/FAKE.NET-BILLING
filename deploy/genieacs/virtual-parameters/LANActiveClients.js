const paths = [
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.*.AssociatedDeviceNumberOfEntries",
  "Device.Ethernet.Interface.*.AssociatedDeviceNumberOfEntries"
];

let total = 0;
for (const path of paths) {
  const rows = declare(path);
  for (const row of rows) {
    const value = Number(row.value && row.value[0]);
    if (Number.isFinite(value) && value > 0) total += value;
  }
}

return { writable: false, value: [String(total), "xsd:unsignedInt"] };
