'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const { installFreshTemplate } = require('./ui-template');

const uiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_UI_PORT || 7568)}`;
const nbiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_NBI_PORT || 7557)}`;
const uiUsername = String(process.env.GENIEACS_UI_USERNAME || process.env.APP_ADMIN_USERNAME || 'admin');
const uiPassword = String(process.env.GENIEACS_UI_PASSWORD || process.env.APP_ADMIN_PASSWORD || '');
const cwmpUsername = String(process.env.GENIEACS_CWMP_AUTH_USERNAME || 'admin');
const cwmpPassword = String(process.env.GENIEACS_CWMP_AUTH_PASSWORD || '1sampai10');
const mongoUrl = String(process.env.GENIEACS_MONGODB_CONNECTION_URL || 'mongodb://127.0.0.1:27017/genieacs');
const assetsDir = path.join(__dirname, 'virtual-parameters');
// Exact hashes from released ancestry through v4.7.2 plus this candidate's
// canonical scripts. Retain these when updating a bundle; unknown same-name
// definitions belong to the owner, not to this installer.
const managedVirtualParameterHistory = {
  IPTR069: ['038c6def358e7374084fb335555fb03107a3aadd45909787ec8be34384f3c929', '297ea799e2bb4d896e671052a6b4b58fae0fa47fe4000fc67bd56d4e9559096f', '52c164501038186f5a4c4cd7cb7ca9fd3f735004070fb476f247ed02b6a8f00d', '80a317d81383a90798a7b74027d467b53a3fd0145af1b55312e059209fd4622c', '75df75617b5958c74c003cbc494af44f73ea8590bd3efe4de6ce7e8517b5e6d8'],
  LANActiveClients: ['4b864359160bb3d3637273620bf4c425e752a5e39ca517deda25df545e0eea7d', '7479ad46134e509059ad35bd2465c58be162e52d3116b3f12311f028005a4963', 'b4f8a8eff3995ceee145712c3f770403a5a9275cdf8d7f10f923f13dc87ad072'],
  LANClients: ['4b864359160bb3d3637273620bf4c425e752a5e39ca517deda25df545e0eea7d', '7479ad46134e509059ad35bd2465c58be162e52d3116b3f12311f028005a4963', 'b4f8a8eff3995ceee145712c3f770403a5a9275cdf8d7f10f923f13dc87ad072'],
  PonMac: ['35b25d3feaca7002b6056dffa8298bb58d0377e0353b779ad6f1e00af5a377fc', '6ebe0428e9054f977e82202bfc07a4e4cf31d29d3a8a7ced117763e45f93b932', '1e74f8198126adee0a46e47c596209565fa4e8a8467d23f86c1c2b274269d1e4'],
  RXPower: ['298335e28bfe8a96b974c6c113ba6abf3e0052c5f8ff28f86dddf88235c3d923', '3291f65458e6a1de4118a47c031daa00f179fbe1070d3a69ff02fd1a81198525', '7141e89d297680d39a8bc74ed72021fb22333cd7ee6d9a16d8e119fb0e47af77', 'bdc6017e4a3134e85a71488d176c80e211c12aae0e9a18323569a587e801f200'],
  WlanPassword: ['44a59f0ff26547ffa8ce1641fd18dce5c461e2beb89acf6bd190d5cbf615ed5b', '964fc6db1355192efea85b22c28cb7e882a234745488616fd9ab6294a596d1d6', 'c4600961ecbd76b683476389af03a6280df9d01b0d7766922505456824b48220', 'd207058f18945aac9c71dee4106c5b62ac93932c44e9577919a69674cf4a3d6e'],
  activedevices: ['8798cbf6d2207657b3b5c9b75f0815aebed7c3ae5a59faafc977376376b9898a', 'e0b12bf172f29fc752c87e82a58708ae7bae1d0165a6072827940a66c0f14a5f', 'f6446cb6b4bd805e3954b6316ed05466f74430aa415ac533d10578851654ab93', 'add84384e609d2a8ebdf58ba498eddd230a1e80c885d026529df361a432b8ac8'],
  getSerialNumber: ['062548162f3c377d5e92a77e5c46b1f368dbcf7cf88d52c7951c481db5eb293c', '100bca7f5d7214df7734aef0f8d00d593484f0f7f62910fed283932ee661b032', '7b6faeea751f8673dcc0014eecf34d24f448742b90395d21233fa077d4364cdc', '4130b4774a683cf6585d009f4ee7f17b2d814d85f8a87fb880752e8ccaf333c6', '3bc3a96b60fce0de6fbdb6af2ac10b2bbb715f1089faf10440076a359ac55bee'],
  getdeviceuptime: ['37e326f0430b0a27ac517b06dc6ad79461524f88286d63b8be77375b6068ce8d', '8986080e4a13580e7f4831b6c68b867bb872ab8e02ca4dcf53daa9ea4556e059', 'bf79f7b78b412bf69b07619d6c3ea517d1fe445637ae6d811a043d390e17f279'],
  getponmode: ['73601873563ed06c0bb8455ecfdb9e5fe650253ea8834dc559232ecdeba59964', 'c1292378265461b98e39a2f38d8831624f0f5e24115e399c79081f6b024d2f4c', 'fece84e9f6a33df9a2182eaecd6fb5c2e848ff56b7138536078c0053a37215be', 'f03f56db570d38d7ea21feb3fc5bb74aa3539f2f30052c5e1e7eb346b439da7c'],
  getpppuptime: ['2b370f8c9ad00cb060ee5c57177d5f7c1784cfa5ac6a531c5f83f7626eccca01', '30c180eb1e0d6229d2e95ef5a80047fcdb453c8443841b4af0777f4aaf6a620f', '2ebaf3190f4b56470c4c4cc6b84fb6a67fe81f2d2465f82012f0b541cdbd86f3'],
  gettemp: ['78b9f47763893aea157914ac71477001a1c45dfa580becf6373f085a455980dc', '80ca776b5a00b225fcc7b758cce7565e27494e5cb2c181740ea7ef2e1679588a', 'a1733c763be57c5b79d57a65c99d922ace80e29d39c56cda268733d27c917b2b', 'a2a601f00c719dd1d9e29aabb8dc92c6383929fd587f28bf714c0a97bca97d1d'],
  ip: ['94f0641814569d0f5ae2867b25a4003cdb595e7ababd7a301aa5ee8597cf2327', 'ab88110caec4c2fabdbaa460badf9dc11709706721cad565755267af2cb4a061', 'b2e10b5eebba5f117958ce1580d2a2d93baba99f0c84853bb4ce82d053e4dd4d'],
  pppoe: ['060497b397dc6546125955abd91b60253bad3a72ed6fd0e4d48657359368d9a6', '5b9c32023d093b793a6a1e6627413dcf08d36cd4210dd6c9a8fd889c3964594c', '7fb434233c58da007a9562df7c09bb475f842757046d0e9fbbf562fe622649f2'],
  pppoeIP: ['3fd50df4f55eac724227c242c6829576c399559e7be95cd12be6c7b128145a5d', 'a967b4f47d77767d53b8ec73ef6a070ff5aca4dd74e3dbccedc4b1a372007846', 'e9feca6c76dfcd9ca68a8aac8122365550ea9664737f46979df33d79712550a6', '1eb537ecbc49b0f47548ca853dcb81acc480d6e773609e0ceaecda7027a34f1d'],
  pppoeMac: ['75a53286990d24fe5d6e516217927284bd5c1c9916baf60ab62167d36c94910b', 'a911d75f02b8b47da1f2a04b308442c1581d730cbe2efe7984262184b23ebf62', '18c41248532235a034ef766c71578f3e6b2d981b1df5c5383b4dc2c28e8a5f12'],
  pppoePassword: ['47351647f95afad9bb1ad5b8a38302d6da8d5e069f1e8035ecf0b718ea6a20af', 'bb990396f78c511c341185fa2255db29fa8a6a60dc1f28cd9272af1439a7ef86', 'f9c040126c2c0ec8fcba814b1e35706aff08bf599a5030829f74535b58a26c8c', '09edc3787424708fbdf597307477aee74afcfd70016654016976b067b8fef752'],
  pppoeUsername: ['059bb01f256a5d8c63c1139422de8c038dbe9252fc4b12d53adaf60c08f0e339', '612818f5e17ba30a4f3f3d94b2a733411fe3763fc461fed39efad535cec7d281', '7dc644135a33e4985f9d5147373a66f251469667e022704ed5cf27291e4c7704', '889a8010462622f8ef9efa7f6d111ac31e94eedba27a2e959e212f13dab1b4aa'],
  pppoeUsername2: ['060497b397dc6546125955abd91b60253bad3a72ed6fd0e4d48657359368d9a6', '5b9c32023d093b793a6a1e6627413dcf08d36cd4210dd6c9a8fd889c3964594c', '7fb434233c58da007a9562df7c09bb475f842757046d0e9fbbf562fe622649f2'],
  superAdmin: ['15b6a287075574e5abc811e10f6e0fe62e3a0de8e685e33db2f519415a24c178', '17fb732671152d7905e8dd5079b4d4991031525d592bce74b9738c308619bc9d', 'eaf246dd88db96acac824fa5dbd5a43783feec816a1c74ac3a16bea519b3c9f5'],
  superPassword: ['b246856f515032a699f114a34d6978cd3bf707ace696da2589c269b83669cc62', 'f3433f589a26e8cda9330b5f52e2a12de2572ba817e2416185826f196fb85da2', 'fed46466f67ae8c54b9c6b628f034c9db2463e2f352482911fb1b0e4cdd415dc'],
  userAdmin: ['892e64028a3a9522ee1200334e4f2e74987564a5720e38b5e43d483771a1cc2b', 'a3be399e80a61e64303aae3de35a5cca264c2ca4f3d4010dbafc352d4f93b12e', 'c77c0b1747a7421f963db0f0888718bb75108168cbca381b0380465d246de563'],
  userPassword: ['5e05c30f4e08ee78999e59812f4845f44417a8ad4b8e2c53f90a61bd0bcf2e75', '9cebd1701089a8fe234eca4c67d75178d09471619289d4c4c8c7ea7e5e9bbe2d', 'ccf38c5b32ee8501619112354be6ef377edb9f5e6a93b958a7b4a8b4df7b1612'],
  wanVlan: ['3c41b2365df80affcc415af62574f71ccf77bf49e239b6839bea69b69a6e08da', '637cc93297677df9d8bb69324ec367af237eb5451d32578dc65bdc82d46750bf', '85e793e6829c092c2689e2ae85d3f8924ac7dc484607c45737b6574dacb40c0d'],
  wifiSsid24: ['7e20f1031480e02508e1530c357a4b1e34389ed47f7ad35ded22475b01c6d2e8', '522958c1d1f0f2373e15a23a707c7cb3d0c31b41e281468ea08f521a709535de'],
  wifiSsid5: ['36c7d92f0a09fc4756dd158e051430fc1d1985e48dea9cf3305c64c446270a71', 'a522121a9feffdc982db99ade478fe668afb399823104e6eb6191955d65cc708', '69c671a068d371cec2f5e2363fe1fd5b664d8c3b3c6f853487dcd1af044aca25']
};
const externalBootstrap = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_BOOTSTRAP_EXTERNAL || '').toLowerCase());
const autoProvisionSetting = process.env.GENIEACS_AUTO_VP_PROVISION;
const autoProvisionEnabled = autoProvisionSetting === undefined ? !externalBootstrap
  : ['1', 'true', 'yes', 'on'].includes(String(autoProvisionSetting).toLowerCase());
const dryRun = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_BOOTSTRAP_DRY_RUN || '').toLowerCase());
const informGuardOnly = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_INFORM_GUARD_ONLY || '').toLowerCase());
const backfillOnly = ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_BACKFILL_ONLY || '').toLowerCase());
const requestTimeoutMs = Math.max(1000, Number(process.env.GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS || 2500) || 2500);
const autoProvisionVirtualParameters = new Set([
  'IPTR069',
  'LANActiveClients',
  'LANClients',
  'PonMac',
  'RXPower',
  'activedevices',
  'getSerialNumber',
  'getdeviceuptime',
  'getponmode',
  'getpppuptime',
  'gettemp',
  'ip',
  'pppoe',
  'pppoeIP',
  'pppoeMac',
  'pppoeUsername',
  'pppoeUsername2',
  'wanVlan',
  'wifiSsid24',
  'wifiSsid5'
]);

const safeSummonButtonParameters = [
  'InternetGatewayDevice.DeviceInfo.*',
  'InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionStatus',
  'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.SSID',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Enable',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Status',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.BeaconType',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.Standard',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.X_ZTE-COM_OperatingFrequencyBand',
  'InternetGatewayDevice.X_ZTE-COM_PortBinding.*.LANInterface',
  'InternetGatewayDevice.X_ZTE-COM_PortBinding.*.WANInterface',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.BasicAuthenticationMode',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.BasicEncryptionModes',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.WPAAuthenticationMode',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.WPAEncryptionModes',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.IEEE11iAuthenticationMode',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.IEEE11iEncryptionModes',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.PreSharedKey.*',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.KeyPassphrase',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.X_HW_PreSharedKey',
  'InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.TotalAssociations',
  'InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel',
  'InternetGatewayDevice.X_HW_Security.FirewallLevel',
  'InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.*.X_FH_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_FH_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.*.X_GC_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_GC_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.X_HW_RMS.PonStatus.RXPower',
  'InternetGatewayDevice.X_HW_RMS.PonStatus.TransceiverTemperature',
  'Device.DeviceInfo.*',
  'Device.PPP.Interface.*.Username',
  'Device.PPP.Interface.*.ConnectionStatus',
  'Device.WiFi.SSID.*.SSID',
  'Device.WiFi.SSID.*.Enable',
  'Device.WiFi.AccessPoint.*.Security.*',
  'Device.WiFi.AccessPoint.*.AssociatedDeviceNumberOfEntries',
  'Device.Optical.Interface.*.RXPower',
  'Device.Optical.Interface.*.Temperature',
  'VirtualParameters.userAdmin',
  'VirtualParameters.userPassword',
  'VirtualParameters.superAdmin',
  'VirtualParameters.superPassword'
];

const safeSummonButtonBases = [
  'ui.device.1.components.0.parameters.0.components.2',
  'ui.index.2'
];

function mongoShell() {
  for (const command of ['mongosh', 'mongo']) {
    if (spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0) return { command, prefix: [] };
  }
  if (process.env.FAKENET_BUNDLED_GENIEACS === '1' || !externalBootstrap) {
    const prefix = ['exec', 'fakenet-billing-genieacs-mongodb', 'mongosh'];
    if (spawnSync('docker', [...prefix, '--version'], { stdio: 'ignore', timeout: 5000 }).status === 0) return { command: 'docker', prefix };
  }
  return null;
}

function runMongo(shell, script) {
  return spawnSync(shell.command, [...shell.prefix, '--quiet', mongoUrl, '--eval', script], { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs || requestTimeoutMs) || requestTimeoutMs));
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  }).finally(() => clearTimeout(timer));
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${url} HTTP ${response.status}: ${text.slice(0, 180)}`);
    error.status = response.status;
    throw error;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function waitForUi() {
  let lastError = null;
  const attempts = Math.max(1, Number(process.env.GENIEACS_UI_BOOTSTRAP_ATTEMPTS || 12) || 12);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await request(`${uiBase}/status`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError || new Error('GenieACS UI belum siap');
}

async function waitForNbi() {
  let lastError = null;
  const attempts = Math.max(1, Number(process.env.GENIEACS_NBI_BOOTSTRAP_ATTEMPTS || 6) || 6);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const devices = await request(`${nbiBase}/devices/?limit=1`);
      if (Array.isArray(devices)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('GenieACS NBI belum siap');
}

async function login(username, password) {
  const token = await request(`${uiBase}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return String(token || '').replace(/^"|"$/g, '');
}

async function loginAfterAccountChange(username, password) {
  const attempts = Math.max(1, Math.min(30, Number(process.env.GENIEACS_LOGIN_RETRY_ATTEMPTS || 12) || 12));
  const delay = Math.max(1, Math.min(5000, Number(process.env.GENIEACS_LOGIN_RETRY_DELAY_MS || 1000) || 1000));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await login(username, password); }
    catch (error) {
      if (![400, 401, 429, 503].includes(error.status) || attempt === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function uiPut(token, resource, body) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'PUT',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` },
    body: JSON.stringify(body)
  });
}

async function uiDelete(token, resource) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'DELETE',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` }
  });
}

async function bootstrapUser() {
  const init = await request(`${uiBase}/init`);
  let token;
  if (init?.users === true) {
    await request(`${uiBase}/init`, {
      method: 'POST',
      body: JSON.stringify({ users: true, presets: true, filters: true, device: true, index: true, overview: true })
    });
    token = await loginAfterAccountChange('admin', 'admin');
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}`, { roles: 'admin' });
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}/password`, { newPassword: uiPassword });
    token = await loginAfterAccountChange(uiUsername, uiPassword);
    if (uiUsername !== 'admin') await uiDelete(token, 'users/admin');
    return { token, initialized: true };
  }
  return { token: await login(uiUsername, uiPassword), initialized: false };
}

function virtualParameterScripts() {
  return fs.readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((file) => ({
      name: path.basename(file, '.js'),
      script: fs.readFileSync(path.join(assetsDir, file), 'utf8')
    }));
}

function virtualParameterName(row = {}) {
  return String(row._id || row.name || '');
}

function virtualParameterScript(row = {}) {
  return String(row.script || '');
}

function virtualParameterUpgradePlan(sourceRows = [], baselineRows = []) {
  const baseline = new Map(baselineRows.map(row => [virtualParameterName(row), row]));
  const writes = [], preserved = [];
  const expected = sourceRows.map(row => {
    const previous = baseline.get(row.name);
    if (previous && previous.script === row.script) return row;
    if (previous && (typeof previous.script !== 'string' ||
      !managedVirtualParameterHistory[row.name]?.includes(createHash('sha256').update(previous.script).digest('hex')))) {
      preserved.push(row.name);
      return { name: row.name, script: virtualParameterScript(previous) };
    }
    writes.push({ ...row, previousScript: previous ? previous.script : null });
    return row;
  });
  return { writes, expected, preserved };
}

async function readVirtualParametersViaNbi() {
  const rows = await request(`${nbiBase}/virtualParameters?projection=_id,script`);
  if (!Array.isArray(rows)) throw new Error('Daftar Virtual Parameters NBI tidak valid');
  return rows;
}

function readVirtualParametersViaMongo() {
  const command = mongoShell();
  if (!command) throw new Error('mongosh/mongo tidak tersedia untuk membaca Virtual Parameters');

  const script = 'print(JSON.stringify(db.getCollection("virtualParameters").find({}, { _id: 1, script: 1 }).toArray()))';
  const result = runMongo(command, script);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'baca Virtual Parameters via MongoDB gagal').trim());
  }
  const output = String(result.stdout || '').trim().split('\n').filter(Boolean).pop() || '[]';
  return JSON.parse(output);
}

async function installVirtualParametersViaNbi(rows = []) {
  for (const row of rows) {
    await request(`${nbiBase}/virtualParameters/${encodeURIComponent(row.name)}`, {
      method: 'PUT',
      body: JSON.stringify({ script: row.script })
    });
  }
}

function auditVirtualParameterDefinitions(sourceRows = [], currentRows = [], baselineRows = []) {
  const managedNames = new Set(sourceRows.map((row) => row.name));
  const sourceByName = new Map(sourceRows.map((row) => [row.name, row.script]));
  const currentByName = new Map(currentRows.map((row) => [virtualParameterName(row), virtualParameterScript(row)]));
  const baselineUnmanaged = baselineRows.filter((row) => !managedNames.has(virtualParameterName(row)));
  return {
    missing: sourceRows.map((row) => row.name).filter((name) => !currentByName.has(name)),
    changed: sourceRows.map((row) => row.name).filter((name) => currentByName.has(name) && currentByName.get(name) !== sourceByName.get(name)),
    unmanagedMissing: baselineUnmanaged.map(virtualParameterName).filter((name) => !currentByName.has(name)),
    unmanagedChanged: baselineUnmanaged.filter((row) => {
      const name = virtualParameterName(row);
      return currentByName.has(name) && currentByName.get(name) !== virtualParameterScript(row);
    }).map(virtualParameterName),
    managedCount: managedNames.size,
    unmanagedCount: currentRows.filter((row) => !managedNames.has(virtualParameterName(row))).length
  };
}

function verifyVirtualParameterDefinitions(sourceRows = [], currentRows = [], baselineRows = []) {
  const audit = auditVirtualParameterDefinitions(sourceRows, currentRows, baselineRows);
  const errors = [];
  if (audit.missing.length) errors.push(`parameter billing hilang: ${audit.missing.join(', ')}`);
  if (audit.changed.length) errors.push(`script parameter billing tidak sesuai: ${audit.changed.join(', ')}`);
  if (audit.unmanagedMissing.length) errors.push(`parameter existing hilang: ${audit.unmanagedMissing.join(', ')}`);
  if (audit.unmanagedChanged.length) errors.push(`parameter existing berubah: ${audit.unmanagedChanged.join(', ')}`);
  if (errors.length) throw new Error(`Verifikasi Virtual Parameters gagal: ${errors.join('; ')}`);
  process.stdout.write(`Verifikasi Virtual Parameters berhasil: managed=${audit.managedCount}, existing=${audit.unmanagedCount}.\n`);
  return audit;
}

async function installVirtualParametersViaUi(token, rows = []) {
  if (!token) throw new Error('Token UI GenieACS tidak tersedia');
  for (const row of rows) {
    await uiPut(token, `virtualParameters/${encodeURIComponent(row.name)}`, { script: row.script });
  }
}

function installVirtualParametersViaMongo(rows = []) {
  const command = mongoShell();
  if (!command) throw new Error('mongosh/mongo tidak tersedia untuk fallback Virtual Parameters');

  const script = [
    'const rows = ' + JSON.stringify(rows) + ';',
    'for (const row of rows) {',
    '  if (row.previousScript === null) db.getCollection("virtualParameters").updateOne({ _id: row.name }, { $setOnInsert: { script: row.script } }, { upsert: true });',
    '  else db.getCollection("virtualParameters").updateOne({ _id: row.name, script: row.previousScript }, { $set: { script: row.script } });',
    '}',
    'print("Virtual Parameters aktif: " + rows.map((row) => row.name).join(", "));'
  ].join('\n');
  const result = runMongo(command, script);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'fallback MongoDB gagal').trim());
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function evaluateCachedVirtualParameters(doc, sources, now = Date.now()) {
  const definitions = new Map(sources.map(row => [row.name, row.script]));
  const nodes = new Map(), cache = new Map(), active = new Set(), errors = [];
  function walk(node, path) {
    if (!node || typeof node !== 'object' || nodes.size >= 50000) return;
    if (path && (Object.hasOwn(node, '_value') || Object.hasOwn(node, '_object'))) nodes.set(path, node);
    for (const [key, value] of Object.entries(node)) if (!key.startsWith('_')) walk(value, path ? path + '.' + key : key);
  }
  walk(doc, '');
  for (const [key, value] of Object.entries({ID: doc._id, SerialNumber: doc._deviceId?._SerialNumber, ProductClass: doc._deviceId?._ProductClass, Manufacturer: doc._deviceId?._Manufacturer, OUI: doc._deviceId?._OUI})) {
    if (value !== undefined) nodes.set('DeviceID.' + key, {_value: value, _type: 'xsd:string', _writable: false});
  }
  function calculate(name) {
    if (cache.has(name)) return cache.get(name);
    if (active.has(name) || active.size >= 6 || !definitions.has(name)) return null;
    active.add(name);
    try {
      const declare = (pattern, timestamps = {}, writes) => {
        if (writes && Object.keys(writes).length) throw Error('Cache backfill cannot write native parameters');
        if (pattern.startsWith('VirtualParameters.') && !pattern.includes('*')) {
          const target = pattern.slice(18);
          if (target !== name && definitions.has(target)) calculate(target);
        }
        const regex = new RegExp('^' + pattern.split('.').map(part => part === '*' ? '[^.]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\.') + '$');
        const rows = [];
        for (const [path, node] of nodes) {
          if (!regex.test(path)) continue;
          const row = {path};
          if (timestamps?.value >= 1) row.value = Object.hasOwn(node, '_value') ? [node._value, node._type || 'xsd:string'] : undefined;
          if (timestamps?.writable >= 1) row.writable = node._writable;
          rows.push(row);
        }
        for (const key of ['path', 'value', 'writable']) Object.defineProperty(rows, key, {get: () => rows[0]?.[key]});
        Object.defineProperty(rows, 'size', {value: rows.length});
        return rows;
      };
      const result = new Function('declare', 'commit', 'args', 'log', definitions.get(name))(declare, () => {}, [{}, {}, {}, {}], () => {});
      if (!result || !Array.isArray(result.value) || result.value.length !== 2 || !/^xsd:(?:string|int|unsignedInt|boolean|dateTime)$/.test(result.value[1])) throw Error('Invalid virtual parameter result');
      const node = {_object: false, _timestamp: new Date(now), _type: result.value[1], _value: result.value[0], _writable: result.writable === true};
      cache.set(name, node);nodes.set('VirtualParameters.' + name, node);
      return node;
    } catch (error) {
      errors.push({name, message: String(error.message || error).replace(/[^a-zA-Z0-9 .:-]/g, '').slice(0, 160)});
      cache.set(name, null);return null;
    } finally { active.delete(name); }
  }
  const set = {};
  for (const {name} of sources) {
    const node = calculate(name);if (!node) continue;
    const old = doc.VirtualParameters?.[name];
    if (!old || !Object.hasOwn(old, '_value') || old._value !== node._value || old._type !== node._type || old._writable !== node._writable) set['VirtualParameters.' + name] = node;
  }
  return {set, errors};
}

function backfillVirtualParameterValuesViaMongo() {
  const command = mongoShell();
  if (!command) return;
  if (dryRun) { process.stdout.write('Audit backfill Virtual Parameters: cache modem dibaca tanpa permintaan CWMP.\n'); return; }
  // Run the same bundled VP code against cached leaves; do not maintain a
  // second set of vendor/VLAN/password selection rules in the installer.
  const script = [
    'const evaluate = ' + evaluateCachedVirtualParameters.toString() + ';',
    'const bundled = ' + JSON.stringify(virtualParameterScripts()) + ';',
    'const installed = new Map(db.getCollection("virtualParameters").find({}, { _id: 1, script: 1 }).toArray().map(row => [row._id, row.script]));',
    'const sources = bundled.filter(row => installed.get(row.name) === row.script);',
    'let updated = 0, failures = 0;',
    'if (sources.length) db.getCollection("devices").find({}).forEach(doc => {',
    '  const result = evaluate(doc, sources);',
    '  failures += result.errors.length;',
    '  if (Object.keys(result.set).length) { db.getCollection("devices").updateOne({_id: doc._id}, {$set: result.set}); updated++; }',
    '});',
    'print("Backfill Virtual Parameters devices: " + updated + ", errors: " + failures);'
  ].join('\n');
  const result = runMongo(command, script);
  if (result.status !== 0) {
    process.stderr.write(`Peringatan: backfill Virtual Parameters gagal: ${(result.stderr || result.stdout || '').trim()}\n`);
    return;
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function hardenSummonButtonsViaMongo() {
  const command = mongoShell();
  if (!command) return;

  // Full-root refreshes can purge cached WAN branches on some CPEs. Remove
  // only those read entries, never rebuild the owner's operational leaf list.
  const script = [
    'const bases = ' + JSON.stringify(safeSummonButtonBases) + ';',
    'const parameters = ' + JSON.stringify(safeSummonButtonParameters) + ';',
    'const fullRootReads = new Set(["", "Device", "Device.", "Device.*", "InternetGatewayDevice", "InternetGatewayDevice.", "InternetGatewayDevice.*"]);',
    'function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"); }',
    'function parameterIndex(id, base) {',
    '  const raw = String(id || "").slice(String(base || "").length + ".parameters.".length).split(".")[0];',
    '  const number = Number(raw);',
    '  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;',
    '}',
    'let changed = 0;',
    'let skipped = 0;',
    'for (const base of bases) {',
    '  const type = db.getCollection("config").findOne({ _id: base + ".type" });',
    '  if (!type || !["summon-button", "\'summon-button\'", \'"summon-button"\'].includes(String(type.value || "").trim())) { skipped += 1; continue; }',
    '  const paramRegex = new RegExp("^" + escapeRegex(base) + "\\\\.parameters\\\\.");',
    '  const existing = db.getCollection("config").find({ _id: paramRegex }).toArray()',
    '    .sort((a, b) => parameterIndex(a._id, base) - parameterIndex(b._id, base));',
    '  const roots = existing.filter(row => /^\\d+$/.test(String(row._id).slice(base.length + ".parameters.".length)) && typeof row.value === "string" && fullRootReads.has(row.value));',
    '  let removed = 0;',
    '  for (const row of roots) removed += db.getCollection("config").deleteOne({ _id: row._id, value: row.value }).deletedCount;',
    '  const remaining = roots.length ? db.getCollection("config").find({ _id: paramRegex }).toArray() : existing;',
    '  const indexed = [...existing, ...remaining];',
    '  const current = remaining.map((row) => String(row.value || ""));',
    '  if (indexed.some(row => !Number.isSafeInteger(parameterIndex(row._id, base)) || parameterIndex(row._id, base) >= Number.MAX_SAFE_INTEGER - parameters.length)) { if (removed) changed += 1; skipped += 1; continue; }',
    '  let next = indexed.reduce((index, row) => Math.max(index, parameterIndex(row._id, base) + 1), 0);',
    '  const missing = parameters.filter(value => !current.includes(value));',
    '  missing.forEach(value => {',
    '    db.getCollection("config").updateOne({ _id: base + ".parameters." + next++ }, { $setOnInsert: { value } }, { upsert: true });',
    '  });',
    '  if (missing.length || removed) changed += 1;',
    '}',
    'print("Summon GenieACS aman: changed=" + changed + ", skipped=" + skipped);'
  ].join('\n');
  if (dryRun) {
    process.stdout.write('Audit Summon GenieACS: hanya entri full-root dihapus; path operasional dan konfigurasi UI existing dipertahankan.\n');
    return;
  }
  const result = runMongo(command, script);
  if (result.status !== 0) {
    process.stderr.write(`Peringatan: hardening Summon GenieACS gagal: ${(result.stderr || result.stdout || '').trim()}\n`);
    return;
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function hardenHuaweiFirewallLevelUiViaMongo() {
  const command = mongoShell();
  if (!command) return;

  const firewallPath = 'InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel';
  const script = [
    'const firewallPath = ' + JSON.stringify(firewallPath) + ';',
    'const setKey = String.fromCharCode(36) + "set";',
    'function setValue(id, value) {',
    '  const op = {};',
    '  op[setKey] = { value };',
    '  db.getCollection("config").updateOne({ _id: id, value: "InternetGatewayDevice.X_HW_Security.FirewallLevel" }, op);',
    '}',
    'const targets = ["ui.device.3.components.15.parameters.0.components.0.parameters.0", "ui.device.3.components.15.parameters.1.parameter"];',
    'const existing = db.getCollection("config").find({ _id: { $in: targets } }).toArray();',
    'for (const row of existing) {',
    '  if (targets.includes(row._id) && row.value === "InternetGatewayDevice.X_HW_Security.FirewallLevel") setValue(row._id, firewallPath);',
    '}',
    'print("Alias Firewall Huawei diperiksa; label dan parameter UI custom dipertahankan.");'
  ].join('\n');
  if (dryRun) {
    process.stdout.write(`Audit Firewall Huawei UI: section Firewall akan diarahkan ke ${firewallPath}.\n`);
    return;
  }
  const result = runMongo(command, script);
  if (result.status !== 0) {
    process.stderr.write(`Peringatan: hardening Firewall Huawei UI gagal: ${(result.stderr || result.stdout || '').trim()}\n`);
    return;
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

function patchGenieacsFirewallDropdownUi() {
  const publicDirs = process.env.GENIEACS_PUBLIC_DIR
    ? [String(process.env.GENIEACS_PUBLIC_DIR)]
    : [
        '/usr/lib/node_modules/genieacs/public',
        '/opt/genieacs/node_modules/genieacs/public'
      ];
  const options = ['High', 'Medium', 'Low', 'Disable', 'User-Defined'];
  const targetPaths = [
    'InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel',
    'InternetGatewayDevice.X_HW_Security.FirewallLevel'
  ];

  const files = [...new Set(publicDirs
    .filter((publicDir) => fs.existsSync(publicDir))
    .flatMap((publicDir) => fs.readdirSync(publicDir)
      .filter((name) => /^app-[A-Z0-9]+\.js$/i.test(name))
      .map((name) => path.join(publicDir, name))))];

  let patched = false;
  for (const file of files) {
    let source = fs.readFileSync(file, 'utf8');
    if (source.includes('FAKENET_FIREWALL_DROPDOWN_PATCH')) {
      patched = true;
      continue;
    }

    const markerRegex = /function ([A-Za-z_$][\w$]*)\(e,t,n\)\{function r\(i\)\{i\.key==="Enter"\?t\(\):i\.key==="Escape"\?n\(\):i\.redraw=!1\}let s;if\(e\.parameterValues\[0\]\[2\]==="xsd:boolean"\)/;
    const match = source.match(markerRegex);
    if (!match) continue;

    const replacement = [
      `function ${match[1]}(e,t,n){/* FAKENET_FIREWALL_DROPDOWN_PATCH */function r(i){i.key==="Enter"?t():i.key==="Escape"?n():i.redraw=!1}let s;`,
      'if(' + JSON.stringify(targetPaths) + '.includes(e.parameterValues[0][0])){',
      'let i=' + JSON.stringify(options) + ',o=String(e.parameterValues[0][1]||"");',
      'i.includes(o)||i.unshift(o);',
      's=(0,q.default)("select",{value:o,onchange:a=>{a.redraw=!1,e.parameterValues[0][1]=s.dom.value},onkeydown:r,oncreate:a=>{a.dom.focus()}},i.map(a=>(0,q.default)("option",{value:a},a||"-")))',
      '}else if(e.parameterValues[0][2]==="xsd:boolean")'
    ].join('');

    const backup = `${file}.fakenet-firewall-dropdown.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    source = source.replace(markerRegex, replacement);
    fs.writeFileSync(file, source);
    patched = true;
    process.stdout.write(`Dropdown Firewall GenieACS aktif: ${path.basename(file)}.\n`);
  }

  if (!patched) process.stderr.write('Peringatan: patch dropdown Firewall GenieACS dilewati, pola UI bundle tidak ditemukan.\n');
  return patched;
}

async function installVirtualParameters(token, baselineRows = []) {
  const { writes, expected, preserved } = virtualParameterUpgradePlan(virtualParameterScripts(), baselineRows);
  if (preserved.length) process.stderr.write(`Peringatan: override Virtual Parameters existing dipertahankan (tanpa backfill): ${preserved.join(', ')}.\n`);
  let installed = false;
  try {
    await installVirtualParametersViaNbi(writes);
    installed = true;
  } catch (error) {
    process.stderr.write(`Peringatan: install Virtual Parameters via NBI gagal: ${error.message || error}\n`);
  }
  if (!installed && token) {
    try {
      await installVirtualParametersViaUi(token, writes);
      installed = true;
    } catch (error) {
      process.stderr.write(`Peringatan: install Virtual Parameters via UI gagal: ${error.message || error}\n`);
    }
  }
  try {
    if (writes.length) installVirtualParametersViaMongo(writes);
    installed = true;
  } catch (error) {
    if (!installed) throw error;
    process.stderr.write(`Peringatan: sinkronisasi Virtual Parameters via Mongo gagal: ${error.message || error}\n`);
  }
  let currentRows = [];
  try {
    currentRows = await readVirtualParametersViaNbi();
  } catch (error) {
    process.stderr.write(`Peringatan: verifikasi Virtual Parameters via NBI gagal, fallback Mongo: ${error.message || error}\n`);
    currentRows = readVirtualParametersViaMongo();
  }
  verifyVirtualParameterDefinitions(expected, currentRows, baselineRows);
  const declarations = expected
    .filter((row) => autoProvisionVirtualParameters.has(row.name))
    .map((row) => `declare("VirtualParameters.${row.name}", {value: daily});`)
    .join('\n');
  const provision = [
    'const daily = Date.now() - 86400000;',
    declarations
  ].join('\n');
  const presets = await request(`${nbiBase}/presets`);
  const previous = (presets || []).find(row => row._id === 'fakenet-virtual-parameters');
  const precondition = previous ? previous.precondition
    : autoProvisionEnabled ? '{}' : JSON.stringify({ _id: '__disabled_by_fakenet_billing__' });
  const configurations = [...(previous?.configurations || [])];
  if (!configurations.some(row => row.type === 'provision' && row.name === 'fakenet-virtual-parameters')) {
    configurations.push({ type: 'provision', name: 'fakenet-virtual-parameters', args: [] });
  }
  try {
    await request(`${nbiBase}/provisions/fakenet-virtual-parameters`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/javascript' },
      body: provision
    });
    await request(`${nbiBase}/presets/fakenet-virtual-parameters`, {
      method: 'PUT',
      body: JSON.stringify({
        ...(previous ? Object.fromEntries(Object.entries(previous).filter(([key]) => key !== '_id')) : {}),
        weight: previous?.weight ?? 10,
        precondition,
        configurations
      })
    });
  } catch (error) {
    throw new Error(`Provision Virtual Parameters gagal disimpan: ${error.message || error}`);
  }
  backfillVirtualParameterValuesViaMongo();
}

function destructiveRootClearProvisionNames(provisions = []) {
  return new Set((provisions || [])
    .filter((row) => /clear\(\s*["'](?:Device|InternetGatewayDevice)["']\s*,/i.test(String(row?.script || '')))
    .map((row) => String(row?._id || '').trim())
    .filter(Boolean));
}

function hardenInformProvisionScript(script = '') {
  let hardened = String(script || '');
  const staleWindows = [86400000, 300000, 60000, 3590000];
  for (const windowMs of staleWindows) {
    hardened = hardened.replace(
      new RegExp(`Date\\.now\\(\\s*${windowMs}\\s*\\)`, 'g'),
      `Date.now() - ${windowMs}`
    );
  }
  if (/ManagementServer\.ConnectionRequestPassword/.test(hardened)) {
    hardened = hardened.replace(
      /const\s+update\s*=\s*Date\.now\(\)\s*-\s*60000\s*;/g,
      'const update = Date.now() - 86400000;'
    );
  }
  // The stock informTime is an offset within a day, serialized as a date in
  // 1970. Several ZTE/OEM firmwares reject that optional value with 9007,
  // rolling back the other management parameters in the same 9003 response.
  // Only remove the stock writes; preserve owner-defined scheduling policies.
  const stockTimeDeclaration = /^[ \t]*const\s+informTime\s*=\s*daily\s*%\s*86400000\s*;[ \t]*(?:\r?\n|$)/gm;
  const stockInformTimeWrite = /^[ \t]*declare\(\s*(["'])(?:InternetGatewayDevice|Device)\.ManagementServer\.PeriodicInformTime\1\s*,\s*\{\s*value\s*:\s*daily\s*\}\s*,\s*\{\s*value\s*:\s*informTime\s*\}\s*\)\s*;[ \t]*(?:\r?\n|$)/gm;
  const stockTimeWrites = hardened.match(stockTimeDeclaration) ? [...hardened.matchAll(stockInformTimeWrite)].length : 0;
  if (stockTimeWrites) {
    hardened = hardened.replace(stockInformTimeWrite, '');
    if (!/\binformTime\b/.test(hardened.replace(stockTimeDeclaration, ''))) {
      hardened = hardened.replace(stockTimeDeclaration, '')
        .replace(/^[ \t]*\/\/ Unique inform offset per device for better load distribution[ \t]*(?:\r?\n|$)/gm, '');
    }
    hardened = '// FAKENET_INFORM_COMPAT: Preserve ONU scheduling time; retain the configured Inform interval.\n' + hardened;
  }
  const telemetryBlock = [
    '// FAKENET_ACTIVE_CLIENTS_BEGIN',
    'const fakenetActiveClientsRefresh = Date.now() - 15 * 60 * 1000;',
    'declare("VirtualParameters.IPTR069", { value: fakenetActiveClientsRefresh });',
    'declare("VirtualParameters.getponmode", { value: fakenetActiveClientsRefresh });',
    'declare("VirtualParameters.gettemp", { value: fakenetActiveClientsRefresh });',
    '// FAKENET_ACTIVE_CLIENTS_END'
  ].join('\n');
  hardened = hardened
    .replace(/\/\/ FAKENET_ACTIVE_CLIENTS_BEGIN[\s\S]*?\/\/ FAKENET_ACTIVE_CLIENTS_END/g, '')
    .trimEnd();
  hardened = `${hardened}\n\n${telemetryBlock}\n`;
  return hardened;
}

async function hardenInformProvision() {
  const provisions = await request(`${nbiBase}/provisions`);
  const inform = (Array.isArray(provisions) ? provisions : [])
    .find((row) => String(row?._id || '').trim() === 'inform');
  if (!inform || typeof inform.script !== 'string') return false;
  const hardened = hardenInformProvisionScript(inform.script);
  if (hardened === inform.script) return false;
  if (dryRun) {
    process.stdout.write('Audit provision inform: timestamp refresh terlalu agresif perlu diperbaiki.\n');
    return true;
  }
  await request(`${nbiBase}/provisions/inform`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/javascript' },
    body: hardened
  });
  process.stdout.write('Provision inform diamankan: refresh parameter manajemen dibatasi harian.\n');
  return true;
}

async function disableDestructiveRootClearPresets() {
  const [presets, provisions] = await Promise.all([
    request(`${nbiBase}/presets`),
    request(`${nbiBase}/provisions`)
  ]);
  const destructive = destructiveRootClearProvisionNames(provisions);
  if (!destructive.size) return [];
  const disabled = [];
  for (const preset of presets || []) {
    const presetName = String(preset?._id || '').trim();
    const invokesDestructiveProvision = (preset?.configurations || []).some((configuration) => (
      configuration?.type === 'provision' && destructive.has(String(configuration?.name || '').trim())
    ));
    if (!presetName || !invokesDestructiveProvision) continue;
    const disabledPrecondition = JSON.stringify({ _id: '__disabled_by_fakenet_billing__' });
    if (preset.precondition === disabledPrecondition) continue;
    const body = { ...preset, precondition: disabledPrecondition };
    delete body._id;
    await request(`${nbiBase}/presets/${encodeURIComponent(presetName)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    disabled.push(presetName);
  }
  if (disabled.length) {
    process.stdout.write(`Preset clear root destruktif dinonaktifkan: ${disabled.join(', ')}.\n`);
  }
  return disabled;
}

async function main() {
  if (backfillOnly) {
    try {
      await waitForNbi();
      await hardenInformProvision();
    } catch (error) {
      process.stderr.write(`Peringatan: guard provision inform dilewati: ${error.message || error}\n`);
    }
    backfillVirtualParameterValuesViaMongo();
    process.stdout.write('Backfill GenieACS selesai: Virtual Parameters diperbarui dari cache lokal.\n');
    return;
  }
  await waitForNbi();
  if (informGuardOnly) { await hardenInformProvision(); return; }
  const sourceRows = virtualParameterScripts();
  const baselineRows = await readVirtualParametersViaNbi();
  if (dryRun) {
    const plan = virtualParameterUpgradePlan(sourceRows, baselineRows);
    const audit = auditVirtualParameterDefinitions(plan.expected, baselineRows, baselineRows);
    process.stdout.write(`Audit Virtual Parameters (read-only): managed=${audit.managedCount}, existing=${audit.unmanagedCount}, missing=${audit.missing.length}, changed=${audit.changed.length}.\n`);
    if (audit.missing.length) process.stdout.write(`Parameter billing belum ada: ${audit.missing.join(', ')}.\n`);
    if (audit.changed.length) process.stdout.write(`Parameter billing perlu diperbarui: ${audit.changed.join(', ')}.\n`);
    if (plan.preserved.length) process.stdout.write(`Override existing dipertahankan: ${plan.preserved.join(', ')}.\n`);
    return;
  }
  let token = '';
  let initialized = false;
  if (externalBootstrap) {
    process.stdout.write('GenieACS existing terdeteksi: akun dan konfigurasi UI dipertahankan.\n');
  } else {
    if (!uiPassword || uiPassword.startsWith('CHANGE_ME_')) throw new Error('Password akun awal ACS belum disiapkan oleh installer');
    await waitForUi();
    ({ token, initialized } = await bootstrapUser());
    if (!token) throw new Error('Bootstrap akun GenieACS tidak menghasilkan sesi valid');
    if (initialized) {
      await uiPut(token, 'config/cwmp.auth', {
        value: `AUTH(${JSON.stringify(cwmpUsername)}, ${JSON.stringify(cwmpPassword)})`
      });
    }
    if (!await login(uiUsername, uiPassword)) throw new Error('Login akun GenieACS baru gagal diverifikasi');
  }
  await hardenInformProvision();
  await disableDestructiveRootClearPresets();
  hardenSummonButtonsViaMongo();
  hardenHuaweiFirewallLevelUiViaMongo();
  patchGenieacsFirewallDropdownUi();
  await installVirtualParameters(token, baselineRows);
  const template = await installFreshTemplate({
    initialized,
    summonParameters: safeSummonButtonParameters,
    read: () => request(`${uiBase}/api/config`, { headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` } }),
    put: (id, value) => uiPut(token, `config/${encodeURIComponent(id)}`, value),
    remove: id => uiDelete(token, `config/${encodeURIComponent(id)}`)
  });
  if (template.installed) process.stdout.write(`Template web GenieACS generik terverifikasi: v${template.version}, ${template.entries} konfigurasi.\n`);
  process.stdout.write(externalBootstrap ? 'Sinkron GenieACS selesai: Virtual Parameters terverifikasi; akun dan konfigurasi existing dipertahankan.\n'
    : 'Bootstrap GenieACS selesai: akun UI, autentikasi Inform, dan Virtual Parameters terverifikasi.\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bootstrap GenieACS gagal: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  virtualParameterUpgradePlan,
  hardenSummonButtonsViaMongo,
  installVirtualParametersViaMongo,
  destructiveRootClearProvisionNames,
  hardenHuaweiFirewallLevelUiViaMongo,
  hardenInformProvisionScript,
  evaluateCachedVirtualParameters,
  patchGenieacsFirewallDropdownUi,
  safeSummonButtonBases,
  safeSummonButtonParameters,
  main,
  mongoShell
};
