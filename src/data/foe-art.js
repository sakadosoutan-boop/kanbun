/* 道場破りの相手の水墨画（インラインSVG）
 *
 * 色は一切持たせず、すべて currentColor の濃淡だけで描く。紙の色・墨の色は
 * テーマ変数から決まるので、明暗どちらのテーマでも「紙に墨」の関係が保たれる。
 *
 * 筆味は feTurbulence + feDisplacementMap で輪郭を毛羽立たせて出す。
 * 三段階の filter を使い分ける：
 *   sumi-w  淡墨のにじみ（大きく揺らして、ぼかす）
 *   sumi-b  濃墨のかたまり（中くらいに揺らす）
 *   sumi-s  筆線・細部（わずかに揺らす。崩れると線が切れるため）
 *
 * クラス
 *   .w  淡墨   .m  中墨   .b  濃墨   .s  筆線   .hl 白抜き   .a 朱
 */
(function () {
  'use strict';

  /* フィルタ定義。DOM に一度だけ差し込む（id は文書内で共有される） */
  window.FOE_ART_DEFS =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">' +
    '<defs>' +
      '<filter id="sumi-w" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.021" numOctaves="3" seed="11" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G"/>' +
        '<feGaussianBlur stdDeviation="2.1"/>' +
      '</filter>' +
      '<filter id="sumi-b" x="-25%" y="-25%" width="150%" height="150%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.052" numOctaves="4" seed="5" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="4.2" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>' +
      '<filter id="sumi-s" x="-25%" y="-25%" width="150%" height="150%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.075" numOctaves="3" seed="19" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.9" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>' +
    '</defs></svg>';

  /* wash: 背景のにじみ / body: 墨のかたまり / line: 筆線 / fine: にじませない細部 */
  function svg(wash, body, line, fine) {
    return '<svg class="ink" viewBox="0 0 120 120" role="img" aria-hidden="true" ' +
      'xmlns="http://www.w3.org/2000/svg">' +
      '<g filter="url(#sumi-w)">' + wash + '</g>' +
      '<g filter="url(#sumi-b)">' + body + '</g>' +
      '<g filter="url(#sumi-s)">' + (line || '') + '</g>' +
      (fine || '') +
      '</svg>';
  }

  window.FOE_ART = {

    /* ── 井の中の蛙 ── 井戸の底からこちらを見上げる蛙 ── */
    f1: svg(
      '<ellipse class="w" cx="60" cy="70" rx="45" ry="37"/>' +
      /* 井戸の底の水たまり */
      '<path class="w" d="M14 104q46 12 92-4v7q-46 14-92 4z"/>',

      /* 後脚 */
      '<path class="b" d="M25 74c-11 5-17 18-11 27 6 9 20 9 25-1 5-8 1-18-6-23z"/>' +
      '<path class="b" d="M95 74c11 5 17 18 11 27-6 9-20 9-25-1-5-8-1-18 6-23z"/>' +
      /* 胴 */
      '<path class="b" d="M60 46c21 0 37 13 37 29 0 15-16 26-37 26S23 90 23 75c0-16 16-29 37-29z"/>' +
      /* 目のふくらみ */
      '<circle class="b" cx="42" cy="45" r="15.5"/>' +
      '<circle class="b" cx="78" cy="45" r="15.5"/>' +
      /* 背の濃淡 */
      '<path class="m" d="M38 62c14-7 30-7 44 0-6 9-16 13-22 13s-16-4-22-13z" fill-opacity=".3"/>',

      /* 口・前脚 */
      '<path class="s" d="M40 76q20 13 40 0"/>' +
      '<path class="s" d="M47 96q-5 9 1 14"/>' +
      '<path class="s" d="M73 96q5 9-1 14"/>',

      /* 目 */
      '<circle class="hl" cx="42" cy="44" r="8.6"/>' +
      '<circle class="hl" cx="78" cy="44" r="8.6"/>' +
      '<circle class="b" cx="43" cy="46" r="4.9"/>' +
      '<circle class="b" cx="79" cy="46" r="4.9"/>'
    ),

    /* ── 燕雀 ── 枝にとまる雀 ── */
    f2: svg(
      '<ellipse class="w" cx="62" cy="54" rx="42" ry="34"/>' +
      '<path class="w" d="M6 96q54 14 110-6v9q-56 20-110 6z"/>',

      /* 胴 */
      '<path class="b" d="M48 36c19-8 38 2 45 19 7 18-2 35-19 41-19 7-40-1-46-17-6-16 2-36 20-43z"/>' +
      /* 頭 */
      '<circle class="b" cx="44" cy="38" r="18"/>' +
      /* くちばし */
      '<path class="b" d="M26 36l-17 4 16 8z"/>' +
      /* 尾（先を細くする） */
      '<path class="b" d="M84 70l30 6-27 12-6-8z"/>' +
      /* 翼 */
      '<path class="m" d="M58 52c15-3 28 5 33 18-10 9-26 8-35-2-5-6-4-14 2-16z"/>' +
      /* 頬の白 */
      '<path class="m" fill-opacity=".25" d="M34 44c7-4 15-3 19 2-4 6-12 8-18 5z"/>',

      /* 脚 */
      '<path class="s" style="stroke-width:2.4" d="M55 92v9M67 91v10"/>' +
      /* 枝 */
      '<path class="s" style="stroke-width:4.5" d="M10 99q36 9 100-5"/>' +
      '<path class="s" style="stroke-width:2.4" d="M40 100l-9 9M84 96l7 9"/>',

      '<circle class="hl" cx="40" cy="33" r="4.6"/>' +
      '<circle class="b" cx="40" cy="33" r="2.3"/>'
    ),

    /* ── 守株の農夫 ── 切り株のかたわらで身構える兎 ── */
    f3: svg(
      '<ellipse class="w" cx="52" cy="70" rx="44" ry="34"/>' +
      '<path class="w" d="M8 100q52 12 106-4v8q-54 16-106 4z"/>',

      /* 切り株（斧の跡が残る、いびつな断面） */
      '<path class="b" d="M75 64l6-6 9 3 8-4 8 5-4 38c0 3-2 4-5 4H82c-3 0-5-1-5-4z"/>' +
      /* 断面は紙の色に近く抜き、そこに年輪を描く */
      '<ellipse class="hl" cx="91" cy="64" rx="15" ry="5.6" fill-opacity=".9"/>' +
      /* 兎の胴 */
      '<path class="b" d="M40 54c15 0 26 12 26 26 0 12-9 20-24 20-16 0-26-8-26-20 0-14 9-26 24-26z"/>' +
      /* 頭 */
      '<circle class="b" cx="32" cy="50" r="15"/>' +
      /* 耳（先をすぼめる） */
      '<path class="b" d="M24 40c-6-17-5-30 1-30 7 0 9 13 6 29z"/>' +
      '<path class="b" d="M38 40c1-17 7-29 13-27 5 2 1 14-6 29z"/>' +
      /* 背の濃淡 */
      '<path class="m" fill-opacity=".28" d="M30 62c12-4 24 0 30 9-9 5-24 5-33-1z"/>',

      /* 年輪 */
      '<path class="s" style="stroke-width:1.7" stroke-opacity=".8" d="M87 64q4-3 7 0M83 66q10-7 17-2"/>' +
      /* 樹皮の割れ */
      '<path class="s" style="stroke-width:1.8" stroke-opacity=".3" d="M84 76q-1 12 1 22M99 78q1 10 0 20"/>' +
      /* 鼻・口 */
      '<path class="s" style="stroke-width:2" d="M20 55q4 5 9 3"/>' +
      /* 耳の内側 */
      '<path class="s" style="stroke-width:1.6" stroke-opacity=".45" d="M23 36q-3-12 0-19M40 36q1-12 6-19"/>',

      '<circle class="hl" cx="25" cy="49" r="3.8"/>' +
      '<circle class="b" cx="25" cy="50" r="1.9"/>' +
      /* 尾 */
      '<circle class="hl" cx="64" cy="72" r="6"/>'
    ),

    /* ── 矛盾の商人 ── 矛と盾を売り立てる ── */
    f4: svg(
      '<ellipse class="w" cx="60" cy="62" rx="45" ry="41"/>',

      /* 矛の柄（下ほど太く） */
      '<path class="b" d="M22 112l6 3 72-88-5-3z"/>' +
      /* 矛先 */
      '<path class="b" d="M96 24l3-7 9-12 0 16-6 9z"/>' +
      /* 商人 */
      '<circle class="b" cx="68" cy="40" r="12"/>' +
      '<path class="b" d="M68 52c12 0 20 10 22 24l3 26H43l3-26c2-14 10-24 22-24z"/>' +
      /* 頭巾 */
      '<path class="b" d="M56 38c0-9 5-15 12-15s12 6 12 15z"/>' +
      '<path class="b" d="M79 30l9-5-6 10z"/>' +
      /* 盾（左手に構える） */
      '<path class="b" d="M12 56l18-9 18 9v16c0 13-8 22-18 27-10-5-18-14-18-27z"/>' +
      '<path class="hl" fill-opacity=".82" d="M18 60l12-6 12 6v12c0 9-6 16-12 20-6-4-12-11-12-20z"/>' +
      '<path class="m" fill-opacity=".3" d="M30 54l12 6v12c0 9-6 16-12 20z"/>',

      /* 商人の腕（盾を掲げる） */
      '<path class="s" style="stroke-width:5" d="M50 62q-11 2-18 6"/>',

      /* 盾の朱の鋲 */
      '<circle class="a" cx="30" cy="70" r="4.6"/>'
    ),

    /* ── 虎の威を借る狐 ── 背に虎の影 ── */
    f5: svg(
      '<ellipse class="w" cx="56" cy="72" rx="45" ry="34"/>',

      /* 背後にぬっと現れる虎の顔。薄墨だが輪郭ははっきりさせる */
      '<circle class="m" fill-opacity=".15" cx="70" cy="20" r="10"/>' +
      '<circle class="m" fill-opacity=".15" cx="104" cy="20" r="10"/>' +
      '<path class="m" fill-opacity=".15" d="M64 18h46c4 0 6 3 6 7v18c0 18-13 29-29 29S58 61 58 43V25c0-4 2-7 6-7z"/>' +
      /* 額の「王」——虎の目印 */
      '<path class="m" fill-opacity=".3" d="M79 24h16v3H79zM79 31h16v3H79zM85.5 20h3v17h-3z"/>' +
      /* 目・鼻・頬の縞 */
      '<ellipse class="m" fill-opacity=".38" cx="76" cy="43" rx="4.4" ry="3.2"/>' +
      '<ellipse class="m" fill-opacity=".38" cx="98" cy="43" rx="4.4" ry="3.2"/>' +
      '<path class="m" fill-opacity=".34" d="M81 51h12l-6 7z"/>' +
      '<path class="m" fill-opacity=".2" d="M62 34l-8 3 1-7zM112 34l8 3-1-7z"/>' +
      /* 狐の尾（付け根を太く、先へすぼめる） */
      '<path class="b" d="M62 92c16 7 33-4 36-23 2-11-5-19-12-17 7 8 2 22-10 29-7 4-12 6-14 11z"/>' +
      /* 狐の胴（座り姿） */
      '<path class="b" d="M48 56c15 0 25 13 25 29 0 12-9 19-23 19-15 0-26-8-26-20 0-15 10-28 24-28z"/>' +
      /* 頭（左向き・鼻先をとがらせる） */
      '<path class="b" d="M54 42l4 25-20 6-26-12 22-17z"/>' +
      /* 耳（頭に食い込ませる） */
      '<path class="b" d="M32 48L27 24l18 16z"/>' +
      '<path class="b" d="M48 45l7-21 6 22z"/>' +
      /* 胸の白 */
      '<path class="m" fill-opacity=".24" d="M36 70c9-3 18 0 22 7-8 6-19 6-26 1z"/>',

      /* 尾の先 */
      '<path class="s hl-s" style="stroke-width:2.2" stroke-opacity=".45" d="M88 52q5 4 4 11"/>',

      '<circle class="hl" cx="38" cy="50" r="3.6"/>' +
      '<circle class="b" cx="38" cy="51" r="1.8"/>' +
      '<circle class="b" cx="13" cy="61" r="2.6"/>'
    ),

    /* ── 胡蝶 ── 夢に舞う ── */
    f6: svg(
      '<ellipse class="w" cx="60" cy="56" rx="45" ry="37"/>' +
      '<path class="w" fill-opacity=".07" d="M18 96q42 12 84-4v7q-42 16-84 4z"/>',

      /* 上翅 */
      '<path class="b" d="M57 58C46 27 24 12 13 22 1 33 13 58 34 66c11 4 19 2 23-8z"/>' +
      '<path class="b" d="M63 58C74 27 96 12 107 22c12 11 0 36-21 44-11 4-19 2-23-8z"/>' +
      /* 下翅 */
      '<path class="m" d="M56 63c-8 22-22 35-32 31-10-5-6-24 9-32 9-4 18-4 23 1z"/>' +
      '<path class="m" d="M64 63c8 22 22 35 32 31 10-5 6-24-9-32-9-4-18-4-23 1z"/>' +
      /* 胴 */
      '<path class="b" d="M60 43c3 0 5 3 5 9v37c0 6-2 9-5 9s-5-3-5-9V52c0-6 2-9 5-9z"/>',

      /* 触角 */
      '<path class="s" style="stroke-width:2.4" d="M57 44q-7-11-17-14M63 44q7-11 17-14"/>' +
      /* 翅脈 */
      '<path class="s" style="stroke-width:1.6" stroke-opacity=".3" d="M52 54q-14-12-28-18M68 54q14-12 28-18"/>',

      '<circle class="hl" cx="33" cy="40" r="5"/>' +
      '<circle class="hl" cx="87" cy="40" r="5"/>' +
      '<circle class="hl" cx="27" cy="76" r="3.4"/>' +
      '<circle class="hl" cx="93" cy="76" r="3.4"/>'
    ),

    /* ── 李白 ── 月を仰いで杯を挙げる ── */
    f7: svg(
      /* 月。輪郭を描かず、まわりの夜気を刷いて白く抜き残す（水墨の常法） */
      '<path class="w" fill-opacity=".16" fill-rule="evenodd" ' +
        'd="M56-16C92-30 132-12 132 22c0 26-26 40-48 31C60 44 46 6 56-16Z' +
        'M95 3a18 18 0 100 36 18 18 0 100-36Z"/>' +
      '<ellipse class="w" cx="50" cy="76" rx="40" ry="32"/>' +
      '<path class="w" d="M6 104q46 10 92-4v7q-46 14-92 4z"/>',

      /* 衣 */
      '<path class="b" d="M50 48c16 0 27 13 30 32l4 26H16l4-26c3-19 14-32 30-32z"/>' +
      /* 袖（挙げた側） */
      '<path class="b" d="M64 54c8 0 14 5 14 11 0 4-3 7-8 7l-14-4z"/>' +
      /* 頭 */
      '<circle class="b" cx="48" cy="32" r="13"/>' +
      /* 幞頭（頭巾） */
      '<path class="b" d="M34 30c0-11 6-18 14-18s14 7 14 18z"/>' +
      '<path class="b" d="M47 12l2-8 4 8z"/>' +
      /* 衣の陰 */
      '<path class="m" fill-opacity=".28" d="M50 60c9 4 14 15 16 28l2 18H50z"/>',

      /* 腕 */
      '<path class="s" style="stroke-width:5" d="M70 66q7-6 12-12"/>' +
      /* 帯 */
      '<path class="s hl-s" style="stroke-width:3" d="M32 76q18 8 36 0"/>' +
      /* 髭 */
      '<path class="s" style="stroke-width:2.2" d="M42 42q3 8 0 13M54 42q-3 8 0 13"/>',

      /* 杯 */
      '<path class="a" d="M74 46h17l-3 9c-1 3-3 4-6 4s-5-1-6-4z"/>' +
      '<path class="a" d="M79 59h7v3h-7z"/>'
    ),

    /* ── 孔子 ── 拱手して立つ ── */
    f8: svg(
      '<ellipse class="w" cx="60" cy="70" rx="43" ry="38"/>' +
      '<path class="w" d="M12 104q48 10 96-4v7q-48 14-96 4z"/>',

      /* 深衣（裾に向かって広がる） */
      '<path class="b" d="M60 46c17 0 27 13 30 31l5 27H25l5-27c3-18 13-31 30-31z"/>' +
      /* 大袖。左右から出て、胸の前で袂を合わせる */
      '<path class="b" d="M40 52c-11 4-19 17-22 34-1 6 2 9 8 9 7 0 11-4 12-11l6-27z"/>' +
      '<path class="b" d="M80 52c11 4 19 17 22 34 1 6-2 9-8 9-7 0-11-4-12-11l-6-27z"/>' +
      /* 頭 */
      '<circle class="b" cx="60" cy="30" r="13.5"/>' +
      /* 儒巾。丸みのある頭巾に、小さな巾子（こじ）を載せる */
      '<path class="b" d="M45 22c0-12 7-19 15-19s15 7 15 19z"/>' +
      '<path class="b" d="M53 6c0-5 3-8 7-8s7 3 7 8z"/>' +
      /* 衣の陰 */
      '<path class="m" fill-opacity=".24" d="M60 58c9 5 15 18 17 33l1 13H60z"/>',

      /* 襟合わせ */
      '<path class="s hl-s" style="stroke-width:3.2" d="M51 47l9 13 9-13"/>' +
      /* 帯 */
      '<path class="s hl-s" style="stroke-width:2.6" stroke-opacity=".55" d="M40 90q20 7 40 0"/>' +
      /* 長い髭 */
      '<path class="s" style="stroke-width:2.4" d="M52 38q3 12-1 20M68 38q-3 12 1 20M60 42v20"/>',

      /* 拱手（袂に包んだ手を胸の前で組む） */
      '<ellipse class="hl" cx="60" cy="71" rx="9" ry="5.6" fill-opacity=".9"/>' +
      '<path class="s" style="stroke-width:1.3" stroke-opacity=".45" d="M60 65.8v10.4"/>' +
      /* 朱の落款 */
      '<rect class="a" x="95" y="96" width="14" height="14" rx="3"/>'
    )
  };
})();
