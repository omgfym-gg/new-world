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
      const sc = WS.Data.scenarios[setup.scenario || '1911'];
      if (sc && sc.era === 'ancient') {   // 遠古時代：使用遠古引擎（可變時間刻度）
        this.w = WS.Ancient.createWorld(setup);
        this.snapshots = [{ year: this.w.year, month: 1, tick: 0, json: JSON.stringify(this.w) }];
        return this.w;
      }
      const conf = WS.Rules.conflicts(Object.assign({}, WS.util.clone(Object.fromEntries(Object.entries(WS.Data.rules).map(([k, d]) => [k, d.default]))), setup.rules || {}));
      if (conf.length) throw new Error('世界規則互相衝突：' + conf.map((c) => c.text).join(' '));
      this.w = WS.State.createWorld(setup);
      this.snapshots = [{ year: this.w.year, month: this.w.month, tick: this.w.tick, json: JSON.stringify(this.w) }];
      return this.w;
    }
    load(obj) {
      this.w = WS.Save.migrate(obj);
      this.snapshots = [{ year: this.w.year, month: this.w.month, tick: this.w.tick, json: JSON.stringify(this.w) }];
      return this.w;
    }
    serialize() { return JSON.stringify(this.w); }
    get world() { return this.w; }

    // ---------- 單期模擬 ----------
    step() {
      if (WS.Ancient.isAncient(this.w)) return this.stepAncient();
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
      // 神之手：恢復神力、結束到期的干預（不使用亂數）
      WS.Divine.step(w, ids, ctx);
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
      // 亂數狀態要在拍快照之前寫回，否則從快照重跑（「如果？」、歷史回溯）會用到舊的亂數狀態而走出不同的世界
      w.rngState = ctx.rng.s;
      // 14. 保存紀錄、15. 歷史敘述（每年一月結算上一年）
      if (w.month === 1) {
        WS.History.finalizeYear(w, ctx);
        if ((w.year - w.startYear) % 5 === 0) {
          this.snapshots.push({ year: w.year, month: w.month, tick: w.tick, json: JSON.stringify(w) });
          if (this.snapshots.length > 60) this.snapshots.splice(1, 1);
        }
      }
      w.rngState = ctx.rng.s;
      return ctx;
    }

    // 遠古時代：一期＝數年（可變刻度），每 500 年拍一次快照
    stepAncient() {
      const w = this.w;
      const ctx = { rng: new WS.RNG(w.rngState), major: [] };
      const before = w.year;
      WS.Ancient.step(w, ctx);
      WS.Divine.ancientStep(w, ctx);
      w.rngState = ctx.rng.s;
      if (Math.floor((w.year - w.startYear) / 500) > Math.floor((before - w.startYear) / 500)) {
        this.snapshots.push({ year: w.year, month: 1, tick: w.tick, json: JSON.stringify(w) });
        if (this.snapshots.length > 40) this.snapshots.splice(1, 1);
      }
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
    advanceYears(n, opts) {
      if (!WS.Ancient.isAncient(this.w)) return this.advance(12 * n, opts);
      const target = this.w.year + n;
      let steps = 0;
      while (this.w.year < target) { this.step(); steps++; }
      return { advanced: steps, stopped: false };
    }

    // ---------- 指令 ----------
    // 會影響模擬結果的指令都記在 commandLog，「如果」平行世界重跑時依同樣的時間點重播
    record(cmd, args) { this.w.commandLog.push({ tick: this.w.tick, y: this.w.year, m: this.w.month, cmd, args }); }
    exec(c) {
      const [a, b] = c.args;
      switch (c.cmd) {
        case 'policy': return this.applyPolicy(a, b);
        case 'rule': return this.changeRule(a, b);
        case 'param': this.setParam(a, b); return { ok: true };
        case 'intervention': this.setIntervention(a); return { ok: true };
        case 'focus': this.setFocus(a); return { ok: true };
        case 'mode': this.setMode(a); return { ok: true };
        case 'divine': return this.divine(a, b, c.args[2]);
      }
      return { ok: false, reason: '未知指令' };
    }

    evaluate(cid) { return WS.Agents.evaluate(this.w.countries[cid], this.w); }

    applyPolicy(cid, policyId) {
      const c = this.w.countries[cid];
      if (!c) return { ok: false, reason: '沒有這個國家' };
      const ctx = { rng: new WS.RNG(this.w.rngState), major: [] };
      const res = WS.Policies.execute(c, this.w, policyId, ctx, 'player');
      this.w.rngState = ctx.rng.s;
      if (res.ok) {
        this.record('policy', [cid, policyId]);
        const d = WS.Policies.defs[policyId];
        this.w.playerLog.push({ y: this.w.year, m: this.w.month, country: cid, policy: policyId });
        WS.Events.log(this.w, ctx, { type: 'decision', title: `玩家介入：${c.name}執行「${d.name}」`, countries: [cid], level: 2, causes: ['玩家決策'], effects: res.effects });
      }
      return res;
    }

    // 神之手：玩家改變世界的條件（不直接指定結果），經引擎檢查後執行並記入指令紀錄
    divine(kind, cid, opt) {
      const ctx = { rng: new WS.RNG(this.w.rngState), major: [] };
      const res = WS.Divine.act(this.w, ctx, kind, cid, opt == null ? undefined : opt);
      this.w.rngState = ctx.rng.s;
      if (res.ok) this.record('divine', [kind, cid, opt == null ? null : opt]);
      return res;
    }
    divinePreview(kind, cid, opt) { return WS.Divine.preview(this.w, kind, cid, opt); }

    changeRule(key, value) {
      const ctx = { rng: new WS.RNG(this.w.rngState), major: [] };
      const res = WS.Rules.change(this.w, ctx, key, value);
      this.w.rngState = ctx.rng.s;
      if (res.ok && !res.unchanged) this.record('rule', [key, value]);
      return res;
    }

    resolveDecision() { this.w.pendingDecision = null; }
    setMode(mode) { if (this.w.mode !== mode) this.record('mode', [mode]); this.w.mode = mode; }
    setDifficulty(d) { this.w.difficulty = d; }                 // 模式切換不重置世界狀態
    setFocus(cid) { if (this.w.countries[cid] && this.w.focus !== cid) { this.record('focus', [cid]); this.w.focus = cid; } }
    setIntervention(v) {
      const w = this.w;
      this.record('intervention', [v]);
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
      this.record('param', [path, value]);
      WS.Events.log(this.w, null, { type: 'rule', title: `模型參數調整：${path}`, countries: [], level: 1, causes: ['進階模式'], effects: [`${old} → ${value}`] });
    }

    // 從遠古接到近代：用遠古世界目前的狀態產生近代國家，建立新的近代世界（原本的遠古世界不會被改動）
    toModern() {
      const res = WS.EraBridge.build(this.w);
      if (!res.ok) return res;
      const prev = this.w;
      this.create(res.setup);
      const w = this.w;
      w.origin = res.origin;
      WS.Events.log(w, null, {
        type: 'system', title: `承接遠古世界線「${prev.branch.name}」`, countries: [], level: 3,
        text: `${res.origin.countries.length} 個國家來自遠古時代的政體與地區（種子「${prev.seed}」）。`,
        causes: res.origin.countries.slice(0, 12).map((c) => `${c.name}：來自${c.from.join('、')}（${c.type}，人口 ${c.pop.toFixed(1)} 百萬，人均產出約 ${c.gdppc}）`),
        effects: ['人口沿用遠古的模擬結果；其他近代數值依遠古狀態換算（示意值）', '近代科技從零開始，之後由近代引擎研究']
      });
      return { ok: true, world: w, ancient: prev };
    }

    // 「如果」平行世界：回傳 { ok, world, snapshots, report }，不改變目前的世界
    whatIf(eventId, key) { return WS.WhatIf.run(this, eventId, key); }
    whatIfAvailable(eventId) { return WS.WhatIf.available(this, this.w.events.find((e) => e.id === eventId)); }

    createBranch(name, reason, reseed) { return WS.Branch.create(this.w, name, reason, reseed); }
    branchFromSnapshot(index, name, reason) {
      const snap = JSON.parse(this.snapshots[index].json);
      return WS.Branch.create(snap, name, reason || `歷史回溯至 ${snap.year} 年`, null);
    }
  }

  WS.WorldEngine = WorldEngine;
})(typeof window !== 'undefined' ? window : globalThis);
