// 多國語言：實際打開畫面檢查（需要 Playwright）。i18n-check.js 只檢查引擎文字；
// 這個工具用無頭瀏覽器載入一個已經走到結局的世界，切到英文、日文，逐頁打開（總覽、平面地圖、國家、世界、歷史、系統、
// 結局報告、「沒有你的世界」），把畫面上還留著中文的句子列出來，抓出執行時才拼起來的句子。
// 用法：node tools/i18n-ui-check.js [語言...]（預設 en ja）
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const WS = require('../tests/load.js')();
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'ja'];

function makeWorld() {
  // 1911 全世界 → 回溯 1916 → 神之手 → 推到結局（和雲端試玩相同）
  const e = new WS.WorldEngine();
  e.create({ mode: 'global', focus: 'CHN', seed: 'seedA', scenario: '1911w' });
  while (e.w.year < 1920) e.step();
  const i = e.snapshots.findIndex((s) => JSON.parse(s.json).year === 1916);
  const e2 = new WS.WorldEngine();
  e2.load(e.branchFromSnapshot(i, '回溯 1916'));
  e2.w.divine.energy = 100;
  e2.divine('health', 'CHN');
  while (!(e2.w.future && e2.w.future.ended) && e2.w.year < 2600) { e2.step(); e2.w.pendingDecision = null; }
  return e2.serialize();
}

(async () => {
  const t0 = Date.now();
  const json = makeWorld();
  const b = await chromium.launch();
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  const all = {};
  for (const lang of langs) {
    const p = await b.newPage({ viewport: { width: 420, height: 900 }, locale: lang });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.WS && WS.App && WS.I18n && WS.I18n.lang !== 'zh-TW', null, { timeout: 15000 });
    await p.evaluate((j) => WS.App.load(JSON.parse(j)), json);
    const click = (act, v) => p.evaluate(([a, v2]) => { const el = document.createElement('button'); el.dataset.act = a; if (v2 != null) el.dataset.v = v2; el.hidden = true; document.body.appendChild(el); el.click(); el.remove(); }, [act, v]);
    // 英文等：畫面上不該有任何漢字。日文本來就用漢字：只抓日文不用的繁體字與中文用語
    const grab = (where) => p.evaluate(([w, lg]) => {
      const bad = lg === 'ja' ? /[這們為與經點會歷產區對將應從邊讓說爭戰權總變數當處發體氣觸聯傳來沒鄰國你]|預計/ : lg.startsWith('zh') ? /$^/ : /[㐀-鿿]/;
      const out = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const el = n.parentElement;
        if (!el || el.closest('[translate="no"],script,style,[hidden]')) continue;
        const s = n.nodeValue.trim();
        if (bad.test(s)) out.push(w + '｜' + s.slice(0, 600));
        // 英文文法：西元年後面不加 year、數量 1 不用複數
        else if (lg === 'en' && (/\b[12]\d{3} years?\b/.test(s) || /(^|[^\d.,])1 (?!people|percent)[a-z]+s\b/.test(s))) out.push(w + '｜文法｜' + s.slice(0, 600));
      }
      return out;
    }, [where, lang]);
    const found = [];
    const settle = () => p.waitForTimeout(400);
    for (const tab of ['overview', 'country', 'world', 'history', 'explain', 'system']) {
      await click('tab', tab); await settle();
      found.push(...await grab(tab));
    }
    await click('tab', 'overview'); await click('map-view', 'flat'); await settle();
    found.push(...await grab('flat-map'));
    await click('ending'); await settle();
    found.push(...await grab('ending'));
    await click('cf-run');
    await p.waitForFunction(() => /[0-9]/.test((document.getElementById('cf-out') || {}).textContent || '') && !document.querySelector('#cf-out .num:only-child'), null, { timeout: 300000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector('#cf-out table'), null, { timeout: 300000 }).catch(() => {});
    await settle();
    found.push(...await grab('ending+cf'));
    all[lang] = { strings: [...new Set(found)], errors: errs };
    await p.close();
  }
  await b.close();
  let bad = 0;
  for (const lang of langs) {
    const r = all[lang];
    console.log(`\n== ${lang}：畫面上仍有中文 ${r.strings.length} 句${r.errors.length ? `，JavaScript 錯誤 ${r.errors.length}` : ''}`);
    for (const s of r.strings) console.log('  ' + s);
    for (const s of r.errors) console.log('  ✘ ' + s);
    bad += r.strings.length + r.errors.length;
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  process.exit(bad ? 1 : 0);
})();
