// ========================================================
// ОБЩИЕ ДАННЫЕ, АВТОСИНХРОНИЗАЦИЯ И УТИЛИТЫ (ГЛАВНАЯ v2.5: автообновление при старте и изменении файлов)
// ========================================================
const AUTO_SLEEP_MIN_HOURS = 6;   // Сон > 6 часов автоматически отмечает «Режим сна»
const SOCIAL_LIMIT_MIN = 30;       // Лимит дофаминового скроллинга соцсетей (мин)
const BOOKS_FOLDER = "Знания/Книги";
const SHARED_READING_STATE_KEY = "dh_shared_book_reading_v2";
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

function openValuesCompassFromHome() {
  const plugin = getValuesCompassPlugin();
  if (!plugin || typeof plugin.activateView !== "function") {
    notify("Включи плагин «Values Compass» (my-values-compass) в настройках Obsidian.");
    return;
  }
  try {
    plugin.activateView("today");
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

const nutPlugin = getNutritionPlugin();
const rawCalorieGoal = nutPlugin?.settings ? nutPlugin.settings.dailyCalorieGoal : null;
const calorieGoal = typeof rawCalorieGoal === "number" && rawCalorieGoal > 0 ? Math.round(rawCalorieGoal) : null;

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

/**
 * ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ ДЛЯ ПРОЧИТАННЫХ СТРАНИЦ ЗА СЕГОДНЯ (общий для home.js и english.js).
 * - Считает чистый прирост `autoBookPages` по книгам в `Знания/Книги` за сегодня.
 * - Не накапливает старую разницу за пропущенные дни: если книга не читалась сегодня, её база = текущему `прочитано`.
 * - Не складывает ручной ввод с авто-страницами: `manualOverridePages` используется ТОЛЬКО если пользователь
 *   явно ввёл своё число в поле «Чтение» за сегодня. Иначе приоритет у точного числа `autoBookPages`.
 */
function syncTodayBookReading() {
  let bookPages = [];
  try {
    bookPages = dv.pages('"' + BOOKS_FOLDER + '"').array();
  } catch {
    bookPages = [];
  }

  let state = null;
  try {
    const raw = window.localStorage?.getItem(SHARED_READING_STATE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch {}

  if (!state || typeof state !== "object") {
    state = { dateISO: "", baselines: {}, snapshotDateISO: "", snapshotValues: {}, manualOverridePages: null };
  }
  if (!state.baselines || typeof state.baselines !== "object") state.baselines = {};
  if (!state.snapshotValues || typeof state.snapshotValues !== "object") state.snapshotValues = {};

  // Читаем актуальные значения книг из metadataCache
  const currentBooks = [];
  for (const p of bookPages) {
    const f = app.vault.getAbstractFileByPath(p.file.path);
    const fm = f ? (app.metadataCache.getFileCache(f)?.frontmatter || {}) : {};
    const status = String(fm.статус ?? p.статус ?? "").trim();
    const totalRaw = parseNum(fm.страниц ?? p.страниц);
    const readRaw = parseNum(fm.прочитано ?? p.прочитано);
    if (readRaw === null && totalRaw === null) continue;

    const total = totalRaw !== null && totalRaw > 0 ? Math.round(totalRaw) : null;
    let curRead = readRaw !== null && readRaw >= 0 ? Math.round(readRaw) : 0;
    const isFinished = status === "Прочитано" || (total !== null && curRead >= total);
    if (isFinished && total !== null) curRead = total;

    const title = String(fm.название ?? p.название ?? p.file.name).trim();
    const lastReadISO = asDate(fm.последнее_чтение ?? p.последнее_чтение)?.toISODate() || "";
    const posTimeRaw = String(fm.позиция_время ?? p.позиция_время ?? "").trim();
    const posDateISO = /^\d{4}-\d{2}-\d{2}/.test(posTimeRaw) ? posTimeRaw.slice(0, 10) : "";
    const touchedToday = lastReadISO === todayISO || posDateISO === todayISO;
    const createdToday = Boolean(f?.stat && f.stat.ctime >= today.toMillis());

    currentBooks.push({
      path: p.file.path,
      title,
      curRead,
      isFinished,
      touchedToday,
      createdToday
    });
  }

  // Переход на новый день: формируем утреннюю базу строго без приписывания старых дней
  if (state.dateISO !== todayISO) {
    const nextBaselines = {};
    const hasYesterdaySnapshot = state.snapshotDateISO === yesterdayISO;

    for (const b of currentBooks) {
      const snapVal = state.snapshotValues[b.path];
      if (hasYesterdaySnapshot && typeof snapVal === "number" && Number.isFinite(snapVal)) {
        nextBaselines[b.path] = Math.min(snapVal, b.curRead);
      } else if (b.touchedToday && typeof snapVal === "number" && Number.isFinite(snapVal)) {
        nextBaselines[b.path] = Math.min(snapVal, b.curRead);
      } else if (!b.isFinished && b.createdToday && b.touchedToday) {
        nextBaselines[b.path] = 0;
      } else {
        // Если книгу не открывали сегодня и нет вчерашнего снимка — база равна текущему прочитанному
        nextBaselines[b.path] = b.curRead;
      }
    }

    state.dateISO = todayISO;
    state.baselines = nextBaselines;
    state.manualOverridePages = null;
  }

  let autoBookPages = 0;
  const readBookTitles = [];
  const nextSnapshotValues = {};

  for (const b of currentBooks) {
    let baseVal = state.baselines[b.path];
    if (typeof baseVal !== "number" || !Number.isFinite(baseVal)) {
      baseVal = !b.isFinished && b.createdToday ? 0 : b.curRead;
      state.baselines[b.path] = baseVal;
    } else if (b.curRead < baseVal) {
      // Если в читалке откатились назад или сменили шрифт в меньшую сторону — подтягиваем базу вниз
      baseVal = b.curRead;
      state.baselines[b.path] = baseVal;
    } else if (!b.touchedToday && b.curRead > baseVal && state.snapshotDateISO !== todayISO && state.snapshotDateISO !== yesterdayISO) {
      // Защита от ложного скачка у книг, которые сегодня вообще не открывались
      baseVal = b.curRead;
      state.baselines[b.path] = baseVal;
    }

    const delta = Math.max(0, b.curRead - baseVal);
    if (delta > 0) {
      autoBookPages += delta;
      readBookTitles.push(`${b.title} (+${delta})`);
    } else if (b.touchedToday && !readBookTitles.includes(b.title)) {
      readBookTitles.push(b.title);
    }

    nextSnapshotValues[b.path] = b.curRead;
  }

  state.snapshotDateISO = todayISO;
  state.snapshotValues = nextSnapshotValues;

  const manualOverridePages =
    typeof state.manualOverridePages === "number" &&
    Number.isFinite(state.manualOverridePages) &&
    state.manualOverridePages >= 0
      ? Math.round(state.manualOverridePages)
      : null;

  try {
    window.localStorage?.setItem(SHARED_READING_STATE_KEY, JSON.stringify(state));
  } catch {}

  const effectivePages =
    manualOverridePages !== null
      ? manualOverridePages
      : autoBookPages > 0
        ? autoBookPages
        : null;

  return {
    autoBookPages,
    manualOverridePages,
    effectivePages,
    readBookTitles
  };
}

function setManualReadingOverride(pagesOrNull) {
  try {
    const raw = window.localStorage?.getItem(SHARED_READING_STATE_KEY);
    const state = raw ? JSON.parse(raw) : { dateISO: todayISO, baselines: {}, snapshotDateISO: todayISO, snapshotValues: {} };
    state.dateISO = todayISO;
    state.manualOverridePages =
      typeof pagesOrNull === "number" && Number.isFinite(pagesOrNull) && pagesOrNull >= 0
        ? Math.round(pagesOrNull)
        : null;
    window.localStorage?.setItem(SHARED_READING_STATE_KEY, JSON.stringify(state));
  } catch {}
}

const readingSync = syncTodayBookReading();
window.__dhSyncTodayBookReading = syncTodayBookReading;

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
  const pagesDoneToday = readingSync.effectivePages ?? parseNum(todayNote?.страниц_прочитано) ?? 0;
  let englishBadge = "";
  if (cardsDoneToday > 0 && pagesDoneToday > 0) {
    englishBadge = `${cardsDoneToday} карт. · ${pagesDoneToday} стр.`;
  } else if (cardsDoneToday > 0) {
    englishBadge = `${cardsDoneToday} карт.`;
  } else if (pagesDoneToday > 0) {
    englishBadge = `${pagesDoneToday} стр.`;
  }

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
    },
    {
      title: "Ценности",
      icon: "🧭",
      color: "var(--color-cyan, #69b5aa)",
      badge: (() => {
        const count = getValuesCompassPlugin()?.store?.getLogsByDate?.(todayISO)?.length || 0;
        return count > 0 ? String(count) : "";
      })(),
      onClick: () => openValuesCompassFromHome()
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

  /* === Блок «Недавно в работе» (Velocity Table + Island) === */
  .dashboard-home .dh-recent-work {
    margin: 15px 0 25px 0;
  }
  .dashboard-home .dh-recent-work details.dh-recent-details {
    padding: calc(var(--vl-layout-padding, 8px) + 6px) calc(var(--vl-layout-padding, 8px) + 10px);
    background: var(--setting-item-background, var(--background-secondary));
    border: none;
    border-radius: calc(var(--radius-ml, 14px) + 2px);
    box-shadow: var(--shadow-setting-items, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
    -electron-corner-smoothing: var(--corner-smoothing, 60%);
  }
  .dashboard-home .dh-recent-work details.dh-recent-details > summary {
    list-style: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }
  .dashboard-home .dh-recent-work details.dh-recent-details > summary::-webkit-details-marker {
    display: none;
  }
  .dashboard-home .dh-recent-work details.dh-recent-details[open] > summary {
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--trans-faint-20, var(--background-modifier-border));
  }
  .dashboard-home .dh-recent-title {
    font-size: var(--font-ui-medium, 15px);
    font-weight: var(--font-semibold, 600);
    font-variation-settings: "opsz" 24;
    color: var(--color-base-100, var(--text-normal));
  }
  .dashboard-home .dh-recent-toggle {
    font-size: 0.76rem;
    font-weight: var(--font-semi-medium, 500);
    color: var(--icon-color, var(--text-muted));
  }
  .dashboard-home .dh-recent-empty {
    font-size: 0.85rem;
    color: var(--text-muted);
    padding: 12px;
    text-align: center;
  }
  .dashboard-home table.dh-recent-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--table-text-size, 0.86rem);
  }
  .dashboard-home table.dh-recent-table thead th {
    border: none;
    border-bottom: 2px solid var(--table-header-border-color, var(--hr-color, var(--background-modifier-border)));
    padding: 6px 10px;
    text-align: start;
    color: var(--table-header-color, var(--icon-color));
    font-size: var(--font-ui-smaller, 12px);
    font-weight: var(--table-header-weight, var(--font-medium));
  }
  .dashboard-home table.dh-recent-table thead th:last-child {
    width: 140px;
    text-align: end;
  }
  .dashboard-home table.dh-recent-table tbody tr {
    cursor: pointer;
    transition: background-color var(--anim-super-smooth, 75ms ease-out);
  }
  .dashboard-home table.dh-recent-table tbody tr:nth-child(even) {
    background: var(--table-row-bg, var(--trans-faint-00, transparent));
  }
  .dashboard-home table.dh-recent-table tbody tr:hover {
    background: var(--background-modifier-hover);
  }
  .dashboard-home table.dh-recent-table tbody td {
    border: none;
    border-left: 1px solid var(--table-border-color, var(--trans-faint-20, var(--background-modifier-border)));
    padding: 8px 10px;
  }
  .dashboard-home table.dh-recent-table tbody td:first-child {
    border-left: none;
    font-weight: var(--font-semi-medium, 500);
  }
  .dashboard-home table.dh-recent-table tbody td a.internal-link {
    color: var(--color-accent-1, var(--text-accent));
    text-decoration: none;
  }
  .dashboard-home table.dh-recent-table tbody td.dh-recent-time {
    text-align: end;
    color: var(--text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* === Адаптивность и iPadOS / Touch === */
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

    // Правило приоритета для страниц за сегодня:
    // 1) Если пользователь ввёл ручное значение за сегодня (manualOverridePages !== null) — берём его.
    // 2) Иначе если есть автоматические страницы из книг (autoBookPages > 0) — берём ТОЧНОЕ число autoBookPages
    //    (даже если в заметке ранее застряло завышенное число).
    // 3) Иначе оставляем текущее значение из заметки (или null, если пусто).
let effectivePages = savedPages;
    if (isToday) {
      if (readingSync.manualOverridePages !== null) {
        effectivePages = readingSync.manualOverridePages;
      } else if (readingSync.autoBookPages > 0) {
        effectivePages = readingSync.autoBookPages;
      }
    }

    const focusByGoalsMap = (fmCache.фокус_по_целям && typeof fmCache.фокус_по_целям === "object")
      ? fmCache.фокус_по_целям
      : {};

    const states = new Map(HABITS.map(h => [h.key, typeof note[h.key] === "boolean" ? note[h.key] : null]));
    const pendingPatch = {};

    if (isToday) {
      // 1. Автосинхронизация страниц чтения из книг и привычки «Чтение»
      if (effectivePages !== null && effectivePages !== savedPages) {
        pendingPatch.страниц_прочитано = effectivePages;
      }
      if ((effectivePages !== null && effectivePages > 0) || readingSync.readBookTitles.length > 0) {
        if (manualOverrides.чтение === undefined && states.get("чтение") !== true) {
          states.set("чтение", true);
          pendingPatch.чтение = true;
        }
      }

      // 2. Автосинхронизация привычки «Тренировка» при наличии сессии за сегодня
      if (trainings.length > 0 && manualOverrides.тренировка === undefined && states.get("тренировка") !== true) {
        states.set("тренировка", true);
        pendingPatch.тренировка = true;
      }

      // 3. Автосинхронизация привычки «Диета»
      if (calorieGoal !== null && savedCalories !== null && savedCalories >= calorieGoal && manualOverrides.диета === undefined && states.get("диета") !== true) {
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

      let subHintEl = null;
      if (m.hint) {
        subHintEl = card.createDiv({ cls: "dh-metric-subhint", text: m.hint });
        if (m.key === "страниц_прочитано" && readingSync.readBookTitles.length > 0) {
          subHintEl.setAttribute("title", "Книги сегодня: " + readingSync.readBookTitles.join(", "));
        }
      }

      const errorEl = card.createDiv({ cls: "dh-metric-error" });
      errorEl.style.display = "none";

const savedRaw = m.key === "страниц_прочитано" ? effectivePages : note[m.key];
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
          if (savedFormatted === "" && (!isToday || m.key !== "страниц_прочитано" || readingSync.manualOverridePages === null)) return;

          isSavingMetric = true;
          try {
if (isToday && m.key === "страниц_прочитано") {
              setManualReadingOverride(null);
              const fallbackPages = readingSync.autoBookPages > 0 ? readingSync.autoBookPages : null;
              input.value = fallbackPages !== null ? formatNumForInput(fallbackPages, 0) : "";
              syncMetricInputWidth(input, m.placeholder);
              if (subHintEl) {
                subHintEl.setText(readingSync.autoBookPages > 0 ? `из книг: ${readingSync.autoBookPages} стр.` : "авто из читалки");
              }
              await saveField(m.key, fallbackPages);
            } else {
              syncMetricInputWidth(input, m.placeholder);
              await saveField(m.key, null);
            }
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
          if (isToday) {
            if (readingSync.autoBookPages > 0 && finalValue === readingSync.autoBookPages) {
              setManualReadingOverride(null);
              if (subHintEl) subHintEl.setText(`из книг: ${readingSync.autoBookPages} стр.`);
            } else if (finalValue !== savedRaw) {
              setManualReadingOverride(finalValue);
              if (subHintEl) {
                subHintEl.setText(
                  readingSync.autoBookPages > 0
                    ? `вручную (из книг: ${readingSync.autoBookPages} стр.)`
                    : "введено вручную"
                );
              }
            }
          }
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

    if (goalsState.length > 0) {
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
        planMeta.setText(`${avgPct}% · выполнено ${doneG} из ${totalG}`);
        barFill.style.width = `${avgPct}%`;
        barFill.style.background = avgPct === 100 ? "#4aab80" : avgPct >= 60 ? "#599ed6" : "#e5a158";
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
// 3. БЛОК «НЕДАВНО В РАБОТЕ» (РАСКРЫВАЮЩИЙСЯ СПИСОК)
// ========================================================
{
  const LIMIT = 8;

  if (!window.__dhRecentWorkState) {
    window.__dhRecentWorkState = { isOpen: false };
  }
  const uiState = window.__dhRecentWorkState;

  const stampOf = p => {
    try { return p.file.mtime?.toMillis?.() ?? 0; } catch { return 0; }
  };

  const recentPages = dv.pages().array()
    .filter(p => p.file.path !== dv.currentFilePath)
    .sort((a, b) => stampOf(b) - stampOf(a))
    .slice(0, LIMIT);

  const root = dv.container.createDiv({ cls: "dh dh-recent-work" });
  const details = root.createEl("details", { cls: "dh-panel dh-recent-details" });
  details.open = Boolean(uiState.isOpen);

  const summary = details.createEl("summary");
  summary.onmousedown = e => e.preventDefault();

  summary.createDiv({ cls: "dh-recent-title", text: "Недавно в работе" });
  const toggleHint = summary.createSpan({
    cls: "dh-recent-toggle",
    text: details.open ? "Свернуть ▲" : "Развернуть ▾"
  });

  const listContainer = details.createDiv();
  let isRendered = false;

  function renderList() {
    isRendered = true;
    listContainer.empty();

    if (!recentPages.length) {
      listContainer.createDiv({ cls: "dh-recent-empty", text: "Недавних заметок пока нет." });
      return;
    }

    const tableEl = listContainer.createEl("table", { cls: "dh-table dh-recent-table" });
    const thead = tableEl.createEl("thead");
    const trH = thead.createEl("tr");
    trH.createEl("th", { text: "Заметка" });
    trH.createEl("th", { text: "Изменена" });

    const tbody = tableEl.createEl("tbody");
    const todayStr = moment().format("YYYY-MM-DD");
    const yesterdayStr = moment().subtract(1, "days").format("YYYY-MM-DD");

    recentPages.forEach(p => {
      const tr = tbody.createEl("tr");

      const tdName = tr.createEl("td");
      tdName.createEl("a", {
        cls: "internal-link",
        text: p.file.name,
        attr: { href: p.file.path }
      });
      tr.onclick = (e) => {
        e.preventDefault();
        app.workspace.openLinkText(p.file.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      const tdTime = tr.createEl("td", { cls: "dh-recent-time" });
      const m = moment(stampOf(p));
      const mDay = m.format("YYYY-MM-DD");
      let timeLabel = m.format("DD.MM HH:mm");
      if (mDay === todayStr) timeLabel = `Сегодня, ${m.format("HH:mm")}`;
      else if (mDay === yesterdayStr) timeLabel = `Вчера, ${m.format("HH:mm")}`;

      tdTime.setText(timeLabel);
    });
  }

  details.ontoggle = () => {
    uiState.isOpen = details.open;
    toggleHint.setText(details.open ? "Свернуть ▲" : "Развернуть ▾");
    if (details.open && !isRendered) renderList();
  };

  if (details.open) renderList();
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
      app.metadataCache.off("changed", onFileChanged);
      app.vault.off("create", onFileChanged);
      app.vault.off("delete", onFileChanged);
      app.vault.off("rename", onFileChanged);
      return;
    }
    if (file && file.extension && file.extension !== "md") return;
    // Не перерисовываем во время активного ввода текста в поле главной
    if (window.__dhTodayDrafts?.activeKey && document.activeElement?.closest?.(".dh-today")) return;
    scheduleHomeRender(220);
  };

  app.metadataCache.on("resolved", onResolved);
  app.metadataCache.on("changed", onFileChanged);
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
