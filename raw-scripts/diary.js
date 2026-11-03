const mode = input?.section || "all";

// ========================================================
// ЧАСТЬ 1: ПЛИТКИ СВОДКИ, 3-МЕСЯЧНЫЙ КАЛЕНДАРЬ И ПРИВЫЧКИ
// ========================================================
if (mode === "all" || mode === "main") {
  const SOURCE = '"Ежедневник"';
  const WEEKS = 10;
  const MIN_WEEK_DAYS = 4; // минимум заполненных дней с оценкой в каждом 7-дневном периоде
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

  const stats = root.createDiv({
    cls: "dh-grid",
    attr: {
      style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; position: relative; z-index: 30;"
    }
  });

  let activePinnedCard = null;

  function createMinimalCard({ label, value, tone, accent, rows }) {
    const c = stats.createDiv({
      cls: "dh-card",
      attr: {
        tabindex: "0",
        role: "button",
        "aria-expanded": "false",
        style: `
          position: relative;
          overflow: visible;
          cursor: pointer;
          user-select: none;
          border: 1px solid var(--background-modifier-border);
          border-top: 2px solid ${accent}88;
          transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        `
      }
    });

    c.onmousedown = e => e.preventDefault();
    c.createDiv({ cls: "dh-card-label", text: label });
    c.createDiv({ cls: `dh-card-value${tone ? " dh-" + tone : ""}`, text: value });

    const popover = c.createDiv({
      attr: {
        style: `
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 8px);
          z-index: 90;
          padding: 10px 12px;
          border-radius: 8px;
          background: var(--background-secondary);
          border: 1px solid ${accent}66;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.75rem;
          line-height: 1.3;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          pointer-events: none;
          transition: opacity 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0.18s;
        `
      }
    });

    rows.forEach((r, idx) => {
      const rowEl = popover.createDiv({
        attr: {
          style: `
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            ${idx > 0 ? "padding-top: 5px; border-top: 1px solid var(--background-modifier-border);" : ""}
          `
        }
      });

      rowEl.createSpan({
        text: r.k,
        attr: { style: "color: var(--text-muted);" }
      });

      if (r.minMax) {
        const mmWrap = rowEl.createDiv({ attr: { style: "display: flex; align-items: center; gap: 6px;" } });
        mmWrap.createSpan({
          text: `мин ${r.minMax.min}`,
          attr: {
            style: "font-size: 0.72rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #d85b571a; color: #d85b57;"
          }
        });
        mmWrap.createSpan({
          text: `макс ${r.minMax.max}`,
          attr: {
            style: "font-size: 0.72rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #4aab801a; color: #4aab80;"
          }
        });
      } else {
        rowEl.createSpan({
          text: r.v,
          attr: {
            style: `font-weight: 600; color: ${r.vColor || "var(--text-normal)"}; text-align: right;`
          }
        });
      }
    });

    const setVisualState = (isOpen) => {
      c.style.borderColor = isOpen ? accent : "var(--background-modifier-border)";
      c.style.borderTop = `2px solid ${isOpen ? accent : accent + "88"}`;
      c.style.boxShadow = isOpen ? "0 6px 16px rgba(0, 0, 0, 0.18)" : "none";
      c.style.transform = isOpen ? "translateY(-1px)" : "translateY(0)";

      popover.style.opacity = isOpen ? "1" : "0";
      popover.style.visibility = isOpen ? "visible" : "hidden";
      popover.style.transform = isOpen ? "translateY(0)" : "translateY(-4px)";
      c.setAttribute("aria-expanded", String(isOpen));
    };

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

  root.addEventListener("click", () => {
    if (activePinnedCard) {
      activePinnedCard._closePopover?.();
      activePinnedCard = null;
    }
  });

  // 1. Средняя оценка · 30 дней
  const meanScore30 = average(scores);
  createMinimalCard({
    label: "Средняя оценка · 30 дней",
    value: meanScore30 !== null ? fmt(meanScore30, 0, 1) : "—",
    tone: null,
    accent: "#e5a158",
    rows: scores.length
      ? [
          { k: "Период", v: range30Str },
          { k: "Заполнено", v: `${scores.length} из 30 дн. · шкала 1–10` },
          { k: "Разброс", minMax: { min: fmt(Math.min(...scores)), max: fmt(Math.max(...scores)) } }
        ]
      : [
          { k: "Период", v: range30Str },
          { k: "Данные", v: "Оценок пока нет (шкала 1–10)", vColor: "var(--text-muted)" }
        ]
  });

  // 2. Оценка · неделя к неделе
  const hasEnoughWeekData = week.length >= MIN_WEEK_DAYS && before.length >= MIN_WEEK_DAYS;
  let weekDeltaText = "—";
  let weekDeltaTone = null;

  if (hasEnoughWeekData) {
    const rawDelta = weekMean - beforeMean;
    const roundedDelta = Math.round(rawDelta * 10) / 10;
    if (Object.is(roundedDelta, -0) || Math.abs(roundedDelta) < 0.05) {
      weekDeltaText = "0,0";
      weekDeltaTone = "flat";
    } else if (roundedDelta > 0) {
      weekDeltaText = `+${fmt(roundedDelta, 1, 1)}`;
      weekDeltaTone = "up";
    } else {
      weekDeltaText = `−${fmt(Math.abs(roundedDelta), 1, 1)}`;
      weekDeltaTone = "down";
    }
  }

  createMinimalCard({
    label: "Оценка · неделя к неделе",
    value: weekDeltaText,
    tone: weekDeltaTone,
    accent: "#599ed6",
    rows: hasEnoughWeekData
      ? [
          { k: `Текущие 7 дн. (${curWeekRange})`, v: `${fmt(weekMean, 1, 1)} · ${week.length}/7 дн.` },
          { k: `Пред. 7 дн. (${prevWeekRange})`, v: `${fmt(beforeMean, 1, 1)} · ${before.length}/7 дн.` },
          { k: "Шкала", v: "1–10 · завершённые дни" }
        ]
      : [
          { k: "Статус", v: "Недостаточно данных для сравнения", vColor: "#e5a158" },
          { k: `Текущие 7 дн. (${curWeekRange})`, v: `${week.length}/7 дн. (нужно ≥${MIN_WEEK_DAYS})` },
          { k: `Пред. 7 дн. (${prevWeekRange})`, v: `${before.length}/7 дн. (нужно ≥${MIN_WEEK_DAYS})` }
        ]
  });

  // 3. Средняя энергия · 30 дней
  const meanEnergy30 = average(energies);
  createMinimalCard({
    label: "Средняя энергия · 30 дней",
    value: meanEnergy30 !== null ? fmt(meanEnergy30, 0, 1) : "—",
    tone: null,
    accent: "#69b5aa",
    rows: energies.length
      ? [
          { k: "Период", v: range30Str },
          { k: "Заполнено", v: `${energies.length} из 30 дн. · шкала 1–10` },
          { k: "Разброс", minMax: { min: fmt(Math.min(...energies)), max: fmt(Math.max(...energies)) } }
        ]
      : [
          { k: "Период", v: range30Str },
          { k: "Данные", v: "Записей пока нет (шкала 1–10)", vColor: "var(--text-muted)" }
        ]
  });

  // Календарь
  {
    const cal = section("");
    cal.classList.add("dh-calendar-v2");

    const doc = cal.ownerDocument;
    const win = doc.defaultView;

    const style = cal.createEl("style");
    style.textContent = `
      .dh-calendar-v2 .dhc-panel {
        padding: 16px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 12px;
        background: var(--background-secondary);
      }
      .dh-calendar-v2 .dhc-months {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
        gap: 16px;
        align-items: start;
      }
      .dh-calendar-v2 .dhc-month {
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 9px;
        background: var(--background-primary);
      }
      .dh-calendar-v2 .dhc-title {
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
        font-size: 0.88rem;
        font-weight: 600;
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
        color: var(--text-muted);
        font-size: 0.7rem;
        font-weight: 600;
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
        border: 1px solid transparent;
        border-radius: 5px;
        box-shadow: none;
        background: var(--background-secondary);
        color: var(--text-muted);
        font-family: inherit;
        font-size: 0.76rem;
        font-weight: 500;
        line-height: 1;
        cursor: pointer;
        transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }
      .dh-calendar-v2 button.dhc-day.has-score {
        background: var(--day-background);
        border-color: var(--day-color);
        color: var(--text-normal);
      }
      .dh-calendar-v2 button.dhc-day.has-entry:not(.has-score) {
        border-style: dashed;
        border-color: var(--text-faint);
        background: var(--background-primary);
        color: var(--text-normal);
      }
      .dh-calendar-v2 button.dhc-day:hover:not(:disabled) {
        box-shadow: inset 0 0 0 1px var(--text-muted);
      }
      .dh-calendar-v2 button.dhc-day.is-today {
        outline: 2px solid var(--interactive-accent);
        outline-offset: 1px;
        font-weight: 700;
      }
      .dh-calendar-v2 button.dhc-day:focus-visible {
        outline: 2px solid var(--text-normal);
        outline-offset: 2px;
      }
      .dh-calendar-v2 button.dhc-day.is-future {
        border-color: transparent;
        background: transparent;
        color: var(--text-faint);
        opacity: 0.38;
        cursor: default;
      }
      .dh-calendar-v2 .dhc-training {
        position: absolute;
        top: 2px;
        right: 2px;
        font-size: 0.56rem;
        line-height: 1;
        pointer-events: none;
      }
      .dh-calendar-v2 .dhc-legend {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 14px;
        color: var(--text-muted);
        font-size: 0.73rem;
      }
      .dh-calendar-v2 .dhc-swatch {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex: 0 0 auto;
      }
      .dh-calendar-v2 .dhc-no-score {
        margin-left: 6px;
        border: 1px dashed var(--text-faint);
        background: var(--background-primary);
      }
      .dhc-calendar-popover-v2 {
        position: fixed;
        z-index: 10000;
        box-sizing: border-box;
        width: 310px;
        max-width: calc(100vw - 20px);
        max-height: 70vh;
        overflow: auto;
        padding: 12px 14px;
        border: 1px solid var(--dhc-pop-accent, var(--background-modifier-border));
        border-radius: 9px;
        background: var(--background-primary);
        color: var(--text-normal);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        font-family: var(--font-interface);
        font-size: 0.8rem;
        line-height: 1.45;
        white-space: normal;
        overflow-wrap: anywhere;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(4px);
        transition: opacity 150ms ease, transform 150ms ease, visibility 150ms ease;
      }
      .dhc-calendar-popover-v2.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }
      .dhc-calendar-popover-v2 .dhc-pop-date {
        margin-bottom: 8px;
        color: var(--text-muted);
        font-size: 0.74rem;
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
        color: var(--dhc-pop-accent, var(--text-normal));
        font-weight: 650;
        text-align: right;
      }
      .dhc-calendar-popover-v2 .dhc-pop-event {
        margin-top: 10px;
        padding-top: 9px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .dhc-calendar-popover-v2 .dhc-pop-event-label {
        margin-bottom: 4px;
        color: var(--text-muted);
        font-size: 0.72rem;
      }
      .dhc-calendar-popover-v2 .dhc-pop-event-text {
        white-space: pre-wrap;
      }
      .dhc-calendar-popover-v2 .dhc-pop-empty {
        color: var(--text-muted);
      }
      .dhc-calendar-popover-v2 button.dhc-open-note {
        width: 100%;
        height: auto;
        margin: 11px 0 0;
        padding: 6px 9px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        box-shadow: none;
        background: var(--background-secondary);
        color: var(--text-normal);
        font-size: 0.75rem;
        cursor: pointer;
      }
      .dhc-calendar-popover-v2 button.dhc-open-note:hover {
        background: var(--background-modifier-hover);
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

    const currentMonthStart = today.startOf("month");
    const displayMonths = [
      currentMonthStart.minus({ months: 2 }),
      currentMonthStart.minus({ months: 1 }),
      currentMonthStart
    ];

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
          cell.createSpan({
            cls: "dhc-training",
            text: "🏋️",
            attr: { "aria-hidden": "true" }
          });
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
    legend.createSpan({ text: "· 🏋️ — тренировка" });
  }

  // Привычки
  {
    const HABIT_MIN_WEEK_MARKED = 4;
    const HABIT_MAX_WEEK_GAP = 2;
    const HABIT_MIN_WEEK_NUMERIC = 3;
    const HABIT_MIN_MONTH_MARKED = 8;
    const HABIT_MIN_MONTH_NUMERIC = 5;
    const HABIT_MIN_GROUP_SIZE = 4;


    // Витрина аналитики: расчёты выполняет my-correlation-analytics
    {
      const analytics = root.createDiv({ cls: "dh-diary-analytics" });
      const styles = analytics.createEl("style");
      styles.textContent = [
        ".dashboard-home .dh-diary-analytics { margin: 16px 0; padding: 14px 16px; border: 1px solid var(--background-modifier-border); border-radius: 10px; background: var(--background-secondary); }",
        ".dashboard-home .dh-diary-analytics .dda-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }",
        ".dashboard-home .dh-diary-analytics .dda-title { font-weight: 700; font-size: 0.95rem; color: var(--text-normal); }",
        ".dashboard-home .dh-diary-analytics button.dda-btn { min-height: 32px; padding: 0 12px; border-radius: 7px; font-size: 0.78rem; font-weight: 600; cursor: pointer; background: var(--background-primary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); transition: border-color 0.14s ease; }",
        ".dashboard-home .dh-diary-analytics button.dda-btn:hover { border-color: var(--interactive-accent); color: var(--text-accent); }",
        ".dashboard-home .dh-diary-analytics .dda-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 8px; margin-top: 10px; }",
        ".dashboard-home .dh-diary-analytics .dda-card { padding: 9px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; min-width: 0; font-size: 0.78rem; }",
        ".dashboard-home .dh-diary-analytics .dda-card-title { font-weight: 650; color: var(--text-normal); margin-bottom: 2px; }",
        ".dashboard-home .dh-diary-analytics .dda-meta { color: var(--text-muted); font-size: 0.72rem; line-height: 1.35; }"
      ].join("\n");

      const head = analytics.createDiv({ cls: "dda-head" });
      head.createSpan({ cls: "dda-title", text: "📊 Связи и аналитика привычек" });
      const action = head.createEl("button", { cls: "dda-btn", text: "Открыть аналитику →", attr: { type: "button" } });

      const host = analytics.createDiv({ cls: "dda-list" });
      const note = analytics.createDiv({ cls: "dda-meta", attr: { style: "margin-top: 8px;" } });

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

      try {
        const plugin = getPlugin();
        if (!plugin || typeof plugin.getReport !== "function") {
          host.createDiv({ text: "Включи плагин my-correlation-analytics для просмотра инсайтов." });
        } else {
          const report = plugin.getReport(30);
          const count = Number.isFinite(report.totalRecords) ? report.totalRecords : 0;
          note.textContent = `Выборка: последние 30 дней (${count} записей). Наблюдаемые ассоциации.`;

          const habits = Array.isArray(report.topHabitImpacts) ? report.topHabitImpacts : [];
          const corr = Array.isArray(report.topCorrelations) ? report.topCorrelations : [];
          let shown = 0;

          for (const item of habits) {
            if (shown >= 2) break;
            if (Math.abs(item.delta) < 0.2) continue;
            const c = host.createDiv({ cls: "dda-card" });
            c.createDiv({ cls: "dda-card-title", text: `${item.habitName} → ${item.targetMetric === "score" ? "Оценка" : "Энергия"}` });
            c.createDiv({ cls: "dda-meta", text: `Разница средних: ${item.delta > 0 ? "+" : ""}${item.delta.toFixed(1)} балла (${item.countTrue + item.countFalse} дн.)` });
            shown++;
          }

          for (const item of corr) {
            if (shown >= 3) break;
            if (Math.abs(item.r) < 0.25) continue;
            const c = host.createDiv({ cls: "dda-card" });
            c.createDiv({ cls: "dda-card-title", text: item.label });
            c.createDiv({ cls: "dda-meta", text: `Корреляция r = ${item.r > 0 ? "+" : ""}${item.r.toFixed(2)} (${item.sampleCount} дн.)` });
            shown++;
          }

          if (!shown) {
            host.createDiv({ text: "Данные накапливаются. Полный отчёт доступен по кнопке выше." });
          }
        }
      } catch (err) {
        host.createDiv({ text: "Плагин аналитики подгружается..." });
      }
    }
    const hs = section("", "");
    hs.classList.add("dh-habits-v2");

    const cards = hs.createDiv({ cls: "dh-grid dh-grid-wide" });
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
    const getScreenHours = p => p ? parseValidNum(p.экран_часов, 0, 24, true) : null;
    const getSteps = p => p ? parseValidNum(p.шаги, 0, 100000, true) : null;

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

    const todayRecord = byDate.get(todayISO);
    const doc = hs.ownerDocument;
    const win = doc.defaultView;

    const style = hs.createEl("style");
    style.textContent = `
      .dh-habits-v2 .dh-habit {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .dh-habits-v2 .dhhv-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 10px;
        min-height: 32px;
        margin: 8px 0;
        padding: 6px 8px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        background: var(--background-primary);
        font-size: 0.76rem;
      }
      .dh-habits-v2 .dhhv-footer {
        display: flex;
        justify-content: flex-start;
        margin-top: auto;
        padding-top: 9px;
      }
      .dh-habits-v2 button.dhhv-more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 30px;
        height: auto;
        margin: 0;
        padding: 4px 9px;
        border: 1px solid transparent;
        border-radius: 6px;
        box-shadow: none;
        background: transparent;
        color: var(--text-muted);
        font-family: inherit;
        font-size: 0.73rem;
        line-height: 1.3;
        cursor: pointer;
        transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease;
      }
      .dh-habits-v2 button.dhhv-more:hover,
      .dh-habits-v2 button.dhhv-more[aria-expanded="true"] {
        border-color: var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--habit-color, var(--text-normal));
      }
      .dh-habits-v2 button.dhhv-more:focus-visible {
        outline: 2px solid var(--habit-color, var(--interactive-accent));
        outline-offset: 2px;
      }
      .dh-habits-v2 .dhhv-chevron {
        display: inline-block;
        font-size: 0.65rem;
        transition: transform 160ms ease;
      }
      .dh-habits-v2 button.dhhv-more[aria-expanded="true"] .dhhv-chevron {
        transform: rotate(180deg);
      }
      .dhhv-popover-v2 {
        position: fixed;
        z-index: 10000;
        box-sizing: border-box;
        width: 318px;
        max-width: calc(100vw - 20px);
        max-height: 75vh;
        overflow: auto;
        padding: 12px 14px;
        border: 1px solid var(--dhhv-accent);
        border-radius: 9px;
        background: var(--background-primary);
        color: var(--text-normal);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        font-family: var(--font-interface);
        font-size: 0.76rem;
        line-height: 1.38;
        overflow-wrap: anywhere;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(4px);
        transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
      }
      .dhhv-popover-v2.is-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }
      .dhhv-popover-v2 .dhhv-pop-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .dhhv-popover-v2 .dhhv-pop-title {
        color: var(--dhhv-accent);
        font-size: 0.83rem;
        font-weight: 650;
      }
      .dhhv-popover-v2 .dhhv-pop-period {
        color: var(--text-muted);
        font-size: 0.69rem;
        white-space: nowrap;
      }
      .dhhv-popover-v2 .dhhv-pop-section {
        margin-top: 8px;
        padding-top: 7px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .dhhv-popover-v2 .dhhv-pop-section:first-of-type {
        margin-top: 0;
        padding-top: 0;
        border-top: none;
      }
      .dhhv-popover-v2 .dhhv-pop-sec-title {
        margin-bottom: 4px;
        color: var(--text-muted);
        font-size: 0.68rem;
        font-weight: 650;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .dhhv-popover-v2 .dhhv-pop-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        padding: 3px 0;
      }
      .dhhv-popover-v2 .dhhv-pop-label {
        color: var(--text-muted);
      }
      .dhhv-popover-v2 .dhhv-pop-value {
        font-weight: 650;
        color: var(--text-normal);
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .dhhv-popover-v2 .dhhv-pop-change-box {
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        font-size: 0.74rem;
        line-height: 1.35;
      }
      .dhhv-popover-v2 .dhhv-pop-obs-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .dhhv-popover-v2 .dhhv-pop-obs-item {
        position: relative;
        padding-left: 11px;
        color: var(--text-normal);
        font-size: 0.74rem;
        line-height: 1.35;
      }
      .dhhv-popover-v2 .dhhv-pop-obs-item::before {
        content: "•";
        position: absolute;
        left: 0;
        top: 0;
        color: var(--dhhv-accent);
        font-weight: 700;
      }
      .dhhv-popover-v2 .dhhv-pop-muted {
        color: var(--text-muted);
        font-size: 0.73rem;
      }
      .dhhv-popover-v2 .dhhv-pop-secondary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
        padding-top: 7px;
        border-top: 1px dashed var(--background-modifier-border);
        color: var(--text-muted);
        font-size: 0.7rem;
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
        const explicitMisses = marked.filter(s => s.page[key] === false && s.activeNote);
        const blankTemplateStubs = marked.filter(s => s.page[key] === false && !s.activeNote);
        const rate = marked.length > 0 ? Math.round((done.length / marked.length) * 100) : null;
        return { totalDays: slotList.length, marked, done, explicitMisses, blankTemplateStubs, rate };
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
        let lastExplicitFalseIdx = -1;
        for (let i = slots30.length - 1; i >= 0; i--) {
          const s = slots30[i];
          if (state(s.page, key) === false && s.activeNote) {
            const hasTrueAfter = slots30.slice(i + 1).some(x => state(x.page, key) === true);
            if (hasTrueAfter) {
              lastExplicitFalseIdx = i;
              break;
            }
          }
        }
        if (lastExplicitFalseIdx === -1) return null;
        const missDate = slots30[lastExplicitFalseIdx].date;
        let streakAfter = 0;
        for (let j = lastExplicitFalseIdx + 1; j < slots30.length; j++) {
          if (state(slots30[j].page, key) === true) streakAfter++;
          else if (state(slots30[j].page, key) === false && slots30[j].activeNote) break;
        }
        return streakAfter > 0 ? { missDate, streakAfter } : null;
      };

      const getWeekdayWeekendDiff = () => {
        const wdMarked = s30.marked.filter(s => s.date.weekday <= 5);
        const weMarked = s30.marked.filter(s => s.date.weekday >= 6);
        if (wdMarked.length < HABIT_MIN_GROUP_SIZE * 2 || weMarked.length < HABIT_MIN_GROUP_SIZE) return null;
        const wdDone = wdMarked.filter(s => s.page[key] === true).length;
        const weDone = weMarked.filter(s => s.page[key] === true).length;
        const wdRate = Math.round((wdDone / wdMarked.length) * 100);
        const weRate = Math.round((weDone / weMarked.length) * 100);
        if (Math.abs(wdRate - weRate) < 20) return null;
        return { wdDone, wdTotal: wdMarked.length, wdRate, weDone, weTotal: weMarked.length, weRate };
      };

      const formatFlagWeekComparison = (labelPrefix = "Выполнение") => {
        if (wCur.marked.length < HABIT_MIN_WEEK_MARKED || wPrev.marked.length < HABIT_MIN_WEEK_MARKED) {
          return `Мало отмеченных дней для сравнения недель (${wCur.marked.length}/7 и ${wPrev.marked.length}/7, нужно ≥${HABIT_MIN_WEEK_MARKED}).`;
        }
        const curStr = `${wCur.done.length} из ${wCur.marked.length}`;
        const prevStr = `${wPrev.done.length} из ${wPrev.marked.length}`;
        const comparable = Math.abs(wCur.marked.length - wPrev.marked.length) <= HABIT_MAX_WEEK_GAP;
        if (comparable && wCur.rate !== null && wPrev.rate !== null) {
          const diffPP = wCur.rate - wPrev.rate;
          const ppText = diffPP === 0 ? "без изменений (0 п.п.)" : `${diffPP > 0 ? "+" : "−"}${Math.abs(diffPP)} п.п.`;
          return `${labelPrefix}: ${curStr} дн. (${curWeekRange}) против ${prevStr} дн. (${prevWeekRange}) · ${ppText}.`;
        }
        return `${labelPrefix}: ${curStr} отм. дн. (${curWeekRange}) против ${prevStr} отм. дн. (${prevWeekRange}).`;
      };

      const keyMetrics = [];
      let whatChanged = "";
      const observations = [];

      if (key === "nofap") {
        keyMetrics.push({
          k: "За 30 завершённых дн.",
          v: s30.marked.length ? `${s30.done.length} из ${s30.marked.length} дн. (${s30.rate}%)` : "Нет данных"
        });
        keyMetrics.push({
          k: "Лучшая серия (30 дн.)",
          v: maxRun30 ? `${maxRun30.len} дн. подряд` : "0 дн."
        });
        keyMetrics.push({
          k: "Средняя серия (30 дн.)",
          v: avgRun30 !== null ? `${fmt(avgRun30, 0, 1)} дн. (серий: ${runs30.length})` : "—"
        });

        whatChanged = formatFlagWeekComparison("Чистые дни");

        if (s30.marked.length >= HABIT_MIN_MONTH_MARKED) {
          const recovery = findLastRecovery();
          if (recovery) {
            observations.push(
              `После дня без отметки выполнения (${recovery.missDate.toFormat("dd.MM")}) серия возобновлена: ${recovery.streakAfter} дн. подряд.`
            );
          }
          if (runs30.length >= 2) {
            const lastR = runs30[runs30.length - 1];
            const prevR = runs30[runs30.length - 2];
            if (lastR.len !== prevR.len) {
              observations.push(
                `Последняя серия в 30-дневном окне (${lastR.len} дн.) ${lastR.len > prevR.len ? "длиннее" : "короче"} предыдущей (${prevR.len} дн.).`
              );
            }
          }
          if (observations.length < 2 && maxRun30 && maxRun30.len >= 3) {
            observations.push(
              `Самая длинная серия за 30 дней — ${maxRun30.len} дн. (${maxRun30.start.toFormat("dd.MM")}–${maxRun30.end.toFormat("dd.MM")}).`
            );
          }
        }
      } else if (key === "тренировка") {
        const weekCounts = weeks4.map(w => w.stats.done.length);
        const pacePerWeek = (s30.done.length / 30) * 7;

        keyMetrics.push({
          k: `Последние 7 дн. (${curWeekRange})`,
          v: `${wCur.done.length} трен.`
        });
        keyMetrics.push({
          k: "За 30 завершённых дн.",
          v: `${s30.done.length} трен. (~${fmt(pacePerWeek, 1, 1)}/нед.)`
        });
        keyMetrics.push({
          k: "По 4 неделям (ст. → нов.)",
          v: weekCounts.map(n => `${n}`).join(" → ") + " дн."
        });

        if (wCur.marked.length >= HABIT_MIN_WEEK_MARKED && wPrev.marked.length >= HABIT_MIN_WEEK_MARKED) {
          const diffT = wCur.done.length - wPrev.done.length;
          const diffStr = diffT === 0 ? "столько же, сколько" : `${diffT > 0 ? "на +" + diffT : "на −" + Math.abs(diffT)} дн. к`;
          whatChanged = `${wCur.done.length} трен. за ${curWeekRange} (${diffStr} неделе ${prevWeekRange}: ${wPrev.done.length} трен.).`;
        } else {
          whatChanged = `За ${curWeekRange} отмечено ${wCur.done.length} трен. (заполнено ${wCur.marked.length}/7 дн. дневника).`;
        }

        if (s30.marked.length >= HABIT_MIN_MONTH_MARKED && s30.done.length > 0) {
          const activeWeeks = weekCounts.filter(c => c >= 3).length;
          const minW = Math.min(...weekCounts);
          const maxW = Math.max(...weekCounts);
          observations.push(
            `В ${activeWeeks} из 4 последних недель было не менее 3 тренировок (разброс от ${minW} до ${maxW} в неделю).`
          );

          const bestWeekObj = weeks4.reduce((b, w) => (w.stats.done.length > b.stats.done.length ? w : b), weeks4[0]);
          if (bestWeekObj.stats.done.length >= 2) {
            observations.push(
              `Наибольшее число тренировок за месяц — ${bestWeekObj.stats.done.length} дн. на неделе ${bestWeekObj.label}.`
            );
          }
        }
      } else if (key === "чтение") {
        const extractPages = (slotList) => slotList
          .map(s => ({ ...s, pages: getPagesRead(s.page) }))
          .filter(s => s.pages !== null && s.pages > 0);

        const pages30 = extractPages(slots30);
        const sumPages30 = pages30.reduce((acc, x) => acc + x.pages, 0);
        const avgPages30 = pages30.length ? sumPages30 / pages30.length : null;

        const pagesCur7 = extractPages(slotsCur7);
        const pagesPrev7 = extractPages(slotsPrev7);
        const sumCur7 = pagesCur7.reduce((a, x) => a + x.pages, 0);
        const sumPrev7 = pagesPrev7.reduce((a, x) => a + x.pages, 0);

        keyMetrics.push({
          k: "Дни чтения (флажок)",
          v: s30.marked.length ? `${s30.done.length} из ${s30.marked.length} отм. дн.` : "Нет данных"
        });
        keyMetrics.push({
          k: "Прочитано за 30 дн.",
          v: pages30.length ? `${fmt(sumPages30, 0, 0)} стр. (за ${pages30.length} дн.)` : "Страницы не записаны"
        });
        keyMetrics.push({
          k: "Среднее в день чтения",
          v: avgPages30 !== null ? `${fmt(avgPages30, 0, 1)} стр./день` : "—"
        });

        if (pagesCur7.length >= 1 || pagesPrev7.length >= 1) {
          const diffPages = sumCur7 - sumPrev7;
          whatChanged = `За ${curWeekRange}: ${fmt(sumCur7, 0, 0)} стр. (${pagesCur7.length} дн. с записью стр., флажок ${wCur.done.length}/${wCur.marked.length}) против ${fmt(sumPrev7, 0, 0)} стр. (${pagesPrev7.length} дн.) на прошлой неделе (${formatSigned(diffPages, 0, 0, "стр.")}).`;
        } else {
          whatChanged = formatFlagWeekComparison("Дни чтения");
        }

        if (pages30.length >= HABIT_MIN_MONTH_NUMERIC) {
          const first15 = extractPages(slots30.slice(0, 15));
          const last15 = extractPages(slots30.slice(15, 30));
          if (first15.length >= 2 && last15.length >= 2) {
            const sum1 = first15.reduce((a, x) => a + x.pages, 0);
            const sum2 = last15.reduce((a, x) => a + x.pages, 0);
            observations.push(
              `За последние 15 дн. прочитано ${fmt(sum2, 0, 0)} стр. (${last15.length} дн.) против ${fmt(sum1, 0, 0)} стр. (${first15.length} дн.) в предыдущие 15 дн.`
            );
          }
        }

        const flagWithoutPages = slots30.filter(s => state(s.page, key) === true && !(getPagesRead(s.page) > 0)).length;
        const pagesWithoutFlag = slots30.filter(s => state(s.page, key) !== true && (getPagesRead(s.page) > 0)).length;
        if (observations.length < 2 && (flagWithoutPages >= 2 || pagesWithoutFlag >= 2)) {
          if (flagWithoutPages >= 2) {
            observations.push(`В ${flagWithoutPages} дн. за месяц отмечен флажок чтения без указания числа страниц.`);
          } else {
            observations.push(`В ${pagesWithoutFlag} дн. за месяц записаны прочитанные страницы при неотмеченном флажке.`);
          }
        }

        const wdDiff = getWeekdayWeekendDiff();
        if (observations.length < 2 && wdDiff) {
          observations.push(
            `В будни чтение отмечено в ${wdDiff.wdDone} из ${wdDiff.wdTotal} дн. (${wdDiff.wdRate}%), в выходные — в ${wdDiff.weDone} из ${wdDiff.weTotal} дн. (${wdDiff.weRate}%).`
          );
        }
      } else if (key === "режим_сна") {
        const extractSleep = (slotList) => slotList
          .map(s => ({ ...s, hours: getSleepHours(s.page), flag: state(s.page, key) }))
          .filter(s => s.hours !== null);

        const sleep30 = extractSleep(slots30);
        const hoursList30 = sleep30.map(s => s.hours);
        const avgSleep30 = average(hoursList30);

        const sleepCur7 = extractSleep(slotsCur7).map(s => s.hours);
        const sleepPrev7 = extractSleep(slotsPrev7).map(s => s.hours);
        const avgCur7 = average(sleepCur7);
        const avgPrev7 = average(sleepPrev7);

        keyMetrics.push({
          k: "Соблюдение режима",
          v: s30.marked.length ? `${s30.done.length} из ${s30.marked.length} дн. (${s30.rate}%)` : "Нет данных"
        });
        keyMetrics.push({
          k: "Средняя длительность",
          v: avgSleep30 !== null ? `${fmt(avgSleep30, 1, 1)} ч (${sleep30.length} дн.)` : "Нет записей часов"
        });
        keyMetrics.push({
          k: "Разброс (30 дн.)",
          v: hoursList30.length >= HABIT_MIN_MONTH_NUMERIC
            ? `${fmt(Math.min(...hoursList30), 0, 1)}–${fmt(Math.max(...hoursList30), 0, 1)} ч`
            : `Мало данных (<${HABIT_MIN_MONTH_NUMERIC} дн.)`
        });

        if (sleepCur7.length >= HABIT_MIN_WEEK_NUMERIC && sleepPrev7.length >= HABIT_MIN_WEEK_NUMERIC) {
          const diffH = avgCur7 - avgPrev7;
          whatChanged = `Режим: ${wCur.done.length}/${wCur.marked.length} дн. против ${wPrev.done.length}/${wPrev.marked.length} · длительность: ср. ${fmt(avgCur7, 1, 1)} ч (${sleepCur7.length} дн.) против ${fmt(avgPrev7, 1, 1)} ч (${sleepPrev7.length} дн., ${formatSigned(diffH, 1, 1, "ч")}).`;
        } else {
          whatChanged = formatFlagWeekComparison("Режим сна");
        }

        const sleepWhenTrue = sleep30.filter(s => s.flag === true).map(s => s.hours);
        const sleepWhenFalse = sleep30.filter(s => s.flag === false && s.activeNote).map(s => s.hours);
        if (sleepWhenTrue.length >= HABIT_MIN_GROUP_SIZE && sleepWhenFalse.length >= HABIT_MIN_GROUP_SIZE) {
          const mTrue = average(sleepWhenTrue);
          const mFalse = average(sleepWhenFalse);
          observations.push(
            `В дни с отмеченным режимом средняя длительность сна — ${fmt(mTrue, 1, 1)} ч (n=${sleepWhenTrue.length}), без отметки — ${fmt(mFalse, 1, 1)} ч (n=${sleepWhenFalse.length}).`
          );
        }

        const sleepWd = sleep30.filter(s => s.date.weekday <= 5).map(s => s.hours);
        const sleepWe = sleep30.filter(s => s.date.weekday >= 6).map(s => s.hours);
        if (observations.length < 2 && sleepWd.length >= HABIT_MIN_GROUP_SIZE * 2 && sleepWe.length >= HABIT_MIN_GROUP_SIZE) {
          const mWd = average(sleepWd);
          const mWe = average(sleepWe);
          if (Math.abs(mWd - mWe) >= 0.4) {
            observations.push(
              `Средний сон в будни — ${fmt(mWd, 1, 1)} ч (n=${sleepWd.length}), в выходные — ${fmt(mWe, 1, 1)} ч (n=${sleepWe.length}).`
            );
          }
        }

        const wdDiff = getWeekdayWeekendDiff();
        if (observations.length < 2 && wdDiff) {
          observations.push(
            `Режим сна в будни отмечен в ${wdDiff.wdDone} из ${wdDiff.wdTotal} дн. (${wdDiff.wdRate}%), в выходные — в ${wdDiff.weDone} из ${wdDiff.weTotal} дн. (${wdDiff.weRate}%).`
          );
        }
      } else if (key === "диета") {
        const extractCal = (slotList) => slotList
          .map(s => ({ ...s, cal: getCalories(s.page) }))
          .filter(s => s.cal !== null);

        const cal30 = extractCal(slots30).map(s => s.cal);
        const avgCal30 = average(cal30);

        const calCur7 = extractCal(slotsCur7).map(s => s.cal);
        const calPrev7 = extractCal(slotsPrev7).map(s => s.cal);
        const avgCalCur7 = average(calCur7);
        const avgCalPrev7 = average(calPrev7);

        const weekDietStr = weeks4
          .map(w => w.stats.marked.length ? `${w.stats.done.length}/${w.stats.marked.length}` : "—")
          .join(" → ");

        keyMetrics.push({
          k: "Выполнение (30 дн.)",
          v: s30.marked.length ? `${s30.done.length} из ${s30.marked.length} дн. (${s30.rate}%)` : "Нет данных"
        });
        keyMetrics.push({
          k: "По 4 неделям (ст. → нов.)",
          v: weekDietStr
        });
        keyMetrics.push({
          k: "Калории (справочно, 30 дн.)",
          v: avgCal30 !== null ? `ср. ${fmt(Math.round(avgCal30), 0, 0)} ккал (${cal30.length} дн.)` : "Не записаны"
        });

        const baseDietChange = formatFlagWeekComparison("Диета");
        if (calCur7.length >= HABIT_MIN_WEEK_NUMERIC && calPrev7.length >= HABIT_MIN_WEEK_NUMERIC) {
          const diffCal = Math.round(avgCalCur7 - avgCalPrev7);
          whatChanged = `${baseDietChange.replace(/\.$/, "")} · калории: ср. ${fmt(Math.round(avgCalCur7), 0, 0)} против ${fmt(Math.round(avgCalPrev7), 0, 0)} ккал (${formatSigned(diffCal, 0, 0, "ккал")}).`;
        } else {
          whatChanged = baseDietChange;
        }

        if (s30.marked.length >= HABIT_MIN_MONTH_MARKED) {
          const steadyWeeks = weeks4.filter(w => w.stats.done.length >= 5).length;
          const bestDietWeek = weeks4.reduce((b, w) => (w.stats.done.length > b.stats.done.length ? w : b), weeks4[0]);
          if (bestDietWeek.stats.marked.length > 0) {
            observations.push(
              `Недель с выполнением ≥5 дней: ${steadyWeeks} из 4 (лучшая — ${bestDietWeek.label}: ${bestDietWeek.stats.done.length} из ${bestDietWeek.stats.marked.length} дн.).`
            );
          }

          const wdDiff = getWeekdayWeekendDiff();
          if (wdDiff) {
            observations.push(
              `В будни диета отмечена в ${wdDiff.wdDone} из ${wdDiff.wdTotal} дн. (${wdDiff.wdRate}%), в выходные — в ${wdDiff.weDone} из ${wdDiff.weTotal} дн. (${wdDiff.weRate}%).`
            );
          } else {
            const recovery = findLastRecovery();
            if (recovery) {
              observations.push(
                `После перерыва (${recovery.missDate.toFormat("dd.MM")}) соблюдение диеты возобновлено: ${recovery.streakAfter} дн. подряд.`
              );
            }
          }
        }
      }

      return {
        name: h.name,
        color: h.color,
        periodLabel: `30 завершённых дн. (${completed30RangeStr})`,
        keyMetrics: keyMetrics.slice(0, 3),
        whatChanged,
        observations: observations.slice(0, 2),
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
      popover.setAttribute("aria-label", `${data.name}: подробная статистика`);

      const headRow = popover.createDiv({ cls: "dhhv-pop-head" });
      headRow.createSpan({ cls: "dhhv-pop-title", text: data.name });
      headRow.createSpan({ cls: "dhhv-pop-period", text: data.periodLabel });

      const secA = popover.createDiv({ cls: "dhhv-pop-section" });
      secA.createDiv({ cls: "dhhv-pop-sec-title", text: "Ключевые показатели" });
      data.keyMetrics.forEach(item => {
        const r = secA.createDiv({ cls: "dhhv-pop-row" });
        r.createSpan({ cls: "dhhv-pop-label", text: item.k });
        r.createSpan({ cls: "dhhv-pop-value", text: item.v });
      });

      const secB = popover.createDiv({ cls: "dhhv-pop-section" });
      secB.createDiv({ cls: "dhhv-pop-sec-title", text: "Что изменилось · 7 дн. к пред. 7 дн." });
      secB.createDiv({ cls: "dhhv-pop-change-box", text: data.whatChanged });

      const secC = popover.createDiv({ cls: "dhhv-pop-section" });
      secC.createDiv({ cls: "dhhv-pop-sec-title", text: "Наблюдения · 30 дней" });
      if (data.observations.length > 0) {
        const ul = secC.createEl("ul", { cls: "dhhv-pop-obs-list" });
        data.observations.forEach(obs => {
          ul.createEl("li", { cls: "dhhv-pop-obs-item", text: obs });
        });
      } else {
        secC.createDiv({ cls: "dhhv-pop-muted", text: "Пока мало данных для наблюдений" });
      }

      const secFooter = popover.createDiv({ cls: "dhhv-pop-secondary" });
      secFooter.createSpan({ text: `За всё время: ${data.totalAllTime} дн.` });
      secFooter.createSpan({ text: `Рекорд серии: ${data.bestAllTime} дн.` });
      if (data.blankStubsCount > 0) {
        secFooter.createDiv({
          text: `В 30-дневном окне есть ${data.blankStubsCount} дн. с созданной, но не заполненной заметкой (флажки false по шаблону).`,
          attr: { style: "width: 100%; font-size: 0.67rem; color: var(--text-faint); margin-top: 2px;" }
        });
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

      c.createDiv({ cls: "dh-card-value", text: `${current} дн.` });
      c.createDiv({
        cls: "dh-card-hint",
        text: current && !doneToday ? "подряд до вчера" : "подряд"
      });

      const detailBox = c.createDiv({ cls: "dhhv-info" });

      if (h.key === "чтение") {
        const pages = todayRecord && typeof todayRecord.страниц_прочитано === "number"
          ? todayRecord.страниц_прочитано
          : null;

        if (pages !== null && pages > 0) {
          detailBox.innerHTML = `
            <span>📖 Сегодня: <strong>${pages} стр.</strong></span>
            <span style="color:var(--color-green);">✓ цель закрыта</span>
          `;
        } else {
          detailBox.innerHTML = `
            <span style="color:var(--text-muted);">📖 Сегодня страниц: 0</span>
          `;
        }
      } else if (h.key === "режим_сна") {
        const sleepH = todayRecord && typeof todayRecord.сон_часов === "number"
          ? todayRecord.сон_часов
          : null;

        if (sleepH !== null && sleepH > 0) {
          let quality = "Оптимально (7–8 ч)";
          let qColor = "var(--color-green)";
          let qIcon = "🌙";

          if (sleepH < 6) {
            quality = "Недосып";
            qColor = "var(--color-red, #d85b57)";
            qIcon = "⚠️";
          } else if (sleepH < 7) {
            quality = "Ниже нормы";
            qColor = "var(--color-orange, #e5a158)";
            qIcon = "😴";
          } else if (sleepH > 9) {
            quality = "Пересып";
            qColor = "var(--color-orange, #e5a158)";
            qIcon = "🛌";
          } else if (sleepH >= 8.5) {
            quality = "Хороший отдых";
            qColor = "var(--color-green)";
            qIcon = "🌙";
          }

          detailBox.innerHTML = `
            <span>${qIcon} <strong>${sleepH} ч</strong></span>
            <span style="color:${qColor}; font-weight:600;">${quality}</span>
          `;
        } else {
          detailBox.innerHTML = `
            <span style="color:var(--text-muted);">🌙 Сон не записан</span>
          `;
        }
      } else if (h.key === "диета") {
        const cal = todayRecord && typeof todayRecord.калории_ккал === "number"
          ? todayRecord.калории_ккал
          : null;
        const w = todayRecord && typeof todayRecord.вес_кг === "number"
          ? todayRecord.вес_кг
          : null;

        const calText = cal !== null ? `${cal} ккал` : "— ккал";
        const wText = w !== null ? `${fmt(w)} кг` : "— кг";

        detailBox.innerHTML = `
          <span>🥗 <strong>${calText}</strong></span>
          <span style="color:var(--text-muted); font-size:0.72rem;">Вес: ${wText}</span>
        `;
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
          detailBox.innerHTML = `
            <span style="color:var(--color-green); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🏋️ ${sessionName}</span>
            <span style="color:var(--text-muted); font-size:0.72rem; font-variant-numeric:tabular-nums;" title="${topExercises}">${totalReps > 0 ? totalReps + " повт." : setsCount + " подх."} ${subInfo}</span>
          `;
        } else if (isPastSession && trainingPage) {
          const pastDateStr = asDate(trainingPage.дата)?.toFormat("dd.MM") || "";
          detailBox.innerHTML = `
            <span style="color:var(--text-muted);">Отдых (посл: ${pastDateStr})</span>
            <span style="color:var(--text-faint); font-size:0.72rem;">${totalReps > 0 ? totalReps + " повт." : "—"}</span>
          `;
        } else {
          detailBox.innerHTML = `
            <span style="color:var(--text-muted);">🏋️ Тренировки не было</span>
            <span style="color:var(--text-faint); font-size:0.72rem;">0 повт.</span>
          `;
        }
      } else if (h.key === "nofap") {
        detailBox.innerHTML = `
          <span style="color:var(--text-muted);">🛡️ Чистый день: ${doneToday ? "Да ✓" : "В процессе"}</span>
        `;
      } else if (h.key === "без_соцсетей") {
        const doneNS = todayRecord && todayRecord.без_соцсетей === true;
        const screenH = todayRecord && typeof todayRecord.экран_часов === "number" ? todayRecord.экран_часов : null;
        const stepsVal = todayRecord && typeof todayRecord.шаги === "number" ? todayRecord.шаги : null;
        const subParts = [];
        if (screenH !== null) subParts.push(`${screenH} ч экран`);
        if (stepsVal !== null) subParts.push(`${stepsVal.toLocaleString("ru-RU")} шаг.`);
        const subText = subParts.length ? subParts.join(" · ") : "экран не записан";
        detailBox.innerHTML = doneNS
          ? `<span style="color:var(--color-green); font-weight:600;">🛡️ Без скроллинга</span><span style="color:var(--text-muted); font-size:0.72rem;">${subText}</span>`
          : `<span style="color:var(--text-muted);">📱 Обычный день</span><span style="color:var(--text-faint); font-size:0.72rem;">${subText}</span>`;
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
  }
}

// ========================================================
// ЧАСТЬ 2: МЫСЛИ, ИДЕИ И ЗНАНИЯ
// ========================================================
if (mode === "all" || mode === "thoughts") {
  const { Notice, normalizePath } = obsidian;

  const MARKER_PROP = "запись_мысли";
  const DEFAULT_FOLDER = "Знания/Мысли";
  const RECENT_LIMIT = 10;
  const MIN_DATE = dv.date("2020-01-01");
  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
  const CURRENT = dv.current().file.path;
  const STORAGE_KEY = "diary-thoughts-v2:" + app.vault.getName();

  let savedState = {};
  try { savedState = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}"); } catch {}
  const state = {
    category: typeof savedState.category === "string" ? savedState.category : "",
    query: typeof savedState.query === "string" ? savedState.query : "",
    sortBy: typeof savedState.sortBy === "string" ? savedState.sortBy : "date-desc",
    showAll: Boolean(savedState.showAll),
    formOpen: Boolean(savedState.formOpen),
    editingPath: null
  };
  const persist = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        category: state.category,
        query: state.query,
        sortBy: state.sortBy,
        showAll: state.showAll,
        formOpen: state.formOpen
      }));
    } catch {}
  };

  const cleanStr = v => typeof v === "string" ? v.trim() : "";
  const validNum = v => {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
    const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const parseDate = v => {
    if (v == null || v === "") return null;
    try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
  };
  const cleanList = v => {
    const raw = v == null ? [] : Array.isArray(v) ? v : [v];
    return [...new Set(raw.flat().map(x => cleanStr(String(x))).filter(Boolean))];
  };

  function loadThoughts() {
    const items = [];
    for (const p of dv.pages()) {
      if (p.file.path === CURRENT) continue;
      const fileObj = app.vault.getAbstractFileByPath(p.file.path);
      const fm = (fileObj ? app.metadataCache.getFileCache(fileObj)?.frontmatter : null) || p;
      if (fm[MARKER_PROP] !== true && p[MARKER_PROP] !== true) continue;

      const d = parseDate(fm.дата ?? p.дата) || parseDate(p.file.cday);
      if (!d || d < MIN_DATE || d > today) continue;

      const category = cleanStr(fm.категория ?? p.категория) || "Мысль";
      const essence = cleanStr(fm.суть ?? p.суть);
      const status = cleanStr(fm.статус ?? p.статус);
      const source = cleanStr(fm.источник ?? p.источник);
      const pinned = (fm.закреплено ?? p.закреплено) === true;
      const importance = validNum(fm.важность ?? p.важность);
      const tags = cleanList(fm.теги ?? p.теги);

      items.push({
        page: p,
        path: p.file.path,
        title: p.file.name,
        date: d,
        iso: d.toISODate(),
        category,
        essence,
        status,
        source,
        pinned,
        importance,
        tags,
        mtime: p.file.mtime?.toMillis?.() ?? 0
      });
    }
    return items;
  }

  async function ensureFolderExists(folderPath) {
    let acc = "";
    for (const part of normalizePath(folderPath).split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(acc)) {
        await app.vault.createFolder(acc);
      }
    }
  }

  function buildCleanFilePath(folderPath, isoDate, categoryName, currentFilePath = null) {
    const safeCat = (cleanStr(categoryName) || "Мысль").replace(/[\\/:*?"<>|\n\r]/g, "").trim() || "Мысль";
    const baseName = `${isoDate} — ${safeCat}`;
    let candidate = normalizePath(`${folderPath}/${baseName}.md`);
    let counter = 2;
    while (app.vault.getAbstractFileByPath(candidate) && candidate !== currentFilePath) {
      candidate = normalizePath(`${folderPath}/${baseName} ${counter++}.md`);
    }
    return candidate;
  }

  function formatThoughtMarkdown({ iso, category, essence, tags, source, status, importance, pinned }) {
    return [
      "---",
      `${MARKER_PROP}: true`,
      `дата: "${iso}"`,
      `категория: ${JSON.stringify(category)}`,
      `суть: ${JSON.stringify(essence)}`,
      tags.length ? "теги:\n" + tags.map(t => `  - ${JSON.stringify(t)}`).join("\n") : "теги: []",
      `источник: ${source ? JSON.stringify(source) : '""'}`,
      `статус: ${status ? JSON.stringify(status) : '""'}`,
      `важность: ${importance !== null ? importance : ""}`,
      `закреплено: ${pinned ? "true" : "false"}`,
      "---",
      "",
      essence,
      ""
    ].join("\n");
  }

  let busy = false;
  async function togglePin(item, btn) {
    if (busy) return;
    const file = app.vault.getAbstractFileByPath(item.path);
    if (!file) return;
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const next = !item.pinned;
      await app.fileManager.processFrontMatter(file, fm => {
        fm.закреплено = next;
      });
      setTimeout(render, 80);
    } catch (e) {
      new Notice("Ошибка: " + (e?.message || e));
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  const root = dv.container.createDiv({ cls: "dh-thoughts" });

  const THOUGHTS_CSS = `
  .dh-thoughts {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
  }
  .dh-thoughts .dht-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dh-thoughts .dht-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }
  .dh-thoughts button.dht-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
  }
  .dh-thoughts button.dht-pill.is-active {
    color: var(--text-normal);
    border-color: #e5a158;
    background: color-mix(in srgb, #e5a158 16%, var(--background-primary));
  }
  .dh-thoughts .dht-pill-count {
    font-size: 0.68rem;
    opacity: 0.75;
  }
  .dh-thoughts .dht-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dh-thoughts input.dht-search {
    height: 28px;
    width: 165px;
    font-size: 0.77rem;
    padding: 0 9px;
    border-radius: 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
  }
  .dh-thoughts select.dht-sort {
    height: 28px;
    font-size: 0.76rem;
    padding: 0 22px 0 8px;
    border-radius: 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    cursor: pointer;
  }
  .dh-thoughts button.dht-btn-primary {
    height: 28px;
    padding: 0 11px;
    border-radius: 6px;
    font-size: 0.77rem;
    font-weight: 600;
    cursor: pointer;
  }
  .dh-thoughts .dht-form,
  .dh-thoughts .dht-edit-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-top: 2px solid #e5a158;
  }
  .dh-thoughts .dht-form-grid {
    display: grid;
    grid-template-columns: 1.3fr 0.7fr 1fr 1.2fr 1.2fr;
    gap: 6px;
  }
  .dh-thoughts .dht-input,
  .dh-thoughts .dht-textarea {
    width: 100%;
    box-sizing: border-box;
    font-size: 0.8rem;
    padding: 5px 8px;
    border-radius: 6px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
  }
  .dh-thoughts .dht-input {
    height: 30px;
  }
  .dh-thoughts .dht-textarea {
    resize: vertical;
    min-height: 54px;
    line-height: 1.4;
  }
  .dh-thoughts .dht-cat-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .dh-thoughts button.dht-mini-chip {
    height: 20px;
    padding: 0 7px;
    font-size: 0.69rem;
    border-radius: 999px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
  }
  .dh-thoughts .dht-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dh-thoughts .dht-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 8px 11px;
    border-radius: 7px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    transition: border-color 0.14s ease;
  }
  .dh-thoughts .dht-row.is-pinned {
    border-left: 3px solid #e5a158;
  }
  .dh-thoughts .dht-row-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }
  .dh-thoughts .dht-badge-cat {
    font-size: 0.69rem;
    font-weight: 650;
    padding: 1px 7px;
    border-radius: 5px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .dh-thoughts .dht-row-text {
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--text-normal);
    word-break: break-word;
  }
  .dh-thoughts .dht-row-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .dh-thoughts .dht-imp {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    color: #e5a158;
    background: color-mix(in srgb, #e5a158 15%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .dh-thoughts .dht-status,
  .dh-thoughts .dht-tag,
  .dh-thoughts .dht-source {
    font-size: 0.69rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--background-secondary);
    color: var(--text-muted);
  }
  .dh-thoughts .dht-date {
    font-size: 0.71rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .dh-thoughts button.dht-icon-btn {
    height: 22px;
    min-width: 22px;
    padding: 0 5px;
    border-radius: 5px;
    font-size: 0.73rem;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
  }
  .dh-thoughts button.dht-icon-btn:hover {
    color: var(--text-normal);
    background: var(--background-secondary);
    border-color: var(--background-modifier-border);
  }
  .dh-thoughts button.dht-icon-btn.is-pinned {
    color: #e5a158;
  }
  .dh-thoughts .dht-empty {
    padding: 12px;
    text-align: center;
    font-size: 0.8rem;
    color: var(--text-muted);
    background: var(--background-primary);
    border-radius: 7px;
    border: 1px dashed var(--background-modifier-border);
  }
  @media (max-width: 680px) {
    .dh-thoughts .dht-form-grid {
      grid-template-columns: 1fr 1fr;
    }
    .dh-thoughts .dht-row {
      flex-direction: column;
      gap: 6px;
    }
    .dh-thoughts .dht-row-meta {
      width: 100%;
      justify-content: flex-end;
    }
  }
  `;

  function render() {
    root.replaceChildren();
    const styleEl = root.createEl("style");
    styleEl.textContent = THOUGHTS_CSS;

    const allItems = loadThoughts();

    const catCounts = new Map();
    for (const it of allItems) {
      catCounts.set(it.category, (catCounts.get(it.category) || 0) + 1);
    }
    const categories = [...catCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
    if (state.category && !catCounts.has(state.category)) {
      state.category = "";
      persist();
    }

    const topBar = root.createDiv({ cls: "dht-topbar" });
    const pillsWrap = topBar.createDiv({ cls: "dht-pills" });

    const allBtn = pillsWrap.createEl("button", {
      cls: `dht-pill${!state.category ? " is-active" : ""}`,
      attr: { type: "button" }
    });
    allBtn.onmousedown = e => e.preventDefault();
    allBtn.createSpan({ text: "Все" });
    allBtn.createSpan({ cls: "dht-pill-count", text: String(allItems.length) });
    allBtn.onclick = () => { state.category = ""; persist(); render(); };

    for (const [catName, count] of categories) {
      const btn = pillsWrap.createEl("button", {
        cls: `dht-pill${state.category === catName ? " is-active" : ""}`,
        attr: { type: "button" }
      });
      btn.onmousedown = e => e.preventDefault();
      btn.createSpan({ text: catName });
      btn.createSpan({ cls: "dht-pill-count", text: String(count) });
      btn.onclick = () => {
        state.category = state.category === catName ? "" : catName;
        persist();
        render();
      };
    }

    const actionsWrap = topBar.createDiv({ cls: "dht-actions" });

    const searchInput = actionsWrap.createEl("input", {
      cls: "dht-search",
      attr: { type: "search", placeholder: "Поиск...", value: state.query }
    });
    searchInput.oninput = () => {
      state.query = searchInput.value;
      persist();
      renderListOnly();
    };

    const sortSelect = actionsWrap.createEl("select", {
      cls: "dropdown dht-sort",
      attr: { title: "Сортировка записей" }
    });
    [
      { value: "date-desc", label: "Сначала новые" },
      { value: "imp-desc", label: "По важности (5 → 1)" },
      { value: "imp-asc", label: "По важности (1 → 5)" },
      { value: "date-asc", label: "Сначала старые" }
    ].forEach(opt => {
      const o = sortSelect.createEl("option", { text: opt.label, value: opt.value });
      if (state.sortBy === opt.value) o.selected = true;
    });
    sortSelect.onchange = () => {
      state.sortBy = sortSelect.value;
      persist();
      renderListOnly();
    };

    const addBtn = actionsWrap.createEl("button", {
      cls: `dht-btn-primary${state.formOpen ? " is-open" : ""}`,
      text: state.formOpen ? "✕" : "+ Записать",
      attr: { type: "button" }
    });
    addBtn.onmousedown = e => e.preventDefault();
    addBtn.onclick = () => {
      state.formOpen = !state.formOpen;
      persist();
      render();
    };

    if (state.formOpen) {
      const form = root.createEl("form", { cls: "dht-form" });

      const essenceInput = form.createEl("textarea", {
        cls: "dht-textarea",
        attr: { rows: "2", placeholder: "Текст мысли, идеи или факта *" }
      });

      const metaGrid = form.createDiv({ cls: "dht-form-grid" });
      const catInput = metaGrid.createEl("input", {
        cls: "dht-input",
        attr: { type: "text", placeholder: "Категория", value: state.category || "Мысль" }
      });
      const impInput = metaGrid.createEl("input", {
        cls: "dht-input",
        attr: { type: "number", min: "1", max: "5", placeholder: "⚡ 1–5" }
      });
      const statusInput = metaGrid.createEl("input", {
        cls: "dht-input",
        attr: { type: "text", placeholder: "Статус" }
      });
      const tagsInput = metaGrid.createEl("input", {
        cls: "dht-input",
        attr: { type: "text", placeholder: "Теги (через запятую)" }
      });
      const srcInput = metaGrid.createEl("input", {
        cls: "dht-input",
        attr: { type: "text", placeholder: "Источник" }
      });

      const bottomBar = form.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;" }
      });

      const leftHints = bottomBar.createDiv({ cls: "dht-cat-hints" });
      for (const [cName] of categories.slice(0, 6)) {
        const chip = leftHints.createEl("button", { cls: "dht-mini-chip", text: cName, attr: { type: "button" } });
        chip.onmousedown = e => e.preventDefault();
        chip.onclick = () => { catInput.value = cName; };
      }

      const rightControls = bottomBar.createDiv({ attr: { style: "display: flex; align-items: center; gap: 10px; margin-left: auto;" } });
      const pinLabel = rightControls.createEl("label", {
        attr: { style: "display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem; color: var(--text-muted); cursor: pointer;" }
      });
      const pinCheck = pinLabel.createEl("input", { attr: { type: "checkbox" } });
      pinLabel.createSpan({ text: "★ Закрепить" });

      const submitBtn = rightControls.createEl("button", {
        cls: "dht-btn-primary mod-cta",
        text: "✓ Сохранить",
        attr: { type: "submit" }
      });

      form.onsubmit = async e => {
        e.preventDefault();
        if (busy) return;
        const catVal = cleanStr(catInput.value) || "Мысль";
        const essenceVal = cleanStr(essenceInput.value);
        if (!essenceVal) {
          new Notice("Введи текст мысли.");
          essenceInput.focus();
          return;
        }

        const numImp = validNum(impInput.value);
        const validImp = numImp !== null && numImp >= 1 && numImp <= 5 ? Math.round(numImp) : null;
        const tagsArr = tagsInput.value.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
        const srcVal = cleanStr(srcInput.value);
        const stVal = cleanStr(statusInput.value);

        busy = true;
        submitBtn.disabled = true;
        try {
          await ensureFolderExists(DEFAULT_FOLDER);
          const finalPath = buildCleanFilePath(DEFAULT_FOLDER, todayISO, catVal);
          const content = formatThoughtMarkdown({
            iso: todayISO,
            category: catVal,
            essence: essenceVal,
            tags: tagsArr,
            source: srcVal,
            status: stVal,
            importance: validImp,
            pinned: pinCheck.checked
          });

          await app.vault.create(finalPath, content);
          state.formOpen = false;
          persist();
          setTimeout(render, 100);
        } catch (err) {
          new Notice("Ошибка сохранения: " + (err?.message || err));
        } finally {
          busy = false;
          submitBtn.disabled = false;
        }
      };
    }

    const listHost = root.createDiv({ cls: "dht-list-host" });

    function renderListOnly() {
      listHost.replaceChildren();
      const q = state.query.trim().toLocaleLowerCase("ru");

      const filtered = allItems.filter(it => {
        if (state.category && it.category !== state.category) return false;
        if (!q) return true;
        const haystack = [it.essence, it.category, it.status, it.source, ...it.tags].join(" ").toLocaleLowerCase("ru");
        return haystack.includes(q);
      });

      filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (state.sortBy === "imp-desc") {
          const impA = a.importance ?? -1;
          const impB = b.importance ?? -1;
          if (impA !== impB) return impB - impA;
        } else if (state.sortBy === "imp-asc") {
          const impA = a.importance ?? 99;
          const impB = b.importance ?? 99;
          if (impA !== impB) return impA - impB;
        } else if (state.sortBy === "date-asc") {
          return a.iso.localeCompare(b.iso) || a.mtime - b.mtime;
        }
        return b.iso.localeCompare(a.iso) || b.mtime - a.mtime;
      });

      if (filtered.length === 0) {
        listHost.createDiv({
          cls: "dht-empty",
          text: allItems.length === 0 ? "Записей пока нет." : "Ничего не найдено."
        });
        return;
      }

      const visibleRows = (state.showAll || state.category || q)
        ? filtered
        : filtered.slice(0, RECENT_LIMIT);

      const rowsBox = listHost.createDiv({ cls: "dht-rows" });

      for (const item of visibleRows) {
        if (state.editingPath === item.path) {
          const editBox = rowsBox.createDiv({ cls: "dht-edit-box" });

          const eText = editBox.createEl("textarea", {
            cls: "dht-textarea",
            attr: { rows: "2", placeholder: "Текст мысли *" }
          });
          eText.value = item.essence || item.title;

          const eGrid = editBox.createDiv({ cls: "dht-form-grid" });
          const eCat = eGrid.createEl("input", {
            cls: "dht-input",
            attr: { type: "text", placeholder: "Категория", value: item.category }
          });
          const eImp = eGrid.createEl("input", {
            cls: "dht-input",
            attr: { type: "number", min: "1", max: "5", placeholder: "⚡ 1–5", value: item.importance !== null ? String(item.importance) : "" }
          });
          const eStatus = eGrid.createEl("input", {
            cls: "dht-input",
            attr: { type: "text", placeholder: "Статус", value: item.status }
          });
          const eTags = eGrid.createEl("input", {
            cls: "dht-input",
            attr: { type: "text", placeholder: "Теги", value: item.tags.join(", ") }
          });
          const eSrc = eGrid.createEl("input", {
            cls: "dht-input",
            attr: { type: "text", placeholder: "Источник", value: item.source }
          });

          const eActions = editBox.createDiv({
            attr: { style: "display: flex; justify-content: flex-end; gap: 6px;" }
          });
          const saveBtn = eActions.createEl("button", {
            cls: "dht-btn-primary mod-cta",
            text: "✓ Сохранить",
            attr: { type: "button" }
          });
          const cancelBtn = eActions.createEl("button", {
            cls: "dht-icon-btn",
            text: "✕",
            attr: { type: "button", title: "Отмена" }
          });

          cancelBtn.onclick = () => {
            state.editingPath = null;
            renderListOnly();
          };

          saveBtn.onclick = async () => {
            if (busy) return;
            const nextEssence = cleanStr(eText.value);
            if (!nextEssence) {
              new Notice("Текст мысли не может быть пустым.");
              return;
            }
            const nextCat = cleanStr(eCat.value) || "Мысль";
            const rawImp = validNum(eImp.value);
            const nextImp = rawImp !== null && rawImp >= 1 && rawImp <= 5 ? Math.round(rawImp) : null;
            const nextStatus = cleanStr(eStatus.value);
            const nextTags = eTags.value.split(",").map(s => s.trim().replace(/^#/, "")).filter(Boolean);
            const nextSrc = cleanStr(eSrc.value);

            const file = app.vault.getAbstractFileByPath(item.path);
            if (!file) return;

            busy = true;
            saveBtn.disabled = true;
            try {
              const newContent = formatThoughtMarkdown({
                iso: item.iso,
                category: nextCat,
                essence: nextEssence,
                tags: nextTags,
                source: nextSrc,
                status: nextStatus,
                importance: nextImp,
                pinned: item.pinned
              });
              await app.vault.modify(file, newContent);

              const folderPath = file.parent ? file.parent.path : DEFAULT_FOLDER;
              const desiredPrefix = `${item.iso} — ${nextCat}`;
              if (!file.basename.startsWith(desiredPrefix) || file.basename.length > desiredPrefix.length + 4) {
                const cleanTarget = buildCleanFilePath(folderPath, item.iso, nextCat, file.path);
                if (cleanTarget !== file.path) {
                  await app.fileManager.renameFile(file, cleanTarget);
                }
              }

              state.editingPath = null;
              setTimeout(render, 100);
            } catch (err) {
              new Notice("Ошибка обновления: " + (err?.message || err));
            } finally {
              busy = false;
              saveBtn.disabled = false;
            }
          };
          continue;
        }

        const row = rowsBox.createDiv({ cls: `dht-row${item.pinned ? " is-pinned" : ""}` });
        const main = row.createDiv({ cls: "dht-row-main" });

        const catBadge = main.createSpan({ cls: "dht-badge-cat", text: item.category });
        catBadge.onclick = () => {
          state.category = state.category === item.category ? "" : item.category;
          persist();
          render();
        };

        main.createSpan({
          cls: "dht-row-text",
          text: item.essence || item.title
        });

        const meta = row.createDiv({ cls: "dht-row-meta" });
        if (item.importance !== null) {
          meta.createSpan({ cls: "dht-imp", text: `⚡${item.importance}`, attr: { title: `Важность: ${item.importance}` } });
        }
        if (item.status) {
          meta.createSpan({ cls: "dht-status", text: item.status });
        }
        for (const t of item.tags.slice(0, 2)) {
          meta.createSpan({ cls: "dht-tag", text: `#${t}` });
        }
        if (item.source) {
          meta.createSpan({ cls: "dht-source", text: item.source });
        }
        meta.createSpan({ cls: "dht-date", text: item.date.toFormat("dd.MM.yy") });

        const pinBtn = meta.createEl("button", {
          cls: `dht-icon-btn${item.pinned ? " is-pinned" : ""}`,
          text: item.pinned ? "★" : "☆",
          attr: { type: "button", title: item.pinned ? "Открепить" : "Закрепить" }
        });
        pinBtn.onmousedown = e => e.preventDefault();
        pinBtn.onclick = e => {
          e.stopPropagation();
          togglePin(item, pinBtn);
        };

        const editBtn = meta.createEl("button", {
          cls: "dht-icon-btn",
          text: "✎",
          attr: { type: "button", title: "Редактировать" }
        });
        editBtn.onmousedown = e => e.preventDefault();
        editBtn.onclick = e => {
          e.stopPropagation();
          state.editingPath = item.path;
          renderListOnly();
        };

        let confirmDelete = false;
        const delBtn = meta.createEl("button", {
          cls: "dht-icon-btn",
          text: "✕",
          attr: { type: "button", title: "Удалить" }
        });
        delBtn.onmousedown = e => e.preventDefault();
        delBtn.onclick = async e => {
          e.stopPropagation();
          if (busy || delBtn.disabled) return;
          if (!confirmDelete) {
            confirmDelete = true;
            delBtn.textContent = "Удалить?";
            delBtn.style.color = "#d85b57";
            delBtn.style.borderColor = "#d85b5766";
            setTimeout(() => {
              if (!delBtn.isConnected || delBtn.disabled) return;
              confirmDelete = false;
              delBtn.textContent = "✕";
              delBtn.style.color = "";
              delBtn.style.borderColor = "transparent";
            }, 3000);
            return;
          }
          busy = true;
          delBtn.disabled = true;
          try {
            const file = app.vault.getAbstractFileByPath(item.path);
            if (file) await app.vault.trash(file, true);
            setTimeout(render, 100);
          } catch (err) {
            new Notice("Ошибка удаления: " + (err?.message || err));
            delBtn.disabled = false;
          } finally {
            busy = false;
          }
        };
      }

      if (!state.category && !q && filtered.length > RECENT_LIMIT) {
        const moreBtn = listHost.createEl("button", {
          cls: "dht-icon-btn",
          text: state.showAll ? "Свернуть ▲" : `Ещё ${filtered.length - RECENT_LIMIT} ▾`,
          attr: { type: "button", style: "align-self: center; margin-top: 4px; padding: 2px 10px;" }
        });
        moreBtn.onmousedown = e => e.preventDefault();
        moreBtn.onclick = () => {
          state.showAll = !state.showAll;
          persist();
          renderListOnly();
        };
      }
    }

    renderListOnly();
  }

  render();
}