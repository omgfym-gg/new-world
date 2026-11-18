// 地區生活畫面（介面裝飾，只畫圖，不讀寫任何模擬數值）。
// 點地球上的地區或國家時，畫出「這裡的人現在正在做什麼」：
//   狩獵採集、放牧、種田、住在城市、工廠做工、打仗、鬧饑荒、示威……
// 畫面裡每一樣東西的多寡都來自 app.js 從引擎讀出的資料（lifeData）：
//   三塊區域（荒野／農田／城市）的寬度 ← 狩獵採集、農民、城市人口的比例（近代：農業、工業、服務業就業比例）；
//   弓箭、陶器、犁、灌溉、車輪、金屬、帆船、拖拉機、汽車、火車、飛機 ← 該地已普及的科技；
//   乾枯的田、禿鷹 ← 糧食安全；戰鬥 ← 最近的戰爭紀錄；示威 ← 政治穩定度；煙霧 ← 污染。
// 畫面是電腦依數據畫出來的動畫，不是真實影像。細節用固定種子的偽亂數，不使用 Math.random。
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const LW = 480, LH = 270, HOR = 150;
  function prng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
  function rgb(hex) { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : [200, 200, 200]; }
  function css(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a == null ? 1 : a})`; }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function bright(c) { const m = Math.max(c[0], c[1], c[2]); const k = m < 170 ? 170 / Math.max(1, m) : 1; return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 地貌配色：荒野地面、遠山、樹的種類
  const BIOME = {
    temperate: { wild: [52, 92, 54], far: [40, 64, 74], tree: 'broad', crop: [[96, 150, 62], [196, 170, 76]] },
    tropical: { wild: [34, 96, 50], far: [30, 70, 66], tree: 'palm', crop: [[70, 150, 70], [140, 170, 70]] },
    arid: { wild: [168, 136, 86], far: [140, 100, 70], tree: 'shrub', crop: [[130, 150, 70], [206, 176, 90]] },
    steppe: { wild: [120, 134, 70], far: [96, 104, 90], tree: 'none', crop: [[120, 150, 64], [200, 176, 84]] },
    cold: { wild: [76, 100, 84], far: [70, 84, 104], tree: 'conifer', crop: [[100, 140, 70], [180, 160, 80]] }
  };

  function LifeCam(getData) {
    this.c = document.createElement('canvas');
    this.c.className = 'wc-canvas life-canvas';
    this.c.setAttribute('aria-label', '這個地區的人們正在做什麼（依模擬數據畫的動畫）');
    this.ctx = this.c.getContext('2d');
    this.get = getData;
    this.d = null; this.key = ''; this.nextPoll = 0; this.t0 = 0; this.alive = true;
    this.arrows = [];
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  LifeCam.prototype.attach = function (slot) { if (slot && this.c.parentNode !== slot) slot.appendChild(this.c); this.nextPoll = 0; };
  LifeCam.prototype.stop = function () { this.alive = false; };
  LifeCam.prototype._loop = function (now) {
    if (!this.alive) return;
    requestAnimationFrame(this._loop);
    if (!this.c.isConnected) return;
    if (!this.t0) this.t0 = now;
    const t = (now - this.t0) / 1000;
    if (now >= this.nextPoll) {
      this.nextPoll = now + 400;
      const d = this.get();
      if (d) { const k = d.key; if (k !== this.key) { this.key = k; this.layout(d); } this.d = d; }
    }
    if (!this.d) return;
    const W = this.c.clientWidth, H = this.c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!W || !H) return;
    if (this.c.width !== Math.round(W * dpr) || this.c.height !== Math.round(H * dpr)) { this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr * W / LW, 0, 0, dpr * H / LH, 0, 0);
    this.draw(ctx, t);
  };

  // ---------- 版面：依人口比例分成荒野、農田、城市三塊 ----------
  LifeCam.prototype.layout = function (d) {
    const want = [['wild', d.shares.wild], ['farm', d.shares.farm], ['city', d.shares.city]].filter(([, s]) => s > 0.004);
    const MIN = { wild: 70, farm: 90, city: 100 };
    let ws = want.map(([k, s]) => [k, Math.max(MIN[k], s * LW)]);
    const sum = ws.reduce((a, [, v]) => a + v, 0) || 1;
    let x = 0;
    this.zones = {};
    for (const [k, v] of ws) { const wv = (v / sum) * LW; this.zones[k] = [x, x + wv]; x += wv; }
    if (!want.length) this.zones.wild = [0, LW];
    this.seed = hash(d.seedKey || d.key);
    const r = prng(this.seed);
    this.rand = r;
    // 固定位置的樹、山、房子（同一地區每次看都一樣）
    this.hills = []; for (let i = 0; i < 7; i++) this.hills.push({ x: r() * LW, w: 60 + r() * 110, h: 16 + r() * 34 });
    this.trees = []; for (let i = 0; i < 40; i++) this.trees.push({ x: r(), y: r(), s: 0.7 + r() * 0.6 });
    this.stars = []; for (let i = 0; i < 50; i++) this.stars.push({ x: r() * LW, y: r() * HOR * 0.8, p: r() * TAU });
    this.bld = []; for (let i = 0; i < 30; i++) this.bld.push({ x: r(), w: r(), h: r(), lit: r() });
    this.ppl = []; for (let i = 0; i < 40; i++) this.ppl.push({ x: r(), y: r(), ph: r() * TAU, sp: 0.5 + r(), c: r() });
    this.arrows = [];
  };

  // ---------- 小工具 ----------
  // 簡單人形：pose = walk | hoe | spear | bow | gather | sit | stand | fight | carry
  LifeCam.prototype.man = function (ctx, x, y, s, col, pose, t, ph, dir) {
    dir = dir || 1;
    s *= 1.3;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.3 * s; ctx.lineCap = 'round';
    const sw = Math.sin(t * 6 + ph);
    const bend = pose === 'gather' ? 0.5 : pose === 'hoe' ? 0.2 + Math.max(0, sw) * 0.25 : pose === 'sit' ? 0 : 0;
    const hipY = y - (pose === 'sit' ? 3 : 6) * s;
    const shX = x + dir * bend * 5 * s, shY = hipY - 6 * s * (1 - bend * 0.35);
    ctx.beginPath();
    if (pose === 'sit') { ctx.moveTo(x, hipY); ctx.lineTo(x + dir * 4 * s, hipY); ctx.lineTo(x + dir * 4 * s, y); }
    else {
      const lg = pose === 'walk' || pose === 'fight' || pose === 'carry' ? sw * 2.4 * s : 0.8 * s;
      ctx.moveTo(x - lg, y); ctx.lineTo(x, hipY); ctx.lineTo(x + lg, y);
    }
    ctx.moveTo(x, hipY); ctx.lineTo(shX, shY); ctx.stroke();
    ctx.beginPath(); ctx.arc(shX + dir * 0.6 * s, shY - 2.2 * s, 1.8 * s, 0, TAU); ctx.fill();
    // 手臂與工具
    ctx.beginPath();
    if (pose === 'hoe') {
      const a = -0.6 + Math.max(0, sw) * 1.9;
      const hx = shX + dir * Math.cos(a) * 4.5 * s, hy = shY + 1 * s - Math.sin(a) * 4.5 * s;
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = '#8a6a44'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + dir * Math.cos(a) * 5 * s, hy - Math.sin(a) * 5 * s); ctx.stroke();
    } else if (pose === 'spear' || pose === 'fight') {
      const th = pose === 'fight' ? 0.2 + sw * 0.35 : 0.15 + sw * 0.1;
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(shX + dir * 4 * s, shY - 0.5 * s); ctx.stroke();
      ctx.strokeStyle = this.weaponCol || '#cbb994'; ctx.beginPath();
      ctx.moveTo(shX - dir * 5 * s, shY + 3 * s + th * 4 * s); ctx.lineTo(shX + dir * 9 * s, shY - 3 * s - th * 4 * s); ctx.stroke();
    } else if (pose === 'bow') {
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(shX + dir * 4.5 * s, shY); ctx.stroke();
      ctx.strokeStyle = '#a07a4a'; ctx.beginPath(); ctx.arc(shX + dir * 4 * s, shY, 4 * s, dir > 0 ? -1.2 : Math.PI - 1.2, dir > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
    } else if (pose === 'gather') {
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(shX + dir * 2 * s, y - 2 * s + sw * s); ctx.stroke();
    } else if (pose === 'carry') {
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(shX, shY - 3 * s); ctx.stroke();
      ctx.fillStyle = '#b08a5a'; ctx.fillRect(shX - 2.5 * s, shY - 6 * s, 5 * s, 3 * s);
    } else {
      ctx.moveTo(shX, shY + 1 * s); ctx.lineTo(shX + dir * 1.5 * s, hipY); ctx.stroke();
    }
  };
  LifeCam.prototype.tree = function (ctx, x, y, s, kind, dry) {
    const leaf = dry ? [120, 104, 62] : kind === 'conifer' ? [34, 70, 52] : kind === 'palm' ? [46, 120, 62] : [52, 104, 56];
    ctx.fillStyle = '#4a3624';
    if (kind === 'conifer') {
      ctx.fillRect(x - 0.8 * s, y - 4 * s, 1.6 * s, 4 * s);
      ctx.fillStyle = css(leaf); ctx.beginPath(); ctx.moveTo(x, y - 20 * s); ctx.lineTo(x - 6 * s, y - 3 * s); ctx.lineTo(x + 6 * s, y - 3 * s); ctx.fill();
    } else if (kind === 'palm') {
      ctx.strokeStyle = '#6a5034'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3 * s, y - 9 * s, x + 1 * s, y - 17 * s); ctx.stroke();
      ctx.strokeStyle = css(leaf); ctx.lineWidth = 1.6 * s;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.7; ctx.beginPath(); ctx.moveTo(x + s, y - 17 * s); ctx.quadraticCurveTo(x + s + Math.cos(a) * 5 * s, y - 20 * s + Math.sin(a) * 3 * s, x + s + Math.cos(a) * 9 * s, y - 14 * s + Math.abs(Math.cos(a)) * 3 * s); ctx.stroke(); }
    } else if (kind === 'shrub') {
      ctx.fillStyle = css(leaf, 0.9); ctx.beginPath(); ctx.ellipse(x, y - 2.5 * s, 5 * s, 3 * s, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillRect(x - 0.9 * s, y - 6 * s, 1.8 * s, 6 * s);
      ctx.fillStyle = css(leaf); ctx.beginPath(); ctx.arc(x, y - 10 * s, 6 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = css(mix(leaf, [255, 255, 255], 0.12)); ctx.beginPath(); ctx.arc(x - 2 * s, y - 12 * s, 3 * s, 0, TAU); ctx.fill();
    }
  };
  LifeCam.prototype.beast = function (ctx, x, y, s, kind, t, ph, dir) {
    dir = dir || 1;
    s *= 1.2;
    const col = kind === 'sheep' ? '#e8e2d4' : kind === 'ox' ? '#5a4030' : kind === 'horse' ? '#7a5434' : '#9a6c44';
    const leg = Math.sin(t * (kind === 'deer' ? 14 : 4) + ph) * 1.6 * s;
    ctx.strokeStyle = kind === 'sheep' ? '#4a4038' : col; ctx.lineWidth = 1 * s;
    const bw = kind === 'sheep' ? 4 : kind === 'ox' ? 6 : 5.5, bh = kind === 'sheep' ? 3 : kind === 'ox' ? 3.4 : 2.6;
    const by = y - (kind === 'sheep' ? 4 : 6) * s;
    ctx.beginPath();
    ctx.moveTo(x - bw * 0.6 * s - leg, y); ctx.lineTo(x - bw * 0.6 * s, by);
    ctx.moveTo(x + bw * 0.6 * s + leg, y); ctx.lineTo(x + bw * 0.6 * s, by); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, by, bw * s, bh * s, 0, 0, TAU); ctx.fill();
    const hx = x + dir * (bw + 1.5) * s, hy = by - (kind === 'ox' ? 0.5 : 3) * s;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(x + dir * bw * 0.7 * s, by - s); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = kind === 'sheep' ? '#4a4038' : col; ctx.beginPath(); ctx.ellipse(hx + dir * s, hy, 2 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
    if (kind === 'deer') { ctx.strokeStyle = '#d8c09a'; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.moveTo(hx, hy - s); ctx.lineTo(hx - dir * 2 * s, hy - 5 * s); ctx.moveTo(hx - dir * s, hy - 3 * s); ctx.lineTo(hx + dir * s, hy - 5 * s); ctx.stroke(); }
    if (kind === 'ox') { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.moveTo(hx, hy - s); ctx.lineTo(hx + dir * 1.5 * s, hy - 3 * s); ctx.stroke(); }
  };
  LifeCam.prototype.hut = function (ctx, x, y, s, kind, night) {
    if (kind === 'tent') {
      ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x, y - 11 * s); ctx.lineTo(x + 7 * s, y); ctx.fill();
      ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(x - 1.5 * s, y); ctx.lineTo(x, y - 4 * s); ctx.lineTo(x + 1.5 * s, y); ctx.fill();
    } else if (kind === 'yurt') {
      ctx.fillStyle = '#e4dccb'; ctx.fillRect(x - 7 * s, y - 6 * s, 14 * s, 6 * s);
      ctx.beginPath(); ctx.moveTo(x - 7.5 * s, y - 6 * s); ctx.quadraticCurveTo(x, y - 12 * s, x + 7.5 * s, y - 6 * s); ctx.fill();
      ctx.fillStyle = '#8a3a2a'; ctx.fillRect(x - 7 * s, y - 6.5 * s, 14 * s, 1 * s); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 1.5 * s, y - 4 * s, 3 * s, 4 * s);
    } else if (kind === 'round') {
      ctx.fillStyle = '#9a7a52'; ctx.fillRect(x - 6 * s, y - 6 * s, 12 * s, 6 * s);
      ctx.fillStyle = '#c4a46a'; ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 5.5 * s); ctx.lineTo(x, y - 13 * s); ctx.lineTo(x + 8 * s, y - 5.5 * s); ctx.fill();
      ctx.fillStyle = night ? '#ffb45a' : '#3a2a1a'; ctx.fillRect(x - 1.4 * s, y - 4 * s, 2.8 * s, 4 * s);
    } else {
      ctx.fillStyle = '#b89870'; ctx.fillRect(x - 7 * s, y - 7 * s, 14 * s, 7 * s);
      ctx.fillStyle = '#7a4a34'; ctx.beginPath(); ctx.moveTo(x - 8.5 * s, y - 6.5 * s); ctx.lineTo(x, y - 12 * s); ctx.lineTo(x + 8.5 * s, y - 6.5 * s); ctx.fill();
      ctx.fillStyle = night ? '#ffc46a' : '#3a2a1a'; ctx.fillRect(x - 4 * s, y - 5 * s, 2.4 * s, 2.4 * s); ctx.fillRect(x + 1.6 * s, y - 5 * s, 2.4 * s, 2.4 * s);
    }
  };
  LifeCam.prototype.fire = function (ctx, x, y, t, s) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const fl = 0.6 + 0.4 * Math.sin(t * 13 + i * 2.1);
      const g = ctx.createRadialGradient(x, y - 4 * s * fl, 0, x, y - 4 * s, 9 * s);
      g.addColorStop(0, 'rgba(255,230,150,.6)'); g.addColorStop(0.5, 'rgba(255,120,30,.35)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 4 * s, 9 * s, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  LifeCam.prototype.smoke = function (ctx, x, y, t, n, col, a, seed) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.22 + r()) % 1;
      ctx.fillStyle = css(col, (1 - ph) * a); ctx.beginPath(); ctx.arc(x + ph * 26 + (r() - 0.5) * 6, y - ph * 70, 4 + ph * 16, 0, TAU); ctx.fill();
    }
  };

  // ---------- 主畫面 ----------
  LifeCam.prototype.draw = function (ctx, t) {
    const d = this.d, Z = this.zones, B = BIOME[d.biome] || BIOME.temperate;
    const famine = d.famine || 0, dry = Math.max(famine, d.drought || 0);
    // 一天的循環（約 48 秒），夜晚較短
    const day = ((t / 48) + 0.18) % 1;
    const sunH = Math.sin(day * TAU);
    const light = clamp(0.25 + sunH * 0.9, 0.12, 1);
    this.night = light < 0.4;
    // 天空
    const topDay = mix([40, 110, 190], [150, 120, 70], dry * 0.7), botDay = mix([170, 210, 235], [230, 196, 130], dry * 0.8);
    const topN = [6, 10, 26], botN = [24, 34, 64];
    const g = ctx.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, css(mix(topN, topDay, light))); g.addColorStop(1, css(mix(botN, botDay, light)));
    if (sunH > -0.15 && sunH < 0.25) g.addColorStop(0.85, css(mix([240, 140, 80], botDay, clamp(Math.abs(sunH - 0.05) * 4, 0, 1))));
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, HOR + 2);
    if (this.night) for (const s of this.stars) { ctx.fillStyle = `rgba(255,255,255,${(0.4 - light) * 2 * (0.5 + 0.5 * Math.sin(t * 2 + s.p))})`; ctx.fillRect(s.x, s.y, 1, 1); }
    // 太陽／月亮
    const sx = LW * (1 - day * 2 + 0.5), sy = HOR - sunH * 120;
    if (sunH > -0.1) { ctx.fillStyle = dry > 0.3 ? 'rgba(255,220,140,.95)' : 'rgba(255,244,210,.95)'; ctx.beginPath(); ctx.arc(((sx % LW) + LW) % LW, sy, 8 + dry * 5, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(230,236,255,.85)'; ctx.beginPath(); ctx.arc(LW * 0.78, 34, 6, 0, TAU); ctx.fill(); }
    // 污染、乾旱的霧霾
    if (d.pollution > 0.05) { ctx.fillStyle = `rgba(120,110,90,${clamp(d.pollution, 0, 0.6) * 0.5})`; ctx.fillRect(0, 0, LW, HOR); }
    // 遠山
    const far = mix(mix(B.far, [10, 14, 30], 1 - light), [150, 120, 80], dry * 0.25);
    ctx.fillStyle = css(far);
    for (const h of this.hills) { ctx.beginPath(); ctx.moveTo(h.x - h.w / 2, HOR); ctx.quadraticCurveTo(h.x, HOR - h.h * 2, h.x + h.w / 2, HOR); ctx.fill(); }
    if (d.biome === 'cold') { ctx.fillStyle = css([230, 236, 245], light * 0.8); for (const h of this.hills) { ctx.beginPath(); ctx.arc(h.x, HOR - h.h + 3, h.w * 0.08, Math.PI, 0); ctx.fill(); } }
    // 海
    if (d.coast > 0.35) {
      const sea = mix([20, 30, 60], [50, 110, 160], light);
      ctx.fillStyle = css(sea); ctx.fillRect(0, HOR - 8, LW, 9);
      ctx.fillStyle = css([255, 255, 255], 0.15 * light); for (let i = 0; i < 12; i++) ctx.fillRect((i * 43 + t * 6) % LW, HOR - 6 + (i % 3) * 2, 8, 0.6);
      this.boats(ctx, t, light);
    }
    // 地面
    const shade = (c) => css(mix(mix(c, [150, 120, 70], dry * 0.55), [8, 12, 22], 1 - light));
    const zone = (k, c) => { if (Z[k]) { ctx.fillStyle = shade(c); ctx.fillRect(Z[k][0], HOR, Z[k][1] - Z[k][0] + 1, LH - HOR); } };
    zone('wild', B.wild); zone('farm', mix(B.wild, [110, 86, 56], 0.35)); zone('city', d.modern ? [70, 74, 80] : [150, 126, 92]);
    // 河流（灌溉）
    if (d.river > 0.4) this.river(ctx, light, d);
    // 三塊區域
    const order = [];
    if (Z.wild) order.push(() => this.zoneWild(ctx, t, Z.wild, B, light));
    if (Z.farm) order.push(() => this.zoneFarm(ctx, t, Z.farm, B, light));
    if (Z.city) order.push(() => this.zoneCity(ctx, t, Z.city, light));
    order.forEach((f) => f());
    if (d.war) this.war(ctx, t, light);
    if (d.unrest > 0.3 && Z.city) this.protest(ctx, t, Z.city);
    if (famine > 0.15) this.vultures(ctx, t, famine);
    this.overlay(ctx, t);
  };

  LifeCam.prototype.boats = function (ctx, t, light) {
    const d = this.d, n = d.feat.sailing ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = ((t * (4 + i * 2) + i * 190) % (LW + 40)) - 20, y = HOR - 4 + i;
      ctx.fillStyle = css(mix([60, 40, 24], [0, 0, 0], 1 - light)); ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + 5, y + 2.5); ctx.lineTo(x - 5, y + 2.5); ctx.fill();
      if (d.modern && d.feat.steam) { ctx.fillStyle = '#4a4e58'; ctx.fillRect(x - 6, y - 4, 12, 4); ctx.fillStyle = '#222'; ctx.fillRect(x - 1, y - 8, 2.4, 4); }
      else if (d.feat.sailing) { ctx.fillStyle = css(mix([236, 226, 200], [40, 40, 50], 1 - light)); ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 1); ctx.lineTo(x + 8, y - 2); ctx.fill(); }
      else { this.man(ctx, x - 1, y, 0.6, '#2a2018', 'stand', t, i); }
    }
  };
  LifeCam.prototype.river = function (ctx, light, d) {
    const x0 = (this.zones.farm || this.zones.wild || [0, LW])[0] + 30;
    const col = css(mix([30, 50, 90], [70, 140, 190], light), d.drought > 0.3 ? 0.55 : 0.9);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x0 + 20, HOR); ctx.bezierCurveTo(x0 + 40, HOR + 40, x0 - 30, HOR + 70, x0 - 10, LH);
    ctx.lineTo(x0 + 30, LH); ctx.bezierCurveTo(x0 + 10, HOR + 70, x0 + 60, HOR + 40, x0 + 24, HOR); ctx.fill();
    // 灌溉渠
    if (d.feat.irrigation && this.zones.farm) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      const [a, b] = this.zones.farm;
      for (const y of [HOR + 34, HOR + 70]) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(b - 8, y); ctx.stroke(); }
      void a;
    }
  };

  // 荒野：狩獵、採集、營火；放牧
  LifeCam.prototype.zoneWild = function (ctx, t, [x0, x1], B, light) {
    const d = this.d, w = x1 - x0, dry = d.famine > 0.3 || d.drought > 0.4;
    const herd = d.feat.herding && (d.biome === 'steppe' || d.biome === 'arid' || d.shares.wild < 0.5);
    // 樹
    if (B.tree !== 'none') for (const tr of this.trees) {
      const x = x0 + tr.x * w; if (x > x1 - 4) continue;
      const y = HOR + 4 + tr.y * 30;
      this.tree(ctx, x, y, tr.s * 0.9, B.tree, dry);
    }
    ctx.globalAlpha = clamp(light + 0.3, 0.4, 1);
    const hunters = d.shares.wild > 0.02;
    if (hunters && !d.modern) {
      // 營地：帳篷＋營火
      const cx = x0 + w * 0.22, cy = HOR + 40;
      this.hut(ctx, cx - 10, cy, 1, herd && d.biome === 'steppe' ? 'yurt' : 'tent', this.night);
      this.hut(ctx, cx + 8, cy + 4, 0.9, herd && d.biome === 'steppe' ? 'yurt' : 'tent', this.night);
      this.fire(ctx, cx, cy + 14, t, this.night ? 1.4 : 0.9);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(cx - 3, cy + 13, 6, 1.5);
      this.man(ctx, cx - 7, cy + 16, 0.9, '#2e2218', 'sit', t, 1, 1);
      this.man(ctx, cx + 7, cy + 16, 0.9, '#3a2a1e', 'sit', t, 2, -1);
      // 採集者
      this.man(ctx, x0 + w * 0.12, HOR + 70, 1.1, '#3a2a1e', 'gather', t, 3, 1);
      this.man(ctx, x0 + w * 0.3, HOR + 78, 1.0, '#45301f', 'gather', t * 0.8, 5, -1);
      // 狩獵：獵物逃、獵人追
      if (!herd || d.shares.wild > 0.3) {
        const run = (t * 22) % (w + 80);
        const px = x1 - run + 40, py = HOR + 95;
        this.beast(ctx, px - 30, py, 1.3, 'deer', t, 0, -1);
        this.beast(ctx, px - 46, py + 8, 1.1, 'deer', t, 1.3, -1);
        const bow = d.feat.bow;
        this.man(ctx, px + 4, py + 4, 1.3, '#2a1e14', bow ? 'bow' : 'spear', t, 0, -1);
        this.man(ctx, px + 20, py + 10, 1.25, '#33241a', bow ? 'walk' : 'spear', t, 1.7, -1);
        if (bow) {
          const k = (t * 1.6) % 1;
          ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 0.8; ctx.beginPath();
          const ax = px + 4 - 8 - k * 30, ay = py - 6 - Math.sin(k * Math.PI) * 6; ctx.moveTo(ax, ay); ctx.lineTo(ax + 6, ay + 0.5); ctx.stroke();
        }
      }
    }
    if (herd) {
      const hx = x0 + w * 0.55;
      for (let i = 0; i < 9; i++) {
        const p = this.ppl[i];
        const x = hx + (p.x - 0.5) * w * 0.5 + Math.sin(t * 0.3 + p.ph) * 6, y = HOR + 50 + p.y * 30;
        this.beast(ctx, x, y, 1.0, d.feat.horse && i % 4 === 0 ? 'horse' : 'sheep', t * 0.3, p.ph, Math.sin(t * 0.2 + p.ph) > 0 ? 1 : -1);
      }
      this.man(ctx, hx + w * 0.25, HOR + 74, 1.2, '#3a2a1e', 'walk', t * 0.4, 2, -1);
    }
    if (d.modern && d.shares.wild > 0.004) { // 近代：山林與少數獵人／牧人
      this.man(ctx, x0 + w * 0.4, HOR + 80, 1.1, '#2f2a24', 'walk', t * 0.5, 2, 1);
    }
    ctx.globalAlpha = 1;
  };

  // 農田：鋤地、犁田、收割、穀倉、村落、牛車
  LifeCam.prototype.zoneFarm = function (ctx, t, [x0, x1], B, light) {
    const d = this.d, w = x1 - x0, f = d.famine;
    const top = HOR + 18;
    // 田地：一條一條的作物
    const ripe = 0.5 + 0.5 * Math.sin(t / 48 * TAU * 0.5);
    const cropCol = mix(mix(B.crop[0], B.crop[1], ripe * 0.7), [120, 96, 60], f * 0.9);
    const rows = 10;
    for (let i = 0; i < rows; i++) {
      const y = top + i * 9 + i * i * 0.35;
      ctx.fillStyle = css(mix(mix(cropCol, [70, 50, 30], i % 2 ? 0.25 : 0), [8, 12, 22], 1 - light));
      ctx.fillRect(x0 + 4, y, w - 8, 3 + i * 0.35);
      // 作物（風吹會搖）
      if (f < 0.6) {
        ctx.strokeStyle = css(mix(cropCol, [8, 12, 22], 1 - light)); ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let x = x0 + 6; x < x1 - 6; x += 4 + (i % 3)) { const hh = (2 + i * 0.4) * (1 - f * 0.8); ctx.moveTo(x, y + 1); ctx.lineTo(x + Math.sin(t * 2 + x * 0.1) * 0.8, y - hh); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = clamp(light + 0.3, 0.4, 1);
    // 村落與穀倉
    const vx = x0 + w * 0.82;
    const kind = d.modern ? 'house' : d.feat.metal || d.feat.wheel ? 'house' : 'round';
    this.hut(ctx, vx, top - 2, 1.1, kind, this.night);
    this.hut(ctx, vx - 22, top - 4, 0.9, kind, this.night);
    if (d.feat.storage && !d.modern) {
      const gx = vx + 16, gy = top - 2;
      ctx.fillStyle = '#c4a070'; ctx.fillRect(gx - 4, gy - 9, 8, 9);
      ctx.fillStyle = '#8a6a44'; ctx.beginPath(); ctx.moveTo(gx - 5.5, gy - 8.5); ctx.lineTo(gx, gy - 15); ctx.lineTo(gx + 5.5, gy - 8.5); ctx.fill();
    }
    if (d.feat.pottery && !d.modern) { ctx.fillStyle = '#a0583a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(vx - 10 + i * 4, top + 1, 1.6, 2, 0, 0, TAU); ctx.fill(); } }
    if (this.night && !d.modern) this.fire(ctx, vx - 8, top + 4, t, 0.6);
    // 幹活的人
    const nWork = Math.round(clamp(w / 45, 2, 6));
    const sick = f > 0.45;
    for (let i = 0; i < nWork; i++) {
      const p = this.ppl[10 + i];
      const x = x0 + 14 + (w - 40) * ((i + 0.5) / nWork), y = top + 30 + p.y * 50;
      const pose = sick ? (i % 2 ? 'sit' : 'stand') : this.night ? 'stand' : f > 0.2 ? (i % 2 ? 'hoe' : 'stand') : i % 3 === 2 ? 'carry' : 'hoe';
      this.man(ctx, x, y, 1.05 + p.y * 0.4, sick ? '#5a4a3a' : '#2e2218', pose, t * (0.7 + p.sp * 0.3), p.ph, p.x > 0.5 ? 1 : -1);
    }
    // 犁田（牛拉犁）或拖拉機
    if (!this.night && !sick) {
      const span = w - 30, k = (t * 0.05) % 2, dir = k < 1 ? 1 : -1, kk = k < 1 ? k : 2 - k;
      const px = x0 + 15 + kk * span, py = top + 90;
      if (d.feat.tractor) {
        ctx.fillStyle = '#c0392b'; ctx.fillRect(px - 8, py - 8, 12, 6); ctx.fillRect(px - 2, py - 13, 5, 5);
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px - 6, py - 2, 3.4, 0, TAU); ctx.arc(px + 3, py - 1.6, 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(90,70,50,.35)'; ctx.fillRect(dir > 0 ? px - 40 : px + 4, py - 2, 36, 2);
      } else if (d.feat.plough) {
        this.beast(ctx, px + dir * 10, py, 1.2, 'ox', t, 0, dir);
        ctx.strokeStyle = '#6a5034'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + dir * 4, py - 5); ctx.lineTo(px - dir * 4, py - 1); ctx.stroke();
        this.man(ctx, px - dir * 8, py + 1, 1.2, '#2e2218', 'walk', t, 0, dir);
        ctx.fillStyle = 'rgba(80,60,40,.35)'; ctx.fillRect(dir > 0 ? px - 40 : px + 4, py, 36, 1.5);
      }
    }
    // 牛車／貨車往城市走
    if (d.feat.wheel && !this.night) {
      const k = (t * 0.06) % 1, cx = x0 + k * w, cy = top + 104;
      if (d.feat.automobile) {
        ctx.fillStyle = '#3b5b8a'; ctx.fillRect(cx - 8, cy - 7, 16, 5); ctx.fillRect(cx - 4, cy - 10, 8, 3);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx - 5, cy - 1.5, 1.8, 0, TAU); ctx.arc(cx + 5, cy - 1.5, 1.8, 0, TAU); ctx.fill();
      } else {
        this.beast(ctx, cx + 12, cy, 1.0, d.feat.horse ? 'horse' : 'ox', t, 0, 1);
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(cx - 8, cy - 9, 12, 5);
        ctx.strokeStyle = '#4a3624'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx - 2, cy - 3, 3, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 2, cy - 3); ctx.lineTo(cx - 2 + Math.cos(t * 4) * 3, cy - 3 + Math.sin(t * 4) * 3); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // 城市：古代城牆神廟、市集、冶金；近代高樓、工廠、汽車、火車、飛機
  LifeCam.prototype.zoneCity = function (ctx, t, [x0, x1], light) {
    const d = this.d, w = x1 - x0, night = this.night;
    const base = HOR + 22;
    const pc = bright(rgb(d.color));
    if (d.modern) {
      ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, w, LH); ctx.clip();
      // 天際線：服務業越多越高
      const tall = 30 + d.shares.serv * 120;
      for (let i = 0; i < this.bld.length; i++) {
        const b = this.bld[i];
        const bx = x0 + b.x * w, bw = 8 + b.w * 16, bh = 14 + b.h * tall;
        if (bx + bw > x1) continue;
        ctx.fillStyle = css(mix([90, 100, 116], [14, 18, 30], 1 - light)); ctx.fillRect(bx, base - bh, bw, bh);
        if (d.feat.electric) for (let yy = base - bh + 3; yy < base - 3; yy += 5) for (let xx = bx + 2; xx < bx + bw - 2; xx += 4) {
          if (prng(i * 977 + yy * 13 + xx)() < (night ? 0.55 : 0.12)) { ctx.fillStyle = night ? 'rgba(255,214,140,.85)' : 'rgba(200,230,255,.35)'; ctx.fillRect(xx, yy, 1.8, 2.2); }
        }
      }
      // 工廠：工業就業越多，煙囪越多
      const nf = Math.round(clamp(d.shares.ind * 8, d.shares.ind > 0.03 ? 1 : 0, 4));
      for (let i = 0; i < nf; i++) {
        const fx = x0 + 8 + i * 26, fy = base + 16;
        ctx.fillStyle = css(mix([110, 80, 64], [20, 16, 16], 1 - light)); ctx.fillRect(fx, fy - 12, 22, 12);
        ctx.beginPath(); ctx.moveTo(fx, fy - 12); for (let k = 0; k < 3; k++) { ctx.lineTo(fx + k * 7 + 3.5, fy - 17); ctx.lineTo(fx + k * 7 + 7, fy - 12); } ctx.fill();
        ctx.fillRect(fx + 16, fy - 30, 3.5, 18);
        this.smoke(ctx, fx + 18, fy - 30, t + i, 6, [110, 106, 100], 0.25 + d.pollution * 0.4, 11 + i);
      }
      // 道路與車
      const ry = base + 40;
      ctx.fillStyle = css(mix([60, 62, 66], [10, 10, 14], 1 - light)); ctx.fillRect(x0, ry, w, 10);
      ctx.fillStyle = 'rgba(240,220,120,.5)'; for (let x = x0; x < x1; x += 14) ctx.fillRect(x, ry + 4.5, 7, 0.8);
      const nCars = d.feat.automobile ? 4 : 1;
      for (let i = 0; i < nCars; i++) {
        const dir = i % 2 ? 1 : -1, k = ((t * (0.12 + i * 0.03) + i * 0.27) % 1);
        const cx = dir > 0 ? x0 + k * w : x1 - k * w, cy = ry + (dir > 0 ? 7 : 3);
        if (d.feat.automobile) {
          ctx.fillStyle = ['#e5484d', '#3e63dd', '#f5f5f5', '#f5d90a'][i % 4]; ctx.fillRect(cx - 5, cy - 3, 10, 3); ctx.fillRect(cx - 2.5, cy - 5, 5, 2);
          if (night) { ctx.fillStyle = 'rgba(255,240,180,.8)'; ctx.fillRect(cx + dir * 5, cy - 2.5, 1.5, 1.2); }
        } else { this.beast(ctx, cx, cy + 2, 0.7, 'horse', t, i, dir); }
      }
      // 火車
      if (d.feat.railway) {
        const ty = base + 58, k = (t * 0.08) % 1.6, tx = x0 - 70 + k * (w + 140) / 1.6 * 1.6;
        ctx.fillStyle = '#2a2a30'; ctx.fillRect(x0, ty, w, 1.4);
        ctx.fillStyle = '#3a3e48'; for (let c = 0; c < 4; c++) ctx.fillRect(tx - c * 15, ty - 7, 13, 6);
        ctx.fillStyle = '#7a1f1f'; ctx.fillRect(tx + 1, ty - 9, 9, 8);
        if (!d.feat.electric) this.smoke(ctx, tx + 6, ty - 9, t, 4, [200, 200, 200], 0.3, 7);
      }
      // 行人
      const nP = Math.round(clamp(w / 30, 3, 9));
      for (let i = 0; i < nP; i++) { const p = this.ppl[20 + i]; const dir = p.x > 0.5 ? 1 : -1; const x = x0 + ((p.x * w + dir * t * 6 * p.sp) % w + w) % w; this.man(ctx, x, base + 32 + p.y * 6, 0.9, css(mix([60, 60, 70], pc, p.c * 0.6)), 'walk', t, p.ph, dir); }
      ctx.restore();
      // 飛機
      if (d.feat.aviation) { const k = (t * 0.04) % 1; const px = x0 - 20 + k * (w + 40), py = 30 + Math.sin(k * 3) * 4; ctx.fillStyle = '#dfe6ee'; ctx.fillRect(px - 6, py, 12, 2); ctx.fillRect(px - 1, py - 3, 3, 8); ctx.fillRect(px - 6, py - 2, 2, 3); }
      return;
    }
    // ---- 古代城市 ----
    const wallCol = mix([196, 168, 120], [20, 18, 24], 1 - light);
    const rank = d.polityRank || 0;
    // 神廟／宮殿（政體越大越高）
    const tx = x0 + w * 0.55;
    if (rank >= 2 || d.cities >= 1) {
      const steps = 2 + Math.min(3, rank);
      for (let s = 0; s < steps; s++) { ctx.fillStyle = css(mix(wallCol, [255, 255, 255], s * 0.04)); const sw = 46 - s * 9; ctx.fillRect(tx - sw / 2, base - 8 - s * 8, sw, 8); }
      const top = base - 8 - steps * 8;
      ctx.fillStyle = css(mix([160, 110, 70], [20, 18, 24], 1 - light)); ctx.fillRect(tx - 5, top - 4, 10, 4);
      if (d.polityName) { ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(tx, top - 4); ctx.lineTo(tx, top - 18); ctx.stroke(); ctx.fillStyle = css(pc); ctx.beginPath(); ctx.moveTo(tx, top - 18); ctx.lineTo(tx + 9 + Math.sin(t * 4) * 1.2, top - 15); ctx.lineTo(tx, top - 12); ctx.fill(); }
      if (night) this.fire(ctx, tx, top - 4, t, 0.5);
    }
    // 房屋群
    for (let i = 0; i < this.bld.length; i++) {
      const b = this.bld[i];
      const bx = x0 + 4 + b.x * (w - 16), bw = 7 + b.w * 9, bh = 6 + b.h * (6 + rank * 2.5);
      if (Math.abs(bx - tx) < 24 || i > 8 + d.cities * 4) continue;
      ctx.fillStyle = css(mix(wallCol, [0, 0, 0], 0.08 + b.lit * 0.12)); ctx.fillRect(bx, base - bh + 4, bw, bh);
      ctx.fillStyle = night ? (b.lit < 0.6 ? 'rgba(255,190,100,.85)' : 'rgba(0,0,0,.6)') : 'rgba(40,28,18,.7)'; ctx.fillRect(bx + bw * 0.4, base - bh * 0.5 + 4, 1.8, 2.4);
    }
    // 城牆
    if (rank >= 2 || d.cities >= 2) {
      ctx.fillStyle = css(mix(wallCol, [0, 0, 0], 0.18)); ctx.fillRect(x0 + 2, base + 4, w - 4, 7);
      for (let x = x0 + 2; x < x1 - 4; x += 6) ctx.fillRect(x, base + 1, 3, 3);
      ctx.fillStyle = 'rgba(30,20,12,.9)'; ctx.fillRect(x0 + w * 0.3, base + 5, 6, 6);
    }
    // 市集（貨幣、交換）
    const my = base + 30;
    const stalls = d.feat.currency ? 4 : 2;
    for (let i = 0; i < stalls; i++) {
      const sx = x0 + 14 + i * ((w - 30) / stalls);
      ctx.fillStyle = css(mix([150, 110, 70], [20, 18, 24], 1 - light)); ctx.fillRect(sx, my - 6, 14, 6);
      ctx.fillStyle = css(mix(i % 2 ? pc : [220, 200, 160], [20, 18, 24], 1 - light)); ctx.beginPath(); ctx.moveTo(sx - 2, my - 6); ctx.lineTo(sx + 7, my - 11); ctx.lineTo(sx + 16, my - 6); ctx.fill();
      if (d.feat.pottery) { ctx.fillStyle = '#a0583a'; ctx.beginPath(); ctx.ellipse(sx + 4, my - 7, 1.3, 1.6, 0, 0, TAU); ctx.fill(); }
    }
    // 打鐵（金屬）
    if (d.feat.metal) {
      const fx = x1 - 22, fy = base + 50;
      ctx.fillStyle = '#5a4030'; ctx.fillRect(fx - 6, fy - 8, 12, 8);
      this.fire(ctx, fx, fy - 7, t, 0.6);
      this.man(ctx, fx - 12, fy + 2, 1.1, '#2e2218', 'hoe', t * 1.3, 0, 1);
      if (Math.sin(t * 8) > 0.6) { ctx.fillStyle = '#ffd38a'; for (let k = 0; k < 4; k++) ctx.fillRect(fx - 4 + k * 2, fy - 12 - k * 1.5, 1, 1); }
    }
    // 人群走動（文字：有人拿著泥板）
    const nP = Math.round(clamp(w / 28, 3, 8));
    for (let i = 0; i < nP; i++) {
      const p = this.ppl[20 + i]; const dir = p.x > 0.5 ? 1 : -1;
      const x = x0 + ((p.x * w + dir * t * 5 * p.sp) % w + w) % w;
      this.man(ctx, x, my + 12 + p.y * 30, 1.0 + p.y * 0.3, css(mix([50, 36, 24], pc, p.c * 0.4)), i % 3 === 0 ? 'carry' : 'walk', t, p.ph, dir);
    }
  };

  // 戰爭：兩軍在前景交戰，房子冒火
  LifeCam.prototype.war = function (ctx, t, light) {
    const d = this.d, v = clamp(d.war.intensity || 0.6, 0.25, 1);
    const a = bright(rgb(d.war.colors[0])), b = bright(rgb(d.war.colors[1] || '#999'));
    const cx = LW * 0.62, y0 = LH - 32;
    this.weaponCol = d.modern ? '#2a2a2a' : d.feat.metal ? (d.feat.iron ? '#c8ccd2' : '#d4a050') : '#cbb994';
    const n = Math.round(4 + v * 6);
    const push = Math.sin(t * 0.5) * 6;
    for (let i = 0; i < n; i++) {
      const p = this.ppl[i];
      const jitter = Math.sin(t * 3 + p.ph) * 2;
      this.man(ctx, cx - 14 - i * 9 + push + jitter, y0 + (i % 3) * 7, 1.35, css(a), d.modern ? 'walk' : 'fight', t * 1.3, p.ph, 1);
      this.man(ctx, cx + 14 + i * 9 + push - jitter, y0 + ((i + 1) % 3) * 7, 1.35, css(b), d.modern ? 'walk' : 'fight', t * 1.3, p.ph + 1, -1);
      if (d.modern && Math.sin(t * 9 + i * 1.7) > 0.85) { ctx.fillStyle = '#fff2a8'; ctx.fillRect(cx - 14 - i * 9 + push + 8, y0 + (i % 3) * 7 - 9, 3, 1.5); ctx.fillRect(cx + 14 + i * 9 + push - 11, y0 + ((i + 1) % 3) * 7 - 9, 3, 1.5); }
    }
    if (d.feat.gunpowder && !d.modern && Math.sin(t * 2.3) > 0.7) { ctx.fillStyle = 'rgba(240,240,240,.6)'; ctx.beginPath(); ctx.arc(cx - 40, y0 - 10, 6, 0, TAU); ctx.fill(); }
    if (d.modern && d.feat.armor) {
      const tx = cx - 90 + push;
      ctx.fillStyle = css(mix(a, [60, 70, 50], 0.6)); ctx.fillRect(tx - 12, y0 + 2, 24, 7); ctx.fillRect(tx - 6, y0 - 3, 12, 5); ctx.fillRect(tx + 6, y0 - 2, 12, 1.6);
    }
    // 火與煙
    const fx = (this.zones.city || this.zones.farm || this.zones.wild)[0] + 30;
    this.fire(ctx, fx, HOR + 20, t, 1 + v);
    this.smoke(ctx, fx, HOR + 10, t, 8, [70, 64, 60], 0.35 * v + 0.1, 5);
    void light;
  };
  LifeCam.prototype.protest = function (ctx, t, [x0, x1]) {
    const n = Math.round(4 + this.d.unrest * 8), y = HOR + 64;
    for (let i = 0; i < n; i++) {
      const x = x0 + 10 + ((x1 - x0 - 20) * i) / n;
      this.man(ctx, x, y + (i % 2) * 4, 1.0, '#1f2937', 'stand', t, i);
      if (i % 3 === 0) { const bob = Math.sin(t * 4 + i) * 1.5; ctx.fillStyle = '#f1f5f9'; ctx.fillRect(x - 5, y - 22 + bob, 10, 6); ctx.fillStyle = '#e5484d'; ctx.fillRect(x - 3.5, y - 20.5 + bob, 7, 1.2); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y - 16 + bob); ctx.lineTo(x, y - 10); ctx.stroke(); }
    }
  };
  LifeCam.prototype.vultures = function (ctx, t, f) {
    ctx.strokeStyle = 'rgba(20,16,12,.85)'; ctx.lineWidth = 1.2;
    const n = Math.round(1 + f * 4);
    for (let i = 0; i < n; i++) {
      const a = t * 0.4 + (i * TAU) / n, x = LW * 0.45 + Math.cos(a) * 50, y = 50 + Math.sin(a) * 14, fl = Math.sin(t * 5 + i) * 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y - fl); ctx.quadraticCurveTo(x - 3, y - 3, x, y); ctx.quadraticCurveTo(x + 3, y - 3, x + 6, y - fl); ctx.stroke();
    }
  };

  LifeCam.prototype.overlay = function (ctx, t) {
    const d = this.d;
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < LH; y += 3) ctx.fillRect(0, y, LW, 1);
    const g = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LW * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    // 四角框線
    ctx.strokeStyle = 'rgba(125,211,252,.6)'; ctx.lineWidth = 1.2;
    for (const [x, y, sx, sy] of [[6, 6, 1, 1], [LW - 6, 6, -1, 1], [6, LH - 6, 1, -1], [LW - 6, LH - 6, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y + sy * 12); ctx.lineTo(x, y); ctx.lineTo(x + sx * 12, y); ctx.stroke(); }
    ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = ((t * 1.2) % 1) < 0.6 ? '#4ade80' : 'rgba(74,222,128,.3)';
    ctx.beginPath(); ctx.arc(16, 18, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0f9ff'; ctx.fillText('LIVE', 24, 22);
    ctx.font = '600 12px "Noto Sans TC",system-ui,sans-serif';
    ctx.fillText(d.when || '', 56, 22);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(240,249,255,.85)'; ctx.fillText(d.place || '', LW - 14, 22);
    ctx.textAlign = 'left';
    const cap = d.caption || '';
    const tw = Math.min(LW - 20, ctx.measureText(cap).width + 16);
    ctx.fillStyle = 'rgba(5,7,13,.75)'; ctx.fillRect(10, LH - 30, tw, 20);
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(cap, 18, LH - 15);
  };

  window.WSLifeCam = LifeCam;
})();
