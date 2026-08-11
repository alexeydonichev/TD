import Phaser from 'phaser';
import type { EnemyType, TowerType } from '../core/types';

export type OffensiveTowerType = Exclude<TowerType, 'boost'>;

export interface EnemyMotionPose {
  bob: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  shadowAlpha: number;
}

export function enemyMotionPose(
  type: EnemyType,
  timeMs: number,
  seed: number,
  heading: number,
  slowed: boolean,
  reduced: boolean,
): EnemyMotionPose {
  if (reduced) return { bob: type === 'winged' ? -13 : 0, rotation: 0, scaleX: 1, scaleY: 1, shadowScale: 1, shadowAlpha: 0.62 };
  const flying = type === 'winged';
  const boss = type === 'warden' || type === 'titan' || type === 'boss';
  const pace = slowed ? 0.004 : flying ? 0.009 : boss ? 0.0044 : type === 'runner' ? 0.0105 : 0.007;
  const phase = timeMs * pace + seed;
  const step = Math.sin(phase);
  const lift = Math.abs(Math.sin(phase));
  const turnLean = Math.sin(heading) * (boss ? 0.018 : 0.035);
  if (flying) {
    return {
      bob: -15 + Math.sin(phase * 0.72) * 4.5,
      rotation: turnLean + Math.sin(phase * 0.45) * 0.025,
      scaleX: 1 + Math.cos(phase) * 0.025,
      scaleY: 1 - Math.cos(phase) * 0.07,
      shadowScale: 0.86 + Math.sin(phase * 0.72) * 0.05,
      shadowAlpha: 0.34,
    };
  }
  const weight = boss ? 0.55 : type === 'brute' ? 0.72 : 1;
  return {
    bob: -lift * (boss ? 1.6 : type === 'brute' ? 2.2 : 3.2),
    rotation: turnLean + step * 0.028 * weight,
    scaleX: 1 + lift * 0.025 * weight,
    scaleY: 1 - lift * 0.034 * weight,
    shadowScale: 1 - lift * 0.07 * weight,
    shadowAlpha: 0.56 + (1 - lift) * 0.1,
  };
}

export function drawTowerDetails(graphics: Phaser.GameObjects.Graphics, type: TowerType, level: number, color: number): void {
  graphics.clear().setAlpha(1).setRotation(0);
  if (type === 'archer') {
    for (let index = 0; index < level; index += 1) {
      const x = (index - (level - 1) / 2) * 9;
      graphics.lineStyle(2, 0xffdda0, 0.9).beginPath().moveTo(x - 5, -39).lineTo(x + 5, -50).strokePath();
      graphics.fillStyle(color, 0.96).fillTriangle(x + 5, -50, x, -47, x + 3, -44);
      graphics.lineStyle(1.5, 0xf4a74f, 0.82).beginPath().moveTo(x - 5, -39).lineTo(x - 8, -42).moveTo(x - 5, -39).lineTo(x - 2, -36).strokePath();
    }
  } else if (type === 'frost') {
    const shards = 2 + level * 2;
    for (let index = 0; index < shards; index += 1) {
      const angle = index / shards * Math.PI * 2;
      const x = Math.cos(angle) * (25 + level * 2);
      const y = -9 + Math.sin(angle) * (13 + level);
      graphics.fillStyle(index % 2 ? 0xb9f8ff : color, 0.85).fillTriangle(x, y - 5 - level, x - 3, y + 3, x + 3, y + 3);
    }
  } else if (type === 'siege') {
    for (let index = 0; index < level; index += 1) {
      const x = (index - (level - 1) / 2) * 11;
      graphics.fillStyle(0x2b1b19, 0.96).fillCircle(x, -42, 4 + level * 0.5);
      graphics.lineStyle(2, 0xffa24f, 0.88).strokeCircle(x, -42, 5 + level * 0.6);
      graphics.fillStyle(0xffd168, 0.72).fillCircle(x, -42, 1.8 + level * 0.35);
    }
  } else {
    const runes = level * 2 + 2;
    graphics.lineStyle(1.5 + level * 0.35, color, 0.62).strokeCircle(0, -9, 25 + level * 3);
    for (let index = 0; index < runes; index += 1) {
      const angle = index / runes * Math.PI * 2;
      const x = Math.cos(angle) * (28 + level * 3);
      const y = -9 + Math.sin(angle) * (18 + level * 2);
      graphics.fillStyle(index % 2 ? 0xf1ccff : color, 0.9).fillPoints([
        { x, y: y - 3.5 }, { x: x + 3.5, y }, { x, y: y + 3.5 }, { x: x - 3.5, y },
      ], true);
    }
  }
}

export function createProjectileVisual(
  scene: Phaser.Scene,
  type: OffensiveTowerType,
  level: number,
  scale: number,
  count: number,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const trail = scene.add.graphics();
  if (type === 'archer') {
    trail.lineStyle(2 + level * 0.25, 0xffc86a, 0.34).beginPath().moveTo(-10, 0).lineTo(-27 - level * 3, 0).strokePath();
  } else if (type === 'frost') {
    trail.lineStyle(5 + level, 0x5adcf7, 0.13).beginPath().moveTo(-7, 0).lineTo(-29 - level * 4, 0).strokePath();
    trail.lineStyle(1.5, 0xd9fbff, 0.52).beginPath().moveTo(-5, 0).lineTo(-23 - level * 3, 0).strokePath();
  } else {
    for (let index = 1; index <= 3; index += 1) {
      trail.fillStyle(index === 1 ? 0xff8a3d : 0x6f5d65, 0.2 / index)
        .fillCircle(-7 * index, 0, (5 + level) * (1 - index * 0.12));
    }
  }
  const body = scene.add.graphics();
  if (type === 'archer') {
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * 6;
      body.lineStyle(2.1 + level * 0.35, 0xffdf9b, 1).beginPath().moveTo(-11, offset).lineTo(10, offset).strokePath();
      body.fillStyle(0xffb64f, 1).fillTriangle(13, offset, 7, offset - 4.5, 7, offset + 4.5);
      body.lineStyle(1.7, 0xe97945, 0.95).beginPath().moveTo(-10, offset).lineTo(-15, offset - 4).moveTo(-10, offset).lineTo(-15, offset + 4).strokePath();
    }
  } else if (type === 'frost') {
    body.fillStyle(0x6feaff, 0.13).fillCircle(0, 0, 13 + level * 2 + count * 2);
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * 7;
      const points = [
        { x: 13, y: offset }, { x: 1, y: offset - 6 }, { x: -10, y: offset }, { x: 1, y: offset + 6 },
      ];
      body.lineStyle(1.5, 0xe1fdff, 0.95).fillStyle(index % 2 ? 0xa7f5ff : 0x72dfff, 0.98)
        .fillPoints(points, true).strokePoints(points, true);
      body.fillStyle(0xffffff, 0.86).fillTriangle(9, offset, 0, offset - 2.5, 0, offset + 2.5);
    }
  } else {
    body.fillStyle(0xff6f32, 0.14).fillCircle(0, 0, 13 + level * 2);
    body.fillStyle(0x241b1b, 1).fillCircle(0, 0, 7.5 + level * 1.4);
    body.lineStyle(2.2, 0xf28b42, 0.95).strokeCircle(0, 0, 7.5 + level * 1.4);
    body.fillStyle(0xffd063, 0.92).fillCircle(2.2, -2.2, 2 + level * 0.35);
  }
  return scene.add.container(x, y, [trail, body]).setScale(scale).setDepth(31);
}

export function createProjectileImpact(
  scene: Phaser.Scene,
  type: OffensiveTowerType,
  level: number,
  x: number,
  y: number,
  reduced: boolean,
): void {
  const impact = scene.add.graphics().setPosition(x, y).setDepth(32);
  if (type === 'archer') {
    impact.fillStyle(0xffd786, 0.9).fillCircle(0, 0, 3 + level);
    for (let index = 0; index < 4 + level; index += 1) {
      const angle = index / (4 + level) * Math.PI * 2;
      impact.lineStyle(1.4, 0xffb95e, 0.86).beginPath().moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3)
        .lineTo(Math.cos(angle) * (9 + level * 2), Math.sin(angle) * (9 + level * 2)).strokePath();
    }
  } else if (type === 'frost') {
    impact.fillStyle(0x75eaff, 0.18).fillCircle(0, 0, 17 + level * 4);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      impact.lineStyle(2 + level * 0.3, index % 2 ? 0xe2fdff : 0x6edfff, 0.9).beginPath().moveTo(0, 0)
        .lineTo(Math.cos(angle) * (14 + level * 5), Math.sin(angle) * (14 + level * 5)).strokePath();
    }
  } else {
    impact.fillStyle(0xffa43f, 0.38).fillCircle(0, 0, 16 + level * 7);
    impact.fillStyle(0xffe080, 0.72).fillCircle(0, 0, 7 + level * 3);
    impact.lineStyle(3 + level, 0x4e3431, 0.72).strokeCircle(0, 0, 20 + level * 8);
    for (let index = 0; index < 6 + level * 2; index += 1) {
      const angle = index / (6 + level * 2) * Math.PI * 2;
      impact.fillStyle(index % 2 ? 0xffbd56 : 0x64515a, 0.75).fillCircle(
        Math.cos(angle) * (12 + level * 4), Math.sin(angle) * (9 + level * 3), 2 + level * 0.7,
      );
    }
  }
  scene.tweens.add({
    targets: impact, alpha: 0, scale: type === 'siege' ? 1.55 : 1.3,
    duration: reduced ? 80 : type === 'siege' ? 330 : 190,
    ease: 'Cubic.out', onComplete: () => impact.destroy(),
  });
}

export function animateTowerFire(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  type: OffensiveTowerType,
  level: number,
  reduced: boolean,
): void {
  if (reduced) return;
  scene.tweens.killTweensOf(sprite);
  const baseScale = 0.098 + level * 0.008;
  sprite.setPosition(0, -13).setAngle(0).setScale(baseScale);
  const target = type === 'archer'
    ? { y: -15, angle: level % 2 ? -2.5 : 2.5 }
    : type === 'frost'
      ? { scaleX: baseScale * 1.08, scaleY: baseScale * 1.08, angle: 2 }
      : { x: -5 - level, y: -12, angle: -1.5 };
  scene.tweens.add({
    targets: sprite, ...target, duration: type === 'siege' ? 95 : 65, yoyo: true, ease: 'Quad.out',
    onComplete: () => sprite.setPosition(0, -13).setAngle(0).setScale(baseScale),
  });
}
