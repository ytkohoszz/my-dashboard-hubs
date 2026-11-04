import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";

const RAW_DIR = "raw-scripts";
const RAW_DIR_CANDIDATES = [RAW_DIR, "Raw Scripts"];

if (!existsSync(RAW_DIR)) {
  mkdirSync(RAW_DIR, { recursive: true });
}

const FILES_MAP = {
  home: ["home.js"],
  diary: ["diary.js"],
  health: ["health.js"],
  study: ["study.js"],
  "3d": ["3d.js"],
  english: ["english_2.js", "english2.js", "english.js"],
  media: ["media.js"],
};

function findScript(fileNames) {
  const wanted = fileNames.map((n) => n.toLowerCase());
  for (const dir of [...RAW_DIR_CANDIDATES, "."]) {
    if (!existsSync(dir)) continue;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const w of wanted) {
      const hit = entries.find((e) => e.toLowerCase() === w);
      if (hit) return dir === "." ? hit : path.join(dir, hit);
    }
  }
  return null;
}

const bundledModules = {};
const extractedCssChunks = [
  "/* Единый файл стилей дашбордов (сгенерирован автоматически) */",
  ".my-hub-native-container { overflow: visible !important; }",
];

for (const [modKey, fileNames] of Object.entries(FILES_MAP)) {
  const foundPath = findScript(fileNames);

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
  const arrayCssMatch = code.match(
    /const\s+(?:STUDY_HUB_CSS|HUB_CSS_TEXT)\s*=\s*\[([\s\S]*?)\]\.join\("\\n"\);/
  );
  if (arrayCssMatch && arrayCssMatch[1]) {
    try {
      const parsedCss = Function(
        `"use strict"; return [${arrayCssMatch[1]}].join("\\n");`
      )();
      extractedCssChunks.push(
        `/* --- Module Array CSS: ${modKey} --- */\n` + parsedCss
      );
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