const paths = [
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Password",
  "Device.PPP.Interface.*.Password"
];

const selected = declare("VirtualParameters.pppoeUsername", { path: 1, value: 1 });
const discovered = paths.map(path => declare(path, { path: 1 }));
commit();
const names = [...new Set(discovered.flatMap(matches => Array.from(matches, item => item.path)))];
const rows = names.map(path => ({ parameter: declare(path, { value: 1, writable: 1 }),
  username: declare(path.replace(/\.Password$/, ".Username"), { value: 1 }) }));
commit();
const username = selected?.value?.[0] || "";
const candidates = username ? rows.filter(row => row.username?.value?.[0] === username && row.parameter.writable === true) : [];
const target = candidates.length === 1 ? candidates[0].parameter : null;
let result = target?.value?.[0] || "";
if (args[1] && args[1].value) {
  if (!target) throw new Error("WAN PPPoE utama belum pasti; pilih parameter Password pada WAN yang dituju");
  result = String(args[1].value[0] || "");
  if (!result) throw new Error("Password PPPoE wajib diisi");
  declare(target.path, null, { value: result });
}

return { writable: Boolean(target), value: [result, "xsd:string"] };
