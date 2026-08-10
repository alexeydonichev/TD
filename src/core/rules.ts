import type { DifficultyDefinition, EnemyDefinition, EnemyType, MatchSnapshot, PlacementContext, Point, TargetMode, TargetSnapshot, WaveSpawn } from './types';

export type PlacementFailure = 'outside' | 'path' | 'crystal' | 'forbidden' | 'occupied' | 'gold';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / lengthSquared));
  return distance(point, { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) });
}

export function placementFailure(context: PlacementContext): PlacementFailure | null {
  const { point, edgePadding, towerRadius } = context;
  if (point.x < edgePadding || point.x > context.mapWidth - edgePadding || point.y < edgePadding || point.y > context.mapHeight - edgePadding) return 'outside';
  for (let index = 0; index < context.path.length - 1; index += 1) {
    if (pointSegmentDistance(point, context.path[index], context.path[index + 1]) < context.pathHalfWidth + towerRadius) return 'path';
  }
  if (distance(point, context.crystal) < context.crystalRadius + towerRadius) return 'crystal';
  if (context.forbidden.some((zone) => distance(point, zone) < zone.radius + towerRadius)) return 'forbidden';
  if (context.towers.some((tower) => distance(point, tower) < tower.radius + towerRadius)) return 'occupied';
  if (context.gold < context.cost) return 'gold';
  return null;
}

export function canPlaceTower(context: PlacementContext): boolean {
  return placementFailure(context) === null;
}

export function applyArmor(rawDamage: number, armor: number): number {
  const normalizedArmor = Math.max(-50, armor);
  const multiplier = normalizedArmor >= 0 ? 100 / (100 + normalizedArmor) : 2 - 100 / (100 - normalizedArmor);
  return Math.max(0, rawDamage * multiplier);
}

export function damageOutcome(hp: number, rawDamage: number, armor: number, damageMultiplier = 1): { dealt: number; hp: number; killed: boolean } {
  const currentHp = Math.max(0, hp);
  const dealt = Math.min(currentHp, applyArmor(rawDamage, armor) * Math.max(0, damageMultiplier));
  const remainingHp = Math.max(0, currentHp - dealt);
  return { dealt, hp: remainingHp, killed: currentHp > 0 && remainingHp <= 0 };
}

export function applySlow(baseSpeed: number, slow: number): number {
  return baseSpeed * (1 - Math.max(0, Math.min(0.65, slow)));
}

export function selectTarget(targets: TargetSnapshot[], mode: TargetMode, canTargetAir: boolean): TargetSnapshot | null {
  const candidates = targets.filter((target) => target.alive && (canTargetAir || !target.flying));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => mode === 'first' ? b.progress - a.progress : b.maxHp - a.maxHp || b.hp - a.hp)[0];
}

export function buy(gold: number, cost: number): { ok: boolean; gold: number } {
  return gold >= cost ? { ok: true, gold: gold - cost } : { ok: false, gold };
}

export function upgrade(gold: number, level: number, costs: [number, number]): { ok: boolean; gold: number; level: number } {
  if (level >= 3) return { ok: false, gold, level };
  const cost = costs[level - 1];
  return gold >= cost ? { ok: true, gold: gold - cost, level: level + 1 } : { ok: false, gold, level };
}

export function sellValue(baseCost: number, paidUpgrades: number[]): number {
  return Math.floor((baseCost + paidUpgrades.reduce((sum, value) => sum + value, 0)) * 0.7);
}

export function awardGold(gold: number, enemyReward = 0, waveReward = 0, earlyBonus = 0): number {
  return gold + Math.max(0, enemyReward) + Math.max(0, waveReward) + Math.max(0, earlyBonus);
}

export function earlyStartBonus(seconds: number, goldPerSecond: number): number {
  return Math.floor(Math.max(0, seconds) * Math.max(0, goldPerSecond));
}

export function waveRoster(spawns: WaveSpawn[]): Array<{ type: EnemyType; count: number }> {
  const counts = new Map<EnemyType, number>();
  for (const spawn of spawns) {
    counts.set(spawn.type, (counts.get(spawn.type) ?? 0) + Math.max(0, Math.floor(spawn.count)));
  }
  return [...counts].filter(([, count]) => count > 0).map(([type, count]) => ({ type, count }));
}

export function loseLives(lives: number, damage: number): number {
  return Math.max(0, lives - Math.max(0, damage));
}

export function isWaveComplete(queuedEnemies: number, activeEnemies: number): boolean {
  return queuedEnemies === 0 && activeEnemies === 0;
}

export function matchResult(snapshot: MatchSnapshot): 'playing' | 'victory' | 'defeat' {
  if (snapshot.crystalLives <= 0) return 'defeat';
  if (snapshot.ended && snapshot.wave === snapshot.finalWave && isWaveComplete(snapshot.queuedEnemies, snapshot.activeEnemies)) return 'victory';
  return 'playing';
}

export function chainTargets(origin: Point, targets: Array<TargetSnapshot & Point>, maxTargets: number, jumpRange: number): number[] {
  const result: number[] = [];
  let cursor = origin;
  const remaining = targets.filter((target) => target.alive);
  while (result.length < maxTargets) {
    remaining.sort((a, b) => distance(cursor, a) - distance(cursor, b));
    const next = remaining.find((target) => distance(cursor, target) <= jumpRange);
    if (!next) break;
    result.push(next.id);
    cursor = next;
    remaining.splice(remaining.indexOf(next), 1);
  }
  return result;
}

export function pointToLineDistance(point: Point, from: Point, to: Point): number {
  return pointSegmentDistance(point, from, to);
}

export function dashDestination(origin: Point, input: Point, focus: Point | null, pointer: Point, maxDistance: number): Point {
  const inputLength = Math.hypot(input.x, input.y);
  const target = inputLength > 0
    ? { x: origin.x + input.x / inputLength * maxDistance, y: origin.y + input.y / inputLength * maxDistance }
    : focus ?? pointer;
  const targetDistance = distance(origin, target);
  if (targetDistance <= maxDistance || targetDistance === 0) return { ...target };
  return {
    x: origin.x + (target.x - origin.x) / targetDistance * maxDistance,
    y: origin.y + (target.y - origin.y) / targetDistance * maxDistance,
  };
}

export function scaleEnemy(definition: EnemyDefinition, difficulty: DifficultyDefinition): EnemyDefinition {
  return {
    ...definition,
    maxHp: Math.round(definition.maxHp * difficulty.enemyHp),
    speed: definition.speed * difficulty.enemySpeed,
    reward: Math.max(1, Math.round(definition.reward * difficulty.enemyReward)),
  };
}

export function waveHpMultiplier(wave: number): number {
  return 1 + Math.min(19, Math.max(0, Math.floor(wave) - 1)) * 0.025;
}

export function waveSpeedMultiplier(wave: number): number {
  return 1 + Math.min(19, Math.max(0, Math.floor(wave) - 1)) * 0.008;
}
