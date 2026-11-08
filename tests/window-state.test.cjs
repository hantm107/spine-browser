const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { createWindowStateStore } = require('../src/window-state');
const defaults = { width:1200, height:850, minWidth:980, minHeight:640 };
const workArea = { width:1920, height:1080 };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spine-window-state-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  return path.join(root, 'profile', 'window-state.json');
}
function window(width, height) {
  const win = new EventEmitter();
  win.getNormalBounds = () => ({width,height});
  win.isMaximized = () => false;
  win.isMinimized = () => false;
  win.maximize = () => { win.isMaximized = () => true; win.emit('maximize'); };
  return win;
}

test('window sizes persist separately on close, without writes during resizing', t => {
  const file=fixture(t), store=createWindowStateStore(file);
  assert.deepEqual(store.options('main',defaults,workArea), defaults);
  const main=window(1300,800), importer=window(1400,900);
  store.track(main,'main'); store.track(importer,'import');
  main.emit('resize'); importer.emit('resize');
  assert.equal(fs.existsSync(file),false);
  main.emit('close'); importer.emit('close');
  const reopened=createWindowStateStore(file);
  assert.deepEqual(reopened.options('main',defaults,workArea),{...defaults,width:1300,height:800});
  assert.deepEqual(reopened.options('import',defaults,workArea),{...defaults,width:1400,height:900});
  assert.equal(fs.existsSync(file+'.tmp'),false);
});

test('maximized and minimized windows retain their normal size and reopen maximized', t => {
  const file=fixture(t), store=createWindowStateStore(file), main=window(1250,780);
  store.track(main,'main'); main.maximize();
  main.isMinimized=()=>true; main.isMaximized=()=>false; main.emit('close');
  const reopened=createWindowStateStore(file), win=window(1250,780);
  reopened.track(win,'main');
  assert.equal(win.isMaximized(),true);
  assert.equal(reopened.options('main',defaults,workArea).width,1250);
  win.isMaximized=()=>false; win.emit('unmaximize'); win.emit('close');
  assert.equal(JSON.parse(fs.readFileSync(file)).main.maximized,false);
});

test('invalid state falls back to defaults and saved sizes fit the current display', t => {
  const file=fixture(t); fs.mkdirSync(path.dirname(file));
  for(const content of ['broken JSON','null','[]','{"main":{"width":"1300","height":800}}']) {
    fs.writeFileSync(file,content);
    assert.deepEqual(createWindowStateStore(file).options('main',defaults,workArea),defaults);
  }
  fs.writeFileSync(file,JSON.stringify({main:{width:5000,height:3000},import:{width:1,height:1}}));
  const store=createWindowStateStore(file);
  assert.deepEqual(store.options('main',defaults,{width:1366,height:768}),{...defaults,width:1366,height:768});
  assert.deepEqual(store.options('import',defaults,workArea),{...defaults,width:980,height:640});
});
