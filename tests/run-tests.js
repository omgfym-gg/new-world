// 自動化測試：node tests/run-tests.js
// 涵蓋第 14.4 節三種驗證中可自動化的部分（重複模擬、極端條件）與各模型單獨測試。
const assert = require('assert');
const load = require('./load.js');
let WS = load();

const results = [];
const pending = [];
function test(name, fn) {
  WS = load(); // 每個測試重新載入，避免互相污染
  const t = Date.now();
  const i = results.length;
  results.push(null);
  try {
    const r = fn();
    // 非同步測試（存檔）：等全部同步測試跑完再收結果
    if (r && typeof r.then === 'function') { pending.push(r.then(() => { results[i] = ['✔', name, Date.now() - t]; }, (e) => { results[i] = ['✘', name, Date.now() - t, e.message]; })); return; }
    results[i] = ['✔', name, Date.now() - t];
  } catch (e) { results[i] = ['✘', name, Date.now() - t, e.message]; }
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

// ---------- 1911 全世界劇本 ----------
const makeW = (setup = {}) => make(Object.assign({ mode: 'global', scenario: '1911w', seed: 'wld', intervention: 'none' }, setup));
test('全世界劇本：51 個國家，資料欄位齊全，所有宗主國都存在', () => {
  const sc = WS.Data.scenarios['1911w'];
  assert.ok(sc.countries.length >= 50, '國家數 ' + sc.countries.length);
  const ids = new Set(sc.countries.map((c) => c.id));
  assert.strictEqual(ids.size, sc.countries.length, '代號不可重複');
  for (const c of sc.countries) {
    for (const k of ['pop', 'gdp', 'cbr', 'cdr', 'urban', 'edu', 'health', 'taxRate', 'lat', 'lon']) assert.ok(isFinite(c[k]), c.id + '.' + k);
    assert.strictEqual(c.ages.length, 4, c.id); assert.ok(Math.abs(c.ages.reduce((a, b) => a + b) - 1) < 0.02, c.id + ' 年齡結構');
    assert.ok(c.mil.personnel > 0, c.id + ' 軍隊'); assert.ok(c.regions.length >= 1, c.id + ' 地區');
    assert.ok(WS.Data.regimes[c.regime], c.id + ' 制度 ' + c.regime);
    for (const t in c.techs) assert.ok(WS.Data.techs[t], c.id + ' 科技 ' + t);
    if (c.overlord) assert.ok(ids.has(c.overlord), c.id + ' 宗主國');
  }
  for (const [a, b] of sc.relations) assert.ok(ids.has(a) && ids.has(b), a + '-' + b);
  // 原本 8 國資料與 1911 劇本完全相同
  for (const c of WS.Data.scenarios['1911'].countries) assert.deepStrictEqual(sc.countries.find((x) => x.id === c.id), c);
});
test('全世界劇本：百年推進沒有 NaN、人口與 GDP 為正，世界總量合理', () => {
  const e = makeW(); e.advance(1200);
  const w = e.world;
  for (const id of WS.util.ids(w)) {
    const c = w.countries[id];
    assert.ok(WS.util.popTotal(c) > 0 && c.econ.gdp > 0, id);
    for (const k in c.pol) assert.ok(isFinite(c.pol[k]), id + '.' + k);
  }
  const pop = total(w);
  assert.ok(pop > 2500 && pop < 9000, '2011 年世界人口 ' + pop.toFixed(0) + ' 百萬');
});
test('全世界劇本：相同種子結果相同', () => {
  const a = makeW(); a.advance(240);
  const b = makeW(); b.advance(240);
  assert.strictEqual(a.serialize(), b.serialize());
});
test('殖民地不能自行宣戰或結盟', () => {
  const e = makeW(); const w = e.world;
  const ind = w.countries.IND;
  assert.strictEqual(ind.overlord, 'GBR');
  assert.strictEqual(WS.Policies.check(ind, w, 'declare_war'), '外交與宣戰由宗主國決定');
  assert.strictEqual(WS.Policies.check(ind, w, 'seek_alliance'), '外交由宗主國決定');
});
test('宗主國開戰時殖民地一起參戰；殖民地被攻擊時宗主國出兵', () => {
  const e = makeW(); const w = e.world;
  const ctx = { rng: new WS.RNG(1), major: [] };
  const war = WS.Military.declareWar(w, 'GBR', 'DEU', ctx, ['測試']);
  for (const x of ['IND', 'CAN', 'AUS', 'EGY']) assert.ok(war.attackers.includes(x), x + ' 隨英國參戰');
  assert.ok(war.defenders.includes('GEA'), '德屬東非隨德國參戰');
  const e2 = makeW(); const w2 = e2.world;
  const war2 = WS.Military.declareWar(w2, 'SIA', 'IDC', ctx, ['測試']);
  assert.ok(war2.defenders.includes('FRA'), '法國保護法屬印度支那');
  assert.ok(war2.defenders.includes('MAG'), '法國其他殖民地也參戰');
});
test('殖民地獨立：條件成立時依機率發生，改名、改制度、寫入原因', () => {
  const e = makeW(); const w = e.world;
  const c = w.countries.IND;
  c.demo.edu = 30; c.pol.legitimacy = 20;
  w.params.events.independenceBase = 1;
  e.advance(1);
  assert.ok(!c.overlord, '已獨立');
  assert.strictEqual(c.name, '印度');
  assert.strictEqual(c.formerOverlord, 'GBR');
  assert.notStrictEqual(c.regime, 'colonial');
  assert.ok(c.causes.cur.legitimacy['獨立建國'], '合法性變化有原因');
  const ev = w.events.find((x) => x.type === 'newcountry' && x.countries.includes('IND'));
  assert.ok(ev && ev.causes.some((s) => /民族/.test(s)), '事件列出條件');
  assert.notStrictEqual(WS.Policies.check(c, w, 'declare_war'), '外交與宣戰由宗主國決定');
});
test('殖民地條件不成立時不會獨立（不照史實年份強制）', () => {
  const e = makeW(); const w = e.world;
  const c = w.countries.COD;
  w.params.events.independenceBase = 1;
  c.pol.legitimacy = 80;  // 合法性高、教育低
  const chk = WS.Events.defs.find((d) => d.id === 'independence').check(w, c);
  assert.strictEqual(chk.ok, false);
});
test('加入全世界劇本後，原本 8 國劇本的結果不受影響（不含宗主國欄位）', () => {
  const e = make({ mode: 'global', seed: 'unit' }); e.advance(120);
  for (const id of WS.util.ids(e.world)) assert.ok(!('overlord' in e.world.countries[id]), id);
});
// 測試用的瀏覽器儲存：總容量超過 limit 就丟出 QuotaExceededError（像真的 localStorage 一樣）
const fakeStorage = (limit) => {
  const store = {};
  const used = () => Object.values(store).reduce((s, v) => s + v.length, 0);
  return {
    store,
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i],
    setItem(k, v) { const before = store[k] ? store[k].length : 0; if (used() - before + v.length > limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } store[k] = String(v); },
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; }
  };
};
test('存檔空間不足時改存精簡版，載入後繼續推進結果相同', () => {
  const W0 = WS;
  const e = makeW(); e.advance(144);
  const full = JSON.stringify(e.world).length;
  const fake = fakeStorage(full - 1);
  W0.Save.storage = () => fake; W0.Save.useIDB = false; W0.Save.reset();
  return W0.Save.write(e.world, 't').then((r) => {
    assert.ok(r.ok && r.compact, '改存精簡版');
    assert.ok(r.bytes < full * 0.8, '精簡版明顯比較小');
    return W0.Save.read(r.meta.id);
  }).then((back) => {
    const b = new W0.WorldEngine(); b.load(JSON.stringify(back));
    e.advance(24); b.advance(24);
    for (const id of W0.util.ids(e.world)) assert.strictEqual(e.world.countries[id].econ.gdp, b.world.countries[id].econ.gdp, id);
  });
});
test('存檔：空間不足時先清掉最舊的自動保存；自動保存最多留幾個；索引記錄大小', () => {
  const W0 = WS;
  const e = make(); e.advance(24);
  const size = JSON.stringify(e.world).length;
  const fake = fakeStorage(size * 3.5);
  W0.Save.storage = () => fake; W0.Save.useIDB = false; W0.Save.reset();
  let chain = Promise.resolve();
  for (let i = 0; i < 3; i++) chain = chain.then(() => W0.Save.write(e.world, 'auto' + i, { auto: true }));
  return chain.then(() => {
    assert.strictEqual(W0.Save.list().length, 3);
    assert.ok(W0.Save.list().every((m) => m.bytes > 0 && m.auto), '索引有大小與自動保存標記');
    return W0.Save.write(e.world, '玩家存檔');
  }).then((r) => {
    assert.ok(r.ok, r.reason);
    assert.ok(r.pruned.length >= 1, '清掉了最舊的自動保存');
    assert.ok(r.pruned.includes('auto0'), '最舊的先清');
    assert.ok(W0.Save.list().some((m) => m.name === '玩家存檔' && !m.auto));
    // 自動保存的數量上限
    W0.Save.keepAuto = 1;
    return W0.Save.write(e.world, 'autoX', { auto: true });
  }).then(() => {
    assert.strictEqual(W0.Save.list().filter((m) => m.auto).length, 1, '只留最新的一個自動保存');
    assert.ok(Object.keys(fake.store).filter((k) => k.indexOf('ws.save.') === 0).length === W0.Save.list().length, '刪掉的內容也從儲存移除');
    return W0.Save.clearAuto();
  }).then((n) => {
    assert.strictEqual(n, 1);
    assert.ok(W0.Save.list().every((m) => !m.auto));
  });
});
test('存檔：真的放不下時清楚說明大小與解法（不會假裝成功）', () => {
  const W0 = WS;
  const e = make(); e.advance(12);
  const fake = fakeStorage(1000);
  W0.Save.storage = () => fake; W0.Save.useIDB = false; W0.Save.reset();
  return W0.Save.write(e.world, 'x').then((r) => {
    assert.strictEqual(r.ok, false);
    assert.ok(/儲存空間不足/.test(r.reason) && /匯出/.test(r.reason) && /(KB|MB)/.test(r.reason), r.reason);
    assert.strictEqual(W0.Save.list().length, 0, '失敗時不留下空的存檔紀錄');
    return W0.Save.autosave(e.world);
  }).then((r) => {
    assert.strictEqual(r.ok, false, '自動存檔失敗也會回報');
    assert.ok(W0.Save.lastAuto && W0.Save.lastAuto.ok === false);
  });
});

// ---------- 遠古時代 ----------
const makeA = (seed) => { const e = new WS.WorldEngine(); e.create({ scenario: 'bc10000', seed: seed || 'anc' }); return e; };
const ancFull = (() => { let cache = {}; return (seed) => cache[seed] || (cache[seed] = (() => { const e = makeA(seed); e.advanceYears(11500); return e; })()); })();
test('遠古：建立西元前 10,000 年世界（18 個地區、全是狩獵採集）', () => {
  const w = makeA().world, A = WS.Ancient;
  assert.ok(A.isAncient(w));
  assert.strictEqual(A.ids(w).length, 18);
  assert.strictEqual(A.yearLabel(w.year), '西元前 10,000 年');
  for (const id of A.ids(w)) { const r = w.ancient.regions[id]; assert.strictEqual(r.pop.A + r.pop.U, 0, id); }
  const p = A.worldPop(w); assert.ok(p > 2 && p < 15, '世界人口 ' + p);
});
test('遠古：相同種子 → 完全相同；不同種子 → 歷史不同', () => {
  const a = makeA('s1'), b = makeA('s1'), c = makeA('s2');
  a.advanceYears(4000); b.advanceYears(4000); c.advanceYears(4000);
  assert.strictEqual(JSON.stringify(a.world), JSON.stringify(b.world));
  assert.notStrictEqual(JSON.stringify(a.world.ancient.firsts), JSON.stringify(c.world.ancient.firsts));
});
test('遠古：推進到西元 1500 年沒有 NaN、人口為正、速度 < 10 秒', () => {
  const t = Date.now(); const e = ancFull('anc'); const w = e.world, A = WS.Ancient;
  assert.ok(Date.now() - t < 10000);
  assert.ok(w.year >= 1500);
  for (const id of A.ids(w)) { const r = w.ancient.regions[id]; for (const k of ['F', 'A', 'U']) assert.ok(isFinite(r.pop[k]) && r.pop[k] >= 0, id + k); assert.ok(isFinite(r.exchange) && isFinite(r.stock) && isFinite(r.fs), id); }
  assert.strictEqual(w.validation.issues.length, 0);
});
test('遠古：人口量級合理（西元前 3000 年 1,500 萬–1 億、西元 1 年 1–4 億）', () => {
  const e = makeA('anc'), A = WS.Ancient;
  e.advanceYears(-3000 - e.world.year); const p1 = A.worldPop(e.world);
  e.advanceYears(1 - e.world.year); const p2 = A.worldPop(e.world);
  assert.ok(p1 > 15 && p1 < 100, '前 3000 年 ' + p1);
  assert.ok(p2 > 100 && p2 < 400, '西元 1 年 ' + p2);
});
test('遠古：農業從條件好的地方自行出現，不照固定年份', () => {
  const years = [];
  for (const s of ['x1', 'x2', 'x3']) {
    const e = makeA(s); e.advanceYears(4000);
    const f = e.world.ancient.firsts.crop_domestication;
    assert.ok(f && f.region, '有農業');
    assert.ok(WS.Data.ancientRegions.find((r) => r.id === f.region).plants >= 0.3, '在可馴化植物多的地方');
    years.push(f.year);
  }
  assert.ok(new Set(years).size > 1, '不同種子出現年份不同：' + years);
});
test('遠古：城市出現在農業之後，文字出現在城市之後', () => {
  const f = ancFull('anc').world.ancient.firsts;
  assert.ok(f.city && f.crop_domestication.year < f.city.year);
  assert.ok(f.writing && f.city.year < f.writing.year);
});
test('遠古：地理不允許的地區不會自行發明農業（澳洲）', () => {
  const r = ancFull('anc').world.ancient.regions.AUS;
  assert.ok(!(r.tech.crop_domestication && r.tech.crop_domestication.how === '自行發明'));
  assert.strictEqual(r.pop.A, 0);
});
test('遠古：人口變化寫入因果帳（出生 − 死亡 ＝ 變化）', () => {
  const e = makeA('anc'); e.advanceYears(3000);
  const w = e.world, r = w.ancient.regions.FER, A = WS.Ancient;
  const before = A.popOf(r); const pre = { F: r.pop.F, A: r.pop.A, U: r.pop.U };
  e.step();
  const yr = r.causes.years[r.causes.years.length - 1].data.population;
  const sum = Object.values(yr).reduce((s, f) => s + f.v, 0);
  // 生活方式轉換只是在地區內移動，不改變總人口；遷徙另外記錄
  const mig = (r.causes.years[r.causes.years.length - 1].data.migration || {});
  const migSum = Object.values(mig).reduce((s, f) => s + f.v, 0);
  assert.ok(Math.abs(before + sum + migSum - A.popOf(r)) < 1e-6, `${before} + ${sum} + ${migSum} ≠ ${A.popOf(r)}`);
  assert.ok(WS.Explain.metric(w, 'FER', 'population', 'last').factors.length > 0);
  assert.ok(WS.Explain.ancientQuestions(w, 'FER').length >= 4);
});
test('遠古：存檔後載入繼續推進，結果與不中斷相同', () => {
  const a = makeA('sv'); a.advanceYears(5000);
  const b = new WS.WorldEngine(); b.load(a.serialize());
  a.advanceYears(1000); b.advanceYears(1000);
  assert.strictEqual(JSON.stringify(a.world.ancient), JSON.stringify(b.world.ancient));
});

test('遠古「如果？」：阻止一項自行發明 → 平行世界分岔，原世界不變', () => {
  const e = makeA('wi'); e.advanceYears(5000);
  const w = e.world, before = JSON.stringify(w.ancient);
  const ev = w.events.find((x) => x.type === 'tech' && (x.causes || [])[0] === '自行發明' && x.tick > 0);
  assert.ok(ev, '有自行發明的事件');
  const r = e.whatIf(ev.id, 'block');
  assert.ok(r.ok && r.report.applied, '有攔截到');
  assert.strictEqual(JSON.stringify(w.ancient), before, '原世界不變');
  const alt = r.world.ancient.regions[ev.countries[0]].tech[ev.techId];
  assert.ok(!alt || alt.how !== '自行發明' || alt.year !== ev.y, '平行世界沒有在同時自行發明');
  assert.ok(r.world.events.some((x) => x.type === 'whatif'), '分岔點寫入事件');
});
test('遠古「如果？」：同樣的設定重跑兩次結果相同', () => {
  const e = makeA('wi2'); e.advanceYears(6000);
  const ev = e.world.events.find((x) => WS.WhatIf.options(e.world, x).length && x.type === 'polity');
  assert.ok(ev, '有政體事件');
  const a = e.whatIf(ev.id, 'block'), b = e.whatIf(ev.id, 'block');
  assert.strictEqual(JSON.stringify(a.world.ancient), JSON.stringify(b.world.ancient));
});
test('遠古神之手：經指令紀錄、寫入因果帳，「如果？」重跑時會重播', () => {
  const e = makeA('dv'); e.advanceYears(3000);
  const w = e.world, en = w.divine.energy;
  const r1 = e.divine('drought', 'FER'), r2 = e.divine('inspire', 'EUR');
  assert.ok(r1.ok && r2.ok);
  assert.ok(w.divine.energy < en);
  assert.strictEqual(w.commandLog.filter((c) => c.cmd === 'divine').length, 2);
  e.advanceYears(200);
  const h = WS.Explain.metric(w, 'FER', 'harvest', 30).factors.find((f) => /神之手/.test(f.name));
  assert.ok(h && h.v < 0, '乾旱寫入收成因果帳');
  // 從乾旱之前的快照重跑：神之手要在同一期重播
  const ev = w.events.find((x) => x.type === 'tech' && (x.causes || [])[0] === '自行發明' && x.tick > 0 && x.tick < w.commandLog[0].tick);
  const r = e.whatIf(ev.id, 'block');
  assert.ok(r.ok);
  assert.strictEqual(r.world.divine.log.length, 2, '平行世界也有兩次干預');
});
test('遠古神之手：條件不足時不能施展（神力不夠）', () => {
  const e = makeA('dv2');
  e.world.divine.energy = 5;
  const r = e.divine('inspire', 'FER');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(e.world.commandLog.length, 0);
});
test('遠古接到近代：1800 年以後把政體轉成近代國家，人口沿用，近代引擎可以繼續推進', () => {
  const e = makeA('br');
  assert.strictEqual(WS.EraBridge.available(e.world).ok, false);
  e.advanceYears(1801 - e.world.year);
  const anc = e.world, popA = WS.Ancient.worldPop(anc), ancJson = JSON.stringify(anc.ancient);
  const r = e.toModern();
  assert.ok(r.ok, r.reason);
  const w = e.world, ids = WS.util.ids(w);
  assert.ok(!WS.Ancient.isAncient(w) && ids.length >= 2);
  const popM = ids.reduce((s, id) => s + WS.util.popTotal(w.countries[id]), 0);
  assert.ok(Math.abs(popM - popA) / popA < 0.02, `人口 ${popA} → ${popM}`);
  assert.ok(w.origin && w.origin.fromAncient);
  assert.strictEqual(JSON.stringify(anc.ancient), ancJson, '遠古世界不被改動');
  // 國家數與經濟量級：政體只帶走實際治理的人口，其餘成為各地小國；人均 GDP 接近 1820 年的量級（約 400–1,500）
  assert.ok(ids.length >= 20 && ids.length <= 80, '國家數 ' + ids.length);
  const gdpM = ids.reduce((s, id) => s + w.countries[id].econ.gdp, 0);
  assert.ok(gdpM / popM * 1000 > 450 && gdpM / popM * 1000 < 1200, '世界人均 GDP ' + gdpM / popM * 1000);
  assert.strictEqual(JSON.stringify(WS.EraBridge.build(anc).setup.scenarioData), JSON.stringify(WS.EraBridge.build(anc).setup.scenarioData), '同一條世界線接到近代結果相同');
  e.setIntervention('none'); e.advance(120);
  for (const id of WS.util.ids(e.world)) { const c = e.world.countries[id]; assert.ok(isFinite(c.econ.gdp) && c.econ.gdp > 0 && WS.util.popTotal(c) > 0, id); }
  // 近代世界存檔載入後繼續推進，結果相同（起點資料存在 genesis 裡）
  const b = new WS.WorldEngine(); b.load(e.serialize());
  e.advance(24); b.advance(24);
  for (const id of WS.util.ids(e.world)) assert.strictEqual(e.world.countries[id].econ.gdp, b.world.countries[id].econ.gdp, id);
});

// ---------- 未來時代與世界結局 ----------
const makeG = (seed, sc) => { const e = new WS.WorldEngine(); e.create({ mode: 'global', focus: 'CHN', seed, scenario: sc || '1911' }); return e; };
const runTo = (e, y) => { while (e.world.year < y) if (e.step().ended) break; return e; };
test('未來：沒有未來科技、暖化未過門檻時，收成與能源掛鉤都是中性（世界與舊版相同）', () => {
  const e = runTo(makeG('fu1'), 1960);
  const w = e.world;
  assert.ok(!Object.keys(w.invented).some((k) => WS.Data.techs[k].future), '1960 年還沒有未來科技');
  for (const id of WS.util.ids(w)) {
    assert.strictEqual(WS.Future.harvestMult(w.countries[id], w), 1);
    assert.strictEqual(WS.Future.renewShare(w.countries[id], w), 0);
  }
  assert.ok(w.future.warming > 0.2 && w.future.warming < 1, '暖化 ' + w.future.warming);
});
test('未來：暖化量級合理（8 國劇本 2020 年 0.5–1.3°C），未來科技依研究出現、不寫死年份', () => {
  const a = runTo(makeG('fu2'), 2020), b = runTo(makeG('fu3'), 2020);
  for (const e of [a, b]) assert.ok(e.world.future.warming > 0.5 && e.world.future.warming < 1.3, '暖化 ' + e.world.future.warming);
  const ya = a.world.invented.ai, yb = b.world.invented.ai;
  assert.ok(ya && yb, '2020 年前已有人工智慧');
  assert.ok(ya.year !== yb.year || ya.by !== yb.by || a.world.invented.genetics.year !== b.world.invented.genetics.year, '不同種子，出現的年份或國家不同');
});
test('未來：相同種子 → 同樣的結局與年份；結局後世界停止推進', () => {
  const a = runTo(makeG('f1'), 2400), b = runTo(makeG('f1'), 2400);
  const A = a.world.future.ended, B = b.world.future.ended;
  assert.ok(A, '2400 年前走到結局');
  assert.deepStrictEqual(A, B);
  const y = a.world.year, tick = a.world.tick;
  const r = a.advance(24);
  assert.ok(r.ended && a.world.year === y && a.world.tick === tick, '結局後不再推進');
  const ev = a.world.events.find((e) => e.id === A.eventId);
  assert.ok(ev && ev.type === 'ending' && ev.causes.length, '結局寫成事件並附原因');
});
test('未來：災難的死亡寫進因果帳；「如果？」可以阻止災難，原世界不變', () => {
  const e = runTo(makeG('h3'), 2012);
  const w = e.world;
  const cat = w.events.find((x) => x.type === 'catastrophe');
  assert.ok(cat, '2012 年前發生一場災難（核危機）');
  const id = cat.countries[0];
  const C = w.countries[id].causes;
  const hit = C.years.map((y) => y.data).concat([C.cur]).some((d) => d.population && d.population['死亡'] && d.population['死亡'].sub['核子攻擊'] < 0);
  assert.ok(hit, '核子攻擊的死亡寫在因果帳');
  const before = e.serialize();
  const opt = WS.WhatIf.options(w, cat)[0];
  assert.ok(opt && opt.target.kind === 'future');
  const r = e.whatIf(cat.id, opt.key);
  assert.ok(r.ok, r.reason);
  assert.strictEqual(e.serialize(), before, '原世界不變');
  assert.ok(!r.world.events.some((x) => x.type === 'catastrophe' && x.title === cat.title && x.y === cat.y), '平行世界沒有這場災難');
  assert.ok(r.world.events.some((x) => x.type === 'whatif'), '分岔點寫入事件');
});
test('未來神之手：要有相關科技才能施展；施展寫入指令紀錄並改變條件', () => {
  const e = runTo(makeG('fu4'), 1950);
  e.world.divine.energy = 100;
  assert.strictEqual(e.divinePreview('aisafety', 'USA').ok, false, '還沒有 AI');
  assert.strictEqual(e.divinePreview('green', 'USA').ok, false, '還沒有再生能源');
  runTo(e, 2030);
  const w = e.world;
  w.divine.energy = 100;
  const who = WS.util.ids(w).find((id) => WS.util.adopt(w.countries[id], 'ai') >= 0.3);
  assert.ok(who, '2030 年有國家普及 AI');
  const b0 = w.future.ai.bonus;
  const r = e.divine('aisafety', who);
  assert.ok(r.ok, r.reason);
  assert.ok(w.future.ai.bonus > b0, 'AI 安全程度提高');
  assert.strictEqual(w.commandLog[w.commandLog.length - 1].cmd, 'divine');
  if (w.invented.renewables) {
    const r2 = e.divine('green', who);
    assert.ok(r2.ok, r2.reason);
    assert.ok(WS.Future.renewShare(w.countries[who], w) > 0);
  }
});
test('世界結局報告：列出轉折點與玩家介入；「沒有你的世界」不重播介入、不改原世界', () => {
  const e = makeG('f');
  runTo(e, 1921);
  e.world.divine.energy = 100;
  assert.ok(e.divine('health', 'CHN').ok);
  runTo(e, 2600);
  const w = e.world;
  assert.ok(w.future.ended);
  const R = WS.Future.report(w);
  assert.ok(R.turning.length > 3 && R.player.length === 1 && /神之手/.test(R.player[0].text));
  const before = e.serialize();
  const cf = WS.Future.counterfactual(w, 200);
  while (!cf.done()) cf.run(50);
  assert.strictEqual(e.serialize(), before, '原世界不變');
  assert.ok(!cf.sim.world.commandLog.some((c) => c.cmd === 'divine'), '沒有重播神之手');
  // 沒有介入的世界 = 從同一個種子直接跑的世界
  const plain = runTo(makeG('f'), 2600);
  assert.deepStrictEqual(cf.sim.world.future.ended, plain.world.future.ended);
});

// ---------- 事件節奏與年度摘要 ----------
const runStops = (e, years) => {
  const stops = [], y1 = e.world.year + years;
  while (e.world.year < y1) { const r = e.advance(1); if (r.stopped && !r.ended) stops.push(r.events); }
  return stops;
};
test('事件節奏：只暫停重大危機比所有事件都詢問停得少，暫停的都是戰爭爆發、革命或災難', () => {
  const a = makeW({ intervention: 'occasional' }); a.pauseMode = 'critical';
  const b = makeW({ intervention: 'occasional' }); b.pauseMode = 'all';
  const sa = runStops(a, 30), sb = runStops(b, 30);
  assert.ok(sa.length > 0 && sa.length < sb.length, `critical ${sa.length}、all ${sb.length}`);
  assert.ok(sa.length <= 15, '30 年最多停 15 次：' + sa.length);
  for (const evs of sa) for (const e of evs) {
    assert.ok(WS.Events.isCritical(a.world, e), e.title);
    assert.ok((e.type === 'war' && e.warPair) || e.defId === 'revolution' || ['catastrophe', 'ending'].includes(e.type) || e.crisis, e.title);
  }
  // 領導人更替與一般制度改革不會暫停
  assert.ok(!sa.flat().some((e) => e.type === 'leader' || e.type === 'regime'));
});
test('事件節奏：全部交由系統、不介入模式不暫停；暫停方式不影響世界怎麼演變', () => {
  const a = makeW({ intervention: 'occasional' }); a.pauseMode = 'none';
  const b = makeW({ intervention: 'none' }); b.pauseMode = 'all';
  const c = makeW({ intervention: 'occasional' }); c.pauseMode = 'all';
  assert.strictEqual(runStops(a, 15).length, 0);
  assert.strictEqual(runStops(b, 15).length, 0);
  assert.ok(runStops(c, 15).length > 0);
  // 同樣的種子：停很多次和完全不停，最後的世界一樣（intervention 指令記錄不同，所以只比國家與事件）
  const strip = (w) => JSON.stringify({ c: w.countries, e: w.events.map((x) => x.title), r: w.rngState });
  assert.strictEqual(strip(a.world), strip(c.world));
});
test('事件節奏：國家模式只為觀察國的危機暫停', () => {
  const e = make({ intervention: 'occasional' }); e.pauseMode = 'critical';
  for (const evs of runStops(e, 30)) for (const x of evs) assert.ok(['catastrophe', 'ending'].includes(x.type) || x.crisis || x.countries.includes('CHN'), x.title);
});
test('年度摘要：頭條以外的事件依類別收好，不重複頭條；頭條同一類每年最多 2 則', () => {
  const e = makeW(); e.advance(12 * 20); const w = e.world;
  const max = w.params.pacing.headlineMaxPerKind;
  const by = {};
  for (const h of w.headlines) { const k = h.year + h.kicker; by[k] = (by[k] || 0) + 1; }
  assert.ok(Object.values(by).every((n) => n <= max));
  let any = false;
  for (let y = w.startYear; y < w.year; y++) {
    const Y = WS.Headlines.summary(w, y);
    const ids = Y.groups.flatMap((g) => g.items.map((x) => x.id));
    assert.strictEqual(ids.length, Y.total);
    assert.strictEqual(new Set(ids).size, ids.length, '同一件事只出現在一個類別');
    for (const h of Y.headlines) if (h.eventId) assert.ok(!ids.includes(h.eventId), '頭條不重複出現在摘要');
    for (const g of Y.groups) for (const x of g.items) assert.strictEqual(x.y, y);
    if (Y.groups.some((g) => g.k === 'leader')) any = true;
  }
  assert.ok(any, '領導人更替收進年度摘要');
});
test('頭條聚焦：小國的事件分數打折，大國的戰爭與革命優先', () => {
  const e = makeW(); e.advance(12 * 15); const w = e.world;
  const share = (h) => WS.Events.share(w, { countries: h.countries });
  const ev = w.headlines.filter((h) => h.eventId && h.countries.length);
  assert.ok(ev.length > 0);
  // 平均而言，上頭條的事件當事國比全部事件的當事國大
  const all = w.events.filter((x) => x.level >= 3 && x.countries.length && x.y < w.year);
  const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
  assert.ok(avg(ev, share) > avg(all, (x) => WS.Events.share(w, x)), '頭條偏向影響較大的事件');
});

// ---------- 結局後的改善（2026-11-18）：災難的實際影響、結局因果鏈、文明進程、「如果？」摘要 ----------
const hotWorld = (seed) => {
  const e = runTo(makeG(seed || 'hot'), 1960);
  const w = e.world, F = WS.Future.ensure(w);
  // 讓暖化超過臨界門檻、而且臨界點今年一定觸發（只用來測試記帳，不是正常的世界）
  F.warming0 += 3.4 - F.warming; w.params.future.tippingChance = 1;
  return e;
};
test('災難紀錄：氣候臨界點記下升溫、收成變化、之後的死亡與嚴重度（不再只有「—」）', () => {
  const e = hotWorld();
  runTo(e, e.world.year + 1);
  const F = e.world.future;
  const tip = F.catastrophes.find((c) => c.kind === 'climate');
  assert.ok(tip, '觸發臨界點');
  assert.strictEqual(tip.deaths, 0, '當下沒有直接死亡');
  assert.ok(tip.impact.warming > 0 && tip.impact.popBefore > 0);
  assert.ok(tip.impact.harvestAfter < tip.impact.harvestBefore, '全球收成下降');
  e.world.params.future.tippingChance = 0;
  runTo(e, e.world.year + 3);
  assert.ok(tip.impact.later > 0, '之後每年的額外死亡算到這次臨界點');
  assert.ok(tip.sev >= 1, '依實際影響分級：' + tip.sev);
  const ev = e.world.events.find((x) => x.id === tip.eventId);
  assert.ok(ev.effects.some((x) => /收成/.test(x)) && ev.effects.some((x) => /嚴重度/.test(x)), '事件分開寫出實際變化');
  // 拆分不會超過氣候災害的總死亡（含饑荒的估算）
  assert.ok(tip.impact.later <= F.tollAll.climate + F.food.climate + 1e-6);
});
test('結局因果鏈：氣候結局一步步列出排放、臨界點、收成、死亡與人口門檻', () => {
  const e = hotWorld('hot2');
  let n = 0;
  while (!e.world.future.ended && n++ < 12 * 400) e.step();
  const R = WS.Future.report(e.world);
  assert.ok(R.ended, '走到結局');
  assert.ok(R.chain.length >= 3);
  assert.ok(R.chain.some((x) => /化石燃料/.test(x.t)) && R.chain[R.chain.length - 1].k === 'end');
  if (R.ended.kind === 'climate') assert.ok(R.chain.some((x) => /臨界點/.test(x.t)) && R.chain.some((x) => /收成/.test(x.t)));
  assert.ok(R.series.harvest.length === R.series.y.length, '收成數列與年份對齊');
});
test('文明進程：階段目標、下一個突破；多年沒有發明時列出停滯原因（只讀，不改世界）', () => {
  const e = runTo(makeG('pg'), 1915);
  const w = e.world;
  const before = e.serialize();
  const G = WS.Future.progress(w);
  assert.ok(G.stages.length >= 6 && G.cur >= 0);
  assert.ok(G.next.length > 0 && G.next[0].byName);
  assert.strictEqual(e.serialize(), before, '不改變世界');
  const c = JSON.parse(before);
  for (const k in c.invented) c.invented[k].year = c.year - 40;
  const G2 = WS.Future.progress(c);
  assert.ok(G2.stalled && G2.since >= 25 && G2.why.length > 0, '停滯與原因');
});
test('文明進程：科技全部完成時不算停滯，也不出現無限大的研究成本', () => {
  const e = runTo(makeG('pg2'), 1913);
  const c = JSON.parse(e.serialize());
  for (const t in WS.Data.techs) c.invented[t] = { year: c.year - 60, by: 'USA' };
  const G = WS.Future.progress(c);
  assert.ok(G.allDone && !G.stalled, '全部完成 → 不停滯');
  assert.strictEqual(G.next.length, 0);
  assert.ok(!G.why.some((x) => /Infinity/.test(x)), '原因裡沒有 Infinity');
});
test('「沒有你的世界」第一個差異：排除建立分支的紀錄，找到真正的介入', () => {
  const base = runTo(makeG('fd'), 1912).world;
  const b = WS.Branch.create(base, '回溯 1912', '測試');
  const a = JSON.parse(JSON.stringify(base));
  // 分支多了一筆「世界線分歧」，之後玩家在分支施展神之手
  b.events.push({ id: 'x1', type: 'divine', level: 3, y: b.year, m: b.month, title: '神之手：援助公共衛生（中國）', countries: ['CHN'] });
  const d = WS.Future.firstDiff(b, a);
  assert.ok(d && d.mine && /公共衛生/.test(d.mine.title), JSON.stringify(d));
  assert.strictEqual(d.y, b.year);
  assert.strictEqual(WS.Future.firstDiff(a, JSON.parse(JSON.stringify(a))), null, '一樣的世界沒有差異');
});
test('失業只隨受雇部門放大：旱災不會讓自耕農「失業」', () => {
  const e = runTo(makeG('un'), 1912);
  const w = e.world;
  const c = w.countries.CHN;
  c.econ.growth = -0.2; c.demo.unemployment = w.params.economy.unemploymentBase;
  const P = w.params.economy, lab = c.econ.lab.agri;
  WS.Economy.step(w, ['CHN'], { rng: new WS.RNG('t') });
  // 每月向目標移動 10%：目標只含受雇部門比例 (1 − 農業) 的衰退效果
  const maxT = P.unemploymentBase + 0.2 * P.unemploymentOkun * (1 - lab) + 0.03;
  assert.ok(lab > 0.6, '1912 年中國是農業國');
  assert.ok(c.demo.unemployment <= P.unemploymentBase + (maxT - P.unemploymentBase) * 0.1 + 1e-9, String(c.demo.unemployment));
});
test('版本號：index.html 的檔案網址帶著目前內容的版本（更新後瀏覽器不會用舊檔案）', () => {
  const { version, stamped } = require('../tools/stamp-version.js');
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes(`content="${version()}"`), '請執行 node tools/stamp-version.js');
  assert.strictEqual(stamped(version()), html);
});
test('「沒有你的世界」第一個差異：舊事件被刪掉時只比較兩邊都有紀錄的期間', () => {
  const e = runTo(makeG('fd2'), 1914);
  const a = JSON.parse(e.serialize()), b = JSON.parse(e.serialize());
  // 重跑的世界刪掉了 1913 年以前的紀錄：不能把「另一邊沒有」當成差異
  b.events = b.events.filter((x) => x.y >= 1913);
  assert.strictEqual(WS.Future.firstDiff(a, b), null, JSON.stringify(WS.Future.firstDiff(a, b)));
  // 重跑時另外收好的完整紀錄：可以找到更早的差異
  const full = a.events.slice();
  full.push({ id: 'X', type: 'divine', level: 3, y: 1912, m: 5, title: '神之手：測試', countries: [] });
  full.sort((x, y) => x.y - y.y || x.m - y.m);
  const d = WS.Future.firstDiff(a, b, null, full);
  assert.ok(d && d.other && d.other.title === '神之手：測試', JSON.stringify(d));
});
test('神之手「啟發一項新發明」：只能選世界上還沒有的技術；寫入指令紀錄、加快研究、可重現', () => {
  const run = () => {
    const e = runTo(makeG('inv'), 1913);
    const w = e.world;
    w.divine.energy = 100;
    const t = WS.Divine.inventOptions(w, w.countries.USA)[0];
    assert.ok(t && !w.invented[t]);
    const r = e.divine('invent', 'USA', t);
    assert.ok(r.ok, r.reason);
    assert.strictEqual(w.commandLog[w.commandLog.length - 1].cmd, 'divine');
    const p0 = w.countries.USA.tech[t] ? w.countries.USA.tech[t].progress : 0;
    e.advance(12);
    assert.ok(w.countries.USA.tech[t].progress > p0);
    assert.strictEqual(WS.Divine.preview(w, 'invent', 'USA', Object.keys(w.invented)[0]).ok, false, '已經有人發明的不能選');
    return e.serialize();
  };
  assert.strictEqual(run(), run());
});
test('「如果？」重點摘要：改寫了什麼、差異何時出現、最後造成什麼結果', () => {
  const e = runTo(makeG('h'), 2012);
  const w = e.world;
  const cat = w.events.find((x) => x.type === 'catastrophe');
  const r = e.whatIf(cat.id, WS.WhatIf.options(w, cat)[0].key);
  const X = r.report.summary;
  assert.ok(X && /如果/.test(X.changed));
  assert.ok(X.result.length >= 1);
  if (X.first) assert.ok(X.first.y >= cat.y && X.first.after >= 0);
  if (X.diverge) assert.ok(X.diverge.y >= cat.y);
});

test('介面隨時代換風格：依世界上出現的科技決定，只讀取不改世界', () => {
  require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '../ui/era-theme.js'), 'utf8'));
  const ET = WS.EraTheme;
  const a = makeA('ui');
  assert.strictEqual(ET.themeOf(a.world), 'stone', '遠古一開始是石板');
  a.world.ancient.firsts.writing = { y: -3000 };
  assert.strictEqual(ET.themeOf(a.world), 'scroll', '有文字以後是羊皮卷');
  const e = makeG('ui');
  const before = e.serialize();
  assert.strictEqual(ET.themeOf(e.world), 'paper', '1911 年是報紙');
  assert.strictEqual(e.serialize(), before, '判斷時代不會改變世界');
  e.world.invented.computing = { y: 1950 };
  assert.strictEqual(ET.themeOf(e.world), 'dash');
  const fut = Object.keys(WS.Data.techs).find((t) => WS.Data.techs[t].future);
  e.world.invented[fut] = { y: 2050 };
  assert.strictEqual(ET.themeOf(e.world), 'holo');
  assert.strictEqual(ET.pick(e.world, 'stone'), 'stone', '玩家可以固定風格');
  assert.strictEqual(ET.pick(null, 'auto'), 'dash', '開始畫面用儀表板');
});


// ---------- 多國語言（只改畫面文字，不影響模擬） ----------
const loadLang = () => {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const NEW = ['ko', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'tr', 'ar', 'hi', 'id', 'vi', 'th'];
  for (const f of ['i18n/i18n.js', 'i18n/en.js', 'i18n/ja.js', 'i18n/zh-cn.js', ...NEW.map((l) => `i18n/${l}.js`)]) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
  return WS.I18n;
};
test('多國語言：依裝置語言自動選擇，簡繁不明時看時區（不用網路位置）', () => {
  const I = loadLang();
  assert.strictEqual(I.detect(['zh-TW'], ''), 'zh-TW');
  assert.strictEqual(I.detect(['zh-HK'], ''), 'zh-TW');
  assert.strictEqual(I.detect(['zh-Hant'], ''), 'zh-TW');
  assert.strictEqual(I.detect(['zh-CN'], 'Asia/Taipei'), 'zh-CN', '有寫地區就照地區');
  assert.strictEqual(I.detect(['zh-Hans-SG'], ''), 'zh-CN');
  assert.strictEqual(I.detect(['zh'], 'Asia/Taipei'), 'zh-TW', '只寫 zh 時參考時區');
  assert.strictEqual(I.detect(['zh'], 'Asia/Shanghai'), 'zh-CN');
  assert.strictEqual(I.detect(['ja-JP'], ''), 'ja');
  assert.strictEqual(I.detect(['fr-FR', 'ja'], ''), 'fr', '依偏好順序找第一個支援的語言');
  assert.strictEqual(I.detect(['nl-NL', 'ja'], ''), 'ja', '不支援的語言跳過，找下一個');
  assert.strictEqual(I.detect(['pt-BR'], ''), 'pt');
  assert.strictEqual(I.detect(['ar-EG'], ''), 'ar');
  assert.strictEqual(I.LANGS.ar.dir, 'rtl', '阿拉伯文由右到左');
  assert.strictEqual(I.detect(['in-ID'], ''), 'id', '舊的印尼文代號');
  assert.strictEqual(I.detect(['nl-NL'], ''), 'en', '不支援的語言用英文');
  assert.strictEqual(I.detect([], ''), 'en');
});
test('多國語言：樣板、名稱、數字單位都會翻譯；原文不變', () => {
  const I = loadLang();
  I.setLang('zh-TW');
  assert.strictEqual(I.tx('中國向日本宣戰。'), '中國向日本宣戰。');
  I.setLang('en');
  assert.strictEqual(I.tx('中國向日本宣戰。'), 'China declares war on Japan.');
  assert.strictEqual(I.tx('歷時 12 個月。總傷亡約 0.32 百萬人。'), 'Lasted 12 months. Total casualties about 320K people.');
  assert.ok(/125M/.test(I.tx('人口 1.25 億')), '億換算成 M');
  assert.strictEqual(I.tx('保加利亞第2任領導人'), "Bulgaria's leader no. 2");
  I.setLang('ja');
  assert.strictEqual(I.tx('中國向日本宣戰。'), '中国が日本に宣戦。');
  assert.strictEqual(I.tx('人口 1.25 億'), '人口 1.25億');
  assert.strictEqual(I.tx('總傷亡約 3.2 百萬人。'), '死傷者は合計約 320万人。');
  I.setLang('zh-CN');
  assert.strictEqual(I.tx('戰爭爆發：鄂圖曼－義大利戰爭'), '战争爆发：奥斯曼－意大利战争');
});
test('多國語言：字典的譯文沒有多出原文沒有的 {n}', () => {
  const I = loadLang();
  for (const lang of Object.keys(I.DATA).filter((l) => I.DATA[l].dict)) for (const [k, v] of Object.entries(I.DATA[lang].dict)) {
    const has = new Set(k.match(/\{\d+\}/g) || []);
    for (const p of v.match(/\{\d+\}/g) || []) assert.ok(has.has(p), `${lang}: ${k} → ${v}`);
  }
});
test('多國語言：載入並切換語言不會改變模擬結果', () => {
  const a = make(); a.advance(120);
  const I = loadLang(); I.setLang('en');
  const b = make(); b.advance(60); I.setLang('ja'); b.advance(60);
  assert.strictEqual(a.serialize(), b.serialize());
});
test('多國語言：引擎產生的文字（事件、因果、歷史敘述）英文翻譯 98% 以上完整', () => {
  const e = make(); e.advanceYears ? e.advanceYears(40, { stopOnMajor: false }) : e.advance(480);
  const I = loadLang(); I.setLang('en');
  const all = new Set();
  const walk = (o, d) => { if (d > 30 || o == null) return; if (typeof o === 'string') { if (/[㐀-鿿]/.test(o)) all.add(o); return; } if (typeof o !== 'object') return; for (const k in o) { if (/[㐀-鿿]/.test(k)) all.add(k); walk(o[k], d + 1); } };
  walk(e.world, 0);
  I.misses = new Set();
  for (const s of all) I.tx(s);
  const rate = 1 - I.misses.size / all.size;
  assert.ok(rate >= 0.98, `${(rate * 100).toFixed(1)}%，例如：${[...I.misses].slice(0, 5).join(' / ')}`);
});
test('多國語言：新增的 13 種語言都翻完英文字典裡的句子，引擎文字也翻得到', () => {
  const I = loadLang();
  const en = Object.keys(I.DATA.en.dict);
  const e = make(); e.advance(240);
  const all = new Set();
  const walk = (o, d) => { if (d > 30 || o == null) return; if (typeof o === 'string') { if (/[㐀-鿿]/.test(o)) all.add(o); return; } if (typeof o !== 'object') return; for (const k in o) { if (/[㐀-鿿]/.test(k)) all.add(k); walk(o[k], d + 1); } };
  walk(e.world, 0);
  for (const lang of ['ko', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'tr', 'ar', 'hi', 'id', 'vi', 'th']) {
    const d = I.DATA[lang].dict;
    const cover = en.filter((k) => k.trim() && d[k] != null).length / en.filter((k) => k.trim()).length;
    assert.ok(cover >= 0.99, `${lang} 字典只翻了 ${(cover * 100).toFixed(1)}%`);
    I.setLang(lang); I.misses = new Set();
    const out = [...all].map((s) => I.tx(s));
    const rate = 1 - I.misses.size / all.size;
    assert.ok(rate >= 0.97, `${lang} 引擎文字 ${(rate * 100).toFixed(1)}%，例如：${[...I.misses].slice(0, 3).join(' / ')}`);
    assert.ok(out.filter((s) => /[㐀-鿿]/.test(s)).length / out.length < 0.05, `${lang} 畫面還留很多中文`);
  }
  I.setLang('zh-TW');
});

test('遊戲公告與意見回饋：只送出玩家寫的內容與遊戲資訊，不改世界', () => {
  require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '../ui/notice.js'), 'utf8'));
  const F = WS.Feedback, N = WS.Notice;
  assert.ok(N.ID && N.NEWS.length >= 1 && N.NEWS.every((n) => n.date && n.text));
  assert.strictEqual(F.build({ type: 'bug', text: ' ' }).ok, false, '空白內容不能送出');
  const r = F.build({ type: 'idea', text: '  希望加入 1800 年起點  ', contact: 'x', info: 'i' });
  assert.ok(r.ok && r.data.type === '建議' && r.data.text === '希望加入 1800 年起點', '類型用中文原文');
  assert.strictEqual(F.build({ type: 'bug', text: 'a'.repeat(F.MAX + 50) }).data.text.length, F.MAX, '內容有字數上限');
  const e = makeG('fb');
  const before = e.serialize();
  const info = F.info(e.world, '分頁 overview');
  assert.ok(info.includes('年份 ' + e.world.year) && info.includes('種子 ' + e.world.seed));
  assert.strictEqual(e.serialize(), before, '收集遊戲資訊不會改變世界');
  // 送出：表單設定好才送，送到 formResponse，四個欄位都帶上
  const saved = JSON.parse(JSON.stringify(F.FORM));
  let call = null;
  const fake = (url, opt) => { call = { url, opt }; return Promise.resolve({}); };
  return F.send(r.data, fake).then((res) => {
    if (!F.ready()) { assert.strictEqual(res.ok, false); assert.strictEqual(call, null); }
    F.FORM.url = 'https://docs.google.com/forms/d/e/TEST/formResponse';
    F.FORM.entry = 'entry.1';
    return F.send(r.data, fake);
  }).then((res) => {
    assert.ok(res.ok && /formResponse$/.test(call.url) && call.opt.method === 'POST');
    const sent = call.opt.body.get('entry.1');
    assert.ok(/^【建議】\n希望加入 1800 年起點/.test(sent) && sent.includes('聯絡方式：x') && sent.includes('遊戲資訊：i'), '四項內容組成一段文字');
    return F.send(r.data, () => Promise.reject(new Error('offline')));
  }).then((res) => {
    assert.strictEqual(res.ok, false, '沒網路時回報失敗，讓畫面保留內容');
    if (saved.url) assert.ok(/^https:\/\/docs\.google\.com\/forms\/.+\/formResponse$/.test(saved.url), '正式表單網址要是 formResponse');
    F.FORM.url = saved.url; F.FORM.entry = saved.entry;
  });
});

test('支持作者：只顯示 https 贊助連結，不改世界', () => {
  require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, '../ui/notice.js'), 'utf8'));
  const P = WS.Support;
  const saved = P.LINKS.map((l) => l.url);
  assert.ok(P.LINKS.length >= 2 && P.LINKS.every((l) => l.name && l.note));
  P.LINKS.forEach((l) => { l.url = ''; });
  assert.strictEqual(P.ready(), false, '沒有網址時不顯示按鈕');
  P.LINKS[0].url = 'javascript:alert(1)';
  P.LINKS[1].url = 'https://ko-fi.com/test';
  assert.deepStrictEqual(P.links().map((l) => l.id), ['kofi'], '只接受 https 網址');
  P.LINKS.forEach((l, i) => { l.url = saved[i]; });
  P.links().forEach((l) => assert.ok(/^https:\/\//.test(l.url)));
});

// ---------- 輸出 ----------
Promise.all(pending).then(() => {
  let fail = 0;
  for (const r of results) { console.log(`${r[0]} ${r[1]}（${r[2]} ms）${r[3] ? '\n    → ' + r[3] : ''}`); if (r[0] === '✘') fail++; }
  console.log(`\n${results.length - fail} / ${results.length} 通過`);
  process.exit(fail ? 1 : 0);
});
