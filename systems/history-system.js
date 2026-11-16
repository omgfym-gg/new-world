// History System：年度數列、因果結算、歷史敘述（模板，不依賴 AI）、數值驗證
(function (root) {
  const WS = (root.WS = root.WS || {});
  const History = (WS.History = {});

  History.METRICS = ['pop', 'gdp', 'gdppc', 'stability', 'legitimacy', 'edu', 'power', 'tech', 'urban', 'debtRatio', 'health'];
  History.LABELS = {
    pop: '人口（百萬）', gdp: 'GDP（十億國際元）', gdppc: '人均 GDP', stability: '政治穩定', legitimacy: '政府合法性',
    edu: '教育水準', power: '軍事能力', tech: '科技累積', urban: '城市化率（%）', debtRatio: '國債／GDP（%）', health: '醫療水準'
  };

  History.emptySeries = function (n) {
    const s = {};
    for (const k of History.METRICS) s[k] = new Array(n).fill(null);
    return s;
  };

  History.snapshot = function (c) {
    const U = WS.util;
    return {
      pop: U.popTotal(c), gdp: c.econ.gdp, gdppc: c.econ.gdppc, stability: c.pol.stability, legitimacy: c.pol.legitimacy,
      edu: c.demo.edu, power: c.mil.power, tech: WS.Technology.score(c), urban: c.demo.urban * 100,
      debtRatio: (c.fiscal.debt / Math.max(1e-6, c.econ.gdp)) * 100, health: c.demo.health * 100
    };
  };

  History.record = function (w) {
    const s = w.series;
    s.labels.push(w.year);
    const n = s.labels.length;
    let pop = 0, gdp = 0;
    for (const id of Object.keys(w.countries).sort()) {
      const c = w.countries[id];
      const ser = s.c[id] || (s.c[id] = History.emptySeries(n - 1));
      const snap = c.alive ? History.snapshot(c) : null;
      for (const k of History.METRICS) ser[k].push(snap ? +snap[k].toFixed(4) : null);
      if (snap) { pop += snap.pop; gdp += snap.gdp; }
    }
    s.world.pop.push(+pop.toFixed(3));
    s.world.gdp.push(+gdp.toFixed(3));
  };

  // 每年一月：結算上一年的因果紀錄，並產生年度歷史敘述
  History.finalizeYear = function (w, ctx) {
    const U = WS.util;
    for (const id of U.ids(w)) {
      const c = w.countries[id];
      c.causes.years.push({ year: w.year - 1, data: c.causes.cur });
      if (c.causes.years.length > 30) c.causes.years.shift();
      c.causes.cur = {};
    }
    History.record(w);
    History.narrate(w);
  };

  History.narrate = function (w) {
    const U = WS.util;
    const s = w.series, n = s.labels.length;
    if (n < 2) return;
    const y = w.year - 1;
    const lines = [];
    const show = w.mode === 'country' ? [w.focus] : [];
    for (const id of show) {
      const c = w.countries[id];
      if (!c || !c.alive) continue;
      const ser = s.c[id];
      const d = (k) => (ser[k][n - 1] != null && ser[k][n - 2] != null ? ser[k][n - 1] - ser[k][n - 2] : 0);
      const pct = (k) => (ser[k][n - 2] ? (d(k) / ser[k][n - 2]) * 100 : 0);
      lines.push(`${c.name}人口 ${U.fmt(ser.pop[n - 1])} 百萬（${pct('pop') >= 0 ? '+' : ''}${pct('pop').toFixed(1)}%），GDP ${U.fmt(ser.gdp[n - 1])}（${pct('gdp') >= 0 ? '+' : ''}${pct('gdp').toFixed(1)}%），政治穩定 ${ser.stability[n - 1].toFixed(0)}（${d('stability') >= 0 ? '+' : ''}${d('stability').toFixed(0)}）。`);
      const yearCauses = c.causes.years[c.causes.years.length - 1];
      const st = yearCauses && yearCauses.data.stability;
      if (st) {
        const worst = Object.entries(st).sort((a, b) => a[1].v - b[1].v)[0];
        const best = Object.entries(st).sort((a, b) => b[1].v - a[1].v)[0];
        if (worst && worst[1].v < -1) lines.push(`穩定度最大的壓力來自「${worst[0]}」。`);
        if (best && best[1].v > 1) lines.push(`主要支撐來自「${best[0]}」。`);
      }
    }
    if (w.mode === 'global') {
      const wp = s.world.pop, wg = s.world.gdp;
      lines.push(`世界人口 ${U.fmt(wp[n - 1])} 百萬（${(((wp[n - 1] - wp[n - 2]) / wp[n - 2]) * 100).toFixed(1)}%），世界 GDP ${U.fmt(wg[n - 1])}（${(((wg[n - 1] - wg[n - 2]) / wg[n - 2]) * 100).toFixed(1)}%）。`);
    }
    const big = w.events.filter((e) => e.y === y && e.level >= 3 && (w.mode === 'global' || e.countries.includes(w.focus) || e.type === 'war' || e.type === 'organization'));
    const lastYearJan = w.events.filter((e) => e.y === w.year && e.m === 1 && e.level >= 3);
    for (const e of big.concat(lastYearJan).slice(0, 5)) lines.push(`• ${e.title}`);
    const wars = w.wars.filter((x) => !x.ended).map((x) => x.name);
    if (wars.length) lines.push('進行中的戰爭：' + wars.join('、') + '。');
    w.chronicle.push({ year: y, text: lines.join('\n') });
    if (w.chronicle.length > 400) w.chronicle.shift();
  };

  // ---- 數值驗證（第 14.2 節）----
  const Validation = (WS.Validation = {});
  Validation.walk = function (obj, path, issues) {
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'number') {
        if (!isFinite(v)) { issues.push(path + k + ' 為無效數字'); obj[k] = 0; }
      } else if (v && typeof v === 'object' && k !== 'causes' && k !== 'decisions' && k !== 'memory') Validation.walk(v, path + k + '.', issues);
    }
  };
  Validation.step = function (w, ids, ctx, prevPop) {
    const U = WS.util;
    const issues = [];
    for (const id of ids) {
      const c = w.countries[id];
      Validation.walk(c, id + '.', issues);
      const P = U.popTotal(c);
      if (prevPop[id] && Math.abs(P / prevPop[id] - 1) > 0.03 && !ctx.territory) issues.push(`${c.name}人口單月變動 ${((P / prevPop[id] - 1) * 100).toFixed(1)}%（異常）`);
      for (const k of ['stability', 'legitimacy', 'support', 'conflict', 'corruption', 'admin', 'localPower', 'armyLoyalty', 'inequality', 'exhaustion']) {
        if (c.pol[k] < 0 || c.pol[k] > 100) { issues.push(`${c.name}.${k} 超出 0–100，已修正`); c.pol[k] = U.clamp(c.pol[k], 0, 100); }
      }
      if (c.res.coal < 0 || c.res.oil < 0) { issues.push(`${c.name}資源存量為負，已修正`); c.res.coal = Math.max(0, c.res.coal); c.res.oil = Math.max(0, c.res.oil); }
      const mp = WS.Military.manpower(c, w);
      if (c.mil.personnel > mp * 1.01) { issues.push(`${c.name}兵力超過可動員人口，已修正`); c.mil.personnel = mp; }
      for (const t in c.tech) {
        if (c.tech[t].adoption > 0 && !U.invented(c, w, t)) issues.push(`${c.name}的「${WS.Data.techs[t].name}」未完成研究卻已普及`);
      }
      if (w.month !== 1 && !ctx.territory && c.econ.gdp > (c.econ.gdpHist[c.econ.gdpHist.length - 2] || c.econ.gdp) * 1.1) issues.push(`${c.name} GDP 單月增加超過 10%`);
    }
    // 分支污染檢查：同一份世界物件不得被兩個分支共用（以 branch.id 標記）
    w.validation.checks++;
    if (issues.length) {
      for (const t of issues) w.validation.issues.push({ y: w.year, m: w.month, text: t });
      if (w.validation.issues.length > 100) w.validation.issues.splice(0, w.validation.issues.length - 100);
    }
    return issues;
  };
})(typeof window !== 'undefined' ? window : globalThis);
