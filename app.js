// 介面層：只讀取世界狀態並呼叫引擎指令，不直接修改核心數值。
(function () {
  'use strict';
  const U = WS.util;
  const engine = new WS.WorldEngine();
  const app = document.getElementById('app');
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');

  const RULE_DEFAULTS = Object.fromEntries(Object.entries(WS.Data.rules).map(([k, d]) => [k, d.default]));
  const S = {
    screen: 'start', tab: 'overview', view: null, histFilter: 'major', chartMetric: 'gdp', auto: null,
    setup: null, compare: null, nl: '', nlResult: null, speed: 'decade'
  };
  function newSetup(mode) {
    return {
      mode, depth: 'simple', scenario: '1911', focus: 'CHN', origin: 'history', direction: 'natural',
      intervention: mode === 'country' ? 'occasional' : 'occasional', speed: 'decade',
      civil: 'history', ruleMode: 'real', rules: Object.assign({}, RULE_DEFAULTS), seed: ''
    };
  }

  // ---------- 格式 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fPop = (p) => (p >= 100 ? (p / 100).toFixed(2) + ' 億' : p.toFixed(1) + ' 百萬');
  const fGdp = (g) => (g * 10 >= 10000 ? (g / 1000).toFixed(2) + ' 兆' : Math.round(g * 10).toLocaleString() + ' 億');
  const sg = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
  const cls = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : '');
  const SPEEDS = { month: [1, '一個月'], year: [12, '一年'], decade: [120, '十年'], century: [1200, '百年'] };
  const W = () => engine.world;

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
  }
  function openModal(html) { modalBody.innerHTML = html; modal.hidden = false; modalBody.scrollTop = 0; }
  function closeModal() { modal.hidden = true; }

  // ======================= 開始畫面 =======================
  function renderStart() {
    const st = WS.Save.storage();
    const hasAuto = !!(st && st.getItem('ws.autosave'));
    const saves = WS.Save.list();
    app.innerHTML = `
      <div class="start">
        <div class="brand">
          <div class="en">WORLD SIMULATOR · 創•世界</div>
          <h1>世界模擬器</h1>
          <p>玩家設定世界，模擬器創造歷史，玩家觀察並改變歷史。</p>
        </div>
        <div class="menu">
          <button class="btn primary" data-act="new-world">開始新世界<small>選擇國家模式或全球模式，簡易設定即可開始</small></button>
          <button class="btn" data-act="continue" ${hasAuto ? '' : 'disabled'}>繼續遊戲<small>${hasAuto ? '回到上次自動存檔' : '尚無自動存檔'}</small></button>
          <button class="btn" data-act="load-menu" ${saves.length ? '' : 'disabled'}>載入存檔<small>${saves.length} 個存檔</small></button>
          <button class="btn gold" data-act="scenario">歷史世界<small>測試劇本《帝國的轉折：1911–1930》</small></button>
          <button class="btn" data-act="custom-world">自訂世界<small>全球模式：修改世界制度與規則</small></button>
        </div>
        <p class="dim" style="text-align:center">第一版原型・不需連網、不需 AI・所有係數為待校準的示意值</p>
      </div>`;
  }

  // ======================= 設定畫面 =======================
  function seg(name, value, opts) {
    return `<div class="seg" role="group">${opts.map(([v, label, sub]) =>
      `<button data-act="set" data-k="${name}" data-v="${esc(v)}" class="${String(value) === String(v) ? 'on' : ''}" aria-pressed="${String(value) === String(v)}">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div>`;
  }

  function rulesEditor(rules, act = 'rule') {
    return Object.entries(WS.Data.rules).map(([k, d]) => {
      const opts = d.type === 'bool' ? [[true, d.on], [false, d.off]] : d.choices.map(([v, l]) => [v, l]);
      return `<div class="field"><label>${esc(d.category)}・${esc(d.name)}</label>
        <div class="seg">${opts.map(([v, l]) => `<button data-act="${act}" data-k="${k}" data-v="${JSON.stringify(v)}" class="${rules[k] === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
    }).join('');
  }

  function renderSetup() {
    const s = S.setup;
    const sc = WS.Data.scenarios[s.scenario];
    const country = s.mode === 'country';
    const showRules = s.depth !== 'simple' || (country ? s.origin === 'custom' : s.civil === 'custom' || s.ruleMode === 'modify');
    const conflicts = WS.Rules.conflicts(s.rules);
    const summary = buildSummary(s);
    app.innerHTML = `
      <div class="setup">
        <div class="setup-head"><button class="btn small" data-act="home">‹ 返回</button><h2>${country ? '國家模式' : '全球模式'}・新世界</h2></div>
        <div class="card">
          <h3>設定深度</h3>
          ${seg('depth', s.depth, [['simple', '簡易模式', '預設・推薦'], ['custom', '自訂模式', '修改少數規則'], ['advanced', '進階模式', '數據、公式、參數']])}
        </div>
        <div class="card">
          <h3>${country ? '國家模式簡易設定' : '全球模式簡易設定'}</h3>
          <div class="field"><label>模式</label>${seg('mode', s.mode, [['country', '國家模式'], ['global', '全球模式']])}</div>
          ${country ? `<div class="field"><label>國家</label>
            <select data-act="set-select" data-k="focus">${sc.countries.map((c) => `<option value="${c.id}" ${c.id === s.focus ? 'selected' : ''}>${esc(c.name)}（${esc(c.regimeLabel)}）</option>`).join('')}</select></div>` : ''}
          <div class="field"><label>起始年份</label>
            <select data-act="set-select" data-k="scenario">${Object.values(WS.Data.scenarios).map((x) => `<option value="${x.id}">${x.startYear} 年</option>`).join('')}</select>
            <span class="dim">第一版資料集只有 1911 年起點；其他年份需要先建立歷史資料（人口、GDP、制度、國界）。</span></div>
          ${country
            ? `<div class="field"><label>世界起點</label>${seg('origin', s.origin, [['history', '真實歷史'], ['custom', '自訂世界']])}</div>
               <div class="field"><label>發展方向</label>${seg('direction', s.direction, [['natural', '自然發展'], ['prosper', '繁榮'], ['tech', '科技優先'], ['military', '軍事擴張']])}</div>
               <div class="field"><label>玩家介入</label>${seg('intervention', s.intervention, [['none', '不介入'], ['occasional', '偶爾決策'], ['full', '完全控制']])}</div>`
            : `<div class="field"><label>世界制度</label>${seg('civil', s.civil, [['history', '沿用歷史'], ['custom', '自訂制度']])}</div>
               <div class="field"><label>文明方向</label>${seg('direction', s.direction, [['natural', '自然發展'], ['tech', '科技優先'], ['peace', '和平優先'], ['sharing', '資源共享']])}</div>
               <div class="field"><label>世界規則</label>${seg('ruleMode', s.ruleMode, [['real', '沿用現實'], ['modify', '修改少數規則']])}</div>
               <div class="field"><label>玩家介入</label>${seg('intervention', s.intervention, [['none', '不介入'], ['occasional', '偶爾干預'], ['full', '全面控制']])}</div>`}
          <div class="field"><label>模擬速度（每次推進）</label>${seg('speed', s.speed, [['year', '年'], ['decade', '十年'], ['century', '百年']])}</div>
        </div>
        ${!country ? `<div class="card">
          <h3>用一句話描述你想要的世界</h3>
          <textarea id="nl" placeholder="例如：建立沒有國家、沒有貨幣、資源由人類共同管理的世界。">${esc(S.nl)}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn small" data-act="nl-parse">轉換成世界規則</button><span class="dim">第一版用關鍵字轉換，不呼叫外部 AI</span></div>
          ${S.nlResult ? `<div style="margin-top:10px">${S.nlResult.matched.length ? `<div>辨識到的規則：</div><ul class="list-plain">${S.nlResult.matched.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><span class="dim">已套用到下方規則，請確認。沒有辨識到的部分不會影響模擬。</span>` : '<span class="bad">沒有辨識到可執行的規則。請改用下方規則選項。</span>'}</div>` : ''}
        </div>` : ''}
        ${showRules ? `<div class="card"><h3>世界規則</h3>${rulesEditor(s.rules)}</div>` : ''}
        ${s.depth === 'advanced' ? `<div class="card"><h3>進階：隨機種子</h3>
          <div class="field"><label>相同設定與相同種子會得到完全相同的歷史</label><input type="text" id="seed" value="${esc(s.seed)}" placeholder="留空＝使用預設種子"></div></div>` : ''}
        ${conflicts.map((c) => `<div class="conflict"><b>規則衝突</b><p>${esc(c.text)}</p><div class="row">${c.options.map((o, i) => `<button class="btn small" data-act="resolve-conflict" data-id="${c.id}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div></div>`).join('')}
        <div class="card summary"><h3>設定摘要</h3><ul class="list-plain">${summary.map((x) => `<li>${x}</li>`).join('')}</ul></div>
        <button class="btn primary" data-act="start-sim" ${conflicts.length ? 'disabled' : ''}>確認並開始模擬</button>
      </div>`;
  }

  function buildSummary(s) {
    const sc = WS.Data.scenarios[s.scenario];
    const out = [];
    out.push(`${s.mode === 'country' ? '國家模式' : '全球模式'}・${{ simple: '簡易', custom: '自訂', advanced: '進階' }[s.depth]}模式・起點 ${sc.startYear} 年`);
    if (s.mode === 'country') {
      const c = sc.countries.find((x) => x.id === s.focus);
      out.push(`觀察中心：${esc(c.name)}（${esc(c.regimeLabel)}）`);
      out.push(`發展方向：${{ natural: '自然發展（沿用國家原本目標）', prosper: '繁榮', tech: '科技優先', military: '軍事擴張' }[s.direction]}`);
      out.push(`玩家介入：${{ none: '不介入，世界完全自主運作', occasional: '偶爾決策，重大事件時暫停讓你選擇', full: '完全控制此國政策，其他國家自主運作' }[s.intervention]}`);
    } else {
      out.push(`文明方向：${{ natural: '自然發展', tech: '科技優先（各國以科技為目標）', peace: '和平優先（各國以和平合作為目標）', sharing: '資源共享（開啟全球糧食與能源共享）' }[s.direction]}`);
      out.push(`玩家介入：${{ none: '不介入', occasional: '偶爾干預，世界重大事件時暫停', full: '全面控制，可隨時修改世界規則' }[s.intervention]}`);
    }
    const changed = Object.keys(s.rules).filter((k) => s.rules[k] !== RULE_DEFAULTS[k]);
    if (!changed.length) out.push('世界規則：沿用現實');
    for (const k of changed) {
      out.push(`<b>${esc(WS.Data.rules[k].name)}：${esc(WS.Rules.describe(k, s.rules[k]))}</b>`);
      for (const st of WS.Rules.conversionSteps(k, s.rules[k])) out.push(`<span class="dim">→ ${esc(st)}</span>`);
    }
    out.push(`其他數據（GDP、軍隊、出生率、預算）由系統依 ${sc.startYear} 年資料自動建立，共 ${sc.countries.length} 個國家。`);
    return out;
  }

  // ======================= 遊戲畫面 =======================
  function render() {
    if (S.screen === 'start') return renderStart();
    if (S.screen === 'setup') return renderSetup();
    renderGame();
  }

  function renderGame() {
    const w = W();
    const running = !!S.auto;
    const ids = U.ids(w);
    app.innerHTML = `
      <div class="topbar">
        <div class="topbar-row">
          <div class="date num">${w.year} 年 ${w.month} 月<small>${esc(w.branch.name)}</small></div>
          <span class="spacer"></span>
          <div class="seg">${[['country', '國家'], ['global', '全球']].map(([v, l]) => `<button data-act="mode" data-v="${v}" class="${w.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${w.mode === 'country' ? `<select data-act="focus" aria-label="觀察國家" style="width:auto;min-height:40px">${ids.map((id) => `<option value="${id}" ${id === w.focus ? 'selected' : ''}>${esc(w.countries[id].name)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="controls">
          ${Object.entries(SPEEDS).map(([k, [, l]]) => `<button class="btn small ${S.speed === k ? 'on' : ''}" data-act="advance" data-v="${k}" ${running ? 'disabled' : ''}>＋${l}</button>`).join('')}
          <button class="btn small run" data-act="auto">${running ? '⏸ 暫停' : '▶ 自動'}</button>
        </div>
      </div>
      <div class="content">${tabContent()}</div>
      <nav class="nav"><div class="nav-inner">
        ${[['overview', '◉', '總覽'], ['country', '⚑', '國家'], ['world', '◍', '世界'], ['history', '⟲', '歷史'], ['explain', '？', '為什麼'], ['system', '⚙', '系統']]
          .map(([k, ic, l]) => `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${l}</button>`).join('')}
      </div></nav>`;
  }

  function tabContent() {
    switch (S.tab) {
      case 'overview': return overview();
      case 'country': return countryTab();
      case 'world': return worldTab();
      case 'history': return historyTab();
      case 'explain': return explainTab();
      case 'system': return systemTab();
    }
    return '';
  }

  // ---------- 小元件 ----------
  function kpi(label, value, delta, why, cid) {
    return `<div class="kpi">${why ? `<button class="why" data-act="why" data-c="${cid}" data-m="${why}" aria-label="為什麼會這樣">?</button>` : ''}
      <div class="k">${label}</div><div class="v num">${value}</div>${delta != null ? `<div class="d num ${cls(delta)}">${delta}</div>` : ''}</div>`;
  }
  function meter(label, v, why, cid) {
    return `<div class="meter"><span>${label}</span><div class="bar"><i style="width:${U.clamp(v, 0, 100)}%"></i></div><span class="num">${v.toFixed(0)}</span>
      ${why ? `<button class="why" data-act="why" data-c="${cid}" data-m="${why}" aria-label="為什麼">?</button>` : '<span></span>'}</div>`;
  }
  function yoy(id, k) {
    const s = W().series.c[id];
    if (!s) return null;
    const a = s[k], n = a.length;
    if (n < 2 || a[n - 2] == null || a[n - 1] == null) return null;
    return a[n - 1] - a[n - 2];
  }
  function eventItem(e) {
    const cl = (e.type === 'war' ? 'war ' : '') + (e.level >= 3 ? 'l3 ' : '') + (e.type === 'historical-missed' ? 'missed' : '');
    return `<li class="${cl}" data-act="event" data-id="${e.id}"><div class="when">${e.y}.${String(e.m).padStart(2, '0')}・${typeLabel(e.type)}</div>${esc(e.title)}</li>`;
  }
  function typeLabel(t) {
    return { war: '戰爭', regime: '政權', leader: '人物', tech: '科技', decision: '決策', historical: '歷史事件', 'historical-missed': '歷史分歧', conditional: '條件事件', organization: '國際組織', newcountry: '新國家', newregime: '新制度', diplomacy: '外交', rule: '世界規則', branch: '分支', system: '系統' }[t] || t;
  }

  // ---------- 地圖 ----------
  function mapSvg() {
    const w = W();
    const ids = U.ids(w);
    const X = (lon) => lon + 180, Y = (lat) => 90 - lat;
    let lines = '';
    for (const k of Object.keys(w.relations)) {
      const r = w.relations[k];
      const A = w.countries[r.a], B = w.countries[r.b];
      if (!A.alive || !B.alive) continue;
      if (r.war) lines += `<line x1="${X(A.lon)}" y1="${Y(A.lat)}" x2="${X(B.lon)}" y2="${Y(B.lat)}" stroke="#f87171" stroke-width=".9" stroke-dasharray="2 1.2"/>`;
      else if (r.alliance) lines += `<line x1="${X(A.lon)}" y1="${Y(A.lat)}" x2="${X(B.lon)}" y2="${Y(B.lat)}" stroke="#38bdf8" stroke-width=".5" opacity=".7"/>`;
    }
    let grid = '';
    for (let lon = -180; lon <= 180; lon += 30) grid += `<line x1="${X(lon)}" y1="0" x2="${X(lon)}" y2="180" stroke="#1e3463" stroke-width=".2"/>`;
    for (let lat = -60; lat <= 80; lat += 20) grid += `<line x1="0" y1="${Y(lat)}" x2="360" y2="${Y(lat)}" stroke="#1e3463" stroke-width=".2"/>`;
    const nodes = ids.map((id) => {
      const c = w.countries[id];
      const r = Math.max(2.8, Math.sqrt(U.popTotal(c)) * 0.5);
      const focus = id === w.focus && w.mode === 'country';
      return `<g data-act="open-country" data-id="${id}" style="cursor:pointer">
        <circle cx="${X(c.lon)}" cy="${Y(c.lat)}" r="${r}" fill="${c.color}" fill-opacity=".35" stroke="${focus ? '#fbbf24' : c.color}" stroke-width="${focus ? 1 : 0.5}"/>
        ${c.flags.atWar ? `<circle cx="${X(c.lon)}" cy="${Y(c.lat)}" r="${r + 1.5}" fill="none" stroke="#f87171" stroke-width=".4"/>` : ''}
        <text x="${X(c.lon)}" y="${Y(c.lat) + r + 4.5}" font-size="5" fill="#e6ecff" text-anchor="middle">${esc(c.name)}</text></g>`;
    }).join('');
    return `<svg class="map" viewBox="40 10 300 80" role="img" aria-label="世界示意地圖">${grid}${lines}${nodes}</svg>
      <div class="legend" style="margin-top:6px"><span><i style="background:#38bdf8"></i>同盟</span><span><i style="background:#f87171"></i>戰爭</span><span>圓圈大小＝人口・示意地圖，第一版以國家為單位</span></div>`;
  }

  // ---------- 圖表 ----------
  function chart(labels, series, opts = {}) {
    const Wd = 640, H = opts.h || 220, pl = 44, pr = 10, pt = 10, pb = 24;
    const all = series.flatMap((s) => s.data.filter((v) => v != null));
    if (!all.length || labels.length < 2) return '<p class="dim">推進至少一年後才會有歷史數據。</p>';
    let mn = Math.min(...all), mx = Math.max(...all);
    if (opts.zero) mn = Math.min(0, mn);
    if (mx === mn) mx = mn + 1;
    const x = (i) => pl + (i / (labels.length - 1)) * (Wd - pl - pr);
    const y = (v) => pt + (1 - (v - mn) / (mx - mn)) * (H - pt - pb);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = mn + ((mx - mn) * i) / 4;
      g += `<line x1="${pl}" x2="${Wd - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#1e3463" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="11" fill="#8fa3cc" text-anchor="end">${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 1 : 0)}</text>`;
    }
    const step = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) g += `<text x="${x(i)}" y="${H - 6}" font-size="11" fill="#8fa3cc" text-anchor="middle">${l}</text>`; });
    const paths = series.map((s) => {
      let d = '', pen = false;
      s.data.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; });
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.bold ? 2.6 : 1.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} opacity="${s.bold || series.length < 3 ? 1 : 0.75}"/>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(opts.label || '歷史數據圖')}">${g}${paths}</svg>
      <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }

  // ======================= 總覽 =======================
  function overview() {
    const w = W();
    const ids = U.ids(w);
    let head = '';
    if (w.mode === 'country') {
      const c = w.countries[w.focus] || w.countries[ids[0]];
      const id = c.id;
      const dP = yoy(id, 'pop'), dG = yoy(id, 'gdp'), dS = yoy(id, 'stability');
      const last = c.decisions[c.decisions.length - 1];
      head = `<div class="card">
        <h3><span>${esc(c.name)}・${esc(c.regimeLabel || U.regime(w, c.regime).name)}</span>${c.flags.atWar ? '<span class="tag red">戰爭中</span>' : ''}</h3>
        <div class="row" style="margin-bottom:10px"><span class="tag">領導人：${esc(c.leader.name)}</span><span class="tag blue">國家目標：${esc(WS.Data.goals[c.goal])}</span>
          <span class="tag ${c.controller === 'player' ? 'gold' : ''}">${c.controller === 'player' ? '玩家控制' : '自主運作'}</span></div>
        <div class="kpis">
          ${kpi('人口', fPop(U.popTotal(c)), dP != null ? sg(dP) + ' 百萬／年' : null, 'population', id)}
          ${kpi('GDP' + (w.rules.currency === false ? '（替代估值）' : ''), fGdp(c.econ.gdp), dG != null ? sg((dG / (c.econ.gdp - dG)) * 100) + '%／年' : null, 'gdp', id)}
          ${kpi('政治穩定', c.pol.stability.toFixed(0), dS != null ? sg(dS, 0) + '／年' : null, 'stability', id)}
          ${kpi('糧食庫存', c.res.foodStock.toFixed(1) + ' 月', c.res.shortage > 0 ? '短缺 ' + (c.res.shortage * 100).toFixed(0) + '%' : null, 'food', id)}
        </div>
        ${last ? `<p class="dim" style="margin:10px 0 0">最近決策（${last.y}.${last.m}）：<b style="color:var(--text)">${esc(last.name)}</b>${last.problems.length ? '・因為 ' + last.problems.map((p) => esc(p[0])).join('、') : ''}</p>` : ''}
      </div>`;
    } else {
      const pop = ids.reduce((s, id) => s + U.popTotal(w.countries[id]), 0);
      const gdp = ids.reduce((s, id) => s + w.countries[id].econ.gdp, 0);
      const wars = w.wars.filter((x) => !x.ended).length;
      const orgs = Object.values(w.organizations).filter((o) => o.active).length;
      const sw = w.series.world, n = sw.pop.length;
      head = `<div class="card"><h3>全球文明狀態</h3><div class="kpis">
        ${kpi('世界人口（模擬範圍）', fPop(pop), n > 1 ? sg(((sw.pop[n - 1] - sw.pop[n - 2]) / sw.pop[n - 2]) * 100) + '%／年' : null)}
        ${kpi('世界 GDP' + (w.rules.currency === false ? '（替代估值）' : ''), fGdp(gdp), n > 1 ? sg(((sw.gdp[n - 1] - sw.gdp[n - 2]) / sw.gdp[n - 2]) * 100) + '%／年' : null)}
        ${kpi('政治實體', ids.length + ' 個', null)}
        ${kpi('戰爭／國際組織', wars + '／' + orgs, null)}
      </div>
      <div class="row" style="margin-top:10px">${Object.keys(w.rules).map((k) => `<span class="tag ${w.rules[k] !== RULE_DEFAULTS[k] ? 'gold' : ''}">${esc(WS.Data.rules[k].name)}：${esc(WS.Rules.describe(k, w.rules[k]))}</span>`).join('')}</div></div>`;
    }
    const evs = w.events.filter((e) => e.level >= 2 && (w.mode === 'global' || e.level >= 3 || e.countries.includes(w.focus))).slice(-12).reverse();
    const chron = w.chronicle.slice(-3).reverse();
    return head + `
      <div class="card"><h3>世界地圖</h3>${mapSvg()}</div>
      <div class="grid g2">
        <div class="card"><h3>最新事件 <button class="link" data-act="tab" data-v="history">全部</button></h3><ul class="events">${evs.map(eventItem).join('') || '<li class="dim">尚無事件，推進時間開始模擬。</li>'}</ul></div>
        <div class="card"><h3>歷史紀錄</h3>${chron.length ? chron.map((c) => `<p class="chron"><b>${c.year} 年</b>\n${esc(c.text)}</p>`).join('') : '<p class="dim">每推進一年，模擬器會根據實際模擬數據寫下一段歷史摘要。</p>'}</div>
      </div>`;
  }

  // ======================= 國家 =======================
  function countryTab() {
    const w = W();
    const ids = U.ids(w);
    const id = S.view && w.countries[S.view] && w.countries[S.view].alive ? S.view : w.countries[w.focus] && w.countries[w.focus].alive ? w.focus : ids[0];
    const c = w.countries[id];
    const adv = w.difficulty === 'advanced';
    const pol = c.pol;
    const techNow = (c.research.current || []).map((t) => `${WS.Data.techs[t].name}（${WS.Data.techStages[WS.Technology.stage(c, w, t) ?? 0]}，${Math.min(100, (c.tech[t].progress / WS.Data.techs[t].cost) * 100).toFixed(0)}%）`);
    const adopted = Object.entries(c.tech).filter(([t, s]) => s.progress >= WS.Data.techs[t].cost).sort((a, b) => b[1].adoption - a[1].adoption);
    const rels = ids.filter((o) => o !== id).map((o) => [o, U.relation(w, id, o)]).sort((a, b) => a[1].rel - b[1].rel);
    const canAct = c.controller === 'player' || (w.intervention !== 'none' && id === w.focus && w.mode === 'country');
    const ev = canAct ? engine.evaluate(id) : null;
    const debtR = c.fiscal.debt / Math.max(1e-6, c.econ.gdp);
    return `
      <div class="seg">${ids.map((x) => `<button data-act="view" data-v="${x}" class="${x === id ? 'on' : ''}">${esc(w.countries[x].name)}</button>`).join('')}</div>
      <div class="card"><h3><span>${esc(c.name)}・${esc(U.regime(w, c.regime).name)}</span><span class="tag">成立 ${c.founded}${c.parent ? '・分裂自' + esc(w.countries[c.parent].name) : ''}</span></h3>
        <div class="row"><span class="tag">領導人 ${esc(c.leader.name)}</span><span class="tag blue">目標：${esc(WS.Data.goals[c.goal])}</span><span class="tag">地區：${c.regions.map((r) => esc(w.regions[r].name)).join('、')}</span></div></div>
      <div class="grid g2">
        <div class="card"><h3>政治</h3>
          ${meter('政治穩定', pol.stability, 'stability', id)}${meter('政府合法性', pol.legitimacy, 'legitimacy', id)}${meter('民眾支持', pol.support)}
          ${meter('社會衝突', pol.conflict, 'conflict', id)}${meter('行政效率', pol.admin)}${meter('腐敗程度', pol.corruption)}
          ${meter('地方勢力', pol.localPower)}${meter('軍隊忠誠', pol.armyLoyalty)}${meter('貧富差距', pol.inequality)}
        </div>
        <div class="card"><h3>經濟${w.rules.currency === false ? '（無貨幣：替代估值）' : ''}</h3>
          <div class="kpis">
            ${kpi('GDP', fGdp(c.econ.gdp), null, 'gdp', id)}
            ${kpi('人均 GDP', Math.round(c.econ.gdppc).toLocaleString(), null)}
            ${kpi('年成長', (c.econ.growth * 100).toFixed(1) + '%', null)}
            ${kpi('國債／GDP', (debtR * 100).toFixed(0) + '%', null, 'debt', id)}
          </div>
          <p class="dim">農業 ${((c.econ.sec.agri.Y / c.econ.gdp) * 100).toFixed(0)}%・工業 ${((c.econ.sec.ind.Y / c.econ.gdp) * 100).toFixed(0)}%・服務 ${((c.econ.sec.serv.Y / c.econ.gdp) * 100).toFixed(0)}%・
            通膨 ${(c.econ.inflation * 100).toFixed(1)}%・失業 ${(c.demo.unemployment * 100).toFixed(1)}%・稅率 ${(c.fiscal.taxRate * 100).toFixed(1)}%</p>
          ${adv ? budgetTable(c) : ''}
        </div>
        <div class="card"><h3>人口與社會</h3>
          <div class="kpis">${kpi('人口', fPop(U.popTotal(c)), null, 'population', id)}${kpi('城市化', (c.demo.urban * 100).toFixed(0) + '%', null)}
            ${kpi('教育', c.demo.edu.toFixed(0), null, 'education', id)}${kpi('醫療', (c.demo.health * 100).toFixed(0), null, 'health', id)}</div>
          <p class="dim">0–14 歲 ${fPop(c.pop.c0)}・15–24 歲 ${fPop(c.pop.c1)}・25–64 歲 ${fPop(c.pop.c2)}・65+ ${fPop(c.pop.c3)}<br>
            年出生 ${(c.demo.births * 12).toFixed(2)}・年死亡 ${(c.demo.deaths * 12).toFixed(2)}・年淨遷移 ${(c.demo.migration * 12).toFixed(2)}（百萬）</p>
        </div>
        <div class="card"><h3>資源與環境</h3>
          <div class="kpis">${kpi('糧食庫存', c.res.foodStock.toFixed(1) + ' 月', null, 'food', id)}${kpi('自產糧食比', (c.res.foodRatio * 100).toFixed(0) + '%', null)}
            ${kpi('能源供應', (c.res.energyRatio * 100).toFixed(0) + '%', null, 'energy', id)}${kpi('污染', c.res.pollution.toFixed(0), null)}</div>
          <p class="dim">煤炭儲量 ${(c.res.coal / Math.max(1e-6, c.res.energyDemand0)).toFixed(0)} 年・石油儲量 ${(c.res.oil / Math.max(1e-6, c.res.energyDemand0)).toFixed(0)} 年（以起點工業能源需求計）</p>
        </div>
        <div class="card"><h3>科技 <button class="why" style="position:static" data-act="why" data-c="${id}" data-m="research" aria-label="為什麼">?</button></h3>
          <p>研究中：${techNow.map(esc).join('、') || '—'}</p>
          <div>${adopted.slice(0, adv ? 30 : 8).map(([t, s]) => `<div class="meter"><span>${esc(WS.Data.techs[t].name)}</span><div class="bar"><i style="width:${s.adoption * 100}%"></i></div><span class="num">${(s.adoption * 100).toFixed(0)}%</span><span></span></div>`).join('')}</div>
          <p class="dim">普及度＝技術實際應用程度。發明之後仍需投資與人才才會普及。</p>
        </div>
        <div class="card"><h3>軍事</h3>
          <div class="kpis">${kpi('軍事能力', c.mil.power.toFixed(0), null)}${kpi('兵力', (c.mil.personnel * 100).toFixed(0) + ' 萬', null)}
            ${kpi('訓練', c.mil.training.toFixed(0), null)}${kpi('戰爭疲憊', pol.exhaustion.toFixed(0), null)}</div>
          ${adv && c.mil.parts ? `<p class="dim">能力＝100 × 人員 ${c.mil.parts.personnel.toFixed(2)} × 訓練 ${c.mil.parts.training.toFixed(2)} × 裝備 ${c.mil.parts.equipment.toFixed(2)} × 指揮 ${c.mil.parts.command.toFixed(2)} × 後勤 ${c.mil.parts.logistics.toFixed(2)} × 科技 ${c.mil.parts.tech.toFixed(2)}</p>` : ''}
        </div>
      </div>
      <div class="card"><h3>外交關係</h3><div class="table-wrap"><table>
        <tr><th>國家</th><th>關係</th><th>互信</th><th>貿易</th><th>狀態</th><th></th></tr>
        ${rels.map(([o, r]) => `<tr><td>${esc(w.countries[o].name)}</td><td class="num ${cls(r.rel)}">${r.rel.toFixed(0)}</td><td class="num">${r.trust.toFixed(0)}</td><td class="num">${(r.trade * 100).toFixed(0)}%</td>
          <td>${r.war ? '<span class="tag red">戰爭</span>' : r.alliance ? '<span class="tag blue">同盟</span>' : ''}</td><td><button class="link" data-act="why-rel" data-a="${id}" data-b="${o}">原因</button></td></tr>`).join('')}
      </table></div></div>
      <div class="card"><h3>國家自主決策紀錄</h3>
        ${c.decisions.slice(-6).reverse().map((d) => `<div class="policy"><div><b>${d.y}.${d.m}　${esc(d.name)}</b>
          <small>問題：${d.problems.map((p) => esc(p[0]) + ' ' + p[1]).join('、') || '無明顯問題'}${d.alternatives.length ? '｜其他候選：' + d.alternatives.map((a) => esc(a[0]) + ' ' + a[1]).join('、') : ''}</small></div><span class="num dim">${d.score}</span></div>`).join('') || '<p class="dim">每三個月決策一次。</p>'}
      </div>
      ${canAct ? `<div class="card"><h3>${c.controller === 'player' ? '你的政策（完全控制）' : '玩家介入'}</h3>
        <p class="dim">系統依目前問題對每個政策評分。政策仍須通過引擎檢查（制度、財政、世界規則、冷卻時間）。</p>
        ${ev.list.map((p) => `<div class="policy"><div>${esc(p.name)} <span class="num dim">評分 ${p.score.toFixed(2)}</span><small>${esc(WS.Policies.defs[p.id].desc)}${p.feasible !== true ? '・<span class="bad">' + esc(p.feasible) + '</span>' : ''}</small></div>
          <button class="btn small" data-act="policy" data-c="${id}" data-p="${p.id}" ${p.feasible !== true ? 'disabled' : ''}>執行</button></div>`).join('')}
      </div>` : ''}`;
  }

  function budgetTable(c) {
    const b = c.fiscal.budget, a = c.fiscal.amounts;
    const names = { military: '軍事', education: '教育', research: '科研', welfare: '福利', infrastructure: '建設', admin: '行政' };
    return `<div class="table-wrap"><table><tr><th>預算</th><th>比例</th><th>金額（十億/年）</th></tr>
      ${Object.keys(names).map((k) => `<tr><td>${names[k]}</td><td class="num">${(b[k] * 100).toFixed(1)}%</td><td class="num">${(a[k] || 0).toFixed(2)}</td></tr>`).join('')}
      <tr><td>收入／支出／利息</td><td></td><td class="num">${c.fiscal.revenue.toFixed(2)}／${c.fiscal.spending.toFixed(2)}／${c.fiscal.interest.toFixed(2)}</td></tr></table></div>`;
  }

  // ======================= 世界 =======================
  function worldTab() {
    const w = W();
    const ids = U.ids(w);
    const canRule = w.mode === 'global';
    const tensions = Object.values(w.relations).filter((r) => w.countries[r.a].alive && w.countries[r.b].alive).sort((a, b) => a.rel - b.rel).slice(0, 6);
    return `
      <div class="card"><h3>各國現況</h3><div class="table-wrap"><table>
        <tr><th>國家</th><th>制度</th><th>人口</th><th>GDP</th><th>人均</th><th>穩定</th><th>軍力</th><th>科技</th></tr>
        ${ids.map((id) => { const c = w.countries[id]; return `<tr class="click" data-act="open-country" data-id="${id}"><td><span style="color:${c.color}">●</span> ${esc(c.name)}</td><td>${esc(U.regime(w, c.regime).name)}</td>
          <td class="num">${fPop(U.popTotal(c))}</td><td class="num">${fGdp(c.econ.gdp)}</td><td class="num">${Math.round(c.econ.gdppc)}</td><td class="num">${c.pol.stability.toFixed(0)}</td>
          <td class="num">${c.mil.power.toFixed(0)}</td><td class="num">${WS.Technology.score(c).toFixed(0)}</td></tr>`; }).join('')}
      </table></div></div>
      <div class="grid g2">
        <div class="card"><h3>戰爭</h3>${w.wars.slice().reverse().slice(0, 8).map((x) => `<div class="policy"><div><b>${esc(x.name)}</b><small>${x.start.y}.${x.start.m} 起${x.ended ? `・${x.end.y}.${x.end.m} 結束` : '・進行中'}・戰局 ${x.score.toFixed(0)}・
          ${esc(x.attackers.map((a) => w.countries[a].name).join('、'))} 對 ${esc(x.defenders.map((a) => w.countries[a].name).join('、'))}</small></div>${x.eventId ? `<button class="link" data-act="event" data-id="${x.eventId}">原因</button>` : ''}</div>`).join('') || '<p class="dim">目前沒有戰爭。</p>'}</div>
        <div class="card"><h3>國際組織</h3>${Object.values(w.organizations).map((o) => `<div class="policy"><div><b>${esc(o.name)}</b><small>${o.founded} 年成立${o.dissolved ? `・${o.dissolved} 年解散` : ''}・${esc(o.members.map((m) => w.countries[m] ? w.countries[m].name : m).join('、'))}</small></div></div>`).join('') || '<p class="dim">尚未形成。三個以上國家彼此關係超過 50 時會自行建立。</p>'}</div>
        <div class="card"><h3>最緊張的雙邊關係</h3>${tensions.map((r) => `<div class="policy"><div>${esc(w.countries[r.a].name)}－${esc(w.countries[r.b].name)} <span class="num ${cls(r.rel)}">${r.rel.toFixed(0)}</span><small>${esc(r.baseWhy || '')}</small></div><button class="link" data-act="why-rel" data-a="${r.a}" data-b="${r.b}">原因</button></div>`).join('')}</div>
        <div class="card"><h3>世界規則 ${canRule ? '<span class="tag gold">可干預</span>' : ''}</h3>
          ${canRule ? rulesEditor(w.rules, 'live-rule') + '<p class="dim">觀察者干預：改變規則會記錄成事件，並依第 11 章執行制度轉換。</p>'
            : `<div class="row">${Object.keys(w.rules).map((k) => `<span class="tag">${esc(WS.Data.rules[k].name)}：${esc(WS.Rules.describe(k, w.rules[k]))}</span>`).join('')}</div><p class="dim">切換到「全球」模式即可修改世界規則（世界狀態不會重置）。</p>`}
        </div>
      </div>`;
  }

  // ======================= 歷史 =======================
  function historyTab() {
    const w = W();
    const ids = Object.keys(w.series.c).sort();
    const metric = S.chartMetric;
    const series = ids.filter((id) => w.series.c[id][metric].some((v) => v != null)).map((id) => ({
      name: w.countries[id].name, color: w.countries[id].color, data: w.series.c[id][metric], bold: w.mode === 'country' && id === w.focus
    }));
    if (S.compare && S.compare.series) {
      const cs = S.compare;
      const focusId = w.mode === 'country' ? w.focus : null;
      if (focusId && cs.series.c[focusId]) series.push({ name: w.countries[focusId].name + '（' + cs.name + '）', color: '#fbbf24', dash: true, bold: true, data: alignSeries(w.series.labels, cs.series.labels, cs.series.c[focusId][metric]) });
    }
    let evs = w.events.slice().reverse();
    if (S.histFilter === 'major') evs = evs.filter((e) => e.level >= 3 || e.type === 'historical-missed');
    if (S.histFilter === 'focus') evs = evs.filter((e) => e.countries.includes(w.focus));
    const saves = WS.Save.list().filter((s) => s.world_id === w.world_id || true);
    return `
      <div class="card"><h3>歷史數據</h3>
        <select data-act="chart-metric" style="margin-bottom:8px">${WS.History.METRICS.map((m) => `<option value="${m}" ${m === metric ? 'selected' : ''}>${WS.History.LABELS[m]}</option>`).join('')}</select>
        ${chart(w.series.labels, series, { label: WS.History.LABELS[metric] })}
        ${S.compare ? `<p class="dim">虛線＝比較世界線「${esc(S.compare.name)}」<button class="link" data-act="compare-clear">取消比較</button></p>` : ''}
      </div>
      <div class="card"><h3>平行世界</h3>
        <p class="dim">目前世界線：<b style="color:var(--text)">${esc(w.branch.name)}</b>${w.branch.parent ? `（${w.branch.divergeYear} 年分自「${esc(w.branch.parentName || w.branch.parent)}」，原因：${esc(w.branch.reason)}）` : ''}</p>
        <div class="row"><button class="btn small" data-act="branch-now">從現在建立分支</button></div>
        <h3 style="margin-top:14px">歷史回溯</h3>
        <p class="dim">回到過去的快照建立新世界線，原本的歷史保留不變（快照每 5 年一次，存在本次開啟期間）。</p>
        <div class="row">${engine.snapshots.map((s, i) => `<button class="btn small" data-act="rewind" data-i="${i}">${s.year} 年</button>`).join('')}</div>
        <h3 style="margin-top:14px">歷史比較</h3>
        <p class="dim">選一個已儲存的世界線，以實際模擬數據對照（比較${w.mode === 'country' ? esc(w.countries[w.focus].name) : '各國'}的上方指標）。</p>
        <div class="row">${saves.length ? saves.slice(0, 10).map((s) => `<button class="btn small" data-act="compare" data-id="${s.id}">${esc(s.name)}・${esc(s.branch)}・${s.year}</button>`).join('') : '<span class="dim">先到「系統」頁儲存不同的世界線。</span>'}</div>
      </div>
      <div class="card"><h3>事件時間線</h3>
        ${seg2('hist-filter', S.histFilter, [['major', '重大事件'], ['focus', '本國'], ['all', '全部']])}
        <ul class="events" style="margin-top:10px">${evs.slice(0, 120).map(eventItem).join('') || '<li class="dim">尚無事件</li>'}</ul></div>
      <div class="card"><h3>歷史紀錄（自動敘述）</h3>${w.chronicle.slice().reverse().slice(0, 40).map((c) => `<p class="chron"><b>${c.year} 年</b>\n${esc(c.text)}</p>`).join('') || '<p class="dim">尚無</p>'}</div>`;
  }
  function seg2(act, value, opts) {
    return `<div class="seg">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" class="${value === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function alignSeries(labels, otherLabels, data) {
    return labels.map((l) => { const i = otherLabels.indexOf(l); return i >= 0 ? data[i] : null; });
  }

  // ======================= 為什麼 =======================
  function explainTab() {
    const w = W();
    const ids = U.ids(w);
    const id = S.view && w.countries[S.view] && w.countries[S.view].alive ? S.view : w.countries[w.focus] && w.countries[w.focus].alive ? w.focus : ids[0];
    const qs = WS.Explain.questions(w, id);
    return `
      <div class="seg">${ids.map((x) => `<button data-act="view" data-v="${x}" class="${x === id ? 'on' : ''}">${esc(w.countries[x].name)}</button>`).join('')}</div>
      <div class="card"><h3>世界解釋系統</h3>
        <p class="dim">答案全部取自實際模擬紀錄（因果帳、事件、決策紀錄），不是事先寫好的劇情。</p>
        ${qs.map((q, i) => `<details class="qa" ${i === 0 ? 'open' : ''}><summary>${esc(q.q)}</summary><div>${esc(q.a)}
          ${q.metric ? `<p><button class="link" data-act="why" data-c="${id}" data-m="${q.metric}" data-s="${q.scope}">展開完整原因 ›</button></p>` : ''}
          ${q.eventId ? `<p><button class="link" data-act="event" data-id="${q.eventId}">查看事件 ›</button></p>` : ''}</div></details>`).join('')}
      </div>
      <div class="card"><h3>查詢任一指標</h3><div class="row">${Object.entries(WS.Explain.METRIC_NAMES).map(([m, n]) => `<button class="btn small" data-act="why" data-c="${id}" data-m="${m}">${n}</button>`).join('')}</div></div>`;
  }

  function whyModal(cid, metric, scope) {
    const w = W();
    const sc = scope === undefined || scope === 'undefined' ? 'last' : scope === 'current' || scope === 'last' ? scope : Number(scope);
    const r = WS.Explain.metric(w, cid, metric, sc);
    const max = Math.max(1e-9, ...r.factors.map((f) => Math.abs(f.v)));
    const dec = ['population', 'food', 'research', 'energy'].includes(metric) ? 2 : 1;
    openModal(`<h2>為什麼會這樣？${esc(w.countries[cid].name)}・${esc(r.name)}</h2>
      <p class="dim">${esc(r.label)}合計變動 <b class="${cls(r.total)}">${sg(r.total, dec)}</b>。點擊因素可查看細項或追蹤更深層原因。</p>
      ${seg2('why-scope', String(sc), [['last', '上一年'], ['current', '今年至今'], ['10', '近十年']]).replace(/data-act="why-scope"/g, `data-act="why" data-c="${cid}" data-m="${metric}"`).replace(/data-v=/g, 'data-s=')}
      <div style="margin-top:12px">${r.factors.map((f) => `<div class="factor"><details><summary class="factor-row" style="list-style:none">
          <span>${esc(f.name)}<div class="fbar"><i class="${f.v >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(f.v) / max) * 50}%"></i></div></span>
          <span class="num ${cls(f.v)}" style="text-align:right">${sg(f.v, dec)}</span></summary>
          <div class="subs">${f.sub.map(([s, v]) => `<div>${esc(s)}：<span class="num ${cls(v)}">${sg(v, dec)}</span></div>`).join('')}
          ${f.link ? `<button class="link" data-act="why" data-c="${cid}" data-m="${f.link}" data-s="${sc}">繼續追蹤：${esc(WS.Explain.METRIC_NAMES[f.link])}的原因 ›</button>` : ''}</div></details></div>`).join('') || '<p class="dim">這段期間沒有記錄到變化。</p>'}</div>`);
  }

  function relModal(a, b) {
    const w = W();
    const r = U.relation(w, a, b);
    openModal(`<h2>${esc(w.countries[a].name)}－${esc(w.countries[b].name)} 關係 ${r.rel.toFixed(0)}</h2>
      <p class="dim">關係每月朝「目標值」${(r.target ?? r.rel).toFixed(0)} 調整。目標值由以下因素加總：</p>
      ${Object.entries(r.parts || {}).filter(([, v]) => v).map(([k, v]) => `<div class="policy"><span>${esc(k)}${k === '既有爭端或情誼' && r.baseWhy ? '（' + esc(r.baseWhy) + '）' : ''}</span><span class="num ${cls(v)}">${sg(v)}</span></div>`).join('')}
      ${r.war ? '<p class="bad">雙方處於戰爭狀態，目標值固定為 −90。</p>' : ''}
      ${r.memory.length ? `<h3 style="margin-top:12px;color:var(--blue);font-size:14px">國家記憶</h3><ul class="list-plain">${r.memory.map((m) => `<li>${m.year} 年：${esc(m.text)}（${sg(m.v, 0)}，逐年淡化）</li>`).join('')}</ul>` : ''}`);
  }

  function eventModal(id) {
    const w = W();
    const e = w.events.find((x) => x.id === id);
    if (!e) return toast('這個事件已超出保存範圍');
    const parent = e.parent && w.events.find((x) => x.id === e.parent);
    const fol = e.followups.map((f) => w.events.find((x) => x.id === f)).filter(Boolean);
    openModal(`<h2>${esc(e.title)}</h2>
      <p class="dim">${e.y} 年 ${e.m} 月・${typeLabel(e.type)}${e.countries.length ? '・相關：' + e.countries.map((c) => esc(w.countries[c] ? w.countries[c].name : c)).join('、') : ''}</p>
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
      ${e.trigger ? `<p><span class="tag gold">觸發</span> ${esc(e.trigger)}</p>` : ''}
      ${e.causes.length ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">為什麼會發生</h3><ul class="list-plain">${e.causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${e.effects.length ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">造成的影響</h3><ul class="list-plain">${e.effects.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${e.decision ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">決策過程</h3><p class="dim">候選方案：${e.decision.alternatives.map((a) => esc(a[0]) + ' ' + a[1]).join('、') || '無'}（選中方案評分 ${e.decision.score}）</p>` : ''}
      ${parent ? `<p>前因事件：<button class="link" data-act="event" data-id="${parent.id}">${esc(parent.title)}</button></p>` : ''}
      ${fol.length ? `<p>後續事件：${fol.map((f) => `<button class="link" data-act="event" data-id="${f.id}">${esc(f.title)}</button>`).join('、')}</p>` : ''}
      <p class="dim" style="margin-top:12px">如果玩家介入，可能改變什麼？到「歷史」頁回溯到事件之前建立分支，改變政策或世界規則後，用歷史比較對照結果。</p>`);
  }

  function decisionModal(evs) {
    const w = W();
    const focus = w.mode === 'country' ? w.countries[w.focus] : null;
    const ev = focus && focus.alive ? engine.evaluate(focus.id) : null;
    openModal(`<h2>重大事件：要介入嗎？</h2>
      <ul class="events">${evs.map(eventItem).join('')}</ul>
      ${ev ? `<h3 style="color:var(--blue);font-size:14px;margin:12px 0 6px">${esc(focus.name)}可採取的政策（系統評分）</h3>
        ${ev.list.filter((p) => p.feasible === true).slice(0, 5).map((p) => `<div class="policy"><div>${esc(p.name)}<small>${esc(WS.Policies.defs[p.id].desc)}</small></div><button class="btn small" data-act="policy" data-c="${focus.id}" data-p="${p.id}" data-close="1">執行</button></div>`).join('')}`
        : '<p class="dim">全球模式：可到「世界」頁修改世界規則來干預。</p>'}
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="close-modal">交由系統處理，繼續</button>${!ev ? '<button class="btn" data-act="goto-rules">前往修改世界規則</button>' : ''}</div>`);
  }

  // ======================= 系統 =======================
  function systemTab() {
    const w = W();
    const saves = WS.Save.list();
    const adv = w.difficulty === 'advanced';
    return `
      <div class="card"><h3>存檔</h3>
        <div class="row"><input type="text" id="save-name" value="${esc(w.name + '・' + w.branch.name + '・' + w.year)}" style="flex:1;min-width:180px"><button class="btn" data-act="save">儲存</button></div>
        <div class="row" style="margin-top:8px"><button class="btn small" data-act="export">匯出 JSON</button><label class="btn small" style="display:inline-flex;align-items:center">匯入 JSON<input type="file" id="import" accept="application/json,.json" hidden></label><button class="btn small" data-act="home">回到開始畫面</button></div>
        <div style="margin-top:10px">${saves.map((s) => `<div class="policy"><div>${esc(s.name)}<small>${esc(s.branch)}・${s.year}.${s.month}・${s.mode === 'country' ? '國家模式' : '全球模式'}・${new Date(s.saved).toLocaleString()}</small></div>
          <div class="row"><button class="btn small" data-act="load" data-id="${s.id}">載入</button><button class="btn small" data-act="del-save" data-id="${s.id}">刪除</button></div></div>`).join('') || '<p class="dim">沒有存檔。每次推進後會自動存到「繼續遊戲」。</p>'}</div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>設定</h3>
          <div class="field"><label>設定深度</label>${seg2('depth-live', w.difficulty, [['simple', '簡易'], ['custom', '自訂'], ['advanced', '進階']])}</div>
          <div class="field"><label>玩家介入</label>${seg2('intervention-live', w.intervention, [['none', '不介入'], ['occasional', '偶爾決策'], ['full', '完全控制']])}</div>
          <p class="dim">世界 ID：${esc(w.world_id)}・種子：${esc(w.seed)}・模擬版本 ${esc(w.simulation_version)}・參數 ${esc(w.paramsVersion)}</p>
        </div>
        <div class="card"><h3>數值驗證</h3><p class="dim">已檢查 ${w.validation.checks} 期，發現 ${w.validation.issues.length} 個問題（自動修正並記錄）。</p>
          <ul class="list-plain">${w.validation.issues.slice(-8).reverse().map((i) => `<li>${i.y}.${i.m}　${esc(i.text)}</li>`).join('') || '<li class="good">沒有異常</li>'}</ul></div>
        <div class="card"><h3>每期固定計算順序</h3><ol class="list-plain">${WS.STEP_ORDER.map((s) => `<li>${esc(s.replace(/^\d+ /, ''))}</li>`).join('')}</ol></div>
        ${adv ? `<div class="card"><h3>模型參數（進階）</h3><p class="dim">所有係數皆為待校準的示意值。修改後會記錄在事件中，只影響這條世界線。</p>${paramsEditor(w.params)}</div>` : ''}
      </div>`;
  }
  function paramsEditor(params) {
    let out = '';
    for (const grp of Object.keys(params)) {
      out += `<details class="qa"><summary>${esc(grp)}</summary><div>`;
      for (const k of Object.keys(params[grp])) {
        const v = params[grp][k];
        if (typeof v === 'number') out += `<div class="policy"><span class="dim">${esc(k)}</span><input type="number" step="any" value="${v}" data-param="${grp}.${k}" style="width:110px;min-height:36px"></div>`;
      }
      out += '</div></details>';
    }
    return out;
  }

  // ======================= 動作 =======================
  function startWorld(setup) {
    const s = setup;
    const rules = Object.assign({}, s.rules);
    engine.create({
      mode: s.mode, difficulty: s.depth, focus: s.focus, scenario: s.scenario, intervention: s.intervention,
      direction: s.direction, speed: s.speed, rules, seed: s.seed
    });
    S.speed = s.speed; S.screen = 'game'; S.tab = 'overview'; S.view = null; S.compare = null;
    WS.Save.autosave(W());
    render();
  }

  function doAdvance(months) {
    const res = engine.advance(months);
    WS.Save.autosave(W());
    render();
    if (res.stopped) { stopAuto(); decisionModal(res.events); }
    return res;
  }
  function stopAuto() { if (S.auto) { clearInterval(S.auto); S.auto = null; } }
  function toggleAuto() {
    if (S.auto) { stopAuto(); WS.Save.autosave(W()); render(); return; }
    S.auto = setInterval(() => {
      const res = engine.advance(1);
      if (W().month === 1) WS.Save.autosave(W());
      if (res.stopped) { stopAuto(); render(); decisionModal(res.events); return; }
      if (modal.hidden) render();
    }, 160);
    render();
  }

  function switchWorld(w2, msg) {
    stopAuto();
    engine.load(w2);
    S.screen = 'game'; S.compare = null; S.speed = W().speed || 'decade';
    WS.Save.autosave(W());
    closeModal(); render(); if (msg) toast(msg);
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t) { if (ev.target === modal) closeModal(); return; }
    const a = t.dataset.act, v = t.dataset.v;
    switch (a) {
      case 'close-modal': closeModal(); break;
      case 'home': stopAuto(); S.screen = 'start'; render(); break;
      case 'new-world': S.setup = newSetup('country'); S.nl = ''; S.nlResult = null; S.screen = 'setup'; render(); break;
      case 'custom-world': S.setup = Object.assign(newSetup('global'), { depth: 'custom', civil: 'custom' }); S.screen = 'setup'; render(); break;
      case 'scenario': startWorld(Object.assign(newSetup('country'), { focus: 'CHN', intervention: 'none', direction: 'natural', speed: 'decade' })); toast('《帝國的轉折》：中國 1911、真實歷史、自然發展、不介入'); break;
      case 'continue': try { engine.load(WS.Save.readAutosave()); S.screen = 'game'; S.speed = W().speed || 'decade'; render(); } catch (e) { toast('自動存檔無法讀取：' + e.message); } break;
      case 'load-menu': openModal(`<h2>載入存檔</h2>${WS.Save.list().map((s) => `<div class="policy"><div>${esc(s.name)}<small>${esc(s.branch)}・${s.year}.${s.month}</small></div><button class="btn small" data-act="load" data-id="${s.id}">載入</button></div>`).join('')}`); break;
      case 'set': {
        const s = S.setup;
        s[t.dataset.k] = v;
        if (t.dataset.k === 'mode') { const keep = s.depth; S.setup = Object.assign(newSetup(v), { depth: keep }); }
        if (t.dataset.k === 'civil' && v === 'history') s.rules = Object.assign({}, RULE_DEFAULTS);
        renderSetup(); break;
      }
      case 'rule': S.setup.rules[t.dataset.k] = JSON.parse(v); renderSetup(); break;
      case 'resolve-conflict': {
        const c = WS.Data.ruleConflicts.find((x) => x.id === t.dataset.id);
        Object.assign(S.setup.rules, c.options[+t.dataset.i].set); renderSetup(); break;
      }
      case 'nl-parse': {
        S.nl = document.getElementById('nl').value;
        S.nlResult = WS.Rules.parseNL(S.nl);
        Object.assign(S.setup.rules, S.nlResult.set);
        if (S.nlResult.matched.length) { S.setup.civil = 'custom'; S.setup.ruleMode = 'modify'; }
        renderSetup(); break;
      }
      case 'start-sim': {
        const seedEl = document.getElementById('seed');
        if (seedEl) S.setup.seed = seedEl.value.trim();
        startWorld(S.setup); break;
      }
      case 'advance': S.speed = v; doAdvance(SPEEDS[v][0]); break;
      case 'auto': toggleAuto(); break;
      case 'tab': S.tab = v; closeModal(); render(); window.scrollTo(0, 0); break;
      case 'mode': engine.setMode(v); render(); toast(v === 'global' ? '切換為全球模式（世界狀態不變）' : '切換為國家模式'); break;
      case 'view': S.view = v; render(); break;
      case 'open-country': S.view = t.dataset.id; S.tab = 'country'; render(); window.scrollTo(0, 0); break;
      case 'why': whyModal(t.dataset.c, t.dataset.m, t.dataset.s); break;
      case 'why-rel': relModal(t.dataset.a, t.dataset.b); break;
      case 'event': eventModal(t.dataset.id); break;
      case 'hist-filter': S.histFilter = v; render(); break;
      case 'policy': {
        const r = engine.applyPolicy(t.dataset.c, t.dataset.p);
        toast(r.ok ? '已執行：' + r.effects.join('；') : '無法執行：' + r.reason);
        if (t.dataset.close) closeModal();
        render(); break;
      }
      case 'live-rule': {
        const r = engine.changeRule(t.dataset.k, JSON.parse(v));
        if (!r.ok) {
          openModal(`<h2>規則衝突</h2>${r.conflicts.map((c) => `<p>${esc(c.text)}</p><div class="row">${c.options.map((o, i) => `<button class="btn small" data-act="live-resolve" data-id="${c.id}" data-i="${i}" data-k="${t.dataset.k}" data-v='${esc(v)}'>${esc(o.label)}</button>`).join('')}</div>`).join('')}<p class="dim">系統不會自行猜測，請選擇採用哪一種制度。</p>`);
        } else if (!r.unchanged) toast('規則已改變，制度轉換已記錄');
        render(); break;
      }
      case 'live-resolve': {
        const c = WS.Data.ruleConflicts.find((x) => x.id === t.dataset.id);
        const opt = c.options[+t.dataset.i].set;
        for (const k of Object.keys(opt)) { if (k !== t.dataset.k) engine.changeRule(k, opt[k]); }
        if (!(t.dataset.k in opt)) engine.changeRule(t.dataset.k, JSON.parse(t.dataset.v));
        closeModal(); render(); break;
      }
      case 'goto-rules': closeModal(); engine.setMode('global'); S.tab = 'world'; render(); break;
      case 'chart-metric': break;
      case 'branch-now':
        openModal(`<h2>建立新的世界線</h2><p class="dim">原世界線會先自動存檔，之後你在新分支做的任何改變都不會影響它。</p>
          <div class="field"><label for="branch-name">分支名稱</label><input type="text" id="branch-name" value="分支 ${W().year}"></div>
          <button class="btn primary" data-act="branch-confirm">建立並進入新分支</button>`);
        break;
      case 'branch-confirm': {
        const name = (document.getElementById('branch-name').value || '').trim() || '分支 ' + W().year;
        const parent = W();
        const r1 = WS.Save.write(parent, parent.name + '・' + parent.branch.name + '・' + parent.year + '（分歧點）');
        const nw = engine.createBranch(name, '玩家在 ' + parent.year + ' 年建立分支');
        const keep = engine.snapshots;
        switchWorld(nw, r1.ok ? '已保存原世界線，現在進入新分支「' + name + '」' : '已進入新分支（原世界線未能存檔：' + r1.reason + '）');
        engine.snapshots = keep; render();
        break;
      }
      case 'rewind': {
        const snap = engine.snapshots[+t.dataset.i];
        const parent = W();
        const r1 = WS.Save.write(parent, parent.name + '・' + parent.branch.name + '・' + parent.year);
        const nw = engine.branchFromSnapshot(+t.dataset.i, '回溯 ' + snap.year, '歷史回溯至 ' + snap.year + ' 年');
        const snaps = engine.snapshots.filter((s) => s.year <= snap.year);
        switchWorld(nw, r1.ok ? `原世界線已存檔，已回到 ${snap.year} 年的新分支` : `已回到 ${snap.year} 年（原世界線未能存檔：${r1.reason}）`);
        engine.snapshots = snaps.map((s) => s);
        render(); break;
      }
      case 'compare': {
        const other = WS.Save.read(t.dataset.id);
        if (other) { S.compare = { name: other.branch.name + '・' + other.year, series: other.series }; render(); toast('已加入比較（虛線）'); }
        break;
      }
      case 'compare-clear': S.compare = null; render(); break;
      case 'save': {
        const r = WS.Save.write(W(), document.getElementById('save-name').value);
        toast(r.ok ? '已儲存' : r.reason); render(); break;
      }
      case 'load': { const w2 = WS.Save.read(t.dataset.id); if (w2) switchWorld(w2, '已載入'); break; }
      case 'del-save': openModal(`<h2>刪除這個存檔？</h2><p class="dim">刪除後無法復原。</p><div class="row"><button class="btn" data-act="del-save-yes" data-id="${esc(t.dataset.id)}">刪除</button><button class="btn" data-act="close-modal">取消</button></div>`); break;
      case 'del-save-yes': WS.Save.remove(t.dataset.id); closeModal(); render(); toast('已刪除'); break;
      case 'export': {
        const blob = new Blob([engine.serialize()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const el = document.createElement('a');
        el.href = url; el.download = `world-${W().branch.name}-${W().year}.json`;
        el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
      }
      case 'depth-live': engine.setDifficulty(v); render(); break;
      case 'intervention-live': engine.setIntervention(v); render(); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.act === 'set-select') { S.setup[t.dataset.k] = t.value; renderSetup(); }
    if (t.dataset.act === 'focus') { engine.setFocus(t.value); S.view = null; render(); }
    if (t.dataset.act === 'chart-metric') { S.chartMetric = t.value; render(); }
    if (t.dataset.param) { const v = parseFloat(t.value); if (isFinite(v)) { engine.setParam(t.dataset.param, v); toast('參數已更新'); } }
    if (t.id === 'import' && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => { try { switchWorld(WS.Save.migrate(fr.result), '已匯入'); } catch (e) { toast('匯入失敗：' + e.message); } };
      fr.readAsText(t.files[0]);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  render();
})();
