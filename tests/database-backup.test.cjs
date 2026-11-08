const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createBackup,validateBackup,storageFromBackup,readBackup,writeBackup,restoreBackup,MAX_BYTES}=require('../src/database-backup');
const {applyStorage}=require('../src/database-backup-ipc');
const {createAppendListStore}=require('../src/append-list-store');
function record(fullPath){const fileName=path.basename(fullPath);return {id:fullPath,fullPath,name:fileName.replace(/\.[^.]+$/,''),fileName,folder:path.dirname(fullPath),relativePath:fullPath};}
function fixtureBackup(){
  const a=record(path.resolve('missing-assets','火.spine')),b=record(path.resolve('other-assets','火.spine'));
  a.files=[record(path.resolve('missing-assets','火.json')),{...a}];
  const workspace={folder:path.dirname(a.fullPath),recent:[path.dirname(a.fullPath),path.dirname(b.fullPath)],favorites:{[a.id]:a},
    categories:[{id:'effects',name:'Effects',color:'#60a5fa',assets:{[a.id]:a,[b.id]:b}}],category:'effects',view:'grid',favoritesOnly:false,
    search:'火',selected:a.id,scroll:42,browseLocations:{effects:{folder:path.dirname(a.fullPath),selected:a.id,search:'火',scroll:42,anchor:{id:a.id,offset:-10}}}};
  return createBackup({workspaceV1:JSON.stringify(workspace),hideSkelFiles:'true',spineImportSettings:'{"cliPath":"C:\\\\Spine\\\\Spine.com","editorVersion":"4.2.43"}'},[b],'1.6.1');
}
async function scratch(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-backup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('JSON round trip preserves grouped bookmarks, shared memberships, colors, folder links and preferences',async t=>{
  const root=await scratch(t),backup=fixtureBackup(),file=path.join(root,'library.json');
  await writeBackup(file,backup);const loaded=await readBackup(file);
  assert.deepEqual(loaded,backup);
  const storage=storageFromBackup(loaded);
  assert.deepEqual(JSON.parse(storage.workspaceV1),backup.data.workspace);
  assert.equal(storage.hideSkelFiles,'true');assert.equal(JSON.parse(storage.spineImportSettings).editorVersion,'4.2.43');
  assert.equal(backup.data.workspace.categories[0].assets[Object.keys(backup.data.workspace.favorites)[0]].fullPath,Object.values(backup.data.workspace.favorites)[0].fullPath);
});
test('empty library and legacy boolean favorites can be exported',()=>{
  const empty=createBackup({},[],'test');assert.deepEqual(empty.data.workspace,{favorites:{},recent:[],categories:[]});
  assert.equal(storageFromBackup(empty).spineImportSettings,null);
  const backup=fixtureBackup(),id=Object.keys(backup.data.workspace.favorites)[0];backup.data.workspace.favorites[id]=true;validateBackup(backup);
});
test('invalid or future backups reject without touching existing files',async t=>{
  const root=await scratch(t),file=path.join(root,'keep.json');await writeBackup(file,fixtureBackup());const original=await fs.readFile(file,'utf8');
  const mutations=[b=>b.version=2,b=>b.format='other-app',b=>b.data.workspace.recent=['relative/path'],b=>b.data.workspace.favorites={bad:true},
    b=>b.data.workspace.categories.push(b.data.workspace.categories[0]),b=>b.data.workspace.categories[0].color='url(evil)',
    b=>b.data.workspace.categories[0].id='__proto__',b=>b.data.workspace.browseLocations.effects.scroll='42',
    b=>delete Object.values(b.data.workspace.favorites)[0].name,b=>b.data.appendList.push(b.data.appendList[0]),
    b=>b.data.preferences.importSettings.cliPath=123,b=>b.data.workspace.favorites=null];
  for(const mutate of mutations){const backup=fixtureBackup();mutate(backup);await assert.rejects(writeBackup(file,backup),/Invalid library backup/);}
  const polluted=JSON.parse(JSON.stringify(fixtureBackup()).replace('"workspace":{','"workspace":{"__proto__":{"polluted":true},'));
  assert.throws(()=>validateBackup(polluted),/unsafe property/);assert.equal({}.polluted,undefined);
  assert.equal(await fs.readFile(file,'utf8'),original);
  await fs.writeFile(path.join(root,'broken.json'),'{broken');await assert.rejects(readBackup(path.join(root,'broken.json')));
  const oversized=path.join(root,'large.json'),handle=await fs.open(oversized,'w');await handle.truncate(MAX_BYTES+1);await handle.close();
  await assert.rejects(readBackup(oversized),/exceeds 32 MB/);
});
test('restoring retains unavailable Append sources across restart and saves a complete recovery backup',async t=>{
  const root=await scratch(t),file=path.join(root,'append.json'),store=createAppendListStore(file),backup=fixtureBackup(),current=createBackup({},[],'test');
  let storage;const recoveryFile=path.join(root,'recovery.json');
  await restoreBackup(backup,{appendList:store,current,recoveryFile,applyStorage:async value=>{storage=value;}});
  const reopened=createAppendListStore(file),list=await reopened.list();assert.equal(list.length,1);assert.equal(list[0].unavailable,true);
  assert.deepEqual(await reopened.snapshot(),backup.data.appendList);assert.deepEqual(await readBackup(recoveryFile),current);
  assert.deepEqual(JSON.parse(storage.workspaceV1),backup.data.workspace);
});
test('storage failure restores the previous Append list and leaves a usable recovery JSON',async t=>{
  const root=await scratch(t),store=createAppendListStore(path.join(root,'append.json')),backup=fixtureBackup();
  const original=record(path.join(root,'original.spine'));await store.replace([original]);
  const current=createBackup({},await store.snapshot(),'test'),recoveryFile=path.join(root,'recovery.json');
  await assert.rejects(restoreBackup(backup,{appendList:store,current,recoveryFile,applyStorage:async()=>{throw Error('quota exceeded');}}),/Previous Append list restored/);
  assert.deepEqual(await store.snapshot(),[original]);assert.deepEqual(await readBackup(recoveryFile),current);
});
test('failure to save recovery data stops restore before changing storage or Append records',async t=>{
  const root=await scratch(t),store=createAppendListStore(path.join(root,'append.json'));await store.replace([]);
  const blocker=path.join(root,'blocker');await fs.writeFile(blocker,'keep');let touched=false;
  await assert.rejects(restoreBackup(fixtureBackup(),{appendList:store,current:createBackup({},[],'test'),recoveryFile:path.join(blocker,'backup.json'),applyStorage:async()=>{touched=true;}}));
  assert.equal(touched,false);assert.deepEqual(await store.snapshot(),[]);assert.equal(await fs.readFile(blocker,'utf8'),'keep');
});
test('renderer storage application rolls all keys back when a write is rejected',()=>{
  const saved=new Map([['workspaceV1','old'],['hideSkelFiles','false'],['unrelated','keep']]);
  const localStorage={getItem:key=>saved.get(key)??null,removeItem:key=>saved.delete(key),setItem:(key,value)=>{if(value==='too large')throw Error('quota');saved.set(key,value);}};
  const apply=vm.runInNewContext(`(${applyStorage.toString()})`,{localStorage});
  assert.throws(()=>apply({workspaceV1:'new',hideSkelFiles:'too large',spineImportSettings:null}),/quota/);
  assert.deepEqual(Object.fromEntries(saved),{workspaceV1:'old',hideSkelFiles:'false',unrelated:'keep'});
});
