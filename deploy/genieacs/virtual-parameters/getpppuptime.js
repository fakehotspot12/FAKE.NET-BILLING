function uptimeText(totalSecs) {
  let seconds = Number(totalSecs || 0);
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const days = Math.floor(seconds / 86400);
  let rem = seconds % 86400;
  const hours = String(Math.floor(rem / 3600)).padStart(2, "0");
  rem %= 3600;
  const minutes = String(Math.floor(rem / 60)).padStart(2, "0");
  const secs = String(rem % 60).padStart(2, "0");
  return `${days}d ${hours}:${minutes}:${secs}`;
}

const paths = ["InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Uptime", "Device.PPP.Interface.*.Uptime"];
const declarations = paths.map(path => declare(path, { path: 1, value: 1 }));
commit();
let totalSecs = "";
for (const rows of declarations) {
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) { totalSecs = value; break; }
  }
  if (totalSecs !== "") break;
}
return { writable: false, value: [totalSecs === "" ? "" : uptimeText(totalSecs), "xsd:string"] };
