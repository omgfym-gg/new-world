// Explain System：世界解釋系統（V1.1 新增核心）
// 只從實際模擬紀錄（因果帳、事件、決策紀錄）找原因，再轉成一般人看得懂的文字。不臆測、不編故事。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Explain = (WS.Explain = {});

  Explain.METRIC_NAMES = {
    population: '人口', gdp: 'GDP', stability: '政治穩定度', legitimacy: '政府合法性', conflict: '社會衝突',
    debt: '國債', food: '糧食庫存（月）', education: '教育水準', health: '醫療水準', research: '科研進度', energy: '能源供應'
  };
  Explain.LINKS = {
    '政府合法性': 'legitimacy', '經濟狀況': 'gdp', '糧食供應': 'food', '社會衝突': 'conflict', '民眾支持': null,
    '糧食短缺': 'food', '政治穩定度': 'stability', '政治穩定與制度': 'stability', '能源供應': 'energy',
    '技術進步': 'research', '收成與氣候': 'food', '教育提高政治參與要求': 'education', '財政赤字': 'debt'
  };

  function agg(list) {
    const out = {};
    for (const data of list) {
      for (const f in data) {
        const o = out[f] || (out[f] = { v: 0, sub: {} });
        o.v += data[f].v;
        for (const s in data[f].sub) o.sub[s] = (o.sub[s] || 0) + data[f].sub[s];
      }
    }
    return out;
  }

  // scope: 'last'（上一個完整年度）、'current'（本年至今）、數字 N（最近 N 年）
  Explain.metric = function (w, cid, metric, scope = 'last') {
    const c = w.countries[cid];
    if (!c) return null;
    let data, label;
    if (scope === 'current') { data = agg([c.causes.cur[metric] || {}]); label = `${w.year} 年至今`; }
    else {
      const n = scope === 'last' ? 1 : scope;
      const ys = c.causes.years.slice(-n);
      if (!ys.length) { data = agg([c.causes.cur[metric] || {}]); label = `${w.year} 年至今`; }
      else { data = agg(ys.map((y) => y.data[metric] || {})); label = ys.length === 1 ? `${ys[0].year} 年` : `${ys[0].year}–${ys[ys.length - 1].year} 年`; }
    }
    const factors = Object.entries(data).map(([name, o]) => ({
      name, v: o.v, link: Explain.LINKS[name] || (Object.keys(o.sub).map((s) => Explain.LINKS[s]).find(Boolean) || null),
      sub: Object.entries(o.sub).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const total = factors.reduce((s, f) => s + f.v, 0);
    return { metric, name: Explain.METRIC_NAMES[metric] || metric, label, total, factors };
  };

  const sign = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

  Explain.questions = function (w, cid) {
    const U = WS.util;
    const c = w.countries[cid];
    if (!c) return [];
    const qs = [];
    const ser = w.series.c[cid], n = w.series.labels.length;
    const span = Math.min(10, n - 1);

    // 1. 經濟
    if (span >= 1) {
      const g0 = ser.gdp[n - 1 - span], g1 = ser.gdp[n - 1];
      const ch = g0 ? (g1 / g0 - 1) * 100 : 0;
      const m = Explain.metric(w, cid, 'gdp', span);
      const drivers = {};
      for (const f of m.factors) for (const [s, v] of f.sub) drivers[s] = (drivers[s] || 0) + v;
      const top = Object.entries(drivers).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
      const sectors = m.factors.slice(0, 3).map((f) => `${f.name} ${sign(f.v)}`).join('、');
      const wars = w.events.filter((e) => e.type === 'war' && e.countries.includes(cid) && e.y >= w.series.labels[n - 1 - span]).map((e) => e.title);
      qs.push({
        q: `為什麼${c.name}的經濟${ch >= 0 ? '成長' : '衰退'}？`,
        a: `${m.label}，${c.name} GDP 由 ${U.fmt(g0)} 變為 ${U.fmt(g1)}（${sign(ch)}%）。按部門看：${sectors}（十億國際元）。` +
          `按原因看，影響最大的是${top.map(([k, v]) => `「${k}」（${sign(v)}）`).join('、')}。` +
          (wars.length ? `期間受到戰爭影響：${wars.slice(0, 3).join('；')}。` : ''),
        metric: 'gdp', scope: span
      });
    }

    // 2. 政治穩定
    const st = Explain.metric(w, cid, 'stability', 'last');
    if (st && st.factors.length) {
      const neg = st.factors.filter((f) => f.v < 0).slice(0, 2), pos = st.factors.filter((f) => f.v > 0).slice(0, 2);
      let deeper = '';
      const worst = neg[0];
      if (worst && worst.link) {
        const d = Explain.metric(w, cid, worst.link, 'last');
        if (d && d.factors.length) deeper = `而「${worst.name}」本身主要受到${d.factors.slice(0, 2).map((f) => `「${f.name}」`).join('、')}影響。`;
      }
      qs.push({
        q: `為什麼${c.name}的政治${st.total >= 0 ? '趨於穩定' : '越來越不穩'}？`,
        a: `${st.label}政治穩定度變動 ${sign(st.total)}。` + (neg.length ? `拉低穩定的因素：${neg.map((f) => `${f.name}（${sign(f.v)}）`).join('、')}。` : '') +
          (pos.length ? `支撐穩定的因素：${pos.map((f) => `${f.name}（${sign(f.v)}）`).join('、')}。` : '') + deeper,
        metric: 'stability', scope: 'last'
      });
    }

    // 3. 制度改變
    const reg = w.events.filter((e) => e.type === 'regime' && e.countries[0] === cid);
    if (reg.length) {
      const last = reg[reg.length - 1];
      const parent = last.parent ? w.events.find((e) => e.id === last.parent) : null;
      qs.push({
        q: `為什麼${c.name}的制度被改變？`,
        a: `${last.y} 年 ${last.m} 月，${last.text || last.title}` + (parent ? `直接原因是「${parent.title}」，當時的條件：${parent.causes.join('；')}。${parent.trigger ? '（' + parent.trigger + '）' : ''}` : `原因：${last.causes.join('；')}。`),
        eventId: last.id
      });
    } else {
      const rv = WS.Events.defs.find((d) => d.id === 'revolution').check(w, c);
      qs.push({ q: `${c.name}為什麼還沒有發生革命或政變？`, a: `目前的革命條件檢查：${rv.reasons.join('；')}。只要有一項不成立，革命就不會被觸發。` });
    }

    // 4. 戰爭
    const wars = w.wars.filter((x) => x.attackers.includes(cid) || x.defenders.includes(cid));
    if (wars.length) {
      const war = wars[wars.length - 1];
      qs.push({
        q: `為什麼爆發${war.name}？`,
        a: `${war.start.y} 年 ${war.start.m} 月由${w.countries[war.attackers[0]].name}發動。進攻方當時的判斷依據：${(war.reasons || []).join('；')}。` +
          (war.attackers.length + war.defenders.length > 2 ? `同盟關係把${war.attackers.concat(war.defenders).slice(2).map((x) => w.countries[x].name).join('、')}捲入戰爭。` : '') +
          (war.ended ? `戰爭在 ${war.end.y} 年結束。` : '戰爭仍在進行。'),
        eventId: war.eventId
      });
    }

    // 5. 科技
    const r = WS.Technology.researchPoints(c, w);
    const ids = U.ids(w);
    const leader = ids.map((x) => [x, WS.Technology.researchPoints(w.countries[x], w).pts]).sort((a, b) => b[1] - a[1])[0];
    qs.push({
      q: `為什麼${c.name}的科技發展${r.pts >= leader[1] * 0.5 ? '較快' : '較慢'}？`,
      a: `目前每年研究產出約 ${r.pts.toFixed(2)}（世界最高為${w.countries[leader[0]].name} ${leader[1].toFixed(2)}）。拆解：科研投入 ${r.budget.toFixed(2)} × 人才倍率 ${r.talent.toFixed(2)}（教育 ${c.demo.edu.toFixed(0)}）× 制度倍率 ${r.inst.toFixed(2)}（穩定度 ${c.pol.stability.toFixed(0)}）× 設施倍率 ${r.facility.toFixed(2)}（工業比重）× 世界科技速度 ${w.rules.techSpeed}。` +
        `${r.talent < 0.6 ? '教育水準偏低是最大瓶頸。' : ''}${r.inst < 0.8 ? '政治不穩也拖慢研究。' : ''}`
    });

    // 6. 人口
    const pp = Explain.metric(w, cid, 'population', 'last');
    if (pp && pp.factors.length) {
      qs.push({
        q: `為什麼${c.name}的人口${pp.total >= 0 ? '增加' : '減少'}？`,
        a: `${pp.label}人口變動 ${sign(pp.total, 2)} 百萬：` + pp.factors.map((f) => `${f.name} ${sign(f.v, 2)}` + (f.sub.length > 1 ? `（其中 ${f.sub.slice(0, 3).map(([s, v]) => s + ' ' + sign(v, 2)).join('、')}）` : '')).join('；') + '。',
        metric: 'population', scope: 'last'
      });
    }

    // 7. 最近一次決策
    const dcs = c.decisions.filter((d) => d.policy);
    if (dcs.length) {
      const d = dcs[dcs.length - 1];
      qs.push({
        q: `${c.name}最近為什麼選擇「${d.name}」？`,
        a: `${d.y} 年 ${d.m} 月，國家判斷最重要的問題是：${d.problems.map(([n, v]) => `${n}（${v}）`).join('、') || '無明顯問題'}。在可行方案中「${d.name}」評分最高（${d.score}），其他候選：${d.alternatives.map(([n, s]) => `${n} ${s}`).join('、') || '無'}。` +
          (d.rejected && d.rejected.length ? `被排除的方案：${d.rejected.map(([n, why]) => `${n}（${why}）`).join('、')}。` : '')
      });
    }

    // 8. 反事實
    qs.push({
      q: '如果沒有這場戰爭／這個事件，世界會怎樣？',
      a: '模擬器不會用文字臆測。請到「歷史」頁使用「歷史回溯」：回到事件之前的年份建立新分支，改變一項條件（例如禁止戰爭或改變政策），再用「歷史比較」對照兩條世界線的實際模擬數據。'
    });
    return qs;
  };
})(typeof window !== 'undefined' ? window : globalThis);
