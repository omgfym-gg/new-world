// 事件即時畫面（介面裝飾，只畫圖，不讀寫任何模擬數值）。
// 饑荒、革命／政變／示威、新國家、新科技、國際組織、停戰……各有一種動畫場景。
// 場景裡的顏色（國旗色）、強度（饑荒嚴重度、群眾人數）、科技種類都來自 app.js 從事件紀錄讀出的資料。
// 畫面是電腦依數據畫出來的動畫，不是真實影像。細節用固定種子的偽亂數，不使用 Math.random。
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  function prng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function rgb(hex) { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : [200, 200, 200]; }
  function css(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a == null ? 1 : a})`; }
  function bright(c) { const m = Math.max(c[0], c[1], c[2]); const k = m < 160 ? 160 / Math.max(1, m) : 1; return [c[0] * k, c[1] * k, c[2] * k]; }

  function SceneCam(canvas, data) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.d = data;
    this.alive = true; this.t0 = 0; this.last = 0;
    this.parts = []; this.rand = prng(99);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  SceneCam.prototype.stop = function () { this.alive = false; };
  SceneCam.prototype._loop = function (now) {
    if (!this.alive || !this.c.isConnected) return;
    requestAnimationFrame(this._loop);
    if (!this.t0) this.t0 = now;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    const W = this.c.clientWidth, H = this.c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!W || !H) return;
    if (this.c.width !== Math.round(W * dpr) || this.c.height !== Math.round(H * dpr)) { this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr); }
    // 所有場景都畫在固定的 480×270 畫布上，再縮放到實際大小，手機和電腦看起來一致
    const LW = 480, LH = 270;
    this.W = LW; this.H = LH;
    const ctx = this.ctx;
    ctx.setTransform(dpr * W / LW, 0, 0, dpr * H / LH, 0, 0);
    const t = (now - this.t0) / 1000;
    const fn = this['s_' + this.d.scene] || this.s_upheaval;
    fn.call(this, ctx, LW, LH, t, dt);
    this._overlay(ctx, LW, LH, t);
  };

  // ---------- 共用小工具 ----------
  SceneCam.prototype.sky = function (ctx, W, H, top, bottom, horizon) {
    const g = ctx.createLinearGradient(0, 0, 0, H * (horizon || 0.7));
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  SceneCam.prototype.ground = function (ctx, W, H, y, color) { ctx.fillStyle = color; ctx.fillRect(0, y, W, H - y); };
  SceneCam.prototype.person = function (ctx, x, y, sc, color, arm) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 1.4 * sc, y - 9 * sc, 2.8 * sc, 7 * sc);
    ctx.fillRect(x - 1.4 * sc, y - 2.2 * sc, 1.1 * sc, 2.2 * sc); ctx.fillRect(x + 0.3 * sc, y - 2.2 * sc, 1.1 * sc, 2.2 * sc);
    ctx.beginPath(); ctx.arc(x, y - 10.8 * sc, 1.9 * sc, 0, TAU); ctx.fill();
    if (arm != null) { ctx.strokeStyle = color; ctx.lineWidth = 0.9 * sc; ctx.beginPath(); ctx.moveTo(x, y - 8 * sc); ctx.lineTo(x + Math.cos(arm) * 5 * sc, y - 8 * sc - Math.sin(arm) * 5 * sc); ctx.stroke(); }
  };
  SceneCam.prototype.flag = function (ctx, x, y, w, h, t, colors, pole) {
    if (pole) { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + pole); ctx.stroke(); }
    const n = 10;
    colors.forEach((c, k) => {
      ctx.fillStyle = css(c);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const xx = x + (w * i) / n, yy = y + (h * k) / colors.length + Math.sin(t * 4 + i * 0.7) * (i / n) * 2.4; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      for (let i = n; i >= 0; i--) { const xx = x + (w * i) / n, yy = y + (h * (k + 1)) / colors.length + Math.sin(t * 4 + i * 0.7) * (i / n) * 2.4; ctx.lineTo(xx, yy); }
      ctx.fill();
    });
  };
  SceneCam.prototype.skyline = function (ctx, W, baseY, color, seed, lit) {
    const r = prng(seed);
    let x = -10;
    while (x < W + 10) {
      const w = 18 + r() * 34, h = 26 + r() * 70;
      ctx.fillStyle = color; ctx.fillRect(x, baseY - h, w, h);
      if (lit) { for (let yy = baseY - h + 6; yy < baseY - 4; yy += 7) for (let xx = x + 4; xx < x + w - 4; xx += 6) if (r() < lit) { ctx.fillStyle = 'rgba(255,214,140,.75)'; ctx.fillRect(xx, yy, 2.4, 3); } }
      x += w + 2 + r() * 6;
    }
  };
  SceneCam.prototype.smoke = function (ctx, x, y, t, n, col, seed) {
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.25 + r()) % 1;
      const xx = x + (r() - 0.5) * 10 + ph * 30, yy = y - ph * 90, rr = 6 + ph * 22;
      ctx.fillStyle = css(col, (1 - ph) * 0.35); ctx.beginPath(); ctx.arc(xx, yy, rr, 0, TAU); ctx.fill();
    }
  };
  SceneCam.prototype.fire = function (ctx, x, y, t, s) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const fl = 0.6 + 0.4 * Math.sin(t * 12 + i * 2);
      const g = ctx.createRadialGradient(x + (i - 3) * 2 * s, y - 6 * s * fl, 0, x, y - 6 * s, 12 * s);
      g.addColorStop(0, 'rgba(255,230,150,.7)'); g.addColorStop(0.5, 'rgba(255,120,30,.45)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 6 * s, 12 * s, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  SceneCam.prototype.crowd = function (ctx, W, y0, depth, n, colors, t, seed, mode) {
    const r = prng(seed);
    const people = [];
    for (let i = 0; i < n; i++) people.push({ x: r() * W, d: r(), c: colors[(r() * colors.length) | 0], ph: r() * TAU, sign: r() < 0.18 });
    people.sort((a, b) => a.d - b.d);
    for (const p of people) {
      const sc = 0.8 + p.d * 1.1, y = y0 + p.d * depth;
      const bob = mode === 'cheer' ? Math.abs(Math.sin(t * 5 + p.ph)) * 2 : Math.sin(t * 3 + p.ph) * 0.8;
      const arm = mode === 'cheer' || mode === 'protest' ? Math.PI / 2 + Math.sin(t * 4 + p.ph) * 0.5 : mode === 'queue' ? -0.3 : null;
      this.person(ctx, p.x + (mode === 'march' ? (t * 8) % 40 : 0), y - bob, sc, css(p.c, 0.95), arm);
      if (p.sign && mode === 'protest') {
        const x = p.x + Math.cos(Math.PI / 2 + Math.sin(t * 4 + p.ph) * 0.5) * 5 * sc;
        ctx.fillStyle = '#f1f5f9'; ctx.fillRect(x - 6 * sc, y - bob - 22 * sc, 12 * sc, 7 * sc);
        ctx.fillStyle = css(p.c); ctx.fillRect(x - 4.5 * sc, y - bob - 20 * sc, 9 * sc, 1.4 * sc); ctx.fillRect(x - 4.5 * sc, y - bob - 18 * sc, 6 * sc, 1.4 * sc);
      }
    }
  };

  // ---------- 場景 ----------
  // 饑荒、旱災：龜裂大地、枯萎作物、排隊領糧
  SceneCam.prototype.s_famine = function (ctx, W, H, t) {
    const sev = this.d.intensity;
    this.sky(ctx, W, H, '#6b4a22', '#d8a85a');
    const sun = ctx.createRadialGradient(W * 0.75, H * 0.22, 0, W * 0.75, H * 0.22, H * 0.5);
    sun.addColorStop(0, 'rgba(255,240,190,.95)'); sun.addColorStop(0.15, 'rgba(255,200,110,.6)'); sun.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    const gy = H * 0.62;
    this.ground(ctx, W, H, gy, '#8a6a3c');
    const r = prng(5);
    ctx.strokeStyle = 'rgba(60,40,20,.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) { let x = r() * W, y = gy + r() * (H - gy); ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.3) * 10; ctx.lineTo(x, y); } ctx.stroke(); }
    // 枯萎作物
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = gy + 4 + r() * (H - gy - 10), h = 8 + r() * 12;
      const sway = Math.sin(t * 1.5 + x * 0.05) * 2;
      ctx.strokeStyle = `rgba(${150 - sev * 40},${120 - sev * 50},60,.9)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sway, y - h * 0.6, x + sway + 4 * sev, y - h * (1 - sev * 0.4)); ctx.stroke();
    }
    // 糧車與排隊人群（人數依嚴重度）
    const cx = W * 0.22, cy = gy + 18;
    ctx.fillStyle = '#4a3420'; ctx.fillRect(cx - 22, cy - 18, 44, 14);
    ctx.fillStyle = '#d6c08a'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx - 14 + k * 9, cy - 20, 5, 4, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2a1d10'; ctx.beginPath(); ctx.arc(cx - 12, cy - 3, 5, 0, TAU); ctx.arc(cx + 12, cy - 3, 5, 0, TAU); ctx.fill();
    const n = Math.round(6 + sev * 18);
    for (let i = 0; i < n; i++) this.person(ctx, cx + 34 + i * 13 + Math.sin(t * 2 + i) * 0.6, cy + (i % 2) * 3, 1.1, i % 3 ? 'rgba(70,50,30,.95)' : 'rgba(100,70,40,.95)', i === 0 ? 0.1 : null);
    // 熱浪與沙塵
    for (let i = 0; i < 30; i++) { const ph = (t * 0.2 + i / 30) % 1; ctx.fillStyle = `rgba(230,190,120,${0.25 * (1 - ph)})`; ctx.beginPath(); ctx.arc(((i * 97) % W) + ph * 80, gy - 10 - ph * 40, 2 + ph * 4, 0, TAU); ctx.fill(); }
  };

  // 革命、政變、示威、制度轉變
  SceneCam.prototype.s_upheaval = function (ctx, W, H, t) {
    const v = this.d.variant, col = bright(rgb(this.d.colors[0]));
    const night = v === 'revolution' || v === 'coup';
    this.sky(ctx, W, H, night ? '#0b1020' : '#1e293b', night ? '#3b2030' : '#64748b');
    if (night) { const g = ctx.createRadialGradient(W * 0.5, H * 0.65, 0, W * 0.5, H * 0.65, W * 0.6); g.addColorStop(0, 'rgba(255,110,40,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const gy = H * 0.6;
    this.skyline(ctx, W, gy, night ? '#0e0f18' : '#2b3446', 11, night ? 0.25 : 0.05);
    // 政府大樓與旗子：成功的革命會換上新旗
    const bx = W * 0.5;
    ctx.fillStyle = night ? '#161826' : '#3a4558'; ctx.fillRect(bx - 60, gy - 70, 120, 70);
    ctx.beginPath(); ctx.moveTo(bx - 66, gy - 70); ctx.lineTo(bx, gy - 96); ctx.lineTo(bx + 66, gy - 70); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = night ? '#232638' : '#4b586e'; ctx.fillRect(bx - 52 + i * 20, gy - 62, 8, 58); }
    const flagCols = v === 'coup' ? [[60, 70, 50], col] : v === 'newregime' || v === 'revolution' ? [col, [245, 245, 245]] : [col];
    this.flag(ctx, bx + 2, gy - 128, 26, 16, t, flagCols, 34);
    this.ground(ctx, W, H, gy, night ? '#15121a' : '#3a3f4a');
    if (v === 'coup') {
      // 坦克與士兵進城
      for (let i = 0; i < 3; i++) {
        const x = ((t * 18 + i * 120) % (W + 120)) - 60, y = gy + 22 + i * 10;
        ctx.fillStyle = '#3f4a33'; ctx.fillRect(x - 16, y - 10, 32, 8); ctx.fillRect(x - 8, y - 15, 16, 6);
        ctx.strokeStyle = '#3f4a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, y - 12); ctx.lineTo(x + 22, y - 13); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.fillRect(x - 16, y - 3, 32, 3);
      }
      for (let i = 0; i < 14; i++) this.person(ctx, ((t * 14 + i * 37) % (W + 40)) - 20, gy + 50 + (i % 3) * 6, 1.1, 'rgba(70,85,60,.95)', 0.2);
      // 探照燈
      for (let k = 0; k < 2; k++) {
        const a = -Math.PI / 2 + Math.sin(t * 0.6 + k * 2) * 0.6, x = W * (0.2 + k * 0.6);
        ctx.fillStyle = 'rgba(220,230,255,.08)'; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + Math.cos(a - 0.08) * H, gy + Math.sin(a - 0.08) * H); ctx.lineTo(x + Math.cos(a + 0.08) * H, gy + Math.sin(a + 0.08) * H); ctx.fill();
      }
    } else {
      const n = Math.round(30 + this.d.intensity * 70);
      this.crowd(ctx, W, gy + 14, H - gy - 22, n, [col, [200, 200, 210], [150, 150, 165]], t, 23, v === 'protest' || v === 'democratization' ? 'protest' : 'cheer');
      // 群眾舉旗
      for (let i = 0; i < 5; i++) this.flag(ctx, W * (0.1 + i * 0.2) + Math.sin(t + i) * 3, gy + 4 + (i % 2) * 8, 14, 9, t + i, [col], 22);
      if (v === 'revolution') { this.fire(ctx, W * 0.15, gy + 6, t, 1.4); this.fire(ctx, W * 0.86, gy + 10, t + 1, 1.1); this.smoke(ctx, W * 0.15, gy - 6, t, 8, [60, 50, 50], 3); this.smoke(ctx, W * 0.86, gy - 2, t, 6, [60, 50, 50], 4); }
    }
  };

  // 新國家誕生：升旗、歡呼、煙火
  SceneCam.prototype.s_newcountry = function (ctx, W, H, t) {
    const col = bright(rgb(this.d.colors[0])), old = bright(rgb(this.d.colors[1] || '#888888'));
    this.sky(ctx, W, H, '#0a0f24', '#2a2348');
    const gy = H * 0.66;
    this.skyline(ctx, W, gy, '#121428', 41, 0.3);
    // 煙火
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.45 + k * 0.27) % 1, x = W * (0.15 + k * 0.23), y = H * (0.18 + (k % 2) * 0.1);
      const c = k % 2 ? col : [255, 230, 160];
      if (ph < 0.25) { ctx.fillStyle = css(c, 0.9); ctx.fillRect(x - 1, gy - (gy - y) * (ph / 0.25), 2, 6); }
      else { const e = (ph - 0.25) / 0.75; for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, d = e * 46; ctx.fillStyle = css(c, 1 - e); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + e * e * 14, 1.8, 0, TAU); ctx.fill(); } }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.ground(ctx, W, H, gy, '#1a1a2a');
    // 舊旗降下、新旗升起（循環）
    const cyc = (t % 8) / 8, rise = Math.min(1, cyc * 2.2);
    const px = W * 0.5, top = gy - 120;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, gy); ctx.lineTo(px, top); ctx.stroke();
    if (rise < 1) this.flag(ctx, px + 1, top + 2 + rise * 90, 34, 20, t, [old], 0);
    this.flag(ctx, px + 1, gy - 22 - rise * 96, 34, 22, t, [col, [250, 250, 250]], 0);
    const g = ctx.createRadialGradient(px, top + 20, 0, px, top + 20, 90); g.addColorStop(0, css(col, 0.22 * rise)); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.crowd(ctx, W, gy + 12, H - gy - 18, 70, [col, [220, 220, 230], [160, 160, 180]], t, 7, 'cheer');
  };

  // 新科技：依領域換場景
  SceneCam.prototype.s_tech = function (ctx, W, H, t) {
    const f = this.d.variant, col = bright(rgb(this.d.colors[0]));
    const gy = H * 0.68;
    if (f === 'space' || f === 'military') {
      this.sky(ctx, W, H, '#020617', '#1e1b4b');
      for (let i = 0; i < 60; i++) { const r = prng(i + 1); ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; ctx.fillRect(r() * W, r() * gy, 1.2, 1.2); }
      this.ground(ctx, W, H, gy, '#0f172a');
      const cyc = (t % 9) / 9, lift = cyc < 0.25 ? 0 : Math.pow((cyc - 0.25) / 0.75, 2) * (gy + 80);
      const x = W * 0.5, y = gy - 10 - lift;
      ctx.fillStyle = '#334155'; ctx.fillRect(x - 40, gy - 90, 8, 90); ctx.fillRect(x - 40, gy - 60, 30, 3);
      if (cyc > 0.18) { this.smoke(ctx, x, gy, t * 2, 16, [180, 180, 190], 9); this.fire(ctx, x, y + 36, t, 1.4 + (cyc > 0.25 ? 0.6 : 0)); }
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x - 7, y - 50, 14, 80);
      ctx.beginPath(); ctx.moveTo(x - 7, y - 50); ctx.lineTo(x, y - 70); ctx.lineTo(x + 7, y - 50); ctx.fill();
      ctx.fillStyle = css(col); ctx.fillRect(x - 7, y - 20, 14, 6);
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(x - 7, y + 30); ctx.lineTo(x - 15, y + 30); ctx.lineTo(x - 7, y + 14); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 7, y + 30); ctx.lineTo(x + 15, y + 30); ctx.lineTo(x + 7, y + 14); ctx.fill();
    } else if (f === 'medicine' || f === 'info') {
      // 實驗室／電腦室
      this.sky(ctx, W, H, '#0b1324', '#14233d', 1);
      ctx.fillStyle = '#0f1b30'; ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = '#22324f'; ctx.fillRect(W * 0.08, gy - 6, W * 0.84, 8);
      if (f === 'medicine') {
        for (let i = 0; i < 6; i++) {
          const x = W * (0.16 + i * 0.13), h = 26 + (i % 3) * 8, c = i % 2 ? col : [110, 231, 183];
          ctx.strokeStyle = 'rgba(200,230,255,.7)'; ctx.lineWidth = 1.4; ctx.strokeRect(x - 8, gy - 6 - h, 16, h);
          ctx.fillStyle = css(c, 0.55); ctx.fillRect(x - 7, gy - 6 - h * 0.55, 14, h * 0.55 - 1);
          for (let k = 0; k < 4; k++) { const ph = (t * 0.8 + k / 4 + i * 0.13) % 1; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - 4 + k * 3, gy - 8 - ph * h * 0.5, 1.2, 0, TAU); ctx.fill(); }
        }
        for (let i = 0; i < 3; i++) this.person(ctx, W * (0.25 + i * 0.25), gy + 40 + Math.sin(t + i) * 0.5, 2.2, '#e2e8f0', -0.4 + Math.sin(t * 2 + i) * 0.3);
        // 顯微鏡視野
        const mx = W * 0.82, my = H * 0.24, mr = H * 0.15;
        ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
        ctx.fillStyle = '#062a24'; ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
        for (let i = 0; i < 9; i++) { const a = t * 0.4 + i, d = (i * 7) % mr; ctx.strokeStyle = 'rgba(110,231,183,.8)'; ctx.beginPath(); ctx.arc(mx + Math.cos(a) * d * 0.7, my + Math.sin(a * 1.3) * d * 0.6, 4 + (i % 3), 0, TAU); ctx.stroke(); }
        ctx.restore(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke();
      } else {
        for (let i = 0; i < 5; i++) {
          const x = W * (0.1 + i * 0.17), w = W * 0.13, h = 56;
          ctx.fillStyle = '#1e293b'; ctx.fillRect(x, gy - 6 - h - 30, w, h + 30);
          ctx.fillStyle = '#020617'; ctx.fillRect(x + 4, gy - h - 30, w - 8, h - 14);
          for (let k = 0; k < 6; k++) { const len = ((Math.sin(t * 3 + k * 1.7 + i) + 1) / 2) * (w - 16); ctx.fillStyle = k % 2 ? css(col, 0.9) : 'rgba(110,231,183,.9)'; ctx.fillRect(x + 8, gy - h - 26 + k * 6, len, 2); }
          for (let k = 0; k < 4; k++) { ctx.fillStyle = (Math.floor(t * 4 + k + i) % 3) ? 'rgba(251,191,36,.9)' : 'rgba(251,191,36,.2)'; ctx.fillRect(x + 6 + k * 6, gy - 20, 3, 3); }
        }
        // 電波
        for (let k = 0; k < 4; k++) { const ph = (t * 0.5 + k / 4) % 1; ctx.strokeStyle = `rgba(56,189,248,${1 - ph})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.08, 10 + ph * 80, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
      }
    } else if (f === 'transport') {
      this.sky(ctx, W, H, '#1d4ed8', '#93c5fd');
      this.ground(ctx, W, H, gy, '#3f6212');
      ctx.fillStyle = '#4d4d4d'; ctx.fillRect(0, gy + 18, W, 5);
      for (let x = 0; x < W; x += 10) { ctx.fillStyle = '#6b4f2c'; ctx.fillRect(x, gy + 22, 6, 3); }
      const tx = ((t * 70) % (W + 260)) - 200;
      for (let k = 0; k < 4; k++) { ctx.fillStyle = k === 3 ? css(col) : '#334155'; ctx.fillRect(tx + k * 50, gy - 6, 46, 24); ctx.fillStyle = 'rgba(255,240,200,.85)'; for (let j = 0; j < 4; j++) ctx.fillRect(tx + k * 50 + 5 + j * 10, gy, 6, 6); }
      this.smoke(ctx, tx + 190, gy - 8, t, 6, [230, 230, 230], 5);
      const ax = ((t * 120) % (W + 200)) - 100, ay = H * 0.22;
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(ax - 18, ay - 2, 36, 5); ctx.beginPath(); ctx.moveTo(ax - 4, ay); ctx.lineTo(ax - 12, ay - 12); ctx.lineTo(ax + 2, ay); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax - 18, ay + 1); ctx.lineTo(ax - 120, ay + 1); ctx.stroke();
    } else if (f === 'agri') {
      this.sky(ctx, W, H, '#38bdf8', '#e0f2fe');
      this.ground(ctx, W, H, gy, '#4d7c0f');
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#65a30d' : '#84cc16'; ctx.fillRect(0, gy + i * ((H - gy) / 9), W, (H - gy) / 9); }
      for (let i = 0; i < 90; i++) { const x = (i * 37) % W, y = gy + ((i * 53) % (H - gy)); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t * 2 + i) * 2, y - 9); ctx.stroke(); }
      const x = ((t * 40) % (W + 100)) - 50, y = gy + 26;
      ctx.fillStyle = css(col); ctx.fillRect(x - 14, y - 14, 28, 10); ctx.fillRect(x - 2, y - 24, 12, 10);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - 8, y - 2, 6, 0, TAU); ctx.arc(x + 10, y, 4, 0, TAU); ctx.fill();
      this.smoke(ctx, x + 8, y - 26, t, 4, [200, 200, 200], 8);
    } else {
      // 工業、能源：工廠與發電廠
      this.sky(ctx, W, H, '#1f2937', '#9ca3af');
      this.ground(ctx, W, H, gy, '#374151');
      for (let i = 0; i < 4; i++) {
        const x = W * (0.12 + i * 0.22);
        if (f === 'energy') {
          ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.moveTo(x - 20, gy); ctx.quadraticCurveTo(x - 10, gy - 40, x - 14, gy - 70); ctx.lineTo(x + 14, gy - 70); ctx.quadraticCurveTo(x + 10, gy - 40, x + 20, gy); ctx.fill();
          this.smoke(ctx, x, gy - 70, t, 10, [235, 235, 240], 20 + i);
        } else {
          ctx.fillStyle = '#4b5563'; ctx.fillRect(x - 26, gy - 34, 52, 34);
          ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - 26 + k * 17, gy - 34); ctx.lineTo(x - 26 + k * 17 + 17, gy - 46); ctx.lineTo(x - 26 + k * 17 + 17, gy - 34); } ctx.fill();
          ctx.fillStyle = '#374151'; ctx.fillRect(x + 14, gy - 80, 7, 46);
          this.smoke(ctx, x + 17, gy - 80, t, 8, [90, 90, 95], 30 + i);
          for (let k = 0; k < 4; k++) { ctx.fillStyle = (Math.floor(t * 2 + k + i) % 2) ? 'rgba(251,191,36,.85)' : 'rgba(251,191,36,.35)'; ctx.fillRect(x - 22 + k * 11, gy - 24, 7, 7); }
        }
      }
      // 輸送帶上的產品
      ctx.fillStyle = '#1f2937'; ctx.fillRect(0, gy + 30, W, 6);
      for (let k = 0; k < 12; k++) { const x = ((t * 50 + k * 60) % (W + 60)) - 30; ctx.fillStyle = css(col, 0.9); ctx.fillRect(x, gy + 22, 14, 8); }
    }
  };

  // 國際組織成立：圓桌會議與成員國旗
  SceneCam.prototype.s_org = function (ctx, W, H, t) {
    this.sky(ctx, W, H, '#0b1220', '#1e293b', 1);
    const cx = W / 2, cy = H * 0.62;
    const g = ctx.createRadialGradient(cx, cy - 40, 0, cx, cy - 40, W * 0.45); g.addColorStop(0, 'rgba(255,240,200,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cols = this.d.colors.map((c) => bright(rgb(c)));
    cols.forEach((c, i) => { const x = W * ((i + 1) / (cols.length + 1)); this.flag(ctx, x - 12, H * 0.12, 24, 15, t + i, [c], 50); });
    ctx.fillStyle = '#3b2f24'; ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.32, H * 0.12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b4632'; ctx.beginPath(); ctx.ellipse(cx, cy - 4, W * 0.3, H * 0.1, 0, 0, TAU); ctx.fill();
    const n = Math.max(3, cols.length * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = cx + Math.cos(a) * W * 0.34, y = cy + Math.sin(a) * H * 0.14;
      this.person(ctx, x, y + 4, 1.6, css(cols[i % cols.length]), Math.sin(t * 2 + i) > 0.7 ? Math.PI / 2 : null);
    }
    // 簽字筆跡
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; ctx.beginPath();
    const p = (t * 0.5) % 1;
    for (let k = 0; k <= 20 * p; k++) { const x = cx - 20 + k * 2, y = cy - 6 + Math.sin(k * 1.3) * 2; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // 閃光燈
    if (((t * 1.3) % 1) < 0.06) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, W, H); }
  };

  // 停戰：煙霧散去、白旗
  SceneCam.prototype.s_peace = function (ctx, W, H, t) {
    this.sky(ctx, W, H, '#334155', '#cbd5e1');
    const gy = H * 0.66;
    this.ground(ctx, W, H, gy, '#4a4236');
    const r = prng(3);
    for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(30,25,20,.5)'; ctx.beginPath(); ctx.ellipse(r() * W, gy + 6 + r() * (H - gy - 10), 8 + r() * 10, 2 + r() * 3, 0, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 5; i++) this.smoke(ctx, W * (0.1 + i * 0.2), gy, t * 0.5, 4, [120, 120, 125], 50 + i);
    this.flag(ctx, W * 0.5, gy - 70, 30, 20, t, [[248, 250, 252]], 70);
    const cols = this.d.colors.map((c) => bright(rgb(c)));
    for (let i = 0; i < 10; i++) this.person(ctx, W * 0.5 + (i < 5 ? -1 : 1) * (40 + (i % 5) * 18), gy + 30 + (i % 2) * 4, 1.4, css(cols[i < 5 ? 0 : (cols[1] ? 1 : 0)]), null);
  };

  SceneCam.prototype._overlay = function (ctx, W, H, t) {
    ctx.fillStyle = 'rgba(0,0,0,.1)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    const nr = prng(Math.floor(t * 12));
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 60; i++) ctx.fillRect(nr() * W, nr() * H, 1, 1);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.font = '600 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = ((t * 1.2) % 1) < 0.6 ? '#f87171' : 'rgba(248,113,113,.3)';
    ctx.beginPath(); ctx.arc(14, 16, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(`LIVE  ${this.d.year}.${String(this.d.month).padStart(2, '0')}`, 24, 20);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(240,249,255,.75)'; ctx.fillText(this.d.place || '', W - 12, 20);
    ctx.textAlign = 'left';
    ctx.font = '600 12px "Noto Sans TC",system-ui,sans-serif';
    const cap = this.d.caption || '';
    const tw = Math.min(W - 20, ctx.measureText(cap).width + 16);
    ctx.fillStyle = 'rgba(5,7,13,.75)'; ctx.fillRect(10, H - 30, tw, 20);
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(cap, 18, H - 15);
  };

  window.WSSceneCam = SceneCam;
})();
