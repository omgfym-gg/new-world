// 版本號：依所有程式與字典檔的內容算出一個短代碼，寫進 index.html（<meta name="ws-version"> 與每個檔案網址後面的 ?v=）。
// 內容有改，網址就跟著變，瀏覽器會重新下載，不會繼續用舊的暫存檔。每次改完程式、合併前執行：node tools/stamp-version.js
// 用法：node tools/stamp-version.js           → 更新 index.html
//       node tools/stamp-version.js --check   → 只檢查（版本過期就回傳失敗，測試會用）
//       node tools/stamp-version.js --strip <輸出路徑> → 產生沒有 ?v= 的 index.html（Claude 可玩版本用）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function files() {
  const list = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g)].map((m) => m[1]);
  const i18n = fs.readdirSync(path.join(ROOT, 'i18n')).filter((f) => f.endsWith('.js')).map((f) => 'i18n/' + f);
  return [...new Set(list.concat(i18n))].sort();
}
function version() {
  const h = crypto.createHash('sha256');
  for (const f of files()) { h.update(f); h.update(fs.readFileSync(path.join(ROOT, f))); }
  return h.digest('hex').slice(0, 10);
}
function stamped(v) {
  let out = html.replace(/(src|href)="([^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, (m, a, f) => `${a}="${f}?v=${v}"`);
  const meta = `<meta name="ws-version" content="${v}">`;
  out = /<meta name="ws-version"[^>]*>/.test(out) ? out.replace(/<meta name="ws-version"[^>]*>/, meta) : out.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  ' + meta);
  return out;
}
module.exports = { version, stamped };
if (require.main === module) {
  const v = version(), arg = process.argv[2];
  if (arg === '--check') {
    const ok = stamped(v) === html;
    console.log(ok ? `版本 ${v}：index.html 已是最新` : `index.html 的版本過期（應為 ${v}），請執行 node tools/stamp-version.js`);
    process.exit(ok ? 0 : 1);
  } else if (arg === '--strip') {
    fs.writeFileSync(process.argv[3], html.replace(/\?v=[0-9a-f]+"/g, '"'));
    console.log('已輸出 ' + process.argv[3]);
  } else {
    fs.writeFileSync(path.join(ROOT, 'index.html'), stamped(v));
    console.log('版本 ' + v);
  }
}
