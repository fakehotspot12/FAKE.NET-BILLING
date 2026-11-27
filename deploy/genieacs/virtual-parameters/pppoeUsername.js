const paths = [
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.1.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.2.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.3.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.4.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.5.Username",
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username",
  "Device.PPP.Interface.*.Username"
];

const discovered = paths.map(path => declare(path, { path: 1 }));
commit();
const names = [...new Set(discovered.flatMap(matches => Array.from(matches, item => item.path)))];
const rows = names.map(path => {
  const base = path.replace(/\.Username$/, "");
  return {
    parameter: declare(path, { value: 1, writable: 1 }),
    status: declare(base + ".ConnectionStatus", { value: 1 }),
    name: declare(base + ".Name", { value: 1 }),
    services: ["X_HW_SERVICELIST", "X_ZTE-COM_ServiceList", "X_CT-COM_ServiceList", "X_FH_ServiceList"].map(key => declare(base + "." + key, { value: 1 })),
    vlans: ["X_HW_VLAN", "X_ZTE-COM_VLANID", "X_CT-COM_VLANID", "VLANID"].map(key => declare(base + "." + key, { value: 1 }))
  };
});
commit();
const value = row => row?.value?.[0] ?? "";
const eligible = rows.filter(row => !/tr-?069|management|acs/i.test([value(row.name), ...row.services.map(value)].join(" "))
  && !row.vlans.some(vlan => [100, 1111].includes(Number(value(vlan)))));
const connected = eligible.filter(row => String(value(row.status)).toLowerCase() === "connected" && value(row.parameter));
const candidates = connected.length ? connected : eligible.filter(row => value(row.parameter));
const target = candidates.length === 1 && candidates[0].parameter.writable === true ? candidates[0].parameter : null;
const combinedInternet = rows.filter(row => value(row.parameter) && /internet/i.test([value(row.name), ...row.services.map(value)].join(" ")) && !row.vlans.some(vlan => [100, 1111].includes(Number(value(vlan)))));
let result = value(target || candidates[0]?.parameter || combinedInternet[0]?.parameter);
if (args[1] && args[1].value) {
  if (!target) throw new Error("WAN PPPoE utama belum pasti; pilih parameter Username pada WAN yang dituju");
  result = String(args[1].value[0] || "").trim();
  if (!result) throw new Error("Username PPPoE wajib diisi");
  declare(target.path, null, { value: result });
}

return { writable: Boolean(target), value: [result, "xsd:string"] };
