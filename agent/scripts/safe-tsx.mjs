#!/usr/bin/env node
// Launcher that guards tsx against the macOS 104-char AF_UNIX sun_path limit.
// tsx creates its IPC pipe at $TMPDIR/tsx-<uid>/<pid>.pipe; Paperclip sets TMPDIR
// to a long per-run scratch path, which pushes that past the limit and crashes
// tsx with ENAMETOOLONG before any script code runs. If the resolved pipe path
// would be too long, re-exec tsx with a short TMPDIR instead.
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, '..');
const entry = path.resolve(pkgRoot, process.argv[2] ?? '');
const tsxCli = path.resolve(pkgRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const env = { ...process.env };
const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
const probe = path.join(os.tmpdir(), `tsx-${uid}`, '000000.pipe');
if (probe.length > 100) {
  // macOS sun_path limit is 104 bytes including NUL; stay safely under it.
  env.TMPDIR = '/tmp';
}

const r = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(3)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status ?? 1);
