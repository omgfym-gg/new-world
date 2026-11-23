// Explain System：世界解釋系統（V1.1 新增核心）
// 只從實際模擬紀錄（因果帳、事件、決策紀錄）找原因，再轉成一般人看得懂的文字。不臆測、不編故事。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Explain = (WS.Explain = {});

  Explain.METRIC_NAMES = {
    population: '人口', gdp: 'GDP', stability: '政治穩定度', legitimacy: '政府合法性', conflict: '社會衝突',
    debt: '國債', food: '糧食庫存（月）', education: '教育水準', health: '醫療水準', research: '科研進度', energy: '能源供應'
  };
  // 遠古時代（地區）的指標
  Explain.ANCIENT_METRICS = {
    population: '人口（百萬）', store: '儲糧', aid: '鄰近地區援助', harvest: '收成（與平常相比 %）', farming: '務農比例（%）', urban: '城市人口（百萬）', exchange: '交流程度', know: '農耕經驗', research: '神之手啟發的研究點數'
  };
  Explain.LINKS = {
    '政府合法性': 'legitimacy', '經濟狀況': 'gdp', '糧食供應': 'food', '社會衝突': 'conflict', '民眾支持': null,
    '糧食短缺': 'food', '政治穩定度': 'stability', '政治穩定與制度': 'stability', '能源供應': 'energy',
    '技術進步': 'research', '收成與氣候': 'food', '教育提高政治參與要求': 'education', '財政赤字': 'debt'
  };
  const ANCIENT_LINKS = { '糧食不足': 'store', '交換：送往鄰近地區': 'aid' };
  const yearText = (w, y) => (w.era === 'ancient' && WS.Ancient ? WS.Ancient.yearLabel(y) : `${y} 年`);

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
    const anc = w.era === 'ancient';
    const c = anc ? w.ancient.regions[cid] : w.countries[cid];
    if (!c) return null;
    let data, label;
    if (scope === 'current') { data = agg([c.causes.cur[metric] || {}]); label = anc ? '本期' : `${w.year} 年至今`; }
    else if (typeof scope === 'string' && /^y\d+$/.test(scope)) {   // 指定某一年（世界頭條用）
      const yr = +scope.slice(1);
      const ys = c.causes.years.find((x) => x.year === yr);
      data = agg(ys ? [ys.data[metric] || {}] : yr === w.year ? [c.causes.cur[metric] || {}] : []);
      label = yearText(w, yr);
    }
    else {
      const n = scope === 'last' ? 1 : scope;
      const ys = c.causes.years.slice(-n);
      if (!ys.length) { data = agg([c.causes.cur[metric] || {}]); label = anc ? '本期' : `${w.year} 年至今`; }
      else if (anc) { data = agg(ys.map((y) => y.data[metric] || {})); label = `${yearText(w, ys[0].year)}起 ${w.year - ys[0].year} 年`; }
      else { data = agg(ys.map((y) => y.data[metric] || {})); label = ys.length === 1 ? `${ys[0].year} 年` : `${ys[0].year}–${ys[ys.length - 1].year} 年`; }
    }
    const factors = Object.entries(data).map(([name, o]) => ({
      name, v: o.v, link: anc ? (ANCIENT_LINKS[name] || Object.keys(o.sub).map((s) => ANCIENT_LINKS[s]).find(Boolean) || null)
        : Explain.LINKS[name] || (Object.keys(o.sub).map((s) => Explain.LINKS[s]).find(Boolean) || null),
      sub: Object.entries(o.sub).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const total = factors.reduce((s, f) => s + f.v, 0);
    return { metric, name: (anc ? Explain.ANCIENT_METRICS[metric] : Explain.METRIC_NAMES[metric]) || metric, label, total, factors };
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
        if (d && d.factors.length) deeper = `而「${worst.name}」本身主要受這些因素影響：${d.factors.slice(0, 2).map((f) => `「${f.name}」`).join('、')}。`;
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

  // ---- 遠古時代：地區的「為什麼」（只讀模擬紀錄與引擎條件）----
  Explain.ancientQuestions = function (w, rid) {
    const A = WS.Ancient, r = w.ancient.regions[rid], T = WS.Data.ancientTechs, P = w.params.ancient;
    const Y = (y) => A.yearLabel(y);
    const pct = (v) => (v * 100).toFixed(0) + '%';
    const qs = [];
    const how = (t) => { const st = r.tech[t]; return st && st.done ? (st.year == null ? '起點前就已具備' : `${Y(st.year)}${st.how || ''}`) : null; };
    // 1. 人口
    const pm = Explain.metric(w, rid, 'population', 10);
    const top = pm.factors.slice(0, 3).map((f) => `${f.name} ${sign(f.v, 3)}`).join('、');
    qs.push({ q: '為什麼人口這樣變化？', metric: 'population', scope: 10,
      a: `${pm.label}人口合計變動 ${sign(pm.total, 3)} 百萬。主要因素：${top || '沒有明顯變化'}。目前糧食安全 ${pct(r.fs)}（100% 表示剛好夠吃）` +
        `，狩獵採集 ${A.popOf(r) ? pct(r.pop.F / A.popOf(r)) : '0%'}、農民 ${A.popOf(r) ? pct(r.pop.A / A.popOf(r)) : '0%'}、城市 ${pct(A.urbanShare(r))}。` +
        (r.cap.farm > 0 ? `農地承載力約 ${r.cap.farm.toFixed(2)} 百萬人，野生食物約可養活 ${r.cap.forage.toFixed(2)} 百萬人。` : `野生食物約可養活 ${r.cap.forage.toFixed(2)} 百萬人。`) });
    // 2. 農業
    if (A.invented(r, 'crop_domestication')) {
      qs.push({ q: '這裡怎麼開始務農的？', metric: 'farming', scope: 10,
        a: `作物馴化：${how('crop_domestication')}。目前普及 ${pct(A.adopt(r, 'crop_domestication'))}，務農與城市人口占 ${pct(A.farmShare(r))}。農耕的回報高於採集時，人們會逐漸改為定居務農；累積的農耕經驗讓同樣的土地養活更多人（目前加成 +${(A.knowBonus(w, r) * 100).toFixed(0)}%）。` });
    } else {
      const d = T.crop_domestication;
      const why = [];
      if (r.plants < 0.3) why.push(`本地可馴化的植物太少（${r.plants}，自行馴化需要 0.3 以上）`);
      if (d.adoptOnly && !d.adoptOnly(r)) why.push(`可耕地太少（${r.arable}），就算引進作物也種不起來`);
      const chain = ['plant_management', 'seed_selection'].filter((t) => !A.knows(w, r, t)).map((t) => T[t].name);
      if (chain.length && r.plants >= 0.2) why.push(`還沒有掌握：${chain.join('、')}`);
      const nb = r.links.map(([id]) => w.ancient.regions[id]).filter((o) => A.knows(w, o, 'crop_domestication')).map((o) => o.name);
      qs.push({ q: '為什麼這裡還沒有農業？',
        a: (why.length ? why.join('；') + '。' : '條件大致具備，正在累積經驗。') + (nb.length ? `鄰近的${nb.join('、')}已經務農，作物可能經交流或移民傳入。` : '鄰近地區也還沒有農業。') });
    }
    // 3. 城市
    if (r.cities.length) {
      qs.push({ q: '為什麼會有城市？', metric: 'urban', scope: 10,
        a: `城市人口約 ${Math.round(r.pop.U * 1e6).toLocaleString()} 人（${r.cities.length} 座：${r.cities.map((c) => c.name).join('、')}）。城市靠農民的剩餘糧食養活工匠、祭司、官吏與商人；` +
          `${A.knows(w, r, 'accounting') ? '有記帳能力，能管理大量剩餘' : '還沒有記帳，只能支持小型城鎮'}${r.polity ? `，政體「${w.ancient.polities[r.polity].name}」的貢賦也支持城市` : ''}。` });
    } else {
      const why = [];
      if (!A.invented(r, 'crop_domestication')) why.push('還沒有農業，沒有足夠的剩餘糧食');
      if (!A.invented(r, 'storage')) why.push('還不會儲糧');
      if (!A.knows(w, r, 'accounting')) why.push('還沒有記帳（陶籌與印章），難以管理剩餘');
      qs.push({ q: '為什麼這裡還沒有城市？', a: (why.join('；') || `城市人口約 ${Math.round(r.pop.U * 1e6).toLocaleString()} 人，還不到一座城市的規模（約 ${Math.round(P.pop.cityPop * 1e6).toLocaleString()} 人）`) + '。' });
    }
    // 4. 政體
    const pol = r.polity ? w.ancient.polities[r.polity] : null;
    if (pol) {
      const T2 = WS.Data.ancientPolityTypes;
      qs.push({ q: `「${pol.name}」是怎麼來的？`,
        a: `${Y(pol.founded)}形成，目前是${T2[pol.type].name}，首都在${w.ancient.regions[pol.capital].name}，管轄 ${pol.regions.length} 個地區（行政能力約可管 ${A.adminCap(w, pol).toFixed(1)} 個）、凝聚力 ${pol.cohesion.toFixed(0)}。管太多地區、首都饑荒或凝聚力低時容易瓦解。`,
        eventId: (w.events.slice().reverse().find((e) => e.polity === pol.id) || {}).id });
    } else {
      const dens = r.pop.A / r.area;
      qs.push({ q: '為什麼這裡還沒有政體（酋邦以上）？',
        a: `需要定居農業（目前 ${pct(A.farmShare(r))}，要 50% 以上）、農民密度夠高（目前 ${(dens * 1000).toFixed(0)}，門檻 ${(P.polity.chiefdomDensity * 1000).toFixed(0)}）、會儲糧與計數。` +
          (A.knows(w, r, 'crop_domestication') && A.farmShare(r) >= 0.5 && dens >= P.polity.chiefdomDensity && A.knows(w, r, 'storage') && A.knows(w, r, 'counting')
            ? `條件都已成立，每年約有 ${(P.polity.formChance * 100).toFixed(1)}% 的機會由親族與村落結成酋邦（不保證何時發生）。`
            : '條件都成立後，才有機會由親族與村落結成酋邦。') });
    }
    // 5. 最近的科技
    const recent = Object.entries(r.tech).filter(([, st]) => st.done && st.year != null).sort((a, b) => b[1].year - a[1].year).slice(0, 4);
    qs.push({ q: '最近學會了什麼？從哪裡來？',
      a: recent.length ? recent.map(([t, st]) => `${T[t].name}（${Y(st.year)}，${st.how}，普及 ${pct(st.a)}）`).join('；') + '。自行發明需要人口、城市與交流累積研究；鄰近地區已普及的技術會依交流程度傳入。' : '還沒有新科技。' });
    return qs;
  };
})(typeof window !== 'undefined' ? window : globalThis);
