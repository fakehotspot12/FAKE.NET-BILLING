'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const genieAcs = require('../src/genieacs');

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
