// Group only siblings with matching stems, plus the unambiguous numbered-project case.
function groupAssets(projects) {
  const folders = new Map();
  for (const file of projects) {
    const dir = file.fullPath.replace(/[^\\/]+$/, '').toLowerCase();
    if (!folders.has(dir)) folders.set(dir, []);
    folders.get(dir).push(file);
  }
  const result = [];
  for (const files of folders.values()) {
    const groups = new Map();
    for (const file of files) {
      const stem = file.name.toLowerCase();
      if (!groups.has(stem)) groups.set(stem, []);
      groups.get(stem).push(file);
    }
    const editors = files.filter(f => f.isDirectSpineFile);
    const exports = files.filter(f => !f.isDirectSpineFile);
    if (editors.length === 1 && new Set(exports.map(f => f.name.toLowerCase())).size === 1
      && !exports.some(f => f.name.toLowerCase() === editors[0].name.toLowerCase())) {
      groups.delete(exports[0].name.toLowerCase());
      groups.set(editors[0].name.toLowerCase(), files);
    }
    for (const members of groups.values()) {
      const primary = members.find(f => f.isDirectSpineFile) || members.find(f => /\.json$/i.test(f.fileName)) || members[0];
      result.push({ ...primary, files: members, thumbnailKey: members.map(f => `${f.fullPath}:${f.size}:${f.modified || 0}`).sort().join('|') });
    }
  }
  return result.sort((a,b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}
module.exports = { groupAssets };
