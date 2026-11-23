// 多國語言：實際打開畫面檢查（需要 Playwright）。i18n-check.js 只檢查引擎文字；
// 這個工具用無頭瀏覽器載入世界、切換語言、逐頁打開，把畫面上還留著中文的句子與明顯的文法問題列出來，
// 抓出執行時才拼起來的句子。檢查的畫面：
//   1. 1911 年的世界：對武昌起義做「如果？」，看平行世界比較頁
//   2. 走到「人類走向星際」結局的世界：各分頁、平面地圖、結局報告
//   3. 走到核子寒冬結局的全世界劇本（回溯＋神之手）：結局報告與「沒有你的世界」重跑（較慢，只跑 --cf 指定的語言，預設 en）
// 用法：node tools/i18n-ui-check.js [語言...] [--cf=en,ja]（不指定語言＝全部 16 種）
const path = require('path');
const { chromium } = require('playwright');
const WS = require('../tests/load.js')();
const args = process.argv.slice(2);
const cfArg = args.find((a) => a.startsWith('--cf='));
const cfLangs = cfArg ? cfArg.slice(5).split(',').filter(Boolean) : ['en'];
const ALL = [...require('fs').readFileSync(path.join(__dirname, '..', 'i18n', 'i18n.js'), 'utf8').match(/I\.LANGS = \{[\s\S]*?\n  \};/)[0].matchAll(/^\s+'?([\w-]+)'?: \{ name/gm)].map((m) => m[1]).filter((l) => l !== 'zh-TW');
const langs = args.filter((a) => !a.startsWith('--')).length ? args.filter((a) => !a.startsWith('--')) : ALL;

// 日文本來就用漢字：只抓日文不用的繁體字與中文用語。簡體中文不檢查漢字
const BAD = {
  ja: /[這們為與經點會歷產區對將應從邊讓說爭戰權總變數當處發體氣觸聯傳來沒鄰國你]|預計/
};
// 西元年後面接「年」字的直譯（例如 2119 year、1911 año），以及數量 1 用複數
const YEARWORD = { en: 'years?', es: 'años?', pt: 'anos?', it: 'anni|anno', fr: 'ans?', de: 'Jahre?n?', id: 'tahun' };

function run(e, until) { while (!(e.w.future && e.w.future.ended) && e.w.year < until) { e.step(); e.w.pendingDecision = null; } }
function worlds(needCf) {
  const t = Date.now();
  // 1911 年（8 國），推到 1913 年：之後在頁面裡對武昌起義做「如果？」
  const a = new WS.WorldEngine();
  a.create({ mode: 'global', focus: 'CHN', seed: 's1', scenario: '1911' });
  run(a, 1913);
  // 同一個世界一路推到結局（這個種子是「人類走向星際」，途中有人造瘟疫與 AI 事故）
  const b = new WS.WorldEngine();
  b.load(JSON.parse(a.serialize()));
  run(b, 2600);
  let c = null;
  if (needCf) {
    // 全世界劇本：回溯 1916 → 神之手 → 推到結局（核子寒冬）
    const e = new WS.WorldEngine();
    e.create({ mode: 'global', focus: 'CHN', seed: 'seedA', scenario: '1911w' });
    while (e.w.year < 1920) e.step();
    const i = e.snapshots.findIndex((s) => JSON.parse(s.json).year === 1916);
    c = new WS.WorldEngine();
    c.load(e.branchFromSnapshot(i, '回溯 1916'));
    c.w.divine.energy = 100;
    c.divine('health', 'CHN');
    run(c, 2600);
  }
  console.log(`準備世界：${((Date.now() - t) / 1000).toFixed(0)} 秒（結局：${b.w.future.ended && b.w.future.ended.title} ${b.w.year}${c ? `；${c.w.future.ended && c.w.future.ended.title} ${c.w.year}` : ''}）`);
  return { early: a.serialize(), stars: b.serialize(), nuke: c && c.serialize() };
}

(async () => {
  const t0 = Date.now();
  const W = worlds(langs.some((l) => cfLangs.includes(l)));
  const b = await chromium.launch();
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  const all = {};
  for (const lang of langs) {
    const p = await b.newPage({ viewport: { width: 420, height: 900 }, locale: lang });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    await p.waitForFunction((l) => window.WS && WS.App && WS.I18n && WS.I18n.lang === l, lang === 'zh-CN' ? 'zh-CN' : lang, { timeout: 15000 });
    const load = (j) => p.evaluate((x) => WS.App.load(JSON.parse(x)), j);
    const click = (act, v, extra) => p.evaluate(([a, v2, ex]) => { const el = document.createElement('button'); el.dataset.act = a; if (v2 != null) el.dataset.v = v2; Object.assign(el.dataset, ex || {}); el.hidden = true; document.body.appendChild(el); el.click(); el.remove(); }, [act, v, extra]);
    const grab = (where) => p.evaluate(([w, lg, bad, yw]) => {
      const re = bad ? new RegExp(bad) : lg.startsWith('zh') ? null : /[㐀-鿿]/;
      const yr = yw ? new RegExp(`(^|[^\\d])[12]\\d{3} (${yw})\\b`) : null;
      const out = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const el = n.parentElement;
        if (!el || el.closest('[translate="no"],script,style,[hidden]')) continue;
        const s = n.nodeValue.trim();
        if (re && re.test(s)) out.push(w + '｜' + s.slice(0, 400));
        else if (yr && yr.test(s)) out.push(w + '｜年份｜' + s.slice(0, 400));
        else if (lg === 'en' && /(^|[^\d.,])1 (?!people|percent)[a-z]+s\b/.test(s)) out.push(w + '｜單複數｜' + s.slice(0, 400));
      }
      return out;
    }, [where, lang, BAD[lang] ? BAD[lang].source : null, YEARWORD[lang] || null]);
    const settle = () => p.waitForTimeout(350);
    const found = [];
    // 1. 「如果？」平行世界比較頁
    await load(W.early); await settle();
    const ev = await p.evaluate(() => { const w = window.WS.App.world(); const e = w.events.find((x) => /武昌/.test(x.title)) || w.events.find((x) => x.level >= 3 && x.type !== 'system'); return e && e.id; });
    if (ev) {
      await click('whatif', null, { id: ev }); await settle();
      const k = await p.evaluate(() => { const bt = document.querySelector('[data-act="whatif-run"]'); return bt && bt.dataset.k; });
      if (k) {
        await click('whatif-run', null, { id: ev, k });
        await p.waitForFunction(() => document.querySelector('.wi-table, .wi-box'), null, { timeout: 120000 }).catch(() => {});
        await p.waitForTimeout(800);
        found.push(...await grab('如果？'));
        await click('close-modal');
      }
    }
    // 2. 走到星際結局的世界
    await load(W.stars); await settle();
    for (const tab of ['overview', 'country', 'world', 'history', 'explain', 'system']) { await click('tab', tab); await settle(); found.push(...await grab(tab)); }
    await click('tab', 'overview'); await click('map-view', 'flat'); await settle(); found.push(...await grab('平面地圖'));
    await click('map-zoom', 'europe'); await settle(); found.push(...await grab('放大歐洲')); await click('map-zoom', '');
    await click('ending'); await settle(); found.push(...await grab('結局（星際）'));
    // 3. 核子寒冬結局＋「沒有你的世界」
    if (W.nuke && cfLangs.includes(lang)) {
      await click('close-modal'); await load(W.nuke); await settle();
      await click('ending'); await settle(); found.push(...await grab('結局（核子寒冬）'));
      await click('cf-run');
      await p.waitForFunction(() => document.querySelector('#cf-out table'), null, { timeout: 600000 }).catch(() => {});
      await settle(); found.push(...await grab('沒有你的世界'));
    }
    all[lang] = { strings: [...new Set(found)], errors: errs };
    await p.close();
  }
  await b.close();
  let bad = 0;
  for (const lang of langs) {
    const r = all[lang];
    console.log(`\n== ${lang}：問題 ${r.strings.length} 句${r.errors.length ? `，JavaScript 錯誤 ${r.errors.length}` : ''}`);
    for (const s of r.strings) console.log('  ' + s);
    for (const s of r.errors) console.log('  ✘ ' + s);
    bad += r.strings.length + r.errors.length;
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  process.exit(bad ? 1 : 0);
})();
