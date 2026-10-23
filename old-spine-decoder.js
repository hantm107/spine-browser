/* Spine 3.0-3.5 binary layouts, based on the archived official Java and C#
 * readers listed in vendor/README.md. Decodes to an in-memory JSON skeleton;
 * source files are never changed. See vendor/LICENSE.spine-* for source licenses. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OldSpineDecoder = api;
})(typeof window === 'undefined' ? globalThis : window, () => {
  class Reader {
    constructor(bytes) {
      this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
      this.offset = 0;
    }
    need(size) {
      if (!Number.isInteger(size) || size < 0 || this.offset + size > this.bytes.length) throw new Error('Truncated or invalid older Spine binary.');
    }
    byte() { this.need(1); return this.bytes[this.offset++]; }
    bool() { return this.byte() !== 0; }
    signedByte() { const value = this.byte(); return value > 127 ? value - 256 : value; }
    int(positive = true) {
      let value = 0;
      for (let i = 0; i < 5; i++) {
        const byte = this.byte();
        value |= (byte & 127) << (7 * i);
        if (!(byte & 128)) return positive ? value >>> 0 : (value >>> 1) ^ -(value & 1);
      }
      throw new Error('Invalid Spine binary integer.');
    }
    count() { const value = this.int(); if (value > this.bytes.length) throw new Error('Invalid Spine binary count.'); return value; }
    float() { this.need(4); const value = this.view.getFloat32(this.offset); this.offset += 4; if (!Number.isFinite(value)) throw new Error('Invalid Spine binary number.'); return value; }
    color() { this.need(4); const value = this.view.getUint32(this.offset).toString(16).padStart(8, '0'); this.offset += 4; return value; }
    string() {
      const size = this.int();
      if (!size) return null;
      this.need(size - 1);
      const value = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.offset, this.offset + size - 1));
      this.offset += size - 1;
      return value;
    }
    floats(count) { this.need(count * 4); return Array.from({ length: count }, () => this.float()); }
    shorts() { const count = this.count(); this.need(count * 2); return Array.from({ length: count }, () => { const value = this.view.getUint16(this.offset); this.offset += 2; return value; }); }
  }

  function normalize32(input) {
    const json = JSON.parse(JSON.stringify(input));
    for (const constraint of json.transform || []) {
      constraint.bones ||= [constraint.bone];
      if (/^3\.[01]\./.test(json.skeleton?.spine || '')) {
        constraint.rotateMix ??= 0; constraint.scaleMix ??= 0; constraint.shearMix ??= 0;
      }
    }
    for (const skin of Object.values(json.skins || {})) for (const slot of Object.values(skin)) for (const attachment of Object.values(slot)) {
      if (['weightedmesh', 'skinnedmesh'].includes(attachment.type)) attachment.type = 'mesh';
      if (attachment.type === 'weightedlinkedmesh') attachment.type = 'linkedmesh';
      if (attachment.type === 'boundingbox') attachment.vertexCount ??= (attachment.vertices?.length || 0) / 2;
      if (attachment.ffd != null) attachment.deform = attachment.ffd;
    }
    for (const animation of Object.values(json.animations || {})) {
      if (animation.ffd) { animation.deform = animation.ffd; delete animation.ffd; }
    }
    return json;
  }

  function decode(bytes, series) {
    if (!['3.0', '3.1', '3.2', '3.3', '3.4', '3.5'].includes(series)) throw new Error(`No older binary decoder for ${series}.`);
    const r = new Reader(bytes), old = Number(series) <= 3.2, pre32 = Number(series) < 3.2;
    const json = { skeleton: { hash: r.string(), spine: r.string(), width: r.float(), height: r.float() }, bones: [], slots: [], ik: [], transform: [], path: [], skins: {}, events: {}, animations: {} };
    if (!json.skeleton.spine?.startsWith(series + '.')) throw new Error('The binary header does not match the selected Spine version.');
    const early = series === '3.0' || (series === '3.1' && parseInt(json.skeleton.spine.split('.')[2]) < 5);
    const v35 = series === '3.5';
    const nonessential = r.bool();
    if (nonessential && v35) json.skeleton.fps = r.float();
    if (nonessential) json.skeleton.images = r.string();
    const bone = index => { const name = json.bones[index]?.name; if (!name) throw new Error(`Invalid bone index: ${index}`); return name; };
    const slot = index => { const name = json.slots[index]?.name; if (!name) throw new Error(`Invalid slot index: ${index}`); return name; };
    const values = (target, fields) => { for (const field of fields) target[field] = r.float(); };
    for (let i = 0, count = r.count(); i < count; i++) {
      const data = { name: r.string() };
      if (early) { const parent = r.int() - 1; if (parent >= 0) data.parent = bone(parent); }
      else if (i) data.parent = bone(r.int());
      values(data, pre32 ? ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'length'] : ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearX', 'shearY', 'length']);
      if (v35) data.transform = ['normal','onlyTranslation','noRotationOrReflection','noScale','noScaleOrReflection'][r.int()];
      else if (pre32) { data.inheritScale = r.bool(); data.inheritRotation = r.bool(); }
      else { data.inheritRotation = r.bool(); data.inheritScale = r.bool(); }
      if (nonessential) data.color = r.color();
      json.bones.push(data);
    }
    function readSlots() {
      for (let i = 0, count = r.count(); i < count; i++) {
        const data = { name: r.string(), bone: bone(r.int()), color: r.color(), attachment: r.string() };
        data.blend = ['normal', 'additive', 'multiply', 'screen'][r.int()];
        if (!data.blend) throw new Error('Invalid slot blend mode.');
        json.slots.push(data);
      }
    }
    function readIk() {
      for (let i = 0, count = r.count(); i < count; i++) {
        const data = {name:r.string()};
        if(v35)data.order=r.int();
        data.bones=Array.from({length:r.count()},()=>bone(r.int()));data.target=bone(r.int());data.mix=r.float();data.bendPositive=r.signedByte()>0;
        json.ik.push(data);
      }
    }
    function readTransforms() {
      if (series === '3.0') return;
      for (let i = 0, count = r.count(); i < count; i++) {
        const data = { name: r.string() };
        if(v35)data.order=r.int();
        data.bones = old ? [bone(r.int())] : Array.from({ length: r.count() }, () => bone(r.int()));
        data.target = bone(r.int());
        if (pre32) { values(data, ['translateMix', 'x', 'y']); data.rotateMix = data.scaleMix = data.shearMix = 0; }
        else values(data, ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY', 'rotateMix', 'translateMix', 'scaleMix', 'shearMix']);
        json.transform.push(data);
      }
    }
    if (old) { readIk(); readTransforms(); readSlots(); }
    else {
      readSlots(); readIk(); readTransforms();
      for (let i = 0, count = r.count(); i < count; i++) {
        const data={name:r.string()};if(v35)data.order=r.int();
        data.bones=Array.from({length:r.count()},()=>bone(r.int()));data.target=slot(r.int());
        data.positionMode = ['fixed', 'percent'][r.int()];
        data.spacingMode = ['length', 'fixed', 'percent'][r.int()];
        data.rotateMode = ['tangent', 'chain', 'chainScale'][r.int()];
        values(data, ['rotation', 'position', 'spacing', 'rotateMix', 'translateMix']);
        json.path.push(data);
      }
    }
    function vertices(count, weighted = r.bool(), floatIndices = false) {
      if (!weighted) return r.floats(count * 2);
      const result = [];
      for (let i = 0; i < count; i++) {
        const boneCount = floatIndices ? r.float() : r.count();
        if (!Number.isInteger(boneCount) || boneCount < 0 || boneCount > json.bones.length) throw new Error('Invalid weighted vertex.');
        result.push(boneCount);
        for (let j = 0; j < boneCount; j++) result.push(floatIndices ? r.float() : r.int(), r.float(), r.float(), r.float());
      }
      return result;
    }
    function attachment() {
      const data = {}, name = r.string(), type = r.byte();
      if (name != null) data.name = name;
      const kind = (old ? ['region', 'boundingbox', 'mesh', 'weightedmesh', 'linkedmesh', 'weightedlinkedmesh'] : ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path'])[type];
      if (!kind) throw new Error(`Unsupported Spine ${series} attachment type ${type}.`);
      data.type = kind;
      if (kind === 'region') {
        data.path = r.string();
        values(data, pre32 ? ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'width', 'height'] : ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'width', 'height']);
        data.color = r.color();
      } else if (kind === 'boundingbox') {
        data.vertexCount = r.count() / (early ? 2 : 1);
        data.vertices = old ? vertices(data.vertexCount, false) : vertices(data.vertexCount);
        if (!old && nonessential) data.color = r.color();
      } else if (kind === 'mesh' || kind === 'weightedmesh') {
        data.path = r.string(); if (!early) data.color = r.color();
        const count = r.count() / (early ? 2 : 1);
        data.uvs = r.floats(count * 2); data.triangles = r.shorts();
        if (early) r.count(); // Encoded vertex-array length (weighted arrays include bone indices).
        data.vertices = old ? vertices(count, kind === 'weightedmesh', true) : vertices(count);
        if (early) data.color = r.color();
        data.hull = r.int();
        if (nonessential) { data.edges = early ? Array.from({length:r.count()}, () => r.int()) : r.shorts(); values(data, ['width', 'height']); }
      } else if (kind === 'linkedmesh' || kind === 'weightedlinkedmesh') {
        data.path = r.string(); data.color = r.color(); data.skin = r.string(); data.parent = r.string(); data.deform = r.bool();
        if (nonessential) values(data, ['width', 'height']);
      } else if (kind === 'path') {
        data.closed = r.bool(); data.constantSpeed = r.bool(); data.vertexCount = r.count();
        data.vertices = vertices(data.vertexCount); data.lengths = r.floats(Math.floor(data.vertexCount / 3));
        if (nonessential) data.color = r.color();
      }
      if (data.path == null) delete data.path;
      return data;
    }
    const skinNames = [];
    function skin(name, isDefault = false) {
      const count = r.count(), data = {};
      if (!count && isDefault) return;
      for (let i = 0; i < count; i++) {
        const slotName = slot(r.int()), attachments = data[slotName] = {};
        for (let j = 0, total = r.count(); j < total; j++) { const key = r.string(); attachments[key] = attachment(); }
      }
      skinNames.push(name); json.skins[name] = data;
    }
    skin('default', true);
    for (let i = 0, count = r.count(); i < count; i++) skin(r.string());
    const eventNames = [];
    for (let i = 0, count = r.count(); i < count; i++) {
      const name = r.string(); eventNames.push(name); json.events[name] = { int: r.int(false), float: r.float(), string: r.string() };
    }
    function frames(fields, curved = true) {
      const result = [], count = r.count();
      for (let i = 0; i < count; i++) {
        const frame = { time: r.float() };
        for (const [key, read] of fields) frame[key] = read();
        if (curved && i < count - 1) {
          const curve = r.byte();
          if (curve === 1) frame.curve = 'stepped';
          else if (curve === 2) frame.curve = r.floats(4);
          else if (curve !== 0) throw new Error('Invalid animation curve.');
        }
        result.push(frame);
      }
      return result;
    }
    for (let i = 0, count = r.count(); i < count; i++) {
      const name = r.string(), animation = { slots: {}, bones: {}, ik: {}, transform: {}, paths: {}, deform: {} };
      for (let j = 0, total = r.count(); j < total; j++) {
        const slotName = slot(r.int()), timelines = animation.slots[slotName] = {};
        for (let k = 0, n = r.count(); k < n; k++) {
          const type = r.byte();
          if (type === (pre32 ? 3 : old ? 4 : 0)) timelines.attachment = frames([['name', () => r.string()]], false);
          else if (type === (pre32 ? 4 : old ? 5 : 1)) timelines.color = frames([['color', () => r.color()]]);
          else throw new Error(`Invalid slot timeline ${type}.`);
        }
      }
      for (let j = 0, total = r.count(); j < total; j++) {
        const boneName = bone(r.int()), timelines = animation.bones[boneName] = {};
        for (let k = 0, n = r.count(); k < n; k++) {
          const type = r.byte(), kind = (pre32 ? ['scale', 'rotate', 'translate'] : ['rotate', 'translate', 'scale', 'shear'])[type];
          if (!kind) throw new Error(`Invalid bone timeline ${type}.`);
          timelines[kind] = frames(kind === 'rotate' ? [['angle', () => r.float()]] : [['x', () => r.float()], ['y', () => r.float()]]);
        }
      }
      for (let j = 0, total = r.count(); j < total; j++) {
        const constraint = json.ik[r.int()];
        if (!constraint) throw new Error('Invalid IK timeline.');
        animation.ik[constraint.name] = frames([['mix', () => r.float()], ['bendPositive', () => r.signedByte() > 0]]);
      }
      for (let j = 0, total = pre32 ? 0 : r.count(); j < total; j++) {
          const constraint = json.transform[r.int()];
          if (!constraint) throw new Error('Invalid transform timeline.');
          animation.transform[constraint.name] = frames(['rotateMix', 'translateMix', 'scaleMix', 'shearMix'].map(key => [key, () => r.float()]));
      }
      if (!old) {
        for (let j = 0, total = r.count(); j < total; j++) {
          const constraint = json.path[r.int()];
          if (!constraint) throw new Error('Invalid path timeline.');
          const timelines = animation.paths[constraint.name] = {};
          for (let k = 0, n = r.count(); k < n; k++) {
            const kind = ['position', 'spacing', 'mix'][r.byte()];
            if (!kind) throw new Error('Invalid path timeline type.');
            timelines[kind] = frames((kind === 'mix' ? ['rotateMix', 'translateMix'] : [kind]).map(key => [key, () => r.float()]));
          }
        }
      }
      for (let j = 0, total = r.count(); j < total; j++) {
        const skinName = skinNames[r.int()];
        if (!skinName) throw new Error('Invalid deform skin.');
        const deformSkin = animation.deform[skinName] = {};
        for (let k = 0, n = r.count(); k < n; k++) {
          const deformSlot = deformSkin[slot(r.int())] = {};
          for (let m = 0, num = r.count(); m < num; m++) {
            const key = r.string();
            // Deform data contains sparse offsets; the JSON runtime adds the setup vertices.
            deformSlot[key] = frames([['vertices', () => { const length = r.count(); if (!length) return []; const offset = r.count(); return { offset, values: r.floats(length) }; }]]);
            for (const frame of deformSlot[key]) if (!Array.isArray(frame.vertices)) {
              frame.offset = frame.vertices.offset; frame.vertices = frame.vertices.values;
            }
          }
        }
      }
      const offsets = () => Array.from({ length: r.count() }, () => ({ slot: slot(r.int()), offset: r.int() | 0 }));
      animation.drawOrder = early ? Array.from({length:r.count()}, () => { const result = offsets(); return {time:r.float(),offsets:result}; })
        : frames([['offsets', offsets]], false);
      animation.events = frames([['event', () => {
        const eventName = eventNames[r.int()];
        if (!eventName) throw new Error('Invalid event index.');
        return { name: eventName, int: r.int(false), float: r.float(), string: r.bool() ? r.string() : json.events[eventName].string };
      }]], false).map(frame => ({ time: frame.time, ...frame.event }));
      if (!animation.drawOrder.length) delete animation.drawOrder;
      if (!animation.events.length) delete animation.events;
      json.animations[name] = animation;
    }
    if (r.offset !== r.bytes.length) throw new Error(`Unexpected trailing data in Spine ${series} export.`);
    return old ? normalize32(json) : json;
  }
  return { decode, normalize32 };
});
