const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spineApi", {
  inspectFavorite: file => ipcRenderer.invoke('inspect-favorite', file),
  scanLibrary: folder => ipcRenderer.invoke('scan-library', folder),
  loadThumbnail: key => ipcRenderer.invoke('load-thumbnail', key),
  captureThumbnail: (key, rect) => ipcRenderer.invoke('capture-thumbnail', key, rect),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  scanDirectory: (folderPath) => ipcRenderer.invoke("scan-directory", folderPath),
  resolveSpineAssets: (spineFilePath) => ipcRenderer.invoke("resolve-spine-assets", spineFilePath),
  fileUrlForPath: (filePath) => ipcRenderer.invoke("file-url-for-path", filePath),
  readTextFile: (filePath) => ipcRenderer.invoke("read-text-file", filePath),
  readDataUri: (filePath) => ipcRenderer.invoke("read-data-uri", filePath),
  resolveRelativeResource: (baseFilePath, relativeName) => ipcRenderer.invoke("resolve-relative-resource", baseFilePath, relativeName),
  detectSpineVersion: (filePath) => ipcRenderer.invoke("detect-spine-version", filePath),
  openInExplorer: (filePath) => ipcRenderer.invoke("open-file-in-explorer", filePath),
  openInSpine: (filePath) => ipcRenderer.invoke("open-file-in-spine", filePath),
});
