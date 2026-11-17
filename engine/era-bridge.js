// Era Bridge：從遠古世界接到近代引擎
// 遠古世界演進到近代門檻（params.ancient.bridge.year）之後，把當時的政體與地區轉成近代引擎的國家，繼續用近代引擎每月模擬。
// 原則：
//   ・不照史實：國家、國名、國界都來自這條世界線的政體。政體只帶走它實際治理得到的人口（依政體型態與凝聚力），
//     其餘人口與沒有政體的地區，依人口多寡分成數個以當地城市命名的獨立小國（有文字）或諸部（沒有文字）。
//   ・人口直接沿用；其他近代數值（GDP、教育、城市化、行政…）依遠古的實際狀態換算（係數在 params.ancient.bridge，示意值）。
//   ・近代科技從零開始（遠古科技只影響起始的人均產出與教育），之後由近代引擎研究。
//   ・換算過程寫進新世界的「世界建立」事件與 w.origin，可以追查。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const B = (WS.EraBridge = {});
  const ADV = ['writing', 'administration', 'currency', 'paper', 'printing', 'compass', 'gunpowder', 'crop_rotation', 'iron', 'new_crops', 'medicine', 'banking'];

  B.available = function (w) {
    if (!WS.Ancient || !WS.Ancient.isAncient(w)) return { ok: false, reason: '只有遠古世界需要接到近代' };
    const y = w.params.ancient.bridge.year;
    return w.year >= y ? { ok: true } : { ok: false, reason: `要演進到 ${y} 年以後才能進入近代（目前${WS.Ancient.yearLabel(w.year)}）` };
  };

  const PALETTE = ['#e879f9', '#38bdf8', '#facc15', '#4ade80', '#fb7185', '#a78bfa', '#2dd4bf', '#fdba74', '#93c5fd', '#bef264', '#f9a8d4', '#fcd34d', '#86efac', '#c4b5fd', '#67e8f9', '#fca5a5'];

  // 政體在某地區能有效治理的人口比例
  B.control = function (w, p, rid) {
    const pb = w.params.ancient.bridge;
    const base = (rid === p.capital ? pb.controlCapital : pb.controlOther)[p.type] || 0.5;
    return base * (1 - pb.controlCohesion + pb.controlCohesion * p.cohesion / 100);
  };

  // 分組：每個政體成為一個國家（只含它實際治理的人口）；
  // 政體治理不到的人口、沒有政體的地區，依人口多寡分成幾個獨立國家或部族（以當地城市命名）。
  // 分法只用種子決定（不動用世界的亂數），同一條世界線每次接到近代結果相同。
  B.groups = function (w) {
    const A = WS.Ancient, R = w.ancient.regions, pb = w.params.ancient.bridge;
    const out = [], rest = {};
    for (const id of A.ids(w)) rest[id] = 1;
    for (const p of Object.values(w.ancient.polities).filter((x) => !x.ended).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const regs = p.regions.filter((id) => R[id]).sort((a, b) => (a === p.capital ? -1 : b === p.capital ? 1 : a < b ? -1 : 1));
      if (!regs.length) continue;
      const parts = regs.map((rid) => { const f = Math.min(rest[rid], B.control(w, p, rid)); rest[rid] -= f; return { rid, f }; });
      const cap = R[regs[0]];
      out.push({ id: p.id, name: p.name, color: p.color, home: regs[0], lat: cap.lat, lon: cap.lon, parts, polity: p, kind: 'polity' });
    }
    for (const id of A.ids(w)) {
      const r = R[id], left = rest[id] * A.popOf(r);
      if (left <= 0.01) continue;
      const mine = out.filter((g) => g.parts.some((x) => x.rid === id));
      if (left < pb.minStatePop && mine.length) {   // 太少：併入該地區最大的國家
        const big = mine.sort((a, b) => b.parts.find((x) => x.rid === id).f - a.parts.find((x) => x.rid === id).f)[0];
        big.parts.find((x) => x.rid === id).f += rest[id];
        continue;
      }
      const n = Math.max(1, Math.min(pb.maxSplit, Math.round(left / pb.splitPop)));
      const rng = new WS.RNG(WS.hashSeed(w.seed + '/bridge/' + id));
      const wt = []; for (let i = 0; i < n; i++) wt.push(0.5 + rng.next());
      const tot = wt.reduce((s, x) => s + x, 0);
      const names = r.cities.map((c) => c.name).concat(r.places || []).filter((x, i, arr) => arr.indexOf(x) === i);
      const literate = A.knows(w, r, 'writing');
      const spread = Math.max(2, Math.min(9, Math.sqrt(r.area) * 1.6));
      for (let i = 0; i < n; i++) {
        const place = names[i] || `${r.short}第 ${i + 1} 區`;
        const ang = (i + rng.next() * 0.5) / n * Math.PI * 2, rad = n === 1 && !mine.length ? 0 : spread * (0.5 + 0.5 * rng.next());
        out.push({
          id: n === 1 ? id : id + (i + 1), name: n === 1 && !mine.length && !literate ? r.name + '諸部' : place + (literate ? '國' : '諸部'),
          color: PALETTE[Math.floor(rng.next() * PALETTE.length)], home: id, place,
          lat: +(r.lat + Math.sin(ang) * rad * 0.6).toFixed(2), lon: +(r.lon + Math.cos(ang) * rad).toFixed(2),
          parts: [{ rid: id, f: rest[id] * wt[i] / tot }], polity: null, kind: literate ? 'state' : 'tribe'
        });
      }
      rest[id] = 0;
    }
    return out;
  };

  B.countryDef = function (w, g) {
    const A = WS.Ancient, R = w.ancient.regions, pb = w.params.ancient.bridge, PT = WS.Data.ancientPolityTypes;
    const home = R[g.home];
    const pop = g.parts.reduce((s, x) => s + x.f * A.popOf(R[x.rid]), 0);
    const urban = g.parts.reduce((s, x) => s + x.f * R[x.rid].pop.U, 0) / Math.max(1e-9, pop);
    const knows = (t) => A.knows(w, home, t);
    const dev = ADV.filter(knows).length / ADV.length;
    const gdppc = pb.gdppcBase + pb.gdppcDev * dev + pb.gdppcUrban * urban;
    const rank = g.polity ? PT[g.polity.type].rank : g.kind === 'state' ? 1 : 0;
    const edu = Math.min(pb.eduMax, pb.eduBase + (knows('writing') ? pb.eduWriting : 0) + (knows('paper') ? pb.eduPaper : 0) + (knows('printing') ? pb.eduPrinting : 0) + pb.eduUrban * urban);
    const area = g.parts.reduce((s, x) => s + x.f * R[x.rid].area, 0);
    const iron = g.parts.reduce((s, x) => s + x.f * R[x.rid].area * R[x.rid].iron, 0);
    let names;
    if (g.parts.length > 1) names = g.parts.map((x) => R[x.rid].name);
    else if (g.place) names = [g.place, g.place + '周邊'];
    else names = home.cities.length >= 2 ? home.cities.slice(0, 4).map((c) => c.name + '一帶') : ['北部', '南部', '沿海'];
    const typeName = g.polity ? PT[g.polity.type].name : g.kind === 'state' ? '獨立小國' : '部族社會';
    const def = WS.Data.makeCountry(g.id, g.name, g.color, [g.lat, g.lon], 'agrarian', {
      regime: rank >= 1 ? 'monarchy' : 'warlord',
      regimeLabel: `${g.name}（${typeName}）`,
      leader: { name: `${g.name}的${rank >= 3 ? '君主' : rank >= 1 ? '首領' : '各部首領'}`, comp: 0.5, aggr: 0.45, reform: 0.3 },
      pop: +pop.toFixed(3), gdp: +(pop * gdppc / 1000).toFixed(3), army: +(pop * pb.armyShare * (1 + A.eff(home, 'military') / 2)).toFixed(4),
      edu: +edu.toFixed(0), urban: +Math.min(pb.urbanMax, urban * pb.urbanScale).toFixed(3),
      coal: +(iron * pb.coalPerIronArea).toFixed(2), oil: +(area * pb.oilPerArea).toFixed(2),
      pol: { stability: g.polity ? 30 + g.polity.cohesion * 0.4 : 40, legitimacy: g.polity ? 45 + rank * 5 : 35, admin: 15 + rank * 8 + (knows('administration') ? 10 : 0), localPower: g.parts.length > 2 ? 65 : 50 },
      mil: { training: 25 + rank * 5, equipment: knows('gunpowder') ? 0.2 : 0.1 },
      goal: rank >= 3 ? 'security' : 'stabilize',
      regions: names
    });
    def.techs = {};   // 近代科技從零開始
    return { def, info: { pop, gdppc, dev, urban, rank, typeName, regions: g.parts.map((x) => x.rid) } };
  };

  B.build = function (w) {
    const av = B.available(w);
    if (!av.ok) return av;
    const groups = B.groups(w);
    const made = groups.map((g) => Object.assign({ g }, B.countryDef(w, g)));
    // 鄰國：同一地區裡的國家彼此相鄰；相連地區之間，各自最大的國家相鄰
    const inReg = {};
    for (const m of made) for (const x of m.g.parts) (inReg[x.rid] = inReg[x.rid] || []).push({ id: m.def.id, pop: x.f * WS.Ancient.popOf(w.ancient.regions[x.rid]) });
    const rel = {};
    const add = (a, b) => { if (a !== b) rel[a < b ? a + '|' + b : b + '|' + a] = true; };
    for (const rid of Object.keys(inReg)) {
      const list = inReg[rid];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i].id, list[j].id);
      const top = list.slice().sort((a, b) => b.pop - a.pop)[0];
      for (const [o, how] of w.ancient.regions[rid].links) if (how !== 'far' && inReg[o]) add(top.id, inReg[o].slice().sort((a, b) => b.pop - a.pop)[0].id);
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
