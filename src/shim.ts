import {
  App,
  Component,
  MarkdownPostProcessorContext,
  Notice,
  TFile,
  normalizePath,
  requestUrl,
} from "obsidian";
import * as obsidianModule from "obsidian";

// Безопасная ссылка на глобальную функцию moment из окружения Obsidian
const getMoment = (): any => {
  const win = typeof window !== "undefined" ? (window as any) : {};
  return win.moment ?? (obsidianModule as any).moment ?? ((obsidianModule as any).default ?? null);
};

export interface HubInputParams {
  module: string;
  section?: string;
}

export function parseHubCodeblockSource(source: string): HubInputParams {
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  if (lines.length === 1 && !lines[0]?.includes(":")) {
    const parts = (lines[0] ?? "").split(/\s+/);
    return {
      module: (parts[0] ?? "home").toLowerCase(),
      section: parts[1] ?? "all",
    };
  }

  const res: HubInputParams = { module: "home", section: "all" };
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "module" || key === "hub") {
      res.module = val.toLowerCase();
    } else if (key === "section" || key === "key" || key === "mode") {
      res.section = val;
    }
  }
  return res;
}

export class NativeDateWrapper {
  private m: any;

  constructor(inp?: unknown) {
    const momentFn = getMoment();
    if (!momentFn) {
      this.m = null;
      return;
    }

    if (inp instanceof NativeDateWrapper) {
      this.m = inp.m ? inp.m.clone() : null;
    } else if (inp === "today") {
      this.m = momentFn().startOf("day");
    } else if (inp === "now") {
      this.m = momentFn();
    } else if (typeof inp === "number") {
      this.m = momentFn(inp);
    } else if (typeof inp === "string") {
      const clean = inp.trim();
      const isoFmt = momentFn.ISO_8601 ?? (obsidianModule as any).moment?.ISO_8601;
      this.m = momentFn(clean, ["YYYY-MM-DD", isoFmt], false);
    } else if (inp && typeof inp === "object" && "toISODate" in (inp as Record<string, unknown>)) {
      const iso = (inp as { toISODate?: () => string }).toISODate?.() ?? "";
      this.m = momentFn(iso);
    } else {
      this.m = typeof momentFn.invalid === "function" ? momentFn.invalid() : momentFn(NaN);
    }
  }

  get isValid(): boolean {
    return Boolean(this.m?.isValid?.());
  }

  toISODate(): string | null {
    return this.isValid ? this.m.format("YYYY-MM-DD") : null;
  }

  toFormat(fmt: string): string {
    return this.isValid ? this.m.format(fmt) : "";
  }

  get toMillis(): number {
    return this.m?.valueOf?.() ?? 0;
  }

  get weekday(): number {
    const d = this.m?.day?.() ?? 0;
    return d === 0 ? 7 : d;
  }

  startOf(unit: string): NativeDateWrapper {
    if (!this.m) return new NativeDateWrapper(NaN);
    const cloned = this.m.clone().startOf(unit);
    return new NativeDateWrapper(cloned.valueOf());
  }

  minus(duration: { days?: number; hours?: number }): NativeDateWrapper {
    if (!this.m) return new NativeDateWrapper(NaN);
    const cloned = this.m.clone();
    if (duration.days) cloned.subtract(duration.days, "days");
    if (duration.hours) cloned.subtract(duration.hours, "hours");
    return new NativeDateWrapper(cloned.valueOf());
  }

  plus(duration: { days?: number; hours?: number }): NativeDateWrapper {
    if (!this.m) return new NativeDateWrapper(NaN);
    const cloned = this.m.clone();
    if (duration.days) cloned.add(duration.days, "days");
    if (duration.hours) cloned.add(duration.hours, "hours");
    return new NativeDateWrapper(cloned.valueOf());
  }
}

export class NativeDataArray<T> extends Array<T> {
  where(pred: (item: T) => boolean): NativeDataArray<T> {
    const filtered = super.filter(pred);
    return NativeDataArray.fromArray(filtered);
  }

  array(): T[] {
    return Array.from(this);
  }

  static fromArray<U>(arr: U[]): NativeDataArray<U> {
    const inst = new NativeDataArray<U>();
    inst.push(...arr);
    return inst;
  }
}

export function buildDvShim(
  app: App,
  container: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  component: Component
) {
  const pluginsHolder = app as unknown as {
    plugins?: {
      plugins?: Record<string, { api?: Record<string, unknown> }>;
    };
  };

  const realDvApi = pluginsHolder.plugins?.plugins?.dataview?.api as
    | {
        pages?: (q?: string) => unknown;
        page?: (p: string) => Record<string, unknown>;
        date?: (d: unknown) => unknown;
        isArray?: (v: unknown) => boolean;
      }
    | undefined;

  if (realDvApi && typeof realDvApi.pages === "function") {
    return {
      container,
      component,
      currentFilePath: ctx.sourcePath,
      api: realDvApi,
      current: () => realDvApi.page?.(ctx.sourcePath) ?? { file: { path: ctx.sourcePath } },
      pages: (query?: string) => realDvApi.pages?.(query) ?? [],
      page: (path: string) => realDvApi.page?.(path) ?? null,
      date: (d: unknown) => realDvApi.date?.(d) ?? null,
      isArray: (v: unknown) => (Array.isArray(v) ? true : Boolean(realDvApi.isArray?.(v))),
    };
  }

  const buildPageObject = (file: TFile): Record<string, unknown> => {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter ? { ...cache.frontmatter } : {};
    const ctimeDate = new NativeDateWrapper(file.stat.ctime);
    const mtimeDate = new NativeDateWrapper(file.stat.mtime);

    return {
      ...fm,
      file: {
        name: file.basename,
        path: file.path,
        folder: file.parent?.path ?? "",
        link: `[[${file.path}|${file.basename}]]`,
        ctime: ctimeDate,
        mtime: mtimeDate,
        cday: ctimeDate.startOf("day"),
        mday: mtimeDate.startOf("day"),
        lists: [],
        tags: cache?.tags?.map((t) => t.tag) ?? [],
      },
    };
  };

  return {
    container,
    component,
    currentFilePath: ctx.sourcePath,
    api: {
      table: (headers: string[], rows: unknown[][], targetEl: HTMLElement) => {
        const tbl = targetEl.createEl("table", { cls: "dh-table" });
        const thead = tbl.createEl("thead").createEl("tr");
        headers.forEach((h) => thead.createEl("th", { text: String(h) }));
        const tbody = tbl.createEl("tbody");
        rows.forEach((r) => {
          const tr = tbody.createEl("tr");
          r.forEach((cell) => tr.createEl("td", { text: String(cell ?? "") }));
        });
      },
    },
    current: () => {
      const f = app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (f instanceof TFile) return buildPageObject(f);
      return { file: { path: ctx.sourcePath, name: ctx.sourcePath } };
    },
    pages: (query?: string) => {
      let folderFilter = "";
      if (typeof query === "string" && query.trim()) {
        folderFilter = query.trim().replace(/^["']|["']$/g, "");
      }
      const files = app.vault.getMarkdownFiles().filter((f) => {
        if (!folderFilter) return true;
        return f.path.startsWith(folderFilter) || f.parent?.path === folderFilter;
      });
      return NativeDataArray.fromArray(files.map(buildPageObject));
    },
    page: (pathOrLink: string) => {
      const clean = pathOrLink.replace(/[\[\]]/g, "").trim();
      const direct = app.vault.getAbstractFileByPath(clean);
      if (direct instanceof TFile) return buildPageObject(direct);
      const dest = app.metadataCache.getFirstLinkpathDest(clean, ctx.sourcePath);
      if (dest instanceof TFile) return buildPageObject(dest);
      return null;
    },
    date: (v: unknown) => {
      const d = new NativeDateWrapper(v);
      return d.isValid ? d : null;
    },
    isArray: (v: unknown) => Array.isArray(v),
  };
}

export async function runBundledHubModule(
  codeBody: string,
  app: App,
  dvShim: ReturnType<typeof buildDvShim>,
  inputObj: { section?: string }
): Promise<void> {
  if (typeof window !== "undefined") {
    (window as unknown as { requestUrl?: typeof requestUrl }).requestUrl = requestUrl;
  }

  const momentFn = getMoment();

  // Полный API Obsidian: классы (Modal, Setting, Component, TFile и др.)
  const obsidianShim = {
    ...obsidianModule,
    Notice,
    normalizePath,
    requestUrl,
    moment: momentFn,
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (
    appArg: App,
    dvArg: unknown,
    inputArg: unknown,
    momentArg: unknown,
    NoticeArg: typeof Notice,
    obsidianArg: typeof obsidianShim
  ) => Promise<void>;

  const runner = new AsyncFunction(
    "app",
    "dv",
    "input",
    "moment",
    "Notice",
    "obsidian",
    codeBody
  );

  await runner(app, dvShim, inputObj, momentFn, Notice, obsidianShim);
}