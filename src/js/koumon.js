/* 楚漢の章 —— 物語の進行・画面・保存・小さな遊び・音
 *
 * 画面の作りは寝殿造り3D探訪の再現モード「徒然草」にならう。
 *   全画面の舞台の絵／上下の黒帯／上端の札（作品・題・段・目次・絵を見る・音・✕）／
 *   下端の漆に金縁の本文パネル（和紙に縦組みの本文＋現代語訳＋注）／場面転換の暗転・白転。
 * そこに RPG の要素を足す。
 *   命（読み違えで減る）・項王の怒気・范増の殺気・策（張良に問うヒント）・持ち物・結末帳・原文帳。
 *
 * 記録は漢文道場の本体（kanbun-dojo:v1）とは別のキーに置く。
 * 本体へは「読んだ字数」と「解答数」、物語の完走（finishSession）だけを渡す。
 */
(function () {
  'use strict';

  var KEY = 'kanbun-dojo:koumon:v1';
  var K = null, ST = null;
  var NODES = {}, ORDER = [];
  var meta = null, st = null;
  var $root = null, el = {};
  var mode = '', typing = null, cur = null, onExit = null, timerId = null, cardTimer = null;

  /* ============================ 記録 ============================ */
  function blankMeta() {
    return { v: 1, save: null, endings: {}, gen: {}, cleared: {}, sound: false, plays: 0, best: null, view: '' };
  }
  function loadMeta() {
    meta = blankMeta();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') Object.keys(meta).forEach(function (k) {
          if (k === 'save' || k === 'best') { if (p[k] && typeof p[k] === 'object') meta[k] = p[k]; }
          else if (p[k] !== undefined && typeof p[k] === typeof meta[k]) meta[k] = p[k];
        });
      }
    } catch (e) { /* 壊れた記録は使わない */ }
    if (meta.save && (!meta.save.node || !NODES[meta.save.node])) meta.save = null;
    ['endings', 'gen', 'cleared'].forEach(function (k) { if (!meta[k] || typeof meta[k] !== 'object' || Array.isArray(meta[k])) meta[k] = {}; });
  }
  function saveMeta() {
    try { localStorage.setItem(KEY, JSON.stringify(meta)); return true; }
    catch (e) { if (window.dispatchEvent && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('save-error')); return false; }
  }

  function freshState(chapterId) {
    var s = { node: '', ch: chapterId || 'c0', life: 3, maxLife: 3, ikari: 40, satsu: 40, saku: 3, flags: {}, items: [],
      streak: 0, q: 0, ok: 0, hints: 0, picks: [], log: [], cp: null };
    var idx = chapIndex(s.ch);
    // 途中の章から始めるときは、それまでの場面を史記どおりに選んだものとする
    if (idx >= 2) { s.flags.kyodai = true; s.flags.honest = true; }
    if (idx >= 3) { s.flags.mushou = true; s.flags.meters = true; s.ikari = 10; s.satsu = 45; }
    if (idx >= 6) { s.ikari = 0; }
    return s;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ============================ 台本の索引 ============================ */
  function chapIndex(id) { for (var i = 0; i < K.chapters.length; i++) if (K.chapters[i].id === id) return i; return 0; }
  function chap(id) { return K.chapters[chapIndex(id)]; }
  function buildIndex() {
    NODES = {}; ORDER = [];
    K.chapters.forEach(function (c) {
      var arr = K.script[c.id] || [];
      arr.forEach(function (n, i) {
        if (!n.t) n.t = n.go && !n.x ? 'go' : 'say';
        if (!n.id) n.id = c.id + '-' + i;
        NODES[n.id] = { n: n, ch: c.id, i: i };
        ORDER.push(n.id);
      });
    });
    K.chapters.forEach(function (c) {
      var arr = K.script[c.id] || [];
      arr.forEach(function (n, i) {
        if (n.next || n.t === 'end' || n.t === 'go' || n.t === 'if') return;
        if (i + 1 < arr.length) n._next = arr[i + 1].id;
        else if (c.next) n._next = chap(c.next).start;
      });
    });
  }
  function nextOf(n) { return n.next || n._next || null; }

  /* ============================ 表示の小道具 ============================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kanbunHTML(s) {
    var toks = window.Learning ? window.Learning.tokens(String(s || '')) : String(s || '').split('').map(function (c) { return { c: c }; });
    return toks.map(function (t) {
      return t.mark ? '<span class="kc">' + esc(t.c) + '<i class="mark">' + esc(t.mark) + '</i></span>' + esc(t.okuri || '') : esc(t.c) + esc(t.okuri || '');
    }).join('');
  }
  function kanjiCount(s) {
    var m = String(s || '').replace(/\^(一レ|上レ|甲レ|レ|一|二|三|四|上|中|下|甲|乙|丙)/g, '').match(/[㐀-䶿一-鿿]/g);
    return m ? m.length : 0;
  }
  function who(id) {
    if (!id) return null;
    if (id === 'you') {
      var nm = st && st.ch === 'c8' ? '項王' : st && st.ch === 'c9' ? '高祖' : '沛公';
      return { name: nm + '（心の声）', seal: '心', side: st && st.ch === 'c8' ? 'so' : 'han' };
    }
    return K.chars[id] || null;
  }
  function speakerHTML(id) {
    var c = who(id);
    if (!c) return '<div class="km-speaker narr">　</div>';
    return '<div class="km-speaker"><span class="km-seal km-' + c.side + '">' + esc(c.seal) + '</span><b>' + esc(c.name) + '</b></div>';
  }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* ============================ 音（合成） ============================ */
  var AC = null, amb = null;
  function ac() {
    if (!meta.sound) return null;
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch (e) { return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function noiseBuf(a, sec) {
    var b = a.createBuffer(1, Math.floor(a.sampleRate * sec), a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(a, node, t0, peak, att, dec) {
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + att + dec);
    node.connect(g); g.connect(a.destination);
    return g;
  }
  function tone(a, type, f, t0, peak, att, dec, f2) {
    var o = a.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + att + dec);
    env(a, o, t0, peak, att, dec);
    o.start(t0); o.stop(t0 + att + dec + .05);
  }
  function noise(a, t0, peak, att, dec, ftype, freq, q) {
    var s = a.createBufferSource(); s.buffer = noiseBuf(a, att + dec + .05);
    var f = a.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.value = freq || 800; if (q) f.Q.value = q;
    s.connect(f); env(a, f, t0, peak, att, dec);
    s.start(t0);
  }
  function pluck(a, freq, t0, vol) {
    var sr = a.sampleRate, n = Math.round(sr / freq), len = Math.floor(sr * 2.2);
    var b = a.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(n);
    for (var i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    for (i = 0; i < len; i++) { var j = i % n; var v = ring[j]; ring[j] = (v + ring[(j + 1) % n]) * .498; d[i] = v; }
    var s = a.createBufferSource(); s.buffer = b;
    var g = a.createGain(); g.gain.value = vol || .25;
    s.connect(g); g.connect(a.destination); s.start(t0);
  }
  var SFX = {
    drum: function (a, t) { tone(a, 'sine', 120, t, .7, .005, .7, 42); noise(a, t, .25, .003, .18, 'lowpass', 300); },
    clang: function (a, t) { [1240, 1870, 2960, 4100].forEach(function (f, i) { tone(a, i % 2 ? 'square' : 'triangle', f, t, .07, .002, .7 - i * .1); }); noise(a, t, .2, .001, .06, 'highpass', 3000); },
    hoof: function (a, t) { for (var i = 0; i < 6; i++) noise(a, t + i * .17 + (i % 2) * .04, .35, .002, .07, 'lowpass', 260); },
    thud: function (a, t) { tone(a, 'sine', 80, t, .7, .003, .35, 40); noise(a, t, .4, .002, .15, 'lowpass', 500); },
    chime: function (a, t) { tone(a, 'sine', 1568, t, .2, .002, 1.6); tone(a, 'sine', 2350, t, .08, .002, 1.1); },
    shatter: function (a, t) { for (var i = 0; i < 9; i++) { noise(a, t + i * .025, .25, .001, .05 + Math.random() * .1, 'highpass', 2500 + Math.random() * 3000); } tone(a, 'sine', 2960, t, .12, .001, .9); },
    pluck: function (a, t) { [293.7, 349.2, 392, 440, 523.3].forEach(function (f, i) { pluck(a, f, t + i * .32, .22); }); },
    song: function (a, t) {
      // 遠くから聞こえる楚の歌（五音音階の旋律を、こもった声のように）
      var mel = [392, 440, 523.3, 440, 392, 349.2, 392, 293.7, 349.2, 392];
      mel.forEach(function (f, i) {
        var o = a.createOscillator(), o2 = a.createOscillator(); o.type = 'sawtooth'; o2.type = 'sine';
        o.frequency.value = f; o2.frequency.value = f * 1.003;
        var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        o.connect(lp); o2.connect(lp);
        var g = env(a, lp, t + i * .55, .05, .18, .5);
        void g;
        o.start(t + i * .55); o2.start(t + i * .55); o.stop(t + i * .55 + .8); o2.stop(t + i * .55 + .8);
      });
    }
  };
  function sfx(name) {
    var a = ac(); if (!a || !SFX[name]) return;
    try { SFX[name](a, a.currentTime + .02); } catch (e) { /* 鳴らせなくても進行は止めない */ }
  }
  function ambience(kind) {
    stopAmbience();
    var a = ac(); if (!a || !kind) return;
    try {
      var s = a.createBufferSource(); s.buffer = noiseBuf(a, 4); s.loop = true;
      var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'in' ? 300 : 500; f.Q.value = .6;
      var g = a.createGain(); g.gain.value = kind === 'in' ? .015 : .035;
      var lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .08; lg.gain.value = kind === 'in' ? 60 : 260;
      lfo.connect(lg); lg.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(a.destination);
      s.start(); lfo.start();
      amb = { s: s, lfo: lfo, g: g };
    } catch (e) { amb = null; }
  }
  function stopAmbience() {
    if (!amb) return;
    try { amb.g.gain.setTargetAtTime(0, AC.currentTime, .3); amb.s.stop(AC.currentTime + 1); amb.lfo.stop(AC.currentTime + 1); } catch (e) { /* 既に止まっている */ }
    amb = null;
  }

  /* ============================ 画面の骨組み ============================ */
  function build() {
    $root = document.createElement('div');
    $root.id = 'km';
    $root.className = 'km';
    $root.setAttribute('role', 'dialog');
    $root.setAttribute('aria-label', K.title + '　' + K.subtitle);
    $root.innerHTML =
      '<canvas class="km-cv" aria-hidden="true"></canvas>' +
      '<div class="km-ov" aria-hidden="true"></div>' +
      '<div class="km-bar km-bar-t"></div><div class="km-bar km-bar-b"></div>' +
      '<div class="km-fade"></div>' +
      '<div class="km-caption" aria-live="polite"></div>' +
      '<div class="km-top">' +
        '<div class="km-chip"><span class="km-k">作</span>史記</div>' +
        '<div class="km-chip km-title-chip" id="km-title">楚漢の章</div>' +
        '<button class="km-chip km-btn-chip" data-km="menu">目次</button>' +
        '<button class="km-chip km-btn-chip" data-km="book">原文帳</button>' +
        '<button class="km-chip km-btn-chip" data-km="log">履歴</button>' +
        '<button class="km-chip km-btn-chip" data-km="view" title="本文を隠して場面の絵だけを見る（H キー）">絵を見る</button>' +
        '<button class="km-chip km-btn-chip" data-km="sound" id="km-sound" aria-pressed="false">音 切</button>' +
      '</div>' +
      '<button class="km-quit" data-km="quit" title="楚漢の章を閉じる" aria-label="閉じる">✕</button>' +
      '<div class="km-status" id="km-status"></div>' +
      '<div class="km-cap"><div class="km-panel" id="km-panel"></div></div>' +
      '<div class="km-card" id="km-card"></div>' +
      '<div class="km-modal" id="km-modal" hidden></div>';
    document.body.appendChild($root);
    el.cv = $root.querySelector('.km-cv');
    el.ov = $root.querySelector('.km-ov');
    el.fade = $root.querySelector('.km-fade');
    el.caption = $root.querySelector('.km-caption');
    el.panel = $root.querySelector('#km-panel');
    el.status = $root.querySelector('#km-status');
    el.card = $root.querySelector('#km-card');
    el.modal = $root.querySelector('#km-modal');
    el.title = $root.querySelector('#km-title');
    el.sound = $root.querySelector('#km-sound');
    mountStage();
    $root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
  }
  function onResize() { if ($root && ST) ST.resize(); }

  /** 舞台の描き方を選ぶ。3D が使えて、影絵（軽量）を選んでいなければ 3D */
  function mountStage() {
    var want3d = meta.view !== '2d' && window.KoumonStage3D && window.KoumonStage3D.supported();
    if (ST && ST.stop) { ST.stop(); if (ST.clearLabels) ST.clearLabels(); if (ST.hideBubble) ST.hideBubble(); }
    // 一枚の canvas は 2D と WebGL を兼ねられないので、描き方を変えるたびに作り直す
    var fresh = document.createElement('canvas');
    fresh.className = 'km-cv'; fresh.setAttribute('aria-hidden', 'true');
    el.cv.parentNode.replaceChild(fresh, el.cv);
    el.cv = fresh;
    if (want3d && window.KoumonStage3D.mount(el.cv, el.ov)) { ST = window.KoumonStage3D; }
    else {
      if (want3d) { fresh = document.createElement('canvas'); fresh.className = 'km-cv'; el.cv.parentNode.replaceChild(fresh, el.cv); el.cv = fresh; }
      ST = window.KoumonStage; ST.mount(el.cv, el.ov);
    }
    $root.classList.toggle('km-3d', !!ST.is3D);
  }

  function open(opts) {
    K = window.KOUMON;
    if (!K || !window.KoumonStage) return;
    onExit = opts && opts.onExit;
    buildIndex();
    loadMeta();
    if (!$root) build();
    $root.hidden = false;
    ST.resize();
    document.documentElement.classList.add('km-open');
    updateSoundChip();
    ST.start();
    titleScreen();
  }
  function close() {
    stopTimer();
    stopAmbience();
    if (st) persist();
    if (window.KoumonStage) window.KoumonStage.stop();
    if ($root) $root.hidden = true;
    document.documentElement.classList.remove('km-open');
    if (onExit) onExit();
  }

  function persist() {
    if (st && st.node) meta.save = clone(st);
    saveMeta();
  }

  /* ============================ 表紙 ============================ */
  function titleScreen() {
    st = null; mode = 'title';
    Promise.resolve(ST.setScene('koumon', 'night', ['u', 'zo'], {})).then(function () {
      ST.focus('wide');
      if (ST.prewarm) ST.prewarm(['hai', 'ryo', 'msg', 'haku', 'kai', 'ei', 'sou', 'chin']);
    });
    $root.classList.add('km-at-title');
    $root.classList.remove('km-view');
    el.status.innerHTML = '';
    el.caption.textContent = '';
    el.title.textContent = K.title;
    var endN = Object.keys(meta.endings).length, endAll = Object.keys(K.endings).length;
    var genN = Object.keys(meta.gen).length, genAll = Object.keys(K.genbun).length;
    var save = meta.save;
    el.panel.innerHTML =
      '<div class="km-titlecard">' +
        '<div class="km-t-src">' + esc(K.src) + '</div>' +
        '<h2 class="km-t-h">' + esc(K.title) + '</h2>' +
        '<div class="km-t-sub">' + esc(K.subtitle) + '</div>' +
        '<p class="km-t-lead">あなたは沛公・劉邦。四十万の楚軍が待つ鴻門の宴へ、百余騎で向かう。言葉を一つ読み違えれば、命はない。</p>' +
        '<div class="km-t-btns">' +
          (save ? '<button class="km-btn gold" data-km="continue">続きから<small>' + esc(chap(save.ch).no + '　' + chap(save.ch).title) + '</small></button>' : '') +
          '<button class="km-btn' + (save ? '' : ' gold') + '" data-km="new">はじめから</button>' +
          '<button class="km-btn" data-km="menu">章を選ぶ</button>' +
          '<button class="km-btn" data-km="book">原文帳<small>' + genN + ' / ' + genAll + ' 段</small></button>' +
          '<button class="km-btn" data-km="endings">結末帳<small>' + endN + ' / ' + endAll + '</small></button>' +
          '<button class="km-btn" data-km="howto">遊び方</button>' +
        '</div>' +
        '<div class="km-viewsel" role="group" aria-label="表示">' +
          '<span>表示</span>' +
          '<button class="km-tab' + (ST.is3D ? ' on' : '') + '" data-km="view3d" aria-pressed="' + !!ST.is3D + '"' + (window.KoumonStage3D && window.KoumonStage3D.supported() ? '' : ' disabled') + '>3D</button>' +
          '<button class="km-tab' + (ST.is3D ? '' : ' on') + '" data-km="view2d" aria-pressed="' + !ST.is3D + '">影絵（軽量）</button>' +
        '</div>' +
      '</div>';
    mode = 'title';
  }

  function startNew(chId) {
    $root.classList.remove('km-at-title');
    st = freshState(chId || 'c0');
    meta.plays++;
    if (window.Store) window.Store.mark();
    go(chap(st.ch).start);
  }
  function continueSave() {
    if (!meta.save) return startNew('c0');
    $root.classList.remove('km-at-title');
    st = clone(meta.save);
    var n = NODES[st.node];
    // 途中の場面へ戻るときは、その章の舞台を描き直してから続ける
    var sc = lastScene(st.node);
    if (sc && sc.n !== n.n) applyScene(sc.n, true).then(function () { go(st.node, true); });
    else go(st.node, true);
  }
  function lastScene(id) {
    var at = NODES[id]; if (!at) return null;
    var arr = K.script[at.ch];
    for (var i = at.i; i >= 0; i--) if (arr[i].t === 'scene') return NODES[arr[i].id];
    return null;
  }

  /* ============================ 進行 ============================ */
  function go(id, resuming) {
    stopTimer();
    if (!id || !NODES[id]) { titleScreen(); return; }
    var at = NODES[id], n = at.n;
    if (st.ch !== at.ch) {
      // 章が変わった：前の章を読み終えたことにする
      meta.cleared[st.ch] = true;
      st.ch = at.ch;
    }
    st.node = id;
    if (n.cp && !resuming) { st.node = id; st.cp = { node: id, snap: snapshot() }; }
    cur = n;
    if (n.t !== 'end') persist();
    el.title.textContent = chap(st.ch).no + '　' + chap(st.ch).title;
    renderStatus();
    switch (n.t) {
      case 'scene': return doScene(n);
      case 'say': return doSay(n);
      case 'gen': return doGen(n);
      case 'ask': return doAsk(n);
      case 'if': return go(test(n) ? n.go : n.el);
      case 'set': apply(n); return go(nextOf(n));
      case 'go': return go(n.go);
      case 'game': return doGame(n);
      case 'end': return doEnd(n.e);
    }
  }
  function snapshot() { var s = clone(st); s.cp = null; return s; }
  function test(n) {
    if (n.f) return !!st.flags[n.f];
    if (n.ikari !== undefined) return st.ikari >= n.ikari;
    if (n.satsu !== undefined) return st.satsu >= n.satsu;
    return false;
  }
  function apply(o) {
    if (!o) return;
    var fx = o.fx && typeof o.fx === 'object' ? o.fx : null;
    if (fx) {
      if (fx.ikari) st.ikari = Math.max(0, Math.min(120, st.ikari + fx.ikari));
      if (fx.satsu) st.satsu = Math.max(0, Math.min(120, st.satsu + fx.satsu));
      if (fx.saku) st.saku = Math.max(0, Math.min(5, st.saku + fx.saku));
      if (fx.life) st.life = Math.max(0, Math.min(st.maxLife, st.life + fx.life));
    }
    if (o.set) Object.keys(o.set).forEach(function (k) { st.flags[k] = o.set[k]; });
    if (o.give) o.give.forEach(function (it) { if (st.items.indexOf(it) === -1) st.items.push(it); });
    if (o.take) st.items = st.items.filter(function (it) { return o.take.indexOf(it) === -1; });
    renderStatus();
  }
  function logLine(w, x) {
    st.log.push([w || '', x]);
    if (st.log.length > 120) st.log.shift();
  }

  /* ---------- 舞台 ---------- */
  function applyScene(n, quiet) {
    var indoor = /tent|feast|nangong/.test(n.stage);
    if (meta.sound) ambience(indoor ? 'in' : 'out');
    return Promise.resolve(ST.setScene(n.stage, n.light, n.cast || [], n.pose || {})).then(function () {
      ST.focus('wide');
      if (!quiet && n.sfx) sfx(n.sfx);
    });
  }
  function fadeOver(kind, fn) {
    var f = el.fade;
    f.className = 'km-fade ' + (kind === 'white' ? 'white' : '') + ' show';
    void f.offsetWidth;
    setTimeout(function () {
      fn();
      f.classList.remove('show');
    }, reduced() ? 10 : 360);
  }
  function doScene(n) {
    if (n.set) apply(n);
    var after = function () {
      applyScene(n).then(function () {
        if (cur !== n) return; // 準備のあいだに別の場面へ移った
        if (n.caption) showCaption(n.caption);
        if (n.card) showCard(chap(st.ch), function () { go(nextOf(n)); });
        else go(nextOf(n));
      });
    };
    el.panel.innerHTML = '';
    mode = 'scene';
    if (n.fade) fadeOver(n.fade, after); else after();
  }
  function showCaption(text) {
    el.caption.textContent = text;
    el.caption.classList.add('on');
    clearTimeout(showCaption.t);
    showCaption.t = setTimeout(function () { el.caption.classList.remove('on'); }, 4200);
  }
  function showCard(c, done) {
    mode = 'card';
    el.card.innerHTML = '<div class="km-card-in"><div class="km-card-no">' + esc(c.no) + '</div><div class="km-card-t">' + esc(c.title) + '</div><div class="km-card-sub">' + esc(c.sub) + '</div><div class="km-card-tap">画面をタップして始める</div></div>';
    el.card.classList.add('on');
    var finished = false;
    function fin() {
      if (finished) return; finished = true;
      clearTimeout(cardTimer);
      el.card.classList.remove('on');
      done();
    }
    showCard.fin = fin;
    cardTimer = setTimeout(fin, reduced() ? 1600 : 3600);
  }

  /* ---------- 台詞 ---------- */
  function doSay(n) {
    mode = 'say';
    if (n.pose) Object.keys(n.pose).forEach(function (k) { ST.setPose(k, n.pose[k]); });
    if (n.at) ST.focus(n.at);
    if (typeof n.fx === 'string') ST.effect(n.fx);
    if (n.sfx) sfx(n.sfx);
    if (n.b && n.w && n.w !== 'you') ST.showBubble(n.w, { anger: '！！', hush: '……', think: '（……）' }[n.b] || '……', n.b);
    else if (n.b === 'think' && n.at && n.at !== 'wide') ST.showBubble(n.at, '（……）', 'think');
    else ST.hideBubble();
    logLine(n.w, n.x);
    el.panel.innerHTML = speakerHTML(n.w) +
      '<div class="km-text' + (n.w ? '' : ' narr') + (n.w === 'you' ? ' inner' : '') + '" id="km-text"></div>' +
      '<div class="km-nav"><span class="km-hint-key">タップ／Enter で次へ</span><button class="km-btn gold km-next" data-km="next">次へ ▶</button></div>';
    typeText(document.getElementById('km-text'), n.x);
  }
  function typeText(node, text) {
    if (typing) { clearInterval(typing.id); typing = null; }
    if (reduced()) { node.textContent = text; return; }
    var i = 0;
    node.textContent = '';
    typing = { node: node, text: text, id: setInterval(function () {
      i += 2;
      node.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typing.id); typing = null; }
    }, 28) };
  }
  function advance() {
    if (mode === 'card') { if (showCard.fin) showCard.fin(); return; }
    if (mode === 'say') {
      if (typing) { clearInterval(typing.id); typing.node.textContent = typing.text; typing = null; return; }
      ST.hideBubble();
      go(nextOf(cur));
    } else if (mode === 'react') {
      go(cur._after);
    }
  }

  /* ---------- 原文の段 ---------- */
  function doGen(n) {
    mode = 'gen';
    ST.hideBubble();
    var g = K.genbun[n.g];
    var first = !meta.gen[n.g];
    if (first) {
      meta.gen[n.g] = true;
      saveMeta();
      if (window.Store && window.Store.addChars) window.Store.addChars(kanjiCount(g.hakubun));
    }
    renderGen(n.g, st.genView || 'yomi', first);
  }
  function genPaperHTML(g, view) {
    var body = view === 'haku' ? g.hakubun : g.yomi;
    if (g.poem) {
      // 詩の部分だけ句ごとの列にする
      return '<div class="km-vt km-paper-text">' + esc(body).replace(/／/g, '<br>') + '</div>';
    }
    return '<div class="km-vt km-paper-text">' + esc(body) + '</div>';
  }
  /** 教科書（古典探究）の本文か、物語のために補った段か */
  function tbTag(g) {
    if (g.tb === true) return '<span class="km-tb">教科書</span>';
    if (g.tb === 'part') return '<span class="km-tb part">一部 教科書</span>';
    return '<span class="km-tb extra">補</span>';
  }
  function renderGen(gid, view, first) {
    var g = K.genbun[gid];
    st.genView = view;
    el.panel.innerHTML =
      '<div class="km-gen-h"><span class="km-gen-tag">原文の段</span><b>' + esc(g.title) + '</b><span class="km-gen-src">' + esc(g.src) + '</span>' + tbTag(g) +
        (first ? '<span class="km-new">原文帳に綴じた</span>' : '') + '</div>' +
      '<div class="km-tabs" role="tablist">' +
        '<button role="tab" aria-selected="' + (view === 'yomi') + '" class="km-tab' + (view === 'yomi' ? ' on' : '') + '" data-km="genview" data-v="yomi" data-g="' + gid + '">書き下し文</button>' +
        '<button role="tab" aria-selected="' + (view === 'haku') + '" class="km-tab' + (view === 'haku' ? ' on' : '') + '" data-km="genview" data-v="haku" data-g="' + gid + '">白文</button>' +
      '</div>' +
      '<div class="km-paper" tabindex="0" aria-label="本文（縦書き。横にスクロールできます）">' + genPaperHTML(g, view) + '</div>' +
      '<div class="km-yaku-label">現代語訳</div>' +
      '<div class="km-yaku">' + esc(g.yaku) + '</div>' +
      '<div class="km-note">' + esc(g.note) + '</div>' +
      '<div class="km-nav"><span class="km-hint-key">本文は横にスクロールできます</span><button class="km-btn gold km-next" data-km="gennext">次へ ▶</button></div>';
  }

  /* ---------- 選択 ---------- */
  function doAsk(n) {
    mode = 'ask';
    ST.hideBubble();
    if (n.at) ST.focus(n.at); else if (n.w && n.w !== 'you') ST.focus(n.w);
    var opts = n.o.map(function (o, i) { return { o: o, i: i }; });
    if (n.k === 'read') opts = shuffle(opts, n.id);
    n._order = opts.map(function (x) { return x.i; });
    var canHint = n.k === 'read' && n.hint;
    el.panel.innerHTML =
      '<div class="km-ask-h">' + (n.k === 'read' ? '<span class="km-ask-tag read">読み解け</span>' : '<span class="km-ask-tag judge">決断</span>') +
        '<span class="km-ask-q">' + esc(n.q) + '</span></div>' +
      (n.stem ? '<div class="km-stem-wrap"><div class="km-vt km-stem">' + kanbunHTML(n.stem) + '</div></div>' : '') +
      (n.timer ? '<div class="km-timer"><i id="km-timer-bar"></i></div>' : '') +
      '<div class="km-opts">' + opts.map(function (x, k) {
        return '<button class="km-opt" data-km="pick" data-i="' + x.i + '"><span class="km-opt-n">' + '一二三四'.charAt(k) + '</span><span>' + esc(x.o.x) + '</span></button>';
      }).join('') + '</div>' +
      (canHint ? '<div class="km-nav"><button class="km-btn km-hint-btn" data-km="hint"' + (st.saku > 0 ? '' : ' disabled') + '>' + esc(hintWho()) + 'に問う<small>策 残り ' + st.saku + '</small></button></div><div class="km-hint" id="km-hint" hidden></div>' : '');
    if (n.timer && !reduced()) startTimer(n);
  }
  function hintWho() { return st.ch === 'c8' ? '虞' : st.ch === 'c9' ? '蕭何' : '子房（張良）'; }
  function shuffle(arr, seedStr) {
    var a = arr.slice(), seed = 0;
    String(seedStr + (st ? st.q : 0)).split('').forEach(function (c) { seed = (seed * 31 + c.charCodeAt(0)) >>> 0; });
    for (var i = a.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) >>> 0; var j = seed % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function startTimer(n) {
    var bar = document.getElementById('km-timer-bar'), t0 = Date.now(), dur = n.timer * 1000;
    timerId = setInterval(function () {
      var u = (Date.now() - t0) / dur;
      if (bar) bar.style.transform = 'scaleX(' + Math.max(0, 1 - u) + ')';
      if (u >= 1) {
        stopTimer();
        if (n.timeout) { logLine('', '（動けなかった）'); go(n.timeout); }
      }
    }, 100);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function useHint() {
    var n = cur;
    if (!n || n.t !== 'ask' || st.saku <= 0 || n._hinted) return;
    n._hinted = true;
    st.saku--; st.hints++;
    renderStatus();
    var h = document.getElementById('km-hint');
    if (h) { h.hidden = false; h.innerHTML = speakerHTML(st.ch === 'c8' ? 'gu' : st.ch === 'c9' ? null : 'ryo') + '<p>' + esc(n.hint) + '</p>'; }
    var b = $root.querySelector('[data-km="hint"]'); if (b) b.disabled = true;
    persist();
  }

  function pick(i) {
    var n = cur; if (!n || n.t !== 'ask' || mode !== 'ask') return;
    stopTimer();
    var o = n.o[i]; if (!o) return;
    n._hinted = false;
    if (n.k === 'read') return judgeRead(n, o);
    st.picks.push({ q: n.q, a: o.x, ch: st.ch });
    if (st.picks.length > 40) st.picks.shift();
    logLine('you', o.x);
    apply(o);
    var to = o.go || nextOf(n);
    if (o.r) {
      mode = 'react';
      cur = { _after: to };
      el.panel.innerHTML = speakerHTML(o.rw || null) + '<div class="km-text' + (o.rw ? '' : ' narr') + '">' + esc(o.r) + '</div>' +
        '<div class="km-nav"><span class="km-hint-key">タップ／Enter で次へ</span><button class="km-btn gold km-next" data-km="next">次へ ▶</button></div>';
      logLine(o.rw || '', o.r);
      persist();
      return;
    }
    go(to);
  }

  function judgeRead(n, o) {
    mode = 'feedback';
    var ok = !!o.ok, safe = !!chap(st.ch).safe;
    st.q++;
    if (ok) { st.ok++; st.streak++; } else st.streak = 0;
    apply(o);
    var lifeNote = '';
    if (!ok && !safe) {
      st.life = Math.max(0, st.life - 1);
      lifeNote = '<div class="km-life-note">読み違えた。命が一つ削られた。</div>';
    }
    if (ok && st.streak > 0 && st.streak % 3 === 0 && st.life < st.maxLife && !safe) {
      st.life++;
      lifeNote = '<div class="km-life-note up">三つ続けて読み解いた。命が一つ戻った。</div>';
    }
    if (window.Store && window.Store.record) window.Store.record(null, ok, kanjiCount(n.stem || ''));
    renderStatus();
    var right = n.o.filter(function (x) { return x.ok; })[0];
    var kuho = n.kuho && window.KUHO ? window.KUHO.filter(function (k) { return k.id === n.kuho; })[0] : null;
    // 選んだ選択肢・正解に印をつける
    $root.querySelectorAll('.km-opt').forEach(function (b) {
      var bi = Number(b.getAttribute('data-i'));
      b.disabled = true;
      if (n.o[bi].ok) b.classList.add('ok');
      else if (n.o[bi] === o) b.classList.add('ng');
    });
    var fb = document.createElement('div');
    fb.className = 'km-fb ' + (ok ? 'ok' : 'ng');
    fb.innerHTML = '<div class="km-fb-h">' + (ok ? '◯ 読み解いた' : '✕ 読み違えた') + '</div>' +
      (ok ? '' : '<div class="km-fb-right">正しくは：' + esc(right ? right.x : '') + '</div>') +
      '<p>' + esc(n.exp || '') + '</p>' +
      (kuho ? '<div class="km-kuho"><span class="km-kuho-tag">句法</span><b>' + esc(kuho.form) + '</b>　' + esc(kuho.read || '') + '<br><small>' + esc(kuho.mean || '') + '</small></div>' : '') +
      lifeNote +
      '<div class="km-nav"><span></span><button class="km-btn gold km-next" data-km="fbnext">次へ ▶</button></div>';
    var old = $root.querySelector('.km-hint-btn'); if (old) old.parentNode.parentNode.removeChild(old.parentNode);
    el.panel.appendChild(fb);
    fb.scrollIntoView({ block: 'nearest' });
    var nb = fb.querySelector('.km-next'); if (nb) nb.focus({ preventScroll: true });
    persist();
  }
  function afterFeedback() {
    if (st.life <= 0) return doEnd('B8');
    go(nextOf(cur));
  }

  /* ---------- 状態表示 ---------- */
  function renderStatus() {
    if (!st) { el.status.innerHTML = ''; return; }
    var safe = chap(st.ch).safe;
    var hearts = '';
    for (var i = 0; i < st.maxLife; i++) hearts += '<i class="' + (i < st.life ? 'on' : '') + '"></i>';
    var meters = st.flags.meters && !safe && chapIndex(st.ch) <= 7;
    function meter(label, v, cls) {
      var p = Math.max(0, Math.min(100, v));
      return '<div class="km-meter ' + cls + (p >= 75 ? ' hot' : '') + '" title="' + label + ' ' + p + '"><span>' + label + '</span><b><i style="width:' + p + '%"></i></b></div>';
    }
    el.status.innerHTML =
      (safe ? '' : '<div class="km-life" aria-label="命 ' + st.life + '">' + '<span>命</span>' + hearts + '</div>') +
      (meters ? meter('項王の怒気', st.ikari, 'ikari') + meter('范増の殺気', st.satsu, 'satsu') : '') +
      '<div class="km-saku" title="策（ヒント）"><span>策</span>' + st.saku + '</div>' +
      (st.items.length ? '<div class="km-items">' + st.items.map(function (it) { var x = K.items[it]; return '<span title="' + esc(x.name) + '">' + esc(x.glyph) + '</span>'; }).join('') + '</div>' : '');
  }

  /* ============================ 小さな遊び ============================ */
  function doGame(n) {
    mode = 'game';
    ST.hideBubble();
    if (n.g === 'seat') return gameSeat(n);
    if (n.g === 'gift') return gameGift(n);
    if (n.g === 'route') return gameRoute(n);
    go(nextOf(n));
  }
  function modal(html, cls) {
    el.modal.className = 'km-modal ' + (cls || '');
    el.modal.innerHTML = '<div class="km-mcard">' + html + '</div>';
    el.modal.hidden = false;
    var f = el.modal.querySelector('button'); if (f) f.focus({ preventScroll: true });
  }
  function closeModal() { el.modal.hidden = true; el.modal.innerHTML = ''; }

  /* 座次図：人物の札を選んでから席を押す */
  var seatS = null;
  function gameSeat(n) {
    var G = K.games.seat;
    seatS = { place: {}, sel: null, tries: 0, n: n };
    renderSeat();
  }
  function renderSeat(msg, done) {
    var G = K.games.seat;
    function seatHTML(s) {
      var here = Object.keys(seatS.place).filter(function (p) { return seatS.place[p] === s.id; });
      return '<button class="km-seat km-seat-' + s.id + '" data-km="seat" data-s="' + s.id + '" aria-label="' + esc(s.label) + '">' +
        '<span class="km-seat-l">' + esc(s.label) + '<small>' + esc(s.dir) + '・' + esc(s.rank) + '</small></span>' +
        '<span class="km-seat-p">' + here.map(function (p) { return '<span class="km-seal km-' + K.chars[p].side + '">' + esc(K.chars[p].seal) + '</span>'; }).join('') + '</span></button>';
    }
    var people = G.people.filter(function (p) { return !seatS.place[p]; });
    modal('<h3>' + esc(G.title) + '</h3><p class="km-m-lead">' + esc(G.lead) + '</p>' +
      '<div class="km-seatmap">' +
        '<div class="km-compass n">北</div><div class="km-compass s">南（入口）</div><div class="km-compass w">西</div><div class="km-compass e">東</div>' +
        G.seats.map(seatHTML).join('') +
        '<div class="km-seat-center">帳の中</div>' +
      '</div>' +
      '<div class="km-people">' + (people.length ? people.map(function (p) {
        return '<button class="km-person' + (seatS.sel === p ? ' on' : '') + '" data-km="person" data-p="' + p + '"><span class="km-seal km-' + K.chars[p].side + '">' + esc(K.chars[p].seal) + '</span>' + esc(K.chars[p].full) + '</button>';
      }).join('') : '<span class="km-m-lead">全員を席に着けた。</span>') + '</div>' +
      (msg ? '<div class="km-m-msg">' + msg + '</div>' : '') +
      '<div class="km-nav">' +
        '<button class="km-btn" data-km="seatreset">置き直す</button>' +
        (done ? '<button class="km-btn gold" data-km="seatdone">宴へ ▶</button>' : '<button class="km-btn gold" data-km="seatcheck"' + (people.length ? ' disabled' : '') + '>史記と照らす</button>') +
      '</div>', 'km-m-seat');
  }
  function seatCheck() {
    var G = K.games.seat, wrong = [];
    seatS.tries++;
    G.seats.forEach(function (s) {
      s.ans.forEach(function (p) { if (seatS.place[p] !== s.id) wrong.push(p); });
    });
    if (window.Store && window.Store.record) window.Store.record(null, !wrong.length, 0);
    if (!wrong.length) {
      renderSeat('<b>史記のとおり。</b>' + esc(G.after), true);
      return;
    }
    var hint = '項王・項伯は「東嚮」、亜父は「南嚮」、沛公は「北嚮」、張良は「西嚮」。東を向いて座る席は、西側にある。';
    wrong.forEach(function (p) { delete seatS.place[p]; });
    renderSeat('<b>' + wrong.map(function (p) { return esc(K.chars[p].name); }).join('・') + '</b>の席が違う。' + esc(hint));
  }

  /* 献上品：品を選んでから相手を押す */
  var giftS = null;
  function gameGift(n) {
    giftS = { to: {}, sel: null, n: n };
    renderGift();
  }
  function renderGift() {
    var G = K.games.gift;
    var all = G.items.every(function (it) { return giftS.to[it.id]; });
    modal('<h3>' + esc(G.title) + '</h3><p class="km-m-lead">' + esc(G.lead) + '</p>' +
      '<div class="km-gifts">' + G.items.map(function (it) {
        return '<button class="km-gift' + (giftS.sel === it.id ? ' on' : '') + '" data-km="giftitem" data-it="' + it.id + '"><b>' + esc(it.name) + '</b><small>' + esc(it.desc) + '</small>' +
          (giftS.to[it.id] ? '<span class="km-gift-to">→ ' + esc(G.targets.filter(function (t) { return t.id === giftS.to[it.id]; })[0].name) + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="km-targets">' + G.targets.map(function (t) {
        return '<button class="km-target" data-km="gifttarget" data-t="' + t.id + '"' + (giftS.sel ? '' : ' disabled') + '><span class="km-seal km-so">' + esc(K.chars[t.id].seal) + '</span>' + esc(t.name) + 'に献じる</button>';
      }).join('') + '</div>' +
      '<div class="km-nav"><button class="km-btn" data-km="giftreset">選び直す</button><button class="km-btn gold" data-km="giftdone"' + (all ? '' : ' disabled') + '>張良に託す ▶</button></div>', 'km-m-gift');
  }
  function giftDone() {
    var G = K.games.gift;
    var ok = Object.keys(G.ans).every(function (k) { return giftS.to[k] === G.ans[k]; });
    st.flags.giftWrong = !ok;
    st.picks.push({ q: '献上の品', a: G.items.map(function (it) { return it.name + '→' + (giftS.to[it.id] === 'u' ? '項王' : '亜父'); }).join('、'), ch: st.ch });
    apply({ take: ['heki', 'to'] });
    closeModal();
    var n = giftS.n;
    mode = 'react';
    cur = { _after: nextOf(n) };
    el.panel.innerHTML = speakerHTML('ryo') + '<div class="km-text">謹んで諾す。――白璧一双と玉斗一双、確かにお預かりしました。</div>' +
      '<div class="km-nav"><span class="km-hint-key">タップ／Enter で次へ</span><button class="km-btn gold km-next" data-km="next">次へ ▶</button></div>';
    persist();
  }

  /* 逃げ道：三つの問いに順に答える。地図に道筋を描く */
  var routeS = null;
  function gameRoute(n) {
    routeS = { step: 0, bad: false, n: n, notes: [] };
    renderRoute();
  }
  function routeMap() {
    var s = routeS.step, ok = !routeS.bad;
    return '<svg class="km-map" viewBox="0 0 320 170" role="img" aria-label="鴻門から霸上への地図">' +
      '<path d="M40 120 Q120 60 200 90 T290 70" class="km-map-road' + (s >= 1 && !ok ? ' on' : '') + '"/>' +
      '<path d="M40 120 Q90 150 150 140 Q220 128 290 70" class="km-map-path' + (s >= 1 && ok ? ' on' : '') + '"/>' +
      '<path d="M110 160 L150 112 L176 128 L210 96 L250 160 Z" class="km-map-mt"/>' +
      '<circle cx="40" cy="120" r="6" class="km-map-pt so"/><text x="40" y="104">鴻門</text>' +
      '<circle cx="290" cy="70" r="6" class="km-map-pt han"/><text x="290" y="54">霸上</text>' +
      '<text x="182" y="158" class="km-map-s">驪山</text><text x="132" y="150" class="km-map-s">芷陽</text>' +
      '<text x="160" y="64" class="km-map-s">大道 四十里</text><text x="214" y="132" class="km-map-s">間道 二十里</text>' +
      '</svg>';
  }
  function renderRoute(msg) {
    var G = K.games.route, s = G.steps[routeS.step];
    modal('<h3>' + esc(G.title) + '</h3><p class="km-m-lead">' + esc(G.lead) + '</p>' + routeMap() +
      (msg ? '<div class="km-m-msg">' + msg + '</div>' : '') +
      (s ? '<div class="km-route-q"><b>' + (routeS.step + 1) + '／' + G.steps.length + '　' + esc(s.q) + '</b></div><div class="km-opts">' +
        s.o.map(function (o, i) { return '<button class="km-opt" data-km="routepick" data-i="' + i + '"><span class="km-opt-n">' + '一二'.charAt(i) + '</span><span>' + esc(o.x) + '</span></button>'; }).join('') + '</div>'
        : '<div class="km-nav"><span></span><button class="km-btn gold" data-km="routedone">駆ける ▶</button></div>'), 'km-m-route');
  }
  function routePick(i) {
    var G = K.games.route, s = G.steps[routeS.step], o = s.o[i];
    if (!o.ok) routeS.bad = true;
    st.picks.push({ q: s.q, a: o.x, ch: st.ch });
    routeS.step++;
    renderRoute(esc(o.r));
  }
  function routeDone() {
    closeModal();
    var n = routeS.n;
    if (routeS.bad && n.el) return go(n.el);
    go(nextOf(n));
  }

  /* ============================ 結末 ============================ */
  function doEnd(eid) {
    stopTimer();
    mode = 'end';
    var E = K.endings[eid];
    var firstTime = !meta.endings[eid];
    meta.endings[eid] = true;
    if (eid === 'T1') { meta.cleared.c7 = true; for (var i = 0; i <= 7; i++) meta.cleared['c' + i] = true; }
    if (eid === 'T2') { meta.cleared.c8 = true; meta.cleared.c9 = true; }
    var rate = st.q ? Math.round(st.ok / st.q * 100) : 0;
    if (E.kind === 'true') {
      if (!meta.best || rate > meta.best.rate) meta.best = { rate: rate, q: st.q };
      if (window.Store && window.Store.finishSession) {
        var got = window.Store.finishSession(eid === 'T1' ? 'koumon' : 'koumon2', { xp: eid === 'T1' ? 80 + st.ok * 4 : 40 + st.ok * 4, score: rate });
        void got;
      }
    }
    var grade = rate >= 95 ? '子房の智' : rate >= 80 ? '樊噲の胆' : rate >= 60 ? '項伯の情' : '鯫生の言';
    var picks = st.picks.slice(-5).map(function (p) { return '<li><span>' + esc(p.q) + '</span>' + esc(p.a) + '</li>'; }).join('');
    var btns = [];
    if (E.kind === 'bad' && st.cp) btns.push('<button class="km-btn gold" data-km="retry">直前の分かれ道からやり直す</button>');
    if (E.unlock) btns.push('<button class="km-btn gold" data-km="part2">第二部「垓下」へ進む</button>');
    if (E.ai) btns.push('<button class="km-btn gold" data-km="ai">范増になって項王を説得する（AI）</button>');
    btns.push('<button class="km-btn" data-km="endings">結末帳</button>');
    btns.push('<button class="km-btn" data-km="totitle">表紙へ</button>');
    if (E.kind === 'bad') sfx('drum'); else sfx('pluck');
    // 正史の結末で記録を閉じる。異聞の結末なら、続きは直前の分かれ道から
    if (E.kind === 'true') meta.save = null;
    else if (st.cp) { meta.save = clone(st.cp.snap); meta.save.cp = clone(st.cp); meta.save.node = st.cp.node; }
    saveMeta();
    modal('<div class="km-end ' + E.kind + '">' +
      '<div class="km-end-kind">' + (E.kind === 'true' ? '正史' : '異聞') + '　結末' + (firstTime ? '<span class="km-new">初めて見た</span>' : '') + '</div>' +
      '<h3 class="km-end-t">' + esc(E.title) + '</h3><div class="km-end-sub">' + esc(E.sub) + '</div>' +
      '<p class="km-end-text">' + esc(E.text) + '</p>' +
      '<div class="km-end-fact"><b>史実では</b>' + esc(E.fact) + '</div>' +
      (E.kind === 'true' ? '<div class="km-end-stats"><div><b>' + st.ok + ' / ' + st.q + '</b><span>読み解いた句</span></div><div><b>' + rate + '%</b><span>読解率</span></div><div><b>' + esc(grade) + '</b><span>評</span></div><div><b>' + st.hints + '</b><span>策を用いた</span></div></div>' : '') +
      (picks ? '<details class="km-end-picks"><summary>この旅の選択を振り返る</summary><ol>' + picks + '</ol></details>' : '') +
      '<div class="km-end-btns">' + btns.join('') + '</div></div>', 'km-m-end');
  }
  function retry() {
    if (!st || !st.cp) return titleScreen();
    var cp = st.cp;
    var keep = { q: st.q, ok: st.ok, hints: st.hints };
    st = clone(cp.snap);
    st.cp = cp;
    st.q = keep.q; st.ok = keep.ok; st.hints = keep.hints;
    if (st.life <= 0) st.life = 1;
    closeModal();
    var sc = lastScene(cp.node);
    if (sc && sc.n !== NODES[cp.node].n) applyScene(sc.n, true).then(function () { go(cp.node, true); });
    else go(cp.node, true);
  }

  /* ============================ 目次・原文帳・結末帳・履歴 ============================ */
  function chapterMenu() {
    var html = '<h3>目次</h3><p class="km-m-lead">読み終えた章から、もう一度始められます。途中の章から始めるときは、それまでを史記どおりに選んだものとします。</p><div class="km-chaps">';
    K.chapters.forEach(function (c, i) {
      var open = i === 0 || meta.cleared[K.chapters[i - 1].id] || meta.cleared[c.id];
      if (c.part2) open = !!meta.endings.T1 && (c.id === 'c8' || meta.cleared.c8);
      html += '<button class="km-chap" data-km="chap" data-c="' + c.id + '"' + (open ? '' : ' disabled') + '>' +
        '<span class="km-chap-no">' + esc(c.no) + '</span><b>' + (open ? esc(c.title) : '？？？') + '</b><small>' + (open ? esc(c.sub) : 'まだ開いていない') + '</small>' +
        (meta.cleared[c.id] ? '<span class="km-chap-done">読了</span>' : '') + '</button>';
    });
    html += '</div><div class="km-nav"><span></span><button class="km-btn" data-km="closemodal">閉じる</button></div>';
    modal(html, 'km-m-menu');
  }
  function bookMenu(openId) {
    var ids = Object.keys(K.genbun);
    var html = '<h3>原文帳</h3><p class="km-m-lead">物語の中で読んだ『史記』の原文が、ここに綴じられます（' + Object.keys(meta.gen).length + ' / ' + ids.length + ' 段）。「教科書」は古典探究の教材の範囲、「補」は物語のつながりのために補った段です。</p><div class="km-book">';
    ids.forEach(function (gid, i) {
      var g = K.genbun[gid], have = !!meta.gen[gid];
      html += '<details class="km-book-it"' + (openId === gid ? ' open' : '') + (have ? '' : ' aria-disabled="true"') + '>' +
        '<summary><span class="km-book-no">' + (i + 1) + '</span><b>' + (have ? esc(g.title) : '――　まだ読んでいない段') + '</b>' + tbTag(g) + '<small>' + esc(chap(g.ch).no) + '</small></summary>' +
        (have ? '<div class="km-paper km-paper-sm">' + genPaperHTML(g, 'haku') + '</div><div class="km-book-yomi">' + esc(g.yomi) + '</div><div class="km-yaku">' + esc(g.yaku) + '</div><div class="km-note">' + esc(g.note) + '</div>' : '') +
        '</details>';
    });
    html += '</div><div class="km-nav"><span></span><button class="km-btn" data-km="closemodal">閉じる</button></div>';
    modal(html, 'km-m-book');
  }
  function endingsMenu() {
    var html = '<h3>結末帳</h3><p class="km-m-lead">たどり着いた結末が記録されます。異聞の結末には、史記の本文との違いが添えられています。</p><div class="km-ends">';
    Object.keys(K.endings).forEach(function (id) {
      var E = K.endings[id], have = !!meta.endings[id];
      html += '<div class="km-ends-it ' + E.kind + (have ? '' : ' locked') + '"><span class="km-ends-k">' + (E.kind === 'true' ? '正史' : '異聞') + '</span><b>' + (have ? esc(E.title) : '？？？') + '</b><small>' + (have ? esc(E.sub) : 'まだ見ていない') + '</small>' +
        (have ? '<p>' + esc(E.fact) + '</p>' : '') + '</div>';
    });
    html += '</div><div class="km-nav"><span></span><button class="km-btn" data-km="' + (mode === 'end' ? 'totitle' : 'closemodal') + '">' + (mode === 'end' ? '表紙へ' : '閉じる') + '</button></div>';
    modal(html, 'km-m-ends');
  }
  function logMenu() {
    if (!st) return;
    var html = '<h3>履歴</h3><div class="km-log">' + st.log.slice(-60).map(function (l) {
      var c = who(l[0]);
      return '<p>' + (c ? '<b>' + esc(c.name) + '</b>' : '') + esc(l[1]) + '</p>';
    }).join('') + '</div><div class="km-nav"><span></span><button class="km-btn" data-km="closemodal">閉じる</button></div>';
    modal(html, 'km-m-log');
    var lg = el.modal.querySelector('.km-log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }
  function howto() {
    modal('<h3>遊び方</h3><div class="km-howto">' +
      '<p><b>進める</b>　画面か「次へ」をタップ。Enter・スペースキーでも進みます。</p>' +
      '<p><b>読み解け</b>　台詞の漢文の意味を選びます。読み違えると<b>命</b>が一つ減り、三つ続けて正しく読むと一つ戻ります。命が尽きると結末を迎えます。</p>' +
      '<p><b>決断</b>　沛公としての判断です。史記と違う道を選ぶと、<b>異聞の結末</b>にたどり着くことがあります。結末からは、直前の分かれ道へ戻れます。</p>' +
      '<p><b>項王の怒気・范増の殺気</b>　言葉づかい一つで上下します。どちらも満ちれば命はありません。</p>' +
      '<p><b>策</b>　「子房に問う」でヒントがもらえます。数には限りがあります。</p>' +
      '<p><b>原文帳</b>　物語で読んだ史記の原文（白文・書き下し・現代語訳・注）が綴じられます。読んだ字数は「学びの記録」にも加算されます。</p>' +
      '<p><b>絵を見る</b>　本文を隠して場面の絵だけを眺められます（H キー）。</p>' +
      '</div><div class="km-nav"><span></span><button class="km-btn" data-km="closemodal">閉じる</button></div>', 'km-m-howto');
  }
  function aiScreen() {
    modal('<h3>范増になって、項王を説得せよ</h3>' +
      '<p class="km-m-lead">高祖は言った。「項羽は一の范増有れども用ゐる能はず」。もしあなたが范増なら、あの宴の最後の機会に、項王を動かせただろうか。</p>' +
      '<ol class="km-ai-steps">' +
        '<li>下の指示文をコピーして、授業で使っているAI（Claude など）に貼り付ける。</li>' +
        '<li>AIが項王として話しはじめる。あなたは范増として、<b>五回まで</b>言葉をかけられる。</li>' +
        '<li><b>本文を根拠にする</b>ほど説得力が上がる。原文帳の書き下し文を引用してみよう。後の歴史（垓下など）を持ち出すと「妖言」として退けられる。</li>' +
        '<li>五回目のあと、AIが役を降りて講評する。説得できたか、どの本文が使えたかを振り返ろう。</li>' +
      '</ol>' +
      '<textarea class="km-ai-prompt" readonly rows="8" aria-label="AIへの指示文">' + esc(K.aiPrompt) + '</textarea>' +
      '<div class="km-nav"><button class="km-btn" data-km="book">原文帳を開く</button><button class="km-btn gold" data-km="copyai">指示文をコピー</button></div>' +
      '<p class="km-m-small">教員向けのワークシートと評価の観点は、リポジトリの docs/hanzo-roleplay.md にあります。</p>' +
      '<div class="km-nav"><span></span><button class="km-btn" data-km="totitle">表紙へ</button></div>', 'km-m-ai');
  }
  function copyAI() {
    var ta = el.modal.querySelector('.km-ai-prompt');
    function done(ok) {
      var b = el.modal.querySelector('[data-km="copyai"]');
      if (b) b.textContent = ok ? 'コピーしました' : '選択して手動でコピーしてください';
      if (!ok && ta) { ta.focus(); ta.select(); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(K.aiPrompt).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  function updateSoundChip() {
    if (!el.sound) return;
    el.sound.textContent = meta.sound ? '音 入' : '音 切';
    el.sound.setAttribute('aria-pressed', meta.sound ? 'true' : 'false');
  }

  /* ============================ 入力 ============================ */
  function onClick(e) {
    var t = e.target.closest('[data-km]');
    if (!t) {
      // 舞台やパネルの空いたところを押したら進む
      if (e.target.closest('.km-modal') || e.target.closest('.km-top')) return;
      if ($root.classList.contains('km-view')) { $root.classList.remove('km-view'); return; }
      advance();
      return;
    }
    e.stopPropagation();
    var a = t.getAttribute('data-km');
    switch (a) {
      case 'next': advance(); break;
      case 'gennext': go(nextOf(cur)); break;
      case 'genview': renderGen(t.getAttribute('data-g'), t.getAttribute('data-v'), false); break;
      case 'pick': pick(Number(t.getAttribute('data-i'))); break;
      case 'hint': useHint(); break;
      case 'fbnext': afterFeedback(); break;
      case 'new':
        if (meta.save) {
          confirmBox('最初から始めますか？　いまの続き（' + chap(meta.save.ch).no + '）は上書きされます。', '最初から', function () { closeModal(); meta.save = null; startNew('c0'); });
        } else startNew('c0');
        break;
      case 'continue': continueSave(); break;
      case 'menu': chapterMenu(); break;
      case 'chap': closeModal(); if (st) persist(); startNew(t.getAttribute('data-c')); break;
      case 'book': bookMenu(); break;
      case 'endings': endingsMenu(); break;
      case 'log': logMenu(); break;
      case 'howto': howto(); break;
      case 'closemodal':
        closeModal();
        if (mode === 'title') titleScreen();
        break;
      case 'view': $root.classList.toggle('km-view'); break;
      case 'view3d': case 'view2d':
        meta.view = a === 'view3d' ? '3d' : '2d'; saveMeta();
        mountStage(); ST.start(); titleScreen();
        break;
      case 'sound':
        meta.sound = !meta.sound; saveMeta(); updateSoundChip();
        if (meta.sound) { ac(); if (st && ST.S.stageId) ambience(/tent|feast|nangong/.test(ST.S.stageId) ? 'in' : 'out'); sfx('chime'); }
        else stopAmbience();
        break;
      case 'quit': close(); break;
      case 'retry': retry(); break;
      case 'part2': closeModal(); startNew('c8'); break;
      case 'ai': aiScreen(); break;
      case 'copyai': copyAI(); break;
      case 'totitle': closeModal(); titleScreen(); break;
      case 'person': seatS.sel = t.getAttribute('data-p'); renderSeat(); break;
      case 'seat':
        if (seatS.sel) { seatS.place[seatS.sel] = t.getAttribute('data-s'); seatS.sel = null; renderSeat(); }
        else {
          var s = t.getAttribute('data-s');
          Object.keys(seatS.place).forEach(function (p) { if (seatS.place[p] === s) delete seatS.place[p]; });
          renderSeat();
        }
        break;
      case 'seatreset': seatS.place = {}; seatS.sel = null; renderSeat(); break;
      case 'seatcheck': seatCheck(); break;
      case 'seatdone': closeModal(); go(nextOf(seatS.n)); break;
      case 'giftitem': giftS.sel = t.getAttribute('data-it'); renderGift(); break;
      case 'gifttarget':
        if (giftS.sel) {
          var tg = t.getAttribute('data-t');
          Object.keys(giftS.to).forEach(function (k) { if (giftS.to[k] === tg) delete giftS.to[k]; });
          giftS.to[giftS.sel] = tg; giftS.sel = null; renderGift();
        }
        break;
      case 'giftreset': giftS.to = {}; giftS.sel = null; renderGift(); break;
      case 'giftdone': giftDone(); break;
      case 'routepick': routePick(Number(t.getAttribute('data-i'))); break;
      case 'routedone': routeDone(); break;
      case 'cfm-ok': if (confirmBox.ok) confirmBox.ok(); break;
      case 'cfm-no': closeModal(); if (mode === 'title') titleScreen(); break;
    }
  }
  function confirmBox(msg, okLabel, ok) {
    confirmBox.ok = ok;
    modal('<p class="km-cfm">' + esc(msg) + '</p><div class="km-nav"><button class="km-btn" data-km="cfm-no">やめる</button><button class="km-btn gold" data-km="cfm-ok">' + esc(okLabel) + '</button></div>', 'km-m-cfm');
  }
  function onKey(e) {
    if (!$root || $root.hidden) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var modalOpen = !el.modal.hidden;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (modalOpen && mode !== 'end' && mode !== 'game') { closeModal(); if (mode === 'title') titleScreen(); }
      else if (!modalOpen) chapterMenu();
      return;
    }
    if (modalOpen) return;
    if (e.key === 'h' || e.key === 'H') { $root.classList.toggle('km-view'); e.preventDefault(); return; }
    if (mode === 'ask') {
      var k = '1234'.indexOf(e.key);
      var btns = $root.querySelectorAll('.km-opt:not([disabled])');
      if (k >= 0 && btns[k]) { e.preventDefault(); btns[k].click(); }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest && e.target.closest('button') && e.target.closest('#km')) return; // ボタン自身の動作に任せる
      if (mode === 'say' || mode === 'react' || mode === 'card') { e.preventDefault(); advance(); }
      else if (mode === 'gen') { e.preventDefault(); go(nextOf(cur)); }
      else if (mode === 'feedback') { e.preventDefault(); afterFeedback(); }
    }
  }

  /** ホームのカードに出す進み具合（物語を開かずに読む） */
  function summary() {
    K = window.KOUMON;
    if (!K) return null;
    if (!ORDER.length) buildIndex();
    loadMeta();
    var sv = meta.save && K.chapters.filter(function (c) { return c.id === meta.save.ch; })[0];
    return {
      endings: Object.keys(meta.endings).filter(function (k) { return K.endings[k]; }).length, endAll: Object.keys(K.endings).length,
      gen: Object.keys(meta.gen).filter(function (k) { return K.genbun[k]; }).length, genAll: Object.keys(K.genbun).length,
      saveAt: sv ? sv.no + '　' + sv.title : '', cleared: !!meta.endings.T1, done: !!meta.endings.T2
    };
  }

  window.Koumon = {
    open: open, close: close, summary: summary,
    // テスト用の入口
    _state: function () { return st; }, _meta: function () { return meta; }, _mode: function () { return mode; },
    _go: function (id) { go(id); }, _nodes: function () { return NODES; }
  };
})();
