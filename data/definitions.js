// 科技、制度、世界規則定義（資料層，可擴充）
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.Data = WS.Data || {};

  // 科技：cost 為研究成本（十億國際元的研究投入），effects 為各部門或系統的效果
  WS.Data.techFields = {
    agri: '農業', industry: '工業', energy: '能源', medicine: '醫療',
    info: '資訊', transport: '交通', military: '軍事', space: '太空'
  };
  WS.Data.techs = {
    fertilizer: { name: '化學肥料', field: 'agri', cost: 15, req: [], effects: { agri: 0.2 } },
    tractor: { name: '農業機械化', field: 'agri', cost: 30, req: ['fertilizer', 'ice'], effects: { agri: 0.3, agriLabour: 0.15 } },
    green: { name: '綠色革命', field: 'agri', cost: 60, req: ['tractor', 'petrochem'], effects: { agri: 0.5, agriLabour: 0.1 } },
    electrification: { name: '電氣化', field: 'industry', cost: 12, req: [], effects: { ind: 0.25, serv: 0.05 } },
    assembly: { name: '流水線生產', field: 'industry', cost: 25, req: ['electrification'], effects: { ind: 0.3 } },
    automation: { name: '自動化工業', field: 'industry', cost: 80, req: ['assembly', 'computing'], effects: { ind: 0.5 } },
    ice: { name: '內燃機', field: 'energy', cost: 10, req: [], effects: { oil: 1, ind: 0.05 } },
    petrochem: { name: '石油化工', field: 'energy', cost: 30, req: ['ice'], effects: { ind: 0.1, energyEff: 0.1 } },
    nuclear: { name: '核能', field: 'energy', cost: 90, req: ['petrochem', 'computing'], effects: { energyCap: 0.3 } },
    sanitation: { name: '公共衛生', field: 'medicine', cost: 8, req: [], effects: { health: 0.1 } },
    vaccines: { name: '疫苗普及', field: 'medicine', cost: 20, req: ['sanitation'], effects: { health: 0.12 } },
    antibiotics: { name: '抗生素', field: 'medicine', cost: 35, req: ['vaccines'], effects: { health: 0.15 } },
    radio: { name: '無線電', field: 'info', cost: 10, req: ['electrification'], effects: { serv: 0.05, admin: 3 } },
    computing: { name: '電子計算', field: 'info', cost: 70, req: ['radio'], effects: { serv: 0.15, admin: 5 } },
    internet: { name: '網際網路', field: 'info', cost: 150, req: ['computing'], effects: { serv: 0.3 } },
    railway: { name: '鐵路網', field: 'transport', cost: 8, req: [], effects: { ind: 0.1, serv: 0.05, logistics: 0.4 } },
    automobile: { name: '汽車普及', field: 'transport', cost: 25, req: ['ice'], effects: { serv: 0.1, ind: 0.05 } },
    aviation: { name: '航空運輸', field: 'transport', cost: 45, req: ['automobile'], effects: { serv: 0.08 } },
    machinegun: { name: '機槍與現代火炮', field: 'military', cost: 8, req: [], effects: { mil: 0.3 } },
    armor: { name: '裝甲部隊', field: 'military', cost: 25, req: ['ice', 'machinegun'], effects: { mil: 0.4 } },
    jet: { name: '噴射機', field: 'military', cost: 60, req: ['aviation', 'armor'], effects: { mil: 0.5 } },
    rocketry: { name: '火箭技術', field: 'space', cost: 80, req: ['jet', 'petrochem'], effects: { mil: 0.2 } },
    satellite: { name: '人造衛星', field: 'space', cost: 150, req: ['rocketry', 'computing'], effects: { serv: 0.05, admin: 3 } }
  };
  WS.Data.techStages = ['理論研究', '技術突破', '原型製作', '實際應用', '大規模普及'];

  // 政治制度：family 用於外交相似度；可在模擬中動態新增制度（見 Events.createRegime）
  WS.Data.regimes = {
    monarchy: { name: '君主專制', family: 'autocracy', elections: false, repression: true },
    constitutional: { name: '君主立憲', family: 'mixed', elections: true, repression: true },
    republic: { name: '共和民主', family: 'democracy', elections: true, repression: false },
    authoritarian: { name: '威權政體', family: 'autocracy', elections: false, repression: true },
    warlord: { name: '軍閥割據', family: 'autocracy', elections: false, repression: true },
    socialist: { name: '社會主義', family: 'socialist', elections: false, repression: true, planned: true },
    commune: { name: '地區共治', family: 'commune', elections: true, repression: false, planned: true },
    colonial: { name: '殖民統治', family: 'autocracy', elections: false, repression: true }
  };

  WS.Data.goals = {
    stabilize: '恢復國內穩定', expand: '擴張勢力', prosper: '經濟繁榮',
    security: '國家安全', industrialize: '工業化', tech: '科技優先', peace: '和平合作', sharing: '資源共享'
  };

  // 世界規則定義（第十一章）
  WS.Data.rules = {
    currency: {
      name: '貨幣制度', category: '經濟', type: 'bool', default: true,
      on: '使用貨幣', off: '沒有貨幣',
      affects: ['經濟', '外交', '人口'],
      offConversion: [
        '價格機制改為非貨幣分配（配給與勞動記錄）',
        'GDP 改為「替代性估值」，僅作歷史比較，不代表市場價格',
        '通貨膨脹與國債停止計算，政府只能使用當期撥用的資源',
        '國際貿易改為以物易物，貿易量下降',
        '生產誘因下降（效率係數 0.93），分配不均降低',
        '負責分配的機構掌握權力，腐敗會緩慢上升（新階級風險）'
      ]
    },
    capitalism: {
      name: '資本主義', category: '經濟', type: 'bool', default: true,
      on: '存在資本主義', off: '沒有資本主義',
      affects: ['經濟', '政治', '科技'],
      offConversion: [
        '生產資料改為公有或集體所有，投資由計畫分配',
        '儲蓄率改為計畫值，私人研發停止',
        '分配不均目標下降，服務業效率略降',
        '計畫管理者權力集中，腐敗風險上升'
      ]
    },
    states: {
      name: '國家制度', category: '政治', type: 'bool', default: true,
      on: '存在國家', off: '沒有國家',
      affects: ['政治', '外交', '軍事', '經濟'],
      offConversion: [
        '保留原國家的行政區域、人口及資源',
        '行政管理權轉移給「地區共治體」',
        '重新建立地區之間的合作關係，原有敵對降溫',
        '軍隊縮編為地區民兵，國家間戰爭不再可能',
        '轉換初期行政效率下降，之後觀察新制度能否穩定'
      ]
    },
    war: {
      name: '戰爭', category: '軍事', type: 'bool', default: true,
      on: '允許戰爭', off: '禁止戰爭',
      affects: ['軍事', '外交'],
      offConversion: ['各國不能宣戰，正在進行的戰爭改為停火', '軍費仍可維持，但擴軍的外交效果下降']
    },
    techSpeed: {
      name: '科技發展速度', category: '科技', type: 'choice', default: 1,
      choices: [[0.5, '緩慢'], [1, '歷史速度'], [1.5, '加速'], [2, '高速']],
      affects: ['科技']
    },
    resourceSharing: {
      name: '資源共享', category: '資源', type: 'bool', default: false,
      on: '全球共享糧食與能源', off: '各自管理',
      affects: ['資源', '外交'],
      onConversion: ['糧食庫存超過 4 個月的地區，把盈餘送往短缺地區', '能源盈餘產能分給能源不足地區']
    },
    migration: {
      name: '移民', category: '人口', type: 'choice', default: 1,
      choices: [[0, '禁止移民'], [1, '一般'], [2, '自由移民']],
      affects: ['人口']
    }
  };

  // 規則衝突（第 11.3 節）：不自行猜測，要求玩家選擇
  WS.Data.ruleConflicts = [
    {
      id: 'currency_capitalism',
      test: (r) => r.currency === false && r.capitalism === true,
      text: '「沒有貨幣」與「存在資本主義」互相衝突：資本主義需要以貨幣計價的資本市場。',
      options: [
        { label: '同時關閉資本主義', set: { capitalism: false } },
        { label: '恢復貨幣制度', set: { currency: true } }
      ]
    },
    {
      id: 'states_war',
      test: (r) => r.states === false && r.war === true,
      text: '「沒有國家」與「允許戰爭」互相衝突：沒有國家時不存在國家間戰爭。',
      options: [
        { label: '同時禁止戰爭', set: { war: false } },
        { label: '恢復國家制度', set: { states: true } }
      ]
    }
  ];

  // 自然語言 → 規則（第一版：關鍵字解析，不依賴外部 AI）
  WS.Data.nlPatterns = [
    { re: /(沒有|無|取消|廢除|不使用)貨幣/, set: { currency: false }, text: '貨幣制度 → 關閉' },
    { re: /(沒有|無|取消|廢除)資本主義|非資本主義/, set: { capitalism: false }, text: '資本主義 → 關閉' },
    { re: /(沒有|無|取消|廢除)國家/, set: { states: false }, text: '國家制度 → 關閉' },
    { re: /(禁止|沒有|無|取消)戰爭|和平世界/, set: { war: false }, text: '戰爭 → 禁止' },
    { re: /共同管理|資源共享|共享資源|共同分配/, set: { resourceSharing: true }, text: '資源 → 全球共享' },
    { re: /科技.{0,4}(加速|快速|提前|飛躍)/, set: { techSpeed: 1.5 }, text: '科技發展 → 加速' },
    { re: /科技.{0,4}(停滯|緩慢|減慢)/, set: { techSpeed: 0.5 }, text: '科技發展 → 緩慢' },
    { re: /(自由|開放)移民/, set: { migration: 2 }, text: '移民 → 自由' },
    { re: /(禁止|封閉)移民/, set: { migration: 0 }, text: '移民 → 禁止' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
