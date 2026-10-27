// Opt-in: requires an activated Spine editor. This test exercises the actual
// editor import/export path; runtime-only JSON previews cannot catch renames.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createImportService,runSpine}=require('../import-service');
const cli=process.env.SPINE_NATIVE_IMPORT_CLI,version=process.env.SPINE_NATIVE_IMPORT_VERSION||'4.2.43';

test('legacy JSON and custom-header binary recovery bridge into a modern Main project',{skip:!cli,timeout:180000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-legacy-recovery-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150}));
  const source=path.join(root,'legacy'),main=path.join(root,'main');
  for(const folder of [source,main])await fs.mkdir(path.join(folder,'images'),{recursive:true});
  await fs.copyFile(path.join(__dirname,'fixtures/4.2/spineboy.png'),path.join(source,'images','art.png'));
  const old={skeleton:{spine:'2.1.27'},bones:[{name:'root'}],slots:[{name:'art',bone:'root',attachment:'art'}],skins:{default:{art:{art:{width:16,height:16}}}},animations:{flash:{slots:{art:{attachment:[{name:'art'},{time:.1},{time:.2,name:'art'},{time:.3,name:'art'}]}}}}};
  const json=JSON.stringify(old),file=path.join(source,'effect.json'),binary=path.join(source,'effect.skel'),header='HuaHua2.0';
  await fs.writeFile(file,json);await fs.writeFile(binary,Buffer.concat([Buffer.from([1,Buffer.byteLength(header)+1]),Buffer.from(header)]));
  const service=createImportService({root:path.join(root,'cache'),cliPath:cli});
  const recovered=await service.reconstruct(file,{editorVersion:version});assert.match(recovered.version,/^3\.8\./);assert.deepEqual(recovered.skeletons[0].animations,['flash']);
  const fallback=await service.reconstruct(binary,{editorVersion:version});assert.match(fallback.warnings.join(' '),/matching JSON/);
  assert.equal(await fs.readFile(file,'utf8'),json);
  const mainJson=path.join(main,'main.json'),mainProject=path.join(main,'main.spine');
  await fs.writeFile(mainJson,JSON.stringify({skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],animations:{idle:{}}}));
  await runSpine(cli,['-u',version,'-i',mainJson,'-o',mainProject,'-r','main']);
  const m=await service.inspect(mainProject,{editorVersion:version});
  const plan=await service.plan({mainId:m.id,importId:recovered.id,mainSkeleton:'main',importSkeleton:recovered.skeletons[0].name,animation:'flash',prefix:'Legacy',imageFolder:'Legacy',createSkins:false,appendToMain:false});
  const output=await service.execute(plan.id,root),report=JSON.parse(await fs.readFile(path.join(output.folder,'import-report.json'),'utf8'));
  assert.equal(report.attachmentVerification.totalKeys,4);assert.equal(report.attachmentVerification.namedKeys,3);
});
test('native save preserves attachment selections in both skin modes',{skip:!cli,timeout:180000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spine-native-import-'));
  assert.ok(path.relative(os.tmpdir(),root).startsWith('spine-native-import-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150}));
  const main=path.join(root,'Main project'),source=path.join(root,'Import project');
  for(const dir of [main,source])await fs.mkdir(path.join(dir,'images'),{recursive:true});
  const input={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'},{name:'effect',parent:'root'}],slots:[{name:'art',bone:'effect',attachment:'headA'}],skins:[{name:'blue',attachments:{art:{headA:{name:'headA',width:16,height:16},headB:{name:'headB',width:16,height:16}}}},{name:'red',attachments:{art:{headA:{name:'redHeadA',path:'redHeadA',width:16,height:16},headB:{name:'redHeadB',path:'redHeadB',width:16,height:16}}}}],animations:{flash:{slots:{art:{attachment:[{name:'headA'},{time:.1,name:'headB'},{time:.2},{time:.3,name:'headA'}]}}}}};
  const basic={skeleton:{spine:version,images:'./images/'},bones:[{name:'root'}],animations:{idle:{}}};
  await fs.writeFile(path.join(main,'main.json'),JSON.stringify(basic));await fs.writeFile(path.join(source,'source.json'),JSON.stringify(input));
  for(const name of ['headA','headB','redHeadA','redHeadB'])await fs.copyFile(path.join(__dirname,'fixtures/4.2/spineboy.png'),path.join(source,'images',name+'.png'));
  for(const [dir,name]of [[main,'main'],[source,'source']])await runSpine(cli,['-u',version,'-i',path.join(dir,name+'.json'),'-o',path.join(dir,name+'.spine'),'-r',name]);
  const service=createImportService({root:path.join(root,'cache'),cliPath:cli});
  const m=await service.inspect(path.join(main,'main.spine'),{editorVersion:version}),s=await service.inspect(path.join(source,'source.spine'),{editorVersion:version});
  for(const createSkins of [false,true]){
    const plan=await service.plan({mainId:m.id,importId:s.id,mainSkeleton:'main',importSkeleton:'source',animation:'flash',prefix:'Fx',imageFolder:'Effects/Flash',createSkins,sourceSkin:'red',appendToMain:false});
    const output=await service.execute(plan.id,root),report=JSON.parse(await fs.readFile(path.join(output.folder,'import-report.json'),'utf8'));
    assert.equal(report.attachmentVerification.totalKeys,4);assert.equal(report.attachmentVerification.namedKeys,3);
    const saved=JSON.parse(await fs.readFile(path.join(output.folder,'verification/main.json'),'utf8'));
    const keys=saved.animations.Fx_flash.slots.Fx_art.attachment;
    assert.equal(keys.filter(k=>k.name).length,3);assert.equal(keys[2].name,undefined);
    assert.equal(saved.skins.filter(s=>s.name.startsWith('Fx_')).length,createSkins?2:0);
    for(const [key,a]of Object.entries(saved.skins.find(s=>s.name==='default')?.attachments?.Fx_art||{}))assert.equal(key,a.name||key);
  }
  const unskinned=path.join(root,'unskinned');await fs.mkdir(path.join(unskinned,'images'),{recursive:true});
  for(const name of ['headA','headB'])await fs.copyFile(path.join(source,'images',name+'.png'),path.join(unskinned,'images',name+'.png'));
  const unskinnedData=structuredClone(input);unskinnedData.skins=[{name:'default',attachments:input.skins[0].attachments}];
  await fs.writeFile(path.join(unskinned,'unskinned.json'),JSON.stringify(unskinnedData));
  await runSpine(cli,['-u',version,'-i',path.join(unskinned,'unskinned.json'),'-o',path.join(unskinned,'unskinned.spine'),'-r','unskinned']);
  const u=await service.inspect(path.join(unskinned,'unskinned.spine'),{editorVersion:version});
  const defaultPlan=await service.plan({mainId:m.id,importId:u.id,mainSkeleton:'main',importSkeleton:'unskinned',animation:'flash',prefix:'DefaultFx',imageFolder:'DefaultFx',createSkins:true});
  assert.equal(service.appendsToMain(defaultPlan.id),true);
  const defaultOutput=await service.execute(defaultPlan.id),defaultReport=JSON.parse(await fs.readFile(defaultOutput.report,'utf8'));
  assert.equal(defaultReport.attachmentVerification.namedKeys,3);assert.equal(defaultReport.previewSkin,'DefaultFx_default');
  const mainBytes=await fs.readFile(path.join(main,'main.spine'));
  const keep=path.join(main,'images','keep.png');await fs.copyFile(path.join(source,'images','headA.png'),keep);const keepBytes=await fs.readFile(keep);
  const appendOptions={mainId:m.id,importId:s.id,mainSkeleton:'main',importSkeleton:'source',animation:'flash',prefix:'AppendFx',imageFolder:'Effects/Append',createSkins:false,sourceSkin:'red'};
  const appendPlan=await service.plan(appendOptions);assert.equal(service.appendsToMain(appendPlan.id),true);
  const appended=await service.execute(appendPlan.id),appendReport=JSON.parse(await fs.readFile(appended.report,'utf8'));
  assert.equal(appended.folder,await fs.realpath(main));assert.equal(path.dirname(appended.project),await fs.realpath(main));assert.equal(appendReport.outputMode,'mainFolder');assert.equal(appendReport.attachmentVerification.namedKeys,3);
  assert.ok(mainBytes.equals(await fs.readFile(path.join(main,'main.spine'))));assert.ok(keepBytes.equals(await fs.readFile(keep)));
  for(const image of appendReport.images)await fs.access(path.join(main,'images',image.destination));
  const reopened=await service.inspect(appended.project,{editorVersion:version});assert.ok(reopened.skeletons[0].animations.includes('AppendFx_flash'));
  const repeatedPlan=await service.plan(appendOptions);assert.equal(repeatedPlan.imageFolder,'Effects/Append-2');
  const repeated=await service.execute(repeatedPlan.id);assert.notEqual(repeated.project,appended.project);
  assert.equal(JSON.parse(await fs.readFile(repeated.report,'utf8')).imageFolder,'Effects/Append-2');
  assert.ok(mainBytes.equals(await fs.readFile(path.join(main,'main.spine'))));
  await assert.rejects(service.plan({...appendOptions,imageFolder:''}),/subfolder/);
});
