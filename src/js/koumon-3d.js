/* 楚漢の章 —— 3D の舞台（Three.js r128）
 *
 * 寝殿造り3D探訪の再現モード「徒然草」と同じく、物語の各場面を 3D の舞台として組み、
 * 台詞ごとにカメラを人物へ寄せる（ショット）。光（夕暮れ・夜・夜明け・灯火）は場面ごとに切り替える。
 *
 * 人物は「顔と手は彫刻、衣と甲冑は部品」の二本立て。
 *   - 頭部・手：寝殿造り3D探訪の徒然草の人物と同じ SDF 彫刻（koumon-figkit.js）。顔の陰影・ひげ・皺まで出る。
 *   - 胴・衣・袖・甲冑・冠・剣：Three の基本形を組んだ部品。関節（肩・肘・腰・膝・首）を持たせ、
 *     姿勢（坐す・跽く・剣舞・飲む・睨む…）を関節の角度で作るので、毎フレーム動かせる。
 * 頭部の彫刻は重い（1体 0.3〜0.6 秒）。場面に入る前に人物をそろえ、作ったものは使い回す。
 *
 * 公開する形は 2D 版（koumon-stage.js）と同じ。WebGL が使えなければ 2D 版を使う（koumon.js が選ぶ）。
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;
  var PI = Math.PI, V3 = THREE.Vector3;

  /* ============================ 品質 ============================ */
  function pickQuality() {
    var touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    var small = Math.min(window.innerWidth, window.innerHeight) < 600;
    var lowMem = (navigator.deviceMemory || 8) <= 3;
    var cores = navigator.hardwareConcurrency || 4;
    if (lowMem || cores <= 2) return 'low';
    if (touch || small) return 'medium';
    return 'high';
  }

  /* ============================ 光 ============================ */
  var LIGHTS = {
    dusk:   { top: 0x16162c, mid: 0x5a3a5a, hor: 0xe8955a, sun: [0xffa860, 1.9, [-6, 2.2, -10]], hemi: [0x8a6a8a, 0x2a1e1a, .55], fog: [0x6a4a52, .018], exp: 1.05, stars: 0, sunDisc: 1 },
    night:  { top: 0x02040b, mid: 0x0a1226, hor: 0x1e2a48, sun: [0x9fb6ea, .5, [5, 9, -6]], hemi: [0x3a4a78, 0x0a0a10, .32], fog: [0x0b1020, .022], exp: 1.15, stars: 1, moon: [-30, 40, -90, 4] },
    moon:   { top: 0x030713, mid: 0x0d1a38, hor: 0x2c4068, sun: [0xc4d6ff, .85, [-8, 10, -4]], hemi: [0x4a5a8a, 0x0a0c14, .42], fog: [0x18223a, .02], exp: 1.15, stars: 1, moon: [-40, 34, -70, 5] },
    dawn:   { top: 0x2a3350, mid: 0x7a6f88, hor: 0xf1c8a2, sun: [0xffd9b0, 1.5, [8, 2.5, -10]], hemi: [0xc9c6d8, 0x4a4040, .65], fog: [0xd8c6b8, .02], exp: 1.0, stars: 0, sunDisc: 1 },
    day:    { top: 0x6a8cb0, mid: 0xa9bdd0, hor: 0xefe6d2, sun: [0xfff1d6, 1.2, [4, 10, 3]], hemi: [0xf4e6c8, 0x4a3a2a, .5], fog: [0x8a7a64, .012], exp: .9, stars: 0, indoor: [0xffe2b0, .6] },
    lamp:   { top: 0x050408, mid: 0x0b0810, hor: 0x140e14, sun: [0xffa860, .25, [2, 6, 3]], hemi: [0x5a3a28, 0x0a0606, .18], fog: [0x0a0606, .03], exp: 1.25, stars: 0, indoor: [0xffa050, 1.6] },
    snow:   { top: 0x05070d, mid: 0x111a2c, hor: 0x2a3446, sun: [0xc8d4f0, .55, [6, 10, -8]], hemi: [0x8090b0, 0x1a1e28, .45], fog: [0x2a3242, .03], exp: 1.15, stars: 0 },
    snowin: { top: 0x050408, mid: 0x0b0810, hor: 0x120e14, sun: [0xffb070, .2, [2, 6, 3]], hemi: [0x4a3a3a, 0x080608, .2], fog: [0x0a0808, .03], exp: 1.25, stars: 0, indoor: [0xff9c4c, 1.5] },
    palace: { top: 0x1a0d0a, mid: 0x2a140e, hor: 0x3a1c12, sun: [0xffd090, .9, [3, 9, 6]], hemi: [0xb08060, 0x2a1008, .5], fog: [0x1a0c08, .02], exp: 1.15, stars: 0, indoor: [0xffc060, 1.3] }
  };

  /* ============================ 小道具 ============================ */
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function ease(u) { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); }
  function col(h) { return new THREE.Color(h); }
  function std(c, r, m, o) { var p = { color: col(c), roughness: r == null ? .85 : r, metalness: m || 0 }; if (o) for (var k in o) p[k] = o[k]; return new THREE.MeshStandardMaterial(p); }
  function mesh(g, m, cast, recv) { var x = new THREE.Mesh(g, m); x.castShadow = cast !== false; x.receiveShadow = recv !== false; return x; }
  function canvasTex(w, h, draw, srgb) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  /* 共有の質感 */
  var TEX = {};
  function clothTex(base, seed, stripe) {
    var key = 'cloth|' + base + '|' + seed + '|' + (stripe || '');
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(256, 256, function (g, w, h) {
      var c = col(base);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
      var R = rng(seed);
      for (var i = 0; i < 1800; i++) {
        var a = R() * .08; g.fillStyle = R() < .5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')';
        g.fillRect(R() * w, R() * h, 1 + R() * 2, 1);
      }
      for (i = 0; i < h; i += 2) { g.fillStyle = 'rgba(0,0,0,' + (.03 + R() * .03) + ')'; g.fillRect(0, i, w, 1); }
      if (stripe) { g.fillStyle = stripe; g.fillRect(0, h * .86, w, h * .1); }
    });
    TEX[key].wrapS = TEX[key].wrapT = THREE.RepeatWrapping;
    return TEX[key];
  }
  function lamellarTex(base, cord) {
    var key = 'lam|' + base + '|' + cord;
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = cord; g.fillRect(0, 0, w, h);
      var c = col(base), rows = 14, cols = 20;
      for (var r = 0; r < rows; r++) for (var k = 0; k < cols; k++) {
        var x = k * w / cols + (r % 2 ? w / cols / 2 : 0), y = r * h / rows;
        var gr = g.createLinearGradient(x, y, x, y + h / rows);
        gr.addColorStop(0, '#' + c.clone().lerp(col(0x8a8070), .25).getHexString()); gr.addColorStop(1, '#' + c.clone().multiplyScalar(.75).getHexString());
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + w / cols - 2, y + 2); g.lineTo(x + w / cols - 2, y + h / rows - 6); g.quadraticCurveTo(x + w / cols / 2, y + h / rows + 2, x + 2, y + h / rows - 6); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,240,200,.18)'; g.fillRect(x + w / cols / 2 - 1, y + 4, 2, 2);
      }
    });
    TEX[key].wrapS = TEX[key].wrapT = THREE.RepeatWrapping;
    TEX[key].repeat.set(2, 1.5);
    return TEX[key];
  }
  function glowTex() {
    if (TEX.glow) return TEX.glow;
    TEX.glow = canvasTex(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(.18, 'rgba(255,200,120,.9)'); gr.addColorStop(.45, 'rgba(255,130,50,.35)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    return TEX.glow;
  }
  function flameTex() {
    if (TEX.flame) return TEX.flame;
    TEX.flame = canvasTex(64, 128, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h * .72, 2, w / 2, h * .6, h * .55);
      gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(.25, 'rgba(255,210,120,.95)'); gr.addColorStop(.6, 'rgba(255,120,40,.55)'); gr.addColorStop(1, 'rgba(200,60,20,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(w * .5, 0); g.quadraticCurveTo(w * 1.0, h * .7, w * .5, h); g.quadraticCurveTo(0, h * .7, w * .5, 0); g.fill();
    });
    return TEX.flame;
  }
  function dotTex() {
    if (TEX.dot) return TEX.dot;
    TEX.dot = canvasTex(32, 32, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    return TEX.dot;
  }

  /* ============================ 人物（koumon-cast3d.js） ============================ */
  var CM = window.KM_CAST3D;
  var CAST = CM.CAST, Q = 'high';
  function makeFigure(id) { return CM.makeFigure(id); }
  function makeHorse(kind) { return CM.makeHorse(kind); }

  /* ============================ 舞台の部品 ============================ */
  function ground(size, colr, rough, seed, hills) {
    var g = new THREE.PlaneGeometry(size, size, 80, 80);
    g.rotateX(-PI / 2);
    var p = g.attributes.position, R = rng(seed || 1), cols = [];
    var c0 = col(colr);
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), z = p.getZ(i), d = Math.sqrt(x * x + z * z);
      var y = (Math.sin(x * .15 + seed) * Math.cos(z * .12) * .3 + Math.sin(x * .9 + z * .7) * .04) * Math.min(1, d / 8);
      if (hills) y += Math.max(0, d - hills) * .12 * (1 + Math.sin(Math.atan2(x, z) * 5 + seed) * .5);
      p.setY(i, y);
      var k = .85 + R() * .25; cols.push(c0.r * k, c0.g * k, c0.b * k);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return mesh(g, std(0xffffff, rough || .95, 0, { vertexColors: true }), false, true);
  }
  function ridgeMesh(radius, height, seed, colr, startA, endA) {
    var segs = 120, pts = [], R = rng(seed);
    var g = new THREE.BufferGeometry(), pos = [], idx = [];
    for (var i = 0; i <= segs; i++) {
      var a = startA + (endA - startA) * i / segs;
      var h = height * (.45 + .55 * Math.abs(Math.sin(i * .13 + seed) * Math.cos(i * .05 + seed * 2))) + R() * height * .08;
      var x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
      pos.push(x, -5, z, x, h, z);
      if (i < segs) { var b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    void pts;
    return mesh(g, std(colr, 1, 0, { side: THREE.DoubleSide, fog: true }), false, false);
  }
  function tentMesh(r, h, colr, glow) {
    var g = new THREE.Group();
    var prof = []; for (var i = 0; i <= 10; i++) { var u = i / 10; prof.push(new THREE.Vector2(r * (1 - u) * (1 - u * .15) + .02, h * Math.pow(u, .8))); }
    var tg = new THREE.LatheGeometry(prof, 12);
    var p = tg.attributes.position; for (i = 0; i < p.count; i++) { var x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), y = p.getY(i); var k = 1 + .05 * Math.cos(a * 6) * (1 - y / h); p.setX(i, x * k); p.setZ(i, z * k); }
    tg.computeVertexNormals();
    var m = mesh(tg, std(colr, .95, 0, { side: THREE.DoubleSide }), true, true); g.add(m);
    var pole = mesh(new THREE.CylinderGeometry(.04, .04, h * .3, 6), std(0x2a2018, .8)); pole.position.y = h * 1.12; g.add(pole);
    if (glow) {
      var sh = new THREE.Shape(); sh.moveTo(-r * .22, 0); sh.lineTo(0, h * .42); sh.lineTo(r * .22, 0); sh.closePath();
      var door = mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col(glow), transparent: true, opacity: .85, fog: true }), false, false);
      door.position.set(0, .02, r * .97); door.rotation.x = -.35; g.add(door);
    }
    return g;
  }
  function makeBanner(w, h, colr, glyph) {
    var tex = canvasTex(256, 384, function (g, W, H) {
      g.fillStyle = colr; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,230,180,.5)'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
      if (glyph) { g.fillStyle = 'rgba(250,236,210,.95)'; g.font = 'bold 190px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, W / 2, H / 2); }
    });
    var geo = new THREE.PlaneGeometry(w, h, 12, 6); geo.translate(w / 2, -h / 2, 0);
    var m = mesh(geo, std(0xffffff, .9, 0, { map: tex, side: THREE.DoubleSide }), true, false);
    var g = new THREE.Group();
    var pole = mesh(new THREE.CylinderGeometry(.03, .035, h * 2.6, 8), std(0x1a1210, .7)); pole.position.y = h * 1.3; g.add(pole);
    m.position.set(.03, h * 2.55, 0); g.add(m);
    var base = geo.attributes.position.array.slice();
    g.userData.update = function (dt, t) {
      var p = geo.attributes.position;
      for (var i = 0; i < p.count; i++) { var x = base[i * 3], y = base[i * 3 + 1]; var u = x / w; p.setZ(i, Math.sin(t * 3 + u * 5 + y) * .12 * u); }
      p.needsUpdate = true; geo.computeVertexNormals();
    };
    return g;
  }
  function fireObj(scale, light, colr) {
    var g = new THREE.Group();
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col(colr || 0xffb070), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(scale * 3.5, scale * 3.5, 1); glow.position.y = scale * .6; g.add(glow);
    var fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fl.scale.set(scale * .8, scale * 1.4, 1); fl.position.y = scale * .55; g.add(fl);
    var L = null;
    if (light) { L = new THREE.PointLight(col(0xff9a50), light, scale * 14, 2); L.position.y = scale * .8; g.add(L); }
    var seed = Math.random() * 10;
    g.userData.update = function (dt, t) {
      var f = 1 + Math.sin(t * 13 + seed) * .08 + Math.sin(t * 7.3 + seed * 3) * .07;
      fl.scale.set(scale * .8 * (2 - f), scale * 1.4 * f, 1);
      glow.material.opacity = .75 + (f - 1) * 1.5;
      if (L) L.intensity = light * (.85 + (f - 1) * 1.6);
    };
    return g;
  }
  function campFires(n, rMin, rMax, seed, yFn) {
    var R = rng(seed), pos = [];
    for (var i = 0; i < n; i++) {
      var a = R() * PI * 2, r = rMin + Math.pow(R(), .7) * (rMax - rMin);
      var x = Math.sin(a) * r, z = -Math.cos(a) * r;
      pos.push(x, (yFn ? yFn(x, z) : 0) + .3, z);
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ map: glowTex(), size: 2.4, color: col(0xffa860), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    var pts = new THREE.Points(g, m);
    pts.userData.update = function (dt, t) { m.opacity = .8 + Math.sin(t * 5) * .08; };
    return pts;
  }
  function palisade(len, h, z, gap) {
    var g = new THREE.Group();
    var M = std(0x3a2a1c, .9);
    var geo = new THREE.CylinderGeometry(.09, .1, h, 7); geo.translate(0, h / 2, 0);
    var tipG = new THREE.ConeGeometry(.1, .3, 7); tipG.translate(0, h + .15, 0);
    var R = rng(5);
    for (var x = -len / 2; x <= len / 2; x += .22) {
      if (gap && x > gap[0] && x < gap[1]) continue;
      var hh = .9 + R() * .2;
      var pole = mesh(geo, M); pole.scale.y = hh; pole.position.set(x, 0, z + (R() - .5) * .05); g.add(pole);
      var tp = mesh(tipG, M); tp.scale.y = 1; tp.position.set(x, (hh - 1) * h, z); g.add(tp);
    }
    [.3, .75].forEach(function (k) { var rail = mesh(new THREE.BoxGeometry(len, .1, .08), M); rail.position.set(0, h * k, z + .12); g.add(rail); });
    return g;
  }
  function pineTree(h, seed) {
    var g = new THREE.Group(), R = rng(seed);
    var tr = mesh(new THREE.CylinderGeometry(h * .025, h * .04, h, 7), std(0x2a2018, .9)); tr.position.y = h / 2; tr.rotation.z = (R() - .5) * .15; g.add(tr);
    var fm = std(0x16201a, .95);
    for (var i = 0; i < 9; i++) {
      var u = i / 8, rr = h * (.2 - u * .12) * (.8 + R() * .5);
      var cl = mesh(new THREE.IcosahedronGeometry(rr, 1), fm);
      cl.scale.set(1.3 + R() * .5, .55 + R() * .2, 1.1 + R() * .4); cl.rotation.y = R() * 6;
      var a = R() * PI * 2, off = (1 - u) * h * .12;
      cl.position.set(Math.cos(a) * off, h * (.42 + u * .55), Math.sin(a) * off); g.add(cl);
    }
    return g;
  }
  function curtainWall(w, h, colr, folds, seed) {
    var geo = new THREE.PlaneGeometry(w, h, folds * 6, 8);
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) { var x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x / w * folds * PI * 2 + seed) * .12 * (1 - (y + h / 2) / h * .3)); }
    geo.computeVertexNormals();
    return mesh(geo, std(0xffffff, .95, 0, { map: clothTex(colr, seed + 1, 'rgba(0,0,0,.25)'), side: THREE.DoubleSide }), false, true);
  }
  function lampStand(h) {
    var g = new THREE.Group();
    var M = std(0x5a4428, .4, .6);
    var base = mesh(new THREE.CylinderGeometry(.16, .2, .05, 16), M); g.add(base);
    var pole = mesh(new THREE.CylinderGeometry(.025, .03, h, 8), M); pole.position.y = h / 2; g.add(pole);
    var dish = mesh(new THREE.CylinderGeometry(.16, .08, .06, 16), M); dish.position.y = h; g.add(dish);
    var f = fireObj(.22, 1.6, 0xffc080); f.position.y = h + .02; g.add(f);
    g.userData.update = f.userData.update;
    return g;
  }
  function lowTable(w) {
    var g = new THREE.Group(), M = std(0x2a140c, .35, .1);
    var top = mesh(new THREE.BoxGeometry(w, .04, .45), M); top.position.y = .3; g.add(top);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { var l = mesh(new THREE.BoxGeometry(.05, .3, .05), M); l.position.set(s[0] * (w / 2 - .05), .15, s[1] * .18); g.add(l); });
    var cup = mesh(new THREE.CylinderGeometry(.05, .04, .1, 14), std(0x5a2a14, .3, .1)); cup.position.set(-w * .2, .37, 0); g.add(cup);
    var dish = mesh(new THREE.CylinderGeometry(.12, .1, .03, 16), std(0x3a1a0c, .3)); dish.position.set(w * .2, .335, 0); g.add(dish);
    return g;
  }
  function mat(w, d, colr) {
    var tex = canvasTex(128, 128, function (g, W, H) { g.fillStyle = colr; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(0,0,0,.18)'; for (var y = 0; y < H; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } g.strokeStyle = 'rgba(60,30,10,.6)'; g.lineWidth = 8; g.strokeRect(0, 0, W, H); });
    var m = mesh(new THREE.PlaneGeometry(w, d), std(0xffffff, .95, 0, { map: tex }), false, true); m.rotation.x = -PI / 2; m.position.y = .012;
    return m;
  }

  /* ---------- 帳の中のしつらえ（色は sRGB で指定して線形に直す） ---------- */
  function stdc(c, r, m, o) { var x = std(c, r, m, o); x.color.convertSRGBToLinear(); return x; }
  /** 帷（とばり）の布：縦の織り目と、上の縁の文様帯 */
  function drapeTex(base, seed, band) {
    var key = 'drape|' + base + '|' + seed + '|' + band;
    if (TEX[key]) return TEX[key];
    TEX[key] = canvasTex(256, 512, function (g, w, h) {
      var c = col(base);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
      var R = rng(seed);
      for (var x = 0; x < w; x += 2) { g.fillStyle = 'rgba(0,0,0,' + (.02 + R() * .035) + ')'; g.fillRect(x, 0, 1, h); }
      for (var i = 0; i < 900; i++) { g.fillStyle = R() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; g.fillRect(R() * w, R() * h, 1, 2 + R() * 6); }
      var sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(0,0,0,.25)'); sh.addColorStop(.25, 'rgba(0,0,0,0)'); sh.addColorStop(.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = sh; g.fillRect(0, 0, w, h);
      if (band) {
        // 菱形と雲の文様の帯（錦）
        g.fillStyle = band; g.fillRect(0, h * .02, w, h * .1);
        g.strokeStyle = 'rgba(230,190,110,.8)'; g.lineWidth = 2;
        for (var k = 0; k < 8; k++) { var cx = (k + .5) * w / 8, cy = h * .07; g.beginPath(); g.moveTo(cx - 12, cy); g.lineTo(cx, cy - 14); g.lineTo(cx + 12, cy); g.lineTo(cx, cy + 14); g.closePath(); g.stroke(); }
        g.fillStyle = 'rgba(230,190,110,.9)'; g.fillRect(0, h * .02, w, 3); g.fillRect(0, h * .12 - 3, w, 3);
      }
    });
    TEX[key].wrapS = THREE.RepeatWrapping; TEX[key].wrapT = THREE.ClampToEdgeWrapping;
    return TEX[key];
  }
  /** 帷の壁：上の竿から下がる布。縦のひだ、裾は床でたまる。上に垂れ幕（帷の帽）と、ところどころの束ね紐 */
  function drapeWall(w, h, colr, seed, o) {
    o = o || {};
    var g = new THREE.Group(), R = rng(seed || 3);
    var geo = new THREE.PlaneGeometry(w, h, Math.round(w * 16), 12), p = geo.attributes.position;
    var ph = R() * 6;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), u = (h / 2 - y) / h;
      var fold = Math.sin(x * 9 + ph + Math.sin(x * 2.1 + ph) * 1.4) * .07 + Math.sin(x * 23 + ph * 2) * .018;
      p.setZ(i, fold * (.55 + u * .6) + (u > .96 ? (u - .96) * 2.2 : 0));
    }
    geo.computeVertexNormals();
    var tex = drapeTex(colr, seed || 3, o.band || null); tex = tex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2.2, 1);
    var cloth = mesh(geo, std(0xffffff, .92, 0, { map: tex, side: THREE.DoubleSide }), false, true); g.add(cloth);
    // 竿
    var rod = mesh(new THREE.CylinderGeometry(.035, .035, w + .3, 8), stdc(0x2a1810, .5, .1)); rod.rotation.z = PI / 2; rod.position.set(0, h / 2 + .02, .05); g.add(rod);
    // 帷の帽（スワッグ）：竿に沿って弧を描いて垂れる短い幕
    var vg = new THREE.PlaneGeometry(w, .5, Math.round(w * 12), 4), vp = vg.attributes.position, sw = o.swag || 1.2;
    for (i = 0; i < vp.count; i++) { var vx = vp.getX(i), vy = vp.getY(i), ph2 = ((vx / sw) % 1 + 1) % 1, dip = Math.sin(ph2 * PI) * .16; vp.setY(i, vy < 0 ? vy - dip : vy); vp.setZ(i, .1 + Math.sin(ph2 * PI) * .05 * (vy < 0 ? 1 : 0)); }
    vg.computeVertexNormals();
    var vt = drapeTex(o.valance || 0x6a1810, (seed || 3) + 50, o.band || '#3a0c08').clone(); vt.needsUpdate = true; vt.repeat.set(w / 2.2, .55); vt.offset.y = .42;
    var val = mesh(vg, std(0xffffff, .85, 0, { map: vt, side: THREE.DoubleSide }), false, true); val.position.y = h / 2 - .2; g.add(val);
    // 束ね紐で寄せたところ（深いひだ）
    (o.ties || []).forEach(function (tx) {
      var tie = mesh(new THREE.TorusGeometry(.12, .02, 6, 16), stdc(0xb08a3a, .4, .5)); tie.position.set(tx, -h * .08, .14); tie.scale.set(1, .4, 1); g.add(tie);
      var tas = mesh(new THREE.ConeGeometry(.04, .3, 8, 1, true), stdc(0xa8281a, .8, 0, { side: THREE.DoubleSide })); tas.position.set(tx + .08, -h * .08 - .2, .16); g.add(tas);
    });
    return g;
  }
  /** 屏風：黒漆に朱の雲気文、縁は黒、金具は青銅 */
  function screenMesh(w, h, panels, seed) {
    var g = new THREE.Group(), pw = w / panels;
    var frameM = stdc(0x120a08, .3, .05), bron = stdc(0x8a6a32, .35, .8);
    for (var i = 0; i < panels; i++) {
      var pg = new THREE.Group(), a = (i % 2 ? -1 : 1) * .2;
      var tex = CM.lacquerCloudTex(seed + i);
      var face = mesh(new THREE.BoxGeometry(pw - .06, h - .16, .03), [frameM, frameM, frameM, frameM, stdc(0x8a7a76, .3, 0, { map: tex }), stdc(0x8a7a76, .3, 0, { map: tex })]);
      face.position.y = h / 2 + .04; pg.add(face);
      [-1, 1].forEach(function (sx) { var post = mesh(new THREE.BoxGeometry(.05, h + .04, .05), frameM); post.position.set(sx * (pw / 2 - .025), h / 2 + .02, 0); pg.add(post); });
      [.06, h - .02].forEach(function (y) { var rail = mesh(new THREE.BoxGeometry(pw, .05, .05), frameM); rail.position.y = y; pg.add(rail); });
      var foot = mesh(new THREE.BoxGeometry(.08, .06, .3), bron); foot.position.set(0, .03, 0); pg.add(foot);
      pg.position.x = -w / 2 + pw * (i + .5); pg.rotation.y = a; pg.position.z = (i % 2) * .08;
      g.add(pg);
    }
    return g;
  }
  /** 席（敷物）：い草の目と、錦の縁 */
  function seatMat(w, d, edge) {
    var key = 'seat|' + edge;
    if (!TEX[key]) TEX[key] = canvasTex(128, 128, function (g, W, H) {
      g.fillStyle = '#b89a62'; g.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 3) { g.fillStyle = y % 6 ? 'rgba(80,50,20,.18)' : 'rgba(255,240,200,.12)'; g.fillRect(0, y, W, 1); }
      var b = 16; g.fillStyle = edge || '#5a1410';
      g.fillRect(0, 0, W, b); g.fillRect(0, H - b, W, b); g.fillRect(0, 0, b, H); g.fillRect(W - b, 0, b, H);
      g.fillStyle = 'rgba(220,180,100,.85)';
      for (var k = 0; k < W; k += 16) { g.fillRect(k + 5, 6, 6, 4); g.fillRect(k + 5, H - 10, 6, 4); g.fillRect(6, k + 5, 4, 6); g.fillRect(W - 10, k + 5, 4, 6); }
    });
    var m = mesh(new THREE.BoxGeometry(w, .025, d), stdc(0xffffff, .9, 0, { map: TEX[key] }), false, true); m.position.y = .0125;
    return m;
  }
  /** 耳杯（両側に耳のある楕円の杯）：外は黒漆、内は朱 */
  function earCup() {
    var g = new THREE.Group();
    var cg = new THREE.SphereGeometry(.05, 18, 10, 0, PI * 2, PI / 2, PI / 2); cg.scale(1.35, .55, .9);
    g.add(mesh(cg, stdc(0x120a08, .28, .05, { side: THREE.FrontSide })));
    var ig = new THREE.SphereGeometry(.047, 18, 10, 0, PI * 2, PI / 2, PI / 2); ig.scale(1.35, .52, .9);
    g.add(mesh(ig, stdc(0xa02818, .3, 0, { side: THREE.BackSide })));
    [-1, 1].forEach(function (sd) { var ear = mesh(new THREE.BoxGeometry(.045, .006, .02), stdc(0x120a08, .3)); ear.position.set(0, -.002, sd * .052); g.add(ear); });
    g.position.y = .028;
    return g;
  }
  /** 案（低い漆の食卓）：黒漆、天板の内に朱の雲気文。耳杯・盤・箸 */
  function lacTable(w, food) {
    var g = new THREE.Group(), blk = stdc(0x140a08, .3, .05);
    var top = mesh(new THREE.BoxGeometry(w, .035, .46), [blk, blk, stdc(0xffffff, .3, 0, { map: CM.lacquerCloudTex(31) }), blk, blk, blk]); top.position.y = .26; g.add(top);
    var rim = mesh(new THREE.BoxGeometry(w + .02, .02, .48), blk); rim.position.y = .285; rim.scale.set(1, 1, 1); g.add(rim);
    var inner = mesh(new THREE.BoxGeometry(w - .04, .021, .44), stdc(0xffffff, .3, 0, { map: CM.lacquerCloudTex(31) })); inner.position.y = .287; g.add(inner);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (sd) {
      var leg = new THREE.CylinderGeometry(.018, .028, .25, 8); leg.translate(0, .125, 0);
      var l = mesh(leg, blk); l.position.set(sd[0] * (w / 2 - .06), 0, sd[1] * .17); l.rotation.z = -sd[0] * .12; g.add(l);
      var hoof = mesh(new THREE.SphereGeometry(.03, 8, 6), stdc(0x8a6a32, .35, .8)); hoof.scale.y = .6; hoof.position.set(sd[0] * (w / 2 - .03), .015, sd[1] * .17); g.add(hoof);
    });
    if (food !== false) {
      var c1 = earCup(); c1.position.set(-w * .25, .297, .06); c1.rotation.y = .3; g.add(c1);
      var c2 = earCup(); c2.position.set(-w * .08, .297, -.1); c2.rotation.y = -.2; g.add(c2);
      var plate = mesh(new THREE.CylinderGeometry(.13, .1, .025, 22), stdc(0x140a08, .3)); plate.position.set(w * .2, .31, 0); g.add(plate);
      var pin = mesh(new THREE.CylinderGeometry(.115, .115, .004, 22), stdc(0xa02818, .3)); pin.position.set(w * .2, .324, 0); g.add(pin);
      var meat = mesh(new THREE.SphereGeometry(.06, 10, 8), stdc(0x7a3a24, .5)); meat.scale.set(1.3, .45, 1); meat.position.set(w * .2, .34, 0); g.add(meat);
      [-1, 1].forEach(function (k) { var st = mesh(new THREE.CylinderGeometry(.003, .003, .24, 4), stdc(0x2a1a10, .6)); st.rotation.z = PI / 2; st.rotation.y = .1; st.position.set(w * .02, .302, .17 + k * .012); g.add(st); });
    }
    return g;
  }
  /** 青銅の樽（酒を入れる器）と勺 */
  function bronzeZun() {
    var g = new THREE.Group(), br = stdc(0x6a5a3a, .42, .85), pat = stdc(0x4a6a58, .6, .4);
    var body = mesh(new THREE.CylinderGeometry(.2, .2, .3, 28, 1), br); body.position.y = .24; g.add(body);
    [.12, .34].forEach(function (y) { var band = mesh(new THREE.TorusGeometry(.203, .012, 6, 32), pat); band.rotation.x = PI / 2; band.position.y = y; g.add(band); });
    var lid = mesh(new THREE.SphereGeometry(.205, 24, 8, 0, PI * 2, 0, PI * .3), br); lid.position.y = .32; g.add(lid);
    for (var i = 0; i < 3; i++) { var a = i / 3 * PI * 2, leg = mesh(new THREE.SphereGeometry(.05, 10, 8), br); leg.scale.set(.8, 1.2, .8); leg.position.set(Math.sin(a) * .15, .06, Math.cos(a) * .15); g.add(leg); }
    [-1, 1].forEach(function (sd) { var ring = mesh(new THREE.TorusGeometry(.03, .008, 6, 14), br); ring.position.set(sd * .21, .3, 0); ring.rotation.y = PI / 2; g.add(ring); });
    var lad = mesh(new THREE.CylinderGeometry(.006, .006, .45, 6), br); lad.position.set(.1, .45, 0); lad.rotation.z = -.5; g.add(lad);
    return g;
  }
  /** 戟や戈を立てる架（兵器架） */
  function weaponRack() {
    var g = new THREE.Group(), wd = stdc(0x2a1a10, .7), steel = stdc(0xb8bcc4, .3, .85), red = stdc(0x9a1a12, .85);
    [-.55, .55].forEach(function (x) { var post = mesh(new THREE.BoxGeometry(.07, 1.3, .07), wd); post.position.set(x, .65, 0); g.add(post); });
    [.35, 1.15].forEach(function (y) { var bar = mesh(new THREE.BoxGeometry(1.25, .05, .08), wd); bar.position.set(0, y, 0); g.add(bar); });
    for (var i = 0; i < 4; i++) {
      var x = -.42 + i * .28, sh = mesh(new THREE.CylinderGeometry(.014, .014, 2.5, 6), stdc(0x3a2414, .6)); sh.position.set(x, 1.25, .04); sh.rotation.z = (i - 1.5) * .02; g.add(sh);
      var tip = mesh(new THREE.ConeGeometry(.022, .22, 4), steel); tip.position.set(x, 2.6, .04); tip.scale.z = .25; g.add(tip);
      if (i % 2 === 0) { var ge = mesh(new THREE.BoxGeometry(.2, .03, .006), steel); ge.position.set(x + .09, 2.4, .04); ge.rotation.z = .25; g.add(ge); }
      var tas = mesh(new THREE.ConeGeometry(.03, .09, 8, 1, true), red); tas.position.set(x, 2.32, .04); g.add(tas);
    }
    return g;
  }

  /* ============================ 舞台 ============================ */
  /* pos: 人物の立ち位置 [x, z, 向き(rad, 0=+Z), 姿勢]
     wide: 引きのカメラ [位置], [注視点]
     build(scene, S): 舞台の部品を足し、毎フレーム動かすものを S.anim に積む */
  var STAGES = {
    bashang: {
      pos: { hai: [-.55, 0, .45], ryo: [.75, .15, -.6], kai: [-1.6, .3, .6] },
      wide: [[.4, 1.75, 5.2], [0, 1.35, -1]], light: 'dusk',
      build: function (sc, S) {
        sc.add(ground(160, 0x3a2c22, .95, 3, 30));
        sc.add(ridgeMesh(120, 26, 11, 0x4a3a52, -1.6, 1.6));
        sc.add(ridgeMesh(90, 12, 23, 0x2a2030, -1.4, 1.4));
        var R = rng(7);
        for (var i = 0; i < 70; i++) {
          var x = (R() - .5) * 60, z = -12 - R() * 50;
          var t = tentMesh(1.4 + R(), 1.8 + R(), 0x5a4436, R() < .2 ? 0xffa060 : null); t.position.set(x, 0, z); t.rotation.y = R() * 6; sc.add(t);
        }
        for (i = 0; i < 12; i++) { var f = fireObj(.5, 0, 0xffa060); f.position.set((R() - .5) * 40, 0, -10 - R() * 30); sc.add(f); S.anim.push(f); }
        [[-3.2, -1.5, '沛'], [2.8, -2.4, ''], [4.2, -.5, '']].forEach(function (b) { var bn = makeBanner(.75, 1.2, '#8a241a', b[2]); bn.position.set(b[0], 0, b[1]); sc.add(bn); S.anim.push(bn); });
        S.smoke = { n: 8, area: [-20, 20, -40, -12] };
      }
    },
    koumon: {
      pos: { u: [-1.0, 0, .45], zo: [.85, .3, -.6], msg: [1.9, 1.0, -1.7, 'kneel'], haku: [1.1, .6, -1.2] },
      wide: [[.3, 1.9, 5.6], [0, 1.4, -1.5]], light: 'night',
      build: function (sc, S) {
        sc.add(ground(200, 0x14161e, .95, 5, 40));
        sc.add(ridgeMesh(140, 30, 41, 0x10162a, -1.8, 1.8));
        sc.add(campFires(600, 14, 90, 77));
        var big = tentMesh(6, 5, 0x2a2428, 0xffb070); big.position.set(0, 0, -16); sc.add(big);
        var bl = new THREE.PointLight(col(0xffa050), 2.5, 22, 2); bl.position.set(0, 2, -12.5); sc.add(bl);
        [[-3, -1, '楚'], [3.4, -1.6, '項']].forEach(function (b) { var bn = makeBanner(.9, 1.5, '#16121a', b[2]); bn.position.set(b[0], 0, b[1]); sc.add(bn); S.anim.push(bn); });
        [[-2.2, .8], [2.6, .2]].forEach(function (p) {
          var post = mesh(new THREE.CylinderGeometry(.05, .06, 2.2, 8), std(0x1a1210, .8)); post.position.set(p[0], 1.1, p[1]); sc.add(post);
          var f = fireObj(.4, 2.2); f.position.set(p[0], 2.2, p[1]); sc.add(f); S.anim.push(f); S.embers.push([p[0], 2.5, p[1]]);
        });
      }
    },
    tent: {
      pos: { hai: [-1.05, 0, 1.1, 'sit'], ryo: [1.1, 0, -1.1, 'sit'], haku: [-.35, -.55, .7], u: [-.7, 0, .9, 'sit'], gu: [.8, -.2, -1.0] },
      wide: [[0, 1.6, 4.4], [0, .95, -.4]], light: 'lamp', indoor: true,
      build: function (sc, S) {
        var fl = mesh(new THREE.PlaneGeometry(12, 12), std(0x2a1c14, .95)); fl.rotation.x = -PI / 2; sc.add(fl);
        sc.add(mat(4.2, 2.6, '#6a5232'));
        var snow = S.lightId === 'snowin', wc = snow ? 0x4a3a34 : 0x7a5a3a, vc = snow ? 0x2a1a1a : 0x5a140e;
        var back = drapeWall(10, 4, wc, 1, { band: '#140a08', valance: vc, ties: [-3.2, 3.2] }); back.position.set(0, 2, -2.6); sc.add(back);
        var left = drapeWall(8, 4, wc, 2, { band: '#140a08', valance: vc, ties: [-2] }); left.rotation.y = PI / 2; left.position.set(-3.6, 2, 0); sc.add(left);
        var right = drapeWall(8, 4, wc, 3, { band: '#140a08', valance: vc, ties: [2] }); right.rotation.y = -PI / 2; right.position.set(3.6, 2, 0); sc.add(right);
        var roof = mesh(new THREE.ConeGeometry(6, 2.2, 12, 1, true), std(0x1a120c, .95, 0, { side: THREE.DoubleSide }), false, false); roof.position.y = 5; sc.add(roof);
        var scr = screenMesh(2.6, 1.6, 4, 60); scr.position.set(0, 0, -2.25); sc.add(scr);
        [[-1.05, 0], [1.1, 0], [-.7, 0]].forEach(function (p, i) { if (i === 2) return; var m = seatMat(.9, .9, '#3a1410'); m.position.x = p[0]; sc.add(m); });
        var tb = lacTable(1.2, false); tb.position.set(0, 0, 0); sc.add(tb);
        // 机の上の竹簡（巻いたものと、広げたもの）
        var slipM = stdc(0xc8a870, .7);
        for (var k = 0; k < 3; k++) { var roll = mesh(new THREE.CylinderGeometry(.045, .045, .24, 14), slipM); roll.rotation.z = PI / 2; roll.position.set(-.38 + k * .02, .33, -.12 + k * .1); sc.add(roll); }
        var open = new THREE.Group(); for (k = 0; k < 14; k++) { var sl = mesh(new THREE.BoxGeometry(.016, .004, .24), slipM); sl.position.set(.1 + k * .019, .3, .02); open.add(sl); } sc.add(open);
        var c1 = earCup(); c1.position.set(-.1, .297, .15); sc.add(c1);
        var rk = weaponRack(); rk.rotation.y = PI / 2; rk.position.set(-3.1, 0, -1.2); sc.add(rk);
        var lp = lampStand(.95); lp.position.set(.2, 0, -.5); sc.add(lp); S.anim.push(lp);
        [-2.6, 2.6].forEach(function (x) { var p = mesh(new THREE.CylinderGeometry(.06, .07, 4, 8), std(0x2a1a10, .8)); p.position.set(x, 2, -2.4); sc.add(p); });
      }
    },
    gate: {
      pos: { hai: [-1.5, .9, .5], ryo: [.15, 1.1, -.2], kai: [1.7, .9, -.6], ei: [-.75, -2.1, .9], zo: [-.7, .5, .55], sou: [.7, .6, -.7], chin: [2.7, -.2, -.9] },
      wide: [[0, 1.75, 6.6], [0, 1.4, -1]], light: 'dawn',
      build: function (sc, S) {
        sc.add(ground(160, 0x4a3e32, .95, 9, 30));
        sc.add(ridgeMesh(110, 22, 51, 0x6a6278, -1.7, 1.7));
        var R = rng(14);
        for (var i = 0; i < 40; i++) { var t = tentMesh(1.4 + R(), 1.8 + R(), 0x4a3e38, null); t.position.set((R() - .5) * 50, 0, -8 - R() * 40); sc.add(t); }
        sc.add(palisade(30, 2.6, -2.6, [-1.4, 1.4]));
        var M = std(0x2a1c12, .85);
        [-1.5, 1.5].forEach(function (x) { var p = mesh(new THREE.BoxGeometry(.3, 3.8, .3), M); p.position.set(x, 1.9, -2.6); sc.add(p); });
        var beam = mesh(new THREE.BoxGeometry(3.8, .25, .4), M); beam.position.set(0, 3.7, -2.6); sc.add(beam);
        var roofG = new THREE.CylinderGeometry(.01, 2.6, .9, 4, 1); roofG.rotateY(PI / 4); var roof = mesh(roofG, std(0x1a120c, .9)); roof.scale.set(1, 1, .45); roof.position.set(0, 4.25, -2.6); sc.add(roof);
        [[-2.8, -2.2, '楚'], [2.6, -2.2, '']].forEach(function (b) { var bn = makeBanner(.9, 1.4, '#16121a', b[2]); bn.position.set(b[0], 0, b[1]); sc.add(bn); S.anim.push(bn); });
      }
    },
    feast: {
      pos: { u: [-2.3, -.2, PI / 2, 'sit'], haku: [-2.3, -1.25, PI / 2, 'sit'], zo: [0, -2.4, 0, 'sit'], hai: [0, 2.3, PI, 'sit'], ryo: [2.3, .2, -PI / 2, 'kneel'],
             sou: [0, .5, PI, 'dance'], kai: [1.7, 1.1, -PI / 2, 'glare'] },
      wide: [[1.3, 2.7, 6.4], [-.2, .8, -.6]], light: 'day', indoor: true,
      build: function (sc, S) {
        var day = S.lightId === 'day';
        var fl = mesh(new THREE.PlaneGeometry(16, 16), std(0x2a1c14, .95)); fl.rotation.x = -PI / 2; sc.add(fl);
        sc.add(mat(5.4, 5.4, '#7a5e36'));
        // 帷：生成りの幕に朱の帽、錦の縁。東（右）に入口
        var wallC = day ? 0xb8a07a : 0x5a4030, valC = 0x7a1a10, band = '#1a0c0a';
        var back = drapeWall(12, 4.6, wallC, 10, { band: band, valance: valC, ties: [-4.6, 4.6] }); back.position.set(0, 2.3, -3.6); sc.add(back);
        var left = drapeWall(10, 4.6, wallC, 5, { band: band, valance: valC, ties: [-3.6, 3.6] }); left.rotation.y = PI / 2; left.position.set(-3.8, 2.3, 0); sc.add(left);
        var rightA = drapeWall(4, 4.6, wallC, 6, { band: band, valance: valC, ties: [1.7] }); rightA.rotation.y = -PI / 2; rightA.position.set(3.8, 2.3, -2.4); sc.add(rightA);
        var rightB = drapeWall(4, 4.6, wallC, 7, { band: band, valance: valC, ties: [-1.7] }); rightB.rotation.y = -PI / 2; rightB.position.set(3.8, 2.3, 2.6); sc.add(rightB);
        var door = drapeWall(1.6, 4.6, 0x7a2018, 8, { valance: valC }); door.rotation.y = -PI / 2 + .5; door.position.set(3.5, 2.3, .6); sc.add(door);
        var roof = mesh(new THREE.ConeGeometry(8.5, 2.6, 16, 1, true), std(day ? 0xc8aa78 : 0x1a120c, .95, 0, { side: THREE.DoubleSide, emissive: col(day ? 0x3a2a14 : 0), emissiveIntensity: .5 }), false, false); roof.position.y = 5.9; sc.add(roof);
        // 屏風：項王・項伯の背（西）と、亜父の背（北）
        var scrW = screenMesh(3.0, 1.75, 6, 40); scrW.rotation.y = PI / 2; scrW.position.set(-3.25, 0, -.7); sc.add(scrW);
        var scrN = screenMesh(2.2, 1.6, 4, 50); scrN.position.set(0, 0, -3.15); sc.add(scrN);
        // 席と案
        [[-2.3, -.2], [-2.3, -1.25], [0, -2.4], [0, 2.3], [2.3, .2]].forEach(function (p, i) { var m = seatMat(.95, .95, i < 2 ? '#5a1410' : '#2a1a3a'); m.position.x = p[0]; m.position.z = p[1]; sc.add(m); });
        [[-1.7, -.2], [-1.7, -1.25], [0, -1.75], [0, 1.65], [1.75, .2]].forEach(function (p, i) { var t = lacTable(.9); t.position.set(p[0], 0, p[1]); t.rotation.y = i < 2 ? PI / 2 : i === 4 ? -PI / 2 : i === 2 ? 0 : PI; sc.add(t); });
        var zun = bronzeZun(); zun.position.set(1.15, 0, -1.3); sc.add(zun);
        var rack = weaponRack(); rack.rotation.y = -PI / 2; rack.position.set(3.3, 0, -1.6); sc.add(rack);
        [[-3.1, -3], [3.1, -3], [-3.1, 2.9], [3.1, 2.9]].forEach(function (p) { var l = lampStand(1.25); l.position.set(p[0], 0, p[1]); sc.add(l); S.anim.push(l); });
        [[-3.6, -3.4], [3.6, -3.4], [0, -3.5]].forEach(function (p) { var pl = mesh(new THREE.CylinderGeometry(.08, .09, 5, 10), stdc(0x2a120c, .45, .05)); pl.position.set(p[0], 2.5, p[1]); sc.add(pl);
          [.3, 4.2].forEach(function (y) { var fit = mesh(new THREE.CylinderGeometry(.1, .1, .12, 10), stdc(0x7a5a2a, .35, .8)); fit.position.set(p[0], y, p[1]); sc.add(fit); }); });
        if (day) { var sky = new THREE.PointLight(col(0xfff0d0), .5, 14, 1.5); sky.position.set(0, 5, 0); sc.add(sky); }
      }
    },
    road: {
      pos: { hai: [0, 0, PI / 2, 'ride'], kai: [-1.6, .9, PI / 2, 'run'] },
      runners: [[-2.8, -.5], [-3.6, .6], [-4.6, -.2]],
      wide: [[2.5, 2.2, 7.2], [-.5, 1.4, 0]], light: 'moon', travel: 1.6,
      build: function (sc, S) {
        sc.add(ground(220, 0x1a2030, .95, 13, 30));
        var mt = mesh(new THREE.ConeGeometry(40, 26, 24, 4), std(0x141c30, 1)); mt.position.set(-10, 0, -60); mt.scale.z = .6; sc.add(mt);
        sc.add(ridgeMesh(120, 32, 61, 0x18223a, -1.8, 1.8));
        var R = rng(8);
        for (var i = 0; i < 90; i++) { var p = pineTree(4 + R() * 5, i); var a = (R() - .5) * 120, z = -6 - R() * 40; p.position.set(a, 0, z); sc.add(p); }
        for (i = 0; i < 30; i++) { var q = pineTree(5 + R() * 4, 100 + i); q.position.set((R() - .5) * 120, 0, 6 + R() * 8); sc.add(q); }
        var path = mesh(new THREE.PlaneGeometry(240, 3.2), std(0x3a3a48, .95), false, true); path.rotation.x = -PI / 2; path.position.y = .02; sc.add(path);
      }
    },
    gaixia: {
      pos: { u: [0, 0, 0] }, horse: [2.3, -.6, -1.9],
      wide: [[.6, 1.9, 6.2], [0, 1.5, -1]], light: 'snow', snow: true,
      build: function (sc, S) {
        sc.add(ground(200, 0xc4ccd8, .9, 17, 25));
        sc.add(ridgeMesh(90, 18, 71, 0x1e2638, -PI, PI));
        sc.add(campFires(500, 22, 80, 73, function (x, z) { var d = Math.sqrt(x * x + z * z); return Math.max(0, d - 25) * .12; }));
        sc.add(palisade(24, 2.2, -2.2, [-1.2, 1.2]));
        var t = tentMesh(3, 3, 0x2a2228, 0xffa060); t.position.set(-6.5, 0, -2); sc.add(t);
        var f = fireObj(.5, 2.5); f.position.set(-1.6, 0, 1.2); sc.add(f); S.anim.push(f); S.embers.push([-1.6, .6, 1.2]);
      }
    },
    ukou: {
      pos: { u: [-.3, .6, .7], tei: [1.4, -.6, -1.0], rba: [-2.3, 1.2, 1.2] }, horse: [-2.2, -1.2, 1.35],
      wide: [[.6, 1.7, 6.4], [0, 1.2, -1.6]], light: 'dawn',
      build: function (sc, S) {
        sc.add(ground(160, 0x2e2a22, .95, 21, 60));
        var water = mesh(new THREE.PlaneGeometry(400, 200), std(0x5a6a7a, .18, .55, { transparent: true, opacity: .92 }), false, true);
        water.rotation.x = -PI / 2; water.position.set(0, .05, -102); sc.add(water);
        var bank = mesh(new THREE.PlaneGeometry(400, 3, 40, 2), std(0x3a3226, .95), false, true); bank.rotation.x = -PI / 2; bank.position.set(0, .03, -2.4); sc.add(bank);
        sc.add(ridgeMesh(160, 14, 91, 0x8a8298, -1.3, 1.3));
        // 葦
        var R = rng(31), rm = std(0x6a6440, .9);
        var rg = new THREE.ConeGeometry(.012, 1.2, 4); rg.translate(0, .6, 0);
        for (var i = 0; i < 260; i++) { var r = mesh(rg, rm, false, false); var x = (R() - .5) * 30; if (Math.abs(x) < 2.4 && R() < .8) continue; r.position.set(x, 0, -1.9 - R() * 1.6); r.rotation.set((R() - .5) * .3, 0, (R() - .5) * .3); r.scale.y = .6 + R() * .8; sc.add(r); }
        // 小舟と棹
        var hull = new THREE.Group();
        var hg = new THREE.BoxGeometry(.9, .32, 3.2, 1, 1, 6); var hp = hg.attributes.position;
        for (i = 0; i < hp.count; i++) { var z = hp.getZ(i), y = hp.getY(i); var k = 1 - Math.pow(Math.abs(z) / 1.6, 2) * .8; hp.setX(i, hp.getX(i) * (y < 0 ? k * .7 : k)); hp.setY(i, y + Math.pow(Math.abs(z) / 1.6, 2) * .25); }
        hg.computeVertexNormals();
        hull.add(mesh(hg, std(0x3a2a1a, .8)));
        var pole = mesh(new THREE.CylinderGeometry(.025, .025, 3.4, 6), std(0x5a4a30, .8)); pole.position.set(.3, 1.3, .6); pole.rotation.z = .25; hull.add(pole);
        hull.position.set(2.3, .18, -2.9); hull.rotation.y = 1.2; sc.add(hull);
        S.anim.push({ userData: { update: function (dt, t) { hull.position.y = .18 + Math.sin(t * 1.2) * .03; hull.rotation.z = Math.sin(t * .9) * .02; } } });
      }
    },
    nangong: {
      pos: { ko: [0, -3.2, 0, 'sit'], ou: [1.2, 1.6, PI, 'kneel'] },
      officials: [[-1.2, 1.6, PI], [-2.3, 2.6, PI], [2.3, 2.6, PI]],
      wide: [[0, 2.6, 7.4], [0, 1.4, -2]], light: 'palace', indoor: true,
      build: function (sc, S) {
        var fl = mesh(new THREE.PlaneGeometry(30, 30), std(0x2a1a12, .35, .1)); fl.rotation.x = -PI / 2; sc.add(fl);
        var back = drapeWall(16, 7, 0x6a1a14, 9, { band: '#1a0806', valance: 0x2a0806, swag: 1.6, ties: [-5.5, 5.5] }); back.position.set(0, 3.5, -5.5); sc.add(back);
        var pM = std(0x5a140c, .5, .05);
        [-3.5, 3.5].forEach(function (x) { for (var z = -4; z <= 5; z += 3) { var p = mesh(new THREE.CylinderGeometry(.28, .3, 7, 16), pM); p.position.set(x, 3.5, z); sc.add(p); } });
        var dM = std(0x1a0c08, .4, .1);
        [[4.4, .3, -3.6, 3.2], [3.6, .3, -3.4, 2.6]].forEach(function (d, i) { var s = mesh(new THREE.BoxGeometry(d[0], d[1], d[3]), dM); s.position.set(0, d[1] / 2 + i * .3, d[2] - i * .1); sc.add(s); });
        // 御座：段の上に黒漆の榻、背に朱の雲気文の屏風。左右に青銅の鼎
        var scr = screenMesh(3.2, 2.1, 5, 70); scr.position.set(0, .6, -4.35); sc.add(scr);
        var ta = mesh(new THREE.BoxGeometry(1.7, .16, 1.0), stdc(0x140a08, .3, .05)); ta.position.set(0, .68, -3.4); sc.add(ta);
        var tm = seatMat(1.2, .8, '#7a1a10'); tm.position.set(0, .76, -3.3); sc.add(tm);
        var tb = lacTable(1.0); tb.position.set(0, .6, -2.55); tb.rotation.y = PI; sc.add(tb);
        [-1.6, 1.6].forEach(function (x) { var z = bronzeZun(); z.scale.setScalar(1.6); z.position.set(x, .6, -3.6); sc.add(z); });
        // 臣下の列の間の敷物（緋の毛氈）
        var run = mesh(new THREE.PlaneGeometry(2.2, 8), stdc(0x6a1410, .9)); run.rotation.x = -PI / 2; run.position.set(0, .006, 1.2); sc.add(run);
        [[-2.2, -2], [2.2, -2], [-2.2, 3], [2.2, 3]].forEach(function (p) { var l = lampStand(1.6); l.position.set(p[0], 0, p[1]); sc.add(l); S.anim.push(l); });
        S.platform = .6;
      }
    }
  };

  /* ============================ 状態 ============================ */
  var S = {
    renderer: null, scene: null, camera: null, cv: null, ov: null, cw: 1, ch: 1, running: false, raf: 0, t: 0, tLast: 0,
    stageId: '', lightId: '', stage: null, cast: {}, figs: {}, anim: [], embers: [], parts: null,
    cam: { pos: new V3(), tgt: new V3() }, from: null, to: null, tStart: 0, tDur: 1.7, drift: 0,
    shake: 0, flash: 0, flashC: '255,255,255', pulse: 0, labels: {}, bubble: null, reduced: false, onFrame: null,
    keyLight: null, hemi: null, fx: null, horse: null, rider: null, travel: 0, building: false
  };

  function supported() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function mount(canvas, overlay) {
    S.cv = canvas; S.ov = overlay;
    S.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    Q = pickQuality();
    CM.setQuality(Q);
    try {
      S.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: Q !== 'low', powerPreference: 'high-performance' });
    } catch (e) { S.renderer = null; return false; }
    S.renderer.outputEncoding = THREE.sRGBEncoding;
    S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    S.renderer.shadowMap.enabled = Q !== 'low';
    S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.camera = new THREE.PerspectiveCamera(38, 1, .05, 600);
    // 場面の暗転・閃光を描く板（カメラの前）
    var fxM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    S.fx = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), fxM); S.fx.position.z = -.2; S.fx.renderOrder = 999;
    S.camera.add(S.fx);
    resize();
    return true;
  }
  function resize() {
    if (!S.renderer) return;
    var r = S.cv.getBoundingClientRect();
    S.cw = Math.max(1, r.width); S.ch = Math.max(1, r.height);
    var pr = Math.min(Q === 'high' ? 2 : 1.5, window.devicePixelRatio || 1);
    S.renderer.setPixelRatio(pr);
    S.renderer.setSize(S.cw, S.ch, false);
    S.camera.aspect = S.cw / S.ch;
    // 縦長の画面では画角を広げて、人物が切れないようにする
    S.camera.fov = S.cw / S.ch < 1 ? 54 : 38;
    S.camera.updateProjectionMatrix();
  }

  /* ---------- 空 ---------- */
  function skyDome(L) {
    var g = new THREE.SphereGeometry(400, 32, 16);
    var m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: col(L.top) }, mid: { value: col(L.mid) }, hor: { value: col(L.hor) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y,-.1,1.); vec3 c = mix(hor, mid, smoothstep(0.0,.25,h)); c = mix(c, top, smoothstep(.25,.85,h)); gl_FragColor = vec4(c,1.); }'
    });
    var sky = new THREE.Mesh(g, m); sky.renderOrder = -1;
    return sky;
  }
  function stars() {
    var R = rng(9), pos = [];
    for (var i = 0; i < 900; i++) { var a = R() * PI * 2, e = Math.asin(R() * .95 + .05); pos.push(Math.cos(e) * Math.sin(a) * 380, Math.sin(e) * 380, -Math.cos(e) * Math.cos(a) * 380); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .85, fog: false }));
  }

  function applyLight(sc, L, indoor) {
    sc.fog = new THREE.FogExp2(col(L.fog[0]), L.fog[1]);
    S.renderer.toneMappingExposure = L.exp;
    var hemi = new THREE.HemisphereLight(col(L.hemi[0]), col(L.hemi[1]), L.hemi[2]); sc.add(hemi);
    var key = new THREE.DirectionalLight(col(L.sun[0]), L.sun[1]);
    key.position.set(L.sun[2][0], L.sun[2][1], L.sun[2][2]);
    key.castShadow = Q !== 'low';
    key.shadow.mapSize.set(Q === 'high' ? 2048 : 1024, Q === 'high' ? 2048 : 1024);
    var sc2 = key.shadow.camera; sc2.left = -7; sc2.right = 7; sc2.top = 7; sc2.bottom = -7; sc2.near = .5; sc2.far = 40;
    key.shadow.bias = -.0006; key.shadow.normalBias = .02;
    sc.add(key); sc.add(key.target);
    if (indoor && L.indoor) {
      // 灯火・天幕越しの光を、人物の正面から柔らかく当てる
      var fill = new THREE.PointLight(col(L.indoor[0]), L.indoor[1], 12, 1.6); fill.position.set(0, 2.4, 2.2); sc.add(fill);
    }
    if (!indoor) {
      sc.add(skyDome(L));
      if (L.stars) sc.add(stars());
      if (L.moon) {
        var mo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col(0xdfe6ff), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        mo.position.set(L.moon[0], L.moon[1], L.moon[2]); mo.scale.set(L.moon[3] * 8, L.moon[3] * 8, 1); sc.add(mo);
        var disc = new THREE.Mesh(new THREE.CircleGeometry(L.moon[3], 32), new THREE.MeshBasicMaterial({ color: 0xf2f4ff, fog: false }));
        disc.position.set(L.moon[0], L.moon[1], L.moon[2]); disc.lookAt(0, 0, 0); sc.add(disc);
      }
      if (L.sunDisc) {
        var sd = L.sun[2], sp = new V3(sd[0], sd[1], sd[2]).normalize().multiplyScalar(300);
        var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col(L.sun[0]), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        sun.position.copy(sp); sun.scale.set(90, 90, 1); sc.add(sun);
      }
    } else {
      sc.background = col(L.top);
    }
    S.keyLight = key; S.hemi = hemi;
  }

  /* ---------- 人物をそろえる ---------- */
  var FIGCACHE = {};
  function getFigure(id) {
    if (!FIGCACHE[id]) FIGCACHE[id] = makeFigure(id);
    return FIGCACHE[id];
  }
  /** 足りない人物を一体ずつ作る（作るたびに画面を一度返す） */
  function ensureFigures(ids, onProgress) {
    var todo = ids.filter(function (id) { return CAST[id] && !FIGCACHE[id]; });
    if (!todo.length) return Promise.resolve();
    return new Promise(function (res) {
      var i = 0;
      function step() {
        if (i >= todo.length) { res(); return; }
        try { getFigure(todo[i]); } catch (e) { FIGCACHE[todo[i]] = null; }
        i++;
        if (onProgress) onProgress(i, todo.length);
        setTimeout(step, 16);
      }
      setTimeout(step, 30);
    });
  }
  /** 物語を始める前に、裏で人物を作っておく */
  var warmQ = [];
  function prewarm(ids) {
    ids.forEach(function (id) { if (warmQ.indexOf(id) === -1 && !FIGCACHE[id]) warmQ.push(id); });
    if (prewarm.t) return;
    prewarm.t = setInterval(function () {
      if (S.building) return;
      var id = warmQ.shift();
      if (!id) { clearInterval(prewarm.t); prewarm.t = null; return; }
      if (!FIGCACHE[id]) { try { getFigure(id); } catch (e) { FIGCACHE[id] = null; } }
    }, 400);
  }

  var prepEl = null;
  function showPrep(on, txt) {
    if (!S.ov) return;
    if (!prepEl) { prepEl = document.createElement('div'); prepEl.className = 'km-prep'; S.ov.parentNode.appendChild(prepEl); }
    prepEl.textContent = txt || '絵を整えています…';
    prepEl.classList.toggle('show', !!on);
  }

  function disposeScene(sc) {
    if (!sc) return;
    sc.traverse(function (o) {
      if (o.userData && o.userData.keep) return;
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
    });
  }

  /** 舞台を切り替える。人物の準備が要るときは Promise を返す */
  function setScene(stageId, lightId, cast, poses) {
    S.stageId = STAGES[stageId] ? stageId : 'bashang';
    var st = STAGES[S.stageId];
    S.lightId = LIGHTS[lightId] ? lightId : st.light;
    var ids = (cast || []).slice();
    if (st.officials) ids.push('ou');
    var need = ids.filter(function (id) { return CAST[id] && !FIGCACHE[id]; });
    S.building = true;
    var prep = need.length ? (showPrep(true), ensureFigures(ids, function (i, n) { showPrep(true, '絵を整えています… ' + i + ' / ' + n); })) : Promise.resolve();
    return prep.then(function () {
      showPrep(false);
      S.building = false;
      buildScene(st, ids, cast || [], poses || {});
    });
  }
  function buildScene(st, ids, cast, poses) {
    // 前の舞台から人物を外す（人物は使い回すので破棄しない）
    if (S.scene) {
      Object.keys(FIGCACHE).forEach(function (k) { var f = FIGCACHE[k]; if (f && f.parent) f.parent.remove(f); });
      if (S.horse && S.horse.parent) S.horse.parent.remove(S.horse);
      disposeScene(S.scene);
    }
    var sc = new THREE.Scene();
    S.scene = sc; S.stage = st; S.anim = []; S.embers = []; S.cast = {}; S.travel = 0;
    sc.add(S.camera);
    var L = LIGHTS[S.lightId];
    applyLight(sc, L, !!st.indoor);
    st.build(sc, S);
    // 人物を置く
    cast.forEach(function (id) {
      var f = FIGCACHE[id], p = st.pos[id];
      if (!f || !p) return;
      f.position.set(p[0], (st.platform && id === 'ko') ? st.platform : 0, p[1]);
      f.rotation.set(0, p[2] || 0, 0);
      f.userData.setPose(poses[id] || (p[3] === 'ride' ? 'sit' : p[3]) || 'stand');
      f.userData.home = { x: p[0], z: p[1], yaw: p[2] || 0 };
      sc.add(f);
      S.cast[id] = f;
      if (p[3] === 'ride') {
        var h = S.horse || (S.horse = makeHorse('zhui'));
        h.position.set(p[0], 0, p[1]); h.rotation.y = p[2]; sc.add(h);
        f.position.set(p[0], h.userData.saddleY - .4 * (CAST[id].h / 1.72), p[1]);
        f.userData.rideOn = h;
      } else f.userData.rideOn = null;
    });
    // 衛士は二人で門を守る
    if (S.cast.ei && st === STAGES.gate) {
      var e2 = FIGCACHE.ei2 || (FIGCACHE.ei2 = makeFigure('ei'));
      e2.position.set(.75, 0, -2.1); e2.rotation.y = -.9; e2.userData.setPose(poses.ei || 'stand'); sc.add(e2); S.cast.ei2 = e2;
    }
    if (st.officials && FIGCACHE.ou) {
      st.officials.forEach(function (o, i) {
        var key = 'off' + i;
        var f = FIGCACHE[key] || (FIGCACHE[key] = makeFigure('ou'));
        f.position.set(o[0], 0, o[1]); f.rotation.y = o[2]; f.userData.setPose('kneel'); sc.add(f); S.cast[key] = f;
      });
    }
    if (st.runners && FIGCACHE.kai) {
      st.runners.forEach(function (r, i) {
        var key = 'run' + i;
        var f = FIGCACHE[key] || (FIGCACHE[key] = makeFigure(i === 0 ? 'ei' : 'sou'));
        f.position.set(r[0], 0, r[1]); f.rotation.y = PI / 2; f.userData.setPose('run'); f.userData.home = { x: r[0], z: r[1], yaw: PI / 2 }; sc.add(f); S.cast[key] = f;
        if (f.userData.rig.props.halberd && f.userData.rig.props.halberd.parent) f.userData.rig.props.halberd.parent.remove(f.userData.rig.props.halberd);
      });
    }
    if (st.horse) {
      var hz = S.horse || (S.horse = makeHorse('zhui'));
      hz.position.set(st.horse[0], 0, st.horse[1]); hz.rotation.y = st.horse[2]; sc.add(hz);
    }
    // 粒子
    S.parts = makeParticles(sc, st);
    // 影を落とす範囲を人物のまわりに
    var c = new V3(); var n = 0;
    Object.keys(S.cast).forEach(function (k) { c.add(S.cast[k].position); n++; });
    if (n) c.multiplyScalar(1 / n);
    var L2 = LIGHTS[S.lightId];
    S.keyLight.target.position.copy(c);
    S.keyLight.position.set(c.x + L2.sun[2][0], c.y + L2.sun[2][1], c.z + L2.sun[2][2]);
    S.anchor = c;
    // カメラを引きへ
    S.cam.pos.set(st.wide[0][0], st.wide[0][1], st.wide[0][2]);
    S.cam.tgt.set(st.wide[1][0], st.wide[1][1], st.wide[1][2]);
    S.from = null; S.to = null; S.drift = 0;
    clearLabels(); hideBubble();
  }

  function setPose(id, pose) {
    var f = S.cast[id]; if (!f) return;
    f.userData.setPose(pose);
    if (id === 'ei' && S.cast.ei2) S.cast.ei2.userData.setPose(pose);
  }

  /* ---------- 粒子（雪・火の粉・塵・閃光の火花・玉の破片） ---------- */
  function makeParticles(sc, st) {
    var N = 900, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), kind = new Uint8Array(N);
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({ map: dotTex(), size: .06, transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true });
    var pts = new THREE.Points(g, m); pts.frustumCulled = false; sc.add(pts);
    var gw = new THREE.BufferGeometry(); var posW = new Float32Array(300 * 3); gw.setAttribute('position', new THREE.BufferAttribute(posW, 3));
    var mw = new THREE.PointsMaterial({ map: dotTex(), size: .07, transparent: true, depthWrite: false, color: 0xffb060, blending: THREE.AdditiveBlending });
    var ptsW = new THREE.Points(gw, mw); ptsW.frustumCulled = false; sc.add(ptsW);
    var P = { g: g, pos: pos, vel: vel, life: life, kind: kind, N: N, gw: gw, posW: posW, velW: new Float32Array(300 * 3), lifeW: new Float32Array(300), mat: m, ptsW: ptsW };
    for (var i = 0; i < N; i++) { life[i] = 0; pos[i * 3 + 1] = -999; }
    for (i = 0; i < 300; i++) { P.lifeW[i] = 0; posW[i * 3 + 1] = -999; }
    var snow = st.snow || LIGHTS[S.lightId] === LIGHTS.snow;
    if (snow && !S.reduced) {
      m.size = .05; m.color = col(0xf2f6ff);
      for (i = 0; i < 700; i++) { spawn(P, i, 'snow', true); }
    } else if (st.indoor && !S.reduced) {
      m.size = .02; m.color = col(0xffe0b0); m.opacity = .5;
      for (i = 0; i < 160; i++) spawn(P, i, 'dust', true);
    }
    return P;
  }
  function spawn(P, i, k, scatter) {
    var a = S.anchor || new V3();
    if (k === 'snow') {
      P.pos[i * 3] = a.x + (Math.random() - .5) * 18; P.pos[i * 3 + 1] = scatter ? Math.random() * 8 : 8; P.pos[i * 3 + 2] = a.z + (Math.random() - .5) * 18;
      P.vel[i * 3] = -.2; P.vel[i * 3 + 1] = -.6 - Math.random() * .5; P.vel[i * 3 + 2] = 0; P.life[i] = 30; P.kind[i] = 1;
    } else if (k === 'dust') {
      P.pos[i * 3] = (Math.random() - .5) * 6; P.pos[i * 3 + 1] = Math.random() * 3; P.pos[i * 3 + 2] = (Math.random() - .5) * 6;
      P.vel[i * 3] = (Math.random() - .5) * .02; P.vel[i * 3 + 1] = .01 + Math.random() * .02; P.vel[i * 3 + 2] = (Math.random() - .5) * .02; P.life[i] = 20; P.kind[i] = 2;
    }
  }
  function burst(at, n, kind) {
    var P = S.parts; if (!P) return;
    for (var k = 0, i = 0; i < 300 && k < n; i++) {
      if (P.lifeW[i] > 0) continue;
      P.posW[i * 3] = at.x; P.posW[i * 3 + 1] = at.y; P.posW[i * 3 + 2] = at.z;
      var sp = kind === 'shard' ? 2.2 : 3.2;
      P.velW[i * 3] = (Math.random() - .5) * sp; P.velW[i * 3 + 1] = Math.random() * sp * .8; P.velW[i * 3 + 2] = (Math.random() - .5) * sp;
      P.lifeW[i] = .6 + Math.random() * .6; k++;
    }
    P.ptsW.material.color = col(kind === 'shard' ? 0x9fe8c8 : 0xfff0c0);
  }
  function updateParticles(dt) {
    var P = S.parts; if (!P) return;
    for (var i = 0; i < P.N; i++) {
      if (!P.kind[i]) continue;
      P.pos[i * 3] += P.vel[i * 3] * dt + (P.kind[i] === 1 ? Math.sin(S.t + i) * .004 : 0);
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      P.life[i] -= dt;
      if (P.pos[i * 3 + 1] < 0 || P.life[i] <= 0 || P.pos[i * 3 + 1] > 3.5 && P.kind[i] === 2) spawn(P, i, P.kind[i] === 1 ? 'snow' : 'dust', P.kind[i] === 2);
    }
    P.g.attributes.position.needsUpdate = true;
    // 火の粉（篝火から）と、閃光の火花・破片
    var e = S.embers;
    for (i = 0; i < 300; i++) {
      if (P.lifeW[i] <= 0) {
        if (e.length && Math.random() < .08 && !S.reduced) {
          var src = e[(Math.random() * e.length) | 0];
          P.posW[i * 3] = src[0] + (Math.random() - .5) * .3; P.posW[i * 3 + 1] = src[1]; P.posW[i * 3 + 2] = src[2] + (Math.random() - .5) * .3;
          P.velW[i * 3] = (Math.random() - .5) * .3; P.velW[i * 3 + 1] = .6 + Math.random() * .8; P.velW[i * 3 + 2] = (Math.random() - .5) * .3;
          P.lifeW[i] = 1.2 + Math.random();
        } else { P.posW[i * 3 + 1] = -999; continue; }
      }
      P.lifeW[i] -= dt;
      P.velW[i * 3 + 1] -= (P.velW[i * 3 + 1] > 1.5 ? 4 : .2) * dt;
      P.posW[i * 3] += P.velW[i * 3] * dt; P.posW[i * 3 + 1] += P.velW[i * 3 + 1] * dt; P.posW[i * 3 + 2] += P.velW[i * 3 + 2] * dt;
    }
    P.gw.attributes.position.needsUpdate = true;
  }

  /* ---------- カメラ ---------- */
  function headWorld(f) {
    var v = new V3();
    if (!f) return v;
    f.userData.rig.headPiv.getWorldPosition(v);
    v.y += .12 * f.userData.rig.s;
    return v;
  }
  function focus(target, z) {
    var st = S.stage; if (!st) return;
    var pos, tgt;
    var f = target && target !== 'wide' ? S.cast[target] : null;
    if (!f) {
      pos = new V3(st.wide[0][0], st.wide[0][1], st.wide[0][2]); tgt = new V3(st.wide[1][0], st.wide[1][1], st.wide[1][2]);
      if (st.travel) { pos.x += S.travel; tgt.x += S.travel; }
    } else {
      var h = headWorld(f);
      var yaw = f.rotation.y, dist = (z ? 2.2 / z : 1.25) * (S.cw / S.ch < 1 ? 1.35 : 1);
      // 顔の正面から少し斜めに。引きのカメラ側へ寄せて、壁の向こうへ回り込まないようにする
      var fwd = new V3(Math.sin(yaw), 0, Math.cos(yaw));
      var wideDir = new V3(st.wide[0][0], 0, st.wide[0][2]).sub(new V3(h.x, 0, h.z)).normalize();
      var dir = fwd.clone().multiplyScalar(.75).add(wideDir.multiplyScalar(.6)).normalize();
      if (f.userData.rig && f.userData.home && f === S.cast.hai && st === STAGES.feast) dir = new V3(.35, 0, 1).normalize(); // 背を向けた沛公は肩越しに
      pos = h.clone().add(dir.multiplyScalar(dist)); pos.y = h.y + .08;
      tgt = h.clone(); tgt.y -= .1;
      // 縦長の画面では下に本文パネルが重なるので、顔が画面の上寄りに来るよう注視点を下げる
      if (S.cw / S.ch < 1) { tgt.y = h.y - .42; pos.y = h.y - .02; }
    }
    S.from = { pos: S.cam.pos.clone(), tgt: S.cam.tgt.clone() };
    S.to = { pos: pos, tgt: tgt, id: f ? target : null };
    S.tStart = S.t; S.tDur = S.reduced ? .001 : 1.7; S.drift = 0;
  }

  /** 話し手：その人物は身ぶりをし、ほかの者はそちらへ顔を向ける。id が無ければ解く */
  function speaker(id) {
    S.speakerId = id && S.cast[id] ? id : null;
    var sp = S.speakerId ? S.cast[S.speakerId] : null, hw = sp ? headWorld(sp) : null;
    Object.keys(S.cast).forEach(function (k) {
      var ud = S.cast[k].userData;
      if (ud.talk) ud.talk(k === S.speakerId);
      if (ud.lookAt) ud.lookAt(sp && k !== S.speakerId ? hw : null);
    });
  }

  function effect(name) {
    if (S.reduced && (name === 'shake' || name === 'pulse')) { S.flash = .3; S.flashC = '255,255,255'; return; }
    if (name === 'flash') { S.flash = .8; S.flashC = '255,250,235'; var f = S.cast.sou || S.cast.zo || S.cast.kai || S.cast.haku; if (f) burst(headWorld(f).add(new V3(0, -.3, .2)), 40, 'spark'); }
    if (name === 'red') { S.flash = .55; S.flashC = '170,30,20'; }
    if (name === 'shake') S.shake = 1;
    if (name === 'pulse') S.pulse = 1;
    if (name === 'shatter') { S.flash = .45; S.flashC = '180,255,220'; var z = S.cast.zo; if (z) burst(z.position.clone().add(new V3(0, .1, .5)), 60, 'shard'); }
  }

  /* ---------- 名札・吹き出し ---------- */
  function clearLabels() {
    Object.keys(S.labels).forEach(function (k) { var el = S.labels[k]; if (el.parentNode) el.parentNode.removeChild(el); });
    S.labels = {};
  }
  function labelFor(id) {
    if (S.labels[id]) return S.labels[id];
    var ch = window.KOUMON && window.KOUMON.chars[id];
    if (!ch || !S.ov) return null;
    var el = document.createElement('div'); el.className = 'km-label km-' + ch.side; el.textContent = ch.name;
    S.ov.appendChild(el); S.labels[id] = el; return el;
  }
  function showBubble(id, text, kind) {
    hideBubble();
    if (!S.ov || !S.cast[id]) return;
    var el = document.createElement('div'); el.className = 'km-bub ' + (kind || ''); el.textContent = text;
    S.ov.appendChild(el); S.bubble = { id: id, el: el };
    requestAnimationFrame(function () { el.classList.add('show'); });
  }
  function hideBubble() { if (S.bubble && S.bubble.el.parentNode) S.bubble.el.parentNode.removeChild(S.bubble.el); S.bubble = null; }
  function project(v) {
    var p = v.clone().project(S.camera);
    return { x: (p.x + 1) / 2 * S.cw, y: (1 - p.y) / 2 * S.ch, behind: p.z > 1 };
  }
  function placeOverlay() {
    Object.keys(S.cast).forEach(function (id) {
      var el = labelFor(id); if (!el) return;
      var f = S.cast[id];
      var st = f.userData.state.pose;
      if (!f.visible || st === 'gone' || st === 'down') { el.style.display = 'none'; return; }
      var w = headWorld(f); w.y += .32 * f.userData.rig.s;
      var p = project(w);
      var d = S.camera.position.distanceTo(w);
      if (p.behind || d < .55 || p.x < -40 || p.x > S.cw + 40) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) translate(-50%,-100%)';
    });
    if (S.bubble) {
      var f = S.cast[S.bubble.id];
      if (f) { var w = headWorld(f); w.y += .5 * f.userData.rig.s; var q = project(w); S.bubble.el.style.left = Math.round(Math.max(90, Math.min(S.cw - 90, q.x))) + 'px'; S.bubble.el.style.top = Math.round(Math.max(70, q.y)) + 'px'; }
    }
  }

  /* ---------- 描画 ---------- */
  function frame(now) {
    if (!S.running) return;
    S.raf = requestAnimationFrame(frame);
    var t = now / 1000;
    var dt = S.tLast ? Math.min(.05, t - S.tLast) : .016;
    S.tLast = t;
    draw(dt);
  }
  function draw(dt) {
    if (!S.scene || !S.renderer) return;
    S.t += dt;
    var st = S.stage;
    // 道を駆ける場面：一行が進み、カメラも追う
    if (st.travel && !S.reduced) {
      S.travel += st.travel * dt;
      Object.keys(S.cast).forEach(function (k) {
        var f = S.cast[k], h = f.userData.home; if (!h) return;
        f.position.x = h.x + S.travel;
        if (f.userData.rideOn) f.userData.rideOn.position.x = h.x + S.travel;
      });
      if (S.travel > 60) { S.travel = 0; }
    }
    // カメラ
    if (S.to) {
      var u = ease((S.t - S.tStart) / S.tDur);
      var tp = S.to.pos.clone(), tt = S.to.tgt.clone();
      if (S.to.id && S.cast[S.to.id]) { var h = headWorld(S.cast[S.to.id]); tt.x = h.x; tt.z = h.z; if (st.travel) tp.x = S.to.pos.x + (h.x - S.to.tgt.x); }
      else if (st.travel && !S.to.id) { tp.x = S.to.pos.x; tt.x = S.to.tgt.x; }
      S.cam.pos.lerpVectors(S.from.pos, tp, u);
      S.cam.tgt.lerpVectors(S.from.tgt, tt, u);
      if (u >= 1 && !S.reduced) {
        S.drift += dt;
        var d = Math.min(.06, S.drift * .006);
        S.cam.pos.lerp(S.cam.tgt, d);
      }
    } else if (!S.reduced) {
      S.drift += dt;
      var base = new V3(st.wide[0][0], st.wide[0][1], st.wide[0][2]);
      if (st.travel) base.x += S.travel;
      S.cam.pos.copy(base).add(new V3(Math.sin(S.drift * .1) * .25, 0, 0));
      S.cam.tgt.set(st.wide[1][0] + (st.travel ? S.travel : 0), st.wide[1][1], st.wide[1][2]);
      S.cam.pos.lerp(S.cam.tgt, Math.min(.05, S.drift * .004));
    }
    S.camera.position.copy(S.cam.pos);
    if (S.shake > 0) { S.camera.position.x += (Math.random() - .5) * .06 * S.shake; S.camera.position.y += (Math.random() - .5) * .04 * S.shake; }
    S.camera.lookAt(S.cam.tgt);
    S.shake = Math.max(0, S.shake - dt * 2.2);
    S.flash = Math.max(0, S.flash - dt * 1.8);
    S.pulse = Math.max(0, S.pulse - dt * .8);
    // 動くもの
    var t = S.t;
    S.anim.forEach(function (o) { if (o.userData.update) o.userData.update(dt, t); });
    Object.keys(S.cast).forEach(function (k) { var f = S.cast[k]; f.userData.update(dt, t + k.length); });
    // 剣舞の項荘は沛公の席へ寄っていく
    var sou = S.cast.sou;
    if (sou && sou.userData.state.pose === 'dance' && sou.userData.home && !S.reduced) {
      sou.position.x = sou.userData.home.x + Math.sin(t * .8) * 1.1;
      sou.position.z = sou.userData.home.z + (Math.sin(t * .37) * .5 + .4);
    }
    if (S.horse && S.horse.parent) S.horse.userData.update(dt, t, !!st.travel);
    updateParticles(dt);
    // 閃光・赤い脈
    var fx = S.fx.material;
    if (S.flash > 0) { var cc = S.flashC.split(','); fx.color.setRGB(cc[0] / 255, cc[1] / 255, cc[2] / 255); fx.opacity = S.flash; }
    else if (S.pulse > 0) { fx.color.setRGB(.55, .05, .03); fx.opacity = .35 * Math.sin(S.pulse * PI); }
    else fx.opacity = 0;
    S.renderer.render(S.scene, S.camera);
    placeOverlay();
    if (S.onFrame) S.onFrame();
  }

  function start() { if (S.running || !S.renderer) return; S.running = true; S.tLast = 0; S.raf = requestAnimationFrame(frame); }
  function stop() { S.running = false; cancelAnimationFrame(S.raf); }
  function renderOnce() { draw(.016); }

  window.KoumonStage3D = {
    supported: supported, mount: mount, resize: resize, setScene: setScene, setPose: setPose, focus: focus, effect: effect, speaker: speaker,
    start: start, stop: stop, renderOnce: renderOnce, showBubble: showBubble, hideBubble: hideBubble, clearLabels: clearLabels,
    prewarm: prewarm, STAGES: STAGES, LIGHTS: LIGHTS, CAST: CAST, S: S, makeFigure: makeFigure, is3D: true,
    quality: function () { return Q; }
  };
})();
