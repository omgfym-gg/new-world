// 背景音樂（只播放聲音，不讀寫任何模擬數值）
// 曲目為原創配樂：用本機的 ACE-Step 1.5（MIT 授權的 AI 作曲模型）生成，見 audio/README.md。
// 依世界的科技時代換一組曲子（石器部落 → 古文明 → 大航海 → 工業 → 資訊 → 未來電子），
// 每組有平時曲與戰爭曲，播完自動淡入下一首，輪流播放。
// 瀏覽器規定要玩家先點一下畫面才能出聲，所以第一次點擊時才開始播放。
(function () {
  'use strict';
  const T = (f, n) => ['audio/' + f + '.mp3', n];
  const ANCIENT_WAR = [T('war-clash', '兩軍交鋒'), T('war-stand', '最後防線'), T('war', '戰場')];
  const ERAS = {
    stone: { name: '石器時代', calm: [T('stone-fire', '營火之夜'), T('stone-hunt', '狩獵遠行'), T('calm-dawn', '創世黎明')], war: ANCIENT_WAR },
    classic: { name: '古文明', calm: [T('calm-dawn', '創世黎明'), T('calm-river', '大河文明'), T('calm-empire', '帝國榮光'), T('calm-night', '古老星夜'), T('calm', '遠古・創世')], war: ANCIENT_WAR },
    renai: { name: '大航海與啟蒙', calm: [T('renai-voyage', '航向新大陸'), T('renai-court', '啟蒙之光'), T('calm-empire', '帝國榮光')], war: ANCIENT_WAR },
    industrial: { name: '工業時代', calm: [T('ind-steam', '蒸汽與鋼鐵'), T('ind-city', '新世紀之城')], war: [T('ind-war', '戰壕進行曲'), T('war-stand', '最後防線')] },
    digital: { name: '資訊時代', calm: [T('dig-signal', '電波與晶片'), T('dig-global', '地球村')], war: [T('dig-war', '現代戰爭'), T('ind-war', '戰壕進行曲')] },
    future: { name: '未來', calm: [T('fut-orbit', '軌道之上'), T('fut-neon', '霓虹文明')], war: [T('fut-war', '星際戰火'), T('dig-war', '現代戰爭')] }
  };
  const FADE_MS = 2500;
  const KEY = 'ws-music';

  let prefs = { on: true, vol: 0.5 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 無痕模式等情況：用預設值 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* 忽略 */ } };

  const audios = {};          // 檔名 → Audio
  const idx = {};             // 「時代/氣氛」→ 目前第幾首
  let era = 'classic', mood = 'calm', unlocked = false, fadeTimer = null;

  const list = () => ERAS[era][mood];
  const key = () => era + '/' + mood;
  const cur = () => list()[(idx[key()] || 0) % list().length];
  const curSrc = () => cur()[0];

  function audio(src) {
    if (!audios[src]) {
      const a = new Audio(src);
      a.preload = 'auto'; a.volume = 0;
      // 快播完時換下一首（只有正在播的那首才換）
      a.addEventListener('timeupdate', () => {
        if (src !== curSrc() || !a.duration) return;
        if (a.duration - a.currentTime < FADE_MS / 1000 + 0.3) next();
      });
      a.addEventListener('ended', () => { if (src === curSrc()) next(); });
      audios[src] = a;
    }
    return audios[src];
  }
  function next() {
    idx[key()] = ((idx[key()] || 0) + 1) % list().length;
    audio(curSrc()).currentTime = 0;
    paint(); sync();
  }

  // 依「開／關、音量、目前曲目」把每首的音量慢慢調到目標（淡入淡出）
  function sync() {
    if (!unlocked) return;
    clearInterval(fadeTimer);
    const want = curSrc();
    const target = (src) => (prefs.on && src === want ? prefs.vol : 0);
    const a0 = audio(want);
    if (prefs.on && a0.paused) a0.play().catch(() => {});
    const t0 = performance.now();
    const from = {};
    for (const s of Object.keys(audios)) from[s] = audios[s].volume;
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / FADE_MS);
      for (const s of Object.keys(audios)) {
        const a = audios[s];
        a.volume = Math.max(0, Math.min(1, from[s] + (target(s) - from[s]) * p));
        if (p === 1 && target(s) === 0 && !a.paused) a.pause();
      }
      if (p === 1) clearInterval(fadeTimer);
    }, 50);
  }

  // ---- 右下角的音樂按鈕與小面板 ----
  const btn = document.createElement('button');
  btn.className = 'music-btn';
  btn.type = 'button';
  btn.textContent = '♪';
  const panel = document.createElement('div');
  panel.className = 'music-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="music-title">背景音樂 <small></small></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap">
      <button type="button" class="btn small music-toggle"></button>
      <button type="button" class="btn small music-next" aria-label="下一首">⏭ 下一首</button>
    </div>
    <label class="music-vol">音量<input type="range" min="0" max="100" step="5" aria-label="音樂音量"></label>`;
  const toggle = panel.querySelector('.music-toggle');
  const skip = panel.querySelector('.music-next');
  const slider = panel.querySelector('input');
  const now = panel.querySelector('small');

  function paint() {
    const on = prefs.on && prefs.vol > 0;
    btn.classList.toggle('off', !on);
    btn.setAttribute('aria-label', prefs.on ? '背景音樂設定（播放中）' : '背景音樂設定（已關閉）');
    toggle.textContent = prefs.on ? '🔇 關閉' : '🔊 開啟';
    skip.disabled = !prefs.on;
    slider.value = Math.round(prefs.vol * 100);
    now.textContent = prefs.on ? ERAS[era].name + '・' + cur()[1] : '';
  }

  btn.addEventListener('click', (ev) => { ev.stopPropagation(); panel.hidden = !panel.hidden; });
  toggle.addEventListener('click', (ev) => { ev.stopPropagation(); prefs.on = !prefs.on; save(); paint(); sync(); });
  skip.addEventListener('click', (ev) => { ev.stopPropagation(); if (prefs.on) next(); });
  slider.addEventListener('input', () => {
    prefs.vol = slider.value / 100;
    if (prefs.vol > 0) prefs.on = true;
    save(); paint();
    if (!unlocked) return;
    clearInterval(fadeTimer);
    const a = audio(curSrc());
    a.volume = prefs.on ? prefs.vol : 0;
    if (prefs.on && a.paused) a.play().catch(() => {});
  });
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => { panel.hidden = true; });

  // 第一次點擊／按鍵：瀏覽器允許出聲，開始播放
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    sync();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  // 切到背景分頁時暫停，回來再接著播
  document.addEventListener('visibilitychange', () => {
    if (!unlocked) return;
    if (document.hidden) { clearInterval(fadeTimer); Object.values(audios).forEach((a) => a.pause()); }
    else sync();
  });

  function mount() { document.body.appendChild(panel); document.body.appendChild(btn); paint(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.WS = window.WS || {};
  window.WS.Music = {
    ERAS,
    // 介面依畫面切換氣氛：'calm'（平時）或 'war'（看戰場畫面時）
    setMood(m) { if (!ERAS[era][m] || m === mood) return; mood = m; paint(); sync(); },
    // 介面依世界的科技時代換曲組：stone / classic / renai / industrial / digital / future
    setEra(e) { if (!ERAS[e] || e === era) return; era = e; paint(); sync(); },
    get mood() { return mood; },
    get era() { return era; },
    next,
    // 除錯用：目前各曲目的播放狀態
    status() { return Object.keys(audios).map((s) => ({ s, playing: !audios[s].paused, vol: +audios[s].volume.toFixed(2), t: +audios[s].currentTime.toFixed(1) })); }
  };
})();
