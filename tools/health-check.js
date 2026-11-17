// 合理範圍健康檢查：node tools/health-check.js [種子數] [劇本]
// 劇本預設 1911（8 國）；1911w＝全世界。產生 reports/health-<劇本>.md，並在終端機印出結果。
const fs = require('fs');
const path = require('path');
const WS = require('../tests/load.js')();
const n = +(process.argv[2] || 8);
const t = Date.now();
const scenario = process.argv[3] || '1911';
const h = WS.Backtest.health({ n, scenario });
const md = WS.Backtest.healthMarkdown(h);
const out = path.join(__dirname, '..', 'reports', 'health-' + scenario + '.md');
fs.writeFileSync(out, md + '\n');
console.log(md.split('\n').filter((l) => l.startsWith('| ⚠️') || l.startsWith('| ✅')).join('\n'));
console.log(`\n報表：${path.relative(process.cwd(), out)}（${((Date.now() - t) / 1000).toFixed(1)} 秒）`);
