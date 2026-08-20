export type Point = { x: number; y: number };
export type TowerType = 'archer' | 'frost' | 'siege' | 'boost';
export type DamageChannel = 'arrow' | 'frost' | 'siege' | 'storm';
export type EnemyType = 'raider' | 'runner' | 'brute' | 'winged' | 'warden' | 'titan' | 'boss';
export type EliteType = 'swift' | 'bulwark' | 'regenerator' | 'nullifier';
export type TargetMode = 'first' | 'strongest';
export type Difficulty = 'story' | 'standard' | 'rift';
export type MapId = 'valley' | 'frozen' | 'bastion' | 'stormspire' | 'abyss';
export type MapAnomalyKind = 'whiteout' | 'magma-tide' | 'storm-resonance' | 'void-eclipse';
export type HeroStance = 'guard' | 'pursuit';

export interface MapAnomalyDefinition {
  kind: MapAnomalyKind;
  icon: string;
  name: string;
  description: string;
  intervalMs: number;
  durationMs: number;
}

export interface MapDefinition {
  id: MapId;
  number: number;
  name: string;
  subtitle: string;
  description: string;
  asset: string;
  path: Point[];
  crystal: Point;
  forbidden: Array<{ x: number; y: number; radius: number }>;
  enemyHp: number;
  enemyArmor: number;
  enemySpeed: number;
  goldMultiplier: number;
  scoreMultiplier: number;
  anomaly: MapAnomalyDefinition | null;
  accent: number;
  routeColor: number;
  tint: number;
}

export interface DifficultyDefinition {
  id: Difficulty;
  name: string;
  description: string;
  enemyHp: number;
  enemyArmor: number;
  enemySpeed: number;
  enemyReward: number;
  lateEnemyReward: number;
  waveReward: number;
  waveHpGrowth: number;
  waveSpeedGrowth: number;
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
  projectileCount: number;
  projectileScale: number;
  perk: string;
  splash?: number;
  slow?: number;
  armorPierce?: number;
  damageBoost?: number;
  attackSpeedBoost?: number;
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
  levels: [TowerLevel, TowerLevel, TowerLevel, TowerLevel, TowerLevel, TowerLevel];
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

export interface EliteDefinition {
  type: EliteType;
  name: string;
  shortName: string;
  description: string;
  color: number;
  hpMultiplier: number;
  speedMultiplier: number;
  armorBonus: number;
  rewardMultiplier: number;
  shieldRatio: number;
  regeneration: number;
}

export interface WaveSpawn {
  type: EnemyType;
  count: number;
  gapMs: number;
  startMs?: number;
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
