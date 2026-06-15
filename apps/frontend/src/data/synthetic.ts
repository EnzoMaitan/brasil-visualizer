// Synthetic, clearly-illustrative indicator data for the 27 UFs.
// IMPORTANT: these values are placeholders. They are seeded + region-biased so the
// choropleths resemble Brazil's real regional patterns, but no real API is wired up.
// Geometry (borders) is real IBGE data; everything numeric here is fabricated.
//
// When the scraper pipeline lands, replace this module's exported `BR_DATA` with a
// live feed from the NestJS /countries API — the rest of the app stays as-is.
import { BR_STATES_META } from "./states-meta";
import type { StateRecord } from "./types";

const META = BR_STATES_META;
const YEARS = [2010, 2016, 2022];

// deterministic RNG (mulberry32)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type RegionMap = Record<number, number>;
// region bases (1 South, 2 Southeast, 3 North, 4 Northeast, 5 Center-West)
const B: Record<string, RegionMap> = {
  density: { 1: 55, 2: 120, 3: 5, 4: 38, 5: 10 },
  income: { 1: 2100, 2: 2300, 3: 1300, 4: 1150, 5: 2000 },
  literacy: { 1: 96, 2: 95, 3: 90, 4: 84, 5: 93 },
  urban: { 1: 86, 2: 93, 3: 76, 4: 74, 5: 89 },
  birth: { 1: 12, 2: 13, 3: 19, 4: 17, 5: 15 },
  death: { 1: 7, 2: 6.5, 3: 5.5, 4: 6, 5: 6 },
  gdppc: { 1: 38000, 2: 42000, 3: 24000, 4: 20000, 5: 40000 },
  autonomy: { 1: 58, 2: 66, 3: 22, 4: 30, 5: 48 },
  debt: { 1: 2200, 2: 4200, 3: 1500, 4: 1700, 5: 2500 },
  capacity: { 1: 9000, 2: 16000, 3: 11000, 4: 14000, 5: 7000 },
  infant: { 1: 10, 2: 11, 3: 17, 4: 16, 5: 12 },
  vacc: { 1: 88, 2: 86, 3: 75, 4: 78, 5: 84 },
  beds: { 1: 270, 2: 300, 3: 170, 4: 190, 5: 240 },
  phys: { 1: 200, 2: 260, 3: 110, 4: 130, 5: 210 },
  bolsa: { 1: 11, 2: 13, 3: 26, 4: 30, 5: 15 },
  servants: { 1: 6, 2: 7, 3: 9, 4: 8, 5: 9 },
  unemp: { 1: 7, 2: 9, 3: 11, 4: 13, 5: 8 },
  empAgri: { 1: 9, 2: 5, 3: 14, 4: 13, 5: 15 },
  empInd: { 1: 25, 2: 22, 3: 18, 4: 16, 5: 18 },
};
// per-state multipliers / overrides for iconic outliers
const urbanBoost: Record<string, number> = { "53": 6.0, "33": 3.2, "35": 1.7, "32": 1.2, "23": 1.15, "25": 1.1, "26": 1.1, "28": 1.05 };
const incomeBoost: Record<string, number> = { "53": 1.55, "35": 1.18, "33": 1.12, "32": 1.05 };
const gdpBoost: Record<string, number> = { "53": 2.1, "35": 1.22, "33": 1.1 };
const autonomyOver: Record<string, number> = { "53": 62, "35": 78, "33": 60, "31": 58, "41": 60, "43": 56 };
const debtOver: Record<string, number> = { "33": 6000, "31": 4800, "43": 4200 };
const physOver: Record<string, number> = { "53": 360, "33": 380, "35": 285, "31": 250 };
const servantsOver: Record<string, number> = { "53": 62 };
// GDP sector profiles [agri, ind, services]; only outliers overridden, rest region base
const sectorRegion: Record<number, number[]> = { 1: [10, 30, 60], 2: [4, 28, 68], 3: [10, 30, 60], 4: [8, 22, 70], 5: [30, 22, 48] };
const sectorOver: Record<string, number[]> = {
  "51": [46, 18, 36], "50": [42, 20, 38], "11": [42, 20, 38], "29": [9, 22, 69],
  "13": [5, 48, 47], "32": [8, 44, 48], "42": [9, 43, 48], "35": [2, 36, 62],
  "52": [30, 22, 48], "17": [34, 22, 44],
};
// energy mix [hydro, solar, wind, thermal]
const energyRegion: Record<number, number[]> = { 1: [55, 5, 8, 32], 2: [62, 8, 4, 26], 3: [68, 4, 2, 26], 4: [30, 18, 40, 12], 5: [70, 8, 4, 18] };
const energyOver: Record<string, number[]> = {
  "13": [8, 4, 3, 85], "14": [10, 5, 3, 82], "16": [55, 6, 3, 36],
  "24": [8, 16, 64, 12], "23": [10, 18, 60, 12], "29": [34, 16, 42, 8], "25": [6, 14, 68, 12],
  "22": [20, 52, 20, 8], "42": [40, 5, 6, 49], "41": [78, 4, 4, 14], "15": [80, 3, 2, 15],
  "17": [82, 4, 2, 12], "31": [68, 10, 3, 19], "35": [58, 9, 3, 30], "33": [40, 6, 2, 52],
  "43": [44, 8, 16, 32],
};
const capacityOver: Record<string, number> = { "15": 22000, "41": 21000, "35": 19000, "29": 16500, "31": 17000 };

function dominant(parts: number[], keys: string[]): string {
  let bi = 0;
  for (let i = 1; i < parts.length; i++) if (parts[i] > parts[bi]) bi = i;
  return keys[bi];
}
function norm3(arr: number[]): number[] {
  const s = arr[0] + arr[1] + arr[2];
  return arr.map((x) => (x / s) * 100);
}
function norm4(arr: number[]): number[] {
  const s = arr.reduce((a, b) => a + b, 0);
  return arr.map((x) => (x / s) * 100);
}

interface Offsets {
  [key: string]: number | number[];
  sectorJ: number[];
  energyJ: number[];
  empJ: number[];
}

// Build a fixed per-state offset bundle (so trends across years are clean).
function offsets(code: string): Offsets {
  const r = rng(hash("st" + code));
  const o: Record<string, number | number[]> = {};
  const j = (k: string, frac: number) => { o[k] = 1 + (r() * 2 - 1) * frac; };
  const a = (k: string, amt: number) => { o[k] = (r() * 2 - 1) * amt; };
  j("density", 0.28); j("income", 0.12); a("literacy", 1.8); a("urban", 3.5);
  a("birth", 1.6); a("death", 0.8); j("gdppc", 0.14); a("autonomy", 6);
  j("debt", 0.25); j("capacity", 0.3); a("infant", 2.2); a("vacc", 4);
  j("beds", 0.18); j("phys", 0.18); a("bolsa", 3); a("unemp", 1.8); j("servants", 0.2);
  o.sectorJ = [(r() * 2 - 1) * 5, (r() * 2 - 1) * 5, (r() * 2 - 1) * 5];
  o.energyJ = [(r() * 2 - 1) * 4, (r() * 2 - 1) * 4, (r() * 2 - 1) * 4, (r() * 2 - 1) * 4];
  o.empJ = [(r() * 2 - 1) * 4, (r() * 2 - 1) * 4];
  return o as Offsets;
}

function build(code: string, yi: number): StateRecord {
  const m = META[code];
  const reg = m.region;
  const o = offsets(code);
  const num = (k: string) => o[k] as number;
  const arr = (k: string) => o[k] as number[];
  const n = YEARS.length - 1;
  const p = yi / n; // 0..1 across years

  const density = clamp(B.density[reg] * (urbanBoost[code] || 1) * num("density") * (1 + 0.04 * p), 0.5, 1200);
  const population = Math.round(density * m.area_km2);
  const literacy = clamp(B.literacy[reg] + num("literacy") + 2.2 * p, 60, 99.2);
  const urban = clamp(B.urban[reg] + num("urban") + 2.0 * p, 50, 99.5);
  const birth = clamp(B.birth[reg] + num("birth") - 2.2 * p, 8, 26);
  const death = clamp(B.death[reg] + num("death") + 0.4 * p, 4, 11);
  const income = Math.round(B.income[reg] * (incomeBoost[code] || 1) * num("income") * (1 + 0.16 * p));
  const gdppc = Math.round(B.gdppc[reg] * (gdpBoost[code] || 1) * num("gdppc") * (1 + 0.13 * p));
  const gdpTotal = (gdppc * population) / 1e6; // R$ millions

  const sectorJ = arr("sectorJ");
  const sectors = norm3((sectorOver[code] || sectorRegion[reg]).map((v, i) => Math.max(1, v + sectorJ[i])));
  const dominant_sector = dominant(sectors, ["agriculture", "industry", "services"]);

  const empJ = arr("empJ");
  const empBase = [B.empAgri[reg] + empJ[0], B.empInd[reg] + empJ[1]];
  const empAgri = clamp(empBase[0] - 3 * p, 2, 40);
  const empInd = clamp(empBase[1], 8, 40);
  const empServ = clamp(100 - empAgri - empInd, 30, 88);
  const unemployment = clamp(B.unemp[reg] + num("unemp") + (yi === 1 ? 2.5 : 0) - 0.5 * p, 4, 20);

  const autonomy = clamp((autonomyOver[code] != null ? autonomyOver[code] : B.autonomy[reg]) + num("autonomy") + 2 * p, 8, 88);
  const totalRev = gdpTotal * 0.12;
  const ownRev = (totalRev * autonomy) / 100;
  const transfers = totalRev - ownRev;
  const debt = Math.round((debtOver[code] || B.debt[reg]) * num("debt") * (1 + 0.05 * p));

  const energyJ = arr("energyJ");
  const mix = norm4((energyOver[code] || energyRegion[reg]).map((v, i) => Math.max(0.5, v + energyJ[i])));
  const dominant_energy = dominant(mix, ["hydro", "solar", "wind", "thermal"]);
  const capacity = Math.round((capacityOver[code] || B.capacity[reg]) * num("capacity") * (1 + 0.09 * p));

  const infant = clamp(B.infant[reg] + num("infant") - 2.4 * p, 6, 28);
  const vacc = clamp(B.vacc[reg] + num("vacc") + 1.2 * p, 55, 98);
  const beds = clamp(B.beds[reg] * num("beds") + 8 * p, 110, 360);
  const phys = clamp((physOver[code] || B.phys[reg]) * num("phys") + 12 * p, 70, 420);
  const bolsa = clamp(B.bolsa[reg] + num("bolsa") - 1.0 * p, 4, 38);
  const beneficiaries = clamp(bolsa + 5 + num("bolsa") * 0.4, 6, 46);
  const servants = clamp((servantsOver[code] || B.servants[reg]) * num("servants"), 3, 90);

  // composite standard-of-living index 0..100
  const nLit = (literacy - 70) / 29, nInc = (income - 900) / 2600, nImr = (20 - infant) / 14,
    nVac = (vacc - 65) / 33, nBed = (beds - 140) / 190;
  const sol = clamp(((nLit + nInc + nImr + nVac + nBed) / 5) * 100, 5, 99);

  return {
    code,
    year: YEARS[yi],
    population, population_density: density, literacy_rate: literacy, urbanization_rate: urban,
    birth_rate: birth, death_rate: death, natural_growth: birth - death,
    household_income: income, gdp_per_capita: gdppc, gdp_total: gdpTotal,
    sector_agriculture: sectors[0], sector_industry: sectors[1], sector_services: sectors[2], dominant_sector,
    emp_agriculture: empAgri, emp_industry: empInd, emp_services: empServ, unemployment,
    fiscal_autonomy_ratio: autonomy, own_revenue: ownRev, federal_transfers: transfers, public_debt_per_capita: debt,
    mix_hydro: mix[0], mix_solar: mix[1], mix_wind: mix[2], mix_thermal: mix[3], dominant_energy, energy_capacity_mw: capacity,
    infant_mortality_rate: infant, vaccination_coverage: vacc, hospital_beds: beds, physicians: phys,
    bolsa_familia_coverage: bolsa, social_beneficiaries: beneficiaries, federal_servants_density: servants,
    sol_index: sol,
  };
}

const codes = Object.keys(META);
const store: Record<number, Record<string, StateRecord>> = {}; // year -> { code -> record }
YEARS.forEach((y, yi) => {
  store[y] = {};
  codes.forEach((c) => {
    store[y][c] = build(c, yi);
  });
});

export const BR_DATA = {
  years: YEARS,
  codes,
  get: (code: string, year: number): StateRecord => store[year][code],
  all: (year: number): StateRecord[] => codes.map((c) => store[year][c]),
  series: (code: string, prop: string): number[] => YEARS.map((y) => store[y][code][prop] as number),
};
