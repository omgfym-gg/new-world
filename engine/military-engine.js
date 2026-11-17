// Military Engine：軍事能力、動員、戰爭消耗、傷亡、停戰與領土變化（第 6.5 節）
// 軍事能力 = 人員 × 訓練 × 裝備 × 指揮 × 後勤 × 科技（各倍率已標準化）
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Mil = (WS.Military = {});

  Mil.techMult = function (c) {
    let m = 1;
    for (const id in c.tech) { const e = WS.Data.techs[id].effects.mil; if (e) m += e * c.tech[id].adoption; }
    return m;
  };

  Mil.logistics = function (c) {
    return 0.5 + 0.5 * c.res.energyRatio * (0.6 + WS.util.adopt(c, 'railway') * 0.4);
  };

  Mil.updatePower = function (c, w) {
    const m = c.mil;
    const parts = {
      personnel: m.personnel,
      training: 0.5 + m.training / 100,
      equipment: 0.4 + m.equipment * Math.min(1, Math.sqrt(m.fundingRatio || 1)),
      command: 0.7 + 0.3 * (c.leader ? c.leader.comp : 0.5),
      logistics: Mil.logistics(c),
      tech: Mil.techMult(c)
    };
    m.parts = parts;
    m.power = 100 * parts.personnel * parts.training * parts.equipment * parts.command * parts.logistics * parts.tech;
    return m.power;
  };

  Mil.soldierCost = (c, w) => (w.params.military.soldierCostFactor * Math.max(150, c.econ.gdppc)) / 1000;
  Mil.manpower = (c, w) => (c.pop.c1 + c.pop.c2) * 0.5 * w.params.military.manpowerShare * 2;

  Mil.sides = function (w, war) {
    return [war.attackers.filter((x) => w.countries[x] && w.countries[x].alive), war.defenders.filter((x) => w.countries[x] && w.countries[x].alive)];
  };

  Mil.step = function (w, ids, ctx) {
    const U = WS.util, mp = w.params.military;
    let maxIndPc = 0;
    for (const id of ids) { const c = w.countries[id]; maxIndPc = Math.max(maxIndPc, c.econ.sec.ind.Y / U.popTotal(c)); }
    for (const id of ids) {
      const c = w.countries[id], m = c.mil;
      const cost = Mil.soldierCost(c, w);
      const budget = c.fiscal.amounts.military || 0;
      let target = (budget * 0.6) / cost;
      if (w.rules.states === false) target = Math.min(target, U.popTotal(c) * 0.001);
      if (c.flags.atWar) target *= mp.warMobilization;
      target = Math.min(target, Mil.manpower(c, w));
      m.personnel += (target - m.personnel) * mp.personnelAdjust;
      m.fundingRatio = budget / Math.max(1e-6, m.personnel * cost);
      const trT = U.clamp(20 + 0.4 * c.demo.edu + 20 * Math.min(1.5, m.fundingRatio), 10, 95);
      m.training += (trT - m.training) * 0.02;
      let milTech = 0;
      for (const t in c.tech) if (WS.Data.techs[t].field === 'military') milTech += c.tech[t].adoption / 3;
      const eqT = U.clamp(0.15 + 0.5 * (c.econ.sec.ind.Y / U.popTotal(c)) / Math.max(1e-6, maxIndPc) + 0.35 * milTech, 0, 1.2);
      m.equipment += (eqT - m.equipment) * 0.01 * Math.min(2, m.fundingRatio);
      Mil.updatePower(c, w);
    }

    // 戰爭進程
    for (const war of w.wars.slice()) {
      if (war.ended) continue;
      const [att, def] = Mil.sides(w, war);
      if (!att.length || !def.length) { Mil.endWar(w, war, 'collapse', ctx); continue; }
      war.months++;
      const pw = (arr, home) => arr.reduce((s, x, i) => s + w.countries[x].mil.power * (i === 0 ? 1 : 0.7) * (home ? 1.2 : 1), 0);
      const Pa = pw(att, false), Pd = pw(def, true);
      const ratio = Pa / Math.max(1e-6, Pa + Pd);
      war.score = U.clamp(war.score + (ratio - 0.5 + ctx.rng.normal(0, 0.05)) * 12, -100, 100);
      war.lastRatio = ratio;
      const casualties = (side, share) => {
        const totPers = side.reduce((s, x) => s + w.countries[x].mil.personnel, 0);
        for (const x of side) {
          const c = w.countries[x];
          const cas = c.mil.personnel * mp.casualtyRate * share;
          const civ = cas * mp.civilianRatio;
          c.mil.personnel = Math.max(0.001, c.mil.personnel - cas);
          c.pop.c1 = Math.max(0.001, c.pop.c1 - (cas * 0.6 + civ * 0.3));
          c.pop.c2 = Math.max(0.001, c.pop.c2 - (cas * 0.4 + civ * 0.7));
          U.cause(c, 'population', '死亡', -(cas + civ), '戰爭傷亡：' + war.name);
          war.casualties[x] = (war.casualties[x] || 0) + cas + civ;
          c.pol.exhaustion = U.clamp(c.pol.exhaustion + mp.exhaustionBase + mp.exhaustionCasualty * (cas + civ) / U.popTotal(c), 0, 100);
          U.cause(c, 'stability', '戰爭消耗', 0, war.name);
          void totPers;
        }
      };
      casualties(att, 1.5 - ratio);
      casualties(def, 0.5 + ratio);
      Mil.track(w, war);
      // 防守方本土受破壞
      const d0 = w.countries[def[0]];
      for (const s in d0.econ.sec) d0.econ.sec[s].K *= 1 - mp.capitalDamage * ratio;
      d0.flags.warDamage = true;
      const a0 = w.countries[att[0]];
      for (const s in a0.econ.sec) a0.econ.sec[s].K *= 1 - mp.capitalDamage * 0.25 * (1 - ratio);
      a0.flags.warDamage = true;

      const exA = Math.max(...att.map((x) => w.countries[x].pol.exhaustion));
      const exD = Math.max(...def.map((x) => w.countries[x].pol.exhaustion));
      if (Math.abs(war.score) >= mp.peaceScore) Mil.endWar(w, war, war.score > 0 ? 'attackers' : 'defenders', ctx);
      else if (war.months >= 18 && (exA > mp.peaceExhaustion || exD > mp.peaceExhaustion)) Mil.endWar(w, war, war.score > 15 ? 'attackers' : war.score < -15 ? 'defenders' : 'white', ctx);
      else if (war.months >= mp.maxWarMonths) Mil.endWar(w, war, 'white', ctx);
    }
    Mil.refreshFlags(w, ids);
  };

  Mil.refreshFlags = function (w, ids) {
    for (const id of ids) w.countries[id].flags.atWar = false;
    for (const war of w.wars) {
      if (war.ended) continue;
      for (const x of war.attackers.concat(war.defenders)) if (w.countries[x]) w.countries[x].flags.atWar = true;
    }
  };

  Mil.declareWar = function (w, attackerId, defenderId, ctx, reasons) {
    const U = WS.util;
    if (w.rules.war === false || w.rules.states === false) return null;
    const ov = WS.WhatIf ? WS.WhatIf.take(w, (o) => o.kind === 'war' && o.a === attackerId && o.d === defenderId) : null;
    if (ov) {
      const ev = WS.WhatIf.logDivergence(w, ctx, ov, [attackerId, defenderId], ['原世界線中的開戰理由：'].concat(reasons || []));
      ev.effects = ['戰爭沒有爆發，雙方維持和平', '之後是否開戰，仍由各國依自身判斷決定'];
      return null;
    }
    w.counters.war++;
    const A = w.countries[attackerId], D = w.countries[defenderId];
    const war = {
      id: 'W' + w.counters.war, name: `${A.name}－${D.name}戰爭`, start: { y: w.year, m: w.month },
      attackers: [attackerId], defenders: [defenderId], score: 0, months: 0, casualties: {}, ended: false, reasons
    };
    const joined = [];
    for (const x of U.ids(w)) {
      if (x === attackerId || x === defenderId) continue;
      const rd = U.relation(w, x, defenderId), ra = U.relation(w, x, attackerId);
      if (rd.alliance && ra.rel < 30 && !ra.alliance) { war.defenders.push(x); joined.push(`${w.countries[x].name}依同盟加入${D.name}一方`); }
      else if (ra.alliance && rd.rel < -20 && !rd.alliance) { war.attackers.push(x); joined.push(`${w.countries[x].name}依同盟加入${A.name}一方`); }
    }
    for (const a of war.attackers) for (const d of war.defenders) {
      const r = U.relation(w, a, d);
      r.war = war.id; r.alliance = false;
    }
    WS.Diplomacy.remember(w, attackerId, defenderId, -40, `${A.name}對${D.name}宣戰`);
    w.wars.push(war);
    Mil.track(w, war);
    Mil.refreshFlags(w, U.ids(w));
    const ev = WS.Events.log(w, ctx, {
      type: 'war', title: `戰爭爆發：${war.name}`, countries: war.attackers.concat(war.defenders), level: 3, warPair: [attackerId, defenderId],
      major: war.attackers.concat(war.defenders).includes(w.focus),
      text: `${A.name}向${D.name}宣戰。` + (joined.length ? joined.join('；') + '。' : ''),
      causes: reasons, effects: ['雙方進入動員，軍費優先', '貿易中斷', ...joined]
    });
    war.eventId = ev && ev.id;
    return war;
  };

  // 戰況紀錄：每月記下戰局分數、雙方兵力與累計傷亡，只供「戰場畫面」回放用。
  // 純紀錄，不用亂數，也不會被任何計算讀回去，所以不影響模擬結果。
  Mil.track = function (w, war) {
    const sum = (list, f) => list.reduce((s, x) => s + (w.countries[x] ? f(w.countries[x], x) : 0), 0);
    const r1 = (v) => Math.round(v * 1000) / 1000;
    if (!war.track) war.track = [];
    war.track.push({
      y: w.year, m: w.month, s: Math.round(war.score * 10) / 10,
      pa: r1(sum(war.attackers, (c) => (c.alive ? c.mil.personnel : 0))), pd: r1(sum(war.defenders, (c) => (c.alive ? c.mil.personnel : 0))),
      ca: r1(sum(war.attackers, (c, x) => war.casualties[x] || 0)), cd: r1(sum(war.defenders, (c, x) => war.casualties[x] || 0))
    });
    if (war.track.length > 240) war.track.splice(1, 1);
  };

  Mil.endWar = function (w, war, outcome, ctx) {
    const U = WS.util, mp = w.params.military;
    war.ended = true; war.outcome = outcome; war.end = { y: w.year, m: w.month };
    const [att, def] = Mil.sides(w, war);
    for (const a of war.attackers) for (const d of war.defenders) {
      const r = U.relation(w, a, d);
      if (r && r.war === war.id) { r.war = null; r.truceUntil = w.tick + mp.truceMonths; }
    }
    const effects = [];
    let winner = null, loser = null;
    if (outcome === 'attackers') { winner = att[0]; loser = def[0]; }
    if (outcome === 'defenders') { winner = def[0]; loser = att[0]; }
    if (winner && loser) {
      const W = w.countries[winner], L = w.countries[loser];
      if (Math.abs(war.score) >= mp.territoryScore && L.regions.length > 1 && outcome === 'attackers') {
        const reg = L.regions.filter((r) => !w.regions[r].capital).sort((x, y) => w.regions[x].weight - w.regions[y].weight)[0];
        if (reg) {
          Mil.transferRegion(w, reg, loser, winner);
          effects.push(`${L.name}割讓「${w.regions[reg].name}」給${W.name}`);
        }
      }
      const rep = L.econ.gdp * 0.1;
      if (w.rules.currency !== false) {
        L.fiscal.debt += rep; W.fiscal.debt = Math.max(0, W.fiscal.debt - rep * 0.5);
        U.cause(L, 'debt', '戰爭賠款', rep);
        effects.push(`${L.name}支付賠款約 ${U.fmt(rep)}（十億）`);
      }
      L.pol.legitimacy = U.clamp(L.pol.legitimacy - 15, 0, 100);
      U.cause(L, 'legitimacy', '戰敗', -15, war.name);
      W.pol.legitimacy = U.clamp(W.pol.legitimacy + 5, 0, 100);
      U.cause(W, 'legitimacy', '戰勝', 5, war.name);
      WS.Diplomacy.remember(w, winner, loser, -25, war.name + '戰後條約');
    }
    const label = { attackers: '進攻方勝利', defenders: '防守方勝利', white: '停戰（無勝負）', negotiated: '談判停戰', collapse: '一方瓦解', rule: '世界規則禁止戰爭，強制停火' }[outcome];
    Mil.refreshFlags(w, U.ids(w));
    WS.Events.log(w, ctx, {
      type: 'war', title: `${war.name}結束：${label}`, countries: war.attackers.concat(war.defenders), level: 3,
      major: war.attackers.concat(war.defenders).includes(w.focus), parent: war.eventId,
      text: `歷時 ${war.months} 個月。總傷亡約 ${U.fmt(Object.values(war.casualties).reduce((s, x) => s + x, 0), 2)} 百萬人。`,
      causes: [`戰局分數 ${war.score.toFixed(0)}（正值＝進攻方占優）`, `最後一期兵力比 ${(war.lastRatio || 0.5).toFixed(2)}`],
      effects
    });
  };

  Mil.transferRegion = function (w, regionId, fromId, toId) {
    const F = w.countries[fromId], T = w.countries[toId];
    const totalW = F.regions.reduce((s, r) => s + w.regions[r].weight, 0);
    const f = w.regions[regionId].weight / totalW;
    for (const k of ['c0', 'c1', 'c2', 'c3']) { const x = F.pop[k] * f; F.pop[k] -= x; T.pop[k] += x; }
    for (const s in F.econ.sec) {
      const k = F.econ.sec[s].K * f; F.econ.sec[s].K -= k; T.econ.sec[s].K += k;
      // 生產效率 A 不移轉；移轉後產出由新的勞動與資本重新計算
    }
    for (const k of ['coal', 'oil']) { const x = F.res[k] * f; F.res[k] -= x; T.res[k] += x; }
    F.regions = F.regions.filter((r) => r !== regionId);
    T.regions.push(regionId);
    w.regions[regionId].owner = toId;
    WS.util.cause(F, 'population', '領土變化', -WS.util.popTotal(F) * f / (1 - f), w.regions[regionId].name);
  };
})(typeof window !== 'undefined' ? window : globalThis);
