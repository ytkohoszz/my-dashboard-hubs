/* ==========================================================================
   MEDIA DASHBOARD HUB v4.0 (Letterboxd Dark Redesign)
   Чистая вёрстка без рамок · Интерактивная шкала 5★ с половинками на постере
   Акцентная гистограмма оценок Letterboxd · Полная русификация · Без Списков
   ========================================================================== */

const MEDIA_ROOT_FOLDER = "Знания/Медиа";
const MIN_VALID_DATE_ISO = "1970-01-01";
const root = dv.container.createDiv({ cls: "dashboard-home dh-media-hub" });

// Единый словарь локализации интерфейса
const I18N = {
  addEntry: "＋ Добавить запись",
  postersView: "▦ Постеры",
  diaryView: "📓 Дневник",
  watchlistSlice: "⏱ В планах",
  favSlice: "♥ Любимое",
  watchlistHint: "Показать записи со статусом «В планах»",
  favHint: "Показать только любимые записи",
  allYears: "Все годы",
  allDecades: "Все десятилетия",
  allStatuses: "Статус",
  allGenres: "Жанры",
  allPlatforms: "Платформы",
  directorsAll: "Режиссёры",
  showrunnersAll: "Шоураннеры и студии",
  devsAll: "Разработчики и студии",
  sortDateDesc: "По дате просмотра: сначала новые",
  sortRatingDesc: "По оценке: сначала высокая",
  sortYearDesc: "По году выхода: сначала свежие",
  sortTitleAsc: "По названию: А–Я",
  ratingsHeader: "ОЦЕНКИ",
  rateAction: "Оценить",
  menuAction: "Меню действий",
  favAdd: "Добавить в любимое",
  favRemove: "Убрать из любимого",
  emptyFiltered: "По выбранным фильтрам ничего не найдено. Сбрось фильтр или нажми «＋ Добавить запись».",
  modalAddTitle: "Отметить в Медиатеке",
  modalEditTitle: "Редактировать",
  saveChanges: "Сохранить изменения",
  saveNew: "Добавить запись"
};

const notify = msg => {
  try { new Notice(msg); } catch { console.log(msg); }
};

function isTouchDevice() {
  try {
    if (typeof obsidian !== "undefined" && obsidian.Platform && obsidian.Platform.isMobile) {
      return true;
    }
  } catch {}
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function todayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function flatArray(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(flatArray);
  if (dv.isArray && dv.isArray(v)) return Array.from(v).flatMap(flatArray);
  const s = String(v).trim();
  return s ? [s] : [];
}

function parseOptionalNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const clean = v.trim().replace(",", ".");
    if (!clean) return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseNum(v, fallback = 0) {
  const n = parseOptionalNum(v);
  return n !== null ? n : fallback;
}

function toISODateStr(v) {
  if (v === null || v === undefined || v === "") return "";
  const maxISO = todayLocalISO();
  let iso = "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    iso = v.trim().slice(0, 10);
  } else {
    try {
      const d = dv.date(v);
      if (d && d.isValid) iso = d.toISODate();
    } catch {}
  }
  if (!iso || iso < MIN_VALID_DATE_ISO || iso > maxISO) return "";
  return iso;
}

function resolvePosterSrc(rawPoster, pagePath) {
  const s = String(rawPoster ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\/\S+/i.test(s) || s.startsWith("app://") || s.startsWith("data:image/")) {
    return s;
  }
  let clean = s;
  if (clean.startsWith("!")) clean = clean.slice(1).trim();
  if (clean.startsWith("[[")) clean = clean.slice(2);
  if (clean.endsWith("]]")) clean = clean.slice(0, -2);
  clean = clean.split("|")[0]?.split("#")[0]?.trim() || "";
  if (!clean) return "";
  const dest = app.metadataCache.getFirstLinkpathDest(clean, pagePath || "");
  if (dest) return app.vault.adapter.getResourcePath(dest.path);
  return "";
}

const MEDIA_SCHEMAS = {
  "Фильм": {
    folder: "Фильмы",
    icon: "🎬",
    pluralTitle: "Фильмы",
    creatorKey: "режиссёр",
    creatorLabel: "Режиссёр",
    creatorFilterAll: I18N.directorsAll,
    creatorPlaceholder: "Дени Вильнёв, Кристофер Нолан",
    dateKey: "дата_просмотра",
    dateLabel: "Дата просмотра",
    statuses: ["Просмотрено", "В планах", "Смотрю", "Брошено"],
    completedStatuses: ["Просмотрено"],
    defaultDoneStatus: "Просмотрено",
    rewatchLabel: "Пересмотр"
  },
  "Сериал": {
    folder: "Сериалы",
    icon: "📺",
    pluralTitle: "Сериалы",
    creatorKey: "шоураннер",
    creatorLabel: "Шоураннер / Студия",
    creatorFilterAll: I18N.showrunnersAll,
    creatorPlaceholder: "Винс Гиллиган, HBO, A24",
    dateKey: "дата_просмотра",
    dateLabel: "Дата просмотра",
    statuses: ["Просмотрено", "Смотрю", "В планах", "Брошено"],
    completedStatuses: ["Просмотрено"],
    defaultDoneStatus: "Просмотрено",
    rewatchLabel: "Пересмотр"
  },
  "Игра": {
    folder: "Игры",
    icon: "🎮",
    pluralTitle: "Игры",
    creatorKey: "разработчик",
    creatorLabel: "Разработчик / Студия",
    creatorFilterAll: I18N.devsAll,
    creatorPlaceholder: "Kojima Productions, Larian Studios",
    dateKey: "дата_прохождения",
    dateLabel: "Дата прохождения",
    statuses: ["Пройдено", "На 100% / Платина", "Играю", "В планах", "Брошено"],
    completedStatuses: ["Пройдено", "На 100% / Платина"],
    defaultDoneStatus: "Пройдено",
    rewatchLabel: "Перепрохождение"
  }
};

function getSchemaForType(typeStr) {
  const clean = String(typeStr || "Фильм").trim().toLowerCase();
  if (clean === "сериал") return MEDIA_SCHEMAS["Сериал"];
  if (clean === "игра") return MEDIA_SCHEMAS["Игра"];
  return MEDIA_SCHEMAS["Фильм"];
}

function getItemCreators(item) {
  const schema = getSchemaForType(item["тип"]);
  const primary = flatArray(item[schema.creatorKey]);
  if (primary.length > 0) return primary;
  return flatArray(item["режиссёр"] ?? item["разработчик"] ?? item["шоураннер"] ?? item["студия"] ?? item["автор"]);
}

function getItemDateISO(item) {
  return (
    toISODateStr(item["дата_прохождения"]) ||
    toISODateStr(item["дата_просмотра"]) ||
    toISODateStr(item["дата"]) ||
    ""
  );
}

function getItemDecade(item) {
  const y = parseOptionalNum(item["год"]);
  if (y === null || y < 1880 || y > 2100) return "";
  return `${Math.floor(y / 10) * 10}-е`;
}

function getRewatchCount(item) {
  const explicitCount = parseOptionalNum(item["количество_повторов"]);
  if (explicitCount !== null && explicitCount > 0) return Math.round(explicitCount);
  return item["пересмотр"] === true ? 1 : 0;
}

function isItemCompleted(item) {
  const st = String(item["статус"] || "").trim();
  return ["Просмотрено", "Пройдено", "На 100% / Платина"].includes(st);
}

function isItemWatchlist(item) {
  return String(item["статус"] || "").trim() === "В планах";
}

// Форматирование оценки (хранится по 10-балльной шкале, отображается в 5★ с половинками)
function formatStars(score10) {
  const num = parseOptionalNum(score10);
  if (num === null || num <= 0) return "";
  const clamped = Math.min(10, Math.max(1, Math.round(num)));
  const stars5 = clamped / 2;
  const full = Math.floor(stars5);
  const half = stars5 % 1 !== 0;
  return "★".repeat(full) + (half ? "½" : "");
}

function formatStars5Label(bucket1to10) {
  const stars5 = bucket1to10 / 2;
  const full = Math.floor(stars5);
  const half = stars5 % 1 !== 0;
  return `${stars5.toFixed(1).replace(".0", "")} ★ (${"★".repeat(full)}${half ? "½" : ""})`;
}

// Встроенные стили (Letterboxd Dark Aesthetic + CSS-переменные на русском)
const styleEl = root.createEl("style");
styleEl.textContent = `
@keyframes lbCardReveal {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes lbSheetSlideUp {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.dashboard-home.dh-media-hub {
  --медиа-акцент: #00e054;
  --медиа-фон-карточки: #1c2228;
  --медиа-текст-приглушённый: #9ab;
  --медиа-бар-график: #2c3440;
  --медиа-сердце: #ff8000;
  --медиа-голубой: #40bcf4;
  --медиа-обводка-постера: rgba(255, 255, 255, 0.08);
  --медиа-разделитель: rgba(255, 255, 255, 0.07);

  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0 32px 0;
  color: var(--text-normal);
  font-family: var(--font-interface);
  box-sizing: border-box;
}

.dashboard-home.dh-media-hub * {
  box-sizing: border-box;
}

/* 1. НАВИГАЦИЯ БЕЗ ПЛАШЕК И РАМОК (ПОДЧЁРКИВАНИЕ КАК В LETTERBOXD) */
.dashboard-home .lb-nav-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dashboard-home .lb-primary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding-bottom: 2px;
}

.dashboard-home .lb-primary-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 22px;
  background: transparent;
  border: none;
  padding: 0;
}

.dashboard-home .lb-primary-tab {
  position: relative;
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 8px 2px 10px 2px !important;
  height: auto !important;
  min-height: 36px !important;
  font-size: 0.94rem !important;
  font-weight: 650 !important;
  letter-spacing: 0.02em;
  cursor: pointer;
  color: var(--медиа-текст-приглушённый) !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 7px !important;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.dashboard-home .lb-primary-tab:hover {
  color: var(--text-normal) !important;
  background: transparent !important;
}

.dashboard-home .lb-primary-tab.is-active {
  color: #ffffff !important;
  border-bottom-color: var(--медиа-акцент) !important;
  background: transparent !important;
}

.dashboard-home .lb-primary-count {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--медиа-текст-приглушённый);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-primary-tab.is-active .lb-primary-count {
  color: var(--медиа-акцент);
  opacity: 1;
}

/* Единственная заливная зелёная кнопка на странице */
.dashboard-home .lb-add-cta {
  background: var(--медиа-акцент) !important;
  border: none !important;
  color: #0d1115 !important;
  font-weight: 750 !important;
  font-size: 0.82rem !important;
  letter-spacing: 0.02em;
  padding: 0 15px !important;
  height: 34px !important;
  min-height: 34px !important;
  border-radius: 5px !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  box-shadow: 0 2px 8px rgba(0, 224, 84, 0.22) !important;
  transition: filter 0.15s ease, transform 0.12s ease;
}

.dashboard-home .lb-add-cta:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

/* Вторичный ряд: Постеры | Дневник + срезы В планах | Любимое */
.dashboard-home .lb-secondary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 2px 0;
  background: transparent;
  border: none;
}

.dashboard-home .lb-view-modes,
.dashboard-home .lb-quick-slices {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.dashboard-home .lb-sub-btn {
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 2px 0 4px 0 !important;
  font-size: 0.79rem !important;
  font-weight: 550 !important;
  color: var(--медиа-текст-приглушённый) !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  transition: color 0.14s ease, border-color 0.14s ease;
}

.dashboard-home .lb-sub-btn:hover {
  color: #ffffff !important;
  background: transparent !important;
}

.dashboard-home .lb-sub-btn.is-active {
  color: #ffffff !important;
  border-bottom-color: var(--медиа-акцент) !important;
  font-weight: 650 !important;
  background: transparent !important;
}

.dashboard-home .lb-sub-count {
  font-size: 0.7rem;
  color: var(--медиа-текст-приглушённый);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

/* 2. ВИТРИНА «ТОП-4 ЛЮБИМЫХ» */
.dashboard-home .lb-top4-section {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding: 0 0 18px 0;
}

.dashboard-home .lb-top4-section > summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--медиа-текст-приглушённый);
  padding-bottom: 10px;
}

.dashboard-home .lb-top4-section > summary::-webkit-details-marker {
  display: none;
}

.dashboard-home .lb-top4-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 175px));
  gap: 16px;
}

/* 3. ПАНЕЛЬ ФИЛЬТРОВ + АКЦЕНТНЫЙ БЛОК «ОЦЕНКИ» (LETTERBOXD RATINGS) */
.dashboard-home .lb-toolbar-ratings-layout {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--медиа-разделитель);
}

.dashboard-home .lb-filters-column {
  flex: 1 1 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 260px;
}

.dashboard-home .lb-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-search-input {
  flex: 1 1 180px;
  min-width: 145px;
  height: 32px !important;
  padding: 0 10px !important;
  border-radius: 4px !important;
  font-size: 0.8rem !important;
  background: var(--медиа-фон-карточки) !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  color: var(--text-normal) !important;
}

.dashboard-home .lb-search-input:focus {
  border-color: var(--медиа-акцент) !important;
  outline: none !important;
}

.dashboard-home .lb-filters-bar select {
  height: 32px;
  font-size: 0.78rem;
  padding: 0 24px 0 9px;
  border-radius: 4px;
  background-color: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  color: var(--медиа-текст-приглушённый);
  cursor: pointer;
}

.dashboard-home .lb-filters-bar select:hover {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.2);
}

.dashboard-home .lb-creators-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-creators-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-creator-pill {
  height: 22px !important;
  min-height: 22px !important;
  padding: 0 8px !important;
  border-radius: 3px !important;
  font-size: 0.72rem !important;
  font-weight: 500 !important;
  background: var(--медиа-фон-карточки) !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  color: var(--медиа-текст-приглушённый) !important;
  cursor: pointer;
  box-shadow: none !important;
  transition: color 0.14s ease, border-color 0.14s ease;
}

.dashboard-home .lb-creator-pill:hover,
.dashboard-home .lb-creator-pill.is-active {
  color: #ffffff !important;
  border-color: var(--медиа-акцент) !important;
}

/* Акцентный блок «Оценки» в стиле Letterboxd (минимум 40% ряда, высота ~125px) */
.dashboard-home .lb-ratings-widget {
  flex: 1 1 42%;
  min-width: 300px;
  min-height: 122px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 14px 12px 14px;
  background: rgba(28, 34, 40, 0.45);
  border: 1px solid var(--медиа-разделитель);
  border-radius: 6px;
}

.dashboard-home .lb-ratings-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding-bottom: 5px;
  margin-bottom: 10px;
}

.dashboard-home .lb-ratings-title {
  font-size: 0.73rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-ratings-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.dashboard-home .lb-ratings-count {
  font-size: 0.74rem;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-ratings-avg {
  font-size: 1.32rem;
  font-weight: 700;
  line-height: 1;
  color: #dbe4ee;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-ratings-body {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 66px;
}

.dashboard-home .lb-ratings-edge-star {
  font-size: 0.72rem;
  color: var(--медиа-акцент);
  line-height: 1;
  user-select: none;
  flex-shrink: 0;
  padding-bottom: 2px;
}

.dashboard-home .lb-ratings-bars {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  align-items: end;
  gap: 3px;
  height: 100%;
}

.dashboard-home .lb-rating-col {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
}

.dashboard-home .lb-rating-bar {
  width: 100%;
  background: var(--медиа-бар-график);
  border-radius: 2px 2px 0 0;
  min-height: 3px;
  transition: background-color 0.14s ease, height 0.22s ease;
}

.dashboard-home .lb-rating-col.is-max .lb-rating-bar,
.dashboard-home .lb-rating-col.is-active .lb-rating-bar,
.dashboard-home .lb-rating-col:hover .lb-rating-bar {
  background: var(--медиа-акцент);
}

.dashboard-home .lb-rating-tooltip {
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  background: #14181c;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 15;
}

.dashboard-home .lb-rating-col:hover .lb-rating-tooltip {
  opacity: 1;
}

/* 4. СЕТКА ПОСТЕРОВ И КАРТОЧКА (ЗАДАЧИ 1, 2, 7) */
.dashboard-home .lb-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.dashboard-home .lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  min-width: 120px;
  animation: lbCardReveal 0.22s ease both;
}

.dashboard-home .lb-poster-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.dashboard-home .lb-card:hover .lb-poster-wrapper {
  border-color: var(--медиа-акцент);
  box-shadow: inset 0 0 0 1px var(--медиа-акцент), 0 0 0 1px var(--медиа-акцент);
}

.dashboard-home .lb-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dashboard-home .lb-poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px;
  text-align: center;
  background: var(--медиа-фон-карточки);
  gap: 6px;
}

.dashboard-home .lb-fallback-icon {
  font-size: 1.4rem;
  opacity: 0.55;
}

.dashboard-home .lb-fallback-title {
  font-size: 0.8rem;
  font-weight: 650;
  line-height: 1.25;
  color: var(--text-normal);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dashboard-home .lb-fallback-sub {
  font-size: 0.7rem;
  color: var(--медиа-текст-приглушённый);
}

/* ЗАДАЧА 1: Круглые кнопки 28x28px по разным углам без наложений */
.dashboard-home .lb-poster-corner-btn {
  position: absolute !important;
  width: 28px !important;
  min-width: 28px !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 !important;
  border-radius: 50% !important;
  background: rgba(16, 20, 24, 0.78) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
  font-size: 0.82rem !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer;
  z-index: 6;
  opacity: 0;
  pointer-events: none;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) !important;
  transition: opacity 0.16s ease, transform 0.12s ease, background-color 0.12s ease;
}

.dashboard-home .lb-poster-corner-btn.is-left {
  inset: 8px auto auto 8px;
}

.dashboard-home .lb-poster-corner-btn.is-right {
  inset: 8px 8px auto auto;
}

.dashboard-home .lb-card:hover .lb-poster-corner-btn {
  opacity: 1;
  pointer-events: auto;
}

/* Активное сердечко видно всегда, даже без наведения */
.dashboard-home .lb-poster-corner-btn.is-left.is-fav {
  opacity: 1;
  pointer-events: auto;
  color: var(--медиа-сердце) !important;
  border-color: rgba(255, 128, 0, 0.55) !important;
}

.dashboard-home .lb-poster-corner-btn:hover {
  background: rgba(20, 24, 30, 0.95) !important;
  transform: scale(1.08);
}

/* ЗАДАЧА 2: Нижняя полоса 5 звёзд с половинками при наведении (120–200px безопасно) */
.dashboard-home .lb-poster-bottom-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 32px;
  padding: 0 6px;
  background: linear-gradient(180deg, rgba(16, 20, 24, 0) 0%, rgba(16, 20, 24, 0.92) 45%, rgba(16, 20, 24, 0.98) 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  z-index: 5;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.dashboard-home .lb-card:hover .lb-poster-bottom-bar {
  opacity: 1;
  pointer-events: auto;
}

.dashboard-home .lb-quick-stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  user-select: none;
}

.dashboard-home .lb-quick-star {
  font-size: 0.92rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.26);
  cursor: pointer;
  padding: 2px 1px;
  transition: color 0.1s ease, transform 0.1s ease;
}

.dashboard-home .lb-quick-star.is-lit {
  color: var(--медиа-акцент);
}

.dashboard-home .lb-quick-star:hover {
  transform: scale(1.14);
}

.dashboard-home .lb-quick-edit-icon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 3px !important;
  height: 22px !important;
  min-height: 22px !important;
  font-size: 0.78rem !important;
  color: var(--медиа-текст-приглушённый) !important;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.dashboard-home .lb-quick-edit-icon:hover {
  color: #ffffff !important;
}

@media (hover: none) and (pointer: coarse) {
  .dashboard-home .lb-poster-corner-btn.is-right {
    opacity: 1;
    pointer-events: auto;
  }
}

/* Подпись под постером: Название (одна строка, ellipsis), ниже звёзды и год */
.dashboard-home .lb-card-caption {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 1px 0 1px;
  min-width: 0;
}

.dashboard-home .lb-caption-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-normal);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dashboard-home .lb-caption-title:hover {
  color: var(--медиа-акцент);
}

.dashboard-home .lb-caption-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 15px;
  font-size: 0.72rem;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-stars {
  font-size: 0.73rem;
  color: var(--медиа-акцент);
  letter-spacing: 0.5px;
  line-height: 1;
  white-space: nowrap;
}

.dashboard-home .lb-caption-year {
  font-size: 0.71rem;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 5. ХРОНОЛОГИЧЕСКИЙ ДНЕВНИК */
.dashboard-home .lb-diary-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-home .lb-diary-month {
  border-top: 1px solid var(--медиа-разделитель);
}

.dashboard-home .lb-diary-month-head {
  padding: 10px 0 6px 0;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--медиа-текст-приглушённый);
  display: flex;
  justify-content: space-between;
}

.dashboard-home .lb-diary-row {
  display: grid;
  grid-template-columns: 42px 36px minmax(140px, 1.5fr) minmax(100px, 1fr) 110px 36px;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--медиа-разделитель);
  font-size: 0.82rem;
}

.dashboard-home .lb-diary-day {
  font-size: 1rem;
  font-weight: 700;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dashboard-home .lb-diary-thumb {
  width: 32px;
  height: 48px;
  border-radius: 3px;
  object-fit: cover;
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
}

/* 6. МОДАЛЬНЫЕ ОКНА И ТАЧ-ПАНЕЛЬ */
.lb-action-sheet-modal {
  width: min(440px, 94vw) !important;
  border-radius: 12px !important;
  padding: 16px !important;
  background: #181d22 !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  animation: lbSheetSlideUp 0.18s ease both;
}

.lb-sheet-head {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--медиа-разделитель);
  margin-bottom: 12px;
}

.lb-sheet-thumb {
  width: 50px;
  height: 75px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  flex-shrink: 0;
}

.lb-sheet-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lb-sheet-title {
  font-size: 0.96rem;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.25;
}

.lb-sheet-sub {
  font-size: 0.76rem;
  color: var(--медиа-текст-приглушённый);
}

.lb-sheet-review {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-normal);
  background: var(--медиа-фон-карточки);
  padding: 8px 10px;
  border-radius: 6px;
  border-left: 3px solid var(--медиа-акцент);
  margin-bottom: 12px;
}

.lb-sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lb-sheet-btn {
  width: 100% !important;
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border-radius: 6px !important;
  font-size: 0.84rem !important;
  font-weight: 600 !important;
  background: var(--медиа-фон-карточки) !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  color: var(--text-normal) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  cursor: pointer;
  box-shadow: none !important;
}

.lb-sheet-btn:hover {
  border-color: var(--медиа-акцент) !important;
}

.lb-modal-grid {
  display: grid;
  grid-template-columns: 145px 1fr;
  gap: 16px;
  align-items: start;
}

.lb-modal-poster-preview {
  width: 145px;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.78rem;
  color: var(--медиа-текст-приглушённый);
}

.lb-modal-poster-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lb-poster-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
  margin-top: 10px;
  max-height: 260px;
  overflow-y: auto;
}

.lb-poster-choice {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
}

.lb-poster-choice.is-selected {
  border-color: var(--медиа-акцент);
}

.lb-poster-choice img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dashboard-home .lb-pagination-section {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.dashboard-home .lb-more-btn {
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  padding: 7px 20px;
  min-height: 36px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-more-btn:hover {
  color: #ffffff;
  border-color: var(--медиа-акцент);
}

.dashboard-home .lb-empty-msg {
  padding: 32px 18px;
  text-align: center;
  color: var(--медиа-текст-приглушённый);
  background: rgba(28, 34, 40, 0.35);
  border: 1px dashed var(--медиа-разделитель);
  border-radius: 6px;
  font-size: 0.84rem;
}

@media (max-width: 760px) {
  .dashboard-home .lb-toolbar-ratings-layout {
    flex-direction: column;
    align-items: stretch;
  }
  .dashboard-home .lb-ratings-widget {
    width: 100%;
    min-width: 0;
  }
  .lb-modal-grid {
    grid-template-columns: 1fr;
  }
  .lb-modal-poster-preview {
    margin: 0 auto;
  }
  .dashboard-home .lb-top4-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
  .dashboard-home .lb-diary-row {
    grid-template-columns: 36px 1fr 84px 34px;
  }
  .dashboard-home .lb-diary-thumb,
  .dashboard-home .lb-diary-creator-col {
    display: none;
  }
}
`;

// Состояние сессии UI (функционал «Списки» полностью удалён)
const defaultState = {
  activeCategory: "Фильм", // "Фильм" | "Сериал" | "Игра"
  viewMode: "grid",        // "grid" | "diary"
  quickWatchlist: false,
  onlyFavorites: false,
  yearFilter: "Все",
  decadeFilter: "Все",
  statusFilter: "Все",
  genreFilter: "Все",
  creatorFilter: "Все",
  platformFilter: "Все",
  ratingFilter: null,
  searchQuery: "",
  sortBy: "date_desc",
  top4Open: true,
  page: 1,
  pageSize: 24
};

if (!window.dhMediaState || typeof window.dhMediaState !== "object") {
  window.dhMediaState = { ...defaultState };
} else {
  const s = window.dhMediaState;
  for (const [k, v] of Object.entries(defaultState)) {
    if (s[k] === undefined) s[k] = v;
  }
  if (!["Фильм", "Сериал", "Игра"].includes(s.activeCategory)) {
    s.activeCategory = "Фильм";
  }
  if (!["grid", "diary"].includes(s.viewMode)) {
    s.viewMode = "grid";
  }
  delete s.listFilter;
}
const state = window.dhMediaState;

async function updateMediaFrontmatter(filePath, mutator) {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!file) {
    notify("Файл заметки не найден.");
    return;
  }
  await app.fileManager.processFrontMatter(file, mutator);
}

// ==========================================================================
// МОДАЛЬНОЕ ОКНО ВЫБОРА / СМЕНЫ ПОСТЕРА
// ==========================================================================
class PosterPickerModal extends obsidian.Modal {
  constructor(app, item, onSaved) {
    super(app);
    this.item = item;
    this.onSaved = onSaved;
    this.currentPoster = String(item["постер"] || "").trim();
    this.altPosters = [...new Set([
      ...(this.currentPoster ? [this.currentPoster] : []),
      ...flatArray(item["постеры_альт"])
    ])];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const title = this.item["название"] || this.item.file.name;
    contentEl.createEl("h3", { text: `🖼 Постеры: ${title}` });

    const urlRow = contentEl.createDiv({
      attr: { style: "display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap;" }
    });
    const urlInput = urlRow.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Вставь ссылку на постер или [[файл.jpg]]…",
        value: this.currentPoster,
        style: "flex: 1; min-width: 180px; height: 34px; padding: 0 10px; border-radius: 4px;"
      }
    });

    const addAltBtn = urlRow.createEl("button", {
      text: "＋ В коллекцию",
      attr: { type: "button", style: "height: 34px; border-radius: 4px; cursor: pointer;" }
    });

    const applyBtn = urlRow.createEl("button", {
      cls: "mod-cta",
      text: "Сделать основным",
      attr: { type: "button", style: "height: 34px; border-radius: 4px; cursor: pointer;" }
    });

    const vaultImages = app.vault.getFiles().filter(f =>
      f.path.startsWith(MEDIA_ROOT_FOLDER) &&
      ["png", "jpg", "jpeg", "webp", "avif"].includes(f.extension.toLowerCase())
    );

    contentEl.createDiv({
      text: "Доступные обложки (выбери кликом):",
      attr: { style: "font-size: 0.78rem; color: var(--text-muted); margin-top: 6px;" }
    });

    const gallery = contentEl.createDiv({ cls: "lb-poster-gallery" });

    const renderGallery = () => {
      gallery.empty();
      const candidates = [...new Set([
        ...this.altPosters,
        ...vaultImages.slice(0, 12).map(f => `[[${f.name}]]`)
      ])];

      if (candidates.length === 0) {
        gallery.createDiv({
          text: "Пока нет сохранённых вариантов. Вставь ссылку в поле выше.",
          attr: { style: "grid-column: 1 / -1; color: var(--text-muted); font-size: 0.78rem; padding: 12px 0;" }
        });
        return;
      }

      candidates.forEach(rawUrl => {
        const src = resolvePosterSrc(rawUrl, this.item.file.path);
        if (!src) return;
        const box = gallery.createDiv({
          cls: `lb-poster-choice ${rawUrl === this.currentPoster ? "is-selected" : ""}`,
          attr: { title: rawUrl }
        });
        box.createEl("img", { attr: { src } });
        box.onclick = () => {
          this.currentPoster = rawUrl;
          urlInput.value = rawUrl;
          renderGallery();
        };
      });
    };

    renderGallery();

    addAltBtn.onclick = () => {
      const val = urlInput.value.trim();
      if (!val) return;
      if (!this.altPosters.includes(val)) this.altPosters.push(val);
      this.currentPoster = val;
      renderGallery();
    };

    applyBtn.onclick = async () => {
      const chosen = urlInput.value.trim();
      if (chosen && !this.altPosters.includes(chosen)) {
        this.altPosters.push(chosen);
      }
      await updateMediaFrontmatter(this.item.file.path, fm => {
        if (chosen) fm["постер"] = chosen;
        else delete fm["постер"];
        if (this.altPosters.length > 1) {
          fm["постеры_альт"] = this.altPosters;
        }
      });
      notify(`Постер обновлён для «${title}»`);
      this.close();
      if (this.onSaved) this.onSaved();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==========================================================================
// МЕНЮ ДЕЙСТВИЙ С КАРТОЧКОЙ (ПО КНОПКЕ «⋯»)
// ==========================================================================
class PosterActionSheetModal extends obsidian.Modal {
  constructor(app, item, onUpdated) {
    super(app);
    this.item = item;
    this.onUpdated = onUpdated;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("lb-action-sheet-modal");
    contentEl.empty();

    const item = this.item;
    const schema = getSchemaForType(item["тип"]);
    const title = item["название"] || item.file.name;
    const creators = getItemCreators(item);
    const posterSrc = resolvePosterSrc(item["постер"], item.file.path);
    const rewatchCount = getRewatchCount(item);

    const head = contentEl.createDiv({ cls: "lb-sheet-head" });
    if (posterSrc) {
      head.createEl("img", { cls: "lb-sheet-thumb", attr: { src: posterSrc } });
    }
    const info = head.createDiv({ cls: "lb-sheet-info" });
    info.createDiv({ cls: "lb-sheet-title", text: title });

    const subParts = [
      item["год"],
      creators.join(", "),
      formatStars(item["оценка"]),
      item["статус"]
    ].filter(Boolean);
    info.createDiv({ cls: "lb-sheet-sub", text: subParts.join(" · ") });

    if (item["отзыв"]) {
      contentEl.createDiv({ cls: "lb-sheet-review", text: `«${item["отзыв"]}»` });
    }

    const actions = contentEl.createDiv({ cls: "lb-sheet-actions" });

    const openNoteBtn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    openNoteBtn.createSpan({ text: "📄 Открыть заметку" });
    openNoteBtn.createSpan({ text: "→" });
    openNoteBtn.onclick = () => {
      this.close();
      app.workspace.openLinkText(item.file.path, "", false);
    };

    const editBtn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    editBtn.createSpan({ text: "✎ Оценить" });
    editBtn.createSpan({ text: formatStars(item["оценка"]) || "—" });
    editBtn.onclick = () => {
      this.close();
      new MediaLogModal(app, item["тип"], item, this.onUpdated).open();
    };

    const favBtn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    favBtn.createSpan({ text: item["любимое"] ? "♥ Убрать из любимого" : "♡ Добавить в любимое" });
    favBtn.createSpan({ text: item["любимое"] ? "♥" : "♡" });
    favBtn.onclick = async () => {
      const nextFav = !item["любимое"];
      await updateMediaFrontmatter(item.file.path, fm => {
        fm["любимое"] = nextFav;
      });
      this.close();
      if (this.onUpdated) this.onUpdated();
    };

    const top4Btn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    top4Btn.createSpan({ text: item["топ_4"] ? "📌 Убрать из витрины Топ-4" : "📌 Закрепить в витрине Топ-4" });
    top4Btn.createSpan({ text: item["топ_4"] ? "В Топ-4 ✓" : "" });
    top4Btn.onclick = async () => {
      const nextTop = !item["топ_4"];
      await updateMediaFrontmatter(item.file.path, fm => {
        if (nextTop) fm["топ_4"] = true;
        else delete fm["топ_4"];
      });
      this.close();
      if (this.onUpdated) this.onUpdated();
    };

    const rewatchBtn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    rewatchBtn.createSpan({ text: `🔄 ${schema.rewatchLabel} (+1)` });
    rewatchBtn.createSpan({ text: rewatchCount > 0 ? `Повторов: ${rewatchCount}` : "0" });
    rewatchBtn.onclick = async () => {
      const nextCount = rewatchCount + 1;
      await updateMediaFrontmatter(item.file.path, fm => {
        fm["пересмотр"] = true;
        fm["количество_повторов"] = nextCount;
      });
      notify(`${schema.rewatchLabel}: ${nextCount}`);
      this.close();
      if (this.onUpdated) this.onUpdated();
    };

    const posterBtn = actions.createEl("button", {
      cls: "lb-sheet-btn",
      attr: { type: "button" }
    });
    posterBtn.createSpan({ text: "🖼 Сменить постер" });
    posterBtn.createSpan({ text: "⋯" });
    posterBtn.onclick = () => {
      this.close();
      new PosterPickerModal(app, item, this.onUpdated).open();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==========================================================================
// МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ И РЕДАКТИРОВАНИЯ ЗАПИСИ
// ==========================================================================
class MediaLogModal extends obsidian.Modal {
  constructor(app, initialType, existingItem, onSaved) {
    super(app);
    this.existingItem = existingItem || null;
    this.onSaved = onSaved;

    const cleanInitialType = ["Фильм", "Сериал", "Игра"].includes(initialType)
      ? initialType
      : "Фильм";

    const ex = this.existingItem;
    const type = ex ? String(ex["тип"] || cleanInitialType) : cleanInitialType;
    const schema = getSchemaForType(type);

    this.data = {
      type,
      title: ex ? String(ex["название"] || ex.file.name) : "",
      year: ex && parseOptionalNum(ex["год"]) !== null ? Number(ex["год"]) : new Date().getFullYear(),
      rating: ex && parseOptionalNum(ex["оценка"]) !== null ? Number(ex["оценка"]) : 0,
      status: ex && ex["статус"] ? String(ex["статус"]) : schema.defaultDoneStatus,
      date: ex ? (getItemDateISO(ex) || todayLocalISO()) : todayLocalISO(),
      poster: ex ? String(ex["постер"] || "") : "",
      favorite: ex ? Boolean(ex["любимое"]) : false,
      top4: ex ? Boolean(ex["топ_4"]) : false,
      rewatch: ex ? Boolean(ex["пересмотр"]) : false,
      rewatchCount: ex ? getRewatchCount(ex) : 0,
      creator: ex ? getItemCreators(ex).join(", ") : "",
      runtimeMin: ex && parseOptionalNum(ex["длительность_мин"]) !== null ? Number(ex["длительность_мин"]) : "",
      seasons: ex && parseOptionalNum(ex["сезонов"]) !== null ? Number(ex["сезонов"]) : "",
      episodes: ex && parseOptionalNum(ex["серий"]) !== null ? Number(ex["серий"]) : "",
      platform: ex ? flatArray(ex["платформа"]).join(", ") : "ПК",
      hoursPlayed: ex && parseOptionalNum(ex["часов_наиграно"]) !== null ? Number(ex["часов_наиграно"]) : "",
      genres: ex ? flatArray(ex["жанр"]).join(", ") : "",
      mediaTags: ex ? flatArray(ex["теги_медиа"]).join(", ") : "",
      review: ex ? String(ex["отзыв"] || "") : ""
    };
  }

  onOpen() {
    this.renderForm();
  }

  renderForm() {
    const { contentEl } = this;
    contentEl.empty();

    const schema = getSchemaForType(this.data.type);
    contentEl.createEl("h2", {
      text: this.existingItem
        ? `${schema.icon} ${I18N.modalEditTitle}: ${this.data.title}`
        : `${schema.icon} ${I18N.modalAddTitle}`
    });

    const layout = contentEl.createDiv({ cls: "lb-modal-grid" });
    const leftCol = layout.createDiv();
    const previewBox = leftCol.createDiv({ cls: "lb-modal-poster-preview" });

    const updatePreview = () => {
      previewBox.empty();
      const src = resolvePosterSrc(this.data.poster, this.existingItem?.file?.path || "");
      if (src) {
        previewBox.createEl("img", { attr: { src } });
      } else {
        previewBox.createDiv({ text: `${schema.icon}\nПостер` });
      }
    };
    updatePreview();

    const rightCol = layout.createDiv();

    if (!this.existingItem) {
      new obsidian.Setting(rightCol)
        .setName("Категория")
        .addDropdown(d => d
          .addOption("Фильм", "🎬 Фильм")
          .addOption("Сериал", "📺 Сериал")
          .addOption("Игра", "🎮 Игра")
          .setValue(this.data.type)
          .onChange(v => {
            this.data.type = v;
            const nextSchema = getSchemaForType(v);
            if (!nextSchema.statuses.includes(this.data.status)) {
              this.data.status = nextSchema.defaultDoneStatus;
            }
            this.renderForm();
          }));
    }

    new obsidian.Setting(rightCol)
      .setName("Название")
      .addText(t => t
        .setPlaceholder(this.data.type === "Игра" ? "Death Stranding" : "Дюна: Часть вторая")
        .setValue(this.data.title)
        .onChange(v => { this.data.title = v; }));

    new obsidian.Setting(rightCol)
      .setName(schema.creatorLabel)
      .setDesc("Через запятую для фильтрации")
      .addText(t => t
        .setPlaceholder(schema.creatorPlaceholder)
        .setValue(this.data.creator)
        .onChange(v => { this.data.creator = v; }));

    if (this.data.type === "Фильм") {
      new obsidian.Setting(rightCol)
        .setName("Год выхода и хронометраж (мин)")
        .addText(t => t
          .setPlaceholder("Год (2024)")
          .setValue(String(this.data.year ?? ""))
          .onChange(v => { this.data.year = parseOptionalNum(v); }))
        .addText(t => t
          .setPlaceholder("Мин (166)")
          .setValue(String(this.data.runtimeMin ?? ""))
          .onChange(v => { this.data.runtimeMin = parseOptionalNum(v) ?? ""; }));
    } else if (this.data.type === "Сериал") {
      new obsidian.Setting(rightCol)
        .setName("Год, сезоны и серии")
        .addText(t => t
          .setPlaceholder("Год")
          .setValue(String(this.data.year ?? ""))
          .onChange(v => { this.data.year = parseOptionalNum(v); }))
        .addText(t => t
          .setPlaceholder("Сезонов")
          .setValue(String(this.data.seasons ?? ""))
          .onChange(v => { this.data.seasons = parseOptionalNum(v) ?? ""; }))
        .addText(t => t
          .setPlaceholder("Серий")
          .setValue(String(this.data.episodes ?? ""))
          .onChange(v => { this.data.episodes = parseOptionalNum(v) ?? ""; }));
    } else if (this.data.type === "Игра") {
      new obsidian.Setting(rightCol)
        .setName("Год, платформа и наиграно часов")
        .addText(t => t
          .setPlaceholder("Год")
          .setValue(String(this.data.year ?? ""))
          .onChange(v => { this.data.year = parseOptionalNum(v); }))
        .addText(t => t
          .setPlaceholder("ПК, PS5")
          .setValue(this.data.platform)
          .onChange(v => { this.data.platform = v; }))
        .addText(t => t
          .setPlaceholder("Часов (85)")
          .setValue(String(this.data.hoursPlayed ?? ""))
          .onChange(v => { this.data.hoursPlayed = parseOptionalNum(v) ?? ""; }));
    }

    new obsidian.Setting(rightCol)
      .setName(`Статус и ${schema.dateLabel.toLowerCase()}`)
      .addDropdown(d => {
        schema.statuses.forEach(st => d.addOption(st, st));
        d.setValue(this.data.status);
        d.onChange(v => { this.data.status = v; });
      })
      .addText(t => t
        .setPlaceholder("ГГГГ-ММ-ДД")
        .setValue(this.data.date)
        .onChange(v => { this.data.date = v.trim(); }));

    const ratingLabel = val => val > 0
      ? `Оценка: ${(val / 2).toFixed(1).replace(".0", "")} из 5 (${formatStars(val)})`
      : "Оценка: не записано";

    const ratingSetting = new obsidian.Setting(rightCol)
      .setName(ratingLabel(this.data.rating))
      .addSlider(s => s
        .setLimits(0, 10, 1)
        .setValue(this.data.rating)
        .setDynamicTooltip()
        .onChange(v => {
          this.data.rating = v;
          ratingSetting.setName(ratingLabel(v));
        }));

    new obsidian.Setting(rightCol)
      .setName("♥ Любимое / 📌 В Топ-4 / 🔄 Число повторов")
      .addToggle(tg => tg
        .setTooltip("♥ Любимое")
        .setValue(this.data.favorite)
        .onChange(v => { this.data.favorite = v; }))
      .addToggle(tg => tg
        .setTooltip("📌 Закрепить в витрине Топ-4")
        .setValue(this.data.top4)
        .onChange(v => { this.data.top4 = v; }))
      .addText(t => t
        .setPlaceholder("Повторов (0)")
        .setValue(this.data.rewatchCount > 0 ? String(this.data.rewatchCount) : "")
        .onChange(v => {
          const n = parseOptionalNum(v);
          this.data.rewatchCount = n !== null && n > 0 ? Math.round(n) : 0;
          this.data.rewatch = this.data.rewatchCount > 0;
        }));

    new obsidian.Setting(rightCol)
      .setName("Постер (ссылка или [[файл.jpg]])")
      .addText(t => t
        .setPlaceholder("https://image.tmdb.org/...")
        .setValue(this.data.poster)
        .onChange(v => {
          this.data.poster = v.trim();
          updatePreview();
        }));

    new obsidian.Setting(rightCol)
      .setName("Жанры и ключевые слова")
      .addText(t => t
        .setPlaceholder("Жанры: фантастика, триллер")
        .setValue(this.data.genres)
        .onChange(v => { this.data.genres = v; }))
      .addText(t => t
        .setPlaceholder("Ключевые слова: космос, атмосфера")
        .setValue(this.data.mediaTags)
        .onChange(v => { this.data.mediaTags = v; }));

    new obsidian.Setting(contentEl)
      .setName("Рецензия / короткая заметка о просмотре")
      .addTextArea(t => {
        t.setValue(this.data.review);
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.onChange(v => { this.data.review = v; });
      });

    new obsidian.Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.existingItem ? I18N.saveChanges : I18N.saveNew)
        .setCta()
        .onClick(async () => {
          if (!this.data.title.trim()) {
            notify("Укажи название!");
            return;
          }
          await this.saveEntry();
          this.close();
          if (this.onSaved) this.onSaved();
        }));
  }

  async saveEntry() {
    const schema = getSchemaForType(this.data.type);
    const splitClean = str => String(str || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const creatorsList = splitClean(this.data.creator);
    const genresList = splitClean(this.data.genres);
    const tagsArray = splitClean(this.data.mediaTags);
    const platformsList = splitClean(this.data.platform);
    const cleanDate = toISODateStr(this.data.date);

    if (this.existingItem) {
      await updateMediaFrontmatter(this.existingItem.file.path, fm => {
        fm["тип"] = this.data.type;
        fm["название"] = this.data.title.trim();
        if (this.data.year !== null) fm["год"] = Number(this.data.year);
        else delete fm["год"];

        if (this.data.poster) fm["постер"] = this.data.poster;
        else delete fm["постер"];

        // Пустое значение — это «не записано», а не 0
        if (this.data.rating > 0) fm["оценка"] = Number(this.data.rating);
        else delete fm["оценка"];

        fm["статус"] = this.data.status;
        if (cleanDate) fm[schema.dateKey] = cleanDate;
        else delete fm[schema.dateKey];

        fm["любимое"] = Boolean(this.data.favorite);
        if (this.data.top4) fm["топ_4"] = true;
        else delete fm["топ_4"];

        fm["пересмотр"] = Boolean(this.data.rewatchCount > 0 || this.data.rewatch);
        if (this.data.rewatchCount > 0) fm["количество_повторов"] = Number(this.data.rewatchCount);
        else delete fm["количество_повторов"];

        fm[schema.creatorKey] = creatorsList.length <= 1 ? (creatorsList[0] || "") : creatorsList;
        fm["жанр"] = genresList;

        if (tagsArray.length > 0) fm["теги_медиа"] = tagsArray;
        else delete fm["теги_медиа"];

        if (this.data.review.trim()) fm["отзыв"] = this.data.review.trim();
        else delete fm["отзыв"];

        if (this.data.type === "Фильм") {
          if (this.data.runtimeMin !== "") fm["длительность_мин"] = Number(this.data.runtimeMin);
          else delete fm["длительность_мин"];
        } else if (this.data.type === "Сериал") {
          if (this.data.seasons !== "") fm["сезонов"] = Number(this.data.seasons);
          else delete fm["сезонов"];
          if (this.data.episodes !== "") fm["серий"] = Number(this.data.episodes);
          else delete fm["серий"];
        } else if (this.data.type === "Игра") {
          if (platformsList.length > 0) fm["платформа"] = platformsList;
          if (this.data.hoursPlayed !== "") fm["часов_наиграно"] = Number(this.data.hoursPlayed);
          else delete fm["часов_наиграно"];
        }
      });
      notify(`Сохранено: «${this.data.title}»`);
      return;
    }

    const folder = `${MEDIA_ROOT_FOLDER}/${schema.folder}`;
    const parts = folder.split("/");
    let cur = "";
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(cur)) {
        await app.vault.createFolder(cur);
      }
    }

    const cleanTitle = this.data.title.trim().replace(/[\\/:*?"<>|]/g, "");
    const filePath = `${folder}/${cleanTitle}.md`;

    if (app.vault.getAbstractFileByPath(filePath)) {
      notify(`Заметка «${cleanTitle}» уже существует в ${folder}!`);
      return;
    }

    const createdFile = await app.vault.create(filePath, `# ${this.data.title.trim()}\n`);
    await app.fileManager.processFrontMatter(createdFile, fm => {
      fm["направление"] = "Медиа";
      fm["тип"] = this.data.type;
      fm["название"] = this.data.title.trim();
      if (this.data.year !== null) fm["год"] = Number(this.data.year);
      fm[schema.creatorKey] = creatorsList.length > 1 ? creatorsList : (creatorsList[0] || "");

      if (this.data.type === "Фильм" && this.data.runtimeMin !== "") {
        fm["длительность_мин"] = Number(this.data.runtimeMin);
      } else if (this.data.type === "Сериал") {
        if (this.data.seasons !== "") fm["сезонов"] = Number(this.data.seasons);
        if (this.data.episodes !== "") fm["серий"] = Number(this.data.episodes);
      } else if (this.data.type === "Игра") {
        fm["платформа"] = platformsList.length ? platformsList : ["ПК"];
        if (this.data.hoursPlayed !== "") fm["часов_наиграно"] = Number(this.data.hoursPlayed);
      }

      if (this.data.poster) fm["постер"] = this.data.poster;
      if (this.data.rating > 0) fm["оценка"] = Number(this.data.rating);
      fm["статус"] = this.data.status;
      if (cleanDate) fm[schema.dateKey] = cleanDate;
      fm["любимое"] = Boolean(this.data.favorite);
      if (this.data.top4) fm["топ_4"] = true;
      fm["пересмотр"] = Boolean(this.data.rewatchCount > 0 || this.data.rewatch);
      if (this.data.rewatchCount > 0) fm["количество_повторов"] = Number(this.data.rewatchCount);
      if (genresList.length > 0) fm["жанр"] = genresList;
      if (tagsArray.length > 0) fm["теги_медиа"] = tagsArray;
      if (this.data.review.trim()) fm["отзыв"] = this.data.review.trim();
    });

    notify(`Добавлено в медиатеку: «${this.data.title}»`);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==========================================================================
// КАРКАС ДАШБОРДА И ФУНКЦИИ ОТРИСОВКИ
// ==========================================================================
const navContainer = root.createDiv({ cls: "lb-nav-stack" });
const top4Container = root.createDiv({ cls: "lb-top4-host" });
const toolbarAndRatingsContainer = root.createDiv({ cls: "lb-toolbar-ratings-layout" });
const gridContainer = root.createDiv({ cls: "lb-grid-section" });
const paginationContainer = root.createDiv({ cls: "lb-pagination-section" });

function getAllMediaPages() {
  return dv.pages(`"${MEDIA_ROOT_FOLDER}"`).where(p => {
    const t = String(p["тип"] || "").trim();
    return Boolean(t) && p.file.name !== "🎬Медиатека";
  }).values;
}

function getCategoryPages(allMedia) {
  const cat = state.activeCategory.toLowerCase();
  return allMedia.filter(p => String(p["тип"] || "").trim().toLowerCase() === cat);
}

// 1. Отрисовка двухуровневой навигации (без «Списков» и лишних рамок)
function renderNavigation(allMedia, categoryItems) {
  navContainer.empty();

  const catCounts = {
    "Фильм": allMedia.filter(p => String(p["тип"]).toLowerCase() === "фильм").length,
    "Сериал": allMedia.filter(p => String(p["тип"]).toLowerCase() === "сериал").length,
    "Игра": allMedia.filter(p => String(p["тип"]).toLowerCase() === "игра").length
  };

  const primaryBar = navContainer.createDiv({ cls: "lb-primary-bar" });
  const primaryTabs = primaryBar.createDiv({ cls: "lb-primary-tabs" });

  [
    { id: "Фильм", label: "🎬 Фильмы" },
    { id: "Сериал", label: "📺 Сериалы" },
    { id: "Игра", label: "🎮 Игры" }
  ].forEach(tab => {
    const isAct = state.activeCategory === tab.id;
    const btn = primaryTabs.createEl("button", {
      cls: `lb-primary-tab ${isAct ? "is-active" : ""}`,
      attr: { type: "button", "aria-pressed": String(isAct) }
    });
    btn.createSpan({ text: tab.label });
    btn.createSpan({ cls: "lb-primary-count", text: String(catCounts[tab.id] ?? 0) });

    btn.onclick = () => {
      if (state.activeCategory === tab.id) return;
      state.activeCategory = tab.id;
      state.creatorFilter = "Все";
      state.genreFilter = "Все";
      state.platformFilter = "Все";
      state.decadeFilter = "Все";
      state.statusFilter = "Все";
      state.ratingFilter = null;
      state.page = 1;
      renderDashboard();
    };
  });

  const addBtn = primaryBar.createEl("button", {
    cls: "lb-add-cta",
    text: I18N.addEntry,
    attr: { type: "button" }
  });
  addBtn.onclick = () => {
    new MediaLogModal(app, state.activeCategory, null, () => renderDashboard()).open();
  };

  const secondaryBar = navContainer.createDiv({ cls: "lb-secondary-bar" });
  const viewModes = secondaryBar.createDiv({ cls: "lb-view-modes" });

  const diaryCount = categoryItems.filter(p => isItemCompleted(p) && Boolean(getItemDateISO(p))).length;

  [
    { id: "grid", label: I18N.postersView, count: categoryItems.length },
    { id: "diary", label: I18N.diaryView, count: diaryCount }
  ].forEach(vm => {
    const isAct = state.viewMode === vm.id;
    const b = viewModes.createEl("button", {
      cls: `lb-sub-btn ${isAct ? "is-active" : ""}`,
      attr: { type: "button" }
    });
    b.createSpan({ text: vm.label });
    b.createSpan({ cls: "lb-sub-count", text: String(vm.count) });
    b.onclick = () => {
      state.viewMode = vm.id;
      state.page = 1;
      renderDashboard();
    };
  });

  const quickSlices = secondaryBar.createDiv({ cls: "lb-quick-slices" });
  const watchlistCount = categoryItems.filter(isItemWatchlist).length;
  const favCount = categoryItems.filter(p => p["любимое"] === true).length;

  const wlBtn = quickSlices.createEl("button", {
    cls: `lb-sub-btn ${state.quickWatchlist ? "is-active" : ""}`,
    attr: { type: "button", title: I18N.watchlistHint }
  });
  wlBtn.createSpan({ text: I18N.watchlistSlice });
  wlBtn.createSpan({ cls: "lb-sub-count", text: String(watchlistCount) });
  wlBtn.onclick = () => {
    state.quickWatchlist = !state.quickWatchlist;
    if (state.quickWatchlist) state.statusFilter = "В планах";
    else if (state.statusFilter === "В планах") state.statusFilter = "Все";
    state.page = 1;
    renderDashboard();
  };

  const favBtn = quickSlices.createEl("button", {
    cls: `lb-sub-btn ${state.onlyFavorites ? "is-active" : ""}`,
    attr: { type: "button", title: I18N.favHint }
  });
  favBtn.createSpan({ text: I18N.favSlice });
  favBtn.createSpan({ cls: "lb-sub-count", text: String(favCount) });
  favBtn.onclick = () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.page = 1;
    renderDashboard();
  };
}

// 2. Витрина «Топ-4 любимых»
function renderTop4Showcase(categoryItems) {
  top4Container.empty();
  if (state.viewMode !== "grid" || state.quickWatchlist || state.searchQuery.trim()) return;

  const explicitTop4 = categoryItems.filter(p => p["топ_4"] === true);
  let showcaseItems = [...explicitTop4];

  if (showcaseItems.length < 4) {
    const favCandidates = categoryItems
      .filter(p => p["любимое"] === true && !showcaseItems.includes(p))
      .sort((a, b) => parseNum(b["оценка"], 0) - parseNum(a["оценка"], 0));
    showcaseItems.push(...favCandidates.slice(0, 4 - showcaseItems.length));
  } else {
    showcaseItems = showcaseItems.slice(0, 4);
  }

  if (showcaseItems.length === 0) return;

  const details = top4Container.createEl("details", { cls: "lb-top4-section" });
  details.open = Boolean(state.top4Open);
  details.ontoggle = () => { state.top4Open = details.open; };

  const schema = getSchemaForType(state.activeCategory);
  const summary = details.createEl("summary");
  summary.createSpan({ text: `★ Топ-${showcaseItems.length} любимых · ${schema.pluralTitle}` });
  summary.createSpan({ text: details.open ? "Свернуть ▲" : "Развернуть ▾", attr: { style: "font-size: 0.7rem;" } });

  const grid = details.createDiv({ cls: "lb-top4-grid" });
  showcaseItems.forEach((item, idx) => {
    renderPosterCard(grid, item, idx);
  });
}

// 3. Фильтры (включая компактный выбор года) + Акцентная гистограмма оценок Letterboxd (Задачи 4, 5, 6)
function renderToolbarAndRatings(categoryItems) {
  toolbarAndRatingsContainer.empty();
  const schema = getSchemaForType(state.activeCategory);

  const availableYears = new Set();
  categoryItems.forEach(item => {
    const iso = getItemDateISO(item);
    if (/^\d{4}/.test(iso)) availableYears.add(iso.slice(0, 4));
  });
  const sortedYears = [...availableYears].sort((a, b) => b.localeCompare(a));
  if (state.yearFilter !== "Все" && !availableYears.has(state.yearFilter)) {
    state.yearFilter = "Все";
  }

  const yearScoped = state.yearFilter === "Все"
    ? categoryItems
    : categoryItems.filter(i => getItemDateISO(i).startsWith(state.yearFilter));

  // Пустые значения («не записано») в график не попадают
  const ratedItems = yearScoped.filter(i => {
    const val = parseOptionalNum(i["оценка"]);
    return val !== null && val > 0;
  });

  // Левая колонка: фильтры + компактный год + топ авторов
  const filtersCol = toolbarAndRatingsContainer.createDiv({ cls: "lb-filters-column" });
  const bar = filtersCol.createDiv({ cls: "lb-filters-bar" });

  const searchInput = bar.createEl("input", {
    cls: "lb-search-input",
    attr: {
      type: "search",
      placeholder: `Поиск по названию, ${schema.creatorLabel.toLowerCase()}…`,
      value: state.searchQuery
    }
  });
  searchInput.oninput = () => {
    state.searchQuery = searchInput.value;
    state.page = 1;
    renderContent(categoryItems);
  };

  // Компактный выпадающий фильтр по году просмотра (вместо старых плашек)
  const yearSelect = bar.createEl("select", { cls: "dropdown", attr: { title: "Год просмотра" } });
  yearSelect.createEl("option", { text: I18N.allYears, value: "Все" });
  sortedYears.forEach(yr => {
    const opt = yearSelect.createEl("option", { text: yr, value: yr });
    if (state.yearFilter === yr) opt.selected = true;
  });
  yearSelect.onchange = e => {
    state.yearFilter = e.target.value;
    state.page = 1;
    renderDashboard();
  };

  const statusSelect = bar.createEl("select", { cls: "dropdown" });
  ["Все", ...schema.statuses].forEach(st => {
    const opt = statusSelect.createEl("option", { text: st === "Все" ? I18N.allStatuses : st, value: st });
    if (state.statusFilter === st) opt.selected = true;
  });
  statusSelect.onchange = e => {
    state.statusFilter = e.target.value;
    state.quickWatchlist = state.statusFilter === "В планах";
    state.page = 1;
    renderDashboard();
  };

  const creators = new Set();
  categoryItems.forEach(i => getItemCreators(i).forEach(c => creators.add(c)));

  const creatorSelect = bar.createEl("select", { cls: "dropdown" });
  creatorSelect.createEl("option", { text: schema.creatorFilterAll, value: "Все" });
  [...creators].sort((a, b) => a.localeCompare(b, "ru")).forEach(cr => {
    const opt = creatorSelect.createEl("option", { text: cr, value: cr });
    if (state.creatorFilter === cr) opt.selected = true;
  });
  creatorSelect.onchange = e => {
    state.creatorFilter = e.target.value;
    state.page = 1;
    renderDashboard();
  };

  const genres = new Set();
  categoryItems.forEach(i => flatArray(i["жанр"]).forEach(g => genres.add(g)));

  const genreSelect = bar.createEl("select", { cls: "dropdown" });
  genreSelect.createEl("option", { text: I18N.allGenres, value: "Все" });
  [...genres].sort((a, b) => a.localeCompare(b, "ru")).forEach(g => {
    const opt = genreSelect.createEl("option", { text: g, value: g });
    if (state.genreFilter === g) opt.selected = true;
  });
  genreSelect.onchange = e => {
    state.genreFilter = e.target.value;
    state.page = 1;
    renderDashboard();
  };

  const decades = new Set();
  categoryItems.forEach(i => {
    const dec = getItemDecade(i);
    if (dec) decades.add(dec);
  });
  if (decades.size > 0) {
    const decSelect = bar.createEl("select", { cls: "dropdown" });
    decSelect.createEl("option", { text: I18N.allDecades, value: "Все" });
    [...decades].sort((a, b) => b.localeCompare(a)).forEach(dec => {
      const opt = decSelect.createEl("option", { text: dec, value: dec });
      if (state.decadeFilter === dec) opt.selected = true;
    });
    decSelect.onchange = e => {
      state.decadeFilter = e.target.value;
      state.page = 1;
      renderContent(categoryItems);
    };
  }

  if (state.activeCategory === "Игра") {
    const platforms = new Set();
    categoryItems.forEach(i => flatArray(i["платформа"]).forEach(pl => platforms.add(pl)));
    if (platforms.size > 0) {
      const platSelect = bar.createEl("select", { cls: "dropdown" });
      platSelect.createEl("option", { text: I18N.allPlatforms, value: "Все" });
      [...platforms].sort().forEach(pl => {
        const opt = platSelect.createEl("option", { text: pl, value: pl });
        if (state.platformFilter === pl) opt.selected = true;
      });
      platSelect.onchange = e => {
        state.platformFilter = e.target.value;
        state.page = 1;
        renderContent(categoryItems);
      };
    }
  }

  const sortSelect = bar.createEl("select", { cls: "dropdown" });
  [
    { id: "date_desc", label: I18N.sortDateDesc },
    { id: "rating_desc", label: I18N.sortRatingDesc },
    { id: "year_desc", label: I18N.sortYearDesc },
    { id: "title_asc", label: I18N.sortTitleAsc }
  ].forEach(s => {
    const opt = sortSelect.createEl("option", { text: s.label, value: s.id });
    if (state.sortBy === s.id) opt.selected = true;
  });
  sortSelect.onchange = e => {
    state.sortBy = e.target.value;
    renderContent(categoryItems);
  };

  // Быстрые кнопки авторов периода
  const creatorCounter = new Map();
  yearScoped.forEach(item => {
    getItemCreators(item).forEach(cr => {
      creatorCounter.set(cr, (creatorCounter.get(cr) || 0) + 1);
    });
  });

  const topCreators = [...creatorCounter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 6);

  if (topCreators.length > 0) {
    const creatorsRow = filtersCol.createDiv({ cls: "lb-creators-row" });
    creatorsRow.createSpan({ cls: "lb-creators-label", text: `${schema.creatorFilterAll}:` });

    topCreators.forEach(([name, count]) => {
      const isAct = state.creatorFilter === name;
      const pill = creatorsRow.createEl("button", {
        cls: `lb-creator-pill ${isAct ? "is-active" : ""}`,
        text: `${name} (${count})`,
        attr: { type: "button", title: `Отфильтровать: ${name}` }
      });
      pill.onclick = () => {
        state.creatorFilter = isAct ? "Все" : name;
        state.page = 1;
        renderDashboard();
      };
    });
  }

  // Правая колонка: Акцентный блок «Оценки» в стиле Letterboxd (Задача 5)
  const ratingsWidget = toolbarAndRatingsContainer.createDiv({ cls: "lb-ratings-widget" });
  const rHeader = ratingsWidget.createDiv({ cls: "lb-ratings-header" });
  rHeader.createSpan({ cls: "lb-ratings-title", text: I18N.ratingsHeader });

  // Средняя оценка в масштабе 5.0 (как на Letterboxd)
  const avg5 = ratedItems.length
    ? (ratedItems.reduce((acc, curr) => acc + parseNum(curr["оценка"], 0) / 2, 0) / ratedItems.length).toFixed(1)
    : "—";

  const rMeta = rHeader.createDiv({ cls: "lb-ratings-meta" });
  rMeta.createSpan({ cls: "lb-ratings-count", text: `Оценено: ${ratedItems.length}` });
  rMeta.createSpan({ cls: "lb-ratings-avg", text: avg5 });

  const rBody = ratingsWidget.createDiv({ cls: "lb-ratings-body" });
  rBody.createSpan({ cls: "lb-ratings-edge-star", text: "★" });

  const barsGrid = rBody.createDiv({ cls: "lb-ratings-bars" });
  const counts = Array(10).fill(0);
  ratedItems.forEach(i => {
    const raw = parseNum(i["оценка"], 0);
    const bucket = Math.min(10, Math.max(1, Math.round(raw)));
    counts[bucket - 1]++;
  });
  const maxVal = Math.max(...counts, 0);

  counts.forEach((c, idx) => {
    const bucketScore10 = idx + 1; // 1..10 соответствует 0.5★..5.0★
    const isMax = maxVal > 0 && c === maxVal;
    const isAct = state.ratingFilter === bucketScore10;

    const col = barsGrid.createDiv({
      cls: `lb-rating-col ${isMax ? "is-max" : ""} ${isAct ? "is-active" : ""}`,
      attr: { "aria-label": `${formatStars5Label(bucketScore10)}: ${c}` }
    });

    const heightPct = maxVal > 0 && c > 0 ? Math.max(10, Math.round((c / maxVal) * 100)) : 5;
    col.createDiv({
      cls: "lb-rating-bar",
      attr: { style: `height: ${heightPct}%;` }
    });

    col.createDiv({
      cls: "lb-rating-tooltip",
      text: `${formatStars5Label(bucketScore10)} · ${c}`
    });

    col.onclick = () => {
      state.ratingFilter = state.ratingFilter === bucketScore10 ? null : bucketScore10;
      state.page = 1;
      renderDashboard();
    };
  });

  rBody.createSpan({ cls: "lb-ratings-edge-star", text: "★★★★★" });
}

function applyFiltersAndSort(items) {
  const q = state.searchQuery.trim().toLowerCase();

  const filtered = items.filter(p => {
    if (state.yearFilter !== "Все") {
      const iso = getItemDateISO(p);
      if (!iso.startsWith(state.yearFilter)) return false;
    }
    if (state.quickWatchlist && !isItemWatchlist(p)) return false;
    if (state.statusFilter !== "Все" && p["статус"] !== state.statusFilter) return false;
    if (state.creatorFilter !== "Все") {
      if (!getItemCreators(p).includes(state.creatorFilter)) return false;
    }
    if (state.genreFilter !== "Все") {
      if (!flatArray(p["жанр"]).includes(state.genreFilter)) return false;
    }
    if (state.decadeFilter !== "Все") {
      if (getItemDecade(p) !== state.decadeFilter) return false;
    }
    if (state.activeCategory === "Игра" && state.platformFilter !== "Все") {
      if (!flatArray(p["платформа"]).includes(state.platformFilter)) return false;
    }
    if (state.ratingFilter !== null) {
      const val = parseOptionalNum(p["оценка"]);
      if (val === null || val <= 0) return false;
      const bucket = Math.min(10, Math.max(1, Math.round(val)));
      if (bucket !== state.ratingFilter) return false;
    }
    if (state.onlyFavorites && !p["любимое"]) return false;

    if (q) {
      const hay = [
        p["название"] || p.file.name,
        ...getItemCreators(p),
        ...flatArray(p["жанр"]),
        ...flatArray(p["теги_медиа"]),
        p["отзыв"] || ""
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (state.sortBy === "rating_desc") return parseNum(b["оценка"], 0) - parseNum(a["оценка"], 0);
    if (state.sortBy === "year_desc") return parseNum(b["год"], 0) - parseNum(a["год"], 0);
    if (state.sortBy === "title_asc") {
      return String(a["название"] || a.file.name).localeCompare(String(b["название"] || b.file.name), "ru");
    }
    const dA = getItemDateISO(a) || "0000-00-00";
    const dB = getItemDateISO(b) || "0000-00-00";
    return dB.localeCompare(dA);
  });

  return filtered;
}

// 4. Отрисовка карточки постера (Задачи 1, 2, 7)
function renderPosterCard(parentGrid, item, index) {
  const schema = getSchemaForType(item["тип"]);
  const title = item["название"] || item.file.name;
  const creators = getItemCreators(item);
  const primaryCreator = creators[0] || "";
  const posterSrc = resolvePosterSrc(item["постер"], item.file.path);
  const currentScore10 = parseOptionalNum(item["оценка"]);

  const card = parentGrid.createDiv({
    cls: "lb-card",
    attr: { style: `animation-delay: ${Math.min(index * 14, 200)}ms;` }
  });

  const posterWrapper = card.createDiv({ cls: "lb-poster-wrapper" });

  if (posterSrc) {
    posterWrapper.createEl("img", {
      cls: "lb-poster-img",
      attr: { src: posterSrc, loading: "lazy", alt: title }
    });
  } else {
    const fallback = posterWrapper.createDiv({ cls: "lb-poster-fallback" });
    fallback.createDiv({ cls: "lb-fallback-icon", text: schema.icon });
    fallback.createDiv({ cls: "lb-fallback-title", text: title });
    if (primaryCreator || item["год"]) {
      fallback.createDiv({
        cls: "lb-fallback-sub",
        text: [primaryCreator, item["год"]].filter(Boolean).join(" · ")
      });
    }
  }

  // ЗАДАЧА 1: Сердечко в левом верхнем углу (28x28px), остаётся видимым если активно
  const favBtn = posterWrapper.createEl("button", {
    cls: `lb-poster-corner-btn is-left ${item["любимое"] ? "is-fav" : ""}`,
    text: "♥",
    attr: {
      type: "button",
      title: item["любимое"] ? I18N.favRemove : I18N.favAdd,
      "aria-label": I18N.favSlice
    }
  });
  favBtn.onclick = async e => {
    e.stopPropagation();
    const nextFav = !item["любимое"];
    await updateMediaFrontmatter(item.file.path, fm => { fm["любимое"] = nextFav; });
    item["любимое"] = nextFav;
    renderDashboard();
  };

  // ЗАДАЧА 1: Кнопка «⋯» в правом верхнем углу (28x28px)
  const menuBtn = posterWrapper.createEl("button", {
    cls: "lb-poster-corner-btn is-right",
    text: "⋯",
    attr: {
      type: "button",
      title: I18N.menuAction,
      "aria-label": I18N.menuAction
    }
  });
  menuBtn.onclick = e => {
    e.stopPropagation();
    new PosterActionSheetModal(app, item, () => renderDashboard()).open();
  };

  // ЗАДАЧА 2: Минималистичная полоса снизу при наведении (5★ с половинками + иконка ✎ с title="Оценить")
  const bottomBar = posterWrapper.createDiv({ cls: "lb-poster-bottom-bar" });
  const starsBox = bottomBar.createDiv({ cls: "lb-quick-stars" });

  const starEls = [];
  const syncStarsVisual = previewScore10 => {
    const score = previewScore10 !== null && previewScore10 > 0 ? previewScore10 : 0;
    for (let i = 0; i < 5; i++) {
      const fullThreshold = (i + 1) * 2;
      const halfThreshold = fullThreshold - 1;
      const el = starEls[i];
      if (score >= fullThreshold) {
        el.textContent = "★";
        el.classList.add("is-lit");
      } else if (score >= halfThreshold) {
        el.textContent = "½";
        el.classList.add("is-lit");
      } else {
        el.textContent = "★";
        el.classList.remove("is-lit");
      }
    }
  };

  for (let i = 0; i < 5; i++) {
    const starEl = starsBox.createSpan({ cls: "lb-quick-star", text: "★" });
    starEls.push(starEl);

    const calcScoreFromPointer = ev => {
      const rect = starEl.getBoundingClientRect();
      const isLeftHalf = (ev.clientX - rect.left) < rect.width / 2;
      return isLeftHalf ? i * 2 + 1 : (i + 1) * 2;
    };

    starEl.onmousemove = ev => {
      const hoveredScore10 = calcScoreFromPointer(ev);
      syncStarsVisual(hoveredScore10);
      starEl.title = `${I18N.rateAction}: ${(hoveredScore10 / 2).toFixed(1).replace(".0", "")} ★`;
    };

    starEl.onclick = async ev => {
      ev.stopPropagation();
      const chosenScore10 = calcScoreFromPointer(ev);
      const nextScore = currentScore10 === chosenScore10 ? null : chosenScore10;
      await updateMediaFrontmatter(item.file.path, fm => {
        if (nextScore !== null && nextScore > 0) fm["оценка"] = Number(nextScore);
        else delete fm["оценка"];
      });
      item["оценка"] = nextScore;
      renderDashboard();
    };
  }

  starsBox.onmouseleave = () => {
    syncStarsVisual(currentScore10);
  };
  syncStarsVisual(currentScore10);

  const editIconBtn = bottomBar.createEl("button", {
    cls: "lb-quick-edit-icon",
    text: "✎",
    attr: {
      type: "button",
      title: I18N.rateAction,
      "aria-label": I18N.rateAction
    }
  });
  editIconBtn.onclick = e => {
    e.stopPropagation();
    new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
  };

  // Клик по самому постеру
  posterWrapper.onclick = e => {
    if (e.target.closest("button") || e.target.closest(".lb-quick-stars")) return;
    if (isTouchDevice()) {
      new PosterActionSheetModal(app, item, () => renderDashboard()).open();
    } else {
      app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
    }
  };

  // ЗАДАЧА 7: Чистая подпись под постером (название в одну строку + ниже звёзды и год)
  const caption = card.createDiv({ cls: "lb-card-caption" });

  const capTitle = caption.createDiv({
    cls: "lb-caption-title",
    text: title,
    attr: { title }
  });
  capTitle.onclick = e => {
    app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
  };

  const capMeta = caption.createDiv({ cls: "lb-caption-meta" });
  const starsText = formatStars(currentScore10);

  capMeta.createSpan({
    cls: "lb-stars",
    text: starsText || ""
  });

  if (item["год"]) {
    capMeta.createSpan({ cls: "lb-caption-year", text: String(item["год"]) });
  }
}

// 5. Хронологический Дневник
function renderDiaryView(filtered) {
  const diaryWrap = gridContainer.createDiv({ cls: "lb-diary-wrap" });
  const byMonth = new Map();

  filtered.forEach(item => {
    const iso = getItemDateISO(item) || "Без даты";
    const monthKey = /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : "Без даты";
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
    byMonth.get(monthKey).push(item);
  });

  for (const [monthKey, list] of byMonth.entries()) {
    const monthBox = diaryWrap.createDiv({ cls: "lb-diary-month" });
    let monthTitle = monthKey;
    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      const d = dv.date(`${monthKey}-01`);
      if (d && d.isValid) monthTitle = d.setLocale("ru").toFormat("LLLL yyyy");
    }
    const head = monthBox.createDiv({ cls: "lb-diary-month-head" });
    head.createSpan({ text: monthTitle });
    head.createSpan({ text: `${list.length}` });

    list.forEach(item => {
      const schema = getSchemaForType(item["тип"]);
      const iso = getItemDateISO(item);
      const dayNum = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) : "—";
      const rewatchCount = getRewatchCount(item);
      const row = monthBox.createDiv({ cls: "lb-diary-row" });

      row.createDiv({ cls: "lb-diary-day", text: dayNum });

      const src = resolvePosterSrc(item["постер"], item.file.path);
      if (src) {
        row.createEl("img", { cls: "lb-diary-thumb", attr: { src } });
      } else {
        row.createDiv({
          cls: "lb-diary-thumb",
          text: schema.icon,
          attr: { style: "display:flex;align-items:center;justify-content:center;" }
        });
      }

      const titleCol = row.createDiv({ attr: { style: "min-width:0;" } });
      const titleLink = titleCol.createEl("a", {
        cls: "internal-link",
        text: item["название"] || item.file.name,
        attr: { href: item.file.path, style: "font-weight: 650; color: var(--text-normal); text-decoration: none;" }
      });
      titleLink.onclick = e => {
        e.preventDefault();
        app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
      };
      if (item["год"]) {
        titleCol.createSpan({ text: ` (${item["год"]})`, attr: { style: "font-size: 0.74rem; color: var(--медиа-текст-приглушённый);" } });
      }

      const creators = getItemCreators(item);
      row.createDiv({
        cls: "lb-diary-creator-col",
        text: creators.join(", ") || "—",
        attr: { style: "font-size: 0.76rem; color: var(--медиа-текст-приглушённый); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" }
      });

      const ratingCol = row.createDiv({ attr: { style: "display:flex;align-items:center;gap:6px;" } });
      ratingCol.createSpan({ cls: "lb-stars", text: formatStars(item["оценка"]) });
      if (item["любимое"]) ratingCol.createSpan({ text: "♥", attr: { style: "color: var(--медиа-сердце);" } });
      if (rewatchCount > 0) ratingCol.createSpan({ text: rewatchCount > 1 ? `🔄×${rewatchCount}` : "🔄", attr: { style: "font-size: 0.74rem;" } });

      const editBtn = row.createEl("button", {
        cls: "lb-sub-btn",
        text: "⋯",
        attr: { type: "button", title: I18N.menuAction, style: "width:34px !important;justify-content:center !important;" }
      });
      editBtn.onclick = () => {
        new PosterActionSheetModal(app, item, () => renderDashboard()).open();
      };
    });
  }
}

function renderContent(categoryItems) {
  gridContainer.empty();
  paginationContainer.empty();

  const filtered = applyFiltersAndSort(categoryItems);
  const total = filtered.length;

  if (total === 0) {
    gridContainer.createDiv({
      cls: "lb-empty-msg",
      text: I18N.emptyFiltered
    });
    return;
  }

  if (state.viewMode === "diary") {
    renderDiaryView(filtered);
    return;
  }

  const paginated = filtered.slice(0, state.page * state.pageSize);
  const grid = gridContainer.createDiv({ cls: "lb-cards-grid" });

  paginated.forEach((item, index) => {
    renderPosterCard(grid, item, index);
  });

  if (paginated.length < total) {
    const moreBtn = paginationContainer.createEl("button", {
      cls: "lb-more-btn",
      text: `Показать ещё (${total - paginated.length})`
    });
    moreBtn.onclick = () => {
      state.page++;
      renderContent(categoryItems);
    };
  }
}

function renderDashboard() {
  const allMedia = getAllMediaPages();
  const categoryItems = getCategoryPages(allMedia);
  renderNavigation(allMedia, categoryItems);
  renderTop4Showcase(categoryItems);
  renderToolbarAndRatings(categoryItems);
  renderContent(categoryItems);
}

renderDashboard();