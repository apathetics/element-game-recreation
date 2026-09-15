import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(resolve(root, 'dist/src'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'favicon.svg', 'src/app.js', 'src/api.js', 'src/game.js']) {
  await copyFile(resolve(root, file), resolve(root, 'dist', file));
}
const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (!!url !== !!key) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY, or neither for a local-play build.');
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('SUPABASE_URL must be your HTTPS Supabase project URL.');
if (key.startsWith('sb_secret_')) throw new Error('Never put a secret key in a browser build. Use the publishable key.');
if (key && !key.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key (sb_publishable_...).');
await writeFile(resolve(root, 'dist/config.js'), `export default ${JSON.stringify({ transport: url ? 'supabase' : 'offline', url: url.replace(/\/$/, ''), key })};\n`);
await writeFile(resolve(root, 'dist/.nojekyll'), '');
console.log(`Built dist/ — ${url ? 'online multiplayer configured' : 'local play; configure Supabase to enable invite rooms'}.`);
