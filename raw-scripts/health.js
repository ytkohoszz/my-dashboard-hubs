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

  function openNutritionTracker(dateISO) {
    const plugin = getNutritionPlugin();
    if (!plugin || typeof plugin.openNutrition !== "function") {
      notify("Включи плагин «Питание и БЖУ» (my-nutrition-tracker) в настройках Obsidian.");
      return;
    }
    try {
      plugin.openNutrition({ dateISO });
    } catch (err) {
      notify("Не удалось открыть дневник питания: " + (err instanceof Error ? err.message : String(err)));
    }
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
      cls: "dh-card",
      attr: {
        role: "button",
        "aria-expanded": "false",
        style: [
          "position: relative;",
          "overflow: visible;",
          "cursor: pointer;",
          "user-select: none;",
          "border: 1px solid var(--background-modifier-border);",
          "border-top: 2px solid " + accent + "88;",
          "transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;"
        ].join(" ")
      }
    });

    c.createDiv({ cls: "dh-card-label", text: label });

    const valRow = c.createDiv({
      attr: {
        style: "display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 2px;"
      }
    });
    valRow.createDiv({ cls: "dh-card-value", text: value });

    if (deltaBadge) {
      valRow.createSpan({
        text: deltaBadge.text,
        attr: {
          style: [
            "font-size: 0.78rem;",
            "font-weight: 600;",
            "padding: 2px 8px;",
            "border-radius: 6px;",
            "color: " + deltaBadge.color + ";",
            "background: " + deltaBadge.bg + ";",
            "border: 1px solid " + deltaBadge.border + ";",
            "white-space: nowrap;"
          ].join(" ")
        }
      });
    } else {
      valRow.createSpan({
        text: "—",
        attr: { style: "font-size: 0.82rem; font-weight: 600; color: var(--text-muted);" }
      });
    }

    const popover = c.createDiv({
      attr: {
        style: [
          "position: absolute;",
          "left: 0;",
          "right: 0;",
          "top: calc(100% + 8px);",
          "z-index: 90;",
          "padding: 10px 12px;",
          "border-radius: 8px;",
          "background: var(--background-secondary);",
          "border: 1px solid " + accent + "66;",
          "box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);",
          "display: flex;",
          "flex-direction: column;",
          "gap: 6px;",
          "font-size: 0.75rem;",
          "line-height: 1.3;",
          "opacity: 0;",
          "visibility: hidden;",
          "transform: translateY(-4px);",
          "pointer-events: none;",
          "transition: opacity 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0.18s;"
        ].join(" ")
      }
    });

    rows.forEach((r, idx) => {
      const rowEl = popover.createDiv({
        attr: {
          style: [
            "display: flex;",
            "justify-content: space-between;",
            "align-items: center;",
            "gap: 10px;",
            idx > 0 ? "padding-top: 5px; border-top: 1px solid var(--background-modifier-border);" : ""
          ].join(" ")
        }
      });

      rowEl.createSpan({
        text: r.k,
        attr: { style: "color: var(--text-muted);" }
      });

      if (r.minMax) {
        const mmWrap = rowEl.createDiv({ attr: { style: "display: flex; align-items: center; gap: 6px;" } });
        const minStyle = r.neutralMinMax
          ? "background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);"
          : "background: #d85b571a; color: #d85b57;";
        const maxStyle = r.neutralMinMax
          ? "background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);"
          : "background: #4aab801a; color: #4aab80;";

        mmWrap.createSpan({
          text: "мин " + r.minMax.min,
          attr: { style: "font-size: 0.72rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; " + minStyle }
        });
        mmWrap.createSpan({
          text: "макс " + r.minMax.max,
          attr: { style: "font-size: 0.72rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; " + maxStyle }
        });
      } else {
        rowEl.createSpan({
          text: r.v,
          attr: {
            style: "font-weight: 600; color: " + (r.vColor || "var(--text-normal)") + "; text-align: right;"
          }
        });
      }
    });

    const setVisualState = (isOpen) => {
      c.style.borderColor = isOpen ? accent : "var(--background-modifier-border)";
      c.style.borderTop = "2px solid " + (isOpen ? accent : accent + "88");
      c.style.boxShadow = isOpen ? "0 6px 16px rgba(0, 0, 0, 0.18)" : "none";
      c.style.transform = isOpen ? "translateY(-1px)" : "translateY(0)";

      popover.style.opacity = isOpen ? "1" : "0";
      popover.style.visibility = isOpen ? "visible" : "hidden";
      popover.style.transform = isOpen ? "translateY(0)" : "translateY(-4px)";
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

  // --- Панель сегодняшнего дня: КБЖУ из плагина питания + быстрый ввод только веса ---
  const todayDiaryPage = byDate.get(todayISO) || null;
  const diaryFile = todayDiaryPage ? app.vault.getAbstractFileByPath(todayDiaryPage.file.path) : null;
  const curW = weight.has(todayISO) ? weight.get(todayISO) : null;
  const curC = calories.has(todayISO) ? calories.get(todayISO) : null;
  const curP = proteins.has(todayISO) ? proteins.get(todayISO) : null;
  const curF = fats.has(todayISO) ? fats.get(todayISO) : null;
  const curU = carbs.has(todayISO) ? carbs.get(todayISO) : null;

  const isDietDone = Boolean(
    todayDiaryPage?.диета === true ||
    (calorieGoal !== null && curC !== null && curC >= calorieGoal)
  );

  const quickBar = root.createDiv({
    attr: {
      style: "margin-top: 12px; padding: 12px 14px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 10px; display: flex; flex-direction: column; gap: 10px;"
    }
  });

  const topBarRow = quickBar.createDiv({
    attr: { style: "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;" }
  });

  const leftInfo = topBarRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });
  leftInfo.createSpan({
    text: "🥗 Сегодня (" + today.toFormat("dd.MM") + "):",
    attr: { style: "font-size: 0.86rem; font-weight: 600; color: var(--text-normal);" }
  });

  if (calorieGoal !== null) {
    const pct = curC !== null ? Math.min(100, Math.round((curC / calorieGoal) * 100)) : 0;
    leftInfo.createSpan({
      text: isDietDone
        ? "✓ Диета закрыта (" + fmt(curC || 0, 0, 0) + " / " + calorieGoal + " ккал)"
        : (curC !== null ? fmt(curC, 0, 0) + " из " + calorieGoal + " ккал (" + pct + "%)" : "Цель: " + calorieGoal + " ккал"),
      attr: {
        style: "font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; " +
          (isDietDone
            ? "background: #4aab8018; color: #4aab80; border: 1px solid #4aab8044;"
            : "background: var(--background-primary); color: var(--text-muted); border: 1px solid var(--background-modifier-border);")
      }
    });
  } else {
    leftInfo.createSpan({
      text: curC !== null ? fmt(curC, 0, 0) + " ккал" : "Питание пока не внесено",
      attr: {
        style: "font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: var(--background-primary); color: " + (curC !== null ? "var(--text-normal)" : "var(--text-muted)") + "; border: 1px solid var(--background-modifier-border); font-variant-numeric: tabular-nums;"
      }
    });
  }

  if (curP !== null || curF !== null || curU !== null) {
    leftInfo.createSpan({
      text: "Б: " + fmt(curP ?? 0, 0, 1) + " г · Ж: " + fmt(curF ?? 0, 0, 1) + " г · У: " + fmt(curU ?? 0, 0, 1) + " г",
      attr: {
        style: "font-size: 0.74rem; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: var(--background-primary); color: var(--text-muted); border: 1px solid var(--background-modifier-border); font-variant-numeric: tabular-nums;"
      }
    });
  }

  const controlsWrap = topBarRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

  const openNutBtn = controlsWrap.createEl("button", {
    cls: "dh-btn mod-cta",
    text: "🥗 Питание и БЖУ",
    attr: {
      type: "button",
      title: "Открыть дневник питания и базу продуктов",
      style: "height: 30px; font-size: 0.8rem; font-weight: 600; padding: 0 12px; border-radius: 8px; cursor: pointer;"
    }
  });
  openNutBtn.onclick = () => openNutritionTracker(todayISO);

  if (diaryFile) {
    const wInput = controlsWrap.createEl("input", {
      attr: {
        type: "text",
        inputmode: "decimal",
        placeholder: "Вес (кг)",
        value: curW !== null ? String(curW).replace(".", ",") : "",
        style: "width: 92px; height: 30px; font-size: 0.8rem; padding: 2px 8px; border-radius: 8px;"
      }
    });

    const saveQuickBtn = controlsWrap.createEl("button", {
      cls: "dh-btn",
      text: "Сохранить вес",
      attr: {
        type: "button",
        style: "height: 30px; font-size: 0.78rem; padding: 0 10px; border-radius: 8px; cursor: pointer;"
      }
    });

    const commitQuickWeight = async () => {
      if (!diaryFile || saveQuickBtn.disabled) return;
      const rawW = wInput.value.trim().replace(",", ".");

      let nextW = null;
      if (rawW !== "") {
        const parsedW = Number(rawW);
        if (!Number.isFinite(parsedW) || parsedW < 20 || parsedW > 300) {
          notify("Вес должен быть числом от 20 до 300 кг.");
          return;
        }
        nextW = Math.round(parsedW * 10) / 10;
      }

      saveQuickBtn.disabled = true;
      try {
        await app.fileManager.processFrontMatter(diaryFile, fm => {
          if (nextW === null) delete fm.вес_кг;
          else fm.вес_кг = nextW;
        });
        notify("Вес за сегодня обновлён.");
      } catch (e) {
        notify("Ошибка сохранения веса: " + (e?.message || e));
      } finally {
        saveQuickBtn.disabled = false;
      }
    };

    saveQuickBtn.onclick = commitQuickWeight;
    wInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); commitQuickWeight(); } };
  }

  if (calorieGoal !== null && curC !== null && curC > 0) {
    const pct = Math.min(100, Math.round((curC / calorieGoal) * 100));
    const track = quickBar.createDiv({
      attr: { style: "height: 5px; border-radius: 99px; background: var(--background-modifier-border); overflow: hidden;" }
    });
    track.createDiv({
      attr: {
        style: "height: 100%; width: " + pct + "%; background: " + (isDietDone ? "#4aab80" : "var(--interactive-accent)") + "; transition: width 0.2s ease;"
      }
    });
  }

  const styleEl = document.getElementById("dh-health-dynamic-style") || document.createElement("style");
  styleEl.id = "dh-health-dynamic-style";
  styleEl.textContent = `
    .dashboard-home .dh-health-analytics-layout {
      --dh-c-weight: #e5a158;
      --dh-c-calories: #8b8dff;
      --dh-c-proteins: #4aab80;
      --dh-c-fats: #d78f60;
      --dh-c-carbs: #599ed6;
      --dh-c-up: #4aab80;
      --dh-c-down: #d85b57;
      --dh-c-flat: #7e9ad9;
      --dh-ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 14px;
      margin-top: 14px;
    }
    .dashboard-home .dh-health-analytics-layout > * {
      min-width: 0;
      margin-top: 0 !important;
    }

    /* Карточки-аккордеоны обоих блоков */
    .dashboard-home .dh-dyn-panel,
    .dashboard-home .dh-ex-panel {
      border-radius: 12px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      overflow: hidden;
      transition: border-color 220ms var(--dh-ease-out), box-shadow 220ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-panel[open],
    .dashboard-home .dh-ex-panel[open] {
      border-color: color-mix(in srgb, var(--dh-block-accent, var(--interactive-accent)) 38%, var(--background-modifier-border));
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
      padding: 10px 14px;
      color: var(--text-normal);
      transition: background-color 160ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-summary::-webkit-details-marker,
    .dashboard-home .dh-ex-summary::-webkit-details-marker {
      display: none;
    }
    .dashboard-home .dh-dyn-summary:hover,
    .dashboard-home .dh-ex-summary:hover {
      background: color-mix(in srgb, var(--text-normal) 4%, transparent);
    }
    .dashboard-home .dh-dyn-summary-title,
    .dashboard-home .dh-ex-summary-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--text-normal);
    }
    .dashboard-home .dh-dyn-chevron,
    .dashboard-home .dh-ex-chevron {
      display: inline-block;
      font-size: 0.72rem;
      color: var(--text-muted);
      transition: transform 240ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-panel[open] .dh-dyn-chevron,
    .dashboard-home .dh-ex-panel[open] .dh-ex-chevron {
      transform: rotate(90deg);
    }
    .dashboard-home .dh-dyn-summary-meta,
    .dashboard-home .dh-ex-summary-meta {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 55%;
    }

    /* Тело блоков */
    .dashboard-home .dh-dyn-body,
    .dashboard-home .dh-ex-body {
      padding: 2px 14px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    }

    /* Верхняя строка: Главное число + кнопка «⋯» */
    .dashboard-home .dh-dyn-hero,
    .dashboard-home .dh-ex-hero {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-top: 10px;
      flex-wrap: wrap;
    }
    .dashboard-home .dh-dyn-hero-left,
    .dashboard-home .dh-ex-hero-left {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .dashboard-home .dh-dyn-hero-val,
    .dashboard-home .dh-ex-hero-val {
      font-size: 1.65rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      color: var(--text-normal);
      font-variant-numeric: tabular-nums;
    }
    .dashboard-home .dh-dyn-hero-unit,
    .dashboard-home .dh-ex-hero-unit {
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-left: 3px;
    }
    .dashboard-home .dh-dyn-hero-delta,
    .dashboard-home .dh-ex-hero-delta {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.76rem;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
      background: var(--background-primary);
      color: var(--text-muted);
      border: 1px solid var(--background-modifier-border);
      white-space: nowrap;
    }
    .dashboard-home .dh-dyn-hero-delta.is-up,
    .dashboard-home .dh-ex-hero-delta.is-up {
      color: var(--dh-c-up);
      background: color-mix(in srgb, var(--dh-c-up) 13%, var(--background-primary));
      border-color: color-mix(in srgb, var(--dh-c-up) 35%, var(--background-modifier-border));
    }
    .dashboard-home .dh-dyn-hero-delta.is-down,
    .dashboard-home .dh-ex-hero-delta.is-down {
      color: var(--dh-c-down);
      background: color-mix(in srgb, var(--dh-c-down) 13%, var(--background-primary));
      border-color: color-mix(in srgb, var(--dh-c-down) 35%, var(--background-modifier-border));
    }
    .dashboard-home button.dh-dyn-more-btn,
    .dashboard-home button.dh-ex-more-btn {
      min-width: 36px;
      min-height: 36px;
      height: 36px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-primary);
      color: var(--text-muted);
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: none;
      touch-action: manipulation;
      transition: color 160ms var(--dh-ease-out), border-color 160ms var(--dh-ease-out), background-color 160ms var(--dh-ease-out);
    }
    .dashboard-home button.dh-dyn-more-btn:hover,
    .dashboard-home button.dh-ex-more-btn:hover,
    .dashboard-home button.dh-dyn-more-btn[aria-expanded="true"],
    .dashboard-home button.dh-ex-more-btn[aria-expanded="true"] {
      color: var(--text-normal);
      border-color: var(--dh-block-accent, var(--interactive-accent));
      background: color-mix(in srgb, var(--dh-block-accent, var(--interactive-accent)) 14%, var(--background-primary));
    }

    /* Панель управления: сегменты-таблетки со скользящим индикатором и select */
    .dashboard-home .dh-dyn-controls,
    .dashboard-home .dh-ex-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .dashboard-home .dh-dyn-seg,
    .dashboard-home .dh-ex-seg {
      position: relative;
      display: inline-grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      align-items: center;
      padding: 3px;
      border-radius: 10px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      isolation: isolate;
      overflow-x: auto;
      scrollbar-width: none;
      max-width: 100%;
    }
    .dashboard-home .dh-dyn-seg::-webkit-scrollbar,
    .dashboard-home .dh-ex-seg::-webkit-scrollbar {
      display: none;
    }
    .dashboard-home .dh-dyn-seg-thumb,
    .dashboard-home .dh-ex-seg-thumb {
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: 3px;
      width: calc((100% - 6px) / var(--seg-count, 5));
      transform: translateX(calc(var(--seg-index, 0) * 100%));
      border-radius: 7px;
      background: color-mix(in srgb, var(--dh-block-accent, var(--interactive-accent)) 22%, var(--background-secondary));
      border: 1px solid color-mix(in srgb, var(--dh-block-accent, var(--interactive-accent)) 55%, transparent);
      z-index: 0;
      pointer-events: none;
      transition: transform 260ms var(--dh-ease-out), background-color 220ms var(--dh-ease-out), border-color 220ms var(--dh-ease-out);
    }
    .dashboard-home button.dh-dyn-seg-btn,
    .dashboard-home button.dh-ex-seg-btn {
      position: relative;
      z-index: 1;
      min-height: 36px;
      height: 36px;
      padding: 0 10px;
      border: none;
      border-radius: 7px;
      background: transparent !important;
      box-shadow: none !important;
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      touch-action: manipulation;
      transition: color 180ms var(--dh-ease-out);
    }
    .dashboard-home button.dh-dyn-seg-btn.is-active,
    .dashboard-home button.dh-ex-seg-btn.is-active {
      color: var(--text-normal);
      font-weight: 700;
    }
    .dashboard-home select.dh-ex-select {
      flex: 1 1 190px;
      min-width: 150px;
      max-width: 100%;
      min-height: 38px;
      height: 38px;
      padding: 0 28px 0 11px;
      border-radius: 9px;
      border: 1px solid var(--background-modifier-border);
      background-color: var(--background-primary);
      color: var(--text-normal);
      font-size: 0.8rem;
      font-weight: 650;
      cursor: pointer;
      touch-action: manipulation;
      transition: border-color 160ms var(--dh-ease-out);
    }
    .dashboard-home select.dh-ex-select:focus {
      outline: none;
      border-color: var(--dh-block-accent, var(--interactive-accent));
    }

    /* Раскрывающаяся шторка «⋯» через grid-template-rows: 0fr -> 1fr */
    .dashboard-home .dh-dyn-drawer,
    .dashboard-home .dh-ex-drawer {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      transition: grid-template-rows 280ms var(--dh-ease-out), opacity 220ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-drawer.is-open,
    .dashboard-home .dh-ex-drawer.is-open {
      grid-template-rows: 1fr;
      opacity: 1;
    }
    .dashboard-home .dh-dyn-drawer-inner,
    .dashboard-home .dh-ex-drawer-inner {
      overflow: hidden;
      min-height: 0;
    }
    .dashboard-home .dh-dyn-drawer-box,
    .dashboard-home .dh-ex-drawer-box {
      padding: 10px 12px;
      border-radius: 9px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 0.75rem;
    }
    .dashboard-home .dh-ex-drawer-filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
    }
    .dashboard-home .dh-ex-filter-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dashboard-home .dh-ex-filter-label {
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-muted);
    }
    .dashboard-home .dh-ex-filter-field select {
      width: 100%;
      min-height: 36px;
      height: 36px;
      padding: 0 24px 0 9px;
      border-radius: 7px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      color: var(--text-normal);
      font-size: 0.76rem;
      font-weight: 600;
    }
    .dashboard-home .dh-dyn-stats-grid,
    .dashboard-home .dh-ex-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
      gap: 8px;
    }
    .dashboard-home .dh-dyn-stat-item,
    .dashboard-home .dh-ex-stat-item {
      padding: 6px 8px;
      border-radius: 7px;
      background: var(--background-secondary);
      border: 1px solid var(--background-modifier-border);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dashboard-home .dh-dyn-stat-k,
    .dashboard-home .dh-ex-stat-k {
      font-size: 0.68rem;
      color: var(--text-muted);
    }
    .dashboard-home .dh-dyn-stat-v,
    .dashboard-home .dh-ex-stat-v {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-normal);
      font-variant-numeric: tabular-nums;
    }
    .dashboard-home .dh-dyn-legend,
    .dashboard-home .dh-ex-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      color: var(--text-muted);
      font-size: 0.71rem;
      padding-top: 4px;
      border-top: 1px solid var(--background-modifier-border);
    }
    .dashboard-home .dh-dyn-legend span,
    .dashboard-home .dh-ex-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dashboard-home .dh-dyn-legend i,
    .dashboard-home .dh-ex-legend i {
      width: 14px;
      height: 3px;
      border-radius: 3px;
      display: inline-block;
    }

    /* График SVG, кроссфейд, линия и тултип */
    .dashboard-home .dh-dyn-chart-wrap,
    .dashboard-home .dh-ex-chart-wrap {
      position: relative;
      width: 100%;
      padding: 6px 4px 2px;
      border-radius: 10px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      overflow: visible;
      transition: opacity 220ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-svg,
    .dashboard-home .dh-ex-svg {
      display: block;
      width: 100%;
      height: 235px;
      overflow: visible;
      touch-action: pan-y;
      user-select: none;
    }
    .dashboard-home .dh-dyn-line-anim,
    .dashboard-home .dh-ex-line-anim {
      stroke-dasharray: var(--path-len, 1400);
      stroke-dashoffset: var(--path-len, 1400);
      animation: dh-chart-draw 540ms var(--dh-ease-out) forwards;
    }
    .dashboard-home .dh-dyn-area-anim,
    .dashboard-home .dh-ex-area-anim {
      opacity: 0;
      animation: dh-chart-fade 420ms var(--dh-ease-out) 80ms forwards;
    }
    @keyframes dh-chart-draw {
      to { stroke-dashoffset: 0; }
    }
    @keyframes dh-chart-fade {
      to { opacity: 1; }
    }
    .dashboard-home .dh-dyn-guide,
    .dashboard-home .dh-ex-guide {
      stroke: color-mix(in srgb, var(--text-muted) 55%, transparent);
      stroke-width: 1;
      stroke-dasharray: 3 3;
      pointer-events: none;
      opacity: 0;
      transition: opacity 150ms var(--dh-ease-out), transform 120ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-active-dot,
    .dashboard-home .dh-ex-active-dot {
      pointer-events: none;
      opacity: 0;
      transition: opacity 150ms var(--dh-ease-out), transform 120ms var(--dh-ease-out);
    }
    .dashboard-home .dh-dyn-tooltip,
    .dashboard-home .dh-ex-tooltip {
      position: absolute;
      z-index: 10;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--background-secondary);
      border: 1px solid color-mix(in srgb, var(--dh-block-accent, var(--interactive-accent)) 55%, var(--background-modifier-border));
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
      pointer-events: none;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transform: translate(-50%, -112%);
      transition: opacity 150ms var(--dh-ease-out), left 100ms var(--dh-ease-out), top 100ms var(--dh-ease-out), visibility 150ms;
    }
    .dashboard-home .dh-dyn-tooltip.is-visible,
    .dashboard-home .dh-ex-tooltip.is-visible {
      opacity: 1;
      visibility: visible;
    }
    .dashboard-home .dh-dyn-tooltip-date,
    .dashboard-home .dh-ex-tooltip-date {
      display: block;
      font-size: 0.68rem;
      color: var(--text-muted);
      line-height: 1.2;
    }
    .dashboard-home .dh-dyn-tooltip-val,
    .dashboard-home .dh-ex-tooltip-val {
      display: block;
      font-size: 0.88rem;
      font-weight: 800;
      color: var(--text-normal);
      font-variant-numeric: tabular-nums;
      line-height: 1.25;
    }
    .dashboard-home .dh-dyn-empty,
    .dashboard-home .dh-ex-empty {
      min-height: 180px;
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    @media (max-width: 920px) {
      .dashboard-home .dh-health-analytics-layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 640px) {
      .dashboard-home .dh-dyn-controls,
      .dashboard-home .dh-ex-controls {
        flex-direction: column;
        align-items: stretch;
      }
      .dashboard-home .dh-dyn-seg,
      .dashboard-home .dh-ex-seg {
        width: 100%;
      }
      .dashboard-home button.dh-dyn-seg-btn,
      .dashboard-home button.dh-ex-seg-btn {
        padding: 0 6px;
        font-size: 0.73rem;
      }
      .dashboard-home .dh-dyn-hero-val,
      .dashboard-home .dh-ex-hero-val {
        font-size: 1.45rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dashboard-home .dh-dyn-panel,
      .dashboard-home .dh-ex-panel,
      .dashboard-home .dh-dyn-chevron,
      .dashboard-home .dh-ex-chevron,
      .dashboard-home .dh-dyn-seg-thumb,
      .dashboard-home .dh-ex-seg-thumb,
      .dashboard-home button.dh-dyn-seg-btn,
      .dashboard-home button.dh-ex-seg-btn,
      .dashboard-home .dh-dyn-drawer,
      .dashboard-home .dh-ex-drawer,
      .dashboard-home .dh-dyn-guide,
      .dashboard-home .dh-ex-guide,
      .dashboard-home .dh-dyn-active-dot,
      .dashboard-home .dh-ex-active-dot,
      .dashboard-home .dh-dyn-tooltip,
      .dashboard-home .dh-ex-tooltip {
        transition: none !important;
      }
      .dashboard-home .dh-dyn-line-anim,
      .dashboard-home .dh-ex-line-anim,
      .dashboard-home .dh-dyn-area-anim,
      .dashboard-home .dh-ex-area-anim {
        animation: none !important;
        stroke-dashoffset: 0 !important;
        opacity: 1 !important;
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
    calories: { label: "Калории", unit: "ккал", color: "#8b8dff", digits: 0 },
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

  // Пропуски не превращаются в 0: в массив попадают только дни с реально записанным числом
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
    // Для веса шкала Y строится вокруг рабочего коридора веса тела (не от 0, чтобы видеть динамику в 0.5–2 кг).
    // Для калорий и БЖУ нижняя граница не опускается ниже 0, но поджимается к реальному диапазону записей.
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

  function animateDynCountUp(el, fromVal, toVal, digits) {
    if (window.__dhDynCountRaf) {
      window.cancelAnimationFrame(window.__dhDynCountRaf);
      delete window.__dhDynCountRaf;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || fromVal == null || !Number.isFinite(fromVal) || Math.abs(toVal - fromVal) < 0.01) {
      el.textContent = fmt(toVal, digits, digits);
      return;
    }
    const duration = 360;
    const startTs = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = fromVal + (toVal - fromVal) * eased;
      el.textContent = fmt(cur, digits, digits);
      if (p < 1) {
        window.__dhDynCountRaf = window.requestAnimationFrame(step);
      } else {
        el.textContent = fmt(toVal, digits, digits);
      }
    };
    window.__dhDynCountRaf = window.requestAnimationFrame(step);
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
  // По умолчанию блок закрыт, если пользователь явно не открывал его ранее
  chartPanel.open = dynamicState.open === true;

  let selectedMetric = metricKeys.includes(dynamicState.metric) ? dynamicState.metric : "weight";
  let selectedPeriod = [7, 30, 90, 365, null].includes(dynamicState.period) ? dynamicState.period : 90;
  let isDynDrawerOpen = Boolean(dynamicState.drawerOpen);
  let lastAnimatedDynVal = null;

  const persistDynState = () => {
    try {
      localStorage.setItem("dh-health-dynamics-v1", JSON.stringify({
        metric: selectedMetric,
        period: selectedPeriod,
        open: chartPanel.open,
        drawerOpen: isDynDrawerOpen
      }));
    } catch {}
  };

  chartPanel.ontoggle = persistDynState;

  const chartSummary = chartPanel.createEl("summary", { cls: "dh-dyn-summary" });
  const sumTitleWrap = chartSummary.createDiv({ cls: "dh-dyn-summary-title" });
  sumTitleWrap.createSpan({ cls: "dh-dyn-chevron", text: "▶" });
  sumTitleWrap.createSpan({ text: "📈 Динамика" });
  const chartSummaryMeta = chartSummary.createSpan({ cls: "dh-dyn-summary-meta" });

  const chartBody = chartPanel.createDiv({ cls: "dh-dyn-body" });

  // 1. Верхняя строка: Главное число + дельта + кнопка «⋯»
  const dynHero = chartBody.createDiv({ cls: "dh-dyn-hero" });
  const dynHeroLeft = dynHero.createDiv({ cls: "dh-dyn-hero-left" });
  const dynHeroValEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-val", text: "—" });
  const dynHeroUnitEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-unit", text: "" });
  const dynHeroDeltaEl = dynHeroLeft.createSpan({ cls: "dh-dyn-hero-delta", attr: { style: "display: none;" } });

  const dynMoreBtn = dynHero.createEl("button", {
    cls: "dh-dyn-more-btn",
    text: "⋯",
    attr: {
      type: "button",
      title: "Сводка за период и обозначения",
      "aria-expanded": String(isDynDrawerOpen)
    }
  });

  // 2. Управление на виду: таблетки показателя и таблетки периода со скользящими индикаторами
  const dynControls = chartBody.createDiv({ cls: "dh-dyn-controls" });

  const metricBar = dynControls.createDiv({ cls: "dh-dyn-seg" });
  const metricTabsList = metricKeys.map(k => ({ key: k, label: metricMeta[k].label }));
  metricBar.style.setProperty("--seg-count", String(metricTabsList.length));
  metricBar.style.setProperty("--seg-index", String(Math.max(0, metricKeys.indexOf(selectedMetric))));
  metricBar.createDiv({ cls: "dh-dyn-seg-thumb" });

  const metricBtnEls = [];
  metricTabsList.forEach((m, idx) => {
    const btn = metricBar.createEl("button", {
      cls: "dh-dyn-seg-btn" + (m.key === selectedMetric ? " is-active" : ""),
      text: m.label,
      attr: { type: "button" }
    });
    metricBtnEls.push({ btn, key: m.key });
    btn.onclick = () => {
      if (selectedMetric === m.key) return;
      selectedMetric = m.key;
      metricBar.style.setProperty("--seg-index", String(idx));
      metricBtnEls.forEach(item => item.btn.classList.toggle("is-active", item.key === selectedMetric));
      persistDynState();
      renderDynamicPanel(true);
    };
  });

  const periodBar = dynControls.createDiv({ cls: "dh-dyn-seg" });
  const periodOptions = [
    { val: 7, label: "7д" },
    { val: 30, label: "30д" },
    { val: 90, label: "90д" },
    { val: 365, label: "Год" },
    { val: null, label: "Всё" }
  ];
  periodBar.style.setProperty("--seg-count", String(periodOptions.length));
  periodBar.style.setProperty("--seg-index", String(Math.max(0, periodOptions.findIndex(p => p.val === selectedPeriod))));
  periodBar.createDiv({ cls: "dh-dyn-seg-thumb" });

  const periodBtnEls = [];
  periodOptions.forEach((p, idx) => {
    const btn = periodBar.createEl("button", {
      cls: "dh-dyn-seg-btn" + (p.val === selectedPeriod ? " is-active" : ""),
      text: p.label,
      attr: { type: "button" }
    });
    periodBtnEls.push({ btn, val: p.val });
    btn.onclick = () => {
      if (selectedPeriod === p.val) return;
      selectedPeriod = p.val;
      periodBar.style.setProperty("--seg-index", String(idx));
      periodBtnEls.forEach(item => item.btn.classList.toggle("is-active", item.val === selectedPeriod));
      persistDynState();
      renderDynamicPanel(true);
    };
  });

  // 3. Шторка «⋯» (0fr -> 1fr): сводка и легенда
  const dynDrawer = chartBody.createDiv({ cls: "dh-dyn-drawer" + (isDynDrawerOpen ? " is-open" : "") });
  const dynDrawerInner = dynDrawer.createDiv({ cls: "dh-dyn-drawer-inner" });
  const dynDrawerBox = dynDrawerInner.createDiv({ cls: "dh-dyn-drawer-box" });
  const dynStatsGrid = dynDrawerBox.createDiv({ cls: "dh-dyn-stats-grid" });
  const dynLegend = dynDrawerBox.createDiv({ cls: "dh-dyn-legend" });

  dynMoreBtn.onclick = (e) => {
    e.stopPropagation();
    isDynDrawerOpen = !isDynDrawerOpen;
    dynDrawer.classList.toggle("is-open", isDynDrawerOpen);
    dynMoreBtn.setAttribute("aria-expanded", String(isDynDrawerOpen));
    persistDynState();
  };

  // 4. Контейнер SVG-графика
  const dynChartWrap = chartBody.createDiv({ cls: "dh-dyn-chart-wrap" });

  const renderDynamicPanel = (animateTransition = false) => {
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
      animateDynCountUp(dynHeroValEl, lastAnimatedDynVal, lastVal, meta.digits);
      lastAnimatedDynVal = lastVal;
      dynHeroUnitEl.textContent = meta.unit;
    } else {
      dynHeroValEl.textContent = "—";
      dynHeroUnitEl.textContent = "";
      lastAnimatedDynVal = null;
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

    // Обновляем сводку и легенду внутри шторки «⋯»
    dynStatsGrid.replaceChildren();
    [
      ["Среднее", avgVal == null ? "—" : `${fmt(avgVal, 0, 1)} ${meta.unit}`],
      ["Мин.", minVal == null ? "—" : `${fmt(minVal, 0, meta.digits)} ${meta.unit}`],
      ["Макс.", maxVal == null ? "—" : `${fmt(maxVal, 0, meta.digits)} ${meta.unit}`],
      ["Записей", String(points.length)]
    ].forEach(([k, v]) => {
      const item = dynStatsGrid.createDiv({ cls: "dh-dyn-stat-item" });
      item.createSpan({ cls: "dh-dyn-stat-k", text: k });
      item.createSpan({ cls: "dh-dyn-stat-v", text: v });
    });

    dynLegend.replaceChildren();
    const l1 = dynLegend.createEl("span");
    l1.createEl("i", { attr: { style: `background: ${meta.color};` } });
    l1.createSpan({ text: "Записи" });

    const l2 = dynLegend.createEl("span");
    l2.createEl("i", { attr: { style: "background: var(--text-muted); opacity: 0.65;" } });
    l2.createSpan({ text: "Скользящее среднее · 7 дн." });

    if (selectedMetric === "calories" && calorieGoal !== null) {
      const l3 = dynLegend.createEl("span");
      l3.createEl("i", { attr: { style: "background: #e5a158;" } });
      l3.createSpan({ text: `Цель · ${calorieGoal} ккал` });
    }

    if (animateTransition) {
      dynChartWrap.style.opacity = "0.35";
      requestAnimationFrame(() => { dynChartWrap.style.opacity = "1"; });
    }
    dynChartWrap.replaceChildren();

    if (points.length < 2) {
      const emptyEl = dynChartWrap.createDiv({ cls: "dh-dyn-empty" });
      if (points.length === 1) {
        const only = points[0];
        emptyEl.createSpan({
          text: `Записано 1 значение (${dv.date(only.iso).toFormat("dd.MM.yyyy")}: ${fmt(only.value, 0, meta.digits)} ${meta.unit}).`,
          attr: { style: "font-weight: 600; color: var(--text-normal);" }
        });
        emptyEl.createSpan({
          text: "Добавь ещё один день или выбери более широкий период, чтобы увидеть линию динамики.",
          attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
        });
      } else {
        emptyEl.createSpan({ text: "За выбранный период записей нет." });
        emptyEl.createSpan({
          text: "Выбери другой период (например, «Всё») или внеси данные за сегодня.",
          attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
        });
      }
      return;
    }

    const svgW = 720;
    const svgH = 235;
    const pad = { left: 52, right: 16, top: 14, bottom: 28 };
    const plotW = svgW - pad.left - pad.right;
    const plotH = svgH - pad.top - pad.bottom;

    const movingAvg = points.map(point => {
      const startISO = dv.date(point.iso).minus({ days: 6 }).toISODate();
      const periodValues = points.filter(c => c.iso >= startISO && c.iso <= point.iso).map(c => c.value);
      return { iso: point.iso, value: average(periodValues) };
    });

    const scaleValues = [...values, ...movingAvg.map(m => m.value).filter(Number.isFinite)];
    if (selectedMetric === "calories" && calorieGoal !== null) scaleValues.push(calorieGoal);

    const { yMin, yMax, ticks } = computeDynNiceScale(
      Math.min(...scaleValues),
      Math.max(...scaleValues),
      selectedMetric === "weight",
      4
    );
    const yRange = yMax - yMin || 1;

    const xPos = idx => pad.left + (points.length <= 1 ? plotW / 2 : (idx * plotW) / (points.length - 1));
    const yPos = val => pad.top + plotH - ((val - yMin) / yRange) * plotH;

    const svg = createHealthSvgNode(dynChartWrap, "svg", {
      class: "dh-dyn-svg",
      viewBox: `0 0 ${svgW} ${svgH}`,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": `${meta.label} за выбранный период`
    });

    ticks.forEach(tickVal => {
      const y = yPos(tickVal);
      createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: svgW - pad.right, y1: y, y2: y,
        stroke: "var(--background-modifier-border)", "stroke-width": "1"
      });
      const lbl = createHealthSvgNode(svg, "text", {
        x: pad.left - 8, y: y + 4, "text-anchor": "end",
        fill: "var(--text-muted)", "font-size": "10"
      });
      lbl.textContent = fmt(tickVal, 0, meta.digits);
    });

    if (selectedMetric === "calories" && calorieGoal !== null && calorieGoal >= yMin && calorieGoal <= yMax) {
      const goalY = yPos(calorieGoal);
      createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: svgW - pad.right, y1: goalY, y2: goalY,
        stroke: "#e5a158", "stroke-width": "1.4", "stroke-dasharray": "4 4", opacity: "0.85"
      });
    }

    const spanDays = Math.max(
      1,
      Math.round(dv.date(points[points.length - 1].iso).diff(dv.date(points[0].iso), "days").days)
    );
    const labelCount = Math.min(points.length, 5);
    for (let t = 0; t < labelCount; t++) {
      const idx = labelCount === 1 ? 0 : Math.round((t * (points.length - 1)) / (labelCount - 1));
      const lbl = createHealthSvgNode(svg, "text", {
        x: xPos(idx), y: svgH - 6, "text-anchor": "middle",
        fill: "var(--text-muted)", "font-size": "10"
      });
      lbl.textContent = formatDynAxisDate(points[idx].iso, selectedPeriod, spanDays);
    }

    const mainCoords = points.map((p, i) => ({ x: xPos(i), y: yPos(p.value) }));
    const avgCoords = movingAvg.map((p, i) => ({ x: xPos(i), y: yPos(p.value) }));

    const mainPathData = buildDynMonotoneCubicPath(mainCoords);
    const avgPathData = buildDynMonotoneCubicPath(avgCoords);
    const areaPathData = `${mainPathData} L ${mainCoords[mainCoords.length - 1].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} L ${mainCoords[0].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

    const gradId = "dhDynGrad-" + Math.random().toString(36).slice(2, 7);
    const defs = createHealthSvgNode(svg, "defs");
    const grad = createHealthSvgNode(defs, "linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    createHealthSvgNode(grad, "stop", { offset: "0%", "stop-color": meta.color, "stop-opacity": "0.24" });
    createHealthSvgNode(grad, "stop", { offset: "100%", "stop-color": meta.color, "stop-opacity": "0.0" });

    createHealthSvgNode(svg, "path", {
      d: areaPathData, fill: `url(#${gradId})`, class: "dh-dyn-area-anim"
    });

    createHealthSvgNode(svg, "path", {
      d: avgPathData, fill: "none", stroke: "var(--text-muted)",
      "stroke-width": "1.4", "stroke-dasharray": "4 4", opacity: "0.6"
    });

    const mainPath = createHealthSvgNode(svg, "path", {
      d: mainPathData, fill: "none", stroke: meta.color,
      "stroke-width": "2.8", "stroke-linecap": "round", "stroke-linejoin": "round",
      class: "dh-dyn-line-anim"
    });
    try {
      const len = mainPath.getTotalLength?.() || 1400;
      mainPath.style.setProperty("--path-len", String(Math.ceil(len)));
    } catch {}

    // Точки и выделенная последняя точка с мягким ореолом
    mainCoords.forEach((pt, idx) => {
      const isLast = idx === mainCoords.length - 1;
      if (isLast) {
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: "8",
          fill: meta.color, opacity: "0.2", "pointer-events": "none"
        });
      }
      if (points.length <= 45 || isLast) {
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: isLast ? "4.8" : "2.8",
          fill: isLast ? meta.color : "var(--background-primary)",
          stroke: meta.color,
          "stroke-width": isLast ? "2" : "1.6",
          "pointer-events": "none"
        });
      }
    });

    const guideLine = createHealthSvgNode(svg, "line", {
      x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH,
      class: "dh-dyn-guide"
    });
    const activeDot = createHealthSvgNode(svg, "circle", {
      cx: mainCoords[0].x, cy: mainCoords[0].y, r: "6",
      fill: "var(--background-secondary)", stroke: meta.color, "stroke-width": "2.6",
      class: "dh-dyn-active-dot"
    });

    const tooltip = dynChartWrap.createDiv({ cls: "dh-dyn-tooltip" });
    const ttDate = tooltip.createSpan({ cls: "dh-dyn-tooltip-date" });
    const ttVal = tooltip.createSpan({ cls: "dh-dyn-tooltip-val" });

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

      const leftPct = Math.max(10, Math.min(90, (c.x / svgW) * 100));
      const topPct = Math.max(16, (c.y / svgH) * 100);
      tooltip.style.left = `${leftPct}%`;
      tooltip.style.top = `${topPct}%`;
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

  renderDynamicPanel(false);

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
      container.createSpan({
        text: "Свой вес",
        attr: { style: "font-size:0.75rem; padding:1px 6px; border-radius:4px; background:var(--background-modifier-border); color:var(--text-muted);" }
      });
    } else if (loadType === "weighted" && w != null) {
      container.createSpan({
        text: "+" + fmt(w) + " кг",
        attr: { style: "font-size:0.75rem; padding:1px 6px; border-radius:4px; background:#e5a15822; color:#e5a158; font-weight:600; border:1px solid #e5a15844;" }
      });
    } else {
      container.createSpan({
        text: "Не указано",
        attr: { style: "font-size:0.75rem; padding:1px 6px; border-radius:4px; background:var(--background-primary); color:var(--text-faint); border:1px dashed var(--background-modifier-border);" }
      });
    }
  }

  function formatLoadTextForSummary(loadType, w) {
    if (loadType === "bw") return "(свой вес)";
    if (loadType === "weighted" && w != null) return "(+" + fmt(w) + " кг)";
    return "(вес не указан)";
  }

  function renderDeltaSpan(container, v, unit = "повт.") {
    if (v > 0) {
      container.createSpan({
        text: "+" + fmt(v) + " " + unit,
        attr: { style: "color:var(--color-green); font-weight:600;" }
      });
    } else if (v < 0) {
      container.createSpan({
        text: "−" + fmt(-v) + " " + unit,
        attr: { style: "color:var(--color-red); font-weight:600;" }
      });
    } else {
      container.createSpan({
        text: "0 " + unit,
        attr: { style: "color:var(--text-muted);" }
      });
    }
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

  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
  const minValidDate = dv.date(MIN_VALID_DATE_ISO).startOf("day");
  const root = dv.container.createDiv({ cls: "dh dh-trainings-hub", attr: { style: "margin: 20px 0 25px 0;" } });

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

  const launcherCard = root.createDiv({
    cls: "dh-panel",
    attr: {
      style: "padding: 14px 16px; margin-bottom: 18px; background: var(--background-secondary); border-radius: 10px; border: 1px solid var(--background-modifier-border); border-top: 3px solid #d69852; display: flex; flex-direction: column; gap: 10px;"
    }
  });

  const launcherTop = launcherCard.createDiv({
    attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;" }
  });

  const titleCol = launcherTop.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 2px; min-width: 0;" } });
  const headingRow = titleCol.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });
  headingRow.createSpan({
    text: "🏋️ Тренировка сегодня",
    attr: { style: "font-size: 1rem; font-weight: 600; color: var(--text-normal);" }
  });

  if (todayFile) {
    const statusBadgeText = todayDurationMin
      ? "✓ Завершена (" + todayDurationMin + " мин · " + todaySets.length + " подх.)"
      : "В процессе · подходов: " + todaySets.length;
    const noteLink = headingRow.createEl("a", {
      cls: "internal-link",
      text: statusBadgeText,
      attr: {
        href: todayFile.path,
        style: "font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; text-decoration: none; background: #4aab8018; color: #4aab80; border: 1px solid #4aab8044;"
      }
    });
    noteLink.onclick = e => {
      e.preventDefault();
      app.workspace.openLinkText(todayFile.path, dv.currentFilePath, false);
    };
    titleCol.createDiv({
      text: todayTitle,
      attr: { style: "font-size: 0.78rem; color: var(--text-muted);" }
    });
  } else {
    titleCol.createDiv({
      text: "Сессия за сегодня (" + today.toFormat("dd.MM") + ") ещё не начата",
      attr: { style: "font-size: 0.78rem; color: var(--text-muted);" }
    });
  }

  const actionsCol = launcherTop.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

  const activeTimer = getWorkoutPlugin()?.settings?.timer;
  if (activeTimer && activeTimer.endAt > Date.now()) {
    const remSec = Math.max(0, Math.ceil((activeTimer.endAt - Date.now()) / 1000));
    const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
    const ss = String(remSec % 60).padStart(2, "0");
    const timerChip = actionsCol.createEl("button", {
      text: "⏱️ Отдых " + mm + ":" + ss,
      attr: {
        type: "button",
        title: "Открыть таймер отдыха в плагине",
        style: "height: 32px; padding: 0 10px; border-radius: 8px; font-size: 0.78rem; font-weight: 600; font-variant-numeric: tabular-nums; color: #e5a158; background: #e5a15818; border: 1px solid #e5a15855; cursor: pointer;"
      }
    });
    timerChip.onclick = () => openWorkoutCompanion();
  }

  const openPluginBtn = actionsCol.createEl("button", {
    cls: "dh-btn mod-cta",
    text: todayFile ? "Открыть тренировку" : "＋ Начать тренировку",
    attr: {
      type: "button",
      style: "height: 32px; padding: 0 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer;"
    }
  });
  openPluginBtn.onclick = () => {
    openWorkoutCompanion(todayFile ? { sessionPath: todayFile.path } : {});
  };

  if (todaySets.length > 0) {
    const setsRow = launcherCard.createDiv({
      attr: { style: "display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--background-modifier-border);" }
    });
    todaySets.forEach((s, idx) => {
      const exMeta = catalog.get(s.name) || { unit: s.field === "секунды" ? "с" : "повт." };
      const loadSuffix = s.loadType === "weighted" && s.weight != null
        ? " (+" + fmt(s.weight) + " кг)"
        : s.loadType === "unspec"
          ? " (вес не указан)"
          : "";
      setsRow.createSpan({
        text: (idx + 1) + ". " + s.name + ": " + fmt(s.reps) + " " + exMeta.unit + loadSuffix,
        attr: {
          style: "font-size: 0.74rem; padding: 2px 8px; border-radius: 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); font-variant-numeric: tabular-nums;"
        }
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
  const previousOf = (latest, list) => !latest.date ? null : [...list].sort(newest).find(g => g !== latest && g.date &&
    (g.date < latest.date || (+g.date === +latest.date && g.timeKnown && latest.timeKnown && g.order < latest.order))) || null;

  const from = today.minus({ days: 29 });
  const recent = all.filter(g => g.date && g.date >= from && g.date <= today);
  const sessions = new Map(recent.map(g => [g.path, g]));
  const durations = [...sessions.values()].map(g => g.duration).filter(n => typeof n === "number" && n > 0);
  const periodRangeStr = from.toFormat("dd.MM") + "–" + today.toFormat("dd.MM");

  const summaryHeader = root.createDiv({
    attr: { style: "display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;" }
  });
  summaryHeader.createSpan({
    text: "Сводка тренировок",
    attr: { style: "font-size: 0.95rem; font-weight: 600; color: var(--text-normal);" }
  });
  summaryHeader.createSpan({
    text: "Последние 30 дней (" + periodRangeStr + ")",
    attr: { style: "font-size: 0.76rem; color: var(--text-muted);" }
  });

  const stats = root.createDiv({
    attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; max-width: 640px;" }
  });
  function card(label, value, hint) {
    const c = stats.createDiv({ cls: "dh-card" });
    c.createDiv({ cls: "dh-card-label", text: label });
    c.createDiv({ cls: "dh-card-value", text: value });
    c.createDiv({ cls: "dh-card-hint", text: hint });
  }

  const weeklyFreq = sessions.size / (30 / 7);
  card(
    "Тренировки",
    String(sessions.size),
    fmt(Math.round(weeklyFreq * 10) / 10) + " в неделю · за 30 дней"
  );

  const avgDur = durations.length ? Math.round(sum(durations) / durations.length) : null;
  card(
    "Средняя тренировка",
    avgDur !== null ? avgDur + " мин" : "—",
    sessions.size > 0
      ? "длительность указана в " + durations.length + " из " + sessions.size + " сессий"
      : "нет тренировок за последние 30 дней"
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

  // Очистка активной анимации счётчика при перерисовке блока упражнений
  if (window.__dhExCountRaf) {
    window.cancelAnimationFrame(window.__dhExCountRaf);
    delete window.__dhExCountRaf;
  }

  function computeExNiceScale(minVal, maxVal, tickCount = 4) {
    // Шкала упражнений (повторы/секунды) привязана к диапазону рабочих значений (не обязана начинаться с 0,
    // если все подходы высокие, но никогда не уходит в отрицательные числа).
    let lo = Number.isFinite(minVal) ? minVal : 0;
    let hi = Number.isFinite(maxVal) ? maxVal : 10;
    if (lo === hi) {
      const pad = Math.max(Math.abs(hi) * 0.15, 2);
      lo = Math.max(0, lo - pad);
      hi = hi + pad;
    } else {
      const span = hi - lo;
      lo = Math.max(0, lo - span * 0.1);
      hi = hi + span * 0.1;
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

    // Для повторов и секунд шаг делаем не дробнее 0.5
    if (step < 0.5) step = 0.5;

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

  function animateExCountUp(el, fromVal, toVal) {
    if (window.__dhExCountRaf) {
      window.cancelAnimationFrame(window.__dhExCountRaf);
      delete window.__dhExCountRaf;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || fromVal == null || !Number.isFinite(fromVal) || Math.abs(toVal - fromVal) < 0.01) {
      el.textContent = fmt(toVal);
      return;
    }
    const duration = 360;
    const startTs = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = fromVal + (toVal - fromVal) * eased;
      el.textContent = fmt(Math.round(cur * 10) / 10);
      if (p < 1) {
        window.__dhExCountRaf = window.requestAnimationFrame(step);
      } else {
        el.textContent = fmt(toVal);
      }
    };
    window.__dhExCountRaf = window.requestAnimationFrame(step);
  }

  function formatExAxisDate(d, periodDays, spanDays) {
    if (!d) return "";
    if (periodDays !== null && periodDays <= 90) return d.toFormat("dd.MM");
    if (spanDays > 500) return d.toFormat("MM.yy");
    return d.setLocale("ru").toFormat("LLL yy").replace(".", "");
  }

  function buildExerciseSeries(all) {
    const map = new Map();
    for (const item of all) {
      if (!item || !item.name || !item.date) continue;
      const key = `${item.name}|${item.variant || "Основной"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name,
          variant: item.variant || "Основной",
          unit: item.unit || "повт.",
          series: [],
          topLoad: 0,
          best: 0,
          sets: 0,
          total: 0,
          weightOptions: new Set(),
          loadTypeCounts: { bw: 0, weighted: 0, unspec: 0 }
        });
      }
      const bucket = map.get(key);
      const best = Number.isFinite(item.best) ? item.best : 0;
      const total = Number.isFinite(item.total) ? item.total : 0;
      const weightValue = Number.isFinite(item.weight) ? item.weight : null;
      const entry = {
        date: item.date,
        path: item.path,
        link: item.link,
        title: item.title || item.name,
        best,
        total,
        sets: Array.isArray(item.values) ? item.values.length : 0,
        values: Array.isArray(item.values) ? [...item.values] : [],
        loadType: item.loadType || "unspec",
        weight: weightValue,
        order: item.order
      };
      bucket.series.push(entry);
      bucket.best = Math.max(bucket.best, best);
      bucket.total += total;
      bucket.sets += entry.sets;
      bucket.topLoad = Math.max(bucket.topLoad, weightValue != null ? weightValue : 0);
      if (weightValue != null) bucket.weightOptions.add(String(weightValue));
      if (entry.loadType === "bw") bucket.loadTypeCounts.bw += 1;
      else if (entry.loadType === "weighted") bucket.loadTypeCounts.weighted += 1;
      else bucket.loadTypeCounts.unspec += 1;
    }

    return [...map.values()]
      .map(bucket => {
        const ordered = [...bucket.series].sort((a, b) => (a.date && b.date ? a.date.toMillis() - b.date.toMillis() : 0));
        const last = ordered[ordered.length - 1];
        const previous = ordered[ordered.length - 2] || null;
        const avgBest = ordered.length ? average(ordered.map(item => item.best)) : 0;
        const delta = last && previous ? last.best - previous.best : null;
        const trend = delta == null ? "neutral" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        const volume = ordered.reduce((sumVal, item) => sumVal + (Number.isFinite(item.total) ? item.total : 0), 0);
        return {
          ...bucket,
          ordered,
          last,
          previous,
          avgBest,
          delta,
          trend,
          volume,
          sessions: ordered.length,
          weightOptions: [...bucket.weightOptions].sort((a, b) => Number(a) - Number(b))
        };
      })
      .filter(bucket => bucket.ordered.length > 0)
      .sort((a, b) => (b.ordered.length - a.ordered.length) || a.name.localeCompare(b.name, "ru"));
  }

  function trendVerdict(item) {
    if (!item || !item.ordered || item.ordered.length < 2) {
      return { label: "Мало данных", tone: "neutral", text: "Нужно минимум 2 тренировки для оценки динамики." };
    }
    const recent = item.ordered.slice(-Math.min(4, item.ordered.length));
    const firstRecent = recent[0].best;
    const lastRecent = recent[recent.length - 1].best;
    const recentDelta = lastRecent - firstRecent;
    const avgRecent = average(recent.map(entry => entry.best));
    const avgAll = average(item.ordered.map(entry => entry.best));
    const changeVsAvg = avgRecent != null && avgAll != null ? avgRecent - avgAll : 0;
    if (recentDelta > 0 && changeVsAvg >= 0) {
      return { label: "Прогресс", tone: "up", text: `+${fmt(recentDelta)} за последние ${recent.length} трен.` };
    }
    if (recentDelta < 0 && changeVsAvg < 0) {
      return { label: "Спад", tone: "down", text: `−${fmt(Math.abs(recentDelta))} за последние ${recent.length} трен.` };
    }
    return { label: "Стабильно", tone: "flat", text: `Держится около среднего (${fmt(avgAll)}).` };
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
    const defaultKey = exerciseSeries.reduce((best, item) => (!best || item.ordered.length > best.ordered.length ? item : best), null)?.key || exerciseSeries[0].key;
    let selectedExerciseKey = exerciseSeries.some(item => item.key === progressState.exerciseKey) ? progressState.exerciseKey : defaultKey;
    let selectedMetric = ["best", "total", "average"].includes(progressState.metric) ? progressState.metric : "best";
    let selectedPeriod = [7, 30, 90, 365, null].includes(progressState.period) ? progressState.period : 90;
    let selectedLoad = ["all", "bw", "weighted"].includes(progressState.load) ? progressState.load : "all";
    let isExDrawerOpen = Boolean(progressState.drawerOpen);
    let lastAnimatedExVal = null;

    const progressPanel = analyticsLayout.createEl("details", {
      cls: "dh-ex-panel",
      attr: { style: "--dh-block-accent: #7e9ad9;" }
    });
    // По умолчанию блок закрыт, если пользователь явно не открывал его ранее
    progressPanel.open = progressState.open === true;

    const persistProgressState = () => {
      try {
        localStorage.setItem("dh-health-exercise-progress-v1", JSON.stringify({
          exerciseKey: selectedExerciseKey,
          metric: selectedMetric,
          period: selectedPeriod,
          load: selectedLoad,
          open: progressPanel.open,
          drawerOpen: isExDrawerOpen
        }));
      } catch {}
    };

    progressPanel.ontoggle = persistProgressState;

    const progressSummary = progressPanel.createEl("summary", { cls: "dh-ex-summary" });
    const exSumTitle = progressSummary.createDiv({ cls: "dh-ex-summary-title" });
    exSumTitle.createSpan({ cls: "dh-ex-chevron", text: "▶" });
    exSumTitle.createSpan({ text: "📈 Прогресс упражнений" });
    const exSummaryMeta = progressSummary.createSpan({ cls: "dh-ex-summary-meta" });

    const progressBody = progressPanel.createDiv({ cls: "dh-ex-body" });

    // 1. Верхняя строка: Главное число + дельта + кнопка «⋯»
    const exHero = progressBody.createDiv({ cls: "dh-ex-hero" });
    const exHeroLeft = exHero.createDiv({ cls: "dh-ex-hero-left" });
    const exHeroValEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-val", text: "—" });
    const exHeroUnitEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-unit", text: "" });
    const exHeroDeltaEl = exHeroLeft.createSpan({ cls: "dh-ex-hero-delta", attr: { style: "display: none;" } });

    const exMoreBtn = exHero.createEl("button", {
      cls: "dh-ex-more-btn",
      text: "⋯",
      attr: {
        type: "button",
        title: "Метрика, нагрузка и подробная статистика",
        "aria-expanded": String(isExDrawerOpen)
      }
    });

    // 2. Управление на виду: только ЧТО показать (select упражнения) и ЗА КАКОЙ ПЕРИОД (сегменты)
    const exControls = progressBody.createDiv({ cls: "dh-ex-controls" });
    const exerciseSelect = exControls.createEl("select", {
      cls: "dh-ex-select",
      attr: { "aria-label": "Выбор упражнения" }
    });

    const allExerciseOptions = [...exerciseSeries].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "ru"));
    allExerciseOptions.forEach(item => {
      const label = `${item.name}${item.variant !== "Основной" ? " · " + item.variant : ""}`;
      const option = exerciseSelect.createEl("option", { text: label, attr: { value: item.key } });
      option.selected = item.key === selectedExerciseKey;
    });

    const exPeriodBar = exControls.createDiv({ cls: "dh-ex-seg" });
    const exPeriodOptions = [
      { val: 7, label: "7д" },
      { val: 30, label: "30д" },
      { val: 90, label: "90д" },
      { val: 365, label: "Год" },
      { val: null, label: "Всё" }
    ];
    exPeriodBar.style.setProperty("--seg-count", String(exPeriodOptions.length));
    const initPeriodIdx = Math.max(0, exPeriodOptions.findIndex(p => p.val === selectedPeriod));
    exPeriodBar.style.setProperty("--seg-index", String(initPeriodIdx));
    exPeriodBar.createDiv({ cls: "dh-ex-seg-thumb" });

    const exPeriodBtns = [];
    exPeriodOptions.forEach((p, idx) => {
      const btn = exPeriodBar.createEl("button", {
        cls: "dh-ex-seg-btn" + (p.val === selectedPeriod ? " is-active" : ""),
        text: p.label,
        attr: { type: "button" }
      });
      exPeriodBtns.push({ btn, val: p.val, idx });
      btn.onclick = () => {
        if (selectedPeriod === p.val) return;
        selectedPeriod = p.val;
        exPeriodBar.style.setProperty("--seg-index", String(idx));
        exPeriodBtns.forEach(item => item.btn.classList.toggle("is-active", item.val === selectedPeriod));
        persistProgressState();
        renderProgressBlock(true);
      };
    });

    // 3. Сворачиваемая шторка «⋯» (0fr -> 1fr): выбор метрики, фильтр нагрузки, сводка и легенда
    const exDrawer = progressBody.createDiv({ cls: "dh-ex-drawer" + (isExDrawerOpen ? " is-open" : "") });
    const exDrawerInner = exDrawer.createDiv({ cls: "dh-ex-drawer-inner" });
    const exDrawerBox = exDrawerInner.createDiv({ cls: "dh-ex-drawer-box" });

    const filtersRow = exDrawerBox.createDiv({ cls: "dh-ex-drawer-filters" });

    const metricField = filtersRow.createDiv({ cls: "dh-ex-filter-field" });
    metricField.createSpan({ cls: "dh-ex-filter-label", text: "Метрика графика" });
    const metricSelect = metricField.createEl("select", { attr: { "aria-label": "Метрика упражнения" } });
    [
      { val: "best", label: "Лучший подход" },
      { val: "total", label: "Сумма за тренировку" },
      { val: "average", label: "Среднее за подход" }
    ].forEach(m => {
      const opt = metricSelect.createEl("option", { text: m.label, attr: { value: m.val } });
      opt.selected = m.val === selectedMetric;
    });

    const loadField = filtersRow.createDiv({ cls: "dh-ex-filter-field" });
    loadField.createSpan({ cls: "dh-ex-filter-label", text: "Нагрузка" });
    const loadSelect = loadField.createEl("select", { attr: { "aria-label": "Фильтр нагрузки" } });
    [
      { val: "all", label: "Все нагрузки" },
      { val: "bw", label: "Свой вес" },
      { val: "weighted", label: "С дополнительным весом" }
    ].forEach(l => {
      const opt = loadSelect.createEl("option", { text: l.label, attr: { value: l.val } });
      opt.selected = l.val === selectedLoad;
    });

    const exStatsGrid = exDrawerBox.createDiv({ cls: "dh-ex-stats-grid" });
    const exLegend = exDrawerBox.createDiv({ cls: "dh-ex-legend" });

    exMoreBtn.onclick = (e) => {
      e.stopPropagation();
      isExDrawerOpen = !isExDrawerOpen;
      exDrawer.classList.toggle("is-open", isExDrawerOpen);
      exMoreBtn.setAttribute("aria-expanded", String(isExDrawerOpen));
      persistProgressState();
    };

    // 4. Контейнер SVG-графика
    const exChartWrap = progressBody.createDiv({ cls: "dh-ex-chart-wrap" });

    const renderProgressBlock = (animateTransition = false) => {
      const exercise = exerciseSeries.find(item => item.key === selectedExerciseKey) || exerciseSeries[0];
      const filteredSeries = [...exercise.ordered].filter(item => {
        if (selectedLoad === "all") return true;
        if (selectedLoad === "bw") return item.loadType === "bw";
        return item.loadType === "weighted";
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

      const verdict = trendVerdict({ ordered: periodSeries.length >= 2 ? periodSeries : filteredSeries });
      const accentColor = verdict.tone === "up" ? "#4aab80" : verdict.tone === "down" ? "#d85b57" : "#7e9ad9";
      progressPanel.style.setProperty("--dh-block-accent", accentColor);

      const shortExName = exercise.name + (exercise.variant !== "Основной" ? ` (${exercise.variant})` : "");
      const periodText = selectedPeriod === null ? "всё" : `${selectedPeriod} дн.`;
      exSummaryMeta.textContent = `${shortExName} · ${periodText}`;

      const spanDays = periodSeries.length >= 2
        ? Math.max(1, Math.round(periodSeries[periodSeries.length - 1].date.diff(periodSeries[0].date, "days").days))
        : (selectedPeriod || 30);

      const chartData = periodSeries.map((item, index) => {
        const value = metricValue(item);
        const windowSlice = periodSeries.slice(Math.max(0, index - 3), index + 1).map(metricValue).filter(Number.isFinite);
        const loadHint = item.loadType === "weighted" && item.weight != null ? ` (+${fmt(item.weight)} кг)` : "";
        return {
          rawDate: item.date,
          axisDate: formatExAxisDate(item.date, selectedPeriod, spanDays),
          value,
          avg: average(windowSlice),
          isLatest: index === periodSeries.length - 1,
          tooltipDate: item.date.toFormat("dd.MM.yyyy"),
          tooltipValue: `${fmt(value)} ${exercise.unit}${loadHint}`
        };
      }).filter(pt => Number.isFinite(pt.value));

      const currentVal = chartData.length ? chartData[chartData.length - 1].value : null;
      const firstVal = chartData.length > 1 ? chartData[0].value : null;
      const deltaVal = currentVal !== null && firstVal !== null ? r2(currentVal - firstVal) : null;

      // Обновляем главное число (с count-up анимацией) и бейдж изменения за период
      if (currentVal !== null) {
        animateExCountUp(exHeroValEl, lastAnimatedExVal, currentVal);
        lastAnimatedExVal = currentVal;
        exHeroUnitEl.textContent = exercise.unit;
      } else {
        exHeroValEl.textContent = "—";
        exHeroUnitEl.textContent = "";
        lastAnimatedExVal = null;
      }

      if (deltaVal !== null) {
        const sign = deltaVal > 0 ? "+" : deltaVal < 0 ? "−" : "";
        exHeroDeltaEl.textContent = `${sign}${fmt(Math.abs(deltaVal))} ${exercise.unit}`;
        exHeroDeltaEl.className = "dh-ex-hero-delta" + (deltaVal > 0 ? " is-up" : deltaVal < 0 ? " is-down" : "");
        exHeroDeltaEl.style.display = "inline-flex";
      } else {
        exHeroDeltaEl.style.display = "none";
      }

      // Наполняем сводку внутри шторки «⋯»
      exStatsGrid.replaceChildren();
      const periodVals = chartData.map(d => d.value);
      const bestInPeriod = periodVals.length ? Math.max(...periodVals) : null;
      const avgInPeriod = periodVals.length ? average(periodVals) : null;

      [
        ["Тренировок", String(chartData.length)],
        ["Макс. за период", bestInPeriod !== null ? `${fmt(bestInPeriod)} ${exercise.unit}` : "—"],
        ["Среднее", avgInPeriod !== null ? `${fmt(avgInPeriod)} ${exercise.unit}` : "—"],
        ["Динамика", verdict.label]
      ].forEach(([k, v]) => {
        const box = exStatsGrid.createDiv({ cls: "dh-ex-stat-item" });
        box.createSpan({ cls: "dh-ex-stat-k", text: k });
        box.createSpan({ cls: "dh-ex-stat-v", text: v });
      });

      exLegend.replaceChildren();
      const l1 = exLegend.createEl("span");
      l1.createEl("i", { attr: { style: `background: ${accentColor};` } });
      l1.createSpan({
        text: selectedMetric === "total" ? "Сумма за тренировку" : selectedMetric === "average" ? "Среднее за подход" : "Лучший подход"
      });
      const l2 = exLegend.createEl("span");
      l2.createEl("i", { attr: { style: "background: var(--text-muted); opacity: 0.65;" } });
      l2.createSpan({ text: "Скользящее среднее (4 трен.)" });

      if (animateTransition) {
        exChartWrap.style.opacity = "0.35";
        requestAnimationFrame(() => { exChartWrap.style.opacity = "1"; });
      }
      exChartWrap.replaceChildren();

      // Пустое или малочисленное состояние (0–1 точка)
      if (chartData.length < 2) {
        const emptyEl = exChartWrap.createDiv({ cls: "dh-ex-empty" });
        if (chartData.length === 1) {
          emptyEl.createSpan({
            text: `Записана 1 тренировка (${chartData[0].tooltipDate}: ${chartData[0].tooltipValue}).`,
            attr: { style: "font-weight: 600; color: var(--text-normal);" }
          });
          emptyEl.createSpan({
            text: "Добавь ещё одну сессию или расширь период до «Всё», чтобы построить кривую прогресса.",
            attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
          });
        } else {
          emptyEl.createSpan({ text: "За выбранный период подходящих тренировок нет." });
          emptyEl.createSpan({
            text: "Попробуй выбрать период «Всё» или переключить нагрузку в меню «⋯».",
            attr: { style: "font-size: 0.74rem; color: var(--text-faint);" }
          });
        }
        return;
      }

      const svgW = 720;
      const svgH = 235;
      const pad = { left: 48, right: 16, top: 14, bottom: 28 };
      const plotW = svgW - pad.left - pad.right;
      const plotH = svgH - pad.top - pad.bottom;

      const allVals = [...periodVals, ...chartData.map(d => d.avg).filter(Number.isFinite)];
      const { yMin, yMax, ticks } = computeExNiceScale(Math.min(...allVals), Math.max(...allVals), 4);
      const yRange = yMax - yMin || 1;

      const xFor = idx => pad.left + (chartData.length <= 1 ? plotW / 2 : (idx * plotW) / (chartData.length - 1));
      const yFor = val => pad.top + plotH - ((val - yMin) / yRange) * plotH;

      const svg = createHealthSvgNode(exChartWrap, "svg", {
        class: "dh-ex-svg",
        viewBox: `0 0 ${svgW} ${svgH}`,
        preserveAspectRatio: "xMidYMid meet",
        role: "img",
        "aria-label": `График прогресса: ${shortExName}`
      });

      // Горизонтальная сетка с «красивым» шагом
      ticks.forEach(tickVal => {
        const y = yFor(tickVal);
        createHealthSvgNode(svg, "line", {
          x1: pad.left, x2: svgW - pad.right, y1: y, y2: y,
          stroke: "var(--background-modifier-border)", "stroke-width": "1"
        });
        const lbl = createHealthSvgNode(svg, "text", {
          x: pad.left - 8, y: y + 4, "text-anchor": "end",
          fill: "var(--text-muted)", "font-size": "10"
        });
        lbl.textContent = fmt(tickVal);
      });

      // Подписи оси X (4–6 меток)
      const xLabelCount = Math.min(chartData.length, 5);
      for (let t = 0; t < xLabelCount; t++) {
        const idx = xLabelCount === 1 ? 0 : Math.round((t * (chartData.length - 1)) / (xLabelCount - 1));
        const lbl = createHealthSvgNode(svg, "text", {
          x: xFor(idx), y: svgH - 6, "text-anchor": "middle",
          fill: "var(--text-muted)", "font-size": "10"
        });
        lbl.textContent = chartData[idx].axisDate;
      }

      const mainCoords = chartData.map((d, i) => ({ x: xFor(i), y: yFor(d.value) }));
      const avgCoords = chartData.map((d, i) => ({ x: xFor(i), y: yFor(d.avg) }));

      const mainPathD = buildExMonotoneCubicPath(mainCoords);
      const avgPathD = buildExMonotoneCubicPath(avgCoords);
      const areaPathD = `${mainPathD} L ${mainCoords[mainCoords.length - 1].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} L ${mainCoords[0].x.toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

      const gradId = "dhExGrad-" + Math.random().toString(36).slice(2, 7);
      const defs = createHealthSvgNode(svg, "defs");
      const grad = createHealthSvgNode(defs, "linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
      createHealthSvgNode(grad, "stop", { offset: "0%", "stop-color": accentColor, "stop-opacity": "0.24" });
      createHealthSvgNode(grad, "stop", { offset: "100%", "stop-color": accentColor, "stop-opacity": "0.0" });

      createHealthSvgNode(svg, "path", {
        d: areaPathD, fill: `url(#${gradId})`, class: "dh-ex-area-anim"
      });

      createHealthSvgNode(svg, "path", {
        d: avgPathD, fill: "none", stroke: "var(--text-muted)",
        "stroke-width": "1.4", "stroke-dasharray": "4 4", opacity: "0.6"
      });

      const lineNode = createHealthSvgNode(svg, "path", {
        d: mainPathD, fill: "none", stroke: accentColor,
        "stroke-width": "2.8", "stroke-linecap": "round", "stroke-linejoin": "round",
        class: "dh-ex-line-anim"
      });
      try {
        const totalLen = lineNode.getTotalLength?.() || 1400;
        lineNode.style.setProperty("--path-len", String(Math.ceil(totalLen)));
      } catch {}

      // Точки тренировок, последняя точка выделена крупнее и с ореолом
      mainCoords.forEach((pt, idx) => {
        const isLast = idx === mainCoords.length - 1;
        if (isLast) {
          createHealthSvgNode(svg, "circle", {
            cx: pt.x, cy: pt.y, r: "8",
            fill: accentColor, opacity: "0.2", "pointer-events": "none"
          });
        }
        createHealthSvgNode(svg, "circle", {
          cx: pt.x, cy: pt.y, r: isLast ? "4.8" : "3",
          fill: isLast ? accentColor : "var(--background-primary)",
          stroke: accentColor,
          "stroke-width": isLast ? "2" : "1.8",
          "pointer-events": "none"
        });
      });

      // Вертикальная направляющая и маркер при наведении/касании
      const guideLine = createHealthSvgNode(svg, "line", {
        x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + plotH,
        class: "dh-ex-guide"
      });
      const activeDot = createHealthSvgNode(svg, "circle", {
        cx: mainCoords[0].x, cy: mainCoords[0].y, r: "6",
        fill: "var(--background-secondary)", stroke: accentColor, "stroke-width": "2.6",
        class: "dh-ex-active-dot"
      });

      const tooltip = exChartWrap.createDiv({ cls: "dh-ex-tooltip" });
      const ttDate = tooltip.createSpan({ cls: "dh-ex-tooltip-date" });
      const ttVal = tooltip.createSpan({ cls: "dh-ex-tooltip-val" });

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

        const leftPct = Math.max(10, Math.min(90, (c.x / svgW) * 100));
        const topPct = Math.max(16, (c.y / svgH) * 100);
        tooltip.style.left = `${leftPct}%`;
        tooltip.style.top = `${topPct}%`;
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

    exerciseSelect.onchange = () => {
      selectedExerciseKey = exerciseSelect.value;
      persistProgressState();
      renderProgressBlock(true);
    };
    metricSelect.onchange = () => {
      selectedMetric = metricSelect.value;
      persistProgressState();
      renderProgressBlock(true);
    };
    loadSelect.onchange = () => {
      selectedLoad = loadSelect.value;
      persistProgressState();
      renderProgressBlock(true);
    };

    renderProgressBlock(false);
  }

  const dynamicRecords = sortedVariantGroups.filter(list => list[0].unit === "повт.");

  if (dynamicRecords.length) {
    const recordsPanel = root.createDiv({
      cls: "dh-panel",
      attr: { style: "margin-top: 15px; padding: 16px; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border);" }
    });

    const recordsHead = recordsPanel.createDiv({ attr: { style: "margin-bottom: 12px;" } });
    recordsHead.createDiv({
      text: "🏆 Рекорды упражнений",
      attr: { style: "font-size: 1.05rem; font-weight: 600; color: var(--text-normal);" }
    });
    recordsHead.createDiv({
      text: "Сравнивается лучший подход за тренировку внутри одного упражнения, варианта техники и одинакового дополнительного веса",
      attr: { style: "font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;" }
    });

    const tableEl = recordsPanel.createEl("table", { cls: "dh-table", attr: { style: "width: 100%; border-collapse: collapse; font-size: 0.86rem;" } });
    const thead = tableEl.createEl("thead");
    const trH = thead.createEl("tr", { attr: { style: "border-bottom: 1px solid var(--background-modifier-border); text-align: left; color: var(--text-muted); font-size: 0.74rem; text-transform: uppercase;" } });
    trH.createEl("th", { text: "Упражнение", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "Нагрузка", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "Рекорд", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "Последний результат", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "К предыдущей", attr: { style: "padding: 8px 6px;" } });
    trH.createEl("th", { text: "Последняя тренировка", attr: { style: "padding: 8px 6px; text-align: right;" } });

    const tbody = tableEl.createEl("tbody");

    dynamicRecords.forEach(list => {
      const sorted = [...list].sort(newest);
      const latest = sorted[0];
      const previous = previousOf(latest, list);
      const best = Math.max(...list.map(g => g.best));

      const tr = tbody.createEl("tr", { attr: { style: "border-bottom: 1px solid var(--background-modifier-border);" } });

      const tdName = tr.createEl("td", { attr: { style: "padding: 8px 6px; font-weight: 500;" } });
      tdName.createEl("strong", { text: latest.name });
      if (latest.variant !== "Основной") {
        tdName.createSpan({
          text: " (" + latest.variant + ")",
          attr: { style: "font-size:0.75rem; color:var(--text-muted);" }
        });
      }

      const tdLoad = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      renderLoadBadge(tdLoad, latest.loadType, latest.weight);

      const tdBest = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      tdBest.createSpan({ text: "🥇 " + fmt(best), attr: { style: "font-weight:700; color:var(--text-normal);" } });
      tdBest.createSpan({ text: " " + latest.unit, attr: { style: "font-size:0.75rem; color:var(--text-muted);" } });

      const tdCur = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      tdCur.createSpan({ text: fmt(latest.best) });
      tdCur.createSpan({ text: " " + latest.unit, attr: { style: "font-size:0.75rem; color:var(--text-muted);" } });

      const tdDelta = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
      if (previous) {
        renderDeltaSpan(tdDelta, latest.best - previous.best, latest.unit);
      } else {
        tdDelta.createSpan({ text: "—", attr: { style: "color:var(--text-muted);" } });
      }

      const tdDate = tr.createEl("td", { attr: { style: "padding: 8px 6px; text-align: right;" } });
      const aLink = tdDate.createEl("a", {
        cls: "internal-link",
        text: latest.date ? latest.date.toFormat("dd.MM.yyyy") : "—",
        attr: { href: latest.path, style: "font-size:0.8rem; color:var(--text-accent);" }
      });
      aLink.onclick = e => { e.preventDefault(); app.workspace.openLinkText(latest.path, dv.currentFilePath, false); };
    });
  }

  // Блок «История подходов» использует ту же самую группировку sortedVariantGroups (byVariant), что и «Рекорды»
  if (sortedVariantGroups.length) {
    const openSet = new Set(hubUi.openHistoryKeys || []);
    const historyRoot = root.createDiv({ attr: { style: "margin-top: 15px;" } });
    historyRoot.createDiv({
      text: "📜 История подходов",
      attr: { style: "font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; color: var(--text-muted);" }
    });

    for (const rawList of sortedVariantGroups) {
      const list = [...rawList].sort(newest);
      if (!list.length) continue;

      const sample = list[0];
      const detailsKey = sample.key;
      const part = list.slice(0, HISTORY_LIMIT);
      const box = root.createEl("details", {
        cls: "dh-details",
        attr: { style: "margin-bottom: 6px; background: var(--background-secondary); border-radius: 6px; padding: 4px 8px;" }
      });
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

      box.createEl("summary", {
        text: summaryText,
        attr: { style: "font-size: 0.82rem; cursor: pointer; color: var(--text-normal); font-weight: 500;" }
      });

      const subTable = box.createEl("table", { cls: "dh-table", attr: { style: "width: 100%; margin-top: 8px; font-size: 0.8rem;" } });
      const tHead = subTable.createEl("thead");
      const rH = tHead.createEl("tr", { attr: { style: "color: var(--text-muted); border-bottom: 1px solid var(--background-modifier-border);" } });
      ["Дата", "Подходы", "Лучший", "Сумма", "Время"].forEach(h => rH.createEl("th", { text: h, attr: { style: "padding: 4px;" } }));

      const tBody = subTable.createEl("tbody");
      part.forEach(g => {
        const tr = tBody.createEl("tr", { attr: { style: "border-bottom: 1px solid var(--background-modifier-border);" } });
        const tdD = tr.createEl("td", { attr: { style: "padding: 4px;" } });
        const aL = tdD.createEl("a", { text: g.date ? g.date.toFormat("dd.MM") : "—", cls: "internal-link" });
        aL.onclick = ev => { ev.preventDefault(); app.workspace.openLinkText(g.path, dv.currentFilePath, false); };

        tr.createEl("td", { text: g.values.map(fmt).join(" · "), attr: { style: "padding: 4px;" } });
        tr.createEl("td", { text: fmt(g.best) + " " + sample.unit, attr: { style: "padding: 4px; font-weight: 600;" } });
        tr.createEl("td", { text: fmt(g.total) + " " + sample.unit, attr: { style: "padding: 4px;" } });
        tr.createEl("td", { text: g.duration > 0 ? fmt(g.duration) + " мин" : "—", attr: { style: "padding: 4px; color: var(--text-muted);" } });
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