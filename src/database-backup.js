'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const FORMAT='spine-browser-library',VERSION=1,MAX_BYTES=32*1024*1024;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const absolute=value=>typeof value==='string'&&value.length>0&&!value.includes('\0')&&(path.win32.isAbsolute(value)||path.posix.isAbsolute(value));
function requireValue(condition,label){if(!condition)throw Error('Invalid library backup: '+label+'.');}
function safeTree(value,depth=0){
  requireValue(depth<=30,'data is nested too deeply');
  if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
    requireValue(!['__proto__','constructor','prototype'].includes(key),'unsafe property');safeTree(child,depth+1);
  }
}
function optional(value,key,test){if(value[key]!==undefined)requireValue(test(value[key]),key);}
function record(value){
  requireValue(object(value)&&absolute(value.fullPath),'bookmark path');
  for(const key of ['id','name','fileName','folder','relativePath'])requireValue(typeof value[key]==='string','bookmark '+key);
  requireValue(absolute(value.id),'bookmark ID');
  optional(value,'files',v=>Array.isArray(v));
  if(value.files)for(const file of value.files){requireValue(object(file)&&absolute(file.fullPath),'related file path');for(const key of ['fileName','name'])requireValue(typeof file[key]==='string','related file '+key);}
}
function bookmarks(value){
  requireValue(object(value),'bookmark collection');
  for(const [id,entry] of Object.entries(value)){
    requireValue(absolute(id),'bookmark ID');
    if(entry===true)continue;record(entry);requireValue(!entry.id||entry.id===id,'bookmark ID does not match its record');
  }
}
function location(value){
  requireValue(object(value),'browse location');
  optional(value,'folder',v=>v===''||absolute(v));optional(value,'selected',v=>v===null||absolute(v));
  optional(value,'search',v=>typeof v==='string');optional(value,'scroll',v=>Number.isFinite(v)&&v>=0);
  if(value.anchor!==undefined)requireValue(object(value.anchor)&&absolute(value.anchor.id)&&Number.isFinite(value.anchor.offset),'browse anchor');
}
function validateBackup(input){
  // Clone to detach callers and restrict the payload to JSON data.
  let backup;try{const json=JSON.stringify(input);requireValue(Buffer.byteLength(json)<=MAX_BYTES,'file exceeds 32 MB');backup=JSON.parse(json);}catch(error){throw Error('Invalid library backup: '+error.message);}
  safeTree(backup);
  requireValue(object(backup)&&backup.format===FORMAT,'this is not a Spine Browser library backup');
  requireValue(backup.version===VERSION,'unsupported format version (expected 1)');
  requireValue(typeof backup.exportedAt==='string'&&Number.isFinite(Date.parse(backup.exportedAt)),'export date');
  requireValue(typeof backup.appVersion==='string','app version');
  const data=backup.data;requireValue(object(data)&&object(data.workspace)&&object(data.preferences)&&Array.isArray(data.appendList),'data sections');
  const workspace=data.workspace;bookmarks(workspace.favorites);
  requireValue(Array.isArray(workspace.recent)&&workspace.recent.every(absolute),'recent folder links');
  requireValue(Array.isArray(workspace.categories),'categories');
  const ids=new Set(['all','favorites','append']),names=new Set(['all assets','favorites','append list']);
  for(const category of workspace.categories){
    requireValue(object(category)&&typeof category.id==='string'&&category.id.length>0&&!['__proto__','constructor','prototype'].includes(category.id)&&!ids.has(category.id),'duplicate or invalid category ID');
    requireValue(typeof category.name==='string'&&category.name.trim().length>0&&category.name.length<=40&&!names.has(category.name.trim().toLowerCase()),'duplicate or invalid category name');
    requireValue(/^#[\da-f]{6}$/i.test(category.color),'category color');bookmarks(category.assets);
    ids.add(category.id);names.add(category.name.trim().toLowerCase());
  }
  location(workspace);
  optional(workspace,'category',v=>typeof v==='string'&&ids.has(v));
  optional(workspace,'favoritesOnly',v=>typeof v==='boolean');optional(workspace,'view',v=>['list','grid'].includes(v));
  if(workspace.browseLocations!==undefined){requireValue(object(workspace.browseLocations),'browse locations');for(const value of Object.values(workspace.browseLocations))location(value);}
  const paths=new Set();
  for(const entry of data.appendList){record(entry);const key=/^[a-z]:|^\\\\/i.test(entry.fullPath)?entry.fullPath.replace(/\\/g,'/').toLowerCase():entry.fullPath;
    requireValue(!paths.has(key),'duplicate Append source');paths.add(key);
    requireValue(/\.(spine|json|skel)$/i.test(entry.fullPath),'Append source extension');
  }
  const prefs=data.preferences;requireValue(typeof prefs.hideSkelFiles==='boolean','Hide .skel preference');
  requireValue(prefs.importSettings===null||object(prefs.importSettings),'import preferences');
  if(prefs.importSettings)for(const key of ['cliPath','editorVersion'])requireValue(typeof prefs.importSettings[key]==='string','import '+key);
  return backup;
}
function createBackup(storage,appendList,appVersion){
  requireValue(object(storage),'saved preferences');
  const workspace=JSON.parse(storage.workspaceV1||'{}');
  workspace.favorites??={};workspace.recent??=[];workspace.categories??=[];
  return validateBackup({format:FORMAT,version:VERSION,appVersion,exportedAt:new Date().toISOString(),data:{workspace,appendList,
    preferences:{hideSkelFiles:storage.hideSkelFiles==='true',importSettings:JSON.parse(storage.spineImportSettings||'null')}}});
}
function storageFromBackup(backup){
  const {workspace,preferences}=validateBackup(backup).data;
  return {workspaceV1:JSON.stringify(workspace),hideSkelFiles:String(preferences.hideSkelFiles),spineImportSettings:preferences.importSettings===null?null:JSON.stringify(preferences.importSettings)};
}
function summary(backup){const {workspace,appendList}=backup.data;return `${new Set([workspace.folder,...workspace.recent].filter(Boolean)).size} folder links, ${Object.keys(workspace.favorites).length} favorites, ${workspace.categories.length} categories, ${appendList.length} Append sources`;}
async function readBackup(file){
  const handle=await fs.open(file,'r');try{
    requireValue((await handle.stat()).size<=MAX_BYTES,'file exceeds 32 MB');
    return validateBackup(JSON.parse((await handle.readFile('utf8')).replace(/^\uFEFF/,'')));
  }finally{await handle.close();}
}
async function writeBackup(file,backup){
  const json=JSON.stringify(validateBackup(backup),null,2)+'\n',temporary=file+'.'+randomUUID()+'.tmp';
  requireValue(Buffer.byteLength(json)<=MAX_BYTES,'file exceeds 32 MB');
  try{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temporary,json,{flag:'wx'});await fs.rename(temporary,file);}
  finally{await fs.unlink(temporary).catch(()=>{});}
}
// The Append file is atomic. On a storage failure, restore the original Append
// records; the complete pre-restore JSON is also retained for manual recovery.
async function restoreBackup(backup,{appendList,applyStorage,recoveryFile,current}){
  backup=validateBackup(backup);await writeBackup(recoveryFile,current);
  await appendList.replace(backup.data.appendList);
  try{await applyStorage(storageFromBackup(backup));}
  catch(error){
    try{await appendList.replace(current.data.appendList);}catch(rollback){throw Error(`${error.message} Append rollback failed: ${rollback.message}. Recover from ${recoveryFile}`);}
    throw Error(`${error.message} Previous Append list restored. Recovery backup: ${recoveryFile}`);
  }
}
module.exports={FORMAT,VERSION,MAX_BYTES,validateBackup,createBackup,storageFromBackup,summary,readBackup,writeBackup,restoreBackup};
