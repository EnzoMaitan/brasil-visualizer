// Top bar (brand, year slider, search, language, data badge) + the mode-switcher rail.
import { useState } from "react";
import { useViz, statsOf } from "../context/VizContext";
import { PALETTES, MODES, THEME_ORDER, sampleRamp, MODE_BY_KEY } from "../viz/modes";
import type { Mode } from "../viz/modes";
import { BR_STATES_META } from "../data/states-meta";
import { BR_DATA } from "../data/dataset";
import type { Lang, StateRecord } from "../data/types";

const META = BR_STATES_META;

// small palette chip preview for a mode button
function ModeChip({ mode, paletteKey }: { mode: Mode; paletteKey: string }) {
  const pal = PALETTES[paletteKey] || PALETTES.editorial;
  if (mode.scale === "cat") {
    return (
      <span className="mode-chip mode-chip--cat">
        {mode.categories!.slice(0, 4).map((c) => (
          <span key={c} className="chip-dot" style={{ background: pal.cat[c] }}></span>
        ))}
      </span>
    );
  }
  const ramp = mode.scale === "div" ? pal.div : pal.seq;
  const stops = ramp.map((_, i) => sampleRamp(ramp, i / (ramp.length - 1)));
  return <span className="mode-chip" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}></span>;
}

export function ModeSwitcher({ active, onChange, paletteKey, available, metricProp, onMetric, records }: {
  active: string; onChange: (k: string) => void; paletteKey: string; available?: Set<string>;
  metricProp?: string | null; onMetric?: (prop: string) => void; records?: StateRecord[];
}) {
  const { t } = useViz();
  const byTheme: Record<string, Mode[]> = {};
  MODES.forEach((m) => { (byTheme[m.theme] = byTheme[m.theme] || []).push(m); });
  const isEnabled = (key: string) => !available || available.has(key);
  const activeMode = MODE_BY_KEY[active];
  // Which prop is currently driving the choropleth — metric override or mode default.
  const activeProp = metricProp ?? activeMode?.prop ?? activeMode?.headlineProp;
  return (
    <nav className="modes">
      <div className="modes-title eyebrow">{t("ui.modes")}</div>
      {THEME_ORDER.map((theme) => (
        <div key={theme} className="mode-group">
          <div className="mode-group-label">{t("theme." + theme)}</div>
          {(byTheme[theme] || []).map((m) => {
            const enabled = isEnabled(m.key);
            const isActive = m.key === active;
            return (
              <div key={m.key}>
                <button
                  className={"mode-btn" + (isActive ? " mode-btn--active" : "") + (enabled ? "" : " mode-btn--disabled")}
                  onClick={() => enabled && onChange(m.key)}
                  disabled={!enabled}
                  title={enabled ? undefined : t("ui.noDataMode")}>
                  <ModeChip mode={m} paletteKey={paletteKey} />
                  <span className="mode-btn-text">
                    <span className="mode-btn-name">{t("mode." + m.key + ".name")}</span>
                    <span className="mode-btn-desc">{enabled ? t("mode." + m.key + ".desc") : t("ui.noDataMode")}</span>
                  </span>
                </button>
                {isActive && onMetric && (
                  <div className="mode-indicators">
                    {m.indicators.map((ind) => {
                      const s = records ? statsOf(records, ind.prop) : { min: NaN, max: NaN };
                      const hasData = Number.isFinite(s.min);
                      const isIndActive = ind.prop === activeProp;
                      const dotColor = ind.dir === -1 ? "var(--neg)" : ind.dir === 1 ? "var(--pos)" : "var(--accent)";
                      const cls = "mode-ind-item" + (isIndActive ? " mode-ind-item--active" : "") + (!hasData ? " mode-ind-item--nodata" : "");
                      const dot = <span className="mode-ind-dot" style={isIndActive ? { background: dotColor } : undefined} />;
                      const label = <span className="mode-ind-label">{t("ind." + ind.key)}</span>;
                      return hasData ? (
                        <button key={ind.key} type="button" className={cls}
                          onClick={() => onMetric(ind.prop)} title={t("ui.showOnMap")}>
                          {dot}{label}
                        </button>
                      ) : (
                        <div key={ind.key} className={cls}>{dot}{label}</div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// ---- Search combobox ----------------------------------------------------
export function Search({ onSelect, onHover }: { onSelect: (code: string) => void; onHover: (code: string | null) => void }) {
  const { t } = useViz();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const codes = Object.keys(META);
  const matches = q.trim()
    ? codes.filter((c) => META[c].name.toLowerCase().includes(q.toLowerCase()) || META[c].sigla.toLowerCase().includes(q.toLowerCase())).slice(0, 7)
    : [];
  return (
    <div className="search" onBlur={() => setTimeout(() => setOpen(false), 120)}>
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input className="search-input" value={q} placeholder={t("ui.searchPlaceholder")}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && matches.length ? (
        <div className="search-drop">
          {matches.map((c) => (
            <button key={c} className="search-item"
              onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)}
              onClick={() => { onSelect(c); setQ(""); setOpen(false); onHover(null); }}>
              <span className="search-sigla">{META[c].sigla}</span>
              <span>{META[c].name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- Year slider --------------------------------------------------------
export function YearSlider({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const { t } = useViz();
  const years = BR_DATA.years;
  const idx = years.indexOf(year);
  return (
    <div className="yearslider">
      <span className="eyebrow yearslider-label">{t("ui.year")}</span>
      <div className="yearslider-body">
        <input type="range" min={0} max={years.length - 1} step={1} value={idx}
          onChange={(e) => onChange(years[+e.target.value])} className="yearslider-range" />
        <div className="yearslider-ticks">
          {years.map((y) => (
            <button key={y} className={"yearslider-tick" + (y === year ? " is-active" : "")}
              onClick={() => onChange(y)}>{y}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Language toggle ----------------------------------------------------
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="seg">
      <button className={"seg-btn" + (lang === "pt-BR" ? " is-active" : "")} onClick={() => onChange("pt-BR")}>PT</button>
      <button className={"seg-btn" + (lang === "en" ? " is-active" : "")} onClick={() => onChange("en")}>EN</button>
    </div>
  );
}

// ---- Settings / gear button: opens the Tweaks panel ----
export function GearButton({ onClick }: { onClick: () => void }) {
  const { t } = useViz();
  return (
    <button className="tool-btn" onClick={onClick} title={t("ui.settings")} aria-label={t("ui.settings")}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  );
}

export function Brand() {
  const { t } = useViz();
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="7" fill="oklch(0.55 0.13 158)" />
        <polygon points="16,5 28,16 16,27 4,16" fill="oklch(0.82 0.15 95)" />
        <circle cx="16" cy="16" r="5.4" fill="oklch(0.42 0.1 250)" />
      </svg>
      <div className="brand-text">
        <span className="brand-title">{t("app.title")}</span>
        <span className="brand-sub">{t("app.subtitle")}</span>
      </div>
    </div>
  );
}
