export type Point = { x: number; y: number };
export type TowerType = 'archer' | 'frost' | 'siege' | 'boost';
export type EnemyType = 'raider' | 'runner' | 'brute' | 'winged' | 'warden' | 'titan' | 'boss';
export type TargetMode = 'first' | 'strongest';
export type Difficulty = 'story' | 'standard' | 'rift';
export type HeroStance = 'guard' | 'pursuit';

export interface DifficultyDefinition {
  id: Difficulty;
  name: string;
  description: string;
  enemyHp: number;
  enemySpeed: number;
  enemyReward: number;
  startingGold: number;
  crystalLives: number;
  scoreMultiplier: number;
  heroDamage: number;
  heroSpeed: number;
  heroManaRegen: number;
  heroDamageTaken: number;
  heroRespawn: number;
  intermission: number;
  bossShield: number;
  earlyStartGold: number;
  rules: [string, string, string];
}

export interface TowerLevel {
  damage: number;
  range: number;
  attackMs: number;
  upgradeCost: number | null;
}

export interface TowerDefinition {
  type: TowerType;
  name: string;
  cost: number;
  color: number;
  description: string;
  canTargetAir: boolean;
  splash: number;
  slow: number;
  levels: [TowerLevel, TowerLevel, TowerLevel];
}

export interface EnemyDefinition {
  type: EnemyType;
  name: string;
  maxHp: number;
  armor: number;
  speed: number;
  reward: number;
  crystalDamage: number;
  flying: boolean;
  color: number;
  radius: number;
}

export interface WaveSpawn {
  type: EnemyType;
  count: number;
  gapMs: number;
}

export interface WaveDefinition {
  title: string;
  intel: string;
  reward: number;
  spawns: WaveSpawn[];
}

export interface TowerSnapshot {
  x: number;
  y: number;
  radius: number;
}

export interface PlacementContext {
  point: Point;
  mapWidth: number;
  mapHeight: number;
  edgePadding: number;
  towerRadius: number;
  gold: number;
  cost: number;
  path: Point[];
  pathHalfWidth: number;
  crystal: Point;
  crystalRadius: number;
  forbidden: Array<{ x: number; y: number; radius: number }>;
  towers: TowerSnapshot[];
}

export interface TargetSnapshot {
  id: number;
  hp: number;
  maxHp: number;
  progress: number;
  flying: boolean;
  alive: boolean;
}

export interface MatchSnapshot {
  wave: number;
  finalWave: number;
  queuedEnemies: number;
  activeEnemies: number;
  crystalLives: number;
  ended: boolean;
}
