/**
 * Screenshot a route of the web build, and report what the page logged.
 *
 * The web target had no way to be LOOKED at from here — every check was
 * "it compiles and the right file got bundled", which is exactly the kind of
 * check that misses a widget that renders blank or a layout that only breaks
 * in a browser. This is the missing half.
 *
 *   node scripts/web-shot.mjs <path> [outfile] [--url=http://host:port]
 *
 *   node scripts/web-shot.mjs /sign-in
 *   node scripts/web-shot.mjs / feed.png --url=http://localhost:8081
 *
 * Point it at whatever is serving the app: `npx expo start --web` for the dev
 * server, or a static server over `npx expo export --platform web`. It does
 * not start either — a screenshot tool that owns a server is a screenshot tool
 * that fights with the one already running.
 *
 * Console messages and page errors are printed whether or not the shot
 * succeeds, because on web those are usually the actual answer.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')),
);
const positional = args.filter((a) => !a.startsWith('--'));

const base = flags.url ?? 'http://localhost:8081';
// A leading slash is optional, and on Windows it is actively hostile: Git
// Bash rewrites any argument that looks like an absolute POSIX path into a
// Windows one, so `/sign-in` arrives as `C:/Program Files/Git/sign-in` and the
// navigation fails with nothing but "invalid URL". Pass `sign-in`.
const rawRoute = positional[0] ?? '/';
const route = rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`;
const outFile = resolve(positional[1] ?? 'web-shot.png');
// A phone-ish viewport by default: this app is a phone app that also runs on
// the web, and its own layout notes are written about narrow widths.
const width = Number(flags.width ?? 430);
const height = Number(flags.height ?? 932);
// Generous, because a cold Metro dev server bundles on first request.
const timeout = Number(flags.timeout ?? 120_000);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => {
  // Analytics and other noise fail constantly and mean nothing here; a failed
  // asset or API call is what matters.
  const url = req.url();
  if (/\.(png|jpg|jpeg|otf|ttf|wasm|js|css)(\?|$)/i.test(url) || url.includes('/auth/')) {
    logs.push(`[requestfailed] ${req.failure()?.errorText ?? 'failed'} ${url}`);
  }
});

let failure = null;
try {
  await page.goto(base + route, { waitUntil: 'load', timeout });
  // The router mounts after load, and this app gates its whole tree on fonts
  // being ready — so a fixed settle beats networkidle, which a dev server with
  // an open HMR socket never reaches.
  await page.waitForTimeout(Number(flags.settle ?? 6000));
  await mkdir(dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile, fullPage: flags.full === 'true' });
  console.log(`shot: ${outFile}`);
} catch (error) {
  failure = error;
  console.log(`FAILED: ${error.message.split('\n')[0]}`);
} finally {
  await browser.close();
}

if (logs.length > 0) {
  console.log('--- page output ---');
  for (const line of logs.slice(0, 40)) console.log(line);
  if (logs.length > 40) console.log(`… ${logs.length - 40} more`);
} else {
  console.log('--- page output: none ---');
}

process.exit(failure ? 1 : 0);
