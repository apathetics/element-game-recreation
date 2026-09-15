import { newRoom, commandRoom, publicRoom, makeCode } from '../../../src/rooms.js';

export function createHandler({ url, serviceKey, fetchImpl = fetch }) {
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function response(status, data) { return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
async function database(path, method = 'GET', body) {
  const result = await fetchImpl(`${url}/rest/v1/game_rooms${path}`, {
    method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await result.json();
  if (!result.ok) { const error = new Error('The table could not be saved. Please try again.'); Object.assign(error, { code: data.code }); throw error; }
  return data;
}
return async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return response(405, { error: 'Method not allowed.' });
  try {
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return response(401, { error: 'Sign in anonymously before joining a table.' });
    // Never trust user IDs or game state supplied by the browser.
    const auth = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: authorization } });
    if (!auth.ok) return response(401, { error: 'Your session could not be verified. Reload to reconnect.' });
    const user = await auth.json();
    if (!user.id || user.role !== 'authenticated') return response(401, { error: 'An authenticated player session is required.' });
    const text = await req.text();
    if (text.length > 16384) return response(413, { error: 'Request is too large.' });
    const input = JSON.parse(text);
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(input.requestId)) return response(400, { error: 'Invalid request identifier.' });
    if (input.type === 'create') {
      const previous = await database(`?creator_id=eq.${user.id}&create_request=eq.${input.requestId}&select=document`);
      if (previous.length) return response(200, { room: publicRoom(previous[0].document) });
      const recent = await database(`?creator_id=eq.${user.id}&updated_at=gte.${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&select=code&limit=21`);
      if (recent.length >= 20) return response(429, { error: 'You have created many tables today. Please reuse an existing table or try tomorrow.' });
      for (let attempt = 0; attempt < 5; attempt++) {
        const room = newRoom(user.id, input.name, input.capacity, makeCode());
        try {
          await database('', 'POST', { code: room.code, version: room.version, member_ids: [user.id], document: room, creator_id: user.id, create_request: input.requestId });
          return response(200, { room: publicRoom(room) });
        } catch (error) {
          if (error.code !== '23505') throw error;
          const retry = await database(`?creator_id=eq.${user.id}&create_request=eq.${input.requestId}&select=document`);
          if (retry.length) return response(200, { room: publicRoom(retry[0].document) });
        }
      }
      return response(503, { error: 'Could not reserve a table code. Please try again.' });
    }
    if (typeof input.code !== 'string' || !/^[A-Z2-9]{8}$/.test(input.code)) return response(400, { error: 'Enter the 8-character invite code.' });
    for (let attempt = 0; attempt < 5; attempt++) {
      const rows = await database(`?code=eq.${input.code}&select=document`);
      if (!rows.length) return response(404, { error: 'No table has that code. Check the invitation.' });
      const original = rows[0].document, room = commandRoom(original, user.id, input);
      if (room === original) return response(200, { room: publicRoom(room) });
      const updated = await database(`?code=eq.${input.code}&version=eq.${original.version}`, 'PATCH', {
        document: room, member_ids: room.members.map(m => m.id), version: room.version, updated_at: new Date().toISOString()
      });
      if (updated.length) return response(200, { room: publicRoom(room) });
      // Re-read to recognize a successful duplicate request. A different stale
      // action is rejected by commandRoom, never replayed on a newer position.
    }
    return response(409, { error: 'The table changed. Please try your action again.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The table could not be reached.';
    return response(/table changed/i.test(message) ? 409 : 400, { error: message });
  }
};
}
