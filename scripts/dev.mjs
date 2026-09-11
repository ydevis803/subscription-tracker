// Starts the API server and the Vite dev server together for `npm run dev`.
import { spawn } from 'node:child_process'
const procs = [
  // Some launchers (the Preview pane) export PORT for the web server; pin the API to its own port so the
  // server's PORT fallback (used on hosts like Railway) does not collide with Vite.
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, API_PORT: process.env.API_PORT ?? '8787' } }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit' }),
]
const stop = () => procs.forEach((p) => p.kill())
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
procs.forEach((p) => p.on('exit', (code) => { if (code && code !== 0) { stop(); process.exit(code) } }))
