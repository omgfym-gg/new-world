// 在 Node 中載入引擎（與瀏覽器相同的檔案與順序）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'engine/rng.js', 'engine/params.js', 'data/scenario-1911.js', 'data/scenario-1911-world.js', 'data/definitions.js',
  'engine/state-engine.js', 'engine/population-engine.js', 'engine/environment-engine.js', 'engine/economy-engine.js',
  'engine/politics-engine.js', 'engine/technology-engine.js', 'engine/diplomacy-engine.js', 'engine/military-engine.js',
  'systems/policy-system.js', 'systems/agent-system.js', 'systems/event-system.js', 'systems/rule-system.js',
  'systems/history-system.js', 'systems/explain-system.js', 'systems/save-system.js', 'systems/whatif-system.js', 'systems/divine-system.js', 'systems/headline-system.js', 'engine/world-engine.js'
];
// 只在 Node（測試、回測工具）載入的檔案：歷史對照資料與回測系統
const EXTRA = ['data/history-reference.js', 'data/history-policies-1911.js', 'systems/backtest-system.js'];
module.exports = function load() {
  delete globalThis.WS;
  for (const f of FILES.concat(EXTRA)) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  return globalThis.WS;
};
module.exports.FILES = FILES;
module.exports.EXTRA = EXTRA;
