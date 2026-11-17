// 戰場即時畫面（介面裝飾，只畫圖，不讀寫任何模擬數值）。
// 畫面上的兵力多寡、傷亡、前線位置、裝備年代都來自 app.js 從引擎讀出的戰爭資料：
//   前線位置 ← 戰局分數；雙方人數 ← 兵力與累計傷亡；砲火強度 ← 每月傷亡；
//   打開畫面時先依引擎每月的戰況紀錄（war.track）從開戰快轉回放到現在，再接上即時畫面：
//   占優的一方往前推進，傷亡多、處於劣勢的一方人越打越少，倒下的士兵留在地上。
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
    this.sold = null; this.dead = []; this.rp = null; this.cur = null; this.liveExtra = 0;
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
    this._sample(d, now / 1000);
    this._step(d, dt, now / 1000);
    this._troops(d, dt, now / 1000);
    this._draw(d, now / 1000);
  };

  // 地平線高度
  WarCam.prototype.ground = function (x) {
    const H = this.H;
    return H * 0.72 + Math.sin(x * 0.013) * 6 + Math.sin(x * 0.041 + 1) * 3;
  };

  WarCam.prototype._step = function (d, dt, t) {
    const W = this.W, r = this.rand;
    // 前線位置跟著戰局分數移動（正分＝進攻方往右推進）
    const sc = this.cur ? this.cur.s : d.score;
    const target = W * (0.5 + Math.max(-1, Math.min(1, sc / 100 + this.liveExtra)) * 0.32);
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
        const foes = this.sold ? this.sold[1 - k].filter((u) => u.alive) : [];
        const x1 = foes.length && r() < 0.7 ? foes[(r() * foes.length) | 0].x + (r() - 0.5) * 16 : this.front + dir * (10 + r() * 140);
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

  // 回放：從開戰到現在，依每月戰況紀錄快轉；回放完接即時
  WarCam.prototype._sample = function (d, t) {
    const tr = d.track || [];
    if (!this.rp) {
      this.rp = { start: t, dur: tr.length >= 2 ? Math.max(4, Math.min(14, tr.length * 0.35)) : 0 };
      this.base = tr[0] ? { pa: tr[0].pa + tr[0].ca, pd: tr[0].pd + tr[0].cd } : { pa: d.att.personnel + d.att.casualties, pd: d.def.personnel + d.def.casualties };
    }
    const live = { y: d.year, m: d.month, s: d.score, ca: d.att.casualties, cd: d.def.casualties };
    let p = this.rp.dur ? (t - this.rp.start) / this.rp.dur : 1;
    if (d.ended && p >= 1) p = 1;
    if (p < 1 && tr.length >= 2) {
      const f = p * (tr.length - 1), i = Math.floor(f), k = f - i, A = tr[i], B = tr[Math.min(tr.length - 1, i + 1)];
      const L = (a, b) => a + (b - a) * k;
      this.cur = { y: A.y, m: A.m, s: L(A.s, B.s), ca: L(A.ca, B.ca), cd: L(A.cd, B.cd), replay: p };
      this.liveExtra = 0;
    } else {
      if (!this.liveAt) this.liveAt = t;
      this.cur = Object.assign(live, { replay: null });
      // 即時畫面裡，戰況照目前的優勢方向慢慢延續（最多再推 15%），讓畫面持續有進展
      const adv = Math.max(-1, Math.min(1, live.s / 50));
      this.liveExtra = d.ended ? 0 : adv * Math.min(0.15, (t - this.liveAt) * 0.004);
    }
  };

  // 士兵：人數依傷亡與戰況變化；不夠就有援軍從後方補上，太多就有人中彈倒下
  WarCam.prototype._troops = function (d, dt, t) {
    const W = this.W, r = this.rand, cur = this.cur;
    if (!this.sold) {
      const tot = Math.max(1e-6, this.base.pa + this.base.pd);
      this.n0 = [Math.round(10 + (this.base.pa / tot) * 40), Math.round(10 + (this.base.pd / tot) * 40)];
      this.sold = [0, 1].map((k) => Array.from({ length: this.n0[k] }, () => this._unit(k, 30 + r() * W * 0.38)));
      this.dead = [];
    }
    const adv = Math.max(-1, Math.min(1, cur.s / 100 + this.liveExtra * 2));
    const target = [0, 1].map((k) => {
      const lost = (k === 0 ? cur.ca : cur.cd) / Math.max(1e-6, k === 0 ? this.base.pa : this.base.pd);
      let f = 1 - Math.min(0.7, lost * 4);
      const myAdv = k === 0 ? adv : -adv;
      if (myAdv < 0) f *= 1 + myAdv * 0.8; // 劣勢的一方人越打越少
      else f = Math.max(f, 0.6 + myAdv * 0.3); // 優勢的一方有援軍補上
      return Math.max(2, Math.round(this.n0[k] * Math.max(0.1, f)));
    });
    [0, 1].forEach((k) => {
      const dir = k === 0 ? -1 : 1, list = this.sold[k];
      const alive = list.filter((u) => u.alive);
      this.kill = this.kill || [0, 0];
      this.kill[k] += dt * (cur.replay != null ? 8 : 2.5);
      if (alive.length > target[k] && this.kill[k] >= 1) {
        this.kill[k] = 0;
        // 最前線的人先倒下
        alive.sort((a, b) => a.off - b.off);
        const u = alive[Math.min(alive.length - 1, (r() * 3) | 0)];
        u.alive = false; u.dieT = t;
        this.tracers.push({ x: this.front - dir * 20, y: this.ground(u.x) - 7, vx: dir * 520, life: 0.25, k: 1 - k });
        if (r() < 0.4) this._boom(u.x + (r() - 0.5) * 10, this.ground(u.x) + u.dep * this.H * 0.18, 0.6);
      } else if (alive.length < target[k] && this.kill[k] >= 1.5 && !d.ended) {
        this.kill[k] = 0;
        list.push(this._unit(k, W * 0.5 + r() * 40)); // 援軍從後方走進來
      } else if (this.kill[k] > 2) this.kill[k] = 2;
      for (const u of list) {
        if (!u.alive) continue;
        // 優勢方往前壓（離前線越來越近），劣勢方往後退
        const myAdv = k === 0 ? adv : -adv;
        const want = myAdv > 0 ? Math.max(12, u.off0 * (1 - myAdv * 0.85)) : Math.min(this.W * 0.48, u.off0 * (1 - myAdv * 0.35));
        u.off += (want - u.off) * Math.min(1, dt * 0.8);
        const tx = this.front + dir * u.off;
        const step = 40 * dt;
        u.x += Math.max(-step, Math.min(step, tx - u.x));
        u.moving = Math.abs(tx - u.x) > 1;
      }
      for (const u of list) if (!u.alive) { this.dead.push(u); }
      this.sold[k] = list.filter((u) => u.alive);
    });
    this.dead = this.dead.filter((u) => t - u.dieT < 40);
    if (this.dead.length > 160) this.dead.splice(0, this.dead.length - 160);
  };
  WarCam.prototype._unit = function (k, off) {
    const r = this.rand, dir = k === 0 ? -1 : 1, dep = r();
    return { k, off, off0: off, dep, x: (this.front || this.W / 2) + dir * off, alive: true, ph: r() * TAU };
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
    // 倒下的士兵：先倒地，留在戰場上慢慢淡去
    for (const u of this.dead || []) {
      const age = t - u.dieT, sc = 0.7 + u.dep * 0.7;
      const fall = Math.min(1, age / 0.45), a = Math.max(0, 1 - Math.max(0, age - 25) / 15);
      const s0 = u.k === 0 ? d.att : d.def;
      const col = thermal ? [120, 200, 130] : brighten(rgb(s0.color)).map((v) => v * 0.45 + 40);
      const x = u.x, y = this.ground(x) + u.dep * H * 0.18;
      ctx.save(); ctx.translate(x, y); ctx.rotate((u.k === 0 ? -1 : 1) * fall * Math.PI / 2);
      ctx.fillStyle = css(col, 0.85 * a);
      ctx.fillRect(-1.2 * sc, -9 * sc, 2.4 * sc, 9 * sc);
      ctx.beginPath(); ctx.arc(0, -10.5 * sc, 1.7 * sc, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 部隊
    const sides = [d.att, d.def];
    sides.forEach((s, k) => {
      const dir = k === 0 ? -1 : 1;
      const col = thermal ? [190, 255, 190] : brighten(rgb(s.color));
      const rr = prng(31 + k * 101);
      for (const u of (this.sold ? this.sold[k] : [])) {
        const sc = 0.7 + u.dep * 0.7;
        const bob = u.moving ? Math.abs(Math.sin(t * 9 + u.ph)) * 1.5 : 0;
        const x = u.x, y = this.ground(x) + u.dep * H * 0.18 - bob;
        ctx.fillStyle = css(col, 0.9);
        ctx.fillRect(x - 1.2 * sc, y - 9 * sc, 2.4 * sc, 7 * sc); // 身體
        ctx.beginPath(); ctx.arc(x, y - 10.5 * sc, 1.7 * sc, 0, TAU); ctx.fill(); // 頭
        ctx.strokeStyle = css(col, 0.9); ctx.lineWidth = 0.8 * sc;
        ctx.beginPath(); ctx.moveTo(x, y - 7 * sc); ctx.lineTo(x - dir * 4.5 * sc, y - 8 * sc); ctx.stroke(); // 槍
        if (u.moving) { ctx.beginPath(); ctx.moveTo(x, y - 2 * sc); ctx.lineTo(x + Math.sin(t * 9 + u.ph) * 2 * sc, y); ctx.stroke(); }
        // 槍口火光
        if (!d.ended && ((t * 3 + u.ph) % 1) < 0.06 * (0.5 + d.intensity)) {
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
    const cur = this.cur || { y: d.year, m: d.month };
    ctx.fillStyle = '#f0f9ff'; ctx.fillText(`${cur.replay != null ? 'REPLAY' : 'LIVE'}  ${cur.y}.${String(cur.m).padStart(2, '0')}`, 24, 20);
    if (cur.replay != null) {
      const bw = Math.min(160, W * 0.35), bx = (W - bw) / 2;
      ctx.fillStyle = 'rgba(5,7,13,.7)'; ctx.fillRect(bx - 6, 8, bw + 12, 26);
      ctx.fillStyle = 'rgba(240,249,255,.85)'; ctx.textAlign = 'center'; ctx.font = '600 10.5px "Noto Sans TC",system-ui,sans-serif';
      ctx.fillText('從開戰回放中…', W / 2, 19);
      ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(bx, 25, bw, 4);
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(bx, 25, bw * cur.replay, 4);
      ctx.textAlign = 'left'; ctx.font = '600 11px ui-monospace,Menlo,monospace';
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(240,249,255,.75)';
    ctx.fillText(thermal ? 'THERMAL' : 'CAM-01', W - 12, 20);
    const ca = this.cur ? this.cur.ca : d.att.casualties, cd = this.cur ? this.cur.cd : d.def.casualties;
    ctx.textAlign = 'left'; ctx.fillStyle = css(brighten(rgb(d.att.color)), 1);
    ctx.fillText('◀ ' + d.att.name + `  傷亡 ${(ca * 100).toFixed(0)} 萬`, 12, H - 12);
    ctx.textAlign = 'right'; ctx.fillStyle = css(brighten(rgb(d.def.color)), 1);
    ctx.fillText(`傷亡 ${(cd * 100).toFixed(0)} 萬  ` + d.def.name + ' ▶', W - 12, H - 12);
    ctx.textAlign = 'left';
  };
  function mixDark(c) { return [c[0] * 0.45 + 30, c[1] * 0.45 + 30, c[2] * 0.45 + 25]; }

  window.WSWarCam = WarCam;
})();
