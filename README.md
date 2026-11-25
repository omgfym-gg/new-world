# 維度世界（Dimension Earth）：第一版原型（V1.1 簡易模式優先）

純 HTML／CSS／JavaScript，不需要伺服器、不需要網路、不呼叫外部 AI。
直接用瀏覽器打開 `index.html` 就能玩（手機、電腦皆可）。

## 怎麼玩

1. 開始新世界 → 國家模式或全球模式 → 簡易設定 → 確認並開始。
2. 用「＋一年／＋十年／＋百年」或「自動」推進時間。
3. 「偶爾決策」模式下，重大事件會暫停，讓你介入或交由系統處理。
4. 任何數字旁的 **?** 按鈕可以查「為什麼會這樣」，並一路追蹤更深層的原因。
5. 「歷史」頁可以建立分支、回溯到過去、比較兩條世界線。
6. **如果？**：事件旁邊的「如果？」按鈕會從事件之前的快照，用同一個種子、同樣的玩家決策重跑到現在，
   只改寫那一件事（例如「如果中國革命失敗」「如果俄國沒有向中國宣戰」），再並排比較兩個世界：
   人口、GDP、制度、戰爭差距，蝴蝶效應擴散鏈（每一步都附上紀錄中的原因），以及因果帳上的差距來源。
   可以留在原世界、在圖表上對照，或直接進入平行世界繼續玩。
7. **此刻的生活**：點地球上的地區或國家，地區頁最上方會畫出當地人正在做什麼（打獵、種田、城市、工廠、打仗、饑荒……），依模擬數據畫的動畫。
8. **未來與世界結局**：世界會一路跑過現在，出現 AI、核融合、火星殖民等未來科技，也有暖化、核戰、AI 失控、人造瘟疫、小行星等風險。世界終結時會給一份結局報告，還能重跑「沒有你介入的世界」比較。

9. **語言**：自動依裝置語言顯示，共 17 種：繁體中文、English、日本語、简体中文、한국어、Español、Français、Deutsch、Português、Italiano、Русский、Türkçe、العربية、हिन्दी、Bahasa Indonesia、Tiếng Việt、ไทย；開始畫面下方與「系統」頁可以切換。

起點：在「開始新世界」或「自訂世界」的「起始年份」選擇 1911 年（8 個列強或全世界 51 國）或遠古（西元前 10,000 年）；開始畫面也有「遠古世界」快速入口。不論從哪個起點開始，世界都會一路跑到未來與結局，不限年份。

## 檔案結構

```
index.html / styles.css / app.js   介面（只讀取狀態、呼叫引擎指令）
ui/globe.js、ui/earth-dots.js        會轉的全息地球（只畫圖，不參與模擬）
ui/territory.js、ui/warcam.js      國土示意範圍、戰場即時畫面（只畫圖）
ui/scenecam.js                     其他事件畫面（只畫圖）
ui/lifecam.js                      地區生活畫面：點地區看當地人正在做什麼（只畫圖）
i18n/                              多國語言（畫面文字翻譯；引擎與存檔一律是繁體中文原文）
engine/
  rng.js                 種子亂數（可重現）
  params.js              ★ 所有模型係數（待校準的示意值，集中在這裡）
  state-engine.js        世界狀態、因果紀錄、動態建立新國家／組織／制度
  population-engine.js   人口（四個年齡層、出生、死亡、老化、遷移、教育、醫療）
  environment-engine.js  糧食、能源（煤／石油儲量）、污染、資源共享
  economy-engine.js      三部門生產函數 Y = A·L^α·K^β·技術·資源·制度、財政、通膨
  politics-engine.js     穩定、合法性、支持、衝突、腐敗、行政、地方勢力、軍隊忠誠
  technology-engine.js   研究、前置條件、五階段、普及、擴散
  diplomacy-engine.js    雙邊關係、記憶、貿易、同盟、國際組織自動成立／解散
  military-engine.js     軍事能力、動員、戰爭消耗、傷亡、停戰、割地
  future-engine.js       未來時代：氣候、核武、AI、生物科技、小行星、火星、世界結局
  world-engine.js        主流程（每月 15 步固定順序）與所有引擎指令
systems/
  policy-system.js       19 項政策（AI 與玩家共用，必須通過引擎檢查）
  agent-system.js        國家自主決策（問題評分 → 候選政策 → 依目標選擇 → 保存原因）
  event-system.js        固定歷史事件（有條件）、條件事件、新國家、新制度
  rule-system.js         世界規則、衝突檢查、自然語言轉規則、制度轉換
  history-system.js      年度數列、年度敘述（模板）、數值驗證
  explain-system.js      世界解釋系統（只根據實際紀錄回答「為什麼」）
  save-system.js         本地存檔、JSON 匯出入、版本轉換、分支
  whatif-system.js       「如果」平行世界：可改寫的事件、重跑、比較報告與擴散鏈
  divine-system.js       神之手：神力、4 種干預（改變條件，結果由引擎計算）
  headline-system.js     世界頭條：依事件紀錄與因果帳挑出每年最多 3 則重大變化
data/
  scenario-1911.js       1911 年 8 國起點資料（人口、GDP 參考 Maddison，其餘為 D 級初始值）
  scenario-1911-world.js 1911 全世界起點（51 國，含殖民地與自治領；起始年份選單選「51 國」）
  definitions.js         科技樹、制度、世界規則、規則衝突、自然語言關鍵字
tests/
  run-tests.js           136 項自動測試：node tests/run-tests.js
tools/backtest.js        歷史回測：node tools/backtest.js → reports/backtest-1911.md
tools/health-check.js    合理範圍健康檢查：node tools/health-check.js [種子數] [劇本] → reports/health-<劇本>.md
data/history-reference.js、data/history-policies-1911.js、systems/backtest-system.js   回測用（只在 Node 載入）
docs/ancient-era.md      遠古時代設計文件（第一版已實作）
data/ancient.js、engine/ancient-engine.js   遠古時代（西元前 10,000 年起；開始畫面「遠古世界」）
engine/era-bridge.js     從遠古接到近代（1800 年以後，政體 → 近代國家）
```

## 已知限制（下一步校準重點）

- 所有係數都是示意值，尚未校準。歷史回測（`node tools/backtest.js`）顯示 1911–2008 年各國人口、GDP 都明顯偏離史實，主因是死亡率與生育率轉型太慢、跨國遷移太強、戰後缺少追趕式成長，詳見 `reports/backtest-1911.md`。
- 只有 1911 年一個起點，分 8 國版與全世界 51 國版；地區只用於割地與分裂。
- 年度敘述用文字模板，不是 AI。
- 歷史回溯快照只保存在本次開啟期間（每 5 年一次）；要長期保留請用存檔。
- 「如果」重跑需要事件之前的快照；沒有快照時（例如載入存檔後）會用世界建立時的設定與完整指令紀錄重新生成。
  這個功能加入之前的舊存檔沒有建立設定，只能改寫載入之後發生的事件。
- 目前可改寫的事件：固定歷史事件（阻止／強制發生）、條件事件（阻止；革命可翻轉成敗）、宣戰（阻止）。
  阻止條件事件後，該事件進入冷卻期，之後仍依條件判斷是否再次發生。
