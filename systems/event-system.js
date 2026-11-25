// Event System：固定歷史事件、條件事件、動態事件與因果紀錄（第 10 章）
// 每個事件都記錄：時間、相關國家、原因、觸發條件、直接影響、後續事件。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Events = (WS.Events = {});
  const U = () => WS.util;

  Events.log = function (w, ctx, e) {
    w.counters.event++;
    const ev = Object.assign({ id: 'E' + w.counters.event, y: w.year, m: w.month, level: 1, countries: [], causes: [], effects: [], followups: [] }, e);
    if (w.era === 'ancient') ev.tick = w.tick;   // 遠古：一期好幾年，用期數定位（「如果？」重跑用）
    if (ev.parent) {
      const p = w.events.find((x) => x.id === ev.parent);
      if (p) p.followups.push(ev.id);
    }
    w.events.push(ev);
    if (w.events.length > 3000) w.events.splice(0, w.events.length - 3000);
    // 這一期記下的事件（只給介面決定要不要暫停，不影響模擬）
    if (ctx) (ctx.logged || (ctx.logged = [])).push(ev);
    return ev;
  };

  // ---------- 事件節奏：哪些事件要暫停自動播放 ----------
  // 只決定「要不要停下來問玩家」，不改變世界；事件本身照樣由引擎依條件產生。
  //   critical：只暫停重大危機（戰爭爆發、革命、全球災難、世界結局；國家模式另含觀察國的政變與分裂）
  //   all：所有重要事件都詢問（舊版行為：政權更替、新國家、國際組織……）
  //   none：全部交由系統處理，不暫停（世界結局仍會顯示）
  Events.PAUSE_MODES = {
    critical: { name: '只暫停重大危機', desc: '戰爭爆發、革命、全球災難、文明毀滅時才停下來；其他事件收進年度摘要' },
    all: { name: '所有事件都詢問', desc: '政權更替、制度改革、新國家等重要事件都停下來讓你決定' },
    none: { name: '全部交由系統', desc: '不暫停，世界一路運轉；事件都收進年度摘要，結局時才停' }
  };
  const PACE = (w) => (w.params && w.params.pacing) || WS.DEFAULT_PARAMS.pacing;
  // 事件當事國占世界人口的比例（太小的部落或城邦的動盪，不打斷全球觀察）
  Events.share = function (w, ev) {
    const ids = U().ids(w);
    let tot = 0, mine = 0;
    for (const id of ids) { const p = U().popTotal(w.countries[id]); tot += p; if (ev.countries.includes(id)) mine += p; }
    return tot ? mine / tot : 0;
  };
  Events.isCritical = function (w, ev) {
    if (ev.type === 'ending' || ev.type === 'catastrophe' || ev.crisis) return true;
    const war = ev.type === 'war' && !!ev.warPair;                      // 戰爭爆發（結束不算）
    const revo = ev.type === 'conditional' && ev.defId === 'revolution';
    if (w.mode === 'country') {
      if (!ev.countries.includes(w.focus)) return false;
      return war || revo || (ev.type === 'conditional' && ['coup', 'secession'].includes(ev.defId));
    }
    if (!war && !revo) return false;
    return Events.share(w, ev) >= PACE(w).criticalMinShare;
  };
  Events.isNotable = function (w, ev) {
    if (w.mode === 'country') return !!ev.major && ev.countries.includes(w.focus);
    return ev.level >= 3 && ['war', 'regime', 'newcountry', 'organization', 'newregime', 'conditional'].includes(ev.type);
  };
  Events.shouldPause = function (w, ev, mode) {
    if (mode === 'none') return false;
    if (Events.isCritical(w, ev)) return true;
    return mode === 'all' && Events.isNotable(w, ev);
  };

  Events.changeLeader = function (w, c, reason, ctx, parent, preferred) {
    const old = c.leader ? c.leader.name : '—';
    let nl = null;
    // 神之手安排的候選者：只在自然更替時參與競爭，結果由機率決定
    const contest = WS.Divine ? WS.Divine.contest(w, c, ctx) : null;
    if (contest && contest.won) nl = contest.leader;
    else if (preferred) nl = preferred;
    else if (c.leaderPool.length) nl = c.leaderPool.shift();
    else nl = { name: `${c.name}第${(c.flags.leaderCount = (c.flags.leaderCount || 1) + 1)}任領導人`, comp: 0.35 + ctx.rng.next() * 0.4, aggr: 0.2 + ctx.rng.next() * 0.6, reform: 0.2 + ctx.rng.next() * 0.6 };
    c.leader = Object.assign({ since: w.tick }, nl);
    const ev = Events.log(w, ctx, {
      type: 'leader', title: `${c.name}領導人更替：${old} → ${c.leader.name}`, countries: [c.id], level: contest && contest.won ? 3 : 2, parent,
      major: c.id === w.focus,
      causes: [reason].concat(contest ? [contest.note] : []),
      effects: [`新領導人能力 ${(c.leader.comp * 100).toFixed(0)}、改革傾向 ${(c.leader.reform * 100).toFixed(0)}、侵略傾向 ${(c.leader.aggr * 100).toFixed(0)}` + (c.leader.care != null ? `、重視民生 ${(c.leader.care * 100).toFixed(0)}` : '')]
    });
    // 讓神之手的施展紀錄也連到這次上台（追蹤後續）
    if (contest && contest.won && contest.parent) { const g = w.events.find((x) => x.id === contest.parent); if (g && !g.followups.includes(ev.id)) g.followups.push(ev.id); }
    return ev;
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
      id: 'wuchang', type: 'historical', name: '武昌起義', scenario: ['1911', '1911w'], date: [1911, 10], country: 'CHN',
      check: (w, c) => cond([[c.regime === 'monarchy', '清廷仍為君主專制'], [c.pol.stability < 50, `政治穩定度 ${c.pol.stability.toFixed(0)} < 50`], [c.pol.legitimacy < 40, `政府合法性 ${c.pol.legitimacy.toFixed(0)} < 40`]]),
      prob: 0.85,
      apply(w, c) { c.pol.conflict = Math.min(100, c.pol.conflict + 15); c.pol.revolutionPressure += 40; U().cause(c, 'conflict', '武昌起義', 15); return ['社會衝突 +15', '革命壓力大幅上升（之後數月革命機率提高）']; }
    },
    {
      id: 'sarajevo', type: 'historical', name: '巴爾幹危機（塞拉耶佛事件）', scenario: ['1911', '1911w'], date: [1914, 6], country: 'DEU',
      check: (w, c) => {
        const r1 = U().relation(w, 'DEU', 'RUS'), r2 = U().relation(w, 'DEU', 'FRA');
        return cond([[w.rules.war !== false && w.rules.states !== false, '世界允許國家間戰爭'], [!!r1 && r1.rel < -10, `德俄關係 ${r1 ? r1.rel.toFixed(0) : '—'} < −10`], [!!r2 && r2.rel < -30, `德法關係 ${r2 ? r2.rel.toFixed(0) : '—'} < −30`]]);
      },
      prob: 1,
      apply(w, c) {
        WS.Diplomacy.remember(w, 'DEU', 'RUS', -35, '巴爾幹危機'); WS.Diplomacy.remember(w, 'DEU', 'FRA', -15, '巴爾幹危機');
        const out = ['德俄關係急遽惡化', '德法關係惡化'];
        // 全世界劇本：奧匈與塞爾維亞都還存在時，雙方關係也惡化
        const live = (id) => w.countries[id] && w.countries[id].alive;
        if (live('AUT') && live('SRB')) { WS.Diplomacy.remember(w, 'AUT', 'SRB', -45, '塞拉耶佛刺殺事件'); WS.Diplomacy.remember(w, 'AUT', 'RUS', -15, '巴爾幹危機'); out.push('奧匈與塞爾維亞關係急遽惡化', '奧俄關係惡化'); }
        return out.concat(['各國將依自身判斷決定是否開戰（不強制）']);
      }
    },
    {
      id: 'twentyone', type: 'historical', name: '日本對華二十一條要求', scenario: ['1911', '1911w'], date: [1915, 1], country: 'JPN',
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
        let won = roll < success;
        if (ctx.forced === 'success' || ctx.forced === 'fail') {
          won = ctx.forced === 'success';
          ev.causes.push(`平行世界設定：革命${won ? '成功' : '失敗'}（成功機率不變，結果被改寫）`);
        }
        const P = U().popTotal(c);
        const deaths = P * 0.0005;
        c.pop.c2 -= deaths; U().cause(c, 'population', '死亡', -deaths, '革命動亂');
        if (won) {
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

  // ---- 原子彈（2026-11-25）----
  // 戰時、有足夠科研能力的國家可能推動原子彈計畫（另外撥出的研究，不影響一般科技研究、不用亂數）；
  // 做出來後，對沒有原子彈的敵國可能動用。這是條件事件，不照史實年份或國家強制發生，可用「如果？」阻止。
  const atomEnemies = (w, c) => {
    const out = [];
    for (const war of w.wars) {
      if (war.ended) continue;
      const side = war.attackers.includes(c.id) ? war.defenders : war.defenders.includes(c.id) ? war.attackers : null;
      if (!side) continue;
      for (const x of side) { const X = w.countries[x]; if (X && X.alive && !(X.atom && X.atom.done)) out.push([x, war]); }
    }
    return out;
  };
  Events.atomProgram = function (w, c, ctx) {
    const p = w.params.events, u = U();
    if (w.rules.nukes === false || w.rules.war === false || w.rules.states === false) return;
    if (c.atom && c.atom.done) return;
    const war = w.wars.find((x) => !x.ended && (x.attackers.includes(c.id) || x.defenders.includes(c.id)) && x.months >= p.atomMinWarMonths);
    if (!war || c.overlord || c.demo.edu < p.atomMinEdu || !p.atomPrereq.every((t) => u.adopt(c, t) >= 0.3)) return;
    const add = (c.research.points || 0) * p.atomResearchShare / 12;
    if (add <= 0) return;
    c.atom = c.atom || { progress: 0, started: w.year };
    c.atom.progress += add;
    u.cause(c, 'research', '原子彈計畫', add, `戰時另外撥出的研究：${war.name}`);
    if (c.atom.progress >= p.atomCost) {
      c.atom.done = true; c.atom.year = w.year;
      const first = !w.atomFirst;
      if (first) w.atomFirst = { by: c.id, year: w.year };
      Events.log(w, ctx, {
        type: 'tech', techId: 'atom', first, crisis: first, title: first ? `${c.name}製造出世界上第一顆原子彈` : `${c.name}也製造出原子彈`, countries: [c.id], level: first ? 3 : 2, major: c.id === w.focus,
        text: '戰爭期間的原子彈計畫完成。之後是否動用，取決於戰局與敵國有沒有原子彈；你可以用神之手「化解核危機」讓這個國家較不願意動用。',
        causes: [`${war.name}已經打了 ${war.months} 個月`, `從 ${c.atom.started} 年開始投入戰時研究，累積 ${c.atom.progress.toFixed(0)}（需要 ${p.atomCost}）`, `教育 ${c.demo.edu.toFixed(0)}、已掌握電氣化與無線電`]
      });
    }
  };
  Events.defs.push({
    id: 'atomicbomb', type: 'conditional', name: '投下原子彈', cooldown: 60,
    check(w, c) {
      const en = atomEnemies(w, c);
      return cond([
        [w.rules.nukes !== false, '世界上可以製造核武'],
        [!!(c.atom && c.atom.done), '已經製造出原子彈'],
        [en.length > 0, en.length ? `正在和沒有原子彈的國家交戰（${en.map(([x]) => w.countries[x].name).slice(0, 3).join('、')}）` : '正在和沒有原子彈的國家交戰']
      ]);
    },
    // 神之手「化解核危機」會降低這個國家動用原子彈的機率
    prob: (w, c) => w.params.events.atomUseChance * (c.divine && c.divine.calm && c.divine.calm.until > w.tick ? c.divine.calm.mult : 1),
    apply(w, c, ctx, ev) {
      const p = w.params.events, u = U();
      const en = atomEnemies(w, c).sort((a, b) => u.popTotal(w.countries[b[0]]) - u.popTotal(w.countries[a[0]]) || (a[0] < b[0] ? -1 : 1));
      const [tid, war] = en[0];
      const T = w.countries[tid];
      const dead = u.popTotal(T) * p.atomDeath;
      const k = T.pop.c1 + T.pop.c2 + T.pop.c0;
      for (const key of ['c0', 'c1', 'c2']) T.pop[key] = Math.max(0.001, T.pop[key] - dead * T.pop[key] / k);
      u.cause(T, 'population', '死亡', -dead, `原子彈轟炸：${c.name}`);
      war.casualties[tid] = (war.casualties[tid] || 0) + dead;
      const sign = war.attackers.includes(c.id) ? 1 : -1;
      war.score = u.clamp(war.score + sign * p.atomScore, -100, 100);
      T.pol.exhaustion = u.clamp(T.pol.exhaustion + p.atomExhaustion, 0, 100);
      u.cause(T, 'stability', '遭到原子彈轟炸', -8);
      T.pol.stability = u.clamp(T.pol.stability - 8, 0, 100);
      for (const x of u.ids(w)) if (x !== c.id && x !== tid) WS.Diplomacy.remember(w, x, c.id, p.atomRelation, `${c.name}投下原子彈`);
      WS.Diplomacy.remember(w, tid, c.id, p.atomRelation * 2, `${c.name}的原子彈轟炸`);
      ev.title = `${c.name}對${T.name}投下原子彈`;
      ev.countries = [c.id, tid];
      ev.crisis = true;
      ev.atomTarget = tid;
      return [`${T.name}約 ${u.fmt(dead, 2)} 百萬人死亡（人口的 ${(p.atomDeath * 100).toFixed(1)}%）`, `${war.name}戰局往${c.name}一方移動 ${p.atomScore} 分`, `${T.name}戰爭疲憊 +${p.atomExhaustion}、穩定度 −8`, '其他國家對使用國的觀感變差'];
    }
  });

  const SUBJECT_SKIP = ['revolution', 'coup', 'warlordism', 'reunification', 'democratization', 'secession'];
  const PREFIX = /^(英屬|法屬|荷屬|美屬|比屬|德屬|葡屬|西屬|義屬|日屬)/;

  // 已經獨立的前殖民地數量（不含和平取得主權的自治領）
  const wave = (w) => U().ids(w).filter((id) => w.countries[id].formerOverlord && w.countries[id].formerKind !== 'dominion').length;

  // ---- 殖民地與自治領獨立（條件事件，不照史實年份強制發生）----
  Events.defs.push({
    id: 'independence', type: 'conditional', name: '獨立', cooldown: 24,
    check(w, c) {
      if (!c.overlord) return cond([[false, '不是殖民地或自治領']]);
      const O = w.countries[c.overlord];
      if (!O || !O.alive) return cond([[true, '宗主國已不存在']]);
      if (c.subjectType === 'dominion') return cond([[w.rules.states !== false, '存在國家'], [c.demo.edu > 70, `教育 ${c.demo.edu.toFixed(0)} > 70，自治傳統成熟`], [c.pol.stability > 50, `穩定度 ${c.pol.stability.toFixed(0)} > 50`]]);
      const weak = O.pol.exhaustion > 35 || O.pol.stability < 40, p = w.params.events;
      return cond([
        [w.rules.states !== false, '存在國家'],
        [c.pol.legitimacy < 40, `殖民政府合法性 ${c.pol.legitimacy.toFixed(0)} < 40`],
        [c.demo.edu > p.independenceNationEdu || c.demo.urban > 0.2, `民族意識形成：教育 ${c.demo.edu.toFixed(0)} > ${p.independenceNationEdu} 或都市化 ${(c.demo.urban * 100).toFixed(0)}% > 20%`],
        [weak || c.demo.edu > p.independenceMovementEdu, `宗主國${O.name}力量衰退（戰爭耗竭 ${O.pol.exhaustion.toFixed(0)} > 35 或穩定度 ${O.pol.stability.toFixed(0)} < 40）或民族運動壯大（教育 > ${p.independenceMovementEdu}）`]
      ].concat(wave(w) ? [[true, `民族自決風潮：已有 ${wave(w)} 個前殖民地獨立`]] : []));
    },
    prob(w, c) {
      const O = w.countries[c.overlord], p = w.params.events;
      if (!O || !O.alive) return 1;
      if (c.subjectType === 'dominion') return p.independenceDominion;
      const waveMult = Math.min(p.independenceWaveMax, 1 + p.independenceWave * wave(w));
      return p.independenceBase * (1 + Math.max(0, c.demo.edu - p.independenceNationEdu) / p.independenceEduScale) * waveMult;
    },
    apply(w, c, ctx, ev) {
      const u = U(), oid = c.overlord, O = w.countries[oid];
      const kind = c.subjectType;
      const oldName = c.name;
      c.overlord = null; c.subjectType = null; c.formerOverlord = oid; c.formerKind = kind; c.independence = w.year;
      if (c.independentName) c.name = c.independentName;
      else c.name = c.name.replace(PREFIX, '');
      c.pol.legitimacy = u.clamp(c.pol.legitimacy + 25, 0, 100); u.cause(c, 'legitimacy', '獨立建國', 25);
      c.pol.support = u.clamp(c.pol.support + 10, 0, 100); u.cause(c, 'support', '獨立建國', 10);
      const r = u.relation(w, c.id, oid);
      const out = [`${oldName}脫離${O ? O.name : '宗主國'}獨立`, '合法性 +25', '民眾支持 +10'];
      if (kind === 'dominion') { r.base = 40; r.baseWhy = '和平取得完全主權的前母國'; out.push('與前母國維持友好'); }
      else {
        r.base = -10; r.baseWhy = '前殖民宗主國'; WS.Diplomacy.remember(w, c.id, oid, -20, '殖民統治結束');
        if (O && O.alive) { O.pol.legitimacy = u.clamp(O.pol.legitimacy - 3, 0, 100); u.cause(O, 'legitimacy', '失去殖民地', -3, c.name); out.push(`${O.name}合法性 −3`); }
      }
      Events.log(w, ctx, {
        type: 'newcountry', title: `新國家獨立：${c.name}`, countries: [c.id, oid], level: 3, parent: ev.id, major: c.id === w.focus || oid === w.focus,
        text: kind === 'dominion' ? `${oldName}和平取得完全主權，外交與國防自主。` : `${oldName}結束${O ? O.name : '宗主國'}的統治，成為獨立國家「${c.name}」。`,
        causes: ev.causes.slice(), effects: []
      });
      if (c.regime === 'colonial') {
        const to = c.demo.edu > 40 && c.pol.stability > 40 ? 'republic' : 'authoritarian';
        const e2 = Events.changeRegime(w, c, to, '殖民統治結束', ['獨立後建立本土政府'], ctx, ev.id);
        Events.changeLeader(w, c, '獨立運動領袖成為首任領導人', ctx, e2.id);
      } else c.regimeLabel = c.name + '（' + u.regime(w, c.regime).name + '）';
      return out;
    }
  });

  function shiftMil(c) { c.fiscal.budget.military += 0.1; U().normalize(c.fiscal.budget); }

  Events.step = function (w, ids, ctx) {
    const u = U();
    for (const id of ids) {
      const c = w.countries[id];
      if (!c.alive) continue;
      c.cool = c.cool || {};
      Events.atomProgram(w, c, ctx);
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
          if (def.country !== id || ![].concat(def.scenario).includes(w.scenario) || w.year !== def.date[0] || w.month !== def.date[1]) continue;
          const chk = def.check(w, c);
          const ov = WS.WhatIf ? WS.WhatIf.take(w, (o) => o.kind === 'event' && o.defId === def.id && o.country === id) : null;
          if (ov && ov.action === 'block') {
            const ev = WS.WhatIf.logDivergence(w, ctx, ov, [id], ['原世界線中的條件：'].concat(chk.reasons));
            ev.effects = [`「${def.name}」在這條世界線沒有發生`];
            continue;
          }
          const forced = ov && ov.action === 'force';
          if (forced || (chk.ok && ctx.rng.chance(def.prob))) {
            if (forced) WS.WhatIf.logDivergence(w, ctx, ov, [id], ['原世界線中的條件：'].concat(chk.reasons));
            const ev = Events.log(w, ctx, { type: 'historical', defId: def.id, title: def.name, countries: [id], level: 3, major: id === w.focus || def.id === 'sarajevo', causes: chk.reasons.concat(forced ? ['平行世界設定：玩家強制讓這件事發生（之後的影響仍由引擎計算）'] : []), trigger: forced ? '玩家的「如果」設定強制發生' : '歷史時點到達且條件成立', parent: forced ? ov.eventId : undefined });
            ev.effects = def.apply(w, c, ctx, ev) || [];
          } else {
            Events.log(w, ctx, { type: 'historical-missed', defId: def.id, title: `歷史事件「${def.name}」沒有發生`, countries: [id], level: 2, causes: chk.reasons, trigger: chk.ok ? '條件成立但機率未觸發' : '前置條件改變' });
          }
          continue;
        }
        // 殖民地、自治領、保護國的政權由宗主國掌握：政變、革命、割據等改由「獨立」事件處理
        if (c.overlord && SUBJECT_SKIP.includes(def.id)) continue;
        if ((c.cool[def.id] || -1e9) > w.tick) continue;
        const chk = def.check(w, c);
        if (!chk.ok) continue;
        const p = typeof def.prob === 'function' ? def.prob(w, c) : def.prob;
        if (!ctx.rng.chance(p)) continue;
        c.cool[def.id] = w.tick + (def.cooldown || 12);
        const ov = WS.WhatIf ? WS.WhatIf.take(w, (o) => o.kind === 'event' && o.defId === def.id && o.country === id) : null;
        if (ov && ov.action === 'block') {
          const ev = WS.WhatIf.logDivergence(w, ctx, ov, [id], ['原世界線中的條件：'].concat(chk.reasons));
          ev.effects = [`${c.name}的${def.name}沒有發生`, `同類事件 ${def.cooldown || 12} 個月內不會再觸發，之後仍依條件判斷`];
          continue;
        }
        if (ov) WS.WhatIf.logDivergence(w, ctx, ov, [id], [`原世界線中的條件：本月觸發機率 ${(p * 100).toFixed(1)}%`]);
        const ev = Events.log(w, ctx, {
          type: 'conditional', defId: def.id, title: `${c.name}：${def.name}`, countries: [id], level: ['famine', 'protest'].includes(def.id) ? 2 : 3,
          major: id === w.focus, causes: chk.reasons, trigger: `條件成立，本月觸發機率 ${(p * 100).toFixed(1)}%`, parent: ov ? ov.eventId : undefined
        });
        ctx.forced = ov ? ov.action : null;
        ev.effects = (def.apply(w, c, ctx, ev) || []).concat(ev.effects || []);
        ctx.forced = null;
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
