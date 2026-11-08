const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'spine-backup-ui-'));
const env={...process.env,SPINE_BACKUP_TEST_DIR:scratch};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'database-backup-smoke.cjs')],{cwd:path.resolve(__dirname,'..'),env,windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:150});process.exitCode=code??1;});
