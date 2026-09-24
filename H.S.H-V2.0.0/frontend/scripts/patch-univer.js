// Patch Univer sheets-ui to prevent "The column width is less than 0" error
// Root cause: EditorDataSyncController._checkAndSetRenderStyleConfig sets pageSize.width to position.width even when width is 0 (hidden/layout zero)
// Fix: guard against non-positive width/height before setting pageSize, keep Infinity fallback until valid measurement
// Also guard FormulaEditorManagerService.setPosition/getPosition
const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-univer] skip missing ${filePath}`);
    return;
  }
  let t = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  // Patch _checkAndSetRenderStyleConfig
  const oldCheck = "\t\tconst position = this._formulaEditorManagerService.getPosition();\n\t\tif (position) {\n\t\t\tconst width = position.width;\n\t\t\tsnapshot.documentStyle.pageSize = {\n\t\t\t\twidth,\n\t\t\t\theight: Infinity\n\t\t\t};\n\t\t}";
  const newCheck = "\t\tconst position = this._formulaEditorManagerService.getPosition();\n\t\tif (position) {\n\t\t\tconst width = position.width;\n\t\t\tif (width <= 0 || !Number.isFinite(width) || position.height <= 0 || !Number.isFinite(position.height)) {\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tsnapshot.documentStyle.pageSize = {\n\t\t\t\twidth,\n\t\t\t\theight: Infinity\n\t\t\t};\n\t\t}";
  if (t.includes(oldCheck) && !t.includes("if (width <= 0 || !Number.isFinite(width)")) {
    t = t.replace(oldCheck, newCheck);
    patched = true;
    console.log(`[patch-univer] patched _checkAndSetRenderStyleConfig in ${path.basename(filePath)}`);
  }

  // Patch setPosition
  const oldSet = "\tsetPosition(param) {\n\t\tthis._position = param;\n\t\tthis._refresh(param);\n\t}";
  const newSet = "\tsetPosition(param) {\n\t\tif (param && (param.width <= 0 || !Number.isFinite(param.width) || param.height <= 0 || !Number.isFinite(param.height))) {\n\t\t\treturn;\n\t\t}\n\t\tthis._position = param;\n\t\tthis._refresh(param);\n\t}";
  if (t.includes(oldSet) && !t.includes("if (param && (param.width <=")) {
    t = t.replace(oldSet, newSet);
    patched = true;
    console.log(`[patch-univer] patched setPosition in ${path.basename(filePath)}`);
  }

  // Patch getPosition
  const oldGet = "\tgetPosition() {\n\t\treturn this._position;\n\t}";
  const newGet = "\tgetPosition() {\n\t\tif (this._position && (this._position.width <= 0 || !Number.isFinite(this._position.width) || this._position.height <= 0 || !Number.isFinite(this._position.height))) {\n\t\t\treturn null;\n\t\t}\n\t\treturn this._position;\n\t}";
  if (t.includes(oldGet) && !t.includes("if (this._position && (this._position.width <=")) {
    t = t.replace(oldGet, newGet);
    patched = true;
    console.log(`[patch-univer] patched getPosition in ${path.basename(filePath)}`);
  }

  if (patched) {
    fs.writeFileSync(filePath, t);
    console.log(`[patch-univer] patched ${filePath}`);
  } else {
    console.log(`[patch-univer] already patched or not found ${filePath}`);
  }
}

const base = path.join(__dirname, '..', 'node_modules', '@univerjs', 'sheets-ui');
patchFile(path.join(base, 'lib', 'es', 'index.js'));
patchFile(path.join(base, 'lib', 'cjs', 'index.js'));
patchFile(path.join(base, 'lib', 'index.js'));
console.log('[patch-univer] done');
