export function formatDate(now: Date, language: string) {
  const locale =
    language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";

  try {
    const datePart = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      numberingSystem: "latn",
    } as any).format(now);

    const timePart = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      numberingSystem: "latn",
    } as any).format(now);

    return { dateStr: datePart, timeStr: timePart };
  } catch {
    const dateStr = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now);
    const timeStr = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(now);
    return { dateStr, timeStr };
  }
}
