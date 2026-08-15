'use strict';

const { spawn } = require('child_process');
const net = require('net');
const freeradius = require('./freeradius-core');
const freeradiusSessions = require('./freeradius-sessions');

function cleanText(value) {
  return String(value || '').trim();
}

function radiusNasForUser(data = {}, user = {}) {
  const entries = freeradius.radiusNasEntries(data, { includeUnconfigured: true });
  return entries.find((nas) => nas.id === user.nasId)
    || entries.find((nas) => cleanText(nas.address).toLowerCase() === cleanText(user.nasIpAddress || user.nasAddress || user.nas).toLowerCase())
    || entries.find((nas) => cleanText(nas.name).toLowerCase() === cleanText(user.nasName || user.nas).toLowerCase())
    || entries.find((nas) => nas.active !== false && nas.secret)
    || null;
}

function radiusNasForSession(data = {}, user = {}, session = {}) {
  return radiusNasForUser(data, {
    ...user,
    nasId: session.nasId || user.nasId || '',
    nasIpAddress: session.nasIpAddress || session.nasAddress || user.nasIpAddress || user.nasAddress || '',
    nasAddress: session.nasIpAddress || session.nasAddress || user.nasAddress || '',
    nasName: session.nasName || user.nasName || '',
    nas: session.nas || session.nasName || session.nasIpAddress || user.nas || ''
  });
}

function radiusAttribute(value = '') {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function packetTextValue(attribute = '', value = '') {
  const text = cleanText(value);
  return text ? `${attribute} = "${radiusAttribute(text)}"` : '';
}

function packetIpv4Value(attribute = '', value = '') {
  const text = cleanText(value).replace(/\/32$/, '');
  return net.isIP(text) === 4 ? `${attribute} = ${text}` : '';
}

function uniqueLines(lines = []) {
  const seen = new Set();
  return lines.filter((line) => {
    const text = cleanText(line);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function noResponse(result = {}) {
  return /No response/i.test(result.output || result.error || '');
}

function sessionAlreadyGone(result = {}) {
  return /(Disconnect-NAK|Error-Cause|session|user).*?(not found|not-found|not exist|no such|unknown|already|not active|offline|tidak ditemukan)/i
    .test(result.output || result.error || '');
}

function parseRadclientResult(code, output = '') {
  const text = cleanText(output);
  const ack = /Disconnect-ACK/i.test(text);
  const nak = /Disconnect-NAK/i.test(text);
  const responseLost = /No response/i.test(text);
  const commandError = /\berror\b/i.test(text);
  const alreadyOffline = sessionAlreadyGone({ output: text });
  return {
    ok: (code === 0 && ack && !commandError) || alreadyOffline,
    alreadyOffline,
    responseLost,
    nak,
    error: (code === 0 && ack && !commandError) || alreadyOffline
      ? ''
      : (text || `radclient keluar dengan status ${code}`)
  };
}

function runRadclient(nas = {}, packet = '', runtime = {}) {
  return new Promise((resolve) => {
    const address = cleanText(nas.address);
    const secret = cleanText(nas.secret);
    const port = Math.max(1, Math.min(65535, Number(nas.ports || nas.port || 3799) || 3799));
    const spawnFn = runtime.spawn || spawn;
    if (!address || !secret) {
      resolve({ ok: false, skipped: true, error: 'NAS CoA belum lengkap' });
      return;
    }
    const retries = Math.max(1, Math.min(3, Number(runtime.retries || process.env.RADIUS_COA_RETRIES || 2) || 2));
    const timeout = Math.max(2, Math.min(8, Number(runtime.timeout || process.env.RADIUS_COA_TIMEOUT_SECONDS || 4) || 4));
    const child = spawnFn('radclient', ['-r', String(retries), '-t', String(timeout), `${address}:${port}`, 'disconnect', secret], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message || 'radclient gagal dijalankan' });
    });
    child.on('close', (code) => {
      const output = `${stdout}\n${stderr}`.trim();
      const parsed = parseRadclientResult(code, output);
      resolve({
        ok: parsed.ok,
        alreadyOffline: parsed.alreadyOffline,
        responseLost: parsed.responseLost,
        nak: parsed.nak,
        code,
        output,
        error: parsed.error
      });
    });
    child.stdin.end(packet);
  });
}

function sessionFromPayload(user = {}) {
  return {
    username: cleanText(user.username),
    nasId: cleanText(user.nasId),
    nas: cleanText(user.nas),
    nasName: cleanText(user.nasName),
    nasIpAddress: cleanText(user.nasIpAddress || user.nasAddress),
    acctSessionId: cleanText(user.acctSessionId || user.sessionId),
    sessionId: cleanText(user.sessionId || user.acctSessionId),
    acctUniqueId: cleanText(user.acctUniqueId || user.uniqueId),
    framedIpAddress: cleanText(user.framedIpAddress || user.ipAddress),
    ipAddress: cleanText(user.ipAddress || user.framedIpAddress),
    callingStationId: cleanText(user.callingStationId || user.macAddress || user.callerId),
    calledStationId: cleanText(user.calledStationId),
    nasPortId: cleanText(user.nasPortId),
    nasPortType: cleanText(user.nasPortType)
  };
}

function sessionHasDisconnectIdentity(session = {}) {
  return Boolean(cleanText(session.acctSessionId || session.sessionId)
    || cleanText(session.framedIpAddress || session.ipAddress)
    || cleanText(session.callingStationId || session.macAddress)
    || cleanText(session.nasPortId));
}

async function activeSessionsForUser(username = '', runtime = {}) {
  const reader = runtime.activeSessions || freeradiusSessions.activeSessions;
  try {
    const payload = await reader({
      usernames: [username],
      limit: runtime.sessionLimit || 8,
      allowCache: false,
      ignoreStale: true
    });
    if (!payload?.ok || !Array.isArray(payload.rows)) return [];
    return payload.rows.filter((session) => cleanText(session.username).toLowerCase() === cleanText(username).toLowerCase());
  } catch {
    return [];
  }
}

function dedupeSessions(sessions = []) {
  const seen = new Set();
  const result = [];
  for (const session of sessions) {
    const key = [
      cleanText(session.nasId || session.nasIpAddress || session.nasName),
      cleanText(session.acctSessionId || session.sessionId),
      cleanText(session.framedIpAddress || session.ipAddress),
      cleanText(session.callingStationId || session.macAddress),
      cleanText(session.nasPortId)
    ].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(session);
  }
  return result;
}

function packetLinesForSession(username = '', nas = {}, session = {}, minimal = false) {
  const nasIpAddress = session.nasIpAddress || session.nasAddress || nas.address;
  const baseLines = [
    packetTextValue('User-Name', username),
    packetIpv4Value('NAS-IP-Address', nasIpAddress)
  ];
  if (minimal) return uniqueLines(baseLines);
  return uniqueLines([
    ...baseLines,
    packetTextValue('Acct-Session-Id', session.acctSessionId || session.sessionId),
    packetIpv4Value('Framed-IP-Address', session.framedIpAddress || session.ipAddress),
    packetTextValue('Calling-Station-Id', session.callingStationId || session.macAddress || session.callerId),
    packetTextValue('Called-Station-Id', session.calledStationId),
    packetTextValue('NAS-Port-Id', session.nasPortId)
  ]);
}

function attemptSummary(mode = '', nas = {}, result = {}, lines = []) {
  return {
    mode,
    ok: result.ok === true,
    alreadyOffline: result.alreadyOffline === true,
    responseLost: result.responseLost === true,
    code: result.code,
    output: result.output || '',
    nas: nas.name || nas.address || '',
    attributes: lines.map((line) => line.split('=')[0].trim()).filter(Boolean)
  };
}

async function disconnectUser(data = {}, user = {}, runtime = {}) {
  const username = cleanText(user.username);
  if (!username) {
    return { ok: false, skipped: true, error: 'Username Radius kosong' };
  }
  const activeSessions = await activeSessionsForUser(username, runtime);
  const payloadSession = sessionFromPayload(user);
  const sessions = dedupeSessions([
    ...activeSessions.map((session) => sessionFromPayload({
      ...session,
      username,
      acctSessionId: session.acctSessionId || session.sessionId,
      sessionId: session.sessionId || session.acctSessionId,
      acctUniqueId: session.acctUniqueId || session.uniqueId,
      framedIpAddress: session.framedIpAddress || session.ipAddress,
      ipAddress: session.ipAddress || session.framedIpAddress,
      callingStationId: session.callingStationId || session.macAddress,
      calledStationId: session.calledStationId,
      nasIpAddress: session.nasIpAddress || session.nasAddress,
      nasPortId: session.nasPortId,
      nasPortType: session.nasPortType
    })),
    ...(sessionHasDisconnectIdentity(payloadSession) ? [payloadSession] : []),
    payloadSession
  ]);
  const attempts = [];
  let firstFailure = null;
  for (const session of sessions) {
    const nas = radiusNasForSession(data, user, session);
    if (!nas) {
      firstFailure = firstFailure || { ok: false, skipped: true, error: 'NAS Radius tidak ditemukan' };
      continue;
    }
    const hasIdentity = sessionHasDisconnectIdentity(session);
    const fullLines = packetLinesForSession(username, nas, session, !hasIdentity);
    const first = await runRadclient(nas, `${fullLines.join('\n')}\n`, runtime);
    attempts.push(attemptSummary(hasIdentity ? 'session' : 'username', nas, first, fullLines));
    if (first.ok) {
      return {
        ...first,
        attempts,
        nas: nas.name || nas.address || '',
        username,
        activeSessions: activeSessions.length
      };
    }
    firstFailure = firstFailure || first;
    if (hasIdentity && !noResponse(first)) {
      const minimalLines = packetLinesForSession(username, nas, session, true);
      const fallback = await runRadclient(nas, `${minimalLines.join('\n')}\n`, runtime);
      attempts.push(attemptSummary('username', nas, fallback, minimalLines));
      if (fallback.ok) {
        return {
          ...fallback,
          attempts,
          nas: nas.name || nas.address || '',
          username,
          activeSessions: activeSessions.length
        };
      }
      firstFailure = firstFailure || fallback;
    }
  }
  return {
    ...(firstFailure || { ok: false, skipped: true, error: 'NAS Radius tidak ditemukan' }),
    attempts,
    nas: attempts.find((attempt) => attempt.nas)?.nas || '',
    username,
    activeSessions: activeSessions.length
  };
}

module.exports = {
  disconnectUser,
  __test: {
    activeSessionsForUser,
    dedupeSessions,
    packetLinesForSession,
    parseRadclientResult,
    sessionAlreadyGone,
    sessionFromPayload
  }
};
