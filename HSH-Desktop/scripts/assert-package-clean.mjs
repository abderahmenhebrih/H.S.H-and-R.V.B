// Fails the build if the staged package contains anything sensitive:
// .env files, private keys, MongoDB URIs, JWT secrets, or credential-bearing
// URLs. Run after staging and as a unit test fixture (tests/ take a dir).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STAGING = path.join(here, "..", "staging");

const FORBIDDEN_NAMES = [/^\.env(\.|$)/i, /\.pem$/i, /\.key$/i, /id_rsa/i, /\.pfx$/i];
const FORBIDDEN_CONTENT = [
  /mongodb(\+srv)?:\/\//i,
  /RVB_JWT_(ACCESS|REFRESH)_SECRET\s*=\s*[^*<\s][^\s]*/,
  /CLOUDINARY_API_SECRET/i,
  /AKIA[0-9A-Z]{16}/,
  /xox[bap]-/,
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
];
const TEXT_EXT = new Set([".js", ".json", ".html", ".css", ".txt", ".md", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules"]);

export function scanPackageClean(dir) {
  const violations = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) {
        if (!SKIP_DIRS.has(e)) walk(p);
        continue;
      }
      for (const re of FORBIDDEN_NAMES) {
        if (re.test(e)) violations.push(`forbidden file: ${path.relative(dir, p)}`);
      }
      if (TEXT_EXT.has(path.extname(e).toLowerCase()) && s.size < 5 * 1024 * 1024) {
        let text = "";
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        for (const re of FORBIDDEN_CONTENT) {
          if (re.test(text)) violations.push(`forbidden content ${re} in ${path.relative(dir, p)}`);
        }
      }
    }
  };
  walk(dir);
  return violations;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const target = process.argv[2] || STAGING;
  const violations = scanPackageClean(target);
  if (violations.length > 0) {
    console.error("[package-clean] FAIL:");
    for (const v of violations) console.error("  - " + v);
    process.exit(1);
  }
  console.log(`[package-clean] OK: ${target}`);
}
