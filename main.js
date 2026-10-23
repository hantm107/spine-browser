const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { groupAssets } = require('./asset-groups');
const { scanDirectory, findSkeletonAssetPair, detectSpineFileCompatibility } = require('./project-assets');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 850, minWidth: 980, minHeight: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

async function openInSpine(filePath) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    const spineExe = 'C:\\Program Files\\Spine\\Spine.exe';
    const installed = await fs.access(spineExe).then(() => true, () => false);
    if (!installed) return (await shell.openPath(filePath)) === '';
    return await new Promise(resolve => {
      const child = spawn(spineExe, [filePath], { windowsHide: true, stdio: 'ignore' });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    });
  } catch (error) { console.error(error); return false; }
}

app.whenReady().then(() => {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle('scan-directory', (_, folderPath) => scanDirectory(folderPath));
  ipcMain.handle('inspect-favorite', async (_, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('A favorite must use an absolute file path.');
    const metadata = { id:filePath, fullPath:filePath, fileName:path.basename(filePath), name:path.basename(filePath,path.extname(filePath)),
      folder:path.dirname(filePath), relativePath:filePath, isDirectSpineFile:path.extname(filePath).toLowerCase()==='.spine' };
    try {
      const stat=await fs.stat(filePath);
      if(!stat.isFile()) throw new Error('The bookmarked path is no longer a file.');
      return {...metadata,size:stat.size,modified:stat.mtimeMs,unavailable:false};
    } catch(error) { return {...metadata,unavailable:true,unavailableReason:error.code==='ENOENT'?'File moved or deleted.':error.message}; }
  });
  ipcMain.handle('scan-library', async (_, folderPath) => {
    const result = await scanDirectory(folderPath);
    return { ...result, projects: groupAssets(result.projects) };
  });
  const thumbnailFile = key => path.join(app.getPath('userData'), 'thumbnails', createHash('sha256').update(String(key)).digest('hex') + '.png');
  ipcMain.handle('load-thumbnail', async (_, key) => {
    try { return 'data:image/png;base64,' + (await fs.readFile(thumbnailFile(key))).toString('base64'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  });
  ipcMain.handle('capture-thumbnail', async (event, key, rect) => {
    const image = await event.sender.capturePage({ x: Math.max(0,Math.round(rect.x)), y: Math.max(0,Math.round(rect.y)), width: Math.max(1,Math.round(rect.width)), height: Math.max(1,Math.round(rect.height)) });
    const thumbnail = image.resize({width:160});
    const target = thumbnailFile(key);
    await fs.mkdir(path.dirname(target), {recursive:true});
    await fs.writeFile(target, thumbnail.toPNG());
    return thumbnail.toDataURL();
  });
  ipcMain.handle('resolve-spine-assets', (_, filePath) => findSkeletonAssetPair(filePath));
  ipcMain.handle('detect-spine-version', (_, filePath) => detectSpineFileCompatibility(filePath));
  ipcMain.handle('file-url-for-path', (_, filePath) => pathToFileURL(filePath).href);
  ipcMain.handle('read-text-file', async (_, filePath) => (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
  ipcMain.handle('read-data-uri', async (_, filePath) => {
    let buffer = await fs.readFile(filePath);
    // Players parse JSON from these data URIs; normalize a UTF-8 BOM in memory only.
    if (['.json', '.atlas'].includes(path.extname(filePath).toLowerCase())
      && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) buffer = buffer.subarray(3);
    const mime = { '.json': 'application/json', '.atlas': 'text/plain', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  });
  ipcMain.handle('resolve-relative-resource', (_, baseFilePath, relativeName) => path.resolve(path.dirname(baseFilePath), relativeName));
  ipcMain.handle('open-file-in-explorer', async (_, filePath) => {
    try { await fs.access(filePath); shell.showItemInFolder(filePath); return true; }
    catch (error) { console.error(error); return false; }
  });
  ipcMain.handle('open-file-in-spine', (_, filePath) => openInSpine(filePath));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
