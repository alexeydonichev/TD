import Phaser from 'phaser';
import type { Point } from '../core/types';

function stopLoopingTweensOnDestroy(
  scene: Phaser.Scene,
  view: Phaser.GameObjects.Container,
  targets: Phaser.GameObjects.GameObject[],
): void {
  view.once(Phaser.GameObjects.Events.DESTROY, () => targets.forEach((target) => scene.tweens.killTweensOf(target)));
}

function boltPoints(from: Point, to: Point, segments: number, spread: number): Point[] {
  const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const points: Point[] = [{ ...from }];
  for (let index = 1; index < segments; index += 1) {
    const progress = index / segments;
    const envelope = Math.sin(progress * Math.PI);
    const jitter = Phaser.Math.FloatBetween(-spread, spread) * envelope;
    points.push({
      x: Phaser.Math.Linear(from.x, to.x, progress) + normal.x * jitter,
      y: Phaser.Math.Linear(from.y, to.y, progress) + normal.y * jitter,
    });
  }
  points.push({ ...to });
  return points;
}

function strokePath(graphics: Phaser.GameObjects.Graphics, points: Point[], width: number, color: number, alpha: number): void {
  graphics.lineStyle(width, color, alpha).beginPath().moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
  graphics.strokePath();
}

export function createLightningBolt(
  scene: Phaser.Scene,
  from: Point,
  to: Point,
  reduceMotion: boolean,
  intensity = 1,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(34).setName('fx-storm-lightning');
  const points = boltPoints(from, to, reduceMotion ? 3 : 7, (reduceMotion ? 4 : 12) * intensity);
  strokePath(graphics, points, 14 * intensity, 0x4f52d9, 0.14);
  strokePath(graphics, points, 7 * intensity, 0x55dfff, 0.5);
  strokePath(graphics, points, Math.max(1.5, 2.8 * intensity), 0xf2fdff, 0.98);

  if (!reduceMotion && points.length > 4) {
    [2, 4].forEach((pointIndex, branchIndex) => {
      const origin = points[Math.min(pointIndex, points.length - 2)];
      const branchAngle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y) + (branchIndex ? -1 : 1) * Phaser.Math.FloatBetween(0.65, 1.05);
      const branchEnd = {
        x: origin.x + Math.cos(branchAngle) * Phaser.Math.Between(24, 44) * intensity,
        y: origin.y + Math.sin(branchAngle) * Phaser.Math.Between(24, 44) * intensity,
      };
      strokePath(graphics, boltPoints(origin, branchEnd, 3, 5), 1.4 * intensity, 0xb8f8ff, 0.8);
    });
  }

  scene.tweens.add({
    targets: graphics,
    alpha: 0,
    duration: reduceMotion ? 90 : 210,
    ease: 'Quad.in',
    onComplete: () => graphics.destroy(),
  });
  return graphics;
}

export function createThunderBurst(scene: Phaser.Scene, point: Point, reduceMotion: boolean, scale = 1): void {
  const burst = scene.add.graphics().setPosition(point.x, point.y).setDepth(33).setName('fx-thunder-impact');
  burst.fillStyle(0xdafcff, 0.85).fillCircle(0, 0, 6 * scale)
    .lineStyle(5 * scale, 0x61e7ff, 0.42).strokeCircle(0, 0, 13 * scale)
    .lineStyle(2 * scale, 0xffe88f, 0.9).strokeCircle(0, 0, 20 * scale);
  if (!reduceMotion) {
    for (let ray = 0; ray < 10; ray += 1) {
      const angle = ray / 10 * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const inner = 11 * scale;
      const outer = Phaser.Math.Between(24, 39) * scale;
      burst.lineStyle(ray % 2 ? 2 : 3, ray % 2 ? 0x8ef1ff : 0xffdd74, 0.78)
        .beginPath().moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
        .lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer).strokePath();
    }
  }
  scene.tweens.add({
    targets: burst,
    scale: reduceMotion ? 1.3 : 1.85,
    angle: reduceMotion ? 0 : 18,
    alpha: 0,
    duration: reduceMotion ? 130 : 330,
    ease: 'Cubic.out',
    onComplete: () => burst.destroy(),
  });
}

export function launchStormSpear(scene: Phaser.Scene, from: Point, to: Point, reduceMotion: boolean): void {
  const view = scene.add.container(from.x, from.y).setDepth(32).setName('fx-hero-storm-spear');
  const art = scene.add.graphics();
  art.fillStyle(0x5cdcff, 0.16).fillEllipse(-22, 0, 62, 18)
    .lineStyle(6, 0x55dfff, 0.3).beginPath().moveTo(-35, 0).lineTo(12, 0).strokePath()
    .lineStyle(2, 0xf3fdff, 0.98).beginPath().moveTo(-26, 0).lineTo(22, 0).strokePath()
    .fillStyle(0xffdf73, 0.96).fillTriangle(29, 0, 15, -7, 15, 7);
  if (!reduceMotion) {
    art.fillStyle(0x9cf7ff, 0.8).fillCircle(-10, -7, 2.5).fillCircle(2, 7, 2);
  }
  view.add(art).setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
  const duration = reduceMotion ? 80 : Phaser.Math.Clamp(Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) * 1.15, 120, 240);
  scene.tweens.add({
    targets: view,
    x: to.x,
    y: to.y,
    duration,
    ease: 'Cubic.in',
    onComplete: () => {
      createThunderBurst(scene, to, reduceMotion, 0.8);
      view.destroy(true);
    },
  });
}

export function animateHeroAttack(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image, target: Point, reduceMotion: boolean): void {
  const direction = target.x < sprite.parentContainer.x ? -1 : 1;
  sprite.setFlipX(direction < 0);
  if (reduceMotion) return;
  scene.tweens.killTweensOf(sprite);
  sprite.setPosition(direction * 3, -40).setAngle(-direction * 7);
  scene.tweens.add({
    targets: sprite,
    x: direction * 10,
    y: -45,
    angle: direction * 12,
    duration: 95,
    yoyo: true,
    ease: 'Back.out',
    onComplete: () => sprite.setPosition(0, -40).setAngle(0),
  });
}

export function createDashStorm(scene: Phaser.Scene, from: Point, to: Point, reduceMotion: boolean): void {
  createLightningBolt(scene, from, to, reduceMotion, 1.35);
  [from, to].forEach((point, index) => {
    const portal = scene.add.graphics().setPosition(point.x, point.y).setDepth(31).setName(index ? 'fx-dash-arrival' : 'fx-dash-departure');
    portal.fillStyle(index ? 0x5eeaff : 0x5549d7, 0.16).fillCircle(0, 0, 31)
      .lineStyle(7, 0x4f56dd, 0.2).strokeCircle(0, 0, 28)
      .lineStyle(2.5, 0xd4fbff, 0.9).strokeCircle(0, 0, 24)
      .lineStyle(1.5, 0xffdf78, 0.78).strokeCircle(0, 0, 14);
    for (let rune = 0; rune < 6; rune += 1) {
      const angle = rune / 6 * Math.PI * 2;
      portal.fillStyle(rune % 2 ? 0xa8f7ff : 0xffe486, 0.9).fillTriangle(
        Math.cos(angle) * 34, Math.sin(angle) * 34,
        Math.cos(angle + 0.16) * 25, Math.sin(angle + 0.16) * 25,
        Math.cos(angle - 0.16) * 25, Math.sin(angle - 0.16) * 25,
      );
    }
    scene.tweens.add({
      targets: portal, scale: reduceMotion ? 1.25 : 1.85, angle: reduceMotion ? 0 : index ? 35 : -35,
      alpha: 0, duration: reduceMotion ? 170 : 430, ease: 'Cubic.out', onComplete: () => portal.destroy(),
    });
  });
  if (!reduceMotion) {
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    [-12, 12].forEach((offset) => createLightningBolt(
      scene,
      { x: from.x + normal.x * offset, y: from.y + normal.y * offset },
      { x: to.x + normal.x * offset, y: to.y + normal.y * offset },
      false,
      0.56,
    ));
    for (let echo = 1; echo <= 4; echo += 1) {
      const progress = echo / 5;
      const image = scene.add.image(
        Phaser.Math.Linear(from.x, to.x, progress),
        Phaser.Math.Linear(from.y, to.y, progress) - 40,
        'hero-v2',
      ).setDisplaySize(82, 82).setTint(0x63e8ff).setAlpha(0.26).setDepth(25).setName('fx-dash-afterimage');
      scene.tweens.add({ targets: image, alpha: 0, scale: 1.15, duration: 260 + echo * 25, onComplete: () => image.destroy() });
    }
  }
  createThunderBurst(scene, to, reduceMotion, 1.15);
}

export function createStormShield(scene: Phaser.Scene, center: Point, reduceMotion: boolean): Phaser.GameObjects.Container {
  const view = scene.add.container(center.x, center.y).setDepth(13).setName('fx-hero-tempest-shield');
  const field = scene.add.graphics()
    .fillStyle(0x2858b8, 0.045).fillCircle(0, 0, 230)
    .lineStyle(12, 0x485ddd, 0.07).strokeCircle(0, 0, 226)
    .lineStyle(2.5, 0x75eaff, 0.42).strokeCircle(0, 0, 230)
    .lineStyle(1, 0xffdf7c, 0.22).strokeCircle(0, 0, 213);
  for (let ray = 0; ray < 16; ray += 1) {
    const angle = ray / 16 * Math.PI * 2;
    field.lineStyle(ray % 4 === 0 ? 2 : 1, ray % 2 ? 0x7cecff : 0xffdd76, 0.16)
      .beginPath().moveTo(Math.cos(angle) * 185, Math.sin(angle) * 185)
      .lineTo(Math.cos(angle) * 227, Math.sin(angle) * 227).strokePath();
  }
  const haze = scene.add.graphics()
    .fillStyle(0x43dfff, 0.07).fillCircle(0, 0, 70)
    .lineStyle(9, 0x455de0, 0.12).strokeCircle(0, 0, 69);
  const runes = scene.add.graphics();
  runes.lineStyle(3, 0xb8f9ff, 0.72).strokeCircle(0, 0, 58)
    .lineStyle(1.5, 0xffdd7c, 0.66).strokeCircle(0, 0, 47);
  for (let rune = 0; rune < 12; rune += 1) {
    const angle = rune / 12 * Math.PI * 2;
    const x = Math.cos(angle) * 58;
    const y = Math.sin(angle) * 58;
    runes.fillStyle(rune % 3 === 0 ? 0xffe58a : 0x9bf6ff, 0.86).fillTriangle(
      x + Math.cos(angle) * 7, y + Math.sin(angle) * 7,
      x + Math.cos(angle + 2.35) * 5, y + Math.sin(angle + 2.35) * 5,
      x + Math.cos(angle - 2.35) * 5, y + Math.sin(angle - 2.35) * 5,
    );
  }
  const arcs = scene.add.graphics();
  for (let arc = 0; arc < 4; arc += 1) {
    const angle = arc / 4 * Math.PI * 2;
    arcs.lineStyle(2.5, 0xe4fdff, 0.76).beginPath()
      .moveTo(Math.cos(angle) * 30, Math.sin(angle) * 30)
      .lineTo(Math.cos(angle + 0.3) * 48, Math.sin(angle + 0.3) * 48)
      .lineTo(Math.cos(angle + 0.57) * 35, Math.sin(angle + 0.57) * 35).strokePath();
  }
  view.add([field, haze, runes, arcs]);
  if (!reduceMotion) {
    scene.tweens.add({ targets: field, angle: 360, duration: 14000, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: runes, angle: 360, duration: 4800, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: arcs, angle: -360, duration: 2600, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: haze, scale: 1.12, alpha: 0.55, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  stopLoopingTweensOnDestroy(scene, view, [field, haze, runes, arcs]);
  createThunderBurst(scene, center, reduceMotion, 1.35);
  return view;
}

export function createHeroOverchargeAura(scene: Phaser.Scene, center: Point, reduceMotion: boolean): Phaser.GameObjects.Container {
  const view = scene.add.container(center.x, center.y).setDepth(17).setName('fx-hero-overcharge');
  const corona = scene.add.graphics()
    .fillStyle(0x5ee8ff, 0.08).fillCircle(0, -19, 50)
    .lineStyle(7, 0x575de0, 0.13).strokeCircle(0, -19, 47)
    .lineStyle(2.5, 0xbefaff, 0.76).strokeCircle(0, -19, 43)
    .lineStyle(1.5, 0xffdf72, 0.78).strokeCircle(0, -19, 34);
  const sparks = scene.add.graphics();
  for (let spark = 0; spark < 10; spark += 1) {
    const angle = spark / 10 * Math.PI * 2;
    const radius = spark % 2 ? 43 : 52;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius - 19;
    sparks.fillStyle(spark % 2 ? 0x8ff5ff : 0xffe481, 0.9).fillTriangle(
      x + Math.cos(angle) * 6, y + Math.sin(angle) * 6,
      x + Math.cos(angle + 2.25) * 4, y + Math.sin(angle + 2.25) * 4,
      x + Math.cos(angle - 2.25) * 4, y + Math.sin(angle - 2.25) * 4,
    );
  }
  const arcs = scene.add.graphics();
  for (let arc = 0; arc < 5; arc += 1) {
    const angle = arc / 5 * Math.PI * 2;
    arcs.lineStyle(2, 0xedfdff, 0.82).beginPath()
      .moveTo(Math.cos(angle) * 24, Math.sin(angle) * 24 - 19)
      .lineTo(Math.cos(angle + 0.22) * 38, Math.sin(angle + 0.22) * 38 - 19)
      .lineTo(Math.cos(angle + 0.4) * 28, Math.sin(angle + 0.4) * 28 - 19).strokePath();
  }
  view.add([corona, sparks, arcs]);
  if (!reduceMotion) {
    scene.tweens.add({ targets: sparks, angle: 360, duration: 2400, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: arcs, angle: -360, duration: 1500, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: corona, scale: 1.12, alpha: 0.62, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  stopLoopingTweensOnDestroy(scene, view, [corona, sparks, arcs]);
  createLightningBolt(scene, { x: center.x + 18, y: Math.max(8, center.y - 230) }, { x: center.x, y: center.y - 20 }, reduceMotion, 1.5);
  createThunderBurst(scene, { x: center.x, y: center.y - 18 }, reduceMotion, 1.45);
  return view;
}

export function createStormField(scene: Phaser.Scene, center: Point, radius: number, reduceMotion: boolean): Phaser.GameObjects.Container {
  const view = scene.add.container(center.x, center.y).setDepth(12).setName('fx-hero-storm-field');
  const ground = scene.add.graphics()
    .fillStyle(0x25256e, 0.18).fillCircle(0, 0, radius)
    .lineStyle(11, 0x4c51d9, 0.13).strokeCircle(0, 0, radius - 4)
    .lineStyle(3, 0x8beeff, 0.72).strokeCircle(0, 0, radius)
    .lineStyle(1.5, 0xffdd76, 0.52).strokeCircle(0, 0, radius * 0.81);
  const sigil = scene.add.graphics();
  for (let spoke = 0; spoke < 12; spoke += 1) {
    const angle = spoke / 12 * Math.PI * 2;
    sigil.lineStyle(spoke % 3 === 0 ? 3 : 1.4, spoke % 2 ? 0x7eeaff : 0xffdf7c, 0.5)
      .beginPath().moveTo(Math.cos(angle) * radius * 0.48, Math.sin(angle) * radius * 0.48)
      .lineTo(Math.cos(angle) * (radius - 11), Math.sin(angle) * (radius - 11)).strokePath();
  }
  const clouds = scene.add.graphics();
  for (let cloud = 0; cloud < 10; cloud += 1) {
    const angle = cloud / 10 * Math.PI * 2;
    const cloudRadius = cloud % 2 ? radius * 0.59 : radius * 0.77;
    clouds.fillStyle(cloud % 2 ? 0x4d4f99 : 0x222654, 0.22)
      .fillEllipse(Math.cos(angle) * cloudRadius, Math.sin(angle) * cloudRadius, radius * 0.35, radius * 0.16);
  }
  view.add([ground, sigil, clouds]);
  if (!reduceMotion) {
    scene.tweens.add({ targets: sigil, angle: 360, duration: 8200, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: clouds, angle: -360, duration: 11500, repeat: -1, ease: 'Linear' });
    scene.tweens.add({ targets: ground, alpha: 0.72, scale: 1.025, duration: 540, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  stopLoopingTweensOnDestroy(scene, view, [ground, sigil, clouds]);
  createThunderBurst(scene, center, reduceMotion, 1.7);
  return view;
}

export function createStormPulse(scene: Phaser.Scene, center: Point, radius: number, reduceMotion: boolean, empowered: boolean): void {
  const pulse = scene.add.graphics().setPosition(center.x, center.y).setDepth(30).setName('fx-storm-damage-pulse');
  pulse.fillStyle(empowered ? 0x8567ff : 0x4c7ddd, empowered ? 0.13 : 0.08).fillCircle(0, 0, radius * 0.82)
    .lineStyle(empowered ? 5 : 3, empowered ? 0xffe58b : 0x99f3ff, empowered ? 0.82 : 0.62).strokeCircle(0, 0, radius * 0.78)
    .lineStyle(1.5, 0xe9feff, 0.72).strokeCircle(0, 0, radius * 0.58);
  if (!reduceMotion) {
    for (let arc = 0; arc < 8; arc += 1) {
      const angle = arc / 8 * Math.PI * 2;
      pulse.lineStyle(2, arc % 2 ? 0x86edff : 0xffdf72, 0.72).beginPath()
        .moveTo(Math.cos(angle) * radius * 0.35, Math.sin(angle) * radius * 0.35)
        .lineTo(Math.cos(angle + 0.14) * radius * 0.65, Math.sin(angle + 0.14) * radius * 0.65)
        .lineTo(Math.cos(angle - 0.06) * radius * 0.88, Math.sin(angle - 0.06) * radius * 0.88).strokePath();
    }
  }
  scene.tweens.add({
    targets: pulse, scale: reduceMotion ? 1.08 : 1.28, alpha: 0,
    angle: reduceMotion ? 0 : empowered ? 12 : -8,
    duration: reduceMotion ? 140 : 360, ease: 'Cubic.out', onComplete: () => pulse.destroy(),
  });
}
