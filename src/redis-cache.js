'use strict';

const net = require('net');
const tls = require('tls');

const DEFAULT_TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS || 1000);
const DEFAULT_TTL_SECONDS = Number(process.env.REDIS_CACHE_TTL_SECONDS || 60);

function enabled() {
  return Boolean(process.env.REDIS_URL) && process.env.REDIS_CACHE !== '0';
}

function parseUrl() {
  if (!enabled()) {
    return null;
  }

  const url = new URL(process.env.REDIS_URL);
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error('REDIS_URL harus memakai redis:// atau rediss://');
  }

  const db = url.pathname && url.pathname !== '/'
    ? Number(url.pathname.slice(1))
    : 0;

  return {
    tls: url.protocol === 'rediss:',
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    db: Number.isFinite(db) ? db : 0
  };
}

function encodeCommand(parts) {
  const chunks = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const text = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
    chunks.push(`$${text.length}\r\n`, text, '\r\n');
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
}

function lineEnd(buffer, offset) {
  for (let index = offset; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      return index;
    }
  }
  return -1;
}

function parseResp(buffer, offset = 0) {
  if (offset >= buffer.length) {
    return null;
  }

  const type = String.fromCharCode(buffer[offset]);
  if (['+', '-', ':'].includes(type)) {
    const end = lineEnd(buffer, offset + 1);
    if (end === -1) return null;
    const text = buffer.slice(offset + 1, end).toString('utf8');
    if (type === '-') {
      throw new Error(`Redis ${text}`);
    }
    return {
      value: type === ':' ? Number(text) : text,
      offset: end + 2
    };
  }

  if (type === '$') {
    const end = lineEnd(buffer, offset + 1);
    if (end === -1) return null;
    const length = Number(buffer.slice(offset + 1, end).toString('utf8'));
    if (length === -1) {
      return { value: null, offset: end + 2 };
    }
    const start = end + 2;
    const next = start + length + 2;
    if (buffer.length < next) return null;
    return {
      value: buffer.slice(start, start + length).toString('utf8'),
      offset: next
    };
  }

  if (type === '*') {
    const end = lineEnd(buffer, offset + 1);
    if (end === -1) return null;
    const length = Number(buffer.slice(offset + 1, end).toString('utf8'));
    if (length === -1) {
      return { value: null, offset: end + 2 };
    }
    const items = [];
    let nextOffset = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = parseResp(buffer, nextOffset);
      if (!parsed) return null;
      items.push(parsed.value);
      nextOffset = parsed.offset;
    }
    return { value: items, offset: nextOffset };
  }

  throw new Error('Respons Redis tidak valid');
}

async function execute(command) {
  const config = parseUrl();
  if (!config) {
    return null;
  }

  const setup = [];
  if (config.password && config.username) {
    setup.push(['AUTH', config.username, config.password]);
  } else if (config.password) {
    setup.push(['AUTH', config.password]);
  }
  if (config.db) {
    setup.push(['SELECT', String(config.db)]);
  }

  const commands = setup.concat([command]);
  const payload = Buffer.concat(commands.map(encodeCommand));

  return new Promise((resolve, reject) => {
    const socket = config.tls
      ? tls.connect({ host: config.host, port: config.port })
      : net.createConnection({ host: config.host, port: config.port });
    const chunks = [];
    let settled = false;

    function finish(error, value) {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    socket.setTimeout(Number.isFinite(DEFAULT_TIMEOUT_MS) ? DEFAULT_TIMEOUT_MS : 1000);
    socket.on('timeout', () => finish(new Error('Redis timeout')));
    socket.on('error', finish);
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      let offset = 0;
      const replies = [];
      try {
        while (replies.length < commands.length) {
          const parsed = parseResp(buffer, offset);
          if (!parsed) return;
          replies.push(parsed.value);
          offset = parsed.offset;
        }
        finish(null, replies[replies.length - 1]);
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function get(key) {
  return execute(['GET', key]);
}

async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    return execute(['SET', key, value, 'EX', String(Math.floor(ttlSeconds))]);
  }
  return execute(['SET', key, value]);
}

async function del(key) {
  return execute(['DEL', key]);
}

async function ping() {
  return execute(['PING']);
}

function safeStatus() {
  return {
    mode: enabled() ? 'redis' : 'none',
    key: process.env.REDIS_STORE_KEY || '',
    ttlSeconds: Number.isFinite(DEFAULT_TTL_SECONDS) ? DEFAULT_TTL_SECONDS : 60
  };
}

module.exports = {
  del,
  enabled,
  get,
  ping,
  safeStatus,
  set
};
