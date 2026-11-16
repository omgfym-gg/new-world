// 合理範圍健康檢查：node tools/health-check.js [種子數]
// 產生 reports/health-1911.md，並在終端機印出結果。
const fs = require('fs');
const path = require('path');
const WS = require('../tests/load.js')();
const n = +(process.argv[2] || 8);
const t = Date.now();
const h = WS.Backtest.health({ n });
const md = WS.Backtest.healthMarkdown(h);
const out = path.join(__dirname, '..', 'reports', 'health-1911.md');
fs.writeFileSync(out, md + '\n');
console.log(md.split('\n').filter((l) => l.startsWith('| ⚠️') || l.startsWith('| ✅')).join('\n'));
console.log(`\n報表：${path.relative(process.cwd(), out)}（${((Date.now() - t) / 1000).toFixed(1)} 秒）`);
