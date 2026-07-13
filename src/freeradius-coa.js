'use strict';

const { spawn } = require('child_process');
const net = require('net');
const freeradius = require('./freeradius-core');

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

function runRadclient(nas = {}, packet = '') {
  return new Promise((resolve) => {
    const address = cleanText(nas.address);
    const secret = cleanText(nas.secret);
    const port = Math.max(1, Math.min(65535, Number(nas.ports || nas.port || 3799) || 3799));
    if (!address || !secret) {
      resolve({ ok: false, skipped: true, error: 'NAS CoA belum lengkap' });
      return;
    }
    const child = spawn('radclient', ['-r', '1', '-t', '3', `${address}:${port}`, 'disconnect', secret], {
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
      resolve({
        ok: code === 0 && !/(Disconnect-NAK|No response|error)/i.test(output),
        code,
        output,
        error: code === 0 && !/(Disconnect-NAK|No response|error)/i.test(output)
          ? ''
          : (output || `radclient keluar dengan status ${code}`)
      });
    });
    child.stdin.end(packet);
  });
}

async function disconnectUser(data = {}, user = {}) {
  const username = cleanText(user.username);
  if (!username) {
    return { ok: false, skipped: true, error: 'Username Radius kosong' };
  }
  const nas = radiusNasForUser(data, user);
  if (!nas) {
    return { ok: false, skipped: true, error: 'NAS Radius tidak ditemukan' };
  }
  const nasIpAddress = user.nasIpAddress || user.nasAddress || nas.address;
  const baseLines = [
    packetTextValue('User-Name', username),
    packetIpv4Value('NAS-IP-Address', nasIpAddress)
  ];
  const fullLines = uniqueLines([
    ...baseLines,
    packetTextValue('Acct-Session-Id', user.acctSessionId || user.sessionId),
    packetIpv4Value('Framed-IP-Address', user.framedIpAddress || user.ipAddress),
    packetTextValue('Calling-Station-Id', user.callingStationId || user.macAddress || user.callerId),
    packetTextValue('Called-Station-Id', user.calledStationId),
    packetTextValue('NAS-Port-Id', user.nasPortId)
  ]);
  const minimalLines = uniqueLines(baseLines);
  const firstPacket = `${fullLines.join('\n')}\n`;
  const first = await runRadclient(nas, firstPacket);
  const attempts = [{
    mode: 'session',
    ok: first.ok === true,
    code: first.code,
    output: first.output || '',
    attributes: fullLines.map((line) => line.split('=')[0].trim()).filter(Boolean)
  }];
  let result = first;
  if (!first.ok && fullLines.length > minimalLines.length && !noResponse(first)) {
    const fallback = await runRadclient(nas, `${minimalLines.join('\n')}\n`);
    attempts.push({
      mode: 'username',
      ok: fallback.ok === true,
      code: fallback.code,
      output: fallback.output || '',
      attributes: minimalLines.map((line) => line.split('=')[0].trim()).filter(Boolean)
    });
    result = fallback.ok ? fallback : first;
  }
  return {
    ...result,
    attempts,
    nas: nas.name || nas.address || '',
    username
  };
}

module.exports = {
  disconnectUser
};
