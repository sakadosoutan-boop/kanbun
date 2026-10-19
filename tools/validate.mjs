/* データ整合性チェック  実行: node tools/validate.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['kuho', 'mondai', 'misyomi', 'kaeriten', 'okiji', 'narabekae', 'kanshi', 'koji', 'kanji', 'lessons', 'foes', 'foe-art', 'journey', 'koumon'];
const CODE = ['store', 'quizgen'];

const sandbox = { window: {}, localStorage: null, console };
sandbox.window.window = sandbox.window;
sandbox.Store = undefined;
vm.createContext(sandbox);

for (const f of DATA) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/data', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
}
for (const f of CODE) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
}
const W = sandbox.window;

let errors = 0, warns = 0;
const err = (m) => { errors++; console.error('  ✗ ' + m); };
const warn = (m) => { warns++; console.warn('  ! ' + m); };
const sec = (m) => console.log('\n▼ ' + m);

const uniq = (list, name) => {
  const seen = new Set();
  list.forEach((x, i) => {
    if (!x.id) return err(`${name}[${i}] に id がない`);
    if (seen.has(x.id)) err(`${name}: id 重複 ${x.id}`);
    seen.add(x.id);
  });
};

/* ---------- 句法 ---------- */
sec(`句法 (${W.KUHO.length} 件)`);
uniq(W.KUHO, 'KUHO');
W.KUHO.forEach((k) => {
  ['cat', 'form', 'read', 'mean'].forEach((f) => { if (!k[f]) err(`KUHO ${k.id}: ${f} が空`); });
  if (![1, 2, 3].includes(k.level)) err(`KUHO ${k.id}: level が不正 (${k.level})`);
  (k.ex || []).forEach((e, j) => {
    if (!e.k || !e.y) err(`KUHO ${k.id} 例文${j}: 白文または書き下しが空`);
    if (!e.t) warn(`KUHO ${k.id} 例文${j}: 現代語訳がない`);
  });
  if (!k.ex || !k.ex.length) warn(`KUHO ${k.id}: 例文がない`);
});

/* ---------- 選択問題 ---------- */
sec(`選択問題 (${W.MONDAI.length} 問)`);
uniq(W.MONDAI, 'MONDAI');
W.MONDAI.forEach((m) => {
  if (!m.q) err(`MONDAI ${m.id}: 設問文が空`);
  if (!Array.isArray(m.choices) || m.choices.length !== 4) err(`MONDAI ${m.id}: 選択肢が4つでない`);
  if (typeof m.a !== 'number' || m.a < 0 || m.a >= m.choices.length) err(`MONDAI ${m.id}: 正解 index が不正`);
  if (new Set(m.choices).size !== m.choices.length) err(`MONDAI ${m.id}: 選択肢が重複`);
  if (!m.exp) warn(`MONDAI ${m.id}: 解説がない`);
});
// 正解位置の偏りチェック
const dist = [0, 0, 0, 0];
W.MONDAI.forEach((m) => dist[m.a]++);
console.log('  正解位置の分布 (出題時はシャッフル):', dist.join(' / '));

/* ---------- 返り点 ---------- */
sec(`返り点パズル (${W.KAERITEN.length} 問)`);
uniq(W.KAERITEN, 'KAERITEN');
W.KAERITEN.forEach((k) => {
  const n = k.chars.length;
  if (k.order.length !== n) err(`KAERITEN ${k.id}: order の長さが chars と不一致`);
  const sorted = k.order.slice().sort((a, b) => a - b);
  if (sorted.some((v, i) => v !== i)) err(`KAERITEN ${k.id}: order が 0..${n - 1} の順列でない`);
  if (!k.yomi || !k.tip) err(`KAERITEN ${k.id}: yomi / tip が空`);
});

/* ---------- 置き字 ---------- */
sec(`置き字 (${W.OKIJI.length} 問)`);
uniq(W.OKIJI, 'OKIJI');
const OKIJI_CHARS = new Set(['而', '於', '于', '乎', '矣', '焉', '兮']);
W.OKIJI.forEach((o) => {
  if (!o.okiji.length) err(`OKIJI ${o.id}: 置き字が指定されていない`);
  o.okiji.forEach((i) => {
    if (i < 0 || i >= o.chars.length) return err(`OKIJI ${o.id}: index ${i} が範囲外`);
    if (!OKIJI_CHARS.has(o.chars[i])) err(`OKIJI ${o.id}: 「${o.chars[i]}」は置き字の代表7字に含まれない`);
  });
  if (!o.yomi || !o.tip) err(`OKIJI ${o.id}: yomi / tip が空`);
});

/* ---------- 並べ替え ---------- */
sec(`並べ替え (${W.NARABEKAE.length} 問)`);
uniq(W.NARABEKAE, 'NARABEKAE');
W.NARABEKAE.forEach((n) => {
  if (n.parts.length < 3) err(`NARABEKAE ${n.id}: パーツが少なすぎる (${n.parts.length})`);
  if (new Set(n.parts).size !== n.parts.length) warn(`NARABEKAE ${n.id}: 同じパーツが重複（判定が曖昧になる）`);
  if (!n.trans || !n.src) err(`NARABEKAE ${n.id}: 訳または出典が空`);
});

/* ---------- 漢詩 ---------- */
sec(`漢詩 (${W.KANSHI.length} 首)`);
uniq(W.KANSHI, 'KANSHI');
W.KANSHI.forEach((p) => {
  const wantChars = p.form.startsWith('五') ? 5 : 7;
  const wantLines = p.form.endsWith('絶句') ? 4 : 8;
  if (p.lines.length !== wantLines) err(`KANSHI ${p.id}: ${p.form} なのに ${p.lines.length} 句`);
  p.lines.forEach((ln, i) => {
    if ([...ln].length !== wantChars) err(`KANSHI ${p.id}: 第${i + 1}句が ${[...ln].length} 字（${wantChars} 字であるべき）`);
  });
  if (p.yomi.length !== p.lines.length) err(`KANSHI ${p.id}: 書き下しの句数が不一致`);
  // 押韻字が該当句の末字と一致するか
  if (p.rhyme.length !== p.rhymeLines.length) err(`KANSHI ${p.id}: rhyme と rhymeLines の数が不一致`);
  p.rhymeLines.forEach((lineNo, i) => {
    const ln = p.lines[lineNo - 1];
    if (!ln) return err(`KANSHI ${p.id}: rhymeLines ${lineNo} が範囲外`);
    const tail = [...ln].pop();
    if (tail !== p.rhyme[i]) err(`KANSHI ${p.id}: 第${lineNo}句の末字は「${tail}」だが rhyme は「${p.rhyme[i]}」`);
  });
  // regular フラグと押韻の原則が一致しているか
  const expected = wantChars === 5
    ? p.lines.map((_, i) => i + 1).filter((n) => n % 2 === 0)
    : [1].concat(p.lines.map((_, i) => i + 1).filter((n) => n % 2 === 0));
  const same = expected.length === p.rhymeLines.length && expected.every((v, i) => v === p.rhymeLines[i]);
  if (same !== !!p.regular) err(`KANSHI ${p.id}: regular=${p.regular} だが押韻は ${p.rhymeLines.join(',')}（原則は ${expected.join(',')}）`);
  p.tsuiku.forEach((t) => {
    if (t[1] !== t[0] + 1) err(`KANSHI ${p.id}: 対句 ${t} が隣接していない`);
    if (t[1] > p.lines.length) err(`KANSHI ${p.id}: 対句 ${t} が範囲外`);
  });
  if (p.form.endsWith('律詩')) {
    const need = [[3, 4], [5, 6]];
    need.forEach((n) => {
      if (!p.tsuiku.some((t) => t[0] === n[0] && t[1] === n[1])) {
        err(`KANSHI ${p.id}: 律詩なのに第${n[0]}・${n[1]}句の対句が登録されていない`);
      }
    });
  }
});

/* ---------- 故事成語・漢字 ---------- */
sec(`故事成語 (${W.KOJI.length} 件) / 頻出漢字 (${W.KANJI.length} 字)`);
uniq(W.KOJI, 'KOJI');
W.KOJI.forEach((k) => {
  ['word', 'yomi', 'src', 'mean', 'story'].forEach((f) => { if (!k[f]) err(`KOJI ${k.id}: ${f} が空`); });
});
const kseen = new Set();
W.KANJI.forEach((k) => {
  if (kseen.has(k.c)) err(`KANJI: 「${k.c}」が重複`);
  kseen.add(k.c);
  if (!k.yomi || !k.yomi.length) err(`KANJI ${k.c}: 読みが空`);
  if (!k.mean) err(`KANJI ${k.c}: 意味が空`);
});

/* ---------- 書き下し問題の誤答（手書き） ---------- */
sec(`書き下しの誤答 (${Object.keys(W.MISYOMI).length} 句形)`);
{
  const byId = {};
  W.KUHO.forEach((k) => { byId[k.id] = k; });
  Object.keys(W.MISYOMI).forEach((id) => {
    const k = byId[id];
    const w = W.MISYOMI[id];
    if (!k) return err(`MISYOMI: 未知の句形 id ${id}`);
    if (!k.ex || !k.ex[0] || !k.ex[0].y) return err(`MISYOMI ${id}: 対応する例文がない`);
    if (w.length !== 3) err(`MISYOMI ${id}: 誤答が 3 つでない (${w.length})`);
    if (new Set(w).size !== w.length) err(`MISYOMI ${id}: 誤答が重複`);
    if (w.indexOf(k.ex[0].y) !== -1) err(`MISYOMI ${id}: 誤答の中に正解が混じっている`);
    w.forEach((v) => { if (!/[。]$/.test(v)) warn(`MISYOMI ${id}: 誤答が句点で終わっていない「${v}」`); });
  });
  const covered = W.KUHO.filter((k) => W.MISYOMI[k.id]).length;
  console.log(`  書き下し問題を出せる句形: ${covered} / ${W.KUHO.length}`);
}

/* ---------- 道場破りの関門 ---------- */
sec(`関門 (${W.FOES.length} 体)`);
uniq(W.FOES, 'FOES');
{
  const allCats = new Set();
  W.KUHO.forEach((k) => allCats.add(k.cat));
  W.MONDAI.forEach((m) => allCats.add(m.cat));
  allCats.add('漢詩'); allCats.add('故事成語');
  W.FOES.forEach((f) => {
    ['glyph', 'name', 'kana', 'src', 'quote', 'qyomi', 'taunt', 'beaten'].forEach((k) => {
      if (!f[k]) err(`FOES ${f.id}: ${k} が空`);
    });
    if (!(f.ki >= 3 && f.ki <= 8)) err(`FOES ${f.id}: ki が不正 (${f.ki})`);
    if ([...f.glyph].length !== 1) err(`FOES ${f.id}: glyph は一字にする`);
    if (f.cats) {
      f.cats.forEach((c) => { if (!allCats.has(c)) err(`FOES ${f.id}: 存在しない分野「${c}」`); });
    }
    const art = W.FOE_ART && W.FOE_ART[f.id];
    if (!art) err(`FOES ${f.id}: 水墨画（FOE_ART）が無い`);
    else if (!/^<svg[\s\S]+<\/svg>$/.test(art)) err(`FOE_ART ${f.id}: SVG になっていない`);
  });
  Object.keys(W.FOE_ART || {}).forEach((id) => {
    if (!W.FOES.some((f) => f.id === id)) err(`FOE_ART ${id}: 対応する関門が無い`);
  });
}

/* ---------- 講座 ---------- */
sec(`講座 (${W.LESSONS.length} 章)`);
uniq(W.LESSONS, 'LESSONS');
W.LESSONS.forEach((l) => {
  if (!l.title || !l.sub || !l.body) err(`LESSONS ${l.id}: 必須項目が空`);
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const open = (l.body.match(/<(\w+)[^>]*>/g) || [])
    .filter((t) => !VOID.has(t.match(/<(\w+)/)[1].toLowerCase())).length;
  const close = (l.body.match(/<\/(\w+)>/g) || []).length;
  if (open !== close) err(`LESSONS ${l.id}: タグの開閉が一致しない (open ${open} / close ${close})`);
});

/* ---------- 生成された問題プール ---------- */
sec('自動生成された問題プール');
sandbox.Store = W.Store;
W.Store.load();
const POOLS = ['kundoku', 'saidoku', 'kuho', 'kanshi', 'koji', 'kanji', 'mogi'];
for (const id of POOLS) {
  const pool = W.QuizGen.build(id);
  console.log(`  ${id.padEnd(8)} : ${pool.length} 問`);
  if (!pool.length) err(`プール ${id} が空`);
  const keys = new Set();
  pool.forEach((q) => {
    if (keys.has(q.key)) err(`プール ${id}: key 重複 ${q.key}`);
    keys.add(q.key);
    if (q.choices.length !== 4) err(`プール ${id} / ${q.key}: 選択肢が4つでない`);
    if (new Set(q.choices).size !== 4) err(`プール ${id} / ${q.key}: 選択肢が重複`);
    if (q.a < 0 || q.a >= 4) err(`プール ${id} / ${q.key}: 正解 index が不正`);
    if (!q.q) err(`プール ${id} / ${q.key}: 設問文が空`);
    if (!q.exp) warn(`プール ${id} / ${q.key}: 解説がない`);
  });
}

/* ---------- 楚漢の章（物語） ---------- */
{
  const K = W.KOUMON;
  const nodes = new Map(), order = [];
  sec(`楚漢の章 (${K.chapters.length} 章・原文 ${Object.keys(K.genbun).length} 段・結末 ${Object.keys(K.endings).length})`);
  const TYPES = new Set(['scene', 'say', 'gen', 'ask', 'if', 'set', 'game', 'go', 'end']);
  const STAGES = new Set(['bashang', 'koumon', 'tent', 'gate', 'feast', 'road', 'gaixia', 'ukou', 'nangong']);
  const LIGHTS = new Set(['dusk', 'night', 'moon', 'dawn', 'day', 'lamp', 'snow', 'snowin', 'palace']);
  const POSES = new Set(['stand', 'sit', 'kneel', 'raise', 'dance', 'strike', 'drink', 'eat', 'glare', 'charge', 'run', 'down', 'gone']);
  const kuhoIds = new Set(W.KUHO.map((k) => k.id));
  K.chapters.forEach((c) => {
    const arr = K.script[c.id];
    if (!arr || !arr.length) return err(`章 ${c.id} に台本がない`);
    arr.forEach((n, i) => {
      const t = n.t || (n.go && !n.x ? 'go' : 'say');
      const id = n.id || c.id + '-' + i;
      if (nodes.has(id)) err(`楚漢: ノード id 重複 ${id}`);
      nodes.set(id, { n, t, ch: c.id, i, last: i === arr.length - 1, chap: c });
      order.push(id);
      if (!TYPES.has(t)) err(`楚漢 ${id}: 種類 ${t} が不明`);
    });
    if (!nodes.has(c.start)) err(`章 ${c.id}: 開始ノード ${c.start} がない`);
  });
  const ref = (id, from) => { if (id && !nodes.has(id)) err(`楚漢 ${from}: 飛び先 ${id} がない`); };
  const reached = new Set();
  const usedGen = new Set(), usedEnd = new Set();
  for (const [id, x] of nodes) {
    const n = x.n;
    if (x.t === 'say' && !n.x) err(`楚漢 ${id}: 本文が空`);
    if (n.w && !K.chars[n.w]) err(`楚漢 ${id}: 話し手 ${n.w} が人物表にない`);
    if (n.at && n.at !== 'wide' && !K.chars[n.at]) err(`楚漢 ${id}: 寄り先 ${n.at} が人物表にない`);
    if (n.pose) Object.entries(n.pose).forEach(([k, v]) => { if (!POSES.has(v)) err(`楚漢 ${id}: 姿勢 ${k}:${v} が不明`); });
    if (x.t === 'scene') {
      if (!STAGES.has(n.stage)) err(`楚漢 ${id}: 舞台 ${n.stage} が不明`);
      if (!LIGHTS.has(n.light)) err(`楚漢 ${id}: 光 ${n.light} が不明`);
      (n.cast || []).forEach((c) => { if (!K.chars[c]) err(`楚漢 ${id}: 登場人物 ${c} が人物表にない`); });
    }
    if (x.t === 'gen') { if (!K.genbun[n.g]) err(`楚漢 ${id}: 原文 ${n.g} がない`); if (usedGen.has(n.g)) warn(`楚漢 ${id}: 原文 ${n.g} を二度読む`); usedGen.add(n.g); }
    if (x.t === 'end') { if (!K.endings[n.e]) err(`楚漢 ${id}: 結末 ${n.e} がない`); usedEnd.add(n.e); }
    if (x.t === 'game' && !K.games[n.g]) err(`楚漢 ${id}: 遊び ${n.g} がない`);
    if (x.t === 'if') { ref(n.go, id); ref(n.el, id); if (!n.go || !n.el) err(`楚漢 ${id}: 分岐先が片方ない`); }
    if (x.t === 'go') ref(n.go, id);
    ref(n.next, id); ref(n.el, id);
    if (x.t === 'ask') {
      if (!n.q || !Array.isArray(n.o) || n.o.length < 2) err(`楚漢 ${id}: 設問か選択肢が足りない`);
      (n.o || []).forEach((o, j) => { if (!o.x) err(`楚漢 ${id}: 選択肢${j} が空`); ref(o.go, id + '/' + j); });
      if (n.k === 'read') {
        const oks = n.o.filter((o) => o.ok).length;
        if (oks !== 1) err(`楚漢 ${id}: 読解問題の正解が ${oks} 個`);
        if (!n.exp) err(`楚漢 ${id}: 読解問題に解説がない`);
        if (!n.hint) warn(`楚漢 ${id}: 策（ヒント）がない`);
        if (new Set(n.o.map((o) => o.x)).size !== n.o.length) err(`楚漢 ${id}: 選択肢が重複`);
      } else if (n.k !== 'judge') err(`楚漢 ${id}: 種類 k が read/judge でない`);
      if (n.kuho && !kuhoIds.has(n.kuho)) err(`楚漢 ${id}: 句法図鑑 ${n.kuho} がない`);
      if (n.stem) {
        const marks = (n.stem.match(/\^(一レ|上レ|レ|一|二|三|四|上|中|下)/g) || []).map((m) => m.slice(1));
        const cnt = (k) => marks.filter((m) => m === k || m === k + 'レ').length;
        if (cnt('二') && !cnt('一')) err(`楚漢 ${id}: 二点があるのに一点がない`);
        if (cnt('三') && !cnt('二')) err(`楚漢 ${id}: 三点があるのに二点がない`);
      }
    }
  }
  // 到達できるか（はじめから）
  const next = (id) => {
    const x = nodes.get(id), n = x.n, out = [];
    if (x.t === 'end') return out;
    if (x.t === 'go') return [n.go];
    if (x.t === 'if') return [n.go, n.el];
    if (x.t === 'ask') n.o.forEach((o) => out.push(o.go || null));
    if (x.t === 'game' && n.el) out.push(n.el);
    let d = n.next;
    if (!d) { if (!x.last) d = order[order.indexOf(id) + 1]; else if (x.chap.next) d = K.chapters.find((c) => c.id === x.chap.next).start; }
    return out.map((o) => o || d).concat(x.t === 'ask' ? [] : [d]).filter(Boolean);
  };
  const stack = ['c0', 'c8'];
  while (stack.length) { const id = stack.pop(); if (reached.has(id) || !nodes.has(id)) continue; reached.add(id); next(id).forEach((d) => stack.push(d)); }
  for (const id of nodes.keys()) if (!reached.has(id)) err(`楚漢 ${id}: どこからも到達できない`);
  Object.keys(K.endings).forEach((e) => { if (!usedEnd.has(e) && e !== 'B8') err(`楚漢: 結末 ${e} に至る場面がない`); });
  Object.keys(K.genbun).forEach((g) => {
    const G = K.genbun[g];
    if (!usedGen.has(g)) err(`楚漢: 原文 ${g} が物語で読まれない`);
    ['title', 'hakubun', 'yomi', 'yaku', 'note'].forEach((f) => { if (!G[f]) err(`楚漢 原文 ${g}: ${f} が空`); });
    if (/[^㐀-鿿、。「」『』／・]/.test(G.hakubun)) err(`楚漢 原文 ${g}: 白文に漢字・句読点以外の文字`);
    if (/以て/.test(G.yomi)) err(`楚漢 原文 ${g}: 教科書の表記「以つて」に合わせる`);
  });
  // 座次の答えは史記の本文（東嚮・南嚮・北嚮・西嚮）と一致させる
  const seat = K.games.seat.seats;
  const want = { W: ['u', 'haku'], N: ['zo'], S: ['hai'], E: ['ryo'] };
  seat.forEach((s) => { if (JSON.stringify(s.ans) !== JSON.stringify(want[s.id])) err(`楚漢 座次 ${s.id}: 史記と違う`); });
  if (!/項王/.test(K.aiPrompt) || !/五回/.test(K.aiPrompt)) err('楚漢: AI 指示文の要件（項王・五回まで）がない');
  const doc = path.join(root, 'docs/hanzo-roleplay.md');
  if (fs.existsSync(doc) && fs.readFileSync(doc, 'utf8').indexOf(K.aiPrompt.split('\n')[0]) === -1) err('楚漢: docs/hanzo-roleplay.md の指示文がアプリと食い違う');
  console.log(`  ノード ${nodes.size}・読解問題 ${[...nodes.values()].filter((x) => x.t === 'ask' && x.n.k === 'read').length} 問`);
}

/* ---------- 全角記号などの混入チェック ---------- */
sec('文字種チェック');
const files = [...DATA.map((f) => 'src/data/' + f + '.js'), ...CODE.map((f) => 'src/js/' + f + '.js'), 'src/js/app.js', 'src/js/koumon.js', 'src/js/koumon-3d.js', 'src/js/koumon-stage.js'];
const suspicious = /[가-힯Ѐ-ӿ]/;   // ハングル・キリル
files.forEach((rel) => {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  txt.split('\n').forEach((line, i) => {
    const m = line.match(suspicious);
    if (m) err(`${rel}:${i + 1} に想定外の文字「${m[0]}」`);
  });
});

console.log(`\n${errors === 0 ? '✔ すべてのチェックを通過' : '✗ エラー ' + errors + ' 件'}　（警告 ${warns} 件）`);
process.exit(errors ? 1 : 0);
