'use strict';

// Workflow fixtures begin after two prior spaced LOS readings. Lifecycle tests
// exercise real first/second/third observations without this fixture helper.
module.exports = function priorLosReads(data, observations) {
  const interval = require('../../src/olt-los-confirmation').INTERVAL_MS;
  const devices = new Map((data.oltDevices || []).map(row => [row.id, row]));
  const ids = new Set(observations.map(row => row.deviceId));
  data.oltLosObservations = (data.oltLosObservations || []).filter(row => !ids.has(row.oltId));
  for (const observation of observations) {
    const device = devices.get(observation.deviceId), at = Date.parse(observation.snapshot?.checkedAt);
    if (!device || !Number.isFinite(at)) continue;
    for (const row of observation.snapshot?.onus || []) {
      if (row.status !== 'offline' || row.condition !== 'los' || row.causeKnown !== true || row.downCause !== 'LOS') continue;
      data.oltLosObservations.push({ oltId: device.id, revision: String(device.updatedAt || ''), serialNumber: row.serialNumber,
        onuIndex: String(row.id || ''), pon: String(row.ponKey || ''), firstAt: at - 2 * interval,
        countedAt: at - interval, lastAt: at - interval, count: 2 });
    }
  }
};
