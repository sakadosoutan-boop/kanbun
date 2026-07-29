/* データ整合性チェック  実行: node tools/validate.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['kuho', 'mondai', 'kaeriten', 'okiji', 'narabekae', 'kanshi', 'koji', 'kanji', 'lessons'];
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

/* ---------- 全角記号などの混入チェック ---------- */
sec('文字種チェック');
const files = [...DATA.map((f) => 'src/data/' + f + '.js'), ...CODE.map((f) => 'src/js/' + f + '.js'), 'src/js/app.js'];
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
