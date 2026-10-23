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
  for(let i=0;i<100;i++){if(await evaluate('typeof selectProject === "function"'))break;await wait(100);}
  assert.equal(await evaluate('typeof selectProject'),'function');checks.push('Packaged UI and preload load');
  const seriesToTest=process.env.PACKAGED_TEST_SERIES?.split(',') || ['3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','4.0','4.1','4.2'];
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
      state=await evaluate('({version:activePlayer?.skeleton?.data.version,time:playbackControls?.currentTime(),note:previewText.textContent})');
      if(state.time>0.1)break;await wait(50);
    }
    assert.equal(state.version,'3.8.75');assert.ok(state.time>0.1);assert.match(state.note,/best-effort/);
    await evaluate('playbackControls.seek((activePlayer.animationState.getCurrent(0).animation.duration)/2);activePlayer.paused=true');await wait(100);
    checks.push('Actual user 3.8.75 asset previews from portable executable');
  }
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});
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
