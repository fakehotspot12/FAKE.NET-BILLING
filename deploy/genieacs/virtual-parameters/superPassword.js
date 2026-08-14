const paths = [
  "InternetGatewayDevice.X_CU_Function.Web.AdminPassword",
  "InternetGatewayDevice.UserInterface.X_ZTE-COM_WebUserInfo.AdminPassword",
  "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.2.Password",
  "InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.Password",
  "InternetGatewayDevice.DeviceInfo.X_FH_Account.X_FH_WebUserInfo.WebSuperPassword",
  "InternetGatewayDevice.User.1.Password",
  "InternetGatewayDevice.X_Authentication.WebAccount.Password",
  "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password",
  "InternetGatewayDevice.X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.AdminPassword"
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
