/* 進捗の保存・段位・実績・弱点管理 */
(function () {
  'use strict';

  var KEY = 'kanbun-dojo:v1';

  var DEFAULT = {
    xp: 0,
    answered: 0,
    correct: 0,
    streak: 0,
    lastDay: '',
    bestDay: 0,
    best: {},          // modeId -> best score
    plays: {},         // modeId -> 回数
    srs: {},           // questionKey -> { w:誤答数, r:正答数, t:最終学習(ms) }
    days: {},          // 'Y-M-D' -> [解答数, 正解数, 読んだ字数]　日ごとの学習量（墨あと）
    chars: 0,          // これまでに読んだ漢文の延べ字数
    secs: 0,           // 学習時間の目安（秒）
    ach: [],           // 取得済み実績 id
    foesCleared: [],   // 道場破りで突破した関門の id
    theme: '',         // '', 'light', 'dark'
    vertical: true     // 漢文本文を縦書きで表示する
  };

  var RANKS = [
    { xp: 0,     name: '素読',   kanji: '初' },
    { xp: 150,   name: '五級',   kanji: '五' },
    { xp: 400,   name: '四級',   kanji: '四' },
    { xp: 750,   name: '三級',   kanji: '三' },
    { xp: 1200,  name: '二級',   kanji: '二' },
    { xp: 1800,  name: '一級',   kanji: '一' },
    { xp: 2600,  name: '初段',   kanji: '段' },
    { xp: 3600,  name: '二段',   kanji: '弐' },
    { xp: 4900,  name: '三段',   kanji: '参' },
    { xp: 6500,  name: '四段',   kanji: '肆' },
    { xp: 8500,  name: '皆伝',   kanji: '皆' }
  ];

  var ACHIEVEMENTS = [
    { id: 'a1',  ico: '初', t: '初筆',       d: '最初の問題に答えた',            test: function (s) { return s.answered >= 1; } },
    { id: 'a2',  ico: '百', t: '百問',       d: '通算100問に答えた',             test: function (s) { return s.answered >= 100; } },
    { id: 'a3',  ico: '五', t: '五百問',     d: '通算500問に答えた',             test: function (s) { return s.answered >= 500; } },
    { id: 'a4',  ico: '続', t: '三日坊主脱出', d: '3日連続で学習した',            test: function (s) { return s.streak >= 3; } },
    { id: 'a5',  ico: '精', t: '七日精進',   d: '7日連続で学習した',             test: function (s) { return s.streak >= 7; } },
    { id: 'a6',  ico: '全', t: '全問正解',   d: 'いずれかのモードを全問正解',     test: function (s) { return !!s._perfect; } },
    { id: 'a7',  ico: '連', t: '十連鎖',     d: '10問連続正解',                  test: function (s) { return (s._maxCombo || 0) >= 10; } },
    { id: 'a8',  ico: '詩', t: '詩心',       d: '漢詩モードをクリア',            test: function (s) { return (s.plays.kanshi || 0) >= 1; } },
    { id: 'a9',  ico: '関', t: '関門突破',   d: '道場破りで3つの関門を突破',      test: function (s) { return (s.foesCleared || []).length >= 3; } },
    { id: 'a10', ico: '伝', t: '免許皆伝',   d: '道場破りで全ての関門を突破',      test: function (s) { return (s.foesCleared || []).length >= (window.FOES || []).length && (window.FOES || []).length > 0; } },
    { id: 'a11', ico: '試', t: '好成績',     d: '実力テストで90点以上',           test: function (s) { return (s.best.mogi || 0) >= 90; } },
    { id: 'a12', ico: '墨', t: '千字文',     d: '漢文を通算1000字読んだ',          test: function (s) { return (s.chars || 0) >= 1000; } },
    { id: 'a13', ico: '万', t: '万巻の書',   d: '漢文を通算10000字読んだ',         test: function (s) { return (s.chars || 0) >= 10000; } }
  ];

  var state = null;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function dayDiff(a, b) {
    if (!a || !b) return 999;
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    var da = new Date(pa[0], pa[1] - 1, pa[2]), db = new Date(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* privacy mode */ }
    state = Object.assign({}, DEFAULT);
    if (raw) {
      try {
        var p = JSON.parse(raw);
        Object.keys(DEFAULT).forEach(function (k) { if (p[k] !== undefined) state[k] = p[k]; });
      } catch (e) { /* corrupted -> reset */ }
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /** その日の最初のアクセスで連続記録を更新 */
  function touchDay() {
    var t = today();
    if (state.lastDay === t) return false;
    var diff = dayDiff(state.lastDay, t);
    state.streak = (diff === 1) ? state.streak + 1 : 1;
    state.lastDay = t;
    if (state.streak > state.bestDay) state.bestDay = state.streak;
    save();
    return true;
  }

  function rankOf(xp) {
    var cur = RANKS[0], next = null;
    for (var i = 0; i < RANKS.length; i++) {
      if (xp >= RANKS[i].xp) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    var span = next ? next.xp - cur.xp : 1;
    var got = next ? xp - cur.xp : 1;
    return { cur: cur, next: next, pct: Math.max(0, Math.min(100, Math.round(got / span * 100))) };
  }

  /** 直前の解答時刻。学習時間の見積もりに使う */
  var lastAt = 0;
  function mark() { lastAt = Date.now(); }

  /** 1問ぶんの結果を記録する。chars はその問題で読んだ漢文の字数。 */
  function record(key, ok, chars) {
    state.answered++;
    if (ok) state.correct++;
    state.chars += (chars || 0);

    // 学習時間：前の解答からの経過を足す。離席ぶんを拾わないよう 90 秒で頭打ちにする。
    var now = Date.now();
    if (lastAt && now - lastAt < 90000) state.secs += Math.round((now - lastAt) / 1000);
    lastAt = now;

    var d = today();
    var rec = state.days[d] || [0, 0, 0];
    if (rec.length < 3) rec[2] = 0;                 // 旧形式からの移行
    rec[0]++; if (ok) rec[1]++; rec[2] += (chars || 0);
    state.days[d] = rec;

    if (key) {
      var s = state.srs[key] || { w: 0, r: 0, t: 0 };
      if (ok) s.r++; else s.w++;
      s.t = now;
      state.srs[key] = s;
    }
  }

  /** 直近 n 日ぶんの学習量。カレンダー表示に使う。 */
  function recentDays(n) {
    var out = [], base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var t = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      var k = t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
      var v = state.days[k] || [0, 0, 0];
      out.push({ key: k, date: t, n: v[0], c: v[1], chars: v[2] || 0 });
    }
    return out;
  }

  /** その問題を「習得した」とみなすか（2回以上正解し、正解が誤答を上回る） */
  function isMastered(key) {
    var s = state.srs[key];
    return !!(s && s.r >= 2 && s.r > s.w);
  }

  /** 学習した日数 */
  function activeDays() { return Object.keys(state.days).length; }

  /** 苦手度スコア（大きいほど優先して出題） */
  function weakness(key) {
    var s = state.srs[key];
    if (!s) return 1.2;                       // 未出題はやや優先
    var total = s.r + s.w;
    var rate = total ? s.w / total : 0;
    var recency = Math.min(1, (Date.now() - s.t) / (1000 * 60 * 60 * 24 * 3)); // 3日で最大
    return rate * 3 + recency * 0.6 + (s.r === 0 ? 0.8 : 0);
  }

  /** 弱点キー一覧（誤答が正答を上回るもの） */
  function weakKeys() {
    return Object.keys(state.srs).filter(function (k) {
      var s = state.srs[k];
      return s.w > 0 && s.w >= s.r;
    });
  }

  function finishSession(modeId, opt) {
    opt = opt || {};
    state.plays[modeId] = (state.plays[modeId] || 0) + 1;
    if (opt.score !== undefined) {
      if (!state.best[modeId] || opt.score > state.best[modeId]) state.best[modeId] = opt.score;
    }
    if (opt.xp) state.xp += opt.xp;
    state._perfect = state._perfect || !!opt.perfect;
    state._maxCombo = Math.max(state._maxCombo || 0, opt.maxCombo || 0);
    var got = checkAchievements();
    save();
    return got;
  }

  function checkAchievements() {
    var newly = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (state.ach.indexOf(a.id) === -1 && a.test(state)) {
        state.ach.push(a.id);
        newly.push(a);
      }
    });
    return newly;
  }

  function reset() {
    state = Object.assign({}, DEFAULT, { theme: state.theme, vertical: state.vertical });
    state.best = {}; state.plays = {}; state.srs = {}; state.ach = []; state.foesCleared = [];
    state.days = {}; state.chars = 0; state.secs = 0;
    save();
  }

  window.Store = {
    load: load, save: save, touchDay: touchDay,
    rankOf: rankOf, record: record, weakness: weakness, weakKeys: weakKeys,
    mark: mark, recentDays: recentDays, isMastered: isMastered, activeDays: activeDays,
    finishSession: finishSession, reset: reset,
    RANKS: RANKS, ACHIEVEMENTS: ACHIEVEMENTS,
    get state() { return state; }
  };
})();
