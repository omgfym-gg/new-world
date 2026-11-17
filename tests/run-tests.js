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

test('快照重跑：從快照繼續推進，結果與原世界完全相同（亂數狀態正確保存）', () => {
  const e = make(); e.advance(12 * 12);
  const snap = e.snapshots.find((x) => x.year === 1916);
  const b = new WS.WorldEngine(); b.load(JSON.parse(snap.json));
  while (b.world.tick < e.world.tick) b.step();
  assert.strictEqual(JSON.stringify(b.world.series), JSON.stringify(e.world.series));
});

// ---------- 校準機制（2026-11） ----------
test('人口轉型：已開發國家起點不會卡在下限，生育率會隨時間下降', () => {
  const e = make(); const c = e.world.countries.DEU;
  const f0 = c.demo.fert; e.advance(12 * 40);
  assert.ok(e.world.countries.DEU.demo.fert < f0 * 0.8, `${e.world.countries.DEU.demo.fert} vs ${f0}`);
});
test('醫療擴散：貧窮國家也會引進他國醫療科技，醫療水準上升', () => {
  const e = make(); const h0 = e.world.countries.CHN.demo.health; e.advance(12 * 50);
  const c = e.world.countries.CHN;
  assert.ok(c.demo.health > h0 + 0.1, `${c.demo.health} vs ${h0}`);
  const why = c.causes.years.flatMap((y) => Object.keys((y.data.health) || {}));
  assert.ok(why.some((k) => k.includes('引進他國醫療科技') || k.includes('生活水準')));
});
test('遷移：全世界淨遷移加總為零，且不超過接收國容量', () => {
  const e = make(); e.advance(24);
  const m = WS.util.ids(e.world).reduce((s, id) => s + e.world.countries[id].demo.migration, 0);
  assert.ok(Math.abs(m) < 1e-9, m);
});
test('生產力成長：追趕與知識累積寫入 GDP 因果帳', () => {
  const e = make(); e.advance(14);
  const g = e.world.countries.CHN.causes.years.at(-1).data.gdp;
  const subs = Object.values(g).flatMap((f) => Object.keys(f.sub));
  assert.ok(subs.includes('追趕先進國家') && subs.includes('知識累積'), subs.join(','));
});

test('制度改革：市場化改革逐步推進、寫入原因，政局不穩時停滯', () => {
  const e = make({ intervention: 'none' }); e.advance(1);
  const c = e.world.countries.JPN; c.pol.stability = 70; c.pol.admin = 70;
  const m0 = c.econ.market;
  assert.ok(e.applyPolicy('JPN', 'market_reform').ok);
  assert.ok(c.econ.market - m0 < 0.01, '不會立刻生效');
  for (let i = 0; i < 24; i++) { c.pol.stability = 70; c.pol.admin = 70; WS.Economy.reformStep(c, e.world); }
  assert.ok(c.econ.market > m0 + 0.01, `${c.econ.market} vs ${m0}`);
  assert.ok(c.causes.cur.market && c.causes.cur.market['市場化改革推進']);
  const m1 = c.econ.market; c.pol.stability = 10;
  for (let i = 0; i < 24; i++) WS.Economy.reformStep(c, e.world);
  assert.strictEqual(c.econ.market, m1, '政局不穩時改革停滯');
  assert.strictEqual(e.world.commandLog.at(-1).args[1], 'market_reform');
});
test('制度改革：吸收能力越高，追趕成長越快', () => {
  const e = make(); const w = e.world; const c = w.countries.CHN;
  c.pol.stability = 60; const a = WS.Economy.tfpGrowth(c, w).catch;
  c.econ.market = 1; c.econ.openness = 0.9; const b = WS.Economy.tfpGrowth(c, w).catch;
  assert.ok(b > a * 1.5, `${b} vs ${a}`);
});

// ---------- 神之手 ----------
test('神之手：施展經引擎指令寫入紀錄、扣神力，當下不直接改人口、GDP、穩定度', () => {
  const e = make(); e.advance(12); const w = e.world;
  const c = w.countries.CHN;
  const before = [WS.util.popTotal(c), c.econ.gdp, c.pol.stability, c.demo.health];
  const en = w.divine.energy;
  const r = e.divine('health', 'CHN');
  assert.ok(r.ok, r.reason);
  assert.deepStrictEqual([WS.util.popTotal(c), c.econ.gdp, c.pol.stability, c.demo.health], before);
  assert.strictEqual(w.divine.energy, en - w.params.divine.healthCost);
  const last = w.commandLog[w.commandLog.length - 1];
  assert.deepStrictEqual([last.cmd, last.args[0], last.args[1]], ['divine', 'health', 'CHN']);
  assert.ok(w.events.some((x) => x.type === 'divine' && x.causes[0].includes('玩家使用神之手')));
});
test('神之手：神力不足或重複施展會被拒絕，且不消耗亂數、不寫紀錄', () => {
  const e = make(); const w = e.world;
  assert.ok(e.divine('health', 'CHN').ok);
  const rng = w.rngState, n = w.commandLog.length;
  const r = e.divine('health', 'CHN');
  assert.ok(!r.ok && /衛生援助/.test(r.reason));
  w.divine.energy = 1;
  assert.ok(!e.divine('drought', 'JPN').ok);
  assert.strictEqual(w.rngState, rng); assert.strictEqual(w.commandLog.length, n);
});
test('神之手：衛生援助、旱災、知識分享都寫入因果帳，可用「？」追查', () => {
  const e = make(); const w = e.world;
  w.divine.energy = 100;
  assert.ok(e.divine('health', 'CHN').ok);
  assert.ok(e.divine('drought', 'JPN').ok);
  e.advance(6);
  w.divine.energy = 100;
  const t = WS.Divine.techOptions(w, w.countries.OTT)[0];
  assert.ok(t, '鄂圖曼應有可分享的已知科技');
  assert.ok(e.divine('tech', 'OTT', t).ok);
  e.advance(3);
  const f = (cid, m) => WS.Explain.metric(w, cid, m, 'current').factors.map((x) => x.name).concat(WS.Explain.metric(w, cid, m, 'last').factors.map((x) => x.name));
  assert.ok(f('CHN', 'health').includes('神之手：公共衛生援助'));
  assert.ok(f('JPN', 'food').includes('神之手：局部旱災'));
  const res = WS.Explain.metric(w, 'OTT', 'research', 'current');
  assert.ok(res.factors.some((x) => x.sub.some(([k]) => k === '神之手：知識分享')));
});
test('神之手：領導人候選者只在自然更替時參與競爭，期限到了就淡出', () => {
  const e = make(); const w = e.world;
  const lead = w.countries.USA.leader.name;
  assert.ok(e.divine('leader', 'USA', 'care').ok);
  assert.strictEqual(w.countries.USA.leader.name, lead);
  e.advance(12 * 11);
  const ev = w.events.filter((x) => x.countries.includes('USA') && (x.type === 'leader' || x.type === 'divine'));
  const won = ev.find((x) => x.type === 'leader' && x.causes.some((c) => c.includes('勝出')));
  const faded = ev.find((x) => x.type === 'divine' && /淡出/.test(x.title));
  assert.ok(won || faded, '候選者應該上台或淡出');
  if (won) assert.ok(won.causes[0] && !won.causes[0].includes('神之手'), '更替原因應是自然發生的（選舉、繼承…）');
  assert.ok(!w.countries.USA.divine.candidate);
});
test('神之手：同種子＋同指令重播結果完全相同，「如果？」平行世界也會重播干預', () => {
  const e = make(); e.advance(24);
  e.divine('drought', 'CHN'); e.advance(12); e.divine('leader', 'CHN', 'reform'); e.advance(60);
  const w = e.world;
  const e2 = new WS.WorldEngine(); e2.create(w.genesis);
  let i = 0;
  while (e2.world.tick < w.tick) { while (i < w.commandLog.length && w.commandLog[i].tick <= e2.world.tick) assert.ok(e2.exec(w.commandLog[i++]).ok); e2.step(); }
  assert.strictEqual(e2.serialize(), e.serialize());
  const tgt = w.events.find((x) => x.type === 'historical' || x.type === 'conditional' && x.defId);
  if (tgt) {
    const key = WS.WhatIf.options(w, tgt)[0].key;
    const r = e.whatIf(tgt.id, key);
    assert.ok(r.ok && r.report.failed.length === 0);
    assert.ok(r.world.commandLog.filter((c) => c.cmd === 'divine').length === 2);
  }
});
test('領導人性格：只改變 AI 的政策評分，係數集中在參數表', () => {
  const e = make(); const w = e.world; const c = w.countries.CHN;
  c.leader.reform = 0.9; c.leader.care = 0.9;
  assert.ok(Math.abs(WS.Agents.leaderLean(c, w, 'political_reform') - 0.4 * 0.6) < 1e-9);
  assert.ok(WS.Agents.leaderLean(c, w, 'welfare') > 0);
  delete c.leader.care;
  assert.strictEqual(WS.Agents.leaderLean(c, w, 'welfare'), 0);
});
// ---------- 世界頭條 ----------
test('世界頭條：每年最多 3 則，只引用實際事件與因果帳', () => {
  const e = make(); e.advance(240); const w = e.world;
  const by = {};
  for (const h of w.headlines) by[h.year] = (by[h.year] || 0) + 1;
  assert.ok(w.headlines.length > 0);
  assert.ok(Object.values(by).every((n) => n <= w.params.divine.headlinesPerYear));
  assert.ok(Object.keys(by).length < 20, '不是每年都有頭條');
  for (const h of w.headlines) {
    if (h.eventId) { const ev = w.events.find((x) => x.id === h.eventId); assert.ok(ev && ev.y === h.year && ev.title === h.title); }
    else {
      assert.ok(h.metric && h.cid);
      const m = WS.Explain.metric(w, h.cid, h.metric, 'y' + h.year);
      assert.strictEqual(m.label, h.year + ' 年');
    }
  }
});
test('舊存檔沒有神之手與頭條欄位，載入時補上', () => {
  const e = make(); const o = JSON.parse(e.serialize()); delete o.divine; delete o.headlines;
  const e2 = new WS.WorldEngine(); e2.load(o);
  assert.ok(e2.world.divine.energy > 0 && Array.isArray(e2.world.headlines));
  e2.advance(13);
});
test('健康檢查：動亂疲乏讓長期不穩的國家有機會恢復，並寫入原因', () => {
  const e = make(); const c = e.world.countries.CHN;
  c.pol.turmoil = 20; c.pol.stability = 20; c.pol.conflict = 80;
  e.advance(12);
  const st = c.causes.years.at(-1).data.stability, cf = c.causes.years.at(-1).data.conflict;
  assert.ok(st['長期動亂後社會渴望秩序'].v > 0 && cf['長期動亂後的厭戰情緒'].v < 0);
});
test('健康檢查：報表列出每一項檢查與各世界線總量', () => {
  const h = WS.Backtest.health({ seeds: ['hc-test'], endYear: 1920 });
  const md = WS.Backtest.healthMarkdown(h);
  for (const k in WS.Backtest.HEALTH_NAMES) assert.ok(md.includes(WS.Backtest.HEALTH_NAMES[k]), k);
  assert.ok(h.runs[0].popX > 0 && h.runs[0].gdpX > 0);
});

test('戰況紀錄：每場戰爭每月記下分數、兵力與傷亡，供戰場畫面回放', () => {
  const e = make({ mode: 'global', seed: 'unit' }); e.advance(120);
  const wars = e.world.wars;
  assert.ok(wars.length > 0, '十年內應該有戰爭');
  for (const war of wars) {
    assert.ok(Array.isArray(war.track) && war.track.length >= 1);
    assert.ok(war.track.length <= 241);
    const last = war.track[war.track.length - 1];
    for (const k of ['y', 'm', 's', 'pa', 'pd', 'ca', 'cd']) assert.ok(typeof last[k] === 'number', k);
    for (let i = 1; i < war.track.length; i++) assert.ok(war.track[i].ca >= war.track[i - 1].ca - 1e-9, '累計傷亡不會變少');
  }
});
test('戰況紀錄不影響模擬結果（拿掉紀錄後世界相同）', () => {
  const a = make({ mode: 'global', seed: 'trk' }); a.advance(240);
  WS = load();
  WS.Military.track = function () {};
  const b = make({ mode: 'global', seed: 'trk' }); b.advance(240);
  const strip = (w) => { const c = JSON.parse(JSON.stringify(w)); for (const x of c.wars) delete x.track; return JSON.stringify(c); };
  assert.strictEqual(strip(a.world), strip(b.world));
});

// ---------- 輸出 ----------
let fail = 0;
for (const r of results) { console.log(`${r[0]} ${r[1]}（${r[2]} ms）${r[3] ? '\n    → ' + r[3] : ''}`); if (r[0] === '✘') fail++; }
console.log(`\n${results.length - fail} / ${results.length} 通過`);
process.exit(fail ? 1 : 0);
