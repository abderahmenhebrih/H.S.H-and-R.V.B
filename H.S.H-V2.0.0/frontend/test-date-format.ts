import {
  DATE_DISPLAY_PLACEHOLDER,
  formatDateObjectToDisplay,
  formatIsoDateToDisplay,
  formatTimestampToDisplay,
  isValidIsoDate,
  parseDisplayDateToIso,
} from "./src/lib/date-format";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, label: string) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main() {
  // Placeholder standard
  eq(DATE_DISPLAY_PLACEHOLDER, "DD/MM/YYYY", "placeholder");

  // QA 1: 2026-10-05 displays 05/10/2026 (NOT 10/05/2026)
  eq(formatIsoDateToDisplay("2026-10-05"), "05/10/2026", "QA1 format");
  // QA 2: 2006-06-07 displays 07/06/2006
  eq(formatIsoDateToDisplay("2006-06-07"), "07/06/2006", "QA2 format");

  // QA 3: manually typed 21/12/2026 → internal 2026-12-21
  eq(parseDisplayDateToIso("21/12/2026"), "2026-12-21", "QA3 parse");
  // Ergonomic single-digit day/month normalize
  eq(parseDisplayDateToIso("5/10/2026"), "2026-10-05", "single-digit parse");
  eq(parseDisplayDateToIso("01/01/2027"), "2027-01-01", "QA4 parse");

  // Round-trip stability (QA 5/6)
  for (const iso of ["2026-10-05", "2027-01-21", "2006-06-07", "2028-02-29", "2026-01-01", "2026-12-31"]) {
    const back = parseDisplayDateToIso(formatIsoDateToDisplay(iso));
    eq(back, iso, `round-trip ${iso}`);
  }

  // QA 8: invalid rejected
  for (const bad of ["31/02/2026", "00/10/2026", "12/13/2026", "abc", "99/99/9999", "", "2026-10-05", "05-10-2026", "5/10/26", "  ", "32/01/2026", "10/00/2026"]) {
    eq(parseDisplayDateToIso(bad), null, `reject ${JSON.stringify(bad)}`);
  }
  // QA 9: leap year 29/02/2028 accepted
  eq(parseDisplayDateToIso("29/02/2028"), "2028-02-29", "QA9 leap");
  eq(parseDisplayDateToIso("29/02/2000"), "2000-02-29", "leap 2000");
  // QA 10: non-leap 29/02/2027 rejected (+ century rule 1900)
  eq(parseDisplayDateToIso("29/02/2027"), null, "QA10 non-leap");
  eq(parseDisplayDateToIso("29/02/1900"), null, "non-leap 1900");
  // Month lengths
  eq(parseDisplayDateToIso("31/04/2026"), null, "30-day month");
  eq(parseDisplayDateToIso("30/04/2026"), "2026-04-30", "30-day ok");
  eq(parseDisplayDateToIso("31/01/2026"), "2026-01-31", "31-day ok");

  // QA 14: no timezone day shift — timestamp formats in LOCAL time deterministically.
  // 2026-10-05 12:00 local must always show 05/10/2026 in any timezone.
  const noon = new Date(2026, 9, 5, 12, 0, 0, 0).getTime();
  eq(formatTimestampToDisplay(noon), "05/10/2026", "QA14 noon local");
  eq(formatTimestampToDisplay(NaN), "", "NaN guard");
  eq(formatTimestampToDisplay(undefined), "", "undefined guard");

  // formatIsoDateToDisplay guards
  eq(formatIsoDateToDisplay(""), "", "empty iso");
  eq(formatIsoDateToDisplay("not-a-date"), "", "junk iso");
  eq(formatIsoDateToDisplay("2026-02-31"), "", "impossible iso");
  eq(formatIsoDateToDisplay("05/10/2026"), "", "display-as-iso rejected");

  // isValidIsoDate
  assert(isValidIsoDate("2026-10-05"), "valid iso");
  assert(!isValidIsoDate("2026-13-01"), "month 13");
  assert(!isValidIsoDate("2026-02-29"), "2026 non-leap feb29");

  // Date-object formatting is locale-independent DD/MM/YYYY
  eq(formatDateObjectToDisplay(new Date(2026, 9, 5)), "05/10/2026", "date object");
  eq(formatDateObjectToDisplay(new Date(NaN)), "", "invalid date object");

  console.log("Date format standard test passed (DD/MM/YYYY).");
}

main().catch((e) => {
  console.error("Date format standard test failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
