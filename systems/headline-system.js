// Headline System：世界頭條
// 每年一月結算上一年時，從「實際模擬紀錄」挑出影響最大的變化做成新聞卡：
//   ・事件紀錄：戰爭、政權更替、新國家、革命、饑荒、率先發明、神之手干預……
//   ・年度數列：人口、GDP 劇烈變化、政治穩定大幅下滑（原因取自因果帳）
// 只在重大變化時出現，每年最多 N 則（engine/params.js 的 divine.headlinesPerYear）。
// 原則：頭條只用文字模板描述已記錄的事，不補寫沒有發生的細節，也不臆測原因；
// 每則頭條都連回原本的事件或因果帳，玩家可以點開追查。
(function (root) {
  const WS = (root.WS = root.WS || {});
  const Headlines = (WS.Headlines = {});

  // 事件類型 → 頭條分數與標籤
  const EVENT_SCORE = {
    war: [3, '戰爭'], regime: [3, '政局'], newcountry: [3, '新國家'], newregime: [2.6, '新制度'],
    historical: [2.8, '歷史'], 'historical-missed': [1.6, '歷史分歧'], organization: [2.2, '國際'],
    divine: [2, '神之手'], tech: [1.4, '科技'], leader: [1.1, '人物']
  };
  const CONDITIONAL = { revolution: 3, coup: 2.8, secession: 3, warlordism: 2.6, reunification: 2.6, democratization: 2.6, famine: 2.2, debt_crisis: 2, protest: 1.2 };

  const pct = (a, b) => (b ? (a / b - 1) * 100 : 0);
  const sg = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);

  // 從因果帳取上一年某指標最大的幾個原因（只引用實際紀錄）
  Headlines.topCauses = function (c, metric, year, n = 2, sign = 0) {
    const y = c.causes.years.find((x) => x.year === year);
    const data = y && y.data[metric];
    if (!data) return [];
    const rows = [];
    for (const f in data) {
      const subs = Object.entries(data[f].sub || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      rows.push({ name: f, v: data[f].v, sub: subs.length ? subs[0][0] : null });
    }
    return rows.filter((r) => (sign ? r.v * sign > 0 : true)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, n);
  };

  function eventCandidates(w, y) {
    const out = [];
    const evs = w.events.filter((e) => e.y === y);
    const ids = new Set(evs.map((e) => e.id));
    for (const e of evs) {
      let base = null, kicker = null;
      if (e.type === 'conditional' && e.defId && CONDITIONAL[e.defId] != null) { base = CONDITIONAL[e.defId]; kicker = '動盪'; if (e.defId === 'famine') kicker = '糧食'; }
      else if (e.type === 'conditional' && /旱災/.test(e.title)) { base = 1.3; kicker = '氣候'; }
      else if (EVENT_SCORE[e.type]) [base, kicker] = EVENT_SCORE[e.type];
      if (base == null) continue;
      if (e.type === 'tech' && e.level < 2) continue;           // 只有「率先完成」才上頭條
      if (e.type === 'divine' && e.level < 3) continue;           // 干預結束的追蹤紀錄只留在神之手面板
      if (e.type === 'leader' && e.level >= 3) base = 2;          // 神之手的候選者上台
      // 同一串因果（例如革命 → 制度轉變 → 領導人更替）只留源頭，分數合併
      if (e.parent && ids.has(e.parent)) { const p = out.find((x) => x.eventId === e.parent); if (p) { p.score += 0.3; continue; } }
      const lead = (e.text ? [e.text] : []).concat((e.effects || []).slice(0, 2)).join('；');
      out.push({
        kind: 'event', kicker, eventId: e.id, countries: e.countries.slice(0, 3), score: base,
        title: e.title, lead: lead || null,
        why: (e.causes || []).slice(0, 2)
      });
    }
    return out;
  }

  function metricCandidates(w, y) {
    const out = [];
    const p = w.params.divine || WS.DEFAULT_PARAMS.divine;
    const s = w.series, n = s.labels.length;
    if (n < 2) return out;
    for (const id of WS.util.ids(w)) {
      const c = w.countries[id], ser = s.c[id];
      if (!ser) continue;
      const v = (k, i) => ser[k][n - 1 - i];
      if (v('pop', 0) == null || v('pop', 1) == null) continue;
      // 疆界改變（割地、分裂）造成的變化不算，以免把領土移轉誤寫成人口暴增或暴跌
      const moved = w.events.some((e) => e.y === y && e.countries.includes(id) && ['newcountry'].includes(e.type)) || w.events.some((e) => e.y === y && e.type === 'war' && /割讓|獲得/.test((e.effects || []).join('')) && e.countries.includes(id));
      if (moved) continue;
      const dp = pct(v('pop', 0), v('pop', 1));
      if (Math.abs(dp) >= p.headlinePopPct) {
        const why = Headlines.topCauses(c, 'population', y, 2, Math.sign(dp));
        out.push({
          kind: 'metric', kicker: '人口', countries: [id], why: why.map((r) => `${r.name}${r.sub ? '（' + r.sub + '）' : ''} ${sg(r.v, 2)} 百萬`),
          metric: 'population', cid: id, score: 1 + Math.abs(dp) / p.headlinePopPct,
          title: `${c.name}人口一年${dp < 0 ? '減少' : '增加'} ${Math.abs(dp).toFixed(1)}%`,
          lead: `由 ${WS.util.fmt(v('pop', 1))} 百萬變為 ${WS.util.fmt(v('pop', 0))} 百萬。`
        });
      }
      const dg = pct(v('gdp', 0), v('gdp', 1));
      if (Math.abs(dg) >= p.headlineGdpPct) {
        const why = Headlines.topCauses(c, 'gdp', y, 6, Math.sign(dg));
        // GDP 因果帳以「部門產出」為主、細項為原因；合併同名細項讓原因更好懂
        const agg = {};
        const yr = c.causes.years.find((x) => x.year === y);
        const data = (yr && yr.data.gdp) || {};
        for (const f in data) for (const k in data[f].sub) agg[k] = (agg[k] || 0) + data[f].sub[k];
        const top = Object.entries(agg).filter(([, x]) => x * Math.sign(dg) > 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2);
        out.push({
          kind: 'metric', kicker: '經濟', countries: [id], metric: 'gdp', cid: id, score: 1 + Math.abs(dg) / p.headlineGdpPct,
          title: `${c.name}經濟一年${dg < 0 ? '萎縮' : '成長'} ${Math.abs(dg).toFixed(1)}%`,
          lead: `GDP 由 ${WS.util.fmt(v('gdp', 1))} 變為 ${WS.util.fmt(v('gdp', 0))}（十億國際元）。`,
          why: (top.length ? top.map(([k, x]) => `${k} ${sg(x, 1)}`) : why.slice(0, 2).map((r) => `${r.name} ${sg(r.v, 1)}`))
        });
      }
      const ds = v('stability', 0) - v('stability', 1);
      if (-ds >= p.headlineStabilityDrop) {
        const why = Headlines.topCauses(c, 'stability', y, 2, -1);
        out.push({
          kind: 'metric', kicker: '政局', countries: [id], metric: 'stability', cid: id, score: 1 + -ds / p.headlineStabilityDrop,
          title: `${c.name}政局急轉直下：穩定度一年下降 ${(-ds).toFixed(0)}`,
          lead: `政治穩定由 ${v('stability', 1).toFixed(0)} 降到 ${v('stability', 0).toFixed(0)}。`,
          why: why.map((r) => `${r.name} ${sg(r.v, 1)}`)
        });
      }
    }
    return out;
  }

  // 每年一月呼叫：為上一年挑出頭條（沒有夠重大的變化就不出頭條）
  Headlines.build = function (w) {
    const p = w.params.divine || WS.DEFAULT_PARAMS.divine;
    const y = w.year - 1;
    w.headlines = w.headlines || [];
    const focus = w.mode === 'country' ? w.focus : null;
    const cands = eventCandidates(w, y).concat(metricCandidates(w, y));
    for (const h of cands) if (focus && h.countries.includes(focus)) h.score += 0.8;
    cands.sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : 1));
    const picked = [];
    const seen = new Set();
    for (const h of cands) {
      if (h.score < p.headlineMinScore) break;
      // 同一國同一類（例如同國的人口與政局都因同一場戰爭）最多一則，讓頭條涵蓋更多面向
      const key = h.kicker + '|' + (h.countries[0] || '');
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(h);
      if (picked.length >= p.headlinesPerYear) break;
    }
    picked.forEach((h, i) => w.headlines.push(Object.assign({ id: `H${y}-${i + 1}`, year: y, score: +h.score.toFixed(2) }, h)));
    if (w.headlines.length > 150) w.headlines.splice(0, w.headlines.length - 150);
    return picked;
  };

  Headlines.latest = function (w) {
    const list = w.headlines || [];
    if (!list.length) return { year: null, items: [] };
    const y = list[list.length - 1].year;
    return { year: y, items: list.filter((h) => h.year === y) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
