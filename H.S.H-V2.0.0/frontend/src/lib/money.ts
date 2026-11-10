/**
 * Deterministic money helper — round to 2 decimals at line level, sum rounded lines.
 * Use integer minor units where practical, but keep API simple.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeLineTotals(
  weightKg: number,
  price: number,
  quantity: number,
  vatRate: number,
  otherTaxRate: number = 0,
  discountAmount: number = 0
): { totalHT: number; taxAmount: number; otherTaxAmount: number; totalTTC: number } {
  const totalHT = roundMoney(weightKg * price - discountAmount);
  const taxAmount = roundMoney(totalHT * (vatRate / 100));
  const otherTaxAmount = roundMoney(totalHT * (otherTaxRate / 100));
  const totalTTC = roundMoney(totalHT + taxAmount + otherTaxAmount);
  return { totalHT, taxAmount, otherTaxAmount, totalTTC };
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((a, b) => a + b, 0));
}
