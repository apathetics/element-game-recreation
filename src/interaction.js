import { movementOptions } from './game.js';

export function nextSelection(game, previous = null) {
  if (!game || game.phase !== 'play') return null;
  if (previous === 'sage' && movementOptions(game).length) return 'sage';
  if (game.hand.includes(previous)) return previous;
  return game.hand[0] || (movementOptions(game).length ? 'sage' : null);
}

// Derive feedback from accepted state changes, including updates from other players.
export function describeChange(before, after) {
  if (!after) return null;
  if (!before || before.phase !== 'finished' && after.phase === 'finished') {
    return { kind: 'turn', cells: [], message: after.log.at(-1) };
  }
  const turnChanged = before.turn !== after.turn;
  const moved = after.players.find((p, i) => p.pos !== before.players[i]?.pos);
  if (moved) {
    const old = before.players.find(p => p.id === moved.id);
    const jump = turnChanged ? after.log.at(-1)?.startsWith(`${moved.name} rode the wind to `) : before.movesLeft === after.movesLeft;
    return { kind: jump ? 'wind' : 'step', cells: [moved.pos], from: old.pos, turnChanged, message: after.log.at(-1) };
  }
  const cells = after.board.flatMap((cell, i) => JSON.stringify(cell) !== JSON.stringify(before.board[i]) ? [i] : []);
  if (!cells.length) return turnChanged ? { kind: 'turn', cells: [], message: `${after.players[after.active].name}’s turn.` } : null;
  const placed = cells.find(i => after.board[i]);
  const kind = after.board[placed]?.element || 'stone';
  const sound = cells.length > 1 || after.board[placed]?.ids.length > 1 ? kind : 'stone';
  return { kind, sound, cells, turnChanged, message: after.log.at(-1) };
}
