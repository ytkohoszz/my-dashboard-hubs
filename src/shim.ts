import { App, Component, MarkdownPostProcessorContext, Notice, TFile, moment, normalizePath, requestUrl } from "obsidian";

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
      section: parts[1] || "all",
    };
  }

  const res: HubInputParams = { module: "home", section: "all" };
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key === "module" || key === "hub" || key === "модуль") res.module = val.toLowerCase();
    else if (key === "section" || key === "секция" || key === "mode") res.section = val;
  }
  return res;
}

export class NativeDateWrapper {
  private m: moment.Moment;

  constructor(inp?: unknown) {
    if (inp instanceof NativeDateWrapper) {
      this.m = inp.m.clone();
    } else if (inp === "today") {
      this.m = moment().startOf("day");
    } else if (inp === "now") {
      this.m = moment();
    } else if (typeof inp === "number") {
      this.m = moment(inp);
    } else if (typeof inp === "string") {
      const clean = inp.trim();
      this.m = moment(clean, ["YYYY-MM-DD", moment.ISO_8601], false);
    } else if (inp && typeof inp === "object" && "toISODate" in (inp as Record<string, unknown>)) {
      const iso = (inp as { toISODate: () => string }).toISODate();
      this.m = moment(iso);
    } else {
      this.m = moment.invalid();
    }
  }

  get isValid(): boolean {
    return this.m.isValid();
  }

  get weekday(): number {
    return this.m.isoWeekday();
  }

  get daysInMonth(): number {
    return this.m.daysInMonth();
  }

  startOf(unit: "day" | "month" | "year"): NativeDateWrapper {
    const next = new NativeDateWrapper();
    next.m = this.m.clone().startOf(unit);
    return next;
  }

  minus(opts: { days?: number; months?: number }): NativeDateWrapper {
    const next = new NativeDateWrapper();
    const c = this.m.clone();
    if (opts.days) c.subtract(opts.days, "days");
    if (opts.months) c.subtract(opts.months, "months");
    next.m = c;
    return next;
  }

  plus(opts: { days?: number; months?: number }): NativeDateWrapper {
    const next = new NativeDateWrapper();
    const c = this.m.clone();
    if (opts.days) c.add(opts.days, "days");
    if (opts.months) c.add(opts.months, "months");
    next.m = c;
    return next;
  }

  set(opts: { day?: number }): NativeDateWrapper {
    const next = new NativeDateWrapper();
    const c = this.m.clone();
    if (opts.day !== undefined) c.date(opts.day);
    next.m = c;
    return next;
  }

  setLocale(loc: string): NativeDateWrapper {
    const next = new NativeDateWrapper();
    next.m = this.m.clone().locale(loc);
    return next;
  }

  toISODate(): string {
    return this.m.format("YYYY-MM-DD");
  }

  toMillis(): number {
    return this.m.valueOf();
  }

  valueOf(): number {
    return this.m.valueOf();
  }

  diff(other: NativeDateWrapper, _unit = "days"): { days: number } {
    const diffMs = this.m.valueOf() - other.toMillis();
    return { days: diffMs / 86_400_000 };
  }

  toFormat(fmt: string): string {
    const mapped = fmt
      .replace(/yyyy/g, "YYYY")
      .replace(/yy/g, "YY")
      .replace(/dd/g, "DD")
      .replace(/cccc/g, "dddd")
      .replace(/LLLL/g, "MMMM")
      .replace(/(?<![dD])d(?![dD])/g, "D");
    return this.m.format(mapped);
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
  const realDvApi = pluginsHolder.plugins?.plugins?.["dataview"]?.api as
    | {
        pages?: (q?: string) => unknown[];
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
      isArray: (v: unknown) => Array.isArray(v) || Boolean(realDvApi.isArray?.(v)),
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
        return f.path.startsWith(folderFilter + "/") || f.parent?.path === folderFilter;
      });
      return NativeDataArray.fromArray(files.map(buildPageObject));
    },
    page: (pathOrLink: string) => {
      const clean = pathOrLink.replace(/^\[\[|\]\]$/g, "").trim();
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
) {
  if (typeof window !== "undefined") {
    (window as unknown as { requestUrl?: typeof requestUrl }).requestUrl = requestUrl;
  }
  const obsidianShim = { Notice, normalizePath, requestUrl };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (
    appArg: App,
    dvArg: unknown,
    inputArg: unknown,
    momentArg: typeof moment,
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

  await runner(app, dvShim, inputObj, moment, Notice, obsidianShim);
}