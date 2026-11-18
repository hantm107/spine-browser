const path=require('node:path');
const {fileURLToPath}=require('node:url');

// IPC handlers check that a request comes from one of the app's own pages.
// Comparing file URLs as strings breaks on Windows, where the renderer reports
// "D:/…" while __dirname may be "d:\…" depending on how the app was launched.
// Compare resolved paths instead, ignoring case on case-insensitive platforms.
function isAppPage(url, file){
  let page;
  try{
    const parsed=new URL(url);
    if(parsed.protocol!=='file:'||parsed.search||parsed.hash)return false;
    page=path.resolve(fileURLToPath(parsed));
  }catch{return false;}
  const expected=path.resolve(file);
  return process.platform==='win32'||process.platform==='darwin'?page.toLowerCase()===expected.toLowerCase():page===expected;
}

module.exports={isAppPage};
