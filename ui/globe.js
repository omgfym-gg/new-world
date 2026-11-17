// 介面裝飾：會轉的全息地球（只畫圖，不讀寫任何模擬數值）。
// app.js 每次重畫時用 setData() 把「要畫的點和線」交給地球；地球本身不知道引擎的存在。
(function () {
  'use strict';
  const RAD = Math.PI / 180;
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
    return out;
  }
  function pt(lat, lon) {
    const p = lat * RAD, l = lon * RAD;
    return { sp: Math.sin(p), cp: Math.cos(p), l };
  }

  function Globe() {
    this.dots = decodeDots(window.WS_EARTH_DOTS);
    this.wrap = document.createElement('div');
    this.wrap.className = 'globe-canvas';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '旋轉中的地球，標示各國位置、同盟與戰爭');
    this.wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.lon0 = 100; this.lat0 = 18; // 視角中心（度）
    this.spin = reduceMotion ? 0 : 5; // 每秒轉幾度
    this.vel = 0; this.pauseUntil = 0; this.fly = null;
    this.data = { markers: [], links: [], focus: null };
    this.proj = []; // 這一幀各國標記的螢幕位置（點擊用）
    this.onPick = null;
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
    const prev = this.data.focus;
    this.data = { markers: d.markers || [], links: d.links || [], focus: d.focus || null };
    if (d.focus && d.focus !== prev) {
      const m = this.data.markers.find((x) => x.id === d.focus);
      if (m) this.flyTo(m.lon, m.lat);
    }
  };

  Globe.prototype.flyTo = function (lon, lat) {
    let d = ((lon - this.lon0 + 540) % 360) - 180;
    this.fly = { fromLon: this.lon0, dLon: d, fromLat: this.lat0, toLat: Math.max(-35, Math.min(45, lat * 0.6)), t: 0 };
    this.pauseUntil = performance.now() + 6000;
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
    // 視角移動
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
    this._draw(now / 1000);
  };

  Globe.prototype._draw = function (t) {
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

    // 大氣光暈
    let g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
    g.addColorStop(0, 'rgba(56,189,248,.28)'); g.addColorStop(0.35, 'rgba(56,189,248,.08)'); g.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2); ctx.fill();
    // 海洋球體
    g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#0d2a52'); g.addColorStop(0.7, '#061631'); g.addColorStop(1, '#030a1a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // 經緯線
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(56,189,248,.13)';
    for (let lat = -60; lat <= 60; lat += 30) this._poly(proj, (k) => pt(lat, -180 + k * 5), 73);
    for (let lon = -180; lon < 180; lon += 30) this._poly(proj, (k) => pt(-90 + k * 5, lon), 37);

    // 陸地點陣
    const buckets = [[], [], [], []], back = [];
    for (const d of this.dots) {
      const p = proj(d.sp, d.cp, d.l, 1);
      if (p.z > 0) buckets[Math.min(3, (p.z * 4) | 0)].push(p);
      else if (p.z > -0.6) back.push(p);
    }
    const s = Math.max(1.3, R / 120);
    ctx.fillStyle = 'rgba(103,232,249,.07)';
    for (const p of back) ctx.fillRect(p.x - s / 2, p.y - s / 2, s * 0.8, s * 0.8);
    const alphas = [0.35, 0.55, 0.75, 0.95];
    buckets.forEach((b, i) => {
      ctx.fillStyle = `rgba(103,232,249,${alphas[i]})`;
      for (const p of b) ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    });

    // 邊緣亮線
    ctx.strokeStyle = 'rgba(125,211,252,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // 同盟、戰爭弧線
    const mk = {};
    for (const m of this.data.markers) mk[m.id] = m;
    for (const ln of this.data.links) {
      const A = mk[ln.a], B = mk[ln.b];
      if (!A || !B) continue;
      this._arc(proj, A, B, ln.type, t);
    }

    // 國家標記
    this.proj = [];
    ctx.font = '600 11px "Noto Sans TC","PingFang TC",system-ui,sans-serif';
    ctx.textAlign = 'center';
    const sorted = this.data.markers.slice().sort((a, b) => a.size - b.size);
    for (const m of sorted) {
      const q = pt(m.lat, m.lon);
      const p = proj(q.sp, q.cp, q.l, 1);
      if (p.z <= 0.02) continue;
      const r = Math.max(2.5, m.size * (R / 160)) * (0.6 + 0.4 * p.z);
      const a = Math.min(1, 0.25 + p.z);
      ctx.globalAlpha = a;
      // 脈衝
      const ph = (t * 0.6 + (m.lon + 180) / 360) % 1;
      ctx.strokeStyle = m.war ? '#f87171' : m.color; ctx.lineWidth = 1;
      ctx.globalAlpha = a * (1 - ph) * 0.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + ph * r * 2.2, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a;
      g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
      g.addColorStop(0, m.color); g.addColorStop(0.45, hexA(m.color, 0.45)); g.addColorStop(1, hexA(m.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, r * 0.28), 0, Math.PI * 2); ctx.fill();
      if (m.id === this.data.focus) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4;
        const rr = r + 6, rot = t * 1.2;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(p.x, p.y, rr, rot + k * Math.PI / 2, rot + k * Math.PI / 2 + 0.9); ctx.stroke(); }
      }
      if (p.z > 0.3) {
        ctx.fillStyle = 'rgba(5,7,13,.65)';
        const tw = ctx.measureText(m.name).width + 8;
        ctx.fillRect(p.x - tw / 2, p.y + r + 3, tw, 15);
        ctx.fillStyle = m.id === this.data.focus ? '#fde68a' : '#e6ecff';
        ctx.fillText(m.name, p.x, p.y + r + 14);
      }
      ctx.globalAlpha = 1;
      this.proj.push({ id: m.id, x: p.x, y: p.y, r });
    }

    // 外圈儀表環
    this._hud(cx, cy, R, t);
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

  Globe.prototype._arc = function (proj, A, B, type, t) {
    const ctx = this.ctx;
    const v = (m) => { const p = m.lat * RAD, l = m.lon * RAD; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
    const a = v(A), b = v(B);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const om = Math.acos(dot);
    if (om < 1e-3) return;
    const so = Math.sin(om), N = 40, lift = 0.08 + om * 0.12;
    const war = type === 'war';
    ctx.strokeStyle = war ? 'rgba(248,113,113,.95)' : 'rgba(56,189,248,.7)';
    ctx.lineWidth = war ? 1.8 : 1.1;
    ctx.setLineDash(war ? [5, 4] : []);
    ctx.lineDashOffset = war ? -t * 18 : 0;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const k1 = Math.sin((1 - f) * om) / so, k2 = Math.sin(f * om) / so;
      const x = k1 * a[0] + k2 * b[0], y = k1 * a[1] + k2 * b[1], z = k1 * a[2] + k2 * b[2];
      const sp = z, cp = Math.hypot(x, y), l = Math.atan2(y, x);
      const p = proj(sp, cp, l, 1 + lift * Math.sin(Math.PI * f));
      if (p.vis) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };

  Globe.prototype._hud = function (cx, cy, R, t) {
    const ctx = this.ctx;
    const R1 = R * 1.16, R2 = R * 1.26;
    ctx.save();
    // 刻度環（慢轉）
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.05);
    ctx.strokeStyle = 'rgba(56,189,248,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, long = i % 10 === 0;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R1, Math.sin(a) * R1);
      ctx.lineTo(Math.cos(a) * (R1 + (long ? 8 : 3)), Math.sin(a) * (R1 + (long ? 8 : 3))); ctx.stroke();
    }
    ctx.rotate(-t * 0.13);
    // 斷續外環（反轉）
    ctx.strokeStyle = 'rgba(167,139,250,.45)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, R2, k * 2.094, k * 2.094 + 1.3); ctx.stroke(); }
    ctx.restore();
    // 雷達掃描
    const sa = (t * 0.7) % (Math.PI * 2);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(56,189,248,${0.22 * (1 - i / 14)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R1 - 4, sa - i * 0.035 - 0.035, sa - i * 0.035); ctx.stroke();
    }
    // 四角框
    const b = Math.min(this.cw, this.ch) * 0.06, m = 8;
    ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 1.5;
    [[m, m, 1, 1], [this.cw - m, m, -1, 1], [m, this.ch - m, 1, -1], [this.cw - m, this.ch - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
    });
  };

  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    if (h.length !== 6) return `rgba(56,189,248,${a})`;
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }

  let inst = null;
  window.WSGlobe = {
    get() { if (!inst) inst = new Globe(); return inst; }
  };
})();
