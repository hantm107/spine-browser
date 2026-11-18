const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {isAppPage}=require('../src/app-page');

const page=path.join(__dirname,'..','src','import.html');

test('app pages match their own file URL',()=>{
  assert.equal(isAppPage(pathToFileURL(page).href,page),true);
});

test('drive-letter and path case do not block app pages on case-insensitive systems',{skip:process.platform!=='win32'&&process.platform!=='darwin'},()=>{
  const url=pathToFileURL(page).href;
  assert.equal(isAppPage(url.toUpperCase().replace('FILE:','file:'),page),true);
  if(process.platform==='win32'){
    const lower=page[0].toLowerCase()+page.slice(1),upper=page[0].toUpperCase()+page.slice(1);
    assert.equal(isAppPage(pathToFileURL(upper).href,lower),true);
    assert.equal(isAppPage(pathToFileURL(lower).href,upper),true);
  }
});

test('other pages, schemes, queries and malformed URLs are rejected',()=>{
  const url=pathToFileURL(page).href;
  assert.equal(isAppPage(pathToFileURL(path.join(path.dirname(page),'index.html')).href,page),false);
  assert.equal(isAppPage(url+'?x=1',page),false);
  assert.equal(isAppPage(url+'#step',page),false);
  assert.equal(isAppPage('https://example.com/import.html',page),false);
  assert.equal(isAppPage('about:blank',page),false);
  assert.equal(isAppPage('',page),false);
  assert.equal(isAppPage('not a url',page),false);
});
