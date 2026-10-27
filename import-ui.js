(function(){
  const $=id=>document.getElementById(id), api=window.spineImport;
  const state={main:null,import:null,plan:null,result:null,overrides:{},busy:false};
  let appendSources=[],appendListRequest=0,takingAppendSource=false,imageFolderEdited=false;
  const appendKey=file=>(file||'').replace(/\\/g,'/').toLowerCase();
  const views=Object.fromEntries(['main','import','combined'].map(role=>[role,window.createImportPreview($(role+'Preview'),$(role+'PreviewStatus'))]));
  for(const role of ['main','import','combined']){
    const label=document.createElement('label'),select=document.createElement('select');label.textContent='Preview skin';select.id=role+'Skin';select.disabled=true;label.append(select);
    $(role+'Preview').before(label);select.onchange=()=>{views[role].skin(select.value);if(role==='import'){state.overrides={};invalidate();}optionHints();};
    const timeline=document.createElement('input');timeline.type='range';timeline.id=role+'Timeline';timeline.min=0;timeline.max=0;timeline.step='0.001';timeline.setAttribute('aria-label',role+' animation timeline');timeline.className='preview-timeline';timeline.disabled=true;
    $(role+'Preview').after(timeline);timeline.oninput=()=>views[role].seek(Number(timeline.value));
  }
  let frame;
  function tick(){for(const role of ['main','import','combined']){const value=views[role].inspect(),duration=views[role].duration(),timeline=$(role+'Timeline');timeline.disabled=!duration;timeline.max=duration;if(value&&duration)timeline.value=(value.time||0)%duration;}frame=requestAnimationFrame(tick);}tick();
  let revision=0;
  const settings=()=>({cliPath:$('cliPath').value.trim(),editorVersion:$('editorVersion').value.trim()});
  try{const saved=JSON.parse(localStorage.getItem('spineImportSettings')||'null');if(saved){$('cliPath').value=saved.cliPath;$('editorVersion').value=saved.editorVersion||'';}}catch{}
  function status(message,error=false){$('status').textContent=String(message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');$('status').classList.toggle('error',error);}
  api.onProgress(message=>status(message));
  async function refreshAppendSources(){
    const request=++appendListRequest,selected=$('appendSource').value;
    try{
      const records=await window.spineApi.getAppendList();if(request!==appendListRequest)return;
      appendSources=records;const select=$('appendSource');select.replaceChildren(new Option('Choose a saved source',''));
      for(const record of records){const option=new Option(`${record.fileName} — ${record.folder}${record.unavailable?' (unavailable)':!record.imagesAvailable?' (images folder missing)':''}`,record.fullPath);option.disabled=!!record.unavailable||!record.imagesAvailable;select.add(option);}
      if(records.some(r=>r.fullPath===selected))select.value=selected;
      $('appendSourceMessage').textContent=records.length?`${records.length} saved source${records.length===1?'':'s'} available across folders.`:'Save sources from the library with Append +, or add the current Import project here.';
      update();
    }catch(error){$('appendSourceMessage').textContent='Append list could not be loaded: '+error.message;}
  }
  async function consumeAppendSource(){
    if(state.busy||takingAppendSource)return;takingAppendSource=true;let consumed=false;
    try{const file=await api.takeAppendSource();if(file){consumed=true;await work(()=>open('import',file));}}
    catch(error){status(error.message,true);}finally{takingAppendSource=false;if(consumed)queueMicrotask(()=>consumeAppendSource());}
  }
  function optionHints(){
    const prefix=$('importPrefix').value.trim()||'ImportedMain';
    $('placementHint').textContent=`${prefix}, ${prefix}2, … is created directly under Main’s root at X = 1000. Source visibility and animation keys are preserved.`;
    const imageFolder=$('imageFolder').value.trim().replace(/\\/g,'/');
    $('imageFolderHint').textContent=imageFolder?`New assets: images/${imageFolder}/. An existing folder gets a numbered name at review.`:'Enter a name for the required images subfolder.';
    $('skinModeHint').textContent=$('createSkins').checked?"Append prefixed source skins to Main's skin list.":`Use Import preview skin “${$('importSkin').value||'default'}” with its default fallbacks. Add attachments to Main’s default skin; create no new skins.`;
    $('outputModeHint').textContent=$('appendToMain').checked?`Save a new .spine file beside Main and append the imported images to its images/ folder. Destination: ${state.main?.folder||'open Main first'}. Existing files are preserved.`:'Create a separate output folder. Existing project files stay unchanged.';
    $('save').textContent=$('appendToMain').checked?'Save into Main folder':'Create new .spine project';
  }
  function update(){
    const ready=!!(state.main&&state.import);
    $('review').disabled=!ready||state.busy;$('swap').disabled=!ready||state.busy;
    $('previewResult').disabled=!state.plan||state.busy;$('save').disabled=!state.plan||state.busy;
    for(const role of ['main','import'])for(const key of ['Skeleton','Animation','Skin'])$(role+key).disabled=!state[role]||state.busy;
    for(const id of ['chooseMain','chooseImport','chooseCli','cliPath','editorVersion','animationName','find','replace','matchCase','regex','importPrefix','createSkins','appendToMain'])$(id).disabled=state.busy;
    $('imageFolder').disabled=state.busy;
    const appendChoice=appendSources.find(r=>r.fullPath===$('appendSource').value);
    $('appendSource').disabled=state.busy;
    $('useAppendSource').disabled=state.busy||!appendChoice||appendChoice.unavailable||!appendChoice.imagesAvailable;
    $('refreshAppendSources').disabled=state.busy;
    const alreadySaved=appendSources.some(r=>appendKey(r.fullPath)===appendKey(state.import?.project));
    $('saveAppendSource').disabled=state.busy||!state.import||alreadySaved;$('saveAppendSource').textContent=alreadySaved?'Source is in Append list':'Add current source to list';
    $('mappingRows').querySelectorAll('input').forEach(e=>e.disabled=state.busy);
    document.querySelectorAll('.choices button,.choices select').forEach(e=>e.disabled=state.busy);
    document.body.classList.toggle('busy',state.busy);
    optionHints();
  }
  function invalidate(){revision++;state.plan=null;views.combined.dispose();$('reviewSummary').textContent='Review the import to validate the current settings.';$('previewResult').disabled=true;$('save').disabled=true;update();}
  async function work(action){if(state.busy)return;state.busy=true;update();try{return await action();}catch(error){status(error.message,true);}finally{state.busy=false;update();consumeAppendSource();}}
  function fill(select,values){select.replaceChildren(...values.map(value=>new Option(value,value)));}
  async function preview(role){
    const project=state[role];if(!project)return;
    try{const assets=await api.preview(project.id,$(role+'Skeleton').value);await views[role].show(assets,$(role+'Animation').value,$(role+'Skin').value);$(role+'Play').disabled=false;}
    catch(error){$(role+'PreviewStatus').textContent='Preview unavailable: '+error.message;}
  }
  function animations(role){const project=state[role],skeleton=project?.skeletons.find(s=>s.name===$(role+'Skeleton').value);fill($(role+'Animation'),skeleton?.animations||[]);fill($(role+'Skin'),skeleton?.skins||[]);if(role==='main'&&skeleton?.animations.includes('idle'))$(role+'Animation').value='idle';}
  async function accept(role,project){
    state[role]=project;state.overrides={};$('mappingTable').hidden=true;invalidate();
    $(role+'Path').textContent=project.project;$(role+'Version').textContent=`Spine ${project.version} · ${project.skeletons.length} skeleton${project.skeletons.length===1?'':'s'}`;
    $(role+'Choices').replaceChildren();fill($(role+'Skeleton'),project.skeletons.map(s=>s.name));animations(role);
    if(project.warnings.length)status(project.warnings.join(' '));
    update();await preview(role);
  }
  async function open(role,file){
    state[role]=null;views[role].dispose();$(role+'Path').textContent=file;$(role+'Version').textContent='';invalidate();
    const project=await api.inspect(file,settings());
    if(project.id){await accept(role,project);return;}
    const choices=$(role+'Choices');choices.replaceChildren();choices.className='choices';
    if(project.projects.length){
      const label=document.createElement('label');label.textContent='Choose the .spine project';const select=document.createElement('select');fill(select,project.projects);label.append(select);
      const button=document.createElement('button');button.textContent='Open selected project';button.onclick=()=>work(()=>open(role,select.value));choices.append(label,button);
    } else if(project.exports.length){
      const message=document.createElement('p');message.textContent='No .spine file exists here. Create a working project from an export; the original files stay unchanged.';
      const select=document.createElement('select');select.setAttribute('aria-label','Export to reconstruct');fill(select,project.exports);const savedExport=project.exports.find(p=>appendKey(p)===appendKey(file));if(savedExport)select.value=savedExport;
      const button=document.createElement('button');button.textContent='Create working .spine copy';button.onclick=()=>work(async()=>accept(role,await api.reconstruct(select.value,settings())));choices.append(message,select,button);
    }else throw Error('This folder has no .spine file or skeleton export to reconstruct.');
    status('Choose the project or create a working copy below.');
  }
  for(const role of ['main','import']){
    $('choose'+(role==='main'?'Main':'Import')).onclick=()=>work(async()=>{const folder=await api.selectProject();if(folder)await open(role,folder);});
    $(role+'Skeleton').onchange=()=>work(async()=>{state.overrides={};invalidate();animations(role);await preview(role);});
    $(role+'Animation').onchange=()=>{if(role==='import'){state.overrides={};invalidate();}views[role].choose($(role+'Animation').value);};
    $(role+'Play').onclick=()=>views[role].toggle();
  }
  $('chooseCli').onclick=()=>work(async()=>{const file=await api.selectCli();if(file)$('cliPath').value=file;});
  $('appendSource').onchange=()=>update();
  $('useAppendSource').onclick=()=>work(()=>open('import',$('appendSource').value));
  $('refreshAppendSources').onclick=()=>refreshAppendSources();
  $('saveAppendSource').onclick=()=>work(async()=>{await window.spineApi.setAppendList(state.import.project,true);await refreshAppendSources();$('appendSource').value=appendSources.find(r=>appendKey(r.fullPath)===appendKey(state.import.project))?.fullPath||'';status('Source saved to Append list.');});
  window.spineApi.onAppendListChanged(()=>refreshAppendSources());
  api.onAppendSource(()=>consumeAppendSource());
  window.addEventListener('focus',()=>refreshAppendSources());
  for(const id of ['cliPath','editorVersion'])$(id).onchange=()=>{try{localStorage.setItem('spineImportSettings',JSON.stringify(settings()));}catch{}status('Spine settings apply when opening the next project.');};
  for(const id of ['animationName','find','replace','matchCase','regex','createSkins','appendToMain'])$(id).oninput=()=>{state.overrides={};invalidate();};
  $('importPrefix').oninput=()=>{if(!imageFolderEdited)$('imageFolder').value=$('importPrefix').value.trim()||'ImportedMain';state.overrides={};invalidate();};
  $('imageFolder').oninput=()=>{imageFolderEdited=true;state.overrides={};invalidate();};
  $('swap').onclick=()=>work(async()=>{const main=state.main,source=state.import;await accept('main',source);await accept('import',main);});
  $('review').onclick=()=>work(async()=>{
    invalidate();if(!$('imageFolder').value.trim())throw Error('Enter a name for the required images subfolder.');
    const plan=await api.plan({mainId:state.main.id,importId:state.import.id,mainSkeleton:$('mainSkeleton').value,importSkeleton:$('importSkeleton').value,animation:$('importAnimation').value,animationName:$('animationName').value,prefix:$('importPrefix').value.trim(),useImageFolder:true,imageFolder:$('imageFolder').value.trim(),createSkins:$('createSkins').checked,sourceSkin:$('importSkin').value||'default',appendToMain:$('appendToMain').checked,rename:{find:$('find').value,replace:$('replace').value,regex:$('regex').checked,matchCase:$('matchCase').checked},overrides:state.overrides});
    state.plan=plan;$('reviewSummary').textContent=`${plan.animationName} · ${plan.group} · ${plan.stats.bones} bones · ${plan.stats.slots} slots · ${plan.stats.images} images in images/${plan.imageFolder?plan.imageFolder+'/':''} · ${plan.stats.skins} new skins${plan.createSkins===false?' (Main default attachments)':''}${plan.appendToMain?' · Save directly to '+plan.mainFolder:''}`;
    fill($('combinedSkin'),['default',...plan.skins]);$('combinedSkin').value=plan.previewSkin||'default';$('combinedSkin').disabled=false;
    $('warnings').replaceChildren(...plan.warnings.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('mappingRows').replaceChildren(...plan.rows.map(row=>{
      const tr=document.createElement('tr'),type=document.createElement('td'),original=document.createElement('td'),result=document.createElement('td'),input=document.createElement('input');
      type.textContent=row.type;original.textContent=row.original;input.value=row.result;input.setAttribute('aria-label',`${row.type} ${row.original} result`);
      input.oninput=()=>{state.overrides[row.id]=input.value;invalidate();$('mappingHint').hidden=false;};result.append(input);tr.append(type,original,result);return tr;
    }));$('mappingTable').hidden=false;$('mappingHint').hidden=true;status('Import reviewed. Preview the merge or create the new project.');
  });
  $('previewResult').onclick=()=>work(async()=>{const assets=await api.previewPlan(state.plan.id);await views.combined.show(assets,assets.animation,$('combinedSkin').value);$('combinedPlay').disabled=false;status('Combined preview ready.');});
  $('combinedPlay').onclick=()=>views.combined.toggle();
  $('save').onclick=()=>work(async()=>{const result=await api.save(state.plan.id);if(!result)return;state.result=result;state.plan=null;$('saved').hidden=false;$('savedMessage').textContent=`Created ${result.project} with animation ${result.animationName}.${result.previewSkin&&result.previewSkin!=='default'?' In Spine, select skin '+result.previewSkin+' to display the imported artwork.':''}`;status('New project saved and attachment keys verified.');});
  $('openResult').onclick=()=>window.spineApi.openInSpine(state.result.project);
  $('revealResult').onclick=()=>window.spineApi.openInExplorer(state.result.project);
  $('useResult').onclick=()=>work(()=>open('main',state.result.project));
  window.addEventListener('beforeunload',()=>{cancelAnimationFrame(frame);Object.values(views).forEach(v=>v.dispose());});
  // Exposed as a small UI controller for actual Electron integration checks.
  window.importWorkspace={open:(role,file)=>work(()=>open(role,file)),state,views};
  update();
  refreshAppendSources().then(()=>consumeAppendSource());
})();
