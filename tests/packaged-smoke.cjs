// Verify the actual portable executable, including offline runtime dependencies.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'spine-packaged-'));
const checks=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let socket, child, timer;
async function run(){
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  child=spawn(path.join(root,'dist/Spine-Browser-'+require('../package.json').version+'-portable.exe'),[`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(scratch,'profile')}`],{env,windowsHide:true,stdio:'ignore'});
  child.on('error',error=>{console.error(error);process.exitCode=1;});
  timer=setTimeout(()=>{console.error('Packaged app test timed out');process.exit(1);},90000);
  let page;
  for(let i=0;i<240;i++){
    try{page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page');if(page)break;}catch{}
    await wait(250);
  }
  assert.ok(page,'Packaged browser window opened');
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const pending=new Map();let id=0;
  socket.onmessage=event=>{const message=JSON.parse(event.data);const entry=pending.get(message.id);if(entry){pending.delete(message.id);message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result);}};
  socket.onclose=()=>{for(const entry of pending.values())entry.reject(Error('Packaged app closed during verification'));pending.clear();};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  // Windows may launch the portable app occluded behind the terminal, which
  // suspends animation frames. Expose our isolated test window for playback QA.
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  for(let i=0;i<100;i++){if(await evaluate('typeof selectProject === "function"'))break;await wait(100);}
  assert.equal(await evaluate('typeof selectProject'),'function');checks.push('Packaged UI and preload load');
  const categoryState=await evaluate(`(()=>{for(let i=0;i<12;i++)createCategory('Release check '+i);return {count:workspace.categories.length,colors:new Set(workspace.categories.map(c=>c.color)).size};})()`);
  assert.equal(categoryState.count,12);assert.equal(categoryState.colors,12);
  checks.push('Packaged category modules create more than eight uniquely colored categories');
  const ratio=await evaluate(`(()=>{const r=document.getElementById('previewBox').getBoundingClientRect();return r.width/r.height;})()`);
  assert.ok(Math.abs(ratio-1.6)<0.01);checks.push('Packaged preview uses 16:10 proportions');
  const seriesToTest=process.env.PACKAGED_TEST_SERIES?.split(',') || ['2.0','2.1','3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','4.0','4.1','4.2'];
  for(const series of seriesToTest)for(const ext of ['json','skel']){
    const file=path.join(root,'tests/fixtures',series,`spineboy-pro.${ext}`);
    await evaluate(`selectProject(${JSON.stringify({id:file,fullPath:file,fileName:path.basename(file),name:series,folder:'test'})})`);
    let state;
    for(let i=0;i<100;i++){
      state=await evaluate(`({version:activePlayer?.skeleton?.data.version,time:playbackControls?.currentTime(),error:previewTitle.textContent==='Preview failed'?previewText.textContent:null,buttons:document.querySelectorAll('.animation-buttons button').length})`);
      if(state.error)throw Error(`${series} ${ext}: ${state.error}`);
      if(state.version&&state.time>0.05)break;await wait(50);
    }
    assert.ok(state.version?.startsWith(series),JSON.stringify(state));assert.ok(state.time>0.05);assert.ok(state.buttons>0);
    checks.push(`${series} ${ext} plays from packaged runtime`);console.log('PASS',checks.at(-1));
  }
  assert.equal(await evaluate('typeof SpineBlendCompatibility.configure'),'function');
  checks.push('Packaged blending compatibility module loads');
  assert.equal(await evaluate('activePlayer.paused=false;playerHost.querySelector("canvas").click();activePlayer.paused'),true);
  assert.equal(await evaluate('playerHost.querySelector("canvas").click();activePlayer.paused'),false);
  checks.push('Packaged preview canvas toggles pause and resume');
  await evaluate(`(async()=>{const file=selectedProject;allProjects=Array.from({length:4},(_,i)=>({...file,id:'packaged-navigation-'+i}));await selectProject(allProjects[0]);projectList.focus();for(let i=0;i<2;i++)projectList.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));})()`);
  const navigationState=await evaluate('({selected:selectedProject.id,highlight:projectList.querySelector(".selected").dataset.id})');
  assert.equal(navigationState.selected,'packaged-navigation-0');assert.equal(navigationState.highlight,'packaged-navigation-2');
  await wait(300);assert.equal(await evaluate('selectedProject.id'),'packaged-navigation-2');
  checks.push('Packaged arrow navigation highlights immediately and delays preview loading');
  const folderA=path.join(root,'tests/fixtures/3.2'),folderB=path.join(root,'tests/fixtures/3.4');
  await evaluate(`(async()=>{await chooseFolder(${JSON.stringify(folderA)});document.querySelector('.favorite-button').click();favoritesOnly.checked=true;await favoritesOnly.onchange();await chooseFolder(${JSON.stringify(folderB)});})()`);
  const favorite=await evaluate('({folder:currentFolder,path:selectedProject.fullPath,count:filteredProjects().length})');
  assert.equal(favorite.folder,folderB);assert.equal(path.dirname(favorite.path),folderA);assert.equal(favorite.count,1);
  checks.push('Global favorite from another folder previews in the packaged app');
  if(process.env.SPINE_TEST_ASSET_FOLDER){
    const folder=process.env.SPINE_TEST_ASSET_FOLDER;
    await evaluate(`(async()=>{favoritesOnly.checked=false;searchInput.value='';await chooseFolder(${JSON.stringify(folder)});})()`);
    let state;
    for(let i=0;i<100;i++){
      state=await evaluate('({file:selectedProject?.fullPath,version:activePlayer?.skeleton?.data.version,time:playbackControls?.currentTime(),note:previewText.textContent,finite:activePlayer?.skeleton?.bones.every(b=>Number.isFinite(b.worldX)&&Number.isFinite(b.worldY))})');
      if(state.time>0.1)break;await wait(50);
    }
    const compatibility=await require('../project-assets').detectSpineFileCompatibility(state.file);
    assert.ok(state.version,JSON.stringify(state));
    assert.equal(compatibility.mismatch,false);assert.equal(state.version,compatibility.fileVersion);assert.ok(state.time>0.1);assert.equal(state.finite,true);
    if(state.version==='3.8.75')assert.match(state.note,/best-effort/);
    await evaluate('playbackControls.seek((activePlayer.animationState.getCurrent?.(0)||activePlayer.animationState.getTrack?.(0)).animation.duration/2);activePlayer.paused=true');await wait(100);
    fs.mkdirSync(path.join(root,'.temp'),{recursive:true});
    fs.writeFileSync(path.join(root,'.temp/user-asset-portable.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    checks.push('Actual user asset previews from portable executable');
  }
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});
  const appendSourceFile=path.join(root,'tests/fixtures/4.2/spineboy-pro.json');
  await evaluate(`spineApi.setAppendList(${JSON.stringify(appendSourceFile)},true)`);
  await evaluate('refreshAppendList()');
  assert.equal(await evaluate('Object.keys(appendBookmarks).length'),1);
  assert.ok(await evaluate('!!document.querySelector("[data-category=append]")'));
  checks.push('Packaged library persists an independent Append list category');
  await evaluate('window.spineApi.openImportWorkspace()');
  let importPage;
  for(let i=0;i<100;i++){importPage=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.url.endsWith('/import.html'));if(importPage)break;await wait(50);}
  assert.ok(importPage,'Packaged Import workspace opens');
  const importSocket=new WebSocket(importPage.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{importSocket.onopen=resolve;importSocket.onerror=reject;});
  const importPending=new Map();let importId=0;
  importSocket.onmessage=event=>{const message=JSON.parse(event.data),entry=importPending.get(message.id);if(entry){importPending.delete(message.id);message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result);}};
  importSocket.onclose=()=>{for(const entry of importPending.values())entry.reject(Error('Import workspace closed'));importPending.clear();};
  const importSend=(method,params={})=>new Promise((resolve,reject)=>{const id=++importId;importPending.set(id,{resolve,reject});importSocket.send(JSON.stringify({id,method,params}));});
  const importEvaluate=async expression=>{const r=await importSend('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  for(let i=0;i<100;i++){if(await importEvaluate('typeof importWorkspace==="object"'))break;await wait(30);}
  assert.equal(await importEvaluate('document.querySelectorAll(".project-grid .project").length'),2);
  assert.equal(await importEvaluate('typeof spineImport.plan'),'function');
  checks.push('Packaged side-by-side Import workspace and preload load');
  for(let i=0;i<100;i++){if(await importEvaluate('document.getElementById("appendSource").options.length>1'))break;await wait(30);}
  assert.equal(await importEvaluate('document.getElementById("appendSource").options.length'),2);
  await evaluate(`spineApi.setAppendList(${JSON.stringify(path.join(root,'tests/fixtures/3.8/spineboy-pro.json'))},true)`);
  for(let i=0;i<100;i++){if(await importEvaluate('document.getElementById("appendSource").options.length===3'))break;await wait(30);}
  assert.equal(await importEvaluate('document.getElementById("appendSource").options.length'),3);
  checks.push('Packaged Import picker shares Append list sources and receives live updates');
  const importOptions=await importEvaluate('({prefix:document.getElementById("importPrefix").value,folderRequired:document.getElementById("imageFolder").required,folderDisabled:document.getElementById("imageFolder").disabled,createSkins:document.getElementById("createSkins").checked})');
  assert.equal(importOptions.prefix,'ImportedMain');assert.equal(importOptions.folderRequired,true);assert.equal(importOptions.folderDisabled,false);assert.equal(importOptions.createSkins,true);
  checks.push('Packaged importer includes custom prefix, image subfolder and new-skins controls');
  assert.equal(await importEvaluate('document.getElementById("appendToMain").checked'),true);
  await importEvaluate('document.getElementById("appendToMain").checked=true;document.getElementById("appendToMain").dispatchEvent(new Event("input"))');
  assert.equal(await importEvaluate('document.getElementById("save").textContent'),'Save into Main folder');
  checks.push('Packaged importer offers saving the new project directly into Main');
  const missingImages=await importEvaluate(`spineImport.inspect(${JSON.stringify(path.join(root,'tests/fixtures/4.2'))}).then(()=>null,error=>error.message)`);
  assert.match(missingImages,/images folder beside/);checks.push('Packaged import service validates the required project structure');
  if(process.env.SPINE_IMPORT_MAIN_PROJECT){
    const project=await importEvaluate(`spineImport.inspect(${JSON.stringify(process.env.SPINE_IMPORT_MAIN_PROJECT)})`);
    assert.ok(project.id);assert.ok(project.skeletons.length>0);checks.push('Packaged importer inspects a real native project through installed Spine');
  }
  await importSend('Page.bringToFront');await importSend('Emulation.setFocusEmulationEnabled',{enabled:true});
  const importCapture=await importSend('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.temp/packaged-import-workspace.png'),Buffer.from(importCapture.data,'base64'));
  await importEvaluate('setTimeout(()=>window.close(),0)').catch(()=>{});importSocket.close();
  await send('Page.bringToFront');
  const capture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.temp/packaged-preview.png'),Buffer.from(capture.data,'base64'));
  fs.writeFileSync(path.join(root,'.temp/packaged-verification.json'),JSON.stringify({checks,failures:[]},null,2));
  await send('Runtime.evaluate',{expression:'window.close()'}).catch(()=>{});
  socket.close();clearTimeout(timer);
  console.log(`PASS ${checks.length} packaged executable checks`);
  // The portable wrapper needs a moment to remove its extracted application.
  if(child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),wait(5000)]);
}
run().catch(error=>{console.error(error);process.exitCode=1;socket?.close();if(timer)clearTimeout(timer);}).finally(()=>{
  fs.rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200},()=>{});
});
