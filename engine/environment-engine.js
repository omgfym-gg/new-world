// Environment Engine：糧食、能源（煤、石油）、污染與資源共享（第 6.7 節）
(function (root) {
  const WS = (root.WS = root.WS || {});
  const dt = 1 / 12;
  const Env = (WS.Environment = {});

  Env.importCover = function (c, w) {
    const e = w.params.economy;
    let cover = c.econ.openness * Math.min(1, (c.econ.gdppc || 500) / e.importFoodGdppcRef);
    if (c.flags.atWar) cover *= 0.6;
    if (w.rules.currency === false) cover *= 0.6;
    return cover;
  };

  Env.energyDemand = function (c, w) {
    const U = WS.util;
    const eff = Math.min(0.5, U.adopt(c, 'petrochem') * WS.Data.techs.petrochem.effects.energyEff);
    return c.econ.sec.ind.Y * (1 - eff);
  };

  Env.step = function (w, ids, ctx) {
    const U = WS.util;
    const p = w.params.environment;
    for (const id of ids) {
      const c = w.countries[id];
      const r = c.res;
      const P = U.popTotal(c);

      // 每年一月決定本年收成
      if (w.month === 1) {
        r.harvest = Math.max(0.6, 1 + ctx.rng.normal(0, p.harvestSd));
        if (ctx.rng.chance(p.droughtChance)) {
          r.harvest *= p.droughtHarvest;
          WS.Events.log(w, ctx, {
            type: 'conditional', title: c.name + '發生旱災', countries: [id], level: 2,
            text: '本年收成大幅下降，糧食供應受影響。',
            causes: ['年度氣候波動（隨機種子決定，機率 ' + (p.droughtChance * 100).toFixed(0) + '%）'],
            effects: ['收成 ×' + p.droughtHarvest]
          });
        }
      }

      // 糧食
      const produced = (c.econ.sec.agri.base || c.econ.sec.agri.Y) * r.harvest * r.foodCoef;
      const ratio = produced / P;
      let eff = ratio;
      if (ratio < 1) eff = ratio + (1 - ratio) * Env.importCover(c, w);
      r.foodRatio = ratio;
      r.foodEff = eff;
      const delta = eff - 1;
      r.foodStock += delta;
      U.cause(c, 'food', '國內糧食生產', ratio - 1, r.harvest < 0.97 ? '收成不佳' : r.harvest > 1.03 ? '收成良好' : '一般收成');
      if (eff > ratio) U.cause(c, 'food', '糧食進口', eff - ratio, c.flags.atWar ? '戰時進口受阻' : '對外貿易');
      if (r.foodStock < 0) {
        r.shortage = U.clamp((1 - eff) * 2, 0, 1);
        r.foodStock = 0;
      } else r.shortage = 0;
      r.foodStock = Math.min(p.foodStockCap, r.foodStock);

      // 能源
      const demand = Env.energyDemand(c, w);
      const oilUsable = U.adopt(c, 'ice');
      const reserves = r.coal + r.oil * oilUsable;
      let cap = r.energyCap * (1 + U.adopt(c, 'nuclear') * 0.3);
      cap *= Math.min(1, reserves / Math.max(1e-6, r.energyCap * p.reserveDepletionYears));
      const domestic = Math.min(cap, demand);
      let cover = c.econ.openness * (c.flags.atWar ? 0.6 : 1) * (w.rules.currency === false ? 0.6 : 1);
      if (w.rules.resourceSharing) cover = Math.max(cover, 0.8);
      const supplied = domestic + (demand - domestic) * cover;
      const prevRatio = r.energyRatio;
      r.energyRatio = demand > 0 ? Math.min(1, supplied / demand) : 1;
      if (Math.abs(r.energyRatio - prevRatio) > 1e-9)
        U.cause(c, 'energy', domestic < demand ? '國內能源不足，依賴進口' : '國內能源充足', r.energyRatio - prevRatio, reserves < r.energyCap * p.reserveDepletionYears ? '儲量下降' : null);
      const extraction = domestic * dt;
      const oilShare = r.oil > 0 ? p.oilShareMax * oilUsable : 0;
      r.oil = Math.max(0, r.oil - extraction * oilShare);
      r.coal = Math.max(0, r.coal - extraction * (1 - oilShare));

      // 污染
      const target = 20 * domestic / Math.max(1e-6, r.energyDemand0);
      r.pollution += (target - r.pollution) * p.pollutionDecay * 12 * dt;
    }

    // 資源共享規則：糧食盈餘流向短缺地區
    if (w.rules.resourceSharing) {
      let pool = 0, need = 0;
      const donors = [], recips = [];
      for (const id of ids) {
        const c = w.countries[id];
        const P = U.popTotal(c);
        if (c.res.foodStock > p.sharingStockFloor) { const g = (c.res.foodStock - p.sharingStockFloor) * 0.1 * P; pool += g; donors.push([c, g, P]); }
        else if (c.res.foodStock < 1) { const n = (1 - c.res.foodStock) * P; need += n; recips.push([c, n, P]); }
      }
      const moved = Math.min(pool, need);
      if (moved > 0) {
        for (const [c, g, P] of donors) { const x = (moved * g / pool) / P; c.res.foodStock -= x; U.cause(c, 'food', '資源共享（送出）', -x); }
        for (const [c, n, P] of recips) {
          const x = (moved * n / need) / P;
          c.res.foodStock += x; U.cause(c, 'food', '資源共享（收到）', x);
          if (c.res.foodStock > 0) c.res.shortage = 0;
        }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
