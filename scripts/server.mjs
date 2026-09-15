import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, createHash, webcrypto } from 'node:crypto';
import { newRoom, commandRoom, publicRoom, makeCode } from '../src/rooms.js';

globalThis.crypto ??= webcrypto;
const root = resolve(fileURLToPath(new URL('..', import.meta.url))), staticOnly = process.argv.includes('--static');
const webRoot = staticOnly ? resolve(root, 'dist') : root;
const dataDir = process.env.ELEMENT_DATA_DIR || resolve(root, '.data');
const port = Number(process.env.PORT || 8787);
let store = { rooms: {}, sessions: {} };
if (!staticOnly) {
  await mkdir(dataDir, { recursive: true });
  try { store = JSON.parse(await readFile(resolve(dataDir, 'tables.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
let pendingSave = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(store);
  pendingSave = pendingSave.then(async () => {
    await writeFile(resolve(dataDir, 'tables.tmp'), snapshot, { mode: 0o600 });
    await rename(resolve(dataDir, 'tables.tmp'), resolve(dataDir, 'tables.json'));
  });
  return pendingSave;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let bytes = 0, chunks = [];
  for await (const part of req) { bytes += part.length; if (bytes > 16384) throw new Error('Request is too large.'); chunks.push(part); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!staticOnly && url.pathname.startsWith('/api/')) {
      if (req.headers.origin && req.headers.origin !== url.origin) return send(res, 403, { error: 'Cross-origin request rejected.' });
      if (url.pathname === '/api/session' && req.method === 'POST') {
        const token = randomBytes(32).toString('hex'), id = crypto.randomUUID();
        store.sessions[hash(token)] = id; await save(); return send(res, 200, { token, id });
      }
      const userId = store.sessions[hash((req.headers.authorization || '').replace(/^Bearer /, ''))];
      if (!userId) return send(res, 401, { error: 'Your session has expired. Reload to reconnect.' });
      if (url.pathname === '/api/room' && req.method === 'GET') {
        const room = store.rooms[url.searchParams.get('code')];
        if (!room || !room.members.some(m => m.id === userId)) return send(res, 404, { error: 'Table not found. Join with its invite code first.' });
        return send(res, 200, { room: publicRoom(room) });
      }
      if (url.pathname === '/api/command' && req.method === 'POST') {
        const input = await body(req); let room;
        if (input.type === 'create') {
          // A create retry returns the existing room instead of creating a duplicate.
          room = Object.values(store.rooms).find(r => r.createRequest === `${userId}:${input.requestId}`);
          if (!room) {
            let code; do { code = makeCode(); } while (store.rooms[code]);
            room = newRoom(userId, input.name, input.capacity, code);
            room.createRequest = `${userId}:${input.requestId}`;
          }
        } else {
          const original = store.rooms[input.code];
          if (!original) return send(res, 404, { error: 'No table has that code. Check the invitation.' });
          room = commandRoom(original, userId, input);
        }
        store.rooms[room.code] = room; await save(); return send(res, 200, { room: publicRoom(room) });
      }
      return send(res, 404, { error: 'Not found.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    if (!staticOnly && url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return res.end('export default { transport: "local" };');
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1);
    // Only serve public assets, never local sessions, docs, deployment code, or secrets.
    if (!/^(index\.html|config\.js|styles\.css|favicon\.svg|src\/(app|api|game|rooms|audio|interaction)\.js)$/.test(relative)) return send(res, 404, { error: 'Not found.' });
    const path = resolve(webRoot, relative);
    if (!path.startsWith(webRoot + sep)) return send(res, 403, { error: 'Forbidden.' });
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (e) {
    send(res, e.code === 'ENOENT' ? 404 : /table changed/i.test(e.message) ? 409 : 400, { error: e.code === 'ENOENT' ? 'Not found.' : e.message });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Element is ready: http://127.0.0.1:${server.address().port}${staticOnly ? ' (static preview)' : ' (multiplayer development server)'}`));
async function close() { server.close(); await pendingSave; process.exit(0); }
process.on('SIGTERM', close); process.on('SIGINT', close);
