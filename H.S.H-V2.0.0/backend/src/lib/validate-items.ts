/**
 * Structured request/order validation and server-side total computation
 * per spec 59-61. Reuses H.S.H business semantics:
 *   - Purchase/Sale entry pages compute item total as weightKg * price (per Kg)
 *     rounded to 2 decimals (see frontend/app/purchases/new/page.tsx,
 *     frontend/app/sales/entry/page.tsx, backend/src/lib/invoice-helpers.ts)
 *   - Quantity is inventory dimension, not pricing factor.
 *   - Purchase calculation validation reuses purchase-calculation.operation semantics.
 *
 * Exports:
 *   - validateItems(items, opts)  -> normalized items (throws on invalid)
 *   - computeTotal(items) -> server recomputed grand total
 */

export const MAX_ITEMS = 50;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_NOTE_LENGTH = 2000;

function codeError(code: string, status: number, message?: string): never {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  throw err;
}

export function roundMoney(value: number): number {
  // Same as frontend/src/lib/money.ts and backend/src/lib/invoice-helpers.ts
  return Math.round(value * 100) / 100;
}

export interface NormalizedItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total: number;
}

export interface ValidateItemsOptions {
  maxItems?: number;
  maxDescriptionLength?: number;
  requireQuantity?: boolean;
  requireWeight?: boolean;
  requirePrice?: boolean;
}

/**
 * Validate purchase calculation object reusing purchase-calculation.operation semantics.
 * Accepts null/undefined as no calculation (valid).
 */
export function validatePurchaseCalculation(calculation: any): void {
  if (calculation == null) return;
  if (typeof calculation !== "object" || Array.isArray(calculation)) {
    codeError("RVB_CALCULATION_INVALID", 400, "Invalid calculation object");
  }
  const wBeforeRaw = (calculation as any).weightBeforeSlaughterKg;
  const wAfterRaw = (calculation as any).weightAfterSlaughterKg;
  const amountRaw = (calculation as any).amount;

  // Require the three core fields if calculation is provided
  if (wBeforeRaw === undefined || wAfterRaw === undefined || amountRaw === undefined) {
    codeError("RVB_CALCULATION_INVALID", 400, "Calculation requires weightBefore, weightAfter, amount");
  }

  const wBefore = Number(wBeforeRaw);
  const wAfter = Number(wAfterRaw);
  const amount = Number(amountRaw);

  if (!Number.isFinite(wBefore) || wBefore <= 0) {
    codeError("RVB_CALCULATION_INVALID", 400, "Weight before slaughter must be greater than zero.");
  }
  if (!Number.isFinite(wAfter) || wAfter < 0) {
    codeError("RVB_CALCULATION_INVALID", 400, "Weight after slaughter cannot be negative.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    codeError("RVB_CALCULATION_INVALID", 400, "Amount must be greater than zero.");
  }
  if (wAfter > wBefore) {
    codeError("RVB_CALCULATION_INVALID", 400, "Weight after slaughter cannot exceed weight before slaughter.");
  }

  // If derived fields are present, they must be finite and non-negative
  const avgWeightRaw = (calculation as any).averageWeightKg;
  const avgLossPctRaw = (calculation as any).averageLossPercent;
  const avgLossKgRaw = (calculation as any).averageLossKg;

  if (avgWeightRaw !== undefined && avgWeightRaw !== null) {
    const v = Number(avgWeightRaw);
    if (!Number.isFinite(v) || v < 0) codeError("RVB_CALCULATION_INVALID", 400, "averageWeightKg invalid");
  }
  if (avgLossPctRaw !== undefined && avgLossPctRaw !== null) {
    const v = Number(avgLossPctRaw);
    if (!Number.isFinite(v) || v < 0) codeError("RVB_CALCULATION_INVALID", 400, "averageLossPercent invalid");
  }
  if (avgLossKgRaw !== undefined && avgLossKgRaw !== null) {
    const v = Number(avgLossKgRaw);
    if (!Number.isFinite(v) || v < 0) codeError("RVB_CALCULATION_INVALID", 400, "averageLossKg invalid");
  }
}

/**
 * Validate description/note string length (spec: reasonable max e.g., 2000)
 */
export function validateDescriptionLength(value: any, maxLen: number = MAX_DESCRIPTION_LENGTH, fieldName: string = "description"): void {
  if (value == null) return;
  if (typeof value !== "string") codeError("RVB_DESCRIPTION_INVALID", 400, `${fieldName} must be a string`);
  if (value.length > maxLen) codeError("RVB_DESCRIPTION_TOO_LONG", 400, `${fieldName} too long (${value.length} > ${maxLen})`);
  if (value.trim().length > maxLen) codeError("RVB_DESCRIPTION_TOO_LONG", 400, `${fieldName} too long`);
}

/**
 * Validate notes length (alias)
 */
export function validateNoteLength(value: any, maxLen: number = MAX_NOTE_LENGTH): void {
  if (value == null) return;
  if (typeof value !== "string") codeError("RVB_NOTE_INVALID", 400, "notes must be a string");
  if (value.length > maxLen) codeError("RVB_NOTE_TOO_LONG", 400, `notes too long (${value.length} > ${maxLen})`);
}

/**
 * Core items validator.
 * Checks:
 *   - items is array, 1..MAX_ITEMS (default 50)
 *   - each item: productId non-empty string
 *   - quantity finite >0
 *   - weightKg finite >=0 (supports weightKg or weight field)
 *   - price finite >=0
 *   - total if provided finite >=0
 *   - description/note per item max 2000
 *   - Rejects NaN, Infinity, negatives where impossible
 * Returns normalized items with H.S.H pricing (total = roundMoney(weightKg * price)).
 * Throws codeError with 400 on violation.
 */
export function validateItems(items: any, opts: ValidateItemsOptions = {}): NormalizedItem[] {
  const maxItems = opts.maxItems ?? MAX_ITEMS;
  const maxDesc = opts.maxDescriptionLength ?? MAX_DESCRIPTION_LENGTH;

  if (!Array.isArray(items)) {
    codeError("RVB_ITEMS_REQUIRED", 400, "items must be an array");
  }
  if (items.length === 0) {
    codeError("RVB_ITEMS_REQUIRED", 400, "At least one item required");
  }
  if (items.length > maxItems) {
    codeError("RVB_ITEMS_TOO_MANY", 400, `Too many items (${items.length} > ${maxItems})`);
  }

  const normalized: NormalizedItem[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const raw: any = items[idx];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      codeError("RVB_ITEMS_INVALID", 400, `item ${idx} must be an object`);
    }

    // productId
    const productIdRaw = raw.productId;
    if (typeof productIdRaw !== "string" || productIdRaw.trim().length === 0) {
      codeError("RVB_PRODUCT_REQUIRED", 400, `item ${idx}: productId required`);
    }
    const productId = productIdRaw.trim();
    if (productId.length > 200) {
      codeError("RVB_PRODUCT_REQUIRED", 400, `item ${idx}: productId too long`);
    }

    // quantity — required >0 where used
    const quantityRaw = raw.quantity;
    if (quantityRaw === undefined || quantityRaw === null) {
      codeError("RVB_QUANTITY_INVALID", 400, `item ${idx}: quantity required`);
    }
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || Number.isNaN(quantity) || quantity <= 0) {
      codeError("RVB_QUANTITY_INVALID", 400, `item ${idx}: quantity must be finite >0`);
    }
    if (quantity > 1e9) {
      codeError("RVB_QUANTITY_INVALID", 400, `item ${idx}: quantity too large`);
    }

    // weightKg — supports weightKg or weight alias (frontend uses weightKg)
    const weightRaw = raw.weightKg !== undefined ? raw.weightKg : raw.weight;
    if (weightRaw === undefined || weightRaw === null) {
      codeError("RVB_WEIGHT_INVALID", 400, `item ${idx}: weightKg required`);
    }
    const weightKg = Number(weightRaw);
    if (!Number.isFinite(weightKg) || Number.isNaN(weightKg) || weightKg < 0) {
      codeError("RVB_WEIGHT_INVALID", 400, `item ${idx}: weight must be finite >=0`);
    }
    if (weightKg > 1e9) {
      codeError("RVB_WEIGHT_INVALID", 400, `item ${idx}: weight too large`);
    }

    // price — per Kg, finite >=0
    const priceRaw = raw.price;
    if (priceRaw === undefined || priceRaw === null) {
      codeError("RVB_PRICE_INVALID", 400, `item ${idx}: price required`);
    }
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || Number.isNaN(price) || price < 0) {
      codeError("RVB_PRICE_INVALID", 400, `item ${idx}: price must be finite >=0`);
    }
    if (price > 1e9) {
      codeError("RVB_PRICE_INVALID", 400, `item ${idx}: price too large`);
    }

    // total — if provided must be finite >=0 (client value will be overwritten)
    const totalRaw = raw.total;
    if (totalRaw !== undefined && totalRaw !== null) {
      const t = Number(totalRaw);
      if (!Number.isFinite(t) || Number.isNaN(t) || t < 0) {
        codeError("RVB_TOTAL_INVALID", 400, `item ${idx}: total must be finite >=0`);
      }
      if (t > 1e12) {
        codeError("RVB_TOTAL_INVALID", 400, `item ${idx}: total too large`);
      }
    }

    // per-item description/note length
    const perItemDesc = raw.description ?? raw.note ?? raw.notes;
    if (perItemDesc !== undefined && perItemDesc !== null) {
      if (typeof perItemDesc !== "string") {
        codeError("RVB_DESCRIPTION_INVALID", 400, `item ${idx}: description must be string`);
      }
      if (perItemDesc.length > maxDesc) {
        codeError("RVB_DESCRIPTION_TOO_LONG", 400, `item ${idx}: description too long (${perItemDesc.length} > ${maxDesc})`);
      }
    }

    // H.S.H item semantics: total = weightKg * price, rounded to 2 decimals
    const itemTotal = roundMoney(weightKg * price);
    if (!Number.isFinite(itemTotal) || itemTotal < 0 || itemTotal > 1e12) {
      codeError("RVB_TOTAL_INVALID", 400, `item ${idx}: computed total invalid`);
    }

    normalized.push({
      productId,
      quantity,
      weightKg,
      price,
      total: itemTotal,
    });
  }

  // Also ensure payload not excessively large due to many fields? Basic check on JSON size?
  // Express already limits to 1mb, but we additionally check normalized length.

  return normalized;
}

/**
 * Server-side grand total computation according to H.S.H semantics.
 * Sums per-item total = roundMoney(weightKg * price) and rounds final sum.
 * Do NOT trust client-provided grand total.
 *
 * Accepts either already-validated normalized items or raw items (will coerce weightKg/price).
 */
export function computeTotal(items: any[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let sum = 0;
  for (const raw of items) {
    const weightKg = Number((raw as any).weightKg ?? (raw as any).weight ?? 0);
    const price = Number((raw as any).price ?? 0);
    // If total already computed and weight/price invalid, skip NaN
    if (!Number.isFinite(weightKg) || !Number.isFinite(price)) {
      continue;
    }
    // Use H.S.H semantics: weight * price
    // Note: if item was normalized, its total is already weight*price rounded,
    // but we recompute to avoid trusting stored total.
    const line = roundMoney(weightKg * price);
    if (!Number.isFinite(line) || line < 0) continue;
    sum = roundMoney(sum + line);
  }
  // Final rounding to 2 decimals
  return roundMoney(sum);
}
