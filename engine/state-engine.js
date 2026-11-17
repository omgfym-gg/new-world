// World State：世界狀態建立、工具函式、因果紀錄、動態實體（新國家 / 組織）
(function (root) {
  const WS = (root.WS = root.WS || {});

  const U = (WS.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    clone: (o) => JSON.parse(JSON.stringify(o)),
    pairKey: (a, b) => (a < b ? a + '|' + b : b + '|' + a),
    popTotal: (c) => c.pop.c0 + c.pop.c1 + c.pop.c2 + c.pop.c3,
    adopt: (c, id) => (c.tech[id] ? c.tech[id].adoption : 0),
    invented: (c, w, id) => !!(c.tech[id] && c.tech[id].progress >= WS.Data.techs[id].cost),
    ids: (w) => Object.keys(w.countries).filter((id) => w.countries[id].alive).sort(),
    fmt: (n, d = 1) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(d)),
    normalize(obj, min = 0.01) {
      let s = 0;
      for (const k in obj) { obj[k] = Math.max(min, obj[k]); s += obj[k]; }
      for (const k in obj) obj[k] /= s;
      return obj;
    }
  });

  // ---- 因果紀錄 ----
  // 每個數值變化都記錄在 c.causes.cur[指標][因素] = { v, sub: { 細項: 值 } }
  // 每年一月結算：上一年的紀錄移到 c.causes.years（保留最近 30 年）
  U.cause = function (c, metric, factor, value, sub) {
    if (!value || !isFinite(value)) return;
    const m = c.causes.cur[metric] || (c.causes.cur[metric] = {});
    const f = m[factor] || (m[factor] = { v: 0, sub: {} });
    f.v += value;
    if (sub) f.sub[sub] = (f.sub[sub] || 0) + value;
  };

  U.relation = (w, a, b) => w.relations[U.pairKey(a, b)];
  U.regime = (w, key) => WS.Data.regimes[key] || (w.customRegimes || {})[key];

  const State = (WS.State = {});

  State.newCountryShell = function (id, name) {
    return {
      id, name, alive: true, color: '#888', lat: 0, lon: 0, controller: 'ai',
      regime: 'republic', regimeLabel: '', leader: null, leaderPool: [], leaderSince: 0,
      pop: { c0: 0, c1: 0, c2: 0, c3: 0 },
      demo: { fert: 0, mortScale: 1, health: 0.3, health0: 0.3, edu: 30, urban: 0.2, urban0: 0.2, fertFactor0: 1, unemployment: 0.05, births: 0, deaths: 0, migration: 0 },
      econ: { sec: {}, lab: {}, lab0: {}, invAlloc: { agri: 0.3, ind: 0.4, serv: 0.3 }, gdp: 0, gdpHist: [], growth: 0, savings: 0.1, inflation: 0.02, priceIndex: 100, openness: 0.4, opennessTarget: null, market: 0.6, marketTarget: 0.6, gdppc: 0, alt: false },
      fiscal: { taxRate: 0.08, revenue: 0, spending: 0, debt: 0, interest: 0, deficitTol: 0.1, budget: {}, budget0: {}, amounts: {} },
      pol: {},
      tech: {}, research: { points: 0, focus: null },
      mil: { personnel: 0.1, training: 50, equipment: 0.5, power: 0, fundingRatio: 1, exhaustion: 0 },
      res: { foodStock: 3, foodRatio: 1, foodCoef: 1, shortage: 0, harvest: 1, coal: 0, oil: 0, energyCap: 0, energyRatio: 1, energyDemand0: 1, pollution: 0 },
      goal: 'prosper', memory: [], decisions: [], cooldown: {}, pending: [],
      regions: [], causes: { cur: {}, years: [] }, flags: {}, founded: 0, parent: null
    };
  };

  State.buildCountry = function (def, w) {
    const c = State.newCountryShell(def.id, def.name);
    Object.assign(c, { color: def.color, lat: def.lat, lon: def.lon, regime: def.regime, regimeLabel: def.regimeLabel || '' });
    c.leader = Object.assign({ since: w.tick }, def.leader);
    c.leaderPool = U.clone(def.leaderPool || []);
    const P = def.pop;
    c.pop = { c0: P * def.ages[0], c1: P * def.ages[1], c2: P * def.ages[2], c3: P * def.ages[3] };
    const p = w.params.population;
    const fertileShare = def.ages[1] + def.ages[2] * p.fertileWeight25to64;
    const mstd = def.ages.reduce((s, a, i) => s + a * p.baseMortality[i], 0);
    c.demo.mortScale = def.cdr / mstd;
    c.demo.health = c.demo.health0 = def.health;
    c.demo.edu = def.edu;
    c.demo.urban = c.demo.urban0 = def.urban;
    c.demo.fertFactor0 = State.fertFactor(c, w);
    c.demo.fert = def.cbr / fertileShare;
    c.demo.fertBase = c.demo.fert;
    c.econ.gdp = def.gdp;
    c.econ.savings = def.savings;
    c.econ.openness = def.openness;
    c.econ.lab = { agri: def.labourShare[0], ind: def.labourShare[1], serv: def.labourShare[2] };
    c.econ.lab0 = U.clone(c.econ.lab);
    c.econ.sec = {
      agri: { Y: def.gdp * def.sectorShare[0] },
      ind: { Y: def.gdp * def.sectorShare[1] },
      serv: { Y: def.gdp * def.sectorShare[2] }
    };
    c.econ.invAlloc = U.normalize({ agri: def.sectorShare[0] * 0.8, ind: def.sectorShare[1] * 1.5, serv: def.sectorShare[2] });
    c.fiscal.taxRate = def.taxRate;
    c.fiscal.debt = def.gdp * def.debtRatio;
    c.fiscal.budget = U.normalize(U.clone(def.budget));
    c.fiscal.budget0 = U.clone(c.fiscal.budget);
    c.pol = Object.assign({ exhaustion: 0, revolutionPressure: 0 }, U.clone(def.pol));
    c.mil.personnel = def.mil.personnel;
    c.mil.training = def.mil.training;
    c.mil.equipment = def.mil.equipment;
    c.res.foodStock = def.foodStock;
    c.res.foodRatio = def.foodRatio;
    c.res.coal = def.coal;
    c.res.oil = def.oil;
    c.res.energySelf = def.energySelf;
    c.goal = def.goal;
    c.goal0 = def.goal;
    for (const t in def.techs) {
      c.tech[t] = { progress: WS.Data.techs[t].cost, adoption: def.techs[t] };
      if (!w.invented[t]) w.invented[t] = { by: '起點前已存在', year: w.startYear };
    }
    // 地區
    def.regions.forEach((rn, i) => {
      const rid = def.id + '-R' + (i + 1);
      w.regions[rid] = { id: rid, name: rn, owner: def.id, core: def.id, weight: i === 0 ? 1.5 : 1, capital: i === 0 };
      c.regions.push(rid);
    });
    c.founded = w.startYear;
    return c;
  };

  State.fertFactor = function (c, w) {
    const p = w.params.population;
    // 人口轉型（S 型）：教育、城市化、嬰幼兒存活（醫療水準）共同組成「轉型指數」，越高生育意願越低。
    // 舊版是線性公式並夾在 0.3–1.2 之間，已開發國家起點就碰到下限，生育率之後無法再下降。
    const dev = p.transitionEduW * c.demo.edu / 100 + p.transitionUrbanW * c.demo.urban + p.transitionHealthW * c.demo.health;
    return p.transitionFloor + (1 - p.transitionFloor) / (1 + Math.exp(p.transitionSteep * (dev - p.transitionMid)));
  };

  // ---- 建立世界 ----
  State.createWorld = function (setup) {
    const sc = WS.Data.scenarios[setup.scenario || '1911'];
    const seedStr = setup.seed != null && setup.seed !== '' ? String(setup.seed) : 'world-' + sc.id;
    const w = {
      world_id: 'world_' + WS.hashSeed(seedStr + JSON.stringify(setup)).toString(36),
      name: setup.name || sc.name,
      version: WS.SAVE_VERSION,
      simulation_version: '1.1',
      paramsVersion: WS.PARAMS_VERSION,
      params: U.clone(WS.DEFAULT_PARAMS),
      scenario: sc.id,
      startYear: sc.startYear,
      year: sc.startYear,
      month: sc.startMonth,
      startMonth: sc.startMonth,
      tick: 0,
      mode: setup.mode || 'country',
      difficulty: setup.difficulty || 'simple',
      focus: setup.focus || 'CHN',
      intervention: setup.intervention || 'none',
      speed: setup.speed || 'decade',
      direction: setup.direction || 'natural',
      seed: seedStr,
      rngState: WS.hashSeed(seedStr),
      branch: { id: 'main', name: '主世界線', parent: null, createdTick: 0, divergeYear: sc.startYear, reason: '世界建立' },
      rules: {},
      countries: {}, regions: {}, relations: {}, wars: [], organizations: {}, customRegimes: {},
      invented: {}, events: [], chronicle: [], transitions: [], playerLog: [],
      series: { labels: [], c: {}, world: { pop: [], gdp: [] } },
      counters: { event: 0, war: 0, country: 0, org: 0 },
      validation: { checks: 0, issues: [] },
      pendingDecision: null,
      genesis: U.clone(setup),   // 世界建立時的設定：可用同一個種子重新生成（「如果」平行世界）
      commandLog: [],            // 會影響模擬的玩家指令（依 tick 重播）
      overrides: [],             // 「如果」設定：在指定月份改寫一件事
      divine: { energy: WS.DEFAULT_PARAMS.divine.energyStart, log: [], counter: 0 },  // 神之手：神力與干預紀錄
      headlines: []              // 世界頭條（只依實際紀錄產生）
    };
    for (const k in WS.Data.rules) w.rules[k] = WS.Data.rules[k].default;
    Object.assign(w.rules, setup.rules || {});

    for (const def of sc.countries) w.countries[def.id] = State.buildCountry(def, w);
    const ids = U.ids(w);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) State.addRelation(w, ids[i], ids[j], 0, '');
    for (const [a, b, v, why] of sc.relations) {
      const r = U.relation(w, a, b);
      r.base = v; r.rel = v; r.baseWhy = why;
    }
    for (const [a, b] of sc.alliances) { const r = U.relation(w, a, b); r.alliance = true; r.rel += 15; }

    // 初始校準：讓第一期產出與起點資料一致
    for (const id of ids) WS.Economy.calibrate(w.countries[id], w);
    for (const id of ids) WS.Military.updatePower(w.countries[id], w);

    // 玩家設定
    const fc = w.countries[w.focus];
    if (fc && w.mode === 'country') {
      if (w.intervention === 'full') fc.controller = 'player';
      const dirGoal = { prosper: 'prosper', tech: 'tech', military: 'expand' }[w.direction];
      if (dirGoal) fc.goal = dirGoal;
    }
    if (w.mode === 'global') {
      const g = { tech: 'tech', peace: 'peace', sharing: 'sharing' }[w.direction];
      if (g) for (const id of ids) w.countries[id].goal = g;
      if (w.direction === 'sharing') w.rules.resourceSharing = true;
    }
    WS.Rules.applyAll(w, null);
    WS.History.record(w, true);
    WS.Events.log(w, null, {
      type: 'system', title: '世界建立', countries: [],
      text: `${sc.name}：${ids.length} 個國家，起點 ${w.year} 年 ${w.month} 月，種子「${seedStr}」。`,
      causes: ['玩家設定：' + (w.mode === 'country' ? '國家模式' : '全球模式')]
    });
    return w;
  };

  State.addRelation = function (w, a, b, base, why) {
    w.relations[U.pairKey(a, b)] = {
      a: a < b ? a : b, b: a < b ? b : a, base, baseWhy: why, rel: base, trust: 50, trade: 0.15,
      alliance: false, war: null, memory: [], parts: {}
    };
  };

  // ---- 動態建立新國家（分裂 / 獨立）----
  // 從母國切出一個或多個地區，按比例移轉人口、資本、資源，建立全新的國家 ID。
  State.splitCountry = function (w, parentId, regionIds, opts) {
    const P = w.countries[parentId];
    const totalW = P.regions.reduce((s, r) => s + w.regions[r].weight, 0);
    const moveW = regionIds.reduce((s, r) => s + w.regions[r].weight, 0);
    const f = moveW / totalW;
    w.counters.country++;
    const id = 'N' + String(w.counters.country).padStart(3, '0');
    const c = State.newCountryShell(id, opts.name);
    c.color = opts.color || '#b48cff';
    c.lat = P.lat + (opts.dLat || 3); c.lon = P.lon + (opts.dLon || 4);
    c.regime = opts.regime || 'authoritarian';
    c.regimeLabel = opts.regimeLabel || opts.name + '（' + U.regime(w, c.regime).name + '）';
    c.leader = { name: opts.leaderName || opts.name + '首任領袖', comp: 0.5, aggr: 0.5, reform: 0.5, since: w.tick };
    for (const k of ['c0', 'c1', 'c2', 'c3']) { c.pop[k] = P.pop[k] * f; P.pop[k] -= c.pop[k]; }
    c.demo = Object.assign(U.clone(P.demo), { births: 0, deaths: 0, migration: 0 });
    c.econ = U.clone(P.econ);
    for (const s in c.econ.sec) {
      c.econ.sec[s].K *= f; c.econ.sec[s].Y *= f;
      P.econ.sec[s].K *= 1 - f; P.econ.sec[s].Y *= 1 - f;
    }
    c.econ.gdp = P.econ.gdp * f; P.econ.gdp *= 1 - f;
    c.econ.gdpHist = c.econ.gdpHist.map((g) => g * f);
    P.econ.gdpHist = P.econ.gdpHist.map((g) => g * (1 - f));
    c.fiscal = U.clone(P.fiscal); c.fiscal.debt = 0;
    c.pol = Object.assign(U.clone(P.pol), { legitimacy: 55, support: 55, stability: 45, localPower: 30, revolutionPressure: 0, exhaustion: 0 });
    c.tech = U.clone(P.tech);
    c.mil = Object.assign(U.clone(P.mil), { personnel: P.mil.personnel * f * 1.2, exhaustion: 0 });
    P.mil.personnel *= 1 - f;
    c.res = U.clone(P.res);
    for (const k of ['coal', 'oil', 'energyCap', 'energyDemand0']) { c.res[k] = P.res[k] * f; P.res[k] *= 1 - f; }
    c.goal = 'stabilize'; c.goal0 = 'stabilize';
    c.founded = w.year; c.parent = parentId;
    for (const r of regionIds) {
      w.regions[r].owner = id;
      P.regions = P.regions.filter((x) => x !== r);
      c.regions.push(r);
    }
    w.countries[id] = c;
    for (const other of U.ids(w)) if (other !== id) State.addRelation(w, id, other, 0, '');
    const r = U.relation(w, id, parentId);
    r.base = -35; r.rel = -40; r.baseWhy = '分裂自' + P.name;
    w.series.c[id] = WS.History.emptySeries(w.series.labels.length);
    return c;
  };

  // ---- 動態建立國際組織 ----
  State.createOrganization = function (w, name, members, purpose) {
    w.counters.org++;
    const id = 'ORG' + String(w.counters.org).padStart(3, '0');
    w.organizations[id] = { id, name, members: members.slice().sort(), purpose, founded: w.year, active: true };
    return w.organizations[id];
  };

  // ---- 動態建立新制度（制度不存在時，從既有制度組合出新的制度型態）----
  State.ensureRegime = function (w, key, def) {
    if (!U.regime(w, key)) w.customRegimes[key] = def;
    return key;
  };
})(typeof window !== 'undefined' ? window : globalThis);
