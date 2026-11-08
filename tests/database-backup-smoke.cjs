const {app,dialog}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const scratch=process.env.SPINE_BACKUP_TEST_DIR,root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(scratch,'profile'));
const backupFile=path.join(scratch,'library.json');let selectedFile=backupFile,confirm=0,cancelSave=false,cancelOpen=false,confirmations=0;
dialog.showSaveDialog=async()=>({canceled:cancelSave,filePath:backupFile});
dialog.showOpenDialog=async()=>({canceled:cancelOpen,filePaths:[selectedFile]});
dialog.showMessageBox=async(_parent,options)=>{if(options.type==='warning'){confirmations++;assert.match(options.detail,/recovery backup/);return {response:confirm};}return {response:0};};
const deadline=setTimeout(()=>{console.error('Database backup UI test timed out');app.exit(1);},30000);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.once('browser-window-created',(_event,win)=>{
  win.hide();win.webContents.once('did-finish-load',()=>run(win).then(()=>{clearTimeout(deadline);app.exit(0);}).catch(error=>{console.error(error);app.exit(1);}));
});
require(path.join(process.env.SPINE_BACKUP_APP_ROOT||root,'src/main.js'));
async function run(win){
  const evaluate=code=>win.webContents.executeJavaScript(code);
  async function until(code){for(let i=0;i<100;i++){if(await evaluate(code))return;await wait(30);}throw Error('Timed out: '+code);}
  const source=path.join(scratch,'assets','spark.spine');fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,'original source bytes');
  await until('!chooseFolderBtn.disabled && !databaseBusy');
  await evaluate(`(async()=>{await chooseFolder(${JSON.stringify(path.dirname(source))});const c=createCategory('Sparks');workspace.favorites[selectedProject.id]=bookmark(selectedProject);assignCategory(c.id,selectedProject,true);await spineApi.setAppendList(${JSON.stringify(source)},true);await refreshAppendList();hideSkelCheckbox.checked=true;localStorage.setItem('spineImportSettings',JSON.stringify({cliPath:'C:/Spine/Spine.com',editorVersion:'4.2.43'}));saveWorkspace();})()`);
  // Drive actual buttons and the preload/IPC path with native dialogs stubbed.
  await evaluate("document.getElementById('exportDatabaseBtn').click()");await until("!databaseBusy && document.getElementById('databaseMessage').textContent.startsWith('Library exported')");
  const backup=JSON.parse(fs.readFileSync(backupFile,'utf8'));assert.equal(backup.data.workspace.categories[0].name,'Sparks');assert.equal(backup.data.appendList.length,1);
  assert.equal(backup.data.preferences.hideSkelFiles,true);assert.equal(backup.data.preferences.importSettings.editorVersion,'4.2.43');
  assert.equal(fs.readFileSync(source,'utf8'),'original source bytes');
  console.log('PASS export button writes folder links, favorites, categories, Append records and preferences');
  for(const width of [980,1200]){
    win.setSize(width,850);await wait(50);const layout=await evaluate(`(()=>{const buttons=['exportDatabaseBtn','restoreDatabaseBtn'].map(id=>document.getElementById(id).getBoundingClientRect());const side=document.querySelector('.sidebar').getBoundingClientRect();return buttons.every(b=>b.width>50&&b.left>=side.left&&b.right<=side.right&&b.bottom<side.bottom);})()`);assert.equal(layout,true);
  }
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/database-backup-ui.png'),(await win.webContents.capturePage()).toPNG());
  cancelSave=true;await evaluate("manageDatabase('export')");assert.equal(fs.readFileSync(backupFile,'utf8'),JSON.stringify(backup,null,2)+'\n');cancelSave=false;
  await evaluate("workspace.categories[0].name='Current library';workspace.favorites={};hideSkelCheckbox.checked=false;saveWorkspace();spineApi.setAppendList("+JSON.stringify(source)+",false)");
  const before=await evaluate("localStorage.getItem('workspaceV1')");
  cancelOpen=true;await evaluate("manageDatabase('restore')");cancelOpen=false;assert.equal(confirmations,0);
  await evaluate("manageDatabase('restore')");assert.equal(confirmations,1);assert.equal(await evaluate("localStorage.getItem('workspaceV1')"),before);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scratch,'profile','append-list.json'),'utf8')).projects,[]);
  assert.equal(fs.existsSync(path.join(scratch,'profile','library-backups')),false);
  console.log('PASS canceled export, file picker and restore confirmation preserve the current library');
  selectedFile=path.join(scratch,'bad.json');fs.writeFileSync(selectedFile,'{"format":"unrelated"}');await evaluate("manageDatabase('restore')");
  assert.equal(confirmations,1);assert.match(await evaluate("document.getElementById('databaseMessage').textContent"),/Invalid library backup/);assert.equal(await evaluate("localStorage.getItem('workspaceV1')"),before);
  console.log('PASS invalid restore is rejected before confirmation or any data changes');
  const opened=new Promise(resolve=>app.once('browser-window-created',(_event,importer)=>{importer.hide();importer.webContents.once('did-finish-load',()=>resolve(importer));}));
  await evaluate('spineApi.openImportWorkspace()');const importer=await opened;
  await evaluate("manageDatabase('restore')");assert.match(await evaluate("document.getElementById('databaseMessage').textContent"),/Close the Import animation window/);
  await assert.rejects(importer.webContents.executeJavaScript('spineApi.exportDatabase({})'),/Open the asset library/);
  assert.equal(confirmations,1);const closed=new Promise(resolve=>importer.once('closed',resolve));importer.close();await closed;
  console.log('PASS restore protects open import sessions and backup IPC only accepts the library window');
  // The same saved bookmark must remain present even after its source disappears.
  fs.unlinkSync(source);selectedFile=backupFile;confirm=1;
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  await evaluate("document.getElementById('restoreDatabaseBtn').click()");await reloaded;
  await until("!databaseBusy && workspace.categories[0]?.name==='Sparks'");
  await evaluate("selectCategory('favorites')");
  const restored=await evaluate("({favorites:Object.values(workspace.favorites),categories:workspace.categories,hidden:hideSkelCheckbox.checked,settings:JSON.parse(localStorage.getItem('spineImportSettings')),inert:document.querySelector('.app').inert})");
  assert.equal(restored.favorites.length,1);assert.equal(restored.favorites[0].fullPath,source);assert.equal(restored.favorites[0].unavailable,true);
  assert.equal(restored.categories[0].id,backup.data.workspace.categories[0].id);assert.equal(restored.categories[0].color,backup.data.workspace.categories[0].color);assert.equal(Object.keys(restored.categories[0].assets).length,1);
  assert.equal(restored.hidden,true);assert.equal(restored.settings.editorVersion,'4.2.43');assert.equal(restored.inert,false);
  const appended=await evaluate('spineApi.getAppendList()');assert.equal(appended.length,1);assert.equal(appended[0].unavailable,true);
  const recoveryDir=path.join(scratch,'profile','library-backups'),recovery=JSON.parse(fs.readFileSync(path.join(recoveryDir,fs.readdirSync(recoveryDir)[0]),'utf8'));
  assert.equal(recovery.data.workspace.categories[0].name,'Current library');assert.deepEqual(recovery.data.workspace.favorites,{});assert.deepEqual(recovery.data.appendList,[]);
  console.log('PASS confirmed restore reloads actual UI, keeps unavailable links and preserves previous data in a recovery JSON');
}
