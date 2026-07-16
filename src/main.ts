import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH, HERO, TOWERS } from './core/config';
import type { TowerType } from './core/types';
import { AudioManager, type SoundName } from './game/AudioManager';
import { emit, on } from './game/bus';
import { GameScene, type HudState } from './game/GameScene';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="game-shell" aria-label="Долина Разлома">
    <div id="game" class="game-canvas" aria-label="Игровая карта"></div>
    <section class="topbar glass" aria-label="Состояние матча">
      <div class="brand"><span class="brand-mark">◆</span><div><small>ДОЛИНА</small><strong>РАЗЛОМА</strong></div></div>
      <div class="resource gold"><span>◈</span><div><small>ЗОЛОТО</small><b id="gold">0</b></div></div>
      <div class="resource lives"><span>♦</span><div><small>КРИСТАЛЛ</small><b id="lives">20</b></div></div>
      <div class="resource"><span>☷</span><div><small>ВОЛНА</small><b><i id="wave">0</i>/10</b></div></div>
      <div class="resource"><span>⚔</span><div><small>ОСТАЛОСЬ</small><b id="remaining">0</b></div></div>
      <div class="top-actions">
        <button id="music" class="icon-button" title="Музыка">♫</button>
        <button id="effects" class="icon-button" title="Эффекты">✦</button>
        <button id="pause" class="icon-button" title="Пауза">Ⅱ</button>
        <button id="speed" class="speed-button">×1</button>
      </div>
    </section>

    <aside class="wave-card glass">
      <div class="eyebrow">СЛЕДУЮЩАЯ УГРОЗА</div>
      <h2 id="wave-title">Разведчики Разлома</h2>
      <p id="wave-intel">Налётчики · наземные</p>
      <div class="wave-row"><span id="countdown">00:12</span><button id="start-wave" class="primary">Начать досрочно <kbd>+золото</kbd></button></div>
    </aside>

    <aside id="tower-panel" class="tower-panel glass hidden">
      <div class="eyebrow">ВЫБРАННАЯ БАШНЯ</div>
      <h3 id="tower-name"></h3>
      <p id="tower-description"></p>
      <div class="tower-meta"><span>Уровень <b id="tower-level"></b></span><button id="target-mode"></button></div>
      <div class="tower-actions"><button id="upgrade" class="primary"></button><button id="sell" class="danger"></button></div>
    </aside>

    <section class="build-panel glass" aria-label="Строительство">
      <div class="build-label"><span class="eyebrow">СТРОИТЕЛЬСТВО</span><small id="placement-message">Выберите башню</small></div>
      <div class="build-buttons">
        ${buildButton('archer', '1', '➶')}
        ${buildButton('frost', '2', '❄')}
        ${buildButton('siege', '3', '◉')}
        ${buildButton('boost', '4', '✧')}
      </div>
    </section>

    <section class="hero-panel glass" aria-label="Страж Грозы">
      <div class="hero-portrait">⚡<span id="hero-level">1</span></div>
      <div class="hero-vitals">
        <div class="hero-title"><strong>Страж Грозы</strong><small id="hero-status">готов</small></div>
        ${bar('hp', 'ЗДОРОВЬЕ')}
        ${bar('mana', 'МАНА')}
        ${bar('xp', 'ОПЫТ')}
      </div>
      <div class="abilities">
        ${abilityButton('q', 'Q', 'ϟ', HERO.abilities.q.name, HERO.abilities.q.mana)}
        ${abilityButton('w', 'W', '➤', HERO.abilities.w.name, HERO.abilities.w.mana)}
        ${abilityButton('e', 'E', '◇', HERO.abilities.e.name, HERO.abilities.e.mana)}
        ${abilityButton('r', 'R', '☄', HERO.abilities.r.name, HERO.abilities.r.mana)}
      </div>
    </section>

    <section id="boss-bar" class="boss-bar glass hidden">
      <div><strong>ВЛАДЫКА РАЗЛОМА</strong><span id="boss-phase">ФАЗА I</span><span id="boss-shield"></span></div>
      <div class="bar"><i id="boss-fill"></i><b id="boss-value"></b></div>
    </section>

    <div id="start-screen" class="overlay">
      <div class="start-rune">◆</div>
      <div class="eyebrow">ОРИГИНАЛЬНАЯ ФЭНТЕЗИ TOWER DEFENSE</div>
      <h1>Долина <span>Разлома</span></h1>
      <p>Защитите Кристалл, проведите Стража Грозы через десять волн и сокрушите Владыку Разлома.</p>
      <button id="begin" class="start-button">НАЧАТЬ ИГРУ</button>
      <div class="controls"><span>ПКМ · герой</span><span>1–4 · башни</span><span>Q/W/E/R · умения</span><span>Space · пауза</span></div>
    </div>

    <div id="end-screen" class="overlay hidden">
      <div id="end-rune" class="start-rune">◆</div>
      <div id="end-kicker" class="eyebrow"></div>
      <h1 id="end-title"></h1>
      <p id="end-copy"></p>
      <button id="restart" class="start-button">СЫГРАТЬ ЕЩЁ РАЗ</button>
    </div>
    <div id="pause-label" class="pause-label hidden">ПАУЗА</div>
  </main>
`;

function buildButton(type: TowerType, key: string, icon: string): string {
  const tower = TOWERS[type];
  return `<button class="build-button" data-tower="${type}" title="${tower.description}"><kbd>${key}</kbd><i>${icon}</i><span>${tower.name.replace(' башня', '')}<b>◈ ${tower.cost}</b></span></button>`;
}

function abilityButton(key: string, hotkey: string, icon: string, name: string, mana: number): string {
  return `<button class="ability" data-ability="${key}" title="${name}"><kbd>${hotkey}</kbd><i>${icon}</i><small>${mana}</small><span class="cooldown"></span></button>`;
}

function bar(id: string, label: string): string {
  return `<div class="vital ${id}"><span>${label}</span><div><i id="${id}-fill"></i><b id="${id}-value"></b></div></div>`;
}

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new AudioManager();
let latestState: HudState | null = null;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#101522',
  antialias: true,
  render: { pixelArt: false, roundPixels: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});

get<HTMLButtonElement>('begin').addEventListener('click', () => {
  audio.unlock();
  get('start-screen').classList.add('hidden');
  emit('td:action', { type: 'begin' });
});
get<HTMLButtonElement>('start-wave').addEventListener('click', () => emit('td:action', { type: 'start-wave' }));
get<HTMLButtonElement>('pause').addEventListener('click', () => emit('td:action', { type: 'pause' }));
get<HTMLButtonElement>('speed').addEventListener('click', () => emit('td:action', { type: 'speed' }));
get<HTMLButtonElement>('upgrade').addEventListener('click', () => emit('td:action', { type: 'upgrade' }));
get<HTMLButtonElement>('sell').addEventListener('click', () => emit('td:action', { type: 'sell' }));
get<HTMLButtonElement>('target-mode').addEventListener('click', () => emit('td:action', { type: 'target' }));
get<HTMLButtonElement>('restart').addEventListener('click', () => window.location.reload());
document.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((button) => button.addEventListener('click', () => emit('td:action', { type: 'build', tower: button.dataset.tower as TowerType })));
document.querySelectorAll<HTMLButtonElement>('[data-ability]').forEach((button) => button.addEventListener('click', () => emit('td:action', { type: 'ability', key: button.dataset.ability })));
get<HTMLButtonElement>('music').addEventListener('click', () => {
  audio.unlock();
  audio.setMusic(!audio.musicEnabled);
  updateAudioButtons();
});
get<HTMLButtonElement>('effects').addEventListener('click', () => {
  audio.unlock();
  audio.setEffects(!audio.effectsEnabled);
  updateAudioButtons();
});

on<SoundName>('td:sound', (sound) => audio.play(sound));
on<HudState>('td:state', (state) => {
  latestState = state;
  renderHud(state);
});
updateAudioButtons();

function updateAudioButtons(): void {
  get('music').classList.toggle('muted', !audio.musicEnabled);
  get('effects').classList.toggle('muted', !audio.effectsEnabled);
}

function renderHud(state: HudState): void {
  get('gold').textContent = String(state.gold);
  get('lives').textContent = String(state.lives);
  get('wave').textContent = String(state.wave);
  get('remaining').textContent = String(state.remaining);
  get('wave-title').textContent = state.waveTitle;
  get('wave-intel').textContent = state.waveIntel;
  get('countdown').textContent = state.waveActive ? 'ИДЁТ ВОЛНА' : `00:${Math.ceil(state.countdown).toString().padStart(2, '0')}`;
  get<HTMLButtonElement>('start-wave').disabled = state.waveActive || state.wave >= state.totalWaves || state.result !== 'playing';
  get<HTMLButtonElement>('start-wave').innerHTML = state.waveActive ? 'Волна началась' : 'Начать досрочно <kbd>+золото</kbd>';
  get('pause').textContent = state.paused ? '▶' : 'Ⅱ';
  get('speed').textContent = `×${state.speed}`;
  get('pause-label').classList.toggle('hidden', !state.paused);
  get('placement-message').textContent = state.placementMessage || 'Выберите башню';
  document.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((button) => button.classList.toggle('active', button.dataset.tower === state.buildType));
  renderTowerPanel(state);
  renderHero(state);
  renderBoss(state);
  if (state.result !== 'playing') renderEnd(state.result);
}

function renderTowerPanel(state: HudState): void {
  const panel = get('tower-panel');
  panel.classList.toggle('hidden', !state.selectedTower);
  if (!state.selectedTower) return;
  get('tower-name').textContent = state.selectedTower.name;
  get('tower-description').textContent = state.selectedTower.description;
  get('tower-level').textContent = String(state.selectedTower.level);
  get('target-mode').textContent = `Цель: ${state.selectedTower.mode}`;
  const upgrade = get<HTMLButtonElement>('upgrade');
  upgrade.disabled = state.selectedTower.nextCost === null;
  upgrade.textContent = state.selectedTower.nextCost === null ? 'Макс. уровень' : `Улучшить · ◈ ${state.selectedTower.nextCost}`;
  get('sell').textContent = `Продать · ◈ ${state.selectedTower.sellValue}`;
}

function renderHero(state: HudState): void {
  const hero = state.hero;
  get('hero-level').textContent = String(hero.level);
  get('hero-status').textContent = hero.alive ? 'в бою' : `возрождение ${Math.ceil(hero.respawn)}с`;
  setBar('hp', hero.hp / hero.maxHp, `${Math.ceil(hero.hp)} / ${hero.maxHp}`);
  setBar('mana', hero.mana / hero.maxMana, `${Math.floor(hero.mana)} / ${hero.maxMana}`);
  setBar('xp', hero.level >= 3 ? 1 : hero.xp / hero.xpNext, hero.level >= 3 ? 'MAX' : `${hero.xp} / ${hero.xpNext}`);
  Object.entries(hero.abilities).forEach(([key, ability]) => {
    const button = document.querySelector<HTMLButtonElement>(`[data-ability="${key}"]`)!;
    const cooldown = button.querySelector<HTMLElement>('.cooldown')!;
    button.classList.toggle('locked', ability.locked);
    button.classList.toggle('cooling', ability.cooldown > 0);
    button.disabled = ability.locked || ability.cooldown > 0 || hero.mana < ability.mana || !hero.alive;
    cooldown.textContent = ability.locked ? 'УР. 3' : ability.cooldown > 0 ? ability.cooldown.toFixed(1) : '';
  });
}

function setBar(id: string, ratio: number, value: string): void {
  get<HTMLElement>(`${id}-fill`).style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  get(`${id}-value`).textContent = value;
}

function renderBoss(state: HudState): void {
  const panel = get('boss-bar');
  panel.classList.toggle('hidden', !state.boss);
  if (!state.boss) return;
  get('boss-phase').textContent = `ФАЗА ${state.boss.phase === 1 ? 'I' : 'II'}`;
  get('boss-shield').textContent = state.boss.shielded ? 'МАГИЧЕСКИЙ ЩИТ' : '';
  get<HTMLElement>('boss-fill').style.width = `${Math.max(0, state.boss.hp / state.boss.maxHp) * 100}%`;
  get('boss-value').textContent = `${Math.ceil(state.boss.hp)} / ${Math.ceil(state.boss.maxHp)}`;
}

function renderEnd(result: 'victory' | 'defeat'): void {
  const victory = result === 'victory';
  const screen = get('end-screen');
  screen.classList.remove('hidden');
  screen.classList.toggle('defeat', !victory);
  get('end-kicker').textContent = victory ? 'КРИСТАЛЛ СПАСЁН' : 'КРИСТАЛЛ РАЗРУШЕН';
  get('end-title').textContent = victory ? 'Разлом запечатан' : 'Долина пала';
  get('end-copy').textContent = victory
    ? 'Все 10 волн отражены. Владыка Разлома повержен.'
    : `Вы продержались до волны ${latestState?.wave ?? 0}. Измените расстановку и попробуйте снова.`;
  get('end-rune').textContent = victory ? '◆' : '◇';
}
