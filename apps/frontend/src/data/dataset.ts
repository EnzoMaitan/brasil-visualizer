// Live data layer — the single swap point (root CLAUDE.md §10).
//
// Fetches indicator snapshots from the NestJS API and adapts the API's nested-by-theme
// shape into the flat `StateRecord` the map modes/components consume. Country, level, and
// periods are DISCOVERED from the API (`/countries`, `/:code`, `/:code/periods`) — nothing
// is hardcoded here. If the API is unreachable, it falls back to the bundled synthetic data
// so the UI still runs standalone; `BR_DATA.source` records which one is live.
//
// Geometry is intentionally NOT fetched: real borders are deferred (design reference §2),
// so the map keeps rendering the bundled IBGE outline while the live feed carries indicators.
import { BR_DATA as SYNTHETIC } from "./synthetic";
import type { StateRecord } from "./types";

const getApiBase = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, "");
  }
  // If no env var is set, default to port 3000 on the same host the page was loaded from.
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:3000`;
};

const API_BASE = getApiBase();

export type DataSource = "loading" | "live" | "synthetic";

interface ApiIndicator {
  value: number;
  unit: string;
  year: number;
  source: string;
}
interface ApiRegion {
  code: string;
  abbrev?: string;
  name?: string;
  period: string;
  indicators: Record<string, Record<string, ApiIndicator>>;
}

// year -> code -> flat record
let store: Record<number, Record<string, StateRecord>> = {};

export const BR_DATA = {
  source: "loading" as DataSource,
  years: [] as number[],
  codes: [] as string[],

  all(year: number): StateRecord[] {
    const byCode = store[year] ?? {};
    return BR_DATA.codes.map((c) => byCode[c]).filter(Boolean) as StateRecord[];
  },
  get(code: string, year: number): StateRecord | undefined {
    return store[year]?.[code];
  },
  // Values aligned to BR_DATA.years (drops years where the prop is absent).
  series(code: string, prop: string): number[] {
    return BR_DATA.years
      .map((y) => store[y]?.[code]?.[prop])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  },
};

// ---- API → StateRecord adapter ------------------------------------------
function num(ind?: ApiIndicator): number | undefined {
  return ind && typeof ind.value === "number" && Number.isFinite(ind.value) ? ind.value : undefined;
}

function adapt(region: ApiRegion, year: number): StateRecord {
  const I = region.indicators ?? {};
  const dem = I.demographics ?? {};
  const wea = I.wealth ?? {};
  const pub = I.public_services ?? {};
  const rec: StateRecord = { code: region.code, year };
  const set = (key: string, value?: number) => {
    if (value != null) rec[key] = value;
  };

  // Demographics — keys line up directly.
  set("population", num(dem.population));
  set("population_density", num(dem.population_density));
  set("urbanization_rate", num(dem.urbanization_rate));
  set("literacy_rate", num(dem.literacy_rate));
  set("birth_rate", num(dem.birth_rate));

  // Wealth — reconcile vocabulary + units to what the modes expect.
  const gdp = num(wea.gdp_total); // R$ absolute
  set("gdp_total", gdp != null ? gdp / 1e6 : undefined); // → R$ millions (fmt kind "moneyM")
  set("gdp_per_capita", num(wea.pib_per_capita)); // worker key is pib_per_capita
  const agro = num(wea.gdp_share_agriculture);
  const ind = num(wea.gdp_share_industry);
  const serv = num(wea.gdp_share_services);
  set("sector_agriculture", agro);
  set("sector_industry", ind);
  set("sector_services", serv);
  if (agro != null && ind != null && serv != null) {
    rec.dominant_sector = serv >= ind && serv >= agro ? "services" : ind >= agro ? "industry" : "agriculture";
  }
  set("gini_coefficient", num(wea.gini_coefficient));
  // Wealth — fiscal (SICONFI). own_revenue/federal_transfers are R$ → millions (moneyM).
  set("fiscal_autonomy_ratio", num(wea.fiscal_autonomy_ratio));
  const own = num(wea.own_revenue);
  set("own_revenue", own != null ? own / 1e6 : undefined);
  const fed = num(wea.federal_transfers);
  set("federal_transfers", fed != null ? fed / 1e6 : undefined);

  // Infrastructure — energy (ANEEL). Rename energy_mix_* → mix_*, derive dominant_energy.
  const inf = I.infrastructure ?? {};
  set("energy_capacity_mw", num(inf.energy_capacity_mw));
  const hydro = num(inf.energy_mix_hydro);
  const solar = num(inf.energy_mix_solar);
  const wind = num(inf.energy_mix_wind);
  const thermal = num(inf.energy_mix_thermal);
  set("mix_hydro", hydro);
  set("mix_solar", solar);
  set("mix_wind", wind);
  set("mix_thermal", thermal);
  if (hydro != null && solar != null && wind != null && thermal != null) {
    const mix: Array<[string, number]> = [["hydro", hydro], ["thermal", thermal], ["wind", wind], ["solar", solar]];
    rec.dominant_energy = mix.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }

  // Public services — no current map mode consumes these yet, but carry them through.
  set("water_supply_rate", num(pub.water_supply_rate));
  set("sewage_adequate_rate", num(pub.sewage_adequate_rate));
  set("garbage_collection_rate", num(pub.garbage_collection_rate));

  return rec;
}

// ---- Loading ------------------------------------------------------------
async function getJson(path: string): Promise<unknown> {
  const res = await fetch(API_BASE + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function useSynthetic(): void {
  store = {};
  BR_DATA.years = SYNTHETIC.years.slice();
  BR_DATA.codes = SYNTHETIC.codes.slice();
  for (const y of BR_DATA.years) {
    store[y] = {};
    for (const c of BR_DATA.codes) store[y][c] = SYNTHETIC.get(c, y);
  }
  BR_DATA.source = "synthetic";
}

/**
 * Load the dataset once. Resolves to the source actually used. Never rejects — on any
 * failure it falls back to bundled synthetic data so the app stays usable offline.
 */
export async function loadData(): Promise<DataSource> {
  try {
    const countries = (await getJson(`/countries`)) as Array<{ country_code: string }>;
    const code = countries?.[0]?.country_code;
    if (!code) throw new Error("registry is empty");

    const country = (await getJson(`/countries/${code}`)) as { levels?: string[] };
    const level = country.levels?.[0] ?? "UF";

    const periods = (await getJson(`/countries/${code}/periods?level=${level}`)) as string[];
    if (!periods.length) throw new Error("no periods available");

    const nextStore: Record<number, Record<string, StateRecord>> = {};
    const years: number[] = [];
    for (const period of periods) {
      const year = parseInt(period.slice(0, 4), 10);
      const regions = (await getJson(
        `/countries/${code}/regions?level=${level}&period=${encodeURIComponent(period)}`,
      )) as ApiRegion[];
      nextStore[year] = {};
      for (const region of regions) nextStore[year][region.code] = adapt(region, year);
      years.push(year);
    }
    years.sort((a, b) => a - b);

    store = nextStore;
    BR_DATA.years = years;
    BR_DATA.codes = Object.keys(nextStore[years[years.length - 1]] ?? {});
    BR_DATA.source = "live";
  } catch (err) {
    console.warn("[data] live API unavailable — falling back to synthetic data:", err);
    useSynthetic();
  }
  return BR_DATA.source;
}
