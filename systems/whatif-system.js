// What-If System：「如果」平行世界
// 對任何可改寫的事件，回到事件之前的快照，用同一個種子、同樣的玩家指令重跑，
// 只改變那一件事（阻止發生／強制發生／翻轉結果），再並排比較兩條世界線。
// 原則：不寫入任何數值。改變只發生在事件「是否發生、結果為何」這一層，之後全部由引擎計算；
// 分岔點本身會寫入事件紀錄，比較報告只引用兩條世界線的實際模擬紀錄。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const WhatIf = (WS.WhatIf = {});
  const U = () => WS.util;

  // 事件發生時的 tick（tick 0 = 起點年月；每推進一個月 +1）
  WhatIf.tickOf = (w, y, m) => (y - w.startYear) * 12 + (m - (w.startMonth || 1));

  const nameOf = (w, id) => (w.countries[id] ? w.countries[id].name : id);
  const defOf = (id) => WS.Events.defs.find((d) => d.id === id);

  // ---------- 1. 哪些事件可以「如果」 ----------
  // 回傳 [{ key, action, label, target }]，沒有可改寫的選項時回傳 []
  WhatIf.options = function (w, e) {
    if (!e) return [];
    if (w.era === 'ancient') return WhatIf.ancientOptions(w, e);
    // 制度轉變若是由條件事件（例如革命）直接造成，改寫它的源頭事件
    if (e.type === 'regime' && e.parent) {
      const p = w.events.find((x) => x.id === e.parent);
      if (p && p.defId) return WhatIf.options(w, p);
    }
    const tick = WhatIf.tickOf(w, e.y, e.m);
    const cid = e.countries[0];
    const base = { eventId: e.id, tick, y: e.y, m: e.m };
    const out = [];
    const add = (action, label, t) => out.push({ key: action, action, label, target: Object.assign({}, base, t) });

    if (e.type === 'war' && e.warPair) {
      add('block', `如果${nameOf(w, e.warPair[0])}沒有向${nameOf(w, e.warPair[1])}宣戰`, { kind: 'war', a: e.warPair[0], d: e.warPair[1] });
    } else if (e.type === 'historical' && e.defId) {
      add('block', `如果「${defOf(e.defId).name}」沒有發生`, { kind: 'event', defId: e.defId, country: cid });
    } else if (e.type === 'historical-missed' && e.defId) {
      add('force', `如果「${defOf(e.defId).name}」被強制發生（即使當時條件不成立）`, { kind: 'event', defId: e.defId, country: cid });
    } else if (e.type === 'catastrophe' && e.fk) {
      add('block', `如果沒有發生「${e.title}」`, { kind: 'future', fk: e.fk });
    } else if (e.type === 'conditional' && e.defId && defOf(e.defId)) {
      const d = defOf(e.defId), cn = nameOf(w, cid);
      if (e.defId === 'revolution') {
        const won = (e.effects || []).includes('革命成功');
        add(won ? 'fail' : 'success', won ? `如果${cn}革命失敗` : `如果${cn}革命成功`, { kind: 'event', defId: e.defId, country: cid });
        if (won) add('block', `如果${cn}沒有爆發革命`, { kind: 'event', defId: e.defId, country: cid });
      } else {
        add('block', `如果${cn}沒有發生${d.name}`, { kind: 'event', defId: e.defId, country: cid });
      }
    }
    return out;
  };

  // ---------- 2. 引擎掛鉤：在指定的月份攔截一件事 ----------
  // 各引擎在事件即將發生時呼叫；找到尚未使用、同一個月、條件相符的設定就回傳並標記已使用
  WhatIf.take = function (w, pred) {
    const list = w.overrides;
    if (!list || !list.length) return null;
    const o = list.find((x) => !x.applied && x.tick === w.tick && pred(x));
    if (!o) return null;
    o.applied = true;
    return o;
  };

  // 分岔點寫入事件紀錄（因果的起點）
  WhatIf.logDivergence = function (w, ctx, o, countries, original) {
    const ev = WS.Events.log(w, ctx, {
      type: 'whatif', title: o.label, countries, level: 3,
      text: '這是平行世界的分岔點：只有這一件事被改寫，其他一切照同一個種子由引擎計算。',
      causes: ['玩家的「如果」設定（平行世界）'].concat(original || []),
      trigger: `在 ${w.year} 年 ${w.month} 月攔截`
    });
    o.eventId = ev.id;
    return ev;
  };

  // ---------- 3. 找出重跑的起點 ----------
  // 事件之前最近的一個快照；沒有快照時用世界建立時的設定重新生成
  WhatIf.source = function (engine, tick) {
    const w = engine.world;
    let best = null;
    for (const s of engine.snapshots) {
      const st = s.tick != null ? s.tick : WhatIf.tickOf(w, s.year, s.month);
      if (st < tick && (!best || st > best.tick)) best = { tick: st, json: s.json };
    }
    if (best) {
      const src = WS.Save.migrate(best.json);
      return { world: src, tick: best.tick, cmdStart: src.commandLog.length, from: src.era === 'ancient' ? `${WS.Ancient.yearLabel(src.year)}的快照` : `${src.year} 年 ${src.month} 月的快照` };
    }
    if (w.genesis) {
      const src = w.era === 'ancient' ? WS.Ancient.createWorld(w.genesis) : WS.State.createWorld(w.genesis);
      return { world: src, tick: 0, cmdStart: 0, from: '世界建立時的設定（同一個種子）' };
    }
    return null;
  };

  WhatIf.available = function (engine, e) {
    const w = engine.world;
    const opts = WhatIf.options(w, e);
    if (!opts.length) return { ok: false, opts, reason: '這類事件目前不能改寫' };
    const tick = opts[0].target.tick;
    const has = engine.snapshots.some((s) => (s.tick != null ? s.tick : WhatIf.tickOf(w, s.year, s.month)) < tick) || !!w.genesis;
    return has ? { ok: true, opts } : { ok: false, opts, reason: '這件事發生在載入存檔之前，沒有更早的快照可以回溯' };
  };

  // ---------- 4. 建立並推進平行世界 ----------
  WhatIf.run = function (engine, eventId, key) {
    const w = engine.world;
    const e = w.events.find((x) => x.id === eventId);
    const opt = WhatIf.options(w, e).find((o) => o.key === key);
    if (!opt) return { ok: false, reason: '這個事件沒有這個「如果」選項' };
    const src = WhatIf.source(engine, opt.target.tick);
    if (!src) return { ok: false, reason: '沒有事件之前的快照可以回溯' };

    const alt = src.world;
    // 保留原世界線已有的「如果」設定（重跑時要重現它們），再加上這一次的新設定
    alt.overrides = U().clone(w.overrides || []).map((o) => (o.tick > src.tick ? Object.assign(o, { applied: false, eventId: null }) : o))
      .concat([Object.assign({ id: 'O' + ((w.overrides || []).length + 1), action: opt.action, label: opt.label, applied: false }, opt.target)]);
    alt.genesis = w.genesis ? U().clone(w.genesis) : null;
    alt.branch = {
      id: 'B' + WS.hashSeed(w.branch.id + opt.label + opt.target.tick).toString(36),
      name: opt.label, parent: w.branch.id, parentName: w.branch.name,
      createdTick: opt.target.tick, divergeYear: opt.target.y, divergeMonth: opt.target.m,
      reason: opt.label + '（平行世界）', whatif: true
    };

    const sim = new WS.WorldEngine();
    sim.load(alt);
    const cmds = (w.commandLog || []).slice(src.cmdStart);
    let i = 0;
    const failed = [];
    const due = () => {
      while (i < cmds.length && cmds[i].tick <= sim.world.tick) {
        const r = sim.exec(cmds[i]);
        if (r && r.ok === false) failed.push({ cmd: cmds[i], reason: r.reason });
        i++;
      }
    };
    due();
    while (sim.world.tick < w.tick) { sim.step(); due(); }
    sim.world.pendingDecision = null;
    const ov = sim.world.overrides[sim.world.overrides.length - 1];
    const report = WhatIf.compare(w, sim.world, { eventId: opt.target.eventId, label: opt.label, tick: opt.target.tick, y: opt.target.y, m: opt.target.m, applied: ov.applied, from: src.from, failed });
    return { ok: true, world: sim.world, snapshots: sim.snapshots, report };
  };

  // ---------- 5. 比較兩條世界線（只引用實際紀錄） ----------
  const MAJOR = (e) => (e.level >= 3 || e.type === 'historical-missed') && e.type !== 'branch' && e.type !== 'system';

  function countryRow(w, id) {
    const c = w.countries[id];
    if (!c) return null;
    const u = U();
    return {
      id, name: c.name, alive: c.alive, pop: u.popTotal(c), gdp: c.econ.gdp, gdppc: c.econ.gdppc,
      stability: c.pol.stability, legitimacy: c.pol.legitimacy,
      regime: c.alive ? (u.regime(w, c.regime) || { name: c.regime }).name : '已不存在', leader: c.leader ? c.leader.name : '—',
      atWar: !!c.flags.atWar, regions: c.regions.length
    };
  }

  // 因果帳：從分岔年份到現在，某指標各原因的累計（兩條世界線相減，找出差距來自哪裡）
  function ledger(w, id, metric, fromYear) {
    const c = w.countries[id];
    const out = {};
    if (!c) return out;
    const add = (data) => { for (const f in data || {}) out[f] = (out[f] || 0) + data[f].v; };
    for (const y of c.causes.years) if (y.year >= fromYear) add(y.data[metric]);
    add(c.causes.cur[metric]);
    return out;
  }

  WhatIf.ledgerDiff = function (orig, alt, id, metric, fromYear) {
    const a = ledger(orig, id, metric, fromYear), b = ledger(alt, id, metric, fromYear);
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    return [...keys].map((k) => ({ factor: k, orig: a[k] || 0, alt: b[k] || 0, diff: (b[k] || 0) - (a[k] || 0) }))
      .filter((x) => Math.abs(x.diff) > 1e-9).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  };

  function yearValue(w, id, metric, year) {
    const s = w.series.c[id];
    if (!s) return null;
    const i = w.series.labels.indexOf(year);
    return i >= 0 ? s[metric][i] : null;
  }

  WhatIf.compare = function (orig, alt, info) {
    if (orig.era === 'ancient') return WhatIf.compareAncient(orig, alt, info);
    const u = U();
    const fromYear = info.y;
    const ids = [...new Set(Object.keys(orig.countries).concat(Object.keys(alt.countries)))].sort();
    const rows = ids.map((id) => {
      const a = countryRow(orig, id), b = countryRow(alt, id);
      if ((!a || !a.alive) && (!b || !b.alive)) return null;
      const lg = (x, y) => (x > 0 && y > 0 ? Math.abs(Math.log(y / x)) : 1);
      const score = !a || !b ? 2 : (a.alive !== b.alive ? 2 : 0) + lg(a.gdp, b.gdp) + lg(a.pop, b.pop) + Math.abs(a.stability - b.stability) / 100 + (a.regime !== b.regime ? 0.5 : 0);
      return { id, name: (a || b).name, orig: a, alt: b, score };
    }).filter(Boolean).sort((x, y) => y.score - x.score);

    const sum = (w, f) => u.ids(w).reduce((s, id) => s + f(w.countries[id]), 0);
    const world = {
      orig: { pop: sum(orig, u.popTotal), gdp: sum(orig, (c) => c.econ.gdp), countries: u.ids(orig).length, wars: orig.wars.filter((x) => WhatIf.tickOf(orig, x.start.y, x.start.m) >= info.tick).length },
      alt: { pop: sum(alt, u.popTotal), gdp: sum(alt, (c) => c.econ.gdp), countries: u.ids(alt).length, wars: alt.wars.filter((x) => WhatIf.tickOf(alt, x.start.y, x.start.m) >= info.tick).length }
    };

    // 分岔之後只在其中一條世界線發生的重大事件
    const after = (w) => w.events.filter((e) => WhatIf.tickOf(w, e.y, e.m) >= info.tick && MAJOR(e));
    // 同名事件只是提早或延後（例如同一場戰爭晚兩個月結束）視為同一件事，依出現順序配對
    const unmatched = (list, other) => {
      const pool = {};
      for (const e of other) pool[e.title] = (pool[e.title] || 0) + 1;
      return list.filter((e) => { if (pool[e.title]) { pool[e.title]--; return false; } return true; });
    };
    const target = orig.events.find((e) => e.id === info.eventId);
    const skip = new Set(target ? [target.id].concat(target.followups || []) : []);
    const div = alt.events.find((e) => e.type === 'whatif' && e.title === info.label && WhatIf.tickOf(alt, e.y, e.m) === info.tick);
    // 分岔點本身（原本的事件與被改寫後的那一件）已經寫在擴散鏈第一步，不重複列出
    const oe = after(orig).filter((e) => !skip.has(e.id));
    const ae = after(alt).filter((e) => e.type !== 'whatif' && !(div && e.parent === div.id));
    const onlyOrig = unmatched(oe, ae);
    const onlyAlt = unmatched(ae, oe);

    // 擴散鏈：分岔點 → 依時間排列的差異事件，每一步附上紀錄中的原因與當年兩邊的數值
    const chain = [{ y: info.y, m: info.m, kind: 'start', title: info.label, why: [`從 ${info.from} 用同一個種子重跑，只改寫這件事`] }];
    const merged = onlyOrig.map((e) => ({ e, side: 'orig' })).concat(onlyAlt.map((e) => ({ e, side: 'alt' })))
      .sort((x, y) => x.e.y - y.e.y || x.e.m - y.e.m || (x.side === 'orig' ? -1 : 1));
    const seen = new Set();
    for (const { e, side } of merged) {
      if (chain.length >= 8) break;
      if (e.type === 'leader' || e.type === 'decision') continue;
      const k = side + e.title.replace(/^.*?：/, '') + (e.countries[0] || '');
      if (seen.has(k)) continue;
      seen.add(k);
      const cid = e.countries[0];
      const why = (e.causes || []).slice(0, 3);
      const yr = e.y + (e.m > 1 ? 1 : 0); // 年度數列在隔年一月記錄
      const vs = cid ? ['stability', 'legitimacy'].map((m) => {
        const o = yearValue(orig, cid, m, yr), a2 = yearValue(alt, cid, m, yr);
        return o != null && a2 != null ? `${WS.History.LABELS[m]}：原世界 ${o.toFixed(0)}／平行世界 ${a2.toFixed(0)}` : null;
      }).filter(Boolean) : [];
      chain.push({ y: e.y, m: e.m, kind: side === 'orig' ? 'gone' : 'new', title: e.title, why, compare: vs, eventId: e.id, side });
    }

    // 差距最大的國家：GDP 與人口差距來自哪些原因（因果帳相減）
    const top = rows[0] && rows[0].orig && rows[0].alt ? rows[0].id : null;
    const focus = orig.mode === 'country' && rows.find((r) => r.id === orig.focus) ? orig.focus : top;
    const reasons = {};
    for (const id of [...new Set([focus, top].filter(Boolean))]) {
      reasons[id] = {};
      for (const m of ['gdp', 'population', 'stability']) reasons[id][m] = WhatIf.ledgerDiff(orig, alt, id, m, fromYear).slice(0, 3);
    }

    const rep = {
      label: info.label, y: info.y, m: info.m, tick: info.tick, applied: info.applied, from: info.from,
      years: Math.round((orig.tick - info.tick) / 12), now: { y: orig.year, m: orig.month },
      focus, rows, world, onlyOrig, onlyAlt, chain, reasons,
      failed: (info.failed || []).map((f) => ({ y: f.cmd.y, m: f.cmd.m, text: describeCmd(orig, f.cmd), reason: f.reason }))
    };
    rep.summary = WhatIf.summary(orig, alt, rep);
    return rep;
  };

  // ---------- 6. 重點摘要：改寫了什麼、差異何時出現、最後造成什麼結果（只引用比較結果與兩條世界線的紀錄） ----------
  // 世界總量（人口、GDP）在年度數列中第一次相差超過 threshold 的年份
  WhatIf.divergeYear = function (orig, alt, fromYear, threshold) {
    const th = threshold || 0.01;
    const tot = (w, y, m) => { const i = w.series.labels.indexOf(y); if (i < 0) return null; let s = 0; for (const id in w.series.c) { const v = w.series.c[id][m] && w.series.c[id][m][i]; if (v > 0) s += v; } return s; };
    for (const y of orig.series.labels) {
      if (y < fromYear) continue;
      for (const m of ['gdp', 'pop']) {
        const a = tot(orig, y, m), b = tot(alt, y, m);
        if (a > 0 && b != null && Math.abs(b / a - 1) >= th) return { y, metric: m, pct: (b / a - 1) * 100 };
      }
    }
    return null;
  };
  WhatIf.summary = function (orig, alt, R) {
    const pct = (a, b) => (a > 0 ? (b / a - 1) * 100 : 0);
    const sg = (x) => (x >= 0 ? '+' : '') + x.toFixed(Math.abs(x) < 1 ? 1 : 0) + '%';
    const first = R.chain.find((c) => c.kind !== 'start') || null;
    const div = WhatIf.divergeYear(orig, alt, R.y);
    const out = { changed: `${R.y} 年 ${R.m} 月：${R.label}`, first: null, diverge: null, result: [] };
    if (!R.applied) { out.result.push('重跑時沒有遇到這件事，兩個世界沒有分岔。'); return out; }
    if (first) out.first = { y: first.y, m: first.m, after: Math.max(0, first.y - R.y), title: first.title, side: first.side, eventId: first.eventId };
    if (div) out.diverge = { y: div.y, after: Math.max(0, div.y - R.y), metric: div.metric === 'gdp' ? '世界 GDP' : '世界人口', pct: div.pct };
    const W0 = R.world.orig, W1 = R.world.alt;
    const dp = pct(W0.pop, W1.pop), dg = pct(W0.gdp, W1.gdp);
    if (Math.abs(dp) >= 0.5 || Math.abs(dg) >= 0.5) out.result.push(`到 ${R.now.y} 年，世界人口 ${sg(dp)}、世界 GDP ${sg(dg)}（平行世界比原世界）`);
    else out.result.push(`到 ${R.now.y} 年，世界總人口與 GDP 幾乎一樣（差距不到 0.5%）`);
    const top = R.rows.find((r) => r.score > 0.05);
    if (top) {
      if (!top.orig || !top.alt || top.orig.alive !== top.alt.alive) out.result.push(`影響最大的是${top.name}：${top.alt && top.alt.alive ? '只存在於平行世界' : '在平行世界不存在'}`);
      else {
        const bits = [];
        const g = pct(top.orig.gdp, top.alt.gdp), q = pct(top.orig.pop, top.alt.pop);
        if (Math.abs(g) >= 1) bits.push(`GDP ${sg(g)}`);
        if (Math.abs(q) >= 1) bits.push(`人口 ${sg(q)}`);
        if (top.orig.regime !== top.alt.regime) bits.push(`制度 ${top.orig.regime} → ${top.alt.regime}`);
        if (Math.abs(top.alt.stability - top.orig.stability) >= 10) bits.push(`穩定度 ${top.orig.stability.toFixed(0)} → ${top.alt.stability.toFixed(0)}`);
        if (bits.length) out.result.push(`影響最大的是${top.name}：${bits.join('、')}`);
      }
    }
    if (W0.wars !== W1.wars) out.result.push(`分岔後爆發的戰爭：原世界 ${W0.wars} 場、平行世界 ${W1.wars} 場`);
    const E0 = orig.future && orig.future.ended, E1 = alt.future && alt.future.ended;
    if ((E0 || E1) && !(E0 && E1 && E0.kind === E1.kind && E0.y === E1.y)) {
      const t = (E) => (E ? `${E.title}（${E.y} 年）` : '還沒有走到結局');
      out.result.push(`世界結局：原世界 ${t(E0)}；平行世界 ${t(E1)}`);
    }
    const n = R.onlyOrig.length + R.onlyAlt.length;
    if (n) out.result.push(`分岔後共有 ${n} 件重大事件只在其中一個世界發生`);
    return out;
  };




  // ---------- 遠古時代 ----------
  // 遠古一期好幾年，事件用期數（e.tick）定位；可以改寫的事件：
  // 自行發明（之後這個地區只能等鄰居傳入）、政體形成、出兵、政體瓦解或失去地區、瘟疫
  WhatIf.ancientOptions = function (w, e) {
    if (e.tick == null) return [];
    const R = w.ancient.regions, P = w.ancient.polities;
    const rn = (id) => (R[id] ? R[id].name : id);
    const pn = (id) => (P[id] ? P[id].name : id);
    const base = { eventId: e.id, tick: e.tick, y: e.y, m: 1 };
    const out = [];
    const add = (label, t) => out.push({ key: 'block', action: 'block', label, target: Object.assign({}, base, t) });
    const rid = e.countries[0];
    if (e.type === 'tech' && e.techId && (e.causes || [])[0] === '自行發明') {
      add(`如果${rn(rid)}沒有自己發明「${WS.Data.ancientTechs[e.techId].name}」（只能等鄰近地區傳入）`, { kind: 'invent', region: rid, techId: e.techId });
    } else if (e.type === 'polity' && e.polity && /新政體形成/.test(e.title)) {
      add(`如果${rn(rid)}這時沒有形成「${pn(e.polity)}」`, { kind: 'polity', region: rid });
    } else if (e.type === 'polity' && e.polity && /(瓦解|失去)/.test(e.title)) {
      add(`如果${pn(e.polity)}這時沒有${/瓦解/.test(e.title) ? '瓦解' : '失去' + rn(e.countries[1])}`, { kind: 'collapse', polity: e.polity, countries: e.countries.slice() });
    } else if (e.type === 'war' && e.polity && e.countries[1]) {
      add(`如果${pn(e.polity)}沒有出兵${rn(e.countries[1])}`, { kind: 'war', a: e.polity, d: e.countries[1], countries: e.countries.slice() });
    } else if (e.type === 'conditional' && e.defId === 'plague') {
      add(`如果${rn(rid)}沒有發生這場瘟疫`, { kind: 'plague', region: rid });
    }
    return out;
  };

  WhatIf.compareAncient = function (orig, alt, info) {
    const A = WS.Ancient;
    const ids = A.ids(orig);
    const row = (w, id) => {
      const r = w.ancient.regions[id], p = r.polity ? w.ancient.polities[r.polity] : null;
      return { pop: A.popOf(r), farm: A.farmShare(r), cities: r.cities.length, polity: p ? p.name : '—', era: r.era, techs: Object.keys(r.tech).filter((t) => r.tech[t].done).length };
    };
    const rows = ids.map((id) => {
      const a = row(orig, id), b = row(alt, id);
      const score = Math.abs(Math.log(Math.max(1e-6, b.pop) / Math.max(1e-6, a.pop))) + Math.abs(b.farm - a.farm) + Math.abs(b.cities - a.cities) / 4 + (a.polity !== b.polity ? 0.3 : 0) + Math.abs(b.techs - a.techs) / 10;
      return { id, name: orig.ancient.regions[id].name, orig: a, alt: b, score };
    }).sort((x, y) => y.score - x.score);
    const sum = (w) => {
      const s = A.summary(w);
      return { pop: s.pop, polities: s.polities, states: s.states, cities: s.cities, writing: s.writing, farming: s.farming };
    };
    const world = { orig: sum(orig), alt: sum(alt) };
    // 世界第一次：哪些發明的地點或年代不同
    const firsts = [];
    const keys = new Set(Object.keys(orig.ancient.firsts).concat(Object.keys(alt.ancient.firsts)));
    for (const k of keys) {
      const a = orig.ancient.firsts[k], b = alt.ancient.firsts[k];
      if (a && b && a.region === b.region && a.year === b.year) continue;
      if ((a && a.region == null) || (b && b.region == null)) continue;
      firsts.push({ key: k, orig: a || null, alt: b || null });
    }
    const T = (e) => (e.tick != null ? e.tick : 0);
    const after = (w) => w.events.filter((e) => T(e) >= info.tick && e.level >= 2 && e.type !== 'branch' && e.type !== 'system');
    const unmatched = (list, other) => {
      const pool = {};
      for (const e of other) pool[e.title] = (pool[e.title] || 0) + 1;
      return list.filter((e) => { if (pool[e.title]) { pool[e.title]--; return false; } return true; });
    };
    const oe = after(orig).filter((e) => e.id !== info.eventId);
    const ae = after(alt).filter((e) => e.type !== 'whatif');
    const onlyOrig = unmatched(oe, ae), onlyAlt = unmatched(ae, oe);
    const chain = [{ y: info.y, m: 1, kind: 'start', title: info.label, why: [`從${info.from}用同一個種子重跑，只改寫這件事`] }];
    const merged = onlyOrig.map((e) => ({ e, side: 'orig' })).concat(onlyAlt.map((e) => ({ e, side: 'alt' }))).sort((x, y) => T(x.e) - T(y.e) || (x.side === 'orig' ? -1 : 1));
    for (const { e, side } of merged) {
      if (chain.length >= 8) break;
      if (e.level < 3 && e.type !== 'polity' && e.type !== 'war') continue;
      chain.push({ y: e.y, m: 1, kind: side === 'orig' ? 'gone' : 'new', title: e.title, why: (e.causes || []).slice(0, 3), eventId: e.id, side });
    }
    const top = rows[0] ? rows[0].id : null;
    const reasons = {};
    if (top) {
      reasons[top] = {};
      const led = (w) => { const out = {}; const r = w.ancient.regions[top]; for (const y of r.causes.years) if (y.year >= info.y) for (const f in y.data.population || {}) out[f] = (out[f] || 0) + y.data.population[f].v; return out; };
      const a = led(orig), b = led(alt);
      reasons[top].population = [...new Set(Object.keys(a).concat(Object.keys(b)))].map((k) => ({ factor: k, orig: a[k] || 0, alt: b[k] || 0, diff: (b[k] || 0) - (a[k] || 0) }))
        .filter((x) => Math.abs(x.diff) > 1e-9).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 3);
    }
    const first = chain.find((c) => c.kind !== 'start');
    const wo = world.orig, wa = world.alt;
    const dpop = wo.pop > 0 ? (wa.pop / wo.pop - 1) * 100 : 0;
    const res = [];
    if (!info.applied) res.push('重跑時沒有遇到這件事，兩個世界沒有分岔。');
    else {
      res.push(Math.abs(dpop) >= 0.5 ? `到${A.yearLabel(orig.year)}，世界人口 ${dpop >= 0 ? '+' : ''}${dpop.toFixed(1)}%（平行世界比原世界）` : `到${A.yearLabel(orig.year)}，世界人口幾乎一樣`);
      if (wo.polities !== wa.polities || wo.states !== wa.states) res.push(`政體：原世界 ${wo.polities} 個（國家 ${wo.states}）、平行世界 ${wa.polities} 個（國家 ${wa.states}）`);
      if (rows[0] && rows[0].score > 0.05) { const r0 = rows[0]; res.push(`影響最大的是${r0.name}：人口 ${r0.orig.pop > 0 ? ((r0.alt.pop / r0.orig.pop - 1) * 100).toFixed(0) : 0}%${r0.orig.polity !== r0.alt.polity ? `，政體 ${r0.orig.polity} → ${r0.alt.polity}` : ''}`); }
      if (firsts.length) res.push(`有 ${firsts.length} 項發明的地點或年代不同`);
    }
    const summary = { changed: `${A.yearLabel(info.y)}：${info.label}`, first: first ? { y: first.y, after: Math.max(0, first.y - info.y), title: first.title, side: first.side, eventId: first.eventId, ancient: true } : null, diverge: null, result: res };
    return {
      summary,
      ancient: true, label: info.label, y: info.y, m: 1, tick: info.tick, applied: info.applied, from: info.from,
      years: orig.year - info.y, now: { y: orig.year, m: 1 }, focus: top, rows, world, firsts, onlyOrig, onlyAlt, chain, reasons,
      failed: (info.failed || []).map((f) => ({ y: f.cmd.y, m: 1, text: f.cmd.cmd === 'divine' && WS.Divine.ANCIENT_KINDS ? '神之手：' + ((WS.Divine.ANCIENT_KINDS[f.cmd.args[0]] || {}).name || f.cmd.args[0]) : f.cmd.cmd, reason: f.reason }))
    };
  };

  function describeCmd(w, c) {
    if (c.cmd === 'policy') return `${nameOf(w, c.args[0])}執行「${(WS.Policies.defs[c.args[1]] || { name: c.args[1] }).name}」`;
    if (c.cmd === 'rule') return `修改世界規則「${(WS.Data.rules[c.args[0]] || { name: c.args[0] }).name}」`;
    return c.cmd;
  }
})(typeof window !== 'undefined' ? window : globalThis);
