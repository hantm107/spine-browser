'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const key=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
function createAppendListStore(file){
  let records=null,queue=Promise.resolve();
  async function load(){
    if(records)return;
    let saved;try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT'){records=[];return;}throw Error('Could not read the Append list: '+error.message);}
    if(saved.version!==1||!Array.isArray(saved.projects))throw Error('The saved Append list has an unsupported format.');
    records=saved.projects.filter(p=>typeof p.fullPath==='string'&&path.isAbsolute(p.fullPath));
  }
  async function metadata(filePath){
    const stat=await fs.stat(filePath);if(!stat.isFile())throw Error('Choose a project or skeleton export file.');
    const extension=path.extname(filePath).toLowerCase();if(!['.spine','.json','.skel'].includes(extension))throw Error('Append list accepts .spine, skeleton .json, or .skel files.');
    if(extension==='.json'){
      const json=JSON.parse((await fs.readFile(filePath,'utf8')).replace(/^\uFEFF/,''));
      if(!Array.isArray(json.bones))throw Error('Choose a Spine skeleton JSON export.');
    }
    const fullPath=await fs.realpath(filePath),fileName=path.basename(fullPath);
    return {id:fullPath,fullPath,fileName,name:path.basename(fileName,path.extname(fileName)),folder:path.dirname(fullPath),relativePath:fullPath,isDirectSpineFile:extension==='.spine',size:stat.size,modified:stat.mtimeMs};
  }
  async function list(){
    await load();return Promise.all(records.map(async record=>{
      try{
        const stat=await fs.stat(record.fullPath);if(!stat.isFile())throw Error('File is unavailable.');
        const imagesAvailable=(await fs.stat(path.join(path.dirname(record.fullPath),'images')).catch(()=>null))?.isDirectory()||false;
        return {...record,size:stat.size,modified:stat.mtimeMs,unavailable:false,imagesAvailable};
      }catch(error){return {...record,unavailable:true,imagesAvailable:false,unavailableReason:error.code==='ENOENT'?'File moved or deleted.':error.message};}
    }));
  }
  function serial(fn){const result=queue.then(fn);queue=result.catch(()=>{});return result;}
  async function set(filePath,enabled){
    if(typeof filePath!=='string'||!path.isAbsolute(filePath))throw Error('An Append list entry must use an absolute file path.');
    await load();const previous=records;
    const entry=enabled?await metadata(filePath):null;
    const id=key(entry?.fullPath||filePath);
    records=records.filter(r=>key(r.fullPath)!==id);if(entry)records.push(entry);
    records.sort((a,b)=>a.name.localeCompare(b.name)||a.fullPath.localeCompare(b.fullPath));
    const temporary=file+'.'+randomUUID()+'.tmp';
    try{
      await fs.mkdir(path.dirname(file),{recursive:true});
      await fs.writeFile(temporary,JSON.stringify({version:1,projects:records},null,2),{flag:'wx'});await fs.rename(temporary,file);
    }catch(error){records=previous;await fs.unlink(temporary).catch(()=>{});throw error;}
    return list();
  }
  return {list:()=>serial(list),set:(...args)=>serial(()=>set(...args)),async find(filePath){const list=await this.list();return list.find(p=>key(p.fullPath)===key(filePath));}};
}
module.exports={createAppendListStore};
