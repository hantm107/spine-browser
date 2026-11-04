// Shared detection and filename preview for the importer and its review UI.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ImageSequences=factory();})(typeof window==='undefined'?globalThis:window,()=>{
  const basename=value=>value.replace(/\\/g,'/').split('/').at(-1);
  function detect(files,nativeAttachments,importGroup,rows=[]){
    const native=new Map(nativeAttachments.map(a=>[JSON.stringify([a.skin,a.name]),a]));
    const rowIds=new Map(rows.filter(r=>r.type==='attachment').map(r=>[r.result,r.id])),groups=new Map();
    files.forEach((file,fileIndex)=>{
      const source=file.source.replace(/\\/g,'/'),name=basename(source),match=name.match(/^(.*?)(\d+)(\D*)$/);
      if(!match)return;
      const folder=source.slice(0,source.length-name.length),sequence=native.get(JSON.stringify([file.skin,file.attachment]));
      const id=JSON.stringify([file.skin,folder,match[1],match[3],sequence?(sequence.owner||rowIds.get(file.attachment)||file.attachment):'images']);
      if(!groups.has(id))groups.set(id,{id,skin:file.skin,folder,prefix:match[1],suffix:match[3],native:!!sequence,nativeAttachment:sequence?.name,frames:[]});
      const frames=groups.get(id).frames,use={...file,fileIndex},existing=frames.find(frame=>frame.source===source);
      if(existing)existing.uses.push(use);
      else frames.push({...file,source,defaultDestination:file.destination,fileIndex,number:match[2],uses:[use]});
    });
    return [...groups.values()].filter(g=>new Set(g.frames.map(f=>f.source)).size>1).sort((a,b)=>a.id.localeCompare(b.id)).map((group,index)=>{
      group.frames.sort((a,b)=>{const x=BigInt(a.number),y=BigInt(b.number);return x<y?-1:x>y?1:a.source.localeCompare(b.source)||a.destination.localeCompare(b.destination);});
      const numbers=group.frames.map(f=>BigInt(f.number));
      group.hasGaps=numbers.some((n,i)=>i>0&&n>numbers[i-1]+1n);
      group.canRename=new Set(numbers.map(String)).size===numbers.length;
      group.reason=group.canRename?'':'Different source images have the same frame number. Rename these attachments individually to avoid merging distinct images.';
      const sameSlotConflict=group.frames.some(frame=>{const slots=new Set();for(const use of frame.uses){if(!use.slot)continue;if(slots.has(use.slot))return true;slots.add(use.slot);}return false;});
      if(sameSlotConflict){group.canRename=false;group.reason='The same image has multiple distinct attachments in one slot. Rename these attachments individually to keep them separate.';}
      group.useCount=group.frames.reduce((count,frame)=>count+frame.uses.length,0);group.slotCount=new Set(group.frames.flatMap(frame=>frame.uses.map(use=>use.slot).filter(Boolean))).size;
      group.defaultPrefix=`Sequence${index+1}_`;group.defaultSuffix='';
      return group;
    });
  }
  function names(group,rule){
    if(!group.canRename)throw Error(group.reason);
    if(typeof rule.prefix!=='string'||typeof rule.suffix!=='string'||/[<>:"/\\|?*\x00-\x1f]/.test(rule.prefix+rule.suffix))throw Error('Sequence name and suffix must not contain path separators or invalid filename characters.');
    const start=Number(rule.start),padding=Number(rule.padding);
    if(rule.start===''||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(start+group.frames.length-1))throw Error('Sequence starting number must be a nonnegative whole number within the safe integer range.');
    if(rule.padding===''||!Number.isInteger(padding)||padding<0||padding>12)throw Error('Sequence zero padding must be a whole number from 0 to 12.');
    const base=rule.prefix+rule.suffix;
    if(group.native&&!base)throw Error('A Spine sequence needs a nonempty shared name before its frame number.');
    const result=group.frames.map((_,i)=>group.native?base+String(start+i).padStart(padding,'0'):rule.prefix+String(start+i).padStart(padding,'0')+rule.suffix);
    for(const name of [...result,...(group.native?[base]:[])])if(!name||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error(`Invalid sequence filename: ${name}`);
    return {files:result,attachmentBase:group.native?base:null,start,padding};
  }
  return {detect,names,basename};
});
