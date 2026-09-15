import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, commandRoom } from '../src/rooms.js';
import { clockRemaining } from '../src/clock.js';
const send = (room, id, type, now, extra = {}) => commandRoom(room, id, { type, version: room.version, requestId: crypto.randomUUID(), ...extra }, () => 0, now);
function table(players = 2) {
  let r = newRoom('a', 'A', players, 'ABCDEFGH');
  for (const id of ['b','c','d'].slice(0, players - 1)) r = send(r, id, 'join', 0, {name:id.toUpperCase()});
  return r;
}
test('only the lobby host can configure a supported clock, which starts with the game', () => {
  let r = table();
  assert.throws(() => send(r, 'b', 'configure', 0, {clockMinutes:5}), /creator/);
  for (const value of [-1,1,Infinity,'5']) assert.throws(() => send(r, 'a', 'configure', 0, {clockMinutes:value}), /available/);
  r = send(r, 'a', 'configure', 10, {clockMinutes:5});
  assert.equal(r.game, null);
  r = send(r, 'a', 'start', 1000);
  assert.equal(clockRemaining(r.game, 'a', 2000), 299000);
  assert.equal(clockRemaining(r.game, 'b', 2000), 300000);
  assert.throws(() => send(r, 'a', 'configure', 2000, {clockMinutes:10}), /before/);
});
test('drawing and moving consume the same clock; ending switches it; reload and retry do not reset it', () => {
  let r = send(send(table(), 'a', 'configure', 0, {clockMinutes:5}), 'a', 'start', 1000);
  const action = { type:'action', action:{type:'draw',count:0}, version:r.version, requestId:crypto.randomUUID() };
  r = commandRoom(r, 'a', action, () => 0, 11000);
  assert.equal(r.game.clock.remaining.a, 290000);
  assert.equal(commandRoom(r, 'a', action, () => 0, 21000), r);
  assert.equal(clockRemaining(JSON.parse(JSON.stringify(r.game)), 'a', 21000), 280000);
  r = send(r, 'a', 'action', 21000, {action:{type:'end'}});
  assert.equal(clockRemaining(r.game, 'a', 31000), 280000);
  assert.equal(clockRemaining(r.game, 'b', 31000), 290000);
  const version = r.version;
  r = send(r, 'a', 'timeout', 31000);
  assert.equal(r.version, version, 'Early timeout checks do not write or change the turn');
});
test('the targeting player wins on expiry for 2, 3 and 4 players, including a late action or stale check', () => {
  for (const count of [2,3,4]) for (const type of ['action','timeout','sync']) {
    let r = send(send(table(count), 'a', 'configure', 0, {clockMinutes:5}), 'a', 'start', 1000);
    assert.throws(() => send(r, 'outsider', 'timeout', 301000), /not a member/);
    r = send(r, type === 'action' ? 'a' : 'b', type, 301000, { version:0, now:1000, action:{type:'draw',count:4} });
    assert.equal(r.game.phase, 'finished');
    assert.deepEqual(r.game.winners, [['b','c','d'][count - 2]]);
    assert.equal(r.game.finishReason, 'timeout');
    assert.deepEqual(r.game.hand, [], 'Late action must not be applied');
    assert.equal(r.game.clock.remaining.a, 0);
    assert.equal(clockRemaining(r.game, 'b', 9999999), 300000);
    const restarted = send(send(r, 'a', 'rematch', 400000), 'a', 'start', 500000);
    assert.equal(clockRemaining(restarted.game, 'a', 500000), 300000);
  }
});
test('existing untimed tables keep their behavior', () => {
  let r = send(table(), 'a', 'start', 1000);
  assert.equal(r.game.clock, undefined);
  assert.equal(send(r, 'b', 'timeout', Number.MAX_SAFE_INTEGER), r);
  r = send(r, 'a', 'action', 100000000, {action:{type:'draw',count:0}});
  assert.equal(r.game.phase, 'play');
});
