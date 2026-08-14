import type { DifficultyDefinition, EnemyDefinition, Point, TowerDefinition, WaveDefinition } from './types';

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
    id: 'rift', name: 'Повелитель бури', description: 'Дефицит ресурсов и нарастающий натиск', enemyHp: 1.28 * 1.3, enemyArmor: 1.1,
    enemySpeed: 1.1, enemyReward: 0.72, lateEnemyReward: 0.46, waveReward: 0.5, waveHpGrowth: 1.1, waveSpeedGrowth: 1.1,
    startingGold: 330, crystalLives: 10, scoreMultiplier: 2,
    heroDamage: 1, heroSpeed: 1, heroManaRegen: 0.8, heroDamageTaken: 1.4, heroRespawn: 1.5,
    intermission: 0.67, bossShield: 1.35, earlyStartGold: 0.45,
    rules: ['10 прочности · награды −28% → −54% · зачистка −50%', 'Враги: ещё +30% здоровья · броня +10% · натиск растёт быстрее', '8с подготовки · мана −20% · урон герою +40% · щиты +35%'],
  },
};

export const PATH: Point[] = [
  { x: 28, y: 330 },
  { x: 230, y: 330 },
  { x: 230, y: 145 },
  { x: 510, y: 145 },
  { x: 510, y: 520 },
  { x: 790, y: 520 },
  { x: 790, y: 260 },
  { x: 1082, y: 260 },
];

export const CRYSTAL = { x: 1120, y: 260 };
export const FORBIDDEN_ZONES = [
  { x: 100, y: 110, radius: 62 },
  { x: 370, y: 350, radius: 56 },
  { x: 675, y: 335, radius: 70 },
  { x: 1010, y: 545, radius: 74 },
];

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
    w: { name: 'Грозовой рывок', mana: 55, cooldown: 9, damage: 105 },
    e: { name: 'Печать защиты', mana: 60, cooldown: 14, duration: 6 },
    r: { name: 'Сердце бури', mana: 100, cooldown: 30, damage: 48, duration: 6, requiredLevel: 3 },
  },
};
