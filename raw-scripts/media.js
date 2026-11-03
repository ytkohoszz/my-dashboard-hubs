/* ==========================================================================
   MEDIA DASHBOARD HUB (Letterboxd & Backloggd Style)
   ========================================================================== */

const root = dv.container.createDiv({ cls: "dashboard-home dh-media-hub" });

// Встраивание изолированных стилей
const styleEl = root.createEl("style");
styleEl.textContent = `
.dashboard-home.dh-media-hub {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0.5rem 0;
  color: var(--text-normal);
  font-family: var(--font-interface);
}

.dashboard-home .lb-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.dashboard-home .lb-tabs {
  display: flex;
  background: var(--background-secondary);
  border-radius: 8px;
  padding: 3px;
  gap: 4px;
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-tab-btn {
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s ease-in-out;
}

.dashboard-home .lb-tab-btn:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}

.dashboard-home .lb-tab-btn.active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  font-weight: 600;
}

.dashboard-home .lb-stats-section {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  padding: 12px 16px;
}

.dashboard-home .lb-stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.25rem;
}

.dashboard-home .lb-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dashboard-home .lb-stat-badge {
  background: var(--background-primary);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.82rem;
  border: 1px solid var(--background-modifier-border);
}

.dashboard-home .lb-stat-badge.accent {
  color: var(--text-accent);
  font-weight: 600;
}

.dashboard-home .lb-histogram {
  display: flex;
  align-items: flex-end;
  height: 44px;
  gap: 4px;
}

.dashboard-home .lb-hist-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
  width: 13px;
}

.dashboard-home .lb-hist-fill {
  width: 100%;
  background: var(--interactive-accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  opacity: 0.75;
  transition: opacity 0.15s;
}

.dashboard-home .lb-hist-fill:hover {
  opacity: 1;
}

.dashboard-home .lb-hist-label {
  font-size: 9px;
  color: var(--text-faint);
  margin-top: 2px;
}

.dashboard-home .lb-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dashboard-home .lb-filters-bar select {
  font-size: 0.82rem;
  padding: 4px 8px;
  border-radius: 6px;
}

.dashboard-home .lb-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
  margin-left: 4px;
}

.dashboard-home .lb-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 12px;
}

.dashboard-home .lb-card {
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  transition: transform 0.2s cubic-bezier(0.2, 0, 0.2, 1), box-shadow 0.2s ease;
}

.dashboard-home .lb-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
  border-color: var(--interactive-accent);
  z-index: 2;
}

.dashboard-home .lb-poster-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
}

.dashboard-home .lb-poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dashboard-home .lb-poster-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px;
  text-align: center;
  background: var(--background-secondary-alt);
}

.dashboard-home .lb-fallback-title {
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.25;
}

.dashboard-home .lb-fallback-year {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.dashboard-home .lb-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.88) 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.dashboard-home .lb-card:hover .lb-overlay {
  opacity: 1;
}

.dashboard-home .lb-overlay-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.dashboard-home .lb-heart {
  color: #ff4757;
  font-size: 0.95rem;
}

.dashboard-home .lb-score-pill {
  background: rgba(0, 0, 0, 0.8);
  color: #00e054;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.dashboard-home .lb-overlay-bottom {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dashboard-home .lb-overlay-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.2;
}

.dashboard-home .lb-overlay-date {
  font-size: 0.65rem;
  color: #bbb;
}

.dashboard-home .lb-pagination-section {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
}

.dashboard-home .lb-more-btn {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  padding: 6px 20px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-normal);
}

.dashboard-home .lb-empty-msg {
  padding: 2.5rem;
  text-align: center;
  color: var(--text-muted);
}
`;

// Состояние сессии UI
if (!window.dhMediaState) {
  window.dhMediaState = {
    activeTab: "Фильм",
    statusFilter: "Все",
    genreFilter: "Все",
    onlyFavorites: false,
    sortBy: "date_desc",
    page: 1,
    pageSize: 24
  };
}
const state = window.dhMediaState;

// Модальное окно добавления
class QuickLogModal extends obsidian.Modal {
  constructor(app, defaultType, onCreated) {
    super(app);
    this.defaultType = defaultType === "Любимое" ? "Фильм" : defaultType;
    this.onCreated = onCreated;
    this.data = {
      type: this.defaultType,
      title: "",
      year: new Date().getFullYear(),
      rating: 8,
      status: this.defaultType === "Игра" ? "Пройдено" : "Просмотрено",
      date: new Date().toISOString().split("T")[0],
      poster: "",
      review: "",
      genres: ""
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Добавить в Медиатеку" });

    new obsidian.Setting(contentEl)
      .setName("Тип")
      .addDropdown(d => d
        .addOption("Фильм", "Фильм")
        .addOption("Сериал", "Сериал")
        .addOption("Игра", "Игра")
        .setValue(this.data.type)
        .onChange(v => this.data.type = v));

    new obsidian.Setting(contentEl)
      .setName("Название")
      .addText(t => t.setPlaceholder("Интерстеллар").onChange(v => this.data.title = v));

    new obsidian.Setting(contentEl)
      .setName("Год выпуска")
      .addText(t => t.setValue(String(this.data.year)).onChange(v => this.data.year = Number(v)));

    new obsidian.Setting(contentEl)
      .setName("Оценка (1-10)")
      .addSlider(s => s
        .setLimits(1, 10, 1)
        .setValue(this.data.rating)
        .setDynamicTooltip()
        .onChange(v => this.data.rating = v));

    new obsidian.Setting(contentEl)
      .setName("Статус")
      .addDropdown(d => d
        .addOption("Просмотрено", "Просмотрено")
        .addOption("Пройдено", "Пройдено")
        .addOption("Смотрю", "Смотрю")
        .addOption("Играю", "Играю")
        .addOption("В планах", "В планах")
        .setValue(this.data.status)
        .onChange(v => this.data.status = v));

    new obsidian.Setting(contentEl)
      .setName("Постер (URL)")
      .addText(t => t.setPlaceholder("https://image.tmdb.org/...").onChange(v => this.data.poster = v));

    new obsidian.Setting(contentEl)
      .setName("Жанры (через запятую)")
      .addText(t => t.setPlaceholder("Фантастика, Драма").onChange(v => this.data.genres = v));

    new obsidian.Setting(contentEl)
      .setName("Короткий отзыв")
      .addTextArea(t => t.onChange(v => this.data.review = v));

    new obsidian.Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Сохранить")
        .setCta()
        .onClick(async () => {
          if (!this.data.title.trim()) {
            new Notice("Введите название!");
            return;
          }
          await this.createFile();
          this.close();
          if (this.onCreated) this.onCreated();
        }));
  }

  async createFile() {
    const folderType = this.data.type === "Фильм" ? "Фильмы" : this.data.type === "Сериал" ? "Сериалы" : "Игры";
    const folder = `Знания/Медиа/${folderType}`;
    
    if (!app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }

    const cleanTitle = this.data.title.replace(/[\\/:*?"<>|]/g, "");
    const filePath = `${folder}/${cleanTitle}.md`;

    const genreArray = this.data.genres
      ? this.data.genres.split(",").map(g => `"${g.trim()}"`).join(", ")
      : "";

    const frontmatter = [
      "---",
      `тип: ${this.data.type}`,
      `название: "${this.data.title}"`,
      `год: ${this.data.year}`,
      `постер: "${this.data.poster}"`,
      `оценка: ${this.data.rating}`,
      `статус: ${this.data.status}`,
      `дата_просмотра: "${this.data.date}"`,
      `любимое: false`,
      `пересмотр: false`,
      `жанр: [${genreArray}]`,
      `отзыв: "${this.data.review.replace(/"/g, '\\"')}"`,
      "---",
      "",
      `# ${this.data.title}`,
      "",
      this.data.review ? `> ${this.data.review}` : ""
    ].join("\n");

    try {
      await app.vault.create(filePath, frontmatter);
      new Notice(`Добавлено: ${this.data.title}`);
    } catch (err) {
      new Notice(`Ошибка: ${err.message}`);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Построение DOM
const topBar = root.createDiv({ cls: "lb-topbar" });
const statsContainer = root.createDiv({ cls: "lb-stats-section" });
const controlsContainer = root.createDiv({ cls: "lb-controls-section" });
const gridContainer = root.createDiv({ cls: "lb-grid-section" });
const paginationContainer = root.createDiv({ cls: "lb-pagination-section" });

// Кнопки категорий
const tabsContainer = topBar.createDiv({ cls: "lb-tabs" });
const tabs = [
  { id: "Фильм", label: "🎬 Фильмы" },
  { id: "Сериал", label: "📺 Сериалы" },
  { id: "Игра", label: "🎮 Игры" },
  { id: "Любимое", label: "🌟 Избранное" }
];

tabs.forEach(tab => {
  const btn = tabsContainer.createEl("button", {
    cls: `lb-tab-btn ${state.activeTab === tab.id ? "active" : ""}`,
    text: tab.label
  });
  btn.onclick = () => {
    state.activeTab = tab.id;
    state.page = 1;
    tabsContainer.querySelectorAll(".lb-tab-btn").forEach(b => b.removeClass("active"));
    btn.addClass("active");
    renderDashboard();
  };
});

const addBtn = topBar.createEl("button", {
  cls: "lb-tab-btn mod-cta",
  text: "＋ Добавить"
});
addBtn.onclick = () => {
  new QuickLogModal(app, state.activeTab, () => renderDashboard()).open();
};

function getPages() {
  return dv.pages('"Знания/Медиа"').where(p => {
    const type = p["тип"];
    if (!type) return false;
    if (state.activeTab === "Любимое") return p["любимое"] === true;
    return type.toLowerCase() === state.activeTab.toLowerCase();
  }).values;
}

function renderDashboard() {
  const allItems = getPages();
  renderStats(allItems);
  renderControls(allItems);
  renderGrid(allItems);
}

function renderStats(items) {
  statsContainer.empty();
  const currentYear = new Date().getFullYear().toString();

  const logged = items.filter(i => ["Просмотрено", "Пройдено"].includes(i["статус"]));
  const thisYear = logged.filter(i => (i["дата_просмотра"] || "").toString().startsWith(currentYear));
  const ratedItems = items.filter(i => typeof i["оценка"] === "number" && i["оценка"] > 0);
  const avgScore = ratedItems.length
    ? (ratedItems.reduce((acc, curr) => acc + curr["оценка"], 0) / ratedItems.length).toFixed(1)
    : "—";

  const statsBar = statsContainer.createDiv({ cls: "lb-stats-bar" });
  const summary = statsBar.createDiv({ cls: "lb-summary" });
  summary.createDiv({ cls: "lb-stat-badge", text: `Всего: ${logged.length}` });
  summary.createDiv({ cls: "lb-stat-badge", text: `В ${currentYear}: ${thisYear.length}` });
  summary.createDiv({ cls: "lb-stat-badge accent", text: `★ Средняя: ${avgScore}` });

  const histoContainer = statsBar.createDiv({ cls: "lb-histogram" });
  const counts = Array(10).fill(0);
  ratedItems.forEach(i => {
    const s = Math.round(i["оценка"]);
    if (s >= 1 && s <= 10) counts[s - 1]++;
  });
  const maxVal = Math.max(...counts, 1);

  counts.forEach((c, idx) => {
    const col = histoContainer.createDiv({ cls: "lb-hist-col" });
    const barHeight = Math.round((c / maxVal) * 100);
    col.createDiv({
      cls: "lb-hist-fill",
      attr: { style: `height: ${barHeight}%;`, title: `Оценка ${idx + 1}: ${c} шт.` }
    });
    col.createSpan({ cls: "lb-hist-label", text: `${idx + 1}` });
  });
}

function renderControls(allItems) {
  controlsContainer.empty();
  const bar = controlsContainer.createDiv({ cls: "lb-filters-bar" });

  const statusSelect = bar.createEl("select", { cls: "dropdown" });
  ["Все", "Просмотрено", "Пройдено", "Смотрю", "Играю", "В планах"].forEach(st => {
    const opt = statusSelect.createEl("option", { text: st, value: st });
    if (state.statusFilter === st) opt.selected = true;
  });
  statusSelect.onchange = (e) => {
    state.statusFilter = e.target.value;
    state.page = 1;
    renderGrid(allItems);
  };

  const genres = new Set();
  allItems.forEach(i => {
    const g = i["жанр"];
    if (Array.isArray(g)) g.forEach(x => genres.add(x));
    else if (g) genres.add(g);
  });

  const genreSelect = bar.createEl("select", { cls: "dropdown" });
  genreSelect.createEl("option", { text: "Все жанры", value: "Все" });
  Array.from(genres).sort().forEach(g => {
    const opt = genreSelect.createEl("option", { text: g, value: g });
    if (state.genreFilter === g) opt.selected = true;
  });
  genreSelect.onchange = (e) => {
    state.genreFilter = e.target.value;
    state.page = 1;
    renderGrid(allItems);
  };

  const sortSelect = bar.createEl("select", { cls: "dropdown" });
  [
    { id: "date_desc", label: "По дате лога (новые)" },
    { id: "rating_desc", label: "По оценке (высокая)" },
    { id: "year_desc", label: "По году выхода (свежие)" },
    { id: "title_asc", label: "По названию (А–Я)" }
  ].forEach(s => {
    const opt = sortSelect.createEl("option", { text: s.label, value: s.id });
    if (state.sortBy === s.id) opt.selected = true;
  });
  sortSelect.onchange = (e) => {
    state.sortBy = e.target.value;
    renderGrid(allItems);
  };

  const favLabel = bar.createEl("label", { cls: "lb-checkbox-label" });
  const favCheckbox = favLabel.createEl("input", { type: "checkbox" });
  favCheckbox.checked = state.onlyFavorites;
  favLabel.createSpan({ text: "Только ♥" });
  favCheckbox.onchange = (e) => {
    state.onlyFavorites = e.target.checked;
    state.page = 1;
    renderGrid(allItems);
  };
}

function renderGrid(allItems) {
  gridContainer.empty();
  paginationContainer.empty();

  let filtered = allItems.filter(p => {
    if (state.statusFilter !== "Все" && p["статус"] !== state.statusFilter) return false;
    if (state.genreFilter !== "Все") {
      const g = p["жанр"];
      if (Array.isArray(g) && !g.includes(state.genreFilter)) return false;
      if (!Array.isArray(g) && g !== state.genreFilter) return false;
    }
    if (state.onlyFavorites && !p["любимое"]) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (state.sortBy === "rating_desc") return (b["оценка"] || 0) - (a["оценка"] || 0);
    if (state.sortBy === "year_desc") return (b["год"] || 0) - (a["год"] || 0);
    if (state.sortBy === "title_asc") return (a["название"] || "").localeCompare(b["название"] || "");
    const dateA = a["дата_просмотра"] ? new Date(a["дата_просмотра"]) : new Date(0);
    const dateB = b["дата_просмотра"] ? new Date(b["дата_просмотра"]) : new Date(0);
    return dateB - dateA;
  });

  const total = filtered.length;
  const paginated = filtered.slice(0, state.page * state.pageSize);

  if (paginated.length === 0) {
    gridContainer.createDiv({ cls: "lb-empty-msg", text: "Ничего не найдено по заданным фильтрам" });
    return;
  }

  const grid = gridContainer.createDiv({ cls: "lb-cards-grid" });

  paginated.forEach(item => {
    const card = grid.createDiv({ cls: "lb-card" });
    card.onclick = () => app.workspace.openLinkText(item.file.path, "", false);

    const posterWrapper = card.createDiv({ cls: "lb-poster-wrapper" });
    const posterUrl = item["постер"];

    if (posterUrl && (posterUrl.startsWith("http") || posterUrl.startsWith("app://"))) {
      posterWrapper.createEl("img", { cls: "lb-poster-img", attr: { src: posterUrl, loading: "lazy" } });
    } else {
      const fallback = posterWrapper.createDiv({ cls: "lb-poster-fallback" });
      fallback.createDiv({ cls: "lb-fallback-title", text: item["название"] || item.file.name });
      if (item["год"]) fallback.createDiv({ cls: "lb-fallback-year", text: `${item["год"]}` });
    }

    const overlay = posterWrapper.createDiv({ cls: "lb-overlay" });
    const topInfo = overlay.createDiv({ cls: "lb-overlay-top" });
    if (item["любимое"]) topInfo.createSpan({ cls: "lb-heart", text: "♥" });
    if (item["оценка"]) topInfo.createSpan({ cls: "lb-score-pill", text: `★ ${item["оценка"]}` });

    const bottomInfo = overlay.createDiv({ cls: "lb-overlay-bottom" });
    bottomInfo.createDiv({ cls: "lb-overlay-title", text: item["название"] || item.file.name });
    if (item["дата_просмотра"]) {
      bottomInfo.createDiv({ cls: "lb-overlay-date", text: `${item["дата_просмотра"]}` });
    }
  });

  if (paginated.length < total) {
    const moreBtn = paginationContainer.createEl("button", {
      cls: "lb-more-btn",
      text: `Показать ещё (${total - paginated.length})`
    });
    moreBtn.onclick = () => {
      state.page++;
      renderGrid(allItems);
    };
  }
}

renderDashboard();