import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { newRoom, commandRoom, cleanName } from '../src/rooms.js';
globalThis.crypto ??= webcrypto;
const command=(room,id,type,extra={})=>commandRoom(room,id,{type,version:room.version,requestId:crypto.randomUUID(),...extra},()=>0);
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
  const next=commandRoom(r,'a',request,()=>0);
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
