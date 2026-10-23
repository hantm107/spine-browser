const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const env = { ...process.env };
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-electron-test-'));
env.SPINE_TEST_DIR = scratch;
// Some coding terminals set this for their own tooling.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
  cwd: path.join(__dirname, '..'), env, windowsHide: true, stdio: 'inherit',
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => {
  fs.rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }, error => {
    if (error) console.error('Test scratch cleanup failed:', error.message);
    process.exitCode = code ?? 1;
  });
});
