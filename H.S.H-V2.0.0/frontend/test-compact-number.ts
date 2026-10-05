import { exactNumberLabel, formatCompactCurrency, formatCompactNumber } from "./src/lib/compact-number";

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main() {
  // Required matrix
  eq(formatCompactNumber(0), "0", "0");
  eq(formatCompactNumber(1), "1", "1");
  eq(formatCompactNumber(999), "999", "999");
  eq(formatCompactNumber(1000), "1k", "1000");
  eq(formatCompactNumber(1100), "1.1k", "1100");
  eq(formatCompactNumber(1500), "1.5k", "1500");
  eq(formatCompactNumber(10000), "10k", "10000");
  eq(formatCompactNumber(100000), "100k", "100000");
  eq(formatCompactNumber(999000), "999k", "999000");
  eq(formatCompactNumber(999999), "1M", "999999 promotes");
  eq(formatCompactNumber(1000000), "1M", "1000000");
  eq(formatCompactNumber(1250000), "1.3M", "1250000");
  eq(formatCompactNumber(12500000), "12.5M", "12500000");
  eq(formatCompactNumber(1000000000), "1B", "1B");
  eq(formatCompactNumber(1500000000), "1.5B", "1.5B");

  // Rounding rule: no trailing .0
  eq(formatCompactNumber(1200), "1.2k", "1200");
  eq(formatCompactNumber(12500), "12.5k", "12500");
  eq(formatCompactNumber(10000), "10k", "no 10.0k");
  eq(formatCompactNumber(2000000), "2M", "no 2.0M");

  // Promotion edges M → B
  eq(formatCompactNumber(999999999), "1B", "999999999 promotes");
  eq(formatCompactNumber(999950000), "1B", "999950000 promotes");
  eq(formatCompactNumber(999500000), "999.5M", "999500000 stays");

  // Negatives keep the minus sign
  eq(formatCompactNumber(-500), "-500", "-500");
  eq(formatCompactNumber(-1500), "-1.5k", "-1500");
  eq(formatCompactNumber(-1250000), "-1.3M", "-1250000");
  eq(formatCompactNumber(-999999), "-1M", "-999999");

  // Small fractions preserved exactly-ish
  eq(formatCompactNumber(95.5), "95.5", "95.5");

  // NaN / Infinity never crash rendering
  eq(formatCompactNumber(NaN), "—", "NaN");
  eq(formatCompactNumber(Infinity), "—", "Infinity");
  eq(formatCompactNumber(-Infinity), "—", "-Infinity");

  // Currency placement mirrors formatCurrency
  eq(formatCompactCurrency(100000, "DA"), "100k DA", "DA");
  eq(formatCompactCurrency(1250000, "DA"), "1.3M DA", "DA M");
  eq(formatCompactCurrency(-1500, "DA"), "-1.5k DA", "DA negative");
  eq(formatCompactCurrency(1250000, "€"), "1.3M €", "EUR");
  eq(formatCompactCurrency(1250000, "$"), "$1.3M", "USD");
  eq(formatCompactCurrency(NaN, "DA"), "— DA", "NaN currency");

  // Exact tooltip labels
  eq(exactNumberLabel(1254840), "1,254,840", "grouped tooltip");
  eq(exactNumberLabel(NaN), "—", "tooltip NaN guard");

  console.log("Compact number format test passed.");
}

main().catch((e) => {
  console.error("Compact number format test failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
