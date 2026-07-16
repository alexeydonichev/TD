import Phaser from 'phaser';
import {
  CRYSTAL, EARLY_START_GOLD_PER_SECOND, ENEMIES, FORBIDDEN_ZONES, GAME_HEIGHT, GAME_WIDTH, HERO,
  INTERMISSION_SECONDS, PATH, STARTING_GOLD, STARTING_LIVES, TOWERS, WAVES,
} from '../core/config';
import { applyArmor, applySlow, chainTargets, distance, loseLives, placementFailure, pointToLineDistance, selectTarget, sellValue } from '../core/rules';
import type { EnemyType, Point, TargetMode, TowerType } from '../core/types';
import { emit, on } from './bus';

type Action =
  | { type: 'begin' } | { type: 'build'; tower: TowerType } | { type: 'start-wave' }
  | { type: 'pause' } | { type: 'speed' } | { type: 'upgrade' } | { type: 'sell' }
  | { type: 'target' } | { type: 'ability'; key: 'q' | 'w' | 'e' | 'r' };

interface TowerUnit {
  id: number;
  type: TowerType;
  x: number;
  y: number;
  level: number;
  targetMode: TargetMode;
  nextAttackAt: number;
  paidUpgrades: number[];
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Graphics;
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
  hpBar: Phaser.GameObjects.Graphics;
}

interface Projectile {
  view: Phaser.GameObjects.Arc;
  target: EnemyUnit;
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
  buildType: TowerType | null;
  placementMessage: string;
  selectedTower: null | { name: string; level: number; mode: string; nextCost: number | null; sellValue: number; description: string };
  hero: { hp: number; maxHp: number; mana: number; maxMana: number; xp: number; xpNext: number; level: number; alive: boolean; respawn: number; abilities: Record<string, { cooldown: number; mana: number; locked: boolean }> };
  boss: null | { hp: number; maxHp: number; phase: number; shielded: boolean };
  result: 'playing' | 'victory' | 'defeat';
}

declare global {
  interface Window {
    __TD_TEST__?: {
      state: () => HudState;
      skipToBoss: () => void;
      defeat: () => void;
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
  private gold = TEST_MODE ? 9999 : STARTING_GOLD;
  private lives = STARTING_LIVES;
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
  private hero!: HeroState;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private routeLengths: number[] = [];
  private routeTotal = 0;
  private offAction: (() => void) | null = null;

  constructor() {
    super('valley');
  }

  create(): void {
    this.buildRouteCache();
    this.drawMap();
    this.preview = this.add.graphics().setDepth(40);
    this.selectionRing = this.add.graphics().setDepth(35);
    this.createHero();
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.drawPlacementPreview(pointer));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E,R,SPACE,F,ESC,ONE,TWO,THREE,FOUR') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ONE.on('down', () => this.chooseBuild('archer'));
    this.keys.TWO.on('down', () => this.chooseBuild('frost'));
    this.keys.THREE.on('down', () => this.chooseBuild('siege'));
    this.keys.FOUR.on('down', () => this.chooseBuild('boost'));
    this.keys.ESC.on('down', () => this.chooseBuild(null));
    this.keys.SPACE.on('down', () => this.togglePause());
    this.keys.F.on('down', () => this.cameras.main.centerOn(this.hero.x, this.hero.y));
    this.keys.Q.on('down', () => this.useAbility('q'));
    this.keys.W.on('down', () => this.useAbility('w'));
    this.keys.E.on('down', () => this.useAbility('e'));
    this.keys.R.on('down', () => this.useAbility('r'));
    this.offAction = on<Action>('td:action', (action) => this.handleAction(action));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offAction?.());
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT).setZoom(1);
    this.emitHud(true);
    if (TEST_MODE) {
      window.__TD_TEST__ = {
        state: () => this.getHudState(),
        skipToBoss: () => this.skipToBoss(),
        defeat: () => { this.lives = 0; this.finish('defeat'); },
      };
    }
  }

  update(_time: number, rawDelta: number): void {
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
    const background = this.add.graphics();
    background.fillGradientStyle(0x172636, 0x172636, 0x0d1321, 0x0d1321, 1);
    background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    background.lineStyle(3, 0x4d755c, 0.45).strokeRoundedRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24, 24);
    for (let x = 45; x < GAME_WIDTH; x += 95) {
      for (let y = 52; y < GAME_HEIGHT; y += 92) {
        const shade = (x + y) % 3 === 0 ? 0x304d3e : 0x294437;
        background.fillStyle(shade, 0.25).fillCircle(x, y, 18 + ((x * y) % 13));
      }
    }
    FORBIDDEN_ZONES.forEach((zone, index) => {
      background.fillStyle(index % 2 ? 0x263a32 : 0x352d43, 0.95).fillCircle(zone.x + 8, zone.y + 10, zone.radius);
      background.lineStyle(2, 0x6d7e68, 0.55).strokeCircle(zone.x, zone.y, zone.radius);
      for (let rock = 0; rock < 5; rock += 1) {
        const angle = (rock / 5) * Math.PI * 2;
        background.fillStyle(0x52635c, 0.75).fillTriangle(
          zone.x + Math.cos(angle) * zone.radius * 0.55,
          zone.y + Math.sin(angle) * zone.radius * 0.55 - 10,
          zone.x + Math.cos(angle) * zone.radius * 0.55 - 10,
          zone.y + Math.sin(angle) * zone.radius * 0.55 + 10,
          zone.x + Math.cos(angle) * zone.radius * 0.55 + 10,
          zone.y + Math.sin(angle) * zone.radius * 0.55 + 10,
        );
      }
    });
    const road = this.add.graphics();
    road.lineStyle(74, 0x14111d, 0.7).beginPath().moveTo(PATH[0].x + 7, PATH[0].y + 10);
    PATH.slice(1).forEach((point) => road.lineTo(point.x + 7, point.y + 10));
    road.strokePath();
    road.lineStyle(66, 0x50485a, 1).beginPath().moveTo(PATH[0].x, PATH[0].y);
    PATH.slice(1).forEach((point) => road.lineTo(point.x, point.y));
    road.strokePath();
    road.lineStyle(2, 0xa995a9, 0.35).beginPath().moveTo(PATH[0].x, PATH[0].y);
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
    this.add.text(28, 24, 'ДОЛИНА РАЗЛОМА', { fontFamily: 'Georgia', fontSize: '24px', color: '#f6d68c', stroke: '#18111f', strokeThickness: 5 }).setDepth(6);
  }

  private createHero(): void {
    const art = this.add.graphics();
    art.fillStyle(0x0b1722, 0.6).fillEllipse(5, 12, 42, 20);
    art.fillStyle(0x2e8fa6, 1).fillCircle(0, 0, 20);
    art.lineStyle(4, 0x89f2ff, 1).strokeCircle(0, 0, 20);
    art.fillStyle(0xffdc72, 1).fillTriangle(-8, -8, 8, -8, 0, -28);
    art.lineStyle(2, 0xffffff, 0.8).beginPath().moveTo(-25, 5).lineTo(25, -10).strokePath();
    const container = this.add.container(CRYSTAL.x - 70, CRYSTAL.y + 80, [art]).setDepth(18);
    this.hero = {
      x: container.x, y: container.y, target: { x: container.x, y: container.y }, hp: HERO.maxHp, mana: HERO.maxMana,
      xp: TEST_MODE ? 260 : 0, level: TEST_MODE ? 3 : 1, alive: true, respawnAt: 0, nextAttackAt: 0, sealUntil: 0,
      cooldowns: { q: 0, w: 0, e: 0, r: 0 }, container, art,
    };
  }

  private handleAction(action: Action): void {
    if (action.type === 'begin') {
      this.started = true;
      emit('td:sound', 'wave');
    } else if (action.type === 'build') this.chooseBuild(action.tower);
    else if (action.type === 'start-wave') this.startNextWave(true);
    else if (action.type === 'pause') this.togglePause();
    else if (action.type === 'speed') this.speed = this.speed === 1 ? 2 : 1;
    else if (action.type === 'upgrade') this.upgradeSelected();
    else if (action.type === 'sell') this.sellSelected();
    else if (action.type === 'target') this.toggleTargetMode();
    else if (action.type === 'ability') this.useAbility(action.key);
    this.emitHud(true);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (pointer.rightButtonDown()) {
      this.hero.target = { x: Phaser.Math.Clamp(world.x, 20, GAME_WIDTH - 20), y: Phaser.Math.Clamp(world.y, 20, GAME_HEIGHT - 20) };
      this.chooseBuild(null);
      return;
    }
    if (this.buildType) this.placeTower(world);
    else this.selectTowerAt(world);
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
    const container = this.add.container(point.x, point.y, [art]).setDepth(15);
    container.setSize(52, 52).setInteractive(new Phaser.Geom.Circle(0, 0, 28), Phaser.Geom.Circle.Contains);
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.selectedTower = this.towers.find((tower) => tower.container === container) ?? null;
      this.buildType = null;
      this.drawSelection();
      this.emitHud(true);
    });
    const tower: TowerUnit = { id: this.nextId++, type: this.buildType, x: point.x, y: point.y, level: 1, targetMode: 'first', nextAttackAt: 0, paidUpgrades: [], container, art };
    this.towers.push(tower);
    this.drawTower(tower);
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
    art.fillStyle(0x10121a, 0.55).fillEllipse(5, 16, 56, 24);
    art.fillStyle(0x4a4250, 1).fillRect(-19, -2, 38, 30);
    art.fillStyle(definition.color, 1).fillCircle(0, -7, 19 + tower.level * 2);
    art.lineStyle(3, 0xffe8b1, 0.65).strokeCircle(0, -7, 19 + tower.level * 2);
    if (tower.type === 'archer') art.lineStyle(5, 0x432916, 1).beginPath().moveTo(-18, -19).lineTo(18, 5).strokePath();
    if (tower.type === 'frost') art.fillStyle(0xc9f6ff, 1).fillTriangle(0, -33, -9, -7, 10, -7);
    if (tower.type === 'siege') art.fillStyle(0x33221d, 1).fillRect(-25, -15, 50, 12);
    if (tower.type === 'boost') art.lineStyle(3, 0xf0d6ff, 1).strokeCircle(0, -7, 10);
    for (let index = 0; index < tower.level; index += 1) art.fillStyle(0xffdc72, 1).fillCircle(-10 + index * 10, 21, 3);
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
    if (!this.selectedTower) return;
    this.selectedTower.targetMode = this.selectedTower.targetMode === 'first' ? 'strongest' : 'first';
  }

  private startNextWave(early: boolean): void {
    if (!this.started || this.waveActive || this.result !== 'playing' || this.currentWave >= WAVES.length) return;
    if (early) this.gold += Math.floor(Math.max(0, this.countdown) * EARLY_START_GOLD_PER_SECOND);
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
    emit('td:sound', this.currentWave === 10 ? 'boss' : 'wave');
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
      if (this.currentWave >= WAVES.length) this.finish('victory');
      else this.countdown = TEST_MODE ? 0.55 : INTERMISSION_SECONDS;
    }
  }

  private spawnEnemy(type: EnemyType, progress: number): EnemyUnit {
    const definition = ENEMIES[type];
    const position = this.pointAtProgress(progress);
    const art = this.add.graphics();
    const hpBar = this.add.graphics();
    const container = this.add.container(position.x, position.y, [art, hpBar]).setDepth(type === 'winged' ? 25 : 16);
    const maxHp = definition.maxHp * ENEMY_HP_SCALE;
    const enemy: EnemyUnit = {
      id: this.nextId++, type, hp: maxHp, maxHp, progress, alive: true, slow: 0, slowUntil: 0, phase: 1,
      shieldUntil: 0, lastShieldAt: this.simTime, summonedPhase: false, contactCooldown: 0, container, art, hpBar,
    };
    this.enemies.push(enemy);
    this.drawEnemy(enemy);
    return enemy;
  }

  private drawEnemy(enemy: EnemyUnit): void {
    const definition = ENEMIES[enemy.type];
    const art = enemy.art.clear();
    art.fillStyle(0x070914, 0.6).fillEllipse(5, definition.radius * 0.75, definition.radius * 2.2, definition.radius);
    if (enemy.type === 'winged') {
      art.fillStyle(0x8e9cff, 0.8).fillTriangle(-4, -3, -30, -17, -19, 10).fillTriangle(4, -3, 30, -17, 19, 10);
    }
    if (enemy.type === 'boss') {
      art.fillStyle(0x351030, 1).fillCircle(0, 0, definition.radius + 7);
      art.lineStyle(5, enemy.shieldUntil > this.simTime ? 0xaeefff : 0xff62bc, 0.95).strokeCircle(0, 0, definition.radius + 8);
      art.fillStyle(0xffd0ec, 1).fillTriangle(-22, -20, -10, -47, -2, -19).fillTriangle(22, -20, 10, -47, 2, -19);
    } else {
      art.fillStyle(definition.color, 1).fillCircle(0, 0, definition.radius);
      art.lineStyle(2, 0xe8c9ff, 0.55).strokeCircle(0, 0, definition.radius);
      if (enemy.type === 'brute') art.lineStyle(5, 0xbbb0c6, 0.85).strokeCircle(0, 0, definition.radius + 3);
    }
    art.fillStyle(0xffffff, 0.85).fillCircle(-5, -3, 2).fillCircle(5, -3, 2);
    this.drawEnemyHealth(enemy);
  }

  private drawEnemyHealth(enemy: EnemyUnit): void {
    const definition = ENEMIES[enemy.type];
    const width = enemy.type === 'boss' ? 72 : 34;
    enemy.hpBar.clear().fillStyle(0x120e18, 0.9).fillRect(-width / 2, -definition.radius - 14, width, 5)
      .fillStyle(enemy.hp / enemy.maxHp > 0.35 ? 0x6ee07a : 0xff5d72, 1).fillRect(-width / 2, -definition.radius - 14, width * Math.max(0, enemy.hp / enemy.maxHp), 5);
  }

  private updateEnemies(delta: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const definition = ENEMIES[enemy.type];
      if (enemy.type === 'boss') {
        if (this.simTime - enemy.lastShieldAt >= (TEST_MODE ? 2500 : 9000)) {
          enemy.lastShieldAt = this.simTime;
          enemy.shieldUntil = this.simTime + (TEST_MODE ? 450 : 3000);
          this.drawEnemy(enemy);
        }
        if (enemy.hp <= enemy.maxHp * 0.5 && enemy.phase === 1) {
          enemy.phase = 2;
          this.cameraFlash(0xff3f9a);
          if (!enemy.summonedPhase) {
            enemy.summonedPhase = true;
            for (let index = 0; index < 5; index += 1) this.spawnEnemy('runner', Math.max(0, enemy.progress - index * 22));
          }
        }
      }
      const slow = enemy.slowUntil > this.simTime ? enemy.slow : 0;
      const phaseMultiplier = enemy.type === 'boss' && enemy.phase === 2 ? 1.28 : 1;
      enemy.progress += applySlow(definition.speed * ENEMY_SPEED_SCALE * phaseMultiplier, slow) * delta / 1000;
      const point = this.pointAtProgress(enemy.progress);
      enemy.container.setPosition(point.x, point.y + (definition.flying ? -18 + Math.sin(this.simTime / 120) * 5 : 0));
      if (this.hero.alive && !definition.flying && distance(point, this.hero) < definition.radius + 24 && this.simTime >= enemy.contactCooldown) {
        enemy.contactCooldown = this.simTime + 700;
        const shieldMultiplier = this.hero.sealUntil > this.simTime ? 0.4 : 1;
        this.hero.hp -= (enemy.type === 'boss' ? 42 : 13) * shieldMultiplier;
        if (this.hero.hp <= 0) this.killHero();
      }
      if (enemy.progress >= this.routeTotal) this.enemyReachedCrystal(enemy);
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive);
  }

  private enemyReachedCrystal(enemy: EnemyUnit): void {
    this.lives = loseLives(this.lives, ENEMIES[enemy.type].crystalDamage);
    this.destroyEnemy(enemy, false);
    this.cameraFlash(0xff486c);
    if (this.lives <= 0) this.finish('defeat');
  }

  private destroyEnemy(enemy: EnemyUnit, rewarded: boolean): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    if (rewarded) {
      this.gold += ENEMIES[enemy.type].reward;
      this.hero.xp += enemy.type === 'boss' ? 240 : 18;
      this.updateHeroLevel();
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
      const targetSnapshot = selectTarget(inRange.map((enemy) => ({ id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp, progress: enemy.progress, flying: ENEMIES[enemy.type].flying, alive: enemy.alive })), tower.targetMode, definition.canTargetAir);
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
    this.projectiles.push({ view, target, damage, speed: tower.type === 'siege' ? 360 : 620, splash, slow, color });
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
      this.hitEnemy(enemy, projectile.damage, false);
      if (projectile.slow > 0) {
        enemy.slow = Math.max(enemy.slow, projectile.slow);
        enemy.slowUntil = this.simTime + 2200;
      }
    });
    const burst = this.add.circle(center.x, center.y, 8, projectile.color, 0.7).setDepth(29);
    this.tweens.add({ targets: burst, scale: 3.5, alpha: 0, duration: 180, onComplete: () => burst.destroy() });
    emit('td:sound', 'hit');
  }

  private hitEnemy(enemy: EnemyUnit, rawDamage: number, magic: boolean): void {
    if (!enemy.alive) return;
    const armor = magic ? ENEMIES[enemy.type].armor * 0.2 : ENEMIES[enemy.type].armor;
    const shield = enemy.type === 'boss' && enemy.shieldUntil > this.simTime ? 0.3 : 1;
    enemy.hp -= applyArmor(rawDamage, armor) * shield;
    this.drawEnemyHealth(enemy);
    if (enemy.hp <= 0) this.destroyEnemy(enemy, true);
  }

  private updateHero(delta: number): void {
    if (!this.hero.alive) {
      if (this.simTime >= this.hero.respawnAt) this.respawnHero();
      return;
    }
    this.hero.mana = Math.min(HERO.maxMana, this.hero.mana + HERO.manaRegen * delta / 1000);
    const moveDistance = distance(this.hero, this.hero.target);
    if (moveDistance > 3) {
      const travel = Math.min(moveDistance, HERO.speed * (TEST_MODE ? 2 : 1) * delta / 1000);
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, this.hero.target.x, this.hero.target.y);
      this.hero.x += Math.cos(angle) * travel;
      this.hero.y += Math.sin(angle) * travel;
      this.hero.container.setPosition(this.hero.x, this.hero.y);
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
    const candidates = this.enemies.map((enemy) => ({ id: enemy.id, x: enemy.container.x, y: enemy.container.y, hp: enemy.hp, maxHp: enemy.maxHp, progress: enemy.progress, flying: ENEMIES[enemy.type].flying, alive: enemy.alive }));
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
    const move = 0.42 * delta / camera.zoom;
    if (this.keys.A.isDown) camera.scrollX -= move;
    if (this.keys.D.isDown) camera.scrollX += move;
    if (this.keys.W.isDown && !Phaser.Input.Keyboard.JustDown(this.keys.W)) camera.scrollY -= move;
    if (this.keys.S.isDown) camera.scrollY += move;
    const wheelHandler = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      camera.zoom = Phaser.Math.Clamp(camera.zoom - dy * 0.0005, 0.8, 1.35);
    };
    if (!(this as any)._wheelBound) {
      this.input.on('wheel', wheelHandler);
      (this as any)._wheelBound = true;
    }
  }

  private togglePause(): void {
    if (!this.started || this.result !== 'playing') return;
    this.paused = !this.paused;
    this.emitHud(true);
  }

  private cameraFlash(color: number): void {
    this.cameras.main.flash(220, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
  }

  private finish(result: 'victory' | 'defeat'): void {
    if (this.result !== 'playing') return;
    this.result = result;
    this.paused = false;
    const previous = Number(localStorage.getItem('rift-best-wave') ?? 0);
    localStorage.setItem('rift-best-wave', String(Math.max(previous, this.currentWave)));
    emit('td:sound', result);
    this.emitHud(true);
  }

  private skipToBoss(): void {
    if (!TEST_MODE) return;
    this.spawnQueue = [];
    this.enemies.forEach((enemy) => this.destroyEnemy(enemy, false));
    this.enemies = [];
    this.currentWave = 9;
    this.waveActive = false;
    this.countdown = 0;
    this.startNextWave(false);
  }

  private getHudState(): HudState {
    const selected = this.selectedTower;
    const definition = selected ? TOWERS[selected.type] : null;
    const nextXp = this.hero.level === 1 ? 100 : this.hero.level === 2 ? 240 : 240;
    const boss = this.enemies.find((enemy) => enemy.type === 'boss' && enemy.alive);
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
      paused: this.paused, speed: this.speed, buildType: this.buildType, placementMessage: this.placementMessage,
      selectedTower: selected && definition ? {
        name: definition.name, level: selected.level, mode: selected.targetMode === 'first' ? 'Первая по пути' : 'Самая сильная',
        nextCost: definition.levels[selected.level - 1].upgradeCost,
        sellValue: sellValue(definition.cost, selected.paidUpgrades), description: definition.description,
      } : null,
      hero: {
        hp: Math.max(0, this.hero.hp), maxHp: HERO.maxHp, mana: this.hero.mana, maxMana: HERO.maxMana, xp: this.hero.xp,
        xpNext: nextXp, level: this.hero.level, alive: this.hero.alive, respawn: Math.max(0, (this.hero.respawnAt - this.simTime) / 1000),
        abilities: { q: abilityState('q'), w: abilityState('w'), e: abilityState('e'), r: abilityState('r') },
      },
      boss: boss ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: boss.phase, shielded: boss.shieldUntil > this.simTime } : null,
      result: this.result,
    };
  }

  private emitHud(force = false): void {
    if (!force && this.simTime - this.lastHudAt < 100) return;
    this.lastHudAt = this.simTime;
    emit('td:state', this.getHudState());
  }
}
