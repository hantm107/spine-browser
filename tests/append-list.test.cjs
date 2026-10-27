const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createAppendListStore}=require('../append-list-store');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-append-list-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const sources=[];
 for(const name of ['a','b']){const dir=path.join(root,name);await fs.mkdir(path.join(dir,'images'),{recursive:true});const file=path.join(dir,'effect.spine');await fs.writeFile(file,'native test project');sources.push(file);}
 return {root,sources,file:path.join(root,'settings','append-list.json')};
}
test('Append list persists absolute sources and deduplicates repeated additions',async t=>{
 const f=await fixture(t),store=createAppendListStore(f.file);
 assert.deepEqual(await store.list(),[]);await store.set(f.sources[0],true);await store.set(f.sources[0],true);
 const list=await createAppendListStore(f.file).list();assert.equal(list.length,1);assert.equal(list[0].fullPath,await fs.realpath(f.sources[0]));assert.equal(list[0].imagesAvailable,true);assert.equal(list[0].unavailable,false);
});
test('concurrent Append list updates retain sources with the same filename in different folders',async t=>{
 const f=await fixture(t),store=createAppendListStore(f.file);await Promise.all(f.sources.map(file=>store.set(file,true)));
 assert.equal((await store.list()).length,2);assert.equal((await store.find(f.sources[1])).folder,path.dirname(f.sources[1]));
});
test('missing sources stay listed and can be removed without changing source files',async t=>{
 const f=await fixture(t),store=createAppendListStore(f.file);await store.set(f.sources[0],true);await fs.unlink(f.sources[0]);
 assert.equal((await store.list())[0].unavailable,true);await store.set(f.sources[0],false);assert.deepEqual(await store.list(),[]);
 await store.set(f.sources[1],true);await store.set(f.sources[1],false);assert.equal(await fs.readFile(f.sources[1],'utf8'),'native test project');
});
test('JSON sources must contain skeleton data and images availability refreshes',async t=>{
 const f=await fixture(t),store=createAppendListStore(f.file),file=path.join(f.root,'export.json');
 await fs.writeFile(file,JSON.stringify({settings:true}));await assert.rejects(store.set(file,true),/skeleton/);
 await fs.writeFile(file,JSON.stringify({bones:[{name:'root'}]}));await store.set(file,true);assert.equal((await store.list())[0].imagesAvailable,false);
 await fs.mkdir(path.join(f.root,'images'));assert.equal((await store.list())[0].imagesAvailable,true);
});
test('invalid saved Append list data is reported and preserved',async t=>{
 const f=await fixture(t);await fs.mkdir(path.dirname(f.file),{recursive:true});await fs.writeFile(f.file,'broken JSON');
 await assert.rejects(createAppendListStore(f.file).set(f.sources[0],true),/read the Append list/);assert.equal(await fs.readFile(f.file,'utf8'),'broken JSON');
});
