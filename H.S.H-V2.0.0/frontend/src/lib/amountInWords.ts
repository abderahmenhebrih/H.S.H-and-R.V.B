import type { Currency, Language } from "../types/settings/settings";

/**
 * Amount in words for DA/€/$ in EN/FR/AR.
 * Minimal implementation covering required currencies; DA is primary.
 * Returns snapshot string to be stored on Issue.
 */

const EN_UNITS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const EN_TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function enNumber(n: number): string {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) {
    const tens = Math.floor(n/10);
    const units = n%10;
    return EN_TENS[tens] + (units? "-" + EN_UNITS[units] : "");
  }
  if (n < 1000) {
    const hundreds = Math.floor(n/100);
    const rest = n%100;
    return EN_UNITS[hundreds] + " hundred" + (rest? " " + enNumber(rest) : "");
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n/1000);
    const rest = n%1000;
    return enNumber(thousands) + " thousand" + (rest? " " + enNumber(rest) : "");
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n/1_000_000);
    const rest = n%1_000_000;
    return enNumber(millions) + " million" + (rest? " " + enNumber(rest) : "");
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n/1_000_000_000);
    const rest = n%1_000_000_000;
    return enNumber(billions) + " billion" + (rest? " " + enNumber(rest) : "");
  }
  return String(n);
}

const FR_UNITS = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"];
const FR_TENS = ["","","vingt","trente","quarante","cinquante","soixante","soixante-dix","quatre-vingt","quatre-vingt-dix"];
function frNumber(n: number): string {
  if (n < 20) return FR_UNITS[n];
  if (n < 100) {
    const tens = Math.floor(n/10);
    const units = n%10;
    if (tens===7 || tens===9) {
      const base = tens===7?60:80;
      const rest = n - base;
      if (rest < 20) return FR_TENS[tens-1] + "-" + FR_UNITS[rest];
    }
    if (tens===8 && units===0) return "quatre-vingts";
    const tensWord = FR_TENS[tens];
    if (units===0) return tensWord;
    if (units===1 && tens!==8 && tens!==9) return tensWord + " et un";
    return tensWord + "-" + FR_UNITS[units];
  }
  if (n < 1000) {
    const hundreds = Math.floor(n/100);
    const rest = n%100;
    const hundredWord = hundreds===1? "cent" : FR_UNITS[hundreds] + " cent";
    const suffix = (hundreds>1 && rest===0) ? "s" : "";
    return hundredWord + suffix + (rest? " " + frNumber(rest) : "");
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n/1000);
    const rest = n%1000;
    const thousandWord = thousands===1? "mille" : frNumber(thousands) + " mille";
    return thousandWord + (rest? " " + frNumber(rest) : "");
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n/1_000_000);
    const rest = n%1_000_000;
    const millionWord = millions===1? "un million" : frNumber(millions) + " millions";
    return millionWord + (rest? " " + frNumber(rest) : "");
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n/1_000_000_000);
    const rest = n%1_000_000_000;
    const billionWord = billions===1? "un milliard" : frNumber(billions) + " milliards";
    return billionWord + (rest? " " + frNumber(rest) : "");
  }
  return String(n);
}

const AR_UNITS = ["صفر","واحد","اثنان","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة","أحد عشر","اثنا عشر","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر"];
const AR_TENS = ["","","عشرون","ثلاثون","أربعون","خمسون","ستون","سبعون","ثمانون","تسعون"];
const AR_HUNDREDS = ["","مائة","مائتان","ثلاثمائة","أربعمائة","خمسمائة","ستمائة","سبعمائة","ثمانمائة","تسعمائة"];
function arNumber(n: number): string {
  if (n < 20) return AR_UNITS[n];
  if (n < 100) {
    const tens = Math.floor(n/10);
    const units = n%10;
    if (units===0) return AR_TENS[tens];
    return AR_UNITS[units] + " و" + AR_TENS[tens];
  }
  if (n < 1000) {
    const hundreds = Math.floor(n/100);
    const rest = n%100;
    const hWord = AR_HUNDREDS[hundreds];
    return rest? hWord + " و" + arNumber(rest) : hWord;
  }
  if (n < 1000_000) {
    const thousands = Math.floor(n/1000);
    const rest = n%1000;
    let thWord: string;
    if (thousands===1) thWord = "ألف";
    else if (thousands===2) thWord = "ألفان";
    else if (thousands>=3 && thousands<=10) thWord = arNumber(thousands) + " آلاف";
    else thWord = arNumber(thousands) + " ألف";
    return rest? thWord + " و" + arNumber(rest) : thWord;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n/1_000_000);
    const rest = n%1_000_000;
    let miWord: string;
    if (millions===1) miWord = "مليون";
    else if (millions===2) miWord = "مليونان";
    else if (millions>=3 && millions<=10) miWord = arNumber(millions) + " ملايين";
    else miWord = arNumber(millions) + " مليون";
    return rest? miWord + " و" + arNumber(rest) : miWord;
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n/1_000_000_000);
    const rest = n%1_000_000_000;
    let biWord: string;
    if (billions===1) biWord = "مليار";
    else if (billions===2) biWord = "ملياران";
    else if (billions>=3 && billions<=10) biWord = arNumber(billions) + " مليارات";
    else biWord = arNumber(billions) + " مليار";
    return rest? biWord + " و" + arNumber(rest) : biWord;
  }
  return String(n);
}

function currencyName(amount: number, currency: Currency, lang: Language): { main: string; minor: string } {
  const isOne = Math.floor(amount) === 1;
  if (currency === "DA") {
    if (lang === "fr") return { main: isOne? "dinar algérien" : "dinars algériens", minor: "centime" };
    if (lang === "ar") return { main: "دينار جزائري", minor: "سنتيم" };
    return { main: isOne? "Algerian dinar" : "Algerian dinars", minor: "centime" };
  }
  if (currency === "€") {
    if (lang === "fr") return { main: isOne? "euro" : "euros", minor: "centime" };
    if (lang === "ar") return { main: "يورو", minor: "سنت" };
    return { main: isOne? "euro" : "euros", minor: "cent" };
  }
  if (currency === "$") {
    if (lang === "fr") return { main: isOne? "dollar" : "dollars", minor: "centime" };
    if (lang === "ar") return { main: "دولار", minor: "سنت" };
    return { main: isOne? "dollar" : "dollars", minor: "cent" };
  }
  return { main: currency, minor: "cent" };
}

export function amountInWords(totalTTC: number, currency: Currency, lang: Language): string {
  const rounded = Math.round(totalTTC * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  const { main, minor } = currencyName(rounded, currency, lang);
  let integerWords: string;
  if (lang === "fr") integerWords = frNumber(integer);
  else if (lang === "ar") integerWords = arNumber(integer);
  else integerWords = enNumber(integer);

  let result = `${integerWords} ${main}`;
  if (cents > 0) {
    let centsWords: string;
    if (lang === "fr") centsWords = frNumber(cents);
    else if (lang === "ar") centsWords = arNumber(cents);
    else centsWords = enNumber(cents);
    // DA minor is centimes, but keep generic
    result += ` et ${centsWords} ${minor}${cents!==1 && lang==="en" ? "s" : ""}`;
    if (lang === "fr" && cents!==1) result += "s";
  }
  // Capitalize first letter for FR/EN, keep AR as is
  if (lang !== "ar") result = result.charAt(0).toUpperCase() + result.slice(1);
  return result;
}
