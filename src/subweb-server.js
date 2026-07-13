'use strict';

const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const SUBWEB_KIND = String(process.env.SUBWEB_KIND || 'all').trim().toLowerCase();
const HOST = process.env.SUBWEB_HOST || process.env.HOST || '0.0.0.0';
const BILLING_BASE_URL = process.env.BILLING_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 8891)}`;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SUBWEB_PORTS = {
  isolir: Number(process.env.ISOLIR_PORT || 8892),
  voucher: Number(process.env.VOUCHER_PORT || 8893),
  wifiku: Number(process.env.WIFIKU_PORT || 8894)
};
const PORT = Number(
  process.env[`SUBWEB_${SUBWEB_KIND.toUpperCase()}_PORT`]
  || process.env[`${SUBWEB_KIND.toUpperCase()}_PORT`]
  || (SUBWEB_KIND === 'all' ? process.env.SUBWEB_PORT : '')
  || SUBWEB_PORTS[SUBWEB_KIND]
  || 8893
);
const PUBLIC_URLS = {
  isolir: process.env.ISOLIR_PUBLIC_URL || process.env.PUBLIC_ISOLIR_URL || '',
  voucher: process.env.VOUCHER_PUBLIC_URL || process.env.PUBLIC_VOUCHER_URL || '',
  wifiku: process.env.WIFIKU_PUBLIC_URL || process.env.PUBLIC_WIFIKU_URL || '',
  payment: process.env.PAYMENT_PUBLIC_URL || process.env.PUBLIC_PAYMENT_URL || ''
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const COMMON_FILES = new Set([
  '/fakenet-logo.png',
  '/favicon.ico'
]);

const PAYMENT_FILES = new Set([
  '/payment-invoice.html',
  '/payment-invoice.css',
  '/payment-invoice.js'
]);

const SUBWEB_CONFIG = {
  isolir: {
    root: '/isolir.html',
    paths: new Map([
      ['/', '/isolir.html'],
      ['/isolir', '/isolir.html'],
      ['/isolir/', '/isolir.html'],
      ['/payment', '/payment-invoice.html'],
      ['/payment/', '/payment-invoice.html']
    ]),
    files: new Set([
      '/isolir.html',
      '/isolir.css',
      '/isolir.js',
      ...PAYMENT_FILES,
      ...COMMON_FILES
    ])
  },
  voucher: {
    root: '/order-voucher.html',
    paths: new Map([
      ['/', '/order-voucher.html'],
      ['/voucher', '/order-voucher.html'],
      ['/voucher/', '/order-voucher.html']
    ]),
    files: new Set([
      '/order-voucher.html',
      '/buy.html',
      '/status-order.html',
      '/hotspot-voucher.html',
      '/hotspot-voucher.css',
      '/hotspot-voucher.js',
      ...COMMON_FILES
    ])
  },
  wifiku: {
    root: '/wifiku.html',
    paths: new Map([
      ['/', '/wifiku.html'],
      ['/wifiku', '/wifiku.html'],
      ['/wifiku/', '/wifiku.html'],
      ['/payment', '/payment-invoice.html'],
      ['/payment/', '/payment-invoice.html']
    ]),
    files: new Set([
      '/wifiku.html',
      '/wifiku.css',
      '/wifiku.js',
      ...PAYMENT_FILES,
      ...COMMON_FILES
    ])
  }
};

const ALL_PUBLIC_PATHS = new Map([
  ['/', '/isolir.html'],
  ['/isolir', '/isolir.html'],
  ['/isolir/', '/isolir.html'],
  ['/voucher', '/order-voucher.html'],
  ['/voucher/', '/order-voucher.html'],
  ['/wifiku', '/wifiku.html'],
  ['/wifiku/', '/wifiku.html'],
  ['/payment', '/payment-invoice.html'],
  ['/payment/', '/payment-invoice.html']
]);

const ALL_PUBLIC_FILES = new Set([
  '/isolir.html',
  '/isolir.css',
  '/isolir.js',
  '/order-voucher.html',
  '/buy.html',
  '/status-order.html',
  '/hotspot-voucher.html',
  '/hotspot-voucher.css',
  '/hotspot-voucher.js',
  '/wifiku.html',
  '/wifiku.css',
  '/wifiku.js',
  '/payment-invoice.html',
  '/payment-invoice.css',
  '/payment-invoice.js',
  ...COMMON_FILES
]);

function activeConfig() {
  if (SUBWEB_KIND === 'all') {
    return {
      root: '/isolir.html',
      paths: ALL_PUBLIC_PATHS,
      files: ALL_PUBLIC_FILES
    };
  }
  return SUBWEB_CONFIG[SUBWEB_KIND] || SUBWEB_CONFIG.isolir;
}

function cacheControl(ext = '') {
  if (['.html', '.js', '.css'].includes(ext)) return 'no-store';
  return 'public, max-age=86400';
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'Halaman subweb tidak tersedia' });
}

function mappedStaticPath(pathname = '') {
  const config = activeConfig();
  const direct = config.paths.get(pathname);
  if (direct) return direct;
  if (config.files.has(pathname)) return pathname;
  if (pathname.startsWith('/voucher/')) {
    const nested = `/${pathname.slice('/voucher/'.length)}`;
    if (config.files.has(nested)) return nested;
  }
  if (pathname.startsWith('/wifiku/')) {
    const nested = `/${pathname.slice('/wifiku/'.length)}`;
    if (config.files.has(nested)) return nested;
  }
  if (pathname.startsWith('/isolir/')) {
    const nested = `/${pathname.slice('/isolir/'.length)}`;
    if (config.files.has(nested)) return nested;
  }
  return '';
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${PORT}`).split(',')[0].trim();
  return `${proto}://${host}`;
}

function urlWithPort(req, port, pathname = '/') {
  const url = new URL(requestOrigin(req));
  url.port = String(port);
  url.pathname = pathname;
  url.search = '';
  return url.toString();
}

function normalizePublicUrl(value = '', fallbackPath = '/') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.pathname === '/' && fallbackPath !== '/') {
      url.pathname = fallbackPath;
    }
    return url.toString();
  } catch {
    return '';
  }
}

function subwebUrls(req) {
  const isolir = normalizePublicUrl(PUBLIC_URLS.isolir, '/isolir') || urlWithPort(req, SUBWEB_PORTS.isolir, '/isolir');
  return {
    isolir,
    voucher: normalizePublicUrl(PUBLIC_URLS.voucher, '/voucher') || urlWithPort(req, SUBWEB_PORTS.voucher, '/voucher'),
    wifiku: normalizePublicUrl(PUBLIC_URLS.wifiku, '/wifiku') || urlWithPort(req, SUBWEB_PORTS.wifiku, '/wifiku'),
    payment: normalizePublicUrl(PUBLIC_URLS.payment, '/payment-invoice.html') || new URL('/payment-invoice.html', isolir).toString()
  };
}

function redirectKnownSubweb(req, res, pathname = '') {
  const urls = subwebUrls(req);
  const redirects = [
    { kind: 'isolir', match: pathname === '/isolir' || pathname.startsWith('/isolir/') },
    { kind: 'voucher', match: pathname === '/voucher' || pathname.startsWith('/voucher/') },
    { kind: 'wifiku', match: pathname === '/wifiku' || pathname.startsWith('/wifiku/') }
  ];
  const target = redirects.find((item) => item.match && SUBWEB_KIND !== 'all' && SUBWEB_KIND !== item.kind);
  if (!target) return false;
  res.writeHead(302, {
    Location: urls[target.kind],
    'Cache-Control': 'no-store'
  });
  res.end();
  return true;
}

async function serveStatic(res, pathname = '') {
  const publicPath = mappedStaticPath(pathname);
  if (!publicPath) {
    notFound(res);
    return;
  }
  const filePath = path.normalize(path.join(PUBLIC_DIR, publicPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cacheControl(ext)
    });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      notFound(res);
      return;
    }
    sendJson(res, 500, { ok: false, error: error.message || 'Subweb gagal membaca file' });
  }
}

function proxyTargetUrl(reqUrl = '/') {
  const base = new URL(BILLING_BASE_URL);
  const target = new URL(reqUrl, base);
  target.protocol = base.protocol;
  target.host = base.host;
  return target;
}

function proxyToBilling(req, res) {
  const target = proxyTargetUrl(req.url || '/');
  const headers = {
    ...req.headers,
    host: target.host,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': 'http',
    'x-forwarded-by': `fakenet-billing-${SUBWEB_KIND}`
  };
  const proxyReq = http.request(target, {
    method: req.method,
    headers
  }, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['transfer-encoding'];
    res.writeHead(proxyRes.statusCode || 502, responseHeaders);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (error) => {
    sendJson(res, 502, {
      ok: false,
      error: `Billing utama tidak bisa dihubungi: ${error.message || error}`
    });
  });
  req.pipe(proxyReq);
}

function shouldProxy(pathname = '') {
  return pathname.startsWith('/api/')
    || pathname.startsWith('/payment-gateway/')
    || pathname === '/payment-gateway'
    || pathname.startsWith('/webhook/');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (url.pathname === '/api/public/subweb-config') {
      sendJson(res, 200, {
        ok: true,
        kind: SUBWEB_KIND,
        ports: SUBWEB_PORTS,
        urls: subwebUrls(req)
      });
      return;
    }
    if (shouldProxy(url.pathname)) {
      proxyToBilling(req, res);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      sendJson(res, 405, { ok: false, error: 'Method tidak didukung di subweb' });
      return;
    }
    if (redirectKnownSubweb(req, res, decodeURIComponent(url.pathname))) {
      return;
    }
    await serveStatic(res, decodeURIComponent(url.pathname));
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Subweb error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FAKE.NET Billing subweb ${SUBWEB_KIND} berjalan di http://${HOST}:${PORT}`);
  console.log(`Proxy API subweb menuju ${BILLING_BASE_URL}`);
});
