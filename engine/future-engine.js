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
      series: { y: [], warming: [], gap: [], risk: [], mars: [], pop: [] }
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

  Future.isNuke = (c, w) => U().adopt(c, 'nuclear') >= P(w).nukeAdoption && U().adopt(c, 'rocketry') >= P(w).nukeAdoption;

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
    }
    return d;
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
    if (F.warming > p.climateDeathFrom) {
      const x = F.warming - p.climateDeathFrom;
      for (const id of ids) {
        const c = w.countries[id];
        const lat = Math.abs(c.lat || 0);
        const zone = lat < 25 ? p.tropicsMult : lat > 50 ? p.polarMult : 1;
        const rich = Math.min(1, (c.econ.gdppc || 0) / 20000);
        Future.kill(w, c, p.climateDeath * x * x * zone * (1 - 0.5 * rich), '氣候災害（熱浪、洪水、風災）', 'climate');
      }
    }
    if (r.climate > 0 && rng.chance(r.climate)) {
      catastrophe(w, ctx, 'climate', () => {
        const add = p.tippingMin + (p.tippingMax - p.tippingMin) * rng.next();
        F.tipping += add;
        F.warming += add;
        return { title: '氣候臨界點：永凍土融化、雨林崩潰', countries: [], causes: [`全球暖化 ${(F.warming - add).toFixed(1)}°C，超過臨界門檻 ${p.tippingFrom}°C`, `每年觸發機率 ${(r.climate * 100).toFixed(0)}%（世界種子決定）`], effects: [`額外升溫 ${add.toFixed(2)}°C，而且無法逆轉`], deaths: 0 };
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
        F.winter = { until: w.year + p.winterYears, mult: 1 - sev, sev, from: w.year, kind: 'nuclear' };
        const nm = (x) => w.countries[x].name;
        return {
          title: pick.crisis ? `核危機升級：${nm(pick.a)}與${nm(pick.d)}爆發核子交火` : `核子戰爭：${war ? war.name : nm(pick.a) + '對' + nm(pick.d)}動用核武`,
          countries: side,
          causes: [pick.crisis ? `兩個擁核國關係極差（${u.relation(w, pick.a, pick.d).rel.toFixed(0)}）` : '交戰雙方或戰況危急的一方擁有核武', `涉及擁核國：${powers.map(nm).join('、')}`, `今年動用核武的機率約 ${(pick.q * 100).toFixed(1)}%（世界種子決定）`],
          effects: [`直接死亡約 ${fmtPeople(deaths)}`, `核子寒冬：全球收成 −${(sev * 100).toFixed(0)}%，持續 ${p.winterYears} 年`].concat(joined.length ? [`盟國被捲入：${joined.map(nm).join('、')}`] : []), deaths
        };
      });
    }
    // 核子寒冬期間的額外死亡
    if (F.winter && F.winter.until > w.year) for (const id of ids) Future.kill(w, w.countries[id], p.winterDeath * F.winter.sev, F.winter.kind === 'asteroid' ? '撞擊冬天（塵埃遮蔽陽光）' : '核子寒冬（日照不足、農業崩潰）', F.winter.kind || 'nuclear');

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
          F.winter = { until: w.year + 3, mult: 1 - 0.5 * sev, sev: 0.5 * sev, from: w.year, kind: 'asteroid' };
          return {
            title: '小行星撞擊地球', countries: [], level: 3,
            causes: ['自然風險（每年機率很小，世界種子決定）', def > 0 ? `行星防禦普及只有 ${(def * 100).toFixed(0)}%，沒能偏轉` : '還沒有行星防禦技術'],
            effects: [`死亡約 ${fmtPeople(deaths)}`, '撞擊塵埃遮蔽陽光，收成大減 3 年'], deaths
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
    // 8. 高峰與紀錄
    const pop = worldPop(w, ids), gdp = worldGdp(w, ids);
    if (pop > F.peak.pop) { F.peak.pop = pop; F.peak.y = w.year; }
    if (gdp > F.peak.gdp) { F.peak.gdp = gdp; F.peak.gy = w.year; }
    const S = F.series;
    S.y.push(w.year); S.warming.push(+F.warming.toFixed(3)); S.gap.push(+F.ai.gap.toFixed(3)); S.risk.push(+(r.total * 100).toFixed(2));
    S.mars.push(F.mars ? +F.mars.pop.toFixed(4) : 0); S.pop.push(+pop.toFixed(1));

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

  // 災難：先看「如果？」平行世界有沒有阻止它，再執行並記錄
  function catastrophe(w, ctx, kind, run) {
    const F = w.future;
    const name = (Future.KINDS[kind] || { name: 'AI 事故' }).name;
    const o = WS.WhatIf && WS.WhatIf.take(w, (x) => x.kind === 'future' && x.fk === kind);
    if (o) {
      WS.WhatIf.logDivergence(w, ctx, o, [], [`原本這一年會發生：${name}`]);
      return null;
    }
    const res = run();
    const e = WS.Events.log(w, ctx, { type: 'catastrophe', fk: kind, title: res.title, countries: res.countries || [], level: res.level || 3, causes: res.causes, effects: res.effects });
    F.catastrophes.push({ y: w.year, kind, title: res.title, deaths: res.deaths || 0, eventId: e.id });
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
      techTotal: Object.values(WS.Data.techs).filter((t) => t.future).length
    };
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
    return {
      sim,
      done: () => !!(sim.w.future && sim.w.future.ended) || sim.w.year >= endYear,
      endYear,
      run(years) {
        const target = Math.min(endYear, sim.w.year + years);
        while (sim.w.year < target && !(sim.w.future && sim.w.future.ended)) {
          while (i < keep.length && keep[i].tick <= sim.w.tick) { sim.exec(keep[i]); i++; }
          sim.step();
        }
        sim.w.pendingDecision = null;
        return sim.w;
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
