/* データから 4 択問題を組み立てる */
(function () {
  'use strict';

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 二つの文字列が「実質同じ答え」になっていないか（文字集合の Jaccard 係数） */
  function tooSimilar(a, b) {
    if (a === b) return true;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;
    var sa = {}, sb = {}, i;
    for (i = 0; i < a.length; i++) sa[a.charAt(i)] = 1;
    for (i = 0; i < b.length; i++) sb[b.charAt(i)] = 1;
    var inter = 0, uni = 0, k;
    for (k in sa) { uni++; if (sb[k]) inter++; }
    for (k in sb) if (!sa[k]) uni++;
    return uni ? inter / uni >= 0.8 : false;
  }

  /** correct を含む 4 択を作る。誤答が正解と紛らわしすぎる場合はその問題を捨てる */
  function makeChoices(correct, pool, n) {
    n = n || 4;
    var seen = {}; seen[correct] = 1;
    var wrong = [];
    var cand = shuffle(pool);
    for (var i = 0; i < cand.length && wrong.length < n - 1; i++) {
      var c = cand[i];
      if (!c || seen[c]) continue;
      if (tooSimilar(c, correct)) continue;
      var dup = false;
      for (var j = 0; j < wrong.length; j++) if (tooSimilar(c, wrong[j])) dup = true;
      if (dup) continue;
      seen[c] = 1; wrong.push(c);
    }
    if (wrong.length < n - 1) return null;      // 誤答が足りない問題は捨てる
    var all = shuffle([correct].concat(wrong));
    return { choices: all, a: all.indexOf(correct) };
  }

  function fieldPool(list, field, exclude) {
    var out = [];
    list.forEach(function (x) {
      var v = typeof field === 'function' ? field(x) : x[field];
      if (v && v !== exclude) out.push(v);
    });
    return out;
  }

  /* ---------------- 句法（読み・意味） ---------------- */
  function kuhoQuestions(cats) {
    var src = window.KUHO.filter(function (k) { return !cats || cats.indexOf(k.cat) !== -1; });
    var all = window.KUHO;
    var out = [];
    src.forEach(function (k) {
      var sameCat = all.filter(function (x) { return x.cat === k.cat && x.id !== k.id; });
      var basis = sameCat.length >= 3 ? sameCat : all.filter(function (x) { return x.id !== k.id; });

      var c1 = makeChoices(k.read, fieldPool(basis, 'read', k.read));
      if (c1) out.push({
        key: k.id + ':read', cat: k.cat, level: k.level,
        stem: k.form, q: 'この句形の読みとして正しいものはどれか。',
        choices: c1.choices, a: c1.a, exp: k.note || (k.form + '＝' + k.read + '＝' + k.mean)
      });

      var c2 = makeChoices(k.mean, fieldPool(basis, 'mean', k.mean));
      if (c2) out.push({
        key: k.id + ':mean', cat: k.cat, level: k.level,
        stem: k.form, q: '「' + k.read + '」と読むこの句形の意味として最も適当なものはどれか。',
        choices: c2.choices, a: c2.a, exp: k.note || (k.form + '＝' + k.mean)
      });

      if (k.ex && k.ex.length && k.ex[0].y) {
        var exY = k.ex[0].y;
        var others = [];
        all.forEach(function (x) {
          if (x.id !== k.id && x.ex && x.ex.length && x.ex[0].y) others.push(x.ex[0].y);
        });
        var c3 = makeChoices(exY, others);
        if (c3) out.push({
          key: k.id + ':ex', cat: k.cat, level: Math.min(3, k.level + 1),
          stem: k.ex[0].k, q: '書き下し文として正しいものはどれか。',
          src: k.ex[0].s, choices: c3.choices, a: c3.a,
          exp: '【' + k.form + '】' + k.read + '＝' + k.mean + (k.ex[0].t ? '　訳：' + k.ex[0].t : '')
        });
      }
    });
    return out;
  }

  /* ---------------- 頻出漢字の読み ---------------- */
  function kanjiQuestions() {
    var all = window.KANJI;
    var out = [];
    all.forEach(function (k) {
      var ans = k.yomi[0];
      if (ans === '—') return;
      var same = all.filter(function (x) { return x.grp === k.grp && x.c !== k.c; });
      var basis = same.length >= 4 ? same : all.filter(function (x) { return x.c !== k.c; });
      var pool = [];
      basis.forEach(function (x) { x.yomi.forEach(function (y) { if (y !== '—') pool.push(y); }); });
      var c = makeChoices(ans, pool);
      if (!c) return;
      out.push({
        key: 'kj:' + k.c, cat: k.grp, level: 1,
        stem: k.c, q: 'この漢字の代表的な読みはどれか。',
        choices: c.choices, a: c.a,
        exp: '「' + k.c + '」＝' + k.yomi.join('／') + '　' + k.mean + (k.note ? '　' + k.note : '')
      });
    });
    return out;
  }

  /* ---------------- 故事成語 ---------------- */
  function kojiQuestions() {
    var all = window.KOJI;
    var out = [];
    all.forEach(function (k) {
      var c1 = makeChoices(k.mean, fieldPool(all.filter(function (x) { return x.id !== k.id; }), 'mean'));
      if (c1) out.push({
        key: k.id + ':mean', cat: '故事成語', level: 1,
        stem: k.word, q: 'この故事成語の意味として最も適当なものはどれか。',
        choices: c1.choices, a: c1.a, exp: '【出典】' + k.src + '　' + k.story
      });
      var c2 = makeChoices(k.src, fieldPool(all.filter(function (x) { return x.id !== k.id; }), 'src'));
      if (c2) out.push({
        key: k.id + ':src', cat: '故事成語', level: 2,
        stem: k.word, q: 'この故事成語の出典はどれか。',
        choices: c2.choices, a: c2.a, exp: '【' + k.word + '】' + k.mean + '　' + k.story
      });
    });
    return out;
  }

  /* ---------------- 漢詩 ---------------- */
  function kanshiQuestions() {
    var all = window.KANSHI;
    var forms = ['五言絶句', '七言絶句', '五言律詩', '七言律詩'];
    var out = [];
    all.forEach(function (p) {
      var body = p.lines.join('／');

      var cf = makeChoices(p.form, forms.filter(function (f) { return f !== p.form; }));
      if (cf) out.push({
        key: p.id + ':form', cat: '漢詩', level: 1,
        stem: body, q: 'この詩の形式として正しいものはどれか。',
        src: p.author + '「' + p.title + '」',
        choices: cf.choices, a: cf.a,
        exp: '一句' + (p.form.indexOf('五') === 0 ? '五' : '七') + '字×' + p.lines.length + '句なので' + p.form + '。' + p.note
      });

      var ca = makeChoices(p.author, fieldPool(all.filter(function (x) { return x.author !== p.author; }), 'author'));
      if (ca) out.push({
        key: p.id + ':author', cat: '漢詩', level: 2,
        stem: '「' + p.title + '」', q: 'この漢詩の作者は誰か。',
        choices: ca.choices, a: ca.a, exp: p.author + '「' + p.title + '」（' + p.era + '）　' + p.trans
      });

      if (p.regular) {
        var ans = p.rhyme.join('・');
        var wrongs = [];
        all.forEach(function (x) { if (x.id !== p.id) wrongs.push(x.rhyme.join('・')); });
        // 同じ詩の中の非押韻字からもダミーを作る
        var nonRhyme = [];
        p.lines.forEach(function (ln, i) {
          if (p.rhymeLines.indexOf(i + 1) === -1) nonRhyme.push(ln.charAt(ln.length - 1));
        });
        if (nonRhyme.length >= p.rhyme.length) wrongs.push(nonRhyme.slice(0, p.rhyme.length).join('・'));
        var cr = makeChoices(ans, wrongs);
        if (cr) out.push({
          key: p.id + ':rhyme', cat: '漢詩', level: 2,
          stem: body, q: 'この詩で押韻している字の組み合わせはどれか。',
          src: p.author + '「' + p.title + '」',
          choices: cr.choices, a: cr.a,
          exp: (p.form.indexOf('五') === 0 ? '五言詩は偶数句末で押韻するのが原則。' : '七言詩は第一句末と偶数句末で押韻するのが原則。') + '押韻は「' + ans + '」。'
        });
      }

      if (p.tsuiku && p.tsuiku.length) {
        var pair = p.tsuiku[0];
        var ansT = '第' + pair[0] + '句と第' + pair[1] + '句';
        var wr = [];
        for (var i = 1; i < p.lines.length; i++) {
          var lbl = '第' + i + '句と第' + (i + 1) + '句';
          if (lbl !== ansT) wr.push(lbl);
        }
        var ct = makeChoices(ansT, wr);
        if (ct) out.push({
          key: p.id + ':tsuiku', cat: '漢詩', level: 3,
          stem: body, q: 'この詩で対句になっているのはどこか。',
          src: p.author + '「' + p.title + '」',
          choices: ct.choices, a: ct.a, exp: p.note
        });
      }
    });
    return out;
  }

  /* ---------------- 手作り問題 ---------------- */
  function mondaiQuestions(cats) {
    return window.MONDAI
      .filter(function (m) { return !cats || cats.indexOf(m.cat) !== -1; })
      .map(function (m) {
        return {
          key: m.id, cat: m.cat, level: m.level, stem: m.stem || '',
          q: m.q, choices: m.choices.slice(), a: m.a, exp: m.exp, fixed: true
        };
      });
  }

  /** 固定選択肢の問題もシャッフルして出す */
  function randomizeChoices(q) {
    var correct = q.choices[q.a];
    var order = shuffle(q.choices);
    return Object.assign({}, q, { choices: order, a: order.indexOf(correct) });
  }

  /* ---------------- プール定義 ---------------- */
  var POOLS = {
    kuho: function () {
      return kuhoQuestions(['否定', '禁止', '二重否定', '部分否定', '疑問', '反語', '使役', '受身',
        '比較', '選択', '仮定', '限定', '累加', '抑揚', '詠嘆', '願望', '重要語'])
        .concat(mondaiQuestions(['否定', '疑問反語', '使役', '受身', '比較', '選択', '仮定',
          '限定', '累加', '抑揚', '詠嘆', '願望', '重要語', '識別']));
    },
    saidoku: function () {
      return kuhoQuestions(['再読文字']).concat(mondaiQuestions(['再読文字']));
    },
    kanji: function () { return kanjiQuestions(); },
    koji: function () { return kojiQuestions(); },
    kanshi: function () { return kanshiQuestions().concat(mondaiQuestions(['漢詩'])); },
    kundoku: function () { return mondaiQuestions(['訓読', '識別']); },
    mogi: function () {
      return [].concat(
        mondaiQuestions(),
        kuhoQuestions(),
        kanjiQuestions(),
        kojiQuestions(),
        kanshiQuestions()
      );
    }
  };

  function build(id) {
    var f = POOLS[id] || POOLS.mogi;
    return f().map(function (q) { return q.fixed ? randomizeChoices(q) : q; });
  }

  /** 苦手優先でくじ引き（重み付きサンプリング・重複なし） */
  function pick(pool, n) {
    var items = pool.slice();
    var out = [];
    n = Math.min(n, items.length);
    while (out.length < n && items.length) {
      var weights = items.map(function (q) { return Math.max(0.05, window.Store.weakness(q.key)); });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = Math.random() * total, acc = 0, idx = 0;
      for (var i = 0; i < items.length; i++) {
        acc += weights[i];
        if (r <= acc) { idx = i; break; }
      }
      out.push(items.splice(idx, 1)[0]);
    }
    return out;
  }

  /** 弱点だけを集める */
  function weakPool() {
    var keys = {};
    window.Store.weakKeys().forEach(function (k) { keys[k] = 1; });
    var all = build('mogi');
    return all.filter(function (q) { return keys[q.key]; });
  }

  window.QuizGen = { build: build, pick: pick, weakPool: weakPool, shuffle: shuffle, makeChoices: makeChoices };
})();
