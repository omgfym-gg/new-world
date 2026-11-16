// Economy Engine：三部門生產函數、勞動力、資本、財政、通膨、不均（第 6.2 節）
// 產出 Y = A × L^α × K^β × 技術倍率 × 資源倍率 × 制度倍率
(function (root) {
  const WS = (root.WS = root.WS || {});
  const dt = 1 / 12;
  const SECTORS = ['agri', 'ind', 'serv'];
  const Econ = (WS.Economy = {});

  Econ.isPlanned = (c, w) => w.rules.capitalism === false || !!(WS.util.regime(w, c.regime) || {}).planned;

  Econ.workforce = function (c, w) {
    return (c.pop.c1 * 0.75 + c.pop.c2 * 0.92 + c.pop.c3 * 0.15) * w.params.economy.participation;
  };

  Econ.techMult = function (c, s) {
    let m = 1;
    for (const id in c.tech) {
      const e = WS.Data.techs[id].effects[s];
      if (e) m += c.tech[id].adoption * e;
    }
    return m;
  };

  Econ.resMult = function (c, w, s) {
    const e = w.params.economy;
    if (s === 'agri') return c.res.harvest;
    if (s === 'ind') return 1 - e.energyIndWeight + e.energyIndWeight * c.res.energyRatio;
    return 1 - e.energyServWeight + e.energyServWeight * c.res.energyRatio;
  };

  Econ.instMult = function (c, w, s) {
    const e = w.params.economy;
    let m = (1 - e.instabilityWeight + e.instabilityWeight * c.pol.stability / 100) * (1 - c.pol.corruption * e.corruptionDrag);
    if (w.rules.currency === false && s !== 'agri') m *= e.noCurrencyEfficiency;
    if (Econ.isPlanned(c, w) && s === 'serv') m *= e.noCapitalismEfficiency;
    return m;
  };

  Econ.fiscal = function (c, w, apply) {
    const U = WS.util, e = w.params.economy, f = c.fiscal, pol = c.pol;
    const gdp = c.econ.gdp;
    const collect = (0.4 + 0.6 * pol.admin / 100) * (1 - pol.corruption / 250) * (1 - pol.localPower / 250);
    f.revenue = gdp * f.taxRate * collect;
    const noMoney = w.rules.currency === false;
    f.interest = noMoney ? 0 : f.debt * e.interestRate;
    let spend = f.revenue * (1 + f.deficitTol);
    if (c.flags.atWar) spend = Math.max(spend, gdp * e.warSpendingShare * (0.3 + 0.7 * pol.admin / 100));
    if (noMoney) spend = f.revenue;
    f.spending = spend;
    const avail = Math.max(0, spend - f.interest);
    const b = Object.assign({}, f.budget);
    if (c.flags.atWar) {
      const rest = 1 - b.military;
      const target = Math.max(b.military, 0.6);
      for (const k in b) if (k !== 'military') b[k] = (b[k] / rest) * (1 - target);
      b.military = target;
    }
    for (const k in b) f.amounts[k] = avail * b[k];
    if (apply && !noMoney) {
      const deficit = (spend - f.revenue) * dt;
      f.debt = Math.max(0, f.debt + deficit);
      if (deficit) {
        const warPart = c.flags.atWar ? Math.max(0, spend - f.revenue * (1 + f.deficitTol)) * dt : 0;
        U.cause(c, 'debt', '財政赤字', deficit - warPart, f.interest > f.revenue * 0.3 ? '利息負擔沉重' : '一般赤字');
        if (warPart) U.cause(c, 'debt', '戰爭支出', warPart);
      }
    }
  };

  Econ.computeSectors = function (c, w) {
    const e = w.params.economy;
    const workers = Econ.workforce(c, w) * (1 - c.demo.unemployment);
    const out = {};
    for (const s of SECTORS) {
      const sec = c.econ.sec[s], sp = e.sectors[s];
      const L = Math.max(1e-6, workers * c.econ.lab[s]);
      const T = Econ.techMult(c, s), R = Econ.resMult(c, w, s), I = Econ.instMult(c, w, s);
      const Y = sec.A * Math.pow(L, sp.alpha) * Math.pow(Math.max(1e-6, sec.K), sp.beta) * T * R * I;
      out[s] = { L, T, R, I, Y };
    }
    return out;
  };

  Econ.calibrate = function (c, w) {
    const U = WS.util, e = w.params.economy;
    const P = U.popTotal(c);
    c.econ.gdppc = (c.econ.gdp / P) * 1000;
    c.res.harvest = 1;
    for (const s of SECTORS) c.econ.sec[s].K = c.econ.sec[s].Y * e.sectors[s].ky;
    // 能源初始化（以「起點工業能源需求」為單位）
    const demand0 = WS.Environment.energyDemand(c, w);
    c.res.energyDemand0 = demand0;
    c.res.energyCap = demand0 * c.res.energySelf;
    c.res.coal = c.res.coal * demand0;
    c.res.oil = c.res.oil * demand0;
    const domestic = Math.min(c.res.energyCap, demand0);
    c.res.energyRatio = Math.min(1, (domestic + (demand0 - domestic) * c.econ.openness) / Math.max(1e-6, demand0));
    c.res.pollution = 20 * domestic / Math.max(1e-6, demand0);
    const workers = Econ.workforce(c, w) * (1 - c.demo.unemployment);
    for (const s of SECTORS) {
      const sec = c.econ.sec[s], sp = e.sectors[s];
      const L = workers * c.econ.lab[s];
      const T = Econ.techMult(c, s), R = Econ.resMult(c, w, s), I = Econ.instMult(c, w, s);
      sec.A = sec.Y / (Math.pow(L, sp.alpha) * Math.pow(sec.K, sp.beta) * T * R * I);
      Object.assign(sec, { L, T, R, I, base: sec.Y });
    }
    c.res.foodCoef = (P * c.res.foodRatio) / c.econ.sec.agri.Y;
    c.econ.gdpHist = new Array(13).fill(c.econ.gdp);
    Econ.fiscal(c, w, false);
    // 醫療水準基準：讓起點醫療目標等於資料值
    c.demo.healthBias = 0;
    c.demo.healthBias = c.demo.health0 - WS.Population.healthTarget(c, w);
    c.econ.inequality0 = c.pol.inequality;
  };

  Econ.step = function (w, ids, ctx) {
    const U = WS.util, e = w.params.economy;
    for (const id of ids) {
      const c = w.countries[id];
      const ec = c.econ, d = c.demo;
      const P = U.popTotal(c);

      // 失業
      const planned = Econ.isPlanned(c, w);
      const uT = (planned ? 0.015 : e.unemploymentBase) + Math.max(0, -ec.growth) * 1.5 + (c.pol.conflict > 60 ? 0.03 : 0);
      d.unemployment += (uT - d.unemployment) * 0.1;

      // 勞動力在部門間移動、城市化
      let agriT = ec.lab0.agri - 1.2 * (d.urban - d.urban0);
      for (const t in c.tech) { const al = WS.Data.techs[t].effects.agriLabour; if (al) agriT -= al * c.tech[t].adoption; }
      // 糧食不足時，糧價上升吸引勞動力回到農業（市場或配給調整）
      const fe = c.res.foodEff ?? c.res.foodRatio;
      if (fe < e.foodSecurityTarget) agriT = Math.max(agriT, ec.lab.agri * Math.pow(e.foodSecurityTarget / Math.max(0.2, fe), 1 / e.sectors.agri.alpha));
      agriT = U.clamp(agriT, 0.03, 0.9);
      ec.lab.agri += (agriT - ec.lab.agri) * e.labourAdjustRate * dt;
      const indFrac = ec.lab0.ind / (1 - ec.lab0.agri);
      ec.lab.ind = (1 - ec.lab.agri) * indFrac;
      ec.lab.serv = 1 - ec.lab.agri - ec.lab.ind;
      const indShare = ec.sec.ind.Y / Math.max(1e-6, ec.gdp);
      const du = (e.urbanBase + e.urbanGrowth * indShare + e.urbanRail * U.adopt(c, 'railway') + e.urbanCar * U.adopt(c, 'automobile') - 0.01 * c.res.shortage) * (1 - d.urban / e.urbanMax) * dt;
      d.urban = U.clamp(d.urban + du, 0.01, e.urbanMax);

      // 部門生產與成長歸因
      const out = Econ.computeSectors(c, w);
      let gdp = 0;
      for (const s of SECTORS) {
        const sec = ec.sec[s], o = out[s], sp = e.sectors[s];
        const dY = o.Y - sec.Y;
        const terms = {
          '勞動力': sp.alpha * Math.log(o.L / sec.L),
          [sec.K < (sec.Kprev || sec.K) && c.flags.warDamage ? '戰爭破壞' : '資本投資']: sp.beta * Math.log(sec.K / (sec.Kprev || sec.K)),
          '技術進步': Math.log(o.T / sec.T),
          [s === 'agri' ? '收成與氣候' : '能源供應']: Math.log(o.R / sec.R),
          '政治穩定與制度': Math.log(o.I / sec.I)
        };
        let tot = 0;
        for (const k in terms) tot += terms[k];
        if (Math.abs(tot) > 1e-12 && Math.abs(dY) > 1e-12)
          for (const k in terms) if (terms[k]) U.cause(c, 'gdp', sp.label + '產出', dY * terms[k] / tot, k);
        Object.assign(sec, o);
        if (s === 'agri') sec.base = o.Y / Math.max(1e-6, c.res.harvest);
        sec.Kprev = sec.K;
        gdp += o.Y;
      }
      c.flags.warDamage = false;
      ec.gdp = gdp;
      ec.gdppc = (gdp / P) * 1000;
      ec.gdpHist.push(gdp);
      if (ec.gdpHist.length > 13) ec.gdpHist.shift();
      ec.growth = gdp / ec.gdpHist[0] - 1;

      // 財政
      Econ.fiscal(c, w, true);
      const f = c.fiscal;

      // 投資與資本累積
      const savings = planned ? e.plannedSavings : ec.savings;
      const inv = gdp * savings + (f.amounts.infrastructure || 0);
      const Kind0 = ec.sec.ind.K;
      for (const s of SECTORS) {
        const sec = ec.sec[s];
        sec.K = Math.max(1e-6, sec.K + (inv * ec.invAlloc[s] - e.depreciation * sec.K) * dt);
      }
      const gK = ec.sec.ind.K / Kind0 - 1;
      if (gK > 0) c.res.energyCap *= 1 + gK;

      // 通膨
      if (w.rules.currency === false) ec.inflation = 0;
      else {
        ec.inflation = e.inflationBase + e.inflationDeficit * Math.max(0, (f.spending - f.revenue) / gdp - 0.02)
          + e.inflationFood * c.res.shortage + e.inflationEnergy * (1 - c.res.energyRatio);
        ec.priceIndex *= 1 + ec.inflation * dt;
      }

      // 不均
      const welfareShare = f.budget.welfare;
      let ineqT = c.econ.inequality0 + 25 * (indShare - 0.2) * (planned ? 0.3 : 1) - (welfareShare - 0.1) * 50;
      if (planned) ineqT -= 15;
      if (w.rules.currency === false) ineqT -= 10;
      ineqT = U.clamp(ineqT, 15, 85);
      const dI = (ineqT - c.pol.inequality) * w.params.politics.inequalityAdjust * dt;
      c.pol.inequality += dI;

      // 預算慣性：逐年回歸原本的預算結構
      for (const k in f.budget) f.budget[k] += (f.budget0[k] - f.budget[k]) * e.budgetInertia * dt;
      U.normalize(f.budget);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
