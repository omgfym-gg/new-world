// 介面隨時代換風格（只改外觀，不讀寫任何模擬數值，也不寫進 commandLog）
// 依世界上「已經出現的最先進科技」決定時代，和背景音樂用同一套判斷：
//   石器部落 → 石板；古文明、大航海 → 羊皮卷；工業時代 → 報紙；資訊時代 → 儀表板；未來 → 全息螢幕
// 玩家也可以在「系統」頁固定一種風格（偏好存在這台裝置上）。
(function (root) {
  'use strict';
  const WS = root.WS = root.WS || {};

  const THEMES = {
    stone: { name: '石板', era: '石器時代', desc: '刻在石板上的部落紀錄' },
    scroll: { name: '羊皮卷', era: '古文明到大航海', desc: '墨水寫在羊皮卷上的編年史' },
    paper: { name: '報紙', era: '工業時代', desc: '鉛字印刷的報紙版面' },
    dash: { name: '儀表板', era: '資訊時代', desc: '電腦螢幕上的指揮中心' },
    holo: { name: '全息螢幕', era: '未來', desc: '浮在空中的全息投影' }
  };
  // 音樂的時代 → 介面風格
  const BY_AGE = { stone: 'stone', classic: 'scroll', renai: 'scroll', industrial: 'paper', digital: 'dash', future: 'holo' };
  const KEY = 'ws.uiTheme';

  // 世界目前的時代（stone / classic / renai / industrial / digital / future），只讀取
  function age(w) {
    if (!w) return 'digital';
    if (w.era === 'ancient') {
      const has = (t) => !!(w.ancient && w.ancient.firsts && w.ancient.firsts[t]);
      if (has('printing') || has('gunpowder') || has('compass')) return 'renai';
      if (has('writing')) return 'classic';
      return 'stone';
    }
    const inv = w.invented || {};
    const techs = (WS.Data && WS.Data.techs) || {};
    const has = (t) => !!inv[t];
    const futureTech = Object.keys(inv).some((t) => techs[t] && techs[t].future);
    if (futureTech || (has('internet') && has('satellite'))) return 'future';
    if (has('computing')) return 'digital';
    return 'industrial';
  }
  const themeOf = (w) => BY_AGE[age(w)];

  // 玩家偏好：auto＝跟著時代，或固定一種
  function pref() {
    try { const v = root.localStorage && root.localStorage.getItem(KEY); return THEMES[v] ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function setPref(v) {
    try { if (root.localStorage) { if (THEMES[v]) root.localStorage.setItem(KEY, v); else root.localStorage.removeItem(KEY); } } catch (e) { /* 無法儲存時只在這次有效 */ }
  }
  // 實際要用的風格：沒有世界（開始畫面）時用儀表板
  function pick(w, p) {
    p = p || pref();
    if (THEMES[p]) return p;
    return w ? themeOf(w) : 'dash';
  }

  // 套用到畫面：回傳 true 表示風格換了（第一次套用不算）
  let current = null;
  function apply(key) {
    if (typeof document === 'undefined' || !document.body) return false;
    if (key === current) return false;
    const first = current === null;
    current = key;
    const b = document.body;
    b.dataset.ui = key;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', { stone: '#1c1a17', scroll: '#e6d5ae', paper: '#efede6', dash: '#05070d', holo: '#04020f' }[key]);
    if (!first) {
      b.classList.remove('ui-shift'); void b.offsetWidth; b.classList.add('ui-shift');
      clearTimeout(apply.t); apply.t = setTimeout(() => b.classList.remove('ui-shift'), 1300);
    }
    return !first;
  }

  WS.EraTheme = { THEMES, BY_AGE, age, themeOf, pref, setPref, pick, apply, current: () => current };
})(typeof window !== 'undefined' ? window : globalThis);
