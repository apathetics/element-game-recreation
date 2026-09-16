import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const engines = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const browser = await engines[engine].launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
const base = process.env.ELEMENT_TEST_URL || 'http://127.0.0.1:8793';
const errors = [], output = resolve('test-results'); await mkdir(output,{recursive:true});
async function client() {
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#nickname').waitFor();return page;
}
try {
 const host=await client(),guest=await client();
 await host.locator('#nickname').fill('Willow');await host.locator('[data-do="create"]').click();await host.locator('#clock-minutes').waitFor();assert.equal(await host.locator('#clock-minutes').evaluate(n=>!n.disabled&&n.getBoundingClientRect().bottom<=innerHeight),true,'Host timer must be visible before scrolling');await host.locator('#clock-minutes').selectOption('5');
 await host.waitForFunction(()=>!document.querySelector('#clock-minutes').disabled);
 const code=await host.locator('.invite-box strong').innerText();
 await guest.locator('#nickname').fill('Ochre');await guest.locator('#invite-code').fill(code);await guest.locator('[data-do="join"]').click();
 assert.equal(await guest.locator('#clock-minutes').isDisabled(),true);assert.equal(await guest.locator('#clock-minutes').inputValue(),'5');
 await host.locator('[data-do="start"]').click();
 await Promise.all([host,guest].map(p=>p.locator('.player-clock').first().waitFor()));
 await Promise.all([host,guest].map(p=>p.locator('.opening-toss').waitFor()));
 assert.equal(await host.locator('.toss-result strong').innerText(),await guest.locator('.toss-result strong').innerText(),'Both players must see the same toss winner');
 await Promise.all([host,guest].map(p=>p.locator('.opening-toss').waitFor({state:'detached'})));
 const active=await host.locator('[data-do="draw"]').count()?host:guest, observer=active===host?guest:host;
 await active.evaluate(()=>{window.reveals=0;document.addEventListener('animationstart',e=>{if(e.animationName==='draw-reveal')window.reveals++;});});
 await observer.evaluate(()=>{window.reveals=0;document.addEventListener('animationstart',e=>{if(e.animationName==='draw-reveal')window.reveals++;});});
 await active.locator('[data-draw="4"]').click();await active.locator('[data-do="draw"]').click();
 await Promise.all([active,observer].map(p=>p.waitForFunction(()=>document.querySelectorAll('.draw-stone').length===4)));
 await observer.waitForFunction(()=>window.reveals===4);assert.equal(await active.evaluate(()=>window.reveals),4);
 assert.deepEqual(await active.locator('.draw-stone').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),await observer.locator('.draw-stone').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))));
 const board=await active.locator('.board-frame').boundingBox(),sidebar=await active.locator('.table-sidebar').boundingBox();assert.ok(sidebar.x>=board.x+board.width,'Activity must be to the right on desktop');
 await active.screenshot({path:resolve(output,`table-${engine}-desktop.png`),fullPage:true});
 await active.locator('[data-cell="0"]').click();await active.locator('.board-frame.is-saving').waitFor({state:'detached'});
 await observer.locator('.draw-stone.played').waitFor();assert.equal(await observer.evaluate(()=>window.reveals),4,'Placement does not repeat the draw reveal');
 const clockBefore=await active.locator('.clock-running').innerText();
 await active.reload();await active.locator('.clock-running').waitFor();
 assert.ok(await active.locator('.clock-running').innerText()<=clockBefore,'Refresh cannot add clock time');
 // Controlled pass-and-play position exercises river geometry and expiry quickly.
 await active.evaluate(async()=>{
  const {createGame}=await import('./src/game.js');const g=createGame([{id:'local-0',name:'Willow'},{id:'local-1',name:'Ochre'}],()=>0);
  g.phase='play';g.hand=['water','earth'];g.movesLeft=2;g.bag.water-=3;g.bag.earth--;
  g.drawn={turn:g.turn,playerId:'local-0',stones:['water','earth']};
  for(const pos of [12,13])g.board[pos]={element:'water',ids:[g.nextId++]};
  g.board[26]={element:'fire',ids:[g.nextId++]};g.bag.fire--;
  localStorage.setItem('element-table-v1',JSON.stringify({mode:'local',room:{code:'LOCAL',version:1,host:'local-0',capacity:2,members:g.players,game:g}}));
  history.replaceState(null,'',location.pathname);
 });
 await active.reload();await active.locator('[data-cell="14"]').click();for(const pos of [15,26,27])await active.locator(`[data-cell="${pos}"]`).click();
 await active.locator('[data-do="confirm"]').click();await active.locator('.river-overlay').waitFor();
 assert.equal(await active.locator('.river-token .water').count(),3);assert.equal(await active.locator('.river-token .fire').count(),1);
 await active.locator('.river-overlay').waitFor({state:'detached'});assert.equal(await active.locator('.river-arrival').count(),0);assert.equal(await active.locator('[data-cell="26"] .water').count(),1);
 await active.locator('[data-do="replay"]').click();await active.locator('.river-overlay').waitFor();await active.locator('.river-overlay').waitFor({state:'detached'});
 await active.locator('.feedback-settings summary').click();await active.locator('[data-pref="reduced"]').check();await active.locator('.feedback-settings summary').click();
 await active.locator('[data-do="replay"]').click();assert.equal(await active.locator('.river-overlay').count(),0);
 await active.setViewportSize({width:390,height:844});assert.equal(await active.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await active.screenshot({path:resolve(output,`table-${engine}-mobile.png`),fullPage:true});
 await active.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('element-table-v1'));saved.room.game.clock={remaining:{'local-0':1200,'local-1':300000},startedAt:Date.now()};localStorage.setItem('element-table-v1',JSON.stringify(saved));});
 await active.reload();await active.locator('.victory').waitFor();assert.match(await active.locator('.victory').innerText(),/Ochre[\s\S]*wins[\s\S]*Willow ran out of time/);
 assert.deepEqual(errors,[]);
 console.log(`PASS ${engine}: lobby clock, guest permissions, shared draw/reveal, played markers, right-side log, clock reload, river/fire animation and replay, reduced motion, mobile, timeout winner.`);
} finally {await browser.close();}
