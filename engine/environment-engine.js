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
      const produced0 = (c.econ.sec.agri.base || c.econ.sec.agri.Y) * r.harvest * r.foodCoef;
      const dMult = WS.Divine ? WS.Divine.harvestMult(c, w) : 1;
      const fh = WS.Future ? WS.Future.harvestParts(c, w) : null;   // 暖化、核子寒冬（沒有時為 null）
      const ratio0 = produced0 / P;
      const ratioD = ratio0 * dMult;
      const ratio = fh ? ratioD * fh.climate * fh.winter : ratioD;
      let eff = ratio;
      if (ratio < 1) eff = ratio + (1 - ratio) * Env.importCover(c, w);
      r.foodRatio = ratio;
      // 暖化與寒冬占糧食缺口的比例（只做紀錄，讓結局報告能分辨「氣候造成的饑荒」；不影響模擬）
      if (fh && ratio < 1 && ratioD > ratio) r.foodClimate = Math.min(1, (ratioD - ratio) / (1 - ratio)); else if (r.foodClimate) r.foodClimate = 0;
      r.foodEff = eff;
      const delta = eff - 1;
      r.foodStock += delta;
      U.cause(c, 'food', '國內糧食生產', ratio0 - 1, r.harvest < 0.97 ? '收成不佳' : r.harvest > 1.03 ? '收成良好' : '一般收成');
      if (dMult < 1) { U.cause(c, 'food', '神之手：局部旱災', ratioD - ratio0, w.regions[c.divine.drought.region] ? w.regions[c.divine.drought.region].name : null); c.divine.drought.foodLoss += ratio0 - ratioD; }
      if (fh) {
        if (fh.climate < 1) U.cause(c, 'food', '氣候變遷', ratioD * (fh.climate - 1), '全球暖化 ' + w.future.warming.toFixed(1) + '°C');
        if (fh.winter < 1) U.cause(c, 'food', '核子寒冬／撞擊塵埃', ratioD * fh.climate * (fh.winter - 1), '日照不足');
      }
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
      // 潔淨能源（再生能源、核融合）：不受化石燃料儲量限制，也不排放；沒有這些科技時 rs = 0，計算與舊版相同
      const rs = WS.Future ? WS.Future.renewShare(c, w) : 0;
      const capAll = r.energyCap * (1 + U.adopt(c, 'nuclear') * 0.3);
      const noFossil = w.rules.fossil === false;
      let cap = capAll * (1 - rs);
      // 地球沒有石油與煤：只剩水力、木材等（不會耗盡，也不算化石排放）
      if (noFossil) cap *= w.params.rules.noFossilEnergy;
      else cap *= Math.min(1, reserves / Math.max(1e-6, r.energyCap * p.reserveDepletionYears));
      const fossilCap = cap;
      if (rs > 0) cap += capAll * rs;
      const domestic = Math.min(cap, demand);
      r.cleanShare = rs > 0 ? (cap - fossilCap) / Math.max(1e-9, cap) : 0;
      const eb = w.params.economy.energyImportBase;
      let cover = (eb + (1 - eb) * c.econ.openness) * (c.flags.atWar ? 0.6 : 1) * (w.rules.currency === false ? 0.6 : 1);
      if (w.rules.resourceSharing) cover = Math.max(cover, 0.8);
      if (noFossil) cover = 0;   // 世界上沒有化石燃料，國際市場也買不到
      const supplied = domestic + (demand - domestic) * cover;
      const prevRatio = r.energyRatio;
      r.energyRatio = demand > 0 ? Math.min(1, supplied / demand) : 1;
      if (Math.abs(r.energyRatio - prevRatio) > 1e-9)
        U.cause(c, 'energy', noFossil ? '地球沒有石油與煤（只剩水力、木材等）' : domestic < demand ? '國內能源不足，依賴進口' : '國內能源充足', r.energyRatio - prevRatio, noFossil ? (rs > 0 ? '潔淨能源補上一部分' : null) : reserves < r.energyCap * p.reserveDepletionYears ? '儲量下降' : null);
      const extraction = noFossil ? 0 : (rs > 0 ? domestic * fossilCap / Math.max(1e-9, cap) : domestic) * dt;
      // 排放：國內化石能源＋進口能源（進口能源來自模擬範圍外，視為化石能源）
      if (WS.Future) WS.Future.addFossil(w, extraction + (supplied - domestic) * dt);
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
