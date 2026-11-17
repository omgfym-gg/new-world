// Era Bridge：從遠古世界接到近代引擎
// 遠古世界演進到近代門檻（params.ancient.bridge.year）之後，把當時的政體與地區轉成近代引擎的國家，繼續用近代引擎每月模擬。
// 原則：
//   ・不照史實：國家、國名、國界都來自這條世界線的政體；沒有政體的地區成為「諸部」。
//   ・人口直接沿用；其他近代數值（GDP、教育、城市化、行政…）依遠古的實際狀態換算（係數在 params.ancient.bridge，示意值）。
//   ・近代科技從零開始（遠古科技只影響起始的人均產出與教育），之後由近代引擎研究。
//   ・換算過程寫進新世界的「世界建立」事件與 w.origin，可以追查。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const B = (WS.EraBridge = {});
  const ADV = ['writing', 'administration', 'currency', 'paper', 'printing', 'compass', 'gunpowder', 'crop_rotation', 'iron'];

  B.available = function (w) {
    if (!WS.Ancient || !WS.Ancient.isAncient(w)) return { ok: false, reason: '只有遠古世界需要接到近代' };
    const y = w.params.ancient.bridge.year;
    return w.year >= y ? { ok: true } : { ok: false, reason: `要演進到 ${y} 年以後才能進入近代（目前${WS.Ancient.yearLabel(w.year)}）` };
  };

  // 一個政體（或沒有政體的地區）→ 一個近代國家
  B.groups = function (w) {
    const A = WS.Ancient, R = w.ancient.regions;
    const out = [];
    for (const p of Object.values(w.ancient.polities).filter((x) => !x.ended).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const regs = p.regions.filter((id) => R[id]).sort((a, b) => (a === p.capital ? -1 : b === p.capital ? 1 : a < b ? -1 : 1));
      if (regs.length) out.push({ id: p.id, name: p.name, color: p.color, capital: p.capital, regions: regs, polity: p });
    }
    for (const id of A.ids(w)) if (!R[id].polity && A.popOf(R[id]) > 0.01) out.push({ id, name: R[id].name + '諸部', color: R[id].color, capital: id, regions: [id], polity: null });
    return out;
  };

  B.countryDef = function (w, g) {
    const A = WS.Ancient, R = w.ancient.regions, pb = w.params.ancient.bridge, PT = WS.Data.ancientPolityTypes;
    const regs = g.regions.map((id) => R[id]), cap = R[g.capital];
    const pop = regs.reduce((s, r) => s + A.popOf(r), 0);
    const urban = regs.reduce((s, r) => s + r.pop.U, 0) / Math.max(1e-9, pop);
    const knows = (t) => A.knows(w, cap, t);
    const dev = ADV.filter(knows).length / ADV.length;
    const gdppc = pb.gdppcBase + pb.gdppcDev * dev + pb.gdppcUrban * urban;
    const rank = g.polity ? PT[g.polity.type].rank : 0;
    const edu = Math.min(60, pb.eduBase + (knows('writing') ? 10 : 0) + (knows('paper') ? 8 : 0) + (knows('printing') ? 15 : 0));
    const area = regs.reduce((s, r) => s + r.area, 0);
    const names = g.regions.length > 1 ? regs.map((r) => r.name) : (cap.cities.length >= 2 ? cap.cities.slice(0, 4).map((c) => c.name + '一帶') : ['北部', '南部', '沿海']);
    const typeName = g.polity ? PT[g.polity.type].name : '部族社會';
    const def = WS.Data.makeCountry(g.id, g.name, g.color, [cap.lat, cap.lon], 'agrarian', {
      regime: rank >= 3 ? 'monarchy' : rank >= 1 ? 'monarchy' : 'warlord',
      regimeLabel: `${g.name}（${typeName}）`,
      leader: { name: `${g.name}的${rank >= 3 ? '君主' : rank >= 1 ? '首領' : '各部首領'}`, comp: 0.5, aggr: 0.45, reform: 0.3 },
      pop: +pop.toFixed(3), gdp: +(pop * gdppc / 1000).toFixed(3), army: +(pop * pb.armyShare * (1 + A.eff(cap, 'military') / 2)).toFixed(4),
      edu: +edu.toFixed(0), urban: +Math.min(0.35, urban * pb.urbanScale).toFixed(3),
      coal: +(regs.reduce((s, r) => s + r.area * r.iron, 0) * pb.coalPerIronArea).toFixed(2), oil: +(area * pb.oilPerArea).toFixed(2),
      pol: { stability: g.polity ? 30 + g.polity.cohesion * 0.4 : 35, legitimacy: g.polity ? 45 + rank * 5 : 30, admin: 15 + rank * 8 + (knows('administration') ? 10 : 0), localPower: g.regions.length > 2 ? 65 : 50 },
      mil: { training: 25 + rank * 5, equipment: knows('gunpowder') ? 0.2 : 0.1 },
      goal: rank >= 3 ? 'security' : 'stabilize',
      regions: names
    });
    def.techs = {};   // 近代科技從零開始
    return { def, info: { pop, gdppc, dev, urban, rank, typeName, regions: g.regions.slice() } };
  };

  B.build = function (w) {
    const av = B.available(w);
    if (!av.ok) return av;
    const groups = B.groups(w);
    const made = groups.map((g) => Object.assign({ g }, B.countryDef(w, g)));
    const owner = {};
    for (const m of made) for (const r of m.g.regions) owner[r] = m.def.id;
    const rel = {};
    for (const m of made) for (const r of m.g.regions) for (const [o] of w.ancient.regions[r].links) {
      const b = owner[o];
      if (!b || b === m.def.id) continue;
      const k = m.def.id < b ? m.def.id + '|' + b : b + '|' + m.def.id;
      rel[k] = true;
    }
    const relations = Object.keys(rel).sort().map((k) => { const [a, b] = k.split('|'); return [a, b, -10, '邊境接壤（遠古時代的鄰居）']; });
    const year = w.year;
    const sc = {
      id: 'from-ancient', name: `承接遠古：${year} 年的世界`, startYear: year, startMonth: 1,
      provenance: {
        population: { source: '直接沿用遠古世界線的模擬結果', grade: 'D', estimated: true },
        gdp: { source: '依遠古的科技、城市比例換算（params.ancient.bridge，示意值）', grade: 'D', estimated: true }
      },
      countries: made.map((m) => m.def), relations, alliances: []
    };
    const biggest = made.slice().sort((a, b) => b.info.pop - a.info.pop)[0];
    const origin = {
      fromAncient: true, ancientSeed: w.seed, ancientWorldId: w.world_id, ancientBranch: w.branch.name, year,
      firsts: Object.entries(w.ancient.firsts).filter(([, f]) => f.region).map(([k, f]) => ({ key: k, region: w.ancient.regions[f.region].name, year: f.year })),
      countries: made.map((m) => ({ id: m.def.id, name: m.def.name, from: m.info.regions.map((r) => w.ancient.regions[r].name), pop: m.info.pop, gdppc: Math.round(m.info.gdppc), type: m.info.typeName }))
    };
    const setup = {
      mode: 'global', difficulty: w.difficulty || 'simple', focus: biggest ? biggest.def.id : null, scenario: 'from-ancient', scenarioData: sc,
      intervention: 'occasional', direction: 'natural', speed: 'decade', rules: {}, seed: w.seed + '/近代', name: sc.name
    };
    return { ok: true, setup, origin };
  };
})(typeof window !== 'undefined' ? window : globalThis);
