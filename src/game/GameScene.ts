import Phaser from 'phaser';
import {
  CRYSTAL, DIFFICULTIES, EARLY_START_GOLD_PER_SECOND, ENEMIES, FORBIDDEN_ZONES, GAME_HEIGHT, GAME_WIDTH, HERO,
  INTERMISSION_SECONDS, PATH, TOWERS, WAVES,
} from '../core/config';
import {
  applySlow, chainTargets, damageOutcome, distance, earlyStartBonus, loseLives, placementFailure, pointToLineDistance, scaleEnemy,
  selectTarget, sellValue, waveHpMultiplier, waveSpeedMultiplier,
} from '../core/rules';
import type { Difficulty, EnemyType, Point, TargetMode, TowerType } from '../core/types';
import { emit, on } from './bus';

type Action =
  | { type: 'begin' } | { type: 'build'; tower: TowerType } | { type: 'start-wave' }
  | { type: 'pause' } | { type: 'speed' } | { type: 'upgrade' } | { type: 'sell' }
  | { type: 'target' } | { type: 'ability'; key: 'q' | 'w' | 'e' | 'r' }
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
}

interface Projectile {
  view: Phaser.GameObjects.Arc;
  target: EnemyUnit;
  source: TowerUnit;
  damage: number;
  speed: number;
  splash: number;
  slow: number;
  color: number;
}

interface Storm {
  x: number;
  y: number;
  endsAt: number;
  nextTick: number;
  view: Phaser.GameObjects.Graphics;
}

interface SpawnEntry { type: EnemyType; at: number }

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
  cooldowns: Record<'q' | 'w' | 'e' | 'r', number>;
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Image;
}

export interface HudState {
  started: boolean;
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
    name: string;
    level: number;
    mode: string;
    nextCost: number | null;
    sellValue: number;
    description: string;
    damage: number;
    attacksPerSecond: number;
    range: number;
    damageDealt: number;
    kills: number;
    boosted: boolean;
    auraTargets: number;
  };
  hero: { x: number; y: number; hp: number; maxHp: number; mana: number; maxMana: number; xp: number; xpNext: number; level: number; alive: boolean; respawn: number; abilities: Record<string, { cooldown: number; mana: number; locked: boolean }> };
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
      metrics: () => { activeEnemies: number; gameObjects: number; averageFrameMs: number; fps: number };
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
  private gold = TEST_MODE ? 9999 : DIFFICULTIES[this.difficulty].startingGold;
  private lives = DIFFICULTIES[this.difficulty].crystalLives;
  private score = 0;
  private currentWave = 0;
  private waveActive = false;
  private countdown = TEST_MODE ? 30 : INTERMISSION_SECONDS;
  private result: 'playing' | 'victory' | 'defeat' = 'playing';
  private nextId = 1;
  private towers: TowerUnit[] = [];
  private enemies: EnemyUnit[] = [];
  private projectiles: Projectile[] = [];
  private storms: Storm[] = [];
  private spawnQueue: SpawnEntry[] = [];
  private buildType: TowerType | null = null;
  private selectedTower: TowerUnit | null = null;
  private placementMessage = '';
  private preview!: Phaser.GameObjects.Graphics;
  private selectionRing!: Phaser.GameObjects.Graphics;
  private heroTargetMarker!: Phaser.GameObjects.Graphics;
  private hero!: HeroState;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private routeLengths: number[] = [];
  private routeTotal = 0;
  private offAction: (() => void) | null = null;
  private frameSamples: number[] = [];
  private reduceMotion = localStorage.getItem('rift-reduce-motion') === 'on';
  private screenShake = localStorage.getItem('rift-screen-shake') !== 'off';
  private cameraTargetZoom = 1.08;
  private cameraDragging = false;
  private cameraDragX = 0;
  private cameraDragY = 0;

  constructor() {
    super('valley');
  }

  preload(): void {
    this.load.image('valley-landscape', 'assets/rift-valley-map-v3.png');
    this.load.spritesheet('tower-art', 'assets/towers-atlas.png', { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet('unit-art', 'assets/units-atlas.png', { frameWidth: 320, frameHeight: 480 });
  }

  create(): void {
    this.buildRouteCache();
    this.drawMap();
    this.createAtmosphere();
    this.preview = this.add.graphics().setDepth(40);
    this.selectionRing = this.add.graphics().setDepth(35);
    this.heroTargetMarker = this.add.graphics().setDepth(13);
    this.createHero();
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.drawPlacementPreview(pointer);
      this.handleCameraDrag(pointer);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    this.input.on('pointerup', () => { this.cameraDragging = false; });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.setCameraZoom(dy < 0 ? 'in' : 'out');
    });
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E,R,SHIFT,UP,DOWN,LEFT,RIGHT,SPACE,F,ESC,ONE,TWO,THREE,FOUR') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ONE.on('down', () => this.chooseBuild('archer'));
    this.keys.TWO.on('down', () => this.chooseBuild('frost'));
    this.keys.THREE.on('down', () => this.chooseBuild('siege'));
    this.keys.FOUR.on('down', () => this.chooseBuild('boost'));
    this.keys.ESC.on('down', () => this.chooseBuild(null));
    this.keys.SPACE.on('down', () => this.togglePause());
    this.keys.F.on('down', () => this.cameras.main.centerOn(this.hero.x, this.hero.y));
    this.keys.Q.on('down', () => this.useAbility('q'));
    this.keys.SHIFT.on('down', () => this.useAbility('w'));
    this.keys.E.on('down', () => this.useAbility('e'));
    this.keys.R.on('down', () => this.useAbility('r'));
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
        metrics: () => this.getPerformanceMetrics(),
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
    this.updateProjectiles(delta);
    this.updateStorms();
    this.emitHud();
  }

  private buildRouteCache(): void {
    this.routeLengths = [];
    this.routeTotal = 0;
    for (let index = 0; index < PATH.length - 1; index += 1) {
      const length = distance(PATH[index], PATH[index + 1]);
      this.routeLengths.push(length);
      this.routeTotal += length;
    }
  }

  private drawMap(): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'valley-landscape')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(-30).setTint(0xc4d0c8);
    const background = this.add.graphics().setDepth(-20);
    background.fillStyle(0x07111d, 0.17).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    background.lineStyle(3, 0x86b297, 0.48).strokeRoundedRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24, 24);
    FORBIDDEN_ZONES.forEach((zone, index) => {
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
    road.lineStyle(76, 0x0b0712, 0.18).beginPath().moveTo(PATH[0].x + 5, PATH[0].y + 7);
    PATH.slice(1).forEach((point) => road.lineTo(point.x + 7, point.y + 10));
    road.strokePath();
    road.lineStyle(61, 0xd9c39e, 0.08).beginPath().moveTo(PATH[0].x, PATH[0].y);
    PATH.slice(1).forEach((point) => road.lineTo(point.x, point.y));
    road.strokePath();
    road.lineStyle(2, 0xffe6ac, 0.38).beginPath().moveTo(PATH[0].x, PATH[0].y);
    PATH.slice(1).forEach((point) => road.lineTo(point.x, point.y));
    road.strokePath();
    const portal = this.add.graphics();
    portal.fillStyle(0x090713, 1).fillEllipse(PATH[0].x + 8, PATH[0].y, 55, 82);
    portal.lineStyle(7, 0x9e4cff, 0.9).strokeEllipse(PATH[0].x + 8, PATH[0].y, 55, 82);
    portal.lineStyle(2, 0xe0a8ff, 0.8).strokeEllipse(PATH[0].x + 8, PATH[0].y, 35, 61);
    this.add.text(22, 383, 'ПОРТАЛ РАЗЛОМА', { fontFamily: 'Arial', fontSize: '13px', color: '#d6a8ff', fontStyle: 'bold' });
    const crystal = this.add.graphics().setDepth(5);
    crystal.fillStyle(0xf7b34a, 0.22).fillCircle(CRYSTAL.x, CRYSTAL.y, 55);
    crystal.fillStyle(0x3b2918, 1).fillEllipse(CRYSTAL.x + 7, CRYSTAL.y + 27, 64, 24);
    crystal.fillStyle(0xffd56b, 1).fillPoints([
      { x: CRYSTAL.x, y: CRYSTAL.y - 48 }, { x: CRYSTAL.x + 24, y: CRYSTAL.y - 5 },
      { x: CRYSTAL.x + 8, y: CRYSTAL.y + 32 }, { x: CRYSTAL.x - 22, y: CRYSTAL.y + 1 },
    ], true);
    crystal.lineStyle(4, 0xfff1b2, 0.9).strokePoints([
      { x: CRYSTAL.x, y: CRYSTAL.y - 48 }, { x: CRYSTAL.x + 24, y: CRYSTAL.y - 5 },
      { x: CRYSTAL.x + 8, y: CRYSTAL.y + 32 }, { x: CRYSTAL.x - 22, y: CRYSTAL.y + 1 },
    ], true);
    this.add.text(1058, 321, 'КРИСТАЛЛ', { fontFamily: 'Arial', fontSize: '14px', color: '#ffd978', fontStyle: 'bold' });
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
  }

  private createHero(): void {
    const art = this.add.graphics();
    art.fillStyle(0x0b1722, 0.62).fillEllipse(5, 15, 54, 22);
    art.fillStyle(0x49dbf2, 0.14).fillCircle(0, -4, 34);
    art.lineStyle(2, 0x8ff4ff, 0.65).strokeCircle(0, -4, 28);
    const sprite = this.add.image(0, -19, 'unit-art', 5).setScale(0.145);
    const container = this.add.container(CRYSTAL.x - 70, CRYSTAL.y + 80, [art, sprite]).setDepth(18);
    if (!this.reduceMotion) this.tweens.add({ targets: sprite, y: -23, duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.hero = {
      x: container.x, y: container.y, target: { x: container.x, y: container.y }, hp: HERO.maxHp, mana: HERO.maxMana,
      xp: TEST_MODE ? 260 : 0, level: TEST_MODE ? 3 : 1, alive: true, respawnAt: 0, nextAttackAt: 0, sealUntil: 0,
      cooldowns: { q: 0, w: 0, e: 0, r: 0 }, container, art, sprite,
    };
  }

  private handleAction(action: Action): void {
    if (action.type === 'begin') {
      this.started = true;
      emit('td:sound', 'wave');
    } else if (action.type === 'difficulty' && !this.started) {
      this.difficulty = action.difficulty;
      localStorage.setItem('rift-difficulty', action.difficulty);
      this.gold = TEST_MODE ? 9999 : DIFFICULTIES[this.difficulty].startingGold;
      this.lives = DIFFICULTIES[this.difficulty].crystalLives;
    } else if (action.type === 'build') this.chooseBuild(action.tower);
    else if (action.type === 'start-wave') this.startNextWave(true);
    else if (action.type === 'pause') this.togglePause();
    else if (action.type === 'speed') this.speed = this.speed === 1 ? 2 : 1;
    else if (action.type === 'upgrade') this.upgradeSelected();
    else if (action.type === 'sell') this.sellSelected();
    else if (action.type === 'target') this.toggleTargetMode();
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
    if (pointer.rightButtonDown()) {
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

  private chooseBuild(type: TowerType | null): void {
    this.buildType = type;
    this.selectedTower = null;
    this.placementMessage = type ? `Выбрано: ${TOWERS[type].name}` : '';
    this.drawSelection();
    if (!type) this.preview.clear();
    this.emitHud(true);
  }

  private placementContext(point: Point, type: TowerType) {
    return {
      point, mapWidth: GAME_WIDTH, mapHeight: GAME_HEIGHT, edgePadding: 36, towerRadius: 24,
      gold: this.gold, cost: TOWERS[type].cost, path: PATH, pathHalfWidth: 34, crystal: CRYSTAL, crystalRadius: 52,
      forbidden: FORBIDDEN_ZONES, towers: this.towers.map((tower) => ({ x: tower.x, y: tower.y, radius: 24 })),
    };
  }

  private drawPlacementPreview(pointer: Phaser.Input.Pointer): void {
    if (!this.buildType) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const valid = placementFailure(this.placementContext(world, this.buildType)) === null;
    const definition = TOWERS[this.buildType];
    this.preview.clear().fillStyle(valid ? 0x52ff8a : 0xff526b, 0.18).fillCircle(world.x, world.y, definition.levels[0].range)
      .lineStyle(2, valid ? 0x74ff9f : 0xff6c7d, 0.85).strokeCircle(world.x, world.y, 24)
      .fillStyle(definition.color, 0.75).fillCircle(world.x, world.y, 17);
  }

  private placeTower(point: Point): void {
    if (!this.buildType || this.result !== 'playing') return;
    const failure = placementFailure(this.placementContext(point, this.buildType));
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
    const frame = { archer: 0, frost: 1, siege: 2, boost: 3 }[this.buildType];
    const sprite = this.add.image(0, -13, 'tower-art', frame).setScale(0.105);
    const container = this.add.container(point.x, point.y, [art, sprite]).setDepth(15);
    container.setSize(52, 52).setInteractive(new Phaser.Geom.Circle(0, 0, 28), Phaser.Geom.Circle.Contains);
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.selectedTower = this.towers.find((tower) => tower.container === container) ?? null;
      this.buildType = null;
      this.drawSelection();
      this.emitHud(true);
    });
    const tower: TowerUnit = {
      id: this.nextId++, type: this.buildType, x: point.x, y: point.y, level: 1, targetMode: 'first', nextAttackAt: 0,
      paidUpgrades: [], damageDealt: 0, kills: 0, container, art, sprite,
    };
    this.towers.push(tower);
    this.drawTower(tower);
    if (!this.reduceMotion) this.tweens.add({ targets: sprite, scaleX: 0.118, scaleY: 0.118, duration: 180, yoyo: true, ease: 'Back.out' });
    this.selectedTower = tower;
    this.buildType = null;
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
    tower.sprite.setFrame({ archer: 0, frost: 1, siege: 2, boost: 3 }[tower.type]);
    tower.sprite.setScale(0.098 + tower.level * 0.008).setTint(tower.level === 3 ? 0xfff1c2 : 0xffffff);
    for (let index = 0; index < tower.level; index += 1) art.fillStyle(0xffdc72, 1).fillCircle(-10 + index * 10, 23, 3);
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
    if (!tower || tower.level >= 3) return;
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
    if (early) this.gold += earlyStartBonus(this.countdown, EARLY_START_GOLD_PER_SECOND);
    if (early) this.score += Math.floor(Math.max(0, this.countdown) * 25 * DIFFICULTIES[this.difficulty].scoreMultiplier);
    this.currentWave += 1;
    this.waveActive = true;
    this.spawnQueue = [];
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
      this.gold += WAVES[this.currentWave - 1].reward;
      this.score += Math.round((350 + this.currentWave * 40) * DIFFICULTIES[this.difficulty].scoreMultiplier);
      if (this.currentWave >= WAVES.length) this.finish('victory');
      else this.countdown = TEST_MODE ? 0.55 : INTERMISSION_SECONDS;
    }
  }

  private spawnEnemy(type: EnemyType, progress: number): EnemyUnit {
    const definition = this.enemyDefinition(type);
    const position = this.pointAtProgress(progress);
    const art = this.add.graphics();
    const frame = { raider: 0, runner: 1, brute: 2, winged: 3, warden: 4, titan: 4, boss: 4 }[type];
    const spriteScale = { raider: 0.095, runner: 0.09, brute: 0.125, winged: 0.115, warden: 0.16, titan: 0.185, boss: 0.21 }[type];
    const sprite = this.add.image(0, this.isBossType(type) ? -28 : -18, 'unit-art', frame).setScale(spriteScale);
    const hpBar = this.add.graphics();
    const container = this.add.container(position.x, position.y, [art, sprite, hpBar]).setDepth(type === 'winged' ? 25 : 16);
    const maxHp = definition.maxHp * waveHpMultiplier(this.currentWave) * ENEMY_HP_SCALE;
    const enemy: EnemyUnit = {
      id: this.nextId++, type, hp: maxHp, maxHp, progress, alive: true, slow: 0, slowUntil: 0, phase: 1,
      shieldUntil: 0, lastShieldAt: this.simTime, summonedPhase: false, contactCooldown: 0, container, art, sprite, hpBar,
    };
    this.enemies.push(enemy);
    this.drawEnemy(enemy);
    if (!this.reduceMotion) {
      sprite.setAlpha(0).setScale(spriteScale * 0.55);
      this.tweens.add({ targets: sprite, alpha: 1, scaleX: spriteScale, scaleY: spriteScale, duration: 260, ease: 'Back.out' });
      const portalPulse = this.add.circle(PATH[0].x, PATH[0].y, 16, 0xb54dff, 0.55).setDepth(14);
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
    enemy.sprite.setFrame({ raider: 0, runner: 1, brute: 2, winged: 3, warden: 4, titan: 4, boss: 4 }[enemy.type]);
    const bossTint = enemy.type === 'warden' ? 0xd79cff : enemy.type === 'titan' ? 0xffa070 : 0xffffff;
    enemy.sprite.setTint(enemy.slowUntil > this.simTime ? 0xb9f4ff : bossTint);
    this.drawEnemyHealth(enemy);
  }

  private drawEnemyHealth(enemy: EnemyUnit): void {
    const definition = this.enemyDefinition(enemy.type);
    const width = this.isBossType(enemy.type) ? 76 : 34;
    enemy.hpBar.clear().fillStyle(0x120e18, 0.9).fillRect(-width / 2, -definition.radius - 14, width, 5)
      .fillStyle(enemy.hp / enemy.maxHp > 0.35 ? 0x6ee07a : 0xff5d72, 1).fillRect(-width / 2, -definition.radius - 14, width * Math.max(0, enemy.hp / enemy.maxHp), 5);
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const definition = this.enemyDefinition(enemy.type);
      if (this.isBossType(enemy.type)) {
        const shieldInterval = enemy.type === 'warden' ? 10500 : enemy.type === 'titan' ? 8500 : 7000;
        if (this.simTime - enemy.lastShieldAt >= (TEST_MODE ? 2500 : shieldInterval)) {
          enemy.lastShieldAt = this.simTime;
          enemy.shieldUntil = this.simTime + (TEST_MODE ? 450 : 3000);
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
      const slow = enemy.slowUntil > this.simTime ? enemy.slow : 0;
      const phaseMultiplier = this.isBossType(enemy.type) && enemy.phase === 2 ? 1.28 : 1;
      enemy.progress += applySlow(definition.speed * waveSpeedMultiplier(this.currentWave) * ENEMY_SPEED_SCALE * phaseMultiplier, slow) * delta / 1000;
      const point = this.pointAtProgress(enemy.progress);
      enemy.container.setPosition(point.x, point.y + (definition.flying ? -18 + Math.sin(this.simTime / 120) * 5 : 0));
      if (this.hero.alive && !definition.flying && distance(point, this.hero) < definition.radius + 24 && this.simTime >= enemy.contactCooldown) {
        enemy.contactCooldown = this.simTime + 700;
        const shieldMultiplier = this.hero.sealUntil > this.simTime ? 0.4 : 1;
        const bossContactDamage = enemy.type === 'warden' ? 30 : enemy.type === 'titan' ? 46 : enemy.type === 'boss' ? 64 : 13;
        this.hero.hp -= bossContactDamage * shieldMultiplier;
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
      const reward = this.enemyDefinition(enemy.type).reward;
      this.gold += reward;
      this.score += Math.round(reward * 10 * DIFFICULTIES[this.difficulty].scoreMultiplier);
      this.hero.xp += this.isBossType(enemy.type) ? 240 : 18;
      this.updateHeroLevel();
    }
    if (!this.reduceMotion) {
      const ghost = this.add.image(enemy.container.x, enemy.container.y - 16, 'unit-art', enemy.sprite.frame.name).setScale(enemy.sprite.scaleX).setTint(0xd9a4ff).setDepth(28);
      this.tweens.add({ targets: ghost, y: ghost.y - 24, angle: Phaser.Math.Between(-12, 12), alpha: 0, scale: enemy.sprite.scaleX * 1.2, duration: 320, ease: 'Cubic.out', onComplete: () => ghost.destroy() });
    }
    enemy.container.destroy(true);
    emit('td:sound', 'death');
  }

  private pointAtProgress(progress: number): Point {
    let left = Math.max(0, progress);
    for (let index = 0; index < this.routeLengths.length; index += 1) {
      const length = this.routeLengths[index];
      if (left <= length) {
        const ratio = left / length;
        return { x: Phaser.Math.Linear(PATH[index].x, PATH[index + 1].x, ratio), y: Phaser.Math.Linear(PATH[index].y, PATH[index + 1].y, ratio) };
      }
      left -= length;
    }
    return { ...PATH[PATH.length - 1] };
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
      const boosted = this.towers.some((candidate) => candidate.type === 'boost' && distance(tower, candidate) <= TOWERS.boost.levels[candidate.level - 1].range);
      const sealed = this.hero.sealUntil > this.simTime && distance(tower, this.hero) <= 240;
      const multiplier = (boosted ? 1.25 : 1) * (sealed ? 1.35 : 1) * (TEST_MODE ? 3 : 1);
      this.fireProjectile(tower, target, level.damage * multiplier, definition.splash, definition.slow);
      tower.nextAttackAt = this.simTime + level.attackMs / (boosted ? 1.12 : 1);
    }
  }

  private fireProjectile(tower: TowerUnit, target: EnemyUnit, damage: number, splash: number, slow: number): void {
    const color = TOWERS[tower.type].color;
    const view = this.add.circle(tower.x, tower.y - 10, tower.type === 'siege' ? 7 : 4, color).setDepth(30);
    this.projectiles.push({ view, target, source: tower, damage, speed: tower.type === 'siege' ? 360 : 620, splash, slow, color });
    emit('td:sound', 'shot');
  }

  private updateProjectiles(delta: number): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile.target.alive) {
        projectile.view.destroy();
        this.projectiles.splice(index, 1);
        continue;
      }
      const target = { x: projectile.target.container.x, y: projectile.target.container.y };
      const remaining = distance(projectile.view, target);
      const travel = projectile.speed * delta / 1000;
      if (remaining <= travel + 4) {
        this.impactProjectile(projectile);
        projectile.view.destroy();
        this.projectiles.splice(index, 1);
      } else {
        const angle = Phaser.Math.Angle.Between(projectile.view.x, projectile.view.y, target.x, target.y);
        projectile.view.x += Math.cos(angle) * travel;
        projectile.view.y += Math.sin(angle) * travel;
      }
    }
  }

  private impactProjectile(projectile: Projectile): void {
    const center = { x: projectile.target.container.x, y: projectile.target.container.y };
    const targets = projectile.splash > 0
      ? this.enemies.filter((enemy) => enemy.alive && distance(enemy.container, center) <= projectile.splash)
      : [projectile.target];
    targets.forEach((enemy) => {
      const outcome = this.hitEnemy(enemy, projectile.damage, false);
      projectile.source.damageDealt += outcome.dealt;
      if (outcome.killed) projectile.source.kills += 1;
      if (projectile.slow > 0) {
        enemy.slow = Math.max(enemy.slow, projectile.slow);
        enemy.slowUntil = this.simTime + 2200;
      }
    });
    const burst = this.add.circle(center.x, center.y, 8, projectile.color, 0.7).setDepth(29);
    const duration = this.reduceMotion ? 70 : 220;
    this.tweens.add({ targets: burst, scale: 3.5, alpha: 0, duration, onComplete: () => burst.destroy() });
    if (!this.reduceMotion) {
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const shard = this.add.circle(center.x, center.y, 2.5, projectile.color, 0.9).setDepth(30);
        this.tweens.add({
          targets: shard, x: center.x + Math.cos(angle) * Phaser.Math.Between(18, 42), y: center.y + Math.sin(angle) * Phaser.Math.Between(18, 42),
          alpha: 0, scale: 0.2, duration: Phaser.Math.Between(180, 320), onComplete: () => shard.destroy(),
        });
      }
      if (projectile.splash >= 70 && this.screenShake) this.cameras.main.shake(90, 0.0025);
    }
    emit('td:sound', 'hit');
  }

  private hitEnemy(enemy: EnemyUnit, rawDamage: number, magic: boolean): { dealt: number; hp: number; killed: boolean } {
    if (!enemy.alive) return { dealt: 0, hp: Math.max(0, enemy.hp), killed: false };
    const armor = magic ? this.enemyDefinition(enemy.type).armor * 0.2 : this.enemyDefinition(enemy.type).armor;
    const shield = this.isBossType(enemy.type) && enemy.shieldUntil > this.simTime ? 0.3 : 1;
    const outcome = damageOutcome(enemy.hp, rawDamage, armor, shield);
    enemy.hp = outcome.hp;
    this.drawEnemyHealth(enemy);
    if (outcome.killed) this.destroyEnemy(enemy, true);
    return outcome;
  }

  private updateHero(delta: number): void {
    if (!this.hero.alive) {
      if (this.simTime >= this.hero.respawnAt) this.respawnHero();
      return;
    }
    this.hero.mana = Math.min(HERO.maxMana, this.hero.mana + HERO.manaRegen * delta / 1000);
    const horizontal = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0);
    const vertical = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0);
    if (horizontal !== 0 || vertical !== 0) {
      const length = Math.hypot(horizontal, vertical);
      const travel = HERO.speed * (TEST_MODE ? 2 : 1) * delta / 1000;
      this.hero.x = Phaser.Math.Clamp(this.hero.x + horizontal / length * travel, 20, GAME_WIDTH - 20);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + vertical / length * travel, 20, GAME_HEIGHT - 20);
      this.hero.target = { x: this.hero.x, y: this.hero.y };
      this.heroTargetMarker.clear();
      this.hero.sprite.setFlipX(horizontal < 0);
      this.hero.container.setPosition(this.hero.x, this.hero.y);
    } else {
      const moveDistance = distance(this.hero, this.hero.target);
      if (moveDistance > 3) {
        const travel = Math.min(moveDistance, HERO.speed * (TEST_MODE ? 2 : 1) * delta / 1000);
        const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, this.hero.target.x, this.hero.target.y);
        this.hero.x += Math.cos(angle) * travel;
        this.hero.y += Math.sin(angle) * travel;
        this.hero.sprite.setFlipX(Math.cos(angle) < 0);
        this.hero.container.setPosition(this.hero.x, this.hero.y);
      } else {
        this.heroTargetMarker.clear();
      }
    }
    if (this.simTime >= this.hero.nextAttackAt) {
      const target = this.enemies.filter((enemy) => enemy.alive && distance(this.hero, enemy.container) <= HERO.attackRange)
        .sort((a, b) => b.progress - a.progress)[0];
      if (target) {
        this.hero.nextAttackAt = this.simTime + HERO.attackMs;
        const lightning = this.add.graphics().setDepth(31).lineStyle(3, 0x9ef5ff, 0.9).beginPath().moveTo(this.hero.x, this.hero.y).lineTo(target.container.x, target.container.y).strokePath();
        this.tweens.add({ targets: lightning, alpha: 0, duration: 110, onComplete: () => lightning.destroy() });
        this.hitEnemy(target, HERO.attackDamage * (TEST_MODE ? 2.5 : 1), true);
      }
    }
  }

  private killHero(): void {
    this.hero.alive = false;
    this.hero.hp = 0;
    this.hero.respawnAt = this.simTime + HERO.respawnSeconds * 1000;
    this.hero.container.setVisible(false);
    this.heroTargetMarker.clear();
    emit('td:sound', 'death');
  }

  private respawnHero(): void {
    this.hero.alive = true;
    this.hero.hp = HERO.maxHp;
    this.hero.mana = HERO.maxMana * 0.6;
    this.hero.x = CRYSTAL.x - 70;
    this.hero.y = CRYSTAL.y + 80;
    this.hero.target = { x: this.hero.x, y: this.hero.y };
    this.hero.container.setPosition(this.hero.x, this.hero.y).setVisible(true);
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

  private useAbility(key: 'q' | 'w' | 'e' | 'r'): void {
    if (!this.started || this.paused || !this.hero.alive || this.result !== 'playing') return;
    const ability = HERO.abilities[key];
    if (this.simTime < this.hero.cooldowns[key] || this.hero.mana < ability.mana || (key === 'r' && this.hero.level < HERO.abilities.r.requiredLevel)) return;
    this.hero.mana -= ability.mana;
    this.hero.cooldowns[key] = this.simTime + ability.cooldown * 1000;
    if (key === 'q') this.castChainLightning();
    if (key === 'w') this.castDash();
    if (key === 'e') this.castSeal();
    if (key === 'r') this.castStorm();
    emit('td:sound', 'spell');
    this.emitHud(true);
  }

  private castChainLightning(): void {
    const candidates = this.enemies.map((enemy) => ({ id: enemy.id, x: enemy.container.x, y: enemy.container.y, hp: enemy.hp, maxHp: enemy.maxHp, progress: enemy.progress, flying: this.enemyDefinition(enemy.type).flying, alive: enemy.alive }));
    const ids = chainTargets(this.hero, candidates, 5 + this.hero.level, 235);
    let from: Point = { x: this.hero.x, y: this.hero.y };
    ids.forEach((id, index) => {
      const enemy = this.enemies.find((candidate) => candidate.id === id);
      if (!enemy) return;
      const line = this.add.graphics().setDepth(34).lineStyle(5 - Math.min(index, 3), 0xa8f8ff, 0.95).beginPath().moveTo(from.x, from.y).lineTo(enemy.container.x, enemy.container.y).strokePath();
      this.tweens.add({ targets: line, alpha: 0, duration: 180, onComplete: () => line.destroy() });
      this.hitEnemy(enemy, HERO.abilities.q.damage * (1 - index * 0.08), true);
      from = { x: enemy.container.x, y: enemy.container.y };
    });
  }

  private castDash(): void {
    const pointer = this.input.activePointer;
    const desired = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, desired.x, desired.y);
    const length = Math.min(270, distance(this.hero, desired));
    const from = { x: this.hero.x, y: this.hero.y };
    const to = { x: Phaser.Math.Clamp(from.x + Math.cos(angle) * length, 20, GAME_WIDTH - 20), y: Phaser.Math.Clamp(from.y + Math.sin(angle) * length, 20, GAME_HEIGHT - 20) };
    this.enemies.filter((enemy) => enemy.alive && pointToLineDistance(enemy.container, from, to) <= 58).forEach((enemy) => this.hitEnemy(enemy, HERO.abilities.w.damage, true));
    this.hero.x = to.x;
    this.hero.y = to.y;
    this.hero.target = to;
    this.hero.container.setPosition(to.x, to.y);
    const trail = this.add.graphics().setDepth(17).lineStyle(18, 0x52e4ff, 0.3).beginPath().moveTo(from.x, from.y).lineTo(to.x, to.y).strokePath();
    this.tweens.add({ targets: trail, alpha: 0, duration: 320, onComplete: () => trail.destroy() });
  }

  private castSeal(): void {
    this.hero.sealUntil = this.simTime + HERO.abilities.e.duration * 1000;
    const seal = this.add.circle(this.hero.x, this.hero.y, 230, 0x68dcff, 0.08).setStrokeStyle(3, 0xc6f7ff, 0.7).setDepth(8);
    this.tweens.add({ targets: seal, alpha: 0, duration: HERO.abilities.e.duration * 1000, onComplete: () => seal.destroy() });
  }

  private castStorm(): void {
    const pointer = this.input.activePointer;
    const center = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const view = this.add.graphics().setDepth(12).fillStyle(0x6640da, 0.16).fillCircle(center.x, center.y, 155).lineStyle(4, 0xa8ecff, 0.75).strokeCircle(center.x, center.y, 155);
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
        this.enemies.filter((enemy) => enemy.alive && distance(enemy.container, storm) <= 155).forEach((enemy) => this.hitEnemy(enemy, HERO.abilities.r.damage, true));
        const bolt = this.add.line(0, 0, storm.x + Phaser.Math.Between(-130, 130), storm.y - 170, storm.x + Phaser.Math.Between(-100, 100), storm.y + Phaser.Math.Between(-90, 90), 0xd2f7ff, 0.8).setOrigin(0).setLineWidth(3).setDepth(32);
        this.tweens.add({ targets: bolt, alpha: 0, duration: 130, onComplete: () => bolt.destroy() });
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
    const previous = Number(localStorage.getItem('rift-best-wave') ?? 0);
    localStorage.setItem('rift-best-wave', String(Math.max(previous, this.currentWave)));
    const bestScore = Number(localStorage.getItem('rift-best-score') ?? 0);
    localStorage.setItem('rift-best-score', String(Math.max(bestScore, this.score)));
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
    return scaleEnemy(ENEMIES[type], DIFFICULTIES[this.difficulty]);
  }

  private isBossType(type: EnemyType): boolean {
    return type === 'warden' || type === 'titan' || type === 'boss';
  }

  private spawnStress(count: number): void {
    if (!TEST_MODE) return;
    this.started = true;
    this.waveActive = true;
    this.countdown = 0;
    this.spawnQueue = [];
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy, false));
    this.enemies = [];
    for (let index = 0; index < Math.min(160, Math.max(0, count)); index += 1) {
      const types: EnemyType[] = ['raider', 'runner', 'brute', 'winged'];
      this.spawnEnemy(types[index % types.length], (index % 20) * 12);
    }
  }

  private getPerformanceMetrics() {
    const averageFrameMs = this.frameSamples.length
      ? this.frameSamples.reduce((sum, value) => sum + value, 0) / this.frameSamples.length
      : 0;
    return {
      activeEnemies: this.enemies.filter((enemy) => enemy.alive).length,
      gameObjects: this.children.list.length,
      averageFrameMs: Number(averageFrameMs.toFixed(2)),
      fps: averageFrameMs > 0 ? Number((1000 / averageFrameMs).toFixed(1)) : 0,
    };
  }

  private getHudState(): HudState {
    const selected = this.selectedTower;
    const definition = selected ? TOWERS[selected.type] : null;
    const selectedLevel = selected && definition ? definition.levels[selected.level - 1] : null;
    const selectedBoosted = Boolean(selected && selected.type !== 'boost' && this.towers.some((tower) => tower.type === 'boost' && distance(selected, tower) <= TOWERS.boost.levels[tower.level - 1].range));
    const auraTargets = selected && selected.type === 'boost' && selectedLevel
      ? this.towers.filter((tower) => tower.type !== 'boost' && distance(selected, tower) <= selectedLevel.range).length
      : 0;
    const nextXp = this.hero.level === 1 ? 100 : this.hero.level === 2 ? 240 : 240;
    const boss = this.enemies.find((enemy) => this.isBossType(enemy.type) && enemy.alive);
    const abilityState = (key: 'q' | 'w' | 'e' | 'r') => ({
      cooldown: Math.max(0, (this.hero.cooldowns[key] - this.simTime) / 1000),
      mana: HERO.abilities[key].mana,
      locked: key === 'r' && this.hero.level < HERO.abilities.r.requiredLevel,
    });
    const upcomingIndex = this.waveActive ? Math.max(0, this.currentWave - 1) : Math.min(this.currentWave, WAVES.length - 1);
    return {
      started: this.started, gold: this.gold, lives: this.lives, wave: this.currentWave, totalWaves: WAVES.length,
      remaining: this.spawnQueue.length + this.enemies.filter((enemy) => enemy.alive).length,
      countdown: Math.max(0, this.countdown), waveActive: this.waveActive,
      waveTitle: WAVES[upcomingIndex]?.title ?? '', waveIntel: WAVES[upcomingIndex]?.intel ?? '',
      paused: this.paused, speed: this.speed, difficulty: this.difficulty, difficultyName: DIFFICULTIES[this.difficulty].name,
      score: this.score, towerCount: this.towers.length, buildType: this.buildType, placementMessage: this.placementMessage,
      selectedTower: selected && definition && selectedLevel ? {
        type: selected.type, name: definition.name, level: selected.level, mode: selected.targetMode === 'first' ? 'Первая по пути' : 'Самая сильная',
        nextCost: definition.levels[selected.level - 1].upgradeCost,
        sellValue: sellValue(definition.cost, selected.paidUpgrades), description: definition.description,
        damage: selectedLevel.damage * (selectedBoosted ? 1.25 : 1),
        attacksPerSecond: selectedLevel.attackMs > 0 ? 1000 / selectedLevel.attackMs * (selectedBoosted ? 1.12 : 1) : 0,
        range: selectedLevel.range, damageDealt: selected.damageDealt, kills: selected.kills, boosted: selectedBoosted, auraTargets,
      } : null,
      hero: {
        x: this.hero.x, y: this.hero.y, hp: Math.max(0, this.hero.hp), maxHp: HERO.maxHp, mana: this.hero.mana, maxMana: HERO.maxMana, xp: this.hero.xp,
        xpNext: nextXp, level: this.hero.level, alive: this.hero.alive, respawn: Math.max(0, (this.hero.respawnAt - this.simTime) / 1000),
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
