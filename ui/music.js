// 背景音樂（只播放聲音，不讀寫任何模擬數值）
// 曲目為原創配樂：用本機的 ACE-Step 1.5（MIT 授權的 AI 作曲模型）生成，見 audio/README.md。
// 瀏覽器規定要玩家先點一下畫面才能出聲，所以第一次點擊時才開始播放。
(function () {
  'use strict';
  const TRACKS = { calm: 'audio/calm.mp3', war: 'audio/war.mp3' };
  const LABEL = { calm: '遠古・創世', war: '戰場' };
  const FADE_MS = 1800;
  const KEY = 'ws-music';

  let prefs = { on: true, vol: 0.5 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 無痕模式等情況：用預設值 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* 忽略 */ } };

  const players = {};
  let mood = 'calm', unlocked = false, fadeTimer = null;
  function player(k) {
    if (!players[k]) {
      const a = new Audio(TRACKS[k]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      players[k] = a;
    }
    return players[k];
  }

  // 依「開／關、音量、目前氣氛」把各曲目音量慢慢調到目標（淡入淡出）
  function sync() {
    if (!unlocked) return;
    clearInterval(fadeTimer);
    const target = (k) => (prefs.on && k === mood ? prefs.vol : 0);
    const cur = player(mood);
    if (prefs.on && cur.paused) cur.play().catch(() => {});
    const t0 = performance.now();
    const from = {};
    for (const k of Object.keys(players)) from[k] = players[k].volume;
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / FADE_MS);
      for (const k of Object.keys(players)) {
        const a = players[k];
        a.volume = Math.max(0, Math.min(1, from[k] + (target(k) - from[k]) * p));
        if (p === 1 && target(k) === 0 && !a.paused) a.pause();
      }
      if (p === 1) clearInterval(fadeTimer);
    }, 50);
  }

  // ---- 右下角的音樂按鈕與小面板 ----
  const btn = document.createElement('button');
  btn.className = 'music-btn';
  btn.type = 'button';
  const panel = document.createElement('div');
  panel.className = 'music-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="music-title">背景音樂 <small></small></div>
    <button type="button" class="btn small music-toggle"></button>
    <label class="music-vol">音量<input type="range" min="0" max="100" step="5" aria-label="音樂音量"></label>`;
  const toggle = panel.querySelector('.music-toggle');
  const slider = panel.querySelector('input');
  const now = panel.querySelector('small');

  function paint() {
    btn.textContent = '♪';
    btn.classList.toggle('off', !(prefs.on && prefs.vol > 0));
    btn.setAttribute('aria-label', prefs.on ? '背景音樂設定（播放中）' : '背景音樂設定（已關閉）');
    toggle.textContent = prefs.on ? '🔇 關閉音樂' : '🔊 開啟音樂';
    slider.value = Math.round(prefs.vol * 100);
    now.textContent = prefs.on ? '現在：' + LABEL[mood] : '';
  }

  btn.addEventListener('click', (ev) => { ev.stopPropagation(); panel.hidden = !panel.hidden; });
  toggle.addEventListener('click', (ev) => { ev.stopPropagation(); prefs.on = !prefs.on; save(); paint(); sync(); });
  slider.addEventListener('input', () => {
    prefs.vol = slider.value / 100;
    if (prefs.vol > 0) prefs.on = true;
    save(); paint();
    if (!unlocked) return;
    clearInterval(fadeTimer);
    const a = player(mood);
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
    if (document.hidden) { clearInterval(fadeTimer); Object.values(players).forEach((a) => a.pause()); }
    else sync();
  });

  function mount() { document.body.appendChild(panel); document.body.appendChild(btn); paint(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  window.WS = window.WS || {};
  window.WS.Music = {
    // 介面依畫面切換氣氛：'calm'（平時）或 'war'（看戰場畫面時）
    setMood(m) { if (!TRACKS[m] || m === mood) return; mood = m; paint(); sync(); },
    get mood() { return mood; },
    // 除錯用：目前各曲目的播放狀態
    status() { return Object.keys(players).map((k) => ({ k, playing: !players[k].paused, vol: +players[k].volume.toFixed(2), t: +players[k].currentTime.toFixed(1) })); }
  };
})();
