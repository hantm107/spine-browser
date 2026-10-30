'use strict';

// Pure data operations. Both inputs must first be exported by the same Spine
// editor series. Version conversion belongs to Spine, never to this module.
const clone = value => structuredClone(value);
const imageSequences=require('./image-sequences');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const entries = value => Object.entries(value || {});
const groups = ['ik', 'transform', 'path', 'physics'];
function series(v) { const m = String(v || '').match(/^(\d+)\.(\d+)/); if (!m) throw Error('A Spine version is required.'); return [Number(m[1]), Number(m[2])]; }
function compareVersions(a, b) { const x = [...series(a),Number(String(a).split('.')[2])||0], y = [...series(b),Number(String(b).split('.')[2])||0]; return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]; }
function skinsOf(data) { return Array.isArray(data.skins) ? data.skins : entries(data.skins).map(([name, attachments]) => ({ name, attachments })); }
function canonicalizeDefaultAttachments(input) {
  const data=clone(input),skins=skinsOf(data),defaultSkin=skins.find(s=>s.name==='default'),renames=new Map();
  for(const [slot,values]of entries(defaultSkin?.attachments)){
    const names=new Map(),seen=new Set();
    for(const [key,attachment]of entries(values)){
      const actual=attachment.name||key;
      if(seen.has(actual))throw Error(`Duplicate default attachment name ${slot}/${actual}.`);
      seen.add(actual);if(key!==actual)names.set(key,actual);
    }
    if(names.size)renames.set(slot,names);
  }
  const nameFor=(slot,name)=>name==null?name:(renames.get(slot)?.get(name)||name);
  const renamedValues=(slot,values)=>{
    const result={};for(const [name,value]of entries(values)){const mapped=nameFor(slot,name);if(own(result,mapped))throw Error(`Attachment placeholder collision ${slot}/${mapped}.`);result[mapped]=value;}return result;
  };
  for(const skin of skins)for(const [slot,values]of entries(skin.attachments)){
    skin.attachments[slot]=renamedValues(slot,values);
    for(const attachment of Object.values(skin.attachments[slot]))if(attachment.parent)attachment.parent=nameFor(slot,attachment.parent);
  }
  for(const slot of data.slots||[])if(slot.attachment!=null)slot.attachment=nameFor(slot.name,slot.attachment);
  for(const animation of Object.values(data.animations||{})){
    for(const [slot,timelines]of entries(animation.slots))for(const frame of timelines.attachment||[])if(frame.name!=null)frame.name=nameFor(slot,frame.name);
    for(const section of ['deform','ffd','attachments'])for(const slots of Object.values(animation[section]||{}))for(const [slot,values]of entries(slots))slots[slot]=renamedValues(slot,values);
  }
  data.skins=Array.isArray(input.skins)?skins:Object.fromEntries(skins.map(s=>[s.name,s.attachments]));
  return data;
}
function verifySavedAttachmentKeys(expected,actual,animationName,group) {
  const input=expected.animations?.[animationName],saved=actual.animations?.[animationName];
  if(!input||!saved)throw Error(`Saved animation missing: ${animationName}`);
  const skins=skinsOf(actual);let namedKeys=0,totalKeys=0;
  for(const [slot,timelines]of entries(input.slots)){
    if(!timelines.attachment)continue;
    const keys=saved.slots?.[slot]?.attachment||[];
    if(keys.length!==timelines.attachment.length)throw Error(`Saved attachment key count changed for ${slot}.`);
    timelines.attachment.forEach((frame,i)=>{
      const other=keys[i];totalKeys++;
      if(Math.abs((frame.time||0)-(other.time||0))>.00011||(frame.name??null)!==(other.name??null))throw Error(`Saved attachment key changed at ${slot}, time ${frame.time||0}: expected ${frame.name??'null'}, got ${other.name??'null'}.`);
      if(frame.name!=null){namedKeys++;if(!skins.some(s=>own(s.attachments?.[slot],frame.name)))throw Error(`Saved attachment key references missing attachment ${slot}/${frame.name}.`);}
    });
  }
  for(const slot of expected.slots||[])if(group&&slot.name.startsWith(group+'_')){
    const savedSlot=(actual.slots||[]).find(s=>s.name===slot.name);
    if(!savedSlot||(slot.attachment??null)!==(savedSlot.attachment??null))throw Error(`Saved setup attachment changed for ${slot.name}.`);
  }
  return {totalKeys,namedKeys};
}
function safeName(value) {
  const name = String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw Error(`Invalid name: ${value}`);
  return name;
}
function nextGroup(main, prefix = 'ImportedMain') {
  if(typeof prefix!=='string'||!prefix.trim()||safeName(prefix)!==prefix)throw Error('Enter a valid import prefix without path separators.');
  const names=new Set(main.bones.map(b=>b.name.toLowerCase()));let n=1;
  while(names.has((prefix+(n===1?'':n)).toLowerCase()))n++;
  return prefix+(n===1?'':n);
}
function imageFolder(value) {
  if(typeof value!=='string'||!value.trim())throw Error('Enter an image subfolder name.');
  const normalized=value.replace(/\\/g,'/');
  if(normalized.split('/').some(part=>!part||part==='.'||part==='..'||safeName(part)!==part))throw Error('Use a relative image subfolder without parent paths or invalid filename characters.');
  return normalized;
}
// Bake one skin, including default fallbacks, into ordinary attachments. Linked
// mesh parents can come from another skin, so give hidden dependencies aliases
// rather than overwriting a visible attachment with the same placeholder.
function bakeSkin(source, selectedName) {
  const skins=skinsOf(source),byName=new Map(skins.map(s=>[s.name,s]));
  const selected=byName.get(selectedName),fallback=byName.get('default')||{name:'default',attachments:{}};
  if(!selected&&selectedName!=='default')throw Error(`Import skin not found: ${selectedName}`);
  const effective={name:'default',attachments:{}},aliases=new Map(),visiting=new Set();
  const keyFor=(skin,slot,name)=>JSON.stringify([skin,slot,name]);
  function add(skinName,slot,name,preferred) {
    const key=keyFor(skinName,slot,name);
    if(visiting.has(key))throw Error('A linked mesh contains a circular parent reference.');
    if(aliases.has(key)&&effective.attachments[slot]?.[aliases.get(key)]!==null)return aliases.get(key);
    const attachment=byName.get(skinName)?.attachments?.[slot]?.[name];
    if(!attachment)throw Error(`Missing linked mesh attachment ${skinName}/${slot}/${name}.`);
    const values=effective.attachments[slot] ||= {};
    let alias=aliases.get(key)||preferred||name,n=1;if(!aliases.has(key))while(own(values,alias))alias=`__dependency${n++}_${name}`;
    aliases.set(key,alias);visiting.add(key);
    const copy=clone(attachment);values[alias]=copy;
    copy.name=attachment.name||name;
    if(imagePaths(name,attachment).length)copy.path=attachment.path||attachment.name||name;
    if(copy.parent){copy.parent=add(copy.skin||'default',slot,copy.parent);copy.skin='default';}
    visiting.delete(key);return alias;
  }
  // Reserve all visible placeholders first, before inserting hidden parents.
  const visible=new Map();
  for(const skin of [fallback,...(selected&&selected!==fallback?[selected]:[])])for(const [slot,values]of entries(skin.attachments))for(const name of Object.keys(values))visible.set(JSON.stringify([slot,name]),skin.name);
  for(const [pair,skin]of visible){const [slot,name]=JSON.parse(pair);effective.attachments[slot] ||= {};effective.attachments[slot][name]=null;aliases.set(keyFor(skin,slot,name),name);}
  for(const [pair,skin]of visible){const [slot,name]=JSON.parse(pair);add(skin,slot,name,name);}
  for(const field of ['bones',...groups]){
    const names=[...new Set([...(fallback[field]||[]),...(selected?.[field]||[])])];if(names.length)effective[field]=names;
  }
  // Baking makes the chosen variant ordinary artwork. Its active skin bones
  // and constraints must remain active when Main switches to an existing skin.
  const activeBones=new Set(effective.bones||[]),boneLookup=new Map(source.bones.map(b=>[b.name,b]));
  for(const name of activeBones){const parent=boneLookup.get(name)?.parent;if(parent)activeBones.add(parent);}
  for(const bone of source.bones)if(activeBones.has(bone.name))delete bone.skin;
  for(const field of groups){const active=new Set(effective[field]||[]);for(const constraint of source[field]||[])if(active.has(constraint.name))delete constraint.skin;}
  for(const field of ['bones',...groups])delete effective[field];
  for(const animation of Object.values(source.animations||{}))for(const section of ['deform','ffd','attachments'])if(animation[section]){
    const remapped={};
    for(const [skin,slots]of entries(animation[section]))for(const [slot,values]of entries(slots))for(const [name,keys]of entries(values)){
      const alias=aliases.get(keyFor(skin,slot,name));if(!alias)continue;
      remapped[slot] ||= {};remapped[slot][alias]=keys;
    }
    animation[section]=Object.keys(remapped).length?{default:remapped}:{};
  }
  source.skins=[effective];return source;
}
function imagePaths(key, attachment) {
  if (!['region', 'mesh', 'linkedmesh', 'weightedmesh', 'skinnedmesh'].includes(attachment.type || 'region')) return [];
  const base = attachment.path || attachment.name || key;
  const seq = attachment.sequence;
  return seq ? Array.from({length: seq.count}, (_, i) => base + String((seq.start ?? 1) + i).padStart(seq.digits || 0, '0')) : [base];
}
function weightIndices(attachment, map) {
  const v = attachment.vertices;
  if (!Array.isArray(v)) return [];
  const count = attachment.uvs?.length ?? ((attachment.vertexCount || 0) * 2);
  if (!count || v.length === count) return [];
  const result = [];
  for (let i = 0; i < v.length;) {
    const n = v[i++];
    if (!Number.isInteger(n) || n < 1 || i + n * 4 > v.length) throw Error('Malformed weighted attachment.');
    for (let k = 0; k < n; k++, i += 4) {
      result.push(v[i]);
      if (map) { if (!map.has(v[i])) throw Error('Missing weighted bone dependency.'); v[i] = map.get(v[i]); }
    }
  }
  return result;
}
function dependencySet(data, animationName) {
  if (!own(data.animations, animationName)) throw Error('Select an animation from the Import project.');
  const animation = data.animations[animationName], skins = skinsOf(data);
  const bones = new Set(Object.keys(animation.bones || {})), slots = new Set(Object.keys(animation.slots || {}));
  const attachments = new Map(), constraints = Object.fromEntries(groups.map(g => [g, new Set(Object.keys(animation[g] || {}))]));
  for (const key of Object.keys(animation.paths || {})) constraints.path.add(key);
  const keyFor = (skin, slot, name) => JSON.stringify([skin, slot, name]);
  function addAttachment(skin, slot, name) {
    if (name == null) return;
    const a = skin.attachments?.[slot]?.[name];
    if (!a) return;
    attachments.set(keyFor(skin.name, slot, name), {skin: skin.name, slot, name, attachment: a});
    slots.add(slot);
  }
  for (const slot of data.slots || []) {
    const timeline = animation.slots?.[slot.name]?.attachment || [];
    const colorKeys = animation.slots?.[slot.name] || {};
    const neverVisible = !timeline.length && slot.color?.length === 8 && slot.color.slice(-2) === '00'
      && !['color','rgba','rgba2','alpha','twoColor'].some(key => colorKeys[key]?.length);
    const firstAtZero = timeline.length && (timeline[0].time || 0) === 0;
    const names = new Set(timeline.map(k => k.name).filter(n => n != null));
    if (!firstAtZero && slot.attachment != null) names.add(slot.attachment);
    if(!neverVisible)for (const skin of skins) for (const name of names) addAttachment(skin, slot.name, name);
  }
  for (const section of ['deform', 'ffd', 'attachments']) for (const [skinName, skSlots] of entries(animation[section])) {
    const skin = skins.find(s => s.name === skinName);
    if (!skin) throw Error(`Animation references missing skin ${skinName}.`);
    for (const [slot, values] of entries(skSlots)) for (const name of Object.keys(values)) {
      const resolved = skin.attachments?.[slot]?.[name] ? skin : skins.find(s => s.name === 'default');
      if (!resolved?.attachments?.[slot]?.[name]) throw Error(`Missing animated attachment ${slot}/${name}.`);
      addAttachment(resolved, slot, name);
    }
  }
  let previous = '';
  while (true) {
    const state = [bones.size, slots.size, attachments.size, ...groups.map(g => constraints[g].size)].join(':');
    if (state === previous) break; previous = state;
    for (const slot of data.slots || []) if (slots.has(slot.name)) bones.add(slot.bone);
    for (const bone of data.bones) if (bones.has(bone.name) && bone.parent) bones.add(bone.parent);
    for (const {skin, slot, attachment: a} of attachments.values()) {
      for (const i of weightIndices(a)) {
        if (!data.bones[i]) throw Error('Attachment refers to a nonexistent bone.');
        bones.add(data.bones[i].name);
      }
      if (a.parent) {
        const parentSkin = skins.find(s => s.name === (a.skin || 'default'));
        if (!parentSkin?.attachments?.[slot]?.[a.parent]) throw Error(`Missing linked mesh parent ${a.parent}.`);
        addAttachment(parentSkin, slot, a.parent);
      }
      if (a.end) slots.add(a.end);
    }
    for (const g of groups) for (const c of data[g] || []) {
      const controlled = c.bones || (c.bone ? [c.bone] : []);
      if (constraints[g].has(c.name) || controlled.some(b => bones.has(b))) {
        constraints[g].add(c.name);
        controlled.forEach(b => bones.add(b));
        if (c.target) (g === 'path' ? slots : bones).add(c.target);
        if (g === 'path') for (const skin of skins) for (const [name, a] of entries(skin.attachments?.[c.target])) if (a.type === 'path') addAttachment(skin, c.target, name);
      }
    }
    // Clipping affects rendering without being directly keyed.
    for (const skin of skins) for (const [slot, values] of entries(skin.attachments)) for (const [name, a] of entries(values)) {
      if (a.type === 'clipping' && (slots.has(slot) || (a.end && slots.has(a.end)))) addAttachment(skin, slot, name);
    }
  }
  for (const name of bones) if (!data.bones.some(b => b.name === name)) throw Error(`Missing bone ${name}.`);
  for (const name of slots) if (!(data.slots || []).some(s => s.name === name)) throw Error(`Missing slot ${name}.`);
  return {animation, skins, bones, slots, attachments, constraints};
}
function buildMerge(mainInput, sourceInput, options = {}) {
  const main = clone(mainInput);
  const createSkins=options.createSkins!==false,selectedSkin=options.sourceSkin||'default';
  const source=createSkins?clone(sourceInput):bakeSkin(clone(sourceInput),selectedSkin);
  if (series(main.skeleton?.spine).join('.') !== series(source.skeleton?.spine).join('.')) throw Error('Convert both skeletons using the Main project editor version before merging.');
  if (!main.bones?.length || !source.bones?.length) throw Error('Both projects must contain a root bone.');
  const prefix=options.prefix??'ImportedMain',folder=(options.useImageFolder??Boolean(options.imageFolder))?imageFolder(options.imageFolder):'';
  if(options.animations!==undefined&&!Array.isArray(options.animations))throw Error('Choose one or more animations from the Import project.');
  const selected=[...new Set(options.animations??[options.animation])];
  if(!selected.length)throw Error('Choose at least one animation to import.');
  if(selected.length>1&&options.animationName?.trim())throw Error('Use the animation mapping rows to name multiple animations.');
  const dependencies=selected.map(name=>dependencySet(source,name)),dep=dependencies[0];
  for(const other of dependencies.slice(1)){
    for(const field of ['bones','slots'])for(const name of other[field])dep[field].add(name);
    for(const [key,value]of other.attachments)dep.attachments.set(key,value);
    for(const g of groups)for(const name of other.constraints[g])dep.constraints[g].add(name);
  }
  const group = nextGroup(main,prefix), rows = [], animationNames=[],animations=[];
  for(const name of selected){
    const result=String(options.overrides?.[`animation:${name}`]??(selected.length===1&&options.animationName||`${group}_${name}`)).trim();
    if(!result||own(main.animations,result)||animationNames.includes(result))throw Error('The new animation names must be nonempty and unique.');
    animationNames.push(result);animations.push({source:name,result});
  }
  const animationName=animationNames[0];
  const supported = new Set(['bones','slots','ik','transform','path','paths','physics','deform','ffd','attachments','drawOrder','draworder','events']);
  for(const name of selected)for (const key of Object.keys(source.animations[name])) if (!supported.has(key)) throw Error(`Unsupported animation timeline: ${key}`);
  const used = new Map();
  function rename(type, id, original, fallback) {
    const rule = options.rename || {};
    let proposed = original;
    if (['bone','attachment'].includes(type) && rule.find) proposed = rule.regex ? proposed.replace(new RegExp(rule.find, rule.matchCase ? 'g' : 'gi'), rule.replace || '') : proposed.replace(new RegExp(rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), rule.matchCase ? 'g' : 'gi'), rule.replace || '');
    const value = options.overrides?.[id] ?? safeName(fallback(proposed));
    if (safeName(value) !== value) throw Error(`Invalid ${type} name: ${value}`);
    const namespace = type === 'attachment' ? 'image' : type;
    const key = namespace + ':' + value.toLowerCase();
    if (used.has(key)) throw Error(`Name collision: ${value}`);
    used.set(key, id); rows.push({id, type, original, result:value}); return value;
  }
  const boneMap = new Map(source.bones.filter(b => dep.bones.has(b.name)).map(b => [b.name, rename('bone', `bone:${b.name}`, b.name, n => `${group}_${n}`)]));
  const slotMap = new Map((source.slots || []).filter(s => dep.slots.has(s.name)).map(s => [s.name, `${group}_${safeName(s.name)}`]));
  const skinMap = new Map(dep.skins.map(s => [s.name, createSkins?`${group}_${safeName(s.name)}`:'default']));
  const constraintMaps = Object.fromEntries(groups.map(g => [g, new Map((source[g] || []).filter(c => dep.constraints[g].has(c.name)).map(c => [c.name, `${group}_${safeName(c.name)}`]))]));
  const eventNames = new Set(selected.flatMap(name=>(source.animations[name].events||[]).map(e=>e.name)));
  const eventMap = new Map([...eventNames].map(n => [n, `${group}_${safeName(n)}`]));
  const placeholderMap = new Map(), attachmentMap = new Map();
  for (const [id, a] of dep.attachments) {
    const key = JSON.stringify([a.slot, a.name]);
    if (!placeholderMap.has(key)) placeholderMap.set(key, `${group}_${safeName(a.slot)}_${safeName(a.name)}`);
    const aliasPrefix=!createSkins&&a.name!==(a.attachment.name||a.name)?`${safeName(a.name)}_`:'';
    const name = rename('attachment', `attachment:${id}`, a.attachment.name || a.name, n => `${group}_${safeName(a.skin)}_${safeName(a.slot)}_${aliasPrefix}${n}`);
    attachmentMap.set(id, name);
  }
  // Reject collisions against Main names even when the user supplies overrides.
  const rejectExisting = (values, existing, type) => { const seen = new Set(existing.map(v => v.toLowerCase())); for (const v of values) { if (seen.has(v.toLowerCase())) throw Error(`${type} already exists: ${v}`); seen.add(v.toLowerCase()); } };
  rejectExisting([...boneMap.values(), group], main.bones.map(b => b.name), 'Bone');
  rejectExisting([...slotMap.values()], (main.slots || []).map(s => s.name), 'Slot');
  if(createSkins)rejectExisting([...skinMap.values()], skinsOf(main).map(s => s.name), 'Skin');
  rejectExisting([...attachmentMap.values()], skinsOf(main).flatMap(s=>Object.values(s.attachments||{}).flatMap(as=>entries(as).map(([key,a])=>a.name||key))), 'Attachment');
  for (const g of groups) rejectExisting([...constraintMaps[g].values()], (main[g] || []).map(c => c.name), 'Constraint');
  rejectExisting([...eventMap.values()], Object.keys(main.events || {}), 'Event');
  const root = main.bones.find(b => !b.parent);
  if (!root) throw Error('Main has no root bone.');
  main.bones.push({name:group, parent:root.name, x:1000});
  const boneIndices = new Map();
  source.bones.forEach((b, i) => { if (boneMap.has(b.name)) { boneIndices.set(i, main.bones.length); main.bones.push({...b, name:boneMap.get(b.name), parent:b.parent ? boneMap.get(b.parent) : group}); } });
  const placeholder = (slot, name) => name == null ? name : placeholderMap.get(JSON.stringify([slot, name]));
  for (const s of source.slots || []) if (slotMap.has(s.name)) {
    const copy = {...s, name:slotMap.get(s.name), bone:boneMap.get(s.bone)};
    if (s.attachment != null) copy.attachment = placeholder(s.name, s.attachment) || null;
    main.slots ||= []; main.slots.push(copy);
  }
  const maxOrder = Math.max(-1, ...groups.flatMap(g => (main[g] || []).map(c => c.order || 0)));
  const ordered = groups.flatMap(g => (source[g] || []).filter(c => constraintMaps[g].has(c.name)).map(c => ({g, c}))).sort((a,b) => (a.c.order || 0) - (b.c.order || 0));
  ordered.forEach(({g,c}, i) => {
    const copy = {...c, name:constraintMaps[g].get(c.name), order:maxOrder+1+i};
    if (c.bones) copy.bones = c.bones.map(n => boneMap.get(n));
    if (c.bone) copy.bone = boneMap.get(c.bone);
    if (c.target) copy.target = (g === 'path' ? slotMap : boneMap).get(c.target);
    main[g] ||= []; main[g].push(copy);
  });
  const targetSkins = skinsOf(main), files = [], importedSkins = [], fallbackCopies=[];
  for (const skin of dep.skins) {
    const output = {...skin, name:skinMap.get(skin.name), attachments:{}};
    if (skin.bones) output.bones = skin.bones.filter(n => boneMap.has(n)).map(n => boneMap.get(n));
    for (const g of groups) if (skin[g]) output[g] = skin[g].filter(n => constraintMaps[g].has(n)).map(n => constraintMaps[g].get(n));
    for (const [id, a] of dep.attachments) if (a.skin === skin.name) {
      const copy = clone(a.attachment), display = attachmentMap.get(id), place = placeholder(a.slot, a.name);
      copy.name = display;
      const paths = imagePaths(a.name, copy);
      if (paths.length) {
        const before = imagePaths(a.name, a.attachment);
        copy.path = folder?`${folder}/${display}`:display;
        imagePaths(place, copy).forEach((name, i) => files.push({source:before[i], destination:name, attachment:display, skin:output.name,slot:slotMap.get(a.slot)}));
      }
      if (copy.parent) {
        const parentId = JSON.stringify([copy.skin || 'default', a.slot, copy.parent]);
        copy.parent = placeholder(a.slot, copy.parent);
        if (!attachmentMap.has(parentId)) throw Error('Linked mesh parent is missing from the import.');
        if (copy.skin) copy.skin = skinMap.get(copy.skin);
      }
      if (copy.end) copy.end = slotMap.get(copy.end);
      weightIndices(copy, boneIndices);
      output.attachments[slotMap.get(a.slot)] ||= {};
      output.attachments[slotMap.get(a.slot)][place] = copy;
    }
    importedSkins.push(output);
  }
  let defaultSkin = targetSkins.find(s => s.name === 'default');
  if (!defaultSkin) { defaultSkin = {name:'default',attachments:{}}; targetSkins.unshift(defaultSkin); }
  defaultSkin.attachments ||= {};
  const importedDefault = importedSkins.find(s => s.name === skinMap.get('default'));
  if (!createSkins&&importedDefault) Object.assign(defaultSkin.attachments, clone(importedDefault.attachments));
  // Skin placeholders and ordinary default attachments cannot share a name in
  // the editor. Keep skin imports entirely in their new skins. Each variant
  // receives source-default fallbacks with distinct actual attachment names.
  if(createSkins&&importedDefault)for(const skin of importedSkins)if(skin!==importedDefault){
    for(const [slot,values]of entries(importedDefault.attachments))for(const [key,a]of entries(values)){
      if(own(skin.attachments?.[slot],key))continue;
      const copy=clone(a),oldName=copy.name,newName=safeName(`${skin.name}_fallback_${oldName}`);
      copy.name=newName;
      const originalFiles=files.filter(f=>f.attachment===oldName&&f.skin===importedDefault.name);
      if(originalFiles.length){copy.path=folder?`${folder}/${newName}`:newName;const destinations=imagePaths(key,copy);originalFiles.forEach((f,i)=>files.push({...f,destination:destinations[i],attachment:newName,skin:skin.name}));}
      if(copy.parent&&!copy.skin)copy.skin=importedDefault.name;
      skin.attachments[slot] ||= {};skin.attachments[slot][key]=copy;
      fallbackCopies.push({skin:skin.name,slot,key});
    }
  }
  if(!createSkins&&importedDefault)for(const field of ['bones',...groups])if(importedDefault[field]?.length)defaultSkin[field]=[...new Set([...(defaultSkin[field]||[]),...importedDefault[field]])];
  const resultSkins=createSkins?[...targetSkins,...importedSkins]:targetSkins;
  main.skins = Array.isArray(mainInput.skins) ? resultSkins : Object.fromEntries(resultSkins.map(s => [s.name,s.attachments]));
  for(const {source:sourceName,result:outputName}of animations){
  const animation = clone(source.animations[sourceName]);
  const remapKeys = (object, map) => Object.fromEntries(entries(object).map(([name,value]) => { if (!map.has(name)) throw Error(`Unresolved animation reference: ${name}`); return [map.get(name), value]; }));
  if (animation.bones) animation.bones = remapKeys(animation.bones, boneMap);
  if (animation.slots) {
    for (const [slot, timelines] of entries(animation.slots)) if (timelines.attachment) for (const key of timelines.attachment) {
      if (key.name != null) { const name = placeholder(slot,key.name); if (!name) throw Error(`Unresolved attachment key ${slot}/${key.name}.`); key.name = name; }
    }
    animation.slots = remapKeys(animation.slots, slotMap);
  }
  for (const g of groups) if (animation[g]) {
    if (g === 'physics' && own(animation[g], '')) {
      const global = animation[g]['']; delete animation[g][''];
      for(const constraint of source.physics||[])if(constraintMaps.physics.has(constraint.name))for(const [type,keys]of entries(global)) {
        if(type!=='reset'&&!constraint[type+'Global'])continue;
        animation.physics[constraint.name] ||= {};
        if(animation.physics[constraint.name][type])throw Error(`Overlapping global and local physics ${type} keys on ${constraint.name} cannot be merged safely.`);
        animation.physics[constraint.name][type]=clone(keys);
      }
    }
    animation[g] = remapKeys(animation[g], constraintMaps[g]);
  }
  if (animation.paths) animation.paths = remapKeys(animation.paths, constraintMaps.path);
  for (const section of ['deform','ffd','attachments']) if (animation[section]) {
    animation[section] = Object.fromEntries(entries(animation[section]).map(([skin, slots]) => [skinMap.get(skin), Object.fromEntries(entries(slots).map(([slot, values]) => [slotMap.get(slot), Object.fromEntries(entries(values).map(([name, value]) => [placeholder(slot,name), value]))]))]));
    // The source default skin is available both as a prefixed selectable skin
    // and through Main's default fallback. Deform/sequence timelines identify
    // attachments by skin, so both instances need the original keys.
    if(!createSkins&&animation[section][skinMap.get('default')])animation[section].default=clone(animation[section][skinMap.get('default')]);
    for(const fallback of fallbackCopies){
      const keys=animation[section][skinMap.get('default')]?.[fallback.slot]?.[fallback.key];if(!keys)continue;
      animation[section][fallback.skin] ||= {};animation[section][fallback.skin][fallback.slot] ||= {};animation[section][fallback.skin][fallback.slot][fallback.key]=clone(keys);
    }
  }
  // Recompute draw-order permutations after pruning source slots; offsets from
  // the original slot array cannot be copied verbatim into the merged skeleton.
  for (const section of ['drawOrder','draworder']) if (animation[section]) {
    const original = (source.slots || []).map(s => s.name), kept = original.filter(n => slotMap.has(n));
    animation[section] = animation[section].map(frame => {
      const order = Array(original.length).fill(null), unchanged = []; let cursor = 0;
      for (const offset of frame.offsets || []) {
        const index = original.indexOf(offset.slot); if (index < cursor) throw Error('Invalid source draw order.');
        while (cursor < index) unchanged.push(cursor++);
        const destination = cursor + offset.offset;
        if (destination < 0 || destination >= order.length || order[destination] != null) throw Error('Invalid draw-order offset.');
        order[destination] = cursor++;
      }
      while (cursor < original.length) unchanged.push(cursor++);
      for (let i = order.length-1; i >= 0; i--) if (order[i] == null) order[i] = unchanged.pop();
      const desired = order.map(i => original[i]).filter(n => slotMap.has(n));
      return {...frame, offsets:kept.map((slot,i) => ({slot:slotMap.get(slot),offset:desired.indexOf(slot)-i})).filter(x => x.offset)};
    });
  }
  if (animation.events) for (const event of animation.events) event.name = eventMap.get(event.name);
  main.animations ||= {}; main.animations[outputName] = animation;
  }
  const audio=[];
  for (const [name, mapped] of eventMap) {
    main.events ||= {}; main.events[mapped] = clone(source.events?.[name] || {});
    if(main.events[mapped].audio){const original=main.events[mapped].audio,destination=`${group}_${safeName(original)}`;audio.push({source:original,destination});main.events[mapped].audio=destination;}
  }
  if(animations.length>1)for(const item of animations)rows.push({id:`animation:${item.source}`,type:'animation',original:item.source,result:item.result});
  main.skeleton = {...main.skeleton, images:'./images/'}; delete main.skeleton.hash;
  const previewSkin=createSkins?(skinMap.get(selectedSkin)||importedSkins[0]?.name||'default'):'default';
  const result={data:canonicalizeDefaultAttachments(main), group, prefix, imageFolder:folder, createSkins, previewSkin, sourceSkin:createSkins?null:selectedSkin, animationName,animationNames,animations, rows, files, audio, skinNames:createSkins?importedSkins.map(s => s.name):[], stats:{animations:animations.length,bones:boneMap.size, slots:slotMap.size, attachments:dep.attachments.size+fallbackCopies.length, images:files.length, skins:createSkins?importedSkins.length:0}};
  return renameImageSequences(result,options.sequenceRenames||{},options.replaceSequenceNames===true);
}
function renameImageSequences(result,requestedRules,automatic){
  const definitions=skinsOf(result.data).flatMap(skin=>Object.entries(skin.attachments||{}).flatMap(([slot,values])=>Object.entries(values).filter(([,a])=>a.sequence).map(([key,a])=>({skin:skin.name,name:a.name,owner:JSON.stringify([slot,key])}))));
  const detected=imageSequences.detect(result.files,definitions,result.group,result.rows),byId=new Map(detected.map(g=>[g.id,g])),renames=new Map();
  const keyFor=(skin,name)=>JSON.stringify([skin,name]);
  const rules={...requestedRules};
  if(automatic){
    const occupied=new Set(skinsOf(result.data).flatMap(skin=>Object.values(skin.attachments||{}).flatMap(values=>Object.entries(values).map(([key,a])=>(a.name||key).toLowerCase()))));
    for(const [id,rule]of Object.entries(rules))if(rule&&byId.has(id)){const group=byId.get(id),names=imageSequences.names(group,rule);for(const name of group.native?[names.attachmentBase,...names.files]:names.files)occupied.add(name.toLowerCase());}
    let index=1;
    for(const group of detected)if(group.canRename&&!own(rules,group.id)){
      let rule,names,candidates;
      do{rule={prefix:`Sequence${index++}_`,suffix:'',start:1,padding:3};names=imageSequences.names(group,rule);candidates=group.native?[names.attachmentBase,...names.files]:names.files;}while(candidates.some(name=>occupied.has(name.toLowerCase())));
      rules[group.id]=rule;group.defaultPrefix=rule.prefix;for(const name of candidates)occupied.add(name.toLowerCase());
    }
  }
  for(const [id,rule]of Object.entries(rules)){
    const group=byId.get(id);if(!group)throw Error('Image sequence groups changed. Clear the sequence settings and review the import again.');
    if(rule===null)continue;
    const renamed=imageSequences.names(group,rule);group.applied=true;
    group.frames.forEach((frame,i)=>{
      for(const use of frame.uses){
        const key=keyFor(use.skin,use.attachment),name=group.native?renamed.attachmentBase:renamed.files[i];
        const prior=renames.get(key);if(prior&&prior.name!==name)throw Error('An attachment belongs to conflicting image sequences.');
        renames.set(key,{name,group:id,source:frame.source,native:group.native,start:renamed.start,padding:renamed.padding});
        const file=result.files[use.fileIndex],slash=file.destination.lastIndexOf('/');
        file.destination=(slash<0?'':file.destination.slice(0,slash+1))+renamed.files[i];file.attachment=name;file.sequenceGroup=id;
        frame.destination=file.destination;
      }
    });
  }
  if(renames.size){
    const occupied=new Set(),newNames=new Map();
    for(const skin of skinsOf(result.data))for(const values of Object.values(skin.attachments||{}))for(const [key,a]of Object.entries(values))if(!renames.has(keyFor(skin.name,a.name||key)))occupied.add((a.name||key).toLowerCase());
    for(const {name,group,source}of renames.values()){
      const lower=name.toLowerCase(),identity=JSON.stringify([group,source]);if(occupied.has(lower)||(newNames.has(lower)&&newNames.get(lower)!==identity))throw Error(`Sequence attachment name collision: ${name}. Choose a different new name or suffix.`);newNames.set(lower,identity);
    }
    const destinations=new Map(),unique=[],indexes=new Map();
    result.files.forEach((file,index)=>{
      const name=file.destination.toLowerCase(),existing=destinations.get(name);
      if(existing){
        if(!file.sequenceGroup||existing.file.source.replace(/\\/g,'/')!==file.source.replace(/\\/g,'/')||existing.file.sequenceGroup!==file.sequenceGroup)throw Error(`Sequence image filename collision: ${file.destination}.`);
        indexes.set(index,existing.index);
      }else{const i=unique.length;unique.push(file);destinations.set(name,{file,index:i});indexes.set(index,i);}
    });
    result.files=unique;result.stats.images=unique.length;
    for(const group of detected)for(const frame of group.frames){frame.fileIndex=indexes.get(frame.fileIndex);for(const use of frame.uses)use.fileIndex=indexes.get(use.fileIndex);}
    for(const skin of skinsOf(result.data))for(const values of Object.values(skin.attachments||{}))for(const [key,a]of Object.entries(values)){
      const rename=renames.get(keyFor(skin.name,a.name||key));if(!rename)continue;
      a.name=rename.name;if(a.path!=null)a.path=(a.path.includes('/')?a.path.slice(0,a.path.lastIndexOf('/')+1):'')+rename.name;
      if(rename.native){a.sequence.start=rename.start;a.sequence.digits=rename.padding;}
    }
    const rowNames=new Map([...renames.entries()].map(([key,value])=>[JSON.parse(key)[1],value]));
    for(const row of result.rows)if(row.type==='attachment'&&rowNames.has(row.result)){const value=rowNames.get(row.result);row.result=value.name;row.sequenceGroup=value.group;}
    // Default attachment keys are actual names in Spine. This also updates
    // setup, attachment/deform keys, and linked-mesh parents without retiming.
    result.data=canonicalizeDefaultAttachments(result.data);
  }
  result.sequenceGroups=detected;result.sequenceRenames=rules;return result;
}
module.exports = {buildMerge, dependencySet, compareVersions, nextGroup, imagePaths, skinsOf, safeName, validateImageFolder:imageFolder, canonicalizeDefaultAttachments, verifySavedAttachmentKeys};
