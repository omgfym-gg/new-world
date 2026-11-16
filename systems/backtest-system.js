// Backtest System：歷史回測與偏差報表
// 從起點年份用固定種子跑到終點年份，在對照年份比較模擬值與 data/history-reference.js 的史實值。
// 兩種模式：
//   ai      ：各國 AI 自己決策（檢查世界能否合理自我演化）
//   replay  ：AI 決策＋在史實時間點執行史實重大政策（data/history-policies-*.js，經 WorldEngine 指令並寫入 commandLog），用來校準係數
// 回測只讀取模擬結果，不改寫任何數值（符合原則 1、2）。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Backtest = (WS.Backtest = {});

  Backtest.DRIFT_LIMIT = 0.25;  // 偏差超過 ±25% 視為「明顯偏離」
  Backtest.GDP_KEYS = ['勞動力', '資本投資', '技術進步', '知識累積', '追趕先進國家', '能源供應', '政治穩定與制度', '其他'];
  Backtest.DEFAULT_SEEDS = ['bt-1', 'bt-2', 'bt-3'];

  // 疆界家族：原國家＋所有從它分裂出去的新國家（例如俄國分裂後仍以前蘇聯範圍比較）
  function family(w, id) {
    const out = [];
    for (const k of Object.keys(w.countries).sort()) {
      let c = w.countries[k], guard = 0;
      while (c && guard++ < 20) {
        if (c.id === id) { out.push(k); break; }
        c = c.parent ? w.countries[c.parent] : null;
      }
    }
    return out;
  }

  function measure(w, id) {
    const U = WS.util;
    let pop = 0, gdp = 0;
    for (const k of family(w, id)) {
      const c = w.countries[k];
      if (!c.alive) continue;
      pop += U.popTotal(c); gdp += c.econ.gdp;
    }
    const c = w.countries[id];
    const r = c && c.alive ? c.res : null;
    return {
      pop, gdp, alive: !!(c && c.alive),
      old: c && c.alive ? c.pop.c3 / U.popTotal(c) : null,
      young: c && c.alive ? c.pop.c0 / U.popTotal(c) : null,
      energy: r ? r.energyRatio : null,
      reserves: r ? r.coal + r.oil : null,
      shortage: r ? r.shortage : null
    };
  }

  function decadeOf(y) { return Math.floor(y / 10) * 10; }

  // 從每年結算的因果帳累計人口變化來源（出生、各類死亡、淨遷移）
  function addLedger(store, c, entry) {
    const pop = entry.data.population;
    if (!pop) return;
    const d = decadeOf(entry.year);
    const L = store[d] || (store[d] = { years: 0, popSum: 0, gdpSum: 0, births: 0, deaths: 0, migration: 0, deathBy: {}, gdpBy: {} });
    L.years += 1;
    L.popSum += WS.util.popTotal(c);
    L.gdpSum += c.econ.gdp;
    // GDP 成長來源：把三個部門的歸因細項（勞動力、資本投資、技術進步、追趕…）加總
    for (const f of Object.values(entry.data.gdp || {}))
      for (const k in f.sub) L.gdpBy[k] = (L.gdpBy[k] || 0) + f.sub[k];
    if (pop['出生']) L.births += pop['出生'].v;
    if (pop['淨遷移']) L.migration += pop['淨遷移'].v;
    if (pop['死亡']) {
      L.deaths += pop['死亡'].v;
      for (const s in pop['死亡'].sub) L.deathBy[s] = (L.deathBy[s] || 0) + pop['死亡'].sub[s];
    }
  }

  // 跑一次回測：回傳 { seed, mode, points: {id: {year: measure}}, ledger: {id: {decade: L}}, policies: [] }
  Backtest.runOne = function (opts) {
    const scenario = opts.scenario || '1911';
    const ref = WS.Data.reference[scenario];
    const endYear = opts.endYear || ref.years[ref.years.length - 1];
    const e = new WS.WorldEngine();
    e.create({ mode: 'global', focus: 'CHN', seed: opts.seed, scenario });
    const w = e.w;
    const ids = Object.keys(ref.countries);
    const schedule = opts.mode === 'replay' ? (WS.Data.historyPolicies[scenario] || []).slice() : [];
    const policyLog = [];
    const points = {}, ledger = {};
    for (const id of ids) { points[id] = {}; ledger[id] = {}; }
    const checkYears = new Set(ref.years);

    while (w.year < endYear || (w.year === endYear && w.month <= 7)) {
      // 史實政策：時間到了就經由引擎指令執行（會寫入 commandLog）
      for (const p of schedule) {
        if (p.done || p.y !== w.year || p.m !== w.month) continue;
        p.done = true;
        const c = w.countries[p.country];
        const res = c && c.alive ? e.applyPolicy(p.country, p.policy) : { ok: false, reason: '國家已不存在' };
        policyLog.push({ y: p.y, country: p.country, policy: p.policy, note: p.note, ok: !!res.ok, reason: res.ok ? null : (res.reason || '條件不符') });
      }
      e.step();
      if (w.month === 1) {
        for (const id of ids) {
          const c = w.countries[id];
          if (!c || !c.alive) continue;
          const last = c.causes.years[c.causes.years.length - 1];
          if (last && last.year === w.year - 1 && last.year >= w.startYear) addLedger(ledger[id], c, last);
        }
      }
      if (w.month === 7 && checkYears.has(w.year)) {
        for (const id of ids) points[id][w.year] = measure(w, id);
      }
    }
    return { seed: opts.seed, mode: opts.mode || 'ai', points, ledger, policies: policyLog };
  };

  // 多個種子取平均，並和史實比較
  Backtest.run = function (opts = {}) {
    const scenario = opts.scenario || '1911';
    const ref = WS.Data.reference[scenario];
    const seeds = opts.seeds || Backtest.DEFAULT_SEEDS;
    const mode = opts.mode || 'ai';
    const runs = seeds.map((seed) => Backtest.runOne({ scenario, seed, mode, endYear: opts.endYear }));
    const countries = {};
    for (const id of Object.keys(ref.countries)) {
      const R = ref.countries[id];
      const rows = [];
      for (const y of ref.years) {
        const vals = runs.map((r) => r.points[id][y]).filter(Boolean);
        if (!vals.length) continue;
        const avg = (k) => { const a = vals.map((v) => v[k]).filter((x) => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
        const row = { year: y, pop: avg('pop'), gdp: avg('gdp'), old: avg('old'), young: avg('young'), energy: avg('energy'), reserves: avg('reserves'), shortage: avg('shortage'), refPop: R.pop[y], refGdp: R.gdp[y] };
        row.popErr = row.refPop ? row.pop / row.refPop - 1 : null;
        row.gdpErr = row.refGdp ? row.gdp / row.refGdp - 1 : null;
        rows.push(row);
      }
      // 人口變化來源（每千人每年），多個種子平均
      const decades = {};
      for (const r of runs) {
        for (const d in r.ledger[id]) {
          const L = r.ledger[id][d];
          const D = decades[d] || (decades[d] = { n: 0, cbr: 0, cdr: 0, mig: 0, deathBy: {}, gdpBy: {} });
          const avgGdp = L.gdpSum / Math.max(1, L.years);
          for (const k in L.gdpBy) D.gdpBy[k] = (D.gdpBy[k] || 0) + (L.gdpBy[k] / Math.max(1, L.years)) / Math.max(1e-6, avgGdp) * 100;
          const avgPop = L.popSum / Math.max(1, L.years);
          const per = (v) => (v / Math.max(1, L.years)) / Math.max(1e-6, avgPop) * 1000;
          D.n += 1; D.cbr += per(L.births); D.cdr += per(-L.deaths); D.mig += per(L.migration);
          for (const s in L.deathBy) D.deathBy[s] = (D.deathBy[s] || 0) + per(-L.deathBy[s]);
        }
      }
      for (const d in decades) {
        const D = decades[d];
        D.cbr /= D.n; D.cdr /= D.n; D.mig /= D.n;
        for (const s in D.deathBy) D.deathBy[s] /= D.n;
        for (const s in D.gdpBy) D.gdpBy[s] /= D.n;
      }
      const firstDrift = (k) => { const r = rows.find((x) => x[k + 'Err'] != null && Math.abs(x[k + 'Err']) > Backtest.DRIFT_LIMIT); return r ? r.year : null; };
      countries[id] = { rows, decades, territory: R.territory, excluded: !!R.excluded, popDriftFrom: firstDrift('pop'), gdpDriftFrom: firstDrift('gdp') };
    }
    // 總分：各國最後一個對照年份的人口、GDP 偏差絕對值平均（不含 excluded）
    const score = (k) => {
      const a = [];
      for (const id in countries) {
        if (countries[id].excluded) continue;
        const last = countries[id].rows[countries[id].rows.length - 1];
        if (last && last[k + 'Err'] != null) a.push(Math.abs(last[k + 'Err']));
      }
      return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    };
    const policies = runs[0].policies;
    return { scenario, mode, seeds, years: ref.years, countries, popScore: score('pop'), gdpScore: score('gdp'), policies, sources: ref.sources };
  };

  // ---------- 報表 ----------
  const pct = (x) => (x == null ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(0) + '%');
  const num = (x, d = 0) => (x == null ? '—' : x.toFixed(d));

  Backtest.findings = function (res) {
    const out = [];
    for (const id in res.countries) {
      const C = res.countries[id];
      const name = (WS.Data.scenarios[res.scenario].countries.find((c) => c.id === id) || {}).name || id;
      if (C.excluded) continue;
      const last = C.rows[C.rows.length - 1];
      if (!last) continue;
      if (C.popDriftFrom) {
        const r = C.rows.find((x) => x.year === C.popDriftFrom);
        out.push(`${name}人口從 ${C.popDriftFrom} 年開始明顯偏離（模擬 ${num(r.pop)} 百萬，史實 ${num(r.refPop)} 百萬，${pct(r.popErr)}）；${last.year} 年偏差 ${pct(last.popErr)}。`);
      }
      if (C.gdpDriftFrom) {
        const r = C.rows.find((x) => x.year === C.gdpDriftFrom);
        out.push(`${name} GDP 從 ${C.gdpDriftFrom} 年開始明顯偏離（${pct(r.gdpErr)}）；${last.year} 年偏差 ${pct(last.gdpErr)}。`);
      }
    }
    return out;
  };

  Backtest.toMarkdown = function (results) {
    const L = [];
    const modeName = { ai: 'AI 自主決策', replay: '史實政策重播' };
    L.push('# 歷史回測報表（1911 起點）', '');
    L.push('> 這份報表由 `node tools/backtest.js` 自動產生。模擬值是多個固定種子的平均。', '> 「偏差」= 模擬值 ÷ 史實值 − 1；超過 ±' + (Backtest.DRIFT_LIMIT * 100) + '% 視為明顯偏離。', '');
    const r0 = results[0];
    L.push('**史實資料來源**', '');
    for (const k in r0.sources) L.push(`- ${k === 'pop' ? '人口' : 'GDP'}：${r0.sources[k].source}（可信度 ${r0.sources[k].grade}）`);
    L.push('- 鄂圖曼／土耳其疆界差異太大，只列出參考，不計入總分。', '');
    L.push('## 總覽', '', '| 模式 | 種子數 | 最終人口平均偏差 | 最終 GDP 平均偏差 |', '|---|---|---|---|');
    for (const r of results) L.push(`| ${modeName[r.mode]} | ${r.seeds.length} | ${num(r.popScore * 100)}% | ${num(r.gdpScore * 100)}% |`);
    L.push('');
    for (const r of results) {
      L.push(`## ${modeName[r.mode]}`, '');
      const f = Backtest.findings(r);
      if (f.length) { L.push('**主要發現**', ''); for (const x of f) L.push('- ' + x); L.push(''); }
      for (const id in r.countries) {
        const C = r.countries[id];
        const name = (WS.Data.scenarios[r.scenario].countries.find((c) => c.id === id) || {}).name || id;
        L.push(`### ${name}${C.excluded ? '（僅供參考）' : ''}`, '', `對照範圍：${C.territory}`, '');
        L.push('| 年份 | 人口（模擬） | 人口（史實） | 偏差 | GDP（模擬） | GDP（史實） | 偏差 | 0–14 歲 | 65 歲以上 | 能源自給 | 煤＋油儲量 |', '|---|---|---|---|---|---|---|---|---|---|---|');
        const share = (v) => (v == null ? '—' : num(v * 100) + '%');
        for (const x of C.rows) L.push(`| ${x.year} | ${num(x.pop, 1)} | ${num(x.refPop, 1)} | ${pct(x.popErr)} | ${num(x.gdp)} | ${num(x.refGdp)} | ${pct(x.gdpErr)} | ${share(x.young)} | ${share(x.old)} | ${x.energy == null ? '—' : num(x.energy * 100) + '%'} | ${num(x.reserves)} |`);
        L.push('', '人口變化來源（每千人每年，十年平均）：', '', '| 年代 | 出生率 | 死亡率 | 淨遷移 | 主要死因 |', '|---|---|---|---|---|');
        for (const d of Object.keys(C.decades).sort()) {
          const D = C.decades[d];
          const top = Object.entries(D.deathBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('、');
          L.push(`| ${d}s | ${D.cbr.toFixed(1)} | ${D.cdr.toFixed(1)} | ${D.mig >= 0 ? '+' : ''}${D.mig.toFixed(1)} | ${top || '—'} |`);
        }
        const keys = Backtest.GDP_KEYS;
        L.push('', 'GDP 成長來源（每年 %，十年平均；各項加總約等於 GDP 年成長率）：', '', '| 年代 | ' + keys.join(' | ') + ' | 合計 |', '|---|' + keys.map(() => '---|').join('') + '---|');
        for (const d of Object.keys(C.decades).sort()) {
          const g = C.decades[d].gdpBy;
          const tot = Object.values(g).reduce((a, b) => a + b, 0);
          const cell = (k) => { const v = k === '其他' ? Object.entries(g).filter(([n]) => !keys.includes(n)).reduce((a, [, x]) => a + x, 0) : (g[k] || 0); return (v >= 0 ? '+' : '') + v.toFixed(2); };
          L.push(`| ${d}s | ${keys.map(cell).join(' | ')} | ${(tot >= 0 ? '+' : '') + tot.toFixed(2)} |`);
        }
        L.push('');
      }
      if (r.mode === 'replay') {
        const rej = r.policies.filter((p) => !p.ok);
        L.push(`**史實政策執行情況**（種子 ${r.seeds[0]}）：共 ${r.policies.length} 項，被引擎拒絕 ${rej.length} 項。`, '');
        for (const p of rej) L.push(`- ${p.y} ${p.country}「${p.note}」（${p.policy}）未執行：${p.reason}`);
        L.push('');
      }
    }
    return L.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
