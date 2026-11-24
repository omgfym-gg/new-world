// 遊戲公告與玩家意見箱（只跟介面有關：不讀寫任何模擬數值、不寫進 commandLog）
//
// 公告：第一次打開遊戲時自動出現「遊戲介紹」，之後可從開始畫面或「系統」頁再打開。
//   想讓所有玩家再看到一次（例如有新消息）：在 NEWS 最上面加一則，並把 ID 改成新的日期。
// 意見箱：玩家填寫的內容送到小黑的 Google 表單（玩家不用登入）。
//   表單只有一題「意見」（段落）：類型、內容、聯絡方式、遊戲資訊組成一段文字送進那一格。
//   表單網址與那一格的代號設定在下面的 FORM；沒設定時意見箱顯示「尚未開放」。
// 支持作者：贊助連結（小黑自己的帳號），設定在下面的 Support.LINKS；都沒填網址時不顯示按鈕。
(function (root) {
  const WS = (root.WS = root.WS || {});

  // ---------------- 公告 ----------------
  const N = (WS.Notice = {});
  N.ID = '2026-11-23'; // 公告版本：改成新的值，所有玩家下次打開遊戲會再看到一次
  // 最新消息（新的寫在最上面；文字一樣寫中文，再補翻譯字典）
  N.NEWS = [
    { date: '2026-11-23', text: '新增遊戲介紹與意見回饋：遇到問題或有建議，可以直接在遊戲裡告訴我們。' },
    { date: '2026-11-22', text: '支援 17 種語言，會依你裝置的語言自動切換。' },
    { date: '2026-11-18', text: '新增未來時代與世界結局：世界會一路演進到文明崩潰或走向星際。' }
  ];
  const SEEN_KEY = 'ws.noticeSeen';
  // 瀏覽器不讓網頁存資料時（例如 itch.io 這類嵌在別人網頁裡、又封鎖第三方資料的手機瀏覽器），
  // 讀取會出錯：這時改記在這次開啟期間，至少每次打開遊戲都會看到一次介紹，不會從來看不到。
  let seenNow = false;
  N.seen = function () {
    if (seenNow) return true;
    try { return !!root.localStorage && root.localStorage.getItem(SEEN_KEY) === N.ID; } catch (e) { return false; }
  };
  N.markSeen = function () { seenNow = true; try { if (root.localStorage) root.localStorage.setItem(SEEN_KEY, N.ID); } catch (e) { /* 只在這次有效 */ } };

  // ---------------- 意見箱 ----------------
  const F = (WS.Feedback = {});
  // 小黑的 Google 表單（「取得預先填入的連結」裡的網址與 entry 代號）
  F.FORM = {
    // 小黑的「創 世界 玩家意見」表單（2026-11-23 建立；回覆在表單的「回覆」分頁）
    url: 'https://docs.google.com/forms/d/e/1FAIpQLScA5_i93MVkOibENrabbGUtlpvTu0OjgT-E16vf2dMkFo8ghA/formResponse',
    entry: 'entry.212002591' // 唯一一題「意見」的代號
  };
  // 類型：送出時用中文原文，小黑收到的都是中文
  F.TYPES = [['bug', '遇到問題'], ['idea', '建議'], ['question', '疑問'], ['other', '其他']];
  F.MAX = 3000; // 內容字數上限
  F.ready = function () { return !!(F.FORM.url && F.FORM.entry); };

  // 自動附上的遊戲資訊（幫助找出問題；不含個人資料）
  F.info = function (w, extra) {
    const out = [];
    const vm = root.document && root.document.querySelector && root.document.querySelector('meta[name="ws-version"]');
    if (vm) out.push('遊戲版本 ' + vm.getAttribute('content'));
    if (WS.I18n) out.push('語言 ' + WS.I18n.lang);
    if (w) {
      out.push('劇本 ' + (w.scenario || '?'));
      out.push('年份 ' + w.year + (w.month ? '.' + w.month : ''));
      out.push('種子 ' + w.seed);
      out.push('模式 ' + (w.mode || ''));
      if (w.future && w.future.ended) out.push('已結局');
    } else out.push('畫面 開始畫面');
    if (extra) out.push(extra);
    const nav = root.navigator;
    if (nav && nav.userAgent) out.push('裝置 ' + String(nav.userAgent).slice(0, 160));
    if (root.screen && root.screen.width) out.push('螢幕 ' + root.screen.width + 'x' + root.screen.height);
    return out.join('｜');
  };

  // 整理玩家填寫的內容；回傳 { ok, reason, data }
  F.build = function (input) {
    const type = F.TYPES.find((t) => t[0] === input.type) || F.TYPES[0];
    const text = String(input.text || '').trim().slice(0, F.MAX);
    if (text.length < 2) return { ok: false, reason: '請先寫下你遇到的問題或建議。' };
    return { ok: true, data: { type: type[1], text, contact: String(input.contact || '').trim().slice(0, 200), info: String(input.info || '') } };
  };
  // 組成一段文字（小黑在表單「回覆」看到的就是這段）
  F.compose = function (d) { return `【${d.type}】\n${d.text}\n\n聯絡方式：${d.contact || '（未填）'}\n遊戲資訊：${d.info}`; };

  // 送出到 Google 表單。Google 不允許網頁讀取回應（no-cors），所以只能確認「有送出去」；
  // 沒網路時 fetch 會失敗，畫面會保留玩家寫的內容，請玩家連上網路再送。
  F.send = function (d, fetchFn) {
    fetchFn = fetchFn || root.fetch;
    if (!F.ready()) return Promise.resolve({ ok: false, reason: 'not-ready' });
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'offline' });
    const body = new URLSearchParams();
    body.append(F.FORM.entry, F.compose(d));
    return fetchFn(F.FORM.url, { method: 'POST', mode: 'no-cors', body })
      .then(() => ({ ok: true }), () => ({ ok: false, reason: 'offline' }));
  };

  // ---------------- 支持作者 ----------------
  // 只是打開外部贊助頁面（新分頁），遊戲不經手任何付款資料，也不記錄誰有贊助。
  const P = (WS.Support = {});
  P.LINKS = [
    // 台灣玩家：新台幣付款
    { id: 'portaly', name: 'Portaly', url: 'https://portaly.cc/omgfym/support', note: '適合台灣玩家（新台幣付款）' },
    // 國外玩家：信用卡、PayPal（2026-11-24 已接上 PayPal）
    { id: 'kofi', name: 'Ko-fi', url: 'https://ko-fi.com/genesisworld', note: '適合國外玩家（信用卡、PayPal）' }
  ];
  // 只接受 https 網址，避免填錯時變成可執行的連結
  P.links = function () { return P.LINKS.filter((l) => /^https:\/\/[^\s"'<>]+$/.test(l.url || '')); };
  P.ready = function () { return P.links().length > 0; };
})(typeof window !== 'undefined' ? window : globalThis);
