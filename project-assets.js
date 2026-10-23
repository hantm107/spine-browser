const fs = require('node:fs/promises');
const path = require('node:path');
const runtimeVersion = require('@esotericsoftware/spine-player/package.json').version;
const runtimeCatalog = require('./runtime-catalog');

function versionSeries(version) {
  return typeof version === 'string' ? version.match(/^(\d+\.\d+)(?:\.|$)/)?.[1] || null : null;
}

async function readSkeletonJson(filePath) {
  return JSON.parse((await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

async function isSkeletonJson(filePath) {
  try {
    const data = await readSkeletonJson(filePath);
    return Array.isArray(data?.bones) && typeof data?.skeleton?.spine === 'string';
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
    return buffer.subarray(0, bytesRead).toString('latin1').match(/\d+\.\d+\.\d+(?:-beta)?/)?.[0] || null;
  } finally { await handle.close(); }
}

async function detectSpineFileCompatibility(filePath) {
  const fileVersion = filePath ? await readSpineVersionFromFile(filePath) : null;
  const series = versionSeries(fileVersion);
  const descriptor = runtimeCatalog[series];
  return { fileVersion, series, runtimeVersion: descriptor?.runtime === 'modern' ? runtimeVersion : descriptor?.version || null,
    runtime: descriptor?.runtime || null, kind: descriptor?.kind || null,
    mismatch: !descriptor, supportedVersions: Object.keys(runtimeCatalog) };
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
  const atlases = entries.filter(f => path.extname(f).toLowerCase() === '.atlas');
  const exports = [];
  for (const file of entries) {
    const extension = path.extname(file).toLowerCase();
    if (extension === '.skel' || (extension === '.json' && await isSkeletonJson(path.join(dir, file)).catch(() => false))) exports.push(file);
  }
  // JSON and binary exports with the same stem represent one skeleton choice.
  const singleExport = new Set(exports.map(stem)).size === 1;
  const preferredExport = files => files.find(f => path.extname(f).toLowerCase() === '.skel') || files[0];
  const atlasFor = skeleton => atlases.find(f => stem(f) === stem(skeleton))
    || (singleExport && atlases.length === 1 ? atlases[0] : null);
  let skeleton = null;
  if (ext === '.skel' || ext === '.json') skeleton = exports.find(f => f.toLowerCase() === path.basename(filePath).toLowerCase());
  else if (ext === '.spine') {
    const matching = exports.filter(f => stem(f) === stem(filePath));
    skeleton = preferredExport(matching);
    // Numbered editor projects can have one descriptively named skeleton in both formats.
    if (!skeleton && singleExport) skeleton = preferredExport(exports);
  }
  const atlas = skeleton && atlasFor(skeleton);
  if (!skeleton || !atlas) return { skeletonPath: null, atlasPath: null,
    reason: 'No unambiguous matching .skel/.json and .atlas pair was found in this folder.' };
  return { skeletonPath: path.join(dir, skeleton), atlasPath: path.join(dir, atlas) };
}

module.exports = { versionSeries, readSpineVersionFromFile, detectSpineFileCompatibility, scanDirectory, findSkeletonAssetPair };
