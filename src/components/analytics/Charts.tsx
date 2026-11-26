import React, { useId, useState } from 'react';

export interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

export interface MultiSeriesPoint {
  label: string;
  [key: string]: string | number;
}

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartContainerProps> = ({
  title,
  subtitle,
  rightSlot,
  empty,
  emptyText = 'No recorded database entries in this window.',
  children,
}) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161E] p-5 flex flex-col">
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {rightSlot}
    </div>
    {empty ? (
      <div className="h-48 flex items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        {emptyText}
      </div>
    ) : (
      children
    )}
  </div>
);

export const TrendLineChart: React.FC<{
  data: MultiSeriesPoint[];
  series: SeriesConfig[];
  height?: number;
  areaFill?: boolean;
  valueFormatter?: (v: number) => string;
}> = ({
  data,
  series,
  height = 200,
  areaFill = false,
  valueFormatter = (v) => v.toLocaleString(),
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const gradId = useId();
  const width = 640;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allValues = data.flatMap((d) => series.map((s) => Number(d[s.key] || 0)));
  const maxVal = Math.max(1, ...allValues);

  const xFor = (idx: number) => {
    if (data.length <= 1) return padL + plotW / 2;
    return padL + (idx / (data.length - 1)) * plotW;
  };
  const yFor = (val: number) => padT + plotH - (val / maxVal) * plotH;

  const ticks = [0, 0.5, 1].map((t) => Math.round(maxVal * t));

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          {areaFill && series[0] && (
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series[0].color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={series[0].color} stopOpacity="0.01" />
              </linearGradient>
            </defs>
          )}

          {ticks.map((tick, i) => {
            const y = yFor(tick);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {series.map((s, sIdx) => {
            if (data.length === 0) return null;
            const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(Number(d[s.key] || 0)) }));
            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
            const areaD =
              pts.length > 0
                ? `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
                : '';

            return (
              <g key={s.key}>
                {areaFill && sIdx === 0 && pts.length > 1 && (
                  <path d={areaD} fill={`url(#${gradId})`} />
                )}
                <path
                  d={pathD}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={hoveredIdx === i ? 4.5 : 2.5}
                    fill={s.color}
                    className="transition-all"
                  />
                ))}
              </g>
            );
          })}

          {data.map((d, i) => {
            const x = xFor(i);
            const showLabel =
              data.length <= 7 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0;
            const sliceW = data.length > 1 ? plotW / (data.length - 1) : plotW;
            return (
              <g key={d.label}>
                {showLabel && (
                  <text
                    x={x}
                    y={height - 6}
                    textAnchor="middle"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {d.label}
                  </text>
                )}
                <rect
                  x={x - sliceW / 2}
                  y={padT}
                  width={Math.max(12, sliceW)}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
              {data[hoveredIdx].label}
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 tabular-nums">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span>{s.label}:</span>
                  <strong className="font-mono">{valueFormatter(Number(data[hoveredIdx][s.key] || 0))}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const ComparisonBarChart: React.FC<{
  items: Array<{ label: string; value: number; secondaryValue?: number; color?: string; hint?: string }>;
  primaryLabel?: string;
  secondaryLabel?: string;
  valueFormatter?: (v: number) => string;
}> = ({ items, primaryLabel = 'Count', secondaryLabel, valueFormatter = (v) => v.toLocaleString() }) => {
  const maxVal = Math.max(1, ...items.map((i) => Math.max(i.value, i.secondaryValue ?? 0)));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(2, Math.round((item.value / maxVal) * 100));
        const secPct =
          item.secondaryValue !== undefined
            ? Math.max(2, Math.round((item.secondaryValue / maxVal) * 100))
            : null;
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {item.label}
                {item.hint ? (
                  <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</span>
                ) : null}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                {valueFormatter(item.value)}
                {item.secondaryValue !== undefined
                  ? ` · ${secondaryLabel || 'Secondary'}: ${valueFormatter(item.secondaryValue)}`
                  : ''}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800/80 overflow-hidden flex flex-col gap-0.5">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color || '#F59E0B',
                }}
                title={`${primaryLabel}: ${valueFormatter(item.value)}`}
              />
            </div>
            {secPct !== null && (
              <div className="h-1.5 rounded bg-slate-100 dark:bg-slate-800/60 overflow-hidden">
                <div
                  className="h-full rounded bg-sky-500 transition-all"
                  style={{ width: `${secPct}%` }}
                  title={`${secondaryLabel}: ${valueFormatter(item.secondaryValue ?? 0)}`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const PALETTE = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4'];

export const DistributionDonutChart: React.FC<{
  items: Array<{ label: string; value: number; color?: string }>;
  centerLabel?: string;
  valueFormatter?: (v: number) => string;
}> = ({ items, centerLabel = 'Total', valueFormatter = (v) => v.toLocaleString() }) => {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const segments = items
    .filter((i) => i.value > 0)
    .map((item, idx) => {
      const fraction = total > 0 ? item.value / total : 0;
      const dashLength = fraction * circumference;
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return {
        ...item,
        color: item.color || PALETTE[idx % PALETTE.length],
        dashLength,
        offset,
        pct: total > 0 ? Math.round(fraction * 100) : 0,
      };
    });

  const activeSeg = segments.find((s) => s.label === activeLabel) || null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            className="text-slate-100 dark:text-slate-800"
          />
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={activeLabel === seg.label ? 19 : 16}
              strokeDasharray={`${seg.dashLength} ${circumference}`}
              strokeDashoffset={seg.offset}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setActiveLabel(seg.label)}
              onMouseLeave={() => setActiveLabel(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {activeSeg ? activeSeg.label : centerLabel}
          </span>
          <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {activeSeg ? valueFormatter(activeSeg.value) : valueFormatter(total)}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {items.map((item, idx) => {
          const color = item.color || PALETTE[idx % PALETTE.length];
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div
              key={item.label}
              onMouseEnter={() => setActiveLabel(item.label)}
              onMouseLeave={() => setActiveLabel(null)}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="capitalize">{item.label.replace(/_/g, ' ')}</span>
              </span>
              <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                {valueFormatter(item.value)}{' '}
                <span className="text-slate-400 dark:text-slate-500">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
