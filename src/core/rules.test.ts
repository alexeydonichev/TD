import { describe, expect, it } from 'vitest';
import {
  applyArmor, applySlow, awardGold, buy, canPlaceTower, chainTargets, damageOutcome, dashDestination, earlyStartBonus, isWaveComplete, loseLives,
  matchResult, placementFailure, pointToLineDistance, scaleEnemy, selectTarget, sellValue, snapToGrid, upgrade,
  waveClearReward, waveHpMultiplier, waveRoster, waveSpeedMultiplier,
} from './rules';
import { DIFFICULTIES, ENEMIES, WAVES } from './config';
import type { PlacementContext } from './types';

const placement = (overrides: Partial<PlacementContext> = {}): PlacementContext => ({
  point: { x: 200, y: 200 }, mapWidth: 500, mapHeight: 400, edgePadding: 30, towerRadius: 20,
  gold: 200, cost: 100, path: [{ x: 20, y: 100 }, { x: 480, y: 100 }], pathHalfWidth: 25,
  crystal: { x: 450, y: 350 }, crystalRadius: 35, forbidden: [{ x: 330, y: 220, radius: 35 }],
  towers: [{ x: 100, y: 220, radius: 20 }], ...overrides,
});

describe('боевые формулы', () => {
  it('уменьшает физический урон бронёй и не создаёт отрицательный урон', () => {
    expect(applyArmor(100, 25)).toBeCloseTo(80);
    expect(applyArmor(-10, 25)).toBe(0);
    expect(applyArmor(100, -25)).toBeGreaterThan(100);
  });

  it('считает только фактически нанесённый урон без избыточного добивания', () => {
    expect(damageOutcome(50, 100, 0)).toEqual({ dealt: 50, hp: 0, killed: true });
    expect(damageOutcome(100, 100, 0, 0.3)).toEqual({ dealt: 30, hp: 70, killed: false });
    expect(damageOutcome(0, 100, 0)).toEqual({ dealt: 0, hp: 0, killed: false });
  });

  it('ограничивает замедление безопасным максимумом', () => {
    expect(applySlow(100, 0.3)).toBeCloseTo(70);
    expect(applySlow(100, 2)).toBeCloseTo(35);
    expect(applySlow(100, -1)).toBe(100);
  });

  it('выбирает первую или самую сильную допустимую цель', () => {
    const targets = [
      { id: 1, hp: 50, maxHp: 100, progress: 80, flying: false, alive: true },
      { id: 2, hp: 300, maxHp: 500, progress: 20, flying: false, alive: true },
      { id: 3, hp: 600, maxHp: 600, progress: 99, flying: true, alive: true },
    ];
    expect(selectTarget(targets, 'first', false)?.id).toBe(1);
    expect(selectTarget(targets, 'strongest', false)?.id).toBe(2);
    expect(selectTarget(targets, 'strongest', true)?.id).toBe(3);
  });
});

describe('строительство и экономика', () => {
  it('разрешает корректную установку и покупку', () => {
    expect(canPlaceTower(placement())).toBe(true);
    expect(buy(200, 100)).toEqual({ ok: true, gold: 100 });
    expect(buy(50, 100)).toEqual({ ok: false, gold: 50 });
  });

  it('привязывает строительство к видимой сетке и удерживает край карты', () => {
    expect(snapToGrid({ x: 374, y: 226 }, 50, 50, 50, 1150, 650)).toEqual({ x: 350, y: 250 });
    expect(snapToGrid({ x: -20, y: 900 }, 50, 50, 50, 1150, 650)).toEqual({ x: 50, y: 650 });
  });

  it.each([
    [{ point: { x: 10, y: 200 } }, 'outside'],
    [{ point: { x: 200, y: 105 } }, 'path'],
    [{ point: { x: 445, y: 350 } }, 'crystal'],
    [{ point: { x: 330, y: 220 } }, 'forbidden'],
    [{ point: { x: 105, y: 220 } }, 'occupied'],
    [{ gold: 10 }, 'gold'],
  ])('запрещает установку: %s', (overrides, reason) => {
    expect(placementFailure(placement(overrides))).toBe(reason);
  });

  it('улучшает только при наличии золота и не выше третьего уровня', () => {
    expect(upgrade(200, 1, [80, 120])).toEqual({ ok: true, gold: 120, level: 2 });
    expect(upgrade(20, 2, [80, 120])).toEqual({ ok: false, gold: 20, level: 2 });
    expect(upgrade(500, 3, [80, 120])).toEqual({ ok: false, gold: 500, level: 3 });
  });

  it('возвращает 70% всех вложений при продаже', () => {
    expect(sellValue(100, [80, 120])).toBe(210);
  });

  it('начисляет золото за врага, волну и ранний старт', () => {
    expect(awardGold(100, 16, 35, 12)).toBe(163);
  });

  it('округляет бонус раннего старта так же для HUD и экономики', () => {
    expect(earlyStartBonus(11.9, 2)).toBe(23);
    expect(earlyStartBonus(-4, 2)).toBe(0);
    expect(earlyStartBonus(10, -2)).toBe(0);
  });

  it('объединяет повторяющиеся группы в брифинге волны', () => {
    expect(waveRoster([
      { type: 'raider', count: 3, gapMs: 500 },
      { type: 'runner', count: 2, gapMs: 300 },
      { type: 'raider', count: 4, gapMs: 400 },
    ])).toEqual([{ type: 'raider', count: 7 }, { type: 'runner', count: 2 }]);
  });
});

describe('состояние матча', () => {
  it('содержит 20 волн и боссов на 7-й, 14-й и 20-й', () => {
    expect(WAVES).toHaveLength(20);
    const bossTypes = new Set(['warden', 'titan', 'boss']);
    const bossWaves = WAVES.flatMap((wave, index) => wave.spawns.some((spawn) => bossTypes.has(spawn.type)) ? [index + 1] : []);
    expect(bossWaves).toEqual([7, 14, 20]);
  });

  it('завершает волну только после очистки очереди и карты', () => {
    expect(isWaveComplete(0, 0)).toBe(true);
    expect(isWaveComplete(1, 0)).toBe(false);
    expect(isWaveComplete(0, 1)).toBe(false);
  });

  it('снимает жизни без ухода ниже нуля', () => {
    expect(loseLives(20, 3)).toBe(17);
    expect(loseLives(2, 8)).toBe(0);
  });

  it('определяет победу только после финальной очищенной волны', () => {
    expect(matchResult({ wave: 20, finalWave: 20, queuedEnemies: 0, activeEnemies: 0, crystalLives: 1, ended: true })).toBe('victory');
    expect(matchResult({ wave: 20, finalWave: 20, queuedEnemies: 0, activeEnemies: 1, crystalLives: 1, ended: true })).toBe('playing');
  });

  it('определяет поражение при разрушении Кристалла', () => {
    expect(matchResult({ wave: 2, finalWave: 10, queuedEnemies: 5, activeEnemies: 2, crystalLives: 0, ended: false })).toBe('defeat');
  });
});

describe('способности героя', () => {
  it('направляет рывок по приоритету WASD, фокус, курсор', () => {
    const origin = { x: 100, y: 100 };
    expect(dashDestination(origin, { x: -1, y: 0 }, { x: 500, y: 500 }, { x: 400, y: 100 }, 270)).toEqual({ x: -170, y: 100 });
    expect(dashDestination(origin, { x: 0, y: 0 }, { x: 200, y: 100 }, { x: 500, y: 100 }, 270)).toEqual({ x: 200, y: 100 });
    expect(dashDestination(origin, { x: 0, y: 0 }, null, { x: 500, y: 100 }, 270)).toEqual({ x: 370, y: 100 });
  });

  it('цепная молния не повторяет цели и соблюдает дальность прыжка', () => {
    const targets = [
      { id: 1, x: 40, y: 0, hp: 10, maxHp: 10, progress: 0, flying: false, alive: true },
      { id: 2, x: 80, y: 0, hp: 10, maxHp: 10, progress: 0, flying: true, alive: true },
      { id: 3, x: 500, y: 0, hp: 10, maxHp: 10, progress: 0, flying: false, alive: true },
    ];
    expect(chainTargets({ x: 0, y: 0 }, targets, 5, 50)).toEqual([1, 2]);
  });

  it('рывок поражает только цели рядом с траекторией', () => {
    expect(pointToLineDistance({ x: 50, y: 8 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(8);
    expect(pointToLineDistance({ x: 50, y: 80 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(80);
  });
});

describe('режимы сложности', () => {
  it('каждый режим задаёт собственный темп и правила героя', () => {
    expect(DIFFICULTIES.standard).toMatchObject({
      heroDamage: 1, heroSpeed: 1, heroManaRegen: 1, heroDamageTaken: 1,
      heroRespawn: 1, intermission: 1, bossShield: 1, earlyStartGold: 1,
      lateEnemyReward: 1, waveReward: 1, waveHpGrowth: 1, waveSpeedGrowth: 1,
    });
    expect(DIFFICULTIES.story.heroDamage).toBeGreaterThan(1);
    expect(DIFFICULTIES.story.heroDamageTaken).toBeLessThan(1);
    expect(DIFFICULTIES.story.intermission).toBeGreaterThan(1);
    expect(DIFFICULTIES.rift.heroManaRegen).toBeLessThan(1);
    expect(DIFFICULTIES.rift.heroDamageTaken).toBeGreaterThan(1);
    expect(DIFFICULTIES.rift.bossShield).toBeGreaterThan(1);
    Object.values(DIFFICULTIES).forEach((difficulty) => expect(difficulty.rules).toHaveLength(3));
  });

  it('плавно усиливает здоровье и скорость врагов к двадцатой волне', () => {
    expect(waveHpMultiplier(1)).toBe(1);
    expect(waveHpMultiplier(20)).toBeCloseTo(1.475);
    expect(waveSpeedMultiplier(20)).toBeCloseTo(1.152);
    expect(waveHpMultiplier(100)).toBeCloseTo(1.475);
    expect(waveHpMultiplier(20, DIFFICULTIES.rift.waveHpGrowth)).toBeGreaterThan(waveHpMultiplier(20));
    expect(waveSpeedMultiplier(20, DIFFICULTIES.story.waveSpeedGrowth)).toBeLessThan(waveSpeedMultiplier(20));
  });

  it('сюжетный режим ослабляет врага и повышает награду', () => {
    const scaled = scaleEnemy(ENEMIES.raider, DIFFICULTIES.story);
    expect(scaled.maxHp).toBeLessThan(ENEMIES.raider.maxHp);
    expect(scaled.speed).toBeLessThan(ENEMIES.raider.speed);
    expect(scaled.reward).toBeGreaterThan(ENEMIES.raider.reward);
  });

  it('Разлом усиливает здоровье и скорость, сохраняя положительную награду', () => {
    const scaled = scaleEnemy(ENEMIES.brute, DIFFICULTIES.rift, 20);
    expect(scaled.maxHp).toBeGreaterThan(ENEMIES.brute.maxHp);
    expect(scaled.speed).toBeGreaterThan(ENEMIES.brute.speed);
    expect(scaled.reward).toBeGreaterThan(0);
  });

  it('режим Разлома не допускает денежный снежный ком к финалу', () => {
    const campaignIncome = WAVES.reduce((sum, wave, index) => {
      const killIncome = wave.spawns.reduce((waveSum, spawn) => (
        waveSum + spawn.count * scaleEnemy(ENEMIES[spawn.type], DIFFICULTIES.rift, index + 1).reward
      ), 0);
      return sum + killIncome + waveClearReward(wave.reward, DIFFICULTIES.rift);
    }, DIFFICULTIES.rift.startingGold);
    const standardIncome = WAVES.reduce((sum, wave, index) => {
      const killIncome = wave.spawns.reduce((waveSum, spawn) => (
        waveSum + spawn.count * scaleEnemy(ENEMIES[spawn.type], DIFFICULTIES.standard, index + 1).reward
      ), 0);
      return sum + killIncome + waveClearReward(wave.reward, DIFFICULTIES.standard);
    }, DIFFICULTIES.standard.startingGold);

    expect(campaignIncome).toBeGreaterThan(9_000);
    expect(campaignIncome).toBeLessThan(10_500);
    expect(campaignIncome / standardIncome).toBeLessThan(0.58);
    expect(scaleEnemy(ENEMIES.raider, DIFFICULTIES.rift, 20).reward)
      .toBeLessThan(scaleEnemy(ENEMIES.raider, DIFFICULTIES.rift, 1).reward);
    expect(waveClearReward(WAVES[19].reward, DIFFICULTIES.rift)).toBe(160);
  });
});
