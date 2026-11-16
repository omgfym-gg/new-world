// Politics Engine：穩定度、支持度、合法性、衝突、腐敗、行政、地方勢力、軍隊忠誠（第 6.1 節）
(function (root) {
  const WS = (root.WS = root.WS || {});
  const dt = 1 / 12;
  const Pol = (WS.Politics = {});

  Pol.regimeLegitimacyTerm = function (c, w) {
    const edu = c.demo.edu, pol = c.pol;
    switch (c.regime) {
      case 'monarchy': return [-0.04 * edu, '教育普及削弱君權正當性'];
      case 'constitutional': return [0.5 - 0.01 * edu, '君主立憲的妥協'];
      case 'republic': return pol.stability > 50 ? [0.5, '民主制度運作正常'] : [-1, '民主制度運作不穩'];
      case 'authoritarian': return [-0.02 * edu + 30 * c.econ.growth, '威權政體依賴經濟表現'];
      case 'warlord': return [-2, '國家分裂、中央失去權威'];
      case 'socialist': return [0.5 + 0.03 * (pol.support - 50), '意識形態動員'];
      case 'commune': return [0.04 * (pol.support - 50), '地區共治依賴居民認同'];
      default: return [0, '新制度'];
    }
  };

  Pol.step = function (w, ids, ctx) {
    const U = WS.util, pp = w.params.politics;
    for (const id of ids) {
      const c = w.countries[id];
      const pol = c.pol, ec = c.econ, f = c.fiscal;
      const regime = U.regime(w, c.regime) || {};

      // ---- 穩定度 ----
      const factors = {
        '政府合法性': pp.wLegitimacy * (pol.legitimacy - 50),
        '經濟狀況': U.clamp(pp.wGrowth * ec.growth, -6, 4),
        '糧食供應': -pp.wFood * c.res.shortage,
        '行政效率': pp.wAdmin * (pol.admin - 50),
        '民眾支持': pp.wSupport * (pol.support - 50),
        '社會衝突': -pp.wConflict * Math.max(0, pol.conflict - 30),
        '腐敗': -pp.wCorruption * Math.max(0, pol.corruption - 30),
        '戰爭消耗': -pp.wExhaustion * pol.exhaustion,
        '物價上漲': -pp.wInflation * Math.max(0, ec.inflation - 0.05)
      };
      let tot = 0;
      for (const k in factors) tot += factors[k];
      // 飽和：越接近上下限越難再變動；另有不受飽和影響的回歸常態力量
      const scale = tot > 0 ? (1 - pol.stability / 100) * 1.5 : 0.5 + pol.stability / 100;
      for (const k in factors) U.cause(c, 'stability', k, factors[k] * scale * dt);
      const rev = -pp.stabilityReversion * (pol.stability - 50);
      U.cause(c, 'stability', '制度慣性（回歸常態）', rev * dt);
      pol.stability = U.clamp(pol.stability + (tot * scale + rev) * dt, 0, 100);

      // ---- 民眾支持 ----
      const supT = U.clamp(50 + 300 * ec.growth - 40 * c.res.shortage - 200 * Math.max(0, ec.inflation - 0.05)
        + 100 * (f.budget.welfare - 0.1) - 0.5 * (c.demo.unemployment * 100 - 5) - 0.2 * pol.exhaustion, 5, 95);
      pol.support += (supT - pol.support) * pp.supportAdjust * dt;

      // ---- 合法性 ----
      const [rt, rtWhy] = Pol.regimeLegitimacyTerm(c, w);
      const legParts = {
        '民眾支持': pp.legSupport * (pol.support - 50),
        '制度因素': rt,
        '領導人能力': (c.leader.comp - 0.5) * 4,
        '長期回歸': -pp.legitimacyReversion * (pol.legitimacy - 50)
      };
      let dl = 0;
      for (const k in legParts) { dl += legParts[k]; U.cause(c, 'legitimacy', k, legParts[k] * dt, k === '制度因素' ? rtWhy : k === '領導人能力' ? c.leader.name : null); }
      pol.legitimacy = U.clamp(pol.legitimacy + dl * dt, 0, 100);

      // ---- 社會衝突 ----
      const autocracy = regime.family === 'autocracy' || regime.family === 'mixed';
      const cParts = {
        '貧富差距': pp.conflictInequality * (pol.inequality - 40),
        '糧食短缺': pp.conflictFood * c.res.shortage,
        '地方勢力': pp.conflictLocal * (pol.localPower - 50),
        '教育提高政治參與要求': autocracy ? pp.conflictEducation * (c.demo.edu - 30) : 0,
        '政治穩定度': -pp.conflictStability * (pol.stability - 50),
        '失業': 0.2 * (c.demo.unemployment * 100 - 5),
        '衝突自然消退': -pp.conflictReversion * (pol.conflict - 40)
      };
      let dc = 0;
      for (const k in cParts) { dc += cParts[k]; U.cause(c, 'conflict', k, cParts[k] * dt); }
      pol.conflict = U.clamp(pol.conflict + dc * dt, 0, 100);
      pol.revolutionPressure = Math.max(0, pol.revolutionPressure - 5 * dt);

      // ---- 腐敗、行政、地方勢力、軍隊忠誠 ----
      const planned = WS.Economy.isPlanned(c, w) || w.rules.currency === false;
      let dCorr = (50 - pol.admin) * 0.02 + pp.corruptionDrift * (planned ? 1.5 : 1) - (regime.family === 'democracy' ? 0.5 : 0);
      if ((c.flags.anticorruptionUntil || 0) > w.tick) dCorr -= 3;
      pol.corruption = U.clamp(pol.corruption + dCorr * dt, 0, 100);

      let techAdmin = 0;
      for (const t in c.tech) { const a = WS.Data.techs[t].effects.admin; if (a) techAdmin += a * c.tech[t].adoption * 0.1; }
      const dAdm = (f.budget.admin - 0.15) * 20 + c.demo.edu * 0.01 - 0.3 + techAdmin;
      pol.admin = U.clamp(pol.admin + dAdm * dt, 0, c.regime === 'warlord' ? 35 : 100);

      const dLoc = pp.localPowerFromInstability * (40 - pol.stability) + 0.03 * (50 - pol.admin);
      pol.localPower = U.clamp(pol.localPower + dLoc * dt, c.regime === 'warlord' ? 60 : 0, 100);

      const dArmy = (f.budget.military - 0.25) * 20 + 0.02 * (pol.support - 50) - 0.05 * pol.exhaustion + 0.02 * (pol.legitimacy - 50);
      pol.armyLoyalty = U.clamp(pol.armyLoyalty + dArmy * dt, 0, 100);

      if (!c.flags.atWar) pol.exhaustion = Math.max(0, pol.exhaustion - 2);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
