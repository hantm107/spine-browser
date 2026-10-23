// Read actual composited GPU pixels, not just the runtime's blend-mode flags.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
function png(pixels) {
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc>>>1)^((crc&1)?0xedb88320:0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([length,body,checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(1,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,...pixels]))),chunk('IEND',Buffer.alloc(0))]);
}
module.exports = async ({ fixtures, evaluate, until, win, checks, wait }) => {
  for (const series of ['3.0','3.6','3.7','3.8','4.0','4.1','4.2','4.3']) for (const pma of [false,true]) {
    const folder = path.join(fixtures,`blend-${series}-${pma}`); fs.mkdirSync(folder,{recursive:true});
    const skin = { quad: { paint:{path:'paint',width:100,height:100}, clear:{path:'clear',width:100,height:100} } };
    const data = {skeleton:{spine:series+'.00',x:-50,y:-50,width:100,height:100},bones:[{name:'root'}],slots:[{name:'quad',bone:'root',attachment:'paint'}],skins:Number(series)>=3.8?[{name:'default',attachments:skin}]:{default:skin},animations:{idle:{}}};
    fs.writeFileSync(path.join(folder,'blend.json'),JSON.stringify(data));
    fs.writeFileSync(path.join(folder,'blend.atlas'),`\nblend.png\nsize: 2,1\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\npma: ${pma}\n`+['paint','clear'].map((name,i)=>`${name}\n  rotate: false\n  xy: ${i}, 0\n  size: 1, 1\n  orig: 1, 1\n  offset: 0, 0\n  index: -1\n`).join(''));
    fs.writeFileSync(path.join(folder,'blend.png'),png(pma?[77,26,51,128,0,0,0,0]:[153,51,102,128,240,80,160,0]));
    const file = path.join(folder,'blend.json');
    await evaluate(`selectProject(${JSON.stringify({id:file,fullPath:file,name:'Blend test',fileName:'blend.json',folder})})`);
    await until('!!activePlayer?.skeleton');
    await wait(Number(series)>=4 ? 1000 : 100);
    const results = [];
    for (let mode=0;mode<4;mode++) for (const clear of [false,true]) {
      await evaluate(`(()=>{const s=activePlayer.skeleton,slot=s.slots[0];slot.data.blendMode=${mode};const pose=slot.getPose?.()||slot;const attachment=s.data.defaultSkin.getAttachment(0,'${clear?'clear':'paint'}');pose.setAttachment(attachment);if(pose.color)pose.color.a=0.5;else pose.a=0.5;activePlayer.paused=true;})()`);
      await wait(40);
      const rect = await evaluate(`(()=>{const r=playerHost.querySelector('canvas').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),width:1,height:1};})()`);
      const image = await win.webContents.capturePage(rect); const bytes=image.toBitmap(); const actual=[bytes[2],bytes[1],bytes[0]];
      const alpha = clear?0:(128/255)*0.5;
      const expected = [17,24,39].map((d,i)=>{
        const s=[153,51,102][i]*alpha;
        return mode===0?s+d*(1-alpha):mode===1?s+d:mode===2?s*d/255+d*(1-alpha):s+d*(1-s/255);
      });
      assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=3),JSON.stringify({series,pma,mode,clear,actual,expected}));
      results.push({mode,clear,actual});
    }
    checks.push({name:`${series} ${pma?'PMA':'straight'} texture normal/additive/multiply/screen GPU pixels`,result:results});
    console.log('PASS',checks.at(-1).name);
  }
};
