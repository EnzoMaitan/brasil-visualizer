// App root: state, layout, tooltip positioning, Tweaks wiring.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VizContext } from "./context/VizContext";
import type { VizContextValue } from "./context/VizContext";
import { makeT } from "./i18n";
import type { Lang } from "./data/types";
import { BR_DATA, loadData, loadMuniData, loadRegionData } from "./data/dataset";
import { loadMunicipalities } from "./data/municipalities";
import type { MuniPath } from "./data/types";
import { MODE_BY_KEY, makeScale, isModeAvailable, availableModeKeys, PALETTES, paletteKeys } from "./viz/modes";
import type { Mode } from "./viz/modes";
import { BrazilMap } from "./components/BrazilMap";
import type { MapLayer } from "./components/BrazilMap";
import { Legend, Tooltip, PlaceTooltip, Detail, Overview } from "./components/panels";
import { ModeSwitcher, Search, YearSlider, LangToggle, GearButton, LayerToggle, MuniIcon, RegionIcon, Brand } from "./components/controls";
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
  const [metricProp, setMetricProp] = useState<string | null>(null);
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [ready, setReady] = useState(false);
  // Active map layer — states / municipalities / macro-regions are mutually exclusive.
  const [layer, setLayer] = useState<MapLayer>(() => {
    const v = ls.get<MapLayer | boolean>("bv.layer", ls.get("bv.showMuni", false) ? "municipio" : "uf");
    return v === "municipio" || v === "regiao" ? v : "uf";
  });
  const [muniGeo, setMuniGeo] = useState<MuniPath[] | null>(null);
  const [muniLoading, setMuniLoading] = useState(false);
  const [muniReady, setMuniReady] = useState(false); // municipality indicator data loaded
  const [regionLoading, setRegionLoading] = useState(false);
  const [regionReady, setRegionReady] = useState(false); // macro-region indicator data loaded
  const [hoveredMuni, setHoveredMuni] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  // Load the live dataset once (falls back to synthetic if the API is down).
  useEffect(() => {
    loadData().then(() => {
      setYear((y) => (BR_DATA.years.includes(y) ? y : BR_DATA.years[BR_DATA.years.length - 1] ?? y));
      setReady(true);
    });
  }, []);

  useEffect(() => ls.set("bv.lang", lang), [lang]);
  useEffect(() => ls.set("bv.mode", modeKey), [modeKey]);
  useEffect(() => ls.set("bv.year", year), [year]);
  useEffect(() => ls.set("bv.layer", layer), [layer]);

  // Lazy-load the municipality mesh (its own chunk) AND indicator data the first time that
  // layer is needed — toggled this session or restored from a persisted preference. Fetched
  // on demand to keep initial load fast.
  useEffect(() => {
    if (layer !== "municipio" || muniLoading || (muniGeo && muniReady)) return;
    setMuniLoading(true);
    Promise.all([loadMunicipalities(), loadMuniData()])
      .then(([geo, dataOk]) => { setMuniGeo(geo); setMuniReady(dataOk); })
      .catch((err) => console.warn("[muni] failed to load municipality layer:", err))
      .finally(() => setMuniLoading(false));
  }, [layer, muniGeo, muniReady, muniLoading]);

  // Lazy-load macro-region indicator data (5 rows; geometry is bundled) on first use.
  useEffect(() => {
    if (layer !== "regiao" || regionLoading || regionReady) return;
    setRegionLoading(true);
    loadRegionData()
      .then((ok) => setRegionReady(ok))
      .catch((err) => console.warn("[region] failed to load macro-region data:", err))
      .finally(() => setRegionLoading(false));
  }, [layer, regionReady, regionLoading]);

  // Mutually-exclusive toggle: turn a layer on, or back to states if it's already active.
  const toggleLayer = (l: MapLayer) => setLayer((cur) => (cur === l ? "uf" : l));

  const t = useMemo(() => makeT(lang), [lang]);
  const records = useMemo(() => (ready ? BR_DATA.all(year) : []), [year, ready]);
  const available = useMemo(() => availableModeKeys(records), [records]);

  // Keep the active mode on one that actually has data (others are greyed out).
  const modeKeyEff =
    ready && available.size && !available.has(modeKey)
      ? available.has("demographics")
        ? "demographics"
        : ([...available][0] as string)
      : modeKey;
  useEffect(() => {
    if (ready && modeKeyEff !== modeKey) setModeKey(modeKeyEff);
  }, [ready, modeKeyEff, modeKey]);

  // Switching mode clears any per-indicator override (back to the mode's default metric).
  useEffect(() => { setMetricProp(null); }, [modeKeyEff]);

  const baseMode = MODE_BY_KEY[modeKeyEff] ?? MODE_BY_KEY.demographics;

  // A clicked indicator (in the detail panel) overrides the choropleth variable: the whole
  // map recolors by that metric on a sequential scale. No override → the mode's default.
  const mode = useMemo<Mode>(() => {
    if (!metricProp) return baseMode;
    const ind = baseMode.indicators.find((i) => i.prop === metricProp);
    if (!ind) return baseMode;
    return {
      ...baseMode,
      scale: "seq",
      prop: ind.prop,
      kind: ind.kind,
      dir: ind.dir,
      mid: undefined,
      categories: undefined,
      headlineProp: undefined,
      headlineKind: undefined,
    };
  }, [baseMode, metricProp]);

  // Toggle: clicking the active metric returns to the mode's default choropleth.
  const onMetric = (prop: string) => setMetricProp((p) => (p === prop ? null : prop));

  const scale = useMemo(() => makeScale(mode, records, tw.palette), [mode, records, tw.palette]);

  // Municipality choropleth: when the layer is on and the active mode has N6 data, color each
  // municipality by its OWN value on a municipality-derived scale; otherwise it falls back to
  // inheriting the parent state's color (handled in BrazilMap). The legend follows suit.
  const muniOn = layer === "municipio" && muniReady;
  const muniByCode = useMemo(() => (muniOn ? BR_DATA.muniByCode(year) : {}), [muniOn, year]);
  const muniRecords = useMemo(() => (muniOn ? BR_DATA.allMuni(year) : []), [muniOn, year]);
  const muniHasData = useMemo(
    () => muniRecords.length > 0 && isModeAvailable(mode, muniRecords),
    [muniRecords, mode],
  );
  const muniScale = useMemo(
    () => (muniHasData ? makeScale(mode, muniRecords, tw.palette, { robust: true }) : null),
    [muniHasData, mode, muniRecords, tw.palette],
  );

  // Macro-region choropleth: same pattern at N2. No outlier wash-out (only 5 regions), so the
  // scale is plain. Falls through to the state choropleth for modes without region data.
  const regionOn = layer === "regiao" && regionReady;
  const regionByCode = useMemo(() => (regionOn ? BR_DATA.regionByCode(year) : {}), [regionOn, year]);
  const regionRecords = useMemo(() => (regionOn ? BR_DATA.allRegions(year) : []), [regionOn, year]);
  const regionHasData = useMemo(
    () => regionRecords.length > 0 && isModeAvailable(mode, regionRecords),
    [regionRecords, mode],
  );
  const regionScale = useMemo(
    () => (regionHasData ? makeScale(mode, regionRecords, tw.palette) : null),
    [regionHasData, mode, regionRecords, tw.palette],
  );

  // The legend reflects whatever choropleth is actually on screen.
  const displayScale = muniHasData ? muniScale! : regionHasData ? regionScale! : scale;

  const onHoverMuni = useCallback((code: string | null) => {
    setHoveredMuni(code);
    if (code) setHovered(null); // muni tooltip replaces the state tooltip while hovering munis
  }, []);
  const onHoverRegion = useCallback((code: string | null) => {
    setHoveredRegion(code);
    if (code) setHovered(null);
  }, []);

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

  if (!ready) {
    return (
      <div className={"app app--loading" + (tw.dark ? " dark" : "")}>
        <div className="loading">
          <div className="loading-spinner" />
          <span>{t("ui.loading")}</span>
        </div>
      </div>
    );
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
            <LayerToggle active={layer === "regiao"} loading={regionLoading}
              onToggle={() => toggleLayer("regiao")} label={t("ui.regions")}><RegionIcon /></LayerToggle>
            <LayerToggle active={layer === "municipio"} loading={muniLoading}
              onToggle={() => toggleLayer("municipio")} label={t("ui.municipalities")}><MuniIcon /></LayerToggle>
            <LangToggle lang={lang} onChange={setLang} />
            <GearButton onClick={() => setTweaksOpen((o) => !o)} />
          </div>
        </header>

        <main className="layout">
          <aside className="rail rail-left">
            <ModeSwitcher active={modeKeyEff} onChange={(k) => setModeKey(k)} paletteKey={tw.palette} available={available}
              metricProp={metricProp} onMetric={onMetric} records={records} />
          </aside>

          <section className="map-area">
            <BrazilMap records={records} mode={mode} scale={scale}
              hovered={hovered} selected={selected} layer={layer}
              municipalities={layer === "municipio" ? muniGeo : null}
              muniByCode={muniByCode} muniScale={muniScale} hoveredMuni={hoveredMuni}
              regionByCode={regionByCode} regionScale={regionScale} hoveredRegion={hoveredRegion}
              onHover={setHovered} onHoverMuni={onHoverMuni} onHoverRegion={onHoverRegion}
              onSelect={setSelected} onMove={onMove} />
            <Legend mode={mode} scale={displayScale} />
          </section>

          <aside className="rail rail-right">
            {selected
              ? <Detail code={selected} mode={mode} scale={scale} records={records} onMetric={onMetric} onClose={() => setSelected(null)} />
              : <Overview mode={mode} scale={scale} records={records} onHover={setHovered} onSelect={setSelected} />}
          </aside>
        </main>

        <div className="tooltip-layer" ref={tipRef}
          style={{ display: (hovered || (hoveredMuni && muniHasData) || (hoveredRegion && regionHasData)) ? "block" : "none" }}>
          {hoveredRegion && regionHasData
            ? <PlaceTooltip code={hoveredRegion} mode={mode} scale={regionScale!} rec={regionByCode[hoveredRegion]} name={BR_DATA.regionName(hoveredRegion)} caption={t("ui.region")} />
            : hoveredMuni && muniHasData
            ? <PlaceTooltip code={hoveredMuni} mode={mode} scale={muniScale!} rec={muniByCode[hoveredMuni]} name={BR_DATA.muniName(hoveredMuni)} caption={t("ui.municipality")} />
            : hovered ? <Tooltip code={hovered} mode={mode} scale={scale} records={records} /> : null}
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
