export function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeLineFromTaxRate(weightKg: number, price: number, quantity: number, vatRate: number, otherTaxRate: number = 0, discountAmount: number = 0): { totalHT: number; taxAmount: number; otherTaxAmount: number; totalTTC: number } {
  const totalHT = roundMoney(weightKg * price - discountAmount);
  const taxAmount = roundMoney(totalHT * (vatRate / 100));
  const otherTaxAmount = roundMoney(totalHT * (otherTaxRate / 100));
  const totalTTC = roundMoney(totalHT + taxAmount + otherTaxAmount);
  return { totalHT, taxAmount, otherTaxAmount, totalTTC };
}

// Minimal amountInWords for backend (same logic as frontend)
const EN_UNITS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const EN_TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function enNumber(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) {
    const t = Math.floor(n/10); const u = n%10;
    return EN_TENS[t] + (u? "-" + EN_UNITS[u] : "");
  }
  if (n < 1000) {
    const h = Math.floor(n/100); const r = n%100;
    return EN_UNITS[h] + " hundred" + (r? " " + enNumber(r) : "");
  }
  if (n < 1_000_000) {
    const th = Math.floor(n/1000); const r = n%1000;
    return enNumber(th) + " thousand" + (r? " " + enNumber(r) : "");
  }
  if (n < 1_000_000_000) {
    const mi = Math.floor(n/1_000_000); const r = n%1_000_000;
    return enNumber(mi) + " million" + (r? " " + enNumber(r) : "");
  }
  if (n < 1_000_000_000_000) {
    const bi = Math.floor(n/1_000_000_000); const r = n%1_000_000_000;
    return enNumber(bi) + " billion" + (r? " " + enNumber(r) : "");
  }
  return String(n);
}
const FR_UNITS = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"];
const FR_TENS = ["","","vingt","trente","quarante","cinquante","soixante","soixante-dix","quatre-vingt","quatre-vingt-dix"];
function frNumber(n: number): string {
  if (n < 20) return FR_UNITS[n];
  if (n < 100) {
    const t = Math.floor(n/10); const u = n%10;
    if (t===7||t===9) {
      const base = t===7?60:80; const rest = n-base;
      if (rest<20) return FR_TENS[t-1] + "-" + FR_UNITS[rest];
    }
    if (t===8 && u===0) return "quatre-vingts";
    const w = FR_TENS[t];
    if (u===0) return w;
    if (u===1 && t!==8 && t!==9) return w + " et un";
    return w + "-" + FR_UNITS[u];
  }
  if (n < 1000) {
    const h = Math.floor(n/100); const r = n%100;
    const hw = h===1? "cent" : FR_UNITS[h] + " cent";
    const suf = (h>1 && r===0)? "s" : "";
    return hw + suf + (r? " " + frNumber(r) : "");
  }
  if (n < 1_000_000) {
    const th = Math.floor(n/1000); const r = n%1000;
    const tw = th===1? "mille" : frNumber(th) + " mille";
    return tw + (r? " " + frNumber(r) : "");
  }
  if (n < 1_000_000_000) {
    const mi = Math.floor(n/1_000_000); const r = n%1_000_000;
    const mw = mi===1? "un million" : frNumber(mi) + " millions";
    return mw + (r? " " + frNumber(r) : "");
  }
  if (n < 1_000_000_000_000) {
    const bi = Math.floor(n/1_000_000_000); const r = n%1_000_000_000;
    const bw = bi===1? "un milliard" : frNumber(bi) + " milliards";
    return bw + (r? " " + frNumber(r) : "");
  }
  return String(n);
}
const AR_UNITS = ["صفر","واحد","اثنان","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة","أحد عشر","اثنا عشر","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر"];
const AR_TENS = ["","","عشرون","ثلاثون","أربعون","خمسون","ستون","سبعون","ثمانون","تسعون"];
const AR_HUNDREDS = ["","مائة","مائتان","ثلاثمائة","أربعمائة","خمسمائة","ستمائة","سبعمائة","ثمانمائة","تسعمائة"];
function arNumber(n: number): string {
  if (n < 20) return AR_UNITS[n];
  if (n < 100) {
    const t = Math.floor(n/10); const u = n%10;
    if (u===0) return AR_TENS[t];
    return AR_UNITS[u] + " و" + AR_TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n/100); const r = n%100;
    const hw = AR_HUNDREDS[h];
    return r? hw + " و" + arNumber(r) : hw;
  }
  if (n < 1000_000) {
    const th = Math.floor(n/1000); const r = n%1000;
    let w: string;
    if (th===1) w = "ألف";
    else if (th===2) w = "ألفان";
    else if (th>=3 && th<=10) w = arNumber(th) + " آلاف";
    else w = arNumber(th) + " ألف";
    return r? w + " و" + arNumber(r) : w;
  }
  if (n < 1_000_000_000) {
    const mi = Math.floor(n/1_000_000); const r = n%1_000_000;
    let w: string;
    if (mi===1) w = "مليون";
    else if (mi===2) w = "مليونان";
    else if (mi>=3 && mi<=10) w = arNumber(mi) + " ملايين";
    else w = arNumber(mi) + " مليون";
    return r? w + " و" + arNumber(r) : w;
  }
  if (n < 1_000_000_000_000) {
    const bi = Math.floor(n/1_000_000_000); const r = n%1_000_000_000;
    let w: string;
    if (bi===1) w = "مليار";
    else if (bi===2) w = "ملياران";
    else if (bi>=3 && bi<=10) w = arNumber(bi) + " مليارات";
    else w = arNumber(bi) + " مليار";
    return r? w + " و" + arNumber(r) : w;
  }
  return String(n);
}

export function amountInWordsBackend(totalTTC: number, currency: string, lang: string): string {
  const rounded = Math.round(totalTTC * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  let main = "dinars", minor = "centime";
  const isOne = integer===1;
  if (currency==="DA") {
    if (lang==="fr") { main = isOne?"dinar algérien":"dinars algériens"; minor="centime"; }
    else if (lang==="ar") { main="دينار جزائري"; minor="سنتيم"; }
    else { main=isOne?"Algerian dinar":"Algerian dinars"; minor="centime"; }
  } else if (currency==="€") {
    if (lang==="fr") { main=isOne?"euro":"euros"; minor="centime"; }
    else if (lang==="ar") { main="يورو"; minor="سنت"; }
    else { main=isOne?"euro":"euros"; minor="cent"; }
  } else if (currency==="$") {
    if (lang==="fr") { main=isOne?"dollar":"dollars"; minor="centime"; }
    else if (lang==="ar") { main="دولار"; minor="سنت"; }
    else { main=isOne?"dollar":"dollars"; minor="cent"; }
  }
  let iw: string;
  if (lang==="fr") iw = frNumber(integer);
  else if (lang==="ar") iw = arNumber(integer);
  else iw = enNumber(integer);
  let result = `${iw} ${main}`;
  if (cents>0) {
    let cw: string;
    if (lang==="fr") cw = frNumber(cents);
    else if (lang==="ar") cw = arNumber(cents);
    else cw = enNumber(cents);
    result += ` et ${cw} ${minor}${cents!==1 && lang==="en" ? "s" : ""}`;
    if (lang==="fr" && cents!==1) result += "s";
  }
  if (lang!=="ar") result = result.charAt(0).toUpperCase() + result.slice(1);
  return result;
}
