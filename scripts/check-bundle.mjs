import { readdir, stat } from 'node:fs/promises';

const directory = new URL('../dist/assets/', import.meta.url);
const files = await readdir(directory);
const jsFiles = files.filter((file) => file.endsWith('.js'));
const sizes = Object.fromEntries(await Promise.all(jsFiles.map(async (file) => [file, (await stat(new URL(file, directory))).size])));
const entry = Object.entries(sizes).find(([file]) => /^index-.*\.js$/.test(file));
const scene = Object.entries(sizes).find(([file]) => /^GameScene-.*\.js$/.test(file));
const proof = {
  entryBytes: entry?.[1] ?? 0,
  sceneBytes: scene?.[1] ?? 0,
  lazyPhaserChunk: Object.keys(sizes).some((file) => file.startsWith('phaser-')),
  verdict: entry && scene && entry[1] < 100_000 && scene[1] < 100_000 && Object.keys(sizes).some((file) => file.startsWith('phaser-')) ? 'PASS' : 'FAIL',
};
console.log(JSON.stringify(proof));
if (proof.verdict !== 'PASS') process.exit(1);
