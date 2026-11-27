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
    text = String(text || '');
    for (const p of WS.Data.nlPatterns) {
      if (p.re.test(text)) { Object.assign(set, p.set); matched.push(p.text); }
    }
    // 文明方向：一次只能一種，取句子裡最先提到的
    const dirs = [];
    for (const d of WS.Data.nlDirections || []) {
      const m = d.re.exec(text);
      if (m) dirs.push({ d, at: m.index });
    }
    dirs.sort((a, b) => a.at - b.at);
    const direction = dirs.length ? dirs[0].d.dir : null;
    if (direction) matched.push(dirs[0].d.text);
    const notes = dirs.length > 1 ? ['句子裡提到不只一種文明方向，一次只能選一種，已選最先提到的；可以在上方「文明方向」修改。'] : [];
    // 「減少軍事擴張」：列出來，說明它由「和平優先」處理（沒有獨立規則，不會另外改數值）
    if (WS.Data.nlLessMilitary && WS.Data.nlLessMilitary.test(text) && set.war !== false) {
      if (direction === 'peace') matched.push('減少軍事擴張 → 已包含在「和平優先」：各國更重視緩和緊張與停戰，較少選擇擴張與開戰');
      else notes.push('「減少軍事擴張」要選「和平優先」才會生效；目前的文明方向不是和平優先。');
    }
    return { set, matched, direction, notes };
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
    if (d.conversion && d.conversion[value]) return d.conversion[value];
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
    // 地球沒有石油與煤：儲量藏起來（之後恢復規則時還原）
    if (w.rules.fossil === false && (changedKey === 'fossil' || changedKey == null)) {
      for (const id of ids) {
        const r = w.countries[id].res;
        if (r.fossilHidden) continue;
        r.fossilHidden = { coal: r.coal, oil: r.oil };
        r.coal = 0; r.oil = 0;
      }
    }
    if (w.rules.fossil !== false && changedKey === 'fossil') {
      for (const id of ids) {
        const r = w.countries[id].res;
        if (!r.fossilHidden) continue;
        r.coal = r.fossilHidden.coal; r.oil = r.fossilHidden.oil;
        delete r.fossilHidden;
      }
    }
    // 各國政體：把所有獨立國家改成同一種政體（一次轉換，之後仍照常演變）
    const gov = w.rules.government;
    if (gov && gov !== 'natural' && w.rules.states !== false && (changedKey === 'government' || changedKey == null)) {
      const to = gov === 'democracy' ? 'republic' : 'monarchy';
      for (const id of ids) {
        const c = w.countries[id];
        if (c.overlord || c.regime === to || c.regime === 'commune') continue;
        c.regime = to;
        c.regimeLabel = c.name + '（' + U.regime(w, to).name + '）';
        U.cause(c, 'legitimacy', '世界規則：各國政體改變', 50 - c.pol.legitimacy, U.regime(w, to).name);
        c.pol.legitimacy = 50;
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
