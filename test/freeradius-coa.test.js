'use strict';

const assert = require('assert/strict');
const { EventEmitter } = require('events');
const test = require('node:test');
const freeradiusCoa = require('../src/freeradius-coa');

function fakeRadclient(output = 'Received Disconnect-ACK') {
  const calls = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      end(packet) {
        calls.push({ command, args, packet });
        process.nextTick(() => {
          child.stdout.emit('data', output);
          child.emit('close', 0);
        });
      }
    };
    return child;
  };
  return { calls, spawn };
}

test('CoA disconnect enriches isolated user payload with active radacct session identity', async () => {
  const radclient = fakeRadclient('Received Disconnect-ACK');
  const data = {
    radiusNas: [{
      id: 'nas-fakenet',
      name: 'FAKE.NET',
      address: '10.1.13.15',
      secret: 'rad2026',
      ports: 3799
    }],
    monitoringTargets: []
  };

  const result = await freeradiusCoa.disconnectUser(data, {
    username: 'roni',
    nasId: 'nas-fakenet',
    status: 'isolated'
  }, {
    spawn: radclient.spawn,
    activeSessions: async () => ({
      ok: true,
      rows: [{
        username: 'roni',
        sessionId: '0a000001',
        uniqueId: 'uniq-roni',
        nasIpAddress: '10.1.13.15',
        framedIpAddress: '172.16.10.20',
        callingStationId: 'AA:BB:CC:DD:EE:FF',
        nasPortId: '<pppoe-roni>'
      }]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(radclient.calls.length, 1);
  assert.match(radclient.calls[0].packet, /User-Name = "roni"/);
  assert.match(radclient.calls[0].packet, /Acct-Session-Id = "0a000001"/);
  assert.match(radclient.calls[0].packet, /Framed-IP-Address = 172\.16\.10\.20/);
  assert.match(radclient.calls[0].packet, /Calling-Station-Id = "AA:BB:CC:DD:EE:FF"/);
  assert.match(radclient.calls[0].packet, /NAS-Port-Id = "<pppoe-roni>"/);
  assert.deepEqual(radclient.calls[0].args.slice(0, 4), ['-r', '2', '-t', '4']);
});

test('CoA repeated disconnect is safe when RouterOS reports the session is already gone', async () => {
  const radclient = fakeRadclient('Received Disconnect-NAK\nError-Cause = Session-Context-Not-Found');
  const data = {
    radiusNas: [{
      id: 'nas-fakenet',
      name: 'FAKE.NET',
      address: '10.1.13.15',
      secret: 'rad2026',
      ports: 3799
    }],
    monitoringTargets: []
  };

  const result = await freeradiusCoa.disconnectUser(data, {
    username: 'roni',
    nasId: 'nas-fakenet'
  }, {
    spawn: radclient.spawn,
    activeSessions: async () => ({ ok: true, rows: [] })
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyOffline, true);
  assert.equal(radclient.calls.length, 1);
  assert.match(radclient.calls[0].packet, /User-Name = "roni"/);
});

test('CoA marks sent-only radclient output as response lost', () => {
  const parsed = freeradiusCoa.__test.parseRadclientResult(1, 'Sent Disconnect-Request Id 23 from 0.0.0.0:49791 to 10.1.13.15:3799 length 67');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.responseLost, true);
  assert.match(parsed.error, /Sent Disconnect-Request/);
});
