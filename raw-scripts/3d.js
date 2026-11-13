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
  const plugin = app.plugins?.plugins?.["my-3d-node-inspector"] || window.__my3DNodeInspector;
  if (plugin && typeof plugin.openInspector === "function") {
    plugin.openInspector({ file: noteFile });
    return;
  }
  notify("Включи плагин 3D Node Inspector (my-3d-node-inspector) в настройках Obsidian.");
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
  ".dashboard-home .d3n .d3n-empty { padding: 16px 12px; border: 1px dashed var(--background-modifier-border); border-radius: 9px; color: var(--text-muted); font-size: 0.82em; text-align: center; }"
].join("\n");

// --- ВЕРХНЯЯ ШАПКА С ГЛАВНОЙ КНОПКОЙ ПЕРЕХОДА В 3D SPATIAL HUB ---
const header = el("div", root, "d3n-header");
const headerLeft = el("div", header, "d3n-header-left");
el("div", headerLeft, "d3n-title", "🧊 3D и графика");
const totalLabel = el("span", headerLeft, "d3n-muted");

button(header, "🫧 Открыть 3D Spatial Hub", openSpatialHub, "d3n-primary").title =
  "Перейти на интерактивный холст плавающих пузырей (my-3d-hub)";

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
    inspectBtn.title = "Открыть схему нод в инспекторе (my-3d-node-inspector)";
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