import { readdir, stat } from 'node:fs/promises';

const directory = new URL('../dist/assets/', import.meta.url);
const files = await readdir(directory);
const jsFiles = files.filter((file) => file.endsWith('.js'));
const sizes = Object.fromEntries(await Promise.all(jsFiles.map(async (file) => [file, (await stat(new URL(file, directory))).size])));
const entry = Object.entries(sizes).find(([file]) => /^index-.*\.js$/.test(file));
const scene = Object.entries(sizes).find(([file]) => /^GameScene-.*\.js$/.test(file));
const sharedAssetNames = ['towers-atlas.webp', 'units-motion-atlas.webp', 'hero-v2.webp'];
const mapAssetNames = ['rift-valley-map-v3.webp', 'frozen-pass-map.webp', 'ashen-bastion-map.webp'];
const sharedAssetBytes = (await Promise.all(sharedAssetNames.map(async (file) => (await stat(new URL(file, directory))).size)))
  .reduce((sum, size) => sum + size, 0);
const mapAssetBytes = Object.fromEntries(await Promise.all(mapAssetNames.map(async (file) => [file, (await stat(new URL(file, directory))).size])));
const campaignMapBytes = Object.values(mapAssetBytes).reduce((sum, size) => sum + size, 0);
const maxRuntimeAssetBytes = sharedAssetBytes + Math.max(...Object.values(mapAssetBytes));
const titleAssetBytes = (await stat(new URL('rift-valley-title.webp', directory))).size;
const proof = {
  entryBytes: entry?.[1] ?? 0,
  sceneBytes: scene?.[1] ?? 0,
  maxRuntimeAssetBytes,
  campaignMapBytes,
  mapAssetBytes,
  titleAssetBytes,
  lazyPhaserChunk: Object.keys(sizes).some((file) => file.startsWith('phaser-')),
  verdict: entry && scene && entry[1] < 100_000 && scene[1] < 100_000
    && maxRuntimeAssetBytes < 1_100_000 && campaignMapBytes < 1_200_000 && titleAssetBytes < 350_000
    && Object.keys(sizes).some((file) => file.startsWith('phaser-')) ? 'PASS' : 'FAIL',
};
console.log(JSON.stringify(proof));
if (proof.verdict !== 'PASS') process.exit(1);
