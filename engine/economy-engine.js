// Economy Engine：三部門生產函數、勞動力、資本、財政、通膨、不均（第 6.2 節）
// 產出 Y = A × L^α × K^β × 技術倍率 × 資源倍率 × 制度倍率
(function (root) {
  const WS = (root.WS = root.WS || {});
  const dt = 1 / 12;
  const SECTORS = ['agri', 'ind', 'serv'];
  const Econ = (WS.Economy = {});

  Econ.isPlanned = (c, w) => w.rules.capitalism === false || !!(WS.util.regime(w, c.regime) || {}).planned;

  // 勞動人口（不含世界規則造成的改變）
  Econ.workforceBase = function (c, w) {
    return (c.pop.c1 * 0.75 + c.pop.c2 * 0.92 + c.pop.c3 * 0.15) * w.params.economy.participation;
  };
  // 實際工作的人：世界規則（基本收入、不需要工作、性別平等）讓勞動參與逐年改變（c.econ.workMult，預設 1）
  Econ.workforce = function (c, w) {
    return Econ.workforceBase(c, w) * (c.econ.workMult ?? 1);
  };

  // 勞動參與的目標倍數與原因
  Econ.workTarget = function (c, w) {
    const r = w.params.rules;
    let t = 1;
    const why = [];
    if (w.rules.work === 'ubi') { t *= r.ubiParticipation; why.push('全民基本收入'); }
    if (w.rules.work === 'postwork') {
      // 糧食不夠時，人們被迫回到工作（機器越能代替農業，越不需要回去）
      const fe = c.res.foodEff ?? 1;
      const back = WS.util.clamp((1 - fe) * r.postworkHungerReturn, 0, 1) * (1 - Econ.machineLevel(c, w, 'agri'));
      t *= r.postworkParticipation + (1 - r.postworkParticipation) * back;
      why.push('人們不需要工作');
      if (back > 0.01) why.push('糧食不足時部分人回去工作');
    }
    if (w.rules.gender === true) { t *= r.genderParticipation; why.push('女性與男性平等工作'); }
    return { t, why: why.join('、') };
  };

  // 機器能補上多少空出來的工作（0–1）：依農業機械、自動化、電腦、AI 的普及程度
  Econ.machineLevel = function (c, w, s) {
    const m = w.params.rules.machines[s] || {};
    let v = 0;
    for (const t in m) v += WS.util.adopt(c, t) * m[t];
    return Math.min(1, v);
  };

  Econ.techMult = function (c, s) {
    let m = 1;
    for (const id in c.tech) {
      const e = WS.Data.techs[id].effects[s];
      if (e) m += c.tech[id].adoption * e;
    }
    return m;
  };

  // 實際收成 = 年度氣候 × 神之手旱災（沒有干預時為 1）
  Econ.harvest = (c, w) => c.res.harvest * (WS.Divine ? WS.Divine.harvestMult(c, w) : 1) * (WS.Future ? WS.Future.harvestMult(c, w) : 1);

  Econ.resMult = function (c, w, s) {
    const e = w.params.economy;
    if (s === 'agri') return Econ.harvest(c, w);
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
    // 人們不需要工作：空出來的工作由機器補上（補得了多少取決於科技）
    const gap = w.rules.work === 'postwork' ? Math.max(0, 1 - (c.econ.workMult ?? 1)) * Econ.workforceBase(c, w) * (1 - c.demo.unemployment) : 0;
    const out = {};
    for (const s of SECTORS) {
      const sec = c.econ.sec[s], sp = e.sectors[s];
      const M = gap ? gap * c.econ.lab[s] * Econ.machineLevel(c, w, s) : 0;
      const L = Math.max(1e-6, workers * c.econ.lab[s] + M);
      const T = Econ.techMult(c, s), R = Econ.resMult(c, w, s), I = Econ.instMult(c, w, s);
      const Y = sec.A * Math.pow(L, sp.alpha) * Math.pow(Math.max(1e-6, sec.K), sp.beta) * T * R * I;
      out[s] = { L, T, R, I, Y };
      if (gap) out[s].M = M;
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
    const eb = e.energyImportBase;
    c.res.energyRatio = Math.min(1, (domestic + (demand0 - domestic) * (eb + (1 - eb) * c.econ.openness)) / Math.max(1e-6, demand0));
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

  Econ.reformStep = function (c, w) {
    const e = w.params.economy, U = WS.util, ec = c.econ;
    const pace = e.reformSpeed * (c.pol.admin / 100) * (c.pol.stability / 100) * dt;
    if (c.pol.stability < e.reformStallStability) {
      // 政局不穩：改革停滯，目標逐漸退回現況
      ec.marketTarget += (ec.market - ec.marketTarget) * 0.2 * dt;
      if (ec.opennessTarget != null) ec.opennessTarget += (ec.openness - ec.opennessTarget) * 0.2 * dt;
      return;
    }
    const dm = (ec.marketTarget - ec.market) * pace;
    if (Math.abs(dm) > 1e-9) { ec.market += dm; U.cause(c, 'market', dm > 0 ? '市場化改革推進' : '市場化倒退', dm); }
    if (ec.opennessTarget != null) {
      const dO = (ec.opennessTarget - ec.openness) * pace;
      if (Math.abs(dO) > 1e-9) { ec.openness += dO; U.cause(c, 'openness', dO > 0 ? '對外開放推進' : '開放度下降', dO); }
    }
  };

  // 吸收先進技術的能力（0–1）：教育、穩定、市場化（計畫經濟打折）、開放度
  Econ.absorb = function (c, w) {
    const e = w.params.economy;
    const market = (c.econ.market ?? 0.6) * (Econ.isPlanned(c, w) ? e.plannedMarketMult : 1);
    const ob = Math.min(1, e.catchUpOpenBase + (w.rules.language === true ? w.params.rules.languageCatchUp : 0));
    return Math.sqrt(c.demo.edu / 100) * (c.pol.stability / 100) * market * (ob + (1 - ob) * c.econ.openness);
  };

  // 每年生產力成長率（回傳 { know, catch }）
  Econ.tfpGrowth = function (c, w) {
    const e = w.params.economy;
    const U = WS.util;
    let lead = 0;
    for (const id of U.ids(w)) lead = Math.max(lead, w.countries[id].econ.gdppc || 0);
    const edu = c.demo.edu / 100, stab = c.pol.stability / 100;
    const rShare = (c.fiscal.amounts.research || 0) / Math.max(1e-6, c.econ.gdp);
    const know = e.tfpKnowledge * edu * (0.5 + 0.5 * stab) * (1 + rShare / e.tfpResearchRef) * (w.rules.work === 'postwork' ? w.params.rules.postworkLearning : 1);
    const gap = lead > 0 && c.econ.gdppc > 0 ? Math.min(e.catchUpMaxGap, Math.max(0, Math.log(lead / c.econ.gdppc))) : 0;
    const ctch = e.catchUpRate * gap * Econ.absorb(c, w);
    return { know, catch: ctch };
  };

  Econ.step = function (w, ids, ctx) {
    const U = WS.util, e = w.params.economy;
    for (const id of ids) {
      const c = w.countries[id];
      const ec = c.econ, d = c.demo;
      const P = U.popTotal(c);

      // 世界規則：勞動參與逐年向目標移動
      const wt = Econ.workTarget(c, w);
      const wm = ec.workMult ?? 1;
      if (Math.abs(wt.t - wm) > 1e-9) {
        ec.workMult = wm + (wt.t - wm) * w.params.rules.workShiftRate * dt;
        ec.workWhy = wt.why || '回到原本的工作方式';
      }

      // 失業
      const planned = Econ.isPlanned(c, w);
      const uT = (planned ? 0.015 : e.unemploymentBase) + Math.max(0, -ec.growth) * e.unemploymentOkun * (1 - ec.lab.agri) + (c.pol.conflict > 60 ? 0.03 : 0);
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

      // 制度改革逐步推進：市場化程度與開放度向目標移動，速度取決於行政效率與穩定度
      Econ.reformStep(c, w);

      // 生產力成長：知識累積（教育、穩定）＋向最富國家追趕（技術擴散，需要教育與穩定來吸收）
      const tfp = Econ.tfpGrowth(c, w);
      for (const s of SECTORS) { ec.sec[s].Aprev = ec.sec[s].A; ec.sec[s].A *= Math.exp((tfp.know + tfp.catch) * dt); }

      // 部門生產與成長歸因
      const out = Econ.computeSectors(c, w);
      let gdp = 0;
      for (const s of SECTORS) {
        const sec = ec.sec[s], o = out[s], sp = e.sectors[s];
        const dY = o.Y - sec.Y;
        const terms = {
          [ec.workMult != null && ec.workMult !== 1 ? `勞動力（${(o.M ? ['機器代替人力'] : []).concat(ec.workWhy.split('、')).join('、')}）` : '勞動力']: sp.alpha * Math.log(o.L / sec.L),
          [sec.K < (sec.Kprev || sec.K) && c.flags.warDamage ? '戰爭破壞' : '資本投資']: sp.beta * Math.log(sec.K / (sec.Kprev || sec.K)),
          '技術進步': Math.log(o.T / sec.T),
          [s === 'agri' ? (WS.Divine && WS.Divine.harvestMult(c, w) < 1 ? '收成與氣候（含神之手旱災）' : '收成與氣候') : '能源供應']: Math.log(o.R / sec.R),
          '政治穩定與制度': Math.log(o.I / sec.I)
        };
        const gA = Math.log(sec.A / (sec.Aprev || sec.A)), gTot = tfp.know + tfp.catch;
        if (gA && gTot > 0) { terms['知識累積'] = gA * tfp.know / gTot; terms['追趕先進國家'] = gA * tfp.catch / gTot; }
        let tot = 0;
        for (const k in terms) tot += terms[k];
        if (Math.abs(tot) > 1e-12 && Math.abs(dY) > 1e-12)
          for (const k in terms) if (terms[k]) U.cause(c, 'gdp', sp.label + '產出', dY * terms[k] / tot, k);
        Object.assign(sec, o);
        if (s === 'agri') sec.base = o.Y / Math.max(1e-6, Econ.harvest(c, w));
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
      const savings = (planned ? e.plannedSavings : ec.savings) * (w.rules.work === 'ubi' ? w.params.rules.ubiSavings : 1);
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
      if (w.rules.work === 'ubi') ineqT -= w.params.rules.ubiInequality;
      if (w.rules.work === 'postwork') ineqT -= w.params.rules.postworkInequality;
      ineqT = U.clamp(ineqT, 15, 85);
      const dI = (ineqT - c.pol.inequality) * w.params.politics.inequalityAdjust * dt;
      c.pol.inequality += dI;

      // 預算慣性：逐年回歸原本的預算結構
      for (const k in f.budget) f.budget[k] += (f.budget0[k] - f.budget[k]) * e.budgetInertia * dt;
      U.normalize(f.budget);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
