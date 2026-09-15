import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { createHandler } from '../supabase/functions/table/handler.js';
globalThis.crypto ??= webcrypto;

test('production handler validates identity and uses atomic versions under concurrent joins and actions', async()=>{
  const rows=[], users=Array.from({length:5},()=>randomUUID());
  let authReads=0, writes=0;
  const fetchImpl=async(input,options={})=>{
    const url=new URL(input),headers=options.headers;
    assert.equal(headers.apikey,'server-secret');
    const respond=(data,status=200)=>new Response(JSON.stringify(data),{status});
    if(url.pathname==='/auth/v1/user'){
      authReads++;const id=headers.Authorization.replace('Bearer ','');
      return users.includes(id)?respond({id,role:'authenticated'}):respond({error:'invalid'},401);
    }
    assert.equal(headers.Authorization,'Bearer server-secret');
    let matches=rows.filter(row=>[...url.searchParams].every(([key,value])=>{
      if(['select','limit'].includes(key))return true;
      if(value.startsWith('gte.'))return true;
      return String(row[key])===value.slice(3);
    }));
    if(options.method==='POST'){
      const row=JSON.parse(options.body);
      if(rows.some(r=>r.code===row.code||(r.creator_id===row.creator_id&&r.create_request===row.create_request)))return respond({code:'23505'},409);
      rows.push(row);writes++;return respond([row]);
    }
    if(options.method==='PATCH'){
      for(const row of matches)Object.assign(row,JSON.parse(options.body));
      writes+=matches.length;return respond(matches);
    }
    return respond(matches);
  };
  const handler=createHandler({url:'https://example.supabase.co',serviceKey:'server-secret',fetchImpl});
  async function command(user,body){const response=await handler(new Request('https://example.supabase.co/functions/v1/table',{method:'POST',headers:{Authorization:`Bearer ${user}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),...body})}));return {status:response.status,...await response.json()};}
  assert.equal((await command('forged',{type:'create',name:'Fake',capacity:2})).status,401);assert.equal(writes,0);
  const create={type:'create',name:'Host',capacity:4,requestId:randomUUID()};
  let result=await command(users[0],create);assert.equal(result.status,200);let room=result.room;
  assert.equal((await command(users[0],create)).room.code,room.code);assert.equal(rows.length,1);
  const joins=await Promise.all(users.slice(1,4).map((user,i)=>command(user,{type:'join',name:`Friend ${i}`,code:room.code})));
  assert.ok(joins.every(r=>r.status===200));room=rows[0].document;assert.equal(room.members.length,4);assert.equal(rows[0].member_ids.length,4);
  assert.equal((await command(users[4],{type:'action',code:room.code,version:room.version,action:{type:'draw',count:0}})).status,400);
  assert.equal((await command(users[1],{type:'start',code:room.code,version:room.version})).status,400);
  assert.equal((await command(users[1],{type:'configure',code:room.code,version:room.version,clockMinutes:5})).status,400);
  room=(await command(users[0],{type:'configure',code:room.code,version:room.version,clockMinutes:5})).room;
  room=(await command(users[0],{type:'start',code:room.code,version:room.version})).room;
  const draw={type:'action',code:room.code,version:room.version,action:{type:'draw',count:4},requestId:randomUUID()};
  const active=room.game.players[room.game.active].id;
  const [a,b]=await Promise.all([command(active,draw),command(active,draw)]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.room.version,b.room.version);
  assert.equal(rows[0].document.game.hand.length,4);
  assert.equal((await command(active,{...draw,requestId:randomUUID()})).status,409);
  rows[0].document.game.clock.startedAt=Date.now()-300001;
  const expired=await command(users[1],{type:'sync',code:room.code,now:0});
  assert.equal(expired.room.game.finishReason,'timeout');
  assert.equal(expired.room.game.clock.remaining[active],0);
  assert.equal(typeof expired.serverTime,'number');
  const finished = expired.room.game;
  assert.deepEqual(finished.winners,[finished.players[(finished.active - 1 + finished.players.length) % finished.players.length].id]);
  assert.ok(authReads>10);
});
