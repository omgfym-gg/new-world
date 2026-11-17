// Ancient Engine：遠古時代引擎（西元前 10,000 年起）
// 設計見 docs/ancient-era.md。遵守 AGENTS.md 第 2 節：數值只由引擎計算、每個變化寫入因果帳、固定種子、不強制歷史事件。
//
// 世界由三層單位組成：
//   地區（固定地理單位：氣候、可耕地、水源、礦產）
//   社群（遊獵群、村落以人口推算；城市是有 ID 的實體，會出現、成長、廢棄）
//   政體（酋邦、城邦、王國、帝國：動態 ID，可形成、擴張、分裂、瓦解；不是必經階梯）
// 時間刻度可變：早期每 10 年一期，越接近近代越細（params.steps）。每期固定順序：
//   1 讀取狀態 2 更新時間 3 環境與收成 4 糧食與交換 5 人口 6 生活方式（採集／農耕／城市）
//   7 交流程度 8 科技 9 社群（城市、遷徙）10 政體 11 事件 12 能力開關與時代 13 驗證 14 紀錄 15 敘述
(function (root) {
  const WS = (root.WS = root.WS || {});
  const A = (WS.Ancient = {});
  const U = () => WS.util;
  const TECH = () => WS.Data.ancientTechs;
  const PTYPE = () => WS.Data.ancientPolityTypes;
  const KEYS = ['F', 'A', 'U'];

  // ---------- 小工具 ----------
  A.isAncient = (w) => !!(w && w.era === 'ancient');
  A.ids = (w) => Object.keys(w.ancient.regions).sort();
  A.region = (w, id) => w.ancient.regions[id];
  A.popOf = (r) => r.pop.F + r.pop.A + r.pop.U;
  A.farmShare = (r) => { const t = A.popOf(r); return t > 0 ? (r.pop.A + r.pop.U) / t : 0; };
  A.urbanShare = (r) => { const t = A.popOf(r); return t > 0 ? r.pop.U / t : 0; };
  A.adopt = (r, t) => (r.tech[t] ? r.tech[t].a : 0);
  A.invented = (r, t) => !!(r.tech[t] && r.tech[t].done);
  A.knows = (w, r, t) => A.invented(r, t) && r.tech[t].a >= w.params.ancient.tech.knownAt;
  A.eff = function (r, key) {
    let s = 0;
    for (const t in r.tech) { const e = TECH()[t].effects[key]; if (e && r.tech[t].done) s += e * r.tech[t].a; }
    return s;
  };
  A.neighborHas = (w, r, attr) => r.exchange >= 30 && r.links.some(([id]) => w.ancient.regions[id][attr] >= 0.2);
  A.yearLabel = (y) => (y <= 0 ? `西元前 ${(1 - y).toLocaleString()} 年` : `西元 ${y} 年`);
  A.dtFor = function (w) {
    for (const [until, dt] of w.params.ancient.steps) if (w.year < until) return dt;
    return 1;
  };
  A.conn = function (w, r, kind) {
    const pe = w.params.ancient.exchange;
    const sail = A.knows(w, r, 'sailing');
    if (kind === 'land') return 1;
    if (kind === 'sea') return sail ? 0.8 : pe.seaNeedsSailing;
    return A.knows(w, r, 'compass') ? 0.6 : sail ? pe.farSail : pe.far;
  };
  A.polityOf = (w, r) => (r.polity ? w.ancient.polities[r.polity] : null);

  // ---------- 承載力 ----------
  A.climate = function (r, year) {
    if (!r.climate) return 1;
    const c = r.climate;
    if (year <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) if (year <= c[i][0]) { const [y0, v0] = c[i - 1], [y1, v1] = c[i]; return v0 + (v1 - v0) * (year - y0) / (y1 - y0); }
    return c[c.length - 1][1];
  };
  // 採集（含游牧）承載力：人口達到此值時，每人可得食物剛好等於需要
  A.forageCap = function (w, r) {
    const p = w.params.ancient.food;
    const herd = p.herdGain * A.eff(r, 'herding') * r.animals * (1 - r.arable);
    return r.wild * r.area * p.forageScale * r.clim * (1 + A.eff(r, 'forage') + herd);
  };
  // 農耕承載力：可耕地 × 作物馴化程度 × 灌溉、犁耕、鐵器等
  A.farmCap = function (w, r) {
    const p = w.params.ancient.food;
    const crop = A.adopt(r, 'crop_domestication');
    if (!A.invented(r, 'crop_domestication') || crop <= 0) return 0;
    const arable = Math.min(1, r.arable * Math.max(1, Math.sqrt(r.clim)));
    return arable * r.area * p.landProd * crop * (1 + A.eff(r, 'land') + p.irrigationGain * r.river * A.eff(r, 'irrigation') + A.knowBonus(w, r));
  };
  // 精耕：累積經驗帶來的土地生產力
  // 累積的農耕經驗（精耕細作、品種改良、水利維護）：務農的人越多、交流越活躍，經驗累積越快（邊做邊學）
  A.knowBonus = (w, r) => w.params.ancient.food.knowGain * (r.know || 0) / w.params.ancient.food.knowScale;
  A.learn = function (w, r, dt) {
    const p = w.params.ancient.food;
    if (!A.invented(r, 'crop_domestication')) return;
    const base = r.arable * r.area * p.landProd;
    if (base <= 0) return;
    const d = (r.pop.A + r.pop.U) / base * (0.5 + r.exchange / 100) * dt;
    r.know += d;
    U().cause(r, 'know', '農民與工匠邊做邊學（精耕、品種、水利）', d);
  };
  A.farmEff = function (w, r) {
    const p = w.params.ancient.food;
    return 1 + (p.farmEff - 1) * A.adopt(r, 'crop_domestication') + A.eff(r, 'farmY');
  };
  // 產出：每人可得 = 效率^(1 − 人口／承載力)；人少時有剩餘，人多時遞減
  const yieldOf = (n, cap, e) => (n > 0 && cap > 0 ? n * Math.pow(e, 1 - n / cap) : 0);
  const marginal = (n, cap, e) => (cap > 0 ? Math.pow(e, 1 - n / cap) * (1 - (n / cap) * Math.log(e)) : 0);

  // ---------- 建立世界 ----------
  A.createWorld = function (setup) {
    const u = U();
    const sc = WS.Data.scenarios[setup.scenario];
    const seedStr = setup.seed != null && setup.seed !== '' ? String(setup.seed) : 'world-' + sc.id;
    const focus = WS.Data.ancientRegions.some((r) => r.id === setup.focus) ? setup.focus : 'FER';
    const w = {
      world_id: 'world_' + WS.hashSeed(seedStr + JSON.stringify(setup)).toString(36),
      name: setup.name || sc.name, version: WS.SAVE_VERSION, simulation_version: '1.1-ancient', paramsVersion: WS.PARAMS_VERSION,
      params: Object.assign(u.clone(WS.DEFAULT_PARAMS), { ancient: u.clone(WS.ANCIENT_PARAMS) }),
      era: 'ancient', scenario: sc.id, startYear: sc.startYear, year: sc.startYear, month: 1, startMonth: 1, tick: 0,
      mode: 'global', difficulty: setup.difficulty || 'simple', focus, intervention: 'none', speed: setup.speed || 'millennium', direction: 'natural',
      seed: seedStr, rngState: WS.hashSeed(seedStr),
      branch: { id: 'main', name: '主世界線', parent: null, createdTick: 0, divergeYear: sc.startYear, reason: '世界建立' },
      rules: {}, countries: {}, regions: {}, relations: {}, wars: [], organizations: {}, customRegimes: {},
      invented: {}, events: [], chronicle: [], transitions: [], playerLog: [],
      series: { labels: [], c: {}, world: { pop: [], gdp: [] } },
      counters: { event: 0, war: 0, country: 0, org: 0, polity: 0, city: 0 },
      validation: { checks: 0, issues: [] }, pendingDecision: null,
      genesis: u.clone(setup), commandLog: [], overrides: [], divine: { energy: 0, log: [], counter: 0 }, headlines: [],
      ancient: { regions: {}, polities: {}, firsts: {}, names: {}, dt: 10 }
    };
    for (const k in WS.Data.rules) w.rules[k] = WS.Data.rules[k].default;
    const GEO = ['id', 'name', 'short', 'color', 'lat', 'lon', 'area', 'wild', 'arable', 'river', 'plants', 'animals', 'copper', 'tin', 'iron', 'coast'];
    for (const d of WS.Data.ancientRegions) {
      const r = {};
      for (const k of GEO) r[k] = d[k];
      Object.assign(r, {
        links: u.clone(d.links), climate: d.climate ? u.clone(d.climate) : null, places: d.places.slice(), placeIdx: 0,
        pop: { F: d.start.pop, A: 0, U: 0 }, stock: 0, know: 0, fs: 1, clim: 1, harvest: 1, exchange: 10, tech: {}, polity: null, cities: [],
        prod: { forage: 0, farm: 0, need: 0, aid: 0 }, caps: {}, era: '', cool: {}, flags: {}, causes: { cur: {}, years: [] }
      });
      for (const t in TECH()) if (TECH()[t].start) r.tech[t] = { p: TECH()[t].cost, done: true, a: t === 'fire_making' && d.id === 'AUS' ? 0.6 : 0.95 };
      for (const t in d.start.techs) r.tech[t] = { p: TECH()[t].cost, done: true, a: 0.6 * d.start.techs[t] };
      r.clim = A.climate(r, w.year);
      w.ancient.regions[r.id] = r;
      w.series.c[r.id] = { pop: [], fs: [], farm: [], urban: [], exchange: [], techs: [] };
    }
    for (const t in TECH()) if (TECH()[t].start) w.ancient.firsts[t] = { region: null, year: null, note: '起點前已存在' };
    for (const r of Object.values(w.ancient.regions)) A.updateCaps(w, r, null, true);
    A.record(w);
    WS.Events.log(w, null, {
      type: 'system', title: '世界建立', countries: [],
      text: `${sc.name}：${A.ids(w).length} 個地區，世界人口約 ${u.fmt(A.worldPop(w), 1)} 百萬人，全部以狩獵採集為生。種子「${seedStr}」。`,
      causes: ['玩家設定：遠古時代・全球觀察']
    });
    return w;
  };

  A.worldPop = (w) => A.ids(w).reduce((s, id) => s + A.popOf(w.ancient.regions[id]), 0);

  // ---------- 單期模擬 ----------
  A.step = function (w, ctx) {
    const u = U(), P = w.params.ancient;
    // 1. 讀取狀態
    const ids = A.ids(w);
    const R = ids.map((id) => w.ancient.regions[id]);
    const prevPop = {};
    for (const r of R) prevPop[r.id] = A.popOf(r);
    // 2. 更新時間（可變刻度）
    const dt = A.dtFor(w);
    w.ancient.dt = dt;
    const fromYear = w.year;
    w.year += dt; w.tick++;
    // 3. 環境與收成
    for (const r of R) A.environment(w, r, dt, ctx);
    // 4. 糧食（含儲糧）與交換援助
    for (const r of R) A.food(w, r, dt);
    A.exchangeAid(w, R, dt);
    // 5. 人口
    for (const r of R) A.population(w, r, dt, ctx);
    // 6. 生活方式：採集 ↔ 農耕 → 城市
    for (const r of R) A.lifeways(w, r, dt);
    // 7. 交流程度
    for (const r of R) A.exchange(w, r, dt);
    for (const r of R) A.learn(w, r, dt);
    // 8. 科技：自行發明、交流傳入、逐步普及
    A.technology(w, R, dt, ctx);
    // 9. 社群：城市出現或廢棄、農民遷徙
    for (const r of R) A.cities(w, r, ctx);
    A.migration(w, R, dt, ctx);
    // 10. 政體：形成、升級、擴張、瓦解
    A.polities(w, R, dt, ctx);
    // 11. 事件（饑荒、瘟疫）
    for (const r of R) A.events(w, r, dt, ctx, prevPop[r.id]);
    // 12. 能力開關與時代名稱
    for (const r of R) A.updateCaps(w, r, ctx);
    // 13. 驗證：人口不得為負或 NaN
    for (const r of R) for (const k of KEYS) { if (!isFinite(r.pop[k]) || r.pop[k] < 0) { w.validation.issues.push({ y: w.year, text: `${r.name} ${k} 人口異常，已修正為 0` }); r.pop[k] = 0; } }
    w.validation.checks++;
    // 14. 紀錄（因果帳結算到本期、歷史數據）
    for (const r of R) {
      r.causes.years.push({ year: fromYear, data: r.causes.cur });
      if (r.causes.years.length > 30) r.causes.years.shift();
      r.causes.cur = {};
    }
    A.record(w);
    return ctx;
  };

  // ---- 3. 環境 ----
  A.environment = function (w, r, dt, ctx) {
    const p = w.params.ancient.food;
    r.clim = A.climate(r, w.year);
    let droughts = 0;
    for (let i = 0; i < dt; i++) if (ctx.rng.chance(p.droughtChance)) droughts++;
    r.droughts = droughts;
    r.harvest = Math.max(0.4, (1 - (1 - p.droughtHarvest) * droughts / dt) * (1 + ctx.rng.normal(0, p.harvestSd / Math.sqrt(dt))));
  };

  // ---- 4. 糧食 ----
  A.food = function (w, r, dt) {
    const u = U(), p = w.params.ancient.food;
    const W = A.forageCap(w, r), L = A.farmCap(w, r);
    r.cap = { forage: W, farm: L };
    const forage = yieldOf(r.pop.F, W, p.forageEff) * (1 + (r.harvest - 1) * 0.5);
    const farm = yieldOf(r.pop.A, L, A.farmEff(w, r)) * r.harvest;
    const need = A.popOf(r);
    r.prod = { forage, farm, need, aid: 0, draw: 0 };
    const bal = forage + farm - need;
    const cap = need * (p.storageBase + A.eff(r, 'storage'));
    if (bal >= 0) {
      const add = Math.min(bal * dt, Math.max(0, cap - r.stock));
      const loss = r.stock * Math.min(1, p.storageDecay * dt);
      r.stock = Math.max(0, r.stock + add - loss);
      u.cause(r, 'store', '收成餘糧存入', add); u.cause(r, 'store', '儲糧損耗', -loss);
    } else {
      const draw = Math.min(r.stock, -bal * dt);
      r.stock -= draw; r.prod.draw = draw / dt;
      u.cause(r, 'store', '歉收時動用儲糧', -draw);
    }
  };
  // 交換援助（無貨幣：互惠、贈與、以物易物、貢賦）：缺糧地區從鄰近地區的儲糧得到幫助
  A.exchangeAid = function (w, R, dt) {
    const u = U(), pe = w.params.ancient.exchange;
    for (const r of R) {
      const def = r.prod.need - r.prod.forage - r.prod.farm - r.prod.draw;
      if (def <= 0) continue;
      let got = 0;
      for (const [id, kind] of r.links) {
        const o = w.ancient.regions[id];
        if (o.stock <= 0) continue;
        const k = A.conn(w, r, kind) * Math.min(r.exchange, o.exchange) / 100 * pe.aid;
        const give = Math.min(o.stock * k, (def - got) * dt);
        if (give <= 0) continue;
        o.stock -= give; got += give / dt;
        u.cause(o, 'store', '交換：送往鄰近地區', -give, r.name);
        u.cause(r, 'aid', '交換：鄰近地區援助', give, o.name);
        if (got >= def) break;
      }
      r.prod.aid = got;
    }
    for (const r of R) r.fs = (r.prod.forage + r.prod.farm + r.prod.draw + r.prod.aid) / Math.max(1e-9, r.prod.need);
  };

  // ---- 5. 人口 ----
  A.population = function (w, r, dt, ctx) {
    const u = U(), pp = w.params.ancient.pop;
    const fs = r.fs;
    const bm = Math.pow(Math.min(1, fs), pp.famineBirth);
    const fam = pp.famineDeath * Math.max(0, 1 - fs);
    const dens = u.clamp(r.pop.A / Math.max(1e-9, r.cap.farm || 1), 0, 1.5);
    const crowd = pp.crowdDisease * dens * (A.invented(r, 'animal_domestication') ? 1.3 : 1);
    const rates = {
      F: [pp.birthForager * bm, pp.deathForager, 0],
      A: [pp.birthFarmer * bm, pp.deathFarmer, crowd],
      U: [pp.birthUrban * bm, pp.deathUrban, crowd]
    };
    const lbl = { F: '狩獵採集', A: '農民', U: '城市' };
    for (const k of KEYS) {
      const n = r.pop[k];
      if (n <= 0) continue;
      const [b, d0, dis] = rates[k];
      const net = b - d0 - dis - fam;
      const n2 = n * Math.exp(net * dt);
      const change = n2 - n;
      // 把變化依比例拆成出生、一般死亡、疾病、饑荒，寫入因果帳
      const tot = b + d0 + dis + fam;
      const scale = tot > 0 ? change / net : 0;
      if (isFinite(scale) && net !== 0) {
        u.cause(r, 'population', '出生', b * scale, lbl[k]);
        u.cause(r, 'population', '死亡', -d0 * scale, '一般死亡（' + lbl[k] + '）');
        if (dis) u.cause(r, 'population', '死亡', -dis * scale, '群聚與家畜傳染病');
        if (fam) u.cause(r, 'population', '死亡', -fam * scale, '糧食不足');
      }
      r.pop[k] = Math.max(0, n2);
    }
  };

  // ---- 6. 生活方式 ----
  A.lifeways = function (w, r, dt) {
    const u = U(), P = w.params.ancient;
    const W = r.cap.forage, L = r.cap.farm;
    const before = A.farmShare(r);
    if (L > 0) {
      const mF = marginal(r.pop.F, W, P.food.forageEff);
      const mA = r.pop.A > 0 ? marginal(r.pop.A, L, A.farmEff(w, r)) : A.farmEff(w, r);
      const diff = (mA - mF) / Math.max(0.2, Math.abs(mF));
      if (diff > 0 && r.pop.F > 0) {
        const mv = Math.min(r.pop.F * 0.6, r.pop.F * P.pop.farmShift * diff * dt + (r.pop.A === 0 ? Math.min(r.pop.F * 0.02, 0.002) : 0));
        r.pop.F -= mv; r.pop.A += mv;
      } else if (diff < 0 && r.pop.A > 0) {
        const mv = Math.min(r.pop.A * 0.5, r.pop.A * P.pop.farmShift * -diff * dt * 0.5);
        r.pop.A -= mv; r.pop.F += mv;
      }
    } else if (r.pop.A > 0) { r.pop.F += r.pop.A; r.pop.A = 0; }
    // 城市：剩餘糧食與組織能力決定能養活多少不耕作的人（工匠、祭司、官吏、商人）
    const pol = A.polityOf(w, r);
    let share = 0;
    if (L > 0 && A.invented(r, 'storage')) share = (A.knows(w, r, 'accounting') ? P.pop.urbanBase : P.pop.urbanProto) + A.eff(r, 'urbanMax');
    if (pol) {
      share += PTYPE()[pol.type].urban;
      if (pol.capital === r.id) share += w.params.ancient.polity.tribute * (pol.regions.length - 1);
    }
    const settled = r.pop.A + r.pop.U;
    const target = share * settled * (r.fs >= 0.97 ? 1 : Math.pow(Math.max(0, r.fs), 6));
    const mv = (target - r.pop.U) * Math.min(1, P.pop.urbanAdjust * dt);
    if (mv > 0) { const m = Math.min(mv, r.pop.A * 0.5); r.pop.A -= m; r.pop.U += m; u.cause(r, 'urban', pol ? `剩餘糧食與${PTYPE()[pol.type].name}組織支持城市` : '剩餘糧食支持工匠與市集', m); }
    else if (mv < 0) { r.pop.U += mv; r.pop.A -= mv; u.cause(r, 'urban', r.fs < 0.97 ? '糧食不足，城市人口回到鄉村' : '組織瓦解或剩餘減少，城市縮小', mv); }
    const after = A.farmShare(r);
    if (after !== before) u.cause(r, 'farming', after > before ? '農耕回報高於採集，更多人定居務農' : '農耕失利，部分人回到採集', (after - before) * 100);
  };

  // ---- 7. 交流程度（無貨幣交換的活躍度，0–100）----
  A.exchange = function (w, r, dt) {
    const u = U(), pe = w.params.ancient.exchange;
    const pol = A.polityOf(w, r);
    const linkSum = r.links.reduce((s, [, kind]) => s + A.conn(w, r, kind), 0);
    const parts = {
      '互惠與贈與（遊獵群之間）': pe.base,
      '定居村落的以物易物': pe.settled * A.farmShare(r),
      '城市市集與工匠': Math.min(pe.urbanMax, pe.urban * A.urbanShare(r)),
      '政體的貢賦與再分配': pol ? pe.polity * PTYPE()[pol.type].rank : 0,
      '交通與知識（航海、車輛、道路、文字、貨幣）': A.eff(r, 'exchange')
    };
    let target = 0;
    for (const k in parts) target += parts[k];
    target = u.clamp(target * (0.55 + 0.45 * Math.min(1, linkSum / 2)), 0, 100);
    const d = (target - r.exchange) * Math.min(1, pe.adjust * dt);
    if (d) {
      const tot = Object.values(parts).reduce((s, v) => s + v, 0) || 1;
      for (const k in parts) if (parts[k]) u.cause(r, 'exchange', k, d * parts[k] / tot);
    }
    r.exchange += d;
    r.exchangeTarget = target;
  };

  // ---- 8. 科技 ----
  A.reqOk = function (w, r, d) {
    if (d.req.some((x) => !A.knows(w, r, x))) return false;
    if (d.reqAny && !d.reqAny.some((x) => A.knows(w, r, x))) return false;
    return true;
  };
  // k：這個地區發明這項科技的難易（開始研究時用種子亂數抽一次，讓每條世界線的發明年代不同）
  A.techCost = (r, d, st) => d.cost * (st && st.k ? st.k : 1) / (d.scale ? Math.pow(Math.max(0.15, d.scale(r)), 2) : 1);
  A.technology = function (w, R, dt, ctx) {
    const u = U(), pt = w.params.ancient.tech;
    const known = {};
    for (const r of R) known[r.id] = new Set(Object.keys(r.tech).filter((t) => A.knows(w, r, t)));
    for (const r of R) {
      const pop = A.popOf(r);
      const pts = pt.researchBase * Math.sqrt(Math.max(0, pop)) * (1 + pt.urbanBoost * A.urbanShare(r) + A.eff(r, 'research')) * (0.5 + r.exchange / 100);
      r.research = pts;
      // 自行發明：前置科技都已普及，且地理條件允許
      const cand = Object.values(TECH()).filter((d) => !A.invented(r, d.id) && A.reqOk(w, r, d) && (!d.cond || d.cond(r, w)));
      for (const d of cand) {
        const st = r.tech[d.id] || (r.tech[d.id] = { p: 0, done: false, a: 0 });
        if (!st.k) st.k = pt.luckMin + (pt.luckMax - pt.luckMin) * ctx.rng.next();
        st.p += pts * dt;
        if (st.p >= A.techCost(r, d, st)) A.invent(w, r, d, '自行發明', ctx, cand.length ? [`研究點數每年約 ${pts.toFixed(2)}（人口 ${u.fmt(pop, 2)} 百萬、城市人口 ${(A.urbanShare(r) * 100).toFixed(1)}%、交流 ${r.exchange.toFixed(0)}）`] : []);
      }
      // 經交流傳入：鄰近地區已普及的科技（前置科技要先具備；地理條件不足的仍可引進，例如作物）
      for (const [id, kind] of r.links) {
        const c = A.conn(w, r, kind) * Math.min(r.exchange, w.ancient.regions[id].exchange) / 100;
        for (const t of known[id]) {
          const d = TECH()[t];
          if (A.invented(r, t) || !A.reqOk(w, r, d) || (d.adoptOnly && !d.adoptOnly(r))) continue;
          const st = r.tech[t] || (r.tech[t] = { p: 0, done: false, a: 0 });
          st.p += pt.diffusion * c * d.cost * dt;
          if (st.p >= d.cost) A.invent(w, r, d, '由鄰近地區傳入', ctx, [`從「${w.ancient.regions[id].name}」經交流傳入（交流程度 ${r.exchange.toFixed(0)}）`]);
        }
      }
      // 普及
      for (const t in r.tech) {
        const st = r.tech[t];
        if (!st.done || st.a >= 1) continue;
        const da = pt.adoptRate * (1 - st.a) * dt * (0.5 + r.exchange / 100) * (t === 'crop_domestication' ? pt.cropAdopt / pt.adoptRate * Math.max(0.3, Math.min(1, r.plants * 1.5)) : 1);
        st.a = Math.min(1, st.a + da);
      }
    }
  };
  A.invent = function (w, r, d, how, ctx, causes) {
    const st = r.tech[d.id];
    st.done = true; st.a = Math.max(st.a, 0.03); st.year = w.year; st.how = how;
    const first = !w.ancient.firsts[d.id];
    if (first) w.ancient.firsts[d.id] = { region: r.id, year: w.year };
    const big = ['crop_domestication', 'animal_domestication', 'writing', 'bronze', 'iron', 'currency', 'copper', 'irrigation', 'wheel'].includes(d.id);
    WS.Events.log(w, ctx, {
      type: 'tech', title: first ? `${r.name}率先出現「${d.name}」` : `${r.name}${how === '自行發明' ? '發展出' : '引進'}「${d.name}」`,
      countries: [r.id], level: first ? 3 : big ? 2 : 1, techId: d.id,
      causes: [how].concat(causes || []), effects: [first ? '世界上第一次出現（之後可能經交流傳到鄰近地區）' : '開始逐步普及'],
      ref: d.ref
    });
  };

  // ---- 9. 社群：城市與遷徙 ----
  A.cities = function (w, r, ctx) {
    const pp = w.params.ancient.pop;
    const n = Math.floor(r.pop.U / pp.cityPop);
    while (r.cities.length < Math.min(n, 12)) {
      w.counters.city++;
      const name = r.places[r.placeIdx] || `${r.short}第 ${r.placeIdx + 1} 城`;
      r.placeIdx++;
      const city = { id: 'C' + String(w.counters.city).padStart(3, '0'), name, founded: w.year };
      r.cities.push(city);
      const first = !w.ancient.firsts.city;
      if (first) w.ancient.firsts.city = { region: r.id, year: w.year };
      if (first || r.cities.length === 1) {
        WS.Events.log(w, ctx, {
          type: 'city', title: first ? `世界第一座城市：${r.name}的「${name}」` : `${r.name}出現第一座城市「${name}」`, countries: [r.id], level: first ? 3 : 2,
          causes: [`城市人口約 ${Math.round(r.pop.U * 1e6).toLocaleString()} 人（剩餘糧食養活不耕作的人）`, `農業人口比例 ${(A.farmShare(r) * 100).toFixed(0)}%`].concat(r.polity ? [`政體：${w.ancient.polities[r.polity].name}`] : []),
          effects: ['工匠、祭司、商人集中，研究與交流加快']
        });
      }
    }
    while (r.cities.length > n) {
      const c = r.cities.pop();
      r.placeIdx = Math.max(0, r.placeIdx - 1);
      WS.Events.log(w, ctx, { type: 'city', title: `${r.name}的城市「${c.name}」衰落廢棄`, countries: [r.id], level: 2, causes: [`城市人口降到約 ${Math.round(r.pop.U * 1e6).toLocaleString()} 人`, r.fs < 0.97 ? '糧食不足' : '組織瓦解或剩餘減少'] });
    }
  };
  // 農民遷徙：人口壓力大的農業地區，部分農民移往尚未務農、可耕的鄰近地區，並帶去作物
  A.migration = function (w, R, dt, ctx) {
    const u = U(), pp = w.params.ancient.pop, crop = TECH().crop_domestication;
    for (const r of R) {
      if (!A.knows(w, r, 'crop_domestication') || r.pop.A <= 0) continue;
      const pressure = r.pop.A / Math.max(1e-9, r.cap.farm);
      if (pressure < 0.85 && r.fs >= 0.98) continue;
      for (const [id, kind] of r.links) {
        const t = w.ancient.regions[id];
        if (A.knows(w, t, 'crop_domestication') || !crop.adoptOnly(t)) continue;
        const c = A.conn(w, r, kind);
        if (c < 0.5) continue;
        const m = pp.migrate * r.pop.A * dt * c;
        r.pop.A -= m; t.pop.A += m;
        u.cause(r, 'population', '遷移', -m, '農民移往' + t.name); u.cause(t, 'population', '遷移', m, '農民從' + r.name + '移入');
        const st = t.tech.crop_domestication || (t.tech.crop_domestication = { p: 0, done: false, a: 0 });
        st.p += pp.seedCarry * crop.cost * c;
        if (!t.flags.farmersFrom) {
          t.flags.farmersFrom = r.id;
          WS.Events.log(w, ctx, { type: 'migration', title: `${r.name}的農民移居${t.name}`, countries: [t.id, r.id], level: 2, causes: [`${r.name}農地人口壓力 ${(pressure * 100).toFixed(0)}%、糧食安全 ${(r.fs * 100).toFixed(0)}%`, `${t.name}可耕地比例 ${(t.arable * 100).toFixed(0)}%，尚未務農`], effects: ['移民帶去作物與種植知識'] });
        }
        if (!st.done && st.p >= crop.cost) {
          for (const pre of ['plant_management', 'seed_selection']) if (!A.invented(t, pre)) t.tech[pre] = { p: TECH()[pre].cost, done: true, a: 0.5, year: w.year, how: '隨移民傳入' };
          A.invent(w, t, crop, '隨移民傳入', ctx, [`${r.name}的農民移入，帶來作物與種植技術`]);
        }
      }
    }
  };

  // ---- 10. 政體 ----
  A.polityPower = function (w, pol, homeId) {
    const cap = w.ancient.regions[pol.capital];
    let s = 0;
    for (const id of pol.regions) { const r = w.ancient.regions[id]; s += Math.pow(r.pop.A + r.pop.U + r.pop.F * 0.2, 0.8) * (id === pol.capital || id === homeId ? 1 : 0.5); }
    return s * (1 + A.eff(cap, 'military')) * PTYPE()[pol.type].power * (0.5 + pol.cohesion / 100);
  };
  A.adminCap = (w, pol) => PTYPE()[pol.type].adminBase + A.eff(w.ancient.regions[pol.capital], 'admin');
  A.nameFor = function (w, r, type) {
    const base = r.short + PTYPE()[type].name;
    const n = (w.ancient.names[base] = (w.ancient.names[base] || 0) + 1);
    return n === 1 ? base : `${base}（第 ${n} 個）`;
  };
  A.polities = function (w, R, dt, ctx) {
    const u = U(), pp = w.params.ancient.polity;
    const T = PTYPE();
    // 形成：定居農業夠密、能儲糧
    for (const r of R) {
      if (r.polity) continue;
      const dens = r.pop.A / r.area;
      if (!(A.knows(w, r, 'crop_domestication') && A.farmShare(r) >= 0.5 && dens >= pp.chiefdomDensity && A.knows(w, r, 'storage') && A.knows(w, r, 'counting'))) continue;
      if (!ctx.rng.chance(1 - Math.pow(1 - pp.formChance, dt))) continue;
      w.counters.polity++;
      const id = 'P' + String(w.counters.polity).padStart(3, '0');
      const pol = { id, name: A.nameFor(w, r, 'chiefdom'), type: 'chiefdom', capital: r.id, regions: [r.id], cohesion: 60, founded: w.year, color: r.color };
      w.ancient.polities[id] = pol; r.polity = id;
      const first = !w.ancient.firsts.polity;
      if (first) w.ancient.firsts.polity = { region: r.id, year: w.year };
      WS.Events.log(w, ctx, { type: 'polity', title: `${first ? '世界第一個' : ''}新政體形成：${pol.name}`, countries: [r.id], level: first ? 3 : 2, polity: id,
        causes: [`農民密度 ${(dens * 1000).toFixed(0)}（門檻 ${(pp.chiefdomDensity * 1000).toFixed(0)}）`, `定居比例 ${(A.farmShare(r) * 100).toFixed(0)}%`, '有儲糧能力，可累積剩餘與分配'],
        effects: ['親族與村落結成酋邦，首領負責分配剩餘與防衛', '可支持更多城市人口'] });
    }
    for (const pid of Object.keys(w.ancient.polities).sort()) {
      const pol = w.ancient.polities[pid];
      if (pol.ended) continue;
      const cap = w.ancient.regions[pol.capital];
      const load = pol.regions.length, adm = A.adminCap(w, pol);
      // 凝聚力
      const over = Math.max(0, load - adm);
      const dc = (60 - pol.cohesion) * Math.min(1, 0.03 * dt) - over * 4 * dt / 10 - (cap.fs < 0.9 ? 15 * (0.9 - cap.fs) * dt : 0) + A.eff(cap, 'cohesion') * dt;
      pol.cohesion = u.clamp(pol.cohesion + dc, 0, 100);
      // 升級（依條件；不是必經階梯）
      let to = null;
      if (pol.type === 'chiefdom' && cap.cities.length >= 1 && A.knows(w, cap, 'accounting')) to = 'citystate';
      else if (pol.type === 'citystate' && (pol.regions.length >= 2 || (cap.cities.length >= 3 && A.knows(w, cap, 'writing')))) to = 'kingdom';
      else if (pol.type === 'kingdom' && pol.regions.length >= 3 && A.knows(w, cap, 'administration')) to = 'empire';
      if (to && ctx.rng.chance(1 - Math.pow(1 - pp.upgradeChance, dt))) {
        const old = pol.name;
        pol.type = to; pol.name = A.nameFor(w, cap, to);
        const first = !w.ancient.firsts[to];
        if (first) w.ancient.firsts[to] = { region: cap.id, year: w.year };
        WS.Events.log(w, ctx, { type: 'polity', title: `${old}發展為${T[to].name}：${pol.name}`, countries: pol.regions.slice(), level: first || to === 'empire' ? 3 : 2, polity: pid,
          causes: to === 'citystate' ? [`首都有 ${cap.cities.length} 座城市`, '已有記帳（陶籌與印章），能管理貢賦'] : to === 'kingdom' ? [`管轄 ${pol.regions.length} 個地區、首都 ${cap.cities.length} 座城市`, A.knows(w, cap, 'writing') ? '已有文字' : '透過征服擴張'] : [`管轄 ${pol.regions.length} 個地區`, '已有官僚行政'],
          effects: [`組織型態改為「${T[to].name}」：行政能力與可支持的城市人口提高`] });
      }
      // 擴張
      if (ctx.rng.chance(1 - Math.pow(1 - pp.attackChance * (1 + A.eff(cap, 'military')), dt)) && load + 1 <= adm + 0.3) {
        const sail = A.knows(w, cap, 'sailing');
        const cands = [];
        for (const rid of pol.regions) for (const [id, kind] of w.ancient.regions[rid].links) {
          if (pol.regions.includes(id) || cands.some((c) => c.id === id)) continue;
          if (kind === 'far' || (kind === 'sea' && !sail)) continue;
          cands.push(w.ancient.regions[id]);
        }
        let best = null;
        for (const t of cands) {
          const tp = A.polityOf(w, t);
          const def = tp ? A.polityPower(w, tp, t.id) * 1.3 : Math.pow(t.pop.A + t.pop.U + t.pop.F * 0.3, 0.8) * 0.45 * (1 + A.eff(t, 'military'));
          const ratio = A.polityPower(w, pol) * 0.7 / Math.max(1e-6, def);
          if (ratio >= pp.attackRatio && (A.popOf(t) > 0.01) && (!best || ratio > best.ratio)) best = { t, tp, ratio };
        }
        if (best) A.conquer(w, pol, best, ctx);
      }
      if (pol.ended) continue;
      // 瓦解
      const pc = (pp.collapseBase + pp.collapseOverload * over + (cap.fs < 0.85 ? pp.collapseFamine : 0)) * (pol.cohesion < 30 ? 2 : 1);
      if (ctx.rng.chance(1 - Math.pow(1 - pc, dt))) A.collapse(w, pol, ctx, { over, adm, famine: cap.fs < 0.85 });
    }
  };
  A.conquer = function (w, pol, best, ctx) {
    const u = U();
    const { t, tp, ratio } = best;
    const win = ctx.rng.chance(ratio * ratio / (1 + ratio * ratio));
    w.counters.war++;
    const cap = w.ancient.regions[pol.capital];
    if (!win) {
      pol.cohesion = Math.max(0, pol.cohesion - 10);
      const l = cap.pop.A * 0.01; cap.pop.A -= l; u.cause(cap, 'population', '戰爭', -l, `遠征${t.name}失敗`);
      WS.Events.log(w, ctx, { type: 'war', title: `${pol.name}遠征${t.name}失敗`, countries: [cap.id, t.id], level: 1, causes: [`兵力比 ${ratio.toFixed(2)} : 1`, `勝算約 ${(ratio * ratio / (1 + ratio * ratio) * 100).toFixed(0)}%`], effects: ['凝聚力 −10'] });
      return;
    }
    for (const k of ['A', 'U']) { const l = t.pop[k] * 0.03; t.pop[k] -= l; u.cause(t, 'population', '戰爭', -l, `${pol.name}征服`); }
    const effects = [`${t.name}納入${pol.name}`];
    if (tp) {
      tp.regions = tp.regions.filter((x) => x !== t.id);
      if (tp.capital === t.id || !tp.regions.length) {
        for (const x of tp.regions) w.ancient.regions[x].polity = null;
        tp.ended = w.year; tp.endReason = `被${pol.name}征服`; effects.push(`${tp.name}滅亡`);
      }
    }
    t.polity = pol.id; pol.regions.push(t.id);
    pol.cohesion = Math.max(0, pol.cohesion - 5);
    WS.Events.log(w, ctx, { type: 'war', title: `${pol.name}征服${t.name}`, countries: [cap.id, t.id], level: tp ? 3 : 2, polity: pol.id,
      causes: [`兵力比 ${ratio.toFixed(2)} : 1（人口、金屬武器、組織、凝聚力）`, `管轄 ${pol.regions.length - 1} 個地區，行政能力 ${A.adminCap(w, pol).toFixed(1)}`], effects: effects.concat(['被征服地區人口 −3%', '首都可得到貢賦，城市擴大']) });
  };
  A.collapse = function (w, pol, ctx, why) {
    const causes = [`凝聚力 ${pol.cohesion.toFixed(0)}`].concat(why.over > 0 ? [`管轄 ${pol.regions.length} 個地區，超過行政能力 ${why.adm.toFixed(1)}`] : []).concat(why.famine ? ['首都饑荒'] : []);
    if (pol.regions.length > 1) {
      const lost = pol.regions.filter((x) => x !== pol.capital).pop();
      pol.regions = pol.regions.filter((x) => x !== lost);
      const r = w.ancient.regions[lost];
      r.polity = null;
      pol.cohesion = Math.min(100, pol.cohesion + 10);
      WS.Events.log(w, ctx, { type: 'polity', title: `${pol.name}失去${r.name}`, countries: [pol.capital, lost], level: 2, polity: pol.id, causes, effects: [`${r.name}脫離統治`] });
      return;
    }
    const r = w.ancient.regions[pol.capital];
    r.polity = null; pol.ended = w.year; pol.endReason = '內部瓦解';
    WS.Events.log(w, ctx, { type: 'polity', title: `${pol.name}瓦解`, countries: [r.id], level: 2, polity: pol.id, causes, effects: ['回到村落與親族自治，城市人口逐漸減少'] });
  };

  // ---- 11. 事件 ----
  A.events = function (w, r, dt, ctx, before) {
    const u = U();
    r.cool = r.cool || {};
    if (r.fs < 0.88 && (r.cool.famine || -1e9) <= w.tick) {
      r.cool.famine = w.tick + 3;
      const loss = before - A.popOf(r);
      WS.Events.log(w, ctx, { type: 'conditional', defId: 'famine', title: `${r.name}：饑荒`, countries: [r.id], level: loss / before > 0.08 ? 3 : 2,
        causes: [`糧食安全 ${(r.fs * 100).toFixed(0)}%`].concat(r.droughts ? [`本期有 ${r.droughts} 個乾旱年`] : []).concat(r.clim < 0.95 ? ['氣候變得較不利'] : []).concat([`人口相對承載力：採集 ${(r.pop.F / Math.max(1e-9, r.cap.forage) * 100).toFixed(0)}%、農耕 ${r.cap.farm ? (r.pop.A / r.cap.farm * 100).toFixed(0) + '%' : '—'}`]),
        effects: [loss > 0 ? `本期人口減少約 ${u.fmt(loss * 1000, 0)} 千人` : '出生減少、死亡增加'] });
    }
    // 瘟疫：城市與家畜帶來群聚傳染病
    if (r.pop.U > 0.005 && ctx.rng.chance(1 - Math.pow(1 - 0.0015 * Math.min(1, r.pop.U / 0.05), dt)) && (r.cool.plague || -1e9) <= w.tick) {
      r.cool.plague = w.tick + 5;
      const lu = r.pop.U * 0.12, la = r.pop.A * 0.03;
      r.pop.U -= lu; r.pop.A -= la;
      u.cause(r, 'population', '瘟疫', -(lu + la), '城市與家畜帶來的傳染病');
      WS.Events.log(w, ctx, { type: 'conditional', defId: 'plague', title: `${r.name}：瘟疫`, countries: [r.id], level: 2, causes: [`城市人口約 ${Math.round(r.pop.U * 1e6).toLocaleString()} 人，人畜群聚`], effects: [`死亡約 ${u.fmt((lu + la) * 1000, 0)} 千人`] });
    }
  };

  // ---- 12. 能力開關與時代名稱 ----
  A.eraName = function (w, r) {
    const k = (t) => A.knows(w, r, t);
    const farming = k('crop_domestication') && A.farmShare(r) >= 0.3;
    const pastoral = !farming && k('animal_domestication') && r.arable < 0.15;
    let base;
    if (k('iron')) base = '鐵器時代';
    else if (k('bronze')) base = '青銅時代';
    else if (k('copper')) base = '銅石並用時代';
    else if (farming) base = '新石器時代（農業村落）';
    else if (pastoral) base = '游牧時代';
    else base = k('pottery') || k('plant_management') ? '中石器時代（狩獵採集）' : '舊石器晚期（狩獵採集）';
    const pol = A.polityOf(w, r);
    const tags = [];
    if (pol && PTYPE()[pol.type].rank >= 2) tags.push(PTYPE()[pol.type].name);
    if (k('writing')) tags.push('有文字');
    return base + (tags.length ? '・' + tags.join('・') : '');
  };
  A.updateCaps = function (w, r, ctx, silent) {
    const pol = A.polityOf(w, r);
    const k = (t) => A.knows(w, r, t);
    const caps = {
      agriculture: k('crop_domestication') && A.farmShare(r) >= 0.3,
      settled: A.farmShare(r) >= 0.5,
      cities: r.cities.length > 0,
      state: !!pol && PTYPE()[pol.type].rank >= 2,
      tax: !!pol && PTYPE()[pol.type].rank >= 2 && k('accounting'),
      writing: k('writing'),
      metal: k('copper'),
      currency: k('currency')
    };
    const NAMES = { agriculture: '農業', settled: '定居社會', cities: '城市', state: '國家（城邦以上）', tax: '稅收（貢賦）', writing: '文字', metal: '金屬', currency: '貨幣' };
    if (!silent) for (const c in caps) if (caps[c] && !r.caps[c]) {
      // 能力開關第一次打開時記一筆（系統紀錄；重大的另有專屬事件）
      if (['state', 'tax', 'currency', 'agriculture'].includes(c)) WS.Events.log(w, ctx, { type: 'era', title: `${r.name}出現「${NAMES[c]}」`, countries: [r.id], level: c === 'agriculture' || c === 'state' ? 2 : 1, causes: A.capWhy(w, r, c) });
    }
    r.caps = caps;
    const era = A.eraName(w, r);
    if (r.era && era !== r.era && !silent) WS.Events.log(w, ctx, { type: 'era', title: `${r.name}進入「${era}」`, countries: [r.id], level: 1, causes: [`原本：${r.era}`] });
    r.era = era;
    r.exchangeMode = caps.currency ? '貨幣交易' : caps.state ? '貢賦與再分配' : caps.settled ? '以物易物' : '互惠與贈與';
  };
  A.capWhy = function (w, r, c) {
    switch (c) {
      case 'agriculture': return [`作物馴化普及 ${(A.adopt(r, 'crop_domestication') * 100).toFixed(0)}%`, `定居務農比例 ${(A.farmShare(r) * 100).toFixed(0)}%`];
      case 'state': return [`政體「${A.polityOf(w, r).name}」已是${PTYPE()[A.polityOf(w, r).type].name}`];
      case 'tax': return ['有城邦以上的政體', '有記帳能力，可徵收貢賦'];
      case 'currency': return ['已有貨幣（文字、青銅、交流程度足夠）'];
    }
    return [];
  };

  // ---- 14. 歷史紀錄 ----
  A.record = function (w) {
    const s = w.series;
    s.labels.push(w.year);
    let tot = 0;
    for (const id of A.ids(w)) {
      const r = w.ancient.regions[id], c = s.c[id];
      const p = A.popOf(r); tot += p;
      c.pop.push(+p.toFixed(4)); c.fs.push(+(r.fs * 100).toFixed(1)); c.farm.push(+(A.farmShare(r) * 100).toFixed(1));
      c.urban.push(+(A.urbanShare(r) * 100).toFixed(2)); c.exchange.push(+r.exchange.toFixed(1));
      c.techs.push(Object.keys(r.tech).filter((t) => A.invented(r, t)).length);
    }
    s.world.pop.push(+tot.toFixed(3)); s.world.gdp.push(null);
    if (s.labels.length > 2000) { s.labels.shift(); s.world.pop.shift(); s.world.gdp.shift(); for (const id in s.c) for (const k in s.c[id]) s.c[id][k].shift(); }
  };

  // 介面用：世界摘要（只讀）
  A.summary = function (w) {
    const R = A.ids(w).map((id) => w.ancient.regions[id]);
    const pols = Object.values(w.ancient.polities).filter((p) => !p.ended);
    return {
      pop: A.worldPop(w), regions: R.length,
      farming: R.filter((r) => r.caps.agriculture).length,
      cities: R.reduce((s, r) => s + r.cities.length, 0),
      polities: pols.length, states: pols.filter((p) => PTYPE()[p.type].rank >= 2).length,
      writing: R.filter((r) => r.caps.writing).length
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
