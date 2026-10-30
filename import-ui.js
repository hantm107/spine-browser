(function(){
  const $=id=>document.getElementById(id), api=window.spineImport;
  const state={main:null,import:null,plan:null,result:null,overrides:{},sequenceRenames:{},sequenceGroups:[],selectedAnimations:[],selectionConfirmed:false,previewReady:false,busy:false};
  let appendSources=[],appendListRequest=0,takingAppendSource=false,imageFolderEdited=false;
  const appendKey=file=>(file||'').replace(/\\/g,'/').toLowerCase();
  const views=Object.fromEntries(['main','import','combined'].map(role=>[role,window.createImportPreview($(role+'Preview'),$(role+'PreviewStatus'))]));
  for(const role of ['main','import','combined']){
    const label=document.createElement('label'),select=document.createElement('select');label.textContent='Preview skin';select.id=role+'Skin';select.disabled=true;label.append(select);
    $(role+'Preview').before(label);select.onchange=()=>{views[role].skin(select.value);if(role==='import'){resetSequences();state.overrides={};invalidate();}optionHints();};
    const timeline=document.createElement('input');timeline.type='range';timeline.id=role+'Timeline';timeline.min=0;timeline.max=0;timeline.step='0.001';timeline.setAttribute('aria-label',role+' animation timeline');timeline.className='preview-timeline';timeline.disabled=true;
    $(role+'Preview').after(timeline);timeline.oninput=()=>views[role].seek(Number(timeline.value));
    const autoLabel=document.createElement('label'),auto=document.createElement('input');auto.type='checkbox';auto.checked=true;auto.id=role+'AutoFit';autoLabel.className='preview-auto-fit';autoLabel.append(auto,'Auto fit');auto.onchange=()=>views[role].autoFit(auto.checked);
    const fit=document.createElement('button');fit.textContent='Fit animation';fit.id=role+'Fit';fit.onclick=()=>{auto.checked=false;views[role].fit();};$(role+'Play').after(fit,autoLabel);
  }
  let frame;
  function tick(){for(const role of ['main','import','combined']){views[role].updateFrame();const value=views[role].inspect(),duration=views[role].duration(),timeline=$(role+'Timeline');$(role+'Fit').disabled=!value?.bones;timeline.disabled=!duration;timeline.max=duration;if(value&&duration)timeline.value=(value.time||0)%duration;}frame=requestAnimationFrame(tick);}tick();
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
    $('review').disabled=!ready||!state.selectionConfirmed||!state.selectedAnimations.length||state.busy;$('swap').disabled=!ready||state.busy;
    $('previewResult').disabled=!state.plan||state.busy;$('save').disabled=!state.plan||!state.previewReady||state.busy;
    for(const role of ['main','import'])for(const key of ['Skeleton','Animation','Skin'])$(role+key).disabled=!state[role]||state.busy;
    for(const id of ['chooseMain','chooseImport','chooseCli','cliPath','editorVersion','animationName','find','replace','matchCase','regex','importPrefix','createSkins','appendToMain'])$(id).disabled=state.busy;
    $('imageFolder').disabled=state.busy;
    $('animationName').disabled=state.busy||state.selectedAnimations.length!==1;
    $('animationChecklist').querySelectorAll('input').forEach(input=>input.disabled=state.busy);
    for(const id of ['selectAllAnimations','clearAnimations'])$(id).disabled=state.busy||!state.import;
    $('animationSelectionCount').textContent=`${state.selectedAnimations.length} selected`;
    $('combinedAnimation').disabled=state.busy||!state.plan;
    const appendChoice=appendSources.find(r=>r.fullPath===$('appendSource').value);
    $('appendSource').disabled=state.busy;
    $('useAppendSource').disabled=state.busy||!appendChoice||appendChoice.unavailable||!appendChoice.imagesAvailable;
    $('refreshAppendSources').disabled=state.busy;
    const alreadySaved=appendSources.some(r=>appendKey(r.fullPath)===appendKey(state.import?.project));
    $('saveAppendSource').disabled=state.busy||!state.import||alreadySaved;$('saveAppendSource').textContent=alreadySaved?'Source is in Append list':'Add current source to list';
    $('mappingRows').querySelectorAll('input').forEach(e=>e.disabled=state.busy);
    $('sequenceGroups').querySelectorAll('input').forEach(e=>e.disabled=state.busy||e.dataset.unavailable==='true'||(e.type!=='checkbox'&&!state.sequenceRenames[e.dataset.group]));
    $('clearSequenceRenames').disabled=state.busy||!Object.keys(state.sequenceRenames).length;
    document.querySelectorAll('.choices button,.choices select').forEach(e=>e.disabled=state.busy);
    document.body.classList.toggle('busy',state.busy);
    optionHints();
    updateWorkflow();
  }
  function updateWorkflow(){
    const projects=!!(state.main&&state.import),selection=projects&&state.selectionConfirmed&&!!state.selectedAnimations.length,review=!!(state.plan||state.result),preview=state.previewReady||!!state.result;
    const enabled=[true,projects,selection,review,preview],complete=[projects,selection,review,preview,!!state.result];
    const current=complete.findIndex(done=>!done)+1||5;
    const lockedHints=['','Open both projects first','Complete step 2 first','Complete step 3 first','Complete step 4 first'];
    for(let n=1;n<=5;n++){
      const section=$('step'+n),content=$('step'+n+'Content'),locked=!enabled[n-1],button=document.querySelector(`.workflow-progress [data-step="${n}"]`);
      section.classList.toggle('is-locked',locked);section.classList.toggle('is-complete',complete[n-1]);section.classList.toggle('is-current',n===current);
      content.disabled=locked||state.busy;content.inert=locked||state.busy;
      $('step'+n+'State').textContent=locked?lockedHints[n-1]:complete[n-1]?(n===5?'Saved':'Complete'):state.busy?'Working…':'Current step';
      button.disabled=locked||state.busy;button.classList.toggle('is-complete',complete[n-1]);
      if(n===current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    }
    $('goToAnimations').disabled=!projects||state.busy;
    $('continueToSettings').disabled=!projects||!state.selectedAnimations.length||state.busy;
    $('goToPreview').disabled=!state.plan||state.busy;$('goToSave').disabled=!state.previewReady||state.busy;
    $('animationEmpty').hidden=!!state.import;
    $('reviewNextHint').textContent=state.plan?'Review complete. Check the mappings, or continue to preview.':'Review the names and dependencies to unlock the preview.';
    const output=state.plan||state.result,names=output?.animationNames||[];
    $('saveSummary').textContent=output?`${names.length||1} animation${names.length===1?'':'s'} · ${$('appendToMain').checked?'New project beside Main':'Separate output folder'}${output.imageFolder?' · images/'+output.imageFolder+'/':''}.`:'Preview the reviewed merge before saving.';
    $('combinedPlay').disabled=!state.previewReady||state.busy;
  }
  function goToStep(n){const button=document.querySelector(`.workflow-progress [data-step="${n}"]`);if(button.disabled)return;$('step'+n).scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('step'+n+'Title').focus({preventScroll:true});}
  document.querySelectorAll('.workflow-progress button').forEach(button=>button.onclick=()=>goToStep(Number(button.dataset.step)));
  $('goToAnimations').onclick=()=>goToStep(2);
  $('continueToSettings').onclick=()=>{if(!state.main||!state.import||!state.selectedAnimations.length||state.busy)return;state.selectionConfirmed=true;update();goToStep(3);};
  $('goToPreview').onclick=()=>goToStep(4);$('goToSave').onclick=()=>goToStep(5);
  function invalidate(){revision++;state.plan=null;state.previewReady=false;state.result=null;$('saved').hidden=true;views.combined.dispose();$('combinedAnimationLabel').hidden=true;$('reviewSummary').textContent='Review the import to validate the current settings.';update();}
  function selectionChanged(){state.selectionConfirmed=false;resetSequences();state.overrides={};invalidate();}
  async function work(action){if(state.busy)return;state.busy=true;update();try{return await action();}catch(error){status(error.message,true);}finally{state.busy=false;update();consumeAppendSource();}}
  function fill(select,values){select.replaceChildren(...values.map(value=>new Option(value,value)));}
  function availableAnimations(){return state.import?.skeletons.find(s=>s.name===$('importSkeleton').value)?.animations||[];}
  function renderAnimationSelection(){
    $('animationSelection').hidden=!state.import;
    $('animationChecklist').replaceChildren(...availableAnimations().map(name=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=name;input.checked=state.selectedAnimations.includes(name);
      input.onchange=()=>{state.selectedAnimations=[...$('animationChecklist').querySelectorAll('input:checked')].map(item=>item.value);if(state.selectedAnimations.length===1){$('importAnimation').value=state.selectedAnimations[0];views.import.choose(state.selectedAnimations[0]);}selectionChanged();};
      label.append(input,document.createTextNode(name));return label;
    }));update();
  }
  $('selectAllAnimations').onclick=()=>{state.selectedAnimations=[...availableAnimations()];selectionChanged();renderAnimationSelection();};
  $('clearAnimations').onclick=()=>{state.selectedAnimations=[];selectionChanged();renderAnimationSelection();};
  function resetSequences(){state.sequenceRenames={};state.sequenceGroups=[];$('sequencePanel').hidden=true;$('sequenceGroups').replaceChildren();}
  function renderSequences(groups){
    state.sequenceGroups=groups;$('sequencePanel').hidden=false;$('sequenceSummary').textContent=groups.length?`${groups.length} sequence group${groups.length===1?'':'s'} detected in the selected animations' required images.`:'No image sequence groups were detected in the selected animations.';
    const cards=groups.map(group=>{
      const card=document.createElement('article');card.className='sequence-card';card.dataset.group=group.id;
      const heading=document.createElement('h4');heading.textContent=`${group.prefix}{number}${group.suffix} · ${group.frames.length} images${group.useCount>group.frames.length?' · '+group.slotCount+' slots share these images':''}`;
      const context=document.createElement('p');context.textContent=`${group.folder||'(images root)'} · Skin: ${group.skin}${group.hasGaps&&!group.native?' · Gaps will be removed':''}`;
      const choice=document.createElement('label'),enabled=document.createElement('input');choice.className='sequence-enable';enabled.type='checkbox';enabled.checked=!!state.sequenceRenames[group.id];enabled.dataset.group=group.id;enabled.dataset.unavailable=String(!group.canRename);choice.append(enabled,'Replace the original names');
      const fields=document.createElement('div');fields.className='sequence-fields';const controls={};
      const values=state.sequenceRenames[group.id]||{prefix:group.defaultPrefix,suffix:'',start:1,padding:3};
      for(const [key,label,type]of [['prefix','New name (before number)','text'],['suffix','Suffix (optional)','text'],['start','Starting number','number'],['padding','Zero padding','number']]){
        const wrapper=document.createElement('label'),input=document.createElement('input');wrapper.append(label,input);input.type=type;input.value=values[key];input.dataset.group=group.id;input.dataset.field=key;input.setAttribute('aria-label',`${label} for ${group.prefix}{number}${group.suffix} in ${group.skin}`);if(type==='number'){input.min=key==='start'?'0':'0';input.step='1';if(key==='padding')input.max='12';}controls[key]=input;fields.append(wrapper);
      }
      const note=document.createElement('p');note.className='sequence-note';note.textContent=group.reason||(group.native?'This name replaces the old name completely. Spine requires the number last; optional suffix text goes before it. Frame indices and timing stay unchanged.':'This name replaces the old name completely. No source names, skin names, or import prefixes are added. Original numeric order and filename extensions are kept.');if(group.useCount>group.frames.length&&group.canRename)note.textContent+=' Shared images are listed and copied once; every slot keeps its own attachment, transforms, and animation keys.';
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Before / after filenames';details.open=enabled.checked;details.append(summary);
      const scroll=document.createElement('div');scroll.className='sequence-preview';const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');for(const text of ['Original image','New image']){const th=document.createElement('th');th.textContent=text;header.append(th);}head.append(header);const body=document.createElement('tbody');table.append(head,body);scroll.append(table);details.append(scroll);
      const error=document.createElement('p');error.className='sequence-error';error.setAttribute('role','status');
      function preview(){
        let names=null;try{if(enabled.checked)names=window.ImageSequences.names(group,Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]))).files;error.textContent='';}catch(e){error.textContent=e.message;}
        body.replaceChildren(...group.frames.map((frame,i)=>{const tr=document.createElement('tr'),before=document.createElement('td'),after=document.createElement('td');before.textContent=window.ImageSequences.basename(frame.source)+(frame.extension||'');after.textContent=(names?names[i]:window.ImageSequences.basename(frame.defaultDestination||frame.destination))+(frame.extension||'');tr.append(before,after);return tr;}));
      }
      function changed(){
        if(enabled.checked)state.sequenceRenames[group.id]=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]));else state.sequenceRenames[group.id]=null;
        invalidate();preview();
      }
      enabled.onchange=()=>{details.open=enabled.checked;changed();};for(const input of Object.values(controls))input.oninput=changed;
      preview();card.append(heading,context,choice,fields,note,error,details);return card;
    });$('sequenceGroups').replaceChildren(...cards);update();
  }
  $('clearSequenceRenames').onclick=()=>{state.sequenceRenames={};invalidate();$('review').click();};
  async function preview(role){
    const project=state[role];if(!project)return;
    try{const assets=await api.preview(project.id,$(role+'Skeleton').value);await views[role].show(assets,$(role+'Animation').value,$(role+'Skin').value);$(role+'Play').disabled=false;}
    catch(error){$(role+'PreviewStatus').textContent='Preview unavailable: '+error.message;}
  }
  function animations(role){const project=state[role],skeleton=project?.skeletons.find(s=>s.name===$(role+'Skeleton').value);fill($(role+'Animation'),skeleton?.animations||[]);fill($(role+'Skin'),skeleton?.skins||[]);if(role==='main'&&skeleton?.animations.includes('idle'))$(role+'Animation').value='idle';if(role==='import'){state.selectedAnimations=skeleton?.animations.length?[$('importAnimation').value]:[];renderAnimationSelection();}}
  async function accept(role,project){
    state.selectionConfirmed=false;
    resetSequences();
    state[role]=project;state.overrides={};$('mappingTable').hidden=true;invalidate();
    $(role+'Path').textContent=project.project;$(role+'Version').textContent=`Spine ${project.version} · ${project.skeletons.length} skeleton${project.skeletons.length===1?'':'s'}`;
    $(role+'Choices').replaceChildren();fill($(role+'Skeleton'),project.skeletons.map(s=>s.name));animations(role);
    if(project.warnings.length)status(project.warnings.join(' '));
    update();await preview(role);
  }
  async function open(role,file){
    state.selectionConfirmed=false;
    resetSequences();
    state[role]=null;views[role].dispose();$(role+'Path').textContent=file;$(role+'Version').textContent='';invalidate();
    if(role==='import'){state.selectedAnimations=[];renderAnimationSelection();}
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
    $(role+'Skeleton').onchange=()=>work(async()=>{selectionChanged();animations(role);await preview(role);});
    $(role+'Animation').onchange=()=>{if(role==='import'&&state.selectedAnimations.length===1){state.selectedAnimations=[$('importAnimation').value];selectionChanged();renderAnimationSelection();}views[role].choose($(role+'Animation').value);};
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
  for(const id of ['animationName','find','replace','matchCase','regex','createSkins','appendToMain'])$(id).oninput=()=>{if(id==='createSkins')resetSequences();state.overrides={};invalidate();};
  $('importPrefix').oninput=()=>{resetSequences();if(!imageFolderEdited)$('imageFolder').value=$('importPrefix').value.trim()||'ImportedMain';state.overrides={};invalidate();};
  $('imageFolder').oninput=()=>{imageFolderEdited=true;state.overrides={};invalidate();};
  $('swap').onclick=()=>work(async()=>{const main=state.main,source=state.import;await accept('main',source);await accept('import',main);});
  $('review').onclick=()=>work(async()=>{
    if(!state.selectionConfirmed||!state.main||!state.import||!state.selectedAnimations.length)return;
    invalidate();if(!$('imageFolder').value.trim())throw Error('Enter a name for the required images subfolder.');
    const plan=await api.plan({mainId:state.main.id,importId:state.import.id,mainSkeleton:$('mainSkeleton').value,importSkeleton:$('importSkeleton').value,animation:state.selectedAnimations[0],animations:state.selectedAnimations,animationName:state.selectedAnimations.length===1?$('animationName').value:'',prefix:$('importPrefix').value.trim(),useImageFolder:true,imageFolder:$('imageFolder').value.trim(),createSkins:$('createSkins').checked,sourceSkin:$('importSkin').value||'default',appendToMain:$('appendToMain').checked,rename:{find:$('find').value,replace:$('replace').value,regex:$('regex').checked,matchCase:$('matchCase').checked},overrides:state.overrides,sequenceRenames:state.sequenceRenames,replaceSequenceNames:true});
    state.plan=plan;$('reviewSummary').textContent=`${(plan.animationNames||[plan.animationName]).join(', ')} · ${plan.group} · ${plan.stats.bones} bones · ${plan.stats.slots} slots · ${plan.stats.images} images in images/${plan.imageFolder?plan.imageFolder+'/':''} · ${plan.stats.skins} new skins${plan.createSkins===false?' (Main default attachments)':''}${plan.appendToMain?' · Save directly to '+plan.mainFolder:''}`;
    fill($('combinedAnimation'),plan.animationNames||[plan.animationName]);$('combinedAnimationLabel').hidden=false;
    fill($('combinedSkin'),['default',...plan.skins]);$('combinedSkin').value=plan.previewSkin||'default';$('combinedSkin').disabled=false;
    $('warnings').replaceChildren(...plan.warnings.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    state.sequenceRenames=plan.sequenceRenames||state.sequenceRenames;renderSequences(plan.sequenceGroups||[]);
    $('mappingRows').replaceChildren(...plan.rows.map(row=>{
      const tr=document.createElement('tr'),type=document.createElement('td'),original=document.createElement('td'),result=document.createElement('td'),input=document.createElement('input');
      type.textContent=row.type;original.textContent=row.original;input.value=row.result;input.setAttribute('aria-label',`${row.type} ${row.original} result`);
      if(row.sequenceGroup){input.readOnly=true;input.title='Controlled by the image sequence settings above.';}
      input.oninput=()=>{state.overrides[row.id]=input.value;invalidate();$('mappingHint').hidden=false;};result.append(input);tr.append(type,original,result);return tr;
    }));$('mappingTable').hidden=false;$('mappingHint').hidden=true;status('Import reviewed. Preview the merge or create the new project.');
  });
  $('combinedAnimation').onchange=()=>views.combined.choose($('combinedAnimation').value);
  $('previewResult').onclick=()=>work(async()=>{if(!state.plan)return;state.previewReady=false;update();const assets=await api.previewPlan(state.plan.id);await views.combined.show(assets,$('combinedAnimation').value||assets.animation,$('combinedSkin').value);if(!views.combined.inspect()?.bones)throw Error('The preview did not finish loading. Try Preview merge again.');state.previewReady=true;status('Preview ready. Continue to step 5 to save your new project.');});
  $('combinedPlay').onclick=()=>views.combined.toggle();
  $('save').onclick=()=>work(async()=>{if(!state.plan||!state.previewReady)return;const result=await api.save(state.plan.id);if(!result)return;state.result=result;state.plan=null;$('saved').hidden=false;const names=result.animationNames||[result.animationName];$('savedMessage').textContent=`Created ${result.project} with ${names.length===1?'animation':'animations'} ${names.join(', ')}.${result.previewSkin&&result.previewSkin!=='default'?' In Spine, select skin '+result.previewSkin+' to display the imported artwork.':''}`;status('New project saved and attachment keys verified for every imported animation.');});
  $('openResult').onclick=()=>window.spineApi.openInSpine(state.result.project);
  $('revealResult').onclick=()=>window.spineApi.openInExplorer(state.result.project);
  $('useResult').onclick=()=>work(()=>open('main',state.result.project));
  window.addEventListener('beforeunload',()=>{cancelAnimationFrame(frame);Object.values(views).forEach(v=>v.dispose());});
  // Exposed as a small UI controller for actual Electron integration checks.
  window.importWorkspace={open:(role,file)=>work(()=>open(role,file)),state,views};
  update();
  refreshAppendSources().then(()=>consumeAppendSource());
})();
