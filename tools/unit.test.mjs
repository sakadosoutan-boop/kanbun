import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function boot(initial) {
  let now = new Date(2026, 8, 16, 12).getTime();
  const storage = new Map(initial ? [['kanbun-dojo:v1', JSON.stringify(initial)]] : []);
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { window: {}, Date: Clock, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) } };
  vm.createContext(ctx);
  for (const f of ['kuho','mondai','misyomi','kaeriten','okiji','narabekae','kanshi','koji','kanji','lessons','foes','foe-art','journey'])
    vm.runInContext(fs.readFileSync(path.join(root, 'src/data', f + '.js'), 'utf8'), ctx);
  for (const f of ['store','quizgen','learning']) vm.runInContext(fs.readFileSync(path.join(root, 'src/js', f + '.js'), 'utf8'), ctx);
  const w = ctx.window; w.Store.load();
  return { w, storage, day: n => { now += n * 86400000; } };
}
test('generated choices never mark another registered reading or couplet wrong', () => {
  const {w} = boot();
  for(let i=0;i<100;i++) {
    for (const q of w.QuizGen.build('kanji')) {
      const k = w.KANJI.find(k => q.key === 'kj:' + k.c);
      q.choices.forEach((c,j) => { if(j!==q.a) assert.ok(!k.yomi.includes(c), q.key+': '+c); });
    }
    for (const q of w.QuizGen.build('kanshi').filter(q => q.key.endsWith(':tsuiku'))) {
      const p=w.KANSHI.find(p=>q.key===p.id+':tsuiku');
      const valid=p.tsuiku.map(t=>'第'+t[0]+'句と第'+t[1]+'句');
      q.choices.forEach((c,j)=>assert.equal(valid.includes(c),j===q.a, q.key+': '+c));
    }
  }
});
test('catalog denominator exactly matches playable questions, including all puzzles', () => {
  const {w}=boot();
  const expected = [...w.QuizGen.build('mogi').map(q=>q.key), ...w.KAERITEN.map(x=>'kt:'+x.id), ...w.OKIJI.map(x=>'ok:'+x.id), ...w.NARABEKAE.map(x=>'nb:'+x.id)].sort();
  for(let i=0;i<10;i++) assert.deepEqual([...w.QuizGen.universe().map(q=>q.key)].sort(), expected);
  const keys = new Set(expected);
  for(const name of ['kuho','saidoku','kanji','kanshi','koji','kundoku']) for(const q of w.QuizGen.build(name)) assert.ok(keys.has(q.key));
  for(const p of w.KANSHI) if(p.regular) assert.ok(keys.has(p.id+':rule'));
});
test('weak and scheduled reviews include all native puzzle formats', () => {
  const {w}=boot();
  for(const key of ['kt:kt01','ok:ok01','nb:nb01','kj:斯']) w.Store.record(key,false,2);
  assert.deepEqual([...w.QuizGen.reviewItems(false).map(q=>q.kind)].sort(),['choice','kaeriten','narabe','okiji']);
  assert.equal(w.QuizGen.reviewItems(true).length,4);
  w.Store.record('kt:kt01',true,2);
  assert.equal(w.QuizGen.reviewItems(false).length,3);
});
test('answers save immediately, visits do not create a streak, and old clears survive', () => {
  const {w,storage}=boot({foesCleared:['f1','f2','f3','f4','f5','f6','f7','f8'],ach:['a10'],xp:8500});
  assert.equal(w.Store.state.streak,0);
  w.Store.record('kt:kt01',true,2);
  assert.equal(JSON.parse(storage.get('kanbun-dojo:v1')).answered,1);
  w.Store.load();
  assert.equal(w.Store.state.streak,1);
  assert.equal(w.Store.state.foesCleared.length,8);
  assert.ok(w.Store.state.ach.includes('a10'));
  assert.ok(!w.Store.state.ach.includes('a14'));
  w.Store.reset(); w.Store.load();
  assert.equal(Object.keys(w.Store.state.srs).length,0);
  assert.equal(w.Store.state.xp,0);
});
test('mastery requires spaced recall; rapid repeats cannot inflate it', () => {
  const {w,day}=boot();
  for(let i=0;i<10;i++) w.Store.record('kt:kt01',true,2);
  assert.equal(w.Store.isMastered('kt:kt01'),false);
  day(1); w.Store.record('kt:kt01',true,2);
  assert.equal(w.Store.isMastered('kt:kt01'),false);
  day(3); assert.ok(w.Store.dueKeys().includes('kt:kt01'));
  w.Store.record('kt:kt01',true,2);
  assert.equal(w.Store.isMastered('kt:kt01'),true);
  w.Store.record('kt:kt01',false,2);
  assert.equal(w.Store.isMastered('kt:kt01'),false);
  day(3); assert.equal(w.Store.currentStreak(),0);
});
test('exam has exactly 20 unique questions with fixed field and difficulty allocation', () => {
  const {w}=boot();
  for(let i=0;i<20;i++) {
    const qs=w.QuizGen.exam();
    assert.equal(qs.length,20); assert.equal(new Set(qs.map(q=>q.key)).size,20);
    for(const f of w.QuizGen.EXAM) assert.deepEqual([...qs.filter(q=>q.examField===f.name).map(q=>q.level)].sort(),[...f.levels].sort());
  }
});
test('kaeriten anchor is the kanji, never the okurigana', () => {
  const {w}=boot();
  const tokens=w.Learning.tokens('学ビテ時ニ習フ^レ之ヲ');
  const marked=tokens.find(t=>t.mark);
  assert.equal(marked.c,'習'); assert.equal(marked.okuri,'フ'); assert.equal(marked.mark,'レ');
  assert.equal(w.KUNDOKU_EXAMPLES.ls01.find(t=>t.mark).c,'習');
});
test('all eight new gates have art, three contextual questions and valid explanations', () => {
  const {w}=boot();
  assert.equal(w.FOES.length,16);
  for(const f of w.FOES.slice(8)) {
    assert.equal(f.chapter,2); assert.ok(w.FOE_ART[f.id].startsWith('<svg'));
    const qs=w.QuizGen.build('mogi').filter(q=>q.stage===f.id);
    assert.equal(qs.length,3);
    for(const q of qs) { assert.equal(q.reasons[q.a],''); q.reasons.forEach((r,i)=>{if(i!==q.a)assert.ok(r.length>5);}); }
  }
});
