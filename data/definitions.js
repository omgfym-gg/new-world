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
    satellite: { name: '人造衛星', field: 'space', cost: 150, req: ['rocketry', 'computing'], effects: { serv: 0.05, admin: 3 } },
    // ===== 未來科技（示意值）：什麼時候出現由研究進度決定，不寫死年份 =====
    // renew：潔淨能源比例；aiCap：AI 能力；align：AI 安全；bio：生物科技風險；defense：行星防禦；capture：碳捕集
    renewables: { name: '再生能源', field: 'energy', cost: 600, req: ['nuclear', 'computing'], future: true, effects: { renew: 0.35 } },
    genetics: { name: '基因工程', field: 'medicine', cost: 300, req: ['antibiotics', 'computing'], future: true, effects: { health: 0.06, agri: 0.1, bio: 0.4 } },
    ai: { name: '人工智慧', field: 'info', cost: 400, req: ['internet'], future: true, effects: { serv: 0.15, ind: 0.1, admin: 2, aiCap: 1 } },
    reusable: { name: '可回收火箭', field: 'space', cost: 500, req: ['satellite'], future: true, effects: { serv: 0.02 } },
    alignment: { name: 'AI 安全研究', field: 'info', cost: 700, req: ['ai'], future: true, effects: { align: 1.5 } },
    agi: { name: '通用人工智慧', field: 'info', cost: 1500, req: ['ai'], future: true, effects: { serv: 0.3, ind: 0.3, admin: 4, aiCap: 2 } },
    synbio: { name: '合成生物學', field: 'medicine', cost: 1200, req: ['genetics', 'ai'], future: true, effects: { health: 0.06, agri: 0.2, bio: 1 } },
    pdefense: { name: '行星防禦', field: 'space', cost: 1200, req: ['reusable'], future: true, effects: { defense: 1 } },
    capture: { name: '碳捕集與氣候工程', field: 'energy', cost: 1500, req: ['renewables', 'synbio'], future: true, effects: { capture: 1 } },
    fusion: { name: '核融合', field: 'energy', cost: 2500, req: ['renewables', 'agi'], future: true, effects: { renew: 1, ind: 0.1 } },
    mars: { name: '火星殖民', field: 'space', cost: 2000, req: ['reusable', 'ai'], future: true, effects: { space: 1 } },
    interp: { name: '可解釋 AI', field: 'info', cost: 2500, req: ['alignment', 'agi'], future: true, effects: { align: 3 } },
    asi: { name: '超級智慧', field: 'info', cost: 5000, req: ['agi'], future: true, effects: { serv: 0.5, ind: 0.5, admin: 6, aiCap: 4 } },
    interstellar: { name: '星際航行', field: 'space', cost: 400000, req: ['mars', 'fusion', 'asi'], future: true, effects: { stars: 1 } }
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
    },
    // ===== 2026-11-25 新增：讓玩家把世界變成想要的模樣（效果都經公式計算，係數在 params.rules，示意值）=====
    work: {
      name: '工作', category: '經濟', type: 'choice', default: 'work',
      choices: [['work', '人人工作謀生'], ['ubi', '全民基本收入'], ['postwork', '人們不需要工作']],
      affects: ['經濟', '人口', '政治'],
      conversion: {
        work: ['人們回到原本的工作方式，勞動參與逐年恢復'],
        ubi: [
          '每個人都領到基本收入，不工作也能生活',
          '工作的人略減（勞動參與 ×0.95），儲蓄率略降',
          '貧富差距目標下降、民眾支持上升',
          '變化逐年發生，不是一夕之間'
        ],
        postwork: [
          '人們不再需要工作：大部分人離開工作崗位（勞動參與逐年降到約一成）',
          '空出來的工作只能由機器補上：補得了多少取決於農業機械、自動化、電腦、AI 普及程度',
          '機器不夠時產出會下降；糧食不足時，人們會被迫回到田裡',
          '空閒時間讓教育與知識累積加快，貧富差距縮小'
        ]
      }
    },
    fossil: {
      name: '石油與煤', category: '資源', type: 'bool', default: true,
      on: '地底有石油與煤', off: '地球沒有石油與煤',
      affects: ['資源', '經濟', '氣候'],
      offConversion: [
        '地底下的石油與煤全部消失，已開採的存量也一起消失',
        '能源只剩水力、木材等（約原本產能的四分之一），國際上也買不到化石燃料',
        '工業與服務業因能源不足而減產',
        '不再排放化石燃料的溫室氣體；再生能源、核能出現後能源才會恢復'
      ],
      onConversion: ['石油與煤重新出現（回到消失前的儲量）']
    },
    lifespan: {
      name: '壽命', category: '人口', type: 'choice', default: 'normal',
      choices: [['normal', '一般壽命'], ['long', '長壽'], ['ageless', '人類不會變老']],
      affects: ['人口', '經濟'],
      conversion: {
        normal: ['死亡率回到一般水準'],
        long: ['中老年死亡率降低（25–64 歲 ×0.75、65 歲以上 ×0.5）', '老年人口比例上升'],
        ageless: [
          '人不再衰老：成年人幾乎不會進入老年，死亡率降到原本的四成',
          '仍在生育年齡的人口與勞動力持續增加',
          '人口快速增加，之後要面對糧食與能源是否足夠'
        ]
      }
    },
    religion: {
      name: '宗教', category: '社會', type: 'choice', default: 'natural',
      choices: [['natural', '依歷史'], ['none', '沒有宗教'], ['theocracy', '政教合一']],
      affects: ['人口', '政治', '科技'],
      conversion: {
        natural: ['宗教回到各地原本的樣子'],
        none: ['生育率略降（×0.9）', '教育推廣略快（×1.1）', '君主專制失去「君權神授」，合法性逐年下降'],
        theocracy: ['宗教權威支持政府，各國合法性逐年上升', '生育率略升（×1.12）', '教育與研究受限（×0.8）', '教育越普及，人民與宗教權威的摩擦越大']
      }
    },
    language: {
      name: '語言', category: '社會', type: 'bool', default: false,
      on: '全世界說同一種語言', off: '各說各的語言',
      affects: ['外交', '科技', '經濟'],
      onConversion: ['各國之間的關係多了「共同語言」的好感', '貿易量增加（×1.3）', '追趕先進國家、引進他國醫療與科技都更快'],
      offConversion: ['各國回到各自的語言']
    },
    gender: {
      name: '性別平等', category: '社會', type: 'bool', default: false,
      on: '女性從一開始就與男性平等', off: '依歷史',
      affects: ['經濟', '人口'],
      onConversion: ['女性和男性一樣工作、受教育：勞動參與逐年提高（×1.15）', '教育推廣加快（×1.15）', '生育率略降（×0.92）'],
      offConversion: ['勞動參與與教育回到歷史樣態']
    },
    birth: {
      name: '生育', category: '人口', type: 'choice', default: 'natural',
      choices: [['natural', '自然生育'], ['one', '全球一胎化'], ['more', '鼓勵生育']],
      affects: ['人口', '政治'],
      conversion: {
        natural: ['生育回到自然狀態'],
        one: ['全世界每個家庭只能生一個孩子（出生數 ×0.55）', '強制政策降低民眾支持', '幾十年後勞動力減少、人口老化'],
        more: ['各國鼓勵生育（出生數 ×1.2）', '人口增加，糧食壓力也增加']
      }
    },
    nukes: {
      name: '核武', category: '軍事', type: 'bool', default: true,
      on: '可以製造核武', off: '核武從未出現',
      affects: ['軍事', '未來'],
      offConversion: ['沒有國家能製造原子彈或核彈', '戰爭中不會出現原子彈轟炸，未來也不會有核子戰爭與核子寒冬'],
      onConversion: ['各國之後可以研發原子彈（只在戰時、有足夠科研能力時）']
    },
    government: {
      name: '各國政體', category: '政治', type: 'choice', default: 'natural',
      choices: [['natural', '依歷史'], ['democracy', '全部改為民主共和'], ['monarchy', '全部改為君主專制']],
      affects: ['政治', '外交'],
      conversion: {
        natural: ['各國維持現在的政體，之後照常演變'],
        democracy: ['所有獨立國家改為民主共和（殖民地仍由宗主國統治）', '之後仍可能因政變、革命再改變'],
        monarchy: ['所有獨立國家改為君主專制（殖民地仍由宗主國統治）', '之後仍可能因革命、民主化再改變']
      }
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
    },
    {
      id: 'states_government',
      test: (r) => r.states === false && r.government != null && r.government !== 'natural',
      text: '「沒有國家」與「各國政體」互相衝突：沒有國家時就沒有民主或君主政府。',
      options: [
        { label: '政體改回依歷史', set: { government: 'natural' } },
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
    { re: /(禁止|封閉)移民/, set: { migration: 0 }, text: '移民 → 禁止' },
    { re: /(不需要|不用|不必|免於)(工作|上班|勞動)|後工作|機器.{0,6}(代替|取代).{0,4}(人|工作)/, set: { work: 'postwork' }, text: '工作 → 人們不需要工作' },
    { re: /基本收入|UBI/i, set: { work: 'ubi' }, text: '工作 → 全民基本收入' },
    { re: /(沒有|無|不存在|沒了)(石油|煤|化石燃料)/, set: { fossil: false }, text: '石油與煤 → 地球沒有石油與煤' },
    { re: /(不會|不再|永不)(變老|衰老|老)|長生不老|永保青春/, set: { lifespan: 'ageless' }, text: '壽命 → 人類不會變老' },
    { re: /長壽|活到\s*\d{3}/, set: { lifespan: 'long' }, text: '壽命 → 長壽' },
    { re: /(沒有|無|取消|廢除|不存在)宗教/, set: { religion: 'none' }, text: '宗教 → 沒有宗教' },
    { re: /政教合一|神權/, set: { religion: 'theocracy' }, text: '宗教 → 政教合一' },
    { re: /(同|一)(一)?種語言|共同語言|語言.{0,2}(相同|統一)/, set: { language: true }, text: '語言 → 全世界說同一種語言' },
    { re: /性別平等|男女平等|女性.{0,6}(平等|一樣)/, set: { gender: true }, text: '性別平等 → 女性從一開始就與男性平等' },
    { re: /一胎/, set: { birth: 'one' }, text: '生育 → 全球一胎化' },
    { re: /鼓勵生育|多生/, set: { birth: 'more' }, text: '生育 → 鼓勵生育' },
    { re: /(沒有|無|禁止|不存在)(核武|核彈|原子彈)|無核|(核武|核彈|原子彈).{0,2}(從未|沒有)(出現|發明)/, set: { nukes: false }, text: '核武 → 核武從未出現' },
    { re: /(全|都)(是|為|改為)?民主|民主.{0,2}世界/, set: { government: 'democracy' }, text: '各國政體 → 全部改為民主共和' },
    { re: /(全|都)(是|為|改為)?(君主|帝制|王國)/, set: { government: 'monarchy' }, text: '各國政體 → 全部改為君主專制' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
