// 在 Node 中載入引擎（與瀏覽器相同的檔案與順序）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'engine/rng.js', 'engine/params.js', 'data/scenario-1911.js', 'data/definitions.js',
  'engine/state-engine.js', 'engine/population-engine.js', 'engine/environment-engine.js', 'engine/economy-engine.js',
  'engine/politics-engine.js', 'engine/technology-engine.js', 'engine/diplomacy-engine.js', 'engine/military-engine.js',
  'systems/policy-system.js', 'systems/agent-system.js', 'systems/event-system.js', 'systems/rule-system.js',
  'systems/history-system.js', 'systems/explain-system.js', 'systems/save-system.js', 'engine/world-engine.js'
];
module.exports = function load() {
  delete globalThis.WS;
  for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  return globalThis.WS;
};
module.exports.FILES = FILES;
