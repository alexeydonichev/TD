import Phaser from 'phaser';
import {
  BUILD_GRID_PADDING, BUILD_GRID_SIZE, DIFFICULTIES, EARLY_START_GOLD_PER_SECOND, ELITES, ENEMIES, GAME_HEIGHT, GAME_WIDTH, HERO, HERO_OVERCHARGE,
  INTERMISSION_SECONDS, MAP_ORDER, MAPS, MAX_TOWER_LEVEL, TOWERS, WAVES,
} from '../core/config';
import {
  absorbShield, applyArmor, applySlow, chainTargets, damageOutcome, dashDestination, distance, distanceToPath, earlyStartBonus, eliteAffixForSpawn, loseLives,
  placementFailure, pointToLineDistance, roundedPath, scaleEnemy, snapToGrid, selectTarget, sellValue, waveClearReward, waveHpMultiplier, waveSpeedMultiplier,
} from '../core/rules';
import type { Difficulty, EliteType, EnemyType, HeroStance, MapId, Point, TargetMode, TowerType } from '../core/types';
import { emit, on } from './bus';
import {
  animateTowerFire, createProjectileImpact, createProjectileVisual, drawTowerDetails, enemyMotionPose,
  type OffensiveTowerType,
} from './combatVisuals';
import {
  animateHeroAttack, createDashStorm, createHeroOverchargeAura, createLightningBolt, createStormField, createStormShield, createThunderBurst, launchStormSpear,
} from './heroVisuals';
import { createElitePulse, createShieldBreakEffect, drawEliteAura } from './enemyVisuals';

type Action =
  | { type: 'begin' } | { type: 'build'; tower: TowerType } | { type: 'start-wave' }
  | { type: 'pause' } | { type: 'speed' } | { type: 'upgrade' } | { type: 'sell' }
  | { type: 'target' } | { type: 'ability'; key: 'q' | 'w' | 'e' | 'r' }
  | { type: 'hero-stance' } | { type: 'hero-stop' }
  | { type: 'zoom'; direction: 'in' | 'out' | 'reset' }
  | { type: 'difficulty'; difficulty: Difficulty };

interface TowerUnit {
  id: number;
  type: TowerType;
  x: number;
  y: number;
  level: number;
  targetMode: TargetMode;
  nextAttackAt: number;
  paidUpgrades: number[];
  damageDealt: number;
  kills: number;
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
  details: Phaser.GameObjects.Graphics;
}

interface EnemyUnit {
  id: number;
  type: EnemyType;
  hp: number;
  maxHp: number;
  progress: number;
  alive: boolean;
  slow: number;
  slowUntil: number;
  phase: number;
  shieldUntil: number;
  lastShieldAt: number;
  summonedPhase: boolean;
  contactCooldown: number;
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Graphics;
  spriteBaseScale: number;
  spriteBaseY: number;
  motionSeed: number;
  laneOffset: number;
  hitPulseUntil: number;
  elite: EliteType | null;
  eliteShield: number;
  maxEliteShield: number;
  nextElitePulseAt: number;
  eliteArt: Phaser.GameObjects.Graphics;
}

interface Projectile {
  view: Phaser.GameObjects.Container;
  target: EnemyUnit;
  source: TowerUnit;
  damage: number;
  speed: number;
  splash: number;
  slow: number;
  armorPierce: number;
  kind: OffensiveTowerType;
  level: number;
}

interface Storm {
  x: number;
  y: number;
  endsAt: number;
  nextTick: number;
  view: Phaser.GameObjects.Container;
}

interface SpawnEntry { type: EnemyType; at: number }
type HeroCommand = 'hold' | 'move' | 'focus' | 'pursuit' | 'aim';

interface HeroState {
  x: number;
  y: number;
  target: Point;
  hp: number;
  mana: number;
  xp: number;
  level: number;
  alive: boolean;
  respawnAt: number;
  nextAttackAt: number;
  sealUntil: number;
  stormCharge: number;
  overchargeUntil: number;
  stance: HeroStance;
  focusTargetId: number | null;
  moveCommand: boolean;
  cooldowns: Record<'q' | 'w' | 'e' | 'r', number>;
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
}

export interface HudState {
  started: boolean;
  mapId: MapId;
  mapName: string;
  mapNumber: number;
  mapTotal: number;
  mapGoldMultiplier: number;
  gold: number;
  lives: number;
  wave: number;
  totalWaves: number;
  remaining: number;
  countdown: number;
  waveActive: boolean;
  waveTitle: string;
  waveIntel: string;
  paused: boolean;
  speed: number;
  difficulty: Difficulty;
  difficultyName: string;
  score: number;
  towerCount: number;
  buildType: TowerType | null;
  placementMessage: string;
  selectedTower: null | {
    type: TowerType;
    x: number;
    y: number;
    name: string;
    level: number;
    mode: string;
    nextCost: number | null;
    sellValue: number;
    description: string;
    perk: string;
    damage: number;
    attacksPerSecond: number;
    range: number;
    projectileCount: number;
    projectileScale: number;
    armorPierce: number;
    splash: number;
    slow: number;
    auraDamage: number;
    auraSpeed: number;
    damageDealt: number;
    kills: number;
    boosted: boolean;
    auraTargets: number;
  };
  hero: { x: number; y: number; hp: number; maxHp: number; mana: number; maxMana: number; xp: number; xpNext: number; level: number; alive: boolean; respawn: number; stance: HeroStance; focusTarget: string | null; command: HeroCommand; aimAbility: 'r' | null; stormCharge: number; overcharge: number; abilities: Record<string, { cooldown: number; mana: number; locked: boolean }> };
  boss: null | { name: string; hp: number; maxHp: number; phase: number; shielded: boolean };
  cameraZoom: number;
  result: 'playing' | 'victory' | 'defeat';
}

declare global {
  interface Window {
    __TD_TEST__?: {
      state: () => HudState;
      skipToBoss: (tier?: 1 | 2 | 3) => void;
      defeat: () => void;
      spawnStress: (count: number) => void;
      spawnElite: (elite?: EliteType) => void;
      chargeHero: () => void;
      enemies: () => Array<{ id: number; type: EnemyType; name: string; x: number; y: number; elite: EliteType | null; shield: number }>;
      metrics: () => { activeEnemies: number; eliteEnemies: number; gameObjects: number; averageFrameMs: number; fps: number; maxGroundRoadDeviation: number };
      visuals: () => { attack: number; q: number; w: number; e: number; r: number; overcharge: number };
    };
  }
}

const TEST_MODE = new URLSearchParams(window.location.search).get('test') === '1';
const ENEMY_HP_SCALE = TEST_MODE ? 0.08 : 1;
const ENEMY_SPEED_SCALE = TEST_MODE ? 2.8 : 1;

export class GameScene extends Phaser.Scene {
  private simTime = 0;
  private lastHudAt = -1000;
  private started = false;
  private paused = false;
  private speed = 1;
  private difficulty: Difficulty = (localStorage.getItem('rift-difficulty') as Difficulty | null) ?? 'standard';
  private map = MAPS[localStorage.getItem('rift-map') ?? ''] ?? MAPS.valley;
  private gold = TEST_MODE ? 9999 : Math.round(DIFFICULTIES[this.difficulty].startingGold * this.map.goldMultiplier);
  private lives = DIFFICULTIES[this.difficulty].crystalLives;
  private score = 0;
  private currentWave = 0;
  private waveActive = false;
  private countdown = TEST_MODE ? 30 : INTERMISSION_SECONDS * DIFFICULTIES[this.difficulty].intermission;
  private result: 'playing' | 'victory' | 'defeat' = 'playing';
  private nextId = 1;
  private towers: TowerUnit[] = [];
  private enemies: EnemyUnit[] = [];
  private projectiles: Projectile[] = [];
  private storms: Storm[] = [];
  private spawnQueue: SpawnEntry[] = [];
  private spawnedThisWave = 0;
  private buildType: TowerType | null = null;
  private selectedTower: TowerUnit | null = null;
  private placementMessage = '';
  private buildGrid!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private heroTargetMarker!: Phaser.GameObjects.Graphics;
  private heroFocusMarker!: Phaser.GameObjects.Graphics;
  private heroCommandPath!: Phaser.GameObjects.Graphics;
  private abilityPreview!: Phaser.GameObjects.Graphics;
  private hero!: HeroState;
  private heroSealView: Phaser.GameObjects.Container | null = null;
  private heroOverchargeView: Phaser.GameObjects.Container | null = null;
  private visualEvents = { attack: 0, q: 0, w: 0, e: 0, r: 0, overcharge: 0 };
  private aimAbility: 'r' | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private routePoints: Point[] = [];
  private routeLengths: number[] = [];
  private routeTotal = 0;
  private routeProgressScale = 1;
  private offAction: (() => void) | null = null;
  private frameSamples: number[] = [];
  private reduceMotion = localStorage.getItem('rift-reduce-motion') === 'on';
  private screenShake = localStorage.getItem('rift-screen-shake') !== 'off';
  private cameraTargetZoom = 1.08;
  private cameraDragging = false;
  private cameraDragX = 0;
  private cameraDragY = 0;

  constructor() {
    super('campaign');
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => emit('td:load-progress', progress));
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => emit('td:load-error', file.key));
    this.load.image('map-landscape', this.map.asset);
    this.load.spritesheet('tower-art', 'assets/towers-atlas.webp', { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('unit-motion-art', 'assets/units-motion-atlas.webp', { frameWidth: 384, frameHeight: 512 });
    this.load.image('hero-v2', 'assets/hero-v2.webp');
  }

  create(): void {
    this.buildRouteCache();
    this.drawMap();
    this.createAtmosphere();
    this.buildGrid = this.add.graphics().setDepth(14);
    this.preview = this.add.graphics().setDepth(40);
    this.selectionRing = this.add.graphics().setDepth(35);
    this.heroTargetMarker = this.add.graphics().setDepth(13);
    this.heroFocusMarker = this.add.graphics().setDepth(32);
    this.heroCommandPath = this.add.graphics().setDepth(12);
    this.abilityPreview = this.add.graphics().setDepth(36);
    this.createHero();
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.drawPlacementPreview(pointer);
      this.drawAbilityPreview(pointer);
      this.handleCameraDrag(pointer);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    this.input.on('pointerup', () => { this.cameraDragging = false; });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.setCameraZoom(dy < 0 ? 'in' : 'out');
    });
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,C,X,Q,E,R,U,SHIFT,UP,DOWN,LEFT,RIGHT,SPACE,F,ESC,ONE,TWO,THREE,FOUR') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ONE.on('down', () => this.chooseBuild('archer'));
    this.keys.TWO.on('down', () => this.chooseBuild('frost'));
    this.keys.THREE.on('down', () => this.chooseBuild('siege'));
    this.keys.FOUR.on('down', () => this.chooseBuild('boost'));
    this.keys.ESC.on('down', () => this.aimAbility ? this.cancelAim() : this.chooseBuild(null));
    this.keys.SPACE.on('down', () => this.togglePause());
    this.keys.F.on('down', () => this.cameras.main.centerOn(this.hero.x, this.hero.y));
    this.keys.C.on('down', () => this.toggleHeroStance());
    this.keys.X.on('down', () => this.stopHero());
    this.keys.Q.on('down', () => this.useAbility('q'));
    this.keys.SHIFT.on('down', () => this.useAbility('w'));
    this.keys.E.on('down', () => this.useAbility('e'));
    this.keys.R.on('down', () => this.useAbility('r'));
    this.keys.U.on('down', () => {
      this.upgradeSelected();
      this.emitHud(true);
    });
    this.offAction = on<Action>('td:action', (action) => this.handleAction(action));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offAction?.());
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT).setZoom(this.cameraTargetZoom).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.emitHud(true);
    if (TEST_MODE) {
      window.__TD_TEST__ = {
        state: () => this.getHudState(),
        skipToBoss: (tier) => this.skipToBoss(tier),
        defeat: () => { this.lives = 0; this.finish('defeat'); },
        spawnStress: (count) => this.spawnStress(count),
        spawnElite: (elite = 'bulwark') => this.spawnEliteForTest(elite),
        chargeHero: () => this.addStormCharge(100),
        enemies: () => this.enemies.filter((enemy) => enemy.alive).map((enemy) => ({
          id: enemy.id, type: enemy.type, name: this.enemyDefinition(enemy.type).name,
          x: enemy.container.x, y: enemy.container.y, elite: enemy.elite, shield: enemy.eliteShield,
        })),
        metrics: () => this.getPerformanceMetrics(),
        visuals: () => ({ ...this.visualEvents }),
      };
    }
  }

  update(_time: number, rawDelta: number): void {
    this.reduceMotion = localStorage.getItem('rift-reduce-motion') === 'on';
    this.screenShake = localStorage.getItem('rift-screen-shake') !== 'off';
    this.frameSamples.push(rawDelta);
    if (this.frameSamples.length > 240) this.frameSamples.shift();
    this.updateCamera(rawDelta);
    if (!this.started || this.paused || this.result !== 'playing') {
      this.emitHud();
      return;
    }
    const delta = Math.min(rawDelta, 50) * this.speed;
    this.simTime += delta;
    this.updateWave(delta);
    this.updateEnemies(delta);
    this.updateHero(delta);
    this.updateTowers();
    this.updateTowerVisuals();
    this.updateProjectiles(delta);
    this.updateStorms();
    this.emitHud();
  }

  private buildRouteCache(): void {
    this.routePoints = roundedPath(this.map.path, 30, 8);
    const path = this.routePoints;
    const authoredLength = this.map.path.slice(0, -1).reduce((total, point, index) => total + distance(point, this.map.path[index + 1]), 0);
    this.routeLengths = [];
    this.routeTotal = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
      const length = distance(path[index], path[index + 1]);
      this.routeLengths.push(length);
      this.routeTotal += length;
    }
    this.routeProgressScale = authoredLength > 0 ? this.routeTotal / authoredLength : 1;
  }

  private drawMap(): void {
    const { crystal: crystalPoint, forbidden } = this.map;
    const path = this.routePoints;
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'map-landscape')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(-30).setTint(this.map.tint);
    const background = this.add.graphics().setDepth(-20);
    background.fillStyle(0x07111d, 0.17).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    background.lineStyle(3, 0x86b297, 0.48).strokeRoundedRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24, 24);
    forbidden.forEach((zone, index) => {
      background.fillStyle(index % 2 ? 0x64d7b8 : 0xb165e7, 0.035).fillCircle(zone.x, zone.y, zone.radius);
      background.lineStyle(1.5, index % 2 ? 0x82d8bc : 0xbd7bf0, 0.26).strokeCircle(zone.x, zone.y, zone.radius);
      for (let rock = 0; rock < 5; rock += 1) {
        const angle = (rock / 5) * Math.PI * 2;
        background.fillStyle(index % 2 ? 0x92b8a4 : 0x9d73bc, 0.42).fillTriangle(
          zone.x + Math.cos(angle) * zone.radius * 0.55,
          zone.y + Math.sin(angle) * zone.radius * 0.55 - 10,
          zone.x + Math.cos(angle) * zone.radius * 0.55 - 10,
          zone.y + Math.sin(angle) * zone.radius * 0.55 + 10,
          zone.x + Math.cos(angle) * zone.radius * 0.55 + 10,
          zone.y + Math.sin(angle) * zone.radius * 0.55 + 10,
        );
      }
    });
    const road = this.add.graphics().setDepth(-10);
    road.lineStyle(76, 0x0b0712, 0.18).beginPath().moveTo(path[0].x + 5, path[0].y + 7);
    path.slice(1).forEach((point) => road.lineTo(point.x + 7, point.y + 10));
    road.strokePath();
    road.lineStyle(61, this.map.routeColor, 0.08).beginPath().moveTo(path[0].x, path[0].y);
    path.slice(1).forEach((point) => road.lineTo(point.x, point.y));
    road.strokePath();
    road.lineStyle(2, this.map.routeColor, 0.38).beginPath().moveTo(path[0].x, path[0].y);
    path.slice(1).forEach((point) => road.lineTo(point.x, point.y));
    road.strokePath();
    const routeRunes = this.add.graphics().setDepth(-8);
    this.map.path.slice(1, -1).forEach((point, index) => {
      const color = index % 2 ? 0x83edf5 : 0xf3c96e;
      routeRunes.fillStyle(0x0b1018, 0.64).fillCircle(point.x, point.y, 10)
        .lineStyle(2, color, 0.56).strokeCircle(point.x, point.y, 8)
        .fillStyle(color, 0.7).fillPoints([
          { x: point.x, y: point.y - 4 }, { x: point.x + 4, y: point.y },
          { x: point.x, y: point.y + 4 }, { x: point.x - 4, y: point.y },
        ], true);
    });
    const portal = this.add.graphics();
    portal.fillStyle(0x090713, 1).fillEllipse(path[0].x + 8, path[0].y, 55, 82);
    portal.lineStyle(7, this.map.accent, 0.9).strokeEllipse(path[0].x + 8, path[0].y, 55, 82);
    portal.lineStyle(2, 0xe0a8ff, 0.8).strokeEllipse(path[0].x + 8, path[0].y, 35, 61);
    this.add.text(22, Math.min(GAME_HEIGHT - 30, path[0].y + 53), 'ПОРТАЛ РАЗЛОМА', { fontFamily: 'Arial', fontSize: '13px', color: '#d6a8ff', fontStyle: 'bold' });
    const crystal = this.add.graphics().setDepth(5);
    crystal.fillStyle(0xf7b34a, 0.22).fillCircle(crystalPoint.x, crystalPoint.y, 55);
    crystal.fillStyle(0x3b2918, 1).fillEllipse(crystalPoint.x + 7, crystalPoint.y + 27, 64, 24);
    crystal.fillStyle(0xffd56b, 1).fillPoints([
      { x: crystalPoint.x, y: crystalPoint.y - 48 }, { x: crystalPoint.x + 24, y: crystalPoint.y - 5 },
      { x: crystalPoint.x + 8, y: crystalPoint.y + 32 }, { x: crystalPoint.x - 22, y: crystalPoint.y + 1 },
    ], true);
    crystal.lineStyle(4, 0xfff1b2, 0.9).strokePoints([
      { x: crystalPoint.x, y: crystalPoint.y - 48 }, { x: crystalPoint.x + 24, y: crystalPoint.y - 5 },
      { x: crystalPoint.x + 8, y: crystalPoint.y + 32 }, { x: crystalPoint.x - 22, y: crystalPoint.y + 1 },
    ], true);
    this.add.text(crystalPoint.x - 62, Math.min(GAME_HEIGHT - 26, crystalPoint.y + 61), 'КРИСТАЛЛ', { fontFamily: 'Arial', fontSize: '14px', color: '#ffd978', fontStyle: 'bold' });
  }

  private createAtmosphere(): void {
    for (let index = 0; index < 28; index += 1) {
      const warm = index % 3 === 0;
      const mote = this.add.circle(
        Phaser.Math.Between(20, GAME_WIDTH - 20), Phaser.Math.Between(30, GAME_HEIGHT - 30),
        Phaser.Math.Between(1, 3), warm ? 0xffd36a : 0xa771ff, Phaser.Math.FloatBetween(0.12, 0.38),
      ).setDepth(7);
      if (!this.reduceMotion) {
        this.tweens.add({
          targets: mote, x: mote.x + Phaser.Math.Between(-70, 70), y: mote.y - Phaser.Math.Between(35, 110),
          alpha: { from: mote.alpha, to: 0.04 }, duration: Phaser.Math.Between(4200, 8200),
          yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Phaser.Math.Between(0, 2000),
        });
      }
    }
    const portal = this.map.path[0];
    const crystal = this.map.crystal;
    const portalAura = this.add.circle(portal.x + 8, portal.y, 42, this.map.accent, 0.03).setStrokeStyle(2, this.map.accent, 0.32).setDepth(6);
    const crystalAura = this.add.circle(crystal.x, crystal.y, 48, 0xffcb62, 0.025).setStrokeStyle(2, 0xffe6a0, 0.3).setDepth(6);
    if (!this.reduceMotion) {
      this.tweens.add({ targets: portalAura, scale: 1.28, alpha: 0.04, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: crystalAura, scale: 1.2, alpha: 0.06, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  private createHero(): void {
    const crystal = this.map.crystal;
    const art = this.add.graphics();
    const sprite = this.add.image(0, -40, 'hero-v2').setDisplaySize(88, 88);
    const container = this.add.container(crystal.x - 70, crystal.y + 80, [art, sprite]).setDepth(18);
    this.hero = {
      x: container.x, y: container.y, target: { x: container.x, y: container.y }, hp: HERO.maxHp, mana: HERO.maxMana,
      xp: TEST_MODE ? 260 : 0, level: TEST_MODE ? 3 : 1, alive: true, respawnAt: 0, nextAttackAt: 0, sealUntil: 0,
      stormCharge: 0, overchargeUntil: 0,
      stance: 'guard', focusTargetId: null, moveCommand: false,
      cooldowns: { q: 0, w: 0, e: 0, r: 0 }, container, art, sprite,
    };
    this.drawHeroArt();
  }

  private handleAction(action: Action): void {
    if (action.type === 'begin') {
      this.started = true;
      emit('td:sound', 'wave');
    } else if (action.type === 'difficulty' && !this.started) {
      this.difficulty = action.difficulty;
      localStorage.setItem('rift-difficulty', action.difficulty);
      this.gold = TEST_MODE ? 9999 : Math.round(DIFFICULTIES[this.difficulty].startingGold * this.map.goldMultiplier);
      this.lives = DIFFICULTIES[this.difficulty].crystalLives;
      this.countdown = TEST_MODE ? 30 : INTERMISSION_SECONDS * DIFFICULTIES[this.difficulty].intermission;
    } else if (action.type === 'build') this.chooseBuild(action.tower);
    else if (action.type === 'start-wave') this.startNextWave(true);
    else if (action.type === 'pause') this.togglePause();
    else if (action.type === 'speed') this.speed = this.speed === 1 ? 2 : 1;
    else if (action.type === 'upgrade') this.upgradeSelected();
    else if (action.type === 'sell') this.sellSelected();
    else if (action.type === 'target') this.toggleTargetMode();
    else if (action.type === 'hero-stance') this.toggleHeroStance();
    else if (action.type === 'hero-stop') this.stopHero();
    else if (action.type === 'ability') this.useAbility(action.key);
    else if (action.type === 'zoom') this.setCameraZoom(action.direction);
    this.emitHud(true);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (pointer.middleButtonDown()) {
      this.cameraDragging = true;
      this.cameraDragX = pointer.x;
      this.cameraDragY = pointer.y;
      return;
    }
    this.cameraDragging = false;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.aimAbility) {
      if (pointer.rightButtonDown()) this.cancelAim();
      else if (pointer.leftButtonDown()) this.confirmAim(world);
      return;
    }
    if (pointer.rightButtonDown()) {
      const focused = this.enemies.filter((enemy) => enemy.alive)
        .sort((a, b) => distance(world, a.container) - distance(world, b.container))
        .find((enemy) => distance(world, enemy.container) <= Math.max(HERO.focusRadius, this.enemyDefinition(enemy.type).radius + 18));
      if (focused) {
        this.hero.focusTargetId = focused.id;
        this.hero.moveCommand = false;
        this.hero.target = { x: this.hero.x, y: this.hero.y };
        this.heroTargetMarker.clear();
        this.drawHeroFocusMarker(focused);
        this.chooseBuild(null);
        return;
      }
      this.hero.focusTargetId = null;
      this.heroFocusMarker.clear();
      this.hero.moveCommand = true;
      this.hero.target = { x: Phaser.Math.Clamp(world.x, 20, GAME_WIDTH - 20), y: Phaser.Math.Clamp(world.y, 20, GAME_HEIGHT - 20) };
      this.drawHeroTargetMarker();
      this.chooseBuild(null);
      return;
    }
    if (this.buildType) this.placeTower(world);
    else this.selectTowerAt(world);
  }

  private handleCameraDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.cameraDragging || !pointer.isDown) return;
    const camera = this.cameras.main;
    camera.scrollX -= (pointer.x - this.cameraDragX) / camera.zoom;
    camera.scrollY -= (pointer.y - this.cameraDragY) / camera.zoom;
    this.cameraDragX = pointer.x;
    this.cameraDragY = pointer.y;
  }

  private drawHeroTargetMarker(): void {
    this.heroTargetMarker.clear();
    if (!this.hero.alive) return;
    this.heroTargetMarker.lineStyle(2, 0x9ef5ff, 0.85).strokeCircle(this.hero.target.x, this.hero.target.y, 12)
      .lineStyle(1, 0xffdf7d, 0.8).strokeCircle(this.hero.target.x, this.hero.target.y, 5);
  }

  private drawHeroArt(): void {
    if (!this.hero) return;
    const overcharged = this.hero.overchargeUntil > this.simTime;
    const color = overcharged ? 0xffe47a : this.hero.stance === 'pursuit' ? 0xffc35c : 0x74e5f4;
    const art = this.hero.art.clear();
    art.fillStyle(0x071019, 0.68).fillEllipse(3, 7, 50, 18);
    art.fillStyle(color, overcharged ? 0.2 : this.hero.sealUntil > this.simTime ? 0.18 : 0.09).fillCircle(0, 1, overcharged ? 37 : 31);
    art.lineStyle(overcharged || this.hero.stance === 'pursuit' ? 3 : 2, color, 0.78).strokeEllipse(0, 3, overcharged ? 64 : 54, overcharged ? 31 : 25);
    art.lineStyle(1, 0xf6d477, 0.42).strokeCircle(0, 1, 33);
    art.fillStyle(0x120f18, 0.86).fillRoundedRect(-27, -91, 54, 6, 2);
    art.fillStyle(this.hero.hp / HERO.maxHp > 0.35 ? 0x58e0b2 : 0xff6578, 0.98)
      .fillRoundedRect(-26, -90, 52 * Math.max(0, this.hero.hp / HERO.maxHp), 4, 2);
  }

  private drawHeroCommand(focus: EnemyUnit | null): void {
    const path = this.heroCommandPath.clear();
    if (!this.hero.alive || this.aimAbility) return;
    const destination = this.hero.moveCommand ? this.hero.target : focus ? { x: focus.container.x, y: focus.container.y } : null;
    if (!destination || distance(this.hero, destination) < 12) return;
    const color = focus ? 0xffc35c : 0x76e9f7;
    path.lineStyle(2, color, focus ? 0.36 : 0.28).beginPath().moveTo(this.hero.x, this.hero.y).lineTo(destination.x, destination.y).strokePath();
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, destination.x, destination.y);
    path.fillStyle(color, 0.86).fillTriangle(
      destination.x, destination.y,
      destination.x - Math.cos(angle - 0.55) * 13, destination.y - Math.sin(angle - 0.55) * 13,
      destination.x - Math.cos(angle + 0.55) * 13, destination.y - Math.sin(angle + 0.55) * 13,
    );
  }

  private drawAbilityPreview(pointer: Phaser.Input.Pointer): void {
    const preview = this.abilityPreview.clear();
    if (this.aimAbility !== 'r' || !this.hero.alive) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const center = {
      x: Phaser.Math.Clamp(world.x, 155, GAME_WIDTH - 155),
      y: Phaser.Math.Clamp(world.y, 155, GAME_HEIGHT - 155),
    };
    preview.fillStyle(0x5d3fe0, 0.14).fillCircle(center.x, center.y, 155)
      .lineStyle(3, 0xa9f4ff, 0.82).strokeCircle(center.x, center.y, 155)
      .lineStyle(1, 0xf7d473, 0.68).strokeCircle(center.x, center.y, 18)
      .beginPath().moveTo(center.x - 28, center.y).lineTo(center.x + 28, center.y)
      .moveTo(center.x, center.y - 28).lineTo(center.x, center.y + 28).strokePath()
      .lineStyle(2, 0x80eafa, 0.24).beginPath().moveTo(this.hero.x, this.hero.y).lineTo(center.x, center.y).strokePath();
  }

  private drawHeroFocusMarker(enemy: EnemyUnit): void {
    this.heroFocusMarker.clear();
    if (!this.hero.alive || !enemy.alive) return;
    const radius = this.enemyDefinition(enemy.type).radius + 14;
    this.heroFocusMarker.lineStyle(3, 0xffd46b, 0.95).strokeCircle(enemy.container.x, enemy.container.y - 4, radius)
      .lineStyle(1, 0x8ff4ff, 0.75).strokeCircle(enemy.container.x, enemy.container.y - 4, radius + 6);
  }

  private focusedEnemy(): EnemyUnit | null {
    const enemy = this.hero.focusTargetId === null ? null : this.enemies.find((candidate) => candidate.id === this.hero.focusTargetId && candidate.alive) ?? null;
    if (!enemy && this.hero.focusTargetId !== null) {
      this.hero.focusTargetId = null;
      this.heroFocusMarker.clear();
    }
    return enemy;
  }

  private toggleHeroStance(): void {
    if (!this.hero) return;
    this.cancelAim(false);
    this.hero.stance = this.hero.stance === 'guard' ? 'pursuit' : 'guard';
    if (this.hero.stance === 'guard') {
      this.hero.target = { x: this.hero.x, y: this.hero.y };
      this.hero.moveCommand = false;
    }
    this.emitHud(true);
  }

  private stopHero(): void {
    if (!this.hero) return;
    this.cancelAim(false);
    this.hero.stance = 'guard';
    this.hero.focusTargetId = null;
    this.hero.moveCommand = false;
    this.hero.target = { x: this.hero.x, y: this.hero.y };
    this.heroTargetMarker.clear();
    this.heroFocusMarker.clear();
    this.heroCommandPath.clear();
    this.drawHeroArt();
    this.emitHud(true);
  }

  private cancelAim(emitState = true): void {
    this.aimAbility = null;
    this.abilityPreview.clear();
    if (emitState) this.emitHud(true);
  }

  private confirmAim(point: Point): void {
    if (this.aimAbility !== 'r') return;
    const ability = HERO.abilities.r;
    if (this.simTime < this.hero.cooldowns.r || this.hero.mana < ability.mana || this.hero.level < ability.requiredLevel) {
      this.cancelAim();
      return;
    }
    const center = {
      x: Phaser.Math.Clamp(point.x, 155, GAME_WIDTH - 155),
      y: Phaser.Math.Clamp(point.y, 155, GAME_HEIGHT - 155),
    };
    this.hero.mana -= ability.mana;
    this.hero.cooldowns.r = this.simTime + ability.cooldown * 1000;
    this.castStorm(center);
    this.addStormCharge(28);
    this.cancelAim(false);
    emit('td:sound', 'spell');
    this.emitHud(true);
  }

  private chooseBuild(type: TowerType | null): void {
    if (type) this.cancelAim(false);
    this.buildType = type;
    this.selectedTower = null;
    this.placementMessage = type ? `Выбрано: ${TOWERS[type].name}` : '';
    this.drawSelection();
    this.drawBuildGrid(type);
    if (!type) this.preview.clear();
    this.emitHud(true);
  }

  private placementContext(point: Point, type: TowerType, gold = this.gold) {
    return {
      point, mapWidth: GAME_WIDTH, mapHeight: GAME_HEIGHT, edgePadding: 36, towerRadius: 24,
      gold, cost: TOWERS[type].cost, path: this.routePoints, pathHalfWidth: 34, crystal: this.map.crystal, crystalRadius: 52,
      forbidden: this.map.forbidden, towers: this.towers.map((tower) => ({ x: tower.x, y: tower.y, radius: 24 })),
    };
  }

  private gridPoint(point: Point): Point {
    return snapToGrid(
      point, BUILD_GRID_SIZE,
      BUILD_GRID_PADDING, BUILD_GRID_PADDING,
      GAME_WIDTH - BUILD_GRID_PADDING, GAME_HEIGHT - BUILD_GRID_PADDING,
    );
  }

  private drawBuildGrid(type: TowerType | null): void {
    const grid = this.buildGrid.clear();
    if (!type) return;
    const color = TOWERS[type].color;
    for (let y = BUILD_GRID_PADDING; y <= GAME_HEIGHT - BUILD_GRID_PADDING; y += BUILD_GRID_SIZE) {
      for (let x = BUILD_GRID_PADDING; x <= GAME_WIDTH - BUILD_GRID_PADDING; x += BUILD_GRID_SIZE) {
        const available = placementFailure(this.placementContext({ x, y }, type, Number.MAX_SAFE_INTEGER)) === null;
        if (available) {
          grid.fillStyle(color, 0.13).fillRect(x - 17, y - 17, 34, 34)
            .lineStyle(1, color, 0.28).strokeRect(x - 17, y - 17, 34, 34)
            .fillStyle(0xf6df9b, 0.6).fillCircle(x, y, 2.5);
        } else {
          grid.fillStyle(0x756b82, 0.1).fillCircle(x, y, 1.5);
        }
      }
    }
  }

  private drawPlacementPreview(pointer: Phaser.Input.Pointer): void {
    if (!this.buildType) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const point = this.gridPoint(world);
    const valid = placementFailure(this.placementContext(point, this.buildType)) === null;
    const definition = TOWERS[this.buildType];
    this.preview.clear().fillStyle(valid ? 0x52ff8a : 0xff526b, 0.18).fillCircle(point.x, point.y, definition.levels[0].range)
      .lineStyle(3, valid ? 0x74ff9f : 0xff6c7d, 0.95).strokeRect(point.x - 21, point.y - 21, 42, 42)
      .fillStyle(definition.color, 0.78).fillCircle(point.x, point.y, 17);
  }

  private placeTower(point: Point): void {
    if (!this.buildType || this.result !== 'playing') return;
    const snapped = this.gridPoint(point);
    const failure = placementFailure(this.placementContext(snapped, this.buildType));
    const messages: Record<string, string> = { outside: 'За пределами карты', path: 'Нельзя строить на маршруте', crystal: 'Кристалл должен быть свободен', forbidden: 'Запретная декоративная зона', occupied: 'Место уже занято', gold: 'Недостаточно золота' };
    if (failure) {
      this.placementMessage = messages[failure];
      emit('td:sound', 'hit');
      this.emitHud(true);
      return;
    }
    const definition = TOWERS[this.buildType];
    this.gold -= definition.cost;
    const art = this.add.graphics();
    const details = this.add.graphics();
    const frame = { archer: 0, frost: 1, siege: 2, boost: 3 }[this.buildType];
    const sprite = this.add.image(0, -13, 'tower-art', frame).setScale(0.105);
    const container = this.add.container(snapped.x, snapped.y, [art, sprite, details]).setDepth(15);
    container.setSize(52, 52).setInteractive(new Phaser.Geom.Circle(0, 0, 28), Phaser.Geom.Circle.Contains);
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.selectedTower = this.towers.find((tower) => tower.container === container) ?? null;
      this.buildType = null;
      this.buildGrid.clear();
      this.preview.clear();
      this.drawSelection();
      this.emitHud(true);
    });
    const tower: TowerUnit = {
      id: this.nextId++, type: this.buildType, x: snapped.x, y: snapped.y, level: 1, targetMode: 'first', nextAttackAt: 0,
      paidUpgrades: [], damageDealt: 0, kills: 0, container, art, sprite, details,
    };
    this.towers.push(tower);
    this.drawTower(tower);
    if (!this.reduceMotion) this.tweens.add({ targets: sprite, scaleX: 0.118, scaleY: 0.118, duration: 180, yoyo: true, ease: 'Back.out' });
    this.selectedTower = tower;
    this.buildType = null;
    this.buildGrid.clear();
    this.preview.clear();
    this.drawSelection();
    emit('td:sound', 'build');
    this.emitHud(true);
  }

  private drawTower(tower: TowerUnit): void {
    const definition = TOWERS[tower.type];
    const art = tower.art.clear();
    art.fillStyle(0x080912, 0.58).fillEllipse(4, 17, 62, 23);
    art.fillStyle(definition.color, 0.11 + tower.level * 0.025).fillCircle(0, -6, 30 + tower.level * 3);
    art.lineStyle(1.5 + tower.level * 0.5, definition.color, 0.52).strokeCircle(0, -6, 25 + tower.level * 2);
    if (tower.level >= 4) {
      art.lineStyle(1.5 + (tower.level - 3) * 0.5, 0xffe6a2, 0.6).strokeCircle(0, -6, 34 + tower.level * 2);
    }
    if (tower.level === MAX_TOWER_LEVEL) {
      for (let index = 0; index < 6; index += 1) {
        const angle = index / 6 * Math.PI * 2;
        const x = Math.cos(angle) * 47;
        const y = -6 + Math.sin(angle) * 38;
        art.fillStyle(index % 2 ? 0xfff3b5 : definition.color, 0.9).fillTriangle(x, y - 5, x - 4, y + 4, x + 4, y + 4);
      }
    }
    tower.sprite.setFrame({ archer: 0, frost: 1, siege: 2, boost: 3 }[tower.type]);
    tower.sprite.setPosition(0, -13).setAngle(0).setScale(0.098 + tower.level * 0.008)
      .setTint(tower.level === MAX_TOWER_LEVEL ? 0xffd36a : tower.level >= 4 ? 0xfff1c2 : 0xffffff);
    drawTowerDetails(tower.details, tower.type, tower.level, definition.color);
    for (let index = 0; index < tower.level; index += 1) {
      art.fillStyle(index >= 3 ? 0xff9f43 : 0xffdc72, 1).fillCircle((index - (tower.level - 1) / 2) * 8, 23, index >= 3 ? 3.5 : 3);
    }
  }

  private updateTowerVisuals(): void {
    for (const tower of this.towers) {
      if (this.reduceMotion) {
        tower.details.setRotation(0).setScale(1).setAlpha(1);
        continue;
      }
      const phase = this.simTime / 1000 + tower.id * 0.37;
      if (tower.type === 'frost') {
        tower.details.setRotation(phase * (0.22 + tower.level * 0.05)).setScale(1 + Math.sin(phase * 2) * 0.035).setAlpha(0.88 + Math.sin(phase * 2.4) * 0.1);
      } else if (tower.type === 'boost') {
        tower.details.setRotation(-phase * (0.18 + tower.level * 0.04)).setScale(1 + Math.sin(phase * 1.7) * 0.05).setAlpha(0.82 + Math.sin(phase * 2) * 0.14);
      } else {
        tower.details.setRotation(0).setScale(1).setAlpha(0.9 + Math.sin(phase * 1.9) * 0.08);
      }
    }
  }

  private selectTowerAt(point: Point): void {
    this.selectedTower = this.towers.find((tower) => distance(point, tower) <= 30) ?? null;
    this.drawSelection();
    this.emitHud(true);
  }

  private drawSelection(): void {
    this.selectionRing.clear();
    if (!this.selectedTower) return;
    const range = TOWERS[this.selectedTower.type].levels[this.selectedTower.level - 1].range;
    this.selectionRing.fillStyle(0xf5c665, 0.06).fillCircle(this.selectedTower.x, this.selectedTower.y, range)
      .lineStyle(2, 0xf5d878, 0.58).strokeCircle(this.selectedTower.x, this.selectedTower.y, range)
      .lineStyle(3, 0xffdf7d, 1).strokeCircle(this.selectedTower.x, this.selectedTower.y, 30);
  }

  private upgradeSelected(): void {
    const tower = this.selectedTower;
    if (!tower || tower.level >= MAX_TOWER_LEVEL) return;
    const cost = TOWERS[tower.type].levels[tower.level - 1].upgradeCost;
    if (cost === null || this.gold < cost) {
      this.placementMessage = 'Недостаточно золота для улучшения';
      return;
    }
    this.gold -= cost;
    tower.paidUpgrades.push(cost);
    tower.level += 1;
    this.drawTower(tower);
    this.drawSelection();
    emit('td:sound', 'build');
  }

  private sellSelected(): void {
    const tower = this.selectedTower;
    if (!tower) return;
    this.gold += sellValue(TOWERS[tower.type].cost, tower.paidUpgrades);
    tower.container.destroy(true);
    this.towers = this.towers.filter((candidate) => candidate !== tower);
    this.selectedTower = null;
    this.drawSelection();
    emit('td:sound', 'build');
  }

  private toggleTargetMode(): void {
    if (!this.selectedTower || this.selectedTower.type === 'boost') return;
    this.selectedTower.targetMode = this.selectedTower.targetMode === 'first' ? 'strongest' : 'first';
  }

  private startNextWave(early: boolean): void {
    if (!this.started || this.waveActive || this.result !== 'playing' || this.currentWave >= WAVES.length) return;
    if (early) this.gold += earlyStartBonus(this.countdown, EARLY_START_GOLD_PER_SECOND * DIFFICULTIES[this.difficulty].earlyStartGold * this.map.goldMultiplier);
    if (early) this.score += Math.floor(Math.max(0, this.countdown) * 25 * DIFFICULTIES[this.difficulty].scoreMultiplier * this.map.scoreMultiplier);
    this.currentWave += 1;
    this.waveActive = true;
    this.spawnQueue = [];
    this.spawnedThisWave = 0;
    let at = this.simTime + 150;
    const gapScale = TEST_MODE ? 0.08 : 1;
    for (const group of WAVES[this.currentWave - 1].spawns) {
      for (let count = 0; count < group.count; count += 1) {
        this.spawnQueue.push({ type: group.type, at });
        at += group.gapMs * gapScale;
      }
      at += (TEST_MODE ? 60 : 500);
    }
    this.countdown = 0;
    const bossWave = WAVES[this.currentWave - 1].spawns.some((spawn) => this.isBossType(spawn.type));
    emit('td:sound', bossWave ? 'boss' : 'wave');
    this.emitHud(true);
  }

  private updateWave(delta: number): void {
    if (!this.waveActive) {
      this.countdown -= delta / 1000;
      if (this.countdown <= 0 && this.currentWave < WAVES.length) this.startNextWave(false);
      return;
    }
    while (this.spawnQueue[0] && this.spawnQueue[0].at <= this.simTime) {
      const spawn = this.spawnQueue.shift()!;
      this.spawnEnemy(spawn.type, 0);
    }
    if (!this.spawnQueue.length && !this.enemies.some((enemy) => enemy.alive)) {
      this.waveActive = false;
      this.gold += Math.round(waveClearReward(WAVES[this.currentWave - 1].reward, DIFFICULTIES[this.difficulty]) * this.map.goldMultiplier);
      this.score += Math.round((350 + this.currentWave * 40) * DIFFICULTIES[this.difficulty].scoreMultiplier * this.map.scoreMultiplier);
      if (this.currentWave >= WAVES.length) this.finish('victory');
      else this.countdown = TEST_MODE ? 0.55 : INTERMISSION_SECONDS * DIFFICULTIES[this.difficulty].intermission;
    }
  }

  private spawnEnemy(type: EnemyType, progress: number, forcedElite: EliteType | null = null): EnemyUnit {
    const definition = this.enemyDefinition(type);
    this.spawnedThisWave += 1;
    const elite = forcedElite ?? eliteAffixForSpawn(this.currentWave, this.spawnedThisWave, this.difficulty, type);
    const eliteDefinition = elite ? ELITES[elite] : null;
    const position = this.pointAtProgress(progress);
    const art = this.add.graphics();
    const eliteArt = this.add.graphics();
    const frame = { raider: 0, runner: 1, brute: 2, winged: 3, warden: 4, titan: 5, boss: 6 }[type];
    const spriteScale = { raider: 0.15, runner: 0.145, brute: 0.17, winged: 0.17, warden: 0.205, titan: 0.23, boss: 0.225 }[type];
    const spriteBaseY = this.isBossType(type) ? -39 : type === 'winged' ? -34 : -29;
    const sprite = this.add.image(0, spriteBaseY, 'unit-motion-art', frame).setScale(spriteScale);
    const hpBar = this.add.graphics();
    const container = this.add.container(position.x, position.y, [art, eliteArt, sprite, hpBar]).setDepth(type === 'winged' ? 25 : 16);
    const maxHp = definition.maxHp * waveHpMultiplier(this.currentWave, DIFFICULTIES[this.difficulty].waveHpGrowth) * ENEMY_HP_SCALE
      * (eliteDefinition?.hpMultiplier ?? 1);
    const maxEliteShield = maxHp * (eliteDefinition?.shieldRatio ?? 0);
    const enemy: EnemyUnit = {
      id: this.nextId++, type, hp: maxHp, maxHp, progress, alive: true, slow: 0, slowUntil: 0, phase: 1,
      shieldUntil: 0, lastShieldAt: this.simTime, summonedPhase: false, contactCooldown: 0, container, art, sprite, hpBar,
      spriteBaseScale: spriteScale, spriteBaseY, motionSeed: this.nextId * 0.73,
      laneOffset: this.isBossType(type) ? 0 : ((this.nextId % 5) - 2) * (type === 'winged' ? 3.5 : 2.5), hitPulseUntil: 0,
      elite, eliteShield: maxEliteShield, maxEliteShield, nextElitePulseAt: this.simTime + 900, eliteArt,
    };
    container.setName(elite ? `enemy-elite-${elite}` : `enemy-${type}`);
    this.enemies.push(enemy);
    this.drawEnemy(enemy);
    if (elite) createElitePulse(this, position, elite, this.reduceMotion);
    if (!this.reduceMotion) {
      sprite.setAlpha(0).setScale(spriteScale * 0.55);
      this.tweens.add({ targets: sprite, alpha: 1, scaleX: spriteScale, scaleY: spriteScale, duration: 260, ease: 'Back.out' });
      const portal = this.map.path[0];
      const portalPulse = this.add.circle(portal.x, portal.y, 16, this.map.accent, 0.55).setDepth(14);
      this.tweens.add({ targets: portalPulse, scale: 2.8, alpha: 0, duration: 300, onComplete: () => portalPulse.destroy() });
    }
    return enemy;
  }

  private drawEnemy(enemy: EnemyUnit): void {
    const definition = this.enemyDefinition(enemy.type);
    const art = enemy.art.clear();
    art.fillStyle(0x070914, 0.62).fillEllipse(5, definition.radius * 0.85, definition.radius * 2.5, definition.radius);
    if (this.isBossType(enemy.type)) {
      art.fillStyle(definition.color, 0.15).fillCircle(0, -10, definition.radius + 18);
      art.lineStyle(5, enemy.shieldUntil > this.simTime ? 0xaeefff : definition.color, 0.94).strokeCircle(0, -10, definition.radius + 14);
    } else {
      art.fillStyle(definition.color, 0.1).fillCircle(0, -7, definition.radius + 8);
      art.lineStyle(2, definition.color, 0.46).strokeCircle(0, -7, definition.radius + 6);
      if (enemy.type === 'brute') art.lineStyle(5, 0xbbb0c6, 0.85).strokeCircle(0, 0, definition.radius + 3);
    }
    drawEliteAura(enemy.eliteArt, enemy.elite, definition.radius, enemy.maxEliteShield > 0 ? enemy.eliteShield / enemy.maxEliteShield : 0);
    enemy.sprite.setFrame({ raider: 0, runner: 1, brute: 2, winged: 3, warden: 4, titan: 5, boss: 6 }[enemy.type]);
    enemy.sprite.setTint(this.enemyTint(enemy));
    this.drawEnemyHealth(enemy);
  }

  private enemyTint(enemy: EnemyUnit): number {
    if (enemy.slowUntil > this.simTime) return 0xb9f4ff;
    if (enemy.elite === 'regenerator') return 0xd8ffe2;
    if (enemy.elite === 'swift') return 0xffdcf8;
    if (enemy.type === 'warden') return 0xd79cff;
    if (enemy.type === 'titan') return 0xffa070;
    return 0xffffff;
  }

  private drawEnemyHealth(enemy: EnemyUnit): void {
    const definition = this.enemyDefinition(enemy.type);
    const width = this.isBossType(enemy.type) ? 76 : enemy.elite ? 42 : 34;
    const y = -definition.radius - (enemy.maxEliteShield > 0 ? 18 : 14);
    enemy.hpBar.clear().fillStyle(0x120e18, 0.9).fillRect(-width / 2, y, width, 5)
      .fillStyle(enemy.hp / enemy.maxHp > 0.35 ? 0x6ee07a : 0xff5d72, 1).fillRect(-width / 2, y, width * Math.max(0, enemy.hp / enemy.maxHp), 5);
    if (enemy.maxEliteShield > 0) {
      enemy.hpBar.fillStyle(0x101c2a, 0.92).fillRect(-width / 2, y + 6, width, 3)
        .fillStyle(0x76ebff, 0.96).fillRect(-width / 2, y + 6, width * Math.max(0, enemy.eliteShield / enemy.maxEliteShield), 3);
    }
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const definition = this.enemyDefinition(enemy.type);
      if (this.isBossType(enemy.type)) {
        const shieldInterval = enemy.type === 'warden' ? 10500 : enemy.type === 'titan' ? 8500 : 7000;
        if (this.simTime - enemy.lastShieldAt >= (TEST_MODE ? 2500 : shieldInterval)) {
          enemy.lastShieldAt = this.simTime;
          enemy.shieldUntil = this.simTime + (TEST_MODE ? 450 : 3000) * DIFFICULTIES[this.difficulty].bossShield;
          this.drawEnemy(enemy);
        }
        if (enemy.hp <= enemy.maxHp * 0.5 && enemy.phase === 1) {
          enemy.phase = 2;
          this.cameraFlash(0xff3f9a);
          if (this.screenShake && !this.reduceMotion) this.cameras.main.shake(380, 0.008);
          if (!enemy.summonedPhase) {
            enemy.summonedPhase = true;
            const summonType: EnemyType = enemy.type === 'warden' ? 'runner' : enemy.type === 'titan' ? 'raider' : 'winged';
            const summonCount = enemy.type === 'warden' ? 5 : enemy.type === 'titan' ? 7 : 9;
            for (let index = 0; index < summonCount; index += 1) this.spawnEnemy(summonType, Math.max(0, enemy.progress - index * 22));
          }
        }
      }
      const eliteDefinition = enemy.elite ? ELITES[enemy.elite] : null;
      if (eliteDefinition?.regeneration && enemy.hp < enemy.maxHp) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * eliteDefinition.regeneration * delta / 1000);
        if (this.simTime >= enemy.nextElitePulseAt) {
          enemy.nextElitePulseAt = this.simTime + 1400;
          this.drawEnemyHealth(enemy);
          createElitePulse(this, enemy.container, enemy.elite!, this.reduceMotion, false);
        }
      }
      const slow = enemy.slowUntil > this.simTime ? enemy.slow : 0;
      const phaseMultiplier = this.isBossType(enemy.type) && enemy.phase === 2 ? 1.28 : 1;
      enemy.progress += applySlow(definition.speed * waveSpeedMultiplier(this.currentWave, DIFFICULTIES[this.difficulty].waveSpeedGrowth) * ENEMY_SPEED_SCALE
        * phaseMultiplier * (eliteDefinition?.speedMultiplier ?? 1), slow)
        * this.routeProgressScale * delta / 1000;
      const point = this.pointAtProgress(enemy.progress);
      const behind = this.pointAtProgress(Math.max(0, enemy.progress - 12));
      const ahead = this.pointAtProgress(Math.min(this.routeTotal, enemy.progress + 12));
      const heading = Phaser.Math.Angle.Between(behind.x, behind.y, ahead.x, ahead.y);
      const pose = enemyMotionPose(enemy.type, this.simTime, enemy.motionSeed, heading, slow > 0, this.reduceMotion);
      const laneX = -Math.sin(heading) * enemy.laneOffset;
      const laneY = Math.cos(heading) * enemy.laneOffset;
      enemy.container.setPosition(point.x + laneX, point.y + laneY + (definition.flying ? -13 : 0));
      const hitPulse = enemy.hitPulseUntil > this.simTime ? 1.08 : 1;
      enemy.sprite.setPosition(0, enemy.spriteBaseY + pose.bob).setRotation(pose.rotation)
        .setScale(enemy.spriteBaseScale * pose.scaleX * hitPulse, enemy.spriteBaseScale * pose.scaleY * hitPulse);
      enemy.art.setScale(pose.shadowScale, 1).setAlpha(pose.shadowAlpha / 0.62);
      if (enemy.elite) {
        const direction = enemy.elite === 'swift' ? -1 : 1;
        enemy.eliteArt.setRotation(direction * this.simTime * 0.00045)
          .setAlpha(0.72 + Math.sin(this.simTime * 0.006 + enemy.motionSeed) * 0.18);
      }
      if (this.hero.alive && !definition.flying && distance(enemy.container, this.hero) < definition.radius + 24 && this.simTime >= enemy.contactCooldown) {
        enemy.contactCooldown = this.simTime + 700;
        const shieldMultiplier = this.hero.sealUntil > this.simTime ? 0.4 : 1;
        const bossContactDamage = enemy.type === 'warden' ? 30 : enemy.type === 'titan' ? 46 : enemy.type === 'boss' ? 64 : 13;
        this.hero.hp -= bossContactDamage * shieldMultiplier * DIFFICULTIES[this.difficulty].heroDamageTaken;
        this.drawHeroArt();
        if (this.hero.hp <= 0) this.killHero();
      }
      if (enemy.progress >= this.routeTotal) this.enemyReachedCrystal(enemy);
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  private enemyReachedCrystal(enemy: EnemyUnit): void {
    this.lives = enemy.type === 'boss' ? 0 : loseLives(this.lives, this.enemyDefinition(enemy.type).crystalDamage);
    this.destroyEnemy(enemy, false);
    this.cameraFlash(0xff486c);
    if (this.lives <= 0) this.finish('defeat');
  }

  private destroyEnemy(enemy: EnemyUnit, rewarded: boolean): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    if (rewarded) {
      const reward = Math.round(this.enemyDefinition(enemy.type).reward * (enemy.elite ? ELITES[enemy.elite].rewardMultiplier : 1));
      this.gold += reward;
      this.score += Math.round(reward * 10 * DIFFICULTIES[this.difficulty].scoreMultiplier * this.map.scoreMultiplier);
      this.hero.xp += this.isBossType(enemy.type) ? 240 : enemy.elite ? 30 : 18;
      this.updateHeroLevel();
    }
    if (enemy.elite) createElitePulse(this, enemy.container, enemy.elite, this.reduceMotion, false);
    if (!this.reduceMotion) {
      const ghost = this.add.image(enemy.container.x, enemy.container.y + enemy.spriteBaseY, 'unit-motion-art', enemy.sprite.frame.name)
        .setScale(Math.abs(enemy.sprite.scaleX), enemy.sprite.scaleY).setRotation(enemy.sprite.rotation).setTint(0xd9a4ff).setDepth(28);
      this.tweens.add({
        targets: ghost, y: ghost.y - 28, angle: Phaser.Math.Between(-10, 10), alpha: 0,
        scaleX: Math.abs(enemy.sprite.scaleX) * 1.16, scaleY: enemy.sprite.scaleY * 0.82,
        duration: 380, ease: 'Cubic.out', onComplete: () => ghost.destroy(),
      });
      const collapse = this.add.graphics().setPosition(enemy.container.x, enemy.container.y).setDepth(27);
      for (let index = 0; index < 7; index += 1) {
        const angle = index / 7 * Math.PI * 2;
        collapse.fillStyle(index % 2 ? 0xc365ff : 0x5d2b86, 0.82).fillTriangle(
          Math.cos(angle) * 8, Math.sin(angle) * 5,
          Math.cos(angle) * 16 - 3, Math.sin(angle) * 11 + 4,
          Math.cos(angle) * 16 + 3, Math.sin(angle) * 11 - 4,
        );
      }
      this.tweens.add({ targets: collapse, scale: 1.8, angle: 28, alpha: 0, duration: 340, onComplete: () => collapse.destroy() });
    }
    enemy.container.destroy(true);
    emit('td:sound', 'death');
  }

  private pointAtProgress(progress: number): Point {
    const path = this.routePoints;
    let left = Math.max(0, progress);
    for (let index = 0; index < this.routeLengths.length; index += 1) {
      const length = this.routeLengths[index];
      if (left <= length) {
        const ratio = left / length;
        return { x: Phaser.Math.Linear(path[index].x, path[index + 1].x, ratio), y: Phaser.Math.Linear(path[index].y, path[index + 1].y, ratio) };
      }
      left -= length;
    }
    return { ...path[path.length - 1] };
  }

  private boostAt(tower: TowerUnit): { damage: number; speed: number } {
    let damage = 1;
    let speed = 1;
    for (const support of this.towers) {
      if (support.type !== 'boost') continue;
      const aura = TOWERS.boost.levels[support.level - 1];
      if (distance(tower, support) > aura.range) continue;
      damage = Math.max(damage, aura.damageBoost ?? 1);
      speed = Math.max(speed, aura.attackSpeedBoost ?? 1);
    }
    return { damage, speed };
  }

  private updateTowers(): void {
    for (const tower of this.towers) {
      if (tower.type === 'boost' || this.simTime < tower.nextAttackAt) continue;
      const definition = TOWERS[tower.type];
      const level = definition.levels[tower.level - 1];
      const inRange = this.enemies.filter((enemy) => enemy.alive && distance(tower, enemy.container) <= level.range);
      const targetSnapshot = selectTarget(inRange.map((enemy) => ({ id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp, progress: enemy.progress, flying: this.enemyDefinition(enemy.type).flying, alive: enemy.alive })), tower.targetMode, definition.canTargetAir);
      const target = inRange.find((enemy) => enemy.id === targetSnapshot?.id);
      if (!target) continue;
      const aura = this.boostAt(tower);
      const sealed = this.hero.sealUntil > this.simTime && distance(tower, this.hero) <= 240;
      const multiplier = aura.damage * (sealed ? 1.35 : 1) * (TEST_MODE ? 3 : 1);
      const kind = tower.type as OffensiveTowerType;
      this.fireProjectile(
        tower, target, level.damage * multiplier, level.splash ?? definition.splash, level.slow ?? definition.slow,
        level.armorPierce ?? 0, kind, tower.level, level.projectileScale, level.projectileCount,
      );
      animateTowerFire(this, tower.sprite, kind, tower.level, this.reduceMotion);
      emit('td:sound', kind === 'archer' ? 'arrow' : kind === 'frost' ? 'frost' : 'cannon');
      tower.nextAttackAt = this.simTime + level.attackMs / aura.speed;
    }
  }

  private fireProjectile(
    tower: TowerUnit,
    target: EnemyUnit,
    damage: number,
    splash: number,
    slow: number,
    armorPierce: number,
    kind: OffensiveTowerType,
    level: number,
    scale: number,
    count: number,
  ): void {
    const angle = Phaser.Math.Angle.Between(tower.x, tower.y - 12, target.container.x, target.container.y);
    const view = createProjectileVisual(this, kind, level, scale, count, tower.x, tower.y - 12);
    view.setRotation(angle);
    this.projectiles.push({
      view, target, source: tower, damage,
      speed: kind === 'siege' ? 360 : 620,
      splash, slow, armorPierce, kind, level,
    });
  }

  private updateProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile.target.alive) {
        projectile.view.destroy(true);
        this.projectiles.splice(index, 1);
        continue;
      }
      const target = { x: projectile.target.container.x, y: projectile.target.container.y };
      const remaining = distance(projectile.view, target);
      const travel = projectile.speed * delta / 1000;
      if (remaining <= travel + 4) {
        this.impactProjectile(projectile);
        projectile.view.destroy(true);
        this.projectiles.splice(index, 1);
      } else {
        const angle = Phaser.Math.Angle.Between(projectile.view.x, projectile.view.y, target.x, target.y);
        projectile.view.x += Math.cos(angle) * travel;
        projectile.view.y += Math.sin(angle) * travel;
        projectile.view.setRotation(angle);
        if (projectile.kind === 'frost') projectile.view.angle += delta * 0.16;
      }
    }
  }

  private impactProjectile(projectile: Projectile): void {
    const center = { x: projectile.target.container.x, y: projectile.target.container.y };
    const targets = projectile.splash > 0
      ? this.enemies.filter((enemy) => enemy.alive && distance(enemy.container, center) <= projectile.splash)
      : [projectile.target];
    targets.forEach((enemy) => {
      const outcome = this.hitEnemy(enemy, projectile.damage, projectile.kind === 'frost', projectile.armorPierce);
      projectile.source.damageDealt += outcome.dealt;
      if (outcome.killed) projectile.source.kills += 1;
      if (projectile.slow > 0) {
        enemy.slow = Math.max(enemy.slow, projectile.slow);
        enemy.slowUntil = this.simTime + 2200;
      }
    });
    createProjectileImpact(this, projectile.kind, projectile.level, center.x, center.y, this.reduceMotion);
    if (!this.reduceMotion && projectile.kind === 'siege' && this.screenShake) this.cameras.main.shake(75 + projectile.level * 25, 0.0015 + projectile.level * 0.00065);
    emit('td:sound', 'hit');
  }

  private hitEnemy(enemy: EnemyUnit, rawDamage: number, magic: boolean, armorPierce = 0): { dealt: number; hp: number; killed: boolean } {
    if (!enemy.alive) return { dealt: 0, hp: Math.max(0, enemy.hp), killed: false };
    const eliteArmor = enemy.elite ? ELITES[enemy.elite].armorBonus : 0;
    const armor = (this.enemyDefinition(enemy.type).armor + eliteArmor) * (magic ? 0.2 : 1 - Math.max(0, Math.min(1, armorPierce)));
    const bossShieldMultiplier = this.isBossType(enemy.type) && enemy.shieldUntil > this.simTime ? 0.3 : 1;
    const mitigatedDamage = applyArmor(rawDamage, armor) * bossShieldMultiplier;
    const hadEliteShield = enemy.eliteShield > 0;
    const shieldOutcome = absorbShield(mitigatedDamage, enemy.eliteShield);
    enemy.eliteShield = shieldOutcome.shield;
    const hpOutcome = damageOutcome(enemy.hp, shieldOutcome.remainingDamage, 0);
    enemy.hp = hpOutcome.hp;
    const outcome = { dealt: shieldOutcome.absorbed + hpOutcome.dealt, hp: hpOutcome.hp, killed: hpOutcome.killed };
    enemy.hitPulseUntil = this.simTime + (this.reduceMotion ? 45 : 115);
    this.drawEnemyHealth(enemy);
    if (hadEliteShield && enemy.eliteShield <= 0) {
      drawEliteAura(enemy.eliteArt, enemy.elite, this.enemyDefinition(enemy.type).radius, 0);
      createShieldBreakEffect(this, enemy.container, this.reduceMotion);
      emit('td:sound', 'spell');
    }
    if (outcome.dealt > 0) {
      enemy.sprite.setTint(shieldOutcome.absorbed > 0 ? 0xa8f6ff : magic ? 0xd8fbff : 0xffe8b0);
      this.time.delayedCall(this.reduceMotion ? 35 : 85, () => {
        if (enemy.alive && enemy.sprite.active) enemy.sprite.setTint(this.enemyTint(enemy));
      });
    }
    if (outcome.killed) this.destroyEnemy(enemy, true);
    return outcome;
  }

  private updateHero(delta: number): void {
    if (!this.hero.alive) {
      if (this.simTime >= this.hero.respawnAt) this.respawnHero();
      return;
    }
    const difficulty = DIFFICULTIES[this.difficulty];
    const overcharged = this.hero.overchargeUntil > this.simTime;
    if (!overcharged && this.heroOverchargeView) {
      this.heroOverchargeView.destroy(true);
      this.heroOverchargeView = null;
    }
    if (this.heroOverchargeView?.active) this.heroOverchargeView.setPosition(this.hero.x, this.hero.y).setVisible(true);
    this.hero.mana = Math.min(HERO.maxMana, this.hero.mana + HERO.manaRegen * difficulty.heroManaRegen * (overcharged ? HERO_OVERCHARGE.manaRegenMultiplier : 1) * delta / 1000);
    const horizontal = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
    const vertical = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
    let focus = this.focusedEnemy();
    if (!focus && this.hero.stance === 'pursuit' && !this.hero.moveCommand) {
      focus = this.enemies.filter((enemy) => enemy.alive && distance(this.hero, enemy.container) <= HERO.pursuitRange)
        .sort((a, b) => b.progress - a.progress)[0] ?? null;
      if (focus) this.hero.focusTargetId = focus.id;
    }
    if (focus) this.drawHeroFocusMarker(focus);
    if (horizontal !== 0 || vertical !== 0) {
      const length = Math.hypot(horizontal, vertical);
      const travel = HERO.speed * difficulty.heroSpeed * (TEST_MODE ? 2 : 1) * delta / 1000;
      this.hero.x = Phaser.Math.Clamp(this.hero.x + horizontal / length * travel, 20, GAME_WIDTH - 20);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + vertical / length * travel, 20, GAME_HEIGHT - 20);
      this.hero.target = { x: this.hero.x, y: this.hero.y };
      this.hero.moveCommand = false;
      this.heroTargetMarker.clear();
      this.hero.sprite.setFlipX(horizontal < 0);
      this.hero.container.setPosition(this.hero.x, this.hero.y);
    } else {
      if (this.hero.stance === 'pursuit' && focus) {
        const focusDistance = distance(this.hero, focus.container);
        this.hero.target = focusDistance > HERO.attackRange * 0.82
          ? { x: focus.container.x, y: focus.container.y }
          : { x: this.hero.x, y: this.hero.y };
      }
      const moveDistance = distance(this.hero, this.hero.target);
      if (moveDistance > 3) {
        const travel = Math.min(moveDistance, HERO.speed * difficulty.heroSpeed * (TEST_MODE ? 2 : 1) * delta / 1000);
        const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, this.hero.target.x, this.hero.target.y);
        this.hero.x += Math.cos(angle) * travel;
        this.hero.y += Math.sin(angle) * travel;
        this.hero.sprite.setFlipX(Math.cos(angle) < 0);
        this.hero.container.setPosition(this.hero.x, this.hero.y);
      } else {
        this.heroTargetMarker.clear();
        this.hero.moveCommand = false;
      }
    }
    if (this.simTime >= this.hero.nextAttackAt) {
      const inRange = this.enemies.filter((enemy) => enemy.alive && distance(this.hero, enemy.container) <= HERO.attackRange);
      const target = (focus && inRange.includes(focus) ? focus : null) ?? inRange.sort((a, b) => b.progress - a.progress)[0];
      if (target) {
        this.hero.nextAttackAt = this.simTime + HERO.attackMs / (overcharged ? HERO_OVERCHARGE.attackSpeedMultiplier : 1);
        const targetPoint = { x: target.container.x, y: target.container.y - 8 };
        this.visualEvents.attack += 1;
        animateHeroAttack(this, this.hero.sprite, targetPoint, this.reduceMotion);
        launchStormSpear(this, { x: this.hero.x, y: this.hero.y - 38 }, targetPoint, this.reduceMotion);
        this.hitEnemy(target, HERO.attackDamage * difficulty.heroDamage * (overcharged ? HERO_OVERCHARGE.damageMultiplier : 1) * (TEST_MODE ? 2.5 : 1), true);
        this.addStormCharge(5);
        emit('td:sound', 'shot');
      }
    }
    if (this.heroSealView?.active) this.heroSealView.setPosition(this.hero.x, this.hero.y).setVisible(true);
    if (this.heroOverchargeView?.active) this.heroOverchargeView.setPosition(this.hero.x, this.hero.y).setVisible(true);
    this.drawHeroArt();
    this.drawHeroCommand(focus);
  }

  private killHero(): void {
    this.hero.alive = false;
    this.hero.hp = 0;
    this.hero.respawnAt = this.simTime + HERO.respawnSeconds * 1000 * DIFFICULTIES[this.difficulty].heroRespawn;
    this.hero.container.setVisible(false);
    this.heroSealView?.destroy(true);
    this.heroSealView = null;
    this.heroOverchargeView?.destroy(true);
    this.heroOverchargeView = null;
    this.hero.overchargeUntil = 0;
    this.heroTargetMarker.clear();
    this.heroFocusMarker.clear();
    this.heroCommandPath.clear();
    this.cancelAim(false);
    emit('td:sound', 'death');
  }

  private respawnHero(): void {
    this.hero.alive = true;
    this.hero.hp = HERO.maxHp;
    this.hero.mana = HERO.maxMana * 0.6;
    this.hero.x = this.map.crystal.x - 70;
    this.hero.y = this.map.crystal.y + 80;
    this.hero.target = { x: this.hero.x, y: this.hero.y };
    this.hero.moveCommand = false;
    this.hero.container.setPosition(this.hero.x, this.hero.y).setVisible(true);
    this.drawHeroArt();
    const focus = this.focusedEnemy();
    if (focus) this.drawHeroFocusMarker(focus);
  }

  private updateHeroLevel(): void {
    const previous = this.hero.level;
    this.hero.level = this.hero.xp >= 240 ? 3 : this.hero.xp >= 100 ? 2 : 1;
    if (this.hero.level > previous) {
      this.hero.hp = HERO.maxHp;
      this.hero.mana = HERO.maxMana;
      const glow = this.add.circle(this.hero.x, this.hero.y, 25, 0xffe070, 0.55).setDepth(30);
      this.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: 550, onComplete: () => glow.destroy() });
    }
  }

  private heroDamageMultiplier(): number {
    return DIFFICULTIES[this.difficulty].heroDamage * (this.hero.overchargeUntil > this.simTime ? HERO_OVERCHARGE.damageMultiplier : 1);
  }

  private addStormCharge(amount: number): void {
    if (!this.hero.alive || this.hero.overchargeUntil > this.simTime || amount <= 0) return;
    this.hero.stormCharge = Math.min(100, this.hero.stormCharge + amount);
    if (this.hero.stormCharge < 100) return;
    this.hero.stormCharge = 0;
    this.hero.overchargeUntil = this.simTime + HERO_OVERCHARGE.durationMs;
    this.visualEvents.overcharge += 1;
    this.heroOverchargeView?.destroy(true);
    this.heroOverchargeView = createHeroOverchargeAura(this, { x: this.hero.x, y: this.hero.y }, this.reduceMotion);
    this.cameraFlash(0x82efff);
    if (this.screenShake && !this.reduceMotion) this.cameras.main.shake(220, 0.004);
    emit('td:sound', 'spell');
    this.emitHud(true);
  }

  private useAbility(key: 'q' | 'w' | 'e' | 'r'): void {
    if (!this.started || this.paused || !this.hero.alive || this.result !== 'playing') return;
    const ability = HERO.abilities[key];
    if (this.simTime < this.hero.cooldowns[key] || this.hero.mana < ability.mana || (key === 'r' && this.hero.level < HERO.abilities.r.requiredLevel)) return;
    if (key === 'r') {
      this.aimAbility = this.aimAbility === 'r' ? null : 'r';
      if (this.aimAbility) {
        this.chooseBuild(null);
        this.drawAbilityPreview(this.input.activePointer);
      } else this.abilityPreview.clear();
      this.emitHud(true);
      return;
    }
    this.hero.mana -= ability.mana;
    this.hero.cooldowns[key] = this.simTime + ability.cooldown * 1000;
    if (key === 'q') this.castChainLightning();
    if (key === 'w') this.castDash();
    if (key === 'e') this.castSeal();
    this.addStormCharge(key === 'q' ? 18 : key === 'w' ? 14 : 12);
    emit('td:sound', 'spell');
    this.emitHud(true);
  }

  private castChainLightning(): void {
    this.visualEvents.q += 1;
    createThunderBurst(this, { x: this.hero.x, y: this.hero.y - 24 }, this.reduceMotion, 0.72);
    const candidates = this.enemies.map((enemy) => ({ id: enemy.id, x: enemy.container.x, y: enemy.container.y, hp: enemy.hp, maxHp: enemy.maxHp, progress: enemy.progress, flying: this.enemyDefinition(enemy.type).flying, alive: enemy.alive }));
    const focus = this.focusedEnemy();
    const focusedFirst = focus && distance(this.hero, focus.container) <= 285 ? focus : null;
    const ids = focusedFirst
      ? [focusedFirst.id, ...chainTargets(focusedFirst.container, candidates.filter((candidate) => candidate.id !== focusedFirst.id), 4 + this.hero.level, 235)]
      : chainTargets(this.hero, candidates, 5 + this.hero.level, 235);
    let from: Point = { x: this.hero.x, y: this.hero.y };
    ids.forEach((id, index) => {
      const enemy = this.enemies.find((candidate) => candidate.id === id);
      if (!enemy) return;
      const boltFrom = { ...from };
      const boltTo = { x: enemy.container.x, y: enemy.container.y - 8 };
      this.time.delayedCall(index * (this.reduceMotion ? 18 : 55), () => {
        createLightningBolt(this, boltFrom, boltTo, this.reduceMotion, Math.max(0.58, 1.12 - index * 0.08));
        createThunderBurst(this, boltTo, this.reduceMotion, Math.max(0.52, 0.85 - index * 0.04));
      });
      this.hitEnemy(enemy, HERO.abilities.q.damage * this.heroDamageMultiplier() * (1 - index * 0.08), true);
      from = boltTo;
    });
  }

  private castDash(): void {
    this.visualEvents.w += 1;
    const horizontal = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
    const vertical = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
    const focus = this.focusedEnemy();
    const pointer = this.input.activePointer;
    const pointerWorld = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const from = { x: this.hero.x, y: this.hero.y };
    const desired = dashDestination(from, { x: horizontal, y: vertical }, focus ? { x: focus.container.x, y: focus.container.y } : null, pointerWorld, 270);
    const to = { x: Phaser.Math.Clamp(desired.x, 20, GAME_WIDTH - 20), y: Phaser.Math.Clamp(desired.y, 20, GAME_HEIGHT - 20) };
    this.enemies.filter((enemy) => enemy.alive && pointToLineDistance(enemy.container, from, to) <= 58)
      .forEach((enemy) => this.hitEnemy(enemy, HERO.abilities.w.damage * this.heroDamageMultiplier(), true));
    this.hero.x = to.x;
    this.hero.y = to.y;
    this.hero.target = to;
    this.hero.moveCommand = false;
    this.hero.container.setPosition(to.x, to.y);
    createDashStorm(this, from, to, this.reduceMotion);
  }

  private castSeal(): void {
    this.visualEvents.e += 1;
    this.hero.sealUntil = this.simTime + HERO.abilities.e.duration * 1000;
    this.heroSealView?.destroy(true);
    const seal = createStormShield(this, { x: this.hero.x, y: this.hero.y }, this.reduceMotion);
    this.heroSealView = seal;
    this.time.delayedCall(HERO.abilities.e.duration * 1000, () => {
      if (this.heroSealView === seal) this.heroSealView = null;
      if (seal.active) seal.destroy(true);
    });
  }

  private castStorm(center: Point): void {
    this.visualEvents.r += 1;
    const view = createStormField(this, center, this.reduceMotion);
    this.storms.push({ x: center.x, y: center.y, endsAt: this.simTime + HERO.abilities.r.duration * 1000, nextTick: this.simTime, view });
  }

  private updateStorms(): void {
    for (let index = this.storms.length - 1; index >= 0; index -= 1) {
      const storm = this.storms[index];
      if (this.simTime >= storm.endsAt) {
        storm.view.destroy();
        this.storms.splice(index, 1);
      } else if (this.simTime >= storm.nextTick) {
        storm.nextTick = this.simTime + 500;
        const impacted = this.enemies.filter((enemy) => enemy.alive && distance(enemy.container, storm) <= 155);
        const targets = impacted.map((enemy) => ({ x: enemy.container.x, y: enemy.container.y - 7 }));
        impacted.forEach((enemy) => this.hitEnemy(enemy, HERO.abilities.r.damage * this.heroDamageMultiplier(), true));
        const strike = targets.length
          ? targets[Phaser.Math.Between(0, targets.length - 1)]
          : { x: storm.x + Phaser.Math.Between(-105, 105), y: storm.y + Phaser.Math.Between(-95, 95) };
        createLightningBolt(this, { x: strike.x + Phaser.Math.Between(-18, 18), y: Math.max(5, strike.y - 210) }, strike, this.reduceMotion, 1.28);
        createThunderBurst(this, strike, this.reduceMotion, 1.05);
      }
    }
  }

  private updateCamera(delta: number): void {
    if (!this.keys) return;
    const camera = this.cameras.main;
    const move = 0.55 * delta / camera.zoom;
    if (this.keys.LEFT.isDown) camera.scrollX -= move;
    if (this.keys.RIGHT.isDown) camera.scrollX += move;
    if (this.keys.UP.isDown) camera.scrollY -= move;
    if (this.keys.DOWN.isDown) camera.scrollY += move;
    camera.zoom = Phaser.Math.Linear(camera.zoom, this.cameraTargetZoom, Math.min(1, delta * 0.012));
    if (Math.abs(camera.zoom - this.cameraTargetZoom) < 0.001) camera.zoom = this.cameraTargetZoom;
  }

  private setCameraZoom(direction: 'in' | 'out' | 'reset'): void {
    if (direction === 'reset') {
      this.cameraTargetZoom = 1.08;
      this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    } else {
      this.cameraTargetZoom = Phaser.Math.Clamp(this.cameraTargetZoom + (direction === 'in' ? 0.16 : -0.16), 1, 1.72);
    }
    this.emitHud(true);
  }

  private togglePause(): void {
    if (!this.started || this.result !== 'playing') return;
    this.paused = !this.paused;
    this.emitHud(true);
  }

  private cameraFlash(color: number): void {
    if (!this.reduceMotion) this.cameras.main.flash(220, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
  }

  private finish(result: 'victory' | 'defeat'): void {
    if (this.result !== 'playing') return;
    this.result = result;
    this.paused = false;
    this.heroSealView?.destroy(true);
    this.heroSealView = null;
    this.heroOverchargeView?.destroy(true);
    this.heroOverchargeView = null;
    this.storms.forEach((storm) => storm.view.destroy(true));
    this.storms = [];
    const previous = Number(localStorage.getItem('rift-best-wave') ?? 0);
    localStorage.setItem('rift-best-wave', String(Math.max(previous, this.currentWave)));
    const bestScore = Number(localStorage.getItem('rift-best-score') ?? 0);
    localStorage.setItem('rift-best-score', String(Math.max(bestScore, this.score)));
    if (result === 'victory') localStorage.setItem(`rift-map-${this.map.id}-won`, 'yes');
    emit('td:sound', result);
    this.emitHud(true);
  }

  private skipToBoss(tier: 1 | 2 | 3 = 3): void {
    if (!TEST_MODE) return;
    this.spawnQueue = [];
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy, false));
    this.enemies = [];
    const bossWave = [7, 14, 20][tier - 1];
    this.currentWave = bossWave - 1;
    this.waveActive = false;
    this.countdown = 0;
    this.startNextWave(false);
  }

  private enemyDefinition(type: EnemyType) {
    const enemy = scaleEnemy(ENEMIES[type], DIFFICULTIES[this.difficulty], Math.max(1, this.currentWave));
    return {
      ...enemy,
      maxHp: Math.round(enemy.maxHp * this.map.enemyHp),
      armor: enemy.armor * this.map.enemyArmor,
      speed: enemy.speed * this.map.enemySpeed,
      reward: Math.max(1, Math.round(enemy.reward * this.map.goldMultiplier)),
    };
  }

  private isBossType(type: EnemyType): boolean {
    return type === 'warden' || type === 'titan' || type === 'boss';
  }

  private spawnStress(count: number): void {
    if (!TEST_MODE) return;
    this.started = true;
    this.waveActive = true;
    this.currentWave = Math.max(1, this.currentWave);
    this.countdown = 0;
    this.spawnQueue = [];
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy, false));
    this.enemies = [];
    for (let index = 0; index < Math.min(160, Math.max(0, count)); index += 1) {
      const types: EnemyType[] = ['raider', 'runner', 'brute', 'winged'];
      this.spawnEnemy(types[index % types.length], (index % 20) * 12);
    }
  }

  private spawnEliteForTest(elite: EliteType): void {
    if (!TEST_MODE) return;
    this.started = true;
    this.waveActive = true;
    this.countdown = 0;
    this.spawnQueue = [];
    this.currentWave = Math.max(10, this.currentWave);
    const stagger = (this.spawnedThisWave % 6) * 70;
    this.spawnEnemy('brute', Math.max(0, this.routeTotal - 260 - stagger), elite);
  }

  private getPerformanceMetrics() {
    const averageFrameMs = this.frameSamples.length
      ? this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length
      : 0;
    const groundEnemies = this.enemies.filter((enemy) => enemy.alive && !this.enemyDefinition(enemy.type).flying);
    return {
      activeEnemies: this.enemies.filter((enemy) => enemy.alive).length,
      eliteEnemies: this.enemies.filter((enemy) => enemy.alive && enemy.elite).length,
      gameObjects: this.children.list.length,
      averageFrameMs: Number(averageFrameMs.toFixed(2)),
      fps: averageFrameMs > 0 ? Number((1000 / averageFrameMs).toFixed(1)) : 0,
      maxGroundRoadDeviation: Number(Math.max(0, ...groundEnemies.map((enemy) => distanceToPath(enemy.container, this.routePoints))).toFixed(2)),
    };
  }

  private getHudState(): HudState {
    const selected = this.selectedTower;
    const definition = selected ? TOWERS[selected.type] : null;
    const selectedLevel = selected && definition ? definition.levels[selected.level - 1] : null;
    const selectedAura = selected && selected.type !== 'boost' ? this.boostAt(selected) : { damage: 1, speed: 1 };
    const selectedBoosted = selectedAura.damage > 1 || selectedAura.speed > 1;
    const auraTargets = selected && selected.type === 'boost' && selectedLevel
      ? this.towers.filter((tower) => tower.type !== 'boost' && distance(selected, tower) <= selectedLevel.range).length
      : 0;
    const nextXp = this.hero.level === 1 ? 100 : this.hero.level === 2 ? 240 : 240;
    const boss = this.enemies.find((enemy) => this.isBossType(enemy.type) && enemy.alive);
    const heroFocus = this.focusedEnemy();
    const heroCommand: HeroCommand = this.aimAbility ? 'aim'
      : this.hero.moveCommand ? 'move'
        : heroFocus ? (this.hero.stance === 'pursuit' ? 'pursuit' : 'focus') : 'hold';
    const abilityState = (key: 'q' | 'w' | 'e' | 'r') => ({
      cooldown: Math.max(0, (this.hero.cooldowns[key] - this.simTime) / 1000),
      mana: HERO.abilities[key].mana,
      locked: key === 'r' && this.hero.level < HERO.abilities.r.requiredLevel,
    });
    const upcomingIndex = this.waveActive ? Math.max(0, this.currentWave - 1) : Math.min(this.currentWave, WAVES.length - 1);
    return {
      started: this.started, mapId: this.map.id, mapName: this.map.name, mapNumber: this.map.number,
      mapTotal: MAP_ORDER.length, mapGoldMultiplier: this.map.goldMultiplier,
      gold: this.gold, lives: this.lives, wave: this.currentWave, totalWaves: WAVES.length,
      remaining: this.spawnQueue.length + this.enemies.filter((enemy) => enemy.alive).length,
      countdown: Math.max(0, this.countdown), waveActive: this.waveActive,
      waveTitle: WAVES[upcomingIndex]?.title ?? '', waveIntel: WAVES[upcomingIndex]?.intel ?? '',
      paused: this.paused, speed: this.speed, difficulty: this.difficulty, difficultyName: DIFFICULTIES[this.difficulty].name,
      score: this.score, towerCount: this.towers.length, buildType: this.buildType, placementMessage: this.placementMessage,
      selectedTower: selected && definition && selectedLevel ? {
        type: selected.type, x: selected.x, y: selected.y, name: definition.name, level: selected.level, mode: selected.targetMode === 'first' ? 'Первая по пути' : 'Самая сильная',
        nextCost: definition.levels[selected.level - 1].upgradeCost,
        sellValue: sellValue(definition.cost, selected.paidUpgrades), description: definition.description, perk: selectedLevel.perk,
        damage: selectedLevel.damage * selectedAura.damage,
        attacksPerSecond: selectedLevel.attackMs > 0 ? 1000 / selectedLevel.attackMs * selectedAura.speed : 0,
        range: selectedLevel.range, projectileCount: selectedLevel.projectileCount, projectileScale: selectedLevel.projectileScale,
        armorPierce: selectedLevel.armorPierce ?? 0, splash: selectedLevel.splash ?? definition.splash, slow: selectedLevel.slow ?? definition.slow,
        auraDamage: selected.type === 'boost' ? selectedLevel.damageBoost ?? 1 : selectedAura.damage,
        auraSpeed: selected.type === 'boost' ? selectedLevel.attackSpeedBoost ?? 1 : selectedAura.speed,
        damageDealt: selected.damageDealt, kills: selected.kills, boosted: selectedBoosted, auraTargets,
      } : null,
      hero: {
        x: this.hero.x, y: this.hero.y, hp: Math.max(0, this.hero.hp), maxHp: HERO.maxHp, mana: this.hero.mana, maxMana: HERO.maxMana, xp: this.hero.xp,
        xpNext: nextXp, level: this.hero.level, alive: this.hero.alive, respawn: Math.max(0, (this.hero.respawnAt - this.simTime) / 1000),
        stance: this.hero.stance, focusTarget: heroFocus ? (heroFocus.elite ? ELITES[heroFocus.elite].name : this.enemyDefinition(heroFocus.type).name) : null,
        command: heroCommand, aimAbility: this.aimAbility, stormCharge: this.hero.stormCharge,
        overcharge: Math.max(0, (this.hero.overchargeUntil - this.simTime) / 1000),
        abilities: { q: abilityState('q'), w: abilityState('w'), e: abilityState('e'), r: abilityState('r') },
      },
      boss: boss ? { name: this.enemyDefinition(boss.type).name, hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: boss.phase, shielded: boss.shieldUntil > this.simTime } : null,
      cameraZoom: this.cameras.main.zoom,
      result: this.result,
    };
  }

  private emitHud(force = false): void {
    if (!force && this.simTime - this.lastHudAt < 100) return;
    this.lastHudAt = this.simTime;
    emit('td:state', this.getHudState());
  }
}
