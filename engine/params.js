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
      transitionUrban: 0.5,           // 人口轉型：城市化降低生育
      transitionEdu: 0.006,           // 人口轉型：教育降低生育
      migrationPull: 0.001,           // 人均GDP相對差距造成的遷移傾向
      migrationConflictPush: 0.004,
      migrationCap: 0.003,
      eduGainPerGdpShare: 120,        // 教育支出佔GDP比重對教育水準的年增效果
      eduDecay: 0.1,
      eduUrban: 0.5,
      healthAdjustRate: 0.1,
      healthWelfareGain: 2.0
    },
    environment: {
      harvestSd: 0.06,
      droughtChance: 0.03,
      droughtHarvest: 0.8,
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
      importFoodGdppcRef: 2000
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
      legitimacyReversion: 0.04
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
      cooldownMonths: 24,
      warPowerRatio: 1.3,
      warRelation: -40
    },
    events: {
      revolutionBase: 0.015,
      coupBase: 0.01,
      secessionBase: 0.004,
      electionInterval: 48,
      monarchDeath: 0.003
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
