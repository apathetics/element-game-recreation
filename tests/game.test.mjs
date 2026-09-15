import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createGame, applyAction, placementResult, movementOptions, rangeCells, canPlace, fireDestinations, riverLines, findRiverPath, hasPlayableContinuation, isTrapped, at, count } from '../src/game.js';
globalThis.crypto ??= webcrypto;
const members = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
function fresh(n = 2) { return createGame(members.slice(0, n), () => 0); }
function put(g, element, x, y, height = 1) {
  const pos = at(x, y); assert.equal(g.board[pos], null);
  g.board[pos] = { element, ids: Array.from({ length: height }, () => g.nextId++) }; g.bag[element] -= height; return pos;
}
function hand(g, ...elements) { g.phase = 'play'; g.movesLeft = 1; g.hand = elements; elements.forEach(e => g.bag[e]--); return g; }
function play(g, action) { return applyAction(g, g.players[g.active].id, action, () => 0); }
function conserved(g) {
  for (const element of ['fire', 'water', 'earth', 'wind']) {
    const boardCount = g.board.reduce((n, c) => n + (c?.element === element ? count(c) : 0), 0);
    assert.equal(g.bag[element] + boardCount + g.hand.filter(e => e === element).length, 30, `${element} conservation`);
    assert.ok(g.bag[element] >= 0);
  }
}
test('official board setup and counterclockwise turns for 2–4 players', () => {
  for (const n of [2, 3, 4]) {
    let g = fresh(n); assert.equal(g.board.length, 121); assert.equal(new Set(g.players.map(p => p.pos)).size, n);
    if (n === 2) assert.deepEqual(g.players.map(p => p.pos), [at(5, 4), at(5, 6)]);
    else assert.deepEqual(g.players.map(p => p.pos), [at(2, 2), at(8, 2), at(8, 8), at(2, 8)].slice(0, n));
    g = play(g, { type: 'draw', count: 0 }); g = play(g, { type: 'end' }); assert.equal(g.active, n - 1); assert.equal(g.phase, 'draw'); conserved(g);
  }
});
test('drawing trades stones for movement, samples finite bag, and cannot be repeated', () => {
  const original = fresh(), g = play(original, { type: 'draw', count: 4 });
  assert.equal(g.movesLeft, 1); assert.deepEqual(g.hand, ['fire', 'fire', 'fire', 'fire']);
  assert.equal(original.bag.fire, 30); conserved(g);
  assert.throws(() => play(g, { type: 'draw', count: 1 }), /already drawn/);
  assert.throws(() => play(g, { type: 'end' }), /all your drawn/);
  assert.throws(() => applyAction(g, 'p1', { type: 'move', to: at(4, 4) }), /another Sage/);
  for (const count of [-1, 5, 1.5, '4']) assert.throws(() => play(original, { type: 'draw', count }));
});
test('a depleted bag limits draws and drawing zero still allows five moves', () => {
  let g = fresh(); g.bag = { fire: 0, water: 0, earth: 0, wind: 0 };
  assert.throws(() => play(g, { type: 'draw', count: 1 }));
  g = play(g, { type: 'draw', count: 0 }); assert.equal(g.movesLeft, 5);
});
test('eight neighboring steps cost movement and cannot occupy stones or Sages', () => {
  let g = hand(fresh()); assert.equal(movementOptions(g).length, 8);
  g = play(g, { type: 'move', to: at(4, 3) }); assert.equal(g.movesLeft, 0); assert.equal(movementOptions(g).length, 0);
  assert.throws(() => play(g, { type: 'move', to: at(5, 3) }));
});
test('replacement cycle returns all wind stack stones and preserves inventory', () => {
  let g = hand(fresh(), 'fire'); put(g, 'wind', 1, 1, 4);
  g = play(g, { type: 'place', element: 'fire', pos: at(1, 1) });
  assert.equal(g.bag.wind, 30); assert.equal(g.board[at(1, 1)].element, 'fire'); conserved(g);
  g = hand(g, 'water'); g = play(g, { type: 'place', element: 'water', pos: at(1, 1) }); conserved(g);
  g = hand(g, 'earth'); g = play(g, { type: 'place', element: 'earth', pos: at(1, 1) }); conserved(g);
  g = hand(g, 'wind'); g = play(g, { type: 'place', element: 'wind', pos: at(1, 1) }); conserved(g);
  assert.equal(canPlace(g, 'water', at(1, 1)), false);
});
test('fire extends to the far end of existing lines in every direction without chaining', () => {
  let g = hand(fresh(), 'fire'); g.players[0].pos = at(0, 0); g.players[1].pos = at(10, 10);
  put(g, 'fire', 4, 5); put(g, 'fire', 3, 5); put(g, 'fire', 6, 5); put(g, 'fire', 5, 4); put(g, 'fire', 5, 6);
  put(g, 'fire', 7, 6); // A free stone at 7,5 must not ignite 7,7.
  put(g, 'wind', 2, 5, 3);
  g = play(g, { type: 'place', element: 'fire', pos: at(5, 5) });
  for (const [x, y] of [[2,5], [7,5], [5,3], [5,7]]) assert.equal(g.board[at(x,y)].element, 'fire');
  assert.equal(g.board[at(7,7)], null); assert.equal(g.bag.wind, 30); conserved(g);
});
test('water, earth, Sages, and board edges block free fire without invalidating placement', () => {
  let g = hand(fresh(), 'fire'); put(g, 'fire', 0, 1); put(g, 'water', 0, 2); put(g, 'fire', 1, 0); put(g, 'earth', 2, 0);
  g = play(g, { type: 'place', element: 'fire', pos: at(0, 0) });
  assert.equal(g.bag.fire, 27); assert.equal(g.board[at(0,2)].element, 'water'); conserved(g);
});
test('house rule: player chooses exactly the available fire destinations', () => {
  let g = hand(fresh(), 'fire'); put(g, 'fire', 2, 1); put(g, 'fire', 1, 2); g.bag.fire = 1;
  const action = { type: 'place', element: 'fire', pos: at(1,1) };
  assert.deepEqual(fireDestinations(g, at(1,1)).sort(), [at(3,1), at(1,3)].sort());
  assert.throws(() => play(g, action), /Choose 1/);
  assert.throws(() => play(g, { ...action, fire: [at(3,1), at(1,3)] }));
  g = play(g, { ...action, fire: [at(1,3)] }); assert.equal(g.bag.fire, 0); assert.equal(g.board[at(3,1)], null);
});
test('house rule: no fire supply means no free spread, with placement still legal', () => {
  let g = hand(fresh(), 'fire'); put(g, 'fire', 2, 1); g.bag.fire = 0;
  g = play(g, { type: 'place', element: 'fire', pos: at(1,1) }); assert.equal(g.board[at(3,1)], null);
});
test('river follows a full turning path and returns extinguished fire', () => {
  let g = hand(fresh(), 'water'); put(g, 'water', 1, 1); put(g, 'water', 2, 1); put(g, 'fire', 4, 2);
  const old = structuredClone(g);
  g = play(g, { type: 'place', element: 'water', pos: at(3,1), river: at(2,1), path: [at(4,1), at(4,2), at(5,2)] });
  for (const x of [1,2,3]) assert.equal(g.board[at(x,1)], null);
  for (const p of [at(4,1),at(4,2),at(5,2)]) assert.equal(g.board[p].element,'water');
  assert.equal(g.bag.fire,30); conserved(g); assert.equal(old.board[at(4,2)].element,'fire');
});
test('river forks choose a single directional line, including insertion between water stones', () => {
  let g = hand(fresh(), 'water'); put(g,'water',1,1); put(g,'water',3,1); put(g,'water',2,2);
  assert.equal(riverLines(g,at(2,1)).length,3);
  g = play(g, { type:'place', element:'water', pos:at(2,1), river:at(1,1), path:[at(2,0),at(3,0)] });
  assert.equal(g.board[at(1,1)],null); assert.equal(g.board[at(3,1)].element,'water'); assert.equal(g.board[at(2,2)].element,'water'); conserved(g);
});
test('river cannot stop early, cross itself, run onto a Sage, or reuse the old river cells', () => {
  const g = hand(fresh(),'water'); put(g,'water',1,1); put(g,'water',2,1);
  const base={type:'place',element:'water',pos:at(3,1),river:at(2,1)};
  for(const path of [[at(4,1)],[at(4,1),at(4,2),at(4,1)],[at(2,1),at(2,2),at(3,2)],[at(3,2),at(3,3),at(5,4)]]) assert.throws(()=>play(g,{...base,path}));
  assert.ok(findRiverPath(g,at(3,1),[at(2,1),at(1,1)]));
  assert.equal(findRiverPath(g,at(3,1),[at(2,1),at(1,1)],{left:0}),undefined);
});
test('earth mountains protect transitive orthogonal and diagonal ranges permanently', () => {
  let g=hand(fresh(),'earth'); put(g,'earth',1,1); put(g,'earth',2,2); put(g,'earth',3,2);
  g=play(g,{type:'place',element:'earth',pos:at(1,1)});
  assert.equal(rangeCells(g.board).size,3); assert.equal(canPlace(g,'wind',at(3,2)),false);
  g=hand(g,'earth'); g=play(g,{type:'place',element:'earth',pos:at(4,3)}); assert.equal(rangeCells(g.board).size,4); conserved(g);
  assert.equal(canPlace(g,'earth',at(1,1)),false);
});
test('mountain ranges block squeezing diagonally but lone earth does not', () => {
  const g=hand(fresh()); g.players[0].pos=at(4,4); put(g,'earth',4,3); put(g,'earth',5,4);
  assert.ok(movementOptions(g).some(m=>m.to===at(5,3)));
  g.board[at(4,3)].ids.push(g.nextId++); g.bag.earth--;
  assert.ok(!movementOptions(g).some(m=>m.to===at(5,3)));
});
test('wind jumps are free, work diagonally, and cannot reuse any wind stone this turn', () => {
  let g=hand(fresh()); g.movesLeft=0; g.players[0].pos=at(2,2); put(g,'wind',3,3);
  g=play(g,{type:'move',to:at(4,4)}); assert.equal(g.movesLeft,0);
  assert.throws(()=>play(g,{type:'move',to:at(2,2)}));
  g=play(g,{type:'end'}); g=play(g,{type:'draw',count:0}); g=play(g,{type:'end'}); g=play(g,{type:'draw',count:0});
  g=play(g,{type:'move',to:at(2,2)}); assert.equal(g.movesLeft,5);
});
test('whirlwinds jump obstacles using stack heights plus a contiguous wind line', () => {
  const g=hand(fresh()); g.players[0].pos=at(1,1); put(g,'wind',2,1,2); put(g,'wind',3,1); put(g,'earth',4,1,2);
  const jump=movementOptions(g).find(m=>m.to===at(5,1)); assert.equal(jump.cost,0); assert.equal(jump.wind.length,3);
  put(g,'wind',5,1); assert.ok(!movementOptions(g).some(m=>m.to===at(5,1)));
});
test('a whirlwind cannot be entered through a mountain range', () => {
  const g=hand(fresh()); g.players[0].pos=at(2,2); put(g,'wind',3,3,2); put(g,'earth',3,2,2); put(g,'earth',2,3);
  assert.ok(!movementOptions(g).some(m=>m.to===at(5,5)));
});
test('wind stacks cap at four', () => {
  const g=hand(fresh(),'wind'); put(g,'wind',1,1,4); assert.equal(canPlace(g,'wind',at(1,1)),false);
});
test('capture is immediate, before unused hand stones, and credits the target owner', () => {
  let g=hand(fresh(3),'earth','water'); g.players[0].pos=at(8,8); g.players[1].pos=at(6,6); g.players[2].pos=at(0,0);
  put(g,'earth',0,1); put(g,'earth',1,0);
  g=play(g,{type:'place',element:'earth',pos:at(1,1)});
  assert.equal(g.phase,'finished'); assert.deepEqual(g.winners,['p1']); assert.deepEqual(g.hand,['water']); conserved(g);
});
test('house rule: one action trapping multiple opposing Sages shares victory', () => {
  let g=hand(fresh(3),'earth'); g.players[0].pos=at(8,8); g.players[1].pos=at(0,0); g.players[2].pos=at(2,0);
  put(g,'earth',0,1); put(g,'earth',1,1); put(g,'earth',2,1); put(g,'earth',3,1); put(g,'earth',3,0);
  // Both Sages have one escape at 1,0, closed by the same earth placement.
  assert.equal(isTrapped(g,1),false); assert.equal(isTrapped(g,2),false);
  g=play(g,{type:'place',element:'earth',pos:at(1,0)});
  assert.equal(g.phase,'finished'); assert.deepEqual(g.winners.sort(),['p0','p1']);
});
test('self-trapping actions are rejected even when they would also trap an opponent', () => {
  const g=hand(fresh(),'earth'); g.players[0].pos=at(0,0); put(g,'earth',0,1); put(g,'earth',1,0);
  assert.throws(()=>play(g,{type:'place',element:'earth',pos:at(1,1)}),/own Sage/);
});
test('a used wind jump still represents an escape for capture checks', () => {
  const g=hand(fresh()); g.players[0].pos=at(0,0); put(g,'earth',1,0); put(g,'earth',1,1); const w=put(g,'wind',0,1);
  g.usedWind=[...g.board[w].ids]; g.movesLeft=0;
  assert.equal(movementOptions(g).length,0); assert.equal(isTrapped(g,0),false);
});
test('house rule: returning stones is refused when a normal placement exists', () => {
  const g=hand(fresh(),'earth'); assert.equal(hasPlayableContinuation(g),true);
  assert.throws(()=>play(g,{type:'return'}),/legal continuation/);
});
test('house rule: considers a Sage move that frees a placement before allowing returns', () => {
  const g=hand(fresh(),'water'); g.players[0].pos=at(0,0); g.players[1].pos=at(10,10);
  // Synthetic near-full board: no isolated water placement initially; moving
  // the Sage off 0,0 opens an isolated location. Other empty cells touch water.
  for(let i=0;i<121;i++) if(!g.players.some(p=>p.pos===i)) g.board[i]={element:'earth',ids:[g.nextId++,g.nextId++]};
  g.board[at(1,0)]=null; g.board[at(2,0)]=null;
  for(const [x,y] of [[1,1],[2,1],[3,0],[8,10],[9,9]])g.board[at(x,y)]={element:'water',ids:[g.nextId++]};
  g.board[at(9,10)]=null;
  // Disable diagonal blockade at the entry while keeping earth irreplaceable by water.
  g.board[at(0,1)]={element:'earth',ids:[g.nextId++]};
  const noMoves=structuredClone(g);noMoves.movesLeft=0;
  assert.equal(hasPlayableContinuation(noMoves),false);
  assert.equal(hasPlayableContinuation(g),true);
  assert.throws(()=>play(g,{type:'return'}),/legal continuation/);
});
test('uncertain continuation search is not treated as proof stones are unplayable',()=>{
  const g=hand(fresh(),'earth'); assert.equal(hasPlayableContinuation(g,0),undefined);
});
test('house rule: genuinely impossible stones are returned without bonus movement',()=>{
  const g=hand(fresh(),'water'); g.players[0].pos=at(0,0); g.players[1].pos=at(10,10); g.movesLeft=0;
  for(let i=0;i<121;i++) if(!g.players.some(p=>p.pos===i)) g.board[i]={element:'earth',ids:[g.nextId++,g.nextId++]};
  // A legal ordinary step exists, but no movement allowance remains; water
  // cannot flow the two spaces needed from the lone empty location.
  g.board[at(1,0)]=null; g.board[at(2,0)]={element:'water',ids:[g.nextId++]};
  const result=play(g,{type:'return'}); assert.equal(result.hand.length,0); assert.equal(result.movesLeft,0); assert.equal(result.bag.water,g.bag.water+1);
});
