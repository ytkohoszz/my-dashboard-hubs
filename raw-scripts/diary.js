const mode = input?.section || "all";

// ========================================================
// ЧАСТЬ 1: ПЛИТКИ СВОДКИ, 3-МЕСЯЧНЫЙ КАЛЕНДАРЬ И ПРИВЫЧКИ
// ========================================================
if (mode === "all" || mode === "main") {
  const SOURCE = '"Ежедневник"';
  const WEEKS = 10;
  const MIN_WEEK_DAYS = 4; // минимум заполненных дней с оценкой в каждом 7-дневном периоде
  const getCorrelationPlugin = () =>
    app.plugins?.plugins?.["my-correlation-analytics"] || window.__myCorrelationAnalytics;
  const rawSocialLimit = getCorrelationPlugin()?.settings?.socialLimitMin;
  const SOCIAL_LIMIT_MIN =
    typeof rawSocialLimit === "number" && Number.isFinite(rawSocialLimit) && rawSocialLimit >= 0
      ? rawSocialLimit
      : 30;

  function renderIcon(parent, iconName, cls = "dh-icon") {
    const el = parent.createSpan({ cls, attr: { "aria-hidden": "true" } });
    try {
      if (typeof setIcon === "function") setIcon(el, iconName);
      else if (typeof window.setIcon === "function") window.setIcon(el, iconName);
      else if (typeof require === "function") require("obsidian").setIcon(el, iconName);
    } catch {}
    return el;
  }
  const HABITS = [
    { key: "nofap", name: "NoFap", color: "#9c83e8" },
    { key: "тренировка", name: "Тренировки", color: "#d69852" },
    { key: "чтение", name: "Чтение", color: "#599ed6" },
    { key: "режим_сна", name: "Режим сна", color: "#69b5aa" },
    { key: "диета", name: "Диета", color: "#8bac5e" },
    { key: "без_соцсетей", name: "Без соцсетей", color: "#e06c75" },
  ];
  const COLORS = [
    "#d85b57", "#d97354", "#d98c54", "#d9a554", "#c5ad55",
    "#a6b25a", "#8cb666", "#73b473", "#5ab17f", "#4aab80"
  ];
  const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const MONTHS_FULL = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const empty = v => v == null || v === "";
  function asDate(v) {
    if (empty(v)) return null;
    try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
  }
  const score = v => typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 10 ? v : null;
  const average = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const fmt = (v, minDigits = 0, maxDigits = 1) => v == null ? "—" : v.toLocaleString("ru-RU", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits
  });
  const mtime = p => { try { return p.file.mtime?.toMillis?.() ?? 0; } catch { return 0; } };
  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
  const from30Date = today.minus({ days: 29 });

  const state = (p, key) => p && typeof p[key] === "boolean" ? p[key] : null;

  const parseValidNum = (v, minVal, maxVal, allowZero = false) => {
    if (empty(v) || typeof v === "boolean") return null;
    const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    if (!Number.isFinite(n)) return null;
    if (!allowZero && n <= 0) return null;
    if (n < minVal || n > maxVal) return null;
    return n;
  };

  const getPagesRead = p => p ? parseValidNum(p.страниц_прочитано, 0, 1500, true) : null;
  const getSleepHours = p => p ? parseValidNum(p.сон_часов, 0.5, 24, false) : null;
  const getCalories = p => p ? parseValidNum(p.калории_ккал, 1, 10000, false) : null;
  const getWeight = p => p ? parseValidNum(p.вес_кг, 20, 300, false) : null;
  const getSocialMin = p => p ? parseValidNum(p.соцсети_мин, 0, 1440, true) : null;
  const getSteps = p => p ? parseValidNum(p.шаги, 0, 100000, true) : null;
  const getProtein = p => p ? parseValidNum(p.белки_г ?? p.белки, 0, 600, false) : null;
  const getFat = p => p ? parseValidNum(p.жиры_г ?? p.жиры, 0, 600, false) : null;
  const getCarbs = p => p ? parseValidNum(p.углеводы_г ?? p.углеводы, 0, 1200, false) : null;

  const getDayGoalsInfo = p => {
    if (!p || empty(p.цели_дня)) return null;
    const raw = p.цели_дня;
    if (Array.isArray(raw)) {
      const items = raw.map(x => String(x ?? "").trim()).filter(Boolean);
      return items.length ? items.length : null;
    }
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) return n;
      return trimmed.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean).length;
    }
    return null;
  };

  const isNoteActivelyFilled = p => {
    if (!p) return false;
    if (score(p.оценка_дня) !== null || score(p.энергия) !== null) return true;
    if (getWeight(p) !== null || getCalories(p) !== null || getSleepHours(p) !== null) return true;
    const pr = getPagesRead(p);
    if (pr !== null && pr > 0) return true;
    if (typeof p.главное_событие === "string" && p.главное_событие.trim() !== "") return true;
    return HABITS.some(hb => p[hb.key] === true);
  };

  const formatSigned = (rawDiff, minD = 0, maxD = 1, unit = "") => {
    if (rawDiff == null || !Number.isFinite(rawDiff)) return "—";
    const factor = 10 ** maxD;
    const rounded = Math.round(rawDiff * factor) / factor;
    const suffix = unit ? ` ${unit}` : "";
    if (Object.is(rounded, -0) || Math.abs(rounded) < (maxD > 0 ? 0.05 : 0.5)) {
      return `0${minD > 0 ? "," + "0".repeat(minD) : ""}${suffix}`;
    }
    const sign = rounded > 0 ? "+" : "−";
    return `${sign}${fmt(Math.abs(rounded), minD, maxD)}${suffix}`;
  };

  const problems = [];
  const groups = new Map();
  for (const p of dv.pages(SOURCE)) {
    const d = asDate(p.дата);
    if (!d) { problems.push([p.file.link, "Нет корректной даты — запись не учтена."]); continue; }
    if (d > today) continue;
    const iso = d.toISODate();
    if (!groups.has(iso)) groups.set(iso, []);
    groups.get(iso).push(p);
  }
  const byDate = new Map();
  for (const [iso, list] of groups) {
    list.sort((a, b) => mtime(b) - mtime(a) || a.file.path.localeCompare(b.file.path, "ru"));
    byDate.set(iso, list[0]);
    if (list.length > 1) problems.push([list.map(p => p.file.link), `${dv.date(iso).toFormat("dd.MM.yyyy")}: ${list.length} записи за один день. Учитывается последняя изменённая.`]);
  }
  const entries = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  for (const [, p] of entries) {
    for (const key of ["оценка_дня", "энергия"]) {
      if (!empty(p[key]) && score(p[key]) === null) problems.push([p.file.link, `${key}: нужно число от 1 до 10.`]);
    }
    for (const h of HABITS) {
      if (!empty(p[h.key]) && typeof p[h.key] !== "boolean") problems.push([p.file.link, `${h.key}: нужен флажок true/false, а не текст.`]);
    }
  }

  const days = n => Array.from({ length: n }, (_, i) => today.minus({ days: n - 1 - i }));
  const recent = days(30).map(d => byDate.get(d.toISODate())).filter(Boolean);
  const scores = recent.map(p => score(p.оценка_дня)).filter(s => s !== null);
  const energies = recent.map(p => score(p.энергия)).filter(s => s !== null);

  const periodCompletedScores = (startOffset, length) =>
    Array.from({ length }, (_, i) => byDate.get(today.minus({ days: startOffset + i }).toISODate()))
      .filter(Boolean)
      .map(p => score(p.оценка_дня))
      .filter(s => s !== null);

  const week = periodCompletedScores(1, 7);
  const before = periodCompletedScores(8, 7);
  const weekMean = average(week), beforeMean = average(before);

  const range30Str = `${from30Date.toFormat("dd.MM.yyyy")}–${today.toFormat("dd.MM.yyyy")}`;
  const curWeekRange = `${today.minus({ days: 7 }).toFormat("dd.MM")}–${today.minus({ days: 1 }).toFormat("dd.MM")}`;
  const prevWeekRange = `${today.minus({ days: 14 }).toFormat("dd.MM")}–${today.minus({ days: 8 }).toFormat("dd.MM")}`;

  const root = dv.container.createDiv({ cls: "dh" });

  function section(title, hint) {
    const s = root.createDiv({ cls: "dh-section" });
    s.createDiv({ cls: "dh-section-title", text: title });
    if (hint) s.createDiv({ cls: "dh-muted", text: hint });
    return s;
  }
  const open = p => app.workspace.openLinkText(p.file.path, dv.currentFilePath, false);
  function dayButton(parent, cls, p, label) {
    const b = parent.createEl("button", { cls, attr: { type: "button", title: label, "aria-label": label } });
    b.disabled = !p;
    if (p) b.onclick = () => open(p);
    return b;
  }

  // Календарь
  {
    const cal = section("");
    cal.classList.add("dh-calendar-v2");

    const doc = cal.ownerDocument;
    const win = doc.defaultView;

    const style = cal.createEl("style");
    style.textContent = `
      .dh-calendar-v2 .dhc-panel {
        padding: calc(var(--vl-layout-padding, 8px) * 2);
        border: none;
        border-radius: calc(var(--radius-ml, 14px) + 2px);
        background: var(--trans-faint-05, var(--background-secondary));
        box-shadow:
          var(--glass-base-m, none),
          0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
          var(--shadow-setting-items, none);
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dh-calendar-v2 .dhc-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .dh-calendar-v2 .dhc-nav-range {
        font-size: var(--font-ui-small, 13.5px);
        font-weight: var(--font-semibold, 600);
        font-variation-settings: "opsz" 24;
        color: var(--color-base-100, var(--text-normal));
      }
      .dh-calendar-v2 .dhc-nav-controls {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .dh-calendar-v2 button.dhc-nav-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 30px;
        height: 30px;
        margin: 0;
        padding: 0 8px;
        border: none;
        border-radius: var(--radius-xxl, 22px);
        background: transparent;
        color: var(--control-icon-color, var(--icon-color));
        font-size: 1rem;
        font-weight: var(--font-semi-medium, 500);
        line-height: 1;
        cursor: pointer;
        box-shadow: none;
        contain: content;
        transition:
          background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dh-calendar-v2 button.dhc-nav-btn:hover:not(:disabled) {
        background: var(--control-icon-background, var(--background-modifier-hover));
        box-shadow: var(--control-icon-shadow, none);
        color: var(--text-normal);
      }
      .dh-calendar-v2 button.dhc-nav-btn:disabled {
        filter: opacity(0.3125);
        cursor: default;
      }
      .dh-calendar-v2 button.dhc-nav-today {
        font-size: 0.74rem;
        padding: 0 11px;
        height: 26px;
        background: var(--color-accent-4, var(--background-modifier-active-hover));
        color: var(--color-accent-1, var(--text-accent));
      }
      .dh-calendar-v2 button.dhc-nav-today:hover:not(:disabled) {
        background: var(--text-selection, var(--background-modifier-active-hover));
        box-shadow: none;
        color: var(--color-accent-1, var(--text-accent));
      }
      .dh-calendar-v2 .dhc-months {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
        gap: 12px;
        align-items: start;
      }
      .dh-calendar-v2 .dhc-month {
        min-width: 0;
        padding: 12px;
        border: none;
        border-radius: var(--radius-sm, 10px);
        background: var(--background-primary);
        box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dh-calendar-v2 .dhc-title {
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--trans-faint-20, var(--background-modifier-border));
        color: var(--color-base-100, var(--text-normal));
        font-size: 0.88rem;
        font-weight: var(--font-semibold, 600);
        font-variation-settings: "opsz" 24;
      }
      .dh-calendar-v2 .dhc-weekdays,
      .dh-calendar-v2 .dhc-days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 4px;
      }
      .dh-calendar-v2 .dhc-weekdays {
        margin-bottom: 6px;
        text-align: center;
        color: var(--icon-color, var(--text-muted));
        font-size: 0.7rem;
        font-weight: var(--font-semi-medium, 500);
      }
      .dh-calendar-v2 .dhc-spacer {
        height: 32px;
      }
      .dh-calendar-v2 button.dhc-day {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-width: 0;
        height: 32px;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: var(--radius-xs, 6px);
        box-shadow: none;
        background: var(--trans-faint-05, var(--background-secondary));
        color: var(--text-muted);
        font-family: inherit;
        font-size: 0.76rem;
        font-weight: var(--font-semi-medium, 500);
        font-variant-numeric: tabular-nums;
        line-height: 1;
        cursor: pointer;
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
        transition:
          background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dh-calendar-v2 button.dhc-day.has-score {
        background: var(--day-background);
        box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--day-color) 60%, transparent);
        color: var(--color-base-100, var(--text-normal));
      }
      .dh-calendar-v2 button.dhc-day.has-entry:not(.has-score) {
        background: var(--trans-faint-10, var(--background-modifier-hover));
        box-shadow: inset 0 0 0 1px var(--trans-faint-30, var(--background-modifier-border));
        color: var(--text-normal);
      }
      .dh-calendar-v2 button.dhc-day:hover:not(:disabled) {
        box-shadow: inset 0 0 0 1.25px var(--text-muted);
      }
      .dh-calendar-v2 button.dhc-day.is-today {
        box-shadow: 0 0 0 2px var(--interactive-accent);
        font-weight: var(--font-bold, 700);
        color: var(--color-base-100, var(--text-normal));
      }
      .dh-calendar-v2 button.dhc-day:focus-visible {
        box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent));
        outline: none;
      }
      .dh-calendar-v2 button.dhc-day.is-future {
        background: transparent;
        box-shadow: none;
        color: var(--text-faint);
        opacity: 0.35;
        cursor: default;
      }
      .dh .dh-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: currentColor;
        vertical-align: middle;
      }
      .dh .dh-icon svg {
        width: 14px;
        height: 14px;
        stroke-width: 1.9;
      }
      .dh .dh-icon.dh-icon-xs svg {
        width: 12px;
        height: 12px;
      }
      .dh .dh-icon.dh-icon-title {
        color: var(--icon-color, var(--text-muted));
      }
      .dh .dh-icon.dh-icon-title svg {
        width: 15px;
        height: 15px;
      }
      .dh .dh-inline-meta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .dh-calendar-v2 .dhc-training {
        position: absolute;
        top: 2px;
        right: 2px;
        color: var(--icon-color, var(--text-muted));
        opacity: 0.82;
        pointer-events: none;
      }
      .dh-calendar-v2 .dhc-training svg {
        width: 9px;
        height: 9px;
        stroke-width: 2.2;
      }
      .dh-calendar-v2 .dhc-legend {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 14px;
        color: var(--icon-color, var(--text-muted));
        font-size: 0.73rem;
      }
      .dh-calendar-v2 .dhc-swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 4px;
        flex: 0 0 auto;
      }
      .dh-calendar-v2 .dhc-no-score {
        margin-left: 6px;
        background: var(--trans-faint-10, var(--background-primary));
        box-shadow: inset 0 0 0 1px var(--trans-faint-30, var(--text-faint));
      }
      .dhc-calendar-popover-v2 {
        position: fixed;
        z-index: 10000;
        box-sizing: border-box;
        width: 310px;
        max-width: calc(100vw - 20px);
        max-height: 70vh;
        overflow: auto;
        scrollbar-width: none;
        padding: 13px 15px;
        border: 1px solid var(--menu-border-color, var(--trans-faint-30, var(--background-modifier-border)));
        border-radius: var(--menu-radius, var(--radius-ml, 14px));
        background: var(--modal-small-background, var(--background-primary-alt, var(--background-primary)));
        backdrop-filter: var(--blur-m, blur(12px));
        -webkit-backdrop-filter: var(--blur-m, blur(12px));
        color: var(--text-normal);
        box-shadow: var(--glass-base-l, none), var(--menu-shadow, 0 10px 30px rgba(0, 0, 0, 0.28));
        font-family: var(--font-interface);
        font-size: 0.8rem;
        line-height: 1.45;
        white-space: normal;
        overflow-wrap: anywhere;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: scale(1.03) translateY(4px);
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
        transition:
          opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          visibility var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dhc-calendar-popover-v2::-webkit-scrollbar {
        display: none;
      }
      .dhc-calendar-popover-v2.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: scale(1) translateY(0);
      }
      .dhc-calendar-popover-v2 .dhc-pop-date {
        margin-bottom: 8px;
        color: var(--icon-color, var(--text-muted));
        font-size: 0.74rem;
        font-weight: var(--font-semi-medium, 500);
      }
      .dhc-calendar-popover-v2 .dhc-pop-score {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .dhc-calendar-popover-v2 .dhc-pop-label {
        color: var(--text-muted);
      }
      .dhc-calendar-popover-v2 .dhc-pop-value {
        color: var(--dhc-pop-accent, var(--color-base-100, var(--text-normal)));
        font-weight: var(--font-semibold, 600);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .dhc-calendar-popover-v2 .dhc-pop-event {
        margin-top: 10px;
        padding-top: 9px;
        border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
      }
      .dhc-calendar-popover-v2 .dhc-pop-event-label {
        margin-bottom: 4px;
        color: var(--icon-color, var(--text-muted));
        font-size: 0.72rem;
        font-weight: var(--font-semi-medium, 500);
      }
      .dhc-calendar-popover-v2 .dhc-pop-event-text {
        white-space: pre-wrap;
      }
      .dhc-calendar-popover-v2 .dhc-pop-empty {
        color: var(--text-muted);
      }
      .dhc-calendar-popover-v2 button.dhc-open-note {
        appearance: none;
        width: 100%;
        min-height: var(--input-height, 28px);
        margin: 11px 0 0;
        padding: 6px 10px;
        border: none;
        border-radius: var(--input-radius, var(--radius-s, 8px));
        box-shadow: none;
        background: var(--interactive-normal);
        color: var(--text-normal);
        font-size: 0.76rem;
        font-weight: var(--font-semi-medium, 500);
        cursor: pointer;
        transition: background-color var(--anim-super-smooth, 75ms ease-out);
      }
      .dhc-calendar-popover-v2 button.dhc-open-note:hover {
        background: var(--interactive-hover);
      }
      body.is-mobile .dh-calendar-v2 button.dhc-nav-btn,
      body.is-tablet .dh-calendar-v2 button.dhc-nav-btn {
        min-width: 36px;
        height: 36px;
      }
      body.is-mobile .dhc-calendar-popover-v2 button.dhc-open-note,
      body.is-tablet .dhc-calendar-popover-v2 button.dhc-open-note {
        min-height: 36px;
      }
      @media (prefers-reduced-motion: reduce) {
        .dh-calendar-v2 button.dhc-day,
        .dhc-calendar-popover-v2 {
          transition: none;
          transform: none;
        }
      }
    `;

const panel = cal.createDiv({ cls: "dhc-panel" });
    const navBar = panel.createDiv({ cls: "dhc-nav" });
    const navRangeEl = navBar.createSpan({ cls: "dhc-nav-range" });
    const navControls = navBar.createDiv({ cls: "dhc-nav-controls" });
    const prevCalBtn = navControls.createEl("button", {
      cls: "dhc-nav-btn",
      text: "‹",
      attr: { type: "button", title: "На месяц назад", "aria-label": "На месяц назад" }
    });
    const resetCalBtn = navControls.createEl("button", {
      cls: "dhc-nav-btn dhc-nav-today",
      text: "Текущие",
      attr: { type: "button", title: "Вернуться к текущим месяцам" }
    });
    const nextCalBtn = navControls.createEl("button", {
      cls: "dhc-nav-btn",
      text: "›",
      attr: { type: "button", title: "На месяц вперёд", "aria-label": "На месяц вперёд" }
    });

    const monthsGrid = panel.createDiv({ cls: "dhc-months" });

    const tip = doc.body.createDiv({
      cls: "dhc-calendar-popover-v2",
      attr: {
        role: "dialog",
        "aria-label": "Сведения о дне",
        "aria-hidden": "true"
      }
    });

    tip.id = `dhc-pop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let activeCell = null;
    let pinned = false;
    let closeTimer = null;
    let frame = null;

    function cancelClose() {
      if (closeTimer !== null) {
        win.clearTimeout(closeTimer);
        closeTimer = null;
      }
    }

    function hideTip() {
      cancelClose();
      if (activeCell) {
        activeCell.setAttribute("aria-expanded", "false");
      }
      tip.classList.remove("is-open");
      tip.setAttribute("aria-hidden", "true");
      activeCell = null;
      pinned = false;
    }

    function placeTip() {
      if (!activeCell || !activeCell.isConnected) {
        hideTip();
        return;
      }

      const cellRect = activeCell.getBoundingClientRect();
      const tipWidth = tip.offsetWidth;
      const tipHeight = tip.offsetHeight;
      const viewportWidth = win.innerWidth;
      const viewportHeight = win.innerHeight;
      const margin = 10;
      const gap = 8;

      if (
        cellRect.bottom < 0 ||
        cellRect.top > viewportHeight ||
        cellRect.right < 0 ||
        cellRect.left > viewportWidth
      ) {
        hideTip();
        return;
      }

      const centeredLeft = cellRect.left + cellRect.width / 2 - tipWidth / 2;
      const left = Math.max(margin, Math.min(centeredLeft, viewportWidth - tipWidth - margin));

      const above = cellRect.top - tipHeight - gap;
      const below = cellRect.bottom + gap;
      let top = above >= margin ? above : below;
      top = Math.max(margin, Math.min(top, viewportHeight - tipHeight - margin));

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function requestPosition() {
      if (!activeCell || frame !== null) return;
      frame = win.requestAnimationFrame(() => {
        frame = null;
        placeTip();
      });
    }

    function scheduleClose() {
      cancelClose();
      if (pinned) return;

      closeTimer = win.setTimeout(() => {
        closeTimer = null;
        if (pinned) return;
        if (tip.matches(":hover")) return;
        if (tip.contains(doc.activeElement)) return;
        if (activeCell?.matches(":hover")) return;
        if (activeCell?.matches(":focus-visible")) return;
        hideTip();
      }, 180);
    }

    function showTip(cell, date, p, s, event, pin = false) {
      cancelClose();
      if (pinned && activeCell !== cell && !pin) return;
      if (activeCell && activeCell !== cell) {
        activeCell.setAttribute("aria-expanded", "false");
      }

      activeCell = cell;
      pinned = pin;

      cell.setAttribute("aria-expanded", "true");
      tip.replaceChildren();

      const accent = s !== null ? COLORS[Math.round(s) - 1] : "var(--text-muted)";
      tip.style.setProperty("--dhc-pop-accent", accent);

      tip.createDiv({
        cls: "dhc-pop-date",
        text: date.setLocale("ru").toFormat("d MMMM yyyy, cccc")
      });

      if (!p) {
        tip.createDiv({ cls: "dhc-pop-empty", text: "Нет записи" });
      } else {
        const scoreRow = tip.createDiv({ cls: "dhc-pop-score" });
        scoreRow.createSpan({ cls: "dhc-pop-label", text: "Оценка дня" });
        scoreRow.createSpan({
          cls: "dhc-pop-value",
          text: s !== null ? `${fmt(s)}/10` : "Не заполнена"
        });

        const eventBox = tip.createDiv({ cls: "dhc-pop-event" });
        eventBox.createDiv({ cls: "dhc-pop-event-label", text: "Главное событие" });
        eventBox.createDiv({
          cls: `dhc-pop-event-text${event ? "" : " dhc-pop-empty"}`,
          text: event || "Не записано"
        });

        const openButton = tip.createEl("button", {
          cls: "dhc-open-note",
          text: "Открыть запись",
          attr: { type: "button" }
        });

        openButton.onclick = e => {
          e.stopPropagation();
          hideTip();
          open(p);
        };
      }

      tip.setAttribute("aria-hidden", "false");
      placeTip();
      tip.classList.add("is-open");
    }

    tip.addEventListener("pointerenter", cancelClose);
    tip.addEventListener("pointerleave", scheduleClose);
    tip.addEventListener("focusin", cancelClose);
    tip.addEventListener("focusout", scheduleClose);

    dv.component.registerDomEvent(doc, "pointerdown", e => {
      if (activeCell && !activeCell.contains(e.target) && !tip.contains(e.target)) {
        hideTip();
      }
    });

    dv.component.registerDomEvent(doc, "keydown", e => {
      if (e.key !== "Escape" || !activeCell) return;
      const cell = activeCell;
      const focusWasInTip = tip.contains(doc.activeElement);
      hideTip();
      if (focusWasInTip) {
        cell.focus({ preventScroll: true });
        hideTip();
      }
    });

    dv.component.registerDomEvent(win, "resize", requestPosition);
    dv.component.registerDomEvent(doc, "scroll", requestPosition, true);

    dv.component.register(() => {
      cancelClose();
      if (frame !== null) win.cancelAnimationFrame(frame);
      tip.remove();
    });

if (typeof win.__dhDiaryCalOffset !== "number" || !Number.isFinite(win.__dhDiaryCalOffset) || win.__dhDiaryCalOffset > 0) {
      win.__dhDiaryCalOffset = 0;
    }

    const capMonth = (d) => {
      const s = d.setLocale("ru").toFormat("LLLL yyyy");
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    function renderCalendarMonths() {
      hideTip();
      monthsGrid.replaceChildren();

      const offset = win.__dhDiaryCalOffset;
      const anchorMonthStart = today.startOf("month").plus({ months: offset });
      const displayMonths = [
        anchorMonthStart.minus({ months: 2 }),
        anchorMonthStart.minus({ months: 1 }),
        anchorMonthStart
      ];

      navRangeEl.textContent = `${capMonth(displayMonths[0])} — ${capMonth(displayMonths[2])}`;
      nextCalBtn.disabled = offset >= 0;
      resetCalBtn.style.display = offset < 0 ? "inline-flex" : "none";

      for (const monthDate of displayMonths) {
        const monthBox = monthsGrid.createDiv({ cls: "dhc-month" });
        const monthTitle = monthDate.setLocale("ru").toFormat("LLLL yyyy");

      monthBox.createDiv({
        cls: "dhc-title",
        text: monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1)
      });

      const header = monthBox.createDiv({ cls: "dhc-weekdays" });
      for (const weekday of WEEKDAYS) {
        header.createSpan({ text: weekday });
      }

      const grid = monthBox.createDiv({ cls: "dhc-days" });
      const firstWeekday = monthDate.startOf("month").weekday;

      for (let i = 1; i < firstWeekday; i++) {
        grid.createDiv({ cls: "dhc-spacer", attr: { "aria-hidden": "true" } });
      }

      for (let day = 1; day <= monthDate.daysInMonth; day++) {
        const date = monthDate.set({ day });
        const iso = date.toISODate();
        const isFuture = date > today;
        const isToday = iso === todayISO;
        const p = isFuture ? null : byDate.get(iso);
        const s = p ? score(p.оценка_дня) : null;
        const hasTraining = p?.тренировка === true;

        const event = p && typeof p.главное_событие === "string"
          ? p.главное_событие.trim()
          : "";

        const cell = grid.createEl("button", {
          cls: "dhc-day",
          attr: { type: "button" }
        });

        cell.classList.toggle("has-entry", Boolean(p));
        cell.classList.toggle("has-score", s !== null);
        cell.classList.toggle("is-today", isToday);
        cell.classList.toggle("is-future", isFuture);

        if (s !== null) {
          const color = COLORS[Math.round(s) - 1];
          cell.style.setProperty("--day-color", color);
          cell.style.setProperty("--day-background", `${color}33`);
        }

        const status = isFuture
          ? "Будущий день"
          : !p
            ? "Нет записи"
            : s === null
              ? "Оценка не заполнена"
              : `Оценка ${fmt(s)} из 10`;

        cell.setAttribute(
          "aria-label",
          [
            date.toFormat("dd.MM.yyyy"),
            isToday ? "Сегодня" : "",
            status,
            hasTraining ? "Была тренировка" : ""
          ].filter(Boolean).join(" · ")
        );

        if (isToday) {
          cell.setAttribute("aria-current", "date");
        }

        cell.createSpan({ text: String(day) });

        if (hasTraining) {
          renderIcon(cell, "dumbbell", "dh-icon dhc-training");
        }

        if (isFuture) {
          cell.disabled = true;
          continue;
        }

        cell.setAttribute("aria-haspopup", "dialog");
        cell.setAttribute("aria-expanded", "false");
        cell.setAttribute("aria-controls", tip.id);

        let pointerType = "";
        cell.addEventListener("pointerdown", e => {
          pointerType = e.pointerType;
        });

        cell.addEventListener("pointerenter", e => {
          if (e.pointerType !== "mouse") return;
          if (activeCell === cell && pinned) {
            cancelClose();
            return;
          }
          showTip(cell, date, p, s, event);
        });

        cell.addEventListener("pointerleave", e => {
          if (e.pointerType === "mouse") scheduleClose();
        });

        cell.addEventListener("focus", () => {
          if (cell.matches(":focus-visible")) {
            showTip(cell, date, p, s, event);
          }
        });

        cell.addEventListener("blur", scheduleClose);

cell.addEventListener("click", e => {
          const isMouseClick = e.detail > 0 && pointerType === "mouse";
          if (isMouseClick && p) {
            hideTip();
            open(p);
            return;
          }
          if (activeCell === cell && pinned) {
            hideTip();
          } else {
            showTip(cell, date, p, s, event, true);
          }
        });
      }
      }
    }

    prevCalBtn.onmousedown = e => e.preventDefault();
    nextCalBtn.onmousedown = e => e.preventDefault();
    resetCalBtn.onmousedown = e => e.preventDefault();

    prevCalBtn.onclick = () => {
      win.__dhDiaryCalOffset -= 1;
      renderCalendarMonths();
    };
    nextCalBtn.onclick = () => {
      if (win.__dhDiaryCalOffset < 0) {
        win.__dhDiaryCalOffset += 1;
        renderCalendarMonths();
      }
    };
    resetCalBtn.onclick = () => {
      win.__dhDiaryCalOffset = 0;
      renderCalendarMonths();
    };

    renderCalendarMonths();

    const legend = panel.createDiv({ cls: "dhc-legend" });
    legend.createSpan({ text: "Оценка: 1" });

    for (const color of COLORS) {
      const swatch = legend.createSpan({
        cls: "dhc-swatch",
        attr: { "aria-hidden": "true" }
      });
      swatch.style.backgroundColor = color;
    }

    legend.createSpan({ text: "10" });
    legend.createSpan({ cls: "dhc-swatch dhc-no-score", attr: { "aria-hidden": "true" } });
    legend.createSpan({ text: "запись без оценки" });
    const trLegend = legend.createSpan({ cls: "dh-inline-meta" });
    trLegend.createSpan({ text: "·" });
    renderIcon(trLegend, "dumbbell", "dh-icon dh-icon-xs");
    trLegend.createSpan({ text: "— тренировка" });
  }

  // Привычки и сводки за месяц / год
  {
    const HABIT_MIN_WEEK_MARKED = 4;
    const HABIT_MAX_WEEK_GAP = 2;
    const HABIT_MIN_WEEK_NUMERIC = 3;
    const HABIT_MIN_MONTH_MARKED = 8;
    const HABIT_MIN_MONTH_NUMERIC = 5;
    const HABIT_MIN_GROUP_SIZE = 4;

let analyticsSectionEl = null;
    let summariesSectionEl = null;

    // Витрина аналитики: расчёты выполняет my-correlation-analytics
    {
      const analytics = root.createDiv({ cls: "dh-diary-analytics" });
      analyticsSectionEl = analytics;
      const styles = analytics.createEl("style");
      styles.textContent = `
        .dashboard-home .dh-diary-analytics {
          margin: 16px 0;
          padding: calc(var(--vl-layout-padding, 8px) + 6px) calc(var(--vl-layout-padding, 8px) + 8px);
          border: none;
          border-radius: calc(var(--radius-ml, 14px) + 2px);
          background: var(--trans-faint-05, var(--background-secondary));
          box-shadow:
            var(--glass-base-m, none),
            0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
            var(--shadow-setting-items, none);
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dashboard-home .dh-diary-analytics .dda-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .dashboard-home .dh-diary-analytics .dda-head-left {
          display: flex;
          align-items: baseline;
          gap: 8px;
          min-width: 0;
        }
        .dashboard-home .dh-diary-analytics .dda-title {
          font-size: 0.92rem;
          font-weight: var(--font-semibold, 600);
          font-variation-settings: "opsz" 24;
          color: var(--color-base-100, var(--text-normal));
        }
        .dashboard-home .dh-diary-analytics .dda-period {
          font-size: 0.72rem;
          color: var(--text-faint);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .dashboard-home .dh-diary-analytics button.dda-btn {
          appearance: none;
          border: none;
          outline: none;
          box-shadow: none;
          contain: content;
          height: 28px;
          padding: 0 11px;
          border-radius: var(--radius-s, 8px);
          background: var(--interactive-normal);
          color: var(--text-normal);
          font-family: var(--font-interface);
          font-size: 0.74rem;
          font-weight: var(--font-semi-medium, 500);
          text-box-trim: trim-both;
          text-box-edge: cap alphabetic;
          cursor: pointer;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
          transition:
            background-color var(--anim-super-smooth, 75ms ease-out),
            color var(--anim-super-smooth, 75ms ease-out);
        }
        .dashboard-home .dh-diary-analytics button.dda-btn:hover {
          background: var(--interactive-hover);
          color: var(--color-accent-1, var(--text-accent));
        }
        .dashboard-home .dh-diary-analytics button.dda-btn:active {
          filter: opacity(65%);
        }
        .dashboard-home .dh-diary-analytics .dda-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
          gap: 8px;
        }
        .dashboard-home .dh-diary-analytics .dda-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 12px;
          border: none;
          border-radius: var(--radius-sm, 10px);
          background: var(--background-primary);
          box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
          min-width: 0;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
        }
        .dashboard-home .dh-diary-analytics .dda-card-label {
          font-size: 0.78rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--text-normal);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dashboard-home .dh-diary-analytics .dda-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 8px;
          border-radius: var(--pill-radius, var(--radius-l, 18px));
          font-size: 0.72rem;
          font-weight: var(--font-bold, 700);
          font-variant-numeric: tabular-nums;
          text-box-trim: trim-both;
          text-box-edge: cap alphabetic;
          white-space: nowrap;
          flex-shrink: 0;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
          color: var(--icon-color, var(--text-muted));
          background: var(--trans-faint-10, var(--background-secondary));
          box-shadow: inset 0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border));
        }
        .dashboard-home .dh-diary-analytics .dda-badge.is-up {
          color: var(--color-green, #4aab80);
          background: color-mix(in oklab, var(--color-green, #4aab80) 14%, transparent);
          box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--color-green, #4aab80) 35%, transparent);
        }
        .dashboard-home .dh-diary-analytics .dda-badge.is-down {
          color: var(--color-red, #d85b57);
          background: color-mix(in oklab, var(--color-red, #d85b57) 14%, transparent);
          box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--color-red, #d85b57) 35%, transparent);
        }
        .dashboard-home .dh-diary-analytics .dda-empty {
          font-size: 0.76rem;
          color: var(--text-faint);
          padding: 2px 0;
        }
        body.is-mobile .dashboard-home .dh-diary-analytics button.dda-btn,
        body.is-tablet .dashboard-home .dh-diary-analytics button.dda-btn {
          min-height: 36px;
          height: 36px;
          padding: 0 14px;
          font-size: 0.8rem;
        }
      `;

      const head = analytics.createDiv({ cls: "dda-head" });
      const headLeft = head.createDiv({ cls: "dda-head-left" });
      headLeft.createSpan({ cls: "dda-title", text: "Аналитика связей" });
      const periodEl = headLeft.createSpan({ cls: "dda-period" });
      const action = head.createEl("button", { cls: "dda-btn", text: "Открыть →", attr: { type: "button" } });

      const host = analytics.createDiv({ cls: "dda-list" });

      const getPlugin = () => app.plugins?.plugins?.["my-correlation-analytics"] || window.__myCorrelationAnalytics;
      const notifyUser = text => { try { new Notice(text); } catch { console.log(text); } };

      action.onclick = () => {
        const plugin = getPlugin();
        if (!plugin || typeof plugin.openAnalyticsReport !== "function") {
          notifyUser("Включи плагин Correlation Analytics (my-correlation-analytics).");
          return;
        }
        try { plugin.openAnalyticsReport(30); }
        catch (error) { notifyUser("Не удалось открыть аналитику: " + String(error)); }
      };

      const addCard = (label, badgeText, isUp, tooltip) => {
        const card = host.createDiv({ cls: "dda-card", attr: { title: tooltip } });
        card.createSpan({ cls: "dda-card-label", text: label });
        card.createSpan({ cls: `dda-badge ${isUp ? "is-up" : "is-down"}`, text: badgeText });
      };

      try {
        const plugin = getPlugin();
        if (!plugin || typeof plugin.getReport !== "function") {
          host.createDiv({ cls: "dda-empty", text: "Включи плагин my-correlation-analytics." });
        } else {
          const report = plugin.getReport(30);
          const count = Number.isFinite(report.totalRecords) ? report.totalRecords : 0;
          periodEl.textContent = `30 дн. · ${count} зап.`;

          const corr = Array.isArray(report.topCorrelations) ? report.topCorrelations : [];
          const habits = Array.isArray(report.topHabitImpacts) ? report.topHabitImpacts : [];
          let shown = 0;

          for (const item of corr) {
            if (shown >= 2) break;
            if (Math.abs(item.r) < 0.25) continue;
            const badge = item.valueBadge ?? `r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)}`;
            const isUp = item.isPositive ?? item.r > 0;
            addCard(item.label, badge, isUp, `${item.label} · n = ${item.sampleCount} дн.`);
            shown++;
          }

          for (const item of habits) {
            if (shown >= 3) break;
            if (Math.abs(item.delta) < 0.2) continue;
            const target = item.targetMetric === "score" ? "Оценка" : "Энергия";
            const isUp = item.delta > 0;
            addCard(
              `${item.habitName} → ${target}`,
              `${isUp ? "+" : ""}${item.delta.toFixed(1)}`,
              isUp,
              `С привычкой: ${item.avgWhenTrue.toFixed(1)} / Без: ${item.avgWhenFalse.toFixed(1)} (n = ${item.countTrue + item.countFalse} дн.)`
            );
            shown++;
          }

          if (!shown) {
            host.createDiv({ cls: "dda-empty", text: "Мало данных за 30 дней." });
          }
        }
      } catch {
        host.createDiv({ cls: "dda-empty", text: "Загрузка аналитики..." });
      }
    }

// Итог за месяц и Итог за год
    {
      const summariesRoot = root.createDiv({ cls: "dh-period-summaries" });
      summariesSectionEl = summariesRoot;
      const doc = summariesRoot.ownerDocument;
      const win = doc.defaultView || window;

      const styleEl = summariesRoot.createEl("style");
      styleEl.textContent = `
        .dh-period-summaries {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin: 16px 0;
          font-variant-numeric: tabular-nums;
        }
        .dh-period-summaries .dhps-panel {
          border: none;
          border-radius: calc(var(--radius-ml, 14px) + 2px);
          background: var(--trans-faint-05, var(--background-secondary));
          box-shadow:
            var(--glass-base-m, none),
            0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
            var(--shadow-setting-items, none);
          overflow: hidden;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
        }
        .dh-period-summaries .dhps-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          padding: calc(var(--vl-layout-padding, 8px) + 4px) calc(var(--vl-layout-padding, 8px) + 8px);
          cursor: pointer;
          user-select: none;
          transition: background-color var(--anim-super-smooth, 75ms ease-out);
        }
        .dh-period-summaries .dhps-header:hover {
          background: var(--background-modifier-hover);
        }
        .dh-period-summaries .dhps-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .dh-period-summaries .dhps-arrow {
          display: inline-block;
          font-size: 0.72rem;
          color: var(--icon-color, var(--text-muted));
          transition: transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries .dhps-panel.is-open .dhps-arrow {
          transform: rotate(90deg);
        }
        .dh-period-summaries .dhps-title {
          font-weight: var(--font-semibold, 600);
          font-variation-settings: "opsz" 24;
          font-size: 0.96rem;
          color: var(--color-base-100, var(--text-normal));
        }
        .dh-period-summaries .dhps-sub {
          font-size: 0.74rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--icon-color, var(--text-muted));
          padding: 2px 8px;
          border-radius: var(--pill-radius, var(--radius-l, 18px));
          background: var(--pill-background, var(--code-background));
        }
        .dh-period-summaries .dhps-controls {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .dh-period-summaries button.dhps-nav-btn {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 30px;
          height: 30px;
          margin: 0;
          padding: 0 7px;
          border: none;
          border-radius: var(--radius-xxl, 22px);
          background: transparent;
          color: var(--control-icon-color, var(--icon-color));
          font-size: 1rem;
          font-weight: var(--font-semi-medium, 500);
          line-height: 1;
          cursor: pointer;
          box-shadow: none;
          transition:
            background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
            box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
            color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries button.dhps-nav-btn:hover:not(:disabled) {
          background: var(--control-icon-background, var(--background-modifier-hover));
          box-shadow: var(--control-icon-shadow, none);
          color: var(--text-normal);
        }
        .dh-period-summaries button.dhps-nav-btn:disabled {
          filter: opacity(0.3125);
          cursor: default;
        }
        .dh-period-summaries .dhps-period-label {
          min-width: 96px;
          text-align: center;
          font-size: 0.84rem;
          font-weight: var(--font-semibold, 600);
          color: var(--color-base-100, var(--text-normal));
          padding: 0 4px;
        }
        .dh-period-summaries select.dhps-select {
          height: 30px;
          padding: 0 24px 0 10px;
          border: none;
          outline: none;
          border-radius: var(--input-radius, var(--radius-s, 8px));
          background: var(--background-primary);
          box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border)));
          color: var(--text-normal);
          font-size: 0.78rem;
          font-weight: var(--font-semi-medium, 500);
          cursor: pointer;
          transition: box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries select.dhps-select:focus {
          box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent));
        }
        .dh-period-summaries .dhps-body {
          display: none;
          flex-direction: column;
          gap: 12px;
          padding: 0 15px 15px;
          border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
        }
        .dh-period-summaries .dhps-panel.is-open .dhps-body {
          display: flex;
          padding-top: 13px;
        }
        .dh-period-summaries .dhps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 215px), 1fr));
          gap: 10px;
        }
        .dh-period-summaries .dhps-card {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 11px 13px;
          border: none;
          border-radius: var(--radius-sm, 10px);
          background: var(--background-primary);
          box-shadow:
            inset 0 2px 0 0 color-mix(in oklab, var(--dhps-accent, var(--trans-faint-30)) 70%, transparent),
            var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
          min-width: 0;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
        }
        .dh-period-summaries .dhps-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
        }
        .dh-period-summaries .dhps-card-label {
          font-size: 0.74rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--icon-color, var(--text-muted));
        }
        .dh-period-summaries .dhps-delta {
          font-size: 0.7rem;
          font-weight: var(--font-semi-medium, 500);
          padding: 2px 7px;
          border-radius: var(--pill-radius, var(--radius-l, 18px));
          white-space: nowrap;
          background: var(--pill-background, var(--code-background));
          color: var(--text-muted);
        }
        .dh-period-summaries .dhps-delta.is-good {
          color: var(--color-green, #4aab80);
          background: color-mix(in oklab, var(--color-green, #4aab80) 14%, transparent);
        }
        .dh-period-summaries .dhps-delta.is-bad {
          color: var(--color-red, #d85b57);
          background: color-mix(in oklab, var(--color-red, #d85b57) 14%, transparent);
        }
        .dh-period-summaries .dhps-card-main {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dh-period-summaries .dhps-card-val {
          font-size: 1.2rem;
          font-weight: var(--font-bold, 700);
          line-height: 1.2;
          color: var(--color-base-100, var(--text-normal));
        }
        .dh-period-summaries .dhps-card-unit {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .dh-period-summaries .dhps-card-rows {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-top: 3px;
          padding-top: 6px;
          border-top: 1px solid var(--trans-faint-10, var(--background-modifier-border));
          font-size: 0.72rem;
        }
        .dh-period-summaries .dhps-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
        }
        .dh-period-summaries .dhps-row-k {
          color: var(--text-muted);
        }
        .dh-period-summaries .dhps-row-v {
          color: var(--text-normal);
          font-weight: var(--font-semi-medium, 500);
          text-align: right;
        }
        .dh-period-summaries a.dhps-note-link {
          color: var(--color-accent-1, var(--text-accent));
          text-decoration: none;
          font-weight: var(--font-semibold, 600);
          cursor: pointer;
        }
        .dh-period-summaries a.dhps-note-link:hover {
          text-decoration: underline;
        }
        .dh-period-summaries .dhps-dist-bar {
          display: grid;
          grid-template-columns: repeat(10, minmax(0, 1fr));
          gap: 3px;
          margin-top: 4px;
        }
        .dh-period-summaries .dhps-dist-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .dh-period-summaries .dhps-dist-swatch {
          width: 100%;
          height: 7px;
          border-radius: 3px;
          background: var(--step-color);
          opacity: 0.2;
        }
        .dh-period-summaries .dhps-dist-step.has-count .dhps-dist-swatch {
          opacity: 1;
        }
        .dh-period-summaries .dhps-dist-num {
          font-size: 0.63rem;
          line-height: 1;
          color: var(--text-faint);
        }
        .dh-period-summaries .dhps-dist-step.has-count .dhps-dist-num {
          color: var(--text-normal);
          font-weight: var(--font-semi-medium, 500);
        }
        .dh-period-summaries .dhps-subbox {
          padding: 11px 13px;
          border: none;
          border-radius: var(--radius-sm, 10px);
          background: var(--background-primary);
          box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
        }
        .dh-period-summaries .dhps-subbox-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .dh-period-summaries .dhps-subbox-title {
          font-size: 0.76rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--icon-color, var(--text-muted));
        }
        .dh-period-summaries .dhps-subbox-hint {
          font-size: 0.7rem;
          color: var(--text-faint);
        }
        .dh-period-summaries .dhps-bars {
          display: grid;
          gap: 4px;
          align-items: end;
          width: 100%;
          padding-top: 2px;
        }
        .dh-period-summaries .dhps-bar-col,
        .dh-period-summaries button.dhps-bar-col {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 4px;
          width: 100% !important;
          min-width: 0 !important;
          height: auto !important;
          min-height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          font-family: inherit;
          cursor: default;
        }
        .dh-period-summaries button.dhps-bar-col.is-clickable {
          cursor: pointer;
        }
        .dh-period-summaries .dhps-bar-track {
          position: relative;
          width: 100%;
          height: 76px;
          flex: 0 0 76px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
          border-radius: var(--radius-xs, 6px);
          background: var(--trans-faint-05, color-mix(in srgb, var(--text-normal) 4%, transparent));
          overflow: hidden;
          transition: background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries button.dhps-bar-col.is-clickable:hover .dhps-bar-track {
          background: var(--trans-faint-20, var(--background-modifier-hover));
        }
        .dh-period-summaries .dhps-bar-col.is-future .dhps-bar-track {
          opacity: 0.35;
        }
        .dh-period-summaries .dhps-bar-fill {
          width: 100%;
          border-radius: 5px 5px 2px 2px;
          background: var(--bar-color);
          opacity: 0.88;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 2px;
          transition: opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries button.dhps-bar-col.is-clickable:hover .dhps-bar-fill {
          opacity: 1;
        }
        .dh-period-summaries .dhps-bar-val {
          font-size: 0.62rem;
          font-weight: var(--font-bold, 700);
          line-height: 1;
          color: #141619;
          user-select: none;
        }
        .dh-period-summaries .dhps-bar-stub {
          width: 55%;
          height: 3px;
          margin-bottom: 3px;
          border-radius: 99px;
          background: var(--text-faint);
          opacity: 0.55;
        }
        .dh-period-summaries .dhps-bar-day {
          font-size: 0.63rem;
          line-height: 1;
          color: var(--text-faint);
          user-select: none;
        }
        .dh-period-summaries .dhps-bar-col.is-today .dhps-bar-day {
          color: var(--color-accent-1, var(--interactive-accent));
          font-weight: var(--font-bold, 700);
        }
        @media (max-width: 640px) {
          .dh-period-summaries .dhps-bars {
            gap: 2px;
          }
          .dh-period-summaries .dhps-bar-val {
            display: none;
          }
          .dh-period-summaries .dhps-bar-day.is-minor {
            visibility: hidden;
          }
        }
        .dh-period-summaries .dhps-habits-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 175px), 1fr));
          gap: 8px;
        }
        .dh-period-summaries .dhps-habit-chip {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 9px 11px;
          border: none;
          border-radius: var(--radius-s, 8px);
          background: var(--trans-faint-05, var(--background-secondary));
          box-shadow:
            inset 2.5px 0 0 0 color-mix(in oklab, var(--h-color) 85%, transparent),
            inset 0 0 0 0.5px var(--trans-faint-10, transparent);
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
        }
        .dh-period-summaries .dhps-habit-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
        }
        .dh-period-summaries .dhps-habit-name {
          font-size: 0.76rem;
          font-weight: var(--font-semibold, 600);
          color: var(--color-base-100, var(--text-normal));
        }
        .dh-period-summaries .dhps-habit-rate {
          font-size: 0.78rem;
          font-weight: var(--font-bold, 700);
          color: var(--h-color);
        }
        .dh-period-summaries .dhps-habit-meta {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          font-size: 0.69rem;
          color: var(--text-muted);
        }
        .dh-period-summaries .dhps-months-strip {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 6px;
        }
        .dh-period-summaries button.dhps-mcol {
          appearance: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          gap: 3px;
          min-height: 68px;
          height: auto;
          margin: 0;
          padding: 6px 4px;
          border: none;
          border-radius: var(--radius-s, 8px);
          background: var(--trans-faint-05, var(--background-secondary));
          box-shadow: inset 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
          color: var(--text-normal);
          font-family: inherit;
          cursor: pointer;
          -electron-corner-smoothing: var(--corner-smoothing, 60%);
          transition:
            box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
            transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
            background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries button.dhps-mcol:hover:not(:disabled) {
          background: var(--trans-faint-10, var(--background-modifier-hover));
          box-shadow: 0 0 0 1px var(--color-accent-3, var(--interactive-accent));
          transform: translateY(-1px);
        }
        .dh-period-summaries button.dhps-mcol:disabled {
          opacity: 0.32;
          cursor: default;
        }
        .dh-period-summaries button.dhps-mcol.is-selected {
          box-shadow: var(--shadow-input-active, 0 0 0 2px var(--interactive-accent));
        }
        .dh-period-summaries button.dhps-mcol.is-best {
          background: color-mix(in oklab, var(--color-green, #4aab80) 12%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-green, #4aab80) 55%, transparent);
        }
        .dh-period-summaries button.dhps-mcol.is-worst {
          background: color-mix(in oklab, var(--color-red, #d85b57) 12%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-red, #d85b57) 55%, transparent);
        }
        .dh-period-summaries .dhps-mcol-name {
          font-size: 0.69rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--icon-color, var(--text-muted));
          text-transform: capitalize;
        }
        .dh-period-summaries .dhps-mcol-score {
          font-size: 0.84rem;
          font-weight: var(--font-bold, 700);
          line-height: 1.1;
        }
        .dh-period-summaries .dhps-mcol-energy {
          font-size: 0.66rem;
          color: var(--text-muted);
        }
        .dh-period-summaries .dhps-mcol-tag {
          font-size: 0.58rem;
          font-weight: var(--font-semibold, 600);
          padding: 1px 5px;
          border-radius: var(--radius-l, 18px);
          line-height: 1.3;
        }
        .dh-period-summaries .dhps-mcol-tag.is-best {
          color: var(--color-green, #4aab80);
          background: color-mix(in oklab, var(--color-green, #4aab80) 18%, transparent);
        }
        .dh-period-summaries .dhps-mcol-tag.is-worst {
          color: var(--color-red, #d85b57);
          background: color-mix(in oklab, var(--color-red, #d85b57) 18%, transparent);
        }
        .dh-period-summaries .dhps-year-heatmap {
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding-bottom: 2px;
        }
        .dh-period-summaries .dhps-year-heatmap::-webkit-scrollbar {
          display: none;
        }
        .dh-period-summaries .dhps-yh-row {
          display: grid;
          grid-template-columns: 36px repeat(31, minmax(14px, 1fr));
          gap: 3px;
          align-items: center;
          min-width: 520px;
        }
        .dh-period-summaries .dhps-yh-row.is-head {
          margin-bottom: 2px;
        }
        .dh-period-summaries .dhps-yh-day-num {
          font-size: 0.62rem;
          line-height: 1;
          text-align: center;
          color: var(--text-faint);
          user-select: none;
        }
        .dh-period-summaries .dhps-yh-label {
          font-size: 0.7rem;
          font-weight: var(--font-semi-medium, 500);
          color: var(--icon-color, var(--text-muted));
          text-transform: capitalize;
          white-space: nowrap;
          user-select: none;
        }
        .dh-period-summaries .dhps-yh-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 18px;
          border-radius: 4px;
          background: var(--trans-faint-05, color-mix(in srgb, var(--text-normal) 4%, transparent));
          border: none;
          box-sizing: border-box;
          transition: opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
        }
        .dh-period-summaries .dhps-yh-cell.is-invalid {
          background: transparent;
        }
        .dh-period-summaries .dhps-yh-cell.is-future {
          opacity: 0.28;
        }
        .dh-period-summaries .dhps-yh-cell.has-entry {
          cursor: pointer;
          box-shadow: inset 0 0 0 1px var(--trans-faint-30, var(--text-faint));
          background: var(--trans-faint-10, var(--background-primary));
        }
        .dh-period-summaries .dhps-yh-cell.has-score {
          cursor: pointer;
          box-shadow: none;
          background: var(--cell-color);
          opacity: 0.88;
        }
        .dh-period-summaries .dhps-yh-cell.has-score:hover {
          opacity: 1;
        }
        .dh-period-summaries .dhps-yh-val {
          font-size: 0.62rem;
          font-weight: var(--font-bold, 700);
          line-height: 1;
          color: #141619;
          user-select: none;
        }
        .dh-period-summaries .dhps-yh-cell.is-today {
          box-shadow: 0 0 0 1.5px var(--interactive-accent);
        }
        body.is-mobile .dh-period-summaries button.dhps-nav-btn,
        body.is-mobile .dh-period-summaries select.dhps-select,
        body.is-tablet .dh-period-summaries button.dhps-nav-btn,
        body.is-tablet .dh-period-summaries select.dhps-select {
          height: 36px;
          min-width: 36px;
        }
        @media (max-width: 680px) {
          .dh-period-summaries .dhps-yh-val {
            display: none;
          }
        }
        @media (max-width: 820px) {
          .dh-period-summaries .dhps-months-strip {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .dh-period-summaries .dhps-months-strip {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .dh-period-summaries .dhps-grid {
            grid-template-columns: 1fr;
          }
        }
      `;

      // Доступные месяцы и годы по фактическим записям
      const currentMonthKey = todayISO.slice(0, 7);
      const minEntryISO = entries.length ? entries[entries.length - 1][0] : todayISO;
      const minMonthStart = dv.date(minEntryISO).startOf("month");
      const maxMonthStart = today.startOf("month");

      const availableMonths = [];
      let mCursor = minMonthStart;
      while (mCursor <= maxMonthStart) {
        availableMonths.push(mCursor.toFormat("yyyy-MM"));
        mCursor = mCursor.plus({ months: 1 });
      }
      if (!availableMonths.includes(currentMonthKey)) {
        availableMonths.push(currentMonthKey);
      }

      const yearSet = new Set(entries.map(([iso]) => Number(iso.slice(0, 4))));
      if (yearSet.size === 0) yearSet.add(today.year);
      const availableYears = [...yearSet].sort((a, b) => a - b);

      if (!win.__dhDiarySummaryState || typeof win.__dhDiarySummaryState !== "object") {
        win.__dhDiarySummaryState = {
          monthKey: currentMonthKey,
          year: availableYears.includes(today.year) ? today.year : availableYears[availableYears.length - 1],
          monthOpen: true,
          yearOpen: false
        };
      }
      const sumState = win.__dhDiarySummaryState;
      if (!availableMonths.includes(sumState.monthKey)) {
        sumState.monthKey = currentMonthKey;
      }
      if (!availableYears.includes(sumState.year)) {
        sumState.year = availableYears.includes(today.year) ? today.year : availableYears[availableYears.length - 1];
      }

      const monthCache = new Map();
      const yearCache = new Map();

      function computeRangeMetrics(startDate, endDate) {
        const startISO = startDate.toISODate();
        const endISO = endDate.toISODate();
        const totalCalendarDays = Math.round(endDate.diff(startDate, "days").days) + 1;
        const effectiveEnd = endDate > today ? today : endDate;
        const elapsedDays = effectiveEnd >= startDate
          ? Math.round(effectiveEnd.diff(startDate, "days").days) + 1
          : 0;

        const daySlots = [];
        const scoreItems = [];
        const energyItems = [];
        const weightItems = [];
        const calorieItems = [];
        const proteinItems = [];
        const fatItems = [];
        const carbItems = [];
        const sleepItems = [];
        const pagesItems = [];
        const socialItems = [];
        const stepsItems = [];
        const goalsItems = [];
        let eventsCount = 0;
        let recordsCount = 0;
        const dist = Array(10).fill(0);

        for (let i = 0; i < totalCalendarDays; i++) {
          const d = startDate.plus({ days: i });
          const iso = d.toISODate();
          const isFuture = iso > todayISO;
          const p = (!isFuture && iso >= startISO && iso <= endISO) ? (byDate.get(iso) || null) : null;
          const s = p ? score(p.оценка_дня) : null;
          const e = p ? score(p.энергия) : null;

          daySlots.push({ day: d.day, month: d.month, date: d, iso, isFuture, page: p, score: s, energy: e });

          if (!p) continue;
          recordsCount++;

          if (s !== null) {
            scoreItems.push({ date: d, iso, page: p, val: s });
            dist[Math.min(9, Math.max(0, Math.round(s) - 1))]++;
          }
          if (e !== null) energyItems.push({ date: d, iso, page: p, val: e });

          const w = getWeight(p);
          if (w !== null) weightItems.push({ date: d, iso, page: p, val: w });

          const cal = getCalories(p);
          if (cal !== null) calorieItems.push(cal);

          const pr = getProtein(p);
          if (pr !== null) proteinItems.push(pr);
          const ft = getFat(p);
          if (ft !== null) fatItems.push(ft);
          const cb = getCarbs(p);
          if (cb !== null) carbItems.push(cb);

          const sl = getSleepHours(p);
          if (sl !== null) sleepItems.push(sl);

          const pg = getPagesRead(p);
          if (pg !== null && pg > 0) pagesItems.push(pg);

          const soc = getSocialMin(p);
          if (soc !== null) socialItems.push(soc);

          const st = getSteps(p);
          if (st !== null && st > 0) stepsItems.push(st);

          const gl = getDayGoalsInfo(p);
          if (gl !== null) goalsItems.push(gl);

          if (typeof p.главное_событие === "string" && p.главное_событие.trim() !== "") {
            eventsCount++;
          }
        }

        const scoreVals = scoreItems.map(x => x.val);
        const meanScore = average(scoreVals);
        let bestDay = null;
        let worstDay = null;
        for (const item of scoreItems) {
          if (!bestDay || item.val > bestDay.val) bestDay = item;
          if (!worstDay || item.val < worstDay.val) worstDay = item;
        }

        const energyVals = energyItems.map(x => x.val);
        const meanEnergy = average(energyVals);
        let energyHalfDelta = null;
        if (energyItems.length >= 4) {
          const half = Math.floor(energyItems.length / 2);
          const firstHalf = average(energyItems.slice(0, half).map(x => x.val));
          const secondHalf = average(energyItems.slice(half).map(x => x.val));
          if (firstHalf !== null && secondHalf !== null) {
            energyHalfDelta = secondHalf - firstHalf;
          }
        }

        const firstWeight = weightItems.length ? weightItems[0] : null;
        const lastWeight = weightItems.length ? weightItems[weightItems.length - 1] : null;
        const weightChange = (firstWeight && lastWeight && weightItems.length >= 2)
          ? lastWeight.val - firstWeight.val
          : null;
        const meanWeight = average(weightItems.map(x => x.val));

        const meanCalories = average(calorieItems);
        const meanProtein = average(proteinItems);
        const meanFat = average(fatItems);
        const meanCarbs = average(carbItems);
        const meanSleep = average(sleepItems);
        const minSleep = sleepItems.length ? Math.min(...sleepItems) : null;
        const maxSleep = sleepItems.length ? Math.max(...sleepItems) : null;

        const sumPages = pagesItems.reduce((a, b) => a + b, 0);
        const meanPagesReadDay = average(pagesItems);

        const meanSocial = average(socialItems);
        const socialInLimitDays = socialItems.filter(v => v <= SOCIAL_LIMIT_MIN).length;

        const sumSteps = stepsItems.reduce((a, b) => a + b, 0);
        const meanSteps = average(stepsItems);

        const sumGoals = goalsItems.reduce((a, b) => a + b, 0);

        const habitsStats = {};
        for (const h of HABITS) {
          let doneCount = 0;
          let markedCount = 0;
          let bestStreak = 0;
          let curRun = 0;
          let endStreak = 0;

          for (const slot of daySlots) {
            if (slot.isFuture) continue;
            const stVal = state(slot.page, h.key);
            if (stVal !== null) markedCount++;
            if (stVal === true) {
              doneCount++;
              curRun++;
              if (curRun > bestStreak) bestStreak = curRun;
            } else {
              curRun = 0;
            }
          }

          for (let i = daySlots.length - 1; i >= 0; i--) {
            if (daySlots[i].isFuture) continue;
            if (state(daySlots[i].page, h.key) === true) {
              endStreak++;
            } else {
              if (daySlots[i].iso === todayISO && state(daySlots[i].page, h.key) === null) continue;
              break;
            }
          }

          const pctCalendar = totalCalendarDays > 0 ? Math.round((doneCount / totalCalendarDays) * 100) : 0;
          const pctElapsed = elapsedDays > 0 ? Math.round((doneCount / elapsedDays) * 100) : 0;

          habitsStats[h.key] = {
            key: h.key,
            name: h.name,
            color: h.color,
            doneCount,
            markedCount,
            bestStreak,
            currentStreak: endStreak,
            pctCalendar,
            pctElapsed
          };
        }

        return {
          startDate,
          endDate,
          totalCalendarDays,
          elapsedDays,
          recordsCount,
          daySlots,
          scoreCount: scoreItems.length,
          withoutScoreCount: Math.max(0, elapsedDays - scoreItems.length),
          meanScore,
          bestDay,
          worstDay,
          dist,
          energyCount: energyItems.length,
          meanEnergy,
          minEnergy: energyVals.length ? Math.min(...energyVals) : null,
          maxEnergy: energyVals.length ? Math.max(...energyVals) : null,
          energyHalfDelta,
          weightCount: weightItems.length,
          firstWeight,
          lastWeight,
          weightChange,
          meanWeight,
          calorieCount: calorieItems.length,
          meanCalories,
          meanProtein,
          meanFat,
          meanCarbs,
          hasMacros: proteinItems.length > 0 || fatItems.length > 0 || carbItems.length > 0,
          sleepCount: sleepItems.length,
          meanSleep,
          minSleep,
          maxSleep,
          pagesDaysCount: pagesItems.length,
          sumPages,
          meanPagesReadDay,
          socialCount: socialItems.length,
          meanSocial,
          socialInLimitDays,
          stepsCount: stepsItems.length,
          sumSteps,
          meanSteps,
          goalsCount: goalsItems.length,
          sumGoals,
          eventsCount,
          habitsStats
        };
      }

      function getMonthStats(monthKey) {
        if (monthCache.has(monthKey)) return monthCache.get(monthKey);
        const start = dv.date(`${monthKey}-01`).startOf("month");
        const end = start.endOf("month").startOf("day");
        const res = computeRangeMetrics(start, end);
        monthCache.set(monthKey, res);
        return res;
      }

      function getYearStats(yearNum) {
        if (yearCache.has(yearNum)) return yearCache.get(yearNum);
        const start = dv.date(`${yearNum}-01-01`).startOf("day");
        const end = dv.date(`${yearNum}-12-31`).startOf("day");
        const base = computeRangeMetrics(start, end);
        const monthsBreakdown = [];
        for (let m = 1; m <= 12; m++) {
          const mk = `${yearNum}-${String(m).padStart(2, "0")}`;
          const ms = getMonthStats(mk);
          monthsBreakdown.push({
            monthIndex: m - 1,
            monthKey: mk,
            label: MONTHS[m - 1],
            fullLabel: MONTHS_FULL[m - 1],
            stats: ms,
            isFutureMonth: `${yearNum}-${String(m).padStart(2, "0")}-01` > todayISO
          });
        }
        const scoredMonths = monthsBreakdown.filter(m => m.stats.meanScore !== null && m.stats.scoreCount >= 1);
        let bestMonth = null;
        let worstMonth = null;
        for (const m of scoredMonths) {
          if (!bestMonth || m.stats.meanScore > bestMonth.stats.meanScore) bestMonth = m;
          if (!worstMonth || m.stats.meanScore < worstMonth.stats.meanScore) worstMonth = m;
        }
        if (bestMonth && worstMonth && bestMonth.monthKey === worstMonth.monthKey) {
          worstMonth = null;
        }
        const full = { ...base, year: yearNum, monthsBreakdown, bestMonth, worstMonth };
        yearCache.set(yearNum, full);
        return full;
      }

      function renderDeltaBadge(parent, curVal, prevVal, { minD = 0, maxD = 1, unit = "", invertGood = false, neutral = false } = {}) {
        if (curVal == null || prevVal == null || !Number.isFinite(curVal) || !Number.isFinite(prevVal)) return;
        const raw = curVal - prevVal;
        const threshold = maxD > 0 ? 0.05 : 0.5;
        const text = formatSigned(raw, minD, maxD, unit);
        let cls = "dhps-delta";
        if (!neutral && Math.abs(raw) >= threshold) {
          const isPositiveGood = invertGood ? raw < 0 : raw > 0;
          cls += isPositiveGood ? " is-good" : " is-bad";
        }
        parent.createSpan({
          cls,
          text,
          attr: { title: `К предыдущему периоду (${fmt(prevVal, minD, maxD)}${unit ? " " + unit : ""})` }
        });
      }

      function renderNoteLink(parent, item, prefix = "") {
        if (!item || !item.page) {
          parent.createSpan({ cls: "dhps-row-v", text: "—" });
          return;
        }
        const wrap = parent.createSpan({ cls: "dhps-row-v" });
        if (prefix) wrap.createSpan({ text: `${prefix} ` });
        const a = wrap.createEl("a", {
          cls: "dhps-note-link",
          text: item.date.toFormat("dd.MM"),
          attr: { href: "#", title: `Открыть заметку за ${item.date.toFormat("dd.MM.yyyy")}` }
        });
        a.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          open(item.page);
        };
      }

      function renderSummaryCards(container, cur, prev, periodDaysLabel) {
        const grid = container.createDiv({ cls: "dhps-grid" });
        const hasPrev = prev && prev.recordsCount > 0;

        // 1. Оценка дня
        {
          const card = grid.createDiv({ cls: "dhps-card" });
          card.style.setProperty("--dhps-accent", "#e5a158");
          const head = card.createDiv({ cls: "dhps-card-head" });
          head.createSpan({ cls: "dhps-card-label", text: "Оценка дня" });
          if (hasPrev && prev.scoreCount > 0) {
            renderDeltaBadge(head, cur.meanScore, prev.meanScore, { minD: 1, maxD: 1 });
          }

          const main = card.createDiv({ cls: "dhps-card-main" });
          main.createSpan({ cls: "dhps-card-val", text: cur.meanScore !== null ? fmt(cur.meanScore, 1, 1) : "—" });
          main.createSpan({ cls: "dhps-card-unit", text: `ср. из 10 · ${cur.scoreCount} дн.` });

          const rows = card.createDiv({ cls: "dhps-card-rows" });
          const rBest = rows.createDiv({ cls: "dhps-row" });
          rBest.createSpan({ cls: "dhps-row-k", text: "Лучший день" });
          renderNoteLink(rBest, cur.bestDay, cur.bestDay ? `${fmt(cur.bestDay.val)}/10 ·` : "");

          const rWorst = rows.createDiv({ cls: "dhps-row" });
          rWorst.createSpan({ cls: "dhps-row-k", text: "Худший день" });
          renderNoteLink(rWorst, cur.worstDay, cur.worstDay ? `${fmt(cur.worstDay.val)}/10 ·` : "");

          const rCount = rows.createDiv({ cls: "dhps-row" });
          rCount.createSpan({ cls: "dhps-row-k", text: "С оценкой / без" });
          rCount.createSpan({
            cls: "dhps-row-v",
            text: `${cur.scoreCount} / ${cur.withoutScoreCount} дн.`
          });

          const distBar = card.createDiv({ cls: "dhps-dist-bar" });
          for (let i = 0; i < 10; i++) {
            const count = cur.dist[i];
            const step = distBar.createDiv({
              cls: `dhps-dist-step${count > 0 ? " has-count" : ""}`,
              attr: { title: `Оценка ${i + 1}: ${count} дн.` }
            });
            step.style.setProperty("--step-color", COLORS[i]);
            step.createDiv({ cls: "dhps-dist-swatch" });
            step.createSpan({ cls: "dhps-dist-num", text: count > 0 ? String(count) : "·" });
          }
        }

        // 2. Энергия
        {
          const card = grid.createDiv({ cls: "dhps-card" });
          card.style.setProperty("--dhps-accent", "#69b5aa");
          const head = card.createDiv({ cls: "dhps-card-head" });
          head.createSpan({ cls: "dhps-card-label", text: "Энергия" });
          if (hasPrev && prev.energyCount > 0) {
            renderDeltaBadge(head, cur.meanEnergy, prev.meanEnergy, { minD: 1, maxD: 1 });
          }

          const main = card.createDiv({ cls: "dhps-card-main" });
          main.createSpan({ cls: "dhps-card-val", text: cur.meanEnergy !== null ? fmt(cur.meanEnergy, 1, 1) : "—" });
          main.createSpan({ cls: "dhps-card-unit", text: `ср. из 10 · ${cur.energyCount} дн.` });

          const rows = card.createDiv({ cls: "dhps-card-rows" });
          const rDyn = rows.createDiv({ cls: "dhps-row" });
          rDyn.createSpan({ cls: "dhps-row-k", text: "Динамика внутри периода" });
          rDyn.createSpan({
            cls: "dhps-row-v",
            text: cur.energyHalfDelta !== null ? `${formatSigned(cur.energyHalfDelta, 1, 1)} (2-я пол.)` : "—"
          });

          const rMinMax = rows.createDiv({ cls: "dhps-row" });
          rMinMax.createSpan({ cls: "dhps-row-k", text: "Разброс" });
          rMinMax.createSpan({
            cls: "dhps-row-v",
            text: cur.minEnergy !== null ? `${fmt(cur.minEnergy)}–${fmt(cur.maxEnergy)}` : "—"
          });

          const rEvents = rows.createDiv({ cls: "dhps-row" });
          rEvents.createSpan({ cls: "dhps-row-k", text: "Главных событий" });
          rEvents.createSpan({ cls: "dhps-row-v", text: `${cur.eventsCount} дн.` });
        }

        // 3. Вес и Калории (Питание)
        {
          const card = grid.createDiv({ cls: "dhps-card" });
          card.style.setProperty("--dhps-accent", "#8bac5e");
          const head = card.createDiv({ cls: "dhps-card-head" });
          head.createSpan({ cls: "dhps-card-label", text: "Вес и калории" });
          if (hasPrev && prev.calorieCount > 0 && cur.meanCalories !== null) {
            renderDeltaBadge(head, Math.round(cur.meanCalories), Math.round(prev.meanCalories), {
              minD: 0,
              maxD: 0,
              unit: "ккал",
              neutral: true
            });
          }

          const main = card.createDiv({ cls: "dhps-card-main" });
          main.createSpan({
            cls: "dhps-card-val",
            text: cur.weightChange !== null
              ? formatSigned(cur.weightChange, 1, 1, "кг")
              : cur.lastWeight
                ? `${fmt(cur.lastWeight.val, 1, 1)} кг`
                : "—"
          });
          main.createSpan({
            cls: "dhps-card-unit",
            text: cur.meanCalories !== null ? `ср. ${fmt(Math.round(cur.meanCalories), 0, 0)} ккал` : "калории: —"
          });

          const rows = card.createDiv({ cls: "dhps-card-rows" });
          const rW = rows.createDiv({ cls: "dhps-row" });
          rW.createSpan({ cls: "dhps-row-k", text: "Первое → последнее" });
          rW.createSpan({
            cls: "dhps-row-v",
            text: cur.firstWeight && cur.lastWeight
              ? `${fmt(cur.firstWeight.val, 1, 1)} → ${fmt(cur.lastWeight.val, 1, 1)} кг`
              : "—"
          });

          const rCal = rows.createDiv({ cls: "dhps-row" });
          rCal.createSpan({ cls: "dhps-row-k", text: "Дней с калориями / весом" });
          rCal.createSpan({
            cls: "dhps-row-v",
            text: `${cur.calorieCount} / ${cur.weightCount} дн.`
          });

          if (cur.hasMacros) {
            const rMacros = rows.createDiv({ cls: "dhps-row" });
            rMacros.createSpan({ cls: "dhps-row-k", text: "Ср. Б / Ж / У" });
            rMacros.createSpan({
              cls: "dhps-row-v",
              text: `${fmt(cur.meanProtein, 0, 0)} / ${fmt(cur.meanFat, 0, 0)} / ${fmt(cur.meanCarbs, 0, 0)} г`
            });
          } else if (cur.meanWeight !== null) {
            const rMeanW = rows.createDiv({ cls: "dhps-row" });
            rMeanW.createSpan({ cls: "dhps-row-k", text: "Средний вес" });
            rMeanW.createSpan({ cls: "dhps-row-v", text: `${fmt(cur.meanWeight, 1, 1)} кг` });
          }
        }

        // 4. Сон и Тренировки
        {
          const trStats = cur.habitsStats["тренировка"];
          const prevTrStats = hasPrev ? prev.habitsStats["тренировка"] : null;
          const card = grid.createDiv({ cls: "dhps-card" });
          card.style.setProperty("--dhps-accent", "#d69852");
          const head = card.createDiv({ cls: "dhps-card-head" });
          head.createSpan({ cls: "dhps-card-label", text: "Сон и тренировки" });
          if (hasPrev && prev.sleepCount > 0 && cur.meanSleep !== null) {
            renderDeltaBadge(head, cur.meanSleep, prev.meanSleep, { minD: 1, maxD: 1, unit: "ч" });
          }

          const main = card.createDiv({ cls: "dhps-card-main" });
          main.createSpan({
            cls: "dhps-card-val",
            text: cur.meanSleep !== null ? `${fmt(cur.meanSleep, 1, 1)} ч` : "—"
          });
          const trUnit = main.createSpan({ cls: "dhps-card-unit dh-inline-meta" });
          renderIcon(trUnit, "dumbbell", "dh-icon dh-icon-xs");
          trUnit.createSpan({ text: `${trStats.doneCount} дн. (${trStats.pctCalendar}%)` });

          const rows = card.createDiv({ cls: "dhps-card-rows" });
          const rSl = rows.createDiv({ cls: "dhps-row" });
          rSl.createSpan({ cls: "dhps-row-k", text: "Сон (мин–макс · дн.)" });
          rSl.createSpan({
            cls: "dhps-row-v",
            text: cur.sleepCount > 0
              ? `${fmt(cur.minSleep, 0, 1)}–${fmt(cur.maxSleep, 0, 1)} ч · ${cur.sleepCount} дн.`
              : "—"
          });

          const rTr = rows.createDiv({ cls: "dhps-row" });
          rTr.createSpan({ cls: "dhps-row-k", text: `Тренировки (% от ${periodDaysLabel})` });
          const trDeltaStr = (prevTrStats && hasPrev)
            ? ` (${formatSigned(trStats.doneCount - prevTrStats.doneCount, 0, 0, "дн.")})`
            : "";
          rTr.createSpan({
            cls: "dhps-row-v",
            text: `${trStats.doneCount} из ${cur.totalCalendarDays} дн.${trDeltaStr}`
          });

          if (cur.stepsCount > 0) {
            const rSt = rows.createDiv({ cls: "dhps-row" });
            rSt.createSpan({ cls: "dhps-row-k", text: "Шаги (ср. / день)" });
            rSt.createSpan({
              cls: "dhps-row-v",
              text: `${fmt(Math.round(cur.meanSteps), 0, 0)} (${cur.stepsCount} дн.)`
            });
          }
        }

        // 5. Чтение, Соцсети и Цели
        {
          const card = grid.createDiv({ cls: "dhps-card" });
          card.style.setProperty("--dhps-accent", "#599ed6");
          const head = card.createDiv({ cls: "dhps-card-head" });
          head.createSpan({ cls: "dhps-card-label", text: "Чтение и соцсети" });
          if (hasPrev && prev.pagesDaysCount > 0 && cur.pagesDaysCount > 0) {
            renderDeltaBadge(head, cur.sumPages, prev.sumPages, { minD: 0, maxD: 0, unit: "стр." });
          }

          const main = card.createDiv({ cls: "dhps-card-main" });
          main.createSpan({
            cls: "dhps-card-val",
            text: cur.pagesDaysCount > 0 ? `${fmt(cur.sumPages, 0, 0)} стр.` : "0 стр."
          });
          main.createSpan({
            cls: "dhps-card-unit",
            text: cur.meanPagesReadDay !== null
              ? `ср. ${fmt(cur.meanPagesReadDay, 0, 1)} стр./день чтения`
              : "чтение: —"
          });

          const rows = card.createDiv({ cls: "dhps-card-rows" });
          const rRead = rows.createDiv({ cls: "dhps-row" });
          rRead.createSpan({ cls: "dhps-row-k", text: "Дней с чтением (флажок / стр.)" });
          rRead.createSpan({
            cls: "dhps-row-v",
            text: `${cur.habitsStats["чтение"].doneCount} / ${cur.pagesDaysCount} дн.`
          });

          const rSoc = rows.createDiv({ cls: "dhps-row" });
          rSoc.createSpan({ cls: "dhps-row-k", text: "Соцсети (ср. · в лимите)" });
          const socDelta = (hasPrev && prev.meanSocial !== null && cur.meanSocial !== null)
            ? ` (${formatSigned(Math.round(cur.meanSocial - prev.meanSocial), 0, 0, "мин")})`
            : "";
          rSoc.createSpan({
            cls: "dhps-row-v",
            text: cur.meanSocial !== null
              ? `${Math.round(cur.meanSocial)} мин${socDelta} · ${cur.socialInLimitDays}/${cur.socialCount} дн.`
              : "—"
          });

          if (cur.goalsCount > 0) {
            const rGoals = rows.createDiv({ cls: "dhps-row" });
            rGoals.createSpan({ cls: "dhps-row-k", text: "Цели дня" });
            rGoals.createSpan({
              cls: "dhps-row-v",
              text: `${fmt(cur.sumGoals, 0, 0)} (${cur.goalsCount} дн.)`
            });
          }
        }
      }

function renderHabitsSummaryGrid(container, cur, prev, isYearMode = false) {
        const box = container.createDiv({ cls: "dhps-subbox" });
        const hGrid = box.createDiv({ cls: "dhps-habits-grid" });
        const hasPrev = prev && prev.recordsCount > 0;

        for (const h of HABITS) {
          const hsItem = cur.habitsStats[h.key];
          const prevItem = hasPrev ? prev.habitsStats[h.key] : null;
          const chip = hGrid.createDiv({ cls: "dhps-habit-chip" });
          chip.style.setProperty("--h-color", h.color);

          const top = chip.createDiv({ cls: "dhps-habit-top" });
          top.createSpan({ cls: "dhps-habit-name", text: h.name });

          const rateWrap = top.createSpan({ attr: { style: "display: inline-flex; align-items: center; gap: 5px;" } });
          rateWrap.createSpan({ cls: "dhps-habit-rate", text: `${hsItem.pctCalendar}%` });
          if (prevItem && prevItem.markedCount > 0) {
            renderDeltaBadge(rateWrap, hsItem.pctCalendar, prevItem.pctCalendar, { minD: 0, maxD: 0, unit: "п.п." });
          }

          const meta = chip.createDiv({ cls: "dhps-habit-meta" });
          meta.createSpan({ text: `${hsItem.doneCount} из ${cur.totalCalendarDays} дн.` });
          meta.createSpan({
            text: isYearMode
              ? `лучшая: ${hsItem.bestStreak} дн. · тек: ${hsItem.currentStreak} дн.`
              : `серия: макс ${hsItem.bestStreak} дн.`
          });
        }
      }

function renderMonthScoreChart(container, cur) {
        const box = container.createDiv({ cls: "dhps-subbox" });
        const head = box.createDiv({ cls: "dhps-subbox-head" });
        head.createSpan({ cls: "dhps-subbox-title", text: "Оценки по дням" });

        const nDays = cur.totalCalendarDays;
        const bars = box.createDiv({ cls: "dhps-bars" });
        bars.style.gridTemplateColumns = `repeat(${nDays}, minmax(0, 1fr))`;

        for (const slot of cur.daySlots) {
          const isTodaySlot = slot.iso === todayISO;
          const hasPage = Boolean(slot.page);
          const col = bars.createEl(hasPage ? "button" : "div", {
            cls: [
              "dhps-bar-col",
              hasPage ? "is-clickable" : "",
              slot.isFuture ? "is-future" : "",
              isTodaySlot ? "is-today" : ""
            ].filter(Boolean).join(" "),
            attr: hasPage ? { type: "button" } : {}
          });

          const ev = slot.page && typeof slot.page.главное_событие === "string"
            ? slot.page.главное_событие.trim()
            : "";
          const statusStr = slot.isFuture
            ? "Будущий день"
            : slot.score !== null
              ? `оценка ${fmt(slot.score)}/10`
              : hasPage
                ? "без оценки"
                : "нет записи";
          col.setAttribute("title", `${slot.date.toFormat("dd.MM.yyyy")} · ${statusStr}${ev ? " · " + ev : ""}`);

          const track = col.createDiv({ cls: "dhps-bar-track" });
          if (slot.score !== null) {
            const color = COLORS[Math.min(9, Math.max(0, Math.round(slot.score) - 1))];
            const pctH = Math.max(16, Math.round((slot.score / 10) * 100));
            const fill = track.createDiv({ cls: "dhps-bar-fill" });
            fill.style.height = `${pctH}%`;
            fill.style.setProperty("--bar-color", color);
            fill.createSpan({ cls: "dhps-bar-val", text: fmt(slot.score, 0, 0) });
          } else if (hasPage) {
            track.createDiv({ cls: "dhps-bar-stub" });
          }

          const isMajorDay = slot.day === 1 || slot.day % 5 === 0 || slot.day === nDays || isTodaySlot;
          col.createSpan({
            cls: `dhps-bar-day${isMajorDay ? "" : " is-minor"}`,
            text: String(slot.day)
          });

          if (hasPage) {
            col.onmousedown = e => e.preventDefault();
            col.onclick = e => {
              e.stopPropagation();
              open(slot.page);
            };
          }
        }
      }

      // 1. Панель «Итог за месяц»
      const monthPanel = summariesRoot.createDiv({ cls: `dhps-panel${sumState.monthOpen ? " is-open" : ""}` });
      const monthHeader = monthPanel.createDiv({ cls: "dhps-header" });
      const monthTitleWrap = monthHeader.createDiv({ cls: "dhps-title-wrap" });
      monthTitleWrap.createSpan({ cls: "dhps-arrow", text: "▶" });
      renderIcon(monthTitleWrap, "calendar-days", "dh-icon dh-icon-title");
      monthTitleWrap.createSpan({ cls: "dhps-title", text: "Итог за месяц" });
      const monthSubLabel = monthTitleWrap.createSpan({ cls: "dhps-sub" });

      const monthControls = monthHeader.createDiv({ cls: "dhps-controls" });
      monthControls.onclick = e => e.stopPropagation();

      const prevMonthBtn = monthControls.createEl("button", {
        cls: "dhps-nav-btn",
        text: "‹",
        attr: { type: "button", title: "Предыдущий месяц", "aria-label": "Предыдущий месяц" }
      });
      const monthSelect = monthControls.createEl("select", {
        cls: "dhps-select",
        attr: { "aria-label": "Выбор месяца" }
      });
      for (const mk of [...availableMonths].reverse()) {
        const [yStr, mStr] = mk.split("-");
        const label = `${MONTHS_FULL[Number(mStr) - 1]} ${yStr}`;
        monthSelect.createEl("option", { value: mk, text: label });
      }
      const nextMonthBtn = monthControls.createEl("button", {
        cls: "dhps-nav-btn",
        text: "›",
        attr: { type: "button", title: "Следующий месяц", "aria-label": "Следующий месяц" }
      });

      const monthBody = monthPanel.createDiv({ cls: "dhps-body" });

      monthHeader.onclick = () => {
        sumState.monthOpen = !sumState.monthOpen;
        monthPanel.classList.toggle("is-open", sumState.monthOpen);
      };

      // 2. Панель «Итог за год»
      const yearPanel = summariesRoot.createDiv({ cls: `dhps-panel${sumState.yearOpen ? " is-open" : ""}` });
      const yearHeader = yearPanel.createDiv({ cls: "dhps-header" });
      const yearTitleWrap = yearHeader.createDiv({ cls: "dhps-title-wrap" });
      yearTitleWrap.createSpan({ cls: "dhps-arrow", text: "▶" });
      renderIcon(yearTitleWrap, "calendar-range", "dh-icon dh-icon-title");
      yearTitleWrap.createSpan({ cls: "dhps-title", text: "Итог за год" });
      const yearSubLabel = yearTitleWrap.createSpan({ cls: "dhps-sub" });

      const yearControls = yearHeader.createDiv({ cls: "dhps-controls" });
      yearControls.onclick = e => e.stopPropagation();

      const prevYearBtn = yearControls.createEl("button", {
        cls: "dhps-nav-btn",
        text: "‹",
        attr: { type: "button", title: "Предыдущий год", "aria-label": "Предыдущий год" }
      });
      const yearLabelEl = yearControls.createSpan({ cls: "dhps-period-label" });
      const nextYearBtn = yearControls.createEl("button", {
        cls: "dhps-nav-btn",
        text: "›",
        attr: { type: "button", title: "Следующий год", "aria-label": "Следующий год" }
      });

      const yearBody = yearPanel.createDiv({ cls: "dhps-body" });

      yearHeader.onclick = () => {
        sumState.yearOpen = !sumState.yearOpen;
        yearPanel.classList.toggle("is-open", sumState.yearOpen);
      };

      function renderMonthSummary() {
        const mk = sumState.monthKey;
        const idx = availableMonths.indexOf(mk);
        monthSelect.value = mk;
        prevMonthBtn.disabled = idx <= 0;
        nextMonthBtn.disabled = idx === -1 || idx >= availableMonths.length - 1;

        const cur = getMonthStats(mk);
        const prevMonthKey = dv.date(`${mk}-01`).minus({ months: 1 }).toFormat("yyyy-MM");
        const prev = getMonthStats(prevMonthKey);

monthSubLabel.textContent = `${cur.recordsCount}/${cur.totalCalendarDays}`;

        monthBody.replaceChildren();
        renderSummaryCards(monthBody, cur, prev, "мес.");
        renderMonthScoreChart(monthBody, cur);
        renderHabitsSummaryGrid(monthBody, cur, prev, false);
      }

      function renderYearSummary() {
        const yNum = sumState.year;
        const yIdx = availableYears.indexOf(yNum);
        yearLabelEl.textContent = String(yNum);
        prevYearBtn.disabled = yIdx <= 0;
        nextYearBtn.disabled = yIdx === -1 || yIdx >= availableYears.length - 1;

        const cur = getYearStats(yNum);
        const prev = availableYears.includes(yNum - 1) ? getYearStats(yNum - 1) : null;

yearSubLabel.textContent = `${cur.recordsCount}/${cur.totalCalendarDays}`;
        yearBody.replaceChildren();

        renderSummaryCards(yearBody, cur, prev, "года");

// Разбивка по 12 месяцам
        {
          const mBox = yearBody.createDiv({ cls: "dhps-subbox" });
          const strip = mBox.createDiv({ cls: "dhps-months-strip" });
          for (const mItem of cur.monthsBreakdown) {
            const isBest = cur.bestMonth && cur.bestMonth.monthKey === mItem.monthKey;
            const isWorst = cur.worstMonth && cur.worstMonth.monthKey === mItem.monthKey;
            const isSelected = sumState.monthKey === mItem.monthKey;
            const ms = mItem.stats;

            const btn = strip.createEl("button", {
              cls: [
                "dhps-mcol",
                isBest ? "is-best" : "",
                isWorst ? "is-worst" : "",
                isSelected ? "is-selected" : ""
              ].filter(Boolean).join(" "),
              attr: {
                type: "button",
                title: `${mItem.fullLabel} ${yNum}: ср. оценка ${fmt(ms.meanScore, 1, 1)}, ср. энергия ${fmt(ms.meanEnergy, 1, 1)} (${ms.recordsCount} дн.)`
              }
            });

            btn.disabled = mItem.isFutureMonth && !availableMonths.includes(mItem.monthKey);
            btn.createSpan({ cls: "dhps-mcol-name", text: mItem.label });

            const scoreSpan = btn.createSpan({
              cls: "dhps-mcol-score",
              text: ms.meanScore !== null ? fmt(ms.meanScore, 1, 1) : "—"
            });
            if (ms.meanScore !== null) {
              scoreSpan.style.color = COLORS[Math.min(9, Math.max(0, Math.round(ms.meanScore) - 1))];
            }

            const enSpan = btn.createSpan({ cls: "dhps-mcol-energy dh-inline-meta" });
            if (ms.meanEnergy !== null) {
              renderIcon(enSpan, "zap", "dh-icon dh-icon-xs");
              enSpan.createSpan({ text: fmt(ms.meanEnergy, 1, 1) });
            } else {
              enSpan.textContent = `дн: ${ms.recordsCount}`;
            }

            if (isBest || isWorst) {
              btn.createSpan({
                cls: `dhps-mcol-tag ${isBest ? "is-best" : "is-worst"}`,
                text: isBest ? "лучший" : "худший"
              });
            }

            btn.onclick = () => {
              if (!availableMonths.includes(mItem.monthKey)) return;
              sumState.monthKey = mItem.monthKey;
              sumState.monthOpen = true;
              monthPanel.classList.add("is-open");
              renderMonthSummary();
              renderYearSummary();
            };
          }
        }

// Годовая тепловая карта оценок (12 месяцев × 31 день)
        {
          const hmBox = yearBody.createDiv({ cls: "dhps-subbox" });
          const hmWrap = hmBox.createDiv({ cls: "dhps-year-heatmap" });

          const headRow = hmWrap.createDiv({ cls: "dhps-yh-row is-head" });
          headRow.createSpan({ cls: "dhps-yh-label", text: "" });
          for (let d = 1; d <= 31; d++) {
            headRow.createSpan({ cls: "dhps-yh-day-num", text: String(d) });
          }

          for (const mItem of cur.monthsBreakdown) {
            const row = hmWrap.createDiv({ cls: "dhps-yh-row" });
            row.createSpan({ cls: "dhps-yh-label", text: mItem.label });

            const slotsByDay = new Map(mItem.stats.daySlots.map(s => [s.day, s]));
            for (let d = 1; d <= 31; d++) {
              const slot = slotsByDay.get(d);
              if (!slot) {
                row.createDiv({ cls: "dhps-yh-cell is-invalid" });
                continue;
              }
              const cell = row.createDiv({
                cls: [
                  "dhps-yh-cell",
                  slot.isFuture ? "is-future" : "",
                  slot.page ? "has-entry" : "",
                  slot.score !== null ? "has-score" : "",
                  slot.iso === todayISO ? "is-today" : ""
                ].filter(Boolean).join(" ")
              });

              if (slot.score !== null) {
                const c = COLORS[Math.min(9, Math.max(0, Math.round(slot.score) - 1))];
                cell.style.setProperty("--cell-color", c);
                cell.createSpan({ cls: "dhps-yh-val", text: fmt(slot.score, 0, 0) });
              }

              const statusText = slot.isFuture
                ? "Будущий день"
                : !slot.page
                  ? "Нет записи"
                  : slot.score === null
                    ? "Запись без оценки"
                    : `Оценка: ${fmt(slot.score)}/10`;

              cell.setAttribute("title", `${slot.date.toFormat("dd.MM.yyyy")} · ${statusText}`);
              if (slot.page) {
                cell.onclick = () => open(slot.page);
              }
            }
          }
        }

        renderHabitsSummaryGrid(yearBody, cur, prev, true);
      }

      prevMonthBtn.onclick = () => {
        const idx = availableMonths.indexOf(sumState.monthKey);
        if (idx > 0) {
          sumState.monthKey = availableMonths[idx - 1];
          renderMonthSummary();
          if (sumState.yearOpen) renderYearSummary();
        }
      };

      nextMonthBtn.onclick = () => {
        const idx = availableMonths.indexOf(sumState.monthKey);
        if (idx !== -1 && idx < availableMonths.length - 1) {
          sumState.monthKey = availableMonths[idx + 1];
          renderMonthSummary();
          if (sumState.yearOpen) renderYearSummary();
        }
      };

      monthSelect.onchange = () => {
        if (availableMonths.includes(monthSelect.value)) {
          sumState.monthKey = monthSelect.value;
          renderMonthSummary();
          if (sumState.yearOpen) renderYearSummary();
        }
      };

      prevYearBtn.onclick = () => {
        const idx = availableYears.indexOf(sumState.year);
        if (idx > 0) {
          sumState.year = availableYears[idx - 1];
          renderYearSummary();
        }
      };

      nextYearBtn.onclick = () => {
        const idx = availableYears.indexOf(sumState.year);
        if (idx !== -1 && idx < availableYears.length - 1) {
          sumState.year = availableYears[idx + 1];
          renderYearSummary();
        }
      };

      renderMonthSummary();
      renderYearSummary();
    }

    const hs = section("", "");
    hs.classList.add("dh-habits-v2");

    const cards = hs.createDiv({ cls: "dh-grid dh-grid-wide" });

    const todayRecord = byDate.get(todayISO);
    const doc = hs.ownerDocument;
    const win = doc.defaultView;

    const style = hs.createEl("style");
    style.textContent = `
      .dh-habits-v2 .dh-habit {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border: none !important;
        border-radius: var(--radius-ml, 14px) !important;
        background: var(--trans-faint-05, var(--background-secondary)) !important;
        box-shadow:
          var(--glass-base-m, none),
          0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
          var(--shadow-setting-items, none) !important;
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dh-habits-v2 .dh-habit .dh-dot.is-unknown {
        border: none !important;
        outline: none !important;
        background: var(--trans-faint-05, transparent) !important;
        box-shadow: inset 0 0 0 1px var(--trans-faint-25, var(--background-modifier-border)) !important;
      }
      .dh-habits-v2 .dhhv-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 10px;
        min-height: 32px;
        margin: 8px 0;
        padding: 7px 10px;
        border: none;
        border-radius: var(--radius-s, 8px);
        background: var(--background-primary);
        box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
        font-size: 0.76rem;
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dh-habits-v2 .dhhv-footer {
        display: flex;
        justify-content: flex-start;
        margin-top: auto;
        padding-top: 9px;
      }
      .dh-habits-v2 button.dhhv-more {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 28px;
        height: auto;
        margin: 0;
        padding: 4px 10px;
        border: none;
        border-radius: var(--radius-l, 18px);
        box-shadow: none;
        background: transparent;
        color: var(--icon-color, var(--text-muted));
        font-family: inherit;
        font-size: 0.74rem;
        font-weight: var(--font-semi-medium, 500);
        line-height: 1.3;
        cursor: pointer;
        transition:
          color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dh-habits-v2 button.dhhv-more:hover,
      .dh-habits-v2 button.dhhv-more[aria-expanded="true"] {
        background: var(--control-icon-background, var(--background-primary));
        box-shadow: var(--control-icon-shadow, none);
        color: var(--habit-color, var(--text-normal));
      }
      .dh-habits-v2 button.dhhv-more:focus-visible {
        box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent));
        outline: none;
      }
      .dh-habits-v2 .dhhv-chevron {
        display: inline-block;
        font-size: 0.65rem;
        transition: transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dh-habits-v2 button.dhhv-more[aria-expanded="true"] .dhhv-chevron {
        transform: rotate(180deg);
      }
      .dhhv-popover-v2 {
        position: fixed;
        z-index: 10000;
        box-sizing: border-box;
        width: 320px;
        max-width: calc(100vw - 20px);
        max-height: 75vh;
        overflow: auto;
        scrollbar-width: none;
        padding: 12px 14px;
        border: 1px solid var(--menu-border-color, var(--trans-faint-30, var(--background-modifier-border)));
        border-radius: var(--menu-radius, var(--radius-ml, 14px));
        background: var(--modal-small-background, var(--background-primary-alt, var(--background-primary)));
        backdrop-filter: var(--blur-m, blur(12px));
        -webkit-backdrop-filter: var(--blur-m, blur(12px));
        color: var(--text-normal);
        box-shadow: var(--glass-base-l, none), var(--menu-shadow, 0 10px 28px rgba(0, 0, 0, 0.28));
        font-family: var(--font-interface);
        font-size: 0.75rem;
        line-height: 1.35;
        font-variant-numeric: tabular-nums;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: scale(1.03) translateY(4px);
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
        transition:
          opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
          visibility var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      }
      .dhhv-popover-v2::-webkit-scrollbar {
        display: none;
      }
      .dhhv-popover-v2.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: scale(1) translateY(0);
      }
      .dhhv-popover-v2 .dhhv-pop-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 10px;
      }
      .dhhv-popover-v2 .dhhv-pop-title {
        color: var(--dhhv-accent);
        font-size: 0.86rem;
        font-weight: var(--font-semibold, 600);
        font-variation-settings: "opsz" 24;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .dhhv-popover-v2 .dhhv-pop-period {
        color: var(--icon-color, var(--text-muted));
        font-size: 0.68rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dhhv-popover-v2 .dhhv-pop-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 8px;
      }
      .dhhv-popover-v2 .dhhv-pop-kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 7px 8px;
        border: none;
        border-radius: var(--radius-s, 8px);
        background: var(--trans-faint-10, var(--background-secondary));
        box-shadow: inset 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
        min-width: 0;
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dhhv-popover-v2 .dhhv-pop-kpi-val {
        font-size: 0.94rem;
        font-weight: var(--font-bold, 700);
        color: var(--color-base-100, var(--text-normal));
        line-height: 1.15;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dhhv-popover-v2 .dhhv-pop-kpi-lbl {
        font-size: 0.64rem;
        font-weight: var(--font-semi-medium, 500);
        color: var(--icon-color, var(--text-muted));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dhhv-popover-v2 .dhhv-pop-kpi-sub {
        font-size: 0.62rem;
        color: var(--text-faint);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dhhv-popover-v2 .dhhv-pop-trend {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 9px;
        margin-bottom: 8px;
        border: none;
        border-radius: var(--radius-s, 8px);
        background: var(--background-primary);
        box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
        -electron-corner-smoothing: var(--corner-smoothing, 60%);
      }
      .dhhv-popover-v2 .dhhv-pop-trend-left {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .dhhv-popover-v2 .dhhv-pop-trend-k {
        font-size: 0.63rem;
        font-weight: var(--font-semi-medium, 500);
        color: var(--text-faint);
      }
      .dhhv-popover-v2 .dhhv-pop-trend-v {
        font-size: 0.75rem;
        font-weight: var(--font-semibold, 600);
        color: var(--text-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dhhv-popover-v2 .dhhv-pop-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 3px 7px;
        border-radius: var(--pill-radius, var(--radius-l, 18px));
        font-size: 0.69rem;
        font-weight: var(--font-bold, 700);
        text-box-trim: trim-both;
        text-box-edge: cap alphabetic;
        white-space: nowrap;
        flex-shrink: 0;
        color: var(--icon-color, var(--text-muted));
        background: var(--trans-faint-10, var(--background-secondary));
      }
      .dhhv-popover-v2 .dhhv-pop-badge.is-good {
        color: var(--color-green, #4aab80);
        background: color-mix(in oklab, var(--color-green, #4aab80) 15%, transparent);
      }
      .dhhv-popover-v2 .dhhv-pop-badge.is-bad {
        color: var(--color-red, #d85b57);
        background: color-mix(in oklab, var(--color-red, #d85b57) 15%, transparent);
      }
      .dhhv-popover-v2 .dhhv-pop-rows {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
      }
      .dhhv-popover-v2 .dhhv-pop-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
      }
      .dhhv-popover-v2 .dhhv-pop-label {
        color: var(--text-muted);
        font-size: 0.71rem;
        white-space: nowrap;
      }
      .dhhv-popover-v2 .dhhv-pop-value {
        font-size: 0.72rem;
        font-weight: var(--font-semibold, 600);
        color: var(--color-base-100, var(--text-normal));
        text-align: right;
        white-space: nowrap;
      }
      .dhhv-popover-v2 .dhhv-pop-value.is-good { color: var(--color-green, #4aab80); }
      .dhhv-popover-v2 .dhhv-pop-value.is-bad { color: var(--color-red, #d85b57); }
      .dhhv-popover-v2 .dhhv-pop-secondary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding-top: 7px;
        border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
        color: var(--text-faint);
        font-size: 0.67rem;
        white-space: nowrap;
      }
      .dh-habits-v2 .dhhv-info-left {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dh-habits-v2 .dhhv-info-right {
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .dh-habits-v2 .is-good { color: var(--color-green, #4aab80); font-weight: var(--font-semibold, 600); }
      .dh-habits-v2 .is-bad { color: var(--color-red, #d85b57); font-weight: var(--font-semibold, 600); }
      .dh-habits-v2 .is-warn { color: var(--color-orange, #e5a158); font-weight: var(--font-semibold, 600); }
      .dh-habits-v2 .is-muted { color: var(--text-muted); }
      .dh-habits-v2 .is-faint { color: var(--text-faint); }
      body.is-mobile .dh-habits-v2 button.dhhv-more,
      body.is-tablet .dh-habits-v2 button.dhhv-more {
        min-height: 36px;
        padding: 6px 12px;
      }
    `;

    const completed30Dates = Array.from({ length: 30 }, (_, i) => today.minus({ days: 30 - i }));
    const completed30RangeStr = `${completed30Dates[0].toFormat("dd.MM")}–${completed30Dates[29].toFormat("dd.MM")}`;

    const getWindowSlot = (startOffset, length) => {
      const slots = [];
      for (let i = length - 1; i >= 0; i--) {
        const d = today.minus({ days: startOffset + i });
        const iso = d.toISODate();
        const p = byDate.get(iso) || null;
        slots.push({ date: d, iso, page: p, activeNote: isNoteActivelyFilled(p) });
      }
      return slots;
    };

    const slots30 = getWindowSlot(1, 30);
    const slotsCur7 = getWindowSlot(1, 7);
    const slotsPrev7 = getWindowSlot(8, 7);

    const fourWeeksSlots = [
      { slots: getWindowSlot(22, 7), label: `${today.minus({ days: 28 }).toFormat("dd.MM")}–${today.minus({ days: 22 }).toFormat("dd.MM")}` },
      { slots: getWindowSlot(15, 7), label: `${today.minus({ days: 21 }).toFormat("dd.MM")}–${today.minus({ days: 15 }).toFormat("dd.MM")}` },
      { slots: getWindowSlot(8, 7),  label: `${today.minus({ days: 14 }).toFormat("dd.MM")}–${today.minus({ days: 8 }).toFormat("dd.MM")}` },
      { slots: getWindowSlot(1, 7),  label: `${today.minus({ days: 7 }).toFormat("dd.MM")}–${today.minus({ days: 1 }).toFormat("dd.MM")}` }
    ];

    function buildHabitDetails(h, bestAllTime, totalAllTime) {
      const key = h.key;

      const evalSlots = (slotList) => {
        const marked = slotList.filter(s => state(s.page, key) !== null);
        const done = marked.filter(s => s.page[key] === true);
        const blankTemplateStubs = marked.filter(s => s.page[key] === false && !s.activeNote);
        const rate = marked.length > 0 ? Math.round((done.length / marked.length) * 100) : null;
        return { totalDays: slotList.length, marked, done, blankTemplateStubs, rate };
      };

      const s30 = evalSlots(slots30);
      const wCur = evalSlots(slotsCur7);
      const wPrev = evalSlots(slotsPrev7);
      const weeks4 = fourWeeksSlots.map(w => ({ ...w, stats: evalSlots(w.slots) }));

      const runs30 = [];
      let curRun = null;
      for (const s of slots30) {
        if (state(s.page, key) === true) {
          if (!curRun) curRun = { len: 1, start: s.date, end: s.date };
          else { curRun.len++; curRun.end = s.date; }
        } else if (curRun) {
          runs30.push(curRun);
          curRun = null;
        }
      }
      if (curRun) runs30.push(curRun);

      const maxRun30 = runs30.reduce((bestR, r) => (!bestR || r.len > bestR.len ? r : bestR), null);
      const avgRun30 = runs30.length ? average(runs30.map(r => r.len)) : null;

      const findLastRecovery = () => {
        let lastFalseIdx = -1;
        for (let i = slots30.length - 1; i >= 0; i--) {
          const s = slots30[i];
          if (state(s.page, key) === false && s.activeNote) {
            if (slots30.slice(i + 1).some(x => state(x.page, key) === true)) {
              lastFalseIdx = i;
              break;
            }
          }
        }
        if (lastFalseIdx === -1) return null;
        let streakAfter = 0;
        for (let j = lastFalseIdx + 1; j < slots30.length; j++) {
          if (state(slots30[j].page, key) === true) streakAfter++;
          else if (state(slots30[j].page, key) === false && slots30[j].activeNote) break;
        }
        return streakAfter > 0 ? { missDate: slots30[lastFalseIdx].date, streakAfter } : null;
      };

      const getWeekdayWeekendDiff = () => {
        const wdMarked = s30.marked.filter(s => s.date.weekday <= 5);
        const weMarked = s30.marked.filter(s => s.date.weekday >= 6);
        if (wdMarked.length < HABIT_MIN_GROUP_SIZE * 2 || weMarked.length < HABIT_MIN_GROUP_SIZE) return null;
        const wdRate = Math.round((wdMarked.filter(s => s.page[key] === true).length / wdMarked.length) * 100);
        const weRate = Math.round((weMarked.filter(s => s.page[key] === true).length / weMarked.length) * 100);
        if (Math.abs(wdRate - weRate) < 20) return null;
        return { wdRate, weRate };
      };

      const makeFlagTrend = () => {
        if (wCur.marked.length < HABIT_MIN_WEEK_MARKED || wPrev.marked.length < HABIT_MIN_WEEK_MARKED) {
          return { label: "7 дн. к пред.", value: `${wCur.done.length}/${wCur.marked.length} дн.`, badge: "мало дн.", tone: "" };
        }
        const comparable = Math.abs(wCur.marked.length - wPrev.marked.length) <= HABIT_MAX_WEEK_GAP;
        const diffPP = comparable && wCur.rate !== null && wPrev.rate !== null ? wCur.rate - wPrev.rate : null;
        return {
          label: `7 дн. к пред. (${curWeekRange})`,
          value: `${wCur.done.length}/${wCur.marked.length} vs ${wPrev.done.length}/${wPrev.marked.length} дн.`,
          badge: diffPP !== null ? (diffPP === 0 ? "0 п.п." : `${diffPP > 0 ? "+" : "−"}${Math.abs(diffPP)} п.п.`) : null,
          tone: diffPP > 0 ? "is-good" : diffPP < 0 ? "is-bad" : ""
        };
      };

      const kpis = [];
      let trend = null;
      const rows = [];

      if (key === "nofap") {
        kpis.push(
          { val: s30.rate !== null ? `${s30.rate}%` : "—", lbl: "За 30 дн.", sub: `${s30.done.length}/${s30.marked.length} дн.` },
          { val: maxRun30 ? `${maxRun30.len} дн.` : "0 дн.", lbl: "Лучшая", sub: maxRun30 ? `${maxRun30.start.toFormat("dd.MM")}–${maxRun30.end.toFormat("dd.MM")}` : "30 дн." },
          { val: avgRun30 !== null ? `${fmt(avgRun30, 0, 1)} дн.` : "—", lbl: "Ср. серия", sub: `серий: ${runs30.length}` }
        );
        trend = makeFlagTrend();
        const recovery = findLastRecovery();
        if (recovery) {
          rows.push({ k: `После ${recovery.missDate.toFormat("dd.MM")}`, v: `${recovery.streakAfter} дн. подряд` });
        }
        if (runs30.length >= 2) {
          const lastR = runs30[runs30.length - 1].len;
          const prevR = runs30[runs30.length - 2].len;
          rows.push({ k: "Посл. / пред. серия", v: `${lastR} / ${prevR} дн.` });
        }
      } else if (key === "тренировка") {
        const weekCounts = weeks4.map(w => w.stats.done.length);
        const pacePerWeek = (s30.done.length / 30) * 7;
        kpis.push(
          { val: `${wCur.done.length}`, lbl: "За 7 дн.", sub: curWeekRange },
          { val: `${s30.done.length}`, lbl: "За 30 дн.", sub: `отм. ${s30.marked.length}` },
          { val: `${fmt(pacePerWeek, 1, 1)}`, lbl: "В неделю", sub: "средний темп" }
        );
        if (wCur.marked.length >= HABIT_MIN_WEEK_MARKED && wPrev.marked.length >= HABIT_MIN_WEEK_MARKED) {
          const diffT = wCur.done.length - wPrev.done.length;
          trend = {
            label: `7 дн. к пред. (${curWeekRange})`,
            value: `${wCur.done.length} vs ${wPrev.done.length} трен.`,
            badge: diffT === 0 ? "0" : `${diffT > 0 ? "+" : "−"}${Math.abs(diffT)}`,
            tone: diffT > 0 ? "is-good" : diffT < 0 ? "is-bad" : ""
          };
        } else {
          trend = { label: `За ${curWeekRange}`, value: `${wCur.done.length} трен.`, badge: `${wCur.marked.length}/7 дн.`, tone: "" };
        }
        rows.push({ k: "По 4 неделям", v: weekCounts.join(" · ") });
        if (s30.done.length > 0) {
          rows.push({ k: "Недель ≥3 трен.", v: `${weekCounts.filter(c => c >= 3).length} из 4` });
          const bestW = weeks4.reduce((b, w) => (w.stats.done.length > b.stats.done.length ? w : b), weeks4[0]);
          if (bestW.stats.done.length >= 2) {
            rows.push({ k: "Лучшая неделя", v: `${bestW.stats.done.length} (${bestW.label})` });
          }
        }
      } else if (key === "чтение") {
        const extractPages = (slotList) => slotList
          .map(s => ({ ...s, pages: getPagesRead(s.page) }))
          .filter(s => s.pages !== null && s.pages > 0);

        const pages30 = extractPages(slots30);
        const sumPages30 = pages30.reduce((a, x) => a + x.pages, 0);
        const avgPages30 = pages30.length ? sumPages30 / pages30.length : null;
        const pagesCur7 = extractPages(slotsCur7);
        const pagesPrev7 = extractPages(slotsPrev7);
        const sumCur7 = pagesCur7.reduce((a, x) => a + x.pages, 0);
        const sumPrev7 = pagesPrev7.reduce((a, x) => a + x.pages, 0);

        kpis.push(
          { val: s30.rate !== null ? `${s30.rate}%` : "—", lbl: "За 30 дн.", sub: `${s30.done.length}/${s30.marked.length} дн.` },
          { val: pages30.length ? fmt(sumPages30, 0, 0) : "—", lbl: "Страниц", sub: `за ${pages30.length} дн.` },
          { val: avgPages30 !== null ? fmt(avgPages30, 0, 1) : "—", lbl: "Стр. / день", sub: "в дни чтения" }
        );
        if (pagesCur7.length >= 1 || pagesPrev7.length >= 1) {
          const diffP = sumCur7 - sumPrev7;
          trend = {
            label: `7 дн. к пред. (${curWeekRange})`,
            value: `${fmt(sumCur7, 0, 0)} vs ${fmt(sumPrev7, 0, 0)} стр.`,
            badge: formatSigned(diffP, 0, 0, "стр."),
            tone: diffP > 0 ? "is-good" : diffP < 0 ? "is-bad" : ""
          };
        } else {
          trend = makeFlagTrend();
        }
        if (pages30.length >= HABIT_MIN_MONTH_NUMERIC) {
          const s1 = extractPages(slots30.slice(0, 15)).reduce((a, x) => a + x.pages, 0);
          const s2 = extractPages(slots30.slice(15, 30)).reduce((a, x) => a + x.pages, 0);
          rows.push({ k: "Посл. 15 / пред. 15 дн.", v: `${fmt(s2, 0, 0)} / ${fmt(s1, 0, 0)} стр.` });
        }
        const wdDiff = getWeekdayWeekendDiff();
        if (wdDiff) rows.push({ k: "Будни / выходные", v: `${wdDiff.wdRate}% / ${wdDiff.weRate}%` });
      } else if (key === "режим_сна") {
        const extractSleep = (slotList) => slotList
          .map(s => ({ ...s, hours: getSleepHours(s.page), flag: state(s.page, key) }))
          .filter(s => s.hours !== null);

        const sleep30 = extractSleep(slots30);
        const hours30 = sleep30.map(s => s.hours);
        const avgSleep30 = average(hours30);
        const sleepCur7 = extractSleep(slotsCur7).map(s => s.hours);
        const sleepPrev7 = extractSleep(slotsPrev7).map(s => s.hours);
        const avgCur7 = average(sleepCur7);
        const avgPrev7 = average(sleepPrev7);

        kpis.push(
          { val: s30.rate !== null ? `${s30.rate}%` : "—", lbl: "Режим", sub: `${s30.done.length}/${s30.marked.length} дн.` },
          { val: avgSleep30 !== null ? `${fmt(avgSleep30, 1, 1)} ч` : "—", lbl: "Средний", sub: `${sleep30.length} дн.` },
          { val: hours30.length >= HABIT_MIN_MONTH_NUMERIC ? `${fmt(Math.min(...hours30), 0, 1)}–${fmt(Math.max(...hours30), 0, 1)}` : "—", lbl: "Разброс, ч", sub: "30 дн." }
        );
        if (sleepCur7.length >= HABIT_MIN_WEEK_NUMERIC && sleepPrev7.length >= HABIT_MIN_WEEK_NUMERIC) {
          const diffH = avgCur7 - avgPrev7;
          trend = {
            label: `Сон 7 дн. · режим ${wCur.done.length}/${wCur.marked.length}`,
            value: `${fmt(avgCur7, 1, 1)} vs ${fmt(avgPrev7, 1, 1)} ч`,
            badge: formatSigned(diffH, 1, 1, "ч"),
            tone: ""
          };
        } else {
          trend = makeFlagTrend();
        }
        const slTrue = sleep30.filter(s => s.flag === true).map(s => s.hours);
        const slFalse = sleep30.filter(s => s.flag === false && s.activeNote).map(s => s.hours);
        if (slTrue.length >= HABIT_MIN_GROUP_SIZE && slFalse.length >= HABIT_MIN_GROUP_SIZE) {
          rows.push({ k: "С режимом / без", v: `${fmt(average(slTrue), 1, 1)} / ${fmt(average(slFalse), 1, 1)} ч` });
        }
        const slWd = sleep30.filter(s => s.date.weekday <= 5).map(s => s.hours);
        const slWe = sleep30.filter(s => s.date.weekday >= 6).map(s => s.hours);
        if (slWd.length >= HABIT_MIN_GROUP_SIZE * 2 && slWe.length >= HABIT_MIN_GROUP_SIZE) {
          const mWd = average(slWd);
          const mWe = average(slWe);
          if (Math.abs(mWd - mWe) >= 0.4) {
            rows.push({ k: "Будни / выходные", v: `${fmt(mWd, 1, 1)} / ${fmt(mWe, 1, 1)} ч` });
          }
        }
      } else if (key === "диета") {
        const extractCal = (slotList) => slotList.map(s => getCalories(s.page)).filter(v => v !== null);
        const cal30 = extractCal(slots30);
        const avgCal30 = average(cal30);
        const calCur7 = extractCal(slotsCur7);
        const calPrev7 = extractCal(slotsPrev7);
        const avgCalCur7 = average(calCur7);
        const avgCalPrev7 = average(calPrev7);
        const steadyWeeks = weeks4.filter(w => w.stats.done.length >= 5).length;

        kpis.push(
          { val: s30.rate !== null ? `${s30.rate}%` : "—", lbl: "За 30 дн.", sub: `${s30.done.length}/${s30.marked.length} дн.` },
          { val: avgCal30 !== null ? fmt(Math.round(avgCal30), 0, 0) : "—", lbl: "Ср. ккал", sub: `${cal30.length} дн.` },
          { val: `${steadyWeeks}/4`, lbl: "Недель ≥5 д.", sub: "стабильность" }
        );
        trend = makeFlagTrend();
        rows.push({
          k: "По 4 неделям",
          v: weeks4.map(w => w.stats.marked.length ? `${w.stats.done.length}/${w.stats.marked.length}` : "—").join(" · ")
        });
        if (calCur7.length >= HABIT_MIN_WEEK_NUMERIC && calPrev7.length >= HABIT_MIN_WEEK_NUMERIC) {
          rows.push({
            k: "Калории (7 дн.)",
            v: `${fmt(Math.round(avgCalCur7), 0, 0)} (${formatSigned(Math.round(avgCalCur7 - avgCalPrev7), 0, 0)})`
          });
        }
        const wdDiff = getWeekdayWeekendDiff();
        if (wdDiff) rows.push({ k: "Будни / выходные", v: `${wdDiff.wdRate}% / ${wdDiff.weRate}%` });
      } else if (key === "без_соцсетей") {
        const soc30 = slots30.map(s => getSocialMin(s.page)).filter(v => v !== null);
        const avgSoc30 = soc30.length ? average(soc30) : null;
        const inLimit30 = soc30.filter(v => v <= SOCIAL_LIMIT_MIN).length;
        const inLimitPct = soc30.length ? Math.round((inLimit30 / soc30.length) * 100) : s30.rate;
        const socCur7 = slotsCur7.map(s => getSocialMin(s.page)).filter(v => v !== null);
        const socPrev7 = slotsPrev7.map(s => getSocialMin(s.page)).filter(v => v !== null);
        const avgSocCur7 = average(socCur7);
        const avgSocPrev7 = average(socPrev7);

        kpis.push(
          { val: inLimitPct !== null ? `${inLimitPct}%` : "—", lbl: `В лимите ≤${SOCIAL_LIMIT_MIN}`, sub: soc30.length ? `${inLimit30}/${soc30.length} дн.` : `${s30.done.length}/${s30.marked.length}` },
          { val: avgSoc30 !== null ? `${Math.round(avgSoc30)} м` : "—", lbl: "Ср. / день", sub: "за 30 дн." },
          { val: maxRun30 ? `${maxRun30.len} дн.` : "0 дн.", lbl: "Лучшая", sub: "серия 30 дн." }
        );
        if (socCur7.length >= HABIT_MIN_WEEK_NUMERIC && socPrev7.length >= HABIT_MIN_WEEK_NUMERIC) {
          const diffSoc = Math.round(avgSocCur7 - avgSocPrev7);
          trend = {
            label: `7 дн. к пред. (${curWeekRange})`,
            value: `${Math.round(avgSocCur7)} vs ${Math.round(avgSocPrev7)} мин/д`,
            badge: formatSigned(diffSoc, 0, 0, "мин"),
            tone: diffSoc < 0 ? "is-good" : diffSoc > 0 ? "is-bad" : ""
          };
        } else {
          trend = makeFlagTrend();
        }
        if (avgSoc30 !== null) {
          const over = Math.round(avgSoc30 - SOCIAL_LIMIT_MIN);
          rows.push({
            k: `К лимиту ≤${SOCIAL_LIMIT_MIN} мин`,
            v: over <= 0 ? "в норме" : `+${over} мин`,
            tone: over <= 0 ? "is-good" : "is-bad"
          });
        }
      }

      return {
        name: h.name,
        color: h.color,
        periodLabel: `30 дн. · ${completed30RangeStr}`,
        kpis: kpis.slice(0, 3),
        trend,
        rows: rows.slice(0, 3),
        bestAllTime,
        totalAllTime,
        blankStubsCount: s30.blankTemplateStubs.length
      };
    }

    const popover = doc.body.createDiv({
      cls: "dhhv-popover-v2",
      attr: {
        role: "region",
        "aria-label": "Подробная статистика привычки",
        "aria-hidden": "true"
      }
    });

    popover.id = `dhhv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let activeButton = null;
    let pinned = false;
    let closeTimer = null;
    let positionFrame = null;

    function cancelClose() {
      if (closeTimer !== null) {
        win.clearTimeout(closeTimer);
        closeTimer = null;
      }
    }

    function closePopover() {
      cancelClose();
      if (activeButton) {
        activeButton.setAttribute("aria-expanded", "false");
      }
      popover.classList.remove("is-open");
      popover.setAttribute("aria-hidden", "true");
      activeButton = null;
      pinned = false;
    }

    function positionPopover() {
      if (!activeButton || !activeButton.isConnected) {
        closePopover();
        return;
      }

      const rect = activeButton.getBoundingClientRect();
      const viewportWidth = win.innerWidth;
      const viewportHeight = win.innerHeight;

      if (
        rect.bottom < 0 ||
        rect.top > viewportHeight ||
        rect.right < 0 ||
        rect.left > viewportWidth
      ) {
        closePopover();
        return;
      }

      const margin = 10;
      const gap = 8;
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;

      const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
      const below = rect.bottom + gap;
      const above = rect.top - height - gap;
      let top = below + height <= viewportHeight - margin ? below : above;
      top = Math.max(margin, Math.min(top, viewportHeight - height - margin));

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    function requestPosition() {
      if (!activeButton || positionFrame !== null) return;
      positionFrame = win.requestAnimationFrame(() => {
        positionFrame = null;
        positionPopover();
      });
    }

    function scheduleClose() {
      cancelClose();
      if (pinned) return;

      closeTimer = win.setTimeout(() => {
        closeTimer = null;
        if (pinned) return;
        if (popover.matches(":hover")) return;
        if (popover.contains(doc.activeElement)) return;
        if (activeButton?.matches(":hover")) return;
        if (activeButton?.matches(":focus-visible")) return;
        closePopover();
      }, 180);
    }

    function showPopover(button, data, pin = false) {
      cancelClose();
      if (pinned && activeButton !== button && !pin) return;
      if (activeButton && activeButton !== button) {
        activeButton.setAttribute("aria-expanded", "false");
      }

      activeButton = button;
      pinned = pin;
      button.setAttribute("aria-expanded", "true");

      popover.replaceChildren();
      popover.style.setProperty("--dhhv-accent", data.color);
      popover.setAttribute("aria-label", `${data.name}: статистика`);

      const headRow = popover.createDiv({ cls: "dhhv-pop-head" });
      headRow.createSpan({ cls: "dhhv-pop-title", text: data.name });
      headRow.createSpan({ cls: "dhhv-pop-period", text: data.periodLabel });

      const kpiGrid = popover.createDiv({ cls: "dhhv-pop-kpis" });
      data.kpis.forEach(item => {
        const box = kpiGrid.createDiv({ cls: "dhhv-pop-kpi" });
        box.createSpan({ cls: "dhhv-pop-kpi-val", text: item.val });
        box.createSpan({ cls: "dhhv-pop-kpi-lbl", text: item.lbl });
        if (item.sub) box.createSpan({ cls: "dhhv-pop-kpi-sub", text: item.sub });
      });

      if (data.trend) {
        const tr = popover.createDiv({ cls: "dhhv-pop-trend" });
        const left = tr.createDiv({ cls: "dhhv-pop-trend-left" });
        left.createSpan({ cls: "dhhv-pop-trend-k", text: data.trend.label });
        left.createSpan({ cls: "dhhv-pop-trend-v", text: data.trend.value });
        if (data.trend.badge) {
          tr.createSpan({
            cls: `dhhv-pop-badge${data.trend.tone ? " " + data.trend.tone : ""}`,
            text: data.trend.badge
          });
        }
      }

      if (data.rows.length > 0) {
        const list = popover.createDiv({ cls: "dhhv-pop-rows" });
        data.rows.forEach(item => {
          const r = list.createDiv({ cls: "dhhv-pop-row" });
          r.createSpan({ cls: "dhhv-pop-label", text: item.k });
          r.createSpan({
            cls: `dhhv-pop-value${item.tone ? " " + item.tone : ""}`,
            text: item.v
          });
        });
      }

      const secFooter = popover.createDiv({ cls: "dhhv-pop-secondary" });
      secFooter.createSpan({ text: `Всего: ${data.totalAllTime} дн.` });
      secFooter.createSpan({ text: `Рекорд: ${data.bestAllTime} дн.` });
      if (data.blankStubsCount > 0) {
        secFooter.createSpan({ text: `Пустых: ${data.blankStubsCount}` });
      }

      popover.setAttribute("aria-hidden", "false");
      positionPopover();
      popover.classList.add("is-open");
    }

    popover.addEventListener("pointerenter", cancelClose);
    popover.addEventListener("pointerleave", scheduleClose);
    popover.addEventListener("focusin", cancelClose);
    popover.addEventListener("focusout", scheduleClose);

    dv.component.registerDomEvent(doc, "pointerdown", e => {
      if (activeButton && !activeButton.contains(e.target) && !popover.contains(e.target)) {
        closePopover();
      }
    });

    dv.component.registerDomEvent(doc, "keydown", e => {
      if (e.key === "Escape" && activeButton) {
        closePopover();
      }
    });

    dv.component.registerDomEvent(win, "resize", requestPosition);
    dv.component.registerDomEvent(doc, "scroll", requestPosition, true);

    dv.component.register(() => {
      cancelClose();
      if (positionFrame !== null) {
        win.cancelAnimationFrame(positionFrame);
      }
      popover.remove();
    });

    for (const h of HABITS) {
      const done = new Set(
        entries
          .filter(([, p]) => p[h.key] === true)
          .map(([iso]) => iso)
      );

      const doneToday = done.has(todayISO);
      let cursor = doneToday ? today : today.minus({ days: 1 });
      let current = 0;

      while (done.has(cursor.toISODate())) {
        current++;
        cursor = cursor.minus({ days: 1 });
      }

      let best = 0;
      let run = 0;
      let prev = null;

      for (const iso of [...done].sort()) {
        run = prev && dv.date(prev).plus({ days: 1 }).toISODate() === iso ? run + 1 : 1;
        best = Math.max(best, run);
        prev = iso;
      }

      const c = cards.createDiv({ cls: "dh-card dh-habit" });
      c.style.setProperty("--habit-color", h.color);

      const top = c.createDiv({ cls: "dh-habit-top" });
      top.createDiv({ cls: "dh-habit-name", text: h.name });
      top.createDiv({
        cls: `dh-badge${doneToday ? " is-done" : ""}`,
        text: doneToday ? "сегодня ✓" : "сегодня —"
      });

      if (h.key === "без_соцсетей" && current === 0) {
        const socCur7 = slotsCur7.map(s => getSocialMin(s.page)).filter(v => v !== null);
        const socPrev7 = slotsPrev7.map(s => getSocialMin(s.page)).filter(v => v !== null);
        const avgCur = average(socCur7);
        const avgPrev = average(socPrev7);

        if (avgCur !== null) {
          c.createDiv({ cls: "dh-card-value", text: `${Math.round(avgCur)} мин/д` });
          if (avgPrev !== null) {
            const diff = Math.round(avgCur - avgPrev);
            const trendCls = diff < 0 ? " is-good" : diff > 0 ? " is-bad" : "";
            c.createDiv({
              cls: `dh-card-hint${trendCls}`,
              text: `${formatSigned(diff, 0, 0, "мин")} к пред. нед.`
            });
          } else {
            c.createDiv({ cls: "dh-card-hint", text: `ср. за 7 дн. · лимит ≤${SOCIAL_LIMIT_MIN}` });
          }
        } else {
          c.createDiv({ cls: "dh-card-value", text: "0 дн." });
          c.createDiv({ cls: "dh-card-hint", text: "нет данных за 7 дн." });
        }
      } else {
        c.createDiv({ cls: "dh-card-value", text: `${current} дн.` });
        c.createDiv({
          cls: "dh-card-hint",
          text: current && !doneToday ? "подряд до вчера" : "подряд"
        });
      }

      const detailBox = c.createDiv({ cls: "dhhv-info" });

      if (h.key === "чтение") {
        const pages = todayRecord && typeof todayRecord.страниц_прочитано === "number"
          ? todayRecord.страниц_прочитано
          : null;
        const left = detailBox.createSpan({ cls: `dhhv-info-left${pages > 0 ? "" : " is-muted"}` });
        renderIcon(left, "book-open", "dh-icon dh-icon-xs");
        if (pages !== null && pages > 0) {
          left.createSpan({ text: "Сегодня:" });
          left.createEl("strong", { text: `${pages} стр.` });
          detailBox.createSpan({ cls: "dhhv-info-right is-good", text: "цель закрыта" });
        } else {
          left.createSpan({ text: "Сегодня страниц: 0" });
        }
      } else if (h.key === "режим_сна") {
        const sleepH = todayRecord && typeof todayRecord.сон_часов === "number"
          ? todayRecord.сон_часов
          : null;
        if (sleepH !== null && sleepH > 0) {
          let quality = "Оптимально (7–8 ч)";
          let qCls = "is-good";
          let qIcon = "moon";

          if (sleepH < 6) {
            quality = "Недосып";
            qCls = "is-bad";
            qIcon = "alert-triangle";
          } else if (sleepH < 7) {
            quality = "Ниже нормы";
            qCls = "is-warn";
            qIcon = "moon-star";
          } else if (sleepH > 9) {
            quality = "Пересып";
            qCls = "is-warn";
            qIcon = "bed";
          } else if (sleepH >= 8.5) {
            quality = "Хороший отдых";
            qCls = "is-good";
            qIcon = "moon";
          }

          const left = detailBox.createSpan({ cls: "dhhv-info-left" });
          renderIcon(left, qIcon, "dh-icon dh-icon-xs");
          left.createEl("strong", { text: `${sleepH} ч` });
          detailBox.createSpan({ cls: `dhhv-info-right ${qCls}`, text: quality });
        } else {
          const left = detailBox.createSpan({ cls: "dhhv-info-left is-muted" });
          renderIcon(left, "moon", "dh-icon dh-icon-xs");
          left.createSpan({ text: "Сон не записан" });
        }
      } else if (h.key === "диета") {
        const cal = todayRecord && typeof todayRecord.калории_ккал === "number"
          ? todayRecord.калории_ккал
          : null;
        const w = todayRecord && typeof todayRecord.вес_кг === "number"
          ? todayRecord.вес_кг
          : null;

        const left = detailBox.createSpan({ cls: "dhhv-info-left" });
        renderIcon(left, "utensils", "dh-icon dh-icon-xs");
        left.createEl("strong", { text: cal !== null ? `${cal} ккал` : "— ккал" });
        detailBox.createSpan({ cls: "dhhv-info-right is-muted", text: `Вес: ${w !== null ? fmt(w) + " кг" : "— кг"}` });
      } else if (h.key === "тренировка") {
        const wasT = todayRecord && todayRecord.тренировка === true;

        let trainingPage = dv.pages('"Знания"').array().find(p => p.тип === "Тренировка" && asDate(p.дата)?.toISODate() === todayISO);
        let isPastSession = false;

        if (!trainingPage) {
          const pastSessions = dv.pages('"Знания"').array()
            .filter(p => p.тип === "Тренировка" && asDate(p.дата) && asDate(p.дата) <= today)
            .sort((a, b) => asDate(b.дата).toMillis() - asDate(a.дата).toMillis());
          if (pastSessions.length > 0) {
            trainingPage = pastSessions[0];
            isPastSession = true;
          }
        }

        let totalReps = 0;
        let setsCount = 0;
        const exerciseReps = new Map();

        if (trainingPage) {
          const listItems = Array.from(trainingPage.file.lists ?? []);
          listItems.forEach(item => {
            const exName = item.упражнение ? String(item.упражнение).trim() : "";
            const reps = typeof item.повторы === "number" ? item.повторы : Number(item.повторы);
            if (exName && Number.isFinite(reps) && reps > 0) {
              totalReps += reps;
              setsCount++;
              exerciseReps.set(exName, (exerciseReps.get(exName) || 0) + reps);
            }
          });
        }

        const topExercises = [...exerciseReps.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([name, reps]) => `${name}: ${reps}`)
          .join(" · ");

        if (wasT && trainingPage && !isPastSession) {
          const sessionName = String(trainingPage.название_тренировки || trainingPage.file.name).replace(/^Тренировка\s*/i, "").trim() || "Силовая";
          const subInfo = topExercises ? `(${topExercises})` : `${setsCount} подх.`;
          const left = detailBox.createSpan({ cls: "dhhv-info-left is-good" });
          renderIcon(left, "dumbbell", "dh-icon dh-icon-xs");
          left.createSpan({ text: sessionName });
          detailBox.createSpan({
            cls: "dhhv-info-right is-muted",
            text: `${totalReps > 0 ? totalReps + " повт." : setsCount + " подх."} ${subInfo}`,
            attr: { title: topExercises }
          });
        } else if (isPastSession && trainingPage) {
          const pastDateStr = asDate(trainingPage.дата)?.toFormat("dd.MM") || "";
          const left = detailBox.createSpan({ cls: "dhhv-info-left is-muted" });
          renderIcon(left, "dumbbell", "dh-icon dh-icon-xs");
          left.createSpan({ text: `Отдых (посл: ${pastDateStr})` });
          detailBox.createSpan({
            cls: "dhhv-info-right is-faint",
            text: totalReps > 0 ? `${totalReps} повт.` : "—"
          });
        } else {
          const left = detailBox.createSpan({ cls: "dhhv-info-left is-muted" });
          renderIcon(left, "dumbbell", "dh-icon dh-icon-xs");
          left.createSpan({ text: "Тренировки не было" });
          detailBox.createSpan({ cls: "dhhv-info-right is-faint", text: "0 повт." });
        }
      } else if (h.key === "nofap") {
        const left = detailBox.createSpan({ cls: `dhhv-info-left${doneToday ? " is-good" : " is-muted"}` });
        renderIcon(left, "shield-check", "dh-icon dh-icon-xs");
        left.createSpan({ text: `Чистый день: ${doneToday ? "Да" : "В процессе"}` });
      } else if (h.key === "без_соцсетей") {
        const socialMin = todayRecord ? getSocialMin(todayRecord) : null;
        if (socialMin !== null) {
          if (socialMin <= SOCIAL_LIMIT_MIN) {
            const left = detailBox.createSpan({ cls: "dhhv-info-left is-good" });
            renderIcon(left, "shield-check", "dh-icon dh-icon-xs");
            left.createSpan({ text: `Лимит удержан: ${socialMin} из ${SOCIAL_LIMIT_MIN} мин` });
            detailBox.createSpan({ cls: "dhhv-info-right is-good", text: "в норме" });
          } else {
            const over = socialMin - SOCIAL_LIMIT_MIN;
            const left = detailBox.createSpan({ cls: "dhhv-info-left is-bad" });
            renderIcon(left, "smartphone", "dh-icon dh-icon-xs");
            left.createSpan({ text: `Превышение: ${socialMin} мин` });
            detailBox.createSpan({ cls: "dhhv-info-right is-bad", text: `+${over} мин` });
          }
        } else {
          const doneNS = todayRecord && todayRecord.без_соцсетей === true;
          const left = detailBox.createSpan({ cls: `dhhv-info-left${doneNS ? " is-good" : " is-muted"}` });
          renderIcon(left, doneNS ? "shield-check" : "smartphone", "dh-icon dh-icon-xs");
          left.createSpan({ text: doneNS ? "Без скроллинга" : "Сегодня не записано" });
          detailBox.createSpan({
            cls: `dhhv-info-right${doneNS ? " is-muted" : " is-faint"}`,
            text: `лимит ≤${SOCIAL_LIMIT_MIN} мин`
          });
        }
      }

      const seven = c.createDiv({ cls: "dh-seven" });

      for (const d of days(7)) {
        const p = byDate.get(d.toISODate());
        const s = state(p, h.key);

        const item = seven.createDiv({ cls: "dh-seven-day" });
        const status = s === true ? "отмечено" : s === false ? "не отмечено" : "нет данных";

        const dot = dayButton(
          item,
          "dh-dot",
          p,
          `${d.toFormat("dd.MM")} · ${h.name}: ${status}`
        );

        dot.classList.add(s === true ? "is-on" : s === false ? "is-off" : "is-unknown");

        if (d.toISODate() === todayISO) {
          dot.classList.add("is-today");
        }

        item.createSpan({
          cls: "dh-seven-label",
          text: WEEKDAYS[d.weekday - 1]
        });
      }

      const footer = c.createDiv({ cls: "dhhv-footer" });
      const more = footer.createEl("button", {
        cls: "dhhv-more",
        attr: {
          type: "button",
          "aria-label": `${h.name}: подробнее`,
          "aria-expanded": "false",
          "aria-controls": popover.id
        }
      });

      more.onmousedown = e => e.preventDefault();
      more.createSpan({ text: "Подробнее" });
      more.createSpan({ cls: "dhhv-chevron", text: "▾", attr: { "aria-hidden": "true" } });

      const data = buildHabitDetails(h, best, done.size);

      more.addEventListener("pointerenter", e => {
        if (e.pointerType !== "mouse") return;
        if (activeButton === more && pinned) {
          cancelClose();
          return;
        }
        showPopover(more, data);
      });

      more.addEventListener("pointerleave", e => {
        if (e.pointerType === "mouse") {
          scheduleClose();
        }
      });

      more.addEventListener("focus", () => {
        if (more.matches(":focus-visible") && !(activeButton === more && pinned)) {
          showPopover(more, data);
        }
      });

      more.addEventListener("blur", scheduleClose);

more.addEventListener("click", e => {
        e.stopPropagation();
        if (activeButton === more && pinned) {
          closePopover();
        } else {
          showPopover(more, data, true);
        }
      });
    }

    // Итоговый порядок: Календарь -> Привычки -> Итог за месяц и год -> Корреляции
    if (summariesSectionEl) root.appendChild(summariesSectionEl);
    if (analyticsSectionEl) root.appendChild(analyticsSectionEl);
  }
}