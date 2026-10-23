// Synthetic 3.0/3.1 reference fixtures, adapted to the archived Java wire
// layout. Includes weighted/linked meshes, constraints, curves, FFD and events.
const fs = require('node:fs');
const path = require('node:path');
const series = process.argv[2] || '3.1';
const early = series === '3.0';
const chunks = [];
const byte = n => chunks.push(Buffer.from([n & 255]));
function int(value, positive = true) { let n = positive ? value >>> 0 : ((value << 1) ^ (value >> 31)) >>> 0; do { const part = n & 127; n >>>= 7; byte(part | (n ? 128 : 0)); } while (n); }
function float(n) { const b = Buffer.alloc(4); b.writeFloatBE(n); chunks.push(b); }
function text(s) { if (s == null) return int(0); const b = Buffer.from(s); int(b.length + 1); chunks.push(b); }
function color() { chunks.push(Buffer.from('ffffffff', 'hex')); }
function values(...numbers) { numbers.forEach(float); }
function shorts(array) { int(array.length); for (const n of array) { byte(n >> 8); byte(n); } }
const vertices = [-32,-32,32,-32,32,32,-32,32].flatMap((_, i, array) => i % 2 ? [] : [1,0,array[i],array[i+1],1]);
const uvs = [0,1,1,1,1,0,0,0], triangles = [0,1,2,2,3,0];
const model = {
  skeleton: { hash: 'synthetic-32', spine: '3.2.01', width: 64, height: 64, images: './' },
  bones: [{name:'root'}, {name:'tip',parent:'root',x:30,length:20,shearX:5,shearY:-2}, {name:'target',parent:'root',x:20,y:25}],
  ik: [{name:'aim',bones:['tip'],target:'target',mix:0.5,bendPositive:false}],
  transform: [{name:'follow',bone:'tip',target:'target',rotateMix:0,translateMix:0.125,scaleMix:0,shearMix:0,x:2,y:3}],
  slots: [{name:'mesh',bone:'root',attachment:'quad'}, {name:'region',bone:'tip',attachment:'spark'}],
  skins: {default: {mesh: {quad:{type:'weightedmesh',path:'square',uvs,triangles,vertices,hull:4},linked:{type:'weightedlinkedmesh',path:'square',parent:'quad',ffd:true}},region:{spark:{path:'square',width:16,height:16,x:3,y:4}}}},
  events: {hit:{int:-7,float:0.5,string:'bang'}},
  animations: {idle:{slots:{mesh:{color:[{time:0,color:'ffffffff',curve:'stepped'},{time:1,color:'ffffffff'}],attachment:[{time:0,name:'quad'}]}},bones:{root:{rotate:[{time:0,angle:0,curve:[0.25,0,0.75,1]},{time:1,angle:60}],translate:[{time:0,x:0,y:0,curve:'stepped'},{time:1,x:4,y:2}],scale:[{time:0,x:1,y:1},{time:1,x:1.25,y:1.25}]}},ik:{aim:[{time:0,mix:0.5,bendPositive:false},{time:1,mix:1,bendPositive:true}]},ffd:{default:{mesh:{quad:[{time:0},{time:1,vertices:[3,4]}]}}},drawOrder:[{time:0},{time:1,offsets:[{slot:'mesh',offset:1}]}],events:[{time:0.25,name:'hit',int:-9,float:0.75,string:'zap'}]}}
};
model.skeleton.spine=series+'.07';
for(const b of model.bones){delete b.shearX;delete b.shearY;}
if(early){delete model.transform;delete model.skins.default.mesh.linked;}
text(model.skeleton.hash); text(model.skeleton.spine); values(64,64); byte(1); text('./');
int(3);
for (let i=0;i<3;i++) { const b=model.bones[i]; text(b.name); if(early)int(i?1:0);else if(i)int(0); values(b.x||0,b.y||0,1,1,0,b.length||0);byte(1);byte(1);color(); }
int(1); text('aim');int(1);int(1);int(2);float(0.5);byte(255);
if(!early){int(1);text('follow');int(1);int(2);values(0.125,2,3);}
int(2);for(let i=0;i<2;i++){text(model.slots[i].name);int(i);color();text(model.slots[i].attachment);int(0);}
int(2);int(0);int(early?1:2);
text('quad');text(null);byte(3);text('square');if(!early)color();int(early?8:4);values(...uvs);shorts(triangles);if(early)int(vertices.length);values(...vertices);if(early)color();int(4);shorts([]);values(64,64);
if(!early){text('linked');text(null);byte(5);text('square');color();text(null);text('quad');byte(1);values(64,64);}
int(1);int(1);text('spark');text(null);byte(0);text('square');values(3,4,1,1,0,16,16);color();
int(0); // additional skins
int(1);text('hit');int(-7,false);float(0.5);text('bang');
int(1);text('idle');
int(1);int(0);int(2); // slot timelines
byte(4);int(2);float(0);color();byte(1);float(1);color();
byte(3);int(1);float(0);text('quad');
int(1);int(0);int(3); // bone timelines
byte(1);int(2);values(0,0);byte(2);values(0.25,0,0.75,1);values(1,60);
byte(2);int(2);values(0,0,0);byte(1);values(1,4,2);
byte(0);int(2);values(0,1,1);byte(0);values(1,1.25,1.25);
int(1);int(0);int(2);values(0,0.5);byte(255);byte(0);values(1,1);byte(1);
// No transform timelines before 3.2.
int(1);int(0);int(1);int(0);int(1);text('quad');int(2);float(0);int(0);byte(0);float(1);int(2);int(0);values(3,4);
if(early){int(2);int(0);float(0);int(1);int(0);int(1);float(1);}else{int(2);float(0);int(0);float(1);int(1);int(0);int(1);}
int(1);float(0.25);int(0);int(-9,false);float(0.75);byte(1);text('zap');
const dir=path.join(__dirname,series);fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'spineboy-pro.skel'),Buffer.concat(chunks));
fs.writeFileSync(path.join(dir,'spineboy-pro.json'),JSON.stringify(model,null,2));
fs.writeFileSync(path.join(dir,'spineboy-pro.atlas'),'\nsquare.png\nsize: 16,16\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nsquare\n  rotate: false\n  xy: 0, 0\n  size: 16, 16\n  orig: 16, 16\n  offset: 0, 0\n  index: -1\n');

fs.copyFileSync(path.join(__dirname,'3.2/square.png'),path.join(dir,'square.png'));
