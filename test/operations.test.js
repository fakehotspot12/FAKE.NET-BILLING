'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  addInventoryItem,
  addMonitoringTarget,
  addNetworkAsset,
  addStockMovement,
  archiveInventoryItem,
  DEFAULT_SNMP_OID,
  deleteMonitoringTarget,
  ensureDefaultInventoryItems,
  inventorySummary,
  mikrotikCustomerSummary,
  monitoringSummary,
  networkSummary,
  updateInventoryItem,
  updateMonitoringTarget
} = require('../src/operations');
const { createDefaultStore } = require('../src/store');

test('inventory tracks stock movement and low stock summary', () => {
  const data = createDefaultStore();
  const item = addInventoryItem(data, {
    sku: 'RTR-001',
    name: 'Router pelanggan',
    category: 'Router',
    unit: 'pcs',
    quantity: 5,
    minimumStock: 2,
    location: 'Gudang'
  });

  assert.equal(item.quantity, 5);
  assert.equal(data.stockMovements.length, 1);

  const movement = addStockMovement(data, item.id, {
    type: 'out',
    quantity: 3,
    reference: 'Pemasangan baru'
  });

  assert.equal(movement.item.quantity, 2);
  assert.equal(inventorySummary(data.inventoryItems).lowStockCount, 1);
  assert.throws(() => addStockMovement(data, item.id, { type: 'out', quantity: 5 }), /Stok tidak cukup/);

  updateInventoryItem(data, item.id, {
    name: 'Router pelanggan',
    category: 'Router',
    unit: 'pcs',
    quantity: 10,
    minimumStock: 2,
    location: 'Gudang'
  });

  assert.equal(item.quantity, 10);
  assert.equal(data.stockMovements.at(-1).reference, 'Koreksi stok');

  archiveInventoryItem(data, item.id);
  assert.equal(inventorySummary(data.inventoryItems).itemCount, 0);
});

test('default ISP inventory master data is created once', () => {
  const data = createDefaultStore();
  const first = ensureDefaultInventoryItems(data);
  const second = ensureDefaultInventoryItems(data);

  assert.equal(first.created.length, 22);
  assert.equal(second.created.length, 0);
  assert.equal(data.inventoryItems.some((item) => item.name === 'Splitter 1:8'), true);
  assert.equal(data.inventoryItems.some((item) => item.name === 'Patchcore UPC'), true);
  assert.equal(inventorySummary(data.inventoryItems).itemCount, 22);
});

test('network assets and monitoring summaries are separated from finance data', () => {
  const data = createDefaultStore();
  const asset = addNetworkAsset(data, {
    name: 'Server Billing',
    type: 'Server',
    site: 'Server Room',
    brand: 'Dell',
    model: 'R730',
    serialNumber: 'SRV-001',
    owner: 'NOC'
  });
  const target = addMonitoringTarget(data, {
    name: 'Router Core SNMP',
    host: '192.168.1.1',
    community: 'public',
    location: asset.site,
    hotspotLoginUrl: 'login.site.test/login'
  });

  assert.equal(networkSummary(data.networkAssets).assetCount, 1);
  assert.equal(asset.type, 'Server');
  assert.equal(asset.serialNumber, 'SRV-001');
  assert.equal(asset.ipAddress, undefined);
  assert.equal(asset.vlan, undefined);
  addNetworkAsset(data, { name: 'ONT rusak', status: 'damaged' });
  addNetworkAsset(data, { name: 'Tangga hilang', status: 'lost' });
  assert.equal(networkSummary(data.networkAssets).damagedCount, 1);
  assert.equal(networkSummary(data.networkAssets).lostCount, 1);
  assert.equal(target.method, 'snmp');
  assert.equal(target.port, 161);
  assert.equal(target.snmpVersion, '2c');
  assert.equal(target.oid, DEFAULT_SNMP_OID);
  assert.equal(target.status, 'unknown');
  assert.deepEqual(target.mediaServices, {});
  assert.equal(target.hotspot.loginUrl, 'http://login.site.test/login');

  const serviceTarget = updateMonitoringTarget(data, target.id, {
    name: target.name,
    host: target.host,
    community: target.community,
    tvheadendUrl: 'http://tvheadend.local:9981',
    tvheadendUsername: 'viewer',
    tvheadendPassword: 'secret',
    embyUrl: 'http://emby.local:8096',
    embyApiKey: 'token',
    hotspotLoginUrl: 'https://login-new.site.test/login'
  });
  assert.equal(serviceTarget.mediaServices.tvheadendUrl, 'http://tvheadend.local:9981');
  assert.equal(serviceTarget.mediaServices.tvheadendPassword, 'secret');
  assert.equal(serviceTarget.mediaServices.embyApiKey, 'token');
  assert.equal(serviceTarget.hotspot.loginUrl, 'https://login-new.site.test/login');

  updateMonitoringTarget(data, target.id, {
    name: target.name,
    host: target.host,
    community: target.community,
    tvheadendUrl: 'http://tvheadend-new.local:9981',
    tvheadendPassword: '',
    embyApiKey: ''
  });
  assert.equal(target.mediaServices.tvheadendUrl, 'http://tvheadend-new.local:9981');
  assert.equal(target.mediaServices.tvheadendPassword, 'secret');
  assert.equal(target.mediaServices.embyApiKey, 'token');

  const fallbackData = createDefaultStore();
  fallbackData.settings.mediaServices.tvheadendPassword = 'legacy-secret';
  fallbackData.settings.mediaServices.embyApiKey = 'legacy-token';
  const fallbackTarget = addMonitoringTarget(fallbackData, {
    name: 'Site Legacy',
    host: '192.168.1.2',
    community: 'public'
  });
  updateMonitoringTarget(fallbackData, fallbackTarget.id, {
    name: fallbackTarget.name,
    host: fallbackTarget.host,
    community: fallbackTarget.community,
    embyUrl: 'http://emby.local:8096',
    embyApiKey: ''
  });
  assert.equal(fallbackTarget.mediaServices.tvheadendPassword, 'legacy-secret');
  assert.equal(fallbackTarget.mediaServices.embyApiKey, 'legacy-token');
  assert.equal(monitoringSummary(data.monitoringTargets).unknownCount, 1);
  const deleted = deleteMonitoringTarget(data, target.id);

  assert.equal(deleted.id, target.id);
  assert.equal(data.monitoringTargets.length, 0);
  assert.equal(monitoringSummary(data.monitoringTargets).targetCount, 0);
  assert.deepEqual(data.expenses, []);
  assert.deepEqual(data.externalIncomes, []);
});

test('mikrotik customer summary counts active PPPoE and hotspot interfaces from SNMP', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakenet-snmp-'));
  const oldPath = process.env.PATH;
  const snmpwalkPath = path.join(binDir, 'snmpwalk');

  fs.writeFileSync(snmpwalkPath, [
    '#!/bin/sh',
    'case "$*" in',
    '  *192.0.2.10*1.3.6.1.2.1.4.22.1.3*)',
    '    printf "%s\\n" ".1.3.6.1.2.1.4.22.1.3.1.172.16.7.10 172.16.7.10" ".1.3.6.1.2.1.4.22.1.3.2.172.16.7.11 172.16.7.11"',
    '    ;;',
    '  *192.0.2.11*1.3.6.1.2.1.4.22.1.3*)',
    '    printf "%s\\n" ".1.3.6.1.2.1.4.22.1.3.1.172.16.8.20 172.16.8.20" ".1.3.6.1.2.1.4.22.1.3.2.172.16.8.21 172.16.8.21"',
    '    ;;',
    '  *192.0.2.10*)',
    '    printf "%s\\n" "\\"<pppoe-user-1>\\"" "\\"<hotspot-user-1>\\"" "\\"pppoe-out1\\"" "\\"l2tp-vpn\\"" "\\"ether1\\""',
    '    ;;',
    '  *192.0.2.11*)',
    '    printf "%s\\n" "\\"<pppoe-user-2>\\"" "\\"<pppoe-user-3>\\""',
    '    ;;',
    '  *)',
    '    exit 1',
    '    ;;',
    'esac'
  ].join('\n'));
  fs.chmodSync(snmpwalkPath, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${oldPath || ''}`;

  try {
    const result = await mikrotikCustomerSummary([
      {
        id: 'site-a',
        name: 'Site A',
        host: '192.0.2.10',
        port: 161,
        snmpVersion: '2c',
        community: 'public'
      },
      {
        id: 'site-b',
        name: 'Site B',
        host: '192.0.2.11',
        port: 161,
        snmpVersion: '2c',
        community: 'public'
      }
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.source, 'mikrotik-snmp');
    assert.equal(result.summary.siteCount, 2);
    assert.equal(result.summary.online, 3);
    assert.equal(result.summary.pppoe, 3);
    assert.equal(result.summary.hotspot, 1);
    assert.equal(result.summary.totalCustomerInterfaces, 4);
    assert.equal(result.sites[0].online, 1);
    assert.equal(result.sites[0].totalCustomerInterfaces, 2);
    assert.deepEqual(result.sites[0].pppoeUsers.map((user) => user.username), ['user-1']);
    assert.equal(result.sites[0].pppoeUsers[0].interfaceName, 'pppoe-user-1');
    assert.equal(result.sites[0].pppoeUsers[0].ipAddress, '172.16.7.10');
    assert.deepEqual(result.sites[0].hotspotUsers.map((user) => user.username), ['user-1']);
    assert.equal(result.sites[0].hotspotUsers[0].interfaceName, 'hotspot-user-1');
    assert.equal(result.sites[0].hotspotUsers[0].ipAddress, '172.16.7.11');
    assert.deepEqual(result.sites[1].pppoeUsers.map((user) => user.username), ['user-2', 'user-3']);
    assert.deepEqual(result.sites[1].pppoeUsers.map((user) => user.ipAddress), ['172.16.8.20', '172.16.8.21']);
    assert.deepEqual(result.sites[1].hotspotUsers, []);
    assert.equal(result.sites[1].online, 2);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});
