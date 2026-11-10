/**
 * Translation dictionary parity checker (HSH web).
 * Fails when any en/fr/ar table is missing keys, has empty values, or when
 * known English-fallback hacks (`(t as any).x || "English"`) remain.
 *
 * Usage: npx tsx scripts/check-i18n-parity.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const SRC_DIR = path.join(ROOT, "src");

type Lang = "en" | "fr" | "ar";

let failures = 0;
let checked = 0;

function fail(message: string) {
  failures += 1;
  console.error(`[i18n-parity] FAIL: ${message}`);
}

function ok(message: string) {
  console.log(`[i18n-parity] ok: ${message}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name === "page.tsx") out.push(full);
  }
  return out;
}

function extractTopLevelKeys(source: string, dictName: string): Record<Lang, string[]> {
  // Finds `en: { ... }` blocks at depth 1 inside the named dictionary by
  // brace matching (handles nested objects). Returns key lists per language.
  const result: Record<Lang, string[]> = { en: [], fr: [], ar: [] };
  const langs: Lang[] = ["en", "fr", "ar"];
  for (const lang of langs) {
    // Locate `<dict> = {` then the `<lang>: {` block inside it.
    const dictIdx = source.indexOf(dictName);
    if (dictIdx === -1) continue;
    const langPattern = new RegExp(`\\b${lang}\\s*:\\s*\\{`, "g");
    langPattern.lastIndex = dictIdx;
    const match = langPattern.exec(source);
    if (!match || match.index === undefined) continue;
    let depth = 0;
    let i = match.index + match[0].length - 1; // at opening brace
    const keys: string[] = [];
    let token = "";
    let inString: string | null = null;
    let lineComment = false;
    for (; i < source.length; i++) {
      const ch = source[i];
      const next = source[i + 1];
      if (lineComment) {
        if (ch === "\n") lineComment = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === "/" && next === "/") {
        lineComment = true;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") {
        depth++;
        continue;
      }
      if (ch === "}") {
        depth--;
        if (depth === 0) break;
        continue;
      }
      if (depth === 1) {
        if (/[A-Za-z0-9_$]/.test(ch)) token += ch;
        else {
          if (token) {
            // Peek ahead for ':' to confirm it is a key.
            let j = i;
            while (j < source.length && /\s/.test(source[j])) j++;
            if (source[j] === ":") keys.push(token);
            token = "";
          }
        }
      }
    }
    result[lang] = keys;
  }
  return result;
}

function checkPageDictionaries() {
  const pages = walk(APP_DIR);
  for (const file of pages) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const dictNames = ["TRANSLATIONS", "const TR", "const T =", "const translations", "EDITOR_T", "SHEET_T", "DOC_T", "SHELL_TRANSLATIONS"];
    const hasDict = dictNames.some((n) => source.includes(n.replace("const ", "")) || source.includes(n));
    if (!hasDict) {
      // Redirects and the notifications page are handled separately.
      if (/about|online|purchases.new|tasks.finished/.test(rel.replace(/\\/g, "/"))) continue;
      if (rel.includes("notifications")) {
        fail(`${rel} has no translation dictionary (expected TRANSLATIONS/TR/T).`);
        continue;
      }
      continue;
    }
    // Check each dictionary-shaped block present in the file.
    const blocks: { name: string; keys: Record<Lang, string[]> }[] = [];
    for (const name of ["TRANSLATIONS", "TR", "EDITOR_T", "SHEET_T", "DOC_T", "SHELL_TRANSLATIONS"]) {
      if (!source.includes(name)) continue;
      blocks.push({ name, keys: extractTopLevelKeys(source, name) });
    }
    if (source.includes("const T =") && !source.includes("TRANSLATIONS") && !source.includes("const TR")) {
      blocks.push({ name: "T", keys: extractTopLevelKeys(source, "T") });
    }
    if (source.includes("const translations")) {
      blocks.push({ name: "translations", keys: extractTopLevelKeys(source, "translations") });
    }
    for (const block of blocks) {
      const { en, fr, ar } = block.keys;
      if (en.length === 0 && fr.length === 0 && ar.length === 0) continue;
      checked += 1;
      const enSet = new Set(en);
      for (const k of fr) if (!enSet.has(k)) fail(`${rel} [${block.name}]: fr-only key "${k}" (missing in en).`);
      for (const k of ar) if (!enSet.has(k)) fail(`${rel} [${block.name}]: ar-only key "${k}" (missing in en).`);
      const frSet = new Set(fr);
      const arSet = new Set(ar);
      for (const k of en) {
        if (!frSet.has(k)) fail(`${rel} [${block.name}]: missing fr key "${k}".`);
        if (!arSet.has(k)) fail(`${rel} [${block.name}]: missing ar key "${k}".`);
      }
      // Empty values.
      for (const lang of ["en", "fr", "ar"] as Lang[]) {
        const langBlock = new RegExp(`\\b${lang}\\s*:\\s*\\{`, "g");
        // crude empty-string value check inside the language block
        const idx = source.indexOf(`${lang}:`);
        if (idx !== -1 && new RegExp(`${lang}\\s*:\\s*\\{[^}]*:\\s*""`).test(source.slice(idx, idx + 20000))) {
          // Only flag if the empty string is a direct value (avoid false positives on placeholders).
          const snippet = source.slice(idx, idx + 20000);
          const m = snippet.match(/(\w+)\s*:\s*""/);
          if (m) fail(`${rel} [${block.name}.${lang}]: empty value for key "${m[1]}".`);
        }
      }
    }
  }
}

function checkFallbackHacks() {
  const targets = [...walk(APP_DIR), ...walkDirTsx(SRC_DIR).filter((f) => !f.includes(`${path.sep}scripts${path.sep}`))];
  // Only flag the English-fallback *value* pattern: `(t as any).key || "English"`
  // or `(t as any).key ?? "English"` / `(TM as any).x ?? "Y"`. Plain type casts
  // such as `(t.nav as any).dashboard` (no || / ?? English literal) are allowed.
  const hack = /\(t as any\)\.[A-Za-z0-9_]+(\s*\?\?|\s*\|\|)\s*["'`]/;
  const hackTM = /\(TM as any\)\.[A-Za-z0-9_]+(\s*\?\?|\s*\|\|)\s*["'`]/;
  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    if (hack.test(source) || hackTM.test(source)) {
      fail(`${path.relative(ROOT, file)} still uses "(t as any).key ||/ occupies English" fallback hack.`);
    }
  }
}

function walkDirTsx(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDirTsx(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function checkHardcodedA11y() {
  // Known previously-hardcoded accessible names must now be translated.
  const mustNotContain: { file: string; needles: string[] }[] = [
    { file: "app/notifications/page.tsx", needles: ["<p>Loading...</p>"] },
    { file: "app/page.module.css", needles: ["text-align: left"] },
  ];
  for (const { file, needles } of mustNotContain) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const source = fs.readFileSync(full, "utf8");
    for (const n of needles) {
      if (source.includes(n)) fail(`${file} still contains hardcoded ${JSON.stringify(n)}.`);
    }
  }
}

checkPageDictionaries();
checkFallbackHacks();
checkHardcodedA11y();

if (failures > 0) {
  console.error(`[i18n-parity] ${failures} failure(s) across ${checked} dictionaries.`);
  process.exit(1);
}
ok(`all ${checked} dictionaries have en/fr/ar parity; no fallback hacks; no known hardcoded strings.`);
