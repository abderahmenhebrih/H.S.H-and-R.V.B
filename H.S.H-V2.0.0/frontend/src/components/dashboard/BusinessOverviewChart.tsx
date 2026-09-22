"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./BusinessOverviewChart.module.css";
import type { OverviewBucket, OverviewPeriod } from "../../lib/dashboard-overview";
import { compactCurrencyAxis, formatTooltipDate } from "../../lib/dashboard-overview";
import { formatCurrency } from "../../lib/settings";
import type { Currency } from "../../types/settings/settings";

type Props = {
  data: OverviewBucket[];
  currency: Currency;
  language: string;
  period: OverviewPeriod;
};

export default function BusinessOverviewChart({ data, currency, language, period }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 260 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setSize({ width: w, height: 260 });
      }
    });
    ro.observe(el);
    // initial
    setSize({ width: el.clientWidth, height: 260 });
    return () => ro.disconnect();
  }, []);

  const padding = { top: 12, right: 12, bottom: 28, left: 52 };

  const maxVal = useMemo(() => {
    let max = 0;
    for (const b of data) {
      max = Math.max(max, b.sales, b.purchases);
    }
    if (max === 0) return 100;
    // nice max
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const normalized = max / magnitude;
    let nice: number;
    if (normalized <= 1) nice = 1;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return nice * magnitude;
  }, [data]);

  const yTicks = 4;
  const yValues = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i <= yTicks; i++) {
      vals.push((maxVal * i) / yTicks);
    }
    return vals;
  }, [maxVal]);

  const width = size.width || 600;
  const height = size.height;
  const chartW = Math.max(0, width - padding.left - padding.right);
  const chartH = Math.max(0, height - padding.top - padding.bottom);

  const xFor = (i: number) => {
    if (data.length <= 1) return padding.left + chartW / 2;
    return padding.left + (chartW * i) / (data.length - 1);
  };

  const yFor = (val: number) => {
    const t = maxVal === 0 ? 0 : val / maxVal;
    return padding.top + chartH - t * chartH;
  };

  const salesPath = useMemo(() => {
    if (data.length === 0) return "";
    const points = data.map((b, i) => ({ x: xFor(i), y: yFor(b.sales) }));
    // Simple smooth via cubic? Use linear for accuracy, with small smoothing
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [data, chartW, chartH, maxVal, width]);

  const purchasesPath = useMemo(() => {
    if (data.length === 0) return "";
    const points = data.map((b, i) => ({ x: xFor(i), y: yFor(b.purchases) }));
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [data, chartW, chartH, maxVal, width]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left - padding.left;
    // find nearest bucket
    if (data.length === 0) return;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const xi = data.length <= 1 ? chartW / 2 : (chartW * i) / (data.length - 1);
      const dist = Math.abs(xi - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setHoverIndex(best);
  };

  const handleLeave = () => setHoverIndex(null);

  const hoverBucket = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xFor(hoverIndex) : 0;

  // Summary totals for subtle display above chart
  const totalSales = useMemo(() => data.reduce((s, b) => s + b.sales, 0), [data]);
  const totalPurchases = useMemo(() => data.reduce((s, b) => s + b.purchases, 0), [data]);

  return (
    <div
      ref={wrapRef}
      className={styles.chartWrap}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      role="img"
      aria-label={`Business overview chart comparing sales and purchases for ${period}`}
    >
      <div className={styles.summary} aria-hidden="true">
        <span className={styles.summaryItem}>
          <span className={styles.tooltipDot + " " + styles.dotSales} aria-hidden="true" />
          Sales: <span className={styles.summaryValue}>{formatCurrency(totalSales, currency)}</span>
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.tooltipDot + " " + styles.dotPurchases} aria-hidden="true" />
          Purchases: <span className={styles.summaryValue}>{formatCurrency(totalPurchases, currency)}</span>
        </span>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={styles.chartSvg}
        role="presentation"
      >
        {/* Grid */}
        {yValues.map((v, i) => {
          const y = yFor(v);
          return <line key={i} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className={styles.gridLine} />;
        })}

        {/* Y labels */}
        {yValues.map((v, i) => {
          const y = yFor(v);
          return (
            <text key={i} x={padding.left - 8} y={y + 3} className={styles.axisLabelY}>
              {compactCurrencyAxis(v, currency)}
            </text>
          );
        })}

        {/* X labels */}
        {data.map((b, i) => {
          if (!b.shortLabel) return null;
          const x = xFor(i);
          return (
            <text key={i} x={x} y={height - 6} className={styles.axisLabel}>
              {b.shortLabel}
            </text>
          );
        })}

        {/* Guide line */}
        {hoverIndex !== null && (
          <line x1={hoverX} x2={hoverX} y1={padding.top} y2={padding.top + chartH} className={styles.guideLine} />
        )}

        {/* Lines */}
        <path d={salesPath} className={styles.lineSales} />
        <path d={purchasesPath} className={styles.linePurchases} />

        {/* Points on hover */}
        {hoverIndex !== null && (
          <>
            <circle cx={xFor(hoverIndex)} cy={yFor(data[hoverIndex].sales)} r={4} className={styles.pointSales} />
            <circle cx={xFor(hoverIndex)} cy={yFor(data[hoverIndex].purchases)} r={4} className={styles.pointPurchases} />
          </>
        )}
      </svg>

      {hoverBucket && hoverIndex !== null && (
        <div
          className={styles.tooltip}
          style={{
            left: `${Math.min(Math.max(hoverX + padding.left - chartW * 0, 110), width - 110)}px`,
            top: `${Math.min(yFor(hoverBucket.sales), yFor(hoverBucket.purchases)) - 10}px`,
          }}
        >
          <div className={styles.tooltipDate}>{formatTooltipDate(hoverBucket, period, language)}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>
              <span className={styles.tooltipDot + " " + styles.dotSales} /> Sales
            </span>
            <span className={styles.tooltipValue}>{formatCurrency(hoverBucket.sales, currency)}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>
              <span className={styles.tooltipDot + " " + styles.dotPurchases} /> Purchases
            </span>
            <span className={styles.tooltipValue}>{formatCurrency(hoverBucket.purchases, currency)}</span>
          </div>
        </div>
      )}

      <div className={styles.legend} aria-hidden="true">
        <span className={styles.legendItem}>
          <span className={styles.tooltipDot + " " + styles.dotSales} /> Sales
        </span>
        <span className={styles.legendItem}>
          <span className={styles.tooltipDot + " " + styles.dotPurchases} /> Purchases
        </span>
      </div>

      {/* Accessible summary */}
      <div className="sr-only" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        Business overview for {period}: total sales {formatCurrency(totalSales, currency)}, total purchases {formatCurrency(totalPurchases, currency)}.
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonBar} style={{ width: "30%" }} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonBar} style={{ width: "45%", alignSelf: "center", marginTop: 8 }} />
    </div>
  );
}

export function ChartError({ onRetry, language }: { onRetry: () => void; language: string }) {
  const msg = language === "fr" ? "Impossible de charger l'activité." : language === "ar" ? "تعذر تحميل النشاط." : "Unable to load business activity.";
  const retryLabel = language === "fr" ? "Réessayer" : language === "ar" ? "إعادة المحاولة" : "Retry";
  return (
    <div style={{ height: 260, display: "grid", placeItems: "center", textAlign: "center", gap: 8 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>{msg}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          minHeight: 32,
          padding: "0 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--panel)",
          color: "var(--text)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
}
