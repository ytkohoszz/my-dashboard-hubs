// =====================================================================
// УЧЁБА: ВИТРИНА ПРОЕКТОВ (СВЯЗКА С MY-STUDY-COMPILER) → MY-SR-TRAINER → ЗАВЕРШЁННЫЕ
// Требуются включённые плагины my-study-compiler (0.3.2+) и my-sr-trainer (0.1.2+).
// =====================================================================

const AREA = "Учёба";
const TARGET_FOLDER = "Знания";
const DECKS_FOLDER = "Знания/Карточки";
const KNOWLEDGE_FOLDER = '"Знания"';

const KEYS = {
  area: "направление",
  type: "тип",
  parent: "родитель",
  status: "статус",
  deadline: "дедлайн",
  deadlineAlt: "срок",
  discipline: "дисциплина",
  icon: "иконка",
  templateFlag: "шаблон",
  finishedAt: "дата_завершения",
  start: "начало",
  finishedLegacy: "завершено"
};

const ROOT_STATUS_ACTIVE = "В работе";
const ROOT_STATUS_DONE = "Завершён";

const ROOT_DONE_STATUSES = [
  "выполнено",
  "выполнен",
  "завершён",
  "завершена",
  "завершено",
  "сдана",
  "сдан",
  "готово",
  "архив",
  "отменён",
  "отменена",
  "done"
];

const LEGACY_MATERIAL_TYPES = [
  "Источник",
  "Термин",
  "Рисунок",
  "Схема",
  "Таблица",
  "Конспект",
  "Заметка",
  "Расчёт",
  "Алгоритм"
];
const LEGACY_MATERIAL_TYPES_LOWER = new Set(LEGACY_MATERIAL_TYPES.map(t => t.toLowerCase()));

const PRESET_WORK_TYPES = [
  "Проект",
  "Лабораторная работа",
  "Конференция",
  "Диссертация",
  "Курсовая работа",
  "Статья",
  "Экзамен",
  "Зачёт",
  "Практика"
];
const QUICK_ICONS = ["📁", "🧪", "🎤", "🎓", "📄", "📐", "⚡", "🔬", "📊", "🏛️", "🚀", "📌"];

const DEFAULT_EXCLUDED_FOLDERS = ["Templates", "Шаблоны", "Знания/Карточки", "Знания/Сборки"];
const DEFAULT_EXCLUDED_PREFIXES = ["Учёба — ", "Шаблон", "Template"];
const DEFAULT_EXCLUDED_TAGS = ["шаблон", "template"];

const INBOX_LIMIT = 10;
const MATURE_DAYS = 21;
const HINT_SEP = " // ";

const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };
const plural = (n, f) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2];
};

const normalizeSpaces = s => String(s ?? "").replace(/\s+/g, " ").trim();
const today = dv.date("today").startOf("day");
const todayISO = today.toISODate();
const typeOf = p => normalizeSpaces(p[KEYS.type]);
const toISO = v => { if (!v) return null; const d = dv.date(v); return d && d.isValid ? d.toISODate() : null; };
const flat = v => v == null ? [] : (dv.isArray(v) ? Array.from(v).flatMap(flat) : [v]);
const cleanLineText = s => String(s ?? "").replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();

function stripOuterWikiBrackets(str) {
  let s = String(str || "").trim();
  if (s.startsWith("[[")) s = s.slice(2);
  if (s.endsWith("]]")) s = s.slice(0, -2);
  return s;
}

function getCompilerPlugin() {
  return app.plugins?.plugins?.["my-study-compiler"] ?? null;
}

function openStudyCompiler(options = {}) {
  const plugin = getCompilerPlugin();
  if (!plugin || typeof plugin.openCompiler !== "function") {
    notify("Включи плагин «Конструктор учебных проектов» (my-study-compiler) в настройках Obsidian.");
    return;
  }
  try {
    plugin.openCompiler(options);
  } catch (error) {
    notify("Не удалось открыть конструктор: " + (error instanceof Error ? error.message : String(error)));
  }
}

function getEffectiveCompilerSettings() {
  const s = getCompilerPlugin()?.settings;
  return {
    studyAreaName: typeof s?.studyAreaName === "string" && s.studyAreaName.trim() ? s.studyAreaName.trim() : AREA,
    newNoteFolder: typeof s?.newNoteFolder === "string" && s.newNoteFolder.trim() ? s.newNoteFolder.trim() : TARGET_FOLDER,
    excludedFolders: Array.isArray(s?.excludedFolders) && s.excludedFolders.length ? s.excludedFolders : DEFAULT_EXCLUDED_FOLDERS,
    excludedTitlePrefixes: Array.isArray(s?.excludedTitlePrefixes) && s.excludedTitlePrefixes.length ? s.excludedTitlePrefixes : DEFAULT_EXCLUDED_PREFIXES,
    excludedTags: Array.isArray(s?.excludedTags) && s.excludedTags.length ? s.excludedTags : DEFAULT_EXCLUDED_TAGS
  };
}

function isCardDeckPage(p, fm) {
  const flag = fm ? fm["колода_карточек"] : p.колода_карточек;
  const sub = fm ? fm["подтип"] : p.подтип;
  return Boolean(flag) || normalizeSpaces(sub).toLowerCase() === "карточки";
}

function isTemplateOrExcludedPage(p, settings) {
  const fileObj = app.vault.getAbstractFileByPath(p.file.path);
  const cache = fileObj ? app.metadataCache.getFileCache(fileObj) : null;
  const fm = cache?.frontmatter || {};

  if (isCardDeckPage(p, fm)) return true;

  const excludedFolders = settings.excludedFolders
    .map(f => String(f).trim().replace(/^\/+|\/+$/g, "").toLowerCase())
    .filter(Boolean);

  const pathLower = p.file.path.toLowerCase();
  const folderSegments = pathLower.split("/").slice(0, -1);
  for (const exFolder of excludedFolders) {
    if (pathLower.startsWith(exFolder + "/") || folderSegments.includes(exFolder)) {
      return true;
    }
  }

  const prefixes = settings.excludedTitlePrefixes
    .map(pr => String(pr).trim().toLowerCase())
    .filter(Boolean);
  const baseLower = p.file.name.toLowerCase();
  if (prefixes.some(pref => baseLower.startsWith(pref))) {
    return true;
  }

  const excludedTags = settings.excludedTags
    .map(t => String(t).trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  const pageTags = flat(p.file?.tags ?? p.tags).map(t => String(t).replace(/^#/, "").toLowerCase());
  if (pageTags.some(t => excludedTags.includes(t))) {
    return true;
  }

  const noteTypeLower = normalizeSpaces(fm[KEYS.type] ?? p[KEYS.type]).toLowerCase();
  if (noteTypeLower === "шаблон" || noteTypeLower === "template") {
    return true;
  }
  const tplFlag = fm[KEYS.templateFlag] ?? p[KEYS.templateFlag];
  if (tplFlag === true || String(tplFlag ?? "").toLowerCase() === "true") {
    return true;
  }

  return false;
}

function isRootStatusCompleted(status) {
  const clean = normalizeSpaces(status).toLowerCase();
  if (!clean) return false;
  return ROOT_DONE_STATUSES.includes(clean);
}

const parentPaths = p => flat(p[KEYS.parent]).map(x => {
  if (x && typeof x === "object" && x.path) return x.path;
  const s = stripOuterWikiBrackets(x).split("|")[0]?.split("#")[0]?.trim();
  if (!s) return null;
  const direct = app.vault.getAbstractFileByPath(s);
  if (direct) return direct.path;
  const withMd = app.vault.getAbstractFileByPath(s.endsWith(".md") ? s : s + ".md");
  if (withMd) return withMd.path;
  const f = app.metadataCache.getFirstLinkpathDest(s, p.file.path);
  return f ? f.path : null;
}).filter(Boolean);

const HASH_PALETTE = [
  "var(--color-blue, #599ed6)",
  "var(--color-green, #4aab80)",
  "var(--color-purple, #9c83e8)",
  "var(--color-orange, #e5a158)",
  "var(--color-cyan, #4fb3d9)",
  "var(--color-pink, #d882b6)",
  "var(--color-yellow, #d4c05a)",
  "var(--color-red, #e06c75)"
];

function pickStableHashColor(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % HASH_PALETTE.length;
  return HASH_PALETTE[idx] || "var(--color-blue, #599ed6)";
}

function getWorkMeta(typeStr, customIcon) {
  const raw = normalizeSpaces(typeStr);
  const low = raw.toLowerCase();
  let icon = "📌";
  let color = raw ? pickStableHashColor(low) : "var(--text-muted)";
  const shortLabel = raw === "Лабораторная работа" ? "Лабораторная" : (raw || "без типа");

  if (low.includes("лаб") || low.includes("лр") || low.includes("опыт") || low.includes("эксперим")) {
    icon = "🧪"; color = "var(--color-green, #4aab80)";
  } else if (low.includes("конф") || low.includes("доклад") || low.includes("выступ") || low.includes("семинар")) {
    icon = "🎤"; color = "var(--color-red, #e06c75)";
  } else if (low.includes("диплом") || low.includes("диссер") || low.includes("магист") || low.includes("вкр")) {
    icon = "🎓"; color = "var(--color-orange, #e5a158)";
  } else if (low.includes("стать") || low.includes("публик") || low.includes("тезис") || low.includes("нир")) {
    icon = "📄"; color = "var(--color-purple, #9c83e8)";
  } else if (low.includes("курс") || low.includes("рефер") || low.includes("чертеж")) {
    icon = "📐"; color = "var(--color-orange, #d69852)";
  } else if (low.includes("экзам") || low.includes("зачет") || low.includes("зачёт") || low.includes("коллок") || low.includes("тест")) {
    icon = "⚡"; color = "var(--color-orange, #e5a158)";
  } else if (low.includes("практ") || low.includes("стажир")) {
    icon = "🔬"; color = "var(--color-cyan, #69b5aa)";
  } else if (low.includes("проект")) {
    icon = "📁"; color = "var(--color-blue, #599ed6)";
  } else if (low.includes("термин")) {
    icon = "🔤"; color = "var(--color-cyan, #4fb3d9)";
  } else if (low.includes("источник") || low.includes("книг") || low.includes("литерат")) {
    icon = "📚"; color = "var(--color-yellow, #d4c05a)";
  } else if (low.includes("конспект") || low.includes("лекц")) {
    icon = "📝"; color = "var(--color-green, #8bac5e)";
  } else if (low.includes("рисунок") || low.includes("схема") || low.includes("граф")) {
    icon = "🖼"; color = "var(--color-cyan, #69b5aa)";
  } else if (low.includes("таблица")) {
    icon = "📊"; color = "var(--color-blue, #5c8df6)";
  } else if (low.includes("расчёт") || low.includes("расчет") || low.includes("формул")) {
    icon = "🧮"; color = "var(--color-red, #e06c75)";
  } else if (low.includes("алгоритм") || low.includes("метод")) {
    icon = "⚙️"; color = "var(--color-purple, #9c83e8)";
  }

  if (customIcon && String(customIcon).trim()) {
    icon = String(customIcon).trim();
  }

  return { icon, color, label: icon + " " + shortLabel };
}

function daysUntilISO(iso) {
  const parts = String(iso || "").split("-").map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  if (!y || !m || !d) return 999;
  const now = new Date();
  const todayLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetLocalMidnight = new Date(y, m - 1, d);
  return Math.round((targetLocalMidnight.getTime() - todayLocalMidnight.getTime()) / 86400000);
}

function pluralizeDays(n) {
  return Math.abs(Math.trunc(n)) + " " + plural(n, ["день", "дня", "дней"]);
}

function getDeadlineTone(iso, isCompleted) {
  if (!iso || isCompleted) return "none";
  const diff = daysUntilISO(iso);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "soon";
  return "far";
}

function formatDeadlineBadge(iso, isCompleted) {
  if (!iso) return "";
  if (isCompleted) {
    return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
  }
  const diff = daysUntilISO(iso);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff > 1) return "осталось " + pluralizeDays(diff);
  if (diff === -1) return "просрочено на 1 день";
  return "просрочено на " + pluralizeDays(Math.abs(diff));
}

function formatFullDateTooltip(iso) {
  const parts = String(iso || "").split("-");
  if (parts.length !== 3) return String(iso || "");
  return "Срок: " + parts[2] + "." + parts[1] + "." + parts[0];
}

async function saveProp(path, fn) {
  const f = app.vault.getAbstractFileByPath(path);
  if (!f) throw new Error("файл не найден");
  await app.fileManager.processFrontMatter(f, fn);
}

async function ensureFolderExists(folderPath) {
  const parts = folderPath.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur = cur ? cur + "/" + part : part;
    if (!(await app.vault.adapter.exists(cur))) {
      await app.vault.createFolder(cur);
    }
  }
}

// --- Состояние витрины проектов ---
if (!window.__dhStudyUiState || typeof window.__dhStudyUiState !== "object") {
  window.__dhStudyUiState = {
    localOverrides: new Map(),
    localCreatedNotes: [],
    openDeadlineFor: null,
    renamingWorkPath: null,
    showNewWorkBar: false,
    completedSectionOpen: false
  };
} else {
  const s = window.__dhStudyUiState;
  if (!(s.localOverrides instanceof Map)) s.localOverrides = new Map();
  if (!Array.isArray(s.localCreatedNotes)) s.localCreatedNotes = [];
  if (s.openDeadlineFor === undefined) s.openDeadlineFor = null;
  if (s.renamingWorkPath === undefined) s.renamingWorkPath = null;
  if (s.showNewWorkBar === undefined) s.showNewWorkBar = false;
  if (s.completedSectionOpen === undefined) s.completedSectionOpen = false;
  for (const deadKey of [
    "expandedPaths",
    "localGraphCoords",
    "graphViewTransform",
    "openAddMatFor",
    "selectedGraphWorkPath",
    "graphForces",
    "graphLayout",
    "graphView",
    "graphSettingsOpen"
  ]) {
    delete s[deadKey];
  }
}
const uiState = window.__dhStudyUiState;
const { localOverrides, localCreatedNotes } = uiState;

// --- Состояние тем, форм и списка карточек ---
function ensureStudyCardsState() {
  const defaults = {
    selectedDeckPath: "ALL",
    isNewDeckFormOpen: false,
    newDeckDraft: { title: "", parentProjectPath: "", discipline: "", defaultBi: false },

    isAddCardsOpen: false,
    addMode: "SINGLE",
    singleDraft: { q: "", a: "", hint: "", isBi: false },
    bulkDraft: { text: "", defaultBi: false },
    lastAddedBadge: null,

    isListManageOpen: false,
    editingCardKey: null,

    localCreatedDecks: []
  };

  if (!window.__dhStudyCardsState || typeof window.__dhStudyCardsState !== "object") {
    window.__dhStudyCardsState = { ...defaults };
  } else {
    const s = window.__dhStudyCardsState;
    for (const [k, v] of Object.entries(defaults)) {
      if (s[k] === undefined) s[k] = v;
    }
    if (!Array.isArray(s.localCreatedDecks)) s.localCreatedDecks = [];
    if (!s.newDeckDraft || typeof s.newDeckDraft !== "object") {
      s.newDeckDraft = { title: "", parentProjectPath: "", discipline: "", defaultBi: false };
    }
    if (!s.singleDraft || typeof s.singleDraft !== "object") {
      s.singleDraft = { q: "", a: "", hint: "", isBi: false };
    }
    if (!s.bulkDraft || typeof s.bulkDraft !== "object") {
      s.bulkDraft = { text: "", defaultBi: false };
    }
  }
  return window.__dhStudyCardsState;
}
const ui = ensureStudyCardsState();

// Очистка старого тренажёра при замене скрипта без перезапуска Obsidian.
// Заметки, черновики форм, localStorage и состояние плагина не изменяются.
if (window.__dhStudyCardsKeyHandler) {
  window.removeEventListener("keydown", window.__dhStudyCardsKeyHandler);
  delete window.__dhStudyCardsKeyHandler;
}
if (window.__dhStudyPortalWatchTimer !== undefined) {
  window.clearInterval(window.__dhStudyPortalWatchTimer);
  delete window.__dhStudyPortalWatchTimer;
}
document.getElementById("dh-study-cards-fullscreen-portal")?.remove();
for (const key of Object.keys(ui)) {
  if (key.startsWith("trainer") || key === "isTrainerOpen" || key === "isTrainerFullscreen") {
    delete ui[key];
  }
}

// Параметры сверены с OpenTrainerParams и openTrainer в исходниках плагина.
function openStudyTrainer(mode = "DUE_AND_NEW") {
  const plugin = app.plugins?.plugins?.["my-sr-trainer"];
  if (!plugin || typeof plugin.openTrainer !== "function") {
    notify("Включи плагин my-sr-trainer версии 0.1.2 или совместимой в настройках Obsidian.");
    return;
  }
  try {
    const params = { scope: "study", mode };
    if (typeof ui.selectedDeckPath === "string" && ui.selectedDeckPath !== "ALL" && ui.selectedDeckPath.trim()) {
      params.deckPath = ui.selectedDeckPath;
    }
    plugin.openTrainer(params);
  } catch (error) {
    notify("Не удалось открыть my-sr-trainer: " + (error instanceof Error ? error.message : String(error)));
  }
}

if (!window.__dhStudyCardsWriteQueue) {
  window.__dhStudyCardsWriteQueue = Promise.resolve();
}
function enqueueDiskWrite(taskFn) {
  const next = window.__dhStudyCardsWriteQueue.catch(() => {}).then(taskFn);
  window.__dhStudyCardsWriteQueue = next;
  return next;
}

const root = dv.container.createDiv({ cls: "dh dh-study-section", attr: { style: "margin: 8px 0 24px 0;" } });

// --- Единая таблица стилей страницы ---
const STUDY_HUB_CSS = [
  ".dashboard-home .dh-study-section { --dh-sp-s1: 4px; --dh-sp-s2: 8px; --dh-sp-s3: 12px; --dh-sp-s4: 16px; --dh-sp-fs-title: 1.02rem; --dh-sp-fs: 0.84rem; --dh-sp-fs-xs: 0.74rem; box-sizing: border-box; width: 100%; }",
  ".dashboard-home .dh-study-section * { box-sizing: border-box; }",
  ".dashboard-home .dh-study-section button, .dashboard-home .dh-study-section select { touch-action: manipulation; }",
  ".dashboard-home .dh-sp-topbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--dh-sp-s2) var(--dh-sp-s3); margin-bottom: var(--dh-sp-s3); }",
  ".dashboard-home .dh-sp-topbar-left { display: flex; align-items: baseline; gap: var(--dh-sp-s2); flex-wrap: wrap; }",
  ".dashboard-home .dh-sp-heading { font-size: var(--dh-sp-fs-title); font-weight: 600; color: var(--text-normal); }",
  ".dashboard-home .dh-sp-summary { font-size: var(--dh-sp-fs-xs); color: var(--text-muted); }",
  ".dashboard-home .dh-sp-topbar-actions { display: flex; align-items: center; gap: var(--dh-sp-s2); flex-wrap: wrap; }",
  ".dashboard-home .dh-sp-btn { height: 32px !important; min-height: 32px !important; padding: 0 var(--dh-sp-s3) !important; border-radius: 8px !important; font-size: var(--dh-sp-fs) !important; font-weight: 500 !important; background: var(--background-secondary) !important; border: 1px solid var(--background-modifier-border) !important; color: var(--text-normal) !important; cursor: pointer; box-shadow: none !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; white-space: nowrap; transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.12s ease; }",
  ".dashboard-home .dh-sp-btn:hover { background: var(--background-modifier-hover) !important; }",
  ".dashboard-home .dh-sp-btn:active { transform: scale(0.97); }",
  ".dashboard-home .dh-sp-btn.is-accent { color: var(--interactive-accent) !important; background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary)) !important; border-color: color-mix(in srgb, var(--interactive-accent) 36%, var(--background-modifier-border)) !important; }",
  ".dashboard-home .dh-sp-btn.is-accent:hover { background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-secondary)) !important; }",
  ".dashboard-home .dh-sp-btn.is-active { border-color: var(--interactive-accent) !important; color: var(--interactive-accent) !important; }",
  ".dashboard-home .dh-sp-new-box { padding: var(--dh-sp-s4); margin-bottom: var(--dh-sp-s4); background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 12px; display: flex; flex-direction: column; gap: var(--dh-sp-s2); animation: dh-sp-fade-in 0.18s ease-out; }",
  "@keyframes dh-sp-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }",
  ".dashboard-home .dh-sp-new-row { display: flex; gap: var(--dh-sp-s2); align-items: center; flex-wrap: wrap; min-width: 0; }",
  ".dashboard-home .dh-sp-icon-pick-btn { width: 32px !important; min-width: 32px !important; height: 32px !important; min-height: 32px !important; padding: 0 !important; border-radius: 8px !important; font-size: var(--dh-sp-fs-title) !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; background: var(--background-primary) !important; border: 1px solid var(--background-modifier-border) !important; cursor: pointer; box-shadow: none !important; }",
  ".dashboard-home .dh-sp-input { height: 32px; min-height: 32px; padding: 0 var(--dh-sp-s2); border-radius: 8px; font-size: var(--dh-sp-fs); min-width: 0; }",
  ".dashboard-home .dh-sp-icons-bar { display: flex; gap: var(--dh-sp-s1); align-items: center; flex-wrap: wrap; padding-top: var(--dh-sp-s2); border-top: 1px solid var(--background-modifier-border); }",
  "/* Сетка плиток: auto-fit растягивает плитки на всю ширину без пустой дыры справа */",
  ".dashboard-home .dh-sp-grid { display: grid; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: var(--dh-sp-s4); margin-bottom: var(--dh-sp-s4); align-items: stretch; }",
  ".dashboard-home .dh-sp-grid[data-count='1'] { grid-template-columns: minmax(0, 520px); }",
  ".dashboard-home .dh-sp-card { position: relative; width: 100%; min-width: 0; overflow: hidden; padding: var(--dh-sp-s4) !important; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-top: 3px solid var(--card-accent, var(--interactive-accent)); border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: var(--dh-sp-s3); transition: border-color 0.16s ease, background-color 0.16s ease; }",
  ".dashboard-home .dh-sp-card:hover { border-color: color-mix(in srgb, var(--card-accent, var(--interactive-accent)) 50%, var(--background-modifier-border)); border-top-color: var(--card-accent, var(--interactive-accent)); }",
  ".dashboard-home .dh-sp-card-top { display: flex; flex-direction: column; gap: var(--dh-sp-s2); min-width: 0; width: 100%; }",
  ".dashboard-home .dh-sp-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--dh-sp-s2); min-width: 0; width: 100%; }",
  ".dashboard-home .dh-sp-card-badges { display: flex; align-items: center; gap: var(--dh-sp-s2); min-width: 0; flex: 1 1 auto; flex-wrap: wrap; }",
  ".dashboard-home .dh-sp-type-pill { font-size: var(--dh-sp-fs-xs); font-weight: 600; padding: 2px var(--dh-sp-s2); border-radius: 6px; background: color-mix(in srgb, var(--card-accent, #599ed6) 15%, transparent); color: color-mix(in srgb, var(--card-accent, #599ed6) 90%, var(--text-normal)); white-space: nowrap; flex-shrink: 0; line-height: 1.4; }",
  ".dashboard-home .dh-sp-discipline { font-size: var(--dh-sp-fs-xs); color: var(--text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dashboard-home .dh-sp-deadline { height: 24px !important; min-height: 24px !important; padding: 0 var(--dh-sp-s2) !important; border-radius: 6px !important; font-size: var(--dh-sp-fs-xs) !important; font-weight: 500 !important; border: 1px solid transparent !important; box-shadow: none !important; cursor: pointer; white-space: nowrap; font-variant-numeric: tabular-nums; flex-shrink: 0; display: inline-flex !important; align-items: center !important; justify-content: center !important; transition: background-color 0.15s ease, border-color 0.15s ease; }",
  ".dashboard-home .dh-sp-deadline.is-far { color: var(--color-green, #4aab80) !important; background: color-mix(in srgb, var(--color-green, #4aab80) 13%, transparent) !important; }",
  ".dashboard-home .dh-sp-deadline.is-soon { color: var(--color-orange, #e5a158) !important; background: color-mix(in srgb, var(--color-orange, #e5a158) 15%, transparent) !important; }",
  ".dashboard-home .dh-sp-deadline.is-overdue { color: var(--text-error, #e06c75) !important; background: color-mix(in srgb, var(--text-error, #e06c75) 15%, transparent) !important; }",
  ".dashboard-home .dh-sp-deadline.is-empty { color: var(--text-muted) !important; background: var(--background-primary) !important; border-color: var(--background-modifier-border) !important; }",
  ".dashboard-home .dh-sp-deadline:hover { border-color: color-mix(in srgb, currentColor 40%, transparent) !important; }",
  ".dashboard-home .dh-sp-title-link { font-size: var(--dh-sp-fs-title); font-weight: 600; color: var(--text-normal); text-decoration: none; line-height: 1.38; overflow-wrap: anywhere; word-break: break-word; margin: 2px 0; display: block; }",
  ".dashboard-home .dh-sp-title-link:hover { color: var(--text-accent); }",
  ".dashboard-home .dh-sp-card-bottom { display: flex; flex-direction: column; gap: var(--dh-sp-s3); min-width: 0; width: 100%; }",
  ".dashboard-home .dh-sp-meta-row { display: flex; justify-content: space-between; align-items: center; gap: var(--dh-sp-s2); min-width: 0; width: 100%; padding-top: var(--dh-sp-s2); border-top: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .dh-sp-meta-text { font-size: var(--dh-sp-fs-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dashboard-home .dh-sp-card-tools { display: inline-flex; align-items: center; gap: var(--dh-sp-s1); flex-shrink: 0; }",
  ".dashboard-home .dh-sp-icon-action { width: 28px !important; min-width: 28px !important; height: 28px !important; min-height: 28px !important; padding: 0 !important; border-radius: 6px !important; font-size: 0.78rem !important; font-weight: 500 !important; line-height: 1 !important; color: var(--text-muted) !important; background: transparent !important; border: 1px solid transparent !important; box-shadow: none !important; cursor: pointer; display: inline-flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0; opacity: 0.55; transition: opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.12s ease; }",
  ".dashboard-home .dh-sp-card:hover .dh-sp-icon-action, .dashboard-home .dh-sp-card:focus-within .dh-sp-icon-action, .dashboard-home .dh-sp-icon-action.is-active { opacity: 1; }",
  ".dashboard-home .dh-sp-icon-action:hover, .dashboard-home .dh-sp-icon-action.is-active { background: var(--background-primary) !important; border-color: var(--background-modifier-border) !important; color: var(--text-normal) !important; }",
  ".dashboard-home .dh-sp-icon-action:active { transform: scale(0.94); }",
  ".dashboard-home .dh-sp-icon-action.is-done:hover { color: var(--color-green, #4aab80) !important; border-color: color-mix(in srgb, var(--color-green, #4aab80) 40%, var(--background-modifier-border)) !important; }",
  ".dashboard-home .dh-sp-icon-action.is-danger { width: auto !important; padding: 0 var(--dh-sp-s2) !important; opacity: 1 !important; color: var(--text-error, #e06c75) !important; background: color-mix(in srgb, var(--text-error, #e06c75) 14%, var(--background-primary)) !important; border-color: color-mix(in srgb, var(--text-error, #e06c75) 45%, var(--background-modifier-border)) !important; font-size: var(--dh-sp-fs-xs) !important; }",
  ".dashboard-home .dh-sp-date-popover { padding: var(--dh-sp-s2); background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); display: flex; flex-wrap: wrap; gap: var(--dh-sp-s1); align-items: center; justify-content: space-between; width: 100%; min-width: 0; animation: dh-sp-fade-in 0.16s ease-out; }",
  ".dashboard-home .dh-sp-card-footer { display: flex; align-items: center; gap: var(--dh-sp-s2); width: 100%; min-width: 0; }",
  ".dashboard-home .dh-sp-open-btn { flex: 1 1 0%; min-width: 0 !important; height: 32px !important; min-height: 32px !important; padding: 0 var(--dh-sp-s3) !important; border-radius: 8px !important; font-size: var(--dh-sp-fs) !important; font-weight: 500 !important; color: var(--interactive-accent) !important; background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary)) !important; border: 1px solid color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border)) !important; box-shadow: none !important; cursor: pointer; display: inline-flex !important; align-items: center !important; justify-content: center !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.12s ease; }",
  ".dashboard-home .dh-sp-open-btn:hover { background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-primary)) !important; }",
  ".dashboard-home .dh-sp-open-btn:active { transform: scale(0.98); }",
  ".dashboard-home .dh-sp-plus-btn { flex: 0 0 32px !important; width: 32px !important; min-width: 32px !important; height: 32px !important; min-height: 32px !important; padding: 0 !important; border-radius: 8px !important; font-size: 1rem !important; font-weight: 500 !important; line-height: 1 !important; color: var(--text-normal) !important; background: var(--background-primary) !important; border: 1px solid var(--background-modifier-border) !important; box-shadow: none !important; cursor: pointer; display: inline-flex !important; align-items: center !important; justify-content: center !important; transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease, transform 0.12s ease; }",
  ".dashboard-home .dh-sp-plus-btn:hover { color: var(--interactive-accent) !important; border-color: var(--interactive-accent) !important; background: var(--background-modifier-hover) !important; }",
  ".dashboard-home .dh-sp-plus-btn:active { transform: scale(0.94); }",
  ".dashboard-home .dh-sp-orphans { padding: var(--dh-sp-s4); margin-bottom: var(--dh-sp-s4); background: var(--background-secondary); border-radius: 12px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: var(--dh-sp-s2); }",
  ".dashboard-home .dh-sp-orphan-row { display: flex; gap: var(--dh-sp-s2); align-items: center; padding: var(--dh-sp-s1) 0; border-top: 1px solid var(--background-modifier-border); flex-wrap: wrap; }",
  ".dashboard-home .dh-sp-done-details { padding: var(--dh-sp-s3) var(--dh-sp-s4); background: var(--background-secondary); border-radius: 12px; border: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .dh-sp-done-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--dh-sp-s2); padding: var(--dh-sp-s2) var(--dh-sp-s3); background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .dh-study-cards-hub { display: flex; flex-direction: column; gap: 14px; margin: 0 0 18px 0; box-sizing: border-box; }",
  ".dashboard-home .dh-study-cards-hub .dsc-panel { padding: 14px 16px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 10px; box-sizing: border-box; }",
  ".dashboard-home .dh-study-cards-hub .dsc-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }",
  ".dashboard-home .dh-study-cards-hub .dsc-title { font-size: 1rem; font-weight: 700; color: var(--text-normal); display: inline-flex; align-items: baseline; gap: 8px; }",
  ".dashboard-home .dh-study-cards-hub .dsc-decks-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .dh-study-cards-hub .dsc-deck-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; height: 28px; border-radius: 999px; font-size: 0.77rem; font-weight: 600; background: var(--background-primary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); cursor: pointer; transition: all 0.14s ease; }",
  ".dashboard-home .dh-study-cards-hub .dsc-deck-chip:hover { border-color: #9c83e8; color: var(--text-normal); }",
  ".dashboard-home .dh-study-cards-hub .dsc-deck-chip.is-active { background: color-mix(in srgb, #9c83e8 18%, var(--background-primary)); border-color: #9c83e8; color: var(--text-normal); }",
  ".dashboard-home .dh-study-cards-hub .dsc-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px; align-items: stretch; }",
  ".dashboard-home .dh-study-cards-hub .dsc-stat-box { padding: 10px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; }",
  ".dashboard-home .dh-study-cards-hub .dsc-stat-label { font-size: 0.73rem; font-weight: 600; color: var(--text-muted); }",
  ".dashboard-home .dh-study-cards-hub .dsc-stat-val-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }",
  ".dashboard-home .dh-study-cards-hub .dsc-stat-val { font-size: 1.32rem; font-weight: 750; color: var(--text-normal); font-variant-numeric: tabular-nums; line-height: 1.15; }",
  ".dashboard-home .dh-study-cards-hub .dsc-stat-hint { font-size: 0.7rem; color: var(--text-muted); }",
  ".dashboard-home .dh-study-cards-hub .dsc-actions-box { padding: 10px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }",
  ".dashboard-home .dh-study-cards-hub .dsc-actions-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }",
  ".dashboard-home .dh-study-cards-hub .dsc-btn-cta { flex: 1.3; min-width: 120px; height: 34px; font-size: 0.8rem; font-weight: 650; padding: 0 10px; border-radius: 7px; cursor: pointer; }",
  ".dashboard-home .dh-study-cards-hub .dsc-btn-sec { flex: 1; min-width: 100px; height: 34px; font-size: 0.78rem; font-weight: 600; padding: 0 10px; border-radius: 7px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); cursor: pointer; }",
  ".dashboard-home .dh-study-cards-hub .dsc-btn-sec.is-active { border-color: #599ed6; color: #599ed6; }",
  ".dashboard-home .dh-study-cards-hub .dsc-drawer { margin-top: 12px; padding: 12px 14px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-top: 2px solid #9c83e8; border-radius: 8px; display: flex; flex-direction: column; gap: 10px; }",
  "/* На сенсорных экранах (iPad / телефон) все действия видны сразу и имеют зону нажатия >= 44x44 px */",
  "@media (pointer: coarse), (any-pointer: coarse), (hover: none) {",
  "  .dashboard-home .dh-sp-btn { height: 40px !important; min-height: 40px !important; }",
  "  .dashboard-home .dh-sp-deadline { height: 32px !important; min-height: 32px !important; padding: 0 10px !important; }",
  "  .dashboard-home .dh-sp-icon-action { width: 44px !important; min-width: 44px !important; height: 44px !important; min-height: 44px !important; opacity: 1 !important; background: var(--background-primary) !important; border-color: var(--background-modifier-border) !important; font-size: 0.9rem !important; }",
  "  .dashboard-home .dh-sp-open-btn { height: 44px !important; min-height: 44px !important; }",
  "  .dashboard-home .dh-sp-plus-btn { flex: 0 0 44px !important; width: 44px !important; min-width: 44px !important; height: 44px !important; min-height: 44px !important; font-size: 1.15rem !important; }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  .dashboard-home .dh-study-section *, .dashboard-home .dh-sp-new-box, .dashboard-home .dh-sp-date-popover { transition: none !important; animation: none !important; }",
  "}",
  "@media (max-width: 640px) {",
  "  .dashboard-home .dh-sp-grid { grid-template-columns: 1fr; gap: var(--dh-sp-s3); }",
  "  .dashboard-home .dh-study-cards-hub .dsc-panel { padding: 10px 12px; }",
  "  .dashboard-home .dh-study-cards-hub .dsc-summary-grid { grid-template-columns: 1fr 1fr; gap: 8px; }",
  "  .dashboard-home .dh-study-cards-hub .dsc-actions-box { grid-column: 1 / -1; padding: 8px 10px; }",
  "}"
].join("\n");

function injectStudyStyles(target = root) {
  const styleEl = target.createEl("style");
  styleEl.textContent = STUDY_HUB_CSS;
}

const openNote = (el, path) => {
  el.onclick = e => {
    e.stopPropagation();
    e.preventDefault();
    app.workspace.openLinkText(path, "", e.ctrlKey || e.metaKey);
  };
  el.onkeydown = e => {
    if (e.key === "Enter") {
      e.stopPropagation();
      e.preventDefault();
      app.workspace.openLinkText(path, "", e.ctrlKey || e.metaKey);
    }
  };
};

// =====================================================================
// ДАННЫЕ ПРОЕКТОВ И МАТЕРИАЛОВ (СИНХРОНИЗИРОВАНО С MY-STUDY-COMPILER)
// =====================================================================
function getDataset() {
  const cfg = getEffectiveCompilerSettings();
  const areaName = cfg.studyAreaName;

  const rawPages = dv.pages().where(p => {
    const areas = flat(p[KEYS.area]).map(x => String(x).trim());
    if (!areas.includes(areaName)) return false;
    return !isTemplateOrExcludedPage(p, cfg);
  }).array();

  const merged = [...rawPages];
  localCreatedNotes.forEach(cn => {
    if (!merged.some(p => p.file.path === cn.file.path)) merged.push(cn);
  });

  const activeAll = merged.filter(p => !localOverrides.get(p.file.path)?.deleted);
  const byPath = new Map(activeAll.map(p => [p.file.path, p]));
  const parentsOf = new Map();
  const children = new Map();
  const link = (child, parent) => {
    if (!children.has(parent)) children.set(parent, []);
    if (!children.get(parent).includes(child)) children.get(parent).push(child);
  };

  activeAll.forEach(p => {
    const ov = localOverrides.get(p.file.path);
    const rawPs = ov?.parents ? ov.parents : parentPaths(p);
    const validPs = [...new Set(rawPs)].filter(pp => pp !== p.file.path && byPath.has(pp));
    parentsOf.set(p.file.path, validPs);
    validPs.forEach(pp => link(p.file.path, pp));
  });

  function descendants(path) {
    const seen = new Set();
    const stack = [...(children.get(path) ?? [])];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x) || x === path) continue;
      seen.add(x);
      (children.get(x) ?? []).forEach(c => stack.push(c));
    }
    return [...seen];
  }

  const getStatus = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && KEYS.status in ov) return ov[KEYS.status];
    return p[KEYS.status];
  };

  const getDeadlineISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && KEYS.deadline in ov) return ov[KEYS.deadline];
    if (ov && KEYS.deadlineAlt in ov) return ov[KEYS.deadlineAlt];
    return toISO(p[KEYS.deadline]) || toISO(p[KEYS.deadlineAlt]);
  };

  const getStartISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && KEYS.start in ov) return ov[KEYS.start];
    return toISO(p[KEYS.start]) || toISO(p.дата) || toISO(p.file?.ctime) || todayISO;
  };

  const getFinishedISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && KEYS.finishedAt in ov) return ov[KEYS.finishedAt];
    if (ov && KEYS.finishedLegacy in ov) return ov[KEYS.finishedLegacy];
    return toISO(p[KEYS.finishedAt]) || toISO(p[KEYS.finishedLegacy]) || toISO(p.file?.mtime) || todayISO;
  };

  const getDisplayName = p => localOverrides.get(p.file.path)?.newName ?? p.file.name;

  const roots = [];
  const orphans = [];
  const rootPathsSet = new Set();

  activeAll.forEach(p => {
    const ps = parentsOf.get(p.file.path) ?? [];
    if (ps.length > 0) return;

    const hasChildren = (children.get(p.file.path)?.length ?? 0) > 0;
    const statusStr = normalizeSpaces(getStatus(p));
    const deadlineIso = getDeadlineISO(p);
    const hasRootMarkers = Boolean(statusStr || deadlineIso);
    const isLegacyLeafMaterial =
      !hasChildren &&
      !hasRootMarkers &&
      LEGACY_MATERIAL_TYPES_LOWER.has(typeOf(p).toLowerCase());

    if (isLegacyLeafMaterial) {
      orphans.push(p);
    } else {
      roots.push(p);
      rootPathsSet.add(p.file.path);
    }
  });

  const byDisplayName = (a, b) => getDisplayName(a).localeCompare(getDisplayName(b), "ru", { numeric: true });

  const works = roots
    .filter(p => !isRootStatusCompleted(getStatus(p)))
    .sort((a, b) => {
      const dA = getDeadlineISO(a) ?? "9999-99-99";
      const dB = getDeadlineISO(b) ?? "9999-99-99";
      if (dA !== dB) return dA.localeCompare(dB);
      return byDisplayName(a, b);
    });

  const completedWorks = roots
    .filter(p => isRootStatusCompleted(getStatus(p)))
    .sort((a, b) => {
      const fA = getFinishedISO(a) ?? "";
      const fB = getFinishedISO(b) ?? "";
      if (fA && fB && fA !== fB) return fB.localeCompare(fA);
      return byDisplayName(a, b);
    });

  orphans.sort((a, b) => (b.file?.mtime?.toMillis?.() ?? 0) - (a.file?.mtime?.toMillis?.() ?? 0) || byDisplayName(a, b));

  const materials = activeAll.filter(p => !rootPathsSet.has(p.file.path));

  return {
    cfg,
    byPath,
    parentsOf,
    children,
    link,
    descendants,
    getStatus,
    getDeadlineISO,
    getStartISO,
    getFinishedISO,
    getDisplayName,
    works,
    completedWorks,
    orphans,
    materials
  };
}

// =====================================================================
// ЧТЕНИЕ СТАТИСТИКИ, СОЗДАНИЕ ТЕМ И РЕДАКТИРОВАНИЕ КАРТОЧЕК
// =====================================================================

function parseFrontQuestionAndHint(rawFront) {
  const cleaned = String(rawFront ?? "").replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
  const hIdx = cleaned.indexOf(HINT_SEP);
  if (hIdx === -1) return { question: cleaned, hint: "" };
  return {
    question: cleaned.slice(0, hIdx).trim(),
    hint: cleaned.slice(hIdx + HINT_SEP.length).trim()
  };
}

function parseDeckFileContent(content, deckInfo, todayISO) {
  const lines = String(content ?? "").split(/\r?\n/);
  const cards = [];

  let totalEntries = 0;
  let singleSidedEntries = 0;
  let biSidedEntries = 0;
  let totalDirections = 0;
  let newDirections = 0;
  let learningDirections = 0;
  let matureDirections = 0;
  let dueDirections = 0;
  let reviewedTodayDirections = 0;

  const srRegex = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g;
  let pendingCard = null;
  let inFrontmatter = false;

  const finalizePendingAsUnscheduled = () => {
    if (!pendingCard) return;
    pendingCard.isUnscheduled = true;
    pendingCard.srLineIndex = null;
    pendingCard.srOnNextLine = false;
    pendingCard.directions = [];
    for (let d = 0; d < pendingCard.expectedDirections; d++) {
      pendingCard.directions.push({
        dirIndex: d,
        dateStr: "2000-01-01",
        interval: 0,
        ease: 250,
        isNew: true,
        isDue: false,
        reviewedToday: false
      });
    }
    newDirections += pendingCard.expectedDirections;
    totalDirections += pendingCard.expectedDirections;
    cards.push(pendingCard);
    pendingCard = null;
  };

  const applySrMatchesToCard = (cardObj, srText, srLineIdx, onNextLine) => {
    const matches = [...srText.matchAll(srRegex)];
    if (!matches.length) {
      cardObj.isUnscheduled = true;
      cardObj.srLineIndex = null;
      cardObj.srOnNextLine = false;
      cardObj.directions = [];
      for (let d = 0; d < cardObj.expectedDirections; d++) {
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
      }
      newDirections += cardObj.expectedDirections;
      totalDirections += cardObj.expectedDirections;
      cards.push(cardObj);
      return;
    }

    cardObj.srLineIndex = srLineIdx;
    cardObj.srOnNextLine = onNextLine;
    cardObj.directions = [];

    let minEase = Infinity;
    let minInterval = Infinity;
    let hasReviewedDirection = false;

    for (let d = 0; d < cardObj.expectedDirections; d++) {
      const m = matches[d];
      totalDirections++;
      if (!m) {
        newDirections++;
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
        continue;
      }

      const [, dateStr, intervalStr, easeStr] = m;
      if (dateStr === "2000-01-01") {
        newDirections++;
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: Number(easeStr) || 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
        continue;
      }

      const isDue = dateStr <= todayISO;
      if (isDue) dueDirections++;

      const interval = Number(intervalStr);
      const ease = Number(easeStr);
      hasReviewedDirection = true;

      if (interval >= MATURE_DAYS) matureDirections++;
      else learningDirections++;

      if (Number.isFinite(ease) && ease < minEase) minEase = ease;
      if (Number.isFinite(interval) && interval < minInterval) minInterval = interval;

      let reviewedToday = false;
      const nextDate = dv.date(dateStr);
      if (nextDate && nextDate.isValid && interval > 0) {
        const lastReviewedISO = nextDate.minus({ days: interval }).toISODate();
        if (lastReviewedISO === todayISO) {
          reviewedTodayDirections++;
          reviewedToday = true;
        }
      }

      cardObj.directions.push({
        dirIndex: d,
        dateStr,
        interval: Number.isFinite(interval) ? interval : 1,
        ease: Number.isFinite(ease) ? ease : 250,
        isNew: false,
        isDue,
        reviewedToday
      });
    }

    cardObj.hasReviewedDirection = hasReviewedDirection;
    cardObj.minEase = hasReviewedDirection && Number.isFinite(minEase) ? minEase : null;
    cardObj.minInterval = hasReviewedDirection && Number.isFinite(minInterval) ? minInterval : null;
    cards.push(cardObj);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }

    const srIdx = line.indexOf("<!--SR:");
    const cardPart = srIdx === -1 ? line : line.slice(0, srIdx);
    const trimmedPart = cardPart.trimStart();

    const isDataviewInlineField = /\([а-яА-Яa-zA-Z0-9_]+::\s*[^)]+\)/.test(cardPart) && !/\s:::{0,1}\s/.test(cardPart);
    const hasCardSep = !trimmedPart.startsWith("#") && !trimmedPart.startsWith("```") && !isDataviewInlineField && /:{2,3}/.test(cardPart);

    if (hasCardSep) {
      finalizePendingAsUnscheduled();

      const isBidirectional = cardPart.includes(":::");
      const sepToken = isBidirectional ? ":::" : "::";
      const sepPos = cardPart.indexOf(sepToken);
      const rawFront = cardPart.slice(0, sepPos).trim();
      const rawBack = cardPart.slice(sepPos + sepToken.length).trim();

      if (!rawFront || !rawBack) continue;

      totalEntries++;
      if (isBidirectional) biSidedEntries++;
      else singleSidedEntries++;

      const expectedDirections = isBidirectional ? 2 : 1;
      const { question, hint } = parseFrontQuestionAndHint(rawFront);

      const cardObj = {
        uidKey: deckInfo.path + ":" + i,
        deckPath: deckInfo.path,
        deckTitle: deckInfo.title,
        lineIndex: i,
        lineNumber: i + 1,
        question,
        answer: rawBack,
        hint,
        isBidirectional,
        expectedDirections,
        isUnscheduled: false,
        hasReviewedDirection: false,
        minEase: null,
        minInterval: null,
        srLineIndex: null,
        srOnNextLine: false,
        directions: []
      };

      if (srIdx !== -1) {
        applySrMatchesToCard(cardObj, line.slice(srIdx), i, false);
      } else {
        pendingCard = cardObj;
      }
    } else if (srIdx !== -1 && pendingCard) {
      applySrMatchesToCard(pendingCard, line.slice(srIdx), i, true);
      pendingCard = null;
    } else if (line.trim() !== "" && pendingCard) {
      finalizePendingAsUnscheduled();
    }
  }
  finalizePendingAsUnscheduled();

  return {
    cards,
    totalEntries,
    singleSidedEntries,
    biSidedEntries,
    totalDirections,
    newDirections,
    learningDirections,
    matureDirections,
    dueDirections,
    reviewedTodayDirections
  };
}

async function loadStudyDecks(activeProjects, todayISO) {
  const rawStudyPages = dv.pages(KNOWLEDGE_FOLDER).array().filter(p => String(p.направление ?? "").trim() === AREA);
  const deckPagesMap = new Map();

  rawStudyPages.forEach(p => {
    const inDecksFolder = p.file.path.startsWith(DECKS_FOLDER + "/");
    const isFlaggedDeck = Boolean(p.колода_карточек) || String(p.подтип ?? "").trim().toLowerCase() === "карточки";
    if (inDecksFolder || isFlaggedDeck) {
      deckPagesMap.set(p.file.path, p);
    }
  });

  try {
    dv.pages('"' + DECKS_FOLDER + '"').array().forEach(p => {
      deckPagesMap.set(p.file.path, p);
    });
  } catch {}

  ui.localCreatedDecks.forEach(cd => {
    if (!deckPagesMap.has(cd.path)) {
      deckPagesMap.set(cd.path, {
        file: { path: cd.path, name: cd.title },
        название_темы: cd.title,
        родитель: cd.parentWiki,
        дисциплина: cd.discipline,
        двусторонние_по_умолчанию: cd.defaultBi
      });
    }
  });

  const decks = [];
  const deckByPath = new Map();
  const allCards = [];

  let sumEntries = 0;
  let sumDirections = 0;
  let sumDue = 0;
  let sumNew = 0;
  let sumLearning = 0;
  let sumMature = 0;
  let sumReviewedToday = 0;

  for (const [path, p] of deckPagesMap.entries()) {
    const fileObj = app.vault.getAbstractFileByPath(path);
    if (!fileObj) continue;

    const fmCache = app.metadataCache.getFileCache(fileObj)?.frontmatter || {};
    const title = String(fmCache.название_темы || p.название_темы || fileObj.basename).trim();
    const discipline = String(fmCache.дисциплина || p.дисциплина || "").trim();
    const defaultBi = Boolean(fmCache.двусторонние_по_умолчанию ?? p.двусторонние_по_умолчанию ?? false);

    let parentName = "";
    const rawParent = fmCache.родитель ?? p.родитель;
    if (rawParent) {
      parentName = stripOuterWikiBrackets(rawParent).split("|").pop().trim();
    }

    const deckInfo = {
      path,
      fileObj,
      fileName: fileObj.basename,
      title,
      discipline,
      parentName,
      defaultBi
    };

    let content = "";
    try {
      content = await app.vault.read(fileObj);
    } catch { continue; }

    const parsed = parseDeckFileContent(content, deckInfo, todayISO);
    const fullDeck = { ...deckInfo, ...parsed };

    decks.push(fullDeck);
    deckByPath.set(path, fullDeck);
    allCards.push(...parsed.cards);

    sumEntries += parsed.totalEntries;
    sumDirections += parsed.totalDirections;
    sumDue += parsed.dueDirections;
    sumNew += parsed.newDirections;
    sumLearning += parsed.learningDirections;
    sumMature += parsed.matureDirections;
    sumReviewedToday += parsed.reviewedTodayDirections;
  }

  decks.sort((a, b) => b.dueDirections - a.dueDirections || a.title.localeCompare(b.title, "ru"));

  return {
    activeProjects,
    decks,
    deckByPath,
    allCards,
    totals: {
      sumEntries,
      sumDirections,
      sumDue,
      sumNew,
      sumLearning,
      sumMature,
      sumReviewedToday
    }
  };
}

async function createStudyDeckNote({ title, parentProject, discipline, defaultBi }) {
  await ensureFolderExists(DECKS_FOLDER);
  const safeName = title.replace(/[\\/:*?"<>|#^\[\]]/g, "").trim();
  if (!safeName) throw new Error("Укажи корректное название темы.");

  const targetPath = DECKS_FOLDER + "/" + safeName + ".md";
  if (app.vault.getAbstractFileByPath(targetPath)) {
    throw new Error("Тема «" + safeName + "» уже существует.");
  }

  const parentWiki = parentProject ? "[[" + parentProject.file.name + "]]" : "";
  const discVal = discipline || (parentProject && typeof parentProject.дисциплина === "string" ? parentProject.дисциплина.trim() : "");

  const yamlLines = [
    "---",
    "направление: " + AREA,
    'тип: "Заметка"',
    'подтип: "Карточки"',
    "колода_карточек: true",
    "название_темы: " + JSON.stringify(title),
    "родитель: " + (parentWiki ? JSON.stringify(parentWiki) : ""),
    "дисциплина: " + (discVal ? JSON.stringify(discVal) : ""),
    "двусторонние_по_умолчанию: " + Boolean(defaultBi),
    "---",
    "",
    "# 🧠 " + title,
    ""
  ];

  const created = await app.vault.create(targetPath, yamlLines.join("\n"));
  ui.localCreatedDecks.push({
    path: created.path,
    title,
    parentWiki,
    discipline: discVal,
    defaultBi: Boolean(defaultBi)
  });
  return created;
}

function parseBulkInputLines(rawText, defaultBi) {
  const lines = String(rawText ?? "").split(/\r?\n/);
  const parsed = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim().replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let qPart = "";
    let aPart = "";
    let isBi = Boolean(defaultBi);

    if (trimmed.includes(":::")) {
      const idx = trimmed.indexOf(":::");
      qPart = trimmed.slice(0, idx).trim();
      aPart = trimmed.slice(idx + 3).trim();
      isBi = true;
    } else if (trimmed.includes("::")) {
      const idx = trimmed.indexOf("::");
      qPart = trimmed.slice(0, idx).trim();
      aPart = trimmed.slice(idx + 2).trim();
      isBi = false;
    } else if (trimmed.includes("\t")) {
      const idx = trimmed.indexOf("\t");
      qPart = trimmed.slice(0, idx).trim();
      aPart = trimmed.slice(idx + 1).trim();
    } else if (trimmed.includes(" — ")) {
      const idx = trimmed.indexOf(" — ");
      qPart = trimmed.slice(0, idx).trim();
      aPart = trimmed.slice(idx + 3).trim();
    } else if (trimmed.includes(" - ")) {
      const idx = trimmed.indexOf(" - ");
      qPart = trimmed.slice(0, idx).trim();
      aPart = trimmed.slice(idx + 3).trim();
    }

    if (qPart && aPart) {
      const { question, hint } = parseFrontQuestionAndHint(qPart);
      parsed.push({
        question: cleanLineText(question),
        answer: cleanLineText(aPart),
        hint: cleanLineText(hint),
        isBi
      });
    }
  }
  return parsed;
}




async function modifyStudyCardLine(card, { newQuestion, newAnswer, newHint, newIsBi, deleteCard = false }) {
  return enqueueDiskWrite(async () => {
    const fileObj = app.vault.getAbstractFileByPath(card.deckPath);
    if (!fileObj) throw new Error("Файл темы не найден.");

    const rawContent = await app.vault.read(fileObj);
    const lines = rawContent.split(/\r?\n/);
    const idx = card.lineIndex;
    if (!lines[idx]) throw new Error("Строка не найдена.");

    if (deleteCard) {
      if (card.srOnNextLine && lines[idx + 1] && lines[idx + 1].includes("<!--SR:")) {
        lines.splice(idx, 2);
      } else {
        lines.splice(idx, 1);
      }
      await app.vault.modify(fileObj, lines.join("\n"));
      return;
    }

    const line = lines[idx];
    const srIdx = line.indexOf("<!--SR:");
    const srTail = srIdx !== -1 ? " " + line.slice(srIdx).trim() : "";

    const sep = newIsBi ? ":::" : "::";
    const frontPart = newHint ? cleanLineText(newQuestion) + HINT_SEP + cleanLineText(newHint) : cleanLineText(newQuestion);
    lines[idx] = frontPart + " " + sep + " " + cleanLineText(newAnswer) + srTail;

    await app.vault.modify(fileObj, lines.join("\n"));
  });
}


// =====================================================================
// ОТРИСОВКА СЕКЦИИ КАРТОЧЕК
// =====================================================================
let focusQuestionAfterRender = false;

async function renderCardsSection(cardsContainer, activeProjects) {
  ensureStudyCardsState();
  cardsContainer.empty();

  const data = await loadStudyDecks(activeProjects, todayISO);
  const { decks, deckByPath, allCards, totals } = data;

  if (ui.selectedDeckPath !== "ALL" && !deckByPath.has(ui.selectedDeckPath)) {
    ui.selectedDeckPath = decks.length > 0 ? decks[0].path : "ALL";
  }

  const activeDeck = ui.selectedDeckPath === "ALL" ? null : deckByPath.get(ui.selectedDeckPath);
  const scopedCards = activeDeck ? activeDeck.cards : allCards;

  let scopedDue = activeDeck ? activeDeck.dueDirections : totals.sumDue;
  let scopedNew = activeDeck ? activeDeck.newDirections : totals.sumNew;
  let scopedEntries = activeDeck ? activeDeck.totalEntries : totals.sumEntries;
  let scopedDirections = activeDeck ? activeDeck.totalDirections : totals.sumDirections;
  let scopedMature = activeDeck ? activeDeck.matureDirections : totals.sumMature;
  let scopedReviewedToday = activeDeck ? activeDeck.reviewedTodayDirections : totals.sumReviewedToday;


  const panel = cardsContainer.createDiv({ cls: "dsc-panel" });

  // 1. Минималистичная шапка блока карточек
  const head = panel.createDiv({ cls: "dsc-head" });
  const titleWrap = head.createDiv({ cls: "dsc-title" });
  titleWrap.createSpan({ text: "🧠 Карточки" });
  titleWrap.createSpan({
    text: decks.length + " тем · " + totals.sumEntries + " вопр.",
    attr: { style: "font-size: 0.76rem; font-weight: 500; color: var(--text-muted);" }
  });

  const headRight = head.createDiv({ attr: { style: "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;" } });

  if (scopedEntries > 0) {
    const cramBtn = headRight.createEl("button", {
      cls: "dh-chip",
      text: "🎯 Краш-тест",
      attr: {
        type: "button",
        title: "Прогнать все карточки выбранной темы подряд",
        style: "font-size: 0.74rem; font-weight: 600; padding: 3px 10px; color: #e5a158; border-color: #e5a15855; cursor: pointer;"
      }
    });
    cramBtn.onclick = () => {
      openStudyTrainer("CRAM_ALL");
    };
  }

  const newDeckBtn = headRight.createEl("button", {
    cls: "dh-chip" + (ui.isNewDeckFormOpen ? " is-active" : ""),
    text: ui.isNewDeckFormOpen ? "✕ Отмена" : "+ Тема",
    attr: {
      type: "button",
      style: "font-size: 0.75rem; font-weight: 600; padding: 3px 11px; cursor: pointer; border-color: #9c83e866; color: #9c83e8;"
    }
  });
  newDeckBtn.onclick = () => {
    ui.isNewDeckFormOpen = !ui.isNewDeckFormOpen;
    renderCardsSection(cardsContainer, activeProjects);
  };

  // --- Форма создания новой темы ---
  if (ui.isNewDeckFormOpen) {
    const ndBox = panel.createDiv({ cls: "dsc-drawer" });
    ndBox.createDiv({
      text: "Новая тема карточек",
      attr: { style: "font-size: 0.84rem; font-weight: 650; color: var(--text-normal);" }
    });

    const ndGrid = ndBox.createDiv({
      attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;" }
    });

    const titleInp = ndGrid.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Название темы / теста *",
        value: ui.newDeckDraft.title || "",
        style: "font-size: 0.82rem; height: 32px; padding: 2px 10px;"
      }
    });
    titleInp.oninput = () => { ui.newDeckDraft.title = titleInp.value; };

    const projSel = ndGrid.createEl("select", {
      cls: "dropdown",
      attr: { style: "font-size: 0.8rem; height: 32px;" }
    });
    projSel.createEl("option", { text: "Привязка к проекту (необязательно)", value: "" });
    activeProjects.forEach(p => {
      const o = projSel.createEl("option", { text: "📁 " + p.file.name, value: p.file.path });
      if (ui.newDeckDraft.parentProjectPath === p.file.path) o.selected = true;
    });
    projSel.onchange = () => { ui.newDeckDraft.parentProjectPath = projSel.value; };

    const typeDefaultSel = ndGrid.createEl("select", {
      cls: "dropdown",
      attr: { style: "font-size: 0.8rem; height: 32px;" }
    });
    typeDefaultSel.createEl("option", { text: "По умолчанию: :: Односторонние (Вопрос → Ответ)", value: "single" });
    const biOpt = typeDefaultSel.createEl("option", { text: "По умолчанию: ::: Двусторонние (Термин ⇄ Определение)", value: "bi" });
    if (ui.newDeckDraft.defaultBi) biOpt.selected = true;
    typeDefaultSel.onchange = () => { ui.newDeckDraft.defaultBi = typeDefaultSel.value === "bi"; };

    const ndActions = ndBox.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 8px;" } });
    const createDeckBtn = ndActions.createEl("button", {
      cls: "dh-btn mod-cta",
      text: "Создать тему",
      attr: { type: "button", style: "font-size: 0.8rem; height: 30px; padding: 0 14px;" }
    });

    const doCreateDeck = async () => {
      if (createDeckBtn.disabled) return;
      const t = titleInp.value.trim();
      if (!t) {
        notify("Введи название темы.");
        titleInp.focus();
        return;
      }
      createDeckBtn.disabled = true;
      try {
        const parentProj = activeProjects.find(p => p.file.path === projSel.value) || null;
        const created = await createStudyDeckNote({
          title: t,
          parentProject: parentProj,
          discipline: "",
          defaultBi: ui.newDeckDraft.defaultBi
        });
        ui.selectedDeckPath = created.path;
        ui.singleDraft.isBi = Boolean(ui.newDeckDraft.defaultBi);
        ui.bulkDraft.defaultBi = Boolean(ui.newDeckDraft.defaultBi);
        ui.isNewDeckFormOpen = false;
        ui.isAddCardsOpen = true;
        ui.newDeckDraft = { title: "", parentProjectPath: "", discipline: "", defaultBi: false };
        focusQuestionAfterRender = true;
        notify("Тема «" + t + "» создана.");
        await renderAll();
      } catch (e) {
        notify("Ошибка: " + e.message);
        createDeckBtn.disabled = false;
      }
    };
    createDeckBtn.onclick = doCreateDeck;
    titleInp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); doCreateDeck(); } };
  }

  // 2. Панель выбора темы
  if (decks.length > 0) {
    const decksBar = panel.createDiv({ cls: "dsc-decks-bar" });

    const allChip = decksBar.createEl("button", {
      cls: "dsc-deck-chip" + (ui.selectedDeckPath === "ALL" ? " is-active" : ""),
      text: "📚 Все темы (" + totals.sumEntries + ")",
      attr: { type: "button" }
    });
    allChip.onclick = () => {
      ui.selectedDeckPath = "ALL";
      renderCardsSection(cardsContainer, activeProjects);
    };

    decks.forEach(d => {
      const isAct = ui.selectedDeckPath === d.path;
      const dueBadge = d.dueDirections > 0 ? " · 🔥" + d.dueDirections : "";
      const chip = decksBar.createEl("button", {
        cls: "dsc-deck-chip" + (isAct ? " is-active" : ""),
        text: d.title + " (" + d.totalEntries + dueBadge + ")",
        attr: {
          type: "button",
          title: d.parentName ? "Проект: " + d.parentName : "Файл: " + d.path
        }
      });
      chip.onclick = () => {
        ui.selectedDeckPath = d.path;
        ui.singleDraft.isBi = d.defaultBi;
        ui.bulkDraft.defaultBi = d.defaultBi;
        renderCardsSection(cardsContainer, activeProjects);
      };
    });

    if (activeDeck) {
      const openDeckNoteLink = decksBar.createEl("a", {
        cls: "internal-link",
        text: "📄 " + activeDeck.fileName,
        attr: {
          href: activeDeck.path,
          style: "margin-left: auto; font-size: 0.74rem; color: var(--text-muted); text-decoration: none;"
        }
      });
      openDeckNoteLink.onclick = e => {
        e.preventDefault();
        app.workspace.openLinkText(activeDeck.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };
    }
  } else {
    panel.createDiv({
      text: "Учебных тем с карточками пока нет. Нажми «+ Тема» в правом верхнем углу, чтобы создать первую тему.",
      attr: {
        style: "padding: 12px; margin-bottom: 10px; font-size: 0.82rem; color: var(--text-muted); background: var(--background-primary); border-radius: 8px; border: 1px dashed var(--background-modifier-border);"
      }
    });
  }

  // 3. Сводные плитки и действия
  const summaryGrid = panel.createDiv({ cls: "dsc-summary-grid" });

  const dueBox = summaryGrid.createDiv({
    cls: "dsc-stat-box",
    attr: { style: "border-top: 2px solid " + (scopedDue > 0 ? "#e5a158" : "#4aab80") + ";" }
  });
  dueBox.createDiv({ cls: "dsc-stat-label", text: activeDeck ? "К повторению · " + activeDeck.title : "К повторению" });
  const dueValRow = dueBox.createDiv({ cls: "dsc-stat-val-row" });
  const dueValSpan = dueValRow.createSpan({
    cls: "dsc-stat-val",
    text: String(scopedDue),
    attr: { style: "color: " + (scopedDue > 0 ? "#e5a158" : "#4aab80") + ";" }
  });
  const dueSubSpan = dueValRow.createSpan({
    text: scopedDue === 0 ? "Очередь закрыта ✓" : "карт. по расписанию",
    attr: { style: "font-size: 0.71rem; color: var(--text-muted);" }
  });
  const dueHintDiv = dueBox.createDiv({
    cls: "dsc-stat-hint",
    text: scopedNew > 0 ? "+ " + scopedNew + " новых в запасе" : "Вопросов в выборке: " + scopedEntries
  });

  const masteryPct = scopedDirections > 0 ? Math.round((scopedMature / scopedDirections) * 100) : 0;
  const mastBox = summaryGrid.createDiv({
    cls: "dsc-stat-box",
    attr: { style: "border-top: 2px solid #9c83e8;" }
  });
  mastBox.createDiv({ cls: "dsc-stat-label", text: "Усвоение и база" });
  const mastValRow = mastBox.createDiv({ cls: "dsc-stat-val-row" });
  mastValRow.createSpan({
    cls: "dsc-stat-val",
    text: scopedEntries + " вопр."
  });
  mastValRow.createSpan({
    text: "закреплено " + masteryPct + "%",
    attr: { style: "font-size: 0.72rem; font-weight: 600; color: #4aab80;" }
  });
  const mastHintDiv = mastBox.createDiv({
    cls: "dsc-stat-hint",
    text: "За день: " + scopedReviewedToday + " · Сторон: " + scopedDirections
  });


  const actBox = summaryGrid.createDiv({ cls: "dsc-actions-box" });
  const actRow = actBox.createDiv({ cls: "dsc-actions-row" });

  const trainBtn = actRow.createEl("button", {
    cls: "dh-btn mod-cta dsc-btn-cta",
    text: scopedDue > 0 ? "▶ Тренировать (" + scopedDue + ")" : "▶ Тренировать",
    attr: {
      type: "button",
      title: "Открыть учебные карточки в my-sr-trainer",
      "aria-label": "Открыть учебные карточки"
    }
  });
  trainBtn.onclick = () => {
    openStudyTrainer(scopedDue === 0 && scopedNew === 0 ? "CRAM_ALL" : "DUE_AND_NEW");
  };


  const addCardsBtn = actRow.createEl("button", {
    cls: "dsc-btn-sec" + (ui.isAddCardsOpen ? " is-active" : ""),
    text: ui.isAddCardsOpen ? "✕ Скрыть" : "+ Вопросы",
    attr: { type: "button" }
  });
  addCardsBtn.onclick = () => {
    if (decks.length === 0) {
      ui.isNewDeckFormOpen = true;
      notify("Сначала укажи название темы.");
    } else {
      ui.isAddCardsOpen = !ui.isAddCardsOpen;
      if (ui.isAddCardsOpen) focusQuestionAfterRender = true;
    }
    renderCardsSection(cardsContainer, activeProjects);
  };

  if (scopedEntries > 0) {
    const listManageBtn = actRow.createEl("button", {
      cls: "dsc-btn-sec" + (ui.isListManageOpen ? " is-active" : ""),
      text: ui.isListManageOpen ? "✕ Список" : "📋 (" + scopedEntries + ")",
      attr: { type: "button", title: "Показать все вопросы темы для просмотра и правки" }
    });
    listManageBtn.onclick = () => {
      ui.isListManageOpen = !ui.isListManageOpen;
      renderCardsSection(cardsContainer, activeProjects);
    };
  }

  // 4. Форма добавления вопросов
  if (ui.isAddCardsOpen && decks.length > 0) {
    const addDrawer = panel.createDiv({ cls: "dsc-drawer" });

    const topAddBar = addDrawer.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;" }
    });

    const leftTargetRow = topAddBar.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });
    leftTargetRow.createSpan({ text: "Тема:", attr: { style: "font-size: 0.8rem; font-weight: 600; color: var(--text-muted);" } });

    const targetDeckSel = leftTargetRow.createEl("select", {
      cls: "dropdown",
      attr: { style: "font-size: 0.82rem; height: 30px; font-weight: 600;" }
    });
    const effectiveTargetDeckPath = ui.selectedDeckPath !== "ALL" ? ui.selectedDeckPath : decks[0].path;
    decks.forEach(d => {
      const o = targetDeckSel.createEl("option", { text: d.title, value: d.path });
      if (d.path === effectiveTargetDeckPath) o.selected = true;
    });
    targetDeckSel.onchange = () => {
      ui.selectedDeckPath = targetDeckSel.value;
      renderCardsSection(cardsContainer, activeProjects);
    };

    if (ui.lastAddedBadge) {
      const badge = leftTargetRow.createSpan({
        text: "✓ " + ui.lastAddedBadge,
        attr: {
          style: "font-size: 0.73rem; font-weight: 600; color: #4aab80; background: #4aab8018; border: 1px solid #4aab8044; padding: 2px 8px; border-radius: 5px;"
        }
      });
      setTimeout(() => {
        ui.lastAddedBadge = null;
        if (badge.isConnected) badge.remove();
      }, 4500);
    }

    const modeTabs = topAddBar.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 5px;" } });
    [
      { id: "SINGLE", label: "✍️ По одной" },
      { id: "BULK", label: "📋 Списком" }
    ].forEach(tab => {
      const b = modeTabs.createEl("button", {
        cls: "dh-chip" + (ui.addMode === tab.id ? " is-active" : ""),
        text: tab.label,
        attr: { type: "button", style: "font-size: 0.75rem; padding: 3px 10px; cursor: pointer;" }
      });
      b.onclick = () => {
        ui.addMode = tab.id;
        renderCardsSection(cardsContainer, activeProjects);
      };
    });

    if (ui.addMode === "SINGLE") {
      const dirTypeRow = addDrawer.createDiv({
        attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" }
      });
      dirTypeRow.createSpan({ text: "Формат:", attr: { style: "font-size: 0.76rem; color: var(--text-muted);" } });

      const singleDirBtn = dirTypeRow.createEl("button", {
        cls: "dh-chip" + (!ui.singleDraft.isBi ? " is-active" : ""),
        text: "→ Односторонняя (:: Вопрос → Ответ)",
        attr: { type: "button", style: "font-size: 0.74rem; padding: 2px 10px; cursor: pointer;" }
      });
      const biDirBtn = dirTypeRow.createEl("button", {
        cls: "dh-chip" + (ui.singleDraft.isBi ? " is-active" : ""),
        text: "⇄ Двусторонняя (::: Термин ⇄ Определение)",
        attr: { type: "button", style: "font-size: 0.74rem; padding: 2px 10px; cursor: pointer;" }
      });
      singleDirBtn.onclick = () => { ui.singleDraft.isBi = false; renderCardsSection(cardsContainer, activeProjects); };
      biDirBtn.onclick = () => { ui.singleDraft.isBi = true; renderCardsSection(cardsContainer, activeProjects); };

      const inputsRow = addDrawer.createDiv({
        attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px;" }
      });

      const qInp = inputsRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: ui.singleDraft.isBi ? "Термин / Понятие / Формула *" : "Вопрос билета / теста *",
          value: ui.singleDraft.q || "",
          style: "font-size: 0.84rem; height: 34px; padding: 4px 10px;"
        }
      });
      qInp.oninput = () => { ui.singleDraft.q = qInp.value; };

      const aInp = inputsRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: ui.singleDraft.isBi ? "Определение / Значение *" : "Правильный ответ *",
          value: ui.singleDraft.a || "",
          style: "font-size: 0.84rem; height: 34px; padding: 4px 10px;"
        }
      });
      aInp.oninput = () => { ui.singleDraft.a = aInp.value; };

      const bottomRow = addDrawer.createDiv({
        attr: { style: "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;" }
      });

      const hintInp = bottomRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: "Пояснение на обороте (необязательно)",
          value: ui.singleDraft.hint || "",
          style: "flex: 1; min-width: 180px; font-size: 0.8rem; height: 32px; padding: 4px 10px;"
        }
      });
      hintInp.oninput = () => { ui.singleDraft.hint = hintInp.value; };

      const saveSingleBtn = bottomRow.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "+ Сохранить",
        attr: { type: "button", style: "font-size: 0.82rem; height: 32px; padding: 0 16px; white-space: nowrap;" }
      });

      const submitSingleCard = async () => {
        if (saveSingleBtn.disabled) return;
        const q = cleanLineText(qInp.value);
        const a = cleanLineText(aInp.value);
        const h = cleanLineText(hintInp.value);
        const targetDeck = deckByPath.get(targetDeckSel.value);

        if (!q || !a) {
          notify("Заполни и вопрос, и ответ.");
          return;
        }
        if (!targetDeck) {
          notify("Выбери тему.");
          return;
        }

        saveSingleBtn.disabled = true;
        try {
          const sep = ui.singleDraft.isBi ? ":::" : "::";
          const frontStr = h ? q + HINT_SEP + h : q;
          const curContent = await app.vault.read(targetDeck.fileObj);
          const prefix = curContent.length > 0 && !curContent.endsWith("\n") ? "\n" : "";

          await enqueueDiskWrite(() => app.vault.append(targetDeck.fileObj, prefix + frontStr + " " + sep + " " + a + "\n"));

          ui.lastAddedBadge = q.slice(0, 28) + (q.length > 28 ? "…" : "");
          ui.singleDraft.q = "";
          ui.singleDraft.a = "";
          ui.singleDraft.hint = "";
          focusQuestionAfterRender = true;
          await renderCardsSection(cardsContainer, activeProjects);
        } catch (e) {
          notify("Ошибка сохранения: " + e.message);
          saveSingleBtn.disabled = false;
        }
      };

      saveSingleBtn.onclick = submitSingleCard;
      qInp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); aInp.focus(); } };
      aInp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submitSingleCard(); } };
      hintInp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submitSingleCard(); } };

      if (focusQuestionAfterRender) {
        focusQuestionAfterRender = false;
        setTimeout(() => { if (qInp.isConnected) qInp.focus(); }, 30);
      }
    } else {
      const bulkOptRow = addDrawer.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;" }
      });
      bulkOptRow.createSpan({
        text: "По одной карточке на строку через ::, :::, « — » или Tab:",
        attr: { style: "font-size: 0.76rem; color: var(--text-muted);" }
      });

      const bulkTypeWrap = bulkOptRow.createDiv({ attr: { style: "display: flex; gap: 5px; align-items: center;" } });
      bulkTypeWrap.createSpan({ text: "Для «—»:", attr: { style: "font-size: 0.73rem; color: var(--text-muted);" } });
      const bSingleBtn = bulkTypeWrap.createEl("button", {
        cls: "dh-chip" + (!ui.bulkDraft.defaultBi ? " is-active" : ""),
        text: "→ ::",
        attr: { type: "button", style: "font-size: 0.72rem; padding: 2px 8px; cursor: pointer;" }
      });
      const bBiBtn = bulkTypeWrap.createEl("button", {
        cls: "dh-chip" + (ui.bulkDraft.defaultBi ? " is-active" : ""),
        text: "⇄ :::",
        attr: { type: "button", style: "font-size: 0.72rem; padding: 2px 8px; cursor: pointer;" }
      });
      bSingleBtn.onclick = () => { ui.bulkDraft.defaultBi = false; renderCardsSection(cardsContainer, activeProjects); };
      bBiBtn.onclick = () => { ui.bulkDraft.defaultBi = true; renderCardsSection(cardsContainer, activeProjects); };

      const bulkArea = addDrawer.createEl("textarea", {
        attr: {
          rows: "6",
          placeholder: "Что такое ПА-6? :: Полиамид-6, конструкционный термопластичный полимер\nСферичность частицы ::: Степень приближения формы частицы к шару",
          style: "width: 100%; font-size: 0.82rem; line-height: 1.4; padding: 8px 10px; border-radius: 6px; resize: vertical;"
        }
      });
      bulkArea.value = ui.bulkDraft.text || "";

      const bulkFooter = addDrawer.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;" }
      });
      const previewSpan = bulkFooter.createSpan({
        attr: { style: "font-size: 0.76rem; color: var(--text-muted); font-weight: 600;" }
      });

      const updateBulkPreview = () => {
        ui.bulkDraft.text = bulkArea.value;
        const list = parseBulkInputLines(bulkArea.value, ui.bulkDraft.defaultBi);
        const biCnt = list.filter(x => x.isBi).length;
        const singleCnt = list.length - biCnt;
        previewSpan.setText(
          list.length > 0
            ? "Распознано: " + list.length + " (:: — " + singleCnt + ", ::: — " + biCnt + ")"
            : "Вставь строки с вопросами и ответами"
        );
      };
      bulkArea.oninput = updateBulkPreview;
      updateBulkPreview();

      const saveBulkBtn = bulkFooter.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "Импортировать",
        attr: { type: "button", style: "font-size: 0.8rem; height: 32px; padding: 0 16px;" }
      });

      saveBulkBtn.onclick = async () => {
        if (saveBulkBtn.disabled) return;
        const list = parseBulkInputLines(bulkArea.value, ui.bulkDraft.defaultBi);
        const targetDeck = deckByPath.get(targetDeckSel.value);
        if (!list.length) {
          notify("Не найдено строк в формате «Вопрос :: Ответ» или «Вопрос — Ответ».");
          return;
        }
        if (!targetDeck) return;

        saveBulkBtn.disabled = true;
        try {
          const curContent = await app.vault.read(targetDeck.fileObj);
          const prefix = curContent.length > 0 && !curContent.endsWith("\n") ? "\n" : "";
          const formattedLines = list.map(item => {
            const sep = item.isBi ? ":::" : "::";
            const front = item.hint ? item.question + HINT_SEP + item.hint : item.question;
            return front + " " + sep + " " + item.answer;
          }).join("\n");

          await enqueueDiskWrite(() => app.vault.append(targetDeck.fileObj, prefix + formattedLines + "\n"));
          ui.bulkDraft.text = "";
          ui.lastAddedBadge = "Импортировано: " + list.length;
          notify("Добавлено карточек в «" + targetDeck.title + "»: " + list.length);
          await renderCardsSection(cardsContainer, activeProjects);
        } catch (e) {
          notify("Ошибка импорта: " + e.message);
          saveBulkBtn.disabled = false;
        }
      };
    }
  }

  // 5. Список вопросов выбранной темы
  if (ui.isListManageOpen && scopedCards.length > 0) {
    const listDrawer = panel.createDiv({ cls: "dsc-drawer" });
    const listHead = listDrawer.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;" }
    });
    listHead.createSpan({
      text: "Вопросы (" + scopedCards.length + ")",
      attr: { style: "font-size: 0.85rem; font-weight: 700; color: var(--text-normal);" }
    });
    listHead.createSpan({
      text: "Клик по «→ ::» / «⇄ :::» переключает стороны карточки",
      attr: { style: "font-size: 0.72rem; color: var(--text-muted);" }
    });

    const listBox = listDrawer.createDiv({
      attr: { style: "display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; padding-right: 4px;" }
    });

    scopedCards.forEach(c => {
      const isEditingThis = ui.editingCardKey === c.uidKey;
      const row = listBox.createDiv({
        attr: {
          style: "padding: 8px 10px; background: var(--background-secondary); border-radius: 6px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 6px;"
        }
      });

      if (isEditingThis) {
        const editRow = row.createDiv({ attr: { style: "display: flex; flex-wrap: wrap; gap: 6px;" } });
        const qInp = editRow.createEl("input", {
          attr: { type: "text", value: c.question, style: "flex: 1; min-width: 160px; font-size: 0.8rem; height: 28px; padding: 2px 8px;" }
        });
        const aInp = editRow.createEl("input", {
          attr: { type: "text", value: c.answer, style: "flex: 1; min-width: 160px; font-size: 0.8rem; height: 28px; padding: 2px 8px;" }
        });
        const hInp = editRow.createEl("input", {
          attr: { type: "text", value: c.hint || "", placeholder: "Пояснение", style: "width: 150px; font-size: 0.78rem; height: 28px; padding: 2px 8px;" }
        });
        const saveB = editRow.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "✓",
          attr: { type: "button", style: "height: 28px; padding: 0 10px; font-size: 0.76rem;" }
        });
        const cancelB = editRow.createEl("button", {
          cls: "dh-chip",
          text: "✕",
          attr: { type: "button", style: "height: 28px; padding: 0 8px; font-size: 0.76rem; cursor: pointer;" }
        });
        cancelB.onclick = () => { ui.editingCardKey = null; renderCardsSection(cardsContainer, activeProjects); };
        saveB.onclick = async () => {
          if (!qInp.value.trim() || !aInp.value.trim()) return;
          saveB.disabled = true;
          await modifyStudyCardLine(c, {
            newQuestion: qInp.value.trim(),
            newAnswer: aInp.value.trim(),
            newHint: hInp.value.trim(),
            newIsBi: c.isBidirectional
          });
          ui.editingCardKey = null;
          await renderCardsSection(cardsContainer, activeProjects);
        };
        return;
      }

      const mainLine = row.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: baseline; gap: 8px;" }
      });

      const leftText = mainLine.createDiv({ attr: { style: "flex: 1; min-width: 0; font-size: 0.81rem; line-height: 1.35;" } });

      const toggleBiBtn = leftText.createEl("button", {
        cls: "dh-chip",
        text: c.isBidirectional ? "⇄ :::" : "→ ::",
        attr: {
          type: "button",
          style: "font-size: 0.68rem; font-weight: 700; padding: 1px 6px; margin-right: 6px; height: 20px; color: " + (c.isBidirectional ? "#9c83e8" : "#599ed6") + "; cursor: pointer;"
        }
      });
      toggleBiBtn.onclick = async () => {
        toggleBiBtn.disabled = true;
        await modifyStudyCardLine(c, {
          newQuestion: c.question,
          newAnswer: c.answer,
          newHint: c.hint,
          newIsBi: !c.isBidirectional
        });
        await renderCardsSection(cardsContainer, activeProjects);
      };

      leftText.createSpan({ text: c.question, attr: { style: "font-weight: 700; color: var(--text-normal);" } });
      leftText.createSpan({ text: " — " + c.answer, attr: { style: "color: var(--text-muted);" } });
      if (c.hint) {
        leftText.createSpan({ text: " (" + c.hint + ")", attr: { style: "font-size: 0.73rem; color: #e5a158; font-style: italic;" } });
      }

      const rightBtns = mainLine.createDiv({ attr: { style: "display: flex; align-items: center; gap: 4px; flex-shrink: 0;" } });
      if (ui.selectedDeckPath === "ALL") {
        rightBtns.createSpan({
          text: c.deckTitle,
          attr: { style: "font-size: 0.68rem; color: var(--text-faint); margin-right: 4px;" }
        });
      }

      const edBtn = rightBtns.createEl("button", {
        cls: "dh-chip",
        text: "✎",
        attr: { type: "button", title: "Редактировать вопрос", style: "font-size: 0.7rem; padding: 1px 6px; height: 20px; cursor: pointer;" }
      });
      edBtn.onclick = () => { ui.editingCardKey = c.uidKey; renderCardsSection(cardsContainer, activeProjects); };

      const delBtn = rightBtns.createEl("button", {
        cls: "dh-chip",
        text: "✕",
        attr: { type: "button", title: "Удалить карточку", style: "font-size: 0.7rem; padding: 1px 6px; height: 20px; color: var(--text-faint); cursor: pointer;" }
      });
      delBtn.onclick = async () => {
        delBtn.disabled = true;
        await modifyStudyCardLine(c, { deleteCard: true });
        await renderCardsSection(cardsContainer, activeProjects);
      };
    });
  }
}

// =====================================================================
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ ВИТРИНЫ УЧЁБЫ
// =====================================================================
async function renderAll() {
  try {
    root.empty();
    injectStudyStyles(root);

    const dataset = getDataset();
    const {
      cfg,
      byPath,
      link,
      descendants,
      getDeadlineISO,
      getStartISO,
      getFinishedISO,
      getDisplayName,
      works: ws,
      completedWorks: doneWs,
      orphans: inbox,
      materials: ms
    } = dataset;

    // -------------------------------------------------------------------
    // 1. ВЕРХНЯЯ ПАНЕЛЬ И СЕТКА АКТИВНЫХ ПРОЕКТОВ
    // -------------------------------------------------------------------
    const topBar = root.createDiv({ cls: "dh-sp-topbar" });

    const statsLine = topBar.createDiv({ cls: "dh-sp-topbar-left" });
    statsLine.createSpan({ cls: "dh-sp-heading", text: "Активные проекты" });
    statsLine.createSpan({
      cls: "dh-sp-summary",
      text: ws.length + " в работе · " + ms.length + " " + plural(ms.length, ["материал", "материала", "материалов"]) +
        (inbox.length ? " · " + inbox.length + " без родителя" : "") +
        (doneWs.length ? " · " + doneWs.length + " завершено" : "")
    });

    const topActions = topBar.createDiv({ cls: "dh-sp-topbar-actions" });

    const openCompilerTopBtn = topActions.createEl("button", {
      cls: "dh-sp-btn is-accent",
      text: "Конструктор",
      attr: {
        type: "button",
        title: "Открыть рабочее дерево и граф в плагине Конструктор учебных проектов"
      }
    });
    openCompilerTopBtn.onclick = () => openStudyCompiler();

    const toggleNewBtn = topActions.createEl("button", {
      cls: "dh-sp-btn" + (uiState.showNewWorkBar ? " is-active" : ""),
      text: uiState.showNewWorkBar ? "✕ Закрыть" : "＋ Проект",
      attr: { type: "button", title: "Создать новый учебный проект" }
    });
    toggleNewBtn.onclick = () => {
      uiState.showNewWorkBar = !uiState.showNewWorkBar;
      renderAll();
    };

    if (uiState.showNewWorkBar) {
      const nwContainer = root.createDiv({ cls: "dh-sp-new-box" });
      const nwBox = nwContainer.createDiv({ cls: "dh-sp-new-row" });

      let manualChosenIcon = null;

      const iconPreviewBtn = nwBox.createEl("button", {
        cls: "dh-sp-icon-pick-btn",
        text: "📁",
        attr: { type: "button", title: "Выбрать иконку" }
      });

      const nwTypeInput = nwBox.createEl("input", {
        cls: "dh-sp-input",
        attr: {
          type: "text",
          value: "Проект",
          placeholder: "Тип (Проект, Диссертация, Статья...)",
          list: "dh-study-work-types",
          style: "flex: 0 1 190px;"
        }
      });

      const typeDatalist = nwBox.createEl("datalist", { attr: { id: "dh-study-work-types" } });
      const existingWorkTypes = [...new Set([...PRESET_WORK_TYPES, ...ws.map(typeOf), ...doneWs.map(typeOf)])].filter(Boolean);
      existingWorkTypes.forEach(t => typeDatalist.createEl("option", { attr: { value: t } }));

      nwTypeInput.oninput = () => {
        if (!manualChosenIcon) {
          iconPreviewBtn.textContent = getWorkMeta(nwTypeInput.value).icon;
        }
      };
      nwTypeInput.onfocus = () => nwTypeInput.select();

      const nwName = nwBox.createEl("input", {
        cls: "dh-sp-input",
        attr: { type: "text", placeholder: "Название проекта...", style: "flex: 1 1 180px;" }
      });
      const nwDays = nwBox.createEl("input", {
        cls: "dh-sp-input",
        attr: { type: "number", min: "1", placeholder: "Дней до срока", style: "flex: 0 1 120px;" }
      });
      const nwCreate = nwBox.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "Создать",
        attr: { type: "button", style: "height: 32px; padding: 0 14px; font-size: 0.8rem; border-radius: 8px;" }
      });

      const iconPickerBar = nwContainer.createDiv({
        cls: "dh-sp-icons-bar",
        attr: { style: "display: none;" }
      });
      iconPickerBar.createSpan({ text: "Значок:", attr: { style: "font-size: 0.72rem; color: var(--text-muted); margin-right: 4px;" } });
      QUICK_ICONS.forEach(ic => {
        const ib = iconPickerBar.createEl("button", {
          cls: "dh-sp-icon-pick-btn",
          text: ic,
          attr: { type: "button" }
        });
        ib.onclick = () => {
          manualChosenIcon = ic;
          iconPreviewBtn.textContent = ic;
          iconPickerBar.style.display = "none";
        };
      });

      iconPreviewBtn.onclick = () => {
        iconPickerBar.style.display = iconPickerBar.style.display === "none" ? "flex" : "none";
      };

      const doCreateNewWork = async () => {
        if (nwCreate.disabled) return;
        const title = normalizeSpaces(nwName.value).replace(/[\\/:*?"<>|]/g, "");
        if (!title) { notify("Введи название проекта."); return; }
        const rawType = normalizeSpaces(nwTypeInput.value) || "Проект";
        const daysVal = Number(nwDays.value);
        const deadlineISO = Number.isFinite(daysVal) && daysVal > 0 ? today.plus({ days: Math.round(daysVal) }).toISODate() : "";
        const folder = cfg.newNoteFolder.replace(/\/+$/, "");
        const path = folder + "/" + title + ".md";
        if (app.vault.getAbstractFileByPath(path)) { notify("Такая заметка уже есть."); return; }

        nwCreate.disabled = true;
        try {
          await ensureFolderExists(folder);
          const lines = [
            "---",
            KEYS.area + ": " + JSON.stringify(cfg.studyAreaName),
            KEYS.type + ": " + JSON.stringify(rawType)
          ];
          if (manualChosenIcon) {
            lines.push(KEYS.icon + ": " + JSON.stringify(manualChosenIcon));
          }
          lines.push(KEYS.status + ": " + JSON.stringify(ROOT_STATUS_ACTIVE));
          lines.push(KEYS.start + ': "' + todayISO + '"');
          if (deadlineISO) {
            lines.push(KEYS.deadline + ': "' + deadlineISO + '"');
          }
          lines.push("---", "", "# " + title, "");

          const f = await app.vault.create(path, lines.join("\n"));
          localCreatedNotes.push({
            file: { name: title, path: f.path, ctime: dv.date("now"), mtime: dv.date("now") },
            [KEYS.area]: cfg.studyAreaName,
            [KEYS.type]: rawType,
            [KEYS.icon]: manualChosenIcon || undefined,
            [KEYS.status]: ROOT_STATUS_ACTIVE,
            [KEYS.start]: todayISO,
            [KEYS.deadline]: deadlineISO || undefined
          });
          uiState.showNewWorkBar = false;
          notify("Создан проект: «" + title + "»");
          renderAll();
        } catch (e) {
          nwCreate.disabled = false;
          notify("Ошибка: " + e.message);
        }
      };

      nwCreate.onclick = doCreateNewWork;
      nwName.onkeydown = e => {
        if (e.key === "Enter") doCreateNewWork();
        if (e.key === "Escape") { uiState.showNewWorkBar = false; renderAll(); }
      };
    }

    if (ws.length === 0) {
      root.createDiv({
        text: "Активных проектов сейчас нет. Нажми «＋ Проект» выше, чтобы создать новый проект.",
        attr: { style: "padding: 16px; margin-bottom: 16px; font-size: 0.78rem; color: var(--text-muted); background: var(--background-secondary); border-radius: 12px; border: 1px dashed var(--background-modifier-border); text-align: center;" }
      });
    } else {
      const grid = root.createDiv({
        cls: "dh-sp-grid",
        attr: { "data-count": String(ws.length) }
      });

      ws.forEach(p => {
        const workMeta = getWorkMeta(typeOf(p), p[KEYS.icon]);
        const accent = workMeta.color;
        const iso = getDeadlineISO(p);
        const startIso = getStartISO(p);
        const isEditingDate = uiState.openDeadlineFor === p.file.path;
        const isRenaming = uiState.renamingWorkPath === p.file.path;
        const currentTitle = getDisplayName(p);
        const matCount = descendants(p.file.path).length;
        const activeDays = startIso ? Math.max(1, Math.ceil(today.diff(dv.date(startIso), "days").days) + 1) : 1;

        const card = grid.createDiv({
          cls: "dh-sp-card",
          attr: { style: "--card-accent: " + accent + ";" }
        });

        // ВЕРХНЯЯ ЧАСТЬ ПЛИТКИ: 1) тип и дисциплина слева, срок справа; 2) название без обрезки смысла
        const topWrap = card.createDiv({ cls: "dh-sp-card-top" });
        const headRow = topWrap.createDiv({ cls: "dh-sp-card-head" });

        const leftBadges = headRow.createDiv({ cls: "dh-sp-card-badges" });
        leftBadges.createSpan({ cls: "dh-sp-type-pill", text: workMeta.label });

        const disc = typeof p[KEYS.discipline] === "string" ? p[KEYS.discipline].trim() : "";
        if (disc) {
          leftBadges.createSpan({
            cls: "dh-sp-discipline",
            text: disc,
            attr: { title: disc }
          });
        }

        if (iso) {
          const tone = getDeadlineTone(iso, false);
          const toneCls = tone === "overdue" ? " is-overdue" : tone === "soon" ? " is-soon" : " is-far";
          const dlBtn = headRow.createEl("button", {
            cls: "dh-sp-deadline" + toneCls,
            text: formatDeadlineBadge(iso, false),
            attr: {
              type: "button",
              title: formatFullDateTooltip(iso) + " · нажми, чтобы изменить срок"
            }
          });
          dlBtn.onclick = e => {
            e.stopPropagation();
            uiState.openDeadlineFor = isEditingDate ? null : p.file.path;
            renderAll();
          };
        } else {
          const setDlBtn = headRow.createEl("button", {
            cls: "dh-sp-deadline is-empty",
            text: "Срок",
            attr: { type: "button", title: "Назначить срок проекта" }
          });
          setDlBtn.onclick = e => {
            e.stopPropagation();
            uiState.openDeadlineFor = isEditingDate ? null : p.file.path;
            renderAll();
          };
        }

        if (!isRenaming) {
          const titleLink = topWrap.createEl("a", {
            cls: "internal-link dh-sp-title-link",
            text: currentTitle,
            attr: { href: p.file.path, title: currentTitle }
          });
          openNote(titleLink, p.file.path);
        } else {
          const renameRow = topWrap.createDiv({ cls: "dh-sp-new-row" });
          const rnInput = renameRow.createEl("input", {
            cls: "dh-sp-input",
            attr: { type: "text", value: currentTitle, style: "flex: 1 1 120px; font-weight: 600;" }
          });
          setTimeout(() => { rnInput.focus(); rnInput.select(); }, 20);

          const rnSave = renameRow.createEl("button", {
            cls: "dh-btn mod-cta",
            text: "✓",
            attr: { type: "button", title: "Сохранить название", style: "height: 32px; padding: 0 10px; font-size: 0.78rem; border-radius: 8px;" }
          });
          const rnCancel = renameRow.createEl("button", {
            cls: "dh-sp-btn",
            text: "✕",
            attr: { type: "button", style: "padding: 0 8px !important;" }
          });

          const doRename = async () => {
            if (rnSave.disabled) return;
            const nextName = normalizeSpaces(rnInput.value).replace(/[\\/:*?"<>|]/g, "");
            if (!nextName || nextName === currentTitle) {
              uiState.renamingWorkPath = null;
              renderAll();
              return;
            }
            const f = app.vault.getAbstractFileByPath(p.file.path);
            if (!f) return;
            const folderPrefix = f.parent && f.parent.path !== "/" ? f.parent.path + "/" : "";
            const newPath = folderPrefix + nextName + ".md";
            if (app.vault.getAbstractFileByPath(newPath)) {
              notify("Файл с таким названием уже существует.");
              return;
            }
            rnSave.disabled = true;
            try {
              const oldPath = p.file.path;
              await app.fileManager.renameFile(f, newPath);
              localOverrides.set(oldPath, { ...(localOverrides.get(oldPath) || {}), newName: nextName });
              uiState.renamingWorkPath = null;
              notify("Переименовано в «" + nextName + "»");
              renderAll();
            } catch (e) {
              rnSave.disabled = false;
              notify("Ошибка переименования: " + e.message);
            }
          };

          rnSave.onclick = doRename;
          rnCancel.onclick = () => { uiState.renamingWorkPath = null; renderAll(); };
          rnInput.onkeydown = e => {
            if (e.key === "Enter") doRename();
            if (e.key === "Escape") { uiState.renamingWorkPath = null; renderAll(); }
          };
        }

        if (isEditingDate) {
          const datePopover = topWrap.createDiv({ cls: "dh-sp-date-popover" });

          const applyDeadline = async newIso => {
            await saveProp(p.file.path, fm => {
              if (newIso) {
                fm[KEYS.deadline] = newIso;
                if (KEYS.deadlineAlt in fm) delete fm[KEYS.deadlineAlt];
              } else {
                delete fm[KEYS.deadline];
                delete fm[KEYS.deadlineAlt];
              }
            });
            localOverrides.set(p.file.path, {
              ...(localOverrides.get(p.file.path) || {}),
              [KEYS.deadline]: newIso || null,
              [KEYS.deadlineAlt]: null
            });
            uiState.openDeadlineFor = null;
            renderAll();
          };

          const presets = datePopover.createDiv({ attr: { style: "display: flex; gap: 4px; flex-wrap: wrap;" } });
          [
            { label: "+3 дн.", d: 3 },
            { label: "+7 дн.", d: 7 },
            { label: "+14 дн.", d: 14 },
            { label: "+30 дн.", d: 30 }
          ].forEach(pr => {
            const b = presets.createEl("button", {
              cls: "dh-sp-btn",
              text: pr.label,
              attr: { type: "button", style: "height: 26px !important; min-height: 26px !important; padding: 0 8px !important; font-size: 0.72rem !important;" }
            });
            b.onclick = () => applyDeadline(today.plus({ days: pr.d }).toISODate());
          });

          const rightDate = datePopover.createDiv({ attr: { style: "display: flex; gap: 4px; align-items: center;" } });
          const dInp = rightDate.createEl("input", {
            attr: { type: "date", value: iso || "", style: "font-size: 0.72rem; height: 26px; padding: 0 6px; border-radius: 6px; min-width: 0;" }
          });
          dInp.onchange = () => applyDeadline(dInp.value);

          if (iso) {
            const clr = rightDate.createEl("button", {
              cls: "dh-sp-btn",
              text: "Сброс",
              attr: { type: "button", style: "height: 26px !important; min-height: 26px !important; padding: 0 8px !important; font-size: 0.72rem !important; color: var(--text-muted) !important;" }
            });
            clr.onclick = () => applyDeadline(null);
          }
        }

        // НИЖНЯЯ ЧАСТЬ ПЛИТКИ:
        // Ряд 1: сводка слева + компактный ряд вторичных действий справа (✎ переименовать, ✓ завершить, ✕ удалить)
        // Ряд 2: главная кнопка «Открыть в конструкторе» + квадратная кнопка «＋» одной высоты
        const bottomWrap = card.createDiv({ cls: "dh-sp-card-bottom" });

        const metaRow = bottomWrap.createDiv({ cls: "dh-sp-meta-row" });
        metaRow.createSpan({
          cls: "dh-sp-meta-text",
          text: (matCount > 0 ? "Материалов: " + matCount : "Материалов пока нет") + " · в работе " + activeDays + " дн."
        });

        const tools = metaRow.createDiv({ cls: "dh-sp-card-tools" });

        const editTitleBtn = tools.createEl("button", {
          cls: "dh-sp-icon-action" + (isRenaming ? " is-active" : ""),
          text: "✎",
          attr: {
            type: "button",
            title: "Переименовать проект",
            "aria-label": "Переименовать проект"
          }
        });
        editTitleBtn.onclick = e => {
          e.stopPropagation();
          uiState.renamingWorkPath = isRenaming ? null : p.file.path;
          renderAll();
        };

        const doneBtn = tools.createEl("button", {
          cls: "dh-sp-icon-action is-done",
          text: "✓",
          attr: {
            type: "button",
            title: "Завершить проект",
            "aria-label": "Завершить проект"
          }
        });
        doneBtn.onclick = async e => {
          e.stopPropagation();
          if (doneBtn.disabled) return;
          doneBtn.disabled = true;
          try {
            await saveProp(p.file.path, fm => {
              fm[KEYS.status] = ROOT_STATUS_DONE;
              if (!fm[KEYS.start]) fm[KEYS.start] = startIso;
              fm[KEYS.finishedAt] = todayISO;
            });
            localOverrides.set(p.file.path, {
              ...(localOverrides.get(p.file.path) || {}),
              [KEYS.status]: ROOT_STATUS_DONE,
              [KEYS.start]: startIso,
              [KEYS.finishedAt]: todayISO
            });
            uiState.completedSectionOpen = true;
            notify("Проект «" + currentTitle + "» перенесён в завершённые");
            renderAll();
          } catch (err) {
            doneBtn.disabled = false;
            notify("Ошибка завершения: " + err.message);
          }
        };

        let confirmTrash = false;
        const delBtn = tools.createEl("button", {
          cls: "dh-sp-icon-action",
          text: "✕",
          attr: {
            type: "button",
            title: "Удалить проект в корзину",
            "aria-label": "Удалить проект в корзину"
          }
        });
        delBtn.onclick = async e => {
          e.stopPropagation();
          if (delBtn.disabled) return;
          if (!confirmTrash) {
            confirmTrash = true;
            delBtn.textContent = "Удалить?";
            delBtn.classList.add("is-danger");
            setTimeout(() => {
              if (delBtn.disabled || !delBtn.isConnected) return;
              confirmTrash = false;
              delBtn.textContent = "✕";
              delBtn.classList.remove("is-danger");
            }, 3000);
            return;
          }
          delBtn.disabled = true;
          try {
            const f = app.vault.getAbstractFileByPath(p.file.path);
            if (f) await app.vault.trash(f, true);
            localOverrides.set(p.file.path, { deleted: true });
            notify("Удалено: «" + currentTitle + "»");
            renderAll();
          } catch (err) {
            delBtn.disabled = false;
            notify("Ошибка удаления: " + err.message);
          }
        };

        const footerRow = bottomWrap.createDiv({ cls: "dh-sp-card-footer" });
        const openInPluginBtn = footerRow.createEl("button", {
          cls: "dh-sp-open-btn",
          text: "Открыть в конструкторе",
          attr: {
            type: "button",
            title: "Открыть дерево и граф проекта «" + currentTitle + "» в конструкторе"
          }
        });
        openInPluginBtn.onclick = e => {
          e.stopPropagation();
          openStudyCompiler({ rootPath: p.file.path });
        };

        const quickAddInPluginBtn = footerRow.createEl("button", {
          cls: "dh-sp-plus-btn",
          text: "＋",
          attr: {
            type: "button",
            title: "Добавить материал в этот проект",
            "aria-label": "Добавить материал в этот проект"
          }
        });
        quickAddInPluginBtn.onclick = e => {
          e.stopPropagation();
          openStudyCompiler({ rootPath: p.file.path, addUnder: p.file.path });
        };
      });
    }

    // -------------------------------------------------------------------
    // 2. МАТЕРИАЛЫ БЕЗ РОДИТЕЛЯ (ЕСЛИ ЕСТЬ)
    // -------------------------------------------------------------------
    if (inbox.length > 0) {
      const inboxPanel = root.createDiv({ cls: "dh-sp-orphans" });
      const inboxHead = inboxPanel.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;" }
      });
      inboxHead.createSpan({
        text: "Без родителя · " + inbox.length,
        attr: { style: "font-size: 0.84rem; font-weight: 600; color: var(--text-normal);" }
      });
      inboxHead.createSpan({
        text: "Привяжи к проекту",
        attr: { style: "font-size: 0.72rem; color: var(--text-muted);" }
      });

      inbox.slice(0, INBOX_LIMIT).forEach(p => {
        const row = inboxPanel.createDiv({ cls: "dh-sp-orphan-row" });
        const a = row.createEl("a", {
          cls: "internal-link",
          text: p.file.name,
          attr: { style: "text-decoration: none; color: var(--text-normal); flex: 1; min-width: 160px; font-size: 0.82rem; font-weight: 500;" }
        });
        openNote(a, p.file.path);

        const mMeta = getWorkMeta(typeOf(p), p[KEYS.icon]);
        row.createSpan({
          cls: "dh-sp-type-pill",
          text: mMeta.label,
          attr: { style: "--card-accent: " + mMeta.color + ";" }
        });

        const sel = row.createEl("select", {
          cls: "dropdown",
          attr: { style: "font-size: 0.76rem; height: 28px;" }
        });
        sel.createEl("option", { text: "Выбери проект...", value: "" });
        ws.forEach(w => sel.createEl("option", { text: getDisplayName(w), value: w.file.path }));

        sel.onchange = async () => {
          const target = byPath.get(sel.value);
          if (!target || sel.disabled) return;
          sel.disabled = true;
          try {
            const targetFile = app.vault.getAbstractFileByPath(target.file.path);
            const linkText = targetFile
              ? app.metadataCache.fileToLinktext(targetFile, p.file.path)
              : target.file.name;
            await saveProp(p.file.path, fm => {
              fm[KEYS.parent] = "[[" + linkText + "]]";
              if (!fm[KEYS.discipline] && typeof target[KEYS.discipline] === "string" && target[KEYS.discipline].trim()) {
                fm[KEYS.discipline] = target[KEYS.discipline].trim();
              }
            });
            localOverrides.set(p.file.path, { ...(localOverrides.get(p.file.path) || {}), parents: [target.file.path] });
            link(p.file.path, target.file.path);
            notify("«" + p.file.name + "» → «" + getDisplayName(target) + "»");
            renderAll();
          } catch (err) {
            sel.disabled = false;
            notify("Ошибка привязки: " + err.message);
          }
        };
      });
    }

    // -------------------------------------------------------------------
    // 3. КАРТОЧКИ (MY-SR-TRAINER)
    // -------------------------------------------------------------------
    const cardsSectionContainer = root.createDiv({ cls: "dh dh-study-cards-hub" });
    await renderCardsSection(cardsSectionContainer, ws);

    // -------------------------------------------------------------------
    // 4. ЗАВЕРШЁННЫЕ ПРОЕКТЫ
    // -------------------------------------------------------------------
    const doneDetails = root.createEl("details", { cls: "dh-details dh-sp-done-details" });
    doneDetails.open = Boolean(uiState.completedSectionOpen);
    doneDetails.ontoggle = () => { uiState.completedSectionOpen = doneDetails.open; };

    doneDetails.createEl("summary", {
      text: "Завершённые проекты · " + doneWs.length,
      attr: { style: "font-size: 0.86rem; font-weight: 600; cursor: pointer; color: var(--text-normal); user-select: none;" }
    });

    if (!doneWs.length) {
      doneDetails.createDiv({
        text: "Завершённых проектов пока нет.",
        attr: { style: "font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;" }
      });
    } else {
      const doneList = doneDetails.createDiv({
        attr: { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 12px;" }
      });

      doneWs.forEach(p => {
        const workMeta = getWorkMeta(typeOf(p), p[KEYS.icon]);
        const startIso = getStartISO(p);
        const endIso = getFinishedISO(p);
        const deadlineIso = getDeadlineISO(p);

        const startDate = dv.date(startIso) || today;
        const endDate = dv.date(endIso) || today;
        const daysTaken = Math.max(1, Math.round(endDate.diff(startDate, "days").days) + 1);

        let isOverdue = false;
        let timingNote = "без срока";
        if (deadlineIso) {
          const dDate = dv.date(deadlineIso);
          const diffFromDeadline = Math.round(endDate.diff(dDate, "days").days);
          if (diffFromDeadline > 0) {
            isOverdue = true;
            timingNote = "просрочено на " + pluralizeDays(diffFromDeadline);
          } else if (diffFromDeadline === 0) {
            timingNote = "точно в срок";
          } else {
            timingNote = "досрочно на " + pluralizeDays(Math.abs(diffFromDeadline));
          }
        }

        const statusColor = isOverdue ? "var(--text-error, #e06c75)" : "var(--color-green, #4aab80)";

        const row = doneList.createDiv({
          cls: "dh-sp-done-row",
          attr: { style: "border-left: 3px solid " + statusColor + ";" }
        });

        const leftPart = row.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; min-width: 180px; flex: 1;" } });
        leftPart.createSpan({ text: workMeta.icon, attr: { style: "font-size: 0.85rem;" } });

        const titleA = leftPart.createEl("a", {
          cls: "internal-link",
          text: getDisplayName(p),
          attr: { style: "font-size: 0.86rem; font-weight: 600; color: var(--text-normal); text-decoration: none;" }
        });
        openNote(titleA, p.file.path);

        if (typeOf(p)) {
          leftPart.createSpan({
            text: "· " + typeOf(p),
            attr: { style: "font-size: 0.72rem; color: var(--text-muted);" }
          });
        }

        const rightPart = row.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

        rightPart.createSpan({
          text: startDate.toFormat("dd.MM") + " → " + endDate.toFormat("dd.MM.yyyy"),
          attr: { style: "font-size: 0.72rem; color: var(--text-muted); font-variant-numeric: tabular-nums;" }
        });

        rightPart.createSpan({
          text: daysTaken + " дн. · " + timingNote,
          attr: {
            style: "font-size: 0.72rem; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: color-mix(in srgb, " + statusColor + " 14%, transparent); color: " + statusColor + "; white-space: nowrap;"
          }
        });

        const openDoneInPluginBtn = rightPart.createEl("button", {
          cls: "dh-sp-btn",
          text: "Дерево",
          attr: {
            type: "button",
            title: "Открыть завершённый проект в конструкторе",
            style: "height: 24px !important; min-height: 24px !important; padding: 0 8px !important; font-size: 0.72rem !important;"
          }
        });
        openDoneInPluginBtn.onclick = () => openStudyCompiler({ rootPath: p.file.path });

        const restoreBtn = rightPart.createEl("button", {
          cls: "dh-sp-btn",
          text: "↩ Вернуть",
          attr: {
            type: "button",
            title: "Возобновить проект и вернуть в активные",
            style: "height: 24px !important; min-height: 24px !important; padding: 0 8px !important; font-size: 0.72rem !important; color: var(--text-muted) !important;"
          }
        });
        restoreBtn.onclick = async () => {
          if (restoreBtn.disabled) return;
          restoreBtn.disabled = true;
          try {
            await saveProp(p.file.path, fm => {
              fm[KEYS.status] = ROOT_STATUS_ACTIVE;
              delete fm[KEYS.finishedAt];
              delete fm[KEYS.finishedLegacy];
            });
            localOverrides.set(p.file.path, {
              ...(localOverrides.get(p.file.path) || {}),
              [KEYS.status]: ROOT_STATUS_ACTIVE,
              [KEYS.finishedAt]: null,
              [KEYS.finishedLegacy]: null
            });
            notify("Проект «" + getDisplayName(p) + "» возвращён в работу");
            renderAll();
          } catch (err) {
            restoreBtn.disabled = false;
            notify("Ошибка: " + err.message);
          }
        };
      });
    }
  } catch (err) {
    root.createDiv({
      text: "Ошибка выполнения скрипта: " + (err && err.stack ? err.stack : err),
      attr: { style: "padding: 12px; color: #d85b57; background: rgba(216,91,87,0.12); border: 1px solid #d85b57; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 0.8rem;" }
    });
  }
}

return renderAll();