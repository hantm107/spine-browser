const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'spine-library-performance-'));
const env={...process.env,SPINE_LIBRARY_TEST_DIR:scratch};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'library-performance-smoke.cjs')],{env,cwd:path.resolve(__dirname,'..'),stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e);process.exitCode=1;});
child.on('exit',code=>{fs.rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:150},error=>{if(error)console.error(error.message);process.exitCode=code??1;});});
