// Save / Branch System：存檔、版本轉換、分支（第 12、17 章）
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.SAVE_VERSION = 1;

  const Save = (WS.Save = {});

  // 舊版存檔轉換：每次資料結構改版就在這裡加一段，不直接破壞舊存檔
  Save.migrate = function (obj) {
    const w = typeof obj === 'string' ? JSON.parse(obj) : obj;
    if (!w || !w.countries || !w.version) throw new Error('不是有效的世界存檔');
    if (w.version > WS.SAVE_VERSION) throw new Error('存檔版本比目前程式新，請更新模擬器');
    // v1 → v2 範例：if (w.version === 1) { ...; w.version = 2; }
    w.customRegimes = w.customRegimes || {};
    // 係數：存檔裡有的照存檔（玩家可能調過），新版本新增的係數從預設值補上（例如新的神之手、嚴重度分級）
    const def = JSON.parse(JSON.stringify(WS.DEFAULT_PARAMS));
    const fill = (dst, src) => { for (const k in src) { if (!(k in dst)) dst[k] = src[k]; else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') fill(dst[k], src[k]); } return dst; };
    w.params = fill(w.params || {}, def);
    // 「如果」平行世界所需欄位（舊存檔補上；舊的玩家政策紀錄轉為可重播的指令）
    if (w.startMonth == null) w.startMonth = (WS.Data.scenarios[w.scenario] || { startMonth: 1 }).startMonth;
    if (!w.commandLog) w.commandLog = (w.playerLog || []).map((p) => ({ tick: (p.y - w.startYear) * 12 + (p.m - w.startMonth), y: p.y, m: p.m, cmd: 'policy', args: [p.country, p.policy] }));
    w.overrides = w.overrides || [];
    if (w.genesis === undefined) w.genesis = null;
    // 神之手與世界頭條（舊存檔補上）
    if (!w.divine) w.divine = { energy: w.params.divine.energyStart, log: [], counter: 0 };
    w.headlines = w.headlines || [];
    return w;
  };

  // ======================= 本地存檔 =======================
  // 存檔內容很大（全世界劇本玩到結局約 5–10 MB），瀏覽器的 localStorage 通常只有約 5 MB。
  // 所以：存檔「內容」優先放在 IndexedDB（空間大很多，通常數百 MB 以上）；
  //       存檔「索引」（名稱、年份、大小）與偏好設定仍放在 localStorage，讀取快、同步。
  // 沒有 IndexedDB 的環境（例如測試、某些內嵌頁面）自動改用 localStorage。
  // 空間不足時依序：清掉最舊的「自動保存」→ 改存精簡版 → 失敗時清楚說明大小與解法。
  Save.keepAuto = 6;            // 自動保存（分歧點、平行世界前的原世界）最多保留幾個，越舊的越先清掉
  Save.storage = function () {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* 無法使用 */ }
    return null;
  };
  Save.list = function () {
    const st = Save.storage();
    if (!st) return [];
    try { return JSON.parse(st.getItem('ws.index') || '[]'); } catch (e) { return []; }
  };
  const writeIndex = (idx) => { const st = Save.storage(); if (st) st.setItem('ws.index', JSON.stringify(idx)); };
  Save.isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || /quota|exceed|空間/i.test(String(e.message || e)));
  Save.mb = (bytes) => (!bytes ? '0 KB' : bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
  // JSON 字串的大致位元組數（中文字在瀏覽器儲存中約佔 2–3 位元組；這裡用字元數 × 1，介面只當參考）
  Save.sizeOf = (str) => (str ? str.length : 0);

  // ---------- 儲存後端 ----------
  // 統一成 Promise 介面：get(key) / set(key, value) / del(key)
  function localKV() {
    const st = Save.storage();
    if (!st) return null;
    return {
      name: 'local',
      get: (k) => Promise.resolve(st.getItem(k)),
      set: (k, v) => new Promise((ok, bad) => { try { st.setItem(k, v); ok(); } catch (e) { bad(e); } }),
      del: (k) => { try { st.removeItem(k); } catch (e) { /* 略過 */ } return Promise.resolve(); }
    };
  }
  let idbPromise = null;
  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((ok) => {
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) return ok(null);
        const rq = indexedDB.open('genesis-world', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('saves');
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => ok(null);
        rq.onblocked = () => ok(null);
      } catch (e) { ok(null); }
    });
    return idbPromise;
  }
  function idbKV(db) {
    const run = (mode, fn) => new Promise((ok, bad) => {
      try {
        const tx = db.transaction('saves', mode);
        const rq = fn(tx.objectStore('saves'));
        tx.oncomplete = () => ok(rq && rq.result);
        tx.onerror = () => bad(tx.error || (rq && rq.error));
        tx.onabort = () => bad(tx.error || new Error('QuotaExceededError'));
      } catch (e) { bad(e); }
    });
    return {
      name: 'idb',
      get: (k) => run('readonly', (s) => s.get(k)).then((v) => (v == null ? null : v)),
      set: (k, v) => run('readwrite', (s) => s.put(v, k)),
      del: (k) => run('readwrite', (s) => s.delete(k))
    };
  }
  Save.useIDB = true;   // 測試可以關掉
  let kvPromise = null;
  Save.kv = function () {
    if (kvPromise) return kvPromise;
    kvPromise = (Save.useIDB ? openIDB() : Promise.resolve(null)).then((db) => (db ? idbKV(db) : localKV()));
    return kvPromise;
  };
  Save.reset = function () { kvPromise = null; idbPromise = null; };   // 測試用
  // 舊版存檔放在 localStorage：搬到 IndexedDB 並從 localStorage 刪除（騰出空間）
  Save.init = function () {
    return Save.kv().then((kv) => {
      if (!kv || kv.name !== 'idb') return kv ? kv.name : 'none';
      const st = Save.storage();
      if (!st) return kv.name;
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && (k.indexOf('ws.save.') === 0 || k === 'ws.autosave')) keys.push(k); }
      return keys.reduce((p, k) => p.then(() => {
        const v = st.getItem(k);
        if (v == null) return;
        return kv.set(k, v).then(() => {
          st.removeItem(k);
          if (k === 'ws.autosave' && !st.getItem('ws.autosave.meta')) st.setItem('ws.autosave.meta', JSON.stringify({ bytes: v.length, saved: null }));
        }).catch(() => { /* 搬不動就留在原處 */ });
      }), Promise.resolve()).then(() => kv.name);
    });
  };

  // ---------- 精簡版 ----------
  // 只保留最近幾年的因果帳與決策紀錄，並把「只用來顯示」的紀錄（因果帳、歷史數列）四捨五入到 4 位有效數字。
  // 引擎推進只讀世界狀態本身，不讀這些紀錄，所以之後的模擬結果不變；只是更早年份的「?」追查會比較簡略。
  Save.compactYears = 5;
  const r4 = (x) => (typeof x === 'number' && isFinite(x) && x !== 0 ? +x.toPrecision(4) : x);
  const roundDeep = (o) => {
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = typeof o[i] === 'number' ? r4(o[i]) : (o[i] && typeof o[i] === 'object' ? roundDeep(o[i]) : o[i]); return o; }
    if (o && typeof o === 'object') for (const k in o) o[k] = typeof o[k] === 'number' ? r4(o[k]) : (o[k] && typeof o[k] === 'object' ? roundDeep(o[k]) : o[k]);
    return o;
  };
  Save.compact = function (w) {
    const out = JSON.parse(JSON.stringify(w));
    for (const id in out.countries) {
      const c = out.countries[id];
      if (c.causes && c.causes.years) c.causes.years = roundDeep(c.causes.years.slice(-Save.compactYears));
      if (c.decisions) c.decisions = c.decisions.slice(-20);
    }
    if (out.era !== 'ancient' && out.series) roundDeep(out.series);
    out.compacted = { year: w.year, keepYears: Save.compactYears };
    return out;
  };

  // 寫入：完整版 →（空間不足）清掉最舊的自動保存再試 → 精簡版
  function putWithFallback(kv, key, json, protectId) {
    const pruned = [];
    const tryFull = () => kv.set(key, json).then(() => ({ how: 'full', bytes: json.length }));
    const pruneOne = () => {
      const idx = Save.list();
      const old = idx.filter((m) => m.auto && m.id !== protectId).pop();
      if (!old) return Promise.resolve(false);
      return kv.del('ws.save.' + old.id).then(() => { writeIndex(Save.list().filter((m) => m.id !== old.id)); pruned.push(old.name); return true; });
    };
    const loop = (attempt) => attempt().catch((e) => {
      if (!Save.isQuota(e)) throw e;
      return pruneOne().then((did) => { if (!did) throw e; return loop(attempt); });
    });
    return tryFull().catch((e) => {
      if (!Save.isQuota(e)) throw e;
      return kv.del(key).then(() => loop(tryFull));   // 先騰出舊版本的位置
    }).catch((e) => {
      if (!Save.isQuota(e)) throw e;
      const small = JSON.stringify(Save.compact(JSON.parse(json)));
      return loop(() => kv.set(key, small).then(() => ({ how: 'compact', bytes: small.length })));
    }).then((r) => Object.assign(r, { pruned }));
  }
  const failText = (bytes, e) => `儲存空間不足：這個世界約 ${Save.mb(bytes)}，瀏覽器的空間已經用完。請到「系統」頁刪除不需要的存檔，或按「匯出 JSON」把世界存成檔案保存到你的裝置。` + (e && e.message && !Save.isQuota(e) ? `（${e.message}）` : '');

  // 存檔：回傳 Promise { ok, meta, compact, bytes, pruned, reason }
  // opts.auto：系統自動保存（例如進入新分支前保存原世界線），超過 keepAuto 個時最舊的會被清掉
  let saveSeq = 0;
  Save.write = function (w, slotName, opts) {
    opts = opts || {};
    const json = JSON.stringify(w);
    return Save.kv().then((kv) => {
      if (!kv) return { ok: false, reason: '此環境無法使用瀏覽器儲存，請改用「匯出 JSON」' };
      const id = 'S' + Date.now().toString(36) + (++saveSeq).toString(36);   // 存檔編號（不影響模擬）
      const meta = { id, name: slotName || w.name, branch: w.branch.name, branchId: w.branch.id, parent: w.branch.parent, year: w.year, month: w.month, mode: w.mode, focus: w.focus, era: w.era || 'modern', saved: new Date().toISOString(), world_id: w.world_id };
      if (opts.auto) meta.auto = true;
      return putWithFallback(kv, 'ws.save.' + id, json, id).then((r) => {
        meta.bytes = r.bytes;
        if (r.how === 'compact') meta.compact = true;
        const idx = Save.list();
        idx.unshift(meta);
        // 自動保存只留最近幾個
        let n = 0; const drop = [];
        for (const m of idx) if (m.auto && ++n > Save.keepAuto) drop.push(m);
        writeIndex(idx.filter((m) => !drop.includes(m)));
        return Promise.all(drop.map((m) => kv.del('ws.save.' + m.id))).then(() => ({ ok: true, meta, compact: r.how === 'compact', bytes: r.bytes, pruned: r.pruned.concat(drop.map((m) => m.name)) }));
      }).catch((e) => ({ ok: false, reason: failText(json.length, e), bytes: json.length }));
    });
  };
  Save.read = function (id) {
    return Save.kv().then((kv) => (kv ? kv.get('ws.save.' + id) : null)).then((raw) => {
      if (raw == null) { const st = Save.storage(); raw = st && st.getItem('ws.save.' + id); }   // 還沒搬走的舊存檔
      return raw ? Save.migrate(raw) : null;
    });
  };
  Save.remove = function (id) {
    writeIndex(Save.list().filter((m) => m.id !== id));
    const st = Save.storage();
    try { if (st) st.removeItem('ws.save.' + id); } catch (e) { /* 略過 */ }
    return Save.kv().then((kv) => (kv ? kv.del('ws.save.' + id) : null));
  };
  // 一次清掉全部自動保存（玩家手動存的不動）
  Save.clearAuto = function () {
    const drop = Save.list().filter((m) => m.auto);
    return Promise.all(drop.map((m) => Save.remove(m.id))).then(() => drop.length);
  };

  // ---------- 自動存檔（「繼續遊戲」） ----------
  // 每次推進後呼叫；正在寫入時只記住最新的一份，寫完再補寫，不會堆積。
  let autoBusy = false, autoNext = null;
  Save.autoMeta = function () {
    const st = Save.storage();
    if (!st) return null;
    try { const m = st.getItem('ws.autosave.meta'); if (m) return JSON.parse(m); } catch (e) { /* 略過 */ }
    return st.getItem('ws.autosave') ? { bytes: (st.getItem('ws.autosave') || '').length } : null;
  };
  Save.hasAutosave = () => !!Save.autoMeta();
  Save.lastAuto = null;   // 最近一次自動存檔的結果（介面顯示用）
  Save.autosave = function (w) {
    if (!w) return Promise.resolve();
    const job = { json: JSON.stringify(w), meta: { year: w.year, month: w.month, name: w.name, branch: w.branch && w.branch.name, era: w.era || 'modern' } };
    if (autoBusy) { autoNext = job; return Promise.resolve({ queued: true }); }
    const run = (j) => {
      autoBusy = true;
      return Save.kv().then((kv) => {
        if (!kv) return { ok: false };
        return putWithFallback(kv, 'ws.autosave', j.json, null).then((r) => {
          const st = Save.storage();
          const meta = Object.assign(j.meta, { bytes: r.bytes, compact: r.how === 'compact', saved: new Date().toISOString() });
          try { if (st) st.setItem('ws.autosave.meta', JSON.stringify(meta)); } catch (e) { /* 略過 */ }
          return { ok: true, compact: r.how === 'compact', bytes: r.bytes, pruned: r.pruned };
        });
      }).catch((e) => ({ ok: false, reason: failText(j.json.length, e) })).then((res) => {
        Save.lastAuto = Object.assign({ at: Date.now() }, res);
        autoBusy = false;
        if (autoNext) { const n = autoNext; autoNext = null; return run(n); }
        return res;
      });
    };
    return run(job);
  };
  Save.readAutosave = function () {
    return Save.kv().then((kv) => (kv ? kv.get('ws.autosave') : null)).then((raw) => {
      if (raw == null) { const st = Save.storage(); raw = st && st.getItem('ws.autosave'); }
      return raw ? Save.migrate(raw) : null;
    });
  };

  // ---------- 空間使用 ----------
  // 回傳 Promise { backend, saves, auto, total, quota, used }（位元組）；quota/used 來自瀏覽器估計，可能沒有
  Save.usage = function () {
    const idx = Save.list();
    const sum = (f) => idx.filter(f).reduce((s, m) => s + (m.bytes || 0), 0);
    const am = Save.autoMeta();
    const base = { saves: sum((m) => !m.auto), autoSaves: sum((m) => m.auto), autosave: am ? am.bytes || 0 : 0, count: idx.length, autoCount: idx.filter((m) => m.auto).length };
    base.total = base.saves + base.autoSaves + base.autosave;
    return Save.kv().then((kv) => {
      base.backend = kv ? kv.name : 'none';
      // localStorage 一般約 5 MB（以字元計）；IndexedDB 用瀏覽器的估計
      if (base.backend === 'local') { base.quota = 5 * 1024 * 1024; base.used = base.total; return base; }
      try {
        if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
          return navigator.storage.estimate().then((e) => Object.assign(base, { quota: e.quota, used: e.usage })).catch(() => base);
        }
      } catch (e) { /* 略過 */ }
      return base;
    });
  };

  // ---- 分支 ----
  const Branch = (WS.Branch = {});
  // 從一個世界狀態（目前或歷史快照）建立獨立分支：深拷貝，不共用任何可變狀態
  Branch.create = function (fromWorld, name, reason, reseed) {
    const w = JSON.parse(JSON.stringify(fromWorld));
    const pid = fromWorld.branch.id;
    w.branch = {
      id: 'B' + WS.hashSeed(pid + name + fromWorld.tick + reason).toString(36),
      name: name || '新分支', parent: pid, parentName: fromWorld.branch.name,
      createdTick: w.tick, divergeYear: w.year, divergeMonth: w.month, reason: reason || '玩家建立分支'
    };
    if (reseed) { w.seed = w.seed + '/' + reseed; w.rngState = WS.hashSeed(w.seed + w.tick); }
    WS.Events.log(w, null, { type: 'branch', title: `世界線分歧：${w.branch.name}`, countries: [], level: 3, causes: [w.branch.reason], text: `由「${w.branch.parentName}」在 ${w.year} 年 ${w.month} 月分出。` });
    return w;
  };
})(typeof window !== 'undefined' ? window : globalThis);
