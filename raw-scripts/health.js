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

  const SET_LINE_REGEX = /-\s*\(упражнение::\s*([^)]+)\)\s*\((повторы|секунды)::\s*(\d+(?:[.,]\d+)?)\)\s*\(доп_вес_кг::\s*([\d.,]+)\)\s*\(вариант::\s*([^)]+)\)/;

  const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };
  const text = v => typeof v === "string" ? v.trim() : "";
  const empty = v => v == null || v === "";

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
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
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

  const sum = a => a.reduce((x, y) => x + y, 0);
  const r2 = v => Math.round(v * 100) / 100;
  const fmt = v => v == null ? "—" : r2(v).toLocaleString("ru-RU");

  function renderLoadBadge(container, w) {
    if (w === 0) {
      container.createSpan({
        text: "Свой вес",
        attr: { style: "font-size:0.75rem; padding:1px 6px; border-radius:4px; background:var(--background-modifier-border); color:var(--text-muted);" }
      });
    } else {
      container.createSpan({
        text: "+" + fmt(w) + " кг",
        attr: { style: "font-size:0.75rem; padding:1px 6px; border-radius:4px; background:#e5a15822; color:#e5a158; font-weight:600; border:1px solid #e5a15844;" }
      });
    }
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
      const name = m[1].trim();
      const field = m[2].trim();
      const val = Number(m[3].replace(",", "."));
      const weight = Number(m[4].replace(",", "."));
      const variant = m[5].trim() || "Основной";
      if (Number.isFinite(val) && val > 0 && Number.isFinite(weight) && weight >= 0) {
        sets.push({ name, field, reps: val, weight, variant });
      }
    });
    return sets;
  }

  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
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
      setsRow.createSpan({
        text: (idx + 1) + ". " + s.name + ": " + fmt(s.reps) + " " + exMeta.unit + (s.weight > 0 ? " (+" + fmt(s.weight) + " кг)" : ""),
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
    const d = asDate(p.дата);
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
        const key = JSON.stringify([s.name, s.variant, s.weight]);
        if (!groups.has(key)) groups.set(key, {
          key, name: s.name, variant: s.variant, weight: s.weight, unit: e.unit, values: [],
          path: p.file.path, link: p.file.link, date: d, start,
          title: todayTitle || text(p.название_тренировки) || p.file.name,
          duration: durationVal
        });
        groups.get(key).values.push(s.reps);
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
        const weight = number(s.доп_вес_кг);
        if (weight === null || weight < 0) continue;
        const variant = text(s.вариант) || "Основной";
        const key = JSON.stringify([name, variant, weight]);
        if (!groups.has(key)) groups.set(key, {
          key, name, variant, weight, unit: e.unit, values: [], path: p.file.path, link: p.file.link, date: d, start,
          title: text(p.название_тренировки) || p.file.name, duration: durationVal,
        });
        groups.get(key).values.push(value);
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
      const key = JSON.stringify([s.name, s.variant, s.weight]);
      if (!groups.has(key)) groups.set(key, {
        key, name: s.name, variant: s.variant, weight: s.weight, unit: e.unit, values: [],
        path: todayFile.path, date: today, start: "",
        title: todayTitle, duration: todayDurationMin
      });
      groups.get(key).values.push(s.reps);
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
  const durations = [...sessions.values()].map(g => g.duration).filter(n => n > 0);
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

  const byVariant = new Map();
  for (const g of all) { if (!byVariant.has(g.key)) byVariant.set(g.key, []); byVariant.get(g.key).push(g); }

  const dynamicRecords = [...byVariant.values()].filter(list => list[0].unit === "повт.");

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

    dynamicRecords
      .sort((a, b) => order(a[0].name) - order(b[0].name) || a[0].variant.localeCompare(b[0].variant, "ru") || a[0].weight - b[0].weight)
      .forEach(list => {
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
        renderLoadBadge(tdLoad, latest.weight);

        const tdBest = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
        tdBest.createSpan({ text: "🥇 " + best, attr: { style: "font-weight:700; color:var(--text-normal);" } });
        tdBest.createSpan({ text: " " + latest.unit, attr: { style: "font-size:0.75rem; color:var(--text-muted);" } });

        const tdCur = tr.createEl("td", { attr: { style: "padding: 8px 6px;" } });
        tdCur.createSpan({ text: String(latest.best) });
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

  if (all.length) {
    const openSet = new Set(hubUi.openHistoryKeys || []);
    const historyRoot = root.createDiv({ attr: { style: "margin-top: 15px;" } });
    historyRoot.createDiv({
      text: "📜 История подходов",
      attr: { style: "font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; color: var(--text-muted);" }
    });

    for (const e of catalogList) {
      for (const weighted of [true, false]) {
        const list = all.filter(g => g.name === e.name && (g.weight > 0) === weighted).sort(newest);
        if (!list.length) continue;

        const detailsKey = e.name + "__" + (weighted ? "w" : "bw");
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

        const summaryText = e.name + " " + (weighted ? "(+" + fmt(list[0].weight) + " кг)" : "(свой вес)") +
          " · тренировок: " + list.length + " · лучший: " + Math.max(...list.map(g => g.best)) + " " + e.unit;
        box.createEl("summary", { text: summaryText, attr: { style: "font-size: 0.82rem; cursor: pointer; color: var(--text-normal); font-weight: 500;" } });

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
          tr.createEl("td", { text: fmt(g.best) + " " + e.unit, attr: { style: "padding: 4px; font-weight: 600;" } });
          tr.createEl("td", { text: fmt(g.total) + " " + e.unit, attr: { style: "padding: 4px;" } });
          tr.createEl("td", { text: g.duration > 0 ? fmt(g.duration) + " мин" : "—", attr: { style: "padding: 4px; color: var(--text-muted);" } });
        });
      }
    }
  }
}

if (section === "all" || section === "stats") {
  renderHealthStats();
}
if (section === "all" || section === "workouts") {
  renderWorkoutsHub();
}
