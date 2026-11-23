'use strict';
// Biên dịch app.jsx và đóng gói toàn bộ CSS/JS vào index.html độc lập.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function main() {
  const dir = __dirname;
  const output = await esbuild.build({
    entryPoints: [path.join(dir, 'app.jsx')],
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
  });
  const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
  const physics = fs.readFileSync(path.join(dir, 'physics.js'), 'utf8');
  const app = output.outputFiles[0].text;
  // Không để một chuỗi trong JavaScript vô tình đóng thẻ script của HTML.
  const inline = text => text.replace(/<\/script/gi, '<\\/script');
  const html = '<!doctype html>\n<html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="theme-color" content="#fff8ee"><title>Nhật ký cha &amp; con</title>' +
    '<style>' + css + '</style></head><body><div id="root"></div>' +
    '<script>' + inline(physics) + '</script><script>' + inline(app) + '</script>' +
    '</body></html>';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), html);
  console.log('Đã tạo index.html (trang độc lập, không cần CDN).');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
