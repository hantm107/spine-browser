const {app,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scratch=process.env.SPINE_LIBRARY_TEST_DIR,root=path.resolve(__dirname,'..');
if(!scratch)throw Error('Run through tests/run-library-performance.cjs.');
app.setPath('userData',path.join(scratch,'profile'));
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const folder=path.join(scratch,'library');fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(path.join(folder,'images'));
for(let i=0;i<506;i++)fs.writeFileSync(path.join(folder,`project-${String(i).padStart(3,'0')}-long-effect-name.spine`),'raw editor project');
const checks=[];let started=false;
const deadline=setTimeout(()=>finish(Error('Large-library test timed out')),45000);
function finish(error){clearTimeout(deadline);fs.mkdirSync(path.join(root,'.temp'),{recursive:true});fs.writeFileSync(path.join(root,'.temp/library-performance-results.json'),JSON.stringify({checks,error:error?.stack},null,2));if(error)console.error(error);app.exit(error?1:0);}
app.on('browser-window-created',(_event,win)=>{
 if(started)return;started=true;win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',()=>run(win).then(()=>finish()).catch(finish));
});
require('../main.js');
async function run(win){
 const evaluate=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const frames=()=>evaluate('(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()');
 const check=async(name,code,verify)=>{const result=await evaluate(code);try{verify(result);}catch(error){console.error(name,result);throw error;}checks.push({name,result});console.log('PASS '+name);};
 const until=async(code)=>{for(let i=0;i<150;i++){if(await evaluate(code))return;await wait(30);}throw Error('Timed out: '+code);};
 await evaluate(`chooseFolder(${JSON.stringify(folder)})`);await frames();
 const largeCategory=await evaluate(`(async()=>{const c=createCategory('Large collection');for(let i=0;i<20;i++)c.assets[allProjects[i].id]=bookmark(allProjects[i]);workspace.favorites[allProjects[0].id]=bookmark(allProjects[0]);await spineApi.setAppendList(allProjects[0].fullPath,true);await refreshAppendList();renderProjectList(filteredProjects());return c.id;})()`);await frames();
 await evaluate(`window.originalCards=[...projectList.children];`);
 await check('selecting an asset keeps every existing card mounted',`(async()=>{await selectProject(allProjects[200]);return {same:originalCards.every((c,i)=>projectList.children[i]===c),selected:projectList.querySelector('.selected').dataset.id===allProjects[200].id};})()`,r=>{assert.equal(r.same,true);assert.equal(r.selected,true);});
 for(const view of ['list','grid']){
  await evaluate(`libraryView.value=${JSON.stringify(view)};libraryView.onchange();projectList.scrollTop=0;`);await frames();
  for(const width of [980,1600]){
   win.setSize(width,850);await frames();
   await check(`${view} resize defers most offscreen card contents at ${width}px`,`(()=>{const cards=[...projectList.children];return{count:cards.length,rendered:cards.filter(c=>c.querySelector('.asset-text').checkVisibility({contentVisibilityAuto:true})).length,overflow:document.documentElement.scrollWidth>innerWidth};})()`,r=>{assert.equal(r.count,506);assert.ok(r.rendered>0&&r.rendered<150);assert.equal(r.overflow,false);});
  }
  await evaluate(`searchInput.value='project-12';searchInput.dispatchEvent(new Event('input'));`);
  await check(`${view} filtering reaches offscreen assets`,'filteredProjects().length',r=>assert.equal(r,10));
  await evaluate(`searchInput.value='';searchInput.dispatchEvent(new Event('input'));`);await frames();
  const saved=await evaluate(`(async()=>{await selectProject(allProjects[300]);projectList.children[300].scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return {selected:selectedProject.id,scroll:projectList.scrollTop,top:projectList.children[300].getBoundingClientRect().top-projectList.getBoundingClientRect().top};})()`);
  for(const category of ['favorites','append',largeCategory]){
   await evaluate(`(async()=>{await selectCategory(${JSON.stringify(category)});await selectCategory('all');})()`);await frames();
   await check(`${view} restores a large collection after ${category}`,`({selected:selectedProject.id,scroll:projectList.scrollTop,top:projectList.children[300].getBoundingClientRect().top-projectList.getBoundingClientRect().top})`,r=>{assert.equal(r.selected,saved.selected);assert.ok(r.scroll>1000);assert.ok(Math.abs(r.top-saved.top)<=1,JSON.stringify({r,saved}));});
  }
  await evaluate(`selectCategory('favorites')`);
  const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await loaded;
  await until('hasScannedFolder&&activeCategory()==="favorites"');
  await evaluate(`selectCategory('all')`);await frames();
  await check(`${view} restores the visible asset after restarting in another collection`,`({selected:selectedProject.id,top:projectList.children[300].getBoundingClientRect().top-projectList.getBoundingClientRect().top})`,r=>{assert.equal(r.selected,saved.selected);assert.ok(Math.abs(r.top-saved.top)<=1,JSON.stringify({r,saved}));});
  await evaluate(`projectList.focus();projectList.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));`);
  await until('selectedProject?.id!==allProjects[300].id');
  await check(`${view} keyboard navigation reaches the next row near the end of the library`,'projectList.querySelector(".selected").dataset.id===selectedProject.id',r=>assert.equal(r,true));
 }
 await evaluate(`editAssetCategories(selectedProject);document.querySelector('.category-membership').click();document.querySelector('#categoryDialog .dialog-close').click();`);
 await check('cached cards update their category labels','projectList.querySelector(".selected .asset-category-tag").textContent',r=>assert.equal(r,'Large collection'));
}
