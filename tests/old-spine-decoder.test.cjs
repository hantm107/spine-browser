const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {decode,normalize32}=require('../old-spine-decoder');
const fixture=(series,extension)=>fs.readFileSync(path.join(__dirname,'fixtures',series,`spineboy-pro.${extension}`));

test('2.x binary readers preserve weighted meshes, FFD, events and flip timelines',()=>{
  for (const series of ['2.0','2.1']) {
    const data=decode(fixture(series,'skel'),series), reference=JSON.parse(fixture(series,'json'));
    assert.deepEqual(data.skins.default.mesh.quad.vertices,reference.skins.default.mesh.quad.vertices);
    assert.equal(data.skins.default.mesh.quad.type,'skinnedmesh');
    assert.deepEqual(data.animations.idle.bones.root,reference.animations.idle.bones.root);
    assert.deepEqual(data.animations.idle.events,reference.animations.idle.events);
    assert.deepEqual(data.animations.idle.ffd.default.mesh.quad[1],{offset:0,...reference.animations.idle.ffd.default.mesh.quad[1]});
    assert.throws(()=>decode(fixture(series,'skel').subarray(0,60),series),/Truncated|Invalid/);
    assert.throws(()=>decode(fixture(series,'skel'),series==='2.0'?'2.1':'2.0'),/header/);
  }
});

test('3.0 and 3.1 layouts preserve mesh weights, timelines, draw order and signed events',()=>{
  for (const series of ['3.0','3.1']) {
    const data=decode(fixture(series,'skel'),series);
    const reference=normalize32(JSON.parse(fixture(series,'json')));
    assert.deepEqual(data.skins.default.mesh.quad.vertices,reference.skins.default.mesh.quad.vertices);
    assert.deepEqual(data.animations.idle.drawOrder,reference.animations.idle.drawOrder.map(f=>({...f,offsets:f.offsets||[]})));
    assert.deepEqual(data.animations.idle.events,reference.animations.idle.events);
    assert.deepEqual(data.animations.idle.bones.root,reference.animations.idle.bones.root);
    assert.equal(data.bones[1].x,30);
    assert.equal(data.transform.length,series==='3.0'?0:1);
    if(series==='3.1') assert.equal(data.transform[0].translateMix,0.125);
    assert.throws(()=>decode(fixture(series,'skel').subarray(0,60),series),/Truncated|Invalid/);
  }
});

test('3.3 reference layout preserves mesh geometry and path-compatible constraints',()=>{
  const data=decode(fixture('3.3','skel'),'3.3');
  const reference=JSON.parse(fixture('3.3','json'));
  assert.equal(data.bones.length,reference.bones.length);
  assert.deepEqual(Object.keys(data.animations),Object.keys(reference.animations));
  assert.equal(data.skeleton.spine,'3.3.07');
});

test('3.5 binary preserves transform modes, order and geometry from the official JSON export',()=>{
  const data=decode(fixture('3.5','skel'),'3.5');
  const reference=JSON.parse(fixture('3.5','json'));
  assert.equal(data.skeleton.spine,reference.skeleton.spine);
  assert.equal(data.bones.length,reference.bones.length);
  for(let i=0;i<data.bones.length;i++) {
    assert.equal(data.bones[i].transform,reference.bones[i].transform || 'normal');
    assert.ok(Math.abs(data.bones[i].x-(reference.bones[i].x||0))<0.011);
  }
  assert.deepEqual(Object.keys(data.animations),Object.keys(reference.animations));
});

test('3.2 decoding preserves weighted meshes, old timeline IDs, FFD, curves and signed events',()=>{
  const data=decode(fixture('3.2','skel'),'3.2');
  assert.equal(data.skeleton.spine,'3.2.01');
  assert.equal(data.bones[1].parent,'root');
  assert.equal(data.bones[1].shearX,5);
  assert.equal(data.bones[1].shearY,-2);
  assert.equal(data.ik[0].bendPositive,false);
  assert.equal(data.transform[0].rotateMix,0);
  assert.equal(data.transform[0].translateMix,0.125);
  assert.equal(data.skins.default.mesh.quad.type,'mesh');
  assert.equal(data.skins.default.mesh.linked.type,'linkedmesh');
  assert.deepEqual(data.skins.default.mesh.quad.vertices.slice(0,5),[1,0,-32,-32,1]);
  assert.deepEqual(data.animations.idle.bones.root.rotate[0].curve,[0.25,0,0.75,1]);
  assert.equal(data.animations.idle.bones.root.scale[1].x,1.25);
  assert.equal(data.animations.idle.slots.mesh.color[0].curve,'stepped');
  assert.deepEqual(data.animations.idle.deform.default.mesh.quad[1].vertices,[3,4]);
  assert.equal(data.animations.idle.drawOrder[1].offsets[0].offset,1);
  assert.equal(data.animations.idle.events[0].int,-9);
  assert.equal(data.animations.idle.events[0].string,'zap');
});

test('normalizing 3.2 JSON preserves original data and converts earlier mesh/constraint names',()=>{
  const input=JSON.parse(fixture('3.2','json'));
  const normalized=normalize32(input);
  assert.equal(input.skins.default.mesh.quad.type,'weightedmesh');
  assert.equal(normalized.skins.default.mesh.quad.type,'mesh');
  assert.deepEqual(normalized.transform[0].bones,['tip']);
  assert.ok(normalized.animations.idle.deform);
  assert.equal(normalized.skeleton.spine,'3.2.01');
});

test('3.4 binary mesh geometry and animation match the official JSON export',()=>{
  const decoded=decode(fixture('3.4','skel'),'3.4');
  const json=JSON.parse(fixture('3.4','json'));
  assert.equal(decoded.skeleton.spine,json.skeleton.spine);
  assert.deepEqual(decoded.bones.map(b=>b.name),json.bones.map(b=>b.name));
  assert.deepEqual(Object.keys(decoded.animations),Object.keys(json.animations));
  for(const [skinName,skin]of Object.entries(json.skins))for(const [slotName,slot]of Object.entries(skin))for(const [name,attachment]of Object.entries(slot)){
    if(!attachment.uvs)continue;
    const actual=decoded.skins[skinName][slotName][name];
    assert.deepEqual(actual.triangles,attachment.triangles);
    assert.equal(actual.vertices.length,attachment.vertices.length);
    assert.ok(actual.vertices.every((value,i)=>Math.abs(value-attachment.vertices[i])<0.002));
  }
});

test('truncated or misidentified older binary files produce an error',()=>{
  for(const series of ['3.2','3.4']){
    const buffer=fixture(series,'skel');
    assert.throws(()=>decode(buffer.subarray(0,buffer.length-4),series),/Truncated|invalid/i);
    assert.throws(()=>decode(buffer,series==='3.2'?'3.4':'3.2'),/header/);
  }
});

test('3.4 path lengths and constraint data match the official vine export',()=>{
  const dir=path.join(__dirname,'fixtures/3.4/vine');
  const data=decode(fs.readFileSync(path.join(dir,'vine.skel')),'3.4');
  const json=JSON.parse(fs.readFileSync(path.join(dir,'vine.json')));
  assert.deepEqual(data.path.map(p=>p.name),json.path.map(p=>p.name));
  for(const [skinName,skin]of Object.entries(json.skins))for(const [slotName,slot]of Object.entries(skin))for(const [name,attachment]of Object.entries(slot)){
    if(attachment.type!=='path')continue;
    const actual=data.skins[skinName][slotName][name];
    assert.equal(actual.lengths.length,attachment.lengths.length);
    // The JSON export stores path lengths to two decimal places.
    assert.ok(actual.lengths.every((n,i)=>Math.abs(n-attachment.lengths[i])<0.011));
  }
});
