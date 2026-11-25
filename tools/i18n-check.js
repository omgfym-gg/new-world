// 多國語言檢查：實際跑幾個世界，把引擎產生的所有文字（事件、因果帳、歷史敘述…）翻成英文，
// 列出還有中文留下的句子。用法：node tools/i18n-check.js [年數倍率，預設 1]
const load = require('../tests/load.js');
const { loadI18n } = require('./i18n-extract.js');

function strings(obj, out, depth = 0) {
  if (depth > 40 || obj == null) return out;
  if (typeof obj === 'string') { if (/[㐀-鿿]/.test(obj)) out.add(obj); return out; }
  if (typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { for (const x of obj) strings(x, out, depth + 1); return out; }
  for (const k in obj) { if (/[㐀-鿿]/.test(k)) out.add(k); strings(obj[k], out, depth + 1); }
  return out;
}

function collect(scale = 1) {
  const all = new Set();
  const WS = load();
  const run = (setup, years) => {
    const e = new WS.WorldEngine();
    e.create(Object.assign({ seed: 'i18n' }, setup));
    for (let y = 0; y < years; y++) { e.advanceYears(1, { stopOnMajor: false }); strings(e.world.countries, all); }
    strings(e.world, all);
    return e;
  };
  run({ mode: 'country', focus: 'CHN', scenario: '1911' }, Math.round(60 * scale));
  run({ mode: 'global', scenario: '1911w', seed: 'i18n-w' }, Math.round(120 * scale));
  // 世界規則（2026-11-25 新增）的文字：因果帳、轉換步驟
  run({ mode: 'global', scenario: '1911', seed: 'i18n-r1', rules: { work: 'postwork', lifespan: 'ageless', religion: 'theocracy', birth: 'one', fossil: false, language: true, gender: true, government: 'monarchy' } }, Math.round(15 * scale));
  run({ mode: 'global', scenario: '1911', seed: 'i18n-r2', rules: { work: 'ubi', lifespan: 'long', religion: 'none', birth: 'more', nukes: false, government: 'democracy' } }, Math.round(15 * scale));
  for (const k in WS.Data.rules) { const d = WS.Data.rules[k]; for (const v of d.type === 'bool' ? [true, false] : d.choices.map((c) => c[0])) for (const st of WS.Rules.conversionSteps(k, v)) all.add(st); }
  const a = run({ mode: 'global', scenario: 'bc10000', seed: 'i18n-a' }, 0);
  while (a.world.year < 1820) { a.advanceYears(200, { stopOnMajor: false }); strings(a.world, all); }
  if (a.toModern) { a.toModern(); for (let y = 0; y < 60 * scale; y++) a.advanceYears(1, { stopOnMajor: false }); strings(a.world, all); }
  return { WS, all };
}
module.exports = collect;

if (require.main === module) {
  const t = Date.now();
  const { all } = collect(+(process.argv[2] || 1));
  const I = loadI18n('en');
  I.misses = new Set();
  for (const s of all) I.tx(s);
  const miss = [...I.misses];
  console.log(`引擎文字 ${all.size} 句，英文仍有中文的 ${miss.length} 句（${((1 - miss.length / all.size) * 100).toFixed(1)}% 完整）・${((Date.now() - t) / 1000).toFixed(0)} 秒`);
  if (process.argv.includes('--list')) for (const m of miss) console.log(JSON.stringify(m) + '\t' + JSON.stringify(I.tx(m)));
}
