/* index.html の CSS / JS をすべてインライン化して dist/index.html を出力する。
   単一ファイルなのでオフラインでもそのまま開ける。 実行: node tools/build.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>\n' + js + '\n</script>';
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/index.html');
fs.writeFileSync(out, html);
console.log('✔ ' + path.relative(root, out) + '  (' + Math.round(Buffer.byteLength(html) / 1024) + ' KB)');

/* Artifact 用：<html>/<head>/<body> を持たない本文だけの版 */
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, '漢文道場'])[1];
const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const body = (html.match(/<body>([\s\S]*)<\/body>/) || [, ''])[1];
const artifact = '<title>' + title + '</title>\n' + style + '\n' + body.trim() + '\n';
const outA = path.join(root, 'dist/artifact.html');
fs.writeFileSync(outA, artifact);
console.log('✔ ' + path.relative(root, outA) + '  (' + Math.round(Buffer.byteLength(artifact) / 1024) + ' KB)');
