// Pure rules shared by the browser, local server, and Supabase Edge Function.
export const SIZE = 11;
export const ELEMENTS = ['fire', 'water', 'earth', 'wind'];
export const COLORS = ['jade', 'ochre', 'ivory', 'slate'];
export const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const DIRECTIONS = [...ORTHO, [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const xy = i => [i % SIZE, Math.floor(i / SIZE)];
export const at = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE ? y * SIZE + x : -1;
export const step = (i, [dx, dy], n = 1) => { const [x, y] = xy(i); return at(x + dx * n, y + dy * n); };
export const coordinate = i => `${String.fromCharCode(65 + i % SIZE)}${SIZE - Math.floor(i / SIZE)}`;
export const count = cell => cell?.ids.length ?? 0;
const beats = { fire: 'wind', water: 'fire', earth: 'water', wind: 'earth' };
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function secureInt(max) {
  assert(Number.isInteger(max) && max > 0, 'Invalid random range.');
  const a = new Uint32Array(1), limit = Math.floor(4294967296 / max) * max;
  do { globalThis.crypto.getRandomValues(a); } while (a[0] >= limit);
  return a[0] % max;
}
export function createGame(members, random = secureInt) {
  assert(members.length >= 2 && members.length <= 4, 'A game needs 2–4 players.');
  // Printed setup: two central spaces; otherwise the four elemental circles.
  // Clockwise seating order gives each player the next Sage as their target.
  const positions = members.length === 2 ? [at(5, 4), at(5, 6)] : [at(2, 2), at(8, 2), at(8, 8), at(2, 8)];
  return {
    board: Array(SIZE * SIZE).fill(null),
    players: members.map((m, i) => ({ id: m.id, name: m.name, color: COLORS[i], pos: positions[i] })),
    active: random(members.length), phase: 'draw', hand: [], movesLeft: 0, usedWind: [],
    bag: Object.fromEntries(ELEMENTS.map(e => [e, 30])), nextId: 1,
    turn: 1, winners: [], log: ['The Sages take their places.']
  };
}
export function rangeCells(board) {
  const visited = new Set(), protectedCells = new Set();
  for (let i = 0; i < board.length; i++) {
    if (visited.has(i) || board[i]?.element !== 'earth') continue;
    const component = [], queue = [i]; let mountain = false;
    visited.add(i);
    while (queue.length) {
      const p = queue.pop(); component.push(p);
      if (count(board[p]) >= 2) mountain = true;
      for (const d of DIRECTIONS) {
        const q = step(p, d);
        if (q >= 0 && !visited.has(q) && board[q]?.element === 'earth') { visited.add(q); queue.push(q); }
      }
    }
    if (mountain) component.forEach(p => protectedCells.add(p));
  }
  return protectedCells;
}
function diagonalBlocked(from, d, ranges) {
  return d[0] && d[1] && ranges.has(step(from, [d[0], 0])) && ranges.has(step(from, [0, d[1]]));
}
export function movementOptions(game, playerIndex = game.active, respectTurn = true) {
  const p = game.players[playerIndex], ranges = rangeCells(game.board);
  const occupied = new Set(game.players.filter((_, i) => i !== playerIndex).map(p => p.pos));
  const used = new Set(respectTurn ? game.usedWind : []), options = [];
  for (const d of DIRECTIONS) {
    let q = step(p.pos, d);
    if (q < 0 || occupied.has(q) || diagonalBlocked(p.pos, d, ranges)) continue;
    if (!game.board[q]) {
      if (!respectTurn || game.movesLeft > 0) options.push({ to: q, cost: 1, wind: [] });
      continue;
    }
    if (game.board[q].element !== 'wind') continue;
    let distance = 0; const wind = [];
    while (q >= 0 && game.board[q]?.element === 'wind') {
      distance += count(game.board[q]); wind.push(...game.board[q].ids); q = step(q, d);
    }
    const landing = step(p.pos, d, distance + 1);
    if (landing >= 0 && !game.board[landing] && !occupied.has(landing) && !wind.some(id => used.has(id))) {
      options.push({ to: landing, cost: 0, wind });
    }
  }
  return options;
}
export function isTrapped(game, i) { return movementOptions(game, i, false).length === 0; }
export function canPlace(game, element, pos, ranges = rangeCells(game.board)) {
  if (!ELEMENTS.includes(element) || !Number.isInteger(pos) || pos < 0 || pos >= SIZE * SIZE || game.players.some(p => p.pos === pos)) return false;
  const cell = game.board[pos];
  if (!cell) return true;
  if (cell.element === element) return element === 'earth' ? count(cell) === 1 : element === 'wind' && count(cell) < 4;
  return beats[element] === cell.element && !(cell.element === 'earth' && ranges.has(pos));
}
export function riverLines(game, pos) {
  return ORTHO.map(d => {
    const cells = []; let q = step(pos, d);
    while (q >= 0 && game.board[q]?.element === 'water') { cells.push(q); q = step(q, d); }
    return cells;
  }).filter(line => line.length);
}
export function riverNextSteps(game, pos, line, path = []) {
  const blocked = new Set([pos, ...line, ...path, ...game.players.map(p => p.pos)]);
  const head = path.at(-1) ?? pos;
  return ORTHO.map(d => step(head, d)).filter(q => q >= 0 && !blocked.has(q) && (!game.board[q] || game.board[q].element === 'fire'));
}
export function fireDestinations(game, pos) {
  const occupied = new Set(game.players.map(p => p.pos)), result = [];
  for (const d of ORTHO) {
    let q = step(pos, d);
    if (q < 0 || game.board[q]?.element !== 'fire') continue;
    while (q >= 0 && game.board[q]?.element === 'fire') q = step(q, d);
    if (q >= 0 && !occupied.has(q) && (!game.board[q] || game.board[q].element === 'wind')) result.push(q);
  }
  return result;
}
function log(game, message) { game.log = [...game.log.slice(-59), message]; }
function addStone(game, element, pos) {
  const cell = game.board[pos];
  if (cell?.element === element) { cell.ids.push(game.nextId++); return; }
  if (cell) game.bag[cell.element] += count(cell);
  game.board[pos] = { element, ids: [game.nextId++] };
}
function checkOutcome(game) {
  assert(!isTrapped(game, game.active), 'That action would trap your own Sage.');
  const winners = new Set();
  game.players.forEach((_, i) => { if (isTrapped(game, i)) winners.add((i - 1 + game.players.length) % game.players.length); });
  if (winners.size) {
    game.winners = [...winners].map(i => game.players[i].id); game.phase = 'finished';
    log(game, `${[...winners].map(i => game.players[i].name).join(' & ')} ${winners.size > 1 ? 'share the victory' : 'wins'}!`);
  }
}
export function placementResult(original, action) {
  const { element, pos } = action;
  assert(canPlace(original, element, pos), 'That stone cannot be placed there.');
  const game = structuredClone(original), handIndex = game.hand.indexOf(element);
  assert(handIndex >= 0, 'You do not have that stone.');
  game.hand.splice(handIndex, 1);
  const lines = element === 'water' ? riverLines(game, pos) : [];
  addStone(game, element, pos);
  if (element === 'water' && lines.length) {
    const line = lines.find(l => l[0] === action.river);
    assert(line, 'Choose the river you want to move.');
    assert(Array.isArray(action.path) && action.path.length === line.length + 1, `The river must travel ${line.length + 1} spaces.`);
    const path = [];
    for (const q of action.path) {
      assert(riverNextSteps(original, pos, line, path).includes(q), 'The river must follow a clear path without crossing itself.');
      path.push(q);
    }
    const stones = [game.board[pos], ...line.map(q => game.board[q])];
    [pos, ...line].forEach(q => { game.board[q] = null; });
    path.forEach((q, i) => {
      if (game.board[q]) game.bag.fire += count(game.board[q]);
      game.board[q] = stones[i];
    });
    game.riverMotion = { id: game.nextId, turn: game.turn, sources: [pos, ...line], path: [...path] };
  }
  if (element === 'fire') {
    const options = fireDestinations(game, pos), required = Math.min(options.length, game.bag.fire);
    const chosen = game.bag.fire >= options.length ? options : action.fire ?? [];
    assert(Array.isArray(chosen) && chosen.length === required && new Set(chosen).size === required && chosen.every(q => options.includes(q)), `Choose ${required} fire spread destination${required === 1 ? '' : 's'}.`);
    chosen.forEach(q => { game.bag.fire--; addStone(game, 'fire', q); });
  }
  log(game, `${game.players[game.active].name} placed ${element} at ${coordinate(pos)}${lines.length ? ' and moved a river' : ''}.`);
  checkOutcome(game);
  return game;
}
// Find a legal complete river path. Return null for impossible, undefined if the
// search budget is exhausted: uncertainty must never authorize discarding stones.
export function findRiverPath(game, pos, line, budget = { left: 20000 }, accept = () => true) {
  let exhausted = false;
  function visit(path) {
    if (--budget.left < 0) { exhausted = true; return null; }
    if (path.length === line.length + 1) return accept(path) ? path : null;
    const next = riverNextSteps(game, pos, line, path);
    for (const q of next) {
      const result = visit([...path, q]); if (result) return result;
      if (exhausted) return null;
    }
    return null;
  }
  const result = visit([]); return result ?? (exhausted ? undefined : null);
}
function combinations(values, n) {
  if (!n) return [[]];
  return values.flatMap((v, i) => combinations(values.slice(i + 1), n - 1).map(rest => [v, ...rest]));
}
function hasPlacement(game, budget) {
  const ranges = rangeCells(game.board);
  for (const element of new Set(game.hand)) for (let pos = 0; pos < SIZE * SIZE; pos++) {
    if (--budget.left < 0) return undefined;
    if (!canPlace(game, element, pos, ranges)) continue;
    const valid = extra => { try { placementResult(game, { type: 'place', element, pos, ...extra }); return true; } catch { return false; } };
    if (element === 'water' && riverLines(game, pos).length) {
      for (const line of riverLines(game, pos)) {
        const path = findRiverPath(game, pos, line, budget, path => valid({ river: line[0], path }));
        if (path === undefined) return undefined;
        if (path) return true;
      }
    } else if (element === 'fire') {
      const options = fireDestinations(game, pos);
      if (combinations(options, Math.min(options.length, game.bag.fire)).some(fire => valid({ fire }))) return true;
    } else if (valid({})) return true;
  }
  return false;
}
export function hasPlayableContinuation(original, limit = 100000) {
  const budget = { left: limit }, queue = [original], visited = new Map();
  while (queue.length) {
    const game = queue.pop(), p = game.players[game.active];
    const key = `${p.pos}:${game.movesLeft}:${[...game.usedWind].sort((a,b) => a-b).join(',')}`;
    if (visited.has(key)) continue; visited.set(key, true);
    const result = hasPlacement(game, budget);
    if (result !== false) return result;
    for (const move of movementOptions(game)) {
      const next = structuredClone(game); next.players[next.active].pos = move.to;
      next.movesLeft -= move.cost; next.usedWind.push(...move.wind);
      // A move can itself end the game, so returning stones is not necessary.
      try { checkOutcome(next); } catch { continue; }
      if (next.phase === 'finished') return true;
      queue.push(next);
    }
  }
  return false;
}
export function applyAction(original, playerId, action, random = secureInt) {
  assert(original.phase !== 'finished', 'This game is finished.');
  assert(original.players[original.active].id === playerId, 'It is another Sage’s turn.');
  assert(action && typeof action.type === 'string', 'Choose an action.');
  let game = structuredClone(original); const name = game.players[game.active].name;
  if (action.type === 'draw') {
    assert(game.phase === 'draw', 'You have already drawn this turn.');
    const total = Object.values(game.bag).reduce((a, b) => a + b, 0), n = action.count;
    assert(Number.isInteger(n) && n >= 0 && n <= Math.min(4, total), 'Choose an available number of stones, from 0 to 4.');
    for (let i = 0; i < n; i++) {
      let choice = random(total - i);
      assert(Number.isInteger(choice) && choice >= 0 && choice < total - i, 'Invalid random draw.');
      for (const e of ELEMENTS) { if (choice < game.bag[e]) { game.bag[e]--; game.hand.push(e); break; } choice -= game.bag[e]; }
    }
    game.drawn = { turn: game.turn, playerId, stones: [...game.hand] };
    game.movesLeft = 5 - n; game.phase = 'play'; log(game, `${name} drew ${n} stone${n === 1 ? '' : 's'} and has ${game.movesLeft} moves.`);
    return game;
  }
  assert(game.phase === 'play', 'Choose how many stones to draw first.');
  if (action.type === 'place') return placementResult(game, action);
  if (action.type === 'move') {
    const move = movementOptions(game).find(m => m.to === action.to);
    assert(move, 'Your Sage cannot move there.');
    game.players[game.active].pos = move.to; game.movesLeft -= move.cost; game.usedWind.push(...move.wind);
    log(game, `${name} ${move.cost ? 'moved' : 'rode the wind'} to ${coordinate(move.to)}.`); checkOutcome(game); return game;
  }
  if (action.type === 'return') {
    assert(game.hand.length, 'There are no stones to return.');
    const possible = hasPlayableContinuation(game);
    assert(possible !== undefined, 'A legal continuation could not be ruled out. Try moving your Sage or placing a stone first.');
    assert(!possible, 'You still have a legal continuation. Place a stone or move your Sage first.');
    game.hand.forEach(e => game.bag[e]++); game.hand = []; log(game, `${name} returned unplayable stones (house rule).`); return game;
  }
  if (action.type === 'end') {
    assert(!game.hand.length, 'Place all your drawn stones before ending the turn.');
    game.active = (game.active - 1 + game.players.length) % game.players.length;
    game.phase = 'draw'; game.turn++; game.movesLeft = 0; game.usedWind = []; return game;
  }
  throw new Error('Unknown action.');
}
