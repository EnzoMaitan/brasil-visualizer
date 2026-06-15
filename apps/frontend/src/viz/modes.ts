// Map-mode definitions, color scales, and palettes for Brasil Visualizer.
// A "mode" is one Paradox-style choropleth lens. Three scale kinds:
//   seq  — sequential ramp over a numeric range (totals, rates)
//   div  — diverging ramp around a meaningful midpoint (ratios)
//   cat  — categorical (dominant-of-N), discrete colors
import type { Lang, StateRecord } from "../data/types";

export type Ramp = [number, number, number][];
export type ScaleKind = "seq" | "div" | "cat";

export interface Palette {
  label: string;
  seq: Ramp;
  div: Ramp;
  cat: Record<string, string>;
}

export interface Indicator {
  key: string;
  prop: string;
  kind: FmtKind;
  dir: -1 | 0 | 1;
}
export interface BreakdownPart {
  key: string;
  prop: string;
  cat: string;
}
export interface Mode {
  key: string;
  theme: string;
  scale: ScaleKind;
  prop?: string;
  kind?: FmtKind;
  dir?: -1 | 0 | 1;
  mid?: number;
  invertGood?: boolean;
  categories?: string[];
  headlineProp?: string;
  headlineKind?: FmtKind;
  indicators: Indicator[];
  breakdown?: { unit: string; parts: BreakdownPart[] };
}

export type FmtKind =
  | "int" | "pct" | "pct1" | "permille" | "num1" | "num2" | "dens"
  | "mw" | "money" | "moneyM" | "beds" | "signed";

// ---- oklch ramp sampling -------------------------------------------------
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function oklch(L: number, C: number, H: number) { return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`; }
// ramp = array of [L,C,H]; sample at t in [0,1]
export function sampleRamp(ramp: Ramp, t: number): string {
  t = Math.max(0, Math.min(1, t));
  const n = ramp.length - 1;
  const x = t * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = ramp[i], b = ramp[i + 1];
  return oklch(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
}

// ---- palette families ----------------------------------------------------
export const PALETTES: Record<string, Palette> = {
  editorial: {
    label: "Editorial",
    seq: [[0.962, 0.018, 236], [0.885, 0.052, 232], [0.78, 0.094, 235], [0.648, 0.13, 248], [0.51, 0.143, 262], [0.392, 0.118, 270]],
    div: [[0.55, 0.16, 27], [0.71, 0.11, 44], [0.93, 0.022, 92], [0.74, 0.1, 168], [0.53, 0.115, 168]],
    cat: { agriculture: "oklch(0.66 0.13 142)", industry: "oklch(0.7 0.13 64)", services: "oklch(0.58 0.13 262)",
      hydro: "oklch(0.6 0.12 240)", solar: "oklch(0.78 0.14 84)", wind: "oklch(0.7 0.1 196)", thermal: "oklch(0.58 0.14 34)" },
  },
  ember: {
    label: "Ember",
    seq: [[0.965, 0.022, 86], [0.885, 0.066, 74], [0.79, 0.115, 56], [0.68, 0.142, 40], [0.55, 0.15, 26], [0.42, 0.12, 18]],
    div: [[0.52, 0.13, 252], [0.72, 0.08, 232], [0.94, 0.02, 96], [0.74, 0.12, 52], [0.55, 0.15, 30]],
    cat: { agriculture: "oklch(0.68 0.13 118)", industry: "oklch(0.66 0.15 42)", services: "oklch(0.55 0.13 286)",
      hydro: "oklch(0.62 0.12 232)", solar: "oklch(0.8 0.15 80)", wind: "oklch(0.72 0.1 188)", thermal: "oklch(0.55 0.16 28)" },
  },
  viridis: {
    label: "Spectral",
    seq: [[0.32, 0.09, 300], [0.45, 0.11, 286], [0.55, 0.12, 230], [0.65, 0.13, 178], [0.78, 0.16, 142], [0.9, 0.18, 116]],
    div: [[0.5, 0.15, 320], [0.68, 0.1, 300], [0.93, 0.02, 110], [0.74, 0.14, 150], [0.6, 0.16, 138]],
    cat: { agriculture: "oklch(0.75 0.16 130)", industry: "oklch(0.7 0.14 60)", services: "oklch(0.55 0.14 290)",
      hydro: "oklch(0.6 0.13 220)", solar: "oklch(0.82 0.16 96)", wind: "oklch(0.72 0.12 178)", thermal: "oklch(0.6 0.15 24)" },
  },
  mono: {
    label: "Ink",
    seq: [[0.95, 0.006, 250], [0.85, 0.012, 250], [0.72, 0.018, 252], [0.57, 0.022, 254], [0.42, 0.022, 256], [0.3, 0.018, 258]],
    div: [[0.52, 0.12, 28], [0.72, 0.06, 40], [0.93, 0.012, 250], [0.66, 0.05, 250], [0.42, 0.03, 256]],
    cat: { agriculture: "oklch(0.62 0.04 142)", industry: "oklch(0.6 0.04 64)", services: "oklch(0.5 0.04 262)",
      hydro: "oklch(0.56 0.04 240)", solar: "oklch(0.74 0.05 84)", wind: "oklch(0.66 0.03 196)", thermal: "oklch(0.5 0.05 34)" },
  },
};

// ---- formatting ----------------------------------------------------------
export function fmt(value: number, kind: FmtKind | string, locale: Lang): string {
  const L = locale === "pt-BR" ? "pt-BR" : "en-US";
  const nf = (min: number, max: number) => new Intl.NumberFormat(L, { minimumFractionDigits: min, maximumFractionDigits: max });
  switch (kind) {
    case "int": return nf(0, 0).format(Math.round(value));
    case "pct": return nf(0, 0).format(Math.round(value)) + "%";
    case "pct1": return nf(1, 1).format(value) + "%";
    case "permille": return nf(1, 1).format(value) + "‰";
    case "num1": return nf(1, 1).format(value);
    case "num2": return nf(2, 2).format(value);
    case "dens": return nf(1, 1).format(value) + " /km²";
    case "mw": return nf(0, 0).format(Math.round(value)) + " MW";
    case "money": return "R$ " + nf(0, 0).format(Math.round(value));
    case "moneyM": { // value in R$ millions → R$ X.X bi / mi
      if (value >= 1000) return "R$ " + nf(1, 1).format(value / 1000) + (locale === "pt-BR" ? " bi" : "B");
      return "R$ " + nf(0, 0).format(Math.round(value)) + (locale === "pt-BR" ? " mi" : "M");
    }
    case "beds": return nf(1, 1).format(value) + (locale === "pt-BR" ? " /100 mil" : " /100k");
    case "signed": return (value > 0 ? "+" : "") + nf(1, 1).format(value);
    default: return String(value);
  }
}

// ---- mode definitions ----------------------------------------------------
// headline: the indicator used for the big number + the choropleth variable.
// indicators[]: rows shown in the sidebar (key, prop, kind, dir [+1 good high / -1 good low / 0 neutral]).
// breakdown: optional stacked-bar parts.
export const MODES: Mode[] = [
  { key: "demographics", theme: "demographics", scale: "seq", prop: "population_density", kind: "dens", dir: 0,
    indicators: [
      { key: "population", prop: "population", kind: "int", dir: 0 },
      { key: "population_density", prop: "population_density", kind: "dens", dir: 0 },
      { key: "urbanization_rate", prop: "urbanization_rate", kind: "pct1", dir: 0 },
      { key: "literacy_rate", prop: "literacy_rate", kind: "pct1", dir: 1 },
      { key: "birth_rate", prop: "birth_rate", kind: "permille", dir: 0 },
      { key: "death_rate", prop: "death_rate", kind: "permille", dir: 0 },
      { key: "natural_growth", prop: "natural_growth", kind: "signed", dir: 0 },
    ] },
  { key: "workforce", theme: "demographics", scale: "seq", prop: "emp_services", kind: "pct1", dir: 0,
    indicators: [
      { key: "emp_services", prop: "emp_services", kind: "pct1", dir: 0 },
      { key: "emp_industry", prop: "emp_industry", kind: "pct1", dir: 0 },
      { key: "emp_agriculture", prop: "emp_agriculture", kind: "pct1", dir: 0 },
      { key: "unemployment", prop: "unemployment", kind: "pct1", dir: -1 },
    ],
    breakdown: { unit: "pct", parts: [
      { key: "sector_services", prop: "emp_services", cat: "services" },
      { key: "sector_industry", prop: "emp_industry", cat: "industry" },
      { key: "sector_agriculture", prop: "emp_agriculture", cat: "agriculture" },
    ] } },
  { key: "economy", theme: "wealth", scale: "cat", prop: "dominant_sector",
    categories: ["services", "industry", "agriculture"], headlineProp: "gdp_per_capita", headlineKind: "money",
    indicators: [
      { key: "gdp_total", prop: "gdp_total", kind: "moneyM", dir: 1 },
      { key: "gdp_per_capita", prop: "gdp_per_capita", kind: "money", dir: 1 },
      { key: "sector_services", prop: "sector_services", kind: "pct1", dir: 0 },
      { key: "sector_industry", prop: "sector_industry", kind: "pct1", dir: 0 },
      { key: "sector_agriculture", prop: "sector_agriculture", kind: "pct1", dir: 0 },
    ],
    breakdown: { unit: "pct", parts: [
      { key: "sector_services", prop: "sector_services", cat: "services" },
      { key: "sector_industry", prop: "sector_industry", cat: "industry" },
      { key: "sector_agriculture", prop: "sector_agriculture", cat: "agriculture" },
    ] } },
  { key: "fiscal", theme: "wealth", scale: "div", prop: "fiscal_autonomy_ratio", kind: "pct1", mid: 50, dir: 1,
    indicators: [
      { key: "fiscal_autonomy_ratio", prop: "fiscal_autonomy_ratio", kind: "pct1", dir: 1 },
      { key: "own_revenue", prop: "own_revenue", kind: "moneyM", dir: 1 },
      { key: "federal_transfers", prop: "federal_transfers", kind: "moneyM", dir: 0 },
      { key: "public_debt_per_capita", prop: "public_debt_per_capita", kind: "money", dir: -1 },
    ] },
  { key: "social", theme: "wealth", scale: "seq", prop: "bolsa_familia_coverage", kind: "pct1", dir: 0,
    indicators: [
      { key: "bolsa_familia_coverage", prop: "bolsa_familia_coverage", kind: "pct1", dir: 0 },
      { key: "social_beneficiaries", prop: "social_beneficiaries", kind: "pct1", dir: 0 },
      { key: "federal_servants_density", prop: "federal_servants_density", kind: "num1", dir: 0 },
    ] },
  { key: "energy", theme: "infrastructure", scale: "cat", prop: "dominant_energy",
    categories: ["hydro", "thermal", "wind", "solar"], headlineProp: "energy_capacity_mw", headlineKind: "mw",
    indicators: [
      { key: "energy_capacity_mw", prop: "energy_capacity_mw", kind: "mw", dir: 0 },
      { key: "mix_hydro", prop: "mix_hydro", kind: "pct1", dir: 0 },
      { key: "mix_thermal", prop: "mix_thermal", kind: "pct1", dir: 0 },
      { key: "mix_wind", prop: "mix_wind", kind: "pct1", dir: 0 },
      { key: "mix_solar", prop: "mix_solar", kind: "pct1", dir: 0 },
    ],
    breakdown: { unit: "pct", parts: [
      { key: "mix_hydro", prop: "mix_hydro", cat: "hydro" },
      { key: "mix_thermal", prop: "mix_thermal", cat: "thermal" },
      { key: "mix_wind", prop: "mix_wind", cat: "wind" },
      { key: "mix_solar", prop: "mix_solar", cat: "solar" },
    ] } },
  { key: "health", theme: "public_services", scale: "seq", prop: "infant_mortality_rate", kind: "permille", dir: -1, invertGood: true,
    indicators: [
      { key: "infant_mortality_rate", prop: "infant_mortality_rate", kind: "permille", dir: -1 },
      { key: "vaccination_coverage", prop: "vaccination_coverage", kind: "pct1", dir: 1 },
      { key: "hospital_beds", prop: "hospital_beds", kind: "beds", dir: 1 },
      { key: "physicians", prop: "physicians", kind: "beds", dir: 1 },
    ] },
  { key: "sol", theme: "public_services", scale: "seq", prop: "sol_index", kind: "num1", dir: 1,
    indicators: [
      { key: "sol_index", prop: "sol_index", kind: "num1", dir: 1 },
      { key: "household_income", prop: "household_income", kind: "money", dir: 1 },
      { key: "literacy_rate", prop: "literacy_rate", kind: "pct1", dir: 1 },
      { key: "infant_mortality_rate", prop: "infant_mortality_rate", kind: "permille", dir: -1 },
      { key: "hospital_beds", prop: "hospital_beds", kind: "beds", dir: 1 },
    ] },
];

export const MODE_BY_KEY: Record<string, Mode> = Object.fromEntries(MODES.map((m) => [m.key, m]));
export const THEME_ORDER = ["demographics", "wealth", "infrastructure", "public_services"];
export const paletteKeys = Object.keys(PALETTES);

// A mode is available when its choropleth variable has data in the current record set —
// categorical modes need a string at `prop`, others need a finite number. Lets the UI grey
// out modes whose source worker hasn't landed yet, instead of rendering an empty map.
export function isModeAvailable(mode: Mode, records: StateRecord[]): boolean {
  const prop = mode.prop!;
  return records.some((r) => {
    const v = r[prop];
    return mode.scale === "cat" ? typeof v === "string" : typeof v === "number" && Number.isFinite(v);
  });
}

export function availableModeKeys(records: StateRecord[]): Set<string> {
  return new Set(MODES.filter((m) => isModeAvailable(m, records)).map((m) => m.key));
}

export interface Scale {
  kind: ScaleKind;
  colorOf: (d: StateRecord) => string;
  categories?: string[];
  catColor?: (c: string) => string;
  min?: number;
  max?: number;
  mid?: number;
  rawMin?: number;
  rawMax?: number;
  sampleAt?: (v: number) => string;
}

// Build a color function for a mode given the current year's data set.
export function makeScale(mode: Mode, records: StateRecord[], paletteKey: string): Scale {
  const pal = PALETTES[paletteKey] || PALETTES.editorial;
  if (mode.scale === "cat") {
    return {
      kind: "cat",
      categories: mode.categories,
      colorOf: (d) => pal.cat[d[mode.prop!] as string] || "oklch(0.7 0 0)",
      catColor: (c) => pal.cat[c] || "oklch(0.7 0 0)",
    };
  }
  const vals = records.map((d) => d[mode.prop!]).filter((v): v is number => typeof v === "number");
  let min = Math.min(...vals), max = Math.max(...vals);
  if (mode.scale === "div") {
    const mid = mode.mid!;
    const dev = Math.max(Math.abs(max - mid), Math.abs(min - mid)) || 1;
    const lo = mid - dev, hi = mid + dev;
    return {
      kind: "div", min: lo, mid, max: hi, rawMin: min, rawMax: max,
      colorOf: (d) => sampleRamp(pal.div, ((d[mode.prop!] as number) - lo) / (hi - lo)),
      sampleAt: (v) => sampleRamp(pal.div, (v - lo) / (hi - lo)),
    };
  }
  if (min === max) max = min + 1;
  return {
    kind: "seq", min, max,
    colorOf: (d) => sampleRamp(pal.seq, ((d[mode.prop!] as number) - min) / (max - min)),
    sampleAt: (v) => sampleRamp(pal.seq, (v - min) / (max - min)),
  };
}
