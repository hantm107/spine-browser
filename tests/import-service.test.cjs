const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {resource,imageFile,normalizeExport,publishToMainFolder,freshImageSubfolder}=require('../import-service');
test('image paths cannot escape the project or use an absolute path',()=>{
  const base=path.resolve('images');
  for(const name of ['../outside.png','/outside.png','C:\\outside.png','a/../../outside.png'])assert.throws(()=>resource(base,name),/Invalid|escapes/);
  assert.equal(resource(base,'a/b.png'),path.join(base,'a','b.png'));
});
test('missing images fail and real image bytes resolve from nested folders',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-import-service-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','head.PNG'),'pixels');
  assert.equal(await imageFile(root,'nested/head'),path.join(root,'nested','head.PNG'));
  await assert.rejects(imageFile(root,'missing'),/Missing image/);
});
test('legacy bounding box recovery changes only a working copy',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-import-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'source.json'),output=path.join(root,'working.json');
  const data={skeleton:{spine:'3.8'},bones:[{name:'root'}],skins:[{name:'default',attachments:{slot:{hitbox:{type:'boundingbox',vertices:[0,0,2,0,2,2,0,2]}}}}]};
  const original=JSON.stringify(data);await fs.writeFile(file,original);
  const normalized=await normalizeExport(file,output,path.join(root,'images'));
  assert.equal(normalized.data.skeleton.spine,'3.8');assert.equal(normalized.data.skins[0].attachments.slot.hitbox.vertexCount,4);
  assert.equal(await fs.readFile(file,'utf8'),original);assert.equal(normalized.repairs.length,1);
});
async function appendFixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-append-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const main=path.join(root,'main');await fs.mkdir(path.join(main,'images'),{recursive:true});
  const project=path.join(main,'Main.spine'),staged=path.join(root,'verified.spine'),asset=path.join(root,'new.png');
  await fs.writeFile(project,'original project');await fs.writeFile(staged,'verified merged project');await fs.writeFile(asset,'new pixels');await fs.writeFile(path.join(main,'images','existing.png'),'original pixels');
  return {root,main,project,staged,asset};
}
test('append output writes a new project beside Main and only adds imported images',async t=>{
  const f=await appendFixture(t);
  const result=await publishToMainFolder({mainFolder:f.main,mainProject:f.project,group:'Fx',projectFile:f.staged,files:[{from:f.asset,to:'images/Effects/new.png'}],manifest:{animation:'boom'}});
  assert.equal(result.project,path.join(f.main,'Main-Fx.spine'));assert.equal(await fs.readFile(f.project,'utf8'),'original project');
  assert.equal(await fs.readFile(path.join(f.main,'images','existing.png'),'utf8'),'original pixels');assert.equal(await fs.readFile(path.join(f.main,'images','Effects','new.png'),'utf8'),'new pixels');
  assert.equal(JSON.parse(await fs.readFile(result.report,'utf8')).outputMode,'mainFolder');
});
test('append output refuses existing assets before copying any new files',async t=>{
  const f=await appendFixture(t);
  await assert.rejects(publishToMainFolder({mainFolder:f.main,mainProject:f.project,group:'Fx',projectFile:f.staged,files:[{from:f.asset,to:'images/brand-new.png'},{from:f.asset,to:'images/existing.png'}],manifest:{}}),/already exists/);
  await assert.rejects(fs.access(path.join(f.main,'images','brand-new.png')));assert.equal(await fs.readFile(path.join(f.main,'images','existing.png'),'utf8'),'original pixels');
});
test('append output numbers existing project names and rolls back its own additions on failure',async t=>{
  const f=await appendFixture(t);await fs.writeFile(path.join(f.main,'Main-Fx.spine'),'earlier output');
  const result=await publishToMainFolder({mainFolder:f.main,mainProject:f.project,group:'Fx',projectFile:f.staged,files:[],manifest:{}});
  assert.equal(result.project,path.join(f.main,'Main-Fx-2.spine'));assert.equal(await fs.readFile(path.join(f.main,'Main-Fx.spine'),'utf8'),'earlier output');
  await assert.rejects(publishToMainFolder({mainFolder:f.main,mainProject:f.project,group:'Bad',projectFile:path.join(f.root,'absent.spine'),files:[{from:f.asset,to:'images/Added/new.png'}],manifest:{}}));
  await assert.rejects(fs.access(path.join(f.main,'images','Added','new.png')));assert.equal(await fs.readFile(f.project,'utf8'),'original project');
});
test('each import selects a fresh, validated images subfolder',async t=>{
  const f=await appendFixture(t),images=path.join(f.main,'images');await fs.mkdir(path.join(images,'Fx'));await fs.mkdir(path.join(images,'Fx-2'));
  assert.equal(await freshImageSubfolder(images,'Fx'),'Fx-3');
  await fs.mkdir(path.join(images,'Effects'));await fs.mkdir(path.join(images,'Effects','Blast'));
  assert.equal(await freshImageSubfolder(images,'Effects/Blast'),'Effects/Blast-2');
  await assert.rejects(freshImageSubfolder(images,''));await assert.rejects(freshImageSubfolder(images,'../outside'));
});
test('a subfolder created after review cannot receive appended assets',async t=>{
  const f=await appendFixture(t);await fs.mkdir(path.join(f.main,'images','Fx'));
  await assert.rejects(publishToMainFolder({mainFolder:f.main,mainProject:f.project,group:'Fx',projectFile:f.staged,files:[{from:f.asset,to:'images/Fx/new.png'}],manifest:{},imageSubfolder:'Fx'}),/subfolder now exists/);
  await assert.rejects(fs.access(path.join(f.main,'images','Fx','new.png')));assert.equal(await fs.readFile(f.project,'utf8'),'original project');
});
