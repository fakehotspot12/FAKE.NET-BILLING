const paths = [
  "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.*.AssociatedDeviceNumberOfEntries",
  "Device.Ethernet.Interface.*.AssociatedDeviceNumberOfEntries"
];
const declarations = paths.map(path => declare(path, { path: 1, value: 1 }));
commit();
let total = 0, known = false;
for (const rows of declarations) for (const row of rows) {
  const value = row.value && row.value[0];
  if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) { known = true; total += Number(value); }
}
return { writable: false, value: [known ? String(total) : "", "xsd:string"] };
