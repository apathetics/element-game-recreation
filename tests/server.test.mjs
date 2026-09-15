import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

test('HTTP multiplayer: four identities, private rooms, version conflicts, retries and server restart', async t => {
  const dataDir = await mkdtemp(join(tmpdir(),'element-server-test-'));
  let server, base;
  async function start() {
    server = spawn(process.execPath,['scripts/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',ELEMENT_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
    let output='';
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Server startup timed out')),10000);
      server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){base=`http://127.0.0.1:${match[1]}`;clearTimeout(timer);resolve();}});
      server.on('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
    });
  }
  async function stop(){const closed=once(server,'exit');server.kill('SIGTERM');await closed;}
  t.after(async()=>{if(server?.exitCode===null)await stop();await rm(dataDir,{recursive:true,force:true});});
  await start();
  async function request(path,session,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(session?{Authorization:`Bearer ${session.token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
  const sessions=[];
  for(let i=0;i<5;i++)sessions.push((await request('/api/session',null,{})).body);
  const create={type:'create',name:'Host',capacity:4,requestId:randomUUID()};
  let result=await request('/api/command',sessions[0],create);assert.equal(result.status,200);let room=result.body.room;
  assert.equal((await request('/api/command',sessions[0],create)).body.room.code,room.code);
  assert.equal((await request(`/api/room?code=${room.code}`,sessions[4])).status,404);
  const joins=await Promise.all(sessions.slice(1,4).map((s,i)=>request('/api/command',s,{type:'join',code:room.code,name:`Friend ${i}`,requestId:randomUUID()})));
  assert.ok(joins.every(r=>r.status===200));
  room=(await request(`/api/room?code=${room.code}`,sessions[0])).body.room;assert.equal(room.members.length,4);
  assert.equal((await request('/api/command',sessions[4],{type:'join',code:room.code,name:'Extra',requestId:randomUUID()})).status,400);
  room=(await request('/api/command',sessions[0],{type:'start',code:room.code,version:room.version,requestId:randomUUID()})).body.room;
  const active=sessions.find(s=>s.id===room.game.players[room.game.active].id);
  const draw={type:'action',action:{type:'draw',count:4},code:room.code,version:room.version,requestId:randomUUID()};
  const [first,duplicate]=await Promise.all([request('/api/command',active,draw),request('/api/command',active,draw)]);
  assert.equal(first.status,200);assert.equal(duplicate.status,200);assert.equal(first.body.room.version,duplicate.body.room.version);
  assert.equal((await request('/api/command',active,{...draw,requestId:randomUUID()})).status,409);
  const before=first.body.room;
  for(const session of sessions.slice(0,4))assert.deepEqual((await request(`/api/room?code=${room.code}`,session)).body.room.game,before.game);
  assert.equal((await fetch(base+'/.data/tables.json')).status,404);assert.equal((await fetch(base+'/src/app.js')).status,200);assert.equal((await fetch(base+'/')).status,200);
  await stop();await start();
  const restored=(await request(`/api/room?code=${room.code}`,active)).body.room;assert.deepEqual(restored.game,before.game);assert.equal(restored.version,before.version);
});
