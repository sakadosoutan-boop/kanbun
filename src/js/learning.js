/* 教材と練習を結ぶ情報。描画・出題・記録の共通ルール。 */
(function () {
  'use strict';
  var tips = {
    '訓読': ['ls01', '主語・目的語・動詞を見つけ、日本語の語順に直しましょう。'],
    '返り点': ['ls02', '内側の返りから処理し、読む順を一字ずつ追いましょう。'],
    '置き字': ['ls04', '字を見ただけで決めず、この文での働きを確かめましょう。'],
    '書き下し': ['ls03', '主語と目的語を先に決め、句法の語尾まで組み立てましょう。'],
    '再読文字': ['ls05', '一度目の副詞と、二度目の語尾を組にして確認しましょう。'],
    '否定': ['ls07', '不は打消、勿は禁止、未は「まだ〜ない」。否定の範囲も確かめましょう。'],
    '禁止': ['ls03', '禁止の「なかれ」と、打消の「ず」を区別しましょう。'],
    '二重否定': ['ls07', '否定を二回重ねたとき、最終的に肯定になるかを確かめましょう。'],
    '部分否定': ['ls07', '不必と必不は逆の語順です。「必ずしも〜ない」か「必ず〜ない」かを確認しましょう。'],
    '疑問': ['ls06', '何如は状態・結果。如何は方法など。文脈と文末を合わせて見ましょう。'],
    '反語': ['ls06', '「どうして〜だろうか」の後に「いや〜ない」が続くかを考えましょう。'],
    '疑問反語': ['ls06', '尋ねているのか、強く否定しているのかを文末と文脈で区別しましょう。'],
    '使役': ['ls08', '誰が誰に動作をさせるのか、「〜しむ」の向きを確認しましょう。'],
    '受身': ['ls08', '誰が動作を受けるのか、「〜らる」の主語を確認しましょう。'],
    '比較': ['ls08', '「より」と「よりも」を区別し、比較する二つを見つけましょう。'],
    '選択': ['ls08', '「〜よりは、むしろ…」のどちらを選ぶ文か確認しましょう。'],
    '識別': ['ls04', '同じ字にも複数の用法があります。位置だけでなく前後の語も見ましょう。'],
    '漢詩': ['ls09', '句数・字数、句末の字、対になる言葉を順に確かめましょう。']
  };
  function guide(cat) { return tips[cat] || ['ls08', '句形の読み・意味と、文中での働きを結びつけましょう。']; }
  function feedback(q, idx) {
    if (idx < 0) return '時間切れです。練習では時間制限を外して、根拠を確かめながら解くこともできます。';
    if (q.reasons && q.reasons[idx]) return q.reasons[idx];
    var chosen = q.choices[idx];
    var alt = window.KUHO.find(function (k) { return k.read === chosen || k.mean === chosen; });
    return (alt && alt.cat !== q.cat ? '選んだ答えは「' + alt.cat + '」の用法です。' : '') + guide(q.cat)[1];
  }

  // 一字ごとに漢字・送り仮名・返り点を保持。旧 ^ 記法も最寄りの漢字に結び付ける。
  var MARK = /^(一レ|上レ|甲レ|レ|一|二|三|四|上|中|下|甲|乙|丙)/;
  function tokens(text) {
    var out = [], anchor = null;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '^') {
        var m = MARK.exec(text.slice(i + 1));
        if (m && anchor) { anchor.mark = m[1]; i += m[1].length; continue; }
      }
      if (/[\u3400-\u9fff]/.test(c)) { anchor = { c: c, okuri: '', mark: '' }; out.push(anchor); }
      else if (/[ぁ-ヿー]/.test(c) && anchor) anchor.okuri += c;
      else { out.push({ c: c, okuri: '', mark: '' }); anchor = null; }
    }
    return out;
  }
  window.Learning = { guide: guide, feedback: feedback, tokens: tokens };
  window.KUNDOKU_EXAMPLES = {
    ls01: [{ c: '学', okuri: 'ビテ' }, { c: '而' }, { c: '時', okuri: 'ニ' }, { c: '習', okuri: 'フ', mark: 'レ' }, { c: '之', okuri: 'ヲ' }]
  };
})();
