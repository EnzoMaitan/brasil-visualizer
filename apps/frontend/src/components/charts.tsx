// Small SVG charts for the detail sidebar.
import { useViz } from "../context/VizContext";
import { fmt } from "../viz/modes";
import type { FmtKind } from "../viz/modes";

// Horizontal position marker within a [min,max] range.
export function RankBar({
  value, min, max, color, fmt: fmtKind, height,
}: { value: number; min: number; max: number; color: string; fmt: FmtKind; height?: number }) {
  const { locale } = useViz();
  const pct = max === min ? 0.5 : (value - min) / (max - min);
  const x = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className="rankbar">
      <div className="rankbar-track" style={{ height: (height || 8) + "px" }}>
        <div className="rankbar-fill" style={{ width: x + "%", background: color }}></div>
        <div className="rankbar-knob" style={{ left: x + "%", background: color }}></div>
      </div>
      <div className="rankbar-ends">
        <span>{fmt(min, fmtKind, locale)}</span>
        <span>{fmt(max, fmtKind, locale)}</span>
      </div>
    </div>
  );
}

// Tiny inline range bar for indicator rows.
export function MiniRange({
  value, min, max, color,
}: { value: number; min: number; max: number; color: string }) {
  const pct = max === min ? 0.5 : (value - min) / (max - min);
  const x = Math.max(2, Math.min(100, pct * 100));
  return (
    <div className="minirange">
      <div className="minirange-fill" style={{ width: x + "%", background: color }}></div>
    </div>
  );
}

export interface StackedPart {
  value: number;
  color: string;
  label: string;
  valueLabel: string;
}
// 100% stacked horizontal bar (sector split, energy mix).
export function StackedBar({ parts }: { parts: StackedPart[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="stacked">
      <div className="stacked-bar">
        {parts.map((p, i) => (
          <div key={i} className="stacked-seg" title={p.label}
            style={{ width: (p.value / total) * 100 + "%", background: p.color }}></div>
        ))}
      </div>
      <div className="stacked-legend">
        {parts.map((p, i) => (
          <div key={i} className="stacked-key">
            <span className="dot" style={{ background: p.color }}></span>
            <span className="stacked-key-label">{p.label}</span>
            <span className="stacked-key-val">{p.valueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Sparkline of a metric across years.
export function Sparkline({
  values, years, color, fmt: fmtKind,
}: { values: number[]; years: number[]; color: string; fmt: FmtKind }) {
  const { locale } = useViz();
  const W = 240, H = 64, pad = 10;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / span) * (H - 2 * pad);
    return [x, y] as [number, number];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L${pts[0][0].toFixed(1)} ${H - pad} Z`;
  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="spark-svg">
        <path d={area} fill={color} opacity="0.12"></path>
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"></path>
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.4 : 2.2}
            fill={i === pts.length - 1 ? color : "var(--surface)"} stroke={color} strokeWidth="1.6"></circle>
        ))}
      </svg>
      <div className="spark-axis">
        {years.map((y, i) => (
          <div key={i} className="spark-tick">
            <span className="spark-year">{y}</span>
            <span className="spark-val">{fmt(values[i], fmtKind, locale)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
