// Event System：固定歷史事件、條件事件、動態事件與因果紀錄（第 10 章）
// 每個事件都記錄：時間、相關國家、原因、觸發條件、直接影響、後續事件。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Events = (WS.Events = {});
  const U = () => WS.util;

  Events.log = function (w, ctx, e) {
    w.counters.event++;
    const ev = Object.assign({ id: 'E' + w.counters.event, y: w.year, m: w.month, level: 1, countries: [], causes: [], effects: [], followups: [] }, e);
    if (ev.parent) {
      const p = w.events.find((x) => x.id === ev.parent);
      if (p) p.followups.push(ev.id);
    }
    w.events.push(ev);
    if (w.events.length > 3000) w.events.splice(0, w.events.length - 3000);
    if (ctx && w.intervention === 'occasional') {
      if (w.mode === 'country' && ev.major && ev.countries.includes(w.focus)) ctx.major.push(ev);
      else if (w.mode === 'global' && ev.level >= 3 && ['war', 'regime', 'newcountry', 'organization', 'newregime'].includes(ev.type)) ctx.major.push(ev);
    }
    return ev;
  };

  Events.changeLeader = function (w, c, reason, ctx, parent, preferred) {
    const old = c.leader ? c.leader.name : '—';
    let nl = null;
    if (preferred) nl = preferred;
    else if (c.leaderPool.length) nl = c.leaderPool.shift();
    else nl = { name: `${c.name}第${(c.flags.leaderCount = (c.flags.leaderCount || 1) + 1)}任領導人`, comp: 0.35 + ctx.rng.next() * 0.4, aggr: 0.2 + ctx.rng.next() * 0.6, reform: 0.2 + ctx.rng.next() * 0.6 };
    c.leader = Object.assign({ since: w.tick }, nl);
    return Events.log(w, ctx, {
      type: 'leader', title: `${c.name}領導人更替：${old} → ${c.leader.name}`, countries: [c.id], level: 2, parent,
      major: c.id === w.focus,
      causes: [reason], effects: [`新領導人能力 ${(c.leader.comp * 100).toFixed(0)}、改革傾向 ${(c.leader.reform * 100).toFixed(0)}、侵略傾向 ${(c.leader.aggr * 100).toFixed(0)}`]
    });
  };

  Events.changeRegime = function (w, c, to, title, causes, ctx, parent, extra) {
    const from = U().regime(w, c.regime).name;
    c.regime = to;
    const R = U().regime(w, to);
    c.regimeLabel = c.name + '（' + R.name + '）';
    const ev = Events.log(w, ctx, Object.assign({
      type: 'regime', title: `${c.name}制度轉變：${title}`, countries: [c.id], level: 3, parent, major: c.id === w.focus,
      text: `政治制度由「${from}」轉為「${R.name}」。`, causes
    }, extra || {}));
    if (R.planned && w.rules.capitalism !== false) ev.effects.push('改採計畫經濟，投資由國家分配');
    return ev;
  };

  function cond(list) { // list of [boolean, text]
    const ok = list.every((x) => x[0]);
    return { ok, reasons: list.map((x) => (x[0] ? '✔ ' : '✘ ') + x[1]) };
  }

  // ---- 事件定義 ----
  Events.defs = [
    // ===== 固定歷史事件（有條件，不強制發生）=====
    {
      id: 'wuchang', type: 'historical', name: '武昌起義', scenario: '1911', date: [1911, 10], country: 'CHN',
      check: (w, c) => cond([[c.regime === 'monarchy', '清廷仍為君主專制'], [c.pol.stability < 50, `政治穩定度 ${c.pol.stability.toFixed(0)} < 50`], [c.pol.legitimacy < 40, `政府合法性 ${c.pol.legitimacy.toFixed(0)} < 40`]]),
      prob: 0.85,
      apply(w, c) { c.pol.conflict = Math.min(100, c.pol.conflict + 15); c.pol.revolutionPressure += 40; U().cause(c, 'conflict', '武昌起義', 15); return ['社會衝突 +15', '革命壓力大幅上升（之後數月革命機率提高）']; }
    },
    {
      id: 'sarajevo', type: 'historical', name: '巴爾幹危機（塞拉耶佛事件）', scenario: '1911', date: [1914, 6], country: 'DEU',
      check: (w, c) => {
        const r1 = U().relation(w, 'DEU', 'RUS'), r2 = U().relation(w, 'DEU', 'FRA');
        return cond([[w.rules.war !== false && w.rules.states !== false, '世界允許國家間戰爭'], [!!r1 && r1.rel < -10, `德俄關係 ${r1 ? r1.rel.toFixed(0) : '—'} < −10`], [!!r2 && r2.rel < -30, `德法關係 ${r2 ? r2.rel.toFixed(0) : '—'} < −30`]]);
      },
      prob: 1,
      apply(w, c) { WS.Diplomacy.remember(w, 'DEU', 'RUS', -35, '巴爾幹危機'); WS.Diplomacy.remember(w, 'DEU', 'FRA', -15, '巴爾幹危機'); return ['德俄關係急遽惡化', '德法關係惡化', '各國將依自身判斷決定是否開戰（不強制）']; }
    },
    {
      id: 'twentyone', type: 'historical', name: '日本對華二十一條要求', scenario: '1911', date: [1915, 1], country: 'JPN',
      check: (w, c) => {
        const C = w.countries.CHN; const r = U().relation(w, 'CHN', 'JPN');
        return cond([[!!C && C.alive, '中國存在'], [!!C && c.mil.power > C.mil.power * 1.3, '日本軍力明顯優於中國'], [!!C && C.pol.stability < 55, '中國國內不穩'], [!!r && r.rel < -10, '中日關係緊張']]);
      },
      prob: 0.9,
      apply(w, c) { const C = w.countries.CHN; WS.Diplomacy.remember(w, 'CHN', 'JPN', -25, '二十一條'); C.pol.legitimacy -= 5; C.pol.conflict += 5; U().cause(C, 'legitimacy', '二十一條屈辱', -5); U().cause(C, 'conflict', '二十一條引發民憤', 5); return ['中日關係大幅惡化', '中國政府合法性 −5', '中國社會衝突 +5']; }
    },

    // ===== 條件事件 =====
    {
      id: 'revolution', type: 'conditional', name: '革命', cooldown: 36,
      check: (w, c) => cond([[c.regime !== 'commune' && (c.regime !== 'republic' || c.pol.legitimacy < 20), c.regime === 'republic' ? '共和政府已失去合法性（< 20）' : '非民主共和或共治制度'], [c.pol.stability < 35 || c.pol.revolutionPressure > 20, `穩定度 ${c.pol.stability.toFixed(0)} < 35 或革命壓力高`], [c.pol.conflict > 50, `社會衝突 ${c.pol.conflict.toFixed(0)} > 50`], [c.pol.legitimacy < 40, `合法性 ${c.pol.legitimacy.toFixed(0)} < 40`]]),
      prob: (w, c) => w.params.events.revolutionBase + Math.max(0, 35 - c.pol.stability) * 0.002 + c.pol.revolutionPressure * 0.003,
      apply(w, c, ctx, ev) {
        const pol = c.pol;
        const success = U().clamp(0.3 + (pol.conflict - 50) / 100 + (60 - pol.armyLoyalty) / 100 + pol.revolutionPressure / 100, 0.1, 0.9);
        const roll = ctx.rng.next();
        ev.causes.push(`革命成功機率 ${(success * 100).toFixed(0)}%（衝突、軍隊忠誠 ${pol.armyLoyalty.toFixed(0)}、革命壓力）`);
        const P = U().popTotal(c);
        const deaths = P * 0.0005;
        c.pop.c2 -= deaths; U().cause(c, 'population', '死亡', -deaths, '革命動亂');
        if (roll < success) {
          let to = 'republic';
          if (pol.inequality > 60 && c.demo.edu > 20 && ctx.rng.chance(0.5)) to = 'socialist';
          let born = false;
          if (to === 'republic' && c.demo.edu > 60 && pol.inequality > 55) {
            born = !U().regime(w, 'socialdemocracy');
            to = WS.State.ensureRegime(w, 'socialdemocracy', { name: '社會民主共和', family: 'democracy', elections: true, repression: false, emergent: true });
          }
          pol.legitimacy = 55; pol.stability = Math.max(15, pol.stability - 10); pol.conflict -= 15; pol.armyLoyalty = 50; pol.revolutionPressure = 0;
          for (const s in c.econ.sec) c.econ.sec[s].K *= 0.99;
          const e2 = Events.changeRegime(w, c, to, '革命成功', ['由革命直接造成'], ctx, ev.id);
          if (born) Events.log(w, ctx, { type: 'newregime', title: '新的政治制度誕生：社會民主共和', countries: [c.id], level: 3, parent: e2.id, causes: [`教育 ${c.demo.edu.toFixed(0)} > 60`, `貧富差距 ${pol.inequality.toFixed(0)} > 55`, '民主參與與再分配要求結合，形成既有制度表中沒有的型態'] });
          Events.changeLeader(w, c, '革命後新政權成立', ctx, e2.id);
          return ['革命成功', '舊政權被推翻'];
        }
        pol.conflict -= 10; pol.stability += 3; pol.legitimacy -= 8; pol.revolutionPressure = 0;
        U().cause(c, 'legitimacy', '鎮壓革命', -8);
        return ['革命失敗，遭到鎮壓', '社會衝突 −10', '合法性 −8'];
      }
    },
    {
      id: 'coup', type: 'conditional', name: '軍事政變', cooldown: 48,
      check: (w, c) => cond([[w.rules.states !== false, '存在國家軍隊'], [c.pol.armyLoyalty < 35, `軍隊忠誠 ${c.pol.armyLoyalty.toFixed(0)} < 35`], [c.pol.stability < 45, `穩定度 ${c.pol.stability.toFixed(0)} < 45`]]),
      prob: (w) => w.params.events.coupBase,
      apply(w, c, ctx, ev) {
        let to = 'authoritarian';
        const born = c.goal === 'expand' && c.pol.exhaustion < 30 && !U().regime(w, 'militarist');
        if (c.goal === 'expand' && c.pol.exhaustion < 30) to = WS.State.ensureRegime(w, 'militarist', { name: '軍國主義', family: 'autocracy', elections: false, repression: true, emergent: true });
        c.pol.armyLoyalty = 70; c.pol.legitimacy = 40; c.pol.stability += 5;
        const e2 = Events.changeRegime(w, c, to, '軍事政變', ['軍方接管政府'], ctx, ev.id);
        Events.changeLeader(w, c, '軍方推舉新領導人', ctx, e2.id);
        if (to === 'militarist') shiftMil(c);
        if (born) Events.log(w, ctx, { type: 'newregime', title: '新的政治制度誕生：軍國主義', countries: [c.id], level: 3, parent: e2.id, causes: ['以擴張為國家目標', '軍方發動政變並掌握國家', '軍事目標凌駕其他政策，形成新的制度型態'] });
        return ['軍方掌權'];
      }
    },
    {
      id: 'warlordism', type: 'conditional', name: '地方割據', cooldown: 60,
      check: (w, c) => cond([[['republic', 'authoritarian', 'constitutional', 'socialdemocracy'].includes(c.regime), '中央政府存在但脆弱'], [c.pol.stability < 35, `穩定度 ${c.pol.stability.toFixed(0)} < 35`], [c.pol.localPower > 62, `地方勢力 ${c.pol.localPower.toFixed(0)} > 62`], [c.pol.admin < 40, `行政效率 ${c.pol.admin.toFixed(0)} < 40`]]),
      prob: 0.03,
      apply(w, c, ctx, ev) {
        c.pol.admin -= 8; c.pol.localPower = Math.min(100, c.pol.localPower + 10);
        Events.changeRegime(w, c, 'warlord', '地方勢力割據', ['中央無法控制地方軍事與財政'], ctx, ev.id);
        return ['中央權威瓦解', '行政效率 −8', '地方勢力 +10'];
      }
    },
    {
      id: 'reunification', type: 'conditional', name: '國家重新統一', cooldown: 24,
      check: (w, c) => cond([[c.regime === 'warlord', '目前處於割據'], [c.pol.stability > 42, `穩定度 ${c.pol.stability.toFixed(0)} > 42`], [c.pol.localPower < 62, `地方勢力 ${c.pol.localPower.toFixed(0)} < 62`]]),
      prob: 0.04,
      apply(w, c, ctx, ev) {
        c.pol.legitimacy += 15; c.pol.localPower -= 10;
        const e2 = Events.changeRegime(w, c, 'authoritarian', '中央政府重新統一全國', ['某一勢力取得優勢並收編地方'], ctx, ev.id);
        Events.changeLeader(w, c, '統一者成為國家領導人', ctx, e2.id);
        return ['合法性 +15', '地方勢力 −10'];
      }
    },
    {
      id: 'democratization', type: 'conditional', name: '民主化', cooldown: 60,
      check: (w, c) => cond([[['authoritarian', 'militarist', 'constitutional'].includes(c.regime), '非民主制度'], [c.demo.edu > 60, `教育 ${c.demo.edu.toFixed(0)} > 60`], [c.pol.support < 45, `民眾支持 ${c.pol.support.toFixed(0)} < 45`], [c.pol.conflict > 40, `社會衝突 ${c.pol.conflict.toFixed(0)} > 40`]]),
      prob: 0.006,
      apply(w, c, ctx, ev) {
        c.pol.legitimacy = Math.max(c.pol.legitimacy, 55); c.pol.conflict -= 10;
        const e2 = Events.changeRegime(w, c, 'republic', '民主化轉型', ['受過教育的民眾要求政治參與'], ctx, ev.id);
        Events.changeLeader(w, c, '首次自由選舉', ctx, e2.id);
        return ['社會衝突 −10'];
      }
    },
    {
      id: 'secession', type: 'conditional', name: '分裂獨立', cooldown: 36,
      check: (w, c) => cond([[w.rules.states !== false, '存在國家'], [c.regions.length >= 3, `擁有 ${c.regions.length} 個地區`], [c.pol.localPower > 68 || (c.flags.atWar && c.pol.exhaustion > 60), `地方勢力 ${c.pol.localPower.toFixed(0)} > 68 或戰爭耗竭`], [c.pol.stability < 30, `穩定度 ${c.pol.stability.toFixed(0)} < 30`]]),
      prob: (w, c) => w.params.events.secessionBase * (1 + Math.max(0, c.pol.localPower - 68) / 8),
      apply(w, c, ctx, ev) {
        const cand = c.regions.filter((r) => !w.regions[r].capital);
        const reg = cand[Math.floor(ctx.rng.next() * cand.length)];
        const rn = w.regions[reg].name;
        const nc = WS.State.splitCountry(w, c.id, [reg], {
          name: rn + (c.regime === 'warlord' ? '自治政府' : '共和國'),
          regime: c.regime === 'warlord' ? 'warlord' : 'authoritarian',
          color: '#' + (0x404040 + Math.floor(ctx.rng.next() * 0xbfbfbf)).toString(16).padStart(6, '0'),
          dLat: (ctx.rng.next() - 0.5) * 14, dLon: (ctx.rng.next() - 0.5) * 18
        });
        ev.countries.push(nc.id);
        Events.log(w, ctx, {
          type: 'newcountry', title: `新國家成立：${nc.name}`, countries: [nc.id, c.id], level: 3, parent: ev.id, major: c.id === w.focus,
          text: `「${rn}」脫離${c.name}，成為獨立政治實體。`, causes: ['地方勢力長期坐大', '中央政府無力控制'],
          effects: [`人口約 ${U().fmt(U().popTotal(nc))} 百萬人移轉至新國家`]
        });
        return [`${rn}脫離${c.name}`];
      }
    },
    {
      id: 'famine', type: 'conditional', name: '饑荒', cooldown: 24,
      check: (w, c) => cond([[c.res.shortage > 0.25, `糧食短缺程度 ${(c.res.shortage * 100).toFixed(0)}%`]]),
      prob: 1,
      apply(w, c) { c.pol.support -= 8; return ['民眾支持 −8', '死亡率上升（已計入人口系統）']; }
    },
    {
      id: 'debt_crisis', type: 'conditional', name: '債務危機', cooldown: 60,
      check: (w, c) => cond([[w.rules.currency !== false, '存在貨幣與國債'], [c.fiscal.debt / c.econ.gdp > 1.5, `國債／GDP ${(c.fiscal.debt / c.econ.gdp * 100).toFixed(0)}% > 150%`]]),
      prob: 0.05,
      apply(w, c) {
        const cut = c.fiscal.debt * 0.5; c.fiscal.debt -= cut; U().cause(c, 'debt', '債務違約重整', -cut);
        c.pol.stability -= 10; c.pol.legitimacy -= 5; c.econ.openness = Math.max(0.1, c.econ.openness - 0.1);
        U().cause(c, 'stability', '債務危機', -10);
        return ['國債減半（違約）', '穩定度 −10', '貿易開放度下降'];
      }
    },
    {
      id: 'protest', type: 'conditional', name: '大規模示威', cooldown: 12,
      check: (w, c) => cond([[c.pol.support < 30, `民眾支持 ${c.pol.support.toFixed(0)} < 30`], [c.pol.conflict > 45, `社會衝突 ${c.pol.conflict.toFixed(0)} > 45`]]),
      prob: 0.04,
      apply(w, c, ctx, ev) {
        c.pol.stability -= 4; c.pol.conflict += 3; U().cause(c, 'stability', '大規模示威', -4);
        if (U().regime(w, c.regime).elections && ctx.rng.chance(0.5)) Events.changeLeader(w, c, '示威迫使政府下台', ctx, ev.id);
        return ['穩定度 −4', '社會衝突 +3'];
      }
    }
  ];

  function shiftMil(c) { c.fiscal.budget.military += 0.1; U().normalize(c.fiscal.budget); }

  Events.step = function (w, ids, ctx) {
    const u = U();
    for (const id of ids) {
      const c = w.countries[id];
      if (!c.alive) continue;
      c.cool = c.cool || {};
      // 到期的制度改革
      for (const p of c.pending.slice()) {
        if (p.due > w.tick) continue;
        c.pending.splice(c.pending.indexOf(p), 1);
        if (p.type === 'reform' && u.regime(w, p.to)) {
          const e = Events.changeRegime(w, c, p.to, '政治改革完成', ['半年前推動的政治改革生效'], ctx);
          if (u.regime(w, p.to).elections) Events.changeLeader(w, c, '改革後組成新政府', ctx, e.id);
        }
      }
      for (const def of Events.defs) {
        if (def.type === 'historical') {
          if (def.country !== id || w.scenario !== def.scenario || w.year !== def.date[0] || w.month !== def.date[1]) continue;
          const chk = def.check(w, c);
          if (chk.ok && ctx.rng.chance(def.prob)) {
            const ev = Events.log(w, ctx, { type: 'historical', defId: def.id, title: def.name, countries: [id], level: 3, major: id === w.focus || def.id === 'sarajevo', causes: chk.reasons, trigger: '歷史時點到達且條件成立' });
            ev.effects = def.apply(w, c, ctx, ev) || [];
          } else {
            Events.log(w, ctx, { type: 'historical-missed', defId: def.id, title: `歷史事件「${def.name}」沒有發生`, countries: [id], level: 2, causes: chk.reasons, trigger: chk.ok ? '條件成立但機率未觸發' : '前置條件改變' });
          }
          continue;
        }
        if ((c.cool[def.id] || -1e9) > w.tick) continue;
        const chk = def.check(w, c);
        if (!chk.ok) continue;
        const p = typeof def.prob === 'function' ? def.prob(w, c) : def.prob;
        if (!ctx.rng.chance(p)) continue;
        c.cool[def.id] = w.tick + (def.cooldown || 12);
        const ev = Events.log(w, ctx, {
          type: 'conditional', defId: def.id, title: `${c.name}：${def.name}`, countries: [id], level: ['famine', 'protest'].includes(def.id) ? 2 : 3,
          major: id === w.focus, causes: chk.reasons, trigger: `條件成立，本月觸發機率 ${(p * 100).toFixed(1)}%`
        });
        ev.effects = (def.apply(w, c, ctx, ev) || []).concat(ev.effects || []);
        for (const k of ['stability', 'legitimacy', 'support', 'conflict', 'corruption', 'localPower', 'admin', 'armyLoyalty']) c.pol[k] = u.clamp(c.pol[k], 0, 100);
      }

      // 選舉與政府輪替
      const R = u.regime(w, c.regime);
      if (R.elections && w.tick - (c.leader.termStart ?? c.leader.since) >= w.params.events.electionInterval) {
        const tenure = w.tick - c.leader.since;
        const lose = u.clamp(0.5 - (c.pol.support - 50) / 50, 0.15, 0.85);
        if (tenure >= w.params.events.electionInterval * 2) Events.changeLeader(w, c, `任期屆滿（已執政 ${Math.round(tenure / 12)} 年），政權交接`, ctx);
        else if (ctx.rng.chance(lose)) Events.changeLeader(w, c, `選舉落敗：民眾支持 ${c.pol.support.toFixed(0)}，落敗機率 ${(lose * 100).toFixed(0)}%`, ctx);
        else c.leader.termStart = w.tick;
      }
      // 君主身故
      if (c.regime === 'monarchy' && ctx.rng.chance(w.params.events.monarchDeath)) {
        c.pol.legitimacy = u.clamp(c.pol.legitimacy - 3, 0, 100);
        Events.changeLeader(w, c, '君主身故，由繼承人即位', ctx, null, { name: c.leader.name.replace(/（.*）/, '') + '之繼承人', comp: 0.3 + ctx.rng.next() * 0.4, aggr: 0.3 + ctx.rng.next() * 0.4, reform: 0.2 + ctx.rng.next() * 0.5 });
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
