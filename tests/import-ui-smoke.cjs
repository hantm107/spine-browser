const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {buildMerge}=require('../import-merge');
const {pathToFileURL}=require('node:url');
const scratch=process.env.SPINE_IMPORT_TEST_DIR,root=path.resolve(__dirname,'..');app.setPath('userData',path.join(scratch,'profile'));
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
let pendingAppendSource=null,folderDialogs=0,appendRecords=[];
const evaluate=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('Failed UI expression:',code);throw error;});
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/4.2/spineboy-pro.json')));
const fixture=path.join(__dirname,'fixtures/4.2/spineboy-pro.json'),atlas=path.join(__dirname,'fixtures/4.2/spineboy-pro.atlas');
const framedFixture=path.join(scratch,'hidden-effect.json'),framedData=structuredClone(data);
framedData.slots.push({name:'hidden-effect',bone:data.bones[0].name,attachment:'hidden-effect',color:'ffffff00'});
framedData.skins[0].attachments['hidden-effect']={'hidden-effect':{path:'crosshair',width:100000,height:100000}};
framedData.animations['camera-motion-test']={bones:{[data.bones[0].name]:{translate:[{x:0},{time:1,x:10000}]}}};
fs.writeFileSync(framedFixture,JSON.stringify(framedData));
const descriptor=id=>({id,project:path.join(scratch,id,id+'.spine'),folder:path.join(scratch,id),version:data.skeleton.spine,skeletons:[{name:id,animations:Object.keys(data.animations),bones:data.bones.length,skins:data.skins.map(s=>s.name)}],warnings:[]});
const merge=buildMerge(data,data,{animation:'walk'}),merged=path.join(scratch,'merged.json');fs.writeFileSync(merged,JSON.stringify(merge.data));
const timeout=setTimeout(()=>{console.error('Import UI test timed out');app.exit(1);},30000);
app.whenReady().then(async()=>{
  const savedSource=descriptor('source');appendRecords=[{...savedSource,id:savedSource.project,fullPath:savedSource.project,fileName:'source.spine',imagesAvailable:true},{id:'missing',fullPath:path.join(scratch,'missing.spine'),fileName:'missing.spine',folder:scratch,unavailable:true,imagesAvailable:false}];
  for(const [name,handler] of Object.entries({
    'append-list-get':()=>appendRecords,
    'append-list-set':(_,file,enabled)=>{if(enabled&&!appendRecords.some(r=>r.fullPath===file))appendRecords.push({id:file,fullPath:file,fileName:path.basename(file),folder:path.dirname(file),imagesAvailable:true});return appendRecords;},
    'import-take-append-source':()=>{const file=pendingAppendSource;pendingAppendSource=null;return file;},
    'import-select-project':()=>{folderDialogs++;throw Error('This test should not open a folder dialog.');},
    'import-inspect':(_,file)=>descriptor(file.includes('main')?'main':file.includes('second')?'second':'source'),
    'import-preview':()=>({skeletonPath:framedFixture,atlasPath:atlas}),
    'import-plan':(_,options)=>{const m=buildMerge(data,data,options);return {id:'plan',appendToMain:options.appendToMain===true,mainFolder:scratch,group:m.group,imageFolder:m.imageFolder,createSkins:m.createSkins,previewSkin:m.previewSkin,sourceSkin:m.sourceSkin,animationName:m.animationName,rows:m.rows,stats:m.stats,skins:m.skinNames,warnings:[]};},
    'import-preview-plan':()=>({skeletonPath:merged,atlasPath:atlas,animation:merge.animationName}),
    'detect-spine-version':(_,file)=>require('../project-assets').detectSpineFileCompatibility(file),
    'read-text-file':(_,file)=>fs.readFileSync(file,'utf8'),
    'read-data-uri':(_,file)=>`data:${file.endsWith('.png')?'image/png':'application/json'};base64,${fs.readFileSync(file).toString('base64')}`,
    'file-url-for-path':(_,file)=>pathToFileURL(file).href,
    'resolve-relative-resource':(_,base,name)=>path.resolve(path.dirname(base),name),
  }))ipcMain.handle(name,handler);
  win=new BrowserWindow({width:1450,height:1050,show:false,webPreferences:{preload:path.join(root,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)console.error('Import UI:',message);});
  await win.loadFile(path.join(root,'import.html'));win.showInactive();
  assert.equal(await evaluate('document.getElementById("appendToMain").checked'),true);assert.equal(await evaluate('document.getElementById("imageFolder").required'),true);assert.equal(await evaluate('document.getElementById("save").textContent'),'Save into Main folder');checks.push('Direct-to-Main saving is the default and an images subfolder is required');
  await evaluate(`importWorkspace.open('main',${JSON.stringify(path.join(scratch,'main'))})`);
  await evaluate(`document.getElementById('appendSource').value=${JSON.stringify(savedSource.project)};document.getElementById('appendSource').dispatchEvent(new Event('change'));document.getElementById('useAppendSource').click()`);
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.import&&!importWorkspace.state.busy'))break;await wait(30);}
  assert.equal(folderDialogs,0);assert.equal(await evaluate('importWorkspace.state.import.project'),savedSource.project);assert.equal(await evaluate("[...document.getElementById('appendSource').options].find(o=>o.value.endsWith('missing.spine')).disabled"),true);checks.push('Append list opens its source without a folder dialog and marks missing files');
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/append-source-picker.png'),(await win.webContents.capturePage()).toPNG());
  await wait(100);
  assert.equal(await evaluate('document.getElementById("review").disabled'),false);checks.push('Two project panes load and enable review');
  assert.ok((await evaluate('importWorkspace.views.main.inspect()')).time>0);checks.push('Main preview plays using the real 4.2 runtime');
  const fitting=await evaluate('({main:importWorkspace.views.main.inspect(),source:importWorkspace.views.import.inspect(),mainColor:getComputedStyle(document.getElementById("mainPane")).borderColor,sourceColor:getComputedStyle(document.getElementById("importPane")).borderColor})');
  assert.ok(fitting.main.frame.width<5000&&fitting.main.frame.height<5000,JSON.stringify(fitting.main));assert.notEqual(fitting.mainColor,fitting.sourceColor);checks.push('Preview fitting excludes a huge transparent effect and project outlines have distinct colors');
  const camera=await evaluate('(()=>{const v=importWorkspace.views.main;v.choose("camera-motion-test");v.seek(.2);const first={...v.inspect().frame};v.seek(.8);const followed=v.inspect();document.getElementById("mainFit").click();const whole=v.inspect();const auto=document.getElementById("mainAutoFit");auto.checked=true;auto.dispatchEvent(new Event("change"));return {first,followed,whole,restored:v.inspect()};})()');
  assert.ok(camera.followed.frame.x-camera.first.x>5000);assert.ok(camera.followed.frame.width<camera.whole.frame.width/3);assert.equal(camera.whole.autoFit,false);assert.equal(camera.restored.autoFit,true);checks.push('Auto fit follows the current pose during seeking and full-animation fitting remains available');
  await evaluate(`importWorkspace.views.combined.show(${JSON.stringify({skeletonPath:fixture,atlasPath:atlas})},'walk','default')`);
  for(const role of ['main','import','combined']){
    const gesture=await evaluate(`(()=>{const view=importWorkspace.views.${role},host=document.getElementById('${role}Preview'),canvas=host.querySelector('canvas');view.choose('walk');view.seek(view.duration()*.2);canvas.click();const resumed=!view.inspect().paused;canvas.click();const paused=view.inspect().paused;const start=view.inspect().time;canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,isPrimary:true,button:0,clientX:20}));host.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,isPrimary:true,clientX:20+host.clientWidth*.25}));host.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,isPrimary:true,clientX:20+host.clientWidth*.25}));canvas.click();return {resumed,paused,start,...view.inspect()};})()`);
    assert.equal(gesture.resumed,true);assert.equal(gesture.paused,true);assert.ok(gesture.time>gesture.start+.1,JSON.stringify(gesture));
  }
  checks.push('Main, Import, and combined previews support click pause/resume and drag scrubbing without resuming after a drag');
  const scrub=await evaluate('(()=>{const slider=document.getElementById("mainTimeline");slider.value=Number(slider.max)/2;slider.dispatchEvent(new Event("input"));return {expected:Number(slider.value),...importWorkspace.views.main.inspect()};})()');
  assert.equal(scrub.paused,true);assert.ok(Math.abs(scrub.time-scrub.expected)<0.01,JSON.stringify(scrub));checks.push('Independent preview timeline scrubbing pauses and seeks the animation');
  await evaluate('document.getElementById("importAnimation").value="walk";document.getElementById("importAnimation").dispatchEvent(new Event("change"));document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan'))break;await wait(30);}
  assert.equal(await evaluate('document.getElementById("save").disabled'),false);
  assert.ok((await evaluate('document.getElementById("reviewSummary").textContent')).includes('ImportedMain_walk'));checks.push('Review shows the single selected animation and enables save');
  await evaluate('(()=>{const input=document.querySelector("#mappingRows input");input.value="CustomRoot";input.dispatchEvent(new Event("input"));})()');
  assert.equal(await evaluate('document.getElementById("save").disabled'),true);checks.push('Editing a mapping invalidates the saved review');
  await evaluate('document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan'))break;await wait(30);}
  assert.equal(await evaluate('document.querySelector("#mappingRows input").value'),'CustomRoot');checks.push('Re-review retains the explicit name override');
  await evaluate(`(()=>{for(const [id,value]of [['importPrefix','Impact'],['imageFolder','Effects/Impact']]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input'));}const skins=document.getElementById('createSkins');skins.checked=false;skins.dispatchEvent(new Event('input'));document.getElementById('review').click();})()`);
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan'))break;await wait(30);}
  const options=await evaluate('({plan:importWorkspace.state.plan,folderDisabled:document.getElementById("imageFolder").disabled,summary:document.getElementById("reviewSummary").textContent})');
  assert.equal(options.plan.group,'Impact');assert.equal(options.plan.imageFolder,'Effects/Impact');assert.equal(options.plan.createSkins,false);assert.equal(options.plan.stats.skins,0);assert.equal(options.folderDisabled,false);assert.match(options.summary,/images\/Effects\/Impact\//);checks.push('Custom prefix, nested image folder and no-new-skins options reach the reviewed merge');
  await evaluate('document.getElementById("appendToMain").checked=true;document.getElementById("appendToMain").dispatchEvent(new Event("input"));document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan'))break;await wait(30);}
  assert.equal(await evaluate('importWorkspace.state.plan.appendToMain'),true);assert.equal(await evaluate('document.getElementById("save").textContent'),'Save into Main folder');checks.push('Appending into Main is captured by review and shown on the save button');
  await evaluate('document.getElementById("imageFolder").value="";document.getElementById("imageFolder").dispatchEvent(new Event("input"));document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!importWorkspace.state.busy'))break;await wait(20);}
  assert.equal(await evaluate('importWorkspace.state.plan'),null);assert.match(await evaluate('document.getElementById("status").textContent'),/required images subfolder/);checks.push('A blank images subfolder blocks review and saving');
  pendingAppendSource=descriptor('second').project;win.webContents.send('import-append-source-ready');
  for(let i=0;i<100;i++){if(await evaluate('importWorkspace.state.import?.id==="second"&&!importWorkspace.state.busy'))break;await wait(30);}
  assert.equal(await evaluate('importWorkspace.state.import.id'),'second');assert.equal(await evaluate('importWorkspace.state.main.id'),'main');assert.equal(folderDialogs,0);checks.push('Library source handoff replaces Import while keeping Main open');
  await evaluate('document.getElementById("saveAppendSource").click()');
  for(let i=0;i<100;i++){if(appendRecords.some(r=>r.fullPath===descriptor('second').project))break;await wait(20);}
  assert.ok(appendRecords.some(r=>r.fullPath===descriptor('second').project));checks.push('The current Import project can be saved to the Append list');
  for(const series of ['2.1','3.8']){
    const folder=path.join(__dirname,'fixtures',series),json=path.join(folder,'spineboy-pro.json'),texture=path.join(folder,'spineboy-pro.atlas'),animations=Object.keys(JSON.parse(fs.readFileSync(json)).animations);
    await evaluate(`importWorkspace.views.import.show(${JSON.stringify({skeletonPath:json,atlasPath:texture})},${JSON.stringify(animations[0])},'default')`);
    const legacy=await evaluate('(()=>{const v=importWorkspace.views.import;v.seek(v.duration()/2);document.getElementById("importPreview").querySelector("canvas").click();return v.inspect();})()');
    assert.ok(legacy.version.startsWith(series));assert.equal(legacy.paused,false);assert.ok(legacy.frame.width>0&&Number.isFinite(legacy.frame.height));
  }
  checks.push('Legacy 2.1 and 3.8 previews fit and use the same click controls');
  if(process.env.IMPORT_PREVIEW_ACCEPTANCE){
    const actual=JSON.parse(fs.readFileSync(process.env.IMPORT_PREVIEW_ACCEPTANCE,'utf8'));
    for(const role of ['main','import']){await evaluate(`importWorkspace.views.${role}.show(${JSON.stringify(actual[role])},${JSON.stringify(actual[role].animation)},'default')`);await evaluate(`importWorkspace.views.${role}.seek(importWorkspace.views.${role}.duration()*.3)`);}
    win.setSize(1450,1400);await evaluate('scrollTo(0,0)');await wait(200);
    const states=await evaluate('({main:importWorkspace.views.main.inspect(),source:importWorkspace.views.import.inspect()})');assert.ok(states.main.frame.width>0&&states.source.frame.width>0);console.log('Actual preview bounds',JSON.stringify(states));
    fs.writeFileSync(path.join(root,'.temp/actual-import-previews.png'),(await win.webContents.capturePage()).toPNG());checks.push('Actual Maeve and recovered born2 previews load and fit independently');
  }
  await evaluate('document.querySelector(".mapping").scrollIntoView()');await wait(50);
  const layout=await evaluate('({main:document.getElementById("mainPane").getBoundingClientRect().toJSON(),source:document.getElementById("importPane").getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth})');
  assert.ok(layout.source.x>layout.main.x+layout.main.width);assert.equal(layout.overflow,false);checks.push('Main and Import panes fit side by side without horizontal overflow');
  assert.ok(Math.abs(layout.source.width-layout.main.width)<2);checks.push('Long paths keep equal-width responsive project previews');
  // Production preview data is covered by the optional local acceptance run.
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/import-workspace.png'),(await win.webContents.capturePage()).toPNG());
  console.log(checks.map(c=>'PASS '+c).join('\n'));clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
