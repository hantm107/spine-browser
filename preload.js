const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spineApi", {
  openImportWorkspace:file=>ipcRenderer.invoke('open-import-workspace',file),
  getAppendList:()=>ipcRenderer.invoke('append-list-get'),
  setAppendList:(file,enabled)=>ipcRenderer.invoke('append-list-set',file,enabled),
  onAppendListChanged:callback=>{const handler=()=>callback();ipcRenderer.on('append-list-changed',handler);return()=>ipcRenderer.removeListener('append-list-changed',handler);},
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

contextBridge.exposeInMainWorld('spineImport', {
  takeAppendSource:()=>ipcRenderer.invoke('import-take-append-source'),
  onAppendSource:callback=>{const handler=()=>callback();ipcRenderer.on('import-append-source-ready',handler);return()=>ipcRenderer.removeListener('import-append-source-ready',handler);},
  selectProject:()=>ipcRenderer.invoke('import-select-project'),
  selectCli:()=>ipcRenderer.invoke('import-select-cli'),
  inspect:(file,settings)=>ipcRenderer.invoke('import-inspect',file,settings),
  reconstruct:(file,settings)=>ipcRenderer.invoke('import-reconstruct',file,settings),
  preview:(id,skeleton)=>ipcRenderer.invoke('import-preview',id,skeleton),
  plan:options=>ipcRenderer.invoke('import-plan',options),
  previewPlan:id=>ipcRenderer.invoke('import-preview-plan',id),
  save:id=>ipcRenderer.invoke('import-save',id),
  onProgress:callback=>{const handler=(_,message)=>callback(message);ipcRenderer.on('import-progress',handler);return()=>ipcRenderer.removeListener('import-progress',handler);},
});
