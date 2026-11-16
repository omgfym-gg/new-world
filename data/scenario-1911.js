// 1911 年世界起點資料（第一版）
// 人口與 GDP 以 Maddison Project（1913 年值回推）為主要參考，單位：人口＝百萬人；GDP＝十億 1990 年國際元。
// 其餘政治、社會指數為模擬初始值（可信度 D），之後需逐項補上來源。
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.Data = WS.Data || {};

  const SRC_M = { source: 'Maddison Project Database（1913 年值回推估算）', grade: 'B', estimated: true };
  const SRC_D = { source: '模擬初始值', grade: 'D', estimated: true };

  WS.Data.scenarios = WS.Data.scenarios || {};
  WS.Data.scenarios['1911'] = {
    id: '1911',
    name: '帝國的轉折：1911',
    startYear: 1911,
    startMonth: 1,
    provenance: { population: SRC_M, gdp: SRC_M, indices: SRC_D },
    countries: [
      {
        id: 'CHN', name: '中國', color: '#e5484d', lat: 34, lon: 108,
        regime: 'monarchy', regimeLabel: '大清（君主專制）',
        leader: { name: '載灃（攝政王）', comp: 0.35, aggr: 0.3, reform: 0.35 },
        leaderPool: [
          { name: '袁世凱', comp: 0.7, aggr: 0.5, reform: 0.4 },
          { name: '孫文', comp: 0.5, aggr: 0.3, reform: 0.9 },
          { name: '黎元洪', comp: 0.4, aggr: 0.3, reform: 0.5 },
          { name: '段祺瑞', comp: 0.55, aggr: 0.65, reform: 0.3 },
          { name: '徐世昌', comp: 0.45, aggr: 0.2, reform: 0.4 },
          { name: '蔣中正', comp: 0.6, aggr: 0.55, reform: 0.4 },
          { name: '汪兆銘', comp: 0.45, aggr: 0.3, reform: 0.6 }
        ],
        pop: 430, ages: [0.36, 0.18, 0.41, 0.05], cbr: 0.041, cdr: 0.030,
        gdp: 235, sectorShare: [0.65, 0.10, 0.25], labourShare: [0.80, 0.08, 0.12],
        urban: 0.06, edu: 10, health: 0.15,
        taxRate: 0.04, debtRatio: 0.15, savings: 0.05, openness: 0.3,
        budget: { military: 0.38, education: 0.06, research: 0.01, welfare: 0.08, infrastructure: 0.17, admin: 0.30 },
        pol: { stability: 34, legitimacy: 25, support: 30, admin: 30, corruption: 70, conflict: 55, armyLoyalty: 40, localPower: 65, inequality: 50 },
        mil: { personnel: 0.9, training: 35, equipment: 0.25 },
        foodRatio: 1.04, foodStock: 2, energySelf: 1.0, coal: 600, oil: 20,
        goal: 'stabilize',
        techs: { railway: 0.1, sanitation: 0.05, machinegun: 0.2 },
        regions: ['華北', '華中', '華南', '東北', '西部']
      },
      {
        id: 'JPN', name: '日本', color: '#f5f5f5', lat: 36, lon: 138,
        regime: 'constitutional', regimeLabel: '大日本帝國（君主立憲）',
        leader: { name: '西園寺公望', comp: 0.6, aggr: 0.4, reform: 0.55 },
        leaderPool: [
          { name: '桂太郎', comp: 0.6, aggr: 0.6, reform: 0.3 },
          { name: '山本權兵衛', comp: 0.6, aggr: 0.55, reform: 0.4 },
          { name: '大隈重信', comp: 0.55, aggr: 0.6, reform: 0.5 },
          { name: '原敬', comp: 0.65, aggr: 0.4, reform: 0.6 },
          { name: '加藤高明', comp: 0.6, aggr: 0.4, reform: 0.6 }
        ],
        pop: 51, ages: [0.34, 0.2, 0.41, 0.05], cbr: 0.034, cdr: 0.021,
        gdp: 70, sectorShare: [0.35, 0.25, 0.40], labourShare: [0.62, 0.16, 0.22],
        urban: 0.18, edu: 60, health: 0.35,
        taxRate: 0.12, debtRatio: 0.6, savings: 0.12, openness: 0.5,
        budget: { military: 0.42, education: 0.1, research: 0.03, welfare: 0.05, infrastructure: 0.25, admin: 0.15 },
        pol: { stability: 65, legitimacy: 70, support: 55, admin: 70, corruption: 30, conflict: 30, armyLoyalty: 80, localPower: 20, inequality: 50 },
        mil: { personnel: 0.27, training: 70, equipment: 0.55 },
        foodRatio: 0.97, foodStock: 3, energySelf: 0.9, coal: 60, oil: 2,
        goal: 'expand',
        techs: { railway: 0.5, electrification: 0.1, sanitation: 0.4, machinegun: 0.7, radio: 0.05 },
        regions: ['本州', '九州四國', '北海道', '朝鮮', '台灣']
      },
      {
        id: 'USA', name: '美國', color: '#3e63dd', lat: 39, lon: -98,
        regime: 'republic', regimeLabel: '美利堅合眾國（共和民主）',
        leader: { name: '塔虎脫', comp: 0.5, aggr: 0.3, reform: 0.45 },
        leaderPool: [
          { name: '威爾遜', comp: 0.6, aggr: 0.35, reform: 0.7 },
          { name: '哈定', comp: 0.35, aggr: 0.2, reform: 0.3 },
          { name: '柯立芝', comp: 0.5, aggr: 0.2, reform: 0.3 },
          { name: '胡佛', comp: 0.55, aggr: 0.2, reform: 0.4 },
          { name: '小羅斯福', comp: 0.75, aggr: 0.4, reform: 0.8 }
        ],
        pop: 94, ages: [0.32, 0.19, 0.45, 0.04], cbr: 0.025, cdr: 0.014,
        gdp: 490, sectorShare: [0.18, 0.33, 0.49], labourShare: [0.32, 0.31, 0.37],
        urban: 0.46, edu: 92, health: 0.5,
        taxRate: 0.06, debtRatio: 0.08, savings: 0.16, openness: 0.4,
        budget: { military: 0.22, education: 0.18, research: 0.05, welfare: 0.1, infrastructure: 0.3, admin: 0.15 },
        pol: { stability: 75, legitimacy: 80, support: 55, admin: 65, corruption: 35, conflict: 25, armyLoyalty: 85, localPower: 30, inequality: 55 },
        mil: { personnel: 0.13, training: 50, equipment: 0.6 },
        foodRatio: 1.25, foodStock: 4, energySelf: 1.1, coal: 500, oil: 150,
        goal: 'prosper',
        techs: { railway: 0.85, electrification: 0.3, ice: 0.15, sanitation: 0.6, machinegun: 0.8, radio: 0.1, fertilizer: 0.1 },
        regions: ['東北部', '中西部', '南部', '西部']
      },
      {
        id: 'GBR', name: '英國', color: '#7c66dc', lat: 53, lon: -2,
        regime: 'constitutional', regimeLabel: '大英帝國（君主立憲）',
        leader: { name: '阿斯奎斯', comp: 0.6, aggr: 0.35, reform: 0.6 },
        leaderPool: [
          { name: '勞合喬治', comp: 0.7, aggr: 0.5, reform: 0.65 },
          { name: '博納勞', comp: 0.5, aggr: 0.35, reform: 0.3 },
          { name: '鮑德溫', comp: 0.5, aggr: 0.3, reform: 0.4 },
          { name: '麥克唐納', comp: 0.5, aggr: 0.2, reform: 0.7 }
        ],
        pop: 45, ages: [0.31, 0.19, 0.45, 0.05], cbr: 0.024, cdr: 0.014,
        gdp: 218, sectorShare: [0.07, 0.40, 0.53], labourShare: [0.12, 0.44, 0.44],
        urban: 0.78, edu: 93, health: 0.5,
        taxRate: 0.1, debtRatio: 0.3, savings: 0.12, openness: 0.9,
        budget: { military: 0.35, education: 0.15, research: 0.04, welfare: 0.12, infrastructure: 0.2, admin: 0.14 },
        pol: { stability: 72, legitimacy: 80, support: 55, admin: 80, corruption: 15, conflict: 30, armyLoyalty: 85, localPower: 15, inequality: 60 },
        mil: { personnel: 0.5, training: 75, equipment: 0.75 },
        foodRatio: 0.55, foodStock: 3, energySelf: 1.3, coal: 150, oil: 0,
        goal: 'prosper',
        techs: { railway: 0.9, electrification: 0.25, ice: 0.1, sanitation: 0.7, machinegun: 0.85, radio: 0.15, fertilizer: 0.05 },
        regions: ['英格蘭', '蘇格蘭與威爾斯', '愛爾蘭']
      },
      {
        id: 'DEU', name: '德國', color: '#8b8d98', lat: 51, lon: 10,
        regime: 'constitutional', regimeLabel: '德意志帝國（君主立憲）',
        leader: { name: '貝特曼-霍爾維格', comp: 0.55, aggr: 0.55, reform: 0.4 },
        leaderPool: [
          { name: '米夏埃利斯', comp: 0.35, aggr: 0.5, reform: 0.3 },
          { name: '艾伯特', comp: 0.55, aggr: 0.3, reform: 0.65 },
          { name: '施特雷澤曼', comp: 0.65, aggr: 0.3, reform: 0.6 },
          { name: '興登堡', comp: 0.5, aggr: 0.55, reform: 0.2 }
        ],
        pop: 65, ages: [0.34, 0.18, 0.43, 0.05], cbr: 0.029, cdr: 0.017,
        gdp: 230, sectorShare: [0.23, 0.42, 0.35], labourShare: [0.35, 0.38, 0.27],
        urban: 0.6, edu: 95, health: 0.5,
        taxRate: 0.09, debtRatio: 0.45, savings: 0.15, openness: 0.6,
        budget: { military: 0.4, education: 0.15, research: 0.06, welfare: 0.12, infrastructure: 0.15, admin: 0.12 },
        pol: { stability: 68, legitimacy: 70, support: 50, admin: 85, corruption: 15, conflict: 35, armyLoyalty: 85, localPower: 25, inequality: 55 },
        mil: { personnel: 0.65, training: 85, equipment: 0.8 },
        foodRatio: 0.9, foodStock: 3, energySelf: 1.2, coal: 200, oil: 1,
        goal: 'expand',
        techs: { railway: 0.9, electrification: 0.3, ice: 0.15, sanitation: 0.7, machinegun: 0.9, radio: 0.15, fertilizer: 0.15 },
        regions: ['普魯士', '萊茵-西發里亞', '南德', '亞爾薩斯-洛林']
      },
      {
        id: 'FRA', name: '法國', color: '#0090ff', lat: 46.5, lon: 2.5,
        regime: 'republic', regimeLabel: '法蘭西第三共和（共和民主）',
        leader: { name: '卡約', comp: 0.55, aggr: 0.3, reform: 0.6 },
        leaderPool: [
          { name: '普恩加萊', comp: 0.6, aggr: 0.55, reform: 0.4 },
          { name: '克里孟梭', comp: 0.7, aggr: 0.6, reform: 0.5 },
          { name: '白里安', comp: 0.6, aggr: 0.2, reform: 0.6 },
          { name: '米勒蘭', comp: 0.5, aggr: 0.4, reform: 0.4 }
        ],
        pop: 39.5, ages: [0.26, 0.17, 0.48, 0.09], cbr: 0.019, cdr: 0.018,
        gdp: 140, sectorShare: [0.25, 0.37, 0.38], labourShare: [0.40, 0.32, 0.28],
        urban: 0.44, edu: 88, health: 0.48,
        taxRate: 0.1, debtRatio: 0.8, savings: 0.12, openness: 0.6,
        budget: { military: 0.38, education: 0.14, research: 0.04, welfare: 0.12, infrastructure: 0.18, admin: 0.14 },
        pol: { stability: 65, legitimacy: 70, support: 50, admin: 75, corruption: 25, conflict: 35, armyLoyalty: 80, localPower: 20, inequality: 55 },
        mil: { personnel: 0.6, training: 70, equipment: 0.7 },
        foodRatio: 1.0, foodStock: 3, energySelf: 0.65, coal: 40, oil: 0,
        goal: 'security',
        techs: { railway: 0.85, electrification: 0.2, ice: 0.12, sanitation: 0.65, machinegun: 0.85, radio: 0.12, fertilizer: 0.08 },
        regions: ['巴黎盆地', '北部工業區', '南部']
      },
      {
        id: 'RUS', name: '俄國', color: '#30a46c', lat: 56, lon: 50,
        regime: 'monarchy', regimeLabel: '俄羅斯帝國（君主專制）',
        leader: { name: '尼古拉二世', comp: 0.3, aggr: 0.5, reform: 0.2 },
        leaderPool: [
          { name: '李沃夫', comp: 0.4, aggr: 0.3, reform: 0.6 },
          { name: '克倫斯基', comp: 0.45, aggr: 0.4, reform: 0.7 },
          { name: '列寧', comp: 0.75, aggr: 0.6, reform: 0.9 },
          { name: '史達林', comp: 0.7, aggr: 0.75, reform: 0.4 }
        ],
        pop: 160, ages: [0.37, 0.19, 0.40, 0.04], cbr: 0.045, cdr: 0.029,
        gdp: 225, sectorShare: [0.5, 0.2, 0.3], labourShare: [0.75, 0.12, 0.13],
        urban: 0.14, edu: 25, health: 0.2,
        taxRate: 0.1, debtRatio: 0.5, savings: 0.08, openness: 0.3,
        budget: { military: 0.4, education: 0.06, research: 0.02, welfare: 0.06, infrastructure: 0.2, admin: 0.26 },
        pol: { stability: 50, legitimacy: 45, support: 35, admin: 40, corruption: 60, conflict: 50, armyLoyalty: 65, localPower: 40, inequality: 65 },
        mil: { personnel: 1.3, training: 45, equipment: 0.45 },
        foodRatio: 1.1, foodStock: 3, energySelf: 1.0, coal: 300, oil: 100,
        goal: 'expand',
        techs: { railway: 0.4, electrification: 0.05, sanitation: 0.2, machinegun: 0.6, radio: 0.05 },
        regions: ['俄羅斯核心', '烏克蘭', '波蘭', '高加索', '西伯利亞']
      },
      {
        id: 'OTT', name: '鄂圖曼', color: '#ffc53d', lat: 39, lon: 35,
        regime: 'constitutional', regimeLabel: '鄂圖曼帝國（君主立憲）',
        leader: { name: '穆罕默德五世', comp: 0.3, aggr: 0.3, reform: 0.4 },
        leaderPool: [
          { name: '恩維爾帕夏', comp: 0.45, aggr: 0.8, reform: 0.5 },
          { name: '塔拉特帕夏', comp: 0.5, aggr: 0.6, reform: 0.4 },
          { name: '凱末爾', comp: 0.8, aggr: 0.5, reform: 0.9 }
        ],
        pop: 21, ages: [0.36, 0.19, 0.41, 0.04], cbr: 0.04, cdr: 0.03,
        gdp: 25, sectorShare: [0.55, 0.12, 0.33], labourShare: [0.75, 0.1, 0.15],
        urban: 0.17, edu: 10, health: 0.2,
        taxRate: 0.08, debtRatio: 0.9, savings: 0.06, openness: 0.4,
        budget: { military: 0.4, education: 0.05, research: 0.01, welfare: 0.06, infrastructure: 0.18, admin: 0.3 },
        pol: { stability: 40, legitimacy: 40, support: 40, admin: 40, corruption: 60, conflict: 50, armyLoyalty: 60, localPower: 50, inequality: 55 },
        mil: { personnel: 0.3, training: 45, equipment: 0.4 },
        foodRatio: 1.0, foodStock: 2, energySelf: 0.4, coal: 30, oil: 50,
        goal: 'stabilize',
        techs: { railway: 0.2, sanitation: 0.15, machinegun: 0.5 },
        regions: ['安那托利亞', '巴爾幹', '敘利亞-美索不達米亞', '阿拉伯']
      }
    ],
    // 雙邊既有關係（領土爭端、既有聯盟等），正值友好、負值敵對
    relations: [
      ['DEU', 'FRA', -45, '亞爾薩斯-洛林爭端'],
      ['JPN', 'RUS', -25, '日俄戰爭遺留'],
      ['CHN', 'JPN', -30, '甲午戰爭與滿洲權益'],
      ['DEU', 'GBR', -20, '海軍競賽'],
      ['OTT', 'RUS', -40, '黑海與巴爾幹爭奪'],
      ['DEU', 'RUS', -15, '東歐勢力競爭'],
      ['FRA', 'GBR', 25, '英法協約'],
      ['FRA', 'RUS', 30, '法俄同盟'],
      ['GBR', 'RUS', 10, '英俄協約'],
      ['GBR', 'JPN', 30, '英日同盟'],
      ['DEU', 'OTT', 20, '德鄂合作'],
      ['JPN', 'USA', -5, '太平洋競爭'],
      ['CHN', 'RUS', -20, '邊境與東北權益'],
      ['CHN', 'GBR', -10, '不平等條約']
    ],
    alliances: [['GBR', 'JPN'], ['FRA', 'RUS']]
  };
})(typeof window !== 'undefined' ? window : globalThis);
