// Optional browser checks. Install Playwright separately, or point
// PLAYWRIGHT_MODULE at an existing installation. Run with npm start active.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const base=process.env.ELEMENT_TEST_URL || 'http://127.0.0.1:8787';
const output=resolve('test-results');await mkdir(output,{recursive:true});
const errors=[];
async function pageFor(viewport={width:1440,height:1100}){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#nickname').waitFor();return {page,context};
}
async function saved(page){return await page.evaluate(()=>JSON.parse(localStorage.getItem('element-table-v1')));}
async function snapshot(page){return await page.evaluate(async()=>{const code=JSON.parse(localStorage.getItem('element-table-v1')).code;return await (await import('./src/api.js')).getRoom(code);});}
try {
  const clients=await Promise.all(Array.from({length:4},()=>pageFor()));
  const host=clients[0].page;
  await host.screenshot({path:resolve(output,'home-desktop.png'),fullPage:true});
  await host.locator('#nickname').fill('Juniper');await host.locator('[data-capacity="4"]').click();await host.locator('[data-do="create"]').click();
  await host.locator('.invite-box strong').waitFor();const code=await host.locator('.invite-box strong').innerText();
  await Promise.all(clients.slice(1).map(async({page},i)=>{
    await page.goto(`${base}/#room=${code}`);await page.locator('#nickname').fill(['River','Ember','Stone'][i]);await page.locator('[data-do="join"]').click();await page.locator('.seats').waitFor();
  }));
  await host.locator('.seat.occupied').nth(3).waitFor();await host.screenshot({path:resolve(output,'lobby-desktop.png'),fullPage:true});
  await host.locator('[data-do="start"]').click();await host.locator('.board-section').waitFor();
  await Promise.all(clients.map(async({page})=>{await page.locator('.board-section').waitFor();}));
  let room=await snapshot(host);const current=room.game.players[room.game.active];
  // Concurrent joins can change member order. Resolve each page's real identity.
  let activePage;
  for(const {page} of clients){const id=await page.evaluate(async()=>await(await import('./src/api.js')).identity());if(id===current.id)activePage=page;}
  assert.ok(activePage);await activePage.locator('[data-draw="1"]').click();await activePage.locator('[data-do="draw"]').click();await activePage.locator('.hand-stone').waitFor();
  await activePage.locator('.hand-stone').first().click();await activePage.locator('[data-cell="0"]').click();await activePage.locator('.empty-hand').waitFor();
  await activePage.locator('[data-do="sage"]').click();await activePage.locator('.square.destination').first().click();
  await activePage.locator('[data-do="end"]').click();
  const after=await snapshot(activePage);assert.equal(after.game.turn,2);
  await host.reload();await host.locator('.board-section').waitFor();assert.deepEqual((await snapshot(host)).game,after.game);
  await host.screenshot({path:resolve(output,'game-desktop.png'),fullPage:true});
  // Host departure does not stop other players or discard the table.
  await host.close();
  const surviving=clients.find(c=>c.page!==host);assert.equal((await snapshot(surviving.page)).game.turn,2);
  await surviving.context.setOffline(true);await surviving.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await surviving.page.locator('.connection.disconnected').waitFor();await surviving.context.setOffline(false);await surviving.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await surviving.page.locator('.connection:not(.disconnected)').waitFor();
  const mobile=await pageFor({width:390,height:844});
  await mobile.page.screenshot({path:resolve(output,'home-mobile.png'),fullPage:true});
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await mobile.page.locator('#nickname').fill('Willow');await mobile.page.locator('[data-do="local"]').click();await mobile.page.locator('[data-do="start"]').click();await mobile.page.locator('.board-section').waitFor();
  await mobile.page.screenshot({path:resolve(output,'game-mobile.png'),fullPage:true});
  assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await mobile.page.getByRole('button',{name:'Element guide'}).click();await mobile.page.locator('dialog[open]').waitFor();assert.ok(await mobile.page.getByText('AGREED HOUSE RULES',{exact:true}).isVisible());await mobile.page.locator('[data-do="close-rules"]').click();
  // Load a controlled local position to exercise the river-preview UI.
  await mobile.page.evaluate(async()=>{
    const {createGame,at}=await import('./src/game.js');const g=createGame([{id:'local-0',name:'Willow'},{id:'local-1',name:'Ochre'}],()=>0);
    g.phase='play';g.hand=['water'];g.bag.water-=3;g.movesLeft=1;
    g.board[at(1,1)]={element:'water',ids:[g.nextId++]};g.board[at(2,1)]={element:'water',ids:[g.nextId++]};
    localStorage.setItem('element-table-v1',JSON.stringify({mode:'local',room:{code:'LOCAL',version:1,host:'local-0',capacity:2,members:g.players,game:g}}));
  });
  await mobile.page.reload();await mobile.page.locator('[data-element="water"]').click();await mobile.page.locator('[data-cell="14"]').click();
  await mobile.page.locator('.path-progress').waitFor();
  for(const cell of [15,26,27])await mobile.page.locator(`[data-cell="${cell}"]`).click();
  await mobile.page.screenshot({path:resolve(output,'river-mobile.png'),fullPage:true});
  await mobile.page.locator('[data-do="confirm"]').click();await mobile.page.locator('.empty-hand').waitFor();
  let local=await saved(mobile.page);assert.equal(local.room.game.board[27].element,'water');assert.equal(local.room.game.board[12],null);
  await mobile.page.reload();await mobile.page.locator('.empty-hand').waitFor();assert.equal((await saved(mobile.page)).room.game.board[27].element,'water');
  assert.deepEqual(errors,[]);console.log('PASS: 4-player browser flow, draw/place/move/end, reload, host departure, reconnect, mobile, rules dialog and river preview.');
  console.log(`Screenshots: ${output}`);
} catch(error) {
  for(const [i,context] of browser.contexts().entries())for(const [j,page] of context.pages().entries()){
    await page.screenshot({path:resolve(output,`failure-${i}-${j}.png`),fullPage:true}).catch(()=>{});
    console.log('BROWSER STATE',i,j,(await page.locator('#notice').textContent().catch(()=>'')));
  }
  throw error;
} finally {await browser.close();}
