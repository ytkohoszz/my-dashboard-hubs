const section = (typeof input !== "undefined" && input && input.section) ? input.section : "all";

const DIARY_FOLDER_NAME = "Ежедневник";
const MANUAL_HABITS_PREFIX = "dh_today_manual_habits_v1:";

function clearManualHabitOverrideForDate(dateISO, habitKey) {
  try {
    const storageKey = MANUAL_HABITS_PREFIX + dateISO;
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && habitKey in parsed) {
      delete parsed[habitKey];
      window.localStorage?.setItem(storageKey, JSON.stringify(parsed));
    }
  } catch {}
}

function getNutritionPlugin() {
  return app.plugins?.plugins?.["my-nutrition-tracker"] ?? null;
}

function getWorkoutPlugin() {
  return app.plugins?.plugins?.["my-workout-companion"] ?? null;
}

function createHealthSvgNode(parent, tagName, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  parent.appendChild(node);
  return node;
}

function renderHealthIcon(parent, iconName, cls = "dh-icon") {
  const el = parent.createSpan({ cls, attr: { "aria-hidden": "true" } });
  try {
    if (typeof setIcon === "function") setIcon(el, iconName);
    else if (typeof window.setIcon === "function") window.setIcon(el, iconName);
    else if (typeof require === "function") require("obsidian").setIcon(el, iconName);
  } catch {}
  return el;
}

ensureHealthStyles();

// ========================================================
// МОДУЛЬ 1: ВЕС, КАЛОРИИ, БЖУ И ПАНЕЛЬ СЕГОДНЯШНЕГО ДНЯ
// ========================================================
function renderHealthStats() {
  const SOURCE = '"' + DIARY_FOLDER_NAME + '"';
  const MIN_WEEK_DAYS = 4;

  const empty = v => v == null || v === "";
  function asDate(v) {
    if (empty(v)) return null;
    try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
  }
  const mtime = p => { try { return p.file.mtime?.toMillis?.() ?? 0; } catch { return 0; } };
  const average = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const fmt = (v, minDigits = 0, maxDigits = 1) => v == null ? "—" : v.toLocaleString("ru-RU", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits
  });
  const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };

function parseNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Читаем дневную цель калорий напрямую из настроек плагина питания (если отключена — null)
  const nutPlugin = getNutritionPlugin();
  const rawPluginGoal = nutPlugin?.settings ? nutPlugin.settings.dailyCalorieGoal : null;
  const calorieGoal = typeof rawPluginGoal === "number" && rawPluginGoal > 0 ? Math.round(rawPluginGoal) : null;

  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();

  const byDate = new Map();
  for (const p of dv.pages(SOURCE)) {
    const d = asDate(p.дата) || asDate(p.file.name);
    if (!d || d > today) continue;
    const iso = d.toISODate();
    const old = byDate.get(iso);
    if (!old || mtime(p) > mtime(old)) byDate.set(iso, p);
  }

  const problems = [];
  const weight = new Map();
  const calories = new Map();
  const proteins = new Map();
  const fats = new Map();
  const carbs = new Map();

  for (const [iso, p] of byDate) {
    if (!empty(p.вес_кг)) {
      const val = parseNum(p.вес_кг);
      if (val !== null && val >= 20 && val <= 300) weight.set(iso, val);
      else problems.push([p.file.link, "вес_кг: нужно число от 20 до 300."]);
    }
    if (!empty(p.калории_ккал)) {
      const cal = parseNum(p.калории_ккал);
      if (cal !== null && cal > 0 && cal <= 10000) calories.set(iso, cal);
      else if (cal !== 0) problems.push([p.file.link, "калории_ккал: нужно число от 1 до 10000."]);
    }
    if (!empty(p.белки_г)) {
      const pr = parseNum(p.белки_г);
      if (pr !== null && pr >= 0 && pr <= 1000) proteins.set(iso, pr);
    }
    if (!empty(p.жиры_г)) {
      const ft = parseNum(p.жиры_г);
      if (ft !== null && ft >= 0 && ft <= 1000) fats.set(iso, ft);
    }
    if (!empty(p.углеводы_г)) {
      const cb = parseNum(p.углеводы_г);
      if (cb !== null && cb >= 0 && cb <= 2000) carbs.set(iso, cb);
    }
  }

  const spanCompleted = (map, startOffset, length) => {
    const values = [];
    for (let i = 0; i < length; i++) {
      const iso = today.minus({ days: startOffset + i }).toISODate();
      if (map.has(iso)) values.push(map.get(iso));
    }
    return values;
  };

  const wCur7 = spanCompleted(weight, 1, 7);
  const wPrev7 = spanCompleted(weight, 8, 7);
  const cCur7 = spanCompleted(calories, 1, 7);
  const cPrev7 = spanCompleted(calories, 8, 7);
  const pCur7 = spanCompleted(proteins, 1, 7);
  const fCur7 = spanCompleted(fats, 1, 7);
  const uCur7 = spanCompleted(carbs, 1, 7);

  const wCurMean = average(wCur7), wPrevMean = average(wPrev7);
  const cCurMean = average(cCur7), cPrevMean = average(cPrev7);
  const pCurMean = average(pCur7), fCurMean = average(fCur7), uCurMean = average(uCur7);

  const curWeekRange = today.minus({ days: 7 }).toFormat("dd.MM") + "–" + today.minus({ days: 1 }).toFormat("dd.MM");
  const prevWeekRange = today.minus({ days: 14 }).toFormat("dd.MM") + "–" + today.minus({ days: 8 }).toFormat("dd.MM");

  const weightDates = [...weight.keys()].sort();
  const lastISO = weightDates.length >= 1 ? weightDates[weightDates.length - 1] : null;
  const prevISO = weightDates.length >= 2 ? weightDates[weightDates.length - 2] : null;

  function formatWeightDelta(rawDiff) {
    if (rawDiff == null || !Number.isFinite(rawDiff)) return null;
    const rounded = Math.round(rawDiff * 10) / 10;
    if (Object.is(rounded, -0) || Math.abs(rounded) < 0.05) {
      return {
        text: "0,0 кг",
        color: "var(--text-muted)",
        bg: "var(--background-primary)",
        border: "var(--background-modifier-border)"
      };
    }
    if (rounded > 0) {
      return {
        text: "+" + fmt(rounded, 1, 1) + " кг",
        color: "#4aab80",
        bg: "#4aab8018",
        border: "#4aab8044"
      };
    }
    return {
      text: "−" + fmt(Math.abs(rounded), 1, 1) + " кг",
      color: "#d85b57",
      bg: "#d85b5718",
      border: "#d85b5744"
    };
  }

  function formatCaloriesDelta(rawDiff) {
    if (rawDiff == null || !Number.isFinite(rawDiff)) return null;
    const rounded = Math.round(rawDiff);
    if (Object.is(rounded, -0) || rounded === 0) {
      return {
        text: "0 ккал/день",
        color: "var(--text-muted)",
        bg: "var(--background-primary)",
        border: "var(--background-modifier-border)"
      };
    }
    const sign = rounded > 0 ? "+" : "−";
    return {
      text: sign + fmt(Math.abs(rounded), 0, 0) + " ккал/день",
      color: "var(--text-muted)",
      bg: "var(--background-primary)",
      border: "var(--background-modifier-border)"
    };
  }

  dv.container.style.overflow = "visible";
  const blockStyleSelector = ".block-language-" + "dataview" + "js";
  const blockEl = dv.container.closest(blockStyleSelector);
  if (blockEl) {
    blockEl.style.overflow = "visible";
    blockEl.style.position = "relative";
    blockEl.style.zIndex = "30";
  }
  const embedEl = dv.container.closest(".cm-embed-block");
  if (embedEl) {
    embedEl.style.overflow = "visible";
    embedEl.style.contain = "none";
    embedEl.style.zIndex = "30";
  }

  const root = dv.container.createDiv({ cls: "dh", attr: { style: "overflow: visible;" } });

  const stats = root.createDiv({
    cls: "dh-grid",
    attr: {
      style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; position: relative; z-index: 30; overflow: visible;"
    }
  });

  let activePinnedCard = null;

  function createMinimalCard({ label, value, deltaBadge, accent, rows }) {
    const c = stats.createDiv({
      cls: "dh-card dh-health-stat-card",
      attr: {
        role: "button",
        "aria-expanded": "false"
      }
    });
    c.style.setProperty("--card-accent", accent);

    c.createDiv({ cls: "dh-card-label", text: label });

    const valRow = c.createDiv({ cls: "dh-health-stat-valrow" });
    valRow.createDiv({ cls: "dh-card-value", text: value });

    if (deltaBadge) {
      valRow.createSpan({
        cls: "dh-health-stat-delta",
        text: deltaBadge.text,
        attr: {
          style: "color: " + deltaBadge.color + "; background: " + deltaBadge.bg + ";"
        }
      });
    } else {
      valRow.createSpan({
        cls: "dh-health-stat-delta is-empty",
        text: "—"
      });
    }

    const popover = c.createDiv({ cls: "dh-health-stat-popover" });

    rows.forEach((r, idx) => {
      const rowEl = popover.createDiv({
        cls: "dh-health-pop-row" + (idx > 0 ? " has-sep" : "")
      });

      rowEl.createSpan({ cls: "dh-health-pop-k", text: r.k });

      if (r.minMax) {
        const mmWrap = rowEl.createDiv({ cls: "dh-health-pop-mm" });
        mmWrap.createSpan({
          cls: "dh-health-pop-tag" + (r.neutralMinMax ? "" : " is-min"),
          text: "мин " + r.minMax.min
        });
        mmWrap.createSpan({
          cls: "dh-health-pop-tag" + (r.neutralMinMax ? "" : " is-max"),
          text: "макс " + r.minMax.max
        });
      } else {
        rowEl.createSpan({
          cls: "dh-health-pop-v",
          text: r.v,
          attr: r.vColor ? { style: "color: " + r.vColor + ";" } : {}
        });
      }
    });

    const setVisualState = (isOpen) => {
      c.classList.toggle("is-open", isOpen);
      popover.classList.toggle("is-open", isOpen);
      c.setAttribute("aria-expanded", String(isOpen));
    };

    c.onmousedown = (e) => e.preventDefault();

    c.onpointerenter = (e) => {
      if (e.pointerType === "mouse") setVisualState(true);
    };
    c.onpointerleave = (e) => {
      if (e.pointerType === "mouse" && activePinnedCard !== c) setVisualState(false);
    };

    c.onclick = (e) => {
      e.stopPropagation();
      if (activePinnedCard === c) {
        activePinnedCard = null;
        setVisualState(false);
      } else {
        if (activePinnedCard) activePinnedCard._closePopover?.();
        activePinnedCard = c;
        setVisualState(true);
      }
    };

    c._closePopover = () => setVisualState(false);
  }

  if (window.__dhHealthDocCleanup) {
    try { window.__dhHealthDocCleanup(); } catch (_) {}
  }
  const closePinnedOnOutside = (e) => {
    if (activePinnedCard && !activePinnedCard.contains(e.target)) {
      activePinnedCard._closePopover?.();
      activePinnedCard = null;
    }
  };
  const closePinnedOnEsc = (e) => {
    if (e.key === "Escape" && activePinnedCard) {
      activePinnedCard._closePopover?.();
      activePinnedCard = null;
    }
  };
  document.addEventListener("click", closePinnedOnOutside);
  document.addEventListener("keydown", closePinnedOnEsc);
  window.__dhHealthDocCleanup = () => {
    document.removeEventListener("click", closePinnedOnOutside);
    document.removeEventListener("keydown", closePinnedOnEsc);
  };

  const lastWeightVal = lastISO ? weight.get(lastISO) : null;
  const prevWeightVal = prevISO ? weight.get(prevISO) : null;
  const lastWeightDelta = lastWeightVal != null && prevWeightVal != null
    ? formatWeightDelta(lastWeightVal - prevWeightVal)
    : null;

  createMinimalCard({
    label: "Последний вес",
    value: lastWeightVal != null ? fmt(lastWeightVal, 1, 1) + " кг" : "—",
    deltaBadge: lastWeightDelta,
    accent: "#e5a158",
    rows: lastISO
      ? [
          { k: "Дата замера", v: dv.date(lastISO).toFormat("dd.MM.yyyy") },
          {
            k: "Предыдущий замер",
            v: prevISO ? fmt(prevWeightVal, 1, 1) + " кг · " + dv.date(prevISO).toFormat("dd.MM.yyyy") : "Нет данных",
            vColor: prevISO ? undefined : "var(--text-muted)"
          },
          {
            k: "К предыдущему замеру",
            v: lastWeightDelta ? lastWeightDelta.text : "Нет данных",
            vColor: lastWeightDelta ? lastWeightDelta.color : "var(--text-muted)"
          }
        ]
      : [
          { k: "Данные", v: "Взвешиваний пока нет", vColor: "var(--text-muted)" }
        ]
  });

  const hasEnoughWeight = wCur7.length >= MIN_WEEK_DAYS && wPrev7.length >= MIN_WEEK_DAYS;
  const weightWeekDelta = hasEnoughWeight ? formatWeightDelta(wCurMean - wPrevMean) : null;

  createMinimalCard({
    label: "Средний вес · 7 дней",
    value: wCurMean !== null ? fmt(wCurMean, 1, 1) + " кг" : "—",
    deltaBadge: weightWeekDelta,
    accent: "#599ed6",
    rows: hasEnoughWeight
      ? [
          { k: "Текущие 7 дн. (" + curWeekRange + ")", v: fmt(wCurMean, 1, 1) + " кг · " + wCur7.length + "/7 дн." },
          { k: "Разброс", minMax: { min: fmt(Math.min(...wCur7), 1, 1), max: fmt(Math.max(...wCur7), 1, 1) } },
          { k: "Пред. 7 дн. (" + prevWeekRange + ")", v: fmt(wPrevMean, 1, 1) + " кг · " + wPrev7.length + "/7 дн." }
        ]
      : [
          { k: "Статус", v: "Недостаточно данных для сравнения", vColor: "#e5a158" },
          { k: "Текущие 7 дн. (" + curWeekRange + ")", v: wCur7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")" },
          ...(wCur7.length
            ? [{ k: "Разброс", minMax: { min: fmt(Math.min(...wCur7), 1, 1), max: fmt(Math.max(...wCur7), 1, 1) } }]
            : []),
          {
            k: "Пред. 7 дн. (" + prevWeekRange + ")",
            v: (wPrevMean !== null ? fmt(wPrevMean, 1, 1) + " кг · " : "") + wPrev7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")"
          }
        ]
  });

const hasEnoughCal = cCur7.length >= MIN_WEEK_DAYS && cPrev7.length >= MIN_WEEK_DAYS;
const calWeekDelta = hasEnoughCal ? formatCaloriesDelta(cCurMean - cPrevMean) : null;

// БЖУ за 7 дней: среднее, доля в калориях БЖУ (4/9/4 ккал на грамм) и сдвиг к прошлой неделе
const macroDefs = [
{ k: "Белки", cur: pCur7, prev: spanCompleted(proteins, 8, 7), kcal: 4 },
{ k: "Жиры", cur: fCur7, prev: spanCompleted(fats, 8, 7), kcal: 9 },
{ k: "Углеводы", cur: uCur7, prev: spanCompleted(carbs, 8, 7), kcal: 4 }
].map(m => ({ ...m, mean: average(m.cur), prevMean: average(m.prev) }));

const macroKcalTotal = macroDefs.reduce((s, m) => s + (m.mean ?? 0) * m.kcal, 0);

const macroRows = macroDefs.map(m => {
if (m.mean === null) {
return { k: m.k, v: "нет данных", vColor: "var(--text-muted)" };
}
const share = macroKcalTotal > 0 ? Math.round((m.mean * m.kcal / macroKcalTotal) * 100) : null;
const hasDelta = m.cur.length >= MIN_WEEK_DAYS && m.prev.length >= MIN_WEEK_DAYS;
const diff = hasDelta ? Math.round(m.mean - m.prevMean) : null;
const deltaText = diff === null ? "" : diff === 0 ? " · 0 г" : " · " + (diff > 0 ? "+" : "−") + fmt(Math.abs(diff), 0, 0) + " г";
return {
k: m.k,
v: fmt(m.mean, 0, 0) + " г" + (share !== null ? " · " + share + "%" : "") + deltaText
};
});

createMinimalCard({
label: "Средние калории · 7 дней",
value: cCurMean !== null ? fmt(cCurMean, 0, 0) + " ккал" : "—",
deltaBadge: calWeekDelta,
accent: "#69b5aa",
rows: hasEnoughCal
? [
{ k: "Текущие 7 дн. (" + curWeekRange + ")", v: fmt(cCurMean, 0, 0) + " ккал · " + cCur7.length + "/7 дн." },
{ k: "Разброс", minMax: { min: fmt(Math.min(...cCur7), 0, 0), max: fmt(Math.max(...cCur7), 0, 0) }, neutralMinMax: true },
...macroRows,
{ k: "Пред. 7 дн. (" + prevWeekRange + ")", v: fmt(cPrevMean, 0, 0) + " ккал · " + cPrev7.length + "/7 дн." }
]
: [
{ k: "Статус", v: "Недостаточно данных для сравнения", vColor: "#e5a158" },
{ k: "Текущие 7 дн. (" + curWeekRange + ")", v: cCur7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")" },
...(cCur7.length
? [{ k: "Разброс", minMax: { min: fmt(Math.min(...cCur7), 0, 0), max: fmt(Math.max(...cCur7), 0, 0) }, neutralMinMax: true }]
: []),
...macroRows,
{
k: "Пред. 7 дн. (" + prevWeekRange + ")",
v: (cPrevMean !== null ? fmt(cPrevMean, 0, 0) + " ккал · " : "") + cPrev7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")"
}
]
});

  const styleEl = document.getElementById("dh-health-dynamic-style") || document.createElement("style");
  styleEl.id = "dh-health-dynamic-style";
  styleEl.textContent = `
    /* === Верхние карточки веса и калорий (Velocity Island + Glass Popover) === */
    .dashboard-home .dh-health-stat-card {
      position: relative;
      overflow: visible !important;
      cursor: pointer;
      user-select: none;
      padding: 12px 14px !important;
      border: none !important;
      border-radius: var(--radius-ml, 14px) !important;
      background: var(--trans-faint-05, var(--background-secondary)) !important;
      box-shadow:
        inset 0 2px 0 0 color-mix(in oklab, var(--card-accent, var(--interactive-accent)) 65%, transparent),
        var(--glass-base-m, none),
        0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
        var(--shadow-setting-items, none) !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition:
        box-shadow var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
        transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
        background-color var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
    }
    .dashboard-home .dh-health-stat-card.is-open {
      transform: translateY(-1px);
      box-shadow:
        inset 0 2px 0 0 var(--card-accent, var(--interactive-accent)),
        0 0 0 1px color-mix(in oklab, var(--card-accent, var(--interactive-accent)) 55%, transparent),
        var(--shadow-muted, 0 6px 18px rgba(0, 0, 0, 0.2)) !important;
    }
    .dashboard-home .dh-health-stat-valrow {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-top: 4px;
    }
    .dashboard-home .dh-health-stat-delta {
      font-size: 0.76rem;
      font-weight: var(--font-semi-medium, 500);
      font-variant-numeric: tabular-nums;
      padding: 2px 9px;
      border: none;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      white-space: nowrap;
    }
    .dashboard-home .dh-health-stat-delta.is-empty {
      background: transparent;
      color: var(--text-muted);
      padding: 0;
    }
    .dashboard-home .dh-health-stat-popover {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 8px);
      z-index: 90;
      padding: 12px 14px;
      border: 1px solid var(--menu-border-color, var(--trans-faint-30, var(--background-modifier-border)));
      border-radius: var(--menu-radius, var(--radius-ml, 14px));
      background: var(--modal-small-background, var(--background-primary-alt, var(--background-secondary)));
      backdrop-filter: var(--blur-m, blur(12px));
      -webkit-backdrop-filter: var(--blur-m, blur(12px));
      box-shadow: var(--glass-base-l, none), var(--menu-shadow, 0 10px 28px rgba(0, 0, 0, 0.32));
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.75rem;
      line-height: 1.35;
      opacity: 0;
      visibility: hidden;
      transform: scale(1.02) translateY(-4px);
      pointer-events: none;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition:
        opacity var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
        transform var(--anim-duration-fast, 150ms) var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1)),
        visibility var(--anim-duration-fast, 150ms);
    }
    .dashboard-home .dh-health-stat-popover.is-open {
      opacity: 1;
      visibility: visible;
      transform: scale(1) translateY(0);
    }
    .dashboard-home .dh-health-pop-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .dashboard-home .dh-health-pop-row.has-sep {
      padding-top: 6px;
      border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    }
    .dashboard-home .dh-health-pop-k {
      color: var(--text-muted);
    }
    .dashboard-home .dh-health-pop-v {
      font-weight: var(--font-semibold, 600);
      font-variant-numeric: tabular-nums;
      color: var(--color-base-100, var(--text-normal));
      text-align: right;
    }
    .dashboard-home .dh-health-pop-mm {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dashboard-home .dh-health-pop-tag {
      font-size: 0.72rem;
      font-weight: var(--font-semi-medium, 500);
      font-variant-numeric: tabular-nums;
      padding: 2px 7px;
      border-radius: var(--radius-xs, 6px);
      background: var(--trans-faint-10, var(--background-primary));
      color: var(--text-normal);
    }
    .dashboard-home .dh-health-pop-tag.is-min {
      background: color-mix(in oklab, var(--color-red, #d85b57) 14%, transparent);
      color: var(--color-red, #d85b57);
    }
    .dashboard-home .dh-health-pop-tag.is-max {
      background: color-mix(in oklab, var(--color-green, #4aab80) 14%, transparent);
      color: var(--color-green, #4aab80);
    }

    /* === Сетка графиков === */
    .dashboard-home .dh-health-analytics-layout {
      --dh-c-weight: var(--color-orange, #e5a158);
      --dh-c-calories: var(--color-purple, #8b8dff);
      --dh-c-proteins: var(--color-green, #4aab80);
      --dh-c-fats: var(--color-yellow, #d78f60);
      --dh-c-carbs: var(--color-blue, #599ed6);
      --dh-c-up: var(--color-green, #4aab80);
      --dh-c-down: var(--color-red, #d85b57);
      --dh-c-flat: var(--color-blue, #7e9ad9);
      --dh-ease-out: var(--vl-ease-out, cubic-bezier(0.3, 0.75, 0, 1));
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 14px;
      margin-top: 16px;
    }
    .dashboard-home .dh-health-analytics-layout > * {
      min-width: 0;
      margin-top: 0 !important;
    }

    /* Карточки-аккордеоны обоих блоков */
    .dashboard-home .dh-dyn-panel,
    .dashboard-home .dh-ex-panel {
      border-radius: calc(var(--radius-ml, 14px) + 2px);
      border: none;
      background: var(--trans-faint-05, var(--background-secondary));
      box-shadow:
        var(--glass-base-m, none),
        0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
        var(--shadow-setting-items, none);
      overflow: hidden;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition: box-shadow var(--anim-duration-moderate, 200ms) var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-panel[open],
    .dashboard-home .dh-ex-panel[open] {
      box-shadow:
        var(--glass-base-m, none),
        0 0 0 1px color-mix(in oklab, var(--dh-block-accent, var(--interactive-accent)) 32%, transparent),
        var(--shadow-setting-items, none);
    }
    .dashboard-home .dh-dyn-summary,
    .dashboard-home .dh-ex-summary {
      list-style: none;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 46px;
      padding: 10px 15px;
      color: var(--text-normal);
      transition: background-color var(--anim-super-smooth, 75ms ease-out);
    }
    .dashboard-home .dh-dyn-summary::-webkit-details-marker,
    .dashboard-home .dh-ex-summary::-webkit-details-marker {
      display: none;
    }
    .dashboard-home .dh-dyn-summary:hover,
    .dashboard-home .dh-ex-summary:hover {
      background: var(--background-modifier-hover);
    }
    .dashboard-home .dh-dyn-summary-title,
    .dashboard-home .dh-ex-summary-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
      font-weight: var(--font-semibold, 600);
      font-variation-settings: "opsz" 24;
      color: var(--color-base-100, var(--text-normal));
    }
    .dashboard-home .dh-dyn-chevron,
    .dashboard-home .dh-ex-chevron {
      display: inline-block;
      font-size: 0.7rem;
      color: var(--icon-color, var(--text-muted));
      transition: transform var(--anim-duration-fast, 150ms) var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-panel[open] .dh-dyn-chevron,
    .dashboard-home .dh-ex-panel[open] .dh-ex-chevron {
      transform: rotate(90deg);
    }
    .dashboard-home .dh-dyn-summary-meta,
    .dashboard-home .dh-ex-summary-meta {
      font-size: 0.73rem;
      font-weight: var(--font-semi-medium, 500);
      color: var(--icon-color, var(--text-muted));
      font-variant-numeric: tabular-nums;
      padding: 3px 9px;
      border: none;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--pill-background, var(--code-background));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 55%;
    }

    /* Тело блоков */
    .dashboard-home .dh-dyn-body,
    .dashboard-home .dh-ex-body {
      padding: 12px 15px 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--trans-faint-20, var(--background-modifier-border));
    }

    /* Верхняя строка: Главное число + дельта */
    .dashboard-home .dh-dyn-hero,
    .dashboard-home .dh-ex-hero {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .dashboard-home .dh-dyn-hero-left,
    .dashboard-home .dh-ex-hero-left {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .dashboard-home .dh-dyn-hero-val,
    .dashboard-home .dh-ex-hero-val {
      font-size: 1.65rem;
      font-weight: var(--font-bold, 700);
      line-height: 1.05;
      letter-spacing: -0.02em;
      color: var(--color-base-100, var(--text-normal));
      font-variant-numeric: tabular-nums;
    }
    .dashboard-home .dh-dyn-hero-unit,
    .dashboard-home .dh-ex-hero-unit {
      font-size: 0.84rem;
      font-weight: var(--font-semi-medium, 500);
      color: var(--icon-color, var(--text-muted));
    }
    .dashboard-home .dh-dyn-hero-delta,
    .dashboard-home .dh-ex-hero-delta {
      display: inline-flex;
      align-items: center;
      padding: 2px 9px;
      border: none;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      font-size: 0.74rem;
      font-weight: var(--font-semi-medium, 500);
      font-variant-numeric: tabular-nums;
      background: var(--pill-background, var(--code-background));
      color: var(--text-muted);
      white-space: nowrap;
    }
    .dashboard-home .dh-dyn-hero-delta.is-up,
    .dashboard-home .dh-ex-hero-delta.is-up {
      color: var(--dh-c-up);
      background: color-mix(in oklab, var(--dh-c-up) 15%, transparent);
    }
    .dashboard-home .dh-dyn-hero-delta.is-down,
    .dashboard-home .dh-ex-hero-delta.is-down {
      color: var(--dh-c-down);
      background: color-mix(in oklab, var(--dh-c-down) 15%, transparent);
    }

    /* Пилюли выбора метрики в «Вес и БЖУ» */
    .dashboard-home .dh-dyn-pills {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .dashboard-home button.dh-dyn-pill {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 30px !important;
      min-height: 30px !important;
      padding: 0 11px !important;
      border: none !important;
      border-radius: var(--pill-radius, var(--radius-l, 18px));
      background: var(--background-primary) !important;
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border))) !important;
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: var(--font-semi-medium, 500);
      cursor: pointer;
      touch-action: manipulation;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition:
        box-shadow var(--anim-duration-fast, 150ms) var(--dh-ease-out),
        color var(--anim-duration-fast, 150ms) var(--dh-ease-out),
        background-color var(--anim-duration-fast, 150ms) var(--dh-ease-out);
    }
    .dashboard-home button.dh-dyn-pill i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--pill-color, var(--text-muted));
      opacity: 0.65;
    }
    .dashboard-home button.dh-dyn-pill:hover {
      color: var(--text-normal);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--pill-color, var(--interactive-accent)) 55%, transparent) !important;
    }
    .dashboard-home button.dh-dyn-pill.is-active {
      color: var(--color-base-100, var(--text-normal));
      font-weight: var(--font-semibold, 600);
      background: color-mix(in oklab, var(--pill-color, var(--interactive-accent)) 18%, var(--background-primary)) !important;
      box-shadow:
        var(--glass-base, none),
        0 0 0 1px color-mix(in oklab, var(--pill-color, var(--interactive-accent)) 55%, transparent) !important;
    }
    .dashboard-home button.dh-dyn-pill.is-active i {
      opacity: 1;
    }

    /* Сегментные переключатели (Velocity Capsule) */
    .dashboard-home .dh-seg-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .dashboard-home .dh-seg-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border: none;
      border-radius: 20px;
      background: var(--tab-sidebar-container-bg, var(--background-primary));
      box-shadow: inset 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border));
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dh-seg-group::-webkit-scrollbar {
      display: none;
    }
    .dashboard-home button.dh-seg-item {
      appearance: none;
      height: 26px !important;
      min-height: 26px !important;
      padding: 0 10px !important;
      border: none !important;
      border-radius: var(--radius-xxl, 22px);
      background: transparent !important;
      box-shadow: none !important;
      color: var(--icon-color, var(--text-muted));
      font-size: 0.74rem;
      font-weight: var(--font-semi-medium, 500);
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        color var(--anim-duration-fast, 150ms) var(--dh-ease-out),
        background-color var(--anim-duration-fast, 150ms) var(--dh-ease-out),
        box-shadow var(--anim-duration-fast, 150ms) var(--dh-ease-out);
    }
    .dashboard-home button.dh-seg-item:hover {
      color: var(--text-normal);
    }
    .dashboard-home button.dh-seg-item.is-active {
      color: var(--color-base-100, var(--text-normal));
      font-weight: var(--font-semibold, 600);
      background: var(--tab-sidebar-bg, var(--background-secondary)) !important;
      box-shadow: var(--shadow-tab, var(--shadow-s)) !important;
    }

    /* Селекты в блоке «Упражнения» */
    .dashboard-home .dh-ex-selects-row {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
      gap: 8px;
    }
    .dashboard-home select.dh-ex-select {
      width: 100%;
      min-width: 0;
      height: 34px !important;
      min-height: 34px !important;
      padding: 0 26px 0 10px;
      border: none !important;
      outline: none !important;
      border-radius: var(--input-radius, var(--radius-s, 8px));
      background-color: var(--background-primary);
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-30, var(--background-modifier-border)));
      color: var(--text-normal);
      font-size: 0.78rem;
      font-weight: var(--font-semi-medium, 500);
      cursor: pointer;
      touch-action: manipulation;
      transition: box-shadow var(--anim-duration-fast, 150ms) var(--dh-ease-out);
    }
    .dashboard-home select.dh-ex-select:focus {
      box-shadow: var(--shadow-input-active, 0 0 0 2.5px var(--interactive-accent)) !important;
    }

    /* График SVG и стеклянный тултип */
    .dashboard-home .dh-chart-box {
      position: relative;
      width: 100%;
      border-radius: var(--radius-sm, 10px);
      background: var(--background-primary);
      border: none;
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
      overflow: visible;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dh-chart-svg {
      display: block;
      width: 100%;
      height: 220px;
      overflow: visible;
      touch-action: pan-y;
      user-select: none;
      cursor: crosshair;
    }
    .dashboard-home .dh-chart-guide {
      stroke: color-mix(in srgb, var(--text-muted) 65%, transparent);
      stroke-width: 1;
      stroke-dasharray: 3 3;
      pointer-events: none;
      opacity: 0;
    }
    .dashboard-home .dh-chart-active-dot {
      pointer-events: none;
      opacity: 0;
    }
    .dashboard-home .dh-chart-tooltip {
      position: absolute;
      z-index: 20;
      padding: 7px 11px;
      border-radius: var(--radius-m, 12px);
      background: var(--modal-small-background, var(--background-primary-alt, var(--background-secondary)));
      backdrop-filter: var(--blur-s, blur(8px));
      -webkit-backdrop-filter: var(--blur-s, blur(8px));
      border: 1px solid var(--menu-border-color, var(--trans-faint-30, var(--background-modifier-border)));
      box-shadow: var(--glass-base, none), var(--menu-shadow, 0 6px 18px rgba(0, 0, 0, 0.32));
      pointer-events: none;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transform: translate(-50%, calc(-100% - 10px));
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
      transition: opacity 110ms var(--dh-ease-out), visibility 110ms;
    }
    .dashboard-home .dh-chart-tooltip.is-visible {
      opacity: 1;
      visibility: visible;
    }
    .dashboard-home .dh-chart-tooltip-date {
      display: block;
      font-size: 0.68rem;
      color: var(--icon-color, var(--text-muted));
      line-height: 1.2;
    }
    .dashboard-home .dh-chart-tooltip-val {
      display: block;
      font-size: 0.88rem;
      font-weight: var(--font-bold, 700);
      color: var(--color-base-100, var(--text-normal));
      font-variant-numeric: tabular-nums;
      line-height: 1.25;
    }

    /* Компактная строка сводки под графиком */
    .dashboard-home .dh-chart-footer {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .dashboard-home .dh-chart-stat {
      padding: 7px 10px;
      border: none;
      border-radius: var(--radius-s, 8px);
      background: var(--background-primary);
      box-shadow: var(--shadow-input, 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)));
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
    }
    .dashboard-home .dh-chart-stat-k {
      font-size: 0.7rem;
      color: var(--icon-color, var(--text-muted));
      white-space: nowrap;
    }
    .dashboard-home .dh-chart-stat-v {
      font-size: 0.78rem;
      font-weight: var(--font-semibold, 600);
      color: var(--color-base-100, var(--text-normal));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dashboard-home .dh-chart-empty {
      min-height: 180px;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    /* === Модуль тренировок, рекордов и истории (Velocity Island & Table) === */
    .dashboard-home .dh-trainings-hub .dh-panel {
      border: none !important;
      border-radius: calc(var(--radius-ml, 14px) + 2px) !important;
      background: var(--trans-faint-05, var(--background-secondary)) !important;
      box-shadow:
        var(--glass-base-m, none),
        0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
        var(--shadow-setting-items, none) !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dh-trainings-hub .dh-card {
      border: none !important;
      border-radius: var(--radius-ml, 14px) !important;
      background: var(--trans-faint-05, var(--background-secondary)) !important;
      box-shadow:
        var(--glass-base-m, none),
        0 0 0 0.5px var(--trans-faint-25, var(--background-modifier-border)),
        var(--shadow-setting-items, none) !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dh-trainings-hub details.dh-details {
      border: none !important;
      border-radius: var(--radius-sm, 10px) !important;
      background: var(--trans-faint-05, var(--background-secondary)) !important;
      box-shadow: 0 0 0 0.5px var(--trans-faint-20, var(--background-modifier-border)) !important;
      padding: 8px 12px !important;
      margin-bottom: 8px !important;
      -electron-corner-smoothing: var(--corner-smoothing, 60%);
    }
    .dashboard-home .dh-trainings-hub table.dh-table thead tr {
      border-bottom: 2px solid var(--table-header-border-color, var(--hr-color, var(--background-modifier-border))) !important;
    }
    .dashboard-home .dh-trainings-hub table.dh-table thead th {
      color: var(--table-header-color, var(--icon-color)) !important;
      font-weight: var(--table-header-weight, var(--font-medium)) !important;
      text-transform: none !important;
    }
    .dashboard-home .dh-trainings-hub table.dh-table tbody tr {
      border-bottom: none !important;
    }
    .dashboard-home .dh-trainings-hub table.dh-table tbody tr:nth-child(even) {
      background: var(--table-row-bg, var(--trans-faint-00, transparent));
    }
    .dashboard-home .dh-trainings-hub table.dh-table tbody td {
      border-left: 1px solid var(--table-border-color, var(--trans-faint-20, var(--background-modifier-border)));
    }
    .dashboard-home .dh-trainings-hub table.dh-table tbody td:first-child {
      border-left: none;
    }

    /* === Адаптивность и iPadOS / Touch === */
    body.is-mobile .dashboard-home button.dh-dyn-pill {
      height: 36px !important;
      min-height: 36px !important;
      padding: 0 13px !important;
    }
    body.is-mobile .dashboard-home button.dh-seg-item {
      height: 32px !important;
      min-height: 32px !important;
      padding: 0 12px !important;
    }
    body.is-mobile .dashboard-home select.dh-ex-select {
      height: 38px !important;
      min-height: 38px !important;
    }
    @media (max-width: 920px) {
      .dashboard-home .dh-health-analytics-layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 560px) {
      .dashboard-home .dh-ex-selects-row {
        grid-template-columns: minmax(0, 1fr);
      }
      .dashboard-home .dh-chart-footer {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      .dashboard-home .dh-chart-stat {
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
        padding: 6px 8px;
      }
      .dashboard-home .dh-dyn-hero-val,
      .dashboard-home .dh-ex-hero-val {
        font-size: 1.45rem;
      }
    }
  `;
  if (!document.head.contains(styleEl)) {
    document.head.appendChild(styleEl);
  }

  // Очистка анимации счётчика при перерисовке блока динамики
  if (window.__dhDynCountRaf) {
    window.cancelAnimationFrame(window.__dhDynCountRaf);
    delete window.__dhDynCountRaf;
  }

  const dynamicState = (() => {
    try {
      const raw = localStorage.getItem("dh-health-dynamics-v1");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

const metricKeys = ["weight", "calories", "proteins", "fats", "carbs"];
  const metricMeta = {
    weight: { label: "Вес", unit: "кг", color: "#e5a158", digits: 1 },
    calories: { label: "Ккал", unit: "ккал", color: "#8b8dff", digits: 0 },
    proteins: { label: "Белки", unit: "г", color: "#4aab80", digits: 0 },
    fats: { label: "Жиры", unit: "г", color: "#d78f60", digits: 0 },
    carbs: { label: "Углеводы", unit: "г", color: "#599ed6", digits: 0 }
  };

  const getMetricMap = key => {
    if (key === "weight") return weight;
    if (key === "calories") return calories;
    if (key === "proteins") return proteins;
    if (key === "fats") return fats;
    return carbs;
  };

  const getPeriodDates = (period) => {
    const end = today;
    const start = period === null ? null : end.minus({ days: period - 1 });
    if (!start) {
      return [...new Set([...weight.keys(), ...calories.keys(), ...proteins.keys(), ...fats.keys(), ...carbs.keys()])].sort();
    }
    const dates = [];
    const cursor = start.startOf("day");
    for (let i = 0; i < period; i++) {
      dates.push(cursor.plus({ days: i }).toISODate());
    }
    return dates;
  };

  const buildMetricPoints = (key, period) => {
    const map = getMetricMap(key);
    const dates = getPeriodDates(period);
    const pts = [];
    for (const iso of dates) {
      if (map.has(iso)) pts.push({ iso, value: map.get(iso) });
    }
    return pts;
  };

  function computeDynNiceScale(minVal, maxVal, isWeight, tickCount = 4) {
    let lo = Number.isFinite(minVal) ? minVal : 0;
    let hi = Number.isFinite(maxVal) ? maxVal : 10;
    if (lo === hi) {
      const pad = isWeight ? 1 : Math.max(Math.abs(hi) * 0.15, 10);
      lo = isWeight ? lo - pad : Math.max(0, lo - pad);
      hi = hi + pad;
    } else {
      const span = hi - lo;
      lo = isWeight ? lo - span * 0.12 : Math.max(0, lo - span * 0.1);
      hi = hi + span * 0.12;
    }
    const rawStep = (hi - lo) / Math.max(1, tickCount - 1) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const res = rawStep / mag;
    let step;
    if (res <= 1) step = 1 * mag;
    else if (res <= 2) step = 2 * mag;
    else if (res <= 2.5) step = 2.5 * mag;
    else if (res <= 5) step = 5 * mag;
    else step = 10 * mag;

    if (!isWeight && step < 1) step = 1;
    if (isWeight && step < 0.2) step = 0.2;

    const niceMin = isWeight ? Math.floor(lo / step) * step : Math.max(0, Math.floor(lo / step) * step);
    const niceMax = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
      ticks.push(Math.round(v * 100) / 100);
    }
    return { yMin: ticks[0], yMax: ticks[ticks.length - 1] || ticks[0] + 1, ticks };
  }

  function buildDynMonotoneCubicPath(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
    }
    const n = pts.length;
    const dx = [];
    const dy = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      dy[i] = pts[i + 1].y - pts[i].y;
      m[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
    }
    const t = new Array(n).fill(0);
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        t[i] = 0;
      } else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      const cp1x = pts[i].x + h;
      const cp1y = pts[i].y + t[i] * h;
      const cp2x = pts[i + 1].x - h;
      const cp2y = pts[i + 1].y - t[i + 1] * h;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return d;
  }

  function formatDynAxisDate(iso, periodDays, spanDays) {
    const d = dv.date(iso);
    if (!d) return iso.slice(5).replace("-", ".");
    if (periodDays !== null && periodDays <= 90) return d.toFormat("dd.MM");
    if (spanDays > 500) return d.toFormat("MM.yy");
    return d.setLocale("ru").toFormat("LLL yy").replace(".", "");
  }

  const analyticsLayout = root.createDiv({ cls: "dh-health-analytics-layout" });
  const chartPanel = analyticsLayout.createEl("details", {
    cls: "dh-dyn-panel",
    attr: { style: "--dh-block-accent: #e5a158;" }
  });
  chartPanel.open = dynamicState.open === true;

  let selectedMetric = metricKeys.includes(dynamicState.metric) ? dynamicState.metric : "weight";
  let selectedPeriod = [7, 30, 90, 365, null].includes(dynamicState.period) ? dynamicState.period : 90;

  const persistDynState = () => {
    try {
      localStorage.setItem("dh-health-dynamics-v1", JSON.stringify({
        metric: selectedMetric,
        period: selectedPeriod,
        open: chartPanel.open
      }));
    } catch {}
  };

  const chartSummary = chartPanel.createEl("summary", { cls: "dh-dyn-summary" });
  const sumTitleWrap = chartSummary.createDiv({ cls: "dh-dyn-summary-title" });
  sumTitleWrap.createSpan({ cls: "dh-dyn-chevron", text: "▶" });
  renderHealthIcon(sumTitleWrap, "scale", "dh-icon dh-icon-title");
  sumTitleWrap.createSpan({ text: "Вес и БЖУ" });
  const chartSummaryMeta = chartSummary.createSpan({ cls: "dh-dyn-summary-meta" });

  const chartBody = chartPanel.createDiv({ cls: "dh-dyn-body" });

  // 1. Главное число + изменение за период
  const dynHero = chartBody.createDiv({ cls: "dh-dyn-hero" });
  const dynHeroLeft = dynHero.createDiv({ cls: "dh-dyn-hero-left" });
  const dynHeroValEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-val", text: "—" });
  const dynHeroUnitEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-unit", text: "" });
  const dynHeroDeltaEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-delta", attr: { style: "display: none;" } });

  // 2. Пилюли выбора показателя (Вес, Ккал, Белки, Жиры, Углеводы)
  const pillsRow = chartBody.createDiv({ cls: "dh-dyn-pills" });
  const metricBtnEls = [];
  metricKeys.forEach(k => {
    const m = metricMeta[k];
    const btn = pillsRow.createEl("button", {
      cls: "dh-dyn-pill" + (k === selectedMetric ? " is-active" : ""),
      attr: { type: "button", style: `--pill-color: ${m.color};` }
    });
    btn.createEl("i");
    btn.createSpan({ text: m.label });
    metricBtnEls.push({ btn, key: k });
    btn.onclick = () => {
      if (selectedMetric === k) return;
      selectedMetric = k;
      metricBtnEls.forEach(item => item.btn.classList.toggle("is-active", item.key === selectedMetric));
      persistDynState();
      renderDynamicPanel();
    };
  });

  // 3. Переключатель периода
  const dynPeriodRow = chartBody.createDiv({ cls: "dh-seg-row" });
  const periodBar = dynPeriodRow.createDiv({ cls: "dh-seg-group" });
  const periodOptions = [
    { val: 7, label: "7д" },
    { val: 30, label: "30д" },
    { val: 90, label: "90д" },
    { val: 365, label: "Год" },
    { val: null, label: "Всё" }
  ];
  const periodBtnEls = [];
  periodOptions.forEach(p => {
    const btn = periodBar.createEl("button", {
      cls: "dh-seg-item" + (p.val === selectedPeriod ? " is-active" : ""),
      text: p.label,
      attr: { type: "button" }
    });
    periodBtnEls.push({ btn, val: p.val });
    btn.onclick = () => {
      if (selectedPeriod === p.val) return;
      selectedPeriod = p.val;
      periodBtnEls.forEach(item => item.btn.classList.toggle("is-active", item.val === selectedPeriod));
      persistDynState();
      renderDynamicPanel();
    };
  });

  // 4. График SVG
  const dynChartWrap = chartBody.createDiv({ cls: "dh-chart-box" });

  // 5. Компактная строка сводки под графиком
  const dynFooter = chartBody.createDiv({ cls: "dh-chart-footer" });

  const renderDynamicPanel = () => {
    const meta = metricMeta[selectedMetric];
    chartPanel.style.setProperty("--dh-block-accent", meta.color);
    chartSummaryMeta.textContent = `${meta.label} · ${selectedPeriod === null ? "всё" : selectedPeriod + " дн."}`;

    const points = buildMetricPoints(selectedMetric, selectedPeriod);
    const values = points.map(p => p.value);
    const avgVal = average(values);
    const minVal = values.length ? Math.min(...values) : null;
    const maxVal = values.length ? Math.max(...values) : null;
    const firstVal = values.length > 1 ? values[0] : null;
    const lastVal = values.length ? values[values.length - 1] : null;
    const delta = lastVal != null && firstVal != null ? lastVal - firstVal : null;

    if (lastVal !== null) {
      dynHeroValEl.textContent = fmt(lastVal, meta.digits, meta.digits);
      dynHeroUnitEl.textContent = meta.unit;
    } else {
      dynHeroValEl.textContent = "—";
      dynHeroUnitEl.textContent = "";
    }

    if (delta !== null) {
      const roundedD = meta.digits > 0 ? Math.round(delta * 10) / 10 : Math.round(delta);
      const sign = roundedD > 0 ? "+" : roundedD < 0 ? "−" : "";
      dynHeroDeltaEl.textContent = `${sign}${fmt(Math.abs(roundedD), 0, meta.digits)} ${meta.unit}`;
      dynHeroDeltaEl.className = "dh-dyn-hero-delta" + (roundedD > 0 ? " is-up" : roundedD < 0 ? " is-down" : "");
      dynHeroDeltaEl.style.display = "inline-flex";
    } else {
      dynHeroDeltaEl.style.display = "none";
    }

    dynFooter.replaceChildren();
    [
      ["Среднее", avgVal == null ? "—" : `${fmt(avgVal, 0, meta.digits)} ${meta.unit}`],
      ["Мин.", minVal == null ? "—" : `${fmt(minVal, 0, meta.digits)} ${meta.unit}`],
      ["Макс.", maxVal == null ? "—" : `${fmt(maxVal, 0, meta.digits)} ${meta.unit}`]
    ].forEach(([k, v]) => {
      const item = dynFooter.createDiv({ cls: "dh-chart-stat" });
      item.createSpan({ cls: "dh-chart-stat-k", text: k });
      item.createSpan({ cls: "dh-chart-stat-v", text: v });
    });

    dynChartWrap.replaceChildren();

    if (points.length < 2) {
      const emptyEl = dynChartWrap.createDiv({ cls: "dh-chart-empty" });
      if (points.length === 1) {
        const only = points[0];
        emptyEl.createSpan({
          text: `Записано 1 значение (${dv.date(only.iso).toFormat("dd.MM.yyyy")}: ${fmt(only.value, 0, meta.digits)} ${meta.unit}).`,
          attr: { style: "font-weight: 600; color: var(--text-normal);" }
        });
        emptyEl.createSpan({
          text: "Выбери более широкий период, чтобы увидеть график.",
          attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
        });
      } else {
        emptyEl.createSpan({ text: "За выбранный период записей нет." });
      }
      return;
    }

    const boxRect = dynChartWrap.getBoundingClientRect();
    const svgW = Math.max(320, Math.round(boxRect.width || 560));
    const svgH = 220;
    const pad = { left: 46, right: 16, top: 16, bottom: 26 };
    const plotW = svgW - pad.left - pad.right;
    const plotH = svgH - pad.top - pad.bottom;

    const scaleValues = [...values];
    if (selectedMetric === "calories" && calorieGoal !== null) scaleValues.push(calorieGoal);

    const { yMin, yMax, ticks } = computeDynNiceScale(
      Math.min(...scaleValues),
      Math.max(...scaleValues),
      selectedMetric === "weight",
      4
    );
    const yRange = yMax - yMin || 1;

    const xPos = idx => pad.left + (idx * plotW) / (points.length - 1);
    const yPos = val => pad.top + plotH - ((val - yMin) / yRange) * plotH;

    const svg = createHealthSvgNode(dynChartWrap, "svg", {
      class: "dh-chart-svg",
      viewBox: `0 0 ${svgW} ${svgH}`,
      preserveAspectRatio: "none"
    });

    ticks.forEach(tickVal => {
      const y = yPos(tickVal);
      createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: svgW - pad.right, y1: y, y2: y,
        stroke: "var(--background-modifier-border)", "stroke-width": "1"
      });
      const lbl = createHealthSvgNode(svg, "text", {
        x: pad.left - 8, y: y + 4, "text-anchor": "end",
        fill: "var(--text-muted)", "font-size": "11"
      });
      lbl.textContent = fmt(tickVal, 0, meta.digits);
    });

    if (selectedMetric === "calories" && calorieGoal !== null && calorieGoal >= yMin && calorieGoal <= yMax) {
      const goalY = yPos(calorieGoal);
      createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: svgW - pad.right, y1: goalY, y2: goalY,
        stroke: "#e5a158", "stroke-width": "1.3", "stroke-dasharray": "4 4", opacity: "0.8"
      });
    }

    const spanDays = Math.max(
      1,
      Math.round(dv.date(points[points.length - 1].iso).diff(dv.date(points[0].iso), "days").days)
    );
    const labelCount = Math.min(points.length, 5);
    for (let t = 0; t < labelCount; t++) {
      const idx = labelCount === 1 ? 0 : Math.round((t * (points.length - 1)) / (labelCount - 1));
      const anchor = t === 0 ? "start" : t === labelCount - 1 ? "end" : "middle";
      const lbl = createHealthSvgNode(svg, "text", {
        x: xPos(idx), y: svgH - 6, "text-anchor": anchor,
        fill: "var(--text-muted)", "font-size": "11"
      });
      lbl.textContent = formatDynAxisDate(points[idx].iso, selectedPeriod, spanDays);
    }

    const mainCoords = points.map((p, i) => ({ x: xPos(i), y: yPos(p.value) }));
    const mainPathData = buildDynMonotoneCubicPath(mainCoords);
    const areaPathData = `${mainPathData} L ${mainCoords[mainCoords.length - 1].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} L ${mainCoords[0].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

    const gradId = "dhDynGrad-" + Math.random().toString(36).slice(2, 7);
    const defs = createHealthSvgNode(svg, "defs");
    const grad = createHealthSvgNode(defs, "linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    createHealthSvgNode(grad, "stop", { offset: "0%", "stop-color": meta.color, "stop-opacity": "0.22" });
    createHealthSvgNode(grad, "stop", { offset: "100%", "stop-color": meta.color, "stop-opacity": "0.0" });

    createHealthSvgNode(svg, "path", { d: areaPathData, fill: `url(#${gradId})` });
    createHealthSvgNode(svg, "path", {
      d: mainPathData, fill: "none", stroke: meta.color,
      "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round"
    });

    mainCoords.forEach((pt, idx) => {
      const isLast = idx === mainCoords.length - 1;
      if (isLast) {
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: "7.5",
          fill: meta.color, opacity: "0.22", "pointer-events": "none"
        });
      }
      if (points.length <= 45 || isLast) {
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: isLast ? "4.5" : "2.8",
          fill: isLast ? meta.color : "var(--background-primary)",
          stroke: meta.color,
          "stroke-width": isLast ? "2" : "1.6",
          "pointer-events": "none"
        });
      }
    });

    const guideLine = createHealthSvgNode(svg, "line", {
      x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH,
      class: "dh-chart-guide"
    });
    const activeDot = createHealthSvgNode(svg, "circle", {
      cx: mainCoords[0].x, cy: mainCoords[0].y, r: "6",
      fill: "var(--background-secondary)", stroke: meta.color, "stroke-width": "2.6",
      class: "dh-chart-active-dot"
    });

    const tooltip = dynChartWrap.createDiv({ cls: "dh-chart-tooltip" });
    const ttDate = tooltip.createSpan({ cls: "dh-chart-tooltip-date" });
    const ttVal = tooltip.createSpan({ cls: "dh-chart-tooltip-val" });

    const showDynPoint = (idx) => {
      const pt = points[idx];
      const c = mainCoords[idx];
      if (!pt || !c) return;
      guideLine.setAttribute("x1", String(c.x));
      guideLine.setAttribute("x2", String(c.x));
      guideLine.style.opacity = "1";

      activeDot.setAttribute("cx", String(c.x));
      activeDot.setAttribute("cy", String(c.y));
      activeDot.style.opacity = "1";

      ttDate.textContent = dv.date(pt.iso).toFormat("dd.MM.yyyy");
      ttVal.textContent = `${fmt(pt.value, 0, meta.digits)} ${meta.unit}`;

      const clampedX = Math.max(54, Math.min(svgW - 54, c.x));
      tooltip.style.left = `${clampedX}px`;
      tooltip.style.top = `${Math.max(36, c.y)}px`;
      tooltip.classList.add("is-visible");
    };

    const hideDynPoint = () => {
      guideLine.style.opacity = "0";
      activeDot.style.opacity = "0";
      tooltip.classList.remove("is-visible");
    };

    const handlePointer = (e) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      const relX = ((e.clientX - rect.left) / rect.width) * svgW;
      let bestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < mainCoords.length; i++) {
        const dist = Math.abs(mainCoords[i].x - relX);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }
      showDynPoint(bestIdx);
    };

    svg.addEventListener("pointermove", handlePointer);
    svg.addEventListener("pointerdown", handlePointer);
    svg.addEventListener("pointerleave", hideDynPoint);
  };

  chartPanel.ontoggle = () => {
    persistDynState();
    if (chartPanel.open) renderDynamicPanel();
  };

  if (typeof ResizeObserver !== "undefined") {
    const dynRo = new ResizeObserver(() => {
      if (chartPanel.open && dynChartWrap.isConnected) renderDynamicPanel();
    });
    dynRo.observe(dynChartWrap);
  }

  renderDynamicPanel();

  if (problems.length) {
    const box = root.createEl("details", { cls: "dh-details", attr: { style: "margin-top: 10px;" } });
    box.createEl("summary", { text: "Ошибки в записях · " + problems.length });
    dv.api.table(["Заметка", "Проблема"], problems, box, dv.component, dv.currentFilePath);
  }
}

// ========================================================
// МОДУЛЬ 2: ВИТРИНА ТРЕНИРОВОК (MY-WORKOUT-COMPANION + РЕКОРДЫ И ИСТОРИЯ)
// ========================================================
async function renderWorkoutsHub() {
  const KNOWLEDGE_FOLDER = "Знания";
  const SOURCE = '"' + KNOWLEDGE_FOLDER + '"';
  const HISTORY_LIMIT = 20;
  const MIN_VALID_DATE_ISO = "2000-01-01";

  const BASE_EXERCISES = [
    { name: "Выходы силой", unit: "повт.", field: "повторы" },
    { name: "Подтягивания", unit: "повт.", field: "повторы" },
    { name: "Высокие подтягивания", unit: "повт.", field: "повторы" },
    { name: "Брусья", unit: "повт.", field: "повторы" },
    { name: "Брусья на кольцах", unit: "повт.", field: "повторы" },
    { name: "Жим на брусьях", unit: "повт.", field: "повторы" },
    { name: "Жим на кольцах", unit: "повт.", field: "повторы" },
    { name: "Подтягивания на кольцах", unit: "повт.", field: "повторы" },
    { name: "Подводящие к выходу на кольцах", unit: "повт.", field: "повторы" },
    { name: "Отжимания на кольцах", unit: "повт.", field: "повторы" },
    { name: "Отжимания от пола", unit: "повт.", field: "повторы" },
    { name: "Приседания", unit: "повт.", field: "повторы" },
    { name: "Выпады", unit: "повт.", field: "повторы" },
    { name: "Подъёмы на носки", unit: "повт.", field: "повторы" },
    { name: "Вис на турнике", unit: "с", field: "секунды" },
    { name: "Передний вис", unit: "с", field: "секунды" },
    { name: "Уголок на турнике", unit: "с", field: "секунды" },
    { name: "Уголок на паралетсах", unit: "с", field: "секунды" }
  ];

  const SET_LINE_REGEX = /-\s*\(упражнение::\s*([^)]+)\)\s*\((повторы|секунды)::\s*(\d+(?:[.,]\d+)?)\)\s*(?:\(доп_вес_кг::\s*([^)]*)\)\s*)?(?:\(вариант::\s*([^)]*)\))?/;

  const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };
  const text = v => typeof v === "string" ? v.trim() : "";
  const empty = v => v == null || (typeof v === "string" && v.trim() === "");

  function openWorkoutCompanion(options = {}) {
    const plugin = getWorkoutPlugin();
    if (!plugin || typeof plugin.openWorkout !== "function") {
      notify("Включи плагин «Тренировки и таймер» (my-workout-companion) в настройках Obsidian.");
      return;
    }
    try {
      plugin.openWorkout(options);
    } catch (err) {
      notify("Не удалось открыть тренировку: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const catalogList = [...BASE_EXERCISES];
  const catalog = new Map(catalogList.map(e => [e.name, e]));
  const pluginCatalog = getWorkoutPlugin()?.programStore?.getCatalog?.() || [];
  for (const item of pluginCatalog) {
    if (item && item.name && !catalog.has(item.name)) {
      const entry = {
        name: item.name,
        unit: item.unit === "с" || item.field === "секунды" ? "с" : "повт.",
        field: item.field === "секунды" ? "секунды" : "повторы"
      };
      catalogList.push(entry);
      catalog.set(entry.name, entry);
    }
  }

  const order = name => {
    const idx = catalogList.findIndex(e => e.name === name);
    return idx === -1 ? 999 : idx;
  };

  function number(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(/^\+/, "").replace(/\s*кг$/i, "").replace(",", ".");
    if (!s) return null;
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
  }

  const sum = a => a.reduce((x, y) => x + y, 0);
  const average = values => values.length ? values.reduce((sumValue, item) => sumValue + item, 0) / values.length : null;
  const r2 = v => Math.round(v * 100) / 100;
  const fmt = v => v == null ? "—" : r2(v).toLocaleString("ru-RU");

  /**
   * Единая функция нормализации варианта упражнения и нагрузки для «Рекордов» и «Истории подходов».
   * Различает:
   * - loadType === "bw" (свой вес, доп_вес_кг === 0)
   * - loadType === "weighted" (доп. вес > 0, нормализован через r2)
   * - loadType === "unspec" (пустое значение / вес не указан, не приравнивается к 0)
   */
  function buildExerciseVariantSpec(rawName, rawVariant, rawWeight) {
    const cleanName = text(rawName);
    if (!cleanName) return null;
    const cleanVariant = text(rawVariant) || "Основной";

    let loadType = "unspec";
    let weightVal = null;

    if (!empty(rawWeight)) {
      const parsedW = number(rawWeight);
      if (parsedW === null || parsedW < 0) return null;
      const normW = r2(parsedW);
      if (normW === 0) {
        loadType = "bw";
        weightVal = 0;
      } else {
        loadType = "weighted";
        weightVal = normW;
      }
    }

    const weightToken = loadType === "weighted" ? String(weightVal) : loadType;
    const key = `${cleanName}|${cleanVariant}|${loadType}|${weightToken}`;
    const loadSortOrder = loadType === "bw" ? 0 : loadType === "weighted" ? 1 : 2;

    return {
      key,
      name: cleanName,
      variant: cleanVariant,
      loadType,
      weight: weightVal,
      loadSortOrder
    };
  }

  function asDate(v) {
    if (empty(v)) return null;
    try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
  }

  function toISODateString(v) {
    if (empty(v)) return null;
    const d = asDate(v);
    if (d) return d.toISODate();
    const m = moment(String(v).trim(), ["YYYY-MM-DD", moment.ISO_8601], true);
    return m.isValid() ? m.format("YYYY-MM-DD") : null;
  }

  function isValidTimeStr(v) {
    if (typeof v !== "string" || v.length !== 5 || v[2] !== ":") return false;
    const hh = Number(v.slice(0, 2));
    const mm = Number(v.slice(3, 5));
    return Number.isInteger(hh) && hh >= 0 && hh <= 23 && Number.isInteger(mm) && mm >= 0 && mm <= 59;
  }

  function renderLoadBadge(container, loadType, w) {
    if (loadType === "bw") {
      container.createSpan({ cls: "dh-wh-load-badge is-bw", text: "Свой вес" });
    } else if (loadType === "weighted" && w != null) {
      container.createSpan({ cls: "dh-wh-load-badge is-weighted", text: "+" + fmt(w) + " кг" });
    } else {
      container.createSpan({ cls: "dh-wh-load-badge is-unspec", text: "Не указано" });
    }
  }

function formatLoadTextForSummary(loadType, w) {
    if (loadType === "bw") return "(свой вес)";
    if (loadType === "weighted" && w != null) return "(+" + fmt(w) + " кг)";
    return "(вес не указан)";
  }

  const UI_STORAGE_KEY = "dh_workout_hub_ui_v2";
  function readJsonStorage(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }
  function writeJsonStorage(key, value) {
    try { window.localStorage?.setItem(key, JSON.stringify(value)); } catch {}
  }

  if (!window.__dhWorkoutHubUi) {
    window.__dhWorkoutHubUi = readJsonStorage(UI_STORAGE_KEY, {
      openHistoryKeys: []
    });
  }
  const hubUi = window.__dhWorkoutHubUi;
  function saveHubUi(patch) {
    Object.assign(hubUi, patch);
    writeJsonStorage(UI_STORAGE_KEY, hubUi);
  }

  function parseSetsFromContent(content) {
    const sets = [];
    if (!content) return sets;
    content.split(/\r?\n/).forEach(line => {
      const m = line.match(SET_LINE_REGEX);
      if (!m) return;
      const name = text(m[1]);
      const field = text(m[2]) === "секунды" ? "секунды" : "повторы";
      const val = number(m[3]);
      if (!name || val === null || val <= 0) return;

      const spec = buildExerciseVariantSpec(name, m[5], m[4]);
      if (!spec) return;

      sets.push({
        key: spec.key,
        name: spec.name,
        variant: spec.variant,
        loadType: spec.loadType,
        weight: spec.weight,
        loadSortOrder: spec.loadSortOrder,
        field,
        reps: val
      });
    });
    return sets;
  }

  ensureHealthStyles();
  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
  const minValidDate = dv.date(MIN_VALID_DATE_ISO).startOf("day");
  const root = dv.container.createDiv({ cls: "dh dh-trainings-hub" });

  const todayDirectPath = KNOWLEDGE_FOLDER + "/Тренировка " + todayISO + ".md";
  let todayFile = app.vault.getAbstractFileByPath(todayDirectPath);
  if (!todayFile) {
    const foundPage = dv.pages(SOURCE).array().find(p => p.тип === "Тренировка" && toISODateString(p.дата) === todayISO);
    if (foundPage) todayFile = app.vault.getAbstractFileByPath(foundPage.file.path);
  }

  let todaySets = [];
  let todayTitle = "";
  let todayDurationMin = null;
  if (todayFile) {
    const fm = app.metadataCache.getFileCache(todayFile)?.frontmatter || {};
    todayTitle = text(fm.название_тренировки) || todayFile.basename;
    todayDurationMin = number(fm.длительность_мин);
    try {
      const rawContent = await app.vault.read(todayFile);
      todaySets = parseSetsFromContent(rawContent);
    } catch {}
  }

  const launcherCard = root.createDiv({ cls: "dh-panel dh-wh-launcher" });
  const launcherTop = launcherCard.createDiv({ cls: "dh-wh-launcher-top" });
  const titleCol = launcherTop.createDiv({ cls: "dh-wh-title-col" });
  const headingRow = titleCol.createDiv({ cls: "dh-wh-heading-row" });

  const headingTitle = headingRow.createSpan({ cls: "dh-wh-heading-title" });
  renderHealthIcon(headingTitle, "dumbbell", "dh-icon dh-icon-title");
  headingTitle.createSpan({ text: "Тренировка сегодня" });

  if (todayFile) {
    const statusBadgeText = todayDurationMin
      ? "Завершена (" + todayDurationMin + " мин · " + todaySets.length + " подх.)"
      : "В процессе · подходов: " + todaySets.length;
    const noteLink = headingRow.createEl("a", {
      cls: "internal-link dh-wh-status-badge",
      text: statusBadgeText,
      attr: { href: todayFile.path }
    });
    noteLink.onclick = e => {
      e.preventDefault();
      app.workspace.openLinkText(todayFile.path, dv.currentFilePath, false);
    };
    titleCol.createDiv({ cls: "dh-wh-subtitle", text: todayTitle });
  } else {
    titleCol.createDiv({
      cls: "dh-wh-subtitle",
      text: "Сессия за сегодня (" + today.toFormat("dd.MM") + ") ещё не начата"
    });
  }

  const actionsCol = launcherTop.createDiv({ cls: "dh-wh-actions" });

  const activeTimer = getWorkoutPlugin()?.settings?.timer;
  if (activeTimer && activeTimer.endAt > Date.now()) {
    const remSec = Math.max(0, Math.ceil((activeTimer.endAt - Date.now()) / 1000));
    const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
    const ss = String(remSec % 60).padStart(2, "0");
    const timerChip = actionsCol.createEl("button", {
      cls: "dh-wh-timer-chip",
      attr: { type: "button", title: "Открыть таймер отдыха в плагине" }
    });
    renderHealthIcon(timerChip, "timer", "dh-icon dh-icon-sm");
    timerChip.createSpan({ text: "Отдых " + mm + ":" + ss });
    timerChip.onclick = () => openWorkoutCompanion();
  }

  const openPluginBtn = actionsCol.createEl("button", {
    cls: "dh-btn mod-cta dh-wh-cta-btn",
    attr: { type: "button" }
  });
  if (!todayFile) renderHealthIcon(openPluginBtn, "plus", "dh-icon dh-icon-sm");
  openPluginBtn.createSpan({ text: todayFile ? "Открыть тренировку" : "Начать тренировку" });
  openPluginBtn.onclick = () => {
    openWorkoutCompanion(todayFile ? { sessionPath: todayFile.path } : {});
  };

  if (todaySets.length > 0) {
    const setsRow = launcherCard.createDiv({ cls: "dh-wh-sets-row" });
    todaySets.forEach((s, idx) => {
      const exMeta = catalog.get(s.name) || { unit: s.field === "секунды" ? "с" : "повт." };
      const loadSuffix = s.loadType === "weighted" && s.weight != null
        ? " (+" + fmt(s.weight) + " кг)"
        : s.loadType === "unspec"
          ? " (вес не указан)"
          : "";
      setsRow.createSpan({
        cls: "dh-wh-set-chip",
        text: (idx + 1) + ". " + s.name + ": " + fmt(s.reps) + " " + exMeta.unit + loadSuffix
      });
    });
  }

  const all = [];

  for (const p of dv.pages(SOURCE)) {
    if (p.тип !== "Тренировка") continue;
    const isTodayLoaded = Boolean(todayFile && p.file.path === todayFile.path);
    const d = asDate(p.дата) || asDate(p.file.name.replace(/^Тренировка\s+/i, ""));
    if (!d || d < minValidDate || d > today) continue;

    const start = text(p.начало);
    const durationVal = isTodayLoaded && todayDurationMin !== null ? todayDurationMin : number(p.длительность_мин);
    const groups = new Map();

    if (isTodayLoaded && todaySets.length > 0) {
      todaySets.forEach(s => {
        let e = catalog.get(s.name);
        if (!e) {
          e = { name: s.name, unit: s.field === "секунды" ? "с" : "повт.", field: s.field };
          catalogList.push(e);
          catalog.set(s.name, e);
        }
        if (!groups.has(s.key)) {
          groups.set(s.key, {
            key: s.key,
            name: s.name,
            variant: s.variant,
            loadType: s.loadType,
            weight: s.weight,
            loadSortOrder: s.loadSortOrder,
            unit: e.unit,
            values: [],
            path: p.file.path,
            link: p.file.link,
            date: d,
            start,
            title: todayTitle || text(p.название_тренировки) || p.file.name,
            duration: durationVal
          });
        }
        groups.get(s.key).values.push(s.reps);
      });
    } else {
      for (const s of Array.from(p.file.lists ?? []).sort((a, b) => a.line - b.line)) {
        if (empty(s.упражнение)) continue;
        if (empty(s.повторы) && empty(s.секунды)) continue;
        const name = text(s.упражнение);
        let e = catalog.get(name);
        if (!e) {
          const isSec = !empty(s.секунды);
          e = { name, unit: isSec ? "с" : "повт.", field: isSec ? "секунды" : "повторы" };
          catalogList.push(e);
          catalog.set(name, e);
        }
        const value = number(s[e.field]);
        if (value === null || value <= 0) continue;

        const spec = buildExerciseVariantSpec(name, s.вариант, s.доп_вес_кг);
        if (!spec) continue;

        if (!groups.has(spec.key)) {
          groups.set(spec.key, {
            key: spec.key,
            name: spec.name,
            variant: spec.variant,
            loadType: spec.loadType,
            weight: spec.weight,
            loadSortOrder: spec.loadSortOrder,
            unit: e.unit,
            values: [],
            path: p.file.path,
            link: p.file.link,
            date: d,
            start,
            title: text(p.название_тренировки) || p.file.name,
            duration: durationVal
          });
        }
        groups.get(spec.key).values.push(value);
      }
    }

    if (!groups.size) continue;

    for (const g of groups.values()) {
      g.best = Math.max(...g.values);
      g.total = r2(sum(g.values));
      g.timeKnown = isValidTimeStr(start);
      g.order = d ? d.toMillis() + (g.timeKnown ? (+start.slice(0, 2) * 60 + +start.slice(3)) * 60000 : 0) : -Infinity;
      all.push(g);
    }
  }

  if (todayFile && todaySets.length && !all.some(g => g.path === todayFile.path)) {
    const groups = new Map();
    todaySets.forEach(s => {
      let e = catalog.get(s.name);
      if (!e) {
        e = { name: s.name, unit: s.field === "секунды" ? "с" : "повт.", field: s.field };
        catalogList.push(e);
        catalog.set(s.name, e);
      }
      if (!groups.has(s.key)) {
        groups.set(s.key, {
          key: s.key,
          name: s.name,
          variant: s.variant,
          loadType: s.loadType,
          weight: s.weight,
          loadSortOrder: s.loadSortOrder,
          unit: e.unit,
          values: [],
          path: todayFile.path,
          date: today,
          start: "",
          title: todayTitle,
          duration: todayDurationMin
        });
      }
      groups.get(s.key).values.push(s.reps);
    });
    for (const g of groups.values()) {
      g.best = Math.max(...g.values);
      g.total = r2(sum(g.values));
      g.timeKnown = false;
      g.order = today.toMillis() + 86399000;
      all.push(g);
    }
  }

const newest = (a, b) => b.order - a.order || a.path.localeCompare(b.path, "ru");

  const from = today.minus({ days: 29 });
  const recent = all.filter(g => g.date && g.date >= from && g.date <= today);
  const sessions = new Map(recent.map(g => [g.path, g]));
  const durations = [...sessions.values()].map(g => g.duration).filter(n => typeof n === "number" && n > 0);
  const periodRangeStr = from.toFormat("dd.MM") + "–" + today.toFormat("dd.MM");

const summarySection = root.createDiv({ cls: "dh-wh-summary-section" });
  const summaryHeader = summarySection.createDiv({ cls: "dh-wh-summary-head" });
  summaryHeader.createSpan({ cls: "dh-wh-summary-title", text: "Сводка тренировок" });
  summaryHeader.createSpan({
    cls: "dh-wh-summary-period",
    text: "Последние 30 дней (" + periodRangeStr + ")"
  });

  const stats = summarySection.createDiv({ cls: "dh-wh-stats-grid" });
  function card(label, value, badgeText) {
    const c = stats.createDiv({ cls: "dh-card dh-wh-stat-card" });
    c.createDiv({ cls: "dh-card-label", text: label });
    const valRow = c.createDiv({ cls: "dh-wh-stat-valrow" });
    valRow.createDiv({ cls: "dh-card-value dh-wh-num", text: value });
    if (badgeText) {
      valRow.createSpan({ cls: "dh-wh-stat-badge", text: badgeText });
    }
  }

  const weeklyFreq = sessions.size / (30 / 7);
  card(
    "Тренировки",
    String(sessions.size),
    sessions.size > 0 ? fmt(Math.round(weeklyFreq * 10) / 10) + " в неделю" : "нет сессий"
  );

  const avgDur = durations.length ? Math.round(sum(durations) / durations.length) : null;
  card(
    "Средняя тренировка",
    avgDur !== null ? avgDur + " мин" : "—",
    sessions.size > 0
      ? durations.length + " из " + sessions.size + " сессий"
      : "нет данных"
  );

  // Единая карта группировки по каноническому ключу `название|вариант|тип_нагрузки|вес_кг`
  const byVariant = new Map();
  for (const g of all) {
    if (!byVariant.has(g.key)) byVariant.set(g.key, []);
    byVariant.get(g.key).push(g);
  }

  const compareVariantGroups = (listA, listB) => {
    const a = listA[0];
    const b = listB[0];
    return (
      order(a.name) - order(b.name) ||
      a.name.localeCompare(b.name, "ru") ||
      a.variant.localeCompare(b.variant, "ru") ||
      a.loadSortOrder - b.loadSortOrder ||
      (a.weight ?? 0) - (b.weight ?? 0)
    );
  };

  const sortedVariantGroups = [...byVariant.values()].sort(compareVariantGroups);

function computeExNiceScale(minVal, maxVal, tickCount = 4) {
    let lo = Number.isFinite(minVal) ? minVal : 0;
    let hi = Number.isFinite(maxVal) ? maxVal : 10;
    if (lo === hi) {
      const pad = Math.max(Math.abs(hi) * 0.15, 2);
      lo = Math.max(0, lo - pad);
      hi = hi + pad;
    } else {
      const span = hi - lo;
      lo = Math.max(0, lo - span * 0.12);
      hi = hi + span * 0.12;
    }
    const rawStep = (hi - lo) / Math.max(1, tickCount - 1) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    let step;
    if (residual <= 1) step = 1 * mag;
    else if (residual <= 2) step = 2 * mag;
    else if (residual <= 2.5) step = 2.5 * mag;
    else if (residual <= 5) step = 5 * mag;
    else step = 10 * mag;

    if (step < 1) step = 1;

    const niceMin = Math.max(0, Math.floor(lo / step) * step);
    const niceMax = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
      ticks.push(Math.round(v * 100) / 100);
    }
    return {
      yMin: ticks[0],
      yMax: ticks[ticks.length - 1] || ticks[0] + 1,
      ticks
    };
  }

  function buildExMonotoneCubicPath(pts) {
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
    }
    const n = pts.length;
    const dx = [];
    const dy = [];
    const m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      dy[i] = pts[i + 1].y - pts[i].y;
      m[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
    }
    const t = new Array(n).fill(0);
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        t[i] = 0;
      } else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      const cp1x = pts[i].x + h;
      const cp1y = pts[i].y + t[i] * h;
      const cp2x = pts[i + 1].x - h;
      const cp2y = pts[i + 1].y - t[i + 1] * h;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
    }
    return d;
  }

  function formatExAxisDate(d, periodDays, spanDays) {
    if (!d) return "";
    if (periodDays !== null && periodDays <= 90) return d.toFormat("dd.MM");
    if (spanDays > 500) return d.toFormat("MM.yy");
    return d.setLocale("ru").toFormat("LLL yy").replace(".", "");
  }

  function buildExerciseSeries(allItems) {
    const map = new Map();
    for (const item of allItems) {
      if (!item || !item.name || !item.date) continue;
      const key = `${item.name}|${item.variant || "Основной"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name,
          variant: item.variant || "Основной",
          unit: item.unit || "повт.",
          series: [],
          loadChoices: new Map()
        });
      }
      const bucket = map.get(key);
      const best = Number.isFinite(item.best) ? item.best : 0;
      const total = Number.isFinite(item.total) ? item.total : 0;
      const weightValue = Number.isFinite(item.weight) ? item.weight : null;
      const loadType = item.loadType || "unspec";

      let loadToken = "unspec";
      let loadLabel = "Вес не указан";
      let loadSort = 999;
      if (loadType === "bw") {
        loadToken = "bw";
        loadLabel = "Свой вес";
        loadSort = 0;
      } else if (loadType === "weighted" && weightValue != null) {
        loadToken = "w:" + String(weightValue);
        loadLabel = "+" + fmt(weightValue) + " кг";
        loadSort = 1 + weightValue;
      }

      if (!bucket.loadChoices.has(loadToken)) {
        bucket.loadChoices.set(loadToken, { token: loadToken, label: loadLabel, sort: loadSort });
      }

      bucket.series.push({
        date: item.date,
        dateISO: item.date.toISODate(),
        best,
        total,
        sets: Array.isArray(item.values) ? item.values.length : 0,
        loadType,
        weight: weightValue,
        loadToken,
        loadLabel,
        order: item.order
      });
    }

    return [...map.values()]
      .map(bucket => {
        const ordered = [...bucket.series].sort((a, b) => a.order - b.order);
        const loads = [...bucket.loadChoices.values()].sort((a, b) => a.sort - b.sort);
        return {
          ...bucket,
          ordered,
          loads,
          sessions: ordered.length
        };
      })
      .filter(bucket => bucket.ordered.length > 0)
      .sort((a, b) => (b.sessions - a.sessions) || a.name.localeCompare(b.name, "ru"));
  }

  const exerciseSeries = buildExerciseSeries(all);
  const analyticsLayout = dv.container.querySelector(".dh-health-analytics-layout") || root.createDiv({ cls: "dh-health-analytics-layout" });
  const progressState = (() => {
    try {
      const raw = localStorage.getItem("dh-health-exercise-progress-v1");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  if (exerciseSeries.length) {
    const defaultKey = exerciseSeries[0].key;
    let selectedExerciseKey = exerciseSeries.some(item => item.key === progressState.exerciseKey) ? progressState.exerciseKey : defaultKey;
    let selectedMetric = ["best", "total", "average"].includes(progressState.metric) ? progressState.metric : "best";
    let selectedPeriod = [7, 30, 90, 365, null].includes(progressState.period) ? progressState.period : 90;
    let selectedLoad = typeof progressState.load === "string" ? progressState.load : "all";

    const progressPanel = analyticsLayout.createEl("details", {
      cls: "dh-ex-panel",
      attr: { style: "--dh-block-accent: #7e9ad9;" }
    });
    progressPanel.open = progressState.open === true;

    const persistProgressState = () => {
      try {
        localStorage.setItem("dh-health-exercise-progress-v1", JSON.stringify({
          exerciseKey: selectedExerciseKey,
          metric: selectedMetric,
          period: selectedPeriod,
          load: selectedLoad,
          open: progressPanel.open
        }));
      } catch {}
    };

    const progressSummary = progressPanel.createEl("summary", { cls: "dh-ex-summary" });
    const exSumTitle = progressSummary.createDiv({ cls: "dh-ex-summary-title" });
    exSumTitle.createSpan({ cls: "dh-ex-chevron", text: "▶" });
    renderHealthIcon(exSumTitle, "dumbbell", "dh-icon dh-icon-title");
    exSumTitle.createSpan({ text: "Упражнения" });
    const exSummaryMeta = progressSummary.createSpan({ cls: "dh-ex-summary-meta" });

    const progressBody = progressPanel.createDiv({ cls: "dh-ex-body" });

    // 1. Главное число + изменение за период
    const exHero = progressBody.createDiv({ cls: "dh-ex-hero" });
    const exHeroLeft = exHero.createDiv({ cls: "dh-ex-hero-left" });
    const exHeroValEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-val", text: "—" });
    const exHeroUnitEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-unit", text: "" });
    const exHeroDeltaEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-delta", attr: { style: "display: none;" } });

    // 2. Упражнение и нагрузка в одну чистую строку
    const selectsRow = progressBody.createDiv({ cls: "dh-ex-selects-row" });
    const exerciseSelect = selectsRow.createEl("select", {
      cls: "dh-ex-select",
      attr: { "aria-label": "Упражнение" }
    });
    const loadSelect = selectsRow.createEl("select", {
      cls: "dh-ex-select",
      attr: { "aria-label": "Нагрузка" }
    });

    exerciseSeries.forEach(item => {
      const label = `${item.name}${item.variant !== "Основной" ? " · " + item.variant : ""}`;
      const option = exerciseSelect.createEl("option", { text: label, attr: { value: item.key } });
      option.selected = item.key === selectedExerciseKey;
    });

    const syncLoadOptions = (exercise) => {
      loadSelect.replaceChildren();
      const opts = [{ token: "all", label: "Все веса" }, ...exercise.loads];
      if (!opts.some(o => o.token === selectedLoad)) {
        selectedLoad = exercise.loads.length === 1 ? exercise.loads[0].token : "all";
      }
      opts.forEach(o => {
        const opt = loadSelect.createEl("option", { text: o.label, attr: { value: o.token } });
        opt.selected = o.token === selectedLoad;
      });
    };

    // 3. Метрика (Лучший / Сумма / Среднее) и период (7д / 30д / 90д / Год / Всё)
    const exSegRow = progressBody.createDiv({ cls: "dh-seg-row" });

    const exMetricBar = exSegRow.createDiv({ cls: "dh-seg-group" });
    const exMetricOptions = [
      { val: "best", label: "Лучший" },
      { val: "total", label: "Сумма" },
      { val: "average", label: "Среднее" }
    ];
    const exMetricBtns = [];
    exMetricOptions.forEach(m => {
      const btn = exMetricBar.createEl("button", {
        cls: "dh-seg-item" + (m.val === selectedMetric ? " is-active" : ""),
        text: m.label,
        attr: { type: "button" }
      });
      exMetricBtns.push({ btn, val: m.val });
      btn.onclick = () => {
        if (selectedMetric === m.val) return;
        selectedMetric = m.val;
        exMetricBtns.forEach(item => item.btn.classList.toggle("is-active", item.val === selectedMetric));
        persistProgressState();
        renderProgressBlock();
      };
    });

    const exPeriodBar = exSegRow.createDiv({ cls: "dh-seg-group" });
    const exPeriodOptions = [
      { val: 7, label: "7д" },
      { val: 30, label: "30д" },
      { val: 90, label: "90д" },
      { val: 365, label: "Год" },
      { val: null, label: "Всё" }
    ];
    const exPeriodBtns = [];
    exPeriodOptions.forEach(p => {
      const btn = exPeriodBar.createEl("button", {
        cls: "dh-seg-item" + (p.val === selectedPeriod ? " is-active" : ""),
        text: p.label,
        attr: { type: "button" }
      });
      exPeriodBtns.push({ btn, val: p.val });
      btn.onclick = () => {
        if (selectedPeriod === p.val) return;
        selectedPeriod = p.val;
        exPeriodBtns.forEach(item => item.btn.classList.toggle("is-active", item.val === selectedPeriod));
        persistProgressState();
        renderProgressBlock();
      };
    });

    // 4. Контейнер SVG-графика
    const exChartWrap = progressBody.createDiv({ cls: "dh-chart-box" });

    // 5. Компактная строка сводки под графиком
    const exFooter = progressBody.createDiv({ cls: "dh-chart-footer" });

    const renderProgressBlock = () => {
      const exercise = exerciseSeries.find(item => item.key === selectedExerciseKey) || exerciseSeries[0];
      syncLoadOptions(exercise);

      const filteredSeries = exercise.ordered.filter(item => {
        if (selectedLoad === "all") return true;
        return item.loadToken === selectedLoad;
      });

      const periodSeries = filteredSeries.filter(item => {
        if (selectedPeriod === null) return true;
        const endDate = today.startOf("day");
        const startDate = endDate.minus({ days: selectedPeriod - 1 });
        return item.date && item.date >= startDate && item.date <= endDate;
      });

      const metricValue = item => selectedMetric === "total"
        ? item.total
        : selectedMetric === "average"
          ? (item.sets ? r2(item.total / item.sets) : null)
          : item.best;

      // Если выбран режим «Все веса» и за один день было несколько весов, берём лучший результат дня, чтобы даты не дублировались
      const byDayMap = new Map();
      for (const item of periodSeries) {
        const val = metricValue(item);
        if (!Number.isFinite(val)) continue;
        const prev = byDayMap.get(item.dateISO);
        if (!prev || val > prev.value) {
          byDayMap.set(item.dateISO, { item, value: val });
        }
      }
      const dailyPoints = [...byDayMap.values()];

      const shortExName = exercise.name + (exercise.variant !== "Основной" ? ` (${exercise.variant})` : "");
      const periodText = selectedPeriod === null ? "всё" : `${selectedPeriod} дн.`;
      exSummaryMeta.textContent = `${shortExName} · ${periodText}`;

      const spanDays = dailyPoints.length >= 2
        ? Math.max(1, Math.round(dailyPoints[dailyPoints.length - 1].item.date.diff(dailyPoints[0].item.date, "days").days))
        : (selectedPeriod || 30);

      const chartData = dailyPoints.map(({ item, value }) => {
        const loadHint = item.loadType === "weighted" && item.weight != null
          ? ` · +${fmt(item.weight)} кг`
          : item.loadType === "bw"
            ? " · свой вес"
            : "";
        return {
          axisDate: formatExAxisDate(item.date, selectedPeriod, spanDays),
          value,
          tooltipDate: item.date.toFormat("dd.MM.yyyy") + loadHint,
          tooltipValue: `${fmt(value)} ${exercise.unit}`
        };
      });

      const currentVal = chartData.length ? chartData[chartData.length - 1].value : null;
      const firstVal = chartData.length > 1 ? chartData[0].value : null;
      const deltaVal = currentVal !== null && firstVal !== null ? r2(currentVal - firstVal) : null;

      const accentColor = deltaVal == null ? "#7e9ad9" : deltaVal > 0 ? "#4aab80" : deltaVal < 0 ? "#d85b57" : "#7e9ad9";
      progressPanel.style.setProperty("--dh-block-accent", accentColor);

      if (currentVal !== null) {
        exHeroValEl.textContent = fmt(currentVal);
        exHeroUnitEl.textContent = exercise.unit;
      } else {
        exHeroValEl.textContent = "—";
        exHeroUnitEl.textContent = "";
      }

      if (deltaVal !== null) {
        const sign = deltaVal > 0 ? "+" : deltaVal < 0 ? "−" : "";
        exHeroDeltaEl.textContent = `${sign}${fmt(Math.abs(deltaVal))} ${exercise.unit}`;
        exHeroDeltaEl.className = "dh-ex-hero-delta" + (deltaVal > 0 ? " is-up" : deltaVal < 0 ? " is-down" : "");
        exHeroDeltaEl.style.display = "inline-flex";
      } else {
        exHeroDeltaEl.style.display = "none";
      }

      exFooter.replaceChildren();
      const periodVals = chartData.map(d => d.value);
      const bestInPeriod = periodVals.length ? Math.max(...periodVals) : null;
      const avgInPeriod = periodVals.length ? average(periodVals) : null;

      [
        ["Макс.", bestInPeriod !== null ? `${fmt(bestInPeriod)} ${exercise.unit}` : "—"],
        ["Среднее", avgInPeriod !== null ? `${fmt(avgInPeriod)} ${exercise.unit}` : "—"],
        ["Тренировок", String(chartData.length)]
      ].forEach(([k, v]) => {
        const box = exFooter.createDiv({ cls: "dh-chart-stat" });
        box.createSpan({ cls: "dh-chart-stat-k", text: k });
        box.createSpan({ cls: "dh-chart-stat-v", text: v });
      });

      exChartWrap.replaceChildren();

      if (chartData.length < 2) {
        const emptyEl = exChartWrap.createDiv({ cls: "dh-chart-empty" });
        if (chartData.length === 1) {
          emptyEl.createSpan({
            text: `Записана 1 тренировка (${chartData[0].tooltipDate}: ${chartData[0].tooltipValue}).`,
            attr: { style: "font-weight: 600; color: var(--text-normal);" }
          });
          emptyEl.createSpan({
            text: "Выбери период «Всё» или «Все веса», чтобы построить график.",
            attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
          });
        } else {
          emptyEl.createSpan({ text: "За выбранный период тренировок нет." });
        }
        return;
      }

      const boxRect = exChartWrap.getBoundingClientRect();
      const svgW = Math.max(320, Math.round(boxRect.width || 560));
      const svgH = 220;
      const pad = { left: 42, right: 16, top: 16, bottom: 26 };
      const plotW = svgW - pad.left - pad.right;
      const plotH = svgH - pad.top - pad.bottom;

      const { yMin, yMax, ticks } = computeExNiceScale(Math.min(...periodVals), Math.max(...periodVals), 4);
      const yRange = yMax - yMin || 1;

      const xFor = idx => pad.left + (idx * plotW) / (chartData.length - 1);
      const yFor = val => pad.top + plotH - ((val - yMin) / yRange) * plotH;

      const svg = createHealthSvgNode(exChartWrap, "svg", {
        class: "dh-chart-svg",
        viewBox: `0 0 ${svgW} ${svgH}`,
        preserveAspectRatio: "none"
      });

      ticks.forEach(tickVal => {
        const y = yFor(tickVal);
        createHealthSvgNode(svg, "line", {
          x1: pad.left, x2: svgW - pad.right, y1: y, y2: y,
          stroke: "var(--background-modifier-border)", "stroke-width": "1"
        });
        const lbl = createHealthSvgNode(svg, "text", {
          x: pad.left - 8, y: y + 4, "text-anchor": "end",
          fill: "var(--text-muted)", "font-size": "11"
        });
        lbl.textContent = fmt(tickVal);
      });

      const xLabelCount = Math.min(chartData.length, 5);
      for (let t = 0; t < xLabelCount; t++) {
        const idx = xLabelCount === 1 ? 0 : Math.round((t * (chartData.length - 1)) / (xLabelCount - 1));
        const anchor = t === 0 ? "start" : t === xLabelCount - 1 ? "end" : "middle";
        const lbl = createHealthSvgNode(svg, "text", {
          x: xFor(idx), y: svgH - 6, "text-anchor": anchor,
          fill: "var(--text-muted)", "font-size": "11"
        });
        lbl.textContent = chartData[idx].axisDate;
      }

      const mainCoords = chartData.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));
      const mainPathD = buildExMonotoneCubicPath(mainCoords);
      const areaPathD = `${mainPathD} L ${mainCoords[mainCoords.length - 1].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} L ${mainCoords[0].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

      const gradId = "dhExGrad-" + Math.random().toString(36).slice(2, 7);
      const defs = createHealthSvgNode(svg, "defs");
      const grad = createHealthSvgNode(defs, "linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
      createHealthSvgNode(grad, "stop", { offset: "0%", "stop-color": accentColor, "stop-opacity": "0.22" });
      createHealthSvgNode(grad, "stop", { offset: "100%", "stop-color": accentColor, "stop-opacity": "0.0" });

      createHealthSvgNode(svg, "path", { d: areaPathD, fill: `url(#${gradId})` });
      createHealthSvgNode(svg, "path", {
        d: mainPathD, fill: "none", stroke: accentColor,
        "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round"
      });

      mainCoords.forEach((pt, idx) => {
        const isLast = idx === mainCoords.length - 1;
        if (isLast) {
          createHealthSvgNode(svg, "circle", {
            cx: pt.x, cy: pt.y, r: "7.5",
            fill: accentColor, opacity: "0.22", "pointer-events": "none"
          });
        }
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: isLast ? "4.5" : "3",
          fill: isLast ? accentColor : "var(--background-primary)",
          stroke: accentColor,
          "stroke-width": isLast ? "2" : "1.8",
          "pointer-events": "none"
        });
      });

      const guideLine = createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH,
        class: "dh-chart-guide"
      });
      const activeDot = createHealthSvgNode(svg, "circle", {
        cx: mainCoords[0].x, cy: mainCoords[0].y, r: "6",
        fill: "var(--background-secondary)", stroke: accentColor, "stroke-width": "2.6",
        class: "dh-chart-active-dot"
      });

      const tooltip = exChartWrap.createDiv({ cls: "dh-chart-tooltip" });
      const ttDate = tooltip.createSpan({ cls: "dh-chart-tooltip-date" });
      const ttVal = tooltip.createSpan({ cls: "dh-chart-tooltip-val" });

      const showExPoint = (idx) => {
        const d = chartData[idx];
        const c = mainCoords[idx];
        if (!d || !c) return;
        guideLine.setAttribute("x1", String(c.x));
        guideLine.setAttribute("x2", String(c.x));
        guideLine.style.opacity = "1";

        activeDot.setAttribute("cx", String(c.x));
        activeDot.setAttribute("cy", String(c.y));
        activeDot.style.opacity = "1";

        ttDate.textContent = d.tooltipDate;
        ttVal.textContent = d.tooltipValue;

        const clampedX = Math.max(64, Math.min(svgW - 64, c.x));
        tooltip.style.left = `${clampedX}px`;
        tooltip.style.top = `${Math.max(36, c.y)}px`;
        tooltip.classList.add("is-visible");
      };

      const hideExPoint = () => {
        guideLine.style.opacity = "0";
        activeDot.style.opacity = "0";
        tooltip.classList.remove("is-visible");
      };

      const handlePointer = (e) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const relX = ((e.clientX - rect.left) / rect.width) * svgW;
        let bestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < mainCoords.length; i++) {
          const dist = Math.abs(mainCoords[i].x - relX);
          if (dist < minDist) {
            minDist = dist;
            bestIdx = i;
          }
        }
        showExPoint(bestIdx);
      };

      svg.addEventListener("pointermove", handlePointer);
      svg.addEventListener("pointerdown", handlePointer);
      svg.addEventListener("pointerleave", hideExPoint);
    };

    progressPanel.ontoggle = () => {
      persistProgressState();
      if (progressPanel.open) renderProgressBlock();
    };

    if (typeof ResizeObserver !== "undefined") {
      const exRo = new ResizeObserver(() => {
        if (progressPanel.open && exChartWrap.isConnected) renderProgressBlock();
      });
      exRo.observe(exChartWrap);
    }

    exerciseSelect.onchange = () => {
      selectedExerciseKey = exerciseSelect.value;
      persistProgressState();
      renderProgressBlock();
    };
    loadSelect.onchange = () => {
      selectedLoad = loadSelect.value;
      persistProgressState();
      renderProgressBlock();
    };

    renderProgressBlock();
  }

  const dynamicRecords = sortedVariantGroups.filter(list => list[0].unit === "повт.");

  if (dynamicRecords.length) {
    const recordsPanel = root.createDiv({ cls: "dh-panel dh-wh-records-panel" });

    const recordsHead = recordsPanel.createDiv({ cls: "dh-wh-records-head" });
    const recordsTitle = recordsHead.createDiv({ cls: "dh-wh-records-title" });
    renderHealthIcon(recordsTitle, "trophy", "dh-icon dh-icon-title");
    recordsTitle.createSpan({ text: "Рекорды упражнений" });
    recordsHead.createDiv({
      cls: "dh-wh-records-sub",
      text: "Лучший подход за тренировку внутри одного упражнения, варианта техники и одинакового дополнительного веса"
    });

    const tableEl = recordsPanel.createEl("table", { cls: "dh-table dh-wh-records-table" });
    const thead = tableEl.createEl("thead");
    const trH = thead.createEl("tr");
    trH.createEl("th", { text: "Упражнение" });
    trH.createEl("th", { text: "Нагрузка" });
    trH.createEl("th", { text: "Рекорд" });
    trH.createEl("th", { cls: "is-right", text: "Дата рекорда" });

    const tbody = tableEl.createEl("tbody");

    dynamicRecords.forEach(list => {
      const sorted = [...list].sort(newest);
      const recordSession = sorted.reduce((acc, g) => (g.best > acc.best ? g : acc), sorted[0]);

      const tr = tbody.createEl("tr");

      const tdName = tr.createEl("td");
      tdName.createEl("strong", { text: recordSession.name });
      if (recordSession.variant !== "Основной") {
        tdName.createSpan({ cls: "dh-wh-variant-tag", text: "(" + recordSession.variant + ")" });
      }

      const tdLoad = tr.createEl("td");
      renderLoadBadge(tdLoad, recordSession.loadType, recordSession.weight);

      const tdBest = tr.createEl("td");
      const bestWrap = tdBest.createSpan({ cls: "dh-wh-best-wrap" });
      renderHealthIcon(bestWrap, "award", "dh-icon dh-icon-sm dh-wh-best-icon");
      bestWrap.createSpan({ cls: "dh-wh-best-val", text: fmt(recordSession.best) });
      bestWrap.createSpan({ cls: "dh-wh-best-unit", text: recordSession.unit });

      const tdDate = tr.createEl("td", { cls: "is-right" });
      const aLink = tdDate.createEl("a", {
        cls: "internal-link dh-wh-date-link",
        text: recordSession.date ? recordSession.date.toFormat("dd.MM.yyyy") : "—",
        attr: { href: recordSession.path }
      });
      aLink.onclick = e => { e.preventDefault(); app.workspace.openLinkText(recordSession.path, dv.currentFilePath, false); };
    });
  }

  // Блок «История подходов» использует ту же самую группировку sortedVariantGroups (byVariant), что и «Рекорды»
  if (sortedVariantGroups.length) {
    const openSet = new Set(hubUi.openHistoryKeys || []);
    const historyRoot = root.createDiv({ cls: "dh-wh-history-section" });
    const historyTitle = historyRoot.createDiv({ cls: "dh-wh-history-title" });
    renderHealthIcon(historyTitle, "history", "dh-icon dh-icon-title");
    historyTitle.createSpan({ text: "История подходов" });

    for (const rawList of sortedVariantGroups) {
      const list = [...rawList].sort(newest);
      if (!list.length) continue;

      const sample = list[0];
      const detailsKey = sample.key;
      const part = list.slice(0, HISTORY_LIMIT);
      const box = historyRoot.createEl("details", { cls: "dh-details" });
      if (openSet.has(detailsKey)) box.open = true;
      box.ontoggle = () => {
        const cur = new Set(hubUi.openHistoryKeys || []);
        if (box.open) cur.add(detailsKey);
        else cur.delete(detailsKey);
        saveHubUi({ openHistoryKeys: [...cur] });
      };

      const variantSuffix = sample.variant !== "Основной" ? " (" + sample.variant + ")" : "";
      const loadLabel = formatLoadTextForSummary(sample.loadType, sample.weight);
      const bestInGroup = Math.max(...list.map(g => g.best));
      const summaryText =
        sample.name +
        variantSuffix +
        " " +
        loadLabel +
        " · тренировок: " +
        list.length +
        " · лучший: " +
        fmt(bestInGroup) +
        " " +
        sample.unit;

      box.createEl("summary", { cls: "dh-wh-history-summary", text: summaryText });

      const subTable = box.createEl("table", { cls: "dh-table dh-wh-history-table" });
      const tHead = subTable.createEl("thead");
      const rH = tHead.createEl("tr");
      ["Дата", "Подходы", "Лучший", "Сумма", "Время"].forEach(h => rH.createEl("th", { text: h }));

      const tBody = subTable.createEl("tbody");
      part.forEach(g => {
        const tr = tBody.createEl("tr");
        const tdD = tr.createEl("td");
        const aL = tdD.createEl("a", { text: g.date ? g.date.toFormat("dd.MM") : "—", cls: "internal-link" });
        aL.onclick = ev => { ev.preventDefault(); app.workspace.openLinkText(g.path, dv.currentFilePath, false); };

        tr.createEl("td", { text: g.values.map(fmt).join(" · ") });
        tr.createEl("td", { cls: "dh-wh-td-strong", text: fmt(g.best) + " " + sample.unit });
        tr.createEl("td", { text: fmt(g.total) + " " + sample.unit });
        tr.createEl("td", { cls: "dh-wh-td-muted", text: g.duration > 0 ? fmt(g.duration) + " мин" : "—" });
      });
    }
  }
}

if (section === "all" || section === "stats") {
  renderHealthStats();
}
if (section === "all" || section === "workouts") {
  renderWorkoutsHub();
}