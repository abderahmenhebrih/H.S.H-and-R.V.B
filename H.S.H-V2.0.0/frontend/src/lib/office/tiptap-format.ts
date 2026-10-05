import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";

// Minimal structural ProseMirror shapes (avoids `any` without importing
// editor internals into the bundle).
type PMTextNode = {
  isText: boolean;
  marks: Mark[];
};
type PMDocState = {
  selection: { empty: boolean; from: number; to: number };
  doc: { nodesBetween: (from: number, to: number, cb: (node: PMTextNode) => boolean | void) => void };
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

const MAX_INDENT = 6;
const STEP_EM = 2;

type BlockIndentAttrs = { indent?: number | string | null };

function currentIndent(editor: Editor): number {
  const para = (editor.getAttributes("paragraph") || {}) as BlockIndentAttrs;
  const head = (editor.getAttributes("heading") || {}) as BlockIndentAttrs;
  const v = Number(para.indent ?? head.indent ?? 0);
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_INDENT, Math.floor(v))) : 0;
}

function parseIndentLevel(styleValue: string | null | undefined): number {
  if (!styleValue) return 0;
  const em = /([\d.]+)em/i.exec(styleValue);
  if (em) return Math.max(0, Math.min(MAX_INDENT, Math.round(parseFloat(em[1]) / STEP_EM)));
  const px = /([\d.]+)px/i.exec(styleValue);
  if (px) return Math.max(0, Math.min(MAX_INDENT, Math.round(parseFloat(px[1]) / 16 / STEP_EM)));
  return 0;
}

// Paragraph/heading indent levels rendered as logical margin (RTL-safe).
// No official TipTap indent extension exists, so this small local one stores
// a numeric level per block node — never a global editor style.
export const Indent = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) =>
              parseIndentLevel(
                element.style.marginInlineStart || element.style.marginLeft || null,
              ),
            renderHTML: (attributes) => {
              const level = Number(attributes.indent ?? 0);
              if (!level) return {};
              return { style: `margin-inline-start: ${level * STEP_EM}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, chain }) => {
          const next = Math.min(MAX_INDENT, currentIndent(editor) + 1);
          if (next === currentIndent(editor)) return false;
          const runner = chain().focus();
          if (editor.isActive("heading")) return runner.updateAttributes("heading", { indent: next }).run();
          return runner.updateAttributes("paragraph", { indent: next }).run();
        },
      outdent:
        () =>
        ({ editor, chain }) => {
          const next = Math.max(0, currentIndent(editor) - 1);
          if (next === currentIndent(editor)) return false;
          const runner = chain().focus();
          if (editor.isActive("heading")) return runner.updateAttributes("heading", { indent: next }).run();
          return runner.updateAttributes("paragraph", { indent: next }).run();
        },
    };
  },
});

export type UniformValue = string | null | "mixed";

// Walks the current selection collecting textStyle values per text run.
// Collapsed caret: TipTap stored marks/attributes (future typing inherits).
// Uniform value returned as-is; divergent runs return "mixed" so the toolbar
// shows an indeterminate state instead of rewriting anything unprompted.
export function getUniformMarkValue(editor: Editor | null, key: "fontSize" | "fontFamily" | "color" | "backgroundColor" | "lineHeight"): UniformValue {
  if (!editor) return null;
  try {
    const state = (editor as unknown as { state: PMDocState }).state;
    const { selection, doc } = state;
    if (selection.empty) {
      const attrs = (editor.getAttributes("textStyle") || {}) as Partial<Record<typeof key, string>>;
      return attrs[key] ?? null;
    }
    const values = new Set<string>();
    let found = false;
    doc.nodesBetween(selection.from, selection.to, (node: PMTextNode) => {
      if (!node.isText) return true;
      found = true;
      const marks: Mark[] = node.marks || [];
      let v: string | null = null;
      for (const m of marks) {
        if (m.type?.name === "textStyle" && m.attrs && (m.attrs as Record<string, unknown>)[key] != null)
          v = String((m.attrs as Record<string, unknown>)[key]);
        if (m.type?.name === "highlight" && key === "backgroundColor" && (m.attrs as { color?: unknown })?.color)
          v = String((m.attrs as { color?: unknown }).color);
      }
      values.add(v ?? "");
      return true;
    });
    if (!found) {
      const attrs = (editor.getAttributes("textStyle") || {}) as Partial<Record<typeof key, string>>;
      return attrs[key] ?? null;
    }
    if (values.size !== 1) return "mixed";
    const only = [...values][0];
    return only === "" ? null : only;
  } catch {
    return null;
  }
}
