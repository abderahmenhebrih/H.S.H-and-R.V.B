export function formatCurrency(amount: number, currency: string = "DA"): string {
  if (typeof amount !== "number" || isNaN(amount)) return `0 ${currency}`;
  // Use French-style spacing for DA, but keep consistent
  try {
    // Keep raw currency code, not relying on Intl currency (DA not standard)
    const formatted = new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    return `${formatted} ${currency}`;
  } catch {
    return `${amount.toLocaleString("fr-FR")} ${currency}`;
  }
}

export function parseAmountInput(input: string): number | null {
  if (!input || !input.trim()) return null;
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}
