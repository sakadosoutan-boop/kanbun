/* 漢文道場 — アプリ本体（ルーティング・画面・ゲームエンジン） */
(function () {
  'use strict';

  var $app, $toast;

  /* ============================ ユーティリティ ============================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function render(html) {
    $app.innerHTML = html;
    $app.classList.remove('fade');
    void $app.offsetWidth;
    $app.classList.add('fade');
    window.scrollTo({ top: 0, behavior: 'instant' in document.body.style ? 'instant' : 'auto' });
  }
  var toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('on'); }, 2200);
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function mmss(sec) { return pad(Math.floor(sec / 60)) + ':' + pad(Math.floor(sec % 60)); }

  /** 訓読文の返り点を上付きで表示する。データ側では「^レ」「^二」のように ^ を前置する。
   *  自動判別にしないのは、「一見」「二月」のように返り点と同じ字が本文に現れるため。 */
  function kanbunHTML(s) {
    return esc(s).replace(/\^(一レ|上レ|甲レ|レ|一|二|三|四|上|中|下|甲|乙|丙)/g, function (m, p1) {
      return '<i class="mark">' + p1 + '</i>';
    });
  }

  /* ============================ モード定義 ============================ */
  var MODES = [
    { id: 'kundoku', ico: '訓', t: '訓読の基本', d: '返り点・置き字・書き下しのきまりを固める', kind: 'choice', pool: 'kundoku', n: 10, accent: 'var(--ai)', tag: '基礎' },
    { id: 'saidoku', ico: '再', t: '再読文字ドリル', d: '十字を読みと意味ごと完全に定着させる', kind: 'choice', pool: 'saidoku', n: 12, accent: 'var(--midori)', tag: '基礎' },
    { id: 'kuho', ico: '句', t: '句法バトル', d: '制限時間つき。三回まちがえると道場破り', kind: 'choice', pool: 'kuho', n: 15, accent: 'var(--shu)', hearts: 3, perQ: 25, tag: '本命' },
    { id: 'kaeriten', ico: '点', t: '返り点ルート', d: '返り点に従って読む順にタップする', kind: 'kaeriten', accent: 'var(--murasaki)', tag: 'パズル' },
    { id: 'okiji', ico: '置', t: '置き字ハンター', d: '文中にひそむ「読まない字」を見つけ出す', kind: 'okiji', accent: 'var(--murasaki)', tag: 'パズル' },
    { id: 'narabe', ico: '序', t: '書き下し組立', d: '語のかたまりを並べて書き下し文を作る', kind: 'narabe', accent: 'var(--murasaki)', tag: 'パズル' },
    { id: 'kanshi', ico: '詩', t: '漢詩の間', d: '形式・押韻・対句・作者を見抜く', kind: 'choice', pool: 'kanshi', n: 12, accent: 'var(--ai)', tag: '知識' },
    { id: 'koji', ico: '故', t: '故事成語', d: '意味と出典をセットで覚える', kind: 'choice', pool: 'koji', n: 12, accent: 'var(--kin)', tag: '知識' },
    { id: 'kanji', ico: '字', t: '頻出漢字の読み', d: '一問十秒。読みを瞬時に引き出す', kind: 'choice', pool: 'kanji', n: 15, accent: 'var(--kin)', perQ: 12, tag: '速答' },
    { id: 'weak', ico: '弱', t: '弱点復習', d: 'まちがえた問題だけを狙って出し直す', kind: 'choice', pool: 'weak', n: 12, accent: 'var(--shu)', tag: '復習' },
    { id: 'mogi', ico: '試', t: '実力テスト', d: '全範囲から20問。百点満点で判定', kind: 'choice', pool: 'mogi', n: 20, accent: 'var(--ink)', total: 600, tag: '総合' }
  ];
  function modeById(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return null;
  }

  /* ============================ ホーム ============================ */
  function screenHome() {
    var s = window.Store.state;
    var r = window.Store.rankOf(s.xp);
    var acc = s.answered ? Math.round(s.correct / s.answered * 100) : 0;
    var weakN = window.Store.weakKeys().length;

    var cards = MODES.map(function (m) {
      var best = s.best[m.id];
      var sub = m.id === 'weak'
        ? (weakN ? '苦手 ' + weakN + ' 問が待機中' : 'まだ弱点は記録されていません')
        : (best !== undefined ? '自己ベスト ' + best + (m.id === 'mogi' ? ' 点' : '') : '未挑戦');
      return '<button class="mode" data-act="play" data-id="' + m.id + '" style="--accent:' + m.accent + '">' +
        '<span class="m-tag">' + esc(m.tag) + '</span>' +
        '<div class="m-ico">' + m.ico + '</div>' +
        '<div class="m-t">' + esc(m.t) + '</div>' +
        '<div class="m-d">' + esc(m.d) + '</div>' +
        '<div class="m-prog">' + esc(sub) + '</div>' +
        '</button>';
    }).join('');

    render(
      '<section class="hero">' +
        '<h1>漢文道場</h1>' +
        '<p>句法と訓読を、ゲーム感覚で最短距離から。高校生のための漢文トレーニング。</p>' +
        '<div class="rankbar">' +
          '<div class="rank-badge">' + esc(r.cur.kanji) + '</div>' +
          '<div class="rank-meta">' +
            '<div class="r-top"><b>' + esc(r.cur.name) + '</b>' +
              '<span class="r-xp">' + s.xp + ' 修錬値' + (r.next ? '　／　次の段位まで ' + (r.next.xp - s.xp) : '　最高位') + '</span></div>' +
            '<div class="bar"><i style="width:' + r.pct + '%"></i></div>' +
          '</div>' +
        '</div>' +
        '<div class="stats">' +
          '<div class="stat"><b>' + s.answered + '</b><span>のべ解答数</span></div>' +
          '<div class="stat"><b>' + acc + '%</b><span>正答率</span></div>' +
          '<div class="stat"><b>' + s.streak + '</b><span>連続学習日</span></div>' +
        '</div>' +
      '</section>' +
      '<div class="sec-h"><h2>けいこ</h2><div class="rule"></div></div>' +
      '<div class="modes">' + cards + '</div>' +
      '<div class="sec-h"><h2>まなび</h2><div class="rule"></div></div>' +
      '<div class="modes">' +
        '<button class="mode" data-act="go" data-to="lessons" style="--accent:var(--ai)"><div class="m-ico">講</div><div class="m-t">基礎講座</div><div class="m-d">訓読・句法・漢詩のルールを読んで理解する</div></button>' +
        '<button class="mode" data-act="go" data-to="zukan" style="--accent:var(--midori)"><div class="m-ico">図</div><div class="m-t">句法図鑑</div><div class="m-d">' + window.KUHO.length + 'の句形を検索・分類して確認</div></button>' +
        '<button class="mode" data-act="go" data-to="shishu" style="--accent:var(--murasaki)"><div class="m-ico">詩</div><div class="m-t">漢詩集</div><div class="m-d">' + window.KANSHI.length + '首の名詩を書き下し・訳つきで</div></button>' +
        '<button class="mode" data-act="go" data-to="ach" style="--accent:var(--kin)"><div class="m-ico">賞</div><div class="m-t">実績</div><div class="m-d">称号を集めて学習の記録を残す</div></button>' +
      '</div>' +
      '<div class="footer">出典表記のある例文はすべて古典からの引用です。学習用に書き下し文・現代語訳を付しています。</div>'
    );
  }

  /* ============================ 句法図鑑 ============================ */
  var zukanState = { cat: 'すべて', q: '', open: {} };

  function screenZukan() {
    var cats = ['すべて'];
    window.KUHO.forEach(function (k) { if (cats.indexOf(k.cat) === -1) cats.push(k.cat); });

    var list = window.KUHO.filter(function (k) {
      if (zukanState.cat !== 'すべて' && k.cat !== zukanState.cat) return false;
      if (!zukanState.q) return true;
      var hay = k.form + k.read + k.mean + (k.note || '') + k.cat +
        (k.ex || []).map(function (e) { return e.k + e.y + e.t + e.s; }).join('');
      return hay.indexOf(zukanState.q) !== -1;
    });

    var items = list.map(function (k) {
      var open = !!zukanState.open[k.id];
      var exHtml = (k.ex || []).map(function (e) {
        return '<div class="ex">' +
          '<div class="ex-k">' + kanbunHTML(e.k) + '</div>' +
          '<div class="ex-y">' + esc(e.y) + '</div>' +
          '<div class="ex-t">' + esc(e.t) + '</div>' +
          (e.s ? '<div class="ex-s">— ' + esc(e.s) + '</div>' : '') +
          '</div>';
      }).join('');
      return '<div class="kuho-item">' +
        '<button class="kuho-head" data-act="toggle" data-id="' + k.id + '">' +
          '<span class="kh-cat">' + esc(k.cat) + '</span>' +
          '<span class="kh-main"><span class="kh-form">' + kanbunHTML(k.form) + '</span>' +
          '<span class="kh-read">' + esc(k.read) + '</span></span>' +
          '<span class="lv">' + '★'.repeat(k.level) + '</span>' +
        '</button>' +
        (open ? '<div class="kuho-body">' +
          '<p class="kb-mean">' + esc(k.mean) + '</p>' +
          (k.note ? '<p class="kb-note">' + esc(k.note) + '</p>' : '') +
          exHtml + '</div>' : '') +
        '</div>';
    }).join('');

    render(
      '<div class="sec-h"><h2>句法図鑑</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">戻る</button></div>' +
      '<input class="search" id="zk-q" type="search" placeholder="句形・読み・意味・出典で検索" value="' + esc(zukanState.q) + '">' +
      '<div class="filters">' + cats.map(function (c) {
        return '<button class="pill' + (c === zukanState.cat ? ' on' : '') + '" data-act="cat" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      (list.length ? items : '<div class="empty"><div class="e-ico">🔍</div><p>該当する句形が見つかりません。</p></div>') +
      '<p class="muted center mt">' + list.length + ' / ' + window.KUHO.length + ' 件</p>'
    );

    var q = el('zk-q');
    q.addEventListener('input', function () {
      zukanState.q = q.value.trim();
      var pos = q.selectionStart;
      screenZukan();
      var nq = el('zk-q'); nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {}
    });
  }

  /* ============================ 講座 ============================ */
  function screenLessons() {
    render(
      '<div class="sec-h"><h2>基礎講座</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">戻る</button></div>' +
      '<div class="modes">' + window.LESSONS.map(function (l, i) {
        return '<button class="mode" data-act="lesson" data-id="' + l.id + '" style="--accent:var(--ai)">' +
          '<div class="m-ico">' + (i + 1) + '</div>' +
          '<div class="m-t">' + esc(l.title) + '</div>' +
          '<div class="m-d">' + esc(l.sub) + '</div></button>';
      }).join('') + '</div>'
    );
  }

  function screenLesson(id) {
    var idx = -1;
    window.LESSONS.forEach(function (l, i) { if (l.id === id) idx = i; });
    if (idx < 0) return screenLessons();
    var l = window.LESSONS[idx];
    var next = window.LESSONS[idx + 1];
    render(
      '<div class="sec-h"><h2>' + esc(l.title) + '</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="lessons">一覧</button></div>' +
      '<p class="muted">' + esc(l.sub) + '</p>' +
      '<div class="card mt lesson-body">' + l.body + '</div>' +
      '<div class="btn-row mt">' +
        (next ? '<button class="btn" data-act="lesson" data-id="' + next.id + '">次の講座：' + esc(next.title) + '</button>' : '') +
        '<button class="btn ghost" data-act="go" data-to="lessons">講座一覧へ</button>' +
      '</div>'
    );
  }

  /* ============================ 漢詩集 ============================ */
  function screenShishu() {
    var body = window.KANSHI.map(function (p) {
      var lines = p.lines.map(function (ln, i) {
        var isR = p.rhymeLines.indexOf(i + 1) !== -1;
        var head = ln.slice(0, ln.length - 1), tail = ln.charAt(ln.length - 1);
        return '<div class="p-line">' + esc(head) +
          (isR ? '<span class="rh">' + esc(tail) + '</span>' : esc(tail)) + '</div>';
      }).join('');
      return '<div class="card mt">' +
        '<div class="poem">' + lines +
          '<div class="p-yomi">' + p.yomi.map(esc).join('／') + '</div>' +
        '</div>' +
        '<div class="poem-meta">' +
          '<span class="tagl">' + esc(p.form) + '</span>' +
          '<span class="tagl">押韻：' + esc(p.rhyme.join('・')) + '</span>' +
          (p.tsuiku.length ? '<span class="tagl">対句：' + p.tsuiku.map(function (t) { return '第' + t[0] + '・' + t[1] + '句'; }).join('／') + '</span>' : '') +
        '</div>' +
        '<p class="muted mt">' + esc(p.trans) + '</p>' +
        '<p class="kb-note" style="margin-top:10px">' + esc(p.note) + '</p>' +
        '<p class="ex-s center" style="margin-top:8px">' + esc(p.author) + '「' + esc(p.title) + '」（' + esc(p.era) + '）</p>' +
        '</div>';
    }).join('');
    render(
      '<div class="sec-h"><h2>漢詩集</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">戻る</button></div>' +
      '<p class="muted">朱色の下線は押韻している字です。</p>' + body
    );
  }

  /* ============================ 実績 ============================ */
  function screenAch() {
    var s = window.Store.state;
    var items = window.Store.ACHIEVEMENTS.map(function (a) {
      var got = s.ach.indexOf(a.id) !== -1;
      return '<div class="ach-item' + (got ? ' got' : '') + '">' +
        '<div class="a-ico">' + a.ico + '</div>' +
        '<div class="a-t">' + esc(a.t) + '</div>' +
        '<div class="a-d">' + esc(a.d) + '</div></div>';
    }).join('');
    render(
      '<div class="sec-h"><h2>実績</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">戻る</button></div>' +
      '<p class="muted">' + s.ach.length + ' / ' + window.Store.ACHIEVEMENTS.length + ' 個を獲得</p>' +
      '<div class="ach mt">' + items + '</div>' +
      '<div class="sec-h"><h2>記録</h2><div class="rule"></div></div>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + s.xp + '</b><span>修錬値</span></div>' +
        '<div class="stat"><b>' + s.bestDay + '</b><span>連続日数の最高</span></div>' +
        '<div class="stat"><b>' + Object.keys(s.srs).length + '</b><span>学習した問題数</span></div>' +
      '</div>' +
      '<div class="btn-row mt-l"><button class="btn ghost" data-act="reset">学習記録をリセット</button></div>'
    );
  }

  /* ============================ 共通：結果画面 ============================ */
  function gradeOf(pct) {
    if (pct >= 95) return { r: '皆伝', msg: '文句なし。この調子なら入試の漢文は完全に得点源です。' };
    if (pct >= 85) return { r: '甲', msg: 'かなり仕上がっています。取りこぼした型だけ復習しましょう。' };
    if (pct >= 70) return { r: '乙', msg: '基礎は固まっています。まぎらわしい句法の識別を詰めれば一段上へ。' };
    if (pct >= 50) return { r: '丙', msg: 'あと一歩。読みと意味を声に出して覚え直すと伸びます。' };
    return { r: '丁', msg: 'まずは基礎講座と再読文字ドリルから。ここが土台です。' };
  }

  function screenResult(mode, res) {
    var pct = res.total ? Math.round(res.correct / res.total * 100) : 0;
    var g = gradeOf(pct);
    var xp = res.correct * 8 + Math.floor(res.maxCombo * 3) + (pct === 100 ? 30 : 0);
    var newAch = window.Store.finishSession(mode.id, {
      score: mode.id === 'mogi' ? pct : res.score,
      xp: xp, perfect: pct === 100 && res.total >= 5, maxCombo: res.maxCombo
    });

    var review = (res.wrong || []).map(function (w) {
      return '<div class="review-item">' +
        (w.stem ? '<div class="ri-stem">' + kanbunHTML(w.stem) + '</div>' : '') +
        '<div class="ri-q">' + esc(w.q) + '</div>' +
        (w.your !== undefined && w.your !== null ? '<div class="ri-y">✗ ' + esc(w.your) + '</div>' : '') +
        '<div class="ri-a">✓ ' + esc(w.answer) + '</div>' +
        (w.exp ? '<div class="ri-e">' + esc(w.exp) + '</div>' : '') +
        '</div>';
    }).join('');

    render(
      '<div class="card result mt">' +
        '<div class="r-rank">' + esc(g.r) + '</div>' +
        '<div class="r-score">' + (mode.id === 'mogi' ? pct + '<span style="font-size:.45em"> 点</span>' : res.score) + '</div>' +
        '<div class="r-sub">' + esc(mode.t) + '　' + res.correct + ' / ' + res.total + ' 問正解（' + pct + '%）</div>' +
        '<p class="r-msg">' + esc(g.msg) + '</p>' +
        '<div class="r-grid">' +
          '<div class="stat"><b>+' + xp + '</b><span>修錬値</span></div>' +
          '<div class="stat"><b>' + res.maxCombo + '</b><span>最大連鎖</span></div>' +
          '<div class="stat"><b>' + (window.Store.state.best[mode.id] !== undefined ? window.Store.state.best[mode.id] : '—') + '</b><span>自己ベスト</span></div>' +
        '</div>' +
        '<div class="btn-row mt-l" style="justify-content:center">' +
          '<button class="btn shu" data-act="play" data-id="' + mode.id + '">もう一度</button>' +
          '<button class="btn ghost" data-act="go" data-to="home">ホームへ</button>' +
        '</div>' +
      '</div>' +
      (review ? '<div class="sec-h"><h2>まちがえたところ</h2><div class="rule"></div></div><div class="review">' + review + '</div>' : '') +
      (newAch.length ? '' : '')
    );

    if (newAch.length) {
      setTimeout(function () { toast('実績を獲得： ' + newAch.map(function (a) { return a.ico + ' ' + a.t; }).join('、')); }, 500);
    }
  }

  /* ============================ ゲーム：4択エンジン ============================ */
  var G = null;   // 現在のゲーム状態
  var tick = null;

  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  function startChoice(mode) {
    var pool = mode.pool === 'weak' ? window.QuizGen.weakPool() : window.QuizGen.build(mode.pool);
    if (!pool.length) {
      toast(mode.pool === 'weak' ? 'まだ弱点が記録されていません。まず他のモードに挑戦しましょう。' : '問題を用意できませんでした。');
      return screenHome();
    }
    var qs = window.QuizGen.pick(pool, Math.min(mode.n, pool.length));
    G = {
      mode: mode, qs: qs, i: 0, correct: 0, score: 0, combo: 0, maxCombo: 0,
      hp: mode.hearts || 0, wrong: [], locked: false,
      left: mode.perQ || 0, totalLeft: mode.total || 0
    };
    renderChoice();
  }

  function renderChoice() {
    var m = G.mode, q = G.qs[G.i];
    var hud =
      '<div class="hud"><div class="hud-row">' +
        '<span class="q-no">第' + (G.i + 1) + '問 / ' + G.qs.length + '</span>' +
        (m.hearts ? '<span class="hearts">' + '❤'.repeat(G.hp) + '<span style="opacity:.25">' + '❤'.repeat(m.hearts - G.hp) + '</span></span>' : '') +
        '<span class="sp"></span>' +
        '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '<span class="hud-score">' + G.score + '</span>' +
        '<button class="icon-btn" data-act="quit" title="中断">✕</button>' +
      '</div>' +
      (m.perQ || m.total ? '<div class="timer" id="tm"><i id="tmb" style="width:100%"></i></div>' : '') +
      '</div>';

    var ch = q.choices.map(function (c, i) {
      return '<button class="choice" data-act="ans" data-i="' + i + '">' +
        '<span class="k">' + '１２３４'.charAt(i) + '</span><span>' + esc(c) + '</span></button>';
    }).join('');

    render(hud +
      '<div class="q-card" id="qc">' +
        '<span class="q-cat">' + esc(q.cat) + '</span>' +
        (q.stem ? '<div class="q-stem">' + kanbunHTML(q.stem) + '</div>' : '') +
        (q.src ? '<div class="q-src">— ' + esc(q.src) + '</div>' : '') +
        '<p class="q-text">' + esc(q.q) + '</p>' +
        '<div class="choices">' + ch + '</div>' +
        '<div id="vd"></div>' +
      '</div>');

    G.locked = false;
    if (m.perQ) { G.left = m.perQ; runTimer(); }
    else if (m.total) { runTimer(); }
  }

  function runTimer() {
    stopTick();
    var m = G.mode;
    var bar = el('tmb'), wrap = el('tm');
    if (!bar) return;
    tick = setInterval(function () {
      if (G.locked) return;
      if (m.perQ) {
        G.left -= 0.1;
        var p = Math.max(0, G.left / m.perQ * 100);
        bar.style.width = p + '%';
        wrap.classList.toggle('warn', p < 34);
        if (G.left <= 0) { stopTick(); answer(-1); }
      } else if (m.total) {
        G.totalLeft -= 0.1;
        var p2 = Math.max(0, G.totalLeft / m.total * 100);
        bar.style.width = p2 + '%';
        wrap.classList.toggle('warn', p2 < 25);
        if (G.totalLeft <= 0) { stopTick(); finishChoice(); }
      }
    }, 100);
  }

  function answer(idx) {
    if (G.locked) return;
    G.locked = true;
    stopTick();
    var q = G.qs[G.i];
    var ok = idx === q.a;

    window.Store.record(q.key, ok);
    if (ok) {
      G.correct++;
      G.combo++;
      G.maxCombo = Math.max(G.maxCombo, G.combo);
      var timeBonus = G.mode.perQ ? Math.round(Math.max(0, G.left) / G.mode.perQ * 40) : 0;
      G.score += 100 + Math.min(100, (G.combo - 1) * 20) + timeBonus;
    } else {
      G.combo = 0;
      if (G.mode.hearts) G.hp--;
      G.wrong.push({
        stem: q.stem, q: q.q, exp: q.exp,
        answer: q.choices[q.a],
        your: idx >= 0 ? q.choices[idx] : '（時間切れ）'
      });
    }

    var btns = $app.querySelectorAll('.choice');
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = true;
      if (i === q.a) btns[i].classList.add('correct');
      if (i === idx && !ok) btns[i].classList.add('wrong');
    }
    if (!ok) {
      var qc = el('qc');
      qc.classList.add('shake');
      setTimeout(function () { qc.classList.remove('shake'); }, 350);
    }

    var last = (G.i >= G.qs.length - 1) || (G.mode.hearts && G.hp <= 0);
    el('vd').innerHTML =
      '<div class="verdict ' + (ok ? 'ok' : 'ng') + '">' +
        '<div class="v-h">' + (ok ? '◯ 正解' : '✗ 不正解') +
          (ok && G.combo >= 3 ? '<span style="font-size:12px;color:var(--shu)">' + G.combo + ' 連鎖！</span>' : '') + '</div>' +
        (q.exp ? '<p>' + esc(q.exp) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn" data-act="next">' + (last ? '結果を見る' : '次の問題へ') + '</button>' +
        '</div>' +
      '</div>';
    el('vd').querySelector('.btn').focus();
  }

  function nextQuestion() {
    if (G.mode.hearts && G.hp <= 0) return finishChoice();
    G.i++;
    if (G.i >= G.qs.length) return finishChoice();
    renderChoice();
  }

  function finishChoice() {
    stopTick();
    var res = { correct: G.correct, total: G.qs.length, score: G.score, maxCombo: G.maxCombo, wrong: G.wrong };
    var m = G.mode; G = null;
    screenResult(m, res);
  }

  /* ============================ ゲーム：返り点ルート ============================ */
  function startKaeriten() {
    var set = window.QuizGen.shuffle(window.KAERITEN).slice(0, 8)
      .sort(function (a, b) { return a.level - b.level; });
    G = { mode: modeById('kaeriten'), items: set, i: 0, correct: 0, score: 0, combo: 0, maxCombo: 0, wrong: [], step: 0, mistakes: 0, done: false };
    renderKaeriten();
  }

  function renderKaeriten() {
    var it = G.items[G.i];
    var chars = it.chars.map(function (c, i) {
      var pos = it.order.indexOf(i);
      var done = pos >= 0 && pos < G.step;
      return '<button class="kt-char' + (done ? ' done' : '') + '" data-act="kt" data-i="' + i + '"' + (done ? ' disabled' : '') + '>' +
        (c.m ? '<span class="mk">' + esc(c.m) + '</span>' : '') +
        (done ? '<span class="ord">' + (pos + 1) + '</span>' : '') +
        esc(c.c) + '</button>';
    }).join('');

    render(
      '<div class="hud"><div class="hud-row">' +
        '<span class="q-no">第' + (G.i + 1) + '問 / ' + G.items.length + '</span>' +
        '<span class="sp"></span>' +
        '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '<span class="hud-score">' + G.score + '</span>' +
        '<button class="icon-btn" data-act="quit">✕</button>' +
      '</div></div>' +
      '<div class="q-card" id="qc">' +
        '<span class="q-cat">' + esc(it.label) + '</span>' +
        '<p class="q-text">返り点にしたがって、<b>読む順に</b>漢字をタップしてください。</p>' +
        '<div class="kt-stage">' + chars + '</div>' +
        '<div id="vd"></div>' +
      '</div>'
    );
  }

  function kaeritenTap(i) {
    if (G.done) return;
    var it = G.items[G.i];
    var expect = it.order[G.step];
    if (i === expect) {
      G.step++;
      if (G.step >= it.order.length) {
        G.done = true;
        var clean = G.mistakes === 0;
        window.Store.record('kt:' + it.id, clean);
        if (clean) { G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.score += 100 + Math.min(100, (G.combo - 1) * 20); }
        else { G.combo = 0; G.wrong.push({ stem: it.chars.map(function (c) { return c.c; }).join(''), q: it.label + 'の読む順序', answer: it.yomi, exp: it.tip, your: null }); }
        renderKaeriten();
        var last = G.i >= G.items.length - 1;
        el('vd').innerHTML = '<div class="verdict ' + (clean ? 'ok' : 'ng') + '">' +
          '<div class="v-h">' + (clean ? '◯ 完成' : '△ 完成（ミスあり）') + '</div>' +
          '<p><b>' + esc(it.yomi) + '</b></p><p>' + esc(it.tip) + '</p>' +
          '<div class="btn-row" style="margin-top:12px"><button class="btn" data-act="ktnext">' +
          (last ? '結果を見る' : '次の問題へ') + '</button></div></div>';
        el('vd').querySelector('.btn').focus();
      } else {
        renderKaeriten();
      }
    } else {
      G.mistakes++;
      var btn = $app.querySelector('.kt-char[data-i="' + i + '"]');
      if (btn) {
        btn.classList.add('bad');
        setTimeout(function () { btn.classList.remove('bad'); }, 400);
      }
      var qc = el('qc'); qc.classList.add('shake');
      setTimeout(function () { qc.classList.remove('shake'); }, 350);
    }
  }

  function kaeritenNext() {
    G.i++; G.step = 0; G.mistakes = 0; G.done = false;
    if (G.i >= G.items.length) {
      var res = { correct: G.correct, total: G.items.length, score: G.score, maxCombo: G.maxCombo, wrong: G.wrong };
      var m = G.mode; G = null; return screenResult(m, res);
    }
    renderKaeriten();
  }

  /* ============================ ゲーム：置き字ハンター ============================ */
  function startOkiji() {
    var set = window.QuizGen.shuffle(window.OKIJI).slice(0, 8);
    G = { mode: modeById('okiji'), items: set, i: 0, correct: 0, score: 0, combo: 0, maxCombo: 0, wrong: [], sel: {}, done: false };
    renderOkiji();
  }

  function renderOkiji() {
    var it = G.items[G.i];
    var chars = it.chars.map(function (c, i) {
      var cls = '';
      if (G.done) {
        var isO = it.okiji.indexOf(i) !== -1, picked = !!G.sel[i];
        if (isO) cls = ' hit';
        else if (picked) cls = ' miss';
      } else if (G.sel[i]) cls = ' sel';
      return '<button class="ok-char' + cls + '" data-act="ok" data-i="' + i + '"' + (G.done ? ' disabled' : '') + '>' + esc(c) + '</button>';
    }).join('');

    render(
      '<div class="hud"><div class="hud-row">' +
        '<span class="q-no">第' + (G.i + 1) + '問 / ' + G.items.length + '</span>' +
        '<span class="sp"></span>' +
        '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '<span class="hud-score">' + G.score + '</span>' +
        '<button class="icon-btn" data-act="quit">✕</button>' +
      '</div></div>' +
      '<div class="q-card" id="qc">' +
        '<span class="q-cat">置き字</span>' +
        '<p class="q-text">この文の中の<b>置き字（読まない字）</b>をすべて選んでください。</p>' +
        '<div class="ok-stage">' + chars + '</div>' +
        (G.done ? '' : '<div class="btn-row" style="justify-content:center"><button class="btn shu" data-act="okjudge">判定する</button></div>') +
        '<div id="vd"></div>' +
      '</div>'
    );
  }

  function okijiJudge() {
    var it = G.items[G.i];
    var picked = Object.keys(G.sel).filter(function (k) { return G.sel[k]; }).map(Number).sort(function (a, b) { return a - b; });
    var ans = it.okiji.slice().sort(function (a, b) { return a - b; });
    var ok = picked.length === ans.length && picked.every(function (v, i) { return v === ans[i]; });

    G.done = true;
    window.Store.record('ok:' + it.id, ok);
    if (ok) { G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.score += 100 + Math.min(100, (G.combo - 1) * 20); }
    else {
      G.combo = 0;
      G.wrong.push({
        stem: it.chars.join(''), q: '置き字はどれか', exp: it.tip,
        answer: ans.map(function (i) { return it.chars[i]; }).join('・') + '（' + it.yomi + '）',
        your: picked.length ? picked.map(function (i) { return it.chars[i]; }).join('・') : '（選択なし）'
      });
    }
    renderOkiji();
    var last = G.i >= G.items.length - 1;
    el('vd').innerHTML = '<div class="verdict ' + (ok ? 'ok' : 'ng') + '">' +
      '<div class="v-h">' + (ok ? '◯ 正解' : '✗ 不正解') + '</div>' +
      '<p>置き字は <b>' + esc(ans.map(function (i) { return it.chars[i]; }).join('・')) + '</b>。書き下し文は「' + esc(it.yomi) + '」' + (it.src ? '（' + esc(it.src) + '）' : '') + '</p>' +
      '<p>' + esc(it.tip) + '</p>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn" data-act="oknext">' + (last ? '結果を見る' : '次の問題へ') + '</button></div></div>';
    el('vd').querySelector('.btn').focus();
  }

  function okijiNext() {
    G.i++; G.sel = {}; G.done = false;
    if (G.i >= G.items.length) {
      var res = { correct: G.correct, total: G.items.length, score: G.score, maxCombo: G.maxCombo, wrong: G.wrong };
      var m = G.mode; G = null; return screenResult(m, res);
    }
    renderOkiji();
  }

  /* ============================ ゲーム：書き下し組立 ============================ */
  function startNarabe() {
    var set = window.QuizGen.shuffle(window.NARABEKAE).slice(0, 8)
      .sort(function (a, b) { return a.level - b.level; });
    G = { mode: modeById('narabe'), items: set, i: 0, correct: 0, score: 0, combo: 0, maxCombo: 0, wrong: [], placed: [], shuffled: [], done: false };
    G.shuffled = window.QuizGen.shuffle(set[0].parts.map(function (p, i) { return i; }));
    renderNarabe();
  }

  function renderNarabe() {
    var it = G.items[G.i];
    var slot = G.placed.map(function (pi, k) {
      var cls = 'chip placed';
      if (G.done) cls = 'chip ' + (G.placed[k] === k ? 'ok' : 'ng');
      return '<button class="' + cls + '" data-act="nbpull" data-k="' + k + '"' + (G.done ? ' disabled' : '') + '>' + esc(it.parts[pi]) + '</button>';
    }).join('');
    var pool = G.shuffled.map(function (pi) {
      var used = G.placed.indexOf(pi) !== -1;
      return '<button class="chip" data-act="nbpush" data-i="' + pi + '"' + (used || G.done ? ' disabled' : '') + '>' + esc(it.parts[pi]) + '</button>';
    }).join('');

    render(
      '<div class="hud"><div class="hud-row">' +
        '<span class="q-no">第' + (G.i + 1) + '問 / ' + G.items.length + '</span>' +
        '<span class="sp"></span>' +
        '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '<span class="hud-score">' + G.score + '</span>' +
        '<button class="icon-btn" data-act="quit">✕</button>' +
      '</div></div>' +
      '<div class="q-card" id="qc">' +
        '<span class="q-cat">書き下し</span>' +
        '<div class="q-stem">' + kanbunHTML(it.kanbun) + '</div>' +
        '<div class="q-src">— ' + esc(it.src) + '</div>' +
        '<p class="q-text">語のかたまりを並べて、正しい書き下し文を作ってください。</p>' +
        '<div class="nb-slot">' + (slot || '<span class="muted" style="font-size:12px">ここに並べます</span>') + '</div>' +
        '<div class="nb-pool">' + pool + '</div>' +
        (!G.done && G.placed.length === it.parts.length ? '<div class="btn-row mt" style="justify-content:center"><button class="btn shu" data-act="nbjudge">判定する</button></div>' : '') +
        '<div id="vd"></div>' +
      '</div>'
    );
  }

  function narabeJudge() {
    var it = G.items[G.i];
    var ok = G.placed.every(function (v, i) { return v === i; });
    G.done = true;
    window.Store.record('nb:' + it.id, ok);
    if (ok) { G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.score += 120 + Math.min(120, (G.combo - 1) * 20); }
    else {
      G.combo = 0;
      G.wrong.push({
        stem: it.kanbun, q: '書き下し文に直すと？', exp: '訳：' + it.trans + '（' + it.src + '）',
        answer: it.parts.join(''), your: G.placed.map(function (p) { return it.parts[p]; }).join('')
      });
    }
    renderNarabe();
    var last = G.i >= G.items.length - 1;
    el('vd').innerHTML = '<div class="verdict ' + (ok ? 'ok' : 'ng') + '">' +
      '<div class="v-h">' + (ok ? '◯ 正解' : '✗ 不正解') + '</div>' +
      '<p><b>' + esc(it.parts.join('')) + '</b></p><p>' + esc(it.trans) + '（' + esc(it.src) + '）</p>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn" data-act="nbnext">' + (last ? '結果を見る' : '次の問題へ') + '</button></div></div>';
    el('vd').querySelector('.btn').focus();
  }

  function narabeNext() {
    G.i++; G.placed = []; G.done = false;
    if (G.i >= G.items.length) {
      var res = { correct: G.correct, total: G.items.length, score: G.score, maxCombo: G.maxCombo, wrong: G.wrong };
      var m = G.mode; G = null; return screenResult(m, res);
    }
    G.shuffled = window.QuizGen.shuffle(G.items[G.i].parts.map(function (p, i) { return i; }));
    renderNarabe();
  }

  /* ============================ 起動 ============================ */
  function play(id) {
    var m = modeById(id);
    if (!m) return screenHome();
    window.Store.touchDay();
    stopTick();
    if (m.kind === 'choice') return startChoice(m);
    if (m.kind === 'kaeriten') return startKaeriten();
    if (m.kind === 'okiji') return startOkiji();
    if (m.kind === 'narabe') return startNarabe();
  }

  function go(to) {
    stopTick(); G = null;
    if (to === 'home') return screenHome();
    if (to === 'zukan') return screenZukan();
    if (to === 'lessons') return screenLessons();
    if (to === 'shishu') return screenShishu();
    if (to === 'ach') return screenAch();
    screenHome();
  }

  /* ---------- イベント委譲 ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    switch (act) {
      case 'go': go(t.getAttribute('data-to')); break;
      case 'play': play(t.getAttribute('data-id')); break;
      case 'lesson': screenLesson(t.getAttribute('data-id')); break;
      case 'toggle':
        var id = t.getAttribute('data-id');
        zukanState.open[id] = !zukanState.open[id];
        screenZukan();
        break;
      case 'cat': zukanState.cat = t.getAttribute('data-cat'); screenZukan(); break;
      case 'ans': answer(parseInt(t.getAttribute('data-i'), 10)); break;
      case 'next': nextQuestion(); break;
      case 'quit':
        if (confirm('中断してホームに戻りますか？　ここまでの記録は保存されます。')) { window.Store.save(); go('home'); }
        break;
      case 'kt': kaeritenTap(parseInt(t.getAttribute('data-i'), 10)); break;
      case 'ktnext': kaeritenNext(); break;
      case 'ok':
        var oi = t.getAttribute('data-i');
        G.sel[oi] = !G.sel[oi];
        renderOkiji();
        break;
      case 'okjudge': okijiJudge(); break;
      case 'oknext': okijiNext(); break;
      case 'nbpush': G.placed.push(parseInt(t.getAttribute('data-i'), 10)); renderNarabe(); break;
      case 'nbpull': G.placed.splice(parseInt(t.getAttribute('data-k'), 10), 1); renderNarabe(); break;
      case 'nbjudge': narabeJudge(); break;
      case 'nbnext': narabeNext(); break;
      case 'theme': toggleTheme(); break;
      case 'reset':
        if (confirm('すべての学習記録（段位・実績・弱点）を消去します。よろしいですか？')) {
          window.Store.reset(); toast('学習記録をリセットしました'); go('home');
        }
        break;
    }
  }

  function onKey(e) {
    if (!G || !G.qs || G.locked) return;
    var n = '1234'.indexOf(e.key);
    if (n >= 0 && n < G.qs[G.i].choices.length) { answer(n); return; }
    if (e.key === 'Enter') {
      var b = $app.querySelector('#vd .btn');
      if (b) b.click();
    }
  }

  function applyTheme() {
    var t = window.Store.state.theme;
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var btn = el('theme-btn');
    if (btn) btn.textContent = t === 'dark' ? '暗' : t === 'light' ? '明' : '自';
  }
  function toggleTheme() {
    var order = ['', 'light', 'dark'];
    var cur = order.indexOf(window.Store.state.theme || '');
    window.Store.state.theme = order[(cur + 1) % 3];
    window.Store.save();
    applyTheme();
    toast(window.Store.state.theme === 'light' ? '明るいテーマ' : window.Store.state.theme === 'dark' ? '暗いテーマ' : '端末の設定に合わせます');
  }

  function init() {
    $app = el('app');
    $toast = el('toast');
    window.Store.load();
    applyTheme();
    var first = window.Store.touchDay();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    screenHome();
    if (first && window.Store.state.streak > 1) {
      setTimeout(function () { toast('連続学習 ' + window.Store.state.streak + ' 日目。今日も一問から。'); }, 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
