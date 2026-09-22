export type OverviewPeriod = "today" | "week" | "month" | "year";

export type OverviewBucket = {
  label: string;
  shortLabel: string;
  start: number;
  end: number;
  sales: number;
  purchases: number;
};

export type PeriodRange = {
  from: number;
  to: number;
  buckets: OverviewBucket[];
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function getPeriodRange(period: OverviewPeriod, now = new Date()): PeriodRange {
  if (period === "today") {
    const start = startOfDay(now).getTime();
    const end = endOfDay(now).getTime();
    // 6 buckets: 0-4,4-8,8-12,12-16,16-20,20-24
    const buckets: OverviewBucket[] = [];
    for (let i = 0; i < 6; i++) {
      const hourStart = i * 4;
      const hourEnd = (i + 1) * 4;
      const s = new Date(now);
      s.setHours(hourStart, 0, 0, 0);
      const e = new Date(now);
      e.setHours(hourEnd, 0, 0, 0);
      if (i === 5) {
        // last bucket ends at end of day
        e.setHours(23, 59, 59, 999);
      } else {
        e.setMilliseconds(-1);
      }
      const label = `${String(hourStart).padStart(2, "0")}:00`;
      buckets.push({
        label,
        shortLabel: label,
        start: s.getTime(),
        end: e.getTime(),
        sales: 0,
        purchases: 0,
      });
    }
    return { from: start, to: end, buckets };
  }

  if (period === "week") {
    // Monday 00:00 to Sunday 23:59:59.999 local
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = startOfDay(addDays(now, diffToMonday));
    const sunday = endOfDay(addDays(monday, 6));
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const shortLabels = labels;
    const buckets: OverviewBucket[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const s = startOfDay(d).getTime();
      const e = endOfDay(d).getTime();
      buckets.push({
        label: labels[i],
        shortLabel: shortLabels[i],
        start: s,
        end: e,
        sales: 0,
        purchases: 0,
      });
    }
    return { from: monday.getTime(), to: sunday.getTime(), buckets };
  }

  if (period === "month") {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).getTime();
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)).getTime();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const buckets: OverviewBucket[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), i);
      const s = startOfDay(d).getTime();
      const e = endOfDay(d).getTime();
      const label = String(i);
      // Show only 1,5,10,15,20,25,30 for axis to avoid clutter, but keep all buckets for data
      const visibleTicks = [1, 5, 10, 15, 20, 25, 30];
      const shortLabel = visibleTicks.includes(i) || i === daysInMonth ? label : "";
      buckets.push({
        label,
        shortLabel,
        start: s,
        end: e,
        sales: 0,
        purchases: 0,
      });
    }
    return { from: start, to: end, buckets };
  }

  // year
  const start = startOfDay(new Date(now.getFullYear(), 0, 1)).getTime();
  const end = endOfDay(new Date(now.getFullYear(), 11, 31)).getTime();
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const buckets: OverviewBucket[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), i, 1);
    const s = startOfDay(new Date(now.getFullYear(), i, 1)).getTime();
    const e = endOfDay(new Date(now.getFullYear(), i + 1, 0)).getTime();
    buckets.push({
      label: monthLabels[i],
      shortLabel: monthLabels[i],
      start: s,
      end: e,
      sales: 0,
      purchases: 0,
    });
  }
  return { from: start, to: end, buckets };
}

export function aggregateByBuckets(
  sales: { date: number; total: number }[],
  purchases: { date: number; total: number }[],
  buckets: OverviewBucket[]
): OverviewBucket[] {
  // Clone buckets with zeroed values
  const result = buckets.map((b) => ({ ...b, sales: 0, purchases: 0 }));
  for (const s of sales) {
    for (const b of result) {
      if (s.date >= b.start && s.date <= b.end) {
        b.sales += s.total;
        break;
      }
    }
  }
  for (const p of purchases) {
    for (const b of result) {
      if (p.date >= b.start && p.date <= b.end) {
        b.purchases += p.total;
        break;
      }
    }
  }
  return result;
}

export function compactCurrencyAxis(value: number, currency: string): string {
  const abs = Math.abs(value);
  let compact: string;
  if (abs >= 1_000_000) compact = `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 1000) compact = `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  else compact = `${value.toFixed(0)}`;
  // Use currency formatting: if currency is DA/€/$, we need to place correctly
  // For simplicity, use compact + " " + currency, but for $ and € we want symbol before
  if (currency === "$") return `$${compact}`;
  if (currency === "€") return `€${compact}`;
  return `${compact} ${currency}`;
}

export function formatTooltipDate(bucket: OverviewBucket, period: OverviewPeriod, language: string = "en"): string {
  const d = new Date(bucket.start);
  const localeFor = (lang: string) => (lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-US");
  if (period === "today") {
    return `${bucket.label} — ${d.toLocaleDateString(localeFor(language), { weekday: "long", day: "numeric", month: "short", numberingSystem: "latn" } as any)}`;
  }
  if (period === "week") {
    return d.toLocaleDateString(localeFor(language), {
      weekday: "long",
      day: "numeric",
      month: "short",
      numberingSystem: "latn",
    } as any);
  }
  if (period === "month") {
    return d.toLocaleDateString(localeFor(language), {
      day: "numeric",
      month: "long",
      year: "numeric",
      numberingSystem: "latn",
    } as any);
  }
  // year
  return d.toLocaleDateString(localeFor(language), {
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  } as any);
}
