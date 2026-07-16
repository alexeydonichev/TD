import type { EnemyDefinition, Point, TowerDefinition, WaveDefinition } from './types';

export const GAME_WIDTH = 1200;
export const GAME_HEIGHT = 700;
export const STARTING_GOLD = 430;
export const STARTING_LIVES = 20;
export const INTERMISSION_SECONDS = 12;
export const EARLY_START_GOLD_PER_SECOND = 2;
export const WAVE_CLEAR_GOLD = 35;

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
      { damage: 24, range: 150, attackMs: 620, upgradeCost: 90 },
      { damage: 39, range: 165, attackMs: 520, upgradeCost: 155 },
      { damage: 63, range: 180, attackMs: 430, upgradeCost: null },
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
      { damage: 17, range: 135, attackMs: 900, upgradeCost: 105 },
      { damage: 28, range: 150, attackMs: 800, upgradeCost: 170 },
      { damage: 45, range: 170, attackMs: 690, upgradeCost: null },
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
      { damage: 72, range: 175, attackMs: 1700, upgradeCost: 135 },
      { damage: 118, range: 190, attackMs: 1500, upgradeCost: 210 },
      { damage: 188, range: 210, attackMs: 1300, upgradeCost: null },
    ],
  },
  boost: {
    type: 'boost',
    name: 'Башня усиления',
    cost: 160,
    color: 0xb78cff,
    description: 'Усиливает урон соседних башен на 25%',
    canTargetAir: false,
    splash: 0,
    slow: 0,
    levels: [
      { damage: 0, range: 135, attackMs: 0, upgradeCost: 120 },
      { damage: 0, range: 160, attackMs: 0, upgradeCost: 185 },
      { damage: 0, range: 190, attackMs: 0, upgradeCost: null },
    ],
  },
};

export const ENEMIES: Record<string, EnemyDefinition> = {
  raider: { type: 'raider', name: 'Налётчик', maxHp: 120, armor: 3, speed: 54, reward: 16, crystalDamage: 1, flying: false, color: 0xa85bca, radius: 14 },
  runner: { type: 'runner', name: 'Бегун', maxHp: 78, armor: 0, speed: 92, reward: 14, crystalDamage: 1, flying: false, color: 0xdc65ed, radius: 11 },
  brute: { type: 'brute', name: 'Громила', maxHp: 430, armor: 30, speed: 35, reward: 36, crystalDamage: 2, flying: false, color: 0x744a9b, radius: 19 },
  winged: { type: 'winged', name: 'Крылатое порождение', maxHp: 155, armor: 5, speed: 67, reward: 25, crystalDamage: 1, flying: true, color: 0x8e9cff, radius: 13 },
  boss: { type: 'boss', name: 'Владыка Разлома', maxHp: 4200, armor: 22, speed: 27, reward: 600, crystalDamage: 8, flying: false, color: 0xff3f9a, radius: 30 },
};

export const WAVES: WaveDefinition[] = [
  { title: 'Разведчики Разлома', intel: 'Налётчики · наземные', reward: 35, spawns: [{ type: 'raider', count: 7, gapMs: 780 }] },
  { title: 'Первый натиск', intel: 'Много налётчиков · наземные', reward: 40, spawns: [{ type: 'raider', count: 12, gapMs: 610 }] },
  { title: 'Сумеречный забег', intel: 'Быстрые бегуны', reward: 45, spawns: [{ type: 'runner', count: 13, gapMs: 470 }] },
  { title: 'Клин и коготь', intel: 'Налётчики + быстрые', reward: 50, spawns: [{ type: 'raider', count: 8, gapMs: 620 }, { type: 'runner', count: 10, gapMs: 390 }] },
  { title: 'Стальной гром', intel: 'Бронированный мини-босс', reward: 65, spawns: [{ type: 'brute', count: 1, gapMs: 500 }, { type: 'raider', count: 9, gapMs: 560 }] },
  { title: 'Бездна голодна', intel: 'Масса слабых существ', reward: 60, spawns: [{ type: 'runner', count: 26, gapMs: 240 }] },
  { title: 'Каменный марш', intel: 'Бронированные громилы', reward: 70, spawns: [{ type: 'brute', count: 7, gapMs: 820 }] },
  { title: 'Тени над долиной', intel: 'ВОЗДУХ · нужны стрелковые/ледяные', reward: 75, spawns: [{ type: 'winged', count: 15, gapMs: 500 }] },
  { title: 'Преддверие бури', intel: 'Смешанная · воздух · броня', reward: 90, spawns: [{ type: 'brute', count: 5, gapMs: 720 }, { type: 'winged', count: 9, gapMs: 480 }, { type: 'runner', count: 14, gapMs: 310 }] },
  { title: 'Владыка Разлома', intel: 'БОСС · щит · две фазы · сопровождение', reward: 150, spawns: [{ type: 'raider', count: 8, gapMs: 520 }, { type: 'brute', count: 3, gapMs: 700 }, { type: 'boss', count: 1, gapMs: 1000 }] },
];

export const HERO = {
  maxHp: 420,
  maxMana: 240,
  speed: 210,
  attackDamage: 38,
  attackRange: 170,
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
