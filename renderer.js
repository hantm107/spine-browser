const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const searchInput = document.getElementById('searchInput');
const hideSkelCheckbox = document.getElementById('hideSkelCheckbox');
const projectList = document.getElementById('projectList');
const summary = document.getElementById('summary');
const openExplorerBtn = document.getElementById('openExplorerBtn');
const openSpineBtn = document.getElementById('openSpineBtn');
const detailName = document.getElementById('detailName');
const detailFolder = document.getElementById('detailFolder');
const detailFile = document.getElementById('detailFile');
const detailSize = document.getElementById('detailSize');
const projectHeader = document.getElementById('projectHeader');
const previewTitle = document.getElementById('previewTitle');
const previewText = document.getElementById('previewText');
const playerHost = document.getElementById('playerHost');
document.getElementById('importWorkspaceBtn').onclick=()=>window.spineApi.openImportWorkspace();

let workspace = {};
let appendBookmarks={},appendRefresh=0;
const appendPending=new Set();
const appendPathKey=file=>/^[a-z]:/i.test(file||'')?file.replace(/\\/g,'/').toLowerCase():(file||'').replace(/\\/g,'/');
function appendSourcePath(project){return (project.files||[]).find(f=>/\.spine$/i.test(f.fullPath))?.fullPath||project.fullPath;}
function appendRecord(project){const key=appendPathKey(appendSourcePath(project));return Object.values(appendBookmarks).find(p=>appendPathKey(p.fullPath)===key);}
async function refreshAppendList(){
  const request=++appendRefresh;
  try{
    const records=await window.spineApi.getAppendList();if(request!==appendRefresh)return;
    appendBookmarks=Object.fromEntries(records.map(p=>[p.id,p]));renderCategories();
    if(activeCategory()==='append')refreshProjectList();else renderProjectList(filteredProjects());
  }catch(error){document.getElementById('categoryMessage').textContent='Append list: '+describeError(error);}
}
async function toggleAppend(project){
  const file=appendRecord(project)?.fullPath||appendSourcePath(project),key=appendPathKey(file);if(appendPending.has(key))return;
  appendPending.add(key);
  try{await window.spineApi.setAppendList(file,!appendRecord(project));await refreshAppendList();}
  catch(error){document.getElementById('categoryMessage').textContent='Append list: '+describeError(error);}
  finally{appendPending.delete(key);}
}
async function useAppendSource(project){
  const record=appendRecord(project)||project;
  try{await window.spineApi.openImportWorkspace(record.fullPath);}
  catch(error){document.getElementById('categoryMessage').textContent=describeError(error);}
}
try { workspace = JSON.parse(localStorage.getItem('workspaceV1') || '{}') || {}; } catch {}
workspace.favorites ||= {}; workspace.recent ||= [];
workspace.categories=Array.isArray(workspace.categories)?workspace.categories:[];
for(const category of workspace.categories)category.assets ||= {};
let favoriteRefresh = 0;
function bookmark(project) { return {...project,id:project.id,fullPath:project.fullPath,unavailable:false}; }
function favoriteProjects(records = workspace.favorites) {
  return Object.entries(records).filter(([,value])=>value).map(([id,value])=>{
    const fileName=id.split(/[\\/]/).pop();
    const saved=typeof value==='object'?value:{id,fullPath:id,fileName,name:fileName.replace(/\.[^.]+$/,''),folder:id.replace(/[\\/][^\\/]+$/,''),relativePath:id};
    return {...saved,id,folder:saved.fullPath.replace(/[\\/][^\\/]+$/,''),relativePath:saved.fullPath};
  });
}
async function refreshFavorites() {
  const request=++favoriteRefresh;
  const collections=[workspace.favorites,appendBookmarks,...workspace.categories.map(c=>c.assets)];
  const projects=[...new Map(collections.flatMap(collection=>favoriteProjects(collection)).map(p=>[p.id,p])).values()];
  const records=await Promise.all(projects.map(async project=>{
    try { return {...project,...await window.spineApi.inspectFavorite(project.fullPath),id:project.id}; }
    catch(error) {return {...project,unavailable:true,unavailableReason:describeError(error)};}
  }));
  if(request!==favoriteRefresh)return;
  for(const collection of collections)for(const record of records)if(collection[record.id])collection[record.id]=record;
  saveWorkspace();
}
let currentFolder = '', playbackControls = null, thumbnailTimer = null;
const thumbnailCache = new Map();
const favoritesOnly = document.getElementById('favoritesOnly');
const libraryView = document.getElementById('libraryView');
const recentFolders = document.getElementById('recentFolders');
searchInput.value = workspace.search || '';
favoritesOnly.checked = !!workspace.favoritesOnly;
libraryView.value = workspace.view === 'grid' ? 'grid' : 'list';
function saveWorkspace() {
  workspace.folder=currentFolder || workspace.folder; workspace.selected=selectedProject?.id || null;
  workspace.search=searchInput.value;workspace.favoritesOnly=favoritesOnly.checked;workspace.view=libraryView.value;
  workspace.scroll=projectList.scrollTop;
  try {localStorage.setItem('workspaceV1',JSON.stringify(workspace));}catch{}
}
function renderRecentFolders(){recentFolders.replaceChildren(new Option('Recent folders',''));for(const folder of workspace.recent)recentFolders.add(new Option(folder,folder));}
renderRecentFolders();
let allProjects = [];
let selectedProject = null;
let navigationTimer, navigationProject = null;
function cancelNavigation() {
  clearTimeout(navigationTimer);
  navigationProject = null;
}
let activePlayer = null;
let previewRequest = 0;
let scanRequest = 0;
let scanWarnings = [];
let hasScannedFolder = false;

try { hideSkelCheckbox.checked = localStorage.getItem('hideSkelFiles') === 'true'; }
catch { /* Filtering still works when preference storage is unavailable. */ }

function formatFileSize(bytes) {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assignPreviewText(title, message) {
  previewTitle.textContent = title;
  previewText.textContent = message;
}

function describeError(error) {
  const message = String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const missing = message.match(/ENOENT:.*(?:open|scandir) '([^']+)'/);
  if (missing) return `A required file or folder is missing: ${missing[1]}`;
  return message;
}

function disposePlayer() {
  clearTimeout(thumbnailTimer);
  playbackControls?.dispose(); playbackControls=null;
  const previous = activePlayer;
  activePlayer = null;
  if (previous) {
    try { previous.dispose(); } catch (error) { console.error('Player cleanup failed', error); }
  }
  playerHost.replaceChildren();
}

function clearPreview() {
  previewRequest++;
  disposePlayer();
  assignPreviewText('No file selected', 'Select a Spine project to start playback.');
}

function filteredProjects() {
  const value = searchInput.value.trim().toLowerCase();
  const collection=activeBookmarkMap();
  const projects=collection?favoriteProjects(collection):allProjects;
  return projects.filter(p => (!!collection || includeFileType(p)) && (!value || (p.files || [p]).some(f => (f.fileName || f.name).toLowerCase().includes(value) || (collection?f.fullPath:f.folder).toLowerCase().includes(value))));
}

function includeFileType(project) {
  return !hideSkelCheckbox.checked || !/\.skel$/i.test(project.fileName || project.fullPath);
}

function updateSummary() {
  renderCategories();
  if (!hasScannedFolder && !activeBookmarkMap()) return;
  const count = filteredProjects().length;
  const category=workspace.categories.find(c=>c.id===activeCategory());
  if(activeCategory()==='append'){summary.textContent=`${count} of ${Object.keys(appendBookmarks).length} Append list sources shown`;return;}
  if(category){summary.textContent=count+' of '+Object.keys(category.assets).length+' in '+category.name;return;}
  summary.textContent = favoritesOnly.checked ? `${count} of ${favoriteProjects().length} global favorites shown` : count + ' of ' + allProjects.length + ' assets shown' + (scanWarnings.length ? ' - ' + scanWarnings.length + ' paths skipped' : '');
}

const thumbnailObserver = new IntersectionObserver(entries=>{
  for(const entry of entries){if(!entry.isIntersecting)continue;const image=entry.target;thumbnailObserver.unobserve(image);
    const key=image.dataset.thumbnailKey;
    window.spineApi.loadThumbnail(key).then(uri=>{if(uri){thumbnailCache.set(key,uri);if(image.isConnected)image.src=uri;}}).catch(()=>{});
  }
},{root:projectList,rootMargin:'100px'});
async function captureThumbnail(project,player,current){
  if(!current() || !player?.canvas || document.hidden)return;
  const key=project.thumbnailKey || project.id, rect=player.canvas.getBoundingClientRect();
  if(rect.top<0 || rect.bottom>innerHeight || rect.width<1 || rect.height<1)return;
  try {const uri=await window.spineApi.captureThumbnail(key,{x:rect.x,y:rect.y,width:rect.width,height:rect.height});
    if(!current())return;thumbnailCache.set(key,uri);
    for(const image of projectList.querySelectorAll('img'))if(image.dataset.thumbnailKey===key || image.closest('li')?.dataset.id===project.id)image.src=uri;
    return uri;
  }catch(error){console.warn('Thumbnail capture failed',error);}
}
function scheduleThumbnail(project,player,current){thumbnailTimer=setTimeout(()=>captureThumbnail(project,player,current),1200);}
window.captureSelectedThumbnail=async()=>{
  const request=previewRequest, project=selectedProject,player=activePlayer;if(!project || !player)return;
  player.canvas.scrollIntoView({block:'center'});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return captureThumbnail(project,player,()=>request===previewRequest);
};
function renderProjectList(projects) {
  const scroll = projectList.scrollTop;
  projectList.classList.toggle('thumbnail-grid',libraryView.value==='grid');
  thumbnailObserver?.disconnect();
  const fragment = document.createDocumentFragment();
  for (const project of projects) {
    const item = document.createElement('li');
    item.className = 'project-item';
    const highlighted = (navigationProject || selectedProject)?.id === project.id;
    item.classList.toggle('selected', highlighted);
    if (highlighted) item.setAttribute('aria-current', 'true');
    item.dataset.id = project.id;
    const name = document.createElement('div'), folder = document.createElement('div');
    name.className = 'project-name'; folder.className = 'project-folder';
    name.textContent = project.fileName || project.name;
    folder.textContent = project.folder;
    folder.title = project.fullPath || project.folder;
    if(project.unavailable){const unavailable=document.createElement('span');unavailable.className='unavailable';unavailable.textContent='Unavailable - '+(project.unavailableReason || 'File missing');folder.append(document.createElement('br'),unavailable);}
    const image=document.createElement('img');image.className='asset-thumbnail';image.alt='';image.loading='lazy';
    const key=project.thumbnailKey || project.id;
    if(thumbnailCache.has(key))image.src=thumbnailCache.get(key);else{image.dataset.thumbnailKey=key;thumbnailObserver?.observe(image);}
    const text=document.createElement('div');text.className='asset-text';text.append(name,folder);
    const formats=document.createElement('small');formats.textContent=(project.files || [project]).map(f=>f.fileName?.split('.').pop()).filter(Boolean).join(' - ');text.append(formats,assetCategoryTags(project));
    const favorite=document.createElement('button');favorite.className='favorite-button';favorite.textContent=workspace.favorites[project.id]?'\u2605':'\u2606';favorite.title='Toggle favorite';favorite.setAttribute('aria-label','Favorite '+project.name);favorite.setAttribute('aria-pressed',String(!!workspace.favorites[project.id]));
    favorite.onclick=event=>{event.stopPropagation();if(workspace.favorites[project.id])delete workspace.favorites[project.id];else workspace.favorites[project.id]=bookmark(project);saveWorkspace();refreshProjectList();};
    const actions=document.createElement('div');actions.className='asset-bookmark-actions';
    const tags=document.createElement('button');tags.className='edit-asset-tags';tags.textContent='Tags';tags.setAttribute('aria-label','Assign categories to '+project.name);tags.onclick=event=>{event.stopPropagation();editAssetCategories(project);};
    const appended=!!appendRecord(project),append=document.createElement('button');append.className='append-list-button';append.textContent=appended?'In Append':'Append +';append.setAttribute('aria-label',(appended?'Remove from':'Add to')+' Append list: '+project.name);append.setAttribute('aria-pressed',String(appended));
    append.onclick=event=>{event.stopPropagation();toggleAppend(project);};
    actions.append(favorite,append,tags);
    if(activeCategory()==='append'){
      const use=document.createElement('button');use.className='use-append-source';use.textContent='Import animation';use.disabled=!!project.unavailable||project.imagesAvailable===false;use.title=project.imagesAvailable===false?'This source needs an images folder beside its project.':'Open this source in the Import workspace';use.onclick=event=>{event.stopPropagation();useAppendSource(project);};actions.append(use);
    }
    item.append(image,text,actions);
    item.addEventListener('click', () => { selectProject(project); projectList.focus({preventScroll:true}); });
    fragment.append(item);
  }
  if (!projects.length) {
    const empty = document.createElement('li');
    empty.className = 'project-item';
    empty.textContent = activeCategory()==='append'?(searchInput.value.trim()?'No matching Append list sources':'Append list is empty. Add sources with Append +.'):activeBookmarkMap() ? (searchInput.value.trim()?'No matching bookmarks':'No bookmarked assets in this category') : allProjects.length ? 'No matching files' : 'No Spine files found';
    fragment.append(empty);
  }
  projectList.replaceChildren(fragment);
  projectList.scrollTop=scroll;
}

function updateDetailPanel(project) {
  detailName.textContent = project?.name || '-';
  detailFolder.textContent = project?.folder || '-';
  detailFile.textContent = project?.fileName || '-';
  detailSize.textContent = project ? formatFileSize(project.size) : '-';
  const related=document.getElementById('relatedFileList');related.replaceChildren();
  for(const file of project?.files || (project?[project]:[])){
    const button=document.createElement('button');button.textContent=file.fileName;button.className='quiet';
    button.onclick=()=>selectProject({...project,...file,id:project.id,files:project.files,thumbnailKey:project.thumbnailKey});related.append(button);
  }
  const heading = document.createElement('h1'), description = document.createElement('p');
  heading.textContent = project?.name || 'Spine Browser';
  description.textContent = project?.relativePath || 'Select a folder to begin.';
  projectHeader.replaceChildren(heading, description);
  openExplorerBtn.disabled = !project;
  openSpineBtn.disabled = !project;
}

function chooseAnimationName(names, animations = []) {
  const animated = new Set(animations.filter(animation=>animation.duration>0).map(animation=>animation.name));
  if(animated.size)names=names.filter(name=>animated.has(name));
  for (const preferred of ['idle', 'run', 'walk', 'attack', 'jump', 'dance', 'skill', 'hit']) {
    const match = names.find(name => name.toLowerCase() === preferred);
    if (match) return match;
  }
  return names[0] || null;
}

async function setupPreview(project) {
  if (!project) { clearPreview(); return; }
  const request = ++previewRequest;
  const current = () => request === previewRequest;
  disposePlayer();
  const bookmarkCollection=activeBookmarkMap();
  if(bookmarkCollection?.[project.id]) {
    const record=await window.spineApi.inspectFavorite(project.fullPath);
    if(!current())return;
    if(record.unavailable){bookmarkCollection[project.id]={...project,...record,id:project.id};saveWorkspace();renderProjectList(filteredProjects());assignPreviewText(favoritesOnly.checked?'Favorite unavailable':'Category asset unavailable',`${record.unavailableReason} ${project.fullPath}`);return;}
  }
  assignPreviewText(project.name, 'Loading animation…');
  const failed = message => {
    if (!current()) return;
    disposePlayer();
    assignPreviewText('Preview failed', message);
  };
  try {
    const assets = await window.spineApi.resolveSpineAssets(project.fullPath);
    if (!current()) return;
    if (!assets.skeletonPath || !assets.atlasPath) {
      assignPreviewText(project.isDirectSpineFile ? 'Spine editor project' : 'No matching atlas',
        `${assets.reason || 'No matching export was found.'} ${project.isDirectSpineFile ? 'Open this project in Spine, or add its exported skeleton and atlas for playback.' : 'Place the matching atlas beside this export.'}`);
      return;
    }
    const version = await window.spineApi.detectSpineVersion(assets.skeletonPath);
    if (!current()) return;
    if (version.mismatch) {
      assignPreviewText('Unsupported Spine version', `${version.fileVersion ? `This export uses Spine ${version.fileVersion}.` : 'The export version could not be identified.'} Supported versions: ${version.supportedVersions.join(', ')}.`);
      return;
    }
    const runtime = await window.SpineRuntimeLoader.load(version.series);
    if (!current()) return;
    const [skeletonUrl, atlasUrl, atlasText, skeletonDataURI, atlasDataURI] = await Promise.all([
      window.spineApi.fileUrlForPath(assets.skeletonPath), window.spineApi.fileUrlForPath(assets.atlasPath),
      window.spineApi.readTextFile(assets.atlasPath), window.spineApi.readDataUri(assets.skeletonPath),
      window.spineApi.readDataUri(assets.atlasPath),
    ]);
    if (!current()) return;
    const atlas = new window.SpineRuntimeLoader.atlasRuntime.TextureAtlas(atlasText);
    const textures = {};
    const isJson = /\.json$/i.test(assets.skeletonPath);
    // Canonical extension is also used for upper-case .JSON exports: the player tests it case-sensitively.
    const skeletonKey = isJson ? skeletonUrl.replace(/\.json$/i, '.json') : skeletonUrl;
    const rawDataURIs = { [skeletonKey]: skeletonDataURI, [atlasUrl]: atlasDataURI };
    await Promise.all(atlas.pages.map(async page => {
      const texturePath = await window.spineApi.resolveRelativeResource(assets.atlasPath, page.name);
      const [url, uri] = await Promise.all([window.spineApi.fileUrlForPath(texturePath), window.spineApi.readDataUri(texturePath)]);
      textures[page.name] = uri;
      // Match both canonical file URLs and the runtime's literal parent + page-name lookup.
      rawDataURIs[url] = uri;
      rawDataURIs[atlasUrl.slice(0, atlasUrl.lastIndexOf('/') + 1) + page.name] = uri;
    }));
    if (!current()) return;
    let playerOptions;
    window.SpineBlendCompatibility.configure(runtime, textures, atlas.pages);
    const success = (player, name) => {
      if (!current()) return;
      let animation = name || chooseAnimationName(player.skeleton.data.animations.map(a => a.name),player.skeleton.data.animations);
      if (version.kind === 'player' && animation) {
        playerOptions.animation = animation;
        player.setAnimation(animation, true);
        player.play();
      }
      playbackControls?.dispose();
      const displayVersion = version.inferredLegacy ? '2.x (unversioned JSON; 2.1 compatibility)' : version.fileVersion;
      const exportNote = version.fileVersion === '3.8.75' ? ' · Legacy export: best-effort preview' : '';
      const fallbackNote=assets.fallbackReason?' · '+assets.fallbackReason:'';
      playbackControls=window.attachPlaybackControls(player,project,workspace,saveWorkspace,chosen=>assignPreviewText(project.name,'Playing: '+chosen+' - Spine '+displayVersion+exportNote+fallbackNote));
      animation=(player.animationState.getCurrent?.(0)||player.animationState.getTrack?.(0))?.animation.name || animation;
      scheduleThumbnail(project,player,current);
      assignPreviewText(project.name, (animation ? `Playing: ${animation} · Spine ${displayVersion}` : `Preview loaded · Spine ${displayVersion} · No animations`)+exportNote+fallbackNote);
    };
    const error = (_player, message) => {
      // Runtime callbacks can occur within their render loop; clean up after that stack returns.
      queueMicrotask(() => failed(message));
    };
    if (version.kind === 'legacy') {
      const json = isJson ? JSON.parse(await window.spineApi.readTextFile(assets.skeletonPath)) : null;
      if (!current()) return;
      const player = new window.LegacySpinePlayer(playerHost, { runtime, series: version.series, atlasText, textures, skeletonDataURI, isJson, json,
        premultipliedAlpha: true, chooseAnimation: chooseAnimationName, success, error });
      activePlayer = player;
      await player.ready;
    } else {
      playerOptions = { skeleton: skeletonKey, atlas: atlasUrl, atlasUrl, rawDataURIs,
        jsonUrl: isJson ? skeletonKey : undefined, skelUrl: isJson ? undefined : skeletonKey,
        showControls: false, showLoading: true, backgroundColor: '#111827', alpha: false, premultipliedAlpha: true, defaultMix: 0.2,
        success: player => success(player), error };
      activePlayer = new runtime.SpinePlayer(playerHost, playerOptions);
    }
  } catch (error) {
    if (current()) { console.error(error); failed(describeError(error)); }
  }
}

async function selectProject(project) {
  cancelNavigation();
  selectedProject = project;
  saveWorkspace();
  updateDetailPanel(project);
  renderProjectList(filteredProjects());
  await setupPreview(project);
}

async function chooseFolder(folderOverride) {
  const restoreSelection=workspace.selected, restoreScroll=workspace.scroll || 0;
  const request = ++scanRequest;
  chooseFolderBtn.disabled = true;
  try {
    const folder = typeof folderOverride === 'string' ? folderOverride : await window.spineApi.selectFolder();
    if (!folder || request !== scanRequest) return;
    summary.textContent = 'Scanning folder…';
    summary.title = '';
    hasScannedFolder = false;
    allProjects = [];
    await selectProject(null);
    const { projects, warnings } = await window.spineApi.scanLibrary(folder);
    if (request !== scanRequest) return;
    currentFolder=folder;
    workspace.recent=[folder,...workspace.recent.filter(f=>f!==folder)].slice(0,10);renderRecentFolders();
    allProjects = projects;
    for(const collection of [workspace.favorites,...workspace.categories.map(c=>c.assets)])for(const project of projects)if(collection[project.id])collection[project.id]=bookmark(project);
    await refreshFavorites();
    if(request!==scanRequest)return;
    scanWarnings = warnings;
    hasScannedFolder = true;
    updateSummary();
    summary.title = warnings.map(w => `${w.path}: ${w.message}`).join('\n');
    await selectProject(filteredProjects().find(p=>p.id===restoreSelection) || filteredProjects()[0] || null);
    projectList.scrollTop=restoreScroll;saveWorkspace();
  } catch (error) {
    if (request !== scanRequest) return;
    allProjects = [];
    await selectProject(null);
    summary.textContent = 'Folder scan failed';
    assignPreviewText('Folder scan failed', describeError(error));
  } finally { if (request === scanRequest) chooseFolderBtn.disabled = false; }
}

function refreshProjectList() {
  cancelNavigation();
  updateSummary();
  const projects = filteredProjects();
  if (!projects.some(p => p.id === selectedProject?.id)) selectProject(projects[0] || null);
  else renderProjectList(projects);
}
searchInput.addEventListener('input',()=>{refreshProjectList();saveWorkspace();});
hideSkelCheckbox.addEventListener('change', () => {
  try { localStorage.setItem('hideSkelFiles', String(hideSkelCheckbox.checked)); }
  catch { /* Keep the current session's choice if saving is unavailable. */ }
  updateSummary();
  refreshProjectList();
});
chooseFolderBtn.addEventListener('click',()=>chooseFolder());
favoritesOnly.onchange=()=>selectCategory(favoritesOnly.checked?'favorites':'all');
libraryView.onchange=()=>{cancelNavigation();renderProjectList(filteredProjects());saveWorkspace();};
recentFolders.onchange=()=>{if(recentFolders.value)chooseFolder(recentFolders.value);};
document.getElementById('rescanBtn').onclick=()=>{if(currentFolder)chooseFolder(currentFolder);};
window.addEventListener('beforeunload',saveWorkspace);
projectList.tabIndex = 0;
projectList.setAttribute('aria-label', 'Files. Use arrow keys to browse.');
document.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (document.querySelector('dialog[open]') || target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  if (target.closest('button,a,[role="slider"]') && !projectList.contains(target)) return;
  const projects = filteredProjects(), cards = [...projectList.querySelectorAll('[data-id]')];
  if (!projects.length || cards.length !== projects.length) return;
  event.preventDefault();
  let index = projects.findIndex(p => p.id === (navigationProject || selectedProject)?.id);
  if (index < 0) index = 0;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') index = Math.max(0,Math.min(projects.length-1,index+(event.key==='ArrowLeft'?-1:1)));
  else {
    const rows = [];
    cards.forEach((card,i) => {
      const rect = card.getBoundingClientRect();
      let row = rows.at(-1);
      if (!row || Math.abs(row.top-rect.top)>2) { row={top:rect.top,items:[]}; rows.push(row); }
      row.items.push({index:i,x:rect.left+rect.width/2});
    });
    const rowIndex = rows.findIndex(row=>row.items.some(item=>item.index===index));
    const nextRow = rows[rowIndex+(event.key==='ArrowUp'?-1:1)];
    if (nextRow) {
      const x = rows[rowIndex].items.find(item=>item.index===index).x;
      index = nextRow.items.reduce((best,item)=>Math.abs(item.x-x)<Math.abs(best.x-x)?item:best).index;
    }
  }
  clearTimeout(navigationTimer);
  navigationProject = projects[index];
  cards.forEach((card,i)=>{card.classList.toggle('selected',i===index);if(i===index)card.setAttribute('aria-current','true');else card.removeAttribute('aria-current');});
  cards[index].scrollIntoView({block:'nearest',inline:'nearest'});
  projectList.focus({preventScroll:true});
  const pending = navigationProject;
  navigationTimer = setTimeout(()=>{
    if (document.querySelector('dialog[open]') || pending.id===selectedProject?.id) { cancelNavigation();renderProjectList(filteredProjects());return; }
    if (navigationProject===pending && filteredProjects().some(p=>p.id===pending.id)) selectProject(pending);
  },200);
});
playerHost.title = 'Drag left or right to scrub the animation. Click to pause or resume playback.';

async function openSelected(method, title, message) {
  const project = selectedProject;
  if (!project) return;
  try {
    const ok = await window.spineApi[method](project.fullPath);
    if (!ok && selectedProject === project) assignPreviewText(title, message);
  } catch (error) { if (selectedProject === project) assignPreviewText(title, describeError(error)); }
}
openExplorerBtn.addEventListener('click', () => openSelected('openInExplorer', 'Explorer issue', 'The file could not be shown in Explorer.'));
openSpineBtn.addEventListener('click', () => openSelected('openInSpine', 'Spine launch failed', 'The editor could not be launched. Check your Spine installation and file association.'));
initializeCategories();
updateDetailPanel(null);
clearPreview();
renderProjectList([]);
window.spineApi.onAppendListChanged(()=>refreshAppendList());
refreshAppendList();
if(workspace.folder)chooseFolder(workspace.folder);
else refreshFavorites().then(()=>{refreshProjectList();saveWorkspace();});
