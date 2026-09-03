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
  /** 確認ダイアログ。ブラウザの confirm は埋め込み表示だとブロックされることがあるので自前で出す。 */
  function ask(msg, okLabel, onOk) {
    var wrap = document.createElement('div');
    wrap.className = 'ovl';
    wrap.innerHTML = '<div class="dlg" role="dialog" aria-modal="true">' +
      '<p>' + esc(msg) + '</p>' +
      '<div class="btn-row" style="justify-content:flex-end;margin-top:18px">' +
        '<button class="btn ghost" data-x="c">やめる</button>' +
        '<button class="btn shu" data-x="o">' + esc(okLabel) + '</button>' +
      '</div></div>';
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', onEsc); }
    function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) return close();
      var t = e.target.closest('[data-x]');
      if (!t) return;
      e.stopPropagation();
      close();
      if (t.getAttribute('data-x') === 'o') onOk();
    });
    document.addEventListener('keydown', onEsc);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-x="o"]').focus();
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function mmss(sec) { return pad(Math.floor(sec / 60)) + ':' + pad(Math.floor(sec % 60)); }

  /** 訓読文を組む。データ側では返り点の前に ^ を置く（未^レ聞^二其名^一）。
   *  自動判別にしないのは、「一見」「二月」のように返り点と同じ字が本文に現れるため。
   *  返り点は直前の一字を包んで絶対配置し、縦書きなら左下・横書きなら右下に出す。 */
  var MARKS = '一レ|上レ|甲レ|レ|一|二|三|四|上|中|下|甲|乙|丙';
  function kanbunHTML(s) {
    return esc(s).replace(new RegExp('([^\\s^])\\^(' + MARKS + ')', 'g'), function (m, ch, mk) {
      return '<span class="kc">' + ch + '<i class="mark">' + mk + '</i></span>';
    }).replace(new RegExp('\\^(' + MARKS + ')', 'g'), '<i class="mark">$1</i>');
  }

  /** 縦書きの高さは文字数から決める。
   *  writing-mode: vertical-rl の要素は inline サイズ（画面上の高さ）が確定しないと
   *  1 列に潰れてしまい、height:max-content も効かないため、字数を CSS 変数で渡す。 */
  function vlen(s) {
    return String(s || '').replace(new RegExp('\\^(' + MARKS + ')', 'g'), '').replace(/\s/g, '').length;
  }
  function vstyle(s) { return ' style="--n:' + vlen(s) + '"'; }

  /** 設問の漢文を組む。漢詩のように「／」で句が区切られている場合は、
   *  一続きの長い列にせず句ごとの列に分ける（縦組みで読みやすく、はみ出しも防げる）。 */
  function stemHTML(stem) {
    if (String(stem).indexOf('／') !== -1) {
      return '<div class="p-lines stem-lines">' + String(stem).split('／').map(function (ln) {
        return '<div class="p-line"' + vstyle(ln) + '>' + kanbunHTML(ln) + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="q-stem-wrap"><div class="q-stem"' + vstyle(stem) + '>' + kanbunHTML(stem) + '</div></div>';
  }

  /** 縦組みの一字あたりの送り（画面上の高さ）を実測して CSS 変数に入れる。
   *  字数から高さを見積もる方式だと、フォントや字間の差で数 px 足りず、
   *  最後の一字だけ次の列へ回り込んで見切れることがあった。実測すれば確実に収まる。 */
  function measureAdvance(cls, varName) {
    var probe = document.createElement('div');
    probe.className = cls;
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
      'height:4000px;max-height:none;width:auto;';
    probe.textContent = '漢'.repeat(20);
    document.body.appendChild(probe);
    var r = document.createRange();
    r.selectNodeContents(probe);
    var rect = r.getBoundingClientRect();
    var vert = document.documentElement.classList.contains('vert');
    var adv = (vert ? rect.height : rect.width) / 20;
    document.body.removeChild(probe);
    if (adv > 4) document.documentElement.style.setProperty(varName, adv.toFixed(2) + 'px');
  }
  function measureAdvances() {
    if (!document.documentElement.classList.contains('vert')) return;
    measureAdvance('q-stem', '--adv-stem');
    measureAdvance('ex-k', '--adv-ex');
    measureAdvance('p-line', '--adv-line');
  }

  /** 読んだ漢文の量として数える文字数（漢字だけを数える） */
  function kanjiCount(s) {
    var m = String(s || '').match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g);
    return m ? m.length : 0;
  }

  /** 判定と解説を画面に入れてから、次へ進むボタンに送る。
   *  設問が長いと解説が画面の外に出たままになるため。 */
  function focusVerdict() {
    var vd = el('vd');
    if (!vd) return;
    if (vd.scrollIntoView) {
      try { vd.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      catch (e) { vd.scrollIntoView(false); }
    }
    var b = vd.querySelector('.btn');
    if (b) b.focus({ preventScroll: true });
  }

  /* ============================ モード定義 ============================ */
  var MODES = [
    { id: 'kundoku', ico: '訓', t: '訓読の基本', d: '返り点・置き字・書き下しのきまりを固める', kind: 'choice', pool: 'kundoku', n: 10, accent: 'var(--ai)', tag: '基礎' },
    { id: 'saidoku', ico: '再', t: '再読文字ドリル', d: '十字を読みと意味ごと完全に定着させる', kind: 'choice', pool: 'saidoku', n: 12, accent: 'var(--midori)', tag: '基礎' },
    { id: 'battle', ico: '闘', t: '道場破り', d: '漢文の主たちが立ちはだかる。八つの関門を抜けよ', kind: 'battle', accent: 'var(--shu)', tag: '対戦' },
    { id: 'kuho', ico: '句', t: '句法ドリル', d: '全句法から通しで15問。一問25秒', kind: 'choice', pool: 'kuho', n: 15, accent: 'var(--ai)', perQ: 25, tag: '練習' },
    { id: 'kaeriten', ico: '点', t: '返り点ルート', d: '縦組みの白文を、返り点どおりの順にタップ', kind: 'kaeriten', accent: 'var(--murasaki)', tag: 'パズル' },
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

  /** 道場破りだけは、次に立ちはだかる相手の顔を見せて別格に扱う */
  function battleHero(s) {
    var cleared = s.foesCleared || [];
    var idx = 0;
    while (idx < window.FOES.length && cleared.indexOf(window.FOES[idx].id) !== -1) idx++;
    var all = idx >= window.FOES.length;
    var f = window.FOES[all ? window.FOES.length - 1 : idx];
    return '<button class="mode battle-hero" data-act="play" data-id="battle" style="--accent:var(--shu)">' +
      '<span class="m-tag">対戦</span>' +
      foeArt(f, 'hero-foe' + (all ? ' beaten' : ''), all ? '破' : '') +
      '<span class="bh-body">' +
        '<span class="bh-t">道場破り</span>' +
        '<span class="bh-d">' + (all
          ? '八つの関門をすべて突破。もう一巡して腕を確かめましょう。'
          : '次に待つのは<b>' + esc(f.name) + '</b>。' +
            esc(f.cats ? f.cats.join('・') : '全分野') + 'から、正解 ' + f.ki + ' 回で突破。') + '</span>' +
        gateRoad(all ? window.FOES.length - 1 : idx, true) +
        '<span class="bh-n">突破 ' + cleared.length + ' / ' + window.FOES.length + ' 関門</span>' +
      '</span>' +
      '</button>';
  }

  function screenHome() {
    var s = window.Store.state;
    var r = window.Store.rankOf(s.xp);
    var acc = s.answered ? Math.round(s.correct / s.answered * 100) : 0;
    var weakN = window.Store.weakKeys().length;
    var todayChars = window.Store.recentDays(1)[0].chars;
    var slatsAll = Math.floor((s.chars || 0) / SLAT_CHARS);

    var cards = MODES.filter(function (m) { return m.id !== 'battle'; }).map(function (m) {
      var best = s.best[m.id];
      var sub;
      if (m.id === 'weak') {
        sub = weakN ? '苦手 ' + weakN + ' 問が待機中' : 'まだ弱点は記録されていません';
      } else {
        sub = best !== undefined ? '自己ベスト ' + best + (m.id === 'mogi' ? ' 点' : '') : '未挑戦';
      }
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
          '<div class="stat"><b>' + fmtNum(todayChars) + '</b><span>今日読んだ字</span></div>' +
          '<div class="stat"><b>' + fmtNum(s.answered) + '</b><span>のべ解答数</span></div>' +
          '<div class="stat"><b>' + s.streak + '</b><span>連続学習日</span></div>' +
        '</div>' +
      '</section>' +
      '<div class="sec-h"><h2>けいこ</h2><div class="rule"></div></div>' +
      battleHero(s) +
      '<div class="modes">' + cards + '</div>' +
      '<div class="sec-h"><h2>まなび</h2><div class="rule"></div></div>' +
      '<div class="modes">' +
        '<button class="mode" data-act="go" data-to="lessons" style="--accent:var(--ai)"><div class="m-ico">講</div><div class="m-t">基礎講座</div><div class="m-d">訓読・句法・漢詩のルールを読んで理解する</div></button>' +
        '<button class="mode" data-act="go" data-to="zukan" style="--accent:var(--midori)"><div class="m-ico">図</div><div class="m-t">句法図鑑</div><div class="m-d">' + window.KUHO.length + 'の句形を検索・分類して確認</div></button>' +
        '<button class="mode" data-act="go" data-to="shishu" style="--accent:var(--murasaki)"><div class="m-ico">詩</div><div class="m-t">漢詩集</div><div class="m-d">' + window.KANSHI.length + '首の名詩を書き下し・訳つきで</div></button>' +
        '<button class="mode" data-act="go" data-to="ach" style="--accent:var(--kin)"><div class="m-ico">録</div><div class="m-t">学びの記録</div><div class="m-d">読んだ字数・日々の墨あと・分野別の習熟</div>' +
          '<div class="m-prog">' + (s.chars ? '漢文 ' + fmtNum(s.chars) + ' 字・竹簡 ' + Math.floor(slatsAll / MAKI_SLATS) + ' 巻' : 'まだ記録がありません') + '</div></button>' +
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

    /* 分野ごとの収録数。どの分野が厚いのかが一目で分かる */
    var catN = {};
    window.KUHO.forEach(function (k) { catN[k.cat] = (catN[k.cat] || 0) + 1; });
    catN['すべて'] = window.KUHO.length;

    /* 絞り込んでいないときは分野の見出しを挟んで、100 件の平坦な列にしない */
    var grouped = zukanState.cat === 'すべて' && !zukanState.q;
    var lastCat = null;

    var items = list.map(function (k) {
      var head = '';
      if (grouped && k.cat !== lastCat) {
        lastCat = k.cat;
        head = '<h3 class="zk-group">' + esc(k.cat) +
          '<span>' + catN[k.cat] + ' 句形</span></h3>';
      }
      var open = !!zukanState.open[k.id];
      var exHtml = (k.ex || []).map(function (e) {
        return '<div class="ex">' +
          '<div class="ex-k"' + vstyle(e.k) + '>' + kanbunHTML(e.k) + '</div>' +
          '<div class="ex-y">' + esc(e.y) + '</div>' +
          '<div class="ex-t">' + esc(e.t) + '</div>' +
          (e.s ? '<div class="ex-s">— ' + esc(e.s) + '</div>' : '') +
          '</div>';
      }).join('');
      return head + '<div class="kuho-item">' +
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
      /* 検索と分野の切り替えは上に貼りつけ、どこまで下がっても手が届くようにする */
      '<div class="zk-bar">' +
        '<input class="search" id="zk-q" type="search" placeholder="句形・読み・意味・出典で検索" value="' + esc(zukanState.q) + '">' +
        '<div class="filters">' + cats.map(function (c) {
          return '<button class="pill' + (c === zukanState.cat ? ' on' : '') + '" data-act="cat" data-cat="' + esc(c) + '">' +
            esc(c) + '<small>' + catN[c] + '</small></button>';
        }).join('') + '</div>' +
      '</div>' +
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
        return '<div class="p-line"' + vstyle(ln) + '>' + esc(head) +
          (isR ? '<span class="rh">' + esc(tail) + '</span>' : esc(tail)) + '</div>';
      }).join('');
      return '<div class="card mt">' +
        '<div class="poem">' +
          '<div class="p-lines">' + lines + '</div>' +
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

  /* ============================ 学びの記録 ============================
     学習量を漢文の道具立てで見せる。
       読んだ字 → 竹簡（約30字で一枚、30枚で一巻）
       日々の量 → 墨あとの濃淡
       分野別   → 習得した問題数の帯
  ============================================================ */
  var SLAT_CHARS = 30;   // 竹簡一枚におよそ収まる字数
  var MAKI_SLATS = 30;   // 一巻に綴じる枚数

  function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /** 字数を、詩や書物の分量に言い換える。数はすべて実際の字数から出している。 */
  function tatoe(n) {
    if (n >= 200) {
      var t = '孟浩然「春暁」のような五言絶句（20字）にして ' + Math.floor(n / 20) + ' 首ぶん。';
      if (n >= 1000) t += '『千字文』を ' + Math.floor(n / 1000) + ' 回読み通した字数です。';
      return t;
    }
    if (n >= 112) return '杜甫「春望」のような五言律詩（40字）' + Math.floor(n / 40) + ' 首ぶん。';
    if (n >= 56) return '七言律詩（56字）' + Math.floor(n / 56) + ' 首ぶん。';
    if (n >= 20) return '孟浩然「春暁」のような五言絶句（20字）' + Math.floor(n / 20) + ' 首ぶん。';
    if (n > 0) return 'あと ' + (20 - n) + ' 字で、五言絶句 1 首ぶんになります。';
    return '二十字読めば、五言絶句 1 首ぶん。まずは一問から。';
  }

  function hhmm(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
    if (h) return h + ' 時間 ' + m + ' 分';
    if (m) return m + ' 分';
    return Math.max(0, Math.round(sec)) + ' 秒';
  }

  /* 竹簡の帯 */
  function chikanHTML(filled, total) {
    var out = '';
    for (var i = 0; i < total; i++) {
      out += '<i class="slat' + (i < filled ? ' on' : '') + '"></i>';
    }
    return '<div class="chikan" aria-hidden="true">' + out + '</div>';
  }

  /* 墨あと（直近12週） */
  function sumiHTML() {
    var days = window.Store.recentDays(84);
    var pad = days[0].date.getDay();
    var cells = '';
    for (var i = 0; i < pad; i++) cells += '<span class="sumi pad"></span>';
    var max = 0;
    days.forEach(function (d) { if (d.n > max) max = d.n; });
    days.forEach(function (d, idx) {
      var lv = d.n === 0 ? 0 : d.n < 5 ? 1 : d.n < 12 ? 2 : d.n < 25 ? 3 : d.n < 50 ? 4 : 5;
      var label = (d.date.getMonth() + 1) + '月' + d.date.getDate() + '日　' +
        (d.n ? d.n + ' 問（正解 ' + d.c + '）' : '学習なし');
      cells += '<span class="sumi lv' + lv + (idx === days.length - 1 ? ' today' : '') +
        '" title="' + esc(label) + '"></span>';
    });
    return '<div class="sumi-grid">' + cells + '</div>';
  }

  /* 分野別の習熟 */
  var FIELDS = [
    { t: '訓読の基礎', cats: ['訓読', '識別'] },
    { t: '返り点', cats: ['返り点'] },
    { t: '置き字', cats: ['置き字'] },
    { t: '再読文字', cats: ['再読文字'] },
    { t: '否定・禁止', cats: ['否定', '禁止', '二重否定', '部分否定'] },
    { t: '疑問・反語', cats: ['疑問', '反語', '疑問反語'] },
    { t: '使役・受身', cats: ['使役', '受身'] },
    { t: '比較・選択・仮定', cats: ['比較', '選択', '仮定'] },
    { t: '限定・累加ほか', cats: ['限定', '累加', '抑揚', '詠嘆', '願望'] },
    { t: '書き下し', cats: ['書き下し'] },
    { t: '重要語・頻出漢字', cats: ['重要語', '頻出漢字'] },
    { t: '漢詩', cats: ['漢詩'] },
    { t: '故事成語', cats: ['故事成語'] }
  ];

  function fieldStats() {
    var uni = window.QuizGen.universe();
    var srs = window.Store.state.srs;
    var byCat = {};
    uni.forEach(function (u) {
      var b = byCat[u.cat] || (byCat[u.cat] = { total: 0, touched: 0, mastered: 0, r: 0, w: 0 });
      b.total++;
      var rec = srs[u.key];
      if (rec) {
        b.touched++;
        b.r += rec.r; b.w += rec.w;
        if (window.Store.isMastered(u.key)) b.mastered++;
      }
    });
    return FIELDS.map(function (f) {
      var o = { t: f.t, total: 0, touched: 0, mastered: 0, r: 0, w: 0 };
      f.cats.forEach(function (c) {
        var b = byCat[c];
        if (!b) return;
        o.total += b.total; o.touched += b.touched; o.mastered += b.mastered;
        o.r += b.r; o.w += b.w;
      });
      return o;
    }).filter(function (o) { return o.total > 0; });
  }

  /** 収録内容のうち、どれだけに触れたか */
  function coverage() {
    var srs = window.Store.state.srs;
    var keys = Object.keys(srs);
    function hit(test) {
      var seen = {};
      keys.forEach(function (k) { var id = test(k); if (id) seen[id] = 1; });
      return Object.keys(seen).length;
    }
    return [
      { t: '句形', n: hit(function (k) { var m = /^([a-z]{2}\d{2}):/.exec(k); return m && window.KUHO.some(function (x) { return x.id === m[1]; }) ? m[1] : null; }), all: window.KUHO.length, u: '句' },
      { t: '漢詩', n: hit(function (k) { var m = /^(ks\d{2}):/.exec(k); return m ? m[1] : null; }), all: window.KANSHI.length, u: '首' },
      { t: '故事成語', n: hit(function (k) { var m = /^(kj\d{2}):/.exec(k); return m ? m[1] : null; }), all: window.KOJI.length, u: '話' },
      { t: '頻出漢字', n: hit(function (k) { return k.indexOf('kj:') === 0 ? k : null; }), all: window.KANJI.length, u: '字' }
    ];
  }

  function screenKiroku() {
    var s = window.Store.state;
    var chars = s.chars || 0;
    var slatsAll = Math.floor(chars / SLAT_CHARS);
    var maki = Math.floor(slatsAll / MAKI_SLATS);
    var slats = slatsAll % MAKI_SLATS;
    var today = window.Store.recentDays(1)[0];
    var acc = s.answered ? Math.round(s.correct / s.answered * 100) : 0;
    var flds = fieldStats();
    var masteredAll = flds.reduce(function (a, f) { return a + f.mastered; }, 0);
    var totalAll = flds.reduce(function (a, f) { return a + f.total; }, 0);
    var weakN = window.Store.weakKeys().length;

    var fieldHTML = flds.map(function (f) {
      var mp = Math.round(f.mastered / f.total * 100);
      var tp = Math.round(f.touched / f.total * 100);
      var rate = (f.r + f.w) ? Math.round(f.r / (f.r + f.w) * 100) : null;
      return '<div class="fld">' +
        '<div class="fld-h"><b>' + esc(f.t) + '</b>' +
          '<span>' + f.mastered + ' / ' + f.total + ' 習得</span></div>' +
        '<div class="fld-bar"><i class="t" style="width:' + tp + '%"></i><i class="m" style="width:' + mp + '%"></i></div>' +
        '<div class="fld-sub">' + (f.touched ? '挑戦 ' + f.touched + ' 問' + (rate !== null ? '・正答率 ' + rate + '%' : '') : 'まだ手つかず') + '</div>' +
        '</div>';
    }).join('');

    var covHTML = coverage().map(function (c) {
      var pct = Math.round(c.n / c.all * 100);
      return '<div class="cov">' +
        '<div class="cov-ring" style="--p:' + pct + '"><span>' + pct + '<small>%</small></span></div>' +
        '<div class="cov-t">' + esc(c.t) + '</div>' +
        '<div class="cov-n">' + c.n + ' / ' + c.all + ' ' + esc(c.u) + '</div>' +
        '</div>';
    }).join('');

    var foeHTML = window.FOES.map(function (f, i) {
      var got = (s.foesCleared || []).indexOf(f.id) !== -1;
      return '<div class="foe-slot' + (got ? ' got' : '') + '" title="第' + (i + 1) + '関門　' +
          esc(got ? f.name : '未踏') + '">' +
        foeArt(f, got ? 'mini' : 'mini unknown', got ? '破' : '') +
        '<small>' + esc(got ? f.name : '？？？') + '</small></div>';
    }).join('');

    var achHTML = window.Store.ACHIEVEMENTS.map(function (a) {
      var got = s.ach.indexOf(a.id) !== -1;
      return '<div class="ach-item' + (got ? ' got' : '') + '">' +
        '<div class="a-ico">' + esc(a.ico) + '</div>' +
        '<div class="a-t">' + esc(a.t) + '</div>' +
        '<div class="a-d">' + esc(a.d) + '</div></div>';
    }).join('');

    render(
      '<div class="sec-h"><h2>学びの記録</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">戻る</button></div>' +

      /* 今日 */
      '<div class="card rec-today">' +
        '<div class="rt-label">今日読んだ漢文</div>' +
        '<div class="rt-num">' + fmtNum(today.chars) + '<small>字</small></div>' +
        '<p class="rt-say">' + esc(tatoe(today.chars)) + '</p>' +
        '<div class="rt-sub">今日の解答 ' + today.n + ' 問（正解 ' + today.c + '）　／　連続 ' + s.streak + ' 日</div>' +
      '</div>' +

      /* 三つの数字 */
      '<div class="rec-nums">' +
        '<div class="rn"><b>' + fmtNum(chars) + '<small>字</small></b><span>読んだ漢文</span></div>' +
        '<div class="rn"><b>' + fmtNum(masteredAll) + '<small>問</small></b><span>習得した問題</span></div>' +
        '<div class="rn"><b>' + fmtNum(weakN) + '<small>問</small></b><span>要復習</span></div>' +
      '</div>' +

      /* 竹簡 */
      '<div class="card mt">' +
        '<div class="sec-min">綴じた竹簡</div>' +
        '<div class="chikan-head"><b>' + maki + '</b> 巻 と <b>' + slats + '</b> 枚</div>' +
        chikanHTML(slats, MAKI_SLATS) +
        '<p class="muted center" style="margin-top:10px">' +
          '竹簡は一枚におよそ ' + SLAT_CHARS + ' 字、' + MAKI_SLATS + ' 枚で一巻。' +
          'あと ' + (SLAT_CHARS - (chars % SLAT_CHARS)) + ' 字で次の一枚が綴じられます。</p>' +
        '<p class="rt-say center">' + esc(tatoe(chars)) + '</p>' +
      '</div>' +

      /* 墨あと */
      '<div class="card mt">' +
        '<div class="sec-min">日々の墨あと</div>' +
        sumiHTML() +
        '<div class="sumi-legend"><span>12週間前</span><i class="sumi lv0"></i><i class="sumi lv1"></i>' +
          '<i class="sumi lv2"></i><i class="sumi lv3"></i><i class="sumi lv4"></i><i class="sumi lv5"></i><span>今日</span></div>' +
        '<p class="muted center" style="margin-top:8px">たくさん解いた日ほど、墨が濃くなります。</p>' +
        '<div class="stats" style="margin-top:14px">' +
          '<div class="stat"><b>' + window.Store.activeDays() + '</b><span>学んだ日数</span></div>' +
          '<div class="stat"><b>' + s.bestDay + '</b><span>連続日数の最高</span></div>' +
          '<div class="stat"><b>' + hhmm(s.secs || 0) + '</b><span>学習時間の目安</span></div>' +
        '</div>' +
      '</div>' +

      /* 分野別 */
      '<div class="sec-h"><h2>分野別の習熟</h2><div class="rule"></div></div>' +
      '<p class="muted">濃い帯は「習得した問題」（2回以上正解し、正解が誤答を上回るもの）。薄い帯は一度でも解いた問題です。</p>' +
      '<div class="card mt fld-list">' + fieldHTML +
        '<div class="fld-total">合計　' + masteredAll + ' / ' + totalAll + ' 問を習得</div>' +
      '</div>' +

      /* 踏破 */
      '<div class="sec-h"><h2>収録内容の踏破</h2><div class="rule"></div></div>' +
      '<div class="card cov-grid">' + covHTML + '</div>' +

      /* 関門 */
      '<div class="sec-h"><h2>関門の面々</h2><div class="rule"></div></div>' +
      '<div class="card foe-row">' + foeHTML + '</div>' +

      /* 実績 */
      '<div class="sec-h"><h2>称号</h2><div class="rule"></div></div>' +
      '<p class="muted">' + s.ach.length + ' / ' + window.Store.ACHIEVEMENTS.length + ' 個を獲得</p>' +
      '<div class="ach mt">' + achHTML + '</div>' +

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
      (review ? '<div class="sec-h"><h2>まちがえたところ</h2><span class="sec-n">' + (res.wrong || []).length + ' 問</span><div class="rule"></div></div><div class="review">' + review + '</div>' : '') +
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
      kind: 'choice', mode: mode, qs: qs, i: 0, correct: 0, score: 0, combo: 0, maxCombo: 0,
      hp: mode.hearts || 0, wrong: [], locked: false,
      left: mode.perQ || 0, totalLeft: mode.total || 0
    };
    renderChoice();
  }

  function normalHud() {
    var m = G.mode;
    return '<div class="hud"><div class="hud-row">' +
        '<span class="q-no">第' + (G.i + 1) + '問 / ' + G.qs.length + '</span>' +
        (m.hearts ? '<span class="hearts">' + '❤'.repeat(G.hp) + '<span style="opacity:.25">' + '❤'.repeat(m.hearts - G.hp) + '</span></span>' : '') +
        '<span class="sp"></span>' +
        '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '<span class="hud-score">' + G.score + '</span>' +
        '<button class="icon-btn" data-act="quit" title="中断">✕</button>' +
      '</div>' +
      (m.perQ || m.total ? '<div class="timer" id="tm"><i id="tmb" style="width:100%"></i></div>' : '') +
      '</div>';
  }

  /** 相手の水墨画。cls で大きさ・状態を、stamp で朱印の字を変える */
  function foeArt(f, cls, stamp) {
    var art = (window.FOE_ART || {})[f.id] || '';
    return '<span class="foe-figure' + (cls ? ' ' + cls : '') + '">' +
      '<span class="foe-portrait">' + art + '</span>' +
      (stamp ? '<span class="foe-stamp">' + esc(stamp) + '</span>' : '') +
      '</span>';
  }

  /** 「あと何回当てればよいか」を数えられるよう、気は珠で見せる */
  function kiPips(left, max) {
    var s = '';
    for (var i = 0; i < max; i++) s += '<i class="' + (i < left ? 'on' : '') + '"></i>';
    return '<span class="ki-pips' + (left <= 2 ? ' low' : '') + '" ' +
      'role="img" aria-label="相手の気 残り' + left + ' / ' + max + '">' + s + '</span>';
  }

  /** 体力。朱の玉で、残りと失った分をはっきり分ける */
  function lifeDots(left, max, extraCls) {
    var s = '';
    for (var i = 0; i < max; i++) s += '<i class="' + (i < left ? '' : 'gone') + '"></i>';
    return '<span class="life' + (left === 1 ? ' warn' : '') + (extraCls ? ' ' + extraCls : '') + '" ' +
      'role="img" aria-label="残り体力 ' + left + ' / ' + max + '">' + s + '</span>';
  }

  function battleHud() {
    var f = G.foe;
    return '<div class="hud"><div class="bhud">' +
        '<div class="bhud-row">' +
          foeArt(f, 'hud-foe') +
          '<span class="foe-mini">' +
            '<b>' + esc(f.name) + '</b>' +
            kiPips(G.ki, G.kiMax) +
          '</span>' +
          '<span class="ki-label">気 ' + G.ki + '/' + G.kiMax + '</span>' +
          '<button class="icon-btn" data-act="quit" title="中断">✕</button>' +
        '</div>' +
        '<div class="bhud-row life-row">' +
          '<span class="lbl">我が体力</span>' +
          lifeDots(G.hearts, G.maxHearts) +
          '<span class="sp"></span>' +
          '<span class="combo' + (G.combo >= 2 ? ' on' : '') + '">' + G.combo + ' 連鎖</span>' +
        '</div>' +
      '</div>' +
      '<div class="timer" id="tm"><i id="tmb" style="width:100%"></i></div></div>';
  }

  function renderChoice() {
    var m = G.mode, q = G.qs[G.i];
    var hud = G.kind === 'battle' ? battleHud() : normalHud();

    var ch = q.choices.map(function (c, i) {
      return '<button class="choice" data-act="ans" data-i="' + i + '">' +
        '<span class="k">' + '１２３４'.charAt(i) + '</span><span>' + esc(c) + '</span></button>';
    }).join('');

    render(hud +
      '<div class="q-card' + (q.stem ? ' two' : '') + '" id="qc">' +
        (q.stem ?
          '<div class="q-aside">' +
            stemHTML(q.stem) +
            (q.src ? '<div class="q-src">— ' + esc(q.src) + '</div>' : '') +
          '</div>' : '') +
        '<div class="q-main">' +
          '<span class="q-cat">' + esc(q.cat) + '</span>' +
          '<p class="q-text">' + esc(q.q) + '</p>' +
          '<div class="choices">' + ch + '</div>' +
          '<div id="vd"></div>' +
        '</div>' +
      '</div>');

    G.locked = false;
    if (G.kind === 'battle') { G.left = BATTLE_TIME; runTimer(); }
    else if (m.perQ) { G.left = m.perQ; runTimer(); }
    else if (m.total) { runTimer(); }
  }

  function runTimer() {
    stopTick();
    var m = G.mode;
    var bar = el('tmb'), wrap = el('tm');
    if (!bar) return;
    var perQ = G.kind === 'battle' ? BATTLE_TIME : m.perQ;
    tick = setInterval(function () {
      if (!G || G.locked) return;
      if (perQ) {
        G.left -= 0.1;
        var p = Math.max(0, G.left / perQ * 100);
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

    window.Store.record(q.key, ok, kanjiCount(q.stem));
    if (ok) {
      G.correct++;
      G.combo++;
      G.maxCombo = Math.max(G.maxCombo, G.combo);
      var perQ = G.kind === 'battle' ? BATTLE_TIME : G.mode.perQ;
      var timeBonus = perQ ? Math.round(Math.max(0, G.left) / perQ * 40) : 0;
      G.score += 100 + Math.min(100, (G.combo - 1) * 20) + timeBonus;
      if (G.kind === 'battle') G.ki--;
    } else {
      G.combo = 0;
      if (G.kind === 'battle') G.hearts--;
      else if (G.mode.hearts) G.hp--;
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

    /* 道場破りでは、当てた／喰らったを盤面にも返す */
    if (G.kind === 'battle') {
      var pips = $app.querySelector('.ki-pips');
      var life = $app.querySelector('.life');
      var label = $app.querySelector('.ki-label');
      if (ok) {
        var fig = $app.querySelector('.bhud .foe-figure');
        if (fig) { fig.classList.add('hit'); }
        if (pips) {
          var on = pips.querySelectorAll('i.on');
          if (on.length) on[on.length - 1].className = '';
          pips.classList.toggle('low', G.ki <= 2);
          pips.setAttribute('aria-label', '相手の気 残り' + G.ki + ' / ' + G.kiMax);
        }
        if (label) label.textContent = '気 ' + G.ki + '/' + G.kiMax;
      } else if (life) {
        var dots = life.querySelectorAll('i:not(.gone)');
        if (dots.length) dots[dots.length - 1].className = 'gone';
        life.classList.add('dmg');
        life.classList.toggle('warn', G.hearts === 1);
        life.setAttribute('aria-label', '残り体力 ' + G.hearts + ' / ' + G.maxHearts);
      }
    }

    var last = G.kind === 'battle'
      ? (G.hearts <= 0 || G.ki <= 0)
      : ((G.i >= G.qs.length - 1) || (G.mode.hearts && G.hp <= 0));
    var nextLabel = G.kind === 'battle'
      ? (G.hearts <= 0 ? '結果を見る' : G.ki <= 0 ? '関門突破' : '続ける')
      : (last ? '結果を見る' : '次の問題へ');
    /* 相手の一言。手応えが返ってくると、対戦らしくなる */
    var say = '';
    if (G.kind === 'battle') {
      var line = ok
        ? (G.ki <= 0 ? null : G.foe.hit)
        : (G.hearts <= 0 ? null : G.foe.miss);
      if (line) say = '<div class="foe-say">' + foeArt(G.foe) + '<span>「' + esc(line) + '」</span></div>';
    }

    el('vd').innerHTML = say +
      '<div class="verdict ' + (ok ? 'ok' : 'ng') + '">' +
        '<div class="v-h">' + (ok ? '◯ 正解' : '✗ 不正解') +
          (ok && G.combo >= 3 ? '<span style="font-size:12px;color:var(--shu)">' + G.combo + ' 連鎖！</span>' : '') + '</div>' +
        (q.exp ? '<p>' + esc(q.exp) + '</p>' : '') +
        '<div class="btn-row" style="margin-top:12px">' +
          '<button class="btn" data-act="next">' + nextLabel + '</button>' +
        '</div>' +
      '</div>';
    focusVerdict();
  }

  function nextQuestion() {
    if (G.kind === 'battle') {
      if (G.hearts <= 0) return screenBattleEnd(false);
      if (G.ki <= 0) return screenFoeCleared();
      G.i++;
      if (G.i >= G.qs.length) { G.qs = window.QuizGen.pick(foePool(G.foe), 20); G.i = 0; }
      return renderChoice();
    }
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

  /* ============================ ゲーム：道場破り ============================ */
  var BATTLE_TIME = 25;

  /** その関門の担当分野から問題を集める。足りなければ全分野から。 */
  function foePool(foe) {
    if (!foe.cats) return G.master;
    var set = {};
    foe.cats.forEach(function (c) { set[c] = 1; });
    var p = G.master.filter(function (q) { return set[q.cat]; });
    return p.length >= foe.ki + 4 ? p : G.master;
  }

  function startBattle(mode) {
    var cleared = window.Store.state.foesCleared || [];
    var idx = 0;
    while (idx < window.FOES.length && cleared.indexOf(window.FOES[idx].id) !== -1) idx++;
    if (idx >= window.FOES.length) idx = 0;      // 全突破後はもう一巡できる
    G = {
      kind: 'battle', mode: mode, master: window.QuizGen.build('mogi'),
      foeIdx: idx, hearts: 3, maxHearts: 3,
      score: 0, combo: 0, maxCombo: 0, correct: 0, gates: 0,
      wrong: [], locked: false, left: 0, qs: [], i: 0
    };
    screenFoeIntro();
  }

  /** 第一関門から第八関門までの道のり。inline は入れ子のボタン内に置く用 */
  function gateRoad(cur, inline) {
    var cleared = window.Store.state.foesCleared || [];
    var s = '';
    for (var i = 0; i < window.FOES.length; i++) {
      if (i) s += '<span></span>';
      var st = i === cur ? 'now' : cleared.indexOf(window.FOES[i].id) !== -1 ? 'done' : '';
      s += '<i class="' + st + '"></i>';
    }
    var tag = inline ? 'span' : 'div';
    return '<' + tag + ' class="gate-road" role="img" aria-label="第' + (cur + 1) + '関門 / ' +
      window.FOES.length + '">' + s + '</' + tag + '>';
  }

  function screenFoeIntro() {
    var f = window.FOES[G.foeIdx];
    var cleared = (window.Store.state.foesCleared || []).indexOf(f.id) !== -1;
    render(
      '<div class="sec-h"><h2>第' + (G.foeIdx + 1) + '関門 / ' + window.FOES.length + '</h2><div class="rule"></div>' +
        '<button class="btn ghost" data-act="go" data-to="home">やめる</button></div>' +
      gateRoad(G.foeIdx) +
      '<div class="card foe-card">' +
        foeArt(f, 'big') +
        '<div class="foe-name">' + esc(f.name) +
          '<small>' + esc(f.kana) + (cleared ? '　※突破済み' : '') + '</small></div>' +
        '<div class="q-stem-wrap"><div class="q-stem"' + vstyle(f.quote) + '>' + kanbunHTML(f.quote) + '</div></div>' +
        '<p class="q-src">' + esc(f.qyomi) + '　— ' + esc(f.src) + '</p>' +
        '<p class="foe-taunt">「' + esc(f.taunt) + '」</p>' +
        '<div class="foe-facts">' +
          '<b>' + esc(f.cats ? f.cats.join('・') : '全分野') + '</b>' +
          '<b class="shu">正解 ' + f.ki + ' 回で突破</b>' +
          '<b>体力 ' + G.maxHearts + '</b>' +
          '<b>一問 ' + BATTLE_TIME + ' 秒</b>' +
        '</div>' +
        '<div class="btn-row" style="justify-content:center;margin-top:16px">' +
          '<button class="btn shu" data-act="foego">勝負</button></div>' +
      '</div>'
    );
    var b = $app.querySelector('[data-act="foego"]');
    if (b) b.focus();
  }

  function beginFoe() {
    var f = window.FOES[G.foeIdx];
    G.foe = f; G.ki = f.ki; G.kiMax = f.ki;
    G.hearts = G.maxHearts;
    G.qs = window.QuizGen.pick(foePool(f), 20);
    G.i = 0;
    renderChoice();
  }

  function screenFoeCleared() {
    stopTick();
    var f = G.foe;
    var st = window.Store.state;
    st.foesCleared = st.foesCleared || [];
    if (st.foesCleared.indexOf(f.id) === -1) st.foesCleared.push(f.id);
    window.Store.save();
    G.gates++;
    G.score += 300;
    var last = G.foeIdx >= window.FOES.length - 1;
    render(
      '<div class="card result">' +
        gateRoad(G.foeIdx) +
        foeArt(f, 'big beaten', '破') +
        '<div class="gate-clear">第' + (G.foeIdx + 1) + '関門　突破</div>' +
        '<p class="foe-taunt">「' + esc(f.beaten) + '」</p>' +
        '<div class="r-grid">' +
          '<div class="stat"><b>' + G.score + '</b><span>得点</span></div>' +
          '<div class="stat"><b>' + G.maxCombo + '</b><span>最大連鎖</span></div>' +
          '<div class="stat"><b>' + G.hearts + '</b><span>残り体力</span></div>' +
        '</div>' +
        '<p class="muted mt">体力を回復して次へ進みます。</p>' +
        '<div class="btn-row mt" style="justify-content:center">' +
          (last
            ? '<button class="btn shu" data-act="bend">結果を見る</button>'
            : '<button class="btn shu" data-act="foenext">次の関門へ</button>' +
              '<button class="btn ghost" data-act="bend">ここで終える</button>') +
        '</div>' +
      '</div>'
    );
    var b = $app.querySelector('.btn.shu');
    if (b) b.focus();
  }

  function nextFoe() {
    G.foeIdx++;
    if (G.foeIdx >= window.FOES.length) return screenBattleEnd(true);
    screenFoeIntro();
  }

  function screenBattleEnd(win) {
    stopTick();
    var gates = G.gates, score = G.score, combo = G.maxCombo, wrong = G.wrong;
    var reached = G.foeIdx + 1;
    var allDone = (window.Store.state.foesCleared || []).length >= window.FOES.length;
    var m = G.mode;
    G = null;

    var newAch = window.Store.finishSession('battle', {
      score: gates, xp: gates * 60 + Math.floor(score / 20), maxCombo: combo
    });

    var review = wrong.map(function (w) {
      return '<div class="review-item">' +
        (w.stem ? '<div class="ri-stem">' + kanbunHTML(w.stem) + '</div>' : '') +
        '<div class="ri-q">' + esc(w.q) + '</div>' +
        (w.your ? '<div class="ri-y">✗ ' + esc(w.your) + '</div>' : '') +
        '<div class="ri-a">✓ ' + esc(w.answer) + '</div>' +
        (w.exp ? '<div class="ri-e">' + esc(w.exp) + '</div>' : '') +
        '</div>';
    }).join('');

    render(
      '<div class="card result mt">' +
        '<div class="r-rank">' + (win || allDone ? '皆伝' : '第' + reached + '関門') + '</div>' +
        '<div class="r-sub">' + (win || allDone
          ? '八つの関門をすべて突破しました。'
          : 'この回で突破した関門：' + gates + '　／　到達：第' + reached + '関門') + '</div>' +
        '<p class="r-msg">' + (win || allDone
          ? '孔子まで抜いたなら、入試の漢文で困ることはまずありません。'
          : gates > 0 ? '突破した関門は記録されています。次は続きから始まります。'
                      : 'まずは基礎講座と再読文字ドリルで足場を作ってから、もう一度。') + '</p>' +
        '<div class="r-grid">' +
          '<div class="stat"><b>' + score + '</b><span>得点</span></div>' +
          '<div class="stat"><b>' + combo + '</b><span>最大連鎖</span></div>' +
          '<div class="stat"><b>' + (window.Store.state.foesCleared || []).length + ' / ' + window.FOES.length + '</b><span>突破した関門</span></div>' +
        '</div>' +
        '<div class="btn-row mt-l" style="justify-content:center">' +
          '<button class="btn shu" data-act="play" data-id="battle">もう一度</button>' +
          '<button class="btn ghost" data-act="go" data-to="home">ホームへ</button>' +
        '</div>' +
      '</div>' +
      (review ? '<div class="sec-h"><h2>まちがえたところ</h2><span class="sec-n">' + wrong.length + ' 問</span><div class="rule"></div></div><div class="review">' + review + '</div>' : '')
    );
    if (newAch.length) {
      setTimeout(function () { toast('実績を獲得： ' + newAch.map(function (a) { return a.ico + ' ' + a.t; }).join('、')); }, 500);
    }
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
        '<p class="kt-hint">' + (document.documentElement.classList.contains('vert')
          ? '縦書き（上から下へ）' : '横書き（左から右へ）') + '</p>' +
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
        window.Store.record('kt:' + it.id, clean, it.chars.length);
        if (clean) { G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.score += 100 + Math.min(100, (G.combo - 1) * 20); }
        else { G.combo = 0; G.wrong.push({ stem: it.chars.map(function (c) { return c.c; }).join(''), q: it.label + 'の読む順序', answer: it.yomi, exp: it.tip, your: null }); }
        renderKaeriten();
        var last = G.i >= G.items.length - 1;
        el('vd').innerHTML = '<div class="verdict ' + (clean ? 'ok' : 'ng') + '">' +
          '<div class="v-h">' + (clean ? '◯ 完成' : '△ 完成（ミスあり）') + '</div>' +
          '<p><b>' + esc(it.yomi) + '</b></p><p>' + esc(it.tip) + '</p>' +
          '<div class="btn-row" style="margin-top:12px"><button class="btn" data-act="ktnext">' +
          (last ? '結果を見る' : '次の問題へ') + '</button></div></div>';
        focusVerdict();
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
    window.Store.record('ok:' + it.id, ok, it.chars.length);
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
    focusVerdict();
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
      '<div class="q-card two" id="qc">' +
        '<div class="q-aside">' +
          '<div class="q-stem-wrap"><div class="q-stem"' + vstyle(it.kanbun) + '>' + kanbunHTML(it.kanbun) + '</div></div>' +
          '<div class="q-src">— ' + esc(it.src) + '</div>' +
        '</div>' +
        '<div class="q-main">' +
          '<span class="q-cat">書き下し</span>' +
          '<p class="q-text">語のかたまりを並べて、正しい書き下し文を作ってください。</p>' +
          '<div class="nb-slot">' + (slot || '<span class="muted" style="font-size:12px">ここに並べます</span>') + '</div>' +
          '<div class="nb-pool">' + pool + '</div>' +
          (!G.done && G.placed.length === it.parts.length ? '<div class="btn-row mt" style="justify-content:center"><button class="btn shu" data-act="nbjudge">判定する</button></div>' : '') +
          '<div id="vd"></div>' +
        '</div>' +
      '</div>'
    );
  }

  function narabeJudge() {
    var it = G.items[G.i];
    var ok = G.placed.every(function (v, i) { return v === i; });
    G.done = true;
    window.Store.record('nb:' + it.id, ok, kanjiCount(it.kanbun));
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
    focusVerdict();
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
    window.Store.mark();
    stopTick();
    if (m.kind === 'choice') return startChoice(m);
    if (m.kind === 'battle') return startBattle(m);
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
    if (to === 'ach') return screenKiroku();
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
        stopTick();
        ask('中断してホームに戻りますか？　ここまでの解答記録は保存されます。', '中断する', function () {
          window.Store.save(); go('home');
        });
        break;
      case 'foego': beginFoe(); break;
      case 'foenext': nextFoe(); break;
      case 'bend': screenBattleEnd(false); break;
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
      case 'tate': toggleVertical(); break;
      case 'reset':
        ask('すべての学習記録（段位・実績・弱点・関門の突破）を消去します。よろしいですか？', '消去する', function () {
          window.Store.reset(); toast('学習記録をリセットしました'); go('home');
        });
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

  /** 漢文本文の縦書き／横書き */
  function applyVertical() {
    var v = window.Store.state.vertical !== false;
    document.documentElement.classList.toggle('vert', v);
    var btn = el('tate-btn');
    if (btn) {
      btn.textContent = v ? '縦' : '横';
      btn.setAttribute('aria-pressed', v ? 'true' : 'false');
    }
  }
  function toggleVertical() {
    window.Store.state.vertical = window.Store.state.vertical === false;
    window.Store.save();
    applyVertical();
    measureAdvances();
    toast(window.Store.state.vertical ? '漢文を縦書きで表示します' : '漢文を横書きで表示します');
  }

  /** ヘッダーの実寸をCSS変数に流し込む（HUD の sticky 位置に使う） */
  function measureChrome() {
    var bar = document.querySelector('.topbar');
    if (bar) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
    measureAdvances();
  }

  function init() {
    $app = el('app');
    $toast = el('toast');
    /* 水墨画のフィルタ定義。文書に一度だけ置き、各SVGから id で参照する */
    if (window.FOE_ART_DEFS) document.body.insertAdjacentHTML('afterbegin', window.FOE_ART_DEFS);
    window.Store.load();
    applyTheme();
    applyVertical();
    measureChrome();
    var first = window.Store.touchDay();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', measureChrome);
    window.addEventListener('orientationchange', function () { setTimeout(measureChrome, 200); });
    screenHome();
    if (first && window.Store.state.streak > 1) {
      setTimeout(function () { toast('連続学習 ' + window.Store.state.streak + ' 日目。今日も一問から。'); }, 700);
    }
  }

  // レイアウト検証用のフック（テストからのみ使う）
  window.__peek = function () { return G; };
  window.__renderStem = function (stem) {
    render('<div class="q-card two"><div class="q-aside">' + stemHTML(stem) +
      '</div><div class="q-main"><p class="q-text">検証</p></div></div>');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
