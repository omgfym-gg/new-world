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
    w.params = Object.assign(JSON.parse(JSON.stringify(WS.DEFAULT_PARAMS)), w.params || {});
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

  // 本地存檔（localStorage）。存檔索引與內容分開存放。
  Save.storage = function () {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { /* 無法使用 */ }
    return null;
  };
  Save.list = function () {
    const st = Save.storage();
    if (!st) return [];
    try { return JSON.parse(st.getItem('ws.index') || '[]'); } catch (e) { return []; }
  };
  // 國家多時存檔會變大（主要是每國 30 年的因果帳）。瀏覽器空間不足時，改存「精簡版」：
  // 只保留最近幾年的因果帳與決策紀錄，其餘世界狀態完全相同，所以之後的模擬結果不變；只是更早年份的「?」追查會比較簡略。
  Save.compactYears = 5;
  Save.compact = function (w) {
    const out = JSON.parse(JSON.stringify(w));
    for (const id in out.countries) {
      const c = out.countries[id];
      if (c.causes && c.causes.years) c.causes.years = c.causes.years.slice(-Save.compactYears);
      if (c.decisions) c.decisions = c.decisions.slice(-20);
    }
    out.compacted = { year: w.year, keepYears: Save.compactYears };
    return out;
  };
  // 先存完整版，空間不足再存精簡版
  Save.put = function (st, key, w) {
    try { st.setItem(key, JSON.stringify(w)); return 'full'; } catch (e) { /* 空間不足 */ }
    st.removeItem(key);
    st.setItem(key, JSON.stringify(Save.compact(w)));
    return 'compact';
  };

  Save.write = function (w, slotName) {
    const st = Save.storage();
    if (!st) return { ok: false, reason: '此環境無法使用瀏覽器儲存' };
    const id = 'S' + Date.now().toString(36);
    const meta = { id, name: slotName || w.name, branch: w.branch.name, branchId: w.branch.id, parent: w.branch.parent, year: w.year, month: w.month, mode: w.mode, focus: w.focus, saved: new Date().toISOString(), world_id: w.world_id };
    try {
      const how = Save.put(st, 'ws.save.' + id, w);
      if (how === 'compact') meta.compact = true;
      const idx = Save.list();
      idx.unshift(meta);
      st.setItem('ws.index', JSON.stringify(idx));
      return { ok: true, meta, compact: how === 'compact' };
    } catch (e) {
      return { ok: false, reason: '儲存空間不足，請刪除舊存檔或匯出 JSON（' + e.message + '）' };
    }
  };
  Save.read = function (id) {
    const st = Save.storage();
    const raw = st && st.getItem('ws.save.' + id);
    return raw ? Save.migrate(raw) : null;
  };
  Save.remove = function (id) {
    const st = Save.storage();
    if (!st) return;
    st.removeItem('ws.save.' + id);
    st.setItem('ws.index', JSON.stringify(Save.list().filter((m) => m.id !== id)));
  };
  Save.autosave = function (w) {
    const st = Save.storage();
    if (!st) return;
    try { Save.put(st, 'ws.autosave', w); } catch (e) { /* 空間不足時略過自動存檔 */ }
  };
  Save.readAutosave = function () {
    const st = Save.storage();
    const raw = st && st.getItem('ws.autosave');
    return raw ? Save.migrate(raw) : null;
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
