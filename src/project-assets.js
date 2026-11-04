const fs = require('node:fs/promises');
const path = require('node:path');
const runtimeVersion = require('@esotericsoftware/spine-player/package.json').version;
const runtimeCatalog = require('./runtime-catalog');

function versionSeries(version) {
  return typeof version === 'string' ? version.match(/^(\d+\.\d+)(?:\.|$)/)?.[1] || null : null;
}

function binaryHeaderVersion(bytes) {
  let offset=0;
  function string(){let length=0,shift=0,byte;do{if(offset>=bytes.length||shift>28)throw Error('Invalid binary header.');byte=bytes[offset++];length|=(byte&127)<<shift;shift+=7;}while(byte&128);if(length<=1)return '';length--;if(length<0||offset+length>bytes.length)throw Error('Invalid binary header.');const value=bytes.subarray(offset,offset+length).toString('utf8');offset+=length;return value;}
  const valid=value=>/^\d+\.\d+(?:\.\d+)?(?:-beta)?$/.test(value);
  try{string();const value=string();if(valid(value))return value;}catch{}
  // Spine 4.x stores its hash as eight bytes rather than a string.
  offset=8;try{const value=string();return /^4\./.test(value)&&valid(value)?value:null;}catch{return null;}
}

async function readSkeletonJson(filePath) {
  return JSON.parse((await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

async function isSkeletonJson(filePath) {
  try {
    const data = await readSkeletonJson(filePath);
    return Array.isArray(data?.bones) && (typeof data?.skeleton?.spine === 'string' || isUnversionedLegacyJson(data));
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

async function readSpineVersionFromFile(filePath) {
  if (path.extname(filePath).toLowerCase() === '.json') {
    const data = await readSkeletonJson(filePath);
    return data.skeleton?.spine || null;
  }
  if (path.extname(filePath).toLowerCase() !== '.skel') return null;
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return binaryHeaderVersion(buffer.subarray(0,bytesRead));
  } finally { await handle.close(); }
}

function isUnversionedLegacyJson(data) {
  return !data?.skeleton?.spine && Array.isArray(data?.bones) && data.bones.length > 0
    && data.bones.every(b => typeof b.name === 'string') && Array.isArray(data.slots)
    && data.skins && !Array.isArray(data.skins) && typeof data.skins === 'object'
    && data.animations && typeof data.animations === 'object';
}

async function detectSpineFileCompatibility(filePath) {
  const fileVersion = filePath ? await readSpineVersionFromFile(filePath) : null;
  const inferredLegacy = !fileVersion && /\.json$/i.test(filePath || '') && isUnversionedLegacyJson(await readSkeletonJson(filePath));
  const series = inferredLegacy ? '2.1' : versionSeries(fileVersion);
  const descriptor = runtimeCatalog[series];
  return { fileVersion, series, runtimeVersion: descriptor?.runtime === 'modern' ? runtimeVersion : descriptor?.version || null,
    runtime: descriptor?.runtime || null, kind: descriptor?.kind || null,
    inferredLegacy: !!inferredLegacy, mismatch: !descriptor, supportedVersions: Object.keys(runtimeCatalog) };
}

async function scanDirectory(folderPath) {
  const projects = [], warnings = [];
  async function walk(dir, isRoot = false) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) {
      if (isRoot) throw error;
      warnings.push({ path: dir, message: error.message });
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', '.temp'].includes(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.spine', '.skel', '.json'].includes(ext)) continue;
      try {
        if (ext === '.json' && !await isSkeletonJson(fullPath)) continue;
        const stats = await fs.stat(fullPath);
        const relativePath = path.relative(folderPath, fullPath).replace(/\\/g, '/');
        const folder = path.posix.dirname(relativePath);
        projects.push({ id: fullPath, fullPath, name: path.basename(entry.name, path.extname(entry.name)),
          fileName: entry.name, relativePath, folder: folder === '.' ? '(root)' : folder,
          size: stats.size, modified: stats.mtimeMs, isDirectSpineFile: ext === '.spine' });
      } catch (error) { warnings.push({ path: fullPath, message: error.message }); }
    }
  }
  await walk(folderPath, true);
  projects.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name) || a.fileName.localeCompare(b.fileName));
  return { projects, warnings };
}

async function findSkeletonAssetPair(filePath) {
  const dir = path.dirname(filePath), ext = path.extname(filePath).toLowerCase();
  const stem = file => path.basename(file, path.extname(file)).toLowerCase();
  const entries = (await fs.readdir(dir, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name);
  const atlasStem = file => file.replace(/\.atlas(?:\.txt)?$/i, '').toLowerCase();
  // Unity uses .atlas.txt; prefer the ordinary atlas when both forms exist.
  const atlases = entries.filter(f => /\.atlas(?:\.txt)?$/i.test(f))
    .sort((a, b) => Number(/\.txt$/i.test(a)) - Number(/\.txt$/i.test(b)) || a.localeCompare(b));
  const exports = [];
  for (const file of entries) {
    const extension = path.extname(file).toLowerCase();
    if (extension === '.skel' || (extension === '.json' && await isSkeletonJson(path.join(dir, file)).catch(() => false))) exports.push(file);
  }
  // JSON and binary exports with the same stem represent one skeleton choice.
  const singleExport = new Set(exports.map(stem)).size === 1;
  const preferredExport = files => files.find(f => path.extname(f).toLowerCase() === '.skel') || files[0];
  const atlasFor = skeleton => atlases.find(f => atlasStem(f) === stem(skeleton))
    || (singleExport && new Set(atlases.map(atlasStem)).size === 1 ? atlases[0] : null);
  let skeleton = null;
  if (ext === '.skel' || ext === '.json') skeleton = exports.find(f => f.toLowerCase() === path.basename(filePath).toLowerCase());
  else if (ext === '.spine') {
    const matching = exports.filter(f => stem(f) === stem(filePath));
    skeleton = preferredExport(matching);
    // Numbered editor projects can have one descriptively named skeleton in both formats.
    if (!skeleton && singleExport) skeleton = preferredExport(exports);
  }
  let fallbackReason;
  if(skeleton&&/\.skel$/i.test(skeleton)){
    const binary=await detectSpineFileCompatibility(path.join(dir,skeleton));
    const json=exports.find(file=>/\.json$/i.test(file)&&stem(file)===stem(skeleton));
    if(binary.mismatch&&json&&!(await detectSpineFileCompatibility(path.join(dir,json))).mismatch){fallbackReason=`Previewing ${json}; ${skeleton} has an unsupported or unknown binary version.`;skeleton=json;}
  }
  const atlas = skeleton && atlasFor(skeleton);
  if (!skeleton || !atlas) return { skeletonPath: null, atlasPath: null,
    reason: 'No unambiguous matching .skel/.json and .atlas or .atlas.txt pair was found in this folder.' };
  return { skeletonPath: path.join(dir, skeleton), atlasPath: path.join(dir, atlas),...(fallbackReason?{fallbackReason}:{}) };
}

module.exports = { versionSeries, binaryHeaderVersion,readSpineVersionFromFile, detectSpineFileCompatibility, scanDirectory, findSkeletonAssetPair };
