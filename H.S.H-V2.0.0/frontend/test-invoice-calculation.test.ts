import { computeLineTotals, roundMoney } from "./src/lib/money";

function assertEq(a: number, b: number, msg: string) {
  if (Math.abs(a - b) > 0.001) throw new Error(`${msg}: expected ${b} got ${a}`);
}

async function main() {
  console.log("Test Invoice Calculation - weight*price semantics");
  // Regression: weightKg=100 price=300 quantity=50 VAT=19% => HT=30000, VAT=5700, TTC=35700 (not 1.5M)
  const { totalHT, taxAmount, totalTTC } = computeLineTotals(100, 300, 50, 19);
  console.log(`Computed: HT=${totalHT}, tax=${taxAmount}, TTC=${totalTTC}`);
  assertEq(totalHT, 30000, "HT");
  assertEq(taxAmount, 5700, "VAT");
  assertEq(totalTTC, 35700, "TTC");
  if (totalHT === 1500000) throw new Error("BUG: weight*price*quantity still used");
  console.log("PASS: 100kg×300×qty50 => 30000 HT");

  // Additional checks from spec amountInWords tests via backend helper is separate, but money helper also used
  const cases: Array<[number, number, number, number, number, number]> = [
    // weight, price, qty, vat, expectedHT, expectedTTC (vat 0)
    [1, 100, 1, 0, 100, 100],
    [2, 50, 99, 0, 100, 100], // qty ignored
  ];
  for (const [w,p,q,vat,expHT,expTTC] of cases) {
    const r = computeLineTotals(w,p,q,vat);
    assertEq(r.totalHT, expHT, `HT w=${w} p=${p} q=${q}`);
  }
  console.log("All invoice calculation tests passed");
}

main().catch(e=>{ console.error("FAIL", e); process.exit(1); });
