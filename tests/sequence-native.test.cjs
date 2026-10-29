// Opt-in verification through the actual editor, including named-skin and native
// sequence references which cannot be checked by filename-only assertions.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createImportService,runSpine}=require('../import-service');
const cli=process.env.SPINE_NATIVE_IMPORT_CLI,version=process.env.SPINE_NATIVE_IMPORT_VERSION||'4.2.43';

test('identical basenames in different source folders append distinct bytes into one Main images subfolder',{skip:!cli,timeout:180000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-folder-sequences-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150}));
  const main=path.join(root,'main'),source=path.join(root,'source');await fs.mkdir(path.join(main,'images'),{recursive:true});
  const north=await fs.readFile(path.join(__dirname,'fixtures/4.2/spineboy.png')),south=await fs.readFile(path.join(__dirname,'fixtures/3.8/spineboy.png'));assert.ok(!north.equals(south));
  for(const [folder,bytes]of [['north/common',north],['south/common',south]]){await fs.mkdir(path.join(source,'images',folder),{recursive:true});for(const n of [2,4])await fs.writeFile(path.join(source,'images',folder,'frame_00'+n+'.png'),bytes);}
  const base={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],animations:{idle:{}}};
  const input={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],slots:['north','south'].map(name=>({name,bone:'root',attachment:'frame2'})),skins:[{name:'default',attachments:Object.fromEntries(['north','south'].map(folder=>[folder,Object.fromEntries([2,4].map(n=>['frame'+n,{path:folder+'/common/frame_00'+n,width:16,height:16}]))]))}],animations:{flash:{slots:{north:{attachment:[{name:'frame4'},{time:.1,name:'frame2'}]},south:{attachment:[{name:'frame2'},{time:.2,name:'frame4'}]}}}}};
  for(const [folder,data]of [[main,base],[source,input]]){await fs.writeFile(path.join(folder,'input.json'),JSON.stringify(data));await runSpine(cli,['-u',version,'-i',path.join(folder,'input.json'),'-o',path.join(folder,'project.spine'),'-r','project']);}
  const service=createImportService({root:path.join(root,'cache'),cliPath:cli}),m=await service.inspect(path.join(main,'project.spine'),{editorVersion:version}),s=await service.inspect(path.join(source,'project.spine'),{editorVersion:version});
  const options={mainId:m.id,importId:s.id,mainSkeleton:'project',importSkeleton:'project',animation:'flash',imageFolder:'ImportedFx',createSkins:false,replaceSequenceNames:true};
  const initial=await service.plan(options);assert.equal(initial.sequenceGroups.length,2);
  const rules=Object.fromEntries(initial.sequenceGroups.map(g=>[g.id,{prefix:g.folder.startsWith('north/')?'North_':'South_',suffix:'',start:1,padding:3}]));
  const reviewed=await service.plan({...options,sequenceRenames:rules}),output=await service.execute(reviewed.id),report=JSON.parse(await fs.readFile(output.report,'utf8'));
  const files=await fs.readdir(path.join(main,'images','ImportedFx'),{withFileTypes:true});assert.ok(files.every(f=>f.isFile()));assert.deepEqual(files.map(f=>f.name).sort(),['North_001.png','North_002.png','South_001.png','South_002.png']);
  for(const name of ['North_001.png','North_002.png'])assert.ok(north.equals(await fs.readFile(path.join(main,'images','ImportedFx',name))));
  for(const name of ['South_001.png','South_002.png'])assert.ok(south.equals(await fs.readFile(path.join(main,'images','ImportedFx',name))));
  assert.equal(report.attachmentVerification.namedKeys,4);assert.equal(output.folder,await fs.realpath(main));assert.equal((await service.inspect(output.project,{editorVersion:version})).skeletons[0].animations.includes('ImportedMain_flash'),true);
});
test('sequence image renaming survives native save in both skin modes and native Spine sequences',{skip:!cli,timeout:240000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-sequence-rename-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150}));
  const main=path.join(root,'main'),ordinary=path.join(root,'ordinary'),native=path.join(root,'native');
  for(const folder of [main,ordinary,native])await fs.mkdir(path.join(folder,'images','fx'),{recursive:true});
  for(const [folder,numbers]of [[ordinary,[2,4,8,10]],[native,[7,8,9,10]]])for(const n of numbers)await fs.copyFile(path.join(__dirname,'fixtures/4.2/spineboy.png'),path.join(folder,'images/fx','fire_'+String(n).padStart(3,'0')+'.png'));
  const basic={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],animations:{idle:{}}};
  const input={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],slots:[{name:'art',bone:'root',attachment:'frame2'}],skins:[{name:'default',attachments:{art:Object.fromEntries([2,4,8,10].map(n=>['frame'+n,{path:'fx/fire_'+String(n).padStart(3,'0'),width:16,height:16}]))}}],animations:{flash:{slots:{art:{attachment:[{name:'frame10'},{time:.1,name:'frame2'},{time:.2,name:'frame8'},{time:.3,name:'frame4'},{time:.4}]}}}}};
  const sequence=structuredClone(input);sequence.slots[0].attachment='blast';sequence.skins[0].attachments.art={blast:{path:'fx/fire_',width:16,height:16,sequence:{count:4,start:7,digits:3,setup:1}}};sequence.animations.flash={slots:{art:{attachment:[{name:'blast'},{time:.6}]}},attachments:{default:{art:{blast:{sequence:[{time:.1,mode:'loop',index:1,delay:.1},{time:.4,mode:'hold',index:2}]}}}}};
  const artwork=structuredClone(input.skins[0].attachments.art),keys=structuredClone(input.animations.flash.slots.art);
  for(let i=0;i<6;i++){const slot=i?'art'+i:'art';input.bones.push({name:'part'+i,parent:'root',x:i*50});if(i)input.slots.push({name:slot,bone:'part'+i,attachment:'frame2'});else input.slots[0].bone='part0';input.skins[0].attachments[slot]=structuredClone(artwork);input.animations.flash.slots[slot]=structuredClone(keys);}
  for(const [folder,data]of [[main,basic],[ordinary,input],[native,sequence]]){await fs.writeFile(path.join(folder,'source.json'),JSON.stringify(data));await runSpine(cli,['-u',version,'-i',path.join(folder,'source.json'),'-o',path.join(folder,'source.spine'),'-r','source']);}
  const service=createImportService({root:path.join(root,'cache'),cliPath:cli}),m=await service.inspect(path.join(main,'source.spine'),{editorVersion:version}),s=await service.inspect(path.join(ordinary,'source.spine'),{editorVersion:version}),n=await service.inspect(path.join(native,'source.spine'),{editorVersion:version});
  const original=await fs.readFile(path.join(ordinary,'source.spine'));
  for(const [session,createSkins,automatic]of [[s,false,true],[s,true,false],[n,false,false]]){
    const options={mainId:m.id,importId:session.id,mainSkeleton:'source',importSkeleton:'source',animation:'flash',prefix:'Fx',imageFolder:'Renamed',createSkins,appendToMain:false,replaceSequenceNames:true};
    const detected=await service.plan(options),g=detected.sequenceGroups[0],isNative=session===n;
    assert.ok(g);const rule={prefix:isNative?'Native':'Thunder_',suffix:'_hit',start:1,padding:3};
    const plan=automatic?detected:await service.plan({...options,sequenceRenames:{[g.id]:rule}}),output=await service.execute(plan.id,root),report=JSON.parse(await fs.readFile(path.join(output.folder,'import-report.json'),'utf8')),saved=JSON.parse(await fs.readFile(path.join(output.folder,'verification/source.json'),'utf8'));
    const values=saved.skins.flatMap(skin=>Object.values(skin.attachments?.Fx_art||{}));
    for(let i=1;i<=4;i++)await fs.access(path.join(output.folder,'images/Renamed',isNative?'Native_hit00'+i+'.png':automatic?'Sequence1_00'+i+'.png':'Thunder_00'+i+'_hit.png'));
    assert.ok(values.every(a=>(a.path||'').startsWith('Renamed/')));
    if(isNative){const a=values.find(a=>a.sequence);assert.equal(a.sequence.count,4);assert.equal(a.sequence.start??1,1);assert.equal(a.sequence.digits,3);assert.equal(a.sequence.setup,1);assert.equal(a.path,'Renamed/Native_hit');assert.equal(saved.animations.Fx_flash.attachments.default.Fx_art.Native_hit.sequence[1].index,2);}
    else {assert.equal(report.attachmentVerification.totalKeys,30);assert.equal(report.attachmentVerification.namedKeys,24);assert.equal(report.images.length,4);assert.equal(plan.sequenceGroups[0].useCount,24);assert.equal(plan.sequenceGroups[0].frames.length,4);assert.deepEqual(saved.animations.Fx_flash.slots.Fx_art.attachment.map(k=>k.time||0),[0,.1,.2,.3,.4]);assert.ok(values.some(a=>a.path===(automatic?'Renamed/Sequence1_004':'Renamed/Thunder_004_hit')));for(let i=1;i<6;i++){assert.equal(saved.bones.find(b=>b.name==='Fx_part'+i).x,i*50);assert.equal(saved.animations.Fx_flash.slots['Fx_art'+i].attachment.length,5);}}
  }
  assert.ok(original.equals(await fs.readFile(path.join(ordinary,'source.spine'))));
});
