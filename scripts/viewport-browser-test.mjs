import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const engines=await import(process.env.PLAYWRIGHT_MODULE || 'playwright'),engine=process.env.BROWSER_ENGINE || 'chromium';
const browser=await engines[engine].launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.ELEMENT_TEST_URL || 'http://127.0.0.1:8794';
await mkdir('test-results',{recursive:true});
async function fits(selector,label){
 const result=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:n.getAttribute('aria-label')||n.textContent.trim(),fits:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,clickable:n.disabled||n.contains(hit),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}));
 assert.ok(result.length,`${label}: no controls found`);assert.deepEqual(result.filter(r=>!r.fits||!r.clickable),[],label);
 assert.equal(await page.evaluate(()=>scrollY),0,`${label}: test must not auto-scroll`);
}
async function fixture(kind){
 await page.evaluate(async kind=>{
  const {createGame}=await import('./src/game.js');const players=['Willow','Ochre','Ivory','Slate'].map((name,i)=>({id:`local-${i}`,name}));
  const g=createGame(players,()=>0);g.clock={remaining:Object.fromEntries(players.map(p=>[p.id,300000])),startedAt:Date.now()};
  if(kind!=='draw'){g.phase='play';g.hand=kind.startsWith('river')?['water']:kind==='fire'?['fire']:['fire','water','earth','wind'];g.movesLeft=1;}
  if(kind==='river')for(const pos of [12,13])g.board[pos]={element:'water',ids:[g.nextId++]};
  if(kind==='river-choice')for(const pos of [3,13,15,25])g.board[pos]={element:'water',ids:[g.nextId++]};
  if(kind==='river-long')for(let pos=11;pos<21;pos++)g.board[pos]={element:'water',ids:[g.nextId++]};
  if(kind==='fire'){g.bag.fire=1;for(const pos of [1,11])g.board[pos]={element:'fire',ids:[g.nextId++]};}
  localStorage.setItem('element-table-v1',JSON.stringify({mode:'local',room:{code:'LOCAL',version:1,host:'local-0',capacity:4,members:players,game:g}}));history.replaceState(null,'',location.pathname);
 },kind);await page.reload();await page.locator('.board-section').waitFor();
}
try{
 await page.setViewportSize({width:1280,height:720});await page.goto(base);await page.locator('#nickname').fill('Host');await page.locator('[data-capacity="4"]').click();await page.locator('[data-do="local"]').click();
 await fits('#clock-minutes,[data-do="start"],[data-do="leave"]','Four-player lobby');
 await page.locator('#clock-minutes').selectOption('10');await page.reload();assert.equal(await page.locator('#clock-minutes').inputValue(),'10');
 await page.screenshot({path:resolve(`test-results/lobby-${engine}-viewport.png`)});
 await page.locator('[data-do="start"]').click();await page.locator('.opening-toss').waitFor();assert.equal(await page.locator('[data-do="draw"]').count(),0);
 const opening=await page.evaluate(()=>JSON.parse(localStorage.getItem('element-table-v1')).room.game.opening);await page.reload();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('element-table-v1')).room.game.opening),opening,'Reload cannot reroll the toss');
 await page.locator('.opening-toss').waitFor({state:'detached'});
 for(const [width,height] of [[1440,900],[1280,720],[1024,768],[1366,650],[1024,576],[900,600]]){
  await page.setViewportSize({width,height});
  for(const kind of ['draw','play','river','river-choice','river-long','fire']){
   await fixture(kind);
   if(kind==='river'){await page.locator('[data-cell="14"]').click();for(const pos of [15,26,27])await page.locator(`[data-cell="${pos}"]`).click();}
   if(kind==='river-choice'){await page.locator('[data-cell="14"]').click();assert.equal(await page.locator('[data-line]').count(),4);}
   if(kind==='river-long'){await page.locator('[data-cell="21"]').click();for(const pos of [32,43,54,65,76,87,98,109,120,119,118])await page.locator(`[data-cell="${pos}"]`).click();assert.equal(await page.locator('.path-progress .complete').count(),11);}
   if(kind==='fire'){await page.locator('[data-cell="0"]').click();await page.locator('[data-cell="2"]').click();}
   await fits('.turn-panel button',`${width}x${height} ${kind}`);
   await fits('.board-frame',`${width}x${height} full board`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1),false,`${width}x${height} ${kind}: no page scroll ${JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('.game-layout *')].filter(n=>n.getBoundingClientRect().bottom>innerHeight+1).slice(-8).map(n=>({class:n.className,bottom:n.getBoundingClientRect().bottom}))))}`);
   if(width===1280)await page.screenshot({path:resolve(`test-results/viewport-${engine}-${kind}.png`)});
  }
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${engine}: visible host timer, persisted selection, stable toss, board and all draw/play/river/fire controls fit six desktop viewports without scrolling.`);
}finally{await browser.close();}
