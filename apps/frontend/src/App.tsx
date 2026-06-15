// App root: state, layout, tooltip positioning, Tweaks wiring.
import { useEffect, useMemo, useRef, useState } from "react";
import { VizContext } from "./context/VizContext";
import type { VizContextValue } from "./context/VizContext";
import { makeT } from "./i18n";
import type { Lang } from "./data/types";
import { BR_DATA } from "./data/synthetic";
import { MODE_BY_KEY, makeScale, PALETTES, paletteKeys } from "./viz/modes";
import { BrazilMap } from "./components/BrazilMap";
import { Legend, Tooltip, Detail, Overview } from "./components/panels";
import { ModeSwitcher, Search, YearSlider, LangToggle, DataBadge, GearButton, Brand } from "./components/controls";
import { useTweaks } from "./components/tweaks/useTweaks";
import type { TweakValues } from "./components/tweaks/useTweaks";
import { TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakSelect } from "./components/tweaks/TweaksPanel";

const TWEAK_DEFAULTS: TweakValues = {
  borderWidth: 1.1,
  glow: 55,
  palette: "editorial",
  labels: "minimal",
  dark: false,
};

const ls = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  },
};

export default function App() {
  const [lang, setLang] = useState<Lang>(() => ls.get("bv.lang", (navigator.language || "en").startsWith("pt") ? "pt-BR" : "en"));
  const [modeKey, setModeKey] = useState<string>(() => ls.get("bv.mode", "demographics"));
  const [year, setYear] = useState<number>(() => {
    const y = ls.get("bv.year", 2022);
    return BR_DATA.years.includes(y) ? y : 2022;
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => ls.set("bv.lang", lang), [lang]);
  useEffect(() => ls.set("bv.mode", modeKey), [modeKey]);
  useEffect(() => ls.set("bv.year", year), [year]);

  const t = useMemo(() => makeT(lang), [lang]);
  const mode = MODE_BY_KEY[modeKey];
  const records = useMemo(() => BR_DATA.all(year), [year]);
  const scale = useMemo(() => makeScale(mode, records, tw.palette), [mode, records, tw.palette]);

  const ctx = useMemo<VizContextValue>(() => ({ t, locale: lang, lang, tweaks: tw }), [t, lang, tw]);

  function onMove(e: React.PointerEvent) {
    const el = tipRef.current;
    if (!el) return;
    const pad = 16, w = 230, h = 96;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth) x = e.clientX - w - pad;
    if (y + h > window.innerHeight) y = e.clientY - h - pad;
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  return (
    <VizContext.Provider value={ctx}>
      <div className={"app" + (tw.dark ? " dark" : "")}>
        <header className="topbar">
          <Brand />
          <div className="topbar-center">
            <YearSlider year={year} onChange={setYear} />
          </div>
          <div className="topbar-right">
            <Search onSelect={(c) => setSelected(c)} onHover={setHovered} />
            <LangToggle lang={lang} onChange={setLang} />
            <DataBadge />
            <GearButton onClick={() => setTweaksOpen((o) => !o)} />
          </div>
        </header>

        <main className="layout">
          <aside className="rail rail-left">
            <ModeSwitcher active={modeKey} onChange={(k) => setModeKey(k)} paletteKey={tw.palette} />
          </aside>

          <section className="map-area">
            <BrazilMap records={records} mode={mode} scale={scale}
              hovered={hovered} selected={selected}
              onHover={setHovered} onSelect={setSelected} onMove={onMove} />
            <Legend mode={mode} scale={scale} />
          </section>

          <aside className="rail rail-right">
            {selected
              ? <Detail code={selected} mode={mode} scale={scale} records={records} onClose={() => setSelected(null)} />
              : <Overview mode={mode} scale={scale} records={records} onHover={setHovered} onSelect={setSelected} />}
          </aside>
        </main>

        <div className="tooltip-layer" ref={tipRef} style={{ display: hovered ? "block" : "none" }}>
          {hovered ? <Tooltip code={hovered} mode={mode} scale={scale} records={records} /> : null}
        </div>

        <TweaksPanel title="Tweaks" open={tweaksOpen} onClose={() => setTweaksOpen(false)}>
          <TweakSection label={t("tw.section.borders")} />
          <TweakSlider label={t("tw.borderWidth")} value={tw.borderWidth} min={0.4} max={3} step={0.1} unit="px"
            onChange={(v) => setTweak("borderWidth", v)} />
          <TweakSlider label={t("tw.glow")} value={tw.glow} min={0} max={100} step={5}
            onChange={(v) => setTweak("glow", v)} />
          <TweakSection label={t("tw.section.color")} />
          <TweakSelect label={t("tw.palette")} value={tw.palette}
            options={paletteKeys.map((k) => ({ value: k, label: PALETTES[k].label }))}
            onChange={(v) => setTweak("palette", v)} />
          <TweakToggle label={t("tw.dark")} value={tw.dark} onChange={(v) => setTweak("dark", v)} />
          <TweakSection label={t("tw.section.map")} />
          <TweakSelect label={t("tw.labels")} value={tw.labels}
            options={[
              { value: "none", label: t("tw.labels.none") },
              { value: "minimal", label: t("tw.labels.minimal") },
              { value: "all", label: t("tw.labels.all") },
            ]}
            onChange={(v) => setTweak("labels", v as TweakValues["labels"])} />
        </TweaksPanel>
      </div>
    </VizContext.Provider>
  );
}
