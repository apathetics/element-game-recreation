import { SIZE, ELEMENTS, COLORS, at, coordinate, count, createGame, applyAction, canPlace, movementOptions, rangeCells, riverLines, riverNextSteps, fireDestinations, findRiverPath, placementResult } from './game.js';
import { onlineAvailable, environment, identity, getRoom, sendCommand } from './api.js';

const app = document.querySelector('#app'), dialog = document.querySelector('#rules');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
  fire: '<path d="M17 3c2 8-5 8-3 14 2-1 4-3 4-5 5 4 7 7 5 12-2 6-12 7-15 1-4-8 5-11 9-22Z"/>',
  water: '<path d="M16 3C13 9 6 14 6 21a10 10 0 0 0 20 0c0-7-7-12-10-18Z"/><path d="M11 21c0 3 2 5 5 5"/>',
  earth: '<path d="m4 23 3-11 9-5 10 6 3 10-9 4H10Z"/><path d="m7 12 9 4 10-3M16 16l4 11M4 23l12-7"/>',
  mountain: '<path d="m2 27 11-23 8 15 3-7 7 15H2Z" fill="currentColor" fill-opacity=".14"/><path d="m9 12 4 4 4-4M21 19l3 3 3-3M13 16l-2 11"/>',
  whirlwind: '<path d="M26 8C22 2 9 2 5 8c-4 6 5 12 15 9 8-2 9-8 3-10-5-2-12 0-12 4 0 3 7 4 10 1M6 17c3 6 16 7 21 1M10 23c4 4 10 4 14 0M14 28l5 2"/>',
  wind: '<path d="M4 11h17c7 0 7-9 1-8-3 0-4 3-3 5M4 17h21c7 0 7 10 1 10-3 0-4-3-3-5M4 23h9c5 0 5 7 0 7"/>',
  sage: '<circle cx="16" cy="8" r="4"/><path d="M12 14h8l2 9 4 5H6l4-5 2-9Z"/><path d="M10 23h12"/>',
  'sage-jade': '<circle cx="16" cy="5" r="3"/><path d="M7 14c0-6 4-8 9-8s9 2 9 8l-2 9-7 7-7-7Z"/><path d="M8 13c4 0 6-2 8-5 2 3 4 5 8 5M10 16h3m6 0h3m-6 1-1 4h3m-2 1c-2-2-5-1-6 1m6-1c2-2 5-1 6 1m-6 0v4" fill="none"/>',
  'sage-ochre': '<path d="M3 27 5 13C6 6 11 3 16 2c5 1 10 4 11 11l2 14-7 3H10Z"/><path d="M8 14c3-1 6-4 8-7 2 3 5 6 8 7v6c0 5-4 8-8 8s-8-3-8-8Z"/><path d="m11 17 2-1m6 0 2 1m-5 1-1 3h2m-6 1c2 5 8 5 10 0m-7 1h4" fill="none"/>',
  'sage-ivory': '<path d="M5 29V14C5 6 10 2 17 2c7 0 10 5 10 12v15l-6-3H11Z"/><path d="M8 13v7c0 5 4 8 8 9 4-1 8-4 8-9v-9c-5 1-8-1-10-4-1 3-3 5-6 6Z"/><path d="M7 10c3 0 6-2 7-6m-3 12h2m6 0h2m-5 1-1 4h2m-4 3q3 2 6 0M5 23l3-2m16 0 3 2" fill="none"/>',
  'sage-slate': '<path d="M6 13C6 6 10 3 16 3s10 3 10 10v10l-5 7H11l-5-7Z"/><path d="m9 13 4 1m6 0 4-1m-13 4h3m6 0h3m-6 0-1 4h3m-2 1c-2-2-5-1-7 2l5 1 2-2 2 2 5-1c-2-3-5-4-7-2m-3 6h6" fill="none"/>',
  mark: '<path d="m16 2 14 14-14 14L2 16Z"/><circle cx="16" cy="16" r="8"/><path d="M16 6v20M6 16h20"/>',
  arrow: '<path d="M6 16h20M20 10l6 6-6 6"/>',
  link: '<path d="m13 19 6-6M12 22l-2 2a6 6 0 0 1-8-8l6-6a6 6 0 0 1 8 0m4 0 2-2a6 6 0 0 1 8 8l-6 6a6 6 0 0 1-8 0"/>',
  check: '<path d="m7 16 6 6 13-14"/>'
};
function icon(name, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.mark}</svg>`; }
const descriptions = { fire: 'Spread beyond a line of fire.', water: 'Form a river. Choose where it flows.', earth: 'Stack two stones to build a mountain.', wind: 'Give your Sage a free leap.' };
let saved = null; try { saved = JSON.parse(localStorage.getItem('element-table-v1')); } catch { /* fresh session */ }
let me = null, room = null, mode = null, busy = false, selected = null, draft = null, drawCount = 4, offline = false;
let nickname = ''; try { nickname = localStorage.getItem('element-nickname') || ''; } catch { /* no saved name */ }
let capacity = 2, pollTimer, noticeTimer;
const inviteCode = new URLSearchParams(location.hash.slice(1)).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8) || '';
let inputCode = inviteCode;
const game = () => room?.game;
const active = () => game()?.players[game().active];
const mine = () => mode === 'local' || active()?.id === me;
function persist() {
  try { localStorage.setItem('element-table-v1', JSON.stringify(mode === 'local' ? { mode, room } : { mode, code: room.code })); }
  catch { notify('Browser storage is unavailable. Keep this tab open to retain your local game.'); }
}
function notify(message, error = true) {
  const node = document.querySelector('#notice'); node.textContent = message; node.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.className = ''; }, 8000);
}
function header() {
  return `<header class="site-header"><button class="brand" data-do="home" aria-label="Element home">${icon('mark')}<span>ELEMENT<small>A GAME OF BALANCE</small></span></button><div class="header-actions">${room ? `<span class="connection ${offline ? 'disconnected' : ''}"><i></i>${mode === 'local' ? 'Shared device' : offline ? 'Reconnecting…' : `Table ${esc(room.code)}`}</span>` : '<span class="quiet desktop-only">2–4 PLAYERS · 30–60 MIN</span>'}<button class="text-button" data-do="rules">How to play <span class="question">?</span></button></div></header>`;
}
function stone(cell, extra = '') {
  const stacked = count(cell) > 1;
  const graphic = stacked ? ({ earth: 'mountain', wind: 'whirlwind' }[cell.element] || cell.element) : cell.element;
  return `<span class="stone ${cell.element} ${extra} ${stacked ? `stacked ${graphic}` : ''}">${icon(graphic)}${stacked ? `<span class="stack-count">${count(cell)}</span>` : ''}</span>`;
}
function sage(player) { return `<span class="sage ${player.color}">${icon(`sage-${player.color}`, 'sage-face')}</span>`; }
function sampleGame() {
  const g = createGame([{ id: 'a', name: 'Jade' }, { id: 'b', name: 'Ochre' }], () => 0);
  g.players[0].pos = at(3, 6); g.players[1].pos = at(7, 4);
  const stones = { fire: [[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [7, 3]], water: [[2, 4], [2, 5], [2, 6], [2, 7], [3, 7]], earth: [[5, 5], [6, 6], [7, 6], [8, 6]], wind: [[4, 5], [4, 6], [7, 7], [8, 3]] };
  for (const [e, cells] of Object.entries(stones)) for (const [x, y] of cells) g.board[at(x, y)] = { element: e, ids: [g.nextId++] };
  g.board[at(6, 6)].ids.push(g.nextId++); g.board[at(4, 5)].ids.push(g.nextId++);
  return g;
}
function replacementFrame() {
  const cycle = ['water', 'fire', 'wind', 'earth'];
  return `<div class="replacement-frame" role="img" aria-label="Replacement cycle: water replaces fire, fire replaces wind, wind replaces earth, earth replaces water.">${cycle.map((e, i) => `<span class="frame-element corner-${i}" title="${e}">${stone({ element: e, ids: [0] })}</span>`).join('')}${['top', 'right', 'bottom', 'left'].map(side => `<span class="cycle-edge ${side}" aria-hidden="true"><span>replaces</span></span>`).join('')}</div>`;
}
function boardMarkup(g, decorative = false) {
  const ranges = rangeCells(g.board), starts = new Set([at(2, 2), at(8, 2), at(8, 8), at(2, 8)]);
  const movements = !decorative && mine() && selected === 'sage' ? movementOptions(g) : [];
  const targets = new Set(movements.map(m => m.to));
  let riverTargets = new Set(), lineTargets = new Set(), fireTargets = new Set();
  if (draft?.kind === 'water') {
    if (draft.line) riverTargets = new Set(draft.path.length < draft.line.length + 1 ? riverNextSteps(g, draft.pos, draft.line, draft.path) : []);
    else lineTargets = new Set(draft.lines.map(l => l[0]));
  }
  if (draft?.kind === 'fire') fireTargets = new Set(draft.options);
  const selectedTargets = new Set(draft?.kind === 'fire' ? draft.fire : draft?.path || []);
  let html = `<div class="board-frame ${decorative ? 'decorative' : ''}">${replacementFrame()}<div class="board" ${decorative ? 'aria-hidden="true"' : 'role="group" aria-label="Element board. Use arrow keys to navigate spaces."'}>`;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const p = g.players.find(p => p.pos === i), cell = g.board[i];
    const candidate = !decorative && mine() && !draft && g.phase === 'play' && ELEMENTS.includes(selected) && canPlace(g, selected, i, ranges);
    const highlight = targets.has(i) || riverTargets.has(i) || lineTargets.has(i) || fireTargets.has(i);
    const picked = selectedTargets.has(i), pending = draft?.pos === i;
    const label = `${coordinate(i)}, ${p ? `${p.name}’s Sage` : cell ? `${cell.element}${count(cell) > 1 ? ` stack of ${count(cell)}${cell.element === 'earth' ? ', mountain' : cell.element === 'wind' ? ', whirlwind' : ''}` : ''}${ranges.has(i) ? ', protected range' : ''}` : 'empty'}${highlight ? ', available destination' : ''}`;
    const tag = decorative ? 'span' : 'button';
    html += `<${tag} class="square ${(i + Math.floor(i / SIZE)) % 2 ? 'alt' : ''} ${starts.has(i) ? 'start-space' : ''} ${candidate ? 'candidate' : ''} ${highlight ? 'destination' : ''} ${picked ? 'path-picked' : ''} ${pending ? 'pending' : ''} ${ranges.has(i) ? 'protected' : ''} ${p && g.players[g.active].id === p.id ? 'active-sage' : ''}" ${decorative ? '' : `data-cell="${i}" aria-label="${esc(label)}" title="${esc(label)}" tabindex="${i === (g.players[g.active]?.pos ?? 0) ? 0 : -1}"`}>${p ? sage(p) : cell ? stone(cell) : starts.has(i) ? '<span class="start-mark">◇</span>' : ''}${pending ? `<span class="ghost-stone">${icon(draft.element)}</span>` : ''}${picked && draft?.kind === 'water' ? `<span class="path-number">${draft.path.indexOf(i) + 1}</span>` : ''}${targets.has(i) ? `<span class="move-dot ${movements.find(m => m.to === i)?.cost ? '' : 'free'}"></span>` : ''}</${tag}>`;
  }
  return html + '</div></div>';
}
function homeMarkup() {
  return `<main class="landing"><section class="hero-copy"><div class="eyebrow"><span></span> FOUR ELEMENTS. ENDLESS POSSIBILITIES.</div><h1>Find your<br>element.</h1><p class="hero-description">Shape the world around you. Surround a rival Sage.<br class="desktop-only"> Keep your own path open.</p><div class="table-form"><div class="form-heading"><h2>Gather your Sages</h2><span>02 — 04</span></div><label class="field-label" for="nickname">YOUR NAME</label><input id="nickname" maxlength="24" autocomplete="nickname" placeholder="What should we call you?" value="${esc(nickname)}"><div class="form-row"><span class="field-label">PLAYERS</span><div class="segmented" role="group" aria-label="Number of players">${[2, 3, 4].map(n => `<button data-capacity="${n}" aria-pressed="${n === capacity}" class="${n === capacity ? 'chosen' : ''}">${n}</button>`).join('')}</div></div><button class="button primary full" data-do="create" ${busy || !onlineAvailable ? 'disabled' : ''}>${busy ? 'Opening your table…' : 'Create a private table'} ${icon('arrow')}</button><div class="join-row"><input id="invite-code" aria-label="8-character invite code" placeholder="Enter invite code" maxlength="8" autocapitalize="characters" autocomplete="off" value="${esc(inputCode)}"><button class="button join" data-do="join" ${busy || !onlineAvailable ? 'disabled' : ''}>Join table</button></div>${!onlineAvailable ? '<p class="form-note">Online tables aren’t available here yet. Play together on this device below.</p>' : '<p class="form-note">A private link. A few friends. No accounts needed.</p>'}<button class="text-button local-button" data-do="local" ${busy ? 'disabled' : ''}>${icon('sage')} Play on one device</button></div></section><section class="hero-table" aria-label="An example Element game"><div class="floating-label">A LITTLE STRATEGY.<br><strong>A force of nature.</strong></div>${boardMarkup(sampleGame(), true)}<div class="table-caption"><span class="caption-line"></span> EVERY STONE CHANGES THE LANDSCAPE <span class="caption-line"></span></div></section><section class="element-strip" aria-label="The four elements">${ELEMENTS.map((e, i) => `<div class="element-intro"><span class="element-number">0${i + 1}</span><span class="element-emblem ${e}">${icon(e)}</span><div><h3>${e}</h3><p>${({ fire: 'Make your presence spread.', water: 'Find a new direction.', earth: 'Stand your ground.', wind: 'Leave a way out.' })[e]}</p></div></div>`).join('')}</section></main>`;
}
function lobbyMarkup() {
  const isHost = room.host === me || mode === 'local';
  return `<main class="lobby"><div class="eyebrow">YOUR PRIVATE TABLE</div><h1>A place for<br>every element.</h1><p class="hero-description">${mode === 'local' ? 'Pass the device when your turn is over.' : 'Send an invitation. Your friends can join from any device.'}</p><div class="lobby-card">${mode === 'online' ? `<div class="invite-box"><span class="field-label">INVITE CODE</span><strong>${esc(room.code)}</strong><button class="button subtle" data-do="copy">${icon('link')} Copy invite link</button></div>` : ''}<div class="seats">${Array.from({ length: room.capacity }, (_, i) => { const m = room.members[i]; return `<div class="seat ${m ? 'occupied' : ''}">${sage({ color: COLORS[i] })}<span>${m ? esc(m.name) : 'Waiting for a Sage…'}<small>${m ? m.id === room.host ? 'TABLE CREATOR' : 'READY TO PLAY' : 'OPEN SEAT'}</small></span>${m ? icon('check') : '<span class="waiting-dot"></span>'}</div>`; }).join('')}</div><p class="form-note">${room.members.length} of ${room.capacity} Sages have arrived.</p>${isHost ? `<button class="button primary full" data-do="start" ${busy || room.members.length !== room.capacity ? 'disabled' : ''}>Begin the game ${icon('arrow')}</button>` : '<div class="waiting-message">Waiting for the table creator to begin…</div>'}<button class="text-button" data-do="leave" ${busy ? 'disabled' : ''}>Leave table</button></div></main>`;
}
function rosterMarkup(g) {
  return `<aside class="roster"><div class="eyebrow">THE SAGES</div>${g.players.map((p, i) => `<div class="player-card ${g.active === i ? 'current' : ''} ${g.winners.includes(p.id) ? 'winner' : ''}">${sage(p)}<div><strong>${esc(p.name)}${mode === 'online' && p.id === me ? '<span class="you-label">YOU</span>' : ''}</strong><small>${g.winners.includes(p.id) ? 'VICTORIOUS' : g.active === i && g.phase !== 'finished' ? 'TAKING A TURN' : `TARGET: ${esc(g.players[(i + 1) % g.players.length].name)}`}</small></div>${g.active === i && g.phase !== 'finished' ? '<span class="turn-dot"></span>' : ''}</div>`).join('')}<div class="target-note">${icon('mark')}<p>Surround the Sage to your right.<br>Keep your own escape open.</p></div><div class="bag"><div class="eyebrow">IN THE BAG <span>${Object.values(g.bag).reduce((a, b) => a + b, 0)}</span></div>${ELEMENTS.map(e => `<div>${icon(e, e)}<span>${e}</span><strong>${g.bag[e]}</strong></div>`).join('')}</div></aside>`;
}
function controlsMarkup(g) {
  if (g.phase === 'finished') return `<aside class="controls victory"><div class="victory-mark">${icon('mark')}</div><div class="eyebrow">BALANCE, RESTORED</div><h2>${g.players.filter(p => g.winners.includes(p.id)).map(p => esc(p.name)).join(' & ')}<br>${g.winners.length > 1 ? 'share the victory.' : 'wins.'}</h2><p>${g.winners.length > 1 ? 'Several Sages were trapped by the same action. The eligible winners share the victory.' : 'An opposing Sage has no escape. The elements have spoken.'}</p>${mode === 'local' || room.host === me ? '<button class="button primary full" data-do="rematch">Play again</button>' : '<p>The table creator can start a rematch.</p>'}<button class="text-button" data-do="home">Back to home</button></aside>`;
  if (!mine()) return `<aside class="controls"><div class="eyebrow">AT THE TABLE</div><h2>${esc(active().name)}<br>is thinking.</h2><div class="waiting-art">${sage(active())}<span></span><span></span><span></span></div><p class="muted">Watch the landscape change. Your turn will arrive soon.</p><div class="rule-note"><h3>Your objective</h3><p>Trap <strong>${esc(g.players[(g.players.findIndex(p => p.id === me) + 1) % g.players.length]?.name)}</strong> by removing every legal move.</p></div></aside>`;
  if (g.phase === 'draw') {
    const total = Object.values(g.bag).reduce((a, b) => a + b, 0), n = Math.min(drawCount, total);
    return `<aside class="controls"><div class="eyebrow">01 / CHOOSE YOUR BALANCE</div><h2>Stones or<br>steps?</h2><p class="muted">Draw fewer stones to give your Sage more room to move.</p><div class="draw-options" role="group" aria-label="Stones to draw">${[0, 1, 2, 3, 4].map(v => `<button data-draw="${v}" class="${v === n ? 'chosen' : ''}" aria-pressed="${v === n}" ${v > total ? 'disabled' : ''}>${v}</button>`).join('')}</div><div class="balance-summary"><span><strong>${n}</strong>stones</span><span class="balance-plus">+</span><span><strong>${5 - n}</strong>moves</span></div><button class="button primary full" data-do="draw" ${busy ? 'disabled' : ''}>${busy ? 'Drawing…' : n ? `Draw ${n} stone${n > 1 ? 's' : ''}` : 'Take 5 moves'} ${icon('arrow')}</button><p class="form-note">Choose before drawing. All drawn stones must be played.</p><div class="rule-note">${icon('wind', 'wind')}<p>Wind jumps are always free. Each wind stone can be used once per turn.</p></div></aside>`;
  }
  if (draft) return draftMarkup(g);
  return `<aside class="controls"><div class="eyebrow">02 / SHAPE THE LANDSCAPE</div><h2>Your move,<br>${esc(active().name)}.</h2><div class="hand-heading"><span class="field-label">YOUR STONES</span><span>${g.hand.length} remaining</span></div><div class="hand">${g.hand.length ? g.hand.map((e, i) => `<button class="hand-stone ${selected === e ? 'selected' : ''}" data-element="${e}" aria-label="Select ${e} stone ${i + 1}" aria-pressed="${selected === e}" ${busy ? 'disabled' : ''}>${stone({ element: e, ids: [0] })}</button>`).join('') : '<p class="muted empty-hand">All stones placed.</p>'}</div><button class="sage-control ${selected === 'sage' ? 'selected' : ''}" data-do="sage" ${busy ? 'disabled' : ''}>${sage(active())}<span>Move your Sage<small>${g.movesLeft} move${g.movesLeft === 1 ? '' : 's'} + free wind jumps</small></span>${icon('arrow')}</button><div class="selection-help">${ELEMENTS.includes(selected) ? `<span class="element-emblem ${selected}">${icon(selected)}</span><p><strong>${selected[0].toUpperCase() + selected.slice(1)}</strong>${descriptions[selected]}</p>` : selected === 'sage' ? `<p>Choose a marked space.<br><span class="mini-dot"></span> Step <span class="mini-dot free"></span> Free wind jump</p>` : '<p>Select a stone or your Sage,<br>then choose a space on the board.</p>'}</div><button class="button primary full" data-do="end" ${busy || g.hand.length ? 'disabled' : ''}>End turn ${icon('arrow')}</button>${g.hand.length ? '<button class="text-button return-button" data-do="return">No way to play these stones?</button>' : '<p class="form-note">You can use your remaining moves or end your turn.</p>'}</aside>`;
}
function draftMarkup(g) {
  const water = draft.kind === 'water', required = water ? draft.line?.length + 1 : draft.required;
  const ready = water ? draft.line && draft.path.length === required : draft.fire.length === required;
  return `<aside class="controls"><div class="eyebrow">${water ? 'WATER FINDS A WAY' : 'A LIMITED SPARK'}</div><h2>${water ? draft.line ? 'Chart your<br>river.' : 'Choose your<br>river.' : 'Choose where<br>fire spreads.'}</h2><p class="muted">${water ? draft.line ? `Trace ${required} spaces from ${coordinate(draft.pos)}. The river can turn, but cannot cross itself.` : 'This stone touches more than one line of water. Choose which line will flow.' : `Only ${required} fire stone${required === 1 ? '' : 's'} remain in the bag. Choose ${required} highlighted destination${required === 1 ? '' : 's'}.`}</p>${water ? draft.line ? `<div class="path-progress">${Array.from({ length: required }, (_, i) => `<span class="${i < draft.path.length ? 'complete' : ''}">${i + 1}</span>`).join('')}</div><div class="path-description">${[draft.pos, ...draft.path].map(coordinate).join(' → ')}</div>${!ready && !riverNextSteps(g, draft.pos, draft.line, draft.path).length ? '<p class="inline-error">This path is blocked. Go back one space and try another direction.</p>' : ''}` : `<div class="river-choices">${draft.lines.map((line, i) => `<button class="button subtle full" data-line="${i}">Toward ${coordinate(line[0])} <span>${line.length + 1} stones</span></button>`).join('')}</div>` : `<div class="balance-summary"><span><strong>${draft.fire.length} / ${required}</strong>destinations selected</span></div>`}<button class="button primary full" data-do="confirm" ${!ready || busy ? 'disabled' : ''}>${water ? 'Let it flow' : 'Spread the fire'} ${icon('arrow')}</button>${water && draft.line ? '<button class="button subtle full" data-do="back-path">Back one step</button>' : ''}<button class="text-button" data-do="cancel">Cancel placement</button><p class="form-note">This is a preview. Your stone is placed when you confirm.</p></aside>`;
}
function gameMarkup(g) {
  return `<main class="game-layout"><div class="game-heading"><div><div class="eyebrow">${g.phase === 'finished' ? 'THE GAME IS COMPLETE' : `TURN ${String(g.turn).padStart(2, '0')}`}</div><h1>${g.phase === 'finished' ? 'A new balance.' : mine() ? `${esc(active().name)}’s turn` : 'The elements are in motion.'}</h1></div><div class="game-heading-actions">${mode === 'online' ? '<button class="text-button" data-do="copy">Invite link</button>' : '<span class="local-tag">PASS & PLAY</span>'}<button class="text-button" data-do="rules">Element guide</button></div></div>${rosterMarkup(g)}<section class="board-section">${boardMarkup(g)}<div class="board-legend"><span>${icon('earth')} Outlined earth belongs to a protected range</span><span>Moves may be mixed with placements</span></div><details class="history"><summary>At the table <span>${esc(g.log.at(-1))}</span></summary><ol>${g.log.slice().reverse().map(item => `<li>${esc(item)}</li>`).join('')}</ol></details></section>${controlsMarkup(g)}</main>`;
}
function render() {
  const focus = document.activeElement?.dataset?.cell;
  app.innerHTML = header() + (room ? room.game ? gameMarkup(room.game) : lobbyMarkup() : homeMarkup()) + `<footer class="site-footer"><span>ELEMENT <span class="footer-dot">·</span> An unofficial digital adaptation</span><span>Original game by Mike Richie <span class="footer-dot">·</span> Rather Dashing Games</span></footer>`;
  if (focus !== undefined) app.querySelector(`[data-cell="${focus}"]`)?.focus({ preventScroll: true });
  addResume();
}
function readForm() {
  nickname = document.querySelector('#nickname')?.value.trim() || nickname;
  inputCode = document.querySelector('#invite-code')?.value.toUpperCase().replace(/[^A-Z2-9]/g, '') || inputCode;
  if (!nickname) { document.querySelector('#nickname')?.focus(); throw new Error('Enter your name to take a seat.'); }
  try { localStorage.setItem('element-nickname', nickname); } catch { /* name optional to persist */ }
}
async function mutate(command) {
  if (busy) return;
  busy = true; render();
  try {
    if (mode === 'local') {
      if (command.type === 'start') room.game = createGame(room.members);
      else if (command.type === 'rematch') room.game = null;
      else if (command.type === 'action') room.game = applyAction(room.game, active().id, command.action);
      room.version++;
    } else room = await sendCommand({ ...command, code: room.code, version: room.version });
    selected = null; draft = null; offline = false; persist();
  } catch (error) {
    notify(error.message);
    if (mode === 'online') { try { room = await getRoom(room.code); persist(); } catch { offline = true; } }
  } finally { busy = false; render(); }
}
const act = action => mutate({ type: 'action', action });
async function enterOnline(type) {
  readForm();
  if (type === 'join' && inputCode.length !== 8) throw new Error('Enter the 8-character invite code.');
  busy = true; render();
  try {
    me = await identity();
    room = await sendCommand({ type, name: nickname, capacity, code: inputCode }); mode = 'online';
    persist(); history.replaceState(null, '', `#room=${room.code}`); schedulePoll();
  } finally { busy = false; render(); }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (mode !== 'online' || !room) return;
  pollTimer = setTimeout(poll, document.hidden ? 10000 : 1800);
}
async function poll() {
  if (mode !== 'online' || !room || busy) { schedulePoll(); return; }
  const code = room.code;
  try {
    const next = await getRoom(code);
    if (mode !== 'online' || room?.code !== code) return;
    if (next.version > room.version) { room = next; selected = null; draft = null; persist(); render(); }
    if (offline) { offline = false; render(); }
  } catch { if (mode === 'online' && room?.code === code && !offline) { offline = true; render(); } }
  schedulePoll();
}
async function copyInvite() {
  const url = new URL(location.href); url.hash = `room=${room.code}`;
  try { await navigator.clipboard.writeText(url.href); notify('Invite link copied. Send it to your friends.', false); }
  catch { notify(`Invite code: ${room.code}. Share the address in your browser.`, false); }
}
function openRules() {
  dialog.innerHTML = `<div class="rules-header"><div><div class="eyebrow">A FIELD GUIDE</div><h2 id="rules-title">Master the elements.</h2></div><button class="close-dialog" data-do="close-rules" aria-label="Close rules">×</button></div><div class="rules-content"><section><h3>The aim</h3><p>Trap your target’s Sage so it has no legal step or wind jump. In a 3–4-player game, your target is the next Sage clockwise in the player list. Turns go counterclockwise. Trapping someone else’s target gives that target’s owner the victory. You cannot trap your own Sage.</p></section><section><h3>A turn in two parts</h3><ol><li>Choose <strong>0–4 random stones</strong> before seeing them. Your moves equal <strong>5 minus the number drawn</strong>.</li><li>Place every drawn stone and move your Sage in any order. Each element’s effect must finish before your next action. You can leave movement unused.</li></ol><p>Click a stone, then a board space. Click your Sage to see steps and free wind jumps. A river placement is a preview until you confirm its entire path.</p></section><div class="rules-elements">${ELEMENTS.map(e => `<section><h3><span class="element-emblem ${e}">${icon(e)}</span>${e}</h3><p>${({ fire: 'Place beside a straight line of fire to add one free fire stone at its far end. This works in all four orthogonal directions. Free fire replaces wind, but other stones, Sages, and edges stop it. Free stones do not trigger more spreading.', water: 'Add water beside water to form a river. If several lines connect, choose one. From the new stone, trace a clear orthogonal path as long as the river, including the new stone. It can turn and extinguish fire, but cannot cross itself, other stones, Sages, or the board edge. The entire path must be possible.', earth: 'Stack two earth stones to make a mountain. All earth connected to it, including diagonally, becomes a permanent, irreplaceable range. Sages cannot step diagonally through the gap between two range stones. Wind may still carry a Sage over a range when approached from the wind’s side.', wind: 'Jump over adjacent wind to an empty landing space for free. Add the heights of a continuous line of wind to determine the number of spaces jumped over. Wind stacks can be up to four high and can carry you over intervening obstacles. You must land on an empty space. Each wind stone may be used only once per turn.' })[e]}</p></section>`).join('')}</div><section><h3>The replacement cycle</h3><div class="replacement-cycle">${['water', 'fire', 'wind', 'earth'].map(e => `<span class="${e}">${icon(e)} ${e}</span><b>→</b>`).join('')}<span class="water">water</span></div><p>Each element replaces the next. Replaced stones return to the bag. A single fire stone replaces an entire wind stack; protected earth ranges cannot be replaced.</p></section><section class="house-rules"><div class="eyebrow">AGREED HOUSE RULES</div><h3>When the booklet leaves a gap</h3><ol><li><strong>Unplayable stones:</strong> return remaining stones only when no legal continuation can place a stone. Moving your Sage is considered. Returning stones gives no extra movement.</li><li><strong>Fire shortage:</strong> use only fire stones available in the bag. If there are fewer than needed, choose which eligible destinations receive them.</li><li><strong>Simultaneous captures:</strong> eligible winners share victory if the same completed action traps multiple opposing Sages. Self-trapping actions remain illegal.</li></ol><p>These are additions, not official publisher rulings. Element placements and their full effects resolve as one action. Draws are limited by the stones available in the bag.</p></section><section><h3>Playing with friends</h3><p>Create a private table and share its invite link or 8-character code. Keep using the same browser to retain your seat. Refreshes and temporary disconnections are safe: the table saves each completed action. The table creator doesn’t need to keep their browser open. If a player disconnects on their turn, their seat waits for them.</p></section><section><h3>About this adaptation</h3><p>Based on Element’s revised April 2017 base rules. Original game by Mike Richie, published by Rather Dashing Games. Original digital illustrations and interface; not affiliated with or endorsed by the publisher.</p></section></div>`;
  dialog.showModal();
}
async function cellClick(pos) {
  if (!game() || !mine() || busy || game().phase !== 'play') return;
  if (draft?.kind === 'water') {
    if (!draft.line) {
      const line = draft.lines.find(l => l[0] === pos); if (line) chooseLine(line);
    } else if (draft.path.length < draft.line.length + 1 && riverNextSteps(game(), draft.pos, draft.line, draft.path).includes(pos)) { draft.path.push(pos); render(); }
    return;
  }
  if (draft?.kind === 'fire') {
    if (draft.options.includes(pos)) {
      if (draft.fire.includes(pos)) draft.fire = draft.fire.filter(q => q !== pos);
      else if (draft.fire.length < draft.required) draft.fire.push(pos);
      else notify('Deselect a destination before choosing another.');
      render();
    }
    return;
  }
  if (active().pos === pos) { selected = 'sage'; render(); return; }
  if (selected === 'sage') { await act({ type: 'move', to: pos }); return; }
  if (!ELEMENTS.includes(selected)) { notify('Select a stone or your Sage first.', false); return; }
  if (!canPlace(game(), selected, pos)) { notify('That stone cannot be placed there.'); return; }
  if (selected === 'water') {
    const lines = riverLines(game(), pos);
    if (lines.length) {
      draft = { kind: 'water', element: selected, pos, lines, line: null, path: [] };
      if (lines.length === 1) chooseLine(lines[0]); else render();
      return;
    }
  }
  if (selected === 'fire') {
    const options = fireDestinations(game(), pos), required = Math.min(options.length, game().bag.fire);
    if (required > 0 && required < options.length) { draft = { kind: 'fire', element: selected, pos, options, required, fire: [] }; render(); return; }
  }
  await act({ type: 'place', element: selected, pos });
}
function chooseLine(line) {
  const possible = findRiverPath(game(), draft.pos, line);
  if (possible === null) { notify('That river has no complete path. Choose another line or cancel.'); render(); return; }
  draft.line = line; draft.path = []; render();
}
app.addEventListener('input', event => {
  if (event.target.id === 'nickname') nickname = event.target.value;
  if (event.target.id === 'invite-code') { inputCode = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); event.target.value = inputCode; }
});
app.addEventListener('keydown', event => {
  if (event.target.id === 'invite-code' && event.key === 'Enter') { event.preventDefault(); enterOnline('join').catch(e => notify(e.message)); }
  const cell = event.target.closest('[data-cell]');
  if (!cell || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const current = Number(cell.dataset.cell);
  let next = current + ({ ArrowUp: -SIZE, ArrowDown: SIZE, ArrowLeft: -1, ArrowRight: 1 }[event.key] || 0);
  if (event.key === 'Home') next = Math.floor(current / SIZE) * SIZE;
  if (event.key === 'End') next = Math.floor(current / SIZE) * SIZE + SIZE - 1;
  next = Math.max(0, Math.min(SIZE * SIZE - 1, next));
  cell.tabIndex = -1; const target = app.querySelector(`[data-cell="${next}"]`); target.tabIndex = 0; target.focus();
});
app.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (busy && button.dataset.do !== 'rules') return;
  try {
    if (button.dataset.cell !== undefined) return await cellClick(Number(button.dataset.cell));
    if (button.dataset.capacity) { capacity = Number(button.dataset.capacity); render(); return; }
    if (button.dataset.draw) { drawCount = Number(button.dataset.draw); render(); return; }
    if (button.dataset.element) { selected = button.dataset.element; draft = null; render(); return; }
    if (button.dataset.line !== undefined) { chooseLine(draft.lines[Number(button.dataset.line)]); return; }
    switch (button.dataset.do) {
      case 'create': return await enterOnline('create');
      case 'join': return await enterOnline('join');
      case 'local': {
        readForm(); mode = 'local'; me = 'local-0';
        room = { code: 'LOCAL', version: 1, host: me, capacity, members: Array.from({ length: capacity }, (_, i) => ({ id: `local-${i}`, name: i === 0 ? nickname : ['Jade', 'Ochre', 'Ivory', 'Slate'][i] })), game: null };
        persist(); render(); break;
      }
      case 'start': return await mutate({ type: 'start' });
      case 'draw': return await act({ type: 'draw', count: Math.min(drawCount, Object.values(game().bag).reduce((a, b) => a + b, 0)) });
      case 'sage': selected = 'sage'; draft = null; render(); break;
      case 'end': return await act({ type: 'end' });
      case 'return': return await act({ type: 'return' });
      case 'cancel': draft = null; render(); break;
      case 'back-path': if (draft.path.length) draft.path.pop(); else draft.line = null; render(); break;
      case 'confirm': {
        const action = { type: 'place', element: draft.element, pos: draft.pos, ...(draft.kind === 'water' ? { river: draft.line[0], path: draft.path } : { fire: draft.fire }) };
        placementResult(game(), action); return await act(action);
      }
      case 'copy': return await copyInvite();
      case 'rules': openRules(); break;
      case 'rematch': return await mutate({ type: 'rematch' });
      case 'leave':
        if (mode === 'online') { await sendCommand({ type: 'leave', code: room.code, version: room.version }); }
        try { localStorage.removeItem('element-table-v1'); } catch { /* nothing to clear */ }
        saved = null; room = null; mode = null; clearTimeout(pollTimer); history.replaceState(null, '', location.pathname); render(); break;
      case 'home':
        if (room && game()?.phase !== 'finished') {
          notify('Your table is saved. Use this browser to return to your seat.', false);
          // Home keeps the saved seat and exposes a resume button below.
        }
        saved = room ? mode === 'local' ? { mode, room } : { mode, code: room.code } : saved;
        room = null; mode = null; selected = null; draft = null; clearTimeout(pollTimer); history.replaceState(null, '', location.pathname); render(); addResume(); break;
      case 'resume': await restore(saved); break;
    }
  } catch (error) { notify(error.message); }
});
dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('[data-do="close-rules"]')) dialog.close(); });
function addResume() {
  if (!saved || room || document.querySelector('.resume-button')) return;
  document.querySelector('.table-form')?.insertAdjacentHTML('afterbegin', '<button class="button resume-button full" data-do="resume">Return to your saved table →</button>');
}
async function restore(value) {
  if (!value) return;
  try {
    if (value.mode === 'local') { mode = 'local'; room = value.room; me = 'local-0'; }
    else { me = await identity(); const next = await getRoom(value.code); mode = 'online'; room = next; history.replaceState(null, '', `#room=${room.code}`); schedulePoll(); }
    render();
  } catch (error) { notify(error.message); addResume(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.addEventListener('online', () => poll());
window.addEventListener('hashchange', () => {
  const code = new URLSearchParams(location.hash.slice(1)).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  if (!code || code === room?.code) return;
  if (room) saved = mode === 'local' ? { mode, room } : { mode, code: room.code };
  room = null; mode = null; selected = null; draft = null; clearTimeout(pollTimer);
  inputCode = code; render();
});
render();
if (saved && (!inviteCode || inviteCode === saved.code)) restore(saved); else addResume();
