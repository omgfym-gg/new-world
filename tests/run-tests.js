// 自動化測試：node tests/run-tests.js
// 涵蓋第 14.4 節三種驗證中可自動化的部分（重複模擬、極端條件）與各模型單獨測試。
const assert = require('assert');
const load = require('./load.js');
let WS = load();

const results = [];
function test(name, fn) {
  WS = load(); // 每個測試重新載入，避免互相污染
  const t = Date.now();
  try { fn(); results.push(['✔', name, Date.now() - t]); }
  catch (e) { results.push(['✘', name, Date.now() - t, e.message]); }
}
const make = (setup = {}) => { const e = new WS.WorldEngine(); e.create(Object.assign({ mode: 'country', focus: 'CHN', seed: 'unit' }, setup)); return e; };
const total = (w) => WS.util.ids(w).reduce((s, id) => s + WS.util.popTotal(w.countries[id]), 0);

// ---------- 重複模擬 ----------
test('相同種子與設定 → 30 年後世界狀態完全相同', () => {
  const a = make(); a.advance(360);
  const b = make(); b.advance(360);
  assert.strictEqual(a.serialize(), b.serialize());
});
test('不同種子 → 產生不同的歷史分支', () => {
  const a = make({ seed: 'x1' }); a.advance(240);
  const b = make({ seed: 'x2' }); b.advance(240);
  assert.notStrictEqual(a.serialize(), b.serialize());
});
test('存檔後載入繼續推進，結果與不中斷相同', () => {
  const a = make(); a.advance(120);
  const saved = a.serialize();
  a.advance(120);
  const b = new WS.WorldEngine(); b.load(saved); b.advance(120);
  assert.strictEqual(a.serialize(), b.serialize());
});

// ---------- 數值驗證 ----------
test('百年推進：沒有 NaN、指數都在 0–100、人口與 GDP 為正', () => {
  const e = make(); e.advance(1200);
  const w = e.world;
  for (const id of WS.util.ids(w)) {
    const c = w.countries[id];
    for (const k in c.pol) assert.ok(c.pol[k] >= 0 && c.pol[k] <= 100, `${id}.${k}=${c.pol[k]}`);
    assert.ok(WS.util.popTotal(c) > 0 && isFinite(c.econ.gdp) && c.econ.gdp > 0, id);
  }
  const nan = w.validation.issues.filter((i) => i.text.includes('無效數字'));
  assert.strictEqual(nan.length, 0, JSON.stringify(nan.slice(0, 3)));
});
test('百年推進效能 < 15 秒', () => {
  const e = make(); const t = Date.now(); e.advance(1200);
  assert.ok(Date.now() - t < 15000, (Date.now() - t) + 'ms');
});

// ---------- 各模型單獨測試 ----------
test('人口模型：出生 − 死亡 + 遷移 等於人口變化（因果帳平衡）', () => {
  const e = make(); const w = e.world;
  const before = WS.util.popTotal(w.countries.USA);
  e.advance(11); // 尚未跨年，因果帳仍在 cur
  const after = WS.util.popTotal(w.countries.USA);
  const m = WS.Explain.metric(w, 'USA', 'population', 'current');
  assert.ok(Math.abs(m.total - (after - before)) < 1e-6, `${m.total} vs ${after - before}`);
});
test('人口模型：年齡層隨時間移動（老化）', () => {
  const e = make(); const c = e.world.countries.FRA;
  const share0 = c.pop.c3 / WS.util.popTotal(c);
  e.advance(600);
  assert.ok(c.pop.c3 / WS.util.popTotal(c) !== share0);
});
test('經濟模型：起點校準後第一期 GDP 與資料差距 < 3%', () => {
  const e = make(); const w = e.world;
  const g0 = {}; for (const id of WS.util.ids(w)) g0[id] = w.countries[id].econ.gdp;
  e.advance(1);
  for (const id of WS.util.ids(w)) assert.ok(Math.abs(w.countries[id].econ.gdp / g0[id] - 1) < 0.03, id);
});
test('經濟模型：GDP 變化歸因加總等於實際變化', () => {
  const e = make(); const w = e.world; const c = w.countries.DEU;
  const g0 = c.econ.gdp; e.advance(11);
  const m = WS.Explain.metric(w, 'DEU', 'gdp', 'current');
  assert.ok(Math.abs(m.total - (c.econ.gdp - g0)) < 1e-6 * g0 + 1e-6, `${m.total} vs ${c.econ.gdp - g0}`);
});
test('資源模型：能源儲量只減不增且不為負', () => {
  const e = make(); const c = e.world.countries.GBR;
  let prev = c.res.coal;
  for (let i = 0; i < 240; i++) { e.step(); assert.ok(c.res.coal <= prev + 1e-9 && c.res.coal >= 0); prev = c.res.coal; }
});
test('資源模型：能源不足會降低工業產出（極端條件）', () => {
  const a = make(); const b = make();
  b.world.countries.JPN.res.coal = 0; b.world.countries.JPN.res.oil = 0; b.world.countries.JPN.econ.openness = 0;
  a.advance(24); b.advance(24);
  assert.ok(b.world.countries.JPN.econ.sec.ind.Y < a.world.countries.JPN.econ.sec.ind.Y);
});
test('科技模型：前置條件未滿足的科技不會出現在研究清單', () => {
  const e = make(); const c = e.world.countries.CHN;
  const av = WS.Technology.available(c, e.world);
  assert.ok(!av.includes('automation') && !av.includes('internet'));
});
test('科技模型：世界停止研究（科技速度＝0）時沒有新發明', () => {
  const e = make({ rules: { techSpeed: 0 } });
  const inv0 = Object.keys(e.world.invented).length;
  e.advance(240);
  // 只剩貿易擴散；不會有世界首次發明
  assert.strictEqual(Object.values(e.world.invented).filter((x) => x.by !== '起點前已存在').length, 0);
  assert.strictEqual(Object.keys(e.world.invented).length, inv0);
});
test('外交模型：國家記住過去的行為（記憶影響目標關係）', () => {
  const e = make(); const w = e.world;
  e.advance(1);
  const r = WS.util.relation(w, 'USA', 'GBR');
  const t0 = r.target;
  WS.Diplomacy.remember(w, 'USA', 'GBR', -50, '違反條約');
  e.advance(1);
  assert.ok(r.target < t0 - 40);
});
test('軍事模型：戰爭造成傷亡、耗竭並最終結束', () => {
  const e = make({ rules: {} }); const w = e.world;
  const ctx = { rng: new WS.RNG(1), major: [] };
  const war = WS.Military.declareWar(w, 'DEU', 'FRA', ctx, ['測試']);
  const p0 = WS.util.popTotal(w.countries.FRA);
  e.advance(80);
  assert.ok(war.ended, '戰爭應在 72 個月內結束');
  assert.ok(Object.values(war.casualties).every((x) => x > 0));
  assert.ok(WS.util.popTotal(w.countries.FRA) !== p0);
});
test('世界禁止戰爭：百年內沒有任何戰爭（極端條件）', () => {
  const e = make({ rules: { war: false } }); e.advance(1200);
  assert.strictEqual(e.world.wars.length, 0);
});
test('Agent：沒有玩家操作時，各國仍會自行做出決策', () => {
  const e = make({ intervention: 'none' }); e.advance(60);
  for (const id of WS.util.ids(e.world)) assert.ok(e.world.countries[id].decisions.length > 0, id);
});
test('Agent：完全控制時，玩家國家不會被 AI 決策', () => {
  const e = make({ intervention: 'full' }); e.advance(60);
  assert.strictEqual(e.world.countries.CHN.decisions.length, 0);
  assert.ok(e.world.countries.USA.decisions.length > 0);
});
test('政策：不合法的政策會被引擎拒絕', () => {
  const e = make();
  const r = e.applyPolicy('USA', 'repression'); // 共和民主不允許鎮壓
  assert.strictEqual(r.ok, false);
});

// ---------- 事件與動態實體 ----------
test('固定歷史事件有條件：清廷穩定時武昌起義不會發生', () => {
  const e = make(); const c = e.world.countries.CHN;
  c.pol.stability = 80; c.pol.legitimacy = 80; c.pol.conflict = 10;
  c.controller = 'player';
  e.advance(9);
  const ev = e.world.events.filter((x) => x.defId === 'wuchang');
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].type, 'historical-missed');
});
test('每個事件都有原因紀錄', () => {
  const e = make(); e.advance(240);
  const bad = e.world.events.filter((x) => ['conditional', 'historical', 'war', 'regime', 'newcountry'].includes(x.type) && !x.causes.length);
  assert.strictEqual(bad.length, 0, bad.map((x) => x.title).join(','));
});
test('動態實體：分裂建立新國家，總人口守恆', () => {
  const e = make(); const w = e.world;
  const before = total(w);
  const nc = WS.State.splitCountry(w, 'RUS', ['RUS-R3'], { name: '波蘭共和國' });
  assert.ok(w.countries[nc.id] && nc.regions.includes('RUS-R3'));
  assert.ok(Math.abs(total(w) - before) < 1e-6);
  e.advance(24); // 新國家能正常運作
  assert.ok(WS.util.popTotal(nc) > 0 && nc.decisions.length > 0);
});
test('動態實體：可以建立新制度與國際組織', () => {
  const e = make(); const w = e.world;
  WS.State.ensureRegime(w, 'technocracy', { name: '技術官僚制', family: 'mixed', elections: false, repression: false });
  assert.ok(WS.util.regime(w, 'technocracy'));
  const json = e.serialize(); const b = new WS.WorldEngine(); b.load(json);
  assert.ok(WS.util.regime(b.world, 'technocracy'), '新制度必須隨存檔保存');
  const o = WS.State.createOrganization(w, '測試組織', ['FRA', 'GBR', 'USA'], 'economic');
  assert.ok(w.organizations[o.id].members.length === 3);
});

// ---------- 世界規則 ----------
test('規則衝突：沒有貨幣＋存在資本主義 會被指出', () => {
  const c = WS.Rules.conflicts(Object.assign({}, { currency: false, capitalism: true, states: true, war: true }));
  assert.strictEqual(c.length, 1);
  assert.throws(() => make({ rules: { currency: false } }));
});
test('自然語言轉換成規則', () => {
  const r = WS.Rules.parseNL('建立沒有國家、沒有貨幣、資源由人類共同管理的世界。');
  assert.deepStrictEqual(r.set, { currency: false, states: false, resourceSharing: true });
});
test('取消國家制度：人口與資源不消失、轉成地區共治、沒有戰爭', () => {
  const e = make({ mode: 'global', rules: { states: false, war: false, currency: false, capitalism: false, resourceSharing: true } });
  const w = e.world;
  for (const id of WS.util.ids(w)) assert.strictEqual(w.countries[id].regime, 'commune');
  const p0 = total(w);
  e.advance(240);
  assert.ok(total(w) > p0 * 0.8);
  assert.strictEqual(w.wars.length, 0);
});
test('模擬中改變規則會記錄制度轉換', () => {
  const e = make({ mode: 'global' });
  const r = e.changeRule('war', false);
  assert.ok(r.ok && e.world.transitions.length === 1);
  const bad = e.changeRule('currency', false);
  assert.strictEqual(bad.ok, false, '會與資本主義衝突');
});

// ---------- 分支與存檔 ----------
test('分支完全隔離：修改分支不影響原世界', () => {
  const e = make(); e.advance(60);
  const before = e.serialize();
  const br = e.createBranch('B', '測試');
  br.countries.CHN.pol.stability = 99;
  br.rules.war = false;
  assert.strictEqual(e.serialize(), before);
  assert.notStrictEqual(br.branch.id, e.world.branch.id);
});
test('歷史回溯：從快照建立的分支回到過去年份', () => {
  const e = make(); e.advance(240);
  const b = e.branchFromSnapshot(0, '回溯', '測試');
  assert.strictEqual(b.year, 1911);
  assert.strictEqual(e.world.year, 1931);
});
test('存檔版本檢查', () => {
  const e = make();
  const obj = JSON.parse(e.serialize()); obj.version = 999;
  assert.throws(() => WS.Save.migrate(obj));
});
test('模式切換不重置世界狀態', () => {
  const e = make(); e.advance(36);
  const tick = e.world.tick, pop = total(e.world);
  e.setMode('global'); e.setMode('country');
  assert.strictEqual(e.world.tick, tick); assert.strictEqual(total(e.world), pop);
});
test('解釋系統：每個問題都有答案', () => {
  const e = make(); e.advance(240);
  const qs = WS.Explain.questions(e.world, 'CHN');
  assert.ok(qs.length >= 5 && qs.every((q) => q.q && q.a && q.a.length > 10));
});

// ---------- 「如果」平行世界 ----------
const story = () => { const e = make({ seed: '', intervention: 'none' }); e.advance(240); return e; };
const findEv = (w, f) => w.events.find(f);
const before = (w, tick) => w.events.filter((x) => WS.WhatIf.tickOf(w, x.y, x.m) < tick).map((x) => x.y + '.' + x.m + ' ' + x.title).join('\n');
test('如果：歷史事件、條件事件、戰爭都有「如果」選項', () => {
  const w = story().world;
  const wu = findEv(w, (x) => x.defId === 'wuchang');
  assert.deepStrictEqual(WS.WhatIf.options(w, wu).map((o) => o.action), ['block']);
  const rev = findEv(w, (x) => x.defId === 'revolution' && x.countries[0] === 'CHN');
  assert.ok(WS.WhatIf.options(w, rev).some((o) => o.label === '如果中國革命失敗'));
  const war = findEv(w, (x) => x.type === 'war' && x.warPair);
  assert.strictEqual(WS.WhatIf.options(w, war)[0].target.kind, 'war');
  const sys = findEv(w, (x) => x.type === 'system');
  assert.strictEqual(WS.WhatIf.options(w, sys).length, 0);
});
test('如果：不改動原本的世界', () => {
  const e = story(); const s0 = e.serialize();
  const rev = findEv(e.world, (x) => x.defId === 'revolution' && x.countries[0] === 'CHN');
  const r = e.whatIf(rev.id, 'fail');
  assert.ok(r.ok); assert.strictEqual(e.serialize(), s0);
  assert.notStrictEqual(r.world, e.world);
});
test('如果：分岔前歷史完全相同、推進到同一個月、分岔點寫入事件紀錄', () => {
  const e = story(); const w = e.world;
  const wu = findEv(w, (x) => x.defId === 'wuchang');
  const r = e.whatIf(wu.id, 'block'); const a = r.world;
  const tick = WS.WhatIf.tickOf(w, wu.y, wu.m);
  assert.strictEqual(before(a, tick), before(w, tick));
  assert.strictEqual(a.tick, w.tick); assert.strictEqual(a.year, w.year);
  assert.ok(r.report.applied);
  const div = findEv(a, (x) => x.type === 'whatif');
  assert.strictEqual(div.title, '如果「武昌起義」沒有發生');
  assert.strictEqual(WS.WhatIf.tickOf(a, div.y, div.m), tick);
  assert.ok(div.causes.length > 1, '分岔點要記錄原本的條件');
  assert.ok(!a.events.some((x) => x.defId === 'wuchang' && x.type === 'historical'));
  assert.strictEqual(a.branch.parent, w.branch.id);
});
test('如果：同一個「如果」重跑兩次結果完全相同（可重現）', () => {
  const e = story();
  const rev = findEv(e.world, (x) => x.defId === 'revolution' && x.countries[0] === 'CHN');
  const a = e.whatIf(rev.id, 'fail').world, b = e.whatIf(rev.id, 'fail').world;
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
});
test('如果：革命失敗 → 同一個月革命仍發生但失敗，制度沒有改變', () => {
  const e = story(); const w = e.world;
  const rev = findEv(w, (x) => x.defId === 'revolution' && x.countries[0] === 'CHN');
  assert.ok(rev.effects.includes('革命成功'));
  const a = e.whatIf(rev.id, 'fail').world;
  const r2 = a.events.find((x) => x.defId === 'revolution' && x.countries[0] === 'CHN' && x.y === rev.y && x.m === rev.m);
  assert.ok(r2 && r2.effects[0].startsWith('革命失敗'), JSON.stringify(r2 && r2.effects));
  assert.ok(r2.causes.some((c) => c.includes('平行世界設定')));
  assert.ok(!a.events.some((x) => x.type === 'regime' && x.parent === r2.id));
});
test('如果：阻止宣戰 → 那個月沒有這場戰爭', () => {
  const e = story(); const w = e.world;
  const war = findEv(w, (x) => x.type === 'war' && x.warPair);
  const a = e.whatIf(war.id, 'block').world;
  const [A, D] = war.warPair;
  assert.ok(!a.wars.some((x) => x.attackers[0] === A && x.defenders[0] === D && x.start.y === war.y && x.start.m === war.m));
  assert.ok(a.events.some((x) => x.type === 'whatif' && x.countries.includes(A)));
});
test('如果：玩家先前的決策會在平行世界依同樣時間重播', () => {
  const e = make({ seed: '', intervention: 'none' });
  e.advance(15);
  const pid = ['education', 'agri_invest', 'industrialize', 'research', 'anticorruption', 'welfare'].find((p) => e.applyPolicy('CHN', p).ok);
  assert.ok(pid, '至少一項政策可以執行'); assert.strictEqual(e.world.commandLog.length, 1);
  e.advance(225);
  const w = e.world;
  const war = w.events.filter((x) => x.type === 'war' && x.warPair && x.y >= 1913).pop() || w.events.filter((x) => WS.WhatIf.options(w, x).length && x.y >= 1913).pop();
  const opt = WS.WhatIf.options(w, war)[0];
  const a = e.whatIf(war.id, opt.key).world;
  assert.deepStrictEqual(a.commandLog.slice(0, w.commandLog.length).map((c) => c.tick + c.cmd + c.args), w.commandLog.map((c) => c.tick + c.cmd + c.args));
  assert.strictEqual(before(a, opt.target.tick), before(w, opt.target.tick));
});
test('如果：載入存檔後沒有快照時，用世界建立設定重新生成，結果相同', () => {
  const e = story();
  const e2 = new WS.WorldEngine(); e2.load(e.serialize());
  const id = findEv(e.world, (x) => x.defId === 'wuchang').id;
  const a = e.whatIf(id, 'block'), b = e2.whatIf(id, 'block');
  assert.ok(b.ok && b.report.from.includes('世界建立'));
  assert.strictEqual(JSON.stringify(a.world.series), JSON.stringify(b.world.series));
});
test('如果：比較報告只引用兩條世界線的實際數值', () => {
  const e = story(); const w = e.world;
  const rev = findEv(w, (x) => x.defId === 'revolution' && x.countries[0] === 'CHN');
  const r = e.whatIf(rev.id, 'fail'); const R = r.report;
  const row = R.rows.find((x) => x.id === 'CHN');
  assert.strictEqual(row.orig.gdp, w.countries.CHN.econ.gdp);
  assert.strictEqual(row.alt.gdp, r.world.countries.CHN.econ.gdp);
  assert.strictEqual(R.chain[0].kind, 'start');
  for (const c of R.chain.slice(1)) {
    const src = c.side === 'orig' ? w : r.world;
    assert.ok(src.events.some((x) => x.id === c.eventId && x.title === c.title), c.title);
  }
  // 因果帳差距 = 兩條世界線各自的累計
  for (const f of R.reasons.CHN.gdp) assert.ok(Math.abs(f.alt - f.orig - f.diff) < 1e-9);
});
test('如果：在平行世界裡再「如果」一次，前一次的改寫仍然保留', () => {
  const e = story();
  const wu = findEv(e.world, (x) => x.defId === 'wuchang');
  const r = e.whatIf(wu.id, 'block');
  e.load(r.world); e.snapshots = r.snapshots;
  const later = e.world.events.filter((x) => x.y >= 1914 && WS.WhatIf.options(e.world, x).length && x.type !== 'whatif')[0];
  assert.ok(later, '平行世界中要有可改寫的後續事件');
  const r2 = e.whatIf(later.id, WS.WhatIf.options(e.world, later)[0].key);
  assert.ok(r2.report.applied);
  assert.ok(r2.world.events.some((x) => x.title === '如果「武昌起義」沒有發生'));
  assert.strictEqual(r2.world.overrides.filter((o) => o.applied).length, 2);
});
test('如果：舊存檔（沒有指令紀錄）可以載入並補上欄位', () => {
  const e = make(); e.advance(24);
  const obj = JSON.parse(e.serialize());
  delete obj.commandLog; delete obj.overrides; delete obj.genesis; delete obj.startMonth;
  obj.playerLog = [{ y: 1911, m: 6, country: 'CHN', policy: 'education' }];
  const w = WS.Save.migrate(obj);
  assert.strictEqual(w.startMonth, 1); assert.deepStrictEqual(w.overrides, []);
  assert.strictEqual(w.commandLog[0].tick, 5);
});

// ---------- 歷史回測 ----------
test('回測：對照資料涵蓋所有起點國家，年份與數值合理', () => {
  const ref = WS.Data.reference['1911'];
  const ids = WS.Data.scenarios['1911'].countries.map((c) => c.id).sort();
  assert.deepStrictEqual(Object.keys(ref.countries).sort(), ids);
  for (const id of ids) for (const y of ref.years) assert.ok(ref.countries[id].pop[y] > 0, `${id} ${y}`);
});
test('回測：同種子結果相同，且回測不改寫史實資料', () => {
  const before = JSON.stringify(WS.Data.reference['1911']);
  const a = WS.Backtest.runOne({ seed: 'bt-test', mode: 'ai', endYear: 1913 });
  const b = WS.Backtest.runOne({ seed: 'bt-test', mode: 'ai', endYear: 1913 });
  assert.deepStrictEqual(a.points, b.points);
  assert.ok(a.points.CHN[1913].pop > 0 && a.ledger.CHN[1910].births > 0);
  assert.strictEqual(JSON.stringify(WS.Data.reference['1911']), before);
});
test('回測：史實政策重播經由引擎指令執行並寫入指令紀錄', () => {
  const r = WS.Backtest.runOne({ seed: 'bt-test', mode: 'replay', endYear: 1913 });
  assert.ok(r.policies.length >= 3);
  assert.ok(r.policies.some((p) => p.ok));
  assert.ok(r.policies.every((p) => p.ok || p.reason));
});
test('回測：報表列出每個國家與人口變化來源', () => {
  const res = WS.Backtest.run({ seeds: ['bt-test'], mode: 'ai', endYear: 1913 });
  const md = WS.Backtest.toMarkdown([res]);
  for (const c of WS.Data.scenarios['1911'].countries) assert.ok(md.includes('### ' + c.name), c.name);
  assert.ok(md.includes('出生率') && md.includes('1913'));
});

// ---------- 輸出 ----------
let fail = 0;
for (const r of results) { console.log(`${r[0]} ${r[1]}（${r[2]} ms）${r[3] ? '\n    → ' + r[3] : ''}`); if (r[0] === '✘') fail++; }
console.log(`\n${results.length - fail} / ${results.length} 通過`);
process.exit(fail ? 1 : 0);
