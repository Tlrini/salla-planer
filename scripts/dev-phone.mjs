// Starts the dev servers so a phone on the same Wi-Fi can use its camera: browsers only allow
// the camera on HTTPS pages. Port 5173 speaks both: plain HTTP stays as usual on this computer,
// HTTPS uses a self-signed certificate for this computer's current address (kept in
// data/dev-cert, gitignored; the phone shows one warning), and a phone that asks for plain HTTP
// is sent to HTTPS. Vite itself runs on a private port behind this.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const PUBLIC_PORT = 5173;
const VITE_PORT = 5174;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'dev-cert');
const keyFile = path.join(dir, 'key.pem');
const certFile = path.join(dir, 'cert.pem');
const stamp = path.join(dir, 'address.txt');

function lanAddress() {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
  return (all.find((a) => a.address.startsWith('192.168.')) ?? all[0])?.address ?? '127.0.0.1';
}

function findOpenssl() {
  const candidates = [
    'openssl',
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files/Git/mingw64/bin/openssl.exe',
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['version'], { stdio: 'ignore' });
      return c;
    } catch {
      // try the next one
    }
  }
  console.error('OpenSSL was not found. Install Git for Windows, which includes it, and retry.');
  process.exit(1);
}

const ip = lanAddress();
if (!existsSync(certFile) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== ip) {
  mkdirSync(dir, { recursive: true });
  execFileSync(
    findOpenssl(),
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '825',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-subj',
      '/CN=Salla Planner dev',
      '-addext',
      `subjectAltName=IP:${ip},IP:127.0.0.1,DNS:localhost`,
    ],
    { stdio: 'ignore' },
  );
  writeFileSync(stamp, ip);
}

function toVite(client) {
  const upstream = net.connect(VITE_PORT, '127.0.0.1');
  const drop = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', drop);
  upstream.on('error', drop);
  client.pipe(upstream).pipe(client);
}

const secure = tls.createServer(
  { key: readFileSync(keyFile), cert: readFileSync(certFile) },
  toVite,
);
secure.on('tlsClientError', (err, socket) => {
  console.log(`[phone] secure connection refused: ${err.code ?? err.message}`);
  socket.destroy();
});

const seen = new Set();
const isLocal = (a = '') => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

const gateway = net.createServer({ pauseOnConnect: true }, (socket) => {
  socket.on('error', () => socket.destroy());
  socket.once('data', (first) => {
    socket.pause();
    const encrypted = first[0] === 0x16;
    const from = socket.remoteAddress ?? '';
    const label = `${from} ${encrypted ? 'https' : 'http'}`;
    if (!isLocal(from) && !seen.has(label)) {
      seen.add(label);
      console.log(`[phone] connected: ${label}`);
    }
    if (encrypted) {
      socket.unshift(first);
      secure.emit('connection', socket);
      process.nextTick(() => socket.resume());
      return;
    }
    if (!isLocal(from)) {
      const text = first.toString('latin1');
      const target = /^[A-Z]+ (\S+)/.exec(text)?.[1] ?? '/';
      socket.end(
        `HTTP/1.1 301 Moved Permanently\r\nLocation: https://${ip}:${PUBLIC_PORT}${target}\r\n` +
          'Content-Length: 0\r\nConnection: close\r\n\r\n',
      );
      return;
    }
    socket.unshift(first);
    toVite(socket);
    process.nextTick(() => socket.resume());
  });
  socket.resume();
});

gateway.on('error', (err) => {
  console.error(`Port ${PUBLIC_PORT} is busy (${err.code}). Close the other server and retry.`);
  process.exit(1);
});
gateway.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`\n  On this computer:                  http://localhost:${PUBLIC_PORT}`);
  console.log(`  On the phone (same Wi-Fi):         https://${ip}:${PUBLIC_PORT}\n`);
});

const child = spawn('npm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DEV_WEB_PORT: String(VITE_PORT),
    // The scan pages are off without a worker token; this one lasts for this run only.
    SCAN_WORKER_TOKEN: process.env.SCAN_WORKER_TOKEN || randomBytes(24).toString('hex'),
    // Until a GPU is connected, AI scans answer with a plain box so the flow can be tried.
    AI_SCAN_PROVIDER: process.env.AI_SCAN_PROVIDER || 'mock',
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
