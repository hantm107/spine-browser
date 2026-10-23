const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
const fixtures = process.env.SPINE_TEST_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'spine-electron-test-'));
const appRequire = createRequire(path.join(root, 'main.js'));
electron.app.setPath('userData', path.join(fixtures, 'profile'));
let win, completed = false, aboutMessage;
const failures = [], checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = code => win.webContents.executeJavaScript(code);
async function until(code) {
  const start = Date.now();
  while (Date.now() - start < 6000) { if (await evaluate(code)) return; await wait(50); }
  console.error('Wait state', await evaluate('({title:previewTitle.textContent,text:previewText.textContent,selected:selectedProject?.fullPath,player:activePlayer&&{error:activePlayer.error,loaded:!!activePlayer.skeleton,assetLoaded:activePlayer.assetManager?.isLoadingComplete(),assetErrors:activePlayer.assetManager?.getErrors(),paused:activePlayer.paused,loading:!!activePlayer.loadingScreen},body:playerHost.innerText})'));
  throw new Error(`Timed out waiting for ${code}`);
}
const deadline = setTimeout(() => finish(new Error('Electron smoke test timed out')), 60000);
async function finish(error) {
  if (completed) return;
  completed = true;
  clearTimeout(deadline);
  if (error) { failures.push(error.stack); console.error(error); }
  fs.mkdirSync(path.join(root, '.temp'), { recursive: true });
  fs.writeFileSync(path.join(root, '.temp/verification-results.json'), JSON.stringify({ checks, failures }, null, 2));
  electron.app.exit(error ? 1 : 0);
}
async function check(name, code, verify) {
  const result = await evaluate(code);
  try { verify(result); } catch (error) { console.error(name, result, await evaluate('previewText.textContent')); throw error; }
  checks.push({ name, result });
  console.log(`PASS ${name}`);
}
function make(dir, json, atlas = '') {
  fs.mkdirSync(path.join(fixtures, dir), { recursive: true });
  fs.writeFileSync(path.join(fixtures, dir, `${dir}.json`), JSON.stringify(json));
  fs.writeFileSync(path.join(fixtures, dir, `${dir}.atlas`), atlas);
  return path.join(fixtures, dir, `${dir}.json`);
}
const modern = { skeleton: { spine: '4.3.13', x: 0, y: 0, width: 100, height: 100 }, bones: [{ name: 'root' }], animations: { Idle: {} } };
const modernFile = make('modern', modern);
fs.writeFileSync(modernFile, '\uFEFF' + fs.readFileSync(modernFile, 'utf8'));
const secondFile = make('second', modern);
const oldFile = make('unsupported', { ...modern, skeleton: { spine: '4.4.1' } });
const missingFile = make('missing', modern, 'absent.PNG\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n');
const brokenFile = make('broken-runtime', { ...modern, slots: [{ name: 'bad', bone: 'absent' }] });
const rawFile = path.join(fixtures, 'raw.spine');
fs.writeFileSync(rawFile, 'raw editor project');
const spacedAtlas = fs.readFileSync(path.join(root, 'tests/fixtures/3.6/spineboy-pro.atlas'), 'utf8').replace('spineboy.png', 'Scene image.PNG');
const spacedFile = make('spaced', modern, spacedAtlas);
fs.copyFileSync(path.join(root, 'tests/fixtures/3.6/spineboy.png'), path.join(path.dirname(spacedFile), 'Scene image.PNG'));
const upperFile = make('upper', modern);
fs.renameSync(upperFile, upperFile.replace('.json', '.JSON'));
const sample = path.join(fixtures,'sample','001.spine');
fs.cpSync(path.join(root,'tests/fixtures/3.6'),path.dirname(sample),{recursive:true});
fs.writeFileSync(sample,'reference project');
function project(file, name = path.basename(file)) { return JSON.stringify({ id: file, fullPath: file, name, fileName: path.basename(file), relativePath: file, folder: '(root)', isDirectSpineFile: file.endsWith('.spine') }); }
const actualElectron = { ...electron, dialog: { ...electron.dialog,
  showMessageBox: async (parent, options) => { aboutMessage = { parent, options }; return { response: 0 }; },
}, BrowserWindow: class {
  constructor(options) {
    win = new electron.BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } });
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) console.error('Renderer:', message); });
    win.webContents.once('did-finish-load', () => run().catch(finish));
    return win;
  }
  static getAllWindows() { return electron.BrowserWindow.getAllWindows(); }
} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), {
  require: name => name === 'electron' ? actualElectron : name === 'node:child_process' ? {
    spawn() { throw new Error('Preview must never launch external processes'); },
  } : appRequire(name), __dirname: root, console, process,
}, { filename: path.join(root, 'main.js') });

async function run() {
  const help = electron.Menu.getApplicationMenu().items.find(item => item.role === 'help');
  const about = help?.submenu.items.find(item => item.label === 'About Spine Browser');
  assert.ok(about, 'Help menu contains About Spine Browser');
  await about.click(about, win);
  assert.equal(aboutMessage.parent, win);
  assert.equal(aboutMessage.options.title, 'About Spine Browser');
  assert.ok(aboutMessage.options.detail.includes(`Version ${require('../package.json').version}`));
  assert.ok(aboutMessage.options.detail.includes('Author: Han Tuan'));
  assert.match(aboutMessage.options.detail, /Browse and preview Spine animations/);
  checks.push({ name: 'Help About describes the app with its current version and author' });
  await check('default animation skips empty run placeholders when animated clips exist', "chooseAnimationName(['run','action1'],[{name:'run',duration:0},{name:'action1',duration:1}])",r=>assert.equal(r,'action1'));
  await check('runtime catalog and modern player loaded', `({modern:!!window.spine?.SpinePlayer,series:Object.keys(window.spineRuntimeCatalog),css:[...document.styleSheets].map(s=>s.href)})`, r => { assert.ok(r.modern); assert.equal(r.series.length, 15); assert.ok(r.css.some(s => s.endsWith('spine-player.css'))); });
  electron.ipcMain.removeHandler('select-folder');
  electron.ipcMain.handle('select-folder', () => path.dirname(sample));
  // Expose the test window briefly so Chromium advances real visible animation frames.
  win.showInactive();
  await evaluate('chooseFolder()');
  await until('activePlayer?.animationState?.getCurrent(0)?.trackTime > 0.25');
  await check('real 3.6 sample plays', `({title:previewTitle.textContent,message:previewText.textContent,version:activePlayer?.skeleton?.data.version,animation:activePlayer?.animationState?.getCurrent(0)?.animation.name,time:activePlayer?.animationState?.getCurrent(0)?.trackTime,paused:activePlayer?.paused,bounds:activePlayer?.bounds,canvas:activePlayer?.canvas&&{width:activePlayer.canvas.clientWidth,height:activePlayer.canvas.clientHeight}})`, r => { assert.equal(r.version, '3.6.32'); assert.equal(r.animation, 'idle'); assert.ok(r.time > 0); assert.equal(r.paused, false); assert.ok(r.canvas.width > 300); assert.ok(r.bounds.width > 10); });
  for (const width of [980, 1600, 1200]) {
    win.setSize(width, 850);
    await wait(100);
    await check(`preview keeps 16:10 proportions at window width ${width}`, `(()=>{const box=document.getElementById('previewBox').getBoundingClientRect();return {width:box.width,height:box.height};})()`, r => assert.ok(Math.abs(r.width / r.height - 1.6) < 0.01));
  }
  const shot = await win.webContents.capturePage();
  fs.mkdirSync(path.join(root, '.temp'), { recursive: true });
  fs.writeFileSync(path.join(root, '.temp/preview-verification.png'), shot.toPNG());
  win.hide();
  await check('legacy pause control', `document.getElementById('playPauseBtn').click(); activePlayer.paused`, r => assert.equal(r, true));
  win.showInactive();
  await evaluate('if (!hideSkelCheckbox.checked) hideSkelCheckbox.click()');
  for (const series of ['2.0','2.1','3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','4.0','4.1','4.2']) {
    for (const extension of ['skel','json']) {
      const source = path.join(root, 'tests/fixtures', series);
      if (extension === 'json') {
        // Use the real folder UI with a JSON-only export, UTF-8 BOM, upper-case extension,
        // and an atlas named differently from the skeleton. Application JSON is ignored.
        const folder = path.join(fixtures, `json-${series}`);
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'animation.JSON'), '\uFEFF' + fs.readFileSync(path.join(source, 'spineboy-pro.json'), 'utf8'));
        fs.writeFileSync(path.join(folder, 'settings.json'), '{}');
        fs.copyFileSync(path.join(source, 'spineboy-pro.atlas'), path.join(folder, 'textures.atlas'));
        for (const file of fs.readdirSync(source)) {
          if (/\.(png|jpe?g|webp)$/i.test(file)) fs.copyFileSync(path.join(source, file), path.join(folder, file));
        }
        electron.ipcMain.removeHandler('select-folder');
        electron.ipcMain.handle('select-folder', () => folder);
        await evaluate('chooseFolder()');
      } else await evaluate(`selectProject(${project(path.join(source, 'spineboy-pro.skel'))})`);
      await until("!!activePlayer?.skeleton && (()=>{const track=activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0);return (track?.trackTime??track?.time)>0.1})()");
      await check(`${series} ${extension} plays with isolated matching runtime`, `({version:activePlayer.skeleton.data.version,animation:(activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.name,paused:activePlayer.paused,message:previewText.textContent,namespaceStable:window.spine===window.SpineRuntimeLoader.atlasRuntime,count:playerHost.children.length})`, r=>{assert.ok(r.version.startsWith(series));assert.equal(r.animation,['3.3','3.4'].includes(series)?'run':'idle');assert.equal(r.paused,false);assert.equal(r.namespaceStable,true);assert.equal(r.count,1);});
      if (extension === 'json') {
        await check(series+' animation buttons and frame stepping', `(()=>{const buttons=[...document.querySelectorAll('.animation-buttons button')];const chosen=buttons[buttons.length-1];chosen.click();document.getElementById('restartBtn').click();document.getElementById('nextFrameBtn').click();const entry=activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0);return {name:entry.animation.name,button:chosen.textContent,time:playbackControls.currentTime(),paused:activePlayer.paused,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX))};})()`, r=>{assert.equal(r.name,r.button);assert.ok(r.time>0);assert.equal(r.paused,true);assert.equal(r.finite,true);});
        await evaluate(`(()=>{const mode=document.getElementById('loopMode');mode.value='once';mode.dispatchEvent(new Event('change'));playbackControls.seek(Math.max(0,(activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.duration-0.02));activePlayer.paused=false;})()`);
        await until('activePlayer.paused');
        await check(series+' play once stops at the end', `({loop:(activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).loop,time:playbackControls.currentTime()})`, r=>{assert.equal(r.loop,false);assert.ok(r.time>0);});
        await evaluate(`(()=>{const mode=document.getElementById('loopMode');mode.value='loop';mode.dispatchEvent(new Event('change'));document.getElementById('restartBtn').click();})()`);
        await check(`${series} JSON-only folder remains visible with Hide .skel checked`, `({files:allProjects.map(p=>p.fileName),selected:selectedProject.fileName,hidden:hideSkelCheckbox.checked,visible:filteredProjects().length})`, r=>{assert.deepEqual(r.files,['animation.JSON']);assert.equal(r.selected,'animation.JSON');assert.equal(r.hidden,true);assert.equal(r.visible,1);});
      }
    }
  }
  await require('./navigation-smoke.cjs')({evaluate,until,check,wait,win});
  await require('./blend-pixels.cjs')({fixtures,evaluate,until,win,checks,wait});
  for(const extension of ['json','skel']) {
    await evaluate(`selectProject(${project(path.join(root,'tests/fixtures/2.1/raptor',`spineboy-pro.${extension}`))})`);
    await until('!!activePlayer?.skeleton && playbackControls.currentTime()>0.1');
    await check('2.1 archived raptor '+extension+' meshes render with finite bounds', '({version:activePlayer.skeleton.data.version,bones:activePlayer.skeleton.bones.length,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY)),slots:activePlayer.skeleton.drawOrder.slice(0,3).map(s=>({attachment:s.attachment?.name,object:!!s.attachment?.rendererObject,type:s.attachment?.type,uv:s.attachment?.uvs?.length})),matrices:activePlayer.skeleton.bones.filter(b=>!Number.isFinite(b.m00)).map(b=>({name:b.data.name,rotation:b.rotation,scale:b.scaleX})),draws:activePlayer.sceneRenderer.batcher.drawCalls,bounds:activePlayer.bounds,animated:activePlayer.animationState.getCurrent(0).animation.name})',r=>{assert.equal(r.version,'2.1.25');assert.equal(r.bones,66);assert.equal(r.finite,true);assert.equal(r.matrices.length,0,JSON.stringify(r));assert.ok(r.draws>0,JSON.stringify(r));assert.ok(r.bounds.width>500);assert.notEqual(r.animated,'empty');});
  }
  await wait(150);
  fs.writeFileSync(path.join(root,'.temp/legacy-2x-preview.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate(`selectProject(${project(path.join(root,'tests/fixtures/2.1/spineboy-pro.json'))})`);
  await until('!!activePlayer?.skeleton');
  await check('2.1 native flip timeline mirrors bones when seeking', `(()=>{playbackControls.seek(0.6);const flipped=activePlayer.skeleton.bones[0].flipX;playbackControls.seek(0.1);return {flipped,reset:activePlayer.skeleton.bones[0].flipX,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY))};})()`,r=>{assert.equal(r.flipped,true);assert.equal(r.reset,false);assert.equal(r.finite,true);});
  const unversioned=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/2.1/spineboy-pro.json'),'utf8'));delete unversioned.skeleton;
  const unversionedFile=make('unversioned',unversioned,fs.readFileSync(path.join(root,'tests/fixtures/2.1/spineboy-pro.atlas'),'utf8'));
  fs.copyFileSync(path.join(root,'tests/fixtures/2.1/square.png'),path.join(path.dirname(unversionedFile),'square.png'));
  await evaluate(`chooseFolder(${JSON.stringify(path.dirname(unversionedFile))})`);
  await until('!!activePlayer?.skeleton && playbackControls.currentTime()>0.1');
  await check('unversioned legacy JSON is discovered and clearly labeled', '({count:allProjects.length,note:previewText.textContent})',r=>{assert.equal(r.count,1);assert.match(r.note,/unversioned JSON/);});
  // Let the player's loading overlay finish fading before recording the rendered preview.
  await wait(800);
  fs.writeFileSync(path.join(root, '.temp/multi-version-verification.png'), (await win.webContents.capturePage()).toPNG());
  for (const extension of ['skel','json']) {
    await evaluate(`selectProject(${project(path.join(root,'tests/fixtures/3.4/vine',`vine.${extension}`))})`);
    await until('!!activePlayer?.skeleton && activePlayer.animationState.getCurrent(0)?.time > 0.1');
    await check(`3.4 ${extension} path constraints animate with finite bone transforms`, `({count:activePlayer.skeleton.pathConstraints.length,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY))})`, r=>{assert.ok(r.count>0);assert.equal(r.finite,true);});
  }
  const json3875=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/3.8/spineboy-pro.json'),'utf8'));
  json3875.skeleton.spine='3.8.75';
  const legacyJsonFile=make('legacy3875',json3875,fs.readFileSync(path.join(root,'tests/fixtures/3.8/spineboy-pro.atlas'),'utf8'));
  fs.copyFileSync(path.join(root,'tests/fixtures/3.8/spineboy.png'),path.join(path.dirname(legacyJsonFile),'spineboy.png'));
  await evaluate(`selectProject(${project(legacyJsonFile)})`);
  await until('!!activePlayer?.skeleton && playbackControls.currentTime()>0.1');
  await check('3.8.75 JSON loads without changing its version and reports best effort', '({version:activePlayer.skeleton.data.version,note:previewText.textContent,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY))})',r=>{assert.equal(r.version,'3.8.75');assert.match(r.note,/best-effort/);assert.equal(r.finite,true);});
  // Reference fixture: only the same-length version header is changed; user files stay read-only.
  const legacyBinaryFile=legacyJsonFile.replace('.json','.skel');
  const binary3875=Buffer.from(fs.readFileSync(path.join(root,'tests/fixtures/3.8/spineboy-pro.skel')));
  const versionOffset=binary3875.indexOf(Buffer.from('3.8.55'));assert.ok(versionOffset>=0);
  Buffer.from('3.8.75').copy(binary3875,versionOffset);fs.writeFileSync(legacyBinaryFile,binary3875);
  await evaluate(`selectProject(${project(legacyBinaryFile)})`);
  await until('!!activePlayer?.skeleton && playbackControls.currentTime()>0.1');
  await check('3.8.75 binary loads without changing its version and reports best effort','({version:activePlayer.skeleton.data.version,note:previewText.textContent,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY))})',r=>{assert.equal(r.version,'3.8.75');assert.match(r.note,/best-effort/);assert.equal(r.finite,true);});

  if (process.env.SPINE_TEST_ASSET_FOLDER) {
    electron.ipcMain.removeHandler('select-folder');
    electron.ipcMain.handle('select-folder', () => process.env.SPINE_TEST_ASSET_FOLDER);
    await evaluate('if (!hideSkelCheckbox.checked) hideSkelCheckbox.click()');
    await evaluate('chooseFolder()');
    await until("!!activePlayer?.skeleton && (()=>{const track=activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0);return (track?.trackTime??track?.time)>0.1})()");
    await check('user asset plays through normal folder selection', `({file:selectedProject.fullPath,project:selectedProject.isDirectSpineFile,version:activePlayer.skeleton.data.version,finite:activePlayer.skeleton.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY)),animation:(activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.name,paused:activePlayer.paused,status:previewText.textContent})`, r=>{assert.ok(r.project);assert.ok(r.version);assert.ok(r.animation);assert.equal(r.paused,false);assert.equal(r.finite,true);});
    await evaluate('playbackControls.seek((activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.duration/2);activePlayer.paused=true');await wait(100);
    fs.writeFileSync(path.join(root, '.temp/user-asset-verification.png'), (await win.webContents.capturePage()).toPNG());
    if(process.env.SPINE_TEST_ANIMATION){await evaluate(`playbackControls.choose(${JSON.stringify(process.env.SPINE_TEST_ANIMATION)});playbackControls.seek((activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.duration/2);activePlayer.paused=true`);await wait(100);fs.writeFileSync(path.join(root,'.temp/user-animation-verification.png'),(await win.webContents.capturePage()).toPNG());}
  }
  win.hide();
  await evaluate(`selectProject(${project(modernFile)})`);
  await until('!!activePlayer?.skeleton');
  await check('modern export preserves case and autoplays', `({loaded:!!activePlayer?.skeleton,track:activePlayer?.animationState?.getTrack(0)?.animation.name,paused:activePlayer?.paused,width:activePlayer?.canvas?.clientWidth,icon:document.querySelector('.animation-buttons button')?.textContent})`, r => { assert.ok(r.loaded); assert.equal(r.track, 'Idle'); assert.equal(r.paused, false); assert.ok(r.width > 300); assert.equal(r.icon, 'Idle'); });
  await evaluate(`selectProject(${project(spacedFile)})`);
  await until('!!activePlayer?.skeleton');
  await check('atlas pages allow spaces and uppercase extensions', `({loaded:!!activePlayer?.skeleton,error:activePlayer?.error})`, r => { assert.ok(r.loaded); assert.equal(r.error, false); });
  await evaluate(`selectProject(${project(upperFile.replace('.json', '.JSON'))})`);
  await until('!!activePlayer?.skeleton');
  await check('uppercase JSON extensions play', `activePlayer.animationState.getTrack(0).animation.name`, r => assert.equal(r, 'Idle'));
  await evaluate(`selectProject(${project(rawFile)})`);
  await check('raw project clears a previously playing export', `({title:previewTitle.textContent,player:!!activePlayer,count:playerHost.children.length,editorDisabled:openSpineBtn.disabled})`, r => { assert.equal(r.title, 'Spine editor project'); assert.equal(r.player, false); assert.equal(r.count, 0); assert.equal(r.editorDisabled, false); });
  await evaluate(`selectProject(${project(brokenFile)})`);
  await until("previewTitle.textContent === 'Preview failed'");
  await check('asynchronous player parse errors remain visible', `({message:previewText.textContent,player:!!activePlayer})`, r => { assert.match(r.message, /absent/); assert.equal(r.player, false); });
  await check('missing editor target reports failure', `window.spineApi.openInSpine(${JSON.stringify(path.join(fixtures, 'nonexistent.spine'))})`, r => assert.equal(r, false));
  await evaluate(`selectProject(${project(missingFile)})`);
  await check('missing image produces visible error and clears player', `({message:previewText.textContent,title:previewTitle.textContent,player:!!activePlayer,children:playerHost.children.length})`, r => { assert.equal(r.title, 'Preview failed'); assert.match(r.message, /absent.PNG/); assert.equal(r.player, false); assert.equal(r.children, 0); });
  await evaluate(`selectProject(${project(oldFile)})`);
  await check('unsupported minor version is explained', `({title:previewTitle.textContent,message:previewText.textContent,player:!!activePlayer})`, r => { assert.equal(r.title, 'Unsupported Spine version'); assert.match(r.message, /4.4.1/); assert.equal(r.player, false); });
  // Exercise a genuine overlap with delayed IPC resolution.
  electron.ipcMain.removeHandler('resolve-spine-assets');
  const assets = require('../project-assets');
  electron.ipcMain.handle('resolve-spine-assets', async (_, file) => { if (file === modernFile) await wait(120); return assets.findSkeletonAssetPair(file); });
  await evaluate(`(async()=>{const first=selectProject(${project(modernFile, 'A')});await selectProject(${project(secondFile, 'B')});await first;})()`);
  await wait(250);
  await check('rapid selection keeps the latest player', `({selected:selectedProject.name,url:activePlayer?.config?.skeleton,count:playerHost.children.length})`, r => { assert.equal(r.selected, 'B'); assert.ok(r.url.endsWith('/second/second.json')); assert.equal(r.count, 1); });
  await evaluate(`(async()=>{const pending=selectProject(${project(modernFile)});await selectProject(null);await pending;})()`);
  await check('clearing selection cancels pending previews', `({selected:selectedProject,player:!!activePlayer,count:playerHost.children.length})`, r => { assert.equal(r.selected, null); assert.equal(r.player, false); assert.equal(r.count, 0); });
  await check('names remain plain text', `renderProjectList([{id:'x',name:'<b id="injected">file</b>',folder:'<folder>'}]);updateDetailPanel({name:'<img id="injected2">',relativePath:'<path>'});({injected:!!document.getElementById('injected'),injected2:!!document.getElementById('injected2'),text:projectHeader.textContent})`, r => { assert.equal(r.injected, false); assert.equal(r.injected2, false); assert.match(r.text, /<path>/); });
  electron.ipcMain.removeHandler('select-folder');
  electron.ipcMain.handle('select-folder', () => path.join(fixtures, 'modern'));
  await evaluate('chooseFolder()');
  await until('!!activePlayer?.skeleton && activePlayer.animationState.getTrack(0)?.trackTime > 0.1');
  await check('4.3 folder UI discovers and plays BOM-prefixed JSON-only export with Hide .skel checked', `({count:allProjects.length,selected:selectedProject.fileName,hidden:hideSkelCheckbox.checked,visible:filteredProjects().length,version:activePlayer.skeleton.data.version})`, r => { assert.equal(r.count, 1); assert.equal(r.selected, 'modern.json'); assert.equal(r.hidden,true); assert.equal(r.visible,1); assert.match(r.version,/^4\.3\./); });
  electron.ipcMain.removeHandler('select-folder');
  electron.ipcMain.handle('select-folder', () => path.dirname(sample));
  win.showInactive();
  await evaluate('favoritesOnly.checked=false;searchInput.value="";chooseFolder()');
  await until('!!activePlayer?.skeleton');
  await check('related formats appear in one library entry', '({count:allProjects.length,files:allProjects[0].files.length,related:document.querySelectorAll("#relatedFileList button").length})', r=>{assert.equal(r.count,1);assert.equal(r.files,3);assert.equal(r.related,3);});
  await evaluate('document.querySelector(".favorite-button").click();favoritesOnly.checked=true;favoritesOnly.dispatchEvent(new Event("change"));libraryView.value="grid";libraryView.dispatchEvent(new Event("change"));');
  await check('favorites filter and grid work together', '({favorite:!!workspace.favorites[selectedProject.id],count:filteredProjects().length,grid:projectList.classList.contains("thumbnail-grid")})',r=>{assert.equal(r.favorite,true);assert.equal(r.count,1);assert.equal(r.grid,true);});
  await wait(1500);
  await evaluate('window.captureSelectedThumbnail()');
  await check('thumbnail is captured and persisted outside source files', '(async()=>{const uri=await spineApi.loadThumbnail(selectedProject.thumbnailKey);return {cached:uri?.startsWith("data:image/png;base64,"),displayed:document.querySelector(".asset-thumbnail").src.startsWith("data:image/png")};})()',r=>{assert.equal(r.cached,true);assert.equal(r.displayed,true);});
  await evaluate('(()=>{const speed=document.getElementById("playbackSpeed");speed.value="0.5";speed.dispatchEvent(new Event("change"));searchInput.value="001";searchInput.dispatchEvent(new Event("input"));saveWorkspace();})()');
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await reloaded;
  await until('!!activePlayer?.skeleton');
  await check('workspace reload restores folder selection favorites search view and speed', '({folder:currentFolder,file:selectedProject.fileName,search:searchInput.value,favorite:!!workspace.favorites[selectedProject.id],grid:libraryView.value,speed:activePlayer.speed,filter:favoritesOnly.checked})',r=>{assert.equal(r.folder,path.dirname(sample));assert.equal(r.file,'001.spine');assert.equal(r.search,'001');assert.equal(r.favorite,true);assert.equal(r.grid,'grid');assert.equal(r.speed,0.5);assert.equal(r.filter,true);});
  win.setSize(1300,1050);await wait(500);
  fs.writeFileSync(path.join(root,'.temp/ux-verification.png'),(await win.webContents.capturePage()).toPNG());
  const evaluateAsync=code=>evaluate('(async()=>{'+code+'})()');
  await evaluateAsync(`searchInput.value='';await chooseFolder(${JSON.stringify(path.dirname(modernFile))})`);
  await until('!!activePlayer?.skeleton');
  await check('favorite from folder A plays while folder B is active', '({folder:currentFolder,path:selectedProject.fullPath,favorites:filteredProjects().map(p=>p.fullPath)})',r=>{assert.equal(r.folder,path.dirname(modernFile));assert.equal(r.path,sample);assert.deepEqual(r.favorites,[sample]);});
  await evaluateAsync('favoritesOnly.checked=false;await favoritesOnly.onchange()');
  await until('selectedProject?.fileName === "modern.json" && !!activePlayer?.skeleton');
  await evaluateAsync('document.querySelector(".favorite-button").click();favoritesOnly.checked=true;await favoritesOnly.onchange()');
  await check('global favorites include both folders and full directories', 'filteredProjects().map(p=>({path:p.fullPath,folder:p.folder}))',r=>{assert.equal(r.length,2);assert.ok(r.some(p=>p.path===sample));assert.ok(r.some(p=>p.path===modernFile));assert.ok(r.every(p=>path.isAbsolute(p.folder)));});
  await evaluateAsync(`workspace.favorites[${JSON.stringify(sample)}]=true;await refreshFavorites();refreshProjectList()`);
  await check('legacy boolean bookmarks migrate using their absolute paths', `workspace.favorites[${JSON.stringify(sample)}]`,r=>{assert.equal(r.fullPath,sample);assert.equal(r.unavailable,false);});
  fs.renameSync(modernFile,modernFile+'.moved');
  await evaluateAsync(`await refreshFavorites();await selectProject(filteredProjects().find(p=>p.fullPath===${JSON.stringify(modernFile)}))`);
  await check('moved files remain bookmarked with an unavailable status', `({title:previewTitle.textContent,text:previewText.textContent,count:filteredProjects().length,kept:!!workspace.favorites[${JSON.stringify(modernFile)}],player:!!activePlayer})`,r=>{assert.equal(r.title,'Favorite unavailable');assert.match(r.text,/moved or deleted/);assert.ok(r.text.includes(modernFile));assert.equal(r.count,2);assert.equal(r.kept,true);assert.equal(r.player,false);});
  fs.renameSync(modernFile+'.moved',modernFile);
  await evaluateAsync(`await refreshFavorites();await selectProject(filteredProjects().find(p=>p.fullPath===${JSON.stringify(sample)}));saveWorkspace()`);
  const globalReload=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await globalReload;
  await until('!!activePlayer?.skeleton');
  await check('global favorites and external selection survive reload', '({folder:currentFolder,path:selectedProject.fullPath,count:filteredProjects().length})',r=>{assert.equal(r.folder,path.dirname(modernFile));assert.equal(r.path,sample);assert.equal(r.count,2);});
  await evaluateAsync(`await selectProject(filteredProjects().find(p=>p.fullPath===${JSON.stringify(modernFile)}));document.querySelectorAll('.favorite-button')[1].click()`);
  await check('unbookmarking updates the global library', 'Object.keys(workspace.favorites).length',r=>assert.equal(r,1));
  electron.ipcMain.removeHandler('select-folder');
  const categoryAsset=sample;
  await evaluateAsync(`await selectCategory('all');searchInput.value='';await chooseFolder(${JSON.stringify(path.dirname(sample))});const fire=createCategory('Fire VFX');const blast=createCategory('Explosions');assignCategory(fire.id,selectedProject,true);assignCategory(blast.id,selectedProject,true);`);
  await check('multiple colored category tags are integrated in an asset entry','({tags:[...document.querySelectorAll(".asset-category-tag")].map(b=>b.textContent),colors:workspace.categories.map(c=>c.color),favorite:!!workspace.favorites[selectedProject.id]})',r=>{assert.deepEqual(r.tags,['Fire VFX','Explosions']);assert.equal(new Set(r.colors).size,2);assert.equal(r.favorite,true);});
  await evaluateAsync(`await chooseFolder(${JSON.stringify(path.dirname(modernFile))});await selectCategory(workspace.categories[0].id)`);
  await until('!!activePlayer?.skeleton');
  await check('custom category previews an asset outside the active folder','({folder:currentFolder,path:selectedProject.fullPath,count:filteredProjects().length})',r=>{assert.equal(r.folder,path.dirname(modernFile));assert.equal(r.path,categoryAsset);assert.equal(r.count,1);});
  await evaluateAsync('editAssetCategories(selectedProject);document.querySelectorAll(".category-membership")[1].click();document.getElementById("categoryDialog").close();');
  await check('membership dialog removes only its selected category','({first:Object.keys(workspace.categories[0].assets).length,second:Object.keys(workspace.categories[1].assets).length,favorites:Object.keys(workspace.favorites).length})',r=>{assert.equal(r.first,1);assert.equal(r.second,0);assert.equal(r.favorites,1);});
  await evaluateAsync('editCategory(workspace.categories[0]);document.querySelector(".category-edit-form input").value="Flames";document.querySelector(".category-edit-form").requestSubmit();');
  await check('rename updates the colored tag and retains membership','({name:document.querySelector(".asset-category-tag").textContent,count:filteredProjects().length})',r=>{assert.equal(r.name,'Flames');assert.equal(r.count,1);});
  await evaluateAsync('for(let i=2;i<8;i++)createCategory("Category "+i);document.getElementById("newCategoryName").value="Ninth";document.getElementById("newCategoryForm").requestSubmit();');
  await check('UI permits more than eight categories with distinct colors','({count:workspace.categories.length,colors:new Set(workspace.categories.map(c=>c.color)).size,disabled:document.getElementById("addCategoryBtn").disabled,message:document.getElementById("categoryMessage").textContent})',r=>{assert.equal(r.count,9);assert.equal(r.colors,9);assert.equal(r.disabled,false);assert.equal(r.message,'');});
  await evaluateAsync('saveWorkspace()');
  const categoryReload=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await categoryReload;await until('!!activePlayer?.skeleton');
  await check('category selection color and absolute bookmarks survive reload','({name:workspace.categories[0].name,active:activeCategory(),id:workspace.categories[0].id,colors:new Set(workspace.categories.map(c=>c.color)).size,path:selectedProject.fullPath})',r=>{assert.equal(r.name,'Flames');assert.equal(r.active,r.id);assert.equal(r.colors,9);assert.equal(r.path,categoryAsset);});
  fs.writeFileSync(path.join(root,'.temp/categories-verification.png'),(await win.webContents.capturePage()).toPNG());
  await evaluateAsync('editAssetCategories(selectedProject)');
  await check('category popup uses large toggle buttons and a red bottom Close button', `(()=>{const dialog=document.getElementById('categoryDialog'),buttons=[...dialog.querySelectorAll('.category-membership')],close=dialog.querySelector('.dialog-close');return {count:buttons.length,selected:buttons[0].getAttribute('aria-pressed'),height:buttons[0].getBoundingClientRect().height,last:close===dialog.lastElementChild,background:getComputedStyle(close).backgroundColor,checkboxes:dialog.querySelectorAll('input[type=checkbox]').length};})()`,r=>{assert.equal(r.count,9);assert.equal(r.selected,'true');assert.ok(r.height>=52);assert.equal(r.last,true);assert.equal(r.background,'rgb(184, 59, 69)');assert.equal(r.checkboxes,0);});
  await wait(150);
  fs.writeFileSync(path.join(root,'.temp/category-popup-verification.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate('document.querySelector("#categoryDialog .dialog-close").click()');

  await evaluateAsync('editCategory(workspace.categories[0]);document.querySelector(".delete-category").click();document.querySelector(".delete-category").click();');
  await check('deleting a category keeps original files and Favorites','({count:workspace.categories.length,active:activeCategory(),favorites:Object.keys(workspace.favorites).length})',r=>{assert.equal(r.count,8);assert.equal(r.active,'all');assert.equal(r.favorites,1);assert.equal(fs.existsSync(categoryAsset),true);});
  win.setSize(1920,1080);
  await evaluateAsync(`searchInput.value='';await selectCategory('all');libraryView.value='list';await chooseFolder(${JSON.stringify(path.join(root,'tests/fixtures'))})`);
  await wait(600);
  fs.writeFileSync(path.join(root,'.temp/browser-layout-list.png'),(await win.webContents.capturePage()).toPNG());
  await evaluate('libraryView.value="grid";libraryView.onchange()');await wait(100);
  fs.writeFileSync(path.join(root,'.temp/browser-layout-grid.png'),(await win.webContents.capturePage()).toPNG());
  electron.ipcMain.handle('select-folder', () => path.join(fixtures, 'not-found'));
  await evaluate('chooseFolder()');
  await check('scan failure recovers controls and reports error', `({title:previewTitle.textContent,disabled:chooseFolderBtn.disabled,selected:selectedProject})`, r => { assert.equal(r.title, 'Folder scan failed'); assert.equal(r.disabled, false); assert.equal(r.selected, null); });
  await finish();
}
