const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'spine-import-ui-')),env={...process.env,SPINE_IMPORT_TEST_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'import-ui-smoke.cjs')],{env,windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150},error=>{if(error)console.error(error.message);process.exitCode=code??1;});});
