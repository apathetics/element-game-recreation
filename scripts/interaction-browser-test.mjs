// Run alongside the development server; this uses isolated pass-and-play fixtures.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const engines=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine=process.env.BROWSER_ENGINE || 'chromium';
const browser=await engines[engine].launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const base=process.env.ELEMENT_TEST_URL || 'http://127.0.0.1:8787';
const output=resolve('test-results');await mkdir(output,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function seed(kind='mixed'){
 await page.evaluate(async(kind)=>{
  const {createGame,at}=await import('./src/game.js');
  const g=createGame([{id:'local-0',name:'Willow'},{id:'local-1',name:'Ochre'}],()=>0);
  g.phase='play';g.hand=kind==='river'?['water','earth']:['wind','wind','earth'];g.movesLeft=2;
  for(const e of g.hand)g.bag[e]--;
  if(kind==='river'){for(const x of [1,2]){g.board[at(x,1)]={element:'water',ids:[g.nextId++]};g.bag.water--;}}
  localStorage.setItem('element-table-v1',JSON.stringify({mode:'local',room:{code:'LOCAL',version:1,host:'local-0',capacity:2,members:g.players,game:g}}));
 },kind);await page.reload();await page.locator('.action-dock').waitFor();
}
try{
 await page.goto(base);await seed();
 assert.equal(await page.locator('[data-element="wind"]').getAttribute('aria-pressed'),'true');
 await page.screenshot({path:resolve(output,`quick-flow-${engine}-desktop.png`),fullPage:true});
 await page.locator('[data-cell="0"]').click();assert.equal(await page.locator('[data-element="wind"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-cell="1"]').click();assert.equal(await page.locator('[data-element="earth"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-cell="0"]').click();assert.equal(await page.locator('[data-element="earth"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-cell="2"]').click();assert.equal(await page.locator('[data-do="sage"]').getAttribute('aria-pressed'),'true');
 for(let i=0;i<2;i++){await page.locator('.square.destination').first().click();if(i===0)assert.equal(await page.locator('[data-do="sage"]').getAttribute('aria-pressed'),'true');}
 await page.locator('[data-do="replay"]').click();assert.ok(await page.locator('.action-effect').count()>0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('element-table-v1')).room.game.turn),1);
 await page.locator('[data-do="end"]').click();assert.equal(await page.locator('.game-heading .eyebrow').innerText(),'TURN 02');
 await seed('river');await page.locator('[data-cell="14"]').click();await page.locator('.path-progress').waitFor();
 assert.equal(await page.locator('.action-dock').count(),0);assert.equal(await page.locator('[data-do="confirm"]').isDisabled(),true);
 await page.locator('[data-do="cancel"]').click();assert.equal(await page.locator('[data-element="water"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-cell="14"]').click();for(const i of [15,26,27])await page.locator(`[data-cell="${i}"]`).click();
 await page.locator('[data-do="confirm"]').click();assert.equal(await page.locator('[data-element="earth"]').getAttribute('aria-pressed'),'true');
 await page.locator('.feedback-settings summary').click();assert.equal(await page.locator('[data-pref="sound"]').isChecked(),false);
 await page.locator('[data-pref="sound"]').check();await page.locator('[data-pref="reduced"]').check();await page.reload();
 await page.locator('.feedback-settings summary').click();assert.equal(await page.locator('[data-pref="sound"]').isChecked(),true);assert.equal(await page.locator('[data-pref="reduced"]').isChecked(),true);
 await page.locator('.feedback-settings summary').click();await page.locator('[data-cell="0"]').click();
 assert.equal(await page.locator('[data-cell="0"] .stone').evaluate(n=>getComputedStyle(n).animationName),'none');
 await seed();await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,`quick-flow-${engine}-mobile.png`),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('.feedback-settings summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:resolve(output,`feedback-${engine}-mobile.png`),fullPage:true});
 assert.deepEqual(errors,[]);console.log(`PASS ${engine}: repeat placement, next element, continuous movement, explicit end, invalid placement, river preview/cancel/confirm, replay, saved audio/motion preferences, desktop/mobile layout.`);
}finally{await browser.close();}
