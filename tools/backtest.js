// 歷史回測工具：node tools/backtest.js [ai|replay|both] [種子數]
// 產生 reports/backtest-1911.md（偏差報表），並在終端機印出總覽。
const fs = require('fs');
const path = require('path');
const WS = require('../tests/load.js')();

const which = process.argv[2] || 'both';
const nSeeds = +(process.argv[3] || 3);
const seeds = Array.from({ length: nSeeds }, (_, i) => 'bt-' + (i + 1));
const modes = which === 'both' ? ['ai', 'replay'] : [which];

const t = Date.now();
const results = modes.map((mode) => WS.Backtest.run({ scenario: '1911', mode, seeds }));
const md = WS.Backtest.toMarkdown(results);
const out = path.join(__dirname, '..', 'reports', 'backtest-1911.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md + '\n');

for (const r of results) {
  console.log(`\n[${r.mode}] 最終人口平均偏差 ${(r.popScore * 100).toFixed(0)}%，GDP ${(r.gdpScore * 100).toFixed(0)}%`);
  for (const f of WS.Backtest.findings(r)) console.log('  - ' + f);
}
console.log(`\n報表：${path.relative(process.cwd(), out)}（${((Date.now() - t) / 1000).toFixed(1)} 秒）`);
