import Phaser from 'phaser';
import { ELITES } from '../core/config';
import type { EliteType, Point } from '../core/types';

export function drawEliteAura(
  graphics: Phaser.GameObjects.Graphics,
  elite: EliteType | null,
  radius: number,
  shieldRatio: number,
): void {
  graphics.clear().setPosition(0, -7);
  if (!elite) return;
  const definition = ELITES[elite];
  const ring = radius + 11;
  graphics.fillStyle(definition.color, 0.08).fillCircle(0, 0, ring + 5)
    .lineStyle(5, definition.color, 0.16).strokeCircle(0, 0, ring + 2)
    .lineStyle(1.8, definition.color, 0.82).strokeCircle(0, 0, ring);

  if (elite === 'swift') {
    for (let mark = 0; mark < 3; mark += 1) {
      const y = (mark - 1) * 9;
      graphics.lineStyle(2.5, definition.color, 0.84 - mark * 0.12).beginPath()
        .moveTo(-ring - 10 - mark * 4, y - 5).lineTo(-ring - 3 - mark * 4, y).lineTo(-ring - 10 - mark * 4, y + 5).strokePath()
        .beginPath().moveTo(ring + 10 + mark * 4, y - 5).lineTo(ring + 3 + mark * 4, y).lineTo(ring + 10 + mark * 4, y + 5).strokePath();
    }
  } else if (elite === 'bulwark') {
    for (let rune = 0; rune < 6; rune += 1) {
      const angle = rune / 6 * Math.PI * 2;
      const x = Math.cos(angle) * (ring + 4);
      const y = Math.sin(angle) * (ring + 4);
      graphics.fillStyle(shieldRatio > 0 ? 0xd9fbff : definition.color, shieldRatio > 0 ? 0.9 : 0.34).fillPoints([
        { x, y: y - 4 }, { x: x + 4, y }, { x, y: y + 4 }, { x: x - 4, y },
      ], true);
    }
    if (shieldRatio > 0) graphics.lineStyle(4, 0xd9fbff, 0.68).strokeCircle(0, 0, ring - 4);
  } else if (elite === 'regenerator') {
    for (let leaf = 0; leaf < 8; leaf += 1) {
      const angle = leaf / 8 * Math.PI * 2;
      graphics.fillStyle(definition.color, 0.75).fillEllipse(
        Math.cos(angle) * (ring + 5), Math.sin(angle) * (ring + 5), 7, 3,
      );
    }
    graphics.lineStyle(2, 0xbaffca, 0.58).beginPath().arc(0, 0, ring - 4, -0.25, Math.PI * 1.2).strokePath();
  } else {
    graphics.lineStyle(3, 0x26151b, 0.9).strokeCircle(0, 0, ring - 5);
    for (let rune = 0; rune < 6; rune += 1) {
      const angle = rune / 6 * Math.PI * 2;
      const x = Math.cos(angle) * (ring + 5);
      const y = Math.sin(angle) * (ring + 5);
      graphics.fillStyle(rune % 2 ? 0xfff0a6 : definition.color, 0.9).fillTriangle(
        x + Math.cos(angle) * 7, y + Math.sin(angle) * 7,
        x + Math.cos(angle + 2.45) * 5, y + Math.sin(angle + 2.45) * 5,
        x + Math.cos(angle - 2.45) * 5, y + Math.sin(angle - 2.45) * 5,
      );
    }
    graphics.lineStyle(2, 0xffe68c, 0.72).beginPath()
      .moveTo(-ring + 5, -ring + 5).lineTo(ring - 5, ring - 5)
      .moveTo(ring - 5, -ring + 5).lineTo(-ring + 5, ring - 5).strokePath();
  }
}

export function createRiftStrikeWarning(
  scene: Phaser.Scene,
  point: Point,
  radius: number,
  delayMs: number,
  reduceMotion: boolean,
): Phaser.GameObjects.Container {
  const floor = scene.add.graphics();
  floor.fillStyle(0x4d071f, 0.24).fillCircle(0, 0, radius)
    .lineStyle(6, 0xff326f, 0.2).strokeCircle(0, 0, radius)
    .lineStyle(2.5, 0xff8ab6, 0.95).strokeCircle(0, 0, radius - 6)
    .lineStyle(1.5, 0xffd36d, 0.82).strokeCircle(0, 0, radius * 0.42);
  for (let ray = 0; ray < 12; ray += 1) {
    const angle = ray / 12 * Math.PI * 2;
    floor.lineStyle(ray % 2 ? 1 : 2, ray % 2 ? 0xff5c9a : 0xffd36d, 0.72).beginPath()
      .moveTo(Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5)
      .lineTo(Math.cos(angle) * (radius - 9), Math.sin(angle) * (radius - 9)).strokePath();
  }
  const core = scene.add.graphics();
  core.fillStyle(0xffe58b, 0.9).fillCircle(0, 0, 5)
    .lineStyle(2, 0xffffff, 0.8).beginPath().moveTo(-16, 0).lineTo(16, 0).moveTo(0, -16).lineTo(0, 16).strokePath();
  const label = scene.add.text(0, -radius - 16, 'УДАР РАЗЛОМА', {
    fontFamily: 'Arial', fontSize: '9px', fontStyle: 'bold', color: '#ffd18a', stroke: '#180712', strokeThickness: 4,
  }).setOrigin(0.5);
  const container = scene.add.container(point.x, point.y, [floor, core, label]).setDepth(58).setName('fx-boss-strike-warning');
  if (!reduceMotion) {
    scene.tweens.add({ targets: floor, angle: 35, duration: delayMs, ease: 'Linear' });
    scene.tweens.add({ targets: core, scale: 2.5, alpha: 0.35, duration: Math.max(180, delayMs * 0.34), yoyo: true, repeat: 2 });
  }
  return container;
}

export function createRiftStrikeImpact(scene: Phaser.Scene, point: Point, radius: number, reduceMotion: boolean): void {
  const blast = scene.add.graphics().setPosition(point.x, point.y).setDepth(60).setName('fx-boss-strike-impact');
  blast.fillStyle(0xffe9ae, 0.78).fillCircle(0, 0, 12)
    .fillStyle(0xd62472, 0.34).fillCircle(0, 0, radius)
    .lineStyle(7, 0xff3479, 0.62).strokeCircle(0, 0, radius * 0.72)
    .lineStyle(2, 0xffffff, 0.9).strokeCircle(0, 0, radius);
  for (let bolt = 0; bolt < 9; bolt += 1) {
    const angle = bolt / 9 * Math.PI * 2;
    const inner = radius * 0.16;
    const middle = radius * (0.48 + (bolt % 2) * 0.08);
    const outer = radius * (0.9 + (bolt % 3) * 0.12);
    blast.lineStyle(bolt % 2 ? 2 : 4, bolt % 2 ? 0xff63ad : 0xffe391, 0.94).beginPath()
      .moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      .lineTo(Math.cos(angle + 0.14) * middle, Math.sin(angle + 0.14) * middle)
      .lineTo(Math.cos(angle - 0.08) * outer, Math.sin(angle - 0.08) * outer).strokePath();
  }
  scene.tweens.add({
    targets: blast, scale: reduceMotion ? 1.12 : 1.52, alpha: 0,
    duration: reduceMotion ? 180 : 480, ease: 'Cubic.out', onComplete: () => blast.destroy(),
  });
}

export function createElitePulse(
  scene: Phaser.Scene,
  point: Point,
  elite: EliteType,
  reduceMotion: boolean,
  label = true,
): void {
  const definition = ELITES[elite];
  const pulse = scene.add.graphics().setPosition(point.x, point.y - 8).setDepth(29).setName('fx-elite-pulse');
  pulse.fillStyle(definition.color, 0.15).fillCircle(0, 0, 18)
    .lineStyle(5, definition.color, 0.34).strokeCircle(0, 0, 22)
    .lineStyle(2, 0xffffff, 0.72).strokeCircle(0, 0, 29);
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = ray / 8 * Math.PI * 2;
    pulse.lineStyle(2, definition.color, 0.7).beginPath()
      .moveTo(Math.cos(angle) * 23, Math.sin(angle) * 23)
      .lineTo(Math.cos(angle) * 36, Math.sin(angle) * 36).strokePath();
  }
  scene.tweens.add({
    targets: pulse,
    scale: reduceMotion ? 1.25 : 1.8,
    alpha: 0,
    angle: reduceMotion ? 0 : 25,
    duration: reduceMotion ? 160 : 420,
    ease: 'Cubic.out',
    onComplete: () => pulse.destroy(),
  });

  if (!label) return;
  const text = scene.add.text(point.x, point.y - 50, definition.shortName, {
    fontFamily: 'Arial', fontSize: '10px', fontStyle: 'bold', color: `#${definition.color.toString(16).padStart(6, '0')}`,
    stroke: '#070912', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(35).setName('fx-elite-label');
  scene.tweens.add({
    targets: text,
    y: text.y - (reduceMotion ? 8 : 22),
    alpha: 0,
    duration: reduceMotion ? 420 : 900,
    delay: reduceMotion ? 0 : 180,
    ease: 'Cubic.out',
    onComplete: () => text.destroy(),
  });
}

export function createShieldBreakEffect(scene: Phaser.Scene, point: Point, reduceMotion: boolean): void {
  const shards = scene.add.graphics().setPosition(point.x, point.y - 8).setDepth(34).setName('fx-elite-shield-break');
  for (let shard = 0; shard < 12; shard += 1) {
    const angle = shard / 12 * Math.PI * 2;
    const inner = 16;
    const outer = 29 + (shard % 3) * 5;
    shards.fillStyle(shard % 2 ? 0x7deaff : 0xe8fdff, 0.88).fillTriangle(
      Math.cos(angle) * inner, Math.sin(angle) * inner,
      Math.cos(angle - 0.1) * outer, Math.sin(angle - 0.1) * outer,
      Math.cos(angle + 0.1) * outer, Math.sin(angle + 0.1) * outer,
    );
  }
  scene.tweens.add({
    targets: shards,
    scale: reduceMotion ? 1.2 : 1.85,
    angle: reduceMotion ? 0 : 32,
    alpha: 0,
    duration: reduceMotion ? 160 : 380,
    ease: 'Cubic.out',
    onComplete: () => shards.destroy(),
  });
}
