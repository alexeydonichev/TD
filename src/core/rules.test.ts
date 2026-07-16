import { describe, expect, it } from 'vitest';
import {
  applyArmor, applySlow, awardGold, buy, canPlaceTower, chainTargets, isWaveComplete, loseLives,
  matchResult, placementFailure, pointToLineDistance, selectTarget, sellValue, upgrade,
} from './rules';
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
});

describe('состояние матча', () => {
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
    expect(matchResult({ wave: 10, finalWave: 10, queuedEnemies: 0, activeEnemies: 0, crystalLives: 1, ended: true })).toBe('victory');
    expect(matchResult({ wave: 10, finalWave: 10, queuedEnemies: 0, activeEnemies: 1, crystalLives: 1, ended: true })).toBe('playing');
  });

  it('определяет поражение при разрушении Кристалла', () => {
    expect(matchResult({ wave: 2, finalWave: 10, queuedEnemies: 5, activeEnemies: 2, crystalLives: 0, ended: false })).toBe('defeat');
  });
});

describe('способности героя', () => {
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
