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
  // places：當地城市名稱與「最早可以用這個名字」的年份（約略為考古／史料中出現城市或聚落的年代，可信度 C）。
  //   引擎依序取第一個年代已到、還沒用過的名字，所以西元前 3000 年不會出現「羅馬」；沒有合適的名字時用「某地第 n 城」。
  // links：相鄰地區 [代號, 連接方式]，land＝陸路、sea＝需要航海、far＝極遠（需要航海且很慢）。
  const R = (id, name, short, color, lat, lon, o) => Object.assign({ id, name, short, color, lat, lon, climate: null, start: {} }, o);
  WS.Data.ancientRegions = [
    R('FER', '肥沃月彎', '兩河', '#f59e0b', 34, 42, { area: 6, wild: 0.3, arable: 0.3, river: 0.8, plants: 1.0, animals: 1.0, copper: 0.6, tin: 0.1, iron: 0.5, coast: 0.4,
      start: { pop: 0.25, techs: { microliths: 1 } }, links: [['ANA', 'land'], ['NIL', 'land'], ['IND', 'land'], ['STE', 'land']],
      places: [['耶利哥', -8000], ['耶莫', -7000], ['哈蘇納', -6000], ['埃利都', -5400], ['瑪特勞耶', -5300], ['泰佩高拉', -5000], ['烏魯克', -4500], ['布拉克', -4000], ['哈穆卡爾', -4000], ['烏爾', -3800], ['基什', -3100], ['拉格什', -2900], ['馬里', -2900], ['尼尼微', -2600], ['亞述', -2500], ['巴比倫', -2300]] }),
    R('NIL', '尼羅河谷', '尼羅', '#eab308', 26, 32, { area: 3, wild: 0.15, arable: 0.3, river: 1.0, plants: 0.25, animals: 0.3, copper: 0.3, tin: 0, iron: 0.2, coast: 0.3,
      start: { pop: 0.06, techs: { microliths: 1 } }, links: [['FER', 'land'], ['SAH', 'land'], ['SSA', 'land']],
      places: [['卡丹', -7000], ['法尤姆', -5200], ['梅林德', -5000], ['巴達里', -4400], ['納加達', -4000], ['希拉孔波利斯', -3800], ['阿拜多斯', -3500], ['孟斐斯', -3100], ['象島', -3000], ['赫利奧波利斯', -3000], ['底比斯', -2100]] }),
    R('ANA', '安那托利亞與地中海東岸', '安那', '#fb923c', 39, 33, { area: 5, wild: 0.25, arable: 0.3, river: 0.3, plants: 0.6, animals: 0.7, copper: 0.8, tin: 0.3, iron: 0.7, coast: 0.6,
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['FER', 'land'], ['EUR', 'land'], ['STE', 'land']],
      places: [['恰約尼', -8600], ['加泰土丘', -7400], ['哈吉拉爾', -7000], ['比布魯斯', -3000], ['特洛伊', -3000], ['烏加里特', -3000], ['卡內什', -2000], ['哈圖沙', -2000]] }),
    R('EUR', '歐洲', '歐洲', '#60a5fa', 48, 12, { area: 18, wild: 0.2, arable: 0.55, river: 0.5, plants: 0.1, animals: 0.2, copper: 0.4, tin: 0.5, iron: 0.8, coast: 0.6,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['ANA', 'land'], ['STE', 'land'], ['SAH', 'sea']],
      places: [['萊潘斯基維爾', -9500], ['喬伊魯基蒂亞', -7000], ['塞斯克洛', -6800], ['卡拉諾沃', -6200], ['沃格拉克', -5300], ['迪米尼', -4800], ['瓦爾納', -4600], ['塔利揚基', -4000], ['斯卡拉布雷', -3200], ['克諾索斯', -2000], ['邁錫尼', -1600], ['雅典', -1400], ['斯巴達', -900], ['科林斯', -900], ['迦太基', -800], ['羅馬', -750], ['敘拉古', -730], ['馬薩利亞', -600]] }),
    R('STE', '歐亞草原', '草原', '#a3e635', 48, 62, { area: 30, wild: 0.08, arable: 0.08, river: 0.2, plants: 0.05, animals: 0.8, copper: 0.5, tin: 0.3, iron: 0.4, coast: 0.05,
      start: { pop: 0.15, techs: { microliths: 1 } }, links: [['EUR', 'land'], ['ANA', 'land'], ['FER', 'land'], ['IND', 'land'], ['YEL', 'land'], ['EAS', 'land']],
      places: [['哲通', -6000], ['博泰', -3700], ['納馬茲加', -3500], ['戈努爾', -2400], ['辛塔什塔', -2100], ['阿爾凱姆', -2000], ['撒馬爾罕', -700], ['布哈拉', -500]] }),
    R('IND', '印度河流域', '印度河', '#f472b6', 27, 70, { area: 6, wild: 0.2, arable: 0.45, river: 0.8, plants: 0.4, animals: 0.5, copper: 0.3, tin: 0.1, iron: 0.4, coast: 0.3,
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['FER', 'land'], ['STE', 'land'], ['GAN', 'land']],
      places: [['梅赫爾格爾', -7000], ['拉希加里', -4600], ['卡利班甘', -3500], ['哈拉帕', -3300], ['科特迪吉', -3300], ['朵拉維拉', -3000], ['摩亨佐達羅', -2600], ['甘維里瓦拉', -2600], ['蘇特卡根多', -2500], ['洛塔爾', -2400], ['塔克西拉', -1000]] }),
    R('GAN', '恆河與印度半島', '恆河', '#e879f9', 21, 80, { area: 15, wild: 0.3, arable: 0.55, river: 0.6, plants: 0.35, animals: 0.4, copper: 0.3, tin: 0.1, iron: 0.6, coast: 0.6,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['IND', 'land'], ['YAN', 'far'], ['SEA', 'land']],
      places: [['喬帕尼曼多', -9000], ['達姆達馬', -8000], ['拉胡拉德瓦', -7000], ['馬哈加拉', -6000], ['科爾迪瓦', -6000], ['切蘭德', -2500], ['布迪哈爾', -2300], ['森努瓦', -1800], ['因阿姆加奧恩', -1600], ['帕伊亞姆帕利', -1500], ['瓦拉納西', -1200], ['王舍城', -1000], ['舍衛城', -800], ['烏賈因', -700], ['華氏城', -490], ['馬杜賴', -300]] }),
    R('YEL', '黃河流域', '黃河', '#ef4444', 35, 112, { area: 8, wild: 0.22, arable: 0.6, river: 0.7, plants: 0.85, animals: 0.5, copper: 0.5, tin: 0.4, iron: 0.6, coast: 0.3,
      start: { pop: 0.2, techs: { microliths: 1, pottery: 1 } }, links: [['YAN', 'land'], ['STE', 'land'], ['EAS', 'land']],
      places: [['賈湖', -7000], ['裴李崗', -7000], ['磁山', -6000], ['大地灣', -6000], ['仰韶', -5000], ['半坡', -4800], ['姜寨', -4600], ['大汶口', -4100], ['廟底溝', -4000], ['雙槐樹', -3300], ['西山', -3300], ['城子崖', -2500], ['陶寺', -2300], ['石峁', -2300], ['王城崗', -2100], ['二里頭', -1900], ['新砦', -1850], ['殷', -1300], ['鎬京', -1050], ['洛邑', -1040], ['臨淄', -850], ['邯鄲', -500], ['大梁', -360], ['咸陽', -350]] }),
    R('YAN', '長江流域', '長江', '#f87171', 29, 114, { area: 8, wild: 0.3, arable: 0.55, river: 0.9, plants: 0.85, animals: 0.4, copper: 0.5, tin: 0.4, iron: 0.5, coast: 0.4,
      start: { pop: 0.2, techs: { microliths: 1, pottery: 1 } }, links: [['YEL', 'land'], ['SEA', 'land'], ['GAN', 'far']],
      places: [['上山', -8000], ['彭頭山', -7000], ['八十壋', -6500], ['跨湖橋', -6000], ['河姆渡', -5000], ['城頭山', -4500], ['大溪', -4400], ['凌家灘', -3600], ['良渚', -3300], ['屈家嶺', -3000], ['石家河', -2500], ['寶墩', -2500], ['三星堆', -1700], ['盤龍城', -1500], ['郢', -690], ['吳', -510], ['會稽', -500], ['成都', -310]] }),
    R('EAS', '東北亞（朝鮮、日本）', '東北亞', '#fda4af', 39, 130, { area: 7, wild: 0.3, arable: 0.2, river: 0.3, plants: 0.2, animals: 0.2, copper: 0.3, tin: 0.2, iron: 0.4, coast: 0.9,
      start: { pop: 0.12, techs: { microliths: 1, pottery: 1 } }, links: [['YEL', 'land'], ['STE', 'land'], ['NAM', 'far']],
      places: [['上野原', -7500], ['岩寺洞', -5000], ['三內丸山', -3900], ['吉野里', -500], ['平壤', -300], ['慶州', -57], ['纏向', 200]] }),
    R('SEA', '東南亞與新幾內亞', '東南亞', '#34d399', 4, 112, { area: 14, wild: 0.3, arable: 0.2, river: 0.4, plants: 0.45, animals: 0.2, copper: 0.3, tin: 0.6, iron: 0.4, coast: 0.9,
      start: { pop: 0.3, techs: { microliths: 1 } }, links: [['YAN', 'land'], ['GAN', 'land'], ['AUS', 'sea']],
      places: [['塔邦洞', -9000], ['庫克沼澤', -7000], ['農諾他', -2500], ['班清', -2100], ['班考', -2000], ['科帕農迪', -2000], ['馮原', -2000], ['東山', -1000], ['沙黃', -1000], ['古螺', -250], ['扶南', 50], ['俄厄', 100], ['室利佛逝', 650]] }),
    R('AUS', '澳洲', '澳洲', '#fbbf24', -25, 134, { area: 25, wild: 0.06, arable: 0.04, river: 0.1, plants: 0.05, animals: 0, copper: 0.3, tin: 0.3, iron: 0.4, coast: 0.6,
      start: { pop: 0.25, techs: {} }, links: [['SEA', 'sea']], places: [['布德傑姆', -4600]] }),
    R('SAH', '北非與撒哈拉', '撒哈拉', '#d6a35c', 25, 5, { area: 25, wild: 0.06, arable: 0.04, river: 0.1, plants: 0.3, animals: 0.4, copper: 0.2, tin: 0.05, iron: 0.4, coast: 0.3,
      // 綠色撒哈拉（非洲濕潤期）約西元前 9000–3500 年，之後乾燥化（氣候代理資料，可信度 C）
      climate: [[-10000, 1.5], [-9000, 3.0], [-5000, 3.0], [-3500, 1.4], [-2500, 1.0]],
      start: { pop: 0.12, techs: { microliths: 1 } }, links: [['NIL', 'land'], ['EUR', 'sea'], ['SSA', 'land']],
      places: [['納布塔', -7500], ['達爾提希特', -2000], ['迦太基', -800], ['昔蘭尼', -630], ['提帕薩', -600], ['加拉曼特', -500], ['傑內', -250]] }),
    R('SSA', '撒哈拉以南非洲', '非洲', '#22c55e', 2, 24, { area: 55, wild: 0.14, arable: 0.15, river: 0.3, plants: 0.35, animals: 0.05, copper: 0.3, tin: 0.1, iron: 0.5, coast: 0.3,
      start: { pop: 0.9, techs: { microliths: 1 } }, links: [['SAH', 'land'], ['NIL', 'land']],
      places: [['伊尚戈', -10000], ['金塔姆波', -2500], ['諾克', -1500], ['麥羅埃', -800], ['傑內-傑諾', -250], ['阿克蘇姆', -100], ['伊費', 500], ['大辛巴威', 1100]] }),
    R('NAM', '北美洲', '北美', '#38bdf8', 40, -96, { area: 55, wild: 0.09, arable: 0.08, river: 0.4, plants: 0.25, animals: 0.02, copper: 0.3, tin: 0, iron: 0.3, coast: 0.4,
      start: { pop: 0.35, techs: { microliths: 1 } }, links: [['MES', 'land'], ['EAS', 'far']],
      places: [['科斯特', -7000], ['沃森布雷克', -3500], ['波弗蒂角', -1700], ['梅薩維德', 600], ['查科峽谷', 850], ['卡霍基亞', 1050]] }),
    R('MES', '中美洲', '中美', '#14b8a6', 18, -96, { area: 5, wild: 0.25, arable: 0.5, river: 0.3, plants: 0.65, animals: 0.05, copper: 0.1, tin: 0, iron: 0, coast: 0.5,
      start: { pop: 0.07, techs: { microliths: 1 } }, links: [['NAM', 'land'], ['AND', 'sea'], ['SAM', 'land']],
      places: [['圭拉納奎茲', -8000], ['帕索德拉阿瑪達', -1650], ['聖洛倫索', -1400], ['拉文塔', -1200], ['蒙特阿爾班', -500], ['蒂卡爾', -400], ['特奧蒂瓦坎', -100], ['帕倫克', -100]] }),
    R('AND', '安地斯山區', '安地斯', '#2dd4bf', -12, -75, { area: 5, wild: 0.2, arable: 0.25, river: 0.3, plants: 0.55, animals: 0.35, copper: 0.6, tin: 0.5, iron: 0, coast: 0.4,
      start: { pop: 0.05, techs: { microliths: 1 } }, links: [['SAM', 'land'], ['MES', 'sea']],
      places: [['瓦卡普列塔', -7500], ['阿斯佩羅', -3000], ['卡拉爾', -2600], ['查文', -900], ['蒂瓦納庫', -200], ['瓦里', 500], ['昌昌', 850], ['庫斯科', 1100]] }),
    R('SAM', '南美東部（亞馬遜、彭巴）', '南美', '#4ade80', -12, -55, { area: 45, wild: 0.12, arable: 0.06, river: 0.5, plants: 0.3, animals: 0.02, copper: 0.1, tin: 0.1, iron: 0.3, coast: 0.4,
      start: { pop: 0.3, techs: { microliths: 1 } }, links: [['AND', 'land'], ['MES', 'land']],
      places: [['佩德拉皮恩塔達', -9000], ['馬拉若', 400], ['聖塔倫', 1000], ['庫阿魯普', 1250]] })
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
