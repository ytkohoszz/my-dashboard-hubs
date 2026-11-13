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

// --- Чтение/запись ручных переопределений привычек за сегодня ---
function getManualHabitOverrides() {
  try {
    const raw = window.localStorage?.getItem(MANUAL_HABITS_PREFIX + todayISO);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function setManualHabitOverride(key, val) {
  try {
    const cur = getManualHabitOverrides();
    if (val === undefined) delete cur[key];
    else cur[key] = val;
    window.localStorage?.setItem(MANUAL_HABITS_PREFIX + todayISO, JSON.stringify(cur));
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

  const mediaCount = allPages.filter(p =>
    !isTemplate(p) &&
    p.file.path.startsWith("Знания/Медиа/") &&
    p.file.name !== "🎬Медиатека"
  ).length;

  const cardsDoneToday = parseNum(todayNote?.карточек_пройдено) || 0;
  const pagesDoneToday = readingSync.effectivePages ?? parseNum(todayNote?.страниц_прочитано) ?? 0;
  let englishBadge = "Карточки и книги";
  if (cardsDoneToday > 0 && pagesDoneToday > 0) {
    englishBadge = `${cardsDoneToday} карт. · ${pagesDoneToday} стр.`;
  } else if (cardsDoneToday > 0) {
    englishBadge = `Сегодня: ${cardsDoneToday} карт.`;
  } else if (pagesDoneToday > 0) {
    englishBadge = `Чтение: ${pagesDoneToday} стр.`;
  }

  const HUBS = [
    {
      title: "Дневник",
      file: "📓Дневник",
      icon: "📓",
      color: "#9c83e8",
      badge: todayNote ? (todayNote.оценка_дня ? `Оценка: ${todayNote.оценка_дня}/10` : "Запись открыта") : "Нет записи"
    },
    {
      title: "Учёба",
      file: "🎓Учёба",
      icon: "🎓",
      color: "#e5a158",
      badge: `В работе: ${studyActive}`
    },
    {
      title: "Здоровье",
      file: "💪Здоровье",
      icon: "💪",
      color: "#d69852",
      badge: trainingsToday > 0 || todayNote?.тренировка === true ? "Тренировка ✓" : "Тренировки и вес"
    },
    {
      title: "Английский",
      file: "🌎Английский и книги",
      icon: "🌎",
      color: "#4aab80",
      badge: englishBadge
    },
    {
      title: "3D",
      file: "🧊3D",
      icon: "🧊",
      color: "#599ed6",
      badge: `Заметок: ${notes3D}`
    },
    {
      title: "Медиатека",
      file: "Знания/Медиа/🎬Медиатека",
      icon: "🎬",
      color: "#e06c75",
      badge: `${mediaCount} позиций`
    }
  ];

  const root = dv.container.createDiv({ cls: "dh dh-hub-nav", attr: { style: "margin: 6px 0 22px 0;" } });

  const grid = root.createDiv({
    attr: {
      style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;"
    }
  });

  HUBS.forEach(hub => {
    const card = grid.createDiv({
      cls: "dh-card",
      attr: {
        style: `
          position: relative;
          padding: 14px 16px;
          background: var(--background-secondary);
          border: 1px solid var(--background-modifier-border);
          border-top: 3px solid ${hub.color};
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
          transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
        `
      }
    });

    card.onmouseenter = () => {
      card.style.transform = "translateY(-2px)";
      card.style.borderColor = hub.color;
      card.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.22)";
    };
    card.onmouseleave = () => {
      card.style.transform = "translateY(0)";
      card.style.borderColor = "var(--background-modifier-border)";
      card.style.borderTop = `3px solid ${hub.color}`;
      card.style.boxShadow = "none";
    };

    card.onclick = (e) => {
      app.workspace.openLinkText(hub.file, dv.currentFilePath, e.ctrlKey || e.metaKey);
    };

    const topRow = card.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px;" }
    });

    topRow.createDiv({
      text: hub.icon,
      attr: {
        style: `
          font-size: 1.3rem;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: ${hub.color}18;
          border: 1px solid ${hub.color}33;
        `
      }
    });

    topRow.createSpan({
      text: hub.badge,
      attr: {
        style: `
          font-size: 0.7rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
          background: ${hub.color}18;
          color: ${hub.color};
          border: 1px solid ${hub.color}33;
          white-space: nowrap;
        `
      }
    });

    const bottomRow = card.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center;" }
    });

    bottomRow.createDiv({
      text: hub.title,
      attr: { style: "font-size: 1.05rem; font-weight: 700; color: var(--text-normal);" }
    });

    bottomRow.createSpan({
      text: "→",
      attr: { style: `font-size: 0.9rem; font-weight: 700; color: ${hub.color};` }
    });
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

  const readingSubHint =
    readingSync.manualOverridePages !== null
      ? (readingSync.autoBookPages > 0 ? `вручную (из книг: ${readingSync.autoBookPages} стр.)` : "введено вручную")
      : (readingSync.autoBookPages > 0 ? `из книг: ${readingSync.autoBookPages} стр.` : "авто из читалки");

  const INPUT_METRICS = [
    { label: "Вес", key: "вес_кг", unit: "кг", min: 20, max: 300, digits: 1, placeholder: "—" },
    { label: "Сон", key: "сон_часов", unit: "ч", min: 0, max: 24, digits: 1, placeholder: "—", hint: `авто-режим >${AUTO_SLEEP_MIN_HOURS} ч` },
    { label: "Чтение", key: "страниц_прочитано", unit: "стр.", min: 0, max: 1500, digits: 0, placeholder: "—", hint: readingSubHint },
    { label: "Соцсети", key: "соцсети_мин", unit: "мин", min: 0, max: 1440, digits: 0, placeholder: "—", hint: `лимит ≤${SOCIAL_LIMIT_MIN} мин` },
    { label: "Шаги", key: "шаги", unit: "шаг", min: 0, max: 100000, digits: 0, placeholder: "—", hint: "активность за день" },
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
      plugin.openNutrition({ dateISO: todayISO });
    } catch (err) {
      notify("Не удалось открыть дневник питания: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  if (!window.__dhTodayDrafts || window.__dhTodayDrafts.dateISO !== todayISO) {
    window.__dhTodayDrafts = {
      dateISO: todayISO,
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

  const note = todayNote;
  const trainings = trainingsTodayList;

  const root = dv.container.createDiv({ cls: "dh dh-today" });

  const styleEl = root.createEl("style");
  styleEl.textContent = `
  .dashboard-home .dh-today {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    padding: 16px 18px;
    margin: 0 0 20px 0;
    box-sizing: border-box;
  }
  .dashboard-home .dh-today-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  .dashboard-home .dh-today-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dashboard-home .dh-today .dh-kicker {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .dashboard-home .dh-today-date-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .dashboard-home .dh-today .dh-today-date {
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-normal);
    line-height: 1.2;
  }
  .dashboard-home .dh-today-badges {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dashboard-home .dh-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.3;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-muted);
    white-space: nowrap;
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
  .dashboard-home .dh-today-row {
    display: grid;
    grid-template-columns: 112px 1fr;
    align-items: center;
    gap: 12px;
  }
  .dashboard-home .dh-today-row-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .dashboard-home .dh-today-row-sub {
    font-size: 0.72rem;
    font-weight: 600;
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
    border-radius: 7px;
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
    transition: border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease, transform 0.1s ease;
  }
  .dashboard-home .dh-today .dh-score:hover:not(:disabled) {
    border-color: var(--chip-color, var(--interactive-accent));
    color: var(--text-normal);
  }
  .dashboard-home .dh-today .dh-score.is-active {
    background: var(--chip-color, var(--interactive-accent));
    border-color: var(--chip-color, var(--interactive-accent));
    color: #141619;
    font-weight: 700;
  }
  .dashboard-home .dh-today .dh-habit-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 29px;
    padding: 0 11px;
    border-radius: 7px;
    font-size: 0.8rem;
    font-weight: 500;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
    transition: border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease;
  }
  .dashboard-home .dh-today .dh-habit-chip:hover:not(:disabled) {
    border-color: var(--chip-color, var(--interactive-accent));
    color: var(--text-normal);
  }
  .dashboard-home .dh-today .dh-habit-chip .dh-habit-check {
    font-size: 0.74rem;
    line-height: 1;
    opacity: 0.65;
  }
  .dashboard-home .dh-today .dh-habit-chip.is-active {
    background: color-mix(in srgb, var(--chip-color) 22%, var(--background-primary));
    border-color: var(--chip-color);
    color: var(--text-normal);
    font-weight: 600;
  }
  .dashboard-home .dh-today .dh-habit-chip.is-active .dh-habit-check {
    color: var(--chip-color);
    opacity: 1;
    font-weight: 700;
  }
  .dashboard-home .dh-metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(135px, 1fr));
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }
  .dashboard-home .dh-metric-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    transition: border-color 0.15s ease;
  }
  .dashboard-home .dh-metric-item.is-clickable {
    cursor: pointer;
    user-select: none;
  }
  .dashboard-home .dh-metric-item.is-clickable:hover {
    border-color: var(--interactive-accent);
  }
  .dashboard-home .dh-metric-item.is-running {
    border-color: #9c83e8;
    background: color-mix(in srgb, #9c83e8 10%, var(--background-primary));
  }
  .dashboard-home .dh-metric-item:focus-within {
    border-color: #599ed6;
  }
  .dashboard-home .dh-metric-item.is-invalid {
    border-color: #d85b57;
  }
  .dashboard-home .dh-metric-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .dashboard-home .dh-metric-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .dashboard-home .dh-metric-status {
    font-size: 0.68rem;
    font-weight: 600;
    color: #4aab80;
    min-height: 1em;
  }
  .dashboard-home .dh-metric-control {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-height: 28px;
  }
  .dashboard-home .dh-metric-readonly-val {
    font-size: 1rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-normal);
    line-height: 28px;
  }
  .dashboard-home .dh-metric-input {
    width: 78px !important;
    max-width: 100%;
    height: 28px !important;
    padding: 2px 8px !important;
    font-size: 0.88rem !important;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    border-radius: 6px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-secondary) !important;
    color: var(--text-normal) !important;
  }
  .dashboard-home .dh-metric-input:focus {
    outline: none !important;
    border-color: #599ed6 !important;
  }
  .dashboard-home .dh-metric-unit {
    font-size: 0.78rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .dashboard-home .dh-metric-subhint {
    font-size: 0.66rem;
    color: var(--text-faint);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dh-metric-error {
    font-size: 0.7rem;
    color: #d85b57;
    line-height: 1.25;
  }
  .dashboard-home .dh-today-bottom-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }
  .dashboard-home .dh-plan-box {
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    font-weight: 600;
    color: var(--text-muted);
  }
  .dashboard-home .dh-plan-bar-track {
    height: 5px;
    border-radius: 999px;
    background: var(--background-modifier-border);
    overflow: hidden;
  }
  .dashboard-home .dh-plan-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.2s ease;
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
    padding: 5px 8px;
    border-radius: 6px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    font-size: 0.8rem;
    cursor: pointer;
    user-select: none;
    transition: border-color 0.14s ease;
  }
  .dashboard-home .dh-plan-item:hover {
    border-color: #599ed688;
  }
  .dashboard-home .dh-plan-item.is-done {
    border-color: #4aab8055;
  }
  .dashboard-home .dh-plan-item-left {
    display: flex;
    align-items: center;
    gap: 7px;
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
    padding: 0 6px !important;
    border-radius: 5px !important;
    font-size: 0.68rem !important;
    font-weight: 600 !important;
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, #9c83e8 14%, var(--background-primary)) !important;
    border: 1px solid color-mix(in srgb, #9c83e8 35%, var(--background-modifier-border)) !important;
    color: #9c83e8 !important;
    cursor: pointer;
    box-shadow: none !important;
  }
  .dashboard-home .dh-plan-focus-btn:hover {
    background: color-mix(in srgb, #9c83e8 24%, var(--background-primary)) !important;
  }
  .dashboard-home .dh-plan-check {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    flex-shrink: 0;
    color: transparent;
    background: var(--background-primary);
  }
  .dashboard-home .dh-plan-item.is-done .dh-plan-check {
    background: #4aab8022;
    border-color: #4aab80;
    color: #4aab80;
    font-weight: 700;
  }
  .dashboard-home .dh-plan-text {
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dashboard-home .dh-plan-item.is-done .dh-plan-text {
    color: var(--text-muted);
    text-decoration: line-through;
  }
  .dashboard-home .dh-plan-pct {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .dashboard-home .dh-event-row {
    display: grid;
    grid-template-columns: 112px 1fr;
    align-items: center;
    gap: 12px;
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
    height: 30px !important;
    padding: 4px 10px !important;
    font-size: 0.84rem !important;
    border-radius: 7px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-primary) !important;
    color: var(--text-normal) !important;
  }
  .dashboard-home .dh-event-input:focus {
    outline: none !important;
    border-color: #599ed6 !important;
  }
  .dashboard-home .dh-today-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--background-modifier-border);
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
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.76rem;
    font-weight: 500;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-accent);
    text-decoration: none;
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

  const openToday = () => {
    if (note) {
      app.workspace.openLinkText(note.file.path, dv.currentFilePath, false);
      return;
    }
    if (!app.commands.executeCommandById("daily-notes")) {
      notify("Включи основной плагин «Ежедневные заметки».");
    }
  };

  const head = root.createDiv({ cls: "dh-today-head" });
  const titles = head.createDiv({ cls: "dh-today-titles" });
  titles.createDiv({ cls: "dh-kicker", text: "Сегодня" });

  const dateRow = titles.createDiv({ cls: "dh-today-date-row" });
  dateRow.createDiv({ cls: "dh-today-date", text: today.setLocale("ru").toFormat("cccc, d MMMM") });

  const badgesWrap = dateRow.createDiv({ cls: "dh-today-badges" });

  const actions = head.createDiv({ cls: "dh-actions" });
  actionButton(
    actions,
    note ? "Открыть запись дня" : "Создать запись дня",
    openToday,
    note ? "dh-btn" : "dh-btn mod-cta"
  );

  if (!note) {
    root.createDiv({
      cls: "dh-muted",
      text: "Записи за сегодня пока нет. Нажми «Создать запись дня», чтобы отмечать оценку, энергию, привычки, показатели и главное событие прямо с главной.",
      attr: { style: "margin-top: 12px; font-size: 0.84rem;" }
    });
  } else {
    const file = app.vault.getAbstractFileByPath(note.file.path);
    const fmCache = file ? (app.metadataCache.getFileCache(file)?.frontmatter || {}) : {};
    const manualOverrides = getManualHabitOverrides();

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
    if (readingSync.manualOverridePages !== null) {
      effectivePages = readingSync.manualOverridePages;
    } else if (readingSync.autoBookPages > 0) {
      effectivePages = readingSync.autoBookPages;
    }

    const focusByGoalsMap = (fmCache.фокус_по_целям && typeof fmCache.фокус_по_целям === "object")
      ? fmCache.фокус_по_целям
      : {};

    const states = new Map(HABITS.map(h => [h.key, typeof note[h.key] === "boolean" ? note[h.key] : null]));
    const pendingPatch = {};

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

    const planHeadPill = badgesWrap.createSpan({ cls: "dh-status-pill" });
    const updatePlanHeadPill = () => {
      const { totalG, doneG, avgPct } = calcPlanSummary();
      if (totalG > 0) {
        const color = avgPct === 100 ? "#4aab80" : avgPct >= 60 ? "#599ed6" : "#e5a158";
        const icon = avgPct === 100 ? "✓" : "⚡";
        planHeadPill.setText(`${icon} План дня: ${avgPct}% (${doneG}/${totalG})`);
        planHeadPill.style.color = color;
        planHeadPill.style.borderColor = `${color}55`;
        planHeadPill.style.background = `${color}14`;
      } else {
        planHeadPill.setText("План дня не задан");
        planHeadPill.style.color = "var(--text-muted)";
        planHeadPill.style.borderColor = "var(--background-modifier-border)";
        planHeadPill.style.background = "var(--background-primary)";
      }
    };
    updatePlanHeadPill();

    const habitsHeadPill = badgesWrap.createSpan({ cls: "dh-status-pill" });

    const body = root.createDiv({ cls: "dh-today-body" });
    const stateSection = body.createDiv({ cls: "dh-today-section" });

    function renderScaleRow(label, key) {
      const r = stateSection.createDiv({ cls: "dh-today-row" });
      const lblWrap = r.createDiv({ cls: "dh-today-row-label" });
      lblWrap.createSpan({ text: label });
      const valBadge = lblWrap.createSpan({ cls: "dh-today-row-sub" });

      const chips = r.createDiv({ cls: "dh-today-chips" });
      const parsedCurrent = parseNum(note[key]);
      let current = parsedCurrent !== null && parsedCurrent >= 1 && parsedCurrent <= 10 ? parsedCurrent : null;
      const buttons = [];

      const paint = () => {
        valBadge.setText(current !== null ? `${current}/10` : "—");
        buttons.forEach((b, idx) => {
          const isAct = current === idx + 1;
          b.classList.toggle("is-active", isAct);
          b.setAttribute("aria-pressed", String(isAct));
        });
      };

      for (let n = 1; n <= 10; n++) {
        const b = actionButton(chips, String(n), async () => {
          const prev = current;
          const next = current === n ? null : n;
          current = next;
          paint();
          try {
            await saveField(key, next);
          } catch (err) {
            current = prev;
            paint();
            throw err;
          }
        }, "dh-chip dh-score");
        b.style.setProperty("--chip-color", COLORS[n - 1]);
        b.setAttribute("aria-label", `${label}: ${n}`);
        buttons.push(b);
      }
      paint();
    }

    renderScaleRow("Оценка дня", "оценка_дня");
    renderScaleRow("Энергия", "энергия");

    const habitsRow = stateSection.createDiv({ cls: "dh-today-row" });
    const habitsLabelWrap = habitsRow.createDiv({ cls: "dh-today-row-label" });
    habitsLabelWrap.createSpan({ text: "Привычки" });
    const habitsCountSub = habitsLabelWrap.createSpan({ cls: "dh-today-row-sub" });
    const habitChips = habitsRow.createDiv({ cls: "dh-today-chips" });

    const habitPainters = new Map();
    const updateHabitsSummary = () => {
      const done = [...states.values()].filter(v => v === true).length;
      habitsCountSub.setText(`${done}/${HABITS.length}`);
      habitsHeadPill.setText(`Привычки: ${done}/${HABITS.length}`);
      const isAllDone = done === HABITS.length;
      habitsHeadPill.style.color = isAllDone ? "#4aab80" : "var(--text-muted)";
      habitsHeadPill.style.borderColor = isAllDone ? "#4aab8055" : "var(--background-modifier-border)";
      habitsHeadPill.style.background = isAllDone ? "#4aab8014" : "var(--background-primary)";
    };

    for (const h of HABITS) {
      const b = actionButton(habitChips, "", async () => {
        const prev = states.get(h.key);
        const next = prev !== true;
        states.set(h.key, next);
        setManualHabitOverride(h.key, next);
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

    const renderInputMetricCard = (m) => {
      const card = metricsGrid.createEl("label", { cls: "dh-metric-item" });
      const top = card.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: m.label });
      const statusSpan = top.createSpan({ cls: "dh-metric-status" });

      const control = card.createDiv({ cls: "dh-metric-control" });
      const input = control.createEl("input", {
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
          input.blur();
        }
      };

      let isSavingMetric = false;
      const commitMetric = async () => {
        if (isSavingMetric) return;
        if (uiDrafts.activeKey === m.key) uiDrafts.activeKey = null;

        const rawTrimmed = input.value.trim();
        const normalized = rawTrimmed.replace(",", ".");

        // Очистка поля: сбрасываем ручное переопределение и возвращаемся к авто-значению из книг (или null)
        if (normalized === "") {
          delete uiDrafts.inputs[m.key];
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
          if (savedFormatted === "" && (m.key !== "страниц_прочитано" || readingSync.manualOverridePages === null)) return;

          isSavingMetric = true;
          try {
            if (m.key === "страниц_прочитано") {
              setManualReadingOverride(null);
              const fallbackPages = readingSync.autoBookPages > 0 ? readingSync.autoBookPages : null;
              input.value = fallbackPages !== null ? formatNumForInput(fallbackPages, 0) : "";
              if (subHintEl) {
                subHintEl.setText(readingSync.autoBookPages > 0 ? `из книг: ${readingSync.autoBookPages} стр.` : "авто из читалки");
              }
              await saveField(m.key, fallbackPages);
            } else {
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
          // Если введённое число совпадает с autoBookPages — снимаем ручной флаг, иначе фиксируем ручной ввод
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
            setManualHabitOverride(autoHabitKey, undefined);
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

    const renderTimeMetricCard = (label, key, placeholder, hint) => {
      const card = metricsGrid.createEl("label", { cls: "dh-metric-item" });
      const top = card.createDiv({ cls: "dh-metric-top" });
      top.createSpan({ cls: "dh-metric-label", text: label });
      const statusSpan = top.createSpan({ cls: "dh-metric-status" });

      const control = card.createDiv({ cls: "dh-metric-control" });
      const input = control.createEl("input", {
        cls: "dh-metric-input",
        attr: {
          type: "text",
          placeholder,
          "aria-label": label,
          style: "width: 72px !important; text-align: center !important;"
        }
      });
      control.createSpan({ cls: "dh-metric-unit", text: "" });

      if (hint) {
        card.createDiv({ cls: "dh-metric-subhint", text: hint });
      }

      const errorEl = card.createDiv({ cls: "dh-metric-error" });
      errorEl.style.display = "none";

      const savedVal = typeof note[key] === "string" ? note[key].trim() : "";
      const hasDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, key);
      input.value = hasDraft ? uiDrafts.inputs[key] : savedVal;

      if (uiDrafts.errors[key]) {
        card.classList.add("is-invalid");
        errorEl.setText(uiDrafts.errors[key]);
        errorEl.style.display = "block";
      } else if (uiDrafts.savedStamp[key] && Date.now() - uiDrafts.savedStamp[key] < 2200) {
        statusSpan.setText("✓");
        setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
      }

      input.onfocus = () => { uiDrafts.activeKey = key; };
      input.oninput = () => {
        uiDrafts.inputs[key] = input.value;
        if (uiDrafts.errors[key]) {
          delete uiDrafts.errors[key];
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
          delete uiDrafts.inputs[key];
          delete uiDrafts.errors[key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
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
          delete uiDrafts.errors[key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
          if (savedVal === "") return;
          isSavingTime = true;
          try {
            await saveField(key, null);
            uiDrafts.savedStamp[key] = Date.now();
            statusSpan.setText("✓");
          } catch (err) {
            notify(`Ошибка очистки «${label}»: ${err?.message ?? err}`);
          } finally {
            isSavingTime = false;
          }
          return;
        }

        const normalized = normalizeTimeString(raw);
        if (!normalized) {
          const msg = "Формат: ЧЧ:ММ (напр. 23:30)";
          uiDrafts.errors[key] = msg;
          card.classList.add("is-invalid");
          errorEl.setText(msg);
          errorEl.style.display = "block";
          return;
        }

        input.value = normalized;
        delete uiDrafts.inputs[key];
        delete uiDrafts.errors[key];
        card.classList.remove("is-invalid");
        errorEl.style.display = "none";

        if (normalized === savedVal) return;

        isSavingTime = true;
        try {
          const counterpartKey = key === "отбой" ? "подъём" : "отбой";
          const counterpartVal = typeof note[counterpartKey] === "string" ? note[counterpartKey].trim() : "";
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

          if (autoSleep !== null && inputRefs.has("сон_часов")) {
            inputRefs.get("сон_часов").value = formatNumForInput(autoSleep, 1);
          }

          uiDrafts.savedStamp[key] = Date.now();
          statusSpan.setText("✓");
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

    // РЯД 1: Вес, Калории, Сон (авто/ручной), Чтение
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
        text: "🥗 ＋",
        attr: { style: "color: var(--interactive-accent);" }
      });

      const control = calCard.createDiv({ cls: "dh-metric-control" });
      control.createSpan({
        cls: "dh-metric-readonly-val",
        text: savedCalories !== null ? String(Math.round(savedCalories)) : "—"
      });
      control.createSpan({
        cls: "dh-metric-unit",
        text: calorieGoal !== null ? `/ ${calorieGoal} ккал` : "ккал"
      });

      let calHint = "нажми, чтобы внести еду";
      if (savedProtein !== null || savedFat !== null || savedCarbs !== null) {
        calHint = `Б:${Math.round(savedProtein || 0)} · Ж:${Math.round(savedFat || 0)} · У:${Math.round(savedCarbs || 0)} г`;
      } else if (calorieGoal !== null) {
        calHint = `авто-диета ≥${calorieGoal} ккал`;
      }
      calCard.createDiv({ cls: "dh-metric-subhint", text: calHint });

      calCard.onclick = () => openNutritionFromHome();
      calCard.onkeydown = e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openNutritionFromHome();
        }
      };
    }

    renderInputMetricCard(INPUT_METRICS[1]); // Сон
    renderInputMetricCard(INPUT_METRICS[2]); // Чтение

    // РЯД 2: Фокус (my-focus-tracker), Отбой, Подъём, Соцсети (мин), Шаги
    {
      const focusPlugin = getFocusPlugin();
      const activeSession = focusPlugin?.session;
      const isRunningNow = Boolean(activeSession && activeSession.isRunning);

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
        text: isRunningNow ? "🔥 Идёт" : "⏱️ ＋",
        attr: { style: "color: #9c83e8;" }
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

      let defaultHint = "выбрать цель дня и запустить";
      if (goalEntries.length > 0) {
        defaultHint = goalEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}м`).join(" · ");
      } else if (savedFocus !== null && savedFocus > 0) {
        defaultHint = "сессии записаны";
      }

      const hintEl = focusCard.createDiv({
        cls: "dh-metric-subhint",
        text: defaultHint,
        attr: { title: goalEntries.map(([k, v]) => `${k}: ${v} мин`).join(", ") }
      });

      if (window.__dhHomeFocusTicker) {
        window.clearInterval(window.__dhHomeFocusTicker);
        delete window.__dhHomeFocusTicker;
      }

      const paintRunningState = () => {
        const curSession = getFocusPlugin()?.session;
        if (!curSession || !curSession.isRunning) return;
        if (curSession.endAt !== null) {
          const remSec = Math.max(0, Math.ceil((curSession.endAt - Date.now()) / 1000));
          const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
          const ss = String(remSec % 60).padStart(2, "0");
          valSpan.setText(`${mm}:${ss}`);
          unitSpan.setText("ост.");
        } else {
          const elSec = Math.max(0, Math.floor((Date.now() - curSession.startAt) / 1000));
          const mm = String(Math.floor(elSec / 60)).padStart(2, "0");
          const ss = String(elSec % 60).padStart(2, "0");
          valSpan.setText(`${mm}:${ss}`);
          unitSpan.setText("сек.");
        }
        statusBadgeEl.setText("🔥 Идёт");
        hintEl.setText(`Цель: ${curSession.project}`);
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

    renderTimeMetricCard("Отбой", "отбой", "23:30", "время засыпания");
    renderTimeMetricCard("Подъём", "подъём", "07:15", "время пробуждения");
    renderInputMetricCard(INPUT_METRICS[3]); // Соцсети (мин)
    renderInputMetricCard(INPUT_METRICS[4]); // Шаги

    const bottomGrid = body.createDiv({ cls: "dh-today-bottom-grid" });

    if (goalsState.length > 0) {
      const planBox = bottomGrid.createDiv({ cls: "dh-plan-box" });
      const planHead = planBox.createDiv({ cls: "dh-plan-head" });
      planHead.createSpan({ cls: "dh-plan-title", text: "План дня (задачи из ежедневника)" });
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
          cls: "dh-plan-focus-btn",
          text: goal.focusMinutes > 0 ? `⏱️ ${goal.focusMinutes}м` : "⏱️",
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
          pctSpan.setText(`${goal.progress}%`);
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

    const footer = body.createDiv({ cls: "dh-today-footer" });
    const trLeft = footer.createDiv({ cls: "dh-footer-trainings" });

    trLeft.createSpan({
      text: `Тренировок сегодня: ${trainings.length}`,
      attr: { style: "font-weight: 600; color: var(--text-normal);" }
    });

    if (savedFocus !== null && savedFocus > 0) {
      const fPill = trLeft.createEl("button", {
        cls: "dh-training-pill",
        text: `⏱️ Фокус: ${String(savedFocus).replace(".", ",")} ч`,
        attr: { type: "button", title: "Открыть таймер глубокой работы", style: "cursor: pointer; color: #9c83e8; border-color: rgba(156, 131, 232, 0.4);" }
      });
      fPill.onclick = () => openFocusTrackerFromHome();
    }

    if (trainings.length > 0) {
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

      if (states.get("тренировка") === true) {
        footer.createSpan({
          text: "✓ Отмечено в дневнике автоматически",
          attr: { style: "font-size: 0.74rem; color: #4aab80; font-weight: 600;" }
        });
      } else {
        const syncBtn = actionButton(footer, "Вернуть отметку тренировки", async () => {
          setManualHabitOverride("тренировка", true);
          await saveField("тренировка", true);
          states.set("тренировка", true);
          habitPainters.get("тренировка")?.();
          updateHabitsSummary();
          syncBtn.remove();
        }, "dh-link-btn");
      }
    } else {
      trLeft.createSpan({ text: "· записей тренировок за сегодня пока нет" });
    }
  }
}

// ========================================================
// 3. БЛОК «НЕДАВНО В РАБОТЕ» (РАСКРЫВАЮЩИЙСЯ СПИСОК)
// ========================================================
{
  const LIMIT = 8;
  const SORT_BY = "mtime";
  const EXCLUDE_FOLDERS = ["Ежедневник", "Шаблоны"];
  const EXCLUDE_NAMES = ["True Тренировки"];
  const NO_DIR = "Без направления";

  const DIRECTION_COLORS = {
    "Учёба": "#e5a158",
    "Любовь": "#e06c75",
    "Работа": "#599ed6",
    "3D": "#9c83e8",
    "Проекты": "#4aab80",
    "Досуг": "#c5ad55"
  };

  const TYPE_ICONS = {
    "Проект": "🚀",
    "Термин": "📖",
    "Алгоритм": "⚙️",
    "Заметка": "📝",
    "Источник": "📚"
  };

  if (!window.__dhRecentWorkState) {
    window.__dhRecentWorkState = {
      isOpen: false,
      selectedDirection: "Все"
    };
  }
  const uiState = window.__dhRecentWorkState;

  const stampOf = p => {
    try { return p.file[SORT_BY]?.toMillis?.() ?? 0; } catch { return 0; }
  };
  const dirOf = p => String(p.направление ?? "").trim() || NO_DIR;
  const isExcluded = p =>
    p.file.path === dv.currentFilePath ||
    EXCLUDE_NAMES.includes(p.file.name) ||
    EXCLUDE_FOLDERS.some(f => p.file.path.startsWith(f + "/"));

  const pages = dv.pages().array()
    .filter(p => !isExcluded(p))
    .sort((a, b) => stampOf(b) - stampOf(a));

  const dirSet = new Set(pages.map(dirOf));
  const directions = ["Все", ...[...dirSet].filter(d => d !== NO_DIR), ...(dirSet.has(NO_DIR) ? [NO_DIR] : [])];
  if (!directions.includes(uiState.selectedDirection)) {
    uiState.selectedDirection = "Все";
  }

  const root = dv.container.createDiv({ cls: "dh dh-recent-work", attr: { style: "margin: 15px 0 25px 0;" } });

  const styleEl = root.createEl("style");
  styleEl.textContent = `
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
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  `;

  const details = root.createEl("details", {
    cls: "dh-panel dh-recent-details",
    attr: {
      style: "padding: 14px 16px; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border);"
    }
  });
  details.open = Boolean(uiState.isOpen);

  const summary = details.createEl("summary");
  summary.onmousedown = e => e.preventDefault();

  summary.createDiv({
    text: "Недавно в работе",
    attr: { style: "font-size: 1.05rem; font-weight: 600; color: var(--text-normal);" }
  });

  const toggleHint = summary.createSpan({
    text: details.open ? "Свернуть ▲" : "Развернуть ▾",
    attr: { style: "font-size: 0.76rem; font-weight: 600; color: var(--text-muted);" }
  });

  const contentWrap = details.createDiv();
  const filterChips = contentWrap.createDiv({
    cls: "dh-chips",
    attr: { style: "display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px;" }
  });
  const listContainer = contentWrap.createDiv({ attr: { style: "margin-top: 5px;" } });

  let isRendered = false;

  function renderList() {
    isRendered = true;
    filterChips.empty();
    directions.forEach(dir => {
      const isAct = dir === uiState.selectedDirection;
      const chip = filterChips.createEl("button", {
        cls: `dh-chip ${isAct ? "is-active" : ""}`,
        text: dir,
        attr: {
          type: "button",
          style: "font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; cursor: pointer; transition: all 0.15s ease;"
        }
      });
      chip.onclick = () => {
        uiState.selectedDirection = dir;
        renderList();
      };
    });

    const filtered = uiState.selectedDirection === "Все"
      ? pages.slice(0, LIMIT)
      : pages.filter(p => dirOf(p) === uiState.selectedDirection).slice(0, LIMIT);

    listContainer.empty();

    if (!filtered.length) {
      listContainer.createDiv({
        text: "В этой категории пока нет недавних заметок.",
        attr: { style: "font-size: 0.85rem; color: var(--text-muted); padding: 12px; text-align: center;" }
      });
      return;
    }

    const tableEl = listContainer.createEl("table", {
      cls: "dh-table",
      attr: { style: "width: 100%; border-collapse: collapse; font-size: 0.86rem;" }
    });

    const thead = tableEl.createEl("thead");
    const trH = thead.createEl("tr", { attr: { style: "border-bottom: 1px solid var(--background-modifier-border); text-align: left; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;" } });
    trH.createEl("th", { text: "Заметка", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "Направление", attr: { style: "padding: 8px 6px; width: 140px;" } });
    trH.createEl("th", { text: "Тип", attr: { style: "padding: 8px 6px; width: 120px;" } });
    trH.createEl("th", { text: SORT_BY === "ctime" ? "Создана" : "Изменена", attr: { style: "padding: 8px 6px; width: 130px; text-align: right;" } });

    const tbody = tableEl.createEl("tbody");

    const todayStr = moment().format("YYYY-MM-DD");
    const yesterdayStr = moment().subtract(1, "days").format("YYYY-MM-DD");

    filtered.forEach(p => {
      const tr = tbody.createEl("tr", {
        attr: {
          style: "border-bottom: 1px solid var(--background-modifier-border); transition: background 0.1s ease; cursor: pointer;"
        }
      });

      tr.onmouseenter = () => { tr.style.background = "var(--background-modifier-hover)"; };
      tr.onmouseleave = () => { tr.style.background = "transparent"; };

      const tdName = tr.createEl("td", { attr: { style: "padding: 8px 6px; font-weight: 500;" } });
      tdName.createEl("a", {
        cls: "internal-link",
        text: p.file.name,
        attr: { href: p.file.path, style: "color: var(--text-accent); text-decoration: none;" }
      });
      tr.onclick = (e) => {
        e.preventDefault();
        app.workspace.openLinkText(p.file.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      const tdDir = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      const dirName = dirOf(p);
      if (dirName === NO_DIR) {
        tdDir.createSpan({
          text: "—",
          attr: { style: "color: var(--text-faint); font-size: 0.8rem;" }
        });
      } else {
        const dColor = DIRECTION_COLORS[dirName] || "var(--interactive-accent)";
        tdDir.createSpan({
          text: dirName,
          attr: {
            style: `font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: ${dColor}18; color: ${dColor}; border: 1px solid ${dColor}33; display: inline-block;`
          }
        });
      }

      const tdType = tr.createEl("td", { attr: { style: "padding: 8px 6px; color: var(--text-muted); font-size: 0.8rem;" } });
      const typeName = p.тип ? String(p.тип).trim() : "—";
      const typeIcon = TYPE_ICONS[typeName] || "📄";
      tdType.setText(typeName !== "—" ? `${typeIcon} ${typeName}` : "—");

      const tdTime = tr.createEl("td", { attr: { style: "padding: 8px 6px; text-align: right; color: var(--text-muted); font-size: 0.78rem;" } });
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
}
