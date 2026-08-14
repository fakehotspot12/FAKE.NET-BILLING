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

let totalSecs = "";
if (args[1] && args[1].value) {
  totalSecs = args[1].value[0] || "";
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.*.Uptime", null, { value: totalSecs });
} else {
  const rows = declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.*.Uptime", {});
  for (const row of rows) {
    const value = row.value && row.value[0];
    if (value) {
      totalSecs = value;
      break;
    }
  }
}

return { writable: false, value: [uptimeText(totalSecs), "xsd:string"] };
