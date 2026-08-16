import type { DifficultyDefinition, EliteDefinition, EliteType, EnemyDefinition, MapDefinition, Point, TowerDefinition, WaveDefinition } from './types';

export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 700;
export const BUILD_GRID_SIZE = 50;
export const BUILD_GRID_PADDING = 50;
export const STARTING_GOLD = 430;
export const STARTING_LIVES = 20;
export const INTERMISSION_SECONDS = 12;
export const EARLY_START_GOLD_PER_SECOND = 2;
export const WAVE_CLEAR_GOLD = 35;
export const MAX_TOWER_LEVEL = 6;

export const DIFFICULTIES: Record<string, DifficultyDefinition> = {
  story: {
    id: 'story', name: 'Хранитель', description: 'Тактическое знакомство без потери глубины', enemyHp: 0.78, enemyArmor: 1,
    enemySpeed: 0.9, enemyReward: 1.18, lateEnemyReward: 1.22, waveReward: 1.2, waveHpGrowth: 0.75, waveSpeedGrowth: 0.8,
    startingGold: 520, crystalLives: 26, scoreMultiplier: 0.75,
    heroDamage: 1.15, heroSpeed: 1.08, heroManaRegen: 1.25, heroDamageTaken: 0.8, heroRespawn: 0.65,
    intermission: 1.25, bossShield: 0.75, earlyStartGold: 1.25,
    rules: ['Герой: +15% урона · регенерация маны +25%', 'Урон герою −20% · возврат через 4с', '15 секунд между волнами · щиты короче'],
  },
  standard: {
    id: 'standard', name: 'Защитник', description: 'Авторский баланс карты', enemyHp: 1, enemyArmor: 1,
    enemySpeed: 1, enemyReward: 1, lateEnemyReward: 1, waveReward: 1, waveHpGrowth: 1, waveSpeedGrowth: 1,
    startingGold: STARTING_GOLD, crystalLives: STARTING_LIVES, scoreMultiplier: 1,
    heroDamage: 1, heroSpeed: 1, heroManaRegen: 1, heroDamageTaken: 1, heroRespawn: 1,
    intermission: 1, bossShield: 1, earlyStartGold: 1,
    rules: ['Герой и враги без модификаторов', '20 прочности · 430 стартового золота', '12 секунд между волнами · полная награда'],
  },
  rift: {
    id: 'rift', name: 'Повелитель бури', description: 'Экспертный режим без права на пассивную оборону', enemyHp: 1.7, enemyArmor: 1.18,
    enemySpeed: 1.08, enemyReward: 0.64, lateEnemyReward: 0.38, waveReward: 0.45, waveHpGrowth: 1.1, waveSpeedGrowth: 1.1,
    startingGold: 320, crystalLives: 8, scoreMultiplier: 3,
    heroDamage: 0.98, heroSpeed: 1, heroManaRegen: 0.78, heroDamageTaken: 1.5, heroRespawn: 1.6,
    intermission: 0.5, bossShield: 1.4, earlyStartGold: 0.35,
    rules: ['8 прочности · 320 золота · награды −36% → −62%', 'Враги: +70% здоровья · броня +18% · скорость +8%', '6с подготовки · мана −22% · урон герою +50% · щиты +40%'],
  },
};

const VALLEY_PATH: Point[] = [
  { x: 28, y: 330 },
  { x: 230, y: 330 },
  { x: 230, y: 145 },
  { x: 510, y: 145 },
  { x: 510, y: 520 },
  { x: 790, y: 520 },
  { x: 790, y: 260 },
  { x: 1082, y: 260 },
];

const VALLEY_CRYSTAL = { x: 1120, y: 260 };
const VALLEY_FORBIDDEN = [
  { x: 100, y: 110, radius: 62 },
  { x: 370, y: 350, radius: 56 },
  { x: 675, y: 335, radius: 70 },
  { x: 1010, y: 545, radius: 74 },
];

export const MAPS: Record<string, MapDefinition> = {
  valley: {
    id: 'valley', number: 1, name: 'Долина Разлома', subtitle: 'ПЕРВЫЙ РУБЕЖ',
    description: 'Длинный маршрут и просторные позиции для знакомства с кампанией.', asset: 'assets/rift-valley-map-v3.webp',
    path: VALLEY_PATH, crystal: VALLEY_CRYSTAL, forbidden: VALLEY_FORBIDDEN,
    enemyHp: 1, enemyArmor: 1, enemySpeed: 1, goldMultiplier: 1, scoreMultiplier: 1,
    accent: 0x9e4cff, routeColor: 0xffe6ac, tint: 0xc4d0c8,
  },
  frozen: {
    id: 'frozen', number: 2, name: 'Ледяной перевал', subtitle: 'ХОЛОДНЫЙ ФРОНТ',
    description: 'Узкие снежные террасы: враги крепче, быстрее и приносят меньше золота.', asset: 'assets/frozen-pass-map.webp',
    path: [
      { x: 28, y: 150 }, { x: 275, y: 150 }, { x: 275, y: 450 }, { x: 590, y: 450 },
      { x: 590, y: 250 }, { x: 930, y: 250 }, { x: 930, y: 410 }, { x: 1082, y: 410 },
    ],
    crystal: { x: 1120, y: 410 },
    forbidden: [{ x: 135, y: 525, radius: 68 }, { x: 445, y: 105, radius: 58 }, { x: 745, y: 535, radius: 72 }, { x: 1050, y: 110, radius: 64 }],
    enemyHp: 1.12, enemyArmor: 1.06, enemySpeed: 1.05, goldMultiplier: 0.92, scoreMultiplier: 1.2,
    accent: 0x56dfff, routeColor: 0xcff8ff, tint: 0xc3d8ed,
  },
  bastion: {
    id: 'bastion', number: 3, name: 'Пепельный бастион', subtitle: 'ФИНАЛЬНАЯ ОСАДА',
    description: 'Короткий путь над лавой: элита наступает быстро, а экономика сжата до предела.', asset: 'assets/ashen-bastion-map.webp',
    path: [
      { x: 28, y: 370 }, { x: 310, y: 370 }, { x: 310, y: 245 }, { x: 545, y: 245 },
      { x: 545, y: 120 }, { x: 790, y: 120 }, { x: 790, y: 350 }, { x: 1082, y: 350 },
    ],
    crystal: { x: 1120, y: 350 },
    forbidden: [{ x: 145, y: 115, radius: 70 }, { x: 470, y: 535, radius: 76 }, { x: 690, y: 285, radius: 54 }, { x: 1010, y: 545, radius: 74 }],
    enemyHp: 1.25, enemyArmor: 1.12, enemySpeed: 1.09, goldMultiplier: 0.84, scoreMultiplier: 1.5,
    accent: 0xff623d, routeColor: 0xffc06b, tint: 0xe0b09d,
  },
  stormspire: {
    id: 'stormspire', number: 4, name: 'Грозовой шпиль', subtitle: 'НАД ОБЛАКАМИ',
    description: 'Обрывы и долгие прямые: скоростная элита наказывает за слабый контроль.', asset: 'assets/stormspire-map.webp',
    path: [
      { x: 28, y: 490 }, { x: 455, y: 490 }, { x: 455, y: 330 }, { x: 650, y: 330 },
      { x: 700, y: 360 }, { x: 930, y: 360 }, { x: 930, y: 220 }, { x: 1010, y: 145 }, { x: 1082, y: 115 },
    ],
    crystal: { x: 1120, y: 115 },
    forbidden: [{ x: 205, y: 160, radius: 74 }, { x: 595, y: 120, radius: 64 }, { x: 710, y: 555, radius: 72 }, { x: 1045, y: 545, radius: 68 }],
    enemyHp: 1.38, enemyArmor: 1.18, enemySpeed: 1.12, goldMultiplier: 0.79, scoreMultiplier: 1.8,
    accent: 0x45dcff, routeColor: 0xccecff, tint: 0xb5ccdf,
  },
  abyss: {
    id: 'abyss', number: 5, name: 'Сердце Бездны', subtitle: 'ПРЕДЕЛ РАЗЛОМА',
    description: 'Финальная глава: сжатая экономика, максимальная броня и опасные повороты.', asset: 'assets/abyss-heart-map.webp',
    path: [
      { x: 28, y: 115 }, { x: 690, y: 115 }, { x: 690, y: 370 }, { x: 305, y: 370 },
      { x: 305, y: 515 }, { x: 455, y: 515 }, { x: 455, y: 480 }, { x: 1082, y: 480 },
    ],
    crystal: { x: 1120, y: 480 },
    forbidden: [{ x: 160, y: 360, radius: 66 }, { x: 505, y: 265, radius: 72 }, { x: 845, y: 280, radius: 78 }, { x: 820, y: 610, radius: 68 }],
    enemyHp: 1.52, enemyArmor: 1.24, enemySpeed: 1.16, goldMultiplier: 0.74, scoreMultiplier: 2.1,
    accent: 0xe653ff, routeColor: 0xf2cfff, tint: 0xd3b0d9,
  },
};

export const MAP_ORDER = ['valley', 'frozen', 'bastion', 'stormspire', 'abyss'] as const;
export const PATH = VALLEY_PATH;
export const CRYSTAL = VALLEY_CRYSTAL;
export const FORBIDDEN_ZONES = VALLEY_FORBIDDEN;

export const TOWERS: Record<string, TowerDefinition> = {
  archer: {
    type: 'archer',
    name: 'Стрелковая башня',
    cost: 110,
    color: 0xe9ad4d,
    description: 'Быстрые выстрелы по земле и воздуху',
    canTargetAir: true,
    splash: 0,
    slow: 0,
    levels: [
      { damage: 24, range: 150, attackMs: 620, upgradeCost: 90, projectileCount: 1, projectileScale: 0.88, perk: 'Точный одиночный выстрел' },
      { damage: 39, range: 165, attackMs: 520, upgradeCost: 155, projectileCount: 2, projectileScale: 1.02, perk: 'Парный залп' },
      { damage: 63, range: 180, attackMs: 430, upgradeCost: 270, projectileCount: 3, projectileScale: 1.18, perk: 'Тройной залп' },
      { damage: 98, range: 195, attackMs: 375, upgradeCost: 430, projectileCount: 4, projectileScale: 1.34, armorPierce: 0.15, perk: 'Бронебойные наконечники · игнор 15% брони' },
      { damage: 140, range: 210, attackMs: 330, upgradeCost: 650, projectileCount: 5, projectileScale: 1.5, armorPierce: 0.25, perk: 'Ураганный залп · игнор 25% брони' },
      { damage: 190, range: 225, attackMs: 295, upgradeCost: null, projectileCount: 6, projectileScale: 1.68, armorPierce: 0.35, perk: 'Золотой шторм · игнор 35% брони' },
    ],
  },
  frost: {
    type: 'frost',
    name: 'Ледяная башня',
    cost: 145,
    color: 0x6fd9ff,
    description: 'Магический урон и замедление',
    canTargetAir: true,
    splash: 38,
    slow: 0.32,
    levels: [
      { damage: 17, range: 135, attackMs: 900, upgradeCost: 105, projectileCount: 1, projectileScale: 0.9, perk: 'Магический ледяной осколок' },
      { damage: 28, range: 150, attackMs: 800, upgradeCost: 170, projectileCount: 2, projectileScale: 1.08, slow: 0.34, perk: 'Двойное промерзание · замедление 34%' },
      { damage: 45, range: 170, attackMs: 690, upgradeCost: 300, projectileCount: 3, projectileScale: 1.28, splash: 42, slow: 0.36, perk: 'Ледяной веер · замедление 36%' },
      { damage: 72, range: 185, attackMs: 620, upgradeCost: 470, projectileCount: 4, projectileScale: 1.44, splash: 48, slow: 0.39, perk: 'Кольцо стужи · зона 48 · замедление 39%' },
      { damage: 104, range: 202, attackMs: 560, upgradeCost: 700, projectileCount: 5, projectileScale: 1.62, splash: 56, slow: 0.43, perk: 'Глубокая заморозка · зона 56 · замедление 43%' },
      { damage: 142, range: 220, attackMs: 510, upgradeCost: null, projectileCount: 6, projectileScale: 1.82, splash: 66, slow: 0.48, perk: 'Абсолютный ноль · зона 66 · замедление 48%' },
    ],
  },
  siege: {
    type: 'siege',
    name: 'Осадная башня',
    cost: 185,
    color: 0xe77844,
    description: 'Мощный наземный урон по площади',
    canTargetAir: false,
    splash: 72,
    slow: 0,
    levels: [
      { damage: 72, range: 175, attackMs: 1700, upgradeCost: 135, projectileCount: 1, projectileScale: 0.92, perk: 'Чугунное ядро · зона 72' },
      { damage: 118, range: 190, attackMs: 1500, upgradeCost: 210, projectileCount: 1, projectileScale: 1.18, splash: 76, perk: 'Тяжёлое ядро · зона 76' },
      { damage: 188, range: 210, attackMs: 1300, upgradeCost: 350, projectileCount: 1, projectileScale: 1.52, splash: 82, perk: 'Разрывное ядро · зона 82' },
      { damage: 290, range: 225, attackMs: 1180, upgradeCost: 560, projectileCount: 1, projectileScale: 1.82, splash: 90, armorPierce: 0.15, perk: 'Сейсмический заряд · зона 90 · игнор 15% брони' },
      { damage: 415, range: 243, attackMs: 1060, upgradeCost: 850, projectileCount: 1, projectileScale: 2.14, splash: 102, armorPierce: 0.25, perk: 'Магмовое ядро · зона 102 · игнор 25% брони' },
      { damage: 565, range: 260, attackMs: 950, upgradeCost: null, projectileCount: 1, projectileScale: 2.5, splash: 118, armorPierce: 0.35, perk: 'Сердце вулкана · зона 118 · игнор 35% брони' },
    ],
  },
  boost: {
    type: 'boost',
    name: 'Башня усиления',
    cost: 160,
    color: 0xb78cff,
    description: 'Усиливает соседние башни в радиусе ауры',
    canTargetAir: false,
    splash: 0,
    slow: 0,
    levels: [
      { damage: 0, range: 135, attackMs: 0, upgradeCost: 120, projectileCount: 0, projectileScale: 1, damageBoost: 1.25, attackSpeedBoost: 1.12, perk: 'Резонанс · +25% урона · +12% скорости' },
      { damage: 0, range: 160, attackMs: 0, upgradeCost: 185, projectileCount: 0, projectileScale: 1, damageBoost: 1.25, attackSpeedBoost: 1.12, perk: 'Расширенный резонанс · +25% урона · +12% скорости' },
      { damage: 0, range: 190, attackMs: 0, upgradeCost: 250, projectileCount: 0, projectileScale: 1, damageBoost: 1.25, attackSpeedBoost: 1.12, perk: 'Аура Разлома · +25% урона · +12% скорости' },
      { damage: 0, range: 212, attackMs: 0, upgradeCost: 400, projectileCount: 0, projectileScale: 1, damageBoost: 1.32, attackSpeedBoost: 1.15, perk: 'Рунная сеть · +32% урона · +15% скорости' },
      { damage: 0, range: 236, attackMs: 0, upgradeCost: 600, projectileCount: 0, projectileScale: 1, damageBoost: 1.39, attackSpeedBoost: 1.18, perk: 'Великий проводник · +39% урона · +18% скорости' },
      { damage: 0, range: 260, attackMs: 0, upgradeCost: null, projectileCount: 0, projectileScale: 1, damageBoost: 1.48, attackSpeedBoost: 1.22, perk: 'Сердце усиления · +48% урона · +22% скорости' },
    ],
  },
};

export const ENEMIES: Record<string, EnemyDefinition> = {
  raider: { type: 'raider', name: 'Налётчик', maxHp: 120, armor: 3, speed: 54, reward: 16, crystalDamage: 1, flying: false, color: 0xa85bca, radius: 14 },
  runner: { type: 'runner', name: 'Бегун', maxHp: 78, armor: 0, speed: 92, reward: 14, crystalDamage: 1, flying: false, color: 0xdc65ed, radius: 11 },
  brute: { type: 'brute', name: 'Громила', maxHp: 430, armor: 30, speed: 35, reward: 36, crystalDamage: 2, flying: false, color: 0x744a9b, radius: 19 },
  winged: { type: 'winged', name: 'Крылатое порождение', maxHp: 155, armor: 5, speed: 67, reward: 25, crystalDamage: 1, flying: true, color: 0x8e9cff, radius: 13 },
  warden: { type: 'warden', name: 'Страж Бездны', maxHp: 2600, armor: 18, speed: 31, reward: 360, crystalDamage: 4, flying: false, color: 0xb75cff, radius: 27 },
  titan: { type: 'titan', name: 'Титан Осколков', maxHp: 5200, armor: 26, speed: 26, reward: 650, crystalDamage: 6, flying: false, color: 0xff7658, radius: 31 },
  boss: { type: 'boss', name: 'Владыка Разлома', maxHp: 8400, armor: 32, speed: 23, reward: 1100, crystalDamage: 10, flying: false, color: 0xff3f9a, radius: 35 },
};

export const ELITES: Record<EliteType, EliteDefinition> = {
  swift: {
    type: 'swift', name: 'Гончая Разлома', shortName: 'СТРЕМИТЕЛЬНЫЙ', description: '+22% скорости · +30% здоровья', color: 0xff5bd7,
    hpMultiplier: 1.3, speedMultiplier: 1.22, armorBonus: 0, rewardMultiplier: 1.45, shieldRatio: 0, regeneration: 0,
  },
  bulwark: {
    type: 'bulwark', name: 'Щитоносец Бездны', shortName: 'БАСТИОН', description: 'щит 28% · +50% здоровья · +16 брони', color: 0x63e8ff,
    hpMultiplier: 1.5, speedMultiplier: 0.92, armorBonus: 16, rewardMultiplier: 1.7, shieldRatio: 0.28, regeneration: 0,
  },
  regenerator: {
    type: 'regenerator', name: 'Живой Осколок', shortName: 'РЕГЕНЕРАТОР', description: 'восстанавливает 1,2% здоровья/с', color: 0x71f5a1,
    hpMultiplier: 1.4, speedMultiplier: 1, armorBonus: 4, rewardMultiplier: 1.65, shieldRatio: 0, regeneration: 0.012,
  },
};

export const WAVES: WaveDefinition[] = [
  { title: 'Разведчики Разлома', intel: 'Налётчики · наземные', reward: 35, spawns: [{ type: 'raider', count: 8, gapMs: 730 }] },
  { title: 'Первый натиск', intel: 'Плотная группа налётчиков', reward: 42, spawns: [{ type: 'raider', count: 14, gapMs: 560 }] },
  { title: 'Сумеречный забег', intel: 'Быстрые бегуны', reward: 48, spawns: [{ type: 'runner', count: 16, gapMs: 420 }] },
  { title: 'Клин и коготь', intel: 'Налётчики + быстрые', reward: 55, spawns: [{ type: 'raider', count: 10, gapMs: 560 }, { type: 'runner', count: 12, gapMs: 350 }] },
  { title: 'Стальной гром', intel: 'Броня под прикрытием', reward: 66, spawns: [{ type: 'brute', count: 3, gapMs: 760 }, { type: 'raider', count: 12, gapMs: 500 }] },
  { title: 'Голодная стая', intel: 'Масса быстрых · немного воздуха', reward: 74, spawns: [{ type: 'runner', count: 28, gapMs: 225 }, { type: 'winged', count: 6, gapMs: 510 }] },
  { title: 'Страж Бездны', intel: 'БОСС I · щит · призыв стаи', reward: 120, spawns: [{ type: 'raider', count: 12, gapMs: 460 }, { type: 'runner', count: 8, gapMs: 320 }, { type: 'warden', count: 1, gapMs: 900 }] },
  { title: 'Тени над долиной', intel: 'ВОЗДУХ · быстрые группы', reward: 82, spawns: [{ type: 'winged', count: 18, gapMs: 420 }, { type: 'runner', count: 12, gapMs: 310 }] },
  { title: 'Каменный марш', intel: 'Бронированные громилы', reward: 90, spawns: [{ type: 'brute', count: 8, gapMs: 700 }, { type: 'raider', count: 16, gapMs: 430 }] },
  { title: 'Десятый разлом', intel: 'Смешанная · воздух · броня', reward: 100, spawns: [{ type: 'brute', count: 6, gapMs: 640 }, { type: 'winged', count: 12, gapMs: 390 }, { type: 'runner', count: 18, gapMs: 270 }] },
  { title: 'Багровый поток', intel: 'Очень много быстрых целей', reward: 108, spawns: [{ type: 'runner', count: 34, gapMs: 205 }, { type: 'winged', count: 12, gapMs: 380 }] },
  { title: 'Железный круг', intel: 'Тяжёлая броня · плотный строй', reward: 118, spawns: [{ type: 'brute', count: 12, gapMs: 610 }, { type: 'raider', count: 20, gapMs: 400 }] },
  { title: 'Перед бурей', intel: 'Смешанный штурм со всех высот', reward: 128, spawns: [{ type: 'raider', count: 18, gapMs: 390 }, { type: 'runner', count: 20, gapMs: 235 }, { type: 'winged', count: 14, gapMs: 350 }] },
  { title: 'Титан Осколков', intel: 'БОСС II · тяжёлая броня · подкрепление', reward: 190, spawns: [{ type: 'brute', count: 7, gapMs: 590 }, { type: 'winged', count: 12, gapMs: 350 }, { type: 'titan', count: 1, gapMs: 950 }] },
  { title: 'Марш исполинов', intel: 'Много тяжёлой брони', reward: 142, spawns: [{ type: 'brute', count: 16, gapMs: 540 }, { type: 'raider', count: 20, gapMs: 360 }] },
  { title: 'Чёрные крылья', intel: 'Массированный воздух · быстрые', reward: 152, spawns: [{ type: 'winged', count: 26, gapMs: 310 }, { type: 'runner', count: 24, gapMs: 210 }] },
  { title: 'Ломка строя', intel: 'Броня прикрывает большую орду', reward: 164, spawns: [{ type: 'brute', count: 14, gapMs: 510 }, { type: 'raider', count: 32, gapMs: 330 }] },
  { title: 'Шторм Разлома', intel: 'Непрерывный смешанный натиск', reward: 178, spawns: [{ type: 'runner', count: 28, gapMs: 190 }, { type: 'winged', count: 18, gapMs: 290 }, { type: 'brute', count: 12, gapMs: 490 }] },
  { title: 'Последняя осада', intel: 'Элитная армия · все типы', reward: 200, spawns: [{ type: 'raider', count: 28, gapMs: 310 }, { type: 'brute', count: 16, gapMs: 470 }, { type: 'winged', count: 22, gapMs: 270 }] },
  { title: 'Владыка Разлома', intel: 'БОСС III · триумфальный штурм', reward: 320, spawns: [{ type: 'runner', count: 20, gapMs: 190 }, { type: 'winged', count: 14, gapMs: 280 }, { type: 'brute', count: 10, gapMs: 440 }, { type: 'boss', count: 1, gapMs: 1000 }] },
];

export const HERO = {
  maxHp: 420,
  maxMana: 240,
  speed: 210,
  attackDamage: 38,
  attackRange: 170,
  pursuitRange: 380,
  focusRadius: 38,
  attackMs: 700,
  respawnSeconds: 6,
  manaRegen: 9,
  abilities: {
    q: { name: 'Цепная молния', mana: 45, cooldown: 7, damage: 88 },
    w: { name: 'Грозовой скачок', mana: 55, cooldown: 9, damage: 105 },
    e: { name: 'Печать защиты', mana: 60, cooldown: 14, duration: 6 },
    r: { name: 'Сердце бури', mana: 100, cooldown: 30, damage: 48, duration: 6, requiredLevel: 3 },
  },
};

export const HERO_MECHANICS = {
  chainFalloff: 0.08,
  conductiveDurationMs: 5_000,
  conductiveStormMultiplier: 1.25,
  dashPhaseMs: 1_200,
  sealTowerRadius: 240,
  sealTowerDamageMultiplier: 1.35,
  stormTickMs: 500,
} as const;

export const HERO_OVERCHARGE = {
  durationMs: 8_000,
  attackSpeedMultiplier: 1.35,
  damageMultiplier: 1.22,
  manaRegenMultiplier: 1.35,
} as const;

export const HERO_LEVELS = [
  { level: 1, xp: 0, perk: 'Пробуждённое копьё · базовые атаки и молния' },
  { level: 2, xp: 80, perk: 'Электропроводность · усилены атака и запас маны' },
  { level: 3, xp: 190, perk: 'Сердце бури · открыта способность R' },
  { level: 4, xp: 330, perk: 'Грозовой след · дальше и сильнее рывок' },
  { level: 5, xp: 500, perk: 'Разветвлённая молния · Q бьёт больше целей' },
  { level: 6, xp: 700, perk: 'Рунный щит · E дольше и крепче защищает' },
  { level: 7, xp: 930, perk: 'Копьё грома · быстрее базовые атаки' },
  { level: 8, xp: 1190, perk: 'Око шторма · R шире и дольше бушует' },
  { level: 9, xp: 1480, perk: 'Грозовой резонанс · быстрее заряд и откаты' },
  { level: 10, xp: 1800, perk: 'Аватар бури · максимальная сила всех умений' },
] as const;
