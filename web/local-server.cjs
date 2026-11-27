/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const origin = 'http://127.0.0.1:8098';
const runtime = path.join(__dirname, '.runtime');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function health() {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error('PORT_USED_BY_DIFFERENT_SERVER');
    const data = await response.json();
    if (data.application !== 'travel-web' || !Number.isInteger(data.pid)) {
      throw new Error('PORT_USED_BY_DIFFERENT_SERVER');
    }
    return data;
  } catch (error) {
    if (error.message === 'PORT_USED_BY_DIFFERENT_SERVER') throw error;
    return null;
  }
}

async function main() {
  const command = process.argv[2] || 'status';
  const current = await health();
  if (command === 'status') {
    console.log(current ? `网页正在运行：${origin}（PID ${current.pid}）` : '网页未启动');
    return;
  }
  if (command === 'stop') {
    if (!current) { console.log('网页已停止'); return; }
    // Only the exact named prototype server identified by its health endpoint.
    process.kill(current.pid, 'SIGTERM');
    for (let i = 0; i < 20; i += 1) {
      if (!(await health())) { console.log('网页已停止'); return; }
      await delay(100);
    }
    throw new Error('SERVER_STOP_NOT_CONFIRMED');
  }
  if (command !== 'start') throw new Error('Use start, status or stop');
  if (current) { console.log(`网页已经运行：${origin}（PID ${current.pid}）`); return; }
  if (!fs.existsSync(path.join(__dirname, 'dist/index.html'))) throw new Error('请先运行 npm run build');
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const log = fs.openSync(path.join(runtime, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server.cjs'], {
    cwd: __dirname, detached: true, stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  child.unref();
  for (let i = 0; i < 30; i += 1) {
    if (spawnError) throw new Error('LOCAL_SERVER_SPAWN_FAILED');
    await delay(100);
    const ready = await health();
    if (ready) {
      fs.writeFileSync(path.join(runtime, 'server.pid'), `${ready.pid}\n`, { mode: 0o600 });
      console.log(`网页已在独立后台进程启动：${origin}（PID ${ready.pid}）`);
      return;
    }
  }
  throw new Error('启动未确认，请查看 .runtime/server.log');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
