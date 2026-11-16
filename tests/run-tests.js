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

// ---------- 輸出 ----------
let fail = 0;
for (const r of results) { console.log(`${r[0]} ${r[1]}（${r[2]} ms）${r[3] ? '\n    → ' + r[3] : ''}`); if (r[0] === '✘') fail++; }
console.log(`\n${results.length - fail} / ${results.length} 通過`);
process.exit(fail ? 1 : 0);
