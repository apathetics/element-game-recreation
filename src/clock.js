import { applyAction, assert } from './game.js';

export const CLOCK_MINUTES = [0, 5, 10, 15, 30];
export function startClock(game, minutes, now) {
  assert(CLOCK_MINUTES.includes(minutes), 'Choose an available clock setting.');
  if (minutes) game.clock = { remaining: Object.fromEntries(game.players.map(p => [p.id, minutes * 60000])), startedAt: now };
  return game;
}
export function clockRemaining(game, playerId, now) {
  if (!game?.clock) return null;
  const ticking = game.phase !== 'finished' && game.players[game.active].id === playerId;
  return Math.max(0, game.clock.remaining[playerId] - (ticking ? Math.max(0, now - game.clock.startedAt) : 0));
}
export function settleClock(original, now) {
  if (!original?.clock || original.phase === 'finished') return original;
  const game = structuredClone(original), player = game.players[game.active];
  game.clock.remaining[player.id] = clockRemaining(original, player.id, now);
  game.clock.startedAt = Math.max(now, game.clock.startedAt);
  if (game.clock.remaining[player.id] === 0) {
    const winner = game.players[(game.active - 1 + game.players.length) % game.players.length];
    game.phase = 'finished'; game.winners = [winner.id];
    game.finishReason = 'timeout'; game.timedOut = player.id; game.clock.startedAt = null;
    game.log = [...game.log.slice(-59), `${player.name} ran out of time. ${winner.name} wins.`];
  }
  return game;
}
export function applyTimedAction(original, playerId, action, now, random) {
  const timed = settleClock(original, now);
  if (original.phase !== 'finished' && timed.phase === 'finished') return timed;
  const next = applyAction(timed, playerId, action, random);
  if (next.clock && next.phase === 'finished') next.clock.startedAt = null;
  return next;
}
export function formatClock(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
