// 史實政策重播清單（回測用）
// 「史實政策重播」模式會在這些時間點，經由 WorldEngine.applyPolicy 執行對應政策（寫入 commandLog）。
// 其餘時間各國仍由 AI 自行決策。只挑影響大的政策，用遊戲中現有的 17 項政策近似，不是完整政策史。
// 政策若被引擎拒絕（條件不符），回測報表會列出來，不會強制執行。
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.Data = WS.Data || {};
  WS.Data.historyPolicies = WS.Data.historyPolicies || {};

  const P = (y, country, policy, note) => ({ y, m: 1, country, policy, note });

  WS.Data.historyPolicies['1911'] = [
    // 第一次世界大戰前的軍備競賽
    P(1912, 'DEU', 'military_build', '德國陸軍擴編法案'),
    P(1913, 'FRA', 'military_build', '法國三年兵役法'),
    P(1913, 'RUS', 'military_build', '俄國「大計畫」擴軍'),
    P(1912, 'GBR', 'military_build', '英德海軍競賽'),
    // 戰後裁軍
    P(1919, 'USA', 'demobilize', '一戰後復員'),
    P(1920, 'GBR', 'demobilize', '一戰後復員、十年規則'),
    P(1922, 'JPN', 'demobilize', '華盛頓海軍條約後裁軍'),
    // 1920–30 年代
    P(1925, 'JPN', 'political_reform', '普通選舉法'),
    P(1928, 'RUS', 'industrialize', '蘇聯第一個五年計畫'),
    P(1929, 'RUS', 'centralize', '農業集體化與中央計畫'),
    P(1931, 'JPN', 'military_build', '九一八事變後擴軍'),
    P(1933, 'USA', 'welfare', '羅斯福新政'),
    P(1934, 'DEU', 'military_build', '納粹德國重整軍備'),
    P(1935, 'USA', 'welfare', '社會安全法'),
    P(1936, 'GBR', 'military_build', '英國重整軍備'),
    P(1938, 'FRA', 'military_build', '法國重整軍備'),
    // 第二次世界大戰後
    P(1946, 'USA', 'demobilize', '二戰後復員'),
    P(1946, 'JPN', 'demobilize', '日本解除武裝'),
    P(1946, 'JPN', 'political_reform', '日本國憲法'),
    P(1946, 'GBR', 'welfare', '英國福利國家（NHS）'),
    P(1946, 'FRA', 'welfare', '法國社會安全制度'),
    P(1947, 'FRA', 'industrialize', '莫內計畫'),
    P(1949, 'DEU', 'political_reform', '西德基本法'),
    P(1949, 'DEU', 'demobilize', '戰後德國解除武裝'),
    P(1953, 'CHN', 'industrialize', '中國第一個五年計畫'),
    P(1955, 'JPN', 'industrialize', '日本高度成長期'),
    P(1958, 'USA', 'research', '國防教育法、NASA'),
    P(1958, 'USA', 'education', '國防教育法'),
    P(1960, 'JPN', 'education', '國民所得倍增計畫'),
    P(1965, 'USA', 'welfare', '聯邦醫療保險、大社會計畫'),
    P(1966, 'FRA', 'research', '法國核能與科研計畫'),
    // 1970 年代以後
    P(1974, 'JPN', 'research', '石油危機後的節能與技術政策'),
    P(1979, 'CHN', 'agri_invest', '家庭聯產承包責任制'),
    P(1980, 'CHN', 'industrialize', '改革開放、經濟特區'),
    P(1979, 'GBR', 'austerity', '柴契爾財政緊縮'),
    P(1981, 'USA', 'cut_tax', '雷根減稅'),
    P(1986, 'USA', 'military_build', '雷根擴軍'),
    P(1990, 'RUS', 'political_reform', '蘇聯解體前後的政治改革'),
    P(1991, 'RUS', 'demobilize', '冷戰結束後裁軍'),
    P(1999, 'CHN', 'education', '高等教育擴招'),
    P(2001, 'CHN', 'industrialize', '加入世界貿易組織')
  ];
})(typeof window !== 'undefined' ? window : globalThis);
