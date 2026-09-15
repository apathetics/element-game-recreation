import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, at } from '../src/game.js';
import { nextSelection, describeChange } from '../src/interaction.js';
function position(){const g=createGame([{id:'a',name:'A'},{id:'b',name:'B'}],()=>0);g.phase='play';g.hand=['wind','earth','wind','water'];g.movesLeft=2;return g;}
test('quick flow keeps repeated stones, advances in hand order and preserves movement',()=>{
 const g=position();assert.equal(nextSelection(g,'wind'),'wind');g.hand=['earth','water'];assert.equal(nextSelection(g,'wind'),'earth');assert.equal(nextSelection(g,'sage'),'sage');g.hand=[];assert.equal(nextSelection(g,'earth'),'sage');g.phase='draw';assert.equal(nextSelection(g,'sage'),null);
});
test('free wind jumps stay selectable with zero paid moves',()=>{
 const g=position();g.hand=[];g.movesLeft=0;g.players[g.active].pos=at(3,3);g.board[at(4,3)]={element:'wind',ids:[g.nextId++]};assert.equal(nextSelection(g),'sage');g.board[at(4,3)]=null;assert.equal(nextSelection(g),null);
});
test('feedback distinguishes movement, elemental changes and turn handoffs',()=>{
 const g=position();g.hand=['earth'];g.bag.earth--;const next=applyAction(g,g.players[g.active].id,{type:'place',element:'earth',pos:0});assert.deepEqual(describeChange(g,next).cells,[0]);assert.equal(describeChange(g,next).kind,'earth');
 const moved=structuredClone(next);moved.players[moved.active].pos++;moved.movesLeft--;assert.equal(describeChange(next,moved).kind,'step');moved.movesLeft=next.movesLeft;assert.equal(describeChange(next,moved).kind,'wind');moved.turn++;assert.equal(describeChange(next,moved).turnChanged,true);assert.deepEqual(describeChange(next,moved).cells,[moved.players[moved.active].pos]);const ended=structuredClone(next);ended.turn++;assert.equal(describeChange(next,ended).kind,'turn');assert.equal(describeChange(g,g),null);
});
