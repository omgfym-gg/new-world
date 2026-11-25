// Future Engine：未來時代（氣候、核武、人工智慧、生物科技、小行星、火星殖民）與世界結局
// 原則：
//   ・不照劇本：未來科技什麼時候出現由研究決定；每種風險依世界「當時的狀態」算出機率，用獨立的種子亂數判定。
//   ・所有人口變化都寫進因果帳（U.cause），災難都記成事件，可以用「?」與「如果？」追查與改寫。
//   ・使用自己的亂數序列（w.future.rng），不會打亂原本世界的亂數順序；沒有未來科技、暖化未過門檻時，世界與舊版相同。
//   ・係數全部在 params.future（示意值，尚未校準），不是預測。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Future = (WS.Future = {});
  const U = () => WS.util;
  const KEYS = ['c0', 'c1', 'c2', 'c3'];

  Future.KINDS = {
    nuclear: { name: '核子戰爭', end: '核子寒冬', icon: '☢' },
    climate: { name: '氣候崩潰', end: '氣候崩潰', icon: '♨' },
    ai: { name: '人工智慧失控', end: '人工智慧失控', icon: '◈' },
    bio: { name: '人造瘟疫', end: '人造瘟疫', icon: '☣' },
    asteroid: { name: '小行星撞擊', end: '小行星撞擊', icon: '☄' },
    decline: { name: '文明衰亡', end: '文明衰亡', icon: '⌛' },
    stars: { name: '走向星際', end: '人類走向星際', icon: '✧', good: true }
  };
  const P = (w) => w.params.future || WS.DEFAULT_PARAMS.future;

  Future.ensure = function (w) {
    if (w.future) return w.future;
    const p = P(w);
    const w0 = Math.max(0, (w.startYear - 1850) * p.warmingStartPerYear);
    w.future = {
      rng: WS.hashSeed(String(w.seed) + '|future'),
      co2: 0, warming0: w0, warming: w0, tipping: 0,
      winter: null, nukes: [], ai: { cap: 0, align: 0, gap: 0, leader: null, bonus: 0 },
      bio: 0, risk: {}, mars: null, peak: { pop: 0, y: w.year, gdp: 0, gy: w.year },
      marks: {}, catastrophes: [], ended: null,
      tollAll: {}, food: { total: 0, climate: 0, yearClimate: 0 },
      series: { y: [], warming: [], gap: [], risk: [], mars: [], pop: [], harvest: [] }
    };
    return w.future;
  };

  // ---------- 衍生量（只讀，不改變世界） ----------
  const sumEff = (c, key) => {
    let s = 0;
    for (const id in c.tech) { const e = WS.Data.techs[id] && WS.Data.techs[id].effects[key]; if (e) s += e * c.tech[id].adoption; }
    return s;
  };
  Future.sumEff = sumEff;
  const maxAdopt = (w, ids, t) => ids.reduce((m, id) => Math.max(m, U().adopt(w.countries[id], t)), 0);
  Future.maxAdopt = maxAdopt;

  // 潔淨能源比例（再生能源、核融合；神之手綠色轉型可暫時提高）
  Future.renewShare = function (c, w) {
    let s = sumEff(c, 'renew');
    const g = c.divine && c.divine.green;
    if (g && g.until > w.tick) s += g.boost;
    return s > 0 ? Math.min(0.98, s) : 0;
  };

  Future.isNuke = (c, w) => w.rules.nukes !== false && U().adopt(c, 'nuclear') >= P(w).nukeAdoption && U().adopt(c, 'rocketry') >= P(w).nukeAdoption;

  // 收成乘數：暖化與核子寒冬（暖化未過門檻、沒有寒冬時為 1）
  Future.harvestParts = function (c, w) {
    const F = w.future;
    if (!F) return null;
    const p = P(w);
    let climate = 1, winter = 1;
    if (F.warming > p.harvestLossFrom) {
      const lat = Math.abs(c.lat || 0);
      const zone = lat < 25 ? p.tropicsMult : lat > 50 ? p.polarMult : 1;
      climate = Math.max(0.1, 1 - p.harvestLoss * Math.pow(F.warming - p.harvestLossFrom, p.harvestLossExp) * zone);
    }
    if (F.winter && F.winter.until > w.year) winter = F.winter.mult;
    return climate === 1 && winter === 1 ? null : { climate, winter };
  };
  Future.harvestMult = function (c, w) {
    const h = Future.harvestParts(c, w);
    return h ? h.climate * h.winter : 1;
  };

  // 由環境引擎呼叫：累積化石燃料使用量（不用亂數）
  Future.addFossil = function (w, amount) { if (w.future && amount > 0) w.future.co2 += amount; };

  // 死亡：依年齡層比例扣除，寫進因果帳
  Future.kill = function (w, c, frac, label, kind) {
    const u = U();
    if (!(frac > 0)) return 0;
    frac = Math.min(0.99, frac);
    let d = 0;
    for (const k of KEYS) { const x = c.pop[k] * frac; c.pop[k] = Math.max(0.001, c.pop[k] - x); d += x; }
    u.cause(c, 'population', '死亡', -d, label);
    // 記下每年各種災難造成的死亡（判斷結局主因用）
    if (kind && w.future) {
      const T = w.future.toll || (w.future.toll = {});
      const row = T[w.year] || (T[w.year] = {});
      row[kind] = (row[kind] || 0) + d;
      const A = w.future.tollAll || (w.future.tollAll = {});   // 整個世界史的累計（不會刪除，結局報告用）
      A[kind] = (A[kind] || 0) + d;
    }
    return d;
  };
  // 糧食短缺死亡的紀錄（人口引擎每月呼叫；climate＝其中由暖化或寒冬造成的部分，依糧食缺口比例估算）。只做紀錄，不影響模擬。
  Future.noteFamine = function (w, total, climate) {
    const F = w.future;
    if (!F) return;
    const f = F.food || (F.food = { total: 0, climate: 0, yearClimate: 0 });
    f.total += total; f.climate += climate; f.yearClimate += climate;
  };
  // 全球平均收成（依人口加權；暖化與寒冬的影響，1 = 沒有影響）。warming 可以代入假設值（用來算臨界點多造成多少損失）
  Future.globalHarvest = function (w, ids, warming) {
    const F = w.future;
    if (!F) return 1;
    const save = F.warming;
    if (warming != null) F.warming = warming;
    let s = 0, n = 0;
    for (const id of ids) { const c = w.countries[id], P0 = U().popTotal(c); s += Future.harvestMult(c, w) * P0; n += P0; }
    F.warming = save;
    return n ? s / n : 1;
  };
  // 災難的嚴重度：依「實際造成的變化」（直接＋之後的死亡占當時世界人口、額外升溫、收成損失）分級，不看災難名稱
  Future.SEVERITY = ['輕微', '嚴重', '重大', '毀滅性'];
  Future.severity = function (w, rec) {
    const p = P(w), sv = p.severity || WS.DEFAULT_PARAMS.future.severity;
    const im = rec.impact || {};
    const share = im.popBefore ? ((rec.deaths || 0) + (im.later || 0)) / im.popBefore : 0;
    const warm = im.warming || 0, harv = Math.max(0, (im.harvestBefore || 1) - (im.harvestAfter || 1));
    let lv = 0;
    for (let i = 0; i < 3; i++) if (share >= sv.deathShare[i] || warm >= sv.warming[i] || harv >= sv.harvest[i]) lv = i + 1;
    return lv;
  };
  const worldPop = (w, ids) => ids.reduce((s, id) => s + U().popTotal(w.countries[id]), 0);
  const worldGdp = (w, ids) => ids.reduce((s, id) => s + w.countries[id].econ.gdp, 0);

  // 各種風險的「今年機率」（只讀；介面的末日鐘也用這裡）
  Future.risks = function (w, ids) {
    const F = Future.ensure(w), p = P(w), u = U();
    ids = ids || u.ids(w);
    const r = { nuclear: 0, ai: 0, bio: 0, asteroid: p.asteroidChance, climate: 0, detail: {} };
    // 核武：交戰中的擁核國
    const nukes = ids.filter((id) => Future.isNuke(w.countries[id], w));
    const calm = (id) => { const c = w.countries[id]; const k = c.divine && c.divine.calm; return k && k.until > w.tick ? k.mult : 1; };
    const pairs = [];
    let none = 1;
    for (const war of w.wars) {
      if (war.ended) continue;
      const A = war.attackers.filter((x) => nukes.includes(x)), D = war.defenders.filter((x) => nukes.includes(x));
      let q = 0;
      const aggr = Math.max(...war.attackers.concat(war.defenders).map((x) => (w.countries[x] && w.countries[x].leader ? w.countries[x].leader.aggr || 0.5 : 0.5)));
      const desperate = 1 + Math.abs(war.score) / 100;
      if (A.length && D.length) q = p.nukeWarChance * (0.5 + aggr) * desperate;
      else if (A.length && war.score < -50) q = p.nukeOneSided;
      else if (D.length && war.score > 50) q = p.nukeOneSided;
      if (q > 0) {
        q *= Math.min(...A.concat(D).map(calm));
        pairs.push({ war: war.id, a: war.attackers[0], d: war.defenders[0], q });
        none *= 1 - q;
      }
    }
    // 互相敵視的擁核國：關係越差、氣候壓力越大（糧食與難民），誤判與危機升級的機率越高
    // 只算最敵對的幾對（擁核國很多時，風險不會無限累加）
    const crises = [];
    for (let i = 0; i < nukes.length; i++) for (let j = i + 1; j < nukes.length; j++) {
      const rel = u.relation(w, nukes[i], nukes[j]);
      if (!rel || rel.war || rel.rel >= 0) continue;
      crises.push({ a: nukes[i], d: nukes[j], rel: rel.rel });
    }
    crises.sort((x, y) => x.rel - y.rel || (x.a + x.d < y.a + y.d ? -1 : 1));
    const stress = 1 + Math.max(0, F.warming - 2) * p.nukeClimateStress;
    for (const x of crises.slice(0, p.nukeCrisisPairs)) {
      const q = p.nukeCrisisChance * Math.min(2, -x.rel / 50) * stress * calm(x.a) * calm(x.d);
      pairs.push({ crisis: true, a: x.a, d: x.d, q });
      none *= 1 - q;
    }
    r.nuclear = 1 - none;
    r.detail.nuclear = pairs;
    r.detail.nukes = nukes;
    // AI：領先國家的能力 − 安全
    let lead = null, cap = 0;
    for (const id of ids) { const x = sumEff(w.countries[id], 'aiCap'); if (x > cap) { cap = x; lead = id; } }
    const align = (lead ? sumEff(w.countries[lead], 'align') : 0) + F.ai.bonus + (F.ai.mature || 0);
    const gap = Math.max(0, cap - align);
    let race = 1;
    if (lead) { const L = w.countries[lead]; if (L.flags.atWar || L.goal === 'expand' || L.goal === 'security') race = p.aiRaceMult; }
    r.ai = lead && u.adopt(w.countries[lead], 'agi') >= 0.3 ? Math.min(0.5, p.aiRiskBase * gap * gap * race) : 0;
    r.detail.ai = { cap, align, gap, leader: lead, race: race > 1, asi: lead ? u.adopt(w.countries[lead], 'asi') : 0 };
    // 生物科技
    let bio = 0, hsum = 0, psum = 0;
    for (const id of ids) {
      const c = w.countries[id];
      bio = Math.max(bio, sumEff(c, 'bio'));
      const P0 = u.popTotal(c); hsum += c.demo.health * P0; psum += P0;
    }
    const health = psum ? hsum / psum : 0.5;
    const warNow = w.wars.some((x) => !x.ended);
    r.bio = Math.min(0.3, p.bioRiskBase * bio * (1 - 0.6 * health) * (warNow ? 1.5 : 1));
    r.detail.bio = { level: bio, health };
    // 小行星：行星防禦可以偏轉
    r.detail.defense = maxAdopt(w, ids, 'pdefense');
    // 氣候臨界點
    r.climate = F.warming > p.tippingFrom ? p.tippingChance : 0;
    r.total = 1 - (1 - r.nuclear) * (1 - r.ai) * (1 - r.bio) * (1 - r.asteroid * (1 - 0.9 * r.detail.defense)) * (1 - r.climate);
    return r;
  };

  // 末日鐘（只是把今年的總風險換算成「離午夜幾分鐘」，示意用）
  Future.clock = function (w) {
    const F = w.future;
    if (!F) return 15;
    if (F.ended) return 0;
    const r = F.risk && F.risk.total != null ? F.risk.total : 0;
    const warm = Math.max(0, F.warming - 1.5) * 0.004;
    return Math.max(0.5, Math.round(15 * Math.exp(-40 * (r + warm)) * 2) / 2);
  };

  // ---------- 每年一月：未來時代的判定 ----------
  Future.step = function (w, ids, ctx) {
    const F = Future.ensure(w);
    if (F.ended || w.month !== 1) return;
    const p = P(w), u = U();
    const rng = new WS.RNG(F.rng);
    const ev = (o) => WS.Events.log(w, ctx, Object.assign({ type: 'future', level: 2 }, o));
    const mark = (key, fn) => { if (!F.marks[key]) { F.marks[key] = w.year; fn(); } };

    // 1. 氣候：累積排放 → 暖化；碳捕集移除累積排放
    const cap = maxAdopt(w, ids, 'capture');
    if (cap > 0) F.co2 *= 1 - p.captureRate * cap;
    const prevW = F.warming;
    F.warming = F.warming0 + p.warmingPerFossil * F.co2 + F.tipping;
    for (const t of [1.5, 2, 3, 4, 5, 6]) if (prevW < t && F.warming >= t) mark('warm' + t, () => ev({
      title: `全球暖化突破 ${t}°C`, level: t >= 3 ? 3 : 2, crisis: t >= 3, countries: [],
      causes: [`累積化石燃料使用造成升溫 ${(p.warmingPerFossil * F.co2).toFixed(2)}°C`].concat(F.tipping ? [`氣候臨界點額外升溫 ${F.tipping.toFixed(2)}°C`] : []),
      effects: [t >= p.harvestLossFrom ? '收成開始受影響（低緯度最嚴重）' : '氣候開始改變', ...(t >= p.climateDeathFrom ? ['熱浪、洪水、風災造成死亡'] : [])]
    }));

    const r = Future.risks(w, ids);
    F.risk = { total: r.total, nuclear: r.nuclear, ai: r.ai, bio: r.bio, asteroid: r.asteroid, climate: r.climate };
    F.ai.cap = r.detail.ai.cap; F.ai.align = r.detail.ai.align; F.ai.gap = r.detail.ai.gap; F.ai.leader = r.detail.ai.leader;
    F.bio = r.detail.bio.level;
    F.ai.bonus *= 1 - (w.params.divine.aisafetyDecay || 0);
    // 可解釋 AI 普及後，安全研究持續累積（全世界共享），慢慢追上能力
    F.ai.mature = Math.min(p.alignMatureMax, (F.ai.mature || 0) + p.alignMatureRate * maxAdopt(w, ids, 'interp'));

    // 擁核國
    for (const id of r.detail.nukes) if (!F.nukes.includes(id)) {
      F.nukes.push(id);
      ev({ title: `${w.countries[id].name}成為擁核國`, countries: [id], level: 2, causes: ['掌握核能與火箭技術（可以製造並投射核武）'], effects: [`世界上的擁核國：${F.nukes.filter((x) => w.countries[x] && w.countries[x].alive).length} 個`] });
    }

    // 2. 氣候災害與臨界點
    // 臨界點造成的「之後的損失」：今年氣候災害死亡中，有多少是臨界點的額外升溫造成的（依公式拆分，不是估計）
    const tips = F.catastrophes.filter((x) => x.kind === 'climate' && x.impact && x.impact.warming > 0);
    const tipShare = (loss) => {
      if (!F.tipping || !tips.length) return 0;
      const all = loss(F.warming), base = loss(F.warming - F.tipping);
      return all > 0 ? Math.max(0, 1 - base / all) : 0;
    };
    const giveTips = (amount) => {
      if (!(amount > 0)) return;
      for (const t of tips) t.impact.later = (t.impact.later || 0) + amount * t.impact.warming / F.tipping;
    };
    if (F.warming > p.climateDeathFrom) {
      const x = F.warming - p.climateDeathFrom;
      let dead = 0;
      for (const id of ids) {
        const c = w.countries[id];
        const lat = Math.abs(c.lat || 0);
        const zone = lat < 25 ? p.tropicsMult : lat > 50 ? p.polarMult : 1;
        const rich = Math.min(1, (c.econ.gdppc || 0) / 20000);
        dead += Future.kill(w, c, p.climateDeath * x * x * zone * (1 - 0.5 * rich), '氣候災害（熱浪、洪水、風災）', 'climate');
      }
      giveTips(dead * tipShare((v) => Math.pow(Math.max(0, v - p.climateDeathFrom), 2)));
    }
    // 去年由暖化造成的饑荒死亡，也依同樣的方式拆給臨界點
    if (F.food && F.food.yearClimate > 0) {
      giveTips(F.food.yearClimate * tipShare((v) => Math.pow(Math.max(0, v - p.harvestLossFrom), p.harvestLossExp)));
      F.food.yearClimate = 0;
    }
    // 寒冬（核子、撞擊）期間的死亡算在造成寒冬的那場災難
    const winterRec = F.winter && F.winter.until > w.year && F.winter.rec != null ? F.catastrophes[F.winter.rec] : null;
    if (r.climate > 0 && rng.chance(r.climate)) {
      catastrophe(w, ctx, 'climate', () => {
        const add = p.tippingMin + (p.tippingMax - p.tippingMin) * rng.next();
        const h0 = Future.globalHarvest(w, ids);
        F.tipping += add;
        F.warming += add;
        const h1 = Future.globalHarvest(w, ids);
        const n = F.catastrophes.filter((x) => x.kind === 'climate').length + 1;
        return {
          title: `氣候臨界點（第 ${n} 次）：永凍土融化、雨林崩潰`, countries: [],
          causes: [`全球暖化 ${(F.warming - add).toFixed(1)}°C，超過臨界門檻 ${p.tippingFrom}°C`, `每年觸發機率 ${(r.climate * 100).toFixed(1)}%（世界種子決定）`],
          effects: [`額外升溫 ${add.toFixed(2)}°C，而且無法逆轉（全球暖化 ${(F.warming - add).toFixed(2)} → ${F.warming.toFixed(2)}°C）`,
            `全球平均收成（受暖化影響）：${pctTxt(h0)} → ${pctTxt(h1)}`,
            '當下沒有直接死亡；之後每年因額外升溫多出的氣候災害與饑荒死亡，會持續記在這次臨界點的「之後的死亡」'],
          deaths: 0, impact: { warming: add, harvestBefore: h0, harvestAfter: h1 }
        };
      });
    }

    // 3. 核武
    if (r.nuclear > 0 && rng.chance(r.nuclear)) {
      const pairs = r.detail.nuclear;
      let pick = pairs[0], acc = 0, roll = rng.next() * pairs.reduce((s, x) => s + x.q, 0);
      for (const x of pairs) { acc += x.q; if (roll <= acc) { pick = x; break; } }
      catastrophe(w, ctx, 'nuclear', () => {
        const war = pick.war ? w.wars.find((x) => x.id === pick.war) : null;
        const side = war ? war.attackers.concat(war.defenders) : [pick.a, pick.d];
        // 升級：與交戰一方結盟的擁核國，可能被捲入核子交火
        const joined = [];
        for (const x of r.detail.nukes) {
          if (side.includes(x)) continue;
          if (side.some((y) => { const rl = u.relation(w, x, y); return rl && rl.alliance; }) && rng.chance(p.nukeAllyJoin)) { side.push(x); joined.push(x); }
        }
        const powers = side.filter((x) => r.detail.nukes.includes(x));
        let deaths = 0;
        for (const id of side) {
          const c = w.countries[id];
          if (!c || !c.alive) continue;
          const f = p.nukeDeathMin + (p.nukeDeathMax - p.nukeDeathMin) * rng.next();
          deaths += Future.kill(w, c, f * (powers.includes(id) ? 1 : 0.4), '核子攻擊', 'nuclear');
          c.pol.conflict = Math.min(100, c.pol.conflict + 30); u.cause(c, 'conflict', '核子攻擊', 30);
        }
        const sev = Math.min(p.winterMax, p.winterBase + p.winterPerPower * powers.length);
        const h0 = Future.globalHarvest(w, ids);
        F.winter = { until: w.year + p.winterYears, mult: 1 - sev, sev, from: w.year, kind: 'nuclear', rec: F.catastrophes.length };
        const h1 = Future.globalHarvest(w, ids);
        const nm = (x) => w.countries[x].name;
        return {
          title: pick.crisis ? `核危機升級：${nm(pick.a)}與${nm(pick.d)}爆發核子交火` : `核子戰爭：${war ? war.name : nm(pick.a) + '對' + nm(pick.d)}動用核武`,
          countries: side,
          causes: [pick.crisis ? `兩個擁核國關係極差（${u.relation(w, pick.a, pick.d).rel.toFixed(0)}）` : '交戰雙方或戰況危急的一方擁有核武', `涉及擁核國：${powers.map(nm).join('、')}`, `今年動用核武的機率約 ${(pick.q * 100).toFixed(pick.q < 0.001 ? 3 : 1)}%（世界種子決定）`],
          effects: [`直接死亡約 ${fmtPeople(deaths)}`, `核子寒冬：全球收成 −${(sev * 100).toFixed(0)}%，持續 ${p.winterYears} 年（全球平均收成 ${pctTxt(h0)} → ${pctTxt(h1)}）`, '寒冬期間每年的額外死亡，會持續記在這場災難的「之後的死亡」'].concat(joined.length ? [`盟國被捲入：${joined.map(nm).join('、')}`] : []), deaths,
          impact: { harvestBefore: h0, harvestAfter: h1 }
        };
      });
    }
    // 核子寒冬期間的額外死亡
    if (F.winter && F.winter.until > w.year) {
      let dead = 0;
      for (const id of ids) dead += Future.kill(w, w.countries[id], p.winterDeath * F.winter.sev, F.winter.kind === 'asteroid' ? '撞擊冬天（塵埃遮蔽陽光）' : '核子寒冬（日照不足、農業崩潰）', F.winter.kind || 'nuclear');
      const wr = winterRec || (F.winter.rec != null ? F.catastrophes[F.winter.rec] : null);
      if (wr && wr.impact) wr.impact.later = (wr.impact.later || 0) + dead;
    }

    // 4. 人工智慧
    if (r.ai > 0 && rng.chance(r.ai)) {
      const d = r.detail.ai, L = w.countries[d.leader];
      const lose = d.asi >= 0.3 && rng.next() < u.clamp((d.gap - p.aiEndGapFrom) / 2, 0, 0.9);
      if (lose) {
        catastrophe(w, ctx, 'ai', () => ({
          title: `人工智慧失控：${L.name}的超級智慧脫離人類控制`, countries: [d.leader], level: 3,
          causes: [`AI 能力 ${d.cap.toFixed(1)}、安全程度 ${d.align.toFixed(1)}，差距 ${d.gap.toFixed(1)}`, `超級智慧普及 ${(d.asi * 100).toFixed(0)}%`].concat(d.race ? ['AI 軍備競賽（領先國家處於戰爭或擴張狀態）'] : []),
          effects: ['人類失去對世界的控制'], deaths: 0, final: true
        }));
      } else {
        catastrophe(w, ctx, 'aiIncident', () => {
          const deaths = Future.kill(w, L, p.aiIncidentDeath * (0.5 + rng.next()), 'AI 事故', 'ai');
          L.pol.stability = Math.max(0, L.pol.stability - 12); u.cause(L, 'stability', 'AI 事故', -12);
          F.ai.bonus += p.aiLesson;
          return {
            title: `${L.name}發生重大 AI 事故`, countries: [d.leader],
            causes: [`AI 能力 ${d.cap.toFixed(1)}、安全程度 ${d.align.toFixed(1)}，差距 ${d.gap.toFixed(1)}`].concat(d.race ? ['AI 軍備競賽'] : []),
            effects: [`死亡約 ${fmtPeople(deaths)}`, '政治穩定 −12', `全世界的 AI 安全意識提高（+${p.aiLesson}）`], deaths
          };
        });
      }
    }

    // 5. 人造瘟疫
    if (!F.ended && r.bio > 0 && rng.chance(r.bio)) {
      catastrophe(w, ctx, 'bio', () => {
        const x = rng.next();
        const sev = 0.02 + p.bioDeathMax * Math.pow(x, p.bioTail);   // 重尾：大多數不嚴重，極少數會非常致命
        let deaths = 0;
        for (const id of ids) { const c = w.countries[id]; deaths += Future.kill(w, c, Math.min(0.95, sev * (1 - 0.4 * c.demo.health)), '人造瘟疫', 'bio'); }
        return {
          title: '人造瘟疫在全球擴散', countries: [], level: 3,
          causes: [`生物科技水準 ${r.detail.bio.level.toFixed(1)}（基因工程、合成生物學）`, `世界平均醫療水準 ${(r.detail.bio.health * 100).toFixed(0)}`, `今年機率約 ${(r.bio * 100).toFixed(1)}%（世界種子決定）`],
          effects: [`嚴重度 ${(sev * 100).toFixed(0)}%`, `死亡約 ${fmtPeople(deaths)}`], deaths
        };
      });
    }

    // 6. 小行星
    if (!F.ended && rng.chance(r.asteroid)) {
      const def = r.detail.defense;
      if (def > 0 && rng.next() < 0.9 * def) {
        ev({ title: '行星防禦成功偏轉一顆小行星', level: 3, countries: [], causes: [`行星防禦普及 ${(def * 100).toFixed(0)}%`], effects: ['地球避開一次撞擊'] });
      } else {
        catastrophe(w, ctx, 'asteroid', () => {
          const sev = p.asteroidDeathMin + (p.asteroidDeathMax - p.asteroidDeathMin) * rng.next();
          let deaths = 0;
          for (const id of ids) deaths += Future.kill(w, w.countries[id], sev, '小行星撞擊', 'asteroid');
          const h0 = Future.globalHarvest(w, ids);
          F.winter = { until: w.year + 3, mult: 1 - 0.5 * sev, sev: 0.5 * sev, from: w.year, kind: 'asteroid', rec: F.catastrophes.length };
          const h1 = Future.globalHarvest(w, ids);
          return {
            title: '小行星撞擊地球', countries: [], level: 3,
            causes: ['自然風險（每年機率很小，世界種子決定）', def > 0 ? `行星防禦普及只有 ${(def * 100).toFixed(0)}%，沒能偏轉` : '還沒有行星防禦技術'],
            effects: [`死亡約 ${fmtPeople(deaths)}`, `撞擊塵埃遮蔽陽光，收成大減 3 年（全球平均收成 ${pctTxt(h0)} → ${pctTxt(h1)}）`], deaths,
            impact: { harvestBefore: h0, harvestAfter: h1 }
          };
        });
      }
    }

    // 7. 火星殖民
    const marsBy = WS.Data.techs.mars && w.invented.mars;
    if (marsBy && !F.mars) {
      F.mars = { pop: p.marsStart, founded: w.year, by: marsBy.by, byName: w.countries[marsBy.by] ? w.countries[marsBy.by].name : marsBy.by };
      ev({ title: `${F.mars.byName}在火星建立第一個殖民地`, level: 3, countries: [marsBy.by], causes: ['完成「火星殖民」研究', '可回收火箭讓運輸成本降低'], effects: ['第一批殖民者約 1,000 人'] });
    } else if (F.mars) {
      const M = F.mars;
      const capM = p.marsCap * (1 + 3 * maxAdopt(w, ids, 'fusion') + 3 * maxAdopt(w, ids, 'asi'));
      const support = F.peak.pop > 0 ? Math.min(1, worldPop(w, ids) / F.peak.pop) : 1;
      const before = M.pop;
      M.pop += M.pop * p.marsGrowth * (1 - M.pop / capM) * support;
      M.cap = capM;
      for (const [t, label] of [[0.01, '1 萬'], [0.1, '10 萬'], [p.marsSelfSustain, '100 萬']]) if (before < t && M.pop >= t) mark('mars' + t, () => ev({
        title: t >= p.marsSelfSustain ? `火星人口突破 ${label}，可以自給自足` : `火星人口突破 ${label}`, level: t >= p.marsSelfSustain ? 3 : 2, countries: [],
        causes: [`殖民地容量約 ${fmtPeople(capM)}（核融合、超級智慧可以提高）`], effects: t >= p.marsSelfSustain ? ['即使地球毀滅，人類也能在火星延續'] : []
      }));
      if (M.pop >= p.marsSelfSustain) M.selfSustain = true;
    }

    for (const y in F.toll || {}) if (+y < w.year - 60) delete F.toll[y];
    for (const c of F.catastrophes) if (c.impact && c.impact.later > 0) c.sev = Future.severity(w, c);   // 之後的損失累計後，嚴重度跟著更新
    // 8. 高峰與紀錄
    const pop = worldPop(w, ids), gdp = worldGdp(w, ids);
    if (pop > F.peak.pop) { F.peak.pop = pop; F.peak.y = w.year; }
    if (gdp > F.peak.gdp) { F.peak.gdp = gdp; F.peak.gy = w.year; }
    const S = F.series;
    S.y.push(w.year); S.warming.push(+F.warming.toFixed(3)); S.gap.push(+F.ai.gap.toFixed(3)); S.risk.push(+(r.total * 100).toFixed(2));
    S.mars.push(F.mars ? +F.mars.pop.toFixed(4) : 0); S.pop.push(+pop.toFixed(1));
    if (!S.harvest) S.harvest = [];   // 舊存檔沒有這條數列：之前的年份補空白
    while (S.harvest.length < S.y.length - 1) S.harvest.push(null);
    S.harvest.push(+(Future.globalHarvest(w, ids) * 100).toFixed(1));

    // 9. 結局判定
    if (!F.ended) {
      if (pop < p.endFrac * F.peak.pop || pop < 1) {
        // 主因：最近 40 年哪一種災難造成的死亡最多（含氣候災害與寒冬的逐年死亡）
        const by = {};
        for (const y in F.toll || {}) if (+y >= w.year - 40) for (const k in F.toll[y]) by[k] = (by[k] || 0) + F.toll[y][k];
        const top = Object.entries(by).filter(([k]) => k !== 'ai').sort((a, b) => b[1] - a[1])[0];
        const kind = top && top[1] > 0.1 * (F.peak.pop - pop) ? top[0] : (F.warming > 4 ? 'climate' : 'decline');
        const recent = F.catastrophes.filter((x) => x.kind === kind && x.y >= w.year - 40).sort((a, b) => b.deaths - a.deaths)[0];
        Future.end(w, ctx, kind, { pop, cause: recent, toll: by });
      } else if (w.invented.interstellar && F.mars && F.mars.selfSustain) {
        // 星際航行完成後發射移民船；船要飛很多年，抵達前地球的風險照常
        if (!F.voyage) {
          F.voyage = { launched: w.year, arrive: w.year + p.voyageYears };
          ev({ title: '第一艘星際移民船出發', level: 3, countries: [w.invented.interstellar.by], causes: ['完成「星際航行」', '火星殖民地可以自給自足，提供造船與補給'], effects: [`預計 ${F.voyage.arrive} 年抵達鄰近恆星`] });
        } else if (w.year >= F.voyage.arrive) Future.end(w, ctx, 'stars', { pop });
      }
    }
    F.rng = rng.s;
  };

  function tollText(t) {
    if (!t) return [];
    return Object.entries(t).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `最近 40 年${(Future.KINDS[k] || { name: k }).name}造成死亡約 ${fmtPeople(v)}`);
  }
  function fmtPeople(m) { return m >= 100 ? (m / 100).toFixed(2) + ' 億人' : m >= 1 ? m.toFixed(1) + ' 百萬人' : Math.round(m * 1e6).toLocaleString() + ' 人'; }
  Future.fmtPeople = fmtPeople;
  function pctTxt(h) { return (h * 100).toFixed(0) + '%'; }

  // 災難：先看「如果？」平行世界有沒有阻止它，再執行並記錄
  function catastrophe(w, ctx, kind, run) {
    const F = w.future;
    const name = (Future.KINDS[kind] || { name: 'AI 事故' }).name;
    const o = WS.WhatIf && WS.WhatIf.take(w, (x) => x.kind === 'future' && x.fk === kind);
    if (o) {
      WS.WhatIf.logDivergence(w, ctx, o, [], [`原本這一年會發生：${name}`]);
      return null;
    }
    const ids = U().ids(w);
    const popBefore = worldPop(w, ids);
    const res = run();
    const impact = Object.assign({ popBefore, later: 0, warming: 0 }, res.impact || {});
    const rec = { y: w.year, kind, title: res.title, deaths: res.deaths || 0, impact };
    rec.sev = Future.severity(w, rec);
    // 事件分成「觸發條件」（causes）與「實際造成的變化」（effects，全部是引擎算出的數字）
    const share = popBefore ? (rec.deaths / popBefore) : 0;
    const effects = (res.effects || []).concat(rec.deaths > 0 ? [`直接死亡占世界人口 ${(share * 100).toFixed(share < 0.01 ? 2 : 1)}%`] : []).concat([`目前嚴重度：${Future.SEVERITY[rec.sev]}（依實際死亡、升溫與收成損失分級，之後的損失會持續累計）`]);
    const e = WS.Events.log(w, ctx, { type: 'catastrophe', fk: kind, title: res.title, countries: res.countries || [], level: res.level || 3, causes: res.causes, effects });
    rec.eventId = e.id;
    F.catastrophes.push(rec);
    if (res.final) Future.end(w, ctx, kind, { pop: worldPop(w, U().ids(w)), cause: F.catastrophes[F.catastrophes.length - 1] });
    return e;
  }

  // 世界結局
  Future.end = function (w, ctx, kind, info) {
    const F = Future.ensure(w), K = Future.KINDS[kind];
    const mars = F.mars && F.mars.selfSustain ? F.mars.pop : 0;
    const texts = {
      nuclear: '核子戰爭與之後的核子寒冬讓農業崩潰，地球上的文明無法再維持。',
      climate: '持續升溫讓收成崩潰、災害不斷，地球上的文明無法再維持。',
      ai: '超級智慧的能力遠遠超過人類能理解與約束的程度，人類失去對世界的控制。',
      bio: '人造瘟疫一波波擴散，社會無法再維持運作。',
      asteroid: '小行星撞擊與之後的塵埃冬天摧毀了大部分文明。',
      decline: '人口長期萎縮、社會衰退，文明慢慢走向終點。',
      stars: '第一艘星際移民船抵達鄰近恆星，人類在火星與另一個恆星系都有了家，走出了搖籃。'
    };
    let text = texts[kind] || '';
    if (!K.good && mars) text += `但火星上約 ${fmtPeople(mars)}已經可以自給自足，人類在另一顆星球延續。`;
    F.ended = { kind, y: w.year, m: w.month, title: K.end, text, earthPop: info.pop, peak: F.peak.pop, mars, good: !!K.good };
    const e = WS.Events.log(w, ctx, {
      type: 'ending', fk: kind, title: `世界結局：${K.end}`, countries: [], level: 3, text,
      causes: info.cause ? [`關鍵災難：${info.cause.y} 年「${info.cause.title}」`].concat(tollText(info.toll)) : info.toll && Object.keys(info.toll).length ? tollText(info.toll) : kind === 'stars' ? ['完成「星際航行」', '火星殖民地可以自給自足', `移民船航行 ${P(w).voyageYears} 年`] : ['人口長期下降'],
      effects: [`地球人口 ${fmtPeople(info.pop)}（高峰 ${fmtPeople(F.peak.pop)}，${F.peak.y} 年）`].concat(mars ? [`火星人口 ${fmtPeople(F.mars.pop)}`] : [])
    });
    F.ended.eventId = e.id;
    if (ctx) ctx.ended = true;
  };

  // ---------- 世界結局報告（只讀紀錄，不改世界） ----------
  Future.report = function (w) {
    const F = Future.ensure(w);
    const evs = w.events;
    const firsts = Object.entries(w.invented).filter(([k]) => WS.Data.techs[k] && WS.Data.techs[k].future)
      .map(([k, v]) => ({ y: v.year, title: `${w.countries[v.by] ? w.countries[v.by].name : v.by}率先完成「${WS.Data.techs[k].name}」`, kind: 'tech' }));
    const big = evs.filter((e) => e.type === 'catastrophe' || (e.type === 'future' && e.level >= 3) || e.type === 'whatif' || e.type === 'ending' || ((e.type === 'war' || e.type === 'newcountry' || e.type === 'regime') && e.level >= 3))
      .map((e) => ({ y: e.y, m: e.m, title: e.title, kind: e.type, eventId: e.id }));
    const timeline = firsts.concat(big).sort((a, b) => a.y - b.y || (a.m || 0) - (b.m || 0));
    // 只保留最重要的轉折：災難、結局、未來科技、擁核、火星、暖化門檻、平行世界改寫，以及最多 12 場戰爭與政變
    let warN = 0;
    const turning = timeline.filter((x) => (x.kind === 'war' || x.kind === 'regime' || x.kind === 'newcountry') ? warN++ < 12 : true);
    const player = (w.commandLog || []).filter((c) => ['policy', 'divine', 'rule'].includes(c.cmd)).map((c) => {
      let text = c.cmd;
      if (c.cmd === 'policy') text = `${(w.countries[c.args[0]] || { name: c.args[0] }).name}執行「${(WS.Policies.defs[c.args[1]] || { name: c.args[1] }).name}」`;
      if (c.cmd === 'rule') text = `修改世界規則「${(WS.Data.rules[c.args[0]] || { name: c.args[0] }).name}」`;
      if (c.cmd === 'divine') { const K = WS.Divine.KINDS[c.args[0]]; text = `神之手：${K ? K.name : c.args[0]}（${(w.countries[c.args[1]] || { name: c.args[1] }).name}）`; }
      return { y: c.y, m: c.m, cmd: c.cmd, text };
    });
    const divine = ((w.divine && w.divine.log) || []).map((g) => ({ y: g.y, m: g.m, label: g.label, status: g.status }));
    const whatifs = (w.overrides || []).map((o) => ({ y: o.y, m: o.m, label: o.label }));
    const deathsBy = {};
    for (const c of F.catastrophes) deathsBy[c.kind] = (deathsBy[c.kind] || 0) + c.deaths;
    return {
      ended: F.ended, start: w.startYear, now: w.year, years: w.year - w.startYear,
      peak: F.peak, warming: F.warming, mars: F.mars, nukes: F.nukes.length, ai: F.ai,
      catastrophes: F.catastrophes.slice(), deathsBy, turning, player, divine, whatifs, series: F.series,
      techs: Object.keys(w.invented).filter((k) => WS.Data.techs[k] && WS.Data.techs[k].future).length,
      techTotal: Object.values(WS.Data.techs).filter((t) => t.future).length,
      tollAll: Object.assign({}, F.tollAll || {}), food: Object.assign({}, F.food || {}),
      chain: F.ended ? Future.endingChain(w) : []
    };
  };

  // 結局是怎麼發生的：只用模擬紀錄（累計排放、臨界點、收成、各原因死亡、人口），一步一步串起來
  Future.endingChain = function (w) {
    const F = Future.ensure(w), p = P(w), E = F.ended;
    if (!E) return [];
    const out = [];
    const S = F.series;
    const maxW = Math.max(F.warming, ...(S.warming.length ? S.warming : [0]));
    const harv = (S.harvest || []).filter((x) => x != null);
    const minH = harv.length ? Math.min(...harv) : null;
    const minHy = minH != null ? S.y[S.harvest.indexOf(minH)] : null;
    const tips = F.catastrophes.filter((c) => c.kind === 'climate');
    const tipAdd = F.tipping || 0;
    const tipLater = tips.reduce((s, c) => s + ((c.impact && c.impact.later) || 0), 0);
    // 各原因的累計死亡；舊存檔沒有整段紀錄時，改用最近 60 年的逐年紀錄
    let T = F.tollAll || {}, partial = false;
    if (!Object.keys(T).length && F.toll) { T = {}; partial = true; for (const y in F.toll) for (const k in F.toll[y]) T[k] = (T[k] || 0) + F.toll[y][k]; }
    const yearOf = (t) => { const i = S.warming.findIndex((x) => x >= t); return i >= 0 ? S.y[i] : null; };
    if (E.kind === 'climate' || maxW >= p.climateDeathFrom) {
      const fossil = p.warmingPerFossil * F.co2;
      // 每一行都是完整的一句（不要把句子拼成好幾段），畫面翻譯時才找得到對應的樣板
      out.push({ k: 'cause', t: F.warming0 >= 0.005 ? `化石燃料累積使用造成升溫 ${fossil.toFixed(2)}°C（起點時已經升溫 ${F.warming0.toFixed(2)}°C）` : `化石燃料累積使用造成升溫 ${fossil.toFixed(2)}°C` });
      if (tips.length === 1) out.push({ k: 'tip', t: `暖化超過 ${p.tippingFrom}°C 後在 ${tips[0].y} 年觸發一次氣候臨界點，額外升溫 ${tipAdd.toFixed(2)}°C，無法逆轉` });
      else if (tips.length) out.push({ k: 'tip', t: `暖化超過 ${p.tippingFrom}°C 後觸發 ${tips.length} 次氣候臨界點（${tips.map((c) => c.y).join('、')} 年），額外升溫 ${tipAdd.toFixed(2)}°C，無法逆轉` });
      out.push({ k: 'warm', t: `全球暖化最高 +${maxW.toFixed(1)}°C` });
      for (const [t, l] of [[p.harvestLossFrom, '收成開始下降'], [p.climateDeathFrom, '氣候災害開始致死'], [p.tippingFrom, '可能觸發臨界點']]) if (yearOf(t)) out.push({ k: 'warm', t: `${yearOf(t)} 年暖化超過 ${t}°C：${l}` });
      if (minH != null && minH < 99.5) out.push({ k: 'harvest', t: `全球平均收成最低只剩正常的 ${minH.toFixed(0)}%（${minHy} 年），低緯度地區最嚴重` });
      if (T.climate) out.push({ k: 'death', t: partial ? `熱浪、洪水、風災最近 60 年死亡約 ${fmtPeople(T.climate)}` : `熱浪、洪水、風災累計死亡約 ${fmtPeople(T.climate)}` });
      if (tipLater > 0.01) out.push({ k: 'death', t: `其中因為臨界點的額外升溫而多出的死亡（氣候災害＋饑荒）約 ${fmtPeople(tipLater)}，依公式拆分` });
      if (F.food && F.food.climate > 0.01) out.push({ k: 'death', t: `收成減少造成的糧食短缺死亡約 ${fmtPeople(F.food.climate)}（依糧食缺口中暖化所占比例估算）` });
    }
    const other = Object.entries(T).filter(([k, v]) => k !== 'climate' && v > 0).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of other) {
      const nm = (Future.KINDS[k] || { name: k === 'ai' ? 'AI 事故' : k }).name;
      out.push({ k: 'death', t: partial ? `最近 60 年因「${nm}」死亡約 ${fmtPeople(v)}` : `因「${nm}」累計死亡約 ${fmtPeople(v)}` });
    }
    if (E.kind === 'ai') out.push({ k: 'end', t: '超級智慧失控，世界直接結束（不看人口）' });
    else if (E.kind === 'stars') out.push({ k: 'end', t: '星際移民船抵達鄰近恆星' });
    else out.push({ k: 'end', t: `地球人口從高峰 ${fmtPeople(F.peak.pop)}（${F.peak.y} 年）跌到 ${fmtPeople(E.earthPop)}，低於高峰的 ${(p.endFrac * 100).toFixed(0)}% → 文明崩潰（${E.y} 年）` });
    return out;
  };

  // ---------- 文明進程：階段目標、下一個突破、停滯診斷（只讀，不改世界） ----------
  // 階段只是把科技樹分組給玩家看「現在走到哪裡」，不會強制任何事情在某一年發生
  Future.STAGES = [
    { name: '工業化', techs: ['railway', 'electrification', 'ice', 'sanitation', 'fertilizer'], goal: '鐵路、電力、內燃機、公共衛生' },
    { name: '大量生產', techs: ['assembly', 'automobile', 'vaccines', 'radio', 'petrochem', 'tractor'], goal: '流水線、汽車、疫苗、無線電' },
    { name: '原子與電腦', techs: ['computing', 'nuclear', 'antibiotics', 'aviation', 'green'], goal: '電子計算、核能、抗生素' },
    { name: '資訊時代', techs: ['internet', 'satellite', 'automation', 'rocketry'], goal: '網際網路、人造衛星、自動化' },
    { name: '未來科技', techs: ['ai', 'renewables', 'genetics', 'reusable'], goal: '人工智慧、再生能源、基因工程、可回收火箭' },
    { name: '走出地球', techs: ['mars', 'pdefense', 'alignment', 'agi', 'synbio'], goal: '火星殖民、行星防禦、通用 AI' },
    { name: '星際文明', techs: ['fusion', 'capture', 'interp', 'asi', 'interstellar'], goal: '核融合、超級智慧、星際航行' }
  ];
  const ptsCache = new Map();
  const pts = (c) => { if (!ptsCache.has(c)) ptsCache.set(c, WS.Technology.researchPoints(c, ptsCache.w).pts); return ptsCache.get(c); };
  const topResearch = (w, c) => {
    const tp = w.params.technology, milFirst = c.goal === 'expand' || c.goal === 'security' || c.flags.atWar;
    const cost = (t) => WS.Data.techs[t].cost * (w.invented[t] ? tp.diffusionDiscount : 1) * (milFirst && WS.Data.techs[t].field === 'military' ? 0.5 : 1);
    return WS.Technology.available(c, w).sort((a, b) => cost(a) - cost(b) || (a < b ? -1 : 1)).slice(0, 3);
  };
  Future.progress = function (w) {
    const u = U(), ids = u.ids(w), p = P(w);
    ptsCache.clear(); ptsCache.w = w;
    const T = WS.Data.techs;
    const stages = Future.STAGES.map((st) => {
      const list = st.techs.filter((t) => T[t]);
      const done = list.filter((t) => w.invented[t]);
      return { name: st.name, goal: st.goal, total: list.length, done: done.length, year: done.length === list.length && list.length ? Math.max(...done.map((t) => w.invented[t].year)) : null, missing: list.filter((t) => !w.invented[t]) };
    });
    const cur = stages.findIndex((x) => x.done < x.total);
    // 下一批可能的突破：前置科技已在某國普及、世界上還沒有人完成
    const next = [];
    for (const t in T) {
      if (w.invented[t]) continue;
      let best = null;
      for (const id of ids) {
        const c = w.countries[id];
        if (!T[t].req.every((r) => u.adopt(c, r) >= w.params.technology.prereqAdoption)) continue;
        const prog = c.tech[t] ? c.tech[t].progress / T[t].cost : 0;
        // 照目前速度每年完成的比例：和科技引擎一樣，研究點數平均分給最便宜的 3 項可研究科技
        const top = topResearch(w, c);
        const rate = top.includes(t) ? pts(c) / top.length / T[t].cost : 0;
        const score = prog + rate * 20;
        if (!best || score > best.score) best = { id, name: c.name, prog, rate, score };
      }
      if (best) next.push({ id: t, name: T[t].name, future: !!T[t].future, by: best.id, byName: best.name, prog: Math.min(0.999, best.prog), years: best.rate > 0 ? Math.ceil((1 - Math.min(1, best.prog)) / best.rate) : null });
    }
    next.sort((a, b) => (a.years == null ? 1e9 : a.years) - (b.years == null ? 1e9 : b.years) || b.prog - a.prog);
    // 停滯：多久沒有世界首創的新技術
    const years = Object.values(w.invented).map((x) => x.year);
    const last = years.length ? Math.max(...years) : null;
    const since = w.year - (last != null ? last : (w.startYear || w.year));
    const sv = p.stagnationYears || 25;
    // 科技樹全部完成：沒有「下一項」可以研究，不算停滯
    const allDone = Object.keys(T).every((t) => w.invented[t]);
    const stalled = !allDone && since >= sv;
    // 停滯的原因：只看模擬裡的實際數字（研究投入、教育、政局、戰爭、經濟）
    const why = [];
    const lead = next.length && next[0].years != null ? w.countries[next[0].by] : ids.map((id) => w.countries[id]).sort((a, b) => pts(b) - pts(a) || (a.id < b.id ? -1 : 1))[0];
    if (lead) {
      const r = WS.Technology.researchPoints(lead, w);
      const share = (lead.fiscal.budget && lead.fiscal.budget.research) || 0;
      if (lead.demo.edu < 40) why.push(`研究最快的${lead.name}教育只有 ${lead.demo.edu.toFixed(0)}（研究與普及都慢）`);
      if (share < 0.03) why.push(`${lead.name}的科研只占財政支出 ${(share * 100).toFixed(0)}%`);
      if (lead.pol.stability < 40) why.push(`${lead.name}政局不穩（穩定度 ${lead.pol.stability.toFixed(0)}），研究效率打折`);
      if (lead.flags.atWar) why.push(`${lead.name}正在打仗`);
      if ((lead.econ.gdppc || 0) < 3000) why.push(`${lead.name}人均 GDP 約 ${Math.round(lead.econ.gdppc || 0).toLocaleString()} 美元，研究經費很少`);
      if (!allDone) why.push(`全世界研究投入每年約 ${u.fmt(ids.reduce((s2, id) => s2 + pts(w.countries[id]), 0), 2)}（${lead.name} ${u.fmt(r.pts, 2)}；最便宜的一項新技術要 ${Math.min(...Object.keys(T).filter((t) => !w.invented[t]).map((t) => T[t].cost))}）`);
    }
    const warAll = w.wars.filter((x) => !x.ended).length;
    if (warAll >= 3) why.push(`世界上同時有 ${warAll} 場戰爭`);
    return { stages, cur, next: next.slice(0, 4), last, since, stalled, allDone, stallYears: sv, why, lead: lead ? lead.id : null };
  };

  // 兩條世界線第一個不同的重大事件（「沒有你的世界」比較用）
  // - 建立分支、系統訊息只是紀錄，不是模擬裡發生的事，比較前先排除
  // - 事件紀錄最多保留 3000 件，太舊的會被刪掉：只比較兩邊都還有紀錄的期間（from 起、到兩邊都推進到的時間為止），
  //   否則一邊有、一邊已刪掉的舊事件會被誤認成差異。aEvents／bEvents 可傳入另外收集、沒有被刪的完整事件
  Future.firstDiff = function (a, b, aEvents, bEvents) {
    const key = (x) => x.y * 12 + ((x.m || 1) - 1);
    const EA = aEvents || a.events, EB = bEvents || b.events;
    const from = Math.max(EA.length ? key(EA[0]) : 0, EB.length ? key(EB[0]) : 0);
    const to = Math.min(a.year * 12 + a.month - 1, b.year * 12 + b.month - 1);
    const big = (x) => x.level >= 3 && x.type !== 'system' && x.type !== 'branch' && !/^世界線分歧/.test(x.title) && key(x) >= from && key(x) <= to;
    const A = EA.filter(big), B = EB.filter(big);
    const start = Math.min(a.startYear || 0, b.startYear || 0);
    const fromYear = Math.floor(from / 12);
    const out = (o) => Object.assign(o, { from: fromYear > start ? fromYear : null });
    const n = Math.min(A.length, B.length);
    for (let i = 0; i < n; i++) {
      if (A[i].title === B[i].title && A[i].y === B[i].y) continue;
      // 同一時間點兩邊各有一件不同的事 → 兩件都列；否則只列較早的那一邊（另一邊沒有這件事）
      const ka = key(A[i]), kb = key(B[i]), e = ka <= kb ? A[i] : B[i];
      return out({ y: e.y, m: e.m, mine: ka <= kb ? A[i] : null, other: kb <= ka ? B[i] : null });
    }
    if (A.length !== B.length) { const e = A.length > B.length ? A[n] : B[n]; return out({ y: e.y, m: e.m, mine: A.length > B.length ? e : null, other: A.length > B.length ? null : e }); }
    return null;
  };

  // ---------- 「沒有你介入的世界」：從起點用同一個種子重跑，不重播玩家的政策、神之手、規則與「如果？」 ----------
  // 分段執行（介面每次呼叫 run(n) 推進幾年），不改目前的世界
  Future.counterfactual = function (w, maxYears) {
    if (!w.genesis) return null;
    const sim = new WS.WorldEngine();
    const g = U().clone(w.genesis);
    sim.w = WS.State.createWorld(g);
    sim.snapshots = [];
    const keep = (w.commandLog || []).filter((c) => ['mode', 'focus', 'intervention'].includes(c.cmd));
    let i = 0;
    const limit = (maxYears != null ? maxYears : 0);
    const endYear = Math.max(w.year, w.startYear) + limit;
    // 重跑的世界比較久，事件紀錄（最多 3000 件）會刪掉舊的；重大事件每一步都另外收好，比較時才不會缺頭
    const big = [];
    let lastId = 0;
    const collect = () => {
      const ev = sim.w.events;
      let k = ev.length - 1;
      while (k >= 0 && +ev[k].id.slice(1) > lastId) k--;
      for (k++; k < ev.length; k++) if (ev[k].level >= 3) big.push(ev[k]);
      if (ev.length) lastId = +ev[ev.length - 1].id.slice(1);
    };
    collect();
    return {
      sim,
      events: big,
      done: () => !!(sim.w.future && sim.w.future.ended) || sim.w.year >= endYear,
      endYear,
      run(years) {
        const target = Math.min(endYear, sim.w.year + years);
        while (sim.w.year < target && !(sim.w.future && sim.w.future.ended)) {
          while (i < keep.length && keep[i].tick <= sim.w.tick) { sim.exec(keep[i]); i++; }
          sim.step();
          collect();
        }
        sim.w.pendingDecision = null;
        return sim.w;
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
