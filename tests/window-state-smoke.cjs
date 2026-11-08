const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const phase = process.env.SPINE_WINDOW_TEST_PHASE;
app.setPath('userData', path.join(process.env.SPINE_WINDOW_TEST_DIR, 'profile'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i=0;i<100;i++) { if (check()) return; await wait(50); }
  throw Error(`Window state timed out in ${phase}.`);
}
const normal = win => { const {width,height}=win.getNormalBounds(); return [width,height]; };
async function close(win) {
  const closed=new Promise(resolve=>win.once('closed',resolve)); win.close(); await closed;
}
async function openImport(main) {
  const created=new Promise(resolve=>app.once('browser-window-created',(_event,win)=>{
    win.webContents.once('did-finish-load',()=>resolve(win));
  }));
  await main.webContents.executeJavaScript('window.spineApi.openImportWorkspace()');
  return created;
}
const deadline=setTimeout(()=>{console.error('Window state test timed out:',phase);app.exit(1);},30000);
app.once('browser-window-created',(_event,main)=>{
  main.webContents.once('did-finish-load',()=>run(main).then(()=>{
    clearTimeout(deadline);app.quit();
  }).catch(error=>{console.error(error);app.exit(1);}));
});
require(path.join(process.env.SPINE_WINDOW_APP_ROOT || path.resolve(__dirname,'..'), 'src/main.js'));

async function run(main) {
  if (phase==='save') {
    assert.deepEqual(main.getSize(),[1200,850]);
    main.setSize(1180,760);
    const first=await openImport(main);first.setSize(1220,780);await close(first);
    const importer=await openImport(main);
    assert.deepEqual(importer.getSize(),[1220,780]);
    assert.deepEqual(main.getSize(),[1180,760]);
    console.log('PASS main and importer retain independent sizes when the importer reopens');
    main.maximize(); importer.maximize();
    await until(()=>main.isMaximized()&&importer.isMaximized());
    assert.deepEqual(normal(main),[1180,760]);
    assert.deepEqual(normal(importer),[1220,780]);
    main.minimize();
    await until(()=>main.isMinimized());
  } else if (phase==='restore-maximized') {
    await until(()=>main.isMaximized());
    assert.deepEqual(normal(main),[1180,760]);
    const importer=await openImport(main);
    await until(()=>importer.isMaximized());
    assert.deepEqual(normal(importer),[1220,780]);
    console.log('PASS both windows restore maximized state and normal sizes after a complete app restart');
    main.unmaximize();importer.unmaximize();
    await until(()=>!main.isMaximized()&&!importer.isMaximized());
    main.setSize(1260,790);main.minimize();
    await until(()=>main.isMinimized());
  } else if (phase==='restore-normal') {
    assert.equal(main.isMaximized(),false);assert.equal(main.isMinimized(),false);
    assert.deepEqual(main.getSize(),[1260,790]);
    const importer=await openImport(main);
    assert.equal(importer.isMaximized(),false);
    assert.deepEqual(importer.getSize(),[1220,780]);
    assert.equal(BrowserWindow.getAllWindows().length,2);
    console.log('PASS a minimized app reopens normally with the last restored size, independently of the importer');
  } else {
    assert.equal(main.isMaximized(),false);assert.deepEqual(main.getSize(),[1200,850]);
    console.log('PASS corrupt saved sizes do not prevent startup and recover on close');
  }
}
