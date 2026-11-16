// Population Engine：出生、死亡、老化、遷移、教育與醫療（第 6.3 節）
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = () => WS.util;
  const dt = 1 / 12;
  const KEYS = ['c0', 'c1', 'c2', 'c3'];

  const Population = (WS.Population = {});

  Population.healthTarget = function (c, w) {
    const p = w.params.population;
    let t = c.demo.healthBias || 0;
    for (const id in WS.Data.techs) {
      const e = WS.Data.techs[id].effects.health;
      if (e) t += U().adopt(c, id) * e * p.medTechWeight;
    }
    const gdp = Math.max(1e-6, c.econ.gdp);
    t += p.healthWelfareGain * ((c.fiscal.amounts.welfare || 0) / gdp);
    t += Population.devHealth(c, w) + Population.medDiffusion(c, w);
    t -= w.params.environment.pollutionHealthPenalty * (c.res.pollution / 100);
    return U().clamp(t, 0.05, 0.95);
  };

  // 發展程度：營養、住居、醫療可及性隨人均 GDP 改善
  Population.devHealth = function (c, w) {
    const p = w.params.population;
    const dev = Math.min(1, Math.max(0, c.econ.gdppc || 0) / p.healthDevRef);
    return p.healthDevGain * Math.pow(dev, p.healthDevExp);
  };

  // 醫療知識擴散：世界上已普及的醫療科技，即使本國沒有研發，也會依行政能力逐步引進
  Population.medLevel = function (c) {
    let s = 0;
    for (const id in WS.Data.techs) {
      const e = WS.Data.techs[id].effects.health;
      if (e) s += U().adopt(c, id) * e;
    }
    return s;
  };
  Population.medDiffusion = function (c, w) {
    const p = w.params.population;
    let frontier = 0;
    for (const id of U().ids(w)) frontier = Math.max(frontier, Population.medLevel(w.countries[id]));
    const gap = Math.max(0, frontier - Population.medLevel(c));
    const absorb = p.medAbsorbBase + (1 - p.medAbsorbBase) * c.pol.admin / 100;
    return p.medDiffusion * p.medTechWeight * gap * absorb;
  };

  Population.step = function (w, ids, ctx) {
    const u = U();
    const p = w.params.population;
    const rationing = w.rules.currency === false;
    for (const id of ids) {
      const c = w.countries[id];
      const d = c.demo;
      const pol = c.pol;
      const shortage = c.res.shortage;
      const atWar = c.flags.atWar ? 1 : 0;

      // 人口轉型：城市化與教育降低生育
      const ff = WS.State.fertFactor(c, w) / d.fertFactor0;
      // 生育率向「轉型完成後的低生育水準」(fertMin) 收斂，各國起點不同、終點相近
      d.fert = Math.min(d.fertBase, p.fertMin) + Math.max(0, d.fertBase - p.fertMin) * Math.min(1.3, ff);
      const fertile = c.pop.c1 + c.pop.c2 * p.fertileWeight25to64;
      const births = fertile * d.fert * dt * (1 - p.shortageBirthPenalty * shortage) * (1 - p.warBirthPenalty * atWar);

      const mortMult = d.mortScale * (1.15 - d.health) / (1.15 - d.health0);
      const foodMult = p.shortageDeathBoost * shortage * (rationing ? 0.7 : 1);
      const conflictMult = pol.conflict > 70 ? p.conflictDeathBoost * (pol.conflict - 70) / 30 : 0;
      let baseD = 0, foodD = 0, conflictD = 0;
      const deaths = [0, 0, 0, 0];
      KEYS.forEach((k, i) => {
        // 醫療進步對各年齡層的效果不同：嬰幼兒死亡下降最多，老年死亡下降較少
        const ageMult = d.mortScale * (1 - p.healthAgeEffect[i] * (1 - mortMult / d.mortScale));
        const b = c.pop[k] * p.baseMortality[i] * ageMult * dt;
        deaths[i] = b * (1 + foodMult + conflictMult);
        baseD += b; foodD += b * foodMult; conflictD += b * conflictMult;
      });

      // 老化流動
      const flow = [c.pop.c0 * p.agingRate[0] * dt, c.pop.c1 * p.agingRate[1] * dt, c.pop.c2 * p.agingRate[2] * dt];
      c.pop.c0 += births - deaths[0] - flow[0];
      c.pop.c1 += flow[0] - deaths[1] - flow[1];
      c.pop.c2 += flow[1] - deaths[2] - flow[2];
      c.pop.c3 += flow[2] - deaths[3];
      for (const k of KEYS) c.pop[k] = Math.max(0.001, c.pop[k]);

      d.births = births; d.deaths = baseD + foodD + conflictD;
      u.cause(c, 'population', '出生', births, d.health < 0.3 ? '高生育率社會' : '一般生育');
      u.cause(c, 'population', '死亡', -baseD, '一般死亡');
      if (foodD) u.cause(c, 'population', '死亡', -foodD, '糧食短缺');
      if (conflictD) u.cause(c, 'population', '死亡', -conflictD, '社會動亂');

      // 教育：取決於教育支出
      const gdp = Math.max(1e-6, c.econ.gdp);
      const eduShare = (c.fiscal.amounts.education || 0) / gdp;
      const gEdu = p.eduGainPerGdpShare * eduShare * (1 - d.edu / 100);
      const gUrban = p.eduUrban * d.urban * (1 - d.edu / 100);
      const lEdu = p.eduDecay * d.edu / 50;
      d.edu = u.clamp(d.edu + (gEdu + gUrban - lEdu) * dt, 1, 100);
      u.cause(c, 'education', '教育支出', gEdu * dt, '佔 GDP ' + (eduShare * 100).toFixed(2) + '%');
      u.cause(c, 'education', '城市生活與社會擴散', gUrban * dt);
      u.cause(c, 'education', '人口更替與知識流失', -lEdu * dt);

      // 醫療水準
      const ht = Population.healthTarget(c, w);
      const dh = (ht - d.health) * p.healthAdjustRate * dt;
      d.health += dh;
      const why = ht <= d.health ? '醫療投入不足或污染' : Population.medDiffusion(c, w) > 0.05 ? '引進他國醫療科技（疫苗、抗生素等）' : Population.devHealth(c, w) > 0.1 ? '生活水準提高（營養、住居、醫療可及性）' : '醫療科技與公共衛生';
      u.cause(c, 'health', why, dh);
    }

    // 遷移：總量守恆，從推力國家流向拉力國家
    const mig = w.rules.migration;
    if (mig === 0) { for (const id of ids) w.countries[id].demo.migration = 0; return; }
    const mult = mig === 2 ? 3 : 1;
    let totPop = 0, totGdp = 0;
    for (const id of ids) { totPop += u.popTotal(w.countries[id]); totGdp += w.countries[id].econ.gdp; }
    const avg = totGdp / totPop;
    const desire = {};
    let out = 0, pullSum = 0;
    for (const id of ids) {
      const c = w.countries[id];
      const P = u.popTotal(c);
      const rel = c.econ.gdp / P / avg;
      let dsr = p.migrationPull * Math.log(Math.max(0.05, rel)) - p.migrationConflictPush * Math.max(0, c.pol.conflict - 55) / 45;
      if (c.flags.atWar) dsr -= 0.001;
      // 移民阻力：經濟性移出受交通、距離與出境限制影響（以貿易開放度近似）；
      // 移入受接收國容量與移民政策限制（開放度越低、人口越多越難吸收）
      if (dsr < 0) dsr *= p.migrationOutBase + (1 - p.migrationOutBase) * c.econ.openness;
      else dsr *= p.migrationInBase + (1 - p.migrationInBase) * c.econ.openness;
      dsr = u.clamp(dsr * mult, -p.migrationCap * mult, p.migrationCap * mult * 0.7);
      desire[id] = dsr;
      if (dsr < 0) out += -dsr * P * dt; else pullSum += dsr * P;
    }
    // 接收國容量：實際遷移量 = min(想移出的人數, 各接收國能吸收的總量)，移出國按比例縮減
    const flow = Math.min(out, pullSum * dt);
    const outScale = out > 0 ? flow / out : 0;
    for (const id of ids) {
      const c = w.countries[id];
      const P = u.popTotal(c);
      let m = 0;
      if (desire[id] < 0) m = desire[id] * P * dt * outScale;
      else if (pullSum > 0) m = (flow * desire[id] * P) / pullSum;
      c.demo.migration = m;
      c.pop.c2 = Math.max(0.001, c.pop.c2 + m);
      if (m) u.cause(c, 'population', '淨遷移', m, m < 0 ? (c.pol.conflict > 55 ? '動亂與貧困推力' : '經濟機會較少') : '經濟機會吸引移民');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
