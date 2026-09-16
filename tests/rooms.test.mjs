import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { newRoom, commandRoom, cleanName } from '../src/rooms.js';
globalThis.crypto ??= webcrypto;
const command=(room,id,type,extra={})=>commandRoom(room,id,{type,version:room.version,requestId:crypto.randomUUID(),...extra},()=>0,Math.max(Date.now(),room.game?.opening?.readyAt || 0));
test('room membership, capacity and host permissions are enforced',()=>{
  let r=newRoom('a','A',2,'ABCDEFGH');
  assert.throws(()=>command(r,'a','start'),/every Sage/);
  r=command(r,'b','join',{name:'B'});
  assert.throws(()=>command(r,'c','join',{name:'C'}),/full/);
  assert.throws(()=>command(r,'b','start'),/creator/);
  r=command(r,'a','start');
  assert.throws(()=>command(r,'c','action',{action:{type:'draw',count:0}}),/not a member/);
  assert.throws(()=>command(r,'b','action',{action:{type:'draw',count:0}}),/another Sage/);
  assert.throws(()=>command(r,'a','leave'),/seat is saved/);
  assert.throws(()=>command(r,'a','rematch'),/Finish/);
});
test('stale actions are rejected; retrying the same successful request is idempotent',()=>{
  let r=newRoom('a','A',2,'ABCDEFGH'); r=command(r,'b','join',{name:'B'}); r=command(r,'a','start');
  const request={type:'action',version:r.version,requestId:crypto.randomUUID(),action:{type:'draw',count:4}};
  const next=commandRoom(r,'a',request,()=>0,r.game.opening.readyAt);
  assert.equal(commandRoom(next,'a',request),next);
  assert.throws(()=>commandRoom(next,'a',{...request,requestId:crypto.randomUUID()}),/table changed/);
  assert.equal(next.game.bag.fire,26);
});
test('leaving a lobby transfers table ownership and allows a replacement player',()=>{
  let r=newRoom('a','A',2,'ABCDEFGH'); r=command(r,'b','join',{name:'B'}); r=command(r,'a','leave');
  assert.equal(r.host,'b'); r=command(r,'c','join',{name:'C'}); r=command(r,'b','start'); assert.equal(r.game.players.length,2);
});
test('invalid names, capacities and command envelopes cannot mutate a table',()=>{
  assert.throws(()=>cleanName('  ')); assert.throws(()=>cleanName('x'.repeat(25))); assert.equal(cleanName(' A   B '),'A B');
  assert.throws(()=>newRoom('a','A',5,'ABCDEFGH'));
  const r=newRoom('a','A',2,'ABCDEFGH'); assert.throws(()=>commandRoom(r,'a',{type:'start'}));
});

test('opening toss is server-selected, stable on retry, and does not consume clock time',()=>{
 for(const count of [2,3,4])for(let first=0;first<count;first++){
  let r=newRoom('a','A',count,'ABCDEFGH');for(const id of ['b','c','d'].slice(0,count-1))r=command(r,id,'join',{name:id});
  r=command(r,'a','configure',{clockMinutes:5});
  const start={type:'start',version:r.version,requestId:crypto.randomUUID()};
  r=commandRoom(r,'a',start,()=>first,1000);
  assert.equal(r.game.opening.winnerId,r.game.players[first].id);
  assert.equal(r.game.clock.startedAt,r.game.opening.readyAt);
  assert.equal(commandRoom(r,'a',start,()=>0,2000),r,'A retry must not reroll the toss');
  const draw={type:'action',version:r.version,requestId:crypto.randomUUID(),action:{type:'draw',count:0}};
  assert.throws(()=>commandRoom(r,r.game.opening.winnerId,draw,()=>0,r.game.opening.readyAt-1),/opening toss/);
  const next=commandRoom(r,r.game.opening.winnerId,draw,()=>0,r.game.opening.readyAt);
  assert.equal(next.game.clock.remaining[r.game.opening.winnerId],300000);
 }
});
