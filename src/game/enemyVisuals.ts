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
  } else {
    for (let leaf = 0; leaf < 8; leaf += 1) {
      const angle = leaf / 8 * Math.PI * 2;
      graphics.fillStyle(definition.color, 0.75).fillEllipse(
        Math.cos(angle) * (ring + 5), Math.sin(angle) * (ring + 5), 7, 3,
      );
    }
    graphics.lineStyle(2, 0xbaffca, 0.58).beginPath().arc(0, 0, ring - 4, -0.25, Math.PI * 1.2).strokePath();
  }
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
