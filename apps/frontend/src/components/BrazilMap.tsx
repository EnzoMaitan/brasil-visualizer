// The Brazil choropleth map: real IBGE borders projected to SVG, recolored per mode.
// Free zoom & pan: mouse-wheel zooms toward the cursor, click-drag pans, and the
// on-map +/−/reset buttons step the zoom about the center.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useViz } from "../context/VizContext";
import { BR_GEO } from "../viz/projection";
import { BR_STATES_META } from "../data/states-meta";
import type { MuniPath, StateRecord } from "../data/types";
import type { Mode, Scale } from "../viz/modes";

const GEO = BR_GEO;
const W = GEO.width, H = GEO.height;
const MIN_K = 1, MAX_K = 9;

// codes whose label needs a small nudge (viewBox units) to sit nicely
const NUDGE: Record<string, [number, number]> = {
  "16": [4, 6], "53": [10, 2], "25": [3, 0], "28": [4, 2], "24": [4, -2], "32": [3, 2],
};

interface View { k: number; x: number; y: number }

// ---- Municipality overlay ------------------------------------------------
// All 5,570 municipalities, each filled with its PARENT STATE's color (same scale + record
// → zero color mismatch by construction) plus a thin border. Memoized so it re-renders only
// when the data/scale/border change — never on hover, selection, pan, or zoom (pan/zoom is a
// transform on the parent <g>). pointer-events: none so the interactive state layer beneath
// keeps handling hover/click/tooltips.
const MunicipalityLayer = memo(function MunicipalityLayer({ paths, recByCode, scale, borderWidth }: {
  paths: MuniPath[]; recByCode: Record<string, StateRecord>; scale: Scale; borderWidth: number;
}) {
  return (
    <g className="muni-layer">
      {paths.map((m) => {
        const r = recByCode[m.parentCode];
        return (
          <path key={m.code} d={m.d} className="municipality"
            fill={r ? scale.colorOf(r) : "var(--state-empty)"}
            stroke="var(--muni-stroke)" strokeWidth={Math.max(0.3, borderWidth * 0.4)}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        );
      })}
    </g>
  );
});

export interface BrazilMapProps {
  records: StateRecord[];
  mode: Mode;
  scale: Scale;
  hovered: string | null;
  selected: string | null;
  municipalities: MuniPath[] | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string | null) => void;
  onMove: (e: React.PointerEvent) => void;
}

export function BrazilMap({ records, scale, hovered, selected, municipalities, onHover, onSelect, onMove }: BrazilMapProps) {
  const { tweaks } = useViz();
  const recByCode = useMemo(() => Object.fromEntries(records.map((r) => [r.code, r])), [records]);
  const bw = tweaks.borderWidth;
  const glow = tweaks.glow;
  const blur = glow > 0 ? (glow / 100) * 7 + 0.5 : 0;

  const codes = Object.keys(GEO.paths);
  const areas = codes.map((c) => GEO.paths[c].area);
  const areaThresh = 0.018 * Math.max(...areas);

  // ---- zoom / pan state ----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  function clampView(v: View): View {
    const k = Math.max(MIN_K, Math.min(MAX_K, v.k));
    const x = Math.max(W * (1 - k), Math.min(0, v.x));
    const y = Math.max(H * (1 - k), Math.min(0, v.y));
    return { k, x, y };
  }
  function clientToVB(cx: number, cy: number) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }
  // zoom keeping the point (sx,sy) [in base viewBox coords] under the cursor fixed
  function zoomAt(sx: number, sy: number, factor: number) {
    const v = viewRef.current;
    const nk = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
    if (Math.abs(nk - v.k) < 1e-4) return;
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    setView(clampView({ k: nk, x: sx - wx * nk, y: sy - wy * nk }));
  }
  const zoomButton = (factor: number) => zoomAt(W / 2, H / 2, factor);
  const resetView = () => setView({ k: 1, x: 0, y: 0 });

  // native non-passive wheel listener (so we can preventDefault page scroll)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vb = clientToVB(e.clientX, e.clientY);
      zoomAt(vb.x, vb.y, Math.exp(-e.deltaY * 0.0015));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    suppressClick.current = false;
    movedRef.current = false;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    // NB: do NOT capture the pointer here — capturing on press makes Chrome retarget the
    // subsequent `click` to the <svg>, so a state's onClick never fires. We capture only
    // once an actual drag starts (below), keeping plain clicks selectable.
  }
  function onPointerMove(e: React.PointerEvent) {
    if (onMove) onMove(e);
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!movedRef.current && Math.abs(dx) + Math.abs(dy) > 4) {
      movedRef.current = true;
      setDragging(true);
      // Capture now that we're panning, so the drag keeps tracking outside the svg.
      try { svgRef.current!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (!movedRef.current) return;
    const sc = svgRef.current!.getScreenCTM()!.a || 1; // px per viewBox unit
    setView(clampView({ k: viewRef.current.k, x: d.ox + dx / sc, y: d.oy + dy / sc }));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (movedRef.current) suppressClick.current = true;
    dragRef.current = null;
    setDragging(false);
    try { svgRef.current!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function guardedSelect(code: string | null) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onSelect(code);
  }

  function fillFor(code: string) {
    const r = recByCode[code];
    return r ? scale.colorOf(r) : "var(--state-empty)";
  }
  function highlightPath(code: string, kind: "selected" | "hover") {
    const p = GEO.paths[code];
    const sel = kind === "selected";
    return (
      <path key={kind + code} d={p.d}
        style={{
          fill: "none",
          stroke: sel ? "var(--sel-stroke)" : "var(--hover-stroke)",
          strokeWidth: bw + (sel ? 2.2 : 1.3),
          filter: blur ? `drop-shadow(0 0 ${blur}px var(--glow-color))` : "none",
          pointerEvents: "none",
        }}
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    );
  }
  function showLabel(code: string) {
    if (tweaks.labels === "none") return false;
    if (tweaks.labels === "all" || view.k >= 2.6) return true;
    return GEO.paths[code].area >= areaThresh || code === selected || code === hovered;
  }

  const groupTransform = `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`;

  return (
    <div className="map-stage">
      <svg ref={svgRef}
        className={"map-svg" + (dragging ? " is-dragging" : "") + (view.k > 1 ? " is-zoomed" : "")}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onMouseLeave={() => onHover(null)}>
        <rect x="0" y="0" width={W} height={H} fill="var(--map-bg)"
          onMouseEnter={() => onHover(null)} onClick={() => guardedSelect(null)} />
        {/* zoom/pan group */}
        <g transform={groupTransform}>
          <g>
            {codes.map((code) => {
              const isDim = (hovered || selected) && code !== hovered && code !== selected;
              return (
                <path key={code} d={GEO.paths[code].d} fill={fillFor(code)}
                  className={"state" + (isDim ? " state--dim" : "")}
                  style={{ stroke: "var(--state-stroke)", strokeWidth: bw }}
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round"
                  onMouseEnter={() => onHover(code)}
                  onClick={(e) => { e.stopPropagation(); guardedSelect(code); }} />
              );
            })}
          </g>
          {municipalities ? (
            <MunicipalityLayer paths={municipalities} recByCode={recByCode} scale={scale} borderWidth={bw} />
          ) : null}
          {selected && selected !== hovered ? highlightPath(selected, "selected") : null}
          {hovered ? highlightPath(hovered, hovered === selected ? "selected" : "hover") : null}
        </g>
        {/* labels — counter-positioned so they stay a constant screen size.
            pointer-events: none so a sigla never intercepts a click/hover on its state. */}
        <g className="map-labels" style={{ pointerEvents: "none" }}>
          {codes.filter(showLabel).map((code) => {
            const [cx, cy] = GEO.paths[code].centroid;
            const n = NUDGE[code] || [0, 0];
            const lx = (cx + n[0]) * view.k + view.x;
            const ly = (cy + n[1]) * view.k + view.y;
            if (lx < 6 || lx > W - 6 || ly < 6 || ly > H - 6) return null;
            const meta = BR_STATES_META[code];
            const active = code === hovered || code === selected;
            return (
              <text key={code} x={lx} y={ly}
                className={"map-label" + (active ? " map-label--active" : "")}
                textAnchor="middle" dominantBaseline="central">{meta.sigla}</text>
            );
          })}
        </g>
      </svg>

      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => zoomButton(1.5)} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="zoom-btn" onClick={() => zoomButton(1 / 1.5)} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="zoom-btn zoom-btn--reset" onClick={resetView} aria-label="Reset view" title="Reset view"
          disabled={view.k <= 1.001}>⟲</button>
        <div className="zoom-level">{Math.round(view.k * 100)}%</div>
      </div>
    </div>
  );
}
