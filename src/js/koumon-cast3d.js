/* 楚漢の章 —— 3D の人物（漢代の衣装・甲冑・冠）と馬
 *
 * 顔・髪・手は SDF 彫刻（koumon-figkit.js：寝殿造り3D探訪の徒然草の人物と同じ作り方）。
 * 胴・衣・袖・甲冑・冠・持ち物は、関節つきの部品として組み、姿勢は関節の角度で作る。
 *
 * 考証のよりどころ（docs/soukan-visual-reference.md に詳しく）
 *   劉邦  史記・高祖本紀「隆準而龍顔、美須髯」→ 高い鼻・張り出した眉骨・長く豊かなひげ。
 *         劉氏冠（竹皮で骨を組み漆紗を張った長冠。後頭部から斜めに立つ板。馬王堆の木俑）。漢は赤。
 *   項羽  項羽本紀「長八尺余、力能扛鼎」・太史公曰「羽亦重瞳子」→ 大柄・一つの虹彩に二つの瞳。
 *         京劇『霸王別姫』の霸王にならい、黒漆の甲・赤い纓の兜・赤い披風・下がり気味の目尻。
 *   張良  留侯世家・太史公曰「状貌如婦人好女」→ ひげのない柔らかな顔立ち。
 *   樊噲  屠狗を業とした豪の者 → 濃いひげ・大柄・大きな盾。
 *   服    深衣（交領右衽・曲裾・広い袂・縁取り）、大帯と佩玉。兵は小札の甲・披膊・赤い幘（楊家湾漢墓の兵俑）。
 *   騅    爾雅・釈畜「蒼白雑毛、騅」→ 青みがかった白と黒のまだら。
 *
 * 単位 m / +Y 上 / 人物は +Z が正面（右手は -X 側）。
 * 公開: window.KM_CAST3D = { CAST, makeFigure, makeHorse, setQuality }
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;
  var PI = Math.PI, V3 = THREE.Vector3;
  var Q = 'high';

  /* ============================ 小道具 ============================ */
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function col(h) { return new THREE.Color(h); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function std(c, r, m, o) { var p = { color: col(c).convertSRGBToLinear(), roughness: r == null ? .85 : r, metalness: m || 0 }; if (o) for (var k in o) p[k] = o[k]; return new THREE.MeshStandardMaterial(p); }
  function mesh(g, m, cast, recv) { var x = new THREE.Mesh(g, m); x.castShadow = cast !== false; x.receiveShadow = recv !== false; return x; }
  function canvasTex(w, h, draw, srgb) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  var TEX = {};
  /** 織り目（色は頂点色で付けるので、ここは明暗だけ）。遠目に縞が出ないよう、ごく弱い糸目と、絹のむら */
  function weaveTex() {
    if (TEX.weave) return TEX.weave;
    TEX.weave = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#efefef'; g.fillRect(0, 0, w, h);
      var R = rng(5);
      // 絹のむら（大きく柔らかい明暗）
      for (var i = 0; i < 60; i++) {
        var x = R() * w, y = R() * h, r = 20 + R() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r);
        var v = R() < .5 ? '255,255,255' : '0,0,0';
        gr.addColorStop(0, 'rgba(' + v + ',.035)'); gr.addColorStop(1, 'rgba(' + v + ',0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (var yy = 0; yy < h; yy += 2) { g.fillStyle = 'rgba(0,0,0,' + (.008 + R() * .012) + ')'; g.fillRect(0, yy, w, 1); }
      for (var xx = 0; xx < w; xx += 2) { g.fillStyle = 'rgba(0,0,0,' + (.004 + R() * .01) + ')'; g.fillRect(xx, 0, 1, h); }
      // 節糸（ところどころの太い糸）
      for (i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, R() * h, w, 1); }
    }, false);
    TEX.weave.repeat.set(6, 6);
    return TEX.weave;
  }
  /** 小札（甲の一枚）：漆や鉄の照り、綴じ穴と鋲 */
  function plateTex(kind) {
    var key = 'plate' + kind;
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(64, 96, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, 0);
      if (kind === 'lacq') { gr.addColorStop(0, '#141216'); gr.addColorStop(.5, '#34303a'); gr.addColorStop(1, '#100e12'); }
      else { gr.addColorStop(0, '#4a4640'); gr.addColorStop(.5, '#8a847a'); gr.addColorStop(1, '#3e3a34'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      var vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(255,255,255,.18)'); vg.addColorStop(.4, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
      g.fillStyle = kind === 'lacq' ? '#c8a050' : '#d8d0c0';
      [[.3, .18], [.7, .18], [.3, .55], [.7, .55]].forEach(function (p) { g.beginPath(); g.arc(p[0] * w, p[1] * h, 3, 0, 7); g.fill(); });
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    });
    TEX[key].wrapS = TEX[key].wrapT = THREE.ClampToEdgeWrapping;
    return TEX[key];
  }
  /** 漆紗（劉氏冠の板）：黒い紗の目と、透けて見える竹の骨 */
  function gauzeTex() {
    if (TEX.gauze) return TEX.gauze;
    TEX.gauze = canvasTex(128, 256, function (g, w, h) {
      g.fillStyle = '#121012'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
      for (var i = -h; i < w + h; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
      g.fillStyle = 'rgba(60,44,30,.55)';
      [.18, .38, .62, .82].forEach(function (x) { g.fillRect(x * w - 2, 6, 4, h - 12); });
      g.fillRect(6, h * .3, w - 12, 3); g.fillRect(6, h * .62, w - 12, 3);
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    });
    TEX.gauze.wrapS = TEX.gauze.wrapT = THREE.ClampToEdgeWrapping;
    return TEX.gauze;
  }
  /** 錣（しころ）の小札の段：黒漆の札に金の鋲、赤い綴じ紐 */
  function plateBandTex() {
    if (TEX.pband) return TEX.pband;
    TEX.pband = canvasTex(64, 64, function (g, w, h) {
      g.fillStyle = '#7a1410'; g.fillRect(0, 0, w, h);
      var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#141218'); gr.addColorStop(.45, '#3a3640'); gr.addColorStop(1, '#100e12');
      g.fillStyle = gr; g.fillRect(3, 2, w - 6, h - 10);
      g.fillStyle = '#c8a050'; [[.3, .25], [.7, .25], [.5, .6]].forEach(function (p) { g.beginPath(); g.arc(p[0] * w, p[1] * h, 3, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(3, h - 12, w - 6, 4);
    });
    TEX.pband.repeat.set(26, 1);
    return TEX.pband;
  }
  /** 盾の雲気文 */
  function shieldTex() {
    if (TEX.shield) return TEX.shield;
    TEX.shield = canvasTex(256, 384, function (g, w, h) {
      g.fillStyle = '#5a1810'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#120806'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
      g.strokeStyle = '#d8c8a0'; g.lineWidth = 5;
      var R = rng(77);
      for (var i = 0; i < 9; i++) {
        var x = 40 + R() * (w - 80), y = 50 + R() * (h - 100);
        g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + 40, y - 30, x + 70, y + 10, x + 50, y + 30);
        g.bezierCurveTo(x + 30, y + 45, x + 10, y + 20, x + 28, y + 12);
        g.stroke();
      }
      g.fillStyle = '#120806'; g.fillRect(w / 2 - 6, 20, 12, h - 40);
    });
    return TEX.shield;
  }
  /** 屏風・漆器の雲気文（黒漆に朱） */
  function lacquerCloudTex(seed) {
    var key = 'lcloud' + seed;
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(512, 256, function (g, w, h) {
      g.fillStyle = '#120a08'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#a8301c'; g.lineWidth = 6; g.lineCap = 'round';
      var R = rng(seed);
      for (var i = 0; i < 26; i++) {
        var x = R() * w, y = R() * h, s = 20 + R() * 40;
        g.beginPath(); g.moveTo(x, y);
        g.bezierCurveTo(x + s, y - s * .8, x + s * 2, y + s * .2, x + s * 1.4, y + s * .7);
        g.bezierCurveTo(x + s, y + s, x + s * .4, y + s * .4, x + s * .9, y + s * .3);
        g.stroke();
      }
      g.strokeStyle = '#c89a40'; g.lineWidth = 3;
      for (i = 0; i < 12; i++) { var xx = R() * w, yy = R() * h; g.beginPath(); g.arc(xx, yy, 6 + R() * 8, R() * 3, R() * 3 + 3.5); g.stroke(); }
      g.strokeStyle = '#a8301c'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
    });
    return TEX[key];
  }

  /* 頂点色をまとめて塗る */
  function paintGeo(g, fn) {
    var p = g.attributes.position, n = p.count, c = new Float32Array(n * 3), tmp = new THREE.Color();
    for (var i = 0; i < n; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), i, tmp); tmp.convertSRGBToLinear(); c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  function clothMat(o) { return std(0xffffff, .88, 0, Object.assign({ map: weaveTex(), vertexColors: true, side: THREE.DoubleSide }, o || {})); }

  /* ============================ 人物の設定 ============================ */
  function headP(o) {
    var p = { catchlight: true, scalp: 'hair', hairC: 0x17130f, iris: [40, 28, 20], brow: 0x221c18, lipU: .0040, lipL: .0050, lipUvol: .0013, lipLvol: .0017, skin: 0xc49a74, skinRed: 0xb87c62 };
    for (var k in o) p[k] = o[k];
    return p;
  }
  /* robe: 表衣 / trim: 縁 / inner: 中衣（襟元の白）/ belt: 大帯 / pei: 佩玉 / cap: 冠 / armor: 'lacq'|'iron' / lace: 綴じ紐の色 */
  var CAST = {
    hai:  { h: 1.75, robe: 0x8a2418, trim: 0x1a0e0c, inner: 0xe8dcc4, belt: 0x1a0e0c, pei: 1, cap: 'liushi', sword: 1,
            head: headP({ seed: 301, age: 51, thin: .32, smile: .18, nose: 1.16, browK: 1.22, cran: [1, 1.05, 1.02], jaw: 1.02, beard: 'long', beardLen: .17, beardW: 1.45, whiskers3: 1.25, hairC: 0x16120f, hairGrey: .14, hairGloss: .55, wrinkles: .7, browDrop: .004, eyeOpenU: .0046, skin: 0xc29772 }) },
    ko:   { h: 1.75, robe: 0x140e10, trim: 0x8a2418, inner: 0xe8dcc4, belt: 0xa8842a, pei: 1, cap: 'mian',
            head: headP({ seed: 301, age: 56, thin: .38, smile: .28, nose: 1.16, browK: 1.22, cran: [1, 1.05, 1.02], jaw: 1.02, beard: 'long', beardLen: .19, beardW: 1.45, whiskers3: 1.25, hairC: 0x2a2420, hairGrey: .55, wrinkles: .95, skin: 0xc29772 }) },
    ryo:  { h: 1.68, robe: 0x56687a, trim: 0x1c2228, inner: 0xf0e8d8, belt: 0x22262c, pei: 1, cap: 'jinxian',
            head: headP({ seed: 302, age: 28, thin: 0, smile: .2, jaw: .88, nose: .93, browK: .82, beard: 'none', wrinkles: 0, eyeOpenU: .0056, lipUvol: .0017, lipLvol: .0022, skin: 0xd6b08e, skinRed: 0xc8907a, hairC: 0x0e0c0a, hairGloss: .6 }) },
    kai:  { h: 1.85, build: 1.22, robe: 0x4a2418, trim: 0x1a0e0c, armor: 'iron', lace: 0x6a1a10, cap: 'kabuto', shield: 1, sword: 1, legs: 0x2a2018,
            head: headP({ seed: 303, age: 38, thin: 0, smile: -.05, jaw: 1.2, browK: 1.38, nose: 1.12, browDrop: .014, beard: 'long', beardLen: .11, hairC: 0x0e0c0a, wrinkles: .55, skin: 0xb08262, skinRed: 0xa86a52 }) },
    u:    { h: 1.9, build: 1.2, robe: 0x5a0e0c, trim: 0xb08a2e, armor: 'lacq', lace: 0x8a1a12, gold: 1, cap: 'bawang', cape: 0x8a1410, sword: 1, legs: 0x1a1414,
            head: headP({ seed: 304, age: 27, thin: .05, smile: -.1, jaw: 1.14, browK: 1.32, nose: 1.06, eyeTilt: -.015, browDrop: .006, beard: 'long', beardLen: .05, hairC: 0x0a0808,
              doublePupil: true, irisR: .2, iris: [34, 22, 16], beardW: 1.3, whiskers3: 1.5, wrinkles: .2, eyeOpenU: .0062, skin: 0xbf9272 }) },
    zo:   { h: 1.64, robe: 0x4a4030, trim: 0x16120c, inner: 0xe0d6c0, belt: 0x241c14, pei: 0, jue: 1, cap: 'jinxian',
            head: headP({ seed: 305, age: 74, thin: .88, smile: -.1, hairC: 0xdcd6cc, beard: 'long', beardLen: .19, wrinkles: 1.4, spots: 10, browDrop: .016, nose: 1.08, iris: [62, 44, 32], hood: 1.25, hairThick: .005, topknot: .026 }) },
    haku: { h: 1.73, robe: 0x2a3450, trim: 0x10141e, inner: 0xe0d6c0, belt: 0x10141e, pei: 1, cap: 'jinxian', sword: 1,
            head: headP({ seed: 306, age: 50, thin: .4, smile: .15, beard: 'long', beardLen: .12, hairC: 0x1e1a16, hairGrey: .2, wrinkles: .7, nose: 1.03 }) },
    sou:  { h: 1.78, robe: 0x3a2a14, trim: 0x8a6a2a, armor: 'iron', lace: 0x4a2a10, cap: 'kabuto', sword: 1, legs: 0x2a2018,
            head: headP({ seed: 307, age: 22, thin: 0, smile: 0, jaw: 1.04, browK: 1.1, beard: 'none', wrinkles: 0, browDrop: .006 }) },
    chin: { h: 1.73, robe: 0x2e4a48, trim: 0x101a1a, inner: 0xe0d6c0, belt: 0x101a1a, pei: 1, cap: 'jinxian',
            head: headP({ seed: 308, age: 30, thin: .1, smile: .25, beard: 'long', beardLen: .04, wrinkles: .15, skin: 0xcca684 }) },
    msg:  { h: 1.66, robe: 0x5a4a34, trim: 0x2a2018, inner: 0xd8ccb0, belt: 0x2a2018, cap: 'ze',
            head: headP({ seed: 309, age: 34, thin: .3, beard: 'none', wrinkles: .35 }) },
    ei:   { h: 1.76, robe: 0x6a2a1e, trim: 0x2a1410, armor: 'iron', lace: 0x4a2414, cap: 'ze', halberd: 1, legs: 0x2a2018,
            head: headP({ seed: 310, age: 28, thin: .15, beard: 'none', wrinkles: .2 }) },
    gu:   { h: 1.6, robe: 0x9a1c2c, trim: 0x1a0e14, inner: 0xf2e8d4, belt: 0x2a1018, lady: 1, cap: 'lady',
            head: headP({ seed: 311, age: 20, thin: 0, smile: .22, beard: 'none', wrinkles: 0, jaw: .88, nose: .9, browK: .8, lipU: .0044, lipL: .0058, lipUvol: .0018, lipLvol: .0024,
              lip: 0xb04848, lipColL: 0xb85050, skin: 0xd8b292, skinRed: 0xd09a86, eyeOpenU: .0054, hairC: 0x0c0a0a, hairGloss: .65, topknot: 0 }) },
    ou:   { h: 1.7, robe: 0x2a4030, trim: 0x101a12, inner: 0xe0d6c0, belt: 0x101a12, pei: 1, cap: 'jinxian',
            head: headP({ seed: 312, age: 52, thin: .4, beard: 'long', beardLen: .11, wrinkles: .8, hairGrey: .3 }) },
    tei:  { h: 1.64, robe: 0x5a5444, trim: 0x2a2620, inner: 0xd8ccb0, belt: 0x2a2620, cap: 'ze', zeC: 0x3a3428,
            head: headP({ seed: 313, age: 64, thin: .7, smile: .2, hairC: 0xbab4a8, beard: 'long', beardLen: .13, wrinkles: 1.2, spots: 6 }) },
    rba:  { h: 1.77, robe: 0x7a2418, trim: 0x2a0e0a, armor: 'iron', lace: 0x6a1a10, cap: 'kabuto', sword: 1, legs: 0x2a2018,
            head: headP({ seed: 314, age: 34, thin: .2, beard: 'long', beardLen: .06, wrinkles: .4 }) }
  };

  /* ============================ 衣の形 ============================ */
  /* 胴：輪切りを積んだ形。断面は角の丸い長方形（超楕円）で、肩は高さとともに狭まる */
  var TORSO = [ // [y, 半幅, 奥行き]（胸の原点から）
    [-.33, .158, .112], [-.24, .156, .110], [-.12, .162, .116], [0, .172, .124], [.08, .185, .126],
    [.13, .198, .118], [.165, .19, .104], [.19, .158, .088], [.205, .11, .07], [.218, .075, .058], [.232, .062, .052]
  ];
  function torsoAt(y) {
    for (var i = 0; i < TORSO.length - 1; i++) {
      var a = TORSO[i], b = TORSO[i + 1];
      if (y <= b[0]) { var t = sstep(a[0], b[0], y); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    }
    var l = TORSO[TORSO.length - 1]; return [l[1], l[2]];
  }
  function sexp(c, n) { return Math.sign(c) * Math.pow(Math.abs(c), 2 / n); }
  function torsoGeo(s, b, color) {
    var rings = 26, segs = 56, y0 = TORSO[0][0], y1 = TORSO[TORSO.length - 1][0];
    var pos = [], idx = [];
    for (var r = 0; r <= rings; r++) {
      var y = lerp(y0, y1, r / rings), wd = torsoAt(y);
      var shoulder = sstep(.04, .17, y) * (1 - sstep(.19, .23, y));
      var W = wd[0] * (1 + (b - 1) * (.5 + shoulder * .6)), D = wd[1] * (1 + (b - 1) * .4);
      for (var k = 0; k <= segs; k++) {
        var a = k / segs * PI * 2, cx = Math.sin(a), cz = Math.cos(a);
        var x = sexp(cx, 2.6) * W, z = sexp(cz, 2.4) * D;
        if (z > 0) z += .012 * Math.exp(-x * x / .004) * sstep(-.05, .1, y) * (1 - sstep(.15, .2, y)); // 胸の膨らみ
        if (z < 0) z -= .01 * sstep(.05, .15, y) * (1 - sstep(.17, .21, y)); // 背の肩甲骨
        pos.push(x * s, y * s, z * s);
      }
    }
    for (r = 0; r < rings; r++) for (k = 0; k < segs; k++) { var i0 = r * (segs + 1) + k, i1 = i0 + segs + 1; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    var uv = []; for (r = 0; r <= rings; r++) for (k = 0; k <= segs; k++) uv.push(k / segs * 2, r / rings * 2);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    var c = col(color); paintGeo(g, function (x, y, z, i, t) { t.copy(c); });
    return g;
  }
  /** 胴の前面の z（x, y は胸の原点からの値・身の丈補正前）。超楕円の断面から逆算する */
  function frontZ(x, y, b) {
    var wd = torsoAt(y), shoulder = sstep(.04, .17, y) * (1 - sstep(.19, .23, y));
    var W = wd[0] * (1 + (b - 1) * (.5 + shoulder * .6)), D = wd[1] * (1 + (b - 1) * .4);
    var sa = Math.pow(clamp(Math.abs(x) / W, 0, .999), 2.6 / 2);
    var ca = Math.sqrt(Math.max(0, 1 - sa * sa));
    var z = D * Math.pow(ca, 2 / 2.4);
    z += .012 * Math.exp(-x * x / .004) * sstep(-.05, .1, y) * (1 - sstep(.15, .2, y));
    return z;
  }
  /** 胴の表面に沿う帯（襟・縁取り）。pts は [x, y]（胸の原点から） */
  function bandOnTorso(pts, width, s, b, color, lift) {
    var curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new V3(p[0], p[1], 0); }));
    var N = 40, pos = [], idx = [], nrm = [];
    for (var i = 0; i <= N; i++) {
      var p = curve.getPoint(i / N), tg = curve.getTangent(i / N);
      var side = new V3(-tg.y, tg.x, 0).normalize().multiplyScalar(width / 2);
      [-1, 1].forEach(function (sd) {
        var x = p.x + side.x * sd, y = p.y + side.y * sd;
        var z = frontZ(x, y, b) + (lift || .006);
        pos.push(x * s, y * s, z * s);
        nrm.push(0, 0, 1);
      });
      if (i < N) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, std(color, .75, 0, { side: THREE.DoubleSide }), false, true);
  }
  /** 裾（下衣）。面は surf(u, a) で決める（u: 腰 0 → 裾 1 / a: 周りの角度、0 が正面）。
      裾の縁は頂点色、曲裾（前身頃が体に巻きつく）の縁は面に沿わせた帯（g.userData.band）で描く */
  function skirtGeo(o) {
    var rings = 30, segs = 96, R = rng(o.seed || 1), ph = R() * 6;
    function surf(u, a, off) {
      var y = -o.len * u;
      var rad = lerp(o.r0, o.r1, Math.pow(u, .7)) + (u < .25 ? Math.sin(u / .25 * PI * .5) * o.hip : o.hip * (1 - (u - .25) * .4));
      var fold = Math.sin(a * 9 + ph + Math.sin(a * 3 + ph) * .9) * o.fold * u * u + Math.sin(a * 19 + ph * 2) * o.fold * .22 * u;
      var rr = rad + fold + (off || 0);
      var x = Math.sin(a) * rr, z = Math.cos(a) * rr * o.depth;
      if (z > 0) y += o.frontLift * u * u * (z / rr);
      if (o.seat) {
        var fr = Math.max(0, z) / (Math.abs(x) + Math.abs(z) + 1e-4);
        z += o.seat * Math.pow(u, .75) * fr * 1.1;
        x *= 1 + .18 * u;
        // 膝の上は平らに、床に着いた裾は広がる
        if (fr > .3 && u > .35) y = lerp(y, -o.len * .62 - (u - .35) * o.len * .25, fr * .6);
        if (u > .9) { x *= 1.04; z *= 1.02; }
      }
      return [x, y, z];
    }
    var pos = [], idx = [], uv = [];
    for (var r = 0; r <= rings; r++) {
      for (var k = 0; k <= segs; k++) {
        var u = r / rings, a = k / segs * PI * 2, q = surf(u, a);
        pos.push(q[0], q[1], q[2]); uv.push(k / segs * 4, u * 3);
      }
    }
    for (r = 0; r < rings; r++) for (var k2 = 0; k2 < segs; k2++) { var i0 = r * (segs + 1) + k2, i1 = i0 + segs + 1; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    var base = col(o.color), trim = col(o.trim);
    paintGeo(g, function (x, y, z, i, t) {
      var u2 = Math.floor(i / (segs + 1)) / rings;
      t.copy(u2 > .93 ? trim : base);
      if (u2 < .06) t.multiplyScalar(.85);
    });
    if (o.wrap) {
      // 曲裾の縁：右の腰から前を斜めに横切り、左の後ろへ巻き込む
      var N = 72, bp = [], bi = [], bu = [];
      for (var j = 0; j <= N; j++) {
        var uu = .02 + j / N * .91, la = -PI * .55 + uu * PI * 1.25, q0 = surf(uu, la, 0), rr2 = Math.max(.05, Math.sqrt(q0[0] * q0[0] + q0[2] * q0[2]));
        var hw = .028 / rr2;
        var A = surf(uu, la - hw, .0035), B = surf(uu, la + hw, .0035);
        bp.push(A[0], A[1], A[2], B[0], B[1], B[2]); bu.push(0, uu * 6, 1, uu * 6);
        if (j < N) { var c0 = j * 2; bi.push(c0, c0 + 1, c0 + 2, c0 + 1, c0 + 3, c0 + 2); }
      }
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi);
      bg.computeVertexNormals();
      paintGeo(bg, function (x, y, z, i, t) { t.copy(trim); });
      g.userData.band = bg;
    }
    return g;
  }
  /** 袖（袋の形の筒）。腕の軸は -Y。袂（たもと）は毎フレーム、世界の下向きへ垂らす（bag）。
      o.len 長さ / o.y0 始まりの高さ / o.r(u) 筒の半径 / o.H(u) 袂の深さ / o.sag 腕を垂らしたとき、袂が軸に沿って下がる量
      o.def 腕を垂らしたときの袂の向き（体の内側・やや後ろ）/ o.slide 腕を上げると袖口が肘のほうへ下がる / o.trim 袖口の縁の色 */
  function bagTube(o, mat) {
    var rings = o.rings || 16, segs = o.segs || 28, n = (rings + 1) * (segs + 1), y0 = o.y0 || 0;
    var pos = new Float32Array(n * 3), U = new Float32Array(n), SA = new Float32Array(n), CA = new Float32Array(n), RR = new Float32Array(n), HH = new Float32Array(n);
    var idx = [], uv = [], Hmax = 1e-6;
    for (var r = 0; r <= rings; r++) for (var k = 0; k <= segs; k++) {
      var i = r * (segs + 1) + k, u = r / rings, a = k / segs * PI * 2;
      U[i] = u; SA[i] = Math.sin(a); CA[i] = Math.cos(a);
      RR[i] = o.r(u) * (1 + .035 * Math.sin(a * 6 + u * 5) * sstep(.1, .6, u)); // 袖のしわ
      HH[i] = o.H ? o.H(u) : 0; Hmax = Math.max(Hmax, HH[i]);
      pos[i * 3] = SA[i] * RR[i]; pos[i * 3 + 1] = y0 - o.len * u; pos[i * 3 + 2] = CA[i] * RR[i];
      uv.push(k / segs * 2, u * 2);
    }
    for (r = 0; r < rings; r++) for (k = 0; k < segs; k++) {
      var ia = r * (segs + 1) + k, ib = ia + segs + 1;
      idx.push(ia, ib, ia + 1, ib, ib + 1, ia + 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    var c = col(o.color), tc = o.trim != null ? col(o.trim) : null;
    paintGeo(g, function (x, y, z, i, t) { t.copy(tc && U[i] > .9 ? tc : c); if (U[i] < .04) t.multiplyScalar(.9); });
    var m = mesh(g, mat);
    var def = (o.def || new V3(0, 0, -1)).clone(); def.y = 0; def.normalize();
    /** down: この筒から見た世界の下向き（単位ベクトル） */
    m.userData.bag = function (down) {
      var ax = -down.y, px = down.x, pz = down.z, L = Math.sqrt(px * px + pz * pz), bx = def.x, bz = def.z;
      if (L > 1e-3) {
        var t = sstep(.1, .45, L); bx = lerp(def.x, px / L, t); bz = lerp(def.z, pz / L, t);
        var bl = Math.sqrt(bx * bx + bz * bz) || 1; bx /= bl; bz /= bl;
      }
      var hs = lerp(.55, 1, sstep(.1, .6, L)), hang = Math.max(0, ax), up = o.slide ? Math.max(0, -ax) : 0;
      for (var i = 0; i < n; i++) {
        var u = U[i], w = SA[i] * bx + CA[i] * bz, wq = w > 0 ? Math.pow(w, 1.3) : 0, H = HH[i] * hs * (1 - .7 * up);
        var side = Math.max(0, w * .5 + .5); side *= side;
        var rr = RR[i] * (1 + .3 * side * HH[i] / Hmax);
        var y = y0 - o.len * u * (1 - .4 * up * sstep(.15, 1, u)) - (o.sag || 0) * sstep(.3, 1, u) * wq * hang;
        pos[i * 3] = SA[i] * rr + bx * H * wq; pos[i * 3 + 1] = y; pos[i * 3 + 2] = CA[i] * rr + bz * H * wq;
      }
      g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    };
    return m;
  }

  /** 履。kind 'qiao'：歧頭履（つま先が二つに割れて反り上がる。馬王堆の出土品）/ 'boot'：兵の履。原点は底の中心 */
  function shoeMesh(kind, s, color) {
    var g = new THREE.Group(), m = std(color || 0x141010, .55, 0);
    var sg = new THREE.SphereGeometry(1, 22, 12), p = sg.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = Math.max(-.25, p.getY(i)), z = p.getZ(i), w = z > 0 ? 1 - .28 * z * z : 1 - .1 * z * z;
      var hh = kind === 'boot' ? (z < .2 ? 1.25 : .9) : .85;
      p.setXYZ(i, x * .046 * w * s, (y + .25) * .034 * hh * s, z * .122 * s + .02 * s);
    }
    sg.computeVertexNormals();
    g.add(mesh(sg, m));
    var sole = mesh(new THREE.CylinderGeometry(1, 1, .008 * s, 22), std(0x4a3828, .85)); sole.scale.set(.048 * s, 1, .124 * s); sole.position.set(0, .003 * s, .02 * s); g.add(sole);
    if (kind === 'qiao') {
      [-1, 1].forEach(function (sd) {
        var t = mesh(new THREE.BoxGeometry(.017 * s, .04 * s, .007 * s, 1, 3, 1), m); t.position.set(sd * .012 * s, .03 * s, .135 * s); t.rotation.set(-.42, 0, sd * .14); g.add(t);
      });
    }
    return g;
  }

  /* ============================ 冠 ============================ */
  function hatMesh(kind, c) {
    var g = new THREE.Group();
    var lac = std(0x0c0a0a, .32, .08), gold = std(0xc8a048, .3, .85), bron = std(0x6a5430, .4, .7);
    function cord(x0, y0, z0, x1, y1, z1) { var cv = new THREE.LineCurve3(new V3(x0, y0, z0), new V3(x1, y1, z1)); g.add(mesh(new THREE.TubeGeometry(cv, 4, .0022, 5), lac, false)); }
    if (kind === 'liushi') {
      // 劉氏冠（長冠・鵲尾冠）：劉邦が亭長のころ竹皮で作らせた冠（史記・高祖本紀）。
      // 髻の上の台から、長い板が後ろへ反りながら立つ。漆紗で黒く、表に竹の骨の筋が透ける。馬王堆一号墓の冠人俑にならう
      var sha = std(0xffffff, .42, .04, { map: gauzeTex(), side: THREE.DoubleSide });
      var L = .21, W0 = .06, W1 = .096, T = .009;
      var shp = new THREE.Shape();
      shp.moveTo(-W0 / 2, 0); shp.lineTo(W0 / 2, 0); shp.lineTo(W1 / 2, L * .86);
      shp.quadraticCurveTo(W1 / 2, L, 0, L); shp.quadraticCurveTo(-W1 / 2, L, -W1 / 2, L * .86); shp.closePath();
      var bg2 = new THREE.ExtrudeGeometry(shp, { depth: T, bevelEnabled: true, bevelSize: .0025, bevelThickness: .002, bevelSegments: 2, curveSegments: 8, steps: 1 });
      // 板を、中心線（二次ベジェ）に沿って後ろへ反らせる
      var P0 = new V3(0, .13, .04), P1 = new V3(0, .235, .01), P2 = new V3(0, .285, -.125);
      var bz = new THREE.QuadraticBezierCurve3(P0, P1, P2), bp2 = bg2.attributes.position, uv2 = bg2.attributes.uv;
      for (var i = 0; i < bp2.count; i++) {
        var x = bp2.getX(i), y = bp2.getY(i), z = bp2.getZ(i) - T / 2, t = clamp(y / L, 0, 1);
        var pt = bz.getPoint(t), tg = bz.getTangent(t), nrm = new V3(0, -tg.z, tg.y).normalize();
        bp2.setXYZ(i, x, pt.y + nrm.y * z, pt.z + nrm.z * z);
        uv2.setXY(i, x / W1 + .5, t);
      }
      bg2.computeVertexNormals();
      g.add(mesh(bg2, sha));
      // 台（髻を包む）と、板を留める横木
      var seat = mesh(new THREE.CylinderGeometry(.03, .038, .05, 18), lac); seat.position.set(0, .135, .0); seat.rotation.x = -.35; seat.scale.z = 1.25; g.add(seat);
      var bar = mesh(new THREE.BoxGeometry(.066, .012, .016), lac); bar.position.set(0, .16, .035); bar.rotation.x = -.5; g.add(bar);
      // 纓（あごひも）：耳の前を通って、あごの下で結ぶ
      [-1, 1].forEach(function (sd) {
        var cv = new THREE.CatmullRomCurve3([new V3(sd * .03, .15, .02), new V3(sd * .07, .09, .03), new V3(sd * .078, .02, .035), new V3(sd * .062, -.06, .05), new V3(sd * .022, -.112, .066)]);
        g.add(mesh(new THREE.TubeGeometry(cv, 24, .0024, 5), lac, false));
        var tail = new THREE.CatmullRomCurve3([new V3(sd * .006, -.118, .07), new V3(sd * .012, -.15, .072), new V3(sd * .018, -.19, .066)]);
        g.add(mesh(new THREE.TubeGeometry(tail, 10, .002, 5), lac, false));
      });
      var knot2 = mesh(new THREE.SphereGeometry(.007, 8, 6), lac, false); knot2.position.set(0, -.116, .07); g.add(knot2);
    } else if (kind === 'jinxian') {
      // 進賢冠：前が高く後ろへ下がる板（梁）を、黒い幘の上にのせる
      var ze = mesh(new THREE.CylinderGeometry(.084, .09, .045, 28, 1, true), std(0x0e0c0c, .45, 0, { side: THREE.DoubleSide })); ze.position.set(0, .1, -.012); ze.rotation.x = .18; g.add(ze);
      var crownTop = mesh(new THREE.SphereGeometry(.085, 24, 10, 0, PI * 2, 0, PI * .45), lac); crownTop.position.set(0, .105, -.016); crownTop.scale.set(1, .5, 1.05); g.add(crownTop);
      var front = new THREE.Shape(); front.moveTo(-.05, 0); front.lineTo(.05, 0); front.quadraticCurveTo(.052, .06, .0, .085); front.quadraticCurveTo(-.052, .06, -.05, 0);
      var fg = new THREE.ExtrudeGeometry(front, { depth: .008, bevelEnabled: false }); fg.translate(0, 0, -.004);
      var fm = mesh(fg, lac); fm.position.set(0, .12, .02); fm.rotation.x = -.62; g.add(fm);
      var liang = mesh(new THREE.BoxGeometry(.006, .006, .1), std(0x2a2420, .5)); liang.position.set(0, .158, -.01); liang.rotation.x = -.62; g.add(liang);
      cord(.06, .11, .03, .058, -.03, .05); cord(-.06, .11, .03, -.058, -.03, .05);
    } else if (kind === 'bawang') {
      // 霸王の兜：黒漆の鉢に金の覆輪、額に金の飾り板と赤い玉。鉢のまわりは黒漆の小札の錣（頬から後ろへ）。
      // 頂の受け金から、赤く染めた毛の纓が四方へ垂れる
      var bowl = std(0x0e0c10, .26, .1);
      var hm = mesh(new THREE.SphereGeometry(.108, 36, 18, 0, PI * 2, 0, PI * .55), bowl); hm.scale.set(1.02, .98, 1.1); hm.position.set(0, .03, -.014); g.add(hm);
      for (var r3 = 0; r3 < 4; r3++) { var rib2 = mesh(new THREE.TorusGeometry(.1095, .0026, 5, 40, PI), gold, false); rib2.rotation.set(0, r3 * PI / 4, 0); rib2.position.set(0, .03, -.014); rib2.scale.set(1.02, .98, 1.1); g.add(rib2); }
      var rimG = new THREE.TorusGeometry(.108, .0075, 8, 48); rimG.rotateX(PI / 2);
      var rim = mesh(rimG, gold); rim.position.set(0, .047, -.014); rim.scale.set(1.025, 1, 1.105); g.add(rim);
      var crest = new THREE.Shape(); crest.moveTo(-.04, 0); crest.quadraticCurveTo(0, .016, .04, 0); crest.lineTo(.03, .04); crest.quadraticCurveTo(.024, .07, 0, .085); crest.quadraticCurveTo(-.024, .07, -.03, .04); crest.closePath();
      var cg = new THREE.ExtrudeGeometry(crest, { depth: .005, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 2 });
      var cm = mesh(cg, gold); cm.position.set(0, .048, .098); cm.rotation.x = -.3; g.add(cm);
      var orb = mesh(new THREE.SphereGeometry(.011, 14, 10), std(0xb01810, .2, .1, { emissive: col(0x500806), emissiveIntensity: .6 })); orb.position.set(0, .078, .108); g.add(orb);
      // 錣：前を空けて、頬・耳・うなじを包む（小札の段）
      for (var r4 = 0; r4 < 3; r4++) {
        var ng2 = new THREE.CylinderGeometry(.112 + r4 * .01, .122 + r4 * .01, .042, 36, 1, true, PI * .2, PI * 1.6);
        var nk3 = mesh(ng2, std(0x1a161c, .32, .1, { side: THREE.DoubleSide, map: plateBandTex() })); nk3.position.set(0, .03 - r4 * .036, -.018); nk3.scale.z = 1.06; g.add(nk3);
      }
      var hem = mesh(new THREE.TorusGeometry(.143, .004, 5, 40, PI * 1.6), gold, false); hem.rotation.set(PI / 2, 0, PI * .7); hem.position.set(0, -.054, -.018); hem.scale.set(1, 1.06, 1); g.add(hem);
      // 受け金と纓（毛の束）
      var holder = mesh(new THREE.CylinderGeometry(.008, .016, .045, 12), gold); holder.position.set(0, .14, -.012); g.add(holder);
      var cup = mesh(new THREE.SphereGeometry(.016, 12, 8, 0, PI * 2, 0, PI / 2), gold); cup.position.set(0, .16, -.012); g.add(cup);
      var plume = new THREE.Group(); plume.position.set(0, .168, -.012); g.add(plume);
      // 毛一本の形は長さ 1 で作り、長さ len で全体を縮める（しなりも長さに比例する）
      var strandG = new THREE.CylinderGeometry(.012, .03, 1, 5, 6); strandG.translate(0, -.5, 0);
      var sp = strandG.attributes.position; for (i = 0; i < sp.count; i++) { var sy = sp.getY(i); sp.setZ(i, sp.getZ(i) + sy * sy * .7); }
      strandG.computeVertexNormals();
      var NS = 150, im2 = new THREE.InstancedMesh(strandG, std(0xffffff, .8, 0), NS), R2 = rng(41), M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), C4 = new THREE.Color();
      for (i = 0; i < NS; i++) {
        // 真下から測った傾き th。纓は上へ噴き出してから後ろへしなって垂れる（az = 0 が後ろ）。前と横は短い毛
        var back = R2() < .78, az = back ? (R2() - .5) * 1.9 : R2() * PI * 2, th = back ? 2.2 + R2() * .7 : 1.5 + R2() * .7;
        var len = back ? .11 + R2() * .1 : .03 + R2() * .025;
        E4.set(th, az, 0, 'YXZ'); Q4.setFromEuler(E4);
        M4.compose(new V3(0, 0, 0), Q4, new V3(len, len, len)); im2.setMatrixAt(i, M4);
        var v2 = .7 + R2() * .45; C4.setRGB(.66 * v2, .045 * v2, .03 * v2); im2.setColorAt(i, C4);
      }
      var core = mesh(new THREE.SphereGeometry(.024, 14, 10), std(0x8a0c08, .9)); core.scale.set(1, .7, 1); core.position.y = .004; plume.add(core);
      im2.castShadow = true; plume.add(im2);
      g.userData.tassel = plume;
    } else if (kind === 'kabuto') {
      // 兜鍪：鉄の鉢、錣、小さな纓
      var km = mesh(new THREE.SphereGeometry(.106, 28, 14, 0, PI * 2, 0, PI * .55), std(0x3a3630, .38, .7)); km.scale.set(1, .95, 1.08); km.position.set(0, .03, -.014); g.add(km);
      for (var r2 = 0; r2 < 6; r2++) { var band = mesh(new THREE.TorusGeometry(.104, .003, 6, 32, PI), std(0x2a2620, .5, .6)); band.rotation.set(0, r2 * PI / 6, 0); band.position.set(0, .03, -.014); band.scale.set(1, .95, 1.08); g.add(band); }
      var nk2 = mesh(new THREE.CylinderGeometry(.112, .135, .09, 28, 3, true, PI * .32, PI * 1.36), std(0x2e2a26, .5, .5, { side: THREE.DoubleSide, map: plateTex('iron') })); nk2.position.set(0, -.015, -.02); g.add(nk2);
      var tk = mesh(new THREE.CylinderGeometry(.006, .01, .05, 8), bron); tk.position.set(0, .14, -.01); g.add(tk);
      var tt = mesh(new THREE.SphereGeometry(.022, 10, 8), std(0x9a1a12, .8)); tt.scale.set(1, 1.5, 1); tt.position.set(0, .18, -.01); g.add(tt);
    } else if (kind === 'ze') {
      // 幘（頭を包む布）。兵や庶人のかぶりもの
      var zc = mesh(new THREE.SphereGeometry(.1, 24, 12, 0, PI * 2, 0, PI * .5), std(c.zeC || 0x8a2418, .9)); zc.scale.set(1.02, .78, 1.08); zc.position.set(0, .045, -.014); g.add(zc);
      var bandZ = mesh(new THREE.TorusGeometry(.1, .01, 6, 30), std(c.zeC || 0x8a2418, .9)); bandZ.rotation.x = PI / 2 + .15; bandZ.position.set(0, .052, -.016); bandZ.scale.set(1.02, 1.08, 1); g.add(bandZ);
      var knot = mesh(new THREE.SphereGeometry(.028, 12, 10), std(0x17130f, .6)); knot.position.set(.03, .125, -.04); g.add(knot);
    } else if (kind === 'mian') {
      // 冕冠：前後に旒を垂らす板
      var bd = mesh(new THREE.BoxGeometry(.2, .01, .33), lac); bd.position.set(0, .2, .01); bd.rotation.x = .06; g.add(bd);
      var bdr = mesh(new THREE.BoxGeometry(.204, .004, .334), std(0x8a2418, .5)); bdr.position.set(0, .193, .01); bdr.rotation.x = .06; g.add(bdr);
      var cap = mesh(new THREE.CylinderGeometry(.05, .058, .1, 18), lac); cap.position.set(0, .145, -.01); g.add(cap);
      var jade = std(0xd8e8d0, .2, .1), redB = std(0xa82018, .3);
      [-1, 1].forEach(function (sd) {
        for (var k3 = 0; k3 < 9; k3++) {
          var x = -.085 + k3 * .0212, z = sd * .163 + .01;
          g.add(mesh(new THREE.CylinderGeometry(.0012, .0012, .11, 4), lac, false)).position.set(x, .14, z);
          for (var bb = 0; bb < 4; bb++) { var bead = mesh(new THREE.SphereGeometry(.0045, 6, 5), bb % 2 ? redB : jade, false); bead.position.set(x, .182 - bb * .026, z); g.add(bead); }
        }
      });
      cord(.06, .15, 0, .07, -.03, .04); cord(-.06, .15, 0, -.07, -.03, .04);
    } else if (kind === 'lady') {
      var hairM = std(0x0c0a0a, .38);
      var bun = mesh(new THREE.SphereGeometry(.058, 18, 14), hairM); bun.scale.set(1.3, .75, 1); bun.position.set(0, .14, -.06); g.add(bun);
      var bun2 = mesh(new THREE.TorusGeometry(.04, .018, 10, 20), hairM); bun2.position.set(0, .178, -.07); bun2.rotation.x = .4; g.add(bun2);
      [-1, 1].forEach(function (sd) {
        var pin = mesh(new THREE.CylinderGeometry(.0025, .0025, .19, 6), gold); pin.rotation.z = PI / 2 + sd * .35; pin.position.set(sd * .03, .17, -.05); g.add(pin);
        for (var d = 0; d < 3; d++) { var dang = mesh(new THREE.SphereGeometry(.006, 6, 6), std(d % 2 ? 0x9fe0c0 : 0xd84860, .3, .2)); dang.position.set(sd * (.1 + d * .004), .14 - d * .02, -.05); g.add(dang); }
      });
      var flower = mesh(new THREE.SphereGeometry(.016, 10, 8), std(0xd84860, .5)); flower.position.set(-.07, .17, -.03); g.add(flower);
      var backG = new THREE.CylinderGeometry(.06, .035, .55, 14, 6); var bpp = backG.attributes.position;
      for (i = 0; i < bpp.count; i++) { var yy = bpp.getY(i); bpp.setZ(i, bpp.getZ(i) * .45 - (yy < 0 ? yy * yy * .25 : 0)); }
      backG.computeVertexNormals();
      var back = mesh(backG, hairM); back.position.set(0, -.18, -.1); g.add(back);
    }
    return g;
  }

  /* ============================ 持ち物 ============================ */
  function swordMesh(drawn) {
    var g = new THREE.Group();
    var bladeM = std(0xd8dce4, .18, .95), jade = std(0xa8d8b8, .25, .1), sheathM = std(0x120a08, .35, .1);
    var bg = new THREE.BoxGeometry(.034, .82, .006, 1, 1, 1);
    var blade = mesh(bg, bladeM); blade.position.y = -.49; g.add(blade);
    var ridge = mesh(new THREE.BoxGeometry(.004, .8, .009), std(0xf0f2f6, .1, 1)); ridge.position.y = -.48; g.add(ridge);
    var tip = mesh(new THREE.ConeGeometry(.017, .06, 4), bladeM); tip.rotation.z = PI; tip.position.y = -.93; tip.scale.z = .2; g.add(tip);
    var guard = mesh(new THREE.BoxGeometry(.07, .022, .03), jade); guard.position.y = -.07; g.add(guard);
    var grip = mesh(new THREE.CylinderGeometry(.014, .015, .15, 10), std(0x2a1a10, .7)); g.add(grip);
    for (var i = 0; i < 6; i++) { var wrap = mesh(new THREE.TorusGeometry(.0152, .0025, 4, 12), std(0x5a2a14, .7), false); wrap.rotation.x = PI / 2; wrap.position.y = -.05 + i * .02; g.add(wrap); }
    var pom = mesh(new THREE.CylinderGeometry(.024, .018, .02, 14), jade); pom.position.y = .085; g.add(pom);
    if (!drawn) {
      var sh = mesh(new THREE.CylinderGeometry(.026, .02, .84, 10), sheathM); sh.scale.z = .45; sh.position.y = -.5; g.add(sh);
      var chape = mesh(new THREE.CylinderGeometry(.02, .016, .05, 10), jade); chape.scale.z = .45; chape.position.y = -.9; g.add(chape);
      var slide = mesh(new THREE.BoxGeometry(.03, .06, .02), jade); slide.position.set(0, -.3, .012); g.add(slide);
      blade.visible = ridge.visible = tip.visible = false;
    }
    return g;
  }
  function cupMesh() {
    var g = new THREE.Group();
    var outer = mesh(new THREE.CylinderGeometry(.065, .058, .15, 20, 1, true), std(0x120a08, .3, .05, { side: THREE.FrontSide })); g.add(outer);
    var inner = mesh(new THREE.CylinderGeometry(.062, .055, .148, 20, 1, true), std(0x9a2014, .3, 0, { side: THREE.BackSide })); g.add(inner);
    var bot = mesh(new THREE.CircleGeometry(.058, 20), std(0x9a2014, .3)); bot.rotation.x = -PI / 2; bot.position.y = -.07; g.add(bot);
    var ring = mesh(new THREE.TorusGeometry(.022, .006, 6, 12), std(0x120a08, .3)); ring.position.set(.07, 0, 0); g.add(ring);
    [.06, -.06].forEach(function (y) { var b = mesh(new THREE.TorusGeometry(.065, .003, 4, 24), std(0xc8a048, .3, .8), false); b.rotation.x = PI / 2; b.position.y = y; g.add(b); });
    return g;
  }
  function shieldMesh() {
    var g = new THREE.Group();
    var sh = new THREE.Shape(); sh.moveTo(-.24, -.4); sh.lineTo(.24, -.4); sh.lineTo(.26, .25); sh.quadraticCurveTo(0, .42, -.26, .25); sh.closePath();
    var geo = new THREE.ExtrudeGeometry(sh, { depth: .025, bevelEnabled: true, bevelSize: .008, bevelThickness: .006, bevelSegments: 2 });
    var p = geo.attributes.position; for (var i = 0; i < p.count; i++) { var x = p.getX(i); p.setZ(i, p.getZ(i) - x * x * .5); }
    geo.computeVertexNormals();
    // 前面にだけ雲気文を貼る
    var uv = geo.attributes.uv; for (i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + .26) / .52, (p.getY(i) + .4) / .82);
    g.add(mesh(geo, std(0xffffff, .55, .05, { map: shieldTex() })));
    var boss = mesh(new THREE.SphereGeometry(.055, 16, 10, 0, PI * 2, 0, PI / 2), std(0xa88a3a, .3, .85)); boss.rotation.x = PI / 2; boss.position.z = .03; g.add(boss);
    return g;
  }
  function halberdMesh() {
    var g = new THREE.Group(), steel = std(0xb8bcc4, .25, .9);
    var shaft = mesh(new THREE.CylinderGeometry(.016, .016, 2.7, 8), std(0x3a2414, .6)); shaft.position.y = .55; g.add(shaft);
    var tip = mesh(new THREE.ConeGeometry(.026, .26, 4), steel); tip.position.y = 2.03; tip.scale.z = .25; g.add(tip);
    var ge = new THREE.Shape(); ge.moveTo(0, 0); ge.lineTo(.26, .035); ge.lineTo(.28, .0); ge.lineTo(.04, -.05); ge.lineTo(0, -.12); ge.closePath();
    var gm = mesh(new THREE.ExtrudeGeometry(ge, { depth: .005, bevelEnabled: false }), steel); gm.position.set(.01, 1.82, -.0025); g.add(gm);
    var tas = mesh(new THREE.ConeGeometry(.035, .1, 10, 1, true), std(0x9a1a12, .85, 0, { side: THREE.DoubleSide })); tas.position.y = 1.72; g.add(tas);
    return g;
  }
  function meatMesh() {
    var g = new THREE.SphereGeometry(.09, 14, 10); var p = g.attributes.position, R = rng(3);
    for (var i = 0; i < p.count; i++) { var k = .85 + R() * .3; p.setXYZ(i, p.getX(i) * k * 1.5, p.getY(i) * k * .6, p.getZ(i) * k); }
    g.computeVertexNormals();
    return mesh(g, std(0x8a4a3a, .55));
  }
  function jueMesh() {
    return mesh(new THREE.TorusGeometry(.04, .012, 12, 32, PI * 1.82), std(0x9fdcb8, .18, .1, { emissive: col(0x1a5038), emissiveIntensity: .55 }), false);
  }
  /** 佩玉：大帯から下げる玉の連なり */
  function peiMesh() {
    var g = new THREE.Group(), jade = std(0xa8dcc0, .2, .1), cordM = std(0x6a1a14, .7);
    g.add(mesh(new THREE.CylinderGeometry(.002, .002, .3, 4), cordM, false)).position.y = -.15;
    var huang = mesh(new THREE.TorusGeometry(.03, .007, 8, 20, PI), jade, false); huang.rotation.z = PI; huang.position.y = -.17; g.add(huang);
    var bi = mesh(new THREE.TorusGeometry(.022, .008, 8, 20), jade, false); bi.position.y = -.08; g.add(bi);
    for (var i = 0; i < 3; i++) { var b = mesh(new THREE.SphereGeometry(.007, 8, 6), std(0xc84030, .3), false); b.position.y = -.22 - i * .02; g.add(b); }
    return g;
  }

  /* ============================ 甲（小札を綴じた甲） ============================ */
  /** 小札一枚：わずかに反り、下の角が丸い */
  function plateGeo(w, h) {
    var g = new THREE.BoxGeometry(w, h, .0035, 3, 4, 1), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2);
      p.setZ(i, p.getZ(i) + .0022 * (1 - x * x));
      if (y < -.5 && Math.abs(x) > .5) { var k = 1 - .25 * (Math.abs(x) - .5) * 2 * ((-y - .5) * 2); p.setX(i, p.getX(i) * k); }
    }
    g.computeVertexNormals();
    return g;
  }
  function armorPlates(kind, s, b, rows, gold, size) {
    var sz = size || [.033, .05];
    var geo = plateGeo(sz[0] * s, sz[1] * s);
    var mat = kind === 'lacq' ? std(0xffffff, .34, 0, { map: plateTex(kind) }) : std(0xd8d4cc, .48, .45, { map: plateTex(kind) });
    var list = [];
    rows.forEach(function (row) { row.forEach(function (p) { list.push(p); }); });
    var im = new THREE.InstancedMesh(geo, mat, list.length);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(1, 1, 1), up = new V3(0, 1, 0), cl = new THREE.Color();
    var R = rng(9);
    list.forEach(function (p, i) {
      var n = p.n.clone().normalize();
      var xAxis = new V3().crossVectors(up, n).normalize(), yAxis = new V3().crossVectors(n, xAxis).normalize();
      var m = new THREE.Matrix4().makeBasis(xAxis, yAxis, n);
      q.setFromRotationMatrix(m);
      var tilt = new THREE.Quaternion().setFromAxisAngle(xAxis, -(p.tilt || .16) + (R() - .5) * .05); q.premultiply(tilt);
      var roll = new THREE.Quaternion().setFromAxisAngle(n, (R() - .5) * .05); q.premultiply(roll);
      m4.compose(p.p, q, sc); im.setMatrixAt(i, m4);
      var v = .82 + R() * .22;
      if (gold && p.edge) cl.setRGB(1.6, 1.15, .45); else cl.setRGB(v, v, v * (kind === 'lacq' ? 1.02 : .97));
      im.setColorAt(i, cl);
    });
    im.castShadow = true; im.receiveShadow = true;
    return im;
  }
  /** 胴の甲：胸の原点からの輪に沿って小札を並べる。上の段が下の段に重なる */
  function torsoPlateRows(s, b) {
    var rows = [], y;
    for (y = .165; y > -.32; y -= .04) {
      var wd = torsoAt(y), shoulder = sstep(.04, .17, y) * (1 - sstep(.19, .23, y));
      var W = wd[0] * (1 + (b - 1) * (.5 + shoulder * .6)) + .01, D = wd[1] * (1 + (b - 1) * .4) + .01;
      var per = 2 * PI * Math.sqrt((W * W + D * D) / 2), n = Math.max(16, Math.round(per / .027)), row = [];
      for (var k = 0; k < n; k++) {
        var a = k / n * PI * 2 + (rows.length % 2) * PI / n, cx = Math.sin(a), cz = Math.cos(a);
        var x = sexp(cx, 2.6) * W, z = sexp(cz, 2.4) * D;
        row.push({ p: new V3(x * s, y * s, z * s), n: new V3(x / (W * W), 0, z / (D * D)), edge: y > .15 || y < -.3 });
      }
      rows.push(row);
    }
    return rows;
  }
  function skirtPlateRows(s, b) {
    var rows = [];
    for (var r = 0; r < 5; r++) {
      var y = (-.015 - r * .045) * s, rad = (.182 + r * .014) * s * b, n = Math.round(2 * PI * rad / (.026 * s)), row = [];
      for (var k = 0; k < n; k++) {
        var a = k / n * PI * 2 + (r % 2) * PI / n;
        row.push({ p: new V3(Math.sin(a) * rad, y, Math.cos(a) * rad * .8), n: new V3(Math.sin(a), .12, Math.cos(a) / .8), tilt: .2, edge: r === 4 });
      }
      rows.push(row);
    }
    return rows;
  }
  /** 披膊（肩の甲）：肩口から上腕の外側をおおう */
  function shoulderPlateRows(s, b) {
    var rows = [];
    for (var r = 0; r < 4; r++) {
      var y = (.03 - r * .038) * s, rad = (.07 + r * .007) * s * b, row = [];
      for (var k = 0; k < 11; k++) {
        var a = -PI * .62 + k / 10 * PI * 1.24; // 外側（+X）を中心に前後へ
        row.push({ p: new V3(Math.cos(a) * rad, y, Math.sin(a) * rad), n: new V3(Math.cos(a), .3, Math.sin(a)), tilt: .28, edge: r === 3 });
      }
      rows.push(row);
    }
    return rows;
  }

  /* ============================ 人物を組む ============================ */
  function headParts(c) {
    var K = window.KM_FIGKIT, out = { head: null, hair: null };
    if (!K) return out;
    var hq = Q === 'high' ? 'medium' : 'low';
    try { out.head = K.buildHead(K.Res(), c.head, hq).group; } catch (e) { out.head = null; }
    var hatCovers = { bawang: 1, kabuto: 1, mian: 0, lady: 0 };
    if (!hatCovers[c.cap] && K.hairMesh) {
      try { out.hair = K.hairMesh(K.Res(), c.head, hq); } catch (e) { out.hair = null; }
    }
    return out;
  }

  function makeFigure(id) {
    var c = CAST[id];
    if (!c) return null;
    var s = c.h / 1.72, b = c.build || 1, armored = !!c.armor, lady = !!c.lady;
    var root = new THREE.Group(); root.name = 'fig-' + id;
    var body = new THREE.Group(); root.add(body);
    var cloth = clothMat();
    var skinM = std(c.head.skin || 0xc49a74, .62);
    var robeColor = c.robe, laceColor = c.lace || c.robe;

    var pelvis = new THREE.Group(); pelvis.position.y = .95 * s; body.add(pelvis);
    var spine = new THREE.Group(); pelvis.add(spine);
    var chest = new THREE.Group(); chest.position.y = .3 * s; spine.add(chest);
    var neck = new THREE.Group(); neck.position.set(0, .205 * s, -.005 * s); chest.add(neck);
    var headPiv = new THREE.Group(); neck.add(headPiv);

    // 胴
    var torso = mesh(torsoGeo(s, b, armored ? laceColor : robeColor), cloth); chest.add(torso);
    // 襟（右衽）・中衣の白・大帯
    if (!armored) {
      chest.add(bandOnTorso([[.05, .225], [.03, .17], [-.03, .08], [-.1, -.04], [-.15, -.15]], .038, s, b, c.trim, .007));
      chest.add(bandOnTorso([[.058, .222], [.04, .18], [.0, .12]], .012, s, b, c.inner || 0xe8dcc4, .011));
      chest.add(bandOnTorso([[-.05, .225], [-.03, .19], [-.005, .15]], .03, s, b, c.trim, .005));
      var beltG = new THREE.CylinderGeometry(1, 1, .065 * s, 40, 1, true), bpp = beltG.attributes.position;
      for (var i = 0; i < bpp.count; i++) { var a = Math.atan2(bpp.getX(i), bpp.getZ(i)), wd = torsoAt(-.27); bpp.setX(i, sexp(Math.sin(a), 2.6) * (wd[0] + .008) * s); bpp.setZ(i, sexp(Math.cos(a), 2.4) * (wd[1] + .008) * s); }
      beltG.computeVertexNormals();
      var belt = mesh(beltG, std(c.belt || 0x161010, .7, 0, { side: THREE.DoubleSide })); belt.position.y = -.27 * s; chest.add(belt);
      [.03, -.02].forEach(function (x, k) { var tail = mesh(new THREE.BoxGeometry(.045 * s, (.42 - k * .06) * s, .006), std(c.belt || 0x161010, .8)); tail.position.set(x * s, (-.5 + k * .03) * s, frontZ(x, -.27, b) * s + .012); tail.rotation.z = k ? .05 : -.04; chest.add(tail); });
      if (c.pei) { var pei = peiMesh(); pei.position.set(.12 * s, -.3 * s, .06 * s); pei.scale.setScalar(s); chest.add(pei); }
    } else {
      var armBelt = mesh(new THREE.CylinderGeometry(.17 * s * b, .17 * s * b, .05 * s, 28, 1, true), std(0x2a1a10, .6, 0, { side: THREE.DoubleSide })); armBelt.scale.z = .74; armBelt.position.y = -.28 * s; chest.add(armBelt);
      var hook = mesh(new THREE.BoxGeometry(.04, .025, .02), std(0xc8a048, .3, .85)); hook.position.set(0, -.28 * s, .13 * s * b); chest.add(hook);
      chest.add(armorPlates(c.armor, s, b, torsoPlateRows(s, b), c.gold));
      var collarA = mesh(new THREE.TorusGeometry(.085 * s, .016 * s, 8, 24), std(c.trim, .6)); collarA.rotation.x = PI / 2; collarA.position.y = .215 * s; collarA.scale.set(1.15, 1, 1); chest.add(collarA);
    }

    // 裾：立ち・坐り・跽き
    var hemLen = .95 * s;
    var mk = function (o) { var g = skirtGeo(o), m = mesh(g, cloth); if (g.userData.band) m.add(mesh(g.userData.band, cloth, false)); return m; };
    var skirtStand = armored
      ? mk({ len: .62 * s, r0: .17 * s, r1: .25 * s * b, hip: .02 * s, depth: .8, fold: .012, color: robeColor, trim: c.trim, frontLift: .03, seed: 5 })
      : mk({ len: hemLen - .015, r0: .165 * s, r1: (lady ? .44 : .33) * s, hip: .03 * s, depth: .82, fold: .016, color: robeColor, trim: c.trim, frontLift: lady ? 0 : .045, wrap: !lady, seed: 7 });
    pelvis.add(skirtStand);
    var skirtSit = mk({ len: .4 * s, r0: .17 * s, r1: .36 * s, hip: .03 * s, depth: .9, fold: .014, color: robeColor, trim: c.trim, frontLift: 0, wrap: !armored && !lady, seat: .34 * s, seed: 9 });
    skirtSit.visible = false; pelvis.add(skirtSit);
    var skirtKneel = mk({ len: .62 * s, r0: .17 * s, r1: .3 * s, hip: .03 * s, depth: .9, fold: .014, color: robeColor, trim: c.trim, frontLift: 0, wrap: !armored && !lady, seat: .24 * s, seed: 13 });
    skirtKneel.visible = false; pelvis.add(skirtKneel);
    var skirtPlates = null;
    if (armored) { skirtPlates = armorPlates(c.armor, s, b, skirtPlateRows(s, b), c.gold); pelvis.add(skirtPlates); }

    // 脚と履（兵は袴に行縢＝脚絆を巻く）
    var legs = {};
    ['L', 'R'].forEach(function (k) {
      var sd = k === 'L' ? 1 : -1;
      var hip = new THREE.Group(); hip.position.set(sd * .095 * s, -.05 * s, 0); pelvis.add(hip);
      var thG = new THREE.CylinderGeometry(.08 * s, .062 * s, .44 * s, 16, 4);
      paintGeo(thG, function (x, y, z, i, t) { t.set(c.legs || robeColor); });
      var thigh = mesh(thG, cloth); thigh.position.y = -.22 * s; hip.add(thigh);
      var knee = new THREE.Group(); knee.position.y = -.44 * s; hip.add(knee);
      var shG = new THREE.CylinderGeometry(.06 * s, .046 * s, .42 * s, 16, 14), wrapC = col(0x4a3c2c), legC = col(c.legs || robeColor);
      paintGeo(shG, function (x, y, z, i, t) {
        var a = Math.atan2(x, z), yy = y / s;
        // 行縢：すねに斜めに巻いた布の帯
        var band = Math.sin((yy * 95 + a * 1.6)) > .55;
        t.copy(yy < .1 ? (band ? wrapC.clone().multiplyScalar(.7) : wrapC) : legC);
      });
      var shin = mesh(shG, cloth); shin.position.y = -.21 * s; knee.add(shin);
      var shoe = shoeMesh('boot', s, 0x1a1210); shoe.position.set(0, -.46 * s, .0); knee.add(shoe);
      legs[k] = { hip: hip, knee: knee };
      hip.visible = armored;
    });
    // 長衣の人物は、裾から履の先だけが見える
    var shoesR = new THREE.Group(); pelvis.add(shoesR);
    if (!armored) {
      [-1, 1].forEach(function (sd) { var sh = shoeMesh('qiao', s, lady ? 0x3a1018 : 0x120c0a); sh.position.set(sd * .085 * s, -.95 * s, .03 * s); sh.rotation.y = sd * .06; shoesR.add(sh); });
    }

    // 腕と袖。長衣の袖は肩から袂へふくらみ、袖口（袪）で細くなる。兵は筒袖に籠手
    var arms = {}, sleeves = [];
    ['L', 'R'].forEach(function (k) {
      var sd = k === 'L' ? 1 : -1;
      var sh = new THREE.Group(); sh.position.set(sd * .188 * s * b, .145 * s, -.005 * s); chest.add(sh);
      var armC = armored ? (c.legs || robeColor) : robeColor, def = new V3(-sd * .5, 0, -.86);
      var ball = mesh(new THREE.SphereGeometry(.058 * s * b, 18, 12), cloth); ball.scale.set(1, .92, 1);
      paintGeo(ball.geometry, function (x, y, z, i, t) { t.set(armored ? laceColor : robeColor); }); ball.position.y = -.01 * s; sh.add(ball);
      var Hel = armored ? 0 : (lady ? .08 : .06) * s, Hmx = armored ? 0 : (lady ? .32 : .25) * s;
      var upper = bagTube({ len: .31 * s, y0: .005 * s, r: function (u) { return lerp(.06 * b, .064, u) * s; }, H: function (u) { return Hel * sstep(.2, 1, u); }, def: def, color: armC }, cloth);
      sh.add(upper);
      if (armored) { var sp3 = armorPlates(c.armor, s, b, shoulderPlateRows(s, b), c.gold, [.03, .042]); if (sd < 0) { sp3.scale.x = -1; sp3.material = sp3.material.clone(); sp3.material.side = THREE.DoubleSide; } sh.add(sp3); }
      var el = new THREE.Group(); el.position.y = -.29 * s; sh.add(el);
      var fore = armored
        ? bagTube({ len: .25 * s, y0: .01 * s, rings: 8, segs: 20, r: function (u) { return lerp(.058, .05, u) * s; }, def: def, color: armC }, cloth)
        : bagTube({ len: .32 * s, y0: .016 * s, slide: true, def: def, color: armC, trim: c.trim, sag: (lady ? .17 : .11) * s,
            r: function (u) { return (u < .55 ? lerp(.064, .076, u / .55) : lerp(.076, .055, (u - .55) / .45)) * s; },
            H: function (u) { return Hel + (Hmx - Hel) * sstep(0, .62, u) - Hmx * .82 * sstep(.62, 1, u); } }, cloth);
      el.add(fore);
      sleeves.push(upper, fore);
      if (armored) { var bracer = mesh(new THREE.CylinderGeometry(.058 * s, .052 * s, .14 * s, 14), std(0x3a2414, .55, .1)); bracer.position.y = -.17 * s; el.add(bracer); }
      else { var fa = mesh(new THREE.CylinderGeometry(.031 * s, .026 * s, .25 * s, 10), skinM); fa.position.y = -.13 * s; el.add(fa); } // 袖が下がると見える前腕
      var wr = new THREE.Group(); wr.position.y = -.25 * s; el.add(wr);
      arms[k] = { sh: sh, el: el, wr: wr };
    });
    function attachHand(k, pose) {
      var A = arms[k];
      if (A.hand) A.wr.remove(A.hand);
      var K = window.KM_FIGKIT, hm = null;
      try { if (K) hm = K.handMesh(K.Res(), pose === 'hidden' ? 'relax' : pose || 'relax', k, c.head, Q === 'high' ? 'medium' : 'low'); } catch (e) { hm = null; }
      if (!hm) { hm = mesh(new THREE.BoxGeometry(.07, .17, .03), skinM); hm.position.y = .06; }
      hm.scale.setScalar(s);
      var g = new THREE.Group(); g.add(hm);
      g.rotation.z = PI; g.rotation.y = k === 'L' ? -PI / 2 : PI / 2;
      A.wr.add(g); A.hand = g; A.handPose = pose;
      g.visible = pose !== 'hidden';
    }

    // 頭・髪・冠
    var hp = headParts(c), HEAD_PIV = [0, -.032, -.018];
    var headG = new THREE.Group(); headG.position.set(-HEAD_PIV[0], -HEAD_PIV[1] + .1 * s, -HEAD_PIV[2]); headG.scale.setScalar(s); headPiv.add(headG);
    if (hp.head) headG.add(hp.head); else { var hb = mesh(new THREE.SphereGeometry(.1, 20, 16), skinM); hb.position.y = .03; headG.add(hb); }
    if (hp.hair) headG.add(hp.hair);
    var hat = hatMesh(c.cap, c); headG.add(hat);
    hat.traverse(function (o) { if (o.isMesh) o.castShadow = false; }); // 冠の影で目元が暗くならないように
    if (c.cap === 'bawang' || c.cap === 'kabuto') hat.position.y = .008;
    var headTop = new THREE.Object3D(); headTop.position.set(0, .34 * s, 0); headPiv.add(headTop);

    // 披風（項王）
    var cape = null;
    if (c.cape) {
      var cg = new THREE.PlaneGeometry(.74 * s * b, 1.22 * s, 14, 18); cg.translate(0, -.61 * s, 0);
      (function () { var cp = cg.attributes.position; for (var i = 0; i < cp.count; i++) { var x = cp.getX(i), y = cp.getY(i), u = -y / (1.22 * s);
        var wdt = .62 + u * .55; cp.setXYZ(i, x * wdt, y, Math.pow(x * wdt / (.37 * s * b), 2) * .16 * s * (1 - u * .5) + Math.sin(x * 40 + u * 3) * .012 * u); } })();
      paintGeo(cg, function (x, y, z, i, t) { t.set(c.cape); if (y < -1.16 * s) t.set(0x2a0806); });
      var capeM = std(0xffffff, .78, 0, { map: weaveTex(), vertexColors: true, side: THREE.DoubleSide });
      cape = mesh(cg, capeM); cape.position.set(0, .19 * s, -.16 * s * b); chest.add(cape);
      cg.userData = { base: cg.attributes.position.array.slice() };
      [-1, 1].forEach(function (sd) { var clasp = mesh(new THREE.SphereGeometry(.022 * s, 12, 10), std(0xc8a048, .3, .85)); clasp.position.set(sd * .14 * s * b, .19 * s, .02 * s); chest.add(clasp); });
    }

    // 持ち物
    var props = {};
    if (c.sword) { props.sheath = swordMesh(false); props.sheath.scale.setScalar(s); props.sheath.position.set(.17 * s * b, -.27 * s, .02); props.sheath.rotation.set(.35, 0, .3); chest.add(props.sheath); props.sword = swordMesh(true); props.sword.scale.setScalar(s); props.sword.visible = false; }
    if (c.shield) { props.shield = shieldMesh(); props.shield.scale.setScalar(s); }
    if (c.halberd) props.halberd = halberdMesh();
    if (c.jue) { props.jue = jueMesh(); props.jueHang = jueMesh(); props.jueHang.scale.setScalar(.8); props.jueHang.position.set(.12 * s, -.36 * s, .1 * s); props.jueHang.rotation.x = PI / 2; chest.add(props.jueHang); }
    props.cup = cupMesh(); props.cup.visible = false;
    props.meat = meatMesh(); props.meat.visible = false;

    var rig = { root: root, body: body, pelvis: pelvis, spine: spine, chest: chest, neck: neck, headPiv: headPiv, arms: arms, legs: legs, headTop: headTop, props: props, s: s, armored: armored, hat: hat };

    /** p: 腕を前へ上げる / r: 横へ開く / e: 肘を曲げる / yaw: 前腕を体の前へ寄せる（上腕のひねり） */
    function setArm(k, p, r, e, yaw) {
      var A = arms[k], sd = k === 'L' ? 1 : -1;
      A.sh.rotation.set(-p, -sd * (yaw || 0), sd * r);
      A.el.rotation.set(-e, 0, 0);
      A.cur = [p, r, e, yaw || 0];
    }
    function holdIn(k, obj, rot, pos) {
      var A = arms[k];
      if (obj.parent) obj.parent.remove(obj);
      A.wr.add(obj);
      obj.position.set(pos[0], pos[1], pos[2]);
      obj.rotation.set(rot[0], rot[1], rot[2]);
      obj.visible = true;
    }

    var state = { pose: 'stand', look: null, lookW: 0, talk: 0, yaw: 0 };
    function setPose(pose) {
      state.pose = pose;
      root.visible = pose !== 'gone';
      body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
      spine.rotation.set(0, 0, 0); neck.rotation.set(0, 0, 0); headPiv.rotation.set(0, 0, 0);
      var seated = pose === 'sit' || pose === 'raise', kneel = pose === 'kneel';
      skirtStand.visible = !seated && !kneel;
      skirtSit.visible = seated; skirtKneel.visible = kneel;
      if (skirtPlates) { skirtPlates.visible = true; skirtPlates.position.y = seated ? .02 * s : kneel ? .0 : 0; skirtPlates.scale.y = seated ? .55 : kneel ? .8 : 1; }
      shoesR.visible = !seated && !kneel;
      pelvis.position.y = seated ? .4 * s : kneel ? .62 * s : .95 * s;
      ['L', 'R'].forEach(function (k) { legs[k].hip.visible = armored && !seated && !kneel; legs[k].hip.rotation.set(0, 0, 0); legs[k].knee.rotation.set(0, 0, 0); });
      if (props.sword) { props.sword.visible = false; if (props.sword.parent) props.sword.parent.remove(props.sword); if (props.sheath) props.sheath.visible = true; }
      ['shield', 'halberd', 'jue', 'cup', 'meat'].forEach(function (k) { if (props[k] && props[k].parent) props[k].parent.remove(props[k]); });
      if (props.jueHang) props.jueHang.visible = true;
      var hpz = { L: 'relax', R: 'relax' };
      setArm('L', .1, .12, .18); setArm('R', .1, .12, .18);
      // 長衣で立つときは拱手（両手を胸の前で袖の中に重ねる）。漢の立俑の姿
      if (pose === 'stand' && !armored && !props.halberd) { setArm('L', .36, .1, 1.22, 1.02); setArm('R', .34, .1, 1.18, 1.0); hpz = { L: 'hidden', R: 'hidden' }; }
      if (seated) { setArm('L', .34, .06, .9, .38); setArm('R', .34, .06, .9, .38); hpz = { L: 'lap', R: 'lap' }; }
      if (kneel) { setArm('L', .3, .05, .78, .32); setArm('R', .3, .05, .78, .32); hpz = { L: 'lap', R: 'lap' }; }
      if (pose === 'raise') { setArm('R', 2.45, .28, .45); hpz.R = 'hold'; if (props.jue) { holdIn('R', props.jue, [0, 0, 0], [0, -.13 * s, .03]); props.jueHang.visible = false; } }
      if (pose === 'dance' || pose === 'strike' || pose === 'eat') {
        if (props.sword) { holdIn('R', props.sword, [PI, 0, 0], [0, -.08 * s, 0]); if (props.sheath) props.sheath.visible = false; }
        hpz.R = 'grasp';
      }
      if (pose === 'strike') { setArm('R', .9, .1, .2); spine.rotation.x = .25; }
      if (pose === 'eat') {
        setArm('R', .85, .1, 1.2); setArm('L', .75, -.1, 1.0); spine.rotation.x = .32;
        if (props.shield) { root.add(props.shield); props.shield.position.set(0, .04, .5); props.shield.rotation.set(-PI / 2, 0, 0); props.shield.visible = true; }
        root.add(props.meat); props.meat.position.set(0, .12, .52); props.meat.visible = true;
      }
      if (pose === 'drink') { setArm('R', 2.35, .5, 2.05); hpz.R = 'hold'; holdIn('R', props.cup, [0, 0, .3], [0, -.1 * s, .06]); headPiv.rotation.x = -.45; neck.rotation.x = -.2; }
      if (pose === 'glare') { setArm('L', .2, .38, .32); setArm('R', .2, .38, .32); hpz = { L: 'grasp', R: 'grasp' }; legs.L.hip.rotation.z = .12; legs.R.hip.rotation.z = -.12; }
      if (pose === 'charge') { spine.rotation.x = .3; setArm('L', 1.3, .2, .3); hpz.L = 'grasp'; legs.L.hip.rotation.x = -.5; legs.L.knee.rotation.x = .5; legs.R.hip.rotation.x = .4; }
      if ((pose === 'glare' || pose === 'charge' || pose === 'stand' || pose === 'run') && props.shield) holdIn('L', props.shield, [0, PI / 2, 0], [-.05, -.12 * s, .1]);
      if (props.halberd && pose !== 'down') { holdIn('R', props.halberd, [0, 0, 0], [0, -.62, .02]); setArm('R', .45, .05, .9); hpz.R = 'grasp'; }
      if (pose === 'down') { body.rotation.x = -PI / 2; body.position.set(0, .14, .9 * s); setArm('L', 2.8, .4, .2); setArm('R', .3, .6, .4); }
      if (pose === 'run') hpz = { L: 'grasp', R: 'grasp' };
      ['L', 'R'].forEach(function (k) { if (arms[k].handPose !== hpz[k]) attachHand(k, hpz[k]); });
      state.base = { L: arms.L.cur.slice(), R: arms.R.cur.slice(), hL: hpz.L, hR: hpz.R };
    }

    var tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), down = new V3(), tmpV = new V3(), wp = new V3();
    function updateSleeves() {
      sleeves.forEach(function (sl) {
        sl.updateMatrixWorld();
        tmpM.copy(sl.matrixWorld).invert();
        down.set(0, -1, 0).transformDirection(tmpM);
        sl.userData.bag(down);
      });
    }
    function updateCape(t, moving) {
      if (!cape) return;
      var g = cape.geometry, base = g.userData.base, p = g.attributes.position;
      var seated = state.pose === 'sit' || state.pose === 'kneel' || state.pose === 'raise';
      for (var i = 0; i < p.count; i++) {
        var x = base[i * 3], y = base[i * 3 + 1], u = -y / (1.22 * s);
        var wave = Math.sin(t * (moving ? 6 : 1.4) + u * 4 + x * 6) * (moving ? .08 : .02) * u;
        var z = base[i * 3 + 2] - u * u * (moving ? .35 : .06) + wave;
        var yy = y;
        if (seated && u > .45) { yy = -.45 * 1.22 * s - (u - .45) * .1; z -= (u - .45) * 1.22 * s * .9; }
        p.setXYZ(i, x, yy, z);
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }

    function update(dt, t) {
      var p = state.pose, br = Math.sin(t * 1.3 + id.length) * .012;
      chest.scale.set(1, 1 + br * .35, 1 + br);
      // 視線：話し手のほうへ首を向ける
      var targetYaw = 0, targetPitch = 0;
      if (state.look && p !== 'down') {
        headPiv.getWorldPosition(wp);
        tmpV.copy(state.look).sub(wp);
        var inv = new THREE.Quaternion(); root.getWorldQuaternion(inv); inv.invert();
        tmpV.applyQuaternion(inv);
        targetYaw = clamp(Math.atan2(tmpV.x, tmpV.z), -1.0, 1.0);
        targetPitch = clamp(-Math.atan2(tmpV.y, Math.sqrt(tmpV.x * tmpV.x + tmpV.z * tmpV.z)), -.35, .35);
      }
      state.yaw += (targetYaw - state.yaw) * Math.min(1, dt * 3);
      neck.rotation.y = state.yaw * .55 + Math.sin(t * .37 + id.length * 2) * .03;
      headPiv.rotation.y = state.yaw * .45;
      if (p !== 'drink') headPiv.rotation.x = targetPitch * .6 + (state.talk ? Math.sin(t * 5.3) * .035 : 0);
      // 話している人物は右手で身ぶりをする（拱手や膝の手をほどいて、掌を上に向ける）
      if (state.base && !props.halberd && (p === 'stand' || p === 'sit' || p === 'kneel' || p === 'glare')) {
        var tgt = state.base.R;
        if (state.talk) {
          var g1 = Math.sin(t * 2.1 + id.length) * .08, g2 = Math.sin(t * 1.3 + 1) * .07;
          tgt = p === 'stand' || p === 'glare' ? [.66 + g1, .2, 1.0 + g2, .16] : [.6 + g1, .16, 1.15 + g2, .12];
        }
        var cur = arms.R.cur, kk = Math.min(1, dt * 5);
        setArm('R', lerp(cur[0], tgt[0], kk), lerp(cur[1], tgt[1], kk), lerp(cur[2], tgt[2], kk), lerp(cur[3], tgt[3], kk));
        var want = state.talk ? 'hold' : state.base.hR;
        if (arms.R.handPose !== want) attachHand('R', want);
      }
      if (p === 'dance') {
        var ph = t * 2.2;
        setArm('R', 1.6 + Math.sin(ph) * 1.1, .3 + Math.cos(ph) * .4, .3 + Math.sin(ph * .5) * .3, 0);
        setArm('L', .6 + Math.cos(ph) * .5, .7, .9);
        spine.rotation.y = Math.sin(ph) * .5; spine.rotation.x = .1 + Math.cos(ph * 2) * .06;
        body.position.y = Math.abs(Math.sin(ph)) * .03;
      } else if (p === 'run') {
        var r = t * 9;
        if (legs.L.hip.visible) {
          legs.L.hip.rotation.x = Math.sin(r) * .8; legs.L.knee.rotation.x = Math.max(0, -Math.sin(r + .8)) * 1.2;
          legs.R.hip.rotation.x = -Math.sin(r) * .8; legs.R.knee.rotation.x = Math.max(0, Math.sin(r + .8)) * 1.2;
        }
        setArm('R', -Math.sin(r) * .7 + .2, .15, .9); setArm('L', Math.sin(r) * .7 + .2, .15, .9);
        body.position.y = Math.abs(Math.sin(r)) * .05; spine.rotation.x = .18;
      }
      if (hat.userData.tassel) hat.userData.tassel.rotation.z = Math.sin(t * 1.7) * .06 + (p === 'run' || p === 'dance' ? Math.sin(t * 8) * .1 : 0);
      updateSleeves();
      updateCape(t, p === 'run' || p === 'dance' || p === 'charge');
    }
    function lookAt(v) { state.look = v ? v.clone() : null; }
    function talk(on) { state.talk = !!on; }

    setPose('stand');
    root.userData = { rig: rig, setPose: setPose, update: update, headTop: headTop, id: id, state: state, lookAt: lookAt, talk: talk };
    return root;
  }

  /* ============================ 馬（騅） ============================ */
  function horseTex(kind) {
    var key = 'horse' + kind;
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(512, 256, function (g, w, h) {
      g.fillStyle = kind === 'zhui' ? '#3a3e44' : '#2a1c16'; g.fillRect(0, 0, w, h);
      var R = rng(kind === 'zhui' ? 11 : 13);
      // 蒼白雑毛：黒い地に青白い毛がまだらに混じる
      for (var i = 0; i < (kind === 'zhui' ? 5000 : 1200); i++) {
        var x = R() * w, y = R() * h, l = 2 + R() * 5;
        g.strokeStyle = kind === 'zhui' ? (R() < .55 ? 'rgba(200,210,224,' + (.25 + R() * .4) + ')' : 'rgba(10,10,14,' + (.3 + R() * .4) + ')') : 'rgba(80,50,36,.35)';
        g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - .5) * 2); g.stroke();
      }
      var vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(0,0,0,.25)'); vg.addColorStop(.6, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
    });
    return TEX[key];
  }
  /** 騅：胴・首・頭は SDF で一続きに彫り、脚は関節ごとの部品にして走らせる。
      蒼白雑毛（青みの白と黒の毛がまじる）は頂点色のまだらで。たてがみと尾は黒 */
  var HORSE_POLY = null;
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function horseBody() {
    var K = window.KM_FIGKIT;
    if (HORSE_POLY) return HORSE_POLY;
    var E = K.sEll, C = K.sCone, k = K.K;
    var parts = [
      E([0, 1.22, -.02], [.27, .32, .7]),
      k(E([0, 1.2, .5], [.25, .33, .3]), .14),
      k(E([0, 1.41, .38], [.12, .12, .26]), .12),
      k(E([0, 1.29, -.56], [.29, .32, .35]), .16),
      k(E([0, 1.44, -.5], [.19, .1, .3]), .12),
      k(E([.15, 1.06, .48], [.09, .24, .14]), .1), k(E([-.15, 1.06, .48], [.09, .24, .14]), .1),
      k(E([.16, 1.06, -.62], [.11, .28, .19]), .12), k(E([-.16, 1.06, -.62], [.11, .28, .19]), .12),
      k(E([0, 1.6, .8], [.115, .32, .16], rotX(.72)), .12),
      k(E([0, 1.73, .74], [.055, .22, .09], rotX(.72)), .06),
      k(E([0, 1.86, 1.05], [.075, .11, .1]), .07),
      k(E([0, 1.71, 1.18], [.06, .19, .075], rotX(.62)), .06),
      k(E([0, 1.57, 1.3], [.064, .075, .08]), .05),
      k(C([.045, 1.95, 1.0], [.06, 2.07, .96], .024, .006), .02), k(C([-.045, 1.95, 1.0], [-.06, 2.07, .96], .024, .006), .02),
      k(C([0, 1.42, -.86], [0, 1.27, -1.0], .06, .035), .05)
    ];
    var F = K.U(parts);
    var nz = K.makeNoise(17);
    // 鼻の穴・目のくぼみ・肋のかすかな起伏
    F = K.D(F, function (x, y, z) { var d = 0;
      if (z > 1.3 && y < 1.6) d -= .012 * Math.exp(-((Math.abs(x) - .035) * (Math.abs(x) - .035) + (y - 1.56) * (y - 1.56)) / .0004);
      if (y > 1.82 && y < 1.92 && z > 1.06 && z < 1.16) d -= .01 * Math.exp(-((Math.abs(x) - .07) * (Math.abs(x) - .07)) / .0006);
      if (z > -.4 && z < .3 && y < 1.3) d += .004 * Math.sin(z * 40) * Math.exp(-(y - 1.12) * (y - 1.12) / .01);
      return d + .002 * nz(x * 20, y * 20, z * 20); }, .015);
    var poly = K.polygonize(F.f, [-.4, .7, -1.12], [.4, 2.16, 1.45], Q === 'high' ? .022 : .032, { levels: 3, lip: 1.3, seedS: 3 });
    var ao = K.bakeAO(poly, F.f, .03, 3, 1.1);
    var dark = K.lin(0x23262c), light = K.lin(0xb4bcc8), mid = K.lin(0x5a6068);
    K.paint(poly, function (x, y, z) {
      var n1 = K.N2(x * 7 + 3, y * 7, z * 7), n2 = K.N1(x * 40, y * 40, z * 40);
      // 白い毛がまだらに混じる。頭・下腹・脚の付け根は黒っぽく
      var w = Math.max(0, Math.min(1, (n1 * .5 + .5 - .38) * 2.4)) * (.75 + .25 * n2);
      var c = K.mixc(dark, light, w * .85);
      c = K.mixc(c, mid, .25);
      var low = Math.max(0, Math.min(1, (1.1 - y) / .25)), head = Math.max(0, Math.min(1, (z - 1.12) / .15));
      c = K.mixc(c, dark, Math.max(low * .7, head * .6));
      return c;
    }, ao, .45);
    HORSE_POLY = poly;
    return poly;
  }
  function horseLeg(front, M, D) {
    var hip = new THREE.Group();
    var up = new THREE.LatheGeometry([[0, 0], [.07, -.02], [.075, -.12], [.058, -.3], [.045, -.42]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 14);
    var u = mesh(up, M); u.scale.z = front ? 1.15 : 1.3; hip.add(u);
    var knee = new THREE.Group(); knee.position.y = -.42; hip.add(knee);
    var kj = mesh(new THREE.SphereGeometry(.047, 12, 10), M); kj.scale.set(.9, 1, 1.15); knee.add(kj);
    var can = mesh(new THREE.CylinderGeometry(.034, .036, .34, 12), D); can.position.y = -.17; can.scale.z = 1.2; knee.add(can);
    var fet = new THREE.Group(); fet.position.y = -.34; knee.add(fet);
    var fj = mesh(new THREE.SphereGeometry(.044, 12, 10), D); fj.scale.set(.9, 1, 1.15); fet.add(fj);
    var feath = mesh(new THREE.ConeGeometry(.05, .09, 10, 1, true), D); feath.position.set(0, -.04, -.02); feath.rotation.x = -.3; fet.add(feath);
    var past = mesh(new THREE.CylinderGeometry(.03, .036, .1, 10), D); past.position.set(0, -.06, .025); past.rotation.x = .45; fet.add(past);
    var hoof = mesh(new THREE.CylinderGeometry(.042, .056, .075, 14), std(0x14100e, .5)); hoof.position.set(0, -.13, .05); fet.add(hoof);
    return { hip: hip, kn: knee, fet: fet };
  }
  function makeHorseSDF() {
    var K = window.KM_FIGKIT;
    var g = new THREE.Group(), poly = horseBody();
    var body = new THREE.Mesh(K.toGeom(poly), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: 0 }));
    body.castShadow = body.receiveShadow = true;
    var trunk = new THREE.Group(); g.add(trunk); trunk.add(body);
    var M = std(0x3a3e46, .6), D = std(0x16161a, .6), hairM = std(0x0c0b0b, .7);
    // たてがみ：首の上の線に沿って片側へ垂れる房
    var lockG = new THREE.ConeGeometry(.03, .2, 6, 3); lockG.translate(0, -.1, 0);
    var NL = 26, locks = new THREE.InstancedMesh(lockG, hairM, NL), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), R = rng(23);
    for (var i = 0; i < NL; i++) {
      var t = i / (NL - 1), y = lerp(1.98, 1.46, t), z = lerp(1.0, .42, t) - Math.sin(t * PI) * .05;
      e.set(-.25 - R() * .2, 0, -.55 - R() * .3); q.setFromEuler(e);
      m4.compose(new V3(.02, y + .02, z), q, new V3(1, .8 + R() * .5, 1)); locks.setMatrixAt(i, m4);
    }
    locks.castShadow = true; trunk.add(locks);
    var fore = mesh(new THREE.SphereGeometry(.05, 8, 6), hairM); fore.position.set(0, 1.98, 1.05); fore.scale.set(.8, .6, 1.4); trunk.add(fore);
    // 尾：根元から房になって垂れる
    var tailG = new THREE.Group(); tailG.position.set(0, 1.36, -.96); trunk.add(tailG);
    for (i = 0; i < 9; i++) { var tl = mesh(new THREE.ConeGeometry(.045, .85, 6, 4), hairM); var tp = tl.geometry.attributes.position; for (var j = 0; j < tp.count; j++) { var yy = tp.getY(j); tp.setZ(j, tp.getZ(j) - (yy + .42) * (yy + .42) * .12); } tl.geometry.computeVertexNormals(); tl.position.set((i - 4) * .012, -.44, -.08); tl.rotation.set(PI + .18, 0, (i - 4) * .035); tailG.add(tl); }
    // 轡・面繋・手綱
    var bridle = std(0x2a1410, .6), bron = std(0xa88a3a, .3, .8);
    var nb = mesh(new THREE.TorusGeometry(.075, .007, 6, 20), bridle); nb.position.set(0, 1.6, 1.29); nb.rotation.x = PI / 2 + .62; nb.scale.set(1, 1.25, 1); trunk.add(nb);
    var cb = mesh(new THREE.TorusGeometry(.11, .007, 6, 20, PI), bridle); cb.position.set(0, 1.83, 1.1); cb.rotation.set(-.6, PI / 2, 0); trunk.add(cb);
    [-1, 1].forEach(function (sd) { var bit = mesh(new THREE.TorusGeometry(.016, .005, 6, 12), bron); bit.position.set(sd * .07, 1.58, 1.28); bit.rotation.y = PI / 2; trunk.add(bit); });
    var rein = new THREE.CatmullRomCurve3([new V3(.07, 1.58, 1.28), new V3(.12, 1.5, 1.0), new V3(.14, 1.55, .6), new V3(0, 1.6, .35), new V3(-.14, 1.55, .6), new V3(-.12, 1.5, 1.0), new V3(-.07, 1.58, 1.28)]);
    trunk.add(mesh(new THREE.TubeGeometry(rein, 40, .006, 5), bridle, false));
    // 鞍（鐙はまだ無い時代）と障泥
    var pad = mesh(new THREE.CylinderGeometry(.31, .31, .62, 24, 1, true, -PI * .42, PI * .84), std(0x5a1410, .7, 0, { side: THREE.DoubleSide }));
    pad.rotation.x = PI / 2; pad.position.set(0, 1.27, .08); pad.scale.set(1, 1, 1.05); trunk.add(pad);
    var seat = mesh(new THREE.BoxGeometry(.3, .06, .42), std(0x2a0c08, .55)); seat.position.set(0, 1.58, .08); trunk.add(seat);
    [.31, -.15].forEach(function (z) { var bow = mesh(new THREE.TorusGeometry(.13, .025, 8, 18, PI), std(0x1a0a08, .35, .1)); bow.position.set(0, 1.58, z); trunk.add(bow); });
    [-1, 1].forEach(function (sd) {
      var flap = mesh(new THREE.PlaneGeometry(.46, .4), std(0xffffff, .5, 0, { side: THREE.DoubleSide, map: lacquerCloudTex(21) })); flap.position.set(sd * .3, 1.3, .08); flap.rotation.y = sd * PI / 2; flap.rotation.z = sd * .12; trunk.add(flap);
    });
    var girth = mesh(new THREE.TorusGeometry(.33, .012, 6, 30), std(0x3a1a10, .7)); girth.position.set(0, 1.22, .2); girth.rotation.y = PI / 2; girth.scale.set(1, 1.05, .9); trunk.add(girth);
    // 脚
    var legs = [];
    [[.15, .97, .5, 1, 0], [-.15, .97, .5, 1, PI], [.16, .98, -.64, 0, PI * .5], [-.16, .98, -.64, 0, PI * 1.5]].forEach(function (p) {
      var L = horseLeg(!!p[3], M, D); L.hip.position.set(p[0], p[1], p[2]); g.add(L.hip);
      if (!p[3]) { L.hip.rotation.x = .18; L.kn.rotation.x = -.32; L.fet.rotation.x = .14; }
      legs.push({ hip: L.hip, kn: L.kn, fet: L.fet, ph: p[4], front: !!p[3] });
    });
    var neckBob = 0;
    g.userData.update = function (dt, t, running) {
      legs.forEach(function (l) {
        var a = running ? Math.sin(t * 9 + l.ph) : 0, base = l.front ? 0 : .18;
        l.hip.rotation.x = base + a * .55;
        l.kn.rotation.x = (l.front ? 1 : -1) * (running ? Math.max(0, Math.sin(t * 9 + l.ph + 1.2)) * .9 : 0) + (l.front ? 0 : -.32) + (running ? 0 : Math.sin(t * .3 + l.ph) * .015);
      });
      neckBob = running ? Math.sin(t * 9) * .02 : Math.sin(t * .6) * .006;
      trunk.position.y = running ? Math.abs(Math.sin(t * 9)) * .05 : neckBob;
      tailG.rotation.x = running ? -.55 + Math.sin(t * 9) * .1 : Math.sin(t * .8) * .05;
      tailG.rotation.z = running ? 0 : Math.sin(t * 1.3) * .08;
    };
    g.userData.saddleY = 1.62;
    return g;
  }
  function makeHorse(kind) {
    if (window.KM_FIGKIT && window.KM_FIGKIT.makeNoise) { try { return makeHorseSDF(); } catch (e) { /* 旧い形へ */ } }
    var g = new THREE.Group();
    var M = std(0xffffff, .55, .05, { map: horseTex(kind || 'zhui') }), D = std(0x0a0806, .75);
    var bg = new THREE.SphereGeometry(.5, 40, 24); var bp = bg.attributes.position;
    for (var i = 0; i < bp.count; i++) {
      var x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), u = z / .5;
      var k = 1 - .1 * Math.cos(u * PI);
      bp.setXYZ(i, x * .56 * k, y * .6 * k + (y > 0 ? .03 * (1 - u * u) : 0) - (y < 0 ? .03 * (1 - u * u) : 0), z * 1.28);
    }
    bg.computeVertexNormals();
    var body = mesh(bg, M); body.position.y = 1.28; g.add(body);
    var neckG = new THREE.Group(); neckG.position.set(0, 1.42, .52); g.add(neckG);
    var ng = new THREE.CylinderGeometry(.13, .25, .8, 18, 6); ng.translate(0, .4, 0);
    var np = ng.attributes.position; for (i = 0; i < np.count; i++) { var ny = np.getY(i); np.setZ(i, np.getZ(i) * (1.25 - ny * .3)); }
    ng.computeVertexNormals();
    var nk = mesh(ng, M); nk.rotation.x = .6; neckG.add(nk);
    var head = new THREE.Group(); head.position.set(0, .68, .44); head.rotation.x = 1.2; neckG.add(head);
    var hg = new THREE.SphereGeometry(.13, 24, 16); var hp = hg.attributes.position;
    for (i = 0; i < hp.count; i++) { var hy = hp.getY(i), t = (hy + .13) / .26; hp.setXYZ(i, hp.getX(i) * (.9 - t * .3), hy * 2.3, hp.getZ(i) * (1.05 - t * .2) + (t > .6 ? -.015 : 0)); }
    hg.computeVertexNormals();
    var hm = mesh(hg, M); hm.position.y = .16; head.add(hm);
    [-1, 1].forEach(function (sd) {
      var ear = mesh(new THREE.ConeGeometry(.035, .14, 8), M); ear.position.set(sd * .07, -.09, -.08); ear.rotation.x = -1.25; ear.rotation.z = sd * .2; head.add(ear);
      var eye = mesh(new THREE.SphereGeometry(.022, 10, 8), std(0x050404, .15)); eye.position.set(sd * .085, .02, .06); head.add(eye);
      var nostril = mesh(new THREE.SphereGeometry(.015, 8, 6), D); nostril.position.set(sd * .045, .44, .07); head.add(nostril);
    });
    // 轡と手綱
    var bridle = std(0x2a1410, .6);
    var nb = mesh(new THREE.TorusGeometry(.1, .008, 6, 20), bridle); nb.position.set(0, .3, .0); nb.rotation.x = PI / 2; nb.scale.set(1, 1.3, 1); head.add(nb);
    var mane = new THREE.Group(); neckG.add(mane);
    for (i = 0; i < 14; i++) { var lock = mesh(new THREE.ConeGeometry(.03, .22, 6), D); lock.position.set((i % 2 ? .02 : -.02), .12 + i * .05, -.02 - i * .022); lock.rotation.set(2.6, 0, (i % 2 ? .3 : -.3)); mane.add(lock); }
    mane.rotation.x = .6;
    var tailG = new THREE.Group(); tailG.position.set(0, 1.42, -.62); g.add(tailG);
    for (i = 0; i < 7; i++) { var tl = mesh(new THREE.ConeGeometry(.04, .8, 6), D); tl.position.set((i - 3) * .012, -.4, -.04); tl.rotation.set(PI + .1, 0, (i - 3) * .04); tailG.add(tl); }
    var legs = [];
    [[.17, .42, 0], [-.17, .42, PI], [.17, -.46, PI * .5], [-.17, -.46, PI * 1.5]].forEach(function (p) {
      var hip = new THREE.Group(); hip.position.set(p[0], 1.12, p[1]); g.add(hip);
      var up = mesh(new THREE.CylinderGeometry(.095, .055, .5, 14), M); up.position.y = -.25; hip.add(up);
      var kn = new THREE.Group(); kn.position.y = -.5; hip.add(kn);
      var lo = mesh(new THREE.CylinderGeometry(.045, .038, .5, 12), M); lo.position.y = -.25; kn.add(lo);
      var fet = mesh(new THREE.SphereGeometry(.05, 12, 8), M); fet.position.y = -.5; kn.add(fet);
      var feath = mesh(new THREE.ConeGeometry(.06, .1, 10, 1, true), D); feath.position.y = -.53; kn.add(feath);
      var hoof = mesh(new THREE.CylinderGeometry(.05, .062, .07, 12), D); hoof.position.y = -.57; kn.add(hoof);
      legs.push({ hip: hip, kn: kn, ph: p[2] });
    });
    // 鞍と障泥
    var saddle = mesh(new THREE.CylinderGeometry(.3, .3, .1, 20, 1, false, -PI / 2, PI), std(0x6a1a14, .65)); saddle.rotation.z = PI / 2; saddle.position.set(0, 1.64, .05); saddle.scale.set(1, 1, .9); g.add(saddle);
    [-1, 1].forEach(function (sd) {
      var flap = mesh(new THREE.PlaneGeometry(.5, .42), std(0x3a1210, .8, 0, { side: THREE.DoubleSide, map: lacquerCloudTex(21) })); flap.position.set(sd * .3, 1.4, .05); flap.rotation.y = sd * PI / 2; flap.rotation.z = sd * .12; g.add(flap);
    });
    g.userData.update = function (dt, t, running) {
      legs.forEach(function (l) {
        var a = running ? Math.sin(t * 9 + l.ph) : 0;
        l.hip.rotation.x = a * .55; l.kn.rotation.x = running ? Math.max(0, Math.sin(t * 9 + l.ph + 1.2)) * 1.0 : Math.sin(t * .3 + l.ph) * .02;
      });
      neckG.rotation.x = running ? Math.sin(t * 9) * .07 : Math.sin(t * .6) * .04 - .02;
      tailG.rotation.x = running ? -.5 + Math.sin(t * 9) * .1 : Math.sin(t * .8) * .05;
      tailG.rotation.z = running ? 0 : Math.sin(t * 1.3) * .08;
      g.position.y = running ? Math.abs(Math.sin(t * 9)) * .06 : 0;
    };
    g.userData.saddleY = 1.68;
    return g;
  }

  window.KM_CAST3D = {
    CAST: CAST, makeFigure: makeFigure, makeHorse: makeHorse, lacquerCloudTex: lacquerCloudTex, cupMesh: cupMesh,
    setQuality: function (q) { Q = q; }
  };
})();
