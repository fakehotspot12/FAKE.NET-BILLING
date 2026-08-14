const paths = [
  "InternetGatewayDevice.X_CU_Function.Web.UserName",
  "InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo.UserName",
  "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.UserName",
  "InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo.WebUsername",
  "InternetGatewayDevice.User.2.Username",
  "InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserName"
];

let result = "";
if (args[1] && args[1].value) {
  result = args[1].value[0] || "";
  for (const path of paths) declare(path, null, { value: result });
} else {
  for (const path of paths) {
    const rows = declare(path, { value: Date.now() });
    if (rows.size && rows.value[0]) {
      result = rows.value[0];
      break;
    }
  }
}

return { writable: true, value: [result, "xsd:string"] };
