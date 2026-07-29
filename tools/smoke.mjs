import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const OUT = process.env.SHOT_DIR || '/tmp/claude-0/-home-user-kanbun/d56d92a1-992a-58b8-800e-c4bd9b478fb8/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const url = 'file://' + path.join(root, 'index.html');
await page.goto(url);
await page.waitForSelector('.mode');
await page.screenshot({ path: OUT + '/01-home.png', fullPage: true });

async function playChoice(id, label) {
  await page.click(`[data-act="play"][data-id="${id}"]`);
  await page.waitForSelector('.choice');
  await page.screenshot({ path: `${OUT}/q-${id}.png` });
  for (let n = 0; n < 40; n++) {
    if (await page.$('.result')) break;
    const c = await page.$('.choice:not([disabled])');
    if (c) { await c.click(); await page.waitForTimeout(60); continue; }
    const nx = await page.$('#vd .btn');
    if (nx) { await nx.click(); await page.waitForTimeout(60); continue; }
    break;
  }
  await page.waitForSelector('.result', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/r-${id}.png`, fullPage: true });
  console.log(`✔ ${label}`);
  await page.click('[data-act="go"][data-to="home"]');
  await page.waitForSelector('.mode');
}

for (const [id, label] of [['kundoku','訓読の基本'],['saidoku','再読文字'],['kuho','句法バトル'],['kanshi','漢詩'],['koji','故事成語'],['kanji','漢字読み'],['mogi','実力テスト']]) {
  await playChoice(id, label);
}

// 返り点パズル：正しい順にタップ
await page.click('[data-act="play"][data-id="kaeriten"]');
await page.waitForSelector('.kt-char');
await page.screenshot({ path: OUT + '/q-kaeriten.png' });
for (let round = 0; round < 10; round++) {
  if (await page.$('.result')) break;
  const order = await page.evaluate(() => {
    const st = window.__G && window.__G(); return null;
  });
  // データから正解順を引く：現在の問題 id を DOM から推定できないので総当りで正解タップ
  for (let step = 0; step < 12; step++) {
    const done = await page.$('#vd .btn');
    if (done) { await done.click(); await page.waitForTimeout(80); break; }
    const btns = await page.$$('.kt-char:not([disabled])');
    if (!btns.length) break;
    let advanced = false;
    for (const b of btns) {
      const before = await page.$$eval('.kt-char.done', e => e.length);
      await b.click();
      await page.waitForTimeout(40);
      const after = await page.$$eval('.kt-char.done', e => e.length);
      if (after > before || await page.$('#vd .btn')) { advanced = true; break; }
    }
    if (!advanced) break;
  }
}
await page.waitForSelector('.result', { timeout: 15000 });
await page.screenshot({ path: OUT + '/r-kaeriten.png', fullPage: true });
console.log('✔ 返り点ルート');
await page.click('[data-act="go"][data-to="home"]');
await page.waitForSelector('.mode');

// 置き字ハンター
await page.click('[data-act="play"][data-id="okiji"]');
await page.waitForSelector('.ok-char');
await page.screenshot({ path: OUT + '/q-okiji.png' });
for (let i = 0; i < 40; i++) {
  if (await page.$('.result')) break;
  const j = await page.$('[data-act="okjudge"]');
  if (j) { await j.click(); await page.waitForTimeout(80); continue; }
  const n = await page.$('[data-act="oknext"]');
  if (n) { await n.click(); await page.waitForTimeout(80); continue; }
  break;
}
await page.waitForSelector('.result', { timeout: 15000 });
console.log('✔ 置き字ハンター');
await page.screenshot({ path: OUT + '/r-okiji.png', fullPage: true });
await page.click('[data-act="go"][data-to="home"]');
await page.waitForSelector('.mode');

// 並べ替え
await page.click('[data-act="play"][data-id="narabe"]');
await page.waitForSelector('.nb-pool');
await page.screenshot({ path: OUT + '/q-narabe.png' });
for (let i = 0; i < 200; i++) {
  if (await page.$('.result')) break;
  const nx = await page.$('[data-act="nbnext"]');
  if (nx) { await nx.click(); await page.waitForTimeout(70); continue; }
  const jd = await page.$('[data-act="nbjudge"]');
  if (jd) { await jd.click(); await page.waitForTimeout(70); continue; }
  const chip = await page.$('[data-act="nbpush"]:not([disabled])');
  if (chip) { await chip.click(); await page.waitForTimeout(40); continue; }
  break;
}
await page.waitForSelector('.result', { timeout: 10000 });
console.log('✔ 書き下し組立');
await page.screenshot({ path: OUT + '/r-narabe.png', fullPage: true });
await page.click('[data-act="go"][data-to="home"]');

// 図鑑・講座・漢詩集・実績
for (const [to, name] of [['zukan','図鑑'],['lessons','講座'],['shishu','漢詩集'],['ach','実績']]) {
  await page.click(`[data-act="go"][data-to="${to}"]`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/p-${to}.png`, fullPage: true });
  console.log('✔ ' + name);
  await page.click('[data-act="go"][data-to="home"]');
  await page.waitForSelector('.mode');
}

// 図鑑の検索・展開
await page.click('[data-act="go"][data-to="zukan"]');
await page.fill('#zk-q', '反語');
await page.waitForTimeout(250);
const cnt = await page.$$eval('.kuho-item', e => e.length);
console.log('  検索「反語」→ ' + cnt + ' 件');
await page.click('.kuho-head');
await page.waitForTimeout(150);
await page.screenshot({ path: OUT + '/p-zukan-open.png', fullPage: true });

// 講座を1本開く
await page.click('[data-act="go"][data-to="lessons"]');
await page.click('[data-act="lesson"]');
await page.waitForTimeout(200);
await page.screenshot({ path: OUT + '/p-lesson.png', fullPage: true });

// ダークテーマ
await page.click('[data-act="go"][data-to="home"]');
await page.click('#theme-btn'); await page.waitForTimeout(120);
await page.click('#theme-btn'); await page.waitForTimeout(300);
await page.screenshot({ path: OUT + '/02-home-dark.png', fullPage: true });
console.log('  theme = ' + await page.evaluate(() => document.documentElement.getAttribute('data-theme')));

// デスクトップ幅
const wide = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await wide.goto(url);
await wide.waitForSelector('.mode');
await wide.screenshot({ path: OUT + '/03-home-wide.png', fullPage: true });

// 横スクロール検査
for (const p of [page, wide]) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) errors.push('横スクロール発生: ' + over + 'px');
}

await browser.close();
if (errors.length) { console.error('\n✗ JS エラー:\n' + errors.join('\n')); process.exit(1); }
console.log('\n✔ スモークテスト完了　スクリーンショット: ' + OUT);
