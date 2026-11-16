// Diplomacy Engine：雙邊關係、互信、貿易、記憶、聯盟、國際組織（第 6.6 節）
// 外交關係變化 = 共同利益 + 合作 + 互信 − 威脅 − 衝突 − 歷史仇恨
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Dip = (WS.Diplomacy = {});

  Dip.regimeSimilarity = function (w, A, B) {
    const U = WS.util, dp = w.params.diplomacy;
    const fa = (U.regime(w, A.regime) || {}).family, fb = (U.regime(w, B.regime) || {}).family;
    if (fa === 'commune' && fb === 'commune') return 40;
    if (A.regime === B.regime) return dp.sameRegime;
    if ((fa === 'socialist') !== (fb === 'socialist')) return dp.socialistGap;
    if ((fa === 'democracy' && fb === 'autocracy') || (fb === 'democracy' && fa === 'autocracy')) return dp.democracyVsAutocracy;
    return 0;
  };

  Dip.memorySum = function (w, r) {
    const decay = w.params.diplomacy.memoryDecay;
    return r.memory.reduce((s, m) => s + m.v * Math.pow(decay, w.year - m.year), 0);
  };

  Dip.remember = function (w, a, b, v, text) {
    const r = WS.util.relation(w, a, b);
    if (!r) return;
    r.memory.push({ v, text, year: w.year, month: w.month });
    if (r.memory.length > 12) r.memory.shift();
  };

  Dip.sharedOrg = function (w, a, b) {
    for (const id in w.organizations) {
      const o = w.organizations[id];
      if (o.active && o.members.includes(a) && o.members.includes(b)) return o;
    }
    return null;
  };

  Dip.step = function (w, ids, ctx) {
    const U = WS.util, dp = w.params.diplomacy;
    const alive = new Set(ids);
    for (const key of Object.keys(w.relations).sort()) {
      const r = w.relations[key];
      if (!alive.has(r.a) || !alive.has(r.b)) continue;
      const A = w.countries[r.a], B = w.countries[r.b];
      const parts = {
        '既有爭端或情誼': r.base,
        '制度差異': Dip.regimeSimilarity(w, A, B),
        '貿易往來': r.trade * dp.tradeWeight,
        '同盟關係': r.alliance ? dp.allianceBonus : 0,
        '歷史記憶': Dip.memorySum(w, r),
        '軍備競賽': A.fiscal.budget.military > 0.45 || B.fiscal.budget.military > 0.45 ? dp.armsRace : 0,
        '國際組織': Dip.sharedOrg(w, r.a, r.b) ? 10 : 0,
        '軍事威脅': r.base < 0 && w.rules.states !== false ? dp.threatWeight * Math.min(2, Math.max(0, Math.max(A.mil.power, B.mil.power) / Math.max(1e-6, Math.min(A.mil.power, B.mil.power)) - 1.2)) : 0,
        '擴張野心': r.base < 0 && (A.goal === 'expand' || B.goal === 'expand') ? dp.ambition : 0,
        '和平合作方向': A.goal === 'peace' && B.goal === 'peace' ? 15 : 0
      };
      let target = 0;
      for (const k in parts) target += parts[k];
      if (r.war) target = -90;
      target = U.clamp(target, -100, 100);
      r.parts = parts;
      r.target = target;
      r.rel += (target - r.rel) * dp.adjust;
      r.trust = U.clamp(r.trust + ((50 + r.rel / 2) - r.trust) * 0.02, 0, 100);
      let tt = r.war ? 0 : U.clamp(0.1 + 0.4 * Math.min(A.econ.openness, B.econ.openness) + r.rel / 250, 0, 1);
      if (w.rules.currency === false) tt *= 0.7;
      r.trade += (tt - r.trade) * dp.tradeAdjust;
      if (r.alliance && r.rel < 0) {
        r.alliance = false;
        WS.Events.log(w, ctx, { type: 'diplomacy', title: `${A.name}與${B.name}的同盟瓦解`, countries: [r.a, r.b], level: 1, causes: ['雙方關係降到 ' + r.rel.toFixed(0)] });
      }
    }

    // 每年一月：檢查是否形成或解散國際組織（動態新實體）
    if (w.month !== 1) return;
    for (const oid of Object.keys(w.organizations).sort()) {
      const o = w.organizations[oid];
      if (!o.active) continue;
      o.members = o.members.filter((m) => alive.has(m));
      let s = 0, n = 0;
      for (let i = 0; i < o.members.length; i++) for (let j = i + 1; j < o.members.length; j++) { s += U.relation(w, o.members[i], o.members[j]).rel; n++; }
      if (o.members.length < 2 || (n && s / n < 10)) {
        o.active = false; o.dissolved = w.year;
        WS.Events.log(w, ctx, { type: 'organization', title: `「${o.name}」解散`, countries: o.members, level: 2, causes: ['成員之間平均關係降到 ' + (n ? (s / n).toFixed(0) : '—')] });
      }
    }
    for (const a of ids) {
      const friends = ids.filter((b) => b !== a && U.relation(w, a, b).rel > dp.orgFormRelation && !U.relation(w, a, b).war);
      if (friends.length < dp.orgFormMembers - 1) continue;
      const group = [a];
      for (const b of friends) if (group.every((g) => g === b || U.relation(w, g, b).rel > dp.orgFormRelation)) group.push(b);
      if (group.length < dp.orgFormMembers) continue;
      group.sort();
      const covered = Object.values(w.organizations).some((o) => o.active && group.every((g) => o.members.includes(g)));
      if (covered) continue;
      const threat = ids.some((x) => !group.includes(x) && group.filter((g) => U.relation(w, g, x).rel < -30).length >= 2);
      const name = group.map((g) => w.countries[g].name[0]).join('') + (threat ? '安全同盟' : '合作組織');
      const org = WS.State.createOrganization(w, name, group, threat ? 'security' : 'economic');
      if (threat) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) U.relation(w, group[i], group[j]).alliance = true;
      WS.Events.log(w, ctx, {
        type: 'organization', title: `新的國際組織成立：「${org.name}」`, countries: group, level: 3,
        major: group.includes(w.focus),
        text: threat ? '成員國面對共同威脅，結成安全同盟。' : '成員國關係密切，建立經濟與外交合作機制。',
        causes: group.slice(1).map((g) => `${w.countries[group[0]].name}與${w.countries[g].name}關係 ${U.relation(w, group[0], g).rel.toFixed(0)}`)
          .concat(threat ? ['存在共同敵對國家'] : [])
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
