/* 楚漢の章 —— 舞台の絵（Canvas 2D による奥行きつきの重ね絵）
 *
 * 寝殿造り3D探訪の再現モード「徒然草」の作りを、依存なしの2Dで置き換えたもの。
 *   - 舞台（stage）ごとに遠景→近景の層を持ち、層ごとに奥行き d（0=最遠, 1=最前）を与える。
 *     カメラが動くと遠い層ほど動きが小さく、寄ったときも遠い層ほど拡大が小さい（視差）。
 *   - 光（light）は空・山・人物の色をまとめた表。同じ舞台でも夕暮れ・夜・夜明けで描き分ける。
 *   - 動かない層は舞台×光ごとにオフスクリーンへ一度だけ描いて使い回す。
 *     毎フレーム描くのは篝火・旗・粒子・人物だけ。
 *   - 人物は影絵（墨の塗り＋光側の縁取り）。姿勢（pose）を差し替えて演技させる。
 *   - 寄り（focus）は徒然草の「ショット」に相当し、目標まで滑らかに寄せたあと、ゆっくり漂わせる。
 *
 * 世界座標は 1600×900。画面へは「覆う」ように拡大する（はみ出す分は上下左右の余白で補う）。
 */
(function () {
  'use strict';

  var W = 1600, H = 900, M = 220; // 世界の大きさと、層の外側の余白

  /* ============================ 光 ============================ */
  var LIGHTS = {
    dusk:   { sky: ['#191a33', '#4a3352', '#b05e48', '#e8a060'], sun: { x: 1240, y: 600, r: 70, c: '#ffd394' },
              far: '#5a4560', mid: '#33263b', near: '#18111a', ink: '#100b10', rim: '#ffb46e', rimA: .55,
              fog: [230, 150, 110], fogA: .28, stars: 0, glow: '#ff9a4a', ground: '#1d141c' },
    night:  { sky: ['#02040b', '#070d1d', '#111a33', '#1b2541'], moon: { x: 1290, y: 140, r: 26 },
              far: '#161d33', mid: '#0d1222', near: '#06080f', ink: '#030408', rim: '#9fb6ea', rimA: .4,
              fog: [50, 70, 120], fogA: .2, stars: 1, glow: '#ff8a3a', ground: '#070a12' },
    moon:   { sky: ['#030713', '#0b1630', '#1b2c52', '#2c4068'], moon: { x: 360, y: 170, r: 46 },
              far: '#22304f', mid: '#141d33', near: '#080c16', ink: '#04060c', rim: '#c4d6ff', rimA: .55,
              fog: [90, 120, 170], fogA: .26, stars: 1, glow: '#ffb070', ground: '#0a0f1b' },
    dawn:   { sky: ['#2a3350', '#69647f', '#cf9f8a', '#f1d2b2'], sun: { x: 300, y: 690, r: 80, c: '#fff0d8' },
              far: '#827a95', mid: '#4d4659', near: '#272230', ink: '#151219', rim: '#ffdcb6', rimA: .5,
              fog: [240, 220, 205], fogA: .38, stars: 0, glow: '#ffb070', ground: '#2a2430' },
    day:    { sky: ['#6f8fb0', '#a9bdd0', '#d9d8cf', '#efe6d2'], sun: { x: 1200, y: 160, r: 60, c: '#fff7e6' },
              far: '#8b95a3', mid: '#5f6670', near: '#2f2c2b', ink: '#1a1715', rim: '#fff1d6', rimA: .45,
              fog: [235, 228, 214], fogA: .3, stars: 0, glow: '#ffc070', ground: '#3b342c',
              cloth: ['#d8c08e', '#b4945e', '#7a5c34'], indoor: .95 },
    lamp:   { sky: ['#05040a', '#0b0810', '#140e14', '#1c1418'], far: '#2a1f22', mid: '#1a1316', near: '#0d090b',
              ink: '#070506', rim: '#ffb66a', rimA: .6, fog: [120, 70, 40], fogA: .14, stars: 0, glow: '#ffa24e',
              ground: '#120d0c', cloth: ['#5a3a24', '#3a2416', '#1c110a'], indoor: .35 },
    snow:   { sky: ['#05070d', '#0d1320', '#1b2333', '#2a3446'], far: '#26304a', mid: '#161c2c', near: '#0a0d16',
              ink: '#05070c', rim: '#d0dcf4', rimA: .45, fog: [150, 165, 190], fogA: .3, stars: 0, glow: '#ff9446',
              ground: '#c9d2e0', snow: 1 },
    snowin: { sky: ['#05040a', '#0b0810', '#120e14', '#181318'], far: '#241c22', mid: '#171216', near: '#0b080a',
              ink: '#060406', rim: '#ffbe7a', rimA: .55, fog: [100, 90, 110], fogA: .14, stars: 0, glow: '#ff9c4c',
              ground: '#100c0c', cloth: ['#4a3426', '#30221a', '#170f0b'], indoor: .3, cold: 1 },
    palace: { sky: ['#1a0d0a', '#2a140e', '#3a1c12', '#4a2616'], far: '#5a2a1a', mid: '#3a1a10', near: '#1a0c08',
              ink: '#0e0606', rim: '#ffd27a', rimA: .55, fog: [190, 120, 60], fogA: .18, stars: 0, glow: '#ffc060',
              ground: '#2a160e', cloth: ['#8a2a1c', '#5e1a12', '#2e0c08'], indoor: .6 }
  };

  /* ============================ 乱数・小道具 ============================ */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(h1, h2, u) {
    var a = hex2rgb(h1), b = hex2rgb(h2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')';
  }
  function ease(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }

  /** 稜線。中点変位で山並みを作り、下へ塗りつぶす */
  function ridge(g, seed, x0, x1, base, amp, rough, color, fogTo) {
    var R = rng(seed), n = 64, pts = [];
    for (var i = 0; i <= n; i++) pts.push(0);
    function sub(a, b, h) {
      if (b - a < 2) return;
      var m = (a + b) >> 1;
      pts[m] = (pts[a] + pts[b]) / 2 + (R() - .5) * h;
      sub(a, m, h * rough); sub(m, b, h * rough);
    }
    pts[0] = (R() - .5) * amp; pts[n] = (R() - .5) * amp;
    sub(0, n, amp);
    g.beginPath();
    g.moveTo(x0, H + M);
    for (i = 0; i <= n; i++) g.lineTo(x0 + (x1 - x0) * i / n, base - Math.abs(pts[i]));
    g.lineTo(x1, H + M);
    g.closePath();
    var gr = g.createLinearGradient(0, base - amp, 0, base + 160);
    gr.addColorStop(0, color);
    gr.addColorStop(1, fogTo || color);
    g.fillStyle = gr;
    g.fill();
  }
  function fogBand(g, y, h, L, a) {
    var gr = g.createLinearGradient(0, y - h, 0, y + h);
    gr.addColorStop(0, rgba(L.fog, 0));
    gr.addColorStop(.5, rgba(L.fog, a));
    gr.addColorStop(1, rgba(L.fog, 0));
    g.fillStyle = gr;
    g.fillRect(-M, y - h, W + 2 * M, h * 2);
  }
  function skyFill(g, L) {
    var gr = g.createLinearGradient(0, -M, 0, H + M);
    gr.addColorStop(0, L.sky[0]); gr.addColorStop(.35, L.sky[1]); gr.addColorStop(.7, L.sky[2]); gr.addColorStop(1, L.sky[3]);
    g.fillStyle = gr;
    g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    var R = rng(7);
    if (L.stars) {
      for (var i = 0; i < 260; i++) {
        var x = R() * (W + 2 * M) - M, y = R() * 520 - M, s = R();
        g.fillStyle = 'rgba(230,236,255,' + (0.15 + s * 0.6) + ')';
        g.fillRect(x, y, s > .93 ? 2 : 1, s > .93 ? 2 : 1);
      }
    }
    if (L.sun) {
      var s1 = g.createRadialGradient(L.sun.x, L.sun.y, 0, L.sun.x, L.sun.y, L.sun.r * 6);
      s1.addColorStop(0, L.sun.c); s1.addColorStop(.12, L.sun.c); s1.addColorStop(.2, 'rgba(255,200,140,.35)'); s1.addColorStop(1, 'rgba(255,180,120,0)');
      g.fillStyle = s1;
      g.fillRect(L.sun.x - L.sun.r * 6, L.sun.y - L.sun.r * 6, L.sun.r * 12, L.sun.r * 12);
    }
    if (L.moon) {
      var mo = L.moon;
      var hal = g.createRadialGradient(mo.x, mo.y, mo.r, mo.x, mo.y, mo.r * 7);
      hal.addColorStop(0, 'rgba(210,222,255,.35)'); hal.addColorStop(1, 'rgba(160,180,230,0)');
      g.fillStyle = hal; g.beginPath(); g.arc(mo.x, mo.y, mo.r * 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#eef2ff'; g.beginPath(); g.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(180,190,215,.35)';
      g.beginPath(); g.arc(mo.x - mo.r * .3, mo.y - mo.r * .15, mo.r * .28, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(mo.x + mo.r * .25, mo.y + mo.r * .3, mo.r * .2, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------- 陣の道具 ---------- */
  function tent(g, x, y, w, h, fill, lit) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.quadraticCurveTo(x - w * .32, y - h * .55, x, y - h);
    g.quadraticCurveTo(x + w * .32, y - h * .55, x + w / 2, y);
    g.closePath(); g.fill();
    g.fillRect(x - 1, y - h - h * .25, 2, h * .25);
    if (lit) {
      var gr = g.createRadialGradient(x, y - h * .2, 0, x, y - h * .2, w * .5);
      gr.addColorStop(0, lit); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w * .16, y); g.lineTo(x, y - h * .5); g.lineTo(x + w * .16, y); g.closePath(); g.fill();
    }
  }
  function palisade(g, y, h, L, gapFrom, gapTo) {
    var R = rng(31);
    for (var x = -M; x < W + M; x += 18 + R() * 6) {
      if (gapFrom !== undefined && x > gapFrom && x < gapTo) continue;
      var hh = h * (0.9 + R() * 0.2);
      g.fillStyle = L.near;
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x, y - hh + 10); g.lineTo(x + 7, y - hh); g.lineTo(x + 14, y - hh + 10); g.lineTo(x + 14, y);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(x + 9, y - hh + 12, 3, hh - 14);
    }
    g.fillStyle = L.near;
    g.fillRect(-M, y - h * .72, W + 2 * M, 7);
    g.fillRect(-M, y - h * .3, W + 2 * M, 7);
  }
  function pine(g, x, y, h, color, seed) {
    var R = rng(seed);
    g.strokeStyle = color; g.lineWidth = h * .035; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + h * .12, y - h * .5, x - h * .05, y - h); g.stroke();
    g.fillStyle = color;
    for (var i = 0; i < 6; i++) {
      var yy = y - h * (0.35 + i * 0.12), side = i % 2 ? 1 : -1, len = h * (0.42 - i * 0.05) * (0.8 + R() * 0.4);
      g.beginPath();
      g.ellipse(x + side * len * .45, yy, len * .55, h * .045, side * -0.08, 0, Math.PI * 2);
      g.fill();
    }
  }
  function curtainWall(g, x0, x1, y0, y1, L, folds) {
    var c = L.cloth || ['#6a4a2e', '#4a3220', '#22160c'];
    var gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c[2]); gr.addColorStop(.3, c[1]); gr.addColorStop(1, c[0]);
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    var fw = (x1 - x0) / folds;
    for (var i = 0; i < folds; i++) {
      var fx = x0 + i * fw;
      var sh = g.createLinearGradient(fx, 0, fx + fw, 0);
      sh.addColorStop(0, 'rgba(0,0,0,.28)'); sh.addColorStop(.45, 'rgba(255,240,210,.07)'); sh.addColorStop(1, 'rgba(0,0,0,.22)');
      g.fillStyle = sh; g.fillRect(fx, y0, fw, y1 - y0);
    }
    // 上部の垂れ（帳の縁）
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (i = 0; i < folds; i++) {
      var sx = x0 + i * fw;
      g.beginPath(); g.moveTo(sx, y0); g.quadraticCurveTo(sx + fw / 2, y0 + 60, sx + fw, y0); g.lineTo(sx + fw, y0); g.closePath(); g.fill();
    }
  }
  function lowTable(g, x, y, w, L) {
    g.fillStyle = L.ink;
    g.fillRect(x - w / 2, y - 26, w, 9);
    g.fillRect(x - w / 2 + 6, y - 18, 6, 18);
    g.fillRect(x + w / 2 - 12, y - 18, 6, 18);
    g.fillStyle = L.ink;
    g.beginPath(); g.ellipse(x - w * .2, y - 30, 11, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - w * .2 - 9, y - 44, 18, 14);
  }

  /* ============================ 人物（影絵） ============================ */
  /* 単位は「身の丈＝1」。足元が原点、上が負。face=1 で右向き。 */
  var ATTIRE = {
    hai:  { crown: 'bamboo', beard: 1, build: 1 },
    ko:   { crown: 'mian', beard: 1, build: 1.04, robe: 1.15 },
    u:    { crown: 'warrior', build: 1.18, armor: 1, sword: 1 },
    zo:   { crown: 'cap', beard: 2, build: .95, hunch: 1, jue: 1 },
    ryo:  { crown: 'cap', build: .9 },
    haku: { crown: 'cap', beard: 1, build: 1.02, sword: 1 },
    kai:  { crown: 'helm', beard: 1, build: 1.2, armor: 1, sword: 1, shield: 1 },
    sou:  { crown: 'helm', build: 1, armor: 1, sword: 1 },
    chin: { crown: 'cap', build: .95 },
    msg:  { crown: 'band', build: .9 },
    ei:   { crown: 'helm', build: 1, armor: 1, halberd: 1 },
    gu:   { crown: 'lady', build: .86, lady: 1 },
    ou:   { crown: 'cap', beard: 1, build: 1 },
    tei:  { crown: 'band', beard: 2, build: .9, hunch: 1 },
    rba:  { crown: 'helm', beard: 1, build: 1.05, armor: 1, sword: 1 }
  };

  function poly(g, pts) {
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  }

  /** 腕と袖。肩(sx,sy)から上腕の角度 a1・前腕の角度 a2。漢服の袖は手首から大きく垂れる */
  function arm(g, sx, sy, a1, a2, len, drop, tight) {
    var ex = sx + Math.cos(a1) * len * .5, ey = sy + Math.sin(a1) * len * .5;
    var wx = ex + Math.cos(a2) * len * .46, wy = ey + Math.sin(a2) * len * .46;
    var th = tight ? .028 : .04;
    var nx = -Math.sin(a1) * th, ny = Math.cos(a1) * th;
    var mx = -Math.sin(a2) * th, my = Math.cos(a2) * th;
    g.moveTo(sx + nx, sy + ny);
    g.lineTo(ex + nx, ey + ny);
    g.lineTo(wx + mx, wy + my);
    if (tight) {
      g.arc(wx, wy, th * 1.1, Math.atan2(my, mx), Math.atan2(my, mx) + Math.PI);
    } else {
      // 袖口から袋のように垂れる袖
      var dx = (wx + ex) / 2, dy = Math.max(wy, ey) + drop;
      g.quadraticCurveTo(wx + .03, wy + drop * .55, dx + .02, dy);
      g.quadraticCurveTo(ex - .06, dy - drop * .1, ex - nx * 1.2, ey - ny * 1.2);
    }
    g.lineTo(wx - mx, wy - my);
    g.lineTo(ex - nx, ey - ny);
    g.lineTo(sx - nx, sy - ny);
    g.closePath();
    return { hx: wx + Math.cos(a2) * .03, hy: wy + Math.sin(a2) * .03 };
  }

  /** 脚（甲冑の武人だけ。長衣の人物は裾に隠れる） */
  function leg(g, hx, hy, kx, ky, fx, fy, w) {
    g.moveTo(hx - w, hy); g.lineTo(hx + w, hy);
    g.quadraticCurveTo(kx + w * 1.1, ky, fx + w * .8, fy - .015);
    g.lineTo(fx + w * 2.2, fy); g.lineTo(fx - w * .9, fy);
    g.quadraticCurveTo(kx - w * 1.1, ky, hx - w, hy);
    g.closePath();
  }

  function figurePath(g, f, t) {
    var A = ATTIRE[f.id] || {}, b = A.build || 1, pose = f.pose || 'stand';
    var hunch = A.hunch ? .035 : 0, armored = !!A.armor;
    var seated = pose === 'sit' || pose === 'raise';
    var lean = 0, headY = -.905, shY = -.8, waistY = -.48;
    var ph = t * 2.1;
    if (seated) { headY = -.6; shY = -.505; waistY = -.3; }
    if (pose === 'kneel') { headY = -.73; shY = -.63; waistY = -.4; }
    if (pose === 'dance') lean = Math.sin(ph + 1) * .05;
    if (pose === 'charge') lean = .12;
    if (pose === 'run') lean = .09;
    if (pose === 'strike') lean = .1;
    var bob = pose === 'run' ? Math.abs(Math.sin(t * 9)) * .025 : (pose === 'stand' || pose === 'glare') ? Math.sin(t * 1.2 + f.x) * .003 : 0;
    var sh = .105 * b, cx = lean * .7 + hunch;
    var hx = .028 + lean + hunch * 1.4, hy = headY - bob + hunch;
    var top = shY - bob;

    g.beginPath();
    if (pose === 'down') {
      g.ellipse(0, -.07, .44, .075, 0, 0, Math.PI * 2);
      g.moveTo(.53, -.09); g.arc(.47, -.09, .065, 0, Math.PI * 2);
      return { head: { x: .47, y: -.22 }, A: A, pose: pose, shY: -.1 };
    }

    /* ---- 胴と衣 ---- */
    if (seated) {
      var kw = .3 * b;
      g.moveTo(cx - sh, top + .015);
      g.quadraticCurveTo(cx, top - .035, cx + sh, top + .015);
      g.quadraticCurveTo(cx + sh * 1.25, waistY - .02, cx + kw * .78, -.12);
      g.quadraticCurveTo(cx + kw * 1.08, -.1, kw * 1.02, -.02);
      g.quadraticCurveTo(kw * .9, .004, 0, .004);
      g.lineTo(-kw * .62, .004);
      g.quadraticCurveTo(-kw * .82, -.06, -sh * 1.25, waistY + .06);
      g.quadraticCurveTo(cx - sh * 1.2, top + .06, cx - sh, top + .015);
      g.closePath();
    } else if (pose === 'kneel') {
      var kk = .25 * b;
      g.moveTo(cx - sh, top + .015);
      g.quadraticCurveTo(cx, top - .035, cx + sh, top + .015);
      g.quadraticCurveTo(cx + sh * 1.2, waistY, kk * .95, -.2);
      g.quadraticCurveTo(kk * 1.15, -.04, kk * 1.1, 0);
      g.lineTo(-kk * .7, 0);
      g.quadraticCurveTo(-kk * .9, -.22, -sh * 1.15, waistY + .02);
      g.quadraticCurveTo(cx - sh * 1.2, top + .06, cx - sh, top + .015);
      g.closePath();
    } else {
      var hemY = armored ? -.3 : 0;
      var spread = 0;
      if (pose === 'dance') spread = .05 + Math.sin(ph) * .03;
      if (pose === 'glare' || pose === 'charge') spread = .05;
      var hemF = (armored ? .15 : .17 * (A.robe || 1)) * b + spread + (A.lady ? .07 : 0);
      var hemB = (armored ? .14 : .18 * (A.robe || 1)) * b + spread * .6 + (A.lady ? .1 : 0);
      g.moveTo(cx - sh, top + .015);
      g.quadraticCurveTo(cx, top - .035, cx + sh, top + .015);
      g.quadraticCurveTo(cx + sh * 1.22, top + .14, cx + sh * .98 + lean * .2, waistY);
      g.quadraticCurveTo(cx + sh * 1.1 + lean * .3, (waistY + hemY) / 2, hemF + lean * .3, hemY);
      g.quadraticCurveTo((hemF - hemB) / 2 + lean * .2, hemY + .012, -hemB, hemY);
      g.quadraticCurveTo(-sh * 1.25, (waistY + hemY) / 2, cx - sh * 1.02, waistY);
      g.quadraticCurveTo(cx - sh * 1.25, top + .14, cx - sh, top + .015);
      g.closePath();
      if (armored) {
        // 肩甲と腰の板
        g.moveTo(cx - sh * 1.28, top + .03); g.quadraticCurveTo(cx, top - .03, cx + sh * 1.28, top + .03);
        g.lineTo(cx + sh * 1.12, top + .11); g.quadraticCurveTo(cx, top + .07, cx - sh * 1.12, top + .11); g.closePath();
        // 脚
        var st = { stand: [.04, .05], glare: [.1, .11], charge: [.16, .1], dance: [.08 + Math.sin(ph) * .06, .1 - Math.sin(ph) * .05], run: [Math.sin(t * 9) * .2, -Math.sin(t * 9) * .2], strike: [.1, .08], drink: [.05, .06], eat: [.1, .08] }[pose] || [.04, .05];
        leg(g, .04, hemY - .04, .05 + st[0] * .5, -.15, st[0] + .03, 0, .032);
        leg(g, -.04, hemY - .04, -.05 - st[1] * .4, -.15, -st[1], 0, .032);
      }
    }
    /* ---- 首と頭 ---- */
    g.moveTo(hx - .026, hy + .035); g.lineTo(hx + .024, hy + .035);
    g.lineTo(cx + .03, top + .01); g.lineTo(cx - .035, top + .01); g.closePath();
    var hr = A.lady ? .058 : .062;
    g.moveTo(hx + hr, hy);
    g.arc(hx, hy, hr, 0, Math.PI * 2);
    // 顔の向きを示す鼻先とあご
    g.moveTo(hx + hr * .7, hy - .012); g.lineTo(hx + hr * 1.18, hy + .012); g.lineTo(hx + hr * .8, hy + .03); g.closePath();

    /* ---- 冠・髪 ---- */
    var cr = A.crown, k;
    if (cr === 'bamboo') {
      // 劉氏冠（竹皮の高い冠）
      g.moveTo(hx - .03, hy - .05); g.lineTo(hx + .03, hy - .05);
      g.quadraticCurveTo(hx + .06, hy - .14, hx + .02, hy - .215);
      g.quadraticCurveTo(hx - .01, hy - .2, hx - .03, hy - .05); g.closePath();
    } else if (cr === 'mian') {
      g.rect(hx - .11, hy - .108, .23, .016);
      g.moveTo(hx - .032, hy - .05); g.lineTo(hx + .04, hy - .05); g.lineTo(hx + .034, hy - .095); g.lineTo(hx - .026, hy - .095); g.closePath();
      for (k = 0; k < 5; k++) { g.rect(hx - .105 + k * .009, hy - .094, .0035, .07); g.rect(hx + .075 + k * .009, hy - .094, .0035, .07); }
    } else if (cr === 'warrior') {
      g.moveTo(hx - .068, hy - .01); g.quadraticCurveTo(hx, hy - .12, hx + .068, hy - .01); g.closePath();
      g.rect(hx - .075, hy - .02, .15, .018);
      g.moveTo(hx - .005, hy - .085); g.quadraticCurveTo(hx - .05, hy - .2, hx - .12, hy - .23);
      g.quadraticCurveTo(hx - .06, hy - .16, hx + .012, hy - .08); g.closePath(); // 雉の羽飾り
    } else if (cr === 'helm') {
      g.moveTo(hx - .074, hy + .005); g.quadraticCurveTo(hx - .02, hy - .13, hx + .074, hy - .005);
      g.lineTo(hx + .07, hy + .01); g.closePath();
      g.rect(hx - .005, hy - .15, .01, .06);
      if (pose === 'glare') {
        for (k = -2; k <= 2; k++) { g.moveTo(hx + k * .025 - .01, hy - .07); g.lineTo(hx + k * .036, hy - .21 + Math.abs(k) * .02); g.lineTo(hx + k * .025 + .01, hy - .07); g.closePath(); }
      }
    } else if (cr === 'cap') {
      g.moveTo(hx - .042, hy - .045); g.lineTo(hx + .046, hy - .045); g.lineTo(hx + .036, hy - .112); g.lineTo(hx - .03, hy - .108); g.closePath();
      g.rect(hx - .058, hy - .05, .115, .012);
    } else if (cr === 'band') {
      g.rect(hx - .062, hy - .048, .124, .018);
      g.moveTo(hx - .02, hy - .055); g.arc(hx - .03, hy - .075, .025, 0, Math.PI * 2);
    } else if (cr === 'lady') {
      // 結い上げた髪と、背に流れる髪
      g.moveTo(hx + .055, hy - .03); g.quadraticCurveTo(hx + .06, hy - .11, hx, hy - .1);
      g.quadraticCurveTo(hx - .09, hy - .08, hx - .068, hy + .02);
      g.quadraticCurveTo(hx - .1, hy + .22, hx - .15, hy + .4); g.lineTo(hx - .1, hy + .38);
      g.quadraticCurveTo(hx - .045, hy + .14, hx + .055, hy - .03); g.closePath();
      g.moveTo(hx + .03, hy - .14); g.arc(hx - .005, hy - .14, .038, 0, Math.PI * 2);
      g.moveTo(hx + .045, hy - .2); g.arc(hx + .02, hy - .19, .022, 0, Math.PI * 2);
    }
    if (A.beard) {
      var bl = A.beard === 2 ? .17 : .075;
      g.moveTo(hx + .03, hy + .03); g.quadraticCurveTo(hx + .07, hy + bl * .5, hx + .035, hy + bl);
      g.quadraticCurveTo(hx + .01, hy + bl * .6, hx - .005, hy + .035); g.closePath();
    }

    /* ---- 腕 ---- */
    var sx = cx + sh * .82, sy = top + .035, bx = cx - sh * .7;
    var drop = A.lady ? .26 : armored ? .0 : .17, len = .52 * b;
    var a1 = 1.45, a2 = 1.25, b1 = 1.62, b2 = 1.8;
    if (seated) { a1 = 1.25; a2 = .7; b1 = 1.5; b2 = .9; len *= .8; }
    if (f.back) { a1 = 1.7; a2 = 1.6; b1 = 1.5; b2 = 1.5; len *= .7; }
    if (pose === 'kneel') { a1 = 1.15; a2 = .5; b1 = 1.6; b2 = .7; }
    if (pose === 'raise') { a1 = -1.15; a2 = -1.45; }
    if (pose === 'strike') { a1 = .35; a2 = 1.25; b1 = .5; b2 = 1.3; }
    if (pose === 'dance') { a1 = -1.5 + Math.sin(ph) * .9; a2 = -1.1 + Math.sin(ph + .6) * 1.0; b1 = 2.6 + Math.cos(ph) * .4; b2 = 2.9; }
    if (pose === 'drink') { a1 = -.5; a2 = -2.35; }
    if (pose === 'eat') { a1 = .55; a2 = .85; b1 = .9; b2 = 1.1; }
    if (pose === 'charge') { a1 = .15; a2 = .05; b1 = .3; b2 = .2; }
    if (pose === 'glare') { a1 = 1.3; a2 = 1.15; b1 = 1.85; b2 = 1.95; }
    if (pose === 'run') { a1 = 1.1 + Math.sin(t * 9) * .7; a2 = .5; b1 = 1.9 - Math.sin(t * 9) * .7; b2 = 1.1; }
    var hand2 = arm(g, bx, sy, b1, b2, len, drop * .9, armored);
    var hand = arm(g, sx, sy, a1, a2, len, drop, armored);
    return { head: { x: hx, y: hy - .13 }, hand: hand, hand2: hand2, A: A, pose: pose, shY: shY };
  }

  function drawFigure(g, f, t, L) {
    if (f.pose === 'gone') return null;
    var s = f.h, face = f.face || 1;
    g.save();
    g.translate(f.x, f.y);
    g.scale(s * face, s);
    // 足元の影
    var sg = g.createRadialGradient(0, 0, 0, 0, 0, .34);
    sg.addColorStop(0, 'rgba(0,0,0,.45)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.beginPath(); g.ellipse(0, 0, .34, .04, 0, 0, Math.PI * 2); g.fill();
    var info = figurePath(g, f, t);
    g.fillStyle = L.ink;
    g.fill('nonzero');
    // 光の当たる側だけ細く縁どる：縁の色で塗り、光と反対へずらした墨で塗り直す
    if (L.rimA > 0) {
      var dir = (f.lightFrom || 1) * face;
      g.save();
      g.clip('nonzero');
      g.globalAlpha = L.rimA;
      g.fillStyle = L.rim;
      g.fillRect(-.8, -1.5, 1.6, 1.6);
      g.globalAlpha = 1;
      g.translate(-dir * (3.2 / s), 1.4 / s);
      figurePath(g, f, t);
      g.fillStyle = L.ink;
      g.fill('nonzero');
      g.restore();
    }
    // 持ち物
    var A = info.A, p = info.pose, hd = info.hand;
    g.lineCap = 'round';
    var blade = mix(L.rim, '#ffffff', .45);
    if (A && A.sword && hd) {
      g.beginPath();
      if (p === 'dance' || p === 'eat' || p === 'strike') {
        var ang = p === 'dance' ? Math.atan2(hd.hy - info.shY, hd.hx) - .3 : p === 'strike' ? 1.35 : .55;
        g.strokeStyle = blade; g.lineWidth = 2.4 / s;
        g.moveTo(hd.hx, hd.hy); g.lineTo(hd.hx + Math.cos(ang) * .5, hd.hy + Math.sin(ang) * .5);
        g.stroke();
        g.strokeStyle = L.ink; g.lineWidth = 5 / s; g.beginPath();
        g.moveTo(hd.hx - Math.cos(ang) * .04, hd.hy - Math.sin(ang) * .04); g.lineTo(hd.hx + Math.cos(ang) * .03, hd.hy + Math.sin(ang) * .03);
      } else if (p !== 'sit' && p !== 'kneel' && p !== 'raise' && p !== 'run') {
        g.strokeStyle = L.ink; g.lineWidth = 4 / s;
        g.moveTo(-.02, -.46); g.lineTo(-.3, -.25);
      }
      g.stroke();
    }
    if (f.id === 'zo' && p === 'strike' && hd) {
      g.strokeStyle = blade; g.lineWidth = 2.4 / s;
      g.beginPath(); g.moveTo(hd.hx, hd.hy); g.lineTo(hd.hx + .12, hd.hy + .5); g.stroke();
    }
    if (A && A.shield) {
      g.fillStyle = L.ink;
      g.beginPath();
      if (p === 'eat') g.ellipse(.34, -.03, .17, .035, 0, 0, Math.PI * 2);
      else if (p === 'charge') g.ellipse(.24, -.52, .06, .21, -.1, 0, Math.PI * 2);
      else if (p === 'run') g.ellipse(-.02, -.56, .055, .19, .1, 0, Math.PI * 2);
      else g.ellipse(-.17, -.5, .055, .18, .12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = rgba(hex2rgb(L.rim), .45); g.lineWidth = 1.2 / s; g.stroke();
    }
    if (A && A.halberd) {
      g.strokeStyle = L.ink; g.lineWidth = 3.5 / s;
      g.beginPath(); g.moveTo(.16, 0); g.lineTo(.4, -1.32); g.stroke();
      g.fillStyle = L.ink;
      g.beginPath(); g.moveTo(.38, -1.2); g.lineTo(.52, -1.22); g.lineTo(.41, -1.28); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(.4, -1.32); g.lineTo(.43, -1.42); g.lineTo(.37, -1.33); g.closePath(); g.fill();
    }
    if (f.id === 'kai' && p === 'drink' && hd) {
      g.fillStyle = L.ink; g.beginPath(); g.ellipse(hd.hx + .02, hd.hy - .02, .055, .032, -.4, 0, Math.PI * 2); g.fill();
    }
    if (A && A.jue && hd && p === 'raise') {
      var jx = hd.hx, jy = hd.hy - .06;
      g.strokeStyle = '#a8ecc8'; g.lineWidth = 3 / s;
      g.shadowColor = '#7fe0b0'; g.shadowBlur = 14;
      g.beginPath(); g.arc(jx, jy, .045, .45, Math.PI * 2 - .05); g.stroke();
      g.shadowBlur = 0;
    }
    g.restore();
    return { x: f.x + info.head.x * s * face, y: f.y + info.head.y * s };
  }

  function drawHorse(g, x, y, h, face, t, L, running) {
    g.save();
    g.translate(x, y); g.scale(h * face, h);
    var gal = running ? t * 9 : 0;
    g.fillStyle = L.ink;
    g.beginPath();
    // 胴
    g.moveTo(-.42, -.66);
    g.quadraticCurveTo(-.2, -.8, .2, -.76);
    g.quadraticCurveTo(.34, -.76, .4, -.72);
    // 首・頭
    g.quadraticCurveTo(.5, -.86, .6, -.98);
    g.quadraticCurveTo(.64, -1.03, .68, -1.0);
    g.lineTo(.88, -.83); g.quadraticCurveTo(.9, -.77, .84, -.76);
    g.quadraticCurveTo(.72, -.8, .64, -.8);
    g.quadraticCurveTo(.54, -.7, .46, -.56);
    // 腹
    g.quadraticCurveTo(.3, -.46, 0, -.46);
    g.quadraticCurveTo(-.3, -.46, -.42, -.52);
    g.quadraticCurveTo(-.48, -.6, -.42, -.66);
    g.closePath();
    // 耳
    g.moveTo(.62, -1.0); g.lineTo(.61, -1.09); g.lineTo(.67, -1.01); g.closePath();
    // 尾
    g.moveTo(-.42, -.64); g.quadraticCurveTo(-.62, -.6, -.6, -.3); g.quadraticCurveTo(-.55, -.32, -.52, -.36);
    g.quadraticCurveTo(-.52, -.56, -.4, -.58); g.closePath();
    // 脚（関節で折る）
    var legs = [[.3, 0], [.2, Math.PI], [-.3, Math.PI * .5], [-.2, Math.PI * 1.5]];
    legs.forEach(function (l) {
      var sw = running ? Math.sin(gal + l[1]) : 0;
      var kx = l[0] + sw * .1, ky = -.27, fx = l[0] + sw * .18 - (running ? Math.max(0, -sw) * .05 : 0), fy = running ? -.02 - Math.max(0, sw) * .06 : 0;
      g.moveTo(l[0] - .045, -.5); g.lineTo(l[0] + .045, -.5);
      g.lineTo(kx + .025, ky); g.lineTo(fx + .03, fy); g.lineTo(fx - .03, fy); g.lineTo(kx - .025, ky); g.closePath();
    });
    g.fill();
    g.strokeStyle = rgba(hex2rgb(L.rim), .5); g.lineWidth = 2 / h;
    g.beginPath(); g.moveTo(.4, -.73); g.quadraticCurveTo(.5, -.86, .6, -.98); g.stroke();
    g.beginPath(); g.moveTo(-.4, -.67); g.quadraticCurveTo(-.2, -.8, .2, -.77); g.stroke();
    g.restore();
  }

  /* ============================ 動く道具 ============================ */
  function fire(g, x, y, s, t, L, seed) {
    var f1 = Math.sin(t * 13 + seed) * .5 + Math.sin(t * 7.3 + seed * 3) * .5;
    var gl = g.createRadialGradient(x, y - s * .4, 0, x, y - s * .4, s * 4.2);
    gl.addColorStop(0, 'rgba(255,170,80,' + (0.38 + f1 * 0.08) + ')');
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.fillRect(x - s * 4.2, y - s * 4.6, s * 8.4, s * 8.4);
    g.fillStyle = '#ffb35c';
    g.beginPath();
    g.moveTo(x - s * .45, y);
    g.quadraticCurveTo(x - s * .5, y - s * .6, x + f1 * s * .15, y - s * (1.3 + f1 * .2));
    g.quadraticCurveTo(x + s * .5, y - s * .6, x + s * .45, y);
    g.closePath(); g.fill();
    g.fillStyle = '#fff1c8';
    g.beginPath(); g.ellipse(x, y - s * .25, s * .18, s * .35, 0, 0, Math.PI * 2); g.fill();
  }
  function flag(g, x, y, h, color, t, glyph, seed) {
    g.strokeStyle = '#0a0808'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    var fw = h * .38, fh = h * .5, top = y - h;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, top);
    for (var i = 0; i <= 8; i++) {
      var u = i / 8;
      g.lineTo(x + fw * u, top + Math.sin(t * 3 + u * 5 + seed) * 5 * u);
    }
    for (i = 8; i >= 0; i--) {
      var v = i / 8;
      g.lineTo(x + fw * v, top + fh + Math.sin(t * 3 + v * 5 + seed + .5) * 6 * v);
    }
    g.closePath(); g.fill();
    if (glyph) {
      g.fillStyle = 'rgba(255,240,220,.85)';
      g.font = 'bold ' + Math.round(fh * .42) + 'px serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(glyph, x + fw * .5, top + fh * .5 + Math.sin(t * 3 + 2.5 + seed) * 3);
    }
  }
  function lampGlow(g, x, y, r, t, L, seed) {
    var f = 1 + Math.sin(t * 9 + seed) * .04 + Math.sin(t * 23 + seed) * .03;
    var gl = g.createRadialGradient(x, y, 0, x, y, r * f);
    gl.addColorStop(0, 'rgba(255,190,110,.55)');
    gl.addColorStop(.25, 'rgba(255,150,70,.22)');
    gl.addColorStop(1, 'rgba(255,120,50,0)');
    g.fillStyle = gl;
    g.fillRect(x - r * f, y - r * f, r * 2 * f, r * 2 * f);
    g.fillStyle = '#fff0c8';
    g.beginPath(); g.ellipse(x, y, 4, 8 * f, 0, 0, Math.PI * 2); g.fill();
  }

  /* ============================ 舞台 ============================ */
  /* layers: 遠→近の順。d=奥行き。st=動かない絵（キャッシュ）, dy=毎フレームの絵
     pos: 人物の既定の立ち位置。focus: 寄りの既定倍率 */
  var STAGES = {
    bashang: {
      focusZ: 1.7,
      pos: { hai: { x: 690, y: 800, h: 300, face: 1 }, ryo: { x: 900, y: 806, h: 285, face: -1 }, kai: { x: 520, y: 810, h: 310, face: 1 } },
      wide: { x: 800, y: 450, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .2, st: function (g, L) {
          ridge(g, 11, -M, W + M, 520, 120, .55, L.far, L.mid);
          fogBand(g, 520, 70, L, L.fogA);
        } },
        { d: .45, st: function (g, L) {
          ridge(g, 23, -M, W + M, 610, 70, .5, L.mid, L.near);
          var R = rng(5);
          for (var i = 0; i < 70; i++) {
            var x = R() * (W + 2 * M) - M, y = 600 + R() * 60, s = 18 + (y - 600) * .5;
            tent(g, x, y, s * 1.6, s, L.near, null);
          }
          fogBand(g, 640, 40, L, L.fogA * .7);
        }, dy: function (g, L, t) {
          var R = rng(9);
          for (var i = 0; i < 14; i++) {
            var x = R() * W, y = 640 + R() * 40;
            g.fillStyle = 'rgba(200,190,200,.06)';
            for (var k = 0; k < 6; k++) {
              var yy = y - k * 26 - (t * 8 + i * 13) % 26;
              g.beginPath(); g.ellipse(x + Math.sin(t * .4 + k + i) * 10 + k * 6, yy, 8 + k * 4, 6 + k * 3, 0, 0, Math.PI * 2); g.fill();
            }
            fire(g, x, y, 5, t, L, i);
          }
        } },
        { d: .8, st: function (g, L) {
          g.fillStyle = L.near;
          g.beginPath(); g.moveTo(-M, H + M); g.lineTo(-M, 760); g.quadraticCurveTo(500, 700, 800, 735); g.quadraticCurveTo(1200, 770, W + M, 720); g.lineTo(W + M, H + M); g.closePath(); g.fill();
        }, dy: function (g, L, t) {
          flag(g, 220, 780, 260, '#9a2a20', t, '沛', 1);
          flag(g, 1300, 760, 240, '#9a2a20', t, '', 2);
          flag(g, 1460, 790, 300, '#8a221a', t, '', 3);
        } },
        { d: 1, fig: true }
      ]
    },

    koumon: {
      focusZ: 1.75,
      pos: { u: { x: 560, y: 820, h: 360, face: 1 }, zo: { x: 880, y: 820, h: 290, face: -1 }, msg: { x: 1130, y: 830, h: 300, face: -1, pose: 'kneel' },
             haku: { x: 900, y: 826, h: 310, face: -1 } },
      wide: { x: 800, y: 470, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .2, st: function (g, L) { ridge(g, 41, -M, W + M, 540, 140, .55, L.far, L.mid); fogBand(g, 560, 60, L, L.fogA); } },
        { d: .5, st: function (g, L) {
          g.fillStyle = L.mid; g.fillRect(-M, 600, W + 2 * M, H);
          var R = rng(77);
          for (var i = 0; i < 420; i++) {
            var x = R() * (W + 2 * M) - M, y = 590 + Math.pow(R(), 1.6) * 120, s = .8 + (y - 590) / 50;
            var gl = g.createRadialGradient(x, y, 0, x, y, s * 6);
            gl.addColorStop(0, 'rgba(255,170,90,.55)'); gl.addColorStop(1, 'rgba(255,120,60,0)');
            g.fillStyle = gl; g.fillRect(x - s * 6, y - s * 6, s * 12, s * 12);
            g.fillStyle = '#ffcf8a'; g.fillRect(x - s * .5, y - s * .5, s, s);
          }
          tent(g, 800, 660, 320, 150, L.near, 'rgba(255,170,90,.55)');
        } },
        { d: .8, st: function (g, L) {
          g.fillStyle = L.near;
          g.beginPath(); g.moveTo(-M, H + M); g.lineTo(-M, 790); g.quadraticCurveTo(800, 760, W + M, 795); g.lineTo(W + M, H + M); g.closePath(); g.fill();
        }, dy: function (g, L, t) {
          flag(g, 160, 820, 380, '#141016', t, '楚', 4);
          flag(g, 1380, 812, 360, '#141016', t, '項', 5);
          fire(g, 330, 700, 22, t, L, 1);
          g.fillStyle = L.ink; g.fillRect(326, 700, 8, 140);
          fire(g, 1260, 690, 22, t, L, 2);
          g.fillStyle = L.ink; g.fillRect(1256, 690, 8, 150);
        } },
        { d: 1, fig: true }
      ],
      embers: [[330, 680], [1260, 670]]
    },

    tent: {
      focusZ: 1.65, indoor: true,
      pos: { hai: { x: 560, y: 800, h: 290, face: 1, pose: 'sit' }, ryo: { x: 1060, y: 800, h: 270, face: -1, pose: 'sit' },
             haku: { x: 700, y: 812, h: 330, face: 1 }, u: { x: 640, y: 800, h: 320, face: 1, pose: 'sit' }, gu: { x: 1000, y: 812, h: 330, face: -1 } },
      wide: { x: 800, y: 500, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { g.fillStyle = L.sky[0]; g.fillRect(-M, -M, W + 2 * M, H + 2 * M); } },
        { d: .55, st: function (g, L) {
          curtainWall(g, -M, W + M, 40, 740, L, 14);
          g.fillStyle = L.ink;
          g.fillRect(250, 20, 16, 740); g.fillRect(1340, 20, 16, 740);
          g.beginPath(); g.moveTo(-M, 40); g.quadraticCurveTo(800, 140, W + M, 40); g.lineTo(W + M, -M); g.lineTo(-M, -M); g.closePath(); g.fill();
        } },
        { d: .8, st: function (g, L) {
          var gr = g.createLinearGradient(0, 730, 0, H + M);
          gr.addColorStop(0, L.ground); gr.addColorStop(1, '#000');
          g.fillStyle = gr; g.fillRect(-M, 730, W + 2 * M, H + M);
          g.fillStyle = 'rgba(120,90,50,.18)';
          g.fillRect(380, 770, 840, 50);
          lowTable(g, 820, 812, 150, L);
        }, dy: function (g, L, t) {
          lampGlow(g, 820, 740, L.cold ? 520 : 620, t, L, 1);
        } },
        { d: 1, fig: true, shadow: { x: 820, y: 740, wallY: 720 } }
      ],
      dust: true
    },

    gate: {
      focusZ: 1.7,
      pos: { kai: { x: 1210, y: 830, h: 360, face: -1 }, ryo: { x: 1000, y: 830, h: 300, face: 1 }, hai: { x: 820, y: 830, h: 320, face: 1 },
             ei: { x: 495, y: 820, h: 330, face: 1 }, zo: { x: 640, y: 830, h: 300, face: 1 }, sou: { x: 920, y: 830, h: 330, face: -1 },
             chin: { x: 1240, y: 830, h: 310, face: -1 } },
      wide: { x: 800, y: 470, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .25, st: function (g, L) {
          ridge(g, 51, -M, W + M, 560, 110, .5, L.far, L.mid); fogBand(g, 570, 60, L, L.fogA);
          var R = rng(14);
          for (var i = 0; i < 40; i++) { var x = R() * (W + 2 * M) - M; tent(g, x, 640 + R() * 20, 70, 50, L.mid, null); }
        } },
        { d: .6, st: function (g, L) {
          palisade(g, 720, 220, L, 470, 640);
          g.fillStyle = L.near;
          g.fillRect(450, 440, 22, 290); g.fillRect(640, 440, 22, 290);
          g.fillRect(420, 430, 270, 26);
          g.beginPath(); g.moveTo(400, 432); g.lineTo(556, 380); g.lineTo(712, 432); g.closePath(); g.fill();
        }, dy: function (g, L, t) {
          flag(g, 380, 720, 330, '#141016', t, '楚', 6);
          flag(g, 770, 720, 330, '#141016', t, '', 7);
        } },
        { d: .85, st: function (g, L) {
          var gr = g.createLinearGradient(0, 720, 0, H + M);
          gr.addColorStop(0, L.ground); gr.addColorStop(1, L.near);
          g.fillStyle = gr; g.fillRect(-M, 720, W + 2 * M, H + M);
        } },
        { d: 1, fig: true }
      ]
    },

    feast: {
      focusZ: 1.6, indoor: true,
      pos: { zo: { x: 800, y: 560, h: 230, face: 1, pose: 'sit', front: 1 },
             u: { x: 400, y: 690, h: 300, face: 1, pose: 'sit' }, haku: { x: 230, y: 660, h: 270, face: 1, pose: 'sit' },
             ryo: { x: 1230, y: 690, h: 280, face: -1, pose: 'kneel' },
             hai: { x: 800, y: 1010, h: 420, face: 1, pose: 'sit', back: 1 },
             sou: { x: 900, y: 800, h: 330, face: -1, pose: 'dance' },
             kai: { x: 1080, y: 770, h: 360, face: -1, pose: 'glare' } },
      wide: { x: 800, y: 520, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { g.fillStyle = L.sky[0]; g.fillRect(-M, -M, W + 2 * M, H + 2 * M); } },
        { d: .5, st: function (g, L) {
          curtainWall(g, -M, W + M, 60, 600, L, 18);
          // 天井の張り
          g.fillStyle = L.ink;
          g.beginPath(); g.moveTo(-M, 60); g.quadraticCurveTo(400, 170, 800, 90); g.quadraticCurveTo(1200, 170, W + M, 60); g.lineTo(W + M, -M); g.lineTo(-M, -M); g.closePath(); g.fill();
          g.fillRect(150, 40, 14, 560); g.fillRect(1440, 40, 14, 560); g.fillRect(793, 40, 14, 150);
          if (L.indoor > .5) {
            // 天幕を透ける昼の光
            var sh = g.createLinearGradient(0, 60, 0, 600);
            sh.addColorStop(0, 'rgba(255,245,220,.28)'); sh.addColorStop(1, 'rgba(255,245,220,0)');
            g.fillStyle = sh; g.fillRect(-M, 60, W + 2 * M, 540);
          }
        } },
        { d: .75, st: function (g, L) {
          var gr = g.createLinearGradient(0, 590, 0, H + M);
          gr.addColorStop(0, L.ground); gr.addColorStop(1, '#000');
          g.fillStyle = gr; g.fillRect(-M, 590, W + 2 * M, H + 2 * M);
          // 席（筵）
          g.fillStyle = 'rgba(160,120,60,.22)';
          g.beginPath(); g.moveTo(560, 600); g.lineTo(1040, 600); g.lineTo(1200, 760); g.lineTo(400, 760); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
          for (var i = 0; i < 8; i++) { var y = 600 + i * 20; g.beginPath(); g.moveTo(560 - i * 20, y); g.lineTo(1040 + i * 20, y); g.stroke(); }
          lowTable(g, 520, 700, 120, L); lowTable(g, 800, 618, 110, L); lowTable(g, 1110, 700, 120, L);
          // 灯台
          g.fillStyle = L.ink; g.fillRect(300, 480, 8, 200); g.fillRect(1300, 480, 8, 200);
        }, dy: function (g, L, t) {
          lampGlow(g, 304, 476, L.indoor > .5 ? 220 : 520, t, L, 1);
          lampGlow(g, 1304, 476, L.indoor > .5 ? 220 : 520, t, L, 2);
        } },
        { d: 1, fig: true }
      ],
      dust: true
    },

    road: {
      focusZ: 1.6,
      pos: { hai: { x: 980, y: 760, h: 260, face: 1, horse: 1 }, kai: { x: 760, y: 790, h: 280, face: 1, pose: 'run' } },
      wide: { x: 800, y: 470, z: 1 },
      runners: [[600, 800, 260], [470, 805, 250], [360, 808, 245]],
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .2, st: function (g, L) { ridge(g, 61, -M, W + M, 480, 260, .55, L.far, L.mid); fogBand(g, 520, 80, L, L.fogA); } },
        { d: .5, st: function (g, L) {
          ridge(g, 62, -M, W + M, 640, 120, .5, L.mid, L.near);
          var R = rng(8);
          for (var i = 0; i < 26; i++) pine(g, R() * (W + 2 * M) - M, 640 + R() * 40, 90 + R() * 80, L.near, i + 3);
        } },
        { d: .85, st: function (g, L) {
          g.fillStyle = L.near; g.fillRect(-M, 760, W + 2 * M, H);
          g.fillStyle = 'rgba(200,215,255,.08)';
          g.beginPath(); g.moveTo(-M, 800); g.quadraticCurveTo(800, 760, W + M, 790); g.lineTo(W + M, 830); g.quadraticCurveTo(800, 800, -M, 845); g.closePath(); g.fill();
          pine(g, 140, 860, 420, L.ink, 91); pine(g, 1480, 870, 460, L.ink, 92);
        } },
        { d: 1, fig: true }
      ],
      mist: true
    },

    gaixia: {
      focusZ: 1.7,
      pos: { u: { x: 760, y: 820, h: 360, face: -1 } },
      horse: { x: 1180, y: 830, h: 300, face: -1 },
      wide: { x: 800, y: 470, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .25, st: function (g, L) { ridge(g, 71, -M, W + M, 560, 140, .5, L.far, L.mid); } },
        { d: .5, st: function (g, L) {
          ridge(g, 72, -M, W + M, 650, 90, .5, L.mid, L.near);
        }, dy: function (g, L, t) {
          var R = rng(73);
          for (var i = 0; i < 90; i++) {
            var x = R() * (W + 2 * M) - M, y = 540 + R() * 120, s = 2 + R() * 3;
            var fl = .6 + Math.sin(t * 5 + i) * .25;
            var gl = g.createRadialGradient(x, y, 0, x, y, s * 7);
            gl.addColorStop(0, 'rgba(255,160,80,' + (.5 * fl) + ')'); gl.addColorStop(1, 'rgba(255,110,50,0)');
            g.fillStyle = gl; g.fillRect(x - s * 7, y - s * 7, s * 14, s * 14);
          }
        } },
        { d: .8, st: function (g, L) {
          var gr = g.createLinearGradient(0, 720, 0, H + M);
          gr.addColorStop(0, '#8f9ab0'); gr.addColorStop(1, '#3a4252');
          g.fillStyle = gr; g.fillRect(-M, 730, W + 2 * M, H + M);
          palisade(g, 760, 160, L, 640, 960);
        } },
        { d: 1, fig: true }
      ],
      snow: true
    },

    ukou: {
      focusZ: 1.7,
      pos: { u: { x: 720, y: 820, h: 360, face: 1 }, tei: { x: 1060, y: 800, h: 290, face: -1 }, rba: { x: 300, y: 830, h: 330, face: 1 } },
      horse: { x: 470, y: 830, h: 300, face: 1 },
      wide: { x: 800, y: 470, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { skyFill(g, L); } },
        { d: .2, st: function (g, L) { ridge(g, 81, -M, W + M, 560, 70, .5, L.far, L.mid); fogBand(g, 590, 60, L, L.fogA); } },
        { d: .5, st: function (g, L) {
          var gr = g.createLinearGradient(0, 600, 0, 720);
          gr.addColorStop(0, 'rgba(200,190,200,.55)'); gr.addColorStop(1, 'rgba(90,100,120,.9)');
          g.fillStyle = gr; g.fillRect(-M, 600, W + 2 * M, 130);
          g.fillStyle = L.near;
          g.beginPath(); g.moveTo(1180, 700); g.quadraticCurveTo(1300, 730, 1460, 700); g.lineTo(1430, 718); g.quadraticCurveTo(1300, 740, 1200, 716); g.closePath(); g.fill();
          g.strokeStyle = L.near; g.lineWidth = 4; g.beginPath(); g.moveTo(1330, 712); g.lineTo(1380, 540); g.stroke();
        } },
        { d: .85, st: function (g, L) {
          g.fillStyle = L.near;
          g.beginPath(); g.moveTo(-M, H + M); g.lineTo(-M, 760); g.quadraticCurveTo(800, 720, W + M, 750); g.lineTo(W + M, H + M); g.closePath(); g.fill();
          var R = rng(44);
          g.strokeStyle = L.near; g.lineWidth = 2;
          for (var i = 0; i < 160; i++) { var x = R() * (W + 2 * M) - M, h = 40 + R() * 70; g.beginPath(); g.moveTo(x, 760); g.quadraticCurveTo(x + 6, 760 - h * .6, x + (R() - .5) * 20, 760 - h); g.stroke(); }
        } },
        { d: 1, fig: true }
      ],
      mist: true
    },

    nangong: {
      focusZ: 1.6, indoor: true,
      pos: { ko: { x: 800, y: 560, h: 260, face: 1, pose: 'sit', front: 1 }, ou: { x: 1120, y: 830, h: 330, face: -1, pose: 'kneel' } },
      officials: [[420, 830, 330, 1], [260, 860, 340, 1], [1290, 860, 340, -1]],
      wide: { x: 800, y: 500, z: 1 },
      layers: [
        { d: 0, st: function (g, L) { g.fillStyle = L.sky[0]; g.fillRect(-M, -M, W + 2 * M, H + 2 * M); } },
        { d: .5, st: function (g, L) {
          curtainWall(g, -M, W + M, 0, 600, L, 10);
          g.fillStyle = '#3a0e08';
          [180, 480, 1120, 1420].forEach(function (x) { g.fillRect(x - 22, -M, 44, 900); });
          g.fillStyle = 'rgba(255,200,120,.12)';
          [180, 480, 1120, 1420].forEach(function (x) { g.fillRect(x - 8, -M, 6, 900); });
          // 玉座の段
          g.fillStyle = L.ink;
          g.fillRect(560, 560, 480, 24); g.fillRect(600, 584, 400, 24); g.fillRect(640, 530, 320, 30);
          g.fillStyle = 'rgba(255,210,120,.25)'; g.fillRect(560, 560, 480, 3); g.fillRect(600, 584, 400, 3);
        }, dy: function (g, L, t) {
          [330, 1270].forEach(function (x, i) { lampGlow(g, x, 300, 380, t, L, i); g.fillStyle = '#c0502a'; g.beginPath(); g.ellipse(x, 300, 26, 34, 0, 0, Math.PI * 2); g.fill(); });
        } },
        { d: .8, st: function (g, L) {
          var gr = g.createLinearGradient(0, 600, 0, H + M);
          gr.addColorStop(0, L.ground); gr.addColorStop(1, '#000');
          g.fillStyle = gr; g.fillRect(-M, 600, W + 2 * M, H + M);
        } },
        { d: 1, fig: true }
      ],
      dust: true
    }
  };

  /* ============================ 状態 ============================ */
  var S = {
    cv: null, g: null, ov: null, dpr: 1, cw: 0, ch: 0, running: false, raf: 0, t0: 0, t: 0,
    stage: null, stageId: '', light: null, lightId: '', cast: {}, poses: {},
    cam: { x: 800, y: 450, z: 1 }, from: null, to: null, tStart: 0, tDur: 1.6, drift: 0,
    shake: 0, flash: 0, flashC: '255,255,255', pulse: 0,
    parts: [], cache: {}, labels: {}, heads: {}, reduced: false, onFrame: null, bubble: null
  };

  function mount(canvas, overlay) {
    S.cv = canvas; S.g = canvas.getContext('2d'); S.ov = overlay;
    S.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    resize();
  }
  function resize() {
    if (!S.cv) return;
    var r = S.cv.getBoundingClientRect();
    S.dpr = Math.min(2, window.devicePixelRatio || 1);
    S.cw = Math.max(1, r.width); S.ch = Math.max(1, r.height);
    S.cv.width = Math.round(S.cw * S.dpr); S.cv.height = Math.round(S.ch * S.dpr);
    S.cache = {};
  }

  function layerCanvas(li, layer) {
    var q = Math.min(1.25, Math.max(.55, (S.cw * S.dpr) / W));
    var key = S.stageId + '|' + S.lightId + '|' + li + '|' + q.toFixed(2);
    if (S.cache[key]) return S.cache[key];
    var c = document.createElement('canvas');
    c.width = Math.round((W + 2 * M) * q); c.height = Math.round((H + 2 * M) * q);
    var g = c.getContext('2d');
    g.setTransform(q, 0, 0, q, M * q, M * q);
    try { layer.st(g, S.light); } catch (e) { /* 描けない層は飛ばす */ }
    S.cache[key] = c;
    return c;
  }

  /** 舞台を切り替える。cast は登場人物 id の配列 */
  function setScene(stageId, lightId, cast, poses) {
    S.stageId = STAGES[stageId] ? stageId : 'bashang';
    S.stage = STAGES[S.stageId];
    S.lightId = LIGHTS[lightId] ? lightId : 'night';
    S.light = LIGHTS[S.lightId];
    S.cast = {};
    (cast || []).forEach(function (id) {
      var p = S.stage.pos[id];
      if (p) S.cast[id] = { id: id, x: p.x, y: p.y, h: p.h, face: p.face, pose: p.pose || 'stand', horse: p.horse, back: p.back, front: p.front, x0: p.x };
    });
    S.poses = {};
    if (poses) Object.keys(poses).forEach(function (k) { setPose(k, poses[k]); });
    S.parts = [];
    seedParticles();
    S.cam = { x: S.stage.wide.x, y: S.stage.wide.y, z: S.stage.wide.z };
    S.from = null; S.to = null; S.drift = 0;
    clearLabels();
    hideBubble();
  }
  function setPose(id, pose) {
    var f = S.cast[id];
    if (!f) return;
    f.pose = pose;
    if (id === 'sou' && pose === 'dance') f.x = f.x0;
  }

  /** カメラを寄せる。target は 'wide' か人物 id */
  function focus(target, z) {
    var st = S.stage; if (!st) return;
    var to;
    if (!target || target === 'wide' || !S.cast[target]) to = { x: st.wide.x, y: st.wide.y, z: st.wide.z };
    else {
      var f = S.cast[target];
      var hh = f.pose === 'sit' || f.pose === 'kneel' ? f.h * .45 : f.h * .58;
      to = { x: f.x, y: f.y - hh, z: z || st.focusZ };
      if (f.back) to = { x: f.x, y: f.y - f.h * .6, z: 1.35 };
    }
    S.from = { x: S.cam.x, y: S.cam.y, z: S.cam.z };
    S.to = to;
    S.tStart = S.t;
    S.tDur = S.reduced ? 0.001 : 1.7;
    S.drift = 0;
  }

  function effect(name) {
    if (S.reduced && (name === 'shake' || name === 'pulse')) { S.flash = .35; S.flashC = '255,255,255'; return; }
    if (name === 'flash') { S.flash = .85; S.flashC = '255,250,235'; spawnSparks(); }
    if (name === 'red') { S.flash = .6; S.flashC = '170,30,20'; }
    if (name === 'shake') S.shake = 1;
    if (name === 'pulse') S.pulse = 1;
    if (name === 'shatter') { S.flash = .5; S.flashC = '180,255,220'; spawnShards(); }
  }
  function spawnSparks() {
    var f = S.cast.sou || S.cast.zo || S.cast.kai;
    if (!f) return;
    for (var i = 0; i < 26; i++) S.parts.push({ k: 'spark', x: f.x, y: f.y - f.h * .7, vx: (Math.random() - .5) * 600, vy: -Math.random() * 400, life: .6 + Math.random() * .4, age: 0 });
  }
  function spawnShards() {
    var f = S.cast.zo; if (!f) return;
    for (var i = 0; i < 30; i++) S.parts.push({ k: 'shard', x: f.x + 40, y: f.y - 10, vx: (Math.random() - .5) * 500, vy: -200 - Math.random() * 300, life: 1.2, age: 0, r: Math.random() * 6 });
  }

  /* ---------- 粒子 ---------- */
  /** 場面に入った瞬間から雪や塵が画面全体にあるように、最初の分をばらまいておく */
  function seedParticles() {
    if (S.reduced) return;
    var st = S.stage, L = S.light, i;
    if (st.snow || L.snow) for (i = 0; i < 140; i++) S.parts.push({ k: 'snow', x: Math.random() * (W + 400) - 200, y: Math.random() * H, vx: -20, vy: 40 + Math.random() * 50, life: 30, age: Math.random() * 10, r: 1 + Math.random() * 2.4, d: .3 + Math.random() * .7 });
    if (st.dust) for (i = 0; i < 40; i++) S.parts.push({ k: 'dust', x: 300 + Math.random() * 1000, y: 200 + Math.random() * 600, vx: (Math.random() - .5) * 6, vy: -2 - Math.random() * 4, life: 8 + Math.random() * 6, age: Math.random() * 6 });
    if (st.mist) for (i = 0; i < 6; i++) S.parts.push({ k: 'mist', x: Math.random() * W, y: 620 + Math.random() * 200, vx: 18 + Math.random() * 14, vy: 0, life: 120, age: 0, r: 200 + Math.random() * 200 });
  }

  function updateParticles(dt) {
    var st = S.stage, L = S.light;
    var want = S.reduced ? 0 : 1;
    if (want && (st.snow || L.snow) && S.parts.filter(function (p) { return p.k === 'snow'; }).length < 160) {
      S.parts.push({ k: 'snow', x: Math.random() * (W + 400) - 200, y: -40, vx: -20 + Math.random() * 10, vy: 40 + Math.random() * 50, life: 30, age: 0, r: 1 + Math.random() * 2.4, d: .3 + Math.random() * .7 });
    }
    if (want && st.embers) {
      st.embers.forEach(function (e) {
        if (Math.random() < .35) S.parts.push({ k: 'ember', x: e[0] + (Math.random() - .5) * 20, y: e[1], vx: (Math.random() - .5) * 20, vy: -40 - Math.random() * 60, life: 1.6 + Math.random(), age: 0 });
      });
    }
    if (want && st.dust && S.parts.filter(function (p) { return p.k === 'dust'; }).length < 50) {
      S.parts.push({ k: 'dust', x: 300 + Math.random() * 1000, y: 200 + Math.random() * 600, vx: (Math.random() - .5) * 6, vy: -2 - Math.random() * 4, life: 8 + Math.random() * 6, age: 0 });
    }
    if (want && st.mist && S.parts.filter(function (p) { return p.k === 'mist'; }).length < 8) {
      S.parts.push({ k: 'mist', x: -300, y: 620 + Math.random() * 200, vx: 18 + Math.random() * 14, vy: 0, life: 120, age: 0, r: 200 + Math.random() * 200 });
    }
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.age += dt;
      if (p.k === 'spark' || p.k === 'shard') p.vy += 900 * dt;
      if (p.k === 'snow') p.vx = -20 + Math.sin(S.t + p.y * .01) * 20;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > p.life || p.y > H + 80 || p.x > W + 400) S.parts.splice(i, 1);
    }
  }
  function drawParticles(g) {
    S.parts.forEach(function (p) {
      var u = p.age / p.life;
      if (p.k === 'snow') { g.fillStyle = 'rgba(240,244,255,' + (.35 + p.d * .5) + ')'; g.beginPath(); g.arc(p.x, p.y, p.r * p.d * 1.4, 0, Math.PI * 2); g.fill(); }
      else if (p.k === 'ember') { g.fillStyle = 'rgba(255,' + Math.round(180 - u * 100) + ',80,' + (1 - u) + ')'; g.fillRect(p.x, p.y, 2.5, 2.5); }
      else if (p.k === 'dust') { g.fillStyle = 'rgba(255,230,190,' + (Math.sin(u * Math.PI) * .25) + ')'; g.fillRect(p.x, p.y, 2, 2); }
      else if (p.k === 'mist') {
        var gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, rgba(S.light.fog, .16)); gr.addColorStop(1, rgba(S.light.fog, 0));
        g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      else if (p.k === 'spark') { g.fillStyle = 'rgba(255,240,200,' + (1 - u) + ')'; g.fillRect(p.x, p.y, 3, 3); }
      else if (p.k === 'shard') { g.fillStyle = 'rgba(170,240,210,' + (1 - u) + ')'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.r, p.y + 2); g.lineTo(p.x + 2, p.y + p.r); g.closePath(); g.fill(); }
    });
  }

  /* ---------- 名札・吹き出し ---------- */
  function clearLabels() {
    Object.keys(S.labels).forEach(function (k) { var el = S.labels[k]; if (el.parentNode) el.parentNode.removeChild(el); });
    S.labels = {};
  }
  function labelFor(id) {
    if (S.labels[id]) return S.labels[id];
    if (!S.ov) return null;
    var ch = window.KOUMON && window.KOUMON.chars[id];
    if (!ch) return null;
    var el = document.createElement('div');
    el.className = 'km-label km-' + ch.side;
    el.textContent = ch.name;
    S.ov.appendChild(el);
    S.labels[id] = el;
    return el;
  }
  function showBubble(id, text, kind) {
    hideBubble();
    if (!S.ov || !S.cast[id]) return;
    var el = document.createElement('div');
    el.className = 'km-bub ' + (kind || '');
    el.textContent = text;
    S.ov.appendChild(el);
    S.bubble = { id: id, el: el };
    requestAnimationFrame(function () { el.classList.add('show'); });
  }
  function hideBubble() {
    if (S.bubble && S.bubble.el.parentNode) S.bubble.el.parentNode.removeChild(S.bubble.el);
    S.bubble = null;
  }

  /* ---------- 描画 ---------- */
  function layerView(d) {
    var base = Math.max(S.cw / W, S.ch / H);
    var cam = S.cam;
    var ez = 1 + (cam.z - 1) * d;
    var sc = base * ez;
    var ex = 800 + (cam.x - 800) * d, ey = 450 + (cam.y - 450) * d;
    var hw = S.cw / (2 * sc), hh = S.ch / (2 * sc);
    ex = Math.max(hw - M * .9, Math.min(W + M * .9 - hw, ex));
    ey = Math.max(hh - M * .9, Math.min(H + M * .9 - hh, ey));
    if (S.shake > 0) { ex += (Math.random() - .5) * 18 * S.shake; ey += (Math.random() - .5) * 12 * S.shake; }
    return { sc: sc, ex: ex, ey: ey };
  }
  function project(x, y) {
    var v = layerView(1);
    return { x: (x - v.ex) * v.sc + S.cw / 2, y: (y - v.ey) * v.sc + S.ch / 2 };
  }

  function frame(now) {
    if (!S.running) return;
    S.raf = requestAnimationFrame(frame);
    var t = now / 1000;
    var dt = S.t ? Math.min(.05, t - S.tLast) : .016;
    S.tLast = t;
    S.t = (S.t || 0) + dt;
    draw(dt);
  }

  function draw(dt) {
    var g = S.g, st = S.stage, L = S.light;
    if (!g || !st) return;
    // カメラ
    if (S.to) {
      var u = ease((S.t - S.tStart) / S.tDur);
      S.cam.x = S.from.x + (S.to.x - S.from.x) * u;
      S.cam.y = S.from.y + (S.to.y - S.from.y) * u;
      S.cam.z = S.from.z + (S.to.z - S.from.z) * u;
      if (u >= 1) { S.drift += S.reduced ? 0 : dt; S.cam.z = S.to.z * (1 + Math.min(.06, S.drift * .006)); S.cam.x = S.to.x + Math.sin(S.drift * .12) * 10; }
    } else if (!S.reduced) {
      S.drift += dt;
      S.cam.z = st.wide.z * (1 + Math.min(.05, S.drift * .005));
      S.cam.x = st.wide.x + Math.sin(S.drift * .1) * 16;
    }
    // 剣舞の項荘は沛公の席へ寄ってくる
    var sou = S.cast.sou;
    if (sou && sou.pose === 'dance' && !S.reduced) sou.x = sou.x0 + Math.sin(S.t * .9) * 120;

    updateParticles(dt);
    S.shake = Math.max(0, S.shake - dt * 2.2);
    S.flash = Math.max(0, S.flash - dt * 1.8);
    S.pulse = Math.max(0, S.pulse - dt * .8);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S.cv.width, S.cv.height);
    var dpr = S.dpr, heads = {};
    st.layers.forEach(function (layer, li) {
      var v = layerView(layer.d);
      g.setTransform(v.sc * dpr, 0, 0, v.sc * dpr, (S.cw / 2 - v.ex * v.sc) * dpr, (S.ch / 2 - v.ey * v.sc) * dpr);
      if (layer.st) g.drawImage(layerCanvas(li, layer), -M, -M, W + 2 * M, H + 2 * M);
      if (layer.dy) layer.dy(g, L, S.t);
      if (layer.fig) {
        // 壁に落ちる影（幕舎の灯）
        if (layer.shadow) {
          g.save(); g.globalAlpha = .28;
          Object.keys(S.cast).forEach(function (id) {
            var f = S.cast[id];
            var sf = { id: f.id, x: layer.shadow.x + (f.x - layer.shadow.x) * 1.5, y: layer.shadow.wallY, h: f.h * 1.5, face: f.face, pose: f.pose };
            var Ls = { ink: '#000', rim: '#000', rimA: 0 };
            drawFigure(g, sf, S.t, Ls);
          });
          g.restore();
        }
        var R = rng(3);
        if (st.officials) st.officials.forEach(function (o, i) { drawFigure(g, { id: 'ou', x: o[0], y: o[1], h: o[2], face: o[3], pose: 'kneel' }, S.t + i, L); });
        if (st.horse) drawHorse(g, st.horse.x, st.horse.y, st.horse.h, st.horse.face, S.t, L, false);
        if (st.runners) st.runners.forEach(function (r, i) { drawFigure(g, { id: 'kai', x: r[0] + Math.sin(S.t * 2 + i) * 6, y: r[1], h: r[2], face: 1, pose: 'run' }, S.t + i * .3, L); });
        var order = Object.keys(S.cast).map(function (k) { return S.cast[k]; }).sort(function (a, b) { return a.y - b.y; });
        order.forEach(function (f) {
          if (f.horse) {
            var bob = S.reduced ? 0 : Math.abs(Math.sin(S.t * 9)) * 8;
            drawHorse(g, f.x, f.y, f.h * 1.05, f.face, S.t, L, true);
            heads[f.id] = drawFigure(g, { id: f.id, x: f.x - 10, y: f.y - f.h * .62 - bob, h: f.h * .62, face: f.face, pose: 'sit' }, S.t, L);
            return;
          }
          var lf = st.indoor ? (f.x < 800 ? 1 : -1) * (f.face || 1) : 1;
          var hd = drawFigure(g, { id: f.id, x: f.x, y: f.y, h: f.h, face: f.face, pose: f.pose, lightFrom: lf, back: f.back }, S.t, L);
          if (f.id === 'ei' && f.pose !== 'gone') drawFigure(g, { id: 'ei', x: f.x + 150, y: f.y, h: f.h, face: -1, pose: f.pose }, S.t, L);
          if (hd) heads[f.id] = hd;
        });
        drawParticles(g);
        R = null;
      }
    });
    S.heads = heads;
    // 霧のかぶり・周辺減光
    g.setTransform(1, 0, 0, 1, 0, 0);
    var vg = g.createRadialGradient(S.cv.width / 2, S.cv.height * .45, Math.min(S.cv.width, S.cv.height) * .35, S.cv.width / 2, S.cv.height / 2, Math.max(S.cv.width, S.cv.height) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, S.cv.width, S.cv.height);
    if (S.pulse > 0) {
      var pg = g.createRadialGradient(S.cv.width / 2, S.cv.height / 2, S.cv.width * .2, S.cv.width / 2, S.cv.height / 2, S.cv.width * .8);
      pg.addColorStop(0, 'rgba(120,10,10,0)'); pg.addColorStop(1, 'rgba(140,20,10,' + (.5 * Math.sin(S.pulse * Math.PI)) + ')');
      g.fillStyle = pg; g.fillRect(0, 0, S.cv.width, S.cv.height);
    }
    if (S.flash > 0) { g.fillStyle = 'rgba(' + S.flashC + ',' + S.flash + ')'; g.fillRect(0, 0, S.cv.width, S.cv.height); }
    placeOverlay(heads);
    if (S.onFrame) S.onFrame();
  }

  function placeOverlay(heads) {
    Object.keys(S.cast).forEach(function (id) {
      var hd = heads[id], el = labelFor(id);
      if (!el) return;
      if (!hd || S.cast[id].pose === 'gone' || S.cast[id].pose === 'down') { el.style.display = 'none'; return; }
      var p = project(hd.x, hd.y - 6);
      el.style.display = '';
      el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) translate(-50%,-100%)';
    });
    if (S.bubble) {
      var h = heads[S.bubble.id];
      if (h) {
        var q = project(h.x, h.y - 46);
        S.bubble.el.style.left = Math.round(Math.max(90, Math.min(S.cw - 90, q.x))) + 'px';
        S.bubble.el.style.top = Math.round(Math.max(70, q.y)) + 'px';
      }
    }
  }

  function start() {
    if (S.running) return;
    S.running = true;
    S.tLast = 0;
    S.raf = requestAnimationFrame(frame);
  }
  function stop() {
    S.running = false;
    cancelAnimationFrame(S.raf);
  }
  /** テストと静止画用：一コマだけ描く */
  function renderOnce() { draw(.016); }

  window.KoumonStage = {
    mount: mount, resize: resize, setScene: setScene, setPose: setPose, focus: focus, effect: effect,
    start: start, stop: stop, renderOnce: renderOnce, project: project,
    showBubble: showBubble, hideBubble: hideBubble, clearLabels: clearLabels,
    STAGES: STAGES, LIGHTS: LIGHTS, S: S
  };
})();
