import type { DifficultyDefinition, EnemyDefinition, EnemyType, MatchSnapshot, PlacementContext, Point, TargetMode, TargetSnapshot, WaveSpawn } from './types';

export type PlacementFailure = 'outside' | 'path' | 'crystal' | 'forbidden' | 'occupied' | 'gold';

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapToGrid(point: Point, size: number, minX = 0, minY = 0, maxX = Infinity, maxY = Infinity): Point {
  const safeSize = Math.max(1, size);
  return {
    x: Math.max(minX, Math.min(maxX, Math.round(point.x / safeSize) * safeSize)),
    y: Math.max(minY, Math.min(maxY, Math.round(point.y / safeSize) * safeSize)),
  };
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

export function upgrade(gold: number, level: number, costs: readonly number[]): { ok: boolean; gold: number; level: number } {
  if (level < 1 || level > costs.length) return { ok: false, gold, level };
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

export function waveProgress(wave: number): number {
  return Math.min(19, Math.max(0, Math.floor(wave) - 1)) / 19;
}

export function waveClearReward(baseReward: number, difficulty: DifficultyDefinition): number {
  return Math.max(0, Math.round(baseReward * difficulty.waveReward));
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

export function distanceToPath(point: Point, path: Point[]): number {
  if (!path.length) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return distance(point, path[0]);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    closest = Math.min(closest, pointSegmentDistance(point, path[index], path[index + 1]));
  }
  return closest;
}

export function roundedPath(points: Point[], cornerRadius = 30, samplesPerCorner = 8): Point[] {
  if (points.length < 3 || cornerRadius <= 0) return points.map((point) => ({ ...point }));
  const rounded: Point[] = [{ ...points[0] }];
  const samples = Math.max(2, Math.floor(samplesPerCorner));
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incomingLength = distance(previous, corner);
    const outgoingLength = distance(corner, next);
    if (incomingLength <= 0.001 || outgoingLength <= 0.001) continue;
    const incoming = { x: (corner.x - previous.x) / incomingLength, y: (corner.y - previous.y) / incomingLength };
    const outgoing = { x: (next.x - corner.x) / outgoingLength, y: (next.y - corner.y) / outgoingLength };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    if (Math.abs(cross) < 0.001) {
      rounded.push({ ...corner });
      continue;
    }
    const cut = Math.min(cornerRadius, incomingLength * 0.42, outgoingLength * 0.42);
    const entry = { x: corner.x - incoming.x * cut, y: corner.y - incoming.y * cut };
    const exit = { x: corner.x + outgoing.x * cut, y: corner.y + outgoing.y * cut };
    if (distance(rounded[rounded.length - 1], entry) > 0.01) rounded.push(entry);
    for (let sample = 1; sample <= samples; sample += 1) {
      const t = sample / samples;
      const inverse = 1 - t;
      rounded.push({
        x: inverse * inverse * entry.x + 2 * inverse * t * corner.x + t * t * exit.x,
        y: inverse * inverse * entry.y + 2 * inverse * t * corner.y + t * t * exit.y,
      });
    }
  }
  rounded.push({ ...points[points.length - 1] });
  return rounded;
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

export function scaleEnemy(definition: EnemyDefinition, difficulty: DifficultyDefinition, wave = 1): EnemyDefinition {
  const progress = waveProgress(wave);
  const rewardMultiplier = difficulty.enemyReward + (difficulty.lateEnemyReward - difficulty.enemyReward) * progress;
  return {
    ...definition,
    maxHp: Math.round(definition.maxHp * difficulty.enemyHp),
    armor: definition.armor * difficulty.enemyArmor,
    speed: definition.speed * difficulty.enemySpeed,
    reward: Math.max(1, Math.round(definition.reward * rewardMultiplier)),
  };
}

export function waveHpMultiplier(wave: number, growth = 1): number {
  return 1 + Math.min(19, Math.max(0, Math.floor(wave) - 1)) * 0.025 * Math.max(0, growth);
}

export function waveSpeedMultiplier(wave: number, growth = 1): number {
  return 1 + Math.min(19, Math.max(0, Math.floor(wave) - 1)) * 0.008 * Math.max(0, growth);
}
