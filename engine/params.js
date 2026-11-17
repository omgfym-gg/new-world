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
    // 神之手（玩家干預，示意值）：玩家用「神力」改變世界的條件，結果仍由引擎計算、不保證成功
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
})(typeof window !== 'undefined' ? window : globalThis);
