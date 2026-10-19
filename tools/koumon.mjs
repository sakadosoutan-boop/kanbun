/* 楚漢の章：実ブラウザで通しプレイする。
 *  - 影絵（2D）で、史記どおりの道を選んで「鴻門脱出」→第二部→終章「人傑の宴」まで
 *  - 異聞の結末（謝罪に行かない）と、直前の分かれ道からのやり直し
 *  - 座次図・献上品・逃げ道の三つの遊び、原文帳が全段そろうこと、読んだ字数が本体の記録に入ること
 *  - 3D（WebGL）が使える環境では、3D で宴の場面を描いて撮る
 * 実行: node tools/koumon.mjs   （PW_EXECUTABLE でブラウザの場所を指定できる）
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const OUT = process.env.SHOT_DIR || path.join(root, '.test-output/koumon');
fs.mkdirSync(OUT, { recursive: true });

const launch = { channel: process.env.PW_CHANNEL || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] };
if (process.env.PW_EXECUTABLE) launch.executablePath = process.env.PW_EXECUTABLE;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const fail = (m) => { console.error('✗ ' + m); errors.push(m); };
const url = pathToFileURL(path.join(root, 'index.html')).href;
await page.goto(url);
await page.waitForSelector('[data-act="koumon"]');
await page.click('[data-act="koumon"]');
await page.waitForSelector('.km-titlecard');
// 自動テストは軽い影絵で通す
await page.click('[data-km="view2d"]');
await page.waitForSelector('.km-titlecard');
await page.screenshot({ path: OUT + '/01-title.png' });

/** 一歩進める。返り値は結末の id（結末に達したとき） */
async function step(policy) {
  const info = await page.evaluate(() => {
    const K = window.Koumon, st = K._state(), m = K._mode();
    const modal = document.getElementById('km-modal');
    const open = modal && !modal.hidden;
    let node = null;
    if (st && K._nodes()[st.node]) { const n = K._nodes()[st.node].n; node = { id: n.id, t: n.t, k: n.k, g: n.g, ok: (n.o || []).map(o => !!o.ok), go: (n.o || []).map(o => o.go || '') }; }
    const endT = open ? (modal.querySelector('.km-end-t') || {}).textContent : '';
    return { m, node, open, endT, cls: open ? modal.className : '' };
  });
  if (info.m === 'end') return info.endT;
  if (info.m === 'card') { await page.click('#km-card'); return null; }
  if (info.m === 'scene') { await page.waitForTimeout(40); return null; }
  if (info.m === 'say' || info.m === 'react') { await page.click('#km-panel .km-next'); return null; }
  if (info.m === 'gen') { await page.click('[data-km="gennext"]'); return null; }
  if (info.m === 'feedback') { await page.click('[data-km="fbnext"]'); return null; }
  if (info.m === 'ask') {
    const n = info.node;
    let idx = policy && policy[n.id] !== undefined ? policy[n.id] : n.ok.indexOf(true);
    if (idx < 0) idx = 0;
    await page.click(`[data-km="pick"][data-i="${idx}"]`);
    return null;
  }
  if (info.m === 'game') {
    if (info.cls.includes('km-m-seat')) {
      const A = { u: 'W', haku: 'W', zo: 'N', hai: 'S', ryo: 'E' };
      for (const [p, s] of Object.entries(A)) { await page.click(`[data-km="person"][data-p="${p}"]`); await page.click(`[data-km="seat"][data-s="${s}"]`); }
      await page.click('[data-km="seatcheck"]');
      await page.screenshot({ path: OUT + '/game-seat.png' });
      await page.click('[data-km="seatdone"]');
    } else if (info.cls.includes('km-m-gift')) {
      await page.click('[data-km="giftitem"][data-it="heki"]'); await page.click('[data-km="gifttarget"][data-t="u"]');
      await page.click('[data-km="giftitem"][data-it="to"]'); await page.click('[data-km="gifttarget"][data-t="zo"]');
      await page.screenshot({ path: OUT + '/game-gift.png' });
      await page.click('[data-km="giftdone"]');
    } else if (info.cls.includes('km-m-route')) {
      for (let i = 0; i < 3; i++) await page.click('[data-km="routepick"][data-i="0"]');
      await page.screenshot({ path: OUT + '/game-route.png' });
      await page.click('[data-km="routedone"]');
    }
    return null;
  }
  await page.waitForTimeout(30);
  return null;
}
async function playUntilEnd(policy, max = 900) {
  for (let i = 0; i < max; i++) {
    const e = await step(policy);
    if (e) return e;
  }
  return null;
}

// ---- 1. 異聞：謝罪に行かない → 霸上の露 → やり直し ----
await page.click('[data-km="new"]');
let end = await playUntilEnd({ 'c1-sha': 1 });
if (end !== '霸上の露') fail('謝罪を拒むと「霸上の露」になるはず: ' + end);
else console.log('✔ 異聞の結末「霸上の露」');
await page.screenshot({ path: OUT + '/02-bad-end.png' });
await page.click('[data-km="retry"]');
await page.waitForFunction(() => window.Koumon._mode() === 'ask');
const back = await page.evaluate(() => window.Koumon._state().node);
if (back !== 'c1-sha') fail('やり直しは直前の分かれ道へ戻るはず: ' + back); else console.log('✔ 直前の分かれ道へ戻る');

// ---- 2. 正史の道で鴻門を脱出 ----
end = await playUntilEnd({});
if (end !== '鴻門脱出') fail('史記どおりに進めば「鴻門脱出」のはず: ' + end); else console.log('✔ 正史の結末「鴻門脱出」');
await page.screenshot({ path: OUT + '/03-true-end.png' });
const s1 = await page.evaluate(() => ({ st: window.Koumon._state(), chars: window.Store.state.chars, plays: window.Store.state.plays.koumon, ach: window.Store.state.ach }));
if (!s1.chars) fail('原文の段を読んだ字数が本体の記録に入っていない');
if (s1.plays !== 1) fail('鴻門脱出が finishSession で記録されていない');
if (s1.ach.indexOf('a15') === -1) fail('称号「鴻門脱出」が付いていない');
if (s1.st.ok !== s1.st.q) fail('正解だけを選んだのに読解率が100%でない: ' + s1.st.ok + '/' + s1.st.q);
console.log(`  読み解いた句 ${s1.st.ok}/${s1.st.q}・本体の読んだ字数 ${s1.chars}`);

// ---- 3. 第二部「垓下」から終章へ ----
await page.click('[data-km="part2"]');
end = await playUntilEnd({});
if (end !== '人傑の宴') fail('終章まで読めば「人傑の宴」のはず: ' + end); else console.log('✔ 終章の結末「人傑の宴」');
await page.click('[data-km="ai"]');
await page.waitForSelector('.km-ai-prompt');
const prompt = await page.$eval('.km-ai-prompt', t => t.value);
if (!/項王/.test(prompt) || !/五回/.test(prompt)) fail('AI 指示文が表示されていない');
else console.log('✔ AI ロールプレイの指示文');
await page.screenshot({ path: OUT + '/04-ai.png' });
await page.click('[data-km="totitle"]');

// ---- 4. 原文帳・結末帳・保存 ----
const meta = await page.evaluate(() => window.Koumon._meta());
const genN = Object.keys(meta.gen).length, genAll = await page.evaluate(() => Object.keys(window.KOUMON.genbun).length);
if (genN !== genAll) fail(`原文帳が全段そろっていない ${genN}/${genAll}`); else console.log(`✔ 原文帳 ${genN}/${genAll} 段`);
await page.click('[data-km="book"]');
await page.screenshot({ path: OUT + '/05-book.png' });
await page.click('[data-km="closemodal"]');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kanbun-dojo:koumon:v1')));
if (!saved || !saved.endings.T1 || !saved.endings.T2 || !saved.endings.B1) fail('結末が保存されていない');

// ---- 5. 3D で宴の場面（WebGL が使えるときだけ） ----
const has3d = await page.evaluate(() => !!(window.KoumonStage3D && window.KoumonStage3D.supported()));
if (has3d) {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.click('[data-km="view3d"]');
  await page.waitForFunction(() => window.Koumon._mode() === 'title' && !document.querySelector('.km-prep.show'), null, { timeout: 180000, polling: 1000 });
  await page.click('[data-km="menu"]');
  await page.click('[data-km="chap"][data-c="c3"]');
  await page.waitForFunction(() => /card|say/.test(window.Koumon._mode()), null, { timeout: 180000, polling: 500 });
  if (await page.evaluate(() => window.Koumon._mode() === 'card')) await page.click('#km-card');
  await page.waitForFunction(() => window.Koumon._mode() === 'say', null, { timeout: 60000, polling: 500 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/06-3d-feast.png', timeout: 120000 });
  console.log('✔ 3D で宴の場面を描画（品質 ' + await page.evaluate(() => window.KoumonStage3D.quality()) + '）');
} else console.log('- WebGL が使えないため 3D の確認は省略');

await page.click('[data-km="quit"]');
await page.waitForSelector('[data-act="koumon"]');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('✔ 楚漢の章：通しプレイ完了');
