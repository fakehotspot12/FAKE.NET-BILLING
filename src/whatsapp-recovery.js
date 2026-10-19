'use strict';

const LOCAL_GATEWAY_UNIT = 'fakenet-billing-waha.service';

async function restartLocalGateway(baseUrl, execute) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password) {
    throw new Error('Pemulihan layanan hanya tersedia untuk gateway lokal.');
  }
  // No shell or user-supplied service names are accepted here.
  await execute('/usr/bin/systemctl', ['restart', '--no-block', LOCAL_GATEWAY_UNIT], {
    timeout: 10000, maxBuffer: 16384
  });
}

function createGatewayRecovery({ keyFor, getStatus, connectSession, restartService, isConnected, needsQr,
  onFinished = async () => {}, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  cooldownMs = 300000, sessionWaitMs = 45000, serviceWaitMs = 120000, pollMs = 3000 }) {
  const jobs = new Map();
  const ready = status => status && (isConnected(status) || needsQr(status));
  const snapshot = job => job ? {
    running: job.running, phase: job.phase, startedAt: job.startedAt, finishedAt: job.finishedAt,
    status: job.status, error: job.error, serviceRestarted: job.serviceRestarted,
    retryAfterSeconds: Math.max(0, Math.ceil((job.retryAt - now()) / 1000))
  } : { running: false, phase: 'idle', retryAfterSeconds: 0 };
  const check = async (settings, job) => {
    try {
      job.status = await getStatus(settings);
      return job.status;
    } catch (error) {
      if ([401, 403].includes(Number(error.status))) {
        throw new Error('Akses gateway ditolak. Periksa konfigurasi gateway.');
      }
      job.status = null;
      return null;
    }
  };
  const waitReady = async (settings, job, duration) => {
    const deadline = now() + duration;
    do {
      if (ready(await check(settings, job))) return true;
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await wait(Math.min(pollMs, remaining));
    } while (now() <= deadline);
    return false;
  };
  const run = async (settings, job, actor) => {
    try {
      if (!ready(await check(settings, job))) {
        job.phase = 'session';
        try {
          await connectSession(settings);
        } catch (error) {
          if ([401, 403].includes(Number(error.status))) throw new Error('Akses gateway ditolak. Periksa konfigurasi gateway.');
        }
        if (!await waitReady(settings, job, sessionWaitMs)) {
          job.phase = 'service';
          await restartService(settings);
          job.serviceRestarted = true;
          job.phase = 'waiting';
          if (!await waitReady(settings, job, serviceWaitMs)) {
            throw new Error('Gateway belum tersambung. Periksa koneksi internet lalu coba lagi setelah jeda pemulihan.');
          }
        }
      } else job.retryAt = 0;
      job.phase = isConnected(job.status) ? 'connected' : 'qr';
      if (job.phase === 'qr') job.retryAt = 0;
    } catch (error) {
      job.phase = 'failed';
      job.error = /gateway lokal|Akses gateway ditolak|Gateway belum tersambung/.test(error.message)
        ? error.message : 'Gateway belum bisa dipulihkan. Silakan hubungi admin server.';
    } finally {
      job.running = false;
      job.finishedAt = new Date(now()).toISOString();
      await onFinished(snapshot(job), actor).catch(error => console.error(`Audit pemulihan WA gagal: ${error.message}`));
    }
  };
  return {
    status: settings => snapshot(jobs.get(keyFor(settings))),
    start(settings, actor = {}) {
      const key = keyFor(settings);
      const current = jobs.get(key);
      if (current?.running) return { accepted: false, ...snapshot(current) };
      if (current?.retryAt > now()) return { accepted: false, ...snapshot(current), phase: 'cooldown', status: null };
      const job = { running: true, phase: 'checking', startedAt: new Date(now()).toISOString(),
        finishedAt: null, status: null, error: '', serviceRestarted: false, retryAt: now() + cooldownMs };
      jobs.set(key, job);
      job.promise = Promise.resolve().then(() => run(settings, job, actor));
      return { accepted: true, ...snapshot(job) };
    },
    waitForIdle: settings => jobs.get(keyFor(settings))?.promise
  };
}

module.exports = { createGatewayRecovery, restartLocalGateway };
