// Divine System：神之手（玩家干預）
// 玩家用「神力」改變世界的「條件」，而不是直接指定結果：
//   ・公共衛生援助 → 提高一段時間的醫療水準「目標」，實際醫療水準仍由人口引擎每月慢慢調整
//   ・分享已知科技 → 開一條知識管道，每月增加研究進度，速度取決於該國教育（吸收能力）
//   ・局部旱災     → 某個地區今年收成大減，糧食、經濟、穩定的連鎖反應由引擎計算
//   ・領導人候選者 → 只讓一位人物出現在政壇，要等政權自然更替時才「可能」上台
// 原則：不直接寫入人口、GDP、穩定度等核心數值；每次干預都經 WorldEngine 指令寫入 commandLog，
// 造成的變化以「神之手：…」寫進因果帳（U.cause），可以用「？」一路追查。
// 結果不保證：吸收能力、腐敗、運氣（同一個種子決定）都會影響成效。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Divine = (WS.Divine = {});
  const U = () => WS.util;

  Divine.KINDS = {
    health: { name: '援助公共衛生', icon: '✚', short: '提高醫療水準的目標，幾年內逐漸見效' },
    tech: { name: '分享一項已知科技', icon: '✦', short: '把世界上已有的技術知識送進一個國家' },
    drought: { name: '引發局部旱災', icon: '☀', short: '讓某個地區今年收成大減' },
    leader: { name: '讓領導人候選者出現', icon: '♛', short: '讓一位有特定性格的人物進入政壇' }
  };
  Divine.LEANINGS = {
    reform: { name: '改革派', trait: 'reform' },
    care: { name: '民生派', trait: 'care' },
    aggr: { name: '冒險派', trait: 'aggr' }
  };

  const P = (w) => w.params.divine || WS.DEFAULT_PARAMS.divine;
  const PA = (w) => (w.params.ancient && w.params.ancient.divine) || WS.ANCIENT_PARAMS.divine;
  Divine.params = (w) => (w.era === 'ancient' ? PA(w) : P(w));
  Divine.cost = (w, kind) => (w.era === 'ancient' ? PA(w) : P(w))[kind + 'Cost'];

  // 世界與國家的神之手狀態（舊存檔、新國家沒有時補上）
  Divine.ensure = function (w) {
    if (!w.divine) w.divine = { energy: P(w).energyStart, log: [], counter: 0 };
    return w.divine;
  };
  Divine.of = (c) => c.divine || (c.divine = {});

  // ---------- 可行性檢查（不消耗亂數，也不改變世界） ----------
  Divine.techOptions = function (w, c) {
    if (!c || !c.alive) return [];
    return WS.Technology.available(c, w).filter((t) => w.invented[t])
      .sort((a, b) => WS.Data.techs[a].cost - WS.Data.techs[b].cost || (a < b ? -1 : 1));
  };

  Divine.preview = function (w, kind, cid, opt) {
    if (w.era === 'ancient') return Divine.ancientPreview(w, kind, cid, opt);
    const D = Divine.ensure(w), p = P(w);
    const c = w.countries[cid];
    const K = Divine.KINDS[kind];
    if (!K) return { ok: false, reason: '沒有這種干預', checks: [] };
    const cost = Divine.cost(w, kind);
    const checks = [[D.energy >= cost, `神力 ${Math.floor(D.energy)}／需要 ${cost}`], [!!c && c.alive, '目標國家存在']];
    const st = c ? Divine.of(c) : {};
    const info = [];   // 會改變什麼
    const risk = [];   // 為什麼結果不保證
    if (kind === 'health' && c) {
      checks.push([!(st.health && st.health.until > w.tick), '這個國家沒有正在進行的衛生援助']);
      const absorb = w.params.population.medAbsorbBase + (1 - w.params.population.medAbsorbBase) * c.pol.admin / 100;
      info.push(`醫療水準的目標最多提高約 ${(p.healthBoost * 100).toFixed(0)}（0–100 刻度），${p.healthYears} 年內逐年遞減`);
      info.push('實際醫療水準由引擎每月慢慢調整，之後影響死亡率、人口與生育');
      risk.push(`行政效率 ${c.pol.admin.toFixed(0)}：吸收約 ${(absorb * 100).toFixed(0)}%`);
      risk.push(`腐敗 ${c.pol.corruption.toFixed(0)}：一部分援助會被耗損`);
      risk.push('實際成效還有運氣成分（由世界種子決定）');
    }
    if (kind === 'tech' && c) {
      const list = Divine.techOptions(w, c);
      const t = opt || list[0];
      checks.push([!(st.tech && st.tech.until > w.tick), '這個國家沒有正在開放的知識管道']);
      checks.push([!!t && list.includes(t), t && WS.Data.techs[t] ? `「${WS.Data.techs[t].name}」已有國家掌握，且${c.name}具備前置科技` : '有可以分享的已知科技（別國已掌握、本國具備前置條件）']);
      if (t && WS.Data.techs[t]) {
        const talent = Math.pow(Math.max(1, c.demo.edu) / 50, 0.8);
        const months = Math.ceil(1 / Math.max(1e-6, p.techMonthlyShare * talent));
        info.push(`知識管道開放 ${p.techMonths} 個月，教育 ${c.demo.edu.toFixed(0)} 時大約 ${months} 個月可完成研究`);
        info.push('完成研究後仍要依引擎慢慢普及，才會影響生產、醫療或軍事');
        risk.push(`吸收速度取決於教育水準（目前 ${c.demo.edu.toFixed(0)}），管道關閉前不一定來得及完成`);
        risk.push('實際速度還有運氣成分（由世界種子決定）');
      }
    }
    if (kind === 'drought' && c) {
      checks.push([!(st.drought && st.drought.until > w.tick), '這個國家沒有正在進行的旱災']);
      info.push(`隨機一個地區收成減少 ${(p.droughtSeverityMin * 100).toFixed(0)}–${(p.droughtSeverityMax * 100).toFixed(0)}%，全國影響依地區大小而定，持續到下一次收成`);
      info.push('糧食庫存、饑荒、物價、民心與穩定度的變化都由引擎計算');
      risk.push(`糧食庫存 ${c.res.foodStock.toFixed(1)} 個月、貿易開放度 ${(c.econ.openness * 100).toFixed(0)}% 會決定能不能撐過去`);
      risk.push('哪個地區受災、災情多重由世界種子決定');
    }
    if (kind === 'leader' && c) {
      const L = Divine.LEANINGS[opt || 'reform'];
      checks.push([!!L, '選擇候選者的性格']);
      checks.push([!(st.candidate && st.candidate.until > w.tick), '這個國家沒有尚未上台的候選者']);
      if (L) {
        info.push(`一位${L.name}人物出現在${c.name}政壇，活躍 ${p.leaderYears} 年`);
        info.push('他只會在政權自然更替（選舉、繼承、革命、政變）時參與競爭，不會直接奪權');
        info.push('上台後，性格只影響國家 AI 偏好哪些政策；政策能不能執行、效果如何仍由引擎決定');
        risk.push(`每次更替時勝出機率約 ${(p.leaderWinChance * 100).toFixed(0)}%；${p.leaderYears} 年內沒有更替就會淡出政壇`);
        risk.push(`${c.name}目前領導人：${c.leader ? c.leader.name : '—'}（${(WS.util.regime(w, c.regime) || {}).elections ? '有選舉，較常更替' : '沒有定期選舉，更替較少'}）`);
      }
    }
    const fail = checks.find((x) => !x[0]);
    return { ok: !fail, reason: fail ? fail[1] : null, cost, energy: D.energy, checks, info, risk, name: K.name };
  };

  // ---------- 施展（由 WorldEngine.divine 呼叫） ----------
  Divine.act = function (w, ctx, kind, cid, opt) {
    if (w.era === 'ancient') return Divine.ancientAct(w, ctx, kind, cid, opt);
    const pv = Divine.preview(w, kind, cid, opt);
    if (!pv.ok) return { ok: false, reason: pv.reason };
    const D = Divine.ensure(w), p = P(w), u = U();
    const c = w.countries[cid];
    const st = Divine.of(c);
    D.energy -= pv.cost;
    D.counter = (D.counter || 0) + 1;
    const entry = { id: 'G' + D.counter, kind, cid, name: c.name, y: w.year, m: w.month, tick: w.tick, cost: pv.cost, done: false, status: '進行中' };
    const causes = [`玩家使用神之手（耗費神力 ${pv.cost}）`];
    let title = '', effects = [];
    const luck = 0.7 + ctx.rng.next() * 0.6;

    if (kind === 'health') {
      const pp = w.params.population;
      const absorb = pp.medAbsorbBase + (1 - pp.medAbsorbBase) * c.pol.admin / 100;
      const leak = u.clamp(p.healthLeakBase + 0.4 * c.pol.corruption / 100, 0, 0.9);
      const boost = p.healthBoost * absorb * (1 - leak) * luck;
      st.health = { boost, start: w.tick, until: w.tick + p.healthYears * 12, gain: 0, logId: entry.id };
      title = `神之手：援助${c.name}公共衛生`;
      causes.push(`行政效率 ${c.pol.admin.toFixed(0)} → 吸收 ${(absorb * 100).toFixed(0)}%`, `腐敗 ${c.pol.corruption.toFixed(0)} → 耗損 ${(leak * 100).toFixed(0)}%`, `運氣（世界種子）× ${luck.toFixed(2)}`);
      effects = [`醫療水準目標提高 ${(boost * 100).toFixed(1)}（${p.healthYears} 年內逐年遞減）`, '實際醫療水準由引擎每月慢慢調整'];
      entry.label = `援助${c.name}公共衛生`;
    } else if (kind === 'tech') {
      const t = opt || pv && Divine.techOptions(w, c)[0];
      const def = WS.Data.techs[t];
      const talent = Math.pow(Math.max(1, c.demo.edu) / 50, 0.8);
      const rate = p.techMonthlyShare * talent * luck;
      st.tech = { id: t, rate, start: w.tick, until: w.tick + p.techMonths, gain: 0, logId: entry.id };
      const by = w.invented[t] && w.countries[w.invented[t].by] ? w.countries[w.invented[t].by].name : '世界上已有的知識';
      title = `神之手：把「${def.name}」的知識送進${c.name}`;
      causes.push(`這項技術已存在（${by}）`, `${c.name}教育 ${c.demo.edu.toFixed(0)} → 吸收倍率 ${talent.toFixed(2)}`, `運氣（世界種子）× ${luck.toFixed(2)}`);
      effects = [`每月增加約 ${(rate * 100).toFixed(1)}% 的研究進度，持續 ${p.techMonths} 個月`, '完成後仍需時間普及'];
      entry.label = `分享「${def.name}」給${c.name}`;
      entry.tech = t;
    } else if (kind === 'drought') {
      const regs = c.regions.slice().sort();
      const reg = regs[Math.floor(ctx.rng.next() * regs.length)];
      const totalW = regs.reduce((s, r) => s + w.regions[r].weight, 0);
      const share = w.regions[reg].weight / totalW;
      const sev = p.droughtSeverityMin + (p.droughtSeverityMax - p.droughtSeverityMin) * ctx.rng.next();
      const mult = 1 - sev * share;
      // 旱災持續到下一次一月收成；若剩不到半年，延續到再下一次
      let until = w.tick + (13 - w.month);
      if (until - w.tick < 6) until += 12;
      st.drought = { mult, region: reg, start: w.tick, until, foodLoss: 0, logId: entry.id };
      title = `神之手：${c.name}${w.regions[reg].name}發生旱災`;
      causes.push(`受災地區佔全國農業約 ${(share * 100).toFixed(0)}%`, `災情：該地區收成減少 ${(sev * 100).toFixed(0)}%（世界種子決定）`);
      effects = [`全國收成 ×${mult.toFixed(2)}，持續到 ${w.year + (until - w.tick > 12 - w.month + 1 ? 2 : 1)} 年 1 月`, '糧食、經濟與民心的變化由引擎計算'];
      entry.label = `${c.name}${w.regions[reg].name}旱災`;
    } else if (kind === 'leader') {
      const L = Divine.LEANINGS[opt || 'reform'];
      const main = p.leaderTraitMin + (0.95 - p.leaderTraitMin) * ctx.rng.next();
      const lead = {
        name: `${c.name}的${L.name}人物`,
        comp: 0.4 + ctx.rng.next() * 0.4,
        aggr: 0.3 + ctx.rng.next() * 0.35, reform: 0.35 + ctx.rng.next() * 0.3, care: 0.35 + ctx.rng.next() * 0.3,
        divine: true
      };
      lead[L.trait] = main;
      st.candidate = { leader: lead, lean: opt || 'reform', start: w.tick, until: w.tick + p.leaderYears * 12, tries: 0, logId: entry.id };
      title = `神之手：${c.name}政壇出現一位${L.name}人物`;
      causes.push(`候選者性格：${WS.Agents.TRAIT_NAMES[L.trait]} ${(main * 100).toFixed(0)}、能力 ${(lead.comp * 100).toFixed(0)}（世界種子決定）`);
      effects = [`要等政權自然更替，每次約 ${(p.leaderWinChance * 100).toFixed(0)}% 機會勝出`, `${p.leaderYears} 年內沒有機會就會淡出政壇`];
      entry.label = `${c.name}的${L.name}候選者`;
    }
    const ev = WS.Events.log(w, ctx, { type: 'divine', divineKind: kind, title, countries: [cid], level: 3, causes, effects, trigger: '玩家的神之手指令' });
    entry.eventId = ev.id;
    for (const k of ['health', 'tech', 'drought', 'candidate']) if (st[k] && st[k].logId === entry.id) st[k].eventId = ev.id;
    D.log.push(entry);
    if (D.log.length > 200) D.log.shift();
    return { ok: true, effects, eventId: ev.id, entry };
  };

  // ---------- 引擎掛鉤（各引擎呼叫，只回傳條件） ----------
  // 醫療水準目標的額外提高（逐年遞減）
  Divine.healthBoost = function (c, w) {
    const h = c.divine && c.divine.health;
    if (!h || h.until <= w.tick) return 0;
    return h.boost * (1 - (w.tick - h.start) / Math.max(1, h.until - h.start));
  };
  // 收成乘數（局部旱災）
  Divine.harvestMult = function (c, w) {
    const d = c.divine && c.divine.drought;
    return d && d.until > w.tick ? d.mult : 1;
  };
  // 知識管道：每月的研究進度（由科技引擎呼叫並寫入因果帳）
  Divine.techChannel = function (c, w) {
    const t = c.divine && c.divine.tech;
    if (!t || t.until <= w.tick || t.closed) return null;
    return t;
  };
  // 領導人更替時：候選者是否勝出（只有存在候選者時才會用到亂數，不影響沒有干預的世界）
  Divine.contest = function (w, c, ctx) {
    const cand = c.divine && c.divine.candidate;
    if (!cand || cand.until <= w.tick) return null;
    cand.tries++;
    const pct = P(w).leaderWinChance;
    const won = ctx.rng.chance(pct);
    if (!won) return { won: false, note: `神之手安排的${Divine.LEANINGS[cand.lean].name}人物也參與競爭，但沒有勝出（勝出機率 ${(pct * 100).toFixed(0)}%）` };
    delete c.divine.candidate;
    const entry = Divine.entry(w, cand.logId);
    if (entry) { entry.done = true; entry.status = `${w.year} 年 ${w.month} 月上台`; }
    return { won: true, leader: Object.assign({}, cand.leader), parent: cand.eventId, note: `神之手安排的${Divine.LEANINGS[cand.lean].name}人物在這次更替中勝出（勝出機率 ${(pct * 100).toFixed(0)}%）` };
  };

  Divine.entry = (w, id) => (w.divine && w.divine.log || []).find((e) => e.id === id);

  // ---------- 每月：恢復神力、結束到期的干預（寫入結果，方便玩家追蹤） ----------
  Divine.step = function (w, ids, ctx) {
    const D = Divine.ensure(w), p = P(w);
    D.energy = Math.min(p.energyMax, D.energy + p.energyRegenPerYear / 12);
    const u = U();
    for (const id of ids) {
      const c = w.countries[id];
      const st = c.divine;
      if (!st) continue;
      const end = (key, title, effects) => {
        const o = st[key];
        const entry = Divine.entry(w, o.logId);
        WS.Events.log(w, ctx, { type: 'divine', divineKind: key, title, countries: [id], level: 1, parent: o.eventId, causes: ['神之手干預期限到了'], effects });
        if (entry) { entry.done = true; entry.status = effects[0]; }
        delete st[key];
      };
      if (st.health && st.health.until <= w.tick) end('health', `${c.name}的衛生援助結束`, [`援助期間醫療水準因援助累計 ${st.health.gain >= 0 ? '+' : ''}${(st.health.gain * 100).toFixed(1)}`]);
      if (st.tech && (st.tech.until <= w.tick || st.tech.closed)) {
        const def = WS.Data.techs[st.tech.id];
        const done = u.invented(c, w, st.tech.id);
        end('tech', `通往${c.name}的「${def.name}」知識管道關閉`, [done ? `已完成研究「${def.name}」` : `管道關閉時尚未完成研究（進度 ${(Math.min(1, (c.tech[st.tech.id] || { progress: 0 }).progress / def.cost) * 100).toFixed(0)}%），之後依一般研究繼續`]);
      }
      if (st.drought && st.drought.until <= w.tick) end('drought', `${c.name}的旱災結束`, [`旱災期間少收約 ${st.drought.foodLoss.toFixed(1)} 個月的糧食`]);
      if (st.candidate && st.candidate.until <= w.tick) end('candidate', `${c.name}的${Divine.LEANINGS[st.candidate.lean].name}人物淡出政壇`, [st.candidate.tries ? `經歷 ${st.candidate.tries} 次政權更替都沒有勝出` : '期間沒有發生政權更替']);
    }
  };

  // ======================= 遠古時代 =======================
  // 遠古沒有國家：對象是地區；一期好幾年，所以期限用年份計算。
  Divine.ANCIENT_KINDS = {
    bounty: { name: '風調雨順', icon: '❀', short: '讓一個地區幾十年收成變好' },
    drought: { name: '降下長期乾旱', icon: '☀', short: '讓一個地區幾十年收成變差' },
    inspire: { name: '啟發一項發明', icon: '✦', short: '把一項技術的靈感送進一個地區' }
  };
  Divine.kinds = (w) => (w.era === 'ancient' ? Divine.ANCIENT_KINDS : Divine.KINDS);
  const reg = (w, id) => w.ancient.regions[id];
  Divine.ancientTechOptions = function (w, r) {
    const A = WS.Ancient, T = WS.Data.ancientTechs;
    if (!r) return [];
    return Object.values(T).filter((d) => !A.invented(r, d.id) && A.reqOk(w, r, d) && (!d.cond || d.cond(r, w))).map((d) => d.id)
      .sort((a, b) => T[a].cost - T[b].cost || (a < b ? -1 : 1));
  };
  Divine.ancientPreview = function (w, kind, rid, opt) {
    const D = Divine.ensure(w), p = PA(w), A = WS.Ancient;
    const r = reg(w, rid);
    const K = Divine.ANCIENT_KINDS[kind];
    if (!K) return { ok: false, reason: '沒有這種干預', checks: [] };
    const cost = p[kind + 'Cost'];
    const st = r ? Divine.of(r) : {};
    const checks = [[D.energy >= cost, `神力 ${Math.floor(D.energy)}／需要 ${cost}`], [!!r, '目標地區存在']];
    const info = [], risk = [];
    if (r && (kind === 'bounty' || kind === 'drought')) {
      checks.push([!(st.harvest && st.harvest.until > w.year), '這個地區沒有正在進行的天候干預']);
      info.push(kind === 'bounty' ? `收成最多增加約 ${(p.bountyGain * 130).toFixed(0)}%，持續 ${p.bountyYears} 年` : `收成最多減少約 ${(p.droughtSev * 130).toFixed(0)}%，持續 ${p.droughtYears} 年`);
      info.push('儲糧、饑荒、人口、遷徙、政體興衰的變化都由引擎計算');
      risk.push(`儲糧約 ${(r.stock / Math.max(1e-9, A.popOf(r)) * 12).toFixed(1)} 個月、交流程度 ${r.exchange.toFixed(0)}（鄰居能不能援助）會影響結果`);
      risk.push('實際強度有運氣成分（由世界種子決定）');
    }
    if (r && kind === 'inspire') {
      const list = Divine.ancientTechOptions(w, r);
      const t = opt || list[0];
      checks.push([!(st.inspire && st.inspire.until > w.year && !st.inspire.closed), '這個地區沒有正在進行的知識啟發']);
      checks.push([!!t && list.includes(t), t && WS.Data.ancientTechs[t] ? `「${WS.Data.ancientTechs[t].name}」的前置技術與地理條件都具備` : '有可以啟發的技術（前置技術已普及、地理條件允許）']);
      if (t && WS.Data.ancientTechs[t]) {
        const yrs = Math.ceil(1 / Math.max(1e-6, p.inspireShare * (0.5 + r.exchange / 100)));
        info.push(`啟發持續 ${p.inspireYears} 年，以目前交流程度約 ${yrs} 年可以完成（還要加上本地原本的研究）`);
        info.push('發明之後仍要時間普及，也會經交流傳給鄰近地區');
        risk.push(`吸收速度取決於交流程度（目前 ${r.exchange.toFixed(0)}）；期限內不一定來得及`);
        risk.push('實際速度有運氣成分（由世界種子決定）');
      }
    }
    const fail = checks.find((x) => !x[0]);
    return { ok: !fail, reason: fail ? fail[1] : null, cost, energy: D.energy, checks, info, risk, name: K.name };
  };
  Divine.ancientAct = function (w, ctx, kind, rid, opt) {
    const pv = Divine.ancientPreview(w, kind, rid, opt);
    if (!pv.ok) return { ok: false, reason: pv.reason };
    const D = Divine.ensure(w), p = PA(w), A = WS.Ancient;
    const r = reg(w, rid), st = Divine.of(r);
    D.energy -= pv.cost;
    D.counter = (D.counter || 0) + 1;
    const entry = { id: 'G' + D.counter, kind, cid: rid, name: r.name, y: w.year, m: 1, tick: w.tick, cost: pv.cost, done: false, status: '進行中' };
    const causes = [`玩家使用神之手（耗費神力 ${pv.cost}）`];
    const luck = 0.7 + ctx.rng.next() * 0.6;
    let title, effects;
    if (kind === 'bounty' || kind === 'drought') {
      const mult = kind === 'bounty' ? 1 + p.bountyGain * luck : 1 - p.droughtSev * luck;
      const years = kind === 'bounty' ? p.bountyYears : p.droughtYears;
      st.harvest = { kind, mult, start: w.year, until: w.year + years, logId: entry.id };
      title = kind === 'bounty' ? `神之手：${r.name}風調雨順` : `神之手：${r.name}降下長期乾旱`;
      causes.push(`強度：收成 ×${mult.toFixed(2)}（運氣 × ${luck.toFixed(2)}，世界種子決定）`);
      effects = [`收成 ×${mult.toFixed(2)}，持續到${A.yearLabel(w.year + years)}`, '糧食、人口與政體的變化由引擎計算'];
      entry.label = kind === 'bounty' ? `${r.name}風調雨順` : `${r.name}長期乾旱`;
      entry.pop0 = A.popOf(r);
    } else {
      const list = Divine.ancientTechOptions(w, r);
      const t = opt && list.includes(opt) ? opt : list[0];
      const d = WS.Data.ancientTechs[t];
      const rate = p.inspireShare * luck;
      st.inspire = { id: t, rate, start: w.year, until: w.year + p.inspireYears, gain: 0, logId: entry.id };
      title = `神之手：把「${d.name}」的靈感送進${r.name}`;
      causes.push(`交流程度 ${r.exchange.toFixed(0)} → 吸收倍率 ${(0.5 + r.exchange / 100).toFixed(2)}`, `運氣（世界種子）× ${luck.toFixed(2)}`);
      effects = [`每年增加約 ${(rate * 100 * (0.5 + r.exchange / 100)).toFixed(1)}% 的研究進度，持續 ${p.inspireYears} 年`, '發明後仍需時間普及'];
      entry.label = `啟發${r.name}「${d.name}」`;
      entry.tech = t;
    }
    const ev = WS.Events.log(w, ctx, { type: 'divine', divineKind: kind, title, countries: [rid], level: 3, causes, effects, trigger: '玩家的神之手指令' });
    entry.eventId = ev.id;
    for (const k of ['harvest', 'inspire']) if (st[k] && st[k].logId === entry.id) st[k].eventId = ev.id;
    D.log.push(entry);
    if (D.log.length > 200) D.log.shift();
    return { ok: true, effects, eventId: ev.id, entry };
  };
  // 引擎掛鉤
  Divine.ancientHarvest = function (r, w) {
    const h = r.divine && r.divine.harvest;
    return h && h.until > w.year ? h.mult : 1;
  };
  Divine.ancientChannel = function (r, w) {
    const t = r.divine && r.divine.inspire;
    return t && t.until > w.year && !t.closed ? t : null;
  };
  // 每期：恢復神力、結束到期的干預
  Divine.ancientStep = function (w, ctx) {
    const D = Divine.ensure(w), p = PA(w), A = WS.Ancient;
    D.energy = Math.min(p.energyMax, D.energy + p.energyRegenPerCentury * w.ancient.dt / 100);
    for (const id of A.ids(w)) {
      const r = reg(w, id), st = r.divine;
      if (!st) continue;
      const end = (key, title, effects) => {
        const o = st[key], entry = Divine.entry(w, o.logId);
        WS.Events.log(w, ctx, { type: 'divine', divineKind: key, title, countries: [id], level: 1, parent: o.eventId, causes: ['神之手干預期限到了'], effects });
        if (entry) { entry.done = true; entry.status = effects[0]; }
        delete st[key];
      };
      if (st.harvest && st.harvest.until <= w.year) {
        const entry = Divine.entry(w, st.harvest.logId);
        const d = entry && entry.pop0 ? (A.popOf(r) - entry.pop0) / entry.pop0 * 100 : 0;
        end('harvest', `${r.name}的${st.harvest.kind === 'bounty' ? '風調雨順' : '長期乾旱'}結束`, [`期間人口變化 ${d >= 0 ? '+' : ''}${d.toFixed(1)}%（含其他原因）`]);
      }
      if (st.inspire && (st.inspire.until <= w.year || st.inspire.closed)) {
        const def = WS.Data.ancientTechs[st.inspire.id];
        end('inspire', `${r.name}的「${def.name}」知識啟發結束`, [A.invented(r, st.inspire.id) ? `已發明「${def.name}」` : `期限內還沒發明（累計 ${Math.round(st.inspire.gain).toLocaleString()} 點），之後依一般研究繼續`]);
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
