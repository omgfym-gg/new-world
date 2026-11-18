// 1911 年「全世界」起點（第一版）
// 原本 8 個列強沿用 scenario-1911.js 的資料（完全相同），另外加入其餘 43 個國家與主要殖民地，合計 51 個政治實體。
// 人口與 GDP：以 Maddison Project 1913 年值回推估算（單位同 1911 劇本：人口＝百萬人；GDP＝十億 1990 年國際元）。
//   歐洲與美洲獨立國家可信度約 B／C；殖民地與非洲多為區域推估，可信度 C。
// 其餘社會、政治、軍事指數依「發展類型」給一組起始值，再逐國微調（可信度 D，示意值）。
// 殖民地與自治領用 overlord（宗主國）標記：沒有自主外交、宗主國開戰時一起參戰，之後可能依條件獨立。
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.Data = WS.Data || {};
  WS.Data.scenarios = WS.Data.scenarios || {};
  const base = WS.Data.scenarios['1911'];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => {
    const out = clone(a);
    for (const k in b) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? Object.assign(out[k], clone(b[k])) : clone(b[k]);
    return out;
  };

  // ---- 發展類型（起始值，示意值）----
  const TIERS = {
    // 西北歐小型工業國
    core: {
      ages: [0.30, 0.19, 0.45, 0.06], cbr: 0.025, cdr: 0.015,
      sectorShare: [0.18, 0.38, 0.44], labourShare: [0.30, 0.35, 0.35], urban: 0.45, edu: 90, health: 0.5,
      taxRate: 0.08, debtRatio: 0.4, savings: 0.12, openness: 0.8,
      budget: { military: 0.25, education: 0.17, research: 0.04, welfare: 0.14, infrastructure: 0.22, admin: 0.18 },
      pol: { stability: 72, legitimacy: 75, support: 55, admin: 75, corruption: 20, conflict: 25, armyLoyalty: 85, localPower: 20, inequality: 50 },
      mil: { training: 60, equipment: 0.6 },
      foodRatio: 0.9, foodStock: 3, energySelf: 0.6, coal: 2, oil: 0, goal: 'prosper',
      techs: { railway: 0.85, electrification: 0.2, ice: 0.1, sanitation: 0.65, machinegun: 0.7, radio: 0.08, fertilizer: 0.08 }
    },
    // 南歐、東歐、巴爾幹（半工業化）
    semi: {
      ages: [0.35, 0.19, 0.41, 0.05], cbr: 0.033, cdr: 0.021,
      sectorShare: [0.42, 0.25, 0.33], labourShare: [0.58, 0.20, 0.22], urban: 0.22, edu: 50, health: 0.3,
      taxRate: 0.09, debtRatio: 0.6, savings: 0.08, openness: 0.5,
      budget: { military: 0.32, education: 0.10, research: 0.02, welfare: 0.07, infrastructure: 0.20, admin: 0.29 },
      pol: { stability: 55, legitimacy: 55, support: 45, admin: 50, corruption: 45, conflict: 40, armyLoyalty: 70, localPower: 35, inequality: 58 },
      mil: { training: 50, equipment: 0.45 },
      foodRatio: 1.05, foodStock: 2.5, energySelf: 0.6, coal: 5, oil: 0, goal: 'security',
      techs: { railway: 0.45, electrification: 0.05, sanitation: 0.3, machinegun: 0.6 }
    },
    // 移民墾殖國家（自治領、拉普拉塔河流域）
    settler: {
      ages: [0.33, 0.20, 0.43, 0.04], cbr: 0.030, cdr: 0.012,
      sectorShare: [0.30, 0.27, 0.43], labourShare: [0.38, 0.27, 0.35], urban: 0.42, edu: 80, health: 0.5,
      taxRate: 0.07, debtRatio: 0.5, savings: 0.14, openness: 0.7,
      budget: { military: 0.12, education: 0.18, research: 0.03, welfare: 0.10, infrastructure: 0.35, admin: 0.22 },
      pol: { stability: 72, legitimacy: 72, support: 55, admin: 65, corruption: 30, conflict: 25, armyLoyalty: 85, localPower: 30, inequality: 50 },
      mil: { training: 45, equipment: 0.5 },
      foodRatio: 1.5, foodStock: 4, energySelf: 1.0, coal: 20, oil: 0, goal: 'prosper',
      techs: { railway: 0.7, electrification: 0.15, ice: 0.05, sanitation: 0.5, machinegun: 0.6, fertilizer: 0.03 }
    },
    // 獨立的農業國（亞洲、非洲、拉丁美洲）
    agrarian: {
      ages: [0.38, 0.19, 0.39, 0.04], cbr: 0.043, cdr: 0.030,
      sectorShare: [0.58, 0.12, 0.30], labourShare: [0.75, 0.10, 0.15], urban: 0.10, edu: 12, health: 0.15,
      taxRate: 0.05, debtRatio: 0.3, savings: 0.05, openness: 0.35,
      budget: { military: 0.35, education: 0.05, research: 0.01, welfare: 0.05, infrastructure: 0.14, admin: 0.40 },
      pol: { stability: 45, legitimacy: 45, support: 40, admin: 30, corruption: 65, conflict: 45, armyLoyalty: 55, localPower: 60, inequality: 62 },
      mil: { training: 30, equipment: 0.2 },
      foodRatio: 1.02, foodStock: 2, energySelf: 0.9, coal: 2, oil: 0, goal: 'stabilize',
      techs: { railway: 0.1, sanitation: 0.05, machinegun: 0.3 }
    },
    // 殖民地（由宗主國派任總督統治）
    colony: {
      ages: [0.38, 0.19, 0.39, 0.04], cbr: 0.042, cdr: 0.032,
      sectorShare: [0.62, 0.10, 0.28], labourShare: [0.78, 0.08, 0.14], urban: 0.08, edu: 6, health: 0.12,
      taxRate: 0.05, debtRatio: 0.2, savings: 0.05, openness: 0.55,
      budget: { military: 0.20, education: 0.04, research: 0.01, welfare: 0.03, infrastructure: 0.20, admin: 0.52 },
      pol: { stability: 50, legitimacy: 30, support: 35, admin: 45, corruption: 50, conflict: 40, armyLoyalty: 70, localPower: 45, inequality: 70 },
      mil: { training: 35, equipment: 0.25 },
      foodRatio: 1.0, foodStock: 2, energySelf: 0.95, coal: 1, oil: 0, goal: 'stabilize',
      regime: 'colonial', subjectType: 'colony',
      techs: { railway: 0.15, sanitation: 0.05, machinegun: 0.2 }
    }
  };

  // mk(代號, 名稱, 顏色, [緯度, 經度], 類型, 個別資料)
  function mk(id, name, color, [lat, lon], tier, o) {
    const t = TIERS[tier];
    const def = merge(t, o);
    def.id = id; def.name = name; def.color = color; def.lat = lat; def.lon = lon;
    def.regime = o.regime || t.regime || 'monarchy';
    def.regimeLabel = o.regimeLabel || name;
    def.leader = Object.assign({ comp: 0.5, aggr: 0.4, reform: 0.45 }, o.leader || {});
    def.leaderPool = o.leaderPool || [];
    def.mil = { personnel: o.army, training: def.mil.training, equipment: def.mil.equipment };
    delete def.army;
    return def;
  }
  // 給其他劇本（例如從遠古接到近代）共用的國家產生器
  WS.Data.countryTiers = TIERS;
  WS.Data.makeCountry = mk;
  const gov = (who) => ({ name: who + '派任總督', comp: 0.5, aggr: 0.3, reform: 0.2 });

  const added = [
    // ===== 歐洲 =====
    mk('AUT', '奧匈帝國', '#c2a370', [48, 16], 'semi', {
      regime: 'constitutional', regimeLabel: '奧匈帝國（二元君主立憲）', leader: { name: '法蘭茲·約瑟夫一世', comp: 0.45, aggr: 0.45, reform: 0.25 },
      leaderPool: [{ name: '卡爾一世', comp: 0.45, aggr: 0.25, reform: 0.55 }],
      pop: 50.6, gdp: 96, army: 0.42, edu: 65, urban: 0.25, coal: 30, oil: 2, goal: 'security',
      pol: { stability: 52, legitimacy: 55, localPower: 55, conflict: 48 }, mil: { training: 60, equipment: 0.55 },
      techs: { railway: 0.6, electrification: 0.1, sanitation: 0.4, machinegun: 0.75, radio: 0.05 },
      regions: ['奧地利', '匈牙利', '波希米亞', '加利西亞', '波士尼亞與克羅埃西亞']
    }),
    mk('ITA', '義大利', '#46a758', [42.5, 12.5], 'semi', {
      regime: 'constitutional', regimeLabel: '義大利王國（君主立憲）', leader: { name: '喬利蒂', comp: 0.65, aggr: 0.45, reform: 0.6 },
      leaderPool: [{ name: '薩蘭德拉', comp: 0.5, aggr: 0.55, reform: 0.35 }, { name: '尼蒂', comp: 0.5, aggr: 0.3, reform: 0.55 }, { name: '墨索里尼', comp: 0.55, aggr: 0.85, reform: 0.3 }],
      pop: 35.5, gdp: 88, army: 0.3, edu: 60, urban: 0.3, coal: 1, goal: 'expand',
      mil: { training: 55, equipment: 0.55 }, techs: { railway: 0.6, electrification: 0.15, sanitation: 0.4, machinegun: 0.75, radio: 0.08 },
      regions: ['北義大利', '中義大利', '南義大利', '西西里與薩丁尼亞']
    }),
    mk('ESP', '西班牙', '#e5a000', [40, -3.7], 'semi', {
      regime: 'constitutional', regimeLabel: '西班牙王國（君主立憲）', leader: { name: '卡納雷哈斯', comp: 0.55, aggr: 0.3, reform: 0.6 },
      pop: 20, gdp: 40, army: 0.12, edu: 45, coal: 8, regions: ['卡斯提亞', '加泰隆尼亞', '安達魯西亞', '北部']
    }),
    mk('POR', '葡萄牙', '#2f9e44', [39.5, -8], 'semi', {
      regime: 'republic', regimeLabel: '葡萄牙第一共和（共和民主）', leader: { name: '阿里亞加', comp: 0.45, aggr: 0.25, reform: 0.6 },
      pop: 5.9, gdp: 7.2, army: 0.03, edu: 25, pol: { stability: 38, legitimacy: 45, conflict: 55 }, regions: ['北部', '里斯本', '南部']
    }),
    mk('NLD', '荷蘭', '#ff801f', [52.2, 5.5], 'core', {
      regime: 'constitutional', regimeLabel: '荷蘭王國（君主立憲）', leader: { name: '威廉明娜女王', comp: 0.55, aggr: 0.2, reform: 0.4 },
      pop: 6.0, gdp: 23.5, army: 0.03, openness: 0.95, coal: 1, goal: 'prosper', regions: ['荷蘭省', '東部', '南部']
    }),
    mk('BEL', '比利時', '#e2b93b', [50.6, 4.6], 'core', {
      regime: 'constitutional', regimeLabel: '比利時王國（君主立憲）', leader: { name: '阿爾貝一世', comp: 0.6, aggr: 0.2, reform: 0.5 },
      pop: 7.5, gdp: 31, army: 0.05, sectorShare: [0.12, 0.45, 0.43], labourShare: [0.22, 0.45, 0.33], urban: 0.55, coal: 8, energySelf: 1.1, regions: ['法蘭德斯', '瓦隆', '布魯塞爾']
    }),
    mk('SWE', '瑞典', '#5eb1ef', [61, 15], 'core', {
      regime: 'constitutional', regimeLabel: '瑞典王國（君主立憲）', leader: { name: '古斯塔夫五世', comp: 0.5, aggr: 0.25, reform: 0.35 },
      pop: 5.5, gdp: 16.5, army: 0.08, sectorShare: [0.3, 0.32, 0.38], labourShare: [0.45, 0.28, 0.27], urban: 0.28, regions: ['斯韋阿蘭', '約塔蘭', '諾爾蘭']
    }),
    mk('NOR', '挪威', '#cd2b31', [61, 9], 'core', {
      regime: 'constitutional', regimeLabel: '挪威王國（君主立憲）', leader: { name: '哈康七世', comp: 0.55, aggr: 0.15, reform: 0.5 },
      pop: 2.4, gdp: 5.7, army: 0.02, sectorShare: [0.28, 0.3, 0.42], labourShare: [0.4, 0.27, 0.33], urban: 0.28, regions: ['東挪威', '西挪威', '北挪威']
    }),
    mk('DNK', '丹麥', '#f2555a', [56, 9.5], 'core', {
      regime: 'constitutional', regimeLabel: '丹麥王國（君主立憲）', leader: { name: '腓特烈八世', comp: 0.45, aggr: 0.15, reform: 0.5 },
      pop: 2.8, gdp: 11, army: 0.02, foodRatio: 1.3, regions: ['日德蘭', '西蘭與群島']
    }),
    mk('CHE', '瑞士', '#ff6369', [46.8, 8.2], 'core', {
      regime: 'republic', regimeLabel: '瑞士聯邦（共和民主）', leader: { name: '聯邦委員會主席', comp: 0.55, aggr: 0.1, reform: 0.5 },
      pop: 3.8, gdp: 15.5, army: 0.03, foodRatio: 0.7, regions: ['德語區', '法語區', '義語區']
    }),
    mk('GRC', '希臘', '#70b8ff', [39, 22], 'semi', {
      regime: 'constitutional', regimeLabel: '希臘王國（君主立憲）', leader: { name: '韋尼澤洛斯', comp: 0.7, aggr: 0.55, reform: 0.65 },
      pop: 2.7, gdp: 4.3, army: 0.03, edu: 40, openness: 0.6, goal: 'expand', regions: ['阿提卡', '伯羅奔尼撒', '色薩利']
    }),
    mk('SRB', '塞爾維亞', '#a35829', [44, 21], 'semi', {
      regime: 'constitutional', regimeLabel: '塞爾維亞王國（君主立憲）', leader: { name: '彼得一世', comp: 0.5, aggr: 0.6, reform: 0.45 },
      pop: 2.9, gdp: 3.6, army: 0.04, edu: 25, urban: 0.12, sectorShare: [0.6, 0.12, 0.28], labourShare: [0.8, 0.08, 0.12], goal: 'expand', regions: ['舒馬迪亞', '北部', '南部']
    }),
    mk('ROU', '羅馬尼亞', '#ffe629', [45.5, 25], 'semi', {
      regime: 'constitutional', regimeLabel: '羅馬尼亞王國（君主立憲）', leader: { name: '卡羅爾一世', comp: 0.6, aggr: 0.35, reform: 0.4 },
      pop: 7.0, gdp: 9.0, army: 0.1, edu: 35, oil: 10, energySelf: 1.2, sectorShare: [0.55, 0.15, 0.3], labourShare: [0.78, 0.08, 0.14], foodRatio: 1.3, regions: ['瓦拉幾亞', '摩爾達維亞', '多布羅加']
    }),
    mk('BGR', '保加利亞', '#dc3e42', [42.7, 25.3], 'semi', {
      regime: 'constitutional', regimeLabel: '保加利亞王國（君主立憲）', leader: { name: '斐迪南一世', comp: 0.55, aggr: 0.6, reform: 0.35 },
      pop: 4.3, gdp: 5.2, army: 0.06, edu: 40, sectorShare: [0.58, 0.12, 0.3], labourShare: [0.78, 0.08, 0.14], goal: 'expand', regions: ['北保加利亞', '色雷斯', '索菲亞']
    }),

    // ===== 亞洲 =====
    mk('IND', '英屬印度', '#ff9e57', [22, 79], 'colony', {
      overlord: 'GBR', regimeLabel: '英屬印度（殖民統治）', leader: gov('英國'),
      pop: 303, gdp: 200, army: 0.24, edu: 6, urban: 0.09, coal: 60, sectorShare: [0.55, 0.12, 0.33], labourShare: [0.72, 0.12, 0.16],
      pol: { admin: 50, localPower: 50 }, techs: { railway: 0.3, sanitation: 0.05, machinegun: 0.3 },
      regions: ['恆河平原', '孟加拉', '旁遮普', '德干', '緬甸']
    }),
    mk('IDN', '荷屬東印度', '#ffb381', [-2, 115], 'colony', {
      overlord: 'NLD', regimeLabel: '荷屬東印度（殖民統治）', leader: gov('荷蘭'),
      pop: 48.5, gdp: 43, army: 0.04, oil: 20, energySelf: 1.2, regions: ['爪哇', '蘇門答臘', '婆羅洲', '東部群島']
    }),
    mk('IDC', '法屬印度支那', '#86ead4', [16, 106], 'colony', {
      overlord: 'FRA', regimeLabel: '法屬印度支那（殖民統治）', leader: gov('法國'),
      pop: 21, gdp: 17, army: 0.03, foodRatio: 1.15, regions: ['東京', '安南', '交趾支那', '柬埔寨與寮國']
    }),
    mk('PHL', '美屬菲律賓', '#9eb1ff', [12.5, 122], 'colony', {
      overlord: 'USA', regimeLabel: '美屬菲律賓（殖民統治）', leader: gov('美國'),
      pop: 9.0, gdp: 8.8, army: 0.015, edu: 20, regions: ['呂宋', '米沙鄢', '民答那峨']
    }),
    mk('IRN', '波斯', '#5bb98b', [32.5, 54], 'agrarian', {
      regime: 'constitutional', regimeLabel: '波斯（卡扎爾王朝・君主立憲）', leader: { name: '艾哈邁德沙', comp: 0.3, aggr: 0.2, reform: 0.35 },
      leaderPool: [{ name: '禮薩汗', comp: 0.65, aggr: 0.6, reform: 0.55 }],
      pop: 10, gdp: 9, army: 0.03, oil: 60, energySelf: 1.5, pol: { stability: 30, legitimacy: 35, localPower: 70 }, regions: ['德黑蘭', '亞塞拜然', '法爾斯', '呼羅珊']
    }),
    mk('SIA', '暹羅', '#ffca16', [15, 101], 'agrarian', {
      regime: 'monarchy', regimeLabel: '暹羅王國（君主專制）', leader: { name: '拉瑪六世', comp: 0.5, aggr: 0.25, reform: 0.5 },
      pop: 8.4, gdp: 7.0, army: 0.03, foodRatio: 1.3, openness: 0.5, pol: { stability: 60, legitimacy: 60, admin: 45 }, regions: ['中部', '北部', '東北', '南部']
    }),
    mk('AFG', '阿富汗', '#ad7f58', [34, 66], 'agrarian', {
      regime: 'monarchy', regimeLabel: '阿富汗酋長國（君主專制）', leader: { name: '哈比布拉汗', comp: 0.45, aggr: 0.3, reform: 0.35 },
      leaderPool: [{ name: '阿曼努拉汗', comp: 0.55, aggr: 0.5, reform: 0.85 }],
      pop: 5.6, gdp: 5.0, army: 0.05, edu: 3, openness: 0.15, regions: ['喀布爾', '坎達哈', '赫拉特']
    }),

    // ===== 非洲 =====
    mk('EGY', '埃及', '#d6a35c', [27, 30], 'colony', {
      overlord: 'GBR', subjectType: 'protectorate', regime: 'monarchy', regimeLabel: '埃及（赫迪夫・英國占領）', leader: { name: '阿拔斯二世', comp: 0.45, aggr: 0.3, reform: 0.4 },
      pop: 11.9, gdp: 10.5, army: 0.02, edu: 8, urban: 0.15, openness: 0.7, pol: { legitimacy: 35 }, regions: ['下埃及', '上埃及', '蘇丹']
    }),
    mk('ETH', '衣索比亞', '#9b9ef0', [9, 39.5], 'agrarian', {
      regime: 'monarchy', regimeLabel: '衣索比亞帝國（君主專制）', leader: { name: '利賈·伊亞蘇', comp: 0.35, aggr: 0.45, reform: 0.4 },
      leaderPool: [{ name: '塞拉西', comp: 0.65, aggr: 0.3, reform: 0.6 }],
      pop: 9.0, gdp: 3.8, army: 0.1, edu: 3, openness: 0.15, regions: ['紹阿', '阿姆哈拉', '提格雷', '南部']
    }),
    mk('MAR', '摩洛哥', '#e54666', [32, -6.5], 'agrarian', {
      regime: 'monarchy', regimeLabel: '摩洛哥蘇丹國（君主專制）', leader: { name: '穆萊·哈菲德', comp: 0.35, aggr: 0.3, reform: 0.3 },
      pop: 4.4, gdp: 3.2, army: 0.03, edu: 4, pol: { stability: 30, legitimacy: 35, localPower: 72 }, regions: ['菲斯', '馬拉喀什', '里夫']
    }),
    mk('MAG', '法屬北非', '#7ce2fe', [34, 4], 'colony', {
      overlord: 'FRA', regimeLabel: '法屬阿爾及利亞與突尼西亞（殖民統治）', leader: gov('法國'),
      pop: 7.3, gdp: 7.5, army: 0.06, edu: 8, urban: 0.15, regions: ['阿爾及爾', '奧蘭', '君士坦丁', '突尼西亞']
    }),
    mk('AOF', '法屬西非', '#3db9cf', [14, -6], 'colony', {
      overlord: 'FRA', regimeLabel: '法屬西非（殖民統治）', leader: gov('法國'),
      pop: 11, gdp: 5.8, army: 0.02, edu: 3, urban: 0.05, regions: ['塞內加爾', '法屬蘇丹', '幾內亞', '象牙海岸']
    }),
    mk('NGA', '英屬奈及利亞', '#c4f042', [9, 8], 'colony', {
      overlord: 'GBR', regimeLabel: '英屬奈及利亞（殖民統治）', leader: gov('英國'),
      pop: 17, gdp: 13, army: 0.01, edu: 3, urban: 0.06, regions: ['北奈及利亞', '南奈及利亞', '拉哥斯']
    }),
    mk('BEA', '英屬東非', '#99d52a', [1, 36], 'colony', {
      overlord: 'GBR', regimeLabel: '英屬東非（肯亞與烏干達・殖民統治）', leader: gov('英國'),
      pop: 6.0, gdp: 2.8, army: 0.003, edu: 2, urban: 0.04, regions: ['肯亞', '烏干達']
    }),
    mk('GEA', '德屬東非', '#b1a9ff', [-6, 35], 'colony', {
      overlord: 'DEU', regimeLabel: '德屬東非（殖民統治）', leader: gov('德國'),
      pop: 7.5, gdp: 3.5, army: 0.003, edu: 2, urban: 0.04, regions: ['坦干伊喀', '盧安達-烏隆迪']
    }),
    mk('COD', '比屬剛果', '#e0c4f4', [-3, 23], 'colony', {
      overlord: 'BEL', regimeLabel: '比屬剛果（殖民統治）', leader: gov('比利時'),
      pop: 9.0, gdp: 4.5, army: 0.015, edu: 2, urban: 0.04, pol: { legitimacy: 22 }, regions: ['利奧波德維爾', '加丹加', '赤道省']
    }),
    mk('ZAF', '南非聯邦', '#fdbe49', [-29, 25], 'settler', {
      overlord: 'GBR', subjectType: 'dominion', regime: 'constitutional', regimeLabel: '南非聯邦（英國自治領）', leader: { name: '路易·波塔', comp: 0.6, aggr: 0.35, reform: 0.4 },
      pop: 6.0, gdp: 9.0, army: 0.01, edu: 30, urban: 0.25, coal: 30, sectorShare: [0.25, 0.4, 0.35], labourShare: [0.6, 0.18, 0.22],
      pol: { inequality: 78, conflict: 40 }, regions: ['開普', '德蘭士瓦', '納塔爾', '奧蘭治']
    }),

    // ===== 美洲 =====
    mk('CAN', '加拿大', '#e5484d', [56, -100], 'settler', {
      overlord: 'GBR', subjectType: 'dominion', regime: 'constitutional', regimeLabel: '加拿大（英國自治領）', leader: { name: '勞瑞爾', comp: 0.65, aggr: 0.2, reform: 0.55 },
      leaderPool: [{ name: '博登', comp: 0.55, aggr: 0.35, reform: 0.4 }, { name: '金恩', comp: 0.6, aggr: 0.15, reform: 0.55 }],
      pop: 7.2, gdp: 31, army: 0.005, coal: 60, oil: 5, regions: ['安大略', '魁北克', '草原省份', '濱海省份', '卑詩']
    }),
    mk('MEX', '墨西哥', '#12a594', [23, -102], 'agrarian', {
      regime: 'authoritarian', regimeLabel: '墨西哥（迪亞斯威權政府）', leader: { name: '迪亞斯', comp: 0.45, aggr: 0.35, reform: 0.1 },
      leaderPool: [{ name: '馬德羅', comp: 0.45, aggr: 0.2, reform: 0.85 }, { name: '韋爾塔', comp: 0.45, aggr: 0.75, reform: 0.1 }, { name: '卡蘭薩', comp: 0.55, aggr: 0.45, reform: 0.55 }, { name: '奧夫雷貢', comp: 0.65, aggr: 0.55, reform: 0.6 }, { name: '卡德納斯', comp: 0.7, aggr: 0.3, reform: 0.85 }],
      pop: 15.2, gdp: 25, army: 0.03, edu: 25, urban: 0.15, oil: 30, energySelf: 1.3, openness: 0.45,
      pol: { stability: 28, legitimacy: 25, support: 25, conflict: 65, inequality: 75 }, regions: ['中央高原', '北部', '南部', '海灣沿岸']
    }),
    mk('CUB', '古巴', '#0d74ce', [21.8, -79], 'agrarian', {
      regime: 'republic', regimeLabel: '古巴共和國（共和民主）', leader: { name: '何塞·米格爾·戈麥斯', comp: 0.45, aggr: 0.3, reform: 0.45 },
      pop: 2.2, gdp: 4.0, army: 0.005, edu: 35, urban: 0.3, openness: 0.8, sectorShare: [0.45, 0.15, 0.4], regions: ['西部', '中部', '東部']
    }),
    mk('COL', '哥倫比亞', '#fbe32d', [4.5, -74], 'agrarian', {
      regime: 'republic', regimeLabel: '哥倫比亞共和國（共和民主）', leader: { name: '雷斯特雷波', comp: 0.5, aggr: 0.25, reform: 0.5 },
      pop: 5.1, gdp: 6.0, army: 0.01, edu: 25, urban: 0.12, regions: ['安第斯', '加勒比海岸', '東部平原']
    }),
    mk('VEN', '委內瑞拉', '#ab4aba', [7, -66], 'agrarian', {
      regime: 'authoritarian', regimeLabel: '委內瑞拉（戈麥斯威權政府）', leader: { name: '胡安·維森特·戈麥斯', comp: 0.55, aggr: 0.4, reform: 0.15 },
      pop: 2.8, gdp: 3.0, army: 0.01, edu: 20, oil: 50, energySelf: 1.3, regions: ['加拉加斯', '馬拉開波', '奧里諾科']
    }),
    mk('PER', '秘魯', '#d6409f', [-9.5, -75], 'agrarian', {
      regime: 'republic', regimeLabel: '秘魯共和國（共和民主）', leader: { name: '萊吉亞', comp: 0.55, aggr: 0.35, reform: 0.45 },
      pop: 4.2, gdp: 4.2, army: 0.01, edu: 25, regions: ['利馬與海岸', '安第斯高地', '亞馬遜']
    }),
    mk('BRA', '巴西', '#30a46c', [-10, -52], 'agrarian', {
      regime: 'republic', regimeLabel: '巴西合眾國（共和民主）', leader: { name: '埃梅斯·達·豐塞卡', comp: 0.4, aggr: 0.4, reform: 0.35 },
      leaderPool: [{ name: '瓦加斯', comp: 0.7, aggr: 0.45, reform: 0.65 }],
      pop: 22.5, gdp: 18, army: 0.03, edu: 25, urban: 0.15, openness: 0.5, foodRatio: 1.1, pol: { stability: 55, legitimacy: 50, localPower: 65 },
      regions: ['東南部', '東北部', '南部', '亞馬遜']
    }),
    mk('CHL', '智利', '#ce2c31', [-33, -71], 'semi', {
      regime: 'republic', regimeLabel: '智利共和國（共和民主）', leader: { name: '巴羅斯·盧科', comp: 0.5, aggr: 0.3, reform: 0.4 },
      pop: 3.4, gdp: 8.8, army: 0.02, edu: 45, urban: 0.35, openness: 0.7, coal: 3, regions: ['中央谷地', '北部礦區', '南部']
    }),
    mk('ARG', '阿根廷', '#7ec8f2', [-34, -64], 'settler', {
      regime: 'republic', regimeLabel: '阿根廷共和國（共和民主）', leader: { name: '薩恩斯·佩尼亞', comp: 0.6, aggr: 0.25, reform: 0.7 },
      leaderPool: [{ name: '伊里戈延', comp: 0.55, aggr: 0.2, reform: 0.65 }, { name: '裴隆', comp: 0.65, aggr: 0.5, reform: 0.6 }],
      pop: 7.0, gdp: 26, army: 0.03, edu: 60, coal: 1, energySelf: 0.4, foodRatio: 2.0, regions: ['布宜諾斯艾利斯', '彭巴草原', '北部', '巴塔哥尼亞']
    }),
    mk('URY', '烏拉圭', '#a1dbf8', [-33, -56], 'settler', {
      regime: 'republic', regimeLabel: '烏拉圭東岸共和國（共和民主）', leader: { name: '巴特列-奧多涅斯', comp: 0.65, aggr: 0.15, reform: 0.85 },
      pop: 1.15, gdp: 3.7, army: 0.01, edu: 60, coal: 0, energySelf: 0.3, regions: ['蒙特維多', '內陸']
    }),

    // ===== 大洋洲 =====
    mk('AUS', '澳大利亞', '#ffa057', [-25, 134], 'settler', {
      overlord: 'GBR', subjectType: 'dominion', regime: 'constitutional', regimeLabel: '澳大利亞聯邦（英國自治領）', leader: { name: '費舍爾', comp: 0.6, aggr: 0.2, reform: 0.65 },
      pop: 4.5, gdp: 25.5, army: 0.005, coal: 70, urban: 0.5, regions: ['新南威爾斯', '維多利亞', '昆士蘭', '西澳與南澳']
    }),
    mk('NZL', '紐西蘭', '#5bb3a8', [-41.5, 173], 'settler', {
      overlord: 'GBR', subjectType: 'dominion', regime: 'constitutional', regimeLabel: '紐西蘭（英國自治領）', leader: { name: '約瑟夫·沃德', comp: 0.55, aggr: 0.15, reform: 0.6 },
      pop: 1.06, gdp: 5.4, army: 0.003, coal: 5, regions: ['北島', '南島']
    })
  ];

  // 獨立後使用的國名（殖民地名稱多半帶有宗主國字樣）
  const AFTER = { IND: '印度', IDN: '印尼', IDC: '印度支那聯邦', PHL: '菲律賓', MAG: '阿爾及利亞', AOF: '西非聯邦', NGA: '奈及利亞', BEA: '東非聯邦', GEA: '坦干伊喀', COD: '剛果' };
  for (const c of added) if (AFTER[c.id]) c.independentName = AFTER[c.id];

  // 殖民地、自治領與宗主國之間的起始關係
  const subjectRel = added.filter((c) => c.overlord).map((c) => [c.overlord, c.id, c.subjectType === 'dominion' ? 50 : 15, c.subjectType === 'dominion' ? '自治領與母國的連結' : '殖民統治（經濟依附與不滿並存）']);

  WS.Data.scenarios['1911w'] = {
    id: '1911w',
    name: '近代世界：1911 全世界',
    startYear: 1911,
    startMonth: 1,
    provenance: {
      population: { source: 'Maddison Project Database（1913 年值回推；殖民地、非洲為區域推估）', grade: 'C', estimated: true },
      gdp: { source: 'Maddison Project Database（1913 年值回推；殖民地、非洲為區域推估）', grade: 'C', estimated: true },
      indices: { source: '依發展類型給起始值後逐國微調（示意值）', grade: 'D', estimated: true }
    },
    countries: clone(base.countries).concat(added),
    relations: base.relations.concat([
      ['AUT', 'SRB', -45, '波士尼亞危機與南斯拉夫問題'],
      ['AUT', 'RUS', -30, '巴爾幹勢力競爭'],
      ['AUT', 'ITA', -10, '義大利收復失土主義'],
      ['AUT', 'ROU', -15, '外西凡尼亞的羅馬尼亞人'],
      ['DEU', 'AUT', 40, '德奧同盟'],
      ['DEU', 'ITA', 15, '三國同盟'],
      ['ITA', 'OTT', -35, '義大利對利比亞的野心'],
      ['GRC', 'OTT', -35, '克里特與馬其頓問題'],
      ['BGR', 'OTT', -30, '馬其頓問題'],
      ['SRB', 'OTT', -30, '巴爾幹基督徒地區'],
      ['SRB', 'BGR', -15, '馬其頓歸屬爭議'],
      ['GRC', 'BGR', -15, '馬其頓歸屬爭議'],
      ['ROU', 'BGR', -10, '多布羅加邊界'],
      ['RUS', 'SRB', 30, '斯拉夫與東正教情誼'],
      ['RUS', 'BGR', 10, '解放保加利亞的歷史'],
      ['FRA', 'MAR', -30, '摩洛哥危機'],
      ['ESP', 'MAR', -20, '里夫地區衝突'],
      ['DEU', 'MAR', 10, '德國支持摩洛哥獨立以牽制法國'],
      ['RUS', 'IRN', -25, '英俄劃分勢力範圍'],
      ['GBR', 'IRN', -10, '英俄劃分勢力範圍'],
      ['AFG', 'RUS', -10, '中亞邊境'],
      ['ETH', 'ITA', -30, '阿杜瓦戰爭遺留'],
      ['SIA', 'FRA', -15, '割讓湄公河東岸領土'],
      ['DNK', 'DEU', -15, '什勒斯維希問題'],
      ['SWE', 'NOR', -5, '1905 年分離'],
      ['GBR', 'POR', 20, '英葡同盟'],
      ['USA', 'MEX', -15, '邊境與革命動盪'],
      ['USA', 'CUB', 20, '普拉特修正案'],
      ['USA', 'COL', -20, '巴拿馬分離'],
      ['CHL', 'PER', -30, '太平洋戰爭遺留（塔克納-阿里卡）'],
      ['ARG', 'BRA', -10, '南美洲主導權競爭'],
      ['ARG', 'CHL', -5, '安地斯邊界'],
      ['COL', 'PER', -10, '亞馬遜邊界'],
      ['COL', 'VEN', -10, '邊界爭議'],
      ['ARG', 'URY', 15, '拉普拉塔河兩岸']
    ]).concat(subjectRel),
    alliances: base.alliances.concat([['DEU', 'AUT'], ['DEU', 'ITA'], ['AUT', 'ITA'], ['GBR', 'POR']])
  };
})(typeof window !== 'undefined' ? window : globalThis);
