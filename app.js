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
    setup: null, compare: null, nl: '', nlResult: null, speed: 'decade', whatif: null, wiMetric: 'gdp', mapView: 'globe'
  };
  // 事件介入方式（玩家偏好，存在這台裝置上；只決定自動播放什麼時候停下來，不影響世界）
  const PAUSE_KEY = 'ws.pauseMode';
  function loadPauseMode() {
    try { const st = WS.Save.storage(); const v = st && st.getItem(PAUSE_KEY); return WS.Events.PAUSE_MODES[v] ? v : 'critical'; } catch (e) { return 'critical'; }
  }
  function setPauseMode(v) {
    if (!WS.Events.PAUSE_MODES[v]) return;
    S.pauseMode = v; engine.pauseMode = v;
    try { const st = WS.Save.storage(); if (st) st.setItem(PAUSE_KEY, v); } catch (e) { /* 無法儲存時只在這次有效 */ }
  }
  S.pauseMode = loadPauseMode(); engine.pauseMode = S.pauseMode;
  S.uiTheme = WS.EraTheme.pref();
  // 會轉的地球（只畫圖）：點國家＝打開該國資料；點標籤＝看事件原因或戰場畫面
  const globe = window.WSGlobe ? WSGlobe.get() : null;
  if (globe) {
    globe.onPick = (id) => { S.view = id; S.tab = 'country'; render(); window.scrollTo(0, 0); };
    globe.onEvent = (tag) => { if (tag.war) warCamModal(tag.war); else if (tag.event) eventModal(tag.event); };
  }
  // 地球上的視覺效果全部由引擎狀態「讀出來」，不寫入任何數值
  const MIL_ERA = ['machinegun', 'armor', 'aviation', 'jet', 'rocketry'];
  function hasTech(c, t) { return !!(c.tech[t] && WS.Data.techs[t] && c.tech[t].progress >= WS.Data.techs[t].cost); }
  function eraOf(c) { let e = 0; MIL_ERA.forEach((t, i) => { if (hasTech(c, t)) e = i; }); return e; }
  function eventKind(e) {
    if (e.type === 'war') return /^戰爭爆發/.test(e.title) ? 'war-start' : 'war-end';
    if (e.type === 'regime' || e.type === 'newregime') return 'upheaval';
    if (e.type === 'newcountry') return 'newcountry';
    if (e.type === 'divine') return 'divine';
    if (e.type === 'catastrophe' || e.type === 'ending' || (e.type === 'future' && futureVariant(e))) return 'future';
    if (e.type === 'tech') return /率先/.test(e.title) ? 'tech-first' : 'tech';
    if (e.type === 'organization' && /成立/.test(e.title)) return 'org';
    if (e.type === 'conditional' || e.type === 'historical') {
      if (e.defId === 'famine' || /旱災|饑荒/.test(e.title)) return 'famine';
      if (['revolution', 'coup', 'democratization', 'warlordism', 'secession', 'reunification'].includes(e.defId) || e.defId === 'wuchang') return 'upheaval';
    }
    return null;
  }
  // 未來時代事件 → 動畫種類
  function futureVariant(e) {
    if (e.fk) return e.fk;
    if (/火星/.test(e.title)) return 'mars';
    if (/星際/.test(e.title)) return 'stars';
    if (/小行星/.test(e.title)) return 'asteroid';
    if (/暖化/.test(e.title)) return 'climate';
    if (/擁核/.test(e.title)) return 'nuclear';
    return null;
  }
  let worldObj = null, worldKey = 0;
  function globeData() {
    if (S.screen !== 'game' || !engine.world) return { markers: [], links: [], focus: null, worldKey: 'start' };
    if (isAnc()) return ancientGlobeData();
    const w = W();
    if (w !== worldObj) { worldObj = w; worldKey++; }
    const T = window.WS_TERRITORY || {};
    const nowM = w.year * 12 + w.month;
    const ageM = (e) => nowM - (e.y * 12 + e.m);
    const ids = U.ids(w);
    // 最近的饑荒、旱災：國土慢慢從黃褐色恢復
    const famineAge = {};
    for (let i = w.events.length - 1; i >= 0 && ageM(w.events[i]) <= 24; i--) {
      const e = w.events[i];
      if (eventKind(e) === 'famine') for (const c of e.countries) if (famineAge[c] == null) famineAge[c] = ageM(e);
    }
    const markers = ids.map((id) => {
      const c = w.countries[id];
      const gdppc = Math.max(1, c.econ.gdppc || 1);
      const rich = U.clamp(Math.log(gdppc / 300) / Math.log(100), 0, 1);
      const fam = Math.max(U.clamp((c.res.shortage || 0) * 3, 0, 1), famineAge[id] != null ? 0.8 * (1 - famineAge[id] / 24) : 0);
      return {
        id, name: c.name, lat: c.lat, lon: c.lon, color: c.color, size: Math.max(2.8, Math.sqrt(U.popTotal(c)) * 0.5), war: !!c.flags.atWar,
        anchors: T[id] && !c.parent ? T[id] : [[c.lat, c.lon, U.clamp(3 + Math.sqrt(U.popTotal(c)) * 0.35, 3, 9)]],
        light: U.clamp(c.demo.urban, 0, 1) * (0.15 + 0.85 * rich) * 0.9,
        famine: fam
      };
    });
    const links = [];
    const trade = [];
    for (const k of Object.keys(w.relations)) {
      const r = w.relations[k];
      if (!w.countries[r.a] || !w.countries[r.b] || !w.countries[r.a].alive || !w.countries[r.b].alive) continue;
      if (r.war) links.push({ a: r.a, b: r.b, type: 'war' });
      else if (r.alliance) links.push({ a: r.a, b: r.b, type: 'alliance' });
      else if (r.trade > 0.35) trade.push({ a: r.a, b: r.b, type: 'trade', k: U.clamp((r.trade - 0.35) / 0.4, 0, 1) });
    }
    trade.sort((x, y) => y.k - x.k);
    links.unshift(...trade.slice(0, 8));
    const alive = (x) => w.countries[x] && w.countries[x].alive;
    const live = w.wars.filter((x) => !x.ended);
    const fronts = live.map((x) => ({ a: x.attackers.filter(alive), d: x.defenders.filter(alive) }));
    // 戰後焦土：傷亡越重越明顯，60 個月內淡掉
    const scorch = w.wars.filter((x) => x.ended && x.end && nowM - (x.end.y * 12 + x.end.m) < 60).map((x) => {
      const cas = Object.values(x.casualties).reduce((a, b) => a + b, 0);
      const age = nowM - (x.end.y * 12 + x.end.m);
      return { a: x.attackers.filter(alive), d: x.defenders.filter(alive), k: U.clamp(0.35 + cas / 1.5, 0.35, 1) * (1 - age / 60) };
    }).filter((x) => x.k > 0.02);
    const events = [];
    for (let i = w.events.length - 1; i >= 0 && events.length < 40; i--) {
      const e = w.events[i];
      if (ageM(e) > 24) break;
      const kind = eventKind(e);
      if (kind) events.unshift({ id: e.id, kind, title: e.title, countries: e.countries.filter((c) => w.countries[c]), major: e.level >= 3 });
    }
    // 可點的標籤：進行中的戰爭（開戰場畫面）＋最近一年的大事（看原因）
    const tags = [];
    for (const x of live) {
      const a = x.attackers.find(alive), d = x.defenders.find(alive);
      const at = d || a;
      if (at) tags.push({ country: at, kind: 'war-start', label: '戰區・看畫面', war: x.id });
    }
    const LBL = { famine: '饑荒', upheaval: '政局劇變', newcountry: '新國家', 'tech-first': '新科技', divine: '神之手' };
    const tagged = new Set();
    for (let i = events.length - 1; i >= 0 && tags.length < 10; i--) {
      const e = events[i];
      const we = w.events.find((x) => x.id === e.id);
      if (!LBL[e.kind] || ageM(we) > 12 || !e.countries[0]) continue;
      const key = e.countries[0] + e.kind;
      if (tagged.has(key)) continue;
      tagged.add(key);
      tags.push({ country: e.countries[0], kind: e.kind, label: LBL[e.kind], event: e.id });
    }
    return { markers, links, focus: w.mode === 'country' ? w.focus : null, fronts, scorch, events, tags, worldKey };
  }
  // ---------- 戰場即時畫面 ----------
  let cam = null;
  function warCamData(warId) {
    const w = W();
    const war = w.wars.find((x) => x.id === warId);
    if (!war) return null;
    const side = (list) => {
      const cs = list.map((x) => w.countries[x]).filter(Boolean);
      const lead = cs[0] || { name: '—', color: '#888' };
      return {
        name: cs.map((c) => c.name).join('、'), color: lead.color,
        personnel: cs.reduce((s, c) => s + (c.alive ? c.mil.personnel : 0), 0),
        casualties: list.reduce((s, x) => s + (war.casualties[x] || 0), 0),
        era: Math.max(0, ...cs.map(eraOf))
      };
    };
    const att = side(war.attackers), def = side(war.defenders);
    const tot = Math.max(1e-6, att.personnel + def.personnel);
    att.share = att.personnel / tot; def.share = def.personnel / tot;
    const cas = att.casualties + def.casualties;
    const months = Math.max(1, war.months);
    const label = { attackers: '進攻方勝利', defenders: '防守方勝利', white: '停戰（無勝負）', negotiated: '談判停戰', collapse: '一方瓦解', rule: '世界規則禁止戰爭，強制停火' }[war.outcome] || '';
    return {
      id: war.id, name: war.name, att, def, score: war.score, months: war.months, ended: war.ended, outcomeLabel: label,
      intensity: U.clamp((cas / months) / 0.05, 0.15, 1), year: w.year, month: w.month, eventId: war.eventId,
      start: war.start, track: war.track || []
    };
  }
  // ---------- 事件畫面（依事件紀錄畫的動畫） ----------
  let scam = null;
  function sceneFor(e) {
    if (!e) return null;
    const w = W();
    const cols = e.countries.map((c) => w.countries[c] && w.countries[c].color).filter(Boolean);
    const place = e.countries.map((c) => w.countries[c] && w.countries[c].name).filter(Boolean).slice(0, 3).join('・');
    const base = { colors: cols.length ? cols : ['#38bdf8'], year: e.y, month: e.m, caption: e.title, place, intensity: 0.6 };
    const kind = eventKind(e);
    if (kind === 'war-start') { const war = w.wars.find((x) => x.eventId === e.id); return war ? { war: war.id } : null; }
    if (kind === 'war-end') return Object.assign(base, { scene: 'peace' });
    if (kind === 'famine') { const c = w.countries[e.countries[0]]; return Object.assign(base, { scene: 'famine', intensity: U.clamp(0.4 + (c ? c.res.shortage * 2 : 0), 0.4, 1) }); }
    if (kind === 'newcountry') return Object.assign(base, { scene: 'newcountry' });
    if (kind === 'org') return Object.assign(base, { scene: 'org', colors: base.colors.slice(0, 6) });
    if (kind === 'tech' || kind === 'tech-first') {
      const m = /「(.+?)」/.exec(e.title);
      const def = m && Object.values(WS.Data.techs).find((d) => d.name === m[1]);
      return Object.assign(base, { scene: 'tech', variant: def ? def.field : 'industry' });
    }
    if (kind === 'divine') return Object.assign(base, { scene: 'upheaval', variant: 'newregime' });
    if (kind === 'future') return Object.assign(base, { scene: 'future', variant: futureVariant(e), place: place || '全球', intensity: 0.8 });
    if (kind === 'upheaval' || e.defId === 'protest') {
      const v = e.defId === 'coup' ? 'coup' : e.defId === 'protest' ? 'protest' : e.defId === 'democratization' ? 'democratization'
        : (e.defId === 'revolution' || e.defId === 'wuchang' || /革命/.test(e.title)) ? 'revolution' : 'newregime';
      const c = w.countries[e.countries[0]];
      return Object.assign(base, { scene: 'upheaval', variant: v, intensity: c ? U.clamp((100 - c.pol.stability) / 100, 0.2, 1) : 0.6 });
    }
    return null;
  }
  function mediaHtml(e) {
    if (isAnc()) return '';
    const sc = sceneFor(e);
    if (!sc) return '';
    if (sc.war) return `<div class="wc-wrap ev-media"><canvas class="wc-canvas" id="ev-media" data-war="${esc(sc.war)}" aria-label="戰場動畫"></canvas></div><p class="dim ev-media-note">依模擬數據畫的動畫，不是真實影像・<button class="link" data-act="warcam" data-id="${esc(sc.war)}">看完整戰場畫面</button></p>`;
    return `<div class="wc-wrap ev-media"><canvas class="wc-canvas" id="ev-media" data-event="${esc(e.id)}" aria-label="事件畫面"></canvas></div><p class="dim ev-media-note">依模擬紀錄畫的動畫，不是真實影像</p>`;
  }
  function mountMedia() {
    const c = document.getElementById('ev-media');
    if (!c) return;
    if (cam) { cam.stop(); cam = null; }
    if (scam) { scam.stop(); scam = null; }
    if (c.dataset.war) { const id = c.dataset.war; cam = new WSWarCam(c, () => warCamData(id)); return; }
    const e = W().events.find((x) => x.id === c.dataset.event);
    const sc = sceneFor(e);
    if (sc && window.WSSceneCam) scam = new WSSceneCam(c, sc);
  }
  const ERA_NAME = ['步兵、機槍與火炮', '裝甲部隊（坦克）', '軍用飛機', '噴射機', '飛彈'];
  function warCamPanel(d) {
    const bar = (v) => `<div class="bar"><i style="width:${U.clamp(50 + v / 2, 0, 100)}%"></i></div>`;
    return `<div class="wc-stats">
      <div class="wc-side"><b style="color:${esc(d.att.color)}">進攻方：${esc(d.att.name)}</b><span>兵力 ${d.att.personnel.toFixed(2)} 百萬・傷亡 ${d.att.casualties.toFixed(2)} 百萬</span><span>裝備：${ERA_NAME[d.att.era]}</span></div>
      <div class="wc-side"><b style="color:${esc(d.def.color)}">防守方：${esc(d.def.name)}</b><span>兵力 ${d.def.personnel.toFixed(2)} 百萬・傷亡 ${d.def.casualties.toFixed(2)} 百萬</span><span>裝備：${ERA_NAME[d.def.era]}</span></div>
      <div class="wc-score"><span>戰況（右＝進攻方占優）</span>${bar(U.clamp(d.score, -100, 100))}<span class="num">分數 ${d.score.toFixed(0)}・已打 ${d.months} 個月</span></div>
    </div>`;
  }
  function warCamModal(warId) {
    const d = warCamData(warId);
    if (!d) return toast('找不到這場戰爭');
    openModal(`<h2>戰場畫面：${esc(d.name)}</h2>
      <p class="dim" style="margin:0 0 8px">依模擬數據即時畫出的動畫，不是真實影像。兵力、傷亡、前線位置、裝備年代都跟著引擎的實際數字變。</p>
      <div class="wc-wrap"><canvas class="wc-canvas" id="wc-canvas" aria-label="${esc(d.name)}的戰場動畫"></canvas></div>
      <div class="row" style="margin:8px 0"><div class="seg mini"><button class="on" data-act="wc-mode" data-v="color">一般</button><button data-act="wc-mode" data-v="thermal">熱成像</button></div>
        ${d.eventId ? `<button class="btn small" data-act="event" data-id="${esc(d.eventId)}">為什麼開戰？</button>` : ''}</div>
      <div id="wc-panel">${warCamPanel(d)}</div>`);
    if (cam) cam.stop();
    if (scam) { scam.stop(); scam = null; }
    cam = new WSWarCam(document.getElementById('wc-canvas'), () => warCamData(warId));
    clearInterval(warCamModal.t);
    warCamModal.t = setInterval(() => {
      const p = document.getElementById('wc-panel');
      if (!p || modal.hidden) { clearInterval(warCamModal.t); return; }
      const dd = warCamData(warId); if (dd) p.innerHTML = warCamPanel(dd);
    }, 500);
  }
  function mountGlobe() {
    if (!globe) return;
    const slot = document.getElementById('globe-slot');
    if (!slot) return;
    globe.setData(globeData());
    globe.attach(slot);
  }
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

  // 國家選擇：國家少時用按鈕，多時（全世界劇本）改用下拉選單，依 GDP 排序
  function countryPicker(w, ids, id) {
    if (ids.length <= 12) return `<div class="seg">${ids.map((x) => `<button data-act="view" data-v="${x}" class="${x === id ? 'on' : ''}">${esc(w.countries[x].name)}</button>`).join('')}</div>`;
    const sorted = ids.slice().sort((a, b) => w.countries[b].econ.gdp - w.countries[a].econ.gdp);
    return `<div class="field"><select data-act="view-select" aria-label="選擇國家">${sorted.map((x) => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(w.countries[x].name)}${w.countries[x].overlord ? '（' + esc(w.countries[w.countries[x].overlord].name) + '屬地）' : ''}</option>`).join('')}</select></div>`;
  }
  // 圖表：國家多時只畫 GDP 前 10 大與觀察國，避免線條擠成一團
  const CHART_MAX = 10;
  function chartIds(w, ids) {
    if (ids.length <= 12) return ids;
    const alive = ids.filter((id) => w.countries[id].alive).sort((a, b) => w.countries[b].econ.gdp - w.countries[a].econ.gdp).slice(0, CHART_MAX);
    if (w.mode === 'country' && !alive.includes(w.focus) && ids.includes(w.focus)) alive.push(w.focus);
    return alive.sort();
  }

  function toast(msg, ms) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms || 2600);
  }
  function openModal(html) {
    modalBody.innerHTML = html; modal.hidden = false; modalBody.scrollTop = 0;
    // 背景音樂：視窗裡有戰場畫面（完整戰場或事件的戰場動畫）時換成戰爭曲，其他視窗用平時的曲子
    if (WS.Music) WS.Music.setMood(/id="wc-canvas"|data-war="/.test(html) ? 'war' : 'calm');
  }
  function closeModal() {
    modal.hidden = true;
    if (cam) { cam.stop(); cam = null; }
    if (WS.Music) WS.Music.setMood('calm');
    if (scam) { scam.stop(); scam = null; }
    // 自動播放因事件暫停：玩家選完、關掉視窗後自動繼續
    if (S.resumeAuto) { S.resumeAuto = false; if (!S.auto && S.screen === 'game') toggleAuto(); }
  }

  // ======================= 開始畫面 =======================
  function renderStart() {
    const hasAuto = WS.Save.hasAutosave();
    const saves = WS.Save.list();
    app.innerHTML = `
      <div class="start">
        <div class="globe-slot hero" id="globe-slot"><div class="hud-tag tl">TERRA-3 · 觀測中</div><div class="hud-tag br">文明調整台 v1</div></div>
        <div class="brand">
          <div class="en">GENESIS · WORLD SIMULATOR</div>
          <h1>創 世界</h1>
          <p>玩家設定世界，模擬器創造歷史，玩家觀察並改變歷史。</p>
        </div>
        <div class="menu">
          <button class="btn primary" data-act="new-world">開始新世界<small>選擇國家模式或全球模式，簡易設定即可開始</small></button>
          <button class="btn" data-act="continue" ${hasAuto ? '' : 'disabled'}>繼續遊戲<small>${hasAuto ? '回到上次自動存檔' : '尚無自動存檔'}</small></button>
          <button class="btn" data-act="load-menu" ${saves.length ? '' : 'disabled'}>載入存檔<small>${saves.length} 個存檔</small></button>
          <button class="btn gold" data-act="ancient">遠古世界<small>《人類的黎明》：從西元前 10,000 年的狩獵採集開始</small></button>
          <button class="btn" data-act="custom-world">自訂世界<small>選起點（1911 年真實世界或遠古），修改世界制度與規則</small></button>
        </div>
        <div class="row notice-links"><button class="btn small" data-act="intro">📢 遊戲介紹</button><button class="btn small" data-act="feedback">💬 意見回饋</button>${supportBtn()}</div>
        ${langPicker()}
      </div>`;
    // 第一次打開遊戲（或公告更新後）自動顯示遊戲介紹
    if (WS.Notice && !WS.Notice.seen() && modal.hidden) setTimeout(() => { if (S.screen === 'start' && modal.hidden) introModal(); }, 400);
  }

  // ======================= 遊戲介紹與意見回饋 =======================
  function introModal() {
    WS.Notice.markSeen();
    openModal(`<div class="notice">
      <h2>歡迎來到《創 世界》</h2>
      <p>這是一個「世界會自己運作」的歷史模擬遊戲。你選一個起點，人口、經濟、政治、科技、外交與戰爭會由模擬器一步一步推進；你可以只是觀察，偶爾介入，或改變世界的根本規則。</p>
      <h3>怎麼玩</h3>
      <ol class="list-plain notice-steps">
        <li><b>開始新世界</b><span>選一個國家來觀察，或用全球模式看整個世界；也可以從西元前 10,000 年的遠古世界開始。</span></li>
        <li><b>推進時間</b><span>按「＋」前進，或按「▶ 自動」讓歷史自己發生；遇到重大危機時會停下來讓你決定。</span></li>
        <li><b>追查原因</b><span>按數字旁的問號，可以一路追查「為什麼會這樣」。</span></li>
        <li><b>平行世界</b><span>按事件旁的「如果」按鈕改寫那件事，比較兩個世界的差別。</span></li>
        <li><b>神之手</b><span>用神力改變世界的條件，但結果不一定照你想的發生。</span></li>
      </ol>
      <h3>小提醒</h3>
      <ul class="list-plain">
        <li>存檔放在這台裝置的瀏覽器裡；換裝置或清除瀏覽器資料之前，請先到「系統」頁備份存檔。</li>
      </ul>
      <h3>最新消息</h3>
      <ul class="list-plain notice-news">${WS.Notice.NEWS.map((n) => `<li><span class="dim num">${esc(n.date)}</span> ${esc(n.text)}</li>`).join('')}</ul>
      <p class="dim">遇到問題或有建議？按「意見回饋」告訴我們，每一則都會看。</p>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="close-modal">開始探索</button><button class="btn" data-act="feedback">💬 意見回饋</button></div>
    </div>`);
  }
  function feedbackModal() {
    const F = WS.Feedback;
    if (!F.ready()) { openModal(`<h2>意見回饋</h2><p>意見箱還在準備中，很快就會開放，謝謝你的耐心。</p><button class="btn" data-act="close-modal">關閉</button>`); return; }
    const d = S.fb || (S.fb = { type: 'bug', text: '', contact: '' });
    openModal(`<div class="feedback">
      <h2>意見回饋</h2>
      <p class="dim">遇到問題、有建議或疑問，都可以寫在這裡，會直接送給開發者。</p>
      <div class="field"><label>類型</label><div class="seg fb-type">${F.TYPES.map(([k, l]) => `<button data-act="fb-type" data-v="${k}" class="${d.type === k ? 'on' : ''}" aria-pressed="${d.type === k}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="fb-text">內容</label><textarea id="fb-text" rows="6" maxlength="${F.MAX}" placeholder="例如：玩到 1950 年時畫面卡住；或希望加入某個功能…"></textarea></div>
      <div class="field"><label for="fb-contact">聯絡方式（選填）</label><input type="text" id="fb-contact" maxlength="200" placeholder="想收到回覆的話，留下 Email 或其他聯絡方式"></div>
      <p class="dim" style="font-size:12.5px">送出時會一併附上：遊戲版本、語言、目前世界的年份與種子、裝置類型（不含個人資料），方便找出問題。</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="fb-send" id="fb-send">送出</button><button class="btn" data-act="close-modal">取消</button></div>
    </div>`);
    // 玩家寫的內容用 value 放回去（不經過畫面翻譯）
    const ta = document.getElementById('fb-text'), ct = document.getElementById('fb-contact');
    ta.value = d.text; ct.value = d.contact;
    ta.addEventListener('input', () => { d.text = ta.value; });
    ct.addEventListener('input', () => { d.contact = ct.value; });
  }
  // 支持作者：只開外部贊助頁面，遊戲不經手付款
  function supportBtn() { return WS.Support && WS.Support.ready() ? '<button class="btn small gold" data-act="support">❤ 支持作者</button>' : ''; }
  function supportModal() {
    const links = WS.Support.links();
    openModal(`<div class="support">
      <h2>支持作者</h2>
      <p>《創 世界》由一個人利用空閒時間製作，免費遊玩、沒有廣告。如果你喜歡這個遊戲，可以請作者喝杯咖啡，支持遊戲繼續更新。</p>
      <div class="support-links">${links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><span translate="no">${esc(l.name)}</span><small>${esc(l.note)}</small></a>`).join('')}</div>
      <p class="dim" style="font-size:12.5px">會在新分頁打開贊助平台的網頁，付款由該平台處理，遊戲不會收到你的付款資料。贊助與否都不影響遊戲內容。</p>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="close-modal">關閉</button></div>
    </div>`);
  }
  function feedbackSend(btn) {
    const F = WS.Feedback, d = S.fb || {};
    const w = S.screen === 'start' ? null : W();
    const r = F.build({ type: d.type, text: d.text, contact: d.contact, info: F.info(w, S.screen === 'start' ? '' : '分頁 ' + S.tab) });
    if (!r.ok) { toast(r.reason); return; }
    if (S.fbSentAt && Date.now() - S.fbSentAt < 20000) { toast('剛剛已經送出一則了，請稍等一下再送。'); return; }
    btn.disabled = true; btn.textContent = '送出中…';
    F.send(r.data).then((res) => {
      if (res.ok) {
        S.fb = null; S.fbSentAt = Date.now();
        openModal(`<h2>已送出，謝謝你！</h2><p>你的意見已經送到開發者手上。${r.data.contact ? '如果需要進一步了解，會用你留下的聯絡方式回覆。' : ''}</p><button class="btn primary" data-act="close-modal">回到遊戲</button>`);
      } else {
        btn.disabled = false; btn.textContent = '送出';
        toast('送不出去：請確認網路連線後再試一次（你寫的內容還在）。', 5000);
      }
    });
  }
  // 語言（只改畫面文字，不影響世界）：開始畫面的小選單用各語言自己的名稱，不翻譯
  function setLanguage(v) {
    const I = WS.I18n;
    I.setPref(v);
    I.switchTo(v === 'auto' ? I.detect() : v, (got) => { render(); toast('🌐 ' + I.LANGS[got].name); });
  }
  // 語言選單（選項用各語言自己的名稱，不翻譯）
  function langSelect(withAuto) {
    const I = WS.I18n, cur = withAuto ? I.pref() : I.lang;
    const opts = (withAuto ? [['auto', '🌐 Auto']] : []).concat(Object.entries(I.LANGS).map(([k, L]) => [k, L.name]));
    return `<select data-act="lang-select" aria-label="Language" translate="no">${opts.map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  }
  function langPicker() {
    if (!WS.I18n) return '';
    return `<div class="lang-pick" translate="no"><span aria-hidden="true">🌐</span>${langSelect(false)}</div>`;
  }
  function langSetting() {
    const I = WS.I18n;
    if (!I) return '';
    const pref = I.pref();
    return `<div class="field"><label>語言 · Language</label><div translate="no">${langSelect(true)}</div>
      <span class="dim">${pref === 'auto' ? `目前依裝置語言自動選擇（${I.LANGS[I.lang].name}）。` : ''}只改畫面文字，不影響世界與存檔。</span></div>`;
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
            <select data-act="set-select" data-k="scenario">${Object.values(WS.Data.scenarios).map((x) => `<option value="${x.id}" ${x.id === s.scenario ? 'selected' : ''}>${x.era === 'ancient' ? '西元前 10,000 年・' + x.countries.length + ' 個地區（遠古）' : x.startYear + ' 年・' + x.countries.length + ' 國' + (x.id === '1911' ? '（列強，推薦新手）' : '（全世界，含殖民地）')}</option>`).join('')}</select>
            <span class="dim">${sc.era === 'ancient' ? '遠古世界沒有國家：以地區為單位，國家模式與世界規則的設定不會用到。' : `1911 年起點分成「8 個列強」與「全世界 ${(WS.Data.scenarios['1911w'] || { countries: [] }).countries.length} 國」兩種；也可以選遠古（西元前 10,000 年）。`}</span></div>
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
    if (sc.era === 'ancient') return [`遠古世界・起點${WS.Ancient.yearLabel(sc.startYear)}`, `${sc.countries.length} 個地理區域，從狩獵採集開始；農業、城市、國家、文字會在哪裡出現由模擬決定`, '目前遠古時代沒有「如果？」與神之手'];
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
    if (S.screen === 'start') renderStart();
    else if (S.screen === 'setup') renderSetup();
    else if (isAnc()) renderAncientGame();
    else renderGame();
    applyTheme();
    mountGlobe();
    mountLife();
    if (WS.Music && S.screen === 'game' && engine.world) WS.Music.setEra(musicEra(W()));
  }

  // 背景音樂與介面風格的時代：看世界上已經出現的最先進科技（只讀取，不改任何數值）
  function musicEra(w) { return WS.EraTheme.age(w); }
  // 介面隨時代換風格（只改外觀）：開始與設定畫面用儀表板，進入世界後跟著時代（或玩家固定的風格）
  function applyTheme() {
    const w = S.screen === 'game' ? engine.world : null;
    const key = WS.EraTheme.pick(w, S.uiTheme);
    if (WS.EraTheme.apply(key) && w && S.uiTheme === 'auto') {
      const T = WS.EraTheme.THEMES[key];
      toast(`世界進入${T.era}：介面換成「${T.name}」風格`, 3600);
    }
  }
  function themeSetting() {
    const ET = WS.EraTheme, cur = ET.pick(S.screen === 'game' ? engine.world : null, 'auto');
    return `<div class="field"><label>介面風格</label>${seg2('ui-theme', S.uiTheme, [['auto', '跟著時代'], ...Object.entries(ET.THEMES).map(([k, t]) => [k, t.name])])}
      <span class="dim">${S.uiTheme === 'auto' ? `世界現在是${ET.THEMES[cur].era}，介面是「${ET.THEMES[cur].name}」（${ET.THEMES[cur].desc}）。石器時代是石板、古文明到大航海是羊皮卷、工業時代是報紙、資訊時代是儀表板、未來是全息螢幕，跟著世界上出現的科技自動換。` : `已固定為「${ET.THEMES[S.uiTheme].name}」，不會隨時代改變。`}只改外觀，不影響世界。</span></div>`;
  }

  function renderGame() {
    const w = W();
    const running = !!S.auto;
    const ids = U.ids(w);
    app.innerHTML = `
      <div class="topbar">
        <div class="topbar-row">
          <div class="sys-id"><i></i>TERRA-3</div>
          <div class="date num">${w.year} 年 ${w.month} 月<small>${esc(w.branch.name)}</small></div>
          <span class="spacer"></span>
          <div class="seg">${[['country', '國家'], ['global', '全球']].map(([v, l]) => `<button data-act="mode" data-v="${v}" class="${w.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${w.mode === 'country' ? `<select data-act="focus" aria-label="觀察國家" style="width:auto;min-height:40px">${ids.map((id) => `<option value="${id}" ${id === w.focus ? 'selected' : ''}>${esc(w.countries[id].name)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="controls">
          ${ended() ? `<button class="btn small gold" data-act="ending">世界已終結・看結局報告</button>` : `${Object.entries(SPEEDS).map(([k, [, l]]) => `<button class="btn small ${S.speed === k ? 'on' : ''}" data-act="advance" data-v="${k}" ${running ? 'disabled' : ''}>＋${l}</button>`).join('')}
          <button class="btn small run" data-act="auto">${running ? '⏸ 暫停' : '▶ 自動'}</button>`}
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
    const cl = (e.type === 'war' ? 'war ' : '') + (e.level >= 3 ? 'l3 ' : '') + (e.type === 'historical-missed' ? 'missed ' : '') + (e.type === 'whatif' ? 'wi' : '');
    const can = WS.WhatIf.options(W(), e).length > 0;
    return `<li class="${cl}" data-act="event" data-id="${e.id}">${can ? `<button class="wi-chip" data-act="whatif" data-id="${e.id}" aria-label="如果這件事改寫了？">如果？</button>` : ''}<div class="when">${e.y}.${String(e.m).padStart(2, '0')}・${typeLabel(e.type)}</div>${esc(e.title)}</li>`;
  }
  function typeLabel(t) {
    return { war: '戰爭', regime: '政權', leader: '人物', tech: '科技', decision: '決策', historical: '歷史事件', 'historical-missed': '歷史分歧', conditional: '條件事件', organization: '國際組織', newcountry: '新國家', newregime: '新制度', diplomacy: '外交', rule: '世界規則', branch: '分支', system: '系統', whatif: '如果', divine: '神之手', future: '未來', catastrophe: '災難', ending: '結局', city: '城市', migration: '遷徙', polity: '政體', era: '時代' }[t] || t;
  }

  // ---------- 地圖 ----------
  function mapSvg() {
    const w = W();
    const ids = U.ids(w);
    const X = (lon) => lon + 180, Y = (lat) => 90 - lat;
    // 全世界劇本有南半球與太平洋的國家：改成全球視野；歐洲國家很密，可以放大歐洲看
    const wide = ids.some((id) => w.countries[id].lat < 0 || w.countries[id].lon > 160 || w.countries[id].lon < -140);
    const zoom = wide && S.mapZoom === 'europe';
    const VB = zoom ? [162, 18, 78, 39] : wide ? [0, 15, 360, 135] : [40, 10, 300, 80];
    const k = VB[2] / (wide ? 360 : 300);              // 放大時圓圈、文字、線條一起縮小，畫面上看起來一樣大
    const R = (c) => Math.max(2.8, Math.sqrt(U.popTotal(c)) * 0.5) * k;
    let lines = '';
    for (const key of Object.keys(w.relations)) {
      const r = w.relations[key];
      const A = w.countries[r.a], B = w.countries[r.b];
      if (!A.alive || !B.alive) continue;
      if (r.war) lines += `<line x1="${X(A.lon)}" y1="${Y(A.lat)}" x2="${X(B.lon)}" y2="${Y(B.lat)}" stroke="#f87171" stroke-width="${0.9 * k}" stroke-dasharray="${2 * k} ${1.2 * k}"/>`;
      else if (r.alliance) lines += `<line x1="${X(A.lon)}" y1="${Y(A.lat)}" x2="${X(B.lon)}" y2="${Y(B.lat)}" stroke="#38bdf8" stroke-width="${0.5 * k}" opacity=".7"/>`;
    }
    let grid = '';
    const gs = zoom ? 10 : 30;
    for (let lon = -180; lon <= 180; lon += gs) grid += `<line x1="${X(lon)}" y1="0" x2="${X(lon)}" y2="180" stroke="#1e3463" stroke-width="${0.2 * k}"/>`;
    for (let lat = -60; lat <= 80; lat += (zoom ? 10 : 20)) grid += `<line x1="0" y1="${Y(lat)}" x2="360" y2="${Y(lat)}" stroke="#1e3463" stroke-width="${0.2 * k}"/>`;
    // 國名標籤避免重疊：觀察國優先、其次人口多的；依序試放在圓圈下、上、右、左。
    // 會蓋到別的國名、壓到別國的圓圈或超出地圖邊界就不顯示（圓圈仍在，點一下就看得到國名；歐洲可以放大看）。寬度用玩家語言的國名估算。
    const tx = (s2) => (WS.I18n && WS.I18n.tx ? WS.I18n.tx(s2) : s2);
    const fs = 5 * k;
    const textW = (t) => [...t].reduce((a, ch) => a + (/[\u2E80-\uFFFF]/.test(ch) ? 5 : 3.1), 0.8) * k;
    const placed = [];
    const hit = (b) => placed.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
    const inside = (b) => b.x >= VB[0] && b.x + b.w <= VB[0] + VB[2] && b.y >= VB[1] && b.y + b.h <= VB[1] + VB[3];
    const label = {};
    const order = ids.slice().sort((a, b) => ((b === w.focus) - (a === w.focus)) || U.popTotal(w.countries[b]) - U.popTotal(w.countries[a]));
    for (const id of order) {
      const c = w.countries[id];
      const r = R(c);
      const cx = X(c.lon), cy = Y(c.lat), tw = textW(tx(c.name)), th = fs, g = 1.2 * k;
      const tries = [
        { x: cx, y: cy + r + 0.9 * fs, anchor: 'middle', box: { x: cx - tw / 2, y: cy + r + 0.12 * fs, w: tw, h: th } },
        { x: cx, y: cy - r - g, anchor: 'middle', box: { x: cx - tw / 2, y: cy - r - g - 0.84 * fs, w: tw, h: th } },
        { x: cx + r + g, y: cy + 0.36 * fs, anchor: 'start', box: { x: cx + r + g, y: cy - 0.48 * fs, w: tw, h: th } },
        { x: cx - r - g, y: cy + 0.36 * fs, anchor: 'end', box: { x: cx - r - g - tw, y: cy - 0.48 * fs, w: tw, h: th } }
      ];
      // 不壓在別國的圓圈上（容許碰到邊緣），免得國名看起來像是旁邊那一國的
      const onOther = (b) => ids.some((o) => {
        if (o === id) return false;
        const C = w.countries[o], ox = X(C.lon), oy = Y(C.lat), rr = R(C) * 0.7;
        const dx = ox - U.clamp(ox, b.x, b.x + b.w), dy = oy - U.clamp(oy, b.y, b.y + b.h);
        return dx * dx + dy * dy < rr * rr;
      });
      const ok = tries.find((t) => inside(t.box) && !hit(t.box) && !onOther(t.box));
      if (ok) { placed.push(ok.box); label[id] = ok; }
    }
    const nodes = ids.map((id) => {
      const c = w.countries[id];
      const r = R(c);
      const focus = id === w.focus && w.mode === 'country';
      return `<g data-act="open-country" data-id="${id}" style="cursor:pointer"><title>${esc(c.name)}</title>
        <circle cx="${X(c.lon)}" cy="${Y(c.lat)}" r="${r}" fill="${c.color}" fill-opacity=".35" stroke="${focus ? '#fbbf24' : c.color}" stroke-width="${(focus ? 1 : 0.5) * k}"/>
        ${c.flags.atWar ? `<circle cx="${X(c.lon)}" cy="${Y(c.lat)}" r="${r + 1.5 * k}" fill="none" stroke="#f87171" stroke-width="${0.4 * k}"/>` : ''}
        </g>`;
    }).join('') + ids.filter((id) => label[id]).map((id) => {
      // 國名放在所有圓圈之後畫，才不會被別國的圓圈蓋住
      const L = label[id];
      return `<text data-act="open-country" data-id="${id}" style="cursor:pointer;stroke-width:${1.1 * k}px" x="${L.x}" y="${L.y}" font-size="${fs}" fill="#e6ecff" text-anchor="${L.anchor}">${esc(w.countries[id].name)}</text>`;
    }).join('');
    const hidden = ids.length - Object.keys(label).length;
    const zbtn = wide ? `<button class="btn small" data-act="map-zoom" data-v="${zoom ? '' : 'europe'}">${zoom ? '看全世界' : '🔍 放大歐洲'}</button>` : '';
    return `<svg class="map" viewBox="${VB.join(' ')}" role="img" aria-label="世界示意地圖">${grid}${lines}${nodes}</svg>
      <div class="legend" style="margin-top:6px"><span><i style="background:#38bdf8"></i>同盟</span><span><i style="background:#f87171"></i>戰爭</span><span>圓圈大小＝人口・示意地圖，第一版以國家為單位</span>${hidden ? `<span>${hidden} 個國名太擠先隱藏，點圓圈可查看</span>` : ''}${zbtn}</div>`;
  }


  // ---------- 觀測窗：地球＋儀表讀數 ----------
  function observatory() {
    const w = W();
    const ids = U.ids(w);
    const toggle = `<div class="seg mini">${[['globe', '球體'], ['flat', '平面']].map(([v, l]) => `<button data-act="map-view" data-v="${v}" class="${S.mapView === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (S.mapView === 'flat' || !globe) return `<div class="card"><h3>世界地圖 ${toggle}</h3>${mapSvg()}</div>`;
    const pop = ids.reduce((s, id) => s + U.popTotal(w.countries[id]), 0);
    const gdp = ids.reduce((s, id) => s + w.countries[id].econ.gdp, 0);
    const wars = w.wars.filter((x) => !x.ended).length;
    const allies = Object.values(w.relations).filter((r) => r.alliance && !r.war).length;
    return `<div class="card observatory"><h3>行星觀測窗 ${toggle}</h3>
      <div class="globe-slot" id="globe-slot">
        <div class="hud-tag tl"><i class="live">即時</i><b>${w.year}</b>.${String(w.month).padStart(2, '0')}<span>世界線：${esc(w.branch.name)}</span></div>
        <div class="hud-tag tr">人口<b class="num">${fPop(pop)}</b></div>
        <div class="hud-tag bl">戰爭<b class="num ${wars ? 'bad' : ''}">${wars}</b>同盟<b class="num">${allies}</b></div>
        <div class="hud-tag br">GDP<b class="num">${fGdp(gdp)}</b></div>
      </div>
      <div class="legend"><span><i style="background:#38bdf8"></i>同盟</span><span><i style="background:#f87171"></i>戰爭</span><span><i style="background:#34d399"></i>貿易</span><span><i style="background:#ffd68c"></i>夜晚城市燈光</span><span><i style="background:#c48c3c"></i>饑荒</span></div><p class="dim" style="margin:4px 0 0">拖曳可轉動・點國家看當地生活・點地球上的標籤看原因，戰區標籤可開戰場畫面</p></div>`;
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
      head = (w.origin && w.origin.fromAncient ? `<div class="card"><h3>承接遠古</h3><p class="dim">這個世界從西元前 10,000 年的遠古世界線（種子「${esc(w.origin.ancientSeed)}」）演進而來，${w.origin.year} 年轉入近代引擎。當時的 ${w.origin.countries.length} 個政治實體成為近代國家，最大的是${w.origin.countries.slice().sort((a, b) => b.pop - a.pop).slice(0, 5).map((c) => esc(c.name)).join('、')}。</p></div>` : '') + `<div class="card"><h3>全球文明狀態</h3><div class="kpis">
        ${kpi('世界人口（模擬範圍）', fPop(pop), n > 1 ? sg(((sw.pop[n - 1] - sw.pop[n - 2]) / sw.pop[n - 2]) * 100) + '%／年' : null)}
        ${kpi('世界 GDP' + (w.rules.currency === false ? '（替代估值）' : ''), fGdp(gdp), n > 1 ? sg(((sw.gdp[n - 1] - sw.gdp[n - 2]) / sw.gdp[n - 2]) * 100) + '%／年' : null)}
        ${kpi('政治實體', ids.length + ' 個', null)}
        ${kpi('戰爭／國際組織', wars + '／' + orgs, null)}
      </div>
      <div class="row" style="margin-top:10px">${Object.keys(w.rules).map((k) => `<span class="tag ${w.rules[k] !== RULE_DEFAULTS[k] ? 'gold' : ''}">${esc(WS.Data.rules[k].name)}：${esc(WS.Rules.describe(k, w.rules[k]))}</span>`).join('')}</div></div>`;
    }
    // 全球模式只列重要事件（領導人更替、各國政策等收進年度摘要）
    const evs = w.events.filter((e) => e.level >= 3 || (w.mode === 'country' && e.level >= 2 && e.countries.includes(w.focus))).slice(-12).reverse();
    const chron = w.chronicle.slice(-3).reverse();
    return observatory() + head + `
      ${endingBanner()}
      <div class="grid g2">${headlinesCard()}${divineCard()}</div>
      ${summaryCard()}
      ${progressCard()}
      ${futureCard()}
      <div class="grid g2">
        <div class="card"><h3>最新事件 <button class="link" data-act="tab" data-v="history">全部</button></h3>${evs.some((e) => WS.WhatIf.options(w, e).length) ? '<p class="dim wi-hint">按事件旁的 <b class="gold">如果？</b>，看看改寫這件事後，世界會變成怎樣。</p>' : ''}<ul class="events">${evs.map(eventItem).join('') || '<li class="dim">尚無事件，推進時間開始模擬。</li>'}</ul></div>
        <div class="card"><h3>歷史紀錄</h3>${chron.length ? chron.map((c) => `<p class="chron"><b>${c.year} 年</b>\n${esc(c.text)}</p>`).join('') : '<p class="dim">每推進一年，模擬器會根據實際模擬數據寫下一段歷史摘要。</p>'}</div>
      </div>`;
  }

  // ======================= 國家 =======================
  function countryTab() {
    const w = W();
    const ids = U.ids(w);
    const id = cView(w);
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
      ${countryPicker(w, ids, id)}
      ${lifeCard()}
      <div class="card"><h3><span>${esc(c.name)}・${esc(U.regime(w, c.regime).name)}</span><span class="tag">成立 ${c.founded}${c.parent ? '・分裂自' + esc(w.countries[c.parent].name) : ''}${c.independence ? '・' + c.independence + ' 年脫離' + esc(w.countries[c.formerOverlord].name) + '獨立' : ''}</span></h3>
        ${c.overlord ? `<p class="dim">${{ dominion: '自治領', protectorate: '保護國', colony: '殖民地' }[c.subjectType] || '屬地'}：外交與宣戰由宗主國「${esc(w.countries[c.overlord].name)}」決定，宗主國開戰時一起參戰。條件成熟時可能獨立。</p>` : ''}
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
    const allIds = Object.keys(w.series.c).sort();
    const ids = chartIds(w, allIds);
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
        <div class="row"><button class="btn small" data-act="branch-now">從現在建立分支</button>${S.whatif ? `<button class="btn small gold" data-act="whatif-show">上一次的「如果」：${esc(S.whatif.res.report.label)}</button>` : ''}</div>
        <p class="dim">想問「如果某件事沒發生會怎樣」？在事件時間線按 <b class="gold">如果？</b>，系統會從事件之前重跑一條平行世界並排比較。</p>
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
      ${countryPicker(w, ids, id)}
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
    const sc = scope === undefined || scope === 'undefined' ? 'last' : scope === 'current' || scope === 'last' || /^y\d+$/.test(scope) ? scope : Number(scope);
    const r = WS.Explain.metric(w, cid, metric, sc);
    const max = Math.max(1e-9, ...r.factors.map((f) => Math.abs(f.v)));
    const dec = isAnc() ? (['population', 'urban', 'store', 'aid'].includes(metric) ? 3 : 1) : ['population', 'food', 'research', 'energy'].includes(metric) ? 2 : 1;
    openModal(`<h2>為什麼會這樣？${esc(nameOf(w, cid))}・${esc(r.name)}</h2>
      <p class="dim">${esc(r.label)}合計變動 <b class="${cls(r.total)}">${sg(r.total, dec)}</b>。點擊因素可查看細項或追蹤更深層原因。</p>
      ${seg2('why-scope', String(sc), isAnc() ? [['last', '上一期'], ['10', '近十期'], ['30', '近三十期']] : [['last', '上一年'], ['current', '今年至今'], ['10', '近十年']]).replace(/data-act="why-scope"/g, `data-act="why" data-c="${cid}" data-m="${metric}"`).replace(/data-v=/g, 'data-s=')}
      <div style="margin-top:12px">${r.factors.map((f) => `<div class="factor"><details><summary class="factor-row" style="list-style:none">
          <span>${esc(f.name)}<div class="fbar"><i class="${f.v >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(f.v) / max) * 50}%"></i></div></span>
          <span class="num ${cls(f.v)}" style="text-align:right">${sg(f.v, dec)}</span></summary>
          <div class="subs">${f.sub.map(([s, v]) => `<div>${esc(s)}：<span class="num ${cls(v)}">${sg(v, dec)}</span></div>`).join('')}
          ${f.link ? `<button class="link" data-act="why" data-c="${cid}" data-m="${f.link}" data-s="${sc}">繼續追蹤：${esc((isAnc() ? WS.Explain.ANCIENT_METRICS : WS.Explain.METRIC_NAMES)[f.link])}的原因 ›</button>` : ''}</div></details></div>`).join('') || '<p class="dim">這段期間沒有記錄到變化。</p>'}</div>`);
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
      <p class="dim">${isAnc() ? esc(yl(e.y)) : `${e.y} 年 ${e.m} 月`}・${typeLabel(e.type)}${e.countries.length ? '・相關：' + e.countries.map((c) => esc(nameOf(w, c))).join('、') : ''}</p>
      ${e.ref ? `<p class="dim">史實參考：${esc(e.ref)}（只供對照，引擎不會照著發生）</p>` : ''}
      ${mediaHtml(e)}
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
      ${e.trigger ? `<p><span class="tag gold">觸發</span> ${esc(e.trigger)}</p>` : ''}
      ${e.causes.length ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">${e.type === 'catastrophe' ? '事件觸發：為什麼會發生' : '為什麼會發生'}</h3><ul class="list-plain">${e.causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${e.effects.length ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">${e.type === 'catastrophe' ? '發生當下造成的變化（引擎計算）' : '造成的影響'}</h3><ul class="list-plain">${e.effects.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${e.type === 'catastrophe' ? catImpactHtml(e) : ''}
      ${e.decision ? `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">決策過程</h3><p class="dim">候選方案：${e.decision.alternatives.map((a) => esc(a[0]) + ' ' + a[1]).join('、') || '無'}（選中方案評分 ${e.decision.score}）</p>` : ''}
      ${parent ? `<p>前因事件：<button class="link" data-act="event" data-id="${parent.id}">${esc(parent.title)}</button></p>` : ''}
      ${fol.length ? `<p>後續事件：${fol.map((f) => `<button class="link" data-act="event" data-id="${f.id}">${esc(f.title)}</button>`).join('、')}</p>` : ''}
      ${whatifOptions(e)}`);
    mountMedia();
  }

  // 災難到目前為止的實際影響（含之後每年累計的死亡），讓玩家分辨「事件觸發」與「造成的數值變化」
  function catImpactHtml(e) {
    const F = W().future;
    const c = F && F.catastrophes.find((x) => x.eventId === e.id);
    if (!c) return '';
    const im = c.impact;
    if (!im) return `<p class="dim">直接死亡：${c.deaths ? fPeople2(c.deaths) : '0'}（這是舊版紀錄，沒有之後的影響資料）</p>`;
    const sev = c.sev != null ? c.sev : FUT().severity(W(), c);
    const share = im.popBefore ? ((c.deaths + (im.later || 0)) / im.popBefore) * 100 : 0;
    return `<h3 style="color:var(--blue);font-size:14px;margin-top:10px">到目前為止的實際影響 <span class="sev s${sev}">${FUT().SEVERITY[sev]}</span></h3>
      <ul class="list-plain">
        <li>直接死亡：${c.deaths ? fPeople2(c.deaths) : '0（發生當下沒有直接傷亡）'}</li>
        <li>之後的死亡：${im.later > 0.001 ? fPeople2(im.later) : '0'}${c.kind === 'climate' ? '（額外升溫在之後每年多造成的氣候災害與饑荒死亡，依公式拆分）' : c.kind === 'nuclear' || c.kind === 'asteroid' ? '（寒冬期間每年的額外死亡）' : ''}</li>
        <li>合計約占災難前世界人口 ${share.toFixed(share < 1 ? 2 : 1)}%</li>
        ${im.warming ? `<li>額外升溫：+${im.warming.toFixed(2)}°C（無法逆轉）</li>` : ''}
        ${im.harvestBefore != null && Math.abs(im.harvestBefore - im.harvestAfter) > 0.001 ? `<li>全球平均收成：${(im.harvestBefore * 100).toFixed(0)}% → ${(im.harvestAfter * 100).toFixed(0)}%</li>` : ''}
      </ul>`;
  }
  // ======================= 如果（平行世界） =======================
  function whatifOptions(e) {
    const av = engine.whatIfAvailable(e.id);
    if (!av.opts.length) return isAnc() ? '<p class="dim" style="margin-top:12px">這類事件目前不能用「如果？」改寫。可以改寫的有：自行發明、政體形成、出兵、政體瓦解、瘟疫。</p>' : '<p class="dim" style="margin-top:12px">想看其他可能？到「歷史」頁回溯到事件之前建立分支，改變政策或世界規則後，用歷史比較對照結果。</p>';
    if (!av.ok) return `<p class="dim" style="margin-top:12px">「如果」平行世界：${esc(av.reason)}。</p>`;
    const w = W();
    return `<div class="wi-box"><h3>如果……？</h3>
      <p class="dim">系統會回到${isAnc() ? esc(yl(e.y)) : ` ${e.y} 年 ${e.m} 月`}之前，用同一個種子重跑到現在（${isAnc() ? esc(yl(w.year)) : `${w.year} 年 ${w.month} 月`}），只改寫這一件事，再把兩個世界並排比較。目前的世界不會被改動。</p>
      <div class="row">${av.opts.map((o) => `<button class="btn gold" data-act="whatif-run" data-id="${o.target.eventId}" data-k="${o.key}">${esc(o.label)}</button>`).join('')}</div></div>`;
  }
  function whatifModal(id) {
    const w = W();
    const e = w.events.find((x) => x.id === id);
    if (!e) return toast('這個事件已超出保存範圍');
    openModal(`<h2>${esc(e.title)}</h2><p class="dim">${isAnc() ? esc(yl(e.y)) : `${e.y} 年 ${e.m} 月`}・${typeLabel(e.type)}</p>${whatifOptions(e)}`);
  }
  function whatifRun(id, key) {
    stopAuto();
    openModal('<h2>正在推演平行世界…</h2><p class="dim">從事件之前的快照，用同一個種子逐月重算。</p>');
    setTimeout(() => {
      const parentName = W().branch.name;
      const res = engine.whatIf(id, key);
      if (!res.ok) { openModal(`<h2>無法建立平行世界</h2><p>${esc(res.reason)}</p>`); return; }
      S.whatif = { res, parentName, parentWorldId: W().world_id, parentTick: W().tick };
      whatifReport();
    }, 30);
  }

  function whatifReport() {
    if (isAnc()) return ancientWhatifReport();
    const { res, parentName } = S.whatif;
    const R = res.report, w = W(), alt = res.world;
    const pct = (a, b) => (a ? sg(((b - a) / a) * 100, 0) + '%' : '—');
    // 差值用畫面上顯示的（四捨五入後的）數字計算，玩家看到的兩個數字相減就是差值
    const diffCell = (a, b, f, rel, neutral) => `<td class="num">${f(a)}</td><td class="num">${f(b)}</td><td class="num ${neutral ? '' : cls(b - a)}">${rel ? pct(a, b) : sg(Math.round(b) - Math.round(a), 0)}</td>`;
    const fc = R.rows.find((r) => r.id === R.focus);
    const o = fc && fc.orig, a = fc && fc.alt;
    const focusRows = o && a ? `
      <tr><th colspan="4" style="text-align:left;color:var(--gold)">${esc(fc.name)}</th></tr>
      <tr><td>人口</td>${diffCell(o.pop, a.pop, fPop, true)}</tr>
      <tr><td>GDP</td>${diffCell(o.gdp, a.gdp, fGdp, true)}</tr>
      <tr><td>政治穩定</td>${diffCell(o.stability, a.stability, (v) => v.toFixed(0))}</tr>
      <tr><td>制度</td><td>${esc(o.regime)}</td><td class="${o.regime !== a.regime ? 'gold' : ''}">${esc(a.regime)}</td><td></td></tr>
      <tr><td>領導人</td><td>${esc(o.leader)}</td><td>${esc(a.leader)}</td><td></td></tr>` : '';
    const Wo = R.world.orig, Wa = R.world.alt;
    const metric = S.wiMetric;
    const cid = R.focus;
    const chartHtml = cid && w.series.c[cid] && alt.series.c[cid] ? chart(w.series.labels, [
      { name: '原世界', color: w.countries[cid].color, bold: true, data: w.series.c[cid][metric] },
      { name: '平行世界', color: '#fbbf24', dash: true, bold: true, data: alignSeries(w.series.labels, alt.series.labels, alt.series.c[cid][metric]) }
    ], { h: 180, label: WS.History.LABELS[metric] }) : '';
    const others = R.rows.filter((r) => r.id !== R.focus && r.score > 0.02).slice(0, 5);
    const reason = R.reasons[cid];
    const units = { gdp: (v) => sg(v, 0), population: (v) => sg(v, 1), stability: (v) => sg(v, 0) };
    const why = reason ? ['gdp', 'population', 'stability'].filter((m) => reason[m].length).map((m) =>
      `<li><b>${esc(WS.Explain.METRIC_NAMES[m])}</b>：${reason[m].map((f) => `${esc(f.factor)}（原世界 ${units[m](f.orig)}／平行世界 ${units[m](f.alt)}）`).join('、')}</li>`).join('') : '';
    const chain = R.chain.map((c, i) => `<li class="wi-step ${c.kind}">
        <div class="when">${c.y}.${String(c.m).padStart(2, '0')}・<span>${{ start: '分岔點', gone: '原世界有，平行世界沒有', new: '只在平行世界發生' }[c.kind]}</span></div>
        <b>${esc(c.title)}</b>
        ${c.why && c.why.length ? `<div class="dim">${c.kind === 'gone' ? '原世界的原因' : '原因'}：${c.why.map(esc).join('；')}</div>` : ''}
        ${c.compare && c.compare.length ? `<div class="dim">事後年度紀錄：${c.compare.map(esc).join('；')}</div>` : ''}
      </li>${i < R.chain.length - 1 ? '<li class="wi-arrow" aria-hidden="true">↓</li>' : ''}`).join('');
    const evList = (list) => list.slice(0, 30).map((e) => `<li><span class="dim">${e.y}.${String(e.m).padStart(2, '0')}</span> ${esc(e.title)}</li>`).join('') || '<li class="dim">沒有</li>';
    openModal(`<h2>平行世界：${esc(R.label)}</h2>
      <p class="dim">分岔於 ${R.y} 年 ${R.m} 月。${R.years > 1 ? `從 ${esc(R.from)} 用同一個種子重跑 ${R.years} 年到 ${R.now.y} 年 ${R.now.m} 月，只有這一件事不同，其他全部由引擎計算。` : `從 ${esc(R.from)} 用同一個種子重跑到 ${R.now.y} 年 ${R.now.m} 月（不到兩年），只有這一件事不同，其他全部由引擎計算。`}</p>
      ${R.applied ? '' : '<p class="bad">注意：重跑時沒有遇到這個事件，兩個世界沒有分岔。</p>'}
      ${wiSummaryHtml(R, false)}
      <div class="table-wrap"><table class="wi-table">
        <tr><th></th><th>原世界<br><small>${esc(parentName)}</small></th><th>平行世界</th><th>差距</th></tr>
        ${focusRows}
        <tr><th colspan="4" style="text-align:left;color:var(--gold)">全世界</th></tr>
        <tr><td>人口</td>${diffCell(Wo.pop, Wa.pop, fPop, true)}</tr>
        <tr><td>GDP</td>${diffCell(Wo.gdp, Wa.gdp, fGdp, true)}</tr>
        <tr><td>國家數</td>${diffCell(Wo.countries, Wa.countries, (v) => v + ' 個', false, true)}</tr>
        <tr><td>分岔後爆發的戰爭</td>${diffCell(Wo.wars, Wa.wars, (v) => v + ' 場', false, true)}</tr>
      </table></div>
      ${chartHtml ? `<div style="margin-top:10px">${seg2('wi-metric', metric, [['gdp', 'GDP'], ['pop', '人口'], ['stability', '穩定'], ['legitimacy', '合法性']])}${chartHtml}</div>` : ''}
      <h3 class="wi-h">蝴蝶效應：差異怎麼擴散</h3>
      <ul class="events wi-chain">${chain}</ul>
      ${R.onlyOrig.length + R.onlyAlt.length > R.chain.length - 1 ? '<p class="dim">只列出最早的幾步，完整清單在下方。</p>' : ''}
      ${why ? `<h3 class="wi-h">為什麼${esc(fc ? fc.name : '')}差這麼多（因果帳，分岔後累計）</h3><ul class="list-plain">${why}</ul>` : ''}
      ${others.length ? `<h3 class="wi-h">其他國家的差異</h3><div class="table-wrap"><table><tr><th>國家</th><th>GDP</th><th>人口</th><th>制度（原→平行）</th></tr>${others.map((r) => r.orig && r.alt
        ? `<tr><td>${esc(r.name)}</td><td class="num ${cls(r.alt.gdp - r.orig.gdp)}">${pct(r.orig.gdp, r.alt.gdp)}</td><td class="num ${cls(r.alt.pop - r.orig.pop)}">${pct(r.orig.pop, r.alt.pop)}</td><td>${r.orig.regime === r.alt.regime ? esc(r.orig.regime) : `<span class="gold">${esc(r.orig.regime)} → ${esc(r.alt.regime)}</span>`}</td></tr>`
        : `<tr><td>${esc(r.name)}</td><td colspan="3" class="gold">${r.alt ? '只存在於平行世界' : '只存在於原世界'}</td></tr>`).join('')}</table></div>` : ''}
      <details class="qa"><summary>只在原世界發生（${R.onlyOrig.length}）</summary><ul class="list-plain">${evList(R.onlyOrig)}</ul></details>
      <details class="qa"><summary>只在平行世界發生（${R.onlyAlt.length}）</summary><ul class="list-plain">${evList(R.onlyAlt)}</ul></details>
      ${R.failed.length ? `<p class="dim">你原本的 ${R.failed.length} 項決策在平行世界無法執行：${R.failed.map((f) => `${f.y}.${f.m} ${esc(f.text)}（${esc(f.reason)}）`).join('；')}</p>` : ''}
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-act="whatif-enter">進入平行世界</button>
        <button class="btn" data-act="whatif-chart">在歷史圖表對照</button>
        <button class="btn" data-act="close-modal">留在原世界</button>
      </div>`);
  }
  // 「如果？」重點摘要：改寫了什麼、差異何時出現、最後造成什麼結果（內容由 WhatIf.summary 從比較結果整理）
  function wiSummaryHtml(R, anc) {
    const X = R.summary;
    if (!X) return '';
    const when = (y, m) => (anc ? yl(y) : `${y} 年${m ? ' ' + m + ' 月' : ''}`);
    const side = { orig: '原世界有、平行世界沒有', new: '只在平行世界發生', alt: '只在平行世界發生' };
    // 每一段都放在自己的 <span> 裡、寫成完整的句子：畫面翻譯是一段一段翻的，拼在一起的半句會翻不出來
    const after = (n) => (!n ? '分岔當年' : n === 1 ? '分岔後隔年' : `分岔後 ${n.toLocaleString()} 年`);
    const first = X.first
      ? `<span>${after(X.first.after)}（${esc(when(X.first.y, X.first.m))}），第一個不同的重大事件是：</span>${X.first.side === 'orig' && X.first.eventId ? `<button class="link" data-act="event" data-id="${X.first.eventId}">「${esc(X.first.title)}」</button>` : `<span>「${esc(X.first.title)}」</span>`}<span>（${side[X.first.side] || ''}）</span>`
      : '<span>沒有出現只在其中一個世界發生的重大事件</span>';
    const dv = X.diverge ? `<span>；從 ${X.diverge.y} 年起（${after(X.diverge.after)}），${X.diverge.metric}相差超過 1%</span>` : '';
    return `<div class="wi-summary"><h3>重點摘要</h3><ol>
      <li><b>改寫了什麼</b>：${esc(X.changed)}</li>
      <li><b>差異何時出現</b>：${first}${dv}</li>
      <li><b>最後造成什麼結果</b>：<ul>${X.result.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></li></ol>
      <p class="dim" style="margin:6px 0 0">下面是完整的數字比較與差異擴散的過程。</p></div>`;
  }
  function whatifValid() {
    const st = S.whatif;
    if (st && st.parentWorldId === W().world_id && st.parentTick === W().tick) return true;
    toast('世界已經改變，請重新按一次「如果？」');
    return false;
  }

  // 全球模式的介入方式：對事件當事國用神之手（只改條件），或按事件旁的「如果？」看另一條世界線
  function eventDivineHtml(evs) {
    const w = W();
    const cid = evs.flatMap((e) => e.countries || []).find((id) => w.countries[id] && w.countries[id].alive);
    const hasWhatif = evs.some((e) => WS.WhatIf.options(w, e).length > 0);
    const tip = hasWhatif ? '<p class="dim" style="margin:8px 0 0">想看「如果這件事沒發生」？按事件旁的「如果？」。</p>' : '';
    if (!cid) return tip;
    const c = w.countries[cid];
    const D = w.divine || { energy: 0 };
    return `<h3 style="color:var(--blue);font-size:14px;margin:12px 0 6px">用神之手介入${esc(c.name)}（神力 ${Math.floor(D.energy)}）</h3>
      <div class="divine-btns">${Object.entries(WS.Divine.KINDS).map(([k, d]) => {
        const cost = WS.Divine.cost(w, k);
        return `<button class="btn small" data-act="divine-open" data-v="${k}" data-c="${cid}" ${D.energy < cost ? 'disabled' : ''}><b>${d.icon}</b> ${esc(d.name)}<small class="num">${cost}</small></button>`;
      }).join('')}</div>${tip}`;
  }
  function decisionModal(evs) {
    const w = W();
    const focus = w.mode === 'country' ? w.countries[w.focus] : null;
    const ev = focus && focus.alive ? engine.evaluate(focus.id) : null;
    const pic = evs.find((e) => sceneFor(e));
    const crit = evs.some((e) => WS.Events.isCritical(w, e));
    openModal(`<h2>${crit ? '重大危機' : '重要事件'}：要介入嗎？</h2>
      ${S.resumeAuto ? '<p class="dim" style="margin:0 0 8px">自動播放已暫停。選好後關掉這個視窗，世界會自動繼續運轉。</p>' : ''}
      ${pic ? mediaHtml(pic) : ''}
      <ul class="events">${evs.map(eventItem).join('')}</ul>
      ${ev ? `<h3 style="color:var(--blue);font-size:14px;margin:12px 0 6px">${esc(focus.name)}可採取的政策（系統評分）</h3>
        ${ev.list.filter((p) => p.feasible === true).slice(0, 5).map((p) => `<div class="policy"><div>${esc(p.name)}<small>${esc(WS.Policies.defs[p.id].desc)}</small></div><button class="btn small" data-act="policy" data-c="${focus.id}" data-p="${p.id}" data-close="1">執行</button></div>`).join('')}`
        : eventDivineHtml(evs)}
      <div class="row" style="margin-top:14px"><button class="btn primary" data-act="close-modal">交由系統處理，繼續</button>${S.resumeAuto ? '<button class="btn" data-act="stay-paused">先停在這裡</button>' : ''}</div>
      <div class="pause-pick">${pauseSetting(true)}</div>`);
    mountMedia();
  }
  // 事件介入方式設定（系統頁與事件視窗共用）
  function pauseSetting(compact) {
    const w = W();
    const M = WS.Events.PAUSE_MODES;
    const note = w.intervention === 'none' ? '目前「玩家介入」設為「不介入」，世界不會暫停；要暫停請把玩家介入改成「偶爾決策」。' : M[S.pauseMode].desc;
    return `<div class="field"><label>${compact ? '以後遇到事件' : '事件介入方式'}</label>${seg2('pause-mode', S.pauseMode, Object.entries(M).map(([k, d]) => [k, d.name]))}</div>
      <p class="dim" style="margin:4px 0 0">${esc(note)}${compact ? '（之後可以在「系統」頁更改）' : ''}</p>`;
  }

  // ======================= 系統 =======================
  // ======================= 世界頭條 =======================
  // 頭條只由引擎紀錄產生（systems/headline-system.js），這裡只負責顯示，並連回事件或因果帳
  const clean = (s) => String(s).replace(/^[✔✘]\s*/, '');
  function headlineItem(h) {
    const act = h.eventId ? `data-act="event" data-id="${h.eventId}"` : `data-act="why" data-c="${h.cid}" data-m="${h.metric}" data-s="y${h.year}"`;
    return `<article class="headline">
      <div class="hl-k"><span class="tag ${h.kicker === '戰爭' || h.kicker === '動盪' ? 'red' : h.kicker === '神之手' ? 'violet' : 'gold'}">${esc(h.kicker)}</span><span class="dim">${h.year} 年</span></div>
      <div class="hl-t">${esc(h.title)}</div>
      ${h.lead ? `<p class="hl-l">${esc(h.lead)}</p>` : ''}
      ${h.why && h.why.length ? `<p class="hl-w">紀錄中的原因：${h.why.map((x) => esc(clean(x))).join('；')}</p>` : ''}
      <button class="link" ${act}>追查原因 ›</button></article>`;
  }
  function headlinesCard() {
    const w = W();
    const L = WS.Headlines.latest(w);
    return `<div class="card"><h3>世界頭條${L.year ? `<span class="num">・${L.year}</span>` : ''} ${(w.headlines || []).length > L.items.length ? '<button class="link" data-act="headlines-all">往年頭條</button>' : ''}</h3>
      ${L.items.length ? `<div class="headlines">${L.items.map(headlineItem).join('')}</div>` : '<p class="dim">世界出現重大變化時（戰爭、革命、災難、人口或經濟劇變……），這裡會刊出當年影響最大的最多 3 則頭條，每一則都能點開追查原因；其餘的事收進下方的年度摘要。</p>'}</div>`;
  }
  // ---------- 年度摘要：沒有上頭條的事件依類別收在這裡（每件都能點開追查原因） ----------
  function summaryBody(Y, open) {
    if (!Y.total && !Y.headlines.length) return '<p class="dim">這一年沒有記錄到值得注意的事件。</p>';
    const top = Y.headlines.length ? `<p class="dim" style="margin:0 0 6px">頭條 ${Y.headlines.length} 則：${Y.headlines.map((h) => `<button class="link" ${h.eventId ? `data-act="event" data-id="${h.eventId}"` : `data-act="why" data-c="${h.cid}" data-m="${h.metric}" data-s="y${h.year}"`}>${esc(h.title)}</button>`).join('、')}</p>` : '';
    return top + `<div class="sum-groups">${Y.groups.map((g) => {
      const names = [...new Set(g.items.flatMap((e) => e.countries).map((c) => nameOf(W(), c)))];
      const who = names.length ? '：' + names.slice(0, 4).map(esc).join('、') + (names.length > 4 ? ` 等 ${names.length} 國` : '') : '';
      return `<details class="qa sum-g" ${open && g.items.length <= 3 ? 'open' : ''}><summary><b>${g.icon}</b> ${esc(g.name)} <span class="num gold">${g.items.length}</span><span class="dim">${who}</span></summary>
        <ul class="events">${g.items.slice(-30).reverse().map(eventItem).join('')}</ul>${g.items.length > 30 ? `<p class="dim">只列出最後 30 件，其餘在「歷史」頁。</p>` : ''}</details>`;
    }).join('')}</div>`;
  }
  function summaryCard() {
    const w = W();
    if (w.year <= w.startYear) return '';
    const Y = WS.Headlines.summary(w, w.year - 1);
    return `<div class="card"><h3>年度摘要・${Y.year} 年 <button class="link" data-act="summary-all" data-v="${Y.year}">往年摘要</button></h3>
      <p class="dim" style="margin:0 0 8px">頭條以外的 ${Y.total} 件事依類別收在這裡；點任何一件可以看原因與後續。自動播放只會在${esc(WS.Events.PAUSE_MODES[S.pauseMode].name.replace(/^只暫停/, '').replace('所有事件都詢問', '重要事件').replace('全部交由系統', '世界結局'))}時停下來。</p>
      ${summaryBody(Y, false)}</div>`;
  }
  function summaryModal(year) {
    const w = W();
    const y = Math.max(w.startYear, Math.min(w.year - 1, year));
    const Y = WS.Headlines.summary(w, y);
    const min = w.events.length ? Math.max(w.startYear, w.events[0].y) : w.startYear;
    openModal(`<h2>年度摘要・${y} 年</h2>
      <div class="row" style="margin-bottom:8px"><button class="btn small" data-act="summary-all" data-v="${y - 1}" ${y - 1 < min ? 'disabled' : ''}>‹ ${y - 1}</button><button class="btn small" data-act="summary-all" data-v="${y + 1}" ${y + 1 > w.year - 1 ? 'disabled' : ''}>${y + 1} ›</button></div>
      <p class="dim">這一年頭條以外的 ${Y.total} 件事。內容全部來自模擬紀錄。</p>${summaryBody(Y, true)}`);
  }
  function headlinesModal() {
    const w = W();
    const years = [...new Set((w.headlines || []).map((h) => h.year))].sort((a, b) => b - a);
    openModal(`<h2>往年頭條</h2><p class="dim">只有世界出現重大變化的年份才有頭條。內容全部來自模擬紀錄。</p>
      ${years.map((y) => `<h3 class="hl-year">${y} 年</h3><div class="headlines">${w.headlines.filter((h) => h.year === y).map(headlineItem).join('')}</div>`).join('')}`);
  }

  // ======================= 神之手 =======================
  // 玩家改變世界的「條件」，結果由引擎計算；所有檢查與執行都在 systems/divine-system.js
  function divineCard() {
    const w = W();
    const D = w.divine || { energy: 0, log: [] };
    const max = w.params.divine.energyMax;
    const recent = (D.log || []).slice(-3).reverse();
    return `<div class="card divine"><h3>神之手 ${(D.log || []).length ? '<button class="link" data-act="divine-log">全部紀錄</button>' : ''}</h3>
      <div class="energy"><span>神力</span><div class="bar"><i style="width:${(D.energy / max) * 100}%"></i></div><span class="num">${Math.floor(D.energy)}／${max}</span></div>
      <p class="dim" style="margin:6px 0 10px">每年恢復 ${w.params.divine.energyRegenPerYear}。你只能改變條件，世界會怎麼反應由引擎決定，結果不保證。</p>
      <div class="divine-btns">${divineKinds(w).map(([k, d]) => {
        const cost = WS.Divine.cost(w, k);
        return `<button class="btn small ${d.future ? 'future' : ''}" data-act="divine-open" data-v="${k}" ${D.energy < cost ? 'disabled' : ''}><b>${d.icon}</b> ${esc(d.name)}<small class="num">${cost}</small></button>`;
      }).join('')}</div>
      ${recent.length ? `<ul class="events" style="margin-top:10px">${recent.map((g) => `<li data-act="event" data-id="${g.eventId}" class="${g.done ? '' : 'l3'}"><div class="when">${g.y}.${String(g.m).padStart(2, '0')}・${g.done ? '已結束' : '進行中'}</div>${esc(g.label)}<div class="dim" style="font-size:12px">${esc(g.status)}</div></li>`).join('')}</ul>` : ''}</div>`;
  }
  function divineModal() {
    if (isAnc()) return ancientDivineModal();
    const w = W();
    const st = S.divine;
    // 未來時代的神之手只列出符合條件的國家（擁核國、已普及 AI 的國家）
    const elig = { calm: (c) => WS.Future.isNuke(c, w), aisafety: (c) => U.adopt(c, 'ai') >= 0.3 }[st.kind];
    const all = U.ids(w), fit = elig ? all.filter((id) => elig(w.countries[id])) : all;
    const ids = fit.length ? fit : all;
    if (!w.countries[st.cid] || !w.countries[st.cid].alive || !ids.includes(st.cid)) st.cid = ids[0];
    const c = w.countries[st.cid];
    let optHtml = '';
    if (st.kind === 'invent') {
      const list = WS.Divine.inventOptions(w, c);
      if (!st.opt || !list.includes(st.opt)) st.opt = list[0] || null;
      optHtml = list.length ? `<div class="field"><label>要啟發的新技術（世界上還沒有、${esc(c.name)}具備前置條件）</label><select data-act="divine-opt-select">${list.map((t) => `<option value="${t}" ${t === st.opt ? 'selected' : ''}>${esc(WS.Data.techs[t].name)}${WS.Data.techs[t].future ? '（未來科技）' : ''}</option>`).join('')}</select></div>` : '';
    }
    if (st.kind === 'tech') {
      const list = WS.Divine.techOptions(w, c);
      if (!st.opt || !list.includes(st.opt)) st.opt = list[0] || null;
      optHtml = list.length ? `<div class="field"><label>要分享的科技（別國已掌握、${esc(c.name)}具備前置條件）</label><select data-act="divine-opt-select">${list.map((t) => `<option value="${t}" ${t === st.opt ? 'selected' : ''}>${esc(WS.Data.techs[t].name)}</option>`).join('')}</select></div>` : '';
    }
    if (st.kind === 'leader') {
      if (!st.opt) st.opt = 'reform';
      optHtml = `<div class="field"><label>候選者的性格</label><div class="seg">${Object.entries(WS.Divine.LEANINGS).map(([k, L]) => `<button data-act="divine-opt" data-v="${k}" class="${st.opt === k ? 'on' : ''}">${esc(L.name)}</button>`).join('')}</div></div>`;
    }
    const pv = engine.divinePreview(st.kind, st.cid, st.opt || undefined);
    const traits = WS.Agents.leaderTraits(c.leader);
    openModal(`<h2>神之手</h2>
      <div class="seg" style="flex-wrap:wrap;margin-bottom:10px">${divineKinds(w).map(([k, d]) => `<button data-act="divine-kind" data-v="${k}" class="${st.kind === k ? 'on' : ''}">${d.icon} ${esc(d.name)}</button>`).join('')}</div>
      <p class="dim">${esc(WS.Divine.KINDS[st.kind].short)}。耗費神力 <b class="gold">${pv.cost}</b>（目前 ${Math.floor(pv.energy)}）。</p>
      <div class="field"><label>對象國家</label><select data-act="divine-target">${ids.map((id) => `<option value="${id}" ${id === st.cid ? 'selected' : ''}>${esc(w.countries[id].name)}</option>`).join('')}</select></div>
      ${st.kind === 'leader' ? `<p class="dim">目前領導人：${esc(c.leader.name)}${traits.length ? '（' + traits.map(esc).join('、') + '）' : ''}</p>` : ''}
      ${optHtml}
      <h3 class="dv-h">條件</h3><ul class="list-plain">${pv.checks.map(([ok, t]) => `<li class="${ok ? 'good' : 'bad'}">${ok ? '✔' : '✘'} ${esc(t)}</li>`).join('')}</ul>
      ${pv.info && pv.info.length ? `<h3 class="dv-h">會改變什麼</h3><ul class="list-plain">${pv.info.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${pv.risk && pv.risk.length ? `<h3 class="dv-h">為什麼結果不保證</h3><ul class="list-plain">${pv.risk.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn gold" data-act="divine-cast" ${pv.ok ? '' : 'disabled'}>施展（神力 −${pv.cost}）</button><button class="btn" data-act="close-modal">取消</button></div>
      <p class="dim" style="margin-top:8px">施展會記錄在指令紀錄裡；「如果？」平行世界重跑時，也會在同一個月份重播這次干預。</p>`);
  }
  // 未來時代的神之手：世界上出現相關科技（AI、核武、再生能源）之後才顯示
  function divineKinds(w) {
    const F = w.future;
    const on = { aisafety: !!w.invented.ai, calm: !!(F && F.nukes && F.nukes.length), green: !!w.invented.renewables };
    return Object.entries(WS.Divine.KINDS).filter(([k, d]) => !d.future || on[k]);
  }
  function divineCast() {
    const st = S.divine;
    const r = engine.divine(st.kind, st.cid, st.opt || undefined);
    if (!r.ok) { toast('無法施展：' + r.reason); divineModal(); return; }
    autosave();
    closeModal(); render();
    toast('已施展：' + r.effects[0]);
  }
  function divineLogModal() {
    const w = W();
    const log = ((w.divine && w.divine.log) || []).slice().reverse();
    openModal(`<h2>神之手紀錄</h2><p class="dim">每一次干預與它目前的結果。點一下可以看完整的原因與後續事件。</p>
      <ul class="events">${log.map((g) => `<li data-act="event" data-id="${g.eventId}"><div class="when">${isAnc() ? esc(yl(g.y)) : `${g.y}.${String(g.m).padStart(2, '0')}`}・${esc(WS.Divine.kinds(w)[g.kind].name)}・神力 ${g.cost}</div>${esc(g.label)}<div class="dim" style="font-size:12px">${g.done ? '結果：' : '狀態：'}${esc(g.status)}</div></li>`).join('')}</ul>`);
  }


  // ======================= 未來時代與世界結局 =======================
  // 數值全部由 engine/future-engine.js 計算；這裡只顯示，並連回事件紀錄
  const FUT = () => WS.Future;
  function ended() { const w = engine.world; return !!(w && w.future && w.future.ended); }
  const fPeople2 = (m) => FUT().fmtPeople(m);
  const pctR = (p) => (p >= 0.1 ? (p * 100).toFixed(0) : p >= 0.001 ? (p * 100).toFixed(1) : (p * 100).toFixed(2)) + '%';
  function doomClock(min) {
    const a = (-min / 60) * Math.PI * 2 - Math.PI / 2;  // 分針：離 12 點幾分鐘
    const R = 34, cx = 40, cy = 40;
    const ticks = Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return `<line x1="${cx + Math.cos(t) * (R - 4)}" y1="${cy + Math.sin(t) * (R - 4)}" x2="${cx + Math.cos(t) * R}" y2="${cy + Math.sin(t) * R}" stroke="#8fa3cc" stroke-width="${i === 9 ? 2.4 : 1}"/>`; }).join('');
    const danger = min <= 3 ? '#f87171' : min <= 7 ? '#fbbf24' : '#38bdf8';
    return `<svg class="doom" viewBox="0 0 80 80" role="img" aria-label="末日鐘：離午夜 ${min} 分鐘">
      <path d="M${cx} ${cy} L${cx} ${cy - R} A${R} ${R} 0 0 0 ${cx + Math.cos(a) * R} ${cy + Math.sin(a) * R} Z" fill="${danger}" opacity=".22"/>
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#1e3463" stroke-width="2"/>${ticks}
      <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R + 8}" stroke="#e2e8f0" stroke-width="2.4"/>
      <line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * (R - 5)}" y2="${cy + Math.sin(a) * (R - 5)}" stroke="${danger}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="2.6" fill="#e2e8f0"/></svg>`;
  }
  function riskBar(label, p, note) {
    const v = U.clamp(Math.sqrt(p) * 200, 0, 100);  // 小機率也看得到：用平方根放大
    return `<div class="meter risk"><span>${label}</span><div class="bar"><i style="width:${v}%"></i></div><span class="num">${pctR(p)}</span><span class="dim">${note || ''}</span></div>`;
  }
  // 文明的終點：離「文明崩潰」與「走向星際」各還有多遠（只讀引擎狀態）
  function endgameHtml() {
    const w = W(), F = w.future, p = w.params.future || WS.DEFAULT_PARAMS.future;
    const ser = F.series.pop;
    const pop = ser.length ? ser[ser.length - 1] : U.ids(w).reduce((s, id) => s + U.popTotal(w.countries[id]), 0);
    const peak = Math.max(F.peak.pop || 0, pop);
    const ratio = peak ? pop / peak : 1;
    // 崩潰進度：人口從高峰往門檻（高峰的 35%）下滑了多少
    const fall = U.clamp((1 - ratio) / (1 - p.endFrac), 0, 1);
    const steps = [
      ['研究出「星際航行」', !!w.invented.interstellar],
      [`火星人口達 ${fPeople2(p.marsSelfSustain)}、可以自給自足`, !!(F.mars && F.mars.selfSustain)],
      ['發射星際移民船', !!F.voyage],
      [`移民船飛行 ${p.voyageYears} 年後抵達`, false]
    ];
    const voyage = F.voyage ? U.clamp((w.year - F.voyage.launched) / (F.voyage.arrive - F.voyage.launched), 0, 1) : 0;
    return `<div class="endgame">
      <div class="eg-row"><div class="eg-h">☠ 文明崩潰</div>
        <div class="meter risk"><span>崩潰進度</span><div class="bar"><i style="width:${(fall * 100).toFixed(1)}%"></i></div><span class="num">${(fall * 100).toFixed(0)}%</span></div>
        <p class="dim">目前地球人口是高峰的 ${(ratio * 100).toFixed(0)}%。人口跌到高峰（${fPeople2(peak)}，${F.peak.y || w.year} 年）的 ${(p.endFrac * 100).toFixed(0)}% 以下，文明就會崩潰；結局名稱取最近 40 年死亡最多的原因。超級智慧失控則直接結束。</p></div>
      <div class="eg-row"><div class="eg-h good">✧ 走向星際</div>
        <ul class="eg-steps">${steps.map(([t, ok], i) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${esc(t)}${i === 3 && F.voyage ? ` <span>（航程 ${(voyage * 100).toFixed(0)}%，預計 ${F.voyage.arrive} 年抵達）</span>` : ''}</li>`).join('')}</ul></div>
      <p class="dim" style="margin:6px 0 0">兩種終點都不會在固定年份發生，全看這個世界怎麼演變。<button class="link" data-act="future-info">結局怎麼判定、報告會有什麼？</button></p>
    </div>`;
  }
  // 文明進程：階段目標、下一個突破、停滯時的原因與可以做的事（資料來自 Future.progress，只讀）
  function progressCard() {
    const w = W();
    if (isAnc() || ended()) return '';
    const G = FUT().progress(w);
    const D = w.divine || { energy: 0 };
    const stages = G.stages.map((st, i) => {
      const done = st.done === st.total, cur = i === G.cur;
      if (i > G.cur + 1 && !done) return '';
      return `<li class="${done ? 'done' : cur ? 'cur' : ''}"><span>${done ? '✓' : cur ? '●' : '○'}</span><div><b>${esc(st.name)}</b> <span class="num dim">${st.done}／${st.total}</span>${done && st.year ? ` <span class="dim">（${st.year} 年完成）</span>` : ''}<br><small class="dim">${esc(st.goal)}</small></div></li>`;
    }).join('');
    const nxt = G.next.slice(0, 3).map((n) => `<li>${esc(n.name)}${n.future ? ' <span class="tag violet">未來科技</span>' : ''}：${esc(n.byName)}最接近（進度 ${(n.prog * 100).toFixed(0)}%）・${n.years == null ? '目前沒有國家在研究' : n.years > 300 ? '照目前速度要超過 300 年' : `照目前速度約 ${n.years} 年`}</li>`).join('');
    const far = G.next.length && (G.next[0].years == null || G.next[0].years > 60);
    let help = '';
    if (G.stalled || far) {
      const acts = [];
      const lead = G.lead && w.countries[G.lead];
      const inv = lead ? WS.Divine.inventOptions(w, lead) : [];
      if (lead && inv.length) acts.push(`<button class="btn small" data-act="divine-open" data-v="invent" data-c="${lead.id}" ${D.energy < WS.Divine.cost(w, 'invent') ? 'disabled' : ''}>✧ 神之手：啟發${esc(lead.name)}研究新技術<small class="num">${WS.Divine.cost(w, 'invent')} 神力</small></button>`);
      const shareTo = U.ids(w).find((id) => WS.Divine.techOptions(w, w.countries[id]).length);
      if (shareTo) acts.push(`<button class="btn small" data-act="divine-open" data-v="tech" data-c="${shareTo}" ${D.energy < WS.Divine.cost(w, 'tech') ? 'disabled' : ''}>✦ 神之手：把已知科技分享給落後國家<small class="num">${WS.Divine.cost(w, 'tech')} 神力</small></button>`);
      if (w.mode === 'country' && w.countries[w.focus] && w.countries[w.focus].alive) {
        const ev = engine.evaluate(w.focus);
        for (const pid of ['research', 'education']) { const p = ev.list.find((x) => x.id === pid); if (p && p.feasible === true) acts.push(`<button class="btn small" data-act="policy" data-c="${w.focus}" data-p="${pid}">${esc(p.name)}（${esc(w.countries[w.focus].name)}）</button>`); }
      } else acts.push('<span class="dim">切換到國家模式，可以直接替一個國家執行「科研投入」「教育投資」。</span>');
      if (w.future && w.future.warming > 1.5 && WS.Divine.KINDS.green && FUT().maxAdopt(w, U.ids(w), 'renewables') > 0) acts.push(`<button class="btn small" data-act="divine-open" data-v="green" data-c="${G.lead || U.ids(w)[0]}">❀ 神之手：推動綠色轉型（減緩暖化）</button>`);
      help = `<div class="stall"><h4>${G.stalled ? `文明停滯：已經 ${G.since} 年沒有新的發明` : '下一個突破還很遠'}</h4>
        <p class="dim" style="margin:0 0 4px">模擬裡的實際原因：</p><ul class="list-plain">${G.why.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="dim" style="margin:6px 0 4px">你可以：</p><div class="divine-btns">${acts.join('')}</div>
        <p class="dim" style="margin:6px 0 0">也可以什麼都不做，看世界自己能不能走出來。所有介入都會記錄，結局報告會比較「沒有你的世界」。</p></div>`;
    }
    return `<div class="card"><h3>文明進程 <span class="dim" style="font-weight:400;font-size:12px">階段目標（不照年份，全看研究）</span></h3>
      <ul class="progress-stages">${stages}</ul>
      ${nxt ? `<h3 class="dv-h" style="margin-top:10px">接下來可能的突破</h3><ul class="list-plain">${nxt}</ul>` : ''}
      ${G.allDone ? '<p class="gold" style="margin:6px 0 0">目前科技已全部完成：已知的科技都有人發明了，沒有下一項可研究。</p>' : ''}
      <p class="dim" style="margin:6px 0 0">${G.last != null ? `最近一次世界首創的發明在 ${G.last} 年（${G.since} 年前）。` : `接到近代以來還沒有新的發明（${G.since} 年）。`}</p>
      ${help}</div>`;
  }
  function futureCard() {
    const w = W();
    const F = w.future;
    if (!F || isAnc()) return '';
    // 還沒有全球性風險的早期：只顯示「文明的終點」與目前的風險來源
    if (w.year < 1945 && !F.nukes.length && F.warming < 1 && !F.ended) {
      const r = F.risk || {};
      const inv = Object.keys(w.invented).filter((k) => WS.Data.techs[k] && WS.Data.techs[k].future).length;
      return `<div class="card future-card"><h3>文明的終點</h3>
        <p class="dim" style="margin:0 0 8px">目前每年發生全球性災難的機率約 <b class="num">${pctR(r.total || 0)}</b>（主要是小行星）。核武、人工智慧、人造瘟疫、氣候風險要等相關科技或暖化出現後才會開始累積；暖化目前 +${F.warming.toFixed(2)}°C，未來科技 ${inv} 項。</p>
        ${endgameHtml()}</div>`;
    }
    const r = F.risk || {};
    const inv = Object.keys(w.invented).filter((k) => WS.Data.techs[k] && WS.Data.techs[k].future);
    const tot = Object.values(WS.Data.techs).filter((t) => t.future).length;
    const min = FUT().clock(w);
    const nukes = F.nukes.filter((x) => w.countries[x] && w.countries[x].alive);
    const lead = F.ai.leader && w.countries[F.ai.leader] ? w.countries[F.ai.leader].name : '—';
    return `<div class="card future-card"><h3>人類的未來 <button class="link" data-act="future-info">這些數字怎麼算？</button></h3>
      <div class="fut-top">${doomClock(min)}<div><div class="k dim">末日鐘（示意）</div><div class="v num">${F.ended ? '午夜' : `離午夜 ${min} 分鐘`}</div>
        <div class="dim" style="font-size:12px">今年發生全球性災難的機率約 <b class="num">${pctR(r.total || 0)}</b></div></div></div>
      <div class="kpis">
        ${kpi('全球暖化', '+' + F.warming.toFixed(2) + '°C', F.warming > 1.5 ? '收成受影響' : null)}
        ${kpi('擁核國', nukes.length + ' 個', null)}
        ${kpi('AI 能力／安全', F.ai.cap.toFixed(1) + '／' + F.ai.align.toFixed(1), F.ai.cap ? '領先：' + lead : null)}
        ${kpi('火星人口', F.mars ? fPeople2(F.mars.pop) : '—', F.mars ? (F.mars.selfSustain ? '可自給自足' : F.mars.founded + ' 年建立') : null)}
      </div>
      <div style="margin-top:10px">
        ${riskBar('核子戰爭', r.nuclear || 0, nukes.length ? '' : '尚無擁核國')}
        ${riskBar('AI 失控', r.ai || 0, w.invented.agi ? '' : '通用 AI 出現後才有')}
        ${riskBar('人造瘟疫', r.bio || 0, '')}
        ${riskBar('氣候臨界點', r.climate || 0, F.warming > w.params.future.tippingFrom ? '' : `暖化超過 ${w.params.future.tippingFrom}°C 後`)}
        ${riskBar('小行星', r.asteroid || 0, '')}
      </div>
      <p class="dim" style="margin:8px 0 0">未來科技 ${inv.length}／${tot}${inv.length ? '：' + inv.map((k) => esc(WS.Data.techs[k].name)).join('、') : '（要等各國研究出來，不照年份）'}</p>
      <h3 class="dv-h" style="margin-top:12px">文明的終點</h3>${endgameHtml()}</div>`;
  }
  function futureModal() {
    const w = W(), p = w.params.future;
    openModal(`<h2>未來時代與世界結局怎麼計算</h2>
      <p class="dim">全部是遊戲用的假設（示意值，尚未校準），不是預測。每年一月依世界當時的狀態算出各種風險的機率，再用這個世界的種子亂數判定。</p>
      <ul class="list-plain">
        <li><b>氣候</b>：暖化＝起點暖化＋累積化石燃料使用量 × 係數。再生能源、核融合越普及，排放越少；碳捕集會慢慢移除累積排放。超過 ${p.harvestLossFrom}°C 收成下降（低緯度最嚴重），超過 ${p.climateDeathFrom}°C 開始有氣候災害死亡，超過 ${p.tippingFrom}°C 每年有 ${(p.tippingChance * 100).toFixed(1)}% 機率觸發無法逆轉的臨界點。</li>
        <li><b>核武</b>：同時普及核能與火箭的國家是擁核國。擁核國互相開戰、戰況危急，或互相敵視時，可能動用核武；盟國可能被捲入。核子寒冬讓全球收成大減好幾年。</li>
        <li><b>人工智慧</b>：AI 能力（人工智慧、通用 AI、超級智慧）和安全程度（AI 安全研究、可解釋 AI、事故後的教訓）差距越大越危險。打仗或擴張中的國家領先時，風險加倍（AI 軍備競賽）。超級智慧出現後，事故可能變成失控。</li>
        <li><b>人造瘟疫</b>：基因工程與合成生物學越普及、醫療越差、世界在打仗時，機率越高。大多數不嚴重，極少數非常致命。</li>
        <li><b>小行星</b>：每年很小的自然機率；行星防禦普及後可以偏轉。</li>
        <li><b>火星</b>：完成「火星殖民」後建立殖民地，人口成長受容量限制；達到 100 萬人可以自給自足，地球毀滅時人類仍能延續。</li>
        <li><b>結局</b>：地球人口跌到高峰的 ${(p.endFrac * 100).toFixed(0)}% 以下就是文明崩潰，結局名稱取最近 40 年造成死亡最多的原因；超級智慧失控直接結束。完成「星際航行」且火星可自給自足時發射移民船，飛 ${p.voyageYears} 年抵達就是「人類走向星際」。</li>
      </ul>
      <h3 class="dv-h">世界結局報告會呈現</h3>
      <ul class="list-plain">
        <li>結局名稱、年份，世界存在了多少年</li>
        <li>成績：人口高峰與結局時的地球人口、最高暖化、火星人口、完成幾項未來科技、擁核國數</li>
        <li>世界人口曲線，以及暖化、每年災難機率、AI 能力與安全差距的曲線</li>
        <li>關鍵轉折點：災難、未來科技、重大戰爭與政變、你的「如果？」改寫（每一項都能點開追查原因）</li>
        <li>結局是怎麼發生的：從排放、暖化、臨界點、收成到各原因的死亡，一步一步串起來</li>
        <li>每場災難的嚴重度、直接死亡、之後每年多造成的死亡、升溫與收成變化</li>
        <li>你的每一次介入（政策、神之手、世界規則、「如果？」）</li>
        <li>「沒有你的世界」：同一個種子、不重播你的介入重跑一次，比較哪個世界先毀滅</li>
      </ul>
      <p class="dim">所有死亡都寫在各國的因果帳裡（「?」可以追查），每場災難都是事件，可以用「如果？」改寫它沒有發生。係數在 engine/params.js 的 future 區塊。</p>`);
  }
  function endingBanner() {
    const w = W();
    if (!ended()) return '';
    const E = w.future.ended, K = FUT().KINDS[E.kind];
    return `<div class="card ending-banner ${E.good ? 'good' : ''}"><h3>${K.icon} 世界結局：${esc(E.title)}・${E.y} 年</h3><p>${esc(E.text)}</p>
      <div class="row"><button class="btn gold" data-act="ending">看世界結局報告</button><button class="btn" data-act="tab" data-v="history">回到過去的年份重來</button></div></div>`;
  }
  function endingModal() {
    const w = W();
    if (!ended()) return;
    const R = FUT().report(w), E = R.ended, K = FUT().KINDS[E.kind];
    const ser = R.series;
    const step = Math.max(1, Math.ceil(ser.y.length / 160));
    const pick = (a) => a.filter((_, i) => i % step === 0 || i === a.length - 1);
    const labels = pick(ser.y);
    const peakW = Math.max(R.warming, ...ser.warming);
    const tl = R.turning.slice(-40);
    const nPlayer = R.player.length + R.whatifs.length;
    const cat = R.catastrophes.filter((c) => c.kind !== 'aiIncident' || c.deaths > 0);
    const cf = S.cf && S.cf.key === w.world_id + w.branch.id + E.y ? S.cf : null;
    openModal(`<div class="ending-head ${E.good ? 'good' : ''}"><div class="ending-icon">${K.icon}</div><div><div class="dim">世界結局・${esc(w.branch.name)}</div><h2 style="margin:2px 0">${esc(E.title)}</h2><div class="num">${R.start} → ${E.y} 年・存在 ${R.years} 年</div></div></div>
      ${mediaHtml(w.events.find((e) => e.id === E.eventId) || { countries: [], title: E.title, y: E.y, m: E.m, type: 'ending', fk: E.kind, id: E.eventId })}
      <p>${esc(E.text)}</p>
      <div class="kpis">
        ${kpi('人口高峰', fPeople2(R.peak.pop), R.peak.y + ' 年')}
        ${kpi('結局時地球人口', fPeople2(E.earthPop), sg(((E.earthPop - R.peak.pop) / R.peak.pop) * 100, 0) + '%')}
        ${kpi('最高暖化', '+' + peakW.toFixed(1) + '°C', null)}
        ${kpi('火星', R.mars ? fPeople2(R.mars.pop) : '沒有殖民地', R.mars ? R.mars.founded + ' 年建立' : null)}
        ${kpi('未來科技', R.techs + '／' + R.techTotal, null)}
        ${kpi('擁核國', R.nukes + ' 個', null)}
      </div>
      ${R.chain && R.chain.length ? `<h3 class="dv-h">結局是怎麼發生的</h3><ul class="end-chain">${R.chain.map((x, i) => `<li class="${x.k === 'end' ? 'end' : ''}">${esc(x.t)}</li>${i < R.chain.length - 1 ? '<li class="arrow" aria-hidden="true">↓</li>' : ''}`).join('')}</ul><p class="dim" style="margin:4px 0 0">每一步都來自模擬紀錄（累計排放、臨界點、收成、各原因的死亡），死亡都寫在各國因果帳裡。</p>` : ''}
      <h3 class="dv-h">世界人口（百萬）</h3>${chart(labels, [{ name: '地球人口', color: '#38bdf8', data: pick(ser.pop), bold: true }], { label: '世界人口', zero: true, h: 170 })}
      ${ser.harvest && ser.harvest.some((x) => x != null && x < 99.5) ? `<h3 class="dv-h">全球平均收成（%，100＝沒有受暖化或寒冬影響）</h3>${chart(labels, [{ name: '全球收成 %', color: '#4ade80', data: pick(ser.harvest), bold: true }], { label: '全球收成', zero: true, h: 150 })}` : ''}
      <h3 class="dv-h">暖化（°C）與每年災難機率（%）</h3>${chart(labels, [{ name: '暖化 °C', color: '#fb923c', data: pick(ser.warming), bold: true }, { name: '災難機率 %', color: '#f87171', data: pick(ser.risk) }, { name: 'AI 能力−安全差距', color: '#a78bfa', data: pick(ser.gap) }], { label: '暖化與風險', zero: true, h: 170 })}
      <h3 class="dv-h">關鍵轉折點</h3>
      <ul class="events">${tl.map((x) => `<li class="${x.kind === 'catastrophe' || x.kind === 'ending' ? 'war l3' : x.kind === 'whatif' ? 'wi' : ''}" ${x.eventId ? `data-act="event" data-id="${x.eventId}"` : ''}><div class="when">${x.y}${x.m ? '.' + String(x.m).padStart(2, '0') : ''}・${typeLabel(x.kind)}</div>${esc(x.title)}</li>`).join('') || '<li class="dim">沒有</li>'}</ul>
      ${cat.length ? `<h3 class="dv-h">災難：觸發了什麼、實際造成多少損失</h3>
        <p class="dim" style="margin:0 0 6px">「直接死亡」是發生當下的死亡；「之後的死亡」是它留下的長期影響（臨界點的額外升溫、核子寒冬）在之後每年多造成的死亡，依公式拆分。嚴重度只看實際的死亡、升溫與收成損失，不看名稱。點一列可以看詳細原因。</p>
        <div class="table-wrap"><table class="wi-table"><tr><th>年份</th><th>災難</th><th>嚴重度</th><th class="num">直接死亡</th><th class="num">之後的死亡</th><th>其他影響</th></tr>${cat.map((c) => {
          const im = c.impact, sev = c.sev != null ? c.sev : im ? FUT().severity(w, c) : null;
          const other = im ? [im.warming ? `+${im.warming.toFixed(2)}°C` : '', im.harvestBefore != null && Math.abs(im.harvestBefore - im.harvestAfter) > 0.001 ? `收成 ${(im.harvestBefore * 100).toFixed(0)}→${(im.harvestAfter * 100).toFixed(0)}%` : ''].filter(Boolean).join('、') : '';
          return `<tr data-act="event" data-id="${c.eventId}"><td class="num">${c.y}</td><td>${esc(c.title)}</td><td>${sev != null ? `<span class="sev s${sev}">${FUT().SEVERITY[sev]}</span>` : '<span class="dim">舊紀錄</span>'}</td><td class="num">${c.deaths ? fPeople2(c.deaths) : '0'}</td><td class="num">${im ? (im.later > 0.001 ? fPeople2(im.later) : '0') : '—'}</td><td>${esc(other) || '<span class="dim">—</span>'}</td></tr>`;
        }).join('')}</table></div>${cat.some((c) => !c.impact) ? '<p class="dim">標示「舊紀錄」的災難發生在更新之前，當時還沒有記錄之後的影響；回到過去的年份重來，就會有完整資料。</p>' : ''}` : ''}
      <h3 class="dv-h">你的介入（${nPlayer} 次）</h3>
      ${nPlayer ? `<ul class="list-plain">${R.player.map((x) => `<li><span class="dim num">${x.y}.${String(x.m).padStart(2, '0')}</span> ${esc(x.text)}</li>`).join('')}${R.whatifs.map((x) => `<li><span class="dim num">${x.y}.${String(x.m).padStart(2, '0')}</span> 平行世界改寫：${esc(x.label)}</li>`).join('')}</ul>` : '<p class="dim">這一次你完全沒有介入，世界自己走到了這一步。</p>'}
      <div class="wi-box"><h3>沒有你的世界會怎樣？</h3>
        <p class="dim">從 ${R.start} 年用同一個種子重跑，但不重播你的政策、神之手、世界規則與平行世界的改寫，看看世界會在什麼時候、因為什麼終結。最多再多跑 200 年。目前的世界不會被改動。</p>
        <div id="cf-out">${cf ? cfHtml(cf, R) : `<button class="btn gold" data-act="cf-run" ${nPlayer ? '' : 'disabled'}>${nPlayer ? '開始重跑' : '你沒有介入，兩個世界會完全一樣'}</button>`}</div></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-act="tab" data-v="history">回到過去的年份重來</button><button class="btn" data-act="close-modal">關閉</button></div>`);
    mountMedia();
  }
  function cfHtml(cf, R) {
    if (!cf.done) return `<p class="num">重跑中…… ${cf.year} 年</p>`;
    const A = cf.result, E = R.ended;
    const endTxt = (e, y) => (e ? `${FUT().KINDS[e.kind].icon} ${esc(e.title)}（${e.y} 年）` : `到 ${y} 年仍未終結`);
    const life = A.ended ? A.ended.y - R.start : null;
    const diff = A.ended ? (E.y - A.ended.y) : null;
    let verdict;
    if (!A.ended) verdict = `沒有你的話，世界至少撐到 ${A.year} 年，比你的世界多 ${A.year - E.y} 年以上。`;
    else if (A.ended.kind === E.kind && A.ended.y === E.y) verdict = '兩個世界在同一年、因為同樣的原因終結：你的介入沒有改變結局。';
    else if (diff > 0) verdict = `你的介入讓世界多活了 ${diff} 年${A.ended.kind !== E.kind ? '，結局也不一樣' : ''}。`;
    else if (diff < 0) verdict = `沒有你的話，世界會多撐 ${-diff} 年${A.ended.kind !== E.kind ? '，結局也不一樣' : ''}。`;
    else verdict = '兩個世界在同一年終結，但原因不同。';
    return `<table class="wi-table"><tr><th></th><th>你的世界</th><th>沒有你的世界</th></tr>
      <tr><td>結局</td><td>${endTxt(E)}</td><td>${endTxt(A.ended, A.year)}</td></tr>
      <tr><td>存在年數</td><td class="num">${R.years}</td><td class="num">${life != null ? life : '> ' + (A.year - R.start)}</td></tr>
      <tr><td>人口高峰</td><td class="num">${fPeople2(R.peak.pop)}（${R.peak.y}）</td><td class="num">${fPeople2(A.peak.pop)}（${A.peak.y}）</td></tr>
      <tr><td>最高暖化</td><td class="num">+${Math.max(R.warming, ...R.series.warming).toFixed(1)}°C</td><td class="num">+${A.maxWarm.toFixed(1)}°C</td></tr>
      <tr><td>災難次數</td><td class="num">${R.catastrophes.filter((c) => c.kind !== 'aiIncident').length}</td><td class="num">${A.cats}</td></tr>
      <tr><td>火星</td><td>${R.mars ? fPeople2(R.mars.pop) : '—'}</td><td>${A.mars ? fPeople2(A.mars.pop) : '—'}</td></tr></table>
      <p><b>${esc(verdict)}</b></p>
      ${R.player.length ? `<p class="dim">你的第一次介入：${R.player[0].y} 年 ${esc(R.player[0].text)}</p>` : ''}
      ${A.firstDiff ? `<p class="dim">兩個世界第一個不同的重大事件：${esc(A.firstDiff)}</p>` : ''}
      ${A.diffFrom ? `<p class="dim">事件紀錄只保留最近 3000 件，比較從 ${A.diffFrom} 年開始。</p>` : ''}`;
  }
  function cfRun() {
    const w = W();
    const E = w.future.ended;
    const key = w.world_id + w.branch.id + E.y;
    const run = FUT().counterfactual(w, 200);
    if (!run) { toast('這個世界沒有起點設定，無法重跑'); return; }
    S.cf = { key, done: false, year: run.sim.w.year };
    const R = FUT().report(w);
    const out = () => document.getElementById('cf-out');
    const tick = () => {
      if (!S.cf || S.cf.key !== key) return;
      const sw = run.run(4);
      S.cf.year = sw.year;
      if (run.done()) {
        const F = sw.future;
        const d = FUT().firstDiff(w, sw, null, run.events);
        const firstDiff = !d ? null : d.mine && d.other ? `${d.y} 年你的世界：「${d.mine.title}」／沒有你的世界：「${d.other.title}」`
          : d.mine ? `${d.y} 年你的世界：「${d.mine.title}」（沒有你的世界沒有這件事）` : `${d.y} 年沒有你的世界：「${d.other.title}」（你的世界沒有這件事）`;
        const diffFrom = d && d.from ? d.from : null;
        S.cf = { key, done: true, year: sw.year, result: { ended: F.ended, year: sw.year, peak: F.peak, maxWarm: Math.max(F.warming, ...F.series.warming), cats: F.catastrophes.filter((c) => c.kind !== 'aiIncident').length, mars: F.mars, firstDiff, diffFrom } };
      }
      const el = out();
      if (el) el.innerHTML = cfHtml(S.cf, R);
      if (!S.cf.done) setTimeout(tick, 0);
    };
    const el = out();
    if (el) el.innerHTML = cfHtml(S.cf, R);
    setTimeout(tick, 30);
  }

  // 版本號（tools/stamp-version.js 寫在 index.html 裡）
  function verText() { const m = document.querySelector('meta[name="ws-version"]'); return m ? m.getAttribute('content') : ''; }
  function systemTab() {
    const w = W();
    const saves = WS.Save.list();
    const adv = w.difficulty === 'advanced';
    return `
      <div class="card"><h3>存檔</h3>
        <div class="row"><input type="text" id="save-name" value="${esc(w.name + '・' + w.branch.name + '・' + w.year)}" style="flex:1;min-width:180px"><button class="btn" data-act="save">儲存</button></div>
        <div id="save-usage" style="margin-top:8px"><p class="dim" style="margin:0">計算存檔空間中…</p></div>${(setTimeout(fillSaveUsage, 0), '')}
        <div class="row" style="margin-top:8px"><button class="btn small" data-act="export">備份存檔</button><label class="btn small" style="display:inline-flex;align-items:center">讀取備份<input type="file" id="import" accept="application/json,.json" hidden></label><button class="btn small" data-act="home">回到開始畫面</button></div>
        <p class="dim" style="margin:6px 0 0">「備份存檔」會把這個世界存成一個檔案放到你的裝置上；換手機、清除瀏覽器資料之前，或想把世界分享給朋友時使用。「讀取備份」選那個檔案就能回到這個世界。</p>
        <div style="margin-top:10px">${saves.map((s) => `<div class="policy"><div>${esc(s.name)}${s.auto ? ' <span class="tag">自動保存</span>' : ''}<small>${esc(s.branch)}・${s.year}.${s.month}・${s.mode === 'country' ? '國家模式' : '全球模式'}・${new Date(s.saved).toLocaleString()}${s.bytes ? '・' + WS.Save.mb(s.bytes) : ''}${s.compact ? '・精簡版' : ''}</small></div>
          <div class="row"><button class="btn small" data-act="load" data-id="${s.id}">載入</button><button class="btn small" data-act="del-save" data-id="${s.id}">刪除</button></div></div>`).join('') || '<p class="dim">沒有存檔。每次推進後會自動存到「繼續遊戲」。</p>'}</div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>設定</h3>
          <div class="field"><label>設定深度</label>${seg2('depth-live', w.difficulty, [['simple', '簡易'], ['custom', '自訂'], ['advanced', '進階']])}</div>
          <div class="field"><label>玩家介入</label>${seg2('intervention-live', w.intervention, [['none', '不介入'], ['occasional', '偶爾決策'], ['full', '完全控制']])}</div>
          ${pauseSetting(false)}
          ${langSetting()}
          ${themeSetting()}
          ${verText() ? `<p class="dim" style="margin:8px 0 0">版本 ${verText()}（回報問題時請一起附上；版本不同代表瀏覽器還在用舊檔案，請重新整理）</p>` : ''}
        </div>
        ${helpCard()}
        <details class="card dev-info"><summary>開發者資訊（一般玩家不需要看）</summary>
          <p class="dim">世界 ID：${esc(w.world_id)}・種子：${esc(w.seed)}・模擬版本 ${esc(w.simulation_version)}・參數 ${esc(w.paramsVersion)}</p>
          <h4>數值驗證</h4><p class="dim">已檢查 ${w.validation.checks} 期，發現 ${w.validation.issues.length} 個問題（自動修正並記錄）。</p>
          <ul class="list-plain">${w.validation.issues.slice(-8).reverse().map((i) => `<li>${i.y}.${i.m}　${esc(i.text)}</li>`).join('') || '<li class="good">沒有異常</li>'}</ul>
          <h4>每期固定計算順序</h4><ol class="list-plain">${WS.STEP_ORDER.map((s) => `<li>${esc(s.replace(/^\d+ /, ''))}</li>`).join('')}</ol></details>
        ${adv ? `<div class="card"><h3>模型參數（進階）</h3><p class="dim">所有係數皆為待校準的示意值。修改後會記錄在事件中，只影響這條世界線。</p>${paramsEditor(w.params)}</div>` : ''}
      </div>`;
  }
  function helpCard() {
    return `<div class="card"><h3>說明與回饋</h3><p class="dim" style="margin-top:0">再看一次遊戲介紹，或把遇到的問題、建議告訴我們。</p>
      <div class="row"><button class="btn small" data-act="intro">📢 遊戲介紹</button><button class="btn small" data-act="feedback">💬 意見回饋</button>${supportBtn()}</div></div>`;
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

  // ======================= 地區生活畫面 =======================
  // 點地球上的地區／國家時，畫出「這裡的人現在正在做什麼」。只讀引擎狀態，不寫入任何數值。
  let lifeCam = null;
  function cView(w) {
    const ids = U.ids(w);
    return S.view && w.countries[S.view] && w.countries[S.view].alive ? S.view : w.countries[w.focus] && w.countries[w.focus].alive ? w.focus : ids[0];
  }
  function biomeOf(lat, g) {
    const a = Math.abs(lat);
    if (g && g.animals >= 0.6 && g.arable < 0.15) return 'steppe';
    if (a < 15) return 'tropical';
    if (g && g.wild <= 0.15 && a < 32 && (g.arable < 0.1 || a >= 15)) return 'arid';
    if (a >= 52) return 'cold';
    return 'temperate';
  }
  const pct = (v) => Math.round(v * 100) + '%';
  function lifeData() {
    const w = W();
    if (!w) return null;
    return isAnc() ? ancientLife(w) : modernLife(w);
  }
  function ancientLife(w) {
    const A = AN(), id = aRegion(w), r = w.ancient.regions[id];
    if (!r) return null;
    const pop = A.popOf(r) || 1e-9;
    const has = (t) => A.knows(w, r, t);
    const shares = { wild: r.pop.F / pop, farm: r.pop.A / pop, city: r.pop.U / pop };
    const pol = A.polityOf(w, r);
    const PT = WS.Data.ancientPolityTypes;
    const metal = has('iron') ? '鐵' : has('bronze') ? '青銅' : has('copper') ? '銅' : null;
    const feat = {
      bow: has('microliths'), pottery: has('pottery'), storage: has('storage'), herding: has('animal_domestication'),
      plough: has('plough'), irrigation: has('irrigation'), wheel: has('wheel'), sailing: has('sailing'), currency: has('currency'),
      writing: has('writing'), metal: !!metal, iron: has('iron'), gunpowder: has('gunpowder'),
      horse: has('animal_domestication') && r.animals >= 0.5 && (has('wheel') || r.id === 'STE')
    };
    // 最近的戰爭（依每期長度，約最近兩期內）
    const span = Math.max(20, A.dtFor(w) * 2);
    let war = null;
    for (let i = w.events.length - 1; i >= 0; i--) {
      const e = w.events[i];
      if (w.year - e.y > span) break;
      if (e.type === 'war' && e.countries.includes(id)) {
        const ap = e.polity && w.ancient.polities[e.polity];
        const other = e.countries.find((x) => x !== (ap ? ap.capital : null)) || e.countries[1];
        const or = w.ancient.regions[other];
        war = { title: e.title, intensity: e.level >= 3 ? 1 : 0.6, colors: [ap ? ap.color : r.color, or ? polityColor(w, or) : '#999'], y: e.y };
        break;
      }
    }
    const famine = U.clamp((1 - r.fs) * 3, 0, 1), drought = U.clamp((1 - r.clim) * 2.5, 0, 1);
    const items = [];
    if (shares.wild > 0.005) items.push(['🏹', `${pct(shares.wild)} 的人過著遊獵生活：${feat.bow ? '拿弓箭' : '拿長矛'}打獵、採集野果${r.coast >= 0.35 ? '、捕魚' : ''}`]);
    if (feat.herding) items.push(['🐑', `已經會養家畜：放牧牛羊${feat.horse ? '、騎馬' : ''}`]);
    if (shares.farm > 0.005) {
      const how = [feat.plough ? '用牛拉犁' : '用石鋤翻土', feat.irrigation ? '引河水灌溉' : null, feat.storage ? '收成存進穀倉' : null].filter(Boolean).join('、');
      items.push(['🌾', `${pct(shares.farm)} 的人在種田：${how}`]);
    }
    if (shares.city > 0.002) {
      const names = r.cities.slice(0, 3).map((c) => c.name).join('、');
      const life = [feat.currency ? '用貨幣在市集買賣' : '在市集以物易物', feat.writing ? '書吏用文字記帳' : null].filter(Boolean).join('、');
      items.push(['🏛', `${pct(shares.city)} 的人住在城市（${r.cities.length} 座${names ? '：' + names : ''}）：${life}`]);
    }
    if (metal) items.push(['⚒', `工匠在冶煉${metal}，打造工具與武器`]);
    if (pol) items.push(['👑', `受「${pol.name}」統治（${PT[pol.type] ? PT[pol.type].name : ''}）`]);
    if (war) items.push(['⚔', `打仗：${war.title}（${yl(war.y)}）`]);
    if (famine > 0.15) items.push(['🥀', `糧食不夠：糧食安全只有 ${(r.fs * 100).toFixed(0)}%，有人在挨餓`]);
    if (drought > 0.15) items.push(['☀', `氣候比平常乾，野生食物與收成減少`]);
    const main = shares.city > 0.25 ? '城市生活' : shares.farm >= shares.wild ? '多數人在種田' : feat.herding && r.animals >= 0.6 && r.arable < 0.2 ? '多數人在放牧與遊獵' : '多數人在打獵採集';
    const caption = [main, war ? '正在打仗' : null, famine > 0.3 ? '鬧饑荒' : null].filter(Boolean).join('・');
    return {
      key: [id, 'a', Math.round(shares.wild * 20), Math.round(shares.farm * 20), Math.round(shares.city * 40)].join(':'), seedKey: id,
      modern: false, place: r.name, when: yl(w.year), caption, items, shares, feat,
      biome: biomeOf(r.lat, r), coast: r.coast, river: r.river, famine, drought, war, unrest: 0, pollution: 0,
      color: pol ? pol.color : r.color, polityRank: pol && PT[pol.type] ? PT[pol.type].rank : 0, polityName: pol ? pol.name : null, cities: r.cities.length
    };
  }
  function modernLife(w) {
    const id = cView(w), c = w.countries[id];
    if (!c) return null;
    const lab = c.econ.lab, tot = (lab.agri + lab.ind + lab.serv) || 1;
    const has = (t) => hasTech(c, t);
    const shares = { wild: 0, farm: lab.agri / tot, city: (lab.ind + lab.serv) / tot, ind: lab.ind / tot, serv: lab.serv / tot };
    const feat = {
      electric: has('electrification'), automobile: has('automobile'), railway: has('railway'), aviation: has('aviation'), tractor: has('tractor'),
      armor: has('armor'), steam: true, wheel: true, metal: true, iron: true, sailing: true, plough: !has('tractor'), irrigation: true, computing: has('computing'), internet: has('internet')
    };
    const wr = w.wars.find((x) => !x.ended && (x.attackers.includes(id) || x.defenders.includes(id)));
    let war = null;
    if (wr) {
      const mine = wr.attackers.includes(id) ? wr.attackers : wr.defenders, theirs = mine === wr.attackers ? wr.defenders : wr.attackers;
      const d = warCamData(wr.id);
      war = { title: wr.name, intensity: d ? d.intensity : 0.6, colors: [c.color, (w.countries[theirs[0]] || {}).color || '#999'], id: wr.id };
    }
    const famine = U.clamp((c.res.shortage || 0) * 2.5, 0, 1);
    const unrest = U.clamp((45 - c.pol.stability) / 45, 0, 1);
    const items = [];
    items.push(['🌾', `${pct(shares.farm)} 的人在務農${feat.tractor ? '，用農業機械耕作' : '，多半靠人力和牲口'}`]);
    if (shares.ind > 0.01) items.push(['🏭', `${pct(shares.ind)} 的人在工廠、礦場做工${feat.electric ? '（已用電力）' : ''}`]);
    if (shares.serv > 0.01) items.push(['🏙', `${pct(shares.serv)} 的人做服務業：商店、辦公室、學校、醫院${feat.computing ? '，開始用電腦' : ''}`]);
    items.push(['🏠', `城市化 ${pct(c.demo.urban)}`]);
    const move = [feat.railway ? '火車' : null, feat.automobile ? '汽車' : null, feat.aviation ? '飛機' : null].filter(Boolean);
    if (move.length) items.push(['🚆', `出門搭${move.join('、')}`]);
    if (war) items.push(['⚔', `打仗：${war.title}`]);
    if (famine > 0.15) items.push(['🥀', `糧食短缺，有人在挨餓`]);
    if (unrest > 0.3) items.push(['📢', `政局不穩（穩定度 ${c.pol.stability.toFixed(0)}），街上有人示威`]);
    const main = shares.farm > 0.5 ? '多數人在種田' : shares.ind > shares.serv ? '工廠與城市生活' : '城市與服務業生活';
    const caption = [main, war ? '正在打仗' : null, famine > 0.3 ? '鬧饑荒' : null, unrest > 0.5 ? '街頭示威' : null].filter(Boolean).join('・');
    return {
      key: [id, 'm', Math.round(shares.farm * 20), Math.round(shares.city * 20)].join(':'), seedKey: id,
      modern: true, place: c.name, when: `${w.year} 年 ${w.month} 月`, caption, items, shares, feat,
      biome: biomeOf(c.lat || 30, null), coast: 0.5, river: 0.3, famine, drought: 0, war, unrest, pollution: U.clamp((c.res.pollution || 0) / 100, 0, 1),
      color: c.color, polityRank: 3, polityName: c.name, cities: 3
    };
  }
  function lifeCard() {
    const d = lifeData();
    if (!d || !window.WSLifeCam) return '';
    return `<div class="card life-card"><h3>此刻的生活 <span class="dim" style="font-weight:400;font-size:12px">${esc(d.place)}・${esc(d.when)}</span></h3>
      <div class="wc-wrap life-wrap" id="life-slot"></div>
      <ul class="life-list">${d.items.map(([ic, tx]) => `<li><span class="ic">${ic}</span>${esc(tx)}</li>`).join('')}</ul>
      <p class="dim" style="margin:4px 0 0;font-size:12px">依模擬數據畫的動畫，不是真實影像：田、城市、獵人的多寡跟著人口比例變，工具跟著已普及的科技變。</p></div>`;
  }
  function mountLife() {
    const slot = document.getElementById('life-slot');
    if (!slot || !window.WSLifeCam) return;
    if (!lifeCam) lifeCam = new WSLifeCam(lifeData);
    lifeCam.attach(slot);
  }

  // ======================= 遠古時代 =======================
  // 遠古世界沒有國家、GDP；畫面以「地區」為單位。只讀取引擎狀態，不自己算數值。
  const AN = () => WS.Ancient;
  const isAnc = () => !!(engine.world && WS.Ancient && WS.Ancient.isAncient(engine.world));
  const A_SPEEDS = { c1: [100, '百年'], c5: [500, '五百年'], m1: [1000, '千年'] };
  const yl = (y) => AN().yearLabel(y);
  const yShort = (y) => (y <= 0 ? '前' + (1 - y) : String(y));
  const nameOf = (w, id) => (w.countries[id] ? w.countries[id].name : w.ancient && w.ancient.regions[id] ? w.ancient.regions[id].name : id);
  const fPeople = (m) => (m >= 1 ? m.toFixed(m >= 10 ? 1 : 2) + ' 百萬' : Math.round(m * 1e6).toLocaleString() + ' 人');
  function aRegion(w) {
    const ids = AN().ids(w);
    return S.view && w.ancient.regions[S.view] ? S.view : w.ancient.regions[w.focus] ? w.focus : ids[0];
  }
  function polityColor(w, r) { const p = AN().polityOf(w, r); return p ? p.color : r.color; }
  function ancientGlobeData() {
    const w = W(), A = AN();
    if (w !== worldObj) { worldObj = w; worldKey++; }
    const ids = A.ids(w);
    const markers = ids.map((id) => {
      const r = w.ancient.regions[id], p = A.popOf(r);
      return {
        id, name: r.name, lat: r.lat, lon: r.lon, color: polityColor(w, r), size: Math.max(2.4, Math.sqrt(p) * 1.6), war: false,
        anchors: [[r.lat, r.lon, U.clamp(Math.sqrt(r.area) * 1.6, 3, 11)]],
        light: U.clamp(A.urbanShare(r) * 8, 0, 0.9),
        famine: U.clamp((1 - r.fs) * 4, 0, 1)
      };
    });
    const links = [];
    for (const p of Object.values(w.ancient.polities)) if (!p.ended) for (const rid of p.regions) if (rid !== p.capital) links.push({ a: p.capital, b: rid, type: 'alliance' });
    // 地球上的標籤：最近的世界第一次、新政體、饑荒
    const tags = [];
    const LBL = { tech: '新發明', city: '第一座城市', polity: '新政體', conditional: '饑荒' };
    for (let i = w.events.length - 1; i >= 0 && tags.length < 8; i--) {
      const e = w.events[i];
      if (w.year - e.y > 300) break;
      if (!LBL[e.type] || e.level < 3 || !e.countries[0]) continue;
      if (tags.some((t) => t.country === e.countries[0])) continue;
      tags.push({ country: e.countries[0], kind: e.type === 'conditional' ? 'famine' : e.type === 'polity' ? 'newcountry' : 'tech-first', label: LBL[e.type], event: e.id });
    }
    return { markers, links, focus: null, fronts: [], scorch: [], events: [], tags, worldKey };
  }
  function ancientMapSvg() {
    const w = W(), A = AN();
    const X = (lon) => lon + 180, Y = (lat) => 90 - lat;
    let lines = '';
    for (const r of Object.values(w.ancient.regions)) for (const [id, kind] of r.links) {
      if (id < r.id) continue;
      const o = w.ancient.regions[id];
      if (Math.abs(r.lon - o.lon) > 180) continue;
      lines += `<line x1="${X(r.lon)}" y1="${Y(r.lat)}" x2="${X(o.lon)}" y2="${Y(o.lat)}" stroke="${kind === 'land' ? '#334a7a' : '#1e3a5f'}" stroke-width=".5" ${kind === 'land' ? '' : 'stroke-dasharray="2 1.5"'}/>`;
    }
    let grid = '';
    for (let lon = -180; lon <= 180; lon += 30) grid += `<line x1="${X(lon)}" y1="0" x2="${X(lon)}" y2="180" stroke="#1e3463" stroke-width=".2"/>`;
    for (let lat = -60; lat <= 80; lat += 20) grid += `<line x1="0" y1="${Y(lat)}" x2="360" y2="${Y(lat)}" stroke="#1e3463" stroke-width=".2"/>`;
    const nodes = A.ids(w).map((id) => {
      const r = w.ancient.regions[id];
      const rad = Math.max(2.4, Math.sqrt(A.popOf(r)) * 1.6);
      const col = polityColor(w, r);
      return `<g data-act="open-country" data-id="${id}" style="cursor:pointer">
        <circle cx="${X(r.lon)}" cy="${Y(r.lat)}" r="${rad}" fill="${col}" fill-opacity="${r.caps.agriculture ? 0.5 : 0.2}" stroke="${col}" stroke-width="${r.polity ? 1 : 0.5}"/>
        ${r.cities.length ? `<circle cx="${X(r.lon)}" cy="${Y(r.lat)}" r="1.2" fill="#ffd68c"/>` : ''}
        <text x="${X(r.lon)}" y="${Y(r.lat) + rad + 4.5}" font-size="5" fill="#e6ecff" text-anchor="middle">${esc(r.short)}</text></g>`;
    }).join('');
    return `<svg class="map" viewBox="0 15 360 135" role="img" aria-label="遠古世界示意地圖">${grid}${lines}${nodes}</svg>
      <div class="legend" style="margin-top:6px"><span>圓圈大小＝人口</span><span>實心＝已務農</span><span><i style="background:#ffd68c"></i>有城市</span><span>虛線＝需要航海</span></div>`;
  }
  function ancientObservatory() {
    const w = W(), s = AN().summary(w);
    const toggle = `<div class="seg mini">${[['globe', '球體'], ['flat', '平面']].map(([v, l]) => `<button data-act="map-view" data-v="${v}" class="${S.mapView === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (S.mapView === 'flat' || !globe) return `<div class="card"><h3>遠古世界地圖 ${toggle}</h3>${ancientMapSvg()}</div>`;
    return `<div class="card observatory"><h3>行星觀測窗 ${toggle}</h3>
      <div class="globe-slot" id="globe-slot">
        <div class="hud-tag tl"><i class="live">即時</i><b>${esc(yl(w.year))}</b><span>世界線：${esc(w.branch.name)}</span></div>
        <div class="hud-tag tr">人口<b class="num">${fPeople(s.pop)}</b></div>
        <div class="hud-tag bl">務農地區<b class="num">${s.farming}</b>城市<b class="num">${s.cities}</b></div>
        <div class="hud-tag br">政體<b class="num">${s.polities}</b></div>
      </div>
      <div class="legend"><span>顏色＝所屬政體</span><span><i style="background:#38bdf8"></i>同一政體</span><span><i style="background:#ffd68c"></i>城市燈光</span><span><i style="background:#c48c3c"></i>饑荒</span></div>
      <p class="dim" style="margin:4px 0 0">拖曳可轉動・點地區看當地生活・點標籤看原因・事件旁的 <b class="gold">如果？</b> 可以看另一條世界線</p></div>`;
  }
  function aEventItem(e) {
    const cl = (e.type === 'war' ? 'war ' : '') + (e.level >= 3 ? 'l3 ' : '');
    const can = WS.WhatIf.options(W(), e).length > 0;
    return `<li class="${cl}" data-act="event" data-id="${e.id}">${can ? `<button class="wi-chip" data-act="whatif" data-id="${e.id}" aria-label="如果這件事改寫了？">如果？</button>` : ''}<div class="when">${esc(yl(e.y))}・${typeLabel(e.type)}</div>${esc(e.title)}</li>`;
  }
  function ancientOverview() {
    const w = W(), A = AN(), s = A.summary(w);
    const sw = w.series.world.pop, n = sw.length, lb = w.series.labels;
    const growth = n > 1 && sw[n - 2] > 0 ? ((sw[n - 1] / sw[n - 2]) ** (1 / Math.max(1, lb[n - 1] - lb[n - 2])) - 1) * 100 : null;
    const firsts = Object.entries(w.ancient.firsts).filter(([, f]) => f.region).sort((a, b) => b[1].year - a[1].year);
    const FN = { city: '第一座城市', polity: '第一個政體（酋邦）', citystate: '第一個城邦', kingdom: '第一個王國', empire: '第一個帝國' };
    const fname = (k) => FN[k] || (WS.Data.ancientTechs[k] ? WS.Data.ancientTechs[k].name : k);
    const evs = w.events.filter((e) => e.level >= 2).slice(-12).reverse();
    const rows = A.ids(w).map((id) => w.ancient.regions[id]).sort((a, b) => A.popOf(b) - A.popOf(a));
    return ancientObservatory() + `
      <div class="card"><h3>人類世界・${esc(yl(w.year))}</h3><div class="kpis">
        ${kpi('世界人口', fPeople(s.pop), growth != null ? sg(growth, 3) + '%／年' : null)}
        ${kpi('務農地區', s.farming + '／' + s.regions, null)}
        ${kpi('城市', s.cities + ' 座', null)}
        ${kpi('國家（城邦以上）', s.states + ' 個', null)}
      </div>
      <p class="dim" style="margin:10px 0 0">遠古世界沒有國家與 GDP：以 ${s.regions} 個地理區域模擬採集、農耕、儲糧、交換、發明與擴散。每期 ${A.dtFor(w)} 年，越接近近代刻度越細。</p></div>
      ${WS.EraBridge.available(w).ok ? bridgeCard() : ''}
      ${ancientDivineCard()}
      <div class="grid g2">
        <div class="card"><h3>最新事件 <button class="link" data-act="tab" data-v="history">全部</button></h3><ul class="events">${evs.map(aEventItem).join('') || '<li class="dim">推進時間，看人類會在哪裡先開始務農。</li>'}</ul></div>
        <div class="card"><h3>世界第一次</h3>${firsts.length ? `<ul class="list-plain">${firsts.slice(0, 14).map(([k, f]) => `<li><b>${esc(fname(k))}</b>：${esc(w.ancient.regions[f.region].name)}・${esc(yl(f.year))}</li>`).join('')}</ul>` : '<p class="dim">還沒有新的發明。農業、城市、文字……會在哪裡、什麼時候出現，每條世界線都不一樣。</p>'}</div>
      </div>
      <div class="card"><h3>各地區</h3><div class="table-wrap"><table>
        <tr><th>地區</th><th>人口</th><th>務農</th><th>城市</th><th>時代</th></tr>
        ${rows.map((r) => `<tr data-act="open-country" data-id="${r.id}" style="cursor:pointer"><td>${esc(r.name)}</td><td class="num">${fPeople(A.popOf(r))}</td><td class="num">${(A.farmShare(r) * 100).toFixed(0)}%</td><td class="num">${r.cities.length}</td><td class="dim">${esc(r.era)}${r.polity ? '・' + esc(w.ancient.polities[r.polity].name) : ''}</td></tr>`).join('')}
      </table></div></div>`;
  }
  function geoMeter(label, v) { return `<div class="meter"><span>${label}</span><div class="bar"><i style="width:${U.clamp(v * 100, 0, 100)}%"></i></div><span class="num">${v.toFixed(2)}</span><span></span></div>`; }
  function ancientRegionTab() {
    const w = W(), A = AN(), T = WS.Data.ancientTechs, P = w.params.ancient;
    const id = aRegion(w), r = w.ancient.regions[id];
    const pop = A.popOf(r), pol = A.polityOf(w, r);
    const bands = Math.round(r.pop.F * 1e6 / P.pop.bandSize), villages = Math.round(r.pop.A * 1e6 / P.pop.villageSize);
    const known = Object.entries(r.tech).filter(([, st]) => st.done).sort((a, b) => (b[1].year ?? -1e9) - (a[1].year ?? -1e9));
    const res = Object.entries(r.tech).filter(([t, st]) => !st.done && st.p > 0).map(([t, st]) => [t, Math.min(0.99, st.p / A.techCost(r, T[t], st))]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const share = (k) => (pop > 0 ? (r.pop[k] / pop) * 100 : 0);
    const why = (m) => `<button class="why" style="position:static" data-act="why" data-c="${id}" data-m="${m}" data-s="10" aria-label="為什麼">?</button>`;
    const KIND = { land: '陸路', sea: '海路（需航海）', far: '遠方（極難往來）' };
    return `
      <div class="field"><select data-act="view-select" aria-label="選擇地區">${A.ids(w).map((x) => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(w.ancient.regions[x].name)}</option>`).join('')}</select></div>
      ${lifeCard()}
      <div class="card"><h3><span>${esc(r.name)}</span>${pol ? `<span class="tag gold">${esc(pol.name)}</span>` : ''}</h3>
        <div class="row"><span class="tag">${esc(r.era)}</span><span class="tag blue">交換方式：${esc(r.exchangeMode)}</span>${r.clim !== 1 ? `<span class="tag">氣候 ${(r.clim * 100).toFixed(0)}%</span>` : ''}</div>
        <div class="kpis" style="margin-top:10px">
          ${kpi('人口', fPeople(pop), null, 'population', id)}
          ${kpi('糧食安全', (r.fs * 100).toFixed(0) + '%', r.stock > 0 ? '儲糧 ' + (r.stock / Math.max(1e-9, pop) * 12).toFixed(1) + ' 月' : null, 'store', id)}
          ${kpi('務農比例', (A.farmShare(r) * 100).toFixed(0) + '%', null, 'farming', id)}
          ${kpi('交流程度', r.exchange.toFixed(0), null, 'exchange', id)}
        </div></div>
      <div class="grid g2">
        <div class="card"><h3>生活方式 ${why('population')}</h3>
          ${meter('狩獵採集', share('F'))}${meter('農民', share('A'))}${meter('城市', share('U'), 'urban', id)}
          <p class="dim">約 ${bands.toLocaleString()} 個遊獵群（每群約 ${P.pop.bandSize} 人）・約 ${villages.toLocaleString()} 個村落（每村約 ${P.pop.villageSize} 人）</p>
          <p>城市：${r.cities.length ? r.cities.map((c) => `${esc(c.name)}<span class="dim">（${esc(yl(c.founded))}）</span>`).join('、') : '<span class="dim">尚無</span>'}</p>
          ${r.cap ? `<p class="dim">野生食物約可養活 ${fPeople(r.cap.forage)}${r.cap.farm > 0 ? `・農地約可養活 ${fPeople(r.cap.farm)}（農耕經驗加成 +${(A.knowBonus(w, r) * 100).toFixed(0)}%）` : ''}</p>` : '<p class="dim">推進時間後會算出這裡的野生食物與農地可以養活多少人。</p>'}
        </div>
        <div class="card"><h3>地理條件</h3>
          ${geoMeter('野生食物', r.wild)}${geoMeter('可耕地', r.arable)}${geoMeter('河流水源', r.river)}${geoMeter('可馴化植物', r.plants)}${geoMeter('可馴化動物', r.animals)}
          ${geoMeter('銅礦', r.copper)}${geoMeter('錫礦', r.tin)}${geoMeter('鐵礦', r.iron)}${geoMeter('海岸', r.coast)}
          <p class="dim">地理是固定的；同樣的地理在不同世界線仍可能走出不同歷史。</p>
        </div>
        <div class="card"><h3>科技 <span class="dim" style="font-weight:400">研究點數每年約 ${(r.research || 0).toFixed(1)}</span></h3>
          ${res.length ? `<p>研究中：${res.map(([t, p]) => `${esc(T[t].name)}（${(p * 100).toFixed(0)}%）`).join('、')}</p>` : ''}
          <div>${known.slice(0, 14).map(([t, st]) => `<div class="meter"><span>${esc(T[t].name)}</span><div class="bar"><i style="width:${st.a * 100}%"></i></div><span class="num">${(st.a * 100).toFixed(0)}%</span><span></span></div>`).join('')}</div>
          <p class="dim">普及度：發明或引進後，還要時間才會普及。普及一半以上才能往下研究、傳給鄰居。</p>
        </div>
        <div class="card"><h3>鄰近地區</h3><ul class="list-plain">${r.links.map(([o, k]) => `<li><button class="link" data-act="view" data-v="${o}">${esc(w.ancient.regions[o].name)}</button><span class="dim">・${KIND[k]}・交流 ${w.ancient.regions[o].exchange.toFixed(0)}</span></li>`).join('')}</ul>
          <p class="dim">交流程度越高，鄰近的技術越快傳入，歉收時也越容易得到援助。</p></div>
      </div>`;
  }
  function ancientTechTab() {
    const w = W(), A = AN(), T = WS.Data.ancientTechs, ids = A.ids(w);
    const FN = WS.Data.ancientFields;
    return Object.keys(FN).map((f) => `<div class="card"><h3>${esc(FN[f])}</h3>${Object.values(T).filter((d) => d.field === f).map((d) => {
      const fi = w.ancient.firsts[d.id];
      const n = ids.filter((id) => A.knows(w, w.ancient.regions[id], d.id)).length;
      const req = d.req.concat(d.reqAny ? ['（' + d.reqAny.map((x) => T[x].name).join('或') + '）'] : []).map((x) => (T[x] ? T[x].name : x));
      return `<div class="policy"><div><b>${esc(d.name)}</b>${fi && fi.region ? ` <span class="tag gold">${esc(w.ancient.regions[fi.region].name)}・${esc(yl(fi.year))}</span>` : fi ? ' <span class="tag">起點前已有</span>' : ' <span class="tag">尚未出現</span>'}
        <small>${req.length ? '需要：' + esc(req.join('、')) + '・' : ''}${n} 個地區已掌握${d.ref ? '・史實參考：' + esc(d.ref) : ''}</small></div></div>`;
    }).join('')}</div>`).join('') + '<p class="dim">史實參考年代只用來對照，引擎不會照著發生。地理條件不足的地區不會自行發明，但可能經交流引進。</p>';
  }
  function ancientHistoryTab() {
    const w = W(), A = AN(), ids = A.ids(w);
    const M = { pop: '人口（百萬）', farm: '務農比例（%）', urban: '城市人口比例（%）', exchange: '交流程度', techs: '科技數' };
    const metric = M[S.aMetric] ? S.aMetric : 'pop';
    const labels = w.series.labels.map(yShort);
    const top = ids.slice().sort((a, b) => A.popOf(w.ancient.regions[b]) - A.popOf(w.ancient.regions[a])).slice(0, 8);
    const series = metric === 'pop' ? [{ name: '世界', color: '#e6ecff', data: w.series.world.pop, bold: true }] : [];
    for (const id of top) series.push({ name: w.ancient.regions[id].name, color: w.ancient.regions[id].color, data: w.series.c[id][metric] });
    let evs = w.events.slice().reverse();
    if (S.histFilter === 'major') evs = evs.filter((e) => e.level >= 3);
    else if (S.histFilter === 'focus') evs = evs.filter((e) => e.level >= 2);
    return `<div class="card"><h3>歷史數據</h3>
        <select data-act="a-metric" style="margin-bottom:8px">${Object.entries(M).map(([k, l]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${chart(labels, series, { label: M[metric], zero: metric !== 'pop' })}<p class="dim">只畫人口前 8 大的地區。</p></div>
      <div class="card"><h3>歷史回溯</h3><p class="dim">回到過去的快照建立新世界線，原本的歷史保留不變（每 500 年一次，存在本次開啟期間）。</p>
        <div class="row">${engine.snapshots.map((s, i) => `<button class="btn small" data-act="rewind" data-i="${i}">${esc(yShort(s.year))}</button>`).join('')}</div></div>
      <div class="card"><h3>事件時間線</h3>${seg2('hist-filter', S.histFilter, [['major', '世界大事'], ['focus', '重要'], ['all', '全部']])}
        <ul class="events" style="margin-top:10px">${evs.slice(0, 150).map(aEventItem).join('') || '<li class="dim">尚無事件</li>'}</ul></div>`;
  }
  function ancientExplainTab() {
    const w = W(), A = AN();
    const id = aRegion(w);
    const qs = WS.Explain.ancientQuestions(w, id);
    return `<div class="field"><select data-act="view-select" aria-label="選擇地區">${A.ids(w).map((x) => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(w.ancient.regions[x].name)}</option>`).join('')}</select></div>
      <div class="card"><h3>世界解釋系統・${esc(w.ancient.regions[id].name)}</h3>
        <p class="dim">答案全部取自實際模擬紀錄與引擎條件，不是事先寫好的劇情。</p>
        ${qs.map((q, i) => `<details class="qa" ${i === 0 ? 'open' : ''}><summary>${esc(q.q)}</summary><div>${esc(q.a)}
          ${q.metric ? `<p><button class="link" data-act="why" data-c="${id}" data-m="${q.metric}" data-s="${q.scope}">展開完整原因 ›</button></p>` : ''}
          ${q.eventId ? `<p><button class="link" data-act="event" data-id="${q.eventId}">查看事件 ›</button></p>` : ''}</div></details>`).join('')}
      </div>
      <div class="card"><h3>查詢任一指標</h3><div class="row">${Object.entries(WS.Explain.ANCIENT_METRICS).map(([m, n]) => `<button class="btn small" data-act="why" data-c="${id}" data-m="${m}" data-s="10">${n}</button>`).join('')}</div></div>`;
  }
  function ancientSystemTab() {
    const w = W(), saves = WS.Save.list();
    return `<div class="card"><h3>存檔</h3>
        <div class="row"><input type="text" id="save-name" value="${esc(w.name + '・' + w.branch.name + '・' + yShort(w.year))}" style="flex:1;min-width:180px"><button class="btn" data-act="save">儲存</button></div>
        <div id="save-usage" style="margin-top:8px"><p class="dim" style="margin:0">計算存檔空間中…</p></div>${(setTimeout(fillSaveUsage, 0), '')}
        <div class="row" style="margin-top:8px"><button class="btn small" data-act="export">備份存檔</button><label class="btn small" style="display:inline-flex;align-items:center">讀取備份<input type="file" id="import" accept="application/json,.json" hidden></label><button class="btn small" data-act="home">回到開始畫面</button></div>
        <p class="dim" style="margin:6px 0 0">「備份存檔」會把這個世界存成一個檔案放到你的裝置上；換手機、清除瀏覽器資料之前，或想把世界分享給朋友時使用。「讀取備份」選那個檔案就能回到這個世界。</p>
        <div style="margin-top:10px">${saves.map((s) => `<div class="policy"><div>${esc(s.name)}${s.auto ? ' <span class="tag">自動保存</span>' : ''}<small>${esc(s.branch)}・${s.year <= 0 ? esc(yl(s.year)) : s.year + '.' + s.month}・${new Date(s.saved).toLocaleString()}${s.bytes ? '・' + WS.Save.mb(s.bytes) : ''}</small></div>
          <div class="row"><button class="btn small" data-act="load" data-id="${s.id}">載入</button><button class="btn small" data-act="del-save" data-id="${s.id}">刪除</button></div></div>`).join('') || '<p class="dim">沒有存檔。</p>'}</div></div>
      ${bridgeCard()}
      <div class="card"><h3>介面</h3>${langSetting()}${themeSetting()}</div>
      ${helpCard()}
      <details class="card dev-info"><summary>開發者資訊（一般玩家不需要看）</summary><p class="dim">世界 ID：${esc(w.world_id)}・種子：${esc(w.seed)}・模擬版本 ${esc(w.simulation_version)}・已檢查 ${w.validation.checks} 期，發現 ${w.validation.issues.length} 個數值問題。</p>
</details>`;
  }

  function ancientWhatifReport() {
    const { res, parentName } = S.whatif;
    const R = res.report;
    const pct = (a, b) => (a ? sg(((b - a) / a) * 100, 0) + '%' : '—');
    const Wo = R.world.orig, Wa = R.world.alt;
    const cell = (a, b, f, rel) => `<td class="num">${f(a)}</td><td class="num">${f(b)}</td><td class="num ${cls(b - a)}">${rel ? pct(a, b) : sg(b - a, 0)}</td>`;
    const FN = { city: '第一座城市', polity: '第一個政體', citystate: '第一個城邦', kingdom: '第一個王國', empire: '第一個帝國' };
    const fname = (k) => FN[k] || (WS.Data.ancientTechs[k] ? WS.Data.ancientTechs[k].name : k);
    const w = W(), rn = (id) => (w.ancient.regions[id] ? w.ancient.regions[id].name : id);
    const fv = (f) => (f ? `${esc(rn(f.region))}・${esc(yl(f.year))}` : '<span class="dim">尚未出現</span>');
    const top = R.rows.filter((r) => r.score > 0.02).slice(0, 6);
    const reason = R.reasons[R.focus] && R.reasons[R.focus].population;
    const chain = R.chain.map((c, i) => `<li class="wi-step ${c.kind}">
        <div class="when">${esc(yl(c.y))}・<span>${{ start: '分岔點', gone: '原世界有，平行世界沒有', new: '只在平行世界發生' }[c.kind]}</span></div>
        <b>${esc(c.title)}</b>${c.why && c.why.length ? `<div class="dim">${c.kind === 'gone' ? '原世界的原因' : '原因'}：${c.why.map(esc).join('；')}</div>` : ''}
      </li>${i < R.chain.length - 1 ? '<li class="wi-arrow" aria-hidden="true">↓</li>' : ''}`).join('');
    const evList = (list) => list.slice(0, 30).map((e) => `<li><span class="dim">${esc(yl(e.y))}</span> ${esc(e.title)}</li>`).join('') || '<li class="dim">沒有</li>';
    openModal(`<h2>平行世界：${esc(R.label)}</h2>
      <p class="dim">分岔於${esc(yl(R.y))}。從${esc(R.from)}用同一個種子重跑 ${R.years.toLocaleString()} 年到${esc(yl(R.now.y))}，只有這一件事不同，其他全部由引擎計算。</p>
      ${R.applied ? '' : '<p class="bad">注意：重跑時沒有遇到這個事件，兩個世界沒有分岔。</p>'}
      ${wiSummaryHtml(R, true)}
      <div class="table-wrap"><table class="wi-table">
        <tr><th></th><th>原世界<br><small>${esc(parentName)}</small></th><th>平行世界</th><th>差距</th></tr>
        <tr><td>世界人口</td>${cell(Wo.pop, Wa.pop, fPeople, true)}</tr>
        <tr><td>務農地區</td>${cell(Wo.farming, Wa.farming, (v) => v + ' 個')}</tr>
        <tr><td>城市</td>${cell(Wo.cities, Wa.cities, (v) => v + ' 座')}</tr>
        <tr><td>國家（城邦以上）</td>${cell(Wo.states, Wa.states, (v) => v + ' 個')}</tr>
        <tr><td>有文字的地區</td>${cell(Wo.writing, Wa.writing, (v) => v + ' 個')}</tr>
      </table></div>
      ${R.firsts.length ? `<h3 class="wi-h">世界第一次：改變了什麼</h3><div class="table-wrap"><table><tr><th></th><th>原世界</th><th>平行世界</th></tr>${R.firsts.slice(0, 12).map((f) => `<tr><td>${esc(fname(f.key))}</td><td>${fv(f.orig)}</td><td>${fv(f.alt)}</td></tr>`).join('')}</table></div>` : ''}
      <h3 class="wi-h">蝴蝶效應：差異怎麼擴散</h3>
      <ul class="events wi-chain">${chain}</ul>
      ${top.length ? `<h3 class="wi-h">差最多的地區</h3><div class="table-wrap"><table><tr><th>地區</th><th>人口</th><th>城市</th><th>政體（原→平行）</th></tr>${top.map((r) => `<tr><td>${esc(r.name)}</td><td class="num ${cls(r.alt.pop - r.orig.pop)}">${pct(r.orig.pop, r.alt.pop)}</td><td class="num">${r.orig.cities} → ${r.alt.cities}</td><td>${r.orig.polity === r.alt.polity ? esc(r.orig.polity) : `<span class="gold">${esc(r.orig.polity)} → ${esc(r.alt.polity)}</span>`}</td></tr>`).join('')}</table></div>` : ''}
      ${reason && reason.length ? `<h3 class="wi-h">為什麼${esc(R.rows[0].name)}人口差這麼多（因果帳，分岔後累計，百萬人）</h3><ul class="list-plain">${reason.map((f) => `<li>${esc(f.factor)}：原世界 ${sg(f.orig, 2)}／平行世界 ${sg(f.alt, 2)}</li>`).join('')}</ul>` : ''}
      <details class="qa"><summary>只在原世界發生（${R.onlyOrig.length}）</summary><ul class="list-plain">${evList(R.onlyOrig)}</ul></details>
      <details class="qa"><summary>只在平行世界發生（${R.onlyAlt.length}）</summary><ul class="list-plain">${evList(R.onlyAlt)}</ul></details>
      ${R.failed.length ? `<p class="dim">你原本的 ${R.failed.length} 次干預在平行世界無法執行：${R.failed.map((f) => `${esc(yl(f.y))} ${esc(f.text)}（${esc(f.reason)}）`).join('；')}</p>` : ''}
      <div class="row" style="margin-top:14px">
        <button class="btn primary" data-act="whatif-enter">進入平行世界</button>
        <button class="btn" data-act="close-modal">留在原世界</button>
      </div>`);
  }

  function ancientDivineCard() {
    const w = W(), D = w.divine || { energy: 0, log: [] }, p = WS.Divine.params(w);
    const recent = (D.log || []).slice(-3).reverse();
    return `<div class="card divine"><h3>神之手 ${(D.log || []).length ? '<button class="link" data-act="divine-log">全部紀錄</button>' : ''}</h3>
      <div class="energy"><span>神力</span><div class="bar"><i style="width:${(D.energy / p.energyMax) * 100}%"></i></div><span class="num">${Math.floor(D.energy)}／${p.energyMax}</span></div>
      <p class="dim" style="margin:6px 0 10px">每 100 年恢復 ${p.energyRegenPerCentury}。你只能改變條件（天候、靈感），世界會怎麼反應由引擎決定，結果不保證。</p>
      <div class="divine-btns">${Object.entries(WS.Divine.ANCIENT_KINDS).map(([k, d]) => {
        const cost = WS.Divine.cost(w, k);
        return `<button class="btn small" data-act="divine-open" data-v="${k}" ${D.energy < cost ? 'disabled' : ''}><b>${d.icon}</b> ${esc(d.name)}<small class="num">${cost}</small></button>`;
      }).join('')}</div>
      ${recent.length ? `<ul class="events" style="margin-top:10px">${recent.map((g) => `<li data-act="event" data-id="${g.eventId}" class="${g.done ? '' : 'l3'}"><div class="when">${esc(yl(g.y))}・${g.done ? '已結束' : '進行中'}</div>${esc(g.label)}<div class="dim" style="font-size:12px">${esc(g.status)}</div></li>`).join('')}</ul>` : ''}</div>`;
  }
  function ancientDivineModal() {
    const w = W(), A = AN(), st = S.divine;
    const ids = A.ids(w);
    if (!WS.Divine.ANCIENT_KINDS[st.kind]) st.kind = 'bounty';
    if (!w.ancient.regions[st.cid]) st.cid = aRegion(w);
    const r = w.ancient.regions[st.cid];
    let optHtml = '';
    if (st.kind === 'inspire') {
      const list = WS.Divine.ancientTechOptions(w, r);
      if (!st.opt || !list.includes(st.opt)) st.opt = list[0] || null;
      optHtml = list.length ? `<div class="field"><label>要啟發的技術（前置技術已普及、地理條件允許）</label><select data-act="divine-opt-select">${list.map((t) => `<option value="${t}" ${t === st.opt ? 'selected' : ''}>${esc(WS.Data.ancientTechs[t].name)}${w.ancient.firsts[t] && w.ancient.firsts[t].region ? '' : '（世界上還沒有）'}</option>`).join('')}</select></div>` : '';
    } else st.opt = null;
    const pv = engine.divinePreview(st.kind, st.cid, st.opt || undefined);
    openModal(`<h2>神之手</h2>
      <div class="seg" style="flex-wrap:wrap;margin-bottom:10px">${Object.entries(WS.Divine.ANCIENT_KINDS).map(([k, d]) => `<button data-act="divine-kind" data-v="${k}" class="${st.kind === k ? 'on' : ''}">${d.icon} ${esc(d.name)}</button>`).join('')}</div>
      <p class="dim">${esc(WS.Divine.ANCIENT_KINDS[st.kind].short)}。耗費神力 <b class="gold">${pv.cost}</b>（目前 ${Math.floor(pv.energy)}）。</p>
      <div class="field"><label>對象地區</label><select data-act="divine-target">${ids.map((id) => `<option value="${id}" ${id === st.cid ? 'selected' : ''}>${esc(w.ancient.regions[id].name)}</option>`).join('')}</select></div>
      <p class="dim">${esc(r.era)}・人口 ${fPeople(A.popOf(r))}・糧食安全 ${(r.fs * 100).toFixed(0)}%</p>
      ${optHtml}
      <h3 class="dv-h">條件</h3><ul class="list-plain">${pv.checks.map(([ok, t]) => `<li class="${ok ? 'good' : 'bad'}">${ok ? '✔' : '✘'} ${esc(t)}</li>`).join('')}</ul>
      ${pv.info && pv.info.length ? `<h3 class="dv-h">會改變什麼</h3><ul class="list-plain">${pv.info.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${pv.risk && pv.risk.length ? `<h3 class="dv-h">為什麼結果不保證</h3><ul class="list-plain">${pv.risk.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn gold" data-act="divine-cast" ${pv.ok ? '' : 'disabled'}>施展（神力 −${pv.cost}）</button><button class="btn" data-act="close-modal">取消</button></div>
      <p class="dim" style="margin-top:8px">施展會記錄在指令紀錄裡；「如果？」平行世界重跑時，也會在同一個時間重播這次干預。</p>`);
  }

  function bridgeCard() {
    const w = W(), av = WS.EraBridge.available(w);
    if (!av.ok) return `<div class="card"><h3>接到近代</h3><p class="dim">${esc(av.reason)}。到時候可以把這條世界線的政體轉成近代國家，改用近代引擎（每月計算人口、經濟、政治、科技、外交、戰爭）繼續演進。</p></div>`;
    const n = WS.EraBridge.groups(w).length;
    return `<div class="card divine"><h3>進入近代</h3><p>這條世界線已經走到${esc(yl(w.year))}。可以轉成 ${n} 個近代國家（大政體只帶走實際治理得到的人口，其餘地方成為以當地城市命名的小國或部族），改用近代引擎繼續演進。</p>
      <p class="dim">國家、國界、人口都來自這條世界線，不照真實歷史；GDP、教育等近代數值依遠古的實際狀態換算（示意值）。近代科技從零開始。遠古世界會先存檔，不會被改動。</p>
      <button class="btn gold" data-act="to-modern">進入近代（${w.year} 年起）</button></div>`;
  }
  // 只問一次（每條世界線）
  function bridgeDue() {
    if (!isAnc() || !WS.EraBridge.available(W()).ok) return false;
    const k = W().world_id + '/' + W().branch.id;
    S.bridgeAsked = S.bridgeAsked || {};
    if (S.bridgeAsked[k]) return false;
    S.bridgeAsked[k] = true;
    return true;
  }
  function bridgeModal() {
    openModal(`<h2>世界走到了近代的門檻</h2>${bridgeCard().replace(/^<div class="card divine"><h3>進入近代<\/h3>/, '').replace(/<\/div>$/, '')}<div class="row" style="margin-top:8px"><button class="btn" data-act="close-modal">先留在遠古，繼續看</button></div>`);
  }
  function toModern() {
    stopAuto(); S.resumeAuto = false;
    const prev = W();
    const saving = saveParent(prev, prev.name + '・' + prev.branch.name + '・' + prev.year + '（遠古）');
    const res = engine.toModern();
    if (!res.ok) { toast(res.reason); return; }
    S.screen = 'game'; S.tab = 'overview'; S.view = null; S.compare = null; S.speed = 'decade';
    autosave();
    closeModal(); render(); window.scrollTo(0, 0);
    toast('現在進入近代（遠古世界存檔中…）'); void saving;
  }
  function renderAncientGame() {
    const w = W();
    const running = !!S.auto;
    const tab = { overview: ancientOverview, country: ancientRegionTab, world: ancientTechTab, history: ancientHistoryTab, explain: ancientExplainTab, system: ancientSystemTab }[S.tab] || ancientOverview;
    app.innerHTML = `
      <div class="topbar">
        <div class="topbar-row">
          <div class="sys-id"><i></i>TERRA-0</div>
          <div class="date num">${esc(yl(w.year))}<small>${esc(w.branch.name)}・每期 ${AN().dtFor(w)} 年</small></div>
          <span class="spacer"></span>
        </div>
        <div class="controls">
          ${Object.entries(A_SPEEDS).map(([k, [, l]]) => `<button class="btn small ${S.aSpeed === k ? 'on' : ''}" data-act="a-advance" data-v="${k}" ${running ? 'disabled' : ''}>＋${l}</button>`).join('')}
          <button class="btn small run" data-act="auto">${running ? '⏸ 暫停' : '▶ 自動'}</button>
        </div>
      </div>
      <div class="content">${tab()}</div>
      <nav class="nav"><div class="nav-inner">
        ${[['overview', '◉', '總覽'], ['country', '⛰', '地區'], ['world', '✦', '科技'], ['history', '⟲', '歷史'], ['explain', '？', '為什麼'], ['system', '⚙', '系統']]
          .map(([k, ic, l]) => `<button data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${l}</button>`).join('')}
      </div></nav>`;
  }
  function startAncient(seed) {
    stopAuto();
    engine.create({ scenario: 'bc10000', seed: seed || '' });
    S.screen = 'game'; S.tab = 'overview'; S.view = null; S.compare = null; S.aSpeed = 'c5'; S.histFilter = 'major';
    autosave();
    render(); window.scrollTo(0, 0);
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
    autosave();
    render(); window.scrollTo(0, 0);
  }

  function doAdvance(months) {
    if (ended()) { endingModal(); return { stopped: true, ended: true }; }
    const res = engine.advance(months);
    autosave();
    render();
    if (res.ended) { stopAuto(); endingModal(); return res; }
    if (res.stopped) { stopAuto(); decisionModal(res.events); }
    return res;
  }
  // 每年一月：用一行通知告訴玩家去年的頭條與摘要（不暫停）
  function yearToast() {
    const w = W();
    const Y = WS.Headlines.summary(w, w.year - 1);
    if (!Y.headlines.length) return;
    toast(`📰 ${Y.year} 年頭條：${Y.headlines[0].title}${Y.headlines.length > 1 ? ` 等 ${Y.headlines.length} 則` : ''}；其他 ${Y.total} 件事收進年度摘要`);
  }
  function stopAuto() { if (S.auto) { clearInterval(S.auto); S.auto = null; } }
  function toggleAuto() {
    if (S.auto) { stopAuto(); autosave(); render(); return; }
    if (ended()) { endingModal(); return; }
    S.auto = setInterval(() => {
      const res = engine.advance(1);
      if (W().month === 1 && (!isAnc() || W().tick % 40 === 0)) autosave(true);
      if (res.ended) { stopAuto(); autosave(); render(); endingModal(); return; }
      if (W().month === 1 && !isAnc()) yearToast();
      // 自動播放遇到重大事件：先暫停讓玩家選擇，選完（關掉視窗）後自動繼續
      if (res.stopped) { stopAuto(); S.resumeAuto = true; render(); decisionModal(res.events); return; }
      // 遠古世界走到近代門檻：暫停，問玩家要不要進入近代（只問一次）
      if (bridgeDue()) { stopAuto(); render(); bridgeModal(); return; }
      if (modal.hidden) render();
    }, 160);
    render();
  }

  function switchWorld(w2, msg) {
    stopAuto(); S.resumeAuto = false;
    engine.load(w2);
    S.screen = 'game'; S.compare = null; S.speed = W().speed || 'decade';
    autosave();
    closeModal(); render(); if (msg) toast(msg);
  }
  // 自動存檔（「繼續遊戲」）：失敗時提醒一次，並在系統頁顯示原因
  function autosave(soft) {
    // 自動播放中：大世界每次存檔要花一點時間，最多每 15 秒存一次（停下來、換世界時一定會存）
    if (soft && Date.now() - (S.lastAutoAt || 0) < 15000) return;
    S.lastAutoAt = Date.now();
    const p = WS.Save.autosave(W());
    if (p && p.then) p.then((r) => {
      if (r && r.ok === false && !S.autoWarned) { S.autoWarned = true; toast('自動存檔失敗：' + r.reason, 6000); }
      if (r && r.ok) S.autoWarned = false;
    });
  }
  // 匯出：產生 JSON 檔讓瀏覽器下載，並清楚告訴玩家成功或失敗
  function exportWorld() {
    const name = `world-${W().branch.name}-${W().year}.json`.replace(/[\\/:*?"<>|\s]+/g, '_');
    let json;
    try { json = engine.serialize(); } catch (e) { openModal(`<h2>備份失敗</h2><p>無法產生存檔資料：${esc(e.message)}</p>`); return; }
    try {
      if (S.exportUrl) URL.revokeObjectURL(S.exportUrl);
      S.exportUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const el = document.createElement('a');
      el.href = S.exportUrl; el.download = name; document.body.appendChild(el); el.click(); el.remove();
    } catch (e) {
      openModal(`<h2>備份失敗</h2><p>瀏覽器不允許下載檔案（${esc(e.message)}）。可以換一個瀏覽器（例如 Chrome、Safari）再試一次。</p>`);
      return;
    }
    openModal(`<h2>備份完成</h2>
      <p>已產生檔案 <b>${esc(name)}</b>（${WS.Save.mb(json.length)}），瀏覽器應該已經開始下載。</p>
      <p class="dim">電腦通常在「下載」資料夾；手機可能在「檔案」App 的下載項目。之後到「系統 → 讀取備份」選這個檔案，就能回到這個世界（包含分支、「如果？」與完整紀錄）。</p>
      <div class="row"><a class="btn primary" href="${S.exportUrl}" download="${esc(name)}">沒看到下載？再下載一次</a><button class="btn" data-act="close-modal">關閉</button></div>`);
  }
  // 系統頁：存檔空間使用量（非同步填入）
  function fillSaveUsage() {
    const el = document.getElementById('save-usage');
    if (!el) return;
    let cur = 0;
    try { cur = engine.serialize().length; } catch (e) { /* 略過 */ }
    WS.Save.usage().then((u) => {
      const el2 = document.getElementById('save-usage');
      if (!el2) return;
      const mb = WS.Save.mb;
      const la = WS.Save.lastAuto;
      el2.innerHTML = `<p class="dim" style="margin:0 0 4px">目前這個世界約 <b class="num">${mb(cur)}</b>。已存：手動存檔 ${u.count - u.autoCount} 個（${mb(u.saves)}）、自動保存 ${u.autoCount} 個（${mb(u.autoSaves)}，最多保留 ${WS.Save.keepAuto} 個，越舊的越先清掉）、「繼續遊戲」${mb(u.autosave)}。</p>
        ${u.quota ? `<div class="meter"><span>儲存空間</span><div class="bar"><i style="width:${Math.min(100, (u.used / u.quota) * 100).toFixed(1)}%"></i></div><span class="num">${mb(u.used || 0)}／${mb(u.quota)}</span></div>` : ''}
        ${u.backend === 'local' ? '<p class="gold" style="margin:4px 0 0">這個瀏覽器只能用較小的儲存空間（約 5 MB），玩到後期的大世界可能存不下；建議定期按「備份存檔」保存到裝置。</p>' : ''}
        ${la && la.ok === false ? `<p class="bad" style="margin:4px 0 0">最近一次自動存檔失敗：${esc(la.reason)}</p>` : la && la.compact ? '<p class="dim" style="margin:4px 0 0">最近一次自動存檔空間不足，改存精簡版（只留最近 5 年的詳細原因，模擬結果不變）。</p>' : ''}
        ${u.autoCount ? `<button class="btn small" data-act="clear-auto" style="margin-top:6px">清除全部自動保存（${u.autoCount} 個）</button>` : ''}`;
    }).catch(() => { el.textContent = ''; });
  }
  // 進入新世界線前，把原世界線存成「自動保存」：先開始寫入（內容在這一刻固定），寫完再告訴玩家結果
  function saveParent(parent, name) {
    return WS.Save.write(parent, name, { auto: true }).then((r) => {
      if (r.ok) toast(`原世界線已存檔（${WS.Save.mb(r.bytes)}${r.compact ? '，精簡版' : ''}）${r.pruned && r.pruned.length ? `；為了騰出空間，清掉了 ${r.pruned.length} 個最舊的自動保存` : ''}`, 4500);
      else toast('原世界線未能存檔：' + r.reason, 8000);
      return r;
    });
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t) { if (ev.target === modal) closeModal(); return; }
    const a = t.dataset.act, v = t.dataset.v;
    switch (a) {
      case 'close-modal': closeModal(); break;
      case 'intro': case 'feedback': S.resumeAuto = false; if (S.auto) { stopAuto(); render(); } if (a === 'intro') introModal(); else feedbackModal(); break;
      case 'fb-type': if (S.fb) S.fb.type = v; t.parentNode.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === t); b.setAttribute('aria-pressed', b === t); }); break;
      case 'fb-send': feedbackSend(t); break;
      case 'support': S.resumeAuto = false; if (S.auto) { stopAuto(); render(); } supportModal(); break;
      case 'home': stopAuto(); S.screen = 'start'; render(); break;
      case 'new-world': S.setup = newSetup('country'); S.nl = ''; S.nlResult = null; S.screen = 'setup'; render(); break;
      case 'custom-world': S.setup = Object.assign(newSetup('global'), { depth: 'custom', civil: 'custom' }); S.screen = 'setup'; render(); break;
      case 'continue': WS.Save.readAutosave().then((w2) => { if (!w2) { toast('找不到自動存檔'); return; } engine.load(w2); S.screen = 'game'; S.speed = W().speed || 'decade'; render(); }).catch((e) => toast('自動存檔無法讀取：' + e.message)); break;
      case 'load-menu': openModal(`<h2>載入存檔</h2>${WS.Save.list().map((s) => `<div class="policy"><div>${esc(s.name)}<small>${esc(s.branch)}・${s.year}.${s.month}${s.bytes ? '・' + WS.Save.mb(s.bytes) : ''}${s.auto ? '・自動保存' : ''}</small></div><button class="btn small" data-act="load" data-id="${s.id}">載入</button></div>`).join('')}`); break;
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
      case 'to-modern': toModern(); break;
      case 'ancient': startAncient('遠古-' + Date.now().toString(36)); toast('《人類的黎明》：每條世界線都不一樣（種子已記錄在「系統」頁的開發者資訊）'); break;
      case 'a-advance': {
        S.aSpeed = v;
        // 第一次走到近代門檻時停在門檻上，讓玩家決定要不要進入近代
        const by = W().params.ancient.bridge.year, y0 = W().year;
        engine.advanceYears(y0 < by ? Math.min(A_SPEEDS[v][0], by - y0) : A_SPEEDS[v][0]); autosave(); render(); if (bridgeDue()) bridgeModal(); break; }
      case 'tab': S.tab = v; closeModal(); render(); window.scrollTo(0, 0); break;
      case 'mode': engine.setMode(v); render(); toast(v === 'global' ? '切換為全球模式（世界狀態不變）' : '切換為國家模式'); break;
      case 'view': S.view = v; render(); break;
      case 'wc-mode': if (cam) { cam.mode = v; t.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); } break;
      case 'map-view': S.mapView = v; render(); break;
      case 'map-zoom': S.mapZoom = v || null; render(); break;
      case 'open-country': S.view = t.dataset.id; S.tab = 'country'; render(); window.scrollTo(0, 0); break;
      case 'why': whyModal(t.dataset.c, t.dataset.m, t.dataset.s); break;
      case 'why-rel': relModal(t.dataset.a, t.dataset.b); break;
      case 'event': eventModal(t.dataset.id); break;
      case 'whatif': S.resumeAuto = false; whatifModal(t.dataset.id); break;
      case 'warcam': S.resumeAuto = false; warCamModal(t.dataset.id); break;
      case 'stay-paused': S.resumeAuto = false; closeModal(); break;
      case 'whatif-run': whatifRun(t.dataset.id, t.dataset.k); break;
      case 'whatif-show': if (S.whatif) whatifReport(); break;
      case 'headlines-all': headlinesModal(); break;
      case 'summary-all': summaryModal(+v); break;
      case 'lang': setLanguage(v); break;
      case 'ui-theme': S.uiTheme = WS.EraTheme.THEMES[v] ? v : 'auto'; WS.EraTheme.setPref(S.uiTheme); render(); toast('介面風格：' + (S.uiTheme === 'auto' ? '跟著時代' : WS.EraTheme.THEMES[v].name)); break;
      case 'pause-mode': setPauseMode(v); if (modal.hidden) render(); else { const box = modalBody.querySelector('.pause-pick'); if (box) box.innerHTML = pauseSetting(true); } toast('事件介入方式：' + WS.Events.PAUSE_MODES[v].name); break;
      case 'divine-open': S.divine = { kind: v || 'health', cid: t.dataset.c || (S.divine && S.divine.cid) || (W().mode === 'country' ? W().focus : U.ids(W())[0]), opt: null }; stopAuto(); divineModal(); break;
      case 'divine-kind': S.divine.kind = v; S.divine.opt = null; divineModal(); break;
      case 'divine-opt': S.divine.opt = v; divineModal(); break;
      case 'divine-cast': divineCast(); break;
      case 'divine-log': divineLogModal(); break;
      case 'ending': endingModal(); break;
      case 'future-info': futureModal(); break;
      case 'cf-run': cfRun(); break;
      case 'wi-metric': S.wiMetric = v; whatifReport(); break;
      case 'whatif-chart': {
        if (!whatifValid()) break;
        S.compare = { name: '平行世界：' + S.whatif.res.report.label, series: S.whatif.res.world.series };
        S.tab = 'history'; closeModal(); render(); window.scrollTo(0, 0); toast('虛線＝平行世界'); break;
      }
      case 'whatif-enter': {
        if (!whatifValid()) break;
        const parent = W();
        const { res } = S.whatif;
        saveParent(parent, parent.name + '・' + parent.branch.name + '・' + parent.year);
        const cmp = { name: '原世界：' + parent.branch.name, series: parent.series };
        switchWorld(res.world, '現在進入平行世界（原世界存檔中…）');
        engine.snapshots = res.snapshots;
        S.compare = cmp; S.whatif = null; render(); break;
      }
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
      case 'goto-rules': S.resumeAuto = false; closeModal(); engine.setMode('global'); S.tab = 'world'; render(); break;
      case 'chart-metric': break;
      case 'branch-now':
        openModal(`<h2>建立新的世界線</h2><p class="dim">原世界線會先自動存檔，之後你在新分支做的任何改變都不會影響它。</p>
          <div class="field"><label for="branch-name">分支名稱</label><input type="text" id="branch-name" value="分支 ${W().year}"></div>
          <button class="btn primary" data-act="branch-confirm">建立並進入新分支</button>`);
        break;
      case 'branch-confirm': {
        const name = (document.getElementById('branch-name').value || '').trim() || '分支 ' + W().year;
        const parent = W();
        saveParent(parent, parent.name + '・' + parent.branch.name + '・' + parent.year + '（分歧點）');
        const nw = engine.createBranch(name, '玩家在 ' + parent.year + ' 年建立分支');
        const keep = engine.snapshots;
        switchWorld(nw, '現在進入新分支「' + name + '」（原世界線存檔中…）');
        engine.snapshots = keep; render();
        break;
      }
      case 'rewind': {
        const snap = engine.snapshots[+t.dataset.i];
        const parent = W();
        saveParent(parent, parent.name + '・' + parent.branch.name + '・' + parent.year);
        const yt = isAnc() ? yl(snap.year) : snap.year + ' 年';
        const nw = engine.branchFromSnapshot(+t.dataset.i, '回溯 ' + (isAnc() ? yShort(snap.year) : snap.year), '歷史回溯至 ' + yt);
        const snaps = engine.snapshots.filter((s) => s.year <= snap.year);
        switchWorld(nw, `已回到${yt}的新分支（原世界線存檔中…）`);
        engine.snapshots = snaps.map((s) => s);
        render(); break;
      }
      case 'compare': {
        WS.Save.read(t.dataset.id).then((other) => { if (other) { S.compare = { name: other.branch.name + '・' + other.year, series: other.series }; render(); toast('已加入比較（虛線）'); } else toast('讀不到這個存檔'); }).catch((e) => toast('讀取失敗：' + e.message));
        break;
      }
      case 'compare-clear': S.compare = null; render(); break;
      case 'save': {
        toast('儲存中…');
        WS.Save.write(W(), document.getElementById('save-name').value).then((r) => {
          if (r.ok) toast(`已儲存（${WS.Save.mb(r.bytes)}${r.compact ? '，空間不足改存精簡版：只留最近 5 年的詳細原因' : ''}）${r.pruned && r.pruned.length ? `；清掉了 ${r.pruned.length} 個最舊的自動保存` : ''}`, 4500);
          else openModal(`<h2>存檔失敗</h2><p>${esc(r.reason)}</p><div class="row"><button class="btn primary" data-act="export">備份存檔到裝置</button><button class="btn" data-act="close-modal">關閉</button></div>`);
          render();
        });
        break;
      }
      case 'load': WS.Save.read(t.dataset.id).then((w2) => { if (w2) switchWorld(w2, '已載入'); else toast('讀不到這個存檔'); }).catch((e) => toast('載入失敗：' + e.message)); break;
      case 'del-save': openModal(`<h2>刪除這個存檔？</h2><p class="dim">刪除後無法復原。</p><div class="row"><button class="btn" data-act="del-save-yes" data-id="${esc(t.dataset.id)}">刪除</button><button class="btn" data-act="close-modal">取消</button></div>`); break;
      case 'del-save-yes': WS.Save.remove(t.dataset.id).then(() => { closeModal(); render(); toast('已刪除'); }); break;
      case 'clear-auto': WS.Save.clearAuto().then((n) => { render(); toast(n ? `已清除 ${n} 個自動保存` : '沒有自動保存'); }); break;
      case 'export': exportWorld(); break;
      case 'depth-live': engine.setDifficulty(v); render(); break;
      case 'intervention-live': engine.setIntervention(v); render(); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.act === 'set-select') { S.setup[t.dataset.k] = t.value; renderSetup(); }
    if (t.dataset.act === 'focus') { engine.setFocus(t.value); S.view = null; render(); }
    if (t.dataset.act === 'lang-select') { setLanguage(t.value); return; }
    if (t.dataset.act === 'view-select') { S.view = t.value; render(); }
    if (t.dataset.act === 'chart-metric') { S.chartMetric = t.value; render(); }
    if (t.dataset.act === 'a-metric') { S.aMetric = t.value; render(); }
    if (t.dataset.act === 'divine-target') { S.divine.cid = t.value; S.divine.opt = null; divineModal(); }
    if (t.dataset.act === 'divine-opt-select') { S.divine.opt = t.value; divineModal(); }
    if (t.dataset.param) { const v = parseFloat(t.value); if (isFinite(v)) { engine.setParam(t.dataset.param, v); toast('參數已更新'); } }
    if (t.id === 'import' && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => { try { switchWorld(WS.Save.migrate(fr.result), '已讀取備份'); } catch (e) { toast('讀取備份失敗：' + e.message); } };
      fr.readAsText(t.files[0]);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // 給檢查工具（tools/i18n-ui-check.js）用：直接載入一個世界。和玩家按「載入存檔」走同一條路，不改模擬
  WS.App = { load: (w2) => switchWorld(w2, ''), world: () => W() };
  render();
  // 存檔改放大容量的 IndexedDB：啟動時把舊版放在 localStorage 的存檔搬過去（騰出空間），搬完重畫開始畫面
  WS.Save.init().then(() => { if (S.screen === 'start') render(); }).catch(() => { /* 無法使用時維持原狀 */ });
})();
