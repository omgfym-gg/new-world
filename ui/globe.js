// 介面裝飾：會轉的全息地球（只畫圖，不讀寫任何模擬數值）。
// app.js 每次重畫時用 setData() 把「要畫的東西」交給地球：國家位置、戰爭、同盟、貿易、最近事件……
// 這些全部是 app.js 從引擎狀態「讀出來」的；地球本身不知道引擎的存在，也不會改變任何數值。
// 動畫裡的閃爍、粒子等只是視覺效果，用固定的雜湊值產生，不使用亂數。
(function () {
  'use strict';
  const RAD = Math.PI / 180, TAU = Math.PI * 2;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- 陸地點陣（由 ui/earth-dots.js 解碼）----
  function decodeDots(src) {
    const out = [];
    if (!src) return out;
    const rows = src.rows.split('|');
    const step = src.step;
    rows.forEach((row, r) => {
      const lat = 90 - step / 2 - r * step;
      const runs = row.split('.').map((x) => parseInt(x, 36));
      const cnt = runs.reduce((a, b) => a + b, 0);
      let i = 0;
      runs.forEach((len, k) => {
        if (k % 2 === 1) for (let j = 0; j < len; j++) out.push(pt(lat, -180 + (i + j + 0.5) * 360 / cnt));
        i += len;
      });
    });
    out.forEach((d, i) => { d.h = hash(i); });
    return out;
  }
  function pt(lat, lon) {
    const p = lat * RAD, l = lon * RAD;
    return { sp: Math.sin(p), cp: Math.cos(p), l, lat, lon };
  }
  function hash(i) { let x = (i + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
  // 兩點之間的球面角距離（度）
  function angDist(lat1, lon1, lat2, lon2) {
    const a = lat1 * RAD, b = lat2 * RAD, dl = (lon2 - lon1) * RAD;
    const c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dl);
    return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
  }
  function rgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return [56, 189, 248];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function css(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  // 國旗色太暗或太灰時，提高亮度讓它在深色地球上看得到
  function vivid(c) {
    const m = Math.max(c[0], c[1], c[2]);
    const k = m < 170 ? 170 / Math.max(1, m) : 1;
    return mix([c[0] * k, c[1] * k, c[2] * k], [103, 232, 249], 0.18);
  }
  const CYAN = [103, 232, 249], FAMINE = [196, 140, 60], EMBER = [255, 120, 40], ASH = [110, 60, 40], CITY = [255, 214, 140];

  const KIND = {
    'war-start': { color: [248, 113, 113], icon: '⚔' },
    'war-end': { color: [226, 232, 240], icon: '☮' },
    upheaval: { color: [251, 191, 36], icon: '◎' },
    famine: { color: [214, 160, 80], icon: '▲' },
    newcountry: { color: [255, 255, 255], icon: '✦' },
    'tech-first': { color: [167, 139, 250], icon: '⚡' },
    tech: { color: [167, 139, 250], icon: '⚡' },
    org: { color: [56, 189, 248], icon: '◇' },
    divine: { color: [255, 236, 170], icon: '✧' }
  };

  function Globe() {
    this.dots = decodeDots(window.WS_EARTH_DOTS);
    this.n = this.dots.length;
    this.px = new Float32Array(this.n); this.py = new Float32Array(this.n); this.pz = new Float32Array(this.n);
    this.owner = new Int16Array(this.n).fill(-1);
    this.wrap = document.createElement('div');
    this.wrap.className = 'globe-canvas';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '旋轉中的地球：國土、夜晚城市燈光、戰爭、同盟、貿易與最近發生的大事');
    this.wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.lon0 = 100; this.lat0 = 18;
    this.spin = reduceMotion ? 0 : 5;
    this.vel = 0; this.pauseUntil = 0; this.fly = null;
    this.data = { markers: [], links: [], focus: null, fronts: [], scorch: [], events: [], tags: [], worldKey: null };
    this.ownKey = ''; this.owners = []; this.groups = [];
    this.frontKey = ''; this.frontSets = []; this.scorchSets = [];
    this.seen = null; this.fx = []; this.flash = {}; this.caption = null;
    this.proj = []; this.tagRects = [];
    this.onPick = null; this.onEvent = null;
    this.last = 0;
    this._bind();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  Globe.prototype.attach = function (slot) {
    if (!slot) return;
    if (this.wrap.parentNode !== slot) slot.insertBefore(this.wrap, slot.firstChild);
  };

  Globe.prototype.setData = function (d) {
    const prev = this.data;
    this.data = Object.assign({ markers: [], links: [], focus: null, fronts: [], scorch: [], events: [], tags: [], worldKey: null }, d);
    if (d.focus && d.focus !== prev.focus) {
      const m = this.data.markers.find((x) => x.id === d.focus);
      if (m) this.flyTo(m.lon, m.lat);
    }
    this._territory();
    this._fronts();
    // 新出現的事件 → 播放一次動畫（換世界、載入存檔時只記下，不播放）
    if (this.seen === null || d.worldKey !== prev.worldKey) {
      this.seen = new Set(this.data.events.map((e) => e.id));
      this.fx = []; this.caption = null;
    } else {
      const now = performance.now();
      const fresh = this.data.events.filter((e) => !this.seen.has(e.id));
      fresh.forEach((e) => this.seen.add(e.id));
      fresh.slice(-6).forEach((e, i) => this._spawn(e, now + i * 350));
      const top = fresh.filter((e) => e.major).pop() || fresh[fresh.length - 1];
      if (top) this.caption = { text: top.title, kind: top.kind, at: now, id: top.id };
    }
  };

  Globe.prototype.flyTo = function (lon, lat) {
    const d = ((lon - this.lon0 + 540) % 360) - 180;
    this.fly = { fromLon: this.lon0, dLon: d, fromLat: this.lat0, toLat: Math.max(-35, Math.min(45, lat * 0.6)), t: 0 };
    this.pauseUntil = performance.now() + 6000;
  };

  // ---- 國土：每個陸地點歸給最近的國家範圍圈 ----
  Globe.prototype._territory = function () {
    const ms = this.data.markers;
    const key = ms.map((m) => m.id + ':' + m.anchors.map((a) => a.join(',')).join(';')).join('|');
    if (key === this.ownKey) return;
    this.ownKey = key;
    this.owners = ms.map((m) => m.id);
    const idx = {}; this.owners.forEach((id, i) => (idx[id] = i));
    for (let i = 0; i < this.n; i++) {
      const d = this.dots[i];
      let best = -1, bs = 1;
      ms.forEach((m, k) => {
        for (const [la, lo, r] of m.anchors) {
          const s = angDist(d.lat, d.lon, la, lo) / r;
          if (s < bs) { bs = s; best = k; }
        }
      });
      this.owner[i] = best;
    }
    this.groups = ms.map(() => []);
    this.free = [];
    for (let i = 0; i < this.n; i++) (this.owner[i] >= 0 ? this.groups[this.owner[i]] : this.free).push(i);
    this.ownerIndex = idx;
    this.frontKey = '';
  };

  // ---- 戰線：交戰國國土中最靠近敵國的那一帶 ----
  Globe.prototype._frontDots = function (side, enemies) {
    const ms = this.data.markers, out = [];
    const enemyAnchors = [];
    for (const e of enemies) { const k = this.ownerIndex[e]; if (k != null) enemyAnchors.push(...ms[k].anchors); }
    if (!enemyAnchors.length) return out;
    for (const id of side) {
      const k = this.ownerIndex[id];
      if (k == null) continue;
      const g = this.groups[k];
      const dist = g.map((i) => {
        const d = this.dots[i];
        let mn = 1e9;
        for (const [la, lo, r] of enemyAnchors) mn = Math.min(mn, angDist(d.lat, d.lon, la, lo) - r);
        return mn;
      });
      const lo = Math.min(...dist);
      g.forEach((i, j) => { if (dist[j] < lo + 7) out.push(i); });
    }
    return out;
  };
  Globe.prototype._fronts = function () {
    const f = this.data.fronts, s = this.data.scorch;
    const key = this.ownKey + '#' + f.map((x) => x.a.join(',') + '/' + x.d.join(',')).join('|') + '#' + s.map((x) => x.a.join(',') + '/' + x.d.join(',')).join('|');
    if (key === this.frontKey) return;
    this.frontKey = key;
    this.frontSets = f.map((x) => this._frontDots(x.a, x.d).concat(this._frontDots(x.d, x.a)));
    this.scorchSets = s.map((x) => this._frontDots(x.a, x.d).concat(this._frontDots(x.d, x.a)));
  };

  Globe.prototype._spawn = function (e, at) {
    const ms = this.data.markers;
    const pos = e.countries.map((id) => ms.find((m) => m.id === id)).filter(Boolean);
    if (!pos.length && e.kind !== 'org') return;
    this.fx.push({ kind: e.kind, at, pos, id: e.id });
    if (['upheaval', 'famine', 'newcountry', 'war-start', 'divine'].includes(e.kind)) {
      for (const p of pos.slice(0, e.kind === 'war-start' ? 4 : 1)) this.flash[p.id] = { at, kind: e.kind };
    }
  };

  Globe.prototype._bind = function () {
    const c = this.canvas;
    let down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, lon: this.lon0, lat: this.lat0, moved: false, t: performance.now(), px: e.clientX };
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const R = this.R || 100;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (!down.moved) return;
      this.fly = null;
      this.lon0 = down.lon - (dx / R) * 57;
      if (e.pointerType === 'mouse') this.lat0 = Math.max(-60, Math.min(60, down.lat + (dy / R) * 57));
      const now = performance.now();
      this.vel = (-(e.clientX - down.px) / R) * 57 / Math.max(0.016, (now - down.t) / 1000);
      down.px = e.clientX; down.t = now;
      this.pauseUntil = now + 4000;
    });
    const up = (e) => {
      if (!down) return;
      const wasMove = down.moved;
      down = null;
      if (wasMove) return;
      this.vel = 0;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      // 先看有沒有點到標籤（事件、戰區），再看國家
      for (const t of this.tagRects) {
        if (x >= t.x - 4 && x <= t.x + t.w + 4 && y >= t.y - 4 && y <= t.y + t.h + 4) { if (this.onEvent) this.onEvent(t.tag); return; }
      }
      if (this.caption && this.caption.rect) {
        const t = this.caption.rect;
        if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) { if (this.onEvent) this.onEvent({ event: this.caption.id }); return; }
      }
      let best = null, bd = 22;
      for (const p of this.proj) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd + p.r) { bd = d - p.r; best = p; } }
      if (best && this.onPick) this.onPick(best.id);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { down = null; });
  };

  Globe.prototype._resize = function () {
    const w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w !== this.cw || h !== this.ch || dpr !== this.dpr) {
      this.cw = w; this.ch = h; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    }
    return w > 0 && h > 0;
  };

  Globe.prototype._loop = function (now) {
    requestAnimationFrame(this._loop);
    if (!this.wrap.isConnected || document.hidden) { this.last = now; return; }
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this._resize()) return;
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / 1.4);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      this.lon0 = f.fromLon + f.dLon * e;
      this.lat0 = f.fromLat + (f.toLat - f.fromLat) * e;
      if (f.t >= 1) this.fly = null;
    } else if (Math.abs(this.vel) > 0.5) {
      this.lon0 += this.vel * dt; this.vel *= Math.pow(0.04, dt);
    } else if (now > this.pauseUntil) {
      this.lon0 += this.spin * dt;
    }
    this.lon0 = ((this.lon0 + 540) % 360) - 180;
    this._draw(now / 1000, now);
  };

  Globe.prototype._draw = function (t, nowMs) {
    const ctx = this.ctx, dpr = this.dpr, W = this.cw, H = this.ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const R = (this.R = Math.min(W, H) * 0.36);
    const l0 = this.lon0 * RAD, p0 = this.lat0 * RAD;
    const sp0 = Math.sin(p0), cp0 = Math.cos(p0);
    const proj = (sp, cp, l, h) => {
      const dl = l - l0, cdl = Math.cos(dl);
      const x = cp * Math.sin(dl), y = cp0 * sp - sp0 * cp * cdl, z = sp0 * sp + cp0 * cp * cdl;
      return { x: cx + R * h * x, y: cy - R * h * y, z, vis: z > 0 || (h > 1 && Math.hypot(x, y) * h > 1) };
    };
    this._p = proj;
    // 太陽固定從左上方照過來：地球右側是夜晚，轉過去的大陸會亮起城市燈光
    const sunLon = l0 - 65 * RAD, sunLat = 12 * RAD;
    const ssl = Math.sin(sunLat), csl = Math.cos(sunLat);

    // 大氣光暈
    let g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
    g.addColorStop(0, 'rgba(56,189,248,.28)'); g.addColorStop(0.35, 'rgba(56,189,248,.08)'); g.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, TAU); ctx.fill();
    // 海洋
    g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#0d2a52'); g.addColorStop(0.7, '#061631'); g.addColorStop(1, '#030a1a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    // 夜半球陰影
    const sp = proj(ssl, csl, sunLon, 1);
    const sx = (sp.x - cx) / R, sy = (sp.y - cy) / R;
    g = ctx.createLinearGradient(cx + sx * R, cy + sy * R, cx - sx * R, cy - sy * R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.05)'); g.addColorStop(0.75, 'rgba(0,0,10,.45)'); g.addColorStop(1, 'rgba(0,0,10,.6)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    // 經緯線
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(56,189,248,.12)';
    for (let lat = -60; lat <= 60; lat += 30) this._poly(proj, (k) => pt(lat, -180 + k * 5), 73);
    for (let lon = -180; lon < 180; lon += 30) this._poly(proj, (k) => pt(-90 + k * 5, lon), 37);

    // 投影所有陸地點
    const dl0 = [];
    const light = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const d = this.dots[i];
      const dl = d.l - l0, cdl = Math.cos(dl);
      this.px[i] = cx + R * d.cp * Math.sin(dl);
      this.py[i] = cy - R * (cp0 * d.sp - sp0 * d.cp * cdl);
      this.pz[i] = sp0 * d.sp + cp0 * d.cp * cdl;
      light[i] = ssl * d.sp + csl * d.cp * Math.cos(d.l - sunLon); // >0 白天
    }
    void dl0;
    const s = Math.max(1.3, R / 120);
    const self = this;
    function dotsPass(list, colorDay, alphaK, nightDim) {
      // 依深度與日照分 4×2 組，減少換色次數
      const bins = [[], [], [], [], [], [], [], []];
      for (const i of list) {
        const z = self.pz[i];
        if (z <= 0) continue;
        const day = light[i] > -0.05 ? 1 : 0;
        bins[day * 4 + Math.min(3, (z * 4) | 0)].push(i);
      }
      const al = [0.35, 0.55, 0.75, 0.95];
      for (let b = 0; b < 8; b++) {
        if (!bins[b].length) continue;
        const day = b >= 4;
        ctx.fillStyle = css(colorDay, al[b % 4] * alphaK * (day ? 1 : nightDim));
        for (const i of bins[b]) ctx.fillRect(self.px[i] - s / 2, self.py[i] - s / 2, s, s);
      }
    }
    // 背面點（透視感）
    ctx.fillStyle = 'rgba(103,232,249,.06)';
    for (let i = 0; i < this.n; i++) if (this.pz[i] < 0 && this.pz[i] > -0.6) ctx.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s * 0.8, s * 0.8);
    // 無主陸地
    dotsPass(this.free || [], CYAN, 0.8, 0.45);
    // 各國國土
    const ms = this.data.markers;
    ms.forEach((m, k) => {
      let col = vivid(rgb(m.color));
      if (m.famine > 0) col = mix(col, FAMINE, Math.min(0.85, m.famine));
      const fl = this.flash[m.id];
      let ak = 1;
      if (fl) {
        const age = (nowMs - fl.at) / 1000;
        if (age > 3.2) delete this.flash[m.id];
        else if (age > 0) {
          const blink = 0.5 + 0.5 * Math.cos(age * 9);
          const fc = fl.kind === 'famine' ? FAMINE : fl.kind === 'war-start' ? [255, 90, 90] : fl.kind === 'upheaval' ? [255, 210, 90] : [255, 255, 255];
          col = mix(col, fc, blink * (1 - age / 3.2));
          ak = 1 + 0.4 * blink * (1 - age / 3.2);
        }
      }
      dotsPass(this.groups[k] || [], col, Math.min(1.25, ak), 0.38);
    });

    // 夜晚城市燈光：都市化越高、越富裕，燈越多
    ctx.globalCompositeOperation = 'lighter';
    ms.forEach((m, k) => {
      const L = m.light || 0;
      if (L <= 0.01) return;
      const big = [];
      ctx.fillStyle = css(CITY, 0.85);
      for (const i of this.groups[k] || []) {
        if (this.pz[i] <= 0.05 || light[i] > 0.02) continue;
        const h = this.dots[i].h;
        if (h > L) continue;
        const tw = 0.75 + 0.25 * Math.sin(t * 2 + h * 50);
        ctx.globalAlpha = Math.min(1, (0.35 + this.pz[i] * 0.65) * tw * Math.min(1, -light[i] * 6 + 0.2));
        ctx.fillRect(this.px[i] - s * 0.6, this.py[i] - s * 0.6, s * 1.2, s * 1.2);
        if (h < L * 0.18) big.push(i);
      }
      ctx.globalAlpha = 1;
      for (const i of big) {
        const r = s * 3.2;
        const gg = ctx.createRadialGradient(this.px[i], this.py[i], 0, this.px[i], this.py[i], r);
        gg.addColorStop(0, 'rgba(255,214,140,.55)'); gg.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = gg; ctx.fillRect(this.px[i] - r, this.py[i] - r, r * 2, r * 2);
      }
    });

    // 戰後焦土：餘燼慢慢淡掉
    this.data.scorch.forEach((sc, j) => {
      const set = this.scorchSets[j] || [];
      for (const i of set) {
        if (this.pz[i] <= 0) continue;
        const h = this.dots[i].h;
        const ember = h < 0.12 * sc.k ? 0.5 + 0.5 * Math.sin(t * 3 + h * 90) : 0;
        ctx.fillStyle = css(ember ? EMBER : ASH, (ember ? 0.9 * ember : 0.75) * sc.k);
        ctx.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s);
      }
    });
    // 進行中的戰線：前線閃爍、砲火
    this.data.fronts.forEach((fr, j) => {
      const set = this.frontSets[j] || [];
      for (const i of set) {
        if (this.pz[i] <= 0) continue;
        const h = this.dots[i].h;
        const f = 0.5 + 0.5 * Math.sin(t * 7 + h * 60);
        ctx.fillStyle = css(f > 0.8 ? [255, 200, 120] : [255, 70, 60], 0.35 + 0.6 * f);
        ctx.fillRect(this.px[i] - s * 0.6, this.py[i] - s * 0.6, s * 1.2, s * 1.2);
        // 偶爾的爆炸閃光
        const ph = (t * 0.9 + h * 7) % 1;
        if (h < 0.05 && ph < 0.25) {
          const r = s * (2 + ph * 14);
          ctx.strokeStyle = `rgba(255,170,90,${(1 - ph * 4) * 0.9})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(this.px[i], this.py[i], r, 0, TAU); ctx.stroke();
        }
      }
    });
    ctx.globalCompositeOperation = 'source-over';

    // 邊緣亮線
    ctx.strokeStyle = 'rgba(125,211,252,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // 貿易、同盟、戰爭弧線（流動光點）
    const mk = {};
    for (const m of ms) mk[m.id] = m;
    for (const ln of this.data.links) {
      const A = mk[ln.a], B = mk[ln.b];
      if (A && B) this._arc(proj, A, B, ln, t);
    }

    // 事件動畫
    this._effects(proj, nowMs, R);

    // 國家標記
    this.proj = [];
    ctx.font = '600 11px "Noto Sans TC","PingFang TC",system-ui,sans-serif';
    ctx.textAlign = 'center';
    const sorted = ms.slice().sort((a, b) => a.size - b.size);
    const labels = [];
    for (const m of sorted) {
      const q = pt(m.lat, m.lon);
      const p = proj(q.sp, q.cp, q.l, 1);
      if (p.z <= 0.02) continue;
      const r = Math.max(2.5, m.size * (R / 160)) * (0.6 + 0.4 * p.z);
      const a = Math.min(1, 0.25 + p.z);
      const col = rgb(m.color);
      const ph = (t * 0.6 + (m.lon + 180) / 360) % 1;
      ctx.strokeStyle = m.war ? '#f87171' : css(vivid(col), 1); ctx.lineWidth = 1;
      ctx.globalAlpha = a * (1 - ph) * 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + ph * r * 2.2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a;
      g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
      g.addColorStop(0, css(vivid(col), 1)); g.addColorStop(0.45, css(vivid(col), 0.45)); g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, r * 0.28), 0, TAU); ctx.fill();
      if (m.id === this.data.focus) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4;
        const rr = r + 6, rot = t * 1.2;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(p.x, p.y, rr, rot + k * Math.PI / 2, rot + k * Math.PI / 2 + 0.9); ctx.stroke(); }
      }
      if (p.z > 0.3) labels.push({ m, x: p.x, y: p.y, r, a });
      ctx.globalAlpha = 1;
      this.proj.push({ id: m.id, x: p.x, y: p.y, r, z: p.z });
    }
    // 國名標籤：國家多時會互相重疊，先畫觀察國與大國，被擋住的小國就不畫（點圓點仍可開啟）
    const placed = [];
    labels.sort((x, y) => (y.m.id === this.data.focus) - (x.m.id === this.data.focus) || y.m.size - x.m.size);
    for (const L of labels) {
      const tw = ctx.measureText(L.m.name).width + 8;
      const box = [L.x - tw / 2, L.y + L.r + 3, tw, 15];
      if (placed.some((b) => box[0] < b[0] + b[2] && b[0] < box[0] + box[2] && box[1] < b[1] + b[3] && b[1] < box[1] + box[3])) continue;
      placed.push(box);
      ctx.globalAlpha = L.a;
      ctx.fillStyle = 'rgba(5,7,13,.65)';
      ctx.fillRect(box[0], box[1], box[2], box[3]);
      ctx.fillStyle = L.m.id === this.data.focus ? '#fde68a' : '#e6ecff';
      ctx.fillText(L.m.name, L.x, L.y + L.r + 14);
    }
    ctx.globalAlpha = 1;

    this._tags(t);
    this._hud(cx, cy, R, t);
    this._caption(nowMs);
  };

  Globe.prototype._poly = function (proj, fn, n) {
    const ctx = this.ctx;
    let pen = false;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const q = fn(k); const p = proj(q.sp, q.cp, q.l, 1);
      if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
    }
    ctx.stroke();
  };

  // 兩國之間的弧線，回傳取樣點（投影後）
  Globe.prototype._arcPts = function (proj, A, B, N) {
    const v = (m) => { const p = m.lat * RAD, l = m.lon * RAD; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
    const a = v(A), b = v(B);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const om = Math.acos(dot);
    if (om < 1e-3) return null;
    const so = Math.sin(om), lift = 0.08 + om * 0.12, out = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const k1 = Math.sin((1 - f) * om) / so, k2 = Math.sin(f * om) / so;
      const x = k1 * a[0] + k2 * b[0], y = k1 * a[1] + k2 * b[1], z = k1 * a[2] + k2 * b[2];
      out.push(proj(z, Math.hypot(x, y), Math.atan2(y, x), 1 + lift * Math.sin(Math.PI * f)));
    }
    return out;
  };

  Globe.prototype._arc = function (proj, A, B, ln, t) {
    const ctx = this.ctx, N = 48;
    const pts = this._arcPts(proj, A, B, N);
    if (!pts) return;
    const type = ln.type;
    const style = type === 'war' ? ['rgba(248,113,113,.9)', 1.6, [5, 4]]
      : type === 'alliance' ? ['rgba(56,189,248,.55)', 1.1, []]
        : ['rgba(52,211,153,' + (0.12 + 0.25 * (ln.k || 0)) + ')', 0.8, []];
    ctx.strokeStyle = style[0]; ctx.lineWidth = style[1];
    ctx.setLineDash(style[2]);
    ctx.lineDashOffset = type === 'war' ? -t * 18 : 0;
    ctx.beginPath();
    let pen = false;
    for (const p of pts) { if (p.vis) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
    ctx.stroke();
    ctx.setLineDash([]);
    if (reduceMotion) return;
    // 流動光點：戰爭＝雙方互射的火光；同盟＝藍色往來；貿易＝綠色貨流
    const n = type === 'war' ? 3 : type === 'alliance' ? 2 : 1 + Math.round((ln.k || 0) * 2);
    const speed = type === 'war' ? 0.45 : type === 'alliance' ? 0.18 : 0.12;
    const col = type === 'war' ? [255, 190, 120] : type === 'alliance' ? [125, 211, 252] : [110, 231, 183];
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n * 2; k++) {
      const back = k % 2 === 1;
      let f = (t * speed + k / (n * 2) + hash(k + A.lat * 7) * 0.3) % 1;
      if (back) f = 1 - f;
      const i = Math.min(N, Math.round(f * N));
      const p = pts[i];
      if (!p.vis) continue;
      const r = type === 'war' ? 3.2 : 2.2;
      const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      gg.addColorStop(0, css(col, 0.95)); gg.addColorStop(1, css(col, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, TAU); ctx.fill();
      // 尾巴
      const j = Math.max(0, Math.min(N, i + (back ? 3 : -3)));
      const q = pts[j];
      if (q.vis) { ctx.strokeStyle = css(col, 0.5); ctx.lineWidth = r * 0.7; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  // 以某國為中心、角半徑 rho 的地表圓圈
  Globe.prototype._ring = function (proj, m, rhoDeg) {
    const ctx = this.ctx;
    const la = m.lat * RAD, lo = m.lon * RAD, rho = rhoDeg * RAD;
    const sla = Math.sin(la), cla = Math.cos(la), sr = Math.sin(rho), cr = Math.cos(rho);
    let pen = false;
    ctx.beginPath();
    for (let k = 0; k <= 72; k++) {
      const b = (k / 72) * TAU;
      const lat2 = Math.asin(sla * cr + cla * sr * Math.cos(b));
      const lon2 = lo + Math.atan2(Math.sin(b) * sr * cla, cr - sla * Math.sin(lat2));
      const p = proj(Math.sin(lat2), Math.cos(lat2), lon2, 1);
      if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
    }
    ctx.stroke();
  };

  Globe.prototype._effects = function (proj, nowMs, R) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    this.fx = this.fx.filter((f) => {
      const age = (nowMs - f.at) / 1000;
      const dur = f.kind === 'tech-first' ? 6 : f.kind === 'upheaval' ? 4.5 : 3.5;
      if (age > dur) return false;
      if (age < 0) return true;
      const k = KIND[f.kind] || KIND.org;
      const fade = 1 - age / dur;
      if (f.kind === 'tech-first') {
        // 新科技從發明國擴散到全世界
        const m = f.pos[0];
        const rho = Math.min(179, age / dur * 185);
        for (let j = 0; j < 3; j++) {
          ctx.strokeStyle = css(k.color, fade * (0.8 - j * 0.25)); ctx.lineWidth = 2.4 - j * 0.6;
          this._ring(proj, m, Math.max(0.5, rho - j * 4));
        }
      } else if (f.kind === 'org') {
        for (let a = 0; a < f.pos.length; a++) for (let b = a + 1; b < f.pos.length; b++) {
          const pts = this._arcPts(proj, f.pos[a], f.pos[b], 32);
          if (!pts) continue;
          ctx.strokeStyle = css(k.color, fade); ctx.lineWidth = 2.5;
          ctx.beginPath(); let pen = false;
          for (const p of pts) { if (p.vis) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
          ctx.stroke();
        }
      } else {
        const list = f.kind === 'war-start' ? f.pos.slice(0, 4) : f.pos.slice(0, 1);
        for (const m of list) {
          const waves = f.kind === 'upheaval' ? 4 : 3;
          const maxR = f.kind === 'upheaval' ? 22 : f.kind === 'tech' ? 6 : f.kind === 'newcountry' ? 14 : 16;
          for (let j = 0; j < waves; j++) {
            const ph = (age * (f.kind === 'upheaval' ? 0.9 : 1.2) - j * 0.28);
            if (ph < 0 || ph > 1) continue;
            ctx.strokeStyle = css(k.color, (1 - ph) * 0.9 * fade + 0.05); ctx.lineWidth = f.kind === 'upheaval' ? 2.4 : 1.8;
            this._ring(proj, m, 0.5 + ph * maxR);
          }
          if (f.kind === 'newcountry' || f.kind === 'war-start') {
            const q = pt(m.lat, m.lon), p = proj(q.sp, q.cp, q.l, 1);
            if (p.z > 0) {
              for (let j = 0; j < 8; j++) {
                const ang = j / 8 * TAU + age, d = (8 + age * 30) * (R / 200);
                ctx.fillStyle = css(k.color, fade);
                ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, 1.8, 0, TAU); ctx.fill();
              }
            }
          }
        }
      }
      return true;
    });
    ctx.globalCompositeOperation = 'source-over';
  };

  // 可點的標籤：戰區、饑荒、革命……點了看原因或戰場畫面
  Globe.prototype._tags = function (t) {
    const ctx = this.ctx;
    this.tagRects = [];
    const at = {};
    for (const p of this.proj) at[p.id] = p;
    const stack = {};
    ctx.font = '600 11px "Noto Sans TC","PingFang TC",system-ui,sans-serif';
    ctx.textAlign = 'left';
    for (const tag of this.data.tags) {
      const p = at[tag.country];
      if (!p || p.z < 0.25) continue;
      const n = stack[tag.country] = (stack[tag.country] || 0) + 1;
      const k = KIND[tag.kind] || KIND.org;
      const label = k.icon + ' ' + tag.label;
      const w = Math.min(160, ctx.measureText(label).width + 14), h = 18;
      const x = Math.max(4, Math.min(this.cw - w - 4, p.x - w / 2)), y = p.y - p.r - 10 - n * (h + 4);
      const pulse = tag.kind === 'war-start' ? 0.55 + 0.45 * Math.sin(t * 5) : 1;
      ctx.fillStyle = 'rgba(5,7,13,.82)';
      ctx.strokeStyle = css(k.color, 0.5 + 0.5 * pulse); ctx.lineWidth = 1;
      ctx.beginPath(); roundRect(ctx, x, y, w, h, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = css(k.color, 1);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w - 6, h); ctx.clip();
      ctx.fillText(label, x + 7, y + 13); ctx.restore();
      ctx.strokeStyle = css(k.color, 0.4); ctx.beginPath(); ctx.moveTo(p.x, p.y - p.r - 2); ctx.lineTo(p.x, y + h); ctx.stroke();
      this.tagRects.push({ x, y, w, h, tag });
    }
  };

  Globe.prototype._caption = function (nowMs) {
    const c = this.caption;
    if (!c) return;
    const age = (nowMs - c.at) / 1000;
    if (age > 5) { this.caption = null; return; }
    const ctx = this.ctx;
    const a = Math.min(1, age * 4, (5 - age) * 1.5);
    const k = KIND[c.kind] || KIND.org;
    ctx.font = '600 12.5px "Noto Sans TC","PingFang TC",system-ui,sans-serif';
    ctx.textAlign = 'left';
    const head = '● 即時';
    const text = c.text.length > 26 ? c.text.slice(0, 25) + '…' : c.text;
    const w = Math.min(this.cw - 24, ctx.measureText(head + '  ' + text).width + 22), h = 26;
    const x = (this.cw - w) / 2, y = this.ch - h - 46;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,7,13,.85)'; ctx.strokeStyle = css(k.color, 0.8); ctx.lineWidth = 1;
    ctx.beginPath(); roundRect(ctx, x, y, w, h, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f87171'; ctx.fillText(head, x + 11, y + 17);
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(text, x + 11 + ctx.measureText(head + '  ').width, y + 17);
    ctx.globalAlpha = 1;
    c.rect = { x, y, w, h };
  };

  Globe.prototype._hud = function (cx, cy, R, t) {
    const ctx = this.ctx;
    const R1 = R * 1.16, R2 = R * 1.26;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.05);
    ctx.strokeStyle = 'rgba(56,189,248,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, long = i % 10 === 0;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R1, Math.sin(a) * R1);
      ctx.lineTo(Math.cos(a) * (R1 + (long ? 8 : 3)), Math.sin(a) * (R1 + (long ? 8 : 3))); ctx.stroke();
    }
    ctx.rotate(-t * 0.13);
    ctx.strokeStyle = 'rgba(167,139,250,.45)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, R2, k * 2.094, k * 2.094 + 1.3); ctx.stroke(); }
    ctx.restore();
    const sa = (t * 0.7) % TAU;
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(56,189,248,${0.22 * (1 - i / 14)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R1 - 4, sa - i * 0.035 - 0.035, sa - i * 0.035); ctx.stroke();
    }
    const b = Math.min(this.cw, this.ch) * 0.06, m = 8;
    ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 1.5;
    [[m, m, 1, 1], [this.cw - m, m, -1, 1], [m, this.ch - m, 1, -1], [this.cw - m, this.ch - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
    });
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  let inst = null;
  window.WSGlobe = {
    get() { if (!inst) inst = new Globe(); return inst; }
  };
})();
