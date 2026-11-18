// 3D — компактный табличный обзор базы знаний (v5.0: интеграция с 3D Spatial Hub и my-3d-node-inspector)
const normalizePath = p => String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/(?![\s\S])/g, "");
const AREA = "3D";
const CURRENT = dv.current()?.file?.path || dv.currentFilePath || "";

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

const STORAGE = "3d-hub-compact-v5:" + app.vault.getName() + ":" + CURRENT;
let savedOpen = {};
try { savedOpen = JSON.parse(sessionStorage.getItem(STORAGE) || "{}"); } catch {}
const openState = savedOpen && typeof savedOpen === "object" ? savedOpen : {};
const persist = () => { try { sessionStorage.setItem(STORAGE, JSON.stringify(openState)); } catch {} };

const notify = text => { try { new Notice(text); } catch { console.log(text); } };
const list = value => {
  const raw = value == null ? [] : Array.isArray(value) ? value : [value];
  return [...new Set(raw.flat().map(v => typeof v === "string" ? v.trim() : "").filter(Boolean))];
};
const compare = (a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });

function sourceText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.path === "string") return "[[" + value.path + "]]";
  if (Array.isArray(value)) return value.map(sourceText).filter(Boolean).join("; ");
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
    const a = el("a", wrap, "d3n-source-pill", "📄 " + (alias.join("|") || path));
    openLink(a, path);
    a.title = "Источник: " + text;
    return;
  }
  let url;
  try { url = new URL(text); } catch {}
  if (url && ["https:", "http:"].includes(url.protocol)) {
    const host = url.hostname.replace(/^www\./, "");
    const a = el("a", wrap, "d3n-source-pill external-link", "↗ " + host);
    a.href = url.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = text;
  } else {
    const span = el("span", wrap, "d3n-source-text", text);
    span.title = "Источник: " + text;
  }
}

const TEMPLATE_FOLDERS = ["Шаблоны", "Templates"];
const templateFiles = new Set();
try {
  const configured = app.internalPlugins?.plugins?.templates?.instance?.options?.folder;
  if (configured) TEMPLATE_FOLDERS.push(configured);
} catch {}
try {
  const scan = choices => {
    if (!Array.isArray(choices)) return;
    for (const choice of choices) {
      if (choice?.templatePath) templateFiles.add(normalizePath(choice.templatePath));
      scan(choice?.choices);
    }
  };
  scan(app.plugins?.plugins?.quickadd?.settings?.choices);
} catch {}

function isTemplate(file, fm) {
  const path = file.path.toLowerCase();
  const folders = TEMPLATE_FOLDERS.map(s => normalizePath(s).toLowerCase()).filter(Boolean);
  return templateFiles.has(file.path) ||
    folders.some(folder => path.startsWith(folder + "/") || path.includes("/" + folder + "/")) ||
    fm.шаблон === true ||
    String(fm.тип || "").toLowerCase() === "шаблон" ||
    list(fm.tags).some(tag => ["template", "шаблон"].includes(tag.replace(/^#/, "").toLowerCase()));
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
function noteHasImages(cache) {
  const embeds = cache?.embeds || [];
  return embeds.some(em => {
    const rawLink = String(em.link || "").split("#")[0].split("|")[0].trim();
    const ext = rawLink.split(".").pop()?.toLowerCase() || "";
    return IMAGE_EXTENSIONS.has(ext);
  });
}

function openSpatialHub() {
  const plugin = app.plugins?.plugins?.["my-3d-hub"];
  if (plugin && typeof plugin.activateView === "function") {
    plugin.activateView();
    return;
  }
  if (app.commands?.commands?.["my-3d-hub:open-3d-spatial-hub"]) {
    app.commands.executeCommandById("my-3d-hub:open-3d-spatial-hub");
    return;
  }
  notify("Включи плагин 3D Spatial Hub (my-3d-hub) в настройках Obsidian.");
}

function openNodeInspector(noteFile) {
  const plugin = app.plugins?.plugins?.["my-3d-hub"];
  if (plugin && typeof plugin.openInspector === "function") {
    plugin.openInspector({ file: noteFile });
    return;
  }
  notify("Включи плагин 3D Spatial Hub (my-3d-hub) в настройках Obsidian.");
}

function readNotes() {
  const result = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path === CURRENT) continue;
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    if (!list(fm.направление).includes(AREA) || isTemplate(file, fm)) continue;
    const rawTopics = list(fm.темы);
    const topicPaths = [...new Set(rawTopics.map(mapTopic).filter(Boolean))];
    const displayTopics = [...new Set(topicPaths.map(value => topicParts(value)[0]))];
    result.push({
      file,
      path: file.path,
      title: file.basename,
      programs: list(fm.программы),
      topics: displayTopics,
      topicPaths,
      hasImages: noteHasImages(cache),
      source: sourceText(fm.источник),
      pinned: fm.закреплено === true,
      mtime: file.stat.mtime
    });
  }
  return result;
}

const root = el("div", dv.container, "d3n");
const style = el("style", root);
style.textContent = [
  ".dashboard-home .d3n { --d3n-accent: #9c83e8; display: flex; flex-direction: column; gap: 11px; margin: 6px 0 28px; color: var(--text-normal); font-size: var(--font-text-size); }",
  ".dashboard-home .d3n, .dashboard-home .d3n * { box-sizing: border-box; }",
  ".dashboard-home .d3n .d3n-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 11px 14px; border: 1px solid var(--background-modifier-border); border-top: 3px solid #9c83e8; border-radius: 11px; background: var(--background-secondary); }",
  ".dashboard-home .d3n .d3n-header-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }",
  ".dashboard-home .d3n .d3n-title { font-size: 1.05em; font-weight: 750; letter-spacing: -0.01em; }",
  ".dashboard-home .d3n .d3n-muted { color: var(--text-muted); font-size: 0.78em; }",
  ".dashboard-home .d3n .d3n-button { height: auto; min-height: 29px; padding: 5px 13px; border-radius: 8px; border: 1px solid var(--background-modifier-border); box-shadow: none; background: var(--background-primary); color: var(--text-normal); font-size: 0.8em; font-weight: 600; line-height: 1.2; cursor: pointer; transition: background-color 0.14s ease, transform 0.1s ease; }",
  ".dashboard-home .d3n .d3n-button.d3n-primary { background: #9c83e8; color: #141619; font-weight: 700; border-color: transparent; }",
  ".dashboard-home .d3n .d3n-button.d3n-primary:hover { background: #ad97f0; }",
  ".dashboard-home .d3n .d3n-groups { display: flex; flex-direction: column; gap: 11px; }",
  ".dashboard-home .d3n details.d3n-group { border: 1px solid var(--background-modifier-border); border-left: 3px solid var(--group-color, #9c83e8); border-radius: 11px; background: var(--background-secondary); overflow: hidden; }",
  ".dashboard-home .d3n .d3n-group > summary { display: flex; align-items: center; gap: 9px; list-style: none; cursor: pointer; padding: 9px 13px; user-select: none; }",
  ".dashboard-home .d3n .d3n-group > summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .d3n .d3n-group > summary::before { content: '›'; display: inline-block; color: var(--text-muted); font-size: 1.15em; transition: transform 0.14s ease; }",
  ".dashboard-home .d3n .d3n-group[open] > summary::before { transform: rotate(90deg); }",
  ".dashboard-home .d3n .d3n-group > summary:hover { background: var(--background-modifier-hover); }",
  ".dashboard-home .d3n .d3n-group-name { font-weight: 750; font-size: 0.94em; flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }",
  ".dashboard-home .d3n .d3n-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--group-color, #9c83e8); flex-shrink: 0; }",
  ".dashboard-home .d3n .d3n-count { font-size: 0.73em; color: var(--text-muted); font-variant-numeric: tabular-nums; background: var(--background-primary); padding: 1px 8px; border: 1px solid var(--background-modifier-border); border-radius: 20px; }",
  ".dashboard-home .d3n .d3n-group-body { display: flex; flex-direction: column; gap: 9px; padding: 4px 12px 12px; }",
  ".dashboard-home .d3n .d3n-topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 245px), 1fr)); gap: 9px; align-items: start; }",
  ".dashboard-home .d3n .d3n-topic-box { border: 1px solid var(--background-modifier-border); border-radius: 9px; background: var(--background-primary); display: flex; flex-direction: column; overflow: hidden; }",
  ".dashboard-home .d3n .d3n-topic-box.is-untagged-box { border-color: rgba(216, 91, 87, 0.45); }",
  ".dashboard-home .d3n .d3n-topic-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 10px; background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .d3n .d3n-topic-title { font-size: 0.78em; font-weight: 700; color: var(--group-color, #9c83e8); display: flex; align-items: center; gap: 6px; }",
  ".dashboard-home .d3n .d3n-topic-box.is-untagged-box .d3n-topic-title { color: #d85b57; }",
  ".dashboard-home .d3n .d3n-topic-cnt { font-size: 0.7em; color: var(--text-faint); font-variant-numeric: tabular-nums; }",
  ".dashboard-home .d3n .d3n-note-list { display: flex; flex-direction: column; }",
  ".dashboard-home .d3n .d3n-note-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 9px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); cursor: pointer; transition: background-color 0.1s ease; }",
  ".dashboard-home .d3n .d3n-note-row:last-child { border-bottom: none; }",
  ".dashboard-home .d3n .d3n-note-row:hover { background: var(--background-modifier-hover); }",
  ".dashboard-home .d3n .d3n-note-main { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }",
  ".dashboard-home .d3n a.d3n-note-link { color: var(--text-normal); font-size: 0.82em; font-weight: 550; line-height: 1.28; text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }",
  ".dashboard-home .d3n .d3n-note-row:hover a.d3n-note-link { color: var(--group-color, var(--text-accent)); }",
  ".dashboard-home .d3n .d3n-note-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }",
  ".dashboard-home .d3n .d3n-mini-tag { font-size: 0.66em; padding: 1px 5px; border-radius: 4px; color: var(--text-muted); background: var(--background-secondary); border: 1px solid var(--background-modifier-border); white-space: nowrap; }",
  ".dashboard-home .d3n .d3n-inspect-btn { color: #9c83e8; font-size: 0.84em; padding: 0 5px; min-height: 20px; height: 20px; background: transparent; border-color: transparent; opacity: 0.72; }",
  ".dashboard-home .d3n .d3n-inspect-btn:hover { opacity: 1; transform: scale(1.2); color: #bcaaf0; }",
  ".dashboard-home .d3n .d3n-source { display: inline-flex; align-items: center; font-size: 0.68em; }",
  ".dashboard-home .d3n a.d3n-source-pill { display: inline-flex; align-items: center; padding: 0 5px; height: 18px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); text-decoration: none; max-width: 105px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
  ".dashboard-home .d3n .d3n-source-text { color: var(--text-faint); max-width: 85px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dashboard-home .d3n .d3n-tree-folder { margin: 4px 6px; border: 1px solid var(--background-modifier-border); border-radius: 7px; background: var(--background-secondary); min-width: 0; overflow: hidden; }",
  ".dashboard-home .d3n .d3n-tree-folder > summary.d3n-tree-summary { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 27px; padding: 4px 8px; font-size: 0.78em; cursor: pointer; list-style: none; user-select: none; }",
  ".dashboard-home .d3n .d3n-tree-summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .d3n .d3n-tree-sum-left { display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }",
  ".dashboard-home .d3n .d3n-tree-sum-left::before { content: '▸'; display: inline-block; color: var(--text-muted); font-size: 1.05em; transition: transform 0.14s ease; }",
  ".dashboard-home .d3n .d3n-tree-folder[open] > summary .d3n-tree-sum-left::before { transform: rotate(90deg); }",
  ".dashboard-home .d3n .d3n-tree-name { font-weight: 650; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".dashboard-home .d3n .d3n-tree-content { min-width: 0; padding: 2px 4px 6px 6px; }",
".dashboard-home .d3n .d3n-empty { padding: 16px 12px; border: 1px dashed var(--background-modifier-border); border-radius: 9px; color: var(--text-muted); font-size: 0.82em; text-align: center; }",
  ".dashboard-home .d3n .d3n-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }",
  ".d3n-ref-overlay { position: fixed; inset: 0; z-index: 9999; background-color: var(--background-primary); background-image: radial-gradient(rgba(160, 170, 195, 0.14) 1px, transparent 1px); background-size: 24px 24px; overflow: hidden; user-select: none; -webkit-user-select: none; }",
  ".d3n-ref-top { position: absolute; top: 14px; left: 16px; z-index: 20; display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--background-modifier-border); background: color-mix(in srgb, var(--background-secondary) 84%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.32); }",
  ".d3n-ref-pill-btn { height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--text-normal); font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: none; display: inline-flex; align-items: center; gap: 5px; }",
  ".d3n-ref-pill-btn:hover { background: var(--background-modifier-hover); }",
  ".d3n-ref-pill-btn.is-primary { background: #9c83e8; color: #141619; font-weight: 700; }",
  ".d3n-ref-pill-btn.is-primary:hover { background: #ad97f0; }",
  ".d3n-ref-pill-btn.is-danger:hover { color: #e06c75; background: rgba(224, 108, 117, 0.16); }",
  ".d3n-ref-pill-btn:disabled { opacity: 0.32; cursor: default; pointer-events: none; }",
  ".d3n-ref-title { font-size: 12px; font-weight: 700; color: var(--text-muted); padding: 0 4px; }",
  ".d3n-ref-viewport { position: absolute; inset: 0; overflow: hidden; cursor: grab; }",
  ".d3n-ref-viewport.is-panning { cursor: grabbing; }",
  ".d3n-ref-viewport.is-drag-over { outline: 2px dashed #9c83e8; outline-offset: -6px; background: rgba(156, 131, 232, 0.06); }",
  ".d3n-ref-layer { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }",
  ".d3n-ref-item { position: absolute; border-radius: 8px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45); cursor: move; }",
  ".d3n-ref-item img { display: block; width: 100%; height: 100%; object-fit: fill; border-radius: 8px; pointer-events: none; -webkit-user-drag: none; }",
  ".d3n-ref-item.is-selected { outline: 2px solid #9c83e8; outline-offset: 2px; }",
  ".d3n-ref-handle { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #ffffff; border: 2px solid #9c83e8; display: none; z-index: 5; }",
  ".d3n-ref-item.is-selected .d3n-ref-handle { display: block; }",
  ".d3n-ref-handle[data-h='nw'] { top: -5px; left: -5px; cursor: nwse-resize; }",
  ".d3n-ref-handle[data-h='ne'] { top: -5px; right: -5px; cursor: nesw-resize; }",
  ".d3n-ref-handle[data-h='sw'] { bottom: -5px; left: -5px; cursor: nesw-resize; }",
  ".d3n-ref-handle[data-h='se'] { bottom: -5px; right: -5px; cursor: nwse-resize; }",
  ".d3n-ref-guide { position: absolute; pointer-events: none; z-index: 15; background: rgba(156, 131, 232, 0.78); }",
  ".d3n-ref-dock { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 20; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--background-modifier-border); background: color-mix(in srgb, var(--background-secondary) 84%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.34); }",
  ".d3n-ref-empty { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 12px 20px; border-radius: 999px; border: 1px solid var(--background-modifier-border); background: color-mix(in srgb, var(--background-secondary) 86%, transparent); color: var(--text-muted); font-size: 13px; pointer-events: none; }"
].join("\n");

// --- ВЕРХНЯЯ ШАПКА С КНОПКАМИ ПЕРЕХОДА ---
const header = el("div", root, "d3n-header");
const headerLeft = el("div", header, "d3n-header-left");
el("div", headerLeft, "d3n-title", "🧊 3D и графика");
const totalLabel = el("span", headerLeft, "d3n-muted");

const headerActions = el("div", header, "d3n-header-actions");
button(headerActions, "🫧 Открыть 3D Spatial Hub", openSpatialHub, "d3n-primary").title =
  "Перейти на интерактивный холст плавающих пузырей (my-3d-hub)";
button(headerActions, "🖼 Референсы", openReferenceBoard).title =
  "Открыть бесконечный холст референсов (Ctrl+V, перетаскивание, выравнивание)";

function getCurrentDashboardFile() {
  const f = app.vault.getAbstractFileByPath(CURRENT);
  return f && typeof f.extension === "string" ? f : null;
}

function loadRefItems() {
  const file = getCurrentDashboardFile();
  if (!file) return [];
  const raw = app.metadataCache.getFileCache(file)?.frontmatter?.["референсы_холст"];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(it => it && typeof it.path === "string")
    .map((it, idx) => ({
      id: typeof it.id === "string" ? it.id : "ref_" + idx + "_" + Date.now(),
      path: it.path,
      x: Number.isFinite(Number(it.x)) ? Math.round(Number(it.x)) : 0,
      y: Number.isFinite(Number(it.y)) ? Math.round(Number(it.y)) : 0,
      w: Math.max(40, Number.isFinite(Number(it.w)) ? Math.round(Number(it.w)) : 320),
      h: Math.max(40, Number.isFinite(Number(it.h)) ? Math.round(Number(it.h)) : 240)
    }));
}

let refSaveTimer = null;
function saveRefItems(items) {
  const file = getCurrentDashboardFile();
  if (!file) return;
  if (refSaveTimer) window.clearTimeout(refSaveTimer);
  refSaveTimer = window.setTimeout(() => {
    refSaveTimer = null;
    const clean = items.map(it => ({
      id: it.id,
      path: it.path,
      x: Math.round(it.x),
      y: Math.round(it.y),
      w: Math.round(it.w),
      h: Math.round(it.h)
    }));
    app.fileManager.processFrontMatter(file, fm => {
      if (clean.length === 0) delete fm["референсы_холст"];
      else fm["референсы_холст"] = clean;
    }).catch(err => notify("Ошибка сохранения референсов: " + (err?.message || err)));
  }, 300);
}

function openReferenceBoard() {
  document.querySelectorAll(".d3n-ref-overlay").forEach(n => n.remove());

  const overlay = el("div", document.body, "d3n-ref-overlay");
  const top = el("div", overlay, "d3n-ref-top");
  const viewport = el("div", overlay, "d3n-ref-viewport");
  const layer = el("div", viewport, "d3n-ref-layer");
  const guidesLayer = el("div", layer);
  const emptyHint = el("div", overlay, "d3n-ref-empty", "Вставь референс через Ctrl+V, перетащи файл или нажми «+ Картинка»");
  const dock = el("div", overlay, "d3n-ref-dock");

  const items = loadRefItems();
  let selectedId = null;
  let scale = 1;
  let panX = Math.round(window.innerWidth / 2);
  let panY = Math.round(window.innerHeight / 2);

  const applyTransform = () => {
    layer.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  };

  const fitToAll = () => {
    const rect = viewport.getBoundingClientRect();
    if (items.length === 0) {
      scale = 1;
      panX = Math.round(rect.width / 2);
      panY = Math.round(rect.height / 2);
      applyTransform();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w);
      maxY = Math.max(maxY, it.y + it.h);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const pad = 80;
    scale = Math.max(0.1, Math.min(1.5, (rect.width - pad * 2) / w, (rect.height - pad * 2) / h));
    panX = Math.round((rect.width - w * scale) / 2 - minX * scale);
    panY = Math.round((rect.height - h * scale) / 2 - minY * scale);
    applyTransform();
  };

const pickerPop = el("div", overlay);
  pickerPop.style.cssText = "position:absolute;bottom:68px;left:50%;transform:translateX(-50%);z-index:25;width:min(320px,calc(100vw - 32px));padding:10px;border-radius:14px;border:1px solid var(--background-modifier-border);background:color-mix(in srgb,var(--background-secondary) 92%,transparent);backdrop-filter:blur(16px);box-shadow:0 12px 32px rgba(0,0,0,0.45);display:none;flex-direction:column;gap:8px;";

  const closeOverlay = () => {
    window.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("paste", onPaste, true);
    overlay.remove();
  };

  const backBtn = el("button", top, "d3n-ref-pill-btn", "← Назад");
  backBtn.addEventListener("click", closeOverlay);
  el("span", top, "d3n-ref-title", "🖼 Референсы");
  const fitBtn = el("button", top, "d3n-ref-pill-btn", "⌖ Вписать");
  fitBtn.addEventListener("click", fitToAll);

  const addBtn = el("button", dock, "d3n-ref-pill-btn is-primary", "+ Картинка");
  const delBtn = el("button", dock, "d3n-ref-pill-btn is-danger", "🗑 Удалить");
  delBtn.disabled = true;

  const updateDockState = () => {
    delBtn.disabled = !selectedId;
  };

  const clearGuides = () => {
    guidesLayer.replaceChildren();
  };

  const showGuide = (isVert, pos, from, to) => {
    const g = el("div", guidesLayer, "d3n-ref-guide");
    const thick = Math.max(1, 1.2 / scale);
    if (isVert) {
      g.style.left = pos + "px";
      g.style.top = from + "px";
      g.style.width = thick + "px";
      g.style.height = Math.max(1, to - from) + "px";
    } else {
      g.style.left = from + "px";
      g.style.top = pos + "px";
      g.style.width = Math.max(1, to - from) + "px";
      g.style.height = thick + "px";
    }
  };

  const renderItems = () => {
    layer.querySelectorAll(".d3n-ref-item").forEach(n => n.remove());
    emptyHint.style.display = items.length === 0 ? "block" : "none";
    for (const it of items) {
      const box = el("div", layer, "d3n-ref-item" + (it.id === selectedId ? " is-selected" : ""));
      box.dataset.id = it.id;
      box.style.left = it.x + "px";
      box.style.top = it.y + "px";
      box.style.width = it.w + "px";
      box.style.height = it.h + "px";

      const img = el("img", box);
      img.src = app.vault.adapter.getResourcePath(it.path);

      for (const h of ["nw", "ne", "sw", "se"]) {
        const handle = el("div", box, "d3n-ref-handle");
        handle.dataset.h = h;
      }
    }
    updateDockState();
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const idx = items.findIndex(it => it.id === selectedId);
    if (idx !== -1) {
      items.splice(idx, 1);
      selectedId = null;
      renderItems();
      saveRefItems(items);
    }
  };
  delBtn.addEventListener("click", deleteSelected);

  const screenToWorld = (cx, cy) => {
    const rect = viewport.getBoundingClientRect();
    return { x: (cx - rect.left - panX) / scale, y: (cy - rect.top - panY) / scale };
  };

  const addImageByPath = async (vaultPath, worldPt = null) => {
    const resUrl = app.vault.adapter.getResourcePath(vaultPath);
    const probe = new Image();
    await new Promise(resolve => {
      probe.onload = resolve;
      probe.onerror = resolve;
      probe.src = resUrl;
    });
    const nw = probe.naturalWidth || 480;
    const nh = probe.naturalHeight || 320;
    const w = nw > 460 ? 460 : nw;
    const h = Math.max(40, Math.round(w * (nh / Math.max(1, nw))));

    const rect = viewport.getBoundingClientRect();
    const center = worldPt || screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const newItem = {
      id: "ref_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      path: vaultPath,
      x: Math.round(center.x - w / 2),
      y: Math.round(center.y - h / 2),
      w,
      h
    };
    items.push(newItem);
    selectedId = newItem.id;
    renderItems();
    saveRefItems(items);
  };

  const saveBinaryImage = async file => {
    const dashFile = getCurrentDashboardFile();
    const folder = dashFile?.parent?.path ? dashFile.parent.path + "/" : "";
    const ext = (file.name?.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const targetPath = normalizePath(folder + "ref-" + Date.now() + "." + ext);
    await app.vault.createBinary(targetPath, await file.arrayBuffer());
    return targetPath;
  };

  // Поповер выбора картинки из хранилища
  addBtn.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = pickerPop.style.display === "flex";
    if (isOpen) {
      pickerPop.style.display = "none";
      return;
    }
    pickerPop.replaceChildren();
    const search = el("input", pickerPop);
    search.type = "text";
    search.placeholder = "Поиск картинки (или Ctrl+V)…";
    search.style.cssText = "width:100%;height:30px;padding:4px 8px;border-radius:8px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-size:12px;";
    const listWrap = el("div", pickerPop);
    listWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;max-height:210px;overflow-y:auto;scrollbar-width:none;";

    const allImgs = app.vault.getFiles().filter(f => IMAGE_EXTENSIONS.has(f.extension.toLowerCase()));
    const drawList = q => {
      listWrap.replaceChildren();
      const needle = q.trim().toLowerCase();
      const filtered = (needle ? allImgs.filter(f => f.path.toLowerCase().includes(needle)) : allImgs).slice(0, 30);
      for (const f of filtered) {
        const row = el("button", listWrap);
        row.type = "button";
        row.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px;border-radius:8px;border:none;background:rgba(255,255,255,0.03);color:var(--text-normal);cursor:pointer;text-align:left;font-size:12px;";
        const th = el("img", row);
        th.src = app.vault.adapter.getResourcePath(f.path);
        th.style.cssText = "width:30px;height:24px;object-fit:cover;border-radius:4px;flex-shrink:0;";
        const lbl = el("span", row, "", f.basename);
        lbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        row.addEventListener("click", () => {
          pickerPop.style.display = "none";
          void addImageByPath(f.path);
        });
      }
    };
    search.addEventListener("input", () => drawList(search.value));
    drawList("");
    pickerPop.style.display = "flex";
    window.setTimeout(() => search.focus(), 10);
  });

  // Взаимодействие с холстом: панорама, перетаскивание + элайнмент, угловой ресайз
  let mode = "none";
  let panStart = { x: 0, y: 0, px: 0, py: 0 };
  let dragStart = { wx: 0, wy: 0, x: 0, y: 0, w: 0, h: 0, handle: "" };

  viewport.addEventListener("pointerdown", e => {
    pickerPop.style.display = "none";
    const handleEl = e.target.closest(".d3n-ref-handle");
    const itemEl = e.target.closest(".d3n-ref-item");

    if (handleEl && itemEl) {
      e.preventDefault();
      viewport.setPointerCapture(e.pointerId);
      const it = items.find(x => x.id === itemEl.dataset.id);
      if (!it) return;
      selectedId = it.id;
      mode = "resize";
      const w = screenToWorld(e.clientX, e.clientY);
      dragStart = { wx: w.x, wy: w.y, x: it.x, y: it.y, w: it.w, h: it.h, handle: handleEl.dataset.h || "se" };
      return;
    }

    if (itemEl && e.button === 0) {
      e.preventDefault();
      viewport.setPointerCapture(e.pointerId);
      const it = items.find(x => x.id === itemEl.dataset.id);
      if (!it) return;
      selectedId = it.id;
      // Поднимаем выбранную картинку наверх
      const idx = items.indexOf(it);
      if (idx !== items.length - 1) {
        items.splice(idx, 1);
        items.push(it);
      }
      renderItems();
      mode = "move";
      const w = screenToWorld(e.clientX, e.clientY);
      dragStart = { wx: w.x, wy: w.y, x: it.x, y: it.y, w: it.w, h: it.h, handle: "" };
      return;
    }

    selectedId = null;
    renderItems();
    if (e.button !== 0 && e.button !== 1) return;
    viewport.setPointerCapture(e.pointerId);
    mode = "pan";
    viewport.classList.add("is-panning");
    panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  });

  viewport.addEventListener("pointermove", e => {
    if (mode === "pan") {
      panX = panStart.px + (e.clientX - panStart.x);
      panY = panStart.py + (e.clientY - panStart.y);
      applyTransform();
      return;
    }

    const it = items.find(x => x.id === selectedId);
    if (!it) return;
    const box = layer.querySelector(`.d3n-ref-item[data-id="${it.id}"]`);
    if (!box) return;
    const w = screenToWorld(e.clientX, e.clientY);
    const dx = w.x - dragStart.wx;
    const dy = w.y - dragStart.wy;

    if (mode === "move") {
      let nx = dragStart.x + dx;
      let ny = dragStart.y + dy;
      clearGuides();

      const snapTol = 7 / Math.max(0.15, scale);
      let bestDx = snapTol, bestDy = snapTol;
      let gx = null, gy = null;
      const myXs = [nx, nx + it.w / 2, nx + it.w];
      const myYs = [ny, ny + it.h / 2, ny + it.h];

      for (const other of items) {
        if (other.id === it.id) continue;
        for (const mx of myXs) {
          for (const tx of [other.x, other.x + other.w / 2, other.x + other.w]) {
            const d = tx - mx;
            if (Math.abs(d) < Math.abs(bestDx)) {
              bestDx = d;
              gx = { pos: tx, from: Math.min(ny, other.y) - 16, to: Math.max(ny + it.h, other.y + other.h) + 16 };
            }
          }
        }
        for (const my of myYs) {
          for (const ty of [other.y, other.y + other.h / 2, other.y + other.h]) {
            const d = ty - my;
            if (Math.abs(d) < Math.abs(bestDy)) {
              bestDy = d;
              gy = { pos: ty, from: Math.min(nx, other.x) - 16, to: Math.max(nx + it.w, other.x + other.w) + 16 };
            }
          }
        }
      }
      if (gx) { nx += bestDx; showGuide(true, gx.pos, gx.from, gx.to); }
      if (gy) { ny += bestDy; showGuide(false, gy.pos, gy.from, gy.to); }

      it.x = Math.round(nx);
      it.y = Math.round(ny);
      box.style.left = it.x + "px";
      box.style.top = it.y + "px";
      return;
    }

    if (mode === "resize") {
      const hName = dragStart.handle;
      const ratio = dragStart.w / Math.max(1, dragStart.h);
      let nextW = hName.includes("e") ? dragStart.w + dx : dragStart.w - dx;
      nextW = Math.max(60, nextW);
      const nextH = Math.max(40, Math.round(nextW / ratio));
      nextW = Math.round(nextH * ratio);

      it.x = hName.includes("w") ? Math.round(dragStart.x + dragStart.w - nextW) : dragStart.x;
      it.y = hName.includes("n") ? Math.round(dragStart.y + dragStart.h - nextH) : dragStart.y;
      it.w = nextW;
      it.h = nextH;
      box.style.left = it.x + "px";
      box.style.top = it.y + "px";
      box.style.width = it.w + "px";
      box.style.height = it.h + "px";
    }
  });

  const stopAction = () => {
    if (mode === "move" || mode === "resize") {
      clearGuides();
      saveRefItems(items);
    }
    mode = "none";
    viewport.classList.remove("is-panning");
  };
  viewport.addEventListener("pointerup", stopAction);
  viewport.addEventListener("pointercancel", stopAction);

  // Drag & Drop картинок прямо на холст
  viewport.addEventListener("dragover", e => {
    e.preventDefault();
    viewport.classList.add("is-drag-over");
  });
  viewport.addEventListener("dragleave", () => viewport.classList.remove("is-drag-over"));
  viewport.addEventListener("drop", e => {
    e.preventDefault();
    viewport.classList.remove("is-drag-over");
    const pt = screenToWorld(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith("image/"));
    files.forEach((f, i) => {
      void saveBinaryImage(f).then(p => addImageByPath(p, { x: pt.x + i * 24, y: pt.y + i * 24 }));
    });
  });

  // Вставка из буфера обмена Ctrl+V
  const onPaste = e => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) return;
    const imgItem = Array.from(e.clipboardData?.items || []).find(it => it.kind === "file" && it.type.startsWith("image/"));
    const file = imgItem?.getAsFile();
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    void saveBinaryImage(file)
      .then(p => addImageByPath(p))
      .catch(err => notify("Ошибка вставки: " + (err?.message || err)));
  };
  document.addEventListener("paste", onPaste, true);

  viewport.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextScale = Math.max(0.1, Math.min(6, scale * factor));
    const ratio = nextScale / scale;
    panX = sx - (sx - panX) * ratio;
    panY = sy - (sy - panY) * ratio;
    scale = nextScale;
    applyTransform();
  }, { passive: false });

const onKeyDown = e => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      e.preventDefault();
      deleteSelected();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  renderItems();
  fitToAll();
}

const results = el("div", root, "d3n-groups");

function renderNoteRow(parentList, note, currentTopicContext = "", rootTopic = "") {
  const row = el("div", parentList, "d3n-note-row");
  bindHoverPreview(row, note.path);

  row.addEventListener("click", e => {
    if (e.target.closest("button, a")) return;
    app.workspace.openLinkText(note.path, CURRENT, e.ctrlKey || e.metaKey);
  });
  row.addEventListener("auxclick", e => {
    if (e.button !== 1 || e.target.closest("button, a")) return;
    e.preventDefault();
    app.workspace.openLinkText(note.path, CURRENT, true);
  });

  const main = el("div", row, "d3n-note-main");
  const link = el("a", main, "d3n-note-link", note.title);
  link.title = note.title;
  openLink(link, note.path);

  const right = el("div", row, "d3n-note-right");

  const extraTopics = (rootTopic ? note.topics.filter(t => topicParts(t)[0] !== rootTopic) : note.topics)
    .filter(t => t !== currentTopicContext);

  for (const t of extraTopics.slice(0, 1)) {
    el("span", right, "d3n-mini-tag", t);
  }

  showSourceBadge(right, note.source);

  if (note.hasImages) {
    const inspectBtn = button(right, "☊", e => {
      e.stopPropagation();
      openNodeInspector(note.file);
    }, "d3n-inspect-btn");
inspectBtn.title = "Открыть схему заметки в 3D Spatial Hub";
  }
}

function renderTopicTree(parentBox, allTopicNotes, rootTopic, progKey) {
  const tree = { path: rootTopic, name: rootTopic, direct: new Map(), all: new Map(), children: new Map() };

  for (const note of allTopicNotes) {
    const paths = note.topicPaths.filter(p => p === rootTopic || p.startsWith(rootTopic + "/"));
    const leaves = paths.filter(p => !paths.some(other => other.startsWith(p + "/")));
    for (const path of leaves) {
      let node = tree;
      node.all.set(note.path, note);
      const parts = topicParts(path);
      for (let idx = 1; idx < parts.length; idx++) {
        const subName = parts[idx];
        if (!node.children.has(subName)) {
          node.children.set(subName, {
            path: node.path + "/" + subName,
            name: subName,
            direct: new Map(),
            all: new Map(),
            children: new Map()
          });
        }
        node = node.children.get(subName);
        node.all.set(note.path, note);
      }
      node.direct.set(note.path, note);
    }
  }

  function drawNode(host, node) {
    if (node.direct.size > 0) {
      const listHost = el("div", host, "d3n-note-list");
      for (const note of node.direct.values()) {
        renderNoteRow(listHost, note, node.path, rootTopic);
      }
    }

    const children = [...node.children.values()].sort((a, b) => b.all.size - a.all.size || compare(a.name, b.name));
    for (const child of children) {
      const details = el("details", host, "d3n-tree-folder");
      const storageKey = JSON.stringify(["topic-tree", progKey, child.path]);
      details.open = openState[storageKey] !== false;

      const summary = el("summary", details, "d3n-tree-summary");
      const sumLeft = el("span", summary, "d3n-tree-sum-left");
      el("span", sumLeft, "d3n-tree-name", "📁 " + child.name);
      el("span", summary, "d3n-topic-cnt", child.all.size);

      details.addEventListener("toggle", () => {
        openState[storageKey] = details.open;
        persist();
      });

      const content = el("div", details, "d3n-tree-content");
      drawNode(content, child);
    }
  }

  drawNode(parentBox, tree);
}

function render() {
  const notes = readNotes().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.mtime - a.mtime || compare(a.title, b.title);
  });

  const programsCount = new Set(notes.flatMap(n => n.programs)).size;
  totalLabel.textContent = notes.length + " заметок · " + programsCount + " прогр.";

  results.replaceChildren();

  if (!notes.length) {
    el("div", results, "d3n-empty", "Пока нет заметок с направлением 3D. Создай их в 3D Spatial Hub.");
    return;
  }

  const grouped = new Map();
  for (const note of notes) {
    const keys = note.programs.length ? note.programs : ["__none__"];
    for (const key of keys) {
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

    const fallbackOpen = index < 3 && (progKey !== "__none__" || keys.length === 1);
    details.open = Object.prototype.hasOwnProperty.call(openState, progKey) ? !!openState[progKey] : fallbackOpen;

    const summary = el("summary", details);
    const nameWrap = el("span", summary, "d3n-group-name");
    if (progKey !== "__none__") el("span", nameWrap, "d3n-dot");
    el("span", nameWrap, "", progKey === "__none__" ? "Без программы" : progKey);
    el("span", summary, "d3n-count", progNotes.length);

    const body = el("div", details, "d3n-group-body");
    const topicGrid = el("div", body, "d3n-topic-grid");

    const byTopic = new Map();
    const noTopicList = [];

    for (const n of progNotes) {
      if (!n.topics.length) {
        noTopicList.push(n);
        continue;
      }
      for (const t of n.topics) {
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
      el("span", head, "d3n-topic-cnt", tNotes.length);

      renderTopicTree(box, tNotes, tKey, progKey);
    }

    if (noTopicList.length > 0) {
      const box = el("div", topicGrid, "d3n-topic-box is-untagged-box");
      const head = el("div", box, "d3n-topic-head");
      el("span", head, "d3n-topic-title", "Без темы");
      el("span", head, "d3n-topic-cnt", noTopicList.length);
      const noteList = el("div", box, "d3n-note-list");
      for (const n of noTopicList) renderNoteRow(noteList, n, "__untagged__", progKey);
    }

    details.addEventListener("toggle", () => {
      openState[progKey] = details.open;
      persist();
    });
  });
}

render();