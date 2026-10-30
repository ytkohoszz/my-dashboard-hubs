import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

const RAW_DIR = "raw-scripts";
if (!existsSync(RAW_DIR)) {
  mkdirSync(RAW_DIR, { recursive: true });
}

const FILES_MAP = {
  home: ["home.js"],
  diary: ["diary.js"],
  health: ["health.js"],
  study: ["study.js"],
  "3d": ["3d.js"],
  english: ["english_2.js", "english.js"],
};

const bundledModules = {};
const extractedCssChunks = [
  "/* Единый файл стилей дашбордов (сгенерирован автоматически) */",
  ".my-hub-native-container { overflow: visible !important; }",
];

for (const [modKey, fileNames] of Object.entries(FILES_MAP)) {
  let foundPath = null;
  for (const fn of fileNames) {
    const p1 = path.join(RAW_DIR, fn);
    const p2 = fn;
    if (existsSync(p1)) { foundPath = p1; break; }
    if (existsSync(p2)) { foundPath = p2; break; }
  }

  if (!foundPath) {
    console.log(`[пропуск] Файл для модуля "${modKey}" не найден в ${RAW_DIR}/`);
    continue;
  }

  let code = readFileSync(foundPath, "utf8");

  // 1. Извлекаем шаблонный CSS вида styleEl.textContent = `...` в общий styles.css
  code = code.replace(
    /(?:styleEl|style)\.textContent\s*=\s*`([\s\S]*?)`;/g,
    (_match, cssBody) => {
      extractedCssChunks.push(`/* --- Module: ${modKey} --- */\n` + cssBody.trim());
      return "/* CSS перенесён в глобальный styles.css плагина */";
    }
  );

  // 2. Отключаем повторную инжекцию таблиц стилей в study.js и english.js
  const arrayCssMatch = code.match(/const\s+(?:STUDY_HUB_CSS|HUB_CSS_TEXT)\s*=\s*\[([\s\S]*?)\]\.join\("\\n"\);/);
  if (arrayCssMatch && arrayCssMatch[1]) {
    try {
      const parsedCss = Function(`"use strict"; return [${arrayCssMatch[1]}].join("\\n");`)();
      extractedCssChunks.push(`/* --- Module Array CSS: ${modKey} --- */\n` + parsedCss);
      code = code.replace(
        /function\s+inject(?:Study|EnglishHub)Styles\s*\([^)]*\)\s*\{[\s\S]*?\}/g,
        "function injectStudyStyles() {} function injectEnglishHubStyles() {}"
      );
    } catch {
      // Если не удалось распарсить массив статически, оставляем как есть
    }
  }

  bundledModules[modKey] = code;
  console.log(`[готово] Модуль "${modKey}" упакован из ${foundPath}`);
}

const modulesTsContent =
  "// АВТОМАТИЧЕСКИ СГЕНЕРИРОВАННЫЙ ФАЙЛ (npm run import)\n" +
  "export const BUNDLED_HUB_SCRIPTS: Record<string, string> = " +
  JSON.stringify(bundledModules, null, 2) +
  ";\n";

writeFileSync("src/modules.ts", modulesTsContent, "utf8");
writeFileSync("styles.css", extractedCssChunks.join("\n\n") + "\n", "utf8");
console.log("Успешно обновлены src/modules.ts и styles.css!");