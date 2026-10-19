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

  /* ============================ 人物 ============================ */
  /* head: 彫刻の頭部の値（koumon-figkit の buildHead に渡す）
     robe: 衣の色, trim: 襟の色, armor: 甲冑の色, cap: 冠の種類, h: 身の丈(m) */
  var SKIN = { skin: 0xc49a74, skinRed: 0xb87c62 };
  function headP(o) { var p = { catchlight: true, scalp: 'hair', hairC: 0x17130f, iris: [40, 28, 20], brow: 0x221c18, lipU: .0040, lipL: .0050, lipUvol: .0013, lipLvol: .0017 }; for (var k in SKIN) p[k] = SKIN[k]; for (k in o) p[k] = o[k]; return p; }
  var CAST = {
    hai:  { h: 1.74, robe: 0x7e2a20, trim: 0x1a1210, belt: 0x161010, cap: 'bamboo', head: headP({ seed: 201, age: 50, thin: .35, smile: .15, beard: 'long', beardLen: .08, wrinkles: .6, nose: 1.04, eyeOpenU: .0046 }) },
    ko:   { h: 1.74, robe: 0x141016, trim: 0x8a2a1c, belt: 0xa8842a, cap: 'mian', head: headP({ seed: 201, age: 56, thin: .4, smile: .25, beard: 'long', beardLen: .1, wrinkles: .8, nose: 1.04 }) },
    ryo:  { h: 1.68, robe: 0x5f6e78, trim: 0xe6dcc6, belt: 0x2a2a30, cap: 'cap', head: headP({ seed: 202, age: 30, thin: .05, smile: .05, beard: 'none', wrinkles: .1, jaw: .95, nose: .98, browDrop: .002, eyeOpenU: .005 }) },
    kai:  { h: 1.82, robe: 0x3a1c18, trim: 0x7a2018, armor: 0x3a342c, cord: '#4a1a10', cap: 'helm', build: 1.12, shield: 1, sword: 1, head: headP({ seed: 203, age: 36, thin: 0, smile: 0, beard: 'long', beardLen: .07, hairC: 0x110e0c, wrinkles: .4, jaw: 1.1, browK: 1.2, nose: 1.08, browDrop: .012 }) },
    u:    { h: 1.86, robe: 0x141218, trim: 0xa8842a, armor: 0x24222a, cord: '#3a2a14', cap: 'warrior', build: 1.12, sword: 1, head: headP({ seed: 204, age: 26, thin: .05, smile: 0, beard: 'none', wrinkles: .15, jaw: 1.08, browK: 1.15, nose: 1.03, browDrop: .008, eyeOpenU: .0052 }) },
    zo:   { h: 1.64, robe: 0x4e4232, trim: 0xd8ccb0, belt: 0x241c14, cap: 'cap', jue: 1, head: headP({ seed: 205, age: 72, thin: .85, smile: 0, hairC: 0xd9d4cb, beard: 'long', beardLen: .17, wrinkles: 1.35, spots: 9, browDrop: .016, nose: 1.06, iris: [62, 44, 32], hood: 1.2 }) },
    haku: { h: 1.72, robe: 0x2c3650, trim: 0xcfc4a8, belt: 0x1a1a22, cap: 'cap', sword: 1, head: headP({ seed: 206, age: 46, thin: .4, smile: .1, beard: 'long', beardLen: .11, wrinkles: .7, nose: 1.02 }) },
    sou:  { h: 1.76, robe: 0x2a1a14, trim: 0x8a6a2a, armor: 0x302824, cord: '#5a3a1a', cap: 'helm', sword: 1, head: headP({ seed: 207, age: 22, thin: 0, smile: 0, beard: 'none', wrinkles: 0, jaw: 1.02 }) },
    chin: { h: 1.72, robe: 0x34504e, trim: 0xd8ccb0, belt: 0x1a2222, cap: 'cap', head: headP({ seed: 208, age: 30, thin: .1, smile: .2, beard: 'none', wrinkles: .1 }) },
    msg:  { h: 1.66, robe: 0x5a4632, trim: 0x2a2018, belt: 0x2a2018, cap: 'band', head: headP({ seed: 209, age: 34, thin: .2, beard: 'none', wrinkles: .3 }) },
    ei:   { h: 1.76, robe: 0x2a1a14, trim: 0x5a3a1a, armor: 0x2e2a26, cord: '#4a2a18', cap: 'helm', halberd: 1, head: headP({ seed: 210, age: 28, thin: .1, beard: 'none', wrinkles: .2 }) },
    gu:   { h: 1.6, robe: 0x8a2030, trim: 0xf0e4cc, belt: 0x3a1a20, cap: 'lady', lady: 1, head: headP({ seed: 211, age: 20, thin: 0, smile: .25, beard: 'none', wrinkles: 0, jaw: .9, nose: .9, browK: .85, lipU: .0044, lipL: .0058, lipUvol: .0018, lipLvol: .0024, lip: 0xb04848, lipColL: 0xb85050, skin: 0xd2ac8c, eyeOpenU: .0052 }) },
    tei:  { h: 1.64, robe: 0x5a5448, trim: 0x2a2620, belt: 0x2a2620, cap: 'band', head: headP({ seed: 213, age: 64, thin: .7, smile: .15, hairC: 0xbab4a8, beard: 'long', beardLen: .12, wrinkles: 1.2, spots: 6 }) },
    rba:  { h: 1.76, robe: 0x5a1a14, trim: 0x8a2a1c, armor: 0x3a3028, cord: '#4a1a10', cap: 'helm', sword: 1, head: headP({ seed: 214, age: 34, thin: .2, beard: 'long', beardLen: .06, wrinkles: .4 }) },
    ou:   { h: 1.7, robe: 0x2e4232, trim: 0xd8ccb0, belt: 0x1a221a, cap: 'cap', head: headP({ seed: 212, age: 50, thin: .4, beard: 'long', beardLen: .1, wrinkles: .8 }) }
  };

  var Q = 'high', HEADS = {};
  /** 頭部の彫刻（重い）。同じ値なら使い回す */
  function headMesh(id) {
    var c = CAST[id];
    var key = id === 'ko' ? 'hai' : id;
    var K = window.KM_FIGKIT;
    if (!K) return null;
    var R = K.Res();
    var hq = Q === 'high' ? 'medium' : 'low';
    var hd = K.buildHead(R, c.head, hq);
    void key;
    return hd.group;
  }

  /** 旋盤形（輪郭を回して作る）を楕円に押しつぶし、裾に襞を入れる */
  function latheRobe(profile, segs, zs, folds, foldAmp, seed) {
    var pts = profile.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var g = new THREE.LatheGeometry(pts, segs);
    var pos = g.attributes.position, R = rng(seed || 1);
    var ph = R() * 6;
    var y0 = profile[0][1], y1 = profile[profile.length - 1][1];
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var a = Math.atan2(x, z), r = Math.sqrt(x * x + z * z);
      var u = (y - y0) / (y1 - y0 || 1); // 0=始点 1=終点
      var f = folds ? Math.sin(a * folds + ph + Math.sin(a * 3 + ph) * .8) * foldAmp * u * u : 0;
      r += f;
      pos.setXYZ(i, Math.sin(a) * r, y, Math.cos(a) * r * zs);
    }
    g.computeVertexNormals();
    return g;
  }

  /** 坐した衣：裾の前側を膝の形に張り出させ、上から押しつぶす */
  function seatRobe(r0, r1, depth, knee, seed) {
    var g = latheRobe([[r0, 0], [r0 * 1.12, -.08], [r1 * .9, -depth * .7], [r1, -depth], [r1 * .85, -depth - .004]], 40, .9, 11, .012, seed);
    var pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var u = Math.min(1, Math.max(0, -y / depth));
      if (z > 0) z += knee * Math.pow(u, .8) * (z / (Math.abs(x) + z + .001));
      x *= 1 + .12 * u;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  /** 袖：肘から手首へ広がり、下側が垂れる */
  function sleeveGeo(len, r0, r1, droop, lady) {
    var g = new THREE.CylinderGeometry(r1, r0, len, 18, 6, true);
    g.translate(0, -len / 2, 0);
    var pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var u = -y / len;
      // 腕の内側（-z を体の前と見なす前提ではなく、袖の「下」= +x 側に垂らす）
      var down = Math.max(0, x) / (r1 + .001);
      x += droop * u * u * down * (lady ? 1.6 : 1);
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  function hatMesh(kind, c) {
    var g = new THREE.Group();
    var lac = std(0x0e0c0c, .35, .1), bron = std(0x6a5430, .45, .6), brown = std(0x6a4a2a, .7);
    if (kind === 'bamboo') {
      // 劉氏冠：竹の皮で作った高い冠
      var bd = new THREE.BoxGeometry(.075, .19, .03, 1, 6, 1);
      var p = bd.attributes.position; for (var i = 0; i < p.count; i++) { var y = p.getY(i) + .1; p.setZ(i, p.getZ(i) + y * y * .9); p.setY(i, y); }
      bd.computeVertexNormals();
      var m1 = mesh(bd, std(0x3a2414, .6)); m1.position.set(0, .125, -.01); m1.rotation.x = -.2; g.add(m1);
      var rim2 = mesh(new THREE.BoxGeometry(.08, .012, .034), lac); rim2.position.set(0, .3, .02); rim2.rotation.x = -.2; g.add(rim2);
      var band = mesh(new THREE.CylinderGeometry(.045, .048, .03, 16), lac); band.position.set(0, .118, -.012); g.add(band);
    } else if (kind === 'cap') {
      var ring = mesh(new THREE.CylinderGeometry(.044, .05, .035, 18), lac); ring.position.set(0, .12, -.02); g.add(ring);
      var plate = mesh(new THREE.BoxGeometry(.075, .006, .14), lac); plate.position.set(0, .16, -.01); plate.rotation.x = -.45; g.add(plate);
      var ear = mesh(new THREE.BoxGeometry(.01, .06, .05), lac); ear.position.set(.04, .145, -.03); g.add(ear); var ear2 = ear.clone(); ear2.position.x = -.04; g.add(ear2);
    } else if (kind === 'warrior') {
      var cap = mesh(new THREE.SphereGeometry(.102, 24, 12, 0, PI * 2, 0, PI * .5), std(0x141216, .55, 0)); cap.scale.set(1.02, .95, 1.1); cap.position.set(0, .052, -.016); g.add(cap);
      var rim = mesh(new THREE.TorusGeometry(.1, .007, 8, 32), std(0xa8842a, .35, .8)); rim.rotation.x = PI / 2 + .12; rim.position.set(0, .058, -.018); rim.scale.set(1.02, 1.1, 1); g.add(rim);
      // 鶡冠の雉の尾羽二本
      [-1, 1].forEach(function (s) {
        var curve = new THREE.CatmullRomCurve3([new V3(s * .03, .12, -.03), new V3(s * .07, .3, -.1), new V3(s * .1, .46, -.26), new V3(s * .12, .52, -.46)]);
        var tg = new THREE.TubeGeometry(curve, 32, .011, 8);
        var tp = tg.attributes.position, nseg = 33;
        for (var j = 0; j < tp.count; j++) { var ring = Math.floor(j / 9) / (nseg - 1); var cen = curve.getPoint(Math.min(1, ring)); var k = 1 - ring * .85; tp.setXYZ(j, cen.x + (tp.getX(j) - cen.x) * k * (1.6 - ring), cen.y + (tp.getY(j) - cen.y) * k * .5, cen.z + (tp.getZ(j) - cen.z) * k); }
        tg.computeVertexNormals();
        var t = mesh(tg, std(0x2e2010, .75)); g.add(t);
      });
    } else if (kind === 'helm') {
      var hm = mesh(new THREE.SphereGeometry(.105, 24, 14, 0, PI * 2, 0, PI * .55), bron); hm.scale.set(1, .95, 1.1); hm.position.set(0, .03, -.012); g.add(hm);
      var nk = mesh(new THREE.CylinderGeometry(.11, .125, .07, 24, 1, true, PI * .55, PI * 1.9), std(0x4a3a24, .6, .3, { side: THREE.DoubleSide })); nk.position.set(0, -.01, -.012); g.add(nk);
      var crest = mesh(new THREE.CylinderGeometry(.006, .01, .08, 8), bron); crest.position.set(0, .14, -.01); g.add(crest);
      var tuft = mesh(new THREE.SphereGeometry(.025, 10, 8), std(0x8a1a14, .8)); tuft.position.set(0, .19, -.01); tuft.scale.set(1, 1.6, 1); g.add(tuft);
    } else if (kind === 'band') {
      var bnd = mesh(new THREE.TorusGeometry(.088, .012, 8, 28), std(0x3a2a1a, .9)); bnd.rotation.x = PI / 2 - .2; bnd.position.set(0, .07, -.01); g.add(bnd);
      var knot = mesh(new THREE.SphereGeometry(.035, 12, 10), std(0x17130f, .7)); knot.position.set(0, .13, -.035); g.add(knot);
    } else if (kind === 'mian') {
      var board = mesh(new THREE.BoxGeometry(.2, .012, .32), std(0x0e0c0c, .35, .1)); board.position.set(0, .2, .0); board.rotation.x = .08; g.add(board);
      var bas = mesh(new THREE.CylinderGeometry(.045, .05, .08, 16), lac); bas.position.set(0, .15, -.01); g.add(bas);
      var beadM = std(0xd8c070, .3, .4);
      [-1, 1].forEach(function (s) {
        for (var k = 0; k < 6; k++) {
          var str = mesh(new THREE.CylinderGeometry(.0015, .0015, .1, 4), lac, false); str.position.set(-.08 + k * .032, .145, s * .16); g.add(str);
          var bd2 = mesh(new THREE.SphereGeometry(.007, 6, 6), beadM, false); bd2.position.set(-.08 + k * .032, .1, s * .16); g.add(bd2);
        }
      });
    } else if (kind === 'lady') {
      var hairM = std(0x120e0c, .5);
      var bun = mesh(new THREE.SphereGeometry(.06, 16, 12), hairM); bun.scale.set(1.2, .8, 1); bun.position.set(0, .135, -.05); g.add(bun);
      var bun2 = mesh(new THREE.SphereGeometry(.04, 14, 10), hairM); bun2.position.set(0, .17, -.08); g.add(bun2);
      var pin = mesh(new THREE.CylinderGeometry(.003, .003, .2, 6), std(0xd8b050, .3, .8)); pin.rotation.z = PI / 2 - .3; pin.position.set(0, .16, -.06); g.add(pin);
      var flower = mesh(new THREE.SphereGeometry(.014, 8, 8), std(0xd84860, .5)); flower.position.set(.1, .19, -.06); g.add(flower);
      var back = mesh(new THREE.CylinderGeometry(.05, .03, .5, 12), hairM); back.position.set(0, -.15, -.11); back.rotation.x = .12; back.scale.set(1.3, 1, .6); g.add(back);
      var crown = mesh(new THREE.SphereGeometry(.098, 22, 12, 0, PI * 2, 0, PI * .55), hairM); crown.scale.set(1.02, .92, 1.08); crown.position.set(0, .028, -.015); g.add(crown);
    }
    if (kind !== 'lady' && kind !== 'warrior' && kind !== 'helm') {
      // 髻（もとどり）
      var tk = mesh(new THREE.SphereGeometry(.035, 12, 10), std(0x17130f, .7)); tk.position.set(0, .13, -.035); g.add(tk);
    }
    return g;
  }

  function swordMesh(drawn) {
    var g = new THREE.Group();
    var bladeM = std(0xd8dce4, .25, .9), hiltM = std(0x2a1e14, .6), guardM = std(0xa88a3a, .35, .8);
    var blade = mesh(new THREE.BoxGeometry(.035, .78, .006), bladeM); blade.position.y = -.47; g.add(blade);
    var tip = mesh(new THREE.ConeGeometry(.0175, .07, 4), bladeM); tip.rotation.z = PI; tip.position.y = -.89; tip.scale.z = .2; g.add(tip);
    var gu = mesh(new THREE.BoxGeometry(.09, .02, .03), guardM); gu.position.y = -.07; g.add(gu);
    var hi = mesh(new THREE.CylinderGeometry(.015, .015, .14, 8), hiltM); hi.position.y = 0; g.add(hi);
    var pm = mesh(new THREE.SphereGeometry(.022, 10, 8), guardM); pm.position.y = .08; g.add(pm);
    if (!drawn) { var sc = mesh(new THREE.CylinderGeometry(.026, .02, .8, 8), std(0x1a1210, .5)); sc.position.y = -.47; g.add(sc); blade.visible = false; tip.visible = false; }
    g.userData.blade = blade;
    return g;
  }

  /** 人物を組む。返す Group の userData.rig に関節、userData.setPose で姿勢を変える */
  function makeFigure(id) {
    var c = CAST[id];
    if (!c) return null;
    var s = c.h / 1.72, b = c.build || 1, armored = !!c.armor, lady = !!c.lady;
    var root = new THREE.Group(); root.name = 'fig-' + id;
    var body = new THREE.Group(); root.add(body); // 姿勢全体（倒れるときに回す）
    var robeM = std(0xffffff, .88, 0, { map: clothTex(c.robe, 3 + id.length, null) });
    var trimM = std(c.trim, .8);
    var beltM = std(c.belt || 0x161010, .6);
    var armM = armored ? std(0xffffff, .5, .45, { map: lamellarTex(c.armor, c.cord) }) : null;
    var skinM = std(c.head.skin || 0xc49a74, .62);

    var pelvis = new THREE.Group(); pelvis.position.y = .95 * s; body.add(pelvis);
    var spine = new THREE.Group(); pelvis.add(spine);
    var chest = new THREE.Group(); chest.position.y = .3 * s; spine.add(chest);
    var neck = new THREE.Group(); neck.position.set(0, .2 * s, .0); chest.add(neck);
    var headPiv = new THREE.Group(); neck.add(headPiv);

    // 胴（衣）
    var torsoProfile = [[.15, -.3], [.165, -.18], [.18, 0], [.205 * b, .12], [.19 * b, .17], [.11, .205], [.06, .225]];
    var torso = mesh(latheRobe(torsoProfile.map(function (p) { return [p[0] * s, p[1] * s]; }), 32, .68, 0, 0, 2), armored ? armM : robeM);
    chest.add(torso);
    if (armored) {
      var under = mesh(latheRobe([[.15 * s, -.32 * s], [.16 * s, -.1 * s], [.17 * s, .1 * s]], 24, .66, 0, 0, 2), robeM); chest.add(under);
      [-1, 1].forEach(function (sd) {
        var pa = mesh(new THREE.SphereGeometry(.1 * s * b, 16, 10, 0, PI * 2, 0, PI * .5), armM);
        pa.scale.set(1.1, .75, 1); pa.position.set(sd * .2 * s * b, .13 * s, 0); pa.rotation.z = -sd * .5; chest.add(pa);
      });
    }
    // 襟（右衽：着物の前を右から左へ重ねる）と帯
    var collarCurve = new THREE.CatmullRomCurve3([new V3(.055 * s, .21 * s, .03 * s), new V3(.02 * s, .14 * s, .12 * s), new V3(-.06 * s, .03 * s, .13 * s), new V3(-.12 * s, -.12 * s, .1 * s)]);
    var collar = mesh(new THREE.TubeGeometry(collarCurve, 20, .018 * s, 6), trimM); collar.visible = !armored; chest.add(collar);
    var collar2 = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(-.055 * s, .21 * s, .03 * s), new V3(-.02 * s, .15 * s, .1 * s), new V3(.02 * s, .1 * s, .12 * s)]), 12, .015 * s, 6), trimM); collar2.visible = !armored; chest.add(collar2);
    var belt = mesh(new THREE.CylinderGeometry(.165 * s * b, .165 * s * b, .07 * s, 28, 1, true), beltM); belt.scale.z = .7; belt.position.y = -.27 * s; chest.add(belt);
    var sash = mesh(new THREE.BoxGeometry(.05 * s, .4 * s, .01), beltM); sash.position.set(.06 * s, -.48 * s, .115 * s); chest.add(sash);

    // 裾：立ち・坐り・跽きの三種を用意して切り替える
    var hemLen = .95 * s;
    var skirtStand = armored
      ? mesh(latheRobe([[.17 * s, .02], [.22 * s * b, -.18 * s], [.25 * s * b, -.48 * s]], 32, .78, 9, .012, 5), armM)
      : mesh(latheRobe([[.16 * s, .02], [.2 * s * (lady ? 1.05 : 1), -.16 * s], [.27 * s * (lady ? 1.3 : 1), -.6 * s], [.31 * s * (lady ? 1.45 : 1), -hemLen + .02]], 40, .8, 13, .02, 7), robeM);
    skirtStand.material.side = THREE.DoubleSide;
    pelvis.add(skirtStand);
    var skirtSit = mesh(seatRobe(.17 * s, .36 * s, .4 * s, .36 * s, 9), robeM); skirtSit.material.side = THREE.DoubleSide; skirtSit.visible = false; pelvis.add(skirtSit);
    var skirtKneel = mesh(seatRobe(.17 * s, .3 * s, .62 * s, .26 * s, 13), robeM); skirtKneel.material.side = THREE.DoubleSide; skirtKneel.visible = false; pelvis.add(skirtKneel);

    // 脚（武人は膝下が見える）
    var legs = {};
    ['L', 'R'].forEach(function (k) {
      var sd = k === 'L' ? 1 : -1;
      var hip = new THREE.Group(); hip.position.set(sd * .1 * s, -.05 * s, 0); pelvis.add(hip);
      var thigh = mesh(new THREE.CylinderGeometry(.075 * s, .06 * s, .44 * s, 12), armored ? std(0x2a2420, .8) : robeM); thigh.position.y = -.22 * s; hip.add(thigh);
      var knee = new THREE.Group(); knee.position.y = -.44 * s; hip.add(knee);
      var shin = mesh(new THREE.CylinderGeometry(.058 * s, .045 * s, .42 * s, 12), armored ? std(0x3a2e24, .8) : robeM); shin.position.y = -.21 * s; knee.add(shin);
      var boot = mesh(new THREE.BoxGeometry(.09 * s, .07 * s, .24 * s), std(0x161210, .55)); boot.position.set(0, -.43 * s, .05 * s); knee.add(boot);
      legs[k] = { hip: hip, knee: knee, show: armored };
      hip.visible = armored;
    });

    // 腕
    var arms = {};
    ['L', 'R'].forEach(function (k) {
      var sd = k === 'L' ? 1 : -1;
      var sh = new THREE.Group(); sh.position.set(sd * .19 * s * b, .14 * s, 0); chest.add(sh);
      var ua = mesh(new THREE.CylinderGeometry(.06 * s * b, .05 * s, .29 * s, 12), armored ? armM : robeM); ua.position.y = -.145 * s; sh.add(ua);
      var el = new THREE.Group(); el.position.y = -.29 * s; sh.add(el);
      var sl = mesh(armored ? new THREE.CylinderGeometry(.06 * s, .045 * s, .25 * s, 12, 1, true) : sleeveGeo(.27 * s, .055 * s, (lady ? .14 : .1) * s, (lady ? .2 : .12) * s, lady), armored ? std(0x2a2420, .8) : robeM);
      if (armored) sl.position.y = -.125 * s;
      sl.material.side = THREE.DoubleSide;
      sl.rotation.y = sd > 0 ? 0 : PI; // 袖の垂れを体の外側の下へ
      el.add(sl);
      var cuff = mesh(new THREE.TorusGeometry((armored ? .045 : (lady ? .14 : .1)) * s, .008 * s, 6, 20), trimM, false); cuff.rotation.x = PI / 2; cuff.position.y = -.26 * s; if (!armored) cuff.visible = false; el.add(cuff);
      var wr = new THREE.Group(); wr.position.y = -.25 * s; el.add(wr);
      arms[k] = { sh: sh, el: el, wr: wr };
    });

    // 手（彫刻。無いときは簡易な形）
    function attachHand(k, pose) {
      var A = arms[k];
      if (A.hand) { A.wr.remove(A.hand); }
      var K = window.KM_FIGKIT, hm = null;
      try { if (K) hm = K.handMesh(K.Res(), pose || 'relax', k === 'L' ? 'L' : 'R', c.head, Q === 'high' ? 'medium' : 'low'); } catch (e) { hm = null; }
      if (!hm) { hm = mesh(new THREE.BoxGeometry(.07, .17, .03), skinM); hm.position.y = .06; }
      hm.scale.setScalar(s);
      var g = new THREE.Group(); g.add(hm);
      g.rotation.z = PI; // 指先を腕の先（-Y）へ
      g.rotation.y = k === 'L' ? -PI / 2 : PI / 2; // 手の甲を外へ
      A.wr.add(g); A.hand = g; A.handPose = pose;
    }

    // 頭
    var head = headMesh(id);
    var HEAD_PIV = [0, -.032, -.018];
    if (head) { head.position.set(-HEAD_PIV[0], -HEAD_PIV[1] + .1 * s, -HEAD_PIV[2]); head.scale.setScalar(s); headPiv.add(head); }
    else { var hb = mesh(new THREE.SphereGeometry(.1 * s, 20, 16), skinM); hb.position.y = .13 * s; headPiv.add(hb); }
    var hat = hatMesh(c.cap, c); hat.position.copy(head ? head.position : new V3(0, .13 * s, 0)); hat.scale.setScalar(s); headPiv.add(hat);
    var headTop = new THREE.Object3D(); headTop.position.set(0, .34 * s, 0); headPiv.add(headTop);

    // 持ち物
    var props = {};
    if (c.sword) { props.sheath = swordMesh(false); props.sheath.position.set(-.17 * s, -.28 * s, .04); props.sheath.rotation.set(.25, 0, -.32); chest.add(props.sheath); props.sword = swordMesh(true); props.sword.visible = false; }
    if (c.shield) {
      var shg = new THREE.Group();
      var sm = mesh(new THREE.CylinderGeometry(.24, .24, .03, 24), std(0x5a2018, .6)); sm.rotation.x = PI / 2; sm.scale.set(.75, 1, 1.25); shg.add(sm);
      var boss = mesh(new THREE.SphereGeometry(.06, 12, 8, 0, PI * 2, 0, PI / 2), std(0xa88a3a, .35, .8)); boss.rotation.x = PI / 2; boss.position.z = .015; shg.add(boss);
      var paint = mesh(new THREE.TorusGeometry(.16, .01, 6, 24), std(0xd8b050, .4, .3), false); paint.position.z = .017; paint.scale.set(.75, 1.25, 1); shg.add(paint);
      props.shield = shg;
    }
    if (c.halberd) {
      var hg = new THREE.Group();
      var shaft = mesh(new THREE.CylinderGeometry(.014, .014, 2.6, 8), std(0x3a2a1a, .7)); shaft.position.y = .6; hg.add(shaft);
      var blade = mesh(new THREE.BoxGeometry(.03, .26, .008), std(0xb8bcc4, .3, .9)); blade.position.y = 1.98; hg.add(blade);
      var hook = mesh(new THREE.BoxGeometry(.2, .04, .008), std(0xb8bcc4, .3, .9)); hook.position.set(.09, 1.78, 0); hook.rotation.z = -.25; hg.add(hook);
      props.halberd = hg;
    }
    if (c.jue) {
      var jm = mesh(new THREE.TorusGeometry(.04, .011, 10, 28, PI * 1.8), std(0x8fd4b0, .25, .1, { emissive: col(0x1e5a40), emissiveIntensity: .6 }), false);
      props.jue = jm;
      var jHang = jm.clone(); jHang.scale.setScalar(.8); jHang.position.set(.1 * s, -.33 * s, .12 * s); jHang.rotation.x = PI / 2; chest.add(jHang); props.jueHang = jHang;
    }
    props.cup = new THREE.Group();
    var cupB = mesh(new THREE.CylinderGeometry(.06, .05, .13, 16, 1, true), std(0x3a1c10, .4, .1, { side: THREE.DoubleSide })); props.cup.add(cupB);
    var cupBot = mesh(new THREE.CircleGeometry(.05, 16), std(0x3a1c10, .4)); cupBot.rotation.x = -PI / 2; cupBot.position.y = -.065; props.cup.add(cupBot);
    props.cup.visible = false;

    var rig = { root: root, body: body, pelvis: pelvis, spine: spine, chest: chest, neck: neck, headPiv: headPiv, arms: arms, legs: legs, skirt: { stand: skirtStand, sit: skirtSit, kneel: skirtKneel }, headTop: headTop, props: props, s: s, armored: armored };

    function setArm(k, p, r, e, tw) {
      var A = arms[k], sd = k === 'L' ? 1 : -1;
      A.sh.rotation.set(-p, 0, sd * r);
      A.el.rotation.set(-e, tw || 0, 0);
    }
    function holdIn(k, obj, rot, pos) {
      // 手に物を持たせる（手首の下に付ける）
      var A = arms[k];
      if (obj.parent) obj.parent.remove(obj);
      A.wr.add(obj);
      obj.position.set(pos ? pos[0] : 0, pos ? pos[1] : -.09 * s, pos ? pos[2] : .02);
      obj.rotation.set(rot[0], rot[1], rot[2]);
      obj.visible = true;
    }

    var state = { pose: 'stand', t0: 0 };
    function setPose(pose) {
      state.pose = pose;
      root.visible = pose !== 'gone';
      body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
      spine.rotation.set(0, 0, 0); neck.rotation.set(0, 0, 0); headPiv.rotation.set(0, 0, 0);
      var seated = pose === 'sit' || pose === 'raise';
      var kneel = pose === 'kneel';
      skirtStand.visible = !seated && !kneel;
      skirtSit.visible = seated;
      skirtKneel.visible = kneel;
      pelvis.position.y = seated ? .4 * s : kneel ? .62 * s : .95 * s;
      ['L', 'R'].forEach(function (k) {
        legs[k].hip.visible = armored && !seated && !kneel;
        legs[k].hip.rotation.set(0, 0, 0); legs[k].knee.rotation.set(0, 0, 0);
      });
      if (props.sword) { props.sword.visible = false; if (props.sword.parent) props.sword.parent.remove(props.sword); if (props.sheath) props.sheath.visible = true; }
      if (props.shield && props.shield.parent) props.shield.parent.remove(props.shield);
      if (props.halberd && props.halberd.parent) props.halberd.parent.remove(props.halberd);
      if (props.jue && props.jue.parent) props.jue.parent.remove(props.jue);
      if (props.jueHang) props.jueHang.visible = true;
      if (props.cup.parent) props.cup.parent.remove(props.cup);
      var hp = { L: 'relax', R: 'relax' };
      // 腕の基本：だらりと下げ、少し前へ
      setArm('L', .12, .1, .15); setArm('R', .12, .1, .15);
      if (seated) { setArm('L', .22, .1, .7); setArm('R', .22, .1, .7); hp = { L: 'lap', R: 'lap' }; }
      if (kneel) { setArm('L', .2, .1, .6); setArm('R', .2, .1, .6); hp = { L: 'lap', R: 'lap' }; }
      if (pose === 'raise') { setArm('R', 2.5, .25, .4); hp.R = 'hold'; if (props.jue) { holdIn('R', props.jue, [0, 0, 0], [0, -.13 * s, .03]); props.jueHang.visible = false; } }
      if (pose === 'dance' || pose === 'strike' || pose === 'eat') {
        if (props.sword) { holdIn('R', props.sword, [PI, 0, 0], [0, -.08 * s, .0]); if (props.sheath) props.sheath.visible = false; }
        hp.R = 'grasp';
      }
      if (pose === 'strike') { setArm('R', .9, .1, .2); spine.rotation.x = .25; }
      if (pose === 'eat') { setArm('R', .8, .1, 1.2); setArm('L', .7, -.1, 1.0); spine.rotation.x = .3; if (props.shield) { if (props.shield.parent) props.shield.parent.remove(props.shield); root.add(props.shield); props.shield.position.set(0, .03, .45); props.shield.rotation.set(-PI / 2, 0, 0); } }
      if (pose === 'drink') { setArm('R', 2.4, .5, 2.0); hp.R = 'hold'; holdIn('R', props.cup, [0, 0, .3], [0, -.1 * s, .05]); headPiv.rotation.x = -.45; neck.rotation.x = -.2; }
      if (pose === 'glare') { setArm('L', .2, .35, .3); setArm('R', .2, .35, .3); hp = { L: 'grasp', R: 'grasp' }; legs.L.hip.rotation.z = .12; legs.R.hip.rotation.z = -.12; }
      if (pose === 'charge') { spine.rotation.x = .3; setArm('L', 1.3, .2, .3); hp.L = 'grasp'; legs.L.hip.rotation.x = -.5; legs.L.knee.rotation.x = .5; legs.R.hip.rotation.x = .4; }
      if ((pose === 'glare' || pose === 'charge' || pose === 'stand' || pose === 'run') && props.shield && pose !== 'eat') holdIn('L', props.shield, [0, PI / 2, 0], [-.05, -.12 * s, .1]);
      if (props.halberd && pose !== 'down') { holdIn('R', props.halberd, [0, 0, 0], [0, -.6, .02]); setArm('R', .45, .05, .9); hp.R = 'grasp'; }
      if (pose === 'down') { body.rotation.x = -PI / 2; body.position.set(0, .12, .9 * s); setArm('L', 2.8, .4, .2); setArm('R', .3, .6, .4); }
      if (pose === 'run') hp = { L: 'grasp', R: 'grasp' };
      ['L', 'R'].forEach(function (k) { if (arms[k].handPose !== hp[k]) attachHand(k, hp[k]); });
    }

    function update(dt, t) {
      var p = state.pose, br = Math.sin(t * 1.3 + id.length) * .012;
      chest.scale.set(1, 1 + br * .4, 1 + br);
      neck.rotation.y = Math.sin(t * .37 + id.length * 2) * .08;
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
      } else if (p === 'glare') {
        headPiv.rotation.x = -.05 + Math.sin(t * 7) * .005;
      }
    }

    setPose('stand');
    root.userData = { rig: rig, setPose: setPose, update: update, headTop: headTop, id: id, state: state };
    return root;
  }

  /* ---------- 馬 ---------- */
  function makeHorse(colr) {
    var g = new THREE.Group();
    var M = std(colr || 0x1a1412, .5, .05), D = std(0x0a0806, .8);
    // 胴：一つの楕円体を前後で太さを変えて馬らしい胴にする
    var bg = new THREE.SphereGeometry(.5, 32, 20); var bp = bg.attributes.position;
    for (var i = 0; i < bp.count; i++) {
      var x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      var u = z / .5; // -1 尻 … 1 胸
      var k = 1 - .12 * Math.cos(u * PI) ; // 腰が少し細い
      bp.setXYZ(i, x * .58 * k, y * .62 * k + (y < 0 ? 0 : .04 * (1 - u * u)), z * 1.25);
    }
    bg.computeVertexNormals();
    var body = mesh(bg, M); body.position.y = 1.28; g.add(body);
    // 首と頭
    var neckG = new THREE.Group(); neckG.position.set(0, 1.42, .5); g.add(neckG);
    var ng = new THREE.CylinderGeometry(.13, .24, .78, 16, 4); ng.translate(0, .39, 0);
    var nk = mesh(ng, M); nk.rotation.x = .62; neckG.add(nk);
    var head = new THREE.Group(); head.position.set(0, .66, .45); head.rotation.x = 1.15; neckG.add(head);
    var hg = new THREE.SphereGeometry(.13, 20, 14); var hp = hg.attributes.position;
    for (i = 0; i < hp.count; i++) { var hy = hp.getY(i); var t = (hy + .13) / .26; hp.setXYZ(i, hp.getX(i) * (.85 - t * .25), hy * 2.3, hp.getZ(i) * (1 - t * .15)); }
    hg.computeVertexNormals();
    var hm = mesh(hg, M); hm.position.y = .16; head.add(hm);
    [-1, 1].forEach(function (sd) { var ear = mesh(new THREE.ConeGeometry(.035, .13, 8), M); ear.position.set(sd * .07, -.08, -.08); ear.rotation.x = -1.2; head.add(ear); });
    var mane = mesh(new THREE.BoxGeometry(.05, .72, .14, 1, 6, 1), D); mane.position.set(0, .42, -.08); mane.rotation.x = .62; neckG.add(mane);
    var tg = new THREE.CylinderGeometry(.07, .02, .8, 10, 4); tg.translate(0, -.4, 0);
    var tail = mesh(tg, D); tail.position.set(0, 1.42, -.6); tail.rotation.x = -.35; g.add(tail);
    var legs = [];
    [[.18, .42, 0], [-.18, .42, PI], [.18, -.45, PI * .5], [-.18, -.45, PI * 1.5]].forEach(function (p) {
      var hip = new THREE.Group(); hip.position.set(p[0], 1.12, p[1]); g.add(hip);
      var up = mesh(new THREE.CylinderGeometry(.09, .055, .5, 12), M); up.position.y = -.25; hip.add(up);
      var kn = new THREE.Group(); kn.position.y = -.5; hip.add(kn);
      var lo = mesh(new THREE.CylinderGeometry(.045, .04, .52, 10), M); lo.position.y = -.26; kn.add(lo);
      var fet = mesh(new THREE.SphereGeometry(.05, 10, 8), M); fet.position.y = -.5; kn.add(fet);
      var hoof = mesh(new THREE.CylinderGeometry(.05, .06, .07, 10), D); hoof.position.y = -.56; kn.add(hoof);
      legs.push({ hip: hip, kn: kn, ph: p[2] });
    });
    var saddle = mesh(new THREE.CylinderGeometry(.3, .3, .1, 18, 1, false, -PI / 2, PI), std(0x6a2018, .7)); saddle.rotation.z = PI / 2; saddle.position.set(0, 1.64, .05); saddle.scale.set(1, 1, .9); g.add(saddle);
    g.userData.update = function (dt, t, running) {
      legs.forEach(function (l) {
        var a = running ? Math.sin(t * 9 + l.ph) : 0;
        l.hip.rotation.x = a * .55; l.kn.rotation.x = running ? Math.max(0, Math.sin(t * 9 + l.ph + 1.2)) * 1.0 : 0;
      });
      neckG.rotation.x = running ? Math.sin(t * 9) * .07 : Math.sin(t * .6) * .03;
      tail.rotation.x = -.35 - (running ? .5 + Math.sin(t * 9) * .1 : Math.sin(t * .8) * .05);
      g.position.y = running ? Math.abs(Math.sin(t * 9)) * .06 : 0;
    };
    g.userData.saddleY = 1.66;
    return g;
  }

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
        var cl = S.lightId === 'snowin' ? 0x3a2a24 : 0x6a4a30;
        var fl = mesh(new THREE.PlaneGeometry(12, 12), std(0x2a1c14, .95)); fl.rotation.x = -PI / 2; sc.add(fl);
        sc.add(mat(4.2, 2.6, '#6a5232'));
        var back = curtainWall(10, 4, cl, 9, 1); back.position.set(0, 2, -2.6); sc.add(back);
        var left = curtainWall(8, 4, cl, 7, 2); left.rotation.y = PI / 2; left.position.set(-3.6, 2, 0); sc.add(left);
        var right = curtainWall(8, 4, cl, 7, 3); right.rotation.y = -PI / 2; right.position.set(3.6, 2, 0); sc.add(right);
        var roof = mesh(new THREE.ConeGeometry(6, 2.2, 12, 1, true), std(0x1a120c, .95, 0, { side: THREE.DoubleSide }), false, false); roof.position.y = 5; sc.add(roof);
        var tb = lowTable(1.2); tb.position.set(0, 0, 0); sc.add(tb);
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
        var wallC = day ? 0x9a7a4e : 0x5a3a24;
        var back = curtainWall(12, 4.6, wallC, 10, 4); back.position.set(0, 2.3, -3.6); sc.add(back);
        var left = curtainWall(10, 4.6, wallC, 8, 5); left.rotation.y = PI / 2; left.position.set(-3.8, 2.3, 0); sc.add(left);
        var rightA = curtainWall(4, 4.6, wallC, 3, 6); rightA.rotation.y = -PI / 2; rightA.position.set(3.8, 2.3, -2.4); sc.add(rightA);
        var rightB = curtainWall(4, 4.6, wallC, 3, 7); rightB.rotation.y = -PI / 2; rightB.position.set(3.8, 2.3, 2.6); sc.add(rightB);
        var door = curtainWall(1.6, 4.6, 0x7a2018, 2, 8); door.rotation.y = -PI / 2 + .5; door.position.set(3.5, 2.3, .6); sc.add(door);
        var roof = mesh(new THREE.ConeGeometry(8.5, 2.6, 16, 1, true), std(day ? 0xc8aa78 : 0x1a120c, .95, 0, { side: THREE.DoubleSide, emissive: col(day ? 0x3a2a14 : 0), emissiveIntensity: .5 }), false, false); roof.position.y = 5.9; sc.add(roof);
        [[-1.7, -.2], [-1.7, -1.25], [0, -1.75], [0, 1.65], [1.75, .2]].forEach(function (p, i) { var t = lowTable(.9); t.position.set(p[0], 0, p[1]); t.rotation.y = i < 2 ? PI / 2 : i === 4 ? -PI / 2 : 0; sc.add(t); });
        [[-3.1, -3], [3.1, -3], [-3.1, 2.9], [3.1, 2.9]].forEach(function (p) { var l = lampStand(1.25); l.position.set(p[0], 0, p[1]); sc.add(l); S.anim.push(l); });
        [[-3.6, -3.4], [3.6, -3.4], [0, -3.5]].forEach(function (p) { var pl = mesh(new THREE.CylinderGeometry(.08, .09, 5, 8), std(0x2a1a10, .8)); pl.position.set(p[0], 2.5, p[1]); sc.add(pl); });
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
        var back = curtainWall(16, 7, 0x6a1a14, 10, 9); back.position.set(0, 3.5, -5.5); sc.add(back);
        var pM = std(0x5a140c, .5, .05);
        [-3.5, 3.5].forEach(function (x) { for (var z = -4; z <= 5; z += 3) { var p = mesh(new THREE.CylinderGeometry(.28, .3, 7, 16), pM); p.position.set(x, 3.5, z); sc.add(p); } });
        var dM = std(0x1a0c08, .4, .1);
        [[4.4, .3, -3.6, 3.2], [3.6, .3, -3.4, 2.6]].forEach(function (d, i) { var s = mesh(new THREE.BoxGeometry(d[0], d[1], d[3]), dM); s.position.set(0, d[1] / 2 + i * .3, d[2] - i * .1); sc.add(s); });
        var throne = mesh(new THREE.BoxGeometry(1.6, 1.2, .2), std(0x2a140c, .35, .2)); throne.position.set(0, 1.2, -4.2); sc.add(throne);
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
        var h = S.horse || (S.horse = makeHorse(0x1a1412));
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
      var hz = S.horse || (S.horse = makeHorse(0x1a1412));
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
    supported: supported, mount: mount, resize: resize, setScene: setScene, setPose: setPose, focus: focus, effect: effect,
    start: start, stop: stop, renderOnce: renderOnce, showBubble: showBubble, hideBubble: hideBubble, clearLabels: clearLabels,
    prewarm: prewarm, STAGES: STAGES, LIGHTS: LIGHTS, CAST: CAST, S: S, makeFigure: makeFigure, is3D: true,
    quality: function () { return Q; }
  };
})();
