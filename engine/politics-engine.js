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
      case 'colonial': return [-(0.5 + 0.04 * edu), '外族統治：教育越普及，民族意識越強'];
      case 'commune': return [0.04 * (pol.support - 50), '地區共治依賴居民認同'];
      default: return [0, '新制度'];
    }
  };

  // 世界規則對民眾支持目標的影響（基本收入、不需要工作、一胎化；預設為 0）
  Pol.ruleSupport = function (w) {
    const r = w.params.rules;
    let s = 0;
    if (w.rules.work === 'ubi') s += r.ubiSupport;
    if (w.rules.work === 'postwork') s += r.postworkSupport;
    if (w.rules.birth === 'one') s += r.birthOneSupport;
    return s;
  };
  // 宗教規則對合法性的影響：[每年變化, 原因]，沒有影響時為 null
  Pol.religionLegitimacy = function (c, w) {
    const r = w.params.rules;
    if (w.rules.religion === 'theocracy') return [r.theocracyLegitimacy, '政教合一：宗教權威支持政府'];
    if (w.rules.religion === 'none' && c.regime === 'monarchy') return [r.noReligionMonarchy, '沒有宗教：君權神授不再成立'];
    return null;
  };

  Pol.step = function (w, ids, ctx) {
    const U = WS.util, pp = w.params.politics;
    for (const id of ids) {
      const c = w.countries[id];
      const pol = c.pol, ec = c.econ, f = c.fiscal;
      const regime = U.regime(w, c.regime) || {};

      // ---- 動亂疲乏：長期不穩會累積，穩定後逐漸消退 ----
      pol.turmoil = Math.max(0, (pol.turmoil || 0) + (pol.stability < pp.turmoilThreshold ? dt : -2 * dt));
      const fatigue = Math.min(1, pol.turmoil / pp.turmoilFatigueYears);

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
      if (fatigue > 0) factors['長期動亂後社會渴望秩序'] = pp.fatigueStability * fatigue;
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
        + 100 * (f.budget.welfare - 0.1) - 0.5 * (c.demo.unemployment * 100 - 5) - 0.2 * pol.exhaustion + Pol.ruleSupport(w), 5, 95);
      pol.support += (supT - pol.support) * pp.supportAdjust * dt;

      // ---- 合法性 ----
      const [rt, rtWhy] = Pol.regimeLegitimacyTerm(c, w);
      const legParts = {
        '民眾支持': pp.legSupport * (pol.support - 50),
        '制度因素': rt,
        '領導人能力': (c.leader.comp - 0.5) * 4,
        '長期回歸': -pp.legitimacyReversion * (pol.legitimacy - 50)
      };
      const rel = Pol.religionLegitimacy(c, w);
      if (rel) legParts[rel[1]] = rel[0];
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
      if (w.rules.religion === 'theocracy') cParts['教育普及與宗教權威的摩擦'] = w.params.rules.theocracyConflictEdu * Math.max(0, c.demo.edu - 30);
      if (fatigue > 0) cParts['長期動亂後的厭戰情緒'] = -pp.fatigueConflict * fatigue;
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
