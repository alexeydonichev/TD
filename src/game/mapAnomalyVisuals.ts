import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/config';
import type { MapAnomalyKind, Point } from '../core/types';
import { createLightningBolt, createThunderBurst } from './heroVisuals';

const PALETTE: Record<MapAnomalyKind, { glow: number; core: number; shadow: number }> = {
  whiteout: { glow: 0x8decff, core: 0xedfdff, shadow: 0x397aa2 },
  'magma-tide': { glow: 0xff7b3e, core: 0xffe08b, shadow: 0x6e1b18 },
  'storm-resonance': { glow: 0x55e8ff, core: 0xffe68a, shadow: 0x4c47d7 },
  'void-eclipse': { glow: 0xe35cff, core: 0xffc8f5, shadow: 0x37104f },
};

export function createMapAnomalyPulse(
  scene: Phaser.Scene,
  kind: MapAnomalyKind,
  targets: Point[],
  reduceMotion: boolean,
): void {
  const colors = PALETTE[kind];
  const duration = reduceMotion ? 180 : 720;
  const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, colors.shadow, reduceMotion ? 0.08 : 0.14)
    .setDepth(48).setName(`fx-map-anomaly-${kind}-veil`);
  const pulse = scene.add.graphics().setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(49).setName(`fx-map-anomaly-${kind}`);

  pulse.fillStyle(colors.glow, 0.055).fillCircle(0, 0, 110)
    .lineStyle(12, colors.glow, 0.13).strokeCircle(0, 0, 125)
    .lineStyle(3, colors.core, 0.72).strokeCircle(0, 0, 146);

  if (kind === 'whiteout') {
    const lines = reduceMotion ? 5 : 13;
    for (let index = 0; index < lines; index += 1) {
      const y = -GAME_HEIGHT / 2 + 54 + index * (GAME_HEIGHT - 108) / Math.max(1, lines - 1);
      const stagger = (index % 3) * 32;
      pulse.lineStyle(index % 2 ? 2 : 4, index % 2 ? colors.glow : colors.core, 0.3 + (index % 3) * 0.08)
        .beginPath().moveTo(-GAME_WIDTH / 2 - 80 + stagger, y)
        .lineTo(-180 + stagger, y - 17).lineTo(110 + stagger, y + 11).lineTo(GAME_WIDTH / 2 + 80, y - 8).strokePath();
    }
  } else if (kind === 'magma-tide') {
    const fissures = (targets.length ? targets : [{ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }]).slice(0, reduceMotion ? 3 : 8);
    fissures.forEach((point, index) => {
      const x = point.x - GAME_WIDTH / 2;
      const y = point.y - GAME_HEIGHT / 2;
      const length = 36 + (index % 3) * 16;
      pulse.lineStyle(8, colors.shadow, 0.42).beginPath().moveTo(x - length, y + 12)
        .lineTo(x - 14, y - 5).lineTo(x + 7, y + 9).lineTo(x + length, y - 13).strokePath()
        .lineStyle(2.5, colors.core, 0.92).beginPath().moveTo(x - length, y + 12)
        .lineTo(x - 14, y - 5).lineTo(x + 7, y + 9).lineTo(x + length, y - 13).strokePath();
      pulse.fillStyle(colors.glow, 0.8).fillCircle(x - 9, y - 15, 3 + index % 2).fillCircle(x + 18, y - 21, 2.5);
    });
  } else if (kind === 'void-eclipse') {
    for (let ring = 0; ring < (reduceMotion ? 3 : 7); ring += 1) {
      const radius = 100 + ring * 68;
      pulse.lineStyle(ring % 2 ? 2 : 5, ring % 2 ? colors.core : colors.glow, 0.5 - ring * 0.045).strokeCircle(0, 0, radius);
    }
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = ray / 12 * Math.PI * 2;
      pulse.lineStyle(ray % 3 ? 1.5 : 3, colors.glow, 0.34).beginPath()
        .moveTo(Math.cos(angle) * 92, Math.sin(angle) * 92)
        .lineTo(Math.cos(angle + 0.05) * 440, Math.sin(angle + 0.05) * 440).strokePath();
    }
  } else {
    const strikes = (targets.length ? targets : [{ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 }]).slice(0, reduceMotion ? 2 : 6);
    strikes.forEach((target, index) => {
      createLightningBolt(scene, { x: target.x + (index % 2 ? 32 : -32), y: Math.max(8, target.y - 230) }, target, reduceMotion, index === 0 ? 1.25 : 0.82);
      createThunderBurst(scene, target, reduceMotion, index === 0 ? 1.05 : 0.72);
    });
  }

  scene.tweens.add({ targets: veil, alpha: 0, duration, ease: 'Quad.out', onComplete: () => veil.destroy() });
  scene.tweens.add({
    targets: pulse,
    scale: reduceMotion ? 1.08 : 1.38,
    alpha: 0,
    angle: reduceMotion || kind === 'whiteout' ? 0 : kind === 'void-eclipse' ? -18 : 8,
    duration: duration + (reduceMotion ? 0 : 220),
    ease: 'Cubic.out',
    onComplete: () => pulse.destroy(),
  });
}
