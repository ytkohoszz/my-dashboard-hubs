// 3D — компактная база знаний и приёмов (v4.2: вложенные темы через /) (v4.1: без require, обратных кавычек и $)
const normalizePath = p => String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/(?![\s\S])/g, "");
const AREA = "3D";
const TARGET_FOLDER = "Знания";
const CURRENT = dv.current()?.file?.path || dv.currentFilePath || "";

const PRESET_PROGRAMS = [
  "Blender",
  "Substance Painter",
  "Gaea",
  "SpeedTree",
  "ZBrush",
  "Marmoset",
  "Unreal Engine",
  "Maya"
];

const PRESET_TOPICS = [
  "Geometry Nodes",
  "Моделирование",
  "Текстурирование",
  "UV-развёртка",
  "Шейдеры",
  "Окружение",
  "Пайплайн",
  "Рендер и свет",
  "Запекание",
  "Скульптинг",
  "Анимация"
];

// Карта укрупнения мелких тем (Слева — старая тема в YAML, справа — укрупнённая группа)
const TOPIC_MAP = {
  "Вода": "Окружение",
  "Туман": "Окружение",
  "Растительность": "Окружение",
  "Ландшафт": "Окружение",
  "Деревья": "Окружение",
  "Импорт": "Пайплайн",
  "Экспорт": "Пайплайн",
  "Оптимизация": "Пайплайн",
  "Ретопология": "Моделирование",
  "Развёртка": "UV-развёртка",
  "Свет": "Рендер и свет",
  "Рендер": "Рендер и свет",
  "Материалы": "Шейдеры"
};
function topicParts(value) {
  return String(value || "").split("/").map(part => part.trim()).filter(Boolean);
}
const mapTopic = value => {
  const parts = topicParts(value);
  if (!parts.length) return "";
  parts[0] = TOPIC_MAP[parts[0]] || parts[0];
  return parts.join("/");
};
const USE_TOPIC_MAP = true;

// Акцентные цвета программ в палитре dashboard-home
const PROGRAM_COLORS = {
  "Blender": "#e5a158",
  "Substance Painter": "#d85b57",
  "Gaea": "#4aab80",
  "SpeedTree": "#69b5aa",
  "ZBrush": "#9c83e8",
  "Marmoset": "#599ed6",
  "Unreal Engine": "#5c8df6",
  "Maya": "#d69852"
};
const getProgColor = name => PROGRAM_COLORS[name] || "#9c83e8";

const STORAGE = "3d-hub-v4:" + app.vault.getName() + ":" + CURRENT;

const EMPTY_DRAFT = () => ({
  title: "",
  programs: ["Blender"],
  topics: [],
  source: ""
});

const defaults = {
  query: "",
  program: "",
  topic: "",
  localTopics: {},
  onlyPinned: false,
  onlyUntagged: false,
  useTopicMap: true,
  untaggedOpen: true,
  sort: "modified",
  groupByTopic: true,
  open: {},
  createOpen: false,
  draft: EMPTY_DRAFT(),
  editKey: "",
  editPath: "",
  editDraft: null
};

let saved = null;
try { saved = JSON.parse(sessionStorage.getItem(STORAGE)); } catch (_) {}
const state = { ...defaults, ...(typeof saved === "object" && saved ? saved : {}) };
state.open = state.open && typeof state.open === "object" ? state.open : {};
state.localTopics = state.localTopics && typeof state.localTopics === "object" ? state.localTopics : {};
state.draft = { ...EMPTY_DRAFT(), ...(state.draft || {}) };
state.groupByTopic = true;
state.sort = "modified";
state.onlyUntagged = false;

const persist = () => {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) {}
};

const pending = new Map();
let busy = false;
let knownNotes = [];
let searchTimer = null;

// Защита от гонок метаданных Obsidian
function setPending(path, patch) {
  pending.set(path, { ...(pending.get(path) || {}), ...patch });
  setTimeout(() => pending.delete(path), 1500);
}

const notify = text => {
  try { new Notice(text); } catch (_) { console.log(text); }
};

const list = value => {
  const raw = value == null ? [] : (Array.isArray(value) ? value : [value]);
  return [...new Set(raw.flat().map(v => typeof v === "string" ? v.trim() : "").filter(Boolean))];
};

const compare = (a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });
const sorted = values => [...new Set(values)].sort(compare);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function sourceText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.path === "string") return value.path;
  if (Array.isArray(value)) return value.map(sourceText).filter(Boolean).join(", ");
  return "";
}

function el(tag, parent, cls, text) {
  const node = parent
    ? (typeof parent.createEl === "function" ? parent.createEl(tag) : parent.appendChild(document.createElement(tag)))
    : document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
}

function button(parent, text, fn, cls = "") {
  const node = el("button", parent, ("d3n-button " + cls).trim(), text);
  node.type = "button";
  node.onmousedown = e => e.preventDefault();
  node.addEventListener("click", fn);
  return node;
}

function field(parent, caption, placeholder) {
  const label = el("label", parent, "d3n-field");
  el("span", label, "d3n-label", caption);
  const input = el("input", label, "d3n-input");
  input.type = "text";
  input.placeholder = placeholder;
  return input;
}

function enforceOverflowVisible() {
  const blockStyleSelector = ".block-language-" + "dataview" + "js";
  const targets = [
    dv.container,
    dv.container?.closest(blockStyleSelector),
    dv.container?.closest(".cm-embed-block")
  ];
  for (const t of targets) {
    if (t && t.style) t.style.overflow = "visible";
  }
}
enforceOverflowVisible();

function bindHoverPreview(node, path) {
  node.addEventListener("mouseover", event => {
    app.workspace.trigger("hover-link", {
      event,
      source: "dataview",
      hoverParent: root,
      targetEl: node,
      linktext: path,
      sourcePath: CURRENT
    });
  });
}

function openLink(node, path) {
  node.href = path;
  node.classList.add("internal-link");
  node.dataset.href = path;
  bindHoverPreview(node, path);
  node.addEventListener("click", e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    app.workspace.openLinkText(path, CURRENT, e.ctrlKey || e.metaKey);
  });
  node.addEventListener("auxclick", e => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    app.workspace.openLinkText(path, CURRENT, true);
  });
}

function showSourceBadge(parent, text) {
  if (!text) return;
  const wrap = el("span", parent, "d3n-source");
  wrap.addEventListener("click", e => e.stopPropagation());

  if (text.startsWith("[[") && text.endsWith("]]") && !text.includes("\n")) {
    const inner = text.slice(2, -2);
    const [path, ...alias] = inner.split("|");
    const a = el("a", wrap, "d3n-source-pill", alias.join("|") || path);
    openLink(a, path);
    a.title = text;
    return;
  }

  let url = null;
  try { url = new URL(text); } catch (_) {}
  if (url && ["https:", "http:"].includes(url.protocol)) {
    const host = url.hostname.replace(/^www\./, "");
    const a = el("a", wrap, "d3n-source-pill external-link", host);
    a.href = url.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = text;
  } else {
    const span = el("span", wrap, "d3n-source-text", text);
    span.title = text;
  }
}

const TEMPLATE_FOLDERS = ["Шаблоны", "Templates"];
const templateFiles = new Set();
try {
  const configured = app.internalPlugins?.plugins?.templates?.instance?.options?.folder;
  if (configured) TEMPLATE_FOLDERS.push(configured);
} catch (_) {}
try {
  const scan = choices => {
    if (!Array.isArray(choices)) return;
    for (const choice of choices) {
      if (choice?.templatePath) templateFiles.add(normalizePath(choice.templatePath));
      scan(choice?.choices);
    }
  };
  scan(app.plugins?.plugins?.quickadd?.settings?.choices);
} catch (_) {}

function isTemplate(file, fm) {
  const path = file.path.toLowerCase();
  const folders = TEMPLATE_FOLDERS.map(s => normalizePath(s).toLowerCase()).filter(Boolean);
  return templateFiles.has(file.path) ||
    folders.some(folder => path.startsWith(folder + "/") || path.includes("/" + folder + "/")) ||
    fm.шаблон === true ||
    String(fm.тип || "").toLowerCase() === "шаблон" ||
    list(fm.tags).some(tag => ["template", "шаблон"].includes(tag.replace(/^#/, "").toLowerCase()));
}

function readNotes() {
  const result = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path === CURRENT) continue;
    const cache = app.metadataCache.getFileCache(file);
    const fm = { ...(cache?.frontmatter || {}), ...(pending.get(file.path) || {}) };
    if (!list(fm.направление).includes(AREA) || isTemplate(file, fm)) continue;
    const rawTopics = list(fm.темы);
    const topicPaths = [...new Set(rawTopics.map(value => USE_TOPIC_MAP
      ? mapTopic(value) : topicParts(value).join("/")).filter(Boolean))];
    const displayTopics = [...new Set(topicPaths.map(value => topicParts(value)[0]))];
    result.push({
      file,
      path: file.path,
      title: file.basename,
      programs: list(fm.программы),
      rawTopics,
      topics: displayTopics,
      topicPaths,
      source: sourceText(fm.источник),
      pinned: fm.закреплено === true,
      mtime: file.stat.mtime
    });
  }
  return result;
}

const root = el("div", dv.container, "d3n");
root.tabIndex = -1;
const style = el("style", root);
style.textContent = [
  ".dashboard-home .d3n { --d3n-accent: #9c83e8; display: flex; flex-direction: column; gap: 11px; margin: 6px 0 28px; color: var(--text-normal); font-size: var(--font-text-size); overflow: visible; outline: none; }",
  ".dashboard-home .d3n, .dashboard-home .d3n * { box-sizing: border-box; }",
  ".dashboard-home .d3n .d3n-slot:empty { display: none; }",
  ".dashboard-home .d3n .d3n-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border: 1px solid var(--background-modifier-border); border-top: 3px solid #9c83e8; border-radius: 11px; background: var(--background-secondary); }",
  ".dashboard-home .d3n .d3n-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }",
  ".dashboard-home .d3n .d3n-title { font-size: 1.05em; font-weight: 750; letter-spacing: -0.01em; }",
  ".dashboard-home .d3n .d3n-muted { color: var(--text-muted); font-size: 0.78em; }",
  ".dashboard-home .d3n .d3n-warn-badge { display: inline-flex; align-items: center; gap: 4px; height: 23px; padding: 0 9px; border-radius: 999px; border: 1px solid rgba(216, 91, 87, 0.55); background: rgba(216, 91, 87, 0.12); color: #d85b57; font-size: 0.75em; font-weight: 700; cursor: pointer; }",
  ".dashboard-home .d3n .d3n-warn-badge.is-active { background: #d85b57; color: #141619; }",
  ".dashboard-home .d3n .d3n-header-actions, .dashboard-home .d3n .d3n-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }",
  ".dashboard-home .d3n .d3n-button { height: auto; min-height: 27px; padding: 4px 10px; border-radius: 7px; border: 1px solid var(--background-modifier-border); box-shadow: none; background: var(--background-primary); color: var(--text-normal); font-size: 0.77em; font-weight: 550; line-height: 1.2; cursor: pointer; transition: border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease; }",
  ".dashboard-home .d3n .d3n-button:hover:not(:disabled) { background: var(--background-modifier-hover); border-color: var(--text-muted); }",
  ".dashboard-home .d3n .d3n-button.d3n-primary { background: #9c83e8; color: #141619; font-weight: 700; border-color: transparent; }",
  ".dashboard-home .d3n .d3n-button.is-active { border-color: #9c83e8; color: #9c83e8; background: rgba(156, 131, 232, 0.12); }",
  ".dashboard-home .d3n .d3n-button.is-warn { border-color: rgba(229, 161, 88, 0.6); color: #e5a158; }",
  ".dashboard-home .d3n .d3n-button:disabled { opacity: 0.5; cursor: wait; }",
  ".dashboard-home .d3n .d3n-quick-strips { display: flex; flex-direction: column; gap: 6px; }",
  ".dashboard-home .d3n .d3n-strip { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 11px; border-radius: 9px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); }",
  ".dashboard-home .d3n .d3n-strip.is-pinned-strip { border-left: 3px solid #e5a158; }",
  ".dashboard-home .d3n .d3n-strip.is-recent-strip { border-left: 3px solid #599ed6; }",
  ".dashboard-home .d3n .d3n-strip-label { font-size: 0.73em; font-weight: 700; color: var(--text-muted); margin-right: 4px; white-space: nowrap; }",
  ".dashboard-home .d3n a.d3n-strip-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); font-size: 0.76em; text-decoration: none; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".dashboard-home .d3n a.d3n-strip-chip:hover { border-color: #9c83e8; color: var(--text-accent); }",
  ".dashboard-home .d3n .d3n-soft-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 8px; overflow: visible; }",
  ".dashboard-home .d3n .d3n-soft-tile { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 5px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--background-modifier-border); border-left: 3px solid var(--soft-color, #9c83e8); background: var(--background-secondary); cursor: pointer; user-select: none; overflow: visible; transition: border-color 0.14s ease, background-color 0.14s ease; }",
  ".dashboard-home .d3n .d3n-soft-tile:hover, .dashboard-home .d3n .d3n-soft-tile.is-pinned-pop { border-color: var(--soft-color, #9c83e8); background: var(--background-modifier-hover); }",
  ".dashboard-home .d3n .d3n-soft-tile.is-selected { background: color-mix(in srgb, var(--soft-color, #9c83e8) 14%, var(--background-secondary)); border-color: var(--soft-color, #9c83e8); box-shadow: inset 0 0 0 1px var(--soft-color, #9c83e8); }",
  ".dashboard-home .d3n .d3n-soft-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }",
  ".dashboard-home .d3n .d3n-soft-name { font-size: 0.86em; font-weight: 700; color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".dashboard-home .d3n .d3n-soft-count { font-size: 0.77em; font-weight: 700; color: var(--text-muted); background: var(--background-primary); padding: 1px 7px; border-radius: 999px; border: 1px solid var(--background-modifier-border); font-variant-numeric: tabular-nums; }",
  ".dashboard-home .d3n .d3n-soft-count.has-untagged { color: #d85b57; border-color: rgba(216, 91, 87, 0.55); background: rgba(216, 91, 87, 0.1); }",
  ".dashboard-home .d3n .d3n-soft-sub { font-size: 0.71em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".dashboard-home .d3n .d3n-popover { position: absolute; top: calc(100% + 8px); left: 0; right: 0; min-width: 215px; z-index: 60; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--soft-color, var(--background-modifier-border)); background: var(--background-primary); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.42); pointer-events: none; opacity: 0; transform: translateY(-4px); transition: opacity 0.14s ease, transform 0.14s ease; display: flex; flex-direction: column; gap: 4px; }",
  ".dashboard-home .d3n .d3n-soft-tile.is-open-pop .d3n-popover, .dashboard-home .d3n .d3n-soft-tile.is-pinned-pop .d3n-popover { opacity: 1; transform: translateY(0); }",
  ".dashboard-home .d3n .d3n-pop-title { font-size: 0.75em; font-weight: 700; color: var(--soft-color, #9c83e8); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 4px; margin-bottom: 2px; }",
  ".dashboard-home .d3n .d3n-pop-row { display: flex; justify-content: space-between; gap: 8px; font-size: 0.73em; color: var(--text-normal); }",
  ".dashboard-home .d3n .d3n-pop-val { color: var(--text-muted); font-variant-numeric: tabular-nums; }",
  ".dashboard-home .d3n .d3n-pop-warn { color: #d85b57; font-weight: 650; }",
  ".dashboard-home .d3n .d3n-filter-bar { display: flex; flex-direction: column; gap: 8px; padding: 9px 12px; border: 1px solid var(--background-modifier-border); border-radius: 10px; background: var(--background-secondary); }",
  ".dashboard-home .d3n .d3n-search-row { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }",
  ".dashboard-home .d3n .d3n-search-wrap { position: relative; flex: 1; min-width: 200px; }",
  ".dashboard-home .d3n .d3n-input { width: 100%; height: 30px; padding: 4px 10px; border: 1px solid var(--background-modifier-border); border-radius: 7px; background: var(--background-primary); color: var(--text-normal); font-size: 0.82em; box-shadow: none; }",
  ".dashboard-home .d3n .d3n-input:focus { border-color: #9c83e8; outline: none; }",
  ".dashboard-home .d3n .d3n-pills-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }",
  ".dashboard-home .d3n .d3n-row-caption { font-size: 0.7em; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); margin-right: 3px; }",
  ".dashboard-home .d3n button.d3n-pill { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 999px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-muted); font-size: 0.73em; font-weight: 550; cursor: pointer; box-shadow: none; }",
  ".dashboard-home .d3n button.d3n-pill:hover { border-color: var(--pill-color, #9c83e8); color: var(--text-normal); }",
  ".dashboard-home .d3n button.d3n-pill.is-active { background: color-mix(in srgb, var(--pill-color, #9c83e8) 18%, var(--background-primary)); border-color: var(--pill-color, #9c83e8); color: var(--text-normal); font-weight: 700; }",
  ".dashboard-home .d3n .d3n-pill-num { font-size: 0.86em; opacity: 0.7; font-variant-numeric: tabular-nums; }",
  ".dashboard-home .d3n details.d3n-untagged-wide { border: 1px solid rgba(216, 91, 87, 0.55); border-left: 4px solid #d85b57; border-radius: 10px; background: rgba(216, 91, 87, 0.05); overflow: hidden; }",
  ".dashboard-home .d3n details.d3n-untagged-wide summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 13px; cursor: pointer; list-style: none; user-select: none; font-size: 0.84em; font-weight: 700; color: #e5a158; }",
  ".dashboard-home .d3n details.d3n-untagged-wide summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .d3n .d3n-untagged-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 255px), 1fr)); gap: 6px 10px; padding: 6px 12px 12px; border-top: 1px solid rgba(216, 91, 87, 0.22); }",
  ".dashboard-home .d3n .d3n-untagged-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 8px; border-radius: 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); min-width: 0; }",
  ".dashboard-home .d3n .d3n-topic-select { height: 23px; max-width: 128px; padding: 0 5px; border-radius: 5px; border: 1px solid rgba(229, 161, 88, 0.5); background: var(--background-secondary); color: var(--text-normal); font-size: 0.72em; cursor: pointer; flex-shrink: 0; }",
  ".dashboard-home .d3n .d3n-groups { display: flex; flex-direction: column; gap: 11px; }",
  ".dashboard-home .d3n details.d3n-group { border: 1px solid var(--background-modifier-border); border-left: 3px solid var(--group-color, #9c83e8); border-radius: 11px; background: var(--background-secondary); overflow: hidden; }",
  ".dashboard-home .d3n .d3n-group summary { display: flex; align-items: center; gap: 9px; list-style: none; cursor: pointer; padding: 9px 13px; user-select: none; }",
  ".dashboard-home .d3n .d3n-group summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .d3n .d3n-group summary::before { content: '▸'; display: inline-block; color: var(--text-muted); font-size: 1.15em; transition: transform 0.14s ease; }",
  ".dashboard-home .d3n .d3n-group[open] summary::before { transform: rotate(90deg); }",
  ".dashboard-home .d3n .d3n-group summary:hover { background: var(--background-modifier-hover); }",
  ".dashboard-home .d3n .d3n-group-name { font-weight: 750; font-size: 0.94em; flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }",
  ".dashboard-home .d3n .d3n-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--group-color, #9c83e8); flex-shrink: 0; }",
  ".dashboard-home .d3n .d3n-group-add { height: 22px; min-height: 22px; padding: 0 8px; font-size: 0.72em; border-radius: 6px; }",
  ".dashboard-home .d3n .d3n-count { font-size: 0.73em; color: var(--text-muted); font-variant-numeric: tabular-nums; background: var(--background-primary); padding: 1px 8px; border: 1px solid var(--background-modifier-border); border-radius: 20px; }",
  ".dashboard-home .d3n .d3n-group-body { display: flex; flex-direction: column; gap: 9px; padding: 4px 12px 12px; }",
  ".dashboard-home .d3n .d3n-local-bar { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding-bottom: 5px; border-bottom: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .d3n .d3n-topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 245px), 1fr)); gap: 9px; align-items: start; }",
  ".dashboard-home .d3n .d3n-topic-box { border: 1px solid var(--background-modifier-border); border-radius: 9px; background: var(--background-primary); display: flex; flex-direction: column; overflow: hidden; }",
  ".dashboard-home .d3n .d3n-topic-box.is-untagged-box { border-color: rgba(216, 91, 87, 0.45); }",
  ".dashboard-home .d3n .d3n-topic-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .d3n .d3n-topic-title { font-size: 0.78em; font-weight: 700; color: var(--group-color, #9c83e8); display: flex; align-items: center; gap: 6px; }",
  ".dashboard-home .d3n .d3n-topic-box.is-untagged-box .d3n-topic-title { color: #d85b57; }",
  ".dashboard-home .d3n .d3n-topic-meta { display: flex; align-items: center; gap: 4px; }",
  ".dashboard-home .d3n .d3n-topic-cnt { font-size: 0.7em; color: var(--text-faint); font-variant-numeric: tabular-nums; }",
  ".dashboard-home .d3n .d3n-topic-add { height: 19px; min-height: 19px; padding: 0 5px; font-size: 0.72em; border-radius: 4px; color: var(--text-muted); background: transparent; border-color: transparent; }",
  ".dashboard-home .d3n .d3n-note-list { display: flex; flex-direction: column; }",
  ".dashboard-home .d3n .d3n-note-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 9px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); cursor: pointer; transition: background-color 0.1s ease; }",
  ".dashboard-home .d3n .d3n-note-row:last-child { border-bottom: none; }",
  ".dashboard-home .d3n .d3n-note-row:hover { background: var(--background-modifier-hover); }",
  ".dashboard-home .d3n .d3n-note-main { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }",
  ".dashboard-home .d3n a.d3n-note-link { color: var(--text-normal); font-size: 0.82em; font-weight: 550; line-height: 1.28; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }",
  ".dashboard-home .d3n .d3n-note-row:hover a.d3n-note-link { color: var(--group-color, var(--text-accent)); }",
  ".dashboard-home .d3n .d3n-note-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }",
  ".dashboard-home .d3n .d3n-mini-tag { font-size: 0.66em; padding: 1px 5px; border-radius: 4px; color: var(--text-muted); background: var(--background-secondary); border: 1px solid var(--background-modifier-border); white-space: nowrap; }",
  ".dashboard-home .d3n .d3n-row-tools { display: flex; align-items: center; gap: 2px; }",
  ".dashboard-home .d3n .d3n-icon-btn { color: var(--text-muted); font-size: 0.82em; padding: 0 4px; min-height: 20px; height: 20px; background: transparent; border-color: transparent; opacity: 0.4; transition: transform 0.1s ease, color 0.12s ease, opacity 0.12s ease; }",
  ".dashboard-home .d3n .d3n-note-row:hover .d3n-icon-btn { opacity: 1; }",
  ".dashboard-home .d3n .d3n-icon-btn:hover { color: #e5a158; transform: scale(1.18); }",
  ".dashboard-home .d3n .d3n-icon-btn.is-pinned { color: #e5a158; opacity: 1; }",
  ".dashboard-home .d3n .d3n-source { display: inline-flex; align-items: center; font-size: 0.68em; }",
  ".dashboard-home .d3n a.d3n-source-pill { display: inline-flex; align-items: center; padding: 0 5px; height: 18px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); text-decoration: none; max-width: 105px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".dashboard-home .d3n .d3n-source-text { color: var(--text-faint); max-width: 85px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dashboard-home .d3n .d3n-chip-picker { display: flex; flex-direction: column; gap: 5px; }",
  ".dashboard-home .d3n .d3n-chip-pool { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }",
  ".dashboard-home .d3n button.d3n-choice-chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-muted); font-size: 0.74em; font-weight: 550; cursor: pointer; box-shadow: none; }",
  ".dashboard-home .d3n button.d3n-choice-chip.is-selected { background: color-mix(in srgb, var(--chip-accent, #9c83e8) 22%, var(--background-primary)); border-color: var(--chip-accent, #9c83e8); color: var(--text-normal); font-weight: 700; }",
  ".dashboard-home .d3n .d3n-custom-input { width: 135px !important; height: 24px !important; padding: 2px 7px !important; font-size: 0.74em !important; }",
  ".dashboard-home .d3n .d3n-panel, .dashboard-home .d3n .d3n-inline-editor { border: 1px solid var(--background-modifier-border); border-left: 3px solid #9c83e8; border-radius: 9px; background: var(--background-secondary); padding: 12px; display: flex; flex-direction: column; gap: 9px; }",
  ".dashboard-home .d3n .d3n-inline-editor { margin: 4px 6px; }",
  ".dashboard-home .d3n .d3n-panel-title { font-weight: 700; font-size: 0.88em; display: flex; justify-content: space-between; align-items: center; }",
  ".dashboard-home .d3n .d3n-field { display: flex; flex-direction: column; gap: 4px; }",
  ".dashboard-home .d3n .d3n-label { font-size: 0.72em; color: var(--text-muted); font-weight: 600; }",
  ".dashboard-home .d3n .d3n-message { color: var(--text-error); font-size: 0.76em; }",
  ".dashboard-home .d3n .d3n-message:empty { display: none; }",
  ".dashboard-home .d3n .d3n-empty { padding: 16px 12px; border: 1px dashed var(--background-modifier-border); border-radius: 9px; color: var(--text-muted); font-size: 0.82em; text-align: center; }"
].join("\n");

const treeStyle = el("style", root);
treeStyle.textContent = [
  ".dashboard-home .d3n .d3n-tree-folder { margin: 8px; border: 1px solid var(--background-modifier-border); border-radius: 8px; background: var(--background-secondary); min-width: 0; }",
  ".dashboard-home .d3n .d3n-tree-folder > summary.d3n-tree-summary { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 8px; font-size: 0.8em; cursor: pointer; list-style: none; }",
  ".dashboard-home .d3n .d3n-tree-folder > summary.d3n-tree-summary::before { content: '▸'; transform: none; }",
  ".dashboard-home .d3n .d3n-tree-folder[open] > summary.d3n-tree-summary::before { transform: rotate(90deg); }",
  ".dashboard-home .d3n .d3n-tree-summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .d3n .d3n-tree-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-weight: 650; }",
  ".dashboard-home .d3n .d3n-tree-tools { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; padding: 8px; }",
  ".dashboard-home .d3n .d3n-tree-tools .d3n-field { flex: 1; min-width: 100px; }",
  ".dashboard-home .d3n .d3n-tree-tools .d3n-button, .dashboard-home .d3n .d3n-tree-summary .d3n-button { min-height: 44px; min-width: 44px; }",
  ".dashboard-home .d3n .d3n-tree-content { min-width: 0; }"
].join("\n");

// Управление закреплёнными всплывающими подсказками (Popovers)
let pinnedTile = null;
const closePinnedPopover = () => {
  if (pinnedTile) {
    pinnedTile.classList.remove("is-pinned-pop", "is-open-pop");
    pinnedTile = null;
  }
};

if (dv.component && typeof dv.component.registerDomEvent === "function") {
  dv.component.registerDomEvent(document, "click", e => {
    if (pinnedTile && !pinnedTile.contains(e.target)) closePinnedPopover();
  });
}

root.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closePinnedPopover();
    if (document.activeElement === searchInput && searchInput.value) {
      searchInput.value = "";
      state.query = "";
      persist();
      renderResults();
      return;
    }
  }
  const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (!inInput && e.key === "/") {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// --- 1. Шапка ---
const header = el("div", root, "d3n-header");
const headerLeft = el("div", header, "d3n-header-left");
el("div", headerLeft, "d3n-title", "🧊 3D");
const totalLabel = el("span", headerLeft, "d3n-muted");

const headerActions = el("div", header, "d3n-header-actions");
button(headerActions, "Обновить", () => {
  if (busy) return;
  pending.clear();
  refreshData();
  renderResults();
}).title = "Перечитать файлы из хранилища";

const createMainBtn = button(headerActions, "＋ Заметка", () => {
  if (state.createOpen) {
    state.createOpen = false;
    persist();
    renderCreate();
    renderResults();
  } else {
    openCreate(state.program && state.program !== "__none__" ? state.program : "", state.topic || "");
  }
}, "d3n-primary");

const createHost = el("div", root, "d3n-slot");

// --- 3. Сетка программ ---
const softGrid = el("div", root, "d3n-soft-grid");

// --- 4. Панель поиска и фильтров ---
const filterBar = el("div", root, "d3n-filter-bar");
const searchRow = el("div", filterBar, "d3n-search-row");
const searchWrap = el("div", searchRow, "d3n-search-wrap");
const searchInput = el("input", searchWrap, "d3n-input");
searchInput.type = "search";
searchInput.placeholder = "Поиск по названию, темам, источнику… (нажми /)";
searchInput.value = state.query;

const pinnedFilterBtn = button(searchRow, "📌 Закреплённые", () => {
  state.onlyPinned = !state.onlyPinned;
  persist();
  renderOverviewAndFilters();
  renderResults();
});

const resetBtn = button(searchRow, "Сбросить фильтры", () => {
  state.query = "";
  state.program = "";
  state.topic = "";
  state.localTopics = {};
  state.onlyPinned = false;
  state.onlyUntagged = false;
  searchInput.value = "";
  persist();
  renderOverviewAndFilters();
  renderResults();
});

const topicPillsRow = el("div", filterBar, "d3n-pills-row");

// --- 6. Основная выдача карточек ---
const results = el("div", root, "d3n-groups");

function getAvailableTopics() {
  return sorted([...PRESET_TOPICS, ...knownNotes.flatMap(n => n.topicPaths)]);
}

function chipSelector(parent, caption, initialValues, suggestions, onChange, isProgram = false) {
  const wrap = el("div", parent, "d3n-chip-picker");
  el("span", wrap, "d3n-label", caption);
  const pool = el("div", wrap, "d3n-chip-pool");
  let selected = list(initialValues);
  const allOptions = sorted([...suggestions, ...selected]);

  function redrawPool() {
    pool.replaceChildren();
    const merged = sorted([...allOptions, ...selected]);
    for (const item of merged) {
      const isOn = selected.includes(item);
      const chip = el("button", pool, "d3n-choice-chip" + (isOn ? " is-selected" : ""), (isOn ? "✓ " : "") + item);
      chip.type = "button";
      chip.onmousedown = e => e.preventDefault();
      chip.style.setProperty("--chip-accent", isProgram ? getProgColor(item) : "#9c83e8");
      chip.addEventListener("click", () => {
        selected = isOn ? selected.filter(x => x !== item) : [...selected, item];
        onChange([...selected]);
        redrawPool();
      });
    }

    const customInput = el("input", pool, "d3n-input d3n-custom-input");
    customInput.type = "text";
    customInput.placeholder = isProgram ? "Другая программа…" : "Другая тема…";

    const commitCustom = () => {
      const raw = customInput.value.trim();
      if (!raw) return;
      const match = merged.find(x => x.toLocaleLowerCase("ru") === raw.toLocaleLowerCase("ru"));
      const finalVal = match || raw;
      if (!allOptions.includes(finalVal)) allOptions.push(finalVal);
      if (!selected.includes(finalVal)) selected = [...selected, finalVal];
      customInput.value = "";
      onChange([...selected]);
      redrawPool();
    };

    customInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commitCustom();
      }
    });
    customInput.addEventListener("blur", commitCustom);
  }

  redrawPool();
  return {
    getValues: () => [...selected]
  };
}

async function assignSingleTopic(note, newTopic, selectEl) {
  if (!newTopic || busy) return;
  const file = app.vault.getAbstractFileByPath(note.path);
  if (!file) return;

  busy = true;
  if (selectEl) selectEl.disabled = true;

  try {
    const nextTopics = [...new Set([...note.rawTopics, newTopic])];
    await app.fileManager.processFrontMatter(file, fm => {
      fm.темы = nextTopics;
    });
    setPending(note.path, { темы: nextTopics });
    notify("Тема «" + newTopic + "» добавлена к «" + note.title + "»");
    refreshData();
    renderResults();
  } catch (err) {
    notify("Ошибка: " + (err?.message || String(err)));
  } finally {
    busy = false;
    if (selectEl) selectEl.disabled = false;
  }
}

function refreshData() {
  knownNotes = readNotes();
  const programs = sorted(knownNotes.flatMap(n => n.programs));
  const topics = sorted(knownNotes.flatMap(n => n.topics));

  if (state.program && state.program !== "__none__" && !programs.includes(state.program)) {
    state.program = "";
  }
  if (state.topic && !topics.includes(state.topic)) {
    state.topic = "";
  }

  const totalUntagged = knownNotes.filter(n => n.topics.length === 0).length;
  totalLabel.textContent = knownNotes.length + " заметок · " + programs.length + " программ";

  renderOverviewAndFilters();
}

function attachPopoverEvents(tile) {
  tile.onmousedown = e => e.preventDefault();
  tile.addEventListener("mouseenter", () => {
    if (pinnedTile !== tile) tile.classList.add("is-open-pop");
  });
  tile.addEventListener("mouseleave", () => {
    if (pinnedTile !== tile) tile.classList.remove("is-open-pop");
  });
}

function renderOverviewAndFilters() {
  softGrid.replaceChildren();
  topicPillsRow.replaceChildren();

  const pinnedCount = knownNotes.filter(n => n.pinned).length;
  pinnedFilterBtn.hidden = pinnedCount === 0 && !state.onlyPinned;
  pinnedFilterBtn.textContent = "📌 Закреплённые (" + pinnedCount + ")";
  pinnedFilterBtn.classList.toggle("is-active", state.onlyPinned);

  const progMap = new Map();
  const noProgNotes = [];

  for (const n of knownNotes) {
    if (!n.programs.length) {
      noProgNotes.push(n);
      continue;
    }
    for (const p of n.programs) {
      if (!progMap.has(p)) progMap.set(p, []);
      progMap.get(p).push(n);
    }
  }

  const progKeys = [...progMap.keys()].sort((a, b) => progMap.get(b).length - progMap.get(a).length || compare(a, b));
  const totalUntagged = knownNotes.filter(n => n.topics.length === 0).length;

  const allTile = el("div", softGrid, "d3n-soft-tile" + (!state.program ? " is-selected" : ""));
  allTile.style.setProperty("--soft-color", "#9c83e8");
  const allTop = el("div", allTile, "d3n-soft-top");
  el("span", allTop, "d3n-soft-name", "Все программы");
  const allCnt = el("span", allTop, "d3n-soft-count" + (totalUntagged > 0 ? " has-untagged" : ""), knownNotes.length);
  allCnt.title = totalUntagged > 0 ? "Без темы: " + totalUntagged : "";
  el("div", allTile, "d3n-soft-sub", progKeys.length ? progKeys.join(" · ") : "Нет заметок");
  allTile.addEventListener("click", () => {
    state.program = "";
    persist();
    renderOverviewAndFilters();
    renderResults();
  });

  for (const prog of progKeys) {
    const pNotes = progMap.get(prog);
    const isSel = state.program === prog;
    const color = getProgColor(prog);

    const tCounts = new Map();
    let untagged = 0;
    for (const n of pNotes) {
      if (!n.topics.length) untagged++;
      for (const t of n.topics) tCounts.set(t, (tCounts.get(t) || 0) + 1);
    }
    const topTopics = [...tCounts.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));

    const tile = el("div", softGrid, "d3n-soft-tile" + (isSel ? " is-selected" : ""));
    tile.style.setProperty("--soft-color", color);
    attachPopoverEvents(tile);

    const top = el("div", tile, "d3n-soft-top");
    el("span", top, "d3n-soft-name", prog);
    const cntBadge = el("span", top, "d3n-soft-count" + (untagged > 0 ? " has-untagged" : ""), pNotes.length);
    cntBadge.title = untagged > 0 ? "Без темы: " + untagged : "";

    el("div", tile, "d3n-soft-sub", topTopics.length ? topTopics.slice(0, 3).map(x => x[0]).join(" · ") : "Нет тем");

    const pop = el("div", tile, "d3n-popover");
    el("div", pop, "d3n-pop-title", prog + " (" + pNotes.length + " зам.)");
    if (untagged > 0) {
      const r = el("div", pop, "d3n-pop-row");
      el("span", r, "d3n-pop-warn", "Без темы");
      el("span", r, "d3n-pop-warn", untagged);
    }
    for (const [tName, cnt] of topTopics.slice(0, 8)) {
      const r = el("div", pop, "d3n-pop-row");
      el("span", r, "", tName);
      el("span", r, "d3n-pop-val", cnt);
    }

    tile.addEventListener("click", e => {
      if (e.shiftKey) {
        if (pinnedTile === tile) {
          closePinnedPopover();
        } else {
          closePinnedPopover();
          pinnedTile = tile;
          tile.classList.add("is-pinned-pop");
        }
        return;
      }
      state.program = isSel ? "" : prog;
      if (state.program) {
        state.topic = "";
        state.open[prog] = true;
      }
      persist();
      renderOverviewAndFilters();
      renderResults();
    });
  }

  if (noProgNotes.length > 0) {
    const isNone = state.program === "__none__";
    const noneTile = el("div", softGrid, "d3n-soft-tile" + (isNone ? " is-selected" : ""));
    noneTile.style.setProperty("--soft-color", "var(--text-muted)");
    const top = el("div", noneTile, "d3n-soft-top");
    el("span", top, "d3n-soft-name", "Без программы");
    el("span", top, "d3n-soft-count has-untagged", noProgNotes.length);
    el("div", noneTile, "d3n-soft-sub", "Не указано в YAML");
    noneTile.addEventListener("click", () => {
      state.program = isNone ? "" : "__none__";
      persist();
      renderOverviewAndFilters();
      renderResults();
    });
  }

  if (!state.program) {
    const globalTopicCounts = new Map();
    for (const n of knownNotes) {
      for (const t of n.topics) globalTopicCounts.set(t, (globalTopicCounts.get(t) || 0) + 1);
    }
    const sortedGlobalTopics = [...globalTopicCounts.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));

    if (sortedGlobalTopics.length > 0) {
      topicPillsRow.hidden = false;
      el("span", topicPillsRow, "d3n-row-caption", "Темы:");

      const allTopicBtn = el("button", topicPillsRow, "d3n-pill" + (!state.topic ? " is-active" : ""));
      allTopicBtn.type = "button";
      allTopicBtn.onmousedown = e => e.preventDefault();
      el("span", allTopicBtn, "", "Все темы");
      allTopicBtn.addEventListener("click", () => {
        state.topic = "";
        persist();
        renderOverviewAndFilters();
        renderResults();
      });

      for (const [topic, cnt] of sortedGlobalTopics) {
        const isAct = state.topic === topic;
        const tPill = el("button", topicPillsRow, "d3n-pill" + (isAct ? " is-active" : ""));
        tPill.type = "button";
        tPill.onmousedown = e => e.preventDefault();
        el("span", tPill, "", topic);
        el("span", tPill, "d3n-pill-num", cnt);
        tPill.addEventListener("click", () => {
          state.topic = isAct ? "" : topic;
          persist();
          renderOverviewAndFilters();
          renderResults();
        });
      }
    } else {
      topicPillsRow.hidden = true;
    }
  } else {
    topicPillsRow.hidden = true;
  }
}

async function togglePin(note, btn) {
  if (busy) return;
  const file = app.vault.getAbstractFileByPath(note.path);
  if (!file) return;

  const nextPinned = !note.pinned;
  busy = true;
  if (btn) btn.disabled = true;

  try {
    await app.fileManager.processFrontMatter(file, fm => {
      if (nextPinned) fm.закреплено = true;
      else delete fm.закреплено;
    });
    setPending(note.path, { закреплено: nextPinned ? true : undefined });
    refreshData();
    renderResults();
  } catch (err) {
    notify("Ошибка: " + (err?.message || String(err)));
  } finally {
    busy = false;
    if (btn) btn.disabled = false;
  }
}

function renderInlineEditor(container, note) {
  const editor = el("div", container, "d3n-inline-editor");
  editor.onclick = e => e.stopPropagation();

  const draft = state.editDraft;
  const head = el("div", editor, "d3n-panel-title");
  el("span", head, "", "Редактирование: " + note.title);

  const progSelector = chipSelector(
    editor,
    "Программы",
    draft.programs,
    [...PRESET_PROGRAMS, ...knownNotes.flatMap(n => n.programs)],
    vals => { draft.programs = vals; persist(); },
    true
  );

  const topicSelector = chipSelector(
    editor,
    "Темы",
    draft.topics,
    getAvailableTopics(),
    vals => { draft.topics = vals; persist(); },
    false
  );

  const sourceInput = field(editor, "Источник (ссылка или [[заметка]])", "https://...");
  sourceInput.value = draft.source;
  sourceInput.addEventListener("input", () => {
    draft.source = sourceInput.value;
    persist();
  });

  const message = el("div", editor, "d3n-message");
  const actions = el("div", editor, "d3n-actions");

  const saveBtn = button(actions, "Сохранить", async () => {
    if (busy) return;
    draft.programs = progSelector.getValues();
    draft.topics = topicSelector.getValues();
    draft.source = sourceInput.value.trim();
    persist();

    const patch = {};
    if (!same(draft.programs, draft.originalPrograms)) patch.программы = list(draft.programs);
    if (!same(draft.topics, draft.originalTopics)) patch.темы = list(draft.topics);
    if (draft.source !== draft.originalSource) patch.источник = draft.source;

    if (!Object.keys(patch).length) {
      state.editKey = "";
      state.editPath = "";
      state.editDraft = null;
      persist();
      renderResults();
      return;
    }

    busy = true;
    saveBtn.disabled = true;
    let success = false;

    try {
      const current = app.vault.getAbstractFileByPath(note.path);
      if (!current || current.extension !== "md") throw new Error("Файл не найден.");
      await app.fileManager.processFrontMatter(current, fm => {
        Object.assign(fm, patch);
      });
      setPending(note.path, patch);
      success = true;
    } catch (err) {
      message.textContent = err?.message || String(err);
    } finally {
      busy = false;
      saveBtn.disabled = false;
    }

    if (!success) return;

    state.editKey = "";
    state.editPath = "";
    state.editDraft = null;
    persist();
    refreshData();
    renderResults();
    notify("Обновлено: " + note.title);
  }, "d3n-primary");

  button(actions, "Отмена", () => {
    if (busy) return;
    state.editKey = "";
    state.editPath = "";
    state.editDraft = null;
    persist();
    renderResults();
  });
}

function renderCompactNoteRow(parentList, note, currentTopicContext = "", progKey = "") {
  const rowContextKey = progKey + "::" + currentTopicContext + "::" + note.path;
  if (state.editPath === note.path && state.editKey === rowContextKey && state.editDraft) {
    renderInlineEditor(parentList, note);
    return;
  }

  const row = el("div", parentList, "d3n-note-row");
  bindHoverPreview(row, note.path);

  row.addEventListener("click", e => {
    if (e.target.closest("button, a, input, select")) return;
    app.workspace.openLinkText(note.path, CURRENT, e.ctrlKey || e.metaKey);
  });

  row.addEventListener("auxclick", e => {
    if (e.button !== 1 || e.target.closest("button, a, input, select")) return;
    e.preventDefault();
    app.workspace.openLinkText(note.path, CURRENT, true);
  });

  const main = el("div", row, "d3n-note-main");
  const link = el("a", main, "d3n-note-link", note.title);
  link.title = note.title;
  openLink(link, note.path);

  const right = el("div", row, "d3n-note-right");

  const extraTopics = currentTopicContext
    ? note.topics.filter(t => t !== currentTopicContext)
    : note.topics;

  for (const t of extraTopics.slice(0, 2)) {
    el("span", right, "d3n-mini-tag", t);
  }

  showSourceBadge(right, note.source);

  const tools = el("div", right, "d3n-row-tools");

  const pinBtn = button(tools, note.pinned ? "★" : "☆", e => {
    e.stopPropagation();
    togglePin(note, pinBtn);
  }, "d3n-icon-btn" + (note.pinned ? " is-pinned" : ""));
  pinBtn.title = note.pinned ? "Открепить" : "Закрепить вверху";

  const editBtn = button(tools, "✎", e => {
    e.stopPropagation();
    openEdit(note, rowContextKey);
  }, "d3n-icon-btn");
  editBtn.title = "Редактировать тему/программу";
}

// Вложенность хранится только в «темы»: Моделирование/bevel/Сегменты.
function renderTopicTree(parent, notes, rootTopic, progKey) {
  const tree = { path: rootTopic, name: rootTopic, direct: new Map(), all: new Map(), children: new Map() };
  for (const note of notes) {
    const paths = note.topicPaths.filter(path => path === rootTopic || path.startsWith(rootTopic + "/"));
    // Если указаны и родитель, и потомок, заметка остаётся только в более точной группе.
    const leaves = paths.filter(path => !paths.some(other => other.startsWith(path + "/")));
    for (const path of leaves) {
      let node = tree;
      node.all.set(note.path, note);
      const parts = topicParts(path);
      for (let index = 1; index < parts.length; index++) {
        const name = parts[index];
        if (!node.children.has(name)) node.children.set(name, {
          path: node.path + "/" + name, name, direct: new Map(), all: new Map(), children: new Map()
        });
        node = node.children.get(name);
        node.all.set(note.path, note);
      }
      node.direct.set(note.path, note);
    }
  }
  function addFolderForm(host, parentPath) {
    const tools = el("div", host, "d3n-tree-tools");
    button(tools, "+ Подраздел", event => {
      event.preventDefault();
      event.stopPropagation();
      tools.replaceChildren();
      const input = field(tools, "Название подраздела", "Например, bevel");
      const message = el("div", tools, "d3n-message");
      const run = () => {
        const parts = topicParts(input.value);
        if (!parts.length) { message.textContent = "Введи название подраздела."; return; }
        openCreate(progKey === "__none__" ? "" : progKey, parentPath + "/" + parts.join("/"));
      };
      button(tools, "Добавить заметку", run);
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); run(); }
      });
      input.focus();
    });
  }
  function draw(host, node) {
    if (node.direct.size) {
      const listHost = el("div", host, "d3n-note-list");
      for (const note of node.direct.values()) renderCompactNoteRow(listHost, note, node.path, progKey);
    }
    const children = [...node.children.values()].sort((a, b) => b.all.size - a.all.size || compare(a.name, b.name));
    for (const child of children) {
      const details = el("details", host, "d3n-tree-folder");
      const key = JSON.stringify(["topic-tree", progKey, child.path]);
      details.open = state.open[key] !== false;
      const summary = el("summary", details, "d3n-tree-summary");
      el("span", summary, "d3n-tree-name", child.name);
      el("span", summary, "d3n-topic-cnt", child.all.size);
      const add = button(summary, "+", event => {
        event.preventDefault(); event.stopPropagation();
        openCreate(progKey === "__none__" ? "" : progKey, child.path);
      });
      add.title = "Добавить заметку в «" + child.path + "»";
      add.setAttribute("aria-label", add.title);
      details.addEventListener("toggle", () => {
        state.open[key] = details.open;
        persist();
      });
      const content = el("div", details, "d3n-tree-content");
      draw(content, child);
    }
    addFolderForm(host, node.path);
  }
  draw(parent, tree);
}

function renderResults() {
  results.replaceChildren();
  createMainBtn.textContent = state.createOpen ? "✕ Закрыть" : "＋ Заметка";

  const query = String(state.query || "").trim().toLocaleLowerCase("ru");

  let notes = knownNotes.filter(note => {
    if (state.onlyPinned && !note.pinned) return false;
    if (state.onlyUntagged && note.topics.length > 0) return false;
    if (state.program === "__none__" && note.programs.length) return false;
    if (state.program && state.program !== "__none__" && !note.programs.includes(state.program)) return false;
    if (!state.program && state.topic && !note.topics.includes(state.topic)) return false;
    return !query || [note.title, ...note.programs, ...note.topics, ...note.rawTopics, ...note.topicPaths, note.source].join("\n").toLocaleLowerCase("ru").includes(query);
  });

  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return state.sort === "title" ? compare(a.title, b.title) : (b.mtime - a.mtime || compare(a.title, b.title));
  });

  const hasActiveFilters = !!(
    query ||
    state.program ||
    state.topic ||
    state.onlyPinned ||
    state.onlyUntagged ||
    Object.values(state.localTopics).some(Boolean)
  );
  resetBtn.hidden = !hasActiveFilters;

  if (!notes.length) {
    el("div", results, "d3n-empty", knownNotes.length ? "Ничего не найдено по текущим фильтрам." : "Заметок с направлением «3D» пока нет.");
    return;
  }

  const grouped = new Map();
  for (const note of notes) {
    const keys = note.programs.length ? note.programs : ["__none__"];
    for (const key of keys) {
      if (state.program && state.program !== key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(note);
    }
  }

  const keys = [...grouped.keys()].sort((a, b) => {
    if (a === "__none__") return 1;
    if (b === "__none__") return -1;
    return grouped.get(b).length - grouped.get(a).length || compare(a, b);
  });

  keys.forEach((progKey, index) => {
    const progNotes = grouped.get(progKey);
    const groupColor = progKey === "__none__" ? "var(--text-muted)" : getProgColor(progKey);

    const details = el("details", results, "d3n-group");
    details.style.setProperty("--group-color", groupColor);

    const fallbackOpen = index < 3 && progKey !== "__none__" && keys.length > 1;
    const desiredOpen = (query || state.program || state.topic || state.onlyPinned || state.onlyUntagged)
      ? true
      : (Object.prototype.hasOwnProperty.call(state.open, progKey) ? !!state.open[progKey] : fallbackOpen);
    details.open = desiredOpen;

    const summary = el("summary", details);
    const nameWrap = el("span", summary, "d3n-group-name");
    if (progKey !== "__none__") el("span", nameWrap, "d3n-dot");
    el("span", nameWrap, "", progKey === "__none__" ? "Без программы" : progKey);

    button(summary, "＋ В " + (progKey === "__none__" ? "раздел" : progKey), e => {
      e.stopPropagation();
      e.preventDefault();
      openCreate(progKey === "__none__" ? "" : progKey, state.localTopics[progKey] || state.topic || "");
    }, "d3n-group-add");

    el("span", summary, "d3n-count", progNotes.length);

    const body = el("div", details, "d3n-group-body");

    const localTopicCounts = new Map();
    let untaggedCount = 0;
    for (const n of progNotes) {
      if (!n.topics.length) untaggedCount++;
      for (const t of n.topics) localTopicCounts.set(t, (localTopicCounts.get(t) || 0) + 1);
    }

    const activeLocalTopic = state.localTopics[progKey];

    if (localTopicCounts.size > 0 && !state.topic) {
      const localBar = el("div", body, "d3n-local-bar");
      el("span", localBar, "d3n-row-caption", progKey === "__none__" ? "Темы:" : progKey + ":");

      const allLocalBtn = el("button", localBar, "d3n-pill" + (!activeLocalTopic ? " is-active" : ""));
      allLocalBtn.type = "button";
      allLocalBtn.onmousedown = e => e.preventDefault();
      allLocalBtn.style.setProperty("--pill-color", groupColor);
      el("span", allLocalBtn, "", "Все темы");
      el("span", allLocalBtn, "d3n-pill-num", progNotes.length);
      allLocalBtn.addEventListener("click", () => {
        delete state.localTopics[progKey];
        persist();
        renderResults();
      });

      const sortedLocals = [...localTopicCounts.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
      for (const [tName, cnt] of sortedLocals) {
        const isLocAct = activeLocalTopic === tName;
        const lPill = el("button", localBar, "d3n-pill" + (isLocAct ? " is-active" : ""));
        lPill.type = "button";
        lPill.onmousedown = e => e.preventDefault();
        lPill.style.setProperty("--pill-color", groupColor);
        el("span", lPill, "", tName);
        el("span", lPill, "d3n-pill-num", cnt);
        lPill.addEventListener("click", () => {
          if (isLocAct) delete state.localTopics[progKey];
          else state.localTopics[progKey] = tName;
          persist();
          renderResults();
        });
      }

      if (untaggedCount > 0) {
        const isUntaggedAct = activeLocalTopic === "__untagged__";
        const uPill = el("button", localBar, "d3n-pill" + (isUntaggedAct ? " is-active" : ""));
        uPill.type = "button";
        uPill.onmousedown = e => e.preventDefault();
        uPill.style.setProperty("--pill-color", "#d85b57");
        el("span", uPill, "", "⚠ Без темы");
        el("span", uPill, "d3n-pill-num", untaggedCount);
        uPill.addEventListener("click", () => {
          if (isUntaggedAct) delete state.localTopics[progKey];
          else state.localTopics[progKey] = "__untagged__";
          persist();
          renderResults();
        });
      }
    }

    const visibleProgNotes = progNotes.filter(n => {
      if (!activeLocalTopic) return true;
      if (activeLocalTopic === "__untagged__") return n.topics.length === 0;
      return n.topics.includes(activeLocalTopic);
    });

    if (state.groupByTopic) {
      const topicGrid = el("div", body, "d3n-topic-grid");

      const byTopic = new Map();
      const noTopicList = [];

      for (const n of visibleProgNotes) {
        if (!n.topics.length) {
          noTopicList.push(n);
          continue;
        }
        for (const t of n.topics) {
          if (state.topic && t !== state.topic) continue;
          if (activeLocalTopic && activeLocalTopic !== "__untagged__" && t !== activeLocalTopic) continue;
          if (!byTopic.has(t)) byTopic.set(t, []);
          byTopic.get(t).push(n);
        }
      }

      const topicKeys = [...byTopic.keys()].sort((a, b) => byTopic.get(b).length - byTopic.get(a).length || compare(a, b));

      for (const tKey of topicKeys) {
        const tNotes = byTopic.get(tKey);
        const box = el("div", topicGrid, "d3n-topic-box");
        const head = el("div", box, "d3n-topic-head");
        el("span", head, "d3n-topic-title", tKey);

        const meta = el("div", head, "d3n-topic-meta");
        el("span", meta, "d3n-topic-cnt", tNotes.length);
        const addInTopicBtn = button(meta, "+", e => {
          e.stopPropagation();
          openCreate(progKey === "__none__" ? "" : progKey, tKey);
        }, "d3n-topic-add");
        addInTopicBtn.title = "Добавить заметку в «" + tKey + "»";

        renderTopicTree(box, tNotes, tKey, progKey);
      }

      if (noTopicList.length > 0 && !state.topic && (!activeLocalTopic || activeLocalTopic === "__untagged__")) {
        const box = el("div", topicGrid, "d3n-topic-box is-untagged-box");
        const head = el("div", box, "d3n-topic-head");
        el("span", head, "d3n-topic-title", "⚠ Без темы");
        el("span", head, "d3n-topic-cnt", noTopicList.length);
        const noteList = el("div", box, "d3n-note-list");
        for (const n of noTopicList) renderCompactNoteRow(noteList, n, "__untagged__", progKey);
      }
    } else {
      const flatBox = el("div", body, "d3n-topic-box");
      const flatList = el("div", flatBox, "d3n-note-list");
      for (const n of visibleProgNotes) renderCompactNoteRow(flatList, n, "__flat__", progKey);
    }

    let userToggle = false;
    summary.addEventListener("click", () => { userToggle = true; });
    details.addEventListener("toggle", () => {
      if (userToggle && !query && !state.program && !state.topic) {
        state.open[progKey] = details.open;
        persist();
      }
      userToggle = false;
    });
  });
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  persist();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderResults();
  }, 80);
});

async function ensureFolder(folder) {
  let current = "";
  for (const part of normalizePath(folder).split("/")) {
    current = current ? current + "/" + part : part;
    const found = app.vault.getAbstractFileByPath(current);
    if (found) {
      if (!Array.isArray(found.children)) throw new Error("Путь занят файлом: " + current);
      continue;
    }
    try {
      await app.vault.createFolder(current);
    } catch (error) {
      if (!Array.isArray(app.vault.getAbstractFileByPath(current)?.children)) throw error;
    }
  }
}

function validateTitle(title) {
  if (!title) return "Укажи название заметки.";
  if (/[\u0000-\u001f]/.test(title)) return "Название содержит недопустимые символы.";
  if (/[\\/:*?"<>|]/.test(title)) return "Название не должно содержать символы \\ / : * ? \" < > |";
  if (/^\.|\.$/.test(title)) return "Название не должно начинаться или заканчиваться точкой.";
  return "";
}

function noteContent(draft) {
  const programs = list(draft.programs), topics = list(draft.topics);
  return [
    "---",
    "направление: 3D",
    "тип: Заметка",
    "программы:",
    ...programs.map(s => "  - " + JSON.stringify(s)),
    ...(topics.length ? ["темы:", ...topics.map(s => "  - " + JSON.stringify(s))] : ["темы: []"]),
    "источник: " + JSON.stringify(String(draft.source || "").trim()),
    "---",
    "",
    "# " + draft.title.trim(),
    "",
    "## Суть приёма",
    "",
    "## Горячие клавиши и шаги",
    "",
    "## Где применяется",
    ""
  ].join("\n");
}

function openCreate(program = "", topic = "") {
  if (busy) {
    notify("Идёт сохранение, подожди секунду.");
    return;
  }
  state.createOpen = true;
  if (program) state.draft.programs = [program];
  else if (!state.draft.programs.length) state.draft.programs = ["Blender"];
  if (topic && topic !== "__untagged__") state.draft.topics = [topic];
  persist();
  renderCreate();
  renderResults();
  createHost.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderCreate() {
  createHost.replaceChildren();
  if (!state.createOpen) return;

  const draft = state.draft;
  const form = el("form", createHost, "d3n-panel");

  const topTitle = el("div", form, "d3n-panel-title");
  el("span", topTitle, "", "Новая 3D-заметка");

  const title = field(form, "Название заметки", "Например: Процедурный мох в Geometry Nodes");
  title.value = draft.title;
  title.addEventListener("input", () => {
    draft.title = title.value;
    persist();
  });

  const progPicker = chipSelector(
    form,
    "Программы",
    draft.programs,
    [...PRESET_PROGRAMS, ...knownNotes.flatMap(n => n.programs)],
    vals => { draft.programs = vals; persist(); },
    true
  );

  const topicPicker = chipSelector(
    form,
    "Темы",
    draft.topics,
    getAvailableTopics(),
    vals => { draft.topics = vals; persist(); },
    false
  );

  const source = field(form, "Источник (ссылка или [[заметка]])", "https://... или [[Название]]");
  source.value = draft.source;
  source.addEventListener("input", () => {
    draft.source = source.value;
    persist();
  });

  const message = el("div", form, "d3n-message");
  const actions = el("div", form, "d3n-actions");

  const createBtn = el("button", actions, "d3n-button d3n-primary", "Создать и открыть");
  createBtn.type = "submit";

  const stayBtn = button(actions, "Создать и остаться", async () => {
    await handleCreateSubmit(false);
  });

  button(actions, "Отмена", () => {
    if (busy) return;
    state.createOpen = false;
    persist();
    renderCreate();
    renderResults();
  });

  function freeze(val) {
    createBtn.disabled = val;
    stayBtn.disabled = val;
    for (const node of form.querySelectorAll("input, button")) node.disabled = val;
  }

  async function handleCreateSubmit(openAfterCreate = true) {
    if (busy) return;
    draft.programs = progPicker.getValues();
    draft.topics = topicPicker.getValues();
    draft.title = title.value.trim();
    draft.source = source.value.trim();
    persist();

    const error = validateTitle(draft.title);
    if (error) {
      message.textContent = error;
      title.focus();
      return;
    }
    if (!draft.programs.length) {
      message.textContent = "Выбери хотя бы одну программу.";
      return;
    }

    const path = normalizePath(TARGET_FOLDER + "/" + draft.title + ".md");
    message.replaceChildren();

    if (app.vault.getAbstractFileByPath(path)) {
      el("span", message, "", "Файл уже существует: ");
      const a = el("a", message, "", path);
      openLink(a, path);
      return;
    }

    busy = true;
    freeze(true);
    let created = null;

    try {
      await ensureFolder(TARGET_FOLDER);
      created = await app.vault.create(path, noteContent(draft));
    } catch (err) {
      message.textContent = err?.message || String(err);
    } finally {
      busy = false;
      freeze(false);
    }

    if (!created) return;

    setPending(created.path, {
      направление: AREA,
      тип: "Заметка",
      программы: [...draft.programs],
      темы: [...draft.topics],
      источник: draft.source
    });

    state.draft = { ...EMPTY_DRAFT(), programs: [...draft.programs], topics: [...draft.topics] };
    state.createOpen = !openAfterCreate;
    persist();

    renderCreate();
    refreshData();
    renderResults();
    notify("Создано: " + created.basename);

    if (openAfterCreate) {
      try {
        await app.workspace.openLinkText(created.path, CURRENT, false);
      } catch (_) {}
    }
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await handleCreateSubmit(true);
  });

  setTimeout(() => {
    if (title.isConnected) title.focus();
  }, 30);
}

function openEdit(note, rowContextKey) {
  if (busy) return;
  state.editKey = rowContextKey;
  state.editPath = note.path;
  state.editDraft = {
    programs: [...note.programs],
    topics: [...note.rawTopics],
    source: note.source,
    originalPrograms: [...note.programs],
    originalTopics: [...note.rawTopics],
    originalSource: note.source
  };
  persist();
  renderResults();
}

refreshData();
renderCreate();
renderResults();
