/* ==========================================================================
   MEDIA DASHBOARD HUB v2.0 (Letterboxd & Backloggd Edition)
   Фильмы (режиссёр, хронометраж) · Сериалы (шоураннер, сезоны) · Игры (студия, платформа, часы)
   Кастомные постеры · Списки (Lists) · Watchlist · Хронологический Дневник · Живая статистика
   ========================================================================== */

const MEDIA_ROOT_FOLDER = "Знания/Медиа";
const root = dv.container.createDiv({ cls: "dashboard-home dh-media-hub" });

const notify = msg => {
  try { new Notice(msg); } catch { console.log(msg); }
};

function flatArray(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(flatArray);
  if (dv.isArray && dv.isArray(v)) return Array.from(v).flatMap(flatArray);
  const s = String(v).trim();
  return s ? [s] : [];
}

function parseNum(v, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toISODateStr(v) {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    return v.trim().slice(0, 10);
  }
  try {
    const d = dv.date(v);
    if (d && d.isValid) return d.toISODate();
  } catch {}
  return "";
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

// Конфигурация специфичных свойств для каждого типа медиа
const MEDIA_SCHEMAS = {
  "Фильм": {
    folder: "Фильмы",
    icon: "🎬",
    creatorKey: "режиссёр",
    creatorLabel: "Режиссёр",
    creatorFilterAll: "Все режиссёры",
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
    creatorKey: "шоураннер",
    creatorLabel: "Шоураннер / Студия",
    creatorFilterAll: "Все шоураннеры и студии",
    creatorPlaceholder: "Винс Гиллиган, HBO, A24",
    dateKey: "дата_просмотра",
    dateLabel: "Дата завершения / лога",
    statuses: ["Просмотрено", "Смотрю", "В планах", "Брошено"],
    completedStatuses: ["Просмотрено"],
    defaultDoneStatus: "Просмотрено",
    rewatchLabel: "Пересмотр"
  },
  "Игра": {
    folder: "Игры",
    icon: "🎮",
    creatorKey: "разработчик",
    creatorLabel: "Разработчик / Студия",
    creatorFilterAll: "Все разработчики и студии",
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
  const clean = String(typeStr || "Фильм").trim();
  if (clean.toLowerCase() === "сериал") return MEDIA_SCHEMAS["Сериал"];
  if (clean.toLowerCase() === "игра") return MEDIA_SCHEMAS["Игра"];
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

function isItemCompleted(item) {
  const st = String(item["статус"] || "").trim();
  return ["Просмотрено", "Пройдено", "На 100% / Платина"].includes(st);
}

function isItemWatchlist(item) {
  return String(item["статус"] || "").trim() === "В планах";
}

function formatStars(score10) {
  const num = parseNum(score10, 0);
  if (num <= 0) return "";
  const stars5 = Math.round(num) / 2;
  const full = Math.floor(stars5);
  const half = stars5 % 1 !== 0;
  return "★".repeat(full) + (half ? "½" : "");
}

// Изолированные стили Letterboxd / Backloggd с плавными ключевыми кадрами
const styleEl = root.createEl("style");
styleEl.textContent = `
@keyframes lbCardReveal {
  0% { opacity: 0; transform: translateY(10px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes lbHeartPop {
  0% { transform: scale(1); }
  40% { transform: scale(1.38); }
  75% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.dashboard-home.dh-media-hub {
  --lb-green: #00e054;
  --lb-orange: #ff8000;
  --lb-blue: #40bcf4;
  --lb-heart: #ff4757;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 0 24px 0;
  color: var(--text-normal);
  font-family: var(--font-interface);
  box-sizing: border-box;
}

.dashboard-home.dh-media-hub * {
  box-sizing: border-box;
}

/* Верхняя навигация вкладок */
.dashboard-home .lb-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-home .lb-tabs-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  background: var(--background-secondary);
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-tab-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 7px !important;
  padding: 6px 12px !important;
  height: 32px !important;
  font-size: 0.82rem !important;
  font-weight: 500 !important;
  cursor: pointer;
  color: var(--text-muted) !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.12s ease;
}

.dashboard-home .lb-tab-btn:hover {
  color: var(--text-normal) !important;
  background: var(--background-modifier-hover) !important;
}

.dashboard-home .lb-tab-btn:active {
  transform: scale(0.96);
}

.dashboard-home .lb-tab-btn.active {
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  font-weight: 650 !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22) !important;
}

.dashboard-home .lb-tab-count {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--background-secondary-alt);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-tab-btn.active .lb-tab-count {
  color: var(--lb-green);
  background: color-mix(in srgb, var(--lb-green) 14%, transparent);
}

.dashboard-home .lb-add-cta {
  background: color-mix(in srgb, var(--lb-green) 16%, var(--background-secondary)) !important;
  border: 1px solid color-mix(in srgb, var(--lb-green) 45%, var(--background-modifier-border)) !important;
  color: var(--lb-green) !important;
  font-weight: 650 !important;
  padding: 0 14px !important;
  height: 34px !important;
  border-radius: 9px !important;
  cursor: pointer;
  transition: all 0.16s ease;
}

.dashboard-home .lb-add-cta:hover {
  background: color-mix(in srgb, var(--lb-green) 26%, var(--background-secondary)) !important;
  transform: translateY(-1px);
}

/* Статистика, гистограмма оценок и топ авторов */
.dashboard-home .lb-stats-section {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dashboard-home .lb-stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

.dashboard-home .lb-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dashboard-home .lb-stat-badge {
  background: var(--background-primary);
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 0.79rem;
  font-weight: 500;
  border: 1px solid var(--background-modifier-border);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dashboard-home .lb-stat-badge.is-green {
  color: var(--lb-green);
  border-color: color-mix(in srgb, var(--lb-green) 35%, var(--background-modifier-border));
  font-weight: 650;
}

.dashboard-home .lb-stat-badge.is-orange {
  color: var(--lb-orange);
  border-color: color-mix(in srgb, var(--lb-orange) 35%, var(--background-modifier-border));
}

.dashboard-home .lb-creators-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-creators-label {
  font-size: 0.73rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-right: 2px;
}

.dashboard-home .lb-creator-pill {
  height: 24px !important;
  padding: 0 9px !important;
  border-radius: 999px !important;
  font-size: 0.73rem !important;
  font-weight: 500 !important;
  background: var(--background-primary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-normal) !important;
  cursor: pointer;
  box-shadow: none !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  transition: all 0.14s ease;
}

.dashboard-home .lb-creator-pill:hover {
  border-color: var(--lb-blue) !important;
  color: var(--lb-blue) !important;
}

.dashboard-home .lb-creator-pill.is-active {
  background: color-mix(in srgb, var(--lb-blue) 18%, var(--background-primary)) !important;
  border-color: var(--lb-blue) !important;
  color: var(--lb-blue) !important;
  font-weight: 650 !important;
}

.dashboard-home .lb-histogram-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dashboard-home .lb-histogram {
  display: flex;
  align-items: flex-end;
  height: 42px;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 6px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-hist-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
  width: 14px;
  cursor: pointer;
}

.dashboard-home .lb-hist-fill {
  width: 100%;
  background: var(--lb-green);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  opacity: 0.55;
  transition: height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.15s ease, background-color 0.15s ease;
}

.dashboard-home .lb-hist-col:hover .lb-hist-fill,
.dashboard-home .lb-hist-col.is-active .lb-hist-fill {
  opacity: 1;
  background: var(--lb-orange);
}

.dashboard-home .lb-hist-label {
  font-size: 9px;
  color: var(--text-faint);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-hist-col.is-active .lb-hist-label {
  color: var(--lb-orange);
  font-weight: 700;
}

/* Полоса списков (Lists) */
.dashboard-home .lb-lists-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dashboard-home .lb-list-chip {
  height: 28px !important;
  padding: 0 11px !important;
  border-radius: 999px !important;
  font-size: 0.76rem !important;
  font-weight: 500 !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-muted) !important;
  cursor: pointer;
  box-shadow: none !important;
  transition: all 0.15s ease;
}

.dashboard-home .lb-list-chip:hover {
  color: var(--text-normal) !important;
  border-color: var(--lb-orange) !important;
}

.dashboard-home .lb-list-chip.is-active {
  background: color-mix(in srgb, var(--lb-orange) 18%, var(--background-secondary)) !important;
  border-color: var(--lb-orange) !important;
  color: var(--text-normal) !important;
  font-weight: 650 !important;
}

/* Панель фильтров и поиска */
.dashboard-home .lb-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-search-input {
  flex: 1 1 180px;
  min-width: 150px;
  height: 32px !important;
  padding: 0 10px !important;
  border-radius: 8px !important;
  font-size: 0.82rem !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
}

.dashboard-home .lb-filters-bar select {
  height: 32px;
  font-size: 0.8rem;
  padding: 0 24px 0 10px;
  border-radius: 8px;
  background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-chip-toggle {
  height: 32px !important;
  padding: 0 10px !important;
  border-radius: 8px !important;
  font-size: 0.8rem !important;
  font-weight: 500 !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-muted) !important;
  cursor: pointer;
  box-shadow: none !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
}

.dashboard-home .lb-chip-toggle.is-active {
  border-color: var(--lb-heart) !important;
  color: var(--lb-heart) !important;
  background: color-mix(in srgb, var(--lb-heart) 14%, var(--background-secondary)) !important;
}

/* Сетка постеров (Letterboxd Poster Grid) */
.dashboard-home .lb-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
  gap: 14px;
}

.dashboard-home .lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: transparent;
  animation: lbCardReveal 0.26s cubic-bezier(0.2, 0.85, 0.25, 1) both;
}

.dashboard-home .lb-poster-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: var(--background-secondary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 0.22s ease,
              border-color 0.18s ease;
}

.dashboard-home .lb-card:hover .lb-poster-wrapper {
  transform: translateY(-5px) scale(1.025);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.48), 0 0 0 2px var(--lb-green);
  border-color: var(--lb-green);
  z-index: 3;
}

.dashboard-home .lb-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}

.dashboard-home .lb-card:hover .lb-poster-img {
  transform: scale(1.04);
}

.dashboard-home .lb-poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 14px;
  text-align: center;
  background: radial-gradient(circle at 50% 25%, var(--background-secondary-alt), var(--background-secondary));
  gap: 6px;
}

.dashboard-home .lb-fallback-icon {
  font-size: 1.6rem;
  opacity: 0.55;
}

.dashboard-home .lb-fallback-title {
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.28;
  color: var(--text-normal);
}

.dashboard-home .lb-fallback-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* Оверлей поверх постера с быстрыми кнопками */
.dashboard-home .lb-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 16, 0.82) 0%,
    rgba(10, 12, 16, 0.12) 42%,
    rgba(10, 12, 16, 0.92) 100%
  );
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
  opacity: 0;
  transition: opacity 0.18s ease-in-out;
}

.dashboard-home .lb-card:hover .lb-overlay {
  opacity: 1;
}

.dashboard-home .lb-overlay-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}

.dashboard-home .lb-quick-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dashboard-home .lb-mini-btn {
  width: 26px !important;
  min-width: 26px !important;
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 !important;
  border-radius: 6px !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  background: rgba(18, 20, 26, 0.78) !important;
  color: rgba(255, 255, 255, 0.8) !important;
  font-size: 0.78rem !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: none !important;
  backdrop-filter: blur(6px);
  transition: transform 0.12s ease, background-color 0.12s ease, color 0.12s ease;
}

.dashboard-home .lb-mini-btn:hover {
  background: rgba(30, 34, 44, 0.95) !important;
  color: #ffffff !important;
  transform: scale(1.08);
}

.dashboard-home .lb-mini-btn.is-fav {
  color: var(--lb-heart) !important;
  border-color: rgba(255, 71, 87, 0.5) !important;
  animation: lbHeartPop 0.28s ease;
}

.dashboard-home .lb-mini-btn.is-rewatch {
  color: var(--lb-blue) !important;
  border-color: rgba(64, 188, 244, 0.5) !important;
}

.dashboard-home .lb-score-pill {
  background: rgba(14, 16, 20, 0.88);
  color: var(--lb-green);
  font-size: 0.73rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid rgba(0, 224, 84, 0.35);
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-overlay-bottom {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dashboard-home .lb-overlay-title {
  font-size: 0.78rem;
  font-weight: 650;
  color: #ffffff;
  line-height: 1.22;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dashboard-home .lb-overlay-creator {
  font-size: 0.69rem;
  font-weight: 500;
  color: var(--lb-blue);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-home .lb-overlay-creator:hover {
  text-decoration: underline;
}

.dashboard-home .lb-overlay-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.72);
}

/* Подпись под постером в стиле Letterboxd (звёзды + сердечко + автор) */
.dashboard-home .lb-card-caption {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 2px 0 2px;
}

.dashboard-home .lb-caption-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 16px;
}

.dashboard-home .lb-stars {
  font-size: 0.74rem;
  color: var(--lb-green);
  letter-spacing: 0.5px;
  line-height: 1;
}

.dashboard-home .lb-caption-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
}

.dashboard-home .lb-caption-creator {
  font-size: 0.71rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dashboard-home .lb-caption-creator:hover {
  color: var(--lb-blue);
}

/* Хронологический Дневник (Letterboxd Diary View) */
.dashboard-home .lb-diary-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dashboard-home .lb-diary-month {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  overflow: hidden;
}

.dashboard-home .lb-diary-month-head {
  padding: 8px 14px;
  background: var(--background-secondary-alt);
  border-bottom: 1px solid var(--background-modifier-border);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
}

.dashboard-home .lb-diary-row {
  display: grid;
  grid-template-columns: 52px 42px minmax(140px, 1.5fr) minmax(110px, 1fr) 110px 36px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--background-modifier-border);
  font-size: 0.83rem;
  transition: background-color 0.14s ease;
}

.dashboard-home .lb-diary-row:last-child {
  border-bottom: none;
}

.dashboard-home .lb-diary-row:hover {
  background: var(--background-modifier-hover);
}

.dashboard-home .lb-diary-day {
  font-size: 1.05rem;
  font-weight: 750;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.dashboard-home .lb-diary-thumb {
  width: 34px;
  height: 50px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
}

/* Модальные окна (Логгер + Смена постера) */
.lb-modal-grid {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 16px;
  align-items: start;
}

.lb-modal-poster-preview {
  width: 150px;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-muted);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.lb-modal-poster-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lb-poster-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
  margin-top: 10px;
  max-height: 280px;
  overflow-y: auto;
}

.lb-poster-choice {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease;
}

.lb-poster-choice:hover {
  transform: scale(1.04);
}

.lb-poster-choice.is-selected {
  border-color: var(--lb-green);
  box-shadow: 0 0 0 2px rgba(0, 224, 84, 0.3);
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
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  padding: 7px 22px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-normal);
}

.dashboard-home .lb-empty-msg {
  padding: 36px 20px;
  text-align: center;
  color: var(--text-muted);
  background: var(--background-secondary);
  border: 1px dashed var(--background-modifier-border);
  border-radius: 12px;
  font-size: 0.86rem;
}

@media (pointer: coarse), (hover: none) {
  .dashboard-home .lb-overlay {
    opacity: 1;
    background: linear-gradient(180deg, rgba(10,12,16,0.55) 0%, transparent 45%, rgba(10,12,16,0.88) 100%);
  }
  .dashboard-home .lb-mini-btn {
    width: 32px !important;
    min-width: 32px !important;
    height: 32px !important;
    min-height: 32px !important;
  }
}

@media (max-width: 680px) {
  .lb-modal-grid {
    grid-template-columns: 1fr;
  }
  .lb-modal-poster-preview {
    margin: 0 auto;
  }
  .dashboard-home .lb-diary-row {
    grid-template-columns: 38px 1fr 74px;
  }
  .dashboard-home .lb-diary-thumb,
  .dashboard-home .lb-diary-creator-col {
    display: none;
  }
}
`;

// Глобальное состояние сессии UI
if (!window.dhMediaState) {
  window.dhMediaState = {
    activeTab: "Фильм", // "Фильм" | "Сериал" | "Игра" | "Watchlist" | "Списки" | "Дневник" | "Любимое"
    statusFilter: "Все",
    genreFilter: "Все",
    creatorFilter: "Все",
    platformFilter: "Все",
    listFilter: "Все",
    ratingFilter: null,
    searchQuery: "",
    onlyFavorites: false,
    sortBy: "date_desc",
    page: 1,
    pageSize: 24
  };
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
// МОДАЛЬНОЕ ОКНО ВЫБОРА / СМЕНЫ ПОСТЕРА (КАК В LETTERBOXD PATRON)
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
      attr: { style: "display: flex; gap: 8px; margin-bottom: 12px; align-items: center;" }
    });
    const urlInput = urlRow.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Вставь URL нового постера (TMDB / SteamGridDB / IGDB) или [[файл.jpg]]…",
        value: this.currentPoster,
        style: "flex: 1; height: 34px; padding: 0 10px; border-radius: 7px;"
      }
    });

    const addAltBtn = urlRow.createEl("button", {
      text: "＋ В коллекцию",
      attr: { type: "button", style: "height: 34px; border-radius: 7px; cursor: pointer;" }
    });

    const applyBtn = urlRow.createEl("button", {
      cls: "mod-cta",
      text: "Сделать основным",
      attr: { type: "button", style: "height: 34px; border-radius: 7px; cursor: pointer;" }
    });

    // Сбор локальных картинок из папки медиа, если пользователь хранит обложки локально
    const vaultImages = app.vault.getFiles().filter(f =>
      f.path.startsWith(MEDIA_ROOT_FOLDER) &&
      ["png", "jpg", "jpeg", "webp", "avif"].includes(f.extension.toLowerCase())
    );

    const galleryTitle = contentEl.createDiv({
      text: "Альтернативные постеры этого тайтла (кликни, чтобы выбрать):",
      attr: { style: "font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;" }
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
          text: "Пока нет сохранённых вариантов. Вставь ссылку выше!",
          attr: { style: "grid-column: 1 / -1; color: var(--text-muted); font-size: 0.8rem; padding: 12px 0;" }
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
        fm["постер"] = chosen;
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
// МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ И РЕДАКТИРОВАНИЯ ТАЙТЛА (DYNAMIC TYPE FIELDS)
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
      year: ex && ex["год"] ? Number(ex["год"]) : new Date().getFullYear(),
      rating: ex && typeof ex["оценка"] === "number" ? ex["оценка"] : 8,
      status: ex && ex["статус"] ? String(ex["статус"]) : schema.defaultDoneStatus,
      date: ex ? (getItemDateISO(ex) || new Date().toISOString().split("T")[0]) : new Date().toISOString().split("T")[0],
      poster: ex ? String(ex["постер"] || "") : "",
      favorite: ex ? Boolean(ex["любимое"]) : false,
      rewatch: ex ? Boolean(ex["пересмотр"]) : false,
      creator: ex ? getItemCreators(ex).join(", ") : "",
      runtimeMin: ex && ex["длительность_мин"] ? Number(ex["длительность_мин"]) : "",
      seasons: ex && ex["сезонов"] ? Number(ex["сезонов"]) : "",
      episodes: ex && ex["серий"] ? Number(ex["серий"]) : "",
      platform: ex ? flatArray(ex["платформа"]).join(", ") : "PC",
      hoursPlayed: ex && ex["часов_наиграно"] ? Number(ex["часов_наиграно"]) : "",
      genres: ex ? flatArray(ex["жанр"]).join(", ") : "",
      lists: ex ? flatArray(ex["списки"]).join(", ") : "",
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
        ? `${schema.icon} Редактировать: ${this.data.title}`
        : `${schema.icon} Залогировать в Медиатеку`
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
        previewBox.createDiv({ text: `${schema.icon}\nПредпросмотр постера` });
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

    // Специфичное поле автора: Режиссёр / Шоураннер / Разработчик (Студия)
    new obsidian.Setting(rightCol)
      .setName(schema.creatorLabel)
      .setDesc("Можно указать нескольких через запятую для фильтрации")
      .addText(t => t
        .setPlaceholder(schema.creatorPlaceholder)
        .setValue(this.data.creator)
        .onChange(v => { this.data.creator = v; }));

    // Индивидуальные поля для Фильма / Сериала / Игры
    if (this.data.type === "Фильм") {
      new obsidian.Setting(rightCol)
        .setName("Год выпуска и Хронометраж (мин)")
        .addText(t => t
          .setPlaceholder("Год (2024)")
          .setValue(String(this.data.year || ""))
          .onChange(v => { this.data.year = Number(v) || new Date().getFullYear(); }))
        .addText(t => t
          .setPlaceholder("Мин (напр. 166)")
          .setValue(String(this.data.runtimeMin || ""))
          .onChange(v => { this.data.runtimeMin = Number(v) || ""; }));
    } else if (this.data.type === "Сериал") {
      new obsidian.Setting(rightCol)
        .setName("Год, Сезоны и Серии")
        .addText(t => t
          .setPlaceholder("Год (2024)")
          .setValue(String(this.data.year || ""))
          .onChange(v => { this.data.year = Number(v) || new Date().getFullYear(); }))
        .addText(t => t
          .setPlaceholder("Сезонов")
          .setValue(String(this.data.seasons || ""))
          .onChange(v => { this.data.seasons = Number(v) || ""; }))
        .addText(t => t
          .setPlaceholder("Серий")
          .setValue(String(this.data.episodes || ""))
          .onChange(v => { this.data.episodes = Number(v) || ""; }));
    } else if (this.data.type === "Игра") {
      new obsidian.Setting(rightCol)
        .setName("Год, Платформа и Наиграно часов")
        .addText(t => t
          .setPlaceholder("Год")
          .setValue(String(this.data.year || ""))
          .onChange(v => { this.data.year = Number(v) || new Date().getFullYear(); }))
        .addText(t => t
          .setPlaceholder("PC, PS5")
          .setValue(this.data.platform)
          .onChange(v => { this.data.platform = v; }))
        .addText(t => t
          .setPlaceholder("Часов (напр. 85)")
          .setValue(String(this.data.hoursPlayed || ""))
          .onChange(v => { this.data.hoursPlayed = parseNum(v, ""); }));
    }

    new obsidian.Setting(rightCol)
      .setName("Статус и Дата")
      .addDropdown(d => {
        schema.statuses.forEach(st => d.addOption(st, st));
        d.setValue(this.data.status);
        d.onChange(v => { this.data.status = v; });
      })
      .addText(t => t
        .setPlaceholder("ГГГГ-ММ-ДД")
        .setValue(this.data.date)
        .onChange(v => { this.data.date = v.trim(); }));

    const ratingSetting = new obsidian.Setting(rightCol)
      .setName(`Оценка: ★ ${this.data.rating} (${formatStars(this.data.rating) || "без оценки"})`)
      .addSlider(s => s
        .setLimits(0, 10, 0.5)
        .setValue(this.data.rating)
        .setDynamicTooltip()
        .onChange(v => {
          this.data.rating = v;
          ratingSetting.setName(`Оценка: ★ ${v} (${formatStars(v) || "без оценки"})`);
        }));

    new obsidian.Setting(rightCol)
      .setName(`Отметки: ♥ Любимое / 🔄 ${schema.rewatchLabel}`)
      .addToggle(tg => tg
        .setTooltip("♥ В избранное")
        .setValue(this.data.favorite)
        .onChange(v => { this.data.favorite = v; }))
      .addToggle(tg => tg
        .setTooltip(`🔄 ${schema.rewatchLabel}`)
        .setValue(this.data.rewatch)
        .onChange(v => { this.data.rewatch = v; }));

    new obsidian.Setting(rightCol)
      .setName("Постер (URL или [[файл.jpg]])")
      .addText(t => t
        .setPlaceholder("https://image.tmdb.org/...")
        .setValue(this.data.poster)
        .onChange(v => {
          this.data.poster = v.trim();
          updatePreview();
        }));

    new obsidian.Setting(rightCol)
      .setName("Жанры и Списки (Lists)")
      .addText(t => t
        .setPlaceholder("Жанры: Sci-Fi, RPG, Драма")
        .setValue(this.data.genres)
        .onChange(v => { this.data.genres = v; }))
      .addText(t => t
        .setPlaceholder("Списки: Топ 2026, Любимый Sci-Fi")
        .setValue(this.data.lists)
        .onChange(v => { this.data.lists = v; }));

    new obsidian.Setting(contentEl)
      .setName("Рецензия / короткий отзыв")
      .addTextArea(t => {
        t.setValue(this.data.review);
        t.inputEl.rows = 3;
        t.inputEl.style.width = "100%";
        t.onChange(v => { this.data.review = v; });
      });

    new obsidian.Setting(contentEl)
      .addButton(btn => btn
        .setButtonText(this.existingItem ? "Сохранить изменения" : "Добавить в Медиатеку")
        .setCta()
        .onClick(async () => {
          if (!this.data.title.trim()) {
            notify("Введите название!");
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
    const listsArray = splitClean(this.data.lists);
    const platformsList = splitClean(this.data.platform);

    if (this.existingItem) {
      await updateMediaFrontmatter(this.existingItem.file.path, fm => {
        fm["тип"] = this.data.type;
        fm["название"] = this.data.title.trim();
        fm["год"] = this.data.year;
        fm["постер"] = this.data.poster;
        fm["оценка"] = this.data.rating;
        fm["статус"] = this.data.status;
        fm[schema.dateKey] = this.data.date;
        fm["любимое"] = this.data.favorite;
        fm["пересмотр"] = this.data.rewatch;
        fm[schema.creatorKey] = creatorsList.length <= 1 ? (creatorsList[0] || "") : creatorsList;
        fm["жанр"] = genresList;
        if (listsArray.length > 0) fm["списки"] = listsArray;
        fm["отзыв"] = this.data.review;

        if (this.data.type === "Фильм" && this.data.runtimeMin) {
          fm["длительность_мин"] = Number(this.data.runtimeMin);
        } else if (this.data.type === "Сериал") {
          if (this.data.seasons) fm["сезонов"] = Number(this.data.seasons);
          if (this.data.episodes) fm["серий"] = Number(this.data.episodes);
        } else if (this.data.type === "Игра") {
          if (platformsList.length > 0) fm["платформа"] = platformsList;
          if (this.data.hoursPlayed !== "") fm["часов_наиграно"] = Number(this.data.hoursPlayed);
        }
      });
      notify(`Обновлено: «${this.data.title}»`);
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

    const fmLines = [
      "---",
      `направление: "Медиа"`,
      `тип: "${this.data.type}"`,
      `название: ${JSON.stringify(this.data.title.trim())}`,
      `год: ${this.data.year}`,
      `${schema.creatorKey}: ${creatorsList.length > 1 ? JSON.stringify(creatorsList) : JSON.stringify(creatorsList[0] || "")}`
    ];

    if (this.data.type === "Фильм" && this.data.runtimeMin) {
      fmLines.push(`длительность_мин: ${Number(this.data.runtimeMin)}`);
    } else if (this.data.type === "Сериал") {
      if (this.data.seasons) fmLines.push(`сезонов: ${Number(this.data.seasons)}`);
      if (this.data.episodes) fmLines.push(`серий: ${Number(this.data.episodes)}`);
    } else if (this.data.type === "Игра") {
      fmLines.push(`платформа: ${JSON.stringify(platformsList.length ? platformsList : ["PC"])}`);
      if (this.data.hoursPlayed !== "") fmLines.push(`часов_наиграно: ${Number(this.data.hoursPlayed)}`);
    }

    fmLines.push(
      `постер: ${JSON.stringify(this.data.poster)}`,
      `оценка: ${this.data.rating}`,
      `статус: "${this.data.status}"`,
      `${schema.dateKey}: "${this.data.date}"`,
      `любимое: ${this.data.favorite}`,
      `пересмотр: ${this.data.rewatch}`,
      `жанр: ${JSON.stringify(genresList)}`
    );

    if (listsArray.length > 0) {
      fmLines.push(`списки: ${JSON.stringify(listsArray)}`);
    }
    fmLines.push(
      `отзыв: ${JSON.stringify(this.data.review)}`,
      "---",
      "",
      `# ${this.data.title.trim()}`,
      "",
      this.data.review ? `> ${this.data.review}\n` : ""
    );

    await app.vault.create(filePath, fmLines.join("\n"));
    notify(`Добавлено в медиатеку: «${this.data.title}»`);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ==========================================================================
// ПОСТРОЕНИЕ КАРКАСА И ЧТЕНИЕ ЗАМЕТОК ИЗ ХРАНИЛИЩА
// ==========================================================================
const topBar = root.createDiv({ cls: "lb-topbar" });
const statsContainer = root.createDiv({ cls: "lb-stats-section" });
const listsBarContainer = root.createDiv({ cls: "lb-lists-bar" });
const controlsContainer = root.createDiv({ cls: "lb-controls-section" });
const gridContainer = root.createDiv({ cls: "lb-grid-section" });
const paginationContainer = root.createDiv({ cls: "lb-pagination-section" });

function getAllMediaPages() {
  return dv.pages(`"${MEDIA_ROOT_FOLDER}"`).where(p => {
    const t = String(p["тип"] || "").trim();
    return Boolean(t) && p.file.name !== "🎬Медиатека";
  }).values;
}

function getScopedPages(allMedia) {
  const tab = state.activeTab;
  if (tab === "Любимое") return allMedia.filter(p => p["любимое"] === true);
  if (tab === "Watchlist") return allMedia.filter(isItemWatchlist);
  if (tab === "Списки") {
    return allMedia.filter(p => flatArray(p["списки"]).length > 0);
  }
  if (tab === "Дневник") {
    return allMedia.filter(p => isItemCompleted(p) && Boolean(getItemDateISO(p)));
  }
  return allMedia.filter(p => String(p["тип"] || "").trim().toLowerCase() === tab.toLowerCase());
}

function renderTopBar(allMedia) {
  topBar.empty();

  const counts = {
    "Фильм": allMedia.filter(p => String(p["тип"]).toLowerCase() === "фильм").length,
    "Сериал": allMedia.filter(p => String(p["тип"]).toLowerCase() === "сериал").length,
    "Игра": allMedia.filter(p => String(p["тип"]).toLowerCase() === "игра").length,
    "Watchlist": allMedia.filter(isItemWatchlist).length,
    "Списки": new Set(allMedia.flatMap(p => flatArray(p["списки"]))).size,
    "Дневник": allMedia.filter(p => isItemCompleted(p) && Boolean(getItemDateISO(p))).length,
    "Любимое": allMedia.filter(p => p["любимое"] === true).length
  };

  const tabsWrap = topBar.createDiv({ cls: "lb-tabs-wrap" });
  const tabsGroup = tabsWrap.createDiv({ cls: "lb-tabs" });

  const tabs = [
    { id: "Фильм", label: "🎬 Фильмы" },
    { id: "Сериал", label: "📺 Сериалы" },
    { id: "Игра", label: "🎮 Игры" },
    { id: "Watchlist", label: "⏱ В планах" },
    { id: "Списки", label: "📑 Списки" },
    { id: "Дневник", label: "📓 Дневник" },
    { id: "Любимое", label: "♥ Любимое" }
  ];

  tabs.forEach(t => {
    const btn = tabsGroup.createEl("button", {
      cls: `lb-tab-btn ${state.activeTab === t.id ? "active" : ""}`,
      attr: { type: "button" }
    });
    btn.createSpan({ text: t.label });
    btn.createSpan({ cls: "lb-tab-count", text: String(counts[t.id] ?? 0) });

    btn.onclick = () => {
      state.activeTab = t.id;
      state.creatorFilter = "Все";
      state.genreFilter = "Все";
      state.platformFilter = "Все";
      state.ratingFilter = null;
      state.page = 1;
      renderDashboard();
    };
  });

  const addBtn = topBar.createEl("button", {
    cls: "lb-add-cta",
    text: "＋ Залогировать",
    attr: { type: "button" }
  });
  addBtn.onclick = () => {
    new MediaLogModal(app, state.activeTab, null, () => renderDashboard()).open();
  };
}

function renderStats(scopedItems) {
  statsContainer.empty();
  const currentYear = String(new Date().getFullYear());

  const completed = scopedItems.filter(isItemCompleted);
  const thisYear = completed.filter(i => getItemDateISO(i).startsWith(currentYear));
  const ratedItems = scopedItems.filter(i => parseNum(i["оценка"], 0) > 0);
  const avgScore = ratedItems.length
    ? (ratedItems.reduce((acc, curr) => acc + parseNum(curr["оценка"], 0), 0) / ratedItems.length).toFixed(1)
    : "—";

  // Подсчёт специфичных метрик (часы в играх / хронометраж фильмов / сезоны сериалов)
  const totalGameHours = scopedItems.reduce((acc, i) => acc + parseNum(i["часов_наиграно"], 0), 0);
  const totalMovieMin = scopedItems.reduce((acc, i) => acc + parseNum(i["длительность_мин"], 0), 0);
  const rewatchedCount = scopedItems.filter(i => i["пересмотр"] === true).length;

  const statsBar = statsContainer.createDiv({ cls: "lb-stats-bar" });
  const summary = statsBar.createDiv({ cls: "lb-summary" });

  summary.createDiv({ cls: "lb-stat-badge", text: `Завершено: ${completed.length}` });
  summary.createDiv({ cls: "lb-stat-badge", text: `В ${currentYear}: ${thisYear.length}` });
  summary.createDiv({ cls: "lb-stat-badge is-green", text: `★ Средняя: ${avgScore}` });

  if (state.activeTab === "Игра" && totalGameHours > 0) {
    summary.createDiv({ cls: "lb-stat-badge is-orange", text: `🕹 Наиграно: ${Math.round(totalGameHours)} ч` });
  } else if (state.activeTab === "Фильм" && totalMovieMin > 0) {
    summary.createDiv({ cls: "lb-stat-badge is-orange", text: `🎞 Хронометраж: ${Math.round(totalMovieMin / 60)} ч` });
  }
  if (rewatchedCount > 0) {
    summary.createDiv({ cls: "lb-stat-badge", text: `🔄 Повторов: ${rewatchedCount}` });
  }

  // Кликабельная гистограмма оценок 1..10
  const histWrap = statsBar.createDiv({ cls: "lb-histogram-wrap" });
  const histoContainer = histWrap.createDiv({ cls: "lb-histogram" });
  const counts = Array(10).fill(0);
  ratedItems.forEach(i => {
    const s = Math.min(10, Math.max(1, Math.round(parseNum(i["оценка"], 0))));
    counts[s - 1]++;
  });
  const maxVal = Math.max(...counts, 1);

  counts.forEach((c, idx) => {
    const scoreVal = idx + 1;
    const isAct = state.ratingFilter === scoreVal;
    const col = histoContainer.createDiv({
      cls: `lb-hist-col ${isAct ? "is-active" : ""}`,
      attr: { title: `Оценка ${scoreVal}: ${c} шт. (нажми для фильтра)` }
    });
    const barHeight = Math.max(6, Math.round((c / maxVal) * 100));
    col.createDiv({
      cls: "lb-hist-fill",
      attr: { style: `height: ${c > 0 ? barHeight : 4}%;` }
    });
    col.createSpan({ cls: "lb-hist-label", text: `${scoreVal}` });
    col.onclick = () => {
      state.ratingFilter = state.ratingFilter === scoreVal ? null : scoreVal;
      state.page = 1;
      renderStats(scopedItems);
      renderContent(scopedItems);
    };
  });

  // Топ режиссёров / шоураннеров / разработчиков с фильтрацией в 1 клик
  const creatorCounter = new Map();
  scopedItems.forEach(item => {
    getItemCreators(item).forEach(cr => {
      creatorCounter.set(cr, (creatorCounter.get(cr) || 0) + 1);
    });
  });

  const topCreators = [...creatorCounter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 8);

  if (topCreators.length > 0) {
    const schema = getSchemaForType(state.activeTab);
    const creatorsRow = statsContainer.createDiv({ cls: "lb-creators-row" });
    const labelText =
      state.activeTab === "Фильм"
        ? "Топ режиссёров:"
        : state.activeTab === "Сериал"
          ? "Топ шоураннеров / студий:"
          : state.activeTab === "Игра"
            ? "Топ разработчиков:"
            : "Авторы и студии:";

    creatorsRow.createSpan({ cls: "lb-creators-label", text: labelText });

    topCreators.forEach(([name, count]) => {
      const isAct = state.creatorFilter === name;
      const pill = creatorsRow.createEl("button", {
        cls: `lb-creator-pill ${isAct ? "is-active" : ""}`,
        text: `${name} (${count})`,
        attr: { type: "button", title: `Фильтровать по: ${name}` }
      });
      pill.onclick = () => {
        state.creatorFilter = isAct ? "Все" : name;
        state.page = 1;
        renderStats(scopedItems);
        renderControls(scopedItems);
        renderContent(scopedItems);
      };
    });
  }
}

function renderListsBar(allMedia) {
  listsBarContainer.empty();
  const listCounts = new Map();
  allMedia.forEach(p => {
    flatArray(p["списки"]).forEach(l => {
      listCounts.set(l, (listCounts.get(l) || 0) + 1);
    });
  });

  if (listCounts.size === 0 && state.activeTab !== "Списки") {
    listsBarContainer.style.display = "none";
    return;
  }
  listsBarContainer.style.display = "flex";

  const allChip = listsBarContainer.createEl("button", {
    cls: `lb-list-chip ${state.listFilter === "Все" ? "is-active" : ""}`,
    text: "📑 Все подборки",
    attr: { type: "button" }
  });
  allChip.onclick = () => {
    state.listFilter = "Все";
    state.page = 1;
    renderListsBar(allMedia);
    renderContent(getScopedPages(allMedia));
  };

  [...listCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([listName, cnt]) => {
      const chip = listsBarContainer.createEl("button", {
        cls: `lb-list-chip ${state.listFilter === listName ? "is-active" : ""}`,
        text: `${listName} · ${cnt}`,
        attr: { type: "button" }
      });
      chip.onclick = () => {
        state.listFilter = state.listFilter === listName ? "Все" : listName;
        state.page = 1;
        renderListsBar(allMedia);
        renderContent(getScopedPages(allMedia));
      };
    });
}

function renderControls(scopedItems) {
  controlsContainer.empty();
  const bar = controlsContainer.createDiv({ cls: "lb-filters-bar" });
  const schema = getSchemaForType(state.activeTab);

  // Живой поиск по названию, режиссёру, студии или отзыву
  const searchInput = bar.createEl("input", {
    cls: "lb-search-input",
    attr: {
      type: "search",
      placeholder: "Поиск по названию, режиссёру, студии…",
      value: state.searchQuery
    }
  });
  searchInput.oninput = () => {
    state.searchQuery = searchInput.value;
    state.page = 1;
    renderContent(scopedItems);
  };

  // Фильтр статуса
  if (state.activeTab !== "Watchlist") {
    const statusSelect = bar.createEl("select", { cls: "dropdown" });
    const statusOptions = ["Фильм", "Сериал", "Игра"].includes(state.activeTab)
      ? ["Все", ...schema.statuses]
      : ["Все", "Просмотрено", "Пройдено", "На 100% / Платина", "Смотрю", "Играю", "В планах", "Брошено"];

    statusOptions.forEach(st => {
      const opt = statusSelect.createEl("option", { text: st === "Все" ? "Все статусы" : st, value: st });
      if (state.statusFilter === st) opt.selected = true;
    });
    statusSelect.onchange = e => {
      state.statusFilter = e.target.value;
      state.page = 1;
      renderContent(scopedItems);
    };
  }

  // Фильтр по Режиссёру / Шоураннеру / Студии-разработчику
  const creators = new Set();
  scopedItems.forEach(i => getItemCreators(i).forEach(c => creators.add(c)));

  const creatorSelect = bar.createEl("select", { cls: "dropdown" });
  creatorSelect.createEl("option", {
    text: ["Фильм", "Сериал", "Игра"].includes(state.activeTab)
      ? schema.creatorFilterAll
      : "Все авторы и студии",
    value: "Все"
  });
  [...creators].sort((a, b) => a.localeCompare(b, "ru")).forEach(cr => {
    const opt = creatorSelect.createEl("option", { text: cr, value: cr });
    if (state.creatorFilter === cr) opt.selected = true;
  });
  creatorSelect.onchange = e => {
    state.creatorFilter = e.target.value;
    state.page = 1;
    renderStats(scopedItems);
    renderContent(scopedItems);
  };

  // Фильтр по жанрам
  const genres = new Set();
  scopedItems.forEach(i => flatArray(i["жанр"]).forEach(g => genres.add(g)));

  const genreSelect = bar.createEl("select", { cls: "dropdown" });
  genreSelect.createEl("option", { text: "Все жанры", value: "Все" });
  [...genres].sort((a, b) => a.localeCompare(b, "ru")).forEach(g => {
    const opt = genreSelect.createEl("option", { text: g, value: g });
    if (state.genreFilter === g) opt.selected = true;
  });
  genreSelect.onchange = e => {
    state.genreFilter = e.target.value;
    state.page = 1;
    renderContent(scopedItems);
  };

  // Дополнительный фильтр платформ для вкладки «Игра»
  if (state.activeTab === "Игра") {
    const platforms = new Set();
    scopedItems.forEach(i => flatArray(i["платформа"]).forEach(pl => platforms.add(pl)));
    if (platforms.size > 0) {
      const platSelect = bar.createEl("select", { cls: "dropdown" });
      platSelect.createEl("option", { text: "Все платформы", value: "Все" });
      [...platforms].sort().forEach(pl => {
        const opt = platSelect.createEl("option", { text: pl, value: pl });
        if (state.platformFilter === pl) opt.selected = true;
      });
      platSelect.onchange = e => {
        state.platformFilter = e.target.value;
        state.page = 1;
        renderContent(scopedItems);
      };
    }
  }

  // Сортировка
  const sortSelect = bar.createEl("select", { cls: "dropdown" });
  [
    { id: "date_desc", label: "По дате лога (новые)" },
    { id: "rating_desc", label: "По оценке (высокая)" },
    { id: "year_desc", label: "По году релиза (свежие)" },
    { id: "title_asc", label: "По названию (А–Я)" }
  ].forEach(s => {
    const opt = sortSelect.createEl("option", { text: s.label, value: s.id });
    if (state.sortBy === s.id) opt.selected = true;
  });
  sortSelect.onchange = e => {
    state.sortBy = e.target.value;
    renderContent(scopedItems);
  };

  // Быстрый фильтр «Только ♥»
  const favBtn = bar.createEl("button", {
    cls: `lb-chip-toggle ${state.onlyFavorites ? "is-active" : ""}`,
    text: "♥ Любимое",
    attr: { type: "button" }
  });
  favBtn.onclick = () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.page = 1;
    renderControls(scopedItems);
    renderContent(scopedItems);
  };
}

function applyFiltersAndSort(items) {
  const q = state.searchQuery.trim().toLowerCase();

  const filtered = items.filter(p => {
    if (state.activeTab !== "Watchlist" && state.statusFilter !== "Все" && p["статус"] !== state.statusFilter) {
      return false;
    }
    if (state.creatorFilter !== "Все") {
      const crs = getItemCreators(p);
      if (!crs.includes(state.creatorFilter)) return false;
    }
    if (state.genreFilter !== "Все") {
      const gs = flatArray(p["жанр"]);
      if (!gs.includes(state.genreFilter)) return false;
    }
    if (state.activeTab === "Игра" && state.platformFilter !== "Все") {
      const pls = flatArray(p["платформа"]);
      if (!pls.includes(state.platformFilter)) return false;
    }
    if (state.listFilter !== "Все") {
      const ls = flatArray(p["списки"]);
      if (!ls.includes(state.listFilter)) return false;
    }
    if (state.ratingFilter !== null) {
      const r = Math.round(parseNum(p["оценка"], 0));
      if (r !== state.ratingFilter) return false;
    }
    if (state.onlyFavorites && !p["любимое"]) return false;

    if (q) {
      const hay = [
        p["название"] || p.file.name,
        ...getItemCreators(p),
        ...flatArray(p["жанр"]),
        ...flatArray(p["списки"]),
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
    head.createSpan({ text: `${list.length} шт.` });

    list.forEach(item => {
      const schema = getSchemaForType(item["тип"]);
      const iso = getItemDateISO(item);
      const dayNum = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) : "—";
      const row = monthBox.createDiv({ cls: "lb-diary-row" });

      row.createDiv({ cls: "lb-diary-day", text: dayNum });

      const src = resolvePosterSrc(item["постер"], item.file.path);
      if (src) {
        row.createEl("img", { cls: "lb-diary-thumb", attr: { src } });
      } else {
        row.createDiv({ cls: "lb-diary-thumb", text: schema.icon, attr: { style: "display:flex;align-items:center;justify-content:center;" } });
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
        titleCol.createSpan({ text: ` (${item["год"]})`, attr: { style: "font-size: 0.75rem; color: var(--text-muted);" } });
      }

      const creators = getItemCreators(item);
      row.createDiv({
        cls: "lb-diary-creator-col",
        text: creators.join(", ") || "—",
        attr: { style: "font-size: 0.78rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" }
      });

      const ratingCol = row.createDiv({ attr: { style: "display:flex;align-items:center;gap:6px;" } });
      ratingCol.createSpan({ cls: "lb-stars", text: formatStars(item["оценка"]) });
      if (item["любимое"]) ratingCol.createSpan({ text: "♥", attr: { style: "color: var(--lb-heart);" } });
      if (item["пересмотр"]) ratingCol.createSpan({ text: "🔄", attr: { style: "font-size: 0.75rem;" } });

      const editBtn = row.createEl("button", {
        cls: "lb-mini-btn",
        text: "✎",
        attr: { type: "button", title: "Редактировать запись" }
      });
      editBtn.onclick = () => {
        new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
      };
    });
  }
}

function renderContent(scopedItems) {
  gridContainer.empty();
  paginationContainer.empty();

  const filtered = applyFiltersAndSort(scopedItems);
  const total = filtered.length;

  if (total === 0) {
    gridContainer.createDiv({
      cls: "lb-empty-msg",
      text: "По выбранным фильтрам ничего не найдено. Сбрось фильтр или нажми «＋ Залогировать»."
    });
    return;
  }

  if (state.activeTab === "Дневник") {
    renderDiaryView(filtered);
    return;
  }

  const paginated = filtered.slice(0, state.page * state.pageSize);
  const grid = gridContainer.createDiv({ cls: "lb-cards-grid" });

  paginated.forEach((item, index) => {
    const schema = getSchemaForType(item["тип"]);
    const title = item["название"] || item.file.name;
    const creators = getItemCreators(item);
    const primaryCreator = creators[0] || "";
    const posterSrc = resolvePosterSrc(item["постер"], item.file.path);

    const card = grid.createDiv({
      cls: "lb-card",
      attr: { style: `animation-delay: ${Math.min(index * 18, 280)}ms;` }
    });

    const posterWrapper = card.createDiv({ cls: "lb-poster-wrapper" });
    posterWrapper.onclick = e => {
      if (e.target.closest(".lb-mini-btn, .lb-overlay-creator")) return;
      app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
    };

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

    const overlay = posterWrapper.createDiv({ cls: "lb-overlay" });
    const topInfo = overlay.createDiv({ cls: "lb-overlay-top" });

    // Быстрые интерактивные кнопки на постере: ♥ Любимое, 🔄 Ревотч, 🖼 Смена постера, ✎ Редактор
    const quickActions = topInfo.createDiv({ cls: "lb-quick-actions" });

    const favBtn = quickActions.createEl("button", {
      cls: `lb-mini-btn ${item["любимое"] ? "is-fav" : ""}`,
      text: "♥",
      attr: { type: "button", title: "Отметить любимым" }
    });
    favBtn.onclick = async e => {
      e.stopPropagation();
      const nextFav = !item["любимое"];
      await updateMediaFrontmatter(item.file.path, fm => { fm["любимое"] = nextFav; });
      item["любимое"] = nextFav;
      renderDashboard();
    };

    const rewatchBtn = quickActions.createEl("button", {
      cls: `lb-mini-btn ${item["пересмотр"] ? "is-rewatch" : ""}`,
      text: "🔄",
      attr: { type: "button", title: schema.rewatchLabel }
    });
    rewatchBtn.onclick = async e => {
      e.stopPropagation();
      const nextRw = !item["пересмотр"];
      await updateMediaFrontmatter(item.file.path, fm => { fm["пересмотр"] = nextRw; });
      item["пересмотр"] = nextRw;
      renderDashboard();
    };

    const posterBtn = quickActions.createEl("button", {
      cls: "lb-mini-btn",
      text: "🖼",
      attr: { type: "button", title: "Сменить постер (выбрать другой арт)" }
    });
    posterBtn.onclick = e => {
      e.stopPropagation();
      new PosterPickerModal(app, item, () => renderDashboard()).open();
    };

    const editBtn = quickActions.createEl("button", {
      cls: "lb-mini-btn",
      text: "✎",
      attr: { type: "button", title: "Изменить оценку, свойства или списки" }
    });
    editBtn.onclick = e => {
      e.stopPropagation();
      new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
    };

    if (parseNum(item["оценка"], 0) > 0) {
      topInfo.createSpan({ cls: "lb-score-pill", text: `★ ${item["оценка"]}` });
    }

    const bottomInfo = overlay.createDiv({ cls: "lb-overlay-bottom" });
    bottomInfo.createDiv({ cls: "lb-overlay-title", text: title });

    if (primaryCreator) {
      const crEl = bottomInfo.createDiv({
        cls: "lb-overlay-creator",
        text: primaryCreator,
        attr: { title: `${schema.creatorLabel}: ${creators.join(", ")} (нажми для фильтра)` }
      });
      crEl.onclick = e => {
        e.stopPropagation();
        state.creatorFilter = state.creatorFilter === primaryCreator ? "Все" : primaryCreator;
        state.page = 1;
        renderDashboard();
      };
    }

    const metaLine = bottomInfo.createDiv({ cls: "lb-overlay-meta" });
    const leftMetaParts = [];
    if (item["год"]) leftMetaParts.push(item["год"]);
    if (item["тип"] === "Фильм" && item["длительность_мин"]) leftMetaParts.push(`${item["длительность_мин"]} м`);
    if (item["тип"] === "Сериал" && item["сезонов"]) leftMetaParts.push(`${item["сезонов"]} сез.`);
    if (item["тип"] === "Игра" && item["часов_наиграно"]) leftMetaParts.push(`${item["часов_наиграно"]} ч`);
    metaLine.createSpan({ text: leftMetaParts.join(" · ") });

    const isoDate = getItemDateISO(item);
    if (isoDate) metaLine.createSpan({ text: isoDate.slice(5).replace("-", ".") });

    // Нижняя подпись под карточкой в духе Letterboxd
    const caption = card.createDiv({ cls: "lb-card-caption" });
    const capTop = caption.createDiv({ cls: "lb-caption-row" });
    capTop.createSpan({ cls: "lb-stars", text: formatStars(item["оценка"]) });

    const badges = capTop.createDiv({ cls: "lb-caption-badges" });
    if (item["любимое"]) badges.createSpan({ text: "♥", attr: { style: "color: var(--lb-heart);" } });
    if (item["пересмотр"]) badges.createSpan({ text: "🔄", attr: { title: schema.rewatchLabel } });
    if (item["отзыв"]) badges.createSpan({ text: "📝", attr: { title: String(item["отзыв"]) } });

    if (primaryCreator) {
      const capCr = caption.createDiv({
        cls: "lb-caption-creator",
        text: primaryCreator,
        attr: { title: `${schema.creatorLabel}: ${creators.join(", ")}` }
      });
      capCr.onclick = () => {
        state.creatorFilter = state.creatorFilter === primaryCreator ? "Все" : primaryCreator;
        state.page = 1;
        renderDashboard();
      };
    }
  });

  if (paginated.length < total) {
    const moreBtn = paginationContainer.createEl("button", {
      cls: "lb-more-btn",
      text: `Показать ещё (${total - paginated.length})`
    });
    moreBtn.onclick = () => {
      state.page++;
      renderContent(scopedItems);
    };
  }
}

function renderDashboard() {
  const allMedia = getAllMediaPages();
  const scopedItems = getScopedPages(allMedia);
  renderTopBar(allMedia);
  renderStats(scopedItems);
  renderListsBar(allMedia);
  renderControls(scopedItems);
  renderContent(scopedItems);
}

renderDashboard();
