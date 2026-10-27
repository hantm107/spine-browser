'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn, execFile} = require('node:child_process');
const {randomUUID, createHash} = require('node:crypto');
const {buildMerge, compareVersions, imagePaths, skinsOf, safeName,validateImageFolder,verifySavedAttachmentKeys} = require('./import-merge');

const exportSettings = {class:'export-json',extension:'.json',format:'JSON',prettyPrint:true,nonessential:true,cleanUp:false,packAtlas:null,packSource:'attachments',packTarget:'single',warnings:true,version:null,all:true,output:'',id:-1,input:'',open:false};
const packSettings = {rotation:false,stripWhitespaceX:false,stripWhitespaceY:false,combineSubdirectories:true,flattenPaths:false,useIndexes:false,premultiplyAlpha:false,maxWidth:4096,maxHeight:4096,paddingX:2,paddingY:2,duplicatePadding:true,filterMin:'Linear',filterMag:'Linear'};
const readJson = async p => JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const exists = async p => fs.access(p).then(() => true, () => false);
const within = (base, file) => { const rel = path.relative(base,file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
function resource(base, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) throw Error(`Invalid relative asset path: ${relative}`);
  const file = path.resolve(base, relative.replace(/\\/g,'/'));
  if (!within(base,file)) throw Error(`Asset escapes the images folder: ${relative}`);
  return file;
}
async function imageFile(base, name) {
  for (const ext of ['.png','.jpg','.jpeg','.PNG','.JPG','.JPEG']) {
    const file = resource(base, name + ext);
    if (await exists(file)) {
      const real = await fs.realpath(file), realBase = await fs.realpath(base);
      if (!within(realBase, real)) throw Error('Images cannot link outside the project images folder.');
      return real;
    }
  }
  throw Error(`Missing image: ${name} in ${base}`);
}
async function validateImagesRoot(folder) {
  const root = path.join(folder,'images');
  if (!(await fs.stat(root).catch(() => null))?.isDirectory()) throw Error('A project must have an images folder beside its .spine file.');
  return root;
}
function runSpine(cli, args, timeout = 120000) {
  if (!path.isAbsolute(cli) || !/\.(com|exe)$/i.test(cli)) return Promise.reject(Error('Choose the installed Spine.com or Spine.exe executable.'));
  return new Promise((resolve,reject) => {
    const child = spawn(cli,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled=true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{}); else child.kill();
      finish(Error('Spine timed out. Check its activation and installed editor version, then retry.'));
    }, timeout);
    const append = b => { output = (output + b.toString()).slice(-500000); };
    child.stdout.on('data',append); child.stderr.on('data',append);
    child.on('error',error=>finish(Error(`Could not start Spine: ${error.message}`)));
    child.on('close',code=> {
      const clean = output.split(/\r?\n/).filter(l=>!/^Licensed to:/.test(l)).join('\n');
      if (code !== 0 || /^ERROR:/m.test(clean)) finish(Error(`Spine command failed (${code}). ${clean.slice(-4500)}`));
      else finish(null,clean);
    });
  });
}
async function normalizeExport(file, output, images) {
  const data = await readJson(file), repairs=[];
  // Legacy converter JSON uses the old unweighted bounding-box shape. This is
  // an explicit structural repair, not a change to its declared Spine version.
  for (const skin of skinsOf(data)) for (const values of Object.values(skin.attachments || {})) for (const attachment of Object.values(values)) {
    if (attachment.type === 'boundingbox' && attachment.vertexCount == null && Array.isArray(attachment.vertices) && attachment.vertices.length % 2 === 0) {
      attachment.vertexCount=attachment.vertices.length/2; repairs.push('Restored a legacy bounding-box vertex count.');
    }
  }
  data.skeleton ||= {}; data.skeleton.images = images.replace(/\\/g,'/') + '/';
  await fs.writeFile(output,JSON.stringify(data)); return {data,repairs};
}
async function freshImageSubfolder(images,requested){
  requested=validateImageFolder(requested);
  const parent=path.posix.dirname(requested),base=path.posix.basename(requested);
  for(let n=1;;n++){
    const candidate=n===1?requested:(parent==='.'?'':parent+'/')+base+'-'+n;
    try{await fs.lstat(resource(images,candidate));}catch(error){if(error.code==='ENOENT')return candidate;throw error;}
  }
}
async function publishToMainFolder({mainFolder,mainProject,group,projectFile,files,manifest,imageSubfolder}) {
  const root=await fs.realpath(mainFolder),createdFiles=[],createdDirs=[],destinations=new Set();
  const tasks=files.map(file=>({...file,destination:resource(root,file.to)}));
  async function prepareParent(file){
    let current=root;
    for(const part of path.relative(root,path.dirname(file)).split(path.sep).filter(Boolean)){
      current=path.join(current,part);
      try{await fs.mkdir(current);createdDirs.push(current);}catch(error){if(error.code!=='EEXIST')throw error;}
      const real=await fs.realpath(current);
      if(!within(root,real)||!(await fs.stat(current)).isDirectory())throw Error('An output asset directory leaves the Main project folder.');
    }
  }
  try{
    if(imageSubfolder){
      const folder=resource(root,'images/'+validateImageFolder(imageSubfolder));
      try{await fs.lstat(folder);throw Error('The import images subfolder now exists. Review the import again to choose a fresh folder.');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    // Check every destination before writing any assets. COPYFILE_EXCL also
    // protects against files created between this check and the actual copy.
    for(const task of tasks){
      const key=task.destination.toLowerCase();
      if(destinations.has(key))throw Error(`Duplicate imported asset path: ${task.to}`);destinations.add(key);
      if(await exists(task.destination))throw Error(`Asset already exists in Main: ${task.to}. Change the import prefix or image subfolder.`);
      await prepareParent(task.destination);
    }
    for(const task of tasks){await fs.copyFile(task.from,task.destination,require('node:fs').constants.COPYFILE_EXCL);createdFiles.push(task.destination);}
    const stem=`${safeName(path.basename(mainProject,path.extname(mainProject)))}-${group}`;
    let project,report;
    for(let n=1;;n++){
      const name=stem+(n===1?'':'-'+n);project=path.join(root,name+'.spine');report=path.join(root,name+'.import-report.json');
      if(await exists(project)||await exists(report))continue;
      try{await fs.copyFile(projectFile,project,require('node:fs').constants.COPYFILE_EXCL);createdFiles.push(project);break;}catch(error){if(error.code!=='EEXIST')throw error;}
    }
    await fs.writeFile(report,JSON.stringify({...manifest,project,outputMode:'mainFolder'},null,2),{flag:'wx'});createdFiles.push(report);
    return {project,folder:root,report};
  }catch(error){
    for(const file of createdFiles.reverse())await fs.unlink(file).catch(()=>{});
    for(const dir of createdDirs.reverse())await fs.rmdir(dir).catch(()=>{});
    throw error;
  }
}
function createImportService({root, cliPath='C:\\Program Files\\Spine\\Spine.com', onProgress=()=>{}}) {
  const sessions = new Map(), plans = new Map(); let queue = Promise.resolve();
  function serial(fn) { const next=queue.then(fn); queue=next.catch(()=>{}); return next; }
  function progress(text) { onProgress(text); }
  async function config(dir) {
    await fs.mkdir(dir,{recursive:true}); const file=path.join(dir,'export-settings.json');
    await fs.writeFile(file,JSON.stringify(exportSettings)); return file;
  }
  async function sourceFingerprint(s) {
    const stat = await fs.stat(s.project);
    return `${stat.size}:${stat.mtimeMs}`;
  }
  const get = id => { const s=sessions.get(id); if(!s)throw Error('Reopen the project; its import session has expired.'); return s; };
  async function inspect(project, settings={}) {
    if (typeof project!=='string' || !path.isAbsolute(project)) throw Error('Choose an absolute project path.');
    const folder=(await fs.stat(project)).isDirectory()?project:path.dirname(project);
    const images=await validateImagesRoot(folder);
    const names=await fs.readdir(folder), projects=names.filter(n=>/\.spine$/i.test(n));
    if (!/\.spine$/i.test(project)) {
      if (projects.length!==1) return {folder,needsProject:!projects.length,projects:projects.map(n=>path.join(folder,n)),exports:names.filter(n=>/\.(json|skel)$/i.test(n)).map(n=>path.join(folder,n))};
      project=path.join(folder,projects[0]);
    }
    const cli=settings.cliPath||cliPath;
    progress('Inspecting the saved Spine project…');
    const info=await runSpine(cli,[...(settings.editorVersion?['-u',settings.editorVersion]:[]),'-i',project]);
    const version=info.match(/Spine version:\s*([\d.]+)/)?.[1];
    if(!version)throw Error('Spine did not report a saved project version.');
    const id=randomUUID(), dir=path.join(root,id), exported=path.join(dir,'original');
    await fs.mkdir(exported,{recursive:true});
    progress(`Reading project skeletons with Spine ${version}…`);
    const exportLog=await runSpine(cli,['-u',version,'-i',project,'-o',exported,'-e',await config(dir)]);
    const skeletons=[];
    for(const file of (await fs.readdir(exported)).filter(n=>/\.json$/i.test(n))) {
      const data=await readJson(path.join(exported,file)); if(!Array.isArray(data.bones))continue;
      skeletons.push({name:path.basename(file,'.json'),data,file:path.join(exported,file)});
    }
    if(!skeletons.length)throw Error('The saved project did not export any skeletons.');
    const session={id,project,folder,images,version,dir,skeletons,cli,conversion:new Map(),preview:new Map()};
    session.fingerprint=await sourceFingerprint(session); sessions.set(id,session);
    return {id,project,folder,version,skeletons:skeletons.map(s=>({name:s.name,animations:Object.keys(s.data.animations||{}),bones:s.data.bones.length,skins:skinsOf(s.data).map(k=>k.name)})),warnings:exportLog.split('\n').filter(l=>/^WARNING:|Images path not found/.test(l)&&!l.includes('Welcome data download'))};
  }
  async function reconstruct(file, settings={}) {
    if(!path.isAbsolute(file)||!/\.(json|skel)$/i.test(file))throw Error('Choose a JSON or binary skeleton export.');
    const images=await validateImagesRoot(path.dirname(file)), dir=path.join(root,'recovered-'+randomUUID());
    await fs.mkdir(dir,{recursive:true}); await fs.cp(images,path.join(dir,'images'),{recursive:true,errorOnExist:true,force:false});
    let version, input=file, repairs=[];
    if(/\.json$/i.test(file)) {
      input=path.join(dir,'recovered-input.json'); const normalized=await normalizeExport(file,input,path.join(dir,'images'));
      version=normalized.data.skeleton.spine; repairs=normalized.repairs;
    } else { const b=await fs.readFile(file); version=b.subarray(0,512).toString('latin1').match(/\d+\.\d+(?:\.\d+)?/)?.[0]; }
    if(!version)throw Error('The export has no identifiable Spine version.');
    // Export metadata may only contain major.minor. Select an installed patch
    // in that series; never replace the JSON version to bypass conversion.
    if(version.split('.').length===2) {
      const installed=await fs.readdir(path.join(os.homedir(),'Spine','updates')).catch(()=>[]);
      version=installed.filter(v=>v.startsWith(version+'.')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1)||version+'.xx';
    }
    const project=path.join(dir,safeName(path.basename(file,path.extname(file)))+'.spine');
    progress('Reconstructing a working project from its export…');
    await runSpine(settings.cliPath||cliPath,['-u',version,'-i',input,'-o',project,'-r',path.basename(project,'.spine')]);
    await fs.writeFile(path.join(dir,'RECOVERY.txt'),'Reconstructed from '+file+'\nThe original files were not changed. Exported data may omit editor-only information.\n'+repairs.join('\n'));
    return inspect(project,settings);
  }
  async function converted(session, version) {
    if(compareVersions(session.version,version)>0)throw Error(`Import ${session.version} is newer than Main ${version}. Downgrading is not supported.`);
    if(compareVersions(session.version,version)===0)return session.skeletons;
    if(session.conversion.has(version))return session.conversion.get(version);
    const dir=path.join(session.dir,'converted-'+safeName(version)); await fs.mkdir(dir,{recursive:true});
    progress(`Upgrading the Import project with Spine ${version}…`);
    await runSpine(session.cli,['-u',version,'-i',session.project,'-o',dir,'-e',await config(session.dir)]);
    const list=[];
    for(const file of (await fs.readdir(dir)).filter(n=>/\.json$/i.test(n))) { const data=await readJson(path.join(dir,file)); if(data.bones)list.push({name:path.basename(file,'.json'),file:path.join(dir,file),data}); }
    session.conversion.set(version,list); return list;
  }
  async function preview(id,skeletonName) {
    const s=get(id), skeleton=s.skeletons.find(x=>x.name===skeletonName); if(!skeleton)throw Error('Choose a skeleton.');
    if(s.preview.has(skeletonName))return s.preview.get(skeletonName);
    const dir=path.join(s.dir,'preview-'+safeName(skeletonName)), img=path.join(dir,'images'); await fs.mkdir(img,{recursive:true});
    const refs=new Set(skinsOf(skeleton.data).flatMap(sk=>Object.values(sk.attachments||{}).flatMap(values=>Object.entries(values).flatMap(([key,a])=>imagePaths(key,a)))));
    for(const name of refs) { const src=await imageFile(s.images,name), dst=resource(img,name+path.extname(src)); await fs.mkdir(path.dirname(dst),{recursive:true}); await fs.copyFile(src,dst); }
    const json=path.join(dir,'preview.json'), settings=path.join(dir,'pack.json');
    await fs.writeFile(json,JSON.stringify(skeleton.data)); await fs.writeFile(settings,JSON.stringify(packSettings));
    progress('Preparing the project preview…');
    if(refs.size)await runSpine(s.cli,['-u',s.version,'-i',img,'-o',dir,'-n','preview','-p',settings]);
    else await fs.writeFile(path.join(dir,'preview.atlas'),'');
    const result={skeletonPath:json,atlasPath:path.join(dir,'preview.atlas'),version:s.version}; s.preview.set(skeletonName,result); return result;
  }
  async function plan(options) {
    const main=get(options.mainId), source=get(options.importId);
    if(options.useImageFolder===false)throw Error('Imported images require a named subfolder.');
    const requestedImageFolder=validateImageFolder(options.imageFolder);
    const imageFolder=await freshImageSubfolder(main.images,requestedImageFolder);
    options={...options,appendToMain:options.appendToMain!==false,useImageFolder:true,imageFolder};
    if(path.resolve(main.folder).toLowerCase()===path.resolve(source.folder).toLowerCase())throw Error('Main and Import must be in separate folders.');
    if(await sourceFingerprint(main)!==main.fingerprint||await sourceFingerprint(source)!==source.fingerprint)throw Error('A project changed on disk. Reopen it before importing.');
    const target=main.skeletons.find(s=>s.name===options.mainSkeleton), inputs=await converted(source,main.version), input=inputs.find(s=>s.name===options.importSkeleton);
    if(!target||!input)throw Error('Choose a skeleton in both projects.');
    const merged=buildMerge(target.data,input.data,options);
    const copies=[];
    for(const file of merged.files) { const from=await imageFile(source.images,file.source); copies.push({...file,from,to:file.destination+path.extname(from).toLowerCase()}); }
    // Resolve Main images up front. Their source bytes and existing paths stay
    // intact; only Import attachments and physical filenames are renamed.
    const mainImages=[], missingExisting=[];
    for(const sk of main.skeletons) {
      const refs=new Set(skinsOf(sk.data).flatMap(skin=>Object.values(skin.attachments||{}).flatMap(as=>Object.entries(as).flatMap(([k,a])=>imagePaths(k,a)))));
      for(const name of refs) {
        try { mainImages.push({skeleton:sk.name,name,from:await imageFile(main.images,name)}); }
        catch(error) { if(sk.name===options.mainSkeleton)throw error; missingExisting.push({skeleton:sk.name,image:name}); }
      }
    }
    const destinations=new Set(mainImages.map(f=>(f.name+path.extname(f.from)).toLowerCase()));
    for(const file of copies) { if(destinations.has(file.to.toLowerCase()))throw Error(`Image filename collision: ${file.to}`); destinations.add(file.to.toLowerCase()); }
    if(options.appendToMain===true)for(const file of copies)if(await exists(resource(main.images,file.to)))throw Error(`Asset already exists in Main: images/${file.to}. Change the import prefix or image subfolder.`);
    const audioCopies=[];
    for(const f of merged.audio) { const from=resource(path.join(source.folder,'audio'),f.source);await fs.access(from);audioCopies.push({from,to:f.destination,imported:true}); }
    for(const sk of main.skeletons)for(const event of Object.values(sk.data.events||{}))if(event.audio){
      const from=resource(path.join(main.folder,'audio'),event.audio);
      if(await exists(from))audioCopies.push({from,to:event.audio,imported:false});
      else if(sk.name===options.mainSkeleton)throw Error(`Missing audio: ${event.audio}`);
    }
    const snapshots=[];
    for(const file of new Set([...copies.map(f=>f.from),...mainImages.map(f=>f.from),...audioCopies.map(f=>f.from)])) {const stat=await fs.stat(file);snapshots.push({file,size:stat.size,mtime:stat.mtimeMs});}
    const id=randomUUID(); plans.set(id,{id,options:cloneOptions(options),main,source,merged,copies,mainImages,missingExisting,audioCopies,snapshots});
    return {id,appendToMain:options.appendToMain===true,mainFolder:main.folder,group:merged.group,prefix:merged.prefix,imageFolder:merged.imageFolder,createSkins:merged.createSkins,previewSkin:merged.previewSkin,sourceSkin:merged.sourceSkin,animationName:merged.animationName,rows:merged.rows,stats:merged.stats,skins:merged.skinNames,warnings:[...(imageFolder!==requestedImageFolder?[`images/${requestedImageFolder}/ exists; this import will use images/${imageFolder}/.`]:[]),...(merged.createSkins?[`In Spine, select skin ${merged.previewSkin} to display the imported artwork.`]:[]),...(missingExisting.length?[`${missingExisting.length} existing image references in other Main skeletons are missing. Their skeleton data will be preserved; those images remain unavailable.`]:[]),'The new project is rebuilt from Spine exports with nonessential data enabled. Editor-only information absent from exports cannot be retained.']};
  }
  function appendsToMain(planId){const p=plans.get(planId);if(!p)throw Error('Review the import again before saving.');return p.options.appendToMain===true;}
  async function execute(planId,parent) {
    const p=plans.get(planId); if(!p)throw Error('Review the import again before saving.');
    const append=p.options.appendToMain===true;
    if(append){parent=path.join(root,'verified-output');await fs.mkdir(parent,{recursive:true});}
    if(!path.isAbsolute(parent))throw Error('Choose an absolute output folder.');
    const realParent=await fs.realpath(parent);
    for(const source of [p.main.folder,p.source.folder]) { const real=await fs.realpath(source); if(within(real,realParent))throw Error('Choose an output folder outside both source project folders.'); }
    if(await sourceFingerprint(p.main)!==p.main.fingerprint||await sourceFingerprint(p.source)!==p.source.fingerprint)throw Error('A source project changed. Review the import again.');
    for(const file of p.snapshots) {const stat=await fs.stat(file.file);if(stat.size!==file.size||stat.mtimeMs!==file.mtime)throw Error('An image or audio file changed. Review the import again.');}
    const dir=path.join(realParent,`Spine-Import-${p.merged.group}-${randomUUID().slice(0,8)}`), images=path.join(dir,'images'), dataDir=path.join(dir,'data');
    await fs.mkdir(dir); await fs.mkdir(images); await fs.mkdir(dataDir);
    try {
      progress('Copying the required images…');
      for(const file of p.mainImages) { const dst=resource(images,file.name+path.extname(file.from)); await fs.mkdir(path.dirname(dst),{recursive:true}); if(!await exists(dst))await fs.copyFile(file.from,dst); }
      for(const file of p.copies) { const dst=resource(images,file.to); await fs.mkdir(path.dirname(dst),{recursive:true}); await fs.copyFile(file.from,dst,require('node:fs').constants.COPYFILE_EXCL); }
      for(const file of p.audioCopies) {const dst=resource(path.join(dir,'audio'),file.to);await fs.mkdir(path.dirname(dst),{recursive:true});if(!await exists(dst))await fs.copyFile(file.from,dst);}
      const inputs=[];
      for(const sk of p.main.skeletons) {
        const data=structuredClone(sk.name===p.options.mainSkeleton?p.merged.data:sk.data);
        data.skeleton.images='../images/';
        if(Object.values(data.events||{}).some(e=>e.audio))data.skeleton.audio='../audio/';
        const file=path.join(dataDir,safeName(sk.name)+'.json'); await fs.writeFile(file,JSON.stringify(data,null,2)); inputs.push({name:sk.name,file});
      }
      const project=path.join(dir,'Merged.spine');
      progress('Saving the merged native Spine project…');
      const args=['-u',p.main.version]; for(const sk of inputs)args.push('-i',sk.file,'-o',project,'-r',sk.name);
      await runSpine(p.main.cli,args);
      // JSON images paths were relative to data/, but .spine is one level up.
      // Import uses the JSON's directory to resolve this path; a fresh export
      // verifies the saved project rather than assuming the CLI succeeded.
      const verify=path.join(dir,'verification'); await fs.mkdir(verify);
      await runSpine(p.main.cli,['-u',p.main.version,'-i',project,'-o',verify,'-e',await config(p.main.dir)]);
      const selected=await readJson(path.join(verify,safeName(p.options.mainSkeleton)+'.json'));
      if(!selected.bones.some(b=>b.name===p.merged.group)||!ownAnimation(selected,p.merged.animationName))throw Error('Saved project verification failed.');
      const attachmentVerification=verifySavedAttachmentKeys(p.merged.data,selected,p.merged.animationName,p.merged.group);
      const manifest={version:1,main:p.main.project,import:p.source.project,skeleton:p.options.mainSkeleton,importSkeleton:p.options.importSkeleton,animation:p.options.animation,newAnimation:p.merged.animationName,group:p.merged.group,prefix:p.merged.prefix,imageFolder:p.merged.imageFolder,createSkins:p.merged.createSkins,sourceSkin:p.merged.sourceSkin,offsetX:1000,stats:p.merged.stats,mapping:p.merged.rows,images:[],missingExistingImages:p.missingExisting,note:'Rebuilt using official Spine JSON import/export. Original source projects are unchanged.'};
      for(const f of p.copies)manifest.images.push({source:f.from,destination:f.to,sha256:createHash('sha256').update(await fs.readFile(f.from)).digest('hex')});
      manifest.attachmentVerification=attachmentVerification;
      manifest.previewSkin=p.merged.previewSkin;
      manifest.outputMode=append?'mainFolder':'newFolder';
      await fs.writeFile(path.join(dir,'import-report.json'),JSON.stringify(manifest,null,2));
      let destination={project,folder:dir,report:path.join(dir,'import-report.json')};
      if(append){
        if(await sourceFingerprint(p.main)!==p.main.fingerprint||await sourceFingerprint(p.source)!==p.source.fingerprint)throw Error('A source project changed while saving. Review the import again.');
        for(const file of p.snapshots){const stat=await fs.stat(file.file);if(stat.size!==file.size||stat.mtimeMs!==file.mtime)throw Error('An image or audio file changed while saving. Review the import again.');}
        progress('Appending the verified project and new assets to Main…');
        const files=p.copies.map(f=>({from:resource(images,f.to),to:'images/'+f.to}));
        const audio=new Map();for(const file of p.audioCopies.filter(f=>f.imported))audio.set(file.to,{from:resource(path.join(dir,'audio'),file.to),to:'audio/'+file.to});
        files.push(...audio.values());
        destination=await publishToMainFolder({mainFolder:p.main.folder,mainProject:p.main.project,group:p.merged.group,projectFile:project,files,manifest,imageSubfolder:p.merged.imageFolder});
      }
      plans.delete(planId); return {...destination,appendToMain:append,animationName:p.merged.animationName,group:p.merged.group,previewSkin:p.merged.previewSkin,stats:p.merged.stats};
    } catch(error) { await fs.writeFile(path.join(dir,'IMPORT-FAILED.txt'),error.message).catch(()=>{}); throw Error(`Import failed; diagnostic files are in ${dir}. ${error.message}`); }
  }
  async function previewPlan(id) {
    const p=plans.get(id); if(!p)throw Error('Review the import again.');
    if(p.preview)return p.preview;
    const dir=path.join(p.main.dir,'merged-'+id), images=path.join(dir,'images'); await fs.mkdir(images,{recursive:true});
    for(const f of p.mainImages.filter(f=>f.skeleton===p.options.mainSkeleton)) { const dst=resource(images,f.name+path.extname(f.from)); await fs.mkdir(path.dirname(dst),{recursive:true}); await fs.copyFile(f.from,dst); }
    for(const f of p.copies){const dst=resource(images,f.to);await fs.mkdir(path.dirname(dst),{recursive:true});await fs.copyFile(f.from,dst);}
    const json=path.join(dir,'merged.json'), settings=path.join(dir,'pack.json');
    await fs.writeFile(json,JSON.stringify(p.merged.data)); await fs.writeFile(settings,JSON.stringify(packSettings));
    progress('Packing images for the combined preview…');
    await runSpine(p.main.cli,['-u',p.main.version,'-i',images,'-o',dir,'-n','merged','-p',settings]);
    p.preview={skeletonPath:json,atlasPath:path.join(dir,'merged.atlas'),version:p.main.version,animation:p.merged.animationName}; return p.preview;
  }
  return {inspect:(...a)=>serial(()=>inspect(...a)),reconstruct:(...a)=>serial(()=>reconstruct(...a)),preview:(...a)=>serial(()=>preview(...a)),plan:(...a)=>serial(()=>plan(...a)),previewPlan:(...a)=>serial(()=>previewPlan(...a)),appendsToMain,execute:(...a)=>serial(()=>execute(...a))};
}
const cloneOptions = o => structuredClone(o);
const ownAnimation=(data,name)=>Object.prototype.hasOwnProperty.call(data.animations||{},name);
module.exports={createImportService,runSpine,normalizeExport,imageFile,resource,exportSettings,packSettings,publishToMainFolder,freshImageSubfolder};
