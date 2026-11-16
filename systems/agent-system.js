// Agent System：國家自主決策（第 8 章）
// 流程：讀取狀態 → 判斷問題 → 產生候選政策 → 評估成本效果 → 依國家目標選擇 → 檢查限制 → 執行 → 保存原因
// 不依賴外部 AI：使用規則、評分模型與狀態檢查。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Agents = (WS.Agents = {});

  Agents.problemNames = {
    food: '糧食短缺', stability: '政治不穩', conflict: '社會衝突', fiscal: '財政壓力', threat: '外部威脅',
    growth: '經濟停滯', tech: '科技落後', education: '教育不足', corruption: '腐敗嚴重', legitimacy: '政府合法性不足',
    localPower: '地方勢力坐大', war: '戰爭', army: '軍隊忠誠不足', peace: '國際緊張'
  };

  Agents.goalBias = {
    stabilize: { stability: 1.5, conflict: 1.4, legitimacy: 1.3, localPower: 1.3 },
    expand: { threat: 1.3, growth: 1.2, army: 1.2 },
    prosper: { growth: 1.5, food: 1.2, fiscal: 1.2 },
    security: { threat: 1.6, army: 1.2 },
    industrialize: { growth: 1.5, tech: 1.4 },
    tech: { tech: 1.8, education: 1.5 },
    peace: { peace: 2, threat: 0.6, war: 1.5 },
    sharing: { food: 1.5, peace: 1.5 }
  };

  Agents.problems = function (c, w) {
    const U = WS.util;
    const pol = c.pol;
    const myP = Math.max(1e-6, c.mil.power);
    let threat = 0, tension = 0;
    for (const o of U.ids(w)) {
      if (o === c.id) continue;
      const r = U.relation(w, c.id, o);
      if (r.rel < -30) threat = Math.max(threat, U.clamp((w.countries[o].mil.power / myP - 0.8) / 1.5, 0, 1));
      if (r.rel < -20) tension = Math.max(tension, U.clamp((-r.rel - 20) / 60, 0, 1));
    }
    const war = WS.Policies.myWar(c, w);
    let warP = 0;
    if (war) { const side = war.attackers.includes(c.id) ? 1 : -1; warP = U.clamp(0.5 - war.score * side / 100 + pol.exhaustion / 100, 0, 1); }
    let maxTech = 0;
    for (const o of U.ids(w)) maxTech = Math.max(maxTech, WS.Technology.score(w.countries[o]));
    const debtRatio = c.fiscal.debt / Math.max(1e-6, c.econ.gdp);
    return {
      food: c.res.shortage > 0 ? 1 : c.res.foodStock < 1.5 ? 0.6 : c.res.foodRatio < 0.95 ? 0.3 : 0,
      stability: U.clamp((50 - pol.stability) / 40, 0, 1),
      conflict: U.clamp((pol.conflict - 45) / 40, 0, 1),
      fiscal: U.clamp((debtRatio - 0.6) / 0.8, 0, 1) + U.clamp((c.fiscal.spending - c.fiscal.revenue) / Math.max(1e-6, c.fiscal.revenue) - 0.2, 0, 0.5),
      threat, peace: tension,
      growth: U.clamp((0.02 - c.econ.growth) / 0.04, 0, 1),
      tech: U.clamp(1 - WS.Technology.score(c) / Math.max(1e-6, maxTech), 0, 1) * 0.5,
      education: U.clamp((50 - c.demo.edu) / 50, 0, 1) * 0.5,
      corruption: U.clamp((pol.corruption - 40) / 50, 0, 1),
      legitimacy: U.clamp((40 - pol.legitimacy) / 40, 0, 1),
      localPower: U.clamp((pol.localPower - 50) / 40, 0, 1),
      army: U.clamp((45 - pol.armyLoyalty) / 40, 0, 1),
      war: warP
    };
  };

  // 評估所有政策，回傳排序後的候選清單（玩家介面也使用）
  Agents.evaluate = function (c, w) {
    const probs = Agents.problems(c, w);
    const bias = Agents.goalBias[c.goal] || {};
    const out = [];
    for (const id in WS.Policies.defs) {
      const d = WS.Policies.defs[id];
      const feas = WS.Policies.check(c, w, id);
      let score = 0;
      for (const p in d.effects) score += (probs[p] || 0) * d.effects[p] * (bias[p] || 1);
      for (const k in d.costs) {
        const weight = k === 'fiscal' ? 0.3 + probs.fiscal : k === 'stability' ? 0.3 + probs.stability : k === 'legitimacy' ? 0.3 + probs.legitimacy : k === 'conflict' ? 0.2 + probs.conflict : 0.25;
        score -= d.costs[k] * weight;
      }
      if (id === 'declare_war' && feas === true) score = d.opportunity(c, w);
      if (id === 'political_reform') score += (c.leader.reform - 0.5) * 0.6;
      if (id === 'repression') score -= (c.leader.reform - 0.5) * 0.6;
      if (id === 'military_build') score += (c.leader.aggr - 0.5) * 0.3;
      out.push({ id, name: d.name, score, feasible: feas });
    }
    out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    return { probs, list: out };
  };

  Agents.step = function (w, ids, ctx) {
    const U = WS.util, ap = w.params.agents;
    if (w.tick % ap.decisionInterval !== 0) return;
    for (const id of ids) {
      const c = w.countries[id];
      if (!c.alive || c.controller === 'player') continue;
      const ev = Agents.evaluate(c, w);
      const top = ev.list.filter((x) => x.feasible === true);
      const best = top[0];
      const topProblems = Object.entries(ev.probs).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const rec = {
        y: w.year, m: w.month,
        problems: topProblems.map(([k, v]) => [Agents.problemNames[k], +v.toFixed(2)]),
        alternatives: top.slice(1, 4).map((x) => [x.name, +x.score.toFixed(2)]),
        rejected: ev.list.filter((x) => x.feasible !== true && x.score > (best ? best.score : 0)).slice(0, 2).map((x) => [x.name, x.feasible])
      };
      if (!best || best.score < ap.minScore) {
        rec.policy = null; rec.name = '維持現行政策'; rec.score = best ? +best.score.toFixed(2) : 0;
      } else {
        const res = WS.Policies.execute(c, w, best.id, ctx, 'ai');
        rec.policy = best.id; rec.name = best.name; rec.score = +best.score.toFixed(2); rec.effects = res.effects;
        if (['declare_war', 'political_reform', 'sue_peace', 'seek_alliance'].includes(best.id) || (id === w.focus && w.mode === 'country')) {
          WS.Events.log(w, ctx, {
            type: 'decision', title: `${c.name}決定：${best.name}`, countries: [id], level: best.id === 'declare_war' ? 0 : 1,
            text: (res.effects || []).join('；'),
            causes: rec.problems.map(([n, v]) => `${n}（嚴重度 ${v}）`).concat([`國家目標：${WS.Data.goals[c.goal]}`]),
            decision: rec
          });
        }
      }
      c.decisions.push(rec);
      if (c.decisions.length > 40) c.decisions.shift();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
