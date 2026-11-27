/* global __dirname */
// Start only after owner approval for the temporary Cloudflare HTTPS preview.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const runtime = path.join(__dirname, '.runtime');
const statePath = path.join(runtime, 'phone-preview.json');
const command = process.argv[2];
const ownRunner = (pid) => Number.isInteger(pid) && spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).stdout?.includes(`${path.join(__dirname, 'phone-preview.js')} run`);

if (command === 'status') {
  const info = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  console.log(info ? JSON.stringify(info) : 'Temporary phone preview not started');
} else if (command === 'start') {
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  if (fs.existsSync(statePath)) {
    const old = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (old.status === 'running' && ownRunner(old.pid)) throw new Error('PHONE_PREVIEW_ALREADY_RUNNING');
  }
  const fd = fs.openSync(path.join(runtime, 'phone-preview.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(__dirname, 'phone-preview.js'), 'run'], { cwd: __dirname, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd); child.unref();
  console.log('Temporary preview startup requested; use status to read the protected HTTPS URL');
} else if (command === 'run') {
  const info = { pid: process.pid, status: 'running', expiresAt: Date.now() + 2 * 60 * 60 * 1000, url: null };
  const save = () => fs.writeFileSync(statePath, JSON.stringify(info), { mode: 0o600 });
  save();
  const server = spawn(process.execPath, ['--env-file-if-exists=.env.web-probe.local', 'serve-phone-preview.js'], { cwd: __dirname, stdio: ['ignore', 'inherit', 'inherit'] });
  let tunnel;
  let closing = false;
  const shutdown = () => {
    if (closing) return; closing = true; clearTimeout(expiry);
    info.status = 'closed'; save(); tunnel?.kill('SIGTERM'); server.kill('SIGTERM');
  };
  const expiry = setTimeout(shutdown, info.expiresAt - Date.now());
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown); server.on('error', shutdown); server.on('exit', shutdown);
  const waitForServer = async () => {
    for (let i = 0; i < 40 && !closing; i += 1) {
      try {
        const access = JSON.parse(fs.readFileSync(path.join(runtime, 'phone-preview-access.json'), 'utf8'));
        const response = await fetch('http://127.0.0.1:8096/__probe/health', { headers: { cookie: `travel_probe_access=${access.accessCode}` } });
        if (response.ok && (await response.json()).pid === server.pid) return;
      } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('PHONE_PREVIEW_START_NOT_CONFIRMED');
  };
  waitForServer().then(() => {
    if (closing) return;
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:AMAP_|GOOGLE_|TUNNEL_)/.test(name)));
    const config = path.join(runtime, 'phone-tunnel.yml'); fs.writeFileSync(config, 'url: http://127.0.0.1:8096\n', { mode: 0o600 });
    tunnel = spawn('cloudflared', ['tunnel', '--config', config, '--no-autoupdate', '--url', 'http://127.0.0.1:8096'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = (chunk) => {
      process.stdout.write(chunk);
      const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) { info.url = match[0]; save(); }
    };
    tunnel.stdout.on('data', log); tunnel.stderr.on('data', log); tunnel.on('error', shutdown); tunnel.on('exit', shutdown);
  }).catch(error => { console.error(error.message); shutdown(); });
} else if (command === 'stop') {
  if (fs.existsSync(statePath)) {
    const info = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (info.status === 'running' && ownRunner(info.pid)) process.kill(info.pid, 'SIGTERM');
  }
} else throw new Error('Use start/status/stop');
