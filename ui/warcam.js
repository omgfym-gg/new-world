// 戰場即時畫面（介面裝飾，只畫圖，不讀寫任何模擬數值）。
// 畫面上的兵力多寡、傷亡、前線位置、裝備年代都來自 app.js 從引擎讀出的戰爭資料：
//   前線位置 ← 戰局分數；雙方人數 ← 兵力；砲火強度 ← 每月傷亡；
//   裝備 ← 各方已掌握的軍事科技（機槍與火炮 → 裝甲部隊 → 航空 → 噴射機 → 火箭）。
// 畫面是電腦依數據畫出來的動畫，不是真實影像。閃光、煙霧等細節用固定種子的偽亂數，不使用 Math.random。
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  function prng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function rgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return [200, 200, 200];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function css(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
  function brighten(c) { const m = Math.max(c[0], c[1], c[2]); const k = m < 160 ? 160 / Math.max(1, m) : 1; return [c[0] * k, c[1] * k, c[2] * k]; }

  function WarCam(canvas, getData) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.get = getData;
    this.mode = 'color';
    this.rand = prng(12345);
    this.shells = []; this.booms = []; this.smoke = []; this.planes = []; this.tracers = [];
    this.alive = true; this.last = 0; this.front = null;
    this.troops = null;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  WarCam.prototype.stop = function () { this.alive = false; };

  WarCam.prototype._loop = function (now) {
    if (!this.alive || !this.c.isConnected) return;
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const d = this.get();
    if (!d) return;
    const W = this.c.clientWidth, H = this.c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.c.width !== Math.round(W * dpr) || this.c.height !== Math.round(H * dpr)) { this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr); }
    this.W = W; this.H = H;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._step(d, dt, now / 1000);
    this._draw(d, now / 1000);
  };

  // 地平線高度
  WarCam.prototype.ground = function (x) {
    const H = this.H;
    return H * 0.72 + Math.sin(x * 0.013) * 6 + Math.sin(x * 0.041 + 1) * 3;
  };

  WarCam.prototype._step = function (d, dt, t) {
    const W = this.W, r = this.rand;
    // 前線位置跟著戰局分數慢慢移動（正分＝進攻方往右推進）
    const target = W * (0.5 + Math.max(-1, Math.min(1, d.score / 100)) * 0.3);
    this.front = this.front == null ? target : this.front + (target - this.front) * Math.min(1, dt * 1.5);
    if (d.ended) return;
    const I = d.intensity; // 0..1
    const sides = [d.att, d.def];
    // 砲彈
    sides.forEach((s, k) => {
      const dir = k === 0 ? 1 : -1;
      const rate = (0.6 + 2.6 * I) * (0.5 + s.share);
      if (r() < rate * dt) {
        const x0 = k === 0 ? this.front - 120 - r() * 160 : this.front + 120 + r() * 160;
        const x1 = this.front + dir * (10 + r() * 140);
        const missile = s.era >= 4 && r() < 0.35;
        this.shells.push({ x0, y0: this.ground(x0) - 8, x1, y1: this.ground(x1), t: 0, dur: missile ? 1.6 : 0.9 + r() * 0.5, missile, k, h: missile ? 160 : 60 + r() * 80 });
      }
      // 機槍曳光彈
      if (r() < (3 + 10 * I) * dt) {
        const x = this.front - dir * (14 + r() * 50);
        this.tracers.push({ x, y: this.ground(x) - 6 - r() * 4, vx: dir * (420 + r() * 200), life: 0.35, k });
      }
      // 飛機
      if (s.era >= 2 && this.planes.filter((p) => p.k === k).length < (s.era >= 3 ? 2 : 1) + Math.round(I * 2) && r() < 0.5 * dt) {
        const jet = s.era >= 3;
        this.planes.push({ x: k === 0 ? -40 : W + 40, y: this.H * (0.12 + r() * 0.2), vx: dir * (jet ? 260 : 90), jet, k, drop: 0 });
      }
    });
    // 更新
    for (const s of this.shells) {
      s.t += dt / s.dur;
      if (s.t >= 1) { this._boom(s.x1, s.y1, s.missile ? 1.8 : 1); s.done = true; }
    }
    this.shells = this.shells.filter((s) => !s.done);
    for (const p of this.planes) {
      p.x += p.vx * dt;
      p.drop += dt;
      const over = p.k === 0 ? p.x > this.front : p.x < this.front;
      if (over && p.drop > (p.jet ? 0.35 : 0.7)) {
        p.drop = 0;
        this.shells.push({ x0: p.x, y0: p.y, x1: p.x + p.vx * 0.5, y1: this.ground(p.x + p.vx * 0.5), t: 0, dur: 0.8, bomb: true, k: p.k, h: -10 });
      }
    }
    this.planes = this.planes.filter((p) => p.x > -80 && p.x < W + 80);
    for (const b of this.tracers) { b.x += b.vx * dt; b.life -= dt; }
    this.tracers = this.tracers.filter((b) => b.life > 0);
    for (const b of this.booms) b.t += dt;
    this.booms = this.booms.filter((b) => b.t < 0.7);
    for (const s of this.smoke) { s.t += dt; s.x += (8 + s.r * 0.2) * dt; s.y -= 10 * dt; s.r += 9 * dt; }
    this.smoke = this.smoke.filter((s) => s.t < s.life);
    if (this.smoke.length > 140) this.smoke.splice(0, this.smoke.length - 140);
  };

  WarCam.prototype._boom = function (x, y, size) {
    const r = this.rand;
    this.booms.push({ x, y, t: 0, size });
    for (let i = 0; i < 3 + size * 2; i++) this.smoke.push({ x: x + (r() - 0.5) * 20, y: y - r() * 10, r: 6 + r() * 8 * size, t: 0, life: 2.5 + r() * 2.5, g: 60 + r() * 50 });
  };

  WarCam.prototype._draw = function (d, t) {
    const ctx = this.ctx, W = this.W, H = this.H, r = prng(777);
    const thermal = this.mode === 'thermal';
    // 天空
    let g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    if (thermal) { g.addColorStop(0, '#020a06'); g.addColorStop(1, '#06210f'); }
    else { g.addColorStop(0, '#1b2433'); g.addColorStop(0.6, '#3b3a3c'); g.addColorStop(1, '#5a4a3c'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 遠方火光
    if (!d.ended) {
      g = ctx.createRadialGradient(this.front, H * 0.7, 0, this.front, H * 0.7, W * 0.5);
      g.addColorStop(0, thermal ? 'rgba(120,255,140,.18)' : `rgba(255,120,40,${0.12 + d.intensity * 0.2})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // 遠山
    ctx.fillStyle = thermal ? '#04170b' : '#2a2a2e';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * 0.6 - Math.abs(Math.sin(x * 0.007 + 2)) * 30 - Math.sin(x * 0.023) * 8);
    ctx.lineTo(W, H); ctx.fill();
    // 地面
    ctx.fillStyle = thermal ? '#082a12' : '#3d3428';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, this.ground(x));
    ctx.lineTo(W, H); ctx.fill();
    // 彈坑（越久的戰爭越多）
    const craters = Math.min(60, 6 + d.months * 1.5);
    for (let i = 0; i < craters; i++) {
      const x = this.front + (r() - 0.5) * W * 0.7, y = this.ground(x) + 4 + r() * (H * 0.25);
      ctx.fillStyle = thermal ? 'rgba(0,0,0,.35)' : 'rgba(20,16,12,.45)';
      ctx.beginPath(); ctx.ellipse(x, y, 6 + r() * 10, 2 + r() * 3, 0, 0, TAU); ctx.fill();
    }
    // 雙方戰壕
    [[-1, d.att], [1, d.def]].forEach(([dir]) => {
      const x = this.front + dir * 40;
      ctx.strokeStyle = thermal ? '#0e4a1e' : '#1e1912'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 30, this.ground(x) + 6);
      for (let k = 0; k < 5; k++) ctx.lineTo(x - 30 + k * 15, this.ground(x) + 6 + (k % 2 ? 4 : 0));
      ctx.stroke();
      // 鐵絲網
      ctx.strokeStyle = thermal ? 'rgba(120,255,140,.3)' : 'rgba(160,150,130,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const xx = this.front + dir * 18 + k * 3 * dir; ctx.moveTo(xx, this.ground(xx)); ctx.lineTo(xx + 3 * dir, this.ground(xx) - 6); }
      ctx.stroke();
    });
    // 部隊
    const sides = [d.att, d.def];
    sides.forEach((s, k) => {
      const dir = k === 0 ? -1 : 1;
      const col = thermal ? [190, 255, 190] : brighten(rgb(s.color));
      const n = Math.round(8 + s.share * 40);
      const rr = prng(31 + k * 101);
      for (let i = 0; i < n; i++) {
        const depth = rr();
        const x = this.front + dir * (30 + rr() * W * 0.38) + Math.sin(t * 1.5 + i) * 2;
        const y = this.ground(x) + depth * H * 0.18;
        const sc = 0.7 + depth * 0.7;
        ctx.fillStyle = css(col, 0.9);
        ctx.fillRect(x - 1.2 * sc, y - 9 * sc, 2.4 * sc, 7 * sc); // 身體
        ctx.beginPath(); ctx.arc(x, y - 10.5 * sc, 1.7 * sc, 0, TAU); ctx.fill(); // 頭
        ctx.strokeStyle = css(col, 0.9); ctx.lineWidth = 0.8 * sc;
        ctx.beginPath(); ctx.moveTo(x, y - 7 * sc); ctx.lineTo(x - dir * 4.5 * sc, y - 8 * sc); ctx.stroke(); // 槍
        // 槍口火光
        if (!d.ended && ((t * 3 + i * 0.37) % 1) < 0.06 * (0.5 + d.intensity)) {
          ctx.fillStyle = thermal ? '#eaffea' : '#ffd27a';
          ctx.beginPath(); ctx.arc(x - dir * 5.5 * sc, y - 8 * sc, 1.8 * sc, 0, TAU); ctx.fill();
        }
      }
      // 火炮
      for (let i = 0; i < 2 + Math.round(s.share * 3); i++) {
        const x = this.front + dir * (130 + i * 45 + rr() * 30), y = this.ground(x);
        ctx.fillStyle = css(thermal ? col : [60, 60, 55], 1);
        ctx.fillRect(x - 6, y - 5, 12, 4);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x - dir * 12, y - 10); ctx.stroke();
      }
      // 裝甲部隊
      if (s.era >= 1) {
        for (let i = 0; i < 1 + Math.round(s.share * 3); i++) {
          const base = this.front + dir * (60 + i * 55 + rr() * 30);
          const x = base + Math.sin(t * 0.4 + i) * 10 * -dir;
          const y = this.ground(x) + 2;
          ctx.fillStyle = thermal ? '#d8ffd8' : css(mixDark(rgb(s.color)), 1);
          ctx.fillRect(x - 11, y - 8, 22, 6); ctx.fillRect(x - 6, y - 12, 11, 5);
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x - dir * 13, y - 11); ctx.stroke();
          ctx.fillStyle = thermal ? '#0a3' : '#151515'; ctx.fillRect(x - 11, y - 3, 22, 3);
        }
      }
    });
    // 煙
    for (const s of this.smoke) {
      const a = (1 - s.t / s.life) * 0.45;
      ctx.fillStyle = thermal ? `rgba(60,140,80,${a * 0.6})` : `rgba(${s.g},${s.g},${s.g},${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    // 砲彈與飛彈
    for (const s of this.shells) {
      const x = s.x0 + (s.x1 - s.x0) * s.t;
      const y = s.y0 + (s.y1 - s.y0) * s.t - Math.sin(Math.PI * s.t) * s.h;
      if (s.missile) {
        ctx.strokeStyle = thermal ? 'rgba(200,255,200,.5)' : 'rgba(230,230,230,.5)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) { const tt = Math.max(0, s.t - k * 0.02); const xx = s.x0 + (s.x1 - s.x0) * tt; const yy = s.y0 + (s.y1 - s.y0) * tt - Math.sin(Math.PI * tt) * s.h; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
      }
      ctx.fillStyle = thermal ? '#f0fff0' : s.missile ? '#fff3c4' : '#ffb36b';
      ctx.beginPath(); ctx.arc(x, y, s.missile ? 2.4 : 1.6, 0, TAU); ctx.fill();
    }
    // 曳光彈
    ctx.lineWidth = 1.2;
    for (const b of this.tracers) {
      ctx.strokeStyle = thermal ? 'rgba(220,255,220,.8)' : 'rgba(255,220,140,.85)';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y); ctx.stroke();
    }
    // 飛機
    for (const p of this.planes) {
      const col = thermal ? '#e8ffe8' : '#c9ccd1';
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      const dir = Math.sign(p.vx);
      if (p.jet) {
        ctx.beginPath(); ctx.moveTo(p.x + dir * 12, p.y); ctx.lineTo(p.x - dir * 10, p.y - 3); ctx.lineTo(p.x - dir * 10, p.y + 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(p.x - dir * 2, p.y); ctx.lineTo(p.x - dir * 8, p.y - 8); ctx.lineTo(p.x - dir * 6, p.y); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - dir * 10, p.y); ctx.lineTo(p.x - dir * 70, p.y); ctx.stroke();
      } else {
        ctx.fillRect(p.x - 8, p.y - 1.5, 16, 3);
        ctx.fillRect(p.x - 2, p.y - 6, 4, 12); ctx.fillRect(p.x - 2 - dir * 4, p.y - 6, 1.5, 12);
        ctx.fillRect(p.x - dir * 8, p.y - 4, 2, 5);
      }
    }
    // 爆炸
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.booms) {
      const k = b.t / 0.7, R = (10 + k * 26) * b.size;
      g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
      g.addColorStop(0, thermal ? `rgba(230,255,230,${1 - k})` : `rgba(255,240,200,${1 - k})`);
      g.addColorStop(0.4, thermal ? `rgba(120,255,140,${(1 - k) * 0.7})` : `rgba(255,140,40,${(1 - k) * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 前線標記
    ctx.strokeStyle = 'rgba(251,191,36,.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(this.front, H * 0.45); ctx.lineTo(this.front, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251,191,36,.9)'; ctx.font = '600 11px "Noto Sans TC",system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('前線', this.front, H * 0.45 - 4);
    // 停火畫面
    if (d.ended) {
      ctx.fillStyle = 'rgba(5,7,13,.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f0f9ff'; ctx.font = '700 18px "Noto Sans TC",system-ui,sans-serif';
      ctx.fillText('戰爭已結束：' + d.outcomeLabel, W / 2, H / 2);
    }
    // 掃描線、雜訊、畫面框
    ctx.fillStyle = thermal ? 'rgba(0,30,0,.18)' : 'rgba(0,0,0,.12)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    const nr = prng(Math.floor(t * 12));
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 70; i++) ctx.fillRect(nr() * W, nr() * H, 1, 1);
    g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 文字疊加
    ctx.textAlign = 'left'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    ctx.fillStyle = ((t * 1.2) % 1) < 0.6 ? '#f87171' : 'rgba(248,113,113,.3)';
    ctx.beginPath(); ctx.arc(14, 16, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(`LIVE  ${d.year}.${String(d.month).padStart(2, '0')}`, 24, 20);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(240,249,255,.75)';
    ctx.fillText(thermal ? 'THERMAL' : 'CAM-01', W - 12, 20);
    ctx.textAlign = 'left'; ctx.fillStyle = css(brighten(rgb(d.att.color)), 1);
    ctx.fillText('◀ ' + d.att.name, 12, H - 12);
    ctx.textAlign = 'right'; ctx.fillStyle = css(brighten(rgb(d.def.color)), 1);
    ctx.fillText(d.def.name + ' ▶', W - 12, H - 12);
    ctx.textAlign = 'left';
  };
  function mixDark(c) { return [c[0] * 0.45 + 30, c[1] * 0.45 + 30, c[2] * 0.45 + 25]; }

  window.WSWarCam = WarCam;
})();
