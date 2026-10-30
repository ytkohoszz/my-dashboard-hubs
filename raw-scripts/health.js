const section = (typeof input !== "undefined" && input && input.section) ? input.section : "all";

const DIARY_FOLDER_NAME = "Ежедневник";
const AUTO_DIET_MIN_KCAL = 2600; // Калории >= 2600 ккал автоматически отмечают «Диету» (массонабор)
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

// ========================================================
// МОДУЛЬ 1: ВЕС, КАЛОРИИ И БЫСТРЫЙ ВВОД ЗА СЕГОДНЯ
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

  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();

  const byDate = new Map();
  for (const p of dv.pages(SOURCE)) {
    const d = asDate(p.дата);
    if (!d || d > today) continue;
    const iso = d.toISODate();
    const old = byDate.get(iso);
    if (!old || mtime(p) > mtime(old)) byDate.set(iso, p);
  }

  const problems = [];
  const weight = new Map(), calories = new Map();
  for (const [iso, p] of byDate) {
    if (!empty(p.вес_кг)) {
      const val = typeof p.вес_кг === "number" ? p.вес_кг : Number(String(p.вес_кг).replace(",", "."));
      if (Number.isFinite(val) && val >= 20 && val <= 300) weight.set(iso, val);
      else problems.push([p.file.link, "вес_кг: нужно число от 20 до 300."]);
    }
    if (!empty(p.калории_ккал)) {
      const cal = typeof p.калории_ккал === "number" ? p.калории_ккал : Number(String(p.калории_ккал).replace(",", "."));
      if (Number.isFinite(cal) && cal > 0 && cal <= 10000) calories.set(iso, cal);
      else if (cal !== 0) problems.push([p.file.link, "калории_ккал: нужно число от 1 до 10000."]);
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

  const wCurMean = average(wCur7), wPrevMean = average(wPrev7);
  const cCurMean = average(cCur7), cPrevMean = average(cPrev7);

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

  createMinimalCard({
    label: "Средние калории · 7 дней",
    value: cCurMean !== null ? fmt(cCurMean, 0, 0) + " ккал" : "—",
    deltaBadge: calWeekDelta,
    accent: "#69b5aa",
    rows: hasEnoughCal
      ? [
          { k: "Текущие 7 дн. (" + curWeekRange + ")", v: fmt(cCurMean, 0, 0) + " ккал · " + cCur7.length + "/7 дн." },
          { k: "Разброс", minMax: { min: fmt(Math.min(...cCur7), 0, 0), max: fmt(Math.max(...cCur7), 0, 0) }, neutralMinMax: true },
          { k: "Пред. 7 дн. (" + prevWeekRange + ")", v: fmt(cPrevMean, 0, 0) + " ккал · " + cPrev7.length + "/7 дн." }
        ]
      : [
          { k: "Статус", v: "Недостаточно данных для сравнения", vColor: "#e5a158" },
          { k: "Текущие 7 дн. (" + curWeekRange + ")", v: cCur7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")" },
          ...(cCur7.length
            ? [{ k: "Разброс", minMax: { min: fmt(Math.min(...cCur7), 0, 0), max: fmt(Math.max(...cCur7), 0, 0) }, neutralMinMax: true }]
            : []),
          {
            k: "Пред. 7 дн. (" + prevWeekRange + ")",
            v: (cPrevMean !== null ? fmt(cPrevMean, 0, 0) + " ккал · " : "") + cPrev7.length + "/7 дн. (нужно ≥" + MIN_WEEK_DAYS + ")"
          }
        ]
  });

  // --- Быстрый ввод веса и калорий за сегодня с автоотметкой диеты ---
  const todayDiaryPage = byDate.get(todayISO) || null;
  if (todayDiaryPage) {
    const diaryFile = app.vault.getAbstractFileByPath(todayDiaryPage.file.path);
    const curW = weight.has(todayISO) ? weight.get(todayISO) : null;
    const curC = calories.has(todayISO) ? calories.get(todayISO) : null;
    const isDietDone = todayDiaryPage.диета === true || (curC !== null && curC >= AUTO_DIET_MIN_KCAL);

    const quickBar = root.createDiv({
      attr: {
        style: "margin-top: 12px; padding: 10px 14px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;"
      }
    });

    const leftInfo = quickBar.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });
    leftInfo.createSpan({
      text: "🥗 Сегодня (" + today.toFormat("dd.MM") + "):",
      attr: { style: "font-size: 0.82rem; font-weight: 600; color: var(--text-normal);" }
    });
    const dietBadge = leftInfo.createSpan({
      text: isDietDone ? "✓ Диета закрыта (≥" + AUTO_DIET_MIN_KCAL + " ккал)" : "Диета: цель " + AUTO_DIET_MIN_KCAL + " ккал",
      attr: {
        style: "font-size: 0.73rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; " +
          (isDietDone
            ? "background: #4aab8018; color: #4aab80; border: 1px solid #4aab8044;"
            : "background: var(--background-primary); color: var(--text-muted); border: 1px solid var(--background-modifier-border);")
      }
    });

    const controlsWrap = quickBar.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

    const wInput = controlsWrap.createEl("input", {
      attr: {
        type: "text",
        inputmode: "decimal",
        placeholder: "Вес (кг)",
        value: curW !== null ? String(curW).replace(".", ",") : "",
        style: "width: 95px; height: 28px; font-size: 0.82rem; padding: 2px 8px; border-radius: 6px;"
      }
    });

    const cInput = controlsWrap.createEl("input", {
      attr: {
        type: "text",
        inputmode: "numeric",
        placeholder: "Калории",
        value: curC !== null ? String(Math.round(curC)) : "",
        style: "width: 105px; height: 28px; font-size: 0.82rem; padding: 2px 8px; border-radius: 6px;"
      }
    });

    const saveQuickBtn = controlsWrap.createEl("button", {
      cls: "dh-btn mod-cta",
      text: "Сохранить",
      attr: { type: "button", style: "height: 28px; font-size: 0.78rem; padding: 0 12px;" }
    });

    const commitQuickMetrics = async () => {
      if (!diaryFile || saveQuickBtn.disabled) return;
      const rawW = wInput.value.trim().replace(",", ".");
      const rawC = cInput.value.trim().replace(",", ".");

      let nextW = null;
      if (rawW !== "") {
        const parsedW = Number(rawW);
        if (!Number.isFinite(parsedW) || parsedW < 20 || parsedW > 300) {
          notify("Вес должен быть числом от 20 до 300 кг.");
          return;
        }
        nextW = Math.round(parsedW * 10) / 10;
      }

      let nextC = null;
      if (rawC !== "") {
        const parsedC = Number(rawC);
        if (!Number.isFinite(parsedC) || parsedC < 0 || parsedC > 10000) {
          notify("Калории должны быть числом от 0 до 10000 ккал.");
          return;
        }
        nextC = Math.round(parsedC);
      }

      saveQuickBtn.disabled = true;
      try {
        clearManualHabitOverrideForDate(todayISO, "диета");
        const autoDiet = nextC !== null ? nextC >= AUTO_DIET_MIN_KCAL : false;
        await app.fileManager.processFrontMatter(diaryFile, fm => {
          fm.вес_кг = nextW;
          fm.калории_ккал = nextC;
          if (nextC !== null) {
            fm.диета = autoDiet;
          }
        });
        dietBadge.setText(autoDiet ? "✓ Диета закрыта (≥" + AUTO_DIET_MIN_KCAL + " ккал)" : "Диета: цель " + AUTO_DIET_MIN_KCAL + " ккал");
        dietBadge.style.background = autoDiet ? "#4aab8018" : "var(--background-primary)";
        dietBadge.style.color = autoDiet ? "#4aab80" : "var(--text-muted)";
        dietBadge.style.borderColor = autoDiet ? "#4aab8044" : "var(--background-modifier-border)";
        notify("Показатели за сегодня обновлены.");
      } catch (e) {
        notify("Ошибка сохранения: " + (e?.message || e));
      } finally {
        saveQuickBtn.disabled = false;
      }
    };

    saveQuickBtn.onclick = commitQuickMetrics;
    wInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); commitQuickMetrics(); } };
    cInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); commitQuickMetrics(); } };
  }

  if (problems.length) {
    const box = root.createEl("details", { cls: "dh-details", attr: { style: "margin-top: 10px;" } });
    box.createEl("summary", { text: "Ошибки в записях · " + problems.length });
    dv.api.table(["Заметка", "Проблема"], problems, box, dv.component, dv.currentFilePath);
  }
}

// ========================================================
// МОДУЛЬ 2: ЕДИНЫЙ МОДУЛЬ ТРЕНИРОВОК (ТЕРМИНАЛ + РЕКОРДЫ)
// ========================================================
async function renderWorkoutsHub() {
  const KNOWLEDGE_FOLDER = "Знания";
  const DIARY_FOLDER = DIARY_FOLDER_NAME;
  const SOURCE = '"' + KNOWLEDGE_FOLDER + '"';
  const JOURNAL = '"' + DIARY_FOLDER + '"';
  const HISTORY_LIMIT = 20;
  const DAYS_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const SCHEDULE = {
    1: {
      title: "Понедельник · Выходы силой",
      restBetweenSets: 150,
      exercises: [
        { name: "Выходы силой", series: 1, sets: 4, weight: 8, target: "MAX", rest: 150 },
        { name: "Выходы силой", series: 2, sets: 4, weight: 4, target: "MAX", rest: 150 },
        { name: "Выходы силой", series: 3, sets: 4, weight: 0, target: "MAX", rest: 150 },
      ],
      note: "Разные хваты. Отдых между подходами: 2–3 мин, между сериями: 15–20 мин."
    },
    2: {
      title: "Вторник · Подтягивания с весом",
      restBetweenSets: 210,
      exercises: [
        { name: "Подтягивания", series: 1, sets: 3, weight: 16, target: "3–5", rest: 210 },
        { name: "Подтягивания", series: 2, sets: 3, weight: 16, target: "3–5", rest: 210 },
        { name: "Подтягивания", series: 3, sets: 3, weight: 16, target: "3–5", rest: 210 },
      ],
      note: "3 серии по 3 подхода. Отдых между подходами: 3–4 мин, между сериями: 10–15 мин."
    },
    3: {
      title: "Среда · Ноги",
      restBetweenSets: 120,
      exercises: [
        { name: "Приседания", sets: 4, weight: 16, target: "12–15", rest: 150 },
        { name: "Выпады", sets: 4, weight: 36, target: "10–12", rest: 120 },
        { name: "Подъёмы на носки", sets: 5, weight: 0, target: "15–20", rest: 75 },
      ],
      note: "Приседания с жилетом 16 кг, выпады с весом 36 кг. Заверши растяжкой."
    },
    4: {
      title: "Четверг · Объёмные подтягивания",
      restBetweenSets: 60,
      isVolumePullups: true,
      targetVolume: 100,
      exercises: [
        { name: "Подтягивания", series: 1, sets: 6, weight: 0, target: "6–10", rest: 60 },
        { name: "Подтягивания", series: 2, sets: 6, weight: 0, target: "6–10", rest: 60 },
        { name: "Подтягивания", series: 3, sets: 6, weight: 0, target: "6–10", rest: 60 },
      ],
      note: "3 серии по 5–6 подходов без веса. Суммарно не меньше 100 повторений. Растяжка между сериями."
    },
    5: {
      title: "Пятница · Брусья",
      restBetweenSets: 210,
      exercises: [
        { name: "Брусья", sets: 4, weight: 16, target: "MAX", rest: 210 },
        { name: "Брусья", sets: 2, weight: 0, target: "MAX", rest: 210 },
      ],
      note: "4 подхода с весом на максимум + 2 подхода без веса на максимум. Отдых 3–4 мин."
    },
    6: {
      title: "Суbmота · Кольца".replace("Суbmота", "Суббота"),
      restBetweenSets: 150,
      exercises: [
        { name: "Жим на кольцах", sets: 4, weight: 0, target: "MAX", rest: 150 },
        { name: "Подтягивания на кольцах", sets: 4, weight: 0, target: "MAX", rest: 150 },
        { name: "Подводящие к выходу на кольцах", sets: 3, weight: 0, target: "MAX", rest: 150 },
        { name: "Отжимания на кольцах", sets: 4, weight: 0, target: "MAX", rest: 150 },
      ],
      note: "Жим, подтягивания, подводящие, отжимания. Отдых 2–3 мин."
    },
    7: {
      title: "Воскресенье · Восстановление",
      isRestDay: true,
      note: "Полное восстановление. Без тренировки."
    }
  };

  const EXERCISES = [
    { name: "Выходы силой", unit: "повт.", field: "повторы" },
    { name: "Подтягивания", unit: "повт.", field: "повторы" },
    { name: "Высокие подтягивания", unit: "повт.", field: "повторы" },
    { name: "Брусья", unit: "повт.", field: "повторы" },
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
    { name: "Уголок на паралетсах", unit: "с", field: "секунды" },
  ];

  const REST_PRESETS = [60, 90, 120, 150, 180, 210];
  const SET_LINE_REGEX = /-\s*\(упражнение::\s*([^)]+)\)\s*\((повторы|секунды)::\s*(\d+(?:[.,]\d+)?)\)\s*\(доп_вес_кг::\s*([\d.,]+)\)\s*\(вариант::\s*([^)]+)\)/;

  const catalog = new Map(EXERCISES.map(e => [e.name, e]));
  const order = name => EXERCISES.findIndex(e => e.name === name);
  const text = v => typeof v === "string" ? v.trim() : "";
  const empty = v => v == null || v === "";
  const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };

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

  // Автоматическая отметка тренировка: true в ежедневнике
  async function syncWorkoutHabitToDiary(targetDateISO) {
    if (!targetDateISO) return;
    clearManualHabitOverrideForDate(targetDateISO, "тренировка");
    const diaryPage = dv.pages(JOURNAL).array()
      .find(p => p.дата && toISODateString(p.дата) === targetDateISO);
    const diaryFile = diaryPage
      ? app.vault.getAbstractFileByPath(diaryPage.file.path)
      : app.vault.getAbstractFileByPath(DIARY_FOLDER + "/" + targetDateISO + ".md");
    if (diaryFile) {
      try {
        await app.fileManager.processFrontMatter(diaryFile, fm => {
          fm.тренировка = true;
        });
      } catch (e) {
        console.log("Diary workout sync error:", e);
      }
    }
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
  const SESSION_STORAGE_PREFIX = "dh_workout_session_v2:";

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
      selectedDay: null,
      pinnedSessionPath: null,
      viewMode: "session",
      openHistoryKeys: []
    });
  }
  const hubUi = window.__dhWorkoutHubUi;
  function saveHubUi(patch) {
    Object.assign(hubUi, patch);
    writeJsonStorage(UI_STORAGE_KEY, hubUi);
  }

  if (!window.__dhWorkoutSessions) window.__dhWorkoutSessions = new Map();

  function getSessionState(sessionPath) {
    if (!sessionPath) return null;
    if (!window.__dhWorkoutSessions.has(sessionPath)) {
      const initial = readJsonStorage(SESSION_STORAGE_PREFIX + sessionPath, {
        restEndAt: 0,
        restDurationSec: 0,
        notifiedEndAt: 0,
        selectedExKey: null,
        customWeight: null,
        draftReps: ""
      });
      window.__dhWorkoutSessions.set(sessionPath, initial);
    }
    return window.__dhWorkoutSessions.get(sessionPath);
  }

  function saveSessionState(sessionPath, patch) {
    if (!sessionPath) return null;
    const cur = getSessionState(sessionPath);
    Object.assign(cur, patch);
    writeJsonStorage(SESSION_STORAGE_PREFIX + sessionPath, cur);
    return cur;
  }

  function stopActiveTimerInterval() {
    if (window.__dhTrainingTimerCleanup) {
      try { window.__dhTrainingTimerCleanup(); } catch {}
      window.__dhTrainingTimerCleanup = null;
    }
  }
  stopActiveTimerInterval();
  if (dv.component?.register) {
    dv.component.register(() => stopActiveTimerInterval());
  }

  function resolveSessionProgramDay(meta = {}, fallbackDateISO = null) {
    const explicitDay = number(meta.день_программы);
    if (explicitDay && SCHEDULE[explicitDay]) return explicitDay;

    const title = text(meta.название_тренировки);
    if (title) {
      for (const [k, prog] of Object.entries(SCHEDULE)) {
        if (prog.title === title) return Number(k);
      }
      const dayPrefixMap = {
        "понедельник": 1,
        "вторник": 2,
        "среда": 3,
        "четверг": 4,
        "пятница": 5,
        "суббота": 6,
        "воскресенье": 7
      };
      const lower = title.toLowerCase();
      for (const [prefix, dNum] of Object.entries(dayPrefixMap)) {
        if (lower.startsWith(prefix)) return dNum;
      }
    }

    const iso = toISODateString(meta.дата) || fallbackDateISO;
    if (iso) {
      const m = moment(iso, "YYYY-MM-DD", true);
      if (m.isValid()) return m.isoWeekday();
    }
    return moment().isoWeekday();
  }

  function getUniqueProgramExercises(program) {
    const unique = [];
    const seen = new Set();
    (program?.exercises || []).forEach(e => {
      const key = e.name + "__" + e.weight;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ ...e, key });
      }
    });
    return unique;
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

  function collectSessionEntries(todayISO) {
    const byPath = new Map();

    for (const p of dv.pages(SOURCE)) {
      if (p.тип !== "Тренировка") continue;
      const file = app.vault.getAbstractFileByPath(p.file.path);
      if (!file) continue;
      const fm = app.metadataCache.getFileCache(file)?.frontmatter || {};
      const dateISO = toISODateString(fm.дата ?? p.дата) || toISODateString(file.basename.replace(/^Тренировка\s+/i, ""));
      const programDay = resolveSessionProgramDay({
        день_программы: fm.день_программы ?? p.день_программы,
        название_тренировки: fm.название_тренировки ?? p.название_тренировки,
        дата: dateISO
      }, dateISO);
      const durationMin = number(fm.длительность_мин ?? p.длительность_мин);
      const startStr = text(fm.начало ?? p.начало);
      const title = text(fm.название_тренировки ?? p.название_тренировки) || SCHEDULE[programDay]?.title || file.basename;
      byPath.set(file.path, { file, path: file.path, dateISO, programDay, durationMin, startStr, title });
    }

    const yesterdayISO = moment(todayISO, "YYYY-MM-DD").subtract(1, "days").format("YYYY-MM-DD");
    for (const probeISO of [todayISO, yesterdayISO]) {
      const directPath = KNOWLEDGE_FOLDER + "/Тренировка " + probeISO + ".md";
      if (byPath.has(directPath)) continue;
      const file = app.vault.getAbstractFileByPath(directPath);
      if (!file) continue;
      const fm = app.metadataCache.getFileCache(file)?.frontmatter || {};
      const dateISO = toISODateString(fm.дата) || probeISO;
      const programDay = resolveSessionProgramDay(fm, dateISO);
      const durationMin = number(fm.длительность_мин);
      const startStr = text(fm.начало);
      const title = text(fm.название_тренировки) || SCHEDULE[programDay]?.title || file.basename;
      byPath.set(file.path, { file, path: file.path, dateISO, programDay, durationMin, startStr, title });
    }

    return [...byPath.values()].sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || "") || b.path.localeCompare(a.path, "ru"));
  }

  function stripQuotes(str) {
    let s = String(str || "").trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  async function hydrateSessionEntry(entry) {
    if (!entry?.file) return null;
    const content = await app.vault.read(entry.file);
    const fm = app.metadataCache.getFileCache(entry.file)?.frontmatter || {};

    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const rawYaml = fmMatch ? fmMatch[1] : "";
    const yamlLines = rawYaml.split(/\r?\n/);
    const yamlVal = key => {
      const prefix = key + ":";
      for (const line of yamlLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(prefix)) {
          return stripQuotes(trimmed.slice(prefix.length));
        }
      }
      return "";
    };

    const dateISO = toISODateString(fm.дата || yamlVal("дата")) || entry.dateISO;
    const startStr = text(fm.начало || yamlVal("начало") || entry.startStr);
    const rawDur = fm.длительность_мин ?? yamlVal("длительность_мин");
    const durationMin = number(rawDur);
    const rawProgDay = fm.день_программы ?? yamlVal("день_программы");
    const rawTitle = text(fm.название_тренировки || yamlVal("название_тренировки") || entry.title);

    const programDay = resolveSessionProgramDay({
      день_программы: rawProgDay,
      название_тренировки: rawTitle,
      дата: dateISO
    }, dateISO);

    return {
      file: entry.file,
      path: entry.file.path,
      content,
      dateISO,
      startStr,
      durationMin,
      programDay,
      title: rawTitle || SCHEDULE[programDay]?.title || entry.file.basename,
      loggedSets: parseSetsFromContent(content)
    };
  }

  function formatSecondsMMSS(sec) {
    const safe = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(safe / 60)).padStart(2, "0");
    const s = String(safe % 60).padStart(2, "0");
    return m + ":" + s;
  }

  function bindSessionTimerDisplay(sessionPath, displayEl, statusEl) {
    stopActiveTimerInterval();
    if (!sessionPath || !displayEl) return;

    const st = getSessionState(sessionPath);
    const now = Date.now();

    if (st.restEndAt > 0 && st.restEndAt <= now) {
      saveSessionState(sessionPath, { restEndAt: 0, notifiedEndAt: st.restEndAt });
    }

    const updateTick = () => {
      if (!displayEl.isConnected) {
        stopActiveTimerInterval();
        return;
      }
      const cur = getSessionState(sessionPath);
      if (!cur || !cur.restEndAt) {
        displayEl.setText("00:00");
        displayEl.style.color = "var(--text-normal)";
        if (statusEl) statusEl.setText(cur?.restDurationSec ? "Выбран отдых: " + cur.restDurationSec + " с" : "Таймер остановлен");
        stopActiveTimerInterval();
        return;
      }

      const remMs = cur.restEndAt - Date.now();
      const remSec = Math.max(0, Math.ceil(remMs / 1000));
      displayEl.setText(formatSecondsMMSS(remSec));

      if (remSec > 0) {
        displayEl.style.color = "#e5a158";
        if (statusEl) statusEl.setText("Идёт отдых · до " + moment(cur.restEndAt).format("HH:mm:ss"));
      } else {
        displayEl.setText("00:00");
        displayEl.style.color = "#4aab80";
        if (statusEl) statusEl.setText("Отдых завершён — пора на подход!");
        const finishedEndAt = cur.restEndAt;
        const alreadyNotified = cur.notifiedEndAt === finishedEndAt;
        saveSessionState(sessionPath, { restEndAt: 0, notifiedEndAt: finishedEndAt });
        stopActiveTimerInterval();
        if (!alreadyNotified) {
          notify("⏰ Время отдыха истекло! Пора на подход.");
        }
      }
    };

    updateTick();
    if (getSessionState(sessionPath)?.restEndAt > Date.now()) {
      const id = window.setInterval(updateTick, 250);
      window.__dhTrainingTimerCleanup = () => window.clearInterval(id);
    }
  }

  function startSessionRestTimer(sessionPath, durationSec, displayEl, statusEl) {
    const sec = Math.max(1, Math.round(Number(durationSec) || 120));
    const endAt = Date.now() + sec * 1000;
    saveSessionState(sessionPath, {
      restDurationSec: sec,
      restEndAt: endAt,
      notifiedEndAt: 0
    });
    bindSessionTimerDisplay(sessionPath, displayEl, statusEl);
  }

  function resetSessionRestTimer(sessionPath, displayEl, statusEl) {
    stopActiveTimerInterval();
    saveSessionState(sessionPath, { restEndAt: 0 });
    if (displayEl) {
      displayEl.setText("00:00");
      displayEl.style.color = "var(--text-normal)";
    }
    const st = getSessionState(sessionPath);
    if (statusEl) statusEl.setText(st?.restDurationSec ? "Выбран отдых: " + st.restDurationSec + " с" : "Таймер сброшен");
  }

  const root = dv.container.createDiv({ cls: "dh dh-trainings-hub", attr: { style: "margin: 20px 0 25px 0;" } });
  let renderGeneration = 0;

  async function renderEverything() {
    const myGen = ++renderGeneration;
    const nowMoment = moment();
    const currentIsoWeekday = nowMoment.isoWeekday();
    const todayISO = nowMoment.format("YYYY-MM-DD");
    const yesterdayISO = nowMoment.clone().subtract(1, "days").format("YYYY-MM-DD");
    const today = dv.date("today").startOf("day");

    const allEntries = collectSessionEntries(todayISO);
    const byPath = new Map(allEntries.map(e => [e.path, e]));
    const todayEntry = allEntries.find(e => e.dateISO === todayISO) || null;
    const unfinishedYesterdayEntry = !todayEntry
      ? allEntries.find(e => e.dateISO === yesterdayISO && e.durationMin == null)
      : null;

    let activeEntry = null;
    if (hubUi.pinnedSessionPath && byPath.has(hubUi.pinnedSessionPath)) {
      activeEntry = byPath.get(hubUi.pinnedSessionPath);
    } else if (todayEntry) {
      activeEntry = todayEntry;
      saveHubUi({ pinnedSessionPath: todayEntry.path });
    } else if (unfinishedYesterdayEntry) {
      activeEntry = unfinishedYesterdayEntry;
      saveHubUi({ pinnedSessionPath: unfinishedYesterdayEntry.path });
    } else if (hubUi.pinnedSessionPath) {
      saveHubUi({ pinnedSessionPath: null });
    }

    const session = activeEntry ? await hydrateSessionEntry(activeEntry) : null;
    if (myGen !== renderGeneration) return;

    if (!hubUi.selectedDay || !SCHEDULE[hubUi.selectedDay]) {
      saveHubUi({ selectedDay: session ? session.programDay : currentIsoWeekday });
    }

    const isPreviewingOtherDay = Boolean(session && hubUi.viewMode === "preview" && hubUi.selectedDay !== session.programDay);
    const activeDayNumber = session && !isPreviewingOtherDay ? session.programDay : (hubUi.selectedDay || currentIsoWeekday);
    const program = SCHEDULE[activeDayNumber] || SCHEDULE[currentIsoWeekday];

    const prevHeight = root.offsetHeight;
    if (prevHeight > 0) root.style.minHeight = prevHeight + "px";
    stopActiveTimerInterval();
    root.empty();

    const termPanel = root.createDiv({
      cls: "dh-panel",
      attr: { style: "padding: 16px; margin-bottom: 20px; background: var(--background-secondary); border-radius: 10px; border: 1px solid var(--background-modifier-border); border-top: 3px solid #d69852;" }
    });

    const termHead = termPanel.createDiv({
      attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;" }
    });

    const termTitleLeft = termHead.createDiv();
    termTitleLeft.createDiv({ text: "🏋️ Терминал тренировки", attr: { style: "font-size: 1.05rem; font-weight: 700; color: var(--text-normal);" } });
    const subTitleRow = termTitleLeft.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px;" } });
    subTitleRow.createSpan({ text: program.title, attr: { style: "font-size: 0.88rem; font-weight: 600; color: #d69852;" } });

    if (session && !isPreviewingOtherDay) {
      const isPastSession = session.dateISO && session.dateISO !== todayISO;
      const badgeText = isPastSession ? "Сессия от " + moment(session.dateISO, "YYYY-MM-DD").format("DD.MM.YYYY") : "Активная сессия · в дневнике ✓";
      const sessionLink = subTitleRow.createEl("a", {
        cls: "internal-link",
        text: "📄 " + badgeText,
        attr: {
          href: session.path,
          style: "font-size: 0.74rem; padding: 1px 8px; border-radius: 5px; text-decoration: none; border: 1px solid " +
            (isPastSession ? "#599ed666" : "#4aab8066") + "; background: " +
            (isPastSession ? "#599ed618" : "#4aab8018") + "; color: " +
            (isPastSession ? "#599ed6" : "#4aab80") + ";"
        }
      });
      sessionLink.onclick = e => {
        e.preventDefault();
        app.workspace.openLinkText(session.path, dv.currentFilePath, false);
      };
    }

    const headRight = termHead.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

    const dayButtons = headRight.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 5px; flex-wrap: wrap;" } });
    DAYS_NAMES.forEach((name, idx) => {
      const dNum = idx + 1;
      const isSelected = activeDayNumber === dNum;
      const b = dayButtons.createEl("button", {
        cls: "dh-chip" + (isSelected ? " is-active" : ""),
        text: name + (dNum === currentIsoWeekday ? " •" : ""),
        attr: { type: "button", style: "font-size: 0.78rem; padding: 3px 10px;" }
      });
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => {
        if (session && dNum === session.programDay) {
          saveHubUi({ selectedDay: dNum, viewMode: "session" });
        } else if (session) {
          saveHubUi({ selectedDay: dNum, viewMode: "preview" });
        } else {
          saveHubUi({ selectedDay: dNum, viewMode: "session" });
        }
        renderEverything();
      };
    });

    if (allEntries.length > 0) {
      const sessionPicker = headRight.createEl("select", {
        cls: "dropdown",
        attr: {
          title: "Открыть существующую сессию в терминале",
          style: "font-size: 0.75rem; height: 26px; max-width: 195px; padding: 2px 22px 2px 8px;"
        }
      });
      sessionPicker.createEl("option", {
        value: "__new__",
        text: todayEntry ? "Сегодняшняя сессия" : "Новая / выбор дня"
      });
      allEntries.slice(0, 15).forEach(e => {
        const dateFmt = e.dateISO ? moment(e.dateISO, "YYYY-MM-DD").format("DD.MM") : e.file.basename;
        const shortTitle = e.title.split("·")[1]?.trim() || e.title;
        const opt = sessionPicker.createEl("option", {
          value: e.path,
          text: dateFmt + " · " + DAYS_NAMES[(e.programDay || 1) - 1] + " (" + shortTitle + ")"
        });
        if (session && session.path === e.path && !isPreviewingOtherDay) opt.selected = true;
      });
      if (!session || isPreviewingOtherDay) sessionPicker.value = "__new__";

      sessionPicker.onchange = () => {
        const val = sessionPicker.value;
        if (val === "__new__") {
          if (todayEntry) {
            saveHubUi({ pinnedSessionPath: todayEntry.path, selectedDay: todayEntry.programDay, viewMode: "session" });
          } else {
            saveHubUi({ pinnedSessionPath: null, selectedDay: currentIsoWeekday, viewMode: "preview" });
          }
        } else {
          const picked = byPath.get(val);
          if (picked) {
            saveHubUi({ pinnedSessionPath: picked.path, selectedDay: picked.programDay, viewMode: "session" });
          }
        }
        renderEverything();
      };
    }

    termPanel.createDiv({ cls: "dh-muted", text: program.note, attr: { style: "margin-bottom: 12px; font-size: 0.8rem;" } });

    if (isPreviewingOtherDay && session) {
      const previewBanner = termPanel.createDiv({
        attr: { style: "margin-bottom: 12px; padding: 10px 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid #e5a15866; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;" }
      });
      previewBanner.createSpan({
        text: "Просмотр программы «" + program.title + "». Открыта сессия: " + session.title + " (" + session.dateISO + ").",
        attr: { style: "font-size: 0.8rem; color: var(--text-normal);" }
      });
      const backBtn = previewBanner.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "↩ Вернуться к активной сессии",
        attr: { type: "button", style: "font-size: 0.78rem; padding: 4px 12px;" }
      });
      backBtn.onclick = () => {
        saveHubUi({ selectedDay: session.programDay, viewMode: "session" });
        renderEverything();
      };
    }

    const loggedSets = session && !isPreviewingOtherDay ? session.loggedSets : [];

    if (program.isRestDay && (!session || isPreviewingOtherDay)) {
      const restCard = termPanel.createDiv({
        attr: { style: "padding: 16px; text-align: center; background: var(--background-primary); border-radius: 8px; border: 1px dashed var(--background-modifier-border);" }
      });
      restCard.createDiv({ text: "🌿 День отдыха и восстановления", attr: { style: "font-weight: 600; font-size: 0.92rem;" } });
      restCard.createDiv({ cls: "dh-muted", text: "Мышцы и ЦНС восстанавливаются. Прогулка, сон, питание.", attr: { style: "margin-top: 4px;" } });
    } else if (!session || isPreviewingOtherDay) {
      const startWrap = termPanel.createDiv({ attr: { style: "display: flex; align-items: center; gap: 10px; flex-wrap: wrap;" } });
      const startBtn = startWrap.createEl("button", {
        cls: "dh-btn mod-cta",
        text: todayEntry
          ? "📂 Открыть сегодняшнюю сессию"
          : "▶ Начать тренировку (создать файл сессии)",
        attr: { type: "button", style: "font-size: 0.85rem; padding: 6px 16px;" }
      });

      startBtn.onclick = async () => {
        startBtn.disabled = true;
        try {
          const filename = KNOWLEDGE_FOLDER + "/Тренировка " + todayISO + ".md";
          let file = app.vault.getAbstractFileByPath(filename);
          if (!file) {
            const timeNow = moment().format("HH:mm");
            const fm = [
              "---",
              "тип: Тренировка",
              "дата: " + todayISO,
              'начало: "' + timeNow + '"',
              'название_тренировки: "' + program.title + '"',
              "день_программы: " + activeDayNumber,
              "длительность_мин:",
              "---",
              "",
              "## Подходы",
              ""
            ].join("\n");
            file = await app.vault.create(filename, fm);
            await syncWorkoutHabitToDiary(todayISO);
            notify("Тренировка начата и отмечена в дневнике: " + program.title);
          } else {
            await syncWorkoutHabitToDiary(todayISO);
            notify("Открыта сегодняшняя сессия.");
          }
          saveHubUi({
            pinnedSessionPath: file.path,
            selectedDay: activeDayNumber,
            viewMode: "session"
          });
          await renderEverything();
        } catch (e) {
          notify("❌ Ошибка создания сессии: " + (e?.message || e));
          startBtn.disabled = false;
        }
      };
    } else {
      const sessionState = getSessionState(session.path);
      const uniqueExercises = getUniqueProgramExercises(program);

      if (!uniqueExercises.length) {
        EXERCISES.forEach(e => uniqueExercises.push({ name: e.name, weight: 0, rest: 120, key: e.name + "__0" }));
      }

      let selectedExIdx = uniqueExercises.findIndex(e => e.key === sessionState.selectedExKey);
      if (selectedExIdx < 0) selectedExIdx = 0;
      const currentSelectedEx = uniqueExercises[selectedExIdx] || uniqueExercises[0];

      if (!sessionState.restDurationSec) {
        saveSessionState(session.path, {
          restDurationSec: Number(currentSelectedEx?.rest) || program.restBetweenSets || 120
        });
      }

      const activeGrid = termPanel.createDiv({
        attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 12px; align-items: stretch;" }
      });

      const timerBox = activeGrid.createDiv({
        attr: { style: "padding: 12px 14px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; justify-content: space-between; gap: 10px;" }
      });

      const timerTop = timerBox.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px;" } });
      const timerLabelWrap = timerTop.createDiv();
      timerLabelWrap.createDiv({ text: "⏱️ Таймер отдыха", attr: { style: "font-size: 0.82rem; font-weight: 600; color: var(--text-muted);" } });
      const timerStatus = timerLabelWrap.createDiv({
        text: "Выбран отдых: " + sessionState.restDurationSec + " с",
        attr: { style: "font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;" }
      });

      const timerDisplay = timerTop.createSpan({
        text: "00:00",
        attr: { style: "font-family: monospace; font-size: 1.45rem; font-weight: 700; color: var(--text-normal);" }
      });

      const timerBtns = timerBox.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 4px; flex-wrap: wrap;" } });
      const presetChipEls = new Map();

      const refreshPresetActiveState = () => {
        const curRest = getSessionState(session.path)?.restDurationSec;
        for (const [sec, btnEl] of presetChipEls.entries()) {
          btnEl.classList.toggle("is-active", curRest === sec);
        }
      };

      REST_PRESETS.forEach(s => {
        const tb = timerBtns.createEl("button", {
          cls: "dh-chip" + (sessionState.restDurationSec === s ? " is-active" : ""),
          text: s >= 60 ? (s / 60) + "м" : s + "с",
          attr: { type: "button", style: "font-size: 0.74rem; padding: 2px 8px;" }
        });
        tb.onmousedown = e => e.preventDefault();
        tb.onclick = () => {
          startSessionRestTimer(session.path, s, timerDisplay, timerStatus);
          refreshPresetActiveState();
        };
        presetChipEls.set(s, tb);
      });

      const stopTimerBtn = timerBtns.createEl("button", {
        cls: "dh-chip",
        text: "Сброс",
        attr: { type: "button", style: "font-size: 0.74rem; padding: 2px 8px;" }
      });
      stopTimerBtn.onmousedown = e => e.preventDefault();
      stopTimerBtn.onclick = () => {
        resetSessionRestTimer(session.path, timerDisplay, timerStatus);
      };

      bindSessionTimerDisplay(session.path, timerDisplay, timerStatus);

      const finishRow = timerBox.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--background-modifier-border); padding-top: 8px; gap: 8px;" }
      });
      finishRow.createSpan({
        text: session.durationMin ? "Завершена (" + session.durationMin + " мин)" : "Начало: " + (session.startStr || session.dateISO || "сегодня"),
        attr: { style: "font-size: 0.75rem; color: var(--text-muted);" }
      });

      const finishBtn = finishRow.createEl("button", {
        cls: "dh-btn",
        text: session.durationMin ? "🔄 Обновить время" : "✅ Завершить тренировку",
        attr: { type: "button", style: "font-size: 0.75rem; padding: 3px 10px;" }
      });
      finishBtn.onclick = async () => {
        finishBtn.disabled = true;
        try {
          const startStr = session.startStr;
          let duration = session.durationMin || 60;
          if (startStr && isValidTimeStr(startStr)) {
            const baseDate = session.dateISO || todayISO;
            const startMoment = moment(baseDate + " " + startStr, "YYYY-MM-DD HH:mm", true);
            if (startMoment.isValid()) {
              let diffMin = Math.round(moment().diff(startMoment, "minutes"));
              if (diffMin < 0) diffMin += 1440;
              if (diffMin > 0 && diffMin <= 600) duration = diffMin;
            }
          }
          await app.fileManager.processFrontMatter(session.file, fm => {
            fm.длительность_мин = duration;
            if (!fm.день_программы) fm.день_программы = session.programDay;
          });

          const targetDiaryISO = session.dateISO || todayISO;
          await syncWorkoutHabitToDiary(targetDiaryISO);

          notify("✅ Тренировка завершена! Длительность: " + duration + " мин.");
          await renderEverything();
        } catch (e) {
          notify("❌ Ошибка завершения тренировки: " + (e?.message || e));
          finishBtn.disabled = false;
        }
      };

      const formBox = activeGrid.createDiv({
        attr: { style: "padding: 12px 14px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; justify-content: space-between; gap: 8px;" }
      });

      formBox.createDiv({ text: "✍️ Запись подхода", attr: { style: "font-size: 0.82rem; font-weight: 600; color: var(--text-muted);" } });

      const formRow = formBox.createDiv({
        attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; align-items: end;" }
      });

      const exWrap = formRow.createEl("label", { cls: "dh-field" });
      exWrap.createSpan({ cls: "dh-row-label", text: "Упражнение", attr: { style: "font-size: 0.72rem;" } });
      const exSelect = exWrap.createEl("select", { cls: "dropdown", attr: { style: "width: 100%; font-size: 0.8rem; height: 30px;" } });
      uniqueExercises.forEach(e => {
        const label = e.name + " (" + (e.weight > 0 ? "+" + e.weight + " кг" : "свой вес") + ")";
        const opt = exSelect.createEl("option", { text: label, value: e.name });
        opt.dataset.key = e.key;
        opt.dataset.weight = String(e.weight ?? 0);
        opt.dataset.rest = String(e.rest ?? program.restBetweenSets ?? 120);
      });
      exSelect.selectedIndex = selectedExIdx;

      const wWrap = formRow.createEl("label", { cls: "dh-field" });
      wWrap.createSpan({ cls: "dh-row-label", text: "Доп. вес (кг)", attr: { style: "font-size: 0.72rem;" } });
      const wInput = wWrap.createEl("input", {
        attr: { type: "number", min: "0", max: "500", step: "0.5", style: "width: 100%; font-size: 0.82rem; height: 30px;" }
      });
      wInput.value = sessionState.customWeight !== null && sessionState.customWeight !== undefined
        ? String(sessionState.customWeight)
        : String(currentSelectedEx?.weight ?? 0);

      const selectedCatalogEx = catalog.get(currentSelectedEx?.name);
      const isSecondsEx = selectedCatalogEx?.field === "секунды";

      const rWrap = formRow.createEl("label", { cls: "dh-field" });
      const rLabelSpan = rWrap.createSpan({
        cls: "dh-row-label",
        text: isSecondsEx ? "Секунды" : "Повторения",
        attr: { style: "font-size: 0.72rem;" }
      });
      const rInput = rWrap.createEl("input", {
        attr: {
          type: "number",
          min: "1",
          max: "600",
          step: "1",
          placeholder: isSecondsEx ? "сек." : "повт.",
          style: "width: 100%; font-size: 0.82rem; height: 30px;"
        }
      });
      rInput.value = sessionState.draftReps || "";

      exSelect.onchange = () => {
        const opt = exSelect.options[exSelect.selectedIndex];
        const newWeight = opt.dataset.weight || "0";
        const newRest = Number(opt.dataset.rest) || program.restBetweenSets || 120;
        const exMeta = catalog.get(exSelect.value);
        wInput.value = newWeight;
        rLabelSpan.setText(exMeta?.field === "секунды" ? "Секунды" : "Повторения");
        rInput.placeholder = exMeta?.field === "секунды" ? "сек." : "повт.";

        const curSt = getSessionState(session.path);
        saveSessionState(session.path, {
          selectedExKey: opt.dataset.key,
          customWeight: newWeight,
          ...(curSt.restEndAt > Date.now() ? {} : { restDurationSec: newRest })
        });
        if (!curSt.restEndAt || curSt.restEndAt <= Date.now()) {
          timerStatus.setText("Выбран отдых: " + newRest + " с");
          refreshPresetActiveState();
        }
      };

      wInput.oninput = () => {
        saveSessionState(session.path, { customWeight: wInput.value });
      };

      rInput.oninput = () => {
        saveSessionState(session.path, { draftReps: rInput.value });
      };

      const submitBtn = formBox.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "Записать подход и запустить таймер",
        attr: { type: "button", style: "width: 100%; height: 32px; font-size: 0.82rem; margin-top: 4px;" }
      });

      let isSubmitting = false;
      const handleRecordSet = async () => {
        if (isSubmitting || submitBtn.disabled) return;

        const rawReps = String(rInput.value ?? "").trim();
        const repsVal = number(rawReps);
        if (repsVal === null || !Number.isInteger(repsVal) || repsVal < 1 || repsVal > 600) {
          notify("⚠️ Укажи целое число повторений (от 1 до 600).");
          rInput.focus();
          return;
        }

        const rawWeight = String(wInput.value ?? "").trim();
        const weightVal = rawWeight === "" ? 0 : number(rawWeight);
        if (weightVal === null || weightVal < 0 || weightVal > 500) {
          notify("⚠️ Дополнительный вес должен быть числом от 0 до 500 кг.");
          wInput.focus();
          return;
        }

        const exName = exSelect.value;
        const opt = exSelect.options[exSelect.selectedIndex];
        const exMeta = catalog.get(exName);
        const fieldName = exMeta?.field || "повторы";
        const unitLabel = exMeta?.unit || "повт.";

        isSubmitting = true;
        submitBtn.disabled = true;
        submitBtn.setText("⏳ Сохранение...");

        try {
          const currentContent = await app.vault.read(session.file);
          const prefix = currentContent.length > 0 && !currentContent.endsWith("\n") ? "\n" : "";
          const line = prefix + "- (упражнение:: " + exName + ") (" + fieldName + ":: " + repsVal + ") (доп_вес_кг:: " + weightVal + ") (вариант:: Основной)\n";

          await app.vault.append(session.file, line);
          await syncWorkoutHabitToDiary(session.dateISO || todayISO);

          const stBefore = getSessionState(session.path);
          const restToStart = Number(stBefore?.restDurationSec) || Number(opt?.dataset.rest) || program.restBetweenSets || 120;

          saveSessionState(session.path, {
            selectedExKey: opt?.dataset.key || (exName + "__" + weightVal),
            customWeight: String(weightVal),
            draftReps: ""
          });
          startSessionRestTimer(session.path, restToStart, timerDisplay, timerStatus);

          rInput.value = "";
          notify("✅ Записано: " + exName + " — " + repsVal + " " + unitLabel + " (" + (weightVal > 0 ? "+" + fmt(weightVal) + " кг" : "свой вес") + ")");

          await renderEverything();
        } catch (err) {
          isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.setText("Записать подход и запустить таймер");
          notify("❌ Не удалось сохранить подход: " + (err?.message || err));
        }
      };

      submitBtn.onclick = handleRecordSet;
      rInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleRecordSet();
        }
      };

      if (program.isVolumePullups) {
        const pullupsCount = loggedSets.filter(s => s.name === "Подтягивания").reduce((acc, s) => acc + s.reps, 0);
        const target = program.targetVolume || 100;
        const pct = Math.min(100, Math.round(pullupsCount / target * 100));

        const pBox = termPanel.createDiv({ attr: { style: "margin-top: 12px; padding: 10px 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border);" } });
        pBox.createDiv({ text: "Набрано подтягиваний за сессию: " + pullupsCount + " / " + target + " (" + pct + "%)", attr: { style: "font-size: 0.82rem; font-weight: 600;" } });
        const track = pBox.createDiv({ attr: { style: "height: 7px; background: var(--background-modifier-border); border-radius: 4px; overflow: hidden; margin-top: 6px;" } });
        track.createDiv({ attr: { style: "width: " + pct + "%; height: 100%; background: " + (pct >= 100 ? "var(--color-green)" : "var(--interactive-accent)") + ";" } });
      }

      if (loggedSets.length) {
        const todaySetsBox = termPanel.createDiv({
          attr: { style: "margin-top: 12px; padding: 8px 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" }
        });
        todaySetsBox.createSpan({
          text: "Выполнено в сессии (" + loggedSets.length + "):",
          attr: { style: "font-size: 0.78rem; font-weight: 600; color: var(--text-muted);" }
        });
        loggedSets.forEach((s, idx) => {
          todaySetsBox.createSpan({
            text: (idx + 1) + ". " + s.name + ": " + fmt(s.reps) + (s.weight > 0 ? " (+" + fmt(s.weight) + "кг)" : ""),
            attr: { style: "font-size: 0.75rem; padding: 2px 7px; border-radius: 4px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border);" }
          });
        });
      }
    }

    const all = [];
    const trainingDates = new Map();

    for (const p of dv.pages(SOURCE)) {
      if (p.тип !== "Тренировка") continue;
      const isCurrentLoadedSession = Boolean(session && p.file.path === session.path);
      const d = isCurrentLoadedSession && session.dateISO ? asDate(session.dateISO) : asDate(p.дата);
      const start = isCurrentLoadedSession && session.startStr ? session.startStr : text(p.начало);
      const durationVal = isCurrentLoadedSession ? session.durationMin : number(p.длительность_мин);
      const groups = new Map();

      if (isCurrentLoadedSession) {
        session.loggedSets.forEach(s => {
          const e = catalog.get(s.name);
          if (!e) return;
          const key = JSON.stringify([s.name, s.variant, s.weight]);
          if (!groups.has(key)) groups.set(key, {
            key, name: s.name, variant: s.variant, weight: s.weight, unit: e.unit, values: [],
            path: p.file.path, link: p.file.link, date: d, start,
            title: session.title || text(p.название_тренировки) || p.file.name,
            duration: durationVal
          });
          groups.get(key).values.push(s.reps);
        });
      } else {
        for (const s of Array.from(p.file.lists ?? []).sort((a, b) => a.line - b.line)) {
          if (empty(s.упражнение)) continue;
          if (empty(s.повторы) && empty(s.секунды)) continue;
          const name = text(s.упражнение);
          const e = catalog.get(name);
          if (!e) continue;
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
      if (d) trainingDates.set(d.toISODate(), [...(trainingDates.get(d.toISODate()) ?? []), p.file.link]);

      for (const g of groups.values()) {
        g.best = Math.max(...g.values);
        g.total = r2(sum(g.values));
        g.timeKnown = isValidTimeStr(start);
        g.order = d ? d.toMillis() + (g.timeKnown ? (+start.slice(0, 2) * 60 + +start.slice(3)) * 60000 : 0) : -Infinity;
        all.push(g);
      }
    }

    if (session && session.loggedSets.length && !all.some(g => g.path === session.path)) {
      const groups = new Map();
      const sessDate = asDate(session.dateISO) || today;
      session.loggedSets.forEach(s => {
        const e = catalog.get(s.name);
        if (!e) return;
        const key = JSON.stringify([s.name, s.variant, s.weight]);
        if (!groups.has(key)) groups.set(key, {
          key, name: s.name, variant: s.variant, weight: s.weight, unit: e.unit, values: [],
          path: session.path, date: sessDate, start: session.startStr,
          title: session.title, duration: session.durationMin
        });
        groups.get(key).values.push(s.reps);
      });
      for (const g of groups.values()) {
        g.best = Math.max(...g.values);
        g.total = r2(sum(g.values));
        g.timeKnown = isValidTimeStr(session.startStr);
        g.order = sessDate.toMillis() + (g.timeKnown ? (+session.startStr.slice(0, 2) * 60 + +session.startStr.slice(3)) * 60000 : 86399000);
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

      for (const e of EXERCISES) {
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

    root.style.minHeight = "";
  }

  return renderEverything();
}

if (section === "all" || section === "stats") {
  renderHealthStats();
}
if (section === "all" || section === "workouts") {
  renderWorkoutsHub();
}