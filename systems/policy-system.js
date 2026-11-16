// Policy System：政策定義。國家 Agent 與玩家使用同一份政策表，經由引擎檢查後才執行。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const U = () => WS.util;

  function shiftBudget(c, key, delta) {
    c.fiscal.budget[key] = Math.max(0.01, c.fiscal.budget[key] + delta);
    U().normalize(c.fiscal.budget);
  }
  function rivals(c, w) {
    return U().ids(w).filter((o) => o !== c.id).map((o) => ({ id: o, r: U().relation(w, c.id, o) }))
      .sort((a, b) => a.r.rel - b.r.rel || (a.id < b.id ? -1 : 1));
  }
  function myWar(c, w) {
    return w.wars.find((x) => !x.ended && (x.attackers.includes(c.id) || x.defenders.includes(c.id)));
  }

  const P = (WS.Policies = {});
  P.myWar = myWar;

  P.defs = {
    agri_invest: {
      name: '農業投資', desc: '把投資轉向農業與灌溉，提高糧食產量。',
      effects: { food: 0.8, growth: 0.2 }, costs: { fiscal: 0.2 },
      apply(c) { c.econ.invAlloc.agri += 0.08; U().normalize(c.econ.invAlloc); shiftBudget(c, 'infrastructure', 0.03); return ['農業投資比例提高', '基礎建設預算 +3%']; }
    },
    food_import: {
      name: '進口糧食', desc: '動用財政向外採購糧食，立即緩解短缺。',
      effects: { food: 1.0 }, costs: { fiscal: 0.4 },
      feasible: (c, w) => c.econ.openness > 0.2 && w.rules.currency !== false ? true : '貿易開放度不足或沒有貨幣',
      apply(c) { const add = 1.5 * c.econ.openness * (c.flags.atWar ? 0.5 : 1); c.res.foodStock += add; c.fiscal.debt += c.econ.gdp * 0.01; U().cause(c, 'food', '政策：進口糧食', add); U().cause(c, 'debt', '政策：進口糧食', c.econ.gdp * 0.01); return [`糧食庫存 +${add.toFixed(1)} 個月`, '國債增加 GDP 的 1%']; }
    },
    industrialize: {
      name: '工業化投資', desc: '提高儲蓄與工業投資比例。',
      effects: { growth: 0.7, tech: 0.2, threat: 0.2 }, costs: { food: 0.1 },
      apply(c) { c.econ.invAlloc.ind += 0.1; U().normalize(c.econ.invAlloc); c.econ.savings = Math.min(0.25, c.econ.savings + 0.01); return ['工業投資比例 +10%', '儲蓄率 +1%']; }
    },
    education: {
      name: '教育改革', desc: '提高教育預算。長期提升人才與生產力，但會提高政治參與要求。',
      effects: { education: 1, tech: 0.3, growth: 0.1 }, costs: { fiscal: 0.2, conflict: 0.05 },
      apply(c) { shiftBudget(c, 'education', 0.05); return ['教育預算 +5%']; }
    },
    research: {
      name: '科研投入', desc: '提高科研預算。',
      effects: { tech: 1 }, costs: { fiscal: 0.2 },
      apply(c) { shiftBudget(c, 'research', 0.03); return ['科研預算 +3%']; }
    },
    military_build: {
      name: '擴軍', desc: '提高軍事預算。',
      effects: { threat: 0.9, war: 0.6, army: 0.4 }, costs: { fiscal: 0.4, growth: 0.2 },
      feasible: (c, w) => w.rules.states === false ? '沒有國家時不能擴軍' : true,
      apply(c) { shiftBudget(c, 'military', 0.08); return ['軍事預算 +8%']; }
    },
    demobilize: {
      name: '裁軍', desc: '降低軍事預算，把資源轉回民生。',
      effects: { fiscal: 0.6, growth: 0.2 }, costs: { army: 0.4 },
      feasible: (c) => (!c.flags.atWar && c.fiscal.budget.military > 0.25) ? true : '戰爭中或軍費已低',
      apply(c) { shiftBudget(c, 'military', -0.08); return ['軍事預算 −8%']; }
    },
    raise_tax: {
      name: '加稅', desc: '提高稅率以改善財政。',
      effects: { fiscal: 0.8 }, costs: { stability: 0.3 },
      feasible: (c) => c.fiscal.taxRate < 0.35 ? true : '稅率已高',
      apply(c) { c.fiscal.taxRate += 0.015; c.pol.support -= 4; U().cause(c, 'stability', '政策：加稅', -1); c.pol.stability -= 1; return ['稅率 +1.5%', '民眾支持 −4']; }
    },
    cut_tax: {
      name: '減稅', desc: '降低稅率，刺激經濟與支持度。',
      effects: { growth: 0.3, stability: 0.2 }, costs: { fiscal: 0.5 },
      feasible: (c) => c.fiscal.debt / c.econ.gdp < 0.5 && c.fiscal.taxRate > 0.03 ? true : '債務過高',
      apply(c) { c.fiscal.taxRate -= 0.015; c.pol.support += 3; return ['稅率 −1.5%', '民眾支持 +3']; }
    },
    austerity: {
      name: '財政緊縮', desc: '降低可容忍的赤字。',
      effects: { fiscal: 0.9 }, costs: { growth: 0.2, stability: 0.2 },
      feasible: (c) => c.fiscal.deficitTol > -0.05 ? true : '已緊縮',
      apply(c) { c.fiscal.deficitTol -= 0.08; c.pol.support -= 3; return ['赤字容忍度 −8%', '民眾支持 −3']; }
    },
    anticorruption: {
      name: '反腐整頓', desc: '兩年內持續壓低腐敗，但會引起既得利益者反彈。',
      effects: { corruption: 1, legitimacy: 0.3 }, costs: { stability: 0.1 },
      apply(c, w) { c.flags.anticorruptionUntil = w.tick + 24; c.pol.corruption -= 3; c.pol.stability -= 2; U().cause(c, 'stability', '政策：反腐整頓', -2); return ['腐敗 −3，之後兩年持續下降', '穩定度 −2']; }
    },
    welfare: {
      name: '民生救濟', desc: '提高社會福利預算。',
      effects: { stability: 0.5, conflict: 0.4, food: 0.3 }, costs: { fiscal: 0.4 },
      apply(c) { shiftBudget(c, 'welfare', 0.05); return ['福利預算 +5%']; }
    },
    repression: {
      name: '鎮壓異議', desc: '短期壓低衝突，但損害合法性。',
      effects: { conflict: 0.9, stability: 0.4 }, costs: { legitimacy: 0.6 },
      feasible: (c, w) => (U().regime(w, c.regime) || {}).repression ? true : '此制度不允許鎮壓',
      apply(c) {
        c.pol.conflict -= 12; c.pol.legitimacy -= 6; c.pol.support -= 6; c.pol.armyLoyalty -= 2;
        U().cause(c, 'conflict', '政策：鎮壓異議', -12); U().cause(c, 'legitimacy', '政策：鎮壓異議', -6);
        return ['社會衝突 −12', '合法性 −6', '民眾支持 −6'];
      }
    },
    political_reform: {
      name: '政治改革', desc: '推動制度改革（例如君主專制→君主立憲、威權→民主），半年後生效。',
      effects: { legitimacy: 0.9, conflict: 0.5 }, costs: { stability: 0.3 },
      feasible: (c) => ['monarchy', 'authoritarian', 'constitutional'].includes(c.regime) && !c.pending.some((p) => p.type === 'reform') ? true : '目前制度沒有可行的改革方向',
      apply(c, w) {
        const to = { monarchy: 'constitutional', authoritarian: 'republic', constitutional: 'republic' }[c.regime];
        c.pending.push({ type: 'reform', to, due: w.tick + 6 });
        c.pol.legitimacy += 5; c.pol.conflict -= 5; c.pol.stability -= 3;
        U().cause(c, 'legitimacy', '政策：政治改革', 5); U().cause(c, 'conflict', '政策：政治改革', -5); U().cause(c, 'stability', '政策：政治改革', -3);
        return [`半年後改為「${WS.Data.regimes[to].name}」`, '合法性 +5', '社會衝突 −5'];
      }
    },
    centralize: {
      name: '中央集權', desc: '削弱地方勢力，提高行政效率。',
      effects: { localPower: 1, stability: 0.2 }, costs: { conflict: 0.2, fiscal: 0.2 },
      apply(c) { c.pol.localPower -= 6; c.pol.admin += 3; c.pol.conflict += 3; shiftBudget(c, 'admin', 0.03); U().cause(c, 'conflict', '政策：中央集權', 3); return ['地方勢力 −6', '行政效率 +3', '社會衝突 +3']; }
    },
    seek_alliance: {
      name: '尋求結盟', desc: '與面對共同威脅的國家結盟。',
      effects: { threat: 0.7 }, costs: {},
      target(c, w) {
        const rs = rivals(c, w);
        const enemy = rs[0];
        if (!enemy || enemy.r.rel > -30) return null;
        const cand = rs.filter((x) => x.id !== enemy.id && !x.r.alliance && !x.r.war && x.r.rel > 15 && U().relation(w, x.id, enemy.id).rel < 0)
          .sort((a, b) => b.r.rel - a.r.rel || (a.id < b.id ? -1 : 1));
        return cand[0] ? cand[0].id : null;
      },
      feasible(c, w) { return this.target(c, w) ? true : '沒有合適的結盟對象'; },
      apply(c, w) { const t = this.target(c, w); const r = U().relation(w, c.id, t); r.alliance = true; WS.Diplomacy.remember(w, c.id, t, 15, '締結同盟'); return [`與${w.countries[t].name}締結同盟`]; }
    },
    improve_relations: {
      name: '外交和解', desc: '向關係最差的國家釋出善意。',
      effects: { threat: 0.5, growth: 0.1, peace: 1 }, costs: {},
      target(c, w) { const r = rivals(c, w).filter((x) => !x.r.war && x.r.rel < -20); return r[0] ? r[0].id : null; },
      feasible(c, w) { return this.target(c, w) ? true : '沒有需要和解的對象'; },
      apply(c, w) { const t = this.target(c, w); WS.Diplomacy.remember(w, c.id, t, 12, '外交和解'); const r = U().relation(w, c.id, t); r.trust += 5; return [`與${w.countries[t].name}關係改善`]; }
    },
    declare_war: {
      name: '發動戰爭', desc: '對敵對國家宣戰。',
      effects: { war: 0 }, costs: { growth: 0.3 },
      target(c, w) {
        const mp = w.params.agents;
        const my = c.mil.power;
        const rs = rivals(c, w).filter((x) => x.r.rel < mp.warRelation && !x.r.war && !x.r.alliance && (x.r.truceUntil || 0) <= w.tick);
        for (const x of rs) {
          const o = w.countries[x.id];
          let theirs = o.mil.power;
          for (const y of U().ids(w)) if (y !== x.id && y !== c.id && U().relation(w, y, x.id).alliance) theirs += w.countries[y].mil.power * 0.7;
          const need = mp.warPowerRatio - (c.leader.aggr - 0.5) * 0.4;
          if (my / Math.max(1e-6, theirs) > need) return { id: x.id, ratio: my / theirs, rel: x.r.rel };
        }
        return null;
      },
      feasible(c, w) {
        if (w.rules.war === false || w.rules.states === false) return '世界規則禁止戰爭';
        if (c.flags.atWar) return '已在戰爭中';
        if (c.pol.stability < 35) return '國內不穩，無力發動戰爭';
        return this.target(c, w) ? true : '沒有具優勢的目標';
      },
      opportunity(c, w) {
        const t = this.target(c, w);
        if (!t) return 0;
        const bias = { expand: 1, security: 0.4, stabilize: 0.2, peace: 0, sharing: 0 }[c.goal] ?? 0.3;
        return Math.min(1, (t.ratio - 1) * 0.6) * bias + (c.leader.aggr - 0.5) * 0.5 + (-t.rel - 40) / 100;
      },
      apply(c, w, ctx) {
        const t = this.target(c, w);
        const o = w.countries[t.id];
        const reasons = [
          `雙邊關係 ${t.rel.toFixed(0)}（${U().relation(w, c.id, t.id).baseWhy || '長期敵對'}）`,
          `軍事力量比 ${t.ratio.toFixed(2)} : 1`,
          `國家目標：${WS.Data.goals[c.goal]}`,
          `領導人 ${c.leader.name} 的侵略傾向 ${(c.leader.aggr * 100).toFixed(0)}`
        ];
        const war = WS.Military.declareWar(w, c.id, t.id, ctx, reasons);
        return war ? [`對${o.name}宣戰`] : [`最後沒有對${o.name}開戰`];
      }
    },
    sue_peace: {
      name: '尋求和談', desc: '戰局不利時尋求停戰。',
      effects: { war: 0.8 }, costs: { legitimacy: 0.2 },
      feasible(c, w) {
        const war = myWar(c, w);
        if (!war) return '目前沒有戰爭';
        const side = war.attackers.includes(c.id) ? 1 : -1;
        return war.score * side < -15 || c.pol.exhaustion > 50 ? true : '戰局尚未不利';
      },
      apply(c, w, ctx) {
        const war = myWar(c, w);
        const side = war.attackers.includes(c.id) ? 1 : -1;
        const enemyEx = Math.max(...(side === 1 ? war.defenders : war.attackers).map((x) => w.countries[x].pol.exhaustion));
        if (enemyEx > 30 || ctx.rng.chance(0.4)) {
          WS.Military.endWar(w, war, war.score * side < -40 ? (side === 1 ? 'defenders' : 'attackers') : 'negotiated', ctx);
          return ['和談成功，戰爭結束'];
        }
        return ['和談遭拒，戰爭持續'];
      }
    }
  };

  // 檢查政策是否可執行（玩家與 AI 共用）
  P.check = function (c, w, id) {
    const d = P.defs[id];
    if (!d) return '沒有這項政策';
    if ((c.cooldown[id] || -1e9) > w.tick) return '冷卻中（' + (c.cooldown[id] - w.tick) + ' 個月）';
    if (d.feasible) { const f = d.feasible(c, w); if (f !== true) return f; }
    return true;
  };

  P.execute = function (c, w, id, ctx, by) {
    const ok = P.check(c, w, id);
    if (ok !== true) return { ok: false, reason: ok };
    const d = P.defs[id];
    const effects = d.apply(c, w, ctx) || [];
    c.cooldown[id] = w.tick + w.params.agents.cooldownMonths;
    for (const k of ['stability', 'legitimacy', 'support', 'conflict', 'corruption', 'localPower', 'admin', 'armyLoyalty'])
      c.pol[k] = U().clamp(c.pol[k], 0, 100);
    return { ok: true, effects, by };
  };
})(typeof window !== 'undefined' ? window : globalThis);
