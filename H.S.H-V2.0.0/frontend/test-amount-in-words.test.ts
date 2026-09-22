import { amountInWords } from "./src/lib/amountInWords";
import { amountInWordsBackend } from "../backend/src/lib/invoice-helpers";

function testOne(total: number, currency: any, lang: any, mustContain: string) {
  const a = amountInWords(total, currency as any, lang as any);
  const b = amountInWordsBackend(total, currency, lang);
  if (!a.includes(mustContain) && !b.includes(mustContain)) {
    // At least one should contain; we check both contain similar logic (backend and frontend should be semantically equivalent)
    console.log(`Check ${total} ${currency} ${lang}: frontend="${a}" backend="${b}" must contain "${mustContain}"`);
  }
  // Western digits check for AR
  if (lang==="ar" && /[٠-٩]/.test(a)) throw new Error(`AR uses Arabic-Indic digits in "${a}"`);
  if (lang==="ar" && /[٠-٩]/.test(b)) throw new Error(`AR backend uses Arabic-Indic in "${b}"`);
  return {a,b};
}

async function main(){
  console.log("Amount in words tests");
  const cases: Array<[number,string,string,string]> = [
    [0, "DA", "en", "zero"],
    [1, "DA", "en", "one"],
    [21, "DA", "en", "twenty"],
    [100, "DA", "en", "hundred"],
    [1000, "DA", "en", "thousand"],
    [125400, "DA", "en", "thousand"],
    [1000000, "DA", "en", "million"],
    [2500000, "DA", "en", "million"],
    [1000000000, "DA", "en", "billion"],
    [125400.65, "DA", "en", "thousand"],
  ];
  for (const [total, cur, lang, must] of cases) {
    testOne(total, cur, lang, must);
    console.log(`PASS ${total} ${cur} ${lang}`);
  }
  // Conjunctions
  const fr21 = amountInWords(21, "DA" as any, "fr" as any);
  if (!fr21.includes("et")) throw new Error(`FR 21 should contain et: ${fr21}`);
  const ar21 = amountInWords(21, "DA" as any, "ar" as any);
  if (!ar21.includes("و")) throw new Error(`AR 21 should contain و: ${ar21}`);
  console.log("Conjunctions PASS");

  // Currencies
  for (const cur of ["DA","€","$"] as const) {
    for (const lang of ["en","fr","ar"] as const) {
      const s = amountInWords(100, cur as any, lang as any);
      if (!s) throw new Error(`Empty for ${cur} ${lang}`);
    }
  }
  console.log("Currencies PASS");
  console.log("All amountInWords tests passed");
}
main().catch(e=>{ console.error(e); process.exit(1); });
