// ========================================================
// ОБЩИЕ ДАННЫЕ И УТИЛИТЫ (ГЛАВНАЯ v3.0 — Velocity 2.1.0)
// ========================================================
const AUTO_SLEEP_MIN_HOURS = 6;   // Сон > 6 часов автоматически отмечает «Режим сна»
const DIET_TOLERANCE_RATIO = 0.95; // Мягкий допуск для автопроставления «Диета» (95% от цели)
const STUDY_DEADLINE_HORIZON_DAYS = 21;
const MANUAL_HABITS_PREFIX = "dh_today_manual_habits_v1:";
const MIN_VALID_DATE_ISO = "2000-01-01";

const hostContainer = dv.container;
let refreshDebounceTimer = null;

function scheduleHomeRender(delay = 140) {
  if (!hostContainer || !hostContainer.isConnected) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    if (!hostContainer.isConnected) return;
    renderHomeDashboard();
  }, delay);
}

function renderHomeDashboard() {
  if (!hostContainer || !hostContainer.isConnected) return;

  const scroller = hostContainer.closest(".cm-scroller, .markdown-preview-view, .view-content");
  const prevScrollTop = scroller ? scroller.scrollTop : 0;

  hostContainer.replaceChildren();

  const empty = v => v == null || v === "";
  function asDate(v) {
    if (empty(v)) return null;
    try { const d = dv.date(v); return d && d.isValid ? d.startOf("day") : null; } catch { return null; }
  }
  const mtime = p => { try { return p.file.mtime?.toMillis?.() ?? 0; } catch { return 0; } };
  const notify = message => { try { new Notice(message); } catch { console.log(message); } };

  function parseNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(",", ".");
    if (s === "") return null;
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s) ? Number(s) : null;
  }

  function getNutritionPlugin() {
    return app.plugins?.plugins?.["my-nutrition-tracker"] ?? null;
  }

  function getFocusPlugin() {
    return app.plugins?.plugins?.["my-focus-tracker"] || window.__myFocusTracker || null;
  }

  function getValuesCompassPlugin() {
    return app.plugins?.plugins?.["my-values-compass"] ?? null;
  }

  function getStudyCompilerPlugin() {
    return app.plugins?.plugins?.["my-study-compiler"] ?? null;
  }

  function getSocialLimitMin() {
    const corr = app.plugins?.plugins?.["my-correlation-analytics"] ?? null;
    const val = corr?.settings?.socialLimitMin;
    return typeof val === "number" && Number.isFinite(val) && val >= 0 ? val : 30;
  }

  function openValuesCompassFromHome(tab = "map", domainId) {
    const plugin = getValuesCompassPlugin();
    if (!plugin || typeof plugin.activateView !== "function") {
      notify("Включи плагин «Values Compass» (my-values-compass) в настройках Obsidian.");
      return;
    }
    try {
      plugin.activateView(tab, domainId);
    } catch (err) {
      notify("Не удалось открыть Компас ценностей: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function openFocusTrackerFromHome(initialProject) {
    const plugin = getFocusPlugin();
    if (!plugin || typeof plugin.openFocusModal !== "function") {
      notify("Включи плагин «Фокус-таймер» (my-focus-tracker) в настройках Obsidian.");
      return;
    }
    try {
      plugin.openFocusModal(initialProject ? { initialProject } : {});
    } catch (err) {
      notify("Не удалось открыть таймер фокуса: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  function openStudyProjectFromHome(filePath, newLeaf = false) {
    const plugin = getStudyCompilerPlugin();
    if (plugin && typeof plugin.openCompiler === "function") {
      try {
        plugin.openCompiler({ rootPath: filePath });
        return;
      } catch (err) {
        console.log("[Home] openCompiler fallback:", err);
      }
    }
    app.workspace.openLinkText(filePath, dv.currentFilePath, newLeaf);
  }

  const SOCIAL_LIMIT_MIN = getSocialLimitMin();
  const nutPlugin = getNutritionPlugin();
  const rawCalorieGoal = nutPlugin?.settings ? nutPlugin.settings.dailyCalorieGoal : null;
  const calorieGoal = typeof rawCalorieGoal === "number" && rawCalorieGoal > 0 ? Math.round(rawCalorieGoal) : null;
  const rawDietRatio = nutPlugin?.settings?.dietToleranceRatio;
  const dietRatio = typeof rawDietRatio === "number" && rawDietRatio > 0 && rawDietRatio <= 1 ? rawDietRatio : DIET_TOLERANCE_RATIO;
  const dietCalorieThreshold = calorieGoal !== null ? Math.round(calorieGoal * dietRatio) : null;

  const today = dv.date("today").startOf("day");
  const todayISO = today.toISODate();
  const yesterdayISO = today.minus({ days: 1 }).toISODate();

  const diaryPages = dv.pages('"Ежедневник"').array();
  const findDiaryNote = (iso) =>
    diaryPages
      .filter(p => {
        const d = asDate(p.дата) || asDate(p.file.name);
        if (!d) return false;
        const pIso = d.toISODate();
        return pIso >= MIN_VALID_DATE_ISO && pIso === iso;
      })
      .sort((a, b) => mtime(b) - mtime(a) || a.file.path.localeCompare(b.file.path, "ru"))[0] || null;

  const todayNote = findDiaryNote(todayISO);
  const knowledgePages = dv.pages('"Знания"').array();
  const getTrainingsByDate = (iso) =>
    knowledgePages.filter(p => p.тип === "Тренировка" && asDate(p.дата)?.toISODate() === iso);

  const trainingsTodayList = getTrainingsByDate(todayISO);

  // --- Ручные переопределения привычек за дату (локально для устройства) ---
  function getManualHabitOverrides(dateISO = todayISO) {
    try {
      const raw = window.localStorage?.getItem(MANUAL_HABITS_PREFIX + dateISO);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function setManualHabitOverride(key, val, dateISO = todayISO) {
    try {
      const cur = getManualHabitOverrides(dateISO);
      if (val === undefined) delete cur[key];
      else cur[key] = val;
      window.localStorage?.setItem(MANUAL_HABITS_PREFIX + dateISO, JSON.stringify(cur));
    } catch {}
  }

  // --- Ближайшие и просроченные дедлайны Учёбы ---
  const isTemplate = p => p.file.name.startsWith("Учёба — ") || p.file.path.startsWith("Шаблоны/");
  const DONE_STUDY_STATUSES = ["завершён", "завершена", "сдана", "сдан", "готово", "архив", "отменён", "отменена"];
  const allPages = dv.pages().array();

  const activeStudyProjects = allPages.filter(p =>
    !isTemplate(p) &&
    String(p.направление ?? "").trim() === "Учёба" &&
    ["Проект", "Лабораторная работа"].includes(String(p.тип ?? "").trim()) &&
    !DONE_STUDY_STATUSES.includes(String(p.статус ?? "").trim().toLowerCase())
  );

  const upcomingDeadlines = allPages
    .filter(p =>
      !isTemplate(p) &&
      String(p.направление ?? "").trim() === "Учёба" &&
      !DONE_STUDY_STATUSES.includes(String(p.статус ?? "").trim().toLowerCase())
    )
    .map(p => {
      const d = asDate(p.дедлайн) || asDate(p.срок);
      if (!d) return null;
      const diffDays = Math.round(d.diff(today, "days").days);
      if (diffDays > STUDY_DEADLINE_HORIZON_DAYS) return null;
      return {
        path: p.file.path,
        title: String(p.название ?? p.file.name).trim(),
        discipline: String(p.дисциплина ?? "").trim(),
        date: d,
        diffDays
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.diffDays - b.diffDays || a.title.localeCompare(b.title, "ru"))
    .slice(0, 2);

  // ========================================================
  // 1. НАВИГАЦИОННЫЕ ПЛИТКИ (ХАБЫ СИСТЕМЫ)
  // ========================================================
  {
    const studyActive = activeStudyProjects.length;
    const trainingsToday = trainingsTodayList.length;

    const notes3D = allPages.filter(p =>
      !isTemplate(p) &&
      String(p.направление ?? "").trim() === "3D" &&
      p.file.name !== "🧊3D"
    ).length;

    const cardsDoneToday = parseNum(todayNote?.карточек_пройдено) || 0;
    const grammarDoneToday = parseNum(todayNote?.грамматика_упражнений) || 0;
    const pagesDoneToday = parseNum(todayNote?.страниц_прочитано) || 0;

    const englishParts = [];
    if (cardsDoneToday > 0) englishParts.push(`${cardsDoneToday} карт.`);
    if (grammarDoneToday > 0) englishParts.push(`${grammarDoneToday} грам.`);
    if (pagesDoneToday > 0) englishParts.push(`${pagesDoneToday} стр.`);
    const englishBadge = englishParts.join(" · ");

    const HUBS = [
      {
        title: "Дневник",
        file: "📓Дневник",
        icon: "📓",
        color: "var(--color-purple, #9c83e8)",
        badge: todayNote?.оценка_дня ? `${todayNote.оценка_дня}/10` : ""
      },
      {
        title: "Учёба",
        file: "🎓Учёба",
        icon: "🎓",
        color: "var(--color-orange, #e5a158)",
        badge: studyActive > 0 ? String(studyActive) : ""
      },
      {
        title: "Здоровье",
        file: "💪Здоровье",
        icon: "💪",
        color: "var(--color-yellow, #d69852)",
        badge: trainingsToday > 0 || todayNote?.тренировка === true ? "✓" : ""
      },
      {
        title: "Английский",
        file: "🌎Английский и книги",
        icon: "🌎",
        color: "var(--color-green, #4aab80)",
        badge: englishBadge
      },
      {
        title: "3D",
        file: "🧊3D",
        icon: "🧊",
        color: "var(--color-blue, #599ed6)",
        badge: notes3D > 0 ? String(notes3D) : ""
      }
    ];

    const root = dv.container.createDiv({ cls: "dh dh-hub-nav" });
    const grid = root.createDiv({ cls: "dh-hub-grid" });

    HUBS.forEach(hub => {
      const card = grid.createDiv({ cls: "dh-card dh-hub-card" });
      card.style.setProperty("--hub-color", hub.color);

      card.onclick = (e) => {
        app.workspace.openLinkText(hub.file, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      card.createDiv({ cls: "dh-hub-icon", text: hub.icon });
      card.createDiv({ cls: "dh-hub-title", text: hub.title });

      if (hub.badge) {
        card.createSpan({ cls: "dh-hub-badge", text: hub.badge });
      }
    });
  }

  // ========================================================
  // 2. БЛОК «СЕГОДНЯ»: СОСТОЯНИЕ, ПОКАЗАТЕЛИ, ПЛАН И ИТОГИ ДНЯ
  // ========================================================
  {
    const HABITS = [
      { key: "nofap", name: "NoFap", color: "#9c83e8" },
      { key: "тренировка", name: "Тренировка", color: "#d69852" },
      { key: "чтение", name: "Чтение", color: "#599ed6" },
      { key: "режим_сна", name: "Режим сна", color: "#69b5aa" },
      { key: "диета", name: "Диета", color: "#8bac5e" },
      { key: "без_соцсетей", name: "Без соцсетей", color: "#e06c75" },
    ];

    const COLORS = [
      "#d85b57", "#d97354", "#d98c54", "#d9a554", "#c5ad55",
      "#a6b25a", "#8cb666", "#73b473", "#5ab17f", "#4aab80"
    ];

    function computeSleepDurationHours(sleepTimeStr, wakeTimeStr) {
      if (!sleepTimeStr || !wakeTimeStr) return null;
      const sMatch = String(sleepTimeStr).trim().match(/^(\d{1,2})[:.](\d{2})$/);
      const wMatch = String(wakeTimeStr).trim().match(/^(\d{1,2})[:.](\d{2})$/);
      if (!sMatch || !wMatch) return null;
      const sh = Number(sMatch[1]), sm = Number(sMatch[2]);
      const wh = Number(wMatch[1]), wm = Number(wMatch[2]);
      if (sh < 0 || sh > 23 || sm < 0 || sm > 59 || wh < 0 || wh > 23 || wm < 0 || wm > 59) return null;
      let diff = (wh * 60 + wm) - (sh * 60 + sm);
      if (diff <= 0) diff += 24 * 60;
      return Math.round((diff / 60) * 10) / 10;
    }

    function normalizeTimeString(v) {
      if (!v) return "";
      const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})$/);
      if (!m) return "";
      const h = Number(m[1]), min = Number(m[2]);
      if (h < 0 || h > 23 || min < 0 || min > 59) return "";
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }

    let selectedISO =
      typeof window.__dhHomeSelectedDateISO === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(window.__dhHomeSelectedDateISO) &&
      window.__dhHomeSelectedDateISO >= MIN_VALID_DATE_ISO &&
      window.__dhHomeSelectedDateISO <= todayISO
        ? window.__dhHomeSelectedDateISO
        : todayISO;
    window.__dhHomeSelectedDateISO = selectedISO;

    const selectedDate = dv.date(selectedISO).startOf("day");
    const isToday = selectedISO === todayISO;
    const isYesterday = selectedISO === yesterdayISO;

    const setSelectedDateISO = (nextISO) => {
      if (!nextISO || !/^\d{4}-\d{2}-\d{2}$/.test(nextISO)) return;
      const clamped = nextISO > todayISO ? todayISO : nextISO < MIN_VALID_DATE_ISO ? MIN_VALID_DATE_ISO : nextISO;
      if (clamped === window.__dhHomeSelectedDateISO) return;
      window.__dhHomeSelectedDateISO = clamped;
      renderHomeDashboard();
    };

    const INPUT_METRICS = [
      { label: "Вес", key: "вес_кг", unit: "кг", min: 20, max: 300, digits: 1, placeholder: "—" },
      { label: "Сон", key: "сон_часов", unit: "ч", min: 0, max: 24, digits: 1, placeholder: "—" },
      { label: "Чтение", key: "страниц_прочитано", unit: "стр.", min: 0, max: 1500, digits: 0, placeholder: "—" },
      { label: "Соцсети", key: "соцсети_мин", unit: "мин", min: 0, max: 1440, digits: 0, placeholder: "—" },
      { label: "Шаги", key: "шаги", unit: "шаг", min: 0, max: 100000, digits: 0, placeholder: "—" },
    ];

    function formatNumForInput(v, digits = 1) {
      const n = parseNum(v);
      if (n === null) return "";
      const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
      return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
    }

    function openNutritionFromHome() {
      const plugin = getNutritionPlugin();
      if (!plugin || typeof plugin.openNutrition !== "function") {
        notify("Включи плагин «Питание и БЖУ» (my-nutrition-tracker) в настройках Obsidian.");
        return;
      }
      try {
        plugin.openNutrition({ dateISO: selectedISO });
      } catch (err) {
        notify("Не удалось открыть дневник питания: " + (err instanceof Error ? err.message : String(err)));
      }
    }

    async function createDiaryNoteForDate(targetISO) {
      const MONTHS_RU = [
        "январь", "февраль", "март", "апрель", "май", "июнь",
        "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
      ];
      const baseFolder = "Ежедневник";
      const prefix = `${baseFolder}/`;
      const usesNested = app.vault
        .getMarkdownFiles()
        .some(f => f.path.startsWith(prefix) && /\/\d{4}\/\d{2}\s*-\s*[^/]+\/\d{4}-\d{2}-\d{2}\.md$/i.test(f.path));

      let targetFolder = baseFolder;
      const [yyyy, mm] = targetISO.split("-");
      const mIdx = Number(mm) - 1;
      if (usesNested && yyyy && mm && mIdx >= 0 && mIdx < MONTHS_RU.length) {
        targetFolder = `${baseFolder}/${yyyy}/${mm} - ${MONTHS_RU[mIdx]}`;
      }

      let acc = "";
      for (const part of targetFolder.split("/").filter(Boolean)) {
        acc = acc ? `${acc}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(acc)) {
          try { await app.vault.createFolder(acc); } catch {}
        }
      }

      const targetPath = `${targetFolder}/${targetISO}.md`;
      const existing = app.vault.getAbstractFileByPath(targetPath);
      if (existing) return existing;

      const content = `---\nдата: "${targetISO}"\n---\n\n`;
      return await app.vault.create(targetPath, content);
    }

    if (!window.__dhTodayDrafts || window.__dhTodayDrafts.dateISO !== selectedISO) {
      window.__dhTodayDrafts = {
        dateISO: selectedISO,
        inputs: {},
        errors: {},
        savedStamp: {},
        activeKey: null,
        selectionStart: null,
        selectionEnd: null
      };
    }
    const uiDrafts = window.__dhTodayDrafts;

    if (!window.__dhTodaySaveQueue) {
      window.__dhTodaySaveQueue = Promise.resolve();
    }
    function enqueueFrontMatterSave(file, mutator) {
      if (!file) return Promise.reject(new Error("Файл ежедневной заметки не найден"));
      const nextTask = window.__dhTodaySaveQueue
        .catch(() => {})
        .then(() => app.fileManager.processFrontMatter(file, mutator));
      window.__dhTodaySaveQueue = nextTask;
      return nextTask;
    }

    const note = isToday ? todayNote : findDiaryNote(selectedISO);
    const trainings = isToday ? trainingsTodayList : getTrainingsByDate(selectedISO);

    const root = dv.container.createDiv({ cls: "dh dh-today" });

    function actionButton(parent, label, run, cls = "dh-btn") {
      const b = parent.createEl("button", { cls, text: label, attr: { type: "button" } });
      b.onmousedown = e => e.preventDefault();
      b.onclick = async () => {
        if (b.disabled) return;
        b.disabled = true;
        try {
          await run();
        } catch (e) {
          notify(`Не получилось: ${e?.message ?? e}`);
        } finally {
          if (b.isConnected) b.disabled = false;
        }
      };
      return b;
    }

    const openOrCreateDay = async () => {
      if (note) {
        app.workspace.openLinkText(note.file.path, dv.currentFilePath, false);
        return;
      }
      if (isToday) {
        if (!app.commands.executeCommandById("daily-notes")) {
          await createDiaryNoteForDate(selectedISO);
          scheduleHomeRender(120);
        }
        return;
      }
      await createDiaryNoteForDate(selectedISO);
      notify(`Создана запись за ${selectedDate.toFormat("dd.MM.yyyy")}`);
      scheduleHomeRender(120);
    };

    const head = root.createDiv({ cls: "dh-today-head" });
    const titles = head.createDiv({ cls: "dh-today-titles" });
    titles.createDiv({
      cls: "dh-kicker",
      text: isToday ? "Сегодня" : isYesterday ? "Вчера" : selectedDate.toFormat("dd.MM.yyyy")
    });

    const dateRow = titles.createDiv({ cls: "dh-today-date-row" });
    const navWrap = dateRow.createDiv({ cls: "dh-date-nav" });

    const prevDayBtn = navWrap.createEl("button", {
      cls: "dh-date-nav-btn",
      text: "‹",
      attr: { type: "button", title: "Предыдущий день", "aria-label": "Предыдущий день" }
    });
    prevDayBtn.onmousedown = e => e.preventDefault();
    prevDayBtn.onclick = () => setSelectedDateISO(selectedDate.minus({ days: 1 }).toISODate());

    const pickerWrap = navWrap.createDiv({
      cls: "dh-date-picker-wrap",
      attr: { title: "Нажми, чтобы выбрать любую дату" }
    });
    pickerWrap.createDiv({
      cls: "dh-today-date",
      text: selectedDate.setLocale("ru").toFormat("cccc, d MMMM")
    });
    const pickerInput = pickerWrap.createEl("input", {
      cls: "dh-date-picker-native",
      attr: {
        type: "date",
        value: selectedISO,
        min: MIN_VALID_DATE_ISO,
        max: todayISO,
        "aria-label": "Выбрать дату"
      }
    });
    pickerInput.onclick = () => {
      try { pickerInput.showPicker?.(); } catch {}
    };
    pickerInput.onchange = () => {
      if (pickerInput.value) setSelectedDateISO(pickerInput.value);
    };

    const nextDayBtn = navWrap.createEl("button", {
      cls: "dh-date-nav-btn",
      text: "›",
      attr: { type: "button", title: "Следующий день", "aria-label": "Следующий день" }
    });
    nextDayBtn.disabled = isToday;
    nextDayBtn.onmousedown = e => e.preventDefault();
    nextDayBtn.onclick = () => setSelectedDateISO(selectedDate.plus({ days: 1 }).toISODate());

    if (!isToday) {
      const backTodayBtn = dateRow.createEl("button", {
        cls: "dh-date-today-btn",
        text: "Сегодня",
        attr: { type: "button", title: "Вернуться к сегодняшнему дню" }
      });
      backTodayBtn.onmousedown = e => e.preventDefault();
      backTodayBtn.onclick = () => setSelectedDateISO(todayISO);
    }

    dateRow.createDiv({ cls: "dh-today-badges" });

    const actions = head.createDiv({ cls: "dh-actions" });
    actionButton(
      actions,
      note ? "Открыть запись дня" : "Создать запись дня",
      openOrCreateDay,
      note ? "dh-btn" : "dh-btn mod-cta"
    );

    if (!note) {
      root.createDiv({
        cls: "dh-muted dh-today-empty",
        text: isToday
          ? "Записи за сегодня пока нет. Нажми «Создать запись дня», чтобы отмечать оценку, энергию, привычки, показатели и план дня прямо с главной."
          : `Записи за ${selectedDate.toFormat("dd.MM.yyyy")} нет. Нажми «Создать запись дня», чтобы сразу заполнить все показатели прямо здесь.`
      });
    } else {
      const file = app.vault.getAbstractFileByPath(note.file.path);
      const fmCache = file ? (app.metadataCache.getFileCache(file)?.frontmatter || {}) : {};
      const manualOverrides = getManualHabitOverrides(selectedISO);

      const saveField = (key, value) => enqueueFrontMatterSave(file, fm => {
        fm[key] = value;
      });

      const savedCalories = parseNum(note.калории_ккал);
      const savedProtein = parseNum(note.белки_г);
      const savedFat = parseNum(note.жиры_г);
      const savedCarbs = parseNum(note.углеводы_г);
      const savedSleep = parseNum(note.сон_часов);
      const savedPages = parseNum(note.страниц_прочитано);
      const savedFocus = parseNum(note.глубокая_работа_часов);
      const savedSocialMin = parseNum(note.соцсети_мин);

      const focusByGoalsMap = (fmCache.фокус_по_целям && typeof fmCache.фокус_по_целям === "object")
        ? fmCache.фокус_по_целям
        : {};

      const states = new Map(HABITS.map(h => [h.key, typeof note[h.key] === "boolean" ? note[h.key] : null]));
      const pendingPatch = {};

      if (isToday) {
        // 1. Привычка «Чтение» по данным ежедневника (пишет my-epub-reader или ручной ввод)
        if (savedPages !== null && savedPages > 0 && manualOverrides.чтение === undefined && states.get("чтение") !== true) {
          states.set("чтение", true);
          pendingPatch.чтение = true;
        }

        // 2. Привычка «Тренировка» при наличии сессии за сегодня
        if (trainings.length > 0 && manualOverrides.тренировка === undefined && states.get("тренировка") !== true) {
          states.set("тренировка", true);
          pendingPatch.тренировка = true;
        }

        // 3. Привычка «Диета» с мягким допуском (95% от цели)
        if (dietCalorieThreshold !== null && savedCalories !== null && savedCalories >= dietCalorieThreshold && manualOverrides.диета === undefined && states.get("диета") !== true) {
          states.set("диета", true);
          pendingPatch.диета = true;
        }

        // 4. Привычка «Режим сна» при сне > 6 часов
        if (savedSleep !== null && savedSleep > AUTO_SLEEP_MIN_HOURS && manualOverrides.режим_сна === undefined && states.get("режим_сна") !== true) {
          states.set("режим_сна", true);
          pendingPatch.режим_сна = true;
        }

        // 5. Привычка «Без соцсетей» по лимиту из my-correlation-analytics
        if (savedSocialMin !== null && manualOverrides.без_соцсетей === undefined) {
          const withinLimit = savedSocialMin <= SOCIAL_LIMIT_MIN;
          if (states.get("без_соцсетей") !== withinLimit) {
            states.set("без_соцсетей", withinLimit);
            pendingPatch.без_соцсетей = withinLimit;
          }
        }

        if (Object.keys(pendingPatch).length > 0) {
          enqueueFrontMatterSave(file, fm => {
            Object.assign(fm, pendingPatch);
          }).catch(e => console.log("Auto-sync error:", e));
        }
      }

      const rawGoals = Array.isArray(note.цели_дня) ? note.цели_дня : [];
      const goalsState = rawGoals.map(g => {
        const text = String(g?.text ?? "Задача").trim();
        const focusMin = Math.max(
          Number(g?.focus_minutes) || 0,
          Number(focusByGoalsMap[text]) || 0
        );
        return {
          text,
          category: g?.category ? String(g.category).trim() : "",
          progress: Math.max(0, Math.min(100, Number(g?.progress) || 0)),
          focusMinutes: Math.round(focusMin)
        };
      });

      const calcPlanSummary = () => {
        const totalG = goalsState.length;
        if (!totalG) return { totalG: 0, doneG: 0, avgPct: 0 };
        const doneG = goalsState.filter(g => g.progress >= 100).length;
        const avgPct = Math.round(goalsState.reduce((acc, g) => acc + g.progress, 0) / totalG);
        return { totalG, doneG, avgPct };
      };

      const body = root.createDiv({ cls: "dh-today-body" });
      const stateSection = body.createDiv({ cls: "dh-today-section" });

      const ratingsBar = stateSection.createDiv({ cls: "dh-ratings-bar" });
      const scaleDrawer = stateSection.createDiv({ cls: "dh-rating-drawer" });
      scaleDrawer.style.display = "none";

      const scaleDefs = [
        { label: "Оценка дня", key: "оценка_дня" },
        { label: "Энергия", key: "энергия" }
      ];
      const scaleCurrent = new Map();
      const scalePills = new Map();

      for (const sc of scaleDefs) {
        const parsed = parseNum(note[sc.key]);
        scaleCurrent.set(sc.key, parsed !== null && parsed >= 1 && parsed <= 10 ? parsed : null);

        const pill = ratingsBar.createEl("button", {
          cls: "dh-rating-pill",
          attr: { type: "button" }
        });
        pill.onmousedown = e => e.preventDefault();
        pill.createSpan({ text: sc.label });
        const valEl = pill.createSpan({ cls: "dh-rating-pill-val" });
        scalePills.set(sc.key, { pill, valEl });

        pill.onclick = () => {
          uiDrafts.openScaleKey = uiDrafts.openScaleKey === sc.key ? null : sc.key;
          renderScaleDrawer();
        };
      }

      function paintScalePills() {
        for (const sc of scaleDefs) {
          const cur = scaleCurrent.get(sc.key);
          const { pill, valEl } = scalePills.get(sc.key);
          valEl.setText(cur !== null ? `${cur}/10` : "—");
          pill.style.setProperty("--pill-color", cur !== null ? COLORS[Math.round(cur) - 1] : "var(--text-muted)");
          pill.classList.toggle("is-open", uiDrafts.openScaleKey === sc.key);
        }
      }

      function renderScaleDrawer() {
        paintScalePills();
        scaleDrawer.replaceChildren();
        const activeSc = scaleDefs.find(s => s.key === uiDrafts.openScaleKey);
        if (!activeSc) {
          scaleDrawer.style.display = "none";
          return;
        }
        scaleDrawer.style.display = "flex";
        const cur = scaleCurrent.get(activeSc.key);
        for (let n = 1; n <= 10; n++) {
          const b = actionButton(scaleDrawer, String(n), async () => {
            const prev = scaleCurrent.get(activeSc.key);
            const next = prev === n ? null : n;
            scaleCurrent.set(activeSc.key, next);
            uiDrafts.openScaleKey = null;
            renderScaleDrawer();
            try {
              await saveField(activeSc.key, next);
            } catch (err) {
              scaleCurrent.set(activeSc.key, prev);
              renderScaleDrawer();
              throw err;
            }
          }, "dh-chip dh-score" + (cur === n ? " is-active" : ""));
          b.style.setProperty("--chip-color", COLORS[n - 1]);
          b.setAttribute("aria-label", `${activeSc.label}: ${n}`);
        }
      }
      renderScaleDrawer();

      const habitsRow = stateSection.createDiv({ cls: "dh-today-row" });
      const habitsLabelWrap = habitsRow.createDiv({ cls: "dh-today-row-label" });
      habitsLabelWrap.createSpan({ text: "Привычки" });
      const habitsCountSub = habitsLabelWrap.createSpan({ cls: "dh-today-row-sub" });
      const habitChips = habitsRow.createDiv({ cls: "dh-today-chips" });

      const habitPainters = new Map();
      const updateHabitsSummary = () => {
        const done = [...states.values()].filter(v => v === true).length;
        habitsCountSub.setText(`${done}/${HABITS.length}`);
      };

      for (const h of HABITS) {
        const b = actionButton(habitChips, "", async () => {
          const prev = states.get(h.key);
          const next = prev !== true;
          states.set(h.key, next);
          setManualHabitOverride(h.key, next, selectedISO);
          paintHabit();
          updateHabitsSummary();
          try {
            await saveField(h.key, next);
          } catch (err) {
            states.set(h.key, prev);
            paintHabit();
            updateHabitsSummary();
            throw err;
          }
        }, "dh-chip dh-habit-chip");

        b.style.setProperty("--chip-color", h.color);
        const checkIcon = b.createSpan({ cls: "dh-habit-check" });
        b.createSpan({ text: h.name });

        const paintHabit = () => {
          const s = states.get(h.key);
          const isDone = s === true;
          b.classList.toggle("is-active", isDone);
          b.classList.toggle("is-unknown", s === null);
          b.setAttribute("aria-pressed", String(isDone));
          b.setAttribute("title", isDone ? `${h.name}: выполнено (нажми, чтобы снять)` : `${h.name}: не отмечено`);
          checkIcon.setText(isDone ? "✓" : "○");
        };

        habitPainters.set(h.key, paintHabit);
        paintHabit();
      }
      updateHabitsSummary();

      const metricsGrid = body.createDiv({ cls: "dh-metrics-grid" });
      const inputRefs = new Map();

      const syncMetricInputWidth = (inp, fallback = "—") => {
        const sizer = inp.parentElement;
        if (sizer && sizer.classList.contains("dh-metric-sizer")) {
          sizer.dataset.val = inp.value || fallback;
        }
      };

      const renderInputMetricCard = (m) => {
        const card = metricsGrid.createEl("label", { cls: "dh-metric-item" });
        const top = card.createDiv({ cls: "dh-metric-top" });
        top.createSpan({ cls: "dh-metric-label", text: m.label });
        const statusSpan = top.createSpan({ cls: "dh-metric-status" });

        const control = card.createDiv({ cls: "dh-metric-control" });
        const sizer = control.createSpan({ cls: "dh-metric-sizer" });
        const input = sizer.createEl("input", {
          cls: "dh-metric-input",
          attr: {
            type: "text",
            inputmode: m.digits > 0 ? "decimal" : "numeric",
            placeholder: m.placeholder,
            "aria-label": `${m.label}, ${m.unit}`
          }
        });
        control.createSpan({ cls: "dh-metric-unit", text: m.unit });

        const errorEl = card.createDiv({ cls: "dh-metric-error" });
        errorEl.style.display = "none";

        const savedRaw = note[m.key];
        const savedFormatted = formatNumForInput(savedRaw, m.digits);
        const hasDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, m.key);
        input.value = hasDraft ? uiDrafts.inputs[m.key] : savedFormatted;
        syncMetricInputWidth(input, m.placeholder);

        if (uiDrafts.errors[m.key]) {
          card.classList.add("is-invalid");
          errorEl.setText(uiDrafts.errors[m.key]);
          errorEl.style.display = "block";
        } else if (uiDrafts.savedStamp[m.key] && Date.now() - uiDrafts.savedStamp[m.key] < 2200) {
          statusSpan.setText("✓");
          setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
        }

        input.onfocus = () => {
          uiDrafts.activeKey = m.key;
        };

        input.oninput = () => {
          syncMetricInputWidth(input, m.placeholder);
          uiDrafts.inputs[m.key] = input.value;
          uiDrafts.selectionStart = input.selectionStart;
          uiDrafts.selectionEnd = input.selectionEnd;
          if (uiDrafts.errors[m.key]) {
            delete uiDrafts.errors[m.key];
            card.classList.remove("is-invalid");
            errorEl.style.display = "none";
          }
        };

        input.onkeydown = e => {
          if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            delete uiDrafts.inputs[m.key];
            delete uiDrafts.errors[m.key];
            card.classList.remove("is-invalid");
            errorEl.style.display = "none";
            input.value = savedFormatted;
            syncMetricInputWidth(input, m.placeholder);
            input.blur();
          }
        };

        let isSavingMetric = false;
        const commitMetric = async () => {
          if (isSavingMetric) return;
          if (uiDrafts.activeKey === m.key) uiDrafts.activeKey = null;

          const rawTrimmed = input.value.trim();
          const normalized = rawTrimmed.replace(",", ".");

          if (normalized === "") {
            delete uiDrafts.inputs[m.key];
            delete uiDrafts.errors[m.key];
            card.classList.remove("is-invalid");
            errorEl.style.display = "none";
            syncMetricInputWidth(input, m.placeholder);
            if (savedFormatted === "") return;

            isSavingMetric = true;
            try {
              await saveField(m.key, null);
              uiDrafts.savedStamp[m.key] = Date.now();
              statusSpan.setText("✓");
            } catch (err) {
              notify(`Не удалось очистить «${m.label}»: ${err?.message ?? err}`);
            } finally {
              isSavingMetric = false;
            }
            return;
          }

          const numVal = parseNum(normalized);
          if (numVal === null || numVal < m.min || numVal > m.max) {
            const msg = `Нужно число ${m.min}–${m.max} ${m.unit}`;
            uiDrafts.errors[m.key] = msg;
            card.classList.add("is-invalid");
            errorEl.setText(msg);
            errorEl.style.display = "block";
            return;
          }

          const finalValue = Math.round(numVal * 10 ** m.digits) / 10 ** m.digits;
          const finalFormatted = formatNumForInput(finalValue, m.digits);
          input.value = finalFormatted;
          syncMetricInputWidth(input, m.placeholder);
          delete uiDrafts.inputs[m.key];
          delete uiDrafts.errors[m.key];
          card.classList.remove("is-invalid");
          errorEl.style.display = "none";

          let autoHabitKey = null;
          let autoHabitVal = null;

          if (m.key === "сон_часов") {
            autoHabitKey = "режим_сна";
            autoHabitVal = finalValue > AUTO_SLEEP_MIN_HOURS;
          } else if (m.key === "страниц_прочитано") {
            autoHabitKey = "чтение";
            autoHabitVal = finalValue > 0;
          } else if (m.key === "соцсети_мин") {
            autoHabitKey = "без_соцсетей";
            autoHabitVal = finalValue <= SOCIAL_LIMIT_MIN;
          }

          const habitNeedsUpdate = autoHabitKey !== null && states.get(autoHabitKey) !== autoHabitVal;
          if (finalFormatted === savedFormatted && typeof savedRaw === "number" && !habitNeedsUpdate) return;

          isSavingMetric = true;
          try {
            if (autoHabitKey !== null) {
              setManualHabitOverride(autoHabitKey, undefined, selectedISO);
              states.set(autoHabitKey, autoHabitVal);
              habitPainters.get(autoHabitKey)?.();
              updateHabitsSummary();
            }

            await enqueueFrontMatterSave(file, fm => {
              fm[m.key] = finalValue;
              if (autoHabitKey !== null) {
                fm[autoHabitKey] = autoHabitVal;
              }
            });
            uiDrafts.savedStamp[m.key] = Date.now();
            statusSpan.setText("✓");
          } catch (err) {
            uiDrafts.inputs[m.key] = rawTrimmed;
            notify(`Ошибка сохранения «${m.label}»: ${err?.message ?? err}`);
          } finally {
            isSavingMetric = false;
          }
        };

        input.onchange = commitMetric;
        input.onblur = commitMetric;
        inputRefs.set(m.key, input);
      };

      const renderSleepUnifiedCard = (m) => {
        const card = metricsGrid.createDiv({ cls: "dh-metric-item dh-sleep-card" });
        const topBlock = card.createDiv({ cls: "dh-sleep-top-block" });
        const top = topBlock.createDiv({ cls: "dh-metric-top" });
        top.createSpan({ cls: "dh-metric-label", text: "Сон" });
        const statusSpan = top.createSpan({ cls: "dh-metric-status" });

        const durWrap = topBlock.createEl("label", { cls: "dh-metric-control" });
        const sizer = durWrap.createSpan({ cls: "dh-metric-sizer" });
        const sleepInput = sizer.createEl("input", {
          cls: "dh-metric-input",
          attr: {
            type: "text",
            size: "1",
            inputmode: "decimal",
            placeholder: m.placeholder,
            "aria-label": `${m.label}, ${m.unit}`
          }
        });
        durWrap.createSpan({ cls: "dh-metric-unit", text: m.unit });

        card.createDiv({ cls: "dh-sleep-divider" });

        const schedWrap = card.createDiv({ cls: "dh-sleep-sched" });
        schedWrap.createSpan({ cls: "dh-metric-label", text: "Режим" });
        const pair = schedWrap.createDiv({ cls: "dh-sleep-pair" });

        const errorEl = card.createDiv({ cls: "dh-metric-error" });
        errorEl.style.display = "none";

        const showError = (msg) => {
          card.classList.add("is-invalid");
          errorEl.setText(msg);
          errorEl.style.display = "block";
        };
        const clearError = (key) => {
          delete uiDrafts.errors[key];
          const anyErr = ["сон_часов", "отбой", "подъём"].find(k => uiDrafts.errors[k]);
          if (anyErr) {
            showError(uiDrafts.errors[anyErr]);
          } else {
            card.classList.remove("is-invalid");
            errorEl.style.display = "none";
          }
        };
        const flashSaved = (key) => {
          uiDrafts.savedStamp[key] = Date.now();
          statusSpan.setText("✓");
          setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
        };

        const savedSleepRaw = note[m.key];
        const savedSleepFormatted = formatNumForInput(savedSleepRaw, m.digits);
        const hasSleepDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, m.key);
        sleepInput.value = hasSleepDraft ? uiDrafts.inputs[m.key] : savedSleepFormatted;
        syncMetricInputWidth(sleepInput, m.placeholder);

        if (uiDrafts.errors[m.key]) {
          showError(uiDrafts.errors[m.key]);
        } else if (uiDrafts.savedStamp[m.key] && Date.now() - uiDrafts.savedStamp[m.key] < 2200) {
          statusSpan.setText("✓");
          setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
        }

        sleepInput.onfocus = () => { uiDrafts.activeKey = m.key; };
        sleepInput.oninput = () => {
          syncMetricInputWidth(sleepInput, m.placeholder);
          uiDrafts.inputs[m.key] = sleepInput.value;
          uiDrafts.selectionStart = sleepInput.selectionStart;
          uiDrafts.selectionEnd = sleepInput.selectionEnd;
          if (uiDrafts.errors[m.key]) clearError(m.key);
        };
        sleepInput.onkeydown = e => {
          if (e.key === "Enter") {
            e.preventDefault();
            sleepInput.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            delete uiDrafts.inputs[m.key];
            clearError(m.key);
            sleepInput.value = savedSleepFormatted;
            syncMetricInputWidth(sleepInput, m.placeholder);
            sleepInput.blur();
          }
        };

        let isSavingSleep = false;
        const commitSleep = async () => {
          if (isSavingSleep) return;
          if (uiDrafts.activeKey === m.key) uiDrafts.activeKey = null;

          const rawTrimmed = sleepInput.value.trim();
          const normalized = rawTrimmed.replace(",", ".");
          if (normalized === "") {
            delete uiDrafts.inputs[m.key];
            clearError(m.key);
            syncMetricInputWidth(sleepInput, m.placeholder);
            if (savedSleepFormatted === "") return;
            isSavingSleep = true;
            try {
              await saveField(m.key, null);
              flashSaved(m.key);
            } catch (err) {
              notify(`Не удалось очистить «Сон»: ${err?.message ?? err}`);
            } finally {
              isSavingSleep = false;
            }
            return;
          }

          const numVal = parseNum(normalized);
          if (numVal === null || numVal < m.min || numVal > m.max) {
            const msg = `Нужно число ${m.min}–${m.max} ${m.unit}`;
            uiDrafts.errors[m.key] = msg;
            showError(msg);
            return;
          }

          const finalValue = Math.round(numVal * 10 ** m.digits) / 10 ** m.digits;
          const finalFormatted = formatNumForInput(finalValue, m.digits);
          sleepInput.value = finalFormatted;
          syncMetricInputWidth(sleepInput, m.placeholder);
          delete uiDrafts.inputs[m.key];
          clearError(m.key);

          const autoHabitVal = finalValue > AUTO_SLEEP_MIN_HOURS;
          const habitNeedsUpdate = states.get("режим_сна") !== autoHabitVal;
          if (finalFormatted === savedSleepFormatted && typeof savedSleepRaw === "number" && !habitNeedsUpdate) return;

          isSavingSleep = true;
          try {
            setManualHabitOverride("режим_сна", undefined, selectedISO);
            states.set("режим_сна", autoHabitVal);
            habitPainters.get("режим_сна")?.();
            updateHabitsSummary();

            await enqueueFrontMatterSave(file, fm => {
              fm[m.key] = finalValue;
              fm["режим_сна"] = autoHabitVal;
            });
            flashSaved(m.key);
          } catch (err) {
            uiDrafts.inputs[m.key] = rawTrimmed;
            notify(`Ошибка сохранения «Сон»: ${err?.message ?? err}`);
          } finally {
            isSavingSleep = false;
          }
        };

        sleepInput.onchange = commitSleep;
        sleepInput.onblur = commitSleep;
        inputRefs.set(m.key, sleepInput);

        const mountTimeField = (key, label, placeholder) => {
          const input = pair.createEl("input", {
            cls: "dh-time-input",
            attr: { type: "text", maxlength: "5", placeholder, "aria-label": label }
          });

          const savedVal = typeof note[key] === "string" ? note[key].trim() : "";
          const hasDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, key);
          input.value = hasDraft ? uiDrafts.inputs[key] : savedVal;

          if (uiDrafts.errors[key]) {
            showError(uiDrafts.errors[key]);
          } else if (uiDrafts.savedStamp[key] && Date.now() - uiDrafts.savedStamp[key] < 2200) {
            statusSpan.setText("✓");
            setTimeout(() => { if (statusSpan.isConnected) statusSpan.setText(""); }, 1800);
          }

          input.onfocus = () => { uiDrafts.activeKey = key; };
          input.oninput = () => {
            uiDrafts.inputs[key] = input.value;
            if (uiDrafts.errors[key]) clearError(key);
          };
          input.onkeydown = e => {
            if (e.key === "Enter") {
              e.preventDefault();
              input.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              delete uiDrafts.inputs[key];
              clearError(key);
              input.value = savedVal;
              input.blur();
            }
          };

          let isSavingTime = false;
          const commitTime = async () => {
            if (isSavingTime) return;
            if (uiDrafts.activeKey === key) uiDrafts.activeKey = null;

            const raw = input.value.trim();
            if (raw === "") {
              delete uiDrafts.inputs[key];
              clearError(key);
              if (savedVal === "") return;
              isSavingTime = true;
              try {
                await saveField(key, null);
                flashSaved(key);
              } catch (err) {
                notify(`Ошибка очистки «${label}»: ${err?.message ?? err}`);
              } finally {
                isSavingTime = false;
              }
              return;
            }

            const normalized = normalizeTimeString(raw);
            if (!normalized) {
              const msg = "Формат ЧЧ:ММ";
              uiDrafts.errors[key] = msg;
              showError(msg);
              return;
            }

            input.value = normalized;
            delete uiDrafts.inputs[key];
            clearError(key);
            if (normalized === savedVal) return;

            isSavingTime = true;
            try {
              const counterpartKey = key === "отбой" ? "подъём" : "отбой";
              const counterpartInputVal = inputRefs.get(counterpartKey)?.value?.trim() || "";
              const counterpartVal = normalizeTimeString(counterpartInputVal)
                || (typeof note[counterpartKey] === "string" ? note[counterpartKey].trim() : "");
              const otboy = key === "отбой" ? normalized : counterpartVal;
              const podjom = key === "подъём" ? normalized : counterpartVal;
              const autoSleep = computeSleepDurationHours(otboy, podjom);

              let autoSleepHabit = null;
              if (autoSleep !== null) {
                autoSleepHabit = autoSleep > AUTO_SLEEP_MIN_HOURS;
                if (manualOverrides.режим_сна === undefined) {
                  states.set("режим_сна", autoSleepHabit);
                  habitPainters.get("режим_сна")?.();
                  updateHabitsSummary();
                }
              }

              await enqueueFrontMatterSave(file, fm => {
                fm[key] = normalized;
                if (autoSleep !== null) {
                  fm["сон_часов"] = autoSleep;
                  if (autoSleepHabit !== null && manualOverrides.режим_сна === undefined) {
                    fm["режим_сна"] = autoSleepHabit;
                  }
                }
              });

              if (autoSleep !== null) {
                sleepInput.value = formatNumForInput(autoSleep, 1);
                syncMetricInputWidth(sleepInput, m.placeholder);
              }

              flashSaved(key);
            } catch (err) {
              uiDrafts.inputs[key] = raw;
              notify(`Ошибка сохранения «${label}»: ${err?.message ?? err}`);
            } finally {
              isSavingTime = false;
            }
          };

          input.onchange = commitTime;
          input.onblur = commitTime;
          inputRefs.set(key, input);
        };

        mountTimeField("отбой", "Отбой", "23:30");
        pair.createSpan({ cls: "dh-sleep-sep", text: "→" });
        mountTimeField("подъём", "Подъём", "07:15");
      };

      // РЯД 1: Вес, Калории, Чтение, Сон (span 2)
      renderInputMetricCard(INPUT_METRICS[0]);

      {
        const calCard = metricsGrid.createDiv({
          cls: "dh-metric-item is-clickable",
          attr: {
            role: "button",
            tabindex: "0",
            title: "Нажми, чтобы открыть дневник питания и добавить приём пищи"
          }
        });
        const top = calCard.createDiv({ cls: "dh-metric-top" });
        top.createSpan({ cls: "dh-metric-label", text: "Калории" });
        top.createSpan({
          cls: "dh-metric-status dh-metric-plus",
          text: "+"
        });

        const control = calCard.createDiv({ cls: "dh-metric-control" });
        control.createSpan({
          cls: "dh-metric-readonly-val",
          text: savedCalories !== null ? String(Math.round(savedCalories)) : "—"
        });
        control.createSpan({
          cls: "dh-metric-unit",
          text: calorieGoal !== null ? `/ ${calorieGoal}` : "ккал"
        });

        if (savedProtein !== null || savedFat !== null || savedCarbs !== null) {
          calCard.createDiv({
            cls: "dh-metric-subhint",
            text: `Б ${Math.round(savedProtein || 0)} · Ж ${Math.round(savedFat || 0)} · У ${Math.round(savedCarbs || 0)}`
          });
        }

        calCard.onclick = () => openNutritionFromHome();
        calCard.onkeydown = e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openNutritionFromHome();
          }
        };
      }

      renderInputMetricCard(INPUT_METRICS[2]);
      renderSleepUnifiedCard(INPUT_METRICS[1]);

      // РЯД 2: Фокус, Соцсети, Шаги
      {
        const focusPlugin = getFocusPlugin();
        const activeSession = focusPlugin?.session;
        const isRunningNow = isToday && Boolean(activeSession && activeSession.isRunning);

        const focusCard = metricsGrid.createDiv({
          cls: "dh-metric-item is-clickable" + (isRunningNow ? " is-running" : ""),
          attr: {
            role: "button",
            tabindex: "0",
            title: "Нажми, чтобы открыть таймер глубокой работы и выбрать цель дня"
          }
        });
        const top = focusCard.createDiv({ cls: "dh-metric-top" });
        top.createSpan({ cls: "dh-metric-label", text: "Фокус" });
        const statusBadgeEl = top.createSpan({
          cls: "dh-metric-status dh-metric-focus-badge" + (isRunningNow ? " is-live" : ""),
          text: isRunningNow ? "● Идёт" : "+"
        });

        const control = focusCard.createDiv({ cls: "dh-metric-control" });
        const valSpan = control.createSpan({
          cls: "dh-metric-readonly-val",
          text: savedFocus !== null ? String(savedFocus).replace(".", ",") : "—"
        });
        const unitSpan = control.createSpan({
          cls: "dh-metric-unit",
          text: "ч"
        });

        const goalEntries = Object.entries(focusByGoalsMap)
          .map(([k, v]) => [k, Number(v) || 0])
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1]);

        const defaultHint = goalEntries.length > 0
          ? goalEntries.slice(0, 2).map(([k, v]) => `${k}: ${v}м`).join(" · ")
          : "";

        const hintEl = focusCard.createDiv({
          cls: "dh-metric-subhint",
          text: defaultHint,
          attr: { title: goalEntries.map(([k, v]) => `${k}: ${v} мин`).join(", ") }
        });
        if (!defaultHint) hintEl.style.display = "none";

        if (window.__dhHomeFocusTicker) {
          window.clearInterval(window.__dhHomeFocusTicker);
          delete window.__dhHomeFocusTicker;
        }

        const formatStopwatch = (totalSec) => {
          const s = Math.max(0, Math.floor(totalSec));
          const hh = Math.floor(s / 3600);
          const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
          const ss = String(s % 60).padStart(2, "0");
          return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
        };

        const paintRunningState = () => {
          const plugin = getFocusPlugin();
          const curSession = plugin?.session;
          if (!curSession || !curSession.isRunning) {
            if (window.__dhHomeFocusTicker) {
              window.clearInterval(window.__dhHomeFocusTicker);
              delete window.__dhHomeFocusTicker;
            }
            focusCard.classList.remove("is-running");
            statusBadgeEl.classList.remove("is-live");
            statusBadgeEl.setText("+");
            valSpan.setText(savedFocus !== null ? String(savedFocus).replace(".", ",") : "—");
            unitSpan.setText("ч");
            hintEl.setText(defaultHint);
            hintEl.style.display = defaultHint ? "" : "none";
            return;
          }

          let elSec = null;
          if (typeof plugin?.getElapsedSeconds === "function") {
            const v = Number(plugin.getElapsedSeconds());
            if (Number.isFinite(v)) elSec = v;
          }
          if (elSec === null) {
            const startTs = Number(curSession.startAt ?? curSession.startedAt);
            const accSec = Number(curSession.accumulatedSec ?? (Number(curSession.accumulatedMs || 0) / 1000)) || 0;
            if (Number.isFinite(startTs) && startTs > 0) {
              elSec = (Date.now() - startTs) / 1000 + accSec;
            } else if (Number.isFinite(Number(curSession.elapsedSec))) {
              elSec = Number(curSession.elapsedSec);
            } else {
              elSec = 0;
            }
          }
          valSpan.setText(formatStopwatch(elSec));
          unitSpan.setText("");
          statusBadgeEl.classList.add("is-live");
          statusBadgeEl.setText("● Идёт");
          if (curSession.project) {
            hintEl.setText(`Цель: ${curSession.project}`);
            hintEl.style.display = "";
          }
        };

        if (isRunningNow) {
          paintRunningState();
          window.__dhHomeFocusTicker = window.setInterval(() => {
            if (!focusCard.isConnected) {
              window.clearInterval(window.__dhHomeFocusTicker);
              return;
            }
            paintRunningState();
          }, 1000);
        }

        focusCard.onclick = () => openFocusTrackerFromHome();
        focusCard.onkeydown = e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFocusTrackerFromHome();
          }
        };
      }

      renderInputMetricCard(INPUT_METRICS[3]);
      renderInputMetricCard(INPUT_METRICS[4]);

      const bottomGrid = body.createDiv({ cls: "dh-today-bottom-grid" });

      // --- Ближайшие / просроченные дедлайны Учёбы ---
      if (isToday && upcomingDeadlines.length > 0) {
        const dlStrip = bottomGrid.createDiv({ cls: "dh-deadlines-strip" });
        dlStrip.createSpan({ cls: "dh-deadlines-label", text: "Дедлайны" });
        const dlList = dlStrip.createDiv({ cls: "dh-deadlines-list" });

        for (const item of upcomingDeadlines) {
          const stateCls = item.diffDays < 0 ? "is-overdue" : item.diffDays <= 3 ? "is-soon" : "is-upcoming";
          const whenText =
            item.diffDays < 0
              ? `просрочено ${Math.abs(item.diffDays)} дн.`
              : item.diffDays === 0
                ? "сегодня"
                : item.diffDays === 1
                  ? "завтра"
                  : item.diffDays <= 5
                    ? `через ${item.diffDays} дн.`
                    : item.date.toFormat("dd.MM");

          const pill = dlList.createEl("button", {
            cls: `dh-deadline-pill ${stateCls}`,
            attr: {
              type: "button",
              title: `${item.discipline ? item.discipline + " · " : ""}${item.title} (${item.date.toFormat("dd.MM.yyyy")})`
            }
          });
          pill.createSpan({ cls: "dh-deadline-title", text: item.title });
          pill.createSpan({ cls: "dh-deadline-when", text: whenText });
          pill.onclick = e => openStudyProjectFromHome(item.path, e.ctrlKey || e.metaKey);
        }
      }

      // --- План дня (всегда доступен + инлайн-добавление) ---
      {
        const planBox = bottomGrid.createDiv({ cls: "dh-plan-box" });
        const planHead = planBox.createDiv({ cls: "dh-plan-head" });
        planHead.createSpan({ cls: "dh-plan-title", text: "План дня" });
        const planMeta = planHead.createSpan({ cls: "dh-today-row-sub" });

        let barFill = null;
        const itemPainters = [];

        const refreshPlanUI = () => {
          const { totalG, doneG, avgPct } = calcPlanSummary();
          if (totalG > 0) {
            planMeta.setText(`${avgPct}% · выполнено ${doneG} из ${totalG}`);
            if (barFill) {
              barFill.style.width = `${avgPct}%`;
              barFill.style.background = avgPct === 100 ? "var(--color-green, #4aab80)" : avgPct >= 60 ? "var(--color-blue, #599ed6)" : "var(--color-orange, #e5a158)";
            }
          } else {
            planMeta.setText("");
          }
          itemPainters.forEach(fn => fn());
        };

        if (goalsState.length > 0) {
          const barTrack = planBox.createDiv({ cls: "dh-plan-bar-track" });
          barFill = barTrack.createDiv({ cls: "dh-plan-bar-fill" });

          const planList = planBox.createDiv({ cls: "dh-plan-list" });

          goalsState.forEach((goal, idx) => {
            const item = planList.createDiv({
              cls: "dh-plan-item",
              attr: { role: "button", tabindex: "0", title: "Нажми, чтобы отметить задачу выполненной (100% / 0%)" }
            });

            const left = item.createDiv({ cls: "dh-plan-item-left" });
            const check = left.createSpan({ cls: "dh-plan-check" });
            left.createSpan({
              cls: "dh-plan-text",
              text: goal.category ? `${goal.text} (${goal.category})` : goal.text
            });

            const right = item.createDiv({ cls: "dh-plan-item-right" });
            const focusBtn = right.createEl("button", {
              cls: "dh-plan-focus-btn" + (goal.focusMinutes > 0 ? "" : " is-empty"),
              attr: {
                type: "button",
                title: `Запустить фокус-сессию по цели «${goal.text}»`
              }
            });
            if (goal.focusMinutes > 0) {
              focusBtn.setText(`${goal.focusMinutes}м`);
            } else {
              focusBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M10 2h4"/></svg>`;
            }
            focusBtn.onclick = e => {
              e.stopPropagation();
              openFocusTrackerFromHome(goal.text);
            };

            const pctSpan = right.createSpan({ cls: "dh-plan-pct" });

            const paintGoalItem = () => {
              const isDone = goal.progress >= 100;
              item.classList.toggle("is-done", isDone);
              check.setText(isDone ? "✓" : "");
              if (goal.progress > 0 && goal.progress < 100) {
                pctSpan.style.display = "";
                pctSpan.setText(`${goal.progress}%`);
              } else {
                pctSpan.style.display = "none";
              }
            };
            itemPainters.push(paintGoalItem);

            let isTogglingGoal = false;
            const toggleGoal = async () => {
              if (isTogglingGoal) return;
              isTogglingGoal = true;
              const prevProgress = goal.progress;
              goal.progress = prevProgress >= 100 ? 0 : 100;
              refreshPlanUI();

              try {
                await enqueueFrontMatterSave(file, fm => {
                  const fmGoals = Array.isArray(fm.цели_дня) ? fm.цели_дня : [];
                  if (fmGoals[idx] && typeof fmGoals[idx] === "object") {
                    fmGoals[idx].progress = goal.progress;
                  }
                  const total = fmGoals.length;
                  fm.прогресс_дня_процент = total > 0
                    ? Math.round(fmGoals.reduce((acc, g) => acc + (Number(g?.progress) || 0), 0) / total)
                    : 0;
                });
              } catch (err) {
                goal.progress = prevProgress;
                refreshPlanUI();
                notify(`Не удалось обновить задачу: ${err?.message ?? err}`);
              } finally {
                isTogglingGoal = false;
              }
            };

            item.onmousedown = e => e.preventDefault();
            item.onclick = toggleGoal;
            item.onkeydown = e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleGoal();
              }
            };
          });
        }

        // Компактное инлайн-поле добавления задачи дня
        const addRow = planBox.createDiv({ cls: "dh-plan-add-row" });
        const addInput = addRow.createEl("input", {
          cls: "dh-plan-add-input",
          attr: {
            type: "text",
            placeholder: "+ Добавить задачу дня…",
            "aria-label": "Добавить задачу дня"
          }
        });
        const addBtn = addRow.createEl("button", {
          cls: "dh-plan-add-btn",
          text: "+",
          attr: { type: "button", title: "Добавить задачу в план дня", "aria-label": "Добавить задачу" }
        });

        let isAddingGoal = false;
        const commitNewGoal = async () => {
          if (isAddingGoal) return;
          const text = addInput.value.trim();
          if (!text) return;
          isAddingGoal = true;
          addBtn.disabled = true;
          try {
            await enqueueFrontMatterSave(file, fm => {
              if (!Array.isArray(fm.цели_дня)) fm.цели_дня = [];
              fm.цели_дня.push({
                text,
                category: "",
                progress: 0,
                focus_minutes: 0
              });
              const total = fm.цели_дня.length;
              fm.прогресс_дня_процент = total > 0
                ? Math.round(fm.цели_дня.reduce((acc, g) => acc + (Number(g?.progress) || 0), 0) / total)
                : 0;
            });
            addInput.value = "";
            scheduleHomeRender(60);
          } catch (err) {
            notify(`Не удалось добавить задачу: ${err?.message ?? err}`);
          } finally {
            isAddingGoal = false;
            if (addBtn.isConnected) addBtn.disabled = false;
          }
        };

        addBtn.onmousedown = e => e.preventDefault();
        addBtn.onclick = () => { void commitNewGoal(); };
        addInput.onkeydown = e => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitNewGoal();
          } else if (e.key === "Escape") {
            addInput.value = "";
            addInput.blur();
          }
        };

        refreshPlanUI();
      }

      // --- Главное событие ---
      const eventRow = bottomGrid.createDiv({ cls: "dh-event-row" });
      const eventLabelWrap = eventRow.createDiv({ cls: "dh-today-row-label" });
      eventLabelWrap.createSpan({ text: "Главное событие" });
      const eventStatus = eventLabelWrap.createSpan({ cls: "dh-today-row-sub" });

      const eventControl = eventRow.createDiv({ cls: "dh-event-control" });
      const savedEvent = typeof note.главное_событие === "string" ? note.главное_событие.trim() : "";
      const hasEventDraft = Object.prototype.hasOwnProperty.call(uiDrafts.inputs, "главное_событие");

      const eventInput = eventControl.createEl("input", {
        cls: "dh-event-input",
        attr: {
          type: "text",
          placeholder: "Коротко запиши главное событие или итог дня…",
          "aria-label": "Главное событие дня"
        }
      });
      eventInput.value = hasEventDraft ? uiDrafts.inputs["главное_событие"] : savedEvent;

      if (uiDrafts.savedStamp["главное_событие"] && Date.now() - uiDrafts.savedStamp["главное_событие"] < 2200) {
        eventStatus.setText("✓");
        eventStatus.style.color = "var(--color-green, #4aab80)";
        setTimeout(() => { if (eventStatus.isConnected) eventStatus.setText(""); }, 1800);
      }

      eventInput.onfocus = () => { uiDrafts.activeKey = "главное_событие"; };
      eventInput.oninput = () => {
        uiDrafts.inputs["главное_событие"] = eventInput.value;
        uiDrafts.selectionStart = eventInput.selectionStart;
        uiDrafts.selectionEnd = eventInput.selectionEnd;
      };
      eventInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          eventInput.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          delete uiDrafts.inputs["главное_событие"];
          eventInput.value = savedEvent;
          eventInput.blur();
        }
      };

      let isSavingEvent = false;
      const commitEvent = async () => {
        if (isSavingEvent) return;
        if (uiDrafts.activeKey === "главное_событие") uiDrafts.activeKey = null;

        const nextEvent = eventInput.value.trim();
        eventInput.value = nextEvent;
        delete uiDrafts.inputs["главное_событие"];

        if (nextEvent === savedEvent) return;

        isSavingEvent = true;
        try {
          await saveField("главное_событие", nextEvent === "" ? null : nextEvent);
          uiDrafts.savedStamp["главное_событие"] = Date.now();
          eventStatus.setText("✓");
          eventStatus.style.color = "var(--color-green, #4aab80)";
        } catch (err) {
          uiDrafts.inputs["главное_событие"] = nextEvent;
          notify(`Не удалось сохранить главное событие: ${err?.message ?? err}`);
        } finally {
          isSavingEvent = false;
        }
      };

      eventInput.onchange = commitEvent;
      eventInput.onblur = commitEvent;
      inputRefs.set("главное_событие", eventInput);

      if (uiDrafts.activeKey && inputRefs.has(uiDrafts.activeKey)) {
        const targetInput = inputRefs.get(uiDrafts.activeKey);
        requestAnimationFrame(() => {
          if (!targetInput.isConnected) return;
          targetInput.focus({ preventScroll: true });
          if (typeof uiDrafts.selectionStart === "number" && typeof uiDrafts.selectionEnd === "number") {
            try { targetInput.setSelectionRange(uiDrafts.selectionStart, uiDrafts.selectionEnd); } catch {}
          }
        });
      }

      if (trainings.length > 0 || (savedFocus !== null && savedFocus > 0)) {
        const footer = body.createDiv({ cls: "dh-today-footer" });
        const trLeft = footer.createDiv({ cls: "dh-footer-trainings" });

        if (trainings.length > 0) {
          trLeft.createSpan({
            cls: "dh-footer-label",
            text: `Тренировки (${trainings.length}):`
          });
          trainings.forEach(p => {
            const a = trLeft.createEl("a", {
              cls: "internal-link dh-training-pill",
              text: p.название_тренировки || p.file.name,
              attr: { href: p.file.path }
            });
            a.onclick = e => {
              e.preventDefault();
              app.workspace.openLinkText(p.file.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
            };
          });
        }

        if (savedFocus !== null && savedFocus > 0) {
          const fPill = trLeft.createEl("button", {
            cls: "dh-training-pill is-focus",
            text: `Фокус: ${String(savedFocus).replace(".", ",")} ч`,
            attr: { type: "button", title: "Открыть таймер глубокой работы" }
          });
          fPill.onclick = () => openFocusTrackerFromHome();
        }

        if (trainings.length > 0 && states.get("тренировка") !== true) {
          const syncBtn = actionButton(footer, "Вернуть отметку тренировки", async () => {
            setManualHabitOverride("тренировка", true, selectedISO);
            await saveField("тренировка", true);
            states.set("тренировка", true);
            habitPainters.get("тренировка")?.();
            updateHabitsSummary();
            syncBtn.remove();
          }, "dh-link-btn");
        }
      }
    }
  }

  // ========================================================
  // 2.5. ОСТРОВ «ЦЕННОСТИ» (ЕЖЕДНЕВНЫЙ ВВОД + МОСТ ИЗ ТРЕНИРОВОК/ФОКУСА)
  // ========================================================
  {
    const vcPlugin = getValuesCompassPlugin();
    const vcStore = vcPlugin?.store;

    if (vcStore) {
      const activeISO =
        typeof window.__dhHomeSelectedDateISO === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(window.__dhHomeSelectedDateISO)
          ? window.__dhHomeSelectedDateISO
          : todayISO;
      const isSelectedToday = activeISO === todayISO;

      const visibleDomains = vcStore.getDomains(false) || [];
      const focusDomains = vcStore.getFocusDomains() || [];
      const dayLogs = vcStore.getLogsByDate(activeISO) || [];
      const daySavoring = vcStore.getSavoringByDate(activeISO);

      if (!window.__dhValuesHomeUi) {
        window.__dhValuesHomeUi = { selectedDomainId: "", isNewStep: false };
      }
      const vcUi = window.__dhValuesHomeUi;

      if (!visibleDomains.some(d => d.id === vcUi.selectedDomainId)) {
        const fallback = focusDomains[0] || visibleDomains[0];
        vcUi.selectedDomainId = fallback ? fallback.id : "";
      }

      const root = dv.container.createDiv({ cls: "dh dh-values-island" });

      // --- Шапка ---
      const head = root.createDiv({ cls: "dhv-head" });
      const headLeft = head.createDiv({ cls: "dhv-head-left" });
      headLeft.createSpan({ cls: "dhv-title", text: "Ценности" });

      if (dayLogs.length > 0) {
        headLeft.createSpan({
          cls: "dhv-count-pill",
          text: String(dayLogs.length),
          attr: { title: "Записано действий за выбранный день" }
        });
      }
      if (!isSelectedToday) {
        const [yy, mm, dd] = activeISO.split("-");
        headLeft.createSpan({
          cls: "dhv-date-note",
          text: `за ${dd}.${mm}.${yy}`
        });
      }

      const nav = head.createDiv({ cls: "dhv-nav" });

      const mapBtn = nav.createEl("button", {
        cls: "dhv-btn dhv-nav-link",
        text: "Карта",
        attr: { type: "button", title: "Открыть Карту сфер и целей" }
      });
      mapBtn.onclick = () => openValuesCompassFromHome("map");

      const analyticsBtn = nav.createEl("button", {
        cls: "dhv-btn dhv-nav-link",
        text: "Динамика",
        attr: { type: "button", title: "Открыть Динамику и ритм" }
      });
      analyticsBtn.onclick = () => openValuesCompassFromHome("analytics");

      // --- Полоска активного фокуса ---
      if (focusDomains.length > 0) {
        const focusGrid = root.createDiv({ cls: "dhv-focus-list" });
        for (const domain of focusDomains) {
          const fCard = focusGrid.createDiv({ cls: "dhv-focus-card" });

          const fTop = fCard.createDiv({
            cls: "dhv-focus-top",
            attr: { title: "Открыть сферу на Карте" }
          });
          const nameWrap = fTop.createDiv({ cls: "dhv-focus-name-wrap" });
          nameWrap.createSpan({ cls: "dhv-focus-dot" });
          nameWrap.createSpan({ cls: "dhv-focus-name", text: domain.name });
          fTop.createSpan({ cls: "dhv-focus-arrow", text: "↗" });
          fTop.onclick = () => openValuesCompassFromHome("map", domain.id);

          if (domain.compassSummary) {
            fCard.createDiv({ cls: "dhv-focus-summary", text: domain.compassSummary });
          }

          const pendingSteps = [];
          const domainGoals = (vcStore.getGoalsByDomain(domain.id) || []).filter(
            g => g.status === "active" && (g.horizon === "immediate" || g.horizon === "short")
          );
          for (const g of domainGoals) {
            for (const s of g.steps || []) {
              if (!s.done) pendingSteps.push({ goal: g, step: s });
            }
          }

          if (pendingSteps.length > 0) {
            const stepsWrap = fCard.createDiv({ cls: "dhv-focus-steps" });
            for (const { goal, step } of pendingSteps.slice(0, 4)) {
              const label = stepsWrap.createEl("label", { cls: "dhv-step-item" });
              const cb = label.createEl("input", { attr: { type: "checkbox" } });
              label.createSpan({ text: step.text });
              cb.onchange = async () => {
                const nowDone = await vcStore.toggleGoalStep(goal.id, step.id);
                if (nowDone) {
                  await vcStore.addLog({
                    domainId: domain.id,
                    goalId: goal.id,
                    text: step.text,
                    isNewStep: false,
                    date: activeISO
                  });
                  notify("Шаг выполнен и записан в ценности");
                }
              };
            }
          }
        }
      }

      // --- Быстрый ввод действия ---
      if (visibleDomains.length > 0) {
        const composer = root.createDiv({ cls: "dhv-composer" });
        const row = composer.createDiv({ cls: "dhv-composer-row" });

        const actionInput = row.createEl("input", {
          cls: "dhv-input",
          attr: {
            type: "text",
            placeholder: isSelectedToday
              ? "Что сделал сегодня в согласии со своими ценностями?"
              : "Записать ценностное действие за этот день..."
          }
        });

        const newStepBtn = row.createEl("button", {
          cls: "dhv-btn dhv-chip dhv-newstep-btn" + (vcUi.isNewStep ? " is-active" : ""),
          attr: { type: "button", title: "Отметить, если попробовал что-то новое" }
        });
        newStepBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg><span>Новый шаг</span>`;
        newStepBtn.onclick = () => {
          vcUi.isNewStep = !vcUi.isNewStep;
          newStepBtn.classList.toggle("is-active", vcUi.isNewStep);
        };

        const submitBtn = row.createEl("button", {
          cls: "dhv-btn dhv-submit-btn",
          attr: { type: "button", "aria-label": "Записать действие" }
        });
        submitBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

        const commitAction = async () => {
          const text = actionInput.value.trim();
          if (!text || !vcUi.selectedDomainId) return;
          actionInput.value = "";
          const isNew = vcUi.isNewStep;
          vcUi.isNewStep = false;
          await vcStore.addLog({
            domainId: vcUi.selectedDomainId,
            text,
            isNewStep: isNew,
            date: activeISO
          });
        };

        submitBtn.onclick = () => { void commitAction(); };
        actionInput.onkeydown = e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void commitAction();
          }
        };

        // Чипы сфер (фокусные первыми)
        const sortedDomains = [...visibleDomains].sort((a, b) =>
          a.isFocus === b.isFocus ? 0 : a.isFocus ? -1 : 1
        );
        const chipsWrap = composer.createDiv({ cls: "dhv-chips-strip" });
        for (const domain of sortedDomains) {
          const chip = chipsWrap.createEl("button", {
            cls: "dhv-btn dhv-chip" + (domain.id === vcUi.selectedDomainId ? " is-active" : ""),
            attr: { type: "button" }
          });
          if (domain.isFocus) chip.createSpan({ cls: "dhv-focus-dot" });
          chip.createSpan({ text: domain.name });
          chip.onclick = () => {
            vcUi.selectedDomainId = domain.id;
            chipsWrap.querySelectorAll(".dhv-chip").forEach(el => el.classList.remove("is-active"));
            chip.classList.add("is-active");
          };
        }

        // Тихие 1-тап подсказки из уже выполненных за этот день тренировок и фокус-сессий
        const activeNote = isSelectedToday ? todayNote : findDiaryNote(activeISO);
        const activeFile = activeNote ? app.vault.getAbstractFileByPath(activeNote.file.path) : null;
        const activeFm = activeFile ? (app.metadataCache.getFileCache(activeFile)?.frontmatter || {}) : {};
        const activeTrainings = isSelectedToday ? trainingsTodayList : getTrainingsByDate(activeISO);

        const rawSuggestions = [];
        for (const tr of activeTrainings) {
          const trName = String(tr.название_тренировки || tr.file.name).trim();
          rawSuggestions.push({
            kind: "training",
            label: trName,
            text: `Тренировка: ${trName}`
          });
        }

        const focusMap = (activeFm.фокус_по_целям && typeof activeFm.фокус_по_целям === "object")
          ? activeFm.фокус_по_целям
          : {};
        const focusEntries = Object.entries(focusMap)
          .map(([k, v]) => [String(k).trim(), Math.round(Number(v) || 0)])
          .filter(([k, v]) => k && v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        if (focusEntries.length > 0) {
          for (const [goalName, mins] of focusEntries) {
            rawSuggestions.push({
              kind: "focus",
              label: `${goalName} · ${mins}м`,
              text: `Фокус: ${goalName} (${mins} мин)`
            });
          }
        } else {
          const fHours = parseNum(activeNote?.глубокая_работа_часов);
          if (fHours !== null && fHours > 0) {
            const hStr = String(fHours).replace(".", ",");
            rawSuggestions.push({
              kind: "focus",
              label: `Фокус · ${hStr} ч`,
              text: `Глубокая работа (${hStr} ч)`
            });
          }
        }

        const existingLower = dayLogs.map(l => String(l.text || "").trim().toLowerCase());
        const pendingSuggestions = rawSuggestions.filter(s => {
          const tLow = s.text.toLowerCase();
          const lLow = s.label.toLowerCase();
          return !existingLower.some(e => e === tLow || e.includes(lLow));
        });

        if (pendingSuggestions.length > 0) {
          const healthDomain = visibleDomains.find(d => /здоров|спорт|тело|физ/i.test(d.name));
          const sugStrip = composer.createDiv({ cls: "dhv-suggest-strip" });
          sugStrip.createSpan({ cls: "dhv-suggest-label", text: "Из дня:" });

          for (const sug of pendingSuggestions) {
            const targetDomainId =
              sug.kind === "training" && healthDomain ? healthDomain.id : vcUi.selectedDomainId;
            const targetDomainName =
              visibleDomains.find(d => d.id === targetDomainId)?.name || "выбранную сферу";

            const sBtn = sugStrip.createEl("button", {
              cls: "dhv-btn dhv-suggest-chip",
              text: `+ ${sug.label}`,
              attr: {
                type: "button",
                title: `В 1 тап записать «${sug.text}» в сферу «${targetDomainName}»`
              }
            });
            sBtn.onclick = async () => {
              sBtn.disabled = true;
              try {
                await vcStore.addLog({
                  domainId: targetDomainId,
                  text: sug.text,
                  isNewStep: false,
                  date: activeISO
                });
              } catch (err) {
                if (sBtn.isConnected) sBtn.disabled = false;
                notify("Не удалось записать действие: " + (err?.message ?? err));
              }
            };
          }
        }
      }

      // --- Список действий за день ---
      if (dayLogs.length > 0) {
        const logsWrap = root.createDiv({ cls: "dhv-logs" });
        for (const entry of dayLogs) {
          const domain = vcStore.getDomainById(entry.domainId);
          const item = logsWrap.createDiv({ cls: "dhv-log-item" });

          const body = item.createDiv({ cls: "dhv-log-body" });
          body.createSpan({ cls: "dhv-tag", text: domain?.name || "Сфера" });
          if (entry.isNewStep) {
            body.createSpan({ cls: "dhv-newstep-tag", text: "Новый шаг" });
          }
          body.createSpan({ cls: "dhv-log-text", text: entry.text });

          const delBtn = item.createEl("button", {
            cls: "dhv-btn dhv-icon-btn dhv-log-del",
            attr: { type: "button", title: "Удалить запись" }
          });
          delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
          delBtn.onclick = () => { void vcStore.deleteLog(entry.id); };
        }
      }

      // --- Момент присутствия ---
      const savRow = root.createDiv({ cls: "dhv-savoring-row" });
      const savLabel = savRow.createDiv({ cls: "dhv-savoring-label" });
      savLabel.createSpan({ text: "Момент присутствия" });
      const savSaved = savLabel.createSpan({ cls: "dhv-savoring-saved" });

      const savInput = savRow.createEl("input", {
        cls: "dhv-input",
        attr: {
          type: "text",
          placeholder: "Что сегодня удалось по-настоящему заметить или прожить…"
        }
      });
      savInput.value = daySavoring?.text || "";

      const commitSavoring = async () => {
        const next = savInput.value.trim();
        const prev = daySavoring?.text || "";
        if (next === prev) return;
        await vcStore.saveSavoring(next, activeISO);
        savSaved.setText("✓");
        setTimeout(() => { if (savSaved.isConnected) savSaved.setText(""); }, 1600);
      };

      savInput.onblur = () => { void commitSavoring(); };
      savInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          savInput.blur();
        } else if (e.key === "Escape") {
          savInput.value = daySavoring?.text || "";
          savInput.blur();
        }
      };
    }
  }

  // ========================================================
  // 3. ОСТРОВ «БЫСТРЫЙ ДОСТУП» (СВОРАЧИВАЕМЫЙ, _system/home-pins.json)
  // ========================================================
  {
    const PINS_FILE_PATH = "_system/home-pins.json";
    const PIN_COLORS = [
      { id: "accent", label: "Акцент", css: "var(--interactive-accent)" },
      { id: "blue", label: "Синий", css: "var(--color-blue, #599ed6)" },
      { id: "cyan", label: "Бирюзовый", css: "var(--color-cyan, #69b5aa)" },
      { id: "green", label: "Зелёный", css: "var(--color-green, #4aab80)" },
      { id: "orange", label: "Оранжевый", css: "var(--color-orange, #e5a158)" },
      { id: "purple", label: "Фиолетовый", css: "var(--color-purple, #9c83e8)" },
      { id: "red", label: "Красный", css: "var(--color-red, #d85b57)" }
    ];
    const colorById = id => (PIN_COLORS.find(c => c.id === id) || PIN_COLORS[0]).css;

    if (!window.__dhHomePinsState) {
      window.__dhHomePinsState = {
        loaded: false,
        loading: false,
        items: [],
        collapsed: true,
        editMode: false,
        formOpen: false,
        editingId: null,
        activeGroup: "all",
        draftColor: "accent"
      };
    }
    const pinState = window.__dhHomePinsState;

    async function ensurePinsFolder() {
      const parts = PINS_FILE_PATH.split("/");
      parts.pop();
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        if (!(await app.vault.adapter.exists(acc))) {
          await app.vault.adapter.mkdir(acc);
        }
      }
    }

    async function persistPins() {
      try {
        await ensurePinsFolder();
        await app.vault.adapter.write(
          PINS_FILE_PATH,
          JSON.stringify({ version: 1, items: pinState.items }, null, 2)
        );
      } catch (err) {
        notify("Не удалось сохранить закладки: " + (err?.message || err));
      }
    }

    if (!pinState.loaded && !pinState.loading) {
      pinState.loading = true;
      (async () => {
        try {
          if (await app.vault.adapter.exists(PINS_FILE_PATH)) {
            const raw = await app.vault.adapter.read(PINS_FILE_PATH);
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.items)) {
              pinState.items = parsed.items;
            }
          }
        } catch (err) {
          console.log("[Home Pins] Load error:", err);
        } finally {
          pinState.loaded = true;
          pinState.loading = false;
          scheduleHomeRender(30);
        }
      })();
    }

    const isExpanded = !pinState.collapsed || pinState.formOpen || pinState.editMode;
    const root = dv.container.createDiv({
      cls: "dh dh-pins-island" + (isExpanded ? "" : " is-collapsed")
    });

    // --- Шапка ---
    const head = root.createDiv({ cls: "dhp-head" });
    const headToggle = head.createEl("button", {
      cls: "dhp-btn dhp-head-toggle",
      attr: {
        type: "button",
        "aria-expanded": String(isExpanded),
        title: isExpanded ? "Свернуть быстрый доступ" : "Развернуть быстрый доступ"
      }
    });
    const chev = headToggle.createSpan({ cls: "dhp-chevron" });
    chev.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    headToggle.createSpan({ cls: "dhp-title", text: "Быстрый доступ" });
    if (pinState.items.length > 0) {
      headToggle.createSpan({ cls: "dhp-count", text: String(pinState.items.length) });
    }
    headToggle.onclick = () => {
      pinState.collapsed = isExpanded;
      if (pinState.collapsed) {
        pinState.editMode = false;
        pinState.formOpen = false;
        pinState.editingId = null;
      }
      renderHomeDashboard();
    };

    const headActions = head.createDiv({ cls: "dhp-head-actions" });

    if (isExpanded && pinState.items.length > 0) {
      const editToggle = headActions.createEl("button", {
        cls: "dhp-btn dhp-action-btn" + (pinState.editMode ? " is-active" : ""),
        text: pinState.editMode ? "Готово" : "Изменить",
        attr: { type: "button" }
      });
      editToggle.onclick = () => {
        pinState.editMode = !pinState.editMode;
        if (!pinState.editMode) {
          pinState.formOpen = false;
          pinState.editingId = null;
        }
        renderHomeDashboard();
      };
    }

    const addBtn = headActions.createEl("button", {
      cls: "dhp-btn dhp-action-btn" + (pinState.formOpen && !pinState.editingId ? " is-active" : ""),
      text: "+ Заметка",
      attr: { type: "button" }
    });
    addBtn.onclick = () => {
      if (pinState.formOpen && !pinState.editingId) {
        pinState.formOpen = false;
      } else {
        pinState.collapsed = false;
        pinState.formOpen = true;
        pinState.editingId = null;
        pinState.draftColor = "accent";
      }
      renderHomeDashboard();
    };

    if (isExpanded) {
      // --- Форма добавления / редактирования ---
      if (pinState.formOpen) {
        const editingItem = pinState.editingId
          ? pinState.items.find(i => i.id === pinState.editingId) || null
          : null;
        if (editingItem) pinState.draftColor = editingItem.color || "accent";

        const form = root.createDiv({ cls: "dhp-form" });
        const row1 = form.createDiv({ cls: "dhp-form-row" });

        const suggestWrap = row1.createDiv({ cls: "dhp-suggest-wrap" });
        const pathInput = suggestWrap.createEl("input", {
          cls: "dhp-input",
          attr: { type: "text", placeholder: "Найти заметку в хранилище…" }
        });
        pathInput.value = editingItem?.path || "";

        const titleInput = row1.createEl("input", {
          cls: "dhp-input",
          attr: { type: "text", placeholder: "Название на карточке" }
        });
        titleInput.value = editingItem?.title || "";

        const suggestList = suggestWrap.createDiv({ cls: "dhp-suggest-list" });
        suggestList.style.display = "none";

        const updateSuggestions = () => {
          const q = pathInput.value.trim().toLowerCase();
          const files = app.vault.getMarkdownFiles();
          const matches = (q
            ? files.filter(f =>
                f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
              )
            : files
          )
            .sort((a, b) => {
              if (q) {
                const aStarts = a.basename.toLowerCase().startsWith(q) ? 0 : 1;
                const bStarts = b.basename.toLowerCase().startsWith(q) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
              }
              return (b.stat?.mtime || 0) - (a.stat?.mtime || 0);
            })
            .slice(0, 6);

          suggestList.replaceChildren();
          if (matches.length === 0) {
            suggestList.style.display = "none";
            return;
          }

          matches.forEach(file => {
            const opt = suggestList.createDiv({ cls: "dhp-suggest-item" });
            opt.createDiv({ cls: "dhp-suggest-name", text: file.basename });
            opt.createDiv({ cls: "dhp-suggest-path", text: file.path });
            opt.onmousedown = e => {
              e.preventDefault();
              pathInput.value = file.path;
              if (!titleInput.value.trim()) titleInput.value = file.basename;
              suggestList.style.display = "none";
              titleInput.focus();
            };
          });
          suggestList.style.display = "block";
        };

        pathInput.onfocus = updateSuggestions;
        pathInput.oninput = updateSuggestions;
        pathInput.onblur = () => {
          setTimeout(() => { if (suggestList.isConnected) suggestList.style.display = "none"; }, 120);
        };

        const row2 = form.createDiv({ cls: "dhp-form-row-meta" });
        const groupInput = row2.createEl("input", {
          cls: "dhp-input",
          attr: { type: "text", placeholder: "Группа (например: Dev, Учёба)" }
        });
        groupInput.value = editingItem?.group || "";

        const colorsWrap = row2.createDiv({ cls: "dhp-colors" });
        PIN_COLORS.forEach(col => {
          const sw = colorsWrap.createEl("button", {
            cls: "dhp-btn dhp-swatch" + (pinState.draftColor === col.id ? " is-active" : ""),
            attr: { type: "button", title: col.label }
          });
          sw.style.setProperty("--swatch-color", col.css);
          sw.onclick = () => {
            pinState.draftColor = col.id;
            colorsWrap.querySelectorAll(".dhp-swatch").forEach(el => el.classList.remove("is-active"));
            sw.classList.add("is-active");
          };
        });

        const footer = form.createDiv({ cls: "dhp-form-footer" });
        const cancelBtn = footer.createEl("button", {
          cls: "dhp-btn dhp-btn-normal",
          text: "Отмена",
          attr: { type: "button" }
        });
        cancelBtn.onclick = () => {
          pinState.formOpen = false;
          pinState.editingId = null;
          renderHomeDashboard();
        };

        const saveBtn = footer.createEl("button", {
          cls: "dhp-btn dhp-btn-cta",
          text: editingItem ? "Сохранить" : "Добавить",
          attr: { type: "button" }
        });

        const submitPin = async () => {
          const pathVal = pathInput.value.trim();
          const titleVal = titleInput.value.trim() || pathVal.replace(/\.md$/i, "").split("/").pop() || "";
          if (!pathVal || !titleVal) {
            notify("Выбери заметку и укажи название");
            return;
          }

          const payload = {
            id: editingItem ? editingItem.id : "pin_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
            title: titleVal,
            path: pathVal,
            group: groupInput.value.trim(),
            color: pinState.draftColor || "accent"
          };

          if (editingItem) {
            const idx = pinState.items.findIndex(i => i.id === editingItem.id);
            if (idx !== -1) pinState.items[idx] = payload;
          } else {
            pinState.items.push(payload);
          }

          pinState.formOpen = false;
          pinState.editingId = null;
          await persistPins();
          renderHomeDashboard();
        };

        saveBtn.onclick = () => { void submitPin(); };
        titleInput.onkeydown = e => {
          if (e.key === "Enter") { e.preventDefault(); void submitPin(); }
        };
        groupInput.onkeydown = e => {
          if (e.key === "Enter") { e.preventDefault(); void submitPin(); }
        };

        requestAnimationFrame(() => {
          if (editingItem) titleInput.focus();
          else pathInput.focus();
        });
      }

      // --- Группы-фильтры ---
      const uniqueGroups = [...new Set(pinState.items.map(i => i.group).filter(Boolean))];
      if (pinState.activeGroup !== "all" && !uniqueGroups.includes(pinState.activeGroup)) {
        pinState.activeGroup = "all";
      }

      if (uniqueGroups.length > 0) {
        const groupsRow = root.createDiv({ cls: "dhp-groups" });
        const allChip = groupsRow.createEl("button", {
          cls: "dhp-btn dhp-chip" + (pinState.activeGroup === "all" ? " is-active" : ""),
          text: "Все",
          attr: { type: "button" }
        });
        allChip.onclick = () => {
          pinState.activeGroup = "all";
          renderHomeDashboard();
        };

        uniqueGroups.forEach(grp => {
          const chip = groupsRow.createEl("button", {
            cls: "dhp-btn dhp-chip" + (pinState.activeGroup === grp ? " is-active" : ""),
            text: grp,
            attr: { type: "button" }
          });
          chip.onclick = () => {
            pinState.activeGroup = grp;
            renderHomeDashboard();
          };
        });
      }

      // --- Сетка карточек ---
      const visiblePins = pinState.activeGroup === "all"
        ? pinState.items
        : pinState.items.filter(i => i.group === pinState.activeGroup);

      if (pinState.items.length === 0 && !pinState.formOpen) {
        root.createDiv({
          cls: "dhp-empty",
          text: "Закрепи заметки, к которым часто возвращаешься (например, команды релиза плагинов)."
        });
      } else if (visiblePins.length > 0) {
        const grid = root.createDiv({ cls: "dhp-grid" });

        visiblePins.forEach(item => {
          const card = grid.createDiv({
            cls: "dhp-card",
            attr: { title: item.path }
          });
          card.style.setProperty("--pin-color", colorById(item.color));

          card.onclick = e => {
            if (pinState.editMode) return;
            app.workspace.openLinkText(item.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
          };

          const main = card.createDiv({ cls: "dhp-card-main" });
          main.createSpan({ cls: "dhp-card-dot" });

          const textWrap = main.createDiv({ cls: "dhp-card-text" });
          textWrap.createDiv({ cls: "dhp-card-title", text: item.title });
          if (item.group && pinState.activeGroup === "all") {
            textWrap.createDiv({ cls: "dhp-card-sub", text: item.group });
          }

          if (pinState.editMode) {
            const tools = card.createDiv({ cls: "dhp-card-tools" });
            const fullIdx = pinState.items.findIndex(x => x.id === item.id);

            if (fullIdx > 0) {
              const leftBtn = tools.createEl("button", {
                cls: "dhp-btn dhp-icon-btn",
                text: "‹",
                attr: { type: "button", title: "Сдвинуть влево" }
              });
              leftBtn.onclick = async e => {
                e.stopPropagation();
                const tmp = pinState.items[fullIdx - 1];
                pinState.items[fullIdx - 1] = pinState.items[fullIdx];
                pinState.items[fullIdx] = tmp;
                await persistPins();
                renderHomeDashboard();
              };
            }

            if (fullIdx !== -1 && fullIdx < pinState.items.length - 1) {
              const rightBtn = tools.createEl("button", {
                cls: "dhp-btn dhp-icon-btn",
                text: "›",
                attr: { type: "button", title: "Сдвинуть вправо" }
              });
              rightBtn.onclick = async e => {
                e.stopPropagation();
                const tmp = pinState.items[fullIdx + 1];
                pinState.items[fullIdx + 1] = pinState.items[fullIdx];
                pinState.items[fullIdx] = tmp;
                await persistPins();
                renderHomeDashboard();
              };
            }

            const editBtn = tools.createEl("button", {
              cls: "dhp-btn dhp-icon-btn",
              attr: { type: "button", title: "Редактировать" }
            });
            editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
            editBtn.onclick = e => {
              e.stopPropagation();
              pinState.formOpen = true;
              pinState.editingId = item.id;
              renderHomeDashboard();
            };

            const delBtn = tools.createEl("button", {
              cls: "dhp-btn dhp-icon-btn is-danger",
              attr: { type: "button", title: "Удалить" }
            });
            delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            delBtn.onclick = async e => {
              e.stopPropagation();
              pinState.items = pinState.items.filter(x => x.id !== item.id);
              if (pinState.editingId === item.id) {
                pinState.editingId = null;
                pinState.formOpen = false;
              }
              if (pinState.items.length === 0) pinState.editMode = false;
              await persistPins();
              renderHomeDashboard();
            };
          }
        });
      }
    }
  }

  if (scroller) {
    requestAnimationFrame(() => {
      if (scroller.isConnected) scroller.scrollTop = prevScrollTop;
    });
  }
}

renderHomeDashboard();

// Подписка только на стор Ценностей (JSON-файл вне metadataCache);
// перерисовкой по изменениям md-заметок управляет HubBlockRenderer в main.ts
if (!hostContainer.dataset.dhHomeVcBound) {
  hostContainer.dataset.dhHomeVcBound = "1";
  const vcPlugin = app.plugins?.plugins?.["my-values-compass"];
  if (vcPlugin?.store?.subscribe) {
    let unsubVc = null;
    unsubVc = vcPlugin.store.subscribe(() => {
      if (!hostContainer.isConnected) {
        unsubVc?.();
        return;
      }
      if (document.activeElement?.closest?.(".dh-values-island")) return;
      scheduleHomeRender(150);
    });
  }
}