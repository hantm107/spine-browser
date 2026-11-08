'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const {createBackup,summary,readBackup,writeBackup,restoreBackup}=require('./database-backup');

// Executed only in our library renderer. Revert all keys if localStorage rejects
// a write (for example, a full profile); no imported code is ever evaluated.
function applyStorage(values){
  const before=Object.fromEntries(Object.keys(values).map(key=>[key,localStorage.getItem(key)]));
  const write=entries=>{for(const [key,value] of Object.entries(entries))if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);};
  try{write(values);}catch(error){for(const key of Object.keys(values))localStorage.removeItem(key);write(before);throw error;}
}
function registerDatabaseBackup({ipcMain,dialog,BrowserWindow,appendList,userData,appVersion,isImportOpen}){
  let busy=false;
  const libraryUrl=pathToFileURL(path.join(__dirname,'index.html')).href;
  const handler=action=>async(event,storage)=>{
    if(event.sender.getURL()!==libraryUrl||event.senderFrame!==event.sender.mainFrame)throw Error('Open the asset library to manage backups.');
    if(busy)throw Error('A library backup operation is already in progress.');
    if(action==='restore'&&isImportOpen())throw Error('Close the Import animation window before restoring the library.');
    busy=true;
    try{
      const parent=BrowserWindow.fromWebContents(event.sender);
      const filters=[{name:'Spine Browser library backup',extensions:['json']}];
      if(action==='export'){
        const result=await dialog.showSaveDialog(parent,{title:'Export library backup',defaultPath:`Spine-Browser-library-${new Date().toISOString().slice(0,10)}.json`,filters});
        if(result.canceled||!result.filePath)return null;
        const backup=createBackup(storage,await appendList.snapshot(),appVersion);
        await writeBackup(result.filePath,backup);return {filePath:result.filePath,summary:summary(backup)};
      }
      const result=await dialog.showOpenDialog(parent,{title:'Restore library backup',filters,properties:['openFile']});
      if(result.canceled||!result.filePaths[0])return null;
      const backup=await readBackup(result.filePaths[0]);
      const confirmation=await dialog.showMessageBox(parent,{type:'warning',title:'Restore library backup',message:'Replace the current library with this backup?',
        detail:`${summary(backup)}\nExported: ${backup.exportedAt}\n\nThis replaces folder links, favorites, categories, Append sources, browsing state and saved preferences. A recovery backup of the current library will be saved first.\n\nAsset files are not included or changed. Paths must still point to your assets; missing links stay bookmarked.`,
        buttons:['Cancel','Restore library'],defaultId:0,cancelId:0,noLink:true});
      if(confirmation.response!==1)return null;
      const current=createBackup(storage,await appendList.snapshot(),appVersion);
      const recoveryFile=path.join(userData,'library-backups',`before-restore-${Date.now()}-${randomUUID()}.json`);
      await restoreBackup(backup,{appendList,current,recoveryFile,
        applyStorage:values=>event.sender.executeJavaScript(`(${applyStorage.toString()})(${JSON.stringify(values)})`)});
      await dialog.showMessageBox(parent,{type:'info',title:'Library restored',message:'Library restored. The library will now reload.',
        detail:`Recovery backup of the previous library:\n${recoveryFile}`,buttons:['Continue'],noLink:true}).catch(()=>{});
      return {filePath:result.filePaths[0],recoveryFile};
    }finally{busy=false;}
  };
  ipcMain.handle('database-export',handler('export'));
  ipcMain.handle('database-restore',handler('restore'));
  return {isBusy:()=>busy};
}
module.exports={registerDatabaseBackup,applyStorage};
