// Playwright harness (borrowed from the LifeLens repo's node_modules, like the sibling projects). Real Chrome, WebGL.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const candidates = [process.env.PLAYWRIGHT_PATH, path.resolve(import.meta.dirname, '../../../LifeLens/node_modules/playwright'), path.resolve(import.meta.dirname, '../../../year7-cells-lab/node_modules/playwright'), 'playwright'].filter(Boolean);
let pw;
for (const c of candidates) { try { pw = require(c); break; } catch { /* next */ } }
if (!pw) throw new Error('Playwright not found. Set PLAYWRIGHT_PATH to a node_modules/playwright folder.');

export async function launch({ url = process.env.URL ?? 'http://localhost:8490/', hash = '', outDir = 'playtest-shots', mobile = false, width = 1366, height = 768, dpr = +(process.env.DPR ?? 1) } = {}) {
  mkdirSync(outDir, { recursive: true });
  const browser = await pw.chromium.launch({ headless: !process.env.HEADED, channel: process.env.PW_CHANNEL ?? 'chrome', args: [process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && errors.length < 40 && !errors.includes(`[${m.type()}] ${m.text()}`)) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(String(e.stack ?? e)));
  page.on('request', r => requests.push(r.url()));
  await page.goto(url + hash);
  try { await page.waitForFunction(() => window.__sealed || window.__stage, null, { timeout: 30000 }); } catch (e) { console.error('Game did not boot. Console errors:\n' + errors.join('\n')); await browser.close(); process.exit(1); }
  let n = 0;
  return {
    page, browser, errors, requests,
    async shot(name) { const p = path.join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: p }); return p; },
    async wait(ms) { await page.waitForTimeout(ms); },
    ev: (fn, arg) => page.evaluate(fn, arg),
    async close() { await browser.close(); },
  };
}
