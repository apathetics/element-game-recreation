// Hold command responses to verify immediate feedback without a real network delay.
import assert from 'node:assert/strict';
import {createGame,applyAction} from '../src/game.js';
import {startClock,applyTimedAction} from '../src/clock.js';
const engines=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await engines[process.env.BROWSER_ENGINE || 'chromium'].launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const base=process.env.ELEMENT_TEST_URL || 'http://127.0.0.1:8787';
const messages=[];
// JSON storage may change key order; confirmation must still preserve the token.
const storedDocument=value=>JSON.parse(JSON.stringify(value,(_,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry));
try {
 for(const outcome of ['accept','timed','reject','lost-reply','stale']){
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();page.on('pageerror',e=>messages.push(e.message));
  const game=createGame([{id:'a',name:'Willow'},{id:'b',name:'Ochre'}],()=>0);game.phase='play';game.hand=['wind','wind','earth'];game.bag.wind-=2;game.bag.earth--;game.movesLeft=2;if(outcome==='timed')startClock(game,5,Date.now());
  let authoritative={code:'ABCDEFGH',version:1,host:'a',capacity:2,members:game.players,game};let release;const held=new Promise(resolve=>release=resolve);const ids=[];
  await page.addInitScript(()=>{localStorage.setItem('element-table-v1',JSON.stringify({mode:'online',code:'ABCDEFGH'}));window.animationStarts=0;document.addEventListener('animationstart',e=>{if(e.animationName==='stone-settle')window.animationStarts++;});});
  await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:'export default {transport:"local"};'}));
  await page.route('**/api/session',route=>route.fulfill({json:{id:'a',token:'test-session'}}));
  await page.route('**/api/room?*',route=>route.fulfill({json:{room:authoritative}}));
  await page.route('**/api/command',async route=>{
   const input=route.request().postDataJSON();if(input.type==='sync'){await route.fulfill({json:{room:authoritative,serverTime:Date.now()}});return;}ids.push(input.requestId);
   if(ids.length===1){
    if(outcome==='timed')authoritative={...authoritative,version:2,game:applyTimedAction(authoritative.game,'a',input.action,Date.now())};
    if(outcome==='accept'||outcome==='lost-reply')authoritative={...authoritative,version:2,game:applyAction(authoritative.game,'a',input.action)};
    if(outcome==='stale')authoritative={...authoritative,version:2,game:applyAction(authoritative.game,'a',{type:'place',element:'earth',pos:2})};
    await held;
    if(outcome==='lost-reply'){await route.abort('failed');return;}
   }
   if(outcome==='reject'||outcome==='stale'){await route.fulfill({status:409,json:{error:'The table changed. Please try your action again.'}});return;}
   await route.fulfill({json:{room:storedDocument(authoritative)}});
  });
  await page.goto(base);await page.locator('.action-dock').waitFor();
  const clickAt=Date.now();await page.locator('[data-cell="0"]').click();await page.locator('[data-cell="0"] .stone.wind').waitFor({timeout:1000});
  assert.equal(await page.locator('.board-frame.is-saving').count(),1);assert.equal(await page.locator('[data-do="end"]').isDisabled(),true);
  assert.equal(await page.locator('.dock-help').count(),0);assert.equal(await page.getByText('Next element selects automatically.',{exact:false}).count(),0);
  await page.evaluate(()=>window.previewToken=document.querySelector('[data-cell="0"] .stone'));
  await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.animationStarts),1);
  await page.locator('[data-cell="1"]').click();assert.equal(ids.length,1,'Do not submit another move before acknowledgement');
  const feedbackMs=Date.now()-clickAt-350;
  release();await page.locator('.board-frame.is-saving').waitFor({state:'detached'});
  if(outcome==='accept'||outcome==='timed'||outcome==='lost-reply'){
   assert.equal(await page.locator('[data-cell="0"] .stone.wind').count(),1);
   assert.equal(await page.evaluate(()=>window.previewToken===document.querySelector('[data-cell="0"] .stone')),true,'Keep the animated token on acknowledgement');
   assert.equal(await page.evaluate(()=>window.animationStarts),1,'Do not animate twice');
   assert.equal(await page.locator('[data-element="wind"] .hand-count').innerText(),'1');
   if(outcome==='lost-reply'){assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);}
  }else{
   assert.equal(await page.locator('[data-cell="0"] .stone').count(),0,'Roll back unaccepted placement');
   assert.equal(await page.locator('[data-element="wind"] .hand-count').innerText(),'2');
   assert.ok(await page.locator('#notice').textContent());
   if(outcome==='stale')assert.equal(await page.locator('[data-cell="2"] .stone.earth').count(),1,'Show the newer authoritative board');
  }
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('element-table-v1')));assert.equal(saved.room,undefined,'Never persist a speculative board');
  console.log(`PASS ${outcome}: immediate preview before held server reply; acknowledgement/recovery verified (${feedbackMs}ms including automation overhead).`);await context.close();
 }
 assert.deepEqual(messages,[]);
}finally{await browser.close();}
