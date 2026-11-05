/* ==========================================================================
   MEDIA DASHBOARD HUB v3.0 (Letterboxd & Backloggd Redesign)
   Двухуровневая навигация · Чистые постеры + Тач-панель iPad (44px) · Топ-4 любимых
   Годовая статистика и лидер периода · Декады · Счётчик пересмотров · Кастомные постеры
   ========================================================================== */

const MEDIA_ROOT_FOLDER = "Знания/Медиа";
const MIN_VALID_DATE_ISO = "1970-01-01";
const root = dv.container.createDiv({ cls: "dashboard-home dh-media-hub" });

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
    pluralTitle: "Сериалы",
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
    pluralTitle: "Игры",
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

function formatStars(score10) {
  const num = parseOptionalNum(score10);
  if (num === null || num <= 0) return "";
  const stars5 = Math.round(num) / 2;
  const full = Math.floor(stars5);
  const half = stars5 % 1 !== 0;
  return "★".repeat(full) + (half ? "½" : "");
}

// Встроенные стили (адаптация под светлую/тёмную темы Obsidian + разделение ПК/iPad)
const styleEl = root.createEl("style");
styleEl.textContent = `
@keyframes lbCardReveal {
  0% { opacity: 0; transform: translateY(8px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes lbSheetSlideUp {
  0% { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}

.dashboard-home.dh-media-hub {
  --lb-green: #00c853;
  --lb-orange: #ff8000;
  --lb-blue: #29b6f6;
  --lb-heart: #ff4757;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 0 28px 0;
  color: var(--text-normal);
  font-family: var(--font-interface);
  box-sizing: border-box;
}

.theme-dark .dashboard-home.dh-media-hub {
  --lb-green: #00e054;
  --lb-blue: #40bcf4;
}

.dashboard-home.dh-media-hub * {
  box-sizing: border-box;
}

/* 1. ДВУХУРОВНЕВАЯ НАВИГАЦИЯ */
.dashboard-home .lb-nav-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-home .lb-primary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-home .lb-primary-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  background: var(--background-secondary);
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-primary-tab {
  background: transparent !important;
  border: 1px solid transparent !important;
  box-shadow: none !important;
  border-radius: 9px !important;
  padding: 0 16px !important;
  height: 38px !important;
  min-height: 38px !important;
  font-size: 0.92rem !important;
  font-weight: 600 !important;
  cursor: pointer;
  color: var(--text-muted) !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.12s ease;
}

.dashboard-home .lb-primary-tab:hover {
  color: var(--text-normal) !important;
  background: var(--background-modifier-hover) !important;
}

.dashboard-home .lb-primary-tab.is-active {
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  border-color: color-mix(in srgb, var(--lb-green) 42%, var(--background-modifier-border)) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14) !important;
}

.dashboard-home .lb-primary-count {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--background-secondary-alt);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-primary-tab.is-active .lb-primary-count {
  color: var(--lb-green);
  background: color-mix(in srgb, var(--lb-green) 16%, transparent);
}

.dashboard-home .lb-add-cta {
  background: color-mix(in srgb, var(--lb-green) 16%, var(--background-secondary)) !important;
  border: 1px solid color-mix(in srgb, var(--lb-green) 48%, var(--background-modifier-border)) !important;
  color: var(--lb-green) !important;
  font-weight: 700 !important;
  font-size: 0.86rem !important;
  padding: 0 16px !important;
  height: 38px !important;
  min-height: 38px !important;
  border-radius: 10px !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  transition: all 0.16s ease;
}

.dashboard-home .lb-add-cta:hover {
  background: color-mix(in srgb, var(--lb-green) 26%, var(--background-secondary)) !important;
  transform: translateY(-1px);
}

/* Вторичный ряд: режимы вида (Постеры | Дневник | Списки) + быстрые срезы (В планах | Любимое) */
.dashboard-home .lb-secondary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-view-modes,
.dashboard-home .lb-quick-slices {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.dashboard-home .lb-sub-btn {
  background: transparent !important;
  border: 1px solid transparent !important;
  box-shadow: none !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 11px !important;
  border-radius: 7px !important;
  font-size: 0.78rem !important;
  font-weight: 550 !important;
  color: var(--text-muted) !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  transition: all 0.14s ease;
}

.dashboard-home .lb-sub-btn:hover {
  color: var(--text-normal) !important;
  background: var(--background-modifier-hover) !important;
}

.dashboard-home .lb-sub-btn.is-active {
  background: var(--background-primary) !important;
  color: var(--text-normal) !important;
  border-color: var(--background-modifier-border) !important;
  font-weight: 650 !important;
}

.dashboard-home .lb-sub-btn.is-watchlist.is-active {
  color: var(--lb-blue) !important;
  border-color: color-mix(in srgb, var(--lb-blue) 45%, var(--background-modifier-border)) !important;
  background: color-mix(in srgb, var(--lb-blue) 12%, var(--background-primary)) !important;
}

.dashboard-home .lb-sub-btn.is-fav.is-active {
  color: var(--lb-heart) !important;
  border-color: color-mix(in srgb, var(--lb-heart) 45%, var(--background-modifier-border)) !important;
  background: color-mix(in srgb, var(--lb-heart) 12%, var(--background-primary)) !important;
}

.dashboard-home .lb-sub-count {
  font-size: 0.69rem;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}

/* 2. ВИТРИНА «ТОП-4 ЛЮБИМЫХ» (LETTERBOXD FOUR FAVORITES) */
.dashboard-home .lb-top4-section {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 12px 14px;
}

.dashboard-home .lb-top4-section > summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  list-style: none;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.dashboard-home .lb-top4-section > summary::-webkit-details-marker {
  display: none;
}

.dashboard-home .lb-top4-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 145px));
  gap: 12px;
  margin-top: 10px;
}

/* 3. ГОДОВАЯ СТАТИСТИКА, ЛИДЕР ПЕРИОДА И ГИСТОГРАММА */
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
  gap: 12px;
}

.dashboard-home .lb-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dashboard-home .lb-year-pills {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--background-primary);
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-year-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  height: 24px !important;
  min-height: 24px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  font-size: 0.74rem !important;
  font-weight: 600 !important;
  color: var(--text-muted) !important;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.dashboard-home .lb-year-btn.is-active {
  background: var(--background-secondary) !important;
  color: var(--lb-green) !important;
}

.dashboard-home .lb-stat-badge {
  background: var(--background-primary);
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 0.78rem;
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

.dashboard-home .lb-stat-badge.is-clickable {
  cursor: pointer;
  transition: border-color 0.14s ease;
}

.dashboard-home .lb-stat-badge.is-clickable:hover {
  border-color: var(--lb-green);
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
  min-height: 24px !important;
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
}

.dashboard-home .lb-creator-pill:hover {
  border-color: var(--lb-blue) !important;
  color: var(--lb-blue) !important;
}

.dashboard-home .lb-creator-pill.is-active {
  background: color-mix(in srgb, var(--lb-blue) 16%, var(--background-primary)) !important;
  border-color: var(--lb-blue) !important;
  color: var(--lb-blue) !important;
  font-weight: 650 !important;
}

.dashboard-home .lb-histogram {
  display: flex;
  align-items: flex-end;
  height: 42px;
  gap: 4px;
  padding: 2px 5px;
  border-radius: 7px;
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
  transition: height 0.25s ease, opacity 0.15s ease, background-color 0.15s ease;
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

/* 4. ФИЛЬТРЫ И ПОИСК */
.dashboard-home .lb-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-search-input {
  flex: 1 1 190px;
  min-width: 150px;
  height: 34px !important;
  padding: 0 11px !important;
  border-radius: 8px !important;
  font-size: 0.82rem !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-normal) !important;
}

.dashboard-home .lb-filters-bar select {
  height: 34px;
  font-size: 0.8rem;
  padding: 0 24px 0 10px;
  border-radius: 8px;
  background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-normal);
}

/* 5. СЕТКА ПОСТЕРОВ И КАРТОЧКА (РАЗДЕЛЕНИЕ НАВЕДЕНИЯ ПК И КАСАНИЯ IPAD) */
.dashboard-home .lb-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(144px, 1fr));
  gap: 16px 14px;
}

.dashboard-home .lb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: transparent;
  animation: lbCardReveal 0.24s cubic-bezier(0.2, 0.85, 0.25, 1) both;
}

.dashboard-home .lb-poster-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 0.2s ease,
              border-color 0.18s ease;
}

.dashboard-home .lb-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.32s ease;
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
  font-size: 1.5rem;
  opacity: 0.6;
}

.dashboard-home .lb-fallback-title {
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.28;
  color: var(--text-normal);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dashboard-home .lb-fallback-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* ПК-оверлей при наведении мыши (максимум 3 элемента: 2 угла + 1 главная кнопка внизу) */
.dashboard-home .lb-desktop-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 16, 0.72) 0%,
    rgba(10, 12, 16, 0.08) 45%,
    rgba(10, 12, 16, 0.88) 100%
  );
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-home .lb-card:hover .lb-poster-wrapper {
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35), 0 0 0 2px var(--lb-green);
    border-color: var(--lb-green);
    z-index: 3;
  }
  .dashboard-home .lb-card:hover .lb-poster-img {
    transform: scale(1.04);
  }
  .dashboard-home .lb-card:hover .lb-desktop-overlay {
    opacity: 1;
    pointer-events: auto;
  }
  .dashboard-home .lb-touch-more-btn {
    display: none !important;
  }
}

.dashboard-home .lb-overlay-corners {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
}

.dashboard-home .lb-corner-btn {
  width: 30px !important;
  min-width: 30px !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 !important;
  border-radius: 7px !important;
  border: 1px solid rgba(255, 255, 255, 0.22) !important;
  background: rgba(16, 18, 24, 0.82) !important;
  color: #ffffff !important;
  font-size: 0.82rem !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  backdrop-filter: blur(6px);
  box-shadow: none !important;
  transition: transform 0.12s ease, background-color 0.12s ease;
}

.dashboard-home .lb-corner-btn:hover {
  background: rgba(28, 32, 42, 0.96) !important;
  transform: scale(1.08);
}

.dashboard-home .lb-corner-btn.is-fav {
  color: var(--lb-heart) !important;
  border-color: rgba(255, 71, 87, 0.55) !important;
}

.dashboard-home .lb-primary-overlay-btn {
  width: 100% !important;
  height: 32px !important;
  min-height: 32px !important;
  border-radius: 7px !important;
  border: 1px solid rgba(0, 224, 84, 0.45) !important;
  background: rgba(14, 17, 22, 0.9) !important;
  color: #ffffff !important;
  font-size: 0.76rem !important;
  font-weight: 650 !important;
  cursor: pointer;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
  backdrop-filter: blur(6px);
  box-shadow: none !important;
}

.dashboard-home .lb-primary-overlay-btn:hover {
  background: var(--lb-green) !important;
  color: #101216 !important;
}

/* Кнопка «⋯» (44x44px) для сенсорных экранов (iPad / iOS) */
.dashboard-home .lb-touch-more-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 44px !important;
  min-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
  padding: 0 !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  background: rgba(14, 16, 22, 0.68) !important;
  color: #ffffff !important;
  font-size: 1.15rem !important;
  font-weight: 700 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
  z-index: 4;
  cursor: pointer;
}

@media (hover: none) and (pointer: coarse) {
  .dashboard-home .lb-desktop-overlay {
    display: none !important;
  }
  .dashboard-home .lb-primary-tab,
  .dashboard-home .lb-add-cta {
    height: 44px !important;
    min-height: 44px !important;
  }
  .dashboard-home .lb-sub-btn {
    height: 38px !important;
    min-height: 38px !important;
    padding: 0 13px !important;
  }
  .dashboard-home .lb-filters-bar select,
  .dashboard-home .lb-search-input {
    height: 40px !important;
    min-height: 40px !important;
  }
}

/* Чистая подпись под постером: Название, Год, Звёзды и иконки состояния */
.dashboard-home .lb-card-caption {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 2px 0 2px;
}

.dashboard-home .lb-caption-title {
  font-size: 0.81rem;
  font-weight: 650;
  color: var(--text-normal);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dashboard-home .lb-caption-title:hover {
  color: var(--lb-green);
}

.dashboard-home .lb-caption-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 16px;
}

.dashboard-home .lb-caption-year {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
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
  color: var(--text-muted);
}

.dashboard-home .lb-caption-creator {
  font-size: 0.7rem;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.dashboard-home .lb-caption-creator:hover {
  color: var(--lb-blue);
}

/* 6. НИЖНЯЯ ТАЧ-ПАНЕЛЬ ДЕЙСТВИЙ ДЛЯ IPAD (ACTION SHEET MODAL) */
.lb-action-sheet-modal {
  width: min(460px, 94vw) !important;
  border-radius: 16px !important;
  padding: 16px !important;
  background: var(--background-primary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  animation: lbSheetSlideUp 0.2s cubic-bezier(0.2, 0.85, 0.25, 1) both;
}

.lb-sheet-head {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  margin-bottom: 12px;
}

.lb-sheet-thumb {
  width: 52px;
  height: 78px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}

.lb-sheet-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.lb-sheet-title {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-normal);
  line-height: 1.25;
}

.lb-sheet-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.lb-sheet-review {
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text-normal);
  background: var(--background-secondary);
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid var(--lb-green);
  margin-bottom: 12px;
}

.lb-sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lb-sheet-btn {
  width: 100% !important;
  min-height: 46px !important;
  height: 46px !important;
  padding: 0 14px !important;
  border-radius: 10px !important;
  font-size: 0.88rem !important;
  font-weight: 600 !important;
  background: var(--background-secondary) !important;
  border: 1px solid var(--background-modifier-border) !important;
  color: var(--text-normal) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  cursor: pointer;
  box-shadow: none !important;
}

.lb-sheet-btn:active {
  transform: scale(0.98);
}

.lb-sheet-btn.is-primary {
  background: color-mix(in srgb, var(--lb-green) 16%, var(--background-secondary)) !important;
  border-color: color-mix(in srgb, var(--lb-green) 45%, var(--background-modifier-border)) !important;
  color: var(--lb-green) !important;
}

/* 7. ВИТРИНА СПИСКОВ С МИНИ-ПОСТЕРАМИ И ДНЕВНИК */
.dashboard-home .lb-lists-showcase {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.dashboard-home .lb-list-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.16s ease, transform 0.14s ease;
}

.dashboard-home .lb-list-card:hover,
.dashboard-home .lb-list-card.is-active {
  border-color: var(--lb-orange);
  transform: translateY(-2px);
}

.dashboard-home .lb-list-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.dashboard-home .lb-list-card-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-normal);
}

.dashboard-home .lb-list-card-count {
  font-size: 0.74rem;
  color: var(--text-muted);
}

.dashboard-home .lb-list-thumbs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.dashboard-home .lb-list-thumb {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  object-fit: cover;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
}

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
  grid-template-columns: 48px 38px minmax(140px, 1.5fr) minmax(100px, 1fr) 110px 44px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--background-modifier-border);
  font-size: 0.83rem;
}

.dashboard-home .lb-diary-row:last-child {
  border-bottom: none;
}

.dashboard-home .lb-diary-day {
  font-size: 1.02rem;
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
}

.lb-poster-choice.is-selected {
  border-color: var(--lb-green);
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
  padding: 8px 22px;
  min-height: 40px;
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

@media (max-width: 680px) {
  .lb-modal-grid {
    grid-template-columns: 1fr;
  }
  .lb-modal-poster-preview {
    margin: 0 auto;
  }
  .dashboard-home .lb-top4-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-home .lb-diary-row {
    grid-template-columns: 38px 1fr 78px 44px;
  }
  .dashboard-home .lb-diary-thumb,
  .dashboard-home .lb-diary-creator-col {
    display: none;
  }
}
`;

// Состояние сессии UI с безопасной миграцией со старых вкладок
const defaultState = {
  activeCategory: "Фильм", // Главная троица: "Фильм" | "Сериал" | "Игра"
  viewMode: "grid",        // Вторичный вид: "grid" | "diary" | "lists"
  quickWatchlist: false,   // Быстрый фильтр «В планах» внутри раздела
  onlyFavorites: false,    // Быстрый фильтр «Любимое» внутри раздела
  yearFilter: "Все",       // Годовая статистика: "Все" | "2026" | "2025"...
  decadeFilter: "Все",     // Фильтр по декаде релиза: "Все" | "2020-е"...
  statusFilter: "Все",
  genreFilter: "Все",
  creatorFilter: "Все",
  platformFilter: "Все",
  listFilter: "Все",
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
// МОДАЛЬНОЕ ОКНО ВЫБОРА / СМЕНЫ ПОСТЕРА (LETTERBOXD PATRON)
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
        placeholder: "Вставь URL постера или [[файл.jpg]]…",
        value: this.currentPoster,
        style: "flex: 1; min-width: 180px; height: 36px; padding: 0 10px; border-radius: 7px;"
      }
    });

    const addAltBtn = urlRow.createEl("button", {
      text: "＋ В коллекцию",
      attr: { type: "button", style: "height: 36px; border-radius: 7px; cursor: pointer;" }
    });

    const applyBtn = urlRow.createEl("button", {
      cls: "mod-cta",
      text: "Сделать основным",
      attr: { type: "button", style: "height: 36px; border-radius: 7px; cursor: pointer;" }
    });

    const vaultImages = app.vault.getFiles().filter(f =>
      f.path.startsWith(MEDIA_ROOT_FOLDER) &&
      ["png", "jpg", "jpeg", "webp", "avif"].includes(f.extension.toLowerCase())
    );

    contentEl.createDiv({
      text: "Доступные обложки (кликни, чтобы выбрать):",
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
          text: "Пока нет сохранённых вариантов. Вставь ссылку выше.",
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
// НИЖНЯЯ ТАЧ-ПАНЕЛЬ ДЕЙСТВИЙ ДЛЯ IPAD (ЧИСТЫЕ ПОСТЕРЫ БЕЗ ШУМА)
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
      cls: "lb-sheet-btn is-primary",
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
    editBtn.createSpan({ text: "✎ Оценить / Изменить свойства" });
    editBtn.createSpan({ text: item["оценка"] ? `★ ${item["оценка"]}` : "—" });
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
      rating: ex && parseOptionalNum(ex["оценка"]) !== null ? Number(ex["оценка"]) : 8,
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
      platform: ex ? flatArray(ex["платформа"]).join(", ") : "PC",
      hoursPlayed: ex && parseOptionalNum(ex["часов_наиграно"]) !== null ? Number(ex["часов_наиграно"]) : "",
      genres: ex ? flatArray(ex["жанр"]).join(", ") : "",
      lists: ex ? flatArray(ex["списки"]).join(", ") : "",
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
      .setDesc("Через запятую для фильтрации и статистики")
      .addText(t => t
        .setPlaceholder(schema.creatorPlaceholder)
        .setValue(this.data.creator)
        .onChange(v => { this.data.creator = v; }));

    if (this.data.type === "Фильм") {
      new obsidian.Setting(rightCol)
        .setName("Год выпуска и Хронометраж (мин)")
        .addText(t => t
          .setPlaceholder("Год (2024)")
          .setValue(String(this.data.year ?? ""))
          .onChange(v => { this.data.year = parseOptionalNum(v); }))
        .addText(t => t
          .setPlaceholder("Мин (напр. 166)")
          .setValue(String(this.data.runtimeMin ?? ""))
          .onChange(v => { this.data.runtimeMin = parseOptionalNum(v) ?? ""; }));
    } else if (this.data.type === "Сериал") {
      new obsidian.Setting(rightCol)
        .setName("Год, Сезоны и Серии")
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
        .setName("Год, Платформа и Наиграно часов")
        .addText(t => t
          .setPlaceholder("Год")
          .setValue(String(this.data.year ?? ""))
          .onChange(v => { this.data.year = parseOptionalNum(v); }))
        .addText(t => t
          .setPlaceholder("PC, PS5")
          .setValue(this.data.platform)
          .onChange(v => { this.data.platform = v; }))
        .addText(t => t
          .setPlaceholder("Часов (напр. 85)")
          .setValue(String(this.data.hoursPlayed ?? ""))
          .onChange(v => { this.data.hoursPlayed = parseOptionalNum(v) ?? ""; }));
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
      .setName(`♥ Любимое / 📌 В Топ-4 / 🔄 Число повторов`)
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
      .setName("Постер (URL или [[файл.jpg]])")
      .addText(t => t
        .setPlaceholder("https://image.tmdb.org/...")
        .setValue(this.data.poster)
        .onChange(v => {
          this.data.poster = v.trim();
          updatePreview();
        }));

    new obsidian.Setting(rightCol)
      .setName("Жанры, Списки и Теги")
      .addText(t => t
        .setPlaceholder("Жанры: Sci-Fi, Триллер")
        .setValue(this.data.genres)
        .onChange(v => { this.data.genres = v; }))
      .addText(t => t
        .setPlaceholder("Списки: Топ 2026")
        .setValue(this.data.lists)
        .onChange(v => { this.data.lists = v; }))
      .addText(t => t
        .setPlaceholder("Теги: кооп, атмосфера")
        .setValue(this.data.mediaTags)
        .onChange(v => { this.data.mediaTags = v; }));

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

        if (listsArray.length > 0) fm["списки"] = listsArray;
        else delete fm["списки"];

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
        fm["платформа"] = platformsList.length ? platformsList : ["PC"];
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
      if (listsArray.length > 0) fm["списки"] = listsArray;
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
const statsContainer = root.createDiv({ cls: "lb-stats-section" });
const listsShowcaseContainer = root.createDiv({ cls: "lb-lists-host" });
const controlsContainer = root.createDiv({ cls: "lb-controls-section" });
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

  // Ряд 1: Главная троица (Фильмы, Сериалы, Игры) + кнопка «+ Залогировать»
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
      state.listFilter = "Все";
      state.ratingFilter = null;
      state.page = 1;
      renderDashboard();
    };
  });

  const addBtn = primaryBar.createEl("button", {
    cls: "lb-add-cta",
    text: "＋ Залогировать",
    attr: { type: "button" }
  });
  addBtn.onclick = () => {
    new MediaLogModal(app, state.activeCategory, null, () => renderDashboard()).open();
  };

  // Ряд 2: Компактные режимы представления слева + быстрые фильтры «В планах» и «Любимое» справа
  const secondaryBar = navContainer.createDiv({ cls: "lb-secondary-bar" });
  const viewModes = secondaryBar.createDiv({ cls: "lb-view-modes" });

  const diaryCount = categoryItems.filter(p => isItemCompleted(p) && Boolean(getItemDateISO(p))).length;
  const listsCount = new Set(categoryItems.flatMap(p => flatArray(p["списки"]))).size;

  [
    { id: "grid", label: "▦ Постеры", count: categoryItems.length },
    { id: "diary", label: "📓 Дневник", count: diaryCount },
    { id: "lists", label: "📑 Списки", count: listsCount }
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
    cls: `lb-sub-btn is-watchlist ${state.quickWatchlist ? "is-active" : ""}`,
    attr: { type: "button", title: "Фильтр «В планах» внутри текущего раздела" }
  });
  wlBtn.createSpan({ text: "⏱ В планах" });
  wlBtn.createSpan({ cls: "lb-sub-count", text: String(watchlistCount) });
  wlBtn.onclick = () => {
    state.quickWatchlist = !state.quickWatchlist;
    if (state.quickWatchlist) state.statusFilter = "В планах";
    else if (state.statusFilter === "В планах") state.statusFilter = "Все";
    state.page = 1;
    renderDashboard();
  };

  const favBtn = quickSlices.createEl("button", {
    cls: `lb-sub-btn is-fav ${state.onlyFavorites ? "is-active" : ""}`,
    attr: { type: "button", title: "Показать только любимые тайтлы в этом разделе" }
  });
  favBtn.createSpan({ text: "♥ Любимое" });
  favBtn.createSpan({ cls: "lb-sub-count", text: String(favCount) });
  favBtn.onclick = () => {
    state.onlyFavorites = !state.onlyFavorites;
    state.page = 1;
    renderDashboard();
  };
}

// 2. Витрина «Топ-4 любимых» (Letterboxd Four Favorites)
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
  summary.createSpan({ text: details.open ? "Свернуть ▲" : "Развернуть ▾", attr: { style: "font-size: 0.72rem;" } });

  const grid = details.createDiv({ cls: "lb-top4-grid" });
  showcaseItems.forEach((item, idx) => {
    renderPosterCard(grid, item, idx);
  });
}

// 3. Годовая статистика, лидер периода и гистограмма
function renderStats(categoryItems) {
  statsContainer.empty();

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

  const completed = yearScoped.filter(isItemCompleted);
  const ratedItems = yearScoped.filter(i => parseOptionalNum(i["оценка"]) !== null && parseNum(i["оценка"], 0) > 0);
  const avgScore = ratedItems.length
    ? (ratedItems.reduce((acc, curr) => acc + parseNum(curr["оценка"], 0), 0) / ratedItems.length).toFixed(1)
    : "—";

  const totalGameHours = yearScoped.reduce((acc, i) => acc + parseNum(i["часов_наиграно"], 0), 0);
  const totalMovieMin = yearScoped.reduce((acc, i) => acc + parseNum(i["длительность_мин"], 0), 0);
  const totalRewatches = yearScoped.reduce((acc, i) => acc + getRewatchCount(i), 0);

  // Самый высоко оценённый тайтл за выбранный период
  const highestRated = [...ratedItems].sort(
    (a, b) => parseNum(b["оценка"], 0) - parseNum(a["оценка"], 0) ||
      (getItemDateISO(b) || "").localeCompare(getItemDateISO(a) || "")
  )[0] || null;

  // Топ жанр за период
  const genreCounter = new Map();
  yearScoped.forEach(i => {
    flatArray(i["жанр"]).forEach(g => genreCounter.set(g, (genreCounter.get(g) || 0) + 1));
  });
  const topGenreEntry = [...genreCounter.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const statsBar = statsContainer.createDiv({ cls: "lb-stats-bar" });
  const summary = statsBar.createDiv({ cls: "lb-summary" });

  // Переключатель года («Все годы» | «2026» | «2025»...)
  if (sortedYears.length > 0) {
    const yearPills = summary.createDiv({ cls: "lb-year-pills" });
    ["Все", ...sortedYears.slice(0, 4)].forEach(yr => {
      const b = yearPills.createEl("button", {
        cls: `lb-year-btn ${state.yearFilter === yr ? "is-active" : ""}`,
        text: yr === "Все" ? "Все годы" : yr,
        attr: { type: "button" }
      });
      b.onclick = () => {
        state.yearFilter = yr;
        state.page = 1;
        renderDashboard();
      };
    });
  }

  summary.createDiv({ cls: "lb-stat-badge", text: `Завершено: ${completed.length}` });
  summary.createDiv({ cls: "lb-stat-badge is-green", text: `★ Средняя: ${avgScore}` });

  if (state.activeCategory === "Игра" && totalGameHours > 0) {
    summary.createDiv({ cls: "lb-stat-badge is-orange", text: `🕹 Часов: ${Math.round(totalGameHours)} ч` });
  } else if (state.activeCategory === "Фильм" && totalMovieMin > 0) {
    summary.createDiv({ cls: "lb-stat-badge is-orange", text: `🎞 Время: ${Math.round(totalMovieMin / 60)} ч` });
  }

  if (totalRewatches > 0) {
    summary.createDiv({ cls: "lb-stat-badge", text: `🔄 Повторов: ${totalRewatches}` });
  }

  if (topGenreEntry) {
    const gBadge = summary.createDiv({
      cls: "lb-stat-badge is-clickable",
      text: `🎭 Жанр: ${topGenreEntry[0]} (${topGenreEntry[1]})`,
      attr: { title: "Нажми, чтобы отфильтровать по этому жанру" }
    });
    gBadge.onclick = () => {
      state.genreFilter = state.genreFilter === topGenreEntry[0] ? "Все" : topGenreEntry[0];
      state.page = 1;
      renderDashboard();
    };
  }

  if (highestRated) {
    const bestTitle = highestRated["название"] || highestRated.file.name;
    const bestBadge = summary.createDiv({
      cls: "lb-stat-badge is-green is-clickable",
      text: `🏆 Лидер: ${bestTitle} (★ ${highestRated["оценка"]})`,
      attr: { title: "Открыть самую высоко оценённую заметку периода" }
    });
    bestBadge.onclick = () => {
      app.workspace.openLinkText(highestRated.file.path, "", false);
    };
  }

  // Гистограмма оценок 1..10
  const histoContainer = statsBar.createDiv({ cls: "lb-histogram" });
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
      renderDashboard();
    };
  });

  // Топ режиссёров / шоураннеров / студий за выбранный период
  const creatorCounter = new Map();
  yearScoped.forEach(item => {
    getItemCreators(item).forEach(cr => {
      creatorCounter.set(cr, (creatorCounter.get(cr) || 0) + 1);
    });
  });

  const topCreators = [...creatorCounter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 8);

  if (topCreators.length > 0) {
    const creatorsRow = statsContainer.createDiv({ cls: "lb-creators-row" });
    const labelText =
      state.activeCategory === "Фильм"
        ? "Режиссёры:"
        : state.activeCategory === "Сериал"
          ? "Шоураннеры и студии:"
          : "Разработчики и студии:";

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
        renderDashboard();
      };
    });
  }
}

// 4. Витрина коллекций (Списков) с мини-постерами
function renderListsShowcase(categoryItems) {
  listsShowcaseContainer.empty();
  const listMap = new Map();

  categoryItems.forEach(item => {
    flatArray(item["списки"]).forEach(listName => {
      if (!listMap.has(listName)) listMap.set(listName, []);
      listMap.get(listName).push(item);
    });
  });

  if (state.viewMode !== "lists") return;

  if (listMap.size === 0) {
    listsShowcaseContainer.createDiv({
      cls: "lb-empty-msg",
      text: "В этом разделе пока нет списков. Добавь название подборки в поле «Списки» при редактировании тайтла."
    });
    return;
  }

  const grid = listsShowcaseContainer.createDiv({ cls: "lb-lists-showcase" });
  [...listMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([listName, items]) => {
      const isAct = state.listFilter === listName;
      const card = grid.createDiv({
        cls: `lb-list-card ${isAct ? "is-active" : ""}`
      });
      const head = card.createDiv({ cls: "lb-list-card-head" });
      head.createSpan({ cls: "lb-list-card-title", text: `📑 ${listName}` });
      head.createSpan({ cls: "lb-list-card-count", text: `${items.length} шт.` });

      const thumbsRow = card.createDiv({ cls: "lb-list-thumbs" });
      items.slice(0, 4).forEach(it => {
        const src = resolvePosterSrc(it["постер"], it.file.path);
        if (src) {
          thumbsRow.createEl("img", { cls: "lb-list-thumb", attr: { src } });
        } else {
          thumbsRow.createDiv({
            cls: "lb-list-thumb",
            text: getSchemaForType(it["тип"]).icon,
            attr: { style: "display:flex;align-items:center;justify-content:center;font-size:1.1rem;" }
          });
        }
      });

      card.onclick = () => {
        state.listFilter = isAct ? "Все" : listName;
        state.page = 1;
        renderDashboard();
      };
    });
}

// 5. Панель фильтров (поиск, статус, режиссёр/студия, жанр, декада, платформа, сортировка)
function renderControls(categoryItems) {
  controlsContainer.empty();
  const bar = controlsContainer.createDiv({ cls: "lb-filters-bar" });
  const schema = getSchemaForType(state.activeCategory);

  const searchInput = bar.createEl("input", {
    cls: "lb-search-input",
    attr: {
      type: "search",
      placeholder: `Поиск по названию, ${schema.creatorLabel.toLowerCase()}, тегам…`,
      value: state.searchQuery
    }
  });
  searchInput.oninput = () => {
    state.searchQuery = searchInput.value;
    state.page = 1;
    renderContent(categoryItems);
  };

  const statusSelect = bar.createEl("select", { cls: "dropdown" });
  ["Все", ...schema.statuses].forEach(st => {
    const opt = statusSelect.createEl("option", { text: st === "Все" ? "Все статусы" : st, value: st });
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
  genreSelect.createEl("option", { text: "Все жанры", value: "Все" });
  [...genres].sort((a, b) => a.localeCompare(b, "ru")).forEach(g => {
    const opt = genreSelect.createEl("option", { text: g, value: g });
    if (state.genreFilter === g) opt.selected = true;
  });
  genreSelect.onchange = e => {
    state.genreFilter = e.target.value;
    state.page = 1;
    renderDashboard();
  };

  // Фильтр по декаде выхода (1990-е, 2000-е, 2010-е, 2020-е)
  const decades = new Set();
  categoryItems.forEach(i => {
    const dec = getItemDecade(i);
    if (dec) decades.add(dec);
  });
  if (decades.size > 0) {
    const decSelect = bar.createEl("select", { cls: "dropdown" });
    decSelect.createEl("option", { text: "Все декады", value: "Все" });
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
      platSelect.createEl("option", { text: "Все платформы", value: "Все" });
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
    renderContent(categoryItems);
  };
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
    if (state.listFilter !== "Все") {
      if (!flatArray(p["списки"]).includes(state.listFilter)) return false;
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

// 6. Отрисовка одной карточки постера (чистый постер + ПК hover / iPad touch sheet)
function renderPosterCard(parentGrid, item, index) {
  const schema = getSchemaForType(item["тип"]);
  const title = item["название"] || item.file.name;
  const creators = getItemCreators(item);
  const primaryCreator = creators[0] || "";
  const posterSrc = resolvePosterSrc(item["постер"], item.file.path);
  const rewatchCount = getRewatchCount(item);

  const card = parentGrid.createDiv({
    cls: "lb-card",
    attr: { style: `animation-delay: ${Math.min(index * 16, 240)}ms;` }
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

  // ПК-оверлей (показывается только при наведении мыши: 2 кнопки в углу + 1 главная внизу)
  const desktopOverlay = posterWrapper.createDiv({ cls: "lb-desktop-overlay" });
  const corners = desktopOverlay.createDiv({ cls: "lb-overlay-corners" });

  const favBtn = corners.createEl("button", {
    cls: `lb-corner-btn ${item["любимое"] ? "is-fav" : ""}`,
    text: "♥",
    attr: {
      type: "button",
      title: item["любимое"] ? "Убрать из любимого" : "Добавить в любимое",
      "aria-label": "Любимое"
    }
  });
  favBtn.onclick = async e => {
    e.stopPropagation();
    const nextFav = !item["любимое"];
    await updateMediaFrontmatter(item.file.path, fm => { fm["любимое"] = nextFav; });
    item["любимое"] = nextFav;
    renderDashboard();
  };

  const posterBtn = corners.createEl("button", {
    cls: "lb-corner-btn",
    text: "🖼",
    attr: {
      type: "button",
      title: "Сменить постер",
      "aria-label": "Сменить постер"
    }
  });
  posterBtn.onclick = e => {
    e.stopPropagation();
    new PosterPickerModal(app, item, () => renderDashboard()).open();
  };

  const mainEditBtn = desktopOverlay.createEl("button", {
    cls: "lb-primary-overlay-btn",
    text: "✎ Оценить / Изменить",
    attr: {
      type: "button",
      title: "Открыть окно оценки, отзыва и свойств",
      "aria-label": "Оценить или изменить"
    }
  });
  mainEditBtn.onclick = e => {
    e.stopPropagation();
    new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
  };

  // Кнопка «⋯» (44x44px) для iPad и сенсорных экранов
  const touchMoreBtn = posterWrapper.createEl("button", {
    cls: "lb-touch-more-btn",
    text: "⋯",
    attr: {
      type: "button",
      title: "Действия с тайтлом",
      "aria-label": "Действия с тайтлом"
    }
  });
  touchMoreBtn.onclick = e => {
    e.stopPropagation();
    new PosterActionSheetModal(app, item, () => renderDashboard()).open();
  };

  // Поведение клика/тапа по самому постеру: на iPad открывает нижнюю панель действий, на ПК — заметку
  posterWrapper.onclick = e => {
    if (e.target.closest("button")) return;
    if (isTouchDevice()) {
      new PosterActionSheetModal(app, item, () => renderDashboard()).open();
    } else {
      app.workspace.openLinkText(item.file.path, "", e.ctrlKey || e.metaKey);
    }
  };

  // Чистая подпись под постером (Название, Год, Звёзды, бейджи)
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
  const starsText = formatStars(item["оценка"]);

  if (starsText) {
    capMeta.createSpan({ cls: "lb-stars", text: starsText });
  } else if (item["год"]) {
    capMeta.createSpan({ cls: "lb-caption-year", text: String(item["год"]) });
  } else {
    capMeta.createSpan({ cls: "lb-caption-year", text: item["статус"] || "" });
  }

  const badges = capMeta.createDiv({ cls: "lb-caption-badges" });
  if (starsText && item["год"]) {
    badges.createSpan({ text: String(item["год"]) });
  }
  if (item["любимое"]) {
    badges.createSpan({ text: "♥", attr: { style: "color: var(--lb-heart);" } });
  }
  if (rewatchCount > 0) {
    badges.createSpan({
      text: rewatchCount > 1 ? `🔄×${rewatchCount}` : "🔄",
      attr: { title: `${schema.rewatchLabel}: ${rewatchCount}` }
    });
  }
  if (item["отзыв"]) {
    badges.createSpan({ text: "📝", attr: { title: String(item["отзыв"]) } });
  }

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
}

// 7. Хронологический Дневник (Diary View)
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
      if (rewatchCount > 0) ratingCol.createSpan({ text: rewatchCount > 1 ? `🔄×${rewatchCount}` : "🔄", attr: { style: "font-size: 0.75rem;" } });

      const editBtn = row.createEl("button", {
        cls: "lb-sub-btn",
        text: "⋯",
        attr: { type: "button", title: "Действия с записью", style: "width:40px !important;justify-content:center !important;" }
      });
      editBtn.onclick = () => {
        if (isTouchDevice()) {
          new PosterActionSheetModal(app, item, () => renderDashboard()).open();
        } else {
          new MediaLogModal(app, item["тип"], item, () => renderDashboard()).open();
        }
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
      text: "В этом разделе по выбранным фильтрам ничего не найдено. Сбрось фильтр или нажми «＋ Залогировать»."
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
  renderStats(categoryItems);
  renderListsShowcase(categoryItems);
  renderControls(categoryItems);
  renderContent(categoryItems);
}

renderDashboard();
