// Rule System：世界規則、衝突檢查、自然語言轉換、制度轉換（第 11 章、3.3–3.4 節）
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Rules = (WS.Rules = {});

  Rules.conflicts = function (rules) {
    return WS.Data.ruleConflicts.filter((c) => c.test(rules));
  };

  // 自然語言 → 規則（第一版：關鍵字比對；之後可接 AI，但 AI 只能產生同樣格式的規則建議）
  Rules.parseNL = function (text) {
    const set = {}, matched = [];
    for (const p of WS.Data.nlPatterns) {
      if (p.re.test(text)) { Object.assign(set, p.set); matched.push(p.text); }
    }
    return { set, matched };
  };

  Rules.describe = function (key, value) {
    const d = WS.Data.rules[key];
    if (d.type === 'bool') return value ? d.on : d.off;
    const ch = d.choices.find((x) => x[0] === value);
    return ch ? ch[1] : String(value);
  };

  Rules.conversionSteps = function (key, value) {
    const d = WS.Data.rules[key];
    if (d.type === 'bool') return (value ? d.onConversion : d.offConversion) || [];
    return ['相關系統的計算倍率改為「' + Rules.describe(key, value) + '」'];
  };

  // 根據目前規則，套用必要的結構轉換（建立世界時、或規則改變時）
  Rules.applyAll = function (w, ctx, changedKey) {
    const U = WS.util;
    const ids = U.ids(w);
    if (w.rules.states === false && (changedKey === 'states' || changedKey == null)) {
      for (const id of ids) {
        const c = w.countries[id];
        if (c.regime === 'commune') continue;
        c.flags.formerRegime = c.regime;
        c.regime = 'commune';
        c.name = c.name.endsWith('地區') ? c.name : c.name + '地區';
        c.regimeLabel = c.name + '（地區共治體）';
        c.pol.admin = Math.max(5, c.pol.admin - 10);
        c.pol.legitimacy = 50;
        c.fiscal.budget.military = 0.03;
        U.normalize(c.fiscal.budget);
        c.fiscal.budget0 = U.clone(c.fiscal.budget);
        if (c.goal === 'expand') c.goal = 'prosper';
      }
      for (const k in w.relations) { const r = w.relations[k]; r.base = r.base * 0.3; r.alliance = false; }
    }
    if (w.rules.states === true && changedKey === 'states') {
      for (const id of ids) {
        const c = w.countries[id];
        if (c.regime !== 'commune') continue;
        c.regime = c.flags.formerRegime && c.flags.formerRegime !== 'commune' ? c.flags.formerRegime : 'republic';
        c.name = c.name.replace(/地區$/, '');
        c.regimeLabel = c.name + '（' + U.regime(w, c.regime).name + '）';
        c.pol.legitimacy = 40;
      }
    }
    if (w.rules.war === false || w.rules.states === false) {
      for (const war of w.wars) if (!war.ended) WS.Military.endWar(w, war, 'rule', ctx);
    }
  };

  // 模擬進行中改變規則（觀察者干預，第 13.4 節）
  Rules.change = function (w, ctx, key, value) {
    const next = Object.assign({}, w.rules, { [key]: value });
    const conf = Rules.conflicts(next);
    if (conf.length) return { ok: false, conflicts: conf };
    const old = w.rules[key];
    if (old === value) return { ok: true, unchanged: true };
    w.rules[key] = value;
    Rules.applyAll(w, ctx, key);
    const steps = Rules.conversionSteps(key, value);
    w.transitions.push({ y: w.year, m: w.month, key, from: old, to: value, steps });
    WS.Events.log(w, ctx, {
      type: 'rule', title: `世界規則改變：${WS.Data.rules[key].name} → ${Rules.describe(key, value)}`, countries: [], level: 3,
      causes: ['觀察者（玩家）干預'], effects: steps
    });
    return { ok: true, steps };
  };
})(typeof window !== 'undefined' ? window : globalThis);
