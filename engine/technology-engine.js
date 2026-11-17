// Technology Engine：研究投入、前置條件、五階段發展、普及與擴散（第 6.4 節）
// 科研進度 = 投入 × 人才倍率 × 制度倍率 × 設施倍率 × 世界規則倍率
(function (root) {
  const WS = (root.WS = root.WS || {});
  const dt = 1 / 12;
  const Tech = (WS.Technology = {});

  Tech.available = function (c, w) {
    const U = WS.util, tp = w.params.technology;
    const list = [];
    for (const id in WS.Data.techs) {
      const t = WS.Data.techs[id];
      if (U.invented(c, w, id)) continue;
      if (t.req.every((r) => U.adopt(c, r) >= tp.prereqAdoption)) list.push(id);
    }
    return list;
  };

  Tech.stage = function (c, w, id) {
    const t = WS.Data.techs[id], s = c.tech[id];
    const th = w.params.technology.stageThresholds;
    if (!s || s.progress <= 0) return null;
    const r = s.progress / t.cost;
    if (r < th[0]) return 0;
    if (r < th[1]) return 1;
    if (r < th[2]) return 2;
    return s.adoption < 0.5 ? 3 : 4;
  };

  Tech.score = function (c) {
    let s = 0;
    for (const id in c.tech) s += c.tech[id].adoption * WS.Data.techs[id].cost;
    return s;
  };

  Tech.researchPoints = function (c, w) {
    const U = WS.util, tp = w.params.technology;
    const planned = WS.Economy.isPlanned(c, w);
    const budget = (c.fiscal.amounts.research || 0) + (planned ? 0 : c.econ.gdp * tp.privateResearchShare);
    const talent = Math.pow(Math.max(1, c.demo.edu) / 50, 0.8);
    const inst = 0.6 + 0.4 * c.pol.stability / 100;
    const facility = 1 + c.econ.sec.ind.Y / Math.max(1e-6, c.econ.gdp);
    return { pts: budget * talent * inst * facility * w.rules.techSpeed, budget, talent, inst, facility };
  };

  Tech.step = function (w, ids, ctx) {
    const U = WS.util, tp = w.params.technology;
    for (const id of ids) {
      const c = w.countries[id];
      const r = Tech.researchPoints(c, w);
      const pts = r.pts * dt;
      c.research.points = r.pts;
      let avail = Tech.available(c, w);
      const milFirst = c.goal === 'expand' || c.goal === 'security' || c.flags.atWar;
      avail.sort((a, b) => {
        const ca = WS.Data.techs[a].cost * (w.invented[a] ? tp.diffusionDiscount : 1) * (milFirst && WS.Data.techs[a].field === 'military' ? 0.5 : 1);
        const cb = WS.Data.techs[b].cost * (w.invented[b] ? tp.diffusionDiscount : 1) * (milFirst && WS.Data.techs[b].field === 'military' ? 0.5 : 1);
        return ca - cb || (a < b ? -1 : 1);
      });
      avail = avail.slice(0, 3);
      c.research.current = avail;
      for (const t of avail) {
        const s = c.tech[t] || (c.tech[t] = { progress: 0, adoption: 0 });
        const add = (pts / avail.length) / (w.invented[t] ? tp.diffusionDiscount : 1);
        s.progress += add;
        U.cause(c, 'research', WS.Data.techs[t].name, add, w.invented[t] ? '引進他國技術（成本折扣）' : '自主研發');
      }
      // 經由貿易被動擴散
      for (const t of avail) {
        let best = 0, from = null;
        for (const o of ids) {
          if (o === id) continue;
          const rel = U.relation(w, id, o);
          if (rel.war || rel.trade < 0.2) continue;
          const oa = U.adopt(w.countries[o], t);
          if (oa > 0.5 && rel.trade > best) { best = rel.trade; from = o; }
        }
        if (from) {
          const add = WS.Data.techs[t].cost * tp.spilloverRate * best;
          c.tech[t].progress += add;
          U.cause(c, 'research', WS.Data.techs[t].name, add, '經由與' + w.countries[from].name + '的貿易擴散');
        }
      }
      // 神之手的知識管道：每月增加研究進度（速度在施展時已依教育與運氣決定）
      const ch = WS.Divine ? WS.Divine.techChannel(c, w) : null;
      const done = avail.slice();
      if (ch) {
        const def = WS.Data.techs[ch.id];
        const s = c.tech[ch.id] || (c.tech[ch.id] = { progress: 0, adoption: 0 });
        if (s.progress < def.cost) {
          const add = def.cost * ch.rate;
          s.progress += add; ch.gain += add;
          U.cause(c, 'research', def.name, add, '神之手：知識分享');
          if (!done.includes(ch.id)) done.push(ch.id);
        } else ch.closed = true;
      }
      // 完成研究
      for (const t of done) {
        const s = c.tech[t], def = WS.Data.techs[t];
        if (s.progress >= def.cost && !s.done) {
          s.done = true;
          if (ch && ch.id === t) ch.closed = true;
          const first = !w.invented[t];
          if (first) w.invented[t] = { by: id, year: w.year };
          WS.Events.log(w, ctx, {
            type: 'tech', title: first ? `${c.name}率先完成「${def.name}」` : `${c.name}掌握「${def.name}」`,
            countries: [id], level: first ? 2 : 1, major: first && id === w.focus,
            text: first ? '世界首次出現這項技術，其他國家之後可用較低成本引進。' : '技術進入實際應用階段，接下來需要時間普及。',
            causes: [
              ...(ch && ch.id === t ? ['神之手開啟的知識管道加速了研究'] : []),
              `科研投入每年約 ${U.fmt(r.budget, 2)}（十億）`,
              `人才倍率 ${r.talent.toFixed(2)}（教育 ${c.demo.edu.toFixed(0)}）`,
              `制度倍率 ${r.inst.toFixed(2)}（穩定度 ${c.pol.stability.toFixed(0)}）`,
              ...def.req.map((q) => '前置科技：' + WS.Data.techs[q].name)
            ]
          });
        }
      }
      // 普及
      const eduF = Math.sqrt(Math.max(1, c.demo.edu) / 60);
      const capF = 0.6 + Math.min(1, c.econ.sec.ind.Y / Math.max(1e-6, c.econ.gdp) * 2.5);
      for (const t in c.tech) {
        const s = c.tech[t];
        if (s.progress < WS.Data.techs[t].cost || s.adoption >= 1) continue;
        const da = tp.adoptionRate * (0.3 + s.adoption) * (1 - s.adoption) * eduF * capF * (c.flags.atWar ? 0.7 : 1) * dt;
        s.adoption = Math.min(1, s.adoption + da);
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
