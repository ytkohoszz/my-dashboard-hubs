// =====================================================================
// УЧЁБА: АКТИВНЫЕ ПРОЕКТЫ (+ ГРАФ ПО КЛИКУ) → MY-SR-TRAINER → ЗАВЕРШЁННЫЕ ПРОЕКТЫ
// Требуется включённый my-sr-trainer 0.1.2 или совместимый.
// =====================================================================

const AREA = "Учёба";
const TARGET_FOLDER = "Знания";
const DECKS_FOLDER = "Знания/Карточки";
const KNOWLEDGE_FOLDER = '"Знания"';

const MATERIAL_TYPES = ["Термин", "Алгоритм", "Заметка", "Источник", "Расчёт", "Рисунок", "Схема", "Таблица", "Конспект"];
const PRESET_WORK_TYPES = ["Проект", "Лабораторная работа", "Конференция", "Диссертация", "Курсовая работа", "Статья", "Экзамен", "Зачёт", "Практика"];
const QUICK_ICONS = ["📁", "🧪", "🎤", "🎓", "📄", "📐", "⚡", "🔬", "📊", "🏛️", "🚀", "📌"];
const TEMPLATE_PREFIX = "Учёба — ";
const TEMPLATE_FOLDERS = ["Шаблоны"];
const DONE = ["завершён", "завершена", "сдана", "сдан", "готово", "архив", "отменён", "отменена"];

const INBOX_LIMIT = 10;
const SOON_DAYS = 14;
const FALLBACK_COLOR = "#8a8f98";

const MATURE_DAYS = 21;
const HINT_SEP = " // ";

const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };
const plural = (n, f) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2];
};


const today = dv.date("today").startOf("day");
const todayISO = today.toISODate();
const typeOf = p => String(p.тип ?? "").trim();
const toISO = v => { if (!v) return null; const d = dv.date(v); return d && d.isValid ? d.toISODate() : null; };
const flat = v => v == null ? [] : (dv.isArray(v) ? Array.from(v).flatMap(flat) : [v]);
const isTemplate = p => p.file.name.startsWith(TEMPLATE_PREFIX) || TEMPLATE_FOLDERS.some(f => p.file.path.startsWith(f + "/"));
const cleanLineText = s => String(s ?? "").replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();

function stripOuterWikiBrackets(str) {
  let s = String(str || "").trim();
  if (s.startsWith("[[")) s = s.slice(2);
  if (s.endsWith("]]")) s = s.slice(0, -2);
  return s;
}

const parentPaths = p => flat(p.родитель).map(x => {
  if (x && typeof x === "object" && x.path) return x.path;
  const s = stripOuterWikiBrackets(x).split("|")[0].split("#")[0].trim();
  if (!s) return null;
  const f = app.metadataCache.getFirstLinkpathDest(s, p.file.path);
  return f ? f.path : null;
}).filter(Boolean);

const isWorkNote = p => {
  const t = typeOf(p);
  if (!t || MATERIAL_TYPES.includes(t)) return false;
  if (parentPaths(p).length > 0) return false;
  return PRESET_WORK_TYPES.includes(t) || p.статус != null;
};

function getWorkMeta(typeStr, customIcon) {
  const raw = String(typeStr || "Проект").trim();
  const low = raw.toLowerCase();
  let icon = "📁";
  let color = "#599ed6";
  let shortLabel = raw === "Лабораторная работа" ? "Лабораторная" : raw;

  if (low.includes("лаб") || low.includes("лр") || low.includes("опыт") || low.includes("эксперим")) {
    icon = "🧪"; color = "#4aab80";
  } else if (low.includes("конф") || low.includes("доклад") || low.includes("выступ") || low.includes("семинар")) {
    icon = "🎤"; color = "#e06c75";
  } else if (low.includes("диплом") || low.includes("диссер") || low.includes("магист") || low.includes("вкр")) {
    icon = "🎓"; color = "#e5a158";
  } else if (low.includes("стать") || low.includes("публик") || low.includes("тезис") || low.includes("нир")) {
    icon = "📄"; color = "#9c83e8";
  } else if (low.includes("курс") || low.includes("рефер") || low.includes("чертеж") || low.includes("расчетно")) {
    icon = "📐"; color = "#d69852";
  } else if (low.includes("экзам") || low.includes("зачет") || low.includes("зачёт") || low.includes("коллок") || low.includes("тест")) {
    icon = "⚡"; color = "#e5a158";
  } else if (low.includes("практ") || low.includes("стажир")) {
    icon = "🔬"; color = "#69b5aa";
  }

  if (customIcon && String(customIcon).trim()) {
    icon = String(customIcon).trim();
  }

  return { icon, color, label: icon + " " + shortLabel };
}

const TYPE_COLORS = {
  "Термин": "#4fb3d9",
  "Алгоритм": "#9c83e8",
  "Заметка": "#4aab80",
  "Источник": "#d4c05a",
  "Расчёт": "#e06c75",
  "Рисунок": "#69b5aa",
  "Схема": "#d69852",
  "Таблица": "#5c8df6",
  "Конспект": "#8bac5e"
};

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

// --- Состояние проектов и графа ---
if (!window.__dhStudyUiState) {
  window.__dhStudyUiState = {
    expandedPaths: new Set(),
    localOverrides: new Map(),
    localCreatedNotes: [],
    localGraphCoords: new Map(),
    graphViewTransform: new Map(),
    openDeadlineFor: null,
    openAddMatFor: null,
    renamingWorkPath: null,
    showNewWorkBar: false,
    selectedGraphWorkPath: null,
    completedSectionOpen: false
  };
}
const uiState = window.__dhStudyUiState;
const { localOverrides, localCreatedNotes, localGraphCoords, expandedPaths, graphViewTransform } = uiState;

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


const root = dv.container.createDiv({ cls: "dh dh-study-section", attr: { style: "margin: 8px 0 25px 0;" } });

// --- Единая таблица стилей страницы ---
const STUDY_HUB_CSS = [
  ".dashboard-home .dh-study-section { box-sizing: border-box; }",
  ".dashboard-home .dh-study-section button, .dashboard-home .dh-study-section select { touch-action: manipulation; }",
  ".dashboard-home .dh-study-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 295px), 1fr)); gap: 14px; margin-bottom: 18px; align-items: start; }",
  ".dashboard-home .dh-study-card { position: relative; padding: 15px 16px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 10px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; transition: border-color 0.16s ease, box-shadow 0.16s ease; box-sizing: border-box; min-width: 0; }",
  ".dashboard-home .dh-study-card:hover { border-color: color-mix(in srgb, var(--card-accent, #599ed6) 55%, var(--background-modifier-border)); }",
  ".dashboard-home .dh-study-title-link { font-size: 1.02rem; font-weight: 700; color: var(--text-normal); text-decoration: none; line-height: 1.32; flex: 1; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }",
  ".dashboard-home .dh-study-title-link:hover { color: var(--text-accent); }",
  ".dashboard-home .dh-study-rel-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px !important; height: auto !important; min-height: 32px; border-radius: 6px !important; background: var(--background-primary) !important; border: 1px solid var(--background-modifier-border) !important; font-size: 0.78rem !important; color: var(--text-normal) !important; cursor: pointer; user-select: none; text-align: left; box-shadow: none !important; transition: border-color 0.15s ease, background-color 0.15s ease; }",
  ".dashboard-home .dh-study-rel-toggle:hover { border-color: color-mix(in srgb, var(--card-accent, #599ed6) 65%, var(--background-modifier-border)) !important; background: color-mix(in srgb, var(--card-accent, #599ed6) 6%, var(--background-primary)) !important; }",
  ".dashboard-home .dh-study-rel-toggle.is-open { border-color: color-mix(in srgb, var(--card-accent, #599ed6) 65%, var(--background-modifier-border)) !important; }",
  ".dashboard-home .dh-study-rel-toggle.is-empty { color: var(--text-muted) !important; }",
  ".dashboard-home .dh-study-rel-left { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-weight: 600; }",
  ".dashboard-home .dh-study-rel-toggle.is-empty .dh-study-rel-left { font-weight: 500; }",
  ".dashboard-home .dh-study-rel-right { display: inline-flex; align-items: center; gap: 7px; font-size: 0.71rem; color: var(--text-muted); flex-shrink: 0; }",
  ".dashboard-home .dh-study-rel-arrow { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; font-size: 0.72rem; color: var(--text-muted); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s ease; }",
  ".dashboard-home .dh-study-rel-toggle.is-open .dh-study-rel-arrow { transform: rotate(180deg); color: var(--text-normal); }",
  ".dashboard-home .dh-study-rel-collapse { display: grid; grid-template-rows: 0fr; opacity: 0; margin-top: 0; transition: grid-template-rows 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.18s ease, margin-top 0.18s ease; }",
  ".dashboard-home .dh-study-rel-collapse.is-open { grid-template-rows: 1fr; opacity: 1; margin-top: 6px; }",
  ".dashboard-home .dh-study-rel-inner { overflow: hidden; min-height: 0; }",
  ".dashboard-home .dh-study-rel-drawer { display: flex; flex-direction: column; gap: 4px; max-height: 250px; overflow-y: auto; padding: 6px; background: var(--background-primary); border-radius: 6px; border: 1px solid color-mix(in srgb, var(--card-accent, #599ed6) 40%, var(--background-modifier-border)); }",
  ".dashboard-home .dh-study-rel-item { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 5px 8px; background: var(--background-secondary); border-radius: 5px; cursor: pointer; text-decoration: none !important; transition: background-color 0.12s ease; }",
  ".dashboard-home .dh-study-rel-item:hover { background: var(--background-modifier-hover); }",
  ".dashboard-home .dh-study-rel-empty { padding: 10px 12px; border-radius: 6px; background: var(--background-primary); border: 1px dashed var(--background-modifier-border); font-size: 0.76rem; color: var(--text-muted); line-height: 1.35; }",
  ".dashboard-home .dh-study-add-trigger { width: 100%; height: 28px; font-size: 0.78rem; font-weight: 500; color: var(--text-muted); background: transparent; border: 1px dashed var(--background-modifier-border); border-radius: 6px; cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease; }",
  ".dashboard-home .dh-study-add-trigger:hover { color: var(--text-normal); border-color: var(--card-accent, var(--interactive-accent)); background: color-mix(in srgb, var(--card-accent, #599ed6) 6%, transparent); }",
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
  "@media (max-width: 640px) {",
  "  .dashboard-home .dh-study-grid { grid-template-columns: 1fr; }",
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
// ДАННЫЕ ПРОЕКТОВ И СИЛОВОЙ ГРАФ
// =====================================================================
function getDataset() {
  const rawPages = dv.pages().where(p => String(p.направление ?? "").trim() === AREA && !isTemplate(p)).array();
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
    const ps = ov?.parents ? ov.parents : parentPaths(p);
    const uniquePs = [...new Set(ps)];
    parentsOf.set(p.file.path, uniquePs);
    uniquePs.forEach(pp => link(p.file.path, pp));
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

  const getStatus = p => localOverrides.get(p.file.path)?.статус ?? p.статус;
  const getDeadlineISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && "срок" in ov) return ov.срок;
    return toISO(p.срок);
  };
  const getStartISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && "начало" in ov) return ov.начало;
    return toISO(p.начало) || toISO(p.дата) || toISO(p.file?.ctime) || todayISO;
  };
  const getFinishedISO = p => {
    const ov = localOverrides.get(p.file.path);
    if (ov && "завершено" in ov) return ov.завершено;
    return toISO(p.завершено) || toISO(p.file?.mtime) || todayISO;
  };
  const getDisplayName = p => localOverrides.get(p.file.path)?.newName ?? p.file.name;

  function buildHierarchyTree(rootPath) {
    const result = [];
    const visited = new Set([rootPath]);

    function walk(currentPath, depth) {
      const directKids = (children.get(currentPath) ?? [])
        .map(kPath => byPath.get(kPath))
        .filter(k => k && !isWorkNote(k))
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), "ru"));

      directKids.forEach(kid => {
        if (visited.has(kid.file.path)) return;
        visited.add(kid.file.path);
        const hasSubKids = (children.get(kid.file.path) ?? []).some(sub => !visited.has(sub) && byPath.has(sub));
        result.push({ note: kid, depth, parentPath: currentPath, hasSubKids });
        walk(kid.file.path, depth + 1);
      });
    }

    walk(rootPath, 0);
    return result;
  }

  const isActive = p => !DONE.includes(String(getStatus(p) ?? "").trim().toLowerCase());
  const works = activeAll
    .filter(p => isWorkNote(p) && isActive(p))
    .sort((a, b) => (getDeadlineISO(a) ?? "9999").localeCompare(getDeadlineISO(b) ?? "9999"));

  const completedWorks = activeAll
    .filter(p => isWorkNote(p) && !isActive(p))
    .sort((a, b) => (getFinishedISO(b) ?? "").localeCompare(getFinishedISO(a) ?? ""));

  const materials = activeAll.filter(p => !isWorkNote(p));
  return { byPath, parentsOf, children, link, descendants, buildHierarchyTree, getDeadlineISO, getStartISO, getFinishedISO, getDisplayName, works, completedWorks, materials };
}

const GRAPH_DEFAULT_FORCES = { center: 0.05, repel: 500, linkForce: 1, linkDist: 110, showLinks: true };

function renderProjectGraph(container, workNote, dataset, controlsHost) {
  container.empty();
  const { byPath, children, descendants, getDisplayName } = dataset;
  const rootPath = workNote.file.path;
  const allNodePaths = [rootPath, ...descendants(rootPath)].filter(p => byPath.has(p));

  if (allNodePaths.length <= 1) {
    container.createDiv({
      text: "Привязанных заметок пока нет — добавь материалы к проекту, чтобы увидеть связи на графе.",
      attr: { style: "padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.82rem;" }
    });
    return;
  }

  if (!uiState.graphForces) uiState.graphForces = { ...GRAPH_DEFAULT_FORCES };
  if (!uiState.graphLayout) uiState.graphLayout = new Map();
  if (!uiState.graphView) uiState.graphView = new Map();
  const forces = uiState.graphForces;

  const H = 460;
  const W = Math.max(600, Math.round(container.clientWidth || 860));

  const nodeSet = new Set(allNodePaths);
  const edges = [];
  const edgeSet = new Set();
  allNodePaths.forEach(parentP => {
    (children.get(parentP) ?? []).forEach(childP => {
      if (!nodeSet.has(childP)) return;
      edgeSet.add(parentP + "->" + childP);
      edges.push({ source: parentP, target: childP, kind: "hierarchy" });
    });
  });
  allNodePaths.forEach(parentP => {
    const resolved = app.metadataCache.resolvedLinks?.[parentP] || {};
    Object.keys(resolved).forEach(targetP => {
      if (!nodeSet.has(targetP) || targetP === parentP) return;
      const k1 = parentP + "->" + targetP, k2 = targetP + "->" + parentP;
      if (edgeSet.has(k1) || edgeSet.has(k2)) return;
      edgeSet.add(k1);
      edges.push({ source: parentP, target: targetP, kind: "wikilink" });
    });
  });

  const deg = new Map(allNodePaths.map(p => [p, 0]));
  edges.forEach(e => {
    deg.set(e.source, deg.get(e.source) + 1);
    deg.set(e.target, deg.get(e.target) + 1);
  });

  const levelMap = new Map([[rootPath, 0]]);
  const kidsOf = new Map();
  const queue = [rootPath];
  while (queue.length) {
    const cur = queue.shift();
    const ks = (children.get(cur) ?? [])
      .filter(k => nodeSet.has(k) && !levelMap.has(k))
      .sort((a, b) => getDisplayName(byPath.get(a)).localeCompare(getDisplayName(byPath.get(b)), "ru"));
    kidsOf.set(cur, ks);
    ks.forEach(k => { levelMap.set(k, levelMap.get(cur) + 1); queue.push(k); });
  }
  const leaves = new Map();
  const countLeaves = p => {
    const ks = kidsOf.get(p) ?? [];
    const n = ks.length ? ks.reduce((a, k) => a + countLeaves(k), 0) : 1;
    leaves.set(p, n);
    return n;
  };
  countLeaves(rootPath);

  const initPos = new Map([[rootPath, { x: W / 2, y: H / 2 }]]);
  const placeKids = (p, a0, a1) => {
    const ks = kidsOf.get(p) ?? [];
    if (!ks.length) return;
    const total = ks.reduce((a, k) => a + leaves.get(k), 0);
    let a = a0;
    ks.forEach(k => {
      const span = (a1 - a0) * leaves.get(k) / total;
      const mid = a + span / 2;
      const R = (levelMap.get(k) ?? 1) * forces.linkDist;
      initPos.set(k, { x: W / 2 + R * Math.cos(mid), y: H / 2 + R * Math.sin(mid) * 0.8 });
      placeKids(k, a, a + span);
      a += span;
    });
  };
  placeKids(rootPath, -Math.PI / 2, 1.5 * Math.PI);

  let cache = uiState.graphLayout.get(rootPath);
  if (!cache) { cache = new Map(); uiState.graphLayout.set(rootPath, cache); }
  const hasCache = allNodePaths.every(p => cache.has(p));

  const rootWorkMeta = getWorkMeta(typeOf(workNote), workNote.иконка);
  const sim = allNodePaths.map(path => {
    const note = byPath.get(path);
    const isRoot = path === rootPath;
    const name = getDisplayName(note);
    const short = name.length > 26 ? name.slice(0, 24) + "…" : name;
    const c = cache.get(path) || initPos.get(path) || { x: W / 2, y: H / 2 };
    const r = isRoot ? 11 : Math.min(11, 4.5 + Math.sqrt(deg.get(path)) * 1.9);
    return {
      path, note, isRoot, name, short,
      type: typeOf(note) || "Заметка",
      x: c.x, y: c.y, vx: 0, vy: 0, fixed: false, hover: false,
      r, lw: Math.max(2 * r + 4, short.length * 5.4)
    };
  });
  const nodeById = new Map(sim.map(n => [n.path, n]));
  const links = edges.map(e => {
    const ds = deg.get(e.source), dt = deg.get(e.target);
    return { ...e, s: nodeById.get(e.source), t: nodeById.get(e.target), bias: ds / (ds + dt), k: 1 / Math.min(ds, dt) };
  });

  let alpha = hasCache ? 0.2 : 1;
  const step = () => {
    const f = forces;
    const activeLinks = f.showLinks ? links : links.filter(l => l.kind === "hierarchy");

    sim.forEach(n => {
      n.vx += (W / 2 - n.x) * f.center * alpha;
      n.vy += (H / 2 - n.y) * f.center * alpha;
    });

    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i], b = sim[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i % 2 ? 1 : -1) * 0.5; dy = 0.5; d2 = 0.5; }
        if (d2 > 360000) continue;
        const k = f.repel * alpha / d2;
        a.vx -= dx * k; a.vy -= dy * k;
        b.vx += dx * k; b.vy += dy * k;
      }
    }

    activeLinks.forEach(l => {
      const s = l.s, t = l.t;
      let dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = l.kind === "hierarchy" ? f.linkDist : f.linkDist * 1.5;
      const str = f.linkForce * (l.kind === "hierarchy" ? l.k : l.k * 0.25);
      const m = (d - target) / d * alpha * str;
      dx *= m; dy *= m;
      t.vx -= dx * l.bias; t.vy -= dy * l.bias;
      s.vx += dx * (1 - l.bias); s.vy += dy * (1 - l.bias);
    });

    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i], b = sim[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.lw + b.lw) / 2 + 4 - Math.abs(dx);
        const oy = a.r + b.r + 18 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const wa = a.fixed ? 0 : (b.fixed ? 1 : 0.5);
        const wb = b.fixed ? 0 : (a.fixed ? 1 : 0.5);
        if (ox < oy) {
          const dir = dx < 0 ? -1 : 1;
          a.x -= dir * ox * wa * 0.7; b.x += dir * ox * wb * 0.7;
        } else {
          const dir = dy < 0 ? -1 : 1;
          a.y -= dir * oy * wa * 0.7; b.y += dir * oy * wb * 0.7;
        }
      }
    }

    sim.forEach(n => {
      if (n.fixed) { n.vx = 0; n.vy = 0; return; }
      n.vx *= 0.55; n.vy *= 0.55;
      n.x += n.vx; n.y += n.vy;
    });
    alpha += (0 - alpha) * 0.0228;
  };

  const warmSteps = hasCache ? 60 : 320;
  for (let i = 0; i < warmSteps; i++) step();

  const viewBoxState = uiState.graphView.get(rootPath) || { vx: 0, vy: 0, vw: W, vh: H };
  const needFit = !uiState.graphView.has(rootPath);
  uiState.graphView.set(rootPath, viewBoxState);

  const svgWrap = container.createDiv({
    attr: { style: "position: relative; width: 100%; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); overflow: hidden;" }
  });
  const svg = svgWrap.createSvg("svg", {
    attr: {
      viewBox: viewBoxState.vx + " " + viewBoxState.vy + " " + viewBoxState.vw + " " + viewBoxState.vh,
      style: "width: 100%; height: " + H + "px; display: block; user-select: none; touch-action: pan-y; cursor: default;"
    }
  });
  const edgesLayer = svg.createSvg("g");
  const nodesLayer = svg.createSvg("g");

  const edgeEls = links.map(l => {
    const hier = l.kind === "hierarchy";
    l.baseStroke = hier ? "var(--text-muted)" : "var(--interactive-accent)";
    l.baseWidth = hier ? "1.2" : "1";
    l.baseOpacity = hier ? "0.5" : "0.45";
    l.el = edgesLayer.createSvg("line", {
      attr: {
        stroke: l.baseStroke,
        "stroke-width": l.baseWidth,
        "stroke-dasharray": hier ? "none" : "3 3",
        "stroke-linecap": "round",
        opacity: l.baseOpacity
      }
    });
    return l;
  });
  const syncLinkVisibility = () => {
    edgeEls.forEach(l => { l.el.style.display = (l.kind === "wikilink" && !forces.showLinks) ? "none" : ""; });
  };
  syncLinkVisibility();

  let dragging = null;
  let panning = null;
  const presentMaterialTypes = new Set();

  const toGraph = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBoxState.vx + (clientX - rect.left) / (rect.width || W) * viewBoxState.vw,
      y: viewBoxState.vy + (clientY - rect.top) / (rect.height || H) * viewBoxState.vh
    };
  };

  const updateLabels = () => {
    const rect = svg.getBoundingClientRect();
    const scale = (rect.width || W) / viewBoxState.vw;
    sim.forEach(n => {
      if (n.hover || !n.textEl) return;
      n.textEl.style.opacity = (scale >= 0.6 || n.isRoot || deg.get(n.path) >= 3) ? "1" : "0";
    });
  };
  const applyViewBox = () => {
    svg.setAttribute("viewBox", viewBoxState.vx.toFixed(1) + " " + viewBoxState.vy.toFixed(1) + " " + viewBoxState.vw.toFixed(1) + " " + viewBoxState.vh.toFixed(1));
    updateLabels();
  };

  const zoomAt = (factor, px, py) => {
    const v = viewBoxState;
    const nvw = Math.max(W / 8, Math.min(W * 6, v.vw * factor));
    const f = nvw / v.vw;
    v.vx = px - (px - v.vx) * f;
    v.vy = py - (py - v.vy) * f;
    v.vw = nvw;
    v.vh = v.vh * f;
    applyViewBox();
  };
  const zoomCenter = factor => zoomAt(factor, viewBoxState.vx + viewBoxState.vw / 2, viewBoxState.vy + viewBoxState.vh / 2);

  const fitGraph = () => {
    const rect = svg.getBoundingClientRect();
    const aspect = rect.width && rect.height ? rect.width / rect.height : W / H;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    sim.forEach(n => {
      const hw = Math.max(n.r, n.lw / 2);
      minX = Math.min(minX, n.x - hw); maxX = Math.max(maxX, n.x + hw);
      minY = Math.min(minY, n.y - n.r - 6); maxY = Math.max(maxY, n.y + n.r + 20);
    });
    const pad = 28;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    let fw = maxX - minX, fh = maxY - minY;
    fw = Math.max(fw, (rect.width || W) / 1.6);
    if (fw / fh > aspect) fh = fw / aspect; else fw = fh * aspect;
    Object.assign(viewBoxState, { vx: (minX + maxX) / 2 - fw / 2, vy: (minY + maxY) / 2 - fh / 2, vw: fw, vh: fh });
    applyViewBox();
  };

  const ALPHA_MIN = 0.002;
  let running = false;
  let render = () => {};
  const tick = () => {
    if (!svg.isConnected) { running = false; return; }
    step();
    render();
    if (alpha > ALPHA_MIN || dragging) requestAnimationFrame(tick);
    else running = false;
  };
  const kick = (a = 0.5) => {
    alpha = Math.max(alpha, a);
    if (!running) { running = true; requestAnimationFrame(tick); }
  };

  sim.forEach(n => {
    const color = n.isRoot ? rootWorkMeta.color : (TYPE_COLORS[n.type] || FALLBACK_COLOR);
    if (!n.isRoot) presentMaterialTypes.add(n.type);
    n.color = color;

    const g = nodesLayer.createSvg("g", {
      attr: {
        tabindex: "0",
        role: "link",
        "aria-label": n.name + " (" + (n.isRoot ? (typeOf(n.note) || "Проект") : n.type) + ")",
        style: "cursor: grab; touch-action: none; outline: none;"
      }
    });
    g.createSvg("title").setText(n.name + " · " + (n.isRoot ? (typeOf(n.note) || "Проект") : n.type));

    if (n.isRoot) {
      g.createSvg("circle", { attr: { cx: 0, cy: 0, r: n.r + 5, fill: color, opacity: "0.22" } });
    }
    const circle = g.createSvg("circle", {
      attr: {
        cx: 0, cy: 0, r: n.r, fill: color,
        stroke: n.isRoot ? "var(--text-normal)" : "var(--background-primary)",
        "stroke-width": n.isRoot ? "2.2" : "1.8"
      }
    });
    const textEl = g.createSvg("text", {
      attr: {
        x: 0, y: n.r + 12,
        "text-anchor": "middle",
        fill: n.isRoot ? "var(--text-normal)" : "var(--text-muted)",
        "font-size": n.isRoot ? "12px" : "10.5px",
        "font-weight": n.isRoot ? "700" : "500",
        style: "paint-order: stroke; stroke: var(--background-primary); stroke-width: 5px; stroke-linecap: round; stroke-linejoin: round; pointer-events: none;"
      }
    });
    textEl.setText(n.short);
    n.g = g; n.circle = circle; n.textEl = textEl;

    const highlight = () => {
      if (dragging) return;
      n.hover = true;
      nodesLayer.appendChild(g);
      circle.setAttribute("r", String(n.r + 2));
      textEl.setAttribute("fill", "var(--text-normal)");
      textEl.setAttribute("font-weight", "700");
      textEl.style.opacity = "1";
      textEl.setText(n.name);
      const connected = new Set([n.path]);
      edgeEls.forEach(l => {
        if (l.s === n || l.t === n) {
          connected.add(l.source); connected.add(l.target);
          l.el.style.opacity = "0.95";
          l.el.style.strokeWidth = "2";
          l.el.style.stroke = color;
        } else {
          l.el.style.opacity = "0.08";
        }
      });
      sim.forEach(o => { o.g.style.opacity = connected.has(o.path) ? "1" : "0.2"; });
    };
    const resetHighlight = () => {
      if (dragging) return;
      n.hover = false;
      circle.setAttribute("r", String(n.r));
      textEl.setAttribute("fill", n.isRoot ? "var(--text-normal)" : "var(--text-muted)");
      textEl.setAttribute("font-weight", n.isRoot ? "700" : "500");
      textEl.setText(n.short);
      edgeEls.forEach(l => {
        l.el.style.opacity = l.baseOpacity;
        l.el.style.strokeWidth = l.baseWidth;
        l.el.style.stroke = l.baseStroke;
      });
      sim.forEach(o => { o.g.style.opacity = "1"; });
      updateLabels();
    };
    g.onmouseenter = highlight;
    g.onmouseleave = resetHighlight;
    g.onfocus = highlight;
    g.onblur = resetHighlight;

    g.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        app.workspace.openLinkText(n.path, "", e.ctrlKey || e.metaKey);
      }
    };

    g.onpointerdown = e => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      g.style.cursor = "grabbing";
      const p0 = toGraph(e.clientX, e.clientY);
      dragging = { n, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: n.x - p0.x, oy: n.y - p0.y, moved: false };
      n.fixed = true;
      kick(0.3);
    };
    g.onpointermove = e => {
      if (!dragging || dragging.n !== n || e.pointerId !== dragging.pointerId) return;
      if (Math.abs(e.clientX - dragging.sx) > 4 || Math.abs(e.clientY - dragging.sy) > 4) dragging.moved = true;
      if (!dragging.moved) return;
      const p = toGraph(e.clientX, e.clientY);
      n.x = p.x + dragging.ox;
      n.y = p.y + dragging.oy;
      kick(0.3);
    };
    const finish = (e, cancelled) => {
      if (!dragging || dragging.n !== n) return;
      try { g.releasePointerCapture(e.pointerId); } catch {}
      g.style.cursor = "grab";
      const wasMoved = dragging.moved;
      dragging = null;
      n.fixed = false;
      if (!cancelled && !wasMoved) app.workspace.openLinkText(n.path, "", e.ctrlKey || e.metaKey);
      kick(0.3);
    };
    g.onpointerup = e => finish(e, false);
    g.onpointercancel = e => finish(e, true);
  });

  render = () => {
    sim.forEach(n => {
      n.g.setAttribute("transform", "translate(" + n.x.toFixed(1) + ", " + n.y.toFixed(1) + ")");
      cache.set(n.path, { x: n.x, y: n.y });
    });
    links.forEach(l => {
      l.el.setAttribute("x1", l.s.x.toFixed(1));
      l.el.setAttribute("y1", l.s.y.toFixed(1));
      l.el.setAttribute("x2", l.t.x.toFixed(1));
      l.el.setAttribute("y2", l.t.y.toFixed(1));
    });
  };
  render();
  if (needFit) fitGraph(); else updateLabels();

  svg.onwheel = e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = toGraph(e.clientX, e.clientY);
    zoomAt(e.deltaY > 0 ? 1.12 : 0.88, p.x, p.y);
  };
  svg.onpointerdown = e => {
    if (e.target !== svg || e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = "grabbing";
    const rect = svg.getBoundingClientRect();
    panning = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
      origVx: viewBoxState.vx, origVy: viewBoxState.vy,
      scaleX: viewBoxState.vw / (rect.width || W),
      scaleY: viewBoxState.vh / (rect.height || H)
    };
  };
  svg.onpointermove = e => {
    if (!panning || e.pointerId !== panning.pointerId) return;
    viewBoxState.vx = panning.origVx - (e.clientX - panning.startX) * panning.scaleX;
    viewBoxState.vy = panning.origVy - (e.clientY - panning.startY) * panning.scaleY;
    applyViewBox();
  };
  const stopPan = e => {
    if (!panning) return;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    svg.style.cursor = "default";
    panning = null;
  };
  svg.onpointerup = stopPan;
  svg.onpointercancel = stopPan;

  const panel = svgWrap.createDiv({
    attr: {
      style: "position: absolute; top: 8px; left: 8px; z-index: 2; display: " + (uiState.graphSettingsOpen ? "flex" : "none") + "; flex-direction: column; gap: 6px; width: 230px; padding: 10px 12px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; font-size: 0.74rem; color: var(--text-muted);"
    }
  });
  const sliderDefs = [
    { key: "center", label: "Центр", min: 0, max: 0.2, step: 0.005 },
    { key: "repel", label: "Отталкивание", min: 100, max: 1500, step: 10 },
    { key: "linkForce", label: "Сила связи", min: 0.1, max: 2, step: 0.05 },
    { key: "linkDist", label: "Длина связи", min: 50, max: 250, step: 5 }
  ];
  const sliderRefs = [];
  sliderDefs.forEach(def => {
    const row = panel.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 2px;" } });
    const head = row.createDiv({ attr: { style: "display: flex; justify-content: space-between;" } });
    head.createSpan({ text: def.label });
    const val = head.createSpan({ text: String(forces[def.key]) });
    const inp = row.createEl("input", {
      attr: { type: "range", min: String(def.min), max: String(def.max), step: String(def.step), value: String(forces[def.key]) }
    });
    inp.oninput = () => {
      forces[def.key] = Number(inp.value);
      val.setText(inp.value);
      kick(0.7);
    };
    sliderRefs.push({ def, inp, val });
  });
  const linksRow = panel.createEl("label", { attr: { style: "display: flex; align-items: center; gap: 6px; cursor: pointer;" } });
  const linksChk = linksRow.createEl("input", { attr: { type: "checkbox" } });
  linksChk.checked = Boolean(forces.showLinks);
  linksRow.createSpan({ text: "Показывать ссылки [[...]]" });
  linksChk.onchange = () => {
    forces.showLinks = linksChk.checked;
    syncLinkVisibility();
    kick(0.7);
  };
  const defaultsBtn = panel.createEl("button", {
    text: "По умолчанию",
    attr: { type: "button", style: "font-size: 0.72rem; height: 24px; cursor: pointer;" }
  });
  defaultsBtn.onclick = () => {
    Object.assign(forces, GRAPH_DEFAULT_FORCES);
    sliderRefs.forEach(({ def, inp, val }) => { inp.value = String(forces[def.key]); val.setText(String(forces[def.key])); });
    linksChk.checked = forces.showLinks;
    syncLinkVisibility();
    kick(0.8);
  };

  if (controlsHost) {
    const mkBtn = (text, title, fn, extraStyle = "") => {
      const b = controlsHost.createEl("button", {
        cls: "dh-chip",
        text,
        attr: { type: "button", title, style: "font-size: 0.76rem; padding: 3px 8px; color: var(--text-muted); cursor: pointer; " + extraStyle }
      });
      b.onclick = fn;
      return b;
    };
    mkBtn("−", "Отдалить (Ctrl + колесо)", () => zoomCenter(1.2));
    mkBtn("+", "Приблизить (Ctrl + колесо)", () => zoomCenter(0.82));
    mkBtn("⊡ Вписать", "Вписать весь граф в область просмотра", () => fitGraph());
    mkBtn("⚙", "Силы графа: центр, отталкивание, сила и длина связи", () => {
      uiState.graphSettingsOpen = !uiState.graphSettingsOpen;
      panel.style.display = uiState.graphSettingsOpen ? "flex" : "none";
    });
  }

  const legendBar = svgWrap.createDiv({
    attr: { style: "display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; padding: 6px 12px; background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border); font-size: 0.72rem; color: var(--text-muted);" }
  });
  const nodesLegend = legendBar.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center; flex-wrap: wrap;" } });
  const rootItem = nodesLegend.createSpan({ attr: { style: "display: inline-flex; align-items: center; gap: 5px; font-weight: 600; color: var(--text-normal);" } });
  rootItem.createSpan({ attr: { style: "width: 9px; height: 9px; border-radius: 50%; background: " + rootWorkMeta.color + "; border: 1.5px solid var(--text-normal); display: inline-block;" } });
  rootItem.createSpan({ text: typeOf(workNote) || "Проект" });

  Object.entries(TYPE_COLORS).forEach(([tName, col]) => {
    if (presentMaterialTypes.size > 0 && !presentMaterialTypes.has(tName)) return;
    const item = nodesLegend.createSpan({ attr: { style: "display: inline-flex; align-items: center; gap: 5px;" } });
    item.createSpan({ attr: { style: "width: 8px; height: 8px; border-radius: 50%; background: " + col + "; display: inline-block;" } });
    item.createSpan({ text: tName });
  });

  const edgesLegend = legendBar.createDiv({ attr: { style: "display: flex; gap: 10px; align-items: center; flex-wrap: wrap;" } });
  edgesLegend.createSpan({ text: "── Иерархия", attr: { style: "color: var(--text-muted);" } });
  if (edges.some(e => e.kind === "wikilink")) {
    edgesLegend.createSpan({ text: "╌╌ Ссылка [[...]]", attr: { style: "color: var(--interactive-accent);" } });
  }
  edgesLegend.createSpan({ text: "Ctrl + колесо — масштаб", attr: { style: "color: var(--text-faint);" } });
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
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ ВСЕЙ СТРАНИЦЫ УЧЁБЫ
// =====================================================================
async function renderAll() {
  try {
    root.empty();
    injectStudyStyles(root);

    const dataset = getDataset();
    const { byPath, parentsOf, link, descendants, buildHierarchyTree, getDeadlineISO, getStartISO, getFinishedISO, getDisplayName, works: ws, completedWorks: doneWs, materials: ms } = dataset;
    const inbox = ms.filter(p => (parentsOf.get(p.file.path) ?? []).length === 0)
      .sort((a, b) => b.file.mtime.toMillis() - a.file.mtime.toMillis());

    if (uiState.selectedGraphWorkPath && !ws.some(w => w.file.path === uiState.selectedGraphWorkPath)) {
      uiState.selectedGraphWorkPath = null;
    }

    // -------------------------------------------------------------------
    // 1. ВЕРХНЯЯ ПАНЕЛЬ И СЕТКА АКТИВНЫХ ПРОЕКТОВ
    // -------------------------------------------------------------------
    const topBar = root.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;" }
    });

    const statsLine = topBar.createDiv({ attr: { style: "display: flex; align-items: center; gap: 12px; flex-wrap: wrap;" } });
    statsLine.createSpan({ text: "🎯 Активные проекты", attr: { style: "font-size: 1.05rem; font-weight: 700; color: var(--text-normal);" } });
    statsLine.createSpan({
      text: ws.length + " в работе · " + ms.length + " " + plural(ms.length, ["материал", "материала", "материалов"]) +
        (inbox.length ? " · " + inbox.length + " не разобрано" : "") +
        (doneWs.length ? " · " + doneWs.length + " завершено" : ""),
      attr: { style: "font-size: 0.8rem; color: var(--text-muted);" }
    });

    const toggleNewBtn = topBar.createEl("button", {
      cls: "dh-chip" + (uiState.showNewWorkBar ? " is-active" : ""),
      text: uiState.showNewWorkBar ? "✕ Закрыть" : "+ Добавить",
      attr: { type: "button", style: "font-size: 0.78rem; padding: 4px 12px; cursor: pointer;" }
    });
    toggleNewBtn.onclick = () => {
      uiState.showNewWorkBar = !uiState.showNewWorkBar;
      renderAll();
    };

    if (uiState.showNewWorkBar) {
      const nwContainer = root.createDiv({
        cls: "dh-panel",
        attr: { style: "padding: 10px 14px; margin-bottom: 14px; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 8px;" }
      });

      const nwBox = nwContainer.createDiv({
        attr: { style: "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;" }
      });

      let manualChosenIcon = null;

      const iconPreviewBtn = nwBox.createEl("button", {
        text: "📁",
        attr: {
          type: "button",
          title: "Выбрать иконку",
          style: "font-size: 1rem; width: 32px; height: 30px; padding: 0; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;"
        }
      });

      const nwTypeInput = nwBox.createEl("input", {
        attr: {
          type: "text",
          value: "Проект",
          placeholder: "Тип (Проект, ЛР, Конференция, Курсовая...)",
          list: "dh-study-work-types",
          style: "width: 195px; font-size: 0.82rem; height: 30px; padding: 2px 10px;"
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
        attr: { type: "text", placeholder: "Название работы...", style: "flex: 1; min-width: 180px; font-size: 0.82rem; height: 30px; padding: 2px 10px;" }
      });
      const nwDays = nwBox.createEl("input", {
        attr: { type: "number", min: "1", placeholder: "Срок (дней)", style: "width: 105px; font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
      });
      const nwCreate = nwBox.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "Создать",
        attr: { type: "button", style: "font-size: 0.8rem; height: 30px; padding: 0 14px;" }
      });

      const iconPickerBar = nwContainer.createDiv({
        attr: { style: "display: none; gap: 5px; align-items: center; flex-wrap: wrap; padding-top: 4px; border-top: 1px dashed var(--background-modifier-border);" }
      });
      iconPickerBar.createSpan({ text: "Выбери значок:", attr: { style: "font-size: 0.72rem; color: var(--text-muted); margin-right: 4px;" } });
      QUICK_ICONS.forEach(ic => {
        const ib = iconPickerBar.createEl("button", {
          text: ic,
          attr: { type: "button", style: "font-size: 0.9rem; width: 28px; height: 26px; padding: 0; border-radius: 5px; cursor: pointer;" }
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
        const title = nwName.value.trim().replace(/[\\/:*?"<>|]/g, "");
        if (!title) { notify("Введи название."); return; }
        const rawType = nwTypeInput.value.trim() || "Проект";
        const daysVal = Number(nwDays.value);
        const deadlineISO = daysVal > 0 ? today.plus({ days: daysVal }).toISODate() : "";
        const path = TARGET_FOLDER + "/" + title + ".md";
        if (app.vault.getAbstractFileByPath(path)) { notify("Такая заметка уже есть."); return; }

        nwCreate.disabled = true;
        try {
          const iconLine = manualChosenIcon ? "иконка: " + JSON.stringify(manualChosenIcon) + "\n" : "";
          const deadlineLine = deadlineISO ? 'срок: "' + deadlineISO + '"' : "срок: ";
          const fm = "---\nнаправление: " + AREA + "\nтип: " + JSON.stringify(rawType) + "\n" + iconLine + 'статус: в работе\nначало: "' + todayISO + '"\n' + deadlineLine + "\nзавершено: \nдисциплина: \n---\n\n# " + title + "\n";
          const f = await app.vault.create(path, fm);
          localCreatedNotes.push({
            file: { name: title, path: f.path, ctime: dv.date("now"), mtime: dv.date("now") },
            направление: AREA,
            тип: rawType,
            иконка: manualChosenIcon || undefined,
            статус: "в работе",
            начало: todayISO,
            срок: deadlineISO
          });
          uiState.showNewWorkBar = false;
          uiState.selectedGraphWorkPath = f.path;
          notify("Создано: «" + title + "» (" + rawType + ")");
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

    const grid = root.createDiv({ cls: "dh-study-grid" });

    ws.forEach((p, cardIdx) => {
      const workMeta = getWorkMeta(typeOf(p), p.иконка);
      const accent = workMeta.color;
      const iso = getDeadlineISO(p);
      const startIso = getStartISO(p);
      const isEditingDate = uiState.openDeadlineFor === p.file.path;
      const isAddingMat = uiState.openAddMatFor === p.file.path;
      const isRenaming = uiState.renamingWorkPath === p.file.path;
      const isExpanded = expandedPaths.has(p.file.path);
      const isGraphActive = uiState.selectedGraphWorkPath === p.file.path;
      const currentTitle = getDisplayName(p);

      const treeItems = buildHierarchyTree(p.file.path);

      const card = grid.createDiv({
        cls: "dh-card dh-study-card",
        attr: {
          style: "border-top: 3px solid " + accent + "; --card-accent: " + accent + ";"
        }
      });

      const topSection = card.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 6px;" } });
      const headerRow = topSection.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 6px;" } });

      const leftBadges = headerRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;" } });
      leftBadges.createSpan({
        text: workMeta.label,
        attr: { style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: " + accent + "18; color: " + accent + ";" }
      });

      if (typeof p.дисциплина === "string" && p.дисциплина.trim()) {
        leftBadges.createSpan({ text: p.дисциплина.trim(), attr: { style: "font-size: 0.72rem; color: var(--text-muted);" } });
      }

      const rightControls = headerRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 3px; flex-shrink: 0;" } });

      let deadlineLabel = "📅 Срок";
      let deadlineColor = "var(--text-muted)";
      let deadlineBg = "var(--background-primary)";

      if (iso) {
        const left = Math.ceil(dv.date(iso).diff(today, "days").days);
        const urgent = left <= SOON_DAYS;
        deadlineLabel = left > 0 ? "⏳ " + left + " дн." : left === 0 ? "🔥 Сегодня!" : "⚠️ −" + Math.abs(left) + " дн.";
        deadlineColor = urgent ? "#d85b57" : accent;
        deadlineBg = urgent ? "#d85b5720" : accent + "18";
      }

      const deadlineBtn = rightControls.createEl("button", {
        text: deadlineLabel,
        attr: {
          type: "button",
          title: "Изменить дедлайн",
          style: "font-size: 0.7rem; font-weight: 600; padding: 2px 8px; height: 22px; border-radius: 5px; background: " + deadlineBg + "; color: " + deadlineColor + "; border: 1px solid " + (isEditingDate ? deadlineColor : "transparent") + "; cursor: pointer;"
        }
      });
      deadlineBtn.onclick = e => {
        e.stopPropagation();
        uiState.openDeadlineFor = isEditingDate ? null : p.file.path;
        renderAll();
      };

      const graphBtn = rightControls.createEl("button", {
        text: "🕸️",
        attr: {
          type: "button",
          title: isGraphActive ? "Скрыть граф проекта" : "Открыть граф этого проекта",
          style: "font-size: 0.72rem; width: 22px; height: 22px; padding: 0; border-radius: 5px; background: " + (isGraphActive ? accent + "28" : "transparent") + "; border: 1px solid " + (isGraphActive ? accent : "transparent") + "; cursor: pointer;"
        }
      });
      graphBtn.onclick = e => {
        e.stopPropagation();
        uiState.selectedGraphWorkPath = isGraphActive ? null : p.file.path;
        renderAll();
      };

      const doneBtn = rightControls.createEl("button", {
        text: "✓",
        attr: {
          type: "button",
          title: "Завершить проект",
          style: "font-size: 0.72rem; width: 22px; height: 22px; padding: 0; border-radius: 5px; background: transparent; color: var(--text-muted); border: 1px solid transparent; cursor: pointer;"
        }
      });
      doneBtn.onmouseenter = () => { doneBtn.style.color = "#4aab80"; doneBtn.style.borderColor = "#4aab8055"; };
      doneBtn.onmouseleave = () => { doneBtn.style.color = "var(--text-muted)"; doneBtn.style.borderColor = "transparent"; };
      doneBtn.onclick = async e => {
        e.stopPropagation();
        if (doneBtn.disabled) return;
        doneBtn.disabled = true;
        try {
          await saveProp(p.file.path, fm => {
            fm["статус"] = "завершён";
            if (!fm["начало"]) fm["начало"] = startIso;
            fm["завершено"] = todayISO;
          });
          localOverrides.set(p.file.path, {
            ...(localOverrides.get(p.file.path) || {}),
            статус: "завершён",
            начало: startIso,
            завершено: todayISO
          });
          if (uiState.selectedGraphWorkPath === p.file.path) uiState.selectedGraphWorkPath = null;
          uiState.completedSectionOpen = true;
          notify("Проект «" + currentTitle + "» завершён!");
          renderAll();
        } catch (err) {
          doneBtn.disabled = false;
          notify("Ошибка завершения: " + err.message);
        }
      };

      let confirmTrash = false;
      const delBtn = rightControls.createEl("button", {
        text: "✕",
        attr: {
          type: "button",
          title: "Удалить проект в корзину",
          style: "font-size: 0.72rem; height: 22px; padding: 0 5px; border-radius: 5px; background: transparent; color: var(--text-faint); border: 1px solid transparent; cursor: pointer;"
        }
      });
      delBtn.onclick = async e => {
        e.stopPropagation();
        if (delBtn.disabled) return;
        if (!confirmTrash) {
          confirmTrash = true;
          const n = descendants(p.file.path).length;
          delBtn.textContent = n ? "Удалить? (связано: " + n + ")" : "Удалить?";
          delBtn.style.color = "#d85b57";
          delBtn.style.borderColor = "#d85b5766";
          setTimeout(() => {
            if (delBtn.disabled) return;
            confirmTrash = false;
            delBtn.textContent = "✕";
            delBtn.style.color = "var(--text-faint)";
            delBtn.style.borderColor = "transparent";
          }, 3000);
          return;
        }
        delBtn.disabled = true;
        try {
          const f = app.vault.getAbstractFileByPath(p.file.path);
          if (f) await app.vault.trash(f, true);
          localOverrides.set(p.file.path, { deleted: true });
          expandedPaths.delete(p.file.path);
          if (uiState.selectedGraphWorkPath === p.file.path) uiState.selectedGraphWorkPath = null;
          notify("Удалено: «" + currentTitle + "»");
          renderAll();
        } catch (err) {
          delBtn.disabled = false;
          notify("Ошибка удаления: " + err.message);
        }
      };

      if (!isRenaming) {
        const titleRow = topSection.createDiv({
          attr: { style: "display: flex; align-items: center; justify-content: space-between; gap: 6px;" }
        });

        const titleLink = titleRow.createEl("a", {
          cls: "internal-link dh-study-title-link",
          text: currentTitle,
          attr: { href: p.file.path }
        });
        openNote(titleLink, p.file.path);

        const editTitleBtn = titleRow.createEl("button", {
          text: "✎",
          attr: {
            type: "button",
            title: "Переименовать проект",
            style: "font-size: 0.78rem; width: 22px; height: 22px; padding: 0; border-radius: 4px; background: transparent; color: var(--text-muted); border: none; opacity: 0.55; cursor: pointer; flex-shrink: 0; transition: opacity 0.15s ease;"
          }
        });
        editTitleBtn.onmouseenter = () => { editTitleBtn.style.opacity = "1"; editTitleBtn.style.color = "var(--text-normal)"; };
        editTitleBtn.onmouseleave = () => { editTitleBtn.style.opacity = "0.55"; editTitleBtn.style.color = "var(--text-muted)"; };
        editTitleBtn.onclick = e => {
          e.stopPropagation();
          uiState.renamingWorkPath = p.file.path;
          renderAll();
        };
      } else {
        const renameRow = topSection.createDiv({ attr: { style: "display: flex; gap: 5px; align-items: center;" } });
        const rnInput = renameRow.createEl("input", {
          attr: { type: "text", value: currentTitle, style: "flex: 1; min-width: 100px; font-size: 0.88rem; font-weight: 600; height: 28px; padding: 2px 8px;" }
        });
        setTimeout(() => { rnInput.focus(); rnInput.select(); }, 20);

        const rnSave = renameRow.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "✓",
          attr: { type: "button", title: "Сохранить новое название", style: "font-size: 0.78rem; height: 28px; padding: 0 10px;" }
        });
        const rnCancel = renameRow.createEl("button", {
          text: "✕",
          attr: { type: "button", style: "font-size: 0.78rem; height: 28px; padding: 0 7px; background: transparent; border: none; color: var(--text-muted); cursor: pointer;" }
        });

        const doRename = async () => {
          if (rnSave.disabled) return;
          const nextName = rnInput.value.trim().replace(/[\\/:*?"<>|]/g, "");
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
            if (expandedPaths.delete(oldPath)) expandedPaths.add(newPath);
            if (uiState.selectedGraphWorkPath === oldPath) uiState.selectedGraphWorkPath = newPath;
            for (const m of [localGraphCoords, graphViewTransform]) {
              if (m.has(oldPath)) { m.set(newPath, m.get(oldPath)); m.delete(oldPath); }
            }
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
        const datePopover = topSection.createDiv({
          attr: { style: "padding: 8px 10px; background: var(--background-primary); border-radius: 6px; border: 1px solid var(--background-modifier-border); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: space-between; margin-top: 2px;" }
        });

        const applyDeadline = async (newIso) => {
          await saveProp(p.file.path, fm => { fm["срок"] = newIso || null; });
          localOverrides.set(p.file.path, { ...(localOverrides.get(p.file.path) || {}), срок: newIso || null });
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
            text: pr.label,
            attr: { type: "button", style: "font-size: 0.72rem; padding: 2px 7px; height: 24px; border-radius: 4px; cursor: pointer;" }
          });
          b.onclick = () => applyDeadline(today.plus({ days: pr.d }).toISODate());
        });

        const rightDate = datePopover.createDiv({ attr: { style: "display: flex; gap: 4px; align-items: center;" } });
        const dInp = rightDate.createEl("input", {
          attr: { type: "date", value: iso || "", style: "font-size: 0.74rem; height: 24px; padding: 0 6px; border-radius: 4px;" }
        });
        dInp.onchange = () => applyDeadline(dInp.value);

        if (iso) {
          const clr = rightDate.createEl("button", {
            text: "Сброс",
            attr: { type: "button", style: "font-size: 0.7rem; height: 24px; padding: 0 6px; color: var(--text-muted); cursor: pointer;" }
          });
          clr.onclick = () => applyDeadline(null);
        }
      }

      const middleSection = card.createDiv({
        attr: { style: "display: flex; flex-direction: column;" }
      });

      const drawerId = "dh-study-rel-drawer-" + cardIdx;
      const activeDays = startIso ? Math.max(1, Math.ceil(today.diff(dv.date(startIso), "days").days) + 1) : 1;

      const relToggleBtn = middleSection.createEl("button", {
        cls: "dh-study-rel-toggle" + (isExpanded ? " is-open" : "") + (treeItems.length === 0 ? " is-empty" : ""),
        attr: {
          type: "button",
          "aria-expanded": String(isExpanded),
          "aria-controls": drawerId
        }
      });

      const relLeft = relToggleBtn.createSpan({ cls: "dh-study-rel-left" });
      relLeft.createSpan({
        text: treeItems.length > 0 ? "Связанные заметки · " + treeItems.length : "Связанные заметки · 0"
      });

      const relRight = relToggleBtn.createSpan({ cls: "dh-study-rel-right" });
      relRight.createSpan({ text: "в работе " + activeDays + " дн." });
      relRight.createSpan({
        cls: "dh-study-rel-arrow",
        text: "▾",
        attr: { "aria-hidden": "true" }
      });

      const collapseWrap = middleSection.createDiv({
        cls: "dh-study-rel-collapse" + (isExpanded ? " is-open" : ""),
        attr: {
          id: drawerId,
          "aria-hidden": String(!isExpanded)
        }
      });

      const collapseInner = collapseWrap.createDiv({ cls: "dh-study-rel-inner" });

      if (treeItems.length > 0) {
        const hierarchyDrawer = collapseInner.createDiv({ cls: "dh-study-rel-drawer" });

        treeItems.forEach(({ note: m, depth, hasSubKids }) => {
          const mType = typeOf(m) || "Заметка";
          const mColor = TYPE_COLORS[mType] || FALLBACK_COLOR;
          const indentPx = depth * 16;

          const item = hierarchyDrawer.createEl("a", {
            cls: "internal-link dh-study-rel-item",
            attr: {
              href: m.file.path,
              style: "margin-left: " + indentPx + "px; border-left: 2px solid " + (depth > 0 ? mColor : accent) + ";"
            }
          });
          openNote(item, m.file.path);

          const leftName = item.createDiv({ attr: { style: "display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;" } });
          if (depth > 0) {
            leftName.createSpan({ text: "└", attr: { style: "color: var(--text-faint); font-family: monospace; font-size: 0.75rem;" } });
          } else if (hasSubKids) {
            leftName.createSpan({ text: "📂", attr: { style: "font-size: 0.72rem;" } });
          }

          leftName.createSpan({
            text: getDisplayName(m),
            attr: {
              title: getDisplayName(m),
              style: "font-size: 0.8rem; font-weight: " + (hasSubKids ? "600" : "500") + "; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
            }
          });

          item.createSpan({
            text: mType,
            attr: { style: "font-size: 0.64rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: " + mColor + "18; color: " + mColor + "; flex-shrink: 0;" }
          });
        });
      } else {
        collapseInner.createDiv({
          cls: "dh-study-rel-empty",
          text: "Привязанных заметок пока нет. Добавь материал через кнопку ниже или привяжи существующую заметку из блока «Неразобранные»."
        });
      }

      relToggleBtn.onclick = e => {
        e.stopPropagation();
        const nowOpen = !expandedPaths.has(p.file.path);
        if (nowOpen) expandedPaths.add(p.file.path);
        else expandedPaths.delete(p.file.path);

        relToggleBtn.classList.toggle("is-open", nowOpen);
        relToggleBtn.setAttribute("aria-expanded", String(nowOpen));
        collapseWrap.classList.toggle("is-open", nowOpen);
        collapseWrap.setAttribute("aria-hidden", String(!nowOpen));
      };

      const footerSection = card.createDiv({ attr: { style: "border-top: 1px solid var(--background-modifier-border); padding-top: 8px;" } });

      if (!isAddingMat) {
        const triggerAdd = footerSection.createEl("button", {
          cls: "dh-study-add-trigger",
          text: "+ Добавить материал",
          attr: { type: "button" }
        });
        triggerAdd.onclick = e => {
          e.stopPropagation();
          uiState.openAddMatFor = p.file.path;
          renderAll();
        };
      } else {
        const addForm = footerSection.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 6px;" } });
        const row1 = addForm.createDiv({ attr: { style: "display: flex; gap: 5px; align-items: center; flex-wrap: wrap;" } });

        const matTypeSel = row1.createEl("select", { cls: "dropdown", attr: { style: "font-size: 0.75rem; height: 28px; padding: 0 18px 0 6px; max-width: 105px;" } });
        MATERIAL_TYPES.forEach(mt => matTypeSel.createEl("option", { text: mt, value: mt }));

        const matNameInp = row1.createEl("input", {
          attr: { type: "text", placeholder: "Название заметки...", style: "flex: 1; min-width: 110px; font-size: 0.78rem; height: 28px; padding: 2px 8px;" }
        });
        setTimeout(() => matNameInp.focus(), 20);

        const row2 = addForm.createDiv({ attr: { style: "display: flex; gap: 5px; align-items: center;" } });
        const parentSel = row2.createEl("select", { cls: "dropdown", attr: { style: "flex: 1; min-width: 0; font-size: 0.74rem; height: 26px;" } });
        parentSel.createEl("option", { text: "↳ В корень: " + currentTitle, value: p.file.path });
        treeItems.forEach(ti => {
          parentSel.createEl("option", { text: "  ".repeat(ti.depth + 1) + "↳ Внутрь: " + getDisplayName(ti.note), value: ti.note.file.path });
        });

        const createBtn = row2.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "Создать",
          attr: { type: "button", style: "font-size: 0.75rem; height: 26px; padding: 0 10px; flex-shrink: 0;" }
        });

        const cancelBtn = row2.createEl("button", {
          text: "✕",
          attr: { type: "button", style: "font-size: 0.75rem; height: 26px; padding: 0 6px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; flex-shrink: 0;" }
        });
        cancelBtn.onclick = e => {
          e.stopPropagation();
          uiState.openAddMatFor = null;
          renderAll();
        };

        const doCreateMat = async () => {
          if (createBtn.disabled) return;
          const mTitle = matNameInp.value.trim().replace(/[\\/:*?"<>|]/g, "");
          if (!mTitle) { notify("Введи название материала."); return; }
          const mType = matTypeSel.value;
          const chosenParentNote = byPath.get(parentSel.value) || p;
          const mPath = TARGET_FOLDER + "/" + mTitle + ".md";
          if (app.vault.getAbstractFileByPath(mPath)) { notify("Заметка с таким именем уже есть."); return; }

          createBtn.disabled = true;
          try {
            const disc = typeof p.дисциплина === "string" && p.дисциплина.trim() ? p.дисциплина.trim() : "";
            const fm = "---\nнаправление: " + AREA + "\nтип: " + JSON.stringify(mType) + '\nродитель: "[[' + chosenParentNote.file.name + ']]"\n' + (disc ? "дисциплина: " + JSON.stringify(disc) + "\n" : "") + "---\n\n# " + mTitle + "\n\n";
            const newFile = await app.vault.create(mPath, fm);
            localCreatedNotes.push({ file: { name: mTitle, path: newFile.path, mtime: dv.date("now") }, направление: AREA, тип: mType, родитель: "[[" + chosenParentNote.file.name + "]]", дисциплина: disc });
            localOverrides.set(newFile.path, { parents: [chosenParentNote.file.path] });
            uiState.openAddMatFor = null;
            expandedPaths.add(p.file.path);
            notify("Создано: «" + mTitle + "» → «" + chosenParentNote.file.name + "»");
            renderAll();
          } catch (e) {
            createBtn.disabled = false;
            notify("Ошибка: " + e.message);
          }
        };

        createBtn.onclick = e => { e.stopPropagation(); doCreateMat(); };
        matNameInp.onkeydown = e => {
          if (e.key === "Enter") { e.stopPropagation(); doCreateMat(); }
          if (e.key === "Escape") { e.stopPropagation(); uiState.openAddMatFor = null; renderAll(); }
        };
      }
    });

    // -------------------------------------------------------------------
    // 2. ГРАФ ВЫБРАННОГО ПРОЕКТА (ПОЯВЛЯЕТСЯ ТОЛЬКО ПО КЛИКУ НА 🕸️)
    // -------------------------------------------------------------------
    const targetGraphWork = uiState.selectedGraphWorkPath ? byPath.get(uiState.selectedGraphWorkPath) : null;
    if (targetGraphWork) {
      const workMeta = getWorkMeta(typeOf(targetGraphWork), targetGraphWork.иконка);
      const count = descendants(targetGraphWork.file.path).length;

      const graphPanel = root.createDiv({
        cls: "dh-panel",
        attr: {
          style: "padding: 14px 16px; margin-bottom: 18px; background: var(--background-secondary); border-radius: 10px; border: 1px solid var(--background-modifier-border); border-top: 3px solid " + workMeta.color + ";"
        }
      });

      const graphHeader = graphPanel.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;" }
      });

      const titleLeft = graphHeader.createDiv({ attr: { style: "display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;" } });
      titleLeft.createSpan({
        text: "🕸️ " + getDisplayName(targetGraphWork),
        attr: { style: "font-size: 0.98rem; font-weight: 700; color: var(--text-normal);" }
      });
      titleLeft.createSpan({
        text: count + " " + plural(count, ["связанная заметка", "связанные заметки", "связанных заметок"]),
        attr: { style: "font-size: 0.76rem; color: var(--text-muted);" }
      });

      const rightControls = graphHeader.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 6px; flex-wrap: wrap; align-items: center;" } });
      const viewToolsGroup = rightControls.createDiv({ attr: { style: "display: inline-flex; gap: 4px; align-items: center;" } });

      const resetLayoutBtn = rightControls.createEl("button", {
        cls: "dh-chip",
        text: "↺ Авто",
        attr: { type: "button", title: "Сбросить расположение узлов к автоматической раскладке", style: "font-size: 0.74rem; padding: 3px 8px; color: var(--text-muted); cursor: pointer;" }
      });
      resetLayoutBtn.onclick = async () => {
        if (resetLayoutBtn.disabled) return;
        resetLayoutBtn.disabled = true;
        localGraphCoords.set(targetGraphWork.file.path, {});
        graphViewTransform.delete(targetGraphWork.file.path);
        uiState.graphLayout?.delete(targetGraphWork.file.path);
        uiState.graphView?.delete(targetGraphWork.file.path);
        try {
          await saveProp(targetGraphWork.file.path, fm => { delete fm["граф_координаты"]; });
        } catch {}
        renderAll();
      };

      const closeGraphBtn = rightControls.createEl("button", {
        cls: "dh-chip",
        text: "✕ Скрыть",
        attr: { type: "button", title: "Скрыть граф", style: "font-size: 0.74rem; padding: 3px 9px; color: var(--text-muted); cursor: pointer;" }
      });
      closeGraphBtn.onclick = () => {
        uiState.selectedGraphWorkPath = null;
        renderAll();
      };

      const graphCanvasBox = graphPanel.createDiv();
      renderProjectGraph(graphCanvasBox, targetGraphWork, dataset, viewToolsGroup);
    }

    // -------------------------------------------------------------------
    // 3. НЕРАЗОБРАННЫЕ МАТЕРИАЛЫ (ЕСЛИ ЕСТЬ)
    // -------------------------------------------------------------------
    if (inbox.length) {
      const inboxPanel = root.createDiv({
        cls: "dh-panel",
        attr: { style: "padding: 12px 16px; margin-bottom: 18px; background: var(--background-secondary); border-radius: 8px; border: 1px solid #e5a15855; border-left: 3px solid #e5a158;" }
      });
      inboxPanel.createDiv({
        text: "📥 Неразобранные материалы (" + inbox.length + ") — привяжи к проекту:",
        attr: { style: "font-size: 0.85rem; font-weight: 600; color: var(--text-normal); margin-bottom: 8px;" }
      });

      inbox.slice(0, INBOX_LIMIT).forEach(p => {
        const row = inboxPanel.createDiv({ attr: { style: "display: flex; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--background-modifier-border); flex-wrap: wrap;" } });
        const a = row.createEl("a", { cls: "internal-link", text: p.file.name, attr: { style: "text-decoration: none; color: var(--text-normal); flex: 1; min-width: 160px; font-size: 0.84rem; font-weight: 500;" } });
        openNote(a, p.file.path);

        const mType = typeOf(p) || "Заметка";
        const mColor = TYPE_COLORS[mType] || FALLBACK_COLOR;
        row.createSpan({ text: mType, attr: { style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: " + mColor + "18; color: " + mColor + ";" } });

        const sel = row.createEl("select", { cls: "dropdown", attr: { style: "font-size: 0.78rem; height: 26px;" } });
        sel.createEl("option", { text: "Выбери проект...", value: "" });
        ws.forEach(w => sel.createEl("option", { text: getDisplayName(w), value: w.file.path }));

        sel.onchange = async () => {
          const target = byPath.get(sel.value);
          if (!target || sel.disabled) return;
          sel.disabled = true;
          try {
            await saveProp(p.file.path, fm => {
              fm["родитель"] = "[[" + target.file.name + "]]";
              if (!fm["дисциплина"] && typeof target.дисциплина === "string" && target.дисциплина) fm["дисциплина"] = target.дисциплина;
            });
            localOverrides.set(p.file.path, { ...(localOverrides.get(p.file.path) || {}), parents: [target.file.path] });
            link(p.file.path, target.file.path);
            notify("«" + p.file.name + "» → " + getDisplayName(target));
            renderAll();
          } catch (err) {
            sel.disabled = false;
            notify("Ошибка привязки: " + err.message);
          }
        };
      });
    }

    // -------------------------------------------------------------------
    // 4. КАРТОЧКИ (НА ВТОРОМ МЕСТЕ ПОСЛЕ ПРОЕКТОВ)
    // -------------------------------------------------------------------
    const cardsSectionContainer = root.createDiv({ cls: "dh dh-study-cards-hub" });
    await renderCardsSection(cardsSectionContainer, ws);

    // -------------------------------------------------------------------
    // 5. ЗАВЕРШЁННЫЕ ПРОЕКТЫ (В САМОМ КОНЦЕ ЗАМЕТКИ)
    // -------------------------------------------------------------------
    const doneDetails = root.createEl("details", {
      cls: "dh-details",
      attr: {
        style: "padding: 12px 16px; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border);"
      }
    });
    doneDetails.open = Boolean(uiState.completedSectionOpen);
    doneDetails.ontoggle = () => { uiState.completedSectionOpen = doneDetails.open; };

    doneDetails.createEl("summary", {
      text: "✅ Завершённые проекты (" + doneWs.length + ")",
      attr: { style: "font-size: 0.92rem; font-weight: 600; cursor: pointer; color: var(--text-normal); user-select: none;" }
    });

    if (!doneWs.length) {
      doneDetails.createDiv({
        text: "Завершённых проектов пока нет. Когда нажмёшь «✓» на карточке активного проекта, он перенесётся сюда со статистикой затраченных дней.",
        attr: { style: "font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;" }
      });
    } else {
      const doneList = doneDetails.createDiv({
        attr: { style: "display: flex; flex-direction: column; gap: 8px; margin-top: 12px;" }
      });

      doneWs.forEach(p => {
        const workMeta = getWorkMeta(typeOf(p), p.иконка);
        const startIso = getStartISO(p);
        const endIso = getFinishedISO(p);
        const deadlineIso = getDeadlineISO(p);

        const startDate = dv.date(startIso) || today;
        const endDate = dv.date(endIso) || today;
        const daysTaken = Math.max(1, Math.round(endDate.diff(startDate, "days").days) + 1);

        let isOverdue = false;
        let timingNote = "без дедлайна";
        if (deadlineIso) {
          const dDate = dv.date(deadlineIso);
          const diffFromDeadline = Math.round(endDate.diff(dDate, "days").days);
          if (diffFromDeadline > 0) {
            isOverdue = true;
            timingNote = "просрочено на " + diffFromDeadline + " дн.";
          } else if (diffFromDeadline === 0) {
            timingNote = "точно в срок";
          } else {
            timingNote = "досрочно на " + Math.abs(diffFromDeadline) + " дн.";
          }
        }

        const statusColor = isOverdue ? "#d85b57" : "#4aab80";

        const row = doneList.createDiv({
          attr: {
            style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 12px; background: var(--background-primary); border-radius: 6px; border: 1px solid var(--background-modifier-border); border-left: 3px solid " + statusColor + ";"
          }
        });

        const leftPart = row.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; min-width: 180px; flex: 1;" } });
        leftPart.createSpan({
          text: workMeta.icon,
          attr: { style: "font-size: 0.85rem;" }
        });

        const titleA = leftPart.createEl("a", {
          cls: "internal-link",
          text: getDisplayName(p),
          attr: { style: "font-size: 0.88rem; font-weight: 600; color: var(--text-normal); text-decoration: none;" }
        });
        openNote(titleA, p.file.path);

        leftPart.createSpan({
          text: "· " + typeOf(p),
          attr: { style: "font-size: 0.74rem; color: var(--text-muted);" }
        });

        const rightPart = row.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

        rightPart.createSpan({
          text: startDate.toFormat("dd.MM") + " → " + endDate.toFormat("dd.MM.yyyy"),
          attr: { style: "font-size: 0.72rem; color: var(--text-muted);" }
        });

        rightPart.createSpan({
          text: "⏱️ Заняло " + daysTaken + " дн. · " + timingNote,
          attr: {
            style: "font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 5px; background: " + statusColor + "18; color: " + statusColor + "; border: 1px solid " + statusColor + "44; white-space: nowrap;"
          }
        });

        const restoreBtn = rightPart.createEl("button", {
          text: "↩ Вернуть",
          attr: {
            type: "button",
            title: "Возобновить проект и вернуть в активные",
            style: "font-size: 0.72rem; height: 24px; padding: 0 8px; border-radius: 4px; background: transparent; color: var(--text-muted); border: 1px solid var(--background-modifier-border); cursor: pointer;"
          }
        });
        restoreBtn.onclick = async () => {
          if (restoreBtn.disabled) return;
          restoreBtn.disabled = true;
          try {
            await saveProp(p.file.path, fm => {
              fm["статус"] = "в работе";
              fm["завершено"] = null;
            });
            localOverrides.set(p.file.path, {
              ...(localOverrides.get(p.file.path) || {}),
              статус: "в работе",
              завершено: null
            });
            notify("Проект «" + getDisplayName(p) + "» возвращён в работу.");
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
