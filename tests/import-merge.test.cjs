const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildMerge,dependencySet,compareVersions,imagePaths,canonicalizeDefaultAttachments,verifySavedAttachmentKeys}=require('../import-merge');
const base=()=>({skeleton:{spine:'4.2.43'},bones:[{name:'root'}],slots:[],skins:[{name:'default',attachments:{}}],animations:{idle:{bones:{root:{rotate:[{value:2}]}}}}});

test('multiple animations share one dependency graph and preserve independent keys and Main animations',()=>{
  const input=source(),main=base();
  delete input.animations.attack.slots.hidden;input.slots[1].color='ffffff00';
  input.skins[0].attachments.body.recover={path:'recovery/head',width:20,height:20};
  input.events.recovery={audio:'recover.wav'};
  input.animations.recover={bones:{target:{translate:[{time:.2,x:12}]}},slots:{body:{attachment:[{time:.1,name:'recover'},{time:.4}]}},events:[{time:.3,name:'recovery'}]};
  const before=structuredClone(input),mainBefore=structuredClone(main);
  for(const createSkins of [true,false]){
    const r=buildMerge(main,input,{animations:['attack','recover'],prefix:'Batch',imageFolder:'Batch',createSkins});
    assert.deepEqual(r.animationNames,['Batch_attack','Batch_recover']);assert.equal(r.stats.animations,2);
    assert.deepEqual(Object.keys(r.data.animations),['idle','Batch_attack','Batch_recover']);assert.deepEqual(r.data.animations.idle,mainBefore.animations.idle);
    assert.equal(r.data.bones.filter(b=>b.name==='Batch').length,1);assert.equal(r.data.bones.some(b=>b.name==='Batch2'),false);
    assert.equal(r.data.bones.filter(b=>b.name==='Batch_body').length,1);assert.equal(r.data.bones.some(b=>b.name==='Batch_unused'),false);
    assert.equal(r.files.filter(f=>f.source==='blink').length,1);assert.equal(r.files.filter(f=>f.source==='recovery/head').length,createSkins?2:1);
    assert.deepEqual(r.data.animations.Batch_attack.bones.Batch_body.rotate,[{value:30}]);
    assert.deepEqual(r.data.animations.Batch_recover.bones.Batch_target.translate,[{time:.2,x:12}]);
    assert.deepEqual(r.data.animations.Batch_recover.events,[{time:.3,name:'Batch_recovery'}]);
    assert.deepEqual(r.audio,[{source:'recover.wav',destination:'Batch_recover.wav'}]);
    assert.equal(r.rows.filter(row=>row.type==='animation').length,2);
    for(const name of r.animationNames)verifySavedAttachmentKeys(r.data,r.data,name,r.group);
  }
  assert.deepEqual(input,before);assert.deepEqual(main,mainBefore);
});

test('batch animation names are editable and empty selections, unknown clips and collisions are rejected',()=>{
  const options={animations:['attack','unused']};
  const r=buildMerge(base(),source(),{...options,overrides:{'animation:attack':'New attack','animation:unused':'New idle'}});
  assert.deepEqual(r.animationNames,['New attack','New idle']);
  assert.throws(()=>buildMerge(base(),source(),{animations:[]}),/at least one/);
  assert.throws(()=>buildMerge(base(),source(),{animations:'attack'}),/one or more/);
  assert.throws(()=>buildMerge(base(),source(),{animations:['attack','absent']}),/Select an animation/);
  assert.throws(()=>buildMerge(base(),source(),{...options,overrides:{'animation:attack':'idle'}}),/unique/);
  assert.throws(()=>buildMerge(base(),source(),{...options,overrides:{'animation:attack':'same','animation:unused':'same'}}),/unique/);
  assert.throws(()=>buildMerge(base(),source(),{...options,overrides:{'animation:unused':'  '}}),/nonempty/);
  assert.throws(()=>buildMerge(base(),source(),{...options,animationName:'one name'}),/mapping rows/);
  const broken=source();broken.animations.unused.unknown={};assert.throws(()=>buildMerge(base(),broken,options),/Unsupported animation timeline/);
});
function source(){return {skeleton:{spine:'4.2.43'},bones:[{name:'root'},{name:'body',parent:'root'},{name:'target',parent:'root'},{name:'unused',parent:'root'}],slots:[{name:'body',bone:'body',attachment:'head'},{name:'hidden',bone:'unused',attachment:'unused'}],skins:[{name:'default',attachments:{body:{head:{width:20,height:20},blink:{width:20,height:20}},hidden:{unused:{}}}},{name:'red',attachments:{body:{head:{path:'red/head',width:20,height:20},blink:{path:'red/blink',width:20,height:20}}}}],ik:[{name:'aim',bones:['body'],target:'target'}],events:{hit:{int:1},unused:{}},animations:{attack:{bones:{body:{rotate:[{value:30}]}},slots:{body:{attachment:[{name:'blink',time:0.5}]},hidden:{attachment:[{name:null}]}},events:[{name:'hit',time:.2}]},unused:{bones:{unused:{rotate:[{value:4}]}}}}};}
test('copies only required dependencies, adds offset parent, and leaves Main keys intact',()=>{
  const main=base(),input=source(),snapshot=structuredClone(main),r=buildMerge(main,input,{animation:'attack'});
  assert.deepEqual(main,snapshot);assert.deepEqual(r.data.animations.idle,main.animations.idle);
  assert.deepEqual(r.data.bones.find(b=>b.name==='ImportedMain'),{name:'ImportedMain',parent:'root',x:1000});
  assert.ok(r.data.bones.some(b=>b.name==='ImportedMain_target'));
  assert.ok(!r.files.some(f=>f.source==='unused'));assert.equal(r.files.length,4);
  assert.equal(Object.keys(r.data.animations).length,2);
  assert.deepEqual(Object.keys(r.data.animations[r.animationName].bones),['ImportedMain_body']);
  assert.deepEqual(r.skinNames,['ImportedMain_default','ImportedMain_red']);
  assert.deepEqual(Object.keys(r.data.events),['ImportedMain_hit']);
  assert.equal(r.data.ik[0].target,'ImportedMain_target');
  for(const s of r.data.skins)for(const as of Object.values(s.attachments))for(const a of Object.values(as))if(a.path)assert.equal(a.name,a.path);
});
test('find replace, explicit overrides, repeated numbering, and collisions',()=>{
  const a=buildMerge(base(),source(),{animation:'attack',rename:{find:'body',replace:'torso'}});
  assert.ok(a.data.bones.some(b=>b.name==='ImportedMain_torso'));
  const b=buildMerge(a.data,source(),{animation:'attack'});assert.equal(b.group,'ImportedMain2');
  assert.throws(()=>buildMerge(base(),source(),{animation:'attack',overrides:{'bone:body':'root'}}),/already exists/);
  assert.throws(()=>buildMerge(base(),source(),{animation:'attack',animationName:'idle'}),/unique/);
  assert.throws(()=>buildMerge(base(),source(),{animation:'attack',overrides:{'bone:body':'bad/name'}}),/Invalid/);
});
test('a custom prefix names every imported item and numbers repeat groups',()=>{
  const a=buildMerge(base(),source(),{animation:'attack',prefix:'Impact'});
  assert.equal(a.group,'Impact');assert.ok(a.rows.every(row=>row.result.startsWith('Impact_')));
  assert.ok(a.skinNames.every(n=>n.startsWith('Impact_')));assert.equal(buildMerge(a.data,source(),{animation:'attack',prefix:'Impact'}).group,'Impact2');
  assert.throws(()=>buildMerge(base(),source(),{animation:'attack',prefix:''}),/prefix/);
  assert.throws(()=>buildMerge(base(),source(),{animation:'attack',prefix:'bad/name'}),/prefix/);
});
test('a custom image subfolder changes paths while display names match physical basenames',()=>{
  const r=buildMerge(base(),source(),{animation:'attack',useImageFolder:true,imageFolder:'Effects/Impact'});
  assert.equal(r.imageFolder,'Effects/Impact');assert.ok(r.files.every(f=>f.destination.startsWith('Effects/Impact/')));
  for(const skin of r.data.skins)for(const values of Object.values(skin.attachments))for(const a of Object.values(values))if(a.path)assert.equal(a.path,'Effects/Impact/'+a.name);
  for(const folder of ['../escape','a/../b','/absolute','C:/absolute','a//b','bad:name','NUL',''])assert.throws(()=>buildMerge(base(),source(),{animation:'attack',useImageFolder:true,imageFolder:folder}));
  assert.equal(buildMerge(base(),source(),{animation:'attack',useImageFolder:false,imageFolder:'Ignored'}).imageFolder,'');
});
test('disabling new skins bakes the selected source skin into Main default attachments',()=>{
  const main=base();main.skins.push({name:'MainSkin',attachments:{}});
  const r=buildMerge(main,source(),{animation:'attack',createSkins:false,sourceSkin:'red'});
  assert.deepEqual(r.data.skins.map(s=>s.name),['default','MainSkin']);assert.equal(r.stats.skins,0);assert.deepEqual(r.skinNames,[]);
  assert.ok(r.files.every(f=>f.source.startsWith('red/')));assert.equal(r.sourceSkin,'red');
  assert.ok(Object.keys(r.data.skins[0].attachments).some(n=>n.startsWith('ImportedMain_')));
  assert.throws(()=>buildMerge(main,source(),{animation:'attack',createSkins:false,sourceSkin:'missing'}),/skin not found/);
});
test('default-skin keys use actual names that survive the Spine editor import',()=>{
  for(const createSkins of [false,true]){
    const r=buildMerge(base(),source(),{animation:'attack',createSkins,prefix:'FxFluxExplosion',imageFolder:'FxFlux'});
    const def=r.data.skins.find(s=>s.name==='default');
    for(const values of Object.values(def.attachments))for(const [key,a]of Object.entries(values))assert.equal(key,a.name||key);
    const frame=r.data.animations[r.animationName].slots.FxFluxExplosion_body.attachment[0];
    assert.ok(r.data.skins.some(s=>s.attachments.FxFluxExplosion_body?.[frame.name]));
    verifySavedAttachmentKeys(r.data,structuredClone(r.data),r.animationName,r.group);
    const broken=structuredClone(r.data);delete broken.animations[r.animationName].slots.FxFluxExplosion_body.attachment[0].name;
    assert.throws(()=>verifySavedAttachmentKeys(r.data,broken,r.animationName,r.group),/Saved attachment key changed/);
  }
});
test('canonical attachment renaming updates setup, linked parents, skins and deform keys',()=>{
  const input={skins:[{name:'default',attachments:{slot:{logical:{name:'physical',type:'mesh'},linked:{name:'linkedPhysical',parent:'logical',type:'linkedmesh'}}}},{name:'red',attachments:{slot:{logical:{name:'redPhysical'}}}}],slots:[{name:'slot',attachment:'logical'}],animations:{test:{slots:{slot:{attachment:[{name:'logical'},{time:1}]}},attachments:{default:{slot:{logical:{deform:[{}]}}}}}}};
  const output=canonicalizeDefaultAttachments(input);
  assert.equal(output.slots[0].attachment,'physical');assert.equal(output.animations.test.slots.slot.attachment[0].name,'physical');
  assert.equal(output.skins[0].attachments.slot.linkedPhysical.parent,'physical');assert.ok(output.skins[1].attachments.slot.physical);
  assert.ok(output.animations.test.attachments.default.slot.physical);assert.equal(input.slots[0].attachment,'logical');
});
test('baked skins retain linked default-mesh dependencies and their deformation keys',()=>{
  const s=source();s.skins[0].attachments.body.head={type:'mesh',uvs:[0,0],vertices:[0,0],triangles:[]};
  s.skins[1].attachments.body.head={type:'linkedmesh',parent:'head',skin:'default',path:'red/head'};
  s.animations.attack.deform={default:{body:{head:[{vertices:[1,2]}]}}};
  const r=buildMerge(base(),s,{animation:'attack',createSkins:false,sourceSkin:'red'}),values=r.data.skins[0].attachments.ImportedMain_body;
  const linked=Object.values(values).find(a=>a.type==='linkedmesh');assert.ok(values[linked.parent]);assert.equal(linked.skin,'default');
  assert.ok(r.data.animations[r.animationName].deform.default.ImportedMain_body[linked.parent]);
  assert.ok(r.files.some(f=>f.source==='head'));assert.ok(r.files.some(f=>f.source==='red/head'));
});
test('the runtime renders baked named-skin linked meshes with their inherited deformation',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),context={console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../node_modules/spine-player-42/dist/iife/spine-player.js'),'utf8'),context);
  const runtime=context.spine,loader={newRegionAttachment:(_s,n)=>new runtime.RegionAttachment(n),newMeshAttachment:(_s,n)=>new runtime.MeshAttachment(n)};
  const input=source();input.skins[0].attachments.body.head={type:'mesh',uvs:[0,0,1,0,0,1],vertices:[0,0,10,0,0,10],triangles:[0,1,2]};
  input.bones[1].skin=true;input.skins[1].bones=['body'];
  input.skins[1].attachments.body.head={type:'linkedmesh',parent:'head',skin:'default',path:'red/head'};
  input.animations.attack.attachments={default:{body:{head:{deform:[{vertices:[2,1,2,1,2,1]},{time:.4,vertices:[4,2,4,2,4,2]}]}}}};
  const main=base();main.skins.push({name:'Existing',attachments:{}});
  const merged=buildMerge(main,input,{animation:'attack',createSkins:false,sourceSkin:'red',imageFolder:'Effects/Impact'});
  const skeletons=[input,merged.data].map(json=>new runtime.Skeleton(new runtime.SkeletonJson(loader).readSkeletonData(json)));
  skeletons[0].setSkinByName('red');skeletons[0].setSlotsToSetupPose();skeletons[1].setSkinByName('Existing');skeletons[1].setSlotsToSetupPose();skeletons[1].findBone('ImportedMain').x=0;
  skeletons.forEach((s,i)=>{const state=new runtime.AnimationState(new runtime.AnimationStateData(s.data));state.setAnimation(0,i?merged.animationName:'attack',false);state.update(.2);state.apply(s);s.updateWorldTransform(runtime.Physics.update);});
  const slots=[skeletons[0].findSlot('body'),skeletons[1].findSlot('ImportedMain_body')],vertices=slots.map(slot=>{const out=[];slot.attachment.computeWorldVertices(slot,0,slot.attachment.worldVerticesLength,out,0,2);return out;});
  assert.ok(slots[0].deform.length>0);assert.equal(slots[1].deform.length,slots[0].deform.length);assert.equal(vertices[0].length,vertices[1].length);vertices[0].forEach((value,i)=>assert.ok(Math.abs(value-vertices[1][i])<.00001));
});
test('baked skins keep skin-required bones and constraints active in Main default',()=>{
  const s=source();s.bones[1].skin=true;s.ik[0].skin=true;s.skins[1].bones=['body'];s.skins[1].ik=['aim'];
  const r=buildMerge(base(),s,{animation:'attack',createSkins:false,sourceSkin:'red'});
  assert.notEqual(r.data.bones.find(b=>b.name==='ImportedMain_body').skin,true);assert.notEqual(r.data.ik.find(c=>c.name==='ImportedMain_aim').skin,true);
});
test('weighted meshes retain unkeyed influence bones and remap original indices',()=>{
  const s=source();s.skins[0].attachments.body.head={type:'mesh',uvs:[0,0],vertices:[1,2,2,3,1],triangles:[]};
  const r=buildMerge(base(),s,{animation:'attack'}),slot=r.data.slots.find(s=>s.name==='ImportedMain_body'),mesh=r.data.skins.find(s=>s.name===r.previewSkin).attachments.ImportedMain_body[slot.attachment];
  const i=r.data.bones.findIndex(b=>b.name==='ImportedMain_target');assert.equal(mesh.vertices[1],i);
});
test('linked mesh and deform skin references stay consistent',()=>{
  const s=source();s.skins[0].attachments.body.head={type:'linkedmesh',parent:'parent',skin:'default'};s.skins[0].attachments.body.parent={type:'mesh',uvs:[0,0],vertices:[0,0],triangles:[]};
  s.animations.attack.deform={default:{body:{parent:[{vertices:[1,2]}]}}};
  const r=buildMerge(base(),s,{animation:'attack'}),skin=r.data.skins.find(s=>s.name==='ImportedMain_default');
  const linked=Object.values(skin.attachments.ImportedMain_body).find(a=>a.type==='linkedmesh');
  assert.ok(skin.attachments.ImportedMain_body[linked.parent]);
  assert.equal(linked.skin,'ImportedMain_default');
  assert.ok(r.data.animations[r.animationName].deform.ImportedMain_default.ImportedMain_body[linked.parent]);
});
test('pruned slots keep draw order permutations valid after merging',()=>{
  const s=source();s.slots.push({name:'front',bone:'body',attachment:'front'});s.skins[0].attachments.front={front:{}};
  s.animations.attack.drawOrder=[{time:.5,offsets:[{slot:'body',offset:2},{slot:'front',offset:-2}]}];
  const r=buildMerge(base(),s,{animation:'attack'}),keys=r.data.animations[r.animationName].drawOrder[0].offsets;
  assert.ok(keys.every(k=>r.data.slots.some(s=>s.name===k.slot)));assert.ok(keys.every(k=>Number.isInteger(k.offset)));
});
test('version comparisons are numeric and merges cannot relabel old JSON',()=>{
  assert.ok(compareVersions('3.10.1','3.8.99')>0);assert.ok(compareVersions('3.8','4.2')<0);
  assert.ok(compareVersions('4.2.43','4.2.120')<0);
  const s=source();s.skeleton.spine='3.8';assert.throws(()=>buildMerge(base(),s,{animation:'attack'}),/Convert both/);
});
test('unkeyed invisible artwork is excluded while animated attachments remain addressable',()=>{
  const s=source();s.slots.push({name:'unusedArt',bone:'unused',attachment:'unused',color:'ffffff00'});s.skins[0].attachments.unusedArt={unused:{}};
  const r=buildMerge(base(),s,{animation:'attack'});assert.ok(!r.files.some(f=>f.source==='unused'));
});
test('audio events are renamed consistently with copied audio resources',()=>{
  const s=source();s.events.hit.audio='fx/hit.wav';const r=buildMerge(base(),s,{animation:'attack'});
  assert.equal(r.data.events.ImportedMain_hit.audio,r.audio[0].destination);assert.equal(r.audio[0].source,'fx/hit.wav');
});
test('global source physics keys are scoped to imported constraints',()=>{
  const s=source();s.physics=[{name:'cloth',bone:'body',windGlobal:true}];s.animations.attack.physics={'':{wind:[{value:3}],reset:[{time:.3}]}};
  const main=base();main.physics=[{name:'MainPhysics',bone:'root',windGlobal:true}];
  const r=buildMerge(main,s,{animation:'attack'}),timelines=r.data.animations[r.animationName].physics;
  assert.deepEqual(Object.keys(timelines),['ImportedMain_cloth']);assert.ok(!timelines.MainPhysics);assert.ok(!timelines['']);
});
test('image sequence frame filenames preserve numbering and padding',()=>{
  assert.deepEqual(imagePaths('head',{sequence:{count:3,start:0,digits:2}}),['head00','head01','head02']);
});
test('broken references and unknown timelines fail explicitly',()=>{
  const s=source();s.animations.attack.bones.absent={};assert.throws(()=>dependencySet(s,'attack'),/Missing bone/);
  const x=source();x.animations.attack.mystery={};assert.throws(()=>buildMerge(base(),x,{animation:'attack'}),/Unsupported/);
});
test('the real Spine runtime preserves imported bone motion and weighted mesh geometry',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),context={console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../node_modules/spine-player-42/dist/iife/spine-player.js'),'utf8'),context);
  const s=context.spine,loader={newRegionAttachment:(_skin,n)=>new s.RegionAttachment(n),newMeshAttachment:(_skin,n)=>new s.MeshAttachment(n),newBoundingBoxAttachment:(_skin,n)=>new s.BoundingBoxAttachment(n),newPathAttachment:(_skin,n)=>new s.PathAttachment(n),newPointAttachment:(_skin,n)=>new s.PointAttachment(n),newClippingAttachment:(_skin,n)=>new s.ClippingAttachment(n)};
  const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/4.2/spineboy-pro.json'))),merged=buildMerge(base(),input,{animation:'walk'});
  const originalData=new s.SkeletonJson(loader).readSkeletonData(input),mergedData=new s.SkeletonJson(loader).readSkeletonData(merged.data);
  const original=new s.Skeleton(originalData),result=new s.Skeleton(mergedData),states=[new s.AnimationState(new s.AnimationStateData(originalData)),new s.AnimationState(new s.AnimationStateData(mergedData))];
  // Compare motion at the same origin. The 1000-unit group offset is checked
  // separately; rounded source weights need not sum to exactly one.
  result.findBone('ImportedMain').x=0;
  original.setSkin(originalData.defaultSkin);result.setSkinByName(merged.previewSkin);result.setSlotsToSetupPose();states[0].setAnimation(0,'walk',true);states[1].setAnimation(0,merged.animationName,true);
  let verticesChecked=0;
  for(let frame=0;frame<30;frame++){
    for(const [i,skeleton]of [original,result].entries()){states[i].update(1/60);states[i].apply(skeleton);skeleton.update(1/60);skeleton.updateWorldTransform(s.Physics.update);}
    for(const row of merged.rows.filter(r=>r.type==='bone')){const a=original.findBone(row.original),b=result.findBone(row.result);assert.ok(Math.abs(a.worldX-b.worldX)<.001);assert.ok(Math.abs(a.worldY-b.worldY)<.001);}
    for(const slot of original.slots){const attachment=slot.attachment;if(!attachment?.worldVerticesLength)continue;const other=result.findSlot('ImportedMain_'+slot.data.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_'));if(!other?.attachment?.worldVerticesLength)continue;const a=[],b=[];attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,a,0,2);other.attachment.computeWorldVertices(other,0,other.attachment.worldVerticesLength,b,0,2);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<.002,JSON.stringify({frame,slot:slot.data.name,i,a:a[i],b:b[i],sourceDeform:slot.deform.length,resultDeform:other.deform.length}));verticesChecked+=a.length;}
  }
  assert.ok(verticesChecked>100);
});
