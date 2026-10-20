/* HTML の CSS / JS をすべてインライン化して単一ファイル版を出力する。
   単一ファイルなのでオフラインでもそのまま開ける。 実行: node tools/build.mjs
     index.html  → dist/index.html  ・ dist/artifact.html        （漢文道場）
     soukan.html → dist/soukan.html ・ dist/soukan-artifact.html （楚漢の章・独立版） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

function inline(src) {
  let html = fs.readFileSync(path.join(root, src), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
    const css = fs.readFileSync(path.join(root, href), 'utf8');
    return '<style>\n' + css + '\n</style>';
  });
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, s) => {
    const js = fs.readFileSync(path.join(root, s), 'utf8');
    return '<script>\n' + js + '\n</script>';
  });
  return html;
}
function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
  console.log('✔ ' + rel + '  (' + Math.round(Buffer.byteLength(text) / 1024) + ' KB)');
}
/** Artifact 用：<html>/<head>/<body> を持たない本文だけの版（body の class は包みに移す） */
function artifact(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
  const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
  const bodyM = html.match(/<body([^>]*)>([\s\S]*)<\/body>/) || [, '', ''];
  const cls = (bodyM[1].match(/class="([^"]+)"/) || [, ''])[1];
  const body = bodyM[2].trim();
  return '<title>' + title + '</title>\n' + styles + '\n' +
    (cls ? '<script>(function () { var c = ' + JSON.stringify(cls) + '; function a() { document.body.classList.add(c); } if (document.body) a(); else document.addEventListener(\'DOMContentLoaded\', a); })();</script>\n' : '') + body + '\n';
}

for (const [src, out, art] of [['index.html', 'dist/index.html', 'dist/artifact.html'], ['soukan.html', 'dist/soukan.html', 'dist/soukan-artifact.html']]) {
  const html = inline(src);
  write(out, html);
  write(art, artifact(html));
}
