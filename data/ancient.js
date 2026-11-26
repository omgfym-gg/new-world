// 遠古時代資料（第一版）：西元前 10,000 年劇本的地區、遠古科技樹、時代名稱。
// 設計依據：docs/ancient-era.md。所有數值都是示意值（可信度 C／D），只描述「地理條件」與「起點狀態」，
// 不寫任何「某年一定發生某事」：農業、城市、文字、國家都由引擎依條件逐步形成。
// 單位：人口＝百萬人；面積＝相對單位（約 50 萬平方公里）。
(function (root) {
  const WS = (root.WS = root.WS || {});
  WS.Data = WS.Data || {};

  // 地理條件（0–1）：
  //   wild 野生食物豐富度、arable 可耕地比例、river 可靠水源（大河）、plants 可馴化植物、animals 可馴化動物、
  //   copper／tin／iron 礦產、coast 海岸與航行條件。climate：氣候代理資料（相對於現代的野生食物與可耕倍數，年份內插）。
  // places：當地城市名稱與能用這個名字的年代範圍 [名稱, 最早, 最晚]（約略為考古／史料中這個聚落或城市存在的年代，可信度 C；沒寫最晚＝延續到近代）。
  //   引擎依序取第一個「建城年份在範圍內」、還沒用過的名字，所以西元前 3000 年不會出現「羅馬」，也不會在上山文化結束後才出現「上山」；沒有合適的名字時用「某地第 n 城」。
  // links：相鄰地區 [代號, 連接方式]，land＝陸路、sea＝需要航海、far＝極遠（需要航海且很慢）。
  const R = (id, name, short, color, lat, lon, o) => Object.assign({ id, name, short, color, lat, lon, climate: null, start: {} }, o);
  WS.Data.ancientRegions = [
    R('FER', '肥沃月彎', '兩河', '#f59e0b', 34, 42, { area: 6, wild: 0.3, arable: 0.3, river: 0.8, plants: 1.0, animals: 1.0, copper: 0.6, tin: 0.1, iron: 0.5, coast: 0.4,
      start: { pop: 0.25, techs: { microliths: 1 } }, links: [['ANA', 'land'], ['NIL', 'land'], ['IND', 'land'], ['STE', 'land']],
      places: [['耶利哥', -8000], ['耶莫', -7000, -5800], ['哈蘇納', -6000, -5000], ['埃利都', -5400, -600], ['瑪特勞耶', -5300, -4500], ['泰佩高拉', -5000, -1500], ['烏魯克', -4500, 300], ['布拉克', -4000, -1200], ['哈穆卡爾', -4000, -3500], ['烏爾', -3800, -500], ['基什', -3100, -300], ['拉格什', -2900, -1800], ['馬里', -2900, -1760], ['尼尼微', -2600, -612], ['亞述', -2500], ['巴比倫', -2300], ['塞琉西亞', -305, 240], ['泰西封', -120, 637], ['巴斯拉', 636], ['庫法', 638], ['摩蘇爾', 700], ['巴格達', 762]] }),
    R('NIL', '尼羅河谷', '尼羅', '#eab308', 26, 32, { area: 3, wild: 0.15, arable: 0.3, river: 1.0, plants: 0.25, animals: 0.3, copper: 0.3, tin: 0, iron: 0.2, coast: 0.3,
      start: { pop: 0.06, techs: { microliths: 1 } }, links: [['FER', 'land'], ['SAH', 'land'], ['SSA', 'land']],
      places: [['法尤姆', -5200], ['梅林德', -5000, -4100], ['巴達里', -4400, -4000], ['納加達', -4000, -3000], ['希拉孔波利斯', -3800, -2000], ['阿拜多斯', -3500], ['孟斐斯', -3100], ['象島', -3000], ['赫利奧波利斯', -3000], ['底比斯', -2100], ['亞歷山卓', -331], ['福斯塔特', 641, 1168], ['開羅', 969]] }),
    R('ANA', '安那托利亞與地中海東岸', '安那', '#fb923c', 39, 33, { area: 5, wild: 0.25, arable: 0.3, river: 0.3, plants: 0.6, animals: 0.7, copper: 0.8, tin: 0.3, iron: 0.7, coast: 0.6,
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['FER', 'land'], ['EUR', 'land'], ['STE', 'land']],
      places: [['恰約尼', -8600, -6800], ['加泰土丘', -7400, -5700], ['哈吉拉爾', -7000, -5000], ['比布魯斯', -3000], ['特洛伊', -3000, 500], ['烏加里特', -3000, -1185], ['西頓', -3000], ['推羅', -2700], ['大馬士革', -2500], ['卡內什', -2000, -1700], ['哈圖沙', -2000, -1180], ['耶路撒冷', -2000], ['以弗所', -1000, 600], ['拜占庭', -660, 330], ['安條克', -300], ['君士坦丁堡', 330]] }),
    R('EUR', '歐洲', '歐洲', '#60a5fa', 48, 12, { area: 18, wild: 0.2, arable: 0.55, river: 0.5, plants: 0.1, animals: 0.2, copper: 0.4, tin: 0.5, iron: 0.8, coast: 0.6,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['ANA', 'land'], ['STE', 'land'], ['SAH', 'sea']],
      places: [['萊潘斯基維爾', -9500, -5500], ['喬伊魯基蒂亞', -7000, -4000], ['塞斯克洛', -6800, -4400], ['卡拉諾沃', -6200, -4000], ['沃格拉克', -5300, -4500], ['迪米尼', -4800, -4000], ['瓦爾納', -4600, -4200], ['塔利揚基', -4000, -3600], ['斯卡拉布雷', -3200, -2500], ['克諾索斯', -2000], ['邁錫尼', -1600, -468], ['雅典', -1400], ['里斯本', -1000], ['斯巴達', -900], ['科林斯', -900], ['迦太基', -800], ['塞維亞', -800], ['羅馬', -750], ['敘拉古', -730], ['馬薩利亞', -600], ['米蘭', -400], ['巴黎', -250], ['里昂', -43], ['倫敦', 50], ['科隆', 50], ['維也納', 100], ['威尼斯', 450], ['基輔', 500], ['布拉格', 800], ['諾夫哥羅德', 860], ['克拉科夫', 1000], ['莫斯科', 1147]] }),
    R('STE', '歐亞草原', '草原', '#a3e635', 48, 62, { area: 30, wild: 0.08, arable: 0.08, river: 0.2, plants: 0.05, animals: 0.8, copper: 0.5, tin: 0.3, iron: 0.4, coast: 0.05,
      start: { pop: 0.15, techs: { microliths: 1 } }, links: [['EUR', 'land'], ['ANA', 'land'], ['FER', 'land'], ['IND', 'land'], ['YEL', 'land'], ['EAS', 'land']],
      places: [['哲通', -6000, -5000], ['博泰', -3700, -3100], ['納馬茲加', -3500, -1000], ['戈努爾', -2400, -1600], ['辛塔什塔', -2100, -1800], ['阿爾凱姆', -2000, -1600], ['撒馬爾罕', -700], ['布哈拉', -500], ['梅爾夫', -500, 1221], ['塔什干', 100], ['喀山', 1000]] }),
    R('IND', '印度河流域', '印度河', '#f472b6', 27, 70, { area: 6, wild: 0.2, arable: 0.45, river: 0.8, plants: 0.4, animals: 0.5, copper: 0.3, tin: 0.1, iron: 0.4, coast: 0.3,
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['FER', 'land'], ['STE', 'land'], ['GAN', 'land']],
      places: [['梅赫爾格爾', -7000, -2500], ['拉希加里', -4600, -1800], ['卡利班甘', -3500, -1800], ['哈拉帕', -3300, -1300], ['科特迪吉', -3300, -1800], ['朵拉維拉', -3000, -1500], ['摩亨佐達羅', -2600, -1700], ['甘維里瓦拉', -2600, -1800], ['蘇特卡根多', -2500, -1800], ['洛塔爾', -2400, -1900], ['塔克西拉', -1000, 500], ['木爾坦', -500], ['白沙瓦', 100], ['拉合爾', 1000]] }),
    R('GAN', '恆河與印度半島', '恆河', '#e879f9', 21, 80, { area: 15, wild: 0.3, arable: 0.55, river: 0.6, plants: 0.35, animals: 0.4, copper: 0.3, tin: 0.1, iron: 0.6, coast: 0.6,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['IND', 'land'], ['YAN', 'far'], ['SEA', 'land']],
      places: [['喬帕尼曼多', -9000, -7000], ['達姆達馬', -8000, -5000], ['拉胡拉德瓦', -7000, -600], ['馬哈加拉', -6000, -4500], ['科爾迪瓦', -6000, -1500], ['切蘭德', -2500, 200], ['布迪哈爾', -2300, -1800], ['森努瓦', -1800, -200], ['因阿姆加奧恩', -1600, -700], ['帕伊亞姆帕利', -1500, -300], ['瓦拉納西', -1200], ['王舍城', -1000], ['舍衛城', -800], ['烏賈因', -700], ['卡瑙季', -500], ['華氏城', -490], ['馬杜賴', -300], ['德里', 700], ['維查耶那加爾', 1336, 1565], ['阿格拉', 1500]] }),
    R('YEL', '黃河流域', '黃河', '#ef4444', 35, 112, { area: 8, wild: 0.22, arable: 0.6, river: 0.7, plants: 0.85, animals: 0.5, copper: 0.5, tin: 0.4, iron: 0.6, coast: 0.3,
      start: { pop: 0.2, techs: { microliths: 1, pottery: 1 } }, links: [['YAN', 'land'], ['STE', 'land'], ['EAS', 'land']],
      places: [['賈湖', -7000, -5700], ['裴李崗', -7000, -5000], ['磁山', -6000, -5000], ['大地灣', -6000, -2800], ['仰韶', -5000, -3000], ['半坡', -4800, -3600], ['姜寨', -4600, -3000], ['大汶口', -4100, -2600], ['廟底溝', -4000, -2800], ['雙槐樹', -3300, -2500], ['西山', -3300, -2800], ['城子崖', -2500, -1600], ['陶寺', -2300, -1900], ['石峁', -2300, -1800], ['王城崗', -2100, -1500], ['二里頭', -1900, -1500], ['新砦', -1850, -1600], ['殷', -1300, -1046], ['鎬京', -1050, -771], ['洛邑', -1040, -200], ['臨淄', -850], ['邯鄲', -500], ['太原', -497], ['大梁', -360, -225], ['咸陽', -350, -206], ['長安', -202, 904], ['洛陽', -200], ['汴京', 960, 1127], ['大都', 1267, 1368], ['西安', 1369], ['北京', 1403]] }),
    R('YAN', '長江流域', '長江', '#f87171', 29, 114, { area: 8, wild: 0.3, arable: 0.55, river: 0.9, plants: 0.85, animals: 0.4, copper: 0.5, tin: 0.4, iron: 0.5, coast: 0.4,
      start: { pop: 0.2, techs: { microliths: 1, pottery: 1 } }, links: [['YEL', 'land'], ['SEA', 'land'], ['GAN', 'far']],
      places: [['上山', -8000, -6500], ['彭頭山', -7000, -6100], ['八十壋', -6500, -5500], ['跨湖橋', -6000, -5000], ['河姆渡', -5000, -3300], ['城頭山', -4500, -2500], ['大溪', -4400, -3300], ['凌家灘', -3600, -3000], ['良渚', -3300, -2300], ['屈家嶺', -3000, -2500], ['石家河', -2500, -1800], ['寶墩', -2500, -1800], ['三星堆', -1700, -1100], ['盤龍城', -1500, -1300], ['郢', -690, -278], ['吳', -510, -473], ['會稽', -500], ['揚州', -486], ['成都', -310], ['長沙', -200], ['武昌', 223], ['建康', 317, 589], ['杭州', 589], ['蘇州', 589], ['南京', 1368]] }),
    R('EAS', '東北亞（朝鮮、日本）', '東北亞', '#fda4af', 39, 130, { area: 7, wild: 0.3, arable: 0.2, river: 0.3, plants: 0.2, animals: 0.2, copper: 0.3, tin: 0.2, iron: 0.4, coast: 0.9,
      start: { pop: 0.12, techs: { microliths: 1, pottery: 1 } }, links: [['YEL', 'land'], ['STE', 'land'], ['NAM', 'far']],
      places: [['上野原', -7500, -5000], ['岩寺洞', -5000, -3000], ['三內丸山', -3900, -2200], ['吉野里', -500, 300], ['平壤', -300], ['慶州', -57], ['纏向', 200, 400], ['平城京', 710, 784], ['平安京', 794], ['開城', 919, 1394], ['漢城', 1394], ['江戶', 1457], ['大坂', 1583]] }),
    R('SEA', '東南亞與新幾內亞', '東南亞', '#34d399', 4, 112, { area: 14, wild: 0.3, arable: 0.2, river: 0.4, plants: 0.45, animals: 0.2, copper: 0.3, tin: 0.6, iron: 0.4, coast: 0.9,
      start: { pop: 0.3, techs: { microliths: 1 } }, links: [['YAN', 'land'], ['GAN', 'land'], ['AUS', 'sea']],
      places: [['塔邦洞', -9000, -500], ['庫克沼澤', -7000], ['農諾他', -2500, -500], ['班清', -2100, 200], ['班考', -2000, -1000], ['科帕農迪', -2000, -1500], ['馮原', -2000, -1500], ['東山', -1000, 100], ['沙黃', -1000, 200], ['古螺', -250, 300], ['扶南', 50, 600], ['俄厄', 100, 650], ['室利佛逝', 650, 1300], ['吳哥', 802, 1431], ['蒲甘', 849, 1297], ['昇龍', 1010], ['大城', 1351, 1767], ['麻六甲', 1400], ['曼谷', 1782]] }),
    R('AUS', '澳洲', '澳洲', '#fbbf24', -25, 134, { area: 25, wild: 0.06, arable: 0.04, river: 0.1, plants: 0.05, animals: 0, copper: 0.3, tin: 0.3, iron: 0.4, coast: 0.6,
      start: { pop: 0.25, techs: {} }, links: [['SEA', 'sea']], places: [['布德傑姆', -4600]] }),
    R('SAH', '北非與撒哈拉', '撒哈拉', '#d6a35c', 25, 5, { area: 25, wild: 0.06, arable: 0.04, river: 0.1, plants: 0.3, animals: 0.4, copper: 0.2, tin: 0.05, iron: 0.4, coast: 0.3,
      // 綠色撒哈拉（非洲濕潤期）約西元前 9000–3500 年，之後乾燥化（氣候代理資料，可信度 C）
      climate: [[-10000, 1.5], [-9000, 3.0], [-5000, 3.0], [-3500, 1.4], [-2500, 1.0]],
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['NIL', 'land'], ['EUR', 'sea'], ['SSA', 'land']],
      places: [['納布塔', -7500, -3500], ['達爾提希特', -2000, -300], ['迦太基', -800], ['的黎波里', -700], ['昔蘭尼', -630, 650], ['提帕薩', -600], ['加拉曼特', -500, 700], ['突尼斯', -400], ['傑內', -250], ['非斯', 789], ['加奧', 800], ['阿爾及爾', 950], ['馬拉喀什', 1070], ['廷巴克圖', 1100]] }),
    R('SSA', '撒哈拉以南非洲', '非洲', '#22c55e', 2, 24, { area: 55, wild: 0.14, arable: 0.15, river: 0.3, plants: 0.35, animals: 0.05, copper: 0.3, tin: 0.1, iron: 0.5, coast: 0.3,
      start: { pop: 0.9, techs: { microliths: 1 } }, links: [['SAH', 'land'], ['NIL', 'land']],
      places: [['伊尚戈', -10000, -6000], ['金塔姆波', -2500, -1400], ['諾克', -1500, 500], ['麥羅埃', -800, 350], ['傑內-傑諾', -250, 1400], ['阿克蘇姆', -100], ['伊費', 500], ['摩加迪休', 900], ['基爾瓦', 900], ['卡諾', 1000], ['蒙巴薩', 1000], ['大辛巴威', 1100, 1450], ['姆班札剛果', 1390], ['阿波美', 1625], ['貢德爾', 1636], ['庫馬西', 1680]] }),
    R('NAM', '北美洲', '北美', '#38bdf8', 40, -96, { area: 55, wild: 0.09, arable: 0.08, river: 0.4, plants: 0.25, animals: 0.02, copper: 0.3, tin: 0, iron: 0.3, coast: 0.4,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['MES', 'land'], ['EAS', 'far']],
      places: [['科斯特', -7000, -1000], ['沃森布雷克', -3500, -2800], ['波弗蒂角', -1700, -700], ['梅薩維德', 600, 1300], ['查科峽谷', 850, 1150], ['卡霍基亞', 1050, 1350]] }),
    R('MES', '中美洲', '中美', '#14b8a6', 18, -96, { area: 5, wild: 0.25, arable: 0.5, river: 0.3, plants: 0.65, animals: 0.05, copper: 0.1, tin: 0, iron: 0, coast: 0.5,
      start: { pop: 0.07, techs: { microliths: 1 } }, links: [['NAM', 'land'], ['AND', 'sea'], ['SAM', 'land']],
      places: [['圭拉納奎茲', -8000, -6500], ['帕索德拉阿瑪達', -1650, -1000], ['聖洛倫索', -1400, -900], ['拉文塔', -1200, -400], ['蒙特阿爾班', -500, 850], ['蒂卡爾', -400, 950], ['特奧蒂瓦坎', -100, 600], ['帕倫克', -100, 800], ['奇琴伊察', 600, 1200], ['圖拉', 900, 1150], ['馬雅潘', 1220, 1450], ['特諾奇提特蘭', 1325]] }),
    R('AND', '安地斯山區', '安地斯', '#2dd4bf', -12, -75, { area: 5, wild: 0.2, arable: 0.25, river: 0.3, plants: 0.55, animals: 0.35, copper: 0.6, tin: 0.5, iron: 0, coast: 0.4,
      start: { pop: 0.05, techs: { microliths: 1 } }, links: [['SAM', 'land'], ['MES', 'sea']],
      places: [['瓦卡普列塔', -7500, -2000], ['阿斯佩羅', -3000, -2000], ['卡拉爾', -2600, -1800], ['查文', -900, -200], ['蒂瓦納庫', -200, 1100], ['瓦里', 500, 1000], ['昌昌', 850, 1470], ['庫斯科', 1100]] }),
    R('SAM', '南美東部（亞馬遜、彭巴）', '南美', '#4ade80', -12, -55, { area: 45, wild: 0.12, arable: 0.06, river: 0.5, plants: 0.3, animals: 0.02, copper: 0.1, tin: 0.1, iron: 0.3, coast: 0.4,
      start: { pop: 0.3, techs: { microliths: 1 } }, links: [['AND', 'land'], ['MES', 'land']],
      places: [['佩德拉皮恩塔達', -9000, -1000], ['馬拉若', 400, 1400], ['聖塔倫', 1000], ['庫阿魯普', 1250, 1600]] })
  ];

  // ---- 遠古科技樹（三個分支）----
  // cost：研究點數；req：前置科技（全部都要）；reqAny：至少一項；cond：地區條件（不成立就不會自行發明，但仍可能經交流引進）；
  // scale：自行發明時成本依地理條件縮放（成本 ÷ 條件²，例如可馴化植物越少越難）；effects：見引擎；ref：考古參考年代（區間與可信度，只供對照，引擎不讀）。
  const T = (id, name, field, cost, o) => Object.assign({ id, name, field, cost, req: [], effects: {} }, o);
  WS.Data.ancientTechs = {
    // 材料與生存
    fire_use: T('fire_use', '使用火', 'material', 0, { start: true, ref: '約 100 萬年前以上（可信度 C）', effects: { forage: 0.05 } }),
    fire_making: T('fire_making', '自行生火', 'material', 0, { start: true, ref: '約 5 萬年前以前（可信度 C）', effects: { forage: 0.05 } }),
    cooking: T('cooking', '熟食', 'material', 0, { start: true, req: ['fire_use'], ref: '數十萬年前（可信度 C）', effects: { forage: 0.05 } }),
    stone_tools: T('stone_tools', '打製石器', 'material', 0, { start: true, ref: '約 330 萬年前（可信度 B）' }),
    microliths: T('microliths', '細石器與弓箭', 'material', 80, { req: ['stone_tools'], ref: '約西元前 4 萬–1 萬年（可信度 C）', effects: { forage: 0.15, military: 0.05 } }),
    pottery: T('pottery', '陶器', 'material', 260, { req: ['fire_making'], ref: '東亞約西元前 1.8 萬年；西亞約西元前 7000 年（可信度 B）', effects: { storage: 0.08, forage: 0.04 } }),
    copper: T('copper', '冶銅', 'material', 5000, { req: ['pottery'], cond: (r) => r.copper >= 0.2, scale: (r) => r.copper, ref: '西亞約西元前 5000 年（可信度 B）', effects: { farmY: 0.05, military: 0.2, urbanMax: 0.005 } }),
    bronze: T('bronze', '青銅', 'material', 7000, { req: ['copper'], cond: (r, w) => r.tin >= 0.2 || WS.Ancient.neighborHas(w, r, 'tin'), ref: '西亞約西元前 3300 年；中國約西元前 2000 年（可信度 B）', effects: { farmY: 0.05, military: 0.5, urbanMax: 0.01 } }),
    iron: T('iron', '冶鐵', 'material', 14000, { req: ['bronze'], cond: (r) => r.iron >= 0.3, ref: '安那托利亞約西元前 1200 年普及（可信度 B）', effects: { farmY: 0.15, land: 1.5, military: 0.8 } }),
    // 食物生產
    plant_management: T('plant_management', '植物管理', 'food', 150, { req: ['stone_tools'], cond: (r) => r.plants >= 0.2, scale: (r) => r.plants, ref: '西亞約西元前 1.2 萬年（可信度 C）', effects: { forage: 0.1 } }),
    seed_selection: T('seed_selection', '種子選擇', 'food', 220, { req: ['plant_management'], cond: (r) => r.plants >= 0.25, scale: (r) => r.plants, ref: '西亞約西元前 1 萬年（可信度 C）', effects: { forage: 0.05 } }),
    crop_domestication: T('crop_domestication', '作物馴化（農業）', 'food', 320, { req: ['seed_selection'], cond: (r) => r.plants >= 0.3, scale: (r) => r.plants, adoptOnly: (r) => r.arable >= 0.06,
      ref: '肥沃月彎約西元前 9500–8500 年；中國約西元前 8000–7000 年；中美洲約西元前 7000–5000 年（可信度 B）', effects: { farming: 1 } }),
    animal_management: T('animal_management', '動物管理', 'food', 160, { req: ['stone_tools'], cond: (r) => r.animals >= 0.2, scale: (r) => r.animals, ref: '西亞約西元前 1 萬年（可信度 C）', effects: { forage: 0.05 } }),
    animal_domestication: T('animal_domestication', '動物馴化（畜牧）', 'food', 320, { req: ['animal_management'], cond: (r) => r.animals >= 0.3, scale: (r) => r.animals, adoptOnly: (r) => r.animals >= 0.05 || r.arable >= 0.1,
      ref: '綿羊、山羊約西元前 9000–8000 年；馬約西元前 3500 年（可信度 B）', effects: { herding: 0.8, land: 0.15, military: 0.15 } }),
    storage: T('storage', '儲糧（穀倉）', 'food', 400, { reqAny: ['pottery', 'crop_domestication'], ref: '西亞約西元前 9000 年（可信度 C）', effects: { storage: 0.25 } }),
    irrigation: T('irrigation', '灌溉', 'food', 4000, { req: ['crop_domestication'], cond: (r) => r.river >= 0.4, adoptOnly: (r) => r.river >= 0.3, ref: '兩河流域約西元前 6000 年（可信度 B）', effects: { irrigation: 1, urbanMax: 0.01 } }),
    plough: T('plough', '犁耕', 'food', 12000, { req: ['crop_domestication', 'animal_domestication'], ref: '約西元前 4000 年（可信度 C）', effects: { land: 0.5, farmY: 0.15 } }),
    // 組織與知識
    calendar: T('calendar', '季節紀錄（曆法）', 'org', 200, { reqAny: ['plant_management', 'animal_management', 'microliths'], ref: '約西元前 1 萬年以前（可信度 D）', effects: { land: 0.05, forage: 0.03 } }),
    counting: T('counting', '計數', 'org', 500, { req: ['calendar'], ref: '約西元前 8000 年（陶籌，可信度 C）', effects: { admin: 0.1 } }),
    accounting: T('accounting', '記帳（陶籌與印章）', 'org', 10000, { req: ['counting'], cond: (r) => WS.Ancient.farmShare(r) >= 0.5, adoptOnly: (r) => WS.Ancient.farmShare(r) >= 0.3, ref: '兩河流域約西元前 4000 年（可信度 B）', effects: { admin: 0.2, urbanMax: 0.015 } }),
    sailing: T('sailing', '航海', 'org', 500, { req: ['calendar'], cond: (r) => r.coast >= 0.3, ref: '地中海約西元前 9000 年；南島語族約西元前 3000 年（可信度 C）', effects: { exchange: 6, forage: 0.05 } }),
    wheel: T('wheel', '車輪與車輛', 'org', 16000, { req: ['animal_domestication', 'copper'], ref: '約西元前 3500 年（可信度 B）', effects: { exchange: 4, military: 0.2 } }),
    writing: T('writing', '文字', 'org', 4500, { req: ['accounting'], cond: (r) => WS.Ancient.urbanShare(r) >= 0.02, adoptOnly: (r) => WS.Ancient.urbanShare(r) >= 0.008, ref: '兩河流域約西元前 3200 年；中國約西元前 1250 年；中美洲約西元前 600 年（可信度 B）', effects: { admin: 0.3, exchange: 2, urbanMax: 0.02, research: 0.25 } }),
    administration: T('administration', '官僚行政', 'org', 6000, { req: ['writing'], ref: '約西元前 2500 年（可信度 C）', effects: { admin: 0.5, urbanMax: 0.02, land: 0.3 } }),
    roads: T('roads', '道路與驛站', 'org', 12000, { req: ['wheel', 'administration'], ref: '約西元前 2000–500 年（可信度 C）', effects: { exchange: 6, admin: 0.4, land: 0.4 } }),
    law: T('law', '成文法典', 'org', 9000, { req: ['administration'], ref: '約西元前 2100–1750 年（可信度 B）', effects: { admin: 0.2, cohesion: 0.5 } }),
    currency: T('currency', '貨幣', 'org', 18000, { req: ['writing', 'bronze'], cond: (r) => r.exchange >= 45, adoptOnly: (r) => r.exchange >= 35, ref: '鑄幣約西元前 600 年（呂底亞、中國；可信度 B）', effects: { exchange: 6, urbanMax: 0.02, admin: 0.2, land: 0.6 } }),
    // 中世紀前後（之後接到近代劇本）
    crop_rotation: T('crop_rotation', '輪作與重犁', 'food', 30000, { req: ['plough', 'iron'], ref: '中國約西元前 3 世紀；歐洲三圃制約西元 8–9 世紀（可信度 B）', effects: { land: 3.0, farmY: 0.1 } }),
    paper: T('paper', '造紙', 'org', 30000, { req: ['writing', 'administration'], ref: '中國約西元 105 年（蔡倫改良；可信度 B）', effects: { admin: 0.3, research: 0.2, exchange: 2 } }),
    compass: T('compass', '羅盤與遠洋航海', 'org', 45000, { req: ['sailing', 'iron', 'currency'], cond: (r) => r.coast >= 0.3, ref: '中國約西元 11 世紀用於航海（可信度 B）', effects: { exchange: 6 } }),
    printing: T('printing', '印刷術', 'org', 45000, { req: ['paper'], ref: '雕版印刷約西元 8 世紀；活字約 1040 年（中國）、1450 年（歐洲）（可信度 B）', effects: { research: 0.3, cohesion: 0.3 } }),
    gunpowder: T('gunpowder', '火藥', 'material', 45000, { req: ['iron', 'administration'], ref: '中國約西元 9 世紀（可信度 B）', effects: { military: 1.0 } }),
    // 近代前夕（約西元 1000–1700 年）：讓人口與經濟在接到近代前繼續成長
    new_crops: T('new_crops', '高產作物與作物交流', 'food', 90000, { req: ['crop_rotation', 'compass'], ref: '占城稻約 11 世紀傳入中國；玉米、馬鈴薯、番薯 16 世紀起傳遍各大洲（可信度 B）', effects: { land: 2.0, farmY: 0.1, health: 0.001 } }),
    medicine: T('medicine', '醫學與防疫（檢疫、人痘）', 'org', 60000, { req: ['printing', 'currency'], ref: '威尼斯檢疫約 1377 年；人痘接種中國約 16 世紀（可信度 B）', effects: { health: 0.003 } }),
    banking: T('banking', '銀行與信用', 'org', 60000, { req: ['printing', 'currency'], cond: (r) => r.exchange >= 50, adoptOnly: (r) => r.exchange >= 40, ref: '義大利銀行約 14 世紀；中國交子約 1024 年（可信度 B）', effects: { exchange: 4, urbanMax: 0.02, land: 0.3 } })
  };
  WS.Data.ancientFields = { material: '材料與生存', food: '食物生產', org: '組織與知識' };

  // 政體型態（不是必經階梯，只是目前組織規模的名稱）
  WS.Data.ancientPolityTypes = {
    chiefdom: { name: '酋邦', rank: 1, power: 0.6, adminBase: 0.5, urban: 0.02 },
    citystate: { name: '城邦', rank: 2, power: 0.8, adminBase: 0.8, urban: 0.05 },
    kingdom: { name: '王國', rank: 3, power: 1.0, adminBase: 1.2, urban: 0.06 },
    empire: { name: '帝國', rank: 4, power: 1.2, adminBase: 1.5, urban: 0.08 }
  };

  WS.Data.scenarios = WS.Data.scenarios || {};
  WS.Data.scenarios['bc10000'] = {
    id: 'bc10000', era: 'ancient', name: '人類的黎明：西元前 10,000 年', startYear: -9999, startMonth: 1,
    // 用來顯示的國家清單（遠古沒有國家；設定畫面用地區代替）
    countries: WS.Data.ancientRegions.map((r) => ({ id: r.id, name: r.name, regimeLabel: '狩獵採集社群' })),
    provenance: {
      population: { source: '依各地野生食物承載力推估（世界約 400–600 萬人；學界估計 100–1000 萬）', grade: 'D', estimated: true },
      geography: { source: '依現代地理與氣候代理資料簡化（示意值）', grade: 'C', estimated: true }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
