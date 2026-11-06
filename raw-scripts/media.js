/* ==========================================================================
   MEDIA DASHBOARD HUB v4.2 (Letterboxd Dark & Authentic Diary Redesign)
   Чистая панель фильтров без обрезания select · Постоянный фильтр «Актёры»
   Аутентичная таблица Дневника Letterboxd (Календарь месяца, День, Фильм, Рецензия, Год, Оценка 5★, Любимое, Повтор, Действия)
   ========================================================================== */

const MEDIA_ROOT_FOLDER = "Знания/Медиа";
const MIN_VALID_DATE_ISO = "1970-01-01";
const root = dv.container.createDiv({ cls: "dashboard-home dh-media-hub" });

const I18N = {
  addEntry: "＋ Добавить запись",
  postersView: "▦ Постеры",
  diaryView: "📓 Дневник",
  watchlistSlice: "⏱ В планах",
  favSlice: "♥ Любимое",
  watchlistHint: "Показать записи со статусом «В планах»",
  favHint: "Показать только любимые записи",
  allYears: "Все годы",
  allDecades: "Десятилетия",
  allStatuses: "Статус",
  allGenres: "Жанры",
  allActors: "Актёры",
  allPlatforms: "Платформы",
  directorsAll: "Режиссёры",
  showrunnersAll: "Шоураннеры",
  devsAll: "Разработчики",
  sortDateDesc: "По дате просмотра",
  sortRatingDesc: "По оценке",
  sortYearDesc: "По году выхода",
  sortTitleAsc: "По названию (А–Я)",
  ratingsHeader: "ОЦЕНКИ",
  rateAction: "Оценить",
  menuAction: "Меню действий",
  favAdd: "Добавить в любимое",
  favRemove: "Убрать из любимого",
  emptyFiltered: "По выбранным фильтрам ничего не найдено. Сбрось фильтр или нажми «＋ Добавить запись».",
  modalAddTitle: "Отметить в Медиатеке",
  modalEditTitle: "Редактировать",
  saveChanges: "Сохранить изменения",
  saveNew: "Добавить запись",
  diaryColMonth: "МЕСЯЦ",
  diaryColDay: "ДЕНЬ",
  diaryColFilm: "НАЗВАНИЕ",
  diaryColReview: "РЕЦЕНЗИЯ",
  diaryColReleased: "ГОД",
  diaryColRating: "ОЦЕНКА",
  diaryColLike: "ЛЮБИМОЕ",
  diaryColRewatch: "ПОВТОР",
  diaryColEdit: "ПРАВКА"
};

const RU_MONTHS_SHORT = [
  "ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН",
  "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"
];

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

function getItemActors(item) {
  return flatArray(item["актёры"] ?? item["актеры"] ?? item["в_ролях"]).flatMap(entry =>
    String(entry)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function formatShortList(arr, maxShow = 2) {
  if (!arr || arr.length === 0) return "";
  if (arr.length <= maxShow) return arr.join(", ");
  return `${arr.slice(0, maxShow).join(", ")} +${arr.length - maxShow}`;
}

function getItemReviewText(item) {
  const raw = item["отзыв"] ?? item["рецензия"] ?? item["комментарий"] ?? "";
  if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean).join("\n");
  return String(raw || "").trim();
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

// Отрисовка 5-звёздочного блока оценки в стиле дневника Letterboxd (зелёные активные + тусклые пустые)
function renderDiaryStars5(container, score10) {
  const num = parseOptionalNum(score10);
  if (num === null || num <= 0) return;
  const clamped = Math.min(10, Math.max(1, Math.round(num)));
  const stars5 = clamped / 2;
  const full = Math.floor(stars5);
  const half = stars5 % 1 !== 0;
  const empty = 5 - full - (half ? 1 : 0);

  const wrap = container.createSpan({ cls: "lb-diary-stars-row" });
  if (full > 0) wrap.createSpan({ cls: "is-lit", text: "★".repeat(full) });
  if (half) wrap.createSpan({ cls: "is-lit is-half", text: "½" });
  if (empty > 0) wrap.createSpan({ cls: "is-dim", text: "★".repeat(empty) });
}

const styleEl = root.createEl("style");
styleEl.textContent = `
@keyframes lbCardReveal {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes lbSheetSlideUp {
  0% { opacity: 0; transform: translateY(16px); }
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
  gap: 10px;
  padding: 4px 0 24px 0;
  color: var(--text-normal);
  font-family: var(--font-interface);
  box-sizing: border-box;
}

.dashboard-home.dh-media-hub * {
  box-sizing: border-box;
}

/* 1. НАВИГАЦИЯ */
.dashboard-home .lb-nav-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dashboard-home .lb-primary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding-bottom: 0;
}

.dashboard-home .lb-primary-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 18px;
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
  padding: 5px 2px 7px 2px !important;
  height: auto !important;
  min-height: 30px !important;
  font-size: 0.9rem !important;
  font-weight: 650 !important;
  letter-spacing: 0.02em;
  cursor: pointer;
  color: var(--медиа-текст-приглушённый) !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
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
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--медиа-текст-приглушённый);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-primary-tab.is-active .lb-primary-count {
  color: var(--медиа-акцент);
  opacity: 1;
}

.dashboard-home .lb-add-cta {
  background: var(--медиа-акцент) !important;
  border: none !important;
  color: #0d1115 !important;
  font-weight: 750 !important;
  font-size: 0.8rem !important;
  letter-spacing: 0.02em;
  padding: 0 13px !important;
  height: 30px !important;
  min-height: 30px !important;
  border-radius: 4px !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  box-shadow: 0 2px 6px rgba(0, 224, 84, 0.2) !important;
  transition: filter 0.15s ease, transform 0.12s ease;
}

.dashboard-home .lb-add-cta:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.dashboard-home .lb-secondary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  background: transparent;
  border: none;
}

.dashboard-home .lb-view-modes,
.dashboard-home .lb-quick-slices {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

.dashboard-home .lb-sub-btn {
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  height: 25px !important;
  min-height: 25px !important;
  padding: 1px 0 3px 0 !important;
  font-size: 0.77rem !important;
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
  font-size: 0.69rem;
  color: var(--медиа-текст-приглушённый);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

/* 2. ВИТРИНА «ТОП-4 ЛЮБИМЫХ» */
.dashboard-home .lb-top4-section {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding: 0 0 10px 0;
  margin: 0;
}

.dashboard-home .lb-top4-section > summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--медиа-текст-приглушённый);
  padding: 2px 0 6px 0;
}

.dashboard-home .lb-top4-section > summary::-webkit-details-marker {
  display: none;
}

.dashboard-home .lb-top4-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 165px));
  gap: 14px;
}

/* 3. ФИЛЬТРЫ (БЕЗ ОБРЕЗАНИЯ SELECT) + ГИСТОГРАММА «ОЦЕНКИ» */
.dashboard-home .lb-toolbar-ratings-layout {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--медиа-разделитель);
}

.dashboard-home .lb-filters-column {
  flex: 1 1 480px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-width: 260px;
}

.dashboard-home .lb-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dashboard-home .lb-search-input {
  flex: 1 1 190px;
  min-width: 150px;
  height: 30px !important;
  padding: 0 9px !important;
  border-radius: 4px !important;
  font-size: 0.78rem !important;
  background: var(--медиа-фон-карточки) !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  color: var(--text-normal) !important;
}

.dashboard-home .lb-search-input:focus {
  border-color: var(--медиа-акцент) !important;
  outline: none !important;
}

/* Фикс обрезания текста в select: убран жёсткий max-width, добавлен width: auto */
.dashboard-home .lb-filters-bar select {
  width: auto !important;
  max-width: none !important;
  min-width: max-content;
  height: 30px !important;
  font-size: 0.76rem !important;
  padding: 0 26px 0 9px !important;
  border-radius: 4px !important;
  background-color: var(--медиа-фон-карточки) !important;
  border: 1px solid var(--медиа-обводка-постера) !important;
  color: var(--медиа-текст-приглушённый) !important;
  cursor: pointer;
  white-space: nowrap;
}

.dashboard-home .lb-filters-bar select:hover {
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

/* Акцентный блок «Оценки» Letterboxd */
.dashboard-home .lb-ratings-widget {
  flex: 0 1 38%;
  min-width: 280px;
  min-height: 92px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 12px 9px 12px;
  background: rgba(28, 34, 40, 0.45);
  border: 1px solid var(--медиа-разделитель);
  border-radius: 5px;
}

.dashboard-home .lb-ratings-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--медиа-разделитель);
  padding-bottom: 4px;
  margin-bottom: 6px;
}

.dashboard-home .lb-ratings-title {
  font-size: 0.7rem;
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
  font-size: 0.71rem;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-ratings-avg {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
  color: #dbe4ee;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-ratings-body {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 48px;
}

.dashboard-home .lb-ratings-edge-star {
  font-size: 0.68rem;
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
  bottom: calc(100% + 4px);
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

/* 4. СЕТКА ПОСТЕРОВ И КАРТОЧКА */
.dashboard-home .lb-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}

.dashboard-home .lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: transparent;
  min-width: 120px;
  animation: lbCardReveal 0.2s ease both;
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
  padding: 10px;
  text-align: center;
  background: var(--медиа-фон-карточки);
  gap: 5px;
}

.dashboard-home .lb-fallback-icon {
  font-size: 1.35rem;
  opacity: 0.55;
}

.dashboard-home .lb-fallback-title {
  font-size: 0.79rem;
  font-weight: 650;
  line-height: 1.22;
  color: var(--text-normal);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dashboard-home .lb-fallback-sub {
  font-size: 0.69rem;
  color: var(--медиа-текст-приглушённый);
}

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

.dashboard-home .lb-poster-bottom-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: 30px;
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

.dashboard-home .lb-card-caption {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 1px 0 1px;
  min-width: 0;
}

.dashboard-home .lb-caption-title {
  font-size: 0.79rem;
  font-weight: 600;
  color: var(--text-normal);
  line-height: 1.2;
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
  min-height: 14px;
  font-size: 0.71rem;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-stars {
  font-size: 0.72rem;
  color: var(--медиа-акцент);
  letter-spacing: 0.5px;
  line-height: 1;
  white-space: nowrap;
}

.dashboard-home .lb-caption-year {
  font-size: 0.7rem;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dashboard-home .lb-caption-sub {
  font-size: 0.68rem;
  color: var(--медиа-текст-приглушённый);
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.15;
}

/* 5. АУТЕНТИЧНЫЙ ДНЕВНИК LETTERBOXD С КОЛОНКОЙ РЕЦЕНЗИИ */
.dashboard-home .lb-diary-table {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.dashboard-home .lb-diary-thead {
  display: grid;
  grid-template-columns: 62px 44px minmax(170px, 1.3fr) minmax(180px, 1.8fr) 54px 96px 56px 56px 58px;
  align-items: center;
  gap: 10px;
  padding: 6px 6px;
  border-top: 1px solid var(--медиа-разделитель);
  border-bottom: 1px solid var(--медиа-разделитель);
  font-size: 0.65rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--медиа-текст-приглушённый);
  user-select: none;
}

.dashboard-home .lb-diary-tr {
  display: grid;
  grid-template-columns: 62px 44px minmax(170px, 1.3fr) minmax(180px, 1.8fr) 54px 96px 56px 56px 58px;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--медиа-разделитель);
  transition: background-color 0.12s ease;
}

.dashboard-home .lb-diary-tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

/* Иконка перекидного календаря месяца (только у первой записи месяца, как в Letterboxd) */
.dashboard-home .lb-diary-cal-badge {
  position: relative;
  width: 52px;
  height: 46px;
  background: #2c3440;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 0 #181d23, 0 4px 0 #2c3440;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 4px;
  user-select: none;
}

.dashboard-home .lb-diary-cal-badge::before,
.dashboard-home .lb-diary-cal-badge::after {
  content: "";
  position: absolute;
  top: -4px;
  width: 4px;
  height: 7px;
  background: #678;
  border-radius: 2px;
}

.dashboard-home .lb-diary-cal-badge::before {
  left: 12px;
}

.dashboard-home .lb-diary-cal-badge::after {
  right: 12px;
}

.dashboard-home .lb-diary-cal-month {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #dbe4ee;
  line-height: 1.05;
}

.dashboard-home .lb-diary-cal-year {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--медиа-текст-приглушённый);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

/* Крупное число дня месяца */
.dashboard-home .lb-diary-day-num {
  font-size: 1.45rem;
  font-weight: 300;
  color: #789;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 1;
}

/* Колонка фильма: мини-постер + жирное название */
.dashboard-home .lb-diary-film-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dashboard-home .lb-diary-poster-mini {
  width: 34px;
  height: 51px;
  border-radius: 3px;
  object-fit: cover;
  background: var(--медиа-фон-карточки);
  border: 1px solid rgba(255, 255, 255, 0.14);
  flex-shrink: 0;
  cursor: pointer;
}

.dashboard-home .lb-diary-film-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dashboard-home .lb-diary-film-title {
  font-size: 0.96rem;
  font-weight: 750;
  color: #ffffff;
  text-decoration: none;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dashboard-home .lb-diary-film-title:hover {
  color: var(--медиа-акцент);
}

.dashboard-home .lb-diary-film-sub {
  font-size: 0.7rem;
  color: var(--медиа-текст-приглушённый);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Колонка рецензии (3 строки с разворотом по клику) */
.dashboard-home .lb-diary-review-col {
  min-width: 0;
  font-size: 0.78rem;
  line-height: 1.38;
  color: #c8d4e0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.dashboard-home .lb-diary-review-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: pointer;
  white-space: pre-wrap;
}

.dashboard-home .lb-diary-review-text.is-expanded {
  display: block;
  -webkit-line-clamp: unset;
}

.dashboard-home .lb-diary-review-empty {
  color: var(--медиа-текст-приглушённый);
  opacity: 0.25;
  user-select: none;
}

.dashboard-home .lb-diary-year-col {
  font-size: 0.79rem;
  color: var(--медиа-текст-приглушённый);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* 5 звёзд в дневнике (активные зелёные + пустые тёмные) */
.dashboard-home .lb-diary-stars-row {
  display: inline-flex;
  align-items: center;
  font-size: 0.88rem;
  letter-spacing: 1px;
  line-height: 1;
  user-select: none;
}

.dashboard-home .lb-diary-stars-row .is-lit {
  color: var(--медиа-акцент);
}

.dashboard-home .lb-diary-stars-row .is-dim {
  color: #34404d;
}

/* Иконка лайка в дневнике */
.dashboard-home .lb-diary-like-cell,
.dashboard-home .lb-diary-rewatch-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-home .lb-diary-heart-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 2px !important;
  font-size: 0.95rem !important;
  line-height: 1 !important;
  color: #3c4856 !important;
  cursor: pointer;
  transition: transform 0.12s ease, color 0.12s ease;
}

.dashboard-home .lb-diary-heart-btn.is-liked {
  color: var(--медиа-сердце) !important;
}

.dashboard-home .lb-diary-heart-btn:hover {
  transform: scale(1.16);
}

.dashboard-home .lb-diary-rewatch-icon {
  font-size: 0.88rem;
  color: var(--медиа-текст-приглушённый);
  user-select: none;
}

.dashboard-home .lb-diary-actions-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.dashboard-home .lb-diary-icon-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  width: 26px !important;
  min-width: 26px !important;
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 !important;
  border-radius: 4px !important;
  color: #678 !important;
  font-size: 0.84rem !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer;
}

.dashboard-home .lb-diary-icon-btn:hover {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

/* 6. ШИРОКОЕ МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ */
.modal.lb-media-log-modal {
  width: min(960px, 94vw) !important;
  max-width: min(960px, 94vw) !important;
  overflow-x: hidden !important;
}

.modal.lb-media-log-modal .modal-content {
  overflow-x: hidden !important;
  max-width: 100% !important;
}

.lb-log-form-layout {
  display: grid;
  grid-template-columns: 155px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.lb-modal-poster-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.lb-modal-poster-preview {
  width: 155px;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
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

.lb-form-grid-2col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  width: 100%;
  min-width: 0;
}

.lb-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.lb-form-field.is-full {
  grid-column: 1 / -1;
}

.lb-form-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}

.lb-form-hint {
  font-size: 0.69rem;
  font-weight: 400;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-form-field input[type="text"],
.lb-form-field input[type="number"],
.lb-form-field select,
.lb-form-field textarea {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  border-radius: 5px !important;
  color: var(--text-normal) !important;
  font-size: 0.82rem !important;
  padding: 6px 9px !important;
}

.lb-form-field input[type="text"],
.lb-form-field input[type="number"],
.lb-form-field select {
  height: 34px !important;
}

.lb-form-field textarea {
  resize: vertical;
  min-height: 78px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.lb-form-inline-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 8px;
  min-width: 0;
}

.lb-form-toggles-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 6px 10px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 5px;
  min-height: 34px;
}

.lb-form-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  user-select: none;
}

.lb-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--background-modifier-border);
}

/* ТАЧ-ПАНЕЛЬ И ГАЛЕРЕЯ ПОСТЕРОВ */
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
  overflow-wrap: anywhere;
}

.lb-sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lb-sheet-btn {
  width: 100% !important;
  min-height: 40px !important;
  height: 40px !important;
  padding: 0 12px !important;
  border-radius: 6px !important;
  font-size: 0.83rem !important;
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
  margin-top: 6px;
}

.dashboard-home .lb-more-btn {
  background: var(--медиа-фон-карточки);
  border: 1px solid var(--медиа-обводка-постера);
  padding: 6px 18px;
  min-height: 34px;
  border-radius: 4px;
  font-size: 0.79rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--медиа-текст-приглушённый);
}

.dashboard-home .lb-more-btn:hover {
  color: #ffffff;
  border-color: var(--медиа-акцент);
}

.dashboard-home .lb-empty-msg {
  padding: 26px 16px;
  text-align: center;
  color: var(--медиа-текст-приглушённый);
  background: rgba(28, 34, 40, 0.35);
  border: 1px dashed var(--медиа-разделитель);
  border-radius: 6px;
  font-size: 0.82rem;
}

@media (max-width: 820px) {
  .dashboard-home .lb-toolbar-ratings-layout {
    flex-direction: column;
    align-items: stretch;
  }
  .dashboard-home .lb-ratings-widget {
    width: 100%;
    min-width: 0;
  }
  .lb-log-form-layout {
    grid-template-columns: 1fr;
  }
  .lb-modal-poster-preview {
    margin: 0 auto;
    width: 130px;
  }
  .lb-form-grid-2col {
    grid-template-columns: 1fr;
  }
  .dashboard-home .lb-top4-grid {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
  .dashboard-home .lb-diary-thead {
    display: none;
  }
  .dashboard-home .lb-diary-tr {
    grid-template-columns: 52px 34px minmax(120px, 1fr) minmax(120px, 1.3fr) 86px 52px;
    gap: 8px;
  }
  .dashboard-home .lb-diary-year-col,
  .dashboard-home .lb-diary-like-cell,
  .dashboard-home .lb-diary-rewatch-cell {
    display: none;
  }
}
`;

const defaultState = {
  activeCategory: "Фильм",
  viewMode: "grid",
  quickWatchlist: false,
  onlyFavorites: false,
  yearFilter: "Все",
  decadeFilter: "Все",
  statusFilter: "Все",
  genreFilter: "Все",
  creatorFilter: "Все",
  actorFilter: "Все",
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
    const actors = getItemActors(item);
    const posterSrc = resolvePosterSrc(item["постер"], item.file.path);
    const rewatchCount = getRewatchCount(item);
    const reviewText = getItemReviewText(item);

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

    if (actors.length > 0) {
      info.createDiv({
        cls: "lb-sheet-sub",
        text: `Актёры: ${formatShortList(actors, 3)}`
      });
    }

    if (reviewText) {
      contentEl.createDiv({ cls: "lb-sheet-review", text: `«${reviewText}»` });
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
    editBtn.createSpan({ text: "✎ Оценить / Редактировать" });
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
        if (nextFav) fm["любимое"] = true;
        else delete fm["любимое"];
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
// ШИРОКОЕ МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ И РЕДАКТИРОВАНИЯ
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
      actors: ex ? getItemActors(ex).join(", ") : "",
      runtimeMin: ex && parseOptionalNum(ex["длительность_мин"]) !== null ? Number(ex["длительность_мин"]) : "",
      seasons: ex && parseOptionalNum(ex["сезонов"]) !== null ? Number(ex["сезонов"]) : "",
      episodes: ex && parseOptionalNum(ex["серий"]) !== null ? Number(ex["серий"]) : "",
      platform: ex ? flatArray(ex["платформа"]).join(", ") : "ПК",
      hoursPlayed: ex && parseOptionalNum(ex["часов_наиграно"]) !== null ? Number(ex["часов_наиграно"]) : "",
      genres: ex ? flatArray(ex["жанр"]).join(", ") : "",
      mediaTags: ex ? flatArray(ex["теги_медиа"]).join(", ") : "",
      review: ex ? getItemReviewText(ex) : ""
    };
  }

  onOpen() {
    this.modalEl.addClass("lb-media-log-modal");
    this.renderForm();
  }

  renderForm() {
    const { contentEl } = this;
    contentEl.empty();

    const schema = getSchemaForType(this.data.type);
    contentEl.createEl("h2", {
      text: this.existingItem
        ? `${schema.icon} ${I18N.modalEditTitle}: ${this.data.title}`
        : `${schema.icon} ${I18N.modalAddTitle}`,
      attr: { style: "margin: 0 0 12px 0; font-size: 1.15rem;" }
    });

    const layout = contentEl.createDiv({ cls: "lb-log-form-layout" });
    const leftCol = layout.createDiv({ cls: "lb-modal-poster-col" });
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

    const rightGrid = layout.createDiv({ cls: "lb-form-grid-2col" });

    const makeField = (label, hint = "", isFull = false) => {
      const f = rightGrid.createDiv({ cls: `lb-form-field ${isFull ? "is-full" : ""}` });
      const lbl = f.createDiv({ cls: "lb-form-label" });
      lbl.createSpan({ text: label });
      if (hint) lbl.createSpan({ cls: "lb-form-hint", text: hint });
      return f;
    };

    const titleField = makeField("Название", "", Boolean(this.existingItem));
    const titleInp = titleField.createEl("input", {
      attr: {
        type: "text",
        placeholder: this.data.type === "Игра" ? "Death Stranding" : "Дюна: Часть вторая",
        value: this.data.title
      }
    });
    titleInp.oninput = () => { this.data.title = titleInp.value; };

    if (!this.existingItem) {
      const catField = makeField("Категория");
      const catSel = catField.createEl("select");
      [
        { v: "Фильм", l: "🎬 Фильм" },
        { v: "Сериал", l: "📺 Сериал" },
        { v: "Игра", l: "🎮 Игра" }
      ].forEach(o => {
        const opt = catSel.createEl("option", { text: o.l, value: o.v });
        if (this.data.type === o.v) opt.selected = true;
      });
      catSel.onchange = () => {
        this.data.type = catSel.value;
        const nextSchema = getSchemaForType(this.data.type);
        if (!nextSchema.statuses.includes(this.data.status)) {
          this.data.status = nextSchema.defaultDoneStatus;
        }
        this.renderForm();
      };
    }

    const creatorField = makeField(schema.creatorLabel, "через запятую");
    const creatorInp = creatorField.createEl("input", {
      attr: {
        type: "text",
        placeholder: schema.creatorPlaceholder,
        value: this.data.creator
      }
    });
    creatorInp.oninput = () => { this.data.creator = creatorInp.value; };

    const actorsPreviewText = () => {
      const list = String(this.data.actors || "").split(",").map(s => s.trim()).filter(Boolean);
      return list.length > 3 ? formatShortList(list, 3) : "через запятую";
    };
    const actorsField = makeField("Актёры", actorsPreviewText());
    const actorsHintEl = actorsField.querySelector(".lb-form-hint");
    const actorsInp = actorsField.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Тимоти Шаламе, Зендея, Ребекка Фергюсон",
        value: this.data.actors
      }
    });
    actorsInp.oninput = () => {
      this.data.actors = actorsInp.value;
      if (actorsHintEl) actorsHintEl.textContent = actorsPreviewText();
    };

    const statusDateField = makeField("Статус и дата", schema.dateLabel);
    const statusDateRow = statusDateField.createDiv({ cls: "lb-form-inline-group" });
    const statusSel = statusDateRow.createEl("select");
    schema.statuses.forEach(st => {
      const opt = statusSel.createEl("option", { text: st, value: st });
      if (this.data.status === st) opt.selected = true;
    });
    statusSel.onchange = () => { this.data.status = statusSel.value; };

    const dateInp = statusDateRow.createEl("input", {
      attr: { type: "text", placeholder: "ГГГГ-ММ-ДД", value: this.data.date }
    });
    dateInp.oninput = () => { this.data.date = dateInp.value.trim(); };

    if (this.data.type === "Фильм") {
      const specField = makeField("Год выхода и хронометраж", "мин");
      const row = specField.createDiv({ cls: "lb-form-inline-group" });
      const yInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Год (2024)", value: String(this.data.year ?? "") }
      });
      yInp.oninput = () => { this.data.year = parseOptionalNum(yInp.value); };
      const rInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Мин (166)", value: String(this.data.runtimeMin ?? "") }
      });
      rInp.oninput = () => { this.data.runtimeMin = parseOptionalNum(rInp.value) ?? ""; };
    } else if (this.data.type === "Сериал") {
      const specField = makeField("Год, сезоны и серии");
      const row = specField.createDiv({ cls: "lb-form-inline-group" });
      const yInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Год", value: String(this.data.year ?? "") }
      });
      yInp.oninput = () => { this.data.year = parseOptionalNum(yInp.value); };
      const sInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Сезонов", value: String(this.data.seasons ?? "") }
      });
      sInp.oninput = () => { this.data.seasons = parseOptionalNum(sInp.value) ?? ""; };
      const eInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Серий", value: String(this.data.episodes ?? "") }
      });
      eInp.oninput = () => { this.data.episodes = parseOptionalNum(eInp.value) ?? ""; };
    } else {
      const specField = makeField("Год, платформа и часы");
      const row = specField.createDiv({ cls: "lb-form-inline-group" });
      const yInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Год", value: String(this.data.year ?? "") }
      });
      yInp.oninput = () => { this.data.year = parseOptionalNum(yInp.value); };
      const pInp = row.createEl("input", {
        attr: { type: "text", placeholder: "ПК, PS5", value: this.data.platform }
      });
      pInp.oninput = () => { this.data.platform = pInp.value; };
      const hInp = row.createEl("input", {
        attr: { type: "text", placeholder: "Часов (85)", value: String(this.data.hoursPlayed ?? "") }
      });
      hInp.oninput = () => { this.data.hoursPlayed = parseOptionalNum(hInp.value) ?? ""; };
    }

    const ratingText = val => val > 0
      ? `${(val / 2).toFixed(1).replace(".0", "")} из 5 (${formatStars(val)})`
      : "не записано";
    const ratingField = makeField("Оценка", ratingText(this.data.rating));
    const ratingHintEl = ratingField.querySelector(".lb-form-hint");
    const sliderInp = ratingField.createEl("input", {
      attr: {
        type: "range",
        min: "0",
        max: "10",
        step: "1",
        value: String(this.data.rating),
        style: "width: 100%; accent-color: var(--медиа-акцент); height: 34px; cursor: pointer;"
      }
    });
    sliderInp.oninput = () => {
      this.data.rating = Number(sliderInp.value);
      if (ratingHintEl) ratingHintEl.textContent = ratingText(this.data.rating);
    };

    const flagsField = makeField("Флаги и повторы");
    const flagsRow = flagsField.createDiv({ cls: "lb-form-toggles-row" });

    const favLabel = flagsRow.createEl("label", { cls: "lb-form-check" });
    const favCb = favLabel.createEl("input", { attr: { type: "checkbox" } });
    favCb.checked = this.data.favorite;
    favCb.onchange = () => { this.data.favorite = favCb.checked; };
    favLabel.createSpan({ text: "♥ Любимое" });

    const topLabel = flagsRow.createEl("label", { cls: "lb-form-check" });
    const topCb = topLabel.createEl("input", { attr: { type: "checkbox" } });
    topCb.checked = this.data.top4;
    topCb.onchange = () => { this.data.top4 = topCb.checked; };
    topLabel.createSpan({ text: "📌 Топ-4" });

    const rwInp = flagsRow.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Повторов (0)",
        value: this.data.rewatchCount > 0 ? String(this.data.rewatchCount) : "",
        style: "width: 95px !important; height: 26px !important; padding: 2px 6px !important; font-size: 0.76rem !important;"
      }
    });
    rwInp.oninput = () => {
      const n = parseOptionalNum(rwInp.value);
      this.data.rewatchCount = n !== null && n > 0 ? Math.round(n) : 0;
      this.data.rewatch = this.data.rewatchCount > 0;
    };

    const genresField = makeField("Жанры", "через запятую");
    const genresInp = genresField.createEl("input", {
      attr: { type: "text", placeholder: "фантастика, триллер, драма", value: this.data.genres }
    });
    genresInp.oninput = () => { this.data.genres = genresInp.value; };

    const tagsField = makeField("Ключевые слова", "через запятую");
    const tagsInp = tagsField.createEl("input", {
      attr: { type: "text", placeholder: "космос, атмосфера, IMAX", value: this.data.mediaTags }
    });
    tagsInp.oninput = () => { this.data.mediaTags = tagsInp.value; };

    const posterField = makeField("Постер", "URL или [[файл.jpg]]", true);
    const posterInp = posterField.createEl("input", {
      attr: { type: "text", placeholder: "https://image.tmdb.org/...", value: this.data.poster }
    });
    posterInp.oninput = () => {
      this.data.poster = posterInp.value.trim();
      updatePreview();
    };

    const reviewField = makeField("Рецензия / заметка о просмотре", "отображается в Дневнике", true);
    const reviewArea = reviewField.createEl("textarea", {
      attr: { placeholder: "Краткие впечатления, мысли, цитаты…" }
    });
    reviewArea.value = this.data.review;
    reviewArea.oninput = () => { this.data.review = reviewArea.value; };

    const footer = contentEl.createDiv({ cls: "lb-form-footer" });
    const saveBtn = footer.createEl("button", {
      cls: "mod-cta",
      text: this.existingItem ? I18N.saveChanges : I18N.saveNew,
      attr: { type: "button", style: "height: 36px; padding: 0 18px; border-radius: 5px; cursor: pointer;" }
    });
    saveBtn.onclick = async () => {
      if (!this.data.title.trim()) {
        notify("Укажи название!");
        return;
      }
      await this.saveEntry();
      this.close();
      if (this.onSaved) this.onSaved();
    };
  }

  async saveEntry() {
    const schema = getSchemaForType(this.data.type);
    const splitClean = str => String(str || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const creatorsList = splitClean(this.data.creator);
    const actorsList = splitClean(this.data.actors);
    const genresList = splitClean(this.data.genres);
    const tagsArray = splitClean(this.data.mediaTags);
    const platformsList = splitClean(this.data.platform);
    const cleanDate = toISODateStr(this.data.date);

    const applyCommonFrontmatter = fm => {
      fm["тип"] = this.data.type;
      fm["название"] = this.data.title.trim();

      if (this.data.year !== null) fm["год"] = Number(this.data.year);
      else delete fm["год"];

      if (this.data.poster) fm["постер"] = this.data.poster;
      else delete fm["постер"];

      if (this.data.rating > 0) fm["оценка"] = Number(this.data.rating);
      else delete fm["оценка"];

      if (this.data.status) fm["статус"] = this.data.status;
      else delete fm["статус"];

      if (cleanDate) fm[schema.dateKey] = cleanDate;
      else delete fm[schema.dateKey];

      if (this.data.favorite) fm["любимое"] = true;
      else delete fm["любимое"];

      if (this.data.top4) fm["топ_4"] = true;
      else delete fm["топ_4"];

      const hasRewatch = Boolean(this.data.rewatchCount > 0 || this.data.rewatch);
      if (hasRewatch) fm["пересмотр"] = true;
      else delete fm["пересмотр"];

      if (this.data.rewatchCount > 0) fm["количество_повторов"] = Number(this.data.rewatchCount);
      else delete fm["количество_повторов"];

      if (creatorsList.length > 1) fm[schema.creatorKey] = creatorsList;
      else if (creatorsList.length === 1) fm[schema.creatorKey] = creatorsList[0];
      else delete fm[schema.creatorKey];

      if (actorsList.length > 0) fm["актёры"] = actorsList;
      else delete fm["актёры"];

      if (genresList.length > 0) fm["жанр"] = genresList;
      else delete fm["жанр"];

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
        else delete fm["платформа"];
        if (this.data.hoursPlayed !== "") fm["часов_наиграно"] = Number(this.data.hoursPlayed);
        else delete fm["часов_наиграно"];
      }
    };

    if (this.existingItem) {
      await updateMediaFrontmatter(this.existingItem.file.path, applyCommonFrontmatter);
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
      applyCommonFrontmatter(fm);
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

// 1. Отрисовка двухуровневой навигации
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
      state.actorFilter = "Все";
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

// 3. Чистая панель фильтров (Год, Десятилетие, Статус, Режиссёр, Актёры, Жанры, Сортировка) + Гистограмма «Оценки»
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

  const ratedItems = yearScoped.filter(i => {
    const val = parseOptionalNum(i["оценка"]);
    return val !== null && val > 0;
  });

  const filtersCol = toolbarAndRatingsContainer.createDiv({ cls: "lb-filters-column" });
  const bar = filtersCol.createDiv({ cls: "lb-filters-bar" });

  const searchInput = bar.createEl("input", {
    cls: "lb-search-input",
    attr: {
      type: "search",
      placeholder: `Поиск: название, ${schema.creatorLabel.toLowerCase()}, актёры…`,
      value: state.searchQuery
    }
  });
  searchInput.oninput = () => {
    state.searchQuery = searchInput.value;
    state.page = 1;
    renderContent(categoryItems);
  };

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

  const decades = new Set();
  categoryItems.forEach(i => {
    const dec = getItemDecade(i);
    if (dec) decades.add(dec);
  });
  const decSelect = bar.createEl("select", { cls: "dropdown", attr: { title: "Десятилетие выхода" } });
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

  // Фильтр по актёрам всегда отображается в панели
  const actors = new Set();
  categoryItems.forEach(i => getItemActors(i).forEach(a => actors.add(a)));
  const actorSelect = bar.createEl("select", { cls: "dropdown" });
  actorSelect.createEl("option", { text: I18N.allActors, value: "Все" });
  [...actors].sort((a, b) => a.localeCompare(b, "ru")).forEach(act => {
    const opt = actorSelect.createEl("option", { text: act, value: act });
    if (state.actorFilter === act) opt.selected = true;
  });
  actorSelect.onchange = e => {
    state.actorFilter = e.target.value;
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

  const sortSelect = bar.createEl("select", { cls: "dropdown", attr: { title: "Сортировка" } });
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

  // Правая колонка: Акцентный блок «Оценки»
  const ratingsWidget = toolbarAndRatingsContainer.createDiv({ cls: "lb-ratings-widget" });
  const rHeader = ratingsWidget.createDiv({ cls: "lb-ratings-header" });
  rHeader.createSpan({ cls: "lb-ratings-title", text: I18N.ratingsHeader });

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
    const bucketScore10 = idx + 1;
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
    if (state.actorFilter !== "Все") {
      if (!getItemActors(p).includes(state.actorFilter)) return false;
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
        ...getItemActors(p),
        ...flatArray(p["жанр"]),
        ...flatArray(p["теги_медиа"]),
        getItemReviewText(p)
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

// 4. Отрисовка карточки постера
function renderPosterCard(parentGrid, item, index) {
  const schema = getSchemaForType(item["тип"]);
  const title = item["название"] || item.file.name;
  const creators = getItemCreators(item);
  const actors = getItemActors(item);
  const primaryCreator = creators[0] || "";
  const posterSrc = resolvePosterSrc(item["постер"], item.file.path);
  const currentScore10 = parseOptionalNum(item["оценка"]);

  const card = parentGrid.createDiv({
    cls: "lb-card",
    attr: { style: `animation-delay: ${Math.min(index * 12, 180)}ms;` }
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
    await updateMediaFrontmatter(item.file.path, fm => {
      if (nextFav) fm["любимое"] = true;
      else delete fm["любимое"];
    });
    item["любимое"] = nextFav;
    renderDashboard();
  };

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

  posterWrapper.onclick = e => {
    if (e.target.closest("button") || e.target.closest(".lb-quick-stars")) return;
    if (isTouchDevice()) {
      new PosterActionSheetModal(app, item, () => renderDashboard()).open();
    } else {
      app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
    }
  };

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

  if (actors.length > 0) {
    caption.createDiv({
      cls: "lb-caption-sub",
      text: formatShortList(actors, 2),
      attr: { title: `Актёры: ${actors.join(", ")}` }
    });
  }
}

// 5. Табличный Дневник в стиле Letterboxd (Календарь месяца, День, Постер + Название, Рецензия, Год, 5★, Любимое, Повтор, Правка)
function renderDiaryView(filtered) {
  const table = gridContainer.createDiv({ cls: "lb-diary-table" });

  // Верхняя шапка колонок как в Letterboxd
  const thead = table.createDiv({ cls: "lb-diary-thead" });
  thead.createDiv({ text: I18N.diaryColMonth });
  thead.createDiv({ text: I18N.diaryColDay, attr: { style: "text-align:center;" } });
  thead.createDiv({ text: I18N.diaryColFilm });
  thead.createDiv({ text: I18N.diaryColReview });
  thead.createDiv({ text: I18N.diaryColReleased, attr: { style: "text-align:center;" } });
  thead.createDiv({ text: I18N.diaryColRating });
  thead.createDiv({ text: I18N.diaryColLike, attr: { style: "text-align:center;" } });
  thead.createDiv({ text: I18N.diaryColRewatch, attr: { style: "text-align:center;" } });
  thead.createDiv({ text: I18N.diaryColEdit, attr: { style: "text-align:right;" } });

  let prevMonthKey = null;

  filtered.forEach(item => {
    const schema = getSchemaForType(item["тип"]);
    const iso = getItemDateISO(item);
    const hasValidISO = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const monthKey = hasValidISO ? iso.slice(0, 7) : "Без даты";
    const dayStr = hasValidISO ? iso.slice(8, 10) : "—";
    const isFirstOfMonth = monthKey !== prevMonthKey;
    prevMonthKey = monthKey;

    const rewatchCount = getRewatchCount(item);
    const creators = getItemCreators(item);
    const actors = getItemActors(item);
    const reviewText = getItemReviewText(item);
    const title = item["название"] || item.file.name;

    const tr = table.createDiv({ cls: "lb-diary-tr" });

    // 1. Ячейка МЕСЯЦ (иконка календаря только на первой строке нового месяца)
    const monthCell = tr.createDiv();
    if (isFirstOfMonth) {
      const badge = monthCell.createDiv({ cls: "lb-diary-cal-badge" });
      if (hasValidISO) {
        const yr = iso.slice(0, 4);
        const mIdx = Math.max(0, Math.min(11, parseInt(iso.slice(5, 7), 10) - 1));
        badge.createDiv({ cls: "lb-diary-cal-month", text: RU_MONTHS_SHORT[mIdx] });
        badge.createDiv({ cls: "lb-diary-cal-year", text: yr });
      } else {
        badge.createDiv({ cls: "lb-diary-cal-month", text: "—" });
      }
    }

    // 2. Ячейка ДЕНЬ
    tr.createDiv({ cls: "lb-diary-day-num", text: dayStr });

    // 3. Ячейка ФИЛЬМ (мини-постер + жирное название + авторы/актёры)
    const filmCell = tr.createDiv({ cls: "lb-diary-film-cell" });
    const src = resolvePosterSrc(item["постер"], item.file.path);
    if (src) {
      const img = filmCell.createEl("img", { cls: "lb-diary-poster-mini", attr: { src, alt: title } });
      img.onclick = e => {
        app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
      };
    } else {
      const fb = filmCell.createDiv({
        cls: "lb-diary-poster-mini",
        text: schema.icon,
        attr: { style: "display:flex;align-items:center;justify-content:center;font-size:0.95rem;" }
      });
      fb.onclick = e => {
        app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
      };
    }

    const filmInfo = filmCell.createDiv({ cls: "lb-diary-film-info" });
    const titleLink = filmInfo.createEl("a", {
      cls: "lb-diary-film-title",
      text: title,
      attr: { href: item.file.path }
    });
    titleLink.onclick = e => {
      e.preventDefault();
      app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
    };

    const subParts = [
      creators.join(", "),
      actors.length > 0 ? formatShortList(actors, 2) : ""
    ].filter(Boolean);
    if (subParts.length > 0) {
      filmInfo.createDiv({
        cls: "lb-diary-film-sub",
        text: subParts.join(" · "),
        attr: { title: [creators.join(", "), actors.join(", ")].filter(Boolean).join(" | ") }
      });
    }

    // 4. Ячейка РЕЦЕНЗИЯ (видна сразу, до 3 строк с разворотом по клику)
    const reviewCol = tr.createDiv({ cls: "lb-diary-review-col" });
    if (reviewText) {
      const revEl = reviewCol.createDiv({
        cls: "lb-diary-review-text",
        text: reviewText,
        attr: { title: "Нажми, чтобы развернуть или свернуть рецензию" }
      });
      revEl.onclick = () => {
        revEl.classList.toggle("is-expanded");
      };
    } else {
      reviewCol.createSpan({ cls: "lb-diary-review-empty", text: "—" });
    }

    // 5. Ячейка ГОД ВЫХОДА (RELEASED)
    tr.createDiv({
      cls: "lb-diary-year-col",
      text: item["год"] ? String(item["год"]) : "—"
    });

    // 6. Ячейка ОЦЕНКА (5 звёзд Letterboxd: зелёные + тёмные пустые)
    const ratingCol = tr.createDiv();
    renderDiaryStars5(ratingCol, item["оценка"]);

    // 7. Ячейка ЛЮБИМОЕ (интерактивное сердечко: оранжевое или тускло-серое)
    const likeCell = tr.createDiv({ cls: "lb-diary-like-cell" });
    const heartBtn = likeCell.createEl("button", {
      cls: `lb-diary-heart-btn ${item["любимое"] ? "is-liked" : ""}`,
      text: "♥",
      attr: {
        type: "button",
        title: item["любимое"] ? I18N.favRemove : I18N.favAdd
      }
    });
    heartBtn.onclick = async () => {
      const nextFav = !item["любимое"];
      await updateMediaFrontmatter(item.file.path, fm => {
        if (nextFav) fm["любимое"] = true;
        else delete fm["любимое"];
      });
      item["любимое"] = nextFav;
      renderDashboard();
    };

    // 8. Ячейка ПОВТОР (REWATCH)
    const rewatchCell = tr.createDiv({ cls: "lb-diary-rewatch-cell" });
    if (rewatchCount > 0) {
      rewatchCell.createSpan({
        cls: "lb-diary-rewatch-icon",
        text: rewatchCount > 1 ? `↻${rewatchCount}` : "↻",
        attr: { title: `${schema.rewatchLabel}: ${rewatchCount}` }
      });
    }

    // 9. Ячейка ПРАВКА (✎ и ⋯ как в Letterboxd)
    const actionsCell = tr.createDiv({ cls: "lb-diary-actions-cell" });
    const editBtn = actionsCell.createEl("button", {
      cls: "lb-diary-icon-btn",
      text: "✎",
      attr: { type: "button", title: I18N.rateAction }
    });
    editBtn.onclick = () => {
      new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
    };

    const moreBtn = actionsCell.createEl("button", {
      cls: "lb-diary-icon-btn",
      text: "⋯",
      attr: { type: "button", title: I18N.menuAction }
    });
    moreBtn.onclick = () => {
      new PosterActionSheetModal(app, item, () => renderDashboard()).open();
    };
  });
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