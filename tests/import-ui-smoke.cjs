const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {buildMerge}=require('../import-merge');
const {pathToFileURL}=require('node:url');
const scratch=process.env.SPINE_IMPORT_TEST_DIR,root=path.resolve(__dirname,'..');app.setPath('userData',path.join(scratch,'profile'));
let win;const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
let pendingAppendSource=null,folderDialogs=0,appendRecords=[],latestPlan,failNextPreview=false;
const evaluate=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('Failed UI expression:',code);throw error;});
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/4.2/spineboy-pro.json')));
const planData=structuredClone(data);
for(let i=0;i<6;i++){const slot='sequence-test-'+i;planData.slots.push({name:slot,bone:data.bones[0].name,attachment:'frame2'});
planData.skins[0].attachments[slot]=Object.fromEntries([2,4,8,10].map(n=>['frame'+n,{path:'test/frame_'+String(n).padStart(3,'0'),width:20,height:20}]));
planData.animations.walk.slots ||= {};planData.animations.walk.slots[slot]={attachment:[{name:'frame2'},{time:.1,name:'frame4'},{time:.2,name:'frame8'},{time:.3,name:'frame10'}]};}
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
    'import-plan':(_,options)=>{const m=buildMerge(data,planData,options);latestPlan=m;return {id:'plan',appendToMain:options.appendToMain===true,mainFolder:scratch,group:m.group,imageFolder:m.imageFolder,createSkins:m.createSkins,previewSkin:m.previewSkin,sourceSkin:m.sourceSkin,animationName:m.animationName,animationNames:m.animationNames,animations:m.animations,rows:m.rows,sequenceRenames:m.sequenceRenames,sequenceGroups:m.sequenceGroups.map(g=>({...g,frames:g.frames.map(f=>({...f,extension:'.png'}))})),stats:m.stats,skins:m.skinNames,warnings:[]};},
    'import-save':()=>({project:path.join(scratch,'Batch.spine'),animationName:latestPlan.animationName,animationNames:latestPlan.animationNames}),
    'import-preview-plan':()=>{
      if(failNextPreview){failNextPreview=false;throw Error('Preview packing failed for test');}
      // Model the service's packed atlas using fixture regions. Native tests
      // cover the actual image packing; these checks render real merged rigs.
      const previewData=structuredClone(latestPlan.data);
      for(const skin of previewData.skins)for(const values of Object.values(skin.attachments||{}))for(const a of Object.values(values)){
        const file=latestPlan.files.find(f=>f.skin===skin.name&&f.attachment===a.name);
        if(file)a.path=file.source.startsWith('test/')?'crosshair':file.source;
      }
      fs.writeFileSync(merged,JSON.stringify(previewData));return {skeletonPath:merged,atlasPath:atlas,animation:latestPlan.animationName};
    },
    'detect-spine-version':(_,file)=>require('../project-assets').detectSpineFileCompatibility(file),
    'read-text-file':(_,file)=>fs.readFileSync(file,'utf8'),
    'read-data-uri':(_,file)=>`data:${file.endsWith('.png')?'image/png':'application/json'};base64,${fs.readFileSync(file).toString('base64')}`,
    'file-url-for-path':(_,file)=>pathToFileURL(file).href,
    'resolve-relative-resource':(_,base,name)=>path.resolve(path.dirname(base),name),
  }))ipcMain.handle(name,handler);
  win=new BrowserWindow({width:1450,height:1050,show:false,webPreferences:{preload:path.join(root,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)console.error('Import UI:',message);});
  await win.loadFile(path.join(root,'import.html'));win.showInactive();
  const initialSteps=await evaluate('[...document.querySelectorAll(".workflow-step")].map(s=>({locked:s.classList.contains("is-locked"),disabled:s.querySelector(".step-content").disabled,inert:s.querySelector(".step-content").inert}))');
  assert.deepEqual(initialSteps.map(s=>s.locked),[false,true,true,true,true]);assert.ok(initialSteps.slice(1).every(s=>s.disabled&&s.inert));
  assert.equal(await evaluate('document.getElementById("review").matches(":disabled")'),true);assert.equal(await evaluate('document.getElementById("save").matches(":disabled")'),true);checks.push('Only step 1 is available initially; later steps are grey, disabled and excluded from keyboard interaction');
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/import-steps-initial.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await evaluate('document.getElementById("appendToMain").checked'),true);assert.equal(await evaluate('document.getElementById("imageFolder").required'),true);assert.equal(await evaluate('document.getElementById("save").textContent'),'Save into Main folder');checks.push('Direct-to-Main saving is the default and an images subfolder is required');
  await evaluate(`importWorkspace.open('main',${JSON.stringify(path.join(scratch,'main'))})`);
  assert.equal(await evaluate('document.getElementById("step2Content").disabled'),true);checks.push('Opening Main alone keeps animation selection locked');
  await evaluate(`document.getElementById('appendSource').value=${JSON.stringify(savedSource.project)};document.getElementById('appendSource').dispatchEvent(new Event('change'));document.getElementById('useAppendSource').click()`);
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.import&&!importWorkspace.state.busy'))break;await wait(30);}
  assert.equal(folderDialogs,0);assert.equal(await evaluate('importWorkspace.state.import.project'),savedSource.project);assert.equal(await evaluate("[...document.getElementById('appendSource').options].find(o=>o.value.endsWith('missing.spine')).disabled"),true);checks.push('Append list opens its source without a folder dialog and marks missing files');
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/append-source-picker.png'),(await win.webContents.capturePage()).toPNG());
  await wait(100);
  assert.equal(await evaluate('document.getElementById("step2Content").disabled'),false);assert.equal(await evaluate('document.getElementById("step3Content").disabled'),true);
  await evaluate('document.getElementById("continueToSettings").click()');
  assert.equal(await evaluate('document.getElementById("review").disabled'),false);checks.push('Opening both projects unlocks selection; confirming animations unlocks names and review');
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
  await evaluate('document.getElementById("importAnimation").value="walk";document.getElementById("importAnimation").dispatchEvent(new Event("change"));document.getElementById("continueToSettings").click();document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan'))break;await wait(30);}
  assert.equal(await evaluate('document.getElementById("save").disabled'),true);assert.equal(await evaluate('document.getElementById("step4Content").disabled'),false);assert.equal(await evaluate('document.getElementById("step5Content").disabled'),true);
  assert.ok((await evaluate('document.getElementById("reviewSummary").textContent')).includes('ImportedMain_walk'));checks.push('Review unlocks preview while saving remains locked');
  failNextPreview=true;await evaluate('document.getElementById("previewResult").click()');for(let i=0;i<100;i++){if(await evaluate('!importWorkspace.state.busy'))break;await wait(20);}
  assert.equal(await evaluate('document.getElementById("step5Content").disabled'),true);assert.match(await evaluate('document.getElementById("status").textContent'),/Preview packing failed/);checks.push('A failed preview keeps saving locked and offers a retry');
  await evaluate('document.getElementById("previewResult").click()');for(let i=0;i<100;i++){if(await evaluate('!importWorkspace.state.busy'))break;await wait(20);}
  assert.equal(await evaluate('importWorkspace.state.previewReady'),true);assert.equal(await evaluate('document.getElementById("save").disabled'),false);assert.equal(await evaluate('document.getElementById("step5Content").inert'),false);checks.push('A successful real merged preview unlocks the final save step');
  const actionSizes=await evaluate('Object.fromEntries(["chooseMain","chooseImport","review","previewResult","save"].map(id=>[id,document.getElementById(id).getBoundingClientRect().height]))');assert.ok(Object.values(actionSizes).every(height=>height>=52));assert.ok(actionSizes.save>=60);checks.push('Primary actions are at least 52 pixels tall with a larger final save button');
  await evaluate('document.getElementById("goToSave").click()');assert.equal(await evaluate('document.activeElement.id'),'step5Title');checks.push('Continue buttons move keyboard focus to the next step heading');
  await evaluate('document.getElementById("step5").scrollIntoView()');await wait(80);fs.writeFileSync(path.join(root,'.temp/import-steps-save.png'),(await win.webContents.capturePage()).toPNG());
  const group=await evaluate('importWorkspace.state.sequenceGroups.find(g=>g.prefix==="frame_")');assert.deepEqual(group.frames.map(f=>f.number),['002','004','008','010']);
  assert.equal(group.canRename,true);assert.equal(group.useCount,24);assert.equal(group.slotCount,6);assert.equal(await evaluate('document.querySelector(".sequence-enable input").disabled'),false);assert.equal(await evaluate('document.querySelector(".sequence-card [data-field=prefix]").disabled'),false);checks.push('Reused images across six slots form one editable sequence with unique frame numbers');
  const defaults=await evaluate('({rules:importWorkspace.state.sequenceRenames,rows:importWorkspace.state.plan.rows.filter(r=>r.sequenceGroup),checked:document.querySelector(".sequence-enable input").checked})');assert.equal(defaults.checked,true);assert.ok(defaults.rows.every(r=>/^Sequence\d+_\d{3}$/.test(r.result)));checks.push('Detected groups start enabled with complete new names containing no source or import prefixes');
  const previewNames=await evaluate(`(()=>{const card=[...document.querySelectorAll('.sequence-card')].find(c=>c.dataset.group===${JSON.stringify(group.id)});card.querySelector('input[type=checkbox]').checked=true;card.querySelector('input[type=checkbox]').dispatchEvent(new Event('change'));for(const [key,value]of Object.entries({prefix:'Thunder_',suffix:'_hit',start:1,padding:3})){const input=card.querySelector('[data-field='+key+']');input.value=value;input.dispatchEvent(new Event('input'));}return [...card.querySelectorAll('tbody tr')].map(row=>row.lastChild.textContent);})()`);
  assert.deepEqual(previewNames,['Thunder_001_hit.png','Thunder_002_hit.png','Thunder_003_hit.png','Thunder_004_hit.png']);assert.equal(await evaluate('document.getElementById("save").disabled'),true);checks.push('Sequence cards detect gaps, preview dense numeric renaming, and invalidate saving when edited');
  assert.equal(await evaluate('document.getElementById("step4Content").disabled&&document.getElementById("step5Content").disabled'),true);checks.push('Editing a reviewed setting locks both preview and save again');
  await evaluate('document.getElementById("review").click()');for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan&&!importWorkspace.state.busy'))break;await wait(30);}
  const renamed=await evaluate('({rows:importWorkspace.state.plan.rows.filter(r=>r.sequenceGroup),readonly:document.querySelectorAll("#mappingRows input[readonly]").length})');assert.equal(renamed.rows.length,24);assert.equal(renamed.readonly,24);assert.ok(renamed.rows.every(r=>r.result.startsWith('Thunder_')));checks.push('Reviewed sequence names control the attachment mappings and persist across review');
  await evaluate('document.getElementById("sequencePanel").scrollIntoView()');await wait(50);fs.writeFileSync(path.join(root,'.temp/sequence-renaming-ui.png'),(await win.webContents.capturePage()).toPNG());
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
  assert.equal(await evaluate('document.getElementById("step3Content").disabled&&document.getElementById("step4Content").disabled&&document.getElementById("step5Content").disabled'),true);checks.push('Replacing a source returns to animation selection and relocks later steps');
  await evaluate('document.getElementById("saveAppendSource").click()');
  for(let i=0;i<100;i++){if(appendRecords.some(r=>r.fullPath===descriptor('second').project))break;await wait(20);}
  assert.ok(appendRecords.some(r=>r.fullPath===descriptor('second').project));checks.push('The current Import project can be saved to the Append list');
  for(let i=0;i<100;i++){if(await evaluate('!importWorkspace.state.busy'))break;await wait(20);}
  await evaluate('document.getElementById("clearAnimations").click()');
  assert.equal(await evaluate('document.getElementById("review").disabled'),true);assert.equal(await evaluate('importWorkspace.state.selectedAnimations.length'),0);checks.push('Empty batch selection disables review');
  await evaluate('document.getElementById("selectAllAnimations").click()');
  assert.deepEqual(await evaluate('importWorkspace.state.selectedAnimations'),Object.keys(data.animations));
  assert.equal(await evaluate('document.getElementById("animationName").disabled'),true);
  const previewSelection=await evaluate('importWorkspace.state.selectedAnimations');
  await evaluate('document.getElementById("importAnimation").value="walk";document.getElementById("importAnimation").dispatchEvent(new Event("change"))');
  assert.deepEqual(await evaluate('importWorkspace.state.selectedAnimations'),previewSelection);checks.push('Select all chooses every clip and changing the preview keeps the batch selection');
  await evaluate('document.getElementById("continueToSettings").click();document.getElementById("imageFolder").value="Batch";document.getElementById("imageFolder").dispatchEvent(new Event("input"));document.getElementById("review").click()');
  for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan&&!importWorkspace.state.busy'))break;await wait(20);}
  const batchPlan=await evaluate('({names:importWorkspace.state.plan?.animationNames,options:[...document.getElementById("combinedAnimation").options].map(o=>o.value),rows:importWorkspace.state.plan?.rows.filter(r=>r.type==="animation"),groups:importWorkspace.state.plan?.stats.bones})');
  assert.equal(batchPlan.names.length,Object.keys(data.animations).length);assert.deepEqual(batchPlan.options,batchPlan.names);assert.equal(batchPlan.rows.length,batchPlan.names.length);checks.push('Batch review shows every output animation with editable names and a combined preview selector');
  await evaluate('(()=>{const row=[...document.querySelectorAll("#mappingRows tr")].find(r=>r.firstChild.textContent==="animation"),input=row.querySelector("input");input.value="Batch renamed";input.dispatchEvent(new Event("input"));})()');
  assert.equal(await evaluate('document.getElementById("save").disabled'),true);
  await evaluate('document.getElementById("review").click()');for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.plan&&!importWorkspace.state.busy'))break;await wait(20);}
  assert.equal(await evaluate('importWorkspace.state.plan.animationNames[0]'),'Batch renamed');checks.push('Editing one batch animation name invalidates review and survives re-review');
  await evaluate('document.getElementById("previewResult").click()');for(let i=0;i<100;i++){if(await evaluate('!importWorkspace.state.busy'))break;await wait(20);}assert.equal(await evaluate('importWorkspace.state.previewReady'),true);
  await evaluate('document.getElementById("save").click()');for(let i=0;i<100;i++){if(await evaluate('!!importWorkspace.state.result&&!importWorkspace.state.busy'))break;await wait(20);}
  assert.match(await evaluate('document.getElementById("savedMessage").textContent'),/with animations Batch renamed,/);checks.push('One save publishes the reviewed batch and reports all imported animations');
  assert.equal(await evaluate('document.getElementById("step5State").textContent'),'Saved');assert.equal(await evaluate('document.getElementById("openResult").matches(":disabled")'),false);checks.push('Saved results remain available in the completed final step');
  await evaluate('document.getElementById("clearAnimations").click();const input=[...document.querySelectorAll("#animationChecklist input")].find(i=>i.value==="walk");input.checked=true;input.dispatchEvent(new Event("change"));');
  assert.deepEqual(await evaluate('importWorkspace.state.selectedAnimations'),['walk']);assert.equal(await evaluate('document.getElementById("animationName").disabled'),false);checks.push('Checkbox selection returns cleanly to single-animation importing');
  await evaluate('document.getElementById("animationSelection").scrollIntoView()');await wait(50);fs.writeFileSync(path.join(root,'.temp/batch-animation-import.png'),(await win.webContents.capturePage()).toPNG());
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
  win.setSize(980,900);await evaluate('document.getElementById("step2").scrollIntoView({behavior:"instant"})');await wait(120);
  const narrow=await evaluate('({overflow:document.documentElement.scrollWidth>innerWidth,progress:[...document.querySelectorAll(".workflow-progress button")].map(b=>b.getBoundingClientRect().width),action:document.getElementById("continueToSettings").getBoundingClientRect().height})');
  assert.equal(narrow.overflow,false);assert.ok(narrow.progress.every(width=>width>100));assert.ok(narrow.action>=52);checks.push('Guided steps and prominent actions fit a 980-pixel window without horizontal overflow');
  fs.writeFileSync(path.join(root,'.temp/import-steps-narrow.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(1450,1050);await evaluate('document.getElementById("step2").scrollIntoView({behavior:"instant"})');await wait(80);
  // Production preview data is covered by the optional local acceptance run.
  fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/import-workspace.png'),(await win.webContents.capturePage()).toPNG());
  console.log(checks.map(c=>'PASS '+c).join('\n'));clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
