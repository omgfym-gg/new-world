// 多國語言（i18n）：只改畫面上顯示的文字，不讀寫任何模擬數值、不寫進 commandLog。
//
// 做法：遊戲的原文（繁體中文）照舊由引擎與介面產生，存檔裡也一律是原文；
// 顯示到畫面前才翻成玩家的語言，所以切換語言不會影響世界，也能隨時切回。
//   1. 完全相同的句子 → 直接查字典（i18n/<語言>.js）。
//   2. 含有名稱、數字的句子 → 用字典裡的樣板（例如「{0}向{1}宣戰」）比對，名稱再各自翻譯。
//   3. 數字＋單位（百萬、億、兆…）會依語言換算（英文 1.2 億 → 120M）。
//   4. 整段找不到時，依句號、分號、逗號拆開逐句翻；仍找不到的保留原文。
// 簡體中文不需要字典：逐字轉換（i18n/zh-cn.js 的字表）＋少數用語替換。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const I = (WS.I18n = {});

  // 目前提供的語言（之後要加語言：在這裡加一行，並放一個 i18n/<代號>.js 字典）
  I.LANGS = {
    'zh-TW': { name: '繁體中文', html: 'zh-Hant' },
    'zh-CN': { name: '简体中文', html: 'zh-Hans', file: 'zh-cn' },
    en: { name: 'English', html: 'en', file: 'en', people: ' people' },
    ja: { name: '日本語', html: 'ja', file: 'ja', people: '人' },
    ko: { name: '한국어', html: 'ko', file: 'ko', people: '명', fb: 'en' },
    es: { name: 'Español', html: 'es', file: 'es', people: ' personas', fb: 'en' },
    fr: { name: 'Français', html: 'fr', file: 'fr', people: ' personnes', fb: 'en', q: ['« ', ' »'] },
    de: { name: 'Deutsch', html: 'de', file: 'de', people: ' Menschen', fb: 'en', q: ['„', '“'] },
    pt: { name: 'Português', html: 'pt', file: 'pt', people: ' pessoas', fb: 'en' },
    it: { name: 'Italiano', html: 'it', file: 'it', people: ' persone', fb: 'en', q: ['«', '»'] },
    ru: { name: 'Русский', html: 'ru', file: 'ru', people: ' чел.', fb: 'en', q: ['«', '»'] },
    tr: { name: 'Türkçe', html: 'tr', file: 'tr', people: ' kişi', fb: 'en' },
    ar: { name: 'العربية', html: 'ar', file: 'ar', people: ' نسمة', fb: 'en', dir: 'rtl', q: ['«', '»'] },
    hi: { name: 'हिन्दी', html: 'hi', file: 'hi', people: ' लोग', fb: 'en' },
    id: { name: 'Bahasa Indonesia', html: 'id', file: 'id', people: ' jiwa', fb: 'en' },
    vi: { name: 'Tiếng Việt', html: 'vi', file: 'vi', people: ' người', fb: 'en' },
    th: { name: 'ไทย', html: 'th', file: 'th', people: ' คน', fb: 'en' }
  };
  // fb：字典缺句子時先用英文（比留下中文好懂）；q：引號；dir：rtl＝由右到左排版
  I.SOURCE = 'zh-TW';
  I.DATA = I.DATA || {}; // 各語言字典：{ dict: {原文: 譯文}, ... }，由 i18n/<語言>.js 填入
  const KEY = 'ws.lang';
  I.lang = I.SOURCE;
  if (root.__i18nDebug) I.misses = new Set(); // 檢查工具用

  // ---------- 自動偵測：裝置語言（必要時參考時區分簡繁），不用網路位置 ----------
  const TW_ZONES = /^Asia\/(Taipei|Hong_Kong|Macau|Macao)$/;
  I.detect = function (langs, tz) {
    langs = langs || (root.navigator && (root.navigator.languages || [root.navigator.language])) || [];
    if (tz === undefined) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; } }
    for (const raw of langs) {
      const l = String(raw || '').toLowerCase();
      if (!l) continue;
      if (l.startsWith('zh')) {
        if (/hant|-tw|-hk|-mo/.test(l)) return 'zh-TW';
        if (/hans|-cn|-sg|-my/.test(l)) return 'zh-CN';
        return TW_ZONES.test(tz) ? 'zh-TW' : 'zh-CN';
      }
      const base = l.split(/[-_]/)[0];
      if (base === 'in') return 'id'; // 舊的印尼文代號
      if (I.LANGS[base]) return base;
    }
    return 'en'; // 沒有支援的語言時用英文
  };
  I.pref = function () { try { const v = root.localStorage && root.localStorage.getItem(KEY); return I.LANGS[v] ? v : 'auto'; } catch (e) { return 'auto'; } };
  I.setPref = function (v) { try { if (root.localStorage) { if (I.LANGS[v]) root.localStorage.setItem(KEY, v); else root.localStorage.removeItem(KEY); } } catch (e) { /* 只在這次有效 */ } };
  I.wanted = function () { const p = I.pref(); return p === 'auto' ? I.detect() : p; };

  // ---------- 數字與單位 ----------
  // 原文的數量單位（以「個」為單位的倍數）；長的寫前面
  const UNITS = [['十億', 1e9], ['百萬', 1e6], ['千萬', 1e7], ['兆', 1e12], ['億', 1e8], ['萬', 1e4], ['千', 1e3]];
  const UNIT_RE = UNITS.map((u) => u[0]).join('|');
  // 數字後面接單位時一起換算；「百萬人」的「人」也併進來（英文會寫成 people）
  const NUM_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)(\\s*(?:${UNIT_RE})(?![國年元])人?)?`, 'g');
  const MARK = '\u0002', END = '\u0003';
  const tokRe = /\u0002(\d+)\u0003/g;
  const trimNum = (x, d) => { let s = x.toFixed(d); if (s.includes('.')) s = s.replace(/\.?0+$/, ''); return s; };
  function fmtNum(raw, unit, lang) {
    if (!unit || lang === 'zh-TW') return raw;
    const ppl = /人$/.test(unit), u = unit.replace(/人$/, '').trim();
    if (lang === 'zh-CN') return raw + unit.replace('萬', '万').replace('億', '亿');
    const res = fmtUnit(raw, u, lang);
    return ppl ? res + (I.LANGS[lang].people || '') : res;
  }
  function fmtUnit(raw, u, lang) {
    const neg = /^[\-−]/.test(raw), plus = raw[0] === '+';
    const n = parseFloat(raw.replace(/[,+\-−]/g, '')) * UNITS.find((x) => x[0] === u)[1];
    const sign = neg ? '−' : plus ? '+' : '';
    const dec = (v) => (v >= 100 ? 0 : v >= 10 ? 1 : 2);
    if (lang === 'ja') {
      const J = [[1e12, '兆'], [1e8, '億'], [1e4, '万']];
      for (const [b, s] of J) if (n >= b) { const v = n / b; return sign + trimNum(v, dec(v)) + s; }
      return sign + Math.round(n).toLocaleString('en-US');
    }
    if (lang !== 'en' && root.Intl && Intl.NumberFormat) {
      // 其他語言用各自習慣的縮寫（例如德文 1,2 Mio.、韓文 1.2억）
      try {
        const big = n >= 1e3 ? n / 10 ** (3 * Math.floor(Math.log10(n) / 3)) : n;
        return sign + new Intl.NumberFormat(I.LANGS[lang].html, { notation: n >= 1e4 ? 'compact' : 'standard', maximumFractionDigits: n >= 1e4 ? dec(big) : (n >= 10 ? 0 : 2) }).format(n);
      } catch (e) { /* 舊瀏覽器：用英文縮寫 */ }
    }
    const E = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [b, s] of E) if (n >= b) { const v = n / b; return sign + trimNum(v, dec(v)) + s; }
    return sign + trimNum(n, n >= 10 ? 0 : 2);
  }
  // 把數字（含單位）換成 \u0002i\u0003 記號，回傳形狀與數字清單
  function shape(s) {
    const nums = [];
    const sh = s.replace(NUM_RE, (m, n, u) => { nums.push([n, u || '']); return MARK + (nums.length - 1) + END; });
    return [sh, nums];
  }
  I._shape = shape;

  // ---------- 字典與樣板 ----------
  let cache = new Map();
  let compiled = null; // { exact: Map, pats: [] }
  const HAN = /[㐀-鿿豈-﫿]/;
  I.hasHan = (s) => HAN.test(s);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 字典的鍵也做同樣處理：數字＋單位 → 記號，{n}＋單位 → {n}
  I.normKey = function (k) {
    let i = 0;
    return k.replace(new RegExp(`\\{(\\d+)\\}\\s*(?:${UNIT_RE})(?![國年元])人?`, 'g'), '{$1}')
      .replace(/\{(\d+)\}/g, (m, n) => '\u0004' + String.fromCharCode(65 + +n) + '\u0005') // 先保護佔位符裡的數字
      .replace(NUM_RE, () => '{#' + (i++) + '}')
      .replace(/\u0004(.)\u0005/g, (m, c) => '{' + (c.charCodeAt(0) - 65) + '}');
  };

  function compile(lang) {
    const fb = I.LANGS[lang] && I.LANGS[lang].fb;
    const D = Object.assign({}, fb && I.DATA[fb] ? I.DATA[fb].dict : {}, (I.DATA[lang] && I.DATA[lang].dict) || {});
    const exact = new Map(), pats = [];
    for (const k0 in D) {
      const v = D[k0];
      if (v == null) continue;
      const k = I.normKey(k0);
      if (!/\{#?\d+\}/.test(k)) { exact.set(k, v); continue; }
      // 樣板：{n} → 擷取；字面數字 {#n} → 數字記號
      const order = [], numOnly = [], single = [];
      let lit = '', longest = '';
      const src = k.split(/(\{#?\d+\})/);
      let re = '^';
      for (const part of src) {
        const m = part.match(/^\{(#?)(\d+)\}$/);
        if (m) {
          if (m[1]) { re += '\u0002(\\d+)\u0003'; order.push('#' + m[2]); numOnly.push(false); single.push(false); }
          else {
            re += '([\\s\\S]*?)'; order.push(m[2]);
            // 「第 {1} 城」的位置只放數字
            const at = src.indexOf(part), prev = src[at - 1] || '', next = src[at + 1] || '';
            numOnly.push(/第 $/.test(prev) && /^ [\u3400-\u9fff]/.test(next));
            // 緊貼中文的位置（「{1}戰爭」「{0}屬地」）只放一個名稱，不放「甲、乙」這種清單
            single.push(/^[\u3400-\u9fff]/.test(next));
          }
          if (lit.length > longest.length) longest = lit; lit = '';
        } else { re += esc(part); lit += part; }
      }
      if (lit.length > longest.length) longest = lit;
      if (!longest.trim()) continue; // 純佔位符的樣板沒有意義
      const lits = src.filter((p) => !/^\{#?\d+\}$/.test(p)).join(''), litLen = lits.length, hanLen = (lits.match(/[\u3400-\u9fff]/g) || []).length;
      pats.push({ re: new RegExp(re + '$'), reG: new RegExp(re.replace(/\(\[\\s\\S\]\*\?\)/g, '([\\s\\S]*)') + '$'), order, numOnly, single, v, longest, litLen, weak: hanLen <= 1 || (order.length === 1 && hanLen <= 2 && /[\u3400-\u9fff]\{\d+\}|\{\d+\}[\u3400-\u9fff]/.test(k)) || litLen <= 2 });
    }
    pats.sort((a, b) => b.litLen - a.litLen);
    return { exact, pats };
  }

  const PUNCT = {
    en: { '。': '. ', '！': '! ', '？': '? ', '；': '; ', '，': ', ', '：': ': ', '、': ', ', '（': ' (', '）': ') ', '「': '“', '」': '”', '『': '‘', '』': '’', '・': ' · ', '～': '~', '／': ' / ', '　': ' ' },
    ja: { '，': '、', '；': '。' }
  };
  // 用拼音文字（與韓文、泰文…）的語言：標點都照英文，只換引號與少數符號
  const western = (l) => l !== 'ja' && l !== 'zh-CN' && l !== I.SOURCE;
  function punctTable(l) {
    if (PUNCT[l]) return PUNCT[l];
    if (!western(l)) return null;
    const T = Object.assign({}, PUNCT.en), q = I.LANGS[l].q;
    if (q) { T['「'] = q[0]; T['」'] = q[1]; }
    if (l === 'ar') { T['，'] = '، '; T['、'] = '، '; T['；'] = '؛ '; T['？'] = '؟ '; }
    if (l === 'hi') T['。'] = '। ';
    return (PUNCT[l] = T);
  }
  const SPLITS = [/([。！？!?\n]+)/, /([；;]+)/, /([，,]+)/, /([：:]+)/, /([、・／]+)/, /([（）「」『』()]+)/];

  // 翻譯一個「形狀」字串（數字已換成記號）
  function trShape(s, depth) {
    if (!s) return s;
    if (!HAN.test(s)) return /[・：；，、（）]/.test(s) ? punct(s) : s;
    const hit = cache.get(s);
    if (hit !== undefined) return hit;
    const out = trShapeRaw(s, depth || 0);
    cache.set(s, out);
    return out;
  }
  // weak：只剩很短字面的樣板（例如「{0} 年{1}」）容易誤配，先試拆句，拆不開才用
  function lookup(s, depth, weak) {
    const C = compiled;
    if (C.exact.has(s)) return C.exact.get(s);
    if (depth > 6) return null;
    for (const p of C.pats) {
      if (!weak && p.weak) continue;
      if (p.longest && !s.includes(p.longest)) continue;
      let m = p.re.exec(s);
      if (m && !m.slice(1).every(balanced)) m = p.reG.exec(s); // 短的擷取括號不成對時，改試長的
      if (!m || !m.slice(1).every(balanced) || p.numOnly.some((x, i) => x && HAN.test(m[i + 1])) || p.single.some((x, i) => x && topList(m[i + 1]))) continue;
      const vals = {}, raw = {};
      p.order.forEach((o, i) => { raw[o] = m[i + 1]; vals[o] = o[0] === '#' ? MARK + m[i + 1] + END : trShape(m[i + 1], depth + 1); });
      return p.v.replace(/\{(#?\d+)(:abbr)?\}/g, (x, o, ab) => (ab ? abbr(raw[o]) : vals[o] != null ? vals[o] : x));
    }
    return null;
  }
  // 括號外有頓號＝清單
  function topList(x) {
    let d = 0;
    for (const ch of x) { if (ch === '（' || ch === '「') d++; else if (ch === '）' || ch === '」') d--; else if (ch === '、' && d === 0) return true; }
    return false;
  }
  // 擷取到的名稱括號要成對，避免「{0}（第 {1} 個）」把整句吞掉
  function balanced(x) {
    if (/[；。\n]/.test(x)) return false; // 名稱不會跨句
    let a = 0, b = 0;
    for (const ch of x) {
      if (ch === '（' || ch === '(') a++; else if (ch === '）' || ch === ')') { if (--a < 0) return false; }
      else if (ch === '「') b++; else if (ch === '」') { if (--b < 0) return false; }
    }
    return a === 0 && b === 0;
  }
  // 句尾句號可有可無（「…。」被拆開後常少了句號）
  function lookupLoose(s, depth, weak) {
    let r = lookup(s, depth, weak);
    if (r != null || depth > 6) return r;
    if (!/[。.]$/.test(s)) { r = lookup(s + '。', depth, weak); if (r != null) return r.replace(/[.。]\s*$/, ''); }
    return null;
  }
  // 由國名第一個字組成的簡稱（例如國際組織「法英俄合作組織」）：逐字找出對應的國名再翻譯
  function abbrChars(raw) {
    const D = root.WS && root.WS.Data && root.WS.Data.scenarios;
    if (!D) return null;
    const names = [];
    for (const sc of Object.values(D)) for (const c of sc.countries || []) names.push(c.name);
    const parts = [];
    for (const ch of raw) { const n = names.find((x) => x[0] === ch); if (!n) return null; parts.push(I.tx(n)); }
    return parts.join('–');
  }
  function abbr(raw) {
    const names = [];
    const D = root.WS && root.WS.Data && root.WS.Data.scenarios;
    if (D) for (const sc of Object.values(D)) for (const c of sc.countries || []) names.push(c.name);
    const whole = I.tx(raw);
    if (!HAN.test(whole)) return whole;
    const parts = [];
    for (const ch of raw) {
      const n = names.find((x) => x[0] === ch);
      parts.push(n ? I.tx(n) : ch);
    }
    return parts.join('–');
  }
  function trShapeRaw(s, depth) {
    const st = s.trim();
    if (compiled.exact.has(st)) return s.replace(st, compiled.exact.get(st));
    const lead = s.match(/^[\s\p{So}\uFE0F\u200D○●◈◆◇■□★☆•·▶◀✔✘]*/u)[0], tail = s.slice(lead.length).match(/\s*$/)[0];
    const core = s.slice(lead.length, s.length - tail.length);
    let r = lookupLoose(core, depth);
    if (r != null) return lead + r + tail;
    // 「名稱（說明）」：兩邊都翻得完整就直接組合（例如「中國（大清（君主專制））」）
    const pm = lastGroup(core);
    if (pm && balanced(pm[1]) && balanced(pm[2])) {
      const x = pm[1] ? trShape(pm[1], depth + 1) : '', y = trShape(pm[2], depth + 1);
      if (!HAN.test(x + y)) return lead + tidy(x + punct('（') + y + punct('）')).replace(/\s+$/, '') + tail;
    }
    // 拆句：依序用句號、分號、逗號、冒號…拆開
    for (const re of SPLITS) {
      const parts = re === SPLITS[0] || re === SPLITS[SPLITS.length - 1] ? core.split(re) : splitTop(core, re); // 句號照原文切（與字典的切法相同）
      if (parts.length < 2) continue;
      let out = '';
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p) continue;
        if (i % 2 === 1) { out += punct(p); continue; }
        // 標點連在左邊一起查（例如「說明：」）
        const next = parts[i + 1];
        if (next) {
          const withP = lookupLoose(p + next, depth + 1);
          if (withP != null) { out += withP; i++; continue; }
        }
        out += trShape(p, depth + 1);
      }
      return lead + tidy(out) + tail;
    }
    // 兩個以上空白隔開的段落各自翻（例如「即時  全球暖化突破 3°C」）
    if (/\S\s{2,}\S/.test(core)) {
      const segs = core.split(/(\s{2,})/), outS = segs.map((x, i) => (i % 2 ? x : trShape(x, depth + 1))).join('');
      if (!HAN.test(outS)) return lead + outS + tail;
    }
    // 很短的「數字＋單字」（例如「2119 年」）：先用短樣板（「{0} 年」→ 2119），不要逐字翻成「2119 year」
    if (/^[^\u3400-\u9fff]*\d[^\u3400-\u9fff]*[\u3400-\u9fff]$/.test(core)) { const rw = lookupLoose(core, depth, true); if (rw != null) return lead + rw + tail; }
    // 數字、符號隔開的詞逐一查（例如「穩定度 27 < 35」）；全部查得到才用，否則再試短樣板
    const words = core.split(/([^\u3400-\u9fff\uf900-\ufaff「」『』（）]+)/);
    const byWord = words.length > 1 ? tidy(words.map((x, i) => (i % 2 ? x : x && (lookupLoose(x, depth + 1, true) ?? punct(x)))).join('')) : null;
    if (byWord != null && !HAN.test(byWord)) return lead + byWord + tail;
    r = lookupLoose(core, depth, true);
    if (r != null) return lead + r + tail;
    // 國名第一個字組成的簡稱（例如同盟「法英俄」）
    if (/^[\u3400-\u9fff]{2,4}$/.test(core)) { const ab = abbrChars(core); if (ab) return lead + ab + tail; }
    return lead + (byWord != null ? byWord : punct(core)) + tail;
  }
  // 只在括號外面拆（「醫學與防疫（檢疫、人痘）」裡的頓號不拆）
  function splitTop(s, re) {
    const raw = s.split(re), out = [];
    let d = 0;
    for (let i = 0; i < raw.length; i++) {
      const x = raw[i];
      if (i % 2 === 1 && d > 0) { out[out.length - 1] += x; continue; }
      if (i % 2 === 0 && d > 0) out[out.length - 1] += x; else out.push(x);
      for (const ch of x) { if (ch === '（' || ch === '(' || ch === '「') d++; else if ((ch === '）' || ch === ')' || ch === '」') && d > 0) d--; }
    }
    return out;
  }
  // 結尾的「（…）」：回傳 [整段, 前面, 括號內]（括號可以巢狀）
  function lastGroup(s) {
    if (!s.endsWith('）')) return null;
    let d = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === '）') d++;
      else if (s[i] === '（' && --d === 0) return [s, s.slice(0, i), s.slice(i + 1, -1)];
    }
    return null;
  }
  function punct(p) {
    const T = punctTable(I.lang);
    if (!T) return p;
    let o = '';
    for (const ch of p) o += T[ch] != null ? T[ch] : ch;
    return o;
  }
  function tidy(s) {
    if (!western(I.lang)) return s;
    return s.replace(/－/g, '–').replace(/([.!?;:])(?=[A-Z“"«„\u0400-\u04FF])/g, '$1 ').replace(/ {2,}/g, ' ').replace(/ ([,.;:!?)”’])/g, '$1').replace(/([(“‘]) /g, '$1').replace(/\s+$/, (m) => (m.includes('\n') ? m : ''));
  }

  // 把任意原文字串翻成目前語言
  I.tx = function (s) {
    if (s == null || I.lang === I.SOURCE) return s;
    s = String(s);
    if (!HAN.test(s)) return s;
    if (I.lang === 'zh-CN') return I.toSimp(s);
    if (!compiled) compiled = compile(I.lang);
    const [sh, nums] = shape(s);
    const out = trShape(sh, 0);
    let r = out.replace(tokRe, (m, i) => { const n = nums[+i]; return n ? fmtNum(n[0], n[1], I.lang) : m; });
    if (I.misses && I.lang === 'en' && HAN.test(r)) I.misses.add(s); // 檢查工具用：記下沒翻完的句子
    return r;
  };
  // 有參數的介面文字：t('{0}向{1}宣戰', [a, b])（參數也會翻譯）
  I.t = function (s, args) {
    let z = s;
    if (args) z = s.replace(/\{(\d+)\}/g, (m, i) => (args[i] != null ? args[i] : m));
    return I.tx(z);
  };

  // 簡體：逐字轉換＋用語替換（字表在 i18n/zh-cn.js）
  I.toSimp = function (s) {
    const D = I.DATA['zh-CN'];
    if (!D) return s;
    if (!D._re) {
      D._map = new Map();
      for (let i = 0; i < D.chars.length; i += 2) D._map.set(D.chars[i], D.chars[i + 1]);
      const ph = Object.keys(D.phrases || {}).sort((a, b) => b.length - a.length);
      D._re = ph.length ? new RegExp(ph.map(esc).join('|'), 'g') : null;
    }
    if (D._re) s = s.replace(D._re, (m) => D.phrases[m]);
    let o = '';
    for (const ch of s) { const r = D._map.get(ch); o += r || ch; }
    return o;
  };

  I.setLang = function (lang) {
    if (!I.LANGS[lang]) lang = I.SOURCE;
    I.lang = lang;
    cache = new Map();
    compiled = null;
    if (root.document && root.document.documentElement) {
      root.document.documentElement.lang = I.LANGS[lang].html;
      root.document.documentElement.dir = I.LANGS[lang].dir || 'ltr';
    }
  };
  I.ready = (lang) => lang === I.SOURCE || (!!I.DATA[lang] && (!I.LANGS[lang].fb || !!I.DATA[I.LANGS[lang].fb]));

  // ---------- 瀏覽器：自動把畫面上的文字翻成目前語言 ----------
  if (!root.document) return;
  const doc = root.document;
  const ORIG = new WeakMap(); // 文字節點 → 原文
  const DONE = new WeakMap(); // 文字節點 → 上次翻好的文字
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };

  function doText(n) {
    const v = n.nodeValue;
    if (DONE.get(n) === v) return;
    const src = v;
    if (!HAN.test(src)) return;
    ORIG.set(n, src);
    const out = I.tx(src);
    DONE.set(n, out);
    if (out !== v) n.nodeValue = out;
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a), keep = 'data-i18n-' + a;
      const done = el.getAttribute(keep + '-out');
      if (done === v) continue;
      if (!HAN.test(v)) continue;
      el.setAttribute(keep, v);
      const out = I.tx(v);
      el.setAttribute(keep + '-out', out);
      if (out !== v) el.setAttribute(a, out);
    }
  }
  // translate="no" 的區塊（例如語言選單用各語言自己的名稱）不翻譯
  const noTr = (el) => !!(el.closest && el.closest('[translate="no"]'));
  const FILTER = { acceptNode: (n) => (n.nodeType === 1 && n.getAttribute('translate') === 'no' ? 2 : 1) };
  function walk(node) {
    if (I.lang === I.SOURCE) return;
    if (node.nodeType === 3) { if (!(node.parentNode && SKIP[node.parentNode.nodeName]) && !(node.parentElement && noTr(node.parentElement))) doText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) { if (node.nodeName === 'TEXTAREA') doAttrs(node); if (SKIP[node.nodeName] || node.isContentEditable || noTr(node)) return; doAttrs(node); }
    else if (node.nodeType === 3 && node.parentElement && noTr(node.parentElement)) return;
    const tw = doc.createTreeWalker(node, 5, FILTER);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { const p = n.parentNode; if (p && !SKIP[p.nodeName]) doText(n); }
      else if (!SKIP[n.nodeName] || n.nodeName === 'TEXTAREA') doAttrs(n);
    }
  }
  I.walk = walk;
  // 換語言：先把畫面還原成原文，再翻成新語言
  I.restore = function () {
    const tw = doc.createTreeWalker(doc.body || doc, 5, null);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { const o = ORIG.get(n); if (o != null && DONE.get(n) === n.nodeValue) n.nodeValue = o; DONE.delete(n); }
      else for (const a of ATTRS) { const o = n.getAttribute('data-i18n-' + a); if (o != null) { n.setAttribute(a, o); n.removeAttribute('data-i18n-' + a); n.removeAttribute('data-i18n-' + a + '-out'); } }
    }
    if (doc.title && ORIG.has(doc)) doc.title = ORIG.get(doc);
  };
  function doTitle() {
    if (!ORIG.has(doc)) ORIG.set(doc, doc.title);
    doc.title = I.lang === I.SOURCE ? ORIG.get(doc) : I.tx(ORIG.get(doc));
  }

  let obs = null;
  I.start = function () {
    if (obs || !root.MutationObserver) return;
    obs = new root.MutationObserver((recs) => {
      if (I.lang === I.SOURCE) return;
      for (const r of recs) {
        if (r.type === 'characterData') { const p = r.target.parentElement; if (p && !SKIP[p.nodeName] && !noTr(p)) doText(r.target); }
        else if (r.type === 'attributes') { if (ATTRS.includes(r.attributeName)) doAttrs(r.target); }
        else for (const n of r.addedNodes) walk(n);
      }
    });
    obs.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(doc.body || doc.documentElement);
    doTitle();
  };

  // 畫布上的文字（地球標籤、戰場與生活畫面）也一起翻
  const CP = root.CanvasRenderingContext2D && root.CanvasRenderingContext2D.prototype;
  if (CP && !CP._i18n) {
    CP._i18n = true;
    for (const fn of ['fillText', 'strokeText', 'measureText']) {
      const orig = CP[fn];
      CP[fn] = function (t, ...a) { return orig.call(this, I.lang === I.SOURCE || typeof t !== 'string' ? t : I.tx(t), ...a); };
    }
  }

  // 載入字典：同步寫入 <script>（啟動時，讓第一個畫面就是對的語言），之後切換時用動態載入
  const base = (() => { const s = doc.currentScript && doc.currentScript.src; return s ? s.replace(/[^/]*$/, '') : 'i18n/'; })();
  // 字典檔的網址也帶上版本號（index.html 裡 i18n.js?v=…），更新後瀏覽器才不會用舊的暫存檔
  const ver = (() => { const s = doc.currentScript && doc.currentScript.src; const m = s && s.match(/\?v=[\w-]+/); return m ? m[0] : ''; })();
  const files = (lang) => [I.LANGS[lang].fb, lang].filter((l) => l && l !== I.SOURCE && !I.DATA[l]).map((l) => base + I.LANGS[l].file + '.js' + ver);
  I.load = function (lang, cb) {
    const todo = files(lang);
    if (!todo.length) { cb && cb(I.ready(lang)); return; }
    const s = doc.createElement('script');
    s.src = todo[0];
    s.onload = () => I.load(lang, cb);
    s.onerror = () => cb && cb(false);
    doc.head.appendChild(s);
  };
  // 切換語言：載入字典後重新翻譯整個畫面
  I.switchTo = function (lang, cb) {
    I.load(lang, (ok) => {
      if (!ok) lang = I.SOURCE;
      I.restore();
      I.setLang(lang);
      walk(doc.body);
      doTitle();
      cb && cb(lang);
    });
  };

  const want = I.wanted();
  I.setLang(want);
  if (want !== I.SOURCE && doc.readyState === 'loading') {
    for (const f of files(want)) doc.write('<script src="' + f + '"><\/script>');
  }
  doc.addEventListener('DOMContentLoaded', () => { if (!I.ready(I.lang)) I.switchTo(I.lang); I.start(); });
})(typeof window !== 'undefined' ? window : globalThis);
