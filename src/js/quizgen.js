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

  /** correct を含む 4 択を作る。誤答が正解と紛らわしすぎる場合はその問題を捨てる。
   *  allowSimilar を立てると類似判定を外す（文末だけを変えた「一字違い」の誤答を使うとき）。 */
  function makeChoices(correct, pool, n, allowSimilar) {
    n = n || 4;
    var seen = {}; seen[correct] = 1;
    var wrong = [];
    var cand = shuffle(pool);
    for (var i = 0; i < cand.length && wrong.length < n - 1; i++) {
      var c = cand[i];
      if (!c || seen[c]) continue;
      if (!allowSimilar && tooSimilar(c, correct)) continue;
      var dup = false;
      if (!allowSimilar) {
        for (var j = 0; j < wrong.length; j++) if (tooSimilar(c, wrong[j])) dup = true;
      }
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

      // 読み問題では漢字だけを提示する。訓点つきの form には送り仮名が入っていて答えが読めてしまう。
      var c1 = makeChoices(k.read, fieldPool(basis, 'read', k.read));
      if (c1) out.push({
        key: k.id + ':read', cat: k.cat, level: k.level,
        stem: k.bare, q: 'この句形の読みとして正しいものはどれか。',
        choices: c1.choices, a: c1.a,
        exp: '【' + k.form + '】' + k.read + '＝' + k.mean + (k.note ? '　' + k.note : '')
      });

      var c2 = makeChoices(k.mean, fieldPool(basis, 'mean', k.mean));
      if (c2) out.push({
        key: k.id + ':mean', cat: k.cat, level: k.level,
        stem: k.bare, q: '「' + k.read + '」と読むこの句形の意味として最も適当なものはどれか。',
        choices: c2.choices, a: c2.a, exp: k.note || (k.form + '＝' + k.mean)
      });

      // 書き下し問題は、手書きの誤答（MISYOMI）を用意した句形だけ出題する。
      // 自動生成した誤答は活用が崩れて明らかな誤りになり、消去法で解けてしまうため。
      var mis = (window.MISYOMI || {})[k.id];
      if (k.ex && k.ex.length && k.ex[0].y && mis && mis.length >= 3) {
        var exY = k.ex[0].y;
        // 他の文の正解と一致していてもよい（この文の読みとしては誤りだから）
        var ok = mis.filter(function (w) { return w !== exY; });
        var c3 = ok.length >= 3 ? makeChoices(exY, ok, 4, true) : null;
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

  /* ---------------- 再読文字（専用の設問） ----------------
     読みが同じ組（将／且、当／応、猶／由）があるので、
     逆引き（読み・意味 → 漢字）は答えが一つに定まるものだけを出題する。 */
  function saidokuQuestions() {
    var set = window.KUHO.filter(function (k) { return k.cat === '再読文字'; });
    var out = [];
    var chars = set.map(function (k) { return k.bare; });
    var seconds = [];
    var katsuAll = ['未然形', '終止形', '連体形', '已然形'];
    set.forEach(function (k) { if (seconds.indexOf(k.second) === -1) seconds.push(k.second); });

    function uniqueBy(k, field) {
      return set.filter(function (x) { return x[field] === k[field]; }).length === 1;
    }

    set.forEach(function (k) {
      // 二度目の読み
      var c1 = makeChoices(k.second, seconds.filter(function (v) { return v !== k.second; }));
      if (c1) out.push({
        key: k.id + ':second', cat: '再読文字', level: 2,
        stem: k.bare, q: 'この再読文字の【二度目】の読みはどれか。',
        choices: c1.choices, a: c1.a,
        exp: '「' + k.bare + '」は' + k.read + '。二度目の「' + k.second + '」はひらがなで書き下す。'
      });

      // 二度目の読みが接続する活用形
      var c2 = makeChoices(k.katsu, katsuAll.filter(function (v) { return v !== k.katsu; }));
      if (c2) out.push({
        key: k.id + ':katsu', cat: '再読文字', level: 3,
        stem: k.bare, q: 'この再読文字は、下の語をどの活用形で受けるか。',
        choices: c2.choices, a: c2.a,
        exp: '「' + k.bare + '」は' + k.read + '。「' + k.second + '」は' + k.katsu + '接続。'
      });

      // 読み → 漢字（読みが一意なものだけ）
      if (uniqueBy(k, 'read')) {
        var c3 = makeChoices(k.bare, chars.filter(function (v) { return v !== k.bare; }));
        if (c3) out.push({
          key: k.id + ':rev-read', cat: '再読文字', level: 2,
          stem: '', q: '「' + k.read + '」と読む再読文字はどれか。',
          choices: c3.choices, a: c3.a,
          exp: '「' + k.bare + '」＝' + k.read + '＝' + k.mean
        });
      }

      // 意味 → 漢字（意味が一意なものだけ。将／且、当／応、猶／由 は除かれる）
      if (uniqueBy(k, 'mean') && !set.some(function (x) {
        return x.id !== k.id && (x.mean.indexOf(k.mean) !== -1 || k.mean.indexOf(x.mean) !== -1);
      })) {
        var c4 = makeChoices(k.bare, chars.filter(function (v) { return v !== k.bare; }));
        if (c4) out.push({
          key: k.id + ':rev-mean', cat: '再読文字', level: 3,
          stem: '', q: '「' + k.mean + '」の意味を表す再読文字はどれか。',
          choices: c4.choices, a: c4.a,
          exp: '「' + k.bare + '」＝' + k.read + '＝' + k.mean
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
      // 意味から語を選ぶ（逆引き）。出典を問う設問は入試での比重が低いので置かない。
      var c2 = makeChoices(k.word, fieldPool(all.filter(function (x) { return x.id !== k.id; }), 'word'));
      if (c2) out.push({
        key: k.id + ':rev', cat: '故事成語', level: 2,
        stem: '', q: '「' + k.mean + '」という意味の故事成語はどれか。',
        choices: c2.choices, a: c2.a, exp: '【' + k.word + '（' + k.yomi + '）】出典は' + k.src + '。' + k.story
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

      // 作者を問う設問は置かず、押韻の原則を詩ごとに確認させる
      if (p.regular) {
        var five = p.form.indexOf('五') === 0;
        var ansR = five ? '偶数句末' : '第一句末と偶数句末';
        var cw = makeChoices(ansR, ['偶数句末', '奇数句末', '第一句末と偶数句末', 'すべての句末']
          .filter(function (v) { return v !== ansR; }));
        if (cw) out.push({
          key: p.id + ':rule', cat: '漢詩', level: 1,
          stem: body, q: 'この形式の詩は、原則としてどこで押韻するか。',
          src: p.author + '「' + p.title + '」（' + p.form + '）',
          choices: cw.choices, a: cw.a,
          exp: '五言詩は偶数句末、七言詩は第一句末と偶数句末で押韻するのが原則。この詩の押韻は「' + p.rhyme.join('・') + '」。'
        });
      }

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
      return kuhoQuestions(['再読文字'])
        .concat(saidokuQuestions())
        .concat(mondaiQuestions(['再読文字']));
    },
    kanji: function () { return kanjiQuestions(); },
    koji: function () { return kojiQuestions(); },
    kanshi: function () { return kanshiQuestions().concat(mondaiQuestions(['漢詩'])); },
    kundoku: function () { return mondaiQuestions(['訓読', '識別']); },
    mogi: function () {
      return [].concat(
        mondaiQuestions(),
        kuhoQuestions(),
        saidokuQuestions(),
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

  /* ---------------- 学習量の集計に使う「問題の全体像」 ----------------
     build() は誤答の選び方に乱数が入るため、実行のたびに数個ぶれる。
     分野ごとの母数を安定させたいので、データから決定的に列挙する。 */
  function universe() {
    var out = [];
    var add = function (key, cat) { out.push({ key: key, cat: cat }); };

    window.KUHO.forEach(function (k) {
      add(k.id + ':read', k.cat);
      add(k.id + ':mean', k.cat);
      var mis = (window.MISYOMI || {})[k.id];
      if (k.ex && k.ex.length && k.ex[0].y && mis && mis.length >= 3) add(k.id + ':ex', k.cat);
      if (k.cat === '再読文字') {
        add(k.id + ':second', k.cat);
        add(k.id + ':katsu', k.cat);
        var sd = window.KUHO.filter(function (x) { return x.cat === '再読文字'; });
        if (sd.filter(function (x) { return x.read === k.read; }).length === 1) add(k.id + ':rev-read', k.cat);
        var uniqMean = sd.filter(function (x) { return x.mean === k.mean; }).length === 1 &&
          !sd.some(function (x) {
            return x.id !== k.id && (x.mean.indexOf(k.mean) !== -1 || k.mean.indexOf(x.mean) !== -1);
          });
        if (uniqMean) add(k.id + ':rev-mean', k.cat);
      }
    });
    window.MONDAI.forEach(function (m) { add(m.id, m.cat); });
    window.KANJI.forEach(function (k) { if (k.yomi[0] !== '—') add('kj:' + k.c, '頻出漢字'); });
    window.KOJI.forEach(function (k) { add(k.id + ':mean', '故事成語'); add(k.id + ':rev', '故事成語'); });
    window.KANSHI.forEach(function (p) {
      add(p.id + ':form', '漢詩');
      if (p.regular) { add(p.id + ':rhyme', '漢詩'); add(p.id + ':rule', '漢詩'); }
      if (p.tsuiku && p.tsuiku.length) add(p.id + ':tsuiku', '漢詩');
    });
    (window.KAERITEN || []).forEach(function (k) { add('kt:' + k.id, '返り点'); });
    (window.OKIJI || []).forEach(function (o) { add('ok:' + o.id, '置き字'); });
    (window.NARABEKAE || []).forEach(function (n) { add('nb:' + n.id, '書き下し'); });
    return out;
  }

  window.QuizGen = {
    build: build, pick: pick, weakPool: weakPool,
    shuffle: shuffle, makeChoices: makeChoices, universe: universe
  };
})();
