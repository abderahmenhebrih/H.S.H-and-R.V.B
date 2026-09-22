import type { Language } from "../../types/settings/settings";

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
  const today = ctx.today ?? new Date().toLocaleDateString(ctx.language==="ar"?"ar-DZ-u-nu-latn": ctx.language==="fr"?"fr-FR":"en-GB", { numberingSystem:"latn"} as any);
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
 * Future live formulas: =HEBRIH.CUSTOMER(...), =HEBRIH.SALES.TOTAL(...)
 * Evaluation not in alpha; detection only.
 */
export function isHebrihFormula(formula: string): boolean {
  return formula.trim().toUpperCase().startsWith("=HEBRIH.");
}

export function evaluateHebrihFormula(formula: string, _ctx: PlaceholderContext): string {
  return formula;
}
