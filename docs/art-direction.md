# Арт-направление «Долины Разлома»

## Визуальный язык

- защитники: янтарное золото, бирюзовая молния, тёплый контровой свет;
- Разлом: фиолетовый камень, магента, холодное внутреннее свечение;
- материалы: гранёный камень, тёмный металл, кристалл и энергетические кольца;
- камера: единый высокий ракурс 3/4, читаемые силуэты на 64–128 px.

## Файлы и кадры

- `public/assets/rift-valley-title.png` — мастер стартового и финального фона;
- `public/assets/rift-valley-map-v3.png` — мастер ландшафта игровой карты с маршрутом и зонами строительства;
- `public/assets/frozen-pass-map.png` — мастер второй карты «Ледяной перевал»;
- `public/assets/ashen-bastion-map.png` — мастер третьей карты «Пепельный бастион»;
- `public/assets/stormspire-map.webp` — оптимизированный фон четвёртой карты «Грозовой шпиль»;
- `public/assets/abyss-heart-map.webp` — оптимизированный фон пятой карты «Сердце Бездны»;
- `public/assets/towers-atlas.png`, сетка 2×2: стрелковая, ледяная, осадная, усиление;
- `public/assets/units-motion-atlas.png`, сетка 4×2 с кадром 384×512: налётчик, бегун, громила, крылатое порождение, Страж Бездны, Титан Осколков, Владыка Разлома и призрачный огонёк;
- `public/assets/hero-v2.png` — мастер полнофигурного спрайта Стража Грозы, 768×768 RGBA.

Зелёный chroma-key был удалён локально с мягкой матовой границей и despill. PNG сохранены как lossless-мастера. В production используются визуально проверенные WebP-производные с теми же размерами кадров и alpha: `rift-valley-title.webp`, пять фонов карт, `towers-atlas.webp`, `units-motion-atlas.webp`, `hero-v2.webp`. Одновременно загружается только выбранный фон: самый тяжёлый игровой набор после клика остаётся меньше 1,1 MB.

## Происхождение

Ассеты сгенерированы для этого репозитория встроенным OpenAI image generation tool без референсов на сторонние игры. Запросы фиксировали: полностью оригинальные силуэты, отсутствие текста, логотипов, водяных знаков и узнаваемых защищённых персонажей или композиций.

Ключевой запрос фона: оригинальная героическая фэнтези-долина в высоком псевдоизометрическом ракурсе, холодный фиолетовый портал слева, тёплое золотое святилище справа, извилистый маршрут, глубокая navy/slate палитра.

Ключевой запрос башен: единый hand-painted 2D game icon style, одинаковый материал и свет, точная сетка, сильный силуэт, flat `#00ff00` background для последующего удаления.

## Боевой атлас существ v2

`units-motion-atlas.png` создан встроенным OpenAI image generation tool с исходным `units-atlas.png` только как стилевым референсом. Результат получен в точной сетке 4×2, 1536×1024, после чего равномерный `#00ff00` chroma-key удалён локально с soft matte, despill и edge contract 1. В интерфейсе и Phaser используется один и тот же финальный RGBA-атлас; старый лист больше не загружается.

Финальный запрос: «Создай профессиональный оригинальный 2D fantasy tower-defense sprite atlas на строго равномерном плоском `#00ff00` chroma-key фоне. Ровно 8 полнофигурных существ, сетка 4 колонки × 2 ряда, каждое существо целиком внутри своей ячейки, единый высокий ракурс 3/4, направление вправо, читаемый силуэт на 70–110 px, hand-painted game sprite quality, детальные тёмный металл, кристалл, ткань и внутреннее фиолетово-циановое свечение. Верхний ряд слева направо: бронированный налётчик, стремительный двуногий бегун, тяжёлый каменный громила, крылатое порождение. Нижний ряд: Страж Бездны с щитом, массивный Титан Осколков, уникальный Владыка Разлома, маленький призрачный огонёк. Разные пропорции, масса и силуэты; выразительные боевые позы, пригодные для процедурной анимации шага, полёта, наклона и попадания. Без пола, теней, рамок, текста, логотипов, интерфейса, водяных знаков, обрезанных частей и узнаваемых персонажей существующих франшиз».

Снаряды и эффекты созданы процедурно в Phaser, поэтому соответствуют типу атаки и не размываются при масштабировании: стрелковая башня выпускает 1–6 стрел, ледяная — 1–6 растущих кристальных осколков, осадная — одно ядро с растущим размером, следом и взрывом. Башни получают отдачу, а противники — походку, парение, наклон в поворотах, разнос по полосе, реакцию на попадание и отдельный эффект гибели. При `reduced motion` движение и длительные эффекты отключаются.

Ключевой запрос ландшафта v3: встроенная генерация с `rift-valley-title.png` как стилевым референсом; чистая 16:9 карта в высоком ракурсе 3/4, фиолетовая порча слева и золотое святилище справа, дорога по точным игровым точкам `(2%,47%) → (19%,47%) → (19%,21%) → (42.5%,21%) → (42.5%,74%) → (66%,74%) → (66%,37%) → (90%,37%) → (94%,37%)`, мшистые террасы, ручьи, водопады, сосны и рунические камни вокруг свободных строительных зон; без юнитов, башен, UI, текста, логотипов и отсылок к существующим франшизам. После визуального QA выполнен точечный edit только геометрии дороги: удалена смещённая версия и первый поворот перенесён к 19% ширины без изменения остального пейзажа.

## Карты кампании II–III

Обе карты созданы встроенным OpenAI image generation tool. `rift-valley-map-v3.png` использовался только как стилевой референс; композиции, маршруты и окружение сгенерированы заново. Выходы 1672×941 сохранены в PNG-мастерах и локально преобразованы Chromium Canvas в WebP quality 0.72. На стартовом экране превью не загружаются: Phaser запрашивает только фон выбранной карты.

Финальный запрос «Ледяного перевала»: «Production background map for a browser fantasy tower-defense game, 16:9, fixed elevated top-down/isometric view. Original snow-covered mountain pass with deep blue ice ravines, frozen waterfalls, ruined stone watchtowers, cyan crystals, dark fir trees, violet Rift corruption at the left edge and a warm golden sanctuary at the right. One broad continuous pale stone-and-ice road: left upper edge → right → down → right → up → right → down → sanctuary; broad readable buildable terrain pockets on both sides. Cold moonlit cyan/navy lighting, polished painterly game art. No branches, player towers, characters, enemies, labels, symbols, HUD, borders, text, logos or watermark».

Финальный запрос «Пепельного бастиона»: «Production background map for a browser fantasy tower-defense game, 16:9, fixed elevated top-down/isometric view. Original obsidian fortress ruins above lava chasms with magma waterfalls, cracked black basalt, ember-lit dead trees, red-gold runes, violet Rift portal at the left edge and a radiant golden citadel at the right. One broad continuous ash-stone road: left lower edge → right → up → right → up → right → down → citadel; broad readable basalt buildable plateaus. Dramatic red-orange magma light, charcoal rock and violet shadows, polished final-battle game art. No branches, player towers, characters, enemies, labels, symbols, HUD, borders, text, logos or watermark».

## Карты кампании IV–V

Обе карты созданы встроенным OpenAI image generation tool без внешних референсов. Исходные результаты сохранены системой генерации как `exec-d3a9e815-c47a-4bac-896a-d6cbaa056d88.png` и `exec-73146502-d129-4a1f-8f95-ffada1d6baa7.png`. Для production они уменьшены до 1200×700 и преобразованы Chromium Canvas в WebP quality 0.78: `public/assets/stormspire-map.webp` и `public/assets/abyss-heart-map.webp`. Как и прежде, браузер загружает только фон выбранной карты.

Финальный запрос «Грозового шпиля»: «Premium top-down fantasy tower-defense background, original storm mountain citadel above the clouds, fixed elevated 3/4 view, 16:9. One broad continuous stone road runs from the left lower-middle edge to the right, turns upward, crosses the middle, turns upward again and reaches a radiant golden crystal sanctuary in the right upper-middle. Dark slate cliffs, storm clouds, cyan lightning, waterfalls disappearing into clouds, ruined observatories and spacious buildable plateaus. Polished hand-painted game art with a clear readable path. No UI, text, labels, grid, towers, units, characters, logos or watermark».

Финальный запрос «Сердца Бездны»: «Premium top-down final fantasy tower-defense background, original volcanic obsidian and amethyst Rift realm, fixed elevated 3/4 view, 16:9. One broad continuous ash-stone path enters from the left upper-middle edge, travels right, descends, doubles back left through the center, descends again, then turns right to a radiant crystal sanctuary near the lower-right edge. Lava fissures, violet energy chasms, black basalt terraces, ancient broken arches and broad readable buildable ground. Polished dramatic hand-painted game art. No UI, text, labels, grid, towers, units, characters, logos or watermark».

## Страж Грозы v2

`hero-v2.png` создан встроенным OpenAI image generation tool с `units-atlas.png` как единственным стилевым и персонажным референсом. Исходный равномерный `#ff00ff` chroma-key удалён локально с soft matte, despill и edge contract 1; результат уменьшен до 768×768 с сохранением alpha.

Финальный запрос: «Отдельный полнофигурный боевой спрайт Стража Грозы на основе нижнего правого кадра оригинального атласа: тёмно-бирюзовые латы, старое золото, закрытый шлем с циановым свечением и одно копьё молний; polished hand-painted 2D fantasy game sprite, сильный силуэт на 70–100 px, высокий ракурс 3/4, стойка полевого командира, полностью в кадре. Равномерный `#ff00ff` chroma-key без пола, теней, градиента и текстуры. Ровно один персонаж; без рамки, эмблемы, крыльев, текста, логотипа, водяного знака, фиолетовых или магентовых деталей».
