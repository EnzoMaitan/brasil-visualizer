// Legend, hover tooltip, detail sidebar, and the no-selection overview.
import { useViz, statsOf, rankOf } from "../context/VizContext";
import { fmt } from "../viz/modes";
import type { FmtKind, Mode, Scale } from "../viz/modes";
import { BR_STATES_META } from "../data/states-meta";
import { BR_DATA } from "../data/dataset";
import type { Lang, StateRecord } from "../data/types";
import { RankBar, MiniRange, StackedBar, Sparkline } from "./charts";

const META = BR_STATES_META;

function headlineSpec(mode: Mode): { prop: string; kind: FmtKind } {
  if (mode.scale === "cat") return { prop: mode.headlineProp!, kind: mode.headlineKind! };
  return { prop: mode.prop!, kind: mode.kind! };
}
function fval(v: number, kind: FmtKind, locale: Lang) { return fmt(v, kind, locale); }

// ---- Legend -------------------------------------------------------------
export function Legend({ mode, scale }: { mode: Mode; scale: Scale }) {
  const { t, locale } = useViz();
  let body;
  if (scale.kind === "cat") {
    body = (
      <div className="legend-cats">
        {mode.categories!.map((c) => (
          <div key={c} className="legend-cat">
            <span className="dot" style={{ background: scale.catColor!(c) }}></span>
            <span>{t("cat." + c)}</span>
          </div>
        ))}
      </div>
    );
  } else {
    const stops: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const v = scale.min! + (i / 10) * (scale.max! - scale.min!);
      stops.push(scale.sampleAt!(v));
    }
    const grad = `linear-gradient(90deg, ${stops.join(",")})`;
    const mid = scale.kind === "div" ? scale.mid! : (scale.min! + scale.max!) / 2;
    body = (
      <div className="legend-scale">
        <div className="legend-grad" style={{ background: grad }}></div>
        <div className="legend-ticks">
          <span>{fval(scale.rawMin != null ? scale.rawMin : scale.min!, mode.kind!, locale)}</span>
          <span>{fval(mid, mode.kind!, locale)}</span>
          <span>{fval(scale.rawMax != null ? scale.rawMax : scale.max!, mode.kind!, locale)}</span>
        </div>
      </div>
    );
  }
  const dirNote = mode.dir === -1 ? t("ui.higherWorse") : mode.dir === 1 ? t("ui.higherBetter") : null;
  return (
    <div className="legend">
      <div className="legend-head">
        <span className="eyebrow">{t("ui.legend")}</span>
        <span className="legend-metric">{t("ind." + headlineSpec(mode).prop)}{dirNote ? <em> · {dirNote}</em> : null}</span>
      </div>
      {body}
    </div>
  );
}

// ---- Tooltip ------------------------------------------------------------
export function Tooltip({ code, mode, scale, records }: { code: string; mode: Mode; scale: Scale; records: StateRecord[] }) {
  const { t, locale } = useViz();
  const rec = records.find((r) => r.code === code);
  if (!rec) return null;
  const meta = META[code];
  const spec = headlineSpec(mode);
  const cat = mode.scale === "cat" ? (rec[mode.prop!] as string) : null;
  return (
    <div className="tooltip">
      <div className="tooltip-head">
        <span className="tooltip-sigla">{meta.sigla}</span>
        <span className="tooltip-name">{meta.name}</span>
      </div>
      <div className="tooltip-region">{t("region." + meta.region)}</div>
      <div className="tooltip-metric">
        <span className="tooltip-label">{t("ind." + spec.prop)}</span>
        <span className="tooltip-value">
          {cat ? <span className="tooltip-cat"><span className="dot" style={{ background: scale.catColor!(cat) }}></span>{t("cat." + cat)}</span> : null}
          {fval(rec[spec.prop] as number, spec.kind, locale)}
        </span>
      </div>
    </div>
  );
}

// ---- Indicator row ------------------------------------------------------
function IndicatorRow({ ind, rec, records, onMetric, active }: {
  ind: Mode["indicators"][number]; rec: StateRecord; records: StateRecord[];
  onMetric?: (prop: string) => void; active?: boolean;
}) {
  const { t, locale } = useViz();
  const raw = rec[ind.prop];
  const has = typeof raw === "number" && Number.isFinite(raw);
  const s = statsOf(records, ind.prop);
  const available = Number.isFinite(s.min); // at least one state has this indicator
  const clickable = !!onMetric && available;
  const color = ind.dir === -1 ? "var(--neg)" : ind.dir === 1 ? "var(--pos)" : "var(--accent)";
  const cls = "ind-row" + (active ? " ind-row--active" : "") + (clickable ? " ind-row--clickable" : "");
  const body = (
    <>
      <span className="ind-label">{t("ind." + ind.key)}</span>
      <div className="ind-bar">{has ? <MiniRange value={raw} min={s.min} max={s.max} color={color} /> : null}</div>
      <span className={"ind-val" + (has ? "" : " ind-val--empty")}>{has ? fval(raw, ind.kind, locale) : "—"}</span>
    </>
  );
  if (!clickable) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={() => onMetric!(ind.prop)}
      title={t("ui.showOnMap")} aria-pressed={active}>{body}</button>
  );
}

// ---- Sidebar detail -----------------------------------------------------
export function Detail({ code, mode, scale, records, onClose, onMetric }: { code: string; mode: Mode; scale: Scale; records: StateRecord[]; onClose: () => void; onMetric?: (prop: string) => void }) {
  const { t, locale } = useViz();
  const rec = records.find((r) => r.code === code);
  if (!rec) return null;
  const meta = META[code];
  const spec = headlineSpec(mode);
  const asc = !!mode.invertGood || mode.dir === -1;
  const rank = rankOf(records, code, spec.prop, asc);
  const s = statsOf(records, spec.prop);
  const cat = mode.scale === "cat" ? (rec[mode.prop!] as string) : null;
  const series = BR_DATA.series(code, spec.prop);
  const swatch = mode.scale === "cat" ? scale.catColor!(cat!) : scale.colorOf(rec);

  return (
    <div className="detail">
      <div className="detail-top">
        <div>
          <div className="detail-sigla-row">
            <span className="detail-sigla" style={{ background: swatch, color: "var(--on-swatch)" }}>{meta.sigla}</span>
            <span className="detail-region">{t("region." + meta.region)}</span>
          </div>
          <h2 className="detail-name">{meta.name}</h2>
          <div className="detail-meta">{t("ui.capital")}: {meta.capital} · {fmt(meta.area_km2, "int", locale)} km²</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
      </div>

      <div className="headline-card">
        <span className="eyebrow">{t("mode." + mode.key + ".name")}</span>
        <div className="headline-row">
          <span className="headline-value">{fval(rec[spec.prop] as number, spec.kind, locale)}</span>
          <span className="rank-pill">{t("ui.rank")} {rank}<span className="rank-of"> /{records.length}</span></span>
        </div>
        {cat ? <div className="headline-cat"><span className="dot" style={{ background: scale.catColor!(cat) }}></span>{t("ui.dominant")}: {t("cat." + cat)}</div> : null}
        <RankBar value={rec[spec.prop] as number} min={s.min} max={s.max} color={swatch} fmt={spec.kind} height={9} />
      </div>

      {mode.breakdown ? (
        <div className="detail-section">
          <span className="eyebrow">{t("ui.breakdown")}</span>
          <StackedBar parts={mode.breakdown.parts.map((p) => ({
            value: rec[p.prop] as number,
            color: scale.catColor ? scale.catColor(p.cat) : "var(--accent)",
            label: t("cat." + p.cat),
            valueLabel: fmt(rec[p.prop] as number, "pct1", locale),
          }))} />
        </div>
      ) : null}

      <div className="detail-section">
        <span className="eyebrow">{mode.breakdown ? t("ui.thisState") : t("ui.breakdown")}</span>
        <div className="ind-list">
          {mode.indicators.map((ind) => (
            <IndicatorRow key={ind.key} ind={ind} rec={rec} records={records}
              onMetric={onMetric} active={spec.prop === ind.prop} />
          ))}
        </div>
      </div>

      <div className="detail-section">
        <span className="eyebrow">{t("ui.trend")}</span>
        <Sparkline values={series} years={BR_DATA.years} color="var(--accent)" fmt={spec.kind} />
      </div>
    </div>
  );
}

// ---- Overview (nothing selected) ---------------------------------------
export function Overview({ mode, scale, records, onHover, onSelect }: {
  mode: Mode; scale: Scale; records: StateRecord[];
  onHover: (code: string | null) => void; onSelect: (code: string | null) => void;
}) {
  const { t, locale } = useViz();
  const spec = headlineSpec(mode);
  let list;
  if (mode.scale === "cat") {
    const counts: Record<string, number> = {};
    mode.categories!.forEach((c) => (counts[c] = 0));
    records.forEach((r) => { counts[r[mode.prop!] as string] = (counts[r[mode.prop!] as string] || 0) + 1; });
    list = (
      <div className="ov-cats">
        {mode.categories!.map((c) => (
          <div key={c} className="ov-cat">
            <span className="dot" style={{ background: scale.catColor!(c) }}></span>
            <span className="ov-cat-label">{t("cat." + c)}</span>
            <span className="ov-cat-count">{counts[c]}</span>
          </div>
        ))}
      </div>
    );
  } else {
    const asc = !!mode.invertGood || mode.dir === -1;
    const sorted = [...records].sort((a, b) =>
      asc ? (a[spec.prop] as number) - (b[spec.prop] as number) : (b[spec.prop] as number) - (a[spec.prop] as number)
    );
    const top = sorted.slice(0, 4), bottom = sorted.slice(-4).reverse();
    const Row = ({ r, i }: { r: StateRecord; i: number }) => (
      <button className="ov-row" onMouseEnter={() => onHover(r.code)} onMouseLeave={() => onHover(null)} onClick={() => onSelect(r.code)}>
        <span className="ov-rank">{i}</span>
        <span className="dot" style={{ background: scale.colorOf(r) }}></span>
        <span className="ov-name">{META[r.code].name}</span>
        <span className="ov-val">{fval(r[spec.prop] as number, spec.kind, locale)}</span>
      </button>
    );
    list = (
      <div className="ov-lists">
        <div>
          <div className="ov-sub">↑ {t("ui.max")}</div>
          {top.map((r, i) => <Row key={r.code} r={r} i={i + 1} />)}
        </div>
        <div>
          <div className="ov-sub">↓ {t("ui.min")}</div>
          {bottom.map((r, i) => <Row key={r.code} r={r} i={records.length - i} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="overview">
      <span className="eyebrow">{t("ui.overview")}</span>
      <h2 className="ov-title">{t("mode." + mode.key + ".name")}</h2>
      <p className="ov-desc">{t("mode." + mode.key + ".desc")}</p>
      <div className="ov-hint">{t("ui.selectHint")}</div>
      <div className="ov-section-label">{mode.scale === "cat" ? t("ui.dominant") : t("ui.topBottom")}</div>
      {list}
    </div>
  );
}
