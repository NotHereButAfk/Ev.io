import { fileURLToPath } from 'url';
import { makeAuthServer } from './authserver.mjs';

const PORT = 8798;
const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const { close } = makeAuthServer({ port: PORT, staticRoot });

await new Promise((resolve) => setTimeout(resolve, 80));
let failed = false;

async function check(name, condition) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
  if (!condition) failed = true;
}

try {
  const match = await fetch(`http://127.0.0.1:${PORT}/api/matchmake`);
  const matchState = await match.json();
  await check('matchmaker reports the authoritative arena before map loading',
    match.status === 200 && matchState.available === true
      && typeof matchState.mapId === 'string' && matchState.capacity === 8);
  await check('matchmaker response cannot be cached', match.headers.get('cache-control') === 'no-store');

  const home = await fetch(`http://127.0.0.1:${PORT}/`);
  const html = await home.text();
  await check('serves the built game at /', home.status === 200 && /<!doctype html>/i.test(html));
  await check('sets the HTML content type', home.headers.get('content-type')?.startsWith('text/html'));
  await check('does not cache HTML indefinitely', home.headers.get('cache-control') === 'no-cache');

  for (const route of ['/login', '/register', '/privacy', '/terms']) {
    const page = await fetch(`http://127.0.0.1:${PORT}${route}`);
    const pageHtml = await page.text();
    await check(`serves clean HTML route ${route}`, page.status === 200 && /<!doctype html>/i.test(pageHtml));
  }

  const missing = await fetch(`http://127.0.0.1:${PORT}/not-a-real-file`);
  await check('returns 404 for missing files', missing.status === 404);

  const traversal = await fetch(`http://127.0.0.1:${PORT}/%2e%2e%2fpackage.json`);
  await check('blocks encoded path traversal', traversal.status === 403);

  const post = await fetch(`http://127.0.0.1:${PORT}/`, { method: 'POST' });
  await check('static handler rejects non-read methods', post.status === 405);
} finally {
  await close();
}

process.exitCode = failed ? 1 : 0;
