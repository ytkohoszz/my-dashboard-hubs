// ========================================================
// ОБЩИЕ ДАННЫЕ, АВТОСИНХРОНИЗАЦИЯ И УТИЛИТЫ (ГЛАВНАЯ v2.5: автообновление при старте и изменении файлов)
// ========================================================
const AUTO_SLEEP_MIN_HOURS = 6;   // Сон > 6 часов автоматически отмечает «Режим сна»
const DIET_TOLERANCE_RATIO = 0.95; // Мягкий допуск для автопроставления «Диета» (95% от цели)
const STUDY_DEADLINE_HORIZON_DAYS = 21;
const MANUAL_HABITS_PREFIX = "dh_today_manual_habits_v1:";
const MIN_VALID_DATE_ISO = "2000-01-01";

const hostContainer = dv.container;
let refreshDebounceTimer = null;
let bootPollTimer = null;

function isIndexReady() {
  const dvApi = app.plugins?.plugins?.dataview?.api;
  if (dvApi && dvApi.index && dvApi.index.initialized === false) return false;
  try {
    return dv.pages().length > 0 || app.vault.getMarkdownFiles().length === 0;
  } catch {
    return false;
  }
}

function scheduleHomeRender(delay = 180) {
  if (!hostContainer || !hostContainer.isConnected) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    if (!hostContainer.isConnected) return;
    renderHomeDashboard();
  }, delay);
}

function renderHomeDashboard() {
  if (!hostContainer || !hostContainer.isConnected) return;

  // Запоминаем позицию прокрутки контейнера вкладки, чтобы экран не дёргался при автообновлении
  const scroller = hostContainer.closest(".cm-scroller, .markdown-preview-view, .view-content");
  const prevScrollTop = scroller ? scroller.scrollTop : 0;

  hostContainer.replaceChildren();

const empty = v => v == null || v === "";
function asDate(v) {
  if (empty(v)) return null;
  try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
}
const mtime = p => { try { return p.file.mtime?.toMillis?.() ?? 0; } catch { return 0; } };
const notify = message => { try { new Notice(message); } catch { console.log(message); } };

function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s) ? Number(s) : null;
}

function getNutritionPlugin() {
  return app.plugins?.plugins?.["my-nutrition-tracker"] ?? null;
}

function getWorkoutPlugin() {
  return app.plugins?.plugins?.["my-workout-companion"] ?? null;
}

function getFocusPlugin() {
  return app.plugins?.plugins?.["my-focus-tracker"] || window.__myFocusTracker || null;
}

function getValuesCompassPlugin() {
  return app.plugins?.plugins?.["my-values-compass"] ?? null;
}

function openValuesCompassFromHome(tab = "map", domainId) {
  const plugin = getValuesCompassPlugin();
  if (!plugin || typeof plugin.activateView !== "function") {
    notify("Включи плагин «Values Compass» (my-values-compass) в настройках Obsidian.");
    return;
  }
  try {
    plugin.activateView(tab, domainId);
  } catch (err) {
    notify("Не удалось открыть Компас ценностей: " + (err instanceof Error ? err.message : String(err)));
  }
}

function openFocusTrackerFromHome(initialProject) {
  const plugin = getFocusPlugin();
  if (!plugin || typeof plugin.openFocusModal !== "function") {
    notify("Включи плагин «Фокус-таймер» (my-focus-tracker) в настройках Obsidian.");
    return;
  }
  try {
    plugin.openFocusModal(initialProject ? { initialProject } : {});
  } catch (err) {
    notify("Не удалось открыть таймер фокуса: " + (err instanceof Error ? err.message : String(err)));
  }
}

const corrPlugin = app.plugins?.plugins?.["my-correlation-analytics"] ?? null;
const SOCIAL_LIMIT_MIN =
  typeof corrPlugin?.settings?.socialLimitMin === "number" &&
  Number.isFinite(corrPlugin.settings.socialLimitMin) &&
  corrPlugin.settings.socialLimitMin >= 0
    ? corrPlugin.settings.socialLimitMin
    : 30;

const nutPlugin = getNutritionPlugin();
const rawCalorieGoal = nutPlugin?.settings ? nutPlugin.settings.dailyCalorieGoal : null;
const calorieGoal = typeof rawCalorieGoal === "number" && rawCalorieGoal > 0 ? Math.round(rawCalorieGoal) : null;
const rawDietRatio = nutPlugin?.settings?.dietToleranceRatio;
const dietRatio = typeof rawDietRatio === "number" && rawDietRatio > 0 && rawDietRatio <= 1 ? rawDietRatio : DIET_TOLERANCE_RATIO;
const dietCalorieThreshold = calorieGoal !== null ? Math.round(calorieGoal * dietRatio) : null;

function openStudyProjectFromHome(filePath, newLeaf = false) {
  const compiler = app.plugins?.plugins?.["my-study-compiler"] ?? null;
  if (compiler && typeof compiler.openCompiler === "function") {
    try {
      compiler.openCompiler({ rootPath: filePath });
      return;
    } catch (err) {
      console.log("[Home] openCompiler fallback:", err);
    }
  }
  app.workspace.openLinkText(filePath, dv.currentFilePath, newLeaf);
}

const today = dv.date("today").startOf("day");
const todayISO = today.toISODate();
const yesterdayISO = today.minus({ days: 1 }).toISODate();

const todayNote = dv.pages('"Ежедневник"').array()
  .filter(p => {
    const d = asDate(p.дата) || asDate(p.file.name);
    if (!d) return false;
    const iso = d.toISODate();
    return iso >= MIN_VALID_DATE_ISO && iso === todayISO;
  })
  .sort((a, b) => mtime(b) - mtime(a) || a.file.path.localeCompare(b.file.path, "ru"))[0] || null;

const knowledgePages = dv.pages('"Знания"').array();
const trainingsTodayList = knowledgePages.filter(
  p => p.тип === "Тренировка" && asDate(p.дата)?.toISODate() === todayISO
);

// --- Чтение/запись ручных переопределений привычек за дату ---
function getManualHabitOverrides(dateISO = todayISO) {
  try {
    const raw = window.localStorage?.getItem(MANUAL_HABITS_PREFIX + dateISO);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function setManualHabitOverride(key, val, dateISO = todayISO) {
  try {
    const cur = getManualHabitOverrides(dateISO);
    if (val === undefined) delete cur[key];
    else cur[key] = val;
    window.localStorage?.setItem(MANUAL_HABITS_PREFIX + dateISO, JSON.stringify(cur));
  } catch {}
}

// ========================================================
// 1. НАВИГАЦИОННЫЕ ПЛИТКИ (ХАБЫ СИСТЕМЫ)
// ========================================================
{
  const isTemplate = p => p.file.name.startsWith("Учёба — ") || p.file.path.startsWith("Шаблоны/");
  const allPages = dv.pages().array();

  const studyActive = allPages.filter(p =>
    !isTemplate(p) &&
    String(p.направление ?? "").trim() === "Учёба" &&
    ["Проект", "Лабораторная работа"].includes(String(p.тип ?? "").trim()) &&
    !["завершён", "завершена", "сдана", "сдан", "готово", "архив", "отменён", "отменена"].includes(String(p.статус ?? "").trim().toLowerCase())
  ).length;

  const trainingsToday = trainingsTodayList.length;

const notes3D = allPages.filter(p =>
    !isTemplate(p) &&
    String(p.направление ?? "").trim() === "3D" &&
    p.file.name !== "🧊3D"
  ).length;

const cardsDoneToday = parseNum(todayNote?.карточек_пройдено) || 0;
  const grammarDoneToday = parseNum(todayNote?.грамматика_упражнений) || 0;
  const pagesDoneToday = parseNum(todayNote?.страниц_прочитано) || 0;
  const englishParts = [];
  if (cardsDoneToday > 0) englishParts.push(`${cardsDoneToday} карт.`);
  if (grammarDoneToday > 0) englishParts.push(`${grammarDoneToday} грам.`);
  if (pagesDoneToday > 0) englishParts.push(`${pagesDoneToday} стр.`);
  const englishBadge = englishParts.join(" · ");

  const HUBS = [
    {
      title: "Дневник",
      file: "📓Дневник",
      icon: "📓",
      color: "var(--color-purple, #9c83e8)",
      badge: todayNote?.оценка_дня ? `${todayNote.оценка_дня}/10` : ""
    },
    {
      title: "Учёба",
      file: "🎓Учёба",
      icon: "🎓",
      color: "var(--color-orange, #e5a158)",
      badge: studyActive > 0 ? String(studyActive) : ""
    },
    {
      title: "Здоровье",
      file: "💪Здоровье",
      icon: "💪",
      color: "var(--color-yellow, #d69852)",
      badge: trainingsToday > 0 || todayNote?.тренировка === true ? "✓" : ""
    },
    {
      title: "Английский",
      file: "🌎Английский и книги",
      icon: "🌎",
      color: "var(--color-green, #4aab80)",
      badge: englishBadge
    },
    {
      title: "3D",
      file: "🧊3D",
      icon: "🧊",
      color: "var(--color-blue, #599ed6)",
      badge: notes3D > 0 ? String(notes3D) : ""
    }
  ];

  const root = dv.container.createDiv({ cls: "dh dh-hub-nav" });
  const grid = root.createDiv({ cls: "dh-hub-grid" });

  HUBS.forEach(hub => {
    const card = grid.createDiv({ cls: "dh-card dh-hub-card" });
    card.style.setProperty("--hub-color", hub.color);

    card.onclick = (e) => {
      if (typeof hub.onClick === "function") {
        hub.onClick(e);
        return;
      }
      app.workspace.openLinkText(hub.file, dv.currentFilePath, e.ctrlKey || e.metaKey);
    };

    card.createDiv({ cls: "dh-hub-icon", text: hub.icon });
    card.createDiv({ cls: "dh-hub-title", text: hub.title });

    if (hub.badge) {
      card.createSpan({ cls: "dh-hub-badge", text: hub.badge });
    }
  });
}

// ========================================================
// 2. БЛОК «СЕГОДНЯ»: СОСТОЯНИЕ, ПОКАЗАТЕЛИ, ПЛАН И ИТОГИ ДНЯ
// ========================================================
{
  const HABITS = [
    { key: "nofap", name: "NoFap", color: "#9c83e8" },
    { key: "тренировка", name: "Тренировка", color: "#d69852" },
    { key: "чтение", name: "Чтение", color: "#599ed6" },
    { key: "режим_сна", name: "Режим сна", color: "#69b5aa" },
    { key: "диета", name: "Диета", color: "#8bac5e" },
    { key: "без_соцсетей", name: "Без соцсетей", color: "#e06c75" },
  ];

  const COLORS = [
    "#d85b57", "#d97354", "#d98c54", "#d9a554", "#c5ad55",
    "#a6b25a", "#8cb666", "#73b473", "#5ab17f", "#4aab80"
  ];

  function computeSleepDurationHours(sleepTimeStr, wakeTimeStr) {
    if (!sleepTimeStr || !wakeTimeStr) return null;
    const sMatch = String(sleepTimeStr).trim().match(/^(\d{1,2})[:.](\d{2})$/);
    const wMatch = String(wakeTimeStr).trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!sMatch || !wMatch) return null;
    const sh = Number(sMatch[1]), sm = Number(sMatch[2]);
    const wh = Number(wMatch[1]), wm = Number(wMatch[2]);
    if (sh < 0 || sh > 23 || sm < 0 || sm > 59 || wh < 0 || wh > 23 || wm < 0 || wm > 59) return null;
    let diff = (wh * 60 + wm) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  }

  function normalizeTimeString(v) {
    if (!v) return "";
    const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return "";
    const h = Number(m[1]), min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return "";
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

let selectedISO =
    typeof window.__dhHomeSelectedDateISO === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(window.__dhHomeSelectedDateISO) &&
    window.__dhHomeSelectedDateISO >= MIN_VALID_DATE_ISO &&
    window.__dhHomeSelectedDateISO <= todayISO
      ? window.__dhHomeSelectedDateISO
      : todayISO;
  window.__dhHomeSelectedDateISO = selectedISO;

  const selectedDate = dv.date(selectedISO).startOf("day");
  const isToday = selectedISO === todayISO;
  const isYesterday = selectedISO === yesterdayISO;

  const setSelectedDateISO = (nextISO) => {
    if (!nextISO || !/^\d{4}-\d{2}-\d{2}$/.test(nextISO)) return;
    const clamped = nextISO > todayISO ? todayISO : nextISO < MIN_VALID_DATE_ISO ? MIN_VALID_DATE_ISO : nextISO;
    if (clamped === window.__dhHomeSelectedDateISO) return;
    window.__dhHomeSelectedDateISO = clamped;
    renderHomeDashboard();
  };

  const INPUT_METRICS = [
    { label: "Вес", key: "вес_кг", unit: "кг", min: 20, max: 300, digits: 1, placeholder: "—" },
    { label: "Сон", key: "сон_часов", unit: "ч", min: 0, max: 24, digits: 1, placeholder: "—" },
    { label: "Чтение", key: "страниц_прочитано", unit: "стр.", min: 0, max: 1500, digits: 0, placeholder: "—" },
    { label: "Соцсети", key: "соцсети_мин", unit: "мин", min: 0, max: 1440, digits: 0, placeholder: "—" },
    { label: "Шаги", key: "шаги", unit: "шаг", min: 0, max: 100000, digits: 0, placeholder: "—" },
  ];

  function formatNumForInput(v, digits = 1) {
    const n = parseNum(v);
    if (n === null) return "";
    const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
    return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
  }

  function openNutritionFromHome() {
    const plugin = getNutritionPlugin();
    if (!plugin || typeof plugin.openNutrition !== "function") {
      notify("Включи плагин «Питание и БЖУ» (my-nutrition-tracker) в настройках Obsidian.");
      return;
    }
    try {
      plugin.openNutrition({ dateISO: selectedISO });
    } catch (err) {
      notify("Не удалось открыть дневник питания: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function createDiaryNoteForDate(targetISO) {
    const MONTHS_RU = [
      "январь", "февраль", "март", "апрель", "май", "июнь",
      "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
    ];
    const baseFolder = "Ежедневник";
    const prefix = `${baseFolder}/`;
    const usesNested = app.vault
      .getMarkdownFiles()
      .some(f => f.path.startsWith(prefix) && /\/\d{4}\/\d{2}\s*-\s*[^/]+\/\d{4}-\d{2}-\d{2}\.md$/i.test(f.path));

    let targetFolder = baseFolder;
    const [yyyy, mm] = targetISO.split("-");
    const mIdx = Number(mm) - 1;
    if (usesNested && yyyy && mm && mIdx >= 0 && mIdx < MONTHS_RU.length) {
      targetFolder = `${baseFolder}/${yyyy}/${mm} - ${MONTHS_RU[mIdx]}`;
    }

    let acc = "";
    for (const part of targetFolder.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(acc)) {
        try { await app.vault.createFolder(acc); } catch {}
      }
    }

    const targetPath = `${targetFolder}/${targetISO}.md`;
    const existing = app.vault.getAbstractFileByPath(targetPath);
    if (existing) return existing;

    const content = `---\nдата: "${targetISO}"\n---\n\n`;
    return await app.vault.create(targetPath, content);
  }

  if (!window.__dhTodayDrafts || window.__dhTodayDrafts.dateISO !== selectedISO) {
    window.__dhTodayDrafts = {
      dateISO: selectedISO,
      inputs: {},
      errors: {},
      savedStamp: {},
      activeKey: null,
      selectionStart: null,
      selectionEnd: null
    };
  }
  const uiDrafts = window.__dhTodayDrafts;

  if (!window.__dhTodaySaveQueue) {
    window.__dhTodaySaveQueue = Promise.resolve();
  }
  function enqueueFrontMatterSave(file, mutator) {
    if (!file) return Promise.reject(new Error("Файл ежедневной заметки не найден"));
    const nextTask = window.__dhTodaySaveQueue
      .catch(() => {})
      .then(() => app.fileManager.processFrontMatter(file, mutator));
    window.__dhTodaySaveQueue = nextTask;
    return nextTask;
  }

  const note = isToday
    ? todayNote
    : dv.pages('"Ежедневник"').array()
        .filter(p => {
          const d = asDate(p.дата) || asDate(p.file.name);
          if (!d) return false;
          const iso = d.toISODate();
          return iso >= MIN_VALID_DATE_ISO && iso === selectedISO;
        })
        .sort((a, b) => mtime(b) - mtime(a) || a.file.path.localeCompare(b.file.path, "ru"))[0] || null;

  const trainings = isToday
    ? trainingsTodayList
    : knowledgePages.filter(p => p.тип === "Тренировка" && asDate(p.дата)?.toISODate() === selectedISO);

  const root = dv.container.createDiv({ cls: "dh dh-today" });

  const styleEl = root.createEl("style");
  styleEl.textContent = `
  /* === Velocity-native Home Dashboard === */
  .dashboard-home .dh-hub-nav {
    margin: 4px 0 24px 0 !important;
  }
  .dashboard-home .dh-hub-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
    gap: 10px;
  }
  .dashboard-home .dh-hub-card {
    position: relative;
    contain: content;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    min-height: 50px;
    padding: 9px 12px !important;
    background: var(--trans-faint-05, var(--background-secondary)) !important;
    border: none !important;
    border-radius: var(--radius-ml, 14px) !important;
    box-shadow:
      var(--glass-base-m, none),
      0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)) !important;
    cursor: pointer;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-hub-card:hover {
    transform: translateY(-1px);
    background: color-mix(in oklab, var(--hub-color) 10%, var(--background-primary)) !important;
    box-shadow:
      var(--glass-base, none),
      0 0 0 1px color-mix(in oklab, var(--hub-color) 40%, transparent),
      var(--shadow-muted, 0 4px 16px rgba(0, 0, 0, 0.14)) !important;
  }
  .dashboard-home .dh-hub-card:active {
    transform: scale(0.98);
    filter: opacity(85%);
  }
  .dashboard-home .dh-hub-icon {
    font-size: 1.08rem;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 10px);
    background: color-mix(in oklab, var(--hub-color) 16%, transparent);
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-hub-title {
    font-size: var(--font-ui-medium, 14.5px);
    font-weight: var(--font-semibold, 600);
    font-variation-settings: "opsz" 24;
    letter-spacing: -0.005em;
    color: var(--color-base-100, var(--text-normal));
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dh-hub-badge {
    margin-left: auto;
    flex-shrink: 0;
    font-size: var(--font-ui-smaller, 12px);
    font-weight: var(--font-semi-medium, 500);
    font-variant-numeric: tabular-nums;
    padding: 3px 8px;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    background: color-mix(in oklab, var(--hub-color) 15%, transparent);
    color: var(--hub-color);
    white-space: nowrap;
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }

  /* === Блок «Сегодня» === */
  .dashboard-home .dh-today {
    background: var(--trans-faint-05, var(--background-secondary)) !important;
    border: none !important;
    border-radius: calc(var(--radius-ml, 14px) + 2px) !important;
    box-shadow:
      var(--glass-base-m, none),
      0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
      var(--shadow-setting-items, 0 4px 12px rgba(0, 0, 0, 0.1)) !important;
    padding: calc(var(--vl-layout-padding, 8px) * 2) calc(var(--vl-layout-padding, 8px) * 2 + 2px);
    margin: 0 0 22px 0 !important;
    box-sizing: border-box;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-today-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-today-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dashboard-home .dh-today .dh-kicker {
    font-size: 0.7rem;
    font-weight: var(--font-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.075em;
    color: var(--icon-color, var(--text-muted));
  }
  .dashboard-home .dh-today-date-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dashboard-home .dh-date-nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .dashboard-home button.dh-date-nav-btn {
    width: 30px;
    height: 30px;
    min-width: 30px;
    padding: 0;
    border: none;
    border-radius: var(--radius-xxl, 22px);
    font-size: 1.05rem;
    line-height: 1;
    background: transparent;
    color: var(--control-icon-color, var(--icon-color));
    cursor: pointer;
    box-shadow: none;
    contain: content;
    transition:
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home button.dh-date-nav-btn:hover:not(:disabled) {
    background: var(--control-icon-background, var(--background-modifier-hover));
    box-shadow: var(--control-icon-shadow, none);
    color: var(--text-normal);
  }
  .dashboard-home button.dh-date-nav-btn:disabled {
    filter: opacity(0.3125);
    cursor: default;
  }
  .dashboard-home .dh-date-picker-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: var(--radius-s, 8px);
    cursor: pointer;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-date-picker-wrap:hover {
    background: var(--background-modifier-hover);
  }
  .dashboard-home input.dh-date-picker-native {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: none;
    box-shadow: none !important;
    margin: 0;
    padding: 0;
  }
  .dashboard-home button.dh-date-today-btn {
    height: 26px;
    padding: 0 11px;
    border: none;
    border-radius: var(--radius-xl, 20px);
    font-size: 0.74rem;
    font-weight: var(--font-semi-medium, 500);
    background: var(--color-accent-4, var(--background-modifier-active-hover));
    color: var(--color-accent-1, var(--text-accent));
    cursor: pointer;
    box-shadow: none;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home button.dh-date-today-btn:hover {
    background: var(--text-selection, var(--background-modifier-active-hover));
  }
  .dashboard-home .dh-today .dh-today-date {
    font-size: 1.18rem;
    font-weight: var(--font-semibold, 600);
    font-variation-settings: "opsz" 26;
    letter-spacing: -0.01em;
    color: var(--color-base-100, var(--text-normal));
    line-height: 1.2;
  }
  .dashboard-home .dh-today .dh-actions button.dh-btn {
    border: none;
    border-radius: var(--input-radius, var(--radius-s, 8px));
    min-height: var(--input-height, 28px);
    padding: 0 12px;
    font-weight: var(--font-semi-medium, 500);
    background: var(--interactive-normal);
    color: var(--text-normal);
    box-shadow: none;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-today .dh-actions button.dh-btn:hover {
    background: var(--interactive-hover);
  }
  .dashboard-home .dh-today .dh-actions button.dh-btn.mod-cta {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    box-shadow: var(--shadow-button, none);
  }
  .dashboard-home .dh-today-badges {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dashboard-home .dh-today-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 14px;
  }
  .dashboard-home .dh-today-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .dashboard-home .dh-ratings-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dashboard-home button.dh-rating-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-xl, 20px);
    font-size: var(--font-ui-small, 13px);
    font-weight: var(--font-semi-medium, 500);
    background: var(--background-primary);
    color: var(--text-muted);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border)));
    cursor: pointer;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home button.dh-rating-pill:hover {
    color: var(--text-normal);
    box-shadow: 0 0 0 1px var(--trans-faint-40, var(--background-modifier-border));
  }
  .dashboard-home button.dh-rating-pill.is-open {
    color: var(--text-normal);
    box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent));
  }
  .dashboard-home .dh-rating-pill-val {
    font-weight: var(--font-bold, 700);
    font-variant-numeric: tabular-nums;
    color: var(--pill-color, var(--text-normal));
  }
  .dashboard-home .dh-rating-drawer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    border: none;
    border-radius: var(--radius-m, 12px);
    background: var(--background-primary);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-today-row {
    display: grid;
    grid-template-columns: 112px 1fr;
    align-items: center;
    gap: 12px;
  }
  .dashboard-home .dh-today-row-label {
    font-size: var(--font-ui-small, 13px);
    font-weight: var(--font-semi-medium, 500);
    color: var(--icon-color, var(--text-muted));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .dashboard-home .dh-today-row-sub {
    font-size: 0.74rem;
    font-weight: var(--font-medium, 525);
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .dashboard-home .dh-today-chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dashboard-home .dh-today .dh-score {
    min-width: 30px;
    height: 28px;
    padding: 0 6px;
    border: none;
    border-radius: var(--radius-s, 8px);
    font-size: 0.8rem;
    font-weight: var(--font-semi-medium, 500);
    font-variant-numeric: tabular-nums;
    background: var(--trans-faint-10, var(--background-modifier-hover));
    box-shadow: none;
    color: var(--text-muted);
    cursor: pointer;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-today .dh-score:hover:not(:disabled) {
    background: color-mix(in oklab, var(--chip-color, var(--interactive-accent)) 22%, var(--background-primary));
    color: var(--text-normal);
  }
  .dashboard-home .dh-today .dh-score.is-active {
    background: var(--chip-color, var(--interactive-accent));
    box-shadow: var(--glass-base, none);
    color: #141619;
    font-weight: var(--font-bold, 700);
  }
  .dashboard-home .dh-today .dh-habit-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 29px;
    padding: 0 11px;
    border: none !important;
    outline: none !important;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    font-size: 0.8rem;
    font-weight: var(--font-semi-medium, 500);
    background: var(--background-primary) !important;
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border))) !important;
    color: var(--text-muted);
    cursor: pointer;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-today .dh-habit-chip.is-unknown {
    background: var(--trans-faint-05, transparent) !important;
    border: none !important;
    outline: none !important;
    box-shadow: inset 0 0 0 1px var(--trans-faint-20, var(--background-modifier-border)) !important;
    color: var(--text-faint);
    opacity: 0.8;
  }
  .dashboard-home .dh-today .dh-habit-chip:hover:not(:disabled) {
    opacity: 1;
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--chip-color, var(--interactive-accent)) 55%, transparent) !important;
    color: var(--text-normal);
  }
  .dashboard-home .dh-today .dh-habit-chip .dh-habit-check {
    font-size: 0.74rem;
    line-height: 1;
    opacity: 0.6;
  }
  .dashboard-home .dh-today .dh-habit-chip.is-active {
    opacity: 1;
    background: color-mix(in oklab, var(--chip-color) 18%, var(--background-primary)) !important;
    box-shadow:
      var(--glass-base, none),
      0 0 0 1px color-mix(in oklab, var(--chip-color) 55%, transparent) !important;
    color: var(--color-base-100, var(--text-normal));
    font-weight: var(--font-medium, 525);
  }
  .dashboard-home .dh-today .dh-habit-chip.is-active .dh-habit-check {
    color: var(--chip-color);
    opacity: 1;
    font-weight: var(--font-bold, 700);
  }

  /* === Сетка метрик === */
  .dashboard-home .dh-metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-metric-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: none;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-metric-item.is-clickable {
    cursor: pointer;
    user-select: none;
  }
  .dashboard-home .dh-metric-item.is-clickable:hover {
    box-shadow: 0 0 0 1px var(--color-accent-3, var(--interactive-accent));
  }
  .dashboard-home .dh-metric-item.is-running {
    background: color-mix(in oklab, var(--color-purple, #9c83e8) 12%, var(--background-primary));
    box-shadow: 0 0 0 1.5px color-mix(in oklab, var(--color-purple, #9c83e8) 60%, transparent);
  }
  .dashboard-home .dh-metric-item:focus-within {
    box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent));
  }
  .dashboard-home .dh-metric-item.is-invalid {
    box-shadow: 0 0 0 2px var(--color-red, #d85b57);
  }
  .dashboard-home .dh-metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .dashboard-home .dh-metric-label {
    font-size: 0.75rem;
    font-weight: var(--font-semi-medium, 500);
    color: var(--icon-color, var(--text-muted));
  }
  .dashboard-home .dh-metric-status {
    font-size: 0.7rem;
    font-weight: var(--font-medium, 525);
    color: var(--color-green, #4aab80);
    min-height: 1em;
  }
  .dashboard-home .dh-metric-control {
    display: flex;
    align-items: baseline;
    gap: 2px;
    min-height: 26px;
  }
  .dashboard-home .dh-metric-readonly-val {
    font-size: 1rem;
    font-weight: var(--font-semibold, 600);
    font-variant-numeric: tabular-nums;
    color: var(--color-base-100, var(--text-normal));
    line-height: 1.35;
    margin-right: 2px;
  }
  .dashboard-home .dh-metric-sizer {
    position: relative;
    display: inline-block;
    vertical-align: baseline;
    margin-left: -3px;
    padding: 1px 3px;
    max-width: calc(100% - 34px);
    font-size: 1rem;
    font-weight: var(--font-semibold, 600);
    font-variant-numeric: tabular-nums;
    line-height: 1.35;
  }
  .dashboard-home .dh-metric-sizer::after {
    content: attr(data-val);
    visibility: hidden;
    white-space: pre;
    font: inherit;
    font-variant-numeric: inherit;
    line-height: inherit;
    pointer-events: none;
  }
  .dashboard-home .dh-metric-sizer > .dh-metric-input {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 1px 3px !important;
    box-sizing: border-box !important;
    font: inherit !important;
    font-variant-numeric: inherit !important;
    line-height: inherit !important;
    text-align: left;
    border-radius: var(--radius-xs, 6px) !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--color-base-100, var(--text-normal)) !important;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-metric-input:hover {
    background: var(--trans-faint-10, var(--background-modifier-hover)) !important;
  }
  .dashboard-home .dh-metric-input:focus {
    outline: none !important;
    background: var(--trans-faint-20, var(--background-modifier-hover)) !important;
    box-shadow: none !important;
  }
  .dashboard-home .dh-sleep-card {
    grid-row: span 2;
    justify-content: space-between;
    gap: 8px;
  }
  .dashboard-home .dh-sleep-top-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dashboard-home .dh-sleep-divider {
    width: 100%;
    height: 1px;
    background: var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-sleep-sched {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dashboard-home .dh-sleep-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 26px;
  }
  .dashboard-home .dh-sleep-sep {
    font-size: 0.74rem;
    color: var(--text-faint);
    line-height: 1;
    user-select: none;
  }
  .dashboard-home .dh-time-input {
    width: 100% !important;
    min-width: 0 !important;
    height: 26px !important;
    margin: 0 !important;
    padding: 0 4px !important;
    border: none !important;
    border-radius: var(--radius-xs, 6px) !important;
    text-align: center !important;
    font-size: 0.88rem !important;
    font-weight: var(--font-semibold, 600);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--color-base-100, var(--text-normal)) !important;
    background: var(--trans-faint-05, var(--background-modifier-hover)) !important;
    box-shadow: inset 0 0 0 0.5px var(--trans-faint-15, transparent) !important;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-time-input:hover {
    background: var(--trans-faint-10, var(--background-modifier-hover)) !important;
  }
  .dashboard-home .dh-time-input:focus {
    outline: none !important;
    background: var(--trans-faint-20, var(--background-modifier-hover)) !important;
    box-shadow: none !important;
  }
  .dashboard-home .dh-metric-unit {
    font-size: 0.78rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .dashboard-home .dh-metric-subhint {
    font-size: 0.68rem;
    color: var(--text-faint);
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dh-metric-error {
    font-size: 0.7rem;
    color: var(--color-red, #d85b57);
    line-height: 1.25;
  }

  /* === План дня и Главное событие === */
  .dashboard-home .dh-today-bottom-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-plan-box {
    padding: 12px 14px;
    border: none;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    display: flex;
    flex-direction: column;
    gap: 8px;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-plan-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dashboard-home .dh-plan-title {
    font-size: 0.8rem;
    font-weight: var(--font-semi-medium, 500);
    color: var(--icon-color, var(--text-muted));
  }
  .dashboard-home .dh-plan-bar-track {
    height: 5px;
    border-radius: var(--radius-l, 18px);
    background: var(--trans-faint-20, var(--background-modifier-border));
    overflow: hidden;
  }
  .dashboard-home .dh-plan-bar-fill {
    height: 100%;
    border-radius: var(--radius-l, 18px);
    transition: width var(--anim-duration-moderate, 200ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-plan-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 6px;
  }
  .dashboard-home .dh-plan-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    border-radius: var(--radius-s, 8px);
    background: var(--trans-faint-05, var(--background-secondary));
    box-shadow: inset 0 0 0 0.5px var(--trans-faint-10, transparent);
    font-size: 0.82rem;
    cursor: pointer;
    user-select: none;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-plan-item:hover {
    background: var(--trans-faint-10, var(--background-modifier-hover));
  }
  .dashboard-home .dh-plan-item.is-done {
    background: color-mix(in oklab, var(--color-green, #4aab80) 8%, transparent);
  }
  .dashboard-home .dh-plan-item-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .dashboard-home .dh-plan-item-right {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .dashboard-home .dh-plan-focus-btn {
    height: 22px !important;
    min-height: 22px !important;
    padding: 0 8px !important;
    border: none !important;
    border-radius: var(--radius-l, 18px) !important;
    font-size: 0.68rem !important;
    font-weight: var(--font-semi-medium, 500) !important;
    font-variant-numeric: tabular-nums;
    background: color-mix(in oklab, var(--color-purple, #9c83e8) 16%, transparent) !important;
    color: var(--color-purple, #9c83e8) !important;
    cursor: pointer;
    box-shadow: none !important;
    transition:
      opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  body:not(.is-mobile) .dashboard-home .dh-plan-focus-btn.is-empty {
    opacity: 0;
  }
  body:not(.is-mobile) .dashboard-home .dh-plan-item:hover .dh-plan-focus-btn.is-empty,
  body:not(.is-mobile) .dashboard-home .dh-plan-item:focus-within .dh-plan-focus-btn.is-empty {
    opacity: 1;
  }
  .dashboard-home .dh-plan-focus-btn:hover {
    background: color-mix(in oklab, var(--color-purple, #9c83e8) 26%, transparent) !important;
  }
  .dashboard-home .dh-plan-check {
    width: 17px;
    height: 17px;
    border-radius: var(--checkbox-radius, 50%);
    border: none;
    box-shadow: inset 0 0 0 1.5px var(--checkbox-border-color, var(--text-faint));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    flex-shrink: 0;
    color: transparent;
    background: transparent;
    transition:
      background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-plan-item.is-done .dh-plan-check {
    background: var(--color-green, #4aab80);
    box-shadow: none;
    color: var(--text-on-accent, #fff);
    font-weight: var(--font-bold, 700);
  }
  .dashboard-home .dh-plan-text {
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dh-plan-item.is-done .dh-plan-text {
    color: var(--checklist-done-color, var(--text-faint));
    text-decoration: line-through;
  }
  .dashboard-home .dh-plan-pct {
    font-size: 0.72rem;
    font-weight: var(--font-medium, 525);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .dashboard-home .dh-event-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 12px;
  }
  .dashboard-home .dh-event-row .dh-today-row-label {
    white-space: nowrap;
  }
  .dashboard-home .dh-event-control {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .dashboard-home .dh-event-input {
    flex: 1;
    width: 100% !important;
    height: 32px !important;
    padding: 4px 12px !important;
    font-size: 0.84rem !important;
    border-radius: var(--input-radius, var(--radius-s, 8px)) !important;
    border: none !important;
    background: var(--background-primary) !important;
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border))) !important;
    color: var(--text-normal) !important;
    transition: box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-event-input:focus {
    outline: none !important;
    box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent)) !important;
  }
  .dashboard-home .dh-today-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .dashboard-home .dh-footer-trainings {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dashboard-home .dh-training-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border: none;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    font-size: 0.76rem;
    font-weight: var(--font-semi-medium, 500);
    background: var(--pill-background, var(--code-background));
    color: var(--color-accent-1, var(--text-accent));
    text-decoration: none;
    box-shadow: none;
  }

  /* === Дедлайны Учёбы === */
  .dashboard-home .dh-deadlines-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-deadlines-label {
    font-size: 0.75rem;
    font-weight: var(--font-semi-medium, 500);
    color: var(--icon-color, var(--text-muted));
    white-space: nowrap;
  }
  .dashboard-home .dh-deadlines-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .dashboard-home button.dh-deadline-pill {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    height: 26px;
    padding: 0 10px;
    border: none;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    background: var(--trans-faint-05, var(--background-secondary));
    box-shadow: inset 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border));
    color: var(--text-normal);
    font-size: 0.77rem;
    font-weight: var(--font-semi-medium, 500);
    cursor: pointer;
    transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home button.dh-deadline-pill:hover {
    background: var(--background-modifier-hover);
  }
  .dashboard-home button.dh-deadline-pill.is-overdue {
    background: color-mix(in oklab, var(--color-red, #d85b57) 14%, var(--background-primary));
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-red, #d85b57) 42%, transparent);
    color: var(--color-red, #d85b57);
  }
  .dashboard-home button.dh-deadline-pill.is-soon {
    background: color-mix(in oklab, var(--color-orange, #e5a158) 14%, var(--background-primary));
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-orange, #e5a158) 42%, transparent);
    color: var(--color-orange, #e5a158);
  }
  .dashboard-home .dh-deadline-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
  }
  .dashboard-home .dh-deadline-when {
    font-size: 0.71rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
    white-space: nowrap;
  }

  /* === Инлайн-добавление в «План дня» === */
  .dashboard-home .dh-plan-add-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dashboard-home input.dh-plan-add-input {
    flex: 1 1 auto;
    width: 100% !important;
    height: 30px !important;
    padding: 0 10px !important;
    border: none !important;
    outline: none !important;
    border-radius: var(--input-radius, var(--radius-s, 8px)) !important;
    background: var(--trans-faint-05, var(--background-secondary)) !important;
    box-shadow: inset 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)) !important;
    color: var(--text-normal) !important;
    font-size: 0.82rem !important;
    transition: box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home input.dh-plan-add-input:focus {
    box-shadow: var(--shadow-input-active, 0 0 0 2px var(--interactive-accent)) !important;
  }
  .dashboard-home input.dh-plan-add-input::placeholder {
    color: var(--text-faint);
  }
  .dashboard-home button.dh-plan-add-btn {
    appearance: none;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-s, 8px);
    background: var(--interactive-normal);
    color: var(--text-normal);
    font-size: 1rem;
    font-weight: var(--font-semi-medium, 500);
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
  }
  .dashboard-home button.dh-plan-add-btn:hover {
    background: var(--interactive-hover);
  }
  body.is-mobile .dashboard-home button.dh-deadline-pill,
  body.is-tablet .dashboard-home button.dh-deadline-pill {
    height: 34px;
    padding: 0 12px;
  }
  body.is-mobile .dashboard-home input.dh-plan-add-input,
  body.is-tablet .dashboard-home input.dh-plan-add-input,
  body.is-mobile .dashboard-home button.dh-plan-add-btn,
  body.is-tablet .dashboard-home button.dh-plan-add-btn {
    height: 38px !important;
  }
  body.is-mobile .dashboard-home button.dh-plan-add-btn,
  body.is-tablet .dashboard-home button.dh-plan-add-btn {
    width: 38px;
  }
  body.is-mobile .dashboard-home button.dh-date-nav-btn {
    width: 36px;
    height: 36px;
    min-width: 36px;
  }
  body.is-mobile .dashboard-home button.dh-rating-pill,
  body.is-mobile .dashboard-home .dh-today .dh-habit-chip,
  body.is-mobile .dashboard-home .dh-today .dh-score {
    min-height: 36px;
    height: 36px;
  }
  body.is-mobile .dashboard-home .dh-event-input {
    height: 38px !important;
  }
  body.is-mobile .dashboard-home .dh-plan-focus-btn {
    height: 28px !important;
    min-height: 28px !important;
    padding: 0 10px !important;
  }
  @media (max-width: 820px) {
    .dashboard-home .dh-metrics-grid {
      grid-template-columns: repeat(2, minmax(120px, 1fr));
    }
  }
  @media (max-width: 560px) {
    .dashboard-home .dh-today-row,
    .dashboard-home .dh-event-row {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .dashboard-home .dh-metrics-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  `;

  function actionButton(parent, label, run, cls = "dh-btn") {
    const b = parent.createEl("button", { cls, text: label, attr: { type: "button" } });
    b.onmousedown = e => e.preventDefault();
    b.onclick = async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await run();
      } catch (e) {
        notify(`Не получилось: ${e?.message ?? e}`);
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    };
    return b;
  }

const openOrCreateDay = async () => {
    if (note) {
      app.workspace.openLinkText(note.file.path, dv.currentFilePath, false);
      return;
    }
    if (isToday) {
      if (!app.commands.executeCommandById("daily-notes")) {
        await createDiaryNoteForDate(selectedISO);
        scheduleHomeRender(120);
      }
      return;
    }
    await createDiaryNoteForDate(selectedISO);
    notify(`Создана запись за ${selectedDate.toFormat("dd.MM.yyyy")}`);
    scheduleHomeRender(120);
  };

  const head = root.createDiv({ cls: "dh-today-head" });
  const titles = head.createDiv({ cls: "dh-today-titles" });
  titles.createDiv({
    cls: "dh-kicker",
    text: isToday ? "Сегодня" : isYesterday ? "Вчера" : selectedDate.toFormat("dd.MM.yyyy")
  });

  const dateRow = titles.createDiv({ cls: "dh-today-date-row" });
  const navWrap = dateRow.createDiv({ cls: "dh-date-nav" });

  const prevDayBtn = navWrap.createEl("button", {
    cls: "dh-date-nav-btn",
    text: "‹",
    attr: { type: "button", title: "Предыдущий день", "aria-label": "Предыдущий день" }
  });
  prevDayBtn.onmousedown = e => e.preventDefault();
  prevDayBtn.onclick = () => setSelectedDateISO(selectedDate.minus({ days: 1 }).toISODate());

  const pickerWrap = navWrap.createDiv({
    cls: "dh-date-picker-wrap",
    attr: { title: "Нажми, чтобы выбрать любую дату" }
  });
  pickerWrap.createDiv({
    cls: "dh-today-date",
    text: selectedDate.setLocale("ru").toFormat("cccc, d MMMM")
  });
  const pickerInput = pickerWrap.createEl("input", {
    cls: "dh-date-picker-native",
    attr: {
      type: "date",
      value: selectedISO,
      min: MIN_VALID_DATE_ISO,
      max: todayISO,
      "aria-label": "Выбрать дату"
    }
  });
  pickerInput.onclick = () => {
    try { pickerInput.showPicker?.(); } catch {}
  };
  pickerInput.onchange = () => {
    if (pickerInput.value) setSelectedDateISO(pickerInput.value);
  };

  const nextDayBtn = navWrap.createEl("button", {
    cls: "dh-date-nav-btn",
    text: "›",
    attr: { type: "button", title: "Следующий день", "aria-label": "Следующий день" }
  });
  nextDayBtn.disabled = isToday;
  nextDayBtn.onmousedown = e => e.preventDefault();
  nextDayBtn.onclick = () => setSelectedDateISO(selectedDate.plus({ days: 1 }).toISODate());

  if (!isToday) {
    const backTodayBtn = dateRow.createEl("button", {
      cls: "dh-date-today-btn",
      text: "Сегодня",
      attr: { type: "button", title: "Вернуться к сегодняшнему дню" }
    });
    backTodayBtn.onmousedown = e => e.preventDefault();
    backTodayBtn.onclick = () => setSelectedDateISO(todayISO);
  }

  const badgesWrap = dateRow.createDiv({ cls: "dh-today-badges" });

  const actions = head.createDiv({ cls: "dh-actions" });
  actionButton(
    actions,
    note ? "Открыть запись дня" : "Создать запись дня",
    openOrCreateDay,
    note ? "dh-btn" : "dh-btn mod-cta"
  );

  if (!note) {
    root.createDiv({
      cls: "dh-muted",
      text: isToday
        ? "Записи за сегодня пока нет. Нажми «Создать запись дня», чтобы отмечать оценку, энергию, привычки, показатели и главное событие прямо с главной."
        : `Записи за ${selectedDate.toFormat("dd.MM.yyyy")} нет. Нажми «Создать запись дня», чтобы сразу заполнить все показатели прямо здесь.`,
      attr: { style: "margin-top: 12px; font-size: 0.84rem;" }
    });
  } else {
    const file = app.vault.getAbstractFileByPath(note.file.path);
    const fmCache = file ? (app.metadataCache.getFileCache(file)?.frontmatter || {}) : {};
    const manualOverrides = getManualHabitOverrides(selectedISO);

    const saveField = (key, value) => enqueueFrontMatterSave(file, fm => {
      fm[key] = value;
    });

    const savedCalories = parseNum(note.калории_ккал);
    const savedProtein = parseNum(note.белки_г);
    const savedFat = parseNum(note.жиры_г);
    const savedCarbs = parseNum(note.углеводы_г);
    const savedSleep = parseNum(note.сон_часов);
    const savedPages = parseNum(note.страниц_прочитано);
    const savedFocus = parseNum(note.глубокая_работа_часов);
    const savedSocialMin = parseNum(note.соцсети_мин);

    const focusByGoalsMap = (fmCache.фокус_по_целям && typeof fmCache.фокус_по_целям === "object")
      ? fmCache.фокус_по_целям
      : {};

    const states = new Map(HABITS.map(h => [h.key, typeof note[h.key] === "boolean" ? note[h.key] : null]));
    const pendingPatch = {};

    if (isToday) {
      // 1. Привычка «Чтение» по данным ежедневника (пишет my-epub-reader или ручной ввод)
      if (savedPages !== null && savedPages > 0 && manualOverrides.чтение === undefined && states.get("чтение") !== true) {
        states.set("чтение", true);
        pendingPatch.чтение = true;
      }

      // 2. Автосинхронизация привычки «Тренировка» при наличии сессии за сегодня
      if (trainings.length > 0 && manualOverrides.тренировка === undefined && states.get("тренировка") !== true) {
        states.set("тренировка", true);
        pendingPatch.тренировка = true;
      }

      // 3. Автосинхронизация привычки «Диета» (мягкий допуск 95%)
      if (dietCalorieThreshold !== null && savedCalories !== null && savedCalories >= dietCalorieThreshold && manualOverrides.диета === undefined && states.get("диета") !== true) {
        states.set("диета", true);
        pendingPatch.диета = true;
      }

      // 4. Автосинхронизация привычки «Режим сна» при сне > 6 часов
      if (savedSleep !== null && savedSleep > AUTO_SLEEP_MIN_HOURS && manualOverrides.режим_сна === undefined && states.get("режим_сна") !== true) {
        states.set("режим_сна", true);
        pendingPatch.режим_сна = true;
      }

      // 5. Автосинхронизация привычки «Без соцсетей» при соцсети_мин <= SOCIAL_LIMIT_MIN
      if (savedSocialMin !== null && manualOverrides.без_соцсетей === undefined) {
        const withinLimit = savedSocialMin <= SOCIAL_LIMIT_MIN;
        if (states.get("без_соцсетей") !== withinLimit) {
          states.set("без_соцсетей", withinLimit);
          pendingPatch.без_соцсетей = withinLimit;
        }
      }

      if (Object.keys(pendingPatch).length > 0) {
        enqueueFrontMatterSave(file, fm => {
          Object.assign(fm, pendingPatch);
        }).catch(e => console.log("Auto-sync error:", e));
      }
    }

    const rawGoals = Array.isArray(note.цели_дня) ? note.цели_дня : [];
    const goalsState = rawGoals.map(g => {
      const text = String(g?.text ?? "Задача").trim();
      const focusMin = Math.max(
        Number(g?.focus_minutes) || 0,
        Number(focusByGoalsMap[text]) || 0
      );
      return {
        text,
        category: g?.category ? String(g.category).trim() : "",
        progress: Math.max(0, Math.min(100, Number(g?.progress) || 0)),
        focusMinutes: Math.round(focusMin)
      };
    });

    const calcPlanSummary = () => {
      const totalG = goalsState.length;
      if (!totalG) return { totalG: 0, doneG: 0, avgPct: 0 };
      const doneG = goalsState.filter(g => g.progress >= 100).length;
      const avgPct = Math.round(goalsState.reduce((acc, g) => acc + g.progress, 0) / totalG);
      return { totalG, doneG, avgPct };
    };

const updatePlanHeadPill = () => {};

    const body = root.createDiv({ cls: "dh-today-body" });
    const stateSection = body.createDiv({ cls: "dh-today-section" });

    const ratingsBar = stateSection.createDiv({ cls: "dh-ratings-bar" });
    const scaleDrawer = stateSection.createDiv({ cls: "dh-rating-drawer" });
    scaleDrawer.style.display = "none";

    const scaleDefs = [
      { label: "Оценка дня", key: "оценка_дня" },
      { label: "Энергия", key: "энергия" }
    ];
    const scaleCurrent = new Map();
    const scalePills = new Map();

    for (const sc of scaleDefs) {
      const parsed = parseNum(note[sc.key]);
      scaleCurrent.set(sc.key, parsed !== null && parsed >= 1 && parsed <= 10 ? parsed : null);

      const pill = ratingsBar.createEl("button", {
        cls: "dh-rating-pill",
        attr: { type: "button" }
      });
      pill.onmousedown = e => e.preventDefault();
      pill.createSpan({ text: sc.label });
      const valEl = pill.createSpan({ cls: "dh-rating-pill-val" });
      scalePills.set(sc.key, { pill, valEl });

      pill.onclick = () => {
        uiDrafts.openScaleKey = uiDrafts.openScaleKey === sc.key ? null : sc.key;
        renderScaleDrawer();
      };
    }

    function paintScalePills() {
      for (const sc of scaleDefs) {
        const cur = scaleCurrent.get(sc.key);
        const { pill, valEl } = scalePills.get(sc.key);
        valEl.setText(cur !== null ? `${cur}/10` : "—");
        pill.style.setProperty("--pill-color", cur !== null ? COLORS[Math.round(cur) - 1] : "var(--text-muted)");
        pill.classList.toggle("is-open", uiDrafts.openScaleKey === sc.key);
      }
    }

    function renderScaleDrawer() {
      paintScalePills();
      scaleDrawer.replaceChildren();
      const activeSc = scaleDefs.find(s => s.key === uiDrafts.openScaleKey);
      if (!activeSc) {
        scaleDrawer.style.display = "none";
        return;
      }
      scaleDrawer.style.display = "flex";
      const cur = scaleCurrent.get(activeSc.key);
      for (let n = 1; n <= 10; n++) {
        const b = actionButton(scaleDrawer, String(n), async () => {
          const prev = scaleCurrent.get(activeSc.key);
          const next = prev === n ? null : n;
          scaleCurrent.set(activeSc.key, next);
          uiDrafts.openScaleKey = null;
          renderScaleDrawer();
          try {
            await saveField(activeSc.key, next);
          } catch (err) {
            scaleCurrent.set(activeSc.key, prev);
            renderScaleDrawer();
            throw err;
          }
        }, "dh-chip dh-score" + (cur === n ? " is-active" : ""));
        b.style.setProperty("--chip-color", COLORS[n - 1]);
        b.setAttribute("aria-label", `${activeSc.label}: ${n}`);
      }
    }
    renderScaleDrawer();

    const habitsRow = stateSection.createDiv({ cls: "dh-today-row" });
    const habitsLabelWrap = habitsRow.createDiv({ cls: "dh-today-row-label" });
    habitsLabelWrap.createSpan({ text: "Привычки" });
    const habitsCountSub = habitsLabelWrap.createSpan({ cls: "dh-today-row-sub" });
    const habitChips = habitsRow.createDiv({ cls: "dh-today-chips" });

    const habitPainters = new Map();
    const updateHabitsSummary = () => {
      const done = [...states.values()].filter(v => v === true).length;
      habitsCountSub.setText(`${done}/${HABITS.length}`);
    };

for (const h of HABITS) {
      const b = actionButton(habitChips, "", async () => {
        const prev = states.get(h.key);
        const next = prev !== true;
        states.set(h.key, next);
        setManualHabitOverride(h.key, next, selectedISO);
        paintHabit();
        updateHabitsSummary();
        try {
          await saveField(h.key, next);
        } catch (err) {
          states.set(h.key, prev);
          paintHabit();
          updateHabitsSummary();
          throw err;
        }
      }, "dh-chip dh-habit-chip");

      b.style.setProperty("--chip-color", h.color);
      const checkIcon = b.createSpan({ cls: "dh-habit-check" });
      b.createSpan({ text: h.name });

      const paintHabit = () => {
        const s = states.get(h.key);
        const isDone = s === true;
        b.classList.toggle("is-active", isDone);
        b.classList.toggle("is-unknown", s === null);
        b.setAttribute("aria-pressed", String(isDone));
        b.setAttribute("title", isDone ? `${h.name}: выполнено (нажми, чтобы снять)` : `${h.name}: не отмечено`);
        checkIcon.setText(isDone ? "✓" : "○");
      };

      habitPainters.set(h.key, paintHabit);
      paintHabit();
    }
    updateHabitsSummary();

const metricsGrid = body.createDiv({ cls: "dh-metrics-grid" });
    const inputRefs = new Map();

    const syncMetricInputWidth = (inp, fallback = "—") => {
      const sizer = inp.parentElement;
      if (sizer && sizer.classList.contains("dh-metric-sizer")) {
        sizer.dataset.val = inp.value || fallback;
      }
    };

    const renderInputMetricCard = (m) => {
      const card = metricsGrid.createEl("label", { cls: "dh-metric-item" });
      const top = card.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: m.label });
      const statusSpan = top.createSpan({ cls: "dh-metric-status" });

      const control = card.createDiv({ cls: "dh-metric-control" });
      const sizer = control.createSpan({ cls: "dh-metric-sizer" });
      const input = sizer.createEl("input", {
        cls: "dh-metric-input",
        attr: {
          type: "text",
          inputmode: m.digits > 0 ? "decimal" : "numeric",
          placeholder: m.placeholder,
          "aria-label": `${m.label}, ${m.unit}`
        }
      });
      control.createSpan({ cls: "dh-metric-unit", text: m.unit });

      if (m.hint) {
        card.createDiv({ cls: "dh-metric-subhint", text: m.hint });
      }

      const errorEl = card.createDiv({ cls: "dh-metric-error" });
      errorEl.style.display = "none";

      const savedRaw = note[m.key];
      const savedFormatted = formatNumForInput(savedRaw, m.digits);
      const hasDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, m.key);
      input.value = hasDraft ? uiDrafts.inputs[m.key] : savedFormatted;
      syncMetricInputWidth(input, m.placeholder);

      if (uiDrafts.errors[m.key]) {
        card.classList.add("is-invalid");
        errorEl.setText(uiDrafts.errors[m.key]);
        errorEl.style.display = "block";
      } else if (uiDrafts.savedStamp[m.key] && Date.now() - uiDrafts.savedStamp[m.key] < 2200) {
        statusSpan.setText("✓");
        setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
      }

      input.onfocus = () => {
        uiDrafts.activeKey = m.key;
      };

      input.oninput = () => {
        syncMetricInputWidth(input, m.placeholder);
        uiDrafts.inputs[m.key] = input.value;
        uiDrafts.selectionStart = input.selectionStart;
        uiDrafts.selectionEnd = input.selectionEnd;
        if (uiDrafts.errors[m.key]) {
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
        }
      };

      input.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          delete uiDrafts.inputs[m.key];
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
          input.value = savedFormatted;
          syncMetricInputWidth(input, m.placeholder);
          input.blur();
        }
      };

      let isSavingMetric = false;
      const commitMetric = async () => {
        if (isSavingMetric) return;
        if (uiDrafts.activeKey === m.key) uiDrafts.activeKey = null;

        const rawTrimmed = input.value.trim();
        const normalized = rawTrimmed.replace(",", ".");

// Очистка поля
        if (normalized === "") {
          delete uiDrafts.inputs[m.key];
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
          if (savedFormatted === "") return;

          isSavingMetric = true;
          try {
            syncMetricInputWidth(input, m.placeholder);
            await saveField(m.key, null);
            uiDrafts.savedStamp[m.key] = Date.now();
            statusSpan.setText("✓");
          } catch (err) {
            notify(`Не удалось очистить «${m.label}»: ${err?.message ?? err}`);
          } finally {
            isSavingMetric = false;
          }
          return;
        }

        const numVal = parseNum(normalized);
        if (numVal === null || numVal < m.min || numVal > m.max) {
          const msg = `Нужно число ${m.min}–${m.max} ${m.unit}`;
          uiDrafts.errors[m.key] = msg;
          card.classList.add("is-invalid");
          errorEl.setText(msg);
          errorEl.style.display = "block";
          return;
        }

const finalValue = Math.round(numVal * 10 ** m.digits) / 10 ** m.digits;
        const finalFormatted = formatNumForInput(finalValue, m.digits);
        input.value = finalFormatted;
        syncMetricInputWidth(input, m.placeholder);
        delete uiDrafts.inputs[m.key];
        delete uiDrafts.errors[m.key];
        card.classList.remove("is-invalid");
        errorEl.style.display = "none";

        let autoHabitKey = null;
        let autoHabitVal = null;

        if (m.key === "сон_часов") {
          autoHabitKey = "режим_сна";
          autoHabitVal = finalValue > AUTO_SLEEP_MIN_HOURS;
        } else if (m.key === "страниц_прочитано") {
          autoHabitKey = "чтение";
          autoHabitVal = finalValue > 0;
        } else if (m.key === "соцсети_мин") {
          autoHabitKey = "без_соцсетей";
          autoHabitVal = finalValue <= SOCIAL_LIMIT_MIN;
        }

        const habitNeedsUpdate = autoHabitKey !== null && states.get(autoHabitKey) !== autoHabitVal;
        if (finalFormatted === savedFormatted && typeof savedRaw === "number" && !habitNeedsUpdate) return;

        isSavingMetric = true;
try {
          if (autoHabitKey !== null) {
            setManualHabitOverride(autoHabitKey, undefined, selectedISO);
            states.set(autoHabitKey, autoHabitVal);
            habitPainters.get(autoHabitKey)?.();
            updateHabitsSummary();
          }

          await enqueueFrontMatterSave(file, fm => {
            fm[m.key] = finalValue;
            if (autoHabitKey !== null) {
              fm[autoHabitKey] = autoHabitVal;
            }
          });
          uiDrafts.savedStamp[m.key] = Date.now();
          statusSpan.setText("✓");
        } catch (err) {
          uiDrafts.inputs[m.key] = rawTrimmed;
          notify(`Ошибка сохранения «${m.label}»: ${err?.message ?? err}`);
        } finally {
          isSavingMetric = false;
        }
      };

      input.onchange = commitMetric;
      input.onblur = commitMetric;
      inputRefs.set(m.key, input);
    };

const renderSleepUnifiedCard = (m) => {
      const card = metricsGrid.createDiv({ cls: "dh-metric-item dh-sleep-card" });
      const topBlock = card.createDiv({ cls: "dh-sleep-top-block" });
      const top = topBlock.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: "Сон" });
      const statusSpan = top.createSpan({ cls: "dh-metric-status" });

      const durWrap = topBlock.createEl("label", { cls: "dh-metric-control" });
      const sizer = durWrap.createSpan({ cls: "dh-metric-sizer" });
      const sleepInput = sizer.createEl("input", {
        cls: "dh-metric-input",
        attr: {
          type: "text",
          size: "1",
          inputmode: "decimal",
          placeholder: m.placeholder,
          "aria-label": `${m.label}, ${m.unit}`
        }
      });
      durWrap.createSpan({ cls: "dh-metric-unit", text: m.unit });

      card.createDiv({ cls: "dh-sleep-divider" });

      const schedWrap = card.createDiv({ cls: "dh-sleep-sched" });
      schedWrap.createSpan({ cls: "dh-metric-label", text: "Режим" });
      const pair = schedWrap.createDiv({ cls: "dh-sleep-pair" });

      const errorEl = card.createDiv({ cls: "dh-metric-error" });
      errorEl.style.display = "none";

      const showError = (msg) => {
        card.classList.add("is-invalid");
        errorEl.setText(msg);
        errorEl.style.display = "block";
      };
      const clearError = (key) => {
        delete uiDrafts.errors[key];
        const anyErr = ["сон_часов", "отбой", "подъём"].find(k => uiDrafts.errors[k]);
        if (anyErr) {
          showError(uiDrafts.errors[anyErr]);
        } else {
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
        }
      };
      const flashSaved = (key) => {
        uiDrafts.savedStamp[key] = Date.now();
        statusSpan.setText("✓");
        setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
      };

      // --- Поле длительности сна (ч) ---
      const savedSleepRaw = note[m.key];
      const savedSleepFormatted = formatNumForInput(savedSleepRaw, m.digits);
      const hasSleepDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, m.key);
      sleepInput.value = hasSleepDraft ? uiDrafts.inputs[m.key] : savedSleepFormatted;
      syncMetricInputWidth(sleepInput, m.placeholder);

      if (uiDrafts.errors[m.key]) {
        showError(uiDrafts.errors[m.key]);
      } else if (uiDrafts.savedStamp[m.key] && Date.now() - uiDrafts.savedStamp[m.key] < 2200) {
        statusSpan.setText("✓");
        setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
      }

      sleepInput.onfocus = () => { uiDrafts.activeKey = m.key; };
      sleepInput.oninput = () => {
        syncMetricInputWidth(sleepInput, m.placeholder);
        uiDrafts.inputs[m.key] = sleepInput.value;
        uiDrafts.selectionStart = sleepInput.selectionStart;
        uiDrafts.selectionEnd = sleepInput.selectionEnd;
        if (uiDrafts.errors[m.key]) clearError(m.key);
      };
      sleepInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          sleepInput.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          delete uiDrafts.inputs[m.key];
          clearError(m.key);
          sleepInput.value = savedSleepFormatted;
          syncMetricInputWidth(sleepInput, m.placeholder);
          sleepInput.blur();
        }
      };

      let isSavingSleep = false;
      const commitSleep = async () => {
        if (isSavingSleep) return;
        if (uiDrafts.activeKey === m.key) uiDrafts.activeKey = null;

        const rawTrimmed = sleepInput.value.trim();
        const normalized = rawTrimmed.replace(",", ".");
        if (normalized === "") {
          delete uiDrafts.inputs[m.key];
          clearError(m.key);
          syncMetricInputWidth(sleepInput, m.placeholder);
          if (savedSleepFormatted === "") return;
          isSavingSleep = true;
          try {
            await saveField(m.key, null);
            flashSaved(m.key);
          } catch (err) {
            notify(`Не удалось очистить «Сон»: ${err?.message ?? err}`);
          } finally {
            isSavingSleep = false;
          }
          return;
        }

        const numVal = parseNum(normalized);
        if (numVal === null || numVal < m.min || numVal > m.max) {
          const msg = `Нужно число ${m.min}–${m.max} ${m.unit}`;
          uiDrafts.errors[m.key] = msg;
          showError(msg);
          return;
        }

        const finalValue = Math.round(numVal * 10 ** m.digits) / 10 ** m.digits;
        const finalFormatted = formatNumForInput(finalValue, m.digits);
        sleepInput.value = finalFormatted;
        syncMetricInputWidth(sleepInput, m.placeholder);
        delete uiDrafts.inputs[m.key];
        clearError(m.key);

        const autoHabitVal = finalValue > AUTO_SLEEP_MIN_HOURS;
        const habitNeedsUpdate = states.get("режим_сна") !== autoHabitVal;
        if (finalFormatted === savedSleepFormatted && typeof savedSleepRaw === "number" && !habitNeedsUpdate) return;

        isSavingSleep = true;
        try {
          setManualHabitOverride("режим_сна", undefined, selectedISO);
          states.set("режим_сна", autoHabitVal);
          habitPainters.get("режим_сна")?.();
          updateHabitsSummary();

          await enqueueFrontMatterSave(file, fm => {
            fm[m.key] = finalValue;
            fm["режим_сна"] = autoHabitVal;
          });
          flashSaved(m.key);
        } catch (err) {
          uiDrafts.inputs[m.key] = rawTrimmed;
          notify(`Ошибка сохранения «Сон»: ${err?.message ?? err}`);
        } finally {
          isSavingSleep = false;
        }
      };

      sleepInput.onchange = commitSleep;
      sleepInput.onblur = commitSleep;
      inputRefs.set(m.key, sleepInput);

      // --- Поля режима (Отбой → Подъём) ---
      const mountTimeField = (key, label, placeholder) => {
        const input = pair.createEl("input", {
          cls: "dh-time-input",
          attr: { type: "text", maxlength: "5", placeholder, "aria-label": label }
        });

        const savedVal = typeof note[key] === "string" ? note[key].trim() : "";
        const hasDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, key);
        input.value = hasDraft ? uiDrafts.inputs[key] : savedVal;

        if (uiDrafts.errors[key]) {
          showError(uiDrafts.errors[key]);
        } else if (uiDrafts.savedStamp[key] && Date.now() - uiDrafts.savedStamp[key] < 2200) {
          statusSpan.setText("✓");
          setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
        }

        input.onfocus = () => { uiDrafts.activeKey = key; };
        input.oninput = () => {
          uiDrafts.inputs[key] = input.value;
          if (uiDrafts.errors[key]) clearError(key);
        };
        input.onkeydown = e => {
          if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            delete uiDrafts.inputs[key];
            clearError(key);
            input.value = savedVal;
            input.blur();
          }
        };

        let isSavingTime = false;
        const commitTime = async () => {
          if (isSavingTime) return;
          if (uiDrafts.activeKey === key) uiDrafts.activeKey = null;

          const raw = input.value.trim();
          if (raw === "") {
            delete uiDrafts.inputs[key];
            clearError(key);
            if (savedVal === "") return;
            isSavingTime = true;
            try {
              await saveField(key, null);
              flashSaved(key);
            } catch (err) {
              notify(`Ошибка очистки «${label}»: ${err?.message ?? err}`);
            } finally {
              isSavingTime = false;
            }
            return;
          }

          const normalized = normalizeTimeString(raw);
          if (!normalized) {
            const msg = "Формат ЧЧ:ММ";
            uiDrafts.errors[key] = msg;
            showError(msg);
            return;
          }

          input.value = normalized;
          delete uiDrafts.inputs[key];
          clearError(key);
          if (normalized === savedVal) return;

          isSavingTime = true;
          try {
            const counterpartKey = key === "отбой" ? "подъём" : "отбой";
            const counterpartInputVal = inputRefs.get(counterpartKey)?.value?.trim() || "";
            const counterpartVal = normalizeTimeString(counterpartInputVal)
              || (typeof note[counterpartKey] === "string" ? note[counterpartKey].trim() : "");
            const otboy = key === "отбой" ? normalized : counterpartVal;
            const podjom = key === "подъём" ? normalized : counterpartVal;
            const autoSleep = computeSleepDurationHours(otboy, podjom);

            let autoSleepHabit = null;
            if (autoSleep !== null) {
              autoSleepHabit = autoSleep > AUTO_SLEEP_MIN_HOURS;
              if (manualOverrides.режим_сна === undefined) {
                states.set("режим_сна", autoSleepHabit);
                habitPainters.get("режим_сна")?.();
                updateHabitsSummary();
              }
            }

            await enqueueFrontMatterSave(file, fm => {
              fm[key] = normalized;
              if (autoSleep !== null) {
                fm["сон_часов"] = autoSleep;
                if (autoSleepHabit !== null && manualOverrides.режим_сна === undefined) {
                  fm["режим_сна"] = autoSleepHabit;
                }
              }
            });

            if (autoSleep !== null) {
              sleepInput.value = formatNumForInput(autoSleep, 1);
              syncMetricInputWidth(sleepInput, m.placeholder);
            }

            flashSaved(key);
          } catch (err) {
            uiDrafts.inputs[key] = raw;
            notify(`Ошибка сохранения «${label}»: ${err?.message ?? err}`);
          } finally {
            isSavingTime = false;
          }
        };

        input.onchange = commitTime;
        input.onblur = commitTime;
        inputRefs.set(key, input);
      };

      mountTimeField("отбой", "Отбой", "23:30");
      pair.createSpan({ cls: "dh-sleep-sep", text: "→" });
      mountTimeField("подъём", "Подъём", "07:15");
    };

    // РЯД 1: Вес (1), Калории (1), Сон и режим (2)
    renderInputMetricCard(INPUT_METRICS[0]); // Вес

    // Калории (из плагина my-nutrition-tracker)
    {
      const calCard = metricsGrid.createDiv({
        cls: "dh-metric-item is-clickable",
        attr: {
          role: "button",
          tabindex: "0",
          title: "Нажми, чтобы открыть дневник питания и добавить приём пищи"
        }
      });
      const top = calCard.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: "Калории" });
      top.createSpan({
        cls: "dh-metric-status",
        text: "+",
        attr: { style: "color: var(--interactive-accent); font-size: 0.9rem;" }
      });

      const control = calCard.createDiv({ cls: "dh-metric-control" });
      control.createSpan({
        cls: "dh-metric-readonly-val",
        text: savedCalories !== null ? String(Math.round(savedCalories)) : "—"
      });
      control.createSpan({
        cls: "dh-metric-unit",
        text: calorieGoal !== null ? `/ ${calorieGoal}` : "ккал"
      });

      if (savedProtein !== null || savedFat !== null || savedCarbs !== null) {
        calCard.createDiv({
          cls: "dh-metric-subhint",
          text: `Б ${Math.round(savedProtein || 0)} · Ж ${Math.round(savedFat || 0)} · У ${Math.round(savedCarbs || 0)}`
        });
      }

      calCard.onclick = () => openNutritionFromHome();
      calCard.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openNutritionFromHome();
        }
      };
    }

    renderInputMetricCard(INPUT_METRICS[2]); // Чтение
    renderSleepUnifiedCard(INPUT_METRICS[1]); // Сон и режим (столбец span 2)

    // РЯД 2: Фокус (1), Соцсети (1), Шаги (1)
    {
      const focusPlugin = getFocusPlugin();
      const activeSession = focusPlugin?.session;
      const isRunningNow = isToday && Boolean(activeSession && activeSession.isRunning);

      const focusCard = metricsGrid.createDiv({
        cls: "dh-metric-item is-clickable" + (isRunningNow ? " is-running" : ""),
        attr: {
          role: "button",
          tabindex: "0",
          title: "Нажми, чтобы открыть таймер глубокой работы и выбрать цель дня"
        }
      });
      const top = focusCard.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: "Фокус" });
      const statusBadgeEl = top.createSpan({
        cls: "dh-metric-status",
        text: isRunningNow ? "● Идёт" : "+",
        attr: { style: "color: var(--color-purple, #9c83e8); font-size: " + (isRunningNow ? "0.72rem;" : "0.9rem;") }
      });

      const control = focusCard.createDiv({ cls: "dh-metric-control" });
      const valSpan = control.createSpan({
        cls: "dh-metric-readonly-val",
        text: savedFocus !== null ? String(savedFocus).replace(".", ",") : "—"
      });
      const unitSpan = control.createSpan({
        cls: "dh-metric-unit",
        text: "ч"
      });

      const goalEntries = Object.entries(focusByGoalsMap)
        .map(([k, v]) => [k, Number(v) || 0])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

      const defaultHint = goalEntries.length > 0
        ? goalEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}м`).join(" · ")
        : "";

      const hintEl = focusCard.createDiv({
        cls: "dh-metric-subhint",
        text: defaultHint,
        attr: {
          title: goalEntries.map(([k, v]) => `${k}: ${v} мин`).join(", "),
          style: defaultHint ? "" : "display: none;"
        }
      });

      if (window.__dhHomeFocusTicker) {
        window.clearInterval(window.__dhHomeFocusTicker);
        delete window.__dhHomeFocusTicker;
      }

      const formatStopwatch = (totalSec) => {
        const s = Math.max(0, Math.floor(totalSec));
        const hh = Math.floor(s / 3600);
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
      };

      const paintRunningState = () => {
        const plugin = getFocusPlugin();
        const curSession = plugin?.session;
        if (!curSession || !curSession.isRunning) {
          if (window.__dhHomeFocusTicker) {
            window.clearInterval(window.__dhHomeFocusTicker);
            delete window.__dhHomeFocusTicker;
          }
          focusCard.classList.remove("is-running");
          statusBadgeEl.setText("+");
          statusBadgeEl.style.fontSize = "0.9rem";
          valSpan.setText(savedFocus !== null ? String(savedFocus).replace(".", ",") : "—");
          unitSpan.setText("ч");
          hintEl.setText(defaultHint);
          hintEl.style.display = defaultHint ? "" : "none";
          return;
        }

        const hasValidEndAt = typeof curSession.endAt === "number" && Number.isFinite(curSession.endAt);
        if (hasValidEndAt) {
          const remSec = Math.max(0, Math.ceil((curSession.endAt - Date.now()) / 1000));
          valSpan.setText(formatStopwatch(remSec));
          unitSpan.setText("ост.");
        } else {
          let elSec = null;
          if (typeof plugin?.getElapsedSeconds === "function") {
            const v = Number(plugin.getElapsedSeconds());
            if (Number.isFinite(v)) elSec = v;
          }
          if (elSec === null) {
            const startTs = Number(curSession.startAt ?? curSession.startedAt);
            const accSec = Number(curSession.accumulatedSec ?? (Number(curSession.accumulatedMs || 0) / 1000)) || 0;
            if (Number.isFinite(startTs) && startTs > 0) {
              elSec = (Date.now() - startTs) / 1000 + accSec;
            } else if (Number.isFinite(Number(curSession.elapsedSec))) {
              elSec = Number(curSession.elapsedSec);
            } else {
              elSec = 0;
            }
          }
          valSpan.setText(formatStopwatch(elSec));
          unitSpan.setText("");
        }

        statusBadgeEl.setText("● Идёт");
        statusBadgeEl.style.fontSize = "0.72rem";
        if (curSession.project) {
          hintEl.setText(`Цель: ${curSession.project}`);
          hintEl.style.display = "";
        }
      };

      if (isRunningNow) {
        paintRunningState();
        window.__dhHomeFocusTicker = window.setInterval(() => {
          if (!focusCard.isConnected) {
            window.clearInterval(window.__dhHomeFocusTicker);
            return;
          }
          paintRunningState();
        }, 1000);
      }

      focusCard.onclick = () => openFocusTrackerFromHome();
      focusCard.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFocusTrackerFromHome();
        }
      };
    }

    renderInputMetricCard(INPUT_METRICS[3]); // Соцсети (мин)
    renderInputMetricCard(INPUT_METRICS[4]); // Шаги

    const bottomGrid = body.createDiv({ cls: "dh-today-bottom-grid" });

    // --- Дедлайны из Учёбы (только для сегодняшнего дня) ---
    if (isToday) {
      const doneStatuses = new Set([
        "завершён", "завершена", "сдана", "сдан", "готово", "архив", "отменён", "отменена"
      ]);
      const studyDeadlines = dv.pages().array()
        .filter(p => {
          if (p.file.name.startsWith("Учёба — ") || p.file.path.startsWith("Шаблоны/")) return false;
          if (String(p.направление ?? "").trim() !== "Учёба") return false;
          const status = String(p.статус ?? "").trim().toLowerCase();
          if (doneStatuses.has(status)) return false;
          const dl = asDate(p.дедлайн) || asDate(p.срок);
          if (!dl) return false;
          const diffDays = Math.round(dl.diff(today, "days").days);
          return diffDays <= STUDY_DEADLINE_HORIZON_DAYS;
        })
        .map(p => {
          const dl = asDate(p.дедлайн) || asDate(p.срок);
          const diffDays = Math.round(dl.diff(today, "days").days);
          return {
            path: p.file.path,
            title: String(p.название ?? p.file.name).trim(),
            dl,
            diffDays
          };
        })
        .sort((a, b) => a.diffDays - b.diffDays || a.title.localeCompare(b.title, "ru"))
        .slice(0, 2);

      if (studyDeadlines.length > 0) {
        const dlStrip = bottomGrid.createDiv({ cls: "dh-deadlines-strip" });
        dlStrip.createSpan({ cls: "dh-deadlines-label", text: "Дедлайны" });
        const dlList = dlStrip.createDiv({ cls: "dh-deadlines-list" });

        studyDeadlines.forEach(item => {
          const stateCls = item.diffDays < 0 ? " is-overdue" : item.diffDays <= 3 ? " is-soon" : "";
          const whenText = item.diffDays < 0
            ? `просроч. ${Math.abs(item.diffDays)}д`
            : item.diffDays === 0
              ? "сегодня"
              : item.diffDays === 1
                ? "завтра"
                : item.diffDays <= 3
                  ? `через ${item.diffDays}д`
                  : item.dl.toFormat("dd.MM");

          const pill = dlList.createEl("button", {
            cls: "dh-deadline-pill" + stateCls,
            attr: {
              type: "button",
              title: `${item.title} — ${item.dl.toFormat("dd.MM.yyyy")}`
            }
          });
          pill.createSpan({ cls: "dh-deadline-title", text: item.title });
          pill.createSpan({ cls: "dh-deadline-when", text: whenText });
          pill.onclick = e => openStudyProjectFromHome(item.path, e.ctrlKey || e.metaKey);
        });
      }
    }

    // --- План дня (всегда видим) ---
    {
      const planBox = bottomGrid.createDiv({ cls: "dh-plan-box" });
      const planHead = planBox.createDiv({ cls: "dh-plan-head" });
      planHead.createSpan({ cls: "dh-plan-title", text: "План дня" });
      const planMeta = planHead.createSpan({ cls: "dh-today-row-sub" });

      const barTrack = planBox.createDiv({ cls: "dh-plan-bar-track" });
      const barFill = barTrack.createDiv({ cls: "dh-plan-bar-fill" });

      const planList = planBox.createDiv({ cls: "dh-plan-list" });
      const itemPainters = [];

      const refreshPlanUI = () => {
        const { totalG, doneG, avgPct } = calcPlanSummary();
        if (totalG === 0) {
          planMeta.setText("Нет задач");
          barTrack.style.display = "none";
          planList.style.display = "none";
        } else {
          planMeta.setText(`${avgPct}% · выполнено ${doneG} из ${totalG}`);
          barTrack.style.display = "";
          planList.style.display = "";
          barFill.style.width = `${avgPct}%`;
          barFill.style.background = avgPct === 100 ? "#4aab80" : avgPct >= 60 ? "#599ed6" : "#e5a158";
        }
        updatePlanHeadPill();
        itemPainters.forEach(fn => fn());
      };

      goalsState.forEach((goal, idx) => {
        const item = planList.createDiv({
          cls: "dh-plan-item",
          attr: { role: "button", tabindex: "0", title: "Нажми, чтобы отметить задачу выполненной (100% / 0%)" }
        });

        const left = item.createDiv({ cls: "dh-plan-item-left" });
        const check = left.createSpan({ cls: "dh-plan-check" });
        left.createSpan({
          cls: "dh-plan-text",
          text: goal.category ? `${goal.text} (${goal.category})` : goal.text
        });

        const right = item.createDiv({ cls: "dh-plan-item-right" });
        const focusBtn = right.createEl("button", {
          cls: "dh-plan-focus-btn" + (goal.focusMinutes > 0 ? "" : " is-empty"),
          text: goal.focusMinutes > 0 ? `${goal.focusMinutes}м` : "⏱",
          attr: {
            type: "button",
            title: `Запустить фокус-сессию по цели «${goal.text}»`
          }
        });
        focusBtn.onclick = e => {
          e.stopPropagation();
          openFocusTrackerFromHome(goal.text);
        };

        const pctSpan = right.createSpan({ cls: "dh-plan-pct" });

        const paintGoalItem = () => {
          const isDone = goal.progress >= 100;
          item.classList.toggle("is-done", isDone);
          check.setText(isDone ? "✓" : "");
          if (goal.progress > 0 && goal.progress < 100) {
            pctSpan.style.display = "";
            pctSpan.setText(`${goal.progress}%`);
          } else {
            pctSpan.style.display = "none";
          }
        };
        itemPainters.push(paintGoalItem);

        let isTogglingGoal = false;
        const toggleGoal = async () => {
          if (isTogglingGoal) return;
          isTogglingGoal = true;
          const prevProgress = goal.progress;
          goal.progress = prevProgress >= 100 ? 0 : 100;
          refreshPlanUI();

          try {
            await enqueueFrontMatterSave(file, fm => {
              const fmGoals = Array.isArray(fm.цели_дня) ? fm.цели_дня : [];
              if (fmGoals[idx] && typeof fmGoals[idx] === "object") {
                fmGoals[idx].progress = goal.progress;
              }
              const total = fmGoals.length;
              fm.прогресс_дня_процент = total > 0
                ? Math.round(fmGoals.reduce((acc, g) => acc + (Number(g?.progress) || 0), 0) / total)
                : 0;
            });
          } catch (err) {
            goal.progress = prevProgress;
            refreshPlanUI();
            notify(`Не удалось обновить задачу: ${err?.message ?? err}`);
          } finally {
            isTogglingGoal = false;
          }
        };

        item.onmousedown = e => e.preventDefault();
        item.onclick = toggleGoal;
        item.onkeydown = e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleGoal();
          }
        };
      });

      const addRow = planBox.createDiv({ cls: "dh-plan-add-row" });
      const addInput = addRow.createEl("input", {
        cls: "dh-plan-add-input",
        attr: {
          type: "text",
          placeholder: "+ Добавить задачу дня…",
          "aria-label": "Добавить задачу дня"
        }
      });
      const addBtn = addRow.createEl("button", {
        cls: "dh-plan-add-btn",
        text: "+",
        attr: { type: "button", title: "Добавить задачу в план дня", "aria-label": "Добавить задачу" }
      });

      addInput.onfocus = () => { uiDrafts.activeKey = "__plan_add"; };
      addInput.onblur = () => { if (uiDrafts.activeKey === "__plan_add") uiDrafts.activeKey = null; };

      let isAddingGoal = false;
      const commitNewGoal = async () => {
        if (isAddingGoal) return;
        const text = addInput.value.trim();
        if (!text) return;
        isAddingGoal = true;
        addBtn.disabled = true;
        try {
          const newGoal = { text, category: "", progress: 0, focus_minutes: 0 };
          await enqueueFrontMatterSave(file, fm => {
            if (!Array.isArray(fm.цели_дня)) fm.цели_дня = [];
            fm.цели_дня.push(newGoal);
            const total = fm.цели_дня.length;
            fm.прогресс_дня_процент = total > 0
              ? Math.round(fm.цели_дня.reduce((acc, g) => acc + (Number(g?.progress) || 0), 0) / total)
              : 0;
          });
          addInput.value = "";
          if (uiDrafts.activeKey === "__plan_add") uiDrafts.activeKey = null;
          renderHomeDashboard();
        } catch (err) {
          notify(`Не удалось добавить задачу: ${err?.message ?? err}`);
        } finally {
          isAddingGoal = false;
          if (addBtn.isConnected) addBtn.disabled = false;
        }
      };

      addBtn.onmousedown = e => e.preventDefault();
      addBtn.onclick = () => { void commitNewGoal(); };
      addInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commitNewGoal();
        } else if (e.key === "Escape") {
          e.preventDefault();
          addInput.value = "";
          addInput.blur();
        }
      };

      refreshPlanUI();
    }

    const eventRow = bottomGrid.createDiv({ cls: "dh-event-row" });
    const eventLabelWrap = eventRow.createDiv({ cls: "dh-today-row-label" });
    eventLabelWrap.createSpan({ text: "Главное событие" });
    const eventStatus = eventLabelWrap.createSpan({ cls: "dh-today-row-sub" });

    const eventControl = eventRow.createDiv({ cls: "dh-event-control" });
    const savedEvent = typeof note.главное_событие === "string" ? note.главное_событие.trim() : "";
    const hasEventDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, "главное_событие");

    const eventInput = eventControl.createEl("input", {
      cls: "dh-event-input",
      attr: {
        type: "text",
        placeholder: "Коротко запиши главное событие или итог дня…",
        "aria-label": "Главное событие дня"
      }
    });
    eventInput.value = hasEventDraft ? uiDrafts.inputs["главное_событие"] : savedEvent;

    if (uiDrafts.savedStamp["главное_событие"] && Date.now() - uiDrafts.savedStamp["главное_событие"] < 2200) {
      eventStatus.setText("✓");
      eventStatus.style.color = "#4aab80";
      setTimeout(() => { if (eventStatus.isConnected) eventStatus.setText(""); }, 1800);
    }

    eventInput.onfocus = () => {
      uiDrafts.activeKey = "главное_событие";
    };

    eventInput.oninput = () => {
      uiDrafts.inputs["главное_событие"] = eventInput.value;
      uiDrafts.selectionStart = eventInput.selectionStart;
      uiDrafts.selectionEnd = eventInput.selectionEnd;
    };

    eventInput.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        eventInput.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        delete uiDrafts.inputs["главное_событие"];
        eventInput.value = savedEvent;
        eventInput.blur();
      }
    };

    let isSavingEvent = false;
    const commitEvent = async () => {
      if (isSavingEvent) return;
      if (uiDrafts.activeKey === "главное_событие") uiDrafts.activeKey = null;

      const nextEvent = eventInput.value.trim();
      eventInput.value = nextEvent;
      delete uiDrafts.inputs["главное_событие"];

      if (nextEvent === savedEvent) return;

      isSavingEvent = true;
      try {
        await saveField("главное_событие", nextEvent === "" ? null : nextEvent);
        uiDrafts.savedStamp["главное_событие"] = Date.now();
        eventStatus.setText("✓");
        eventStatus.style.color = "#4aab80";
      } catch (err) {
        uiDrafts.inputs["главное_событие"] = nextEvent;
        notify(`Не удалось сохранить главное событие: ${err?.message ?? err}`);
      } finally {
        isSavingEvent = false;
      }
    };

    eventInput.onchange = commitEvent;
    eventInput.onblur = commitEvent;
    inputRefs.set("главное_событие", eventInput);

    if (uiDrafts.activeKey && inputRefs.has(uiDrafts.activeKey)) {
      const targetInput = inputRefs.get(uiDrafts.activeKey);
      requestAnimationFrame(() => {
        if (!targetInput.isConnected) return;
        targetInput.focus({ preventScroll: true });
        if (typeof uiDrafts.selectionStart === "number" && typeof uiDrafts.selectionEnd === "number") {
          try { targetInput.setSelectionRange(uiDrafts.selectionStart, uiDrafts.selectionEnd); } catch {}
        }
      });
    }

if (trainings.length > 0 || (savedFocus !== null && savedFocus > 0)) {
      const footer = body.createDiv({ cls: "dh-today-footer" });
      const trLeft = footer.createDiv({ cls: "dh-footer-trainings" });

      if (trainings.length > 0) {
        trLeft.createSpan({
          text: `Тренировки (${trainings.length}):`,
          attr: { style: "font-weight: 600; color: var(--text-normal);" }
        });
        trainings.forEach(p => {
          const a = trLeft.createEl("a", {
            cls: "internal-link dh-training-pill",
            text: p.название_тренировки || p.file.name,
            attr: { href: p.file.path }
          });
          a.onclick = e => {
            e.preventDefault();
            app.workspace.openLinkText(p.file.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
          };
        });
      }

      if (savedFocus !== null && savedFocus > 0) {
        const fPill = trLeft.createEl("button", {
          cls: "dh-training-pill",
          text: `Фокус: ${String(savedFocus).replace(".", ",")} ч`,
          attr: { type: "button", title: "Открыть таймер глубокой работы", style: "cursor: pointer; color: #9c83e8; border-color: rgba(156, 131, 232, 0.35);" }
        });
        fPill.onclick = () => openFocusTrackerFromHome();
      }

if (trainings.length > 0 && states.get("тренировка") !== true) {
        const syncBtn = actionButton(footer, "Вернуть отметку тренировки", async () => {
          setManualHabitOverride("тренировка", true, selectedISO);
          await saveField("тренировка", true);
          states.set("тренировка", true);
          habitPainters.get("тренировка")?.();
          updateHabitsSummary();
          syncBtn.remove();
        }, "dh-link-btn");
      }
    }
  }
}

// ========================================================
// 2.5. ОСТРОВ «ЦЕННОСТИ» (ЕЖЕДНЕВНЫЙ ВВОД + ФОКУС ИЗ my-values-compass)
// ========================================================
{
  const vcPlugin = getValuesCompassPlugin();
  const vcStore = vcPlugin?.store;

  if (vcStore) {
    const activeISO =
      typeof window.__dhHomeSelectedDateISO === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(window.__dhHomeSelectedDateISO)
        ? window.__dhHomeSelectedDateISO
        : todayISO;
    const isSelectedToday = activeISO === todayISO;

    const visibleDomains = vcStore.getDomains(false) || [];
    const focusDomains = vcStore.getFocusDomains() || [];
    const dayLogs = vcStore.getLogsByDate(activeISO) || [];
    const daySavoring = vcStore.getSavoringByDate(activeISO);

    if (!window.__dhValuesHomeUi) {
      window.__dhValuesHomeUi = { selectedDomainId: "", isNewStep: false };
    }
    const vcUi = window.__dhValuesHomeUi;

    if (!visibleDomains.some(d => d.id === vcUi.selectedDomainId)) {
      const fallback = focusDomains[0] || visibleDomains[0];
      vcUi.selectedDomainId = fallback ? fallback.id : "";
    }

    const root = dv.container.createDiv({ cls: "dh dh-values-island" });

    const vcStyle = root.createEl("style");
    vcStyle.textContent = `
    /* === Остров «Ценности» на главной (Velocity 2.1.0) === */
    .dashboard-home .dh-values-island {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: calc(var(--vl-layout-padding, 8px) * 2) calc(var(--vl-layout-padding, 8px) * 2 + 2px);
      margin: 0 0 22px 0 !important;
      border: none !important;
      border-radius: calc(var(--radius-ml, 14px) + 2px) !important;
      background: var(--trans-faint-05, var(--background-secondary)) !important;
      box-shadow:
        var(--glass-base-m, none),
        0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
        var(--shadow-setting-items, 0 4px 12px rgba(0, 0, 0, 0.1)) !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      box-sizing: border-box;
    }
    .dashboard-home .dh-values-island * {
      box-sizing: border-box;
    }
    .dashboard-home .dh-values-island button.dhv-btn {
      appearance: none;
      -webkit-appearance: none;
      border: none;
      outline: none;
      box-shadow: none;
      contain: content;
      margin: 0;
      padding: 0;
      background: transparent;
      color: var(--text-normal);
      font-family: var(--font-interface);
      font-size: 0.82rem;
      font-weight: var(--font-semi-medium, 500);
      line-height: 1.2;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition:
        background-color var(--anim-super-smooth, 75ms ease-out),
        color var(--anim-super-smooth, 75ms ease-out),
        box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
        filter var(--anim-super-smooth, 75ms ease-out);
    }

    /* Шапка острова */
    .dashboard-home .dhv-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 11px;
      border-bottom: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    }
    .dashboard-home .dhv-head-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dashboard-home .dhv-title {
      font-size: 0.98rem;
      font-weight: var(--font-semibold, 600);
      font-variation-settings: "opsz" 24;
      letter-spacing: -0.01em;
      color: var(--color-base-100, var(--text-normal));
    }
    .dashboard-home .dhv-count-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 7px;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--background-primary);
      box-shadow: 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
      font-size: 0.74rem;
      font-weight: var(--font-semibold, 600);
      font-variant-numeric: tabular-nums;
      color: var(--icon-color, var(--text-muted));
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dhv-date-note {
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      color: var(--text-faint);
    }
    .dashboard-home .dhv-nav {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .dashboard-home .dh-values-island button.dhv-nav-link {
      height: 28px;
      padding: 0 10px;
      border-radius: var(--radius-s, 8px);
      color: var(--icon-color, var(--text-muted));
      font-size: 0.79rem;
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dh-values-island button.dhv-nav-link:hover {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
    }
    .dashboard-home .dh-values-island button.dhv-nav-link:active {
      filter: opacity(65%);
    }
    .dashboard-home .dh-values-island button.dhv-icon-btn {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-xxl, 22px);
      color: var(--control-icon-color, var(--icon-color, var(--text-muted)));
      flex-shrink: 0;
    }
    .dashboard-home .dh-values-island button.dhv-icon-btn:hover {
      background: var(--control-icon-background, var(--background-modifier-hover));
      color: var(--text-normal);
      box-shadow: var(--control-icon-shadow, none);
    }
    .dashboard-home .dh-values-island button.dhv-icon-btn:active > svg {
      transform: scale3d(0.8, 0.8, 0.8);
    }

    /* Полоска фокуса (Level 2) */
    .dashboard-home .dhv-focus-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
    }
    .dashboard-home .dhv-focus-card {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 10px 13px;
      border-radius: var(--radius-sm, 10px);
      background: var(--background-primary);
      box-shadow:
        inset 2.5px 0 0 0 color-mix(in oklab, var(--interactive-accent) 85%, transparent),
        var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dhv-focus-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
    }
    .dashboard-home .dhv-focus-top:hover .dhv-focus-name {
      color: var(--color-accent-1, var(--text-accent));
    }
    .dashboard-home .dhv-focus-name-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .dashboard-home .dhv-focus-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--interactive-accent);
      flex-shrink: 0;
    }
    .dashboard-home .dhv-focus-name {
      font-size: 0.85rem;
      font-weight: var(--font-semibold, 600);
      color: var(--color-base-100, var(--text-normal));
      transition: color var(--anim-super-smooth, 75ms ease-out);
    }
    .dashboard-home .dhv-focus-arrow {
      font-size: 0.75rem;
      color: var(--text-faint);
    }
    .dashboard-home .dhv-focus-summary {
      font-size: 0.81rem;
      line-height: 1.42;
      color: var(--icon-color, var(--text-muted));
    }
    .dashboard-home .dhv-focus-steps {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 6px;
      border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    }
    .dashboard-home .dhv-step-item {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 0.8rem;
      color: var(--text-normal);
      cursor: pointer;
      min-height: 22px;
    }
    .dashboard-home .dhv-step-item input[type="checkbox"] {
      margin: 0;
      flex-shrink: 0;
      cursor: pointer;
    }

    /* Поле быстрого ввода и чипы сфер */
    .dashboard-home .dhv-composer {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .dashboard-home .dhv-composer-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px;
      margin: -3px;
    }
    .dashboard-home .dh-values-island input.dhv-input {
      flex: 1 1 auto;
      width: 100% !important;
      height: 34px !important;
      padding: 0 12px !important;
      border: none !important;
      outline: none !important;
      border-radius: var(--input-radius, var(--radius-s, 8px)) !important;
      background: var(--background-primary) !important;
      color: var(--text-normal) !important;
      font-family: var(--font-interface);
      font-size: 0.85rem !important;
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border))) !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition: box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
    }
    .dashboard-home .dh-values-island input.dhv-input:focus {
      box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent)) !important;
    }
    .dashboard-home .dh-values-island input.dhv-input::placeholder {
      color: var(--text-faint);
    }
    .dashboard-home .dh-values-island button.dhv-chip {
      height: 28px;
      padding: 0 11px;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--background-primary);
      color: var(--icon-color, var(--text-muted));
      font-size: 0.78rem;
      box-shadow: 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border));
      flex-shrink: 0;
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dh-values-island button.dhv-chip:hover {
      background: var(--interactive-hover);
      color: var(--text-normal);
    }
    .dashboard-home .dh-values-island button.dhv-chip.is-active {
      background: var(--color-accent-4, var(--background-modifier-active-hover));
      color: var(--color-accent-1, var(--text-accent));
      box-shadow:
        var(--glass-base, none),
        inset 0 0 0 1px var(--color-accent-3, var(--interactive-accent));
    }
    .dashboard-home .dh-values-island button.dhv-newstep-btn {
      height: 34px;
      padding: 0 11px;
    }
    .dashboard-home .dh-values-island button.dhv-submit-btn {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border-radius: var(--radius-s, 8px);
      background: var(--interactive-accent);
      color: var(--text-on-accent);
      box-shadow: var(--shadow-button, none);
    }
    .dashboard-home .dh-values-island button.dhv-submit-btn:hover {
      filter: brightness(1.0625);
    }
    .dashboard-home .dh-values-island button.dhv-submit-btn:active {
      filter: brightness(1.0625) opacity(70%);
    }
    .dashboard-home .dhv-chips-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .dashboard-home .dhv-suggest-strip {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 2px;
    }
    .dashboard-home .dhv-suggest-label {
      font-size: 0.74rem;
      font-weight: var(--font-semi-medium, 500);
      color: var(--text-faint);
      white-space: nowrap;
    }
    .dashboard-home .dh-values-island button.dhv-suggest-chip {
      height: 25px;
      padding: 0 9px;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--trans-faint-05, var(--background-primary));
      box-shadow: inset 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border));
      color: var(--icon-color, var(--text-muted));
      font-size: 0.75rem;
      max-width: 100%;
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dh-values-island button.dhv-suggest-chip:hover {
      background: var(--background-modifier-hover);
      color: var(--text-normal);
    }

    /* Лог записанных шагов (показывается только когда есть записи) */
    .dashboard-home .dhv-logs {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .dashboard-home .dhv-log-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 11px;
      border-radius: var(--radius-sm, 10px);
      background: var(--background-primary);
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dhv-log-body {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 7px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .dashboard-home .dhv-tag {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 8px;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--trans-faint-05, var(--background-secondary));
      box-shadow: 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
      font-size: 0.72rem;
      font-weight: var(--font-semi-medium, 500);
      color: var(--icon-color, var(--text-muted));
      flex-shrink: 0;
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dhv-newstep-tag {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 7px;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: color-mix(in oklab, var(--color-green, #4aab80) 16%, transparent);
      color: var(--color-green, #4aab80);
      font-size: 0.71rem;
      font-weight: var(--font-semi-medium, 500);
      flex-shrink: 0;
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
    }
    .dashboard-home .dhv-log-text {
      font-size: 0.84rem;
      line-height: 1.38;
      color: var(--text-normal);
      word-break: break-word;
    }
    .dashboard-home .dhv-log-del {
      opacity: 0.35;
    }
    .dashboard-home .dhv-log-item:hover .dhv-log-del {
      opacity: 1;
    }

    /* Нижняя строка: Момент присутствия (в рифму с «Главным событием») */
    .dashboard-home .dhv-savoring-row {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 11px 3px 3px;
      margin: 0 -3px -3px;
      border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    }
    .dashboard-home .dhv-savoring-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--font-ui-small, 13px);
      font-weight: var(--font-semi-medium, 500);
      color: var(--icon-color, var(--text-muted));
      white-space: nowrap;
    }
    .dashboard-home .dhv-savoring-saved {
      font-size: 0.72rem;
      color: var(--color-green, #4aab80);
      min-width: 10px;
    }

    /* Адаптация под узкие экраны и iPadOS */
    @media (max-width: 560px) {
      .dashboard-home .dhv-savoring-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .dashboard-home .dhv-composer-row {
        flex-wrap: wrap;
      }
      .dashboard-home .dhv-composer-row input.dhv-input {
        flex: 1 1 100%;
      }
    }
    body.is-mobile .dashboard-home .dh-values-island input.dhv-input,
    body.is-tablet .dashboard-home .dh-values-island input.dhv-input,
    body.is-mobile .dashboard-home .dh-values-island button.dhv-newstep-btn,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-newstep-btn,
    body.is-mobile .dashboard-home .dh-values-island button.dhv-submit-btn,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-submit-btn {
      height: 38px !important;
    }
    body.is-mobile .dashboard-home .dh-values-island button.dhv-submit-btn,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-submit-btn {
      width: 38px;
    }
    body.is-mobile .dashboard-home .dh-values-island button.dhv-chip,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-chip,
    body.is-mobile .dashboard-home .dh-values-island button.dhv-suggest-chip,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-suggest-chip {
      height: 34px;
      padding: 0 12px;
    }
    body.is-mobile .dashboard-home .dh-values-island button.dhv-nav-link,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-nav-link {
      height: 34px;
      padding: 0 11px;
    }
    body.is-mobile .dashboard-home .dh-values-island button.dhv-icon-btn,
    body.is-tablet .dashboard-home .dh-values-island button.dhv-icon-btn {
      width: 36px;
      height: 36px;
    }
    body.is-mobile .dashboard-home .dhv-log-del,
    body.is-tablet .dashboard-home .dhv-log-del {
      opacity: 0.8;
    }
    `;

    // --- Шапка ---
    const head = root.createDiv({ cls: "dhv-head" });
    const headLeft = head.createDiv({ cls: "dhv-head-left" });
    headLeft.createSpan({ cls: "dhv-title", text: "Ценности" });

    if (dayLogs.length > 0) {
      headLeft.createSpan({
        cls: "dhv-count-pill",
        text: String(dayLogs.length),
        attr: { title: "Записано действий за выбранный день" }
      });
    }
    if (!isSelectedToday) {
      const [yy, mm, dd] = activeISO.split("-");
      headLeft.createSpan({
        cls: "dhv-date-note",
        text: `за ${dd}.${mm}.${yy}`
      });
    }

    const nav = head.createDiv({ cls: "dhv-nav" });

    const mapBtn = nav.createEl("button", {
      cls: "dhv-btn dhv-nav-link",
      text: "Карта",
      attr: { type: "button", title: "Открыть Карту сфер и целей" }
    });
    mapBtn.onclick = () => openValuesCompassFromHome("map");

    const analyticsBtn = nav.createEl("button", {
      cls: "dhv-btn dhv-nav-link",
      text: "Динамика",
      attr: { type: "button", title: "Открыть Динамику и ритм" }
    });
    analyticsBtn.onclick = () => openValuesCompassFromHome("analytics");

    // --- Полоска активного фокуса ---
    if (focusDomains.length > 0) {
      const focusGrid = root.createDiv({ cls: "dhv-focus-list" });
      for (const domain of focusDomains) {
        const fCard = focusGrid.createDiv({ cls: "dhv-focus-card" });

        const fTop = fCard.createDiv({
          cls: "dhv-focus-top",
          attr: { title: "Открыть сферу на Карте" }
        });
        const nameWrap = fTop.createDiv({ cls: "dhv-focus-name-wrap" });
        nameWrap.createSpan({ cls: "dhv-focus-dot" });
        nameWrap.createSpan({ cls: "dhv-focus-name", text: domain.name });
        fTop.createSpan({ cls: "dhv-focus-arrow", text: "↗" });
        fTop.onclick = () => openValuesCompassFromHome("map", domain.id);

        if (domain.compassSummary) {
          fCard.createDiv({ cls: "dhv-focus-summary", text: domain.compassSummary });
        }

        // Ближайшие невыполненные шаги из immediate / short целей (макс. 4, чтобы не перегружать)
        const pendingSteps = [];
        const domainGoals = (vcStore.getGoalsByDomain(domain.id) || []).filter(
          g => g.status === "active" && (g.horizon === "immediate" || g.horizon === "short")
        );
        for (const g of domainGoals) {
          for (const s of g.steps || []) {
            if (!s.done) pendingSteps.push({ goal: g, step: s });
          }
        }

        if (pendingSteps.length > 0) {
          const stepsWrap = fCard.createDiv({ cls: "dhv-focus-steps" });
          for (const { goal, step } of pendingSteps.slice(0, 4)) {
            const label = stepsWrap.createEl("label", { cls: "dhv-step-item" });
            const cb = label.createEl("input", { attr: { type: "checkbox" } });
            label.createSpan({ text: step.text });
            cb.onchange = async () => {
              const nowDone = await vcStore.toggleGoalStep(goal.id, step.id);
              if (nowDone) {
                await vcStore.addLog({
                  domainId: domain.id,
                  goalId: goal.id,
                  text: step.text,
                  isNewStep: false,
                  date: activeISO
                });
                notify("Шаг выполнен и записан в ценности");
              }
            };
          }
        }
      }
    }

    // --- Быстрый ввод действия ---
    if (visibleDomains.length > 0) {
      const composer = root.createDiv({ cls: "dhv-composer" });
      const row = composer.createDiv({ cls: "dhv-composer-row" });

      const actionInput = row.createEl("input", {
        cls: "dhv-input",
        attr: {
          type: "text",
          placeholder: isSelectedToday
            ? "Что сделал сегодня в согласии со своими ценностями?"
            : "Записать ценностное действие за этот день..."
        }
      });

      const newStepBtn = row.createEl("button", {
        cls: "dhv-btn dhv-chip dhv-newstep-btn" + (vcUi.isNewStep ? " is-active" : ""),
        attr: { type: "button", title: "Отметить, если попробовал что-то новое" }
      });
      newStepBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg><span>Новый шаг</span>`;
      newStepBtn.onclick = () => {
        vcUi.isNewStep = !vcUi.isNewStep;
        newStepBtn.classList.toggle("is-active", vcUi.isNewStep);
      };

      const submitBtn = row.createEl("button", {
        cls: "dhv-btn dhv-submit-btn",
        attr: { type: "button", "aria-label": "Записать действие" }
      });
      submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

      const commitAction = async () => {
        const text = actionInput.value.trim();
        if (!text || !vcUi.selectedDomainId) return;
        actionInput.value = "";
        const isNew = vcUi.isNewStep;
        vcUi.isNewStep = false;
        await vcStore.addLog({
          domainId: vcUi.selectedDomainId,
          text,
          isNewStep: isNew,
          date: activeISO
        });
      };

      submitBtn.onclick = () => { void commitAction(); };
      actionInput.onkeydown = e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void commitAction();
        }
      };

      // Чипы сфер (фокусные первыми)
      const sortedDomains = [...visibleDomains].sort((a, b) =>
        a.isFocus === b.isFocus ? 0 : a.isFocus ? -1 : 1
      );
      const chipsWrap = composer.createDiv({ cls: "dhv-chips-strip" });
      for (const domain of sortedDomains) {
        const chip = chipsWrap.createEl("button", {
          cls: "dhv-btn dhv-chip" + (domain.id === vcUi.selectedDomainId ? " is-active" : ""),
          attr: { type: "button" }
        });
        if (domain.isFocus) chip.createSpan({ cls: "dhv-focus-dot" });
        chip.createSpan({ text: domain.name });
        chip.onclick = () => {
          vcUi.selectedDomainId = domain.id;
          chipsWrap.querySelectorAll(".dhv-chip").forEach(el => el.classList.remove("is-active"));
          chip.classList.add("is-active");
        };
      }

      // Однотаповые подсказки «Из дня:» (тренировки и фокус-сессии)
      const existingLogTexts = new Set(
        dayLogs.map(entry => String(entry.text || "").trim().toLowerCase())
      );
      const healthDomain = visibleDomains.find(d => /здоров|спорт|тело|физ/i.test(d.name || "")) || null;
      const suggestions = [];
      const seenSuggestions = new Set();

      const pushSuggestion = (text, domainId = null) => {
        const clean = String(text || "").trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (existingLogTexts.has(key) || seenSuggestions.has(key)) return;
        seenSuggestions.add(key);
        suggestions.push({ text: clean, domainId });
      };

      const vcDayTrainings = knowledgePages.filter(
        p => p.тип === "Тренировка" && asDate(p.дата)?.toISODate() === activeISO
      );
      for (const tr of vcDayTrainings) {
        const rawTitle = String(tr.название_тренировки || tr.file.name || "Тренировка").trim();
        const label = /^тренировк/i.test(rawTitle) ? rawTitle : `Тренировка: ${rawTitle}`;
        pushSuggestion(label, healthDomain ? healthDomain.id : null);
      }

      const vcDayNote = isSelectedToday
        ? todayNote
        : dv.pages('"Ежедневник"').array()
            .filter(p => {
              const d = asDate(p.дата) || asDate(p.file.name);
              return d && d.toISODate() === activeISO;
            })
            .sort((a, b) => mtime(b) - mtime(a) || a.file.path.localeCompare(b.file.path, "ru"))[0] || null;

      if (vcDayNote) {
        const vcDayFile = app.vault.getAbstractFileByPath(vcDayNote.file.path);
        const vcDayFm = vcDayFile ? (app.metadataCache.getFileCache(vcDayFile)?.frontmatter || {}) : {};
        const vcFocusMap = (vcDayFm.фокус_по_целям && typeof vcDayFm.фокус_по_целям === "object")
          ? vcDayFm.фокус_по_целям
          : {};
        const topFocusGoals = Object.entries(vcFocusMap)
          .map(([goal, mins]) => [String(goal || "").trim(), Math.round(Number(mins) || 0)])
          .filter(([goal, mins]) => goal && mins > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        if (topFocusGoals.length > 0) {
          for (const [goal, mins] of topFocusGoals) {
            pushSuggestion(`Фокус: ${goal} (${mins} мин)`, null);
          }
        } else {
          const focusHours = parseNum(vcDayNote.глубокая_работа_часов);
          if (focusHours !== null && focusHours > 0) {
            pushSuggestion(`Глубокая работа: ${String(focusHours).replace(".", ",")} ч`, null);
          }
        }
      }

      if (suggestions.length > 0) {
        const suggestStrip = composer.createDiv({ cls: "dhv-suggest-strip" });
        suggestStrip.createSpan({ cls: "dhv-suggest-label", text: "Из дня:" });

        for (const sug of suggestions) {
          const sBtn = suggestStrip.createEl("button", {
            cls: "dhv-btn dhv-suggest-chip",
            text: `+ ${sug.text}`,
            attr: {
              type: "button",
              title: "Записать в ценности в 1 клик"
            }
          });
          sBtn.onclick = async () => {
            const targetDomainId = sug.domainId || vcUi.selectedDomainId;
            if (!targetDomainId) return;
            sBtn.disabled = true;
            try {
              await vcStore.addLog({
                domainId: targetDomainId,
                text: sug.text,
                isNewStep: false,
                date: activeISO
              });
            } finally {
              if (sBtn.isConnected) sBtn.disabled = false;
            }
          };
        }
      }
    }

    // --- Список действий за день (без пустой заглушки, если 0) ---
    if (dayLogs.length > 0) {
      const logsWrap = root.createDiv({ cls: "dhv-logs" });
      for (const entry of dayLogs) {
        const domain = vcStore.getDomainById(entry.domainId);
        const item = logsWrap.createDiv({ cls: "dhv-log-item" });

        const body = item.createDiv({ cls: "dhv-log-body" });
        body.createSpan({ cls: "dhv-tag", text: domain?.name || "Сфера" });
        if (entry.isNewStep) {
          body.createSpan({ cls: "dhv-newstep-tag", text: "Новый шаг" });
        }
        body.createSpan({ cls: "dhv-log-text", text: entry.text });

        const delBtn = item.createEl("button", {
          cls: "dhv-btn dhv-icon-btn dhv-log-del",
          attr: { type: "button", title: "Удалить запись" }
        });
        delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        delBtn.onclick = () => { void vcStore.deleteLog(entry.id); };
      }
    }

    // --- Момент присутствия ---
    const savRow = root.createDiv({ cls: "dhv-savoring-row" });
    const savLabel = savRow.createDiv({ cls: "dhv-savoring-label" });
    savLabel.createSpan({ text: "Момент присутствия" });
    const savSaved = savLabel.createSpan({ cls: "dhv-savoring-saved" });

    const savInput = savRow.createEl("input", {
      cls: "dhv-input",
      attr: {
        type: "text",
        placeholder: "Что сегодня удалось по-настоящему заметить или прожить…"
      }
    });
    savInput.value = daySavoring?.text || "";

    const commitSavoring = async () => {
      const next = savInput.value.trim();
      const prev = daySavoring?.text || "";
      if (next === prev) return;
      await vcStore.saveSavoring(next, activeISO);
      savSaved.setText("✓");
      setTimeout(() => { if (savSaved.isConnected) savSaved.setText(""); }, 1600);
    };

    savInput.onblur = () => { void commitSavoring(); };
    savInput.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        savInput.blur();
      } else if (e.key === "Escape") {
        savInput.value = daySavoring?.text || "";
        savInput.blur();
      }
    };
  }
}

// ========================================================
// 3. ОСТРОВ «БЫСТРЫЙ ДОСТУП» (ЗАКРЕПЛЁННЫЕ ЗАМЕТКИ, СИНХРОН В _system/home-pins.json)
// ========================================================
{
  const PINS_FILE_PATH = "_system/home-pins.json";
  const PIN_COLORS = [
    { id: "accent", label: "Акцент", css: "var(--interactive-accent)" },
    { id: "blue", label: "Синий", css: "var(--color-blue, #599ed6)" },
    { id: "cyan", label: "Бирюзовый", css: "var(--color-cyan, #69b5aa)" },
    { id: "green", label: "Зелёный", css: "var(--color-green, #4aab80)" },
    { id: "orange", label: "Оранжевый", css: "var(--color-orange, #e5a158)" },
    { id: "purple", label: "Фиолетовый", css: "var(--color-purple, #9c83e8)" },
    { id: "red", label: "Красный", css: "var(--color-red, #d85b57)" }
  ];
  const colorById = id => (PIN_COLORS.find(c => c.id === id) || PIN_COLORS[0]).css;

  if (!window.__dhHomePinsState) {
    window.__dhHomePinsState = {
      loaded: false,
      loading: false,
      items: [],
      collapsed: true,
      editMode: false,
      formOpen: false,
      editingId: null,
      activeGroup: "all",
      draftColor: "accent"
    };
  }
  const pinState = window.__dhHomePinsState;
  if (typeof pinState.collapsed !== "boolean") pinState.collapsed = true;

  async function ensurePinsFolder() {
    const parts = PINS_FILE_PATH.split("/");
    parts.pop();
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      if (!(await app.vault.adapter.exists(acc))) {
        await app.vault.adapter.mkdir(acc);
      }
    }
  }

  async function persistPins() {
    try {
      await ensurePinsFolder();
      await app.vault.adapter.write(
        PINS_FILE_PATH,
        JSON.stringify({ version: 1, items: pinState.items }, null, 2)
      );
    } catch (err) {
      notify("Не удалось сохранить закладки: " + (err?.message || err));
    }
  }

  if (!pinState.loaded && !pinState.loading) {
    pinState.loading = true;
    (async () => {
      try {
        if (await app.vault.adapter.exists(PINS_FILE_PATH)) {
          const raw = await app.vault.adapter.read(PINS_FILE_PATH);
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.items)) {
            pinState.items = parsed.items;
          }
        }
      } catch (err) {
        console.log("[Home Pins] Load error:", err);
      } finally {
        pinState.loaded = true;
        pinState.loading = false;
        scheduleHomeRender(30);
      }
    })();
  }

  const root = dv.container.createDiv({
    cls: "dh dh-pins-island" + (pinState.collapsed ? " is-collapsed" : "")
  });

  const pinStyle = root.createEl("style");
  pinStyle.textContent = `
  /* === Остров «Быстрый доступ» (Velocity 2.1.0) === */
  .dashboard-home .dh-pins-island {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: calc(var(--vl-layout-padding, 8px) * 2) calc(var(--vl-layout-padding, 8px) * 2 + 2px);
    margin: 0 0 26px 0 !important;
    border: none !important;
    border-radius: calc(var(--radius-ml, 14px) + 2px) !important;
    background: var(--trans-faint-05, var(--background-secondary)) !important;
    box-shadow:
      var(--glass-base-m, none),
      0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
      var(--shadow-setting-items, 0 4px 12px rgba(0, 0, 0, 0.1)) !important;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    box-sizing: border-box;
  }
  .dashboard-home .dh-pins-island * {
    box-sizing: border-box;
  }
  .dashboard-home .dh-pins-island button.dhp-btn {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    outline: none;
    box-shadow: none;
    contain: content;
    margin: 0;
    padding: 0;
    background: transparent;
    color: var(--text-normal);
    font-family: var(--font-interface);
    font-size: 0.8rem;
    font-weight: var(--font-semi-medium, 500);
    line-height: 1.2;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      background-color var(--anim-super-smooth, 75ms ease-out),
      color var(--anim-super-smooth, 75ms ease-out),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
      filter var(--anim-super-smooth, 75ms ease-out);
  }
  .dashboard-home .dh-pins-island.is-collapsed {
    gap: 0;
  }
  .dashboard-home .dhp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-pins-island.is-collapsed .dhp-head {
    padding-bottom: 0;
    border-bottom: none;
  }
  .dashboard-home .dhp-head-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dashboard-home .dh-pins-island button.dhp-collapse-btn {
    min-height: 28px;
    padding: 0 6px 0 2px;
    border-radius: var(--radius-s, 8px);
    gap: 7px;
  }
  .dashboard-home .dh-pins-island button.dhp-collapse-btn:hover {
    background: var(--background-modifier-hover);
  }
  .dashboard-home .dhp-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--icon-color, var(--text-muted));
    transition: transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-pins-island.is-collapsed .dhp-chevron {
    transform: rotate(-90deg);
  }
  .dashboard-home .dhp-title {
    font-size: 0.98rem;
    font-weight: var(--font-semibold, 600);
    font-variation-settings: "opsz" 24;
    letter-spacing: -0.01em;
    color: var(--color-base-100, var(--text-normal));
  }
  .dashboard-home .dhp-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 7px;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    background: var(--background-primary);
    box-shadow: 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
    font-size: 0.74rem;
    font-weight: var(--font-semibold, 600);
    font-variant-numeric: tabular-nums;
    color: var(--icon-color, var(--text-muted));
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  .dashboard-home .dhp-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .dashboard-home .dh-pins-island button.dhp-action-btn {
    height: 28px;
    padding: 0 10px;
    border-radius: var(--radius-s, 8px);
    color: var(--icon-color, var(--text-muted));
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  .dashboard-home .dh-pins-island button.dhp-action-btn:hover,
  .dashboard-home .dh-pins-island button.dhp-action-btn.is-active {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  .dashboard-home .dh-pins-island button.dhp-icon-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-xxl, 22px);
    color: var(--control-icon-color, var(--icon-color, var(--text-muted)));
    flex-shrink: 0;
  }
  .dashboard-home .dh-pins-island button.dhp-icon-btn:hover,
  .dashboard-home .dh-pins-island button.dhp-icon-btn.is-active {
    background: var(--control-icon-background, var(--background-modifier-hover));
    color: var(--text-normal);
    box-shadow: var(--control-icon-shadow, none);
  }
  .dashboard-home .dh-pins-island button.dhp-icon-btn.is-danger:hover {
    color: var(--color-red, #d85b57);
  }

  /* Фильтр по группам */
  .dashboard-home .dhp-groups {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dashboard-home .dh-pins-island button.dhp-chip {
    height: 26px;
    padding: 0 10px;
    border-radius: var(--pill-radius, var(--radius-l, 18px));
    background: var(--background-primary);
    color: var(--icon-color, var(--text-muted));
    font-size: 0.76rem;
    box-shadow: 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border));
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  .dashboard-home .dh-pins-island button.dhp-chip:hover {
    background: var(--interactive-hover);
    color: var(--text-normal);
  }
  .dashboard-home .dh-pins-island button.dhp-chip.is-active {
    background: var(--color-accent-4, var(--background-modifier-active-hover));
    color: var(--color-accent-1, var(--text-accent));
    box-shadow:
      var(--glass-base, none),
      inset 0 0 0 1px var(--color-accent-3, var(--interactive-accent));
  }

  /* Сетка карточек */
  .dashboard-home .dhp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
  }
  .dashboard-home .dhp-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 48px;
    padding: 9px 12px;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow:
      inset 2.5px 0 0 0 color-mix(in oklab, var(--pin-color, var(--interactive-accent)) 85%, transparent),
      var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    cursor: pointer;
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
    transition:
      background-color var(--anim-super-smooth, 75ms ease-out),
      box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dhp-card:hover {
    background: color-mix(in oklab, var(--pin-color, var(--interactive-accent)) 7%, var(--background-primary));
    box-shadow:
      inset 2.5px 0 0 0 var(--pin-color, var(--interactive-accent)),
      0 0 0 0.5px color-mix(in oklab, var(--pin-color, var(--interactive-accent)) 45%, transparent);
  }
  .dashboard-home .dhp-card-main {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .dashboard-home .dhp-card-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--pin-color, var(--interactive-accent));
    flex-shrink: 0;
  }
  .dashboard-home .dhp-card-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .dashboard-home .dhp-card-title {
    font-size: 0.86rem;
    font-weight: var(--font-semibold, 600);
    line-height: 1.3;
    color: var(--color-base-100, var(--text-normal));
    overflow-wrap: anywhere;
  }
  .dashboard-home .dhp-card-sub {
    font-size: 0.72rem;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dhp-card-tools {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  /* Форма добавления / редактирования */
  .dashboard-home .dhp-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)));
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dhp-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .dashboard-home .dhp-form-row-meta {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
  }
  .dashboard-home .dhp-suggest-wrap {
    position: relative;
  }
  .dashboard-home .dh-pins-island input.dhp-input {
    width: 100% !important;
    height: 34px !important;
    padding: 0 11px !important;
    border: none !important;
    outline: none !important;
    border-radius: var(--input-radius, var(--radius-s, 8px)) !important;
    background: var(--trans-faint-05, var(--background-secondary)) !important;
    color: var(--text-normal) !important;
    font-family: var(--font-interface);
    font-size: 0.84rem !important;
    box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border))) !important;
    transition: box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
  }
  .dashboard-home .dh-pins-island input.dhp-input:focus {
    box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent)) !important;
  }
  .dashboard-home .dh-pins-island input.dhp-input::placeholder {
    color: var(--text-faint);
  }
  .dashboard-home .dhp-suggest-list {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 30;
    max-height: 210px;
    overflow-y: auto;
    scrollbar-width: none;
    padding: 4px;
    border-radius: var(--menu-radius, var(--radius-m, 12px));
    background: var(--modal-small-background, var(--background-primary-alt, var(--background-secondary)));
    backdrop-filter: var(--blur-m, blur(12px));
    -webkit-backdrop-filter: var(--blur-m, blur(12px));
    border: 1px solid var(--menu-border-color, var(--trans-faint-30, var(--background-modifier-border)));
    box-shadow: var(--glass-base-l, none), var(--menu-shadow, 0 10px 28px rgba(0, 0, 0, 0.28));
  }
  .dashboard-home .dhp-suggest-list::-webkit-scrollbar {
    display: none;
  }
  .dashboard-home .dhp-suggest-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 7px 10px;
    border-radius: var(--radius-xs, 6px);
    cursor: pointer;
  }
  .dashboard-home .dhp-suggest-item:hover {
    background: var(--background-modifier-hover);
  }
  .dashboard-home .dhp-suggest-name {
    font-size: 0.83rem;
    font-weight: var(--font-semi-medium, 500);
    color: var(--text-normal);
  }
  .dashboard-home .dhp-suggest-path {
    font-size: 0.72rem;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dhp-colors {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 2px;
  }
  .dashboard-home .dh-pins-island button.dhp-swatch {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--swatch-color);
    opacity: 0.72;
  }
  .dashboard-home .dh-pins-island button.dhp-swatch:hover {
    opacity: 1;
  }
  .dashboard-home .dh-pins-island button.dhp-swatch.is-active {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--background-primary), 0 0 0 3.5px var(--swatch-color);
  }
  .dashboard-home .dhp-form-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .dashboard-home .dh-pins-island button.dhp-btn-normal {
    height: 30px;
    padding: 0 12px;
    border-radius: var(--radius-s, 8px);
    background: var(--interactive-normal);
    color: var(--text-normal);
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  .dashboard-home .dh-pins-island button.dhp-btn-normal:hover {
    background: var(--interactive-hover);
  }
  .dashboard-home .dh-pins-island button.dhp-btn-cta {
    height: 30px;
    padding: 0 14px;
    border-radius: var(--radius-s, 8px);
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    box-shadow: var(--shadow-button, none);
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  .dashboard-home .dh-pins-island button.dhp-btn-cta:hover {
    filter: brightness(1.0625);
  }
  .dashboard-home .dhp-empty {
    padding: 12px 14px;
    border-radius: var(--radius-sm, 10px);
    background: var(--background-primary);
    box-shadow: inset 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
    font-size: 0.82rem;
    color: var(--text-faint);
  }

  @media (max-width: 620px) {
    .dashboard-home .dhp-form-row,
    .dashboard-home .dhp-form-row-meta {
      grid-template-columns: 1fr;
    }
  }
  body.is-mobile .dashboard-home .dh-pins-island input.dhp-input,
  body.is-tablet .dashboard-home .dh-pins-island input.dhp-input {
    height: 38px !important;
  }
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-collapse-btn,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-collapse-btn,
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-action-btn,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-action-btn,
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-btn-normal,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-btn-normal,
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-btn-cta,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-btn-cta,
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-chip,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-chip {
    height: 36px;
  }
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-icon-btn,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-icon-btn {
    width: 36px;
    height: 36px;
  }
  body.is-mobile .dashboard-home .dh-pins-island button.dhp-swatch,
  body.is-tablet .dashboard-home .dh-pins-island button.dhp-swatch {
    width: 24px;
    height: 24px;
  }
  `;

  // --- Шапка ---
  const head = root.createDiv({ cls: "dhp-head" });
  const headLeft = head.createDiv({ cls: "dhp-head-left" });
  const collapseBtn = headLeft.createEl("button", {
    cls: "dhp-btn dhp-collapse-btn",
    attr: {
      type: "button",
      "aria-expanded": String(!pinState.collapsed),
      title: pinState.collapsed ? "Развернуть «Быстрый доступ»" : "Свернуть «Быстрый доступ»"
    }
  });
  const chevronSpan = collapseBtn.createSpan({ cls: "dhp-chevron" });
  chevronSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  collapseBtn.createSpan({ cls: "dhp-title", text: "Быстрый доступ" });
  if (pinState.items.length > 0) {
    collapseBtn.createSpan({ cls: "dhp-count", text: String(pinState.items.length) });
  }
  collapseBtn.onclick = () => {
    pinState.collapsed = !pinState.collapsed;
    if (pinState.collapsed) {
      pinState.editMode = false;
      pinState.formOpen = false;
      pinState.editingId = null;
    }
    renderHomeDashboard();
  };

  const headActions = head.createDiv({ cls: "dhp-head-actions" });

  if (!pinState.collapsed && pinState.items.length > 0) {
    const editToggle = headActions.createEl("button", {
      cls: "dhp-btn dhp-action-btn" + (pinState.editMode ? " is-active" : ""),
      text: pinState.editMode ? "Готово" : "Изменить",
      attr: { type: "button" }
    });
    editToggle.onclick = () => {
      pinState.editMode = !pinState.editMode;
      if (!pinState.editMode) {
        pinState.formOpen = false;
        pinState.editingId = null;
      }
      renderHomeDashboard();
    };
  }

  const addBtn = headActions.createEl("button", {
    cls: "dhp-btn dhp-action-btn" + (!pinState.collapsed && pinState.formOpen && !pinState.editingId ? " is-active" : ""),
    text: "+ Заметка",
    attr: { type: "button" }
  });
  addBtn.onclick = () => {
    if (pinState.collapsed) {
      pinState.collapsed = false;
      pinState.formOpen = true;
      pinState.editingId = null;
      pinState.draftColor = "accent";
    } else if (pinState.formOpen && !pinState.editingId) {
      pinState.formOpen = false;
    } else {
      pinState.formOpen = true;
      pinState.editingId = null;
      pinState.draftColor = "accent";
    }
    renderHomeDashboard();
  };

  if (!pinState.collapsed) {
  // --- Форма добавления / редактирования ---
  if (pinState.formOpen) {
    const editingItem = pinState.editingId
      ? pinState.items.find(i => i.id === pinState.editingId) || null
      : null;
    if (editingItem) pinState.draftColor = editingItem.color || "accent";

    const form = root.createDiv({ cls: "dhp-form" });

    const row1 = form.createDiv({ cls: "dhp-form-row" });

    const suggestWrap = row1.createDiv({ cls: "dhp-suggest-wrap" });
    const pathInput = suggestWrap.createEl("input", {
      cls: "dhp-input",
      attr: { type: "text", placeholder: "Найти заметку в хранилище…" }
    });
    pathInput.value = editingItem?.path || "";

    const titleInput = row1.createEl("input", {
      cls: "dhp-input",
      attr: { type: "text", placeholder: "Название на карточке" }
    });
    titleInput.value = editingItem?.title || "";

    const suggestList = suggestWrap.createDiv({ cls: "dhp-suggest-list" });
    suggestList.style.display = "none";

    const updateSuggestions = () => {
      const q = pathInput.value.trim().toLowerCase();
      const files = app.vault.getMarkdownFiles();
      const matches = (q
        ? files.filter(f =>
            f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
          )
        : files
      )
        .sort((a, b) => {
          if (q) {
            const aStarts = a.basename.toLowerCase().startsWith(q) ? 0 : 1;
            const bStarts = b.basename.toLowerCase().startsWith(q) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
          }
          return (b.stat?.mtime || 0) - (a.stat?.mtime || 0);
        })
        .slice(0, 6);

      suggestList.replaceChildren();
      if (matches.length === 0) {
        suggestList.style.display = "none";
        return;
      }

      matches.forEach(file => {
        const opt = suggestList.createDiv({ cls: "dhp-suggest-item" });
        opt.createDiv({ cls: "dhp-suggest-name", text: file.basename });
        opt.createDiv({ cls: "dhp-suggest-path", text: file.path });
        opt.onmousedown = e => {
          e.preventDefault();
          pathInput.value = file.path;
          if (!titleInput.value.trim()) titleInput.value = file.basename;
          suggestList.style.display = "none";
          titleInput.focus();
        };
      });
      suggestList.style.display = "block";
    };

    pathInput.onfocus = updateSuggestions;
    pathInput.oninput = updateSuggestions;
    pathInput.onblur = () => {
      setTimeout(() => { if (suggestList.isConnected) suggestList.style.display = "none"; }, 120);
    };

    const row2 = form.createDiv({ cls: "dhp-form-row-meta" });
    const groupInput = row2.createEl("input", {
      cls: "dhp-input",
      attr: { type: "text", placeholder: "Группа (например: Dev, Учёба)" }
    });
    groupInput.value = editingItem?.group || "";

    const colorsWrap = row2.createDiv({ cls: "dhp-colors" });
    PIN_COLORS.forEach(col => {
      const sw = colorsWrap.createEl("button", {
        cls: "dhp-btn dhp-swatch" + (pinState.draftColor === col.id ? " is-active" : ""),
        attr: { type: "button", title: col.label }
      });
      sw.style.setProperty("--swatch-color", col.css);
      sw.onclick = () => {
        pinState.draftColor = col.id;
        colorsWrap.querySelectorAll(".dhp-swatch").forEach(el => el.classList.remove("is-active"));
        sw.classList.add("is-active");
      };
    });

    const footer = form.createDiv({ cls: "dhp-form-footer" });
    const cancelBtn = footer.createEl("button", {
      cls: "dhp-btn dhp-btn-normal",
      text: "Отмена",
      attr: { type: "button" }
    });
    cancelBtn.onclick = () => {
      pinState.formOpen = false;
      pinState.editingId = null;
      renderHomeDashboard();
    };

    const saveBtn = footer.createEl("button", {
      cls: "dhp-btn dhp-btn-cta",
      text: editingItem ? "Сохранить" : "Добавить",
      attr: { type: "button" }
    });

    const submitPin = async () => {
      const pathVal = pathInput.value.trim();
      const titleVal = titleInput.value.trim() || pathVal.replace(/\.md$/i, "").split("/").pop() || "";
      if (!pathVal || !titleVal) {
        notify("Выбери заметку и укажи название");
        return;
      }

      const payload = {
        id: editingItem ? editingItem.id : "pin_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        title: titleVal,
        path: pathVal,
        group: groupInput.value.trim(),
        color: pinState.draftColor || "accent"
      };

      if (editingItem) {
        const idx = pinState.items.findIndex(i => i.id === editingItem.id);
        if (idx !== -1) pinState.items[idx] = payload;
      } else {
        pinState.items.push(payload);
      }

      pinState.formOpen = false;
      pinState.editingId = null;
      await persistPins();
      renderHomeDashboard();
    };

    saveBtn.onclick = () => { void submitPin(); };
    titleInput.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); void submitPin(); }
    };
    groupInput.onkeydown = e => {
      if (e.key === "Enter") { e.preventDefault(); void submitPin(); }
    };

    requestAnimationFrame(() => {
      if (editingItem) titleInput.focus();
      else pathInput.focus();
    });
  }

  // --- Группы-фильтры (показываются только если заданы группы) ---
  const uniqueGroups = [...new Set(pinState.items.map(i => i.group).filter(Boolean))];
  if (pinState.activeGroup !== "all" && !uniqueGroups.includes(pinState.activeGroup)) {
    pinState.activeGroup = "all";
  }

  if (uniqueGroups.length > 0) {
    const groupsRow = root.createDiv({ cls: "dhp-groups" });
    const allChip = groupsRow.createEl("button", {
      cls: "dhp-btn dhp-chip" + (pinState.activeGroup === "all" ? " is-active" : ""),
      text: "Все",
      attr: { type: "button" }
    });
    allChip.onclick = () => {
      pinState.activeGroup = "all";
      renderHomeDashboard();
    };

    uniqueGroups.forEach(grp => {
      const chip = groupsRow.createEl("button", {
        cls: "dhp-btn dhp-chip" + (pinState.activeGroup === grp ? " is-active" : ""),
        text: grp,
        attr: { type: "button" }
      });
      chip.onclick = () => {
        pinState.activeGroup = grp;
        renderHomeDashboard();
      };
    });
  }

  // --- Сетка карточек ---
  const visiblePins = pinState.activeGroup === "all"
    ? pinState.items
    : pinState.items.filter(i => i.group === pinState.activeGroup);

  if (pinState.items.length === 0 && !pinState.formOpen) {
    root.createDiv({
      cls: "dhp-empty",
      text: "Закрепи заметки, к которым часто возвращаешься (например, команды релиза плагинов)."
    });
  } else if (visiblePins.length > 0) {
    const grid = root.createDiv({ cls: "dhp-grid" });

    visiblePins.forEach(item => {
      const card = grid.createDiv({
        cls: "dhp-card",
        attr: { title: item.path }
      });
      card.style.setProperty("--pin-color", colorById(item.color));

      card.onclick = e => {
        if (pinState.editMode) return;
        app.workspace.openLinkText(item.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      const main = card.createDiv({ cls: "dhp-card-main" });
      main.createSpan({ cls: "dhp-card-dot" });

      const textWrap = main.createDiv({ cls: "dhp-card-text" });
      textWrap.createDiv({ cls: "dhp-card-title", text: item.title });
      if (item.group && pinState.activeGroup === "all") {
        textWrap.createDiv({ cls: "dhp-card-sub", text: item.group });
      }

      if (pinState.editMode) {
        const tools = card.createDiv({ cls: "dhp-card-tools" });
        const fullIdx = pinState.items.findIndex(x => x.id === item.id);

        if (fullIdx > 0) {
          const leftBtn = tools.createEl("button", {
            cls: "dhp-btn dhp-icon-btn",
            text: "‹",
            attr: { type: "button", title: "Сдвинуть влево" }
          });
          leftBtn.onclick = async e => {
            e.stopPropagation();
            const tmp = pinState.items[fullIdx - 1];
            pinState.items[fullIdx - 1] = pinState.items[fullIdx];
            pinState.items[fullIdx] = tmp;
            await persistPins();
            renderHomeDashboard();
          };
        }

        if (fullIdx !== -1 && fullIdx < pinState.items.length - 1) {
          const rightBtn = tools.createEl("button", {
            cls: "dhp-btn dhp-icon-btn",
            text: "›",
            attr: { type: "button", title: "Сдвинуть вправо" }
          });
          rightBtn.onclick = async e => {
            e.stopPropagation();
            const tmp = pinState.items[fullIdx + 1];
            pinState.items[fullIdx + 1] = pinState.items[fullIdx];
            pinState.items[fullIdx] = tmp;
            await persistPins();
            renderHomeDashboard();
          };
        }

        const editBtn = tools.createEl("button", {
          cls: "dhp-btn dhp-icon-btn",
          attr: { type: "button", title: "Редактировать" }
        });
        editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
        editBtn.onclick = e => {
          e.stopPropagation();
          pinState.formOpen = true;
          pinState.editingId = item.id;
          renderHomeDashboard();
        };

        const delBtn = tools.createEl("button", {
          cls: "dhp-btn dhp-icon-btn is-danger",
          attr: { type: "button", title: "Удалить" }
        });
        delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        delBtn.onclick = async e => {
          e.stopPropagation();
          pinState.items = pinState.items.filter(x => x.id !== item.id);
          if (pinState.editingId === item.id) {
            pinState.editingId = null;
            pinState.formOpen = false;
          }
          if (pinState.items.length === 0) pinState.editMode = false;
          await persistPins();
          renderHomeDashboard();
        };
      }
    });
  }
  }
}

  if (scroller) {
    requestAnimationFrame(() => {
      if (scroller.isConnected) scroller.scrollTop = prevScrollTop;
    });
  }
}

// Первый рендер
renderHomeDashboard();

// Если Obsidian только что запустился и Dataview/MetadataCache ещё не проиндексировали файлы — ждём готовности
if (!isIndexReady()) {
  let attempts = 0;
  bootPollTimer = setInterval(() => {
    attempts++;
    if (!hostContainer || !hostContainer.isConnected) {
      clearInterval(bootPollTimer);
      return;
    }
    if (isIndexReady() || attempts >= 25) {
      clearInterval(bootPollTimer);
      renderHomeDashboard();
    }
  }, 250);
}

// Самоочищающаяся подписка на готовность кэша и изменения заметок (не требует перезахода на главную)
if (!hostContainer.dataset.dhHomeBound) {
  hostContainer.dataset.dhHomeBound = "1";

  const onResolved = () => {
    if (!hostContainer.isConnected) {
      app.metadataCache.off("resolved", onResolved);
      return;
    }
    scheduleHomeRender(100);
  };

  const onFileChanged = (file) => {
    if (!hostContainer.isConnected) {
      app.vault.off("create", onFileChanged);
      app.vault.off("delete", onFileChanged);
      app.vault.off("rename", onFileChanged);
      return;
    }
    if (file && file.extension && file.extension !== "md") return;
    // Не перерисовываем во время активного ввода текста в поле главной или в острове ценностей
    if (window.__dhTodayDrafts?.activeKey && document.activeElement?.closest?.(".dh-today")) return;
    if (document.activeElement?.closest?.(".dh-values-island")) return;
    if (document.activeElement?.closest?.(".dh-pins-island")) return;
    scheduleHomeRender(220);
  };

  app.metadataCache.on("resolved", onResolved);
  app.vault.on("create", onFileChanged);
  app.vault.on("delete", onFileChanged);
  app.vault.on("rename", onFileChanged);

  const vcPlugin = app.plugins?.plugins?.["my-values-compass"];
  if (vcPlugin?.store?.subscribe) {
    let unsubVc = null;
    unsubVc = vcPlugin.store.subscribe(() => {
      if (!hostContainer.isConnected) {
        unsubVc?.();
        return;
      }
      scheduleHomeRender(150);
    });
  }
}
