import { describe, expect, it } from 'vitest';
import {
  absorbShield, applyArmor, applySlow, awardGold, buy, canPlaceTower, chainTargets, damageAffinityMultiplier, damageOutcome, dashDestination, distanceToPath, earlyStartBonus,
  eliteAffixForSpawn, eliteCadence, expectedEliteCount, heroLevelForXp, heroParticipationCap, heroParticipationXp, heroProgression, heroWaveClearXp, isWaveComplete, loseLives, matchResult, placementFailure, pointToLineDistance, roundedPath,
  scaleEnemy, selectTarget, sellValue, slowEffectMultiplier, snapToGrid, tacticalIncomeMultiplier, upgrade,
  waveClearReward, waveHpMultiplier, waveRoster, waveSpeedMultiplier,
} from './rules';
import { DIFFICULTIES, ELITES, ENEMIES, HERO_LEVELS, HERO_MECHANICS, HERO_OVERCHARGE, MAP_ORDER, MAPS, TOWERS, WAVES } from './config';
import type { PlacementContext } from './types';

const placement = (overrides: Partial<PlacementContext> = {}): PlacementContext => ({
  point: { x: 200, y: 200 }, mapWidth: 500, mapHeight: 400, edgePadding: 30, towerRadius: 20,
  gold: 200, cost: 100, path: [{ x: 20, y: 100 }, { x: 480, y: 100 }], pathHalfWidth: 25,
  crystal: { x: 450, y: 350 }, crystalRadius: 35, forbidden: [{ x: 330, y: 220, radius: 35 }],
  towers: [{ x: 100, y: 220, radius: 20 }], ...overrides,
});

describe('визуальная эволюция башен', () => {
  it('увеличивает число стрел и ледяных осколков на каждом уровне', () => {
    expect(TOWERS.archer.levels.map((level) => level.projectileCount)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(TOWERS.frost.levels.map((level) => level.projectileCount)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('делает осадное ядро тяжелее без скрытого умножения числа попаданий', () => {
    expect(TOWERS.siege.levels.map((level) => level.projectileCount)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(TOWERS.siege.levels.map((level) => level.projectileScale)).toEqual([0.92, 1.18, 1.52, 1.82, 2.14, 2.5]);
  });

  it('открывает уникальные свойства поздних уровней', () => {
    expect(TOWERS.archer.levels[5].armorPierce).toBe(0.35);
    expect(TOWERS.frost.levels.map((level) => level.slow ?? TOWERS.frost.slow)).toEqual([0.32, 0.34, 0.36, 0.39, 0.43, 0.48]);
    expect(TOWERS.siege.levels[5].splash).toBe(118);
    expect(TOWERS.boost.levels[5]).toMatchObject({ range: 260, damageBoost: 1.48, attackSpeedBoost: 1.22 });
  });
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

  it('сначала расходует элитный щит и передаёт остаток в здоровье', () => {
    expect(absorbShield(100, 35)).toEqual({ absorbed: 35, remainingDamage: 65, shield: 0 });
    expect(absorbShield(20, 35)).toEqual({ absorbed: 20, remainingDamage: 0, shield: 15 });
    expect(absorbShield(-5, -10)).toEqual({ absorbed: 0, remainingDamage: 0, shield: 0 });
  });

  it('сохраняет суммарный урон залпа при одинаковой броне каждого снаряда', () => {
    const single = damageOutcome(100, 60, 30);
    let hp = 100;
    let dealt = 0;
    for (let projectile = 0; projectile < 3; projectile += 1) {
      const hit = damageOutcome(hp, 60 / 3, 30);
      hp = hit.hp;
      dealt += hit.dealt;
    }
    expect(hp).toBeCloseTo(single.hp);
    expect(dealt).toBeCloseTo(single.dealt);
  });

  it('ограничивает замедление безопасным максимумом', () => {
    expect(applySlow(100, 0.3)).toBeCloseTo(70);
    expect(applySlow(100, 2)).toBeCloseTo(35);
    expect(applySlow(100, -1)).toBe(100);
  });

  it('создаёт контр-типы вместо универсального лучшего урона', () => {
    expect(damageAffinityMultiplier('brute', null, 'arrow', 'rift')).toBeCloseTo(0.58);
    expect(damageAffinityMultiplier('brute', null, 'frost', 'rift')).toBeCloseTo(1.3);
    expect(damageAffinityMultiplier('runner', null, 'siege', 'rift')).toBeCloseTo(1.35);
    expect(damageAffinityMultiplier('winged', null, 'arrow', 'rift')).toBeCloseTo(1.35);
    expect(damageAffinityMultiplier('boss', null, 'storm', 'rift')).toBeCloseTo(0.6);
    expect(damageAffinityMultiplier('brute', null, 'arrow', 'story')).toBeGreaterThan(0.8);
  });

  it('делает Нулификатора целью для осады и ослабляет контроль', () => {
    expect(damageAffinityMultiplier('brute', 'nullifier', 'siege', 'rift')).toBeCloseTo(1.7825);
    expect(damageAffinityMultiplier('brute', 'nullifier', 'storm', 'rift')).toBeCloseTo(0.38);
    expect(slowEffectMultiplier('brute', 'nullifier')).toBe(0.25);
    expect(slowEffectMultiplier('boss', null)).toBe(0.45);
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

  it('улучшает только при наличии золота и не выше настроенного максимума', () => {
    const costs = [80, 120, 200, 320, 500];
    expect(upgrade(200, 1, costs)).toEqual({ ok: true, gold: 120, level: 2 });
    expect(upgrade(20, 2, costs)).toEqual({ ok: false, gold: 20, level: 2 });
    expect(upgrade(900, 5, costs)).toEqual({ ok: true, gold: 400, level: 6 });
    expect(upgrade(900, 6, costs)).toEqual({ ok: false, gold: 900, level: 6 });
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

  it('раскрывает полный доход Разлома только тремя боевыми доктринами', () => {
    expect(tacticalIncomeMultiplier('standard', ['archer'])).toBe(1);
    expect(tacticalIncomeMultiplier('rift', [])).toBe(0.5);
    expect(tacticalIncomeMultiplier('rift', ['archer', 'boost'])).toBe(0.62);
    expect(tacticalIncomeMultiplier('rift', ['archer', 'frost', 'boost'])).toBe(0.8);
    expect(tacticalIncomeMultiplier('rift', ['archer', 'frost', 'siege'])).toBe(1);
  });
});

describe('состояние матча', () => {
  it('содержит 20 волн и боссов на 7-й, 14-й и 20-й', () => {
    expect(WAVES).toHaveLength(20);
    const bossTypes = new Set(['warden', 'titan', 'boss']);
    const bossWaves = WAVES.flatMap((wave, index) => wave.spawns.some((spawn) => bossTypes.has(spawn.type)) ? [index + 1] : []);
    expect(bossWaves).toEqual([7, 14, 20]);
  });

  it('начиная с пятой волны сводит разные угрозы одновременно', () => {
    WAVES.slice(4).forEach((wave) => {
      expect(wave.spawns.some((spawn) => spawn.startMs !== undefined)).toBe(true);
    });
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

describe('элитные мутации', () => {
  it('повышает частоту элиты вместе со сложностью и только после третьей волны', () => {
    expect(eliteCadence('story')).toBe(12);
    expect(eliteCadence('standard')).toBe(9);
    expect(eliteCadence('rift')).toBe(5);
    expect(expectedEliteCount(3, 40, 'rift')).toBe(0);
    expect(expectedEliteCount(14, 40, 'rift')).toBe(8);
  });

  it('не превращает боссов в элиту и постепенно открывает четыре свойства', () => {
    expect(eliteAffixForSpawn(4, 5, 'rift', 'boss')).toBeNull();
    expect(eliteAffixForSpawn(4, 5, 'rift', 'raider')).toBe('swift');
    const lateAffixes = new Set([5, 10, 15, 20].map((index) => eliteAffixForSpawn(14, index, 'rift', 'raider')));
    expect(lateAffixes).toEqual(new Set(['swift', 'bulwark', 'regenerator', 'nullifier']));
    expect(eliteAffixForSpawn(14, 5, 'rift', 'winged')).not.toBe('nullifier');
  });

  it('делает элиту опаснее, но всегда повышает награду', () => {
    Object.values(ELITES).forEach((elite) => {
      expect(elite.hpMultiplier).toBeGreaterThan(1);
      expect(elite.rewardMultiplier).toBeGreaterThan(1);
    });
    expect(ELITES.bulwark.shieldRatio).toBeGreaterThan(0);
    expect(ELITES.regenerator.regeneration).toBeGreaterThan(0);
  });
});

describe('способности героя', () => {
  it('даёт герою десять уровней с возрастающей ценой', () => {
    expect(HERO_LEVELS).toHaveLength(10);
    expect(HERO_LEVELS.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(HERO_LEVELS.map((entry) => entry.xp)).toEqual([0, 80, 190, 330, 500, 700, 930, 1190, 1480, 1800]);
    expect(heroLevelForXp(0)).toBe(1);
    expect(heroLevelForXp(189)).toBe(2);
    expect(heroLevelForXp(1800)).toBe(10);
  });

  it('связывает XP с волнами, боссами и активным участием', () => {
    const guaranteedCampaignXp = Array.from({ length: 20 }, (_, index) => heroWaveClearXp(index + 1)).reduce((sum, xp) => sum + xp, 0);
    const maximumParticipationXp = Array.from({ length: 20 }, (_, index) => heroParticipationCap(index + 1)).reduce((sum, xp) => sum + xp, 0);
    const guaranteedBeforeFirstBoss = Array.from({ length: 6 }, (_, index) => heroWaveClearXp(index + 1)).reduce((sum, xp) => sum + xp, 0);
    const guaranteedAfterSecondBoss = Array.from({ length: 14 }, (_, index) => heroWaveClearXp(index + 1)).reduce((sum, xp) => sum + xp, 0);
    expect(guaranteedBeforeFirstBoss).toBe(210);
    expect(heroLevelForXp(guaranteedBeforeFirstBoss)).toBe(3);
    expect(guaranteedAfterSecondBoss).toBe(752);
    expect(heroLevelForXp(guaranteedAfterSecondBoss)).toBe(6);
    expect(guaranteedCampaignXp).toBe(1260);
    expect(heroLevelForXp(guaranteedCampaignXp)).toBe(8);
    expect(heroLevelForXp(guaranteedCampaignXp + maximumParticipationXp)).toBe(10);
    expect(heroParticipationXp('raider', null)).toBe(2);
    expect(heroParticipationXp('brute', 'bulwark')).toBe(8);
    expect(heroParticipationXp('boss', null)).toBe(50);
  });

  it('усиливает атаку, ресурсы и все четыре навыка к десятому уровню', () => {
    const first = heroProgression(1);
    const tenth = heroProgression(10);
    expect(tenth.maxHp).toBeGreaterThan(first.maxHp);
    expect(tenth.maxMana).toBeGreaterThan(first.maxMana);
    expect(tenth.attackDamageMultiplier).toBeGreaterThanOrEqual(1.58);
    expect(tenth.qChains).toBeGreaterThan(first.qChains);
    expect(tenth.dashDistance).toBeGreaterThan(first.dashDistance);
    expect(tenth.sealDamageMultiplier).toBeLessThan(first.sealDamageMultiplier);
    expect(tenth.stormRadius).toBeGreaterThan(first.stormRadius);
    expect(tenth.cooldownMultiplier).toBeLessThan(first.cooldownMultiplier);
  });

  it('задаёт читаемые боевые роли и связку Q → R', () => {
    expect(HERO_MECHANICS.conductiveDurationMs).toBe(5_000);
    expect(HERO_MECHANICS.conductiveStormMultiplier).toBe(1.25);
    expect(HERO_MECHANICS.dashPhaseMs).toBe(1_200);
    expect(HERO_MECHANICS.sealTowerDamageMultiplier).toBe(1.35);
    expect(HERO_MECHANICS.stormTickMs).toBe(500);
    expect(6_000 / HERO_MECHANICS.stormTickMs).toBe(12);
  });

  it('делает заработанную перегрузку коротким, но заметным окном силы', () => {
    expect(HERO_OVERCHARGE.durationMs).toBe(8_000);
    expect(HERO_OVERCHARGE.attackSpeedMultiplier).toBeGreaterThanOrEqual(1.35);
    expect(HERO_OVERCHARGE.damageMultiplier).toBeGreaterThanOrEqual(1.2);
    expect(HERO_OVERCHARGE.manaRegenMultiplier).toBeGreaterThanOrEqual(1.3);
  });

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
      enemyArmor: 1, lateEnemyReward: 1, waveReward: 1, waveHpGrowth: 1, waveSpeedGrowth: 1,
    });
    expect(DIFFICULTIES.story.heroDamage).toBeGreaterThan(1);
    expect(DIFFICULTIES.story.heroDamageTaken).toBeLessThan(1);
    expect(DIFFICULTIES.story.intermission).toBeGreaterThan(1);
    expect(DIFFICULTIES.rift.heroManaRegen).toBeLessThan(1);
    expect(DIFFICULTIES.rift.heroDamageTaken).toBeGreaterThan(1);
    expect(DIFFICULTIES.rift.bossShield).toBeGreaterThan(1);
    expect(DIFFICULTIES.rift.enemyHp).toBeGreaterThanOrEqual(1.7);
    expect(DIFFICULTIES.rift.enemyArmor).toBeGreaterThanOrEqual(1.18);
    expect(DIFFICULTIES.rift.lateEnemyReward).toBeLessThanOrEqual(0.38);
    expect(DIFFICULTIES.rift.crystalLives).toBe(8);
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

  it('экспертный режим резко увеличивает здоровье и заметно усиливает броню', () => {
    const scaled = scaleEnemy(ENEMIES.brute, DIFFICULTIES.rift, 20);
    expect(DIFFICULTIES.rift.enemyHp).toBe(1.7);
    expect(scaled.maxHp).toBe(Math.round(ENEMIES.brute.maxHp * 1.7));
    expect(scaled.armor).toBeCloseTo(ENEMIES.brute.armor * 1.18);
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

    expect(campaignIncome).toBeGreaterThan(7_000);
    expect(campaignIncome).toBeLessThan(9_000);
    expect(campaignIncome / standardIncome).toBeLessThan(0.5);
    expect(scaleEnemy(ENEMIES.raider, DIFFICULTIES.rift, 20).reward)
      .toBeLessThan(scaleEnemy(ENEMIES.raider, DIFFICULTIES.rift, 1).reward);
    expect(waveClearReward(WAVES[19].reward, DIFFICULTIES.rift)).toBe(144);
  });
});

describe('кампания из пяти карт', () => {
  it('задаёт пять самостоятельных маршрутов и фоновых ассетов', () => {
    expect(MAP_ORDER).toEqual(['valley', 'frozen', 'bastion', 'stormspire', 'abyss']);
    expect(new Set(MAP_ORDER.map((id) => MAPS[id].asset)).size).toBe(5);
    expect(new Set(MAP_ORDER.map((id) => JSON.stringify(MAPS[id].path))).size).toBe(5);
    MAP_ORDER.forEach((id, index) => {
      expect(MAPS[id].number).toBe(index + 1);
      expect(MAPS[id].path.length).toBeGreaterThanOrEqual(8);
      expect(MAPS[id].forbidden).toHaveLength(4);
    });
  });

  it('повышает давление и сокращает экономику на следующих картах', () => {
    const maps = MAP_ORDER.map((id) => MAPS[id]);
    for (let index = 1; index < maps.length; index += 1) {
      expect(maps[index].enemyHp).toBeGreaterThan(maps[index - 1].enemyHp);
      expect(maps[index].enemyArmor).toBeGreaterThan(maps[index - 1].enemyArmor);
      expect(maps[index].enemySpeed).toBeGreaterThan(maps[index - 1].enemySpeed);
      expect(maps[index].goldMultiplier).toBeLessThan(maps[index - 1].goldMultiplier);
      expect(maps[index].scoreMultiplier).toBeGreaterThan(maps[index - 1].scoreMultiplier);
    }
  });

  it('скругляет повороты внутри дорожного полотна без срезания маршрута', () => {
    const raw = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const route = roundedPath(raw, 30, 8);
    expect(route[0]).toEqual(raw[0]);
    expect(route.at(-1)).toEqual(raw.at(-1));
    expect(route.length).toBeGreaterThan(raw.length);
    expect(route.some((point) => point.x > 70 && point.x < 100 && point.y > 0 && point.y < 30)).toBe(true);
    route.forEach((point) => expect(distanceToPath(point, route)).toBeLessThan(0.001));
    expect(distanceToPath({ x: 50, y: 6 }, route)).toBeLessThanOrEqual(6);
  });
});
