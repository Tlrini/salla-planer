import { useState } from 'react';

export interface BarSeries {
  key: string;
  label: string;
  /** CSS color (a custom property from the dashboard palette). */
  color: string;
  values: number[];
}

interface Props {
  title: string;
  categories: readonly string[];
  series: BarSeries[];
  /** Axis ticks. */
  format: (v: number) => string;
  /** Exact values in the tooltip (defaults to `format`). */
  formatValue?: (v: number) => string;
  /** Extra tooltip lines per category (e.g. "3 të konfirmuara"). */
  details?: (index: number) => string[];
  height?: number;
}

const W = 720;
const PAD = { top: 12, right: 8, bottom: 26, left: 64 };

/** Round the axis maximum up to a "nice" value (1, 2, 2.5, 5 × 10^n). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Bar top with 4 px rounded data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Grouped vertical bars on one y-axis (all series share a unit), with recessive grid, a legend
 * for 2+ series and a hover tooltip per category.
 */
export function BarChart({
  title,
  categories,
  series,
  format,
  formatValue = format,
  details,
  height = 240,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / categories.length;
  const groupW = Math.min(band * 0.72, 44);
  const gap = 2;
  const barW = (groupW - gap * (series.length - 1)) / series.length;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'chart-baseline' : 'chart-grid'}
              />
              <text x={PAD.left - 8} y={y(t) + 4} className="chart-tick" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const gx = PAD.left + i * band + (band - groupW) / 2;
            return (
              <g key={c}>
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  return (
                    <path
                      key={s.key}
                      d={barPath(gx + k * (barW + gap), y(v), barW, PAD.top + plotH - y(v))}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  );
                })}
                <text
                  x={PAD.left + i * band + band / 2}
                  y={height - 8}
                  className="chart-tick"
                  textAnchor="middle"
                >
                  {c}
                </text>
                {/* Whole column is the hover target, bigger than the bars. */}
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onClick={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              left: `${((PAD.left + hover * band + band / 2) / W) * 100}%`,
            }}
          >
            <strong>{categories[hover]}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
                {s.label}: <span className="mono">{formatValue(s.values[hover] ?? 0)}</span>
              </span>
            ))}
            {details?.(hover).map((d) => (
              <span key={d} className="muted">
                {d}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
