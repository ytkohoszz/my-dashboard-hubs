// ========================================================
// ОБЩИЕ ДАННЫЕ, АВТОСИНХРОНИЗАЦИЯ И УТИЛИТЫ (ГЛАВНАЯ v2.1)
// ========================================================
const AUTO_SLEEP_MIN_HOURS = 6;   // Сон > 6 часов автоматически отмечает «Режим сна»
const AUTO_DIET_MIN_KCAL = 2600;  // Калории >= 2600 ккал автоматически отмечают «Диету» (массонабор)
const BOOKS_FOLDER = "Знания/Книги";
const READING_TRACKER_KEY = "dh_reading_daily_tracker_v1";
const MANUAL_HABITS_PREFIX = "dh_today_manual_habits_v1:";

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

const today = dv.date("today").startOf("day");
const todayISO = today.toISODate();

const todayNote = dv.pages('"Ежедневник"').array()
  .filter(p => asDate(p.дата)?.toISODate() === todayISO)
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

// --- Автоматический подсчёт прочитанных за сегодня страниц из заметок книг ---
function computeTodayReadingProgress() {
  let bookPages = [];
  try {
    bookPages = dv.pages('"' + BOOKS_FOLDER + '"').array();
  } catch {
    bookPages = [];
  }

  let tracker = null;
  try {
    const raw = window.localStorage?.getItem(READING_TRACKER_KEY);
    if (raw) tracker = JSON.parse(raw);
  } catch {}

  if (!tracker || typeof tracker !== "object") {
    tracker = { dateISO: todayISO, baselines: {}, lastKnown: {}, manualOffset: 0 };
  }
  if (!tracker.baselines || typeof tracker.baselines !== "object") tracker.baselines = {};
  if (!tracker.lastKnown || typeof tracker.lastKnown !== "object") tracker.lastKnown = {};
  if (typeof tracker.manualOffset !== "number" || !Number.isFinite(tracker.manualOffset)) tracker.manualOffset = 0;

  const isNewDay = tracker.dateISO !== todayISO;
  if (isNewDay) {
    const nextBaselines = {};
    for (const p of bookPages) {
      const f = app.vault.getAbstractFileByPath(p.file.path);
      const fm = f ? (app.metadataCache.getFileCache(f)?.frontmatter || {}) : {};
      const curRead = Math.max(0, Math.round(parseNum(fm.прочитано ?? p.прочитано) || 0));
      const prevKnown = tracker.lastKnown[p.file.path];
      nextBaselines[p.file.path] = (typeof prevKnown === "number" && Number.isFinite(prevKnown))
        ? Math.min(prevKnown, curRead)
        : curRead;
      tracker.lastKnown[p.file.path] = curRead;
    }
    tracker.dateISO = todayISO;
    tracker.baselines = nextBaselines;
    tracker.manualOffset = 0;
  }

  let autoBookPages = 0;
  let readBookTitles = [];

  for (const p of bookPages) {
    const f = app.vault.getAbstractFileByPath(p.file.path);
    const fm = f ? (app.metadataCache.getFileCache(f)?.frontmatter || {}) : {};
    const curRead = Math.max(0, Math.round(parseNum(fm.прочитано ?? p.прочитано) || 0));
    const title = String(fm.название ?? p.название ?? p.file.name).trim();

    const lastReadRaw = fm.последнее_чтение ?? p.последнее_чтение;
    const lastReadISO = asDate(lastReadRaw)?.toISODate() || "";
    const posTimeRaw = String(fm.позиция_время ?? p.позиция_время ?? "").trim();
    const posDateISO = posTimeRaw.length >= 10 ? posTimeRaw.slice(0, 10) : "";
    const touchedToday = lastReadISO === todayISO || posDateISO === todayISO;

    if (tracker.baselines[p.file.path] === undefined) {
      tracker.baselines[p.file.path] = curRead;
    } else if (curRead < tracker.baselines[p.file.path]) {
      tracker.baselines[p.file.path] = curRead;
    }

    const delta = Math.max(0, curRead - tracker.baselines[p.file.path]);
    if (delta > 0) {
      autoBookPages += delta;
      readBookTitles.push(`${title} (+${delta})`);
    } else if (touchedToday && !readBookTitles.includes(title)) {
      readBookTitles.push(title);
    }

    tracker.lastKnown[p.file.path] = curRead;
  }

  try {
    window.localStorage?.setItem(READING_TRACKER_KEY, JSON.stringify(tracker));
  } catch {}

  const totalPages = Math.max(0, autoBookPages + tracker.manualOffset);
  return {
    autoBookPages,
    manualOffset: tracker.manualOffset,
    totalPages,
    readBookTitles
  };
}

function updateReadingManualOffset(newTotalPages, autoBookPages) {
  try {
    const raw = window.localStorage?.getItem(READING_TRACKER_KEY);
    const tracker = raw ? JSON.parse(raw) : { dateISO: todayISO, baselines: {}, lastKnown: {}, manualOffset: 0 };
    tracker.dateISO = todayISO;
    tracker.manualOffset = Math.round((Number(newTotalPages) || 0) - (Number(autoBookPages) || 0));
    window.localStorage?.setItem(READING_TRACKER_KEY, JSON.stringify(tracker));
  } catch {}
}

const readingSync = computeTodayReadingProgress();

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
  const pagesDoneToday = Math.max(parseNum(todayNote?.страниц_прочитано) || 0, readingSync.totalPages);
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
  ];

  const COLORS = [
    "#d85b57", "#d97354", "#d98c54", "#d9a554", "#c5ad55",
    "#a6b25a", "#8cb666", "#73b473", "#5ab17f", "#4aab80"
  ];

  const METRICS = [
    { label: "Вес", key: "вес_кг", unit: "кг", min: 20, max: 300, digits: 1, placeholder: "—" },
    { label: "Калории", key: "калории_ккал", unit: "ккал", min: 0, max: 10000, digits: 0, placeholder: "—", hint: `авто-диета ≥${AUTO_DIET_MIN_KCAL}` },
    { label: "Сон", key: "сон_часов", unit: "ч", min: 0, max: 24, digits: 1, placeholder: "—", hint: `авто-режим >${AUTO_SLEEP_MIN_HOURS} ч` },
    { label: "Чтение", key: "страниц_прочитано", unit: "стр.", min: 0, max: 1500, digits: 0, placeholder: "—", hint: readingSync.autoBookPages > 0 ? `из книг: ${readingSync.autoBookPages} стр.` : "авто из читалки" },
  ];

  function formatNumForInput(v, digits = 1) {
    const n = parseNum(v);
    if (n === null) return "";
    const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
    return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
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
    const manualOverrides = getManualHabitOverrides();

    const saveField = (key, value) => enqueueFrontMatterSave(file, fm => {
      fm[key] = value;
    });

    // --- Вычисление актуальных значений с учётом автосинхронизации ---
    const savedCalories = parseNum(note.калории_ккал);
    const savedSleep = parseNum(note.сон_часов);
    const savedPages = parseNum(note.страниц_прочитано);
    const effectivePages = readingSync.autoBookPages > 0 && (savedPages === null || readingSync.totalPages > savedPages)
      ? readingSync.totalPages
      : savedPages;

    const states = new Map(HABITS.map(h => [h.key, typeof note[h.key] === "boolean" ? note[h.key] : null]));
    const pendingPatch = {};

    // 1. Автосинхронизация страниц чтения из книг и привычки «Чтение»
    if (readingSync.autoBookPages > 0 && (savedPages === null || readingSync.totalPages > savedPages)) {
      pendingPatch.страниц_прочитано = readingSync.totalPages;
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

    // 3. Автосинхронизация привычки «Диета» по калориям (массонабор)
    if (savedCalories !== null && savedCalories >= AUTO_DIET_MIN_KCAL && manualOverrides.диета === undefined && states.get("диета") !== true) {
      states.set("диета", true);
      pendingPatch.диета = true;
    }

    // 4. Автосинхронизация привычки «Режим сна» при сне > 6 часов
    if (savedSleep !== null && savedSleep > AUTO_SLEEP_MIN_HOURS && manualOverrides.режим_сна === undefined && states.get("режим_сна") !== true) {
      states.set("режим_сна", true);
      pendingPatch.режим_сна = true;
    }

    if (Object.keys(pendingPatch).length > 0) {
      enqueueFrontMatterSave(file, fm => {
        Object.assign(fm, pendingPatch);
      }).catch(e => console.log("Auto-sync error:", e));
    }

    const rawGoals = Array.isArray(note.цели_дня) ? note.цели_дня : [];
    const goalsState = rawGoals.map(g => ({
      text: String(g?.text ?? "Задача").trim(),
      category: g?.category ? String(g.category).trim() : "",
      progress: Math.max(0, Math.min(100, Number(g?.progress) || 0))
    }));

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

    for (const m of METRICS) {
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

      if (m.hint) {
        const subHint = card.createDiv({ cls: "dh-metric-subhint", text: m.hint });
        if (m.key === "страниц_прочитано" && readingSync.readBookTitles.length > 0) {
          subHint.setAttribute("title", "Книги сегодня: " + readingSync.readBookTitles.join(", "));
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

        if (normalized === "") {
          delete uiDrafts.inputs[m.key];
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";
          if (savedFormatted === "") return;
          isSavingMetric = true;
          try {
            if (m.key === "страниц_прочитано") {
              updateReadingManualOffset(0, readingSync.autoBookPages);
            }
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
        delete uiDrafts.inputs[m.key];
        delete uiDrafts.errors[m.key];
        card.classList.remove("is-invalid");
        errorEl.style.display = "none";

        let autoHabitKey = null;
        let autoHabitVal = null;

        if (m.key === "калории_ккал") {
          autoHabitKey = "диета";
          autoHabitVal = finalValue >= AUTO_DIET_MIN_KCAL;
        } else if (m.key === "сон_часов") {
          autoHabitKey = "режим_сна";
          autoHabitVal = finalValue > AUTO_SLEEP_MIN_HOURS;
        } else if (m.key === "страниц_прочитано") {
          updateReadingManualOffset(finalValue, readingSync.autoBookPages);
          autoHabitKey = "чтение";
          autoHabitVal = finalValue > 0;
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
    }

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
        const pctSpan = item.createSpan({ cls: "dh-plan-pct" });

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

  const pages = knowledgePages
    .filter(p => p.направление && p.file.name !== "True Тренировки")
    .sort((a, b) => mtime(b) - mtime(a));

  const directions = ["Все", ...new Set(pages.map(p => String(p.направление).trim()).filter(Boolean))];
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
      : pages.filter(p => String(p.направление).trim() === uiState.selectedDirection).slice(0, LIMIT);

    listContainer.empty();

    if (!filtered.length) {
      listContainer.createDiv({
        text: "В этой категории пока нет недавно изменённых заметок.",
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
    trH.createEl("th", { text: "Изменена", attr: { style: "padding: 8px 6px; width: 130px; text-align: right;" } });

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
        app.workspace.openLinkText(p.file.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      const tdDir = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      const dirName = String(p.направление).trim();
      const dColor = DIRECTION_COLORS[dirName] || "var(--interactive-accent)";
      tdDir.createSpan({
        text: dirName,
        attr: {
          style: `font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: ${dColor}18; color: ${dColor}; border: 1px solid ${dColor}33; display: inline-block;`
        }
      });

      const tdType = tr.createEl("td", { attr: { style: "padding: 8px 6px; color: var(--text-muted); font-size: 0.8rem;" } });
      const typeName = p.тип ? String(p.тип).trim() : "—";
      const typeIcon = TYPE_ICONS[typeName] || "📄";
      tdType.setText(typeName !== "—" ? `${typeIcon} ${typeName}` : "—");

      const tdTime = tr.createEl("td", { attr: { style: "padding: 8px 6px; text-align: right; color: var(--text-muted); font-size: 0.78rem;" } });
      const m = moment(p.file.mtime.toMillis());
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