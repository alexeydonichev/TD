import './style.css';
import { DIFFICULTIES, EARLY_START_GOLD_PER_SECOND, ENEMIES, GAME_HEIGHT, GAME_WIDTH, HERO, TOWERS, WAVES } from './core/config';
import { earlyStartBonus, waveRoster } from './core/rules';
import type { Difficulty, TowerType } from './core/types';
import { AudioManager, type SoundName } from './game/AudioManager';
import { emit, on } from './game/bus';
import type { HudState } from './game/GameScene';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="game-shell" aria-label="Долина Разлома">
    <div id="game" class="game-canvas" aria-label="Игровая карта"></div>
    <section class="topbar glass" aria-label="Состояние матча">
      <div class="brand"><span class="brand-mark">◆</span><div><small>ДОЛИНА</small><strong>РАЗЛОМА</strong></div></div>
      <div class="resource gold"><span>◈</span><div><small>ЗОЛОТО</small><b id="gold">0</b></div></div>
      <div class="resource lives"><span>♦</span><div><small>КРИСТАЛЛ</small><b id="lives">20</b></div></div>
      <div class="resource"><span>☷</span><div><small>ВОЛНА</small><b><i id="wave">0</i>/<i id="wave-total">20</i></b></div></div>
      <div class="resource"><span>⚔</span><div><small>ОСТАЛОСЬ</small><b id="remaining">0</b></div></div>
      <div class="resource score"><span>✦</span><div><small>СЧЁТ</small><b id="score">0</b></div></div>
      <div class="top-actions">
        <span id="difficulty-badge" class="difficulty-badge">ЗАЩИТНИК</span>
        <button id="music" class="icon-button" title="Музыка">♫</button>
        <button id="effects" class="icon-button" title="Эффекты">✦</button>
        <button id="settings" class="icon-button" title="Доступность и помощь" aria-label="Открыть настройки доступности">⚙</button>
        <button id="pause" class="icon-button" title="Пауза">Ⅱ</button>
        <button id="speed" class="speed-button">×1</button>
      </div>
    </section>

    <nav class="camera-controls glass" aria-label="Масштаб и камера">
      <button id="zoom-out" class="icon-button" title="Отдалить карту" aria-label="Отдалить карту">−</button>
      <button id="zoom-reset" title="Показать всю карту">108%</button>
      <button id="zoom-in" class="icon-button" title="Приблизить карту" aria-label="Приблизить карту">+</button>
    </nav>

    <aside class="wave-card glass">
      <div id="wave-kicker" class="eyebrow">СЛЕДУЮЩАЯ УГРОЗА</div>
      <h2 id="wave-title">Разведчики Разлома</h2>
      <p id="wave-intel">Налётчики · наземные</p>
      <div id="wave-roster" class="wave-roster" role="list" aria-label="Состав следующей волны"></div>
      <div class="wave-economy"><span id="wave-size"></span><span id="wave-reward"></span></div>
      <p id="strategy-hint" class="strategy-hint">Стрелковые башни — надёжный первый рубеж.</p>
      <div class="wave-row"><span id="countdown">00:12</span><button id="start-wave" class="primary">Начать досрочно <kbd>+золото</kbd></button></div>
    </aside>

    <aside id="tower-panel" class="tower-panel glass hidden">
      <div class="eyebrow">ВЫБРАННАЯ БАШНЯ</div>
      <h3 id="tower-name"></h3>
      <p id="tower-description"></p>
      <div class="tower-meta"><span>Уровень <b id="tower-level"></b></span><button id="target-mode"></button></div>
      <div class="tower-stats" aria-label="Боевые характеристики башни">
        <span><small id="tower-power-label">УРОН</small><b id="tower-power"></b></span>
        <span><small id="tower-rate-label">АТАКИ</small><b id="tower-rate"></b></span>
        <span><small>ДАЛЬНОСТЬ</small><b id="tower-range"></b></span>
      </div>
      <div id="tower-boosted" class="tower-boosted hidden">✦ Аура: +25% урона · +12% скорости</div>
      <div class="tower-performance">
        <span><small id="tower-performance-label">НАНЕСЕНО</small><b id="tower-performance"></b></span>
        <span><small id="tower-kills-label">УНИЧТОЖЕНО</small><b id="tower-kills"></b></span>
      </div>
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
        ${abilityButton('w', '⇧', '➤', HERO.abilities.w.name, HERO.abilities.w.mana)}
        ${abilityButton('e', 'E', '◇', HERO.abilities.e.name, HERO.abilities.e.mana)}
        ${abilityButton('r', 'R', '☄', HERO.abilities.r.name, HERO.abilities.r.mana)}
      </div>
    </section>

    <section id="boss-bar" class="boss-bar glass hidden">
      <div><strong id="boss-name">ВЛАДЫКА РАЗЛОМА</strong><span id="boss-phase">ФАЗА I</span><span id="boss-shield"></span></div>
      <div class="bar"><i id="boss-fill"></i><b id="boss-value"></b></div>
    </section>

    <div id="start-screen" class="overlay">
      <div class="start-rune">◆</div>
      <div class="eyebrow">ОРИГИНАЛЬНАЯ ФЭНТЕЗИ TOWER DEFENSE</div>
      <h1>Долина <span>Разлома</span></h1>
      <p>Защитите Кристалл в двадцати волнах и одолейте трёх владык Разлома.</p>
      <div class="difficulty-picker" role="radiogroup" aria-label="Сложность">
        ${difficultyButton('story')}
        ${difficultyButton('standard')}
        ${difficultyButton('rift')}
      </div>
      <button id="begin" class="start-button">НАЧАТЬ ИГРУ</button>
      <div class="controls"><span>WASD / ПКМ · герой</span><span>Колесо · масштаб</span><span>1–4 · башни</span><span>Q/Shift/E/R · умения</span></div>
    </div>

    <div id="end-screen" class="overlay hidden">
      <div id="end-rune" class="start-rune">◆</div>
      <div id="end-kicker" class="eyebrow"></div>
      <h1 id="end-title"></h1>
      <p id="end-copy"></p>
      <button id="restart" class="start-button">СЫГРАТЬ ЕЩЁ РАЗ</button>
    </div>
    <div id="pause-label" class="pause-label hidden">ПАУЗА</div>
    <aside id="tutorial" class="tutorial glass hidden" aria-live="polite">
      <div class="eyebrow">ПУТЬ ХРАНИТЕЛЯ <span id="tutorial-progress"></span></div>
      <h3 id="tutorial-title"></h3>
      <p id="tutorial-copy"></p>
      <div><button id="tutorial-next" class="primary">Далее</button><button id="tutorial-skip">Пропустить обучение</button></div>
    </aside>
    <div id="settings-dialog" class="settings-dialog hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <section class="glass">
        <div class="eyebrow">ИНТЕРФЕЙС И ДОСТУПНОСТЬ</div>
        <h2 id="settings-title">Настройки восприятия</h2>
        <label><input id="high-contrast" type="checkbox"> Высокая контрастность</label>
        <label><input id="large-text" type="checkbox"> Увеличенный текст HUD</label>
        <label><input id="reduce-motion" type="checkbox"> Уменьшить анимации</label>
        <label><input id="screen-shake" type="checkbox"> Встряска камеры</label>
        <p><b>Управление:</b> WASD — герой · ПКМ — идти к точке · Shift — рывок · Q/E/R — умения · стрелки или средняя кнопка — камера · колесо — масштаб · F — найти героя.</p>
        <button id="close-settings" class="primary">Готово</button>
      </section>
    </div>
    <div id="announcer" class="sr-only" aria-live="assertive"></div>
  </main>
`;

function difficultyButton(id: Difficulty): string {
  const difficulty = DIFFICULTIES[id];
  return `<button class="difficulty-option" data-difficulty="${id}" role="radio" aria-checked="false"><b>${difficulty.name}</b><small>${difficulty.description}</small><i>×${difficulty.scoreMultiplier} к счёту</i></button>`;
}

function buildButton(type: TowerType, key: string, icon: string): string {
  const tower = TOWERS[type];
  return `<button class="build-button" data-tower="${type}" title="${tower.description}" aria-label="${tower.name}, стоимость ${tower.cost}"><kbd>${key}</kbd><i aria-hidden="true">${icon}</i><span>${tower.name.replace(' башня', '')}<b>◈ ${tower.cost}</b></span></button>`;
}

function abilityButton(key: string, hotkey: string, icon: string, name: string, mana: number): string {
  return `<button class="ability" data-ability="${key}" title="${name}" aria-label="${name}, мана ${mana}"><kbd>${hotkey}</kbd><i aria-hidden="true">${icon}</i><small>${mana}</small><span class="cooldown"></span></button>`;
}

function bar(id: string, label: string): string {
  return `<div class="vital ${id}"><span>${label}</span><div><i id="${id}-fill"></i><b id="${id}-value"></b></div></div>`;
}

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new AudioManager();
let latestState: HudState | null = null;
let gameLoad: Promise<void> | null = null;
let selectedDifficulty = (localStorage.getItem('rift-difficulty') as Difficulty | null) ?? 'standard';
const isTestMode = new URLSearchParams(window.location.search).get('test') === '1';
let lastAnnouncedWave = -1;
let lastBriefedWave = -1;

async function ensureGame(): Promise<void> {
  if (gameLoad) return gameLoad;
  gameLoad = (async () => {
    const ready = new Promise<void>((resolve) => {
      const off = on<HudState>('td:state', () => { off(); resolve(); });
    });
    const [{ default: Phaser }, { GameScene }] = await Promise.all([import('phaser'), import('./game/GameScene')]);
    new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', width: GAME_WIDTH, height: GAME_HEIGHT, backgroundColor: '#101522', antialias: true,
      render: { pixelArt: false, roundPixels: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [GameScene],
    });
    await ready;
  })();
  return gameLoad;
}

get<HTMLButtonElement>('begin').addEventListener('click', async () => {
  audio.unlock();
  const begin = get<HTMLButtonElement>('begin');
  begin.disabled = true;
  begin.textContent = 'ЗАГРУЗКА ДОЛИНЫ…';
  localStorage.setItem('rift-difficulty', selectedDifficulty);
  await ensureGame();
  get('start-screen').classList.add('hidden');
  emit('td:action', { type: 'begin' });
  if (!isTestMode && localStorage.getItem('rift-tutorial-seen') !== 'yes') showTutorial(0);
});
get<HTMLButtonElement>('start-wave').addEventListener('click', () => emit('td:action', { type: 'start-wave' }));
get<HTMLButtonElement>('pause').addEventListener('click', () => emit('td:action', { type: 'pause' }));
get<HTMLButtonElement>('speed').addEventListener('click', () => emit('td:action', { type: 'speed' }));
get<HTMLButtonElement>('zoom-out').addEventListener('click', () => emit('td:action', { type: 'zoom', direction: 'out' }));
get<HTMLButtonElement>('zoom-reset').addEventListener('click', () => emit('td:action', { type: 'zoom', direction: 'reset' }));
get<HTMLButtonElement>('zoom-in').addEventListener('click', () => emit('td:action', { type: 'zoom', direction: 'in' }));
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

document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedDifficulty = button.dataset.difficulty as Difficulty;
    localStorage.setItem('rift-difficulty', selectedDifficulty);
    updateDifficultyPicker();
  });
});

const accessibilitySettings = {
  highContrast: localStorage.getItem('rift-high-contrast') === 'on',
  largeText: localStorage.getItem('rift-large-text') === 'on',
  reduceMotion: localStorage.getItem('rift-reduce-motion') === 'on',
  screenShake: localStorage.getItem('rift-screen-shake') !== 'off',
};

function applyAccessibility(): void {
  document.body.classList.toggle('high-contrast', accessibilitySettings.highContrast);
  document.body.classList.toggle('large-text', accessibilitySettings.largeText);
  document.body.classList.toggle('reduce-motion', accessibilitySettings.reduceMotion);
  get<HTMLInputElement>('high-contrast').checked = accessibilitySettings.highContrast;
  get<HTMLInputElement>('large-text').checked = accessibilitySettings.largeText;
  get<HTMLInputElement>('reduce-motion').checked = accessibilitySettings.reduceMotion;
  get<HTMLInputElement>('screen-shake').checked = accessibilitySettings.screenShake;
}

for (const [id, key, storage] of [
  ['high-contrast', 'highContrast', 'rift-high-contrast'], ['large-text', 'largeText', 'rift-large-text'],
  ['reduce-motion', 'reduceMotion', 'rift-reduce-motion'], ['screen-shake', 'screenShake', 'rift-screen-shake'],
] as const) {
  get<HTMLInputElement>(id).addEventListener('change', (event) => {
    accessibilitySettings[key] = (event.target as HTMLInputElement).checked;
    localStorage.setItem(storage, accessibilitySettings[key] ? 'on' : 'off');
    applyAccessibility();
  });
}

get('settings').addEventListener('click', () => get('settings-dialog').classList.remove('hidden'));
get('close-settings').addEventListener('click', () => get('settings-dialog').classList.add('hidden'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !get('settings-dialog').classList.contains('hidden')) get('settings-dialog').classList.add('hidden');
});

const tutorialSteps = [
  ['Постройте первую башню', 'Нажмите 1–4 или выберите башню внизу, затем укажите свободное место рядом с маршрутом.', '.build-panel'],
  ['Запустите волну', 'Изучите типы противников и нажмите «Начать досрочно». Остаток времени превратится в золото.', '.wave-card'],
  ['Переместите героя', 'Ведите Стража клавишами WASD или укажите точку правой кнопкой. Shift выполняет рывок к курсору.', '.hero-panel'],
  ['Примените умение', 'Q поражает цепью целей, W совершает рывок, E усиливает защиту. R откроется на 3 уровне.', '.abilities'],
  ['Улучшите защиту', 'Выберите построенную башню и повысьте её уровень. Режим цели помогает против разных волн.', '#tower-panel'],
] as const;
let tutorialStep = -1;

function showTutorial(step: number): void {
  document.querySelectorAll('.tutorial-focus').forEach((element) => element.classList.remove('tutorial-focus'));
  if (step < 0 || step >= tutorialSteps.length) {
    tutorialStep = -1;
    get('tutorial').classList.add('hidden');
    localStorage.setItem('rift-tutorial-seen', 'yes');
    return;
  }
  tutorialStep = step;
  const [title, copy, selector] = tutorialSteps[step];
  get('tutorial-title').textContent = title;
  get('tutorial-copy').textContent = copy;
  get('tutorial-progress').textContent = `${step + 1}/${tutorialSteps.length}`;
  get('tutorial').classList.remove('hidden');
  document.querySelector(selector)?.classList.add('tutorial-focus');
  get('tutorial-next').textContent = step === tutorialSteps.length - 1 ? 'Завершить' : 'Далее';
}

get('tutorial-next').addEventListener('click', () => showTutorial(tutorialStep + 1));
get('tutorial-skip').addEventListener('click', () => showTutorial(-1));
get('game').addEventListener('pointerdown', (event) => {
  if ((event as PointerEvent).button === 2 && tutorialStep === 2) showTutorial(3);
});

on<SoundName>('td:sound', (sound) => audio.play(sound));
on<HudState>('td:state', (state) => {
  latestState = state;
  renderHud(state);
});
updateAudioButtons();
updateDifficultyPicker();
applyAccessibility();

function updateDifficultyPicker(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
    const selected = button.dataset.difficulty === selectedDifficulty;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
  });
}

function updateAudioButtons(): void {
  get('music').classList.toggle('muted', !audio.musicEnabled);
  get('effects').classList.toggle('muted', !audio.effectsEnabled);
}

function renderHud(state: HudState): void {
  get('gold').textContent = String(state.gold);
  get('lives').textContent = String(state.lives);
  get('wave').textContent = String(state.wave);
  get('wave-total').textContent = String(state.totalWaves);
  get('remaining').textContent = String(state.remaining);
  get('score').textContent = state.score.toLocaleString('ru-RU');
  get('difficulty-badge').textContent = state.difficultyName.toUpperCase();
  get('wave-title').textContent = state.waveTitle;
  get('wave-intel').textContent = state.waveIntel;
  const hintedWave = Math.max(1, state.waveActive ? state.wave : state.wave + 1);
  renderWaveBriefing(hintedWave, state.waveActive);
  get('strategy-hint').textContent = strategyHint(hintedWave);
  get('countdown').textContent = state.waveActive ? 'ИДЁТ ВОЛНА' : `00:${Math.ceil(state.countdown).toString().padStart(2, '0')}`;
  get<HTMLButtonElement>('start-wave').disabled = state.waveActive || state.wave >= state.totalWaves || state.result !== 'playing';
  const bonus = earlyStartBonus(state.countdown, EARLY_START_GOLD_PER_SECOND);
  get<HTMLButtonElement>('start-wave').innerHTML = state.waveActive ? 'Волна в бою' : `Начать досрочно <kbd>+◈ ${bonus}</kbd>`;
  get('pause').textContent = state.paused ? '▶' : 'Ⅱ';
  get('speed').textContent = `×${state.speed}`;
  get('zoom-reset').textContent = `${Math.round(state.cameraZoom * 100)}%`;
  get('pause-label').classList.toggle('hidden', !state.paused);
  get('placement-message').textContent = state.placementMessage || 'Выберите башню';
  document.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((button) => button.classList.toggle('active', button.dataset.tower === state.buildType));
  renderTowerPanel(state);
  renderHero(state);
  renderBoss(state);
  if (state.result !== 'playing') renderEnd(state.result);
  if (state.wave !== lastAnnouncedWave && state.wave > 0) {
    lastAnnouncedWave = state.wave;
    get('announcer').textContent = `Началась волна ${state.wave}: ${state.waveTitle}. ${state.waveIntel}`;
  }
  if (tutorialStep === 0 && state.towerCount > 0) showTutorial(1);
  if (tutorialStep === 1 && state.waveActive) showTutorial(2);
  const usedAbility = Object.values(state.hero.abilities).some((ability) => ability.cooldown > 0);
  if (tutorialStep === 3 && usedAbility) showTutorial(4);
  if (tutorialStep === 4 && (state.selectedTower?.level ?? 0) > 1) showTutorial(-1);
}

function renderWaveBriefing(waveNumber: number, active: boolean): void {
  get('wave-kicker').textContent = active ? 'ВОЛНА В БОЮ' : 'СЛЕДУЮЩАЯ УГРОЗА';
  const wave = WAVES[Math.min(WAVES.length - 1, Math.max(0, waveNumber - 1))];
  if (!wave || lastBriefedWave === waveNumber) return;
  lastBriefedWave = waveNumber;
  const roster = waveRoster(wave.spawns);
  const total = roster.reduce((sum, entry) => sum + entry.count, 0);
  const rosterElement = get('wave-roster');
  rosterElement.innerHTML = roster.map(({ type, count }) => {
    const enemy = ENEMIES[type];
    const boss = type === 'warden' || type === 'titan' || type === 'boss';
    const trait = boss ? 'босс' : enemy.flying ? 'воздух' : enemy.armor >= 20 ? 'броня' : 'земля';
    return `<span class="enemy-chip${boss ? ' boss' : ''}" data-enemy="${type}" role="listitem" title="${enemy.name}: ${trait}"><i aria-hidden="true"></i><b>${enemy.name}</b><em>×${count}</em></span>`;
  }).join('');
  rosterElement.setAttribute('aria-label', `Состав волны ${waveNumber}: ${roster.map(({ type, count }) => `${ENEMIES[type].name}, ${count}`).join('; ')}`);
  get('wave-size').textContent = `${total} ${enemyCountLabel(total)}`;
  get('wave-reward').textContent = `Зачистка +◈ ${wave.reward}`;
}

function enemyCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'врагов';
  if (mod10 === 1) return 'враг';
  if (mod10 >= 2 && mod10 <= 4) return 'врага';
  return 'врагов';
}

function strategyHint(wave: number): string {
  if (wave <= 2) return 'Стрелковые башни — надёжный первый рубеж.';
  if (wave <= 4) return 'Лёд контролирует быстрые группы, стрелки добивают лидера.';
  if (wave <= 6) return 'Добавьте осадный урон и подготовьте ману к первому боссу.';
  if (wave === 7) return 'БОСС I: переждите щит, герой должен перехватить призванную стаю.';
  if (wave <= 10) return 'Усильте противовоздушную линию и перекройте второй поворот.';
  if (wave <= 13) return 'Улучшайте башни до III уровня: число целей быстро растёт.';
  if (wave === 14) return 'БОСС II: броню Титана лучше всего ломают осадные и магические атаки.';
  if (wave <= 17) return 'Две линии контроля и башня усиления важнее одиночного урона.';
  if (wave <= 19) return 'Элитные волны: держите героя у самого загруженного участка.';
  return 'БОСС III: его прорыв уничтожит Кристалл. Сохраните Сердце бури для второй фазы.';
}

function renderTowerPanel(state: HudState): void {
  const panel = get('tower-panel');
  panel.classList.toggle('hidden', !state.selectedTower);
  if (!state.selectedTower) return;
  get('tower-name').textContent = state.selectedTower.name;
  get('tower-description').textContent = state.selectedTower.description;
  get('tower-level').textContent = String(state.selectedTower.level);
  const support = state.selectedTower.type === 'boost';
  const targetMode = get<HTMLButtonElement>('target-mode');
  targetMode.textContent = support ? 'Пассивная аура' : `Цель: ${state.selectedTower.mode}`;
  targetMode.disabled = support;
  get('tower-power-label').textContent = support ? 'УСИЛЕНИЕ' : 'УРОН';
  get('tower-rate-label').textContent = support ? 'СКОРОСТЬ' : 'АТАКИ';
  get('tower-power').textContent = support ? '+25%' : String(Math.round(state.selectedTower.damage));
  get('tower-rate').textContent = support ? '+12%' : `${state.selectedTower.attacksPerSecond.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/с`;
  get('tower-range').textContent = String(state.selectedTower.range);
  get('tower-boosted').classList.toggle('hidden', !state.selectedTower.boosted);
  get('tower-performance-label').textContent = support ? 'В АУРЕ' : 'НАНЕСЕНО';
  get('tower-kills-label').textContent = support ? 'РОЛЬ' : 'УНИЧТОЖЕНО';
  const performance = support ? state.selectedTower.auraTargets : Math.round(state.selectedTower.damageDealt);
  get('tower-performance').textContent = performance.toLocaleString('ru-RU');
  get('tower-performance').dataset.value = String(performance);
  get('tower-kills').textContent = support ? 'ПОДДЕРЖКА' : String(state.selectedTower.kills);
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
  get('boss-name').textContent = state.boss.name.toUpperCase();
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
    ? `Все 20 волн и три босса повержены. Счёт: ${latestState?.score.toLocaleString('ru-RU') ?? 0}.`
    : `Вы продержались до волны ${latestState?.wave ?? 0}. Измените расстановку и попробуйте снова.`;
  get('end-rune').textContent = victory ? '◆' : '◇';
  get('announcer').textContent = victory ? 'Победа. Разлом запечатан.' : 'Поражение. Кристалл разрушен.';
}
