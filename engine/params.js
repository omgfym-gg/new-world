// 模型參數表（第一版）
// 這裡的所有係數都是「第一版模型設計基礎」的示意值，尚未經過歷史回測校準。
// 引擎程式只讀取這份參數，不在程式內寫死係數；之後校準時只需修改此檔或在存檔中覆寫。
(function (root) {
  const WS = (root.WS = root.WS || {});

  WS.PARAMS_VERSION = '1.1.0-proto';

  WS.DEFAULT_PARAMS = {
    population: {
      // 各年齡層基礎年死亡率（0–14, 15–24, 25–64, 65+），國家實際值會依起始粗死亡率縮放
      baseMortality: [0.03, 0.006, 0.014, 0.08],
      // 各年齡層每年移入下一層的比例（= 1 / 年齡層跨度）
      agingRate: [1 / 15, 1 / 10, 1 / 40],
      fertileWeight25to64: 0.55,      // 25–64 歲中仍處於生育年齡的比重
      shortageBirthPenalty: 0.3,      // 糧食短缺時出生減少比例
      shortageDeathBoost: 1.5,        // 糧食短缺時死亡率增加倍數
      warBirthPenalty: 0.15,
      conflictDeathBoost: 0.08,       // 社會衝突 >70 時死亡率增加
      // 人口轉型（示意值，依 2026-11 回測初步校準）：生育意願 = 下限 + (1 − 下限) / (1 + e^(陡度 × (轉型指數 − 中點)))
      transitionEduW: 0.25,           // 轉型指數中教育的權重
      transitionUrbanW: 0.25,         // 城市化的權重
      transitionHealthW: 0.5,         // 嬰幼兒存活（醫療水準）的權重
      transitionMid: 0.62,
      transitionSteep: 12,
      transitionFloor: 0.02,
      fertMin: 0.036,                 // 轉型完成後每名育齡人口的年出生數（約對應粗出生率 12–14‰）
      migrationPull: 0.001,           // 人均GDP相對差距造成的遷移傾向
      migrationConflictPush: 0.004,
      migrationCap: 0.003,
      migrationOutBase: 0.2,          // 移民阻力（示意值）：開放度為 0 時仍保留的移出比例
      migrationInBase: 0.2,           // 開放度為 0 時仍保留的移入比例
      eduGainPerGdpShare: 120,        // 教育支出佔GDP比重對教育水準的年增效果
      eduDecay: 0.1,
      eduUrban: 0.5,
      healthAdjustRate: 0.1,
      healthAgeEffect: [1.0, 0.9, 0.8, 0.45], // 醫療進步降低死亡率的程度（0–14, 15–24, 25–64, 65+；1＝完全依醫療水準下降）
      // 死亡率轉型（示意值，依 2026-11 回測初步校準）
      healthDevGain: 0.25,            // 發展程度（人均 GDP）對醫療水準目標的最大貢獻：營養、住居、醫療可及性
      healthDevRef: 15000,            // 人均 GDP（1990 年國際元）達到此值視為發展成熟
      healthDevExp: 0.7,
      medTechWeight: 2.0,             // 醫療科技對醫療水準的放大倍數（科技樹中的 health 效果 × 此值）
      medDiffusion: 1.0,              // 世界上已出現的醫療科技（公共衛生、疫苗、抗生素）向其他國家擴散的比例
      medAbsorbBase: 0.6,             // 擴散吸收能力的基礎值，其餘由行政效率決定
      healthWelfareGain: 2.0
    },
    environment: {
      harvestSd: 0.04,                // 全國平均收成波動（大國由多地區平均，2026-11 健康檢查由 0.06 下調）
      droughtChance: 0.03,
      droughtHarvest: 0.88,           // 全國性旱災的收成比例（由 0.8 上調）
      foodStockCap: 12,               // 糧食庫存上限（月）
      reserveDepletionYears: 30,      // 儲量低於此年數時開採能力開始下降
      oilShareMax: 0.4,               // 內燃機普及後石油在能源中的最大比重
      pollutionPerEnergy: 0.002,
      pollutionDecay: 0.02,
      pollutionHealthPenalty: 0.1,
      sharingStockFloor: 4            // 資源共享：庫存高於此月數才分享
    },
    economy: {
      sectors: {
        agri: { alpha: 0.6, beta: 0.2, ky: 1.5, label: '農業' },
        ind: { alpha: 0.5, beta: 0.4, ky: 2.5, label: '工業' },
        serv: { alpha: 0.6, beta: 0.3, ky: 2.0, label: '服務業' }
      },
      participation: 0.85,
      depreciation: 0.04,
      instabilityWeight: 0.2,         // 政治穩定度對生產效率的影響
      corruptionDrag: 1 / 500,
      energyIndWeight: 0.6,
      energyServWeight: 0.2,
      labourAdjustRate: 0.2,
      foodSecurityTarget: 1.0,        // 糧食供應低於此值時，勞動力被吸引回農業
      urbanBase: 0.002,
      urbanGrowth: 0.02,
      urbanRail: 0.004,
      urbanCar: 0.006,
      urbanMax: 0.92,
      unemploymentBase: 0.04,
      // 經濟衰退推高失業（類似奧肯法則）。只作用在受雇部門（工業、服務業）：
      // 自耕農在歉收年仍在田裡工作，不會「失業」，否則旱災會被放大成全面衰退、隔年再全面反彈（示意值）
      unemploymentOkun: 1.5,
      inflationBase: 0.01,
      inflationDeficit: 0.5,
      inflationFood: 0.3,
      inflationEnergy: 0.2,
      interestRate: 0.04,
      budgetInertia: 0.05,            // 預算比例每年回歸預設值的速度
      warSpendingShare: 0.18,         // 戰時軍費佔 GDP 最低比例
      noCurrencyEfficiency: 0.93,
      noCapitalismEfficiency: 0.95,
      plannedSavings: 0.16,
      importFoodGdppcRef: 2000,
      // 生產力成長（示意值，依 2026-11 回測初步校準）：每年 A 的成長率 = 知識累積 + 追趕
      tfpKnowledge: 0.004,            // 教育普及（100）且政局穩定時，每年知識累積帶來的生產力成長
      catchUpRate: 0.012,             // 與世界最富國家的差距（對數）每 1 單位帶來的年追趕成長
      catchUpMaxGap: 2.5,             // 差距上限（對數），避免極貧國家追趕過快
      energyImportBase: 0.5,          // 能源進口：開放度為 0 時仍能進口的缺口比例（國際能源市場）
      tfpResearchRef: 0.02,           // 科研支出佔 GDP 達此比例時，知識累積速度加倍（領先國家的新知識來源）
      // 制度改革（示意值）：市場化程度與開放度逐步調整，執行成效取決於行政效率與穩定度
      plannedMarketMult: 0.5,         // 計畫經濟下，市場化程度的實際效果打折
      reformSpeed: 0.15,              // 每年向改革目標靠近的比例（行政、穩定都滿分時）
      reformStallStability: 30,       // 穩定度低於此值時改革停滯，目標逐漸退回
      catchUpOpenBase: 0.4            // 追趕吸收能力：開放度為 0 時仍保留的比例
    },
    politics: {
      wLegitimacy: 0.08,
      wGrowth: 60,
      wFood: 18,
      wAdmin: 0.04,
      wSupport: 0.05,
      wConflict: 0.08,
      wCorruption: 0.05,
      wExhaustion: 0.15,
      wInflation: 30,
      legSupport: 0.08,
      supportAdjust: 0.2,
      conflictInequality: 0.1,
      conflictFood: 14,
      conflictLocal: 0.05,
      conflictEducation: 0.02,
      conflictStability: 0.05,
      conflictReversion: 0.08,
      corruptionDrift: 0.5,
      localPowerFromInstability: 0.05,
      inequalityAdjust: 0.05,
      stabilityReversion: 0.08,
      legitimacyReversion: 0.04,
      // 動亂疲乏（示意值，2026-11 健康檢查）：長期動盪後，社會對秩序的渴望會逐漸壓過衝突，讓國家有機會走出動亂
      turmoilThreshold: 35,           // 穩定度低於此值的年數會累積為「動亂年數」
      turmoilFatigueYears: 15,        // 累積這麼多年後，疲乏效果達到最大
      fatigueStability: 3,            // 疲乏最大時，每年對穩定度的正向推力
      fatigueConflict: 4              // 疲乏最大時，每年對社會衝突的降低
    },
    technology: {
      privateResearchShare: 0.002,
      diffusionDiscount: 0.5,         // 他國已發明時的研究成本折扣
      spilloverRate: 0.002,           // 經貿易傳播的被動研究進度
      adoptionRate: 0.08,
      prereqAdoption: 0.3,
      stageThresholds: [0.3, 0.7, 1.0]
    },
    military: {
      soldierCostFactor: 1.5,
      manpowerShare: 0.1,
      personnelAdjust: 0.1,
      warMobilization: 3,
      casualtyRate: 0.006,
      civilianRatio: 0.3,
      capitalDamage: 0.004,
      exhaustionBase: 1.2,
      exhaustionCasualty: 300,
      peaceScore: 70,
      peaceExhaustion: 75,
      maxWarMonths: 72,
      territoryScore: 40,
      truceMonths: 60
    },
    diplomacy: {
      adjust: 0.04,
      tradeWeight: 25,
      allianceBonus: 20,
      sameRegime: 10,
      democracyVsAutocracy: -10,
      socialistGap: -25,
      armsRace: -8,
      memoryDecay: 0.97,
      tradeAdjust: 0.05,
      threatWeight: -8,
      ambition: -10,
      orgFormRelation: 50,
      orgFormMembers: 3
    },
    agents: {
      decisionInterval: 3,            // 每幾個月決策一次
      minScore: 0.15,
      // 領導人性格（示意值）：性格只改變國家 AI 對政策的偏好分數，不直接改變任何核心數值。
      // 每項性格 0–1，0.5 為中性；分數加成 = (性格 − 0.5) × 係數。
      // reform（改革傾向）、aggr（冒險／侵略）沿用原本寫在程式裡的數值；care（重視民生）為新增，舊領導人沒有此值時視為中性。
      leaderTraitBias: {
        reform: { political_reform: 0.6, repression: -0.6 },
        aggr: { military_build: 0.3 },
        care: { welfare: 0.5, agri_invest: 0.3, food_import: 0.3, education: 0.2, raise_tax: -0.3 }
      },
      cooldownMonths: 24,
      warPowerRatio: 1.3,
      warRelation: -40
    },
    // 未來時代（示意值，2026-11 新增，全部尚未校準）：未來科技、全球風險與世界結局
    // 這些都是遊戲用的假設，不是預測。每項風險都依世界當時的狀態計算機率，用獨立的種子亂數判定。
    future: {
      // 氣候：暖化 = 起點暖化 + 係數 × 累積化石燃料使用量（近似「累積排放決定暖化」）
      warmingPerFossil: 0.0000013,    // 每單位累積化石能源使用造成的升溫（°C；1911 全世界劇本 2020 年約 1.2–1.3°C；8 國劇本範圍較小，約 0.8°C）
      warmingStartPerYear: 0.004,     // 起點年份在 1850 年以後時，起點已有的暖化（每年 °C）
      harvestLossFrom: 1.5,           // 暖化超過此溫度後收成開始下降
      harvestLoss: 0.06,              // 收成損失 = 係數 ×（暖化 − 門檻）^1.4
      harvestLossExp: 1.4,
      tropicsMult: 1.3,               // 低緯度（|緯度| < 25）受影響較大
      polarMult: 0.6,                 // 高緯度（|緯度| > 50）受影響較小
      climateDeathFrom: 2,            // 暖化超過此溫度後，熱浪、洪水、風災開始造成死亡
      climateDeath: 0.0012,           // 年死亡比例 = 係數 ×（暖化 − 門檻）²× 脆弱度
      tippingFrom: 3,                 // 超過此溫度後可能觸發氣候臨界點（永凍土、雨林崩潰）
      tippingChance: 0.025,           // 每年機率
      tippingMin: 0.4, tippingMax: 1.0, // 臨界點額外升溫（°C）
      captureRate: 0.015,             // 碳捕集完全普及時每年移除的累積排放比例
      // 核武：同時掌握核能與火箭（普及 ≥ 門檻）的國家視為擁核國
      nukeAdoption: 0.5,
      nukeWarChance: 0.02,            // 兩個擁核國交戰時，每年動用核武的基礎機率
      nukeOneSided: 0.01,             // 只有一方擁核、且擁核方戰況危急時
      nukeCrisisChance: 0.0008,       // 沒有開戰但互相敵視（關係 < 0）的擁核國之間，每年誤判或危機升級的機率（關係 −50 時）
      nukeCrisisPairs: 3,             // 只計算最敵對的幾對擁核國
      nukeClimateStress: 0.5,         // 暖化每超過 2°C 一度，危機機率增加的比例（糧食與難民壓力）
      nukeDeathMin: 0.1, nukeDeathMax: 0.35, // 交戰擁核國的直接死亡比例
      winterBase: 0.3, winterPerPower: 0.15, winterMax: 0.85, // 核子寒冬：全球收成減少比例
      winterYears: 7,
      winterDeath: 0.1,               // 核子寒冬期間每年的額外死亡比例（嚴重度 1 時）
      nukeAllyJoin: 0.5,              // 交戰一方的擁核盟國被捲入核子交火的機率
      // 人工智慧：能力（aiCap）與安全（align）的差距越大越危險
      aiRiskBase: 0.01,               // 通用 AI 出現後，每年事故機率 = 係數 × 差距²
      aiRaceMult: 2,                  // 領先國家在打仗或以擴張、安全為目標時（AI 軍備競賽）
      aiLesson: 0.4,                  // 每次 AI 事故後，全世界的安全意識增加
      alignMatureRate: 0.04,          // 可解釋 AI 普及後，每年安全程度持續累積
      alignMatureMax: 4,              // 持續累積的上限
      aiIncidentDeath: 0.004,
      aiEndGapFrom: 0.5,              // 超級智慧出現後，事故變成「失控」的機率 =（差距 − 此值）/ 2
      // 生物科技：人造瘟疫
      bioRiskBase: 0.004,
      bioDeathMax: 0.9,               // 嚴重度上限（實際死亡比例再依醫療水準降低，最多 95%）
      bioTail: 5,                     // 嚴重度 = 0.02 + 上限 × 亂數^此值：大多數不嚴重，極少數非常致命
      // 小行星：每年機率（遊戲化，真實機率小得多）；行星防禦普及後可以偏轉
      asteroidChance: 0.00025,
      asteroidDeathMin: 0.3, asteroidDeathMax: 0.95,
      // 火星殖民
      marsStart: 0.001,               // 第一批殖民者（百萬人）
      marsGrowth: 0.25,               // 每年成長率（受容量限制）
      marsCap: 2,                     // 基本容量（百萬人），核融合與超級智慧可提高
      marsSelfSustain: 1,             // 達到這個人口（百萬）視為可自給自足
      voyageYears: 150,               // 星際移民船抵達鄰近恆星需要的年數
      endFrac: 0.35,                  // 世界結局：人口跌到高峰的這個比例以下，視為文明崩潰
      stagnationYears: 25,            // 多少年沒有世界首創的新技術，介面就提示「文明停滯」並說明原因與可以做的事（只影響顯示）
      // 災難嚴重度分級（只用來顯示，不影響模擬；示意值）：任一項達到門檻就升一級 → 輕微／嚴重／重大／毀滅性
      severity: {
        deathShare: [0.001, 0.01, 0.1],  // 直接＋之後的死亡占當時世界人口
        warming: [0.3, 0.6, 0.9],        // 額外升溫（°C）
        harvest: [0.03, 0.1, 0.3]        // 全球平均收成下降（比例）
      }
    },
    // 神之手（玩家干預，示意值）：玩家用「神力」改變世界的條件，結果仍由引擎計算、不保證成功
    // 事件節奏（只影響自動播放什麼時候停下來、頭條怎麼挑，不影響模擬結果；示意值）
    pacing: {
      criticalMinShare: 0.03,         // 全球模式：戰爭或革命的當事國至少占世界人口 3% 才暫停（小部落、城邦的動盪收進年度摘要）
      headlineBigShare: 0.05,         // 頭條：當事國占世界人口 5% 以上算「大國」，分數不打折；越小的國家分數越低
      headlineSmallMult: 0.55,        // 頭條：極小國家事件的分數倍率（介於這個值與 1 之間）
      headlineMaxPerKind: 2           // 頭條：同一類（例如「政局」）每年最多幾則，避免多國改革淹沒其他重要故事
    },
    divine: {
      energyMax: 100,                 // 神力上限
      energyStart: 60,                // 世界建立時的神力
      energyRegenPerYear: 18,         // 每年恢復的神力（每月平均恢復）
      // 公共衛生援助：在一段時間內提高「醫療水準目標」，實際醫療水準仍依引擎每月慢慢調整
      healthCost: 25,
      healthBoost: 0.08,              // 醫療水準目標最多提高多少（0–1 刻度）
      healthYears: 8,                 // 援助持續年數（效果逐年遞減）
      healthLeakBase: 0.15,           // 至少被行政耗損掉的比例；腐敗越高耗損越多
      // 分享已知科技：開一條「知識管道」，每月給研究進度，速度取決於教育（吸收能力）
      techCost: 35,
      techMonthlyShare: 0.03,         // 每月相當於科技成本的比例（教育 50 時）
      techMonths: 36,                 // 管道開放月數
      // 啟發一項新發明（世界上還沒有人完成的技術；比分享已知科技慢、貴，停滯時讓玩家有事可做；示意值）
      inventCost: 45,
      inventMonthlyShare: 0.012,      // 每月相當於科技成本的比例（教育 50 時）
      inventMonths: 60,
      // 局部旱災：選中的地區今年收成大減，全國影響依地區比重而定
      droughtCost: 30,
      droughtSeverityMin: 0.35,       // 該地區收成損失比例（隨機介於最小與最大之間）
      droughtSeverityMax: 0.7,
      droughtMonths: 12,
      // 領導人候選者：只是「出現」在政壇，要等到政權自然更替時才可能上台
      leaderCost: 40,
      leaderYears: 10,                // 候選者在政壇活躍的年數，期間沒有更替就消失
      leaderWinChance: 0.6,           // 政權更替時，候選者勝出的機率（每次更替判斷一次）
      leaderTraitMin: 0.72,           // 候選者主要性格的下限（隨機介於下限與 0.95）
      // 未來時代的神之手（示意值）
      aisafetyCost: 35,               // 啟發 AI 安全研究：全世界的 AI 安全程度增加（依教育吸收，會慢慢淡化）
      aisafetyBoost: 0.8,
      aisafetyDecay: 0.02,            // 每年淡化比例
      calmCost: 40,                   // 化解核危機：一個擁核國動用核武的機率降低一段時間
      calmYears: 15,
      calmMult: 0.3,                  // 機率乘數（運氣決定實際在 0.3–0.6 倍之間）
      greenCost: 30,                  // 推動綠色轉型：一個國家潔淨能源比例提高一段時間
      greenYears: 20,
      greenBoost: 0.3,
      // 世界頭條：只在重大變化時出現
      headlinesPerYear: 3,
      headlineMinScore: 1,            // 低於此分數的變化不上頭條
      headlinePopPct: 2,              // 人口單年變化超過此 %，列為頭條候選
      headlineGdpPct: 8,              // GDP 單年變化超過此 %
      headlineStabilityDrop: 12       // 穩定度單年下降超過此值
    },
    events: {
      revolutionBase: 0.015,
      coupBase: 0.01,
      secessionBase: 0.004,
      electionInterval: 48,
      monarchDeath: 0.003,
      // 殖民地與自治領獨立（示意值）：每月基礎機率；殖民地另隨教育程度（民族意識）提高
      independenceBase: 0.003,
      independenceEduScale: 20,
      independenceNationEdu: 10,       // 教育超過此值開始形成民族意識
      independenceMovementEdu: 20,     // 教育超過此值，民族運動不必等宗主國衰退也能成功
      independenceWave: 0.4,           // 民族自決風潮：每多一個前殖民地獨立，其他殖民地機率乘上 (1 + 此值)，最多 3 倍
      independenceWaveMax: 3,
      independenceDominion: 0.003
    }
  };

  // ---- 遠古時代（engine/ancient-engine.js）參數：全部是示意值，尚未校準 ----
  // 糧食單位：「人年」（一個人一年所需的食物）。人口單位：百萬人。率都是「每年」。
  WS.ANCIENT_PARAMS = {
    // 時間刻度：越接近近代越細（年份以前用該步長）
    steps: [[-3000, 10], [-500, 5], [1e9, 2]],
    food: {
      forageScale: 0.1,               // 野生食物承載力 = 豐富度 × 面積 × 此值 × 氣候 × 科技
      forageEff: 1.12,                // 採集者在人少時每人可得的食物（> 1 才有剩餘）
      landProd: 0.12,                  // 可耕地承載力 = 可耕比例 × 面積 × 此值 × 科技
      farmEff: 1.5,                   // 農民在地多人少時每人可得的食物（作物完全馴化後）
      irrigationGain: 2.0,            // 灌溉讓可耕地承載力增加（乘上水源條件）
      knowGain: 0.8, knowScale: 1000, // 精耕經驗：土地生產力 + knowGain × 累積經驗 ÷ knowScale（累積速度依農民密度與交流）
      herdGain: 0.6,                  // 畜牧讓草原、乾旱地區的承載力增加（乘上可馴化動物）
      storageBase: 0.03,              // 不需陶器也能保存的食物（年）
      storageDecay: 0.15,             // 儲糧每年損耗
      droughtChance: 0.012,           // 每年地區性乾旱機率
      droughtHarvest: 0.75,           // 乾旱期間收成比例
      harvestSd: 0.05                 // 每期收成的隨機波動（以每年計，期長越長越平均）
    },
    pop: {
      birthForager: 0.034, birthFarmer: 0.044, birthUrban: 0.036,
      deathForager: 0.0322, deathFarmer: 0.0405, deathUrban: 0.047,
      healthMax: 0.006,               // 醫學與防疫最多降低的年死亡率（示意值）
      crowdDisease: 0.0025,           // 農業人口密度高時的額外死亡（家畜與群聚疾病）
      famineDeath: 0.35,              // 糧食安全每低於 1 的 1%，死亡率增加 0.35%
      famineBirth: 2.0,               // 糧食不足時出生率依此次方下降
      farmShift: 0.004,               // 農耕回報高於採集時，每年轉為農民的比例（乘上回報差）
      urbanAdjust: 0.02,              // 城市人口每年朝可支持的上限調整的速度
      cityPop: 0.015,                 // 一座城市約 15,000 人以上（一座「城市」代表一群城鎮）
      urbanProto: 0.002,              // 還沒有記帳時，剩餘糧食只能養活少數工匠（原始城鎮）
      urbanBase: 0.006,               // 有記帳後，可支持的城市人口比例（另加科技與政體）
      bandSize: 30, villageSize: 250, // 顯示用：遊獵群、村落的平均人數
      migrate: 0.0008,                // 農民向尚未務農的鄰近地區遷移的比例（每年）
      seedCarry: 0.35                 // 移民帶去的作物知識（相當於研究成本的比例）
    },
    tech: {
      researchBase: 2.0,              // 研究點數 = 此值 × √人口 × (1 + 城市比例加成) × 交流（每個可研究的科技各自累積）
      urbanBoost: 6,
      diffusion: 0.0035,              // 鄰近地區已普及的科技，每年經交流傳入的比例（乘上交流程度）
      adoptRate: 0.012,               // 新科技每年普及的速度
      luckMin: 0.5, luckMax: 1.6,         // 每個地區發明每項科技的難度倍數（隨機；讓發明年代每次不同）
      cropAdopt: 0.0015,              // 作物馴化的普及很慢（野生到完全馴化約上千年）
      knownAt: 0.5                    // 普及度超過此值，才算可以往下研究、傳給鄰居
    },
    exchange: { base: 10, settled: 15, urban: 150, urbanMax: 15, polity: 4, adjust: 0.05, aid: 0.25, seaNeedsSailing: 0.25, far: 0.005, farSail: 0.04 },
    // 接到近代：演進到這一年以後可以「進入近代」，把政體轉成近代國家（換算係數，示意值）
    bridge: {
      year: 1800,
      // 人均 GDP（1990 年國際元）＝ 基礎 ＋ 進階科技比例 × … ＋ 城市比例 × …
      // 對照：Maddison 1820 年世界平均約 670、西歐約 1,200、中國約 600、非洲約 420（示意值，量級對齊用）
      gdppcBase: 350, gdppcDev: 330, gdppcUrban: 900,
      // 教育指數：基礎＋文字＋紙＋印刷＋城市比例 × …（1800 年識字率多在 5–40%，示意值）
      eduBase: 2, eduWriting: 3, eduPaper: 3, eduPrinting: 7, eduUrban: 25, eduMax: 35,
      urbanScale: 1.0, urbanMax: 0.2, armyShare: 0.006,  // 城市化換算與上限、兵力占人口比例
      coalPerIronArea: 1.5, oilPerArea: 0.3,             // 礦藏（與 1911 劇本同單位，未經校準）
      // 政體能有效治理的人口比例（其餘地方自成小國或部族）：首都所在地區／其他地區，依政體型態（示意值）
      controlCapital: { chiefdom: 0.45, citystate: 0.35, kingdom: 0.75, empire: 0.85 },
      controlOther: { chiefdom: 0.3, citystate: 0.25, kingdom: 0.5, empire: 0.65 },
      controlCohesion: 0.3,        // 凝聚力的影響：控制比例 ×（1 − 此值 ＋ 此值 × 凝聚力/100）
      splitPop: 4,                 // 政體控制以外的人口，約每 400 萬人分成一個獨立國家（百萬人）
      minStatePop: 0.4,            // 低於這個人口不另成國家，併入該地區最大的國家（百萬人）
      maxSplit: 6                  // 每個地區最多分出幾個獨立國家
    },
    // 神之手（遠古）：只改變條件；神力每百年恢復（遠古一期好幾年）
    divine: {
      energyMax: 100, energyStart: 60,
      energyRegenPerCentury: 25,      // 每 100 年恢復的神力
      bountyCost: 20, bountyGain: 0.12, bountyYears: 30,      // 風調雨順：收成增加（乘上運氣）
      droughtCost: 25, droughtSev: 0.15, droughtYears: 30,    // 長期乾旱：收成減少（乘上運氣）
      inspireCost: 40, inspireShare: 0.03, inspireYears: 80   // 知識啟發：每年給研究成本的比例（交流越活躍吸收越快）
    },
    polity: {
      chiefdomDensity: 0.1,           // 農民密度（百萬人／面積）超過此值才可能形成酋邦
      formChance: 0.002,              // 條件成立時每年形成的機率
      upgradeChance: 0.01,
      attackChance: 0.004,            // 每年考慮對外擴張的機率
      attackRatio: 1.3,               // 兵力比至少這麼高才會出兵
      collapseOverload: 0.006,        // 管轄地區超過行政能力時，每多一個地區每年瓦解機率
      collapseFamine: 0.02,           // 首都饑荒時每年瓦解機率
      collapseBase: 0.0006,
      tribute: 0.02                   // 每個附屬地區讓首都可支持的城市人口比例增加
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
