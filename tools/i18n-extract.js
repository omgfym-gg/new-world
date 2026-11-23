// 多國語言：從程式碼找出所有會顯示的中文文字，列出字典還沒翻譯的句子。
// 用法：node tools/i18n-extract.js [語言]        → 印出缺少的句子數（預設 en）
//       node tools/i18n-extract.js en --json     → 輸出缺少的句子（JSON 陣列）
// 句子的切法與執行時相同（i18n/i18n.js）：依 HTML 標籤分段、句號分句，${…} 換成 {0}{1}…
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 會出現在畫面上的檔案（測試、回測工具、史實對照資料不翻）
const FILES = [
  'index.html', 'app.js',
  'data/scenario-1911.js', 'data/scenario-1911-world.js', 'data/definitions.js', 'data/ancient.js',
  'engine/params.js', 'engine/state-engine.js', 'engine/population-engine.js', 'engine/environment-engine.js', 'engine/economy-engine.js',
  'engine/politics-engine.js', 'engine/technology-engine.js', 'engine/diplomacy-engine.js', 'engine/military-engine.js',
  'engine/ancient-engine.js', 'engine/era-bridge.js', 'engine/future-engine.js', 'engine/world-engine.js',
  'systems/policy-system.js', 'systems/agent-system.js', 'systems/event-system.js', 'systems/rule-system.js',
  'systems/history-system.js', 'systems/explain-system.js', 'systems/save-system.js', 'systems/whatif-system.js',
  'systems/divine-system.js', 'systems/headline-system.js',
  'ui/globe.js', 'ui/warcam.js', 'ui/scenecam.js', 'ui/lifecam.js', 'ui/music.js', 'ui/era-theme.js', 'ui/territory.js', 'ui/notice.js'
];
const HAN = /[㐀-鿿]/;

// 簡易 JS 斷詞：找出字串與樣板字串（樣板裡的 ${…} 會遞迴處理）
function literals(src, out) {
  let i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) { if (src[j] === '\\') { s += unesc(src[j + 1]); j += 2; } else s += src[j++]; }
      out.push({ parts: [s] }); i = j + 1; prev = 'x'; continue;
    }
    if (c === '`') { i = template(src, i + 1, out); prev = 'x'; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]$|^$/.test(prev)) { // 正規表示式
      let j = i + 1, cls = false;
      while (j < n && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      i = j + 1; prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
function unesc(ch) { return { n: '\n', t: '\t', '\'': '\'', '"': '"', '\\': '\\', '`': '`' }[ch] != null ? { n: '\n', t: '\t', '\'': '\'', '"': '"', '\\': '\\', '`': '`' }[ch] : ch; }
// 樣板字串：回傳結束位置；parts = 文字與 {expr} 交錯
function template(src, i, out) {
  const parts = [];
  let s = '';
  const n = src.length;
  while (i < n && src[i] !== '`') {
    if (src[i] === '\\') { s += unesc(src[i + 1]); i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      parts.push(s); s = '';
      let depth = 1, j = i + 2;
      const start = j;
      while (j < n && depth > 0) {
        const c = src[j];
        if (c === '\'' || c === '"') { j++; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } j++; continue; }
        if (c === '`') { j = skipTemplate(src, j + 1); continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        j++;
      }
      const expr = src.slice(start, j - 1);
      literals(expr, out);
      parts.push({ expr });
      i = j; continue;
    }
    s += src[i++];
  }
  parts.push(s);
  out.push({ parts });
  return i + 1;
}
function skipTemplate(src, i) {
  const n = src.length;
  while (i < n && src[i] !== '`') {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        const c = src[i];
        if (c === '\'' || c === '"') { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; } i++; continue; }
        if (c === '`') { i = skipTemplate(src, i + 1); continue; }
        if (c === '{') depth++; else if (c === '}') depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return i + 1;
}

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&times;': '×', '&middot;': '·' };
// 一個字面字串 → 畫面上的句子（與執行時切法相同）
function sentences(lit) {
  // 把 ${…} 換成佔位記號後依 HTML 標籤切開
  let text = '';
  for (const p of lit.parts) text += typeof p === 'string' ? p : '\u0001';
  // 只把像 HTML 標籤的部分當標籤（「穩定度 27 < 35」這種比較符號不算）
  const chunks = text.split(/<\/?[a-zA-Z!][^>]*>|<\/?[a-zA-Z][^>]*$|^[^<>]*?["'=a-zA-Z0-9\u0001]>/);
  const res = [];
  for (let ch of chunks) {
    ch = ch.replace(/&[a-z#0-9]+;/g, (e) => ENT[e] || e);
    if (!HAN.test(ch)) continue;
    // 屬性（title="…"）在標籤裡，另外取出
    res.push(ch);
  }
  // 標籤屬性裡的中文
  const attr = /(?:title|placeholder|aria-label|alt)="([^"]*)"/g;
  let m;
  while ((m = attr.exec(text))) if (HAN.test(m[1])) res.push(m[1]);
  const keys = [];
  for (const r of res) {
    let k = 0;
    const s = r.replace(/\u0001/g, () => '{' + (k++) + '}').trim();
    if (!s) continue;
    // 整段與逐句都列出；整段太長時只列逐句
    const sents = s.split(/(?<=[。！？!?\n])/).map((x) => x.trim()).filter((x) => HAN.test(x));
    for (const x of sents) keys.push(renum(x));
  }
  return keys;
}
function renum(s) { const map = {}; let k = 0; return s.replace(/\{(\d+)\}/g, (m, i) => '{' + (map[i] != null ? map[i] : (map[i] = k++)) + '}'); }

function extract() {
  const seen = new Map();
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const lits = f.endsWith('.html') ? [{ parts: [src.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '')] }] : literals(src, []);
    for (const l of lits) for (const k of sentences(l)) if (!seen.has(k)) seen.set(k, f);
  }
  return seen;
}
module.exports = { extract, sentences, literals };

if (require.main === module) {
  const lang = process.argv[2] || 'en';
  global.window = undefined;
  const I = loadI18n(lang);
  const all = extract();
  const missing = [];
  for (const [k, f] of all) {
    const out = I.tx(k.replace(/\{\d+\}/g, '甲'));
    // 英文：還有中文就算缺；日文本來就有漢字，所以看有沒有查到（輸出和原文一樣）
    if (lang === 'en' ? I.hasHan(out.replace(/甲/g, '')) : out === k.replace(/\{\d+\}/g, '甲')) missing.push({ k, f });
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(missing.map((m) => m.k), null, 0));
  else {
    console.log(`句子 ${all.size}，${lang} 缺少 ${missing.length}`);
    const by = {};
    for (const m of missing) by[m.f] = (by[m.f] || 0) + 1;
    console.log(by);
  }
}
function loadI18n(lang) {
  const vm = require('vm');
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'i18n/i18n.js'), 'utf8'));
  const L = globalThis.WS.I18n.LANGS;
  for (const l of [L[lang].fb, lang]) {
    if (!l) continue;
    const f = path.join(ROOT, 'i18n', (L[l].file || l) + '.js');
    if (fs.existsSync(f)) vm.runInThisContext(fs.readFileSync(f, 'utf8'));
  }
  globalThis.WS.I18n.setLang(lang);
  return globalThis.WS.I18n;
}
module.exports.loadI18n = loadI18n;
