import { assert, createGame, secureInt } from './game.js';
import { CLOCK_MINUTES, startClock, settleClock, clockRemaining, applyTimedAction } from './clock.js';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = (random = secureInt) => Array.from({ length: 8 }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('');
export function cleanName(name) {
  assert(typeof name === 'string', 'Enter a nickname.');
  const value = name.trim().replace(/\s+/g, ' ');
  assert(value.length >= 1 && value.length <= 24 && !/[\u0000-\u001f\u007f]/.test(value), 'Use a nickname between 1 and 24 characters.');
  return value;
}
export function newRoom(id, name, capacity, code) {
  assert(Number.isInteger(capacity) && capacity >= 2 && capacity <= 4, 'Choose 2, 3, or 4 players.');
  return { code, version: 1, host: id, capacity, members: [{ id, name: cleanName(name) }], game: null, requests: [] };
}
export function commandRoom(original, userId, command, random = secureInt, now = Date.now()) {
  assert(command && typeof command.type === 'string', 'Invalid room command.');
  const member = original.members.find(m => m.id === userId);
  assert(member || command.type === 'join', 'You are not a member of this room.');
  const request = `${userId}:${command.requestId}`;
  assert(typeof command.requestId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(command.requestId), 'Invalid request identifier.');
  if (original.requests.includes(request)) return original;
  // Any seated player can synchronize/check expiry. Only server time decides it.
  if (['action', 'timeout', 'sync'].includes(command.type) && original.game?.clock && original.game.phase !== 'finished' && clockRemaining(original.game, original.game.players[original.game.active].id, now) === 0) {
    const expired = structuredClone(original);
    expired.game = settleClock(original.game, now); expired.version++;
    expired.requests = [...original.requests.slice(-39), request]; return expired;
  }
  if (command.type === 'sync' || command.type === 'timeout') return original;
  if (command.type !== 'join') assert(command.version === original.version, 'The table changed. Please try your action again.');
  const room = structuredClone(original);
  switch (command.type) {
    case 'configure':
      assert(room.host === userId, 'Only the table creator can set the clock.');
      assert(!room.game, 'Set the clock before the game begins.');
      assert(CLOCK_MINUTES.includes(command.clockMinutes), 'Choose an available clock setting.');
      room.clockMinutes = command.clockMinutes; break;
    case 'join':
      if (member) return original;
      assert(!room.game, 'This game has already started.');
      assert(room.members.length < room.capacity, 'This table is full.');
      room.members.push({ id: userId, name: cleanName(command.name) }); break;
    case 'start':
      assert(room.host === userId, 'Only the table creator can start the game.');
      assert(!room.game, 'The game has already started.');
      assert(room.members.length === room.capacity, 'Wait for every Sage to join.');
      room.game = startClock(createGame(room.members, random), room.clockMinutes || 0, now); break;
    case 'action':
      assert(room.game, 'The game has not started.'); room.game = applyTimedAction(room.game, userId, command.action, now, random); break;
    case 'rematch':
      assert(room.host === userId, 'Only the table creator can start a rematch.');
      assert(room.game?.phase === 'finished', 'Finish this game first.'); room.game = null; break;
    case 'leave':
      assert(!room.game, 'Your seat is saved until this game finishes.');
      room.members = room.members.filter(m => m.id !== userId);
      if (room.host === userId) room.host = room.members[0]?.id ?? null;
      break;
    default: throw new Error('Unknown room command.');
  }
  room.version++; room.requests = [...room.requests.slice(-39), request]; return room;
}
export function publicRoom(room) { const { requests, ...visible } = room; return visible; }
