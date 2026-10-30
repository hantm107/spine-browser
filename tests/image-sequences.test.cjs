const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildMerge,imagePaths,verifySavedAttachmentKeys}=require('../import-merge');
const sequences=require('../image-sequences');
const main=()=>({skeleton:{spine:'4.2.43'},bones:[{name:'root'}],slots:[],skins:[{name:'default',attachments:{}}],animations:{idle:{}}});
function source(){return {skeleton:{spine:'4.2.43'},bones:[{name:'root'}],slots:[{name:'art',bone:'root',attachment:'frame2'}],skins:[{name:'default',attachments:{art:Object.fromEntries([10,2,8,4].map(n=>['frame'+n,{path:'fx/bolt_'+String(n).padStart(3,'0'),width:20,height:20}]))}}],animations:{flash:{slots:{art:{attachment:[{name:'frame10'},{time:.1,name:'frame2'},{time:.2,name:'frame8'},{time:.3,name:'frame4'},{time:.4}]}}}}};}
const options={animation:'flash',prefix:'Fx',imageFolder:'Effects/Fx',createSkins:false};
const rule={prefix:'Thunder_',suffix:'_hit',start:1,padding:3};

test('batch clips share renamed images and every attachment timeline follows the same names',()=>{
  const input=source();input.animations.reverse=structuredClone(input.animations.flash);
  input.animations.reverse.slots.art.attachment.reverse();
  const r=buildMerge(main(),input,{...options,animation:undefined,animations:['flash','reverse'],replaceSequenceNames:true});
  assert.equal(r.files.length,4);assert.equal(r.sequenceGroups.length,1);
  const forward=r.data.animations.Fx_flash.slots.Fx_art.attachment,backward=r.data.animations.Fx_reverse.slots.Fx_art.attachment;
  assert.deepEqual(backward.map(k=>k.name),forward.map(k=>k.name).reverse());
  for(const name of r.animationNames)verifySavedAttachmentKeys(r.data,r.data,name,r.group);
});
test('detects numeric groups with gaps, stable ordering, and separate folder/skin boundaries',()=>{
  const files=['a/bolt_10','a/bolt_2','a/bolt_8','a/bolt_4','b/bolt_2','b/bolt_4'].map((source,i)=>({source,destination:'old'+i,attachment:'a'+i,skin:'default'}));
  files.push({source:'a/bolt_4',destination:'variant4',attachment:'red4',skin:'red'},{source:'a/bolt_8',destination:'variant8',attachment:'red8',skin:'red'});
  const groups=sequences.detect(files,[],'Fx');assert.equal(groups.length,3);
  const g=groups.find(g=>g.folder==='a/'&&g.skin==='default');assert.deepEqual(g.frames.map(f=>f.number),['2','4','8','10']);assert.equal(g.hasGaps,true);assert.deepEqual(sequences.names(g,{...rule,padding:0}).files,['Thunder_1_hit','Thunder_2_hit','Thunder_3_hit','Thunder_4_hit']);
});
test('sequence renaming updates copied images, default attachment keys and setup without retiming',()=>{
  const input=source(),snapshot=structuredClone(input),before=buildMerge(main(),input,options),group=before.sequenceGroups[0];
  const merged=buildMerge(main(),input,{...options,sequenceRenames:{[group.id]:rule}}),animation=merged.data.animations.Fx_flash;
  assert.deepEqual(input,snapshot);assert.deepEqual(merged.sequenceGroups[0].frames.map(f=>f.number),['002','004','008','010']);
  assert.equal(merged.files.find(f=>f.source.endsWith('010')).destination,'Effects/Fx/Thunder_004_hit');
  assert.deepEqual(animation.slots.Fx_art.attachment.map(k=>k.name??null),['Thunder_004_hit','Thunder_001_hit','Thunder_003_hit','Thunder_002_hit',null]);
  assert.deepEqual(animation.slots.Fx_art.attachment.map(k=>k.time),[undefined,.1,.2,.3,.4]);assert.equal(merged.data.slots[0].attachment,'Thunder_001_hit');
  for(const [key,a]of Object.entries(merged.data.skins[0].attachments.Fx_art)){assert.equal(key,a.name);assert.equal(a.path,'Effects/Fx/'+a.name);}
  assert.ok(merged.rows.filter(r=>r.type==='attachment').every(r=>r.sequenceGroup===group.id));verifySavedAttachmentKeys(merged.data,structuredClone(merged.data),'Fx_flash','Fx');
});
test('automatic replacement drops all original text and import prefixes; opting out persists',()=>{
  const initial=buildMerge(main(),source(),{...options,replaceSequenceNames:true}),group=initial.sequenceGroups[0];
  assert.deepEqual(group.frames.map(f=>f.destination),['Effects/Fx/Sequence1_001','Effects/Fx/Sequence1_002','Effects/Fx/Sequence1_003','Effects/Fx/Sequence1_004']);
  assert.deepEqual(initial.sequenceRenames[group.id],{prefix:'Sequence1_',suffix:'',start:1,padding:3});
  const custom=buildMerge(main(),source(),{...options,replaceSequenceNames:true,sequenceRenames:{[group.id]:{prefix:'Lightning_',suffix:'',start:1,padding:3}}});
  assert.ok(custom.files.every(f=>/^Effects\/Fx\/Lightning_\d{3}$/.test(f.destination)));assert.ok(custom.rows.filter(r=>r.sequenceGroup).every(r=>/^Lightning_\d{3}$/.test(r.result)));
  const off=buildMerge(main(),source(),{...options,replaceSequenceNames:true,sequenceRenames:{[group.id]:null}});assert.equal(off.sequenceRenames[group.id],null);assert.ok(!off.sequenceGroups[0].applied);
});
test('automatic replacement finds a free short name when Main already has a numbered group',()=>{
  const occupied=main();occupied.slots=[{name:'old',bone:'root',attachment:'Sequence1_001'}];occupied.skins[0].attachments.old={Sequence1_001:{width:16,height:16}};
  const result=buildMerge(occupied,source(),{...options,replaceSequenceNames:true});assert.ok(result.files.every(f=>f.destination.startsWith('Effects/Fx/Sequence2_')));
});
test('selected group renaming overrides Find/Replace while named skin placeholders remain consistent',()=>{
  const first=buildMerge(main(),source(),{...options,createSkins:true}),group=first.sequenceGroups[0];
  const result=buildMerge(main(),source(),{...options,createSkins:true,rename:{find:'frame',replace:'Other'},sequenceRenames:{[group.id]:rule}});
  const skin=result.data.skins.find(s=>s.name===result.previewSkin),keys=result.data.animations.Fx_flash.slots.Fx_art.attachment;
  for(const frame of keys.filter(f=>f.name))assert.ok(skin.attachments.Fx_art[frame.name]);
  assert.ok(Object.values(skin.attachments.Fx_art).every(a=>a.name.startsWith('Thunder_')));
});
test('native Spine sequences retain indices and timing while changing base, start and padding',()=>{
  const input=source();input.slots[0].attachment='blast';input.skins[0].attachments.art={blast:{path:'fx/blast_',width:20,height:20,sequence:{count:3,start:7,digits:2,setup:1}}};
  input.animations.flash={attachments:{default:{art:{blast:{sequence:[{time:.2,mode:'loop',index:1,delay:.1},{time:.5,mode:'hold',index:2}]}}}}};
  const initial=buildMerge(main(),input,options),g=initial.sequenceGroups[0],r=buildMerge(main(),input,{...options,sequenceRenames:{[g.id]:{prefix:'Thunder',suffix:'_hit',start:1,padding:3}}});
  const a=r.data.skins[0].attachments.Fx_art.Thunder_hit;assert.ok(g.native);assert.deepEqual(a.sequence,{count:3,start:1,digits:3,setup:1});
  assert.deepEqual(imagePaths('Thunder_hit',a),['Effects/Fx/Thunder_hit001','Effects/Fx/Thunder_hit002','Effects/Fx/Thunder_hit003']);
  assert.deepEqual(r.data.animations.Fx_flash.attachments.default.Fx_art.Thunder_hit.sequence,input.animations.flash.attachments.default.art.blast.sequence);
  assert.deepEqual(r.files.map(f=>f.source),['fx/blast_07','fx/blast_08','fx/blast_09']);
});
test('renaming mesh frame images rewrites deformation references and linked parent names',()=>{
  const input=source();input.skins[0].attachments.art.frame2={type:'mesh',path:'fx/bolt_002',uvs:[0,0],vertices:[0,0],triangles:[]};
  input.skins[0].attachments.art.frame4={type:'linkedmesh',path:'fx/bolt_004',parent:'frame2',skin:'default'};
  input.animations.flash.attachments={default:{art:{frame2:{deform:[{time:.2,vertices:[1,2]}]}}}};
  const first=buildMerge(main(),input,options),r=buildMerge(main(),input,{...options,sequenceRenames:{[first.sequenceGroups[0].id]:rule}});
  assert.equal(r.data.skins[0].attachments.Fx_art.Thunder_002_hit.parent,'Thunder_001_hit');
  assert.deepEqual(r.data.animations.Fx_flash.attachments.default.Fx_art.Thunder_001_hit.deform,[{time:.2,vertices:[1,2]}]);
});
test('duplicate numbers are flagged; stale groups, invalid names, and collisions fail before saving',()=>{
  const files=['fx/a_2','fx/a_02'].map((source,i)=>({source,destination:'old'+i,attachment:'a'+i,skin:'default'})),g=sequences.detect(files,[],'Fx')[0];assert.equal(g.canRename,false);assert.throws(()=>sequences.names(g,rule),/same frame number/);
  const first=buildMerge(main(),source(),options),id=first.sequenceGroups[0].id;
  for(const bad of [{prefix:'../bad'},{suffix:'/'},{start:-1},{start:1.2},{padding:13},{start:''}])assert.throws(()=>buildMerge(main(),source(),{...options,sequenceRenames:{[id]:{...rule,...bad}}}));
  assert.throws(()=>buildMerge(main(),source(),{...options,sequenceRenames:{missing:rule}}),/groups changed/);
  const occupied=main();occupied.slots=[{name:'existing',bone:'root',attachment:'Thunder_001_hit'}];occupied.skins[0].attachments.existing={Thunder_001_hit:{width:10,height:10}};
  assert.throws(()=>buildMerge(occupied,source(),{...options,sequenceRenames:{[id]:rule}}),/collision/);
});
test('shared frames across slots stay editable, copy once, and retain independent animation references',()=>{
  const input=source();input.slots.push({name:'second',bone:'root',attachment:'frame2',color:'ffffff80'});
  input.skins[0].attachments.second=structuredClone(input.skins[0].attachments.art);
  input.animations.flash.slots.second={attachment:[{time:.05,name:'frame8'},{time:.15,name:'frame2'},{time:.25}]};
  const result=buildMerge(main(),input,{...options,replaceSequenceNames:true}),group=result.sequenceGroups[0];
  assert.equal(group.frames.length,4);assert.equal(group.useCount,6);assert.equal(group.slotCount,2);assert.equal(group.canRename,true);assert.equal(result.files.length,4);assert.equal(result.stats.images,4);
  const renamed=buildMerge(main(),input,{...options,replaceSequenceNames:true,sequenceRenames:{[group.id]:rule}});
  for(const slot of ['Fx_art','Fx_second'])assert.equal(renamed.data.skins[0].attachments[slot].Thunder_001_hit.path,'Effects/Fx/Thunder_001_hit');
  assert.deepEqual(renamed.data.animations.Fx_flash.slots.Fx_second.attachment,[{time:.05,name:'Thunder_003_hit'},{time:.15,name:'Thunder_001_hit'},{time:.25}]);assert.equal(renamed.data.slots.find(s=>s.name==='Fx_second').color,'ffffff80');
  for(const frame of renamed.sequenceGroups[0].frames)assert.equal(renamed.files[frame.fileIndex].source,frame.source);
  verifySavedAttachmentKeys(renamed.data,structuredClone(renamed.data),'Fx_flash','Fx');
});
test('72 references to 12 images form one editable group rather than duplicate frame numbers',()=>{
  const files=Array.from({length:6},(_,slot)=>Array.from({length:12},(_,frame)=>({skin:'default',slot:'slot'+slot,attachment:`use${slot}_${frame}`,source:'image/shandian/shandian_'+String(frame).padStart(5,'0'),destination:`old_${slot}_${frame}`}))).flat();
  const [group]=sequences.detect(files,[],'Fx');assert.equal(group.frames.length,12);assert.equal(group.useCount,72);assert.equal(group.slotCount,6);assert.equal(group.canRename,true);
  assert.deepEqual(sequences.names(group,{prefix:'Lightning_',suffix:'',start:1,padding:3}).files,['Lightning_001','Lightning_002','Lightning_003','Lightning_004','Lightning_005','Lightning_006','Lightning_007','Lightning_008','Lightning_009','Lightning_010','Lightning_011','Lightning_012']);
});
test('same image with distinct attachments inside one slot remains protected from name merging',()=>{
  const input=source();input.skins[0].attachments.art.alias={path:'fx/bolt_002',width:40,height:40};input.animations.flash.slots.art.attachment.push({time:.5,name:'alias'});
  const r=buildMerge(main(),input,{...options,replaceSequenceNames:true});assert.equal(r.sequenceGroups[0].canRename,false);assert.match(r.sequenceGroups[0].reason,/one slot/);
});
test('identical basenames in different full source folders remain separate and flatten safely',()=>{
  const input=source();for(const a of Object.values(input.skins[0].attachments.art))a.path=a.path.replace('fx/','north/common/');
  input.slots.push({name:'south',bone:'root',attachment:'frame2'});input.skins[0].attachments.south=structuredClone(input.skins[0].attachments.art);
  for(const a of Object.values(input.skins[0].attachments.south))a.path=a.path.replace('north/','south/');
  input.animations.flash.slots.south=structuredClone(input.animations.flash.slots.art);
  const opts={...options,imageFolder:'ImportedFx',replaceSequenceNames:true},result=buildMerge(main(),input,opts),groups=result.sequenceGroups;
  assert.equal(groups.length,2);assert.equal(new Set(groups.map(g=>g.id)).size,2);assert.deepEqual(groups.map(g=>g.folder),['north/common/','south/common/']);
  assert.equal(result.files.length,8);assert.equal(new Set(result.files.map(f=>f.destination)).size,8);
  assert.ok(result.files.every(f=>/^ImportedFx\/Sequence[12]_\d{3}$/.test(f.destination)));
  for(const group of groups){const name=result.sequenceRenames[group.id].prefix;assert.ok(group.frames.every(f=>f.source.startsWith(group.folder)&&f.destination.startsWith('ImportedFx/'+name)));}
  const duplicate=Object.fromEntries(groups.map(g=>[g.id,{prefix:'Lightning_',suffix:'',start:1,padding:3}]));assert.throws(()=>buildMerge(main(),input,{...opts,sequenceRenames:duplicate}),/collision/);
});
