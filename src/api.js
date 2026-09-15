import config from '../config.js';
export const onlineAvailable = config.transport !== 'offline';
export const environment = config.transport;
const sessionKey = `element-session-v1:${config.url || config.transport}`;
let session = null, refreshing = null;
try { session = JSON.parse(localStorage.getItem(sessionKey)); } catch { /* storage unavailable */ }
function saveSession(value) {
  if (value.access_token && !value.expires_at) value.expires_at = Date.now() / 1000 + value.expires_in;
  session = value;
  try { localStorage.setItem(sessionKey, JSON.stringify(value)); }
  catch { throw new Error('Allow browser storage so your seat can survive a refresh.'); }
  return session;
}
window.addEventListener('storage', event => {
  if (event.key === sessionKey && event.newValue) { try { session = JSON.parse(event.newValue); } catch { /* ignore malformed storage */ } }
});
async function json(url, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try { response = await fetch(url, { ...options, signal: controller.signal }); }
  catch { throw new Error('Connection interrupted. Your last saved move is safe. Reconnect and try again.'); }
  finally { clearTimeout(timer); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error_description || data.msg || data.error || data.message || 'The table could not be reached.'); error.status = response.status; throw error; }
  return data;
}
export async function identity() {
  if (config.transport === 'offline') throw new Error('Online tables are not available on this site yet. You can play together on this device.');
  if (config.transport === 'local') {
    if (!session) saveSession(await json('./api/session', { method: 'POST' }));
    return session.id;
  }
  if (session?.expires_at > Date.now() / 1000 + 60) return session.user.id;
  if (!refreshing) refreshing = (async () => {
    if (session?.refresh_token) {
      // Preserve the seat on transient refresh errors; never silently create a new identity.
      saveSession(await json(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token })
      }));
    } else {
      saveSession(await json(`${config.url}/auth/v1/signup`, {
        method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} })
      }));
    }
  })().finally(() => { refreshing = null; });
  await refreshing; return session.user.id;
}
async function headers() {
  await identity();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}`, ...(config.key ? { apikey: config.key } : {}) };
}
export async function getRoom(code) {
  const h = await headers();
  if (config.transport === 'local') return (await json(`./api/room?code=${encodeURIComponent(code)}`, { headers: h })).room;
  const rows = await json(`${config.url}/rest/v1/game_rooms?code=eq.${encodeURIComponent(code)}&select=document`, { headers: h });
  if (!rows.length) throw new Error('Table not found. Join using its invite code.');
  return rows[0].document;
}
export async function sendCommand(command) {
  const h = await headers();
  const endpoint = config.transport === 'local' ? './api/command' : `${config.url}/functions/v1/table`;
  const body = JSON.stringify({ ...command, requestId: command.requestId || crypto.randomUUID() });
  // Retry exactly the same request ID once after an uncertain network outcome.
  for (let attempt = 0; ; attempt++) {
    try { return (await json(endpoint, { method: 'POST', headers: h, body })).room; }
    catch (error) { if (error.status || attempt) throw error; }
  }
}
