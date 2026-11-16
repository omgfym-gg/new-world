// World Engine：共用世界引擎（國家模式與全球模式共用）
// WorldState(t+1) = Simulate(WorldState(t), Rules, Decisions, Events)
// 介面只能透過這裡的指令操作世界，不能直接修改核心數值。
(function (root) {
  const WS = (root.WS = root.WS || {});

  // 第 9.1 節：每期固定 15 步順序
  WS.STEP_ORDER = [
    '1 讀取世界狀態', '2 更新時間', '3 人口', '4 資源與環境', '5 經濟', '6 政治', '7 科技', '8 外交',
    '9 國家自主決策', '10 軍事', '11 事件檢查', '12 更新世界狀態', '13 數值驗證', '14 保存紀錄', '15 歷史敘述'
  ];

  class WorldEngine {
    constructor() { this.w = null; this.snapshots = []; this.lastIssues = []; }

    // ---------- 建立 / 載入 ----------
    create(setup) {
      const conf = WS.Rules.conflicts(Object.assign({}, WS.util.clone(Object.fromEntries(Object.entries(WS.Data.rules).map(([k, d]) => [k, d.default]))), setup.rules || {}));
      if (conf.length) throw new Error('世界規則互相衝突：' + conf.map((c) => c.text).join(' '));
      this.w = WS.State.createWorld(setup);
      this.snapshots = [{ year: this.w.year, month: this.w.month, json: JSON.stringify(this.w) }];
      return this.w;
    }
    load(obj) {
      this.w = WS.Save.migrate(obj);
      this.snapshots = [{ year: this.w.year, month: this.w.month, json: JSON.stringify(this.w) }];
      return this.w;
    }
    serialize() { return JSON.stringify(this.w); }
    get world() { return this.w; }

    // ---------- 單期模擬 ----------
    step() {
      const w = this.w;
      const U = WS.util;
      const ctx = { rng: new WS.RNG(w.rngState), major: [] };
      // 1. 讀取世界狀態
      const ids = U.ids(w);
      const prevPop = {};
      for (const id of ids) prevPop[id] = U.popTotal(w.countries[id]);
      const territoryBefore = Object.values(w.regions).map((r) => r.owner).join();
      // 2. 更新時間
      w.month++;
      if (w.month > 12) { w.month = 1; w.year++; }
      w.tick++;
      // 3–10. 各系統，順序固定
      WS.Population.step(w, ids, ctx);
      WS.Environment.step(w, ids, ctx);
      WS.Economy.step(w, ids, ctx);
      WS.Politics.step(w, ids, ctx);
      WS.Technology.step(w, ids, ctx);
      WS.Diplomacy.step(w, ids, ctx);
      WS.Agents.step(w, ids, ctx);
      WS.Military.step(w, ids, ctx);
      // 11. 事件檢查
      WS.Events.step(w, ids, ctx);
      // 12. 更新世界狀態（衍生值）
      const ids2 = U.ids(w);
      for (const id of ids2) {
        const c = w.countries[id];
        c.econ.gdppc = (c.econ.gdp / U.popTotal(c)) * 1000;
        WS.Military.updatePower(c, w);
        if (U.popTotal(c) < 0.05 || c.regions.length === 0) { c.alive = false; WS.Events.log(w, ctx, { type: 'system', title: `${c.name}不再存在`, countries: [id], level: 3, causes: ['人口或領土已不足以維持政治實體'] }); }
      }
      // 13. 數值驗證
      ctx.territory = territoryBefore !== Object.values(w.regions).map((r) => r.owner).join();
      this.lastIssues = WS.Validation.step(w, ids2, ctx, prevPop);
      // 14. 保存紀錄、15. 歷史敘述（每年一月結算上一年）
      if (w.month === 1) {
        WS.History.finalizeYear(w, ctx);
        if ((w.year - w.startYear) % 5 === 0) {
          this.snapshots.push({ year: w.year, month: w.month, json: JSON.stringify(w) });
          if (this.snapshots.length > 60) this.snapshots.splice(1, 1);
        }
      }
      w.rngState = ctx.rng.s;
      return ctx;
    }

    // 推進 n 個月；偶爾決策模式下遇到重大事件會暫停，讓玩家決定是否介入
    advance(months, opts = {}) {
      const stopOnMajor = opts.stopOnMajor !== false && this.w.intervention === 'occasional';
      for (let i = 0; i < months; i++) {
        const ctx = this.step();
        if (stopOnMajor && ctx.major.length) {
          this.w.pendingDecision = { events: ctx.major.map((e) => e.id), y: this.w.year, m: this.w.month };
          return { advanced: i + 1, stopped: true, events: ctx.major };
        }
      }
      return { advanced: months, stopped: false };
    }
    advanceYears(n, opts) { return this.advance(12 * n, opts); }

    // ---------- 指令 ----------
    evaluate(cid) { return WS.Agents.evaluate(this.w.countries[cid], this.w); }

    applyPolicy(cid, policyId) {
      const c = this.w.countries[cid];
      if (!c) return { ok: false, reason: '沒有這個國家' };
      const ctx = { rng: new WS.RNG(this.w.rngState), major: [] };
      const res = WS.Policies.execute(c, this.w, policyId, ctx, 'player');
      this.w.rngState = ctx.rng.s;
      if (res.ok) {
        const d = WS.Policies.defs[policyId];
        this.w.playerLog.push({ y: this.w.year, m: this.w.month, country: cid, policy: policyId });
        WS.Events.log(this.w, ctx, { type: 'decision', title: `玩家介入：${c.name}執行「${d.name}」`, countries: [cid], level: 2, causes: ['玩家決策'], effects: res.effects });
      }
      return res;
    }

    changeRule(key, value) {
      const ctx = { rng: new WS.RNG(this.w.rngState), major: [] };
      const res = WS.Rules.change(this.w, ctx, key, value);
      this.w.rngState = ctx.rng.s;
      return res;
    }

    resolveDecision() { this.w.pendingDecision = null; }
    setMode(mode) { this.w.mode = mode; }
    setDifficulty(d) { this.w.difficulty = d; }                 // 模式切換不重置世界狀態
    setFocus(cid) { if (this.w.countries[cid]) this.w.focus = cid; }
    setIntervention(v) {
      const w = this.w;
      w.intervention = v;
      for (const id in w.countries) w.countries[id].controller = 'ai';
      if (v === 'full' && w.countries[w.focus]) w.countries[w.focus].controller = 'player';
    }
    setParam(path, value) {   // 進階模式：調整模型參數（會記錄在事件中）
      const parts = path.split('.');
      let o = this.w.params;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      const old = o[parts[parts.length - 1]];
      o[parts[parts.length - 1]] = value;
      WS.Events.log(this.w, null, { type: 'rule', title: `模型參數調整：${path}`, countries: [], level: 1, causes: ['進階模式'], effects: [`${old} → ${value}`] });
    }

    createBranch(name, reason, reseed) { return WS.Branch.create(this.w, name, reason, reseed); }
    branchFromSnapshot(index, name, reason) {
      const snap = JSON.parse(this.snapshots[index].json);
      return WS.Branch.create(snap, name, reason || `歷史回溯至 ${snap.year} 年`, null);
    }
  }

  WS.WorldEngine = WorldEngine;
})(typeof window !== 'undefined' ? window : globalThis);
