const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-window-state-ui-'));

(async () => {
  for (const phase of ['save', 'restore-maximized', 'restore-normal', 'corrupt']) {
    if (phase === 'corrupt') fs.writeFileSync(path.join(scratch, 'profile', 'window-state.json'), 'broken JSON');
    const env = { ...process.env, SPINE_WINDOW_TEST_DIR:scratch, SPINE_WINDOW_TEST_PHASE:phase };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [path.join(__dirname, 'window-state-smoke.cjs')], {
        env, cwd:path.resolve(__dirname, '..'), windowsHide:true, stdio:'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(Error(`Window persistence phase ${phase} failed (${code}).`)));
    });
  }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => {
  fs.rmSync(scratch, {recursive:true,force:true,maxRetries:5,retryDelay:150});
});
