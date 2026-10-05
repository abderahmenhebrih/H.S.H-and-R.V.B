import type { Language } from "../../types/settings/settings";
import { formatDateObjectToDisplay } from "../date-format";

export type PlaceholderContext = {
  language: Language;
  currency: string;
  today?: string;
  customer?: any;
  supplier?: any;
  worker?: any;
  product?: any;
  sale?: any;
  purchase?: any;
  invoice?: any;
  vehicle?: any;
  task?: any;
};

/**
 * Safe placeholder resolver.
 * Replaces {{today}}, {{currency}}, and {{entity.field}} with resolved values.
 * Does not execute JS. Returns original placeholder if field not found.
 */
export function resolvePlaceholders(template: string, ctx: PlaceholderContext): string {
  let out = template;
  // Deterministic application-wide numeric standard: DD/MM/YYYY (same for all languages).
  const today = ctx.today ?? formatDateObjectToDisplay(new Date());
  out = out.replace(/\{\{\s*today\s*\}\}/g, today);
  out = out.replace(/\{\{\s*currency\s*\}\}/g, ctx.currency ?? "DA");

  const entityMap: Record<string, any> = {
    customer: ctx.customer,
    supplier: ctx.supplier,
    worker: ctx.worker,
    product: ctx.product,
    sale: ctx.sale,
    purchase: ctx.purchase,
    invoice: ctx.invoice,
    vehicle: ctx.vehicle,
    task: ctx.task,
  };

  out = out.replace(/\{\{\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\}\}/g, (_match, entity, field) => {
    const ent = entityMap[entity];
    if (!ent) return _match;
    const val = (ent as any)[field];
    if (val === undefined || val === null) return _match;
    return String(val);
  });

  return out;
}

/**
 * Recursively resolve placeholders inside structured template content.
 * Traverses string values only, preserves object/array structure.
 */
export function resolvePlaceholdersInObject<T>(obj: T, ctx: PlaceholderContext): T {
  if (obj == null) return obj;
  if (typeof obj === "string") {
    return resolvePlaceholders(obj, ctx) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return (obj as any[]).map((v) => resolvePlaceholdersInObject(v, ctx)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj as any)) {
      out[k] = resolvePlaceholdersInObject(v as any, ctx);
    }
    return out as T;
  }
  return obj;
}

/**
 * Future live formulas: =HEBRIH.CUSTOMER(...), =HEBRIH.SALES.TOTAL(...)
 * Evaluation not in alpha; detection only.
 */
export function isHebrihFormula(formula: string): boolean {
  return formula.trim().toUpperCase().startsWith("=HEBRIH.");
}

export function evaluateHebrihFormula(formula: string, _ctx: PlaceholderContext): string {
  return formula;
}
