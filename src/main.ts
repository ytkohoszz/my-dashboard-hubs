import {
  App,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { buildDvShim, parseHubCodeblockSource, runBundledHubModule } from "./shim";
import { BUNDLED_HUB_SCRIPTS } from "./modules";

interface HubPluginSettings {
  scriptsFolder: string;
  autoRefreshOnMetadataChange: boolean;
  refreshDebounceMs: number;
}

const DEFAULT_SETTINGS: HubPluginSettings = {
  scriptsFolder: "",
  autoRefreshOnMetadataChange: true,
  refreshDebounceMs: 600,
};

const MODULE_FILE_CANDIDATES: Record<string, string[]> = {
  home: ["home.js", "Scripts/home.js"],
  diary: ["diary.js", "Scripts/diary.js"],
  health: ["health.js", "Scripts/health.js"],
  study: ["study.js", "Scripts/study.js"],
  "3d": ["3d.js", "3D.js", "Scripts/3d.js"],
  english: ["english_2.js", "english2.js", "english.js", "Scripts/english.js"],
  media: ["media.js", "Media.js", "Scripts/media.js"],
};

class HubBlockRenderer extends MarkdownRenderChild {
  plugin: MyDashboardHubsPlugin;
  source: string;
  ctx: MarkdownPostProcessorContext;
  private refreshTimer: number | null = null;
  private isRendering = false;
  private pendingRerender = false;

  constructor(
    containerEl: HTMLElement,
    plugin: MyDashboardHubsPlugin,
    source: string,
    ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
    this.plugin = plugin;
    this.source = source;
    this.ctx = ctx;
  }

  onload() {
    this.plugin.activeRenderers.add(this);
    void this.renderBlock();

    if (this.plugin.settings.autoRefreshOnMetadataChange) {
      this.registerEvent(
        this.plugin.app.metadataCache.on("changed", (file) => {
          this.scheduleSmartRefresh(file.path);
        })
      );
    }
  }

  onunload() {
    this.plugin.activeRenderers.delete(this);
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  scheduleSmartRefresh(_changedPath?: string) {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      if (!this.containerEl.isConnected) return;

      const activeEl = document.activeElement;
      const isFocusedInside =
        activeEl &&
        this.containerEl.contains(activeEl) &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT");

      if (isFocusedInside || document.querySelector(".modal-container")) {
        return;
      }

      void this.renderBlock();
    }, this.plugin.settings.refreshDebounceMs);
  }

  async renderBlock() {
    if (this.isRendering) {
      this.pendingRerender = true;
      return;
    }

    this.isRendering = true;
    try {
      const params = parseHubCodeblockSource(this.source);
      const codeBody = await this.plugin.resolveModuleScriptCode(params.module);

      if (!codeBody) {
        this.containerEl.empty();
        const err = this.containerEl.createDiv({ cls: "dh-panel" });
        err.setText(
          `Модуль "${params.module}" не найден. Запусти npm run import при сборке или проверь папку скриптов в настройках.`
        );
        return;
      }

      const prevHeight = this.containerEl.offsetHeight;
      if (prevHeight > 40) {
        this.containerEl.style.minHeight = `${prevHeight}px`;
      }

      this.containerEl.empty();
      this.containerEl.addClass("dashboard-home", "my-hub-native-container");

      const dvShim = buildDvShim(this.plugin.app, this.containerEl, this.ctx, this);
      await runBundledHubModule(codeBody, this.plugin.app, dvShim, { section: params.section });
      this.containerEl.style.minHeight = "";
    } catch (err: unknown) {
      this.containerEl.style.minHeight = "";
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      this.containerEl.createDiv({
        text: `Ошибка модуля дашборда: ${msg}`,
        attr: {
          style:
            "padding: 12px; color: #d85b57; background: rgba(216,91,87,0.12); border: 1px solid #d85b57; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 0.8rem;",
        },
      });
    } finally {
      this.isRendering = false;
      if (this.pendingRerender) {
        this.pendingRerender = false;
        void this.renderBlock();
      }
    }
  }
}

class HubsSettingTab extends PluginSettingTab {
  plugin: MyDashboardHubsPlugin;

  constructor(app: App, plugin: MyDashboardHubsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Настройки My Dashboard Hubs" });

    new Setting(containerEl)
      .setName("Папка скриптов (опционально)")
      .setDesc("Путь к папке в хранилище со скриптами .js (для разработки без пересборки).")
      .addText((text) =>
        text
          .setPlaceholder("Raw Scripts")
          .setValue(this.plugin.settings.scriptsFolder)
          .onChange(async (val) => {
            this.plugin.settings.scriptsFolder = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Автообновление при смене метаданных")
      .setDesc("Перерисовывать дашборды при сохранении заметок.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoRefreshOnMetadataChange)
          .onChange(async (val) => {
            this.plugin.settings.autoRefreshOnMetadataChange = val;
            await this.plugin.saveSettings();
          })
      );
  }
}

export default class MyDashboardHubsPlugin extends Plugin {
  settings!: HubPluginSettings;
  activeRenderers = new Set<HubBlockRenderer>();

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new HubsSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor("my-hub", (source, el, ctx) => {
      const child = new HubBlockRenderer(el, this, source, ctx);
      ctx.addChild(child);
    });

    const shortModules = ["home", "diary", "health", "study", "3d", "english", "media"];
    for (const modName of shortModules) {
      this.registerMarkdownCodeBlockProcessor(`my-${modName}`, (source, el, ctx) => {
        const trimmed = source.trim();
        const fullSource = trimmed ? `module: ${modName}\n${trimmed}` : `module: ${modName}`;
        const child = new HubBlockRenderer(el, this, fullSource, ctx);
        ctx.addChild(child);
      });
    }

    this.addCommand({
      id: "refresh-active-hubs",
      name: "Обновить активные дашборды",
      callback: () => {
        for (const r of this.activeRenderers) {
          void r.renderBlock();
        }
        new Notice("Дашборды обновлены");
      },
    });
  }

  async resolveModuleScriptCode(moduleName: string): Promise<string | null> {
    const key = moduleName.toLowerCase().trim();

    // 1. Проверяем упакованный бандл
    const bundled = BUNDLED_HUB_SCRIPTS[key];
    if (bundled && bundled.length > 10) return bundled;

    // 2. Ищем файл в хранилище (включая кандидаты)
    const folder = this.settings.scriptsFolder.replace(/^\/+|\/+$/g, "");
    const candidates = [
      ...(folder ? [`${folder}/${key}.js`] : []),
      ...(MODULE_FILE_CANDIDATES[key] ?? [`${key}.js`]),
    ];

    for (const candidatePath of candidates) {
      const file = this.app.vault.getAbstractFileByPath(candidatePath);
      if (file instanceof TFile) {
        try {
          return await this.app.vault.cachedRead(file);
        } catch {
          /* пробуем следующий путь */
        }
      }
    }

    return null;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}