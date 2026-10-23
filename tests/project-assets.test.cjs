const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assets = require('../project-assets');
const {groupAssets}=require('../asset-groups');
const categories=require('../category-store');
test('categories support hundreds of distinct RGB colors and validate names',()=>{
  const list=[];
  assert.throws(()=>categories.create(list,'','empty'),/name/);
  categories.create(list,'Fire','0');assert.throws(()=>categories.create(list,' fire ','duplicate'),/unique/);
  for(let i=1;i<8;i++)categories.create(list,'Category '+i,String(i));
  assert.equal(new Set(list.map(c=>c.color)).size,8);
  for(let i=8;i<500;i++)categories.create(list,'Category '+i,String(i));
  assert.equal(list.length,500);assert.equal(new Set(list.map(c=>c.color)).size,500);
  assert.ok(list.every(c=>/^#[0-9a-f]{6}$/.test(c.color)));
  const remaining=categories.remove(list,'0');const added=categories.create(remaining,'Replacement','new');assert.equal(added.color,categories.COLORS[0]);
});
test('category membership is independent and rename preserves tags',()=>{
  const list=[];categories.create(list,'Fire','fire');categories.create(list,'Explosion','explosion');
  const project={id:'D:/effects/a.spine',fullPath:'D:/effects/a.spine'};
  categories.assign(list,'fire',project,true);categories.assign(list,'explosion',project,true);
  categories.rename(list,'fire','Flames');assert.ok(list[0].assets[project.id]);
  categories.assign(list,'fire',project,false);assert.ok(list[1].assets[project.id]);assert.equal(list[0].assets[project.id],undefined);
  assert.equal(categories.remove(list,'fire')[0].assets[project.id].fullPath,project.fullPath);
});

test('grouping merges alternate formats and numbered projects without merging ambiguous siblings',()=>{
  const file=(name,dir='root')=>({fullPath:`C:/${dir}/${name}`,id:`C:/${dir}/${name}`,fileName:name,name:name.replace(/\.[^.]+$/,''),folder:dir,isDirectSpineFile:name.endsWith('.spine'),size:1});
  let groups=groupAssets([file('001.spine'),file('effect.skel'),file('effect.json')]);
  assert.equal(groups.length,1);assert.equal(groups[0].fileName,'001.spine');assert.equal(groups[0].files.length,3);
  groups=groupAssets([file('001.spine'),file('effect.skel'),file('other.json')]);assert.equal(groups.length,3);
  groups=groupAssets([file('effect.skel'),file('effect.json'),file('effect.json','different')]);assert.equal(groups.length,2);
});

const json = (version = '4.3.13') => JSON.stringify({ skeleton: { spine: version }, bones: [{ name: 'root' }], animations: { Idle: {} } });
async function fixture(t, files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spine-browser-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const [name, data] of Object.entries(files)) await fs.writeFile(path.join(dir, name), data);
  return dir;
}

test('routes the real 3.6 binary to its own runtime without an editor subprocess', async () => {
  const result = await assets.detectSpineFileCompatibility(path.join(__dirname, 'fixtures/3.6/spineboy-pro.skel'));
  assert.equal(result.fileVersion, '3.6.32');
  assert.equal(result.runtime, 'legacy36');
  assert.equal(result.mismatch, false);
});

test('routes every supported series to a matching runtime and rejects unknown versions', async t => {
  const dir = await fixture(t, { 'modern.json': json(), 'other.json': json('4.4.1'), 'old.json': json('3.9.99'), 'bad.skel': 'not an export' });
  assert.equal((await assets.detectSpineFileCompatibility(path.join(dir, 'modern.json'))).runtime, 'modern');
  for (const file of ['other.json', 'old.json', 'bad.skel']) assert.equal((await assets.detectSpineFileCompatibility(path.join(dir, file))).mismatch, true);
  for (const series of ['2.0','2.1','3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','4.0','4.1','4.2','4.3']) {
    const file = path.join(dir, `${series}.json`);
    await fs.writeFile(file, json(`${series}.99`));
    const result = await assets.detectSpineFileCompatibility(file);
    assert.equal(result.series, series);
    assert.equal(result.mismatch, false);
    assert.ok(result.runtimeVersion.startsWith(series));
  }
});

test('detects the version from binary fixtures for every supported series', async () => {
  for (const series of ['2.0','2.1','3.0','3.1','3.2','3.3','3.4','3.5','3.6','3.7','3.8','4.0','4.1','4.2']) {
    const result = await assets.detectSpineFileCompatibility(path.join(__dirname, 'fixtures', series, 'spineboy-pro.skel'));
    assert.equal(result.series, series);
    assert.equal(result.mismatch, false);
  }
});

test('scans JSON skeletons, ignores application JSON and reports root folders correctly', async t => {
  const dir = await fixture(t, { 'VALID.JSON': json(), 'settings.json': '{}', 'null.json': 'null', 'broken.json': '{', 'raw.spine': 'raw' });
  const result = await assets.scanDirectory(dir);
  assert.deepEqual(result.projects.map(p => p.fileName).sort(), ['VALID.JSON', 'raw.spine'].sort());
  assert.ok(result.projects.every(p => p.folder === '(root)'));
});

test('discovers BOM-prefixed JSON exports for every supported runtime', async t => {
  const series = Object.keys(require('../runtime-catalog'));
  const dir = await fixture(t, Object.fromEntries(series.map(version => [`${version}.JSON`, '\uFEFF' + json(`${version}.99`)])));
  const result = await assets.scanDirectory(dir);
  assert.equal(result.projects.length, series.length);
  assert.equal(result.warnings.length, 0);
  for (const project of result.projects) {
    const compatibility = await assets.detectSpineFileCompatibility(project.fullPath);
    assert.equal(compatibility.series, project.name);
    assert.equal(compatibility.mismatch, false);
  }
});

test('JSON-only exports can use a sole differently named atlas without guessing between skeletons', async t => {
  const dir = await fixture(t, { 'hero-pro.JSON': '\uFEFF' + json(), 'textures.atlas': '', 'settings.json': '{}' });
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'hero-pro.JSON'))).atlasPath, path.join(dir, 'textures.atlas'));
  await fs.writeFile(path.join(dir, 'other.json'), json());
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'hero-pro.JSON'))).skeletonPath, null);
  await fs.unlink(path.join(dir, 'other.json'));
  await fs.writeFile(path.join(dir, 'other.atlas'), '');
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'hero-pro.JSON'))).skeletonPath, null);
});

test('numbered projects resolve one skeleton exported as both JSON and binary', async t => {
  const dir = await fixture(t, { '001.spine': '', 'hero.json': json(), 'hero.skel': '', 'textures.atlas': '' });
  const pair = await assets.findSkeletonAssetPair(path.join(dir, '001.spine'));
  assert.equal(pair.skeletonPath, path.join(dir, 'hero.skel'));
  assert.equal(pair.atlasPath, path.join(dir, 'textures.atlas'));
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'hero.json'))).skeletonPath, path.join(dir, 'hero.json'));
  await fs.unlink(path.join(dir, 'hero.skel'));
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, '001.spine'))).skeletonPath, path.join(dir, 'hero.json'));
});

test('an exact JSON export beats an unrelated binary; mismatched atlas is rejected', async t => {
  const dir = await fixture(t, { 'valid.spine': '', 'valid.json': json(), 'valid.atlas': '', 'alpha.skel': '', 'beta.skel': '', 'beta.atlas': '' });
  const exact = await assets.findSkeletonAssetPair(path.join(dir, 'valid.spine'));
  assert.equal(exact.skeletonPath, path.join(dir, 'valid.json'));
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'alpha.skel'))).skeletonPath, null);
  assert.equal((await assets.findSkeletonAssetPair(path.join(dir, 'beta.skel'))).skeletonPath, path.join(dir, 'beta.skel'));
});

test('raw projects are not playable; numbered projects can resolve a single complete export', async t => {
  const raw = await fixture(t, { 'raw.spine': '', 'raw.atlas': '' });
  assert.equal((await assets.findSkeletonAssetPair(path.join(raw, 'raw.spine'))).skeletonPath, null);
  const numbered = await fixture(t, {'001.spine':'','export.json':json(),'export.atlas':''});
  const pair = await assets.findSkeletonAssetPair(path.join(numbered,'001.spine'));
  assert.equal(path.basename(pair.skeletonPath), 'export.json');
});

test('case-insensitive export and atlas matching preserves actual paths', async t => {
  const dir = await fixture(t, { 'Hero.SKEL': '', 'hero.ATLAS': '' });
  const pair = await assets.findSkeletonAssetPair(path.join(dir, 'Hero.SKEL'));
  assert.equal(pair.atlasPath, path.join(dir, 'hero.ATLAS'));
});

test('continues past unreadable subfolders and rejects an unreadable root', async t => {
  const dir = await fixture(t, { 'valid.json': json() });
  await fs.mkdir(path.join(dir, 'blocked'));
  const original = fs.readdir;
  t.mock.method(fs, 'readdir', async (target, options) => {
    if (path.basename(target) === 'blocked') throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
    return original(target, options);
  });
  const result = await assets.scanDirectory(dir);
  assert.equal(result.projects.length, 1);
  assert.equal(result.warnings.length, 1);
  await assert.rejects(assets.scanDirectory(path.join(dir, 'blocked')), /Access denied/);
});
