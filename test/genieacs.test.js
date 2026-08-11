'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const genieAcs = require('../src/genieacs');
const genieAcsWan = require('../src/genieacs-wan');
const genieAcsWifi = require('../src/genieacs-wifi');

test('builds a compact GenieACS paging projection and suffix exclusion query', () => {
  const settings = genieAcs.normalizeSettings({
    usernameParameters: ['VirtualParameters.pppoeUsername'],
    rxPowerParameters: ['VirtualParameters.RXPower'],
    excludeUsernameSuffixes: ['@internal']
  });
  const projection = genieAcs._internal.deviceSummaryProjection(settings);
  const query = genieAcs._internal.usernameSuffixExclusionQuery(settings);

  assert.match(projection, /_id/);
  assert.match(projection, /_lastInform/);
  assert.match(projection, /WANPPPConnection\.1\.Username/);
  assert.doesNotMatch(projection, /DeviceInfo\.Manufacturer/);
  assert.ok(Array.isArray(query.$nor));
  assert.ok(query.$nor.length >= 1);
  assert.equal(query.$nor[0]['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value'].$regex, '@internal$');
});

test('normalizes GenieACS device wifi and optical parameters', () => {
  const lastInform = new Date().toISOString();
  const device = genieAcs.normalizeDevice({
    _id: 'dev-1',
    _deviceId: {
      _Manufacturer: 'FiberHome',
      _ProductClass: 'HG6245D',
      _SerialNumber: 'FH123'
    },
    _lastInform: lastInform,
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          WANConnectionDevice: {
            1: {
              WANPPPConnection: {
                1: { Username: { _value: 'pppoe-test' } }
              }
            }
          },
          X_HW_EponInterfaceConfig: {
            RXPower: { _value: '-21.37' }
          }
        }
      },
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: {
              SSID: { _value: 'FAKE-2G' },
              PreSharedKey: {
                1: { KeyPassphrase: { _value: 'password2g', _writable: true } }
              },
              TotalAssociations: { _value: '3' }
            },
            5: {
              SSID: { _value: 'FAKE-5G' },
              PreSharedKey: {
                1: { KeyPassphrase: { _value: 'password5g', _writable: true } }
              },
              TotalAssociations: { _value: '2' }
            }
          }
        }
      }
    }
  }, {});

  assert.equal(device.username, 'pppoe-test');
  assert.equal(device.rxPowerText, '-21,37 dBm');
  assert.equal(device.ssid24, 'FAKE-2G');
  assert.equal(device.ssid5, 'FAKE-5G');
  assert.equal(device.lastInform, lastInform);
  assert.equal(device.wifiClients24, 3);
  assert.equal(device.wifiClients5, 2);
  assert.equal(device.wifiClientsTotal, 5);
  assert.equal(device.wifiNetworks.length, 2);
  assert.equal(device.wifiNetworks[0].ssidParameter, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID');
  assert.equal(device.wifiNetworks[0].passwordParameter, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase');
});

test('normalizes GenieACS temperature from virtual and raw parameters', () => {
  const virtualTemp = genieAcs.normalizeDevice({
    _id: 'temp-virtual',
    VirtualParameters: {
      gettemp: { _value: '45' }
    }
  }, {});
  const rawTemp = genieAcs.normalizeDevice({
    _id: 'temp-raw',
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          X_CMCC_EponInterfaceConfig: {
            TransceiverTemperature: { _value: '14060' }
          }
        }
      }
    }
  }, {});
  const invalidTemp = genieAcs.normalizeDevice({
    _id: 'temp-invalid',
    VirtualParameters: {
      gettemp: { _value: '0' }
    }
  }, {});

  assert.equal(virtualTemp.temperatureText, '45 C');
  assert.equal(virtualTemp.temperatureValue, 45);
  assert.equal(virtualTemp.temperatureParameter, 'VirtualParameters.gettemp');
  assert.equal(rawTemp.temperatureText, '54 C');
  assert.equal(invalidTemp.temperatureText, '-');
  assert.equal(invalidTemp.temperatureValue, null);
});

test('normalizes connected WiFi and LAN clients from GenieACS parameters', () => {
  const device = genieAcs.normalizeDevice({
    _id: 'client-detail-1',
    InternetGatewayDevice: {
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: {
              SSID: { _value: 'Rumah-2G' },
              TotalAssociations: { _value: '1' },
              AssociatedDevice: {
                1: {
                  AssociatedDeviceMACAddress: { _value: 'aa-bb-cc-00-00-01' },
                  AssociatedDeviceIPAddress: { _value: '192.168.1.11' },
                  AssociatedDeviceHostName: { _value: 'HP Android' }
                }
              }
            },
            5: {
              SSID: { _value: 'Rumah-5G' },
              TotalAssociations: { _value: '1' },
              AssociatedDevice: {
                1: {
                  AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:02' },
                  AssociatedDeviceIPAddress: { _value: '192.168.1.12' },
                  AssociatedDeviceHostName: { _value: 'Laptop' }
                }
              }
            }
          },
          Hosts: {
            Host: {
              1: {
                Active: { _value: '1' },
                IPAddress: { _value: '192.168.1.11' },
                MACAddress: { _value: 'AA:BB:CC:00:00:01' },
                HostName: { _value: 'HP Android' },
                Layer1Interface: { _value: 'WLAN' }
              },
              2: {
                Active: { _value: '1' },
                IPAddress: { _value: '192.168.1.20' },
                MACAddress: { _value: 'AA:BB:CC:00:00:20' },
                HostName: { _value: 'STB TV' },
                Layer1Interface: { _value: 'Ethernet' }
              }
            }
          }
        }
      }
    }
  }, {});

  assert.equal(device.wifiClients24, 1);
  assert.equal(device.wifiClients5, 1);
  assert.equal(device.lanClients, 1);
  assert.equal(device.clientsTotal, 3);
  assert.deepEqual(device.connectedClients.map((row) => row.type), ['2.4G', '5G', 'LAN']);
  assert.deepEqual(device.connectedClients.map((row) => row.ipAddress), ['192.168.1.11', '192.168.1.12', '192.168.1.20']);
});

test('fills connected WiFi client names from host table by MAC address', () => {
  const device = genieAcs.normalizeDevice({
    _id: 'client-host-merge',
    InternetGatewayDevice: {
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: {
              SSID: { _value: 'Rumah-2G' },
              TotalAssociations: { _value: '1' },
              AssociatedDevice: {
                1: {
                  AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:10' },
                  AssociatedDeviceIPAddress: { _value: '192.168.1.10' }
                }
              }
            }
          },
          Hosts: {
            Host: {
              1: {
                Active: { _value: '1' },
                IPAddress: { _value: '192.168.1.10' },
                MACAddress: { _value: 'AA:BB:CC:00:00:10' },
                HostName: { _value: 'iPhone Kinoy' },
                Layer1Interface: { _value: 'WLAN' }
              }
            }
          }
        }
      }
    }
  }, {});

  assert.equal(device.connectedClients.length, 1);
  assert.equal(device.connectedClients[0].type, '2.4G');
  assert.equal(device.connectedClients[0].name, 'iPhone Kinoy');
});

test('does not inflate active client total from stale host table entries', () => {
  const hosts = {};
  for (let index = 1; index <= 30; index += 1) {
    hosts[index] = {
      Active: { _value: '1' },
      IPAddress: { _value: `192.168.100.${index}` },
      MACAddress: { _value: `AA:BB:CC:00:00:${String(index).padStart(2, '0')}` },
      HostName: { _value: `Client ${index}` },
      Layer1Interface: { _value: 'WLAN' }
    };
  }
  hosts[30].Layer1Interface = { _value: 'Ethernet' };

  const device = genieAcs.normalizeDevice({
    _id: 'stale-hosts',
    InternetGatewayDevice: {
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: {
              SSID: { _value: 'Rumah-2G' },
              TotalAssociations: { _value: '5' },
              AssociatedDevice: {
                1: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:01' }, AssociatedDeviceIPAddress: { _value: '192.168.100.1' } },
                2: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:02' }, AssociatedDeviceIPAddress: { _value: '192.168.100.2' } },
                3: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:03' }, AssociatedDeviceIPAddress: { _value: '192.168.100.3' } },
                4: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:04' }, AssociatedDeviceIPAddress: { _value: '192.168.100.4' } },
                5: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:05' }, AssociatedDeviceIPAddress: { _value: '192.168.100.5' } }
              }
            },
            5: {
              SSID: { _value: 'Rumah-5G' },
              TotalAssociations: { _value: '3' },
              AssociatedDevice: {
                1: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:06' }, AssociatedDeviceIPAddress: { _value: '192.168.100.6' } },
                2: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:07' }, AssociatedDeviceIPAddress: { _value: '192.168.100.7' } },
                3: { AssociatedDeviceMACAddress: { _value: 'AA:BB:CC:00:00:08' }, AssociatedDeviceIPAddress: { _value: '192.168.100.8' } }
              }
            }
          },
          Hosts: { Host: hosts }
        }
      }
    }
  }, {});

  assert.equal(device.hostClientsTotal, 30);
  assert.equal(device.wifiClients24, 5);
  assert.equal(device.wifiClients5, 3);
  assert.equal(device.lanClients, 1);
  assert.equal(device.connectedClients.length, 9);
  assert.equal(device.clientsTotal, 9);
});

test('uses built-in GenieACS parameters and normalizes ZTE RX power', () => {
  const device = genieAcs.normalizeDevice({
    _id: 'zte-1',
    _deviceId: {
      _Manufacturer: 'ZTE',
      _ProductClass: 'F670L',
      _SerialNumber: 'ZTE123'
    },
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          'X_ZTE-COM_WANPONInterfaceConfig': {
            RXPower: { _value: '233' }
          },
          WANConnectionDevice: {
            2: {
              WANPPPConnection: {
                1: { Username: { _value: 'pelanggan-zte@fake.net' } }
              }
            }
          }
        }
      },
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: {
              SSID: { _value: 'ZTE-2G' },
              TotalAssociations: { _value: '1' }
            },
            5: {
              SSID: { _value: 'ZTE-5G' },
              TotalAssociations: { _value: '4' }
            },
            7: {
              Enable: { _value: 'false' },
              Status: { _value: 'Disabled' },
              SSID: { _value: 'ZTE-HOTSPOT' },
              TotalAssociations: { _value: '9' }
            }
          }
        }
      }
    }
  }, {
    genieAcs: {
      usernameParameters: 'Invalid.Username',
      rxPowerParameters: 'Invalid.RXPower',
      wifiSsidParameters: 'Invalid.SSID'
    }
  });

  assert.equal(device.username, 'pelanggan-zte@fake.net');
  assert.equal(device.rxPowerText, '-23,3 dBm');
  assert.equal(device.ssid24, 'ZTE-2G');
  assert.equal(device.ssid5, 'ZTE-5G');
  assert.equal(device.wifiClientsTotal, 5);
  assert.equal(device.wifiNetworks.length, 3);
  assert.equal(device.wifiNetworks.find((item) => item.ssid === 'ZTE-HOTSPOT').enabled, false);
});

test('prefers GenieACS virtual RX power over positive XPON raw value', () => {
  const device = genieAcs.normalizeDevice({
    _id: 'dkb-reshna',
    _deviceId: {
      _Manufacturer: 'XPON',
      _ProductClass: 'DKB-180',
      _SerialNumber: 'ELWGC61891E9'
    },
    VirtualParameters: {
      RXPower: { _value: '-22.21' }
    },
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          WANConnectionDevice: {
            1: {
              WANPPPConnection: {
                1: { Username: { _value: 'rt10.reshna@km' } }
              }
            }
          },
          X_CMCC_EponInterfaceConfig: {
            RXPower: { _value: '60' }
          }
        }
      }
    }
  }, {});

  assert.equal(device.username, 'rt10.reshna@km');
  assert.equal(device.rxPower, '-22.21');
  assert.equal(device.rxPowerValue, -22.21);
  assert.equal(device.rxPowerText, '-22,21 dBm');
  assert.equal(device.rxPowerParameter, 'VirtualParameters.RXPower');
});

test('normalizes positive CMCC/CT XPON raw RX power when virtual value is absent', () => {
  const device = genieAcs.normalizeDevice({
    _id: 'dkb-raw',
    _deviceId: {
      _Manufacturer: 'XPON',
      _ProductClass: 'DKB-180',
      _SerialNumber: 'RAW60'
    },
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          X_CMCC_EponInterfaceConfig: {
            RXPower: { _value: '60' }
          }
        }
      }
    }
  }, {});

  assert.equal(device.rxPower, '60');
  assert.equal(device.rxPowerValue, -22.21);
  assert.equal(device.rxPowerText, '-22,21 dBm');
  assert.equal(device.rxPowerParameter, 'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower');
});

test('filters enriched GenieACS devices by NAS id, name, or address', () => {
  const rows = [
    { id: 'device-1', nasId: 'site-fake', nasName: 'FAKE.NET', nasIpAddress: '10.1.13.14' },
    { id: 'device-2', nasId: 'site-kampung', nasName: 'KAMPUNG.NET', nasIpAddress: '10.2.13.14' }
  ];

  assert.deepEqual(genieAcs.filterRowsByNas(rows, 'all'), rows);
  assert.deepEqual(genieAcs.filterRowsByNas(rows, 'SITE-FAKE').map((row) => row.id), ['device-1']);
  assert.deepEqual(genieAcs.filterRowsByNas(rows, 'kampung.net').map((row) => row.id), ['device-2']);
  assert.deepEqual(genieAcs.filterRowsByNas(rows, '10.1.13.14').map((row) => row.id), ['device-1']);
});

function huaweiMultiWanDevice() {
  return {
    _id: 'huawei-multi-wan',
    _deviceId: {
      _Manufacturer: 'Huawei',
      _ProductClass: 'EG8145V5',
      _SerialNumber: 'HW-MULTI-1'
    },
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          WANConnectionDevice: {
            1: {
              WANIPConnection: {
                1: {
                  Enable: { _value: true },
                  Name: { _value: '1_TR069_R_VID_100' },
                  X_HW_VLAN: { _value: 100 },
                  X_HW_SERVICELIST: { _value: 'TR069' },
                  X_HW_LANBIND: { Lan1Enable: { _value: 1 } }
                }
              }
            },
            2: {
              WANPPPConnection: {
                1: {
                  Enable: { _value: true },
                  ConnectionStatus: { _value: 'Connected' },
                  Name: { _value: '2_INTERNET_R_VID_200' },
                  Username: { _value: 'member@test.net' },
                  X_HW_VLAN: { _value: 200 },
                  X_HW_SERVICELIST: { _value: 'INTERNET' },
                  X_HW_LANBIND: { Lan2Enable: { _value: 1 } }
                }
              }
            },
            3: {
              WANIPConnection: {
                1: {
                  Enable: { _value: true },
                  ConnectionType: { _value: 'IP_Bridged' },
                  Name: { _value: '3_OTHER_B_VID_300' },
                  X_HW_VLAN: { _value: 300 },
                  X_HW_SERVICELIST: { _value: 'OTHER' },
                  X_HW_LANBIND: {
                    Lan4Enable: { _value: 1 },
                    SSID2Enable: { _value: 1 }
                  }
                }
              }
            }
          }
        }
      },
      LANDevice: {
        1: {
          LANEthernetInterfaceConfig: {
            1: { Enable: { _value: true } },
            2: { Enable: { _value: true } },
            3: { Enable: { _value: true } },
            4: { Enable: { _value: true } }
          },
          WLANConfiguration: {
            1: { Enable: { _value: true }, SSID: { _value: 'Rumah' } },
            2: { Enable: { _value: true }, SSID: { _value: 'Bridge-TV' } }
          }
        }
      }
    }
  };
}

function zteCmccWanDevice() {
  return {
    _id: 'zte-cmcc-wan',
    _deviceId: {
      _Manufacturer: 'ZTE',
      _ProductClass: 'F663NV3A',
      _SerialNumber: 'ZTE-CMCC-1'
    },
    InternetGatewayDevice: {
      WANDevice: {
        1: {
          WANConnectionDevice: {
            1: {
              WANIPConnection: {
                1: {
                  Enable: { _value: 'TRUE' },
                  ConnectionType: { _value: 'IP_Routed' },
                  Name: { _value: '1_TR069_R_VID_100' },
                  X_CMCC_ServiceList: { _value: 'TR069' },
                  X_CMCC_VLANIDMark: { _value: 100 }
                }
              },
              WANPPPConnection: {
                1: {
                  Enable: { _value: 'TRUE' },
                  ConnectionStatus: { _value: 'Connected' },
                  ConnectionType: { _value: 'PPPoE_Routed' },
                  Name: { _value: '2_INTERNET_R_VID_111' },
                  Username: { _value: 'member-cmcc' },
                  X_CMCC_ServiceList: { _value: 'INTERNET' },
                  X_CMCC_VLANIDMark: { _value: 111 }
                },
                2: {
                  Enable: { _value: 'TRUE' },
                  ConnectionType: { _value: 'PPPoE_Bridged' },
                  Name: { _value: '3_OTHER_B_VID_110' },
                  X_CMCC_ServiceList: { _value: 'OTHER' },
                  X_CMCC_VLANIDMark: { _value: 110 },
                  X_CMCC_LanInterface: {
                    _value: 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.4,InternetGatewayDevice.LANDevice.1.WLANConfiguration.2'
                  }
                }
              }
            }
          }
        }
      },
      LANDevice: {
        1: {
          LANEthernetInterfaceConfig: {
            1: { Enable: { _value: true } },
            2: { Enable: { _value: true } },
            3: { Enable: { _value: true } },
            4: { Enable: { _value: true } }
          },
          WLANConfiguration: {
            1: { Enable: { _value: true }, SSID: { _value: 'Rumah' } },
            2: { Enable: { _value: true }, SSID: { _value: 'Bridge-TV' } }
          }
        }
      }
    }
  };
}

test('summarizes multi-WAN and protects GenieACS management WAN', () => {
  const device = huaweiMultiWanDevice();
  const connections = device.InternetGatewayDevice.WANDevice[1].WANConnectionDevice;
  connections[9] = connections[1];
  delete connections[1];
  const summary = genieAcsWan.summarizeWanConnections(device, 'member@test.net');
  const management = summary.rows.find((row) => row.vlan === 100);
  const bridge = summary.rows.find((row) => row.mode === 'bridge');

  assert.equal(summary.vendor.id, 'huawei');
  assert.equal(summary.primary.username, 'member@test.net');
  assert.equal(summary.management.id, management.id);
  assert.equal(summary.rows[0].id, management.id);
  assert.equal(management.protected, true);
  assert.equal(management.editable, false);
  assert.deepEqual(bridge.bindings.sort(), ['LAN4', 'SSID2']);
});

test('reads and writes ZTE CMCC WAN VLAN and binding parameters', () => {
  const device = zteCmccWanDevice();
  const summary = genieAcsWan.summarizeWanConnections(device, 'member-cmcc');
  const management = summary.rows.find((row) => row.mode === 'management');
  const pppoe = summary.rows.find((row) => row.mode === 'pppoe');
  const bridge = summary.rows.find((row) => row.mode === 'bridge');

  assert.equal(summary.vendor.id, 'zte');
  assert.equal(management.vlan, 100);
  assert.equal(management.protected, true);
  assert.equal(pppoe.vlan, 111);
  assert.equal(pppoe.label, 'PPPoE - VLAN 111');
  assert.equal(pppoe.parameterFamily, 'cmcc');
  assert.equal(bridge.vlan, 110);
  assert.deepEqual(bridge.bindings.sort(), ['LAN4', 'SSID2']);

  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: pppoe.id,
    mode: 'pppoe',
    vlan: 111,
    username: 'member-cmcc',
    bindings: ['LAN3']
  });
  const parameters = new Map([
    ...plan.parameterValues,
    ...plan.bindingValues
  ].map(([name, value]) => [name, value]));

  assert.equal(parameters.get(`${pppoe.basePath}.X_CMCC_VLANIDMark`), 111);
  assert.equal(parameters.get(`${pppoe.basePath}.X_CMCC_ServiceList`), 'INTERNET');
  assert.equal(parameters.get(`${pppoe.basePath}.X_CMCC_LanInterface`), 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.3');
  assert.equal([...parameters.keys()].some((name) => name.includes('X_ZTE-COM_VLANID')), false);
});

test('defaults WAN editing to an existing connection and keeps the earliest bridge first', () => {
  const device = huaweiMultiWanDevice();
  const connections = device.InternetGatewayDevice.WANDevice[1].WANConnectionDevice;
  connections[3].WANIPConnection[1].X_HW_VLAN._value = 131;
  connections[3].WANIPConnection[1].Name._value = '3_OTHER_B_VID_131';
  connections[4] = {
    WANIPConnection: {
      1: {
        Enable: { _value: true },
        ConnectionType: { _value: 'IP_Bridged' },
        Name: { _value: '4_OTHER_B_VID_130' },
        X_HW_VLAN: { _value: 130 },
        X_HW_SERVICELIST: { _value: 'OTHER' },
        X_HW_LANBIND: { Lan3Enable: { _value: 1 } }
      }
    }
  };

  const summary = genieAcsWan.summarizeWanConnections(device, 'member@test.net');
  assert.equal(genieAcsWan.defaultWanTarget(summary).mode, 'pppoe');
  assert.equal(genieAcsWan.defaultWanTarget(summary, 'bridge').vlan, 131);

  delete connections[2];
  const bridgeOnly = genieAcsWan.summarizeWanConnections(device);
  assert.equal(genieAcsWan.defaultWanTarget(bridgeOnly).vlan, 131);
  assert.equal(genieAcsWan.defaultWanTarget(bridgeOnly, 'pppoe'), null);
});

test('detects newly registered ONT only when WAN PPP is missing', () => {
  const noWanDevice = huaweiMultiWanDevice();
  noWanDevice._registered = '2026-08-02T15:39:39.287Z';
  delete noWanDevice.InternetGatewayDevice.WANDevice[1].WANConnectionDevice[2];
  const noWan = genieAcs._internal.recentPendingCandidate(noWanDevice, genieAcs.normalizeSettings({}));

  const waitingDevice = huaweiMultiWanDevice();
  waitingDevice._registered = '2026-08-02T15:40:00.000Z';
  const waiting = genieAcs._internal.recentPendingCandidate(waitingDevice, genieAcs.normalizeSettings({}));

  const readyDevice = huaweiMultiWanDevice();
  readyDevice._registered = '2026-08-02T15:41:00.000Z';
  readyDevice.InternetGatewayDevice.WANDevice[1].WANConnectionDevice[2]
    .WANPPPConnection[1].ExternalIPAddress = { _value: '100.64.1.2' };
  const ready = genieAcs._internal.recentPendingCandidate(readyDevice, genieAcs.normalizeSettings({}));

  const disconnectedDevice = huaweiMultiWanDevice();
  disconnectedDevice._registered = '2026-08-02T15:42:00.000Z';
  const disconnectedPpp = disconnectedDevice.InternetGatewayDevice.WANDevice[1]
    .WANConnectionDevice[2].WANPPPConnection[1];
  disconnectedPpp.ExternalIPAddress = { _value: '100.64.1.3' };
  disconnectedPpp.ConnectionStatus = { _value: 'Disconnected' };
  const disconnected = genieAcs._internal.recentPendingCandidate(disconnectedDevice, genieAcs.normalizeSettings({}));

  assert.equal(noWan.registered, noWanDevice._registered);
  assert.equal(noWan.wanPending.code, 'no_wan_ppp');
  assert.equal(waiting, null);
  assert.equal(disconnected, null);
  assert.equal(ready, null);
});

test('uses a compact registration and PPP projection for recent ONT detection', () => {
  const projection = genieAcs._internal.recentPendingProjection(genieAcs.normalizeSettings({}));

  assert.match(projection, /_registered/);
  assert.match(projection, /WANPPPConnection\.1\.Username/);
  assert.match(projection, /ExternalIPAddress/);
  assert.doesNotMatch(projection, /KeyPassphrase|AssociatedDevice/);
  assert.equal(projection.length < 4096, true);
});

test('splits the GenieACS list projection without requesting full device documents', () => {
  const projection = genieAcs._internal.deviceListProjection(genieAcs.normalizeSettings({}));
  const chunks = genieAcs._internal.projectionChunks(projection, 3500);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => chunk.startsWith('_id,') && chunk.length <= 3500), true);
  assert.equal(chunks.every((chunk) => !/KeyPassphrase|WPAAuthenticationMode|AssociatedDevice\./.test(chunk)), true);
  assert.match(projection, /VirtualParameters\.RXPower/);
  assert.match(projection, /WANPPPConnection\.1\.Username/);
});

test('searches GenieACS by SN, tag, SSID, and PPPoE while rejecting short scans', () => {
  const shortQuery = genieAcs._internal.searchQuery('ab');
  const query = genieAcs._internal.searchQuery('rumah-01');
  const fields = query.$or.map((entry) => Object.keys(entry)[0]);

  assert.deepEqual(shortQuery, { _id: { $in: [] } });
  assert.equal(fields.includes('_deviceId._SerialNumber'), true);
  assert.equal(fields.includes('_tags'), true);
  assert.equal(fields.includes('InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value'), true);
  assert.equal(fields.includes('InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value'), true);
});

test('recognizes bridge profiles stored below WANPPPConnection', () => {
  const device = huaweiMultiWanDevice();
  device.InternetGatewayDevice.WANDevice[1].WANConnectionDevice[4] = {
    WANPPPConnection: {
      1: {
        Enable: { _value: true },
        ConnectionType: { _value: 'PPPoE_Bridged' },
        Name: { _value: '4_OTHER_B_VID_400' },
        X_HW_VLAN: { _value: 400 },
        X_HW_SERVICELIST: { _value: 'OTHER' },
        X_HW_LANBIND: { Lan3Enable: { _value: 1 } }
      }
    }
  };

  const bridge = genieAcsWan.summarizeWanConnections(device).rows
    .find((row) => row.connectionIndex === 4);
  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: bridge.id,
    mode: 'bridge',
    vlan: 400,
    bindings: ['LAN3']
  });
  const parameters = new Map(plan.parameterValues.map(([name, value]) => [name, value]));

  assert.equal(bridge.mode, 'bridge');
  assert.equal(bridge.objectType, 'WANPPPConnection');
  assert.equal(plan.objectType, 'WANPPPConnection');
  assert.equal(parameters.get(`${bridge.basePath}.ConnectionType`), 'PPPoE_Bridged');
});

test('updates WAN bindings without rewriting VLAN or PPPoE credentials', () => {
  const device = huaweiMultiWanDevice();
  const target = genieAcsWan.summarizeWanConnections(device).rows
    .find((row) => row.mode === 'pppoe' && !row.protected);
  const plan = genieAcsWan.prepareWanBinding(device, {
    targetWan: target.id,
    bindings: ['LAN3'],
    moveBindings: true
  });
  const publicPlan = genieAcsWan.publicWanPlan(plan);

  assert.equal(plan.bindingOnly, true);
  assert.deepEqual(plan.parameterValues, []);
  assert.deepEqual(plan.activationValues, []);
  assert.equal(plan.bindingValues.some(([name]) => name.includes('.X_HW_LANBIND.')), true);
  assert.equal(plan.bindingValues.some(([name]) => /Username|Password|VLAN/.test(name)), false);
  assert.equal(publicPlan.bindingOnly, true);
});

test('selects the matching WAN automatically during provisioning', () => {
  const device = huaweiMultiWanDevice();
  const pppoe = genieAcsWan.prepareWanProvision(device, {
    targetWan: 'auto',
    mode: 'pppoe',
    vlan: 200,
    username: 'member@test.net',
    bindings: ['LAN2']
  });
  const bridge = genieAcsWan.prepareWanProvision(device, {
    targetWan: 'auto',
    mode: 'bridge',
    vlan: 300,
    bindings: ['LAN4', 'SSID2']
  });

  assert.equal(pppoe.isNew, false);
  assert.equal(pppoe.existing.username, 'member@test.net');
  assert.equal(bridge.isNew, false);
  assert.equal(bridge.existing.mode, 'bridge');
});

test('rebases a new WAN plan to instance numbers returned by the modem', () => {
  const plan = genieAcsWan.prepareWanProvision(huaweiMultiWanDevice(), {
    targetWan: 'new',
    mode: 'pppoe',
    vlan: 500,
    username: 'new-user',
    password: 'private-password',
    bindings: ['LAN3']
  });

  genieAcsWan.rebaseNewWanPlan(plan, { connectionIndex: 8, instance: 2 });

  assert.equal(plan.basePath, 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.8.WANPPPConnection.2');
  assert.equal(plan.parameterValues.every(([path]) => path.startsWith(plan.basePath)), true);
  assert.equal(plan.bindingValues.every(([path]) => path.startsWith(plan.basePath)), true);
  assert.deepEqual(plan.activationValues, [[`${plan.basePath}.Enable`, true, 'xsd:boolean']]);
  assert.equal(plan.parameterValues.some(([path]) => path.endsWith('.Enable')), false);
});

test('chooses the bridge container used by supported devices in production', () => {
  const huawei = genieAcsWan.bridgeTarget(huaweiMultiWanDevice());
  const fiberhome = genieAcsWan.bridgeTarget({
    _deviceId: {
      _Manufacturer: 'FiberHome',
      _ProductClass: 'HG6243C'
    }
  });

  assert.deepEqual(huawei, {
    objectType: 'WANIPConnection',
    connectionType: 'IP_Bridged',
    label: 'WAN IP · IP_Bridged'
  });
  assert.deepEqual(fiberhome, {
    objectType: 'WANIPConnection',
    connectionType: 'IP_Bridged',
    label: 'WAN IP · IP_Bridged'
  });
});

test('blocks ZTE F67x Set WAN until its separate PortBinding table is available', () => {
  const device = {
    _deviceId: {
      _Manufacturer: 'ZTE',
      _ProductClass: 'F670L'
    }
  };
  const vendor = genieAcsWan.detectWanVendor(device);

  assert.equal(vendor.wanWriteSupported, false);
  assert.throws(() => genieAcsWan.prepareWanProvision(device, {
    mode: 'pppoe',
    vlan: 200,
    username: 'member@test.net',
    password: 'private-password',
    bindings: ['LAN1']
  }), /PortBinding LANInterface\/WANInterface/);
});

test('keeps LAN and SSID bindings together for bridge WAN', () => {
  const device = huaweiMultiWanDevice();
  const summary = genieAcsWan.summarizeWanConnections(device);
  const bridge = summary.rows.find((row) => row.mode === 'bridge');
  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: bridge.id,
    mode: 'bridge',
    vlan: 300,
    bindings: ['SSID2', 'LAN4']
  });
  const parameters = new Map([
    ...plan.parameterValues,
    ...plan.enableBindingValues,
    ...plan.bindingValues
  ].map(([name, value]) => [name, value]));

  assert.equal(parameters.get(`${bridge.basePath}.X_HW_LANBIND.Lan4Enable`), 1);
  assert.equal(parameters.get(`${bridge.basePath}.X_HW_LANBIND.SSID2Enable`), 1);
  assert.equal(parameters.get(`${bridge.basePath}.X_HW_LANBIND.Lan2Enable`), 0);
  assert.equal(parameters.get('InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.4.Enable'), true);
  assert.equal(parameters.get('InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.4.X_HW_L3Enable'), true);
  assert.equal(parameters.get('InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable'), true);
});

test('allows an empty binding selection during WAN provisioning', () => {
  const device = huaweiMultiWanDevice();
  const bridge = genieAcsWan.summarizeWanConnections(device).rows
    .find((row) => row.mode === 'bridge');
  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: bridge.id,
    mode: 'bridge',
    vlan: 300,
    bindings: []
  });
  const parameters = new Map(plan.bindingValues.map(([name, value]) => [name, value]));

  assert.deepEqual(plan.bindings, []);
  assert.equal(parameters.get(`${bridge.basePath}.X_HW_LANBIND.Lan4Enable`), 0);
  assert.equal(parameters.get(`${bridge.basePath}.X_HW_LANBIND.SSID2Enable`), 0);
});

test('verifies the complete WAN readback instead of accepting a partial match', () => {
  const device = huaweiMultiWanDevice();
  const bridge = genieAcsWan.summarizeWanConnections(device).rows
    .find((row) => row.mode === 'bridge');
  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: bridge.id,
    mode: 'bridge',
    vlan: 301,
    bindings: []
  });
  const stale = genieAcs._internal.wanReadbackVerification(plan, bridge);
  const updated = genieAcs._internal.wanReadbackVerification(plan, {
    ...bridge,
    vlan: 301,
    bindings: []
  });

  assert.equal(stale.verified, false);
  assert.equal(stale.checks.vlan, false);
  assert.equal(stale.checks.bindings, false);
  assert.equal(updated.verified, true);
});

test('requires confirmation and cleans old WAN when moving a binding', () => {
  const device = huaweiMultiWanDevice();
  assert.throws(() => genieAcsWan.prepareWanProvision(device, {
    targetWan: 'new',
    mode: 'bridge',
    vlan: 400,
    bindings: ['LAN2']
  }), /masih terikat ke WAN lain/);

  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: 'new',
    mode: 'bridge',
    vlan: 400,
    bindings: ['LAN2'],
    moveBindings: true
  });
  assert.equal(plan.cleanupValues.some(([name, value]) => name.endsWith('.X_HW_LANBIND.Lan2Enable') && value === 0), true);
});

test('rejects protected WAN and never exposes PPPoE password in public plan', () => {
  const device = huaweiMultiWanDevice();
  const management = genieAcsWan.summarizeWanConnections(device).rows.find((row) => row.vlan === 100);
  assert.throws(() => genieAcsWan.prepareWanProvision(device, {
    targetWan: management.id,
    mode: 'pppoe',
    vlan: 100,
    username: 'forged',
    password: 'secret',
    bindings: ['LAN3']
  }), /VLAN 100 dilindungi|tidak boleh diubah/);

  const plan = genieAcsWan.prepareWanProvision(device, {
    targetWan: 'new',
    mode: 'pppoe',
    vlan: 500,
    username: 'new-user',
    password: 'private-password',
    bindings: ['LAN3']
  });
  const publicPlan = genieAcsWan.publicWanPlan(plan);
  assert.equal(Object.prototype.hasOwnProperty.call(publicPlan, 'password'), false);
  assert.equal(JSON.stringify(publicPlan).includes('private-password'), false);
});

test('uses vendor-specific binding parameters for FiberHome and ZTE', () => {
  const basePath = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANIPConnection.1';
  const expected = 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.4,InternetGatewayDevice.LANDevice.1.WLANConfiguration.2';
  const fiberhome = genieAcsWan._internal.bindingParameterValues(basePath, { id: 'fiberhome' }, ['LAN4', 'SSID2']);
  const zte = genieAcsWan._internal.bindingParameterValues(basePath, { id: 'zte' }, ['LAN4', 'SSID2']);

  assert.deepEqual(fiberhome, [[`${basePath}.X_FH_LanInterface`, expected, 'xsd:string']]);
  assert.deepEqual(zte, [[`${basePath}.X_ZTE-COM_LanInterface`, expected, 'xsd:string']]);
});

test('preserves unknown vendor binding paths while updating LAN and SSID', () => {
  const basePath = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANIPConnection.1';
  const vendorPath = 'InternetGatewayDevice.LANDevice.1.X_VENDOR-COM_CustomInterface.1';
  const fiberhome = genieAcsWan._internal.bindingParameterValues(
    basePath,
    { id: 'fiberhome' },
    ['LAN4', 'SSID2'],
    [vendorPath]
  );

  assert.equal(fiberhome[0][1].startsWith(`${vendorPath},`), true);
  assert.equal(fiberhome[0][1].includes('LANEthernetInterfaceConfig.4'), true);
  assert.equal(fiberhome[0][1].includes('WLANConfiguration.2'), true);
});

function wifiAddDevice(vendor = 'Huawei') {
  const fiberhome = vendor === 'FiberHome';
  return {
    _id: `${vendor}-wifi-add`,
    _deviceId: {
      _Manufacturer: vendor,
      _ProductClass: fiberhome ? 'HG6145D2' : 'EG8145V5',
      _SerialNumber: `${vendor}-WIFI-1`
    },
    InternetGatewayDevice: {
      DeviceInfo: { Manufacturer: { _value: vendor } },
      LANDevice: {
        1: {
          WLANConfiguration: {
            1: { Enable: { _value: true }, SSID: { _value: 'Main-2G' } },
            ...(fiberhome ? {
              2: {
                Enable: { _value: false },
                RadioEnabled: { _value: false },
                SSID: { _value: 'Slot-Lama' },
                BeaconType: { _value: '11i' },
                BasicAuthenticationMode: { _value: 'None' },
                BasicEncryptionModes: { _value: 'None' },
                WPAAuthenticationMode: { _value: 'PSKAuthentication' },
                WPAEncryptionModes: { _value: 'AESEncryption' },
                IEEE11iAuthenticationMode: { _value: 'PSKAuthentication' },
                IEEE11iEncryptionModes: { _value: 'AESEncryption' },
                KeyPassphrase: { _value: 'passwordlama' },
                PreSharedKey: { 1: { KeyPassphrase: { _value: 'passwordlama' }, PreSharedKey: { _value: 'passwordlama' } } }
              }
            } : {}),
            5: { Enable: { _value: true }, SSID: { _value: 'Main-5G' } }
          }
        }
      }
    }
  };
}

test('selects Huawei SSID slot by 2.4 GHz and 5 GHz band', () => {
  const device = wifiAddDevice('Huawei');
  const options = genieAcsWifi.addSsidOptions(device);

  assert.equal(options.supported, true);
  assert.equal(options.bands.find((item) => item.value === '2.4ghz').nextIndex, 2);
  assert.equal(options.bands.find((item) => item.value === '5ghz').nextIndex, 6);
  assert.equal(genieAcsWifi.prepareAddSsid(device, {
    band: '2.4GHz',
    ssid: 'WiFi Baru',
    security: 'open'
  }).needsObject, true);
});

test('reuses disabled FiberHome SSID slot and enables radio in final batch', () => {
  const device = wifiAddDevice('FiberHome');
  const plan = genieAcsWifi.prepareAddSsid(device, {
    band: '2.4ghz',
    ssid: 'WiFi Tamu',
    security: 'pass',
    password: 'passwordbaru'
  });
  const batches = genieAcsWifi.addSsidBatches(device, plan.index, plan);
  const enable = new Map(batches.find((item) => item.name === 'enable').values.map(([name, value]) => [name, value]));
  const passwordPaths = batches.find((item) => item.name === 'password').values.map(([name]) => name);

  assert.equal(plan.index, 2);
  assert.equal(plan.needsObject, false);
  assert.equal(enable.get(`${plan.path}.Enable`), true);
  assert.equal(enable.get(`${plan.path}.RadioEnabled`), true);
  assert.equal(passwordPaths.includes(`${plan.path}.KeyPassphrase`), true);
  assert.equal(passwordPaths.includes(`${plan.path}.PreSharedKey.1.KeyPassphrase`), true);
});

test('builds explicit enable and disable values when editing an SSID', () => {
  const device = wifiAddDevice('FiberHome');
  const base = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2';
  const disabled = genieAcs._internal.wifiCredentialsPlan(device, {
    ssid: 'WiFi Tamu',
    ssidParameter: `${base}.SSID`,
    usePassword: false,
    enabled: false
  });
  const disabledValues = new Map(disabled.values.map(([name, value]) => [name, value]));
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.security, 'none');
  assert.equal(disabled.index, 2);
  assert.equal(disabledValues.get(`${base}.Enable`), false);
  assert.equal(disabledValues.has(`${base}.RadioEnabled`), false);

  const enabled = genieAcs._internal.wifiCredentialsPlan(device, {
    ssid: 'WiFi Tamu',
    ssidParameter: `${base}.SSID`,
    passwordParameter: `${base}.PreSharedKey.1.KeyPassphrase`,
    password: 'passwordbaru',
    usePassword: true,
    enabled: true
  });
  const enabledValues = new Map(enabled.values.map(([name, value]) => [name, value]));
  assert.equal(enabled.security, 'pass');
  assert.equal(enabledValues.get(`${base}.Enable`), true);
  assert.equal(enabledValues.get(`${base}.RadioEnabled`), true);
  assert.equal(enabledValues.get(`${base}.PreSharedKey.1.KeyPassphrase`), 'passwordbaru');
});

test('builds the SSID task order and verifies readback', () => {
  const device = wifiAddDevice('FiberHome');
  const plan = genieAcsWifi.prepareAddSsid(device, {
    band: '2.4ghz',
    ssid: 'SSID Billing',
    security: 'none'
  });
  const batches = genieAcsWifi.addSsidBatches(device, plan.index, plan);
  assert.deepEqual(batches.map((item) => item.name), ['ssid', 'security', 'enable']);

  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].SSID._value = 'SSID Billing';
  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].Enable._value = true;
  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].RadioEnabled._value = true;
  assert.equal(genieAcsWifi.readbackStatus(device, plan).verified, false);
  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].BeaconType._value = 'Basic';
  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].BasicAuthenticationMode._value = 'None';
  device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].BasicEncryptionModes._value = 'None';
  assert.equal(genieAcsWifi.readbackStatus(device, plan).verified, true);
});

test('treats an explicit open beacon as open when an SSID slot retains WPA values', () => {
  const device = wifiAddDevice('FiberHome');
  const base = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2';
  const config = device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.BeaconType._value = 'Basic';
  config.BasicAuthenticationMode._value = 'OpenSystem';
  config.BasicEncryptionModes._value = 'None';

  assert.equal(genieAcs._internal.wifiSecurityEnabled(device, base, {
    value: 'passwordlama'
  }), false);

  config.BeaconType._value = 'WPAand11i';
  assert.equal(genieAcs._internal.wifiSecurityEnabled(device, base, {
    value: ''
  }), true);
});

test('does not verify secured SSID readback until security and password match', () => {
  const device = wifiAddDevice('FiberHome');
  const plan = genieAcsWifi.prepareAddSsid(device, {
    band: '2.4ghz',
    ssid: 'SSID Aman',
    security: 'pass',
    password: 'passwordbaru'
  });
  const config = device.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.SSID._value = plan.ssid;
  config.Enable._value = true;
  config.RadioEnabled._value = true;

  const stalePassword = genieAcsWifi.readbackStatus(device, plan);
  config.KeyPassphrase._value = plan.password;
  const updated = genieAcsWifi.readbackStatus(device, plan);

  assert.equal(stalePassword.securityVerified, true);
  assert.equal(stalePassword.passwordVerified, false);
  assert.equal(stalePassword.verified, false);
  assert.equal(updated.passwordVerified, true);
  assert.equal(updated.verified, true);
});

test('keeps GenieACS popup feedback mobile-safe without exposing WiFi passwords', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const wifiKuSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'wifiku.js'), 'utf8');
  const wifiKuStyleSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'wifiku.css'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const clientSource = appSource.slice(appSource.indexOf('function openGenieClientsModal'), appSource.indexOf('function genieAcsPaginationControls'));
  const wifiKuClientSource = wifiKuSource.slice(wifiKuSource.indexOf('function openClientDialog'), wifiKuSource.indexOf('function openUsageDialog'));
  const wanSource = appSource.slice(appSource.indexOf('async function openGenieWanModal'), appSource.indexOf('async function openGenieAcsSettingsModal'));
  const targetOptionsSource = wanSource.slice(wanSource.indexOf('<select name="targetWan"'), wanSource.indexOf('</select>'));

  assert.doesNotMatch(appSource, /data-password="/);
  assert.doesNotMatch(appSource, /network\.securityEnabled \|\| network\.password/);
  assert.doesNotMatch(appSource, /firstNetwork\.securityEnabled \|\| firstNetwork\.password/);
  assert.match(appSource, /id="genieWifiSecurity"/);
  assert.match(appSource, /submitButton\.textContent = 'Sudah dikirim'/);
  assert.match(appSource, /element\.scrollIntoView/);
  assert.match(appSource, /const layoutClasses = \['field', 'full'\]/);
  assert.match(wanSource, /const sortedWanRows = \[\.\.\.wanRows\]\.sort/);
  assert.match(wanSource, /id="genieWanFormTitle"/);
  assert.match(wanSource, /Edit WAN \$\{selected\.label\}/);
  assert.match(appSource, /<span>Target WAN<\/span>/);
  assert.match(wanSource, /Binding port dan WiFi/);
  assert.match(wanSource, /Pindahkan LAN\/SSID yang masih terikat ke WAN lain/);
  assert.match(wanSource, /<span>VLAN ID<\/span>/);
  assert.match(wanSource, /Kirim Konfigurasi/);
  assert.match(wanSource, /Simpan Binding/);
  assert.match(wanSource, /bindingOnly/);
  assert.equal(wanSource.indexOf('sortedWanRows.map') < wanSource.indexOf('Target WAN'), true);
  assert.match(wanSource, /const initialWan = editableRows\.find/);
  assert.match(wanSource, /defaultTargetIds\[input\.value\]/);
  assert.equal(targetOptionsSource.indexOf('Edit WAN') < targetOptionsSource.indexOf('Tambah WAN baru'), true);
  assert.match(appSource, /Antrian Aktivasi ONT/);
  assert.doesNotMatch(appSource, /ONT Baru Perlu Internet/);
  assert.doesNotMatch(appSource, /Deteksi otomatis/);
  assert.doesNotMatch(appSource, /Buka detail/);
  assert.match(appSource, /recent-pending\?hours=24&limit=100/);
  assert.match(appSource, /const pageSize = 6/);
  assert.match(appSource, /data-genie-recent-page/);
  assert.match(appSource, /const pageSize = 10/);
  assert.match(appSource, /data-genie-client-page/);
  assert.doesNotMatch(clientSource, /<span>Total /);
  assert.match(appSource, /minLength: 3/);
  assert.match(appSource, /document\.hidden/);
  assert.match(wifiKuSource, /const pageSize = 10/);
  assert.match(wifiKuSource, /data-client-page/);
  assert.doesNotMatch(wifiKuClientSource, /<span>Total /);
  assert.match(wifiKuStyleSource, /\.client-detail-pager/);
  assert.match(serverSource, /\/api\/genieacs\/devices\/recent-pending/);
  assert.match(serverSource, /genieAcsClientsMatch/);
  assert.match(serverSource, /Konfigurasi WAN GenieACS gagal/);
  assert.match(styleSource, /\.genie-operation-status\[data-state="loading"\]/);
  assert.match(styleSource, /\.genie-wan-form-layout > \.genie-operation-status \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?width: 100%;/);
  assert.match(styleSource, /\.genie-wan-row\.is-protected/);
  assert.match(styleSource, /\.genieacs-provision-table/);
  assert.match(styleSource, /\.genieacs-provision-row/);
  assert.match(styleSource, /\.genieacs-provision-action/);
  assert.doesNotMatch(styleSource, /\.genieacs-recent-device-mark/);
  assert.match(styleSource, /\.genieacs-recent-actions/);
  assert.match(styleSource, /\.genie-wan-binding-grid/);
});
