import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [spawn(process.execPath, ['backend/index.js'], { cwd: root, stdio: 'inherit' }), spawn('npm', ['run', 'dev', '--workspace', 'frontend', '--', '--port', '5173', '--strictPort'], { cwd: root, stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); process.exitCode = code; }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) { child.on('error', error => { console.error(error.message); stop(1); }); child.on('exit', code => { if (!stopping) stop(code || 0); }); }
