// =====================================================================
// АНГЛИЙСКИЙ И КНИГИ: MY-SR-TRAINER → ЧТЕНИЕ → ЦИТАТЫ → ГРАФИК
// Редакция: переход на плагин. Требуется включённый my-sr-trainer 0.1.2 или совместимый.
// =====================================================================
const reqUrl = (typeof window !== "undefined" && typeof window.requestUrl === "function")
  ? window.requestUrl
  : null;

// --- Основные пути и настройки ---
const FILE = "Words Cards";
const DIARY_FOLDER = '"Ежедневник"';
const BOOKS_FOLDER = "Знания/Книги";
const QUOTES_FILE_PATH = "Знания/Цитаты из книг.md";

const MATURE_DAYS = 21;
const DEFAULT_DAILY_TARGET = 200;
const SHOW_DAILY_TARGET_DEFAULT = true;
const CHART_DAYS = 14;
const QUOTES_DISPLAY_LIMIT = 6;
const TRANSLATE_PER_POS = 4;
const TRANSLATE_TIMEOUT_MS = 10000;
const EXAMPLE_SEP = " — ";

const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const BOOK_STATUSES = ["В планах", "Читаю", "Прочитано"];
const THOUGHT_LABELS = ["Принцип", "Инсайт", "Правило", "Наблюдение", "Мотивация"];

const STATUS_COLORS = {
  "Читаю": "#e5a158",
  "Прочитано": "#4aab80",
  "В планах": "#599ed6",
  "Принцип": "#4aab80",
  "Правило": "#599ed6",
  "Инсайт": "#9c83e8",
  "Наблюдение": "#69b5aa",
  "Мотивация": "#e5a158",
  "Любимое": "#e06c75"
};

const notify = msg => { try { new Notice(msg); } catch { console.log(msg); } };

// --- Единый источник истины для дневной цели ---
const TARGET_PREF_KEY = "dh_english_show_daily_target_v1";
const TARGET_VAL_KEY = "dh_english_daily_target_val_v1";

const getHubFile = () => app.vault.getAbstractFileByPath(dv.currentFilePath);
const getHubFrontmatter = () => {
  const f = getHubFile();
  return (f ? app.metadataCache.getFileCache(f)?.frontmatter : null) || dv.current() || {};
};

const readBoolPref = (key, defVal) => {
  try {
    const v = window.localStorage?.getItem(key);
    return v === null ? defVal : v === "true";
  } catch {
    return defVal;
  }
};
const writeBoolPref = (key, val) => {
  try { window.localStorage?.setItem(key, String(Boolean(val))); } catch {}
};

const readTargetPref = () => {
  const fm = getHubFrontmatter();
  if (typeof fm.линия_цели === "boolean") return fm.линия_цели;
  return readBoolPref(TARGET_PREF_KEY, SHOW_DAILY_TARGET_DEFAULT);
};

const writeTargetPref = async val => {
  const clean = Boolean(val);
  writeBoolPref(TARGET_PREF_KEY, clean);
  const f = getHubFile();
  if (f) {
    try {
      await app.fileManager.processFrontMatter(f, fm => {
        fm.линия_цели = clean;
      });
    } catch (e) {
      console.log(e);
    }
  }
  return clean;
};

const readTargetValue = () => {
  const fm = getHubFrontmatter();
  const fmVal = Number(fm.цель_дня);
  if (Number.isFinite(fmVal) && fmVal >= 10 && fmVal <= 5000) {
    return Math.round(fmVal);
  }
  try {
    const raw = Number(window.localStorage?.getItem(TARGET_VAL_KEY));
    return Number.isFinite(raw) && raw >= 10 && raw >= 10 && raw <= 5000 ? Math.round(raw) : DEFAULT_DAILY_TARGET;
  } catch {
    return DEFAULT_DAILY_TARGET;
  }
};

const writeTargetValue = async val => {
  const clean = Math.max(10, Math.min(5000, Math.round(Number(val) || DEFAULT_DAILY_TARGET)));
  try { window.localStorage?.setItem(TARGET_VAL_KEY, String(clean)); } catch {}
  const f = getHubFile();
  if (f) {
    try {
      await app.fileManager.processFrontMatter(f, fm => {
        fm.цель_дня = clean;
        fm.линия_цели = true;
      });
    } catch (e) {
      console.log(e);
    }
  }
  return clean;
};

function ensureHubState() {
  const defaults = {
    isWordFormOpen: false,
    wordDraft: { en: "", ru: "", ex: "", bookPath: "" },
    selectedVariants: [],
    translatedGroups: [],
    lastAddedWordInfo: null,
    statsDetailsOpen: false,
    showDailyTargetLine: readTargetPref(),
    dailyTarget: readTargetValue(),

    activeFilter: "ALL",
    selectedBookFilterKey: "",
    bookSortOrder: "newest",
    showRandom: false,
    showAllQuotes: false,
    onlyFavorites: false,
    onlyFavoriteBooks: false,
    finishedBooksOpen: true,
    doneBooksSort: "date",
    lastSyncedPagesDate: null,
    lastSyncedPagesCount: -1,

    isQuoteFormOpen: false,
    quoteFormType: "Книга",
    quoteDraft: { text: "", topic: "", label: "Принцип" },
    preselectedBookPathForQuote: "",

    isNewBookDrawerOpen: false,
    newBookDrawerContext: "reading",
    finishConfirmBookPath: null,
    openBookWordsPaths: new Set(),
    editingQuoteLineIndex: null,
    showMigrationPreview: false,
    archiveSectionOpen: false,

    localBookOverrides: new Map(),
    localCreatedBooks: []
  };

  if (!window.__dhEnglishHubState || typeof window.__dhEnglishHubState !== "object") {
    window.__dhEnglishHubState = { ...defaults };
  } else {
    const s = window.__dhEnglishHubState;
    for (const [k, v] of Object.entries(defaults)) {
      if (s[k] === undefined) s[k] = v;
    }
    if (!Array.isArray(s.selectedVariants)) s.selectedVariants = [];
    if (!Array.isArray(s.translatedGroups)) s.translatedGroups = [];
    if (!Array.isArray(s.localCreatedBooks)) s.localCreatedBooks = [];
    if (!(s.openBookWordsPaths instanceof Set)) s.openBookWordsPaths = new Set();
    if (!(s.localBookOverrides instanceof Map)) s.localBookOverrides = new Map();
    if (!s.wordDraft || typeof s.wordDraft !== "object") s.wordDraft = { en: "", ru: "", ex: "", bookPath: "" };
    if (!s.quoteDraft || typeof s.quoteDraft !== "object") s.quoteDraft = { text: "", topic: "", label: "Принцип" };
    s.dailyTarget = readTargetValue();
    s.showDailyTargetLine = readTargetPref();
  }
  return window.__dhEnglishHubState;
}
const ui = ensureHubState();

// Однократная очистка старого интерфейса при замене скрипта без перезапуска Obsidian.
// Заметки, localStorage и состояние плагина не изменяются.
if (window.__dhEnglishTrainerKeyHandler) {
  window.removeEventListener("keydown", window.__dhEnglishTrainerKeyHandler);
  delete window.__dhEnglishTrainerKeyHandler;
}
if (window.__dhEnglishPortalWatchTimer !== undefined) {
  window.clearInterval(window.__dhEnglishPortalWatchTimer);
  delete window.__dhEnglishPortalWatchTimer;
}
document.getElementById("dh-english-fullscreen-portal")?.remove();
for (const key of Object.keys(ui)) {
  if (
    key.startsWith("trainer") ||
    key === "isTrainerOpen" ||
    key === "isTrainerFullscreen" ||
    key === "lastSyncedDiaryDate" ||
    key === "lastSyncedDiaryCount" ||
    key === "progressEditBookPath"
  ) {
    delete ui[key];
  }
}

// Метод openTrainer и параметры сверены с src/main.ts плагина.
// Не запускаем старый тренажёр или сторонний Spaced Repetition как запасной вариант.
function openEnglishTrainer(mode = "DUE_AND_NEW", bookPath = null) {
  const plugin = app.plugins?.plugins?.["my-sr-trainer"];
  if (!plugin || typeof plugin.openTrainer !== "function") {
    notify("Включи плагин my-sr-trainer версии 0.1.2 или совместимой в настройках Obsidian.");
    return;
  }
  try {
    const params = { scope: "english", mode };
    if (typeof bookPath === "string" && bookPath.trim()) {
      params.bookPath = bookPath;
    }
    plugin.openTrainer(params);
  } catch (error) {
    notify("Не удалось открыть my-sr-trainer: " + (error instanceof Error ? error.message : String(error)));
  }
}

if (!window.__dhEnglishSaveQueue) {
  window.__dhEnglishSaveQueue = Promise.resolve();
}
function enqueueDiskWrite(taskFn) {
  const next = window.__dhEnglishSaveQueue.catch(() => {}).then(taskFn);
  window.__dhEnglishSaveQueue = next;
  return next;
}


const normStr = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normText = s => String(s ?? "").toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
const wordKey = s => normText(s).replace(/^(to|a|an|the)\s+/, "");
const cleanExample = s => String(s ?? "").replace(/\s+/g, " ").replace(/:{2,}/g, ":").replace(/==|\*\*/g, "").trim();
const encodeInline = s => String(s ?? "").replace(/\r?\n|\r/g, " ").replace(/\)/g, "⟩").replace(/\(/g, "⟨").trim();
const decodeInline = s => String(s ?? "").replace(/⟩/g, ")").replace(/⟨/g, "(").trim();

function parseOptionalNumber(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractLinkTarget(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.path) return String(raw.path).trim();
  const str = decodeInline(String(raw)).trim();
  const inner = str.startsWith("[[") && str.endsWith("]]") ? str.slice(2, -2) : str;
  if (!inner) return null;
  const barIdx = inner.indexOf("|");
  const hashIdx = inner.indexOf("#");
  let cutIdx = inner.length;
  if (barIdx !== -1 && barIdx < cutIdx) cutIdx = barIdx;
  if (hashIdx !== -1 && hashIdx < cutIdx) cutIdx = hashIdx;
  const target = inner.slice(0, cutIdx).trim();
  return target || null;
}

function extractLinkCfi(raw) {
  if (!raw) return null;
  const str = decodeInline(String(raw)).trim();
  if (!str.startsWith("[[") || !str.endsWith("]]")) return null;
  const inner = str.slice(2, -2);
  const hashIdx = inner.indexOf("#");
  if (hashIdx === -1) return null;
  const barIdx = inner.indexOf("|");
  const endIdx = barIdx !== -1 && barIdx > hashIdx ? barIdx : inner.length;
  let anchor = inner.slice(hashIdx + 1, endIdx).trim();
  if (anchor.startsWith("cfi=")) anchor = anchor.slice(4).trim();
  return anchor.startsWith("epubcfi(") ? anchor : null;
}

// Открытие .epub в плагине my-epub-reader (на текущей или заданной CFI-позиции)
async function openBookInEpubPlugin(epubPath, cfi) {
  if (!epubPath) {
    notify("У этой книги не привязан файл .epub (свойство «книга»).");
    return;
  }

  const epubPlugin = app.plugins?.plugins?.["my-epub-reader"];
  if (epubPlugin && typeof epubPlugin.openEpubAt === "function") {
    await epubPlugin.openEpubAt(epubPath, cfi || undefined);
    return;
  }

  // Запасной вариант через стандартный openLinkText
  await app.workspace.openLinkText(epubPath, dv.currentFilePath || "", false);
}

const splitFront = s => {
  const raw = String(s ?? "").replace(/^[-*+]\s+/, "").trim();
  const i = raw.indexOf(EXAMPLE_SEP);
  return i === -1
    ? { word: raw, example: "" }
    : { word: raw.slice(0, i).trim(), example: raw.slice(i + EXAMPLE_SEP.length).trim() };
};

function splitBackAndSource(rawBack) {
  const trimmed = String(rawBack ?? "").trim();
  const inlineMatch = trimmed.match(/^(.*?)\s*\((?:источник|книга)::\s*(\[\[[^\]]+\]\])\)\s*(?![\s\S])/i);
  if (inlineMatch) {
    const wiki = inlineMatch[2].trim();
    return {
      cleanBack: inlineMatch[1].trim(),
      rawSourceWiki: wiki,
      sourceTarget: extractLinkTarget(wiki),
      sourceCfi: extractLinkCfi(wiki)
    };
  }
  const dotMatch = trimmed.match(/^(.*?)\s*(?:·|\|)\s*(\[\[[^\]]+\]\])\s*(?![\s\S])/);
  if (dotMatch) {
    const wiki = dotMatch[2].trim();
    return {
      cleanBack: dotMatch[1].trim(),
      rawSourceWiki: wiki,
      sourceTarget: extractLinkTarget(wiki),
      sourceCfi: extractLinkCfi(wiki)
    };
  }
  return { cleanBack: trimmed, rawSourceWiki: null, sourceTarget: null, sourceCfi: null };
}

function analyzeWordsFile(content, bookRegistry, todayISO) {
  const lines = String(content ?? "").split(/\r?\n/);
  const cards = [];

  let totalEntries = 0;
  let totalCardDirections = 0;
  let newDirections = 0;
  let unscheduledDirections = 0;
  let learningDirections = 0;
  let matureDirections = 0;
  let dueScheduled = 0;
  let reviewedTodayDirections = 0;
  let reviewedTodayEntries = 0;

  const srReviewsByDate = new Map();
  const srRegex = /!(\d{4}-\d{2}-\d{2}),(\d+),(\d+)/g;

  let pendingCard = null;

  const finalizePendingAsUnscheduled = () => {
    if (!pendingCard) return;
    pendingCard.isUnscheduled = true;
    pendingCard.srLineIndex = null;
    pendingCard.srOnNextLine = false;
    pendingCard.directions = [];
    for (let d = 0; d < pendingCard.expectedDirections; d++) {
      pendingCard.directions.push({
        dirIndex: d,
        dateStr: "2000-01-01",
        interval: 0,
        ease: 250,
        isNew: true,
        isDue: false,
        reviewedToday: false
      });
    }
    newDirections += pendingCard.expectedDirections;
    unscheduledDirections += pendingCard.expectedDirections;
    totalCardDirections += pendingCard.expectedDirections;
    cards.push(pendingCard);
    pendingCard = null;
  };

  const applySrMatchesToCard = (cardObj, srText, srLineIdx, onNextLine) => {
    const matches = [...srText.matchAll(srRegex)];
    if (!matches.length) {
      cardObj.isUnscheduled = true;
      cardObj.srLineIndex = null;
      cardObj.srOnNextLine = false;
      cardObj.directions = [];
      for (let d = 0; d < cardObj.expectedDirections; d++) {
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
      }
      newDirections += cardObj.expectedDirections;
      unscheduledDirections += pendingCard.expectedDirections;
      totalCardDirections += cardObj.expectedDirections;
      cards.push(cardObj);
      return;
    }

    cardObj.srLineIndex = srLineIdx;
    cardObj.srOnNextLine = onNextLine;
    cardObj.directions = [];

    let touchedToday = false;
    let minEase = Infinity;
    let minInterval = Infinity;
    let hasReviewedDirection = false;
    let cardDueCount = 0;

    const dirCount = Math.max(cardObj.expectedDirections, matches.length);
    for (let d = 0; d < dirCount; d++) {
      const m = matches[d];
      if (!m) {
        totalCardDirections++;
        newDirections++;
        unscheduledDirections++;
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
        continue;
      }

      const [, dateStr, intervalStr, easeStr] = m;
      totalCardDirections++;

      if (dateStr === "2000-01-01") {
        newDirections++;
        cardObj.directions.push({
          dirIndex: d,
          dateStr: "2000-01-01",
          interval: 0,
          ease: Number(easeStr) || 250,
          isNew: true,
          isDue: false,
          reviewedToday: false
        });
        continue;
      }

      const isDue = dateStr <= todayISO;
      if (isDue) {
        dueScheduled++;
        cardDueCount++;
      }

      const interval = Number(intervalStr);
      const ease = Number(easeStr);
      hasReviewedDirection = true;

      if (interval >= MATURE_DAYS) matureDirections++;
      else learningDirections++;

      if (Number.isFinite(ease) && ease < minEase) minEase = ease;
      if (Number.isFinite(interval) && interval < minInterval) minInterval = interval;

      let reviewedToday = false;
      const nextDate = dv.date(dateStr);
      if (nextDate && nextDate.isValid && interval > 0) {
        const lastReviewedISO = nextDate.minus({ days: interval }).toISODate();
        srReviewsByDate.set(lastReviewedISO, (srReviewsByDate.get(lastReviewedISO) || 0) + 1);
        if (lastReviewedISO === todayISO) {
          reviewedTodayDirections++;
          touchedToday = true;
          reviewedToday = true;
        }
      }

      cardObj.directions.push({
        dirIndex: d,
        dateStr,
        interval: Number.isFinite(interval) ? interval : 1,
        ease: Number.isFinite(ease) ? ease : 250,
        isNew: false,
        isDue,
        reviewedToday
      });
    }

    if (touchedToday) reviewedTodayEntries++;

    cardObj.hasReviewedDirection = hasReviewedDirection;
    cardObj.minEase = hasReviewedDirection && Number.isFinite(minEase) ? minEase : null;
    cardObj.minInterval = hasReviewedDirection && Number.isFinite(minInterval) ? minInterval : null;
    cardObj.dueCount = cardDueCount;
    cards.push(cardObj);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const srIdx = line.indexOf("<!--SR:");
    const cardPart = srIdx === -1 ? line : line.slice(0, srIdx);
    const hasSeparator = /:{2,3}/.test(cardPart) && !cardPart.trimStart().startsWith("#");

    if (hasSeparator) {
      finalizePendingAsUnscheduled();

      totalEntries++;
      const isBidirectional = cardPart.includes(":::");
      const expectedDirections = isBidirectional ? 2 : 1;
      const [rawFront, ...rest] = cardPart.split(/:{2,3}/);
      const rawBackJoined = rest.join(" ").trim();
      const { word, example } = splitFront(rawFront);
      const { cleanBack, rawSourceWiki, sourceTarget, sourceCfi } = splitBackAndSource(rawBackJoined);

      let resolvedBook = null;
      if (sourceTarget && bookRegistry) {
        resolvedBook = bookRegistry.resolveByTarget(sourceTarget);
      }

      const cardObj = {
        lineIndex: i,
        lineNumber: i + 1,
        front: rawFront.replace(/^[-*+]\s+/, "").trim(),
        word,
        example,
        back: cleanBack,
        rawBack: rawBackJoined,
        rawSourceWiki,
        sourceTarget,
        sourceCfi,
        resolvedBook,
        key: wordKey(word),
        isBidirectional,
        expectedDirections,
        isUnscheduled: false,
        hasReviewedDirection: false,
        minEase: null,
        minInterval: null,
        dueCount: 0,
        srLineIndex: null,
        srOnNextLine: false,
        directions: []
      };

      if (srIdx !== -1) {
        applySrMatchesToCard(cardObj, line.slice(srIdx), i, false);
      } else {
        pendingCard = cardObj;
      }
    } else if (srIdx !== -1 && pendingCard) {
      applySrMatchesToCard(pendingCard, line.slice(srIdx), i, true);
      pendingCard = null;
    } else if (line.trim() !== "" && pendingCard) {
      finalizePendingAsUnscheduled();
    }
  }
  finalizePendingAsUnscheduled();

  return {
    cards,
    totalEntries,
    totalCardDirections,
    newDirections,
    unscheduledDirections,
    learningDirections,
    matureDirections,
    dueScheduled,
    reviewedTodayDirections,
    reviewedTodayEntries,
    srReviewsByDate
  };
}





const translationCache = new Map();
const withTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error("нет ответа за " + (ms / 1000) + " с")), ms))
]);

const DESKTOP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
};

function parseGoogleData(d) {
  const groups = [];
  if (Array.isArray(d?.[1])) {
    d[1].forEach(e => {
      const terms = (Array.isArray(e?.[1]) ? e[1] : []).filter(t => typeof t === "string" && t.trim());
      if (terms.length) groups.push({ pos: String(e[0] || "перевод"), terms: terms.slice(0, TRANSLATE_PER_POS).map(t => t.trim()) });
    });
  }
  if (!groups.length && Array.isArray(d?.dict)) {
    d.dict.forEach(entry => {
      const terms = (Array.isArray(entry?.terms) ? entry.terms : []).filter(t => typeof t === "string" && t.trim());
      if (terms.length) groups.push({ pos: String(entry.pos || "перевод"), terms: terms.slice(0, TRANSLATE_PER_POS).map(t => t.trim()) });
    });
  }
  if (!groups.length && Array.isArray(d?.sentences)) {
    const main = d.sentences.map(s => s?.trans).filter(Boolean).join("").trim();
    if (main) groups.push({ pos: "перевод", terms: [main] });
  }
  if (!groups.length && Array.isArray(d?.[0])) {
    const main = d[0].map(s => s?.[0]).filter(Boolean).join("").trim();
    if (main) groups.push({ pos: "перевод", terms: [main] });
  }
  return groups;
}

async function fetchTranslations(word) {
  if (!reqUrl) throw new Error("requestUrl недоступен");
  const cleanWord = String(word ?? "").trim();
  if (!cleanWord) throw new Error("пустой запрос");

  const cacheKey = cleanWord.toLowerCase();
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  const q = encodeURIComponent(cleanWord);
  const proto = ["https", "://"].join("");
  const hostClients = ["clients5", "google", "com"].join(".");
  const hostApi = ["translate", "googleapis", "com"].join(".");
  const hostWeb = ["translate", "google", "com"].join(".");
  const hostMemory = ["api", "mymemory", "translated", "net"].join(".");

  const endpoints = [
    proto + hostClients + "/translate_a/t?client=dict-chrome-ex&sl=en&tl=ru&q=" + q,
    proto + hostApi + "/translate_a/single?client=gtx&dt=t&dt=bd&dj=1&sl=en&tl=ru&q=" + q,
    proto + hostWeb + "/translate_a/single?client=at&sl=en&tl=ru&dt=t&dt=bd&q=" + q,
    proto + hostApi + "/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&dt=bd&q=" + q
  ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await withTimeout(reqUrl({ url, headers: DESKTOP_HEADERS }), TRANSLATE_TIMEOUT_MS);
      const data = typeof r.json === "object" && r.json !== null ? r.json : JSON.parse(r.text);
      const groups = parseGoogleData(data);
      if (groups.length) {
        translationCache.set(cacheKey, groups);
        return groups;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    const fallbackUrl = proto + hostMemory + "/get?q=" + q + "&langpair=en%7Cru";
    const r = await withTimeout(reqUrl({ url: fallbackUrl, headers: DESKTOP_HEADERS }), TRANSLATE_TIMEOUT_MS);
    const data = typeof r.json === "object" && r.json !== null ? r.json : JSON.parse(r.text);
    const termsSet = new Set();

    const mainText = data?.responseData?.translatedText;
    if (typeof mainText === "string" && mainText.trim() && mainText.toLowerCase() !== cacheKey) {
      termsSet.add(mainText.trim().toLowerCase());
    }
    if (Array.isArray(data?.matches)) {
      data.matches.forEach(m => {
        const t = String(m?.translation ?? "").trim();
        if (t && t.toLowerCase() !== cacheKey && !/[a-zA-Z]{3,}/.test(t)) {
          termsSet.add(t.toLowerCase());
        }
      });
    }

    const terms = [...termsSet].slice(0, TRANSLATE_PER_POS);
    if (terms.length) {
      const groups = [{ pos: "перевод", terms }];
      translationCache.set(cacheKey, groups);
      return groups;
    }
  } catch (e) {
    lastErr = e;
  }

  throw lastErr || new Error("сервисы перевода временно недоступны");
}

// --- Автосинхронизация прочитанных страниц и привычки «чтение» с Ежедневником (единый ключ с home.js) ---
const SHARED_READING_STATE_KEY = "dh_shared_book_reading_v2";
const AUTO_READING_PREFIX = "dh_english_auto_reading_v1:";
const MANUAL_HABITS_PREFIX = "dh_today_manual_habits_v1:";
const DIARY_PAGES_FIELD = "страниц_прочитано";
const DIARY_READING_FIELD = "чтение";

const readLsJson = key => {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeLsJson = (key, val) => {
  try { window.localStorage?.setItem(key, JSON.stringify(val)); } catch {}
};

function bookEffectivePages(b) {
  const total = b.totalPages !== null && b.totalPages > 0 ? b.totalPages : null;
  const read = b.readPages !== null && b.readPages >= 0 ? b.readPages : null;
  const finished = b.status === "Прочитано" || (total !== null && read !== null && read >= total);
  if (finished && total !== null) return { pages: total, finished: true };
  return { pages: read, finished };
}

function computeReadPagesToday(books, todayDate) {
  const todayISO = todayDate.toISODate();
  const yesterdayISO = todayDate.minus({ days: 1 }).toISODate();
  const dayStartMs = todayDate.toMillis();

  let state = readLsJson(SHARED_READING_STATE_KEY);
  if (!state || typeof state !== "object") {
    state = { dateISO: "", baselines: {}, snapshotDateISO: "", snapshotValues: {}, manualOverridePages: null };
  }
  if (!state.baselines || typeof state.baselines !== "object") state.baselines = {};
  if (!state.snapshotValues || typeof state.snapshotValues !== "object") state.snapshotValues = {};

  const currentBooks = [];
  books.forEach(b => {
    const e = bookEffectivePages(b);
    if (e.pages === null) return;
    const f = app.vault.getAbstractFileByPath(b.path);
    const fm = f ? (app.metadataCache.getFileCache(f)?.frontmatter || {}) : {};
    const posTimeRaw = String(fm.позиция_время ?? "").trim();
    const posDateISO = /^\d{4}-\d{2}-\d{2}/.test(posTimeRaw) ? posTimeRaw.slice(0, 10) : "";
    const touchedToday = b.lastReadISO === todayISO || posDateISO === todayISO;
    const createdToday = Boolean(f?.stat && f.stat.ctime >= dayStartMs);

    currentBooks.push({
      path: b.path,
      curRead: e.pages,
      isFinished: e.finished,
      touchedToday,
      createdToday
    });
  });

  if (state.dateISO !== todayISO) {
    const nextBaselines = {};
    const hasYesterdaySnapshot = state.snapshotDateISO === yesterdayISO;

    for (const b of currentBooks) {
      const snapVal = state.snapshotValues[b.path];
      if (hasYesterdaySnapshot && typeof snapVal === "number" && Number.isFinite(snapVal)) {
        nextBaselines[b.path] = Math.min(snapVal, b.curRead);
      } else if (b.touchedToday && typeof snapVal === "number" && Number.isFinite(snapVal)) {
        nextBaselines[b.path] = Math.min(snapVal, b.curRead);
      } else if (!b.isFinished && b.createdToday && b.touchedToday) {
        nextBaselines[b.path] = 0;
      } else {
        nextBaselines[b.path] = b.curRead;
      }
    }

    state.dateISO = todayISO;
    state.baselines = nextBaselines;
    state.manualOverridePages = null;
  }

  let autoBookPages = 0;
  const nextSnapshotValues = {};

  for (const b of currentBooks) {
    let baseVal = state.baselines[b.path];
    if (typeof baseVal !== "number" || !Number.isFinite(baseVal)) {
      baseVal = !b.isFinished && b.createdToday ? 0 : b.curRead;
      state.baselines[b.path] = baseVal;
    } else if (b.curRead < baseVal) {
      baseVal = b.curRead;
      state.baselines[b.path] = baseVal;
    } else if (!b.touchedToday && b.curRead > baseVal && state.snapshotDateISO !== todayISO && state.snapshotDateISO !== yesterdayISO) {
      baseVal = b.curRead;
      state.baselines[b.path] = baseVal;
    }

    autoBookPages += Math.max(0, b.curRead - baseVal);
    nextSnapshotValues[b.path] = b.curRead;
  }

  state.snapshotDateISO = todayISO;
  state.snapshotValues = nextSnapshotValues;
  writeLsJson(SHARED_READING_STATE_KEY, state);

  const manualOverridePages =
    typeof state.manualOverridePages === "number" &&
    Number.isFinite(state.manualOverridePages) &&
    state.manualOverridePages >= 0
      ? Math.round(state.manualOverridePages)
      : null;

  return {
    autoBookPages,
    manualOverridePages,
    effectivePages: manualOverridePages !== null ? manualOverridePages : autoBookPages
  };
}

// true — пользователь уже вручную трогал привычку «чтение» сегодня (ключ веду не я, формат разбираю с запасом)
function isReadingHabitHandledManually(iso) {
  let raw = null;
  try { raw = window.localStorage?.getItem(MANUAL_HABITS_PREFIX + iso); } catch { return false; }
  if (raw === null || raw === "") return false;

  let v = raw;
  try { v = JSON.parse(raw); } catch {}

  if (Array.isArray(v)) return v.includes(DIARY_READING_FIELD);
  if (v && typeof v === "object") {
    if (!(DIARY_READING_FIELD in v)) return false;
    const x = v[DIARY_READING_FIELD];
    return !(x === true || x === "true" || x === 1);
  }
  return String(v).includes(DIARY_READING_FIELD);
}

const hasAutoReadingMark = iso => {
  try { return window.localStorage?.getItem(AUTO_READING_PREFIX + iso) === "1"; } catch { return false; }
};
const setAutoReadingMark = iso => {
  try { window.localStorage?.setItem(AUTO_READING_PREFIX + iso, "1"); } catch {}
};

async function openFileAtLine(filePath, lineIndex) {
  await app.workspace.openLinkText(filePath, dv.currentFilePath, false);
  setTimeout(() => {
    try {
      const view = app.workspace.activeLeaf?.view;
      if (view && view.file?.path === filePath && view.editor) {
        const safeLine = Math.max(0, Number(lineIndex) || 0);
        view.editor.setCursor({ line: safeLine, ch: 0 });
        view.editor.scrollIntoView({ from: { line: safeLine, ch: 0 }, to: { line: safeLine, ch: 0 } }, true);
        view.editor.focus();
      }
    } catch (e) {
      console.log(e);
    }
  }, 120);
}


async function ensureFolderExists(folderPath) {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? current + "/" + part : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
  }
}

async function ensureQuotesFile() {
  let file = app.vault.getAbstractFileByPath(QUOTES_FILE_PATH);
  if (!file) {
    const folder = QUOTES_FILE_PATH.includes("/") ? QUOTES_FILE_PATH.slice(0, QUOTES_FILE_PATH.lastIndexOf("/")) : "";
    if (folder) await ensureFolderExists(folder);
    const initialContent = "---\nтип: Цитатник\nнаправление: Досуг\n---\n\n# 📚 Цитаты, мысли и принципы\n\n";
    file = await app.vault.create(QUOTES_FILE_PATH, initialContent);
  }
  return file;
}

function loadBooks() {
  let rawPages = [];
  try {
    rawPages = dv.pages('"' + BOOKS_FOLDER + '"').array();
  } catch {
    rawPages = [];
  }

  const merged = [...rawPages];
  ui.localCreatedBooks.forEach(cb => {
    if (!merged.some(p => p.file.path === cb.file.path)) merged.push(cb);
  });

  const books = [];
  const byPath = new Map();

  merged.forEach(p => {
    const fileObj = app.vault.getAbstractFileByPath(p.file.path);
    const fmCache = fileObj ? (app.metadataCache.getFileCache(fileObj)?.frontmatter || {}) : {};
    const ov = ui.localBookOverrides.get(p.file.path) || {};

    const pick = (key, fallback) => {
      if (key in ov) return ov[key];
      if (key in fmCache && fmCache[key] !== undefined) return fmCache[key];
      if (p[key] !== undefined) return p[key];
      return fallback;
    };

    const title = String(pick("название", p.file.name) || p.file.name).trim();
    const author = String(pick("автор", "") || "").trim();
    const genre = String(pick("жанр", "") || "").trim();
    const rawStatus = String(pick("статус", "В планах") || "В планах").trim();
    const status = BOOK_STATUSES.includes(rawStatus) ? rawStatus : rawStatus;

    const totalPagesRaw = parseOptionalNumber(pick("страниц", null));
    const totalPages = totalPagesRaw !== null && totalPagesRaw > 0 ? Math.round(totalPagesRaw) : null;

    const readPagesRaw = parseOptionalNumber(pick("прочитано", null));
    const readPages = readPagesRaw !== null && readPagesRaw >= 0 ? Math.round(readPagesRaw) : null;

    const progressPctRaw = parseOptionalNumber(pick("прогресс", null));
    const progressPct = progressPctRaw !== null && progressPctRaw >= 0
      ? Math.min(100, Math.round(progressPctRaw))
      : null;

    const rawLastRead = pick("последнее_чтение", "");
    let lastReadISO = "";
    if (rawLastRead) {
      const dt = dv.date(rawLastRead);
      lastReadISO = dt && dt.isValid ? dt.toISODate() : String(rawLastRead).trim();
    }

    const rawFinished = pick("дата_завершения", "");
    let finishedISO = "";
    if (rawFinished) {
      const fdt = dv.date(rawFinished);
      finishedISO = fdt && fdt.isValid ? fdt.toISODate() : String(rawFinished).trim();
    }

    const rawFav = pick("любимое", false);
    const isFavorite = rawFav === true || /^(да|true|yes|1)$/i.test(String(rawFav ?? "").trim());

    const rawEpubLink = pick("книга", null);
    let epubPath = null;
    const epubTarget = extractLinkTarget(rawEpubLink);
    if (epubTarget) {
      const dest = app.metadataCache.getFirstLinkpathDest(epubTarget, p.file.path);
      epubPath = dest ? dest.path : epubTarget;
    }

    const bookObj = {
      path: p.file.path,
      fileName: p.file.name,
      title,
      author,
      genre,
      status,
      totalPages,
      readPages,
      progressPct,
      lastReadISO,
      finishedISO,
      isFavorite,
      epubPath
    };

    books.push(bookObj);
    byPath.set(bookObj.path, bookObj);
  });

  function resolveByTarget(targetStr) {
    if (!targetStr) return null;
    const clean = String(targetStr).trim();
    if (byPath.has(clean)) return byPath.get(clean);
    if (byPath.has(clean + ".md")) return byPath.get(clean + ".md");
    if (byPath.has(BOOKS_FOLDER + "/" + clean + ".md")) return byPath.get(BOOKS_FOLDER + "/" + clean + ".md");
    const dest = app.metadataCache.getFirstLinkpathDest(clean, QUOTES_FILE_PATH);
    if (dest && byPath.has(dest.path)) return byPath.get(dest.path);
    const byName = books.filter(b => normStr(b.fileName) === normStr(clean) || normStr(b.title) === normStr(clean));
    return byName.length === 1 ? byName[0] : null;
  }

  function resolveBookForQuote(q) {
    const linkTarget = q.rawBookLink || extractLinkTarget(q.rawBookField);
    if (linkTarget) {
      const resolved = resolveByTarget(linkTarget);
      if (resolved) return { book: resolved, ambiguous: false, matchType: "link" };
    }

    const qTitleNorm = normStr(q.legacyTitle);
    const qAuthorNorm = normStr(q.legacyAuthor);
    if (!qTitleNorm) return { book: null, ambiguous: false, matchType: "none" };

    const titleMatches = books.filter(b => normStr(b.title) === qTitleNorm || normStr(b.fileName) === qTitleNorm);
    if (titleMatches.length === 0) return { book: null, ambiguous: false, matchType: "none" };

    if (qAuthorNorm && qAuthorNorm !== "—" && qAuthorNorm !== "не указан") {
      const exactBoth = titleMatches.filter(b => normStr(b.author) === qAuthorNorm);
      if (exactBoth.length === 1) return { book: exactBoth[0], ambiguous: false, matchType: "legacy-exact" };
      if (exactBoth.length > 1) return { book: null, ambiguous: true, matchType: "ambiguous" };
    }

    if (titleMatches.length === 1) {
      const candidate = titleMatches[0];
      if (qAuthorNorm && qAuthorNorm !== "—" && qAuthorNorm !== "не указан" && candidate.author && normStr(candidate.author) !== qAuthorNorm) {
        return { book: null, ambiguous: false, matchType: "none" };
      }
      return { book: candidate, ambiguous: false, matchType: "legacy-title" };
    }

    return { book: null, ambiguous: true, matchType: "ambiguous" };
  }

  return { books, byPath, resolveByTarget, resolveBookForQuote };
}

function stripOuterWikiBrackets(str) {
  let s = String(str || "").trim();
  if (s.startsWith("[[")) s = s.slice(2);
  if (s.endsWith("]]")) s = s.slice(0, -2);
  return s;
}

async function loadQuotes(bookRegistry) {
  const file = app.vault.getAbstractFileByPath(QUOTES_FILE_PATH);
  if (!file) return [];
  const content = await app.vault.read(file);
  const quotes = [];
  const seenNormalizedTexts = new Map();

  content.split(/\r?\n/).forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-") || !trimmed.includes("цитата::")) return;

    const fields = {};
    const fieldRegex = /\(([а-яА-Яa-zA-Z0-9_]+)::\s*([^)]+)\)/g;
    for (const match of trimmed.matchAll(fieldRegex)) {
      fields[match[1].trim()] = match[2].trim();
    }

    if (!fields.цитата) return;

    const rawCat = decodeInline(fields.категория || "Книга");
    let category = rawCat;
    if (rawCat === "Мысль / Принцип") category = "Мысль";

    const isArchivedCategory = category !== "Книга" && category !== "Мысль";
    const rawBookField = fields.книга_ссылка || fields.книга || fields.источник || "";
    const rawBookLink = extractLinkTarget(fields.книга_ссылка) || extractLinkTarget(fields.книга);
    const quoteCfi = fields.позиция ? decodeInline(fields.позиция).trim() : null;

    const legacyTitle = stripOuterWikiBrackets(decodeInline(fields.книга || fields.источник || "")).split("|").pop().trim();
    const legacyAuthor = decodeInline(fields.автор || "");
    const legacyStatus = decodeInline(fields.статус || (category === "Мысль" ? "Принцип" : "Читаю"));
    const dateStr = decodeInline(fields.дата || "");
    const quoteText = decodeInline(fields.цитата);
    const isFavorite = /^(да|true|yes|1)$/i.test(decodeInline(fields.любимое || ""));

    let resolvedBook = null;
    let isAmbiguousLegacy = false;
    let isLegacyUnlinkedBookQuote = false;

    if (category === "Книга") {
      const res = bookRegistry.resolveBookForQuote({
        rawBookField,
        rawBookLink,
        legacyTitle,
        legacyAuthor
      });
      resolvedBook = res.book;
      isAmbiguousLegacy = res.ambiguous;
      isLegacyUnlinkedBookQuote = !rawBookLink && res.book !== null;
    }

    const displayTitle = category === "Книга"
      ? (resolvedBook ? resolvedBook.title : (legacyTitle || "Без названия"))
      : (legacyTitle || (category === "Мысль" ? "Личная мысль" : "Без названия"));

    const displayAuthor = category === "Книга"
      ? (resolvedBook ? resolvedBook.author : legacyAuthor)
      : legacyAuthor;

    const displayStatus = category === "Книга"
      ? (resolvedBook ? resolvedBook.status : legacyStatus)
      : legacyStatus;

    const bookFilterKey = category === "Книга"
      ? (resolvedBook ? "BOOK:" + resolvedBook.path : "LEGACY:" + normStr(displayTitle) + "|" + normStr(displayAuthor))
      : "";

    const normQuoteKey = normText(quoteText);
    const duplicateOfLine = seenNormalizedTexts.has(normQuoteKey) ? seenNormalizedTexts.get(normQuoteKey) : null;
    if (!seenNormalizedTexts.has(normQuoteKey) && normQuoteKey.length > 10) {
      seenNormalizedTexts.set(normQuoteKey, idx + 1);
    }

    quotes.push({
      lineIndex: idx,
      lineNumber: idx + 1,
      rawLine: line,
      fields,
      category,
      isArchivedCategory,
      resolvedBook,
      quoteCfi,
      isAmbiguousLegacy,
      isLegacyUnlinkedBookQuote,
      hasDirectLink: Boolean(rawBookLink),
      bookFilterKey,
      displayTitle,
      displayAuthor,
      displayStatus,
      date: dateStr,
      text: quoteText,
      isFavorite,
      duplicateOfLine
    });
  });

  return quotes.reverse();
}

async function updateQuoteEntry(lineIndex, { category, book, legacyTitle, topic, status, text }) {
  const file = await ensureQuotesFile();
  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);
  const targetLine = lines[lineIndex];
  if (!targetLine || !targetLine.includes("цитата::")) {
    throw new Error("Строка не найдена — возможно, файл был изменён извне.");
  }

  const fields = {};
  const fieldRegex = /\(([а-яА-Яa-zA-Z0-9_]+)::\s*([^)]+)\)/g;
  for (const m of targetLine.matchAll(fieldRegex)) {
    fields[m[1].trim()] = m[2].trim();
  }

  fields.категория = encodeInline(category);
  fields.цитата = encodeInline(text);

  if (category === "Книга") {
    if (book) {
      fields.книга_ссылка = encodeInline("[[" + book.path + "]]");
      fields.книга = encodeInline(book.title);
    } else if (legacyTitle) {
      fields.книга = encodeInline(legacyTitle);
    }
  } else if (category === "Мысль") {
    fields.источник = encodeInline(topic || "Личная мысль");
    fields.статус = encodeInline(status || "Принцип");
  }

  const orderedKeys = ["категория", "книга_ссылка", "книга", "автор", "источник", "статус", "дата", "позиция", "цитата"];
  const allKeys = [...new Set([...orderedKeys, ...Object.keys(fields)])];
  lines[lineIndex] = "- " + allKeys
    .filter(k => fields[k] !== undefined && String(fields[k]).trim() !== "")
    .map(k => "(" + k + ":: " + fields[k] + ")")
    .join(" ");

  await app.vault.modify(file, lines.join("\n"));
}

async function toggleQuoteFavorite(lineIndex) {
  return enqueueDiskWrite(async () => {
    const file = await ensureQuotesFile();
    const content = await app.vault.read(file);
    const rows = content.split(/\r?\n/);
    const target = rows[lineIndex];
    if (!target || !target.includes("цитата::")) {
      throw new Error("Строка не найдена — возможно, файл был изменён извне.");
    }

    const favRegex = /\s*\(любимое::\s*[^)]*\)/;
    if (favRegex.test(target)) {
      rows[lineIndex] = target.replace(new RegExp(favRegex.source, "g"), "");
      await app.vault.modify(file, rows.join("\n"));
      return false;
    }

    const pos = target.indexOf("(цитата::");
    rows[lineIndex] = pos >= 0
      ? target.slice(0, pos) + "(любимое:: да) " + target.slice(pos)
      : target + " (любимое:: да)";
    await app.vault.modify(file, rows.join("\n"));
    return true;
  });
}

async function toggleBookFavorite(book) {
  const f = app.vault.getAbstractFileByPath(book.path);
  if (!f) throw new Error("Файл книги не найден.");
  const next = !book.isFavorite;
  await app.fileManager.processFrontMatter(f, fm => {
    if (next) fm["любимое"] = true;
    else delete fm["любимое"];
  });
  ui.localBookOverrides.set(book.path, {
    ...(ui.localBookOverrides.get(book.path) || {}),
    любимое: next
  });
  return next;
}

function createBookFavButton(parentEl, book) {
  const btn = parentEl.createEl("button", {
    cls: "dh-chip",
    text: book.isFavorite ? "♥\uFE0E" : "♡\uFE0E",
    attr: {
      type: "button",
      title: book.isFavorite ? "Убрать из любимых" : "Добавить в любимые",
      "aria-pressed": String(Boolean(book.isFavorite)),
      style: "font-size: 0.8rem; padding: 1px 6px; height: 20px; cursor: pointer; border-color: transparent; background: transparent; color: " +
        (book.isFavorite ? STATUS_COLORS["Любимое"] : "var(--text-muted)") + ";"
    }
  });
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await toggleBookFavorite(book);
      await renderHub();
    } catch (err) {
      notify("Ошибка: " + err.message);
      btn.disabled = false;
    }
  };
  return btn;
}

async function createBookNote({ title, author, genre, status, totalPages, readPages }) {
  await ensureFolderExists(BOOKS_FOLDER);
  const safeBaseName = title.replace(/[\\/:*?"<>|#^\[\]]/g, "").trim();
  if (!safeBaseName) throw new Error("Некорректное название книги.");

  let targetPath = BOOKS_FOLDER + "/" + safeBaseName + ".md";
  if (app.vault.getAbstractFileByPath(targetPath)) {
    const safeAuthor = author ? author.replace(/[\\/:*?"<>|#^\[\]]/g, "").trim() : "";
    if (safeAuthor) {
      targetPath = BOOKS_FOLDER + "/" + safeBaseName + " (" + safeAuthor + ").md";
    }
    if (app.vault.getAbstractFileByPath(targetPath)) {
      throw new Error("Заметка книги «" + targetPath + "» уже существует.");
    }
  }

  const yamlLines = [
    "---",
    "название: " + JSON.stringify(title),
    "автор: " + JSON.stringify(author || ""),
    "жанр: " + JSON.stringify(genre || ""),
    "статус: " + JSON.stringify(status || "Читаю"),
    "страниц: " + (totalPages !== null ? totalPages : ""),
    "прочитано: " + (readPages !== null ? readPages : ""),
    "---",
    "",
    "# " + title,
    ""
  ];

  const createdFile = await app.vault.create(targetPath, yamlLines.join("\n"));
  ui.localCreatedBooks.push({
    file: { path: createdFile.path, name: createdFile.basename },
    название: title,
    автор: author || "",
    жанр: genre || "",
    статус: status || "Читаю",
    страниц: totalPages,
    прочитано: readPages
  });
  ui.localBookOverrides.set(createdFile.path, {
    название: title,
    автор: author || "",
    жанр: genre || "",
    статус: status || "Читаю",
    страниц: totalPages,
    прочитано: readPages
  });

  return createdFile;
}

const root = dv.container.createDiv({ cls: "dh dh-english-hub" });

const HUB_CSS_TEXT = [
  ".dh-english-page .dh-english-hub, .dashboard-home .dh-english-hub { display: flex; flex-direction: column; gap: 16px; margin: 8px 0 28px 0; box-sizing: border-box; }",
  ".dashboard-home .dh-english-hub button, .dashboard-home .dh-english-hub select { touch-action: manipulation; }",
  ".dashboard-home .dh-english-hub .dhe-panel { padding: 14px 16px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 10px; box-sizing: border-box; }",
  ".dashboard-home .dh-english-hub .dhe-section-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 12px; }",
  ".dashboard-home .dh-english-hub .dhe-section-title { font-size: 0.96rem; font-weight: 700; color: var(--text-normal); display: inline-flex; align-items: baseline; gap: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-section-sub { font-size: 0.75rem; font-weight: 500; color: var(--text-muted); }",
  ".dashboard-home .dh-english-hub .dhe-today-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; align-items: stretch; }",
  ".dashboard-home .dh-english-hub .dhe-stat-box { padding: 10px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; }",
  ".dashboard-home .dh-english-hub .dhe-stat-label { font-size: 0.74rem; font-weight: 600; color: var(--text-muted); }",
  ".dashboard-home .dh-english-hub .dhe-stat-val-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-stat-val { font-size: 1.35rem; font-weight: 700; color: var(--text-normal); font-variant-numeric: tabular-nums; line-height: 1.15; }",
  ".dashboard-home .dh-english-hub .dhe-stat-hint { font-size: 0.71rem; color: var(--text-muted); line-height: 1.25; }",
  ".dashboard-home .dh-english-hub .dhe-actions-box { padding: 10px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-actions-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }",
  ".dashboard-home .dh-english-hub .dhe-btn-primary { flex: 1.3; min-width: 125px; height: 34px; font-size: 0.81rem; font-weight: 600; padding: 0 10px; border-radius: 7px; cursor: pointer; }",
  ".dashboard-home .dh-english-hub .dhe-btn-secondary { flex: 1; min-width: 105px; height: 34px; font-size: 0.8rem; font-weight: 600; padding: 0 10px; border-radius: 7px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease; }",
  ".dashboard-home .dh-english-hub .dhe-btn-secondary:hover, .dashboard-home .dh-english-hub .dhe-btn-secondary.is-active { border-color: #599ed6; color: #599ed6; }",
  ".dashboard-home .dh-english-hub button.dhe-book-read-btn { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 16px; border-radius: 8px; font-size: 0.86rem; font-weight: 700; cursor: pointer; background: color-mix(in srgb, #4aab80 20%, var(--background-secondary)); border: 1px solid rgba(74, 171, 128, 0.55); color: #4aab80; box-shadow: none; transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease; }",
  ".dashboard-home .dh-english-hub button.dhe-book-read-btn:hover { background: #4aab80; border-color: #4aab80; color: #141619; }",
  ".dashboard-home .dh-english-hub button.dhe-book-read-btn:active { transform: translateY(1px); }",
  ".dashboard-home .dh-english-hub .dhe-chart-tiles { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }",
  ".dashboard-home .dh-english-hub .dhe-smooth-tile { display: inline-flex; align-items: center; gap: 10px; padding: 6px 13px; border-radius: 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12); }",
  ".dashboard-home .dh-english-hub .dhe-smooth-label { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }",
  ".dashboard-home .dh-english-hub .dhe-smooth-val { font-size: 0.94rem; font-weight: 750; color: var(--text-normal); font-variant-numeric: tabular-nums; white-space: nowrap; }",
  ".dashboard-home .dh-english-hub .dhe-target-controls { display: inline-flex; align-items: center; gap: 4px; }",
  ".dashboard-home .dh-english-hub button.dhe-step-btn { width: 22px; height: 22px; min-height: 22px; padding: 0; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-muted); font-size: 0.8rem; font-weight: 700; line-height: 1; cursor: pointer; box-shadow: none; }",
  ".dashboard-home .dh-english-hub button.dhe-step-btn:hover { border-color: #4aab80; color: var(--text-normal); }",
  ".dashboard-home .dh-english-hub input.dhe-target-input { width: 54px; height: 22px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: #4aab80; font-size: 0.82rem; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }",
  ".dashboard-home .dh-english-hub .dhe-word-form { margin-top: 12px; padding: 12px 14px; background: var(--background-primary); border: 1px solid #599ed666; border-top: 2px solid #599ed6; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-details { margin-top: 10px; padding: 8px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-details > summary { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center; gap: 8px; list-style: none; }",
  ".dashboard-home .dh-english-hub .dhe-details > summary::-webkit-details-marker { display: none; }",
  ".dashboard-home .dh-english-hub .dhe-details[open] > summary { color: var(--text-normal); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--background-modifier-border); }",
  ".dashboard-home .dh-english-hub .dhe-stats-breakdown { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; }",
  ".dashboard-home .dh-english-hub .dhe-mini-stat { padding: 6px 8px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 6px; display: flex; flex-direction: column; gap: 2px; }",
  "@media (max-width: 640px) {",
  "  .dashboard-home .dh-english-hub .dhe-panel { padding: 10px 12px; }",
  "  .dashboard-home .dh-english-hub .dhe-today-bar { grid-template-columns: 1fr 1fr; gap: 8px; }",
  "  .dashboard-home .dh-english-hub .dhe-actions-box { grid-column: 1 / -1; padding: 8px 10px; }",
  "}"
].join("\n");

function injectEnglishHubStyles(targetContainer = root) {
  const style = targetContainer.createEl("style");
  style.textContent = HUB_CSS_TEXT;
}

function renderNewBookForm(parentEl, onCreated) {
  const box = parentEl.createDiv({
    cls: "dhe-panel",
    attr: {
      style: "padding: 12px 14px; margin-top: 10px; margin-bottom: 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); border-left: 3px solid #e5a158;"
    }
  });

  const head = box.createDiv({
    attr: { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;" }
  });
  head.createSpan({ text: "📖 Новая книга", attr: { style: "font-size: 0.85rem; font-weight: 600; color: var(--text-normal);" } });

  const closeBtn = head.createEl("button", {
    cls: "dh-chip",
    text: "✕ Отмена",
    attr: { type: "button", style: "font-size: 0.72rem; padding: 2px 8px; cursor: pointer;" }
  });
  closeBtn.onclick = () => {
    ui.isNewBookDrawerOpen = false;
    renderHub();
  };

  const grid = box.createDiv({
    attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 8px;" }
  });

  const titleInp = grid.createEl("input", {
    attr: { type: "text", placeholder: "Название книги *", style: "font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
  });
  const authorInp = grid.createEl("input", {
    attr: { type: "text", placeholder: "Автор", style: "font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
  });
  const genreInp = grid.createEl("input", {
    attr: { type: "text", placeholder: "Жанр (необязательно)", style: "font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
  });

  const statusSel = grid.createEl("select", {
    cls: "dropdown",
    attr: { style: "font-size: 0.8rem; height: 30px;" }
  });
  BOOK_STATUSES.forEach(st => {
    const opt = statusSel.createEl("option", { text: st, value: st });
    if (st === "Читаю") opt.selected = true;
  });

  const pagesInp = grid.createEl("input", {
    attr: { type: "number", min: "1", step: "1", placeholder: "Всего страниц", style: "font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
  });
  const readInp = grid.createEl("input", {
    attr: { type: "number", min: "0", step: "1", placeholder: "Прочитано стр.", style: "font-size: 0.82rem; height: 30px; padding: 2px 8px;" }
  });

  const actRow = box.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 8px; align-items: center;" } });
  const saveBookBtn = actRow.createEl("button", {
    cls: "dh-btn mod-cta",
    text: "Создать книгу",
    attr: { type: "button", style: "font-size: 0.8rem; height: 30px; padding: 0 14px;" }
  });

  saveBookBtn.onclick = async () => {
    if (saveBookBtn.disabled) return;
    const title = titleInp.value.trim();
    const author = authorInp.value.trim();
    const genre = genreInp.value.trim();
    const status = statusSel.value;

    if (!title) {
      notify("Укажи название книги.");
      return;
    }

    const totalRaw = pagesInp.value.trim();
    const readRaw = readInp.value.trim();
    let totalPages = null;
    let readPages = null;

    if (totalRaw !== "") {
      totalPages = parseOptionalNumber(totalRaw);
      if (totalPages === null || totalPages <= 0 || !Number.isInteger(totalPages)) {
        notify("Общее количество страниц должно быть целым числом больше нуля.");
        return;
      }
    }

    if (readRaw !== "") {
      readPages = parseOptionalNumber(readRaw);
      if (readPages === null || readPages < 0 || !Number.isInteger(readPages)) {
        notify("Прочитанные страницы должны быть неотрицательным целым числом.");
        return;
      }
    }

    if (totalPages !== null && readPages !== null && readPages > totalPages) {
      notify("Прочитанное (" + readPages + ") не может превышать общее число страниц (" + totalPages + ").");
      return;
    }

    saveBookBtn.disabled = true;
    try {
      const created = await createBookNote({ title, author, genre, status, totalPages, readPages });
      notify("Книга «" + title + "» создана.");
      ui.isNewBookDrawerOpen = false;
      if (onCreated) onCreated(created.path);
      await renderHub();
    } catch (e) {
      notify("Ошибка: " + e.message);
    } finally {
      saveBookBtn.disabled = false;
    }
  };
}

let focusWordInputAfterRender = false;
let scrollWordFormAfterRender = false;
let focusQuoteInputAfterRender = false;
let scrollQuoteFormAfterRender = false;
let scrollQuotesSectionAfterRender = false;



async function renderHub() {
  try {
    ensureHubState();

    const prevHeight = root.offsetHeight;
    if (prevHeight > 0) root.style.minHeight = prevHeight + "px";

    const todayDate = dv.date("today").startOf("day");
    const todayISO = todayDate.toISODate();
    const currentTarget = ui.dailyTarget || DEFAULT_DAILY_TARGET;

    // 1. Загрузка реестра книг (синхронно)
    const bookRegistry = loadBooks();
    const { books } = bookRegistry;

    // 2. Загрузка цитат и слов (параллельно)
    const wordsPage = dv.page(FILE);
    const wordsFile = wordsPage
      ? app.vault.getAbstractFileByPath(wordsPage.file.path)
      : app.metadataCache.getFirstLinkpathDest(FILE, dv.currentFilePath || "");

    const [allQuotes, wordsContent] = await Promise.all([
      loadQuotes(bookRegistry).catch(e => {
        console.log("Ошибка чтения цитат:", e);
        return [];
      }),
      wordsFile
        ? app.vault.read(wordsFile).catch(e => {
            console.log("Ошибка чтения Words Cards:", e);
            return null;
          })
        : Promise.resolve(null)
    ]);

    const wordsData = wordsContent !== null
      ? analyzeWordsFile(wordsContent, bookRegistry, todayISO)
      : null;

    root.empty();
    injectEnglishHubStyles(root);

    // 3. Читаем статистику. Поле карточек_пройдено записывает только my-sr-trainer.
    const diaryByISO = new Map();
    try {
      dv.pages(DIARY_FOLDER).array().forEach(d => {
        const dt = d.дата ? dv.date(d.дата) : null;
        if (dt && dt.isValid) diaryByISO.set(dt.toISODate(), d);
      });
    } catch (e) {
      console.log("Ошибка чтения Ежедневника:", e);
    }

    const diaryPage = diaryByISO.get(todayISO);
    const srTodayCount = wordsData ? wordsData.reviewedTodayDirections : 0;
    let savedTodayCount = srTodayCount;


    if (diaryPage) {
      const prevSaved = typeof diaryPage.карточек_пройдено === "number" ? diaryPage.карточек_пройдено : 0;
      savedTodayCount = Math.max(prevSaved, srTodayCount);
    }

// Файл: raw-scripts/english.js
// Заменяет: блок 3b внутри функции renderHub() (строки 770–801)

    // 3b. Автосинхронизация страниц_прочитано и привычки «чтение» (единое правило приоритета с home.js)
    if (diaryPage) {
      try {
        const syncRes = computeReadPagesToday(books, todayDate);
        const targetPages = syncRes.manualOverridePages !== null
          ? syncRes.manualOverridePages
          : (syncRes.autoBookPages > 0 ? syncRes.autoBookPages : null);

        const prevPages = typeof diaryPage[DIARY_PAGES_FIELD] === "number" ? diaryPage[DIARY_PAGES_FIELD] : null;
        const readingAlreadyOn = diaryPage[DIARY_READING_FIELD] === true || String(diaryPage[DIARY_READING_FIELD]).toLowerCase() === "true";

        const needPagesWrite = targetPages !== null && targetPages !== prevPages &&
          (ui.lastSyncedPagesDate !== todayISO || ui.lastSyncedPagesCount !== targetPages);
        const needReadingWrite = targetPages !== null && targetPages >= 1 && !readingAlreadyOn &&
          !hasAutoReadingMark(todayISO) && !isReadingHabitHandledManually(todayISO);

        if (needPagesWrite || needReadingWrite) {
          const dFilePages = app.vault.getAbstractFileByPath(diaryPage.file.path);
          if (dFilePages) {
            if (needPagesWrite) {
              ui.lastSyncedPagesDate = todayISO;
              ui.lastSyncedPagesCount = targetPages;
            }
            if (needReadingWrite) setAutoReadingMark(todayISO);
            setTimeout(() => {
              app.fileManager.processFrontMatter(dFilePages, fm => {
                if (needPagesWrite) fm[DIARY_PAGES_FIELD] = targetPages;
                if (needReadingWrite) fm[DIARY_READING_FIELD] = true;
              }).catch(e => console.log(e));
            }, 150);
          }
        }
      } catch (e) {
        console.log("Ошибка автосинхронизации чтения:", e);
      }
    }

    const wordsByBookPath = new Map();
    if (wordsData) {
      wordsData.cards.forEach(c => {
        if (c.resolvedBook) {
          const bp = c.resolvedBook.path;
          if (!wordsByBookPath.has(bp)) wordsByBookPath.set(bp, []);
          wordsByBookPath.get(bp).push(c);
        }
      });
    }

    const quoteCountByBookPath = new Map();
    allQuotes.forEach(q => {
      if (q.category === "Книга" && q.resolvedBook) {
        const bp = q.resolvedBook.path;
        quoteCountByBookPath.set(bp, (quoteCountByBookPath.get(bp) || 0) + 1);
      }
    });


    // =====================================================================
    // СЕКЦИЯ 1. СЕГОДНЯ: СТАТИСТИКА, ЗАПУСК ПЛАГИНА И ФОРМА СЛОВА
    // =====================================================================
    const todayPanel = root.createDiv({ cls: "dhe-panel" });

    if (!wordsFile || !wordsData) {
      todayPanel.createDiv({
        cls: "dh-muted",
        text: "Не удалось загрузить заметку «" + FILE + "». Проверь наличие файла в хранилище."
      });
    } else {
      const todayHead = todayPanel.createDiv({ cls: "dhe-section-head" });
      const hLeft = todayHead.createDiv({ cls: "dhe-section-title" });
      hLeft.createSpan({ text: "Сегодня · Английский" });

      const headRightLinks = todayHead.createDiv({ attr: { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" } });

      const fileLink = headRightLinks.createEl("a", {
        cls: "internal-link dhe-section-sub",
        text: "📄 " + wordsFile.basename + " (" + wordsData.totalEntries + " зап.)",
        attr: { href: wordsFile.path, style: "text-decoration: none;" }
      });
      fileLink.onclick = e => {
        e.preventDefault();
        app.workspace.openLinkText(wordsFile.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
      };

      const topGrid = todayPanel.createDiv({ cls: "dhe-today-bar" });

      const dueBox = topGrid.createDiv({
        cls: "dhe-stat-box",
        attr: { style: "border-top: 2px solid " + (wordsData.dueScheduled > 0 ? "#e5a158" : "#4aab80") + ";" }
      });
      dueBox.createDiv({ cls: "dhe-stat-label", text: "К повторению" });
      const dueValRow = dueBox.createDiv({ cls: "dhe-stat-val-row" });
      dueValRow.createSpan({
        cls: "dhe-stat-val",
        text: String(wordsData.dueScheduled),
        attr: { style: "color: " + (wordsData.dueScheduled > 0 ? "#e5a158" : "#4aab80") + ";" }
      });
      dueValRow.createSpan({
        text: wordsData.dueScheduled === 0 ? "Очередь закрыта ✓" : "карт. по расписанию",
        attr: { style: "font-size: 0.72rem; color: var(--text-muted);" }
      });
      dueBox.createDiv({
        cls: "dhe-stat-hint",
        text: wordsData.newDirections > 0
          ? "+ " + wordsData.newDirections + " новых карт. в запасе"
          : "Новых карточек в очереди нет"
      });

      const isTargetMet = savedTodayCount >= currentTarget;
      const doneBox = topGrid.createDiv({
        cls: "dhe-stat-box",
        attr: { style: "border-top: 2px solid " + (isTargetMet ? "#4aab80" : "#599ed6") + ";" }
      });
      doneBox.createDiv({ cls: "dhe-stat-label", text: "Повторений сегодня" });
      const doneValRow = doneBox.createDiv({ cls: "dhe-stat-val-row" });
      doneValRow.createSpan({ cls: "dhe-stat-val", text: String(savedTodayCount) });
      if (ui.showDailyTargetLine) {
        doneValRow.createSpan({
          text: "цель " + currentTarget,
          attr: {
            style: "font-size: 0.71rem; font-weight: 600; color: " + (isTargetMet ? "#4aab80" : "var(--text-muted)") + ";"
          }
        });
      }
      doneBox.createDiv({
        cls: "dhe-stat-hint",
        text: wordsData.reviewedTodayEntries > 0
          ? "Затронуто записей сегодня: " + wordsData.reviewedTodayEntries
          : "Оценённые показы карточек за день"
      });


      const actionsBox = topGrid.createDiv({ cls: "dhe-actions-box" });
      const actionsRow = actionsBox.createDiv({ cls: "dhe-actions-row" });

      const reviewBtnLabel = wordsData.dueScheduled > 0
        ? "▶ Карточки (" + wordsData.dueScheduled + ")"
        : "▶ Карточки";

      const reviewBtn = actionsRow.createEl("button", {
        cls: "dh-btn mod-cta dhe-btn-primary",
        text: reviewBtnLabel,
        attr: {
          type: "button",
          title: "Открыть английские карточки в my-sr-trainer",
          "aria-label": "Открыть английские карточки"
        }
      });
      reviewBtn.onclick = () => openEnglishTrainer();

      const toggleAddWordBtn = actionsRow.createEl("button", {
        cls: "dhe-btn-secondary" + (ui.isWordFormOpen ? " is-active" : ""),
        text: ui.isWordFormOpen ? "✕ Скрыть форму" : "+ Слово",
        attr: {
          type: "button",
          "aria-expanded": String(ui.isWordFormOpen)
        }
      });
      toggleAddWordBtn.onclick = () => {
        ui.isWordFormOpen = !ui.isWordFormOpen;
        if (ui.isWordFormOpen) focusWordInputAfterRender = true;
        renderHub();
      };


      if (ui.isWordFormOpen) {
        const formWrap = todayPanel.createDiv({ cls: "dhe-word-form" });

        const formTitleRow = formWrap.createDiv({
          attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;" }
        });
        formTitleRow.createSpan({
          text: "Новое слово или выражение",
          attr: { style: "font-size: 0.82rem; font-weight: 650; color: var(--text-normal);" }
        });

        if (ui.lastAddedWordInfo) {
          const addedBadge = formTitleRow.createSpan({
            text: "✓ Добавлено: " + ui.lastAddedWordInfo,
            attr: {
              style: "font-size: 0.73rem; font-weight: 600; color: #4aab80; background: #4aab8018; border: 1px solid #4aab8044; padding: 2px 8px; border-radius: 5px;"
            }
          });
          setTimeout(() => {
            ui.lastAddedWordInfo = null;
            if (addedBadge.isConnected) addedBadge.remove();
          }, 5000);
        }

        const mainInputsRow = formWrap.createDiv({
          attr: { style: "display: flex; flex-wrap: wrap; gap: 8px; align-items: center;" }
        });

        const enInput = mainInputsRow.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Слово или выражение (EN) *",
            value: ui.wordDraft.en || "",
            style: "flex: 1.2; min-width: 150px; font-size: 0.84rem; padding: 5px 10px; height: 32px;"
          }
        });

        const trBtn = mainInputsRow.createEl("button", {
          cls: "dh-chip",
          text: "🌐 Перевести",
          attr: { type: "button", style: "font-size: 0.8rem; height: 32px; padding: 0 12px; white-space: nowrap; cursor: pointer;" }
        });

        const ruInput = mainInputsRow.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Перевод (RU) *",
            value: ui.wordDraft.ru || "",
            style: "flex: 1.6; min-width: 170px; font-size: 0.84rem; padding: 5px 10px; height: 32px;"
          }
        });

        const variantsBox = formWrap.createDiv({
          attr: { style: "display: " + (ui.translatedGroups.length ? "flex" : "none") + "; flex-direction: column; gap: 6px; padding: 6px 8px; background: var(--background-secondary); border-radius: 6px;" }
        });

        const secondRow = formWrap.createDiv({
          attr: { style: "display: flex; flex-wrap: wrap; gap: 8px; align-items: center;" }
        });

        const exInput = secondRow.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Пример предложения (необязательно)",
            value: ui.wordDraft.ex || "",
            style: "flex: 2; min-width: 200px; font-size: 0.83rem; padding: 5px 10px; height: 32px;"
          }
        });

        const sourceBookSelect = secondRow.createEl("select", {
          cls: "dropdown",
          attr: {
            title: "Привязать слово к книге-источнику (необязательно)",
            style: "flex: 1; min-width: 165px; max-width: 260px; font-size: 0.79rem; height: 32px;"
          }
        });
        sourceBookSelect.createEl("option", { text: "Источник: без книги", value: "" });

        const sortedBooksForWord = [...books].sort((a, b) => {
          const aR = a.status === "Читаю" ? 0 : 1;
          const bR = b.status === "Читаю" ? 0 : 1;
          return aR - bR || a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        });

        sortedBooksForWord.forEach(b => {
          const opt = sourceBookSelect.createEl("option", {
            text: (b.status === "Читаю" ? "📖 " : "") + b.title,
            value: b.path
          });
          if (ui.wordDraft.bookPath === b.path) opt.selected = true;
        });

        sourceBookSelect.onchange = () => {
          ui.wordDraft.bookPath = sourceBookSelect.value;
        };

        const addBtn = secondRow.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "+ Сохранить",
          attr: { type: "button", style: "font-size: 0.82rem; height: 32px; padding: 0 16px; white-space: nowrap;" }
        });

        const dupHint = formWrap.createDiv({
          attr: { style: "font-size: 0.76rem; color: #e5a158; display: none;" }
        });

        const showDup = list => {
          dupHint.empty();
          if (!list.length) {
            dupHint.style.display = "none";
            return;
          }
          dupHint.style.display = "block";
          list.slice(0, 3).forEach(c => {
            dupHint.createDiv({ text: "⚠️ Уже есть в базе: " + c.front + " ::: " + c.back + " (строка " + c.lineNumber + ")" });
          });
        };

        let pendingKey = null;
        const resetPending = () => {
          pendingKey = null;
          addBtn.setText("+ Сохранить");
        };

        const applySelectedVariants = () => {
          ruInput.value = ui.selectedVariants.join("; ");
          ui.wordDraft.ru = ruInput.value;
          resetPending();
        };

        const renderVariants = groups => {
          variantsBox.empty();
          if (!groups.length) {
            variantsBox.style.display = "none";
            return;
          }
          variantsBox.style.display = "flex";
          groups.forEach(g => {
            const row = variantsBox.createDiv({ attr: { style: "display: flex; flex-wrap: wrap; gap: 6px; align-items: center;" } });
            row.createSpan({ text: g.pos, attr: { style: "font-size: 0.7rem; color: var(--text-muted); min-width: 85px;" } });
            g.terms.forEach(term => {
              const chip = row.createEl("button", {
                text: term,
                attr: { type: "button", style: "font-size: 0.78rem; padding: 2px 10px; border-radius: 12px; cursor: pointer;" }
              });
              const paint = () => {
                const on = ui.selectedVariants.includes(term);
                chip.style.background = on ? "var(--interactive-accent)" : "";
                chip.style.color = on ? "var(--text-on-accent)" : "";
              };
              chip.onclick = () => {
                ui.selectedVariants = ui.selectedVariants.includes(term)
                  ? ui.selectedVariants.filter(x => x !== term)
                  : [...ui.selectedVariants, term];
                paint();
                applySelectedVariants();
              };
              paint();
            });
          });
        };

        if (ui.translatedGroups.length) {
          renderVariants(ui.translatedGroups);
        }

        const doTranslate = async () => {
          const en = enInput.value.trim();
          if (!en) {
            notify("Сначала впиши английское слово или выражение.");
            enInput.focus();
            return;
          }
          if (trBtn.disabled) return;
          trBtn.disabled = true;
          trBtn.setText("⏳...");
          try {
            const groups = await fetchTranslations(en);
            if (!groups.length) {
              notify("Переводов не найдено — впиши вручную.");
              ui.translatedGroups = [];
              ui.selectedVariants = [];
              renderVariants([]);
              return;
            }
            ui.translatedGroups = groups;
            ui.selectedVariants = [];
            if (groups.length === 1 && groups[0].terms.length >= 1) {
              ui.selectedVariants = [groups[0].terms[0]];
              applySelectedVariants();
            }
            renderVariants(groups);
            ruInput.focus();
          } catch (e) {
            notify("Не удалось получить перевод: " + e.message + ". Впиши вручную.");
          } finally {
            trBtn.disabled = false;
            trBtn.setText("🌐 Перевести");
          }
        };

        const checkDuplicatesLive = () => {
          const k = wordKey(enInput.value);
          showDup(k ? wordsData.cards.filter(c => c.key === k) : []);
        };
        checkDuplicatesLive();

        enInput.oninput = () => {
          ui.wordDraft.en = enInput.value;
          resetPending();
          ui.translatedGroups = [];
          ui.selectedVariants = [];
          renderVariants([]);
          checkDuplicatesLive();
        };

        ruInput.oninput = () => {
          ui.wordDraft.ru = ruInput.value;
          resetPending();
        };

        exInput.oninput = () => {
          ui.wordDraft.ex = exInput.value;
        };

        const submitWord = async () => {
          if (addBtn.disabled) return;
          const en = enInput.value.trim().replace(/\s+/g, " ");
          const ru = ruInput.value.trim().replace(/\s+/g, " ");
          const ex = cleanExample(exInput.value);
          const chosenBook = bookRegistry.byPath.get(sourceBookSelect.value) || null;

          if (!en || !ru) {
            notify("Заполни и английское слово, и русский перевод.");
            return;
          }

          addBtn.disabled = true;
          try {
            const freshContent = await app.vault.read(wordsFile);
            const freshParsed = analyzeWordsFile(freshContent, bookRegistry, todayISO);
            const k = wordKey(en);
            const same = freshParsed.cards.filter(c => c.key === k);

            if (same.length) {
              showDup(same);
              const exact = same.some(c => normText(c.back) === normText(ru));
              if (exact) {
                notify("Такая карточка с этим переводом уже есть — дубликат не добавлен.");
                return;
              }
              const pk = k + "|" + normText(ru);
              if (pendingKey !== pk) {
                pendingKey = pk;
                addBtn.setText("Всё равно добавить");
                notify("Слово уже есть с другим переводом. Нажми ещё раз, если хочешь добавить ещё одну карточку.");
                return;
              }
            }

            const front = ex ? en + EXAMPLE_SEP + ex : en;
            const backWithSource = chosenBook ? ru + " · [[" + chosenBook.fileName + "]]" : ru;
            const prefix = freshContent.length > 0 && !freshContent.endsWith("\n") ? "\n" : "";

            await enqueueDiskWrite(() => app.vault.append(wordsFile, prefix + front + " ::: " + backWithSource + "\n"));

            ui.lastAddedWordInfo = en + " ::: " + ru + (chosenBook ? " (" + chosenBook.title + ")" : "");
            ui.wordDraft.en = "";
            ui.wordDraft.ru = "";
            ui.wordDraft.ex = "";
            ui.selectedVariants = [];
            ui.translatedGroups = [];
            focusWordInputAfterRender = true;

            notify("Карточка добавлена: " + front + " ::: " + ru);
            await renderHub();
          } catch (e) {
            notify("Ошибка добавления: " + e.message);
          } finally {
            if (addBtn.isConnected) addBtn.disabled = false;
          }
        };

        trBtn.onclick = doTranslate;
        addBtn.onclick = submitWord;
        enInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); doTranslate(); } };
        ruInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submitWord(); } };
        exInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submitWord(); } };

        if (focusWordInputAfterRender || scrollWordFormAfterRender) {
          const shouldScroll = scrollWordFormAfterRender;
          focusWordInputAfterRender = false;
          scrollWordFormAfterRender = false;
          setTimeout(() => {
            if (shouldScroll && formWrap.isConnected) {
              formWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            if (enInput.isConnected) {
              enInput.focus({ preventScroll: shouldScroll });
            }
          }, 30);
        }
      }

      const totalCards = wordsData.totalCardDirections;
      const maturePct = totalCards > 0 ? Math.round((wordsData.matureDirections / totalCards) * 100) : 0;

      const statsDetails = todayPanel.createEl("details", { cls: "dhe-details" });
      statsDetails.open = Boolean(ui.statsDetailsOpen);
      statsDetails.ontoggle = () => { ui.statsDetailsOpen = statsDetails.open; };

      const summaryEl = statsDetails.createEl("summary");
      summaryEl.createSpan({
        text: "Статистика базы · Закреплено " + maturePct + "% (" + wordsData.matureDirections + " из " + totalCards + " карт. · словарных записей: " + wordsData.totalEntries + ")"
      });
      summaryEl.createSpan({ text: "▾", attr: { style: "font-size: 0.7rem;" } });

      if (totalCards > 0) {
        const barTrack = statsDetails.createDiv({
          attr: {
            style: "height: 7px; background: var(--background-modifier-border); border-radius: 4px; overflow: hidden; display: flex; margin-bottom: 10px;"
          }
        });
        for (const [val, color, label] of [
          [wordsData.matureDirections, "#4aab80", "Закреплено"],
          [wordsData.learningDirections, "#e5a158", "В изучении"],
          [wordsData.newDirections, "#599ed6", "Новые"]
        ]) {
          if (val > 0) {
            barTrack.createDiv({
              attr: {
                title: label + ": " + val + " из " + totalCards + " карт. (" + Math.round((val / totalCards) * 100) + "%)",
                style: "width: " + ((val / totalCards) * 100) + "%; background: " + color + "; height: 100%;"
              }
            });
          }
        }
      }

      const breakdownGrid = statsDetails.createDiv({ cls: "dhe-stats-breakdown" });
      const createMiniStat = (title, val, hint, color) => {
        const b = breakdownGrid.createDiv({ cls: "dhe-mini-stat" });
        b.createSpan({ text: title, attr: { style: "font-size: 0.7rem; color: var(--text-muted);" } });
        b.createSpan({
          text: String(val),
          attr: { style: "font-size: 0.96rem; font-weight: 700; color: " + (color || "var(--text-normal)") + "; font-variant-numeric: tabular-nums;" }
        });
        b.createSpan({ text: hint, attr: { style: "font-size: 0.67rem; color: var(--text-faint);" } });
      };

      createMiniStat(
        "Всего карточек",
        totalCards,
        "из " + wordsData.totalEntries + " словарных записей (у ::: две стороны)",
        "var(--text-normal)"
      );
      createMiniStat(
        "Закреплено",
        wordsData.matureDirections + " (" + maturePct + "%)",
        "интервал ≥ " + MATURE_DAYS + " дн.",
        "#4aab80"
      );
      createMiniStat(
        "В изучении",
        wordsData.learningDirections,
        "интервал от 1 до " + (MATURE_DAYS - 1) + " дн.",
        "#e5a158"
      );
      createMiniStat(
        "Новые",
        wordsData.newDirections,
        wordsData.unscheduledDirections > 0
          ? "в т.ч. " + wordsData.unscheduledDirections + " без штампа SR"
          : "ждут первого показа",
        "#599ed6"
      );
    }

    // =====================================================================
    // СЕКЦИЯ 2. ЧИТАЮ СЕЙЧАС И ПРОЧИТАННЫЕ КНИГИ
    // =====================================================================
    const checkIsBookFinished = b =>
      b.status === "Прочитано" ||
      (b.totalPages !== null && b.totalPages > 0 && b.readPages !== null && b.readPages >= b.totalPages);

    const visibleBooks = books
      .filter(b => b.status === "Читаю" || b.status === "Прочитано")
      .sort((a, b) => {
        const aFin = checkIsBookFinished(a) ? 1 : 0;
        const bFin = checkIsBookFinished(b) ? 1 : 0;
        return aFin - bFin || a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
      });

    const favFilterOn = Boolean(ui.onlyFavoriteBooks);
    const favBooksTotal = visibleBooks.filter(b => b.isFavorite).length;
    const activeBooks = visibleBooks.filter(b => !checkIsBookFinished(b) && (!favFilterOn || b.isFavorite));

    const doneDateKey = b => b.finishedISO || b.lastReadISO || "";
    const compareByDoneDate = (a, b) => {
      const ak = doneDateKey(a);
      const bk = doneDateKey(b);
      if (Boolean(ak) !== Boolean(bk)) return ak ? -1 : 1;
      if (ak !== bk) return String(bk).localeCompare(String(ak));
      return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
    };
    const doneBooks = visibleBooks
      .filter(b => checkIsBookFinished(b) && (!favFilterOn || b.isFavorite))
      .sort((a, b) => {
        if (ui.doneBooksSort === "fav") return (Number(b.isFavorite) - Number(a.isFavorite)) || compareByDoneDate(a, b);
        if (ui.doneBooksSort === "title") return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        return compareByDoneDate(a, b);
      });

    function renderBookWordsDrawer(bCard, book, linkedWords) {
      const wCount = linkedWords.length;
      const wordsDrawer = bCard.createDiv({
        attr: {
          style: "padding: 8px 10px; background: var(--background-secondary); border-radius: 6px; border: 1px solid var(--background-modifier-border); display: flex; flex-direction: column; gap: 5px; max-height: 210px; overflow-y: auto;"
        }
      });
      const drawerHead = wordsDrawer.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;" }
      });
      drawerHead.createSpan({
        text: "Слова из книги (" + wCount + "):",
        attr: { style: "font-size: 0.72rem; font-weight: 600; color: var(--text-muted);" }
      });

      const drawerBtns = drawerHead.createDiv({ attr: { style: "display: flex; gap: 4px;" } });
      const trainBookWordsBtn = drawerBtns.createEl("button", {
        cls: "dh-chip",
        text: "▶ Тренировать",
        attr: {
          type: "button",
          style: "font-size: 0.69rem; font-weight: 600; padding: 1px 8px; height: 21px; color: #4aab80; border-color: #4aab8055; cursor: pointer;"
        }
      });
      trainBookWordsBtn.onclick = () => {
        openEnglishTrainer("BOOK", book.path);
      };

      linkedWords.slice().reverse().forEach(cw => {
        const wRow = wordsDrawer.createDiv({
          attr: {
            style: "display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 0.76rem; padding-top: 4px; border-top: 1px solid var(--background-modifier-border); cursor: pointer;"
          }
        });
        const leftW = wRow.createDiv({ attr: { style: "min-width: 0; flex: 1;" } });
        leftW.createSpan({ text: cw.word, attr: { style: "font-weight: 700; color: var(--text-normal);" } });
        leftW.createSpan({ text: " — " + cw.back, attr: { style: "color: var(--text-muted);" } });
        if (cw.example) {
          leftW.createDiv({ text: cw.example, attr: { style: "font-size: 0.71rem; color: var(--text-faint); font-style: italic;" } });
        }

        const rightW = wRow.createDiv({ attr: { style: "display: flex; align-items: center; gap: 6px; flex-shrink: 0;" } });
        if (cw.sourceCfi && book.epubPath) {
          const jumpBtn = rightW.createEl("button", {
            cls: "dh-chip",
            text: "📖 К месту",
            attr: {
              type: "button",
              title: "Открыть книгу на том месте, где встретилось это слово",
              style: "font-size: 0.66rem; padding: 1px 6px; height: 19px; color: #e5a158; border-color: #e5a15855; cursor: pointer;"
            }
          });
          jumpBtn.onclick = e => {
            e.stopPropagation();
            openBookInEpubPlugin(book.epubPath, cw.sourceCfi);
          };
        }

        rightW.createSpan({
          text: "стр. " + cw.lineNumber,
          attr: { style: "font-size: 0.68rem; color: var(--text-faint); white-space: nowrap;" }
        });
        wRow.onclick = () => {
          if (wordsFile) openFileAtLine(wordsFile.path, cw.lineIndex);
        };
      });
    }

    const readingPanel = root.createDiv({ cls: "dhe-panel" });
    const readingHeader = readingPanel.createDiv({ cls: "dhe-section-head" });
    const rTitleWrap = readingHeader.createDiv({ cls: "dhe-section-title" });
    rTitleWrap.createSpan({ text: "Читаю сейчас" });
    if (activeBooks.length > 1) {
      rTitleWrap.createSpan({ cls: "dhe-section-sub", text: String(activeBooks.length) });
    }

    const readingHeadActions = readingHeader.createDiv({ attr: { style: "display: flex; gap: 6px; align-items: center; flex-wrap: wrap;" } });
    if (favBooksTotal > 0 || favFilterOn) {
      const favBooksChip = readingHeadActions.createEl("button", {
        cls: "dh-chip" + (favFilterOn ? " is-active" : ""),
        text: "♥\uFE0E Любимые (" + favBooksTotal + ")",
        attr: {
          type: "button",
          title: favFilterOn ? "Показать все книги" : "Показать только любимые книги",
          "aria-pressed": String(favFilterOn),
          style: "font-size: 0.74rem; padding: 2px 10px; cursor: pointer;" + (favFilterOn ? "" : " color: " + STATUS_COLORS["Любимое"] + ";")
        }
      });
      favBooksChip.onclick = () => {
        ui.onlyFavoriteBooks = !ui.onlyFavoriteBooks;
        renderHub();
      };
    }

    const addBookTopBtn = readingHeadActions.createEl("button", {
      cls: "dh-chip" + (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "reading" ? " is-active" : ""),
      text: ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "reading" ? "✕ Закрыть" : "+ Добавить книгу",
      attr: { type: "button", style: "font-size: 0.74rem; padding: 2px 10px; cursor: pointer;" }
    });
    addBookTopBtn.onclick = () => {
      if (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "reading") {
        ui.isNewBookDrawerOpen = false;
      } else {
        ui.isNewBookDrawerOpen = true;
        ui.newBookDrawerContext = "reading";
      }
      renderHub();
    };

    if (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "reading") {
      renderNewBookForm(readingPanel, null);
    }

    if (visibleBooks.length === 0) {
      const emptyReading = readingPanel.createDiv({
        attr: {
          style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 12px; background: var(--background-primary); border-radius: 6px; border: 1px dashed var(--background-modifier-border);"
        }
      });
      emptyReading.createSpan({
        text: "Нет активных или прочитанных книг",
        attr: { style: "font-size: 0.82rem; color: var(--text-muted);" }
      });
    } else {
      if (activeBooks.length === 0) {
        readingPanel.createDiv({
          text: favFilterOn ? "Среди читаемых книг нет любимых" : "Сейчас ничего не читаю",
          attr: { style: "padding: 10px 12px; font-size: 0.82rem; color: var(--text-muted); background: var(--background-primary); border-radius: 6px; border: 1px dashed var(--background-modifier-border);" }
        });
      }

      const readingGrid = readingPanel.createDiv({
        attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(285px, 1fr)); gap: 12px; align-items: start;" }
      });

      activeBooks.forEach(book => {
        const isFinished = checkIsBookFinished(book);
        const accentColor = isFinished ? "#4aab80" : "#e5a158";
        const qCount = quoteCountByBookPath.get(book.path) || 0;
        const linkedWords = wordsByBookPath.get(book.path) || [];
        const wCount = linkedWords.length;
        const isConfirmingFinish = !isFinished && ui.finishConfirmBookPath === book.path;
        const isWordsListOpen = ui.openBookWordsPaths.has(book.path);

        const bCard = readingGrid.createDiv({
          cls: "dh-card",
          attr: {
            style: [
              "padding: 12px 14px;",
              "background: " + (isFinished ? "color-mix(in srgb, #4aab80 6%, var(--background-primary))" : "var(--background-primary)") + ";",
              "border: 1px solid " + (isFinished ? "rgba(74, 171, 128, 0.4)" : "var(--background-modifier-border)") + ";",
              "border-left: 3px solid " + accentColor + ";",
              "border-radius: 8px;",
              "display: flex;",
              "flex-direction: column;",
              "justify-content: space-between;",
              "gap: 8px;"
            ].join(" ")
          }
        });

        const topBox = bCard.createDiv({ attr: { style: "display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 6px 8px;" } });
        const titleCol = topBox.createDiv({ attr: { style: "min-width: 0; flex: 1 1 150px;" } });

        const bookLink = titleCol.createEl("a", {
          cls: "internal-link",
          text: book.title,
          attr: {
            href: book.path,
            style: "font-size: 0.95rem; font-weight: 700; color: var(--text-normal); text-decoration: none; display: block; line-height: 1.3;"
          }
        });
        bookLink.onclick = e => {
          e.preventDefault();
          app.workspace.openLinkText(book.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
        };

        const subParts = [];
        if (book.author) subParts.push(book.author);
        if (book.genre) subParts.push(book.genre);
        if (book.lastReadISO) {
          const fmtLast = dv.date(book.lastReadISO)?.toFormat("dd.MM.yyyy") || book.lastReadISO;
          subParts.push("чтение: " + fmtLast);
        }
        if (subParts.length) {
          titleCol.createDiv({
            text: subParts.join(" · "),
            attr: { style: "font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;" }
          });
        }

        const countersWrap = topBox.createDiv({ attr: { style: "display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; align-items: center;" } });
        createBookFavButton(countersWrap, book);
        if (isFinished) {
          countersWrap.createSpan({
            text: "✓ Завершена",
            attr: {
              style: "font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(74, 171, 128, 0.16); color: #4aab80; border: 1px solid rgba(74, 171, 128, 0.4);"
            }
          });
        }
        if (wCount > 0) {
          const wBadge = countersWrap.createEl("button", {
            cls: "dh-chip" + (isWordsListOpen ? " is-active" : ""),
            text: "Слов: " + wCount + " ▾",
            attr: {
              type: "button",
              title: "Показать слова, добавленные из этой книги",
              style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer;"
            }
          });
          wBadge.onclick = () => {
            if (ui.openBookWordsPaths.has(book.path)) ui.openBookWordsPaths.delete(book.path);
            else ui.openBookWordsPaths.add(book.path);
            renderHub();
          };
        }
        if (qCount > 0) {
          const qBadge = countersWrap.createEl("button", {
            cls: "dh-chip" + (ui.activeFilter === "BOOKS" && ui.selectedBookFilterKey === ("BOOK:" + book.path) ? " is-active" : ""),
            text: "Цитат: " + qCount,
            attr: {
              type: "button",
              title: "Показать цитаты из этой книги",
              style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer;"
            }
          });
          qBadge.onclick = () => {
            ui.showRandom = false;
            ui.activeFilter = "BOOKS";
            ui.selectedBookFilterKey = "BOOK:" + book.path;
            scrollQuotesSectionAfterRender = true;
            renderHub();
          };
        }

        const progBox = bCard.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 5px; margin: 2px 0;" } });
        const hasTotal = book.totalPages !== null && book.totalPages > 0;
        const hasRead = book.readPages !== null && book.readPages >= 0;

        if (hasTotal) {
          const currentRead = isFinished ? book.totalPages : (hasRead ? book.readPages : 0);
          const pct = isFinished
            ? 100
            : (book.progressPct !== null ? book.progressPct : Math.min(100, Math.max(0, Math.round((currentRead / book.totalPages) * 100))));

          const progLabels = progBox.createDiv({ attr: { style: "display: flex; justify-content: space-between; align-items: baseline; font-size: 0.76rem;" } });
          progLabels.createSpan({
            text: currentRead + " / " + book.totalPages + " стр.",
            attr: { style: "font-weight: 600; color: var(--text-normal);" }
          });
          progLabels.createSpan({
            text: pct + "%",
            attr: { style: "font-weight: 700; color: " + accentColor + ";" }
          });

          const track = progBox.createDiv({
            attr: { style: "height: 6px; background: var(--background-modifier-border); border-radius: 3px; overflow: hidden;" }
          });
          track.createDiv({
            attr: { style: "width: " + pct + "%; height: 100%; background: " + accentColor + "; transition: width 0.2s ease;" }
          });
        } else if (isFinished) {
          progBox.createDiv({
            text: "Книга полностью прочитана (100%)",
            attr: { style: "font-size: 0.76rem; color: #4aab80; font-weight: 600;" }
          });
        } else if (hasRead) {
          progBox.createDiv({
            text: "Прочитано: " + book.readPages + " стр. (общий объём не указан)",
            attr: { style: "font-size: 0.76rem; color: var(--text-muted);" }
          });
        } else {
          progBox.createDiv({
            text: "Прогресс обновится автоматически при открытии книги",
            attr: { style: "font-size: 0.76rem; color: var(--text-muted); font-style: italic;" }
          });
        }

        if (isWordsListOpen && wCount > 0) {
          renderBookWordsDrawer(bCard, book, linkedWords);
        }

        if (!isFinished) {
          const actionsRow = bCard.createDiv({
            attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding-top: 8px; border-top: 1px solid var(--background-modifier-border);" }
          });

          if (book.epubPath) {
            const openEpubBtn = actionsRow.createEl("button", {
              cls: "dhe-book-read-btn",
              text: "📖 Читать",
              attr: {
                type: "button",
                title: "Открыть книгу в читалке EPUB на текущей странице"
              }
            });
            openEpubBtn.onclick = () => {
              openBookInEpubPlugin(book.epubPath);
            };
          } else {
            actionsRow.createSpan({
              text: "Файл .epub не привязан в свойстве «книга»",
              attr: { style: "font-size: 0.73rem; color: var(--text-muted); flex: 1;" }
            });
          }

          const rightActs = actionsRow.createDiv({ attr: { style: "display: flex; gap: 4px; align-items: center; flex-shrink: 0;" } });
          if (!isConfirmingFinish) {
            const finBtn = rightActs.createEl("button", {
              cls: "dh-chip",
              text: "Завершить",
              attr: {
                type: "button",
                title: "Отметить книгу прочитанной",
                style: "font-size: 0.74rem; height: 32px; padding: 0 10px; cursor: pointer;"
              }
            });
            finBtn.onclick = () => {
              ui.finishConfirmBookPath = book.path;
              renderHub();
            };
          } else {
            rightActs.createSpan({ text: "Завершить?", attr: { style: "font-size: 0.72rem; color: var(--text-muted);" } });
            const confirmYes = rightActs.createEl("button", {
              cls: "dh-btn mod-cta",
              text: "Да",
              attr: { type: "button", style: "font-size: 0.72rem; height: 28px; padding: 0 10px;" }
            });
            const confirmNo = rightActs.createEl("button", {
              cls: "dh-chip",
              text: "Нет",
              attr: { type: "button", style: "font-size: 0.72rem; height: 28px; padding: 0 8px;" }
            });
            confirmNo.onclick = () => {
              ui.finishConfirmBookPath = null;
              renderHub();
            };
            confirmYes.onclick = async () => {
              const f = app.vault.getAbstractFileByPath(book.path);
              if (!f) { notify("Файл книги не найден."); return; }
              confirmYes.disabled = true;
              try {
                const finalReadPages = book.totalPages !== null && book.totalPages > 0 ? book.totalPages : book.readPages;
                await app.fileManager.processFrontMatter(f, fm => {
                  fm["статус"] = "Прочитано";
                  if (!fm["дата_завершения"]) fm["дата_завершения"] = todayISO;
                  if (finalReadPages !== null) fm["прочитано"] = finalReadPages;
                });
                ui.localBookOverrides.set(book.path, {
                  ...(ui.localBookOverrides.get(book.path) || {}),
                  статус: "Прочитано",
                  дата_завершения: book.finishedISO || todayISO,
                  ...(finalReadPages !== null ? { прочитано: finalReadPages } : {})
                });
                ui.finishConfirmBookPath = null;
                notify("Книга «" + book.title + "» завершена.");
                await renderHub();
              } catch (e) {
                notify("Ошибка: " + e.message);
              } finally {
                confirmYes.disabled = false;
              }
            };
          }
        }
      });
    }

    if (doneBooks.length > 0) {
      const doneDetails = readingPanel.createEl("details", {
        cls: "dhe-details",
        attr: { style: "margin-top: 12px;" }
      });
      doneDetails.open = ui.finishedBooksOpen !== false;
      doneDetails.ontoggle = () => { ui.finishedBooksOpen = doneDetails.open; };

      const doneSum = doneDetails.createEl("summary");
      doneSum.createSpan({ text: "✓ Прочитано · " + doneBooks.length });
      doneSum.createSpan({ text: "▾", attr: { style: "font-size: 0.7rem;" } });

      if (doneBooks.length > 1) {
        const doneTools = doneDetails.createDiv({ attr: { style: "display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-bottom: 4px;" } });
        doneTools.createSpan({ text: "Порядок", attr: { style: "font-size: 0.72rem; color: var(--text-muted);" } });
        const doneSortSel = doneTools.createEl("select", {
          cls: "dropdown",
          attr: { style: "font-size: 0.76rem; height: 26px;" }
        });
        [
          { value: "date", text: "По дате завершения" },
          { value: "fav", text: "Сначала любимые" },
          { value: "title", text: "По названию" }
        ].forEach(opt => {
          const o = doneSortSel.createEl("option", { text: opt.text, value: opt.value });
          if (opt.value === (ui.doneBooksSort || "date")) o.selected = true;
        });
        doneSortSel.onchange = () => {
          ui.doneBooksSort = doneSortSel.value;
          renderHub();
        };
      }

      const doneList = doneDetails.createDiv({ attr: { style: "display: flex; flex-direction: column;" } });

      doneBooks.forEach((book, idx) => {
        const qCount = quoteCountByBookPath.get(book.path) || 0;
        const linkedWords = wordsByBookPath.get(book.path) || [];
        const wCount = linkedWords.length;
        const isWordsListOpen = ui.openBookWordsPaths.has(book.path);

        const item = doneList.createDiv({
          attr: {
            style: "display: flex; flex-direction: column; gap: 6px; padding: 8px 0;" +
              (idx > 0 ? " border-top: 1px solid var(--background-modifier-border);" : "")
          }
        });

        const row = item.createDiv({ attr: { style: "display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;" } });
        row.createSpan({ text: "✓", attr: { style: "color: #4aab80; font-weight: 700; font-size: 0.85rem; flex-shrink: 0;" } });

        const titleCol = row.createDiv({ attr: { style: "min-width: 0; flex: 1 1 170px;" } });
        const doneLink = titleCol.createEl("a", {
          cls: "internal-link",
          text: book.title,
          attr: {
            href: book.path,
            style: "font-size: 0.88rem; font-weight: 600; color: var(--text-normal); text-decoration: none; display: block; line-height: 1.3;"
          }
        });
        doneLink.onclick = e => {
          e.preventDefault();
          app.workspace.openLinkText(book.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
        };

        const doneSub = [];
        if (book.author) doneSub.push(book.author);
        if (book.genre) doneSub.push(book.genre);
        if (book.finishedISO) {
          doneSub.push("завершено: " + (dv.date(book.finishedISO)?.toFormat("dd.MM.yyyy") || book.finishedISO));
        } else if (book.lastReadISO) {
          doneSub.push("чтение: " + (dv.date(book.lastReadISO)?.toFormat("dd.MM.yyyy") || book.lastReadISO));
        }
        if (doneSub.length) {
          titleCol.createDiv({
            text: doneSub.join(" · "),
            attr: { style: "font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;" }
          });
        }

        const metaRight = row.createDiv({ attr: { style: "display: flex; align-items: center; flex-wrap: wrap; gap: 5px; flex-shrink: 0;" } });
        if (book.totalPages !== null && book.totalPages > 0) {
          metaRight.createSpan({
            text: book.totalPages + " стр.",
            attr: { style: "font-size: 0.74rem; color: var(--text-muted); white-space: nowrap;" }
          });
        }
        if (wCount > 0) {
          const doneWBadge = metaRight.createEl("button", {
            cls: "dh-chip" + (isWordsListOpen ? " is-active" : ""),
            text: "Слов: " + wCount + " ▾",
            attr: {
              type: "button",
              title: "Показать слова, добавленные из этой книги",
              style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer;"
            }
          });
          doneWBadge.onclick = () => {
            if (ui.openBookWordsPaths.has(book.path)) ui.openBookWordsPaths.delete(book.path);
            else ui.openBookWordsPaths.add(book.path);
            renderHub();
          };
        }
        if (qCount > 0) {
          const doneQBadge = metaRight.createEl("button", {
            cls: "dh-chip" + (ui.activeFilter === "BOOKS" && ui.selectedBookFilterKey === ("BOOK:" + book.path) ? " is-active" : ""),
            text: "Цитат: " + qCount,
            attr: {
              type: "button",
              title: "Показать цитаты из этой книги",
              style: "font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; cursor: pointer;"
            }
          });
          doneQBadge.onclick = () => {
            ui.showRandom = false;
            ui.activeFilter = "BOOKS";
            ui.selectedBookFilterKey = "BOOK:" + book.path;
            scrollQuotesSectionAfterRender = true;
            renderHub();
          };
        }
        createBookFavButton(metaRight, book);

        if (isWordsListOpen && wCount > 0) {
          renderBookWordsDrawer(item, book, linkedWords);
        }
      });
    }

    // =====================================================================
    // СЕКЦИЯ 3. ЦИТАТЫ И МЫСЛИ
    // =====================================================================
    const quotesSection = root.createDiv({ cls: "dhe-panel" });

    if (scrollQuotesSectionAfterRender) {
      scrollQuotesSectionAfterRender = false;
      setTimeout(() => {
        if (quotesSection.isConnected) {
          quotesSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 30);
    }

    const mainQuotes = allQuotes.filter(q => !q.isArchivedCategory);
    const bookQuotes = mainQuotes.filter(q => q.category === "Книга");
    const thoughtQuotes = mainQuotes.filter(q => q.category === "Мысль");
    const archivedQuotes = allQuotes.filter(q => q.isArchivedCategory);

    const quotesTopBar = quotesSection.createDiv({ cls: "dhe-section-head" });

    const leftTitleAndTabs = quotesTopBar.createDiv({
      attr: { style: "display: flex; align-items: center; gap: 10px; flex-wrap: wrap;" }
    });
    leftTitleAndTabs.createSpan({ cls: "dhe-section-title", text: "Цитаты и мысли" });

    const filterChips = leftTitleAndTabs.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 5px; flex-wrap: wrap;" } });
    [
      { id: "ALL", label: "Все (" + mainQuotes.length + ")" },
      { id: "BOOKS", label: "📖 Книги (" + bookQuotes.length + ")" },
      { id: "THOUGHTS", label: "💡 Мысли (" + thoughtQuotes.length + ")" }
    ].forEach(tab => {
      const btn = filterChips.createEl("button", {
        cls: "dh-chip" + (ui.activeFilter === tab.id ? " is-active" : ""),
        text: tab.label,
        attr: { type: "button", style: "font-size: 0.75rem; padding: 3px 10px; cursor: pointer;" }
      });
      btn.onclick = () => {
        ui.showRandom = false;
        ui.activeFilter = tab.id;
        renderHub();
      };
    });

    const favCount = mainQuotes.filter(q => q.isFavorite).length;
    const favFilterBtn = filterChips.createEl("button", {
      cls: "dh-chip" + (ui.onlyFavorites ? " is-active" : ""),
      text: "♥\uFE0E Любимые (" + favCount + ")",
      attr: {
        type: "button",
        title: ui.onlyFavorites ? "Показать все записи" : "Показать только любимые",
        "aria-pressed": String(Boolean(ui.onlyFavorites)),
        style: "font-size: 0.75rem; padding: 3px 10px; cursor: pointer;" + (ui.onlyFavorites ? "" : " color: " + STATUS_COLORS["Любимое"] + ";")
      }
    });
    favFilterBtn.onclick = () => {
      ui.showRandom = false;
      ui.onlyFavorites = !ui.onlyFavorites;
      renderHub();
    };

    const rightControls = quotesTopBar.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 6px; align-items: center; flex-wrap: wrap;" } });

    if (mainQuotes.length > 1) {
      const randBtn = rightControls.createEl("button", {
        cls: "dh-chip" + (ui.showRandom ? " is-active" : ""),
        text: "🎲 Случайная",
        attr: { type: "button", style: "font-size: 0.74rem; padding: 3px 10px; cursor: pointer;" }
      });
      randBtn.onclick = () => {
        ui.showRandom = !ui.showRandom;
        renderHub();
      };
    }

    const toggleFormBtn = rightControls.createEl("button", {
      cls: "dh-chip" + (ui.isQuoteFormOpen ? " is-active" : ""),
      text: ui.isQuoteFormOpen ? "✕ Закрыть форму" : "✍️ + Добавить",
      attr: {
        type: "button",
        style: "font-size: 0.75rem; font-weight: 600; padding: 3px 11px; cursor: pointer; " + (!ui.isQuoteFormOpen ? "border-color: var(--interactive-accent); color: var(--interactive-accent);" : "")
      }
    });
    toggleFormBtn.onclick = () => {
      ui.isQuoteFormOpen = !ui.isQuoteFormOpen;
      if (ui.isQuoteFormOpen) {
        if (ui.activeFilter === "THOUGHTS") ui.quoteFormType = "Мысль";
        else if (ui.activeFilter === "BOOKS") ui.quoteFormType = "Книга";
        focusQuoteInputAfterRender = true;
      }
      renderHub();
    };

    if (ui.activeFilter === "BOOKS") {
      const booksControlPanel = quotesSection.createDiv({
        attr: {
          style: "display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 14px; padding: 8px 10px; margin-bottom: 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px;"
        }
      });

      const leftFilterWrap = booksControlPanel.createDiv({ attr: { style: "display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;" } });

      const bookSelectLabel = leftFilterWrap.createEl("label", {
        attr: { style: "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;" }
      });
      bookSelectLabel.createSpan({ text: "Книга", attr: { style: "font-size: 0.75rem; color: var(--text-muted);" } });

      const bookSelect = bookSelectLabel.createEl("select", {
        cls: "dropdown",
        attr: { style: "font-size: 0.78rem; height: 28px; max-width: 270px;" }
      });

      bookSelect.createEl("option", { text: "Все книги (" + bookQuotes.length + ")", value: "" });

      const filterOptionsMap = new Map();
      books.forEach(b => {
        const key = "BOOK:" + b.path;
        const cnt = quoteCountByBookPath.get(b.path) || 0;
        const label = b.author ? b.title + " — " + b.author + " (" + cnt + ")" : b.title + " (" + cnt + ")";
        filterOptionsMap.set(key, { key, label, title: b.title });
      });

      bookQuotes.forEach(q => {
        if (!filterOptionsMap.has(q.bookFilterKey)) {
          const cnt = bookQuotes.filter(x => x.bookFilterKey === q.bookFilterKey).length;
          const label = q.displayAuthor && q.displayAuthor !== "—"
            ? q.displayTitle + " — " + q.displayAuthor + " (" + cnt + ")"
            : q.displayTitle + " (" + cnt + ")";
          filterOptionsMap.set(q.bookFilterKey, { key: q.bookFilterKey, label, title: q.displayTitle });
        }
      });

      const sortedFilterOptions = [...filterOptionsMap.values()].sort((a, b) =>
        a.title.localeCompare(b.title, "ru", { sensitivity: "base", numeric: true })
      );

      if (ui.selectedBookFilterKey && !filterOptionsMap.has(ui.selectedBookFilterKey)) {
        ui.selectedBookFilterKey = "";
      }

      sortedFilterOptions.forEach(optObj => {
        const o = bookSelect.createEl("option", { text: optObj.label, value: optObj.key });
        if (optObj.key === ui.selectedBookFilterKey) o.selected = true;
      });

      bookSelect.onchange = () => {
        ui.selectedBookFilterKey = bookSelect.value;
        ui.showRandom = false;
        renderHub();
      };

      const sortLabel = leftFilterWrap.createEl("label", {
        attr: { style: "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;" }
      });
      sortLabel.createSpan({ text: "Порядок", attr: { style: "font-size: 0.75rem; color: var(--text-muted);" } });

      const sortSelect = sortLabel.createEl("select", {
        cls: "dropdown",
        attr: { style: "font-size: 0.78rem; height: 28px;" }
      });
      [
        { value: "newest", text: "Сначала новые" },
        { value: "oldest", text: "Сначала старые" },
        { value: "title-asc", text: "По книге: А → Я" },
        { value: "title-desc", text: "По книге: Я → А" },
        { value: "fav-first", text: "Сначала любимые" }
      ].forEach(opt => {
        const o = sortSelect.createEl("option", { text: opt.text, value: opt.value });
        if (opt.value === ui.bookSortOrder) o.selected = true;
      });

      sortSelect.onchange = () => {
        ui.bookSortOrder = sortSelect.value;
        ui.showRandom = false;
        renderHub();
      };

      const migratableQuotes = bookQuotes.filter(q => q.isLegacyUnlinkedBookQuote && q.resolvedBook);
      if (migratableQuotes.length > 0) {
        const migBtn = booksControlPanel.createEl("button", {
          cls: "dh-chip" + (ui.showMigrationPreview ? " is-active" : ""),
          text: "🔗 Привязать старые цитаты (" + migratableQuotes.length + ")",
          attr: { type: "button", style: "font-size: 0.72rem; padding: 2px 8px; cursor: pointer;" }
        });
        migBtn.onclick = () => {
          ui.showMigrationPreview = !ui.showMigrationPreview;
          renderHub();
        };
      }

      if (ui.showMigrationPreview && migratableQuotes.length > 0) {
        const migPanel = quotesSection.createDiv({
          attr: { style: "padding: 10px 12px; margin-bottom: 12px; background: var(--background-primary); border-radius: 8px; border: 1px solid #599ed666;" }
        });
        migPanel.createDiv({
          text: "Предварительный просмотр привязки старых записей к заметкам книг (" + migratableQuotes.length + "):",
          attr: { style: "font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; color: var(--text-normal);" }
        });
        const migList = migPanel.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 0.75rem; color: var(--text-muted);" } });
        migratableQuotes.forEach(mq => {
          migList.createDiv({
            text: "Строка " + mq.lineNumber + ": «" + mq.text.slice(0, 60) + (mq.text.length > 60 ? "…" : "") + "» → [[" + mq.resolvedBook.path + "|" + mq.resolvedBook.title + "]]"
          });
        });

        const migActions = migPanel.createDiv({ attr: { style: "display: flex; gap: 8px; justify-content: flex-end;" } });
        const confirmMigBtn = migActions.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "Подтвердить обновление ссылок",
          attr: { type: "button", style: "font-size: 0.75rem; height: 28px; padding: 0 12px;" }
        });
        const cancelMigBtn = migActions.createEl("button", {
          cls: "dh-chip",
          text: "Отмена",
          attr: { type: "button", style: "font-size: 0.75rem; height: 28px; padding: 0 10px;" }
        });
        cancelMigBtn.onclick = () => { ui.showMigrationPreview = false; renderHub(); };
        confirmMigBtn.onclick = async () => {
          confirmMigBtn.disabled = true;
          try {
            const qFile = await ensureQuotesFile();
            const rawContent = await app.vault.read(qFile);
            const lines = rawContent.split(/\r?\n/);
            migratableQuotes.forEach(mq => {
              const oldLine = lines[mq.lineIndex];
              if (oldLine && !oldLine.includes("книга_ссылка::")) {
                lines[mq.lineIndex] = oldLine + " (книга_ссылка:: [[" + mq.resolvedBook.path + "]])";
              }
            });
            await app.vault.modify(qFile, lines.join("\n"));
            ui.showMigrationPreview = false;
            notify("Обновлено связей: " + migratableQuotes.length);
            await renderHub();
          } catch (e) {
            notify("Ошибка миграции: " + e.message);
          } finally {
            confirmMigBtn.disabled = false;
          }
        };
      }
    }

    if (ui.isQuoteFormOpen) {
      const formAccent = ui.quoteFormType === "Книга" ? "#e5a158" : "#4aab80";
      const formPanel = quotesSection.createDiv({
        attr: {
          style: "padding: 12px 14px; margin-bottom: 14px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border); border-top: 3px solid " + formAccent + "; display: flex; flex-direction: column; gap: 8px;"
        }
      });

      const typeRow = formPanel.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;" }
      });
      typeRow.createSpan({
        text: "Новая запись",
        attr: { style: "font-size: 0.82rem; font-weight: 650; color: var(--text-normal);" }
      });

      const typeButtons = typeRow.createDiv({ cls: "dh-chips", attr: { style: "display: flex; gap: 6px;" } });
      [
        { id: "Книга", label: "📖 Из книги" },
        { id: "Мысль", label: "💡 Своя мысль" }
      ].forEach(t => {
        const b = typeButtons.createEl("button", {
          cls: "dh-chip" + (ui.quoteFormType === t.id ? " is-active" : ""),
          text: t.label,
          attr: { type: "button", style: "font-size: 0.75rem; padding: 2px 10px; cursor: pointer;" }
        });
        b.onclick = () => {
          ui.quoteFormType = t.id;
          focusQuoteInputAfterRender = true;
          renderHub();
        };
      });

      let bookSel = null;
      let topicInput = null;
      let labelInput = null;

      if (ui.quoteFormType === "Книга") {
        const bookPickRow = formPanel.createDiv({
          attr: { style: "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;" }
        });

        bookSel = bookPickRow.createEl("select", {
          cls: "dropdown",
          attr: { style: "flex: 1; min-width: 200px; font-size: 0.82rem; height: 32px;" }
        });

        const sortedBooksForSelect = [...books].sort((a, b) => {
          const aRead = a.status === "Читаю" ? 0 : 1;
          const bRead = b.status === "Читаю" ? 0 : 1;
          if (aRead !== bRead) return aRead - bRead;
          return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
        });

        if (sortedBooksForSelect.length === 0) {
          bookSel.createEl("option", { text: "— Сначала создай книгу по кнопке справа —", value: "" });
        } else {
          sortedBooksForSelect.forEach((b, idx) => {
            const authorPart = b.author ? " — " + b.author : "";
            const opt = bookSel.createEl("option", {
              text: b.title + authorPart + " [" + b.status + "]",
              value: b.path
            });
            if (ui.preselectedBookPathForQuote && b.path === ui.preselectedBookPathForQuote) {
              opt.selected = true;
            } else if (!ui.preselectedBookPathForQuote && idx === 0) {
              opt.selected = true;
            }
          });
        }

        bookSel.onchange = () => {
          ui.preselectedBookPathForQuote = bookSel.value;
        };

        const newBookBtn = bookPickRow.createEl("button", {
          cls: "dh-chip" + (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "quote" ? " is-active" : ""),
          text: "+ Новая книга",
          attr: { type: "button", style: "font-size: 0.75rem; height: 32px; padding: 0 12px; cursor: pointer; white-space: nowrap;" }
        });
        newBookBtn.onclick = () => {
          if (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "quote") {
            ui.isNewBookDrawerOpen = false;
          } else {
            ui.isNewBookDrawerOpen = true;
            ui.newBookDrawerContext = "quote";
          }
          renderHub();
        };

        if (ui.isNewBookDrawerOpen && ui.newBookDrawerContext === "quote") {
          renderNewBookForm(formPanel, createdPath => {
            ui.preselectedBookPathForQuote = createdPath;
          });
        }
      } else {
        const metaRow = formPanel.createDiv({
          attr: { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px;" }
        });

        topicInput = metaRow.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Тема (необязательно, например: Дизайн, Жизнь)...",
            value: ui.quoteDraft.topic || "",
            style: "font-size: 0.82rem; height: 32px; padding: 4px 10px;"
          }
        });
        topicInput.oninput = () => { ui.quoteDraft.topic = topicInput.value; };

        labelInput = metaRow.createEl("input", {
          attr: {
            type: "text",
            placeholder: "Метка (Принцип, Инсайт, Правило...)",
            value: ui.quoteDraft.label || "Принцип",
            list: "dh-thought-labels-list",
            style: "font-size: 0.82rem; height: 32px; padding: 4px 10px;"
          }
        });
        labelInput.oninput = () => { ui.quoteDraft.label = labelInput.value; };

        const dl = metaRow.createEl("datalist", { attr: { id: "dh-thought-labels-list" } });
        THOUGHT_LABELS.forEach(lbl => dl.createEl("option", { attr: { value: lbl } }));
      }

      const quoteRow = formPanel.createDiv({
        attr: { style: "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;" }
      });

      const quoteInput = quoteRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: ui.quoteFormType === "Книга" ? "Текст цитаты из книги *" : "Текст мысли или принципа *",
          value: ui.quoteDraft.text || "",
          style: "flex: 1; min-width: 240px; font-size: 0.84rem; height: 34px; padding: 4px 10px;"
        }
      });
      quoteInput.oninput = () => { ui.quoteDraft.text = quoteInput.value; };

      const saveQuoteBtn = quoteRow.createEl("button", {
        cls: "dh-btn mod-cta",
        text: "+ Сохранить",
        attr: { type: "button", style: "font-size: 0.82rem; height: 34px; padding: 0 16px; white-space: nowrap;" }
      });

      const submitQuoteOrThought = async () => {
        if (saveQuoteBtn.disabled) return;
        const textVal = quoteInput.value.trim();

        if (!textVal) {
          notify("Введи текст записи.");
          quoteInput.focus();
          return;
        }

        saveQuoteBtn.disabled = true;
        try {
          const file = await ensureQuotesFile();
          let entryLine = "";

          if (ui.quoteFormType === "Книга") {
            const chosenBook = bookRegistry.byPath.get(bookSel?.value);
            if (!chosenBook) {
              notify("Выбери книгу из списка или создай новую по кнопке «+ Новая книга».");
              saveQuoteBtn.disabled = false;
              return;
            }
            const cleanLink = encodeInline("[[" + chosenBook.path + "]]");
            const cleanTitle = encodeInline(chosenBook.title);
            const cleanText = encodeInline(textVal);
            entryLine = "\n- (категория:: Книга) (книга_ссылка:: " + cleanLink + ") (книга:: " + cleanTitle + ") (дата:: " + todayISO + ") (цитата:: " + cleanText + ")";
          } else {
            const topic = (topicInput?.value.trim()) || "Личная мысль";
            const label = (labelInput?.value.trim()) || "Принцип";
            entryLine = "\n- (категория:: Мысль) (источник:: " + encodeInline(topic) + ") (статус:: " + encodeInline(label) + ") (дата:: " + todayISO + ") (цитата:: " + encodeInline(textVal) + ")";
          }

          await app.vault.append(file, entryLine);

          ui.quoteDraft = { text: "", topic: "", label: "Принцип" };
          ui.isQuoteFormOpen = false;
          notify("Запись сохранена.");
          await renderHub();
        } catch (e) {
          notify("Ошибка сохранения: " + e.message);
        } finally {
          if (saveQuoteBtn.isConnected) saveQuoteBtn.disabled = false;
        }
      };

      saveQuoteBtn.onclick = submitQuoteOrThought;
      quoteInput.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); submitQuoteOrThought(); } };

      if (focusQuoteInputAfterRender || scrollQuoteFormAfterRender) {
        const shouldScroll = scrollQuoteFormAfterRender;
        focusQuoteInputAfterRender = false;
        scrollQuoteFormAfterRender = false;
        setTimeout(() => {
          if (shouldScroll && formPanel.isConnected) {
            formPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          if (quoteInput.isConnected) {
            quoteInput.focus({ preventScroll: shouldScroll });
          }
        }, 30);
      }
    }

    let filteredQuotes = [...mainQuotes];

    if (ui.activeFilter === "BOOKS") {
      filteredQuotes = filteredQuotes.filter(q => q.category === "Книга");
      if (ui.selectedBookFilterKey) {
        filteredQuotes = filteredQuotes.filter(q => q.bookFilterKey === ui.selectedBookFilterKey);
      }

      const compareTitles = (a, b) =>
        a.displayTitle.localeCompare(b.displayTitle, "ru", { sensitivity: "base", numeric: true });

      switch (ui.bookSortOrder) {
        case "oldest":
          filteredQuotes.sort((a, b) => a.lineIndex - b.lineIndex);
          break;
        case "title-asc":
          filteredQuotes.sort((a, b) => compareTitles(a, b) || b.lineIndex - a.lineIndex);
          break;
        case "title-desc":
          filteredQuotes.sort((a, b) => compareTitles(b, a) || b.lineIndex - a.lineIndex);
          break;
        case "fav-first":
          filteredQuotes.sort((a, b) => (Number(b.isFavorite) - Number(a.isFavorite)) || b.lineIndex - a.lineIndex);
          break;
        default:
          filteredQuotes.sort((a, b) => b.lineIndex - a.lineIndex);
      }
    } else if (ui.activeFilter === "THOUGHTS") {
      filteredQuotes.sort((a, b) => b.lineIndex - a.lineIndex);
      filteredQuotes = filteredQuotes.filter(q => q.category === "Мысль");
    }

    if (ui.onlyFavorites) {
      filteredQuotes = filteredQuotes.filter(q => q.isFavorite);
    }

    const limit = ui.showAllQuotes ? filteredQuotes.length : QUOTES_DISPLAY_LIMIT;
    let displayedQuotes = filteredQuotes.slice(0, limit);
    if (ui.showRandom && filteredQuotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * filteredQuotes.length);
      displayedQuotes = [filteredQuotes[randomIndex]];
    }

    function renderQuoteCard(parentGrid, q) {
      const isBook = q.category === "Книга";
      const accentColor = isBook ? "#e5a158" : "#4aab80";
      const isEditing = ui.editingQuoteLineIndex === q.lineIndex;

      const card = parentGrid.createDiv({
        cls: "dh-card",
        attr: {
          style: [
            "padding: 13px 15px;",
            "background: var(--background-primary);",
            "border: 1px solid " + (isEditing ? accentColor : "var(--background-modifier-border)") + ";",
            "border-left: 3px solid " + accentColor + ";",
            "border-radius: 8px;",
            "display: flex;",
            "flex-direction: column;",
            "justify-content: space-between;",
            "gap: 9px;"
          ].join(" ")
        }
      });

      if (isEditing) {
        const editWrap = card.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 8px;" } });

        const textArea = editWrap.createEl("textarea", {
          attr: {
            rows: "3",
            placeholder: "Текст цитаты или мысли *",
            style: "width: 100%; font-size: 0.84rem; line-height: 1.4; padding: 6px 8px; border-radius: 6px; resize: vertical;"
          }
        });
        textArea.value = q.text;

        let bookSel = null;
        let topicInp = null;
        let statusInp = null;

        if (isBook) {
          bookSel = editWrap.createEl("select", {
            cls: "dropdown",
            attr: { style: "width: 100%; font-size: 0.8rem; height: 30px;" }
          });
          if (!q.resolvedBook) {
            bookSel.createEl("option", { text: q.displayTitle + " (текущая)", value: "" });
          }
          books.forEach(b => {
            const opt = bookSel.createEl("option", {
              text: b.author ? b.title + " — " + b.author : b.title,
              value: b.path
            });
            if (q.resolvedBook && q.resolvedBook.path === b.path) opt.selected = true;
          });
        } else if (q.category === "Мысль") {
          const metaRow = editWrap.createDiv({ attr: { style: "display: flex; gap: 6px; flex-wrap: wrap;" } });
          topicInp = metaRow.createEl("input", {
            attr: {
              type: "text",
              placeholder: "Тема",
              value: q.displayTitle || "",
              style: "flex: 1; min-width: 120px; font-size: 0.78rem; height: 28px; padding: 2px 8px;"
            }
          });
          statusInp = metaRow.createEl("input", {
            attr: {
              type: "text",
              placeholder: "Метка (Принцип, Инсайт...)",
              value: q.displayStatus || "Принцип",
              style: "flex: 1; min-width: 120px; font-size: 0.78rem; height: 28px; padding: 2px 8px;"
            }
          });
        }

        const btnRow = editWrap.createDiv({ attr: { style: "display: flex; justify-content: flex-end; gap: 6px;" } });
        const saveBtn = btnRow.createEl("button", {
          cls: "dh-btn mod-cta",
          text: "✓ Сохранить",
          attr: { type: "button", style: "font-size: 0.74rem; height: 26px; padding: 0 10px;" }
        });
        const cancelBtn = btnRow.createEl("button", {
          cls: "dh-chip",
          text: "Отмена",
          attr: { type: "button", style: "font-size: 0.74rem; height: 26px; padding: 0 8px; cursor: pointer;" }
        });

        cancelBtn.onclick = () => {
          ui.editingQuoteLineIndex = null;
          renderHub();
        };

        saveBtn.onclick = async () => {
          const newText = textArea.value.trim();
          if (!newText) {
            notify("Текст цитаты не может быть пустым.");
            textArea.focus();
            return;
          }
          saveBtn.disabled = true;
          try {
            const chosenBook = bookSel ? (bookRegistry.byPath.get(bookSel.value) || null) : null;
            await updateQuoteEntry(q.lineIndex, {
              category: q.category,
              book: chosenBook,
              legacyTitle: q.displayTitle,
              topic: topicInp ? topicInp.value.trim() : q.displayTitle,
              status: statusInp ? statusInp.value.trim() : q.displayStatus,
              text: newText
            });
            ui.editingQuoteLineIndex = null;
            notify("Цитата обновлена.");
            await renderHub();
          } catch (err) {
            notify("Ошибка: " + err.message);
            saveBtn.disabled = false;
          }
        };
        return;
      }

      const topContent = card.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 7px;" } });
      const quoteBody = topContent.createDiv({
        attr: { style: "font-size: 0.87rem; line-height: 1.45; color: var(--text-normal); font-style: italic;" }
      });
      quoteBody.setText("«" + q.text + "»");

      const footer = card.createDiv({
        attr: { style: "display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; border-top: 1px solid var(--background-modifier-border); padding-top: 7px;" }
      });

      const metaLeft = footer.createDiv({ attr: { style: "min-width: 0; flex: 1;" } });
      const titleLine = metaLeft.createDiv({
        attr: { style: "font-size: 0.79rem; font-weight: 600; color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" }
      });

      const iconPrefix = isBook ? "📖 " : (q.category === "Мысль" ? "💡 " : "🗂️ ");
      if (isBook && q.resolvedBook) {
        titleLine.createSpan({ text: iconPrefix });
        const linkEl = titleLine.createEl("a", {
          cls: "internal-link",
          text: q.displayTitle,
          attr: { href: q.resolvedBook.path, style: "color: var(--text-normal); text-decoration: none;" }
        });
        linkEl.onclick = e => {
          e.preventDefault();
          app.workspace.openLinkText(q.resolvedBook.path, dv.currentFilePath, e.ctrlKey || e.metaKey);
        };
      } else {
        titleLine.setText(iconPrefix + q.displayTitle);
      }

      const dateFormatted = dv.date(q.date)?.toFormat("dd.MM.yyyy") || q.date;
      const subParts = [];
      if (q.displayAuthor && q.displayAuthor !== "—" && q.displayAuthor !== "Собственная мысль") {
        subParts.push(q.displayAuthor);
      }
      if (dateFormatted) subParts.push(dateFormatted);
      if (q.duplicateOfLine) subParts.push("похожа на стр. " + q.duplicateOfLine);

      metaLeft.createDiv({
        text: subParts.join(" · "),
        attr: { style: "font-size: 0.71rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" }
      });

      const rightFooter = footer.createDiv({ attr: { style: "display: flex; align-items: center; gap: 5px; flex-shrink: 0;" } });

      if (isBook && q.resolvedBook && q.resolvedBook.epubPath && q.quoteCfi) {
        const jumpQuoteBtn = rightFooter.createEl("button", {
          cls: "dh-chip",
          text: "📖 К месту",
          attr: {
            type: "button",
            title: "Открыть книгу на месте этой цитаты",
            style: "font-size: 0.68rem; padding: 1px 6px; height: 20px; color: #e5a158; border-color: #e5a15855; cursor: pointer;"
          }
        });
        jumpQuoteBtn.onclick = () => {
          openBookInEpubPlugin(q.resolvedBook.epubPath, q.quoteCfi);
        };
      }

      if (!isBook && q.displayStatus) {
        const badgeColor = STATUS_COLORS[q.displayStatus] || accentColor;
        rightFooter.createSpan({
          text: q.displayStatus,
          attr: {
            style: [
              "font-size: 0.67rem;",
              "font-weight: 600;",
              "padding: 1px 7px;",
              "border-radius: 4px;",
              "background: " + badgeColor + "22;",
              "color: " + badgeColor + ";",
              "border: 1px solid " + badgeColor + "44;",
              "white-space: nowrap;"
            ].join(" ")
          }
        });
      }

      const favBtn = rightFooter.createEl("button", {
        cls: "dh-chip",
        text: q.isFavorite ? "♥\uFE0E" : "♡\uFE0E",
        attr: {
          type: "button",
          title: q.isFavorite ? "Убрать из любимых" : "Добавить в любимые",
          "aria-pressed": String(Boolean(q.isFavorite)),
          style: "font-size: 0.8rem; padding: 1px 6px; height: 20px; cursor: pointer; border-color: transparent; background: transparent; color: " +
            (q.isFavorite ? STATUS_COLORS["Любимое"] : "var(--text-muted)") + ";"
        }
      });
      favBtn.onclick = async () => {
        favBtn.disabled = true;
        try {
          await toggleQuoteFavorite(q.lineIndex);
          await renderHub();
        } catch (err) {
          notify("Ошибка: " + err.message);
          favBtn.disabled = false;
        }
      };

      const editQuoteBtn = rightFooter.createEl("button", {
        cls: "dh-chip",
        text: "✎",
        attr: {
          type: "button",
          title: "Редактировать запись",
          style: "font-size: 0.72rem; padding: 1px 6px; height: 20px; color: var(--text-muted); cursor: pointer;"
        }
      });
      editQuoteBtn.onclick = () => {
        ui.editingQuoteLineIndex = q.lineIndex;
        renderHub();
      };
    }

    if (displayedQuotes.length === 0) {
      quotesSection.createDiv({
        attr: {
          style: "padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.83rem; background: var(--background-primary); border-radius: 8px; border: 1px dashed var(--background-modifier-border);"
        },
        text: ui.onlyFavorites
          ? "Любимых записей в этой выборке пока нет. Нажми ♡ на карточке."
          : "В этой выборке пока нет записей."
      });
    } else {
      const cardsGrid = quotesSection.createDiv({
        attr: {
          style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(" + (ui.showRandom ? "100%" : "285px") + ", 1fr)); gap: 10px;"
        }
      });
      displayedQuotes.forEach(q => renderQuoteCard(cardsGrid, q));

      if (!ui.showRandom && filteredQuotes.length > QUOTES_DISPLAY_LIMIT) {
        const showMoreQuotesRow = quotesSection.createDiv({ attr: { style: "display: flex; justify-content: center; margin-top: 10px;" } });
        const showMoreQBtn = showMoreQuotesRow.createEl("button", {
          cls: "dh-chip",
          text: ui.showAllQuotes
            ? "Показать последние 6 ▲"
            : "Показать все (" + filteredQuotes.length + ") ▾",
          attr: { type: "button", style: "font-size: 0.74rem; padding: 3px 12px; cursor: pointer;" }
        });
        showMoreQBtn.onclick = () => {
          ui.showAllQuotes = !ui.showAllQuotes;
          renderHub();
        };
      }
    }

    if (archivedQuotes.length > 0) {
      const archDetails = quotesSection.createEl("details", {
        cls: "dhe-details",
        attr: { style: "margin-top: 12px;" }
      });
      archDetails.open = Boolean(ui.archiveSectionOpen);
      archDetails.ontoggle = () => { ui.archiveSectionOpen = archDetails.open; };

      const archSum = archDetails.createEl("summary");
      archSum.createSpan({ text: "Архив других категорий (" + archivedQuotes.length + ")" });
      archSum.createSpan({ text: "▾", attr: { style: "font-size: 0.7rem;" } });

      const archGrid = archDetails.createDiv({
        attr: {
          style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-top: 8px;"
        }
      });

      archivedQuotes.forEach(q => renderQuoteCard(archGrid, q));
    }

    // =====================================================================
    // СЕКЦИЯ 4. ГРАФИК ПОВТОРЕНИЙ
    // =====================================================================
    if (wordsData) {
      const dailySeries = [];
      for (let i = CHART_DAYS - 1; i >= 0; i--) {
        const dObj = todayDate.minus({ days: i });
        const iso = dObj.toISODate();
        const dPage = diaryByISO.get(iso);
        const fromDiary = dPage && typeof dPage.карточек_пройдено === "number" ? dPage.карточек_пройдено : 0;
        const fromSR = wordsData.srReviewsByDate.get(iso) || 0;
        const count = iso === todayISO ? savedTodayCount : Math.max(fromDiary, fromSR);
        dailySeries.push({
          iso,
          dateLabel: dObj.toFormat("dd.MM"),
          weekdayLabel: WEEKDAYS_SHORT[dObj.weekday - 1],
          count,
          isToday: iso === todayISO
        });
      }

      const allDatesSet = new Set([
        ...diaryByISO.keys(),
        ...wordsData.srReviewsByDate.keys(),
        todayISO
      ]);
      let allTimeSum = 0;
      let allTimeActiveDays = 0;
      let allTimeRecord = 0;
      for (const iso of allDatesSet) {
        const dPage = diaryByISO.get(iso);
        const fromDiary = dPage && typeof dPage.карточек_пройдено === "number" ? dPage.карточек_пройдено : 0;
        const fromSR = wordsData.srReviewsByDate.get(iso) || 0;
        const val = iso === todayISO ? savedTodayCount : Math.max(fromDiary, fromSR);
        if (val > 0) {
          allTimeSum += val;
          allTimeActiveDays++;
          if (val > allTimeRecord) allTimeRecord = val;
        }
      }
      const reviewedCardsInDeck = wordsData.learningDirections + wordsData.matureDirections;
      const totalAllTime = Math.max(allTimeSum, reviewedCardsInDeck);
      const avgPerDay = allTimeActiveDays > 0 ? Math.round(allTimeSum / allTimeActiveDays) : 0;

      const maxVal = Math.max(
        ...dailySeries.map(d => d.count),
        ui.showDailyTargetLine ? currentTarget : 0,
        20
      );

      const chartPanel = root.createDiv({ cls: "dhe-panel" });
      const chartHead = chartPanel.createDiv({ cls: "dhe-section-head" });

      const chartTitleWrap = chartHead.createDiv({ cls: "dhe-section-title" });
      chartTitleWrap.createSpan({ text: "График повторений" });

      const tilesRow = chartHead.createDiv({ cls: "dhe-chart-tiles" });

      const totalTile = tilesRow.createDiv({ cls: "dhe-smooth-tile" });
      totalTile.createSpan({ cls: "dhe-smooth-label", text: "За всё время" });
      totalTile.createSpan({ cls: "dhe-smooth-val", text: totalAllTime.toLocaleString("ru-RU") });

      const avgTile = tilesRow.createDiv({ cls: "dhe-smooth-tile" });
      avgTile.createSpan({ cls: "dhe-smooth-label", text: "В среднем в день" });
      avgTile.createSpan({ cls: "dhe-smooth-val", text: String(avgPerDay) });

      const recordTile = tilesRow.createDiv({ cls: "dhe-smooth-tile" });
      recordTile.createSpan({ cls: "dhe-smooth-label", text: "Рекорд за всё время" });
      recordTile.createSpan({
        cls: "dhe-smooth-val",
        text: allTimeRecord.toLocaleString("ru-RU"),
        attr: { style: "color: #e5a158;" }
      });

      const targetTile = tilesRow.createDiv({
        cls: "dhe-smooth-tile",
        attr: {
          style: ui.showDailyTargetLine ? "border-color: rgba(74, 171, 128, 0.45);" : ""
        }
      });

      const toggleTargetBtn = targetTile.createEl("button", {
        cls: "dh-chip" + (ui.showDailyTargetLine ? " is-active" : ""),
        text: "Цель",
        attr: {
          type: "button",
          title: "Показать или скрыть линию цели на графике",
          style: "font-size: 0.72rem; padding: 2px 8px; height: 22px; cursor: pointer;"
        }
      });
      toggleTargetBtn.onclick = async () => {
        ui.showDailyTargetLine = !ui.showDailyTargetLine;
        await writeTargetPref(ui.showDailyTargetLine);
        renderHub();
      };

      const targetControls = targetTile.createDiv({ cls: "dhe-target-controls" });

      const minusBtn = targetControls.createEl("button", {
        cls: "dhe-step-btn",
        text: "−",
        attr: { type: "button", title: "Уменьшить цель на 10" }
      });
      minusBtn.onclick = async () => {
        ui.dailyTarget = await writeTargetValue(currentTarget - 10);
        ui.showDailyTargetLine = true;
        renderHub();
      };

      const targetInput = targetControls.createEl("input", {
        cls: "dhe-target-input",
        attr: {
          type: "number",
          min: "10",
          max: "5000",
          step: "10",
          value: String(currentTarget),
          title: "Впиши свою дневную цель и нажми Enter"
        }
      });
      const commitTargetInput = async () => {
        const nextVal = Number(targetInput.value);
        if (Number.isFinite(nextVal) && nextVal > 0 && nextVal !== currentTarget) {
          ui.dailyTarget = await writeTargetValue(nextVal);
          ui.showDailyTargetLine = true;
          renderHub();
        } else {
          targetInput.value = String(currentTarget);
        }
      };
      targetInput.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitTargetInput();
        }
      };
      targetInput.onblur = commitTargetInput;

      const plusBtn = targetControls.createEl("button", {
        cls: "dhe-step-btn",
        text: "+",
        attr: { type: "button", title: "Увеличить цель на 10" }
      });
      plusBtn.onclick = async () => {
        ui.dailyTarget = await writeTargetValue(currentTarget + 10);
        ui.showDailyTargetLine = true;
        renderHub();
      };

      const chartBox = chartPanel.createDiv({
        attr: {
          style: "position: relative; height: 145px; display: flex; align-items: flex-end; gap: 6px; padding-top: 22px; border-bottom: 1px solid var(--background-modifier-border);"
        }
      });

      if (ui.showDailyTargetLine) {
        const targetRatio = Math.min(1, currentTarget / maxVal);
        const targetBottomPx = Math.round(targetRatio * 108);
        const rightBarsHigh = dailySeries.slice(-2).some(d => d.count >= currentTarget * 0.8);

        const targetLine = chartBox.createDiv({
          attr: {
            style: [
              "position: absolute;",
              "left: 0;",
              "right: 0;",
              "bottom: " + targetBottomPx + "px;",
              "border-top: 1px dashed rgba(74, 171, 128, 0.65);",
              "pointer-events: none;",
              "z-index: 4;"
            ].join(" ")
          }
        });
        targetLine.createSpan({
          text: "цель " + currentTarget,
          attr: {
            style: [
              "position: absolute;",
              rightBarsHigh ? "left: 4px;" : "right: 4px;",
              "top: -10px;",
              "font-size: 0.65rem;",
              "font-weight: 600;",
              "color: #4aab80;",
              "background: var(--background-secondary);",
              "border: 1px solid rgba(74, 171, 128, 0.4);",
              "padding: 1px 6px;",
              "border-radius: 4px;",
              "line-height: 1.2;"
            ].join(" ")
          }
        });
      }

      dailySeries.forEach(item => {
        const col = chartBox.createDiv({
          attr: {
            title: item.dateLabel + " (" + item.weekdayLabel + "): " + item.count + " повторений",
            style: "flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; position: relative; z-index: 2;"
          }
        });

        const barHeightPx = item.count > 0 ? Math.max(8, Math.round((item.count / maxVal) * 108)) : 3;
        const isTargetReached = ui.showDailyTargetLine && item.count >= currentTarget;
        const barColor = item.count === 0
          ? "var(--background-modifier-border)"
          : isTargetReached
            ? "#4aab80"
            : item.isToday
              ? "#e5a158"
              : "#599ed6";

        if (item.count > 0) {
          col.createDiv({
            text: String(item.count),
            attr: {
              style: [
                "font-size: 0.71rem;",
                "font-weight: " + (item.isToday || isTargetReached ? "700" : "600") + ";",
                "color: " + (isTargetReached ? "#4aab80" : item.isToday ? "var(--text-normal)" : "var(--text-muted)") + ";",
                "margin-bottom: 4px;",
                "line-height: 1;"
              ].join(" ")
            }
          });
        }

        col.createDiv({
          attr: {
            style: [
              "width: 100%;",
              "max-width: 38px;",
              "height: " + barHeightPx + "px;",
              "background: " + barColor + ";",
              "border-radius: 4px 4px 0 0;",
              "opacity: " + (item.isToday ? "1" : item.count > 0 ? "0.85" : "0.4") + ";",
              item.isToday ? "box-shadow: 0 0 0 1px var(--text-normal);" : ""
            ].join(" ")
          }
        });
      });

      const xAxis = chartPanel.createDiv({
        attr: { style: "display: flex; gap: 6px; margin-top: 6px;" }
      });

      dailySeries.forEach(item => {
        const labelCol = xAxis.createDiv({
          attr: { style: "flex: 1; min-width: 0; text-align: center; display: flex; flex-direction: column; line-height: 1.2;" }
        });
        labelCol.createSpan({
          text: item.dateLabel,
          attr: { style: "font-size: 0.7rem; font-weight: " + (item.isToday ? "700" : "500") + "; color: " + (item.isToday ? "var(--text-normal)" : "var(--text-muted)") + ";" }
        });
        labelCol.createSpan({
          text: item.weekdayLabel,
          attr: { style: "font-size: 0.64rem; color: " + (item.isToday ? "var(--interactive-accent)" : "var(--text-faint)") + ";" }
        });
      });
    }

    root.style.minHeight = "";
  } catch (err) {
    root.style.minHeight = "";
    root.createDiv({
      text: "Ошибка выполнения скрипта: " + (err && err.stack ? err.stack : err),
      attr: { style: "padding: 12px; color: #d85b57; background: rgba(216,91,87,0.12); border: 1px solid #d85b57; border-radius: 8px; white-space: pre-wrap; font-family: monospace; font-size: 0.8rem;" }
    });
  }
}

return renderHub();